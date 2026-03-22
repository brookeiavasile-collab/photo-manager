use std::sync::Arc;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::Album;

#[tauri::command]
pub async fn get_albums(store: State<'_, Arc<DataStore>>) -> Result<Vec<Album>, String> {
    Ok(store.get_albums().await)
}

#[tauri::command]
pub async fn get_album(id: String, store: State<'_, Arc<DataStore>>) -> Result<Option<Album>, String> {
    Ok(store.get_album_by_id(&id).await)
}

#[tauri::command]
pub async fn create_album(name: String, description: Option<String>, store: State<'_, Arc<DataStore>>) -> Result<Album, String> {
    let mut album = Album::new(name);
    if let Some(desc) = description {
        album.description = desc;
    }
    let cloned = album.clone();
    store.upsert_album(album).await;
    Ok(cloned)
}

#[tauri::command]
pub async fn update_album(id: String, name: Option<String>, description: Option<String>, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    let mut album = match store.get_album_by_id(&id).await {
        Some(a) => a,
        None => return Ok(false),
    };

    if let Some(n) = name { album.name = n; }
    if let Some(d) = description { album.description = d; }
    album.updated_at = chrono::Utc::now().to_rfc3339();
    store.upsert_album(album).await;
    Ok(true)
}

#[tauri::command]
pub async fn add_photos_to_album(id: String, photo_ids: Vec<String>, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    let mut album = match store.get_album_by_id(&id).await {
        Some(a) => a,
        None => return Ok(false),
    };

    for pid in photo_ids {
        if !album.photo_ids.contains(&pid) {
            album.photo_ids.push(pid);
        }
    }
    album.updated_at = chrono::Utc::now().to_rfc3339();
    store.upsert_album(album).await;
    Ok(true)
}

#[tauri::command]
pub async fn remove_photos_from_album(id: String, photo_ids: Vec<String>, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    let mut album = match store.get_album_by_id(&id).await {
        Some(a) => a,
        None => return Ok(false),
    };

    album.photo_ids.retain(|pid| !photo_ids.contains(pid));
    album.updated_at = chrono::Utc::now().to_rfc3339();
    store.upsert_album(album).await;
    Ok(true)
}

#[tauri::command]
pub async fn delete_album(id: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    Ok(store.delete_album(&id).await)
}
