/**
 * Agentic context builder for inline code completion.
 * Pulls live editor state, diagnostics, and structural hints.
 */
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { SyntaxNode } from '@lezer/common'
import { store } from '../../app/store'
import { FullState } from '../window/state'
import { getCodeMirrorView } from '../codemirror/codemirrorSlice'
import { getLanguageFromFilename } from '../extensions/utils'
import { lintState, getDiagnostics, Diagnostic } from '../linter/lint'
import { InlineCompletionContext } from './inlineCompletion'

export interface AgenticCompletionContext extends InlineCompletionContext {
    lineNumber: number
    enclosingScope: string | null
    nearbyDiagnostics: string[]
    relatedSnippets: string[]
}

const viewFilePaths = new WeakMap<EditorView, string>()

export function bindViewFilePath(view: EditorView, filePath: string) {
    viewFilePaths.set(view, filePath)
}

export function getViewFilePath(view: EditorView): string {
    return viewFilePaths.get(view) || 'untitled'
}

function getEnclosingScope(view: EditorView, pos: number): string | null {
    try {
        const tree = syntaxTree(view.state)
        let node: SyntaxNode | null = tree.resolveInner(pos, -1)
        while (node) {
            const name = node.name
            if (
                /Function|Method|Class|Interface|Struct|Impl|Module|Namespace|TypeAlias/.test(
                    name
                )
            ) {
                const text = view.state.doc.sliceString(node.from, node.to)
                const header = text.split('\n').slice(0, 3).join('\n')
                return header.length > 400 ? header.slice(0, 400) + '…' : header
            }
            node = node.parent
        }
    } catch {
        // syntax tree unavailable
    }
    return null
}

function getNearbyDiagnostics(
    view: EditorView,
    lineNumber: number
): string[] {
    const ls = view.state.field(lintState, false)
    if (!ls) return []
    const diags = getDiagnostics(ls, view.state).filter(
        d => d.severity === 'error' || d.severity === 'warning'
    )
    return diags
        .filter(d => Math.abs(d.line - lineNumber) <= 8)
        .slice(0, 8)
        .map(
            d =>
                `L${d.line}:${d.col} [${d.severity}] ${d.message}${
                    d.source ? ` (${d.source})` : ''
                }`
        )
}

function getRelatedOpenFileSnippets(
    state: FullState,
    activePath: string,
    language: string
): string[] {
    const snippets: string[] = []
    const global = state.global
    const seen = new Set<string>()

    for (const tabIdStr of Object.keys(global.tabs)) {
        if (snippets.length >= 2) break
        const tab = global.tabs[parseInt(tabIdStr, 10)]
        if (!tab || tab.isChat) continue
        const path = global.files[tab.fileId]?.path
        if (!path || path === activePath || seen.has(path)) continue
        if (getLanguageFromFilename(path) !== language) continue

        seen.add(path)
        const viewId = state.codeMirrorState.editorMap[parseInt(tabIdStr, 10)]
        let content = ''
        if (viewId) {
            const view = getCodeMirrorView(viewId)
            if (view) content = view.state.doc.toString()
        }
        if (!content) {
            content = global.fileCache[tab.fileId]?.contents || ''
        }
        if (content.trim()) {
            snippets.push(
                `--- ${path} (open) ---\n${content.slice(0, 800)}${
                    content.length > 800 ? '\n…' : ''
                }`
            )
        }
    }
    return snippets
}

export function buildAgenticContext(
    view: EditorView,
    base: InlineCompletionContext
): AgenticCompletionContext {
    const state = store.getState() as FullState
    const lineNumber = view.state.doc.lineAt(base.cursorOffset).number
    const filePath = base.filepath || getViewFilePath(view)
    const language = getLanguageFromFilename(filePath)

    return {
        ...base,
        filepath: filePath,
        language,
        lineNumber,
        enclosingScope: getEnclosingScope(view, base.cursorOffset),
        nearbyDiagnostics: getNearbyDiagnostics(view, lineNumber),
        relatedSnippets: getRelatedOpenFileSnippets(state, filePath, language),
    }
}

export function buildAgenticPrompt(ctx: AgenticCompletionContext): string {
    const parts: string[] = [
        `File: ${ctx.filepath}`,
        `Language: ${ctx.language}`,
        `Cursor: line ${ctx.lineNumber}, column ${ctx.linePrefix.length + 1}`,
    ]

    if (ctx.enclosingScope) {
        parts.push('', 'Enclosing scope:', ctx.enclosingScope)
    }

    if (ctx.nearbyDiagnostics.length > 0) {
        parts.push('', 'Nearby diagnostics (consider fixing in completion):')
        parts.push(...ctx.nearbyDiagnostics)
    }

    if (ctx.relatedSnippets.length > 0) {
        parts.push('', 'Related open files:')
        parts.push(...ctx.relatedSnippets)
    }

    parts.push(
        '',
        '<<<FIM_PREFIX>>>',
        ctx.prefix,
        '<<<FIM_SUFFIX>>>',
        ctx.suffix,
        '<<<FIM_MIDDLE>>>',
        '',
        'Complete the code at <<<FIM_MIDDLE>>>. Output ONLY the text that goes between PREFIX and SUFFIX. No markdown, no explanation.'
    )

    return parts.join('\n')
}

export const AGENTIC_SYSTEM_PROMPT = `You are an elite agentic code completion engine inside a production IDE (Copilot-class).

Mission: predict the exact code the developer will type next at the cursor.

Rules:
1. Output ONLY raw code to insert — zero markdown, zero backticks, zero commentary
2. Match indentation, naming, imports, and patterns from the file exactly
3. Never repeat characters already present in FIM_PREFIX at the end of the prefix
4. Use nearby diagnostics and scope context when relevant
5. Prefer complete statements/blocks; stop at natural boundaries
6. If unsure, output a minimal safe completion rather than nothing
7. For empty lines after { or :, suggest properly indented body code`
