use serde::{Deserialize, Serialize};
use crate::models::{Exif, Address};

fn default_time() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn default_video_type() -> String {
    "video".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Video {
    pub id: String,
    pub path: String,
    pub filename: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default = "default_time")]
    pub created_at: String,
    #[serde(default = "default_time")]
    pub modified_at: String,
    #[serde(rename = "type", default = "default_video_type")]
    pub media_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_taken: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bitrate: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub md5: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub albums: Vec<String>,
    #[serde(default)]
    pub click_count: u32,
    #[serde(default)]
    pub deleted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exif: Option<Exif>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<Address>,
}

impl Video {
    pub fn new(path: String, filename: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            path,
            filename,
            size: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
            modified_at: chrono::Utc::now().to_rfc3339(),
            media_type: "video".to_string(),
            date_taken: None,
            duration: None,
            width: None,
            height: None,
            codec: None,
            fps: None,
            bitrate: None,
            thumbnail: None,
            md5: None,
            tags: Vec::new(),
            notes: String::new(),
            albums: Vec::new(),
            click_count: 0,
            deleted: false,
            deleted_at: None,
            exif: None,
            address: None,
        }
    }
}