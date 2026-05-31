/**
 * AI Inline Completion — Copilot-style fill-in-the-middle completions.
 */
import { EditorView } from '@codemirror/view'
import { getActiveProviderAPIKey } from './apiKeyUtils'
import { streamAIResponse, AIProviderConfig, AIProvider } from './providers'
import { store } from '../../app/store'
import { Settings } from '../window/state'
import { getLanguageFromFilename } from '../extensions/utils'
import { getPathForFileId } from '../window/fileUtils'
import { getFocusedTab } from '../selectors'

const SYSTEM_PROMPT = `You are an expert code completion engine embedded in an IDE.
Complete the code at the cursor position.

Rules:
- Output ONLY the code to insert at the cursor — no markdown, no fences, no explanation
- Match the file's style, indentation, naming, and patterns exactly
- Continue naturally from the cursor; never repeat code already before the cursor
- Prefer concise, accurate completions (usually 1–8 lines)
- Stop at a natural boundary (end of statement, closing brace, blank line)
- If completion is impossible or unsafe, output nothing`

export interface InlineCompletionContext {
    prefix: string
    suffix: string
    filepath: string
    language: string
    cursorOffset: number
    linePrefix: string
    indent: string
}

export function isInlineCompletionEnabled(settings: Settings): boolean {
    if (settings.inlineCompletionEnabled === false) return false
    const provider = settings.aiProvider || 'ollama'
    if (provider === 'ollama') return true
    if (provider === 'openai') return !!(settings.useOpenAIKey && settings.openAIKey)
    if (provider === 'openrouter') return !!(settings.useOpenRouterKey && settings.openRouterKey)
    if (provider === 'gemini') return !!(settings.useGeminiKey && settings.geminiKey)
    if (provider === 'claude') return !!(settings.useClaudeKey && settings.claudeKey)
    return false
}

export function getActiveFilePath(): string {
    const state = store.getState()
    const tab = getFocusedTab(state)
    if (!tab?.fileId) return 'untitled'
    return getPathForFileId(state.global, tab.fileId) || 'untitled'
}

export function extractInlineCompletionContext(
    view: EditorView,
    filepath?: string
): InlineCompletionContext | null {
    const state = view.state
    const selection = state.selection.main
    if (!selection.empty) return null

    const pos = selection.head
    const line = state.doc.lineAt(pos)
    const linePrefix = line.text.slice(0, pos - line.from)
    const indentMatch = linePrefix.match(/^(\s*)/)
    const indent = indentMatch?.[1] ?? ''

    const startLine = line.number
    const prefixFrom = state.doc.line(Math.max(1, startLine - 80)).from
    const suffixTo = state.doc.line(
        Math.min(state.doc.lines, startLine + 30)
    ).to

    const prefix = state.doc.sliceString(prefixFrom, pos)
    const suffix = state.doc.sliceString(pos, suffixTo)

    if (prefix.trim().length < 1 && suffix.trim().length < 1) return null

    const path = filepath || getActiveFilePath()
    const language = getLanguageFromFilename(path)

    return {
        prefix,
        suffix,
        filepath: path,
        language,
        cursorOffset: pos,
        linePrefix,
        indent,
    }
}

export function sanitizeCompletion(
    raw: string,
    context: InlineCompletionContext
): string {
    if (!raw) return ''

    let text = raw
        .replace(/^\uFEFF/, '')
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .replace(/<\|fim_(?:prefix|suffix|middle)\|>/g, '')

    const lines = text.split('\n')
    while (
        lines.length > 1 &&
        lines[0].trim() &&
        !looksLikeCodeLine(lines[0], context.language)
    ) {
        lines.shift()
    }
    text = lines.join('\n')

    const codeLines = text.split('\n')
    const kept: string[] = []
    for (const line of codeLines) {
        if (
            kept.length > 0 &&
            line.trim() === '' &&
            kept[kept.length - 1]?.trim() === ''
        ) {
            break
        }
        if (
            kept.length >= 3 &&
            line.trim() &&
            !looksLikeCodeLine(line, context.language) &&
            !line.startsWith(context.indent)
        ) {
            break
        }
        kept.push(line)
    }
    text = kept.join('\n').trimEnd()

    if (text && context.indent && !text.startsWith(context.indent)) {
        const firstLine = text.split('\n')[0]
        if (firstLine.trim() && !/^[}\]\)]/.test(firstLine.trim())) {
            text = context.indent + firstLine.trimStart() + text.slice(firstLine.length)
        }
    }

    const typed = context.linePrefix
    if (typed && text.startsWith(typed)) {
        text = text.slice(typed.length)
    } else if (typed.trimEnd()) {
        const trimmedTyped = typed.trimEnd()
        if (text.startsWith(trimmedTyped)) {
            text = text.slice(trimmedTyped.length)
        }
    }

    if (text.length > 1200) {
        text = text.slice(0, 1200)
        const lastNewline = text.lastIndexOf('\n')
        if (lastNewline > 200) text = text.slice(0, lastNewline)
    }

    return text
}

function looksLikeCodeLine(line: string, _language: string): boolean {
    const t = line.trim()
    if (!t) return true
    if (/^(import|export|const|let|var|function|class|interface|type|return|if|for|while|switch|case|async|await|public|private|protected|def|fn|use|package|#include)\b/.test(t)) {
        return true
    }
    if (/^[{\[\(]/.test(t) || /[;\{\}\[\]\),]$/.test(t)) return true
    if (/^\s*(\/\/|\/\*|#|--|\*)/.test(line)) return true
    if (/^\s+\S/.test(line)) return true
    if (/^[a-zA-Z_$][\w$]*\s*[=\(:]/.test(t)) return true
    return false
}

function buildUserPrompt(ctx: InlineCompletionContext): string {
    return `File: ${ctx.filepath}
Language: ${ctx.language}

<<<CODE_BEFORE_CURSOR>>>
${ctx.prefix}
<<<END_BEFORE>>>

<<<CODE_AFTER_CURSOR>>>
${ctx.suffix}
<<<END_AFTER>>>

Insert only the missing code at the cursor (between BEFORE and AFTER):`
}

async function buildProviderConfig(
    settings: Settings
): Promise<AIProviderConfig | null> {
    const info = await getActiveProviderAPIKey(settings)
    if (!info?.apiKey) return null

    return {
        provider: info.provider as AIProvider,
        apiKey: info.apiKey,
        enabled: true,
        defaultModel: info.model.replace(':free', ''),
        baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    }
}

class InlineCompletionService {
    private abortController: AbortController | null = null
    private activeRequestId = 0

    cancel() {
        this.abortController?.abort()
        this.abortController = null
    }

    async *stream(
        context: InlineCompletionContext,
        externalSignal?: AbortSignal
    ): AsyncGenerator<string, string, unknown> {
        this.cancel()
        const requestId = ++this.activeRequestId
        const controller = new AbortController()
        this.abortController = controller

        const onExternalAbort = () => controller.abort()
        externalSignal?.addEventListener('abort', onExternalAbort)

        try {
            const settings = store.getState().settingsState.settings
            const provider = await buildProviderConfig(settings)
            if (!provider) return ''

            const messages = [
                { role: 'system' as const, content: SYSTEM_PROMPT },
                { role: 'user' as const, content: buildUserPrompt(context) },
            ]

            const maxTokens = Number(settings.inlineCompletionMaxTokens ?? 256)
            let accumulated = ''
            let lastYielded = ''

            for await (const chunk of streamAIResponse(provider, messages, {
                temperature: 0.15,
                maxTokens,
                signal: controller.signal,
            })) {
                if (requestId !== this.activeRequestId) break
                if (controller.signal.aborted) break

                accumulated += chunk
                const sanitized = sanitizeCompletion(accumulated, context)
                if (sanitized && sanitized !== lastYielded) {
                    lastYielded = sanitized
                    yield sanitized
                }
                if (shouldStopStreaming(sanitized, context)) break
            }

            const final = sanitizeCompletion(accumulated, context)
            if (final && final !== lastYielded) {
                yield final
            }
            return final
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') return ''
            if (process.env.NODE_ENV === 'development') {
                console.warn('[inlineCompletion]', e)
            }
            return ''
        } finally {
            externalSignal?.removeEventListener('abort', onExternalAbort)
            if (this.abortController === controller) {
                this.abortController = null
            }
        }
    }
}

function shouldStopStreaming(text: string, ctx: InlineCompletionContext): boolean {
    if (!text) return false
    const lines = text.split('\n')
    if (lines.length > 12) return true
    if (/\n\s*\}\s*$/.test(text) && ctx.prefix.includes('{')) return true
    return false
}

export const inlineCompletionService = new InlineCompletionService()
