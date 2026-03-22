use std::sync::Arc;
use std::path::Path;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::store::data_store::DataStore;
use crate::models::{Photo, Video};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Media {
    #[serde(flatten)]
    pub data: MediaData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MediaData {
    photo(Photo),
    video(Video),
}

#[tauri::command]
pub async fn get_media(store: State<'_, Arc<DataStore>>) -> Result<Vec<serde_json::Value>, String> {
    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    
    let mut media: Vec<serde_json::Value> = Vec::new();
    
    for p in photos {
        if !p.deleted {
            let mut p = p;
            if let Some(ref thumb) = p.thumbnail {
                if !Path::new(thumb).exists() {
                    p.thumbnail = None;
                }
            }
            let mut val = serde_json::to_value(&p).map_err(|e| e.to_string())?;
            val["type"] = serde_json::json!("photo");
            media.push(val);
        }
    }
    
    for v in videos {
        if !v.deleted {
            let mut v = v;
            if let Some(ref thumb) = v.thumbnail {
                if !Path::new(thumb).exists() {
                    v.thumbnail = None;
                }
            }
            let mut val = serde_json::to_value(&v).map_err(|e| e.to_string())?;
            val["type"] = serde_json::json!("video");
            media.push(val);
        }
    }
    
    media.sort_by(|a, b| {
        let a_date = a.get("date_taken").and_then(|d| d.as_str()).unwrap_or("");
        let b_date = b.get("date_taken").and_then(|d| d.as_str()).unwrap_or("");
        b_date.cmp(a_date)
    });
    
    Ok(media)
}
