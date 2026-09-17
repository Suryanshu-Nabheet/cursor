import React, { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
    getLeftTab,
    getLeftSideExpanded,
} from '../features/tools/toolSelectors'
import {
    openFileTree,
    openSearch,
    openGit,
    openExtensions,
    collapseLeftSide,
    expandLeftSide,
} from '../features/tools/toolSlice'
import { getSettings } from '../features/settings/settingsSelectors'
import { changeSettings } from '../features/settings/settingsSlice'
import { Codicon } from './codicon'
import type { Settings } from '../features/window/state'

type ActivityTab = 'filetree' | 'search' | 'git' | 'extensions'
type SidebarViewId = ActivityTab | 'debug' | 'remote'

type SidebarView = {
    id: SidebarViewId
    icon: string
    label: string
    shortcut?: string
    available: boolean
}

const DEFAULT_PINNED: ActivityTab[] = [
    'filetree',
    'search',
    'git',
    'extensions',
]

function isMacPlatform() {
    try {
        if (
            typeof connector !== 'undefined' &&
            connector.PLATFORM_META_KEY === '⌘'
        )
            return true
    } catch {
        /* ignore */
    }
    return (
        typeof navigator !== 'undefined' &&
        /Mac|iPhone|iPad|iPod/.test(navigator.platform || '')
    )
}

function buildViews(): SidebarView[] {
    const mac = isMacPlatform()
    return [
        {
            id: 'filetree',
            icon: 'files',
            label: 'Explorer',
            shortcut: mac ? '⇧⌘E' : 'Ctrl+Shift+E',
            available: true,
        },
        {
            id: 'search',
            icon: 'search',
            label: 'Search',
            shortcut: mac ? '⇧⌘F' : 'Ctrl+Shift+F',
            available: true,
        },
        {
            id: 'git',
            icon: 'source-control',
            label: 'Source Control',
            shortcut: mac ? '⌃⇧G' : 'Ctrl+Shift+G',
            available: true,
        },
        {
            id: 'extensions',
            icon: 'extensions',
            label: 'Extensions',
            shortcut: mac ? '⇧⌘X' : 'Ctrl+Shift+X',
            available: true,
        },
        {
            id: 'debug',
            icon: 'debug-alt',
            label: 'Run and Debug',
            shortcut: mac ? '⇧⌘D' : 'Ctrl+Shift+D',
            available: false,
        },
        {
            id: 'remote',
            icon: 'remote-explorer',
            label: 'Remote Explorer',
            available: false,
        },
    ]
}

function getPinned(settings: Settings): ActivityTab[] {
    const raw = settings.pinnedSidebarViews
    if (!raw || raw.length === 0) return [...DEFAULT_PINNED]
    return raw.filter((id): id is ActivityTab =>
        DEFAULT_PINNED.includes(id as ActivityTab)
    )
}

function openView(
    dispatch: ReturnType<typeof useAppDispatch>,
    id: ActivityTab
) {
    if (id === 'filetree') dispatch(openFileTree())
    else if (id === 'search') dispatch(openSearch())
    else if (id === 'git') dispatch(openGit())
    else if (id === 'extensions') dispatch(openExtensions())
    dispatch(expandLeftSide())
}

/**
 * Cursor-style activity strip + view list.
 * List opens as an overlay so Explorer / panels never shift.
 */
export const ActivityBar = () => {
    const dispatch = useAppDispatch()
    const activeTab = useAppSelector(getLeftTab)
    const isExpanded = useAppSelector(getLeftSideExpanded)
    const settings = useAppSelector(getSettings)
    const views = React.useMemo(() => buildViews(), [])
    const pinned = getPinned(settings)
    const [listOpen, setListOpen] = useState(
        settings.sidebarListExpanded !== false
    )
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setListOpen(settings.sidebarListExpanded !== false)
    }, [settings.sidebarListExpanded])

    useEffect(() => {
        if (!listOpen) return
        const onPointerDown = (event: MouseEvent) => {
            if (
                rootRef.current &&
                !rootRef.current.contains(event.target as Node)
            ) {
                setListOpen(false)
                dispatch(changeSettings({ sidebarListExpanded: false }))
            }
        }
        document.addEventListener('mousedown', onPointerDown)
        return () => document.removeEventListener('mousedown', onPointerDown)
    }, [listOpen, dispatch])

    const isActive = (id: SidebarViewId) => isExpanded && id === activeTab

    const handleOpen = (view: SidebarView) => {
        if (!view.available) return
        const id = view.id as ActivityTab
        if (activeTab === id && isExpanded) {
            dispatch(collapseLeftSide())
            return
        }
        openView(dispatch, id)
    }

    const togglePin = (e: React.MouseEvent, view: SidebarView) => {
        e.stopPropagation()
        if (!view.available) return
        const id = view.id as ActivityTab
        const next = pinned.includes(id)
            ? pinned.filter((p) => p !== id)
            : [...pinned, id]
        const safe = next.length === 0 ? (['filetree'] as ActivityTab[]) : next
        dispatch(changeSettings({ pinnedSidebarViews: safe }))
    }

    const toggleList = () => {
        const next = !listOpen
        setListOpen(next)
        dispatch(changeSettings({ sidebarListExpanded: next }))
    }

    const pinnedViews = views.filter(
        (v) => v.available && pinned.includes(v.id as ActivityTab)
    )

    return (
        <div className="sidebar2" aria-label="Primary sidebar" ref={rootRef}>
            <div className="sidebar2__icon-bar">
                <div className="sidebar2__icons" role="tablist">
                    {pinnedViews.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            role="tab"
                            aria-selected={!!isActive(view.id)}
                            aria-label={view.label}
                            title={
                                view.shortcut
                                    ? `${view.label} (${view.shortcut})`
                                    : view.label
                            }
                            className={`sidebar2__icon${
                                isActive(view.id)
                                    ? ' sidebar2__icon--active'
                                    : ''
                            }`}
                            onClick={() => handleOpen(view)}
                        >
                            <Codicon name={view.icon} />
                        </button>
                    ))}

                    <button
                        type="button"
                        className={`sidebar2__icon sidebar2__icon--toggle${
                            listOpen ? ' sidebar2__icon--active' : ''
                        }`}
                        aria-label={
                            listOpen ? 'Collapse view list' : 'Expand view list'
                        }
                        aria-expanded={listOpen}
                        title={listOpen ? 'Collapse' : 'Expand'}
                        onClick={toggleList}
                    >
                        <Codicon
                            name={listOpen ? 'chevron-up' : 'chevron-down'}
                        />
                    </button>
                </div>
            </div>

            {listOpen && (
                <div className="sidebar2__list" role="list">
                    {views.map((view) => {
                        const pinnedHere =
                            view.available &&
                            pinned.includes(view.id as ActivityTab)
                        const selected = !!isActive(view.id)
                        return (
                            <div
                                key={view.id}
                                role="listitem"
                                className={`sidebar2__row${
                                    selected ? ' sidebar2__row--active' : ''
                                }${
                                    !view.available
                                        ? ' sidebar2__row--disabled'
                                        : ''
                                }`}
                                onClick={() => handleOpen(view)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleOpen(view)
                                    }
                                }}
                                tabIndex={view.available ? 0 : -1}
                            >
                                <div className="sidebar2__row-main">
                                    <Codicon
                                        name={view.icon}
                                        className="sidebar2__row-icon"
                                    />
                                    <span className="sidebar2__row-label">
                                        {view.label}
                                    </span>
                                    {view.shortcut && (
                                        <span className="sidebar2__row-shortcut">
                                            {view.shortcut}
                                        </span>
                                    )}
                                </div>
                                {view.available ? (
                                    <button
                                        type="button"
                                        className={`sidebar2__pin${
                                            pinnedHere
                                                ? ''
                                                : ' sidebar2__pin--off'
                                        }`}
                                        aria-label={
                                            pinnedHere
                                                ? `Unpin ${view.label}`
                                                : `Pin ${view.label}`
                                        }
                                        title={
                                            pinnedHere
                                                ? 'Unpin from bar'
                                                : 'Pin to bar'
                                        }
                                        onClick={(e) => togglePin(e, view)}
                                    >
                                        <Codicon name="pinned" />
                                    </button>
                                ) : (
                                    <span className="sidebar2__soon">Soon</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
