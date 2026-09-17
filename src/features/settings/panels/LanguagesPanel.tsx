import { useState } from 'react'
import cx from 'classnames'
import { useAppDispatch, useAppSelector } from '../../../app/hooks'
import {
    installLanguageServer,
    runLanguageServer,
    stopLanguageServer,
} from '../../lsp/languageServerSlice'
import { languageServerStatus } from '../../lsp/languageServerSelector'
import { Section } from '../ui/controls'

export function LanguagesPanel({
    languageServerNames,
}: {
    languageServerNames: string[]
}) {
    return (
        <div className="settings-panel space-y-8">
            <Section
                title="Available Servers"
                description="Install and manage language servers for IntelliSense and diagnostics. Downloads run locally — failures show here."
            >
                {languageServerNames.length === 0 ? (
                    <div className="settings-status-card text-center py-8">
                        No language servers registered yet.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {languageServerNames.map((name) => (
                            <ServerRow key={name} languageName={name} />
                        ))}
                    </div>
                )}
            </Section>
        </div>
    )
}

function ServerRow({ languageName }: { languageName: string }) {
    const dispatch = useAppDispatch()
    const languageState = useAppSelector(languageServerStatus(languageName))
    const installed = !!(languageState && languageState.installed)
    const running = !!(languageState && languageState.running)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true)
        setError('')
        try {
            await action()
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'Language server action failed.'
            )
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="settings-server-row flex-col !items-stretch gap-2">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className={cx(
                            'w-2 h-2 rounded-full shrink-0',
                            running
                                ? 'bg-emerald-500'
                                : installed
                                ? 'bg-amber-500'
                                : 'bg-[var(--ui-border)]'
                        )}
                    />
                    <div className="min-w-0">
                        <span className="text-sm font-medium text-[var(--ui-fg)] truncate block">
                            {languageName}
                        </span>
                        <span className="text-[11px] text-[var(--ui-fg-muted)]">
                            {busy
                                ? 'Working…'
                                : running
                                ? 'Running'
                                : installed
                                ? 'Installed · stopped'
                                : 'Not installed'}
                        </span>
                    </div>
                </div>

                {!installed ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void run(() =>
                                dispatch(
                                    installLanguageServer(languageName)
                                ).unwrap()
                            )
                        }
                        className="settings-primary-btn settings-primary-btn--sm"
                    >
                        Install
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void run(() =>
                                dispatch(
                                    running
                                        ? stopLanguageServer(languageName)
                                        : runLanguageServer(languageName)
                                ).unwrap()
                            )
                        }
                        className={cx(
                            'settings-ghost-btn',
                            running
                                ? 'settings-ghost-btn--danger'
                                : 'settings-ghost-btn--success'
                        )}
                    >
                        {running ? 'Stop' : 'Start'}
                    </button>
                )}
            </div>
            {error && <p className="text-xs text-red-400 px-1">{error}</p>}
        </div>
    )
}
