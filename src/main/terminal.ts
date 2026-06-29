import os from 'os'
import * as pty from 'node-pty'
import { ipcMain } from 'electron'
import log from 'electron-log'
import { randomUUID } from 'crypto'
import fs from 'fs'
import {
    clampTerminalSize,
    isAllowedShell,
    isSafeTerminalUrl,
    resolveTerminalCwd,
} from './terminalUtils'

const sessions = new Map<string, pty.IPty>()

/**
 * Sets up the integrated terminal with PTY support
 * @param mainWindow - The main Electron window
 * @param rootPath - Optional root path for terminal working directory
 */
export function setupTerminal(mainWindow: any, rootPath?: string) {
    if (mainWindow) {
        mainWindow.on('closed', () => {
            log.info('Window closed, killing all terminal sessions')
            sessions.forEach((proc, _id) => {
                try {
                    proc.kill()
                } catch (e) {
                    /* ignore */
                }
            })
            sessions.clear()
        })
    }
    log.info('Binding Terminal IPC handlers...')

    // Determine available shells based on platform
    const shells =
        os.platform() === 'win32'
            ? ['powershell.exe', 'cmd.exe']
            : ['zsh', 'bash', 'sh']

    // Filter environment variables
    const filteredEnv: { [key: string]: string } = Object.entries(
        process.env
    ).reduce((acc, [key, value]) => {
        if (typeof value === 'string') {
            acc[key] = value
        }
        return acc
    }, {} as { [key: string]: string })

    const createTerminal = (
        id: string,
        cols: number,
        rows: number,
        requestRootPath?: string,
        requestedShell?: string
    ) => {
        const cwd = resolveTerminalCwd(requestRootPath, rootPath)
        const size = clampTerminalSize(cols, rows)

        let shellToUse =
            requestedShell && isAllowedShell(requestedShell, shells)
                ? requestedShell
                : undefined

        if (!shellToUse) {
            for (const shell of shells) {
                try {
                    // On Unix systems, verify shell exists before spawning
                    if (process.platform !== 'win32') {
                        const result = require('child_process').execSync(
                            `command -v ${shell}`,
                            {
                                encoding: 'utf-8',
                            }
                        )
                        const foundPath = result.trim()
                        if (foundPath && fs.existsSync(foundPath)) {
                            shellToUse = foundPath
                            break
                        }
                    } else {
                        shellToUse = shell
                        break
                    }
                } catch (error) {
                    // continue
                }
            }
        }

        if (!shellToUse) {
            log.error('Failed to initialize terminal: no available shell found')
            return null
        }

        try {
            log.info(`Spawning terminal ${id} with shell ${shellToUse}`)
            const ptyProcess = pty.spawn(shellToUse, [], {
                name: 'xterm-256color',
                cols: size.cols,
                rows: size.rows,
                cwd,
                env: filteredEnv,
            })

            sessions.set(id, ptyProcess)

            ptyProcess.onData((data: string) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-incData', {
                        id,
                        data,
                    })
                }
            })

            ptyProcess.onExit((event) => {
                log.info(`Terminal ${id} exited with code ${event.exitCode}`)
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('terminal-exited', {
                        id,
                        exitCode: event.exitCode,
                    })
                }
                sessions.delete(id)
            })

            return shellToUse
        } catch (err) {
            log.error(`Failed to spawn terminal ${id}`, err)
            return null
        }
    }

    // --- IPC Handlers ---

    ipcMain.removeHandler('terminal-create')
    ipcMain.handle(
        'terminal-create',
        (event, { cols, rows, rootPath: reqRoot, shell }) => {
            const id = randomUUID()
            const usedShell = createTerminal(id, cols, rows, reqRoot, shell)
            if (usedShell) {
                return { id, shell: usedShell }
            } else {
                throw new Error('Could not create terminal')
            }
        }
    )

    ipcMain.removeHandler('terminal-into')
    ipcMain.handle('terminal-into', (_event, { id, data }) => {
        const term = sessions.get(id)
        if (term && typeof data === 'string') {
            term.write(data)
        } else {
            log.warn(`terminal-into: session ${id} not found`)
        }
    })

    ipcMain.removeHandler('terminal-resize')
    ipcMain.handle('terminal-resize', (_event, { id, cols, rows }) => {
        const term = sessions.get(id)
        if (term) {
            try {
                const size = clampTerminalSize(cols, rows)
                term.resize(size.cols, size.rows)
            } catch (error) {
                log.warn('Failed to resize terminal:', error)
            }
        }
    })

    ipcMain.removeHandler('terminal-kill')
    ipcMain.handle('terminal-kill', (_event, id) => {
        const term = sessions.get(id)
        if (term) {
            term.kill()
            sessions.delete(id)
        }
    })

    ipcMain.removeHandler('terminal-click-link')
    ipcMain.handle('terminal-click-link', (_event, url: string) => {
        if (!isSafeTerminalUrl(url)) {
            log.warn(`Blocked unsafe terminal URL: ${url}`)
            return false
        }
        require('electron').shell.openExternal(url)
        return true
    })
}
