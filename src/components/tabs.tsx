import React, { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faXmark,
    faTableColumns,
    faTableList as faTableRows,
} from '@fortawesome/free-solid-svg-icons'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getFile, getTab } from '../features/selectors'
import { setDraggingTab, stopDraggingTab } from '../features/globalSlice'
import { getIconElement } from './filetree'
import * as gs from '../features/globalSlice'
import * as gt from '../features/globalThunks'
import * as gsel from '../features/selectors'
import { HoverState } from '../features/window/state'

// ============================================
// TAB COMPONENT - VS CODE EXACT BEHAVIOR
// ============================================
interface TabProps {
    tid: number
}

function Tab({ tid }: TabProps) {
    const dispatch = useAppDispatch()
    const tab = useAppSelector(getTab(tid))
    const file = useAppSelector(getFile(tab.fileId))
    const tabRef = useRef<HTMLDivElement>(null)
    const [isHovered, setIsHovered] = useState(false)

    if (!tab || !file) return null

    const fileName = tab.isMulti ? 'multifile' : file.name
    const isModified = !tab.isMulti && !file.saved
    const isActive = tab.isActive
    const isDeleted = file.deleted

    // ============================================
    // EVENT HANDLERS
    // ============================================
    const handleClick = () => {
        dispatch(gs.selectTab(tid))
    }

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation()
        dispatch(gt.closeTab(tid))
    }

    const handleMiddleClick = (e: React.MouseEvent) => {
        if (e.button === 1) {
            e.stopPropagation()
            dispatch(gt.closeTab(tid))
        }
    }

    const handleContextMenu = () => {
        dispatch(gs.rightClickTab(tid))
    }

    const handleDragStart = () => {
        dispatch(setDraggingTab(tid))
    }

    const handleDragEnd = () => {
        revertTabStyles()
        dispatch(stopDraggingTab())
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        if (tabRef.current) {
            tabRef.current.style.background = 'var(--any-bg-lighter)'
        }
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        if (tabRef.current) {
            tabRef.current.style.background = ''
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        revertTabStyles()
    }

    const revertTabStyles = () => {
        if (tabRef.current) {
            tabRef.current.style.background = ''
            const tabs =
                tabRef.current.parentElement?.getElementsByClassName('tab')
            for (const t of tabs || []) {
                const tabElement = t as HTMLElement
                tabElement.childNodes.forEach((child) => {
                    const childElement = child as HTMLElement
                    childElement.style.pointerEvents = ''
                })
            }
        }
    }

    // ============================================
    // RENDER - VS CODE EXACT REPLICA
    // ============================================
    return (
        <div
            ref={tabRef}
            draggable
            className={`tab ${isActive ? 'tab__is_active' : ''} ${
                isDeleted ? 'tab__is_deleted' : ''
            }`}
            onClick={handleClick}
            onMouseDown={handleMiddleClick}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* File Icon */}
            <div className="tab__icon">{getIconElement(fileName)}</div>

            {/* File Name */}
            <div className="tab__name" title={fileName}>
                {fileName}
            </div>

            {/* Modified Dot or Close Button */}
            {isModified && !isHovered ? (
                /* Show dot when modified and not hovering */
                <div className="tab__modified">●</div>
            ) : isHovered ? (
                /* Show close button on hover (replaces dot if modified) */
                <div className="tab__close" onClick={handleClose}>
                    <FontAwesomeIcon icon={faXmark} />
                </div>
            ) : null}
        </div>
    )
}

// ============================================
// TAB REMAINDER (Action Buttons Area)
// ============================================
interface TabRemainderProps {
    children: React.ReactNode
}

function TabRemainder({ children }: TabRemainderProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
    }

    return (
        <div
            ref={containerRef}
            className="tab-remainder"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {children}
        </div>
    )
}

// ============================================
// TAB BAR COMPONENT
// ============================================
interface TabBarProps {
    tabIds: number[]
}

export function TabBar({ tabIds }: TabBarProps) {
    const dispatch = useAppDispatch()
    const tabBarRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const currentPane = useAppSelector(gsel.getCurrentPane)
    const currentTab = useAppSelector(gsel.getCurrentTab(currentPane!))

    // ============================================
    // SMOOTH HORIZONTAL SCROLL
    // ============================================
    useEffect(() => {
        const container = containerRef.current
        const tabBar = tabBarRef.current
        if (!container || !tabBar) return

        const handleWheel = (e: WheelEvent) => {
            // Check if there's horizontal scroll available
            const hasHorizontalScroll = tabBar.scrollWidth > tabBar.clientWidth

            if (hasHorizontalScroll && (e.deltaY !== 0 || e.deltaX !== 0)) {
                e.preventDefault()
                e.stopPropagation()

                // VS Code uses direct scrolling - no easing, no momentum
                // Use deltaY for mouse wheel, deltaX for trackpad
                const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY

                // 2x multiplier for comfortable speed
                tabBar.scrollLeft += scrollDelta * 2
            }
        }

        // Attach to container with capture to intercept all wheel events
        container.addEventListener('wheel', handleWheel, {
            passive: false,
            capture: true,
        })

        return () => {
            container.removeEventListener('wheel', handleWheel, {
                capture: true,
            } as any)
        }
    }, [])

    // ============================================
    // ACTION HANDLERS
    // ============================================
    const handleSplitRight = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (currentPane != null) {
            dispatch(
                gs.splitPaneAndOpenFile({
                    paneId: currentPane,
                    hoverState: HoverState.Right,
                })
            )
        }
    }

    const handleSplitDown = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (currentPane != null) {
            dispatch(
                gs.splitPaneAndOpenFile({
                    paneId: currentPane,
                    hoverState: HoverState.Bottom,
                })
            )
        }
    }

    // ============================================
    // RENDER
    // ============================================
    return (
        <div ref={containerRef} className="window__tabbarcontainer">
            {/* Scrollable Tab List */}
            <div ref={tabBarRef} className="tabbar">
                {tabIds.map((tabId) => (
                    <Tab key={tabId} tid={tabId} />
                ))}
            </div>

            {/* Action Buttons */}
            <TabRemainder>
                {currentPane != null && currentTab != null && (
                    <div className="tabbar__actions">
                        <button
                            className="tabbar__action-btn"
                            title="Split Right"
                            onClick={handleSplitRight}
                        >
                            <FontAwesomeIcon icon={faTableColumns} />
                        </button>
                        <button
                            className="tabbar__action-btn"
                            title="Split Down"
                            onClick={handleSplitDown}
                        >
                            <FontAwesomeIcon icon={faTableRows} />
                        </button>
                    </div>
                )}
            </TabRemainder>
        </div>
    )
}
