import React, { useState, useEffect, useCallback, useRef } from 'react'
import ConfirmModal from './ConfirmModal'
import TrashIcon from './icons/TrashIcon'
import { FolderPathIcon } from './icons/AppIcons'
import { isTauriApp, HTTP_ROOT_URL } from '../services/api'
import { convertFileSrc } from '@tauri-apps/api/core'
import '../styles/PhotoModal.css'

function PhotoModal({ photo, photos = [], mediaItems = null, onClose, onUpdate, onDelete, onNavigate }) {
  const [tags, setTags] = useState(photo.tags || [])
  const [notes, setNotes] = useState(photo.notes || '')
  const [newTag, setNewTag] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const imageContainerRef = useRef(null)
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

  const navItems = Array.isArray(mediaItems) && mediaItems.length > 0 ? mediaItems : photos
  const currentIndex = navItems.findIndex(item => item?.id === photo?.id && item?.mediaType === photo?.mediaType)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < navItems.length - 1
  
  const getPhotoUrl = (path) => {
    if (isTauriApp) {
      return convertFileSrc(path)
    }
    return `${HTTP_ROOT_URL}/photos/${encodeURIComponent(path)}`
  }

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
    setTags(photo.tags || [])
    setNotes(photo.notes || '')
    setIsEditing(false)
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [photo.id])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    positionRef.current = position
  }, [position])

  useEffect(() => {
    const container = imageContainerRef.current
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

  if (!photo) return null

  const handleAddTag = async () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      const updatedTags = [...tags, newTag.trim()]
      setTags(updatedTags)
      await onUpdate(photo.id, { tags: updatedTags })
      setNewTag('')
    }
  }

  const handleRemoveTag = async (tagToRemove) => {
    const updatedTags = tags.filter(tag => tag !== tagToRemove)
    setTags(updatedTags)
    await onUpdate(photo.id, { tags: updatedTags })
  }

  const handleNotesSave = async () => {
    await onUpdate(photo.id, { notes })
    setIsEditing(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(photo.id)
      setShowDeleteConfirm(false)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const formatAddress = (address) => {
    if (!address) return null
    if (address.displayName || address.display_name) return address.displayName || address.display_name
    
    const parts = []
    if (address.country) parts.push(address.country)
    if (address.province) parts.push(address.province)
    if (address.city) parts.push(address.city)
    if (address.district) parts.push(address.district)
    if (address.road) parts.push(address.road)
    
    return parts.length > 0 ? parts.join(', ') : null
  }

  const isInvalidGps = (gps) => {
    if (!gps) return false
    const lat = gps.latitude
    const lon = gps.longitude
    return lat === 0 && lon === 0
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown'
    return new Date(dateString).toLocaleString()
  }

  const photoAddress = formatAddress(photo.address)
  const gps = photo.exif?.gps
  const hasInvalidGps = isInvalidGps(gps)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose}>×</button>
        
        <div 
          className="modal-image-container"
          ref={imageContainerRef}
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
            <div className="photo-counter">{currentIndex + 1} / {navItems.length}</div>
          )}

          <div className="zoom-controls">
            <button className="zoom-btn" onClick={handleZoomOut} title="缩小">−</button>
            <span className="zoom-level">{Math.round(scale * 100)}%</span>
            <button className="zoom-btn" onClick={handleZoomIn} title="放大">+</button>
            {scale !== 1 && (
              <button className="zoom-btn zoom-reset" onClick={handleResetZoom} title="重置">↺</button>
            )}
          </div>
          
          <img 
            src={getPhotoUrl(photo.path)} 
            alt={photo.filename}
            className="modal-image"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
              cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              transition: 'none',
              willChange: 'transform'
            }}
            draggable={false}
          />
        </div>
        
        <div className="modal-sidebar">
          <div className="modal-section">
            <h3>详细信息</h3>
            <p>
              <span className="type-tag photo">
                <span className="type-tag-glyph" aria-hidden="true">
                  <span className="glyph-photo">
                    <span className="glyph-photo-dot" />
                  </span>
                </span>
                <span>照片</span>
              </span>
            </p>
            <p><strong>{photo.filename}</strong></p>
            <p className="photo-path" title={photo.path}>
              <span className="path-label"><FolderPathIcon size={12} className="inline-label-icon" /> 路径：</span>
              <span className="path-value">{photo.path}</span>
            </p>
            <p>大小: {(photo.size / 1024 / 1024).toFixed(2)} MB</p>
            <p>拍摄时间: {formatDate(photo.dateTaken)}</p>
          </div>

          {photo.exif && (
            <div className="modal-section">
              <h3>EXIF 信息</h3>
              <div className="exif-item">
                <span className="exif-label">相机:</span>
                <span className="exif-value">{photo.exif.make} {photo.exif.model}</span>
              </div>
              {photo.exif.fNumber && (
                <div className="exif-item">
                  <span className="exif-label">光圈:</span>
                  <span className="exif-value">f/{photo.exif.fNumber}</span>
                </div>
              )}
              {photo.exif.exposureTime && (
                <div className="exif-item">
                  <span className="exif-label">曝光:</span>
                  <span className="exif-value">{photo.exif.exposureTime}s</span>
                </div>
              )}
              {photo.exif.iso && (
                <div className="exif-item">
                  <span className="exif-label">ISO:</span>
                  <span className="exif-value">{photo.exif.iso}</span>
                </div>
              )}
            </div>
          )}

          <div className="modal-section">
            <h3>📍 拍摄地点</h3>
            {photoAddress ? (
              <p className="location-address">{photoAddress}</p>
            ) : hasInvalidGps ? (
              <p className="location-pending">拍摄地点：无效坐标</p>
            ) : (
              <p className="location-pending">拍摄地点：空</p>
            )}
          </div>

          <div className="modal-section">
            <h3>识别标签</h3>
            <div className="tags-container">
              {(photo.aiTags || []).length > 0 ? (
                photo.aiTags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="tag ai-tag">
                    {tag}
                  </span>
                ))
              ) : (
                <p className="empty-tags-text">暂无识别标签</p>
              )}
            </div>
          </div>

          <div className="modal-section">
            <h3>标签</h3>
            <div className="tags-container">
              {tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                  <span className="tag-remove" onClick={() => handleRemoveTag(tag)}>×</span>
                </span>
              ))}
            </div>
            <div className="add-tag-form">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleAddTag()}
                placeholder="添加标签..."
              />
              <button className="btn btn-primary" onClick={handleAddTag}>添加</button>
            </div>
          </div>

          <div className="modal-section">
            <h3>备注</h3>
            {isEditing ? (
              <>
                <textarea
                  className="notes-textarea"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="添加照片备注..."
                />
                <button className="btn btn-primary" style={{marginTop: '8px'}} onClick={handleNotesSave}>
                  保存备注
                </button>
              </>
            ) : (
              <p onClick={() => setIsEditing(true)} style={{cursor: 'pointer'}}>
                {notes || '点击添加备注...'}
              </p>
            )}
          </div>

          <div className="modal-section">
            <button 
              className="btn btn-danger full-width" 
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              {deleting ? '删除中...' : <><TrashIcon size={14} />{' '}移入回收站</>}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="确认移入回收站"
        message="确定要将这张照片移入回收站吗？"
        details={photo.filename}
        confirmText={deleting ? '删除中...' : '确认移入回收站'}
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}

export default PhotoModal
