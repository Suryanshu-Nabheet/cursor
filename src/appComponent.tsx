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
import { toggleSettings } from './features/settings/settingsSlice'
import { initializeExtensions } from './features/extensions/extensionsSlice'
import { syncThemeFromSettings } from './theme/themeSync'

import {
    getFolders,
    getPaneStateBySplits,
    getRootPath,
} from './features/selectors'

import { CommandBar } from './components/markdown'
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
import { SettingsEditor } from './features/settings'

export function App() {
    const dispatch = useAppDispatch()
    const rootPath = useAppSelector(getRootPath)
    const folders = useAppSelector(getFolders)
    const leftSideExpanded = useAppSelector(tsel.getLeftSideExpanded)
    const aiSidebarOpen = useAppSelector(tsel.aiCommandPaletteTriggeredSelector)
    const welcomeDismissed = useAppSelector(tsel.getWelcomeDismissed)
    const isSettingsOpen = useAppSelector(ssel.getSettingsIsOpen)

    const paneSplits = useAppSelector(getPaneStateBySplits)

    const TITLEBAR_HEIGHT = 38
    const STATUS_BAR_HEIGHT = 22

    const titleHeight = TITLEBAR_HEIGHT + 'px'
    const windowHeight = `calc(100vh - ${TITLEBAR_HEIGHT}px - ${STATUS_BAR_HEIGHT}px)`

    const commandPaletteOpen = useAppSelector(
        tsel.commandPaletteTriggeredSelector
    )
    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)

    const screenState =
        Object.keys(folders as object).length <= 1 && !welcomeDismissed
            ? 'welcome'
            : 'normal'

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const isPlatformMod = connector.PLATFORM_CM_KEY === 'Ctrl' ? e.ctrlKey : e.metaKey
            const isCmd = e.metaKey
            const isCtrl = e.ctrlKey

            // Cmd+J, Ctrl+J, Cmd+`, Ctrl+` - Toggle Terminal
            if (
                (e.key.toLowerCase() === 'j' ||
                    e.key === '`' ||
                    e.code === 'KeyJ' ||
                    e.code === 'Backquote') &&
                !e.shiftKey &&
                (isCmd || isCtrl)
            ) {
                e.preventDefault()
                e.stopPropagation()
                dispatch(gs.toggleTerminal())
                return
            }

            if (isPlatformMod || isCmd) {
                // Cmd+K - AI inline edit / generate command bar (blocked on welcome screen)
                if (e.key === 'k' && !e.shiftKey) {
                    if (screenState === 'welcome') return
                    e.preventDefault()
                    e.stopPropagation()
                    if (commandBarOpen) {
                        dispatch(cs.abortCommandBar())
                    } else {
                        dispatch(ct.pressAICommand('k'))
                    }
                    return
                }

                // Cmd+Shift+P - Command Palette (blocked on welcome screen)
                if (e.key.toLowerCase() === 'p' && e.shiftKey) {
                    if (screenState === 'welcome') return
                    if (!commandPaletteOpen) {
                        e.preventDefault()
                        e.stopPropagation()
                        dispatch(ts.triggerCommandPalette())
                    }
                    return
                }

                // Cmd+P - Quick Open / File Search (blocked on welcome screen)
                if (e.key === 'p' && !e.shiftKey) {
                    if (screenState === 'welcome') return
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.triggerFileSearch())
                    return
                }

                // Cmd+L - Open / Focus / Toggle AI Chat Sidebar
                if (
                    (e.key.toLowerCase() === 'l' || e.code === 'KeyL') &&
                    !e.shiftKey
                ) {
                    e.preventDefault()
                    e.stopPropagation()

                    // Check for selected text in document to pass to AI Chat
                    const selectedText = window.getSelection()?.toString()
                    if (selectedText && selectedText.trim()) {
                        ;(window as any).__cursorChatQuery = selectedText.trim()
                    }

                    if (!aiSidebarOpen) {
                        dispatch(ts.triggerAICommandPalette())
                    } else {
                        // Check if textarea inside AI sidebar is currently focused
                        const activeEl = document.activeElement
                        const isTextareaFocused =
                            activeEl &&
                            (activeEl.tagName === 'TEXTAREA' ||
                                Boolean(activeEl.closest('.app__rightsidebarwrapper')))

                        if (isTextareaFocused && (!selectedText || !selectedText.trim())) {
                            // Already in chat input without selection -> toggle closed
                            dispatch(ts.triggerAICommandPalette())
                        } else {
                            // Focus the textarea in the open AI sidebar
                            const textarea = document.querySelector<HTMLTextAreaElement>(
                                '.app__rightsidebarwrapper textarea'
                            )
                            if (textarea) {
                                if (selectedText && selectedText.trim()) {
                                    textarea.value = selectedText.trim()
                                    textarea.dispatchEvent(new Event('input', { bubbles: true }))
                                }
                                textarea.focus()
                            } else {
                                dispatch(ts.triggerAICommandPalette())
                            }
                        }
                    }
                    return
                }

                // Cmd+, — Settings (in-editor)
                if (e.key === ',') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(toggleSettings())
                    return
                }

                // Cmd+H - Chat history
                if (e.key === 'h') {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ct.pressAICommand('history'))
                    return
                }

                // Cmd+B - Toggle Sidebar
                if (e.key === 'b' && !e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.toggleLeftSide())
                    return
                }

                // Cmd+Shift+E — Explorer
                if (e.key.toLowerCase() === 'e' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.openFileTree())
                    dispatch(ts.expandLeftSide())
                    return
                }

                // Cmd+Shift+F — Search panel
                if (e.key.toLowerCase() === 'f' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.openSearch())
                    dispatch(ts.expandLeftSide())
                    return
                }

                // Cmd+Shift+X — Extensions
                if (e.key.toLowerCase() === 'x' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.openExtensions())
                    dispatch(ts.expandLeftSide())
                    return
                }

                // Cmd+Shift+G — Source Control (Windows/Linux; Mac also via Ctrl below)
                if (e.key.toLowerCase() === 'g' && e.shiftKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    dispatch(ts.openGit())
                    dispatch(ts.expandLeftSide())
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

            // Mac Cursor uses Ctrl+Shift+G for Source Control
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
                e.preventDefault()
                e.stopPropagation()
                dispatch(ts.openGit())
                dispatch(ts.expandLeftSide())
                return
            }

            // Escape key - Close popups
            if (e.key === 'Escape') {
                dispatch(cs.setChatOpen(false))
                if (commandBarOpen) {
                    dispatch(cs.abortCommandBar())
                }
            }
        },
        [dispatch, commandBarOpen, commandPaletteOpen, screenState, aiSidebarOpen]
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
            {commandBarOpen && screenState !== 'welcome' && <CommandBar parentCaller={'commandBar'} />}
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
                                {isSettingsOpen ? (
                                    <SettingsEditor />
                                ) : (
                                    <PaneHolder
                                        paneIds={paneSplits}
                                        depth={1}
                                    />
                                )}
                            </div>
                            {!isSettingsOpen && (
                                <div className="app__terminalwrapper">
                                    <BottomTerminal />
                                </div>
                            )}
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
                        <ErrorPopup />
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
