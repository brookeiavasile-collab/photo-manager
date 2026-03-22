import React, { useState, useEffect, useRef } from 'react'
import { directoryService, photoService, videoService } from '../services/api'
import scanService from '../services/scanService'
import ConfirmModal from '../components/ConfirmModal'
import DirectoryBrowser from '../components/DirectoryBrowser'
import { CheckIcon, PlusIcon, RefreshIcon, SyncIcon, PhotoTypeIcon, VideoTypeIcon } from '../components/icons/AppIcons'
import { listen } from '@tauri-apps/api/event'
import '../styles/Settings.css'

function Settings() {
  const [directories, setDirectories] = useState([])
  const [photoCount, setPhotoCount] = useState(0)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const [videoCount, setVideoCount] = useState(0)
  const [videoDuplicateCount, setVideoDuplicateCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showBrowser, setShowBrowser] = useState(false)
  const [scanState, setScanState] = useState(scanService.getState())
  const [confirmState, setConfirmState] = useState(null)
  const [backfillingAddresses, setBackfillingAddresses] = useState(false)
  const [addressBackfillSummary, setAddressBackfillSummary] = useState(null)
  const [addressBackfillProgress, setAddressBackfillProgress] = useState(null)
  const logContainerRef = useRef(null)
  const handledResultRef = useRef(null)

  useEffect(() => {
    loadData()
    scanService.checkAndResume()
    
    const unsubscribe = scanService.subscribe((state) => {
      setScanState({ ...state })
      
      if (state.scanning && state.scannedCount > 0) {
        setPhotoCount(state.scannedCount)
      }
      
      if (!state.result) {
        handledResultRef.current = null
        return
      }

      // 扫描完成或被停止后都刷新目录数量
      if (handledResultRef.current !== state.result) {
        handledResultRef.current = state.result
        loadData()
      }
    })
    
    return unsubscribe
  }, [])

  useEffect(() => {
    let unlistenStarted
    let unlistenProgress
    let unlistenComplete

    const setup = async () => {
      try {
        const state = await directoryService.getAddressBackfillState()
        if (state?.running) {
          setBackfillingAddresses(true)
          setAddressBackfillProgress({
            total: state.total || 0,
            scanned: state.scanned || 0,
            updated: state.updated || 0,
            skipped: state.skipped || 0,
            filename: state.filename || '',
            status: state.status || 'processing',
          })
        } else if (state && (state.total || state.scanned || state.updated || state.skipped)) {
          setBackfillingAddresses(false)
          setAddressBackfillSummary({
            total: state.total || 0,
            scanned: state.scanned || 0,
            updated: state.updated || 0,
            skipped: state.skipped || 0,
          })
        }
      } catch (error) {
        console.error('Failed to get address backfill state:', error)
      }

      unlistenStarted = await listen('address-backfill-started', (event) => {
        const payload = event.payload || {}
        setBackfillingAddresses(true)
        setAddressBackfillProgress({
          total: payload.total || 0,
          scanned: 0,
          updated: 0,
          skipped: 0,
          filename: '',
          status: 'started',
        })
      })

      unlistenProgress = await listen('address-backfill-progress', (event) => {
        const payload = event.payload || {}
        setAddressBackfillProgress({
          total: payload.total || 0,
          scanned: payload.scanned || 0,
          updated: payload.updated || 0,
          skipped: payload.skipped || 0,
          filename: payload.filename || '',
          status: payload.status || 'processing',
        })
      })

      unlistenComplete = await listen('address-backfill-complete', (event) => {
        const payload = event.payload || {}
        setBackfillingAddresses(false)
        setAddressBackfillProgress(null)
        setAddressBackfillSummary(payload)
      })
    }

    setup()

    return () => {
      if (unlistenStarted) unlistenStarted()
      if (unlistenProgress) unlistenProgress()
      if (unlistenComplete) unlistenComplete()
    }
  }, [])

  // 扫描进行中时，周期性刷新目录数量（后台阶段性保存后这里能立刻反映）
  useEffect(() => {
    if (!scanState.scanning) return

    const timer = setInterval(() => {
      refreshDirectoriesOnly()
    }, 1200)

    return () => clearInterval(timer)
  }, [scanState.scanning])

  useEffect(() => {
    if (!logContainerRef.current) return

    const container = logContainerRef.current
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [scanState.logs])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dirs, stats, videoStats] = await Promise.all([
        directoryService.getAll(),
        photoService.getStats(),
        videoService.getStats()
      ])
      setDirectories(dirs)
      setPhotoCount(stats.total)
      setDuplicateCount(stats.duplicates)
      setVideoCount(videoStats.total)
      setVideoDuplicateCount(videoStats.duplicates || 0)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshDirectoriesOnly = async () => {
    try {
      const dirs = await directoryService.getAll()
      setDirectories(dirs)
    } catch (error) {
      console.error('Failed to refresh directories:', error)
    }
  }

  const handleSelectDirectory = async (path) => {
    setShowBrowser(false)
    
    try {
      const updated = await directoryService.add(path)
      setDirectories(updated)
    } catch (error) {
      console.error('Failed to add directory:', error)
      alert(error.response?.data?.error || 'Failed to add directory')
    }
  }

  const handleRemoveDirectory = async (dir) => {
    try {
      const result = await directoryService.remove(dir.path)
      setDirectories(result.directories)
      setPhotoCount(prev => Math.max(0, prev - result.removedPhotos))
      setConfirmState(null)
    } catch (error) {
      console.error('Failed to remove directory:', error)
    }
  }

  const handleScanDirectory = (dirPath) => {
    scanService.startScan(dirPath)
  }

  const handleForceScan = (dirPath) => {
    scanService.startScan(dirPath, { force: true })
    setConfirmState(null)
  }

  const handleStopScan = () => {
    scanService.stopScan()
  }

  const openRemoveDirectoryConfirm = (dir) => {
    setConfirmState({
      title: '确认移除目录',
      message: `确定要移除此目录吗？该目录下的 ${dir.photoCount} 张照片和 ${dir.videoCount || 0} 个视频元数据将被移除。`,
      details: dir.path,
      confirmText: '确认移除',
      tone: 'danger',
      onConfirm: () => handleRemoveDirectory(dir)
    })
  }

  const openForceScanConfirm = (dirPath) => {
    setConfirmState({
      title: '确认强制重新扫描',
      message: '这将重新生成该目录中照片和视频的元数据与缩略图；已有标签、备注和相册关联会保留。',
      details: dirPath,
      confirmText: '确认强制扫描',
      tone: 'primary',
      onConfirm: () => handleForceScan(dirPath)
    })
  }

  const handleClearLogs = () => {
    scanService.clearLogs()
  }

  const handleBackfillAddresses = async () => {
    setBackfillingAddresses(true)
    setAddressBackfillSummary(null)
    setAddressBackfillProgress({
      total: 0,
      scanned: 0,
      updated: 0,
      skipped: 0,
      filename: '',
      status: 'starting',
    })
    setConfirmState(null)
    try {
      const result = await directoryService.backfillAddresses()
      setAddressBackfillSummary(result)
      setAddressBackfillProgress(null)
      await loadData()
      scanService.notifyAddressUpdate()
    } catch (error) {
      console.error('Failed to backfill addresses:', error)
      alert(error?.message || '补全地址失败，请重试')
      setAddressBackfillProgress(null)
      setBackfillingAddresses(false)
    } finally {
      setBackfillingAddresses(false)
    }
  }

  const openBackfillAddressesConfirm = () => {
    setConfirmState({
      title: '确认补全地址',
      message: '会对已扫描照片中“有 GPS 但缺少地址”的项目进行补全，不会重新生成缩略图，也不会全量重扫文件。',
      confirmText: backfillingAddresses ? '补全中...' : '开始补全',
      tone: 'primary',
      onConfirm: handleBackfillAddresses,
    })
  }

  const getLogTypeClass = (type) => {
    switch (type) {
      case 'success': return 'log-success'
      case 'error': return 'log-error'
      case 'warning': return 'log-warning'
      case 'start': return 'log-start'
      case 'skip': return 'log-skip'
      default: return 'log-info'
    }
  }

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>设置</h1>
        <p>配置媒体目录</p>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <div className="section-header-left">
            <h2>媒体目录</h2>
            <div className="section-description-wrapper">
              <p className="section-description">
                添加待索引目录，系统会递归扫描。<br />
                <span className="media-stat">
                  <PhotoTypeIcon size={13} className="media-stat-icon" />
                  <strong>{photoCount}</strong>
                  {duplicateCount > 0 && <span className="duplicate-info">（重复 <strong>{duplicateCount}</strong>）</span>}
                </span>
                <span className="media-stat-separator"> · </span>
                <span className="media-stat">
                  <VideoTypeIcon size={13} className="media-stat-icon" />
                  <strong>{videoCount}</strong>
                  {videoDuplicateCount > 0 && <span className="duplicate-info">（重复 <strong>{videoDuplicateCount}</strong>）</span>}
                </span>
              </p>
              {addressBackfillSummary && (
                <p className="section-description address-summary">
                  最近一次地址补全：检查 <strong>{addressBackfillSummary.scanned}</strong> 张，补全 <strong>{addressBackfillSummary.updated}</strong> 张，跳过 <strong>{addressBackfillSummary.skipped}</strong> 张。
                </p>
              )}
            </div>
          </div>
          <div className="section-actions">
            <button
              className="btn-backfill-address"
              onClick={openBackfillAddressesConfirm}
              disabled={backfillingAddresses || scanState.scanning}
              type="button"
              title="为已扫描照片补全地址信息"
            >
              <RefreshIcon size={14} /> {backfillingAddresses ? '补全中...' : '补全地址'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowBrowser(true)} type="button">
              <PlusIcon size={14} /> 添加目录
            </button>
          </div>
        </div>
        {addressBackfillProgress && (
          <div className="address-progress-card">
            <div className="address-progress-text">
              正在补全地址：已检查 <strong>{addressBackfillProgress.scanned + addressBackfillProgress.skipped}</strong> / <strong>{addressBackfillProgress.total || '?'}</strong>，新增 <strong>{addressBackfillProgress.updated}</strong> 条
            </div>
            {addressBackfillProgress.filename && (
              <div className="address-progress-file" title={addressBackfillProgress.filename}>
                当前文件：{addressBackfillProgress.filename}
              </div>
            )}
          </div>
        )}

        <div className="directories-list">
          {directories.length === 0 ? (
            <div className="no-directories">
              暂无配置目录，点击"添加目录"开始。
            </div>
          ) : (
            directories.map((dir) => {
              const isScanning = scanState.scanning && scanState.scanningDir === dir.path;
              const isQueued = scanState.queued && scanState.queued.includes(dir.path);
              const queuePosition = isQueued ? scanState.queued.indexOf(dir.path) + 1 : 0;
              
              return (
                <div key={dir.path} className="directory-item">
                  <div className="directory-info">
                    <span className="directory-path">{dir.path}</span>
                    <span className="directory-count">
                      <span className="media-stat">
                        <PhotoTypeIcon size={12} className="media-stat-icon" />
                        <span>{dir.photoCount}</span>
                      </span>
                      <span className="media-stat-separator"> · </span>
                      <span className="media-stat">
                        <VideoTypeIcon size={12} className="media-stat-icon" />
                        <span>{dir.videoCount || 0}</span>
                      </span>
                    </span>
                  </div>
                  <div className="directory-actions">
                    {isScanning ? (
                      <>
                        <button 
                          className="btn-scan"
                          disabled
                        >
                          扫描中...
                        </button>
                        <button 
                          className="btn-stop"
                          onClick={handleStopScan}
                          title="停止当前扫描"
                        >
                          停止
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          className="btn-scan"
                          onClick={() => handleScanDirectory(dir.path)}
                          disabled={isQueued}
                          title="增量扫描此目录（仅处理新增或已变化的文件）"
                        >
                          {isQueued ? `排队中 (${queuePosition})` : <><SyncIcon size={14} /> 同步</>}
                        </button>
                        <button 
                          className="btn-force-scan"
                          onClick={() => openForceScanConfirm(dir.path)}
                          title="强制重新扫描（重新生成所有照片和视频的元数据与缩略图）"
                        >
                          <RefreshIcon size={14} /> 强制
                        </button>
                      </>
                    )}
                    <button 
                      className="btn-remove"
                      onClick={() => openRemoveDirectoryConfirm(dir)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {scanState.logs && scanState.logs.length > 0 && (
          <div className="scan-logs-section">
            <div className="logs-header">
              <h3>处理日志</h3>
              <button className="btn btn-sm btn-secondary" onClick={handleClearLogs}>
                清除日志
              </button>
            </div>
            <div className="logs-container" ref={logContainerRef}>
              {scanState.logs.map((log, index) => (
                <div key={log.id || index} className={`log-entry ${getLogTypeClass(log.type)}`}>
                  <span className="log-time">
                    {new Date(log.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h2>关于</h2>
        <p className="section-description">
          照片管理器是一个本地照片管理系统，帮助您按日期、标签和相册组织和搜索照片。
        </p>
        <ul className="about-list">
          <li><CheckIcon size={14} className="about-icon" /> 自动提取 EXIF 元数据</li>
          <li><CheckIcon size={14} className="about-icon" /> 生成缩略图快速浏览</li>
          <li><CheckIcon size={14} className="about-icon" /> 按日期范围搜索照片</li>
          <li><CheckIcon size={14} className="about-icon" /> 创建相册和添加标签</li>
          <li><CheckIcon size={14} className="about-icon" /> 为照片添加备注</li>
        </ul>
      </div>

      {showBrowser && (
        <DirectoryBrowser
          onSelect={handleSelectDirectory}
          onCancel={() => setShowBrowser(false)}
        />
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        details={confirmState?.details}
        confirmText={confirmState?.confirmText}
        tone={confirmState?.tone || 'danger'}
        busy={backfillingAddresses}
        onConfirm={confirmState?.onConfirm}
        onClose={() => setConfirmState(null)}
      />
    </div>
  )
}

export default Settings
