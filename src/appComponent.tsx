import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/hooks'
import { PaneHolder } from './components/pane'
import * as gs from './features/globalSlice'
import * as cs from './features/chat/chatSlice'
import * as ct from './features/chat/chatThunks'
import * as ts from './features/tools/toolSlice'
import * as csel from './features/chat/chatSelectors'
import * as tsel from './features/tools/toolSelectors'
import * as ssel from './features/settings/settingsSelectors'
import { changeSettings } from './features/settings/settingsSlice'
import { initializeExtensions } from './features/extensions/extensionsSlice'
import { store } from './app/store'
import { syncThemeFromSettings } from './theme/themeSync'

import {
    getFolders,
    getPaneStateBySplits,
    getRootPath,
} from './features/selectors'

import { ChatPopup, CommandBar } from './components/markdown'
import { SettingsPopup } from './components/settingsPane'
import { FeedbackArea, LeftSide } from './components/search'
import { WelcomeScreen } from './components/welcomeScreen'
import { TitleBar } from './components/titlebar'
import { BottomTerminal } from './components/terminal'
import { throttleCallback } from './components/componentUtils'
import { ErrorPopup } from './components/errors'
import { SSHPopup } from './components/sshPopup'
import { GitClonePopup } from './components/gitClonePopup'

import { ActivityBar } from './components/activityBar'
import { StatusBar } from './components/statusBar'
import { AIChatSidebar } from './components/aiChatSidebar'
import CommandPalettes from './components/commandPalette'

export function App() {
    const dispatch = useAppDispatch()
    const rootPath = useAppSelector(getRootPath)
    const folders = useAppSelector(getFolders)
    const leftSideExpanded = useAppSelector(tsel.getLeftSideExpanded)
    const aiSidebarOpen = useAppSelector(tsel.aiCommandPaletteTriggeredSelector)
    const welcomeDismissed = useAppSelector(tsel.getWelcomeDismissed)

    const paneSplits = useAppSelector(getPaneStateBySplits)

    const TITLEBAR_HEIGHT = 38
    const STATUS_BAR_HEIGHT = 22

    const titleHeight = TITLEBAR_HEIGHT + 'px'
    const windowHeight = `calc(100vh - ${TITLEBAR_HEIGHT}px - ${STATUS_BAR_HEIGHT}px)`

    const commandPaletteOpen = useAppSelector(
        tsel.commandPaletteTriggeredSelector
    )
    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const isControl = connector.PLATFORM_CM_KEY === 'Ctrl'
            const isCmdOrCtrl =
                (isControl && e.ctrlKey) || (!isControl && e.metaKey)

            if (isCmdOrCtrl) {
                // Cmd+K - AI inline edit / generate command bar
                if (e.key === 'k' && !e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    if (commandBarOpen) {
                        dispatch(cs.abortCommandBar())
                    } else {
                        dispatch(ct.pressAICommand('k'))
                    }
                    return
                }

                // Cmd+Shift+P - Command Palette
                if (e.key === 'p' && e.shiftKey) {
                    if (!commandPaletteOpen) {
                        e.preventDefault()
                        e.stopPropagation()
                        dispatch(ts.triggerCommandPalette())
                    }
                    return
                }

                // Cmd+P - Quick Open (file search)
                if (e.key === 'p' && !e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.triggerFileSearch())
                    return
                }

                // Cmd+L - Open AI Chat Sidebar
                if (e.key === 'l') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.triggerAICommandPalette())
                    return
                }

                // Cmd+H - Open Settings
                if (e.key === 'h') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ct.pressAICommand('history'))
                    return
                }

                // Cmd+B - Toggle Sidebar
                if (e.key === 'b') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.toggleLeftSide())
                    return
                }

                // Cmd+Shift+E - Single LSP
                if (e.key === 'e' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ct.pressAICommand('singleLSP'))
                    return
                }

                // Cmd+Shift+Enter - AI Command
                if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ct.pressAICommand('Shift-Enter'))
                    return
                }

                // Cmd+Enter or Cmd+Backspace - Pass through to chat
                if (e.key === 'Enter' || e.key === 'Backspace') {
                    dispatch(ct.pressAICommand(e.key as 'Backspace' | 'Enter'))
                    return
                }
            }

            // Escape key - Close popups
            if (e.key === 'Escape') {
                dispatch(cs.setChatOpen(false))
                if (commandBarOpen) {
                    dispatch(cs.abortCommandBar())
                }
            }
        },
        [dispatch, commandBarOpen, commandPaletteOpen]
    )

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, { capture: true })
        // Don't forget to clean up
        return function cleanup() {
            document.removeEventListener('keydown', handleKeyDown, {
                capture: true,
            })
        }
    }, [handleKeyDown])

    useLayoutEffect(() => {
        if (rootPath == null) {
            dispatch(gs.initState(null))
        }
    }, [rootPath])

    useEffect(() => {
        dispatch(initializeExtensions())
    }, [dispatch])

    const screenState =
        Object.keys(folders as object).length <= 1 && !welcomeDismissed
            ? 'welcome'
            : 'normal'

    const [dragging, setDragging] = useState(false)
    const [leftSideWidth, setLeftSideWidth] = useState(300)
    const [rightSideWidth, setRightSideWidth] = useState(420)
    const [rightDragging, setRightDragging] = useState(false)

    useEffect(() => {
        const throttledMouseMove = throttleCallback((event: any) => {
            if (dragging) {
                event.preventDefault()
                event.stopPropagation()

                const diff = event.clientX
                setLeftSideWidth(Math.max(250, Math.min(diff, 600)))
            }
        }, 10)
        document.addEventListener('mousemove', throttledMouseMove)
        return () => {
            document.removeEventListener('mousemove', throttledMouseMove)
        }
    }, [dragging])

    useEffect(() => {
        const throttledMouseMove = throttleCallback((event: any) => {
            if (rightDragging) {
                event.preventDefault()
                event.stopPropagation()

                const diff = window.innerWidth - event.clientX
                setRightSideWidth(Math.max(300, Math.min(diff, 800)))
            }
        }, 10)
        document.addEventListener('mousemove', throttledMouseMove)
        return () => {
            document.removeEventListener('mousemove', throttledMouseMove)
        }
    }, [rightDragging])

    useEffect(() => {
        function handleMouseUp() {
            setDragging(false)
            setRightDragging(false)
        }
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [])

    const settings = useAppSelector(ssel.getSettings)
    const availableThemes = useAppSelector(
        (state) => state.extensionsState.availableThemes
    )

    // Initialize settings with .env fallback
    useEffect(() => {
        const initializeSettings = async () => {
            const currentSettings =
                store.getState().settingsState?.settings || {}

            // If no provider is set, get default from .env
            if (
                !currentSettings.aiProvider &&
                typeof window !== 'undefined' &&
                (window as any).connector
            ) {
                try {
                    const defaultProvider = await (
                        window as any
                    ).connector.getDefaultAIProvider()
                    if (defaultProvider) {
                        dispatch(
                            changeSettings({ aiProvider: defaultProvider })
                        )
                    }
                } catch (error) {
                    // Ignore errors - .env might not be available
                }
            }
        }
        initializeSettings()
    }, [dispatch])

    // Global Settings Applicator
    useEffect(() => {
        const root = document.documentElement

        // 1. Font Settings
        if (settings.fontFamily) {
            root.style.setProperty(
                '--font-mono',
                `${settings.fontFamily}, monospace`
            )
        }
        if (settings.fontSize) {
            root.style.setProperty(
                '--editor-font-size',
                `${settings.fontSize}px`
            )
            // Also update main base font size if desired for UI
            // root.style.setProperty('--font-size-base', `${settings.fontSize}px`)
        }

        // 2. Theme Settings - Centralized Theme Sync System
        syncThemeFromSettings(settings, availableThemes)
    }, [settings, availableThemes])

    return (
        <>
            {commandBarOpen && <CommandBar parentCaller={'commandBar'} />}
            <TitleBar
                titleHeight={titleHeight}
                useButtons={screenState === 'normal'}
            />
            <div className="window relative" style={{ height: windowHeight }}>
                {screenState === 'welcome' && <WelcomeScreen />}
                {screenState === 'normal' && (
                    <>
                        {leftSideExpanded && (
                            <div
                                className="app__lefttopwrapper"
                                style={{ width: leftSideWidth + 'px' }}
                            >
                                <ActivityBar />
                                <LeftSide />
                            </div>
                        )}
                        {leftSideExpanded && (
                            <div
                                className="leftDrag"
                                onMouseDown={() => {
                                    setDragging(true)
                                }}
                            ></div>
                        )}
                        <div className="app__righttopwrapper">
                            <div className="app__paneholderwrapper">
                                <PaneHolder paneIds={paneSplits} depth={1} />
                            </div>
                            <div className="app__terminalwrapper">
                                <BottomTerminal />
                            </div>
                        </div>
                        {/* Right Sidebar for AI Chat */}
                        {aiSidebarOpen && (
                            <>
                                <div
                                    className="rightDrag"
                                    onMouseDown={() => {
                                        setRightDragging(true)
                                    }}
                                ></div>
                                <div
                                    className="app__rightsidebarwrapper flex"
                                    style={{ width: rightSideWidth + 'px' }}
                                >
                                    <AIChatSidebar />
                                </div>
                            </>
                        )}

                        <CommandPalettes />
                        <ChatPopup />
                        <ErrorPopup />
                        <SettingsPopup />
                        <FeedbackArea />
                        <SSHPopup />
                        <GitClonePopup />
                    </>
                )}
                {screenState === 'normal' && <StatusBar />}
            </div>
        </>
    )
}
