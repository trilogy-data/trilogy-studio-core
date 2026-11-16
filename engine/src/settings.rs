// Engine configuration, from the environment.
//
// | Variable                                   | Default    |
// | ------------------------------------------ | ---------- |
// | TRILOGY_ENGINE_API_KEYS                    | unset: /health only |
// | TRILOGY_ENGINE_STRICT_EGRESS               | on         |
// | TRILOGY_ENGINE_DATABRICKS_HOST_SUFFIXES    | the four Databricks cloud suffixes |
// | TRILOGY_ENGINE_ALLOW_PRIVATE_EGRESS        | off        |
// | TRILOGY_ENGINE_ALLOW_CALLER_CREDENTIALS    | on         |
// | TRILOGY_ENGINE_POLL_SECONDS                | 10         |
// | TRILOGY_ENGINE_SYNC_SECONDS                | 50         |
// | TRILOGY_ENGINE_MAX_RESULT_BYTES            | 128 MiB    |
// | TRILOGY_ENGINE_MAX_INFLIGHT                | 6          |
// | TRILOGY_ENGINE_ALLOWED_ORIGINS             | extra CORS origins, comma-separated |
// | DATABRICKS_HOST / _HTTP_PATH / _WAREHOUSE_ID / _TOKEN / _CATALOG / _SCHEMA | the server's own warehouse |

use std::collections::BTreeMap;
use std::time::Duration;

use query_bridge::workers::databricks::{DatabricksSettings, EgressPolicy};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug)]
pub struct Settings {
    /// keyId → sha256 hex of the key. Empty disables every query route.
    pub api_keys: BTreeMap<String, String>,
    pub policy: EgressPolicy,
    /// The server's own warehouse, used when a caller names none.
    pub server_databricks: Option<DatabricksSettings>,
    /// Whether a caller may name its own workspace and token. Off pins the
    /// engine to the server's warehouse.
    pub allow_caller_credentials: bool,
    /// How long one request waits on a statement before answering 202.
    pub poll: Duration,
    /// Budget for calls that must finish within one request (describe,
    /// scripts). Under the proxy's 60 s idle timeout.
    pub sync: Duration,
    /// Cap on a result, compressed download and re-encoded stream alike.
    pub max_result_bytes: u64,
    /// Requests holding a warehouse call at once. Past it: 503 + Retry-After.
    pub max_inflight: usize,
    pub extra_origins: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_keys: BTreeMap::new(),
            policy: EgressPolicy::strict(),
            server_databricks: None,
            allow_caller_credentials: true,
            poll: Duration::from_secs(10),
            sync: Duration::from_secs(50),
            max_result_bytes: 128 * 1024 * 1024,
            max_inflight: 6,
            extra_origins: Vec::new(),
        }
    }
}

impl Settings {
    pub fn enabled(&self) -> bool {
        !self.api_keys.is_empty()
    }

    pub fn from_env() -> Self {
        Self::from_lookup(|k| std::env::var(k).ok())
    }

    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Self {
        let d = Self::default();
        let flag = |k: &str, default: bool| match get(k).map(|v| v.trim().to_ascii_lowercase()) {
            Some(v) if !v.is_empty() => matches!(v.as_str(), "1" | "true" | "yes" | "on"),
            _ => default,
        };
        let num = |k: &str, default: u64| {
            get(k)
                .and_then(|v| v.trim().parse::<u64>().ok())
                .filter(|n| *n > 0)
                .unwrap_or(default)
        };
        let list = |k: &str| -> Vec<String> {
            get(k)
                .unwrap_or_default()
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        };

        let mut policy = if flag("TRILOGY_ENGINE_STRICT_EGRESS", true) {
            EgressPolicy::strict()
        } else {
            EgressPolicy::permissive()
        };
        let suffixes: Vec<String> = list("TRILOGY_ENGINE_DATABRICKS_HOST_SUFFIXES")
            .into_iter()
            .map(|s| s.to_ascii_lowercase())
            .collect();
        if !suffixes.is_empty() {
            policy.api_host_suffixes = suffixes;
        }
        policy.allow_private = flag("TRILOGY_ENGINE_ALLOW_PRIVATE_EGRESS", false);

        Self {
            api_keys: parse_api_keys(&get("TRILOGY_ENGINE_API_KEYS").unwrap_or_default()),
            policy,
            server_databricks: server_databricks(&get),
            allow_caller_credentials: flag("TRILOGY_ENGINE_ALLOW_CALLER_CREDENTIALS", true),
            poll: Duration::from_secs(num("TRILOGY_ENGINE_POLL_SECONDS", d.poll.as_secs())),
            sync: Duration::from_secs(num("TRILOGY_ENGINE_SYNC_SECONDS", d.sync.as_secs())),
            max_result_bytes: num("TRILOGY_ENGINE_MAX_RESULT_BYTES", d.max_result_bytes),
            max_inflight: num("TRILOGY_ENGINE_MAX_INFLIGHT", d.max_inflight as u64) as usize,
            extra_origins: list("TRILOGY_ENGINE_ALLOWED_ORIGINS"),
        }
    }
}

/// The variables the Databricks CLI, SDKs and pytrilogy's `DatabricksConfig`
/// read. None (with a log line) when unset or invalid.
fn server_databricks(get: &impl Fn(&str) -> Option<String>) -> Option<DatabricksSettings> {
    let host = get("DATABRICKS_HOST")?;
    let token = get("DATABRICKS_TOKEN")?;
    match DatabricksSettings::new(
        Some(&host),
        get("DATABRICKS_HTTP_PATH").as_deref(),
        get("DATABRICKS_WAREHOUSE_ID").as_deref(),
        Some(&token),
        get("DATABRICKS_CATALOG").as_deref(),
        get("DATABRICKS_SCHEMA").as_deref(),
    ) {
        Ok(s) => Some(s),
        Err(e) => {
            eprintln!("engine: server Databricks config ignored: {e}");
            None
        }
    }
}

pub fn hash_key(key: &str) -> String {
    hex::encode(Sha256::digest(key.as_bytes()))
}

/// `"<keyId>:<sha256 hex>,..."` → {keyId: digest}. Malformed entries are
/// dropped with a log line rather than failing the whole server.
pub fn parse_api_keys(raw: &str) -> BTreeMap<String, String> {
    let mut keys = BTreeMap::new();
    for entry in raw.split(',').map(str::trim).filter(|e| !e.is_empty()) {
        let parsed = entry.split_once(':').and_then(|(id, digest)| {
            let id = id.trim();
            let digest = digest.trim().to_ascii_lowercase();
            let ok = !id.is_empty()
                && digest.len() == 64
                && digest.chars().all(|c| c.is_ascii_hexdigit());
            ok.then(|| (id.to_string(), digest))
        });
        match parsed {
            Some((id, digest)) => {
                keys.insert(id, digest);
            }
            None => eprintln!("engine: ignoring malformed TRILOGY_ENGINE_API_KEYS entry"),
        }
    }
    keys
}

/// A fresh API key: `tre_` + 32 random bytes, hex.
pub fn new_key() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("OS random source");
    format!("tre_{}", hex::encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |k| map.get(k).cloned()
    }

    #[test]
    fn parses_keys_and_drops_malformed() {
        let digest = hash_key("k");
        let keys = parse_api_keys(&format!(
            "a:{digest}, b:short, :{digest}, c:{}",
            "z".repeat(64)
        ));
        assert_eq!(keys.len(), 1);
        assert_eq!(keys["a"], digest);
    }

    #[test]
    fn defaults_are_strict_and_private() {
        let s = Settings::from_lookup(env(&[]));
        assert!(!s.enabled());
        assert!(s.policy.strict);
        assert!(s.server_databricks.is_none());
        let lax = Settings::from_lookup(env(&[
            ("TRILOGY_ENGINE_STRICT_EGRESS", "0"),
            ("TRILOGY_ENGINE_MAX_INFLIGHT", "3"),
            ("TRILOGY_ENGINE_POLL_SECONDS", "junk"),
        ]));
        assert!(!lax.policy.strict);
        assert_eq!(lax.max_inflight, 3);
        assert_eq!(lax.poll, Duration::from_secs(10));
    }

    #[test]
    fn reads_the_server_warehouse() {
        let s = Settings::from_lookup(env(&[
            ("DATABRICKS_HOST", "dbc-1.cloud.databricks.com"),
            ("DATABRICKS_HTTP_PATH", "/sql/1.0/warehouses/w1"),
            ("DATABRICKS_TOKEN", "t"),
            ("DATABRICKS_CATALOG", "main"),
        ]));
        let db = s.server_databricks.unwrap();
        assert_eq!(db.warehouse_id, "w1");
        assert_eq!(db.catalog.as_deref(), Some("main"));
    }

    #[test]
    fn minted_keys_are_random_and_hashable() {
        let (a, b) = (new_key(), new_key());
        assert_ne!(a, b);
        assert!(a.starts_with("tre_") && a.len() == 68);
        assert_eq!(hash_key(&a).len(), 64);
    }
}
