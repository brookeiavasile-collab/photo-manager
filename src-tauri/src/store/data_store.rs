use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::models::{Photo, Video, Album, Tag, Config};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Data {
    pub photos: Vec<Photo>,
    pub videos: Vec<Video>,
    pub albums: Vec<Album>,
    pub tags: Vec<Tag>,
}

pub struct DataStore {
    data_dir: PathBuf,
    data: Arc<RwLock<Data>>,
    config: Arc<RwLock<Config>>,
}

impl DataStore {
    pub fn new(data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&data_dir).ok();
        let store = Self {
            data_dir,
            data: Arc::new(RwLock::new(Data::default())),
            config: Arc::new(RwLock::new(Config::default())),
        };
        store
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    pub fn thumbnails_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("thumbnails");
        std::fs::create_dir_all(&dir).ok();
        dir
    }

    // Photos
    pub async fn get_photos(&self) -> Vec<Photo> {
        self.data.read().await.photos.clone()
    }

    pub async fn save_photos(&self, photos: Vec<Photo>) {
        let mut data = self.data.write().await;
        data.photos = photos;
        self.save_data(&data).await;
    }

    pub async fn replace_photos_in_dir(&self, dir_prefix: &str, photos_in_dir: Vec<Photo>, flush: bool) {
        let snapshot = {
            let mut data = self.data.write().await;
            data.photos.retain(|p| !p.path.starts_with(dir_prefix));
            data.photos.extend(photos_in_dir);
            if flush { Some(data.clone()) } else { None }
        };

        if let Some(data) = snapshot {
            self.save_data(&data).await;
        }
    }

    pub async fn add_photo(&self, photo: Photo) {
        let mut data = self.data.write().await;
        data.photos.push(photo);
        self.save_data(&data).await;
    }

    pub async fn get_photo_by_id(&self, id: &str) -> Option<Photo> {
        self.data.read().await.photos.iter().find(|p| p.id == id).cloned()
    }

    pub async fn update_photo(&self, id: &str, updates: Photo) -> bool {
        let mut data = self.data.write().await;
        if let Some(photo) = data.photos.iter_mut().find(|p| p.id == id) {
            *photo = updates;
            self.save_data(&data).await;
            return true;
        }
        false
    }

    pub async fn increment_photo_view(&self, id: &str) -> Option<Photo> {
        let mut data = self.data.write().await;
        let photo = data.photos.iter_mut().find(|p| p.id == id && !p.deleted)?;
        photo.click_count = photo.click_count.saturating_add(1);
        let updated = photo.clone();
        self.save_data(&data).await;
        Some(updated)
    }

    pub async fn delete_photo(&self, id: &str) -> bool {
        let mut data = self.data.write().await;
        if let Some(photo) = data.photos.iter_mut().find(|p| p.id == id) {
            photo.deleted = true;
            photo.deleted_at = Some(chrono::Utc::now().to_rfc3339());
            self.save_data(&data).await;
            return true;
        }
        false
    }

    // Videos
    pub async fn get_videos(&self) -> Vec<Video> {
        self.data.read().await.videos.clone()
    }

    pub async fn save_videos(&self, videos: Vec<Video>) {
        let mut data = self.data.write().await;
        data.videos = videos;
        self.save_data(&data).await;
    }

    pub async fn replace_videos_in_dir(&self, dir_prefix: &str, videos_in_dir: Vec<Video>, flush: bool) {
        let snapshot = {
            let mut data = self.data.write().await;
            data.videos.retain(|v| !v.path.starts_with(dir_prefix));
            data.videos.extend(videos_in_dir);
            if flush { Some(data.clone()) } else { None }
        };

        if let Some(data) = snapshot {
            self.save_data(&data).await;
        }
    }

    pub async fn add_video(&self, video: Video) {
        let mut data = self.data.write().await;
        data.videos.push(video);
        self.save_data(&data).await;
    }

    pub async fn get_video_by_id(&self, id: &str) -> Option<Video> {
        self.data.read().await.videos.iter().find(|v| v.id == id).cloned()
    }

    pub async fn increment_video_view(&self, id: &str) -> Option<Video> {
        let mut data = self.data.write().await;
        let video = data.videos.iter_mut().find(|v| v.id == id && !v.deleted)?;
        video.click_count = video.click_count.saturating_add(1);
        let updated = video.clone();
        self.save_data(&data).await;
        Some(updated)
    }

    pub async fn delete_video(&self, id: &str) -> bool {
        let mut data = self.data.write().await;
        if let Some(video) = data.videos.iter_mut().find(|v| v.id == id) {
            video.deleted = true;
            video.deleted_at = Some(chrono::Utc::now().to_rfc3339());
            self.save_data(&data).await;
            return true;
        }
        false
    }

    // Albums
    pub async fn get_albums(&self) -> Vec<Album> {
        self.data.read().await.albums.clone()
    }

    pub async fn get_album_by_id(&self, id: &str) -> Option<Album> {
        self.data.read().await.albums.iter().find(|a| a.id == id).cloned()
    }

    pub async fn upsert_album(&self, album: Album) {
        let mut data = self.data.write().await;
        if let Some(existing) = data.albums.iter_mut().find(|a| a.id == album.id) {
            *existing = album;
        } else {
            data.albums.push(album);
        }
        self.save_data(&data).await;
    }

    pub async fn delete_album(&self, id: &str) -> bool {
        let mut data = self.data.write().await;
        let len_before = data.albums.len();
        data.albums.retain(|a| a.id != id);
        if data.albums.len() < len_before {
            self.save_data(&data).await;
            return true;
        }
        false
    }

    // Tags
    pub async fn get_tags(&self) -> Vec<Tag> {
        self.data.read().await.tags.clone()
    }

    pub async fn add_tag(&self, tag: Tag) {
        let mut data = self.data.write().await;
        data.tags.push(tag);
        self.save_data(&data).await;
    }

    pub async fn delete_tag(&self, id: &str) -> bool {
        let mut data = self.data.write().await;
        let len_before = data.tags.len();
        data.tags.retain(|t| t.id != id);
        if data.tags.len() < len_before {
            self.save_data(&data).await;
            return true;
        }
        false
    }

    // Config
    pub async fn get_config(&self) -> Config {
        self.config.read().await.clone()
    }

    pub async fn update_config(&self, updates: Config) {
        let mut config = self.config.write().await;
        *config = updates;
        self.save_config(&config).await;
    }

    // Persistence
    async fn save_data(&self, data: &Data) {
        let path = self.data_dir.join("data.json");
        if let Ok(json) = serde_json::to_string_pretty(data) {
            let _ = tokio::fs::write(&path, json).await;
        }
    }

    async fn save_config(&self, config: &Config) {
        let path = self.data_dir.join("config.json");
        if let Ok(json) = serde_json::to_string_pretty(config) {
            let _ = tokio::fs::write(&path, json).await;
        }
    }

    pub async fn load(&self) {
        // Load data
        let data_path = self.data_dir.join("data.json");
        if data_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&data_path).await {
                if let Ok(data) = serde_json::from_str::<Data>(&content) {
                    let mut d = self.data.write().await;
                    *d = data;
                }
            }
        }

        // Load config
        let config_path = self.data_dir.join("config.json");
        if config_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&config_path).await {
                if let Ok(config) = serde_json::from_str::<Config>(&content) {
                    let mut c = self.config.write().await;
                    *c = config;
                }
            }
        }
    }
}
