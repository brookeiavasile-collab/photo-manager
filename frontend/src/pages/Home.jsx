import React, { useState, useEffect, useMemo, useRef } from 'react'
import { isTauriApp, mediaService, photoService, videoService } from '../services/api'
import scanService from '../services/scanService'
import MediaGrid from '../components/MediaGrid'
import PhotoModal from '../components/PhotoModal'
import VideoModal from '../components/VideoModal'
import DuplicateModal from '../components/DuplicateModal'
import { PhotoTypeIcon, VideoTypeIcon } from '../components/icons/AppIcons'
import '../styles/Home.css'

const STORAGE_KEY = 'media-manager-filters'

const loadFilters = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch (e) {}
  return {
    year: null,
    sortBy: 'dateTaken',
    sortOrder: 'desc',
    mediaTypes: ['photo', 'video'],
    aiTags: []
  }
}

const saveFilters = (filters) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch (e) {}
}

const normalizeMediaItem = (raw) => {
  if (!raw || typeof raw !== 'object') return raw

  const mediaType = raw.mediaType ?? raw.type ?? raw.media_type
  const normalizedType = mediaType === 'photo' || mediaType === 'video' ? mediaType : raw.mediaType
  const rawAddress = raw.address
  const rawExif = raw.exif

  return {
    ...raw,
    mediaType: normalizedType,
    createdAt: raw.createdAt ?? raw.created_at,
    dateTaken: raw.dateTaken ?? raw.date_taken,
    clickCount: raw.clickCount ?? raw.click_count,
    aiTags: raw.aiTags ?? raw.ai_tags,
    duplicateCount: raw.duplicateCount ?? raw.duplicate_count,
    width: raw.width ?? rawExif?.width,
    height: raw.height ?? rawExif?.height,
    address: rawAddress ? {
      ...rawAddress,
      displayName: rawAddress.displayName ?? rawAddress.display_name,
    } : rawAddress,
    exif: rawExif ? {
      ...rawExif,
      dateTime: rawExif.dateTime ?? rawExif.date_time,
      exposureTime: rawExif.exposureTime ?? rawExif.exposure_time,
      fNumber: rawExif.fNumber ?? rawExif.f_number,
      focalLength: rawExif.focalLength ?? rawExif.focal_length,
    } : rawExif,
  }
}

function Home() {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagingEnabled, setPagingEnabled] = useState(isTauriApp)
  const [nextCursor, setNextCursor] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [globalStats, setGlobalStats] = useState({ photos: 0, videos: 0 })
  const [filteredStats, setFilteredStats] = useState({ total: 0, photos: 0, videos: 0 })
  const [availableYears, setAvailableYears] = useState([])
  const [availableAiTags, setAvailableAiTags] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [duplicateItem, setDuplicateItem] = useState(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const refreshGuardRef = useRef(false)
  const lastScrollYRef = useRef(0)
  const showScrollTopRef = useRef(false)
  const tagsExpandGuardUntilRef = useRef(0)
  const viewedItemKeyRef = useRef('')
  const loadMoreSentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)
  const nextCursorRef = useRef(null)
  
  const savedFilters = useMemo(() => loadFilters(), [])
  const [year, setYear] = useState(savedFilters.year ?? (savedFilters.years?.[0] ?? null))
  const [sortBy, setSortBy] = useState(savedFilters.sortBy)
  const [sortOrder, setSortOrder] = useState(savedFilters.sortOrder)
  const [mediaTypes, setMediaTypes] = useState(savedFilters.mediaTypes || ['photo', 'video'])
  const [selectedAiTags, setSelectedAiTags] = useState(savedFilters.aiTags || [])

  const fetchGlobalStats = async () => {
    try {
      const [pStats, vStats] = await Promise.all([
        photoService.getStats(),
        videoService.getStats()
      ])
      setGlobalStats({ photos: pStats.total || 0, videos: vStats.total || 0 })
    } catch (err) {
      console.error('Failed to fetch global stats:', err)
    }
  }

  useEffect(() => {
    fetchGlobalStats()
    loadMedia()
  }, [])

  useEffect(() => {
    const unsubscribe = scanService.onAddressUpdate(() => {
      if (refreshGuardRef.current) return

      refreshGuardRef.current = true
      loadMedia()

      setTimeout(() => {
        refreshGuardRef.current = false
      }, 800)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    let rafId = 0

    const handleScroll = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        const currentScrollY = window.scrollY
        const shouldShow = currentScrollY > 480

        if (showScrollTopRef.current !== shouldShow) {
          showScrollTopRef.current = shouldShow
          setShowScrollTop(shouldShow)
        }

        if (
          tagsExpanded &&
          Date.now() > tagsExpandGuardUntilRef.current &&
          currentScrollY > 220 &&
          currentScrollY > lastScrollYRef.current
        ) {
          setTagsExpanded(false)
        }

        lastScrollYRef.current = currentScrollY
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [tagsExpanded])

  useEffect(() => {
    saveFilters({ year, sortBy, sortOrder, mediaTypes, aiTags: selectedAiTags })
  }, [year, sortBy, sortOrder, mediaTypes, selectedAiTags])

  useEffect(() => {
    if (!selectedItem?.id || !selectedItem?.mediaType) {
      viewedItemKeyRef.current = ''
      return
    }

    const viewKey = `${selectedItem.mediaType}:${selectedItem.id}`
    if (viewedItemKeyRef.current === viewKey) {
      return
    }
    viewedItemKeyRef.current = viewKey

    const incrementView = async () => {
      try {
        const updated = selectedItem.mediaType === 'photo'
          ? await photoService.incrementView(selectedItem.id)
          : await videoService.incrementView(selectedItem.id)

        setMedia(prev => prev.map(item => (
          item.id === updated.id && item.mediaType === selectedItem.mediaType
            ? { ...item, clickCount: updated.clickCount }
            : item
        )))

        setSelectedItem(prev => prev && prev.id === updated.id
          ? { ...prev, clickCount: updated.clickCount }
          : prev)
      } catch (error) {
        console.error('Failed to increment view count:', error)
      }
    }

    incrementView()
  }, [selectedItem?.id, selectedItem?.mediaType])

  const loadMedia = async () => {
    if (pagingEnabled) {
      setLoading(true)
      setMedia([])
      setNextCursor(null)
      setHasMore(false)
      hasMoreRef.current = false
      nextCursorRef.current = null
      await loadMorePage({ reset: true })
      setLoading(false)
      return
    }

    try {
      const data = await mediaService.getAll('all', sortBy, sortOrder)
      const normalized = Array.isArray(data) ? data.map(normalizeMediaItem) : []

      // 后端目前不提供每项 duplicateCount，这里用 md5 频次在前端计算。
      // 需求：重复数只展示在该组“最早拍摄”的那条媒体上。
      const groups = new Map()

      const getItemTime = (item) => {
        const primary = item?.dateTaken || item?.createdAt
        const t = new Date(primary || 0).getTime()
        return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
      }

      for (const item of normalized) {
        if (!item?.md5 || !item?.mediaType) continue
        const key = `${item.mediaType}:${item.md5}`
        const list = groups.get(key) || []
        list.push(item)
        groups.set(key, list)
      }

      const keeperIds = new Map() // key -> keeper id
      const duplicateCounts = new Map() // key -> (group_size - 1)

      for (const [key, list] of groups.entries()) {
        if (!Array.isArray(list) || list.length <= 1) continue

        let keeper = list[0]
        let keeperTime = getItemTime(keeper)

        for (let i = 1; i < list.length; i++) {
          const cand = list[i]
          const candTime = getItemTime(cand)
          if (candTime < keeperTime) {
            keeper = cand
            keeperTime = candTime
            continue
          }
          if (candTime === keeperTime) {
            const a = String(keeper?.filename || '')
            const b = String(cand?.filename || '')
            if (b.localeCompare(a, 'zh-CN') < 0) {
              keeper = cand
              keeperTime = candTime
            }
          }
        }

        if (keeper?.id) {
          keeperIds.set(key, keeper.id)
          duplicateCounts.set(key, list.length - 1)
        }
      }

      const withDuplicates = normalized.map((item) => {
        if (!item?.md5 || !item?.mediaType) {
          return { ...item, duplicateCount: 0 }
        }

        const key = `${item.mediaType}:${item.md5}`
        const keeperId = keeperIds.get(key)
        const count = duplicateCounts.get(key) || 0
        const show = keeperId && item.id === keeperId ? count : 0

        return { ...item, duplicateCount: show }
      })

      setMedia(withDuplicates)
      
      const pCount = withDuplicates.filter(m => m.mediaType === 'photo').length
      const vCount = withDuplicates.filter(m => m.mediaType === 'video').length
      setFilteredStats({
        total: withDuplicates.length,
        photos: pCount,
        videos: vCount
      })
      setGlobalStats({ photos: pCount, videos: vCount })
    } catch (error) {
      console.error('Failed to load media:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPageRequestType = useCallback(() => {
    if (selectedAiTags.length > 0) return 'photo'
    const types = mediaTypes || ['photo', 'video']
    if (types.length === 1) return types[0]
    return 'all'
  }, [selectedAiTags, mediaTypes])

  const loadMorePage = useCallback(async ({ reset = false } = {}) => {
    if (!pagingEnabled) return
    if (loadingMoreRef.current) return
    if (!reset && !hasMoreRef.current) return

    loadingMoreRef.current = true
    setLoadingMore(true)

    try {
      const res = await mediaService.getPage({
        type: getPageRequestType(),
        sortBy,
        sortOrder: sortOrder || 'desc',
        year: year || null,
        aiTags: selectedAiTags || [],
        cursor: reset ? null : nextCursorRef.current,
        limit: 2000
      })

      const items = Array.isArray(res?.items) ? res.items : []
      const normalized = items.map(normalizeMediaItem)
      const cursor = res?.nextCursor || null
      const more = Boolean(cursor)

      nextCursorRef.current = cursor
      hasMoreRef.current = more
      setNextCursor(cursor)
      setHasMore(more)
      
      setFilteredStats({
        total: res?.total || 0,
        photos: res?.totalPhotos || res?.total_photos || 0,
        videos: res?.totalVideos || res?.total_videos || 0
      })
      
      if (res?.availableYears || res?.available_years) {
        setAvailableYears(res?.availableYears || res?.available_years)
      }
      if (res?.availableAiTags || res?.available_ai_tags) {
        setAvailableAiTags(res?.availableAiTags || res?.available_ai_tags)
      }

      setMedia(prev => {
        if (reset) return normalized
        if (normalized.length === 0) return prev
        const seen = new Set(prev.map(it => `${it.mediaType}:${it.id}`))
        const merged = prev.slice()
        for (const it of normalized) {
          const key = `${it.mediaType}:${it.id}`
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(it)
          }
        }
        return merged
      })
    } catch (error) {
      console.error('Failed to load media page:', error)
      setHasMore(false)
      hasMoreRef.current = false
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [pagingEnabled, sortBy, sortOrder, year, selectedAiTags, mediaTypes])

  const computedAvailableYears = useMemo(() => {
    if (pagingEnabled) return availableYears
    
    const yearCounts = new Map()
    media.forEach(item => {
      const itemDate = new Date(item.dateTaken || item.createdAt)
      if (itemDate && !isNaN(itemDate.getTime())) {
        const y = itemDate.getFullYear()
        yearCounts.set(y, (yearCounts.get(y) || 0) + 1)
      }
    })
    
    return Array.from(yearCounts.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => b.year - a.year)
  }, [media, pagingEnabled, availableYears])

  const baseFilteredMedia = useMemo(() => {
    if (pagingEnabled) return media
    let result = media
    const types = mediaTypes || ['photo', 'video']

    if (types.length > 0 && types.length < 2) {
      result = result.filter(item => types.includes(item.mediaType))
    }

    if (year) {
      result = result.filter(item => {
        const itemDate = new Date(item.dateTaken || item.createdAt)
        return itemDate.getFullYear() === year
      })
    }

    return result
  }, [media, year, mediaTypes])

  const filteredMedia = useMemo(() => {
    if (pagingEnabled) return media
    let result = baseFilteredMedia

    if (selectedAiTags.length > 0) {
      result = result.filter(item => {
        if (item.mediaType !== 'photo') return false
        const itemTags = (item.aiTags || []).map(tag => String(tag).trim().toLowerCase())
        return selectedAiTags.some(tag => itemTags.includes(tag))
      })
    }

    const dir = sortOrder === 'asc' ? 1 : -1
    const sortKey = sortBy || 'dateTaken'

    const getDateTime = (item) => {
      const value = item?.dateTaken || item?.createdAt
      const t = new Date(value || 0).getTime()
      return Number.isFinite(t) ? t : 0
    }

    const getNumber = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    }

    const getString = (value) => (value == null ? '' : String(value))

    return [...result].sort((a, b) => {
      const byFilename = () => getString(a?.filename).localeCompare(getString(b?.filename), 'zh-CN')
      const byId = () => getString(a?.id).localeCompare(getString(b?.id), 'zh-CN')

      if (sortKey === 'dateTaken') {
        const cmp = (getDateTime(a) - getDateTime(b)) * dir
        if (cmp !== 0) return cmp
        const nameCmp = byFilename() * dir
        if (nameCmp !== 0) return nameCmp
        return byId() * dir
      }
      if (sortKey === 'createdAt') {
        const aTime = new Date(a?.createdAt || 0).getTime()
        const bTime = new Date(b?.createdAt || 0).getTime()
        const cmp = ((Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0)) * dir
        if (cmp !== 0) return cmp
        const nameCmp = byFilename() * dir
        if (nameCmp !== 0) return nameCmp
        return byId() * dir
      }
      if (sortKey === 'filename') {
        const cmp = byFilename() * dir
        if (cmp !== 0) return cmp
        return byId() * dir
      }
      if (sortKey === 'size') {
        const cmp = (getNumber(a?.size) - getNumber(b?.size)) * dir
        if (cmp !== 0) return cmp
        const nameCmp = byFilename() * dir
        if (nameCmp !== 0) return nameCmp
        return byId() * dir
      }
      if (sortKey === 'clickCount') {
        const cmp = (getNumber(a?.clickCount) - getNumber(b?.clickCount)) * dir
        if (cmp !== 0) return cmp
        const nameCmp = byFilename() * dir
        if (nameCmp !== 0) return nameCmp
        return byId() * dir
      }
      if (sortKey === 'duplicateCount') {
        const cmp = (getNumber(a?.duplicateCount) - getNumber(b?.duplicateCount)) * dir
        if (cmp !== 0) return cmp
        const nameCmp = byFilename() * dir
        if (nameCmp !== 0) return nameCmp
        return byId() * dir
      }

      const cmp = (getDateTime(a) - getDateTime(b)) * dir
      if (cmp !== 0) return cmp
      const nameCmp = byFilename() * dir
      if (nameCmp !== 0) return nameCmp
      return byId() * dir
    })
  }, [baseFilteredMedia, selectedAiTags, sortBy, sortOrder])

  const computedAvailableAiTags = useMemo(() => {
    if (pagingEnabled) {
      // 合并从后端获取的 tags 和当前选中的 tags（确保选中时不消失）
      const backendTags = availableAiTags || []
      const backendTagNames = new Set(backendTags.map(t => t.tag))
      const extraTags = selectedAiTags.filter(t => !backendTagNames.has(t)).map(t => ({ tag: t, count: 0 }))
      return [...backendTags, ...extraTags].sort((a, b) => a.tag.localeCompare(b.tag))
    }
    const tagCounts = new Map()

    filteredMedia
      .filter(item => item.mediaType === 'photo')
      .forEach(item => {
        const uniqueTags = new Set((item.aiTags || []).map(tag => String(tag).trim().toLowerCase()).filter(Boolean))

        uniqueTags.forEach(tag => {
          const normalizedTag = String(tag).trim().toLowerCase()
          if (normalizedTag) {
            tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1)
          }
        })
      })

    const visibleTags = new Set([...tagCounts.keys(), ...selectedAiTags])

    return Array.from(visibleTags)
      .sort((a, b) => a.localeCompare(b))
      .map(tag => ({
        tag,
        count: tagCounts.get(tag) || 0
      }))
  }, [filteredMedia, selectedAiTags, pagingEnabled, availableAiTags])

  useEffect(() => {
    if (!pagingEnabled) return
    loadMedia()
  }, [pagingEnabled, year, sortBy, sortOrder, mediaTypes, selectedAiTags])

  useEffect(() => {
    if (!pagingEnabled) return
    const el = loadMoreSentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      if (entry.isIntersecting) {
        loadMorePage()
      }
    }, { root: null, rootMargin: '1200px 0px 1200px 0px', threshold: 0.01 })

    observer.observe(el)
    return () => observer.disconnect()
  }, [pagingEnabled, loadMorePage])

  const handlePhotoUpdate = async (id, updates) => {
    try {
      await photoService.update(id, updates)
      loadMedia()
    } catch (error) {
      console.error('Failed to update photo:', error)
    }
  }

  const handlePhotoDelete = async (id) => {
    try {
      await photoService.delete(id)
      
      // Local state update
      setMedia(prev => prev.filter(item => !(item.id === id && item.mediaType === 'photo')))
      setGlobalStats(prev => ({ ...prev, photos: Math.max(0, prev.photos - 1) }))
      setFilteredStats(prev => ({ 
        ...prev, 
        total: Math.max(0, prev.total - 1),
        photos: Math.max(0, prev.photos - 1) 
      }))
      
      if (selectedItem?.id === id && selectedItem?.mediaType === 'photo') {
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Failed to delete:', error)
      throw error
    }
  }

  const handleVideoDelete = async (id) => {
    try {
      await videoService.delete(id)
      
      // Local state update
      setMedia(prev => prev.filter(item => !(item.id === id && item.mediaType === 'video')))
      setGlobalStats(prev => ({ ...prev, videos: Math.max(0, prev.videos - 1) }))
      setFilteredStats(prev => ({ 
        ...prev, 
        total: Math.max(0, prev.total - 1),
        videos: Math.max(0, prev.videos - 1) 
      }))
      
      if (selectedItem?.id === id && selectedItem?.mediaType === 'video') {
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Failed to delete video:', error)
      throw error
    }
  }

  const handleDuplicateDeleted = (deletedItem) => {
    // We update the duplicate count of the main item shown in the grid
    setMedia(prev => prev.map(item => {
      if (item.md5 === deletedItem.md5 && item.mediaType === deletedItem.mediaType) {
        return { 
          ...item, 
          duplicateCount: Math.max(0, (item.duplicateCount || 1) - (deletedItem.deletedCount || 1)) 
        }
      }
      return item
    }))
    
    // Update global stats
    if (deletedItem.mediaType === 'photo') {
      setGlobalStats(prev => ({ ...prev, photos: Math.max(0, prev.photos - (deletedItem.deletedCount || 1)) }))
    } else {
      setGlobalStats(prev => ({ ...prev, videos: Math.max(0, prev.videos - (deletedItem.deletedCount || 1)) }))
    }
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const handleDuplicateClick = (item) => {
    setDuplicateItem(item)
  }

  const toggleMediaType = (type) => {
    setMediaTypes(prev => {
      if (prev.includes(type)) {
        const filtered = prev.filter(t => t !== type)
        return filtered.length === 0 ? ['photo', 'video'] : filtered
      } else {
        return [...prev, type]
      }
    })
  }

  const toggleAiTag = (tag) => {
    setSelectedAiTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(item => item !== tag)
      }
      return [...prev, tag]
    })
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleTagsExpanded = () => {
    setTagsExpanded(prev => {
      const next = !prev
      if (next) {
        tagsExpandGuardUntilRef.current = Date.now() + 600
      }
      return next
    })
  }

  const typeFilters = [
    { value: 'photo', label: '照片', icon: <PhotoTypeIcon size={14} className="filter-type-icon" /> },
    { value: 'video', label: '视频', icon: <VideoTypeIcon size={14} className="filter-type-icon" /> },
  ]

  const sortOptions = [
    { value: 'dateTaken', label: '拍摄日期' },
    { value: 'createdAt', label: '创建日期' },
    { value: 'filename', label: '文件名' },
    { value: 'size', label: '文件大小' },
    { value: 'clickCount', label: '点击数' },
    { value: 'duplicateCount', label: '重复数' },
  ]

  const photoCount = globalStats.photos
  const videoCount = globalStats.videos
  const filteredPhotoCount = filteredStats.photos
  const filteredVideoCount = filteredStats.videos

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  return (
    <div className="home">
      <div className="page-header">
        <h1>我的媒体</h1>
        <p className="page-header-stats">
          <span className="summary-metric">
            <PhotoTypeIcon size={14} className="summary-icon" />
            <span>{photoCount}</span>
          </span>
          <span className="summary-divider">·</span>
          <span className="summary-metric">
            <VideoTypeIcon size={14} className="summary-icon" />
            <span>{videoCount}</span>
          </span>
        </p>
      </div>

      <div className="search-panel">
        <div className="filter-row">
          <div className="filter-group">
            <label>类型</label>
            <div className="filter-buttons">
              {typeFilters.map(opt => (
                <button
                  key={opt.value}
                  className={`filter-btn with-icon ${mediaTypes.includes(opt.value) ? 'active' : ''}`}
                  onClick={() => toggleMediaType(opt.value)}
                  type="button"
                >
                  <span className="filter-type-icon-wrap">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-top-right">
            <div className="filter-group sort-group">
              <label>排序</label>
              <div className="sort-options">
                {sortOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`filter-btn ${sortBy === opt.value ? 'active' : ''}`}
                    onClick={() => setSortBy(opt.value)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
                <button 
                  className={`sort-order-btn ${sortOrder}`}
                  onClick={toggleSortOrder}
                  type="button"
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>

            <div className="filter-summary top-summary" aria-live="polite">
              <span className="filter-summary-value">
                共 {filteredStats.total} 项
              </span>
              <span className="filter-summary-detail with-icon">
                <span className="summary-metric">
                  <PhotoTypeIcon size={13} className="summary-icon" />
                  <span>{filteredPhotoCount}</span>
                </span>
                <span className="summary-divider">·</span>
                <span className="summary-metric">
                  <VideoTypeIcon size={13} className="summary-icon" />
                  <span>{filteredVideoCount}</span>
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-group">
            <label>
              年份
              <span className="filter-label-count">({filteredStats.total}项)</span>
            </label>
            <div className="filter-buttons">
              <button
                className={`filter-btn ${!year ? 'active' : ''}`}
                onClick={() => setYear(null)}
                type="button"
              >
                全部
              </button>
              {computedAvailableYears.map(item => (
                <button
                  key={item.year}
                  className={`filter-btn ${year === item.year ? 'active' : ''}`}
                  onClick={() => setYear(item.year)}
                  type="button"
                >
                  {item.year} ({item.count})
                </button>
              ))}
            </div>
          </div>

          {computedAvailableAiTags.length > 0 && (
            <div className="filter-group tags-group vertical">
              <div className="tags-group-header">
                <label className="tags-group-label">识别标签</label>
                <button
                  className="tags-toggle-btn"
                  onClick={toggleTagsExpanded}
                  type="button"
                >
                  {tagsExpanded ? '收起' : '展开'}
                </button>
              </div>
              {selectedAiTags.length > 0 && (
                <div className="selected-tags-bar">
                  {selectedAiTags.map(tag => (
                    <button
                      key={tag}
                      className="selected-tag-chip"
                      onClick={() => toggleAiTag(tag)}
                      title={`移除标签：${tag}`}
                      type="button"
                    >
                      <span>{tag}</span>
                      <span className="selected-tag-remove">×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className={`filter-buttons ${tagsExpanded ? 'expanded' : 'collapsed'}`}>
                <button
                  className={`filter-btn ${selectedAiTags.length === 0 ? 'active' : ''}`}
                  onClick={() => setSelectedAiTags([])}
                  type="button"
                >
                  全部
                </button>
                {computedAvailableAiTags.map(tag => (
                  <button
                    key={tag.tag}
                    className={`filter-btn ${selectedAiTags.includes(tag.tag) ? 'active' : ''}`}
                    onClick={() => toggleAiTag(tag.tag)}
                    type="button"
                  >
                    {tag.tag} ({tag.count})
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <MediaGrid 
        items={filteredMedia} 
        onItemClick={setSelectedItem}
        onPhotoDelete={handlePhotoDelete}
        onVideoDelete={handleVideoDelete}
        onDuplicateClick={handleDuplicateClick}
      />

      {pagingEnabled && (
        <div
          ref={loadMoreSentinelRef}
          style={{ height: '1px' }}
          aria-hidden="true"
        />
      )}

      {pagingEnabled && loadingMore && (
        <div className="loading" style={{ marginTop: 16 }}>
          加载更多中...
        </div>
      )}

      {selectedItem && selectedItem.mediaType === 'photo' && (
        <PhotoModal
          photo={selectedItem}
          mediaItems={filteredMedia}
          onClose={() => setSelectedItem(null)}
          onUpdate={handlePhotoUpdate}
          onDelete={handlePhotoDelete}
          onNavigate={setSelectedItem}
        />
      )}

      {selectedItem && selectedItem.mediaType === 'video' && (
        <VideoModal
          video={selectedItem}
          mediaItems={filteredMedia}
          onClose={() => setSelectedItem(null)}
          onDelete={handleVideoDelete}
          onNavigate={setSelectedItem}
        />
      )}

      {duplicateItem && (
        <DuplicateModal
          photo={duplicateItem}
          onClose={() => setDuplicateItem(null)}
          onRefresh={() => handleDuplicateDeleted(duplicateItem)}
        />
      )}

      {showScrollTop && (
        <button
          className="scroll-top-btn"
          onClick={scrollToTop}
          title="回到顶部"
          aria-label="回到顶部"
          type="button"
        >
          ↑
        </button>
      )}
    </div>
  )
}

export default Home
