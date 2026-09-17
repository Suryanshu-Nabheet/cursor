import React, { useEffect, useState } from 'react'
import { Codicon } from './codicon'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { getRootPath, getCurrentFileId } from '../features/selectors'
import { getSettings } from '../features/settings/settingsSelectors'
import {
    getInlineCompletionLastError,
    getInlineCompletionStatus,
} from '../features/ai/inlineCompletion'
import { getLanguageFromFilename } from '../features/extensions/utils'
import { getActiveTabId } from '../features/window/paneUtils'
import { getCodeMirrorView } from '../features/codemirror/codemirrorSlice'
import { getDiagnostics, lintState } from '../features/linter/lint'
import { openGit, expandLeftSide } from '../features/tools/toolSlice'
import { setSettingsTab } from '../features/settings/settingsSlice'
import type { FullState } from '../features/window/state'

function toLspServerName(languageId: string): string | null {
    const map: Record<string, string> = {
        typescript: 'typescript',
        typescriptreact: 'typescript',
        javascript: 'typescript',
        javascriptreact: 'typescript',
        python: 'python',
        html: 'html',
        css: 'css',
        scss: 'css',
        c: 'c',
        cpp: 'c',
        rust: 'rust',
        go: 'go',
        csharp: 'csharp',
        java: 'java',
        php: 'php',
    }
    return map[languageId] || null
}

function detectLanguageLabel(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string> = {
        ts: 'TypeScript',
        tsx: 'TypeScript React',
        js: 'JavaScript',
        jsx: 'JavaScript React',
        py: 'Python',
        java: 'Java',
        cpp: 'C++',
        c: 'C',
        h: 'C/C++ Header',
        rs: 'Rust',
        go: 'Go',
        rb: 'Ruby',
        php: 'PHP',
        html: 'HTML',
        css: 'CSS',
        scss: 'SCSS',
        json: 'JSON',
        md: 'Markdown',
        yaml: 'YAML',
        yml: 'YAML',
        xml: 'XML',
        sh: 'Shell',
        bash: 'Shell',
        zsh: 'Shell',
        sql: 'SQL',
        toml: 'TOML',
        vue: 'Vue',
        svelte: 'Svelte',
    }
    return languageMap[ext || ''] || (ext ? ext.toUpperCase() : 'Plain Text')
}

function detectLineEnding(contents: string): 'LF' | 'CRLF' | 'CR' {
    if (contents.includes('\r\n')) return 'CRLF'
    if (contents.includes('\r')) return 'CR'
    return 'LF'
}

function countActiveDiagnostics(state: FullState): {
    errors: number
    warnings: number
} {
    const tabId = getActiveTabId(state.global)
    if (tabId == null) return { errors: 0, warnings: 0 }
    const viewId = state.codeMirrorState.editorMap[tabId]
    if (viewId == null) return { errors: 0, warnings: 0 }
    const view = getCodeMirrorView(viewId)
    if (!view) return { errors: 0, warnings: 0 }
    const field = view.state.field(lintState, false)
    if (!field) return { errors: 0, warnings: 0 }
    const diags = getDiagnostics(field, view.state)
    let errors = 0
    let warnings = 0
    for (const d of diags) {
        if (d.severity === 'error') errors++
        else if (d.severity === 'warning') warnings++
    }
    return { errors, warnings }
}

export const StatusBar = () => {
    const dispatch = useAppDispatch()
    const rootPath = useAppSelector(getRootPath)
    const activeFileId = useAppSelector(getCurrentFileId)
    const settings = useAppSelector(getSettings)
    const fileName = useAppSelector((state) => {
        if (activeFileId == null) return ''
        return state.global.files[activeFileId]?.name || ''
    })
    const fileContents = useAppSelector((state) => {
        if (activeFileId == null) return ''
        return state.global.fileCache[activeFileId]?.contents || ''
    })
    const fullState = useAppSelector((s) => s as FullState)

    const languageId = fileName ? getLanguageFromFilename(fileName) : ''
    const lspServerName = languageId ? toLspServerName(languageId) : null
    const lspStatus = useAppSelector((state) =>
        lspServerName
            ? state.languageServerState.languageServers[lspServerName] || null
            : null
    )

    const [gitBranch, setGitBranch] = useState<string | null>(null)
    const [gitDirty, setGitDirty] = useState(false)
    const [isRepo, setIsRepo] = useState(false)
    const [problems, setProblems] = useState({ errors: 0, warnings: 0 })
    const [completionError, setCompletionError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const fetchGitInfo = async () => {
            if (!rootPath) {
                if (!cancelled) setIsRepo(false)
                return
            }
            try {
                // @ts-ignore
                const repoCheck = await connector.gitIsRepo(rootPath)
                if (!repoCheck?.isRepo) {
                    if (!cancelled) setIsRepo(false)
                    return
                }
                if (!cancelled) setIsRepo(true)
                // @ts-ignore
                const branchResult = await connector.gitCurrentBranch(rootPath)
                if (!cancelled && branchResult?.success) {
                    setGitBranch(branchResult.branch)
                }
                // @ts-ignore
                const status = await connector.gitStatus(rootPath)
                if (!cancelled && Array.isArray(status)) {
                    setGitDirty(status.length > 0)
                }
            } catch {
                if (!cancelled) setIsRepo(false)
            }
        }
        void fetchGitInfo()
        const interval = setInterval(fetchGitInfo, 4000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [rootPath])

    useEffect(() => {
        const tick = () => setProblems(countActiveDiagnostics(fullState))
        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [fullState, activeFileId])

    useEffect(() => {
        const update = () => setCompletionError(getInlineCompletionLastError())
        update()
        const interval = setInterval(update, 2000)
        return () => clearInterval(interval)
    }, [])

    const hasFile = activeFileId != null && !!fileName
    const language = hasFile ? detectLanguageLabel(String(fileName)) : null
    const lineEnding = hasFile
        ? detectLineEnding(String(fileContents || ''))
        : null
    const indentation = hasFile
        ? settings.insertSpaces === false
            ? `Tabs: ${settings.tabSize || 4}`
            : `Spaces: ${settings.tabSize || 4}`
        : null
    const totalProblems = problems.errors + problems.warnings
    const inlineStatus = getInlineCompletionStatus(settings)

    const lspLabel = (() => {
        if (!lspServerName) return null
        if (lspStatus?.running) return `LSP · ${lspServerName}`
        if (lspStatus?.installed) return `LSP · ${lspServerName} (stopped)`
        return null
    })()

    const openSettings = (tab: 'General' | 'AI' | 'Languages') => {
        dispatch(setSettingsTab(tab))
        // setSettingsTab already opens settings
    }

    return (
        <div className="status-bar">
            <div className="status-bar__left">
                {isRepo && gitBranch && (
                    <button
                        type="button"
                        className="status-bar__item status-bar__item--action"
                        title="Open Source Control"
                        onClick={() => {
                            dispatch(openGit())
                            dispatch(expandLeftSide())
                        }}
                    >
                        <Codicon
                            name="git-branch"
                            style={{ marginRight: 6, fontSize: 12 }}
                        />
                        <span>
                            {gitBranch}
                            {gitDirty ? '*' : ''}
                        </span>
                    </button>
                )}

                <div
                    className="status-bar__item"
                    title={`${problems.errors} errors, ${problems.warnings} warnings in active editor`}
                >
                    <Codicon
                        name={
                            problems.errors > 0
                                ? 'error'
                                : problems.warnings > 0
                                ? 'warning'
                                : 'check'
                        }
                        style={{
                            marginRight: 6,
                            fontSize: 12,
                            color:
                                problems.errors > 0
                                    ? 'var(--color-error)'
                                    : problems.warnings > 0
                                    ? 'var(--color-warning)'
                                    : 'var(--color-success)',
                        }}
                    />
                    <span>{totalProblems}</span>
                </div>

                {lspLabel && (
                    <button
                        type="button"
                        className="status-bar__item status-bar__item--action"
                        title="Language Servers"
                        onClick={() => openSettings('Languages')}
                    >
                        <Codicon
                            name="server-process"
                            style={{ marginRight: 6, fontSize: 12 }}
                        />
                        <span>{lspLabel}</span>
                    </button>
                )}
            </div>

            <div className="status-bar__right">
                {indentation && (
                    <button
                        type="button"
                        className="status-bar__item status-bar__item--action"
                        title="Editor indentation (Settings → General)"
                        onClick={() => openSettings('General')}
                    >
                        <span>{indentation}</span>
                    </button>
                )}
                {lineEnding && (
                    <div
                        className="status-bar__item"
                        title="Line ending (from file contents)"
                    >
                        <span>{lineEnding}</span>
                    </div>
                )}
                {language && (
                    <div className="status-bar__item" title="Language mode">
                        <span>{language}</span>
                    </div>
                )}
                <button
                    type="button"
                    className="status-bar__item status-bar__item--action"
                    title={
                        completionError
                            ? `Completion error: ${completionError}`
                            : `Completion: ${inlineStatus.reason}`
                    }
                    onClick={() => openSettings('AI')}
                >
                    <Codicon
                        name="lightbulb"
                        style={{ marginRight: 6, fontSize: 12 }}
                    />
                    <span>
                        {inlineStatus.enabled
                            ? completionError
                                ? 'AI error'
                                : `AI · ${inlineStatus.provider}`
                            : 'AI off'}
                    </span>
                </button>
            </div>
        </div>
    )
}
