import { PayloadAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import * as extensionsAPI from './extensionsAPI'
import codexDarkTheme from '../../theme/themes/codex-dark.json'
import darkModernTheme from '../../theme/themes/dark-modern.json'
import darkPlusTheme from '../../theme/themes/dark-plus.json'
import lightModernTheme from '../../theme/themes/light-modern.json'

export interface Extension {
    id?: string
    extensionId?: string
    path?: string
    namespace?: string
    name?: string
    displayName?: string
    description?: string
    version?: string
    publisher?: string
    publishedDate?: string
    lastUpdated?: string
    icon?: string
    downloads?: number
    downloadCount?: number
    rating?: number
    averageRating?: number
    reviewCount?: number
    categories?: string[]
    tags?: string[]
    files?: {
        download?: string
        manifest?: string
        icon?: string
        readme?: string
        license?: string
        changelog?: string
    }
    contributes?: {
        themes?: Array<{
            id?: string
            label?: string
            path: string
            uiTheme?: string
        }>
        iconThemes?: Array<{
            id?: string
            label?: string
            path: string
        }>
        commands?: Array<{
            command: string
            title: string
            category?: string
        }>
        [key: string]: any
    }
    isTheme?: boolean
    themeData?: ThemeData
}

export interface ThemeData {
    type: 'dark' | 'light'
    colors: {
        background: string
        foreground: string
        cursor: string
        selection: string
        lineHighlight: string

        // Specific UI Elements
        sidebarBackground: string
        sidebarForeground: string
        activityBarBackground: string
        activityBarForeground: string
        activityBarInactiveForeground?: string
        activityBarActiveBackground?: string
        buttonBackground?: string
        buttonForeground?: string
        buttonHoverBackground?: string
        descriptionForeground?: string
        panelBackground: string
        panelForeground: string
        titleBarBackground: string
        titleBarForeground: string
        itemHoverBackground: string

        // Terminal ANSI Colors
        ansiBlack?: string
        ansiRed?: string
        ansiGreen?: string
        ansiYellow?: string
        ansiBlue?: string
        ansiMagenta?: string
        ansiCyan?: string
        ansiWhite?: string
        ansiBrightBlack?: string
        ansiBrightRed?: string
        ansiBrightGreen?: string
        ansiBrightYellow?: string
        ansiBrightBlue?: string
        ansiBrightMagenta?: string
        ansiBrightCyan?: string
        ansiBrightWhite?: string

        // Borders
        borderColor?: string
        sidebarBorder?: string
        activityBarBorder?: string
        panelBorder?: string
        tabBorder?: string
        titleBarBorder?: string
        editorGroupBorder?: string

        // Syntax colors
        keyword: string
        string: string
        number: string
        function: string
        variable: string
        type: string
        comment: string
        tag: string
        attribute: string
        constant?: string
        property?: string
        operator?: string
        punctuation?: string
    }
}

export interface ExtensionsState {
    installed: { [key: string]: Extension }
    available: Extension[]
    searchQuery: string
    isSearching: boolean
    activeTheme: string
    availableThemes: { [key: string]: ThemeData }
}

function mapThemeToThemeData(theme: any): ThemeData {
    const colors = theme.colors || {}
    const tokenColors = theme.tokenColors || []

    const getColor = (scopes: string | string[]) => {
        const scopeArray = Array.isArray(scopes) ? scopes : [scopes]

        for (const targetScope of scopeArray) {
            const token = tokenColors.find((t: any) => {
                const tokenScope = t.scope
                if (!tokenScope) return false

                // Handle single string, array, or comma-separated string
                if (Array.isArray(tokenScope)) {
                    return tokenScope.includes(targetScope)
                }
                if (typeof tokenScope === 'string') {
                    if (tokenScope === targetScope) return true
                    if (tokenScope.includes(',')) {
                        const parts = tokenScope
                            .split(',')
                            .map((s: string) => s.trim())
                        return parts.includes(targetScope)
                    }
                }
                return tokenScope === targetScope
            })

            if (token && token.settings && token.settings.foreground) {
                return token.settings.foreground
            }
        }
        return null
    }

    return {
        type: theme.type === 'light' ? 'light' : 'dark',
        colors: {
            // Editor
            background: colors['editor.background'] || '#000000',
            foreground: colors['editor.foreground'] || '#e5e5e5',
            cursor: colors['editorCursor.foreground'] || '#3b82f6',
            selection: colors['editor.selectionBackground'] || '#3b82f640',
            lineHighlight:
                colors['editor.lineHighlightBackground'] || '#0a0a0a',

            // Sidebar
            sidebarBackground: colors['sideBar.background'] || '#121212',
            sidebarForeground: colors['sideBar.foreground'] || '#e5e5e5',

            // Activity Bar
            activityBarBackground:
                colors['activityBar.background'] || '#141414',
            activityBarForeground:
                colors['activityBar.foreground'] || '#e5e5e5',
            activityBarInactiveForeground:
                colors['activityBar.inactiveForeground'],
            activityBarActiveBackground:
                colors['activityBar.activeBackground'] ||
                colors['list.activeSelectionBackground'],

            buttonBackground: colors['button.background'],
            buttonForeground: colors['button.foreground'],
            buttonHoverBackground: colors['button.hoverBackground'],
            descriptionForeground: colors['descriptionForeground'],

            // Panel / Terminal
            panelBackground:
                colors['panel.background'] ||
                colors['terminal.background'] ||
                '#000000',
            panelForeground:
                colors['panel.foreground'] ||
                colors['terminal.foreground'] ||
                '#e5e5e5',

            // Title Bar
            titleBarBackground:
                colors['titleBar.activeBackground'] || '#121212',
            titleBarForeground:
                colors['titleBar.activeForeground'] || '#e5e5e5',

            // Misc
            itemHoverBackground: colors['list.hoverBackground'] || '#2a2a2a',

            // Borders
            borderColor:
                colors['editorGroup.border'] ||
                colors['panel.border'] ||
                colors['sideBar.border'] ||
                colors['activityBar.border'] ||
                '#3e3e3e',
            sidebarBorder: colors['sideBar.border'],
            activityBarBorder: colors['activityBar.border'],
            panelBorder: colors['panel.border'],
            tabBorder: colors['tab.border'],
            titleBarBorder: colors['titleBar.border'],
            editorGroupBorder: colors['editorGroup.border'],

            // Terminal ANSI
            ansiBlack: colors['terminal.ansiBlack'],
            ansiRed: colors['terminal.ansiRed'],
            ansiGreen: colors['terminal.ansiGreen'],
            ansiYellow: colors['terminal.ansiYellow'],
            ansiBlue: colors['terminal.ansiBlue'],
            ansiMagenta: colors['terminal.ansiMagenta'],
            ansiCyan: colors['terminal.ansiCyan'],
            ansiWhite: colors['terminal.ansiWhite'],
            ansiBrightBlack: colors['terminal.ansiBrightBlack'],
            ansiBrightRed: colors['terminal.ansiBrightRed'],
            ansiBrightGreen: colors['terminal.ansiBrightGreen'],
            ansiBrightYellow: colors['terminal.ansiBrightYellow'],
            ansiBrightBlue: colors['terminal.ansiBrightBlue'],
            ansiBrightMagenta: colors['terminal.ansiBrightMagenta'],
            ansiBrightCyan: colors['terminal.ansiBrightCyan'],
            ansiBrightWhite: colors['terminal.ansiBrightWhite'],

            // Extract syntax colors from tokenColors
            keyword:
                getColor(['keyword', 'storage', 'variable.language']) ||
                '#3b82f6',
            string: getColor('string') || '#ce9178',
            number:
                getColor(['constant.numeric', 'literal.number']) || '#b5cea8',
            function:
                getColor(['entity.name.function', 'support.function']) ||
                '#dcdcaa',
            variable: getColor('variable') || '#9cdcfe',
            type: getColor(['entity.name.type', 'support.type']) || '#4ec9b0',
            comment: getColor('comment') || '#6a9955',
            tag: getColor('entity.name.tag') || '#569cd6',
            attribute: getColor('entity.other.attribute-name') || '#9cdcfe',
            constant: getColor('constant') || '#4fc1ff',
            property: getColor('variable.other.property') || '#d4d4d4',
            operator: getColor('keyword.operator') || '#d4d4d4',
            punctuation: getColor(['punctuation', 'meta.brace']) || '#d4d4d4',
        },
    }
}

const defaultThemes: { [key: string]: ThemeData } = {
    'codex-dark': mapThemeToThemeData(codexDarkTheme),
    'dark-modern': mapThemeToThemeData(darkModernTheme),
    'dark-plus': mapThemeToThemeData(darkPlusTheme),
    'light-modern': mapThemeToThemeData(lightModernTheme),
}

export const initialExtensionsState: ExtensionsState = {
    installed: {},
    available: [],
    searchQuery: '',
    isSearching: false,
    activeTheme: 'codex-dark',
    availableThemes: defaultThemes,
}

// Fetch popular/featured extensions
export const fetchPopularExtensions = createAsyncThunk(
    'extensions/fetchPopular',
    async () => {
        return await extensionsAPI.getPopularExtensions(50)
    }
)

export const searchExtensions = createAsyncThunk(
    'extensions/search',
    async (query: string) => {
        if (!query) return []
        return await extensionsAPI.searchExtensions({
            query,
            size: 50,
            sortBy: 'relevance',
        })
    }
)

export const installExtension = createAsyncThunk(
    'extensions/install',
    async (extension: Extension, { dispatch, rejectWithValue }) => {
        try {
            console.log(
                'Installing extension:',
                extension.displayName || extension.name
            )
            // @ts-ignore
            await connector.installExtension(extension)
            console.log(
                'Extension installed successfully:',
                extension.displayName || extension.name
            )

            // Reload installed extensions to pick up the new one
            dispatch(initializeExtensions())

            return extension
        } catch (error: any) {
            console.error('Failed to install extension:', error)
            return rejectWithValue(
                error.message || 'Failed to install extension'
            )
        }
    }
)

export const uninstallExtension = createAsyncThunk(
    'extensions/uninstall',
    async (extensionId: string, { dispatch, rejectWithValue }) => {
        try {
            console.log('Uninstalling extension:', extensionId)
            // @ts-ignore
            await connector.uninstallExtension(extensionId)
            console.log('Extension uninstalled successfully:', extensionId)

            // Reload installed extensions
            dispatch(initializeExtensions())

            return extensionId
        } catch (error: any) {
            console.error('Failed to uninstall extension:', error)
            return rejectWithValue(
                error.message || 'Failed to uninstall extension'
            )
        }
    }
)

export const initializeExtensions = createAsyncThunk(
    'extensions/initialize',
    async (_, { dispatch }) => {
        console.log('🔄 Initializing extensions...')
        // @ts-ignore
        const extensions: Extension[] = await connector.getInstalledExtensions()
        console.log(
            `📦 Found ${extensions.length} installed extensions:`,
            extensions.map((e) => e.name)
        )
        dispatch(loadInstalledExtensions(extensions))

        const delimiter = (window as any).connector?.PLATFORM_DELIMITER || '/'

        // Import activation manager
        const { extensionActivationManager } = await import(
            './extensionActivation'
        )

        // Check for themes and add them
        let themesFound = 0
        let extensionsActivated = 0

        for (const ext of extensions) {
            // Activate the extension
            try {
                const activated =
                    await extensionActivationManager.activateExtension(ext)
                if (activated) {
                    extensionsActivated++
                }
            } catch (error) {
                console.error(
                    `Failed to activate extension ${ext.name}:`,
                    error
                )
            }

            // Load themes
            // @ts-ignore
            if (ext.contributes && ext.contributes.themes && ext.path) {
                console.log(
                    `🎨 Extension "${ext.name}" has themes:`,
                    ext.contributes.themes
                )
                // @ts-ignore
                for (const theme of ext.contributes.themes) {
                    try {
                        const themePath = [ext.path, theme.path].join(delimiter)
                        console.log(`  Loading theme from: ${themePath}`)
                        // @ts-ignore
                        const content = await connector.getFile(themePath)
                        if (content) {
                            const themeJson = JSON.parse(content)
                            const themeData = mapThemeToThemeData(themeJson)
                            const themeName =
                                theme.id ||
                                theme.label ||
                                ext.name ||
                                'unknown-theme'
                            console.log(
                                `  ✅ Successfully loaded theme: ${themeName}`
                            )
                            dispatch(
                                addCustomTheme({
                                    name: themeName,
                                    theme: themeData,
                                })
                            )
                            themesFound++
                        } else {
                            console.warn(
                                `  ⚠️ No content found for theme at ${themePath}`
                            )
                        }
                    } catch (e) {
                        console.error(
                            `  ❌ Failed to load theme from ${ext.name}:`,
                            e
                        )
                    }
                }
            }

            // Detect icon themes
            // @ts-ignore
            if (ext.contributes && ext.contributes.iconThemes) {
                console.log(
                    `🎨 Extension "${ext.name}" has icon themes:`,
                    ext.contributes.iconThemes
                )
            }
        }
        if (extensions.length > 0) {
            console.log(
                `Activated ${extensionsActivated}/${extensions.length} extensions`
            )
        }

        return extensions
    }
)

export const extensionsSlice = createSlice({
    name: 'extensions',
    initialState: initialExtensionsState,
    reducers: {
        setSearchQuery(state, action: PayloadAction<string>) {
            state.searchQuery = action.payload
        },
        setActiveTheme(state, action: PayloadAction<string>) {
            state.activeTheme = action.payload
        },
        addCustomTheme(
            state,
            action: PayloadAction<{ name: string; theme: ThemeData }>
        ) {
            state.availableThemes[action.payload.name] = action.payload.theme
        },
        loadInstalledExtensions(state, action: PayloadAction<Extension[]>) {
            state.installed = {}
            action.payload.forEach((ext) => {
                const id = ext.extensionId || ext.id
                if (id) {
                    state.installed[id] = ext
                }
            })
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchPopularExtensions.pending, (state) => {
                state.isSearching = true
            })
            .addCase(fetchPopularExtensions.fulfilled, (state, action) => {
                state.available = action.payload
                state.isSearching = false
            })
            .addCase(fetchPopularExtensions.rejected, (state) => {
                state.isSearching = false
            })
            .addCase(searchExtensions.pending, (state) => {
                state.isSearching = true
            })
            .addCase(searchExtensions.fulfilled, (state, action) => {
                state.available = action.payload
                state.isSearching = false
            })
            .addCase(searchExtensions.rejected, (state) => {
                state.isSearching = false
            })
            .addCase(installExtension.fulfilled, (state, action) => {
                const id = action.payload.extensionId || action.payload.id
                if (id) {
                    state.installed[id] = action.payload
                }
            })
            .addCase(uninstallExtension.fulfilled, (state, action) => {
                if (action.payload) {
                    delete state.installed[action.payload]
                }
            })
    },
})

export const {
    setSearchQuery,
    setActiveTheme,
    addCustomTheme,
    loadInstalledExtensions,
} = extensionsSlice.actions

export default extensionsSlice.reducer
