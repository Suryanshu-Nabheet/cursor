/**
 * Code Block Component with Syntax Highlighting
 * Professional code rendering for AI chat
 */

import React, { useState, useCallback } from 'react'
import Prism from 'prismjs'
import 'prismjs/themes/prism-tomorrow.css' // Dark theme
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import { Codicon } from './codicon'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '../styles/aiCodeBlock.css'

// Language display name mapping
const LANGUAGE_DISPLAY: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    tsx: 'TSX',
    jsx: 'JSX',
    python: 'Python',
    bash: 'Bash',
    sh: 'Shell',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    markdown: 'Markdown',
    md: 'Markdown',
    yaml: 'YAML',
    yml: 'YAML',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    plaintext: 'Text',
    text: 'Text',
}

function getLanguageDisplayName(lang: string): string {
    return LANGUAGE_DISPLAY[lang.toLowerCase()] || lang.toUpperCase()
}

interface CodeBlockProps {
    code: string
    language?: string
    filename?: string
    showLineNumbers?: boolean
    onApply?: () => void
}

export function CodeBlock({
    code,
    language = 'typescript',
    filename,
    showLineNumbers = false,
    onApply,
}: CodeBlockProps) {
    const [copied, setCopied] = useState(false)
    const [linesVisible, setLinesVisible] = useState(showLineNumbers)

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [code])

    // Highlight code
    const highlighted = React.useMemo(() => {
        try {
            const normalizedLang = language.toLowerCase()
            // Map aliases
            const langMap: Record<string, string> = {
                ts: 'typescript',
                js: 'javascript',
                sh: 'bash',
                shell: 'bash',
                yml: 'yaml',
                md: 'markdown',
                cpp: 'cpp',
                c: 'c',
            }
            const resolvedLang = langMap[normalizedLang] || normalizedLang
            const grammar = Prism.languages[resolvedLang] || Prism.languages.typescript || Prism.languages.plaintext
            if (!grammar) return escapeHtml(code)
            return Prism.highlight(code, grammar, resolvedLang)
        } catch (e) {
            return escapeHtml(code)
        }
    }, [code, language])

    const lines = code.split('\n')
    const displayLang = getLanguageDisplayName(language)

    return (
        <div className="code-block-container">
            {/* Header */}
            <div className="code-block-header">
                <div className="code-block-info">
                    <span className="code-block-lang-badge">{displayLang}</span>
                    {filename && (
                        <span className="code-block-filename">
                            <Codicon name="file" style={{ fontSize: '10px', marginRight: '4px' }} />
                            {filename}
                        </span>
                    )}
                    <span className="code-block-line-count">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="code-block-actions">
                    <button
                        className="code-block-action-btn"
                        onClick={() => setLinesVisible(!linesVisible)}
                        title={linesVisible ? 'Hide line numbers' : 'Show line numbers'}
                    >
                        <Codicon name="list-ordered" style={{ fontSize: '11px' }} />
                    </button>
                    {onApply && (
                        <button
                            className="code-block-action-btn code-block-apply-btn"
                            onClick={onApply}
                            title="Apply to file"
                        >
                            <Codicon name="check" style={{ fontSize: '12px' }} />
                            Apply
                        </button>
                    )}
                    <button
                        className="code-block-action-btn"
                        onClick={handleCopy}
                        title="Copy code"
                    >
                        <Codicon name={copied ? 'check' : 'copy'} style={{ fontSize: '12px' }} />
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
            </div>

            {/* Code */}
            <div className="code-block-content">
                {linesVisible ? (
                    <div className="code-block-with-lines">
                        <div className="code-block-line-numbers">
                            {lines.map((_, i) => (
                                <div key={i} className="code-block-line-number">
                                    {i + 1}
                                </div>
                            ))}
                        </div>
                        <pre className="code-block-pre">
                            <code
                                className={`language-${language}`}
                                dangerouslySetInnerHTML={{
                                    __html: highlighted,
                                }}
                            />
                        </pre>
                    </div>
                ) : (
                    <pre className="code-block-pre">
                        <code
                            className={`language-${language}`}
                            dangerouslySetInnerHTML={{ __html: highlighted }}
                        />
                    </pre>
                )}
            </div>
        </div>
    )
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

/**
 * Tool Call Display Component
 */
interface ToolCallCardProps {
    toolName: string
    arguments: Record<string, any>
    argumentsRaw?: string
    result?: string
    success?: boolean
    isExecuting?: boolean
    isPending?: boolean
    needsApproval?: boolean
    onAccept?: () => void
    onReject?: () => void
}

export function ToolCallCard({
    toolName,
    arguments: args,
    argumentsRaw,
    result,
    success,
    isExecuting,
    isPending,
    needsApproval,
    onAccept,
    onReject,
}: ToolCallCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    // Force expansion if waiting for approval
    React.useEffect(() => {
        if (needsApproval) setIsExpanded(true)
    }, [needsApproval])

    const getToolIcon = (name: string) => {
        const icons: Record<string, string> = {
            read_file: 'file-text',
            write_file: 'new-file',
            edit_file: 'edit',
            list_files: 'list-tree',
            create_directory: 'new-folder',
            delete_file: 'trash',
            run_terminal_command: 'terminal',
            run_command: 'terminal',
            search_code: 'search',
            get_diagnostics: 'warning',
            open_file: 'go-to-file',
            get_file_outline: 'symbol-structure',
            list_dir: 'folder',
        }
        return <Codicon name={icons[name] || 'tools'} />
    }

    const getToolStatusColor = () => {
        if (isPending) return 'text-ui-fg-muted'
        if (needsApproval) return 'text-ui-fg-muted'
        if (isExecuting) return 'text-accent'
        if (success === true) return 'text-success'
        if (success === false) return 'text-danger'
        return 'text-ui-fg-muted'
    }

    const getToolLabel = (name: string, args: Record<string, any>) => {
        if (name === 'read_file' || name === 'write_file' || name === 'edit_file') {
            const path = args.TargetPath || args.TargetFile || args.path || args.filename
            if (path) {
                const parts = path.split('/')
                const filename = parts[parts.length - 1]
                const action = name.includes('read') ? 'Read' : name.includes('write') ? 'Write' : 'Edit'
                return (
                    <span className="flex items-center gap-1.5 text-[12px]">
                        <span className="text-ui-fg-muted">{action}</span>
                        <span className="text-ui-fg font-medium">{filename}</span>
                    </span>
                )
            }
        }
        if (name === 'list_dir' || name === 'list_files') {
            const path = args.DirectoryPath || args.path || './'
            return (
                <span className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-ui-fg-muted">List</span>
                    <span className="text-ui-fg font-medium">{path}</span>
                </span>
            )
        }
        if (name === 'run_command' || name === 'run_terminal_command') {
            return (
                <span className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-ui-fg-muted">Run</span>
                    <span className="text-ui-fg font-medium font-mono text-[11px] opacity-80">
                        {(args.command || args.CommandLine || 'command').slice(0, 50)}
                    </span>
                </span>
            )
        }

        return (
            <span className="flex items-center gap-1.5 text-[12px]">
                <span className="text-ui-fg-muted">
                    {name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
            </span>
        )
    }

    return (
        <div
            className={`my-0.5 rounded-md transition-all ${
                needsApproval
                    ? 'bg-transparent'
                    : 'bg-transparent hover:bg-ui-hover'
            } ${success === true ? 'opacity-75' : ''}`}
        >
            <div
                className="flex items-center px-3 py-1.5 cursor-pointer min-h-[28px] gap-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className={`text-[14px] w-5 flex items-center justify-center ${getToolStatusColor()}`}>
                    {getToolIcon(toolName)}
                </span>
                
                {getToolLabel(toolName, args)}

                <div className="ml-auto flex items-center gap-3">
                    {needsApproval && !isExecuting && (
                        <span className="text-ui-fg-muted text-[10px] font-medium border border-ui-border bg-ui-bg-elevated px-1.5 py-0.5 rounded">Review</span>
                    )}
                    {isPending && !isExecuting && (
                        <div className="text-ui-fg-muted text-[10px]">
                            <Codicon name="loading" className="codicon-modifier-spin" />
                        </div>
                    )}
                    {isExecuting && (
                        <div className="text-ui-fg-muted text-[10px]">
                            <Codicon name="loading" className="codicon-modifier-spin" />
                        </div>
                    )}
                    {success === true && (
                        <div className="text-success text-[12px]">
                            <Codicon name="check" />
                        </div>
                    )}
                    {success === false && (
                        <div className="text-danger text-[12px]">
                            <Codicon name="error" />
                        </div>
                    )}
                    <button className="bg-transparent border-none p-0.5 text-ui-fg-muted opacity-30 text-[10px] flex items-center hover:opacity-100 hover:bg-ui-hover rounded cursor-pointer transition-all">
                        <Codicon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="pt-1 pb-3 pl-10 pr-3 border-l border-ui-border ml-[21px]">
                    <div className="mb-2">
                        <div className="text-[10px] font-semibold text-ui-fg-muted mb-1 uppercase tracking-wide">Arguments</div>
                        <pre className="bg-ui-bg-elevated border border-ui-border rounded-md px-3 py-2 font-mono text-[11px] text-ui-fg overflow-x-auto m-0">
                            {argumentsRaw || JSON.stringify(args, null, 2)}
                        </pre>
                    </div>

                    {result && (
                        <div className="mb-2">
                            <div className="text-[10px] font-semibold text-ui-fg-muted mb-1 uppercase tracking-wide">Result</div>
                            <pre className="bg-ui-bg-elevated border border-ui-border rounded-md px-3 py-2 font-mono text-[11px] text-ui-fg overflow-x-auto m-0">{result}</pre>
                        </div>
                    )}

                    {needsApproval && !isExecuting && success === undefined && (
                        <div className="flex gap-2 mt-2">
                            <button
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-all bg-transparent text-success hover:bg-ui-hover border border-ui-border"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onAccept?.()
                                }}
                            >
                                <Codicon name="check" /> Approve
                            </button>
                            <button
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md cursor-pointer transition-all border border-ui-border bg-transparent text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onReject?.()
                                }}
                            >
                                <Codicon name="close" /> Reject
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * Diff View Component (for showing before/after)
 */
interface DiffViewProps {
    before: string
    after: string
    language?: string
}

export function DiffView({
    before,
    after,
    language = 'typescript',
}: DiffViewProps) {
    return (
        <div className="diff-view">
            <div className="diff-pane diff-before">
                <div className="diff-header">Before</div>
                <CodeBlock code={before} language={language} />
            </div>
            <div className="diff-pane diff-after">
                <div className="diff-header">After</div>
                <CodeBlock code={after} language={language} />
            </div>
        </div>
    )
}

/**
 * Plan Card Component
 * Renders the execution plan
 */
export function PlanCard({ planMarkdown }: { planMarkdown: string }) {
    const [collapsed, setCollapsed] = useState(false)
    if (!planMarkdown) return null
    return (
        <div className="plan-card">
            <div className="plan-header" onClick={() => setCollapsed(!collapsed)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                <Codicon
                    name="list-ordered"
                    style={{ marginRight: '8px', fontSize: '12px' }}
                />
                EXECUTION PLAN
                <Codicon
                    name={collapsed ? 'chevron-right' : 'chevron-down'}
                    style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.6 }}
                />
            </div>
            {!collapsed && (
                <div className="plan-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {planMarkdown}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    )
}
