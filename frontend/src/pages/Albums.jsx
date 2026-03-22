import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { albumService } from '../services/api'
import '../styles/Albums.css'

function Albums() {
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [newAlbumDescription, setNewAlbumDescription] = useState('')

  useEffect(() => {
    loadAlbums()
  }, [])

  const loadAlbums = async () => {
    try {
      const data = await albumService.getAll()
      setAlbums(data)
    } catch (error) {
      console.error('Failed to load albums:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim()) return

    try {
      await albumService.create({
        name: newAlbumName,
        description: newAlbumDescription
      })
      setNewAlbumName('')
      setNewAlbumDescription('')
      setShowCreateForm(false)
      loadAlbums()
    } catch (error) {
      console.error('Failed to create album:', error)
    }
  }

  const handleDeleteAlbum = async (id) => {
    if (window.confirm('确定要删除这个相册吗？')) {
      try {
        await albumService.delete(id)
        loadAlbums()
      } catch (error) {
        console.error('Failed to delete album:', error)
      }
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="albums-page">
      <div className="page-header">
        <h1>相册</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
          创建相册
        </button>
      </div>

      {showCreateForm && (
        <div className="create-album-form">
          <h3>创建新相册</h3>
          <input
            type="text"
            placeholder="相册名称"
            value={newAlbumName}
            onChange={e => setNewAlbumName(e.target.value)}
          />
          <textarea
            placeholder="描述（可选）"
            value={newAlbumDescription}
            onChange={e => setNewAlbumDescription(e.target.value)}
          />
          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleCreateAlbum}>创建</button>
            <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="albums-grid">
        {albums.map(album => (
          <div key={album.id} className="album-card">
            <Link to={`/albums/${album.id}`}>
              <div className="album-preview">
                <div className="album-photo-count">{album.photos.length} 张照片</div>
              </div>
              <div className="album-info">
                <h3>{album.name}</h3>
                {album.description && <p>{album.description}</p>}
              </div>
            </Link>
            <button 
              className="delete-album-btn"
              onClick={() => handleDeleteAlbum(album.id)}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Albums