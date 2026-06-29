import {
    StreamChunk,
    streamAIResponseWithTools,
} from '../src/features/ai/providersWithTools'

function sseChunk(payload: unknown) {
    return `data: ${JSON.stringify(payload)}\n\n`
}

function mockStreamingFetch(chunks: string[]) {
    const encoder = new TextEncoder()
    global.fetch = jest.fn(async () => {
        return {
            ok: true,
            body: new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(encoder.encode(chunk))
                    }
                    controller.close()
                },
            }),
        } as Response
    })
}

describe('tool streaming provider harness', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('repairs common malformed local-model tool arguments', async () => {
        mockStreamingFetch([
            sseChunk({
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'call_1',
                                    function: {
                                        name: 'read_file',
                                        arguments: '{"path":"src/index.ts',
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
            'data: [DONE]\n\n',
        ])

        const chunks: StreamChunk[] = []
        for await (const chunk of streamAIResponseWithTools(
            {
                provider: 'ollama',
                apiKey: 'ollama',
                defaultModel: 'qwen2.5-coder:1.5b',
                baseUrl: 'http://localhost:11434',
            },
            [{ role: 'user', content: 'read src/index.ts' }],
            {
                tools: [
                    {
                        name: 'read_file',
                        description: 'Read a file',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'File path' },
                            },
                            required: ['path'],
                        },
                    },
                ],
            }
        )) {
            chunks.push(chunk)
        }

        expect(chunks).toContainEqual({
            type: 'tool_call',
            toolCall: {
                id: 'call_1',
                name: 'read_file',
                arguments: { path: 'src/index.ts' },
            },
        })
    })

    it('emits an error for unrecoverable malformed tool arguments instead of leaving a pending tool', async () => {
        mockStreamingFetch([
            sseChunk({
                choices: [
                    {
                        delta: {
                            tool_calls: [
                                {
                                    index: 0,
                                    id: 'call_1',
                                    function: {
                                        name: 'read_file',
                                        arguments: '{"path":',
                                    },
                                },
                            ],
                        },
                    },
                ],
            }),
            'data: [DONE]\n\n',
        ])

        const chunks: StreamChunk[] = []
        for await (const chunk of streamAIResponseWithTools(
            {
                provider: 'ollama',
                apiKey: 'ollama',
                defaultModel: 'qwen2.5-coder:1.5b',
                baseUrl: 'http://localhost:11434',
            },
            [{ role: 'user', content: 'read src/index.ts' }],
            {
                tools: [
                    {
                        name: 'read_file',
                        description: 'Read a file',
                        parameters: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'File path' },
                            },
                            required: ['path'],
                        },
                    },
                ],
            }
        )) {
            chunks.push(chunk)
        }

        expect(chunks).toContainEqual({
            type: 'tool_call_start',
            toolCall: {
                id: 'call_1',
                name: 'read_file',
                arguments: {},
            },
        })
        expect(chunks).toContainEqual({
            type: 'error',
            error: 'Tool call "read_file" had invalid JSON arguments and could not be repaired.',
        })
    })
})
