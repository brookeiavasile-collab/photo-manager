import React, { useState, useEffect, useCallback, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import TrashIcon from './icons/TrashIcon'
import { convertFileSrc } from '@tauri-apps/api/core'
import { isTauriApp, videoService } from '../services/api'
import '../styles/VideoModal.css'

function VideoModal({ video, videos = [], mediaItems = null, onClose, onDelete, onNavigate }) {
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const videoContainerRef = useRef(null)
  const scaleRef = useRef(1)
  const positionRef = useRef({ x: 0, y: 0 })
  const touchRef = useRef({
    mode: null,
    initialDistance: 0,
    initialScale: 1,
    initialCenter: { x: 0, y: 0 },
    initialPosition: { x: 0, y: 0 },
    lastTouch: { x: 0, y: 0 },
  })

  const formatAddress = (address) => {
    if (!address) return null
    if (address.displayName || address.display_name) return address.displayName || address.display_name

    const parts = []
    if (address.country) parts.push(address.country)
    if (address.province) parts.push(address.province)
    if (address.city) parts.push(address.city)
    if (address.district) parts.push(address.district)
    if (address.road) parts.push(address.road)
    return parts.length > 0 ? parts.join('，') : null
  }

  const isInvalidGps = (gps) => {
    if (!gps) return false
    const lat = gps.latitude
    const lon = gps.longitude
    return lat === 0 && lon === 0
  }

  const videoAddress = formatAddress(video.address)
  const gps = video.exif?.gps
  const hasInvalidGps = isInvalidGps(gps)

  const navItems = Array.isArray(mediaItems) && mediaItems.length > 0 ? mediaItems : videos
  const currentIndex = navItems.findIndex(item => item?.id === video?.id && item?.mediaType === video?.mediaType)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < navItems.length - 1

  const handlePrev = useCallback(() => {
    if (hasPrev && navItems && onNavigate) {
      onNavigate(navItems[currentIndex - 1])
    }
  }, [hasPrev, navItems, currentIndex, onNavigate])

  const handleNext = useCallback(() => {
    if (hasNext && navItems && onNavigate) {
      onNavigate(navItems[currentIndex + 1])
    }
  }, [hasNext, navItems, currentIndex, onNavigate])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrev, handleNext, onClose])

  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [video.id])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 5))
  }

  const handleZoomOut = () => {
    setScale(prev => {
      const newScale = Math.max(prev - 0.25, 0.5)
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 })
      }
      return newScale
    })
  }

  const handleResetZoom = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

const handleMouseDown = (e) => {
    if (scale > 1 && e.button === 0) {
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y
      }
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPosition({
        x: dragStartRef.current.posX + dx,
        y: dragStartRef.current.posY + dy
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    const container = videoContainerRef.current
    if (!container) return

    const getTouchCenter = (touches) => {
      if (touches.length < 2) return { x: 0, y: 0 }
      return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      }
    }

    const getTouchDistance = (touches) => {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        touchRef.current = {
          mode: 'pinch',
          initialDistance: getTouchDistance(e.touches),
          initialScale: scaleRef.current,
          initialCenter: getTouchCenter(e.touches),
          initialPosition: positionRef.current,
          lastTouch: touchRef.current.lastTouch,
        }
      } else if (e.touches.length === 1 && scaleRef.current > 1) {
        const touch = e.touches[0]
        touchRef.current = {
          ...touchRef.current,
          mode: 'pan',
          lastTouch: { x: touch.clientX, y: touch.clientY },
          initialPosition: positionRef.current,
        }
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const currentDistance = getTouchDistance(e.touches)
        const currentCenter = getTouchCenter(e.touches)
        const { initialDistance, initialScale, initialCenter, initialPosition } = touchRef.current
        if (initialDistance > 0) {
          const newScale = Math.max(0.5, Math.min(initialScale * (currentDistance / initialDistance), 5))
          setScale(newScale)
          if (newScale <= 1) {
            setPosition({ x: 0, y: 0 })
          } else {
            setPosition({
              x: initialPosition.x + (currentCenter.x - initialCenter.x),
              y: initialPosition.y + (currentCenter.y - initialCenter.y),
            })
          }
        }
      } else if (e.touches.length === 1 && touchRef.current.mode === 'pan' && scaleRef.current > 1) {
        e.preventDefault()
        const touch = e.touches[0]
        const { lastTouch } = touchRef.current
        const nextPosition = {
          x: positionRef.current.x + (touch.clientX - lastTouch.x),
          y: positionRef.current.y + (touch.clientY - lastTouch.y),
        }
        touchRef.current.lastTouch = { x: touch.clientX, y: touch.clientY }
        setPosition(nextPosition)
      }
    }

    const handleTouchEnd = (e) => {
      if (e.touches.length === 1 && scaleRef.current > 1) {
        const touch = e.touches[0]
        touchRef.current = {
          ...touchRef.current,
          mode: 'pan',
          initialDistance: 0,
          lastTouch: { x: touch.clientX, y: touch.clientY },
        }
        return
      }

      touchRef.current = {
        ...touchRef.current,
        mode: null,
        initialDistance: 0,
      }
    }

    const handleGestureStart = (e) => {
      e.preventDefault()
      touchRef.current = {
        ...touchRef.current,
        mode: 'pinch',
        initialScale: scaleRef.current,
        initialPosition: positionRef.current,
      }
    }

    const handleGestureChange = (e) => {
      e.preventDefault()
      const baseScale = touchRef.current.initialScale || scaleRef.current
      const nextScale = Math.max(0.5, Math.min(baseScale * e.scale, 5))
      setScale(nextScale)
      if (nextScale <= 1) {
        setPosition({ x: 0, y: 0 })
      }
    }

    const handleTrackpadWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const delta = -e.deltaY * 0.01
        setScale(prev => {
          const nextScale = Math.max(0.5, Math.min(prev + delta, 5))
          if (nextScale <= 1) {
            setPosition({ x: 0, y: 0 })
          }
          return nextScale
        })
        return
      }

      if (scaleRef.current > 1) {
        e.preventDefault()
        setPosition(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }))
      }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)
    container.addEventListener('touchcancel', handleTouchEnd)
    container.addEventListener('gesturestart', handleGestureStart)
    container.addEventListener('gesturechange', handleGestureChange)
    container.addEventListener('wheel', handleTrackpadWheel, { passive: false })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
      container.removeEventListener('gesturestart', handleGestureStart)
      container.removeEventListener('gesturechange', handleGestureChange)
      container.removeEventListener('wheel', handleTrackpadWheel)
    }
  }, [])

  const formatDuration = (seconds) => {
    if (!seconds) return '00:00'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return '未知'
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const getVideoUrl = (item) => {
    if (!item?.path) return ''

    if (isTauriApp) {
      return convertFileSrc(item.path)
    }

    return videoService.getStreamUrl(item.id)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(video.id)
      setShowDeleteConfirm(false)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="video-modal-overlay" onClick={onClose}>
      <div className="video-modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        
        <div 
          className="video-player-wrapper"
          ref={videoContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {hasPrev && (
            <button
              className="modal-nav modal-nav-prev"
              onClick={handlePrev}
              title="上一个 (←)"
            >
              <span className="modal-nav-arrow">‹</span>
            </button>
          )}

          {hasNext && (
            <button
              className="modal-nav modal-nav-next"
              onClick={handleNext}
              title="下一个 (→)"
            >
              <span className="modal-nav-arrow">›</span>
            </button>
          )}

          {currentIndex >= 0 && navItems.length > 0 && (
            <div className="video-counter">{currentIndex + 1} / {navItems.length}</div>
          )}

          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomOut} title="缩小">−</button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button className="zoom-btn" onClick={handleZoomIn} title="放大">+</button>
            {scale !== 1 && (
              <button className="zoom-btn zoom-reset" onClick={handleResetZoom} title="重置">↺</button>
            )}
          </div>

          <video 
            key={video.id}
            src={getVideoUrl(video)}
            controls
            autoPlay
            className="video-player"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              transition: 'none',
              willChange: 'transform'
            }}
          />

        </div>
        
        <div className="video-sidebar">
          <div className="video-title">{video.filename}</div>
          
          <div className="video-details-grid">
            <div className="detail-row">
              <span className="detail-label">类型</span>
              <span className="detail-value">
                <span className="type-tag video">
                  <span className="type-tag-glyph" aria-hidden="true">
                    <span className="glyph-video">
                      <span className="glyph-video-play" />
                    </span>
                  </span>
                  <span>视频</span>
                </span>
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">大小</span>
              <span className="detail-value">{formatSize(video.size)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">时长</span>
              <span className="detail-value">{formatDuration(video.duration)}</span>
            </div>
            {video.width && video.height && (
              <div className="detail-row">
                <span className="detail-label">分辨率</span>
                <span className="detail-value">{video.width} × {video.height}</span>
              </div>
            )}
            {video.codec && (
              <div className="detail-row">
                <span className="detail-label">编码</span>
                <span className="detail-value">{video.codec}</span>
              </div>
            )}
            {video.fps && (
              <div className="detail-row">
                <span className="detail-label">帧率</span>
                <span className="detail-value">{video.fps} fps</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">拍摄时间</span>
              <span className="detail-value">{formatDate(video.dateTaken || video.createdAt)}</span>
            </div>
            <div className="detail-row full-width">
              <span className="detail-label">拍摄地点</span>
              <span className="detail-value detail-address">
                {videoAddress || (hasInvalidGps ? '拍摄地点：无效坐标' : '拍摄地点：空')}
              </span>
            </div>
          </div>

          <div className="detail-row full-width">
            <span className="detail-label">路径</span>
            <span className="detail-value path">{video.path}</span>
          </div>

          <div className="detail-row full-width detail-tags-section">
            <span className="detail-label">识别标签</span>
            <div className="detail-tags-list">
              {(video.aiTags || []).length > 0 ? (
                video.aiTags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="detail-tag ai-tag">{tag}</span>
                ))
              ) : (
                <span className="detail-tags-empty">暂无识别标签</span>
              )}
            </div>
          </div>

          <div className="detail-row full-width detail-tags-section">
            <span className="detail-label">标签</span>
            <div className="detail-tags-list">
              {(video.tags || []).length > 0 ? (
                video.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="detail-tag">{tag}</span>
                ))
              ) : (
                <span className="detail-tags-empty">暂无标签</span>
              )}
            </div>
          </div>

          <div className="video-actions">
            <button 
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              {deleting ? '删除中...' : <><TrashIcon size={14} />{' '}删除</>}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="确认移入回收站"
        message="确定要将这个视频移入回收站吗？"
        details={video.filename}
        confirmText={deleting ? '删除中...' : '确认移入回收站'}
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}

export default VideoModal
