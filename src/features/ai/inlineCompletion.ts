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

export type InlineCompletionMode = 'fast' | 'agentic'

export interface NormalizedInlineCompletionOptions {
    delayMs: number
    maxTokens: number
    timeoutMs: number
}

export interface InlineCompletionStatus {
    enabled: boolean
    provider: string
    configured: boolean
    reason: string
}

export function getInlineCompletionStatus(
    settings: Settings
): InlineCompletionStatus {
    if (settings.inlineCompletionEnabled === false) {
        return {
            enabled: false,
            provider: settings.aiProvider || 'ollama',
            configured: false,
            reason: 'Enable inline completion to start AI suggestions',
        }
    }

    const provider = settings.aiProvider || 'ollama'
    if (provider === 'ollama') {
        return {
            enabled: true,
            provider,
            configured: true,
            reason: `Using ${settings.ollamaModel || 'local Ollama model'}`,
        }
    }

    const configured =
        provider === 'openai'
            ? !!(settings.useOpenAIKey && settings.openAIKey)
            : provider === 'openrouter'
            ? !!(settings.useOpenRouterKey && settings.openRouterKey)
            : provider === 'gemini'
            ? !!(settings.useGeminiKey && settings.geminiKey)
            : provider === 'claude'
            ? !!(settings.useClaudeKey && settings.claudeKey)
            : false

    return {
        enabled: configured,
        provider,
        configured,
        reason: configured
            ? `Using ${provider}`
            : `Add a ${provider} API key or switch to Ollama`,
    }
}

export function isInlineCompletionEnabled(settings: Settings): boolean {
    return getInlineCompletionStatus(settings).enabled
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.max(min, Math.min(max, Math.round(number)))
}

export function normalizeInlineCompletionOptions(
    settings: Settings
): NormalizedInlineCompletionOptions {
    return {
        delayMs: clampNumber(settings.inlineCompletionDelay, 120, 1500, 300),
        maxTokens: clampNumber(settings.inlineCompletionMaxTokens, 24, 160, 64),
        timeoutMs: clampNumber((settings as any).inlineCompletionTimeoutMs, 2000, 15000, 8000),
    }
}

export function extractInlineCompletionContext(
    view: EditorView,
    filepath?: string,
    mode: InlineCompletionMode = 'fast'
): InlineCompletionContext | null {
    const state = view.state
    const selection = state.selection.main
    if (!selection.empty) return null
    if (state.doc.length > 1_000_000) return null

    const pos = selection.head
    const line = state.doc.lineAt(pos)
    const linePrefix = line.text.slice(0, pos - line.from)
    const indentMatch = linePrefix.match(/^(\s*)/)
    const indent = indentMatch?.[1] ?? ''

    const startLine = line.number
    const prefixLines = mode === 'agentic' ? 120 : 48
    const suffixLines = mode === 'agentic' ? 40 : 16
    const prefixFrom = state.doc.line(Math.max(1, startLine - prefixLines)).from
    const suffixTo = state.doc.line(
        Math.min(state.doc.lines, startLine + suffixLines)
    ).to

    const prefix = state.doc.sliceString(prefixFrom, pos)
    const suffix = state.doc.sliceString(pos, suffixTo)

    const path = filepath || getViewFilePath(view)
    const language = getLanguageFromFilename(path)
    if (language === 'plaintext' && !path.includes('.')) return null

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

    // Strip duplicate of what's already typed on this line. Do not strip
    // indentation-only prefixes; those are part of the insertion context.
    let strippedLinePrefix = false
    if (context.linePrefix.trim() && text.startsWith(context.linePrefix)) {
        text = text.slice(context.linePrefix.length)
        strippedLinePrefix = true
    }

    const typedToken = context.linePrefix.match(/[A-Za-z0-9_$]+$/)?.[0] ?? ''
    if (!strippedLinePrefix && typedToken && text.startsWith(typedToken)) {
        text = text.slice(typedToken.length)
        strippedLinePrefix = true
    }

    // Ensure first line respects cursor indent when mid-block
    if (
        text &&
        context.indent &&
        !strippedLinePrefix &&
        !text.startsWith(context.indent)
    ) {
        const first = text.split('\n')[0]
        if (first.trim() && !/^(?:}|\]|\)|;)/.test(first.trim())) {
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

export function normalizeAutomaticCompletion(text: string): string {
    const cleaned = text
        .replace(/\r/g, '')
        .split('\n')
        .map(line => line.trimEnd())
        .filter((line, index) => index === 0 || line.trim().length > 0)
        .join('\n')
        .trimEnd()

    if (!cleaned) return ''

    const lines = cleaned.split('\n')
    if (lines.length === 1) return lines[0].slice(0, 180)

    const firstNonEmpty = lines.find(line => line.trim().length > 0) || ''
    return firstNonEmpty.slice(0, 180)
}

function isLikelyCode(line: string): boolean {
    const t = line.trim()
    if (!t) return true
    if (/^(\/\/|\/\*|#|--|\*|\/\/\/)/.test(t)) return true
    if (/^(?:[a-zA-Z_$@<>]|\[|\()/.test(t)) return true
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
        defaultModel: info.model,
        baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    }
}

function buildFastCompletionPrompt(context: InlineCompletionContext) {
    const suffix = context.suffix.slice(0, 900)
    const prefix = context.prefix.slice(-2200)
    return [
        {
            role: 'system' as const,
            content:
                'You are an expert low-latency code completion engine. Return only a short code continuation for the cursor. No markdown, no prose, no explanations.',
        },
        {
            role: 'user' as const,
            content: [
                `Language: ${context.language}`,
                `File: ${context.filepath}`,
                '<prefix>',
                prefix,
                '</prefix>',
                '<suffix>',
                suffix,
                '</suffix>',
                'Complete at the cursor. Return only the next short code continuation, preferably one line.',
            ].join('\n'),
        },
    ]
}

class InlineCompletionService {
    private abortControllers = new Map<string, AbortController>()
    private activeRequestIds = new Map<string, number>()
    lastError: string | null = null

    cancel(requestKey = 'global') {
        this.abortControllers.get(requestKey)?.abort()
        this.abortControllers.delete(requestKey)
    }

    async *stream(
        view: EditorView,
        context: InlineCompletionContext,
        externalSignal?: AbortSignal,
        mode: InlineCompletionMode = 'fast',
        requestKey = 'global'
    ): AsyncGenerator<string, string, unknown> {
        this.cancel(requestKey)
        this.lastError = null
        const requestId = (this.activeRequestIds.get(requestKey) ?? 0) + 1
        this.activeRequestIds.set(requestKey, requestId)
        const controller = new AbortController()
        this.abortControllers.set(requestKey, controller)
        let timedOut = false
        const timeoutMs =
            mode === 'agentic'
                ? 30000
                : normalizeInlineCompletionOptions(
                      store.getState().settingsState.settings
                  ).timeoutMs
        const timeout = setTimeout(() => {
            timedOut = true
            controller.abort()
        }, timeoutMs)

        const onExternalAbort = () => controller.abort()
        externalSignal?.addEventListener('abort', onExternalAbort)

        try {
            const settings = store.getState().settingsState.settings
            const provider = await buildProviderConfig(settings)
            if (!provider) {
                this.lastError = 'No AI provider configured'
                return ''
            }

            const messages =
                mode === 'agentic'
                    ? [
                          {
                              role: 'system' as const,
                              content: AGENTIC_SYSTEM_PROMPT,
                          },
                          {
                              role: 'user' as const,
                              content: buildAgenticPrompt(
                                  buildAgenticContext(view, context)
                              ),
                          },
                      ]
                    : buildFastCompletionPrompt(context)

            const { maxTokens } = normalizeInlineCompletionOptions(settings)
            let accumulated = ''
            let lastYielded = ''

            for await (const chunk of streamAIResponse(provider, messages, {
                temperature: mode === 'agentic' ? 0.12 : 0.04,
                maxTokens,
                signal: controller.signal,
            })) {
                if (requestId !== this.activeRequestIds.get(requestKey)) break
                if (controller.signal.aborted) break

                accumulated += chunk
                const sanitized =
                    mode === 'fast'
                        ? normalizeAutomaticCompletion(
                              sanitizeCompletion(accumulated, context)
                          )
                        : sanitizeCompletion(accumulated, context)
                if (sanitized && sanitized !== lastYielded) {
                    lastYielded = sanitized
                    yield sanitized
                }
                if (shouldStopStreaming(sanitized, context)) break
            }

            const final =
                mode === 'fast'
                    ? normalizeAutomaticCompletion(
                          sanitizeCompletion(accumulated, context)
                      )
                    : sanitizeCompletion(accumulated, context)
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
            if (e instanceof Error && e.name === 'AbortError') {
                if (timedOut) {
                    this.lastError =
                        'AI completion timed out. Check your provider, model, or Ollama server.'
                }
                return ''
            }
            this.lastError =
                e instanceof Error ? e.message : 'Completion failed'
            if (process.env.NODE_ENV === 'development') {
                console.warn('[inlineCompletion]', e)
            }
            return ''
        } finally {
            clearTimeout(timeout)
            externalSignal?.removeEventListener('abort', onExternalAbort)
            if (this.abortControllers.get(requestKey) === controller) {
                this.abortControllers.delete(requestKey)
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

export function getInlineCompletionLastError(): string | null {
    return inlineCompletionService.lastError
}
