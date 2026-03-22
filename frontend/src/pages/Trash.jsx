import React, { useState, useEffect } from 'react'
import ConfirmModal from '../components/ConfirmModal'
import TrashIcon from '../components/icons/TrashIcon'
import { FolderPathIcon, RestoreIcon } from '../components/icons/AppIcons'
import { trashService, isTauriApp, HTTP_ROOT_URL, videoService } from '../services/api'
import { convertFileSrc } from '@tauri-apps/api/core'
import '../styles/Trash.css'

function Trash() {
  const getThumbnailUrl = (thumbnail) => {
    if (isTauriApp && thumbnail) {
      return convertFileSrc(thumbnail)
    }
    return `${HTTP_ROOT_URL}/${encodeURIComponent(thumbnail)}`
  }
  const isVideoItem = (item) => item?.type === 'video'

  const getPhotoUrl = (path) => {
    if (!path) return ''
    if (isTauriApp) return convertFileSrc(path)
    return `${HTTP_ROOT_URL}/photos/${encodeURIComponent(path)}`
  }

  const [trashItems, setTrashItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [actionInProgress, setActionInProgress] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    loadTrash()
  }, [])

  const loadTrash = async () => {
    try {
      const data = await trashService.getAll()
      setTrashItems(data)
    } catch (error) {
      console.error('Failed to load trash:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (id) => {
    const item = trashItems.find(entry => entry.id === id)

    setActionInProgress(id)
    try {
      const ok = await trashService.restore(id, item?.type || 'photo')
      if (ok === false) {
        throw new Error('恢复失败')
      }
      await loadTrash()
      setConfirmState(null)
      if (selectedPhoto?.id === id) {
        setSelectedPhoto(null)
      }
    } catch (error) {
      console.error('Failed to restore item:', error)
      alert('恢复失败: ' + error.message)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleRestoreAll = async () => {
    if (trashItems.length === 0) return

    setActionInProgress('all')
    try {
      await trashService.restoreAll()
      setTrashItems([])
      setConfirmState(null)
    } catch (error) {
      console.error('Failed to restore all photos:', error)
      alert('恢复失败: ' + error.message)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDeletePermanently = async (id) => {
    const item = trashItems.find(entry => entry.id === id)
    setActionInProgress(id)
    try {
      const ok = await trashService.deletePermanently(id, item?.type || 'photo')
      if (ok === false) {
        throw new Error('删除失败')
      }
      await loadTrash()
      if (selectedPhoto?.id === id) {
        setSelectedPhoto(null)
      }
      setConfirmState(null)
    } catch (error) {
      console.error('Failed to delete photo permanently:', error)
      alert('删除失败: ' + error.message)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleEmptyTrash = async () => {
    if (trashItems.length === 0) return

    try {
      setActionInProgress('empty')
      await trashService.emptyTrash()
      setTrashItems([])
      setSelectedPhoto(null)
      setConfirmState(null)
    } catch (error) {
      console.error('Failed to empty trash:', error)
      alert('清空回收站失败: ' + error.message)
    } finally {
      setActionInProgress(null)
    }
  }

  const openRestoreAllConfirm = () => {
    if (trashItems.length === 0) return
    setConfirmState({
      actionKey: 'all',
      type: 'restore-all',
      title: '确认全部恢复',
      message: `确定要恢复全部 ${trashItems.length} 个项目吗？`,
      confirmText: actionInProgress === 'all' ? '恢复中...' : '确认全部恢复',
      tone: 'primary',
      onConfirm: handleRestoreAll
    })
  }

  const openDeletePermanentConfirm = (photo) => {
    setConfirmState({
      actionKey: photo.id,
      type: 'delete-permanent',
      title: '确认永久删除',
      message: `确定要永久删除这个${isVideoItem(photo) ? '视频' : '照片'}吗？此操作不可撤销。`,
      details: photo.filename,
      confirmText: actionInProgress === photo.id ? '删除中...' : '确认永久删除',
      tone: 'danger',
      onConfirm: () => handleDeletePermanently(photo.id)
    })
  }

  const openRestoreConfirm = (item) => {
    setConfirmState({
      actionKey: item.id,
      type: 'restore-one',
      title: `确认恢复${isVideoItem(item) ? '视频' : '照片'}`,
      message: `确定要恢复这个${isVideoItem(item) ? '视频' : '照片'}吗？`,
      details: item.filename,
      confirmText: actionInProgress === item.id ? '恢复中...' : '确认恢复',
      tone: 'primary',
      onConfirm: () => handleRestore(item.id)
    })
  }

  const openEmptyTrashConfirm = () => {
    if (trashItems.length === 0) return
    setConfirmState({
      actionKey: 'empty',
      type: 'empty-trash',
      title: '确认清空回收站',
      message: `将永久删除 ${trashItems.length} 个项目，此操作不可撤销。`,
      confirmText: actionInProgress === 'empty' ? '清空中...' : '确认清空',
      tone: 'danger',
      onConfirm: handleEmptyTrash
    })
  }

  const formatDate = (dateString) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const formatAddress = (address) => {
    if (!address) return null
    if (address.displayName) return address.displayName
    
    const parts = []
    if (address.country) parts.push(address.country)
    if (address.province) parts.push(address.province)
    if (address.city) parts.push(address.city)
    if (address.district) parts.push(address.district)
    
    return parts.length > 0 ? parts.join(', ') : null
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="trash-page">
        <div className="page-header">
          <h1><TrashIcon size={22} className="trash-title-icon" /> 回收站</h1>
        <p>{trashItems.length} 个项目</p>
        {trashItems.length > 0 && (
          <div className="trash-header-actions">
            <button 
              className="btn btn-primary" 
              onClick={openRestoreAllConfirm}
              disabled={actionInProgress === 'all'}
            >
              {actionInProgress === 'all' ? '恢复中...' : <><RestoreIcon size={14} />{' '}全部恢复</>}
            </button>
            <button className="btn btn-danger" onClick={openEmptyTrashConfirm} disabled={actionInProgress === 'empty'}>
              清空回收站
            </button>
          </div>
        )}
      </div>

      {trashItems.length === 0 ? (
        <div className="empty-trash">
          <div className="empty-icon"><TrashIcon size={52} className="trash-empty-icon" /></div>
          <p>回收站是空的</p>
          <p className="empty-hint">删除的照片和视频会在这里保留，直到您永久删除它们</p>
        </div>
      ) : (
        <div className="trash-content">
          <div className="trash-grid">
            {trashItems.map(photo => (
              <div 
                key={photo.id} 
                className={`trash-card ${selectedPhoto?.id === photo.id ? 'selected' : ''}`}
                onClick={() => setSelectedPhoto(photo)}
              >
                <img 
                  src={getThumbnailUrl(photo.thumbnail)} 
                  alt={photo.filename}
                  className="trash-thumbnail"
                />
                <div className="trash-info">
                  <div className="trash-filename">{photo.filename}</div>
                  <div className="trash-deleted-at">
                    删除于: {formatDate(photo.deletedAt)}
                  </div>
                  {photo.address && formatAddress(photo.address) && (
                    <div className="trash-location">
                      <span>📍</span>
                      <span>{formatAddress(photo.address)}</span>
                    </div>
                  )}
                </div>
                <div className="trash-actions">
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={(e) => { e.stopPropagation(); openRestoreConfirm(photo) }}
                    disabled={actionInProgress === photo.id}
                    type="button"
                  >
                    {actionInProgress === photo.id ? '...' : <><RestoreIcon size={12} />{' '}恢复</>}
                  </button>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={(e) => { e.stopPropagation(); openDeletePermanentConfirm(photo) }}
                    disabled={actionInProgress === photo.id}
                    type="button"
                  >
                    {actionInProgress === photo.id ? '...' : <><TrashIcon size={12} />{' '}永久删除</>}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {selectedPhoto && (
            <div className="trash-detail-modal" onClick={() => setSelectedPhoto(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button type="button" className="modal-close" onClick={() => setSelectedPhoto(null)}>×</button>
                
                <div className="modal-image-container">
                  {isVideoItem(selectedPhoto) ? (
                    <video
                      src={isTauriApp ? convertFileSrc(selectedPhoto.path) : videoService.getStreamUrl(selectedPhoto.id)}
                      controls
                      className="modal-image"
                    />
                  ) : (
                    <img 
                      src={getPhotoUrl(selectedPhoto.path)} 
                      alt={selectedPhoto.filename}
                      className="modal-image"
                    />
                  )}
                </div>
                
                <div className="modal-sidebar">
                  <div className="modal-section">
                    <h3>{isVideoItem(selectedPhoto) ? '视频详情' : '照片详情'}</h3>
                    <p><strong>{selectedPhoto.filename}</strong></p>
                    <p className="photo-path" title={selectedPhoto.path}>
                      <span className="path-label"><FolderPathIcon size={12} className="inline-label-icon" /> 路径：</span>
                      <span className="path-value">{selectedPhoto.path}</span>
                    </p>
                    <p>类型: {isVideoItem(selectedPhoto) ? '视频' : '照片'}</p>
                    <p>大小: {(selectedPhoto.size / 1024 / 1024).toFixed(2)} MB</p>
                    <p>拍摄日期: {formatDate(selectedPhoto.dateTaken || selectedPhoto.createdAt)}</p>
                    <p>删除时间: {formatDate(selectedPhoto.deletedAt)}</p>
                  </div>

                  {selectedPhoto.exif && !isVideoItem(selectedPhoto) && (
                    <div className="modal-section">
                      <h3>EXIF 信息</h3>
                      <div className="exif-item">
                        <span>相机:</span>
                        <span>{selectedPhoto.exif.make} {selectedPhoto.exif.model}</span>
                      </div>
                    </div>
                  )}

                  {selectedPhoto.address && formatAddress(selectedPhoto.address) && (
                    <div className="modal-section">
                      <h3>📍 位置</h3>
                      <p>{formatAddress(selectedPhoto.address)}</p>
                    </div>
                  )}

                  {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                    <div className="modal-section">
                      <h3>标签</h3>
                      <div className="tags-container">
                        {selectedPhoto.tags.map((tag, index) => (
                          <span key={index} className="tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedPhoto.notes && (
                    <div className="modal-section">
                      <h3>备注</h3>
                      <p>{selectedPhoto.notes}</p>
                    </div>
                  )}

                  <div className="modal-actions">
                    <button 
                      className="btn btn-primary full-width"
                      onClick={() => openRestoreConfirm(selectedPhoto)}
                      disabled={actionInProgress === selectedPhoto.id}
                    >
                      {actionInProgress === selectedPhoto.id ? '恢复中...' : <><RestoreIcon size={14} />{' '}恢复{isVideoItem(selectedPhoto) ? '视频' : '照片'}</>}
                    </button>
                    <button 
                      className="btn btn-danger full-width"
                      onClick={() => openDeletePermanentConfirm(selectedPhoto)}
                      disabled={actionInProgress === selectedPhoto.id}
                    >
                      {actionInProgress === selectedPhoto.id ? '删除中...' : <><TrashIcon size={14} />{' '}永久删除</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        details={confirmState?.details}
        confirmText={confirmState?.confirmText}
        tone={confirmState?.tone || 'danger'}
        busy={Boolean(confirmState?.actionKey) && actionInProgress === confirmState.actionKey}
        onConfirm={confirmState?.onConfirm}
        onClose={() => {
          if (confirmState?.actionKey && actionInProgress === confirmState.actionKey) return
          setConfirmState(null)
        }}
      />
    </div>
  )
}

export default Trash
