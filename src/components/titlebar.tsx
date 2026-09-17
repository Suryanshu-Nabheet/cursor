import * as gs from '../features/globalSlice'
import * as gt from '../features/globalThunks'
import * as cs from '../features/chat/chatSlice'
import * as ss from '../features/settings/settingsSlice'
import * as ts from '../features/tools/toolSlice'
import * as csel from '../features/chat/chatSelectors'
import * as gsel from '../features/selectors'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import { useEffect, useState } from 'react'
import SearchFiles from './searchFiles'
import { Codicon } from './codicon'

function Menu({
    title,
    options,
    open,
    onClick,
}: {
    title: string
    options: [string, () => void, string?][]
    open: boolean
    onClick: () => void
}) {
    return (
        <div className="menu" onClick={onClick}>
            {title}
            {open && (
                <div className="menu__options">
                    {options.map(([action, callback, accelerator], index) => (
                        <div
                            className="menu__option"
                            key={index}
                            onClick={callback}
                        >
                            {action}
                            {accelerator && (
                                <div className="menu__option__accelerator">
                                    {accelerator}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function MenuBar() {
    const dispatch = useAppDispatch()
    const [openMenu, setOpenMenu] = useState(-1)

    // if theres a click somewhere off screen
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (e.target instanceof HTMLElement) {
                if (!e.target.closest('.menuGroup')) {
                    setOpenMenu(-1)
                }
            }
        }
        window.addEventListener('click', handleClick)
        return () => {
            window.removeEventListener('click', handleClick)
        }
    }, [])

    return (
        <div className="menuGroup">
            <Menu
                title="File"
                options={[
                    [
                        'New File',
                        () => {
                            dispatch(gs.newFile({ parentFolderId: null }))
                        },
                        connector.PLATFORM_META_KEY + 'N',
                    ],
                    [
                        'Open Folder',
                        () => {
                            dispatch(gs.openFolder(null))
                        },
                        connector.PLATFORM_META_KEY + 'O',
                    ],
                    [
                        'Open SSH Folder',
                        () => {
                            dispatch(gs.openRemotePopup())
                        },
                        '',
                    ],
                    [
                        'Save File',
                        () => {
                            dispatch(gs.saveFile(null))
                        },
                        connector.PLATFORM_META_KEY + 'S',
                    ],
                    [
                        'Close Tab',
                        () => {
                            dispatch(gt.closeTab(null))
                        },
                        connector.PLATFORM_META_KEY + 'W',
                    ],
                ]}
                open={openMenu === 0}
                onClick={() => {
                    if (openMenu !== 0) setOpenMenu(0)
                    else setOpenMenu(-1)
                }}
            />

            <Menu
                title="Edit"
                options={[
                    [
                        'Cut',
                        () => {
                            document.execCommand('cut')
                        },
                        connector.PLATFORM_META_KEY + 'X',
                    ],
                    [
                        'Copy',
                        () => {
                            document.execCommand('copy')
                        },
                        connector.PLATFORM_META_KEY + 'C',
                    ],
                    [
                        'Paste',
                        () => {
                            document.execCommand('paste')
                        },
                        connector.PLATFORM_META_KEY + 'V',
                    ],
                    [
                        'Select All',
                        () => {
                            document.execCommand('selectAll')
                        },
                        connector.PLATFORM_META_KEY + 'A',
                    ],
                ]}
                open={openMenu === 1}
                onClick={() => {
                    if (openMenu !== 1) setOpenMenu(1)
                    else setOpenMenu(-1)
                }}
            />

            <Menu
                title="View"
                options={[
                    [
                        'Zoom In',
                        () => {
                            connector.zoomIn()
                        },
                        connector.PLATFORM_META_KEY + 'plus',
                    ],
                    [
                        'Zoom Out',
                        () => {
                            connector.zoomOut()
                        },
                        connector.PLATFORM_META_KEY + 'minus',
                    ],
                    [
                        'Reset Zoom',
                        () => {
                            connector.zoomReset()
                        },
                        connector.PLATFORM_META_KEY + '0',
                    ],
                    [
                        'Search',
                        () => {
                            dispatch(ts.openSearch())
                        },
                        connector.PLATFORM_META_KEY + 'shift+f',
                    ],
                    [
                        'File Search',
                        () => {
                            dispatch(ts.triggerFileSearch())
                        },
                        connector.PLATFORM_META_KEY + 'p',
                    ],
                    [
                        'Command Palette',
                        () => {
                            dispatch(ts.triggerCommandPalette())
                        },
                        connector.PLATFORM_META_KEY + 'shift+p',
                    ],
                ]}
                open={openMenu === 2}
                onClick={() => {
                    if (openMenu !== 2) setOpenMenu(2)
                    else setOpenMenu(-1)
                }}
            />
        </div>
    )
}

function WindowsFrameButtons() {
    return (
        <div className="windows__framebuttons">
            <div
                className="titlebar__right_button"
                onClick={() => {
                    connector.minimize()
                }}
            >
                <Codicon name="chrome-minimize" />
            </div>
            <div
                className="titlebar__right_button"
                onClick={() => {
                    connector.maximize()
                }}
            >
                <Codicon name="chrome-maximize" />
            </div>
            <div
                className="titlebar__right_button windows__closebutton"
                onClick={() => {
                    connector.close()
                }}
            >
                <Codicon name="chrome-close" />
            </div>
        </div>
    )
}

export function TitleBar({
    titleHeight,
    useButtons = true,
}: {
    titleHeight: string
    useButtons?: boolean
}) {
    const dispatch = useAppDispatch()
    const generating = useAppSelector(csel.getGenerating)
    const appVersion = useAppSelector(gsel.getVersion)
    const leftSideExpanded = useAppSelector(
        (state: any) => state.toolState?.leftSideExpanded
    )
    const aiSidebarOpen = useAppSelector(
        (state: any) => state.toolState?.aiCommandPaletteTriggered
    )
    const settingsOpen = useAppSelector(
        (state: any) => state.settingsState?.isOpen
    )
    const terminalOpen = useAppSelector(
        (state: any) => state.global?.terminalOpen
    )

    const [isWindows, setIsWindows] = useState(false)

    useEffect(() => {
        connector.getPlatform().then((platform: string | null) => {
            setIsWindows(platform !== 'darwin')
        })
    }, [])

    return (
        <div
            className="titlebar"
            style={{
                height: titleHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 10px',
            }}
            onDoubleClick={() => connector.maximize()}
        >
            <div
                className="titlebar__left"
                style={{ display: 'flex', alignItems: 'center', flex: '1 1 0' }}
            >
                {isWindows && <MenuBar />}
                <div className="titlebar__left_rest"></div>
                <SearchFiles />
            </div>

            <div
                className="titleOnTitleBar"
                style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--titlebar-fg)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}
            >
                Cursor - v{appVersion}
            </div>

            <div
                className="titlebar__right"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: '1 1 0',
                    justifyContent: 'flex-end',
                    gap: '4px',
                }}
            >
                {useButtons && (
                    <div
                        className="titlebar__buttons"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation()
                        }}
                    >
                        {generating && (
                            <>
                                <div className="titlebar__right_button_spinner">
                                    <div className="loader"></div>
                                </div>
                                <div
                                    className="titlebar__right_button_with_text"
                                    onClick={() => {
                                        dispatch(cs.interruptGeneration(null))
                                    }}
                                >
                                    Cancel
                                    <span className="titlebar-shortcut-span">
                                        {connector.PLATFORM_META_KEY}⌫
                                    </span>
                                </div>
                            </>
                        )}

                        <div
                            className={`titlebar__right_button ${
                                leftSideExpanded ? 'active' : ''
                            }`}
                            onClick={() => {
                                dispatch(ts.toggleLeftSide())
                            }}
                            title="Toggle Sidebar (⌘B)"
                        >
                            <Codicon name="layout-sidebar-left" />
                        </div>

                        <div
                            className={`titlebar__right_button ${
                                aiSidebarOpen ? 'active' : ''
                            }`}
                            onClick={() => {
                                dispatch(ts.triggerAICommandPalette())
                            }}
                            title="AI Assistant (⌘K)"
                        >
                            <Codicon name="sparkle" />
                        </div>

                        <div
                            className={`titlebar__right_button ${
                                terminalOpen ? 'active' : ''
                            }`}
                            onClick={() => {
                                dispatch(gs.toggleTerminal())
                            }}
                            title="Toggle Terminal (⌃`)"
                        >
                            <Codicon name="terminal" />
                        </div>

                        <div
                            className={`titlebar__right_button ${
                                settingsOpen ? 'active' : ''
                            }`}
                            onClick={() => {
                                dispatch(ss.toggleSettings())
                            }}
                            title="Settings (⌘,)"
                        >
                            <Codicon name="gear" />
                        </div>
                    </div>
                )}
                {isWindows && <WindowsFrameButtons />}
            </div>
        </div>
    )
}
