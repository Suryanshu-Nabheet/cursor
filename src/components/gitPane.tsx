import React, { useEffect, useState, useCallback } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faRotateRight,
    faCheck,
    faCodeBranch,
    faPlus,
    faMinus,
    faCloudArrowUp,
    faCloudArrowDown,
    faEllipsis,
    faChevronDown,
    faChevronRight,
    faXmark,
    faStar,
} from '@fortawesome/pro-regular-svg-icons'
import { useAppSelector } from '../app/hooks'
import { getRootPath } from '../features/selectors'
import { getIconElement } from './filetree'
import { getSettings } from '../features/settings/settingsSelectors'
import { draftCommitMessage } from '../features/ai/commitMessageDraft'

interface GitStatusFile {
    status: string
    file: string
}

export const GitPane = () => {
    const rootPath = useAppSelector(getRootPath)
    const settings = useAppSelector(getSettings)

    // State
    const [loading, setLoading] = useState(false)
    const [draftingMessage, setDraftingMessage] = useState(false)
    const [isRepo, setIsRepo] = useState(false)
    const [commitMessage, setCommitMessage] = useState('')
    const [currentBranch, setCurrentBranch] = useState('')
    const [stagedFiles, setStagedFiles] = useState<GitStatusFile[]>([])
    const [changesFiles, setChangesFiles] = useState<GitStatusFile[]>([])
    const [error, setError] = useState('')
    const [selectedDiff, setSelectedDiff] = useState<{
        file: string
        type: 'staged' | 'changes'
        diff: string
    } | null>(null)

    // UI State
    const [stagedOpen, setStagedOpen] = useState(true)
    const [changesOpen, setChangesOpen] = useState(true)

    // Initial Check
    const checkIfRepo = useCallback(async () => {
        if (!rootPath) return
        try {
            // @ts-ignore
            const result = await connector.gitIsRepo(rootPath)
            setIsRepo(result.isRepo)
            if (result.isRepo) {
                fetchGitInfo()
            }
        } catch (e) {
            setIsRepo(false)
        }
    }, [rootPath])

    const fetchGitInfo = async () => {
        if (!rootPath) return
        setLoading(true)
        setError('')
        try {
            // @ts-ignore
            const branchRes = await connector.gitCurrentBranch(rootPath)
            if (branchRes.success) setCurrentBranch(branchRes.branch)

            // @ts-ignore
            const status: GitStatusFile[] = await connector.gitStatus(rootPath)

            if (Array.isArray(status)) {
                const staged: GitStatusFile[] = []
                const changes: GitStatusFile[] = []

                status.forEach((file) => {
                    const s = file.status
                    // Logic for Staged vs Changes
                    // 'M ' -> Staged Modified
                    // 'A ' -> Staged Added
                    // 'D ' -> Staged Deleted
                    // ' M' -> Unstaged Modified
                    // '??' -> Untracked (Changes)

                    // Simple heuristic: First char is index, second is work tree
                    const indexStatus = s[0]
                    const workTreeStatus = s[1]

                    if (indexStatus !== ' ' && indexStatus !== '?') {
                        staged.push({ status: indexStatus, file: file.file })
                    }
                    if (workTreeStatus !== ' ') {
                        changes.push({
                            status:
                                workTreeStatus === '?' ? 'U' : workTreeStatus,
                            file: file.file,
                        })
                    }
                })

                setStagedFiles(staged)
                setChangesFiles(changes)
            }
        } catch (e) {
            console.error(e)
            setError(e instanceof Error ? e.message : 'Failed to refresh git status.')
        } finally {
            setLoading(false)
        }
    }

    const handleCommit = async () => {
        if (!rootPath || !commitMessage) return
        setLoading(true)
        setError('')
        try {
            // @ts-ignore
            const result = await connector.gitCommit(rootPath, commitMessage)
            if (!result?.success) {
                throw new Error(result?.error || 'Commit failed.')
            }
            setCommitMessage('')
            await fetchGitInfo()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Commit failed.')
        } finally {
            setLoading(false)
        }
    }

    const handleDraftCommitMessage = async () => {
        if (!rootPath) return
        setDraftingMessage(true)
        setError('')
        try {
            // @ts-ignore
            const result = await connector.gitDiff(rootPath, undefined, 'head')
            if (!result?.success) {
                throw new Error(result?.error || 'Unable to read git diff.')
            }
            if (!result.diff?.trim()) {
                throw new Error('No changes found to summarize.')
            }
            const message = await draftCommitMessage(result.diff, settings)
            if (!message) throw new Error('AI did not return a commit message.')
            setCommitMessage(message)
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'Failed to draft commit message.'
            )
        } finally {
            setDraftingMessage(false)
        }
    }

    const handleStage = async (file: string) => {
        if (!rootPath) return
        try {
            // @ts-ignore
            const result = await connector.gitAdd(rootPath, file)
            if (!result?.success) throw new Error(result?.error || 'Stage failed.')
            fetchGitInfo()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Stage failed.')
        }
    }

    const handleUnstage = async (file: string) => {
        if (!rootPath) return
        try {
            // @ts-ignore
            const result = await connector.gitUnstage(rootPath, file)
            if (!result?.success) throw new Error(result?.error || 'Unstage failed.')
            fetchGitInfo()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unstage failed.')
        }
    }

    const handleOpenDiff = async (
        file: GitStatusFile,
        type: 'staged' | 'changes'
    ) => {
        if (!rootPath) return
        setError('')
        setSelectedDiff({ file: file.file, type, diff: 'Loading diff...' })
        try {
            // @ts-ignore
            const result = await connector.gitDiff(
                rootPath,
                file.file,
                type === 'staged' ? 'staged' : 'unstaged'
            )
            if (!result?.success) throw new Error(result?.error || 'Diff failed.')
            setSelectedDiff({
                file: file.file,
                type,
                diff: result.diff || 'No diff available for this file.',
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Diff failed.')
        }
    }

    const handlePush = async () => {
        // @ts-ignore
        if (rootPath) {
            const result = await connector.gitPush(rootPath)
            if (!result?.success) setError(result?.error || 'Push failed.')
            await fetchGitInfo()
        }
    }

    const handlePull = async () => {
        // @ts-ignore
        if (rootPath) {
            const result = await connector.gitPull(rootPath)
            if (!result?.success) setError(result?.error || 'Pull failed.')
            await fetchGitInfo()
        }
    }

    useEffect(() => {
        checkIfRepo()
        const interval = setInterval(fetchGitInfo, 10000)
        return () => clearInterval(interval)
    }, [checkIfRepo])

    if (!rootPath)
        return (
            <div className="p-5 text-[var(--ui-fg-muted)] text-[13px] text-center">
                No folder opened.
            </div>
        )
    if (!isRepo)
        return (
            <div className="flex flex-col items-center justify-center p-5 text-center h-full text-[var(--foreground)]">
                <p className="text-[var(--ui-fg-muted)] text-[13px] mb-4">
                    No git repository found.
                </p>
                <button
                    className="bg-[var(--button-primary)] text-[var(--white)] px-3 py-1.5 rounded-[2px] text-[13px] hover:bg-[var(--button-primary-hover)]"
                    // @ts-ignore
                    onClick={() =>
                        connector.gitInit(rootPath).then(checkIfRepo)
                    }
                >
                    Initialize Repository
                </button>
            </div>
        )

    return (
        <div className="flex flex-col h-full bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)]">
            {/* Header */}
            <div className="px-4 py-3 pb-2 flex justify-between items-center text-[11px] font-bold uppercase tracking-wider text-[var(--ui-fg-muted)] select-none border-b border-[var(--pane-border)]">
                <span>Source Control</span>
                <div className="flex gap-3 text-[14px]">
                    <button
                        title="View as Tree/List"
                        className="hover:text-[var(--foreground)]"
                    >
                        <FontAwesomeIcon icon={faEllipsis} />
                    </button>
                    <button
                        title="Refresh"
                        onClick={fetchGitInfo}
                        className={`hover:text-[var(--foreground)] ${
                            loading ? 'animate-spin' : ''
                        }`}
                    >
                        <FontAwesomeIcon icon={faRotateRight} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {/* Commit Section */}
                <div className="p-4 pb-3 border-b border-[var(--pane-border)]">
                    <div className="flex flex-col gap-2">
                        <textarea
                            className="bg-[var(--input-bg)] border border-[var(--input-border)] focus:border-[var(--input-border-focus)] rounded-[6px] p-2 text-[13px] text-[var(--input-fg)] outline-none resize-none placeholder:text-[var(--input-placeholder)] min-h-[56px]"
                            placeholder="Commit message"
                            rows={2}
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    (e.metaKey || e.ctrlKey)
                                ) {
                                    handleCommit()
                                }
                            }}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                className="rounded-[6px] border border-[var(--ui-border)] px-2 py-1.5 text-[12px] font-medium text-[var(--ui-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Draft a commit message from current changes"
                                onClick={handleDraftCommitMessage}
                                disabled={loading || draftingMessage}
                            >
                                <FontAwesomeIcon icon={faStar} />{' '}
                                {draftingMessage ? 'Drafting...' : 'AI Draft'}
                            </button>
                            <button
                                className="rounded-[6px] bg-[var(--button-primary)] px-2 py-1.5 text-[12px] font-medium text-[var(--white)] hover:bg-[var(--button-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
                                onClick={handleCommit}
                                disabled={loading || !commitMessage}
                            >
                                <FontAwesomeIcon icon={faCheck} /> Commit
                            </button>
                        </div>
                        <p className="text-[10px] text-[var(--ui-fg-muted)]">
                            AI Draft only fills the message box. It will not stage,
                            commit, or push.
                        </p>
                        {error && (
                            <div className="text-[11px] text-[var(--color-error)]">
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Branch Indicator */}
                <div className="px-4 py-2 flex items-center justify-between text-[13px] border-b border-[var(--pane-border)] hover:bg-[var(--ui-hover)]">
                    <div className="flex items-center gap-2">
                        <FontAwesomeIcon
                            icon={faCodeBranch}
                            className="text-[12px]"
                        />
                        <span>{currentBranch}</span>
                    </div>
                    <div className="flex gap-2 text-[12px]">
                        <button
                            title="Pull"
                            onClick={handlePull}
                            className="rounded px-1.5 py-1 text-[var(--ui-fg-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ui-fg)]"
                        >
                            <FontAwesomeIcon icon={faCloudArrowDown} />
                        </button>
                        <button
                            title="Push"
                            onClick={handlePush}
                            className="rounded px-1.5 py-1 text-[var(--ui-fg-muted)] hover:bg-[var(--ui-hover)] hover:text-[var(--ui-fg)]"
                        >
                            <FontAwesomeIcon icon={faCloudArrowUp} />
                        </button>
                    </div>
                </div>

                {/* Staged Changes */}
                {stagedFiles.length > 0 && (
                    <div className="flex flex-col mt-2">
                        <div
                            className="flex items-center px-2 py-1 cursor-pointer hover:bg-[var(--ui-hover)] group select-none"
                            onClick={() => setStagedOpen(!stagedOpen)}
                        >
                            <div className="w-5 text-center text-[var(--ui-fg-muted)] text-[10px]">
                                <FontAwesomeIcon
                                    icon={
                                        stagedOpen
                                            ? faChevronDown
                                            : faChevronRight
                                    }
                                />
                            </div>
                            <span className="text-[11px] font-bold uppercase text-[var(--ui-fg-muted)] tracking-wider">
                                Staged Changes
                            </span>
                            <span className="ml-2 text-[11px] bg-[var(--ui-bg-elevated)] text-[var(--ui-fg)] px-1.5 rounded-full">
                                {stagedFiles.length}
                            </span>
                        </div>
                        {stagedOpen && (
                            <div>
                                {stagedFiles.map((file, idx) => (
                                    <FileItem
                                        key={idx}
                                        file={file}
                                        type="staged"
                                        onOpenDiff={() =>
                                            handleOpenDiff(file, 'staged')
                                        }
                                        onUnstage={() =>
                                            handleUnstage(file.file)
                                        }
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Changes */}
                <div className="flex flex-col mt-2">
                    <div
                        className="flex items-center px-2 py-1 cursor-pointer hover:bg-[var(--ui-hover)] group select-none"
                        onClick={() => setChangesOpen(!changesOpen)}
                    >
                        <div className="w-5 text-center text-[var(--ui-fg-muted)] text-[10px]">
                            <FontAwesomeIcon
                                icon={
                                    changesOpen ? faChevronDown : faChevronRight
                                }
                            />
                        </div>
                        <span className="text-[11px] font-bold uppercase text-[var(--ui-fg-muted)] tracking-wider">
                            Changes
                        </span>
                        <span className="ml-2 text-[11px] bg-[var(--ui-bg-elevated)] text-[var(--ui-fg)] px-1.5 rounded-full">
                            {changesFiles.length}
                        </span>
                    </div>
                    {changesOpen && (
                        <div>
                            {changesFiles.map((file, idx) => (
                                <FileItem
                                    key={idx}
                                    file={file}
                                    type="changes"
                                    onStage={() => handleStage(file.file)}
                                    onOpenDiff={() =>
                                        handleOpenDiff(file, 'changes')
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
                {selectedDiff && (
                    <div className="m-3 border border-[var(--ui-border)] rounded bg-[var(--ui-bg-elevated)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ui-border)] text-[11px] text-[var(--ui-fg-muted)]">
                            <span className="truncate">
                                {selectedDiff.type === 'staged'
                                    ? 'Staged'
                                    : 'Changes'}{' '}
                                diff: {selectedDiff.file}
                            </span>
                            <button
                                onClick={() => setSelectedDiff(null)}
                                className="hover:text-[var(--ui-fg)]"
                                title="Close diff"
                            >
                                <FontAwesomeIcon icon={faXmark} />
                            </button>
                        </div>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-[11px] font-mono text-[var(--ui-fg)]">
                            {selectedDiff.diff}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    )
}

function FileItem({
    file,
    type,
    onStage,
    onUnstage,
    onOpenDiff,
}: {
    file: GitStatusFile
    type: 'staged' | 'changes'
    onStage?: () => void
    onUnstage?: () => void
    onOpenDiff?: () => void
}) {
    const icon = getIconElement(file.file)
    const fileName = file.file.split('/').pop() || file.file
    const dirPath = file.file.substring(0, file.file.length - fileName.length)

    // Status Color - Using semantic variables from theme system
    let statusColor = 'text-[var(--yellow)]' // Modified (M)
    if (file.status === 'A' || file.status === '?')
        statusColor = 'text-[var(--green)]'
    if (file.status === 'D') statusColor = 'text-[var(--red)]'
    if (file.status === 'U') statusColor = 'text-[var(--yellow)]' // Untracked/Modified proxy

    return (
        <div
            className="flex items-center px-2 py-[3px] hover:bg-[var(--sidebar-hover)] cursor-pointer group select-none pl-6 text-[var(--sidebar-fg)]"
            onClick={onOpenDiff}
        >
            <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                <div className="shrink-0 w-4 text-center">{icon}</div>
                <span
                    className={`text-[13px] ${
                        file.status === 'D'
                            ? 'line-through opacity-70'
                            : 'text-[var(--sidebar-fg)]'
                    } truncate`}
                >
                    {fileName}
                </span>
                <span className="text-[11px] text-[var(--ui-fg-muted)] truncate shrink-0 ml-1">
                    {dirPath}
                </span>
                <span className={`text-[12px] font-bold ${statusColor} ml-2`}>
                    {file.status === '?' ? 'U' : file.status}
                </span>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 mr-2">
                {type === 'changes' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onStage && onStage()
                        }}
                        className="hover:text-[var(--foreground)] text-[var(--ui-fg-muted)]"
                        title="Stage Changes"
                    >
                        <FontAwesomeIcon icon={faPlus} />
                    </button>
                )}
                {type === 'staged' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onUnstage && onUnstage()
                        }}
                        className="hover:text-[var(--foreground)] text-[var(--ui-fg-muted)]"
                        title="Unstage Changes"
                    >
                        <FontAwesomeIcon icon={faMinus} />
                    </button>
                )}
                {/* Open File or Discard could go here */}
            </div>
        </div>
    )
}
