import {
    ActionCreatorWithoutPayload,
    AnyAction,
    ThunkDispatch,
    createAsyncThunk,
} from '@reduxjs/toolkit'
import {
    API_ROOT,
    BadModelError,
    BadOpenAIAPIKeyError,
    ExpectedBackendError,
    streamSource,
} from '../../utils'
import { getViewId } from '../codemirror/codemirrorSelectors'
import {
    FullCodeMirrorState,
    getCodeMirrorView,
} from '../codemirror/codemirrorSlice'
import { throttle } from 'lodash'
import { acceptDiff, setDiff } from '../extensions/diff'
import { getActiveFileId, getActiveTabId } from '../window/paneUtils'
import { BotMessageType, FullState } from '../window/state'
import {
    activateDiffFromEditor,
    appendResponse,
    changeMsgType,
    doSetChatState,
    dummySubmitCommandBar,
    endFinishResponse,
    getLastBotMessage,
    interruptGeneration,
    manufacturedConversation,
    newResponse,
    openCommandBar,
    PromptCancelledError,
    resumeGeneration,
    setChatOpen,
    setGenerating,
    setHitTokenLimit,
    toggleChatHistory,
    tokenLimitInterrupt,
    updateLastUserMessageMsgType,
} from './chatSlice'
import { Text } from '@codemirror/state'
import { addTransaction, openError, openFile } from '../globalSlice'
import { streamCommandBarClient } from '../ai/commandBarStream'
import { findFileIdFromPath, getPathForFileId } from '../window/fileUtils'
import {
    getPrecedingLines,
    getProcedingLines,
    getSelectedPos,
    getSelectedText,
} from '../../components/editor'
import { getLastBotMessageById } from './chatSelectors'
import { editBoundaryEffect, insertCursorEffect } from '../extensions/hackDiff'
import posthog from 'posthog-js'
import { CustomTransaction } from '../../components/codemirrorHooks/dispatch'
import { getFixLSPBlobForServerWithSideEffects } from '../linter/fixLSPExtension'
import {
    activeLintField,
    getDiagnostics,
    lintState,
    setActiveLint,
} from '../linter/lint'
import { getActiveProviderAPIKey } from '../ai/apiKeyUtils'

function getMatchingLines(doc: Text, ...lines: string[]): number[][] {
    const matchingLineNumbers = Array(lines.length).fill([])

    for (let i = 0; i < doc.lines; i++) {
        const lineText = doc.line(i + 1).text

        for (let j = 0; j < lines.length; j++) {
            if (lineText.trimEnd() === lines[j]) {
                matchingLineNumbers[j].push(i + 1)
            }
        }
    }

    return matchingLineNumbers
}

const thunkFactory = (
    actionCreator: ActionCreatorWithoutPayload,
    name: string
) =>
    createAsyncThunk(
        `chat/${name}`,
        async (payload: null, { getState, dispatch }) => {
            dispatch(actionCreator())
            if (
                (getState() as FullState).chatState.userMessages.at(-1)
                    ?.msgType == 'chat_edit'
            ) {
                dispatch(diffResponse('chat'))
            } else {
                dispatch(streamResponse({}))
            }
        }
    )

export async function getPayload({
    getState,
    dispatch,
    conversationId,
    forContinue = false,
    forDiagnostics = false,
    diagnosticLineNumber,
}: {
    getState: () => FullState
    dispatch: ThunkDispatch<unknown, unknown, AnyAction>
    conversationId: string
    forContinue?: boolean
    forDiagnostics?: boolean
    diagnosticLineNumber?: number
}): Promise<any> {
    dispatch(setGenerating(true))

    const state = getState() as FullState
    const chatState = state.chatState
    const fileCache = state.global.fileCache
    const currentTab = getActiveTabId(state.global)!

    const userMessages = chatState.userMessages.filter(
        (um) => um.conversationId == conversationId
    )

    const lastUserMessage = userMessages[userMessages.length - 1]

    if (!(forContinue || forDiagnostics)) {
        posthog.capture('Submitted Prompt', {
            type: chatState.msgType,
            prompt: lastUserMessage.message,
        })
        posthog.capture('Submitted ' + chatState.msgType, {
            prompt: lastUserMessage.message,
        })

        if (currentTab != null) {
            dispatch(
                addTransaction({
                    tabId: currentTab,
                    transactionFunction: {
                        type: 'bar',
                        blob: {
                            message: lastUserMessage.message,
                            activateBundle: {
                                currentFile: lastUserMessage.currentFile,
                                precedingCode: lastUserMessage.precedingCode,
                                procedingCode: lastUserMessage.procedingCode,
                                currentSelection:
                                    lastUserMessage.currentSelection,
                                selection: lastUserMessage.selection,
                                pos: chatState.pos,
                            },
                        },
                    },
                })
            )
        }
    } else {
        posthog.capture('Submitted non-prompt transaction', {
            type: chatState.msgType,
        })
    }

    const fileId = lastUserMessage.currentFile
        ? findFileIdFromPath(state.global, lastUserMessage.currentFile)
        : null
    const currentFileContents = fileId ? fileCache[fileId!]?.contents : null

    const customCodeBlocks = [
        ...lastUserMessage.otherCodeBlocks.map((block) => {
            return {
                text: block.text,
                path: getPathForFileId(state.global, block.fileId)!,
            }
        }),
    ]

    const capturedSymbols = lastUserMessage.message
        .match(/`(\w+\.*)+`/g)
        ?.map((symbol) => symbol.replace(/`/g, ''))
    const codeSymbols = new Set<string>()
    if (capturedSymbols) {
        capturedSymbols.forEach((symbol) => {
            codeSymbols.add(symbol)
        })
    }

    const codeBlockIdentifiers = [
        ...lastUserMessage.codeSymbols
            .filter((symbol) => codeSymbols.has(symbol.name))
            .map((symbol) => ({
                fileName: symbol.fileName,
                blockName: symbol.name,
                type: symbol.type,
            })),
    ]
    const blockSize = 20

    const precedingCodeBlocks = []
    if (lastUserMessage.precedingCode) {
        const precedingCodeLines = lastUserMessage.precedingCode.split('\n')
        for (let i = 0; i < precedingCodeLines.length; i += blockSize) {
            const block = precedingCodeLines.slice(i, i + blockSize)
            precedingCodeBlocks.push(block.join('\n'))
        }
    }

    const procedingCodeBlocks = []
    if (lastUserMessage.procedingCode) {
        const procedingCodeLines = lastUserMessage.procedingCode.split('\n')
        for (let i = 0; i < procedingCodeLines.length; i += blockSize) {
            const block = procedingCodeLines.slice(i, i + blockSize)
            procedingCodeBlocks.push(block.join('\n'))
        }
    }

    const rootPath = state.global.rootPath

    const viewId = getViewId(currentTab)(
        getState() as unknown as FullCodeMirrorState
    )
    let editorView
    if (viewId) {
        editorView = getCodeMirrorView(viewId)
    } else {
        editorView = null
    }

    dispatch(updateLastUserMessageMsgType(null))

    // Get API key with .env fallback using centralized utility
    const settings = state.settingsState.settings
    const providerConfig = await getActiveProviderAPIKey(settings)

    // If we have a valid config, use it. Otherwise fall back to settings defaults (which will likely fail if no key)
    const oaiKey = providerConfig?.apiKey || null
    const openAIModel = providerConfig?.model
    const aiProvider =
        providerConfig?.provider || settings.aiProvider || 'openai'
    const userRequest = {
        message: lastUserMessage.message,
        currentRootPath: rootPath,
        currentFileName: lastUserMessage.currentFile,
        currentFileContents,
        precedingCode: precedingCodeBlocks,
        currentSelection: lastUserMessage.currentSelection,
        suffixCode: procedingCodeBlocks,
        customCodeBlocks,
        codeBlockIdentifiers,
        msgType: chatState.msgType,
        maxOrigLine: forContinue
            ? getLastBotMessage(chatState, conversationId)!.maxOrigLine
            : forDiagnostics
            ? lastUserMessage.maxOrigLine
            : null,
        diagnostics:
            forDiagnostics && editorView
                ? getFixLSPBlobForServerWithSideEffects(
                      editorView,
                      diagnosticLineNumber
                  )?.diagnostics
                : null,
    }

    const data = {
        userRequest,
        userMessages: [
            ...chatState.userMessages
                .filter(
                    (um) => um.conversationId == lastUserMessage.conversationId
                )
                .slice(0, -1),
        ],

        botMessages: [
            ...chatState.botMessages.filter(
                (bm) => bm.conversationId == lastUserMessage.conversationId
            ),
        ],
        contextType: state.settingsState.settings.contextType,

        rootPath: state.global.rootPath,
        apiKey: oaiKey,
        customModel: openAIModel,
        provider: aiProvider, // Send provider info to backend
    }

    return data
}

export const continueGeneration = createAsyncThunk(
    'chat/continueGeneration',
    async (
        {
            conversationId,
            setFinished = false,
        }: { conversationId: string; setFinished: boolean },
        { getState, dispatch }
    ) => {
        try {
            const getFullState = () => getState() as FullState

            const data = await getPayload({
                getState: getFullState,
                dispatch,
                conversationId,
                forContinue: true,
            })
            const state = getState() as FullState

            const chatState = state.chatState

            const numUserMessages = chatState.userMessages.length
            const checkSend = () => {
                if (
                    numUserMessages !=
                    (<FullState>getState()).chatState.userMessages.length
                ) {
                    dispatch(interruptGeneration(null))
                    throw new PromptCancelledError()
                }
            }
            const server = `${API_ROOT}/continue/`

            // Create an AbortController for this request
            const controller = new AbortController()
            const signal = controller.signal

            const response = await fetch(server, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
                signal,
            }).then(async (resp) => {
                if (resp.status != 200) {
                    const text = await resp.json()
                    switch (text.detail) {
                        case 'BAD_API_KEY':
                            throw new BadOpenAIAPIKeyError()
                        case 'BAD_MODEL':
                            throw new BadModelError()
                        default:
                            break
                    }
                }
                return resp
            })

            dispatch(resumeGeneration(conversationId))

            const isGenerating = () =>
                (<FullState>getState()).chatState.generating
            const isInterrupted = () =>
                (<FullState>getState()).chatState.botMessages.at(-1)
                    ?.interrupted

            const generator = streamSource(response)

            const getNextToken = async () => {
                const rawResult = await generator.next()
                if (rawResult.done) return null
                return rawResult.value
            }
            let buffer = ''
            let bigBuffer = chatState.botMessages
                .filter((bm) => bm.conversationId == conversationId)
                .at(-1)!.message

            let toBreak = false
            let finalMessage = ''

            const throttledAppendResponse = throttle(
                (text: string, token: string) =>
                    dispatch(appendResponse({ text, token })),
                100
            )

            while (!toBreak) {
                const token = await getNextToken()
                if (token == null) break
                if (!isGenerating() || isInterrupted()) break
                if ((buffer + token).match(/.*<\|\w*?\|>.*/)) {
                    if (
                        (buffer + token).includes('<|END_message|>') ||
                        (buffer + token).includes('<|END_interrupt|>')
                    ) {
                        finalMessage = buffer + token

                        buffer += token
                        buffer = buffer.slice(0, buffer.indexOf('<|'))
                        toBreak = true
                    } else {
                        buffer += token
                    }
                } else if ((buffer + token).length > 20) {
                    buffer += token
                } else if ((buffer + token).includes('<|')) {
                    buffer += token
                    continue
                } else if (token.includes('<')) {
                    buffer += token
                    continue
                } else {
                    buffer += token
                }
                bigBuffer += buffer
                checkSend()
                throttledAppendResponse(bigBuffer, token)
                buffer = ''
            }
            dispatch(appendResponse({ text: bigBuffer, token: '' }))
            buffer = finalMessage
            while (true) {
                if (buffer.includes(`<|END_interrupt|>`)) {
                    buffer = buffer.replace(`<|END_interrupt|>`, '')
                    dispatch(tokenLimitInterrupt())
                    break
                } else if (buffer.includes(`<|END_message|>`)) {
                    buffer = buffer.replace(`<|END_message|>`, '')
                    break
                }
                const token = await getNextToken()
                buffer += token

                if (!isGenerating() || isInterrupted()) break
            }

            checkSend()

            const lastBotMessage = getLastBotMessage(
                (getState() as FullState).chatState
            )!
            if (
                setFinished ||
                lastBotMessage.type != 'edit' ||
                !lastBotMessage.interrupted ||
                !lastBotMessage.hitTokenLimit
            ) {
                dispatch(finishResponse())
            }
        } catch (e) {
            dispatch(setGenerating(false))
            if (e instanceof ExpectedBackendError) {
                dispatch(openError({ error: e }))
            } else if (!(e instanceof PromptCancelledError)) {
                dispatch(openError({}))
                dispatch(interruptGeneration(null))
            }
            dispatch(setHitTokenLimit({ conversationId, hitTokenLimit: false }))
        }
    }
)

export const finishResponse = createAsyncThunk(
    'chat/finishResponse',
    async (arg, { dispatch, getState }) => {
        const chatState = (getState() as FullState).chatState
        connector.setStore('chatState', chatState)
        dispatch(endFinishResponse())
    }
)

export const initializeChatState = createAsyncThunk(
    'chat/getResponse',
    async (payload: null, { dispatch }) => {
        const chatState = await connector.getStore('chatState')
        dispatch(doSetChatState(chatState))
    }
)

export const streamResponse = createAsyncThunk(
    'chat/getResponse',
    async (
        { useDiagnostics = false }: { useDiagnostics?: boolean | number },
        { getState, dispatch }
    ) => {
        try {
            const getFullState = () => getState() as FullState
            const conversationId =
                getFullState().chatState.currentConversationId
            let lastBotMessage = getLastBotMessage(
                getFullState().chatState,
                conversationId
            )

            useDiagnostics = lastBotMessage?.useDiagnostics ?? useDiagnostics

            const data = await getPayload({
                getState: getFullState,
                dispatch,
                conversationId,
                forDiagnostics: !(useDiagnostics === false),
                diagnosticLineNumber:
                    typeof useDiagnostics === 'number'
                        ? useDiagnostics
                        : undefined,
            })

            const state = getState() as FullState
            const chatState = state.chatState
            const currentTab = getActiveTabId(state.global)!

            const numUserMessages = chatState.userMessages.length
            const checkSend = () => {
                if (
                    numUserMessages !=
                    (<FullState>getState()).chatState.userMessages.length
                ) {
                    dispatch(interruptGeneration(null))
                    throw new PromptCancelledError()
                }
            }

            const server = `${API_ROOT}/conversation`

            const response = await fetch(server, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            }).then(async (resp) => {
                if (resp.status != 200) {
                    const text = await resp.json()
                    switch (text.detail) {
                        case 'BAD_API_KEY':
                            throw new BadOpenAIAPIKeyError()
                        case 'BAD_MODEL':
                            throw new BadModelError()
                        default:
                            break
                    }
                }
                return resp
            })

            const generator = streamSource(response)

            const isGenerating = () =>
                (<FullState>getState()).chatState.generating
            const isInterrupted = () =>
                (<FullState>getState()).chatState.botMessages.at(-1)
                    ?.interrupted

            const getNextToken = async () => {
                const rawResult = await generator.next()
                if (rawResult.done) return null
                return rawResult.value
            }

            const getNextWord = async (
                condition: (buff: string) => boolean,
                startBuffer = '',
                capture: (buff: string) => string = (buff) => buff
            ) => {
                while (!condition(startBuffer)) {
                    const nextToken = await getNextToken()
                    if (nextToken == null) return null
                    startBuffer += nextToken
                }
                return capture(startBuffer)
            }

            const getVariable = async (
                startToken: string,
                variableName: string
            ) => {
                let buffer = await getNextWord(
                    (buff) => buff.includes('|>'),
                    startToken
                )
                while (true) {
                    const token = await getNextToken()
                    if (token == null) break
                    if (token.includes('<|')) {
                        buffer = token
                        break
                    }
                    buffer += token
                    if (buffer!.includes(``)) {
                        break
                    }
                }
                while (true) {
                    const token = await getNextToken()
                    buffer += token!
                    if (buffer!.includes(`<|END_${variableName}|>`)) {
                        break
                    }
                }

                const value = buffer!.match(
                    /<\|BEGIN_\w+\|>([\s\S]*)<\|END_\w+\|>/
                )![1]!
                return { value, buffer }
            }

            const throttledAppendResponse = throttle(
                (text: string, token: string) =>
                    dispatch(appendResponse({ text, token })),
                100
            )

            const sendBody = async (startToken: string, typeStr: string) => {
                await getNextWord((buff) => buff.includes('|>'), startToken)
                let buffer = ''
                let bigBuffer = ''

                const pos = chatState.pos == undefined ? 0 : chatState.pos
                let currentPos = pos

                let isFirstToken = true

                let toBreak = false
                let finalMessage = ''
                while (!toBreak) {
                    const token = await getNextToken()
                    if (token == null) break
                    if (!isGenerating() || isInterrupted()) break
                    if ((buffer + token).match(/.*<\|\w*?\|>.*/)) {
                        if (
                            (buffer + token).includes('<|END_message|>') ||
                            (buffer + token).includes('<|END_interrupt|>')
                        ) {
                            finalMessage = buffer + token

                            buffer += token
                            buffer = buffer.slice(0, buffer.indexOf('<|'))
                            toBreak = true
                        } else {
                            buffer += token
                        }
                    } else if ((buffer + token).length > 20) {
                        buffer += token
                    } else if ((buffer + token).includes('<|')) {
                        buffer += token
                        continue
                    } else if (token.includes('<')) {
                        buffer += token
                        continue
                    } else {
                        buffer += token
                    }

                    if (typeStr == 'continue') {
                        checkSend()
                        if (isFirstToken) {
                            dispatch(
                                addTransaction({
                                    tabId: currentTab,
                                    transactionFunction: {
                                        type: 'insertStartLine',
                                        from: currentPos,
                                        to: currentPos,
                                        text: buffer,
                                        scroll: 'intoView',
                                    },
                                })
                            )
                            isFirstToken = false
                        } else {
                            dispatch(
                                addTransaction({
                                    tabId: currentTab,
                                    transactionFunction: {
                                        type: 'insert',
                                        text: buffer,
                                        scroll: 'intoView',
                                    },
                                })
                            )
                        }
                    }
                    bigBuffer += buffer
                    currentPos += buffer.length
                    checkSend()
                    throttledAppendResponse(bigBuffer, token)
                    buffer = ''
                }
                dispatch(appendResponse({ text: bigBuffer, token: '' }))
                buffer = finalMessage
                while (true) {
                    if (buffer.includes(`<|END_interrupt|>`)) {
                        buffer = buffer.replace(`<|END_interrupt|>`, '')
                        dispatch(tokenLimitInterrupt())
                        break
                    } else if (buffer.includes(`<|END_message|>`)) {
                        buffer = buffer.replace(`<|END_message|>`, '')
                        break
                    }
                    const token = await getNextToken()
                    buffer += token

                    if (!isGenerating() || isInterrupted()) break
                }
            }

            const processResponse = async () => {
                const { value } = await getVariable('', 'type')
                checkSend()
                dispatch(
                    newResponse({
                        type: value.trim() as BotMessageType,
                        useDiagnostics,
                    })
                )
                await sendBody(''!, value.trim())
                if (value.trim() == 'location') {
                    const state = <FullState>getState()
                    const locString =
                        state.chatState.botMessages[
                            state.chatState.botMessages.length - 1
                        ].message
                    const locJson: {
                        filePath: string
                        startLine: number
                        endLine: number
                    } = JSON.parse(locString)
                    checkSend()
                    await dispatch(
                        openFile({
                            filePath: locJson.filePath,
                            selectionRegions: [
                                {
                                    start: {
                                        line: locJson.startLine,
                                        character: 0,
                                    },
                                    end: {
                                        line: locJson.endLine,
                                        character: 0,
                                    },
                                },
                            ],
                        })
                    )
                } else if (value.trim() == 'gotoEdit') {
                    const state = <FullState>getState()
                    const generationString =
                        state.chatState.botMessages[
                            state.chatState.botMessages.length - 1
                        ].message
                    const generationJson: {
                        filePath: string
                        startLine: number
                        endLine: number
                        text: string
                    }[] = JSON.parse(generationString)

                    const relevantFilePath = generationJson[0].filePath
                    if (
                        !generationJson.every(
                            (value) => value.filePath == relevantFilePath
                        )
                    ) {
                        // Multi-file edits not yet supported
                        const errorMsg =
                            'Filepaths do not all match - ' + relevantFilePath
                        throw new Error(errorMsg)
                    }

                    checkSend()
                    const thunkResult = await dispatch(
                        openFile({
                            filePath: relevantFilePath,
                        })
                    )
                    if (!openFile.fulfilled.match(thunkResult)) {
                        return null
                    } else if (thunkResult.payload == null) {
                        return null
                    }

                    const tabId = thunkResult.payload
                    const transactionFunction: CustomTransaction[] =
                        generationJson.map(
                            (change: {
                                filePath: string
                                startLine: number
                                endLine: number
                                text: string
                            }) => ({
                                type: 'insert',
                                from: {
                                    line: change.startLine,
                                    col: 0,
                                },
                                to: {
                                    line: change.endLine,
                                    col: 0,
                                },
                                text: change.text,
                            })
                        )

                    checkSend()
                    dispatch(
                        addTransaction({
                            tabId,
                            transactionFunction,
                        })
                    )
                }
            }

            await processResponse()
            checkSend()

            lastBotMessage = getLastBotMessage(
                (getState() as FullState).chatState
            )!
            if (
                lastBotMessage.type == 'edit' &&
                lastBotMessage.interrupted &&
                lastBotMessage.hitTokenLimit
            ) {
                await dispatch(continueUntilEnd(lastBotMessage.conversationId))
            }
            dispatch(finishResponse())
        } catch (e) {
            dispatch(setGenerating(false))
            if (e instanceof ExpectedBackendError) {
                dispatch(openError({ error: e }))
            } else if (!(e instanceof PromptCancelledError)) {
                dispatch(openError({}))
                dispatch(interruptGeneration(null))
            }
        }
    }
)

export const continueUntilEnd = createAsyncThunk(
    'chat/continueUntilEnd',
    async (conversationId: string, { getState, dispatch }) => {
        try {
            await dispatch(
                continueGeneration({ conversationId, setFinished: false })
            )
            while (
                getLastBotMessageById(conversationId)(getState() as FullState)
                    ?.hitTokenLimit &&
                getLastBotMessageById(conversationId)(getState() as FullState)
                    ?.interrupted
            ) {
                await dispatch(
                    continueGeneration({ conversationId, setFinished: false })
                )
            }
            dispatch(finishResponse())
        } catch (e) {
            dispatch(setGenerating(false))
            if (e instanceof ExpectedBackendError) {
                dispatch(openError({ error: e }))
            } else if (!(e instanceof PromptCancelledError)) {
                dispatch(openError({}))
                dispatch(interruptGeneration(null))
            }
        }
    }
)

export const diffResponse = createAsyncThunk(
    'chat/diffResponse',
    async (type: 'lsp' | 'chat' | null, { getState, dispatch }) => {
        try {
            type = type || 'chat'

            const getFullState = () => getState() as FullState
            const lastBotMessage = getLastBotMessage(getFullState().chatState)
            const useDiagnostics =
                lastBotMessage?.useDiagnostics || type == 'lsp'

            const data = await getPayload({
                getState: getFullState,
                dispatch,
                conversationId: getFullState().chatState.currentConversationId,
                forDiagnostics: !(useDiagnostics === false),
                diagnosticLineNumber:
                    typeof useDiagnostics === 'number'
                        ? useDiagnostics
                        : undefined,
            })

            const state = getState() as FullState
            const currentTab = getActiveTabId(state.global)!

            const numUserMessages = state.chatState.userMessages.length
            const checkSend = () => {
                if (
                    numUserMessages !=
                    (<FullState>getState()).chatState.userMessages.length
                ) {
                    dispatch(interruptGeneration(null))
                    throw new PromptCancelledError()
                }
            }

            const server = `${API_ROOT}/diffs/`
            const viewId = getViewId(currentTab)(state)!
            const view = getCodeMirrorView(viewId)!

            data.userRequest.currentSelection = view.state.doc.toString()
            data.userRequest.maxOrigLine = view.state.doc.lineAt(
                view.state.selection.main.from
            ).number

            const response = await fetch(server, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            }).then(async (resp) => {
                if (resp.status != 200) {
                    const text = await resp.json()
                    switch (text.detail) {
                        case 'BAD_API_KEY':
                            throw new BadOpenAIAPIKeyError()
                        case 'BAD_MODEL':
                            throw new BadModelError()
                        default:
                            break
                    }
                }
                return resp
            })

            const editorViewId = getViewId(currentTab)(
                getState() as FullCodeMirrorState
            )!
            const editorView = getCodeMirrorView(editorViewId)!
            dispatch(setGenerating(true))

            const isGenerating = () =>
                (<FullState>getState()).chatState.generating
            const isInterrupted = () =>
                (<FullState>getState()).chatState.botMessages.at(-1)
                    ?.interrupted

            dispatch(
                newResponse({
                    type: type == 'chat' ? 'chat_edit' : 'lsp_edit',
                    useDiagnostics,
                })
            )

            const origState = editorView.state
            const generator = streamSource(response)
            const usedChunks = []
            for await (const chunk of generator) {
                if (!isGenerating() || isInterrupted()) {
                    break
                }

                const typedChunk = chunk as null | {
                    diff_number: number
                    start_line: number
                    start_line_text: string
                    end_line: number
                    end_line_text: string
                    new_code: string
                    finished: boolean
                    last: boolean
                }

                if (typedChunk != null && !typedChunk.last) {
                    let updatedText = origState.doc
                    const tmpChunks = [typedChunk, ...usedChunks]
                    tmpChunks.sort((a, b) => a.start_line - b.start_line)
                    for (const chunk of [typedChunk, ...usedChunks]) {
                        const [startLines, endLines] = getMatchingLines(
                            updatedText,
                            chunk.start_line_text,
                            chunk.end_line_text
                        )
                        let start, end
                        if (startLines.length == 1) {
                            start = updatedText.line(startLines[0]).from
                        } else {
                            start = origState.doc.line(chunk.start_line).from
                        }

                        if (endLines.length == 1) {
                            end = updatedText.line(endLines[0]).to
                        } else {
                            end = origState.doc.line(chunk.end_line - 1).to
                        }

                        const newText = Text.of(chunk.new_code.split('\n'))
                        updatedText = updatedText.replace(start, end, newText)
                    }

                    if (typedChunk.finished) {
                        usedChunks.unshift(typedChunk)
                    }

                    setDiff({
                        origLine: 1,
                        origEndLine: origState.doc.lines,
                        origText: origState.doc,
                        newText: updatedText,
                        diffId: getFullState().chatState.currentConversationId,
                        setCurrentActiveLine: false,
                    })(view)
                }
            }

            let updatedText = origState.doc

            for (const chunk of usedChunks) {
                const [startLines, endLines] = getMatchingLines(
                    updatedText,
                    chunk.start_line_text,
                    chunk.end_line_text
                )
                let start, end
                if (startLines.length == 1) {
                    start = updatedText.line(startLines[0]).from
                } else {
                    start = origState.doc.line(chunk.start_line).from
                }

                if (endLines.length == 1) {
                    end = updatedText.line(endLines[0]).to
                } else {
                    end = origState.doc.line(chunk.end_line - 1).to
                }

                const newText = Text.of(chunk.new_code.split('\n'))
                updatedText = updatedText.replace(start, end, newText)
            }
            dispatch(
                appendResponse({ text: updatedText.toString(), token: '' })
            )
            dispatch(finishResponse())
            setDiff({
                origLine: 1,
                origEndLine: origState.doc.lines,
                origText: origState.doc,
                newText: updatedText,
                diffId: getFullState().chatState.currentConversationId,
                setCurrentActiveLine: false,
                isFinalDiff: true,
                isFinished: true,
            })(view)

            checkSend()
        } catch (e) {
            dispatch(setGenerating(false))
            if (e instanceof ExpectedBackendError) {
                dispatch(openError({ error: e }))
            } else if (!(e instanceof PromptCancelledError)) {
                dispatch(openError({}))
                dispatch(interruptGeneration(null))
            }
        }
    }
)

export const pressAICommand = createAsyncThunk(
    'chat/pressAICommand',
    (
        keypress:
            | 'Shift-Enter'
            | 'k'
            | 'l'
            | 'Enter'
            | 'Backspace'
            | 'singleLSP'
            | 'history',
        { getState, dispatch }
    ) => {
        const chatState = (getState() as FullState).chatState
        const globState = (getState() as FullState).global

        const tabId = getActiveTabId(globState)
        const fileId = getActiveFileId(globState)

        const viewId = getViewId(tabId)(getState() as FullCodeMirrorState)
        const editorView = viewId && getCodeMirrorView(viewId)

        const lastBotMessage = getLastBotMessage(
            chatState,
            chatState.currentConversationId
        )
        if (chatState.generating && keypress != 'Backspace') {
            return
        }
        switch (keypress) {
            case 'history':
                dispatch(toggleChatHistory())
                return
            case 'Enter':
                if (
                    chatState.msgType === 'edit' ||
                    chatState.msgType == 'chat_edit'
                ) {
                    if (lastBotMessage?.finished && editorView) {
                        acceptDiff(lastBotMessage.conversationId)(editorView)
                    }
                }
                return
            case 'Backspace':
                if (chatState.msgType != 'edit') {
                    if (lastBotMessage && chatState.generating) {
                        dispatch(
                            interruptGeneration(lastBotMessage.conversationId)
                        )
                    }
                }
                return
            case 'l':
                if (chatState.chatIsOpen) {
                    dispatch(setChatOpen(false))
                } else {
                    dispatch(changeMsgType('freeform'))
                    if (!editorView) {
                        dispatch(
                            activateDiffFromEditor({
                                currentFile: null,
                                precedingCode: null,
                                procedingCode: null,
                                currentSelection: null,
                                pos: 0,
                                selection: null,
                            })
                        )
                        dispatch(openCommandBar())
                    } else {
                        const selection = editorView.state.selection.main
                        dispatch(openCommandBar())
                        dispatch(
                            activateDiffFromEditor({
                                currentFile: getPathForFileId(
                                    globState,
                                    fileId!
                                )!,
                                precedingCode: getPrecedingLines(editorView)!,
                                procedingCode: getProcedingLines(editorView)!,
                                currentSelection: getSelectedText(editorView)!,
                                pos: selection.from,
                                selection: {
                                    from: selection.from,
                                    to: selection.to,
                                },
                            })
                        )
                    }
                }
                return
            case 'k':
                if (!editorView) {
                    dispatch(changeMsgType('generate'))
                    dispatch(openCommandBar())
                    dispatch(
                        activateDiffFromEditor({
                            currentFile: fileId
                                ? getPathForFileId(globState, fileId)!
                                : null,
                            precedingCode: null,
                            procedingCode: null,
                            currentSelection: null,
                            pos: 0,
                            selection: null,
                        })
                    )
                    return
                }
                {
                    const selPos = getSelectedPos(editorView)
                    const selection = editorView.state.selection.main
                    editorView.dispatch({
                        effects: editBoundaryEffect.of({
                            start: selPos.startLinePos,
                            end: selPos.endLinePos,
                        }),
                    })
                    const cursorPos = selection.from

                    editorView.dispatch({
                        effects: insertCursorEffect.of({
                            pos: cursorPos,
                        }),
                    })

                    if (selection.from != selection.to) {
                        dispatch(changeMsgType('edit'))
                        dispatch(openCommandBar())
                    } else {
                        dispatch(changeMsgType('generate'))
                        dispatch(openCommandBar())
                    }
                    dispatch(
                        activateDiffFromEditor({
                            currentFile: getPathForFileId(globState, fileId!)!,
                            precedingCode: getPrecedingLines(editorView)!,
                            procedingCode: getProcedingLines(editorView),
                            currentSelection: getSelectedText(editorView)!,
                            pos: selection.from,
                            selection: {
                                from: selection.from,
                                to: selection.to,
                            },
                        })
                    )
                }
                return
            case 'Shift-Enter':
                if (editorView) {
                    dispatch(
                        manufacturedConversation({
                            userMessage: 'Help me fix this errors',
                            messageType: 'freeform',
                            currentFile: getPathForFileId(globState, fileId!)!,
                            currentSelection: editorView.state.doc.toString(),
                        })
                    )
                    dispatch(streamResponse({ useDiagnostics: true }))
                }
                return
            case 'singleLSP':
                if (editorView) {
                    const currentErrorField =
                        editorView.state.field(activeLintField)
                    editorView.dispatch({ effects: setActiveLint.of(null) })

                    let relevantLine
                    if (currentErrorField) {
                        relevantLine = currentErrorField.line
                    } else {
                        const lintDiagnostics = getDiagnostics(
                            editorView.state.field(lintState),
                            editorView.state
                        )
                        const seriousDiagnostics = lintDiagnostics.filter(
                            (d) => d.severity == 'error'
                        )
                        const currentPos = editorView.state.selection.main.from

                        for (const diagnostic of seriousDiagnostics) {
                            if (
                                currentPos <= diagnostic.to &&
                                currentPos >= diagnostic.from
                            ) {
                                relevantLine = editorView.state.doc.lineAt(
                                    diagnostic.from
                                ).number
                                break
                            }
                        }
                    }

                    if (relevantLine != null) {
                        dispatch(
                            manufacturedConversation({
                                userMessage: 'Help me fix this error',
                                messageType: 'freeform',
                                currentFile: getPathForFileId(
                                    globState,
                                    fileId!
                                )!,
                                currentSelection:
                                    editorView.state.doc.toString(),
                                userMaxOrigLine: relevantLine,
                            })
                        )
                        dispatch(
                            streamResponse({ useDiagnostics: relevantLine })
                        )
                    }
                }
                return
            default:
                return
        }
    }
)

export const submitCommandBar = createAsyncThunk(
    'chat/submitCommandBar',
    async (_payload: null, { getState, dispatch }) => {
        dispatch(dummySubmitCommandBar())
        const msgType = (getState() as FullState).chatState.msgType
        if (msgType === 'chat_edit') {
            dispatch(diffResponse('chat'))
        } else if (msgType === 'edit' || msgType === 'generate') {
            dispatch(streamCommandBarClient(null))
        } else {
            dispatch(streamResponse({}))
        }
    }
)
