import {
    StreamChunk,
    streamAIResponseWithTools,
    extractJsonToolCalls,
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

    describe('extractJsonToolCalls parser & text cleaner', () => {
        it('extracts write_file tool call from fenced JSON and cleans message text', () => {
            const modelOutput = `I will create the portfolio website for you now.

\`\`\`json
{
  "name": "write_file",
  "arguments": {
    "path": "index.html",
    "content": "<!DOCTYPE html>\\n<html lang=\\"en\\">\\n<head><title>Portfolio</title></head>\\n<body><h1>Hello</h1></body>\\n</html>"
  }
}
\`\`\`

Let me know if you need any adjustments!`

            const { cleanText, toolCalls } = extractJsonToolCalls(modelOutput)

            expect(toolCalls).toHaveLength(1)
            expect(toolCalls[0].name).toBe('write_file')
            expect(toolCalls[0].arguments.path).toBe('index.html')
            expect(toolCalls[0].arguments.content).toContain('<!DOCTYPE html>')
            expect(cleanText).not.toContain('write_file')
            expect(cleanText).not.toContain('```json')
            expect(cleanText).toContain('I will create the portfolio website for you now.')
        })

        it('extracts raw unfenced JSON tool call and returns empty cleanText when no other prose exists', () => {
            const rawJson = `{
  "name": "write_file",
  "arguments": {
    "path": "index.html",
    "content": "<!DOCTYPE html><html><body><h1>Portfolio</h1></body></html>"
  }
}`

            const { cleanText, toolCalls } = extractJsonToolCalls(rawJson)

            expect(toolCalls).toHaveLength(1)
            expect(toolCalls[0].name).toBe('write_file')
            expect(toolCalls[0].arguments.path).toBe('index.html')
            expect(cleanText).toBe('')
        })

        it('handles unescaped HTML content with newlines and quotes in write_file', () => {
            const modelOutput = `{
  "name": "write_file",
  "arguments": {
    "path": "index.html",
    "content": "<!DOCTYPE html>
<html lang="en">
<body>
  <h1>Portfolio</h1>
</body>
</html>"
  }
}`

            const { toolCalls } = extractJsonToolCalls(modelOutput)

            expect(toolCalls).toHaveLength(1)
            expect(toolCalls[0].name).toBe('write_file')
            expect(toolCalls[0].arguments.path).toBe('index.html')
            expect(toolCalls[0].arguments.content).toContain('<h1>Portfolio</h1>')
        })

        it('extracts multiple sequential tool calls from output', () => {
            const output = `\`\`\`json
{"name": "read_file", "arguments": {"path": "package.json"}}
\`\`\`
\`\`\`json
{"name": "list_files", "arguments": {"path": "src"}}
\`\`\``

            const { toolCalls, cleanText } = extractJsonToolCalls(output)

            expect(toolCalls).toHaveLength(2)
            expect(toolCalls[0].name).toBe('read_file')
            expect(toolCalls[1].name).toBe('list_files')
            expect(cleanText).toBe('')
        })

        it('extracts write_file tool call with backtick multiline content', () => {
            const raw = '```json\n{\n  "name": "write_file",\n  "arguments": {\n    "path": "index.html",\n    "content": `<!DOCTYPE html>\n<html>\n<body><h1>Hello</h1></body>\n</html>`\n  }\n}\n```'

            const { toolCalls, cleanText } = extractJsonToolCalls(raw)

            expect(toolCalls).toHaveLength(1)
            expect(toolCalls[0].name).toBe('write_file')
            expect(toolCalls[0].arguments.path).toBe('index.html')
            expect(toolCalls[0].arguments.content).toContain('<h1>Hello</h1>')
            expect(cleanText).toBe('')
        })

        it('converts edit_file with content to write_file', () => {
            const raw = '```json\n{\n  "name": "edit_file",\n  "arguments": {\n    "path": "style.css",\n    "content": "body { margin: 0; }"\n  }\n}\n```'

            const { toolCalls } = extractJsonToolCalls(raw)

            expect(toolCalls).toHaveLength(1)
            expect(toolCalls[0].name).toBe('write_file')
            expect(toolCalls[0].arguments.path).toBe('style.css')
            expect(toolCalls[0].arguments.content).toBe('body { margin: 0; }')
        })
    })
})
