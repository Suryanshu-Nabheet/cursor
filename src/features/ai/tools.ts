/**
 * AI Tools System - Professional-Grade IDE Integration
 * Enables AI to interact with the codebase, terminal, and file system
 */

export interface AITool {
    name: string
    description: string
    parameters: {
        type: 'object'
        properties: Record<
            string,
            {
                type: string
                description: string
                enum?: string[]
            }
        >
        required: string[]
    }
}

const pathJoin = (...args: string[]) => {
    return args
        .map((part, i) => {
            if (i === 0) {
                return part.trim().replace(/[/]*$/g, '')
            } else {
                return part.trim().replace(/(^[/]*|[/]*$)/g, '')
            }
        })
        .filter((x) => x.length)
        .join('/')
}

export interface ToolCall {
    id: string
    name: string
    arguments: Record<string, any>
}

export interface ToolResult {
    id: string
    name: string
    result: string
    success: boolean
    error?: string
}

interface CommandResult {
    output: string
    exitCode: number | null
}

const MAX_TOOL_OUTPUT_CHARS = 80_000
const ANSI_ESCAPE_PATTERN = new RegExp(
    `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
    'g'
)

// ============================================
// TOOL DEFINITIONS
// ============================================

export const AI_TOOLS: AITool[] = [
    {
        name: 'read_file',
        description:
            'Read the complete contents of a file. ALWAYS use this before editing a file to understand the current implementation and get exact text for replacements. Essential for understanding context and avoiding errors.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Relative path to the file from workspace root (e.g., "src/components/Button.tsx")',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'write_file',
        description:
            'Create a new file with complete content. Use this for new files only. Write COMPLETE, production-ready code - never use placeholders like "// rest of code here" or "// implementation". The file will be created immediately without approval.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Relative path to the file from workspace root',
                },
                content: {
                    type: 'string',
                    description:
                        'Complete file content. Must be fully implemented, working code with no placeholders.',
                },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'edit_file',
        description:
            'Edit an existing file by replacing exact text. CRITICAL: You MUST read the file first with read_file to get the exact content. The oldText parameter must match EXACTLY (including whitespace, indentation, line breaks). This is for surgical edits to existing code.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Relative path to the file from workspace root',
                },
                oldText: {
                    type: 'string',
                    description:
                        'EXACT text to find and replace. Must match character-for-character including all whitespace. Read the file first to get this exactly right.',
                },
                newText: {
                    type: 'string',
                    description:
                        'New text to replace the old text with. Write complete, working code.',
                },
            },
            required: ['path', 'oldText', 'newText'],
        },
    },
    {
        name: 'list_files',
        description:
            'List all files and directories in a given directory. Use this to explore the codebase structure.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Relative path to directory from workspace root (use "." for root)',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'create_directory',
        description: 'Create a new directory in the workspace.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the directory to create',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'delete_file',
        description: 'Delete a file from the workspace. Use with caution!',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file to delete',
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'run_terminal_command',
        description:
            'Execute a command in the integrated terminal. Use this to run builds, tests, install packages, etc.',
        parameters: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description:
                        'The command to execute (e.g., "npm install", "npm run build")',
                },
            },
            required: ['command'],
        },
    },
    {
        name: 'search_code',
        description:
            'Search for text across all files in the workspace using ripgrep. Great for finding function definitions, imports, etc.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Text to search for',
                },
                filePattern: {
                    type: 'string',
                    description:
                        'Optional glob pattern to filter files (e.g., "*.ts", "src/**/*.tsx")',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'open_file',
        description:
            'Open a file in the editor at a specific line. Useful for showing the user where changes were made.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Relative path to the file to open',
                },
                line: {
                    type: 'string',
                    description: 'Line number to jump to (optional)',
                },
            },
            required: ['path'],
        },
    },
]

// ============================================
// TOOL EXECUTION
// ============================================

export async function executeToolCall(
    toolCall: ToolCall,
    rootPath: string,
    dispatch?: any,
    actions?: any,
    options?: { signal?: AbortSignal }
): Promise<ToolResult> {
    try {
        const result = await executeTool(
            toolCall.name,
            toolCall.arguments,
            rootPath,
            dispatch,
            actions,
            options
        )
        return {
            id: toolCall.id,
            name: toolCall.name,
            result,
            success: true,
        }
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown error'
        return {
            id: toolCall.id,
            name: toolCall.name,
            result: `Error: ${errorMessage}`,
            success: false,
            error: errorMessage,
        }
    }
}

async function runCommandCaptured(
    connector: any,
    command: string,
    rootPath: string,
    signal?: AbortSignal
): Promise<CommandResult> {
    // 1. Create a transient terminal
    const response = await connector.terminalCreate(
        80,
        24,
        rootPath,
        '/bin/zsh'
    )
    const termId = response.id

    return new Promise((resolve, reject) => {
        let output = ''
        let isResolved = false
        let startupTimer: ReturnType<typeof setTimeout> | null = null

        const cleanup = () => {
            if (startupTimer) clearTimeout(startupTimer)
            connector.deregisterIncData(onData)
            connector.deregisterTerminalExited(onExit)
            signal?.removeEventListener('abort', onAbort)
            // Check if it's still alive?
            connector.terminalKill(termId).catch(() => {})
        }

        const settleAbort = () => {
            if (isResolved) return
            isResolved = true
            const cleanOutput = output.replace(ANSI_ESCAPE_PATTERN, '')
            cleanup()
            reject(
                new Error(
                    `Command aborted by user.\n${cleanOutput}`.trim()
                )
            )
        }

        const onAbort = () => settleAbort()

        const onData = (_event: any, data: { id: string; data: string }) => {
            if (data.id === termId) {
                output += data.data
            }
        }

        const onExit = (
            _event: any,
            data: { id: string; exitCode: number }
        ) => {
            if (data.id === termId && !isResolved) {
                isResolved = true
                cleanup()
                // Strip Ansi codes if possible, or just return raw
                // eslint-disable-next-line no-control-regex
                const cleanOutput = output.replace(ANSI_ESCAPE_PATTERN, '')
                const truncated =
                    cleanOutput.length > MAX_TOOL_OUTPUT_CHARS
                        ? `${cleanOutput.slice(-MAX_TOOL_OUTPUT_CHARS)}\n[Output truncated to last ${MAX_TOOL_OUTPUT_CHARS} characters]`
                        : cleanOutput
                resolve({
                    output: `${truncated}\n[exit code: ${data.exitCode}]`,
                    exitCode: data.exitCode,
                })
            }
        }

        if (signal?.aborted) {
            settleAbort()
            return
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        connector.registerIncData(onData)
        connector.registerTerminalExited(onExit)

        // Wait slightly for init
        startupTimer = setTimeout(() => {
            // Run command then exit to close the terminal and trigger onExit
            connector.terminalInto(termId, `${command}; exit\n`).catch((error: any) => {
                if (isResolved) return
                isResolved = true
                cleanup()
                reject(error)
            })
        }, 50)
    })
}

async function executeTool(
    name: string,
    args: Record<string, any>,
    rootPath: string,
    dispatch?: any,
    actions?: any,
    options?: { signal?: AbortSignal }
): Promise<string> {
    // @ts-ignore
    const connector = window.connector

    switch (name) {
        case 'read_file': {
            const fullPath = pathJoin(rootPath, args.path)
            const content = await connector.getFile(fullPath)
            if (content === null || content === undefined) {
                throw new Error(`Could not read file ${args.path}`)
            }
            return `File: ${args.path}\n\`\`\`\n${content}\n\`\`\``
        }

        case 'write_file': {
            const fullPath = pathJoin(rootPath, args.path)

            // 1. Create empty file first (so it exists)
            await connector.saveFile(fullPath, '')

            // 2. Open it in the editor
            if (dispatch && actions?.openFile) {
                try {
                    await dispatch(actions.openFile({ filePath: fullPath }))
                } catch (e) {
                    /* ignore */
                }
            }

            // 3. Write the actual content (this updates the view)
            await connector.saveFile(fullPath, args.content)

            // Force update UI
            if (dispatch && actions?.fileWasUpdated) {
                await dispatch(actions.fileWasUpdated(fullPath))
            }

            // 4. Return success
            return `✓ Created and wrote to ${args.path}`
        }

        case 'edit_file': {
            const fullPath = pathJoin(rootPath, args.path)
            const content = await connector.getFile(fullPath)

            if (!content) {
                throw new Error(
                    `File ${args.path} either does not exist or is empty`
                )
            }

            if (!content.includes(args.oldText)) {
                // Simple fuzzy matching or fallback?
                // For now, strict check, but give helpful error
                throw new Error(
                    `Could not find the specified text in ${args.path}. Please read the file again to ensure you have the exact content.`
                )
            }

            const newContent = content.replace(args.oldText, args.newText)
            await connector.saveFile(fullPath, newContent)

            // Force update UI
            if (dispatch && actions?.fileWasUpdated) {
                await dispatch(actions.fileWasUpdated(fullPath))
            }

            return `✓ Successfully edited ${args.path}`
        }

        case 'list_files': {
            const fullPath = pathJoin(rootPath, args.path)
            const { files, folders } = await connector.getFolder(
                fullPath,
                [],
                1,
                []
            )

            let output = `Listing for ${args.path}:\n`
            output += Object.values(folders)
                .map((f: any) => `[DIR]  ${f.name}/`)
                .join('\n')
            output += '\n'
            output += Object.values(files)
                .map((f: any) => `[FILE] ${f.name}`)
                .join('\n')

            return output
        }

        case 'create_directory': {
            const fullPath = pathJoin(rootPath, args.path)
            await connector.saveFolder(fullPath)
            return `✓ Created directory ${args.path}`
        }

        case 'delete_file': {
            const fullPath = pathJoin(rootPath, args.path)
            await connector.deleteFile(fullPath)
            return `✓ Deleted ${args.path}`
        }

        case 'run_terminal_command': {
            // Use Headless capture
            const output = await runCommandCaptured(
                connector,
                args.command,
                rootPath,
                options?.signal
            )
            const formatted = `Command: ${args.command}\n\nOutput:\n\`\`\`\n${output.output}\n\`\`\``
            if (output.exitCode !== 0) {
                throw new Error(formatted)
            }
            return formatted
        }

        case 'search_code': {
            const results = await connector.searchRipGrep({
                query: args.query,
                rootPath,
                badPaths: [],
                caseSensitive: false,
                // filePattern is not supported by current searchRipGrep interface in preload
                // but we can filter results manually if needed or ignore it.
                // Re-checking preload: searchRipGrep signature doesn't take filePattern.
            })

            // results is an array of strings (JSON)
            if (results.length === 0) {
                return `No results found for "${args.query}"`
            }

            const formatted = results
                .slice(0, 20)
                .map((r: string) => {
                    try {
                        const parsed = JSON.parse(r)
                        if (parsed.type === 'match') {
                            return `${parsed.data.path.text}:${
                                parsed.data.line_number
                            }: ${parsed.data.lines.text.trim()}`
                        }
                        return ''
                    } catch (e) {
                        return ''
                    }
                })
                .filter(Boolean)
                .join('\n')

            return `Search results for "${args.query}":\n${formatted}`
        }

        case 'open_file': {
            const fullPath = pathJoin(rootPath, args.path)
            if (dispatch && actions?.openFile) {
                try {
                    await dispatch(actions.openFile({ filePath: fullPath }))
                } catch (e) {
                    return `Error opening file: ${e}`
                }
            }
            return `✓ Opened ${args.path}`
        }

        default:
            throw new Error(`Unknown tool: ${name}`)
    }
}

// ============================================
// SYSTEM PROMPT
// ============================================

import { AI_SYSTEM_PROMPT } from './prompt'
export { AI_SYSTEM_PROMPT }

// End of file
