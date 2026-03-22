import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { albumService, photoService } from '../services/api'
import MediaGrid from '../components/MediaGrid'
import PhotoModal from '../components/PhotoModal'
import '../styles/AlbumDetail.css'

function AlbumDetail() {
  const { id } = useParams()
  const [album, setAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
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

      const allPhotos = await photoService.getAll()
      const albumPhotos = allPhotos.filter(p => albumData.photos.includes(p.id))
      setPhotos(albumPhotos)
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
      const updatedPhotos = photos.map(p => 
        p.id === photoId ? { ...p, ...updates } : p
      )
      setPhotos(updatedPhotos)
    } catch (error) {
      console.error('Failed to update photo:', error)
    }
  }

  const handlePhotoDelete = async (photoId) => {
    try {
      await photoService.delete(photoId)
      setPhotos(prev => prev.filter(photo => photo.id !== photoId))
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null)
      }
    } catch (error) {
      console.error('Failed to delete photo:', error)
      throw error
    }
  }

  const albumMedia = photos.map(photo => ({
    ...photo,
    mediaType: 'photo'
  }))

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
              <p className="photo-count">{photos.length} 张照片</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
              编辑相册
            </button>
          </>
        )}
      </div>

      <MediaGrid 
        items={albumMedia}
        onItemClick={setSelectedPhoto}
        onPhotoDelete={handlePhotoDelete}
      />

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          photos={photos}
          onClose={() => setSelectedPhoto(null)}
          onUpdate={handlePhotoUpdate}
          onDelete={handlePhotoDelete}
          onNavigate={setSelectedPhoto}
        />
      )}
    </div>
  )
}

export default AlbumDetail
