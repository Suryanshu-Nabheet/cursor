import { AITool as Tool } from './tools'

export interface AIMessage {
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string | null
    toolCalls?: any[] // Internal format
    tool_calls?: any[] // API format (often used in history)
    toolCallId?: string
    tool_call_id?: string
}

export interface StreamChunk {
    type: 'text' | 'tool_call_start' | 'tool_call' | 'tool_call_delta' | 'error'
    content?: string
    toolCall?: {
        id: string
        name: string
        arguments: Record<string, any>
        argumentsRaw?: string
    }
    error?: string
}

const PRIMARY_TOOL_ARGUMENT: Record<string, string> = {
    read_file: 'path',
    list_files: 'path',
    open_file: 'path',
    delete_file: 'path',
    create_directory: 'path',
    run_terminal_command: 'command',
    search_code: 'query',
}

function parseToolArguments(
    toolName: string,
    rawArguments: string
): { arguments: Record<string, any>; repaired: boolean } | null {
    try {
        const parsed = JSON.parse(rawArguments)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { arguments: parsed, repaired: false }
        }

        const primaryKey = PRIMARY_TOOL_ARGUMENT[toolName]
        if (primaryKey && typeof parsed === 'string' && parsed.trim()) {
            return { arguments: { [primaryKey]: parsed.trim() }, repaired: true }
        }
    } catch {
        // Fall through to repair common local-model argument fragments.
    }

    const primaryKey = PRIMARY_TOOL_ARGUMENT[toolName]
    if (!primaryKey) return null

    const normalized = rawArguments
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")

    const doubleQuoted = new RegExp(`"${primaryKey}"\\s*:\\s*"([^"\\n\\r]*)`).exec(normalized)
    const singleQuoted = new RegExp(`'${primaryKey}'\\s*:\\s*'([^'\\n\\r]*)`).exec(normalized)
    const unquoted = new RegExp(`["']?${primaryKey}["']?\\s*:\\s*([^,}\\n\\r]+)`).exec(normalized)
    const value = doubleQuoted?.[1] ?? singleQuoted?.[1] ?? unquoted?.[1]

    if (!value) return null

    const cleaned = value
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/[}\]]+$/g, '')
        .trim()

    if (!cleaned) return null

    return { arguments: { [primaryKey]: cleaned }, repaired: true }
}

/**
 * Format tools for the specific provider
 */
function formatToolsForProvider(
    tools: Tool[],
    provider: 'openai' | 'claude' | 'gemini' | 'openrouter' | 'ollama'
): any {
    switch (provider) {
        case 'openai':
        case 'openrouter':
        case 'ollama':
            return tools.map((tool) => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties: tool.parameters.properties,
                        required: tool.parameters.required,
                    },
                },
            }))

        case 'claude':
            return tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: {
                    type: 'object',
                    properties: tool.parameters.properties,
                    required: tool.parameters.required,
                },
            }))

        case 'gemini':
            return {
                function_declarations: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                })),
            }

        default:
            return []
    }
}

/**
 * Call provider with tool support
 */
export async function* streamAIResponseWithTools(
    provider: any,
    messages: AIMessage[],
    options: {
        tools: Tool[]
        maxToolCalls?: number
        temperature?: number
        maxTokens?: number
        signal?: AbortSignal
    }
): AsyncGenerator<StreamChunk, void, unknown> {
    const formattedTools = formatToolsForProvider(
        options.tools,
        provider.provider
    )
    const providerType = provider.provider

    // Dispatch to appropriate provider handler
    switch (providerType) {
        case 'openai':
            yield* streamOpenAIWithTools(
                provider.apiKey,
                provider.defaultModel,
                messages,
                formattedTools,
                'https://api.openai.com/v1',
                {},
                options
            )
            break

        case 'openrouter':
            yield* streamOpenAIWithTools(
                provider.apiKey,
                provider.defaultModel,
                messages,
                formattedTools,
                'https://openrouter.ai/api/v1',
                {
                    'HTTP-Referer': 'https://codex-ide.com',
                    'X-Title': 'CodeX IDE',
                },
                options
            )
            break

        case 'ollama': {
            const baseUrl = provider.baseUrl || 'http://localhost:11434'
            yield* streamOpenAIWithTools(
                provider.apiKey || 'ollama',
                provider.defaultModel,
                messages,
                formattedTools,
                `${baseUrl.replace(/\/$/, '')}/v1`,
                {},
                options
            )
            break
        }

        case 'claude':
            yield* streamClaudeWithTools(
                provider.apiKey,
                provider.defaultModel,
                messages,
                formattedTools,
                options
            )
            break

        case 'gemini':
            yield* streamGeminiWithTools(
                provider.apiKey,
                provider.defaultModel,
                messages,
                formattedTools,
                options
            )
            break

        default:
            yield {
                type: 'error',
                error: `Provider ${providerType} not supported for tool calling.`,
            }
    }
}

/**
 * OpenAI / OpenRouter / Ollama Helper
 */
async function* streamOpenAIWithTools(
    apiKey: string,
    model: string,
    messages: AIMessage[],
    tools: any[],
    baseUrl: string,
    extraHeaders: Record<string, string>,
    options?: any
): AsyncGenerator<StreamChunk, void, unknown> {
    const formattedMessages = messages.map((msg) => {
        // Handle Tool Responses
        const toolCallId = msg.toolCallId || msg.tool_call_id
        if (msg.role === 'tool' && toolCallId) {
            return {
                role: 'tool',
                content: msg.content || '',
                tool_call_id: toolCallId,
            }
        }

        // Handle Assistant Tool Calls
        const toolCalls = msg.toolCalls || msg.tool_calls
        if (toolCalls && toolCalls.length > 0) {
            // Map to OpenAI format
            const mappedToolCalls = toolCalls.map((tc: any) => {
                // Input might be internal format OR already API format
                if (tc.function) return tc // Already API format

                return {
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments:
                            typeof tc.arguments === 'string'
                                ? tc.arguments
                                : JSON.stringify(tc.arguments),
                    },
                }
            })

            return {
                role: msg.role,
                content: msg.content || null,
                tool_calls: mappedToolCalls,
            }
        }

        return {
            role: msg.role,
            content: msg.content,
        }
    })

    const requestBody: any = {
        model,
        messages: formattedMessages,
        stream: true,
        temperature: options?.temperature ?? 0.7,
    }

    if (tools && tools.length > 0) {
        requestBody.tools = tools
        requestBody.tool_choice = 'auto'
    }

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                ...extraHeaders,
            },
            body: JSON.stringify(requestBody),
            signal: options?.signal,
        })

        if (!response.ok) {
            const error = await response.text()
            yield {
                type: 'error',
                error: `API Error (${response.status}): ${error}`,
            }
            return
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return

        let buffer = ''
        const toolCallsMap = new Map<
            number,
            { id?: string; name?: string; arguments?: string }
        >()
        const announcedToolStarts = new Set<number>()
        const completedToolCalls = new Set<number>()

        let fullTextAccumulator = ''

        const emitCompletedToolCalls = function* (): Generator<StreamChunk> {
            for (const [index, toolCall] of toolCallsMap) {
                const callId =
                    toolCall.id || `pending_${index}_${toolCall.name || 'tool'}`

                if (toolCall.name && !announcedToolStarts.has(index)) {
                    announcedToolStarts.add(index)
                    yield {
                        type: 'tool_call_start',
                        toolCall: {
                            id: callId,
                            name: toolCall.name,
                            arguments: {},
                        },
                    }
                }

                if (
                    toolCall.name &&
                    toolCall.arguments &&
                    !completedToolCalls.has(index)
                ) {
                    const parsed = parseToolArguments(
                        toolCall.name,
                        toolCall.arguments
                    )
                    if (parsed && !parsed.repaired) {
                        completedToolCalls.add(index)
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: callId,
                                name: toolCall.name,
                                arguments: parsed.arguments,
                            },
                        }
                    } else {
                        yield {
                            type: 'tool_call_delta',
                            toolCall: {
                                id: callId,
                                name: toolCall.name,
                                arguments: {},
                                argumentsRaw: toolCall.arguments,
                            },
                        }
                    }
                }
            }
        }

        const emitIncompleteToolCalls = function* (): Generator<StreamChunk> {
            for (const [index, toolCall] of toolCallsMap) {
                if (completedToolCalls.has(index)) continue
                const name = toolCall.name || 'unknown_tool'

                if (!toolCall.name) {
                    yield {
                        type: 'error',
                        error: `Model started a tool call but did not provide a tool name.`,
                    }
                    completedToolCalls.add(index)
                    continue
                }

                if (!toolCall.arguments) {
                    yield {
                        type: 'error',
                        error: `Tool call "${name}" was incomplete: missing arguments.`,
                    }
                    completedToolCalls.add(index)
                    continue
                }

                const parsed = parseToolArguments(name, toolCall.arguments)
                if (parsed) {
                    yield {
                        type: 'tool_call',
                        toolCall: {
                            id: toolCall.id || `call_${Date.now()}_${index}`,
                            name,
                            arguments: parsed.arguments,
                        },
                    }
                    completedToolCalls.add(index)
                    continue
                }

                yield {
                    type: 'error',
                    error: `Tool call "${name}" had invalid JSON arguments and could not be repaired.`,
                }
                completedToolCalls.add(index)
            }
        }

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.trim().startsWith('data: ')) {
                    const data = line.trim().slice(6)
                    if (data === '[DONE]') break
                    try {
                        const parsed = JSON.parse(data)
                        const delta = parsed.choices?.[0]?.delta
                        if (delta?.content) {
                            yield { type: 'text', content: delta.content }
                            fullTextAccumulator += delta.content
                        }

                        if (delta?.tool_calls) {
                            for (const toolCallDelta of delta.tool_calls) {
                                const index = toolCallDelta.index
                                const existing = toolCallsMap.get(index) || {}
                                if (toolCallDelta.id)
                                    existing.id = toolCallDelta.id
                                if (toolCallDelta.function?.name)
                                    existing.name = toolCallDelta.function.name
                                if (toolCallDelta.function?.arguments)
                                    existing.arguments =
                                        (existing.arguments || '') +
                                        toolCallDelta.function.arguments
                                toolCallsMap.set(index, existing)
                            }

                            for (const chunk of emitCompletedToolCalls()) {
                                yield chunk
                            }
                        }
                    } catch {
                        yield {
                            type: 'error',
                            error: 'Failed to parse provider stream chunk.',
                        }
                    }
                }
            }
        }

        // Final pass — emit any tool calls that completed on the last chunk
        for (const chunk of emitCompletedToolCalls()) {
            yield chunk
        }

        // Check for JSON fallback in the text
        if (toolCallsMap.size === 0) {
            const jsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/g
            let match
            while ((match = jsonRegex.exec(fullTextAccumulator)) !== null) {
                try {
                    const parsedTool = JSON.parse(match[1])
                    if (parsedTool.name && parsedTool.arguments) {
                        yield {
                            type: 'tool_call',
                            toolCall: {
                                id: `call_${Date.now()}_${Math.random()}`,
                                name: parsedTool.name,
                                arguments: parsedTool.arguments,
                            },
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse detected JSON tool call', e)
                }
            }
        }

        // Any remaining pending call is malformed/incomplete. Surface it instead of
        // leaving the sidebar spinner stuck forever.
        for (const chunk of emitIncompleteToolCalls()) {
            yield chunk
        }
    } catch (error: any) {
        yield { type: 'error', error: `Network Error: ${error.message}` }
    }
}

/**
 * Claude Implementation
 */
async function* streamClaudeWithTools(
    apiKey: string,
    model: string,
    messages: AIMessage[],
    tools: any[],
    options?: any
): AsyncGenerator<StreamChunk, void, unknown> {
    const systemMessage = messages.find((m) => m.role === 'system')?.content
    const conversationMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            if (m.role === 'tool') {
                return {
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: m.toolCallId || m.tool_call_id,
                            content: m.content || '',
                        },
                    ],
                }
            }
            if (m.role === 'assistant') {
                const content: any[] = []
                if (m.content) content.push({ type: 'text', text: m.content })
                const tcs = m.toolCalls || m.tool_calls
                if (tcs) {
                    tcs.forEach((tc: any) => {
                        // Handle both internal (tc.arguments obj) and API (tc.function.arguments str)
                        let args = tc.arguments
                        let name = tc.name
                        const id = tc.id

                        if (tc.function) {
                            name = tc.function.name
                            try {
                                args = JSON.parse(tc.function.arguments)
                            } catch (e) {
                                args = {}
                            }
                        }
                        content.push({
                            type: 'tool_use',
                            id,
                            name,
                            input: args,
                        })
                    })
                }
                return { role: 'assistant', content }
            }
            return { role: 'user', content: m.content }
        })

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                messages: conversationMessages,
                system: systemMessage,
                tools,
                stream: true,
                max_tokens: options?.maxTokens || 4096,
                temperature: options?.temperature ?? 0.7,
            }),
            signal: options?.signal,
        })

        if (!response.ok) {
            yield {
                type: 'error',
                error: `Claude API Error: ${await response.text()}`,
            }
            return
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return
        let buffer = ''
        let currentToolCall: any = null

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6)
                    if (data === '[DONE]') break
                    try {
                        const event = JSON.parse(data)
                        if (
                            event.type === 'content_block_delta' &&
                            event.delta?.type === 'text_delta'
                        ) {
                            yield { type: 'text', content: event.delta.text }
                        }
                        if (
                            event.type === 'content_block_start' &&
                            event.content_block?.type === 'tool_use'
                        ) {
                            currentToolCall = {
                                ...event.content_block,
                                inputStr: '',
                            }
                            yield {
                                type: 'tool_call_start',
                                toolCall: {
                                    id: event.content_block.id,
                                    name: event.content_block.name,
                                    arguments: {},
                                },
                            }
                        }
                        if (
                            event.type === 'content_block_delta' &&
                            event.delta?.type === 'input_json_delta'
                        ) {
                            if (currentToolCall)
                                currentToolCall.inputStr +=
                                    event.delta.partial_json
                        }
                        if (
                            event.type === 'content_block_stop' &&
                            currentToolCall
                        ) {
                            try {
                                yield {
                                    type: 'tool_call',
                                    toolCall: {
                                        id: currentToolCall.id,
                                        name: currentToolCall.name,
                                        arguments: JSON.parse(
                                            currentToolCall.inputStr
                                        ),
                                    },
                                }
                            } catch {
                                yield {
                                    type: 'error',
                                    error: `Claude tool call "${currentToolCall.name}" had invalid JSON arguments and was not executed.`,
                                }
                            }
                            currentToolCall = null
                        }
                    } catch {
                        yield {
                            type: 'error',
                            error: 'Failed to parse Claude stream chunk.',
                        }
                    }
                }
            }
        }
    } catch (e: any) {
        yield { type: 'error', error: `Claude Network Error: ${e.message}` }
    }
}

/**
 * Gemini Implementation
 */
async function* streamGeminiWithTools(
    apiKey: string,
    model: string,
    messages: AIMessage[],
    tools: any,
    options?: any
): AsyncGenerator<StreamChunk, void, unknown> {
    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            if (m.role === 'user')
                return { role: 'user', parts: [{ text: m.content || '' }] }
            if (m.role === 'tool') {
                return {
                    role: 'function',
                    parts: [
                        {
                            functionResponse: {
                                name: 'tool', // Gemini requires name matches call? placeholder
                                response: { content: m.content },
                            },
                        },
                    ],
                }
            }
            if (m.role === 'assistant') {
                const parts: any[] = []
                if (m.content) parts.push({ text: m.content })
                const tcs = m.toolCalls || m.tool_calls
                if (tcs) {
                    tcs.forEach((tc: any) => {
                        let args = tc.arguments
                        let name = tc.name
                        if (tc.function) {
                            name = tc.function.name
                            try {
                                args = JSON.parse(tc.function.arguments)
                            } catch {
                                args = {}
                            }
                        }
                        parts.push({ functionCall: { name, args } })
                    })
                }
                return { role: 'model', parts }
            }
            return { role: 'user', parts: [{ text: '' }] }
        })

    const requestBody = {
        contents,
        tools: tools
            ? [{ function_declarations: tools.function_declarations }]
            : undefined,
        systemInstruction: messages.find((m) => m.role === 'system')?.content
            ? {
                  parts: [
                      {
                          text: messages.find((m) => m.role === 'system')
                              ?.content,
                      },
                  ],
              }
            : undefined,
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: options?.signal,
            }
        )

        if (!response.ok) {
            yield {
                type: 'error',
                error: `Gemini API Error: ${await response.text()}`,
            }
            return
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        if (!reader) return
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const cleanBuffer = buffer
                .replace(/^\[/, '')
                .replace(/,$/, '')
                .replace(/\]$/, '')
            if (!cleanBuffer.trim()) continue
            try {
                const chunkData = JSON.parse(cleanBuffer)
                buffer = ''
                const candidate = chunkData.candidates?.[0]
                if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.text)
                            yield { type: 'text', content: part.text }
                        if (part.functionCall) {
                            const callId = `call_${part.functionCall.name}_${Date.now()}`
                            yield {
                                type: 'tool_call_start',
                                toolCall: {
                                    id: callId,
                                    name: part.functionCall.name,
                                    arguments: {},
                                },
                            }
                            yield {
                                type: 'tool_call',
                                toolCall: {
                                    id: callId,
                                    name: part.functionCall.name,
                                    arguments: part.functionCall.args || {},
                                },
                            }
                        }
                    }
                }
            } catch {
                yield {
                    type: 'error',
                    error: 'Failed to parse Gemini stream chunk.',
                }
            }
        }
    } catch (e: any) {
        yield { type: 'error', error: `Gemini Network Error: ${e.message}` }
    }
}
