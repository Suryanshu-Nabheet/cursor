import * as cp from 'child_process'
import { IpcMainInvokeEvent, ipcMain } from 'electron'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import { PLATFORM_INFO, rgLoc } from './utils'

// Helper to check if rg exists
const hasRg = fs.existsSync(rgLoc)

const searchRipGrep = async (
    event: IpcMainInvokeEvent,
    arg: {
        query: string
        rootPath: string
        badPaths: string[]
        caseSensitive: boolean
        matchWholeWord?: boolean
        useRegex?: boolean
    }
) => {
    if (hasRg) {
        return searchWithRg(arg)
    } else {
        return searchWithGrep(arg)
    }
}

const searchWithRg = async (arg: any) => {
    const cmd = ['--json', '--line-number', '--with-filename', '--sort-files']
    if (arg.caseSensitive) {
        cmd.push('--case-sensitive')
    } else {
        cmd.push('-i')
    }
    if (!arg.useRegex) {
        cmd.push('--fixed-strings')
    }
    if (arg.matchWholeWord) {
        cmd.push('--word-regexp')
    }

    for (const badPath of arg.badPaths) {
        cmd.push('--ignore-file', badPath)
    }

    cmd.push(arg.query, arg.rootPath)
    const childProcess = cp.spawn(rgLoc, cmd)

    const rawData: string[] = []
    let overflowBuffer = ''

    const trimLines = (lines: string) => {
        lines = overflowBuffer + lines
        overflowBuffer = ''

        return lines
            .trim()
            .split('\n')
            .filter((match) => {
                try {
                    const data = JSON.parse(match)
                    if (data.type === 'match') {
                        return match
                    }
                } catch (e: any) {
                    overflowBuffer += match
                }
            })
    }

    childProcess.stdout.on('data', (chunk) => {
        rawData.push(...(trimLines(chunk.toString()) || []))
        if (rawData.length > 500) {
            childProcess.kill()
        }
    })

    await new Promise((resolve) => {
        childProcess.on('close', (code) => {
            resolve(code)
        })
    })

    return rawData
}

const searchWithGrep = async (arg: any) => {
    // Fallback to grep
    // grep -rnI "query" rootPath
    const cmdArgs = ['-rnI'] // recursive, line-number, binary-files=without-match
    if (!arg.caseSensitive) {
        cmdArgs.push('-i')
    }
    if (!arg.useRegex) {
        cmdArgs.push('-F')
    }
    if (arg.matchWholeWord) {
        cmdArgs.push('-w')
    }
    // Exclude .git and node_modules
    cmdArgs.push(
        '--exclude-dir=.git',
        '--exclude-dir=node_modules',
        '--exclude-dir=.webpack'
    )

    // Explicitly add user provided bad paths
    // Explicitly add user provided bad paths
    for (const badPath of arg.badPaths) {
        cmdArgs.push(`--exclude-dir=${path.basename(badPath)}`)
    }

    if (!arg.rootPath) {
        return []
    }

    // Use -- to separate flags from query/path
    cmdArgs.push('--', arg.query, arg.rootPath)

    // Using spawn to stream results
    // Try adding --line-buffered if available, but be careful with BSD/GNU diffs
    // macOS (BSD) supports --line-buffered
    if (process.platform === 'darwin' || process.platform === 'linux') {
        cmdArgs.unshift('--line-buffered')
    }

    const childProcess = cp.spawn('grep', cmdArgs)
    const rawData: string[] = []

    // Buffer for handling partial lines
    let buffer = ''

    childProcess.stdout.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep the last partial line

        for (const line of lines) {
            if (rawData.length > 500) {
                childProcess.kill()
                break
            }

            // Parse grep output: path:line:content
            // Note: path might contain colons, so limit split
            // Implementation details: grep outputs "file:line:content"
            const parts = line.split(':')
            if (parts.length < 3) continue

            // Reconstruct path (parts[0]) and content (rest)
            // But simpler strategy:
            // path is everything up to the first colon followed by a number

            // A safer regex to parse grep output: ^(.*?):(\d+):(.*)$
            const match = line.match(/^(.*?):(\d+):(.*)$/)
            if (match) {
                const [_, filePath, lineNumStr, content] = match
                const lineNum = parseInt(lineNumStr, 10)

                // Construct pseudo-ripgrep JSON
                const matchIndex = arg.caseSensitive
                    ? content.indexOf(arg.query)
                    : content.toLowerCase().indexOf(arg.query.toLowerCase())

                if (matchIndex === -1) continue

                const jsonResult = {
                    type: 'match',
                    data: {
                        path: { text: filePath },
                        lines: { text: content },
                        line_number: lineNum,
                        absolute_offset: 0, // Not easily available, mocking
                        submatches: [
                            {
                                match: { text: arg.query }, // Approximation
                                start: matchIndex,
                                end: matchIndex + arg.query.length,
                            },
                        ],
                    },
                }
                rawData.push(JSON.stringify(jsonResult))
            }
        }
    })

    await new Promise((resolve) => {
        childProcess.on('close', (code) => {
            resolve(code)
        })
        childProcess.on('error', (_err) => {
            resolve(1)
        })
        if (childProcess.stderr) {
            childProcess.stderr.on('data', (_data) => {
                // Grep stderr - silent
            })
        }
    })

    return rawData
}

const customDebounce = (func: any, wait = 0) => {
    let timeout: any
    let lastCall = 0

    return (...args: any[]) => {
        const now = Date.now()
        if (now - lastCall < wait) {
            clearTimeout(timeout)
            return new Promise((resolve) => {
                timeout = setTimeout(() => {
                    lastCall = now
                    const out = func(...args)
                    return resolve(out)
                }, wait)
            })
        } else {
            lastCall = now
            return func(...args)
        }
    }
}

const searchFilesName = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    // Robust find command
    // Use 'find' on unix, fallback to basic recursive search if needed
    // But find is standard on Mac/Linux

    // Construct command to exclude standard ignored dirs
    const excludes = "-not -path '*/.*' -not -path '*/node_modules/*'"
    const cmd = `find "${rootPath}" ${excludes} -type f -iname "*${query}*" | head -n ${topResults}`

    try {
        const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
        return stdout
            .split('\n')
            .map((s: string) => {
                // Ensure paths are relative if they start with rootPath
                if (s.startsWith(rootPath)) {
                    return path.relative(rootPath, s)
                }
                return s
            })
            .filter(Boolean)
    } catch (error) {
        // Search files failed
        return []
    }
}

const searchFilesPath = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    return searchFilesName(event, { query, rootPath, topResults })
}

const searchFilesPathGit = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    if (await doesCommandSucceed('git ls-files', rootPath)) {
        const cmd = `git ls-files | grep "${query}" | head -n ${topResults}`
        try {
            const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
            return stdout
                .split('\n')
                .map((l) => {
                    return l.replace(/\//g, PLATFORM_INFO.PLATFORM_DELIMITER)
                })
                .filter(Boolean)
        } catch (e) {
            // ignore errors
        }
    }
    return await searchFilesPath(event, { query, rootPath, topResults })
}

const doesCommandSucceed = async (cmd: string, rootPath: string) => {
    try {
        await promisify(cp.exec)(cmd, { cwd: rootPath })
        return true
    } catch (e) {
        return false
    }
}

const searchFilesNameGit = async (
    event: IpcMainInvokeEvent,
    {
        query,
        rootPath,
        topResults = 50,
    }: {
        query: string
        rootPath: string
        topResults?: number
    }
) => {
    if (await doesCommandSucceed('git ls-files', rootPath)) {
        // Safe grep to avoid hanging on large outputs
        const cmd = `git ls-files | grep -i "${query}" | grep -v "^node_modules/" | head -n ${topResults}`
        try {
            const { stdout } = await promisify(cp.exec)(cmd, { cwd: rootPath })
            return stdout
                .split('\n')
                .map((l) => {
                    return l.replace(/\//g, PLATFORM_INFO.PLATFORM_DELIMITER)
                })
                .filter(Boolean)
        } catch (e) {
            // ignore
        }
    }
    return await searchFilesName(event, { query, rootPath, topResults })
}

export const setupSearch = () => {
    ipcMain.handle('searchRipGrep', customDebounce(searchRipGrep))
    ipcMain.handle('searchFilesName', customDebounce(searchFilesName))
    ipcMain.handle('searchFilesPath', customDebounce(searchFilesPath))
    ipcMain.handle('searchFilesPathGit', customDebounce(searchFilesPathGit))
    ipcMain.handle('searchFilesNameGit', customDebounce(searchFilesNameGit))
}
