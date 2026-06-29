export interface SearchReplaceOptions {
    query: string
    replaceText: string
    matchCase?: boolean
    useRegex?: boolean
    matchWholeWord?: boolean
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildSearchRegExp(options: SearchReplaceOptions): RegExp | null {
    if (!options.query) return null

    const source = options.useRegex
        ? options.query
        : escapeRegExp(options.query)
    const wordWrapped = options.matchWholeWord ? `\\b(?:${source})\\b` : source

    try {
        return new RegExp(wordWrapped, options.matchCase ? 'g' : 'gi')
    } catch {
        return null
    }
}

export function replaceInContent(
    content: string,
    options: SearchReplaceOptions,
    limit?: number
) {
    const expression = buildSearchRegExp(options)
    if (!expression) {
        return { content, count: 0 }
    }

    let count = 0
    const nextContent = content.replace(expression, (match) => {
        if (limit != null && count >= limit) return match
        count += 1
        return options.replaceText
    })

    return {
        content: nextContent,
        count,
    }
}

export function countMatches(content: string, options: SearchReplaceOptions) {
    const expression = buildSearchRegExp(options)
    if (!expression) return 0
    return Array.from(content.matchAll(expression)).length
}
