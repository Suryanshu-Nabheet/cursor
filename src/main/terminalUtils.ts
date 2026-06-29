import fs from 'fs'
import os from 'os'
import path from 'path'

export const MIN_TERMINAL_COLS = 20
export const MAX_TERMINAL_COLS = 300
export const MIN_TERMINAL_ROWS = 5
export const MAX_TERMINAL_ROWS = 120

export function clampTerminalSize(cols: unknown, rows: unknown) {
    const normalize = (
        value: unknown,
        min: number,
        max: number,
        fallback: number
    ) => {
        const number = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(number)) return fallback
        return Math.max(min, Math.min(max, Math.round(number)))
    }

    return {
        cols: normalize(cols, MIN_TERMINAL_COLS, MAX_TERMINAL_COLS, 80),
        rows: normalize(rows, MIN_TERMINAL_ROWS, MAX_TERMINAL_ROWS, 24),
    }
}

export function resolveTerminalCwd(
    requestedRootPath?: string,
    fallbackRootPath?: string
) {
    const candidates = [requestedRootPath, fallbackRootPath, os.homedir()]
    for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'string') continue
        const resolved = path.resolve(candidate)
        try {
            if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
                return resolved
            }
        } catch {
            // Try the next candidate.
        }
    }
    return os.homedir()
}

export function isSafeTerminalUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl)
        return ['http:', 'https:', 'mailto:'].includes(url.protocol)
    } catch {
        return false
    }
}

export function isAllowedShell(requestedShell: string, allowedShells: string[]) {
    const requestedBaseName = path.basename(requestedShell).toLowerCase()
    return allowedShells.some(
        (shell) => path.basename(shell).toLowerCase() === requestedBaseName
    )
}
