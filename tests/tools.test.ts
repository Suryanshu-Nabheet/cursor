import { executeToolCall } from '../src/features/ai/tools'

describe('AI tool execution', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete (global as any).window
    })

    it('marks terminal commands with non-zero exit codes as failed', async () => {
        let onExit: ((_event: unknown, data: { id: string; exitCode: number }) => void) | null = null

        ;(global as any).window = {
            connector: {
                terminalCreate: jest.fn(async () => ({ id: 'term-1' })),
                registerIncData: jest.fn(),
                deregisterIncData: jest.fn(),
                registerTerminalExited: jest.fn((callback) => {
                    onExit = callback
                }),
                deregisterTerminalExited: jest.fn(),
                terminalKill: jest.fn(async () => undefined),
                terminalInto: jest.fn(async () => {
                    onExit?.(null, { id: 'term-1', exitCode: 1 })
                }),
            },
        }

        const result = await executeToolCall(
            {
                id: 'call-1',
                name: 'run_terminal_command',
                arguments: { command: 'npm test' },
            },
            '/workspace'
        )

        expect(result.success).toBe(false)
        expect(result.result).toContain('[exit code: 1]')
    })
})
