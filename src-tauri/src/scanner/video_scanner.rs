use std::path::Path;
use std::path::PathBuf;
use std::collections::HashMap;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};
use std::fs;
use regex::Regex;
use crate::models::{Video, Exif, Gps, Address};
use crate::store::data_store::DataStore;
use crate::store::cache_store::CacheStore;
use crate::scanner::geocoder::Geocoder;
use crate::logger;
use rayon::prelude::*;
use rayon::ThreadPool;

pub struct VideoScanner {
    thumbnail_size: u32,
    video_formats: Vec<String>,
    concurrency: usize,
    geocoder: Geocoder,
}

impl VideoScanner {
    fn run_output_with_timeout(mut command: Command, timeout: Duration) -> Option<Output> {
        command.stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = command.spawn().ok()?;
        let start = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return child.wait_with_output().ok(),
                Ok(None) => {
                    if start.elapsed() >= timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return None;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(_) => return None,
            }
        }
    }

    pub fn new(thumbnail_size: u32, video_formats: Vec<String>, scan_concurrency: u32) -> Self {
        let c = if scan_concurrency == 0 {
            std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
        } else {
            scan_concurrency as usize
        };
        Self { thumbnail_size, video_formats, concurrency: c.max(1), geocoder: Geocoder::new() }
    }

    pub fn is_video(&self, path: &Path) -> bool {
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| self.video_formats.contains(&format!(".{}", e.to_lowercase())))
            .unwrap_or(false)
    }

    pub fn list_files(&self, dir: &Path) -> Vec<PathBuf> {
        walkdir::WalkDir::new(dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file() && self.is_video(e.path()))
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

    pub fn extract_metadata(&self, path: &Path) -> Option<(f64, u32, u32, Option<String>, Option<Gps>)> {
        logger::log_line(format!("ffprobe start file={}", path.display()));
        let mut cmd = Command::new("ffprobe");
        cmd.args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"])
            .arg(path);
        let output = match Self::run_output_with_timeout(cmd, Duration::from_secs(15)) {
            Some(out) => out,
            None => {
                logger::log_line(format!("ffprobe timeout file={}", path.display()));
                return None;
            }
        };
        logger::log_line(format!(
            "ffprobe end file={} ok={}",
            path.display(),
            output.status.success()
        ));

        let json: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
        
        let duration = json["format"]["duration"].as_f64().unwrap_or(0.0);
        
        let video_stream = json["streams"].as_array()
            .and_then(|streams| streams.iter().find(|s| s["codec_type"] == "video"))?;
        
        let width = video_stream["width"].as_u64().unwrap_or(0) as u32;
        let height = video_stream["height"].as_u64().unwrap_or(0) as u32;
        
        let creation_time = json["format"]["tags"]["creation_time"]
            .as_str()
            .map(|s| s.to_string());

        let gps = self.extract_gps_from_metadata(&json);

        Some((duration, width, height, creation_time, gps))
    }

    fn extract_gps_from_metadata(&self, json: &serde_json::Value) -> Option<Gps> {
        let tags = json["format"]["tags"].as_object()?;

        let location_keys = [
            "location",
            "com.apple.quicktime.location.ISO6709",
            "location-eng",
            "gps_location",
        ];

        for key in &location_keys {
            if let Some(value) = tags.get(*key).and_then(|v| v.as_str()) {
                if let Some(gps) = self.parse_iso6709(value) {
                    return Some(gps);
                }
            }
        }

        None
    }

    fn parse_iso6709(&self, s: &str) -> Option<Gps> {
        let re = Regex::new(r#"([+-]\d+\.?\d*)([+-]\d+\.?\d*)(?:([+-]\d+\.?\d*))?/?$"#).ok()?;
        let caps = re.captures(s)?;
        
        let lat: f64 = caps.get(1)?.as_str().parse().ok()?;
        let lon: f64 = caps.get(2)?.as_str().parse().ok()?;
        let alt: Option<f64> = caps.get(3).and_then(|m| m.as_str().parse().ok());

        if lat.abs() > 90.0 || lon.abs() > 180.0 {
            return None;
        }

        if lat == 0.0 && lon == 0.0 {
            return None;
        }

        Some(Gps {
            latitude: lat,
            longitude: lon,
            altitude: alt,
        })
    }

    fn geocode_sync(&self, lat: f64, lon: f64, cache: &CacheStore) -> Option<Address> {
        if let Some(cached) = cache.get_address_sync(lat, lon) {
            return Some(Address::from(cached));
        }

        let address = tauri::async_runtime::block_on(async {
            self.geocoder.reverse_geocode(lat, lon).await
        })?;

        cache.save_address_mem_sync(lat, lon, address.clone());
        Some(Address::from(address))
    }

    pub fn generate_thumbnail(&self, path: &Path, thumbnails_dir: &Path) -> Option<String> {
        let thumb_name = format!("{:x}.jpg", md5::compute(path.to_string_lossy().as_bytes()));
        let thumb_path = thumbnails_dir.join(&thumb_name);

        if thumb_path.exists() {
            return Some(thumb_path.to_string_lossy().to_string());
        }

        // Check if ffmpeg is available
        if Command::new("ffmpeg").arg("-version").output().is_err() {
            eprintln!("ffmpeg is not installed or not in PATH");
            return None;
        }

        // Use absolute paths and capture error output
        logger::log_line(format!("ffmpeg start file={}", path.display()));
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-v", "error", "-i", &path.to_string_lossy(), "-ss", "00:00:01", "-vframes", "1"])
            .arg("-vf").arg(format!("scale={}:-1", self.thumbnail_size))
            .args(["-y", &thumb_path.to_string_lossy()]);
        let status = match Self::run_output_with_timeout(cmd, Duration::from_secs(20)) {
            Some(out) => out,
            None => {
                logger::log_line(format!("ffmpeg timeout file={}", path.display()));
                return None;
            }
        };
        logger::log_line(format!(
            "ffmpeg end file={} ok={}",
            path.display(),
            status.status.success()
        ));

        if status.status.success() {
            Some(thumb_path.to_string_lossy().to_string())
        } else {
            eprintln!("ffmpeg failed to generate thumbnail for {:?}. Error: {}", path, String::from_utf8_lossy(&status.stderr));
            None
        }
    }

    pub fn extract_date_from_filename(&self, filename: &str) -> Option<String> {
        let re = Regex::new(r"(\d{4})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})[_.-]?(\d{2})").ok()?;
        if let Some(caps) = re.captures(filename) {
            let year: i32 = caps.get(1)?.as_str().parse().ok()?;
            let month: u32 = caps.get(2)?.as_str().parse().ok()?;
            let day: u32 = caps.get(3)?.as_str().parse().ok()?;
            let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
            let min: u32 = caps.get(5)?.as_str().parse().ok()?;
            let sec: u32 = caps.get(6)?.as_str().parse().ok()?;
            
            let dt = chrono::NaiveDateTime::new(
                chrono::NaiveDate::from_ymd_opt(year, month, day)?,
                chrono::NaiveTime::from_hms_opt(hour, min, sec)?
            );
            return Some(dt.and_utc().to_rfc3339());
        }
        None
    }

    fn build_video(
        &self,
        path: &Path,
        existing: Option<&Video>,
        thumbnails_dir: &Path,
        cache: &CacheStore,
        force: bool,
        should_stop: &(impl Fn() -> bool + Sync),
    ) -> Option<(Video, bool, Vec<String>)> {
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
            .filter(|v| !v.deleted)
            .map(|v| v.size == metadata.len() && v.modified_at == modified_at)
            .unwrap_or(false);

        let mut video = if let Some(base) = existing {
            let mut v = base.clone();
            v.path = path.to_string_lossy().to_string();
            v.filename = filename;
            v.deleted = false;
            v.deleted_at = None;
            v
        } else {
            Video::new(path.to_string_lossy().to_string(), filename)
        };

        video.size = metadata.len();
        video.created_at = created_at;
        video.modified_at = modified_at;

        let needs_refresh = force || !existing_unchanged;

        if should_stop() {
            return None;
        }

        if needs_refresh || video.duration.is_none() || video.width.is_none() || video.height.is_none() {
            log_actions.push("提取视频元数据".to_string());
            if let Some((duration, width, height, creation_time, gps)) = self.extract_metadata(path) {
                video.duration = Some(duration);
                video.width = Some(width);
                video.height = Some(height);
                if video.date_taken.is_none() {
                    video.date_taken = creation_time.or_else(|| self.extract_date_from_filename(&video.filename));
                }

                if gps.is_some() {
                    let mut exif = video.exif.take().unwrap_or_default();
                    exif.gps = gps.clone();
                    video.exif = Some(exif);

                    if video.address.is_none() {
                        let g = gps.unwrap();
                        if let Some(cached) = cache.get_address_sync(g.latitude, g.longitude) {
                            video.address = Some(Address::from(cached));
                        }
                    }
                }
            }
        }

        if needs_refresh || video.md5.is_none() {
            if should_stop() {
                return None;
            }
            log_actions.push("计算MD5".to_string());
            video.md5 = self.calculate_md5(path);
        }

        let thumb_exists = video
            .thumbnail
            .as_ref()
            .map(|p| Path::new(p).exists())
            .unwrap_or(false);

        if needs_refresh || video.thumbnail.is_none() || !thumb_exists {
            if should_stop() {
                return None;
            }
            log_actions.push("生成缩略图".to_string());
            video.thumbnail = self.generate_thumbnail(path, thumbnails_dir);
        }

        let is_skipped = log_actions.is_empty();
        Some((video, is_skipped, log_actions))
    }

    pub fn scan_directory_with_existing(
        &self,
        dir: &Path,
        store: &DataStore,
        cache: &CacheStore,
        existing_by_path: &HashMap<String, Video>,
        force: bool,
        should_stop: impl Fn() -> bool + Send + Sync,
    ) -> Vec<Video> {
        let files = self.list_files(dir);
        if files.is_empty() {
            return Vec::new();
        }

        let pool = match rayon::ThreadPoolBuilder::new()
            .num_threads(self.concurrency)
            .build()
        {
            Ok(pool) => pool,
            Err(e) => {
                eprintln!("ERROR: failed to build scan thread pool: {}", e);
                return Vec::new();
            }
        };

        let counter = std::sync::atomic::AtomicUsize::new(0);
        self.scan_files_batch_in_pool(&pool, &files, store, cache, existing_by_path, force, &should_stop, &counter, files.len(), &|_, _, _, _, _| {})
    }

    pub fn scan_files_batch_in_pool<F>(
        &self,
        pool: &ThreadPool,
        files: &[PathBuf],
        store: &DataStore,
        cache: &CacheStore,
        existing_by_path: &HashMap<String, Video>,
        force: bool,
        should_stop: &(impl Fn() -> bool + Sync),
        counter: &std::sync::atomic::AtomicUsize,
        total: usize,
        on_progress: &F,
    ) -> Vec<Video>
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
                    
                    let result = self.build_video(path, existing, &thumbnails_dir, cache, force, should_stop);
                    
                    if let Some((video, is_skipped, ref log_actions)) = result {
                        let current = counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                        on_progress(current, total, &filename, is_skipped, log_actions);
                        Some(video)
                    } else {
                        None
                    }
                })
                .collect()
        })
    }

    pub fn scan_directory(&self, dir: &Path, store: &DataStore, cache: &CacheStore) -> Vec<Video> {
        let empty: HashMap<String, Video> = HashMap::new();
        self.scan_directory_with_existing(dir, store, cache, &empty, false, || false)
    }
}
