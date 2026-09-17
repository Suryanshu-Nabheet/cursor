import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnyAction, Dispatch } from '@reduxjs/toolkit'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
    openRemotePopup,
    openTerminal,
    toggleTerminal,
    splitCurrentPane,
} from '../features/globalSlice'
import { HoverState } from '../features/window/state'
import {
    openFileTree,
    openSearch,
    triggerFileSearch,
    untriggerCommandPalette,
} from '../features/tools/toolSlice'
import * as ts from '../features/tools/toolSlice'
import { toggleSettings } from '../features/settings/settingsSlice'
import { commandPaletteTriggeredSelector } from '../features/tools/toolSelectors'
import { Combobox } from '@headlessui/react'
import { toggleFeedback } from '../features/logging/loggingSlice'
import { selectFocusedTabId } from '../features/selectors'
import { getViewId } from '../features/codemirror/codemirrorSelectors'
import { getCodeMirrorView } from '../features/codemirror/codemirrorSlice'
import { toggleChatHistory } from '../features/chat/chatSlice'
import { pressAICommand } from '../features/chat/chatThunks'
import { connector } from '../connector'

const commandKey = connector.PLATFORM_META_KEY + ''

// ─── Types ──────────────────────────────────────────────────────────────────

type AICommandIds = 'edit' | 'generate' | 'freeform' | 'freeform_select'
type splitPaneCommandIds =
    | 'splitPaneRight'
    | 'splitPaneLeft'
    | 'splitPaneUp'
    | 'splitPaneDown'
type MainCommandIds =
    | 'terminal'
    | 'ssh'
    | 'chatHistory'
    | 'search'
    | 'searchFiles'
    | 'settings'
    | 'fileTree'
    | 'feedback'

type CommandIds = AICommandIds | splitPaneCommandIds | MainCommandIds

const otherCommandIds: CommandIds[] = [
    'splitPaneRight',
    'splitPaneLeft',
    'splitPaneUp',
    'splitPaneDown',
    'terminal',
    'ssh',
    'chatHistory',
    'search',
    'searchFiles',
    'settings',
    'fileTree',
    'feedback',
]

interface Command {
    id: CommandIds
    type: string
    name: string
    description: string
    hint?: string
    error?: string
    shortcut?: string[]
    icon?: string
    category?: string
    action: (dispatch: Dispatch<AnyAction>) => void
}
interface AICommand extends Command {
    type: 'ai'
    hintFileOpen?: string
}

// ─── Command Definitions ─────────────────────────────────────────────────────

const aiCommands: { [key in AICommandIds]: AICommand } = {
    edit: {
        id: 'edit',
        type: 'ai',
        name: 'Edit Selection',
        description: 'Changes the highlighted code',
        hint: 'Changes the highlighted code',
        error: 'Try highlighting code',
        shortcut: [commandKey + 'K'],
        icon: '✦',
        category: 'AI',
        action: (dispatch: any) => {
            dispatch(pressAICommand('k'))
        },
    },
    generate: {
        id: 'generate',
        type: 'ai',
        name: 'Generate',
        description: 'Writes new code',
        hint: 'Writes new code',
        error: 'Try opening a file',
        shortcut: [commandKey + 'K'],
        icon: '✦',
        category: 'AI',
        action: (dispatch: any) => {
            dispatch(pressAICommand('k'))
        },
    },
    freeform: {
        id: 'freeform',
        type: 'ai',
        name: 'Chat',
        hint: 'Answers questions about anything',
        hintFileOpen: 'Answers questions about the current file or anything',
        error: 'Try unhighlighting',
        description: 'Ask a question about the current file or anything',
        shortcut: [commandKey + 'L'],
        icon: '✦',
        category: 'AI',
        action: (dispatch: any) => {
            dispatch(ts.triggerAICommandPalette())
        },
    },
    freeform_select: {
        id: 'freeform_select',
        type: 'ai',
        name: 'Chat Selection',
        hint: 'Answers questions about the highlighted code',
        error: 'Try highlighting code',
        description: 'Ask a question about the current file',
        shortcut: [commandKey + 'L'],
        icon: '✦',
        category: 'AI',
        action: (dispatch: any) => {
            dispatch(ts.triggerAICommandPalette())
        },
    },
}

const splitPaneCommands: { [key in splitPaneCommandIds]: Command } = {
    splitPaneRight: {
        id: 'splitPaneRight',
        type: 'normal',
        name: 'View: Split Editor Right',
        description: 'Split the current pane to the right',
        icon: '⊞',
        category: 'View',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Right))
        },
    },
    splitPaneDown: {
        id: 'splitPaneDown',
        type: 'normal',
        name: 'View: Split Editor Down',
        description: 'Split the current pane downwards',
        icon: '⊟',
        category: 'View',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Bottom))
        },
    },
    splitPaneLeft: {
        id: 'splitPaneLeft',
        type: 'normal',
        name: 'View: Split Editor Left',
        description: 'Split the current pane to the left',
        icon: '⊞',
        category: 'View',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Left))
        },
    },
    splitPaneUp: {
        id: 'splitPaneUp',
        type: 'normal',
        name: 'View: Split Editor Up',
        description: 'Split the current pane upwards',
        icon: '⊟',
        category: 'View',
        action: (dispatch: any) => {
            dispatch(splitCurrentPane(HoverState.Top))
        },
    },
}

const mainCommands: { [key in MainCommandIds]: Command } = {
    terminal: {
        id: 'terminal',
        type: 'normal',
        name: 'Terminal: Toggle Integrated Terminal',
        description: 'Open or close the integrated terminal panel',
        shortcut: [commandKey + 'J', 'Ctrl+`'],
        icon: '>_',
        category: 'Terminal',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleTerminal())
        },
    },
    ssh: {
        id: 'ssh',
        type: 'normal',
        name: 'Remote: Open SSH Folder',
        description: 'Open a remote folder over ssh',
        icon: '⇄',
        category: 'Remote',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openRemotePopup())
        },
    },
    chatHistory: {
        id: 'chatHistory',
        type: 'normal',
        name: 'Chat: Open Chat History',
        description: 'Shows past chat conversations',
        icon: '◷',
        category: 'AI',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleChatHistory())
        },
    },
    search: {
        id: 'search',
        type: 'normal',
        name: 'Search: Find in Files',
        description: 'Exact match/regex match search through the repo',
        shortcut: [commandKey + 'Shift+F'],
        icon: '⌕',
        category: 'Search',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openSearch())
        },
    },
    searchFiles: {
        id: 'searchFiles',
        type: 'normal',
        name: 'File: Go to File',
        description: 'Search for a specific file',
        shortcut: [commandKey + 'P'],
        icon: '⊡',
        category: 'File',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(triggerFileSearch())
        },
    },
    settings: {
        id: 'settings',
        type: 'normal',
        name: 'Preferences: Open Settings',
        description: 'Open the settings menu',
        shortcut: [commandKey + ','],
        icon: '⚙',
        category: 'Preferences',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleSettings())
        },
    },
    fileTree: {
        id: 'fileTree',
        type: 'normal',
        name: 'View: Show Explorer',
        description: 'Open the file tree',
        icon: '⊡',
        category: 'View',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(openFileTree())
        },
    },
    feedback: {
        id: 'feedback',
        type: 'normal',
        name: 'Help: Send Feedback',
        description: 'Open the feedback form',
        icon: '✉',
        category: 'Help',
        action: (dispatch: Dispatch<AnyAction>) => {
            dispatch(toggleFeedback(null))
        },
    },
}

const allCommands = { ...aiCommands, ...splitPaneCommands, ...mainCommands }

// ─── Highlight helper ────────────────────────────────────────────────────────

function HighlightMatch({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>
    try {
        const parts = text.split(new RegExp(`(${query})`, 'gi'))
        return (
            <>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={i} className="qo-highlight">
                            {part}
                        </mark>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </>
        )
    } catch {
        return <>{text}</>
    }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function CommandPalettes() {
    const dispatch = useAppDispatch()
    const commandPaletteTriggeredFocus = useAppSelector(
        commandPaletteTriggeredSelector
    )
    const rootPath = useAppSelector((state: any) => state.global?.rootPath)
    const welcomeDismissed = useAppSelector(
        (state: any) => state.global?.welcomeDismissed
    )
    const isWelcomeScreen = (!rootPath || rootPath === '') && !welcomeDismissed

    const commandPaletteCloseTrigger = useCallback(
        () => dispatch(untriggerCommandPalette()),
        [dispatch]
    )

    if (isWelcomeScreen) return null

    return (
        <>
            <InnerCommandPalette
                openingTrigger={commandPaletteTriggeredFocus}
                aiOnly={false}
                closeTrigger={commandPaletteCloseTrigger}
            />
        </>
    )
}

// ─── AI Results Hook ─────────────────────────────────────────────────────────

interface AIResult {
    id: AICommandIds
    clickable: boolean
}

const useAIResults = () => {
    const tabId = useAppSelector(selectFocusedTabId)
    const viewId = useAppSelector(getViewId(tabId))
    const view = useMemo(() => viewId && getCodeMirrorView(viewId), [viewId])
    const selection = view && view.state.selection.main
    const [results, setResults] = useState<AIResult[]>([])

    useEffect(() => {
        if (!viewId) {
            setResults([
                { id: 'freeform', clickable: true },
                { id: 'edit', clickable: false },
                { id: 'generate', clickable: false },
                { id: 'freeform_select', clickable: false },
            ])
        } else {
            if (selection == null || selection == 0) {
                setResults([
                    { id: 'freeform', clickable: true },
                    { id: 'edit', clickable: false },
                    { id: 'generate', clickable: false },
                    { id: 'freeform_select', clickable: false },
                ])
            } else if (selection.from == selection.to) {
                setResults([
                    { id: 'generate', clickable: true },
                    { id: 'freeform', clickable: true },
                    { id: 'edit', clickable: false },
                    { id: 'freeform_select', clickable: false },
                ])
            } else {
                setResults([
                    { id: 'edit', clickable: true },
                    { id: 'freeform_select', clickable: true },
                    { id: 'freeform', clickable: false },
                    { id: 'generate', clickable: false },
                ])
            }
        }
    }, [selection])

    return { results }
}

// ─── Section header for grouping ─────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
    return <div className="qo-section-header">{label}</div>
}

// ─── Inner Command Palette ────────────────────────────────────────────────────

export function InnerCommandPalette({
    openingTrigger,
    closeTrigger,
    aiOnly,
}: {
    openingTrigger: boolean
    closeTrigger: () => void
    aiOnly?: boolean
}) {
    const [selected, setSelected] = useState<Command>()
    const [query, setQuery] = useState('')
    const [showing, setShowing] = useState(false)
    const [selectedIndex, setSelectedIndex] = useState(0)
    const comboBtn = useRef<HTMLButtonElement>(null)
    const comboOptionsRef = useRef<HTMLUListElement>(null)
    const comboRef = useRef<HTMLInputElement>(null)
    const fullComboRef = useRef<HTMLDivElement>(null)

    const dispatch = useAppDispatch()

    const { results: aiResults } = useAIResults()
    const otherResults = useMemo(
        () =>
            aiOnly
                ? []
                : otherCommandIds.map((cid) => ({ id: cid, clickable: null })),
        [aiOnly]
    )

    const filteredResults = useMemo(() => {
        return [...aiResults, ...otherResults].filter((obj) => {
            return allCommands[obj.id].name
                .toLowerCase()
                .includes(query.toLowerCase())
        })
    }, [query, aiResults, otherResults])

    useEffect(() => {
        if (selectedIndex != 0 && selectedIndex >= filteredResults.length) {
            setSelectedIndex(filteredResults.length - 1)
        }
    }, [selectedIndex, filteredResults])

    useEffect(() => {
        if (openingTrigger) {
            setShowing(true)
            setSelectedIndex(0)
            setQuery('')
        } else {
            setShowing(false)
        }
    }, [openingTrigger])

    // Focus input when shown
    useEffect(() => {
        if (showing && fullComboRef.current) {
            setTimeout(() => {
                comboRef.current?.focus()
            }, 50)

            if (comboBtn.current && !comboOptionsRef.current) {
                comboBtn.current.click()
            }
        }
    }, [showing])

    // Scroll selected item into view
    useEffect(() => {
        const dataTestId = `command-item-${selectedIndex}`
        const selectedEl = comboOptionsRef?.current?.querySelector(
            `div[data-test-id="${dataTestId}"]`
        )
        if (selectedEl) {
            selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
    }, [selectedIndex])

    const close = useCallback(() => {
        setShowing(false)
        closeTrigger()
        setQuery('')
    }, [closeTrigger])

    const keyDownHandler = useCallback(
        (e: { key: string; preventDefault: () => void }) => {
            const lastIndex = filteredResults.length - 1
            if (e.key === 'Enter') {
                e.preventDefault()
                if (filteredResults[selectedIndex]) {
                    const selectedCommand =
                        allCommands[filteredResults[selectedIndex].id]

                    if (
                        (selectedCommand.id === 'freeform' ||
                            selectedCommand.id === 'freeform_select') &&
                        query.trim()
                    ) {
                        if (typeof window !== 'undefined') {
                            ;(window as any).__cursorChatQuery = query.trim()
                        }
                        dispatch(ts.triggerAICommandPalette())
                        close()
                        return
                    }

                    close()
                    selectedCommand.action(dispatch)
                }
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(
                    selectedIndex < lastIndex ? selectedIndex + 1 : 0
                )
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(
                    selectedIndex <= 0 ? lastIndex : selectedIndex - 1
                )
            } else if (e.key === 'Escape') {
                e.preventDefault()
                close()
            }
        },
        [selectedIndex, filteredResults, dispatch, query, close]
    )

    // Group results by category for display
    const groupedResults = useMemo(() => {
        const groups: {
            label: string
            items: {
                id: CommandIds
                clickable: boolean | null
                index: number
            }[]
        }[] = []
        let globalIndex = 0

        // AI commands first
        const aiItems = filteredResults.filter(
            (r) => allCommands[r.id].type === 'ai'
        )
        if (aiItems.length > 0) {
            groups.push({
                label: 'AI',
                items: aiItems.map((r) => ({ ...r, index: globalIndex++ })),
            })
        }

        // Normal commands grouped
        const normalItems = filteredResults.filter(
            (r) => allCommands[r.id].type !== 'ai'
        )
        if (normalItems.length > 0) {
            // Group by category
            const categoryMap = new Map<string, typeof normalItems>()
            for (const item of normalItems) {
                const cat = allCommands[item.id].category || 'General'
                if (!categoryMap.has(cat)) categoryMap.set(cat, [])
                categoryMap.get(cat)!.push(item)
            }
            for (const [cat, items] of categoryMap) {
                groups.push({
                    label: cat,
                    items: items.map((r) => ({ ...r, index: globalIndex++ })),
                })
            }
        }

        return groups
    }, [filteredResults])

    if (!openingTrigger) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="qo-backdrop"
                onMouseDown={close}
                aria-hidden="true"
            />

            {/* Palette */}
            <div
                className="qo-wrapper"
                style={{ display: showing ? 'flex' : 'none' }}
                id="commandPaletteId"
            >
                <div className="qo-container" ref={fullComboRef}>
                    {/* Mode header */}
                    <div className="qo-mode-header qo-mode-command">
                        <span className="qo-mode-icon">⌘</span>
                        <span className="qo-mode-label">Command Palette</span>
                        <kbd className="qo-mode-shortcut">⌘⇧P</kbd>
                    </div>

                    <Combobox value={selected} onChange={setSelected}>
                        {/* Input row */}
                        <div className="qo-input-row">
                            <span className="qo-prefix-marker">&gt;</span>
                            <Combobox.Input
                                className="qo-input"
                                placeholder="Type a command..."
                                displayValue={(command: Command) =>
                                    command?.name ?? ''
                                }
                                onChange={(event: any) => {
                                    setQuery(event.target.value)
                                    setSelectedIndex(0)
                                }}
                                onKeyDown={keyDownHandler}
                                ref={comboRef}
                                autoComplete="off"
                                spellCheck={false}
                            />
                            {query && (
                                <button
                                    className="qo-clear-btn"
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        setQuery('')
                                        comboRef.current?.focus()
                                    }}
                                    tabIndex={-1}
                                    aria-label="Clear"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <Combobox.Button className="hidden" ref={comboBtn} />

                        {/* Results */}
                        <Combobox.Options
                            static
                            className="qo-list"
                            ref={comboOptionsRef}
                        >
                            {filteredResults.length === 0 ? (
                                <div className="qo-empty-state">
                                    <span className="qo-empty-icon">⊘</span>
                                    <span>
                                        No commands found for &ldquo;{query}
                                        &rdquo;
                                    </span>
                                </div>
                            ) : (
                                groupedResults.map((group) => (
                                    <div key={group.label} className="qo-group">
                                        <SectionHeader label={group.label} />
                                        {group.items.map(
                                            ({ id, clickable, index }) => {
                                                const command = allCommands[id]
                                                if (clickable === null) {
                                                    return (
                                                        <CommandResult
                                                            key={command.id}
                                                            dataTestId={`command-item-${index}`}
                                                            command={command}
                                                            query={query}
                                                            closeTrigger={close}
                                                            isSelected={
                                                                index ===
                                                                selectedIndex
                                                            }
                                                        />
                                                    )
                                                } else {
                                                    return (
                                                        <AICommandResult
                                                            key={command.id}
                                                            dataTestId={`command-item-${index}`}
                                                            command={command}
                                                            query={query}
                                                            isClickable={
                                                                clickable
                                                            }
                                                            closeTrigger={close}
                                                            isSelected={
                                                                index ===
                                                                selectedIndex
                                                            }
                                                        />
                                                    )
                                                }
                                            }
                                        )}
                                    </div>
                                ))
                            )}
                        </Combobox.Options>
                    </Combobox>

                    {/* Footer */}
                    <div className="qo-footer">
                        <span className="qo-footer-hint">
                            <kbd>↑</kbd>
                            <kbd>↓</kbd> Navigate
                        </span>
                        <span className="qo-footer-hint">
                            <kbd>↵</kbd> Execute
                        </span>
                        <span className="qo-footer-hint">
                            <kbd>Esc</kbd> Close
                        </span>
                    </div>
                </div>
            </div>
        </>
    )
}

// ─── Command Result ───────────────────────────────────────────────────────────

export function CommandResult({
    command,
    query,
    isSelected,
    closeTrigger,
    dataTestId,
}: {
    command: Command
    query: string
    isSelected: boolean
    dataTestId: string
    closeTrigger: () => void
}) {
    const dispatch = useAppDispatch()

    const executeCommand = useCallback(
        (e: { stopPropagation: () => void }) => {
            closeTrigger()
            command.action(dispatch)
            e.stopPropagation()
        },
        [dispatch, command, closeTrigger]
    )

    return (
        <div
            className={`qo-item${isSelected ? ' qo-item--selected' : ''}`}
            onClick={executeCommand}
            data-test-id={dataTestId}
        >
            {command.icon && (
                <span className="qo-item-icon">{command.icon}</span>
            )}
            <span className="qo-item-name">
                <HighlightMatch text={command.name} query={query} />
            </span>
            {command.hint && (
                <span className="qo-item-desc">{command.hint}</span>
            )}
            <span className="qo-item-shortcuts">
                {command.shortcut?.map((key, index) => (
                    <kbd key={index} className="qo-kbd">
                        {key}
                    </kbd>
                ))}
            </span>
        </div>
    )
}

// ─── AI Command Result ────────────────────────────────────────────────────────

export function AICommandResult({
    command,
    query,
    isClickable,
    isSelected,
    closeTrigger,
    dataTestId,
}: {
    command: Command
    query: string
    isClickable: boolean
    isSelected: boolean
    closeTrigger: () => void
    dataTestId: string
}) {
    const dispatch = useAppDispatch()

    const executeCommand = useCallback(
        (e: { stopPropagation: () => void }) => {
            if (isClickable) {
                closeTrigger()
                command.action(dispatch)
            }
            e.stopPropagation()
        },
        [dispatch, command, isClickable, closeTrigger]
    )

    return (
        <div
            className={`qo-item qo-item--ai${
                isSelected ? ' qo-item--selected' : ''
            }${!isClickable ? ' qo-item--disabled' : ''}`}
            data-test-id={dataTestId}
            onMouseDown={isClickable ? executeCommand : undefined}
        >
            <span className="qo-item-icon qo-item-icon--ai">
                {command.icon || '✦'}
            </span>
            <span className="qo-item-name">
                <HighlightMatch text={command.name} query={query} />
            </span>
            <span className="qo-item-desc">
                {isClickable ? command.hint ?? '' : command.error ?? ''}
            </span>
            <span className="qo-item-shortcuts">
                {command.shortcut?.map((key, index) => (
                    <kbd key={index} className="qo-kbd">
                        {key}
                    </kbd>
                ))}
            </span>
        </div>
    )
}
