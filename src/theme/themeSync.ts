/**
 * Centralized Theme Synchronization System
 * Single source of truth for all theme values in Cursor IDE
 */

import { Settings } from '../features/window/state'

export interface ThemeColors {
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

    // Syntax
    keyword: string
    string: string
    number: string
    function: string
    variable: string
    type: string
    comment: string
    tag: string
    attribute: string
    constant: string
    property: string
    operator: string
    punctuation: string

    // Borders
    borderColor?: string
    sidebarBorder?: string
    activityBarBorder?: string
    panelBorder?: string
    tabBorder?: string
    titleBarBorder?: string
    editorGroupBorder?: string

    // Terminal ANSI
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
}

/**
 * Apply theme to root CSS variables
 * This is the only place theme values should be set
 */
export function applyThemeToRoot(theme: ThemeColors) {
    const root = document.documentElement

    // ═══════════════════════════════════════════════════════════════════════
    // BASE COLORS - Cursor IDE / VS Code Dark Theme
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--black', theme.background)
    root.style.setProperty('--black-soft', theme.lineHighlight)
    root.style.setProperty('--black-elevated', theme.panelBackground)
    root.style.setProperty('--black-subtle', theme.itemHoverBackground)

    // Gray scale matching Cursor IDE / VS Code
    root.style.setProperty('--gray-900', theme.background)
    root.style.setProperty('--gray-800', theme.lineHighlight)
    root.style.setProperty('--gray-700', theme.panelBackground)
    root.style.setProperty('--gray-600', theme.itemHoverBackground)
    root.style.setProperty('--gray-500', '#3e3e3e')
    root.style.setProperty('--gray-400', '#858585')
    root.style.setProperty('--gray-300', '#cccccc')
    root.style.setProperty('--gray-200', theme.foreground)
    root.style.setProperty('--gray-100', '#ffffff')

    root.style.setProperty('--white', '#ffffff')
    root.style.setProperty('--white-soft', '#f3f3f3')

    // ═══════════════════════════════════════════════════════════════════════
    // CORE BACKGROUNDS - Specific Mappings
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--background', theme.background)
    root.style.setProperty('--editor-bg', theme.background)
    root.style.setProperty('--sidebar-bg', theme.sidebarBackground)
    root.style.setProperty('--panel-bg', theme.panelBackground)
    root.style.setProperty('--activity-bar-bg', theme.activityBarBackground)
    root.style.setProperty('--titlebar-bg', theme.titleBarBackground)
    root.style.setProperty('--terminal-bg', theme.panelBackground)
    root.style.setProperty('--ui-bg', theme.sidebarBackground)
    root.style.setProperty('--gutter-bg', theme.background)
    root.style.setProperty('--chatbar-background', theme.background)
    root.style.setProperty('--welcome-bg', theme.background)
    root.style.setProperty('--welcome-container-bg', theme.background)

    // Elevated Surfaces - Cursor IDE / VS Code
    root.style.setProperty('--ui-bg-elevated', theme.panelBackground)
    root.style.setProperty('--ui-bg-subtle', theme.itemHoverBackground)
    root.style.setProperty('--panel-bg-elevated', theme.panelBackground)

    // ═══════════════════════════════════════════════════════════════════════
    // CORE FOREGROUNDS - Specific Mappings
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--editor-fg', theme.foreground)
    root.style.setProperty('--ui-fg', theme.sidebarForeground)
    root.style.setProperty('--sidebar-fg', theme.sidebarForeground)
    root.style.setProperty('--panel-fg', theme.panelForeground)
    root.style.setProperty('--titlebar-fg', theme.titleBarForeground)
    root.style.setProperty('--terminal-fg', theme.panelForeground)
    root.style.setProperty('--text', theme.foreground)
    root.style.setProperty('--active-text', theme.foreground)
    root.style.setProperty('--any-fg', theme.foreground)
    root.style.setProperty('--chat-text', theme.foreground)

    // Typed text vars - used by theme/index.css references to --text-primary etc.
    root.style.setProperty('--text-primary', theme.foreground)
    root.style.setProperty('--text-secondary', theme.sidebarForeground)
    root.style.setProperty(
        '--text-tertiary',
        theme.descriptionForeground || theme.comment || '#858585'
    )

    // White/Black helpers - dynamic per theme type
    root.style.setProperty('--white', '#ffffff')
    root.style.setProperty('--white-soft', '#f3f3f3')

    // Autofill override variables - theme-aware so autofill doesn't break light themes
    root.style.setProperty('--autofill-bg', theme.itemHoverBackground)
    root.style.setProperty('--autofill-fg', theme.foreground)

    // Muted Foregrounds - Cursor IDE / VS Code
    root.style.setProperty('--ui-fg-muted', '#858585')
    root.style.setProperty('--any-fg-muted', '#858585')
    root.style.setProperty('--sidebar-fg-muted', '#858585')
    root.style.setProperty('--gutter-fg', '#858585')
    root.style.setProperty('--tab-fg', '#858585')
    root.style.setProperty('--gutter-fg-active', theme.foreground)

    // ═══════════════════════════════════════════════════════════════════════
    // EDITOR ELEMENTS
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--editor-cursor', theme.cursor)
    root.style.setProperty('--terminal-cursor', theme.cursor)
    root.style.setProperty('--editor-selection', theme.selection)
    root.style.setProperty('--terminal-selection', theme.selection)
    root.style.setProperty('--selection', theme.selection)
    root.style.setProperty('--editor-line-highlight', theme.lineHighlight)
    root.style.setProperty('--editor-selection-match', theme.selection)
    root.style.setProperty('--editor-wrap-guide', '#3e3e3e')

    // ═══════════════════════════════════════════════════════════════════════
    // SYNTAX COLORS - From theme
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--keyword', theme.keyword)
    root.style.setProperty('--string', theme.string)
    root.style.setProperty('--number', theme.number)
    root.style.setProperty('--function', theme.function)
    root.style.setProperty('--variable', theme.variable)
    root.style.setProperty('--type', theme.type)
    root.style.setProperty('--comment', theme.comment)
    root.style.setProperty('--tag', theme.tag)
    root.style.setProperty('--attribute', theme.attribute)
    root.style.setProperty('--constant', theme.keyword)
    root.style.setProperty('--property', theme.foreground)
    root.style.setProperty('--operator', theme.foreground)
    root.style.setProperty('--punctuation', theme.punctuation)

    // ═══════════════════════════════════════════════════════════════════════
    // TERMINAL ANSI COLORS
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty(
        '--terminal-ansi-black',
        theme.ansiBlack || '#000000'
    )
    root.style.setProperty('--terminal-ansi-red', theme.ansiRed || '#cd3131')
    root.style.setProperty(
        '--terminal-ansi-green',
        theme.ansiGreen || '#0dbc79'
    )
    root.style.setProperty(
        '--terminal-ansi-yellow',
        theme.ansiYellow || '#e5e510'
    )
    root.style.setProperty('--terminal-ansi-blue', theme.ansiBlue || '#2472c8')
    root.style.setProperty(
        '--terminal-ansi-magenta',
        theme.ansiMagenta || '#bc3fbc'
    )
    root.style.setProperty('--terminal-ansi-cyan', theme.ansiCyan || '#11a8cd')
    root.style.setProperty(
        '--terminal-ansi-white',
        theme.ansiWhite || '#e5e5e5'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-black',
        theme.ansiBrightBlack || '#666666'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-red',
        theme.ansiBrightRed || '#f14c4c'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-green',
        theme.ansiBrightGreen || '#23d18b'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-yellow',
        theme.ansiBrightYellow || '#f5f543'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-blue',
        theme.ansiBrightBlue || '#3b8eea'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-magenta',
        theme.ansiBrightMagenta || '#d670d6'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-cyan',
        theme.ansiBrightCyan || '#29b8db'
    )
    root.style.setProperty(
        '--terminal-ansi-bright-white',
        theme.ansiBrightWhite || '#e5e5e5'
    )

    // ═══════════════════════════════════════════════════════════════════════
    // UNIFIED BORDER SYSTEM - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════
    // UNIFIED BORDER SYSTEM - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    const borderColor = theme.borderColor || '#3e3e3e'
    root.style.setProperty('--border', borderColor)
    root.style.setProperty('--ui-border', borderColor)
    root.style.setProperty('--ui-border-subtle', borderColor)
    root.style.setProperty(
        '--sidebar-border',
        theme.sidebarBorder || borderColor
    )
    root.style.setProperty('--panel-border', theme.panelBorder || borderColor)
    root.style.setProperty(
        '--pane-border',
        theme.editorGroupBorder || borderColor
    )
    root.style.setProperty('--tab-border', theme.tabBorder || borderColor)
    root.style.setProperty(
        '--titlebar-border',
        theme.titleBarBorder || borderColor
    )
    root.style.setProperty(
        '--activity-bar-border',
        theme.activityBarBorder || 'transparent'
    )
    root.style.setProperty('--input-border', borderColor)
    root.style.setProperty('--terminal-border', 'var(--pane-border)')
    root.style.setProperty('--editor-wrap-guide', borderColor)
    root.style.setProperty(
        '--chatbar-border',
        theme.sidebarBorder || borderColor
    )

    // ═══════════════════════════════════════════════════════════════════════
    // HOVER STATES - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--ui-hover', theme.itemHoverBackground)
    root.style.setProperty('--sidebar-hover', theme.itemHoverBackground)
    root.style.setProperty('--tab-hover', theme.itemHoverBackground)
    root.style.setProperty('--tab-hover-bg', theme.itemHoverBackground)
    root.style.setProperty('--titlebar-button-hover', theme.itemHoverBackground)

    // ═══════════════════════════════════════════════════════════════════════
    // SELECTED STATES - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--sidebar-selected', theme.selection)
    root.style.setProperty('--sidebar-bg-active', theme.itemHoverBackground)
    root.style.setProperty('--sidebar-fg-active', theme.sidebarForeground)
    root.style.setProperty('--accent-active', theme.selection)

    // ═══════════════════════════════════════════════════════════════════════
    // ACCENT COLORS - Cursor IDE / VS Code Blue
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--accent', theme.buttonBackground || '#007acc')
    root.style.setProperty('--accent-rgb', '0, 120, 212') // For rgba() usage
    root.style.setProperty('--accent-hover', '#1ba1e2')
    root.style.setProperty('--blue', theme.buttonBackground || '#007acc')
    root.style.setProperty('--blue-light', '#1ba1e2')
    root.style.setProperty(
        '--sidebar-selected-accent',
        theme.buttonBackground || '#007acc'
    )

    // Semantic colors - these remain stable as they reference standard meanings
    root.style.setProperty('--color-success', '#4ade80')
    root.style.setProperty('--color-error', '#f87171')
    root.style.setProperty('--color-warning', '#facc15')
    root.style.setProperty('--color-info', '#007acc')

    // Purple for AI annotations (stable semantic color)
    root.style.setProperty('--purple', '#c586c0')

    // Glass/overlay helpers - computed from theme values
    root.style.setProperty('--glass-bg', 'rgba(0, 0, 0, 0.04)')
    root.style.setProperty('--glass-subtle', 'rgba(0, 0, 0, 0.06)')
    root.style.setProperty('--glass-hover', 'rgba(0, 0, 0, 0.08)')
    root.style.setProperty('--glass-border', 'rgba(0, 0, 0, 0.1)')

    // Shadow overlays - stable
    root.style.setProperty('--shadow-overlay-sm', 'rgba(0, 0, 0, 0.15)')
    root.style.setProperty('--shadow-overlay-md', 'rgba(0, 0, 0, 0.3)')
    root.style.setProperty('--shadow-overlay-lg', 'rgba(0, 0, 0, 0.5)')
    root.style.setProperty('--shadow-overlay-xl', 'rgba(0, 0, 0, 0.7)')

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY BAR - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--activity-bar-fg', theme.activityBarForeground)
    root.style.setProperty(
        '--activity-bar-fg-muted',
        theme.activityBarInactiveForeground || 'rgba(255, 255, 255, 0.4)'
    )
    root.style.setProperty(
        '--activity-bar-active-bg',
        theme.activityBarActiveBackground || theme.itemHoverBackground
    )
    root.style.setProperty('--activity-bar-hover-bg', theme.itemHoverBackground)
    root.style.setProperty('--activity-bar-gap', '2px')
    root.style.setProperty('--activity-bar-padding-x', '6px')
    root.style.setProperty('--activity-bar-more-gap', '10px')
    root.style.setProperty('--activity-bar-height', '35px')
    root.style.setProperty('--activity-bar-item-size', '26px')
    root.style.setProperty('--activity-bar-icon-size', '16px')

    // ═══════════════════════════════════════════════════════════════════════
    // TABS - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--tab-bg', theme.background)
    root.style.setProperty('--tab-bg-active', theme.background)
    root.style.setProperty('--tab-inactive-bg', theme.background)
    root.style.setProperty('--tab-active-bg', theme.background)
    root.style.setProperty('--tab-fg-active', theme.foreground)
    root.style.setProperty('--tab-inactive-font', 'rgba(204, 204, 204, 0.5)')

    // ═══════════════════════════════════════════════════════════════════════
    // INPUTS - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--input-bg', theme.itemHoverBackground)
    root.style.setProperty('--input-fg', theme.foreground)
    root.style.setProperty('--input-placeholder', '#858585')
    root.style.setProperty('--input-background', theme.itemHoverBackground)
    root.style.setProperty('--input-text', theme.foreground)
    root.style.setProperty('--input-border-focus', '#007acc')

    // ═══════════════════════════════════════════════════════════════════════
    // BUTTONS - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty(
        '--button-primary',
        theme.buttonBackground || '#007acc'
    )
    root.style.setProperty(
        '--button-primary-fg',
        theme.buttonForeground || '#ffffff'
    )
    root.style.setProperty(
        '--button-primary-hover',
        theme.buttonHoverBackground || theme.itemHoverBackground
    )
    root.style.setProperty('--button-success', '#28a745')
    root.style.setProperty('--button-success-hover', '#218838')
    root.style.setProperty('--button-danger', '#dc3545')
    root.style.setProperty('--button-danger-hover', '#c82333')
    root.style.setProperty('--button-secondary', theme.itemHoverBackground)
    root.style.setProperty(
        '--button-secondary-hover',
        theme.itemHoverBackground
    )

    // ═══════════════════════════════════════════════════════════════════════
    // SCROLLBAR - Cursor IDE / VS Code
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--scrollbar-bg', 'transparent')
    root.style.setProperty('--scrollbar-thumb', 'rgba(121, 121, 121, 0.4)')
    root.style.setProperty(
        '--scrollbar-thumb-hover',
        'rgba(121, 121, 121, 0.6)'
    )
    root.style.setProperty(
        '--scrollbar-thumb-border',
        'rgba(121, 121, 121, 0.4)'
    )
    root.style.setProperty('--scrollbar-track-bg', theme.background)
    root.style.setProperty(
        '--scrollbar-track-border',
        'rgba(121, 121, 121, 0.2)'
    )
    root.style.setProperty('--scrollbar-background', 'transparent')
    root.style.setProperty('--scrollbar', 'rgba(121, 121, 121, 0.4)')

    // ═══════════════════════════════════════════════════════════════════════
    // LEGACY COMPATIBILITY - Map old variable names
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--left-pane-background', theme.sidebarBackground)
    root.style.setProperty('--left-pane-hover', theme.itemHoverBackground)
    root.style.setProperty('--left-pane-selected', theme.selection)
    root.style.setProperty('--selected-text', '#1ba1e2')
    root.style.setProperty('--marked-text', '#007acc')
    root.style.setProperty('--user-chat-bubble', '#007acc')
    root.style.setProperty('--assistant-chat-bubble', theme.itemHoverBackground)
    root.style.setProperty('--title-bar-background', theme.titleBarBackground)
    root.style.setProperty('--tab-bar-background', theme.background)
    root.style.setProperty('--tab-active', theme.background)
    root.style.setProperty('--tab-not-active', theme.background)
    root.style.setProperty('--selection-match', theme.selection)
    root.style.setProperty('--button', theme.itemHoverBackground)
    root.style.setProperty('--cursor-theme-editor-background', theme.background)
    root.style.setProperty('--cursor-blue', '#007acc')
    root.style.setProperty('--link-cursor-blue', '#1ba1e2')
    root.style.setProperty('--submit-button', '#28a745')
    root.style.setProperty('--reject-button', '#dc3545')
    root.style.setProperty(
        '--submit-transparent-button',
        'rgba(40, 167, 69, 0.5)'
    )
    root.style.setProperty(
        '--reject-transparent-button',
        'rgba(220, 53, 69, 0.5)'
    )
    root.style.setProperty('--cancel-button', theme.itemHoverBackground)
    root.style.setProperty('--continue-button', '#007acc')
    root.style.setProperty('--full-continue-button', '#28a745')
    root.style.setProperty('--ai-color', '#007acc')
    root.style.setProperty('--diff-add', '#e5feeb')
    root.style.setProperty('--other-diff-add', 'rgba(40, 167, 69, 0.2)')
    root.style.setProperty('--diff-bright-add', '#28a745')
    root.style.setProperty('--diff-delete', '#ffe5e5')
    root.style.setProperty('--diff-bright-delete', '#dc3545')

    // ═══════════════════════════════════════════════════════════════════════
    // ANYSPHERE LEGACY
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--any-bg-lighter', theme.itemHoverBackground)
    root.style.setProperty('--any-bg-darker', theme.background)
    root.style.setProperty('--any-bg', theme.background)
    root.style.setProperty('--any-fg', theme.foreground)
    root.style.setProperty('--any-fg-muted', '#858585')
    root.style.setProperty('--any-tag', '#007acc')

    // ═══════════════════════════════════════════════════════════════════════
    // BRACKET COLORIZATION - Stable semantic colors
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty('--bracket-1', '#f9d949')
    root.style.setProperty('--bracket-2', '#bf6fc3')
    root.style.setProperty('--bracket-3', '#4a9df8')

    // ═══════════════════════════════════════════════════════════════════════
    // BORDER VARIANTS
    // ═══════════════════════════════════════════════════════════════════════
    root.style.setProperty(
        '--ui-border-hover',
        theme.selection || theme.itemHoverBackground
    )
    root.style.setProperty('--ui-border-subtle', theme.itemHoverBackground)
}

/**
 * Sync theme from settings - called when theme changes
 * This is the ONLY place theme values should be set
 */
export function syncThemeFromSettings(
    settings: Settings,
    availableThemes: any
) {
    // Migrate pre-rebrand theme id
    let themeName = settings.theme || 'cursor-dark'
    if (themeName === 'codex-dark') {
        themeName = 'cursor-dark'
    }
    let theme = availableThemes[themeName]

    // Force fallback to cursor-dark if the requested theme is missing or invalid
    if (!theme || !theme.colors) {
        theme = availableThemes['cursor-dark']
    }

    // Ultra-fallback if even cursor-dark is missing from state (shouldn't happen if loaded correctly)
    const c = theme?.colors || {
        background: '#0a0a0a', // Matches cursor-dark.json
        foreground: '#e5e5e5',
        cursor: '#3b82f6',
        selection: 'rgba(59, 130, 246, 0.25)',
        lineHighlight: '#1f1f1f',
        sidebarBackground: '#121212',
        sidebarForeground: '#e5e5e5',
        activityBarBackground: '#141414',
        activityBarForeground: '#e5e5e5',
        panelBackground: '#0a0a0a',
        panelForeground: '#e5e5e5',
        titleBarBackground: '#121212',
        titleBarForeground: '#e5e5e5',
        itemHoverBackground: '#2a2a2a',
    }

    const itemHoverBackground = c.itemHoverBackground || '#2a2a2a'

    // Robust fallback to prevent 'Blue Border' if state is stale
    const effectiveBorderColor =
        c.editorGroupBorder ||
        c.panelBorder ||
        c.sidebarBorder || // Note check casing: sidebarBorder vs sideBarBorder. In extensionsSlice mapping (Step 673) it was sidebarBorder: colors['sideBar.border']. So property name is 'sidebarBorder'.
        c.activityBarBorder ||
        '#3e3e3e'

    const forceSidebarBorder = c.sidebarBorder || effectiveBorderColor

    applyThemeToRoot({
        background: c.background || '#0a0a0a',
        foreground: c.foreground || '#e5e5e5',
        cursor: c.cursor || '#3b82f6',
        selection: c.selection || 'rgba(59, 130, 246, 0.25)',
        lineHighlight: c.lineHighlight || '#1f1f1f',

        sidebarBackground: c.sidebarBackground || '#121212',
        sidebarForeground: c.sidebarForeground || '#e5e5e5',
        activityBarBackground: c.activityBarBackground || '#141414',
        activityBarForeground: c.activityBarForeground || '#e5e5e5',
        activityBarInactiveForeground: c.activityBarInactiveForeground,
        activityBarActiveBackground: c.activityBarActiveBackground,
        buttonBackground: c.buttonBackground,
        buttonForeground: c.buttonForeground,
        buttonHoverBackground: c.buttonHoverBackground,
        descriptionForeground: c.descriptionForeground,
        panelBackground: c.panelBackground || '#0a0a0a',
        panelForeground: c.panelForeground || '#e5e5e5',
        titleBarBackground: c.titleBarBackground || '#121212',
        titleBarForeground: c.titleBarForeground || '#e5e5e5',
        itemHoverBackground: itemHoverBackground,

        // DYNAMIC Syntax Colors - Respect the Theme
        keyword: c.keyword || '#569cd6',
        string: c.string || '#ce9178',
        number: c.number || '#b5cea8',
        function: c.function || '#dcdcaa',
        variable: c.variable || '#9cdcfe',
        type: c.type || '#4ec9b0',
        comment: c.comment || '#6a9955',
        tag: c.tag || '#569cd6',
        attribute: c.attribute || '#9cdcfe',
        constant: c.constant || '#4fc1ff',
        property: c.property || '#d4d4d4',
        operator: c.operator || '#d4d4d4',
        punctuation: c.punctuation || '#d4d4d4',

        // Borders
        borderColor: effectiveBorderColor,
        sidebarBorder: forceSidebarBorder,
        activityBarBorder: c.activityBarBorder,
        panelBorder: c.panelBorder,
        tabBorder: c.tabBorder,
        titleBarBorder: c.titleBarBorder,
        editorGroupBorder: c.editorGroupBorder,

        // Terminal ANSI
        ansiBlack: c.ansiBlack,
        ansiRed: c.ansiRed,
        ansiGreen: c.ansiGreen,
        ansiYellow: c.ansiYellow,
        ansiBlue: c.ansiBlue,
        ansiMagenta: c.ansiMagenta,
        ansiCyan: c.ansiCyan,
        ansiWhite: c.ansiWhite,
        ansiBrightBlack: c.ansiBrightBlack,
        ansiBrightRed: c.ansiBrightRed,
        ansiBrightGreen: c.ansiBrightGreen,
        ansiBrightYellow: c.ansiBrightYellow,
        ansiBrightBlue: c.ansiBrightBlue,
        ansiBrightMagenta: c.ansiBrightMagenta,
        ansiBrightCyan: c.ansiBrightCyan,
        ansiBrightWhite: c.ansiBrightWhite,
    })
}
