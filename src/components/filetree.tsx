import React, { useEffect } from 'react'
import { ExplorerEmptyState } from './explorerEmptyState'

import { useAppDispatch, useAppSelector } from '../app/hooks'
import { Codicon } from './codicon'
import * as gs from '../features/globalSlice'

import {
    getDepth,
    getFile,
    getFolder,
    getFolderOpen,
    getNotDeletedFiles,
} from '../features/selectors'
import posthog from 'posthog-js'

const offset = (depth: number) => `${depth * 14 + 16}px`

export function getIconElement(fname: string) {
    const ext = fname.split('.').pop()?.toLowerCase() || ''

    // exact names
    if (fname.toLowerCase() === 'package.json')
        return <Codicon name="gear" className="file-icon icon--json" />
    if (fname.toLowerCase().includes('config'))
        return <Codicon name="gear" className="file-icon icon--config" />
    if (fname.toLowerCase().startsWith('readme'))
        return <Codicon name="markdown" className="file-icon icon--md" />
    if (fname.toLowerCase().includes('license'))
        return <Codicon name="file-text" className="file-icon icon--config" />

    // language mappings
    if (['js', 'cjs', 'mjs'].includes(ext))
        return <Codicon name="file-code" className="file-icon icon--js" />
    if (ext === 'ts')
        return <Codicon name="file-code" className="file-icon icon--ts" />
    if (ext === 'tsx' || ext === 'jsx')
        return <Codicon name="file-code" className="file-icon icon--react" />
    if (ext === 'py')
        return <Codicon name="file-code" className="file-icon icon--py" />
    if (ext === 'html' || ext === 'htm')
        return <Codicon name="file-code" className="file-icon icon--html" />
    if (['css', 'scss', 'sass', 'less'].includes(ext))
        return <Codicon name="symbol-color" className="file-icon icon--css" />
    if (ext === 'md' || ext === 'markdown')
        return <Codicon name="markdown" className="file-icon icon--md" />
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext))
        return <Codicon name="file-media" className="file-icon icon--img" />
    if (['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1'].includes(ext))
        return <Codicon name="terminal" className="file-icon icon--config" />
    if (ext === 'pdf')
        return <Codicon name="file-pdf" className="file-icon icon--config" />
    if (ext === 'csv')
        return <Codicon name="table" className="file-icon icon--config" />
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext))
        return <Codicon name="file-binary" className="file-icon icon--config" />
    if (ext === 'sql' || ext === 'db')
        return <Codicon name="database" className="file-icon icon--config" />

    return (
        <Codicon name="file" className="file-icon" style={{ opacity: 0.4 }} />
    )
}

function getFolderIcon(
    name: string,
    isOpen: boolean
): { codiconName: string; className: string } {
    const lname = name.toLowerCase()

    if (lname === '.github' || lname === '.git')
        return {
            codiconName: isOpen ? 'folder-opened' : 'folder',
            className: 'icon--config',
        }
    if (lname === 'node_modules' || lname === 'dist' || lname === 'build')
        return { codiconName: 'package', className: 'icon--config' }
    if (lname === 'src')
        return {
            codiconName: isOpen ? 'folder-opened' : 'folder',
            className: 'icon--ts',
        }
    if (lname === 'components')
        return { codiconName: 'extensions', className: 'icon--react' }
    if (lname === 'assets' || lname === 'public')
        return { codiconName: 'file-media', className: 'icon--img' }
    if (lname === 'tests' || lname === '__tests__')
        return { codiconName: 'beaker', className: 'icon--py' }
    if (lname === 'theme' || lname === 'styles')
        return { codiconName: 'symbol-color', className: 'icon--css' }

    return {
        codiconName: isOpen ? 'folder-opened' : 'folder',
        className: 'icon--folder',
    }
}

function File({ fid }: { fid: number }) {
    const dispatch = useAppDispatch()
    const file = useAppSelector(getFile(fid))
    const depth = useAppSelector(getDepth(fid, true))

    if (!file || file.name.startsWith('extension://')) return null

    const iconElement = getIconElement(file.name)

    return (
        <div
            className={`file__line group ${
                file.isSelected ? 'file__line_selected' : ''
            }`}
            style={{ paddingLeft: offset(depth) }}
            onClick={() => {
                posthog.capture('Selected File From File Tree', {})
                dispatch(gs.selectFile(fid))
            }}
            onContextMenu={() => dispatch(gs.rightClickFile(fid))}
        >
            <div className="file__icon">{iconElement}</div>
            {file.renameName != null ? (
                <input
                    autoFocus
                    className="file__nameinput"
                    value={file.renameName}
                    onChange={(e) =>
                        dispatch(
                            gs.updateRenameName({
                                fid,
                                new_name: e.target.value,
                            })
                        )
                    }
                    onKeyDown={(e) => {
                        if (e.key == 'Enter') dispatch(gs.commitRename({ fid }))
                        if (e.key == 'Escape') dispatch(gs.cancelRename())
                    }}
                    onBlur={() => dispatch(gs.commitRename({ fid }))}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <div className="file__name truncate" style={{ flexGrow: 1 }}>
                    {file.name}
                </div>
            )}
            {!file.saved && (
                <div className="file__status">
                    <Codicon
                        name="circle-filled"
                        style={{ fontSize: '6px', color: 'var(--amber)' }}
                    />
                </div>
            )}
        </div>
    )
}

function Folder({ fid }: { fid: number }) {
    const isOpen = useAppSelector(getFolderOpen(fid))
    const dispatch = useAppDispatch()
    const folder = useAppSelector(getFolder(fid))
    const fileChildren = useAppSelector(getNotDeletedFiles(fid))
    const folderDepth = useAppSelector(getDepth(fid))

    const toggleOpen = () => {
        dispatch(gs.loadFolder({ folderId: fid, goDeep: false }))
        dispatch(gs.setFolderOpen({ folderId: fid, isOpen: !isOpen }))
    }

    useEffect(() => {
        if (folderDepth === 0) {
            dispatch(gs.setFolderOpen({ folderId: fid, isOpen: true }))
        }
    }, [folderDepth, dispatch, fid])

    return (
        <div className="folder" style={{ flexShrink: 0 }}>
            <div
                className="folder__line group"
                style={{ paddingLeft: offset(folderDepth) }}
                onClick={toggleOpen}
                onContextMenu={() => {
                    dispatch(gs.setFolderOpen({ folderId: fid, isOpen: true }))
                    dispatch(gs.rightClickFolder(fid))
                }}
            >
                <div className="folder__icon">
                    <Codicon
                        name={isOpen ? 'chevron-down' : 'chevron-right'}
                        style={{ fontSize: '10px', opacity: 0.5 }}
                    />
                </div>
                {(() => {
                    const { codiconName, className } = getFolderIcon(
                        folder.name,
                        isOpen
                    )
                    return (
                        <Codicon
                            name={codiconName}
                            className={`file-icon ${className}`}
                            style={{
                                marginRight: '8px',
                                opacity: 0.9,
                                fontSize: '14px',
                            }}
                        />
                    )
                })()}

                {folder.renameName != null ? (
                    <input
                        autoFocus
                        className="folder__nameinput"
                        value={folder.renameName}
                        onChange={(e) =>
                            dispatch(
                                gs.updateRenameName({
                                    fid,
                                    new_name: e.target.value,
                                    isFolder: true,
                                })
                            )
                        }
                        onKeyDown={(e) => {
                            if (e.key == 'Enter')
                                dispatch(
                                    gs.commitRename({ fid, isFolder: true })
                                )
                            if (e.key == 'Escape') dispatch(gs.cancelRename())
                        }}
                        onBlur={() =>
                            dispatch(gs.commitRename({ fid, isFolder: true }))
                        }
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div
                        className="folder__name truncate"
                        style={{ flexGrow: 1 }}
                    >
                        {folder.name}
                    </div>
                )}

                <div className="folder__hoverbuttons">
                    <div
                        className="folder__hoverbutton"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch(gs.newFile({ parentFolderId: fid }))
                        }}
                    >
                        <Codicon name="new-file" style={{ fontSize: '12px' }} />
                    </div>
                    <div
                        className="folder__hoverbutton"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch(gs.newFolder({ parentFolderId: fid }))
                        }}
                    >
                        <Codicon
                            name="new-folder"
                            style={{ fontSize: '12px' }}
                        />
                    </div>
                </div>
            </div>
            {isOpen && (
                <div className="folder__below">
                    {folder.folderIds?.map((fid: number) => {
                        return <Folder key={`folder-${fid}`} fid={fid} />
                    })}
                    {fileChildren.map((fid: number) => {
                        return <File key={`file-${fid}`} fid={fid} />
                    })}
                </div>
            )}
        </div>
    )
}

export function FileTree() {
    const rootFolderId = 1
    const dispatch = useAppDispatch()
    const rootFolder = useAppSelector(getFolder(rootFolderId))
    const isOpen = useAppSelector(getFolderOpen(rootFolderId))
    const fileChildren = useAppSelector(getNotDeletedFiles(rootFolderId))

    useEffect(() => {
        if (rootFolderId) {
            dispatch(gs.setFolderOpen({ folderId: rootFolderId, isOpen: true }))
        }
    }, [dispatch])

    if (!rootFolder) {
        return <ExplorerEmptyState />
    }

    const toggleOpen = () => {
        dispatch(gs.loadFolder({ folderId: rootFolderId, goDeep: false }))
        dispatch(gs.setFolderOpen({ folderId: rootFolderId, isOpen: !isOpen }))
    }

    return (
        <div className="app__sidebar-panel__view">
            {/* Sticky project header */}
            <div className="pane-header">
                {/* Left: Project Name */}
                <div
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                    onClick={toggleOpen}
                >
                    <Codicon
                        name={isOpen ? 'chevron-down' : 'chevron-right'}
                        style={{ fontSize: '9px', opacity: 0.7 }}
                    />
                    <div className="truncate font-bold text-[11px]">
                        {rootFolder.name}
                    </div>
                </div>

                {/* Right: Action Buttons */}
                <div className="flex items-center gap-0.5">
                    <button
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--ui-hover)] text-[var(--ui-fg-muted)] hover:text-[var(--ui-fg)] transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch(
                                gs.newFile({ parentFolderId: rootFolderId })
                            )
                        }}
                        title="New File"
                        type="button"
                    >
                        <Codicon name="new-file" style={{ fontSize: '13px' }} />
                    </button>
                    <button
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--ui-hover)] text-[var(--ui-fg-muted)] hover:text-[var(--ui-fg)] transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch(
                                gs.newFolder({ parentFolderId: rootFolderId })
                            )
                        }}
                        title="New Folder"
                        type="button"
                    >
                        <Codicon
                            name="new-folder"
                            style={{ fontSize: '13px' }}
                        />
                    </button>
                    <button
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--ui-hover)] text-[var(--ui-fg-muted)] hover:text-[var(--ui-fg)] transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            dispatch(
                                gs.loadFolder({
                                    folderId: rootFolderId,
                                    goDeep: true,
                                })
                            )
                        }}
                        title="Refresh Explorer"
                        type="button"
                    >
                        <Codicon name="refresh" style={{ fontSize: '13px' }} />
                    </button>
                </div>
            </div>

            {/* Scrollable content */}
            <div
                className="filetree__content"
                style={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}
            >
                {isOpen && (
                    <>
                        {rootFolder.folderIds?.map((fid: number) => {
                            return <Folder key={`folder-${fid}`} fid={fid} />
                        })}
                        {fileChildren.map((fid: number) => {
                            return <File key={`file-${fid}`} fid={fid} />
                        })}
                    </>
                )}
            </div>
        </div>
    )
}
