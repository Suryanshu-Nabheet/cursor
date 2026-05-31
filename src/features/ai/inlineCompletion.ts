/**
 * AI Inline Completion — Copilot-style fill-in-the-middle completions.
 * Fast, streaming, provider-aware, with strict output sanitization.
 */
import { EditorView } from '@codemirror/view'
import { getActiveProviderAPIKey } from './apiKeyUtils'
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

    // Skip when cursor is on whitespace-only line with no meaningful context
    const trimmedPrefix = linePrefix.trimEnd()
    if (trimmedPrefix.length === 0 && pos > 0) {
        const prevLine = state.doc.lineAt(Math.max(0, pos - 1))
        if (prevLine.text.trim().length === 0) return null
    }

    const startLine = line.number
    const prefixFrom = state.doc.line(Math.max(1, startLine - 80)).from
    const suffixTo = state.doc.line(
        Math.min(state.doc.lines, startLine + 30)
    ).to

    const prefix = state.doc.sliceString(prefixFrom, pos)
    const suffix = state.doc.sliceString(pos, suffixTo)

    if (prefix.length < 2 && suffix.trim().length < 2) return null

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

    // Drop leading explanation lines before code
    const lines = text.split('\n')
    while (
        lines.length > 1 &&
        lines[0].trim() &&
        !looksLikeCodeLine(lines[0], context.language)
    ) {
        lines.shift()
    }
    text = lines.join('\n')

    // Trim trailing explanation after code block ends
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
            kept.length >= 2 &&
            line.trim() &&
            !looksLikeCodeLine(line, context.language) &&
            !line.startsWith(context.indent)
        ) {
            break
        }
        kept.push(line)
    }
    text = kept.join('\n').trimEnd()

    // Align first line indentation with cursor line
    if (text && context.indent && !text.startsWith(context.indent)) {
        const firstLine = text.split('\n')[0]
        if (firstLine.trim() && !/^[}\]\)]/.test(firstLine.trim())) {
            text = context.indent + firstLine.trimStart() + text.slice(firstLine.length)
        }
    }

    // Never repeat what's already typed on the current line
    const typed = context.linePrefix.trimEnd()
    if (typed && text.startsWith(typed)) {
        text = text.slice(typed.length)
    }

    // Cap length
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
            const providerInfo = await getActiveProviderAPIKey(settings)
            if (!providerInfo?.apiKey) return ''

            const messages = [
                { role: 'system' as const, content: SYSTEM_PROMPT },
                { role: 'user' as const, content: buildUserPrompt(context) },
            ]

            const maxTokens = Number(settings.inlineCompletionMaxTokens ?? 256)
            const temperature = 0.15

            let accumulated = ''
            const stream = createCompletionStream(
                providerInfo.provider,
                providerInfo.apiKey,
                providerInfo.model,
                settings.ollamaBaseUrl,
                messages,
                { temperature, maxTokens, signal: controller.signal }
            )

            for await (const chunk of stream) {
                if (requestId !== this.activeRequestId) break
                if (controller.signal.aborted) break
                accumulated += chunk
                const sanitized = sanitizeCompletion(accumulated, context)
                if (sanitized) yield sanitized
                if (shouldStopStreaming(sanitized, context)) break
            }

            return sanitizeCompletion(accumulated, context)
        } catch (e: any) {
            if (e?.name === 'AbortError') return ''
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

async function* createCompletionStream(
    provider: string,
    apiKey: string,
    model: string,
    ollamaBaseUrl: string | undefined,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
        temperature: number
        maxTokens: number
        signal: AbortSignal
    }
): AsyncGenerator<string, void, unknown> {
    switch (provider) {
        case 'openai':
            yield* streamOpenAICompatible(
                'https://api.openai.com/v1/chat/completions',
                apiKey,
                model,
                messages,
                options
            )
            break
        case 'openrouter':
            yield* streamOpenAICompatible(
                'https://openrouter.ai/api/v1/chat/completions',
                apiKey,
                model,
                messages,
                {
                    ...options,
                    extraHeaders: {
                        'HTTP-Referer': 'https://codex-ide.com',
                        'X-Title': 'CodeX IDE',
                    },
                }
            )
            break
        case 'ollama':
            yield* streamOpenAICompatible(
                `${(ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`,
                apiKey,
                model,
                messages,
                options
            )
            break
        case 'claude':
            yield* streamClaudeInline(apiKey, model, messages, options)
            break
        case 'gemini':
            yield* streamGeminiInline(apiKey, model, messages, options)
            break
    }
}

async function* streamOpenAICompatible(
    url: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: {
        temperature: number
        maxTokens: number
        signal: AbortSignal
        extraHeaders?: Record<string, string>
    }
): AsyncGenerator<string, void, unknown> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            ...options.extraHeaders,
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stop: ['<<<END_BEFORE>>>', '<<<CODE_BEFORE_CURSOR>>>'],
        }),
        signal: options.signal,
    })

    if (!response.ok) return

    const reader = response.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') return
            try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) yield content
            } catch {
                // skip malformed chunks
            }
        }
    }
}

async function* streamClaudeInline(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature: number; maxTokens: number; signal: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    const system = messages.find(m => m.role === 'system')?.content
    const conversation = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            system,
            messages: conversation,
            stream: true,
            max_tokens: options.maxTokens,
            temperature: options.temperature,
        }),
        signal: options.signal,
    })

    if (!response.ok) return
    const reader = response.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') return
            try {
                const event = JSON.parse(data)
                if (
                    event.type === 'content_block_delta' &&
                    event.delta?.type === 'text_delta'
                ) {
                    yield event.delta.text
                }
            } catch {
                // skip
            }
        }
    }
}

async function* streamGeminiInline(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: { temperature: number; maxTokens: number; signal: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    const system = messages.find(m => m.role === 'system')?.content
    const user = messages.find(m => m.role === 'user')?.content || ''

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: user }] }],
                systemInstruction: system
                    ? { parts: [{ text: system }] }
                    : undefined,
                generationConfig: {
                    temperature: options.temperature,
                    maxOutputTokens: options.maxTokens,
                },
            }),
            signal: options.signal,
        }
    )

    if (!response.ok) return
    const reader = response.body?.getReader()
    if (!reader) return
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
                const data = JSON.parse(line.slice(6))
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) yield text
            } catch {
                // skip
            }
        }
    }
}

export const inlineCompletionService = new InlineCompletionService()
