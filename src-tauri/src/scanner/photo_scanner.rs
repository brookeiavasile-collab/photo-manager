use std::path::Path;
use std::path::PathBuf;
use std::collections::HashMap;
use std::fs;
use regex::Regex;
use walkdir::WalkDir;
use image::ImageReader;
use crate::models::{Photo, Exif, Gps, Address};
use crate::store::data_store::DataStore;
use crate::store::cache_store::CacheStore;
use crate::scanner::geocoder::Geocoder;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use rayon::ThreadPool;
use tokio::sync::Semaphore;
use std::sync::Arc;

pub struct PhotoScanner {
    thumbnail_size: u32,
    supported_formats: Vec<String>,
    geocoder: Geocoder,
    concurrency: usize,
    thumbnail_semaphore: Arc<Semaphore>,
}

impl PhotoScanner {
    pub fn new(thumbnail_size: u32, supported_formats: Vec<String>, scan_concurrency: u32) -> Self {
        let c = if scan_concurrency == 0 {
            std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
        } else {
            scan_concurrency as usize
        };
        let thumb_permits = std::cmp::min(2, c.max(1));
        Self { 
            thumbnail_size, 
            supported_formats,
            geocoder: Geocoder::new(),
            concurrency: c.max(1),
            thumbnail_semaphore: Arc::new(Semaphore::new(thumb_permits)),
        }
    }

    pub fn is_supported(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| self.supported_formats.contains(&format!(".{}", e.to_lowercase())))
            .unwrap_or(false)
    }

    pub fn list_files(&self, dir: &Path) -> Vec<PathBuf> {
        WalkDir::new(dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file() && self.is_supported(e.path()))
            .map(|e| e.into_path())
            .collect()
    }

    pub fn calculate_md5(&self, path: &Path) -> Option<String> {
        use std::io::Read;
        let mut file = fs::File::open(path).ok()?;
        let mut hasher = md5::Context::new();
        let mut buffer = [0u8; 65536];
        loop {
            let bytes_read = file.read(&mut buffer).ok()?;
            if bytes_read == 0 { break; }
            hasher.consume(&buffer[..bytes_read]);
        }
        Some(format!("{:x}", hasher.compute()))
    }

    pub fn generate_thumbnail(&self, path: &Path, thumbnails_dir: &Path) -> Option<String> {
        let thumb_name = format!("{:x}.jpg", md5::compute(path.to_string_lossy().as_bytes()));
        let thumb_path = thumbnails_dir.join(&thumb_name);

        if thumb_path.exists() {
            return Some(thumb_path.to_string_lossy().to_string());
        }

        let permit = tauri::async_runtime::block_on(self.thumbnail_semaphore.acquire()).ok()?;
        let img = ImageReader::open(path).ok()?.decode().ok()?;

        let thumbnail = img.thumbnail(self.thumbnail_size, self.thumbnail_size);
        thumbnail.save(&thumb_path).ok()?;
        drop(permit);
        Some(thumb_path.to_string_lossy().to_string())
    }

    pub fn extract_exif(&self, path: &Path) -> Option<Exif> {
        let file = std::fs::File::open(path).ok()?;
        let mut bufreader = std::io::BufReader::new(&file);
        let exifreader = exif::Reader::new();
        let exif_data = exifreader.read_from_container(&mut bufreader).ok();

        let mut exif = Exif::default();

        if let Some(ref exif_data) = exif_data {
            if let Some(make) = exif_data.get_field(exif::Tag::Make, exif::In::PRIMARY) {
                exif.make = Some(make.display_value().to_string());
            }
            if let Some(model) = exif_data.get_field(exif::Tag::Model, exif::In::PRIMARY) {
                exif.model = Some(model.display_value().to_string());
            }
            if let Some(datetime) = exif_data.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY) {
                exif.date_time = Some(datetime.display_value().to_string());
            }
            if let Some(width) = exif_data.get_field(exif::Tag::PixelXDimension, exif::In::PRIMARY) {
                if let Some(v) = width.value.get_uint(0) {
                    exif.width = Some(v);
                }
            }
            if let Some(height) = exif_data.get_field(exif::Tag::PixelYDimension, exif::In::PRIMARY) {
                if let Some(v) = height.value.get_uint(0) {
                    exif.height = Some(v);
                }
            }

            let lat = exif_data.get_field(exif::Tag::GPSLatitude, exif::In::PRIMARY);
            let lat_ref = exif_data.get_field(exif::Tag::GPSLatitudeRef, exif::In::PRIMARY);
            let lon = exif_data.get_field(exif::Tag::GPSLongitude, exif::In::PRIMARY);
            let lon_ref = exif_data.get_field(exif::Tag::GPSLongitudeRef, exif::In::PRIMARY);

            if let (Some(lat), Some(lat_ref), Some(lon), Some(lon_ref)) = (lat, lat_ref, lon, lon_ref) {
                let lat_val = Self::convert_gps_coordinate(&lat.value);
                let lon_val = Self::convert_gps_coordinate(&lon.value);
                let lat_ref_str = lat_ref.display_value().to_string();
                let lon_ref_str = lon_ref.display_value().to_string();

                if let (Some(lat), Some(lon)) = (lat_val, lon_val) {
                    let lat = if lat_ref_str.contains('S') { -lat } else { lat };
                    let lon = if lon_ref_str.contains('W') { -lon } else { lon };
                    exif.gps = Some(Gps { latitude: lat, longitude: lon, altitude: None });
                }
            }
        }

        if exif.width.is_none() || exif.height.is_none() {
            if let Ok(img_reader) = ImageReader::open(path) {
                if let Ok(dimensions) = img_reader.into_dimensions() {
                    if exif.width.is_none() {
                        exif.width = Some(dimensions.0);
                    }
                    if exif.height.is_none() {
                        exif.height = Some(dimensions.1);
                    }
                }
            }
        }

        Some(exif)
    }

    pub fn extract_date_from_filename(&self, filename: &str) -> Option<String> {
        let re = Regex::new(r"(\d{4})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})").ok()?;
        let caps = re.captures(filename)?;

        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;
        let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
        let min: u32 = caps.get(5)?.as_str().parse().ok()?;
        let sec: u32 = caps.get(6)?.as_str().parse().ok()?;

        let dt = chrono::NaiveDateTime::new(
            chrono::NaiveDate::from_ymd_opt(year, month, day)?,
            chrono::NaiveTime::from_hms_opt(hour, min, sec)?,
        );

        Some(dt.and_utc().to_rfc3339())
    }

    fn convert_gps_coordinate(value: &exif::Value) -> Option<f64> {
        match value {
            exif::Value::Rational(values) if values.len() >= 3 => {
                let deg = values[0].to_f64();
                let min = values[1].to_f64();
                let sec = values[2].to_f64();
                Some(deg + min / 60.0 + sec / 3600.0)
            }
            exif::Value::SRational(values) if values.len() >= 3 => {
                let deg = values[0].to_f64();
                let min = values[1].to_f64();
                let sec = values[2].to_f64();
                Some(deg + min / 60.0 + sec / 3600.0)
            }
            _ => None,
        }
    }

    fn geocode_sync(&self, lat: f64, lon: f64, cache: &CacheStore) -> Option<Address> {
        if let Some(cached) = cache.get_address_sync(lat, lon) {
            return Some(Address::from(cached));
        }

        // 这里不要每次都写盘（会非常慢）；扫描结束后统一 flush
        let address = tauri::async_runtime::block_on(async {
            self.geocoder.reverse_geocode(lat, lon).await
        })?;

        cache.save_address_mem_sync(lat, lon, address.clone());
        Some(Address::from(address))
    }

    pub fn scan_directory(&self, dir: &Path, store: &DataStore, cache: &CacheStore) -> Vec<Photo> {
        let empty: HashMap<String, Photo> = HashMap::new();
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(self.concurrency)
            .build()
            .expect("failed to build scan thread pool");
        self.scan_directory_with_progress_in_pool(&pool, dir, store, cache, &empty, false, || false, |_, _, _, _, _| {})
    }

    fn build_photo(
        &self,
        path: &Path,
        existing: Option<&Photo>,
        thumbnails_dir: &Path,
        cache: &CacheStore,
        force: bool,
        should_stop: &(impl Fn() -> bool + Sync),
    ) -> Option<(Photo, bool, Vec<String>)> {
        if should_stop() {
            return None;
        }

        let mut log_actions = Vec::new();

        let metadata = fs::metadata(path).ok()?;

        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let created_at = metadata
            .created()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());
        let modified_at = metadata
            .modified()
            .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339());

        let existing_unchanged = existing
            .filter(|p| !p.deleted)
            .map(|p| p.size == metadata.len() && p.modified_at == modified_at)
            .unwrap_or(false);

        let mut photo = if let Some(base) = existing {
            let mut p = base.clone();
            p.path = path.to_string_lossy().to_string();
            p.filename = filename;
            p.deleted = false;
            p.deleted_at = None;
            p
        } else {
            Photo::new(path.to_string_lossy().to_string(), filename)
        };

        photo.size = metadata.len();
        photo.created_at = created_at;
        photo.modified_at = modified_at;

        let needs_refresh = force || !existing_unchanged;

        if should_stop() {
            return None;
        }

        let exif_needs_refresh = photo.exif.as_ref().map(|e| e.width.is_none() || e.height.is_none()).unwrap_or(true);
        if needs_refresh || exif_needs_refresh {
            log_actions.push("提取元数据".to_string());
            if let Some(ref mut exif) = photo.exif {
                if exif.width.is_none() || exif.height.is_none() {
                    if let Ok(img_reader) = ImageReader::open(path) {
                        if let Ok(dimensions) = img_reader.into_dimensions() {
                            if exif.width.is_none() {
                                exif.width = Some(dimensions.0);
                            }
                            if exif.height.is_none() {
                                exif.height = Some(dimensions.1);
                            }
                        }
                    }
                }
            } else {
                photo.exif = self.extract_exif(path);
            }
        }

        let filename_date = self.extract_date_from_filename(&photo.filename);

        if let Some(ref exif) = photo.exif {
            if let Some(ref dt) = exif.date_time {
                if needs_refresh || photo.date_taken.is_none() || photo.date_taken.as_ref() == Some(&photo.created_at) {
                    photo.date_taken = Some(dt.clone());
                }
            } else if let Some(ref dt) = filename_date {
                if needs_refresh || photo.date_taken.is_none() || photo.date_taken.as_ref() == Some(&photo.created_at) {
                    photo.date_taken = Some(dt.clone());
                }
            }

            if photo.address.is_none() {
                if let Some(ref gps) = exif.gps {
                    if let Some(cached) = cache.get_address_sync(gps.latitude, gps.longitude) {
                        photo.address = Some(Address::from(cached));
                    }
                    // 不在扫描线程中调用外部 API (geocode_sync)
                    // 后续会有独立的后台任务专门处理地址填充
                }
            }
        } else if let Some(ref dt) = filename_date {
            if needs_refresh || photo.date_taken.is_none() || photo.date_taken.as_ref() == Some(&photo.created_at) {
                photo.date_taken = Some(dt.clone());
            }
        }

        if needs_refresh || photo.md5.is_none() {
            if should_stop() {
                return None;
            }
            log_actions.push("计算MD5".to_string());
            photo.md5 = self.calculate_md5(path);
        }

        if let Some(ref md5) = photo.md5 {
            if force || photo.ai_tags.is_empty() {
                if let Some(cached) = cache.get_ai_tags_sync(md5) {
                    log_actions.push("获取AI标签".to_string());
                    photo.category = cached.category;
                    photo.ai_tags = cached.tags;
                }
            }
        }

        let thumb_exists = photo
            .thumbnail
            .as_ref()
            .map(|p| Path::new(p).exists())
            .unwrap_or(false);

        if needs_refresh || photo.thumbnail.is_none() || !thumb_exists {
            if should_stop() {
                return None;
            }
            log_actions.push("生成缩略图".to_string());
            photo.thumbnail = self.generate_thumbnail(path, thumbnails_dir);
        }

        let is_skipped = log_actions.is_empty();
        Some((photo, is_skipped, log_actions))
    }

    pub fn scan_files_batch_in_pool<F>(
        &self,
        pool: &ThreadPool,
        files: &[PathBuf],
        store: &DataStore,
        cache: &CacheStore,
        existing_by_path: &HashMap<String, Photo>,
        force: bool,
        should_stop: &(impl Fn() -> bool + Sync),
        counter: &AtomicUsize,
        total: usize,
        on_progress: &F,
    ) -> Vec<Photo>
    where
        F: Fn(usize, usize, &str, bool, &[String]) + Send + Sync,
    {
        let thumbnails_dir = store.thumbnails_dir();

        pool.install(|| {
            files
                .par_iter()
                .filter_map(|path| {
                    if should_stop() {
                        return None;
                    }

                    let filename = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let key = path.to_string_lossy().to_string();
                    let existing = existing_by_path.get(&key);
                    
                    let result = self.build_photo(path, existing, &thumbnails_dir, cache, force, should_stop);
                    
                    if let Some((photo, is_skipped, ref log_actions)) = result {
                        let current = counter.fetch_add(1, Ordering::Relaxed) + 1;
                        on_progress(current, total, &filename, is_skipped, log_actions);
                        Some(photo)
                    } else {
                        None
                    }
                })
                .collect()
        })
    }

    pub fn scan_directory_with_progress_in_pool<F>(
        &self,
        pool: &ThreadPool,
        dir: &Path,
        store: &DataStore,
        cache: &CacheStore,
        existing_by_path: &HashMap<String, Photo>,
        force: bool,
        should_stop: impl Fn() -> bool + Send + Sync,
        on_progress: F,
    ) -> Vec<Photo>
    where
        F: Fn(usize, usize, &str, bool, &[String]) + Send + Sync,
    {
        let files = self.list_files(dir);
        let total = files.len();
        if total == 0 {
            return Vec::new();
        }

        let counter = AtomicUsize::new(0);
        self.scan_files_batch_in_pool(
            pool,
            &files,
            store,
            cache,
            existing_by_path,
            force,
            &should_stop,
            &counter,
            total,
            &on_progress,
        )
    }
}
