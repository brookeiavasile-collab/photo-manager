use std::sync::Arc;
use std::path::Path;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::Video;
use serde::Deserialize;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStats {
    pub total: usize,
    pub duplicates: usize,
}

#[tauri::command]
pub async fn get_videos(store: State<'_, Arc<DataStore>>) -> Result<Vec<Video>, String> {
    let videos = store.get_videos().await;
    Ok(
        videos
            .into_iter()
            .filter(|v| !v.deleted)
            .map(|mut v| {
                if let Some(ref thumb) = v.thumbnail {
                    if !Path::new(thumb).exists() {
                        v.thumbnail = None;
                    }
                }
                v
            })
            .collect(),
    )
}

#[tauri::command]
pub async fn get_video_stats(store: State<'_, Arc<DataStore>>) -> Result<VideoStats, String> {
    let videos = store.get_videos().await;
    let active: Vec<_> = videos.iter().filter(|v| !v.deleted).collect();
    let total = active.len();
    
    let mut md5_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for v in &active {
        if let Some(ref md5) = v.md5 {
            *md5_counts.entry(md5.clone()).or_insert(0) += 1;
        }
    }
    let duplicates = md5_counts.values().filter(|&&c| c > 1).count();
    
    Ok(VideoStats { total, duplicates })
}

#[tauri::command]
pub async fn get_video(id: String, store: State<'_, Arc<DataStore>>) -> Result<Option<Video>, String> {
    let mut v = store.get_video_by_id(&id).await;
    if let Some(ref mut video) = v {
        if let Some(ref thumb) = video.thumbnail {
            if !Path::new(thumb).exists() {
                video.thumbnail = None;
            }
        }
    }
    Ok(v)
}

#[tauri::command]
pub async fn delete_video(id: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    Ok(store.delete_video(&id).await)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoUpdate {
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub albums: Option<Vec<String>>,
}

#[tauri::command]
pub async fn update_video(id: String, data: VideoUpdate, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    let mut videos = store.get_videos().await;
    if let Some(video) = videos.iter_mut().find(|v| v.id == id && !v.deleted) {
        if let Some(tags) = data.tags { video.tags = tags; }
        if let Some(notes) = data.notes { video.notes = notes; }
        if let Some(albums) = data.albums { video.albums = albums; }
        store.save_videos(videos).await;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn get_duplicate_videos(md5: String, store: State<'_, Arc<DataStore>>) -> Result<Vec<Video>, String> {
    let videos = store.get_videos().await;
    Ok(
        videos
            .into_iter()
            .filter(|v| !v.deleted && v.md5.as_deref() == Some(&md5))
            .map(|mut v| {
                if let Some(ref thumb) = v.thumbnail {
                    if !Path::new(thumb).exists() {
                        v.thumbnail = None;
                    }
                }
                v
            })
            .collect(),
    )
}

#[tauri::command]
pub async fn delete_duplicate_videos(md5: String, store: State<'_, Arc<DataStore>>) -> Result<usize, String> {
    let mut videos = store.get_videos().await;
    let mut candidates: Vec<usize> = videos
        .iter()
        .enumerate()
        .filter(|(_, v)| !v.deleted && v.md5.as_deref() == Some(&md5))
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
        let v = &videos[idx];
        let key = v.date_taken.as_deref().unwrap_or(&v.created_at);
        parse_ts(key)
    });

    let keep_idx = candidates[0];
    let mut deleted = 0usize;
    for idx in candidates.into_iter().skip(1) {
        if idx == keep_idx {
            continue;
        }
        videos[idx].deleted = true;
        videos[idx].deleted_at = Some(chrono::Utc::now().to_rfc3339());
        deleted += 1;
    }

    store.save_videos(videos).await;
    Ok(deleted)
}

#[tauri::command]
pub async fn increment_video_view(id: String, store: State<'_, Arc<DataStore>>) -> Result<Option<Video>, String> {
    Ok(store.increment_video_view(&id).await)
}
