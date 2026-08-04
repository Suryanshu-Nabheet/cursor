import cx from 'classnames'
import { Switch, Listbox } from '@headlessui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import type { ReactNode } from 'react'
import { Codicon } from '../../../components/codicon'

export function NavItem({
    icon,
    label,
    isActive,
    onClick,
}: {
    icon: string
    label: string
    isActive: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors',
                isActive
                    ? 'bg-[var(--sidebar-selected)] text-[var(--ui-fg)] font-medium'
                    : 'text-[var(--ui-fg-muted)] hover:text-[var(--ui-fg)] hover:bg-[var(--sidebar-hover)]'
            )}
        >
            <Codicon
                name={icon}
                style={{
                    fontSize: 15,
                    width: 15,
                    height: 15,
                    // Same rule for every tab: muted when idle, accent only when active
                    color: isActive ? 'var(--accent)' : 'currentColor',
                    opacity: 1,
                }}
            />
            <span>{label}</span>
        </button>
    )
}

export function Section({ title, description, children }: any) {
    return (
        <div>
            <div className="mb-5">
                <h3 className="text-sm font-semibold text-[var(--ui-fg)] mb-1">
                    {title}
                </h3>
                {description && (
                    <p className="text-xs text-[var(--ui-fg-muted)]">
                        {description}
                    </p>
                )}
            </div>
            {children}
        </div>
    )
}

export function Row({
    label,
    description,
    children,
}: {
    label: string
    description?: string
    children: ReactNode
}) {
    return (
        <div className="settings-row">
            <div className="settings-row__label">
                <span className="text-sm text-[var(--ui-fg)]">{label}</span>
                {description && (
                    <p className="text-xs text-[var(--ui-fg-muted)] mt-0.5 leading-snug">
                        {description}
                    </p>
                )}
            </div>
            <div className="settings-row__control">{children}</div>
        </div>
    )
}

export function ThemeCard({
    label,
    color,
    isActive,
    onClick,
}: {
    label: string
    color: string
    isActive: boolean
    onClick: () => void
}) {
    const isLight = color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#fff'
    return (
        <button
            type="button"
            onClick={onClick}
            className={cx(
                'flex flex-col gap-2 p-2.5 rounded-lg border transition-colors text-left',
                isActive
                    ? 'bg-[var(--sidebar-selected)] border-[var(--accent)]'
                    : 'bg-[var(--ui-bg-elevated)] border-[var(--ui-border)] hover:bg-[var(--ui-hover)]'
            )}
        >
            <div
                className="w-full h-12 rounded-md border border-[var(--ui-border-subtle)] overflow-hidden relative"
                style={{ backgroundColor: color }}
            >
                {/* Mini chrome so light themes aren't a flat white slab */}
                <div
                    className="absolute inset-x-0 top-0 h-3 flex items-center gap-1 px-1.5"
                    style={{
                        backgroundColor: isLight
                            ? 'rgba(0,0,0,0.06)'
                            : 'rgba(255,255,255,0.06)',
                    }}
                >
                    <span
                        className="w-1 h-1 rounded-full"
                        style={{
                            backgroundColor: isLight
                                ? 'rgba(0,0,0,0.25)'
                                : 'rgba(255,255,255,0.35)',
                        }}
                    />
                    <span
                        className="w-1 h-1 rounded-full"
                        style={{
                            backgroundColor: isLight
                                ? 'rgba(0,0,0,0.18)'
                                : 'rgba(255,255,255,0.25)',
                        }}
                    />
                </div>
                <div
                    className="absolute left-0 top-3 bottom-0 w-3"
                    style={{
                        backgroundColor: isLight
                            ? 'rgba(0,0,0,0.04)'
                            : 'rgba(255,255,255,0.04)',
                    }}
                />
            </div>
            <div className="flex items-center justify-between gap-1 px-0.5">
                <span
                    className={cx(
                        'text-[11px] font-medium truncate',
                        isActive
                            ? 'text-[var(--accent)]'
                            : 'text-[var(--ui-fg-muted)]'
                    )}
                >
                    {label}
                </span>
                {isActive && (
                    <FontAwesomeIcon
                        icon={faCheck}
                        className="text-[var(--accent)] text-[10px] shrink-0"
                    />
                )}
            </div>
        </button>
    )
}

export function Select({ value, onChange, options, fullWidth = false }: any) {
    const selected =
        typeof value === 'object'
            ? value
            : options.find((o: any) => o === value || o.id === value) || value
    const displayValue = typeof selected === 'object' ? selected.name : selected

    return (
        <Listbox value={value} onChange={onChange}>
            <div
                className={cx(
                    'relative settings-select',
                    fullWidth ? 'w-full' : 'settings-select--inline'
                )}
            >
                <Listbox.Button className="relative w-full cursor-default rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] py-2.5 pl-4 pr-10 text-left text-sm text-[var(--input-fg)] focus:outline-none focus:border-[var(--accent)] hover:bg-[var(--ui-hover)] transition-colors">
                    <span className="block truncate">{displayValue}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--ui-fg-muted)]">
                        <FontAwesomeIcon
                            icon={faChevronDown}
                            className="text-xs"
                        />
                    </span>
                </Listbox.Button>
                <Listbox.Options className="absolute z-50 mt-2 max-h-48 w-full overflow-auto rounded-lg bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)] py-1 text-sm shadow-2xl focus:outline-none">
                    {options.map((option: any, idx: number) => {
                        const optValue =
                            typeof option === 'object' ? option.id : option
                        const optLabel =
                            typeof option === 'object' ? option.name : option
                        return (
                            <Listbox.Option
                                key={idx}
                                className={({ active }) =>
                                    `relative cursor-pointer select-none py-2.5 pl-4 pr-4 transition-colors ${
                                        active
                                            ? 'bg-[var(--sidebar-selected)] text-[var(--ui-fg)]'
                                            : 'text-[var(--ui-fg-muted)]'
                                    }`
                                }
                                value={optValue}
                            >
                                {({ selected }) => (
                                    <span
                                        className={`block truncate ${
                                            selected
                                                ? 'font-medium text-[var(--accent)]'
                                                : 'font-normal'
                                        }`}
                                    >
                                        {optLabel}
                                    </span>
                                )}
                            </Listbox.Option>
                        )
                    })}
                </Listbox.Options>
            </div>
        </Listbox>
    )
}

export function Toggle({ checked, onChange }: any) {
    return (
        <Switch
            checked={checked}
            onChange={onChange}
            className={`${
                checked ? 'bg-[var(--accent)]' : 'bg-[var(--ui-bg-subtle)]'
            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
        >
            <span
                className={`${
                    checked ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm`}
            />
        </Switch>
    )
}
