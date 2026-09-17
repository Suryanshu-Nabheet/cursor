import { CodeSymbolType } from '../window/state'

/** Local symbol helper — no remote index backend. */
export class ContextBuilder {
    private previousSymbols: [string, CodeSymbolType, string, string][] | null =
        []
    private previousSymbolsFuture: Promise<{ query: string }> | null = null

    constructor(private _repoId: string) {
        setInterval(() => {
            this.previousSymbols = null
            this.previousSymbolsFuture = null
        }, 30000)
    }

    async getSymbols(): Promise<[string, CodeSymbolType, string, string][]> {
        return []
    }

    async quickGetSymbols(timeout = 5) {
        if (this.previousSymbols) {
            return this.previousSymbols
        }

        if (this.previousSymbolsFuture) {
            await Promise.race([
                this.previousSymbolsFuture,
                new Promise((resolve) =>
                    setTimeout(() => resolve(null), timeout)
                ),
            ])
        }

        if (this.previousSymbols) {
            return this.previousSymbols
        }
        return []
    }

    async getCompletion(currentText: string, _relevantDocs: string[]) {
        if (this.previousSymbolsFuture == null) {
            this.previousSymbolsFuture = this.getSymbols().then((result) => {
                this.previousSymbols = result
                return { query: currentText }
            })
        }

        const symbols = await this.quickGetSymbols(1000)
        const finalSymbols = [
            ...symbols
                .filter((symbol) =>
                    symbol[0].toLowerCase().includes(currentText.toLowerCase())
                )
                .map(([name, block_type, summary, fname]) => {
                    const startIndex = name
                        .toLowerCase()
                        .indexOf(currentText.toLowerCase())
                    const endIndex = startIndex + currentText.length
                    return {
                        type: block_type,
                        path: fname,
                        name,
                        summary,
                        startIndex,
                        endIndex,
                    }
                })
                .sort((a, b) => {
                    const startsA = a.name
                        .toLowerCase()
                        .startsWith(currentText.toLowerCase())
                    const startsB = b.name
                        .toLowerCase()
                        .startsWith(currentText.toLowerCase())

                    if (startsA && !startsB) {
                        return -1
                    } else if (!startsA && startsB) {
                        return 1
                    } else {
                        if (a.name.length < b.name.length) {
                            return -1
                        } else if (a.name.length > b.name.length) {
                            return 1
                        } else {
                            const type_orderings = [
                                'class',
                                'function',
                                'variable',
                                'import',
                            ]
                            const aOrder = type_orderings.indexOf(a.type)
                            const bOrder = type_orderings.indexOf(b.type)
                            return aOrder - bOrder
                        }
                    }
                }),
        ]

        return finalSymbols.slice(0, 20)
    }
}
