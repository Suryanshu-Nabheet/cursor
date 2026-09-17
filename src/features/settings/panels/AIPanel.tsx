import { useCallback, useEffect, useState } from 'react'
import cx from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { useAppDispatch, useAppSelector } from '../../../app/hooks'
import type { AIProvider } from '../../ai/providers'
import { getInlineCompletionStatus } from '../../ai/inlineCompletion'
import type { Settings } from '../../window/state'
import * as ssel from '../settingsSelectors'
import { changeSettings } from '../settingsSlice'
import {
    AI_PROVIDERS,
    getProvider,
    getProviderModels,
    isProviderConfigured,
    providerSettingKeys,
} from '../providers'
import { Row, Section, Select, Toggle } from '../ui/controls'

export function AIPanel({ onSave }: { onSave?: () => void }) {
    const settings = useAppSelector(ssel.getSettings)
    const dispatch = useAppDispatch()
    const selectedProvider = (settings.aiProvider as AIProvider) || 'ollama'
    const inlineStatus = getInlineCompletionStatus(settings)
    const selected = getProvider(selectedProvider)

    return (
        <div className="settings-panel space-y-8">
            <Section
                title="AI Provider"
                description="Selecting a provider activates it immediately. Keys are saved only when you click Save."
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    {AI_PROVIDERS.map((p) => {
                        const isActive = selectedProvider === p.id
                        const configured = isProviderConfigured(p.id, settings)
                        const Logo = p.Logo
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() =>
                                    dispatch(
                                        changeSettings({ aiProvider: p.id })
                                    )
                                }
                                className={cx(
                                    'settings-provider-card',
                                    isActive && 'settings-provider-card--active'
                                )}
                            >
                                <div
                                    className={cx(
                                        'settings-provider-logo',
                                        isActive &&
                                            'settings-provider-logo--active'
                                    )}
                                >
                                    <Logo />
                                </div>
                                <span
                                    className={cx(
                                        'text-[12px] font-medium text-center leading-tight',
                                        isActive
                                            ? 'text-[var(--ui-fg)]'
                                            : 'text-[var(--ui-fg-muted)]'
                                    )}
                                >
                                    {p.name}
                                </span>
                                {configured && isActive && (
                                    <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </Section>

            <Section
                title="Configuration"
                description={
                    selected?.kind === 'local'
                        ? 'Connect to your local Ollama instance'
                        : 'Enter your API credentials (stored only on this machine)'
                }
            >
                {selectedProvider === 'ollama' ? (
                    <OllamaConfigPanel settings={settings} onSave={onSave} />
                ) : selected ? (
                    <ByokConfigPanel
                        providerId={selected.id}
                        settings={settings}
                        onSave={onSave}
                    />
                ) : null}
            </Section>

            <Section
                title="Chat & Git"
                description="How AI uses workspace context and git"
            >
                <div className="space-y-1">
                    <Row
                        label="Workspace context"
                        description="Include open files, diagnostics, and git status in chat prompts"
                    >
                        <Toggle
                            checked={settings.workspaceContextEnabled !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        workspaceContextEnabled: checked,
                                    })
                                )
                            }
                        />
                    </Row>
                    <Row
                        label="AI commit drafts"
                        description="Enable the AI Draft button in the Git pane"
                    >
                        <Toggle
                            checked={settings.aiCommitDraftEnabled !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        aiCommitDraftEnabled: checked,
                                    })
                                )
                            }
                        />
                    </Row>
                </div>
            </Section>

            <Section
                title="Inline Completion"
                description="Copilot-style AI ghost text while you type"
            >
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <span className="text-sm text-[var(--ui-fg)]">
                                Enable inline completion
                            </span>
                            <p className="text-xs text-[var(--ui-fg-muted)] mt-0.5">
                                Tab to accept · Esc to dismiss · ⌘⇧Space to
                                trigger
                            </p>
                        </div>
                        <Toggle
                            checked={settings.inlineCompletionEnabled !== false}
                            onChange={(checked: boolean) =>
                                dispatch(
                                    changeSettings({
                                        inlineCompletionEnabled: checked,
                                    })
                                )
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                                Trigger delay (ms)
                            </span>
                            <input
                                type="number"
                                min={120}
                                max={1500}
                                step={50}
                                value={settings.inlineCompletionDelay ?? 300}
                                onChange={(e) =>
                                    dispatch(
                                        changeSettings({
                                            inlineCompletionDelay:
                                                Number(e.target.value) || 300,
                                        })
                                    )
                                }
                                className="settings-field"
                            />
                        </label>
                        <label className="block">
                            <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                                Max tokens
                            </span>
                            <input
                                type="number"
                                min={24}
                                max={160}
                                step={16}
                                value={settings.inlineCompletionMaxTokens ?? 64}
                                onChange={(e) =>
                                    dispatch(
                                        changeSettings({
                                            inlineCompletionMaxTokens:
                                                Number(e.target.value) || 64,
                                        })
                                    )
                                }
                                className="settings-field"
                            />
                        </label>
                    </div>
                    <div className="settings-status-card">
                        <div className="flex items-center justify-between gap-3">
                            <span>Completion stack</span>
                            <span
                                className={cx(
                                    'font-medium',
                                    inlineStatus.enabled
                                        ? 'text-[var(--color-success)]'
                                        : 'text-[var(--color-warning)]'
                                )}
                            >
                                {inlineStatus.enabled
                                    ? 'AI ghost text enabled'
                                    : settings.inlineCompletionEnabled === false
                                    ? 'AI completion disabled'
                                    : 'AI completion unavailable'}
                            </span>
                        </div>
                        <p className="mt-1">
                            Inline suggestions use your configured provider. LSP
                            stays for diagnostics and navigation.{' '}
                            {inlineStatus.reason}.
                        </p>
                    </div>
                </div>
            </Section>
        </div>
    )
}

function OllamaConfigPanel({
    settings,
    onSave,
}: {
    settings: Settings
    onSave?: () => void
}) {
    const dispatch = useAppDispatch()
    const [baseUrl, setBaseUrl] = useState(
        settings.ollamaBaseUrl || 'http://localhost:11434'
    )
    const [selectedModel, setSelectedModel] = useState(
        settings.ollamaModel || ''
    )
    const [availableModels, setAvailableModels] = useState<string[]>([])
    const [isFetching, setIsFetching] = useState(false)
    const [fetchError, setFetchError] = useState('')

    useEffect(() => {
        setBaseUrl(settings.ollamaBaseUrl || 'http://localhost:11434')
        setSelectedModel(settings.ollamaModel || '')
    }, [settings.ollamaBaseUrl, settings.ollamaModel])

    const handleFetchModels = useCallback(async () => {
        setIsFetching(true)
        setFetchError('')
        try {
            const cleanUrl = baseUrl.replace(/\/$/, '')
            const res = await fetch(`${cleanUrl}/api/tags`)
            if (!res.ok) throw new Error('Failed to fetch models')
            const data = await res.json()
            const models =
                (data.models || []).map((m: { name: string }) => m.name) || []
            setAvailableModels(models)
            if (
                models.length > 0 &&
                (!selectedModel || !models.includes(selectedModel))
            ) {
                setSelectedModel(models[0])
                dispatch(
                    changeSettings({
                        aiProvider: 'ollama',
                        ollamaBaseUrl: cleanUrl,
                        ollamaModel: models[0],
                    })
                )
            }
        } catch {
            setFetchError('Could not connect to Ollama. Is it running?')
            setAvailableModels([])
        } finally {
            setIsFetching(false)
        }
    }, [baseUrl, selectedModel, dispatch])

    useEffect(() => {
        void handleFetchModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const persistUrl = () => {
        const cleanUrl = baseUrl.replace(/\/$/, '') || 'http://localhost:11434'
        dispatch(
            changeSettings({
                aiProvider: 'ollama',
                ollamaBaseUrl: cleanUrl,
            })
        )
        void handleFetchModels()
    }

    return (
        <div className="grid grid-cols-1 gap-5">
            <label className="block">
                <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                    Ollama Base URL
                </span>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        onBlur={persistUrl}
                        className="settings-field flex-1 font-mono"
                        placeholder="http://localhost:11434"
                    />
                    <div className="settings-conn-badge">
                        {isFetching ? (
                            <span className="animate-pulse">Connecting…</span>
                        ) : availableModels.length > 0 ? (
                            <span className="text-emerald-500 font-medium">
                                Connected
                            </span>
                        ) : (
                            <span>Offline</span>
                        )}
                    </div>
                </div>
                {fetchError && (
                    <p className="text-xs text-red-400 mt-2">{fetchError}</p>
                )}
            </label>

            <div>
                <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                    Selected Model
                </span>
                {availableModels.length > 0 ? (
                    <Select
                        value={selectedModel}
                        onChange={(val: string) => {
                            setSelectedModel(val)
                            dispatch(
                                changeSettings({
                                    aiProvider: 'ollama',
                                    ollamaBaseUrl: baseUrl.replace(/\/$/, ''),
                                    ollamaModel: val,
                                })
                            )
                        }}
                        options={availableModels}
                        fullWidth
                    />
                ) : (
                    <div className="settings-status-card flex items-center justify-between">
                        <span>
                            {fetchError
                                ? 'No models found'
                                : 'Scanning for models…'}
                        </span>
                        {fetchError && (
                            <button
                                type="button"
                                onClick={() => void handleFetchModels()}
                                className="text-[var(--accent)] hover:underline font-medium"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={() => {
                    dispatch(
                        changeSettings({
                            aiProvider: 'ollama',
                            ollamaBaseUrl: baseUrl.replace(/\/$/, ''),
                            ollamaModel: selectedModel,
                        })
                    )
                    onSave?.()
                }}
                className="settings-primary-btn"
            >
                Apply Ollama Settings
            </button>
        </div>
    )
}

function ByokConfigPanel({
    providerId,
    settings,
    onSave,
}: {
    providerId: AIProvider
    settings: Settings
    onSave?: () => void
}) {
    const dispatch = useAppDispatch()
    const provider = getProvider(providerId)!
    const keys = providerSettingKeys(provider.settingKeyCore)
    const models = getProviderModels(providerId)
    const [localAPIKey, setLocalAPIKey] = useState(
        (settings as any)[keys.apiKey] || ''
    )
    const [model, setModel] = useState(
        (settings as any)[keys.model] || models[0] || ''
    )
    const [showKey, setShowKey] = useState(false)

    useEffect(() => {
        setLocalAPIKey((settings as any)[keys.apiKey] || '')
        setModel((settings as any)[keys.model] || models[0] || '')
        setShowKey(false)
    }, [providerId])

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <label className="block">
                <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                    API Key
                </span>
                <div className="relative">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={localAPIKey}
                        onChange={(e) => setLocalAPIKey(e.target.value)}
                        className="settings-field w-full font-mono pr-10"
                        placeholder={`Enter ${provider.name} API key`}
                        autoComplete="off"
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ui-fg-muted)] hover:text-[var(--ui-fg)]"
                        aria-label={showKey ? 'Hide key' : 'Show key'}
                    >
                        <FontAwesomeIcon
                            icon={showKey ? faEyeSlash : faEye}
                            className="text-sm"
                        />
                    </button>
                </div>
            </label>

            <label className="block">
                <span className="block text-xs font-medium text-[var(--ui-fg)] mb-2">
                    Model
                </span>
                <Select
                    value={model}
                    onChange={(val: string) => {
                        setModel(val)
                        dispatch(
                            changeSettings({
                                aiProvider: providerId,
                                [keys.model]: val,
                            })
                        )
                    }}
                    options={models}
                    fullWidth
                />
            </label>

            <div className="sm:col-span-2">
                <button
                    type="button"
                    disabled={!localAPIKey.trim()}
                    onClick={() => {
                        if (!localAPIKey.trim()) return
                        dispatch(
                            changeSettings({
                                aiProvider: providerId,
                                [keys.model]: model,
                                [keys.apiKey]: localAPIKey,
                                [keys.useKey]: true,
                            })
                        )
                        onSave?.()
                    }}
                    className="settings-primary-btn"
                >
                    Save API Key
                </button>
            </div>
        </div>
    )
}
