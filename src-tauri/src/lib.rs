mod models;
mod store;
mod scanner;
mod commands;

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::AtomicBool;
use tauri::Manager;
use store::data_store::DataStore;
use store::cache_store::CacheStore;

pub fn run() {
    let data_dir = get_data_dir();
    let store = Arc::new(DataStore::new(data_dir.clone()));
    let cache_store = Arc::new(CacheStore::new(data_dir));
    let scan_state = Arc::new(Mutex::new(commands::directories::ScanState::default()));
    let scan_cancelled = Arc::new(AtomicBool::new(false));
    let address_backfill_state = Arc::new(Mutex::new(commands::directories::AddressBackfillState::default()));
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(store)
        .manage(cache_store)
        .manage(scan_state)
        .manage(scan_cancelled)
        .manage(address_backfill_state)
        .invoke_handler(tauri::generate_handler![
            commands::photos::get_photos,
            commands::photos::get_photo,
            commands::photos::get_photo_stats,
            commands::photos::update_photo,
            commands::photos::delete_photo,
            commands::photos::get_duplicate_photos,
            commands::photos::increment_photo_view,
            commands::photos::delete_duplicate_photos,
            commands::videos::get_videos,
            commands::videos::get_video,
            commands::videos::get_video_stats,
            commands::videos::delete_video,
            commands::videos::update_video,
            commands::videos::get_duplicate_videos,
            commands::videos::delete_duplicate_videos,
            commands::videos::increment_video_view,
            commands::albums::get_albums,
            commands::albums::get_album,
            commands::albums::create_album,
            commands::albums::update_album,
            commands::albums::delete_album,
            commands::albums::add_photos_to_album,
            commands::albums::remove_photos_from_album,
            commands::tags::get_tags,
            commands::tags::create_tag,
            commands::tags::delete_tag,
            commands::directories::get_directories,
            commands::directories::add_directory,
            commands::directories::remove_directory,
            commands::directories::scan_directory,
            commands::directories::get_scan_state,
            commands::directories::stop_scan,
            commands::directories::browse,
            commands::directories::backfill_photo_addresses,
            commands::directories::get_address_backfill_state,
            commands::media::get_media,
            commands::config::get_config,
            commands::config::update_config,
            commands::cache::get_cache_stats,
            commands::cache::clear_cache,
            commands::trash::get_trash,
            commands::trash::restore_media,
            commands::trash::restore_all_trash,
            commands::trash::delete_permanently,
            commands::trash::empty_trash,
        ])
        .setup(|app| {
            let store = app.state::<Arc<DataStore>>();
            let cache = app.state::<Arc<CacheStore>>();
            tokio::task::block_in_place(|| {
                tauri::async_runtime::block_on(async {
                    cache.load().await;
                    store.load().await;
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn get_data_dir() -> PathBuf {
    if let Some(exe) = std::env::current_exe().ok() {
        if let Some(dir) = exe.parent() {
            let data_dir = dir.join("data");
            std::fs::create_dir_all(&data_dir).ok();
            return data_dir;
        }
    }
    PathBuf::from("data")
}
