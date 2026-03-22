use tauri::State;
use std::sync::Arc;
use crate::store::cache_store::CacheStore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub gps_cache_count: usize,
    pub ai_cache_count: usize,
}

#[tauri::command]
pub async fn get_cache_stats(cache: State<'_, Arc<CacheStore>>) -> Result<CacheStats, String> {
    Ok(CacheStats {
        gps_cache_count: cache.get_gps_cache_size().await,
        ai_cache_count: cache.get_ai_cache_size().await,
    })
}

#[tauri::command]
pub async fn clear_cache(
    cache: State<'_, Arc<CacheStore>>,
    cache_type: Option<String>,
) -> Result<CacheStats, String> {
    match cache_type.as_deref() {
        Some("gps") => cache.clear_gps_cache().await,
        Some("ai") => cache.clear_ai_cache().await,
        Some("all") | None => {
            cache.clear_gps_cache().await;
            cache.clear_ai_cache().await;
        }
        _ => {}
    }
    Ok(CacheStats {
        gps_cache_count: cache.get_gps_cache_size().await,
        ai_cache_count: cache.get_ai_cache_size().await,
    })
}