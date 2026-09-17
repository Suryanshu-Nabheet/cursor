import { useEffect, useRef, useState } from 'react'
import { getIconElement } from './filetree'
import { openFile } from '../features/globalSlice'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getRootPath, searchAllFiles } from '../features/selectors'
import { untriggerFileSearch } from '../features/tools/toolSlice'
import { fileSearchTriggered } from '../features/tools/toolSelectors'
import { connector } from '../connector'

interface FileResult {
    filename: string
    path: string
}

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchFiles() {
    const [selected, setSelected] = useState<FileResult>()
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [results, setResults] = useState<string[]>([])
    const [childQuery, setChildQuery] = useState('')
    const [recentFiles, setRecentFiles] = useState<string[]>([])
    const comboRef = useRef<HTMLInputElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)

    const showFileSearch = useAppSelector(fileSearchTriggered)
    const dispatch = useAppDispatch()

    // Clamp selectedIndex
    if (selectedIndex !== 0 && selectedIndex >= results.length) {
        setSelectedIndex(Math.max(0, results.length - 1))
    }

    // Load recent files from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem('cursor_recent_files')
            if (stored) setRecentFiles(JSON.parse(stored))
        } catch {
            /* ignore */
        }
    }, [])

    // Search files
    useEffect(() => {
        searchAllFiles(query).then((res) => {
            setResults(res)
            setChildQuery(query)
        })
    }, [query])

    // Focus input when shown
    useEffect(() => {
        if (showFileSearch) {
            setSelectedIndex(0)
            setQuery('')
            setTimeout(() => {
                comboRef.current?.focus()
            }, 50)
        }
    }, [showFileSearch])

    // Click-outside to close
    useEffect(() => {
        if (!showFileSearch) return
        const handleClickOutside = (e: MouseEvent) => {
            if (
                wrapperRef.current &&
                !wrapperRef.current.contains(e.target as Node)
            ) {
                dispatch(untriggerFileSearch())
            }
        }
        const id = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)
        return () => {
            clearTimeout(id)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showFileSearch, dispatch])

    // Scroll selection into view
    useEffect(() => {
        const el = document.querySelector('.qo-item.qo-item--selected')
        el?.scrollIntoView({ block: 'nearest' })
    }, [selectedIndex])

    const openSelected = (path: string) => {
        dispatch(openFile({ filePath: path }))
        dispatch(untriggerFileSearch())
        // Track recent files
        try {
            const stored = localStorage.getItem('cursor_recent_files')
            const recent: string[] = stored ? JSON.parse(stored) : []
            const updated = [path, ...recent.filter((p) => p !== path)].slice(
                0,
                8
            )
            localStorage.setItem('cursor_recent_files', JSON.stringify(updated))
        } catch {
            /* ignore */
        }
    }

    const folders = useAppSelector(getRootPath)
    const welcomeDismissed = useAppSelector(
        (state: any) => state.global.welcomeDismissed
    )
    const isWelcomeScreen = (!folders || folders === '') && !welcomeDismissed

    const displayedResults = query
        ? results
        : recentFiles.length > 0
        ? recentFiles.slice(0, 8)
        : results

    if (!showFileSearch || isWelcomeScreen) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="qo-backdrop"
                onMouseDown={() => dispatch(untriggerFileSearch())}
                aria-hidden="true"
            />

            {/* File Search Overlay */}
            <div className="qo-wrapper" id="fileSearchId" ref={wrapperRef}>
                <div className="qo-container">
                    {/* Mode header */}
                    <div className="qo-mode-header qo-mode-file">
                        <span className="qo-mode-icon">⊡</span>
                        <span className="qo-mode-label">Go to File</span>
                        <kbd className="qo-mode-shortcut">⌘P</kbd>
                    </div>

                    <div className="qo-input-row">
                        <span className="qo-search-icon">
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <circle
                                    cx="6.5"
                                    cy="6.5"
                                    r="5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                                <path
                                    d="M10.5 10.5L14 14"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </span>
                        <input
                            className="qo-input"
                            placeholder="Search files by name..."
                            value={query}
                            onChange={(event: any) => {
                                setQuery(event.target.value)
                                setSelectedIndex(0)
                            }}
                            onKeyDown={(e: any) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (displayedResults[selectedIndex]) {
                                        openSelected(
                                            displayedResults[selectedIndex]
                                        )
                                    }
                                } else if (e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    setSelectedIndex((prev) =>
                                        displayedResults.length === 0
                                            ? 0
                                            : (prev + 1) %
                                              displayedResults.length
                                    )
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault()
                                    setSelectedIndex((prev) =>
                                        displayedResults.length === 0
                                            ? 0
                                            : (prev -
                                                  1 +
                                                  displayedResults.length) %
                                              displayedResults.length
                                    )
                                } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    dispatch(untriggerFileSearch())
                                }
                            }}
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

                    <div className="qo-list">
                        {/* Section label */}
                        {!query && recentFiles.length > 0 && (
                            <div className="qo-section-header">
                                Recently Opened
                            </div>
                        )}
                        {!query &&
                            recentFiles.length === 0 &&
                            results.length > 0 && (
                                <div className="qo-section-header">
                                    All Files
                                </div>
                            )}
                        {query && results.length > 0 && (
                            <div className="qo-section-header">
                                {results.length} result
                                {results.length !== 1 ? 's' : ''}
                            </div>
                        )}

                        {/* Results */}
                        {displayedResults.length === 0 ? (
                            <div className="qo-empty-state">
                                {query ? (
                                    <>
                                        <span className="qo-empty-icon">⊘</span>
                                        <span>
                                            No files match &ldquo;{query}&rdquo;
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="qo-empty-icon">⊡</span>
                                        <span>No files in workspace</span>
                                    </>
                                )}
                            </div>
                        ) : (
                            displayedResults.map(
                                (path: string, index: number) => (
                                    <SearchResult
                                        key={path}
                                        query={childQuery}
                                        path={path}
                                        isSelected={index === selectedIndex}
                                        onOpen={openSelected}
                                    />
                                )
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="qo-footer">
                        <span className="qo-footer-hint">
                            <kbd>↑</kbd>
                            <kbd>↓</kbd> Navigate
                        </span>
                        <span className="qo-footer-hint">
                            <kbd>↵</kbd> Open
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

// ─── Search Result Row ────────────────────────────────────────────────────────

export function SearchResult({
    query,
    path,
    isSelected,
    onOpen,
}: {
    query: string
    path: string
    isSelected: boolean
    onOpen?: (path: string) => void
}) {
    const dispatch = useAppDispatch()
    const rootPath = useAppSelector(getRootPath)
    const iconElement = getIconElement(path)

    const splitFilePath = path.split(connector.PLATFORM_DELIMITER)
    const fileName = splitFilePath.pop()!
    const precedingPath = splitFilePath
        .join(connector.PLATFORM_DELIMITER)
        .slice((rootPath?.length ?? 0) + 1)

    const handleClick = () => {
        if (onOpen) {
            onOpen(path)
        } else {
            dispatch(openFile({ filePath: path }))
            dispatch(untriggerFileSearch())
        }
    }

    return (
        <div
            className={`qo-item${isSelected ? ' qo-item--selected' : ''}`}
            onClick={handleClick}
        >
            <span className="qo-item-file-icon">{iconElement}</span>
            <span className="qo-item-name">
                <HighlightMatch text={fileName} query={query} />
            </span>
            {precedingPath && (
                <span className="qo-item-path">
                    <HighlightMatch text={precedingPath} query={query} />
                </span>
            )}
        </div>
    )
}
