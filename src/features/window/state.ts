import { Action } from '@reduxjs/toolkit'
import { CustomTransaction } from '../../components/codemirrorHooks/dispatch'
import { v4 as uuidv4 } from 'uuid'
import { ExpectedError } from '../../utils'
import type { RootState } from '../../app/store'

export interface File {
    parentFolderId: number
    name: string
    renameName: string | null
    isSelected: boolean
    saved: boolean
    indentUnit?: string
    latestAccessTime?: number
    lastSavedTime?: number
    savedTime?: number
    deleted?: boolean
    isCreating?: boolean
}

export interface Folder {
    parentFolderId: number | null
    name: string
    renameName: string | null
    fileIds: number[]
    folderIds: number[]
    loaded: boolean
    isOpen: boolean
    isCreating?: boolean
}

export enum HoverState {
    None,
    Full,
    Right,
    Left,
    Top,
    Bottom,
}

export interface Pane {
    contents: string
    isActive: boolean
    tabIds: number[]
}

export type FolderData = {
    folders: { [key: number]: Folder }
    files: { [key: number]: File }
}

export interface PaneState {
    bySplits: any
    byIds: { [key: number]: Pane }
}

export interface Tab {
    isActive: boolean
    isReady: number
    fileId: number
    paneId: number

    isChat: boolean

    isReadOnly: boolean
    generating: boolean
    interrupted: boolean

    isMulti: boolean
    isMultiDiff: boolean
}

export interface CachedFile {
    contents: string
    counter: number
}
export interface ReduxTransaction {
    transactionId: number
    // transactionFunction: (editorView: EditorView) => TransactionSpec;
    transactionFunction: CustomTransaction | CustomTransaction[]
}

export interface ReduxEditorState {
    history: {
        done?: any[]
        undone?: any[]
    }
    doc: string
    selection: {
        main: number
        ranges: {
            anchor: number
            number: number
        }[]
    }
}

export interface CachedTab {
    initialEditorState: ReduxEditorState | null
    pendingTransactions: ReduxTransaction[]
    scrollPos: number | null
    vimState: any
}
export interface RepoProgress {
    progress: number
    state: 'notStarted' | 'uploading' | 'indexing' | 'done' | 'error'
}

export interface State {
    repoId: string | null
    repoProgress: RepoProgress
    paneState: PaneState

    rightClickId: number | null
    isRightClickAFile: boolean | null

    rootPath: string | null
    folders: { [key: number]: Folder }
    files: { [key: number]: File }
    tabs: { [key: number]: Tab }

    fileCache: { [key: string]: CachedFile }
    tabCache: { [key: string]: CachedTab }

    // keyboardBindings: {[id: string]: {key: string, action: Action}};
    keyboardBindings: { [key: string]: Action }

    draggingTabId: number | null

    zoomFactor: number

    showError: boolean
    showRateLimit: boolean
    errorValue: ExpectedError | null
    errorType: string
    errorInfo: string

    version: string

    showRemotePopup: boolean
    showClonePopup: boolean
    remoteCommand: string
    remotePath: string
    remoteBad: boolean

    isNotFirstTime: boolean
    terminalOpen: boolean
    recentProjects: string[]
    fileDiagnostics: { [key: string]: any[] }
}

export interface DiffSpan {
    type: 'diff'
    fileId: number

    // Points to the id of the original CodeSpan that
    // this is a diff of.
    origSpanId: number

    startLine: number
    endLine: number
    text: string

    mode:
        | 'accepted'
        | 'rejected'
        | 'showed'
        | 'showing'
        | 'generating'
        | 'creating'
}

export interface Diff {
    content: DiffSpan
    id: number
}

export interface CodeSpan {
    type: 'code'
    fileId: number
    startLine: number
    endLine: number
    text: string
}

export interface TextSpan {
    type: 'text'
    text: string
}

export interface BotTextSpan {
    type: 'botText'
    text: string
}

export interface NewCodeSpan {
    type: 'newCode'
    text: string
    language: string
    shouldEdit?: boolean
}

export type UserChatSpan = CodeSpan | TextSpan
export type BotChatSpan = TextSpan | NewCodeSpan | DiffSpan | BotTextSpan

export interface ChatMessage {
    fromMe: boolean
    spanIds: number[]
}

export interface Conversation {
    messageIds: number[]
    isBotWriting: boolean
}
export type BotMessageType =
    | 'edit'
    | 'continue'
    | 'markdown'
    | 'multifile'
    | 'location'
    | 'interrupt'
    | 'chat_edit'
    | 'lsp_edit'

export interface BotMessage {
    sender: 'bot'
    sentAt: number
    type: BotMessageType
    conversationId: string
    message: string
    currentFile: string | null
    lastToken: string
    finished: boolean
    interrupted: boolean
    rejected?: boolean
    hitTokenLimit?: boolean
    maxOrigLine?: number
    useDiagnostics?: boolean | number
    toolCalls?: Array<{
        id: string
        name: string
        arguments: Record<string, any>
        result?: string
        success?: boolean
        isExecuting?: boolean
    }>
}

export interface CodeBlock {
    fileId: number
    text: string
    startLine: number
    endLine: number
}

export type CodeSymbolType = 'import' | 'function' | 'class' | 'variable'
export interface CodeSymbol {
    fileName: string
    name: string
    type: CodeSymbolType
}

export interface UserMessage {
    sender: 'user'
    conversationId: string
    message: string
    msgType: ResponseType
    sentAt: number
    currentFile: string | null
    precedingCode: string | null
    procedingCode: string | null
    currentSelection: string | null
    // Other pieces of info encoded
    otherCodeBlocks: CodeBlock[]
    codeSymbols: CodeSymbol[]
    selection: { from: number; to: number } | null
    maxOrigLine?: number
}

export type Message = UserMessage | BotMessage

/// idk - don't know what the response type should be
/// freeform - the response type is chat markdown
/// generate - the response type is some generation in the current file
/// edit - the response type is some edit in the current file
/// chat_diff - the respone type is some edit in the current_file started from the chat
export type ResponseType =
    | 'idk'
    | 'freeform'
    | 'generate'
    | 'edit'
    | 'chat_edit'
    | 'lsp_edit'

export interface ChatState {
    generating: boolean
    pos?: number
    msgType?: ResponseType
    isCommandBarOpen: boolean
    commandBarText: string
    conversations: string[]
    currentConversationId: string
    draftMessages: { [key: string]: UserMessage }
    userMessages: UserMessage[]
    botMessages: BotMessage[]
    fireCommandK: boolean
    chatIsOpen: boolean
    chatHistoryIsOpen: boolean
    commandBarHistoryIndex: number
}

export interface Settings {
    keyBindings: 'none' | 'vim' | 'emacs'
    useFour: string
    contextType: string
    textWrapping: string
    // AI Provider Settings
    aiProvider?: 'openai' | 'openrouter' | 'gemini' | 'claude' | 'ollama'
    // OpenAI
    openAIKey?: string
    useOpenAIKey?: boolean
    openAIModel?: string
    // OpenRouter
    openRouterKey?: string
    useOpenRouterKey?: boolean
    openRouterModel?: string
    // Gemini
    geminiKey?: string
    useGeminiKey?: boolean
    geminiModel?: string
    // Claude
    claudeKey?: string
    useClaudeKey?: boolean
    claudeModel?: string
    // Ollama
    ollamaModel?: string
    ollamaBaseUrl?: string
    // General
    tabSize?: string
    theme?: string
    fontFamily?: string
    fontSize?: string
    // Inline AI completion (Copilot-style ghost text)
    inlineCompletionEnabled?: boolean
    inlineCompletionDelay?: number
    inlineCompletionMaxTokens?: number
}

export interface SettingsState {
    settings: Settings
    isOpen: boolean
    activeTab: 'General' | 'AI' | 'Languages' | 'Account'
}

export interface LineChange {
    startLine: number
    endLine: number
    newText: string
}

export interface FixLSPFile {
    changes: LineChange[]
    doDiagnosticsExist: boolean
}

export interface FixLSPState {
    fixes: { [key: number]: FixLSPFile }
}

export interface CommentFunction {
    comment: string
    description: string
    originalFunctionBody: string
    marked?: boolean
}

export interface CommentState {
    fileThenNames: { [key: string]: { [key: string]: CommentFunction } }
}

export interface ToolState {
    openLeftTab: 'search' | 'filetree' | 'git' | 'extensions'
    leftTabActive: boolean
    fileSearchTriggered: boolean
    commandPaletteTriggered: boolean
    aiCommandPaletteTriggered: boolean
    leftSideExpanded: boolean
    welcomeDismissed: boolean
}

export interface LoggingState {
    feedbackMessage: string
    isOpen: boolean
}

interface LanguageServer {
    languageServer: string
    installed: boolean
    running: boolean
}

export interface LanguageServerState {
    languageServers: { [key: string]: LanguageServer }
}

// Use RootState from store as the source of truth for the full Redux state
export type FullState = RootState

// INITIAL STATE

export const initialLoggingState: LoggingState = {
    feedbackMessage: '',
    isOpen: false,
}

const startUuid = uuidv4()
export const initialChatState: ChatState = {
    generating: false,
    isCommandBarOpen: false,
    currentConversationId: startUuid,
    commandBarText: '',
    conversations: [],
    userMessages: [],
    botMessages: [],
    draftMessages: {
        [startUuid]: {
            sender: 'user',
            sentAt: Date.now(),
            message: '',
            conversationId: startUuid,
            currentFile: null,
            currentSelection: null,
            precedingCode: null,
            procedingCode: null,
            otherCodeBlocks: [],
            codeSymbols: [],
            selection: null,
            msgType: 'freeform',
        },
    },
    fireCommandK: false,
    chatIsOpen: false,
    chatHistoryIsOpen: false,
    commandBarHistoryIndex: -1,
}

export const initialSettingsState = {
    isOpen: false,
    activeTab: 'General' as 'General' | 'AI' | 'Languages' | 'Account',
    settings: {
        keyBindings: 'none',
        useFour: 'disabled',
        textWrapping: 'disabled',
        tabSize: '4',
        theme: 'codex-dark',
        contextType: 'none',
        aiProvider: 'ollama',
        ollamaModel: 'qwen2.5-coder:1.5b',
        ollamaBaseUrl: 'http://localhost:11434',
        inlineCompletionEnabled: true,
        inlineCompletionDelay: 300,
        inlineCompletionMaxTokens: 64,
    },
}

export const initialState = {
    repoId: null,
    repoProgress: {
        progress: 0,
        state: 'notStarted',
    },
    files: {},
    folders: {
        0: {
            parentFolderId: null,
            name: '',
            renameName: '',
            fileIds: [],
            folderIds: [],
            loaded: true,
            isOpen: false,
        },
    },
    fileCache: {},
    tabCache: {},
    tabs: {},
    rightClickId: null as number | null,
    isRightClickAFile: false,
    rootPath: null as string | null,
    keyboardBindings: {},
    draggingTabId: null as number | null,

    zoomFactor: 0.75,

    paneState: {
        byIds: {},
        bySplits: [] as any,
    },

    showError: false,
    showRateLimit: false,
    errorValue: null,
    errorType: 'server',
    errorInfo: '404, request bad',

    version: '1.0.0',

    showRemotePopup: false,
    showClonePopup: false,
    remoteCommand: '',
    remotePath: '',
    remoteBad: false,

    isNotFirstTime: true,
    terminalOpen: false,
    recentProjects: [],
    fileDiagnostics: {},
} as State

export function nextValue(keys: string[]) {
    if (keys.length == 0) {
        return 1
    } else {
        return Math.max(...keys.map((x) => parseInt(x))) + 1
    }
}
export function nextId(byIds: object) {
    return nextValue(Object.keys(byIds))
}
export function nextTabID(state: State) {
    return nextId(state.tabs)
}
export function nextPaneID(state: State) {
    return nextId(state.paneState.byIds)
}
export function nextFolderID(state: State) {
    return nextId(state.folders)
}
export function nextFileID(state: State) {
    return nextId(state.files)
}
