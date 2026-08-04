import React, { useState } from 'react'
import Modal from 'react-modal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark as faClose } from '@fortawesome/free-solid-svg-icons'
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

export function GitClonePopup() {
    const dispatch = useAppDispatch()
    const isOpen = useAppSelector(gsel.getShowClonePopup)
    const [repoUrl, setRepoUrl] = useState('')
    const [localPath, setLocalPath] = useState('')
    const [isCloning, setIsCloning] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const onClose = () => {
        dispatch(gs.closeClonePopup())
        setRepoUrl('')
        setLocalPath('')
        setError(null)
    }

    const handleClone = async () => {
        if (!repoUrl || !localPath) {
            setError('Please provide both URL and path.')
            return
        }
        setIsCloning(true)
        setError(null)
        try {
            // @ts-ignore
            const result = await connector.gitClone(repoUrl, localPath)
            if (result.success) {
                dispatch(gs.openFolder({ path: localPath }))
                onClose()
            } else {
                setError(result.error)
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsCloning(false)
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            style={customStyles}
            contentLabel="Clone Repository"
        >
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-semibold text-ui-fg">
                        Clone Repository
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-ui-fg-muted hover:text-ui-fg"
                    >
                        <FontAwesomeIcon icon={faClose} />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-ui-fg-muted uppercase mb-1">
                            Repository URL
                        </label>
                        <input
                            type="text"
                            value={repoUrl}
                            onChange={(e) => setRepoUrl(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded p-2 text-sm focus:border-accent outline-none"
                            placeholder="https://github.com/username/repo.git"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-ui-fg-muted uppercase mb-1">
                            Local Path
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={localPath}
                                onChange={(e) => setLocalPath(e.target.value)}
                                className="flex-1 bg-black/30 border border-white/10 rounded p-2 text-sm focus:border-accent outline-none"
                                placeholder="/path/to/clone"
                            />
                            <button
                                className="px-3 py-2 bg-white/5 border border-white/10 rounded hover:bg-white/10 text-xs"
                                onClick={async () => {
                                    // @ts-ignore
                                    const path = await connector.openFolder()
                                    if (path) setLocalPath(path)
                                }}
                            >
                                Browse
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleClone}
                        disabled={isCloning}
                        className={`primary-button px-6 py-2 ${
                            isCloning ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isCloning ? 'Cloning...' : 'Clone'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
