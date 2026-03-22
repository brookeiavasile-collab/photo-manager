import React, { useState, useEffect } from 'react'
import { directoryService } from '../services/api'
import { FolderPathIcon } from './icons/AppIcons'
import '../styles/DirectoryBrowser.css'

function DirectoryBrowser({ onSelect, onCancel }) {
  const [currentPath, setCurrentPath] = useState('')
  const [directories, setDirectories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [quickAccessPaths, setQuickAccessPaths] = useState([])
  const [homePath, setHomePath] = useState('')

  useEffect(() => {
    loadDirectories()
  }, [])

const loadDirectories = async (targetPath) => {
  setLoading(true)
  setError(null)
  console.log('[DirectoryBrowser] Loading directories, path:', targetPath)
    try {
      const data = await directoryService.browse(targetPath)
      console.log('[DirectoryBrowser] Browse result:', data)
      setCurrentPath(data.currentPath)
      setDirectories(data.directories || [])
      setQuickAccessPaths(data.quickAccessPaths || [])
      setHomePath(data.homePath || '')
    } catch (err) {
    console.error('[DirectoryBrowser] Error:', err)
    const errorMsg = err.message || err.response?.data?.error || '加载目录失败'
    if (errorMsg.includes('EPERM') || errorMsg.includes('operation not permitted')) {
      setError('权限被拒绝。在 macOS 上，请前往系统设置 → 隐私与安全性 → 完全磁盘访问权限，添加终端应用。')
    } else {
      setError(errorMsg)
    }
  } finally {
    setLoading(false)
  }
}

  const handleDirectoryClick = (dir) => {
    loadDirectories(dir.path)
  }

  const handleGoUp = () => {
    if (currentPath && currentPath !== homePath) {
      const parts = currentPath.split('/').filter(Boolean)
      if (parts.length > 1) {
        loadDirectories(`/${parts.slice(0, -1).join('/')}`)
      } else {
        loadDirectories(homePath)
      }
    }
  }

  const handleSelect = () => {
    onSelect(currentPath)
  }

  const handleQuickAccess = (path) => {
    loadDirectories(path)
  }

  return (
    <div className="directory-browser-overlay">
      <div className="directory-browser">
        <div className="browser-header">
          <h3>选择媒体目录</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="permission-hint">
          <span className="hint-icon">ℹ️</span>
          <span>支持路径：用户主目录、C/D/E/F 盘（Windows）、外置硬盘</span>
        </div>

        <div className="quick-access">
          {quickAccessPaths.map(item => (
            <button 
              key={item.path}
              className="quick-access-btn"
              onClick={() => handleQuickAccess(item.path)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="current-path">
          <button 
            className="up-btn" 
            onClick={handleGoUp}
            disabled={!currentPath || currentPath === homePath}
          >
            ↑ 上级
          </button>
          <input 
            type="text" 
            value={currentPath} 
            onChange={e => setCurrentPath(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                loadDirectories(currentPath)
              }
            }}
          />
        </div>

        <div className="directory-list">
          {loading ? (
            <div className="loading-text">加载中...</div>
          ) : error ? (
            <div className="error-text">{error}</div>
          ) : directories.length === 0 ? (
            <div className="empty-text">无子目录</div>
          ) : (
            directories.map((dir, index) => (
              <div 
                key={dir.path}
                className="directory-item"
                onClick={() => handleDirectoryClick(dir)}
              >
                <span className="folder-icon"><FolderPathIcon size={16} /></span>
                <span className="directory-name">{dir.name}</span>
              </div>
            ))
          )}
        </div>

        <div className="browser-footer">
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn btn-primary" onClick={handleSelect}>
            选择 "{currentPath.split('/').pop() || '/'}"
          </button>
        </div>
      </div>
    </div>
  )
}

export default DirectoryBrowser
