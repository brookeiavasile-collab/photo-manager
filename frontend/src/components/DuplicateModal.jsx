import React, { useState, useEffect } from 'react'
import { duplicateService, isTauriApp, HTTP_ROOT_URL, photoService, videoService } from '../services/api'
import { convertFileSrc } from '@tauri-apps/api/core'
import { FolderPathIcon } from './icons/AppIcons'
import ConfirmModal from './ConfirmModal'
import '../styles/DuplicateModal.css'

function DuplicateModal({ photo, onClose, onRefresh }) {
  const getThumbnailUrl = (thumbnail) => {
    if (isTauriApp && thumbnail) {
      return convertFileSrc(thumbnail)
    }
    return `${HTTP_ROOT_URL}/${encodeURIComponent(thumbnail)}`
  }
  const isVideo = photo?.mediaType === 'video' || photo?.type === 'video'

  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    loadDuplicates()
  }, [photo.md5])

  const loadDuplicates = async () => {
    if (!photo.md5) return
    setLoading(true)
    try {
      const data = isVideo
        ? await duplicateService.getVideoDuplicates(photo.md5)
        : await duplicateService.getDuplicates(photo.md5)

      const items = Array.isArray(data) ? [...data] : []
      const getTime = (item) => {
        const v = item?.dateTaken || item?.createdAt
        const t = new Date(v || 0).getTime()
        return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
      }

      // UI 约定：第一个为“最早拍摄（将被保留）”
      items.sort((a, b) => {
        const dt = getTime(a) - getTime(b)
        if (dt !== 0) return dt
        return String(a?.filename || '').localeCompare(String(b?.filename || ''), 'zh-CN')
      })

      setDuplicates(items)
    } catch (error) {
      console.error('Failed to load duplicates:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAll = async (e) => {
    if (e) {
      e.stopPropagation()
    }

    setConfirmState({ type: 'all' })
  }

  const confirmDeleteAll = async () => {
    setDeleting(true)
    try {
      let removed = 0
      if (isVideo) {
        removed = await duplicateService.deleteVideoDuplicates(photo.md5)
      } else {
        removed = await duplicateService.deleteDuplicates(photo.md5)
      }

      if (typeof removed === 'number' && removed <= 0) {
        alert('没有可删除的重复项')
        await loadDuplicates()
        setConfirmState(null)
        return
      }

      await loadDuplicates()
      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
      setConfirmState(null)
      onClose()
    } catch (error) {
      console.error('Failed to delete duplicates:', error)
      alert('删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  const handleDeleteOne = async (photoId) => {
    setConfirmState({ type: 'single', id: photoId })
  }

  const confirmDeleteOne = async () => {
    const photoId = confirmState?.id
    if (!photoId) return
    setDeletingId(photoId)
    try {
      if (isVideo) {
        const ok = await videoService.delete(photoId)
        if (ok === false) {
          throw new Error('删除失败')
        }
      } else {
        const ok = await photoService.delete(photoId)
        if (ok === false) {
          throw new Error('删除失败')
        }
      }
      loadDuplicates()
      onRefresh()
      setConfirmState(null)
    } catch (error) {
      console.error('Failed to delete photo:', error)
      alert('删除失败，请重试')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const formatSize = (bytes) => {
    if (!bytes) return '未知'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  if (!photo) return null

  return (
    <div className="duplicate-modal-overlay" onClick={onClose}>
      <div className="duplicate-modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="duplicate-modal-close" onClick={onClose}>×</button>
        
        <div className="duplicate-modal-header">
          <h2>重复{isVideo ? '视频' : '照片'} ({duplicates.length} 个)</h2>
          <p className="duplicate-modal-subtitle">以下{isVideo ? '视频' : '照片'}内容完全相同，您可以选择保留或删除</p>
        </div>

        {loading ? (
          <div className="duplicate-loading">加载中...</div>
        ) : (
          <>
            <div className="duplicate-actions">
              <button 
                className="btn btn-danger"
                onClick={handleDeleteAll}
                disabled={deleting || duplicates.length <= 1}
                type="button"
              >
                {deleting ? '删除中...' : `删除所有重复（保留最早拍摄的）`}
              </button>
            </div>

            <div className="duplicate-list">
              {duplicates.map((dup, index) => (
                <div key={dup.id} className="duplicate-item">
                  <div className="duplicate-item-index">{index + 1}</div>
                  <div className="duplicate-item-preview">
                    <img 
                      src={getThumbnailUrl(dup.thumbnail)} 
                      alt={dup.filename}
                    />
                  </div>
                  <div className="duplicate-item-info">
                    <div className="duplicate-item-name">{dup.filename}</div>
                    <div className="duplicate-item-meta">
                      <span><FolderPathIcon size={12} className="duplicate-meta-icon" /> {dup.path}</span>
                      <span>📊 {formatSize(dup.size)}</span>
                      <span>📅 {formatDate(dup.dateTaken || dup.createdAt)}</span>
                    </div>
                    {index === 0 && (
                      <div className="duplicate-item-original">最早拍摄（将被保留）</div>
                    )}
                  </div>
<div className="duplicate-item-actions">
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDeleteOne(dup.id)}
                        disabled={deletingId === dup.id}
                        type="button"
                      >
                        {deletingId === dup.id ? '删除中...' : '删除'}
                      </button>
                    </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.type === 'all' ? '确认删除所有重复项' : '确认移入回收站'}
        message={confirmState?.type === 'all'
          ? `确定要删除 ${Math.max(duplicates.length - 1, 0)} 个重复${isVideo ? '视频' : '照片'}吗？将保留最早拍摄的${isVideo ? '视频' : '照片'}。`
          : `确定要将此${isVideo ? '视频' : '照片'}移入回收站吗？`}
        details={confirmState?.type === 'single'
          ? duplicates.find(item => item.id === confirmState.id)?.filename
          : photo?.filename}
        confirmText={confirmState?.type === 'all'
          ? (deleting ? '删除中...' : '确认删除')
          : (deletingId ? '删除中...' : '确认移入回收站')}
        busy={deleting || Boolean(deletingId)}
        onConfirm={confirmState?.type === 'all' ? confirmDeleteAll : confirmDeleteOne}
        onClose={() => {
          if (deleting || deletingId) return
          setConfirmState(null)
        }}
      />
    </div>
  )
}

export default DuplicateModal
