// Databricks Statement Execution API client, shared by the desktop worker
// (one long-lived session, cooperative cancel) and the hosted remote engine
// (stateless: submit, poll and cancel by statement id across requests).
//
// Everything that decides *where* a request goes lives here, under an
// EgressPolicy: the workspace base, API paths taken from responses, presigned
// result links and every redirect hop from them.

use std::fmt;
use std::io::{Cursor, Read};
use std::time::{Duration, Instant};

use arrow_ipc::reader::StreamReader;
use arrow_ipc::writer::StreamWriter;
use serde::Deserialize;
use serde_json::{json, Value};
use url::Url;

use super::egress::{EgressPolicy, STRICT_API_PREFIX};
use super::{
    map_databricks_type, maybe_decompress, non_empty, normalize_base_url, schema_from_manifest,
    split_statements, str_param, warehouse_id_from_http_path,
};
use crate::protocol::*;

pub const STATEMENTS_PATH: &str = "/api/2.0/sql/statements";
/// Presigned links on Databricks-managed storage answer `307` to a sibling
/// path once a result is larger than a few MB.
pub const MAX_DOWNLOAD_REDIRECTS: usize = 5;

/// Config keys that say *where* to connect and *as whom*. A caller that sets
/// any of them gets none of a server's own credentials: mixing a
/// caller-chosen host with the server's token would send that token anywhere.
pub const CONNECTION_KEYS: &[&str] = &["host", "httpPath", "warehouseId", "token"];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct DatabricksConfig {
    /// Workspace host, with or without `https://` (e.g.
    /// `adb-123.4.azuredatabricks.net`, `dbc-abc.cloud.databricks.com`).
    host: Option<String>,
    /// SQL warehouse HTTP path, as shown on the warehouse's Connection
    /// details tab (`/sql/1.0/warehouses/<id>`). Matches pytrilogy's
    /// `DatabricksConfig.http_path`.
    http_path: Option<String>,
    /// Alternative to `http_path`.
    warehouse_id: Option<String>,
    /// Personal access token (or any OAuth bearer token).
    token: Option<String>,
    catalog: Option<String>,
    schema: Option<String>,
}

fn parse_config(config: &Value) -> Result<DatabricksConfig> {
    if config.is_null() {
        return Ok(DatabricksConfig::default());
    }
    if !config.is_object() {
        return Err(BridgeError::InvalidConfig(
            "config must be an object".into(),
        ));
    }
    serde_json::from_value(config.clone()).map_err(|e| BridgeError::InvalidConfig(e.to_string()))
}

/// A resolved warehouse connection. The token never appears in `Debug`.
#[derive(Clone)]
pub struct DatabricksSettings {
    pub base_url: String,
    pub warehouse_id: String,
    token: String,
    pub catalog: Option<String>,
    pub schema: Option<String>,
}

impl fmt::Debug for DatabricksSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DatabricksSettings")
            .field("base_url", &self.base_url)
            .field("warehouse_id", &self.warehouse_id)
            .field("token", &"<redacted>")
            .field("catalog", &self.catalog)
            .field("schema", &self.schema)
            .finish()
    }
}

fn clean(v: Option<&str>) -> Option<String> {
    v.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

impl DatabricksSettings {
    pub fn new(
        host: Option<&str>,
        http_path: Option<&str>,
        warehouse_id: Option<&str>,
        token: Option<&str>,
        catalog: Option<&str>,
        schema: Option<&str>,
    ) -> Result<Self> {
        let base_url = normalize_base_url(host.unwrap_or(""))?;
        let token = clean(token).ok_or_else(|| {
            BridgeError::InvalidConfig("Databricks access token is required.".into())
        })?;
        let warehouse_id = match clean(warehouse_id) {
            Some(id) => id,
            None => http_path
                .and_then(warehouse_id_from_http_path)
                .ok_or_else(|| {
                    BridgeError::InvalidConfig(
                        "Databricks needs a SQL warehouse HTTP path (/sql/1.0/warehouses/<id>). \
                         All-purpose cluster paths aren't supported by the Statement Execution API."
                            .into(),
                    )
                })?,
        };
        Ok(Self {
            base_url,
            warehouse_id,
            token,
            catalog: clean(catalog),
            schema: clean(schema),
        })
    }

    /// From a connection config (`host`, `httpPath` | `warehouseId`, `token`,
    /// `catalog`, `schema`).
    pub fn from_config(config: &Value) -> Result<Self> {
        let c = parse_config(config)?;
        Self::new(
            non_empty(&c.host),
            non_empty(&c.http_path),
            non_empty(&c.warehouse_id),
            non_empty(&c.token),
            non_empty(&c.catalog),
            non_empty(&c.schema),
        )
    }

    /// Whether a config names its own workspace or credentials.
    pub fn names_connection(config: &Value) -> bool {
        CONNECTION_KEYS.iter().any(|k| {
            config
                .get(*k)
                .and_then(Value::as_str)
                .is_some_and(|s| !s.trim().is_empty())
        })
    }

    /// Settings for one call on a server: the caller's own workspace, or the
    /// server's when the caller names none. Never a mix of the two;
    /// `catalog` / `schema` may always be overridden.
    pub fn resolve(config: &Value, server: Option<&Self>) -> Result<Self> {
        if Self::names_connection(config) {
            return Self::from_config(config);
        }
        let c = parse_config(config)?;
        let server = server.ok_or_else(|| {
            BridgeError::InvalidConfig(
                "This engine has no Databricks warehouse configured; provide host, httpPath and token."
                    .into(),
            )
        })?;
        Ok(Self {
            catalog: clean(non_empty(&c.catalog)).or_else(|| server.catalog.clone()),
            schema: clean(non_empty(&c.schema)).or_else(|| server.schema.clone()),
            ..server.clone()
        })
    }
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResultMode {
    /// EXTERNAL_LINKS + ARROW_STREAM: the query path.
    Arrow,
    /// INLINE + JSON_ARRAY: small introspection queries.
    JsonRows,
}

pub fn statement_state(resp: &Value) -> &str {
    resp.pointer("/status/state")
        .and_then(Value::as_str)
        .unwrap_or("")
}

pub fn statement_id(resp: &Value) -> Result<String> {
    resp.get("statement_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| BridgeError::Driver("response had no statement_id".into()))
}

/// Statement and warehouse ids are spliced into URL paths, so only letters,
/// digits and dashes are accepted (real ones are UUIDs / hex).
pub fn check_statement_id(id: &str) -> Result<&str> {
    let ok = (1..=64).contains(&id.len())
        && id.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if ok {
        Ok(id)
    } else {
        Err(BridgeError::InvalidConfig("invalid statement id".into()))
    }
}

/// The error for a statement in a terminal, unsuccessful state.
/// `user_canceled` decides whether CANCELED reads as the user's own cancel.
pub fn terminal_error(resp: &Value, user_canceled: bool) -> BridgeError {
    match statement_state(resp) {
        "FAILED" => BridgeError::Driver(
            resp.pointer("/status/error/message")
                .and_then(Value::as_str)
                .unwrap_or("statement failed")
                .to_string(),
        ),
        "CANCELED" if user_canceled => BridgeError::Canceled,
        s @ ("CANCELED" | "CLOSED") => {
            BridgeError::Driver(format!("Databricks statement was {}.", s.to_lowercase()))
        }
        other => BridgeError::Driver(format!("unexpected Databricks statement state: {other:?}")),
    }
}

/// A deadline far enough away to mean "no deadline".
pub fn no_deadline() -> Instant {
    Instant::now() + Duration::from_secs(60 * 60 * 24 * 365)
}

fn too_large(size: u64, max: u64) -> BridgeError {
    let mib = |b: u64| b as f64 / (1024.0 * 1024.0);
    BridgeError::TooLarge(format!(
        "Result is too large for the engine ({:.0} MiB, limit {:.0} MiB). Add a LIMIT or aggregate.",
        mib(size),
        mib(max)
    ))
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

pub struct Client {
    settings: DatabricksSettings,
    policy: EgressPolicy,
    agent: ureq::Agent,
}

impl Client {
    pub fn new(settings: DatabricksSettings, policy: EgressPolicy) -> Result<Self> {
        policy.check_api_base(&settings.base_url)?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(15))
            // Downloads of large result chunks are the slow path; the
            // statement endpoints return within the requested wait.
            .timeout_read(Duration::from_secs(300))
            .timeout_write(Duration::from_secs(60))
            .user_agent(concat!("trilogy-query-bridge/", env!("CARGO_PKG_VERSION")))
            // A redirect could carry the bearer token to another host. API
            // calls never follow one; downloads follow them by hand.
            .redirects(0)
            // Proxy env vars would route around a strict policy.
            .try_proxy_from_env(!policy.strict)
            .resolver(policy.agent_resolver())
            .build();
        Ok(Self {
            settings,
            policy,
            agent,
        })
    }

    pub fn settings(&self) -> &DatabricksSettings {
        &self.settings
    }

    pub fn default_schema(&self) -> &str {
        self.settings.schema.as_deref().unwrap_or("default")
    }

    /// Join an API path onto the workspace base. Paths include
    /// `next_chunk_internal_link` values taken from responses, so require a
    /// rooted path: anything else (`@other.host/...`, `//other.host`) could
    /// change the authority the token is sent to.
    pub(crate) fn url(&self, path: &str) -> Result<String> {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(BridgeError::Driver(format!(
                "refusing non-workspace API path from Databricks response: {path:?}"
            )));
        }
        if self.policy.strict && !path.starts_with(STRICT_API_PREFIX) {
            return Err(BridgeError::Driver(format!(
                "refusing Databricks API path outside {STRICT_API_PREFIX}: {path:?}"
            )));
        }
        Ok(format!("{}{}", self.settings.base_url, path))
    }

    fn auth(&self, req: ureq::Request) -> ureq::Request {
        req.set("Authorization", &format!("Bearer {}", self.settings.token))
    }

    fn get(&self, path: &str) -> Result<Value> {
        let req = self.auth(self.agent.get(&self.url(path)?));
        read_json(req.call())
    }

    fn post(&self, path: &str, body: &Value) -> Result<Value> {
        let req = self
            .auth(self.agent.post(&self.url(path)?))
            .set("Content-Type", "application/json");
        read_json(req.send_string(&body.to_string()))
    }

    /// Fetch a presigned external link, reading at most `limit` bytes (0 means
    /// no limit). These point at cloud storage, so the workspace token is
    /// never attached; only the headers Databricks returned with the link,
    /// and only to the host it named.
    fn download(&self, link: &str, headers: Option<&Value>, limit: u64) -> Result<Vec<u8>> {
        let mut url = Url::parse(link).map_err(|_| {
            BridgeError::Driver("Databricks returned an unusable result link.".into())
        })?;
        let origin = (
            url.host_str().map(str::to_string),
            url.port_or_known_default(),
        );
        let mut hops = 0;
        let resp = loop {
            self.policy.check_download(&url)?;
            let mut req = self.agent.get(url.as_str());
            if (
                url.host_str().map(str::to_string),
                url.port_or_known_default(),
            ) == origin
            {
                if let Some(Value::Object(h)) = headers {
                    for (k, v) in h {
                        if let Some(v) = v.as_str() {
                            req = req.set(k, v);
                        }
                    }
                }
            }
            let resp = req.call().map_err(|e| match e {
                ureq::Error::Status(code, _) => BridgeError::Driver(format!(
                    "Databricks result download failed with HTTP {code}. If the workspace \
                     restricts cloud storage access (private link / firewall), this machine \
                     needs to reach the workspace's storage account too."
                )),
                ureq::Error::Transport(t) => {
                    BridgeError::Io(format!("Databricks result download failed: {t}"))
                }
            })?;
            let location = resp.header("location").map(str::to_string);
            match (resp.status(), location) {
                (301 | 302 | 303 | 307 | 308, Some(location)) => {
                    hops += 1;
                    if hops > MAX_DOWNLOAD_REDIRECTS {
                        return Err(BridgeError::Driver(
                            "Databricks result download redirected too many times.".into(),
                        ));
                    }
                    url = url.join(&location).map_err(|_| {
                        BridgeError::Driver(
                            "Databricks result link redirected to a bad URL.".into(),
                        )
                    })?;
                }
                (200..=299, _) => break resp,
                (code, _) => {
                    return Err(BridgeError::Driver(format!(
                        "Databricks result download failed with HTTP {code}."
                    )))
                }
            }
        };
        let mut buf = Vec::new();
        let reader = resp.into_reader();
        if limit > 0 {
            reader.take(limit + 1).read_to_end(&mut buf)
        } else {
            let mut reader = reader;
            reader.read_to_end(&mut buf)
        }
        .map_err(|e| BridgeError::Io(e.to_string()))?;
        if limit > 0 && buf.len() as u64 > limit {
            return Err(too_large(buf.len() as u64, limit));
        }
        Ok(buf)
    }

    /// Check host, token and warehouse with a metadata call. Unlike
    /// `SELECT 1`, it doesn't start a stopped warehouse.
    pub fn verify(&self) -> Result<()> {
        self.get(&format!(
            "/api/2.0/sql/warehouses/{}",
            check_statement_id(&self.settings.warehouse_id)
                .map_err(|_| BridgeError::InvalidConfig("invalid warehouse id".into()))?
        ))?;
        Ok(())
    }

    /// Submit a statement. Databricks holds the request for up to `wait`
    /// (clamped to the API's 5-50 s; zero means return immediately), then
    /// answers with the current state either way.
    pub fn submit(
        &self,
        sql: &str,
        params: Vec<Value>,
        mode: ResultMode,
        wait: Duration,
    ) -> Result<Value> {
        let (disposition, format) = match mode {
            ResultMode::Arrow => ("EXTERNAL_LINKS", "ARROW_STREAM"),
            ResultMode::JsonRows => ("INLINE", "JSON_ARRAY"),
        };
        let wait_secs = match wait.as_secs() {
            0 => 0,
            s => s.clamp(5, 50),
        };
        let mut body = json!({
            "statement": sql,
            "warehouse_id": self.settings.warehouse_id,
            "disposition": disposition,
            "format": format,
            "wait_timeout": format!("{wait_secs}s"),
            "on_wait_timeout": "CONTINUE",
        });
        if let Some(c) = &self.settings.catalog {
            body["catalog"] = json!(c);
        }
        if let Some(s) = &self.settings.schema {
            body["schema"] = json!(s);
        }
        if !params.is_empty() {
            body["parameters"] = Value::Array(params);
        }
        self.post(STATEMENTS_PATH, &body)
    }

    pub fn status(&self, id: &str) -> Result<Value> {
        self.get(&format!("{STATEMENTS_PATH}/{}", check_statement_id(id)?))
    }

    pub fn cancel(&self, id: &str) -> Result<()> {
        self.post(
            &format!("{STATEMENTS_PATH}/{}/cancel", check_statement_id(id)?),
            &json!({}),
        )?;
        Ok(())
    }

    fn cancel_quietly(&self, resp: &Value) {
        if let Ok(id) = statement_id(resp) {
            let _ = self.cancel(&id);
        }
    }

    /// Poll until the statement is terminal or `deadline` passes, returning
    /// the last response (SUCCEEDED, or still PENDING/RUNNING at the
    /// deadline). Failure states are errors.
    ///
    /// `cancel` is the desktop worker's cooperative flag: when it trips, the
    /// statement is canceled server-side and this returns `Canceled`. Without
    /// one (the engine cancels out of band, by id), a CANCELED statement is
    /// the user's cancel.
    pub fn wait(
        &self,
        mut resp: Value,
        deadline: Instant,
        cancel: Option<&dyn Fn() -> bool>,
    ) -> Result<Value> {
        let canceled = || cancel.is_some_and(|f| f());
        let mut interval = Duration::from_millis(200);
        loop {
            match statement_state(&resp) {
                "SUCCEEDED" => return Ok(resp),
                "PENDING" | "RUNNING" => {}
                _ => return Err(terminal_error(&resp, cancel.is_none() || canceled())),
            }
            let id = statement_id(&resp)?;
            if Instant::now() + interval >= deadline {
                return Ok(resp);
            }
            // Sleep in small slices so a cancel is noticed quickly.
            let until = Instant::now() + interval;
            while Instant::now() < until && !canceled() {
                std::thread::sleep(Duration::from_millis(50));
            }
            if canceled() {
                // Best effort: the statement may finish before the cancel lands.
                let _ = self.cancel(&id);
                return Err(BridgeError::Canceled);
            }
            interval = (interval * 2).min(Duration::from_secs(1));
            resp = self.status(&id)?;
        }
    }

    /// Download every chunk of an ARROW_STREAM result and re-encode it as one
    /// IPC stream. Returns (bytes, row_count). `max_bytes` (0 = no cap) bounds
    /// both what is downloaded and the re-encoded stream.
    pub fn collect_arrow(
        &self,
        resp: &Value,
        max_bytes: u64,
        canceled: &dyn Fn() -> bool,
    ) -> Result<(Vec<u8>, u64)> {
        let manifest = resp.get("manifest").cloned().unwrap_or(Value::Null);
        if max_bytes > 0 {
            if let Some(declared) = manifest.get("total_byte_count").and_then(Value::as_u64) {
                if declared > max_bytes {
                    return Err(too_large(declared, max_bytes));
                }
            }
        }
        let lz4 = manifest.get("result_compression").and_then(Value::as_str) == Some("LZ4_FRAME");

        let mut writer: Option<StreamWriter<Vec<u8>>> = None;
        let mut rows: u64 = 0;
        let mut downloaded: u64 = 0;
        let mut links: Vec<Value> = resp
            .pointer("/result/external_links")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        while !links.is_empty() {
            let mut next: Option<String> = None;
            for link in &links {
                if canceled() {
                    return Err(BridgeError::Canceled);
                }
                let url = link
                    .get("external_link")
                    .and_then(Value::as_str)
                    .ok_or_else(|| BridgeError::Driver("result chunk had no link".into()))?;
                let budget = if max_bytes > 0 {
                    max_bytes.saturating_sub(downloaded).max(1)
                } else {
                    0
                };
                let raw = self.download(url, link.get("http_headers"), budget)?;
                downloaded += raw.len() as u64;
                let bytes = maybe_decompress(raw, lz4)?;
                let reader = StreamReader::try_new(Cursor::new(bytes), None)
                    .map_err(|e| BridgeError::Driver(format!("bad Arrow chunk: {e}")))?;
                if writer.is_none() {
                    writer = Some(
                        StreamWriter::try_new(Vec::new(), reader.schema().as_ref())
                            .map_err(|e| BridgeError::Io(e.to_string()))?,
                    );
                }
                let w = writer.as_mut().expect("writer initialised above");
                for batch in reader {
                    let batch = batch.map_err(|e| BridgeError::Driver(e.to_string()))?;
                    rows += batch.num_rows() as u64;
                    w.write(&batch)
                        .map_err(|e| BridgeError::Io(e.to_string()))?;
                    let encoded = w.get_ref().len() as u64;
                    if max_bytes > 0 && encoded > max_bytes {
                        return Err(too_large(encoded, max_bytes));
                    }
                }
                next = link
                    .get("next_chunk_internal_link")
                    .and_then(Value::as_str)
                    .map(str::to_string);
            }
            links = match next {
                Some(path) => self
                    .get(&path)?
                    .get("external_links")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default(),
                None => Vec::new(),
            };
        }

        // Zero-row results (and DDL) come back without links; build an empty
        // stream from the manifest's schema so the frontend still gets headers.
        let mut writer = match writer {
            Some(w) => w,
            None => StreamWriter::try_new(Vec::new(), &schema_from_manifest(&manifest))
                .map_err(|e| BridgeError::Io(e.to_string()))?,
        };
        writer
            .finish()
            .map_err(|e| BridgeError::Io(e.to_string()))?;
        let buf = writer
            .into_inner()
            .map_err(|e| BridgeError::Io(e.to_string()))?;
        Ok((buf, rows))
    }

    /// Run a statement to completion within `deadline`, canceling it if it
    /// is still running then.
    fn run_to_completion(&self, sql: &str, params: Vec<Value>, deadline: Instant) -> Result<Value> {
        let submitted = self.submit(sql, params, ResultMode::JsonRows, Duration::from_secs(5))?;
        let resp = self.wait(submitted, deadline, None)?;
        if statement_state(&resp) != "SUCCEEDED" {
            self.cancel_quietly(&resp);
            return Err(BridgeError::Timeout(
                "Databricks did not answer in time; the warehouse may be starting. Try again."
                    .into(),
            ));
        }
        Ok(resp)
    }

    /// Run a small query and return its rows as nullable strings.
    pub fn query_rows(
        &self,
        sql: &str,
        params: Vec<Value>,
        deadline: Instant,
    ) -> Result<Vec<Vec<Option<String>>>> {
        let resp = self.run_to_completion(sql, params, deadline)?;
        let mut out = Vec::new();
        let mut chunk = resp.get("result").cloned().unwrap_or(Value::Null);
        loop {
            if let Some(rows) = chunk.get("data_array").and_then(Value::as_array) {
                for row in rows {
                    let cells = row
                        .as_array()
                        .map(|cells| {
                            cells
                                .iter()
                                .map(|c| c.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    out.push(cells);
                }
            }
            match chunk
                .get("next_chunk_internal_link")
                .and_then(Value::as_str)
            {
                Some(path) => chunk = self.get(path)?,
                None => break,
            }
        }
        Ok(out)
    }

    /// Run each statement of a script in turn. The Statement API runs exactly
    /// one statement per request.
    pub fn run_script(&self, sql: &str, deadline: Instant) -> Result<()> {
        for stmt in split_statements(sql) {
            self.run_to_completion(&stmt, Vec::new(), deadline)?;
        }
        Ok(())
    }

    // Introspection reads `system.information_schema`, which spans every
    // Unity Catalog catalog the token can see and lets names be bound as
    // parameters instead of spliced into identifiers. Legacy
    // `hive_metastore`-only workspaces don't populate it.

    pub fn describe_databases(&self, deadline: Instant) -> Result<Vec<DatabaseDTO>> {
        let rows = self.query_rows(
            "SELECT catalog_name FROM system.information_schema.catalogs ORDER BY catalog_name",
            Vec::new(),
            deadline,
        )?;
        Ok(rows
            .into_iter()
            .filter_map(|r| r.into_iter().next().flatten())
            .map(|name| DatabaseDTO {
                name,
                schemas: vec![],
            })
            .collect())
    }

    pub fn describe_schemas(&self, database: &str, deadline: Instant) -> Result<Vec<SchemaDTO>> {
        let rows = self.query_rows(
            "SELECT schema_name, comment FROM system.information_schema.schemata \
             WHERE catalog_name = :catalog ORDER BY schema_name",
            vec![str_param("catalog", database)],
            deadline,
        )?;
        Ok(rows
            .into_iter()
            .filter_map(|r| {
                let mut it = r.into_iter();
                let name = it.next().flatten()?;
                Some(SchemaDTO {
                    name,
                    database: database.to_string(),
                    description: it.next().flatten(),
                    tables: vec![],
                })
            })
            .collect())
    }

    pub fn describe_tables(
        &self,
        database: &str,
        schema: Option<&str>,
        deadline: Instant,
    ) -> Result<Vec<TableDTO>> {
        let schema = schema.unwrap_or(self.default_schema()).to_string();
        let rows = self.query_rows(
            "SELECT table_name, table_type, comment FROM system.information_schema.tables \
             WHERE table_catalog = :catalog AND table_schema = :schema ORDER BY table_name",
            vec![str_param("catalog", database), str_param("schema", &schema)],
            deadline,
        )?;
        Ok(rows
            .into_iter()
            .filter_map(|r| {
                let mut it = r.into_iter();
                let name = it.next().flatten()?;
                let ttype = it.next().flatten().unwrap_or_default();
                Some(TableDTO {
                    name,
                    schema: schema.clone(),
                    database: database.to_string(),
                    description: it.next().flatten(),
                    asset_type: Some(
                        if ttype.contains("VIEW") {
                            "view"
                        } else {
                            "table"
                        }
                        .into(),
                    ),
                    columns: vec![],
                })
            })
            .collect())
    }

    pub fn describe_columns(
        &self,
        database: &str,
        schema: &str,
        table: &str,
        deadline: Instant,
    ) -> Result<Vec<ColumnDTO>> {
        let rows = self.query_rows(
            "SELECT column_name, full_data_type, is_nullable, comment \
             FROM system.information_schema.columns \
             WHERE table_catalog = :catalog AND table_schema = :schema AND table_name = :table \
             ORDER BY ordinal_position",
            vec![
                str_param("catalog", database),
                str_param("schema", schema),
                str_param("table", table),
            ],
            deadline,
        )?;
        Ok(rows
            .into_iter()
            .filter_map(|r| {
                let mut it = r.into_iter();
                let name = it.next().flatten()?;
                let dtype = it.next().flatten().unwrap_or_default();
                let nullable = it.next().flatten().unwrap_or_default();
                Some(ColumnDTO {
                    trilogy_type: map_databricks_type(&dtype),
                    name,
                    native_type: dtype,
                    nullable: Some(nullable.eq_ignore_ascii_case("YES")),
                    primary: Some(false),
                    unique: Some(false),
                    default: None,
                    autoincrement: Some(false),
                    description: it.next().flatten(),
                })
            })
            .collect())
    }

    pub fn describe_table(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
        deadline: Instant,
    ) -> Result<TableDTO> {
        let schema = schema.unwrap_or(self.default_schema()).to_string();
        let columns = self.describe_columns(database, &schema, table, deadline)?;
        Ok(TableDTO {
            name: table.to_string(),
            schema,
            database: database.to_string(),
            description: None,
            asset_type: Some("table".to_string()),
            columns,
        })
    }
}

fn read_json(res: std::result::Result<ureq::Response, ureq::Error>) -> Result<Value> {
    match res {
        Ok(resp) if resp.status() >= 300 => Err(BridgeError::Driver(format!(
            "Databricks API answered HTTP {} (redirects are not followed).",
            resp.status()
        ))),
        Ok(resp) => {
            let text = resp
                .into_string()
                .map_err(|e| BridgeError::Io(e.to_string()))?;
            serde_json::from_str(&text)
                .map_err(|e| BridgeError::Driver(format!("unexpected Databricks response: {e}")))
        }
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            Err(BridgeError::Driver(api_error_message(code, &body)))
        }
        Err(ureq::Error::Transport(t)) => {
            Err(BridgeError::Io(format!("could not reach Databricks: {t}")))
        }
    }
}

/// Build a user-facing message for a non-2xx API response, with a hint for
/// the auth failures people actually hit. Never echoes request headers, so
/// the token can't leak into an error string.
fn api_error_message(code: u16, body: &str) -> String {
    let parsed: Option<Value> = serde_json::from_str(body).ok();
    let message = parsed
        .as_ref()
        .and_then(|v| v.get("message").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| body.chars().take(300).collect());
    let hint = match code {
        401 => " Check the access token: it may be expired, revoked, or for a different workspace.",
        403 => " The token's user lacks permission (CAN USE on the warehouse), or an IP access list blocks this machine.",
        404 => " Check the workspace host and the warehouse HTTP path.",
        _ => "",
    };
    format!("Databricks API error ({code}): {message}{hint}")
}
