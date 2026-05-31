// CodeX is a fully independent IDE
import { connector } from './connector'
import { getPlatformInfo as getPlatformInfoFromPlatform } from './platform'

export { getPlatformInfoFromPlatform as getPlatformInfo }
export const HOMEPAGE_ROOT = 'http://localhost:8000'

export class ExpectedBackendError extends Error {
    public title: string | null = null
}

export class OpenAIError extends ExpectedBackendError {}
export class BadOpenAIAPIKeyError extends OpenAIError {
    constructor(
        message = 'The provided OpenAI API key is invalid. Please provide a valid API key.'
    ) {
        super(message)
        this.name = 'BadOpenAIAPIKeyError'
    }
}

export class BadModelError extends ExpectedBackendError {
    constructor(
        message = 'The provided model ID is invalid. Please provide a valid model ID.'
    ) {
        super(message)
        this.name = 'BadModelError'
    }
}

export type ExpectedError = BadOpenAIAPIKeyError | BadModelError

export async function* streamSource(response: Response): AsyncGenerator<any> {
    // Check if the response is an event-stream
    if (
        response.headers.get('content-type') ==
        'text/event-stream; charset=utf-8'
    ) {
        // Create a reader to read the response body as a stream
        // const reader = response.body.getReader();
        // Fix the above error: `response.body is possibly null`
        const reader = response.body!.getReader()
        // Create a decoder to decode the stream as UTF-8 text
        const decoder = new TextDecoder('utf-8')

        // Loop until the stream is done
        while (true) {
            const { value, done } = await reader.read()
            if (done) {
                break
            }

            const rawValue = decoder.decode(value)
            const lines = rawValue.split('\n')

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonString = line.slice(6)
                    if (jsonString == '[DONE]') {
                        return
                    }
                    yield JSON.parse(jsonString)
                }
            }
        }
    } else {
        // Raise exception
        throw new Error('Response is not an event-stream')
    }
}

export const API_ROOT = 'http://localhost:8000'

/** Optional legacy Python backend — off by default; IDE uses client-side AI instead */
export const LEGACY_BACKEND_ENABLED = false

export function isLegacyBackendEnabled(): boolean {
    return LEGACY_BACKEND_ENABLED
}

export function join(a: string, b: string): string {
    if (a[a.length - 1] === connector.PLATFORM_DELIMITER) {
        return a + b
    }
    return a + connector.PLATFORM_DELIMITER + b
}

// make a join method that can handle ./ and ../
export function joinAdvanced(a: string, b: string): string {
    if (b.startsWith('./')) {
        return joinAdvanced(a, b.slice(2))
    }
    if (b.startsWith('../')) {
        if (a[a.length - 1] === connector.PLATFORM_DELIMITER) {
            a = a.slice(0, -1)
        }
        const aOneHigher = a.slice(
            0,
            a.lastIndexOf(connector.PLATFORM_DELIMITER)
        )
        return joinAdvanced(aOneHigher, b.slice(3))
    }
    return join(a, b)
}

export function removeBeginningAndEndingLineBreaks(str: string): string {
    str = str.trimEnd()
    while (str[0] === '\n') {
        str = str.slice(1)
    }
    while (str[str.length - 1] === '\n') {
        str = str.slice(0, -1)
    }
    return str
}
