import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    WidgetType,
    keymap,
} from '@codemirror/view'
import { StateField, StateEffect, Prec, Annotation, TransactionSpec, Transaction } from '@codemirror/state'
import { store } from '../../app/store'
import {
    extractInlineCompletionContext,
    inlineCompletionService,
    isInlineCompletionEnabled,
    normalizeInlineCompletionOptions,
    InlineCompletionMode,
} from '../ai/inlineCompletion'
import { bindViewFilePath } from '../ai/agenticCompletion'

export { bindViewFilePath }

type GhostState =
    | { kind: 'idle' }
    | { kind: 'loading'; pos: number }
    | { kind: 'suggestion'; text: string; pos: number }

export const setGhostTextEffect = StateEffect.define<{
    text: string
    pos: number
} | null>()

export const setGhostLoadingEffect = StateEffect.define<{ pos: number } | null>()
export const acceptGhostTextEffect = StateEffect.define<void>()
export const dismissGhostTextEffect = StateEffect.define<void>()

const ghostInternalAnnotation = Annotation.define<boolean>()

class GhostLoadingWidget extends WidgetType {
    toDOM() {
        const el = document.createElement('span')
        el.className = 'cm-ghost-text cm-ghost-text--loading'
        el.textContent = ' completing…'
        return el
    }
    ignoreEvent() {
        return true
    }
}

class GhostTextWidget extends WidgetType {
    constructor(readonly text: string) {
        super()
    }

    eq(other: GhostTextWidget) {
        return other.text === this.text
    }

    toDOM() {
        const wrap = document.createElement('span')
        wrap.className = 'cm-ghost-text'
        wrap.setAttribute('aria-hidden', 'true')

        const hint = document.createElement('span')
        hint.className = 'cm-ghost-text__hint'
        hint.textContent = 'Tab'

        const text = document.createElement('span')
        text.className = 'cm-ghost-text__content'
        text.textContent = this.text

        wrap.appendChild(text)
        wrap.appendChild(hint)
        return wrap
    }

    ignoreEvent() {
        return true
    }
}

function isUserDocChange(tr: Transaction): boolean {
    return (
        tr.docChanged &&
        (tr.isUserEvent('input') ||
            tr.isUserEvent('delete') ||
            tr.isUserEvent('input.type') ||
            tr.isUserEvent('input.paste') ||
            tr.isUserEvent('undo') ||
            tr.isUserEvent('redo') ||
            tr.isUserEvent('cut'))
    )
}

const ghostTextField = StateField.define<GhostState>({
    create() {
        return { kind: 'idle' }
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setGhostTextEffect)) {
                if (!effect.value?.text) return { kind: 'idle' }
                return {
                    kind: 'suggestion',
                    text: effect.value.text,
                    pos: effect.value.pos,
                }
            }
            if (effect.is(setGhostLoadingEffect)) {
                if (!effect.value) return { kind: 'idle' }
                return { kind: 'loading', pos: effect.value.pos }
            }
            if (effect.is(acceptGhostTextEffect)) return { kind: 'idle' }
            if (effect.is(dismissGhostTextEffect)) return { kind: 'idle' }
        }
        // Only clear on user edits — NOT on LSP/lint/sync updates
        if (isUserDocChange(tr)) {
            return { kind: 'idle' }
        }
        return value
    },
    provide: f =>
        EditorView.decorations.from(f, value => {
            if (value.kind === 'loading') {
                return Decoration.set([
                    Decoration.widget({
                        widget: new GhostLoadingWidget(),
                        side: 1,
                    }).range(value.pos),
                ])
            }
            if (value.kind === 'suggestion' && value.text) {
                return Decoration.set([
                    Decoration.widget({
                        widget: new GhostTextWidget(value.text),
                        side: 1,
                    }).range(value.pos),
                ])
            }
            return Decoration.none
        }),
})

let viewRequestCounter = 0
const viewRequests = new WeakMap<EditorView, { token: number; key: string }>()

function getViewRequestKey(view: EditorView) {
    const existing = viewRequests.get(view)
    if (existing) return existing.key
    const key = `view-${++viewRequestCounter}`
    viewRequests.set(view, { token: 0, key })
    return key
}

function nextViewRequest(view: EditorView) {
    const key = getViewRequestKey(view)
    const current = viewRequests.get(view)?.token ?? 0
    const token = current + 1
    viewRequests.set(view, { key, token })
    return { key, token }
}

function cancelViewRequest(view: EditorView) {
    const current = viewRequests.get(view)
    if (current) {
        viewRequests.set(view, { ...current, token: current.token + 1 })
        inlineCompletionService.cancel(current.key)
    }
}

function safeDispatch(view: EditorView, spec: TransactionSpec) {
    if (!view.dom.isConnected) return
    const selection = view.state.selection.main
    const effects = Array.isArray(spec.effects)
        ? spec.effects
        : spec.effects
        ? [spec.effects]
        : []
    const hasInvalidGhostPosition = effects.some((effect: any) => {
        if (effect.is?.(setGhostTextEffect) || effect.is?.(setGhostLoadingEffect)) {
            const pos = effect.value?.pos
            return typeof pos === 'number' && pos > view.state.doc.length
        }
        return false
    })
    if (hasInvalidGhostPosition || selection.head > view.state.doc.length) return
    try {
        view.dispatch({
            ...spec,
            annotations: [
                ...(spec.annotations
                    ? Array.isArray(spec.annotations)
                        ? spec.annotations
                        : [spec.annotations]
                    : []),
                ghostInternalAnnotation.of(true),
            ],
        })
    } catch (e) {
        if (process.env.NODE_ENV === 'development') {
            console.warn('[ghostText] dispatch failed', e)
        }
    }
}

function deferGhostDismiss(view: EditorView) {
    queueMicrotask(() => {
        if (!view.dom.isConnected) return
        const state = view.state.field(ghostTextField, false)
        if (state && state.kind !== 'idle') {
            safeDispatch(view, { effects: dismissGhostTextEffect.of() })
        }
    })
}

async function runInlineCompletion(view: EditorView, force = false) {
    const settings = store.getState().settingsState.settings
    if (!isInlineCompletionEnabled(settings)) return
    if (view.state.readOnly) return

    const mode: InlineCompletionMode = force ? 'agentic' : 'fast'
    const ctx = extractInlineCompletionContext(view, undefined, mode)
    if (!ctx) {
        cancelViewRequest(view)
        safeDispatch(view, { effects: dismissGhostTextEffect.of() })
        return
    }

    if (
        !force &&
        ctx.prefix.trim().length < 1 &&
        ctx.suffix.trim().length < 1
    ) {
        return
    }

    const { key, token } = nextViewRequest(view)
    inlineCompletionService.cancel(key)

    const pos = view.state.selection.main.head
    safeDispatch(view, { effects: setGhostLoadingEffect.of({ pos }) })

    let lastDispatched = ''

    try {
        for await (const partial of inlineCompletionService.stream(
            view,
            ctx,
            undefined,
            mode,
            key
        )) {
            if (token !== viewRequests.get(view)?.token) break
            if (view.state.selection.main.head !== pos) break
            if (!partial || partial === lastDispatched) continue

            lastDispatched = partial
            safeDispatch(view, {
                effects: setGhostTextEffect.of({ text: partial, pos }),
            })
        }

        if (token === viewRequests.get(view)?.token && !lastDispatched) {
            safeDispatch(view, { effects: dismissGhostTextEffect.of() })
        }
    } catch {
        if (token === viewRequests.get(view)?.token) {
            safeDispatch(view, { effects: dismissGhostTextEffect.of() })
        }
    }
}

function scheduleCompletion(view: EditorView, delayMs: number) {
    view.plugin(ghostTextSchedulerPlugin)?.schedule(view, delayMs)
}

const ghostTextSchedulerPlugin = ViewPlugin.fromClass(
    class {
        private timer: ReturnType<typeof setTimeout> | null = null

        schedule(view: EditorView, delayMs: number) {
            if (this.timer) clearTimeout(this.timer)
            this.timer = setTimeout(() => {
                this.timer = null
                void runInlineCompletion(view)
            }, delayMs)
        }

        cancel() {
            if (this.timer) {
                clearTimeout(this.timer)
                this.timer = null
            }
        }

        destroy() {
            this.cancel()
        }
    }
)

const ghostTextTriggerPlugin = ViewPlugin.fromClass(
    class {
        update(update: ViewUpdate) {
            const fromGhostAccept = update.transactions.some(tr =>
                tr.effects.some(e => e.is(acceptGhostTextEffect))
            )

            if (update.selectionSet && !update.docChanged) {
                cancelViewRequest(update.view)
                deferGhostDismiss(update.view)
                return
            }

            if (!update.docChanged || fromGhostAccept) return

            cancelViewRequest(update.view)

            const settings = store.getState().settingsState.settings
            if (!isInlineCompletionEnabled(settings)) return

            const { delayMs } = normalizeInlineCompletionOptions(settings)
            scheduleCompletion(update.view, delayMs)
        }

        destroy() {
            // Individual view requests are cancelled by doc/selection changes and unmount cleanup.
        }
    }
)

export function triggerInlineCompletion(view: EditorView) {
    cancelViewRequest(view)
    safeDispatch(view, { effects: dismissGhostTextEffect.of() })
    void runInlineCompletion(view, true)
}

const ghostTextKeymap = keymap.of([
    {
        key: 'Tab',
        run: view => {
            const ghost = view.state.field(ghostTextField, false)
            if (ghost?.kind !== 'suggestion' || !ghost.text) return false
            view.dispatch({
                changes: { from: ghost.pos, insert: ghost.text },
                effects: acceptGhostTextEffect.of(),
                selection: { anchor: ghost.pos + ghost.text.length },
                userEvent: 'input.complete',
            })
            cancelViewRequest(view)
            return true
        },
    },
    {
        key: 'Escape',
        run: view => {
            const ghost = view.state.field(ghostTextField, false)
            if (!ghost || ghost.kind === 'idle') return false
            cancelViewRequest(view)
            view.dispatch({ effects: dismissGhostTextEffect.of() })
            return true
        },
    },
    {
        key: 'Mod-Shift-Space',
        run: view => {
            triggerInlineCompletion(view)
            return true
        },
    },
    {
        key: 'Alt-\\',
        run: view => {
            triggerInlineCompletion(view)
            return true
        },
    },
])

export const ghostTextExtension = [
    ghostTextField,
    ghostTextSchedulerPlugin,
    ghostTextTriggerPlugin,
    Prec.highest(ghostTextKeymap),
]

export function hasGhostText(state: import('@codemirror/state').EditorState): boolean {
    const g = state.field(ghostTextField, false)
    return g?.kind === 'suggestion' && !!g.text
}
