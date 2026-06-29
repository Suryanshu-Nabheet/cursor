import { Settings } from '../window/state'
import { getActiveProviderAPIKey } from './apiKeyUtils'
import { AIProvider, AIProviderConfig, streamAIResponse } from './providers'

export function buildCommitMessagePrompt(diff: string) {
    const trimmedDiff = diff.slice(0, 12000)
    return [
        {
            role: 'system' as const,
            content:
                'You write concise Conventional Commit messages. Return only the commit message. Include a short subject and 2-5 bullet points when useful. Do not wrap in markdown.',
        },
        {
            role: 'user' as const,
            content: `Create a production-grade commit message for this diff:\n\n${trimmedDiff}`,
        },
    ]
}

export async function draftCommitMessage(diff: string, settings: Settings) {
    if (!diff.trim()) {
        return ''
    }

    const info = await getActiveProviderAPIKey(settings)
    if (!info?.apiKey) {
        throw new Error('No AI provider configured for commit message drafting.')
    }

    const provider: AIProviderConfig = {
        provider: info.provider as AIProvider,
        apiKey: info.apiKey,
        enabled: true,
        defaultModel: info.model,
        baseUrl: settings.ollamaBaseUrl || 'http://localhost:11434',
    }

    let message = ''
    for await (const chunk of streamAIResponse(
        provider,
        buildCommitMessagePrompt(diff),
        {
            temperature: 0.2,
            maxTokens: 320,
        }
    )) {
        message += chunk
    }

    return message
        .replace(/^```[\w]*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()
}
