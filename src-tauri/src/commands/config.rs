use std::sync::Arc;
use tauri::State;
use crate::store::data_store::DataStore;
use crate::models::Config;

#[tauri::command]
pub async fn get_config(store: State<'_, Arc<DataStore>>) -> Result<Config, String> {
    Ok(store.get_config().await)
}

#[tauri::command]
pub async fn update_config(config: Config, store: State<'_, Arc<DataStore>>) -> Result<Config, String> {
    store.update_config(config.clone()).await;
    Ok(config)
}