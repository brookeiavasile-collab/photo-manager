use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImageClassification {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub api_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_timeout")]
    pub timeout: u32,
}

fn default_timeout() -> u32 { 30000 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub photo_directories: Vec<String>,
    #[serde(default = "default_thumbnail_size")]
    pub thumbnail_size: u32,
    #[serde(default = "default_supported_formats")]
    pub supported_formats: Vec<String>,
    #[serde(default = "default_video_formats")]
    pub video_formats: Vec<String>,

    #[serde(default = "default_scan_concurrency")]
    pub scan_concurrency: u32,
    #[serde(default)]
    pub image_classification: ImageClassification,
}

fn default_thumbnail_size() -> u32 { 200 }

fn default_supported_formats() -> Vec<String> {
    vec![".jpg".into(), ".jpeg".into(), ".png".into(), ".heic".into(), ".webp".into()]
}

fn default_video_formats() -> Vec<String> {
    vec![".mp4".into(), ".mov".into(), ".avi".into(), ".mkv".into(), ".webm".into(), ".m4v".into()]
}

fn default_scan_concurrency() -> u32 {
    // 0/1 都会显著变慢；给个相对保守但明显提升的默认值
    let n = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(4);
    n.clamp(2, 12)
}

impl Default for Config {
    fn default() -> Self {
        Self {
            photo_directories: Vec::new(),
            thumbnail_size: 200,
            supported_formats: default_supported_formats(),
            video_formats: default_video_formats(),
            scan_concurrency: default_scan_concurrency(),
            image_classification: ImageClassification {
                enabled: false,
                api_url: String::new(),
                api_key: String::new(),
                timeout: 30000,
            },
        }
    }
}
