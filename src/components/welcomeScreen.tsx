import React, { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import * as gs from '../features/globalSlice'
import { dismissWelcome } from '../features/tools/toolSlice'
import { getRecentProjects, getVersion } from '../features/selectors'
import posthog from 'posthog-js'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faFolderOpen,
    faCodeBranch,
    faTerminal,
} from '@fortawesome/free-solid-svg-icons'
import { getNameFromPath } from '../features/window/fileUtils'

export function WelcomeScreen() {
    const dispatch = useAppDispatch()
    const recentProjects = useAppSelector(getRecentProjects)
    const version = useAppSelector(getVersion) as string

    useEffect(() => {
        posthog.capture('Welcome Screen Viewed')
    }, [])

    const handleAction = (action: string, payload?: any) => {
        posthog.capture('Welcome Action', { action })
        if (action === 'open_folder') {
            dispatch(dismissWelcome())
            dispatch(gs.openFolder(null))
        } else if (action === 'clone_repo') {
            dispatch(dismissWelcome())
            dispatch(gs.openClonePopup())
        } else if (action === 'connect_ssh') {
            dispatch(dismissWelcome())
            dispatch(gs.openRemotePopup())
        } else if (action === 'open_recent') {
            dispatch(gs.trulyOpenFolder(payload))
            dispatch(dismissWelcome())
        }
    }

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-[var(--accent)] selection:text-white">
            <div className="w-full max-w-[500px] px-8">
                {/* Header */}
                <header className="welcome-header mb-12 text-center">
                    <h1 className="welcome-title text-6xl mb-4">Cursor</h1>
                    <div className="welcome-title-line h-px w-24 bg-[var(--border)] mx-auto mb-6"></div>
                    <p className="welcome-motto text-[var(--ui-fg-muted)] text-lg font-light">
                        Press{' '}
                        <kbd className="font-sans bg-[var(--ui-bg-elevated)] px-2 py-0.5 rounded border border-[var(--border)] text-sm text-[var(--foreground)]">
                            {typeof connector !== 'undefined' &&
                            connector.PLATFORM_META_KEY === 'Ctrl'
                                ? 'Ctrl+K'
                                : '⌘K'}
                        </kbd>{' '}
                        to unlock the power of Cursor AI
                    </p>
                </header>

                {/* Actions Grid */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <button
                        className="group flex h-[70px] flex-col items-start justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] p-3 transition-all hover:bg-[var(--ui-hover)] active:scale-[0.98]"
                        onClick={() => handleAction('open_folder')}
                    >
                        <FontAwesomeIcon
                            icon={faFolderOpen}
                            className="text-lg text-[var(--ui-fg-muted)] transition-colors group-hover:text-[var(--foreground)]"
                        />
                        <span className="text-[13px] font-medium text-[var(--foreground)]">
                            Open project
                        </span>
                    </button>
                    <button
                        className="group flex h-[70px] flex-col items-start justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] p-3 transition-all hover:bg-[var(--ui-hover)] active:scale-[0.98]"
                        onClick={() => handleAction('clone_repo')}
                    >
                        <FontAwesomeIcon
                            icon={faCodeBranch}
                            className="text-lg text-[var(--ui-fg-muted)] transition-colors group-hover:text-[var(--foreground)]"
                        />
                        <span className="text-[13px] font-medium text-[var(--foreground)]">
                            Clone repo
                        </span>
                    </button>
                    <button
                        className="group flex h-[70px] flex-col items-start justify-between rounded-lg border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] p-3 transition-all hover:bg-[var(--ui-hover)] active:scale-[0.98]"
                        onClick={() => handleAction('connect_ssh')}
                    >
                        <FontAwesomeIcon
                            icon={faTerminal}
                            className="text-lg text-[var(--ui-fg-muted)] transition-colors group-hover:text-[var(--foreground)]"
                        />
                        <span className="text-[13px] font-medium text-[var(--foreground)]">
                            SSH Remote
                        </span>
                    </button>
                </div>

                {/* Recent Projects */}
                <div className="mb-8">
                    <div className="mb-3 flex items-end justify-between px-1">
                        <h2 className="text-[13px] font-medium text-[var(--ui-fg-muted)]">
                            Recent projects
                        </h2>
                    </div>

                    <div className="flex flex-col space-y-0.5">
                        {recentProjects.length > 0 ? (
                            recentProjects.slice(0, 5).map((path: string) => (
                                <button
                                    key={path}
                                    className="group flex w-full items-center justify-between rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--ui-hover)]"
                                    onClick={() =>
                                        handleAction('open_recent', path)
                                    }
                                >
                                    <span className="truncate text-[13px] font-medium text-[var(--ui-fg-muted)] group-hover:text-[var(--foreground)]">
                                        {getNameFromPath(path)}
                                    </span>
                                    <span className="ml-4 max-w-[40%] truncate text-right text-[11px] text-[var(--ui-fg-muted)] opacity-60 group-hover:opacity-100">
                                        {formatPath(path)}
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="py-2 pl-1 text-[13px] italic text-[var(--ui-fg-muted)]">
                                No recent projects
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="absolute bottom-4 flex gap-4 text-[10px] text-[var(--ui-fg-muted)] opacity-60">
                <span>Cursor v{version || '1.0.0'}</span>
                <span>Copyright (c) 2026 Suryanshu Nabheet</span>
                <span>MIT License</span>
            </footer>
        </div>
    )
}

function formatPath(path: string) {
    // Attempt to make path look cleaner
    // @ts-ignore
    try {
        const home =
            // @ts-ignore
            connector?.PLATFORM_DELIMITER === '\\' ? 'C:\\Users\\' : '/Users/' // Heuristic
        if (path.includes(home)) {
            // This is just a visual helper, real logic should use homeDir from connector if available
            // but for UI polish, replacing common home patterns helps
        }

        // Simple shortener
        if (path.length > 45) {
            return '...' + path.slice(-42)
        }
        return path
    } catch (e) {
        return path
    }
}

export default WelcomeScreen
