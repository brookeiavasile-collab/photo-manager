import React, { useState } from 'react'
import ConfirmModal from './ConfirmModal'
import TrashIcon from './icons/TrashIcon'
import { PlayIcon, ViewIcon } from './icons/AppIcons'
import { isTauriApp, HTTP_ROOT_URL } from '../services/api'
import { convertFileSrc } from '@tauri-apps/api/core'
import '../styles/MediaGrid.css'

function MediaGrid({ items, onItemClick, onPhotoDelete, onVideoDelete, onDuplicateClick }) {
  const formatAddress = (address) => {
    if (!address) return null
    if (address.displayName || address.display_name) return address.displayName || address.display_name

    const parts = []
    if (address.country) parts.push(address.country)
    if (address.province) parts.push(address.province)
    if (address.city) parts.push(address.city)
    if (address.district) parts.push(address.district)
    if (address.road) parts.push(address.road)
    return parts.length > 0 ? parts.join(' · ') : null
  }

  const isInvalidGps = (gps) => {
    if (!gps) return false
    const lat = gps.latitude
    const lon = gps.longitude
    return lat === 0 && lon === 0
  }

  const getAddressText = (item) => {
    const address = formatAddress(item.address)
    if (address) return `拍摄地点：${address}`
    
    const gps = item.exif?.gps
    if (isInvalidGps(gps)) return '拍摄地点：无效坐标'
    
    return '拍摄地点：空'
  }

  const getThumbnailUrl = (thumbnail) => {
    if (!thumbnail) return null
    if (isTauriApp) {
      if (thumbnail.startsWith('/') || thumbnail.match(/^[A-Za-z]:\\/)) {
        return convertFileSrc(thumbnail)
      }
      return null
    }
    return `${HTTP_ROOT_URL}/${encodeURIComponent(thumbnail)}`
  }

  const [pendingDeleteItem, setPendingDeleteItem] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const canDeletePhoto = typeof onPhotoDelete === 'function'
  const canDeleteVideo = typeof onVideoDelete === 'function'

  const formatSize = (bytes) => {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  const formatDuration = (seconds) => {
    if (!seconds) return ''
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = (dateValue) => {
    if (!dateValue) return ''
    const date = new Date(dateValue)

    if (Number.isNaN(date.getTime())) return ''

    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const handleDelete = (item, e) => {
    e.stopPropagation()

    setPendingDeleteItem(item)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteItem) return

    setDeleting(true)

    try {
      if (pendingDeleteItem.mediaType === 'photo') {
        if (canDeletePhoto) await onPhotoDelete(pendingDeleteItem.id)
      } else {
        if (canDeleteVideo) await onVideoDelete(pendingDeleteItem.id)
      }
      setPendingDeleteItem(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleCancelDelete = () => {
    if (deleting) return
    setPendingDeleteItem(null)
  }

  const canDeleteItem = (item) => {
    if (item.mediaType === 'photo') return canDeletePhoto
    if (item.mediaType === 'video') return canDeleteVideo
    return false
  }

  const getDisplayTitle = (item) => {
    const aiTags = Array.isArray(item.aiTags) ? item.aiTags.filter(Boolean) : []
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : []
    const displayTags = aiTags.length > 0 ? aiTags : tags

    if (displayTags.length > 0) {
      return displayTags.join(' · ')
    }

    return item.filename
  }

  return (
    <>
      <div className="media-grid">
        {items.length === 0 ? (
          <div className="no-media">
            <p>没有找到媒体文件</p>
          </div>
        ) : (
          items.map(item => (
            <div 
              key={item.id} 
              className="media-card"
              onClick={() => onItemClick(item)}
            >
              <div className="media-thumbnail">
                {item.thumbnail ? (
                  <img 
                    src={getThumbnailUrl(item.thumbnail)} 
                    alt={item.filename}
                  />
                ) : (
                  <div className="no-thumbnail">
                    {item.mediaType === 'video' ? '🎬' : '🖼️'}
                  </div>
                )}
                
                <div className="media-top-left-badges">
                  <div className="view-count-badge" title={`已查看 ${item.clickCount || 0} 次`}>
                    <ViewIcon size={12} className="view-count-icon" />
                    <span>{item.clickCount || 0}</span>
                  </div>

                  {item.duplicateCount > 0 && (
                    <div 
                      className="duplicate-badge"
                      onClick={(e) => { e.stopPropagation(); onDuplicateClick(item) }}
                      title={`${item.duplicateCount} 个重复`}
                    >
                      +{item.duplicateCount}
                    </div>
                  )}
                </div>

                {item.mediaType === 'video' && item.duration && (
                  <div className="video-duration">
                    {formatDuration(item.duration)}
                  </div>
                )}

                <div className="media-overlay">
                  {item.mediaType === 'video' && (
                    <div className="play-indicator" aria-hidden="true">
                      <PlayIcon size={18} className="play-indicator-icon" />
                    </div>
                  )}
                </div>

                {canDeleteItem(item) && (
                <button 
                  className="delete-btn media-corner-action"
                  onClick={(e) => handleDelete(item, e)}
                  title="删除"
                  aria-label="删除"
                >
                  <TrashIcon size={14} />
                </button>
                )}
              </div>
              
              <div className="media-info">
                <div className="media-name" title={getDisplayTitle(item)}>
                  {getDisplayTitle(item)}
                </div>
                <div className="media-date" title={formatDate(item.dateTaken || item.createdAt)}>
                  {formatDate(item.dateTaken || item.createdAt)}
                </div>
                <div className="media-address" title={getAddressText(item)}>
                  {getAddressText(item)}
                </div>
                <div className="media-meta">
                  <span>{formatSize(item.size)}</span>
                  {item.mediaType === 'photo' && item.width && item.height && (
                    <span>{item.width}×{item.height}</span>
                  )}
                  {item.mediaType === 'video' && item.width && item.height && (
                    <span>{item.width}×{item.height}</span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {pendingDeleteItem && (
        <ConfirmModal
          open={Boolean(pendingDeleteItem)}
          title="确认移入回收站"
          message={`确定要将这个${pendingDeleteItem.mediaType === 'video' ? '视频' : '照片'}移入回收站吗？`}
          details={pendingDeleteItem.filename}
          confirmText={deleting ? '处理中...' : '确认移入回收站'}
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onClose={handleCancelDelete}
        />
      )}
    </>
  )
}

export default MediaGrid
