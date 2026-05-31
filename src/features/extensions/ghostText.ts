import {
    EditorView,
    ViewPlugin,
    ViewUpdate,
    Decoration,
    WidgetType,
    keymap,
} from '@codemirror/view'
import { StateField, StateEffect, Prec } from '@codemirror/state'
import { store } from '../../app/store'
import {
    extractInlineCompletionContext,
    inlineCompletionService,
    isInlineCompletionEnabled,
    getActiveFilePath,
} from '../ai/inlineCompletion'

// --- State & Effects ---
export const setGhostTextEffect = StateEffect.define<{
    text: string
    pos: number
} | null>()

export const acceptGhostTextEffect = StateEffect.define<void>()
export const dismissGhostTextEffect = StateEffect.define<void>()

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

const ghostTextField = StateField.define<{ text: string; pos: number } | null>({
    create() {
        return null
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setGhostTextEffect)) return effect.value
            if (effect.is(acceptGhostTextEffect)) return null
            if (effect.is(dismissGhostTextEffect)) return null
        }
        // Only clear on document edits — tr.selection is always truthy (SelectionSet object)
        if (tr.docChanged) {
            return null
        }
        return value
    },
    provide: f =>
        EditorView.decorations.from(f, value => {
            if (!value?.text) return Decoration.none
            return Decoration.set([
                Decoration.widget({
                    widget: new GhostTextWidget(value.text),
                    side: 1,
                }).range(value.pos),
            ])
        }),
})

let activeFetchToken = 0

async function runInlineCompletion(view: EditorView, force = false) {
    const settings = store.getState().settingsState.settings
    if (!isInlineCompletionEnabled(settings)) return

    if (view.state.readOnly) return

    const ctx = extractInlineCompletionContext(view, getActiveFilePath())
    if (!ctx) {
        inlineCompletionService.cancel()
        view.dispatch({ effects: dismissGhostTextEffect.of() })
        return
    }

    if (!force && ctx.prefix.trim().length < 2 && ctx.suffix.trim().length < 2) {
        return
    }

    const token = ++activeFetchToken
    inlineCompletionService.cancel()

    const pos = view.state.selection.main.head
    let lastDispatched = ''

    try {
        for await (const partial of inlineCompletionService.stream(ctx)) {
            if (token !== activeFetchToken) break
            if (view.state.selection.main.head !== pos) break
            if (!partial || partial === lastDispatched) continue

            lastDispatched = partial
            view.dispatch({
                effects: setGhostTextEffect.of({ text: partial, pos }),
            })
        }
    } catch {
        if (token === activeFetchToken) {
            view.dispatch({ effects: dismissGhostTextEffect.of() })
        }
    }
}

function scheduleCompletion(view: EditorView, delayMs: number) {
    const plugin = view.plugin(ghostTextSchedulerPlugin)
    plugin?.schedule(view, delayMs)
}

// Debounced scheduler attached to the view
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
                update.view.dispatch({ effects: dismissGhostTextEffect.of() })
                return
            }

            if (!update.docChanged || fromGhostAccept) return

            inlineCompletionService.cancel()
            update.view.dispatch({ effects: dismissGhostTextEffect.of() })

            const settings = store.getState().settingsState.settings
            if (!isInlineCompletionEnabled(settings)) return

            const delay = Number(settings.inlineCompletionDelay ?? 400)
            scheduleCompletion(update.view, delay)
        }

        destroy() {
            inlineCompletionService.cancel()
        }
    }
)

export function triggerInlineCompletion(view: EditorView) {
    inlineCompletionService.cancel()
    view.dispatch({ effects: dismissGhostTextEffect.of() })
    void runInlineCompletion(view, true)
}

const ghostTextKeymap = keymap.of([
    {
        key: 'Tab',
        run: view => {
            const ghostText = view.state.field(ghostTextField, false)
            if (!ghostText?.text) return false
            view.dispatch({
                changes: { from: ghostText.pos, insert: ghostText.text },
                effects: acceptGhostTextEffect.of(),
                selection: { anchor: ghostText.pos + ghostText.text.length },
                userEvent: 'input.complete',
            })
            inlineCompletionService.cancel()
            return true
        },
    },
    {
        key: 'Escape',
        run: view => {
            const ghostText = view.state.field(ghostTextField, false)
            if (!ghostText) return false
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
])

export const ghostTextExtension = [
    ghostTextField,
    ghostTextSchedulerPlugin,
    ghostTextTriggerPlugin,
    Prec.highest(ghostTextKeymap),
]

export function hasGhostText(state: import('@codemirror/state').EditorState): boolean {
    return !!state.field(ghostTextField, false)?.text
}
