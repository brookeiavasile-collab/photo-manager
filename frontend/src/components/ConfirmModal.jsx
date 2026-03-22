import React from 'react'
import '../styles/ConfirmModal.css'

function ConfirmModal({
  open,
  title,
  message,
  details,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose
}) {
  if (!open) return null

  const handleOverlayClick = () => {
    if (busy) return
    onClose()
  }

  return (
    <div className="confirm-modal-overlay" onClick={handleOverlayClick}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-header">{title}</div>
        <div className="confirm-modal-body">
          {message && <p>{message}</p>}
          {details && (
            <p className="confirm-modal-details" title={details}>
              {details}
            </p>
          )}
        </div>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-btn secondary" onClick={onClose} disabled={busy}>
            {cancelText}
          </button>
          <button type="button" className={`confirm-btn ${tone}`} onClick={onConfirm} disabled={busy}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
