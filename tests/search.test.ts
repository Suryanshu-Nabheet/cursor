jest.mock('../src/main/storeHandler', () => ({
    store: {
        get: jest.fn(),
    },
}))

import { resolveProjectRoot } from '../src/main/search'
import { store } from '../src/main/storeHandler'

describe('Search root resolution (resolveProjectRoot)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns provided rootPath if directory exists on filesystem', () => {
        const cwd = process.cwd()
        expect(resolveProjectRoot(cwd)).toBe(cwd)
    })

    it('falls back to active project from store if provided rootPath is empty or invalid', () => {
        const cwd = process.cwd()
        store.get.mockReturnValue({ defaultFolder: cwd })

        expect(resolveProjectRoot('')).toBe(cwd)
        expect(resolveProjectRoot(undefined)).toBe(cwd)
        expect(resolveProjectRoot('   ')).toBe(cwd)
    })

    it('handles store returning direct string project path', () => {
        const cwd = process.cwd()
        store.get.mockReturnValue(cwd)

        expect(resolveProjectRoot('')).toBe(cwd)
    })

    it('returns empty string if neither rootPath nor store project exist', () => {
        store.get.mockReturnValue({ defaultFolder: '/non/existent/path/98765' })

        expect(resolveProjectRoot('')).toBe('')
        expect(resolveProjectRoot('/non/existent/path/12345')).toBe('/non/existent/path/12345')
    })
})
