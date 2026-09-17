import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import {
    fetchPopularExtensions,
    searchExtensions,
    setSearchQuery,
    installExtension,
    uninstallExtension,
} from '../features/extensions/extensionsSlice'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faSearch,
    faCube,
    faSpinner,
    faDownload,
    faTrash,
    faCheck,
    faStar,
    faCode,
    faPaintBrush,
    faTools,
    faFont,
    faKeyboard,
    faLanguage,
} from '@fortawesome/free-solid-svg-icons'

const CATEGORIES = [
    { label: 'All', icon: faCode, value: '' },
    { label: 'Themes', icon: faPaintBrush, value: 'Themes' },
    { label: 'Language', icon: faLanguage, value: 'Programming Languages' },
    { label: 'Snippets', icon: faFont, value: 'Snippets' },
    { label: 'Linters', icon: faTools, value: 'Linters' },
    { label: 'Keymaps', icon: faKeyboard, value: 'Keymaps' },
]

function formatDownloads(count?: number): string {
    if (!count) return ''
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`
    return String(count)
}

function StarRating({ rating }: { rating?: number }) {
    if (!rating) return null
    const stars = Math.round(rating)
    return (
        <div className="ext-stars" title={`${rating.toFixed(1)} / 5`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <FontAwesomeIcon
                    key={i}
                    icon={faStar}
                    className={
                        i <= stars
                            ? 'ext-star ext-star--filled'
                            : 'ext-star ext-star--empty'
                    }
                />
            ))}
        </div>
    )
}

export const ExtensionsPane: React.FC = () => {
    const dispatch = useAppDispatch()
    const { available, installed, isSearching, searchQuery } = useAppSelector(
        (state: any) => state.extensionsState
    )
    const [selectedCategory, setSelectedCategory] = useState('')
    const [installingId, setInstallingId] = useState<string | null>(null)
    const [uninstallingId, setUninstallingId] = useState<string | null>(null)
    const [installedRecently, setInstalledRecently] = useState<Set<string>>(
        new Set()
    )
    const [activeTab, setActiveTab] = useState<'marketplace' | 'installed'>(
        'marketplace'
    )

    useEffect(() => {
        dispatch(fetchPopularExtensions())
    }, [dispatch])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        dispatch(searchExtensions(searchQuery))
    }

    const handleCategoryClick = (value: string) => {
        setSelectedCategory(value)
        if (value) {
            dispatch(searchExtensions(value))
        } else {
            dispatch(fetchPopularExtensions())
        }
    }

    const handleInstall = async (ext: any, e: React.MouseEvent) => {
        e.stopPropagation()
        const id = ext.extensionId || ext.id
        setInstallingId(id)
        try {
            await dispatch(installExtension(ext)).unwrap()
            setInstalledRecently((prev) => new Set([...prev, id]))
            setTimeout(() => {
                setInstalledRecently((prev) => {
                    const next = new Set(prev)
                    next.delete(id)
                    return next
                })
            }, 3000)
        } catch (e) {
            // Ignore
        } finally {
            setInstallingId(null)
        }
    }

    const handleUninstall = async (extId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setUninstallingId(extId)
        try {
            await dispatch(uninstallExtension(extId)).unwrap()
        } catch (e) {
            // Ignore
        } finally {
            setUninstallingId(null)
        }
    }

    const installedList = Object.values(installed) as any[]

    const filteredAvailable = available.filter((ext: any) => {
        if (!selectedCategory) return true
        const cats = ext.categories || []
        return cats.some((c: string) =>
            c.toLowerCase().includes(selectedCategory.toLowerCase())
        )
    })

    const displayList =
        activeTab === 'installed' ? installedList : filteredAvailable

    return (
        <div className="ext-pane">
            {/* Header */}
            <div className="ext-pane__header">
                <span className="ext-pane__title">Extensions</span>
                <div className="ext-pane__tabs">
                    <button
                        className={`ext-tab ${
                            activeTab === 'marketplace' ? 'ext-tab--active' : ''
                        }`}
                        onClick={() => setActiveTab('marketplace')}
                    >
                        Marketplace
                    </button>
                    <button
                        className={`ext-tab ${
                            activeTab === 'installed' ? 'ext-tab--active' : ''
                        }`}
                        onClick={() => setActiveTab('installed')}
                    >
                        Installed
                        {installedList.length > 0 && (
                            <span className="ext-badge">
                                {installedList.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="ext-search-wrap">
                <form onSubmit={handleSearch} className="ext-search-form">
                    <FontAwesomeIcon
                        icon={faSearch}
                        className="ext-search-icon"
                    />
                    <input
                        className="ext-search-input"
                        placeholder="Search extensions..."
                        value={searchQuery}
                        onChange={(e) =>
                            dispatch(setSearchQuery(e.target.value))
                        }
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            className="ext-search-clear"
                            onClick={() => {
                                dispatch(setSearchQuery(''))
                                dispatch(fetchPopularExtensions())
                            }}
                        >
                            ×
                        </button>
                    )}
                </form>
            </div>

            {/* Categories - only show on marketplace tab */}
            {activeTab === 'marketplace' && (
                <div className="ext-categories">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.value}
                            className={`ext-category-chip ${
                                selectedCategory === cat.value
                                    ? 'ext-category-chip--active'
                                    : ''
                            }`}
                            onClick={() => handleCategoryClick(cat.value)}
                        >
                            <FontAwesomeIcon
                                icon={cat.icon}
                                className="ext-category-chip-icon"
                            />
                            {cat.label}
                        </button>
                    ))}
                </div>
            )}

            {/* List */}
            <div className="ext-list">
                {isSearching ? (
                    <div className="ext-loading">
                        <FontAwesomeIcon icon={faSpinner} spin />
                        <span>Searching...</span>
                    </div>
                ) : displayList.length === 0 ? (
                    <div className="ext-empty">
                        <FontAwesomeIcon
                            icon={faCube}
                            className="ext-empty-icon"
                        />
                        <span>
                            {activeTab === 'installed'
                                ? 'No extensions installed'
                                : 'No extensions found'}
                        </span>
                    </div>
                ) : (
                    displayList.map((ext: any) => {
                        const id = ext.extensionId || ext.id
                        const isInstalled = !!installed[id]
                        const isInstalling = installingId === id
                        const isUninstalling = uninstallingId === id
                        const justInstalled = installedRecently.has(id)

                        return (
                            <div key={id} className="ext-item">
                                <div className="ext-item__icon-wrap">
                                    {ext.files?.icon ? (
                                        <img
                                            src={ext.files.icon}
                                            alt=""
                                            className="ext-item__icon-img"
                                            onError={(e) => {
                                                ;(
                                                    e.target as HTMLImageElement
                                                ).style.display = 'none'
                                            }}
                                        />
                                    ) : (
                                        <div className="ext-item__icon-placeholder">
                                            <FontAwesomeIcon icon={faCube} />
                                        </div>
                                    )}
                                </div>

                                <div className="ext-item__info">
                                    <div className="ext-item__top-row">
                                        <span className="ext-item__name">
                                            {ext.displayName || ext.name}
                                        </span>
                                        {isInstalled && !justInstalled && (
                                            <span className="ext-installed-badge">
                                                Installed
                                            </span>
                                        )}
                                        {justInstalled && (
                                            <span className="ext-installed-badge ext-installed-badge--new">
                                                Installed
                                            </span>
                                        )}
                                    </div>
                                    <span className="ext-item__publisher">
                                        {ext.publisher}
                                    </span>
                                    <span className="ext-item__desc">
                                        {ext.description}
                                    </span>

                                    <div className="ext-item__meta">
                                        {(ext.averageRating || ext.rating) && (
                                            <StarRating
                                                rating={
                                                    ext.averageRating ||
                                                    ext.rating
                                                }
                                            />
                                        )}
                                        {(ext.downloadCount ||
                                            ext.downloads) && (
                                            <span className="ext-meta-stat">
                                                <FontAwesomeIcon
                                                    icon={faDownload}
                                                    className="ext-meta-icon"
                                                />
                                                {formatDownloads(
                                                    ext.downloadCount ||
                                                        ext.downloads
                                                )}
                                            </span>
                                        )}
                                        {ext.version && (
                                            <span className="ext-meta-version">
                                                v{ext.version}
                                            </span>
                                        )}
                                    </div>

                                    <div className="ext-item__actions">
                                        {isInstalled ? (
                                            <button
                                                className="ext-btn ext-btn--uninstall"
                                                onClick={(e) =>
                                                    handleUninstall(id, e)
                                                }
                                                disabled={isUninstalling}
                                                title="Uninstall extension"
                                            >
                                                {isUninstalling ? (
                                                    <>
                                                        <FontAwesomeIcon
                                                            icon={faSpinner}
                                                            spin
                                                        />{' '}
                                                        Removing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <FontAwesomeIcon
                                                            icon={faTrash}
                                                        />{' '}
                                                        Uninstall
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                className="ext-btn ext-btn--install"
                                                onClick={(e) =>
                                                    handleInstall(ext, e)
                                                }
                                                disabled={isInstalling}
                                                title="Install extension"
                                            >
                                                {isInstalling ? (
                                                    <>
                                                        <FontAwesomeIcon
                                                            icon={faSpinner}
                                                            spin
                                                        />{' '}
                                                        Installing...
                                                    </>
                                                ) : justInstalled ? (
                                                    <>
                                                        <FontAwesomeIcon
                                                            icon={faCheck}
                                                        />{' '}
                                                        Installed
                                                    </>
                                                ) : (
                                                    <>
                                                        <FontAwesomeIcon
                                                            icon={faDownload}
                                                        />{' '}
                                                        Install
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
