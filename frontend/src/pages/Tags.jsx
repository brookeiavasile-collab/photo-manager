import React, { useState, useEffect } from 'react'
import { tagService } from '../services/api'
import '../styles/Tags.css'

function Tags() {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3498db')

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    try {
      const data = await tagService.getAll()
      setTags(data)
    } catch (error) {
      console.error('Failed to load tags:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return

    try {
      await tagService.create({
        name: newTagName,
        color: newTagColor
      })
      setNewTagName('')
      loadTags()
    } catch (error) {
      console.error('Failed to create tag:', error)
    }
  }

  const handleDeleteTag = async (id) => {
    if (window.confirm('确定要删除这个标签吗？')) {
      try {
        await tagService.delete(id)
        loadTags()
      } catch (error) {
        console.error('Failed to delete tag:', error)
      }
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="tags-page">
      <div className="page-header">
        <h1>标签</h1>
        <p>使用标签整理您的照片</p>
      </div>

      <div className="create-tag-form">
        <h3>创建新标签</h3>
        <div className="form-row">
          <input
            type="text"
            placeholder="标签名称"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleCreateTag()}
          />
          <input
            type="color"
            value={newTagColor}
            onChange={e => setNewTagColor(e.target.value)}
            title="选择标签颜色"
          />
          <button className="btn btn-primary" onClick={handleCreateTag}>创建标签</button>
        </div>
      </div>

      <div className="tags-list">
        {tags.length === 0 ? (
          <div className="no-tags">暂无标签</div>
        ) : (
          <div className="tags-grid">
            {tags.map(tag => (
              <div key={tag.id} className="tag-item">
                <div className="tag-color" style={{ backgroundColor: tag.color }} />
                <div className="tag-name">{tag.name}</div>
                <button 
                  className="delete-tag-btn"
                  onClick={() => handleDeleteTag(tag.id)}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Tags