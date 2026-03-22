use std::sync::Arc;
use std::path::Path;
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::store::data_store::DataStore;
use crate::models::{Photo, Video};
use chrono::{DateTime, Datelike, TimeZone};
use base64::Engine;
use std::collections::HashMap;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPageRequest {
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub sort_by: String,
    #[serde(default)]
    pub sort_order: String,
    pub year: Option<i32>,
    #[serde(default)]
    pub ai_tags: Vec<String>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPageResponse {
    pub items: Vec<serde_json::Value>,
    pub next_cursor: Option<String>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPayload {
    ts: i64,
    filename: String,
    id: String,
}

#[derive(Debug, Clone)]
struct SortKey {
    ts: i64,
    filename: String,
    id: String,
}

fn parse_ts(value: &str) -> i64 {
    if value.trim().is_empty() {
        return 0;
    }
    DateTime::parse_from_rfc3339(value)
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

fn cmp_i64(a: i64, b: i64, dir: i32) -> std::cmp::Ordering {
    if dir >= 0 {
        a.cmp(&b)
    } else {
        b.cmp(&a)
    }
}

fn cmp_str(a: &str, b: &str, dir: i32) -> std::cmp::Ordering {
    if dir >= 0 {
        a.cmp(b)
    } else {
        b.cmp(a)
    }
}

fn cmp_key(a: &SortKey, b: &SortKey, dir: i32) -> std::cmp::Ordering {
    let cmp = cmp_i64(a.ts, b.ts, dir);
    if cmp != std::cmp::Ordering::Equal {
        return cmp;
    }
    let cmp = cmp_str(&a.filename, &b.filename, dir);
    if cmp != std::cmp::Ordering::Equal {
        return cmp;
    }
    cmp_str(&a.id, &b.id, dir)
}

fn decode_cursor(cursor: &str) -> Option<CursorPayload> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(cursor).ok()?;
    serde_json::from_slice::<CursorPayload>(&bytes).ok()
}

fn encode_cursor(key: &SortKey) -> Option<String> {
    let payload = CursorPayload {
        ts: key.ts,
        filename: key.filename.clone(),
        id: key.id.clone(),
    };
    let json = serde_json::to_vec(&payload).ok()?;
    Some(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json))
}

#[derive(Debug, Clone)]
struct DuplicateState {
    keeper_id: String,
    duplicate_count: u32,
}

fn dup_key(ts: i64, filename: &str, id: &str) -> SortKey {
    SortKey {
        ts,
        filename: filename.to_string(),
        id: id.to_string(),
    }
}

fn is_keeper_better(a: &SortKey, b: &SortKey) -> bool {
    if a.ts != b.ts {
        return a.ts < b.ts;
    }
    if a.filename != b.filename {
        return a.filename < b.filename;
    }
    a.id < b.id
}

fn build_duplicates(photos: &[Photo], videos: &[Video]) -> HashMap<String, DuplicateState> {
    let mut groups: HashMap<String, (u32, SortKey)> = HashMap::new(); // key -> (size, keeper_key)
    let mut keeper_ids: HashMap<String, String> = HashMap::new(); // key -> keeper_id

    for p in photos.iter() {
        if p.deleted {
            continue;
        }
        let md5 = match p.md5.as_deref() {
            Some(v) if !v.trim().is_empty() => v.trim(),
            _ => continue,
        };
        let ts = parse_ts(p.date_taken.as_deref().unwrap_or(p.created_at.as_str()));
        let key = format!("photo:{}", md5);
        let candidate = dup_key(ts, &p.filename, &p.id);

        if let Some((size, keeper)) = groups.get_mut(&key) {
            *size += 1;
            if is_keeper_better(&candidate, keeper) {
                *keeper = candidate.clone();
                keeper_ids.insert(key.clone(), p.id.clone());
            }
        } else {
            groups.insert(key.clone(), (1, candidate));
            keeper_ids.insert(key.clone(), p.id.clone());
        }
    }

    for v in videos.iter() {
        if v.deleted {
            continue;
        }
        let md5 = match v.md5.as_deref() {
            Some(v) if !v.trim().is_empty() => v.trim(),
            _ => continue,
        };
        let ts = parse_ts(v.date_taken.as_deref().unwrap_or(v.created_at.as_str()));
        let key = format!("video:{}", md5);
        let candidate = dup_key(ts, &v.filename, &v.id);

        if let Some((size, keeper)) = groups.get_mut(&key) {
            *size += 1;
            if is_keeper_better(&candidate, keeper) {
                *keeper = candidate.clone();
                keeper_ids.insert(key.clone(), v.id.clone());
            }
        } else {
            groups.insert(key.clone(), (1, candidate));
            keeper_ids.insert(key.clone(), v.id.clone());
        }
    }

    let mut result: HashMap<String, DuplicateState> = HashMap::new();
    for (key, (size, _)) in groups.into_iter() {
        if size <= 1 {
            continue;
        }
        if let Some(keeper_id) = keeper_ids.get(&key) {
            result.insert(
                key,
                DuplicateState {
                    keeper_id: keeper_id.clone(),
                    duplicate_count: size - 1,
                },
            );
        }
    }
    result
}

fn should_include_type(filter_type: &str, media_type: &str) -> bool {
    match filter_type {
        "photo" => media_type == "photo",
        "video" => media_type == "video",
        _ => true,
    }
}

fn year_matches(ts: i64, year: i32) -> bool {
    if ts <= 0 {
        return false;
    }
    if let Some(dt) = chrono::Utc.timestamp_millis_opt(ts).single() {
        dt.year() == year
    } else {
        false
    }
}

fn ai_tags_match(item_tags: &[String], filter_tags: &[String]) -> bool {
    if filter_tags.is_empty() {
        return true;
    }
    let mut set = std::collections::HashSet::new();
    for t in item_tags {
        let normalized = t.trim().to_lowercase();
        if !normalized.is_empty() {
            set.insert(normalized);
        }
    }
    filter_tags.iter().any(|t| set.contains(&t.trim().to_lowercase()))
}

#[tauri::command]
pub async fn get_media_page(
    store: State<'_, Arc<DataStore>>,
    params: MediaPageRequest,
) -> Result<MediaPageResponse, String> {
    let filter_type = if params.r#type.trim().is_empty() { "all" } else { params.r#type.as_str() };
    let sort_by = match params.sort_by.as_str() {
        "createdAt" | "created_at" => "createdAt",
        _ => "dateTaken",
    };
    let dir = if params.sort_order.as_str() == "asc" { 1 } else { -1 };
    let limit = params.limit.unwrap_or(2000).clamp(1, 20000) as usize;

    let cursor_payload = params.cursor.as_deref().and_then(decode_cursor);
    let cursor_key = cursor_payload.as_ref().map(|c| SortKey {
        ts: c.ts,
        filename: c.filename.clone(),
        id: c.id.clone(),
    });

    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    let duplicates = build_duplicates(&photos, &videos);

    let mut entries: Vec<(SortKey, serde_json::Value)> = Vec::new();

    for p in photos {
        if p.deleted {
            continue;
        }
        if !should_include_type(filter_type, "photo") {
            continue;
        }
        if !ai_tags_match(&p.ai_tags, &params.ai_tags) {
            continue;
        }

        let primary = if sort_by == "createdAt" {
            p.created_at.as_str()
        } else {
            p.date_taken.as_deref().unwrap_or(p.created_at.as_str())
        };
        let ts = parse_ts(primary);
        if let Some(y) = params.year {
            if !year_matches(ts, y) {
                continue;
            }
        }

        let mut p = p;
        if let Some(ref thumb) = p.thumbnail {
            if !Path::new(thumb).exists() {
                p.thumbnail = None;
            }
        }
        let mut val = serde_json::to_value(&p).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("photo");
        if let Some(ref md5) = p.md5 {
            let key = format!("photo:{}", md5.trim());
            if let Some(state) = duplicates.get(&key) {
                let show = if state.keeper_id == p.id { state.duplicate_count } else { 0 };
                val["duplicateCount"] = serde_json::json!(show);
            } else {
                val["duplicateCount"] = serde_json::json!(0);
            }
        } else {
            val["duplicateCount"] = serde_json::json!(0);
        }

        let key = SortKey {
            ts,
            filename: p.filename.clone(),
            id: p.id.clone(),
        };
        entries.push((key, val));
    }

    for v in videos {
        if v.deleted {
            continue;
        }
        if !should_include_type(filter_type, "video") {
            continue;
        }
        if !params.ai_tags.is_empty() {
            continue;
        }

        let primary = if sort_by == "createdAt" {
            v.created_at.as_str()
        } else {
            v.date_taken.as_deref().unwrap_or(v.created_at.as_str())
        };
        let ts = parse_ts(primary);
        if let Some(y) = params.year {
            if !year_matches(ts, y) {
                continue;
            }
        }

        let mut v = v;
        if let Some(ref thumb) = v.thumbnail {
            if !Path::new(thumb).exists() {
                v.thumbnail = None;
            }
        }
        let mut val = serde_json::to_value(&v).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("video");
        if let Some(ref md5) = v.md5 {
            let key = format!("video:{}", md5.trim());
            if let Some(state) = duplicates.get(&key) {
                let show = if state.keeper_id == v.id { state.duplicate_count } else { 0 };
                val["duplicateCount"] = serde_json::json!(show);
            } else {
                val["duplicateCount"] = serde_json::json!(0);
            }
        } else {
            val["duplicateCount"] = serde_json::json!(0);
        }

        let key = SortKey {
            ts,
            filename: v.filename.clone(),
            id: v.id.clone(),
        };
        entries.push((key, val));
    }

    entries.sort_by(|(a, _), (b, _)| cmp_key(a, b, dir));

    let total = entries.len();
    let mut filtered: Vec<(SortKey, serde_json::Value)> = if let Some(cursor_key) = cursor_key.as_ref() {
        entries
            .into_iter()
            .filter(|(k, _)| cmp_key(k, cursor_key, dir) == std::cmp::Ordering::Greater)
            .collect()
    } else {
        entries
    };

    if filtered.len() > limit {
        filtered.truncate(limit);
    }

    let next_cursor = filtered
        .last()
        .and_then(|(k, _)| encode_cursor(k));

    let items = filtered.into_iter().map(|(_, v)| v).collect();

    Ok(MediaPageResponse {
        items,
        next_cursor,
        total,
    })
}
