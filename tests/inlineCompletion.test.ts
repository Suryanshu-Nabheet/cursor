import { Settings } from '../src/features/window/state'
import type { InlineCompletionContext } from '../src/features/ai/inlineCompletion'

jest.mock('../src/app/store', () => ({
    store: {
        getState: () => ({
            settingsState: { settings: {} },
            global: { tabs: {}, files: {}, fileCache: {} },
            codeMirrorState: { editorMap: {} },
        }),
    },
}))

jest.mock('../src/features/ai/agenticCompletion', () => ({
    AGENTIC_SYSTEM_PROMPT: 'complete code',
    buildAgenticContext: (_view: unknown, context: unknown) => context,
    buildAgenticPrompt: () => 'complete',
    getViewFilePath: () => '/tmp/example.ts',
}))

const {
    getInlineCompletionStatus,
    sanitizeCompletion,
    normalizeAutomaticCompletion,
    normalizeInlineCompletionOptions,
} = require('../src/features/ai/inlineCompletion')
const { getActiveProviderAPIKey } = require('../src/features/ai/apiKeyUtils')

const baseContext: InlineCompletionContext = {
    prefix: 'function run() {\n    ret',
    suffix: '\n}',
    filepath: '/tmp/example.ts',
    language: 'typescript',
    cursorOffset: 24,
    linePrefix: '    ret',
    indent: '    ',
}

describe('AI inline completion helpers', () => {
    it('reports Ollama as available by default', () => {
        const status = getInlineCompletionStatus({} as Settings)

        expect(status.enabled).toBe(true)
        expect(status.provider).toBe('ollama')
        expect(status.configured).toBe(true)
    })

    it('requires an API key for cloud providers', () => {
        const status = getInlineCompletionStatus({
            aiProvider: 'openai',
            useOpenAIKey: false,
        } as Settings)

        expect(status.enabled).toBe(false)
        expect(status.reason).toContain('API key')
    })

    it('explains how to recover when inline completion is disabled', () => {
        const status = getInlineCompletionStatus({
            inlineCompletionEnabled: false,
        } as Settings)

        expect(status.enabled).toBe(false)
        expect(status.reason).toContain('Enable inline completion')
    })

    it('resolves OpenAI settings using the saved completion keys', async () => {
        const result = await getActiveProviderAPIKey({
            aiProvider: 'openai',
            useOpenAIKey: true,
            openAIKey: 'sk-test',
            openAIModel: 'gpt-4o-mini',
        } as Settings)

        expect(result).toEqual({
            provider: 'openai',
            apiKey: 'sk-test',
            model: 'gpt-4o-mini',
        })
    })

    it('sanitizes markdown fences and duplicated typed prefixes', () => {
        const sanitized = sanitizeCompletion(
            '```ts\n    return value\n```',
            baseContext
        )

        expect(sanitized).toBe('urn value')
    })

    it('strips the current partial token from model completions', () => {
        expect(sanitizeCompletion('return value', baseContext)).toBe('urn value')
    })

    it('aligns indentation when completing an empty indented line without double-indenting', () => {
        const context = {
            ...baseContext,
            linePrefix: '    ',
            indent: '    ',
        }

        expect(sanitizeCompletion('    const value = 1', context)).toBe(
            'const value = 1'
        )
    })

    it('does not insert spurious indentation when completing in the middle of an indented line', () => {
        const context = {
            ...baseContext,
            linePrefix: '    const result = ',
            indent: '    ',
        }

        expect(sanitizeCompletion('computeSum(a, b);', context)).toBe(
            'computeSum(a, b);'
        )
    })

    it('rebases multi-line completions to match cursor indentation and indentUnit', () => {
        const context: InlineCompletionContext = {
            prefix: 'function run() {\n    ',
            suffix: '\n}',
            filepath: '/tmp/example.ts',
            language: 'typescript',
            cursorOffset: 21,
            linePrefix: '    ',
            indent: '    ',
            indentUnit: '    ',
        }

        const raw = 'const a = 1;\nconst b = 2;\nreturn a + b;'
        const formatted = sanitizeCompletion(raw, context)
        expect(formatted).toBe('const a = 1;\n    const b = 2;\n    return a + b;')
    })

    it('rebases nested blocks cleanly inside multi-line completions', () => {
        const context: InlineCompletionContext = {
            prefix: 'function run() {\n    ',
            suffix: '\n}',
            filepath: '/tmp/example.ts',
            language: 'typescript',
            cursorOffset: 21,
            linePrefix: '    ',
            indent: '    ',
            indentUnit: '    ',
        }

        const raw = 'if (active) {\n  doWork();\n}'
        const formatted = sanitizeCompletion(raw, context)
        expect(formatted).toBe('if (active) {\n        doWork();\n    }')
    })

    it('deduplicates closing delimiters that match suffix', () => {
        const context: InlineCompletionContext = {
            prefix: 'console.log(',
            suffix: ');',
            filepath: '/tmp/example.ts',
            language: 'typescript',
            cursorOffset: 12,
            linePrefix: 'console.log(',
            indent: '',
        }

        expect(sanitizeCompletion('"hello");', context)).toBe('"hello"')
    })

    it('deduplicates trailing closing braces when suffix starts with closing brace', () => {
        const context: InlineCompletionContext = {
            prefix: 'function test() {\n    ',
            suffix: '\n}',
            filepath: '/tmp/example.ts',
            language: 'typescript',
            cursorOffset: 22,
            linePrefix: '    ',
            indent: '    ',
        }

        expect(sanitizeCompletion('return 42;\n}', context)).toBe('return 42;')
    })

    it('limits very large completions to a bounded size', () => {
        const raw = Array.from({ length: 300 }, (_, index) => `line${index}`).join(
            '\n'
        )

        expect(sanitizeCompletion(raw, baseContext).length).toBeLessThan(2000)
    })

    it('keeps automatic ghost text short enough to render reliably for single statements', () => {
        expect(
            normalizeAutomaticCompletion('firstSuggestion()\nsecondSuggestion()\n')
        ).toBe('firstSuggestion()')
    })

    it('preserves structured multi-line blocks in automatic completions', () => {
        const block = 'if (isValid) {\n    saveData()\n}'
        expect(normalizeAutomaticCompletion(`${block}\nextraCode()`)).toBe(block)
    })

    it('clamps completion runtime options for typing-time latency', () => {
        expect(
            normalizeInlineCompletionOptions({
                inlineCompletionDelay: 10,
                inlineCompletionMaxTokens: 1000,
                inlineCompletionTimeoutMs: 60000,
            } as unknown as Settings)
        ).toEqual({
            delayMs: 120,
            maxTokens: 160,
            timeoutMs: 15000,
        })
    })
})
