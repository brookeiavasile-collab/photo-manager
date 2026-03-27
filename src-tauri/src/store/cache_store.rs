use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAddress {
    pub country: Option<String>,
    pub province: Option<String>,
    pub city: Option<String>,
    pub district: Option<String>,
    pub road: Option<String>,
    pub display_name: Option<String>,
}

impl From<CachedAddress> for crate::models::Address {
    fn from(addr: CachedAddress) -> Self {
        Self {
            country: addr.country,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            road: addr.road,
            display_name: addr.display_name,
        }
    }
}

impl From<crate::models::Address> for CachedAddress {
    fn from(addr: crate::models::Address) -> Self {
        Self {
            country: addr.country,
            province: addr.province,
            city: addr.city,
            district: addr.district,
            road: addr.road,
            display_name: addr.display_name,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAiTags {
    pub category: String,
    pub tags: Vec<String>,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GpsCache {
    #[serde(flatten)]
    pub entries: HashMap<String, CachedAddress>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AiCache {
    #[serde(flatten)]
    pub entries: HashMap<String, CachedAiTags>,
}

pub struct CacheStore {
    data_dir: PathBuf,
    gps_cache: Arc<RwLock<GpsCache>>,
    ai_cache: Arc<RwLock<AiCache>>,
}

impl CacheStore {
    pub fn new(data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&data_dir).ok();
        let store = Self {
            data_dir,
            gps_cache: Arc::new(RwLock::new(GpsCache::default())),
            ai_cache: Arc::new(RwLock::new(AiCache::default())),
        };
        store
    }

    pub fn make_gps_key(lat: f64, lon: f64) -> String {
        format!("{:.6},{:.6}", lat, lon)
    }

    pub async fn get_address(&self, lat: f64, lon: f64) -> Option<CachedAddress> {
        let key = Self::make_gps_key(lat, lon);
        self.gps_cache.read().await.entries.get(&key).cloned()
    }

    pub async fn save_address(&self, lat: f64, lon: f64, address: CachedAddress) {
        let key = Self::make_gps_key(lat, lon);
        let mut cache = self.gps_cache.write().await;
        cache.entries.insert(key, address);
        self.save_gps_cache(&cache).await;
    }

    pub async fn save_address_mem(&self, lat: f64, lon: f64, address: CachedAddress) {
        let key = Self::make_gps_key(lat, lon);
        let mut cache = self.gps_cache.write().await;
        cache.entries.insert(key, address);
    }

    pub async fn get_ai_tags(&self, md5: &str) -> Option<CachedAiTags> {
        self.ai_cache.read().await.entries.get(md5).cloned()
    }

    pub async fn save_ai_tags(&self, md5: &str, tags: CachedAiTags) {
        let mut cache = self.ai_cache.write().await;
        cache.entries.insert(md5.to_string(), tags);
        self.save_ai_cache(&cache).await;
    }

    pub fn get_address_sync(&self, lat: f64, lon: f64) -> Option<CachedAddress> {
        let key = Self::make_gps_key(lat, lon);
        tauri::async_runtime::block_on(async {
            self.gps_cache.read().await.entries.get(&key).cloned()
        })
    }

    pub fn save_address_sync(&self, lat: f64, lon: f64, address: CachedAddress) {
        let key = Self::make_gps_key(lat, lon);
        tauri::async_runtime::block_on(async {
            let snapshot = {
                let mut cache = self.gps_cache.write().await;
                cache.entries.insert(key, address);
                cache.clone()
            };
            self.save_gps_cache(&snapshot).await;
        })
    }

    pub fn get_ai_tags_sync(&self, md5: &str) -> Option<CachedAiTags> {
        tauri::async_runtime::block_on(async {
            self.ai_cache.read().await.entries.get(md5).cloned()
        })
    }

    pub fn save_ai_tags_sync(&self, md5: &str, tags: CachedAiTags) {
        let md5 = md5.to_string();
        tauri::async_runtime::block_on(async {
            let snapshot = {
                let mut cache = self.ai_cache.write().await;
                cache.entries.insert(md5, tags);
                cache.clone()
            };
            self.save_ai_cache(&snapshot).await;
        })
    }

    // 仅更新内存缓存（用于扫描阶段批量写回）
    pub fn save_address_mem_sync(&self, lat: f64, lon: f64, address: CachedAddress) {
        let key = Self::make_gps_key(lat, lon);
        tauri::async_runtime::block_on(async {
            let mut cache = self.gps_cache.write().await;
            cache.entries.insert(key, address);
        })
    }

    pub fn save_ai_tags_mem_sync(&self, md5: &str, tags: CachedAiTags) {
        let md5 = md5.to_string();
        tauri::async_runtime::block_on(async {
            let mut cache = self.ai_cache.write().await;
            cache.entries.insert(md5, tags);
        })
    }

    pub async fn flush_all(&self) {
        let gps_snapshot = self.gps_cache.read().await.clone();
        let ai_snapshot = self.ai_cache.read().await.clone();
        self.save_gps_cache(&gps_snapshot).await;
        self.save_ai_cache(&ai_snapshot).await;
    }

    pub async fn get_gps_cache_size(&self) -> usize {
        self.gps_cache.read().await.entries.len()
    }

    pub async fn get_ai_cache_size(&self) -> usize {
        self.ai_cache.read().await.entries.len()
    }

    async fn save_gps_cache(&self, cache: &GpsCache) {
        let path = self.data_dir.join("gps_cache.json");
        if let Ok(json) = serde_json::to_string_pretty(cache) {
            if let Err(e) = tokio::fs::write(&path, json).await {
                eprintln!("Failed to save gps_cache.json: {}", e);
            }
        }
    }

    async fn save_ai_cache(&self, cache: &AiCache) {
        let path = self.data_dir.join("ai_cache.json");
        if let Ok(json) = serde_json::to_string_pretty(cache) {
            if let Err(e) = tokio::fs::write(&path, json).await {
                eprintln!("Failed to save ai_cache.json: {}", e);
            }
        }
    }

    pub async fn load(&self) {
        let gps_path = self.data_dir.join("gps_cache.json");
        if gps_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&gps_path).await {
                if let Ok(cache) = serde_json::from_str::<GpsCache>(&content) {
                    let mut c = self.gps_cache.write().await;
                    *c = cache;
                }
            }
        }

        let ai_path = self.data_dir.join("ai_cache.json");
        if ai_path.exists() {
            if let Ok(content) = tokio::fs::read_to_string(&ai_path).await {
                if let Ok(cache) = serde_json::from_str::<AiCache>(&content) {
                    let mut c = self.ai_cache.write().await;
                    *c = cache;
                }
            }
        }
    }

    pub async fn clear_gps_cache(&self) {
        let mut cache = self.gps_cache.write().await;
        cache.entries.clear();
        self.save_gps_cache(&cache).await;
    }

    pub async fn clear_ai_cache(&self) {
        let mut cache = self.ai_cache.write().await;
        cache.entries.clear();
        self.save_ai_cache(&cache).await;
    }
}
