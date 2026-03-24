import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { albumService, photoService, videoService } from '../services/api'
import MediaGrid from '../components/MediaGrid'
import PhotoModal from '../components/PhotoModal'
import VideoModal from '../components/VideoModal'
import '../styles/AlbumDetail.css'

function AlbumDetail() {
  const { id } = useParams()
  const [album, setAlbum] = useState(null)
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [albumDescription, setAlbumDescription] = useState('')

  useEffect(() => {
    loadAlbum()
  }, [id])

  const loadAlbum = async () => {
    try {
      const albumData = await albumService.getById(id)
      setAlbum(albumData)
      setAlbumName(albumData.name)
      setAlbumDescription(albumData.description || '')

      const [allPhotos, allVideos] = await Promise.all([
        photoService.getAll(),
        videoService.getAll()
      ])
      
      const albumPhotos = allPhotos
        .filter(p => albumData.photos.includes(p.id))
        .map(p => ({ ...p, mediaType: 'photo' }))
        
      const albumVideos = allVideos
        .filter(v => (albumData.videos || []).includes(v.id))
        .map(v => ({ ...v, mediaType: 'video' }))

      const combined = [...albumPhotos, ...albumVideos].sort((a, b) => {
        const tA = new Date(a.dateTaken || a.createdAt).getTime()
        const tB = new Date(b.dateTaken || b.createdAt).getTime()
        return tB - tA
      })
      
      setMedia(combined)
    } catch (error) {
      console.error('Failed to load album:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateAlbum = async () => {
    try {
      await albumService.update(id, {
        name: albumName,
        description: albumDescription
      })
      setAlbum({ ...album, name: albumName, description: albumDescription })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update album:', error)
    }
  }

  const handlePhotoUpdate = async (photoId, updates) => {
    try {
      await photoService.update(photoId, updates)
      const updatedMedia = media.map(m => 
        (m.id === photoId && m.mediaType === 'photo') ? { ...m, ...updates } : m
      )
      setMedia(updatedMedia)
    } catch (error) {
      console.error('Failed to update photo:', error)
    }
  }

  const handlePhotoDelete = async (photoId) => {
    try {
      await photoService.delete(photoId)
      setMedia(prev => prev.filter(m => !(m.id === photoId && m.mediaType === 'photo')))
      if (selectedItem?.id === photoId && selectedItem?.mediaType === 'photo') {
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Failed to delete photo:', error)
      throw error
    }
  }

  const handleVideoDelete = async (videoId) => {
    try {
      await videoService.delete(videoId)
      setMedia(prev => prev.filter(m => !(m.id === videoId && m.mediaType === 'video')))
      if (selectedItem?.id === videoId && selectedItem?.mediaType === 'video') {
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Failed to delete video:', error)
      throw error
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  if (!album) {
    return <div className="error">相册不存在</div>
  }

  return (
    <div className="album-detail">
      <div className="album-header">
        {isEditing ? (
          <div className="edit-form">
            <input
              type="text"
              value={albumName}
              onChange={e => setAlbumName(e.target.value)}
              placeholder="相册名称"
            />
            <textarea
              value={albumDescription}
              onChange={e => setAlbumDescription(e.target.value)}
              placeholder="相册描述"
            />
            <div className="edit-actions">
              <button className="btn btn-primary" onClick={handleUpdateAlbum}>保存</button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <div className="album-header-info">
              <h1>{album.name}</h1>
              {album.description && <p>{album.description}</p>}
              <p className="photo-count">{media.length} 项媒体</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
              编辑相册
            </button>
          </>
        )}
      </div>

      <MediaGrid 
        items={media}
        onItemClick={setSelectedItem}
        onPhotoDelete={handlePhotoDelete}
        onVideoDelete={handleVideoDelete}
      />

      {selectedItem?.mediaType === 'photo' && (
        <PhotoModal
          photo={selectedItem}
          mediaItems={media}
          onClose={() => setSelectedItem(null)}
          onUpdate={handlePhotoUpdate}
          onDelete={handlePhotoDelete}
          onNavigate={setSelectedItem}
        />
      )}
      
      {selectedItem?.mediaType === 'video' && (
        <VideoModal
          video={selectedItem}
          mediaItems={media}
          onClose={() => setSelectedItem(null)}
          onDelete={handleVideoDelete}
          onNavigate={setSelectedItem}
        />
      )}
    </div>
  )
}

export default AlbumDetail
