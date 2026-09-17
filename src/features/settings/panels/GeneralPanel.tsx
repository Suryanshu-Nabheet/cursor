import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons'
import type { AppDispatch } from '../../../app/store'
import type { Settings } from '../../window/state'
import { changeSettings } from '../settingsSlice'
import { CURATED_THEMES, FONT_FAMILIES } from '../constants'
import { Row, Section, Select, ThemeCard, Toggle } from '../ui/controls'

export function GeneralPanel({
    settings,
    dispatch,
}: {
    settings: Settings
    dispatch: AppDispatch
}) {
    const tabSize = settings.tabSize || '4'
    const insertSpaces = settings.insertSpaces !== false

    return (
        <div className="settings-panel space-y-8">
            <Section
                title="Color Theme"
                description="Editor and app chrome color scheme"
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CURATED_THEMES.map((theme) => (
                        <ThemeCard
                            key={theme.value}
                            label={theme.label}
                            color={theme.color}
                            isActive={
                                (settings.theme || 'cursor-dark') ===
                                theme.value
                            }
                            onClick={() =>
                                dispatch(changeSettings({ theme: theme.value }))
                            }
                        />
                    ))}
                </div>
            </Section>

            <Section title="Font" description="Applies to editor and terminal">
                <div className="space-y-1">
                    <Row label="Font Family">
                        <Select
                            value={settings.fontFamily || 'JetBrains Mono'}
                            onChange={(val: string) =>
                                dispatch(changeSettings({ fontFamily: val }))
                            }
                            options={[...FONT_FAMILIES]}
                        />
                    </Row>

                    <Row label="Font Size">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                className="settings-stepper-btn"
                                onClick={() => {
                                    const current = parseInt(
                                        settings.fontSize || '13'
                                    )
                                    if (current > 8)
                                        dispatch(
                                            changeSettings({
                                                fontSize: String(current - 1),
                                            })
                                        )
                                }}
                            >
                                <FontAwesomeIcon
                                    icon={faMinus}
                                    className="text-xs"
                                />
                            </button>
                            <span className="w-16 text-center font-mono text-sm text-[var(--ui-fg)]">
                                {settings.fontSize || '13'}px
                            </span>
                            <button
                                type="button"
                                className="settings-stepper-btn"
                                onClick={() => {
                                    const current = parseInt(
                                        settings.fontSize || '13'
                                    )
                                    if (current < 48)
                                        dispatch(
                                            changeSettings({
                                                fontSize: String(current + 1),
                                            })
                                        )
                                }}
                            >
                                <FontAwesomeIcon
                                    icon={faPlus}
                                    className="text-xs"
                                />
                            </button>
                        </div>
                    </Row>
                </div>
            </Section>

            <Section
                title="Editor"
                description="Editing behavior and on-screen chrome"
            >
                <div className="space-y-1">
                    <Row label="Key Bindings">
                        <Select
                            value={settings.keyBindings || 'none'}
                            onChange={(val: string) =>
                                dispatch(
                                    changeSettings({
                                        keyBindings:
                                            val as Settings['keyBindings'],
                                    })
                                )
                            }
                            options={[
                                { id: 'none', name: 'Default' },
                                { id: 'vim', name: 'Vim' },
                                { id: 'emacs', name: 'Emacs' },
                            ]}
                        />
                    </Row>

                    <Row
                        label="Word Wrap"
                        description="Wrap long lines instead of horizontal scroll"
                    >
                        <Toggle
                            checked={settings.textWrapping === 'enabled'}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        textWrapping: checked
                                            ? 'enabled'
                                            : 'disabled',
                                    })
                                )
                            }
                        />
                    </Row>

                    <Row label="Line Numbers">
                        <Toggle
                            checked={settings.showLineNumbers !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        showLineNumbers: checked,
                                    })
                                )
                            }
                        />
                    </Row>

                    <Row
                        label="Highlight Active Line"
                        description="Emphasize the line with the cursor"
                    >
                        <Toggle
                            checked={settings.highlightActiveLine !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        highlightActiveLine: checked,
                                    })
                                )
                            }
                        />
                    </Row>

                    <Row
                        label="Indent Guides"
                        description="Vertical markers for indentation levels"
                    >
                        <Toggle
                            checked={settings.showIndentGuides !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        showIndentGuides: checked,
                                    })
                                )
                            }
                        />
                    </Row>

                    <Row
                        label="Scrollbar Diagnostics"
                        description="Error/warning markers on the editor scrollbar"
                    >
                        <Toggle
                            checked={
                                settings.showScrollbarDiagnostics !== false
                            }
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        showScrollbarDiagnostics: checked,
                                    })
                                )
                            }
                        />
                    </Row>
                </div>
            </Section>

            <Section
                title="Indentation"
                description="Controls Tab and auto-indent. Detect Indentation overrides Tab Size when on."
            >
                <div className="space-y-1">
                    <Row label="Tab Size">
                        <Select
                            value={tabSize}
                            onChange={(val: string) =>
                                dispatch(changeSettings({ tabSize: val }))
                            }
                            options={['2', '4', '8']}
                        />
                    </Row>

                    <Row
                        label="Insert Spaces"
                        description={
                            insertSpaces
                                ? `Tab inserts ${tabSize} spaces`
                                : 'Tab inserts a real tab character'
                        }
                    >
                        <Toggle
                            checked={insertSpaces}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({ insertSpaces: checked })
                                )
                            }
                        />
                    </Row>

                    <Row
                        label="Detect Indentation"
                        description="Use the open file’s indent style instead of Tab Size"
                    >
                        <Toggle
                            checked={settings.detectIndentation === true}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        detectIndentation: checked,
                                    })
                                )
                            }
                        />
                    </Row>
                </div>
            </Section>

            <Section
                title="Files"
                description="How unsaved buffers are written to disk"
            >
                <div className="space-y-1">
                    <Row
                        label="Auto Save"
                        description="Save after you stop typing (Cmd/Ctrl+S still works)"
                    >
                        <Select
                            value={settings.autoSave || 'off'}
                            onChange={(val: string) =>
                                dispatch(
                                    changeSettings({
                                        autoSave: val as Settings['autoSave'],
                                    })
                                )
                            }
                            options={[
                                { id: 'off', name: 'Off' },
                                { id: 'afterDelay', name: 'After delay' },
                            ]}
                        />
                    </Row>

                    {settings.autoSave === 'afterDelay' && (
                        <Row label="Auto Save Delay">
                            <Select
                                value={String(settings.autoSaveDelay ?? 1000)}
                                onChange={(val: string) =>
                                    dispatch(
                                        changeSettings({
                                            autoSaveDelay: Number(val) || 1000,
                                        })
                                    )
                                }
                                options={[
                                    { id: '500', name: '0.5 s' },
                                    { id: '1000', name: '1 s' },
                                    { id: '2000', name: '2 s' },
                                    { id: '5000', name: '5 s' },
                                ]}
                            />
                        </Row>
                    )}
                </div>
            </Section>
        </div>
    )
}
