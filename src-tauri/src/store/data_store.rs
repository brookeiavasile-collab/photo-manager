use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use serde::de::DeserializeOwned;

use crate::models::{Photo, Video, Album, Tag, Config};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Data {
    #[serde(default)]
    pub photos: Vec<Photo>,
    #[serde(default)]
    pub videos: Vec<Video>,
    #[serde(default)]
    pub albums: Vec<Album>,
    #[serde(default)]
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

    pub async fn get_photo_by_id(&self, id: &str) -> Option<Photo> {
        let data = self.data.read().await;
        data.photos.iter().find(|p| p.id == id).cloned()
    }

    pub async fn get_video_by_id(&self, id: &str) -> Option<Video> {
        let data = self.data.read().await;
        data.videos.iter().find(|v| v.id == id).cloned()
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

    pub async fn update_video(&self, id: &str, updates: Video) -> bool {
        let mut data = self.data.write().await;
        if let Some(video) = data.videos.iter_mut().find(|v| v.id == id) {
            *video = updates;
            self.save_data(&data).await;
            true
        } else {
            false
        }
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
        let tmp_path = self.data_dir.join("data.json.tmp");
        let bak_path = self.data_dir.join("data.json.bak");
        if let Ok(json) = serde_json::to_string_pretty(data) {
            if let Err(e) = tokio::fs::write(&tmp_path, json).await {
                eprintln!("ERROR: Failed to write temp data.json: {}", e);
                return;
            }
            if path.exists() {
                if let Err(e) = tokio::fs::copy(&path, &bak_path).await {
                    eprintln!("WARNING: Failed to backup data.json: {}", e);
                }
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    eprintln!("WARNING: Failed to remove old data.json: {}", e);
                }
            }
            if let Err(e) = tokio::fs::rename(&tmp_path, &path).await {
                eprintln!("CRITICAL: Failed to replace data.json: {}", e);
                let _ = tokio::fs::remove_file(&tmp_path).await;
            }
        }
    }

    async fn save_config(&self, config: &Config) {
        let path = self.data_dir.join("config.json");
        let tmp_path = self.data_dir.join("config.json.tmp");
        let bak_path = self.data_dir.join("config.json.bak");
        if let Ok(json) = serde_json::to_string_pretty(config) {
            if let Err(e) = tokio::fs::write(&tmp_path, json).await {
                eprintln!("ERROR: Failed to write temp config.json: {}", e);
                return;
            }
            if path.exists() {
                if let Err(e) = tokio::fs::copy(&path, &bak_path).await {
                    eprintln!("WARNING: Failed to backup config.json: {}", e);
                }
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    eprintln!("WARNING: Failed to remove old config.json: {}", e);
                }
            }
            if let Err(e) = tokio::fs::rename(&tmp_path, &path).await {
                eprintln!("CRITICAL: Failed to replace config.json: {}", e);
                let _ = tokio::fs::remove_file(&tmp_path).await;
            }
        }
    }

    async fn read_json_with_backup<T: DeserializeOwned>(
        &self,
        primary: &PathBuf,
        backup: &PathBuf,
        label: &str,
    ) -> Option<T> {
        if primary.exists() {
            match tokio::fs::read_to_string(primary).await {
                Ok(content) => match serde_json::from_str::<T>(&content) {
                    Ok(parsed) => return Some(parsed),
                    Err(e) => eprintln!("CRITICAL: Failed to parse {}: {}", label, e),
                },
                Err(e) => eprintln!("ERROR: Failed to read {}: {}", label, e),
            }
        }

        if backup.exists() {
            match tokio::fs::read_to_string(backup).await {
                Ok(content) => match serde_json::from_str::<T>(&content) {
                    Ok(parsed) => {
                        eprintln!("WARNING: Loaded {} from backup file", label);
                        return Some(parsed);
                    }
                    Err(e) => eprintln!("CRITICAL: Failed to parse backup {}: {}", label, e),
                },
                Err(e) => eprintln!("ERROR: Failed to read backup {}: {}", label, e),
            }
        }
        None
    }

    pub async fn load(&self) {
        let data_path = self.data_dir.join("data.json");
        let data_bak_path = self.data_dir.join("data.json.bak");
        if let Some(data) = self
            .read_json_with_backup::<Data>(&data_path, &data_bak_path, "data.json")
            .await
        {
            let mut d = self.data.write().await;
            *d = data;
        }

        let config_path = self.data_dir.join("config.json");
        let config_bak_path = self.data_dir.join("config.json.bak");
        if let Some(config) = self
            .read_json_with_backup::<Config>(&config_path, &config_bak_path, "config.json")
            .await
        {
            let mut c = self.config.write().await;
            *c = config;
        }
    }
}
