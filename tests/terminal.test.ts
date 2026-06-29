import os from 'os'
import {
    clampTerminalSize,
    isAllowedShell,
    isSafeTerminalUrl,
    resolveTerminalCwd,
} from '../src/main/terminalUtils'

describe('terminal validation helpers', () => {
    it('clamps terminal dimensions to safe bounds', () => {
        expect(clampTerminalSize(1, 999)).toEqual({ cols: 20, rows: 120 })
        expect(clampTerminalSize('120', '40')).toEqual({
            cols: 120,
            rows: 40,
        })
        expect(clampTerminalSize('bad', null)).toEqual({ cols: 80, rows: 5 })
    })

    it('accepts only safe terminal link schemes', () => {
        expect(isSafeTerminalUrl('https://example.com')).toBe(true)
        expect(isSafeTerminalUrl('http://example.com')).toBe(true)
        expect(isSafeTerminalUrl('mailto:hello@example.com')).toBe(true)
        expect(isSafeTerminalUrl('file:///etc/passwd')).toBe(false)
        expect(isSafeTerminalUrl('javascript:alert(1)')).toBe(false)
    })

    it('falls back to home for invalid working directories', () => {
        expect(resolveTerminalCwd('/definitely/not/a/real/path')).toBe(
            os.homedir()
        )
    })

    it('allows shells by basename only', () => {
        expect(isAllowedShell('/bin/zsh', ['zsh', 'bash'])).toBe(true)
        expect(isAllowedShell('bash', ['zsh', 'bash'])).toBe(true)
        expect(isAllowedShell('/tmp/not-allowed', ['zsh', 'bash'])).toBe(false)
    })
})
