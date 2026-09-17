import React, {
    ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import cx from 'classnames'
import { ActionTips, Tip } from '../app/constants'
import { CodeSymbolType, Message } from '../features/window/state'
import { getIconElement } from '../components/filetree'

import {
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    lineNumbers,
} from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { languages } from '@codemirror/language-data'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { syntaxBundle } from '../features/extensions/syntax'
import { ContextBuilder } from '../features/chat/context'

import * as csel from '../features/chat/chatSelectors'

import { removeBeginningAndEndingLineBreaks } from '../utils'
import ReactMarkdown from 'react-markdown'

import { diffExtension } from '../features/extensions/diff'
import * as cs from '../features/chat/chatSlice'
import * as ct from '../features/chat/chatThunks'

import { getCursorTheme } from '../theme'
import { getSettings } from '../features/settings/settingsSelectors'
import { vim } from './codemirror-vim'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'

import ReactTextareaAutocomplete from '@webscopeio/react-textarea-autocomplete'

import Modal from 'react-modal'

export function PreBlock({ children }: { children: ReactNode | ReactNode[] }) {
    function getResult(child: ReactNode) {
        if (React.isValidElement(child)) {
            const className = child.props.className || 'language-plaintext'
            return (
                <CodeBlock className={className}>
                    {child.props.children}
                </CodeBlock>
            )
        }
    }
    if (Array.isArray(children)) {
        return <>{children.map(getResult)}</>
    } else {
        return <>{getResult(children)}</>
    }
}

export function CodeBlock({
    children,
    className = '',
    startLine = null,
    setDiffArgs = null,
    isEditable = false,
    copyable = true,
}: {
    className?: string
    children: ReactNode | ReactNode[]
    startLine?: number | null
    setDiffArgs?: any
    isEditable?: boolean
    copyable?: boolean
}) {
    // Get child that is code

    // Extract the language name from the className
    // const dispatch = useAppDispatch()
    const [codeButton, setCodeButton] = useState(false)
    let language: string

    if (children == null) {
        return <> </>
    } else if (Array.isArray(children)) {
        children = children[0]
    }

    if (className == '') {
        language = 'plaintext'
    } else {
        language = className.replace('language-', '')
    }
    const ref = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const [blockStarted, setBlockStarted] = useState(false)
    const settings = useAppSelector(getSettings)

    // Recreate CodeMirror view when theme changes or component mounts
    useEffect(() => {
        const startBlock = async () => {
            if (ref.current && className != '') {
                // Clean up previous view if it exists (especially on theme change)
                if (viewRef.current) {
                    viewRef.current.destroy()
                    viewRef.current = null
                }

                // Find the language mode from the Codemirror language data
                const langPackage = languages.find(
                    (lang) => lang.name.toLowerCase() == language.toLowerCase()
                )
                let extension
                if (langPackage == null) {
                    extension = []
                } else {
                    extension = await langPackage.load()
                }
                // Create the editor state with the code value, language mode, and theme
                const toset = removeBeginningAndEndingLineBreaks(
                    (children as string).trimEnd()
                )
                const state = EditorState.create({
                    doc: toset,
                    extensions: [
                        diffExtension,
                        startLine == null
                            ? []
                            : lineNumbers({
                                  formatNumber: (
                                      n: number,
                                      _state: EditorState
                                  ) => String(n + startLine),
                              }),
                        EditorView.editable.of(isEditable),
                        isEditable
                            ? [
                                  vim(),
                                  highlightActiveLine(),
                                  highlightActiveLineGutter(),
                              ]
                            : [],
                        await syntaxBundle(`text.${language}`),
                        extension,
                        getCursorTheme(), // Get fresh theme from theme system
                        EditorView.lineWrapping,
                    ],
                })

                // Create the editor view and attach it to the ref
                const view = new EditorView({
                    state,
                    parent: ref.current,
                })
                viewRef.current = view
                setBlockStarted(true)
                setCodeButton(true)
            } else if (children !== '' && !blockStarted && className === '') {
                setCodeButton(false)
                // append a code span to div ref
                const codeSpan = document.createElement('span')
                codeSpan.className = 'code__span'
                codeSpan.innerText = removeBeginningAndEndingLineBreaks(
                    children as string
                )
                ref.current?.appendChild(codeSpan)
            }
        }

        startBlock()

        return () => {
            if (viewRef.current) {
                viewRef.current.destroy()
                viewRef.current = null
            }
        }
    }, [
        className,
        setDiffArgs,
        settings.theme,
        children,
        language,
        isEditable,
        startLine,
    ])

    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: viewRef.current.state.doc.length,
                    insert: children as string,
                },
            })
        }
    }, [children])
    // Return a div element with the ref
    return (
        <div className="codeblockwrapper my-4">
            {codeButton && copyable && (
                <button
                    className="copyButton"
                    onClick={() => {
                        if (viewRef.current) {
                            navigator.clipboard.writeText(
                                viewRef.current.state.doc.toString()
                            )
                        }
                    }}
                    title="Copy Code"
                >
                    <FontAwesomeIcon icon={faCopy} />
                </button>
            )}
            <div
                className={cx('codeblock w-full overflow-hidden', {
                    'result-codeblock': className !== '',
                    display_text_wrapping: true,
                })}
                ref={ref}
            />
        </div>
    )
}

export function CommandBarActionTips(props: {
    tips: Tip[]
    align?: 'left' | 'right'
}) {
    return (
        <div
            className={cx('flex space-x-2', {
                'justify-start': props.align ?? 'left' === 'left',
                'justify-end': props.align === 'right',
            })}
        >
            {props.tips.map(([name, tip, icon, callback]) => (
                <div
                    key={`${name}-${tip}`}
                    className="text-neutral-400 text-xs my-1 history-tip-icon-container"
                    onClick={(e) => {
                        e.preventDefault()
                        callback()
                    }}
                >
                    <FontAwesomeIcon className="history-tip-icon" icon={icon} />
                </div>
            ))}
        </div>
    )
}

export function ChatPopup() {
    const dispatch = useAppDispatch()
    const isGenerating = useAppSelector<boolean>(
        (state) => state.chatState.generating
    )
    const isChatOpen = useAppSelector<boolean>(csel.isChatOpen)
    const isChatHistoryOpen = useAppSelector<boolean>(csel.isChatHistoryOpen)

    const messages = useAppSelector(csel.getCurrentConversationMessages())
    // const filePath = useAppSelector(getCurrentFilePath)

    const commandBoxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!isGenerating && commandBoxRef) {
            setTimeout(() => {
                commandBoxRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
        }
    }, [isGenerating])

    const markdownPopups = Object.entries(messages).map(([index, message]) => (
        <MarkdownPopup key={index} message={message} dismissed={!isChatOpen} />
    ))

    const handleSelectHistory = (id: string) => {
        dispatch(cs.setCurrentConversation(id))
        dispatch(cs.setChatOpen(true))
    }

    // const handleCloseHistory = () => {
    //     dispatch(cs.toggleChatHistory())
    // }

    function handleMouseDown() {
        if (document.activeElement) {
            const el = document.activeElement as HTMLElement
            el.blur()
        }
    }
    return (
        <>
            {isChatOpen && (
                <div
                    className="chatpopup w-full h-full flex flex-col"
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex-1 overflow-auto px-4 py-2 space-y-4 scroll-smooth">
                        {markdownPopups}
                        <div ref={commandBoxRef} className="pb-4">
                            {!isGenerating && (
                                <CommandBar parentCaller={'chat'} />
                            )}
                        </div>
                    </div>
                    {isChatHistoryOpen && (
                        <div className="border-t border-ui-border bg-black-elevated/50 backdrop-blur-md">
                            <ChatHistory
                                onSelect={handleSelectHistory}
                                onClose={() => dispatch(cs.toggleChatHistory())}
                            />
                        </div>
                    )}
                </div>
            )}
        </>
    )
}

export function MarkdownPopup({
    message,
    dismissed,
}: {
    message: Message
    dismissed: boolean
}) {
    // const lastBotMessage = useAppSelector(csel.getLastMarkdownMessage);
    const reactMarkdownRef = useRef<HTMLDivElement>(null)

    // Replace all occurrences of "/path/to/file.extension\n" with "file.extension\n"
    const replacePathWithFilename = (text: string) => {
        return text.replace(/```\/[\w/]+\/\w+\.(\w+)\n/g, '```$1\n')
    }

    const formattedMessage = useMemo(() => {
        return replacePathWithFilename(message.message)
    }, [message.message])

    useEffect(() => {
        if (message?.sender == 'bot' && message.type === 'markdown') {
            // setDismissed(false)
            if (reactMarkdownRef.current) {
                const elem = reactMarkdownRef.current
                if (elem.children) {
                    const lastChild = elem.children[elem.children.length - 1]
                    if (lastChild) {
                        lastChild?.scrollIntoView(false)
                    }
                }
            }
        } else if (message?.sender == 'user') {
            // setDismissed(false);
            if (reactMarkdownRef.current) {
                const elem = reactMarkdownRef.current
                if (elem.children) {
                    const lastChild = elem.children[elem.children.length - 1]
                    if (lastChild) {
                        lastChild?.scrollIntoView(false)
                    }
                }
            }
        }
    }, [message])

    if (message.message.trim() == '') {
        return <></>
    }
    const className = message?.sender == 'user' ? 'userpopup' : 'markdownpopup'
    //
    return (
        <>
            {((message?.sender == 'bot' && message.type === 'markdown') ||
                message?.sender == 'user') &&
                !dismissed && (
                    <div className={cx(className, 'p-4')}>
                        <div
                            className="markdownpopup__content"
                            ref={reactMarkdownRef}
                        >
                            <ReactMarkdown
                                components={{
                                    pre: PreBlock,
                                    code: CodeBlock,
                                    a: CustomLink,
                                }}
                            >
                                {formattedMessage}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}
        </>
    )
}
const CustomLink = ({ children, href }: any) => {
    return (
        <a href={href} target="_blank">
            {children}
        </a>
    )
}

const Item = ({
    entity: { name, summary, path, startIndex, endIndex },
}: {
    entity: {
        name: string
        type: CodeSymbolType
        summary: string
        path: string
        startIndex: number
        endIndex: number
    }
}) => {
    const relativePath = path.slice(2)
    const fileIcon = getIconElement(relativePath)

    return (
        <>
            {/* Tailwind css for making the background white when selected */}
            <div className="file__line ">
                <div className="file__icon">{fileIcon}</div>
                <div className="file__name">
                    {name.slice(0, startIndex)}
                    <mark>{name.slice(startIndex, endIndex)}</mark>
                    {name.slice(endIndex)}
                </div>
                <div className="file__path">{relativePath}</div>
            </div>
            <div className="truncate">
                <CodeBlock className="language-python" copyable={false}>
                    {summary}
                </CodeBlock>
            </div>
        </>
    )
}

const Loading = () => <div>Loading</div>

export function CommandBarInner({ autofocus }: { autofocus: boolean }) {
    const dispatch = useAppDispatch()
    const currentDraft = useAppSelector(csel.getCurrentDraftMessage)
    const repoId = useAppSelector((state) => state.global.repoId)
    const textareaRef = useRef<{ value: HTMLTextAreaElement | null }>({
        value: null,
    })
    const rtaRef = useRef<any>(null)

    const getMsgType = useAppSelector(csel.getMsgType)
    let placeholder = 'Chat about the current file/selection...'
    if (getMsgType === 'edit') {
        placeholder = 'Instructions for editing selection...'
    } else if (getMsgType === 'generate') {
        placeholder = 'Instructions for code to generate...'
    } else if (getMsgType === 'chat_edit') {
        placeholder = 'Instructions for editing the current file...'
    }

    const builder = useRef<ContextBuilder>()

    const getCompletions = useCallback(async (text: string) => {
        return (await builder.current?.getCompletion(text, [])) || []
    }, [])

    useEffect(() => {
        if (repoId) {
            builder.current = new ContextBuilder(repoId)
        }
    }, [repoId])

    return (
        <ReactTextareaAutocomplete<any>
            className="commandBar__input"
            placeholder={placeholder}
            loadingComponent={Loading}
            scrollToItem={(container, item) => {
                if (item) {
                    item.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                }
            }}
            ref={rtaRef}
            rows={1}
            trigger={{
                '`': {
                    dataProvider: async (token) => {
                        return getCompletions(token)
                    },
                    component: Item as any,
                    output: (item: any) => {
                        return (
                            '<|START_SPECIAL|>' +
                            JSON.stringify(item) +
                            '<|END_SPECIAL|>'
                        )
                    },
                },
            }}
            containerStyle={{ width: '100%', maxHeight: '80' }}
            dropdownStyle={{
                width: '100%',
                maxHeight: '30vh',
                overflowY: 'auto',
            }}
            value={currentDraft?.message || ''}
            autoFocus={autofocus}
            onChange={(e: any) => {
                if (e.target.value.includes('<|START_SPECIAL|>')) {
                    const start =
                        e.target.value.indexOf('<|START_SPECIAL|>') +
                        '<|START_SPECIAL|>'.length
                    const end = e.target.value.indexOf('<|END_SPECIAL|>')

                    const special = e.target.value.slice(start, end)
                    const item = JSON.parse(special)
                    dispatch(
                        cs.addSymbolToMessage({
                            name: item.name,
                            fileName: item.path,
                            type: item.type,
                        })
                    )
                    e.target.value =
                        e.target.value.slice(
                            0,
                            start - '<|START_SPECIAL|>'.length
                        ) +
                        '`' +
                        item.name +
                        '`' +
                        e.target.value.slice(end + '<|END_SPECIAL|>'.length)
                }
                if (textareaRef.current.value) {
                    textareaRef.current.value.style.height = 'auto'
                    textareaRef.current.value.style.height =
                        textareaRef.current.value.scrollHeight + 'px'
                }
                dispatch(cs.setCurrentDraftMessage(e.target.value))
            }}
            innerRef={(ref: any) => {
                textareaRef.current.value = ref
            }}
            onKeyDown={(e) => {
                if (!e.shiftKey && e.key === 'Enter') {
                    if (textareaRef.current.value?.value.trim().length) {
                        dispatch(ct.submitCommandBar(null))
                        e.preventDefault()
                    }
                }
                if (e.keyCode === 38 && e.ctrlKey) {
                    dispatch(cs.moveCommandBarHistory('up'))
                    e.preventDefault()
                }
                if (e.keyCode === 40 && e.ctrlKey) {
                    dispatch(cs.moveCommandBarHistory('down'))
                    e.preventDefault()
                }
                if (
                    (e.keyCode === 74 ||
                        e.keyCode === 75 ||
                        e.keyCode === 76) &&
                    e.metaKey
                ) {
                    dispatch(cs.abortCommandBar())
                }
                if (e.keyCode === 90 && e.metaKey) {
                    dispatch(cs.abortCommandBar())
                }
            }}
        />
    )
}

function formatPromptTime(sentAt: number): string {
    const date = new Date(sentAt)
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    const formattedHours = hours % 12 ? 12 : hours % 12
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes
    return `${formattedHours}:${formattedMinutes}${ampm}`
}

function formatPromptPreview(prompt: string): string {
    // const maxLength = 38
    const noNewlines = prompt.replace(/(\r\n|\n|\r)/gm, '')
    // const truncated =
    //     noNewlines.length > maxLength
    //         ? noNewlines.slice(0, maxLength).trim() + '...'
    //         : noNewlines
    // return `"${truncated}"`
    // return `"${noNewlines}"`
    return noNewlines
}

function ChatHistory(props: {
    onSelect?: (id: string) => void
    onClose?: () => void
}) {
    const conversationIds = useAppSelector(csel.getConversationIds)
    const conversationPrompts = useAppSelector(
        csel.getConversationPrompts(conversationIds, 'reverse')
    )

    return (
        <div className="flex flex-col items-center w-80 select-none">
            <button className="w-full" onClick={props.onClose}>
                <CommandBarActionTips
                    align="right"
                    tips={[ActionTips.CLOSE_HISTORY]}
                />
            </button>
            <div className="flex flex-col w-full items-center space-y-1 mt-1 overflow-auto">
                {conversationPrompts.map((msg) => {
                    return (
                        <button
                            key={msg.conversationId}
                            className="w-full bg-neutral-600 rounded-sm px-4 py-2"
                            onClick={() => props.onSelect?.(msg.conversationId)}
                        >
                            <div
                                className={
                                    'flex justify-between whitespace-nowrap items-center'
                                }
                            >
                                <span className="text-neutral-300 text-base customEllipsis">
                                    {formatPromptPreview(msg.message)}
                                </span>
                                <span className="text-neutral-400 text-base">
                                    {formatPromptTime(msg.sentAt)}
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function CommandBar({
    parentCaller,
}: {
    parentCaller: 'chat' | 'commandBar'
}) {
    const dispatch = useAppDispatch()

    const customStyles = {
        overlay: {
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(2px)',
        },
        content: {
            padding: '0',
            bottom: 'auto',
            background: 'none',
            border: 'none',
            marginLeft: 'auto',
            marginRight: 'auto',
            top: '20%',
            width: '600px',
            maxWidth: '90vw',
            left: '50%',
            right: 'auto',
            transform: 'translateX(-50%)',
            overflow: 'visible',
        },
    }

    const commandBarOpen = useAppSelector(csel.getIsCommandBarOpen)

    return (
        <>
            {parentCaller == 'commandBar' ? (
                <Modal
                    isOpen={commandBarOpen}
                    onRequestClose={() => {
                        dispatch(cs.abortCommandBar())
                    }}
                    style={customStyles}
                >
                    <div className="commandBar__container">
                        <div className="commandBar">
                            <div className="commandBar__input_container">
                                <CommandBarInner autofocus={true} />
                            </div>
                        </div>
                    </div>
                </Modal>
            ) : (
                <div className="commandBar__container">
                    <div className="commandBar">
                        <div className="commandBar__input_container">
                            <CommandBarInner autofocus={false} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
