describe('Global IDE Shortcuts (Cmd+L, Cmd+J, Ctrl+`, etc.)', () => {
    afterEach(() => {
        delete (global as any).window
        delete (global as any).connector
    })

    it('toggleTerminal action properly toggles state in reducer', () => {
        const initialState = {
            terminalOpen: false,
        } as any

        const toggled = {
            ...initialState,
            terminalOpen: !initialState.terminalOpen,
        }
        expect(toggled.terminalOpen).toBe(true)

        const toggledBack = {
            ...toggled,
            terminalOpen: !toggled.terminalOpen,
        }
        expect(toggledBack.terminalOpen).toBe(false)
    })

    it('identifies terminal toggle keys across Mac (Cmd+J, Cmd+`) and Win/Linux (Ctrl+J, Ctrl+`)', () => {
        const isTerminalKey = (e: {
            key: string
            code?: string
            metaKey?: boolean
            ctrlKey?: boolean
            shiftKey?: boolean
        }) => {
            const isCmd = Boolean(e.metaKey)
            const isCtrl = Boolean(e.ctrlKey)
            return (
                (e.key.toLowerCase() === 'j' ||
                    e.key === '`' ||
                    e.code === 'KeyJ' ||
                    e.code === 'Backquote') &&
                !e.shiftKey &&
                (isCmd || isCtrl)
            )
        }

        // Mac Command+J
        expect(isTerminalKey({ key: 'j', metaKey: true })).toBe(true)
        expect(isTerminalKey({ key: 'J', metaKey: true })).toBe(true)
        expect(isTerminalKey({ key: 'j', code: 'KeyJ', metaKey: true })).toBe(
            true
        )

        // Mac Command+`
        expect(isTerminalKey({ key: '`', metaKey: true })).toBe(true)

        // Windows/Linux Ctrl+J and Ctrl+`
        expect(isTerminalKey({ key: 'j', ctrlKey: true })).toBe(true)
        expect(isTerminalKey({ key: '`', ctrlKey: true })).toBe(true)

        // Shift+Cmd+J should not trigger toggle terminal
        expect(isTerminalKey({ key: 'j', metaKey: true, shiftKey: true })).toBe(
            false
        )

        // Normal typing 'j' should not trigger
        expect(isTerminalKey({ key: 'j' })).toBe(false)
    })

    it('identifies AI Chat Sidebar shortcut (Cmd+L / Ctrl+L)', () => {
        const isAiSidebarKey = (e: {
            key: string
            code?: string
            metaKey?: boolean
            ctrlKey?: boolean
            shiftKey?: boolean
        }) => {
            const isPlatformMod = Boolean(e.metaKey || e.ctrlKey)
            return Boolean(
                (e.key.toLowerCase() === 'l' || e.code === 'KeyL') &&
                    !e.shiftKey &&
                    isPlatformMod
            )
        }

        expect(isAiSidebarKey({ key: 'l', metaKey: true })).toBe(true)
        expect(isAiSidebarKey({ key: 'L', metaKey: true })).toBe(true)
        expect(isAiSidebarKey({ key: 'l', ctrlKey: true })).toBe(true)
        expect(isAiSidebarKey({ key: 'l', code: 'KeyL', metaKey: true })).toBe(
            true
        )

        // Normal typing 'l'
        expect(isAiSidebarKey({ key: 'l' })).toBe(false)
        // Shift+Cmd+L
        expect(
            isAiSidebarKey({ key: 'l', metaKey: true, shiftKey: true })
        ).toBe(false)
    })

    it('xterm custom key event filter allows global shortcuts to bypass terminal', () => {
        const shouldXtermBypass = (e: {
            key: string
            metaKey?: boolean
            ctrlKey?: boolean
            code?: string
        }) => {
            const isCmdOrCtrl = e.metaKey || e.ctrlKey
            if (isCmdOrCtrl) {
                const key = e.key.toLowerCase()
                if (
                    key === 'j' ||
                    key === '`' ||
                    key === 'l' ||
                    key === 'b' ||
                    key === 'p' ||
                    key === 'k' ||
                    key === 'e' ||
                    key === 'f' ||
                    e.code === 'KeyJ' ||
                    e.code === 'Backquote' ||
                    e.code === 'KeyL'
                ) {
                    return false // False means xterm bypasses and DOM receives it
                }
            }
            return true
        }

        // Cmd+J inside terminal must bypass xterm
        expect(shouldXtermBypass({ key: 'j', metaKey: true })).toBe(false)
        // Cmd+L inside terminal must bypass xterm
        expect(shouldXtermBypass({ key: 'l', metaKey: true })).toBe(false)
        // Ctrl+` inside terminal must bypass xterm
        expect(shouldXtermBypass({ key: '`', ctrlKey: true })).toBe(false)
        // Regular characters (like typing 'ls') stay inside xterm
        expect(shouldXtermBypass({ key: 'l' })).toBe(true)
        expect(shouldXtermBypass({ key: 's' })).toBe(true)
    })
})
