//! IP allow-list enforcement for `GeoRestrictionConfig`. Two independent
//! mechanisms, either of which allows a caller through:
//! - `allowed_cidrs`: exact IP/CIDR ranges, always available, no extra data.
//! - `allowed_regions`: country/city entries resolved via a GeoLite2-format
//!   MMDB file (`mmdb_path`) — MaxMind's own download or a redistributed
//!   mirror of the same free database both work, since it's just the
//!   standard MMDB binary format. Not enforced at all if `mmdb_path` is
//!   empty (there's nothing to resolve an IP's location against).

use crate::config::{GeoRegion, GeoRestrictionConfig, GeoRestrictionMode};
use axum::http::HeaderMap;
use ipnet::IpNet;
use std::net::{IpAddr, SocketAddr};
use std::path::Path;
use std::sync::RwLock;

/// Holds the currently-loaded GeoIP database, if any. Reloaded whenever the
/// admin changes `geo_restriction.mmdb_path` and saves the config (see
/// `handlers/admin.rs::save_admin_config`) rather than re-opened on every
/// lookup — `maxminddb::Reader::open_readfile` memory-maps the file once.
pub struct GeoIpDatabase {
    reader: RwLock<Option<maxminddb::Reader<Vec<u8>>>>,
}

impl GeoIpDatabase {
    pub fn empty() -> Self {
        Self {
            reader: RwLock::new(None),
        }
    }

    /// Loads (or clears, if `path` is empty) the database. Logs and clears
    /// on failure rather than panicking — a bad path shouldn't take down the
    /// backend, it should just disable region-based enforcement until fixed.
    pub fn reload(&self, path: &str) {
        let mut guard = self.reader.write().unwrap_or_else(|e| e.into_inner());
        if path.trim().is_empty() {
            *guard = None;
            return;
        }
        match maxminddb::Reader::open_readfile(Path::new(path.trim())) {
            Ok(reader) => *guard = Some(reader),
            Err(e) => {
                tracing::error!("Failed to load GeoIP database at {path}: {e}");
                *guard = None;
            }
        }
    }

    /// Resolves `ip` to `(country_iso_code, city_name)`. `city_name` is
    /// `None` when the database has no city-level data for this IP (common
    /// for a Country-only database, or ranges GeoLite2 only knows at country
    /// granularity) — that's still enough to satisfy a country-only region.
    fn lookup(&self, ip: IpAddr) -> Option<(String, Option<String>)> {
        let guard = self.reader.read().unwrap_or_else(|e| e.into_inner());
        let reader = guard.as_ref()?;
        let city: maxminddb::geoip2::City = reader.lookup(ip).ok()?;
        let country_code = city.country?.iso_code?.to_string();
        let city_name = city
            .city
            .and_then(|c| c.names)
            .and_then(|names| names.get("en").copied())
            .map(str::to_string);
        Some((country_code, city_name))
    }
}

/// Resolves the caller's IP: `X-Forwarded-For`'s first hop only when the
/// admin has explicitly opted into trusting it (reverse-proxy deployments),
/// otherwise the TCP peer address — never both, since a client can set
/// `X-Forwarded-For` to anything it likes when there's no trusted proxy
/// actually stripping/overwriting it first.
pub fn resolve_client_ip(
    config: &GeoRestrictionConfig,
    headers: &HeaderMap,
    peer: SocketAddr,
) -> IpAddr {
    if config.trust_x_forwarded_for {
        if let Some(forwarded) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .and_then(|v| v.parse::<IpAddr>().ok())
        {
            return forwarded;
        }
    }
    peer.ip()
}

/// `Ok(())` when neither mechanism is enabled, or `ip`'s match against the
/// mechanisms that are enabled agrees with `mode`:
/// - **Whitelist**: `Ok` only if `ip` matches something. An enabled
///   mechanism with an empty list (or, for `location_enabled`, no `mmdb_path`
///   loaded) rejects everyone (fail closed) — an admin who wants to allow no
///   one yet see the feature "enabled" should turn it off, not leave the
///   list empty.
/// - **Blacklist**: `Ok` unless `ip` matches something. Both lists empty
///   allows everyone (nothing to block), which is the correct behavior for
///   this mode, not a footgun to guard against.
pub fn check_ip_allowed(
    config: &GeoRestrictionConfig,
    geo_db: &GeoIpDatabase,
    ip: IpAddr,
) -> Result<(), &'static str> {
    if !config.ip_enabled && !config.location_enabled {
        return Ok(());
    }

    let matched = ip_matches_configured_list(config, geo_db, ip);
    let allowed = match config.mode {
        GeoRestrictionMode::Whitelist => matched,
        GeoRestrictionMode::Blacklist => !matched,
    };

    if allowed {
        Ok(())
    } else {
        Err("Această acțiune nu este permisă din locația ta")
    }
}

fn ip_matches_configured_list(
    config: &GeoRestrictionConfig,
    geo_db: &GeoIpDatabase,
    ip: IpAddr,
) -> bool {
    if config.ip_enabled {
        let cidr_match = config.allowed_cidrs.iter().any(|cidr| {
            cidr.parse::<IpNet>()
                .map(|net| net.contains(&ip))
                .unwrap_or(false)
        });
        if cidr_match {
            return true;
        }
    }

    if config.location_enabled && !config.allowed_regions.is_empty() {
        if let Some((country, city)) = geo_db.lookup(ip) {
            return config
                .allowed_regions
                .iter()
                .any(|region| region_matches(region, &country, city.as_deref()));
        }
    }

    false
}

fn region_matches(region: &GeoRegion, country: &str, city: Option<&str>) -> bool {
    if !region.country.eq_ignore_ascii_case(country) {
        return false;
    }
    match &region.city {
        None => true,
        Some(wanted) => city
            .map(|actual| actual.eq_ignore_ascii_case(wanted))
            .unwrap_or(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn config(ip_enabled: bool, cidrs: &[&str]) -> GeoRestrictionConfig {
        GeoRestrictionConfig {
            ip_enabled,
            location_enabled: false,
            mode: GeoRestrictionMode::Whitelist,
            allowed_regions: Vec::new(),
            mmdb_path: String::new(),
            allowed_cidrs: cidrs.iter().map(|s| s.to_string()).collect(),
            trust_x_forwarded_for: false,
        }
    }

    fn no_geo_db() -> GeoIpDatabase {
        GeoIpDatabase::empty()
    }

    #[test]
    fn disabled_restriction_allows_any_ip() {
        let cfg = config(false, &[]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "1.2.3.4".parse().unwrap()).is_ok());
    }

    #[test]
    fn enabled_with_empty_allow_list_rejects_everything() {
        let cfg = config(true, &[]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "1.2.3.4".parse().unwrap()).is_err());
    }

    #[test]
    fn accepts_ip_within_configured_cidr() {
        let cfg = config(true, &["193.226.0.0/16"]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_ok());
    }

    #[test]
    fn rejects_ip_outside_configured_cidr() {
        let cfg = config(true, &["193.226.0.0/16"]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "8.8.8.8".parse().unwrap()).is_err());
    }

    #[test]
    fn accepts_ipv6_within_configured_cidr() {
        let cfg = config(true, &["2001:db8::/32"]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "2001:db8::1".parse().unwrap()).is_ok());
    }

    #[test]
    fn malformed_cidr_entries_are_ignored_not_fatal() {
        let cfg = config(true, &["not-a-cidr", "193.226.0.0/16"]);
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_ok());
    }

    // ------------------------------------------------------------------
    // Blacklist mode — inverted semantics from whitelist.
    // ------------------------------------------------------------------

    #[test]
    fn blacklist_mode_rejects_ip_matching_a_blocked_cidr() {
        let mut cfg = config(true, &["193.226.0.0/16"]);
        cfg.mode = GeoRestrictionMode::Blacklist;
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_err());
    }

    #[test]
    fn blacklist_mode_allows_ip_not_matching_any_blocked_cidr() {
        let mut cfg = config(true, &["193.226.0.0/16"]);
        cfg.mode = GeoRestrictionMode::Blacklist;
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "8.8.8.8".parse().unwrap()).is_ok());
    }

    #[test]
    fn blacklist_mode_with_empty_list_allows_everyone() {
        // Opposite of whitelist's fail-closed default — an empty blacklist
        // has nothing to block, so this must NOT reject everything.
        let mut cfg = config(true, &[]);
        cfg.mode = GeoRestrictionMode::Blacklist;
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "1.2.3.4".parse().unwrap()).is_ok());
    }

    #[test]
    fn blacklist_mode_still_bypassed_entirely_when_restriction_disabled() {
        let mut cfg = config(false, &["193.226.0.0/16"]);
        cfg.mode = GeoRestrictionMode::Blacklist;
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_ok());
    }

    #[test]
    fn region_allow_list_without_a_loaded_database_never_matches() {
        // No mmdb loaded (GeoIpDatabase::empty()) — a configured region can
        // never be satisfied, so this must fall through to rejection rather
        // than panicking or silently allowing everything.
        let mut cfg = config(false, &[]);
        cfg.location_enabled = true;
        cfg.allowed_regions.push(GeoRegion {
            country: "RO".to_string(),
            city: None,
        });
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "1.2.3.4".parse().unwrap()).is_err());
    }

    // ------------------------------------------------------------------
    // ip_enabled / location_enabled are independent toggles.
    // ------------------------------------------------------------------

    #[test]
    fn location_enabled_alone_does_not_enforce_the_cidr_list() {
        // ip_enabled is off, so a configured CIDR range must NOT gate access
        // even though location_enabled turns the overall restriction on.
        let mut cfg = config(false, &["193.226.0.0/16"]);
        cfg.location_enabled = true;
        cfg.allowed_regions.push(GeoRegion {
            country: "RO".to_string(),
            city: None,
        });
        // No GeoIP db loaded, so the region can never match either — an IP
        // inside the (disabled) CIDR range must still be rejected, not let
        // through by the CIDR list it didn't opt into.
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_err());
    }

    #[test]
    fn ip_enabled_alone_ignores_regions_and_only_checks_cidrs() {
        let mut cfg = config(true, &["193.226.0.0/16"]);
        cfg.allowed_regions.push(GeoRegion {
            country: "RO".to_string(),
            city: None,
        });
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "193.226.5.5".parse().unwrap()).is_ok());
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "8.8.8.8".parse().unwrap()).is_err());
    }

    #[test]
    fn both_disabled_allows_any_ip_even_with_lists_configured() {
        let mut cfg = config(false, &["193.226.0.0/16"]);
        cfg.allowed_regions.push(GeoRegion {
            country: "RO".to_string(),
            city: None,
        });
        assert!(check_ip_allowed(&cfg, &no_geo_db(), "1.2.3.4".parse().unwrap()).is_ok());
    }

    #[test]
    fn region_matches_country_only_entry_regardless_of_city() {
        let region = GeoRegion {
            country: "RO".to_string(),
            city: None,
        };
        assert!(region_matches(&region, "RO", Some("Brasov")));
        assert!(region_matches(&region, "RO", None));
        assert!(!region_matches(&region, "DE", Some("Berlin")));
    }

    #[test]
    fn region_with_city_requires_matching_city_too() {
        let region = GeoRegion {
            country: "RO".to_string(),
            city: Some("Brasov".to_string()),
        };
        assert!(region_matches(&region, "RO", Some("Brasov")));
        assert!(region_matches(&region, "RO", Some("BRASOV")));
        assert!(!region_matches(&region, "RO", Some("Bucharest")));
        assert!(!region_matches(&region, "RO", None));
    }

    #[test]
    fn region_country_match_is_case_insensitive() {
        let region = GeoRegion {
            country: "ro".to_string(),
            city: None,
        };
        assert!(region_matches(&region, "RO", None));
    }

    #[test]
    fn reload_with_empty_path_clears_any_loaded_database() {
        let db = GeoIpDatabase::empty();
        db.reload("");
        assert!(db.lookup("1.2.3.4".parse().unwrap()).is_none());
    }

    #[test]
    fn reload_with_nonexistent_path_leaves_database_cleared_not_panicking() {
        let db = GeoIpDatabase::empty();
        db.reload("/nonexistent/path/to/nothing.mmdb");
        assert!(db.lookup("1.2.3.4".parse().unwrap()).is_none());
    }

    #[test]
    fn resolve_client_ip_uses_peer_by_default() {
        let cfg = config(false, &[]);
        let headers = HeaderMap::new();
        let peer: SocketAddr = "10.0.0.1:1234".parse().unwrap();
        assert_eq!(resolve_client_ip(&cfg, &headers, peer), peer.ip());
    }

    #[test]
    fn resolve_client_ip_ignores_forwarded_header_when_not_trusted() {
        let cfg = config(false, &[]);
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("8.8.8.8"));
        let peer: SocketAddr = "10.0.0.1:1234".parse().unwrap();
        assert_eq!(resolve_client_ip(&cfg, &headers, peer), peer.ip());
    }

    #[test]
    fn resolve_client_ip_uses_forwarded_header_first_hop_when_trusted() {
        let mut cfg = config(false, &[]);
        cfg.trust_x_forwarded_for = true;
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("8.8.8.8, 10.0.0.1"));
        let peer: SocketAddr = "10.0.0.1:1234".parse().unwrap();
        assert_eq!(
            resolve_client_ip(&cfg, &headers, peer),
            "8.8.8.8".parse::<IpAddr>().unwrap()
        );
    }
}
