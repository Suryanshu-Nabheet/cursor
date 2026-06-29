import { buildCommitMessagePrompt } from '../src/features/ai/commitMessageDraft'

describe('commit message drafting', () => {
    it('builds a conventional commit prompt from diff content', () => {
        const messages = buildCommitMessagePrompt(
            'diff --git a/file.ts b/file.ts\n+const value = true'
        )

        expect(messages[0].content).toContain('Conventional Commit')
        expect(messages[1].content).toContain('diff --git')
        expect(messages[1].content).toContain('const value = true')
    })

    it('bounds large diffs in the prompt', () => {
        const largeDiff = 'x'.repeat(15000)
        const messages = buildCommitMessagePrompt(largeDiff)

        expect(messages[1].content.length).toBeLessThan(13000)
    })
})
