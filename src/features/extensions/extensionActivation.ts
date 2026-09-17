/**
 * Extension Activation System
 * Manages the lifecycle of extensions: activation, deactivation, and execution
 */

import { Extension } from './extensionsSlice'

export interface ExtensionContext {
    extensionId: string
    extensionPath: string
    globalState: Map<string, any>
    workspaceState: Map<string, any>
    subscriptions: Array<{ dispose: () => void }>
}

export interface ExtensionAPI {
    // Commands
    registerCommand: (
        commandId: string,
        callback: (...args: any[]) => any
    ) => void
    executeCommand: (commandId: string, ...args: any[]) => Promise<any>

    // UI
    showInformationMessage: (message: string) => void
    showWarningMessage: (message: string) => void
    showErrorMessage: (message: string) => void

    // Editor
    getActiveEditor: () => any
    insertText: (text: string) => void
    replaceSelection: (text: string) => void

    // Workspace
    getWorkspacePath: () => string | null
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>

    // AI Integration
    sendToAI: (prompt: string) => Promise<string>

    // Language Features
    registerCompletionProvider: (language: string, provider: any) => void
    registerHoverProvider: (language: string, provider: any) => void
    registerCodeActionProvider: (language: string, provider: any) => void
}

class ExtensionActivationManager {
    private activeExtensions: Map<string, ExtensionContext> = new Map()
    private commands: Map<string, (...args: any[]) => any> = new Map()
    private completionProviders: Map<string, any[]> = new Map()
    private hoverProviders: Map<string, any[]> = new Map()
    private codeActionProviders: Map<string, any[]> = new Map()

    /**
     * Activate an extension
     */
    async activateExtension(extension: Extension): Promise<boolean> {
        const extId =
            extension.extensionId || `${extension.namespace}.${extension.name}`

        if (this.activeExtensions.has(extId)) {
            console.log(`Extension ${extId} is already active`)
            return true
        }

        console.log(`Activating extension: ${extId}`)

        try {
            // Create extension context
            const context: ExtensionContext = {
                extensionId: extId,
                extensionPath: extension.path || '',
                globalState: new Map(),
                workspaceState: new Map(),
                subscriptions: [],
            }

            // Create extension API
            const api = this.createExtensionAPI(context)

            // Try to load and execute extension's main file
            if (extension.path) {
                await this.loadExtensionCode(extension, context, api)
            }

            this.activeExtensions.set(extId, context)
            console.log(`Extension ${extId} activated successfully`)
            return true
        } catch (error) {
            console.error(`Failed to activate extension ${extId}:`, error)
            return false
        }
    }

    /**
     * Deactivate an extension
     */
    async deactivateExtension(extensionId: string): Promise<void> {
        const context = this.activeExtensions.get(extensionId)
        if (!context) return

        console.log(`Deactivating extension: ${extensionId}`)

        // Dispose all subscriptions
        for (const subscription of context.subscriptions) {
            try {
                subscription.dispose()
            } catch (error) {
                console.error('Error disposing subscription:', error)
            }
        }

        // Remove commands registered by this extension
        const commandsToRemove: string[] = []
        this.commands.forEach((_, commandId) => {
            if (commandId.startsWith(extensionId)) {
                commandsToRemove.push(commandId)
            }
        })
        commandsToRemove.forEach((cmd) => this.commands.delete(cmd))

        this.activeExtensions.delete(extensionId)
        console.log(`Extension ${extensionId} deactivated`)
    }

    /**
     * Create the extension API that extensions can use
     */
    private createExtensionAPI(context: ExtensionContext): ExtensionAPI {
        return {
            // Commands
            registerCommand: (
                commandId: string,
                callback: (...args: any[]) => any
            ) => {
                const fullCommandId = `${context.extensionId}.${commandId}`
                this.commands.set(fullCommandId, callback)
                console.log(`Registered command: ${fullCommandId}`)

                context.subscriptions.push({
                    dispose: () => this.commands.delete(fullCommandId),
                })
            },

            executeCommand: async (commandId: string, ...args: any[]) => {
                const command = this.commands.get(commandId)
                if (!command) {
                    throw new Error(`Command not found: ${commandId}`)
                }
                return await command(...args)
            },

            // UI - Use browser notifications
            showInformationMessage: (message: string) => {
                console.log(`ℹ [${context.extensionId}] ${message}`)
                if (
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    new Notification('Cursor IDE', {
                        body: message,
                        icon: '/icon.png',
                    })
                }
            },

            showWarningMessage: (message: string) => {
                console.warn(`[${context.extensionId}] ${message}`)
                if (
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    new Notification('Cursor IDE - Warning', {
                        body: message,
                        icon: '/icon.png',
                    })
                }
            },

            showErrorMessage: (message: string) => {
                console.error(`[${context.extensionId}] ${message}`)
                if (
                    'Notification' in window &&
                    Notification.permission === 'granted'
                ) {
                    new Notification('Cursor IDE - Error', {
                        body: message,
                        icon: '/icon.png',
                    })
                }
            },

            // Editor - Integrate with Redux store
            getActiveEditor: () => {
                const state = (window as any).__REDUX_STORE__?.getState()
                if (!state) return null

                const focusedTabId = state.global.tabs.find(
                    (t: any) => t.isActive
                )?.fileId
                if (!focusedTabId) return null

                return {
                    fileId: focusedTabId,
                    file: state.global.files[focusedTabId],
                }
            },

            insertText: (text: string) => {
                const store = (window as any).__REDUX_STORE__
                if (!store) {
                    console.error('Redux store not available')
                    return
                }

                const state = store.getState()
                const focusedTab = state.global.tabs.find(
                    (t: any) => t.isActive
                )
                if (!focusedTab) {
                    console.error('No active tab')
                    return
                }

                // Dispatch action to insert text
                store.dispatch({
                    type: 'codemirror/insertText',
                    payload: { tabId: focusedTab.id, text },
                })
            },

            replaceSelection: (text: string) => {
                const store = (window as any).__REDUX_STORE__
                if (!store) {
                    console.error('Redux store not available')
                    return
                }

                const state = store.getState()
                const focusedTab = state.global.tabs.find(
                    (t: any) => t.isActive
                )
                if (!focusedTab) {
                    console.error('No active tab')
                    return
                }

                // Dispatch action to replace selection
                store.dispatch({
                    type: 'codemirror/replaceSelection',
                    payload: { tabId: focusedTab.id, text },
                })
            },

            // Workspace
            getWorkspacePath: () => {
                const store = (window as any).__REDUX_STORE__
                if (!store) return null

                const state = store.getState()
                return state.global.rootPath || null
            },

            readFile: async (path: string) => {
                // @ts-ignore
                if (window.connector?.getFile) {
                    // @ts-ignore
                    return await window.connector.getFile(path)
                }
                throw new Error('File system not available')
            },

            writeFile: async (path: string, content: string) => {
                // @ts-ignore
                if (window.connector?.saveFile) {
                    // @ts-ignore
                    await window.connector.saveFile({ path, data: content })
                } else {
                    throw new Error('File system not available')
                }
            },

            // AI Integration - Connect to actual chat system
            sendToAI: async (prompt: string) => {
                const store = (window as any).__REDUX_STORE__
                if (!store) {
                    throw new Error('Redux store not available')
                }

                console.log(` AI request from ${context.extensionId}:`, prompt)

                // Dispatch to AI chat system using the correct action
                store.dispatch({
                    type: 'chat/startNewMessage',
                    payload: { message: prompt },
                })

                // Return a simple acknowledgment
                // In a real implementation, you'd want to listen for the response
                return new Promise((resolve) => {
                    // For now, just acknowledge the message was sent
                    setTimeout(() => {
                        resolve(
                            'Message sent to AI. Check the chat panel for the response.'
                        )
                    }, 100)
                })
            },

            // Language Features
            registerCompletionProvider: (language: string, provider: any) => {
                if (!this.completionProviders.has(language)) {
                    this.completionProviders.set(language, [])
                }
                this.completionProviders.get(language)!.push(provider)
                console.log(`Registered completion provider for ${language}`)

                context.subscriptions.push({
                    dispose: () => {
                        const providers = this.completionProviders.get(language)
                        if (providers) {
                            const index = providers.indexOf(provider)
                            if (index > -1) providers.splice(index, 1)
                        }
                    },
                })
            },

            registerHoverProvider: (language: string, provider: any) => {
                if (!this.hoverProviders.has(language)) {
                    this.hoverProviders.set(language, [])
                }
                this.hoverProviders.get(language)!.push(provider)
                console.log(`Registered hover provider for ${language}`)

                context.subscriptions.push({
                    dispose: () => {
                        const providers = this.hoverProviders.get(language)
                        if (providers) {
                            const index = providers.indexOf(provider)
                            if (index > -1) providers.splice(index, 1)
                        }
                    },
                })
            },

            registerCodeActionProvider: (language: string, provider: any) => {
                if (!this.codeActionProviders.has(language)) {
                    this.codeActionProviders.set(language, [])
                }
                this.codeActionProviders.get(language)!.push(provider)
                console.log(` Registered code action provider for ${language}`)

                context.subscriptions.push({
                    dispose: () => {
                        const providers = this.codeActionProviders.get(language)
                        if (providers) {
                            const index = providers.indexOf(provider)
                            if (index > -1) providers.splice(index, 1)
                        }
                    },
                })
            },
        }
    }

    /**
     * Load and execute extension code
     */
    private async loadExtensionCode(
        extension: Extension,
        _context: ExtensionContext,
        api: ExtensionAPI
    ): Promise<void> {
        console.log(`Loading extension code for ${extension.name}`)

        // Check if extension has activation events
        if (extension.contributes) {
            // Auto-register commands from package.json
            if (extension.contributes.commands) {
                for (const command of extension.contributes.commands) {
                    console.log(
                        `Found command: ${command.command} - ${command.title}`
                    )
                }
            }
        }

        // Try to load the extension's main file
        if (extension.path) {
            try {
                // Read package.json to get the main entry point
                const packageJsonPath = `${extension.path}/package.json`
                // @ts-ignore
                const packageJsonContent = await window.connector?.getFile(
                    packageJsonPath
                )

                if (packageJsonContent) {
                    const packageJson = JSON.parse(packageJsonContent)
                    const mainFile = packageJson.main || packageJson.browser

                    if (mainFile) {
                        const mainFilePath = `${extension.path}/${mainFile}`
                        console.log(`Loading main file: ${mainFilePath}`)

                        // Read the extension's main JavaScript file
                        // @ts-ignore
                        const extensionCode = await window.connector?.getFile(
                            mainFilePath
                        )

                        if (extensionCode) {
                            try {
                                // Create a safe execution context for the extension
                                // Provide the extension API as 'vscode' for compatibility
                                const extensionModule = { exports: {} }
                                const moduleWrapper = new Function(
                                    'module',
                                    'exports',
                                    'require',
                                    'vscode',
                                    extensionCode
                                )

                                // Create a minimal require function
                                const requireFunc = (moduleName: string) => {
                                    if (moduleName === 'vscode') {
                                        return api
                                    }
                                    console.warn(
                                        `Extension tried to require '${moduleName}' which is not available`
                                    )
                                    return {}
                                }

                                // Execute the extension code
                                moduleWrapper(
                                    extensionModule,
                                    extensionModule.exports,
                                    requireFunc,
                                    api
                                )

                                // Call the activate function if it exists
                                const activate = (
                                    extensionModule.exports as any
                                ).activate
                                if (typeof activate === 'function') {
                                    console.log(
                                        `Calling activate() for ${extension.name}`
                                    )
                                    await activate(api)
                                } else {
                                    console.log(
                                        `No activate() function found in ${extension.name}`
                                    )
                                }
                            } catch (error) {
                                console.error(
                                    `Failed to execute extension code:`,
                                    error
                                )
                            }
                        }
                    } else {
                        console.log(
                            `  ℹ No main file specified in package.json`
                        )
                    }
                }
            } catch (error) {
                console.error(`Failed to load extension:`, error)
            }
        }
    }

    /**
     * Execute a command
     */
    async executeCommand(commandId: string, ...args: any[]): Promise<any> {
        const command = this.commands.get(commandId)
        if (!command) {
            throw new Error(`Command not found: ${commandId}`)
        }
        return await command(...args)
    }

    /**
     * Get all registered commands
     */
    getCommands(): string[] {
        return Array.from(this.commands.keys())
    }

    /**
     * Get completion providers for a language
     */
    getCompletionProviders(language: string): any[] {
        return this.completionProviders.get(language) || []
    }

    /**
     * Get hover providers for a language
     */
    getHoverProviders(language: string): any[] {
        return this.hoverProviders.get(language) || []
    }

    /**
     * Get code action providers for a language
     */
    getCodeActionProviders(language: string): any[] {
        return this.codeActionProviders.get(language) || []
    }

    /**
     * Get all active extensions
     */
    getActiveExtensions(): string[] {
        return Array.from(this.activeExtensions.keys())
    }
}

// Singleton instance
export const extensionActivationManager = new ExtensionActivationManager()

// Make it globally available
if (typeof window !== 'undefined') {
    ;(window as any).extensionActivationManager = extensionActivationManager
}
