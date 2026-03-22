use reqwest::Client;
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use crate::store::cache_store::CachedAddress;

static LAST_REQUEST_MS: AtomicU64 = AtomicU64::new(0);
const MIN_INTERVAL_MS: u64 = 1100;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Deserialize)]
struct NominatimResponse {
    address: Option<NominatimAddress>,
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NominatimAddress {
    country: Option<String>,
    state: Option<String>,
    province: Option<String>,
    city: Option<String>,
    town: Option<String>,
    village: Option<String>,
    county: Option<String>,
    suburb: Option<String>,
    road: Option<String>,
}

pub struct Geocoder {
    client: Client,
}

impl Geocoder {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .user_agent("PhotoManager/1.0")
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    async fn wait_for_rate_limit() {
        let now = now_ms();
        let last = LAST_REQUEST_MS.load(Ordering::Relaxed);
        
        if last > 0 {
            let elapsed = now.saturating_sub(last);
            if elapsed < MIN_INTERVAL_MS {
                let wait = MIN_INTERVAL_MS - elapsed;
                tokio::time::sleep(Duration::from_millis(wait)).await;
            }
        }
    }

    pub async fn reverse_geocode(&self, lat: f64, lon: f64) -> Option<CachedAddress> {
        Self::wait_for_rate_limit().await;
        
        let url = format!(
            "https://nominatim.openstreetmap.org/reverse?format=json&lat={}&lon={}&zoom=14&addressdetails=1",
            lat, lon
        );

        let response = self.client
            .get(&url)
            .header("User-Agent", "PhotoManager/1.0")
            .send()
            .await
            .ok()?;

        LAST_REQUEST_MS.store(now_ms(), Ordering::Relaxed);

        if !response.status().is_success() {
            return None;
        }

        let data: NominatimResponse = response.json().await.ok()?;
        
        let addr = data.address?;
        
        Some(CachedAddress {
            country: addr.country,
            province: addr.state.or(addr.province).or(addr.county),
            city: addr.city.or(addr.town).or(addr.village),
            district: addr.suburb,
            road: addr.road,
            display_name: data.display_name,
        })
    }
}

impl Default for Geocoder {
    fn default() -> Self {
        Self::new()
    }
}