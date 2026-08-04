import React, { useState } from 'react'
import Modal from 'react-modal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark as faClose, faTerminal } from '@fortawesome/free-solid-svg-icons'
import { useAppDispatch, useAppSelector } from '../app/hooks'
import * as gs from '../features/globalSlice'
import * as gsel from '../features/selectors'

const customStyles = {
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
    },
    content: {
        padding: '0',
        top: '150px',
        bottom: 'auto',
        background: 'var(--black-elevated)',
        border: '1px solid var(--ui-border)',
        width: '500px',
        height: 'auto',
        marginLeft: 'auto',
        marginRight: 'auto',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 25px 70px rgba(0, 0, 0, 0.8)',
    },
}

export function SSHPopup() {
    const showRemotePopup = useAppSelector(gsel.getShowRemotePopup)
    const remoteCommand = useAppSelector(gsel.getRemoteCommand)
    const remotePath = useAppSelector(gsel.getRemotePath)
    const remoteBad = useAppSelector(gsel.getRemoteBad)
    const dispatch = useAppDispatch()

    // Local state for connecting status
    const [isConnecting, setIsConnecting] = useState(false)

    function submit() {
        if (remoteCommand.length > 2 && remotePath.length > 2) {
            setIsConnecting(true)
            dispatch(gs.openRemoteFolder(null)).finally(() => {
                setIsConnecting(false)
            })
        }
    }

    const onClose = () => {
        dispatch(gs.closeRemotePopup())
    }

    return (
        <Modal
            isOpen={showRemotePopup}
            onRequestClose={onClose}
            style={customStyles}
            contentLabel="SSH Connect"
            ariaHideApp={false}
        >
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-ui-fg flex items-center gap-2">
                        <FontAwesomeIcon
                            icon={faTerminal}
                            className="text-sm opacity-50"
                        />
                        Connect via SSH
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-ui-fg-muted hover:text-ui-fg"
                    >
                        <FontAwesomeIcon icon={faClose} />
                    </button>
                </div>

                {remoteBad && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded">
                        The SSH command or path you entered is invalid. Please
                        try again.
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-ui-fg-muted uppercase mb-1">
                            SSH Command
                        </label>
                        <input
                            type="text"
                            className="w-full bg-black/30 border border-white/10 rounded p-2 text-sm focus:border-accent outline-none"
                            placeholder="ssh -i ~/keys/my-key.pem ubuntu@1.2.3.4"
                            value={remoteCommand}
                            onChange={(e) =>
                                dispatch(gs.setRemoteCommand(e.target.value))
                            }
                            onKeyDown={(e) => e.key === 'Enter' && submit()}
                            autoFocus
                        />
                        <p className="text-[10px] text-ui-fg-muted mt-1 opacity-60">
                            Enter the full SSH command you use to connect in
                            your terminal.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-ui-fg-muted uppercase mb-1">
                            Remote Folder Path
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full bg-black/30 border border-white/10 rounded p-2 text-sm focus:border-accent outline-none"
                                placeholder="/home/ubuntu/project"
                                value={remotePath}
                                onChange={(e) =>
                                    dispatch(gs.setRemotePath(e.target.value))
                                }
                                onKeyDown={(e) => e.key === 'Enter' && submit()}
                            />
                        </div>
                        <p className="text-[10px] text-ui-fg-muted mt-1 opacity-60">
                            Absolute path to the directory on the remote server.
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={submit}
                        disabled={isConnecting || !remoteCommand || !remotePath}
                        className={`primary-button px-6 py-2 ${
                            isConnecting || !remoteCommand || !remotePath
                                ? 'opacity-50 cursor-not-allowed'
                                : ''
                        }`}
                    >
                        {isConnecting ? 'Connecting...' : 'Connect'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
