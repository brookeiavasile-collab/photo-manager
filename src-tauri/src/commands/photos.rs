use std::sync::Arc;
use std::path::Path;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::Photo;
use serde::Deserialize;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoStats {
    pub total: usize,
    pub duplicates: usize,
}

#[tauri::command]
pub async fn get_photos(store: State<'_, Arc<DataStore>>) -> Result<Vec<Photo>, String> {
    let photos = store.get_photos().await;
    Ok(
        photos
            .into_iter()
            .filter(|p| !p.deleted)
            .map(|mut p| {
                if let Some(ref thumb) = p.thumbnail {
                    if !Path::new(thumb).exists() {
                        p.thumbnail = None;
                    }
                }
                p
            })
            .collect(),
    )
}

#[tauri::command]
pub async fn get_photo_stats(store: State<'_, Arc<DataStore>>) -> Result<PhotoStats, String> {
    let photos = store.get_photos().await;
    let active: Vec<_> = photos.iter().filter(|p| !p.deleted).collect();
    let total = active.len();
    
    let mut md5_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for p in &active {
        if let Some(ref md5) = p.md5 {
            *md5_counts.entry(md5.clone()).or_insert(0) += 1;
        }
    }
    let duplicates = md5_counts.values().filter(|&&c| c > 1).map(|&c| c - 1).sum();
    
    Ok(PhotoStats { total, duplicates })
}

#[tauri::command]
pub async fn get_photo(id: String, store: State<'_, Arc<DataStore>>) -> Result<Option<Photo>, String> {
    let mut p = store.get_photo_by_id(&id).await;
    if let Some(ref mut photo) = p {
        if let Some(ref thumb) = photo.thumbnail {
            if !Path::new(thumb).exists() {
                photo.thumbnail = None;
            }
        }
    }
    Ok(p)
}

#[tauri::command]
pub async fn update_photo(id: String, data: PhotoUpdate, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    let mut photos = store.get_photos().await;
    if let Some(photo) = photos.iter_mut().find(|p| p.id == id && !p.deleted) {
        if let Some(tags) = data.tags { photo.tags = tags; }
        if let Some(notes) = data.notes { photo.notes = notes; }
        if let Some(albums) = data.albums { photo.albums = albums; }
        if let Some(category) = data.category { photo.category = category; }
        if let Some(ai_tags) = data.ai_tags { photo.ai_tags = ai_tags; }
        store.save_photos(photos).await;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn delete_photo(id: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    Ok(store.delete_photo(&id).await)
}

#[tauri::command]
pub async fn get_duplicate_photos(md5: String, store: State<'_, Arc<DataStore>>) -> Result<Vec<Photo>, String> {
    let photos = store.get_photos().await;
    Ok(
        photos
            .into_iter()
            .filter(|p| !p.deleted && p.md5.as_deref() == Some(&md5))
            .map(|mut p| {
                if let Some(ref thumb) = p.thumbnail {
                    if !Path::new(thumb).exists() {
                        p.thumbnail = None;
                    }
                }
                p
            })
            .collect(),
    )
}

#[tauri::command]
pub async fn increment_photo_view(id: String, store: State<'_, Arc<DataStore>>) -> Result<Option<Photo>, String> {
    Ok(store.increment_photo_view(&id).await)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoUpdate {
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub albums: Option<Vec<String>>,
    pub category: Option<String>,
    pub ai_tags: Option<Vec<String>>,
}

#[tauri::command]
pub async fn delete_duplicate_photos(md5: String, store: State<'_, Arc<DataStore>>) -> Result<usize, String> {
    let mut photos = store.get_photos().await;
    let mut candidates: Vec<usize> = photos
        .iter()
        .enumerate()
        .filter(|(_, p)| !p.deleted && p.md5.as_deref() == Some(&md5))
        .map(|(i, _)| i)
        .collect();

    if candidates.len() <= 1 {
        return Ok(0);
    }

    let parse_ts = |s: &str| {
        chrono::DateTime::parse_from_rfc3339(s)
            .map(|dt| dt.timestamp())
            .unwrap_or(i64::MAX)
    };

    candidates.sort_by_key(|&idx| {
        let p = &photos[idx];
        let key = p.date_taken.as_deref().unwrap_or(&p.created_at);
        parse_ts(key)
    });

    let keep_idx = candidates[0];
    let mut deleted = 0usize;
    for idx in candidates.into_iter().skip(1) {
        if idx == keep_idx {
            continue;
        }
        photos[idx].deleted = true;
        photos[idx].deleted_at = Some(chrono::Utc::now().to_rfc3339());
        deleted += 1;
    }

    store.save_photos(photos).await;
    Ok(deleted)
}
