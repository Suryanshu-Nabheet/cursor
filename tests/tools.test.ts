import {
    executeToolCall,
    isExternalPathAction,
    isRiskyTerminalCommand,
} from '../src/features/ai/tools'

describe('AI tool execution', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        delete (global as any).window
    })

    it('marks terminal commands with non-zero exit codes as failed', async () => {
        let onExit:
            | ((
                  _event: unknown,
                  data: { id: string; exitCode: number }
              ) => void)
            | null = null

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

    describe('workspace boundary guard (isExternalPathAction)', () => {
        const root = '/Users/test/project'

        it('identifies internal relative and absolute paths as non-external', () => {
            expect(
                isExternalPathAction(root, {
                    name: 'write_file',
                    arguments: { path: 'src/index.ts' },
                })
            ).toBe(false)

            expect(
                isExternalPathAction(root, {
                    name: 'read_file',
                    arguments: { path: '/Users/test/project/package.json' },
                })
            ).toBe(false)
        })

        it('flags paths outside workspace or targeting root/system as external', () => {
            expect(
                isExternalPathAction(root, {
                    name: 'write_file',
                    arguments: { path: '/etc/hosts' },
                })
            ).toBe(true)

            expect(
                isExternalPathAction(root, {
                    name: 'delete_file',
                    arguments: { path: '../../other-project/secret.key' },
                })
            ).toBe(true)

            expect(
                isExternalPathAction(root, {
                    name: 'edit_file',
                    arguments: { path: '/Users/test/other/file.ts' },
                })
            ).toBe(true)
        })

        it('flags actions when workspace root is empty/unset', () => {
            expect(
                isExternalPathAction('', {
                    name: 'read_file',
                    arguments: { path: 'file.txt' },
                })
            ).toBe(true)
        })
    })

    describe('risky terminal command detection (isRiskyTerminalCommand)', () => {
        it('allows normal development commands', () => {
            expect(isRiskyTerminalCommand('npm test')).toBe(false)
            expect(isRiskyTerminalCommand('git status')).toBe(false)
            expect(isRiskyTerminalCommand('cargo build --release')).toBe(false)
            expect(isRiskyTerminalCommand('ls -la src/')).toBe(false)
        })

        it('flags dangerous commands targeting root or system destruction', () => {
            expect(isRiskyTerminalCommand('rm -rf /')).toBe(true)
            expect(isRiskyTerminalCommand('rm -rf /*')).toBe(true)
            expect(isRiskyTerminalCommand('sudo rm -rf /etc')).toBe(true)
            expect(isRiskyTerminalCommand('mkfs.ext4 /dev/sda1')).toBe(true)
            expect(isRiskyTerminalCommand('chmod -R 777 /')).toBe(true)
            expect(isRiskyTerminalCommand('dd if=/dev/zero of=/dev/sda')).toBe(
                true
            )
            expect(isRiskyTerminalCommand(':(){ :|:& };:')).toBe(true)
        })
    })
})
