use std::sync::Arc;
use std::path::{Path, PathBuf};
use tauri::State;
use serde::{Deserialize, Serialize};
use crate::store::data_store::DataStore;
use crate::models::{Photo, Video};
use crate::logger;
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

fn normalize_thumbnail(store: &DataStore, thumb: &str) -> Option<String> {
    let p = PathBuf::from(thumb);
    let resolved = if p.is_absolute() { p } else { store.data_dir().join(p) };
    if resolved.exists() {
        Some(resolved.to_string_lossy().to_string())
    } else {
        None
    }
}

#[tauri::command]
pub async fn get_media(store: State<'_, Arc<DataStore>>) -> Result<Vec<serde_json::Value>, String> {
    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    let mut media: Vec<serde_json::Value> = Vec::new();

    for p in photos {
        if p.deleted {
            continue;
        }
        let mut p = p;
        if let Some(ref thumb) = p.thumbnail {
            p.thumbnail = normalize_thumbnail(&store, thumb);
        }
        let mut val = serde_json::to_value(&p).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("photo");
        media.push(val);
    }

    for v in videos {
        if v.deleted {
            continue;
        }
        let mut v = v;
        if let Some(ref thumb) = v.thumbnail {
            logger::log_line(format!("thumb media list id={} raw={}", v.id, thumb));
            v.thumbnail = normalize_thumbnail(&store, thumb);
            logger::log_line(format!("thumb media list id={} normalized={}", v.id, v.thumbnail.as_deref().unwrap_or("<none>")));
        }
        let mut val = serde_json::to_value(&v).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("video");
        media.push(val);
    }

    media.sort_by(|a, b| {
        let a_primary = a
            .get("date_taken")
            .and_then(|d| d.as_str())
            .or_else(|| a.get("created_at").and_then(|d| d.as_str()))
            .unwrap_or("");
        let b_primary = b
            .get("date_taken")
            .and_then(|d| d.as_str())
            .or_else(|| b.get("created_at").and_then(|d| d.as_str()))
            .unwrap_or("");

        let a_ts = parse_ts(a_primary);
        let b_ts = parse_ts(b_primary);
        b_ts.cmp(&a_ts)
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
pub struct YearCount {
    pub year: i32,
    pub count: usize,
    pub photo_count: usize,
    pub video_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPageResponse {
    pub items: Vec<serde_json::Value>,
    pub next_cursor: Option<String>,
    pub total: usize,
    pub total_photos: usize,
    pub total_videos: usize,
    pub available_years: Vec<YearCount>,
    pub available_ai_tags: Vec<TagCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CursorPayload {
    ts: i64,
    filename: String,
    id: String,
    size: u64,
    click_count: u64,
    duplicate_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SortKey {
    ts: i64,
    filename: String,
    id: String,
    size: u64,
    click_count: u64,
    duplicate_count: u64,
}

fn parse_ts(value: &str) -> i64 {
    if value.trim().is_empty() {
        return 0;
    }
    
    // First try standard RFC3339
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return dt.timestamp_millis();
    }
    
    // Then try common EXIF format: YYYY:MM:DD HH:MM:SS
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(value, "%Y:%m:%d %H:%M:%S") {
        return dt.and_utc().timestamp_millis();
    }
    
    // Finally try just YYYY-MM-DD HH:MM:SS
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S") {
        return dt.and_utc().timestamp_millis();
    }
    
    0
}

fn create_sort_key_from_photo(p: &crate::models::Photo, ts: i64, duplicate_count: u64) -> SortKey {
    SortKey {
        ts,
        filename: p.filename.clone(),
        id: p.id.clone(),
        size: p.size,
        click_count: p.click_count as u64,
        duplicate_count,
    }
}

fn create_sort_key_from_video(v: &crate::models::Video, ts: i64, duplicate_count: u64) -> SortKey {
    SortKey {
        ts,
        filename: v.filename.clone(),
        id: v.id.clone(),
        size: v.size,
        click_count: v.click_count as u64,
        duplicate_count,
    }
}

fn cmp_key(a: &SortKey, b: &SortKey, dir: i32, sort_by: &str) -> std::cmp::Ordering {
    let cmp = match sort_by {
        "filename" => a.filename.cmp(&b.filename),
        "size" => a.size.cmp(&b.size),
        "clickCount" => a.click_count.cmp(&b.click_count),
        "duplicateCount" => a.duplicate_count.cmp(&b.duplicate_count),
        _ => a.ts.cmp(&b.ts), // "dateTaken" or "createdAt"
    };

    let final_cmp = if cmp == std::cmp::Ordering::Equal {
        let name_cmp = a.filename.cmp(&b.filename);
        if name_cmp == std::cmp::Ordering::Equal {
            a.id.cmp(&b.id)
        } else {
            name_cmp
        }
    } else {
        cmp
    };

    if dir > 0 {
        final_cmp
    } else {
        final_cmp.reverse()
    }
}

fn decode_cursor(cursor: &str) -> Option<CursorPayload> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(cursor).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn encode_cursor(key: &SortKey) -> Option<String> {
    let payload = CursorPayload {
        ts: key.ts,
        filename: key.filename.clone(),
        id: key.id.clone(),
        size: key.size,
        click_count: key.click_count,
        duplicate_count: key.duplicate_count,
    };
    let json = serde_json::to_vec(&payload).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(json))
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
        size: 0,
        click_count: 0,
        duplicate_count: 0,
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
    let sort_by = params.sort_by.as_str();
    let dir = if params.sort_order.as_str() == "asc" { 1 } else { -1 };
    let limit = params.limit.unwrap_or(2000).clamp(1, 20000) as usize;

    let cursor_payload = params.cursor.as_deref().and_then(decode_cursor);
    let cursor_key = cursor_payload.as_ref().map(|c| SortKey {
        ts: c.ts,
        filename: c.filename.clone(),
        id: c.id.clone(),
        size: c.size,
        click_count: c.click_count,
        duplicate_count: c.duplicate_count,
    });

    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    let duplicates = build_duplicates(&photos, &videos);

    let mut entries: Vec<(SortKey, serde_json::Value)> = Vec::new();

    let mut total_photos = 0;
    let mut total_videos = 0;

    let mut all_years_count: HashMap<i32, (usize, usize)> = HashMap::new();
    let mut all_tags_count: HashMap<String, usize> = HashMap::new();

    for p in photos {
        if p.deleted {
            continue;
        }
        
        let type_match = should_include_type(filter_type, "photo");
        if !type_match {
            continue;
        }

        let primary = if sort_by == "createdAt" {
            p.created_at.as_str()
        } else {
            p.date_taken.as_deref().unwrap_or(p.created_at.as_str())
        };
        let ts = parse_ts(primary);
        let p_year = if ts > 0 {
            chrono::Utc.timestamp_millis_opt(ts).single().map(|dt| dt.year())
        } else {
            None
        };

        let year_match = match params.year {
            Some(y) => p_year == Some(y),
            None => true,
        };

        let tags_match = ai_tags_match(&p.ai_tags, &params.ai_tags);

        // For available years, we want items that match type and tags (ignoring year filter)
        if tags_match {
            if let Some(y) = p_year {
                let entry = all_years_count.entry(y).or_insert((0, 0));
                entry.0 += 1;
            }
        }

        // For available tags, we want items that match type and year (ignoring tags filter)
        if year_match {
            for t in &p.ai_tags {
                let normalized = t.trim().to_lowercase();
                if !normalized.is_empty() {
                    *all_tags_count.entry(normalized).or_insert(0) += 1;
                }
            }
        }

        if !tags_match || !year_match {
            continue;
        }

        total_photos += 1;

        let mut p = p;
        if let Some(ref thumb) = p.thumbnail {
            p.thumbnail = normalize_thumbnail(&store, thumb);
        }
        let mut val = serde_json::to_value(&p).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("photo");
        let duplicate_count = if let Some(ref md5) = p.md5 {
            let key = format!("photo:{}", md5.trim());
            if let Some(state) = duplicates.get(&key) {
                let show = if state.keeper_id == p.id { state.duplicate_count } else { 0 };
                val["duplicateCount"] = serde_json::json!(show);
                show as u64
            } else {
                val["duplicateCount"] = serde_json::json!(0);
                0
            }
        } else {
            val["duplicateCount"] = serde_json::json!(0);
            0
        };

        let key = create_sort_key_from_photo(&p, ts, duplicate_count);
        entries.push((key, val));
    }

    for v in videos {
        if v.deleted {
            continue;
        }

        let type_match = should_include_type(filter_type, "video");
        if !type_match {
            continue;
        }

        let primary = if sort_by == "createdAt" {
            v.created_at.as_str()
        } else {
            v.date_taken.as_deref().unwrap_or(v.created_at.as_str())
        };
        let ts = parse_ts(primary);
        let v_year = if ts > 0 {
            chrono::Utc.timestamp_millis_opt(ts).single().map(|dt| dt.year())
        } else {
            None
        };

        let year_match = match params.year {
            Some(y) => v_year == Some(y),
            None => true,
        };

        let tags_match = params.ai_tags.is_empty();

        if tags_match {
            if let Some(y) = v_year {
                let entry = all_years_count.entry(y).or_insert((0, 0));
                entry.1 += 1;
            }
        }

        if !tags_match || !year_match {
            continue;
        }

        total_videos += 1;

        let mut v = v;
        if let Some(ref thumb) = v.thumbnail {
            logger::log_line(format!("thumb media page id={} raw={}", v.id, thumb));
            v.thumbnail = normalize_thumbnail(&store, thumb);
            logger::log_line(format!("thumb media page id={} normalized={}", v.id, v.thumbnail.as_deref().unwrap_or("<none>")));
        }
        let mut val = serde_json::to_value(&v).map_err(|e| e.to_string())?;
        val["type"] = serde_json::json!("video");
        let duplicate_count = if let Some(ref md5) = v.md5 {
            let key = format!("video:{}", md5.trim());
            if let Some(state) = duplicates.get(&key) {
                let show = if state.keeper_id == v.id { state.duplicate_count } else { 0 };
                val["duplicateCount"] = serde_json::json!(show);
                show as u64
            } else {
                val["duplicateCount"] = serde_json::json!(0);
                0
            }
        } else {
            val["duplicateCount"] = serde_json::json!(0);
            0
        };

        let key = create_sort_key_from_video(&v, ts, duplicate_count);
        entries.push((key, val));
    }

    let sort_by_field = sort_by.to_string();
    let sort_by_field_clone = sort_by_field.clone();

    entries.sort_by(move |(a, _), (b, _)| cmp_key(a, b, dir, &sort_by_field_clone));

    let total = entries.len();
    let mut filtered: Vec<(SortKey, serde_json::Value)> = if let Some(cursor_key) = cursor_key.as_ref() {
        entries
            .into_iter()
            .filter(|(k, _)| cmp_key(k, cursor_key, dir, &sort_by_field) == std::cmp::Ordering::Greater)
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

    let mut available_years: Vec<YearCount> = all_years_count
        .into_iter()
        .map(|(year, (photo_count, video_count))| YearCount {
            year,
            count: photo_count + video_count,
            photo_count,
            video_count,
        })
        .collect();
    available_years.sort_unstable_by(|a, b| b.year.cmp(&a.year));

    let mut available_ai_tags: Vec<TagCount> = all_tags_count
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();
    available_ai_tags.sort_by(|a, b| a.tag.cmp(&b.tag));

    Ok(MediaPageResponse {
        items,
        next_cursor,
        total,
        total_photos,
        total_videos,
        available_years,
        available_ai_tags,
    })
}
