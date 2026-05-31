/**
 * Builds a live workspace context snapshot for the AI sidebar.
 * Pulls from Redux state, open editors, LSP/lint diagnostics, and git.
 */
import { FullState } from '../window/state'
import { getPathForFileId, getRelativePathForFileId } from '../window/fileUtils'
import { getActiveTabId, getActiveFileId } from '../window/paneUtils'
import { getCodeMirrorView } from '../codemirror/codemirrorSlice'
import { getLanguageFromFilename } from '../extensions/utils'
import { lintState, getDiagnostics, Diagnostic } from '../linter/lint'
import { AI_SYSTEM_PROMPT } from './prompt'

export const WORKSPACE_CONTEXT_HEADER = '# WORKSPACE CONTEXT'

const MAX_ACTIVE_FILE_CHARS = 14_000
const MAX_OTHER_FILE_SNIPPET = 2_000
const MAX_DIAGNOSTICS = 60
const MAX_GIT_FILES = 80

function getConnector() {
    if (typeof connector !== 'undefined') return connector
    if (typeof window !== 'undefined' && (window as any).connector) {
        return (window as any).connector
    }
    return null
}

function getLiveEditorContent(state: FullState, tabId: number, fileId: number): string {
    const viewId = state.codeMirrorState.editorMap[tabId]
    if (viewId) {
        const view = getCodeMirrorView(viewId)
        if (view) return view.state.doc.toString()
    }
    return state.global.fileCache[fileId]?.contents ?? ''
}

function getEditorDiagnostics(state: FullState, tabId: number): Diagnostic[] {
    const viewId = state.codeMirrorState.editorMap[tabId]
    if (!viewId) return []
    const view = getCodeMirrorView(viewId)
    if (!view) return []
    const ls = view.state.field(lintState, false)
    if (!ls) return []
    return getDiagnostics(ls, view.state).filter(
        d => d.severity === 'error' || d.severity === 'warning'
    )
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
    if (text.length <= max) return { text, truncated: false }
    return {
        text: text.slice(0, max) + `\n… [truncated ${text.length - max} chars]`,
        truncated: true,
    }
}

function formatDiagnostics(path: string, diags: Diagnostic[]): string[] {
    return diags.slice(0, MAX_DIAGNOSTICS).map(d =>
        `- L${d.line}:${d.col} [${d.severity}] ${d.message}${d.source ? ` (${d.source})` : ''}`
    )
}

function getOpenEditorTabs(state: FullState) {
    const global = state.global
    const seenFileIds = new Set<number>()
    const tabs: Array<{
        tabId: number
        fileId: number
        path: string
        relPath: string
        isActive: boolean
        saved: boolean
        language: string
    }> = []

    for (const tabIdStr of Object.keys(global.tabs)) {
        const tab = global.tabs[parseInt(tabIdStr, 10)]
        if (!tab || tab.isChat) continue
        const tabId = parseInt(tabIdStr, 10)
        const fileId = tab.fileId
        if (seenFileIds.has(fileId)) continue
        seenFileIds.add(fileId)

        const path = getPathForFileId(global, fileId)
        if (!path) continue
        const relPath =
            getRelativePathForFileId(global, fileId) ||
            path.split('/').pop() ||
            path

        tabs.push({
            tabId,
            fileId,
            path,
            relPath,
            isActive: tab.isActive,
            saved: global.files[fileId]?.saved ?? true,
            language: getLanguageFromFilename(path),
        })
    }

    tabs.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return a.relPath.localeCompare(b.relPath)
    })
    return tabs
}

async function fetchGitSummary(rootPath: string): Promise<string[]> {
    const conn = getConnector()
    if (!conn?.gitStatus) return []

    try {
        const [statusFiles, branchResult] = await Promise.all([
            conn.gitStatus(rootPath),
            conn.gitCurrentBranch?.(rootPath).catch?.(() => null) ?? null,
        ])

        const lines: string[] = []
        const branch =
            branchResult?.success && branchResult.branch
                ? branchResult.branch
                : 'unknown'
        lines.push(`Branch: ${branch}`)

        const files = (statusFiles || []).slice(0, MAX_GIT_FILES)
        if (files.length === 0) {
            lines.push('Working tree clean')
        } else {
            for (const f of files) {
                lines.push(`- [${f.status.trim() || '?'}] ${f.file}`)
            }
            if ((statusFiles || []).length > MAX_GIT_FILES) {
                lines.push(`… and ${statusFiles.length - MAX_GIT_FILES} more`)
            }
        }
        return lines
    } catch {
        return []
    }
}

function readConfigSnippet(state: FullState, relPath: string): string | null {
    const global = state.global
    for (const tab of getOpenEditorTabs(state)) {
        if (tab.relPath === relPath || tab.relPath.endsWith(`/${relPath}`)) {
            const content = getLiveEditorContent(state, tab.tabId, tab.fileId)
            if (content) return truncate(content, 1500).text
        }
    }
    for (const [fileIdStr, file] of Object.entries(global.files)) {
        const fileId = parseInt(fileIdStr, 10)
        const path = getRelativePathForFileId(global, fileId)
        if (path === relPath || path?.endsWith(`/${relPath}`)) {
            const content = global.fileCache[fileId]?.contents
            if (content) return truncate(content, 1500).text
        }
    }
    return null
}

export async function buildWorkspaceContext(state: FullState): Promise<string> {
    const global = state.global
    const rootPath = global.rootPath
    const lines: string[] = [
        WORKSPACE_CONTEXT_HEADER,
        'Live IDE snapshot — prefer this over assumptions. Re-read files with tools before editing.',
        '',
    ]

    if (!rootPath) {
        lines.push('## Project', '- No folder open', '')
        return lines.join('\n')
    }

    const projectName = rootPath.split('/').pop() || rootPath
    lines.push('## Project', `- Root: ${rootPath}`, `- Name: ${projectName}`, '')

    const openTabs = getOpenEditorTabs(state)
    const activeTabId = getActiveTabId(global)
    const activeFileId = getActiveFileId(global)
    const activeTab = openTabs.find(t => t.tabId === activeTabId)

    if (activeTab && activeFileId != null) {
        const viewId = state.codeMirrorState.editorMap[activeTab.tabId]
        const view = viewId ? getCodeMirrorView(viewId) : null
        const content = getLiveEditorContent(state, activeTab.tabId, activeTab.fileId)
        const { text: fileBody } = truncate(content, MAX_ACTIVE_FILE_CHARS)

        let cursorLine = 1
        let cursorCol = 1
        let selectionInfo = ''
        if (view) {
            const pos = view.state.selection.main
            const line = view.state.doc.lineAt(pos.head)
            cursorLine = line.number
            cursorCol = pos.head - line.from + 1
            if (!pos.empty) {
                const fromLine = view.state.doc.lineAt(pos.from).number
                const toLine = view.state.doc.lineAt(pos.to).number
                selectionInfo = `- Selection: lines ${fromLine}–${toLine}`
            }
        }

        lines.push(
            '## Active Editor',
            `- File: ${activeTab.relPath}`,
            `- Absolute: ${activeTab.path}`,
            `- Language: ${activeTab.language}`,
            `- Cursor: line ${cursorLine}, col ${cursorCol}`,
            `- Unsaved: ${activeTab.saved ? 'no' : 'yes'}`,
        )
        if (selectionInfo) lines.push(selectionInfo)
        lines.push('', '### Active File Content', '```', fileBody, '```', '')
    } else {
        lines.push('## Active Editor', '- No file focused', '')
    }

    if (openTabs.length > 0) {
        lines.push('## Open Files')
        for (const tab of openTabs) {
            const diags = getEditorDiagnostics(state, tab.tabId)
            const errCount = diags.filter(d => d.severity === 'error').length
            const warnCount = diags.filter(d => d.severity === 'warning').length
            const flags = [
                tab.isActive ? 'active' : null,
                tab.saved ? null : 'unsaved',
                errCount ? `${errCount} error${errCount !== 1 ? 's' : ''}` : null,
                warnCount ? `${warnCount} warning${warnCount !== 1 ? 's' : ''}` : null,
            ].filter(Boolean)
            lines.push(`- ${tab.relPath}${flags.length ? ` (${flags.join(', ')})` : ''}`)
        }
        lines.push('')
    }

    const allDiags: { path: string; diags: Diagnostic[] }[] = []
    for (const tab of openTabs) {
        const diags = getEditorDiagnostics(state, tab.tabId)
        if (diags.length) allDiags.push({ path: tab.relPath, diags })
    }

    if (allDiags.length > 0) {
        lines.push('## Diagnostics (open files)')
        let total = 0
        for (const { path, diags } of allDiags) {
            if (total >= MAX_DIAGNOSTICS) break
            lines.push(`### ${path}`)
            const formatted = formatDiagnostics(path, diags)
            lines.push(...formatted)
            total += formatted.length
        }
        lines.push('')
    }

    const unsaved = openTabs.filter(t => !t.saved)
    if (unsaved.length > 0) {
        lines.push('## Unsaved Buffers')
        for (const tab of unsaved) {
            if (tab.tabId === activeTab?.tabId) {
                lines.push(`- ${tab.relPath} (shown above)`)
                continue
            }
            const snippet = truncate(
                getLiveEditorContent(state, tab.tabId, tab.fileId),
                MAX_OTHER_FILE_SNIPPET
            )
            lines.push(`- ${tab.relPath}`, '```', snippet.text, '```')
        }
        lines.push('')
    }

    const gitLines = await fetchGitSummary(rootPath)
    if (gitLines.length > 0) {
        lines.push('## Git', ...gitLines, '')
    }

    const pkg = readConfigSnippet(state, 'package.json')
    if (pkg) {
        lines.push('## package.json (snippet)', '```json', pkg, '```', '')
    }
    const tsconfig = readConfigSnippet(state, 'tsconfig.json')
    if (tsconfig) {
        lines.push('## tsconfig.json (snippet)', '```json', tsconfig, '```', '')
    }

    lines.push(
        '## Agent Notes',
        '- Use read_file / list_files / search_code for anything not shown here.',
        '- edit_file requires exact oldText — always read_file first.',
        '- Diagnostics and unsaved buffers reflect current editor state.',
    )

    return lines.join('\n')
}

export function injectWorkspaceContext(
    messages: Array<{ role: string; content: string | null; [key: string]: any }>,
    workspaceContext: string
): typeof messages {
    const filtered = messages.filter(
        m =>
            !(
                m.role === 'system' &&
                typeof m.content === 'string' &&
                m.content.startsWith(WORKSPACE_CONTEXT_HEADER)
            )
    )

    const hasSystemPrompt = filtered.some(
        m => m.role === 'system' && m.content === AI_SYSTEM_PROMPT
    )

    const rest = hasSystemPrompt
        ? filtered
        : [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...filtered]

    const promptIdx = rest.findIndex(
        m => m.role === 'system' && m.content === AI_SYSTEM_PROMPT
    )

    if (promptIdx === -1) {
        return [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'system', content: workspaceContext },
            ...rest,
        ]
    }

    return [
        ...rest.slice(0, promptIdx + 1),
        { role: 'system', content: workspaceContext },
        ...rest.slice(promptIdx + 1),
    ]
}
