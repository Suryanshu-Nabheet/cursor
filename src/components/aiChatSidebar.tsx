/**
 * AIChatSidebar — Advanced Agentic AI Assistant
 * All styling via Tailwind utility classes.
 * Single unified message per AI turn (no fragmented bubbles).
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { Codicon } from './codicon'
import * as ts from '../features/tools/toolSlice'
import { getActiveProviderAPIKey } from '../features/ai/apiKeyUtils'
import {
    streamAIResponseWithTools,
    extractJsonToolCalls,
} from '../features/ai/providersWithTools'
import {
    AI_TOOLS,
    executeToolCall,
    isExternalPathAction,
    isRiskyTerminalCommand,
} from '../features/ai/tools'
import {
    buildWorkspaceContext,
    injectWorkspaceContext,
} from '../features/ai/workspaceContext'
import { store } from '../app/store'
import { openFile, fileWasUpdated } from '../features/globalSlice'
import * as ssel from '../features/settings/settingsSelectors'
import { setSettingsTab } from '../features/settings/settingsSlice'
import { getActiveFileId } from '../features/window/paneUtils'
import { getPathForFileId } from '../features/window/fileUtils'
import { FullState } from '../features/window/state'
import {
    CodeBlock,
    ToolCallCard,
    PlanCard,
    TodosCard,
    TodoItem,
} from './aiCodeBlock'
import { searchAllFiles } from '../features/selectors'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '../styles/aiCodeBlock.css'

// ─── Quick prompts ──────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
    { label: 'Explain this file', icon: 'book' },
    { label: 'Find potential bugs', icon: 'bug' },
    { label: 'Add TypeScript types', icon: 'symbol-class' },
    { label: 'Write unit tests', icon: 'beaker' },
    { label: 'Refactor for readability', icon: 'wand' },
    { label: 'Optimize performance', icon: 'dashboard' },
]

// ─── Types ───────────────────────────────────────────────────────────────────
interface ToolCallState {
    id: string
    name: string
    arguments: Record<string, any>
    argumentsRaw?: string
    result?: string
    success?: boolean
    isExecuting: boolean
    isPending?: boolean
    needsApproval?: boolean
    warning?: string
}

type StreamPhase = 'idle' | 'streaming' | 'tools' | 'executing'

type TurnSegment =
    | { id: string; type: 'text'; content: string }
    | { id: string; type: 'tools'; toolCalls: ToolCallState[] }

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    toolCalls?: ToolCallState[]
    segments?: TurnSegment[]
    plan?: string
}

function cloneSegments(segments: TurnSegment[]): TurnSegment[] {
    return segments.map((seg) =>
        seg.type === 'text'
            ? { ...seg }
            : { ...seg, toolCalls: seg.toolCalls.map((tc) => ({ ...tc })) }
    )
}

function messageFromSegments(segments: TurnSegment[]) {
    const content = segments
        .filter(
            (s): s is Extract<TurnSegment, { type: 'text' }> =>
                s.type === 'text'
        )
        .map((s) => s.content)
        .filter(Boolean)
        .join('\n\n')
    const toolCalls = segments
        .filter(
            (s): s is Extract<TurnSegment, { type: 'tools' }> =>
                s.type === 'tools'
        )
        .flatMap((s) => s.toolCalls)
    return { content, toolCalls, segments: cloneSegments(segments) }
}

function deriveSegmentsFromMessage(message: Message): TurnSegment[] {
    if (message.segments?.length) return message.segments
    const segs: TurnSegment[] = []
    if (message.content?.trim()) {
        segs.push({ id: 'text-legacy', type: 'text', content: message.content })
    }
    if (message.toolCalls?.length) {
        segs.push({
            id: 'tools-legacy',
            type: 'tools',
            toolCalls: message.toolCalls,
        })
    }
    return segs
}

// ─── Shimmer Loader ───────────────────────────────────────────────────────────
function ShimmerLoader({ label }: { label?: string }) {
    return (
        <div className="flex flex-col gap-2 py-2.5">
            {/* Sweeping shimmer bar */}
            <div
                className="h-0.5 rounded-full bg-[length:200%_100%] animate-shimmer"
                style={{
                    background:
                        'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 40%, transparent) 25%, var(--accent) 50%, color-mix(in srgb, var(--accent) 40%, transparent) 75%, transparent 100%)',
                    backgroundSize: '200% 100%',
                }}
            />
            {label && (
                <span className="text-[12px] font-medium text-shimmer tracking-wide">
                    {label}
                </span>
            )}
        </div>
    )
}

// ─── Typing cursor ────────────────────────────────────────────────────────────
function TypingCursor() {
    return (
        <span
            className="inline-block w-0.5 h-4 rounded-sm bg-accent ml-0.5 align-text-bottom animate-blink"
            aria-hidden="true"
        />
    )
}

function StreamingPlainText({
    text,
    isStreaming,
    muted = false,
}: {
    text: string
    isStreaming: boolean
    muted?: boolean
}) {
    if (!text && !isStreaming) return null
    return (
        <div
            className={`text-[14px] leading-relaxed break-words ${
                muted ? 'text-ui-fg-muted opacity-80' : 'text-ui-fg'
            }`}
        >
            {text ? <AiMarkdown content={text} /> : null}
            {isStreaming && <TypingCursor />}
        </div>
    )
}

// ─── Markdown Renderer (stable — no re-render jitter) ────────────────────────
function AiMarkdown({ content }: { content: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                code({ node: _n, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const lang = match ? match[1] : 'plaintext'
                    const code = String(children).replace(/\n$/, '')
                    return !inline ? (
                        <CodeBlock code={code} language={lang} />
                    ) : (
                        <code
                            className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-ui-bg-elevated border border-ui-border text-ui-fg"
                            {...props}
                        >
                            {children}
                        </code>
                    )
                },
                a: ({ href, children, ...p }: any) => (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2 hover:opacity-75 transition-opacity"
                        {...p}
                    >
                        {children}
                    </a>
                ),
                p: ({ children }: any) => (
                    <p className="mb-2.5 last:mb-0 leading-relaxed text-[13px] text-ui-fg">
                        {children}
                    </p>
                ),
                ul: ({ children }: any) => (
                    <ul className="list-disc pl-5 mb-2.5 space-y-1 text-[13px] text-ui-fg">
                        {children}
                    </ul>
                ),
                ol: ({ children }: any) => (
                    <ol className="list-decimal pl-5 mb-2.5 space-y-1 text-[13px] text-ui-fg">
                        {children}
                    </ol>
                ),
                li: ({ children }: any) => (
                    <li className="leading-relaxed">{children}</li>
                ),
                h1: ({ children }: any) => (
                    <h1 className="text-base font-bold mb-2 mt-3 text-ui-fg border-b border-ui-border pb-1.5">
                        {children}
                    </h1>
                ),
                h2: ({ children }: any) => (
                    <h2 className="text-[13px] font-bold mb-1.5 mt-3 text-ui-fg">
                        {children}
                    </h2>
                ),
                h3: ({ children }: any) => (
                    <h3 className="text-[12px] font-semibold mb-1 mt-2 text-ui-fg">
                        {children}
                    </h3>
                ),
                blockquote: ({ children }: any) => (
                    <blockquote className="border-l-[3px] border-accent pl-3 py-1 my-2 bg-[color:color-mix(in_srgb,var(--accent)_5%,transparent)] rounded-r text-ui-fg-muted italic text-[12px]">
                        {children}
                    </blockquote>
                ),
                table: ({ children }: any) => (
                    <div className="overflow-x-auto my-2 rounded border border-ui-border">
                        <table className="w-full border-collapse text-[12px]">
                            {children}
                        </table>
                    </div>
                ),
                thead: ({ children }: any) => (
                    <thead className="bg-ui-bg-elevated">{children}</thead>
                ),
                th: ({ children }: any) => (
                    <th className="px-3 py-1.5 text-left font-semibold text-[11px] uppercase tracking-wide text-ui-fg-muted border-b border-ui-border">
                        {children}
                    </th>
                ),
                td: ({ children }: any) => (
                    <td className="px-3 py-1.5 text-ui-fg border-b border-ui-border">
                        {children}
                    </td>
                ),
                tr: ({ children }: any) => (
                    <tr className="hover:bg-ui-hover transition-colors">
                        {children}
                    </tr>
                ),
                hr: () => <hr className="border-ui-border my-3" />,
                strong: ({ children }: any) => (
                    <strong className="font-semibold text-ui-fg">
                        {children}
                    </strong>
                ),
                em: ({ children }: any) => (
                    <em className="italic text-ui-fg-muted">{children}</em>
                ),
                pre: ({ children }: any) => <>{children}</>,
            }}
        >
            {content}
        </ReactMarkdown>
    )
}

// ─── Tool Calls Group ─────────────────────────────────────────────────────────
function ToolCallsGroup({
    toolCalls,
    onToolApproval,
    isStreaming,
}: {
    toolCalls: ToolCallState[]
    onToolApproval: (id: string, approved: boolean) => void
    isStreaming: boolean
}) {
    const [expanded, setExpanded] = useState(true)
    const pendingApproval = toolCalls.find((tc) => tc.needsApproval)
    const runningTool = toolCalls.find((tc) => tc.isExecuting)
    const doneCount = toolCalls.filter((tc) => tc.success !== undefined).length
    const totalCount = toolCalls.length
    const allDone = doneCount === totalCount && totalCount > 0

    useEffect(() => {
        if (pendingApproval) setExpanded(true)
    }, [pendingApproval])

    const borderClass = 'border-ui-border'

    const statusIcon = runningTool ? (
        <Codicon
            name="loading"
            className="codicon-modifier-spin"
            style={{ fontSize: 11, color: 'var(--accent)' }}
        />
    ) : pendingApproval ? (
        <Codicon
            name="shield"
            style={{ fontSize: 11, color: 'var(--ui-fg-muted)' }}
        />
    ) : allDone ? (
        <Codicon
            name="check-all"
            style={{ fontSize: 11, color: 'var(--color-success)' }}
        />
    ) : (
        <Codicon
            name="tools"
            style={{ fontSize: 11, color: 'var(--ui-fg-muted)' }}
        />
    )

    const headerLabel = runningTool
        ? `Running ${runningTool.name.replace(/_/g, ' ')}…`
        : pendingApproval
        ? 'Approval required'
        : allDone
        ? `${totalCount} action${totalCount !== 1 ? 's' : ''} completed`
        : `${totalCount} action${totalCount !== 1 ? 's' : ''}`

    return (
        <div
            className={`rounded-md border ${borderClass} overflow-hidden mb-2 transition-[border-color] duration-200`}
        >
            <button
                className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-ui-hover transition-colors"
                onClick={() => setExpanded((e) => !e)}
            >
                <span className="w-4 flex items-center justify-center shrink-0">
                    {statusIcon}
                </span>
                <span
                    className={`text-[12px] font-semibold flex-1 ${
                        runningTool ? 'text-shimmer' : 'text-ui-fg'
                    }`}
                >
                    {headerLabel}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                    {isStreaming && runningTool && (
                        <div
                            className="w-8 h-0.5 rounded-full animate-shimmer-fast"
                            style={{
                                background:
                                    'linear-gradient(90deg, transparent, var(--accent), transparent)',
                                backgroundSize: '200% 100%',
                            }}
                        />
                    )}
                    <span className="text-[11px] text-ui-fg-muted font-mono">
                        {doneCount}/{totalCount}
                    </span>
                    <Codicon
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        style={{ fontSize: 11, opacity: 0.6 }}
                    />
                </div>
            </button>
            {expanded && (
                <div className="border-t border-ui-border divide-y divide-ui-border">
                    {toolCalls.map((tc) => (
                        <ToolCallCard
                            key={tc.id}
                            toolName={tc.name}
                            arguments={tc.arguments}
                            argumentsRaw={tc.argumentsRaw}
                            result={tc.result}
                            success={tc.success}
                            isExecuting={tc.isExecuting}
                            isPending={tc.isPending}
                            needsApproval={tc.needsApproval}
                            warning={tc.warning}
                            onAccept={() => onToolApproval(tc.id, true)}
                            onReject={() => onToolApproval(tc.id, false)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

function stripSpecialTags(text: string): string {
    if (!text) return ''
    return text
        .replace(/<plan>[\s\S]*?<\/plan>/gi, '')
        .replace(/<plan[\s\S]*/gi, '')
        .replace(/<todos>[\s\S]*?<\/todos>/gi, '')
        .replace(/<todos[\s\S]*/gi, '')
        .replace(
            /```(?:json)?\s*\{[\s\S]*?"(?:name|tool|function|action)"[\s\S]*?```/gi,
            ''
        )
        .replace(
            /```(?:json)?\s*\{[\s\S]*?"(?:name|tool|function|action)"[\s\S]*/gi,
            ''
        )
        .replace(/\{\s*"(?:name|tool|function|action)"\s*:[\s\S]*?\}/gi, '')
        .trim()
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
    message,
    onToolApproval,
    onRetry,
    isStreaming = false,
    streamingSegments = [],
    activeTextSegmentId = null,
    currentPlan,
    streamPhase = 'idle',
}: {
    message: Message
    onToolApproval: (id: string, approved: boolean) => void
    onRetry?: () => void
    isStreaming?: boolean
    streamingSegments?: TurnSegment[]
    activeTextSegmentId?: string | null
    currentPlan?: string | null
    streamPhase?: StreamPhase
}) {
    const [copied, setCopied] = useState(false)
    const isUser = message.role === 'user'

    const segments =
        isStreaming && streamingSegments.length > 0
            ? streamingSegments
            : deriveSegmentsFromMessage(message)

    const allToolCalls = segments
        .filter(
            (s): s is Extract<TurnSegment, { type: 'tools' }> =>
                s.type === 'tools'
        )
        .flatMap((s) => s.toolCalls)
    const fullText = segments
        .filter(
            (s): s is Extract<TurnSegment, { type: 'text' }> =>
                s.type === 'text'
        )
        .map((s) => s.content)
        .join('\n\n')

    const handleCopy = async () => {
        await navigator.clipboard.writeText(
            stripSpecialTags(fullText || message.content)
        )
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const planToRender = isStreaming ? currentPlan : message.plan
    const doneTools = allToolCalls.filter(
        (tc) => tc.success !== undefined
    ).length
    const totalTools = allToolCalls.length

    function FormattedUserText({ text }: { text: string }) {
        if (!text) return null
        const parts = text.split(
            /(@[a-zA-Z0-9_./:-]+|[a-zA-Z0-9_. -]+\.(?:png|jpg|jpeg|gif|svg|webp|pdf))/gi
        )
        return (
            <span>
                {parts.map((part, idx) => {
                    if (part.startsWith('@') && part.length > 1) {
                        const isGit = part.includes('git')
                        const isCodebase =
                            part.includes('codebase') ||
                            part.includes('workspace')
                        const iconName = isGit
                            ? 'git-commit'
                            : isCodebase
                            ? 'symbol-structure'
                            : 'file'
                        return (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 mx-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent font-mono text-[12px] font-medium border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] shrink-0"
                            >
                                <Codicon
                                    name={iconName}
                                    style={{ fontSize: 10 }}
                                />
                                {part}
                            </span>
                        )
                    }
                    const isImageFile = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(
                        part.trim()
                    )
                    if (isImageFile && part.trim().length > 3) {
                        return (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 mx-0.5 rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent font-mono text-[12px] font-medium border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] shrink-0"
                            >
                                <Codicon
                                    name="file-media"
                                    style={{ fontSize: 11 }}
                                />
                                {part.trim()}
                            </span>
                        )
                    }
                    return <span key={idx}>{part}</span>
                })}
            </span>
        )
    }

    /* ── User message ────────────────────────────────────────────────── */
    if (isUser) {
        return (
            <div className="group flex justify-end mb-2.5">
                <div className="max-w-[88%]">
                    <div className="bg-ui-bg-elevated border border-ui-border rounded-xl px-4 py-2.5 text-[14px] text-ui-fg leading-relaxed whitespace-pre-wrap break-words">
                        <FormattedUserText text={message.content} />
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] font-mono text-ui-fg-muted opacity-60">
                            {message.timestamp.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                            })}
                        </span>
                        {onRetry && (
                            <button
                                className="flex items-center justify-center w-5 h-5 rounded hover:bg-ui-hover text-ui-fg-muted hover:text-ui-fg transition-colors"
                                onClick={onRetry}
                                title="Edit and resend"
                            >
                                <Codicon name="edit" style={{ fontSize: 11 }} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    /**
     * Thinking Block Component (Enterprise Thinking / Sub-agent Activity toggle matching screenshot)
     */
    function ThinkingBlock({
        isThinking,
        thinkingTimeSeconds,
        details,
    }: {
        isThinking: boolean
        thinkingTimeSeconds?: number
        details?: string[]
    }) {
        const [collapsed, setCollapsed] = useState(false)
        const timeLabel = thinkingTimeSeconds
            ? `Thought for ${thinkingTimeSeconds} seconds`
            : 'Thought for a few seconds'

        return (
            <div className="my-1.5 text-ui-fg-muted font-sans text-[13px]">
                <div
                    className="flex items-center gap-2 cursor-pointer select-none py-1 hover:text-ui-fg transition-colors opacity-80 hover:opacity-100"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <span className="font-medium">
                        {isThinking ? 'Thinking…' : timeLabel}
                    </span>
                    <Codicon
                        name={collapsed ? 'chevron-right' : 'chevron-down'}
                        style={{ fontSize: 10, opacity: 0.6 }}
                    />
                </div>
                {!collapsed && details && details.length > 0 && (
                    <div className="mt-1 pl-3 border-l border-ui-border/60 flex flex-col gap-1 text-[12px] opacity-75">
                        {details.map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    /* ── Assistant message ───────────────────────────────────────────── */
    const todosToRender = useMemo(() => {
        const rawText = fullText || message.content || ''
        if (!rawText.includes('<todos>')) return []
        const ts = rawText.indexOf('<todos>')
        const te = rawText.indexOf('</todos>')
        const content =
            te !== -1
                ? rawText.substring(ts + 7, te)
                : rawText.substring(ts + 7)
        const lines = content
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        const list: TodoItem[] = []
        lines.forEach((line, idx) => {
            const match = line.match(/^-\s*\[([ xX])\]\s*(.+)$/)
            if (match) {
                list.push({
                    id: `todo-${idx}`,
                    completed: match[1].toLowerCase() === 'x',
                    text: match[2].trim(),
                })
            }
        })
        return list
    }, [fullText, message.content])

    const [todoStates, setTodoStates] = useState<Record<string, boolean>>({})
    const mergedTodos = useMemo(() => {
        return todosToRender.map((t) => ({
            ...t,
            completed:
                todoStates[t.id] !== undefined ? todoStates[t.id] : t.completed,
        }))
    }, [todosToRender, todoStates])

    return (
        <div className="group mb-3">
            {planToRender && <PlanCard planMarkdown={planToRender} />}
            {mergedTodos.length > 0 && (
                <TodosCard
                    todos={mergedTodos}
                    onToggle={(id) =>
                        setTodoStates((prev) => ({ ...prev, [id]: !prev[id] }))
                    }
                />
            )}

            {segments.map((seg, idx) => {
                if (seg.type === 'text') {
                    if (
                        !seg.content &&
                        !(isStreaming && seg.id === activeTextSegmentId)
                    )
                        return null
                    const isActiveText =
                        isStreaming && seg.id === activeTextSegmentId
                    return (
                        <div key={seg.id} className={idx > 0 ? 'mt-2.5' : ''}>
                            {isActiveText ? (
                                <StreamingPlainText
                                    text={stripSpecialTags(seg.content)}
                                    isStreaming={streamPhase === 'streaming'}
                                />
                            ) : (
                                <div className="text-[14px] text-ui-fg leading-relaxed">
                                    <AiMarkdown
                                        content={stripSpecialTags(seg.content)}
                                    />
                                </div>
                            )}
                        </div>
                    )
                }

                if (seg.toolCalls.length === 0) return null
                return (
                    <div key={seg.id} className={idx > 0 ? 'mt-2.5' : ''}>
                        <ToolCallsGroup
                            toolCalls={seg.toolCalls}
                            onToolApproval={onToolApproval}
                            isStreaming={isStreaming}
                        />
                    </div>
                )
            })}

            {isStreaming && (
                <div className="flex items-center gap-2 mt-2 py-1 text-[12px] font-medium text-ui-fg-muted">
                    <Codicon
                        name="loading"
                        className="codicon-modifier-spin text-accent"
                        style={{ fontSize: 12 }}
                    />
                    <span className="text-shimmer">
                        {allToolCalls.some((tc) => tc.isExecuting)
                            ? `Running ${
                                  allToolCalls
                                      .find((tc) => tc.isExecuting)
                                      ?.name?.replace(/_/g, ' ') ?? 'tool'
                              }…`
                            : allToolCalls.some((tc) => tc.isPending)
                            ? 'Preparing tool call…'
                            : streamPhase === 'streaming' ||
                              segments.some((s) => s.type === 'text')
                            ? 'Generating response…'
                            : 'Thinking…'}
                    </span>
                </div>
            )}

            {!isStreaming && segments.length > 0 && (
                <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-mono text-ui-fg-muted opacity-50">
                        {message.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                        })}
                    </span>
                    {(fullText || message.content) && (
                        <button
                            className="flex items-center justify-center w-5 h-5 rounded hover:bg-ui-hover text-ui-fg-muted hover:text-ui-fg transition-colors"
                            onClick={handleCopy}
                            title={copied ? 'Copied!' : 'Copy response'}
                        >
                            <Codicon
                                name={copied ? 'check' : 'copy'}
                                style={{ fontSize: 10 }}
                            />
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AIChatSidebar() {
    const dispatch = useAppDispatch()
    const settings = useAppSelector(ssel.getSettings)
    const rootPath = useAppSelector((state: FullState) => state.global.rootPath)
    const aiSidebarOpen = useAppSelector(
        (state: FullState) => state.toolState?.aiCommandPaletteTriggered
    )
    const activeFileId = useAppSelector((state: FullState) =>
        getActiveFileId(state.global)
    )
    const activeFilePath = useAppSelector((state: FullState) =>
        activeFileId ? getPathForFileId(state.global, activeFileId) : null
    )

    // ── State ────────────────────────────────────────────────────────────────
    const [messages, setMessages] = useState<Message[]>([])
    const [currentPlan, setCurrentPlanState] = useState<string | null>(null)
    const [input, setInput] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [queuedPrompts, setQueuedPrompts] = useState<string[]>([])
    const [streamingSegments, setStreamingSegments] = useState<TurnSegment[]>(
        []
    )
    const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle')

    // ── Context Attachment Tags ─────────────────────────────────────────────
    interface ContextTag {
        id: string
        label: string
        type:
            | 'file'
            | 'folder'
            | 'git'
            | 'doc'
            | 'image'
            | 'codebase'
            | 'terminal'
        icon: string
        dataUrl?: string
    }
    const [attachedContexts, setAttachedContexts] = useState<ContextTag[]>([])
    const imageInputRef = useRef<HTMLInputElement>(null)

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = reader.result as string
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `img-${Date.now()}`,
                    label: file.name,
                    type: 'image',
                    icon: 'file-media',
                    dataUrl,
                },
            ])
        }
        reader.readAsDataURL(file)
    }

    const handleAddContextTag = (type: 'file' | 'folder' | 'git' | 'doc') => {
        if (type === 'file') {
            const fileName = activeFilePath?.split('/').pop() || 'active-file'
            if (attachedContexts.some((c) => c.label.includes(fileName))) return
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `file-${Date.now()}`,
                    label: `@${fileName}`,
                    type: 'file',
                    icon: 'file',
                },
            ])
        } else if (type === 'git') {
            if (attachedContexts.some((c) => c.label === '@git:diff')) return
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `git-${Date.now()}`,
                    label: '@git:diff',
                    type: 'git',
                    icon: 'git-commit',
                },
            ])
        } else if (type === 'folder') {
            if (attachedContexts.some((c) => c.label === '@workspace')) return
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `folder-${Date.now()}`,
                    label: '@workspace',
                    type: 'folder',
                    icon: 'folder',
                },
            ])
        } else if (type === 'doc') {
            if (attachedContexts.some((c) => c.label === '@docs')) return
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `doc-${Date.now()}`,
                    label: '@docs',
                    type: 'doc',
                    icon: 'book',
                },
            ])
        }
    }

    // ── `@` Mention Autocomplete Popup State ────────────────────────────────
    interface MentionItem {
        id: string
        label: string
        desc: string
        icon: string
        type: 'file' | 'folder' | 'git' | 'doc' | 'codebase' | 'terminal'
    }

    const [showMentionPopup, setShowMentionPopup] = useState(false)
    const [mentionQuery, setMentionQuery] = useState('')
    const [mentionIndex, setMentionIndex] = useState(0)
    const [mentionResults, setMentionResults] = useState<MentionItem[]>([])

    const defaultMentionTargets: MentionItem[] = useMemo(
        () => [
            {
                id: 'workspace',
                label: '@workspace',
                desc: 'Current workspace files',
                icon: 'folder',
                type: 'folder',
            },
            {
                id: 'git-diff',
                label: '@git:diff',
                desc: 'Active git changes & diff',
                icon: 'git-commit',
                type: 'git',
            },
            {
                id: 'codebase',
                label: '@codebase',
                desc: 'Full codebase context',
                icon: 'symbol-structure',
                type: 'codebase',
            },
            {
                id: 'terminal',
                label: '@terminal',
                desc: 'Recent terminal output',
                icon: 'terminal',
                type: 'terminal',
            },
            {
                id: 'docs',
                label: '@docs',
                desc: 'Project documentation',
                icon: 'book',
                type: 'doc',
            },
        ],
        []
    )

    useEffect(() => {
        if (!showMentionPopup) return
        let cancelled = false
        const filterDefault = defaultMentionTargets.filter(
            (item) =>
                item.label.toLowerCase().includes(mentionQuery.toLowerCase()) ||
                item.desc.toLowerCase().includes(mentionQuery.toLowerCase())
        )

        void searchAllFiles(mentionQuery).then((files) => {
            if (cancelled) return
            const fileItems: MentionItem[] = files
                .slice(0, 7)
                .map((filePath) => {
                    const fileName = filePath.split('/').pop() || filePath
                    return {
                        id: filePath,
                        label: `@${fileName}`,
                        desc: filePath,
                        icon: 'file',
                        type: 'file',
                    }
                })
            setMentionResults([...filterDefault, ...fileItems])
            setMentionIndex(0)
        })

        return () => {
            cancelled = true
        }
    }, [showMentionPopup, mentionQuery, defaultMentionTargets])

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value
        setInput(val)

        const cursorPos = e.target.selectionStart || val.length
        const textBeforeCursor = val.slice(0, cursorPos)
        const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_./-]*)$/)

        if (match) {
            setShowMentionPopup(true)
            setMentionQuery(match[1])
        } else {
            setShowMentionPopup(false)
        }
    }

    // Auto-scroll active mention item into view
    useEffect(() => {
        if (!showMentionPopup) return
        const el = document.querySelector('.mention-item--selected')
        el?.scrollIntoView({ block: 'nearest' })
    }, [mentionIndex, showMentionPopup])

    const selectMentionItem = (item: MentionItem) => {
        if (!textareaRef.current) return
        const val = input
        const cursorPos = textareaRef.current.selectionStart || val.length
        const textBeforeCursor = val.slice(0, cursorPos)
        const textAfterCursor = val.slice(cursorPos)

        const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_./-]*)$/)
        if (match) {
            const atIndex = textBeforeCursor.lastIndexOf('@' + match[1])
            const newTextBefore = textBeforeCursor.slice(0, atIndex).trimEnd()
            setInput(
                (newTextBefore ? newTextBefore + ' ' : '') + textAfterCursor
            )
        }

        if (!attachedContexts.some((c) => c.label === item.label)) {
            setAttachedContexts((prev) => [
                ...prev,
                {
                    id: `${item.id}-${Date.now()}`,
                    label: item.label,
                    type: item.type,
                    icon: item.icon,
                },
            ])
        }

        setShowMentionPopup(false)
        setTimeout(() => textareaRef.current?.focus(), 30)
    }

    const handleTextareaKeyDown = (
        e: React.KeyboardEvent<HTMLTextAreaElement>
    ) => {
        if (showMentionPopup && mentionResults.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setMentionIndex((prev) => (prev + 1) % mentionResults.length)
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setMentionIndex(
                    (prev) =>
                        (prev - 1 + mentionResults.length) %
                        mentionResults.length
                )
                return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                selectMentionItem(mentionResults[mentionIndex])
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                setShowMentionPopup(false)
                return
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // ── Refs ─────────────────────────────────────────────────────────────────
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const confirmationResolvers = useRef<
        Record<string, { resolve: (v: boolean) => void; reject: () => void }>
    >({})
    const stickToBottomRef = useRef(true)

    const activeAssistantIdRef = useRef<string | null>(null)
    const segmentsRef = useRef<TurnSegment[]>([])
    const activeTextSegmentIdRef = useRef<string | null>(null)
    const activeToolsSegmentIdRef = useRef<string | null>(null)
    const currentPlanRef = useRef<string | null>(null)
    const messagesRef = useRef<Message[]>([])
    const suppressQueueEffectRef = useRef(false)

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const setCurrentPlan = useCallback((plan: string | null) => {
        currentPlanRef.current = plan
        setCurrentPlanState(plan)
    }, [])

    const finalizeAssistantMessage = useCallback(() => {
        const id = activeAssistantIdRef.current
        if (!id) return
        const derived = messageFromSegments(segmentsRef.current)
        setMessages((prev) =>
            prev.map((m) =>
                m.id === id
                    ? {
                          ...m,
                          content: derived.content,
                          toolCalls: derived.toolCalls,
                          segments: derived.segments,
                          plan: currentPlanRef.current || undefined,
                      }
                    : m
            )
        )
    }, [])

    const syncSegments = useCallback(() => {
        flushSync(() => {
            setStreamingSegments(cloneSegments(segmentsRef.current))
        })
    }, [])

    const thisTurnToolCallIdsRef = useRef<Set<string>>(new Set())

    const updateTurnText = useCallback(
        (turnText: string) => {
            const cleaned = turnText
                .replace(/<plan>[\s\S]*?<\/plan>/g, '')
                .trim()
            if (!cleaned) return

            const segs = segmentsRef.current
            const activeId = activeTextSegmentIdRef.current

            if (activeId) {
                const idx = segs.findIndex((s) => s.id === activeId)
                const seg = segs[idx]
                if (idx >= 0 && seg?.type === 'text') {
                    segs[idx] = { id: seg.id, type: 'text', content: cleaned }
                    syncSegments()
                    return
                }
            }

            const id = `text-${Date.now()}`
            segs.push({ id, type: 'text', content: cleaned })
            activeTextSegmentIdRef.current = id
            syncSegments()
        },
        [syncSegments]
    )

    const ensureToolsSegment = useCallback(() => {
        activeTextSegmentIdRef.current = null
        if (activeToolsSegmentIdRef.current)
            return activeToolsSegmentIdRef.current

        const id = `tools-${Date.now()}`
        segmentsRef.current.push({ id, type: 'tools', toolCalls: [] })
        activeToolsSegmentIdRef.current = id
        syncSegments()
        return id
    }, [syncSegments])

    const upsertToolCall = useCallback(
        (toolCall: ToolCallState) => {
            ensureToolsSegment()
            const toolsSegId = activeToolsSegmentIdRef.current!
            const segs = segmentsRef.current
            const segIdx = segs.findIndex((s) => s.id === toolsSegId)
            const toolsSeg = segs[segIdx]
            if (segIdx < 0 || toolsSeg?.type !== 'tools') return

            const toolsSegment = toolsSeg
            const toolCalls = [...toolsSegment.toolCalls]
            let existingIndex = toolCalls.findIndex(
                (tc) => tc.id === toolCall.id
            )
            if (existingIndex < 0 && toolCall.name) {
                existingIndex = toolCalls.findIndex(
                    (tc) =>
                        tc.name === toolCall.name &&
                        (tc.isPending || tc.isExecuting) &&
                        tc.success === undefined
                )
            }
            if (existingIndex >= 0) {
                toolCalls[existingIndex] = {
                    ...toolCalls[existingIndex],
                    ...toolCall,
                    id: toolCall.id || toolCalls[existingIndex].id,
                }
            } else {
                toolCalls.push(toolCall)
            }
            segs[segIdx] = { id: toolsSegment.id, type: 'tools', toolCalls }
            syncSegments()
        },
        [ensureToolsSegment, syncSegments]
    )

    const settleUnfinishedToolCalls = useCallback(
        (reason: string) => {
            let changed = false
            segmentsRef.current = segmentsRef.current.map((seg) => {
                if (seg.type !== 'tools') return seg

                const toolCalls = seg.toolCalls.map((toolCall) => {
                    if (
                        toolCall.success !== undefined ||
                        (!toolCall.isPending &&
                            !toolCall.isExecuting &&
                            !toolCall.needsApproval)
                    ) {
                        return toolCall
                    }

                    changed = true
                    return {
                        ...toolCall,
                        isPending: false,
                        isExecuting: false,
                        needsApproval: false,
                        success: false,
                        result: reason,
                    }
                })

                return { ...seg, toolCalls }
            })

            if (changed) syncSegments()
            return changed
        },
        [syncSegments]
    )

    // ── Computed ─────────────────────────────────────────────────────────────
    const isAIConfigured = useMemo(() => {
        const p = settings.aiProvider
        if (p === 'openai')
            return !!(settings.useOpenAIKey && settings.openAIKey)
        if (p === 'openrouter')
            return !!(settings.useOpenRouterKey && settings.openRouterKey)
        if (p === 'gemini')
            return !!(settings.useGeminiKey && settings.geminiKey)
        if (p === 'claude')
            return !!(settings.useClaudeKey && settings.claudeKey)
        if (p === 'ollama') return true
        return false
    }, [settings])

    const providerInfo = useMemo(() => {
        const p = settings.aiProvider || 'ollama'
        const model =
            p === 'openai'
                ? settings.openAIModel
                : p === 'openrouter'
                ? settings.openRouterModel
                : p === 'gemini'
                ? settings.geminiModel
                : p === 'claude'
                ? settings.claudeModel
                : settings.ollamaModel || 'llama3'
        return {
            provider: p.charAt(0).toUpperCase() + p.slice(1),
            model: model || 'Default',
        }
    }, [settings])

    // ── Effects ───────────────────────────────────────────────────────────────
    useEffect(() => {
        const container = messagesContainerRef.current
        if (!container) return

        const onScroll = () => {
            const distance =
                container.scrollHeight -
                container.scrollTop -
                container.clientHeight
            stickToBottomRef.current = distance < 96
        }

        container.addEventListener('scroll', onScroll, { passive: true })
        return () => container.removeEventListener('scroll', onScroll)
    }, [])

    useEffect(() => {
        if (!stickToBottomRef.current) return
        const container = messagesContainerRef.current
        if (container) {
            container.scrollTop = container.scrollHeight
        }
    }, [messages, streamingSegments, streamPhase, isGenerating])

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${Math.min(
                textareaRef.current.scrollHeight,
                200
            )}px`
        }
    }, [input])

    useEffect(() => {
        if (aiSidebarOpen && textareaRef.current) {
            if ((window as any).__cursorChatQuery) {
                const query = (window as any).__cursorChatQuery
                delete (window as any).__cursorChatQuery
                setInput(query)
                setTimeout(() => {
                    if (query.trim() && !isGenerating) handleSend()
                }, 300)
            } else {
                setTimeout(() => textareaRef.current?.focus(), 100)
            }
        }
    }, [aiSidebarOpen])

    // ── Model ─────────────────────────────────────────────────────────────────
    const getModelToUse = useCallback(async () => {
        const info = await getActiveProviderAPIKey(settings)
        if (!info)
            return { model: 'llama3', provider: 'ollama', apiKey: 'ollama' }
        const p = settings.aiProvider || 'ollama'
        if (p === 'openrouter')
            return {
                model: info.model,
                provider: 'openrouter',
                apiKey: info.apiKey!,
            }
        return {
            model: info.model.replace(':free', ''),
            provider: p,
            apiKey: info.apiKey!,
        }
    }, [settings])

    // ── THE CORE FIX: processTurn updates the single message, NEVER creates new ones ──
    const processTurn = useCallback(
        async (
            currentMessages: any[],
            currentModel: any,
            provider: any,
            apiKey: any
        ) => {
            let thisTurnText = ''
            const thisTurnToolCalls: ToolCallState[] = []
            thisTurnToolCallIdsRef.current = new Set()
            activeTextSegmentIdRef.current = null
            activeToolsSegmentIdRef.current = null

            const workspaceContext =
                settings.workspaceContextEnabled === false
                    ? ''
                    : await buildWorkspaceContext(store.getState() as FullState)
            const messagesWithContext = injectWorkspaceContext(
                currentMessages,
                workspaceContext
            )

            const providerConfig = {
                provider,
                apiKey,
                enabled: true,
                defaultModel: currentModel,
                baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
            }

            try {
                setStreamPhase('streaming')
                const stream = streamAIResponseWithTools(
                    providerConfig,
                    messagesWithContext as any,
                    // @ts-ignore
                    {
                        tools: AI_TOOLS,
                        maxToolCalls: 50,
                        signal: abortControllerRef.current?.signal,
                    }
                )

                for await (const chunk of stream) {
                    if (abortControllerRef.current?.signal.aborted)
                        throw new Error('Aborted')

                    if (chunk.type === 'text') {
                        const text = chunk.content || ''
                        thisTurnText += text

                        const ps = thisTurnText.indexOf('<plan>')
                        const pe = thisTurnText.indexOf('</plan>')
                        let visibleText = thisTurnText

                        if (ps !== -1) {
                            if (pe !== -1) {
                                setCurrentPlan(
                                    thisTurnText.substring(ps + 6, pe).trim()
                                )
                                visibleText = (
                                    thisTurnText.substring(0, ps) +
                                    thisTurnText.substring(pe + 7)
                                ).trim()
                            } else {
                                setCurrentPlan(
                                    thisTurnText.substring(ps + 6).trim()
                                )
                                visibleText = thisTurnText.substring(0, ps)
                            }
                        }

                        updateTurnText(stripSpecialTags(visibleText))
                    } else if (
                        chunk.type === 'tool_call_start' &&
                        chunk.toolCall
                    ) {
                        setStreamPhase('tools')
                        upsertToolCall({
                            id: chunk.toolCall.id,
                            name: chunk.toolCall.name,
                            arguments: {},
                            isExecuting: false,
                            isPending: true,
                        })
                    } else if (
                        chunk.type === 'tool_call_delta' &&
                        chunk.toolCall
                    ) {
                        setStreamPhase('tools')
                        upsertToolCall({
                            id: chunk.toolCall.id,
                            name: chunk.toolCall.name,
                            arguments: chunk.toolCall.arguments,
                            argumentsRaw: chunk.toolCall.argumentsRaw,
                            isExecuting: false,
                            isPending: true,
                        })
                    } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                        setStreamPhase('tools')
                        const tc: ToolCallState = {
                            id: chunk.toolCall.id,
                            name: chunk.toolCall.name,
                            arguments: chunk.toolCall.arguments,
                            isExecuting: false,
                            isPending: false,
                        }

                        if (!thisTurnToolCallIdsRef.current.has(tc.id)) {
                            thisTurnToolCallIdsRef.current.add(tc.id)
                            thisTurnToolCalls.push(tc)
                        }

                        upsertToolCall(tc)
                    } else if (chunk.type === 'error') {
                        thisTurnText += `\n\nError: ${chunk.error}`
                        updateTurnText(stripSpecialTags(thisTurnText))
                        settleUnfinishedToolCalls(
                            chunk.error || 'Tool call failed before execution.'
                        )
                    }
                }

                settleUnfinishedToolCalls(
                    'Tool call did not complete. The model returned an incomplete or malformed tool request.'
                )

                // Extract any tool calls embedded in JSON text (common with local/Ollama models)
                const { cleanText, toolCalls: extractedCalls } =
                    extractJsonToolCalls(thisTurnText)
                if (extractedCalls.length > 0) {
                    thisTurnText = cleanText
                    updateTurnText(stripSpecialTags(cleanText))

                    for (const etc of extractedCalls) {
                        if (!thisTurnToolCallIdsRef.current.has(etc.id)) {
                            thisTurnToolCallIdsRef.current.add(etc.id)
                            thisTurnToolCalls.push({
                                id: etc.id,
                                name: etc.name,
                                arguments: etc.arguments,
                                isExecuting: false,
                                isPending: false,
                            })
                            upsertToolCall({
                                id: etc.id,
                                name: etc.name,
                                arguments: etc.arguments,
                                isExecuting: false,
                                isPending: false,
                            })
                        }
                    }
                }

                // Fallback: If model output raw code instead of a tool call when user asked to write/create a file
                if (thisTurnToolCalls.length === 0) {
                    const lastUserMsg =
                        currentMessages[currentMessages.length - 1]?.content ||
                        ''
                    const atFileMatch = lastUserMsg.match(
                        /@([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/
                    )
                    const actionFileMatch = lastUserMsg.match(
                        /(?:write|create|edit|generate|update|code|make)\s+(?:the\s+file\s+|for\s+|in\s+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i
                    )
                    const targetFile = atFileMatch?.[1] || actionFileMatch?.[1]

                    if (targetFile) {
                        const codeBlockMatch = thisTurnText.match(
                            /```(?:[a-zA-Z0-9_-]+)?\s*\n([\s\S]*?)\n```/
                        )
                        if (codeBlockMatch && codeBlockMatch[1].trim()) {
                            const codeContent = codeBlockMatch[1]
                            const autoId = `call_autowrite_${Date.now()}`
                            const autoToolCall = {
                                id: autoId,
                                name: 'write_file',
                                arguments: {
                                    path: targetFile,
                                    content: codeContent,
                                },
                                isExecuting: false,
                                isPending: false,
                            }
                            thisTurnToolCallIdsRef.current.add(autoId)
                            thisTurnToolCalls.push(autoToolCall)
                            upsertToolCall(autoToolCall)

                            // Strip the raw code block so the conversation remains clean
                            thisTurnText = thisTurnText
                                .replace(codeBlockMatch[0], '')
                                .trim()
                            updateTurnText(stripSpecialTags(thisTurnText))
                        }
                    }
                }

                if (thisTurnToolCalls.length === 0) {
                    updateTurnText(stripSpecialTags(thisTurnText))
                    finalizeAssistantMessage()
                    setCurrentPlan(null)
                    setStreamPhase('idle')
                    activeTextSegmentIdRef.current = null
                    activeToolsSegmentIdRef.current = null
                    return
                }

                activeTextSegmentIdRef.current = null

                setStreamPhase('executing')
                const toolResults: any[] = []
                for (const toolCall of thisTurnToolCalls) {
                    try {
                        // Destructive ops or actions outside the workspace/root directory or risky commands need approval
                        const isExternal = isExternalPathAction(
                            rootPath || '',
                            toolCall
                        )
                        const isRiskyCmd =
                            toolCall.name === 'run_terminal_command' &&
                            isRiskyTerminalCommand(toolCall.arguments?.command)

                        let warning: string | undefined = undefined
                        if (isExternal) {
                            warning =
                                'Security Guard: This action targets files/folders outside your opened project workspace. User approval is required.'
                        } else if (isRiskyCmd) {
                            warning =
                                'Security Guard: This command modifies system state or root directories. User approval is required.'
                        }

                        const requiresApproval =
                            [
                                'edit_file',
                                'delete_file',
                                'run_terminal_command',
                            ].includes(toolCall.name) ||
                            isExternal ||
                            isRiskyCmd

                        if (requiresApproval) {
                            upsertToolCall({
                                ...toolCall,
                                needsApproval: true,
                                isPending: false,
                                warning,
                            })

                            try {
                                const approved = await new Promise<boolean>(
                                    (resolve, reject) => {
                                        confirmationResolvers.current[
                                            toolCall.id
                                        ] = { resolve, reject }
                                    }
                                )
                                delete confirmationResolvers.current[
                                    toolCall.id
                                ]

                                if (!approved) {
                                    upsertToolCall({
                                        ...toolCall,
                                        needsApproval: false,
                                        success: false,
                                        result: 'Rejected by user',
                                        isExecuting: false,
                                        isPending: false,
                                    })
                                    toolResults.push({
                                        toolCallId: toolCall.id,
                                        result: 'User rejected',
                                        name: toolCall.name,
                                    })
                                    continue
                                }
                            } catch (error: any) {
                                delete confirmationResolvers.current[
                                    toolCall.id
                                ]
                                if (error.message === 'Aborted') {
                                    throw new Error('Aborted')
                                }
                                throw error
                            }
                        }

                        // Mark executing
                        upsertToolCall({
                            ...toolCall,
                            isExecuting: true,
                            needsApproval: false,
                            isPending: false,
                        })

                        const result = await executeToolCall(
                            {
                                id: toolCall.id,
                                name: toolCall.name,
                                arguments: toolCall.arguments,
                            },
                            rootPath || '',
                            dispatch,
                            { openFile, fileWasUpdated },
                            { signal: abortControllerRef.current?.signal }
                        )

                        toolResults.push({
                            toolCallId: toolCall.id,
                            result: result.result,
                            name: toolCall.name,
                        })
                        upsertToolCall({
                            ...toolCall,
                            isExecuting: false,
                            isPending: false,
                            success: result.success,
                            result: result.result,
                        })
                    } catch (e: any) {
                        toolResults.push({
                            toolCallId: toolCall.id,
                            result: `Error: ${e.message}`,
                            name: toolCall.name,
                        })
                        upsertToolCall({
                            ...toolCall,
                            isExecuting: false,
                            isPending: false,
                            success: false,
                            result: e.message,
                        })
                    }
                }

                // Build next turn
                const nextMessages = injectWorkspaceContext(
                    [
                        ...currentMessages,
                        {
                            role: 'assistant',
                            content: thisTurnText || null,
                            tool_calls: thisTurnToolCalls.map((tc) => ({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: JSON.stringify(tc.arguments),
                                },
                            })),
                        },
                        ...toolResults.map((tr) => ({
                            role: 'tool',
                            tool_call_id: tr.toolCallId,
                            name: tr.name,
                            content: tr.result,
                        })),
                    ],
                    settings.workspaceContextEnabled === false
                        ? ''
                        : await buildWorkspaceContext(
                              store.getState() as FullState
                          )
                )

                await processTurn(nextMessages, currentModel, provider, apiKey)
            } catch (error: any) {
                if (error.message === 'Aborted') throw error
                console.error('processTurn error:', error)
                settleUnfinishedToolCalls(error.message || 'Agent turn failed.')
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === activeAssistantIdRef.current
                            ? {
                                  ...m,
                                  content:
                                      (m.content ? m.content + '\n\n' : '') +
                                      `**Error:** ${error.message}`,
                              }
                            : m
                    )
                )
            }
        },
        [
            rootPath,
            settings,
            dispatch,
            setCurrentPlan,
            updateTurnText,
            upsertToolCall,
            settleUnfinishedToolCalls,
            finalizeAssistantMessage,
        ]
    )

    async function resolveAttachedContexts(
        contexts: ContextTag[]
    ): Promise<string> {
        if (!contexts || contexts.length === 0) return ''
        let text = '\n\n--- USER ATTACHED CONTEXT ---\n'
        for (const ctx of contexts) {
            if (ctx.type === 'file') {
                const fileName = ctx.label.replace(/^@/, '')
                try {
                    let targetPath = ctx.id.startsWith('/') ? ctx.id : ''
                    if (!targetPath) {
                        const files = await searchAllFiles(fileName)
                        targetPath =
                            files.find((f) => f.endsWith(fileName)) ||
                            files[0] ||
                            ''
                    }
                    if (targetPath) {
                        const content = await (connector as any).readFile(
                            targetPath
                        )
                        text += `\n[Attached File: ${targetPath}]\n\`\`\`\n${content.slice(
                            0,
                            25000
                        )}\n\`\`\`\n`
                    } else {
                        text += `\n[Attached File: ${fileName}]\n`
                    }
                } catch {
                    text += `\n[Attached File: ${fileName}]\n`
                }
            } else if (ctx.type === 'git') {
                try {
                    const state = store.getState()
                    const gitState = (state as any).gitState
                    text += `\n[Attached Git Diff Context]\nBranch: ${
                        gitState?.branch || 'main'
                    }\nStaged files: ${
                        (gitState?.stagedFiles || []).join(', ') || 'None'
                    }\nUnstaged files: ${
                        (gitState?.unstagedFiles || []).join(', ') || 'None'
                    }\n`
                } catch {
                    text += `\n[Attached Git Diff Context]\nBranch: main\n`
                }
            } else if (ctx.type === 'terminal') {
                try {
                    text += `\n[Attached Terminal Output]\nRecent terminal command execution logs and output context.\n`
                } catch {
                    text += `\n[Attached Terminal Context]\n`
                }
            } else if (ctx.type === 'doc') {
                try {
                    const docs = await searchAllFiles('README.md')
                    if (docs.length > 0) {
                        const content = await (connector as any).readFile(
                            docs[0]
                        )
                        text += `\n[Attached Documentation: ${
                            docs[0]
                        }]\n\`\`\`markdown\n${content.slice(
                            0,
                            15000
                        )}\n\`\`\`\n`
                    } else {
                        text += `\n[Attached Documentation Context]\n`
                    }
                } catch {
                    text += `\n[Attached Documentation Context]\n`
                }
            } else if (ctx.type === 'image') {
                text += `\n[Attached Media: ${ctx.label}]\n`
            } else if (ctx.type === 'codebase' || ctx.type === 'folder') {
                try {
                    const fullCtx = await buildWorkspaceContext(
                        store.getState() as FullState
                    )
                    text += `\n[Attached Workspace Context]\n${fullCtx}\n`
                } catch {
                    text += `\n[Attached Workspace Context]\n`
                }
            }
        }
        text += '--- END ATTACHED CONTEXT ---\n'
        return text
    }

    // ── Send ─────────────────────────────────────────────────────────────────
    const beginTurn = useCallback(
        async (
            prompt: string,
            history: Message[],
            activeContexts: ContextTag[] = []
        ) => {
            const trimmedPrompt = prompt.trim()
            if (!trimmedPrompt) return
            if (!isAIConfigured) {
                dispatch(setSettingsTab('AI'))
                return
            }

            const userMsg: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: trimmedPrompt,
                timestamp: new Date(),
            }

            // Create the ONE assistant placeholder for the entire response
            const assistantId = `${Date.now() + 1}`
            activeAssistantIdRef.current = assistantId
            segmentsRef.current = []
            activeTextSegmentIdRef.current = null
            activeToolsSegmentIdRef.current = null
            thisTurnToolCallIdsRef.current = new Set()

            const placeholder: Message = {
                id: assistantId,
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                toolCalls: [],
            }

            const updatedMessages = [...history, userMsg, placeholder]
            setMessages(updatedMessages)
            setIsGenerating(true)
            setStreamingSegments([])
            setCurrentPlan(null)
            setStreamPhase('streaming')
            stickToBottomRef.current = true

            if (abortControllerRef.current) abortControllerRef.current.abort()
            abortControllerRef.current = new AbortController()

            try {
                const { model, provider, apiKey } = await getModelToUse()

                const resolvedContextText = await resolveAttachedContexts(
                    activeContexts
                )
                const promptForAPI = resolvedContextText
                    ? `${trimmedPrompt}\n${resolvedContextText}`
                    : trimmedPrompt

                const workspaceContext =
                    settings.workspaceContextEnabled === false
                        ? ''
                        : await buildWorkspaceContext(
                              store.getState() as FullState
                          )
                const cleanHistory = history.filter((m) => {
                    if (m.role === 'assistant') {
                        const hasContent = Boolean(
                            m.content && m.content.trim().length > 0
                        )
                        const hasTools = Boolean(
                            m.toolCalls && m.toolCalls.length > 0
                        )
                        return hasContent || hasTools
                    }
                    return (
                        m.role === 'user' &&
                        Boolean(m.content && m.content.trim().length > 0)
                    )
                })

                const imageTags = activeContexts.filter(
                    (c) => c.type === 'image' && c.dataUrl
                )
                let userPayloadContent: any = promptForAPI
                if (imageTags.length > 0) {
                    userPayloadContent = [
                        { type: 'text', text: promptForAPI },
                        ...imageTags.map((img) => ({
                            type: 'image_url',
                            image_url: { url: img.dataUrl },
                        })),
                    ]
                }

                const apiMessages = injectWorkspaceContext(
                    [
                        ...cleanHistory.flatMap((m): any[] => {
                            if (m.role === 'user')
                                return [{ role: 'user', content: m.content }]
                            const msgs: any[] = []
                            const tcs = m.toolCalls?.map((tc) => ({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: JSON.stringify(
                                        tc.arguments || {}
                                    ),
                                },
                            }))
                            const assistantText =
                                m.content && m.content.trim()
                                    ? m.content
                                    : tcs?.length
                                    ? ''
                                    : '...'
                            msgs.push({
                                role: 'assistant',
                                content: assistantText,
                                tool_calls: tcs?.length ? tcs : undefined,
                            })
                            m.toolCalls?.forEach((tc) => {
                                if (tc.result !== undefined) {
                                    msgs.push({
                                        role: 'tool',
                                        tool_call_id: tc.id,
                                        name: tc.name,
                                        content: String(
                                            tc.result ||
                                                (tc.success
                                                    ? 'Success'
                                                    : 'Failed')
                                        ),
                                    })
                                }
                            })
                            return msgs
                        }),
                        { role: 'user', content: userPayloadContent },
                    ],
                    workspaceContext
                )

                await processTurn(apiMessages, model, provider, apiKey)
            } catch (error: any) {
                if (error.message !== 'Aborted') {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId
                                ? {
                                      ...m,
                                      content: `**Error:** ${
                                          error.message ||
                                          'Failed to get response.'
                                      }`,
                                  }
                                : m
                        )
                    )
                }
            } finally {
                setIsGenerating(false)
                setStreamingSegments([])
                setCurrentPlan(null)
                setStreamPhase('idle')
                segmentsRef.current = []
                activeTextSegmentIdRef.current = null
                activeToolsSegmentIdRef.current = null
                currentPlanRef.current = null
                abortControllerRef.current = null
            }
        },
        [isAIConfigured, getModelToUse, dispatch, processTurn, setCurrentPlan]
    )

    const handleSend = useCallback(() => {
        const trimmed = input.trim()
        const tagLabels = attachedContexts.map((c) => c.label).join(' ')
        const prompt = tagLabels ? `${tagLabels} ${trimmed}` : trimmed
        if (!prompt) return

        const activeContexts = [...attachedContexts]
        setInput('')
        setAttachedContexts([])
        if (isGenerating) {
            setQueuedPrompts((prev) => [...prev, prompt])
            return
        }

        void beginTurn(prompt, messagesRef.current, activeContexts)
    }, [beginTurn, input, isGenerating, attachedContexts])

    useEffect(() => {
        if (isGenerating || queuedPrompts.length === 0) return
        if (suppressQueueEffectRef.current) {
            suppressQueueEffectRef.current = false
            return
        }

        const [nextPrompt, ...remaining] = queuedPrompts
        setQueuedPrompts(remaining)
        void beginTurn(nextPrompt, messagesRef.current)
    }, [beginTurn, isGenerating, queuedPrompts])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
            }
        },
        [handleSend]
    )

    const handleClearChat = useCallback(() => {
        setMessages([])
        setQueuedPrompts([])
        setStreamingSegments([])
        setCurrentPlan(null)
        setStreamPhase('idle')
        segmentsRef.current = []
        activeTextSegmentIdRef.current = null
        activeToolsSegmentIdRef.current = null
        currentPlanRef.current = null
        thisTurnToolCallIdsRef.current = new Set()
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setIsGenerating(false)
        Object.values(confirmationResolvers.current).forEach((r) => {
            try {
                r.reject()
            } catch {
                // Resolver may already be settled during cancellation.
            }
        })
        confirmationResolvers.current = {}
    }, [])

    const handleStopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        const queuedAtStop = queuedPrompts
        setIsGenerating(false)
        settleUnfinishedToolCalls('Stopped by user.')
        Object.values(confirmationResolvers.current).forEach((r) => {
            try {
                r.reject()
            } catch {
                // Resolver may already be settled during cancellation.
            }
        })
        confirmationResolvers.current = {}
        if (activeAssistantIdRef.current) {
            const derived = messageFromSegments(segmentsRef.current)
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === activeAssistantIdRef.current
                        ? {
                              ...m,
                              content:
                                  (derived.content || m.content)
                                      .replace(/<plan>[\s\S]*?<\/plan>/g, '')
                                      .trim() + ' *(stopped)*',
                              toolCalls: derived.toolCalls.length
                                  ? derived.toolCalls
                                  : m.toolCalls,
                              segments: derived.segments,
                              plan: currentPlanRef.current || m.plan,
                          }
                        : m
                )
            )
        }
        setStreamingSegments([])
        setCurrentPlan(null)
        setStreamPhase('idle')
        segmentsRef.current = []
        activeTextSegmentIdRef.current = null
        activeToolsSegmentIdRef.current = null
        currentPlanRef.current = null

        if (queuedAtStop.length > 0) {
            const [nextPrompt, ...remaining] = queuedAtStop
            suppressQueueEffectRef.current = true
            setQueuedPrompts(remaining)
            setTimeout(() => {
                void beginTurn(nextPrompt, messagesRef.current)
            }, 0)
        }
    }, [beginTurn, queuedPrompts, settleUnfinishedToolCalls])

    const handleToolApproval = useCallback(
        (toolId: string, approved: boolean) => {
            confirmationResolvers.current[toolId]?.resolve(approved)
        },
        []
    )

    const handleClose = useCallback(
        () => dispatch(ts.untriggerAICommandPalette()),
        [dispatch]
    )
    const handleConfigureAI = useCallback(() => {
        dispatch(setSettingsTab('AI'))
    }, [dispatch])

    const activeFileName = activeFilePath?.split('/').pop()

    // ── Shared header ─────────────────────────────────────────────────────────
    const Header = () => (
        <div
            className="flex items-center gap-2.5 px-3.5 h-11 shrink-0 border-b border-t border-ui-border"
            style={{ borderTopColor: 'var(--pane-border)' }}
        >
            {/* Icon */}
            <div className="w-6.5 h-6.5 rounded-lg flex items-center justify-center shrink-0 text-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]">
                <Codicon
                    name="sparkle"
                    style={{ fontSize: 12, color: 'var(--accent)' }}
                />
            </div>

            {/* Agent + model */}
            <div className="flex flex-col leading-tight min-w-0">
                <span className="text-[12px] font-bold tracking-wide text-ui-fg">
                    Cursor Agent
                </span>
                <span
                    className="text-[11px] text-ui-fg-muted opacity-80 truncate max-w-[140px]"
                    title={providerInfo.model}
                >
                    {providerInfo.model}
                </span>
            </div>

            {/* Active file chip */}
            {activeFileName && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-ui-border bg-ui-bg-elevated text-[11px] text-ui-fg-muted max-w-[120px] overflow-hidden">
                    <Codicon name="file" style={{ fontSize: 10 }} />
                    <span className="truncate">{activeFileName}</span>
                </div>
            )}

            <div className="flex items-center gap-1 ml-auto">
                {messages.length > 0 && (
                    <button
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-ui-hover text-ui-fg-muted hover:text-ui-fg transition-colors"
                        onClick={handleClearChat}
                        title="New chat"
                    >
                        <Codicon name="add" style={{ fontSize: 12 }} />
                    </button>
                )}
                <button
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-ui-hover text-ui-fg-muted hover:text-ui-fg transition-colors"
                    onClick={handleClose}
                    title="Close (⌘L)"
                >
                    <Codicon name="close" style={{ fontSize: 13 }} />
                </button>
            </div>
        </div>
    )

    // ── Not configured ────────────────────────────────────────────────────────
    if (!isAIConfigured) {
        return (
            <div className="ai-sidebar flex flex-col h-full w-full bg-sidebar">
                <Header />
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="flex flex-col items-center text-center gap-3 max-w-[260px] relative">
                        <div
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full pointer-events-none animate-glow-pulse"
                            style={{
                                background:
                                    'radial-gradient(circle, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 70%)',
                            }}
                        />
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
                            <Codicon
                                name="sparkle"
                                style={{ fontSize: 26, color: 'var(--accent)' }}
                            />
                        </div>
                        <p className="text-base font-bold text-ui-fg -tracking-wide">
                            AI Not Configured
                        </p>
                        <p className="text-[12px] text-ui-fg-muted opacity-75 leading-relaxed">
                            Connect an AI provider to start your agentic coding
                            session.
                        </p>
                        <button
                            className="mt-1 px-5 py-2 bg-accent text-white text-[13px] font-semibold rounded-md hover:opacity-90 hover:-translate-y-px transition-all"
                            onClick={handleConfigureAI}
                        >
                            Configure AI Provider
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Main chatbox ──────────────────────────────────────────────────────────
    const runningToolName = streamingSegments
        .flatMap((s) => (s.type === 'tools' ? s.toolCalls : []))
        .find((tc) => tc.isExecuting)
        ?.name?.replace(/_/g, ' ')
    const genStatusText = runningToolName
        ? `Running ${runningToolName}…`
        : streamingSegments.some((s) => s.type === 'tools')
        ? 'Analyzing workspace…'
        : 'Generating response…'

    return (
        <div className="ai-sidebar flex flex-col h-full w-full bg-sidebar">
            <Header />

            {/* Messages */}
            <div ref={messagesContainerRef} className="ai-sidebar__messages">
                {/* Empty state */}
                {messages.length === 0 && (
                    <div className="flex flex-col items-center text-center gap-3.5 my-auto max-w-[280px] mx-auto relative py-8">
                        <div
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full pointer-events-none animate-glow-pulse"
                            style={{
                                background:
                                    'radial-gradient(circle, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 70%)',
                            }}
                        />
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
                            <Codicon
                                name="sparkle"
                                style={{ fontSize: 26, color: 'var(--accent)' }}
                            />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[15px] font-bold text-ui-fg -tracking-wide mb-1">
                                Cursor Agent
                            </p>
                            <p className="text-[12px] text-ui-fg-muted opacity-75 leading-relaxed">
                                Reads files, runs terminal commands, edits code,
                                and thinks through complex multi-file tasks.
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5 w-full mt-1">
                            {QUICK_PROMPTS.map(({ label, icon }) => (
                                <button
                                    key={label}
                                    className="flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-lg border border-ui-border bg-ui-bg-elevated text-[12px] font-medium text-ui-fg hover:border-accent hover:text-accent hover:translate-x-1 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition-all"
                                    onClick={() => {
                                        setInput(label)
                                        setTimeout(
                                            () => textareaRef.current?.focus(),
                                            50
                                        )
                                    }}
                                >
                                    <Codicon
                                        name={icon}
                                        style={{ fontSize: 12, opacity: 0.7 }}
                                    />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Message list */}
                {messages.map((message) => {
                    const isStreamingThis =
                        isGenerating &&
                        message.id === activeAssistantIdRef.current

                    // Skip empty placeholder visually when streaming state is rendering it
                    if (
                        !isStreamingThis &&
                        message.role === 'assistant' &&
                        !message.content &&
                        !message.segments?.length &&
                        (!message.toolCalls || message.toolCalls.length === 0)
                    )
                        return null

                    return (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            onToolApproval={handleToolApproval}
                            onRetry={
                                message.role === 'user'
                                    ? () => {
                                          setInput(message.content)
                                          setTimeout(
                                              () =>
                                                  textareaRef.current?.focus(),
                                              50
                                          )
                                      }
                                    : undefined
                            }
                            isStreaming={isStreamingThis}
                            streamingSegments={
                                isStreamingThis ? streamingSegments : undefined
                            }
                            activeTextSegmentId={
                                isStreamingThis
                                    ? activeTextSegmentIdRef.current
                                    : null
                            }
                            currentPlan={
                                isStreamingThis ? currentPlan : undefined
                            }
                            streamPhase={isStreamingThis ? streamPhase : 'idle'}
                        />
                    )
                })}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-ui-border">
                {queuedPrompts.length > 0 && (
                    <div className="border-b border-ui-border bg-sidebar px-3 py-2">
                        <div className="max-h-28 overflow-y-auto rounded-lg border border-ui-border bg-sidebar p-2">
                            <div className="flex flex-col gap-1.5">
                                {queuedPrompts.map((prompt, index) => (
                                    <div
                                        key={`${prompt}-${index}`}
                                        className="flex items-start gap-2 text-[12px] leading-relaxed text-ui-fg-muted"
                                    >
                                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full border border-ui-border" />
                                        <span>{prompt}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div className="p-3 relative">
                    {/* `@` Mention Autocomplete Floating Popup */}
                    {showMentionPopup && mentionResults.length > 0 && (
                        <div className="absolute bottom-full mb-2.5 left-3 right-3 z-50 rounded-xl border border-ui-border bg-sidebar shadow-2xl overflow-hidden max-h-[260px] flex flex-col animate-in fade-in duration-100">
                            <div className="px-3 py-1.5 border-b border-ui-border text-[10px] font-bold text-ui-fg-muted uppercase tracking-wider bg-ui-bg-elevated flex items-center justify-between">
                                <span>Context Mentions (@)</span>
                                <span className="opacity-70 font-normal">
                                    ↑↓ to navigate · Enter to select
                                </span>
                            </div>
                            <div className="overflow-y-auto p-1 flex flex-col gap-0.5 max-h-[220px]">
                                {mentionResults.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                            idx === mentionIndex
                                                ? 'bg-ui-hover text-ui-fg mention-item--selected'
                                                : 'text-ui-fg-muted hover:text-ui-fg hover:bg-ui-hover'
                                        }`}
                                        onClick={() => selectMentionItem(item)}
                                    >
                                        <Codicon
                                            name={item.icon}
                                            style={{
                                                fontSize: 13,
                                                color: 'var(--accent)',
                                            }}
                                        />
                                        <div className="flex flex-col min-w-0 leading-tight">
                                            <span className="text-[12px] font-medium text-ui-fg truncate">
                                                {item.label}
                                            </span>
                                            <span className="text-[10px] text-ui-fg-muted truncate opacity-70">
                                                {item.desc}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div
                        className="rounded-xl overflow-hidden border border-ui-border transition-colors focus-within:border-ui-border"
                        style={{ background: 'var(--sidebar-bg)' }}
                    >
                        {/* Attached Context Chips */}
                        {attachedContexts.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-2.5">
                                {attachedContexts.map((tag) => (
                                    <div
                                        key={tag.id}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-ui-border bg-ui-bg-elevated text-[11px] font-medium text-ui-fg"
                                    >
                                        <Codicon
                                            name={tag.icon}
                                            style={{
                                                fontSize: 10,
                                                color: 'var(--accent)',
                                            }}
                                        />
                                        <span>{tag.label}</span>
                                        <button
                                            className="ml-1 hover:text-danger opacity-60 hover:opacity-100 transition-opacity"
                                            onClick={() =>
                                                setAttachedContexts((prev) =>
                                                    prev.filter(
                                                        (t) => t.id !== tag.id
                                                    )
                                                )
                                            }
                                            title="Remove tag"
                                        >
                                            <Codicon
                                                name="close"
                                                style={{ fontSize: 9 }}
                                            />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleTextareaKeyDown}
                            placeholder={
                                isGenerating
                                    ? 'Type the next prompt…'
                                    : 'Ask anything… Type @ to tag files, git, or codebase'
                            }
                            rows={1}
                            className="w-full min-h-[64px] bg-transparent text-ui-fg text-[14px] font-mono px-3.5 py-3 resize-none outline-none border-none placeholder:text-ui-fg-muted placeholder:opacity-70 max-h-[200px] leading-relaxed"
                        />

                        {/* Input Footer Toolbar */}
                        <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                            {/* Left: Model & Attach Image */}
                            <div className="flex items-center gap-2 text-ui-fg-muted text-[11px]">
                                <button
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-ui-fg-muted hover:text-ui-fg hover:bg-ui-hover transition-colors cursor-pointer"
                                    onClick={() =>
                                        imageInputRef.current?.click()
                                    }
                                    title="Attach image or file"
                                >
                                    <Codicon
                                        name="file-media"
                                        style={{
                                            fontSize: 11,
                                            color: 'var(--accent)',
                                        }}
                                    />
                                    <span>Attach</span>
                                </button>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                />
                            </div>

                            {/* Right: Actions */}
                            <div className="flex shrink-0 items-center gap-1.5 ml-auto">
                                {isGenerating && (
                                    <button
                                        onClick={handleStopGeneration}
                                        className="w-7 h-7 flex items-center justify-center rounded-md border border-ui-border bg-transparent text-danger hover:bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] transition-colors"
                                        title="Stop generation"
                                        aria-label="Stop generation"
                                    >
                                        <span className="h-2 w-2 rounded-full bg-current" />
                                    </button>
                                )}
                                <button
                                    onClick={handleSend}
                                    disabled={
                                        !input.trim() &&
                                        attachedContexts.length === 0
                                    }
                                    className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                                        input.trim() ||
                                        attachedContexts.length > 0
                                            ? 'bg-accent text-white hover:opacity-85'
                                            : 'border border-ui-border text-ui-fg-muted opacity-45 cursor-not-allowed'
                                    }`}
                                    title={
                                        isGenerating
                                            ? 'Queue next prompt (Enter)'
                                            : 'Send (Enter)'
                                    }
                                >
                                    <Codicon
                                        name="send"
                                        style={{ fontSize: 11 }}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
