use serde::{Deserialize, Serialize};

fn default_time() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Album {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub photo_ids: Vec<String>,
    #[serde(default)]
    pub video_ids: Vec<String>,
    #[serde(default = "default_time")]
    pub created_at: String,
    #[serde(default = "default_time")]
    pub updated_at: String,
}

impl Album {
    pub fn new(name: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            description: String::new(),
            photo_ids: Vec::new(),
            video_ids: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}