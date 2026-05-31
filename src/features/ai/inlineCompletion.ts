/**
 * Agentic AI inline completion — FIM-style, provider-aware, context-rich.
 */
import { EditorView } from '@codemirror/view'
import { getActiveProviderAPIKey } from './apiKeyUtils'
import { streamAIResponse, AIProviderConfig, AIProvider } from './providers'
import {
    buildAgenticContext,
    buildAgenticPrompt,
    AGENTIC_SYSTEM_PROMPT,
    getViewFilePath,
} from './agenticCompletion'
import { store } from '../../app/store'
import { Settings } from '../window/state'
import { getLanguageFromFilename } from '../extensions/utils'

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
    const prefixFrom = state.doc.line(Math.max(1, startLine - 120)).from
    const suffixTo = state.doc.line(
        Math.min(state.doc.lines, startLine + 40)
    ).to

    const prefix = state.doc.sliceString(prefixFrom, pos)
    const suffix = state.doc.sliceString(pos, suffixTo)

    const path = filepath || getViewFilePath(view)
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

/** Light sanitization — keeps partial stream visible; only strips obvious junk */
export function sanitizeCompletion(
    raw: string,
    context: InlineCompletionContext
): string {
    if (!raw) return ''

    let text = raw
        .replace(/^\uFEFF/, '')
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .replace(/<\|fim_(?:prefix|suffix|middle)\|>/gi, '')
        .replace(/<<<?(?:FIM|CODE)_[A-Z_]+>>>?/gi, '')

    // Drop a single leading prose line only when multiple lines exist
    const lines = text.split('\n')
    if (lines.length > 1 && lines[0].trim() && !isLikelyCode(lines[0])) {
        lines.shift()
        text = lines.join('\n')
    }

    text = text.trimEnd()

    // Strip duplicate of what's already typed on this line
    if (context.linePrefix && text.startsWith(context.linePrefix)) {
        text = text.slice(context.linePrefix.length)
    }

    // Ensure first line respects cursor indent when mid-block
    if (text && context.indent && !text.startsWith(context.indent)) {
        const first = text.split('\n')[0]
        if (first.trim() && !/^[}\]\);]/.test(first.trim())) {
            text = context.indent + first.trimStart() + text.slice(first.length)
        }
    }

    if (text.length > 2000) {
        text = text.slice(0, 2000)
        const nl = text.lastIndexOf('\n')
        if (nl > 300) text = text.slice(0, nl)
    }

    return text
}

function isLikelyCode(line: string): boolean {
    const t = line.trim()
    if (!t) return true
    if (/^(\/\/|\/\*|#|--|\*|\/\/\/)/.test(t)) return true
    if (/^[a-zA-Z_$@<>\[\(]/.test(t)) return true
    if (/^\s+\S/.test(line)) return true
    return false
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
    lastError: string | null = null

    cancel() {
        this.abortController?.abort()
        this.abortController = null
    }

    async *stream(
        view: EditorView,
        context: InlineCompletionContext,
        externalSignal?: AbortSignal
    ): AsyncGenerator<string, string, unknown> {
        this.cancel()
        this.lastError = null
        const requestId = ++this.activeRequestId
        const controller = new AbortController()
        this.abortController = controller

        const onExternalAbort = () => controller.abort()
        externalSignal?.addEventListener('abort', onExternalAbort)

        try {
            const settings = store.getState().settingsState.settings
            const provider = await buildProviderConfig(settings)
            if (!provider) {
                this.lastError = 'No AI provider configured'
                return ''
            }

            const agentic = buildAgenticContext(view, context)
            const messages = [
                { role: 'system' as const, content: AGENTIC_SYSTEM_PROMPT },
                { role: 'user' as const, content: buildAgenticPrompt(agentic) },
            ]

            const maxTokens = Number(settings.inlineCompletionMaxTokens ?? 512)
            let accumulated = ''
            let lastYielded = ''

            for await (const chunk of streamAIResponse(provider, messages, {
                temperature: 0.12,
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
            if (!final && accumulated.trim()) {
                // Last resort: use lightly cleaned raw output
                const fallback = accumulated
                    .replace(/^```[\w]*\n?/, '')
                    .replace(/\n?```\s*$/, '')
                    .trim()
                if (fallback) yield fallback
            }
            return final
        } catch (e: unknown) {
            if (e instanceof Error && e.name === 'AbortError') return ''
            this.lastError =
                e instanceof Error ? e.message : 'Completion failed'
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
    if (text.split('\n').length > 16) return true
    if (/\n\s*\}\s*$/.test(text) && ctx.prefix.includes('{')) return true
    return false
}

export const inlineCompletionService = new InlineCompletionService()
