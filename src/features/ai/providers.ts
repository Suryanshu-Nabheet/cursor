/**
 * AI Provider Abstraction Layer
 * Supports OpenAI, OpenRouter, Google Gemini, and Anthropic Claude
 */

export type AIProvider =
    | 'openai'
    | 'openrouter'
    | 'gemini'
    | 'claude'
    | 'ollama'

export interface AIModel {
    id: string
    name: string
    provider: AIProvider
    contextWindow?: number
    supportsStreaming?: boolean
}

export interface AIProviderConfig {
    provider: AIProvider
    apiKey: string
    enabled: boolean
    defaultModel?: string
    baseUrl?: string
    models?: AIModel[]
}

export interface AISettings {
    provider: AIProvider
    openai?: {
        apiKey: string
        enabled: boolean
        model: string
    }
    openrouter?: {
        apiKey: string
        enabled: boolean
        model: string
    }
    gemini?: {
        apiKey: string
        enabled: boolean
        model: string
    }
    claude?: {
        apiKey: string
        enabled: boolean
        model: string
    }
    ollama?: {
        baseUrl: string
        enabled: boolean
        model: string
    }
}

import { OPENAI_MODELS } from './providers/openai'
import { OPENROUTER_MODELS } from './providers/openrouter'
import { GEMINI_MODELS } from './providers/gemini'
import { CLAUDE_MODELS } from './providers/claude'
import { OLLAMA_MODELS } from './providers/ollama'

// Comprehensive model lists for each provider
export const DEFAULT_MODELS: Record<AIProvider, string[]> = {
    openai: OPENAI_MODELS,
    openrouter: OPENROUTER_MODELS,
    gemini: GEMINI_MODELS,
    claude: CLAUDE_MODELS,
    ollama: OLLAMA_MODELS,
}

/**
 * Get the active AI provider configuration
 * Priority: User Settings > .env file > null
 */
export function getActiveProvider(
    settings: AISettings
): AIProviderConfig | null {
    const provider = settings.provider

    switch (provider) {
        case 'openai':
            // Check user settings first
            if (settings.openai?.enabled && settings.openai?.apiKey) {
                return {
                    provider: 'openai',
                    apiKey: settings.openai.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.openai.model || DEFAULT_MODELS.openai[0],
                }
            }
            break
        case 'openrouter':
            if (settings.openrouter?.enabled && settings.openrouter?.apiKey) {
                return {
                    provider: 'openrouter',
                    apiKey: settings.openrouter.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.openrouter.model ||
                        DEFAULT_MODELS.openrouter[0],
                }
            }
            break
        case 'gemini':
            if (settings.gemini?.enabled && settings.gemini?.apiKey) {
                return {
                    provider: 'gemini',
                    apiKey: settings.gemini.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.gemini.model || DEFAULT_MODELS.gemini[0],
                }
            }
            break
        case 'claude':
            if (settings.claude?.enabled && settings.claude?.apiKey) {
                return {
                    provider: 'claude',
                    apiKey: settings.claude.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.claude.model || DEFAULT_MODELS.claude[0],
                }
            }
            break
        case 'ollama':
            // Ollama doesn't strictly need an API key for localhost, but we assume it's enabled if selected
            return {
                provider: 'ollama',
                apiKey: 'ollama', // Dummy key
                enabled: true,
                baseUrl: settings.ollama?.baseUrl || 'http://localhost:11434',
                defaultModel:
                    settings.ollama?.model || DEFAULT_MODELS.ollama[0],
            }
    }

    // Default Fallback to Ollama if nothing else allows us to be "AI Native"
    if (settings.ollama?.enabled !== false) {
        return {
            provider: 'ollama',
            apiKey: 'ollama',
            enabled: true,
            baseUrl: settings.ollama?.baseUrl || 'http://localhost:11434',
            defaultModel: settings.ollama?.model || DEFAULT_MODELS.ollama[0],
        }
    }

    return null
}

/**
 * Get active provider with .env fallback (async version for IPC)
 */
export async function getActiveProviderWithEnv(
    settings: AISettings,
    getEnvKey: (provider: AIProvider) => Promise<string | null>
): Promise<AIProviderConfig | null> {
    const provider = settings.provider

    switch (provider) {
        case 'openai': {
            // User's own key ONLY
            if (settings.openai?.enabled && settings.openai?.apiKey) {
                return {
                    provider: 'openai',
                    apiKey: settings.openai.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.openai.model || DEFAULT_MODELS.openai[0],
                }
            }
            break
        }
        case 'openrouter': {
            if (settings.openrouter?.enabled && settings.openrouter?.apiKey) {
                return {
                    provider: 'openrouter',
                    apiKey: settings.openrouter.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.openrouter.model ||
                        DEFAULT_MODELS.openrouter[0],
                }
            }
            // Company allows OpenRouter via .env
            const openrouterEnvKey = await getEnvKey('openrouter')
            if (openrouterEnvKey) {
                return {
                    provider: 'openrouter',
                    apiKey: openrouterEnvKey,
                    enabled: true,
                    defaultModel:
                        settings.openrouter?.model ||
                        DEFAULT_MODELS.openrouter[0],
                }
            }
            break
        }
        case 'gemini': {
            // User's own key ONLY
            if (settings.gemini?.enabled && settings.gemini?.apiKey) {
                return {
                    provider: 'gemini',
                    apiKey: settings.gemini.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.gemini.model || DEFAULT_MODELS.gemini[0],
                }
            }
            break
        }
        case 'claude': {
            // User's own key ONLY
            if (settings.claude?.enabled && settings.claude?.apiKey) {
                return {
                    provider: 'claude',
                    apiKey: settings.claude.apiKey,
                    enabled: true,
                    defaultModel:
                        settings.claude.model || DEFAULT_MODELS.claude[0],
                }
            }
            break
        }
        case 'ollama': {
            return {
                provider: 'ollama',
                apiKey: 'ollama',
                enabled: true,
                baseUrl: settings.ollama?.baseUrl || 'http://localhost:11434',
                defaultModel:
                    settings.ollama?.model || DEFAULT_MODELS.ollama[0],
            }
        }
    }

    // Fallback to Ollama if no other provider is configured
    return {
        provider: 'ollama',
        apiKey: 'ollama',
        enabled: true,
        baseUrl: settings.ollama?.baseUrl || 'http://localhost:11434',
        defaultModel: settings.ollama?.model || DEFAULT_MODELS.ollama[0],
    }
}

/**
 * Make an API call to the appropriate provider
 */
export async function* streamAIResponse(
    provider: AIProviderConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
        temperature?: number
        maxTokens?: number
        signal?: AbortSignal
    }
): AsyncGenerator<string, void, unknown> {
    const { provider: providerType, apiKey, defaultModel, baseUrl } = provider

    switch (providerType) {
        case 'openai':
            yield* streamOpenAI(apiKey, defaultModel!, messages, options)
            break
        case 'openrouter':
            yield* streamOpenRouter(apiKey, defaultModel!, messages, options)
            break
        case 'gemini':
            yield* streamGemini(apiKey, defaultModel!, messages, options)
            break
        case 'claude':
            yield* streamClaude(apiKey, defaultModel!, messages, options)
            break
        case 'ollama':
            yield* streamOllama(
                baseUrl || 'http://localhost:11434',
                defaultModel!,
                messages,
                options
            )
            break
    }
}

async function* streamOpenAI(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens,
        }),
        signal: options?.signal,
    })

    if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) return

    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') return

                try {
                    const parsed = JSON.parse(data)
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                        yield content
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }
}

async function* streamOllama(
    baseUrl: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    // Ensure base URL doesn't have trailing slash
    const cleanUrl = baseUrl.replace(/\/$/, '')

    try {
        const response = await fetch(`${cleanUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Ollama doesn't require an API key usually, but sending 'ollama' is fine
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
            }),
            signal: options?.signal,
        })

        if (!response.ok) {
            // Check if it's a connection error or model not found
            if (response.status === 404) {
                throw new Error(
                    `Ollama model '${model}' not found. Please run: ollama pull ${model}`
                )
            }
            throw new Error(`Ollama API error: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) return

        let buffer = ''
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') return

                    try {
                        const parsed = JSON.parse(data)
                        const content = parsed.choices?.[0]?.delta?.content
                        if (content) {
                            yield content
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error: any) {
        if (error.message.includes('Failed to fetch')) {
            throw new Error(
                'Could not connect to Ollama. Is it running at ' + baseUrl + '?'
            )
        }
        throw error
    }
}

async function* streamOpenRouter(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    if (process.env.NODE_ENV === 'development') {
        console.log('[OpenRouter] Sending request:', {
            model,
            messageCount: messages.length,
        })
    }

    const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'CodeX',
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens,
            }),
            signal: options?.signal,
        }
    )

    if (!response.ok) {
        const errorText = await response.text()
        if (process.env.NODE_ENV === 'development') {
            console.error('[OpenRouter] API Error:', response.status, errorText)
        }

        // Parse error for user-friendly message
        let userMessage = 'Unable to connect to AI service. Please try again.'
        try {
            const errorJson = JSON.parse(errorText)
            if (errorJson.error?.message) {
                const msg = errorJson.error.message
                if (msg.includes('data policy') || msg.includes('Free model')) {
                    userMessage =
                        'This model requires a paid plan. Please select a different model or upgrade your OpenRouter account.'
                } else if (
                    msg.includes('Invalid API key') ||
                    msg.includes('Unauthorized')
                ) {
                    userMessage =
                        'Invalid API key. Please check your OpenRouter API key in settings.'
                } else if (msg.includes('rate limit')) {
                    userMessage =
                        'Rate limit exceeded. Please wait a moment and try again.'
                } else {
                    userMessage = msg
                }
            }
        } catch (e) {
            // Use default message
        }

        throw new Error(userMessage)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
        if (process.env.NODE_ENV === 'development') {
            console.error('[OpenRouter] No reader available')
        }
        throw new Error('Unable to receive AI response. Please try again.')
    }

    if (process.env.NODE_ENV === 'development') {
        console.log('[OpenRouter] Starting stream...')
    }
    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') return

                try {
                    const parsed = JSON.parse(data)
                    const content = parsed.choices?.[0]?.delta?.content
                    if (content) {
                        yield content
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }

    if (process.env.NODE_ENV === 'development') {
        console.log('[OpenRouter] Stream complete')
    }
}

async function* streamGemini(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    // Convert messages to Gemini format
    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }))

    const systemInstruction = messages.find((m) => m.role === 'system')?.content

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                systemInstruction: systemInstruction
                    ? { parts: [{ text: systemInstruction }] }
                    : undefined,
                generationConfig: {
                    temperature: options?.temperature ?? 0.7,
                    maxOutputTokens: options?.maxTokens,
                },
            }),
            signal: options?.signal,
        }
    )

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) return

    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
            if (chunk.startsWith('data: ')) {
                try {
                    const data = JSON.parse(chunk.slice(6))
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                    if (text) {
                        yield text
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }
}

async function* streamClaude(
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: { temperature?: number; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
    // Convert messages to Claude format
    const system = messages.find((m) => m.role === 'system')?.content
    const conversation = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        }))

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            messages: conversation,
            system: system,
            stream: true,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.maxTokens ?? 4096,
        }),
        signal: options?.signal,
    })

    if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) return

    let buffer = ''
    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') return

                try {
                    const parsed = JSON.parse(data)
                    if (parsed.type === 'content_block_delta') {
                        const text = parsed.delta?.text
                        if (text) {
                            yield text
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
    }
}
