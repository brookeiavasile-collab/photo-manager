use std::sync::Arc;
use std::io::ErrorKind;
use std::path::Path;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::{Photo, Video};
use serde::Serialize;

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TrashItem {
    photo(Photo),
    video(Video),
}

fn remove_file_if_exists(path: &str) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(_) => Ok(()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("删除文件失败: {} ({})", path, err)),
    }
}

fn remove_thumbnail_if_exists(thumbnail: &Option<String>) -> Result<(), String> {
    if let Some(path) = thumbnail {
        if Path::new(path).exists() {
            remove_file_if_exists(path)?;
        }
    }
    Ok(())
}

fn delete_photo_files(photo: &Photo) -> Result<(), String> {
    remove_file_if_exists(&photo.path)?;
    remove_thumbnail_if_exists(&photo.thumbnail)
}

fn delete_video_files(video: &Video) -> Result<(), String> {
    remove_file_if_exists(&video.path)?;
    remove_thumbnail_if_exists(&video.thumbnail)
}

#[tauri::command]
pub async fn get_trash(store: State<'_, Arc<DataStore>>) -> Result<Vec<serde_json::Value>, String> {
    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    
    let mut items: Vec<serde_json::Value> = Vec::new();
    
    for p in photos {
        if p.deleted {
            let mut val = serde_json::to_value(&p).map_err(|e| e.to_string())?;
            val["type"] = serde_json::json!("photo");
            items.push(val);
        }
    }
    
    for v in videos {
        if v.deleted {
            let mut val = serde_json::to_value(&v).map_err(|e| e.to_string())?;
            val["type"] = serde_json::json!("video");
            items.push(val);
        }
    }
    
    items.sort_by(|a, b| {
        let a_date = a.get("deleted_at").and_then(|d| d.as_str()).unwrap_or("");
        let b_date = b.get("deleted_at").and_then(|d| d.as_str()).unwrap_or("");
        b_date.cmp(a_date)
    });
    
    Ok(items)
}

#[tauri::command]
pub async fn restore_media(id: String, media_type: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    if media_type == "photo" {
        let mut photos = store.get_photos().await;
        if let Some(photo) = photos.iter_mut().find(|p| p.id == id) {
            photo.deleted = false;
            photo.deleted_at = None;
            store.save_photos(photos).await;
            return Ok(true);
        }
    } else if media_type == "video" {
        let mut videos = store.get_videos().await;
        if let Some(video) = videos.iter_mut().find(|v| v.id == id) {
            video.deleted = false;
            video.deleted_at = None;
            store.save_videos(videos).await;
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn restore_all_trash(store: State<'_, Arc<DataStore>>) -> Result<usize, String> {
    let mut photos = store.get_photos().await;
    let mut videos = store.get_videos().await;
    let mut count = 0;
    
    for p in photos.iter_mut() {
        if p.deleted {
            p.deleted = false;
            p.deleted_at = None;
            count += 1;
        }
    }
    
    for v in videos.iter_mut() {
        if v.deleted {
            v.deleted = false;
            v.deleted_at = None;
            count += 1;
        }
    }
    
    store.save_photos(photos).await;
    store.save_videos(videos).await;
    
    Ok(count)
}

#[tauri::command]
pub async fn delete_permanently(id: String, media_type: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    if media_type == "photo" {
        let photos = store.get_photos().await;
        let target = photos.iter().find(|p| p.id == id).cloned();
        if let Some(photo) = target {
            delete_photo_files(&photo)?;
        }
        let filtered: Vec<_> = photos.into_iter().filter(|p| p.id != id).collect();
        store.save_photos(filtered).await;
        return Ok(true);
    } else if media_type == "video" {
        let videos = store.get_videos().await;
        let target = videos.iter().find(|v| v.id == id).cloned();
        if let Some(video) = target {
            delete_video_files(&video)?;
        }
        let filtered: Vec<_> = videos.into_iter().filter(|v| v.id != id).collect();
        store.save_videos(filtered).await;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn empty_trash(store: State<'_, Arc<DataStore>>) -> Result<usize, String> {
    let photos = store.get_photos().await;
    let videos = store.get_videos().await;

    let mut deleted_count = 0usize;
    let mut photo_errors = Vec::new();
    let mut remaining_photos = Vec::new();

    for photo in photos {
        if !photo.deleted {
            remaining_photos.push(photo);
            continue;
        }

        match delete_photo_files(&photo) {
            Ok(_) => deleted_count += 1,
            Err(err) => {
                photo_errors.push(err);
                remaining_photos.push(photo);
            }
        }
    }

    let mut video_errors = Vec::new();
    let mut remaining_videos = Vec::new();

    for video in videos {
        if !video.deleted {
            remaining_videos.push(video);
            continue;
        }

        match delete_video_files(&video) {
            Ok(_) => deleted_count += 1,
            Err(err) => {
                video_errors.push(err);
                remaining_videos.push(video);
            }
        }
    }

    store.save_photos(remaining_photos).await;
    store.save_videos(remaining_videos).await;

    if !photo_errors.is_empty() || !video_errors.is_empty() {
        let mut errors = photo_errors;
        errors.extend(video_errors);
        return Err(errors.join("; "));
    }

    Ok(deleted_count)
}
