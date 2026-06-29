import {
    countMatches,
    replaceInContent,
} from '../src/features/search/searchReplace'

describe('search replace helpers', () => {
    it('replaces literal matches case-insensitively by default', () => {
        const result = replaceInContent('Foo foo FOO', {
            query: 'foo',
            replaceText: 'bar',
        })

        expect(result).toEqual({ content: 'bar bar bar', count: 3 })
    })

    it('respects match case', () => {
        const result = replaceInContent('Foo foo', {
            query: 'foo',
            replaceText: 'bar',
            matchCase: true,
        })

        expect(result).toEqual({ content: 'Foo bar', count: 1 })
    })

    it('supports whole-word matching', () => {
        const result = replaceInContent('cat catalog cat', {
            query: 'cat',
            replaceText: 'dog',
            matchWholeWord: true,
        })

        expect(result).toEqual({ content: 'dog catalog dog', count: 2 })
    })

    it('supports regex matching', () => {
        const result = replaceInContent('item-1 item-22', {
            query: 'item-\\d+',
            replaceText: 'entry',
            useRegex: true,
        })

        expect(result).toEqual({ content: 'entry entry', count: 2 })
    })

    it('guards empty and invalid queries', () => {
        expect(
            replaceInContent('unchanged', {
                query: '',
                replaceText: 'x',
            })
        ).toEqual({ content: 'unchanged', count: 0 })
        expect(
            countMatches('unchanged', {
                query: '[',
                replaceText: 'x',
                useRegex: true,
            })
        ).toBe(0)
    })
})
