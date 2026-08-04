import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import {
    APP_VERSION,
    AUTHOR_GITHUB_DISPLAY,
    AUTHOR_GITHUB_URL,
    AUTHOR_LINKEDIN_DISPLAY,
    AUTHOR_LINKEDIN_URL,
    GITHUB_DISPLAY,
    GITHUB_URL,
} from '../constants'
import { Section } from '../ui/controls'

export function AboutPanel() {
    return (
        <div className="settings-panel settings-panel--about space-y-10">
            <Section
                title="Cursor IDE"
                description="Local-first editor with Bring Your Own Key AI"
            >
                <div className="settings-about-card">
                    <AboutRow
                        title="Version"
                        subtitle="Product build"
                        value={APP_VERSION}
                        mono
                    />
                    <div className="settings-divider" />
                    <AboutRow
                        title="License"
                        subtitle="Open source"
                        value="MIT"
                    />
                    <div className="settings-divider" />
                    <AboutRow
                        title="AI"
                        subtitle="Keys stay on your machine — Ollama by default"
                        value={
                            <span className="settings-byok-badge">BYOK</span>
                        }
                    />
                </div>
            </Section>

            <Section title="Author" description="Suryanshu Nabheet">
                <div className="settings-link-stack">
                    <a
                        href={AUTHOR_GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="settings-link-row"
                    >
                        <div>
                            <p className="text-sm font-medium text-[var(--ui-fg)]">
                                GitHub
                            </p>
                            <p className="text-xs text-[var(--ui-fg-muted)] mt-1">
                                {AUTHOR_GITHUB_DISPLAY}
                            </p>
                        </div>
                        <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="text-xs text-[var(--ui-fg-muted)]"
                        />
                    </a>
                    <a
                        href={AUTHOR_LINKEDIN_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="settings-link-row"
                    >
                        <div>
                            <p className="text-sm font-medium text-[var(--ui-fg)]">
                                LinkedIn
                            </p>
                            <p className="text-xs text-[var(--ui-fg-muted)] mt-1">
                                {AUTHOR_LINKEDIN_DISPLAY}
                            </p>
                        </div>
                        <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="text-xs text-[var(--ui-fg-muted)]"
                        />
                    </a>
                </div>
            </Section>

            <Section title="Project" description="Source and copyright">
                <div className="settings-link-stack">
                    <a
                        href={GITHUB_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="settings-link-row"
                    >
                        <div>
                            <p className="text-sm font-medium text-[var(--ui-fg)]">
                                Repository
                            </p>
                            <p className="text-xs text-[var(--ui-fg-muted)] mt-1">
                                {GITHUB_DISPLAY}
                            </p>
                        </div>
                        <FontAwesomeIcon
                            icon={faArrowUpRightFromSquare}
                            className="text-xs text-[var(--ui-fg-muted)]"
                        />
                    </a>
                </div>
                <p className="text-xs text-[var(--ui-fg-muted)] px-1 mt-4">
                    Copyright (c) 2026 Suryanshu Nabheet
                </p>
            </Section>
        </div>
    )
}

function AboutRow({
    title,
    subtitle,
    value,
    mono,
}: {
    title: string
    subtitle: string
    value: React.ReactNode
    mono?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-6 py-1">
            <div className="min-w-0 pr-4">
                <p className="text-sm font-semibold text-[var(--ui-fg)]">
                    {title}
                </p>
                <p className="text-xs text-[var(--ui-fg-muted)] mt-1 leading-relaxed">
                    {subtitle}
                </p>
            </div>
            {typeof value === 'string' ? (
                <span
                    className={
                        mono
                            ? 'font-mono text-sm text-[var(--ui-fg)] shrink-0'
                            : 'text-sm text-[var(--ui-fg)] shrink-0'
                    }
                >
                    {value}
                </span>
            ) : (
                value
            )}
        </div>
    )
}
