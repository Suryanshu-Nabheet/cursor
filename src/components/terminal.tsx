import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
// @ts-ignore - xterm-addon-fit types issue
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { FullState } from '../features/window/state'
import * as gs from '../features/globalSlice'
import * as ssel from '../features/settings/settingsSelectors'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes, faChevronUp, faPlus, faTerminal } from '@fortawesome/free-solid-svg-icons'
import { throttleCallback } from './componentUtils'

interface TerminalSession {
    id: string
    label: string
    terminalInstance: Terminal | null
    fitAddon: FitAddon | null
    terminalId: string | null
    disposed: boolean
    exited: boolean
    containerRef: React.RefObject<HTMLDivElement>
    dataHandler: ((_: any, payload: { id: string; data: string }) => void) | null
    exitHandler: ((_: any, payload: { id: string; exitCode: number }) => void) | null
}

let sessionCounter = 1

function createSession(): Omit<TerminalSession, 'containerRef'> & { containerRef: React.RefObject<HTMLDivElement> } {
    return {
        id: `session-${Date.now()}-${sessionCounter}`,
        label: `bash ${sessionCounter++}`,
        terminalInstance: null,
        fitAddon: null,
        terminalId: null,
        disposed: false,
        exited: false,
        containerRef: React.createRef<HTMLDivElement>(),
        dataHandler: null,
        exitHandler: null,
    }
}

export const BottomTerminal: React.FC = () => {
    const dispatch = useAppDispatch()
    const isOpen = useAppSelector(
        (state: FullState) => state.global.terminalOpen
    )
    const rootPath = useAppSelector((state: FullState) => state.global.rootPath)
    const settings = useAppSelector(ssel.getSettings)
    const availableThemes = useAppSelector(
        (state: any) => state.extensionsState.availableThemes
    )

    const [sessions, setSessions] = useState<TerminalSession[]>(() => [createSession() as TerminalSession])
    const [activeSessionId, setActiveSessionId] = useState<string>(() => '')
    const sessionsRef = useRef<TerminalSession[]>([])

    const observerRef = useRef<ResizeObserver | null>(null)
    const [height, setHeight] = useState(300)
    const [isDragging, setIsDragging] = useState(false)
    const [isMaximized, setIsMaximized] = useState(false)

    // Keep ref in sync with state
    useEffect(() => {
        sessionsRef.current = sessions
        // Initialize activeSessionId if not set
        if (!activeSessionId && sessions.length > 0) {
            setActiveSessionId(sessions[0].id)
        }
    }, [sessions])

    const getActiveSession = useCallback(() => {
        return sessionsRef.current.find(s => s.id === activeSessionId) || null
    }, [activeSessionId])

    const getTerminalTheme = useCallback(() => {
        const getVar = (name: string, fallback: string) => {
            if (typeof document === 'undefined') return fallback
            return (
                getComputedStyle(document.documentElement)
                    .getPropertyValue(name)
                    .trim() || fallback
            )
        }
        return {
            background: getVar('--terminal-bg', '#000000'),
            foreground: getVar('--terminal-fg', '#e5e5e5'),
            cursor: getVar('--terminal-cursor', '#3b82f6'),
            selection: getVar('--terminal-selection', '#3b82f640'),
            black: getVar('--terminal-ansi-black', '#000000'),
            red: getVar('--terminal-ansi-red', '#cd3131'),
            green: getVar('--terminal-ansi-green', '#0dbc79'),
            yellow: getVar('--terminal-ansi-yellow', '#e5e510'),
            blue: getVar('--terminal-ansi-blue', '#2472c8'),
            magenta: getVar('--terminal-ansi-magenta', '#bc3fbc'),
            cyan: getVar('--terminal-ansi-cyan', '#11a8cd'),
            white: getVar('--terminal-ansi-white', '#e5e5e5'),
            brightBlack: getVar('--terminal-ansi-bright-black', '#666666'),
            brightRed: getVar('--terminal-ansi-bright-red', '#f14c4c'),
            brightGreen: getVar('--terminal-ansi-bright-green', '#23d18b'),
            brightYellow: getVar('--terminal-ansi-bright-yellow', '#f5f543'),
            brightBlue: getVar('--terminal-ansi-bright-blue', '#3b8eea'),
            brightMagenta: getVar('--terminal-ansi-bright-magenta', '#d670d6'),
            brightCyan: getVar('--terminal-ansi-bright-cyan', '#29b8db'),
            brightWhite: getVar('--terminal-ansi-bright-white', '#e5e5e5'),
        }
    }, [])

    const fitSession = useCallback((session: TerminalSession) => {
        if (!session.fitAddon || !session.containerRef.current || !isOpen) return
        try {
            session.fitAddon.fit()
            const dims = session.fitAddon.proposeDimensions()
            if (dims && dims.cols > 0 && dims.rows > 0 && session.terminalId) {
                connector.terminalResize(session.terminalId, dims.cols, dims.rows)
            }
        } catch (e) {
            console.warn('[terminal] fit failed', e)
        }
    }, [isOpen])

    const initializeSession = useCallback(async (session: TerminalSession) => {
        if (session.terminalInstance || !session.containerRef.current) return

        const term = new Terminal({
            theme: getTerminalTheme(),
            fontFamily: settings.fontFamily || "'JetBrains Mono', monospace",
            fontSize: parseInt(settings.fontSize || '13'),
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'block',
            allowTransparency: false,
        })

        const fitAddon = new FitAddon()
        const linkAddon = new WebLinksAddon((e: Event, url: string) => {
            e.preventDefault()
            connector.terminalClickLink(url)
        })
        const searchAddon = new SearchAddon()

        term.loadAddon(fitAddon)
        term.loadAddon(linkAddon)
        term.loadAddon(searchAddon)

        term.open(session.containerRef.current)

        // Assign to session
        session.terminalInstance = term
        session.fitAddon = fitAddon

        try {
            const result: { id: string } = await connector.terminalCreate(
                80,
                24,
                rootPath || undefined
            )
            if (session.disposed) {
                await connector.terminalKill(result.id)
                term.dispose()
                return
            }
            session.terminalId = result.id

            term.onData((data: string) => {
                if (!session.exited && !session.disposed) {
                    connector.terminalInto(result.id, data)
                }
            })

            const dataHandler = (_: any, payload: { id: string; data: string }) => {
                if (term && session.terminalId === payload.id) {
                    try {
                        term.write(payload.data)
                    } catch (e) {
                        console.warn('[terminal] write failed', e)
                    }
                }
            }

            const exitHandler = (_: any, payload: { id: string; exitCode: number }) => {
                if (session.terminalId === payload.id) {
                    session.exited = true
                    try {
                        term.writeln('\r\n\x1b[31mProcess exited. Close this tab or create a new terminal.\x1b[0m')
                    } catch (e) {
                        console.warn('[terminal] exit message failed', e)
                    }
                }
            }

            connector.registerIncData(dataHandler)
            connector.registerTerminalExited(exitHandler)
            session.dataHandler = dataHandler
            session.exitHandler = exitHandler

            setTimeout(() => {
                fitSession(session)
                term.focus()
            }, 100)
        } catch (e) {
            console.warn('[terminal] create failed', e)
            term.writeln('\r\n\x1b[31mFailed to create terminal session.\x1b[0m')
        }

        // Update state with initialized session
        setSessions(prev =>
            prev.map(s =>
                s.id === session.id
                    ? {
                          ...s,
                          terminalInstance: term,
                          fitAddon,
                          terminalId: session.terminalId,
                          dataHandler: session.dataHandler,
                          exitHandler: session.exitHandler,
                          disposed: session.disposed,
                          exited: session.exited,
                      }
                    : s
            )
        )
    }, [settings, getTerminalTheme, fitSession, rootPath])

    // Initialize sessions when panel opens
    useEffect(() => {
        if (!isOpen) return

        const initAll = async () => {
            for (const session of sessionsRef.current) {
                if (!session.terminalInstance) {
                    await initializeSession(session)
                }
            }
        }

        setTimeout(initAll, 50)
    }, [isOpen])

    // Re-fit the active session when it changes
    useEffect(() => {
        if (!isOpen) return
        setTimeout(() => {
            const active = getActiveSession()
            if (active) {
                fitSession(active)
                active.terminalInstance?.focus()
            }
        }, 50)
    }, [activeSessionId, isOpen])

    // Setup resize observer on the terminal wrapper
    useEffect(() => {
        if (!isOpen) {
            if (observerRef.current) {
                observerRef.current.disconnect()
                observerRef.current = null
            }
            return
        }

        const observer = new ResizeObserver(() => {
            const active = getActiveSession()
            if (active) fitSession(active)
        })

        // Observe all session containers
        sessionsRef.current.forEach(s => {
            if (s.containerRef.current) observer.observe(s.containerRef.current)
        })
        observerRef.current = observer

        return () => {
            observer.disconnect()
            observerRef.current = null
        }
    }, [isOpen, sessions, fitSession, getActiveSession])

    // Update font/theme in all sessions when settings change
    useEffect(() => {
        sessionsRef.current.forEach(session => {
            if (!session.terminalInstance) return
            const fontFamily = settings.fontFamily || "'JetBrains Mono', monospace"
            const fontSize = parseInt(settings.fontSize || '13')
            session.terminalInstance.options.fontFamily = fontFamily
            session.terminalInstance.options.fontSize = fontSize
            const timer = setTimeout(() => {
                if (session.terminalInstance) {
                    session.terminalInstance.options.theme = getTerminalTheme()
                }
            }, 100)
            return () => clearTimeout(timer)
        })
    }, [settings, availableThemes, getTerminalTheme])

    // Keyboard shortcut Ctrl+`
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '`') {
                dispatch(gs.toggleTerminal())
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [dispatch])

    // Drag resize
    useEffect(() => {
        const handleMove = throttleCallback((e: MouseEvent) => {
            if (!isDragging) return
            const newHeight = window.innerHeight - e.clientY
            setHeight(Math.max(100, Math.min(newHeight, window.innerHeight - 50)))
        }, 10)

        const handleUp = () => setIsDragging(false)

        if (isDragging) {
            window.addEventListener('mousemove', handleMove)
            window.addEventListener('mouseup', handleUp)
        }

        return () => {
            window.removeEventListener('mousemove', handleMove)
            window.removeEventListener('mouseup', handleUp)
        }
    }, [isDragging])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            sessionsRef.current.forEach(session => {
                if (session.dataHandler) {
                    try { connector.deregisterIncData(session.dataHandler) } catch (e) { console.warn('[terminal] deregister data failed', e) }
                }
                if (session.exitHandler) {
                    try { connector.deregisterTerminalExited(session.exitHandler) } catch (e) { console.warn('[terminal] deregister exit failed', e) }
                }
                if (session.terminalInstance) {
                    try { session.terminalInstance.dispose() } catch (e) { console.warn('[terminal] dispose failed', e) }
                }
                if (session.terminalId) {
                    try { connector.terminalKill(session.terminalId) } catch (e) { console.warn('[terminal] kill failed', e) }
                }
            })
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [])

    const addNewSession = useCallback(() => {
        const newSession = createSession() as TerminalSession
        setSessions(prev => [...prev, newSession])
        setActiveSessionId(newSession.id)
        // Initialize the new session after it mounts
        setTimeout(async () => {
            await initializeSession(newSession)
        }, 100)
    }, [initializeSession])

    const closeSession = useCallback((sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSessions(prev => {
            const sessionToClose = prev.find(s => s.id === sessionId)
            if (sessionToClose) {
                sessionToClose.disposed = true
                // Cleanup
                if (sessionToClose.dataHandler) {
                    try { connector.deregisterIncData(sessionToClose.dataHandler) } catch (e) { console.warn('[terminal] deregister data failed', e) }
                }
                if (sessionToClose.exitHandler) {
                    try { connector.deregisterTerminalExited(sessionToClose.exitHandler) } catch (e) { console.warn('[terminal] deregister exit failed', e) }
                }
                if (sessionToClose.terminalInstance) {
                    try { sessionToClose.terminalInstance.dispose() } catch (e) { console.warn('[terminal] dispose failed', e) }
                }
                if (sessionToClose.terminalId) {
                    try { connector.terminalKill(sessionToClose.terminalId) } catch (e) { console.warn('[terminal] kill failed', e) }
                }
            }

            const newSessions = prev.filter(s => s.id !== sessionId)

            if (newSessions.length === 0) {
                // Close the terminal panel if no sessions remain
                dispatch(gs.closeTerminal())
                return []
            }

            return newSessions
        })

        // Pick another session to activate
        setActiveSessionId(prev => {
            if (prev === sessionId) {
                const remaining = sessionsRef.current.filter(s => s.id !== sessionId)
                return remaining.length > 0 ? remaining[remaining.length - 1].id : ''
            }
            return prev
        })
    }, [dispatch])

    if (!isOpen) return null

    const maxHeight = isMaximized ? window.innerHeight - 50 : height

    return (
        <div
            className="terminal-container"
            style={{ height: `${maxHeight}px` }}
        >
            <div
                className="terminal-dragger"
                onMouseDown={() => setIsDragging(true)}
            />
            <div className="terminal-header">
                {/* Tabs */}
                <div className="terminal-tabs">
                    {sessions.map((session) => (
                        <div
                            key={session.id}
                            className={`terminal-tab ${session.id === activeSessionId ? 'terminal-tab--active' : ''}`}
                            onClick={() => setActiveSessionId(session.id)}
                            title={session.label}
                        >
                            <FontAwesomeIcon icon={faTerminal} className="terminal-tab-icon" />
                            <span className="terminal-tab-label">{session.label}</span>
                            {sessions.length > 1 && (
                                <button
                                    className="terminal-tab-close"
                                    onClick={(e) => closeSession(session.id, e)}
                                    title="Close terminal"
                                >
                                    <FontAwesomeIcon icon={faTimes} />
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        className="terminal-new-session-btn"
                        onClick={addNewSession}
                        title="New terminal session"
                    >
                        <FontAwesomeIcon icon={faPlus} />
                    </button>
                </div>

                <div className="terminal-actions">
                    <button
                        className="terminal-action-btn"
                        onClick={() => setIsMaximized(!isMaximized)}
                        title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        <FontAwesomeIcon icon={faChevronUp} style={{ transform: isMaximized ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                    </button>
                    <button
                        className="terminal-action-btn"
                        onClick={() => dispatch(gs.closeTerminal())}
                        title="Close Panel"
                    >
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>
            </div>
            <div className="terminal-content">
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        ref={session.containerRef}
                        className="terminal-instance-wrapper"
                        style={{ display: session.id === activeSessionId ? 'flex' : 'none', flexDirection: 'column', flex: 1, height: '100%' }}
                    />
                ))}
            </div>
        </div>
    )
}
