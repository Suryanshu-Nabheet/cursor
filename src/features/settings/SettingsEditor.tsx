import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../../app/hooks'
import { Codicon } from '../../components/codicon'
import { closeError } from '../globalSlice'
import { getLanguages } from '../lsp/languageServerSelector'
import { SETTINGS_TABS } from './constants'
import { AboutPanel } from './panels/AboutPanel'
import { AIPanel } from './panels/AIPanel'
import { GeneralPanel } from './panels/GeneralPanel'
import { LanguagesPanel } from './panels/LanguagesPanel'
import * as ssel from './settingsSelectors'
import { setSettingsTab, toggleSettings } from './settingsSlice'
import type { SettingsTab } from './types'
import { NavItem } from './ui/controls'

/**
 * In-editor Settings (VS Code style) — replaces the modal popup.
 * Renders inside the editor pane area when settingsState.isOpen.
 */
export function SettingsEditor() {
    const dispatch = useAppDispatch()
    const settings = useAppSelector(ssel.getSettings)
    const activeTab = useAppSelector(ssel.getActiveSettingsTab) as SettingsTab
    const languageServerNames = useAppSelector(getLanguages)
    const tabMeta =
        SETTINGS_TABS.find((t) => t.id === activeTab) || SETTINGS_TABS[0]

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                dispatch(toggleSettings())
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [dispatch])

    return (
        <div className="settings-editor" role="main" aria-label="Settings">
            <aside className="settings-editor__nav">
                <div className="settings-editor__nav-header">
                    <span className="settings-editor__nav-title">Settings</span>
                </div>
                <nav className="settings-editor__nav-list">
                    {SETTINGS_TABS.map((tab) => (
                        <NavItem
                            key={tab.id}
                            icon={tab.icon}
                            label={tab.label}
                            isActive={activeTab === tab.id}
                            onClick={() => dispatch(setSettingsTab(tab.id))}
                        />
                    ))}
                </nav>
            </aside>

            <div className="settings-editor__main">
                <header className="settings-editor__header">
                    <div className="min-w-0">
                        <h1 className="settings-editor__title">
                            {tabMeta.title}
                        </h1>
                        <p className="settings-editor__subtitle">
                            {tabMeta.description}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => dispatch(toggleSettings())}
                        className="settings-editor__close"
                        aria-label="Close settings"
                    >
                        <Codicon name="close" style={{ fontSize: 16 }} />
                    </button>
                </header>

                <div className="settings-editor__body">
                    {activeTab === 'General' && (
                        <GeneralPanel settings={settings} dispatch={dispatch} />
                    )}
                    {activeTab === 'AI' && (
                        <AIPanel onSave={() => dispatch(closeError())} />
                    )}
                    {activeTab === 'Languages' && (
                        <LanguagesPanel
                            languageServerNames={languageServerNames}
                        />
                    )}
                    {activeTab === 'About' && <AboutPanel />}
                </div>
            </div>
        </div>
    )
}
