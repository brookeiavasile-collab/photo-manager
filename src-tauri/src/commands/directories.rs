use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::atomic::AtomicUsize;
use tauri::{State, AppHandle, Emitter};
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use crate::store::data_store::DataStore;
use crate::store::cache_store::CacheStore;
use crate::scanner::photo_scanner::PhotoScanner;
use crate::scanner::video_scanner::VideoScanner;
use crate::scanner::geocoder::Geocoder;
use crate::models::Address;
use crate::logger;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryInfo {
    pub path: String,
    pub photo_count: usize,
    pub video_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryInfoEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickAccessPath {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseResponse {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub home_path: String,
    pub quick_access_paths: Vec<QuickAccessPath>,
    pub directories: Vec<DirectoryInfoEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanLogEntry {
    pub message: String,
    pub log_type: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanState {
    pub scanning: bool,
    pub current_dir: Option<String>,
    pub scanned_count: usize,
    pub total_count: usize,
    pub current_path: Option<String>,
    pub queue: Vec<String>,
    pub logs: Vec<ScanLogEntry>,
    pub processed_count: usize,
    pub skipped_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AddressBackfillResult {
    pub scanned: usize,
    pub updated: usize,
    pub skipped: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AddressBackfillState {
    pub running: bool,
    pub total: usize,
    pub scanned: usize,
    pub updated: usize,
    pub skipped: usize,
    pub filename: Option<String>,
    pub status: Option<String>,
}

async fn resolve_address(lat: f64, lon: f64, cache: &CacheStore, geocoder: &Geocoder) -> Option<Address> {
    if let Some(cached) = cache.get_address(lat, lon).await {
        return Some(Address::from(cached));
    }

    let address = geocoder.reverse_geocode(lat, lon).await?;
    cache.save_address(lat, lon, address.clone()).await;
    Some(Address::from(address))
}

fn push_scan_log(scan_state: &mut ScanState, message: impl Into<String>, log_type: impl Into<String>, app: Option<&tauri::AppHandle>) {
    let entry = ScanLogEntry {
        message: message.into(),
        log_type: log_type.into(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    };
    scan_state.logs.push(entry.clone());
    if scan_state.logs.len() > 200 {
        let overflow = scan_state.logs.len() - 200;
        scan_state.logs.drain(0..overflow);
    }
    
    if let Some(app_handle) = app {
        let _ = app_handle.emit("scan-progress", serde_json::json!({
            "type": "log",
            "logEntry": entry
        }));
    }
}

fn lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

fn get_home_path() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "/".to_string())
}

fn build_quick_access_paths() -> Vec<QuickAccessPath> {
    let home = get_home_path();
    let mut paths = vec![
        QuickAccessPath { name: "Home".to_string(), path: home.clone() },
    ];
    
    let home_path = PathBuf::from(&home);
    
    if let Some(pictures) = home_path.join("Pictures").to_str() {
        paths.push(QuickAccessPath { name: "Pictures".to_string(), path: pictures.to_string() });
    }
    if let Some(downloads) = home_path.join("Downloads").to_str() {
        paths.push(QuickAccessPath { name: "Downloads".to_string(), path: downloads.to_string() });
    }
    if let Some(desktop) = home_path.join("Desktop").to_str() {
        paths.push(QuickAccessPath { name: "Desktop".to_string(), path: desktop.to_string() });
    }
    if let Some(documents) = home_path.join("Documents").to_str() {
        paths.push(QuickAccessPath { name: "Documents".to_string(), path: documents.to_string() });
    }
    
    paths
}

#[tauri::command]
pub async fn browse(path: Option<String>) -> Result<BrowseResponse, String> {
    let home = get_home_path();
    let current = path.unwrap_or_else(|| home.clone());
    
    let current_path = PathBuf::from(&current);
    
    if !current_path.exists() {
        return Err("Directory not found".to_string());
    }
    
    if !current_path.is_dir() {
        return Err("Not a directory".to_string());
    }
    
    let entries = fs::read_dir(&current_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut directories: Vec<DirectoryInfoEntry> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            if let Ok(file_type) = entry.file_type() {
                file_type.is_dir()
            } else {
                false
            }
        })
        .filter(|entry| {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            !name_str.starts_with('.')
        })
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            let path = entry.path().to_string_lossy().to_string();
            DirectoryInfoEntry {
                name,
                path,
                is_directory: true,
            }
        })
        .collect();
    
    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    let parent_path = current_path.parent()
        .map(|p| p.to_string_lossy().to_string())
        .filter(|p| p != &current);
    
    Ok(BrowseResponse {
        current_path: current,
        parent_path,
        home_path: home,
        quick_access_paths: build_quick_access_paths(),
        directories,
    })
}

#[tauri::command]
pub async fn get_directories(store: State<'_, Arc<DataStore>>) -> Result<Vec<DirectoryInfo>, String> {
    let config = store.get_config().await;
    let photos = store.get_photos().await;
    let videos = store.get_videos().await;
    
    let mut result = Vec::new();
    for dir in &config.photo_directories {
        let photo_count = photos.iter().filter(|p| p.path.starts_with(dir) && !p.deleted).count();
        let video_count = videos.iter().filter(|v| v.path.starts_with(dir) && !v.deleted).count();
        result.push(DirectoryInfo {
            path: dir.clone(),
            photo_count,
            video_count,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn add_directory(path: String, store: State<'_, Arc<DataStore>>) -> Result<Vec<DirectoryInfo>, String> {
    let mut config = store.get_config().await;
    if !config.photo_directories.contains(&path) {
        config.photo_directories.push(path);
        store.update_config(config).await;
    }
    get_directories(store).await
}

#[tauri::command]
pub async fn remove_directory(path: String, store: State<'_, Arc<DataStore>>) -> Result<Vec<DirectoryInfo>, String> {
    let mut config = store.get_config().await;
    config.photo_directories.retain(|d| d != &path);
    store.update_config(config).await;
    get_directories(store).await
}

#[tauri::command]
pub async fn scan_directory(
    path: String, 
    force: Option<bool>, 
    store: State<'_, Arc<DataStore>>,
    cache: State<'_, Arc<CacheStore>>,
    app: AppHandle,
    scan_state: State<'_, Arc<Mutex<ScanState>>>,
    scan_cancelled: State<'_, Arc<AtomicBool>>,
) -> Result<ScanState, String> {
    logger::log_line(format!("scan_directory start path={} force={:?}", path, force));
    let force = force.unwrap_or(false);
    scan_cancelled.store(false, Ordering::SeqCst);
    let config = store.get_config().await;
    let scanner = PhotoScanner::new(
        config.thumbnail_size,
        config.supported_formats.clone(),
        config.scan_concurrency,
    );
    let video_scanner = VideoScanner::new(
        config.thumbnail_size,
        config.video_formats.clone(),
        config.scan_concurrency,
    );
    
    let dir_path = PathBuf::from(&path);
    logger::log_line(format!("scan_directory resolved dir_path={}", dir_path.display()));

    let _ = app.emit("scan-progress", serde_json::json!({
        "type": "started",
        "dirPath": path
    }));

    {
        let mut state = lock_or_recover(&scan_state);
        *state = ScanState {
            scanning: true,
            current_dir: Some(path.clone()),
            scanned_count: 0,
            total_count: 0,
            current_path: None,
            queue: Vec::new(),
            logs: Vec::new(),
            processed_count: 0,
            skipped_count: 0,
        };
        push_scan_log(&mut state, format!("开始扫描: {}", path), "info", Some(&app));
    }
    
    let scan_state_for_progress = scan_state.inner().clone();
    let progress_app = app.clone();
    let should_stop = {
        let scan_cancelled = scan_cancelled.inner().clone();
        move || scan_cancelled.load(Ordering::Relaxed)
    };

    let mut existing_photo_map: HashMap<String, crate::models::Photo> = HashMap::new();
    for p in store.get_photos().await {
        if p.path.starts_with(&path) {
            existing_photo_map.insert(p.path.clone(), p);
        }
    }


    let threads = if config.scan_concurrency == 0 {
        std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
    } else {
        config.scan_concurrency as usize
    };
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads.max(1))
        .build()
        .map_err(|e| format!("failed to build scan thread pool: {e}"))?;

    let photo_total = WalkDir::new(&dir_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && scanner.is_supported(e.path()))
        .count();
    logger::log_line(format!("scan_directory photo_total={}", photo_total));
        
    let video_total = WalkDir::new(&dir_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && video_scanner.is_video(e.path()))
        .count();
    logger::log_line(format!("scan_directory video_total={}", video_total));
        
    let total_media_count = photo_total + video_total;
    logger::log_line(format!("scan_directory total_media_count={}", total_media_count));

    {
        let mut state = lock_or_recover(&scan_state);
        state.total_count = total_media_count;
    }

    let global_counter = AtomicUsize::new(0);
    let on_progress = |current: usize, total: usize, filename: &str, is_skipped: bool, log_actions: &[String]| {
        let current_to_emit;
        {
            let mut state = lock_or_recover(&scan_state_for_progress);
            if !state.scanning {
                return;
            }
            state.scanned_count = state.scanned_count.max(current);
            current_to_emit = state.scanned_count;
            state.total_count = total;
            state.current_path = Some(filename.to_string());
            
            if is_skipped {
                state.skipped_count += 1;
            } else {
                state.processed_count += 1;
            }

            // 每扫描一定数量的文件执行一次部分写回，防止中途崩溃丢失
            if state.scanned_count % 50 == 0 {
                let cache_clone = cache.inner().clone();
                tokio::spawn(async move {
                    cache_clone.flush_all().await;
                });
            }

            if !is_skipped || current == 1 || current == total || current % 10 == 0 {
                let action_str = if log_actions.is_empty() {
                    "跳过".to_string()
                } else {
                    format!("已获取: {}", log_actions.join(", "))
                };
                let status_msg = if is_skipped { "跳过" } else { "处理" };
                push_scan_log(&mut state, format!("[{}/{}] {} {} ({})", current, total, status_msg, filename, action_str), if is_skipped { "skip" } else { "info" }, Some(&progress_app));
            }
        }
        let _ = progress_app.emit("scan-progress", serde_json::json!({
            "type": "file",
            "current": current_to_emit,
            "total": total,
            "filename": filename
        }));
    };

    const PHOTO_BATCH: usize = 120;
    let mut buf: Vec<PathBuf> = Vec::with_capacity(PHOTO_BATCH);
    for entry in WalkDir::new(&dir_path).into_iter().filter_map(|e| e.ok()) {
        if should_stop() {
            break;
        }
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if !scanner.is_supported(p) {
            continue;
        }
        buf.push(entry.into_path());
        if buf.len() < PHOTO_BATCH {
            continue;
        }

        let batch = scanner.scan_files_batch_in_pool(
            &pool,
            &buf,
            &store,
            &cache,
            &existing_photo_map,
            force,
            &should_stop,
            &global_counter,
            total_media_count,
            &on_progress,
        );

        buf.clear();

        for p in batch {
            existing_photo_map.insert(p.path.clone(), p);
        }
    }

    if !buf.is_empty() && !should_stop() {
        let batch = scanner.scan_files_batch_in_pool(
            &pool,
            &buf,
            &store,
            &cache,
            &existing_photo_map,
            force,
            &should_stop,
            &global_counter,
            total_media_count,
            &on_progress,
        );
        for p in batch {
            existing_photo_map.insert(p.path.clone(), p);
        }
    }

    let photos_in_dir: Vec<crate::models::Photo> = existing_photo_map.into_values().collect();
    logger::log_line(format!("scan_directory photos_in_dir_count={}", photos_in_dir.len()));
    store.replace_photos_in_dir(&path, photos_in_dir, true).await;

    if scan_cancelled.load(Ordering::Relaxed) {
        cache.flush_all().await;
        let final_state = {
            let mut state = lock_or_recover(&scan_state);
            state.scanning = false;
            state.current_dir = None;
            state.current_path = None;
            let processed = state.processed_count;
            let skipped = state.skipped_count;
            push_scan_log(&mut state, format!("扫描已停止: {}，总共处理: {}，跳过: {}", path, processed, skipped), "warning", Some(&app));
            state.clone()
        };

        let _ = app.emit("scan-progress", serde_json::json!({
            "type": "stopped",
            "directory": path
        }));

        return Ok(final_state);
    }

    {
        let mut state = lock_or_recover(&scan_state);
        push_scan_log(&mut state, "阶段: scanning_videos", "info", Some(&app));
    }
    
    let _ = app.emit("scan-progress", serde_json::json!({
        "type": "progress",
        "stage": "scanning_videos",
        "current": global_counter.load(Ordering::Relaxed),
        "total": total_media_count
    }));
    
    let mut existing_video_map: HashMap<String, crate::models::Video> = HashMap::new();
    for v in store.get_videos().await {
        if v.path.starts_with(&path) {
            existing_video_map.insert(v.path.clone(), v);
        }
    }

    let video_total = WalkDir::new(&dir_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && video_scanner.is_video(e.path()))
        .count();
    // let video_counter = AtomicUsize::new(0);

    const VIDEO_BATCH: usize = 16;
    let mut vbuf: Vec<PathBuf> = Vec::with_capacity(VIDEO_BATCH);
    for entry in WalkDir::new(&dir_path).into_iter().filter_map(|e| e.ok()) {
        if should_stop() {
            break;
        }
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if !video_scanner.is_video(p) {
            continue;
        }

        vbuf.push(entry.into_path());
        if vbuf.len() < VIDEO_BATCH {
            continue;
        }

        let batch = video_scanner.scan_files_batch_in_pool(
            &pool,
            &vbuf,
            &store,
            &cache,
            &existing_video_map,
            force,
            &should_stop,
            &global_counter,
            total_media_count,
            &on_progress,
        );

        vbuf.clear();

        for v in batch {
            existing_video_map.insert(v.path.clone(), v);
        }
    }

    if !vbuf.is_empty() && !should_stop() {
        let batch = video_scanner.scan_files_batch_in_pool(
            &pool,
            &vbuf,
            &store,
            &cache,
            &existing_video_map,
            force,
            &should_stop,
            &global_counter,
            total_media_count,
            &on_progress,
        );
        for v in batch {
            existing_video_map.insert(v.path.clone(), v);
        }
    }

    let videos_in_dir: Vec<crate::models::Video> = existing_video_map.into_values().collect();
    logger::log_line(format!("scan_directory videos_in_dir_count={}", videos_in_dir.len()));
    store.replace_videos_in_dir(&path, videos_in_dir, true).await;

    if scan_cancelled.load(Ordering::Relaxed) {
        cache.flush_all().await;
        let final_state = {
            let mut state = lock_or_recover(&scan_state);
            state.scanning = false;
            state.current_dir = None;
            state.current_path = None;
            let processed = state.processed_count;
            let skipped = state.skipped_count;
            push_scan_log(&mut state, format!("扫描已停止: {}，总共处理: {}，跳过: {}", path, processed, skipped), "warning", Some(&app));
            state.clone()
        };

        let _ = app.emit("scan-progress", serde_json::json!({
            "type": "stopped",
            "directory": path
        }));

        return Ok(final_state);
    }

    // 扫描阶段会写入内存缓存（GPS/AI），这里统一落盘，避免每条写盘造成极慢的 IO。
    cache.flush_all().await;
    logger::log_line("scan_directory cache flushed");
    
    // 触发后台地理编码任务
    let store_clone = store.inner().clone();
    let cache_clone = cache.inner().clone();
    let app_clone = app.clone();
    let scan_state_clone = scan_state.inner().clone();
    tokio::spawn(async move {
        crate::commands::directories::process_pending_geocoding(&store_clone, &cache_clone, &app_clone, &scan_state_clone).await;
    });

    let final_state = {
        let mut state = lock_or_recover(&scan_state);
        state.scanning = false;
        state.current_dir = None;
        state.current_path = None;
        let processed = state.processed_count;
        let skipped = state.skipped_count;
        push_scan_log(&mut state, format!("扫描完成: {}，总共处理: {}，跳过: {}", path, processed, skipped), "success", Some(&app));
        state.clone()
    };
    logger::log_line(format!(
        "scan_directory complete path={} processed={} skipped={}",
        path, final_state.processed_count, final_state.skipped_count
    ));
    
    let _ = app.emit("scan-progress", serde_json::json!({
        "type": "complete",
        "directory": path
    }));
    
    Ok(final_state)
}

#[tauri::command]
pub async fn get_scan_state(scan_state: State<'_, Arc<Mutex<ScanState>>>) -> Result<ScanState, String> {
    Ok(lock_or_recover(&scan_state).clone())
}

#[tauri::command]
pub async fn stop_scan(
    scan_state: State<'_, Arc<Mutex<ScanState>>>,
    cache: State<'_, Arc<CacheStore>>,
    scan_cancelled: State<'_, Arc<AtomicBool>>,
) -> Result<bool, String> {
    logger::log_line("stop_scan requested");
    scan_cancelled.store(true, Ordering::SeqCst);

    {
        let mut state = lock_or_recover(&scan_state);
        state.scanning = false;
        state.current_dir = None;
        state.current_path = None;
        push_scan_log(&mut state, "扫描已取消，正在写入缓存...", "warning", None);
    }

    // 用户手动停止时也要把扫描过程中写入内存的缓存落盘
    cache.flush_all().await;

    {
        let mut state = lock_or_recover(&scan_state);
        push_scan_log(&mut state, "缓存已写入磁盘", "info", None);
    }

    Ok(true)
}

pub async fn process_pending_geocoding(
    store: &Arc<DataStore>,
    cache: &Arc<CacheStore>,
    app: &tauri::AppHandle,
    scan_state: &Arc<Mutex<ScanState>>,
) {
    let mut pending_photos = Vec::new();
    let mut pending_videos = Vec::new();

    // 找出所有需要填充地址的照片
    for photo in store.get_photos().await {
        if photo.deleted {
            continue;
        }
        if photo.address.is_none() {
            if let Some(ref exif) = photo.exif {
                if let Some(ref gps) = exif.gps {
                    pending_photos.push((photo.id.clone(), gps.latitude, gps.longitude));
                }
            }
        }
    }

    // 找出所有需要填充地址的视频
    for video in store.get_videos().await {
        if video.address.is_none() {
            if let Some(ref exif) = video.exif {
                if let Some(ref gps) = exif.gps {
                    pending_videos.push((video.id.clone(), gps.latitude, gps.longitude));
                }
            }
        }
    }

    let total_pending = pending_photos.len() + pending_videos.len();
    if total_pending == 0 {
        return;
    }

    {
        let mut state = lock_or_recover(scan_state);
        push_scan_log(&mut state, format!("开始后台获取 {} 个位置的地址信息", total_pending), "info", Some(app));
    }

    let geocoder = crate::scanner::geocoder::Geocoder::new();
    let mut processed = 0;

    for (id, lat, lon) in pending_photos {
        if let Some(address) = geocoder.reverse_geocode(lat, lon).await {
            cache.save_address_mem_sync(lat, lon, address.clone());
            if let Some(mut photo) = store.get_photo_by_id(&id).await {
                photo.address = Some(crate::models::Address::from(address));
                store.update_photo(&id, photo).await;
            }
        }
        processed += 1;
        if processed % 10 == 0 {
            cache.flush_all().await;
            let mut state = lock_or_recover(scan_state);
            push_scan_log(&mut state, format!("后台地址获取进度: {}/{}", processed, total_pending), "info", Some(app));
        }
    }

    for (id, lat, lon) in pending_videos {
        if let Some(address) = geocoder.reverse_geocode(lat, lon).await {
            cache.save_address_mem_sync(lat, lon, address.clone());
            if let Some(mut video) = store.get_video_by_id(&id).await {
                video.address = Some(crate::models::Address::from(address));
                store.update_video(&id, video).await;
            }
        }
        processed += 1;
        if processed % 10 == 0 {
            cache.flush_all().await;
            let mut state = lock_or_recover(scan_state);
            push_scan_log(&mut state, format!("后台地址获取进度: {}/{}", processed, total_pending), "info", Some(app));
        }
    }

    cache.flush_all().await;
    {
        let mut state = lock_or_recover(scan_state);
        push_scan_log(&mut state, "后台地址获取完成".to_string(), "success", Some(app));
    }
}

#[tauri::command]
pub async fn backfill_photo_addresses(
    store: State<'_, Arc<DataStore>>,
    cache: State<'_, Arc<CacheStore>>,
    app: AppHandle,
    address_backfill_state: State<'_, Arc<Mutex<AddressBackfillState>>>,
) -> Result<AddressBackfillResult, String> {
    let mut photos = store.get_photos().await;
    let mut videos = store.get_videos().await;
    let geocoder = Geocoder::new();
    let config = store.get_config().await;
    let scanner = PhotoScanner::new(
        config.thumbnail_size,
        config.supported_formats.clone(),
        config.scan_concurrency,
    );
    let video_scanner = VideoScanner::new(
        config.thumbnail_size,
        config.video_formats.clone(),
        config.scan_concurrency,
    );
    let mut result = AddressBackfillResult::default();
    result.total = photos.iter().filter(|p| !p.deleted).count()
                  + videos.iter().filter(|v| !v.deleted).count();

    {
        let mut state = lock_or_recover(&address_backfill_state);
        *state = AddressBackfillState {
            running: true,
            total: result.total,
            scanned: 0,
            updated: 0,
            skipped: 0,
            filename: None,
            status: Some("started".to_string()),
        };
    }

    let _ = app.emit("address-backfill-started", serde_json::json!({
        "total": result.total,
    }));

    for photo in photos.iter_mut() {
        if photo.deleted {
            result.skipped += 1;
            continue;
        }

        let mut gps = photo.exif.as_ref().and_then(|exif| exif.gps.clone());
        if gps.is_none() && Path::new(&photo.path).exists() {
            if let Some(exif) = scanner.extract_exif(Path::new(&photo.path)) {
                if photo.date_taken.is_none() || photo.date_taken.as_ref() == Some(&photo.created_at) {
                    if let Some(dt) = exif.date_time.clone().or_else(|| scanner.extract_date_from_filename(&photo.filename)) {
                        photo.date_taken = Some(dt);
                    }
                }
                gps = exif.gps.clone();
                photo.exif = Some(exif);
            }
        } else if (photo.date_taken.is_none() || photo.date_taken.as_ref() == Some(&photo.created_at))
            && Path::new(&photo.path).exists()
        {
            if let Some(dt) = scanner.extract_date_from_filename(&photo.filename) {
                photo.date_taken = Some(dt);
            }
        }

        if gps.is_none() {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(photo.filename.clone());
                state.status = Some("skipped".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": photo.filename,
                "status": "skipped",
            }));
            continue;
        }

        result.scanned += 1;
        if photo.address.is_some() {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(photo.filename.clone());
                state.status = Some("already_exists".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": photo.filename,
                "status": "already_exists",
            }));
            continue;
        }

        let gps = gps.unwrap();
        if let Some(address) = resolve_address(gps.latitude, gps.longitude, &cache, &geocoder).await {
            photo.address = Some(address.clone());
            result.updated += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(photo.filename.clone());
                state.status = Some("updated".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": photo.filename,
                "address": address.display_name,
                "status": "updated",
            }));
        } else {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(photo.filename.clone());
                state.status = Some("geocode_failed".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": photo.filename,
                "status": "geocode_failed",
            }));
        }
    }

    store.save_photos(photos).await;

    for video in videos.iter_mut() {
        if video.deleted {
            result.skipped += 1;
            continue;
        }

        let mut gps = video.exif.as_ref().and_then(|exif| exif.gps.clone());
        if gps.is_none() && Path::new(&video.path).exists() {
            if let Some((_, _, _, _, extracted_gps)) = video_scanner.extract_metadata(Path::new(&video.path)) {
                gps = extracted_gps;
                if gps.is_some() {
                    let mut exif = video.exif.take().unwrap_or_default();
                    exif.gps = gps.clone();
                    video.exif = Some(exif);
                }
            }
        }

        if gps.is_none() {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(video.filename.clone());
                state.status = Some("skipped".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": video.filename,
                "status": "skipped",
            }));
            continue;
        }

        result.scanned += 1;
        if video.address.is_some() {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(video.filename.clone());
                state.status = Some("already_exists".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": video.filename,
                "status": "already_exists",
            }));
            continue;
        }

        let gps = gps.unwrap();
        if let Some(address) = resolve_address(gps.latitude, gps.longitude, &cache, &geocoder).await {
            video.address = Some(address.clone());
            result.updated += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(video.filename.clone());
                state.status = Some("updated".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": video.filename,
                "address": address.display_name,
                "status": "updated",
            }));
        } else {
            result.skipped += 1;
            {
                let mut state = lock_or_recover(&address_backfill_state);
                state.scanned = result.scanned;
                state.updated = result.updated;
                state.skipped = result.skipped;
                state.filename = Some(video.filename.clone());
                state.status = Some("geocode_failed".to_string());
            }
            let _ = app.emit("address-backfill-progress", serde_json::json!({
                "updated": result.updated,
                "scanned": result.scanned,
                "skipped": result.skipped,
                "total": result.total,
                "filename": video.filename,
                "status": "geocode_failed",
            }));
        }
    }

    store.save_videos(videos).await;
    cache.flush_all().await;
    {
        let mut state = lock_or_recover(&address_backfill_state);
        *state = AddressBackfillState {
            running: false,
            total: result.total,
            scanned: result.scanned,
            updated: result.updated,
            skipped: result.skipped,
            filename: None,
            status: Some("complete".to_string()),
        };
    }
    let _ = app.emit("address-backfill-complete", serde_json::json!(result.clone()));
    Ok(result)
}

#[tauri::command]
pub async fn get_address_backfill_state(
    address_backfill_state: State<'_, Arc<Mutex<AddressBackfillState>>>,
) -> Result<AddressBackfillState, String> {
    Ok(lock_or_recover(&address_backfill_state).clone())
}
