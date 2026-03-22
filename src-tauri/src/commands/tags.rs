use std::sync::Arc;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::Tag;

#[tauri::command]
pub async fn get_tags(store: State<'_, Arc<DataStore>>) -> Result<Vec<Tag>, String> {
    Ok(store.get_tags().await)
}

#[tauri::command]
pub async fn create_tag(name: String, store: State<'_, Arc<DataStore>>) -> Result<Tag, String> {
    let tag = Tag::new(name);
    let cloned = tag.clone();
    store.add_tag(tag).await;
    Ok(cloned)
}

#[tauri::command]
pub async fn delete_tag(id: String, store: State<'_, Arc<DataStore>>) -> Result<bool, String> {
    Ok(store.delete_tag(&id).await)
}