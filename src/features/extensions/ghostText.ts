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

let activeFetchToken = 0

function safeDispatch(view: EditorView, spec: TransactionSpec) {
    requestAnimationFrame(() => {
        if (!view.dom.isConnected) return
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
    })
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

    const ctx = extractInlineCompletionContext(view)
    if (!ctx) {
        inlineCompletionService.cancel()
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

    const token = ++activeFetchToken
    inlineCompletionService.cancel()

    const pos = view.state.selection.main.head
    safeDispatch(view, { effects: setGhostLoadingEffect.of({ pos }) })

    let lastDispatched = ''

    try {
        for await (const partial of inlineCompletionService.stream(view, ctx)) {
            if (token !== activeFetchToken) break
            if (view.state.selection.main.head !== pos) break
            if (!partial || partial === lastDispatched) continue

            lastDispatched = partial
            safeDispatch(view, {
                effects: setGhostTextEffect.of({ text: partial, pos }),
            })
        }

        if (token === activeFetchToken && !lastDispatched) {
            safeDispatch(view, { effects: dismissGhostTextEffect.of() })
        }
    } catch {
        if (token === activeFetchToken) {
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
                inlineCompletionService.cancel()
                deferGhostDismiss(update.view)
                return
            }

            if (!update.docChanged || fromGhostAccept) return

            inlineCompletionService.cancel()

            const settings = store.getState().settingsState.settings
            if (!isInlineCompletionEnabled(settings)) return

            const delay = Number(settings.inlineCompletionDelay ?? 350)
            scheduleCompletion(update.view, delay)
        }

        destroy() {
            inlineCompletionService.cancel()
        }
    }
)

export function triggerInlineCompletion(view: EditorView) {
    inlineCompletionService.cancel()
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
            inlineCompletionService.cancel()
            return true
        },
    },
    {
        key: 'Escape',
        run: view => {
            const ghost = view.state.field(ghostTextField, false)
            if (!ghost || ghost.kind === 'idle') return false
            inlineCompletionService.cancel()
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
