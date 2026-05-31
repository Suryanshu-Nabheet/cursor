/**
 * Client-side AI streaming for Cmd+K command bar (edit / generate).
 * Replaces the legacy localhost:8000 backend for inline commands.
 */
import { createAsyncThunk } from '@reduxjs/toolkit'
import { getActiveProviderAPIKey } from './apiKeyUtils'
import { streamAIResponse, AIProvider, AIProviderConfig } from './providers'
import { FullState, ResponseType } from '../window/state'
import { getActiveTabId } from '../window/paneUtils'
import {
    appendResponse,
    interruptGeneration,
    newResponse,
    PromptCancelledError,
    setGenerating,
} from '../chat/chatSlice'
import { finishResponse as finishResponseThunk } from '../chat/chatThunks'
import { addTransaction, openError } from '../globalSlice'
import { ExpectedBackendError } from '../../utils'

async function buildProviderConfig(
    settings: FullState['settingsState']['settings']
): Promise<AIProviderConfig | null> {
    const info = await getActiveProviderAPIKey(settings)
    if (!info?.apiKey) return null
    return {
        provider: info.provider as AIProvider,
        apiKey: info.apiKey,
        enabled: true,
        defaultModel: info.model.replace(':free', ''),
        baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    }
}

function buildSystemPrompt(msgType: ResponseType | undefined): string {
    if (msgType === 'edit') {
        return `You are an expert code editor embedded in an IDE.
The user selected code and wants it changed per their instruction.

Rules:
- Output ONLY the replacement code — no markdown fences, no explanation
- Match the file's style, indentation, and conventions exactly
- Return code that fully replaces the selected region`
    }
    return `You are an expert code generator embedded in an IDE.
The user wants new code inserted at the cursor.

Rules:
- Output ONLY the code to insert — no markdown fences, no explanation
- Match the surrounding file's style, indentation, and conventions exactly
- Continue naturally from the cursor position`
}

function buildUserPrompt(
    msgType: ResponseType | undefined,
    userMessage: string,
    context: {
        currentFile: string | null
        precedingCode: string | null
        procedingCode: string | null
        currentSelection: string | null
    }
): string {
    const parts = [
        `File: ${context.currentFile || 'untitled'}`,
        '',
        `Instruction: ${userMessage}`,
        '',
    ]

    if (msgType === 'edit' && context.currentSelection) {
        parts.push(
            'Selected code to replace:',
            '<<<SELECTION>>>',
            context.currentSelection,
            '<<<END_SELECTION>>>',
            '',
            'Context before selection:',
            context.precedingCode?.slice(-2000) || '',
            '',
            'Context after selection:',
            context.procedingCode?.slice(0, 2000) || ''
        )
    } else {
        parts.push(
            'Code before cursor:',
            '<<<PREFIX>>>',
            context.precedingCode?.slice(-3000) || '',
            '<<<END_PREFIX>>>',
            '',
            'Code after cursor:',
            '<<<SUFFIX>>>',
            context.procedingCode?.slice(0, 1500) || '',
            '<<<END_SUFFIX>>>'
        )
    }

    return parts.join('\n')
}

function stripCodeFences(text: string): string {
    return text
        .replace(/^\uFEFF/, '')
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
}

function providerError(message: string): ExpectedBackendError {
    const err = new ExpectedBackendError(message)
    err.title = 'AI Command Bar'
    return err
}

export const streamCommandBarClient = createAsyncThunk(
    'chat/streamCommandBarClient',
    async (_payload: null, { getState, dispatch }) => {
        try {
            const state = getState() as FullState
            const chatState = state.chatState
            const msgType = chatState.msgType
            const lastUserMessage = chatState.userMessages.at(-1)

            if (!lastUserMessage?.message.trim()) {
                throw providerError('Enter an instruction before submitting.')
            }

            const currentTab = getActiveTabId(state.global)
            if (currentTab == null) {
                throw providerError('Open a file in the editor first.')
            }

            const provider = await buildProviderConfig(
                state.settingsState.settings
            )
            if (!provider) {
                throw providerError(
                    'No AI provider configured. Open Settings and set up OpenAI, OpenRouter, Ollama, or another provider.'
                )
            }

            dispatch(setGenerating(true))

            const botType = msgType === 'edit' ? 'edit' : 'continue'
            dispatch(newResponse({ type: botType }))

            const systemPrompt = buildSystemPrompt(msgType)
            const userPrompt = buildUserPrompt(
                msgType,
                lastUserMessage.message,
                {
                    currentFile: lastUserMessage.currentFile,
                    precedingCode: lastUserMessage.precedingCode,
                    procedingCode: lastUserMessage.procedingCode,
                    currentSelection: lastUserMessage.currentSelection,
                }
            )

            const pos = chatState.pos ?? lastUserMessage.selection?.from ?? 0
            const selection = lastUserMessage.selection
            let accumulated = ''
            let isFirstChunk = true
            let insertedLength = 0

            for await (const chunk of streamAIResponse(
                provider,
                [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                { temperature: 0.2, maxTokens: 4096 }
            )) {
                if (!(getState() as FullState).chatState.generating) {
                    throw new PromptCancelledError()
                }

                accumulated += chunk
                const cleaned = stripCodeFences(accumulated)
                const newText = cleaned.slice(insertedLength)
                if (!newText) continue

                if (msgType === 'edit' && selection) {
                    if (isFirstChunk) {
                        dispatch(
                            addTransaction({
                                tabId: currentTab,
                                transactionFunction: {
                                    type: 'insertStartLine',
                                    from: selection.from,
                                    to: selection.to,
                                    text: newText,
                                    scroll: 'intoView',
                                },
                            })
                        )
                        isFirstChunk = false
                    } else {
                        dispatch(
                            addTransaction({
                                tabId: currentTab,
                                transactionFunction: {
                                    type: 'insert',
                                    text: newText,
                                    scroll: 'intoView',
                                },
                            })
                        )
                    }
                } else if (isFirstChunk) {
                    dispatch(
                        addTransaction({
                            tabId: currentTab,
                            transactionFunction: {
                                type: 'insertStartLine',
                                from: pos,
                                to: pos,
                                text: newText,
                                scroll: 'intoView',
                            },
                        })
                    )
                    isFirstChunk = false
                } else {
                    dispatch(
                        addTransaction({
                            tabId: currentTab,
                            transactionFunction: {
                                type: 'insert',
                                text: newText,
                                scroll: 'intoView',
                            },
                        })
                    )
                }

                insertedLength = cleaned.length
                dispatch(appendResponse({ text: cleaned, token: chunk }))
            }

            if (!accumulated.trim()) {
                throw providerError(
                    'The AI returned an empty response. Check your provider settings and try again.'
                )
            }

            dispatch(
                appendResponse({
                    text: stripCodeFences(accumulated),
                    token: '',
                })
            )
            await dispatch(finishResponseThunk())
        } catch (e: unknown) {
            dispatch(setGenerating(false))
            if (e instanceof ExpectedBackendError) {
                dispatch(openError({ error: e }))
            } else if (e instanceof PromptCancelledError) {
                dispatch(interruptGeneration(null))
            } else {
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[commandBar]', e)
                }
                dispatch(openError({}))
                dispatch(interruptGeneration(null))
            }
        }
    }
)
