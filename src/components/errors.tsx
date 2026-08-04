import { useAppDispatch, useAppSelector } from '../app/hooks'
import { closeError } from '../features/globalSlice'
import { getError, getShowErrors } from '../features/selectors'
import {
    faXmark as faClose,
    faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Modal from 'react-modal'

const customStyles = {
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        backdropFilter: 'blur(10px)',
    },
    content: {
        padding: '0',
        top: 'auto',
        left: 'auto',
        right: 'auto',
        bottom: 'auto',
        background: 'none',
        border: 'none',
        width: '500px',
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
            contentLabel="Error Notification"
        >
            <div className="errorPopup">
                <div className="errorPopup__title">
                    <FontAwesomeIcon icon={faTriangleExclamation} />
                    <div className="errorPopup__title_text">
                        {error?.title || 'System Error'}
                    </div>
                    <div
                        className="errorPopup__title_close icon-button"
                        onClick={() => dispatch(closeError())}
                    >
                        <FontAwesomeIcon icon={faClose} />
                    </div>
                </div>
                <div className="errorPopup__body">
                    {error?.message ||
                        'Something unexpected happened. Please try again later. If this continues, please contact suryanshunab@gmail.com.'}
                </div>
                <div className="mt-8 flex justify-end">
                    <button
                        className="primary-button bg-red-600 hover:bg-red-500"
                        onClick={() => dispatch(closeError())}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </Modal>
    )
}
