// Databricks SQL warehouse worker, over the SQL Statement Execution API
// (`/api/2.0/sql/statements`).
//
// Why HTTP rather than a native driver: there is no maintained Rust
// Databricks driver, and the Statement API is what Databricks recommends for
// non-JDBC/ODBC clients. It is also why this lives in the bridge and not in
// the browser lib: the API sends no CORS headers, so a webview can't call it,
// but a Rust process can.
//
// Result path: queries run with `EXTERNAL_LINKS` + `ARROW_STREAM`. Each chunk
// is an Arrow IPC stream on a presigned cloud-storage URL; we download the
// chunks in order and re-encode their batches into the single IPC stream the
// frontend's `arrowBatchesToResults` expects. Introspection queries are tiny,
// so they use `INLINE` + `JSON_ARRAY` and are read as strings.
//
// The API is stateless between statements: temp views and `USE` do not carry
// over from one execute() to the next. Catalog / schema defaults go on every
// request instead.

use std::io::{Cursor, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use arrow_ipc::reader::StreamReader;
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{DataType, Field, Schema, TimeUnit};
use parking_lot::Mutex;
use serde::Deserialize;
use serde_json::{json, Value};

use super::{BuildOutput, CancelHandle, QueryWorker, WorkerFactory};
use crate::protocol::*;

const STATEMENTS_PATH: &str = "/api/2.0/sql/statements";
/// Shortest non-zero synchronous wait the API accepts. Short so a cancel
/// issued while the first request is in flight is honoured within seconds.
const SUBMIT_WAIT: &str = "5s";
const LZ4_FRAME_MAGIC: [u8; 4] = [0x04, 0x22, 0x4D, 0x18];

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

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Normalise a workspace host to `scheme://authority`. Anything after the
/// authority (`/?o=123`, a pasted `/sql/...` path) is dropped. Plain http is
/// only accepted for loopback, so a token is never sent in the clear.
fn normalize_base_url(host: &str) -> Result<String> {
    let host = host.trim();
    let (scheme, rest) = if let Some(r) = host.strip_prefix("https://") {
        ("https", r)
    } else if let Some(r) = host.strip_prefix("http://") {
        ("http", r)
    } else {
        ("https", host)
    };
    let authority = rest
        .split(|c| c == '/' || c == '?' || c == '#')
        .next()
        .unwrap_or("")
        .trim();
    if authority.is_empty() {
        return Err(BridgeError::InvalidConfig(
            "Databricks host is required (e.g. dbc-1234.cloud.databricks.com).".into(),
        ));
    }
    if scheme == "http" {
        let hostname = authority.split(':').next().unwrap_or("");
        if !matches!(hostname, "localhost" | "127.0.0.1" | "[::1]") {
            return Err(BridgeError::InvalidConfig(
                "Databricks host must use https.".into(),
            ));
        }
    }
    Ok(format!("{scheme}://{authority}"))
}

/// Pull the warehouse id out of a SQL warehouse HTTP path. Older workspaces
/// show `/sql/1.0/endpoints/<id>`; both name the same warehouse.
fn warehouse_id_from_http_path(path: &str) -> Option<String> {
    let mut parts = path.trim().trim_matches('/').split('/');
    while let Some(p) = parts.next() {
        if p == "warehouses" || p == "endpoints" {
            return parts.next().filter(|s| !s.is_empty()).map(str::to_string);
        }
    }
    None
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

struct Client {
    base: String,
    token: String,
    agent: ureq::Agent,
}

impl Client {
    fn new(base: String, token: String) -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(15))
            // Downloads of large result chunks are the slow path; the
            // statement endpoints themselves return within SUBMIT_WAIT.
            .timeout_read(Duration::from_secs(300))
            .timeout_write(Duration::from_secs(60))
            .user_agent(concat!("trilogy-explorer/", env!("CARGO_PKG_VERSION")))
            .build();
        Self { base, token, agent }
    }

    fn auth(&self, req: ureq::Request) -> ureq::Request {
        req.set("Authorization", &format!("Bearer {}", self.token))
    }

    /// Join an API path onto the workspace base. Paths include
    /// `next_chunk_internal_link` values taken from responses, so require a
    /// rooted path: anything else (`@other.host/...`, `//other.host`) could
    /// change the authority the token is sent to.
    fn url(&self, path: &str) -> Result<String> {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(BridgeError::Driver(format!(
                "refusing non-workspace API path from Databricks response: {path:?}"
            )));
        }
        Ok(format!("{}{}", self.base, path))
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

    /// Fetch a presigned external link. These point at cloud storage, so the
    /// workspace token must NOT be attached; only the headers Databricks
    /// returned alongside the link.
    fn download(&self, url: &str, headers: Option<&Value>) -> Result<Vec<u8>> {
        let mut req = self.agent.get(url);
        if let Some(Value::Object(h)) = headers {
            for (k, v) in h {
                if let Some(v) = v.as_str() {
                    req = req.set(k, v);
                }
            }
        }
        let resp = req.call().map_err(|e| match e {
            ureq::Error::Status(code, _) => BridgeError::Driver(format!(
                "Databricks result download failed with HTTP {code}. If your workspace \
                 restricts cloud storage access (private link / firewall), this machine \
                 needs to reach the workspace's storage account too."
            )),
            ureq::Error::Transport(t) => {
                BridgeError::Io(format!("Databricks result download failed: {t}"))
            }
        })?;
        let mut buf = Vec::new();
        resp.into_reader()
            .read_to_end(&mut buf)
            .map_err(|e| BridgeError::Io(e.to_string()))?;
        Ok(buf)
    }
}

fn read_json(res: std::result::Result<ureq::Response, ureq::Error>) -> Result<Value> {
    match res {
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

// ---------------------------------------------------------------------------
// Statement execution
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
enum ResultMode {
    /// EXTERNAL_LINKS + ARROW_STREAM — the query path.
    Arrow,
    /// INLINE + JSON_ARRAY — small introspection queries.
    JsonRows,
}

/// Cooperative cancel, same contract as the DuckDB worker: execute() publishes
/// its identifier, cancel() flips the flag when it matches, and the poll loop
/// cancels the statement server-side on its next check.
struct DatabricksCancelHandle {
    current: Mutex<Option<String>>,
    flag: AtomicBool,
}

impl CancelHandle for DatabricksCancelHandle {
    fn cancel(&self, identifier: &str) -> bool {
        let guard = self.current.lock();
        if guard.as_deref() == Some(identifier) {
            self.flag.store(true, Ordering::SeqCst);
            true
        } else {
            false
        }
    }
}

pub struct DatabricksFactory;

impl WorkerFactory for DatabricksFactory {
    fn name(&self) -> &'static str {
        "databricks"
    }

    fn build(&self, config: &serde_json::Value) -> Result<BuildOutput> {
        let cfg: DatabricksConfig = if config.is_null() {
            DatabricksConfig::default()
        } else {
            serde_json::from_value(config.clone())
                .map_err(|e| BridgeError::InvalidConfig(e.to_string()))?
        };
        let base = normalize_base_url(non_empty(&cfg.host).unwrap_or(""))?;
        let token = non_empty(&cfg.token)
            .ok_or_else(|| {
                BridgeError::InvalidConfig("Databricks access token is required.".into())
            })?
            .to_string();
        let warehouse_id = match non_empty(&cfg.warehouse_id) {
            Some(id) => id.to_string(),
            None => non_empty(&cfg.http_path)
                .and_then(warehouse_id_from_http_path)
                .ok_or_else(|| {
                    BridgeError::InvalidConfig(
                        "Databricks needs a SQL warehouse HTTP path (/sql/1.0/warehouses/<id>). \
                         All-purpose cluster paths aren't supported by the Statement Execution API."
                            .into(),
                    )
                })?,
        };

        let client = Client::new(base, token);
        // Verify host, token and warehouse up front with a metadata call. It
        // doesn't start a stopped warehouse, unlike `SELECT 1`.
        client.get(&format!("/api/2.0/sql/warehouses/{warehouse_id}"))?;

        let cancel = Arc::new(DatabricksCancelHandle {
            current: Mutex::new(None),
            flag: AtomicBool::new(false),
        });
        Ok(BuildOutput {
            worker: Box::new(DatabricksWorker {
                client,
                warehouse_id,
                catalog: non_empty(&cfg.catalog).map(str::to_string),
                schema: non_empty(&cfg.schema).map(str::to_string),
                cancel: cancel.clone(),
            }),
            cancel,
        })
    }
}

pub struct DatabricksWorker {
    client: Client,
    warehouse_id: String,
    catalog: Option<String>,
    schema: Option<String>,
    cancel: Arc<DatabricksCancelHandle>,
}

impl DatabricksWorker {
    fn canceled(&self) -> bool {
        self.cancel.flag.load(Ordering::SeqCst)
    }

    /// Submit a statement and poll until it reaches a terminal state. Returns
    /// the SUCCEEDED response (manifest + first result chunk).
    fn run(&self, sql: &str, params: Vec<Value>, mode: ResultMode) -> Result<Value> {
        let (disposition, format) = match mode {
            ResultMode::Arrow => ("EXTERNAL_LINKS", "ARROW_STREAM"),
            ResultMode::JsonRows => ("INLINE", "JSON_ARRAY"),
        };
        let mut body = json!({
            "statement": sql,
            "warehouse_id": self.warehouse_id,
            "disposition": disposition,
            "format": format,
            "wait_timeout": SUBMIT_WAIT,
            "on_wait_timeout": "CONTINUE",
        });
        if let Some(c) = &self.catalog {
            body["catalog"] = json!(c);
        }
        if let Some(s) = &self.schema {
            body["schema"] = json!(s);
        }
        if !params.is_empty() {
            body["parameters"] = Value::Array(params);
        }

        let mut resp = self.client.post(STATEMENTS_PATH, &body)?;
        let mut interval = Duration::from_millis(200);
        loop {
            let state = resp
                .pointer("/status/state")
                .and_then(Value::as_str)
                .unwrap_or("");
            match state {
                "SUCCEEDED" => return Ok(resp),
                "FAILED" => {
                    let msg = resp
                        .pointer("/status/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("statement failed");
                    return Err(BridgeError::Driver(msg.to_string()));
                }
                "CANCELED" if self.canceled() => return Err(BridgeError::Canceled),
                "CANCELED" | "CLOSED" => {
                    return Err(BridgeError::Driver(format!(
                        "Databricks statement was {}.",
                        state.to_lowercase()
                    )))
                }
                "PENDING" | "RUNNING" => {}
                other => {
                    return Err(BridgeError::Driver(format!(
                        "unexpected Databricks statement state: {other:?}"
                    )))
                }
            }

            let statement_id = resp
                .get("statement_id")
                .and_then(Value::as_str)
                .ok_or_else(|| BridgeError::Driver("response had no statement_id".into()))?
                .to_string();

            // Sleep in small slices so a cancel is noticed quickly.
            let until = Instant::now() + interval;
            while Instant::now() < until && !self.canceled() {
                std::thread::sleep(Duration::from_millis(50));
            }
            if self.canceled() {
                // Best effort: the statement may finish before the cancel lands.
                let _ = self.client.post(
                    &format!("{STATEMENTS_PATH}/{statement_id}/cancel"),
                    &json!({}),
                );
                return Err(BridgeError::Canceled);
            }
            interval = (interval * 2).min(Duration::from_secs(1));
            resp = self
                .client
                .get(&format!("{STATEMENTS_PATH}/{statement_id}"))?;
        }
    }

    /// Download every chunk of an ARROW_STREAM result and re-encode it as one
    /// IPC stream. Returns (bytes, row_count).
    fn collect_arrow(&self, resp: &Value) -> Result<(Vec<u8>, u64)> {
        let manifest = resp.get("manifest").cloned().unwrap_or(Value::Null);
        let lz4 = manifest.get("result_compression").and_then(Value::as_str) == Some("LZ4_FRAME");

        let mut writer: Option<StreamWriter<Vec<u8>>> = None;
        let mut rows: u64 = 0;
        let mut links: Vec<Value> = resp
            .pointer("/result/external_links")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        while !links.is_empty() {
            let mut next: Option<String> = None;
            for link in &links {
                if self.canceled() {
                    return Err(BridgeError::Canceled);
                }
                let url = link
                    .get("external_link")
                    .and_then(Value::as_str)
                    .ok_or_else(|| BridgeError::Driver("result chunk had no link".into()))?;
                let raw = self.client.download(url, link.get("http_headers"))?;
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
                }
                next = link
                    .get("next_chunk_internal_link")
                    .and_then(Value::as_str)
                    .map(str::to_string);
            }
            links = match next {
                Some(path) => self
                    .client
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

    /// Run a small query and return its rows as nullable strings.
    fn query_rows(&self, sql: &str, params: Vec<Value>) -> Result<Vec<Vec<Option<String>>>> {
        let resp = self.run(sql, params, ResultMode::JsonRows)?;
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
                Some(path) => chunk = self.client.get(path)?,
                None => break,
            }
        }
        Ok(out)
    }

    fn default_schema(&self) -> &str {
        self.schema.as_deref().unwrap_or("default")
    }
}

fn maybe_decompress(raw: Vec<u8>, lz4_declared: bool) -> Result<Vec<u8>> {
    if !(lz4_declared || raw.starts_with(&LZ4_FRAME_MAGIC)) {
        return Ok(raw);
    }
    let mut out = Vec::new();
    lz4_flex::frame::FrameDecoder::new(Cursor::new(raw))
        .read_to_end(&mut out)
        .map_err(|e| BridgeError::Driver(format!("could not decompress result chunk: {e}")))?;
    Ok(out)
}

/// Arrow schema for an empty result, from the manifest's column list.
fn schema_from_manifest(manifest: &Value) -> Schema {
    let columns = manifest
        .pointer("/schema/columns")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let fields: Vec<Field> = columns
        .iter()
        .map(|c| {
            let name = c.get("name").and_then(Value::as_str).unwrap_or("");
            let type_name = c.get("type_name").and_then(Value::as_str).unwrap_or("");
            let dt = match type_name {
                "BOOLEAN" => DataType::Boolean,
                "BYTE" => DataType::Int8,
                "SHORT" => DataType::Int16,
                "INT" => DataType::Int32,
                "LONG" => DataType::Int64,
                "FLOAT" => DataType::Float32,
                "DOUBLE" => DataType::Float64,
                "DATE" => DataType::Date32,
                "TIMESTAMP" => DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into())),
                "DECIMAL" => {
                    let p = c
                        .get("type_precision")
                        .and_then(Value::as_u64)
                        .unwrap_or(38);
                    let s = c.get("type_scale").and_then(Value::as_i64).unwrap_or(0);
                    DataType::Decimal128(p.min(38) as u8, s as i8)
                }
                "BINARY" => DataType::Binary,
                _ => DataType::Utf8,
            };
            Field::new(name, dt, true)
        })
        .collect();
    Schema::new(fields)
}

/// Names of the `:name` markers in a statement. `::type` casts are skipped.
/// Markers inside string literals are picked up too, which only means an
/// unused name is kept; it never drops a real one.
fn referenced_param_names(sql: &str) -> std::collections::HashSet<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut names = std::collections::HashSet::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == ':' && chars.get(i + 1) == Some(&':') {
            i += 2;
            continue;
        }
        if chars[i] == ':'
            && chars
                .get(i + 1)
                .map_or(false, |c| c.is_ascii_alphabetic() || *c == '_')
        {
            let start = i + 1;
            let mut end = start;
            while end < chars.len() && (chars[end].is_ascii_alphanumeric() || chars[end] == '_') {
                end += 1;
            }
            names.insert(chars[start..end].iter().collect());
            i = end;
            continue;
        }
        i += 1;
    }
    names
}

/// Translate the studio's named-parameter map into Statement API parameters.
///
/// The studio merges its own map (keys like `:p0`) with the resolver's (keys
/// like `p0`), so the same value can arrive under both spellings. Like the
/// DuckDB and BigQuery connections, accept either, and bind only names the
/// statement references: the API rejects a name with a leading colon.
///
/// Arrays and objects are rejected: the Statement API only binds scalars,
/// and pytrilogy's Databricks dialect renders collection constants inline
/// for the same reason.
fn to_statement_params(sql: &str, parameters: Option<&Value>) -> Result<Vec<Value>> {
    let map = match parameters {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(Value::Object(m)) => m,
        Some(_) => {
            return Err(BridgeError::Driver(
                "query parameters must be a name → value map".into(),
            ))
        }
    };
    let referenced = referenced_param_names(sql);
    let mut out = Vec::with_capacity(referenced.len());
    let mut names: Vec<&String> = referenced.iter().collect();
    names.sort();
    for name in names {
        // The bare spelling wins when both are present.
        let Some(v) = map.get(name).or_else(|| map.get(&format!(":{name}"))) else {
            continue;
        };
        let p = match v {
            // An omitted value binds NULL.
            Value::Null => json!({ "name": name }),
            Value::Bool(b) => json!({ "name": name, "value": b.to_string(), "type": "BOOLEAN" }),
            Value::Number(n) if n.is_i64() || n.is_u64() => {
                json!({ "name": name, "value": n.to_string(), "type": "BIGINT" })
            }
            Value::Number(n) => json!({ "name": name, "value": n.to_string(), "type": "DOUBLE" }),
            Value::String(s) => json!({ "name": name, "value": s, "type": "STRING" }),
            Value::Array(_) | Value::Object(_) => {
                return Err(BridgeError::Driver(format!(
                    "Databricks can't bind list or struct parameter :{name}"
                )))
            }
        };
        out.push(p);
    }
    Ok(out)
}

fn str_param(name: &str, value: &str) -> Value {
    json!({ "name": name, "value": value, "type": "STRING" })
}

/// Split a script into statements on top-level `;`, skipping semicolons in
/// quotes, backtick identifiers and comments. Comment-only fragments are
/// dropped. The Statement API runs exactly one statement per request.
fn split_statements(sql: &str) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut out = Vec::new();
    let mut cur = String::new();
    // Whether `cur` holds anything besides whitespace and comments.
    let mut has_code = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        match c {
            '\'' | '"' | '`' => {
                has_code = true;
                cur.push(c);
                i += 1;
                while i < chars.len() {
                    let q = chars[i];
                    cur.push(q);
                    i += 1;
                    if q == '\\' && c != '`' && i < chars.len() {
                        cur.push(chars[i]);
                        i += 1;
                    } else if q == c {
                        break;
                    }
                }
            }
            '-' if next == Some('-') => {
                while i < chars.len() && chars[i] != '\n' {
                    cur.push(chars[i]);
                    i += 1;
                }
            }
            '/' if next == Some('*') => {
                cur.push_str("/*");
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    cur.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() {
                    cur.push_str("*/");
                    i += 2;
                }
            }
            ';' => {
                if has_code {
                    out.push(cur.trim().to_string());
                }
                cur.clear();
                has_code = false;
                i += 1;
            }
            _ => {
                has_code |= !c.is_whitespace();
                cur.push(c);
                i += 1;
            }
        }
    }
    if has_code {
        out.push(cur.trim().to_string());
    }
    out
}

/// Map Databricks type names (information_schema `full_data_type`) to the
/// lib's ColumnType values.
fn map_databricks_type(t: &str) -> String {
    let upper = t.trim().to_uppercase();
    let base = upper
        .split(|c: char| c == '(' || c == '<')
        .next()
        .unwrap_or("")
        .trim();
    match base {
        "STRING" | "VARCHAR" | "CHAR" => "string",
        "BIGINT" | "LONG" | "INT" | "INTEGER" | "SMALLINT" | "SHORT" | "TINYINT" | "BYTE" => "int",
        "DOUBLE" | "FLOAT" | "REAL" => "float",
        "DECIMAL" | "DEC" | "NUMERIC" => "numeric",
        "BOOLEAN" => "bool",
        "DATE" => "date",
        "TIMESTAMP" | "TIMESTAMP_LTZ" => "timestamp",
        "TIMESTAMP_NTZ" => "datetime",
        "ARRAY" => "array",
        "MAP" => "map",
        "STRUCT" => "struct",
        _ => "unknown",
    }
    .to_string()
}

impl QueryWorker for DatabricksWorker {
    fn query_type(&self) -> &'static str {
        "databricks"
    }

    fn capabilities(&self) -> Capabilities {
        Capabilities {
            cancel: true,
            describe: true,
        }
    }

    fn execute(
        &mut self,
        sql: &str,
        parameters: Option<&serde_json::Value>,
        identifier: &str,
    ) -> Result<(Vec<u8>, ExecuteSummary)> {
        let params = to_statement_params(sql, parameters)?;

        struct CancelGuard<'a> {
            handle: &'a Arc<DatabricksCancelHandle>,
        }
        impl Drop for CancelGuard<'_> {
            fn drop(&mut self) {
                *self.handle.current.lock() = None;
                self.handle.flag.store(false, Ordering::SeqCst);
            }
        }
        self.cancel.flag.store(false, Ordering::SeqCst);
        *self.cancel.current.lock() = Some(identifier.to_string());
        let _guard = CancelGuard {
            handle: &self.cancel,
        };

        let start = Instant::now();
        let resp = self.run(sql, params, ResultMode::Arrow)?;
        let (buf, row_count) = self.collect_arrow(&resp)?;
        Ok((
            buf,
            ExecuteSummary {
                row_count,
                duration_ms: start.elapsed().as_millis() as u64,
            },
        ))
    }

    fn execute_script(&mut self, sql: &str) -> Result<()> {
        for stmt in split_statements(sql) {
            self.run(&stmt, Vec::new(), ResultMode::JsonRows)?;
        }
        Ok(())
    }

    // Introspection reads `system.information_schema`, which spans every
    // Unity Catalog catalog the token can see and lets names be bound as
    // parameters instead of spliced into identifiers. Legacy
    // `hive_metastore`-only workspaces don't populate it.

    fn describe_databases(&self) -> Result<Vec<DatabaseDTO>> {
        let rows = self.query_rows(
            "SELECT catalog_name FROM system.information_schema.catalogs ORDER BY catalog_name",
            Vec::new(),
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

    fn describe_schemas(&self, database: &str) -> Result<Vec<SchemaDTO>> {
        let rows = self.query_rows(
            "SELECT schema_name, comment FROM system.information_schema.schemata \
             WHERE catalog_name = :catalog ORDER BY schema_name",
            vec![str_param("catalog", database)],
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

    fn describe_tables(&self, database: &str, schema: Option<&str>) -> Result<Vec<TableDTO>> {
        let schema = schema.unwrap_or(self.default_schema()).to_string();
        let rows = self.query_rows(
            "SELECT table_name, table_type, comment FROM system.information_schema.tables \
             WHERE table_catalog = :catalog AND table_schema = :schema ORDER BY table_name",
            vec![str_param("catalog", database), str_param("schema", &schema)],
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

    fn describe_columns(
        &self,
        database: &str,
        schema: &str,
        table: &str,
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

    fn describe_table(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDTO> {
        let schema = schema.unwrap_or(self.default_schema()).to_string();
        let columns = self.describe_columns(database, &schema, table)?;
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

#[cfg(test)]
mod tests;
