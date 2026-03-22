import { invoke } from '@tauri-apps/api/core';

// Photo APIs
export const photoApi = {
  getAll: () => invoke('get_photos'),
  getById: (id: string) => invoke('get_photo', { id }),
  update: (id: string, data: any) => invoke('update_photo', { id, data }),
  delete: (id: string) => invoke('delete_photo', { id }),
  getDuplicates: (md5: string) => invoke('get_duplicate_photos', { md5 }),
};

// Video APIs
export const videoApi = {
  getAll: () => invoke('get_videos'),
  getById: (id: string) => invoke('get_video', { id }),
  update: (id: string, data: any) => invoke('update_video', { id, data }),
  delete: (id: string) => invoke('delete_video', { id }),
  getDuplicates: (md5: string) => invoke('get_duplicate_videos', { md5 }),
};

// Media APIs (combined)
export const mediaApi = {
  getAll: (filters?: any) => invoke('get_media', { filters }),
};

// Album APIs
export const albumApi = {
  getAll: () => invoke('get_albums'),
  create: (data: any) => invoke('create_album', { data }),
  update: (id: string, data: any) => invoke('update_album', { id, data }),
  delete: (id: string) => invoke('delete_album', { id }),
  addPhotos: (id: string, photoIds: string[]) => invoke('add_photos_to_album', { id, photoIds }),
};

// Tag APIs
export const tagApi = {
  getAll: () => invoke('get_tags'),
  create: (name: string) => invoke('create_tag', { name }),
  delete: (id: string) => invoke('delete_tag', { id }),
};

// Directory APIs
export const directoryApi = {
  getAll: () => invoke('get_directories'),
  add: (path: string) => invoke('add_directory', { path }),
  remove: (path: string) => invoke('remove_directory', { path }),
  scan: (path: string, options?: any) => invoke('scan_directory', { path, options }),
  stopScan: () => invoke('stop_scan'),
  getScanState: () => invoke('get_scan_state'),
};

// Trash APIs
export const trashApi = {
  getAll: () => invoke('get_trash'),
  restore: (id: string) => invoke('restore_media', { id }),
  restoreAll: () => invoke('restore_all'),
  deletePermanently: (id: string) => invoke('delete_permanently', { id }),
  empty: () => invoke('empty_trash'),
};

// Config APIs
export const configApi = {
  get: () => invoke('get_config'),
  update: (data: any) => invoke('update_config', { data }),
};