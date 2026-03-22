import axios from 'axios'
import { invoke, isTauri as isTauriRuntime } from '@tauri-apps/api/core'

const isTauri = () => {
  try {
    return isTauriRuntime()
  } catch (_) {
    return false
  }
}

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    return `${protocol}//${hostname}:5000/api`
  }
  return 'http://localhost:5000/api'
}

export const API_BASE_URL = getApiBaseUrl()
export const isTauriApp = isTauri()
export const HTTP_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '')

async function callApi(command, args = {}, httpFallback = null) {
  if (isTauri()) {
    try {
      console.log(`[Tauri] Invoking ${command}`, args)
      const result = await invoke(command, args)
      console.log(`[Tauri] ${command} result:`, result)
      return result
    } catch (err) {
      console.error(`Tauri invoke ${command} failed:`, err)
      throw err
    }
  }
  if (httpFallback) {
    return httpFallback()
  }
  throw new Error(`No HTTP fallback for command: ${command}`)
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
})

// ==================== Photo Service ====================
export const photoService = {
  async getAll() {
    return callApi('get_photos', {}, 
      () => api.get('/photos').then(r => r.data))
  },

  async getStats() {
    return callApi('get_photo_stats', {},
      () => api.get('/photos/stats').then(r => r.data))
  },

  async search(params) {
    if (isTauri()) {
      const all = await callApi('get_photos', {})
      const items = Array.isArray(all) ? all : []
      const q = String(params?.q || params?.query || params?.keyword || '').trim().toLowerCase()
      if (!q) return items

      return items.filter((p) => {
        const hay = `${p?.filename || ''} ${p?.path || ''}`.toLowerCase()
        return hay.includes(q)
      })
    }

    return api.get('/photos/search', { params }).then(r => r.data)
  },

  async getById(id) {
    return callApi('get_photo', { id },
      () => api.get(`/photos/${id}`).then(r => r.data))
  },

  async update(id, data) {
    return callApi('update_photo', { id, data },
      () => api.put(`/photos/${id}`, data).then(r => r.data))
  },

  async incrementView(id) {
    return callApi('increment_photo_view', { id },
      () => api.post(`/photos/${id}/view`).then(r => r.data))
  },

  async delete(id) {
    return callApi('delete_photo', { id },
      () => api.delete(`/photos/${id}`).then(r => r.data))
  },

  async getDuplicates(md5) {
    return callApi('get_duplicate_photos', { md5 },
      () => api.get(`/photos/duplicates/${md5}`).then(r => r.data))
  }
}

// ==================== Video Service ====================
export const videoService = {
  async getAll(sortBy = 'createdAt', sortOrder = 'desc') {
    return callApi('get_videos', {},
      () => api.get(`/videos?sortBy=${sortBy}&sortOrder=${sortOrder}`).then(r => r.data))
  },

  async getById(id) {
    return callApi('get_video', { id },
      () => api.get(`/videos/${id}`).then(r => r.data))
  },

  async getStats() {
    return callApi('get_video_stats', {},
      () => api.get('/videos/stats').then(r => r.data))
  },

  async getDuplicates(md5) {
    return callApi('get_duplicate_videos', { md5 },
      () => api.get(`/videos/duplicates/${md5}`).then(r => r.data))
  },

  async update(id, data) {
    return callApi('update_video', { id, data },
      () => api.put(`/videos/${id}`, data).then(r => r.data))
  },

  async incrementView(id) {
    return callApi('increment_video_view', { id },
      () => api.post(`/videos/${id}/view`).then(r => r.data))
  },

  async delete(id) {
    return callApi('delete_video', { id },
      () => api.delete(`/videos/${id}`).then(r => r.data))
  },

  getStreamUrl(id) {
    return `${API_BASE_URL}/videos/file/${id}`
  }
}

// ==================== Album Service ====================
export const albumService = {
  normalize(raw) {
    if (!raw || typeof raw !== 'object') return raw

    // 兼容 Tauri(Rust) 字段 photoIds/videoIds 与旧 HTTP 字段 photos/videos
    const photos = raw.photos ?? raw.photoIds ?? raw.photo_ids ?? []
    const videos = raw.videos ?? raw.videoIds ?? raw.video_ids ?? []

    return {
      ...raw,
      photos: Array.isArray(photos) ? photos : [],
      videos: Array.isArray(videos) ? videos : [],
    }
  },

  async getAll() {
    const data = await callApi('get_albums', {},
      () => api.get('/albums').then(r => r.data))
    return Array.isArray(data) ? data.map(this.normalize) : []
  },

  async getById(id) {
    const data = await callApi('get_album', { id },
      () => api.get(`/albums/${id}`).then(r => r.data))
    return data ? this.normalize(data) : null
  },

  async create(data) {
    return callApi('create_album', { name: data.name, description: data.description },
      () => api.post('/albums', data).then(r => r.data)).then(this.normalize)
  },

  async update(id, data) {
    return callApi('update_album', { id, name: data.name, description: data.description },
      () => api.put(`/albums/${id}`, data).then(r => r.data)).then((res) => res)
  },

  async delete(id) {
    return callApi('delete_album', { id },
      () => api.delete(`/albums/${id}`).then(r => r.data))
  },

  async addPhotos(id, photoIds) {
    return callApi('add_photos_to_album', { id, photoIds },
      () => api.post(`/albums/${id}/photos`, { photoIds }).then(r => r.data))
  },

  async removePhotos(id, photoIds) {
    return callApi('remove_photos_from_album', { id, photoIds },
      () => api.delete(`/albums/${id}/photos`, { data: { photoIds } }).then(r => r.data))
  }
}

// ==================== Tag Service ====================
export const tagService = {
  async getAll() {
    return callApi('get_tags', {},
      () => api.get('/tags').then(r => r.data))
  },

  async create(data) {
    return callApi('create_tag', { name: data.name },
      () => api.post('/tags', data).then(r => r.data))
  },

  async delete(id) {
    return callApi('delete_tag', { id },
      () => api.delete(`/tags/${id}`).then(r => r.data))
  }
}

// ==================== Directory Service ====================
export const directoryService = {
  async getAll() {
    return callApi('get_directories', {},
      () => api.get('/directories').then(r => r.data))
  },

  async browse(path) {
    return callApi('browse', path ? { path } : {},
      () => api.get('/directories/browse', { params: path ? { path } : {} }).then(r => r.data))
  },

  async add(path) {
    return callApi('add_directory', { path },
      () => api.post('/directories', { path }).then(r => r.data))
  },

  async remove(path) {
    return callApi('remove_directory', { path },
      () => api.delete('/directories', { data: { path } }).then(r => r.data))
  },

  async scan() {
    if (isTauri()) {
      throw new Error('Tauri 模式下请使用 scan_directory(path)')
    }
    return api.post('/directories/scan').then(r => r.data)
  },

  async stopScan() {
    return callApi('stop_scan', {},
      () => api.post('/directories/scan/stop').then(r => r.data))
  },

  async scanDirectory(path, options = {}) {
    return callApi('scan_directory', { path, force: options.force },
      () => api.post(`/directories/scan/${encodeURIComponent(path)}`, { options }).then(r => r.data))
  },

  async backfillAddresses() {
    return callApi('backfill_photo_addresses', {},
      () => api.post('/directories/backfill-addresses').then(r => r.data))
  },

  async getAddressBackfillState() {
    return callApi('get_address_backfill_state', {},
      () => api.get('/directories/backfill-addresses/state').then(r => r.data))
  },

  scanWithProgress(onProgress) {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`${API_BASE_URL}/directories/scan-stream`)
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onProgress(data)
        
        if (data.type === 'complete' || data.type === 'error') {
          eventSource.close()
          if (data.type === 'complete') {
            resolve(data)
          } else {
            reject(new Error(data.error))
          }
        }
      }
      
      eventSource.onerror = (error) => {
        eventSource.close()
        reject(error)
      }
    })
  },

  scanDirectoryWithProgress(path, onProgress) {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`${API_BASE_URL}/directories/scan-stream/${encodeURIComponent(path)}`)
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onProgress(data)
        
        if (data.type === 'complete' || data.type === 'error') {
          eventSource.close()
          if (data.type === 'complete') {
            resolve(data)
          } else {
            reject(new Error(data.error))
          }
        }
      }
      
      eventSource.onerror = (error) => {
        eventSource.close()
        reject(error)
      }
    })
  }
}

// ==================== Trash Service ====================
export const trashService = {
  async getAll() {
    return callApi('get_trash', {},
      () => api.get('/trash').then(r => r.data))
  },

  async restore(id, type) {
    return callApi('restore_media', { id, mediaType: type },
      () => api.post(`/trash/${id}/restore`).then(r => r.data))
  },

  async restoreAll() {
    return callApi('restore_all_trash', {},
      () => api.post('/trash/restore-all').then(r => r.data))
  },

  async deletePermanently(id, type) {
    return callApi('delete_permanently', { id, mediaType: type },
      () => api.delete(`/trash/${id}`).then(r => r.data))
  },

  async emptyTrash() {
    return callApi('empty_trash', {},
      () => api.delete('/trash').then(r => r.data))
  }
}

// ==================== Duplicate Service ====================
export const duplicateService = {
  async getDuplicates(md5) {
    return callApi('get_duplicate_photos', { md5 },
      () => api.get(`/photos/duplicates/${md5}`).then(r => r.data))
  },

  async deleteDuplicates(md5) {
    return callApi('delete_duplicate_photos', { md5 },
      () => api.delete(`/photos/duplicates/${md5}`).then(r => r.data))
  },

  async getVideoDuplicates(md5) {
    return callApi('get_duplicate_videos', { md5 },
      () => api.get(`/videos/duplicates/${md5}`).then(r => r.data))
  },

  async deleteVideoDuplicates(md5) {
    return callApi('delete_duplicate_videos', { md5 },
      () => api.delete(`/videos/duplicates/${md5}`).then(r => r.data))
  }
}

// ==================== Media Service ====================
export const mediaService = {
  async getAll(type = 'all', sortBy = 'createdAt', sortOrder = 'desc') {
    return callApi('get_media', {},
      () => api.get(`/media?type=${type}&sortBy=${sortBy}&sortOrder=${sortOrder}`).then(r => r.data))
  },

  async getStats() {
    if (isTauri()) {
      const all = await callApi('get_media', {})
      const items = Array.isArray(all) ? all : []
      let photos = 0
      let videos = 0
      for (const it of items) {
        const t = it?.type || it?.mediaType
        if (t === 'photo') photos++
        else if (t === 'video') videos++
      }
      return { total: items.length, photos, videos }
    }

    return api.get('/media/stats').then(r => r.data)
  }
}

// ==================== Config Service ====================
export const configService = {
  async get() {
    return callApi('get_config', {},
      () => api.get('/config').then(r => r.data))
  },

  async update(config) {
    return callApi('update_config', { config },
      () => api.put('/config', config).then(r => r.data))
  }
}

// ==================== Cache Service ====================
export const cacheService = {
  async getStats() {
    return callApi('get_cache_stats', {},
      () => api.get('/cache/stats').then(r => r.data))
  },

  async clear(type) {
    return callApi('clear_cache', { cacheType: type },
      () => api.delete('/cache', { params: { type } }).then(r => r.data))
  }
}
