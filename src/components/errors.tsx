import { useAppDispatch, useAppSelector } from '../app/hooks'
import { closeError } from '../features/globalSlice'
import { getError, getShowErrors } from '../features/selectors'
import Modal from 'react-modal'
import { Codicon } from './codicon'

const customStyles = {
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        backdropFilter: 'blur(12px)',
    },
    content: {
        padding: '0',
        top: 'auto',
        left: 'auto',
        right: 'auto',
        bottom: 'auto',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        width: '460px',
        height: 'auto',
        maxWidth: '90vw',
        inset: 'auto',
    },
}

export function ErrorPopup() {
    const showError = useAppSelector(getShowErrors)
    const error = useAppSelector(getError)
    const dispatch = useAppDispatch()

    return (
        <Modal
            isOpen={showError || error !== null}
            onRequestClose={() => dispatch(closeError())}
            style={customStyles}
            contentLabel="Notification"
        >
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative overflow-hidden">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[var(--ui-hover)] border border-[var(--ui-border)] flex items-center justify-center text-[var(--accent)]">
                            <Codicon name="warning" style={{ fontSize: 14 }} />
                        </div>
                        <h3 className="text-[15px] font-bold text-ui-fg tracking-wide">
                            {error?.title || 'AI Command Bar'}
                        </h3>
                    </div>
                    <button
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-ui-hover text-ui-fg-muted hover:text-ui-fg transition-colors"
                        onClick={() => dispatch(closeError())}
                        title="Close"
                    >
                        <Codicon name="close" style={{ fontSize: 12 }} />
                    </button>
                </div>
                <div className="text-[13px] text-ui-fg-muted leading-relaxed mb-6 font-sans">
                    {error?.message || 'Open a file in the editor first.'}
                </div>
                <div className="flex items-center justify-end">
                    <button
                        className="px-4 py-2 bg-accent text-white text-[12px] font-semibold rounded-lg hover:opacity-90 transition-all cursor-pointer shadow-sm"
                        onClick={() => dispatch(closeError())}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </Modal>
    )
}
