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
//
// Layout: `client` is the API client (settings, statements, results,
// describe) and `egress` decides where it may connect. Both are public: the
// hosted remote engine (`engine/` at the repo root) drives the same client
// statelessly, by statement id, under a strict egress policy. This file is
// the desktop worker on top of it, plus the SQL / type helpers both share.

use std::io::{Cursor, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use arrow_schema::{DataType, Field, Schema, TimeUnit};
use parking_lot::Mutex;
use serde_json::{json, Value};

use super::{BuildOutput, CancelHandle, QueryWorker, WorkerFactory};
use crate::protocol::*;

pub mod client;
pub mod egress;

pub use client::{
    check_statement_id, no_deadline, statement_id, statement_state, terminal_error, Client,
    DatabricksSettings, ResultMode, CONNECTION_KEYS, STATEMENTS_PATH,
};
pub use egress::{is_public_ip, EgressPolicy, DEFAULT_API_HOST_SUFFIXES};

/// Shortest non-zero synchronous wait the API accepts. Short so a cancel
/// issued while the first request is in flight is honoured within seconds.
const SUBMIT_WAIT: Duration = Duration::from_secs(5);
const LZ4_FRAME_MAGIC: [u8; 4] = [0x04, 0x22, 0x4D, 0x18];

fn non_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Normalise a workspace host to `scheme://authority`. Anything after the
/// authority (`/?o=123`, a pasted `/sql/...` path) is dropped. Plain http is
/// only accepted for loopback, so a token is never sent in the clear.
pub fn normalize_base_url(host: &str) -> Result<String> {
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
    if authority.contains('@') {
        return Err(BridgeError::InvalidConfig(
            "Databricks host must not contain credentials.".into(),
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
pub fn warehouse_id_from_http_path(path: &str) -> Option<String> {
    let mut parts = path.trim().trim_matches('/').split('/');
    while let Some(p) = parts.next() {
        if p == "warehouses" || p == "endpoints" {
            return parts.next().filter(|s| !s.is_empty()).map(str::to_string);
        }
    }
    None
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
pub fn to_statement_params(sql: &str, parameters: Option<&Value>) -> Result<Vec<Value>> {
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
pub fn split_statements(sql: &str) -> Vec<String> {
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
pub fn map_databricks_type(t: &str) -> String {
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

// ---------------------------------------------------------------------------
// Desktop worker
// ---------------------------------------------------------------------------

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
        let settings = DatabricksSettings::from_config(config)?;
        // The desktop user owns this process and its network position.
        let client = Client::new(settings, EgressPolicy::permissive())?;
        // Verify host, token and warehouse up front with a metadata call. It
        // doesn't start a stopped warehouse, unlike `SELECT 1`.
        client.verify()?;

        let cancel = Arc::new(DatabricksCancelHandle {
            current: Mutex::new(None),
            flag: AtomicBool::new(false),
        });
        Ok(BuildOutput {
            worker: Box::new(DatabricksWorker {
                client,
                cancel: cancel.clone(),
            }),
            cancel,
        })
    }
}

pub struct DatabricksWorker {
    client: Client,
    cancel: Arc<DatabricksCancelHandle>,
}

impl DatabricksWorker {
    fn canceled(&self) -> bool {
        self.cancel.flag.load(Ordering::SeqCst)
    }
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
        let canceled = || self.canceled();
        let submitted = self
            .client
            .submit(sql, params, ResultMode::Arrow, SUBMIT_WAIT)?;
        let resp = self
            .client
            .wait(submitted, no_deadline(), Some(&canceled))?;
        let (buf, row_count) = self.client.collect_arrow(&resp, 0, &canceled)?;
        Ok((
            buf,
            ExecuteSummary {
                row_count,
                duration_ms: start.elapsed().as_millis() as u64,
            },
        ))
    }

    fn execute_script(&mut self, sql: &str) -> Result<()> {
        self.client.run_script(sql, no_deadline())
    }

    fn describe_databases(&self) -> Result<Vec<DatabaseDTO>> {
        self.client.describe_databases(no_deadline())
    }

    fn describe_schemas(&self, database: &str) -> Result<Vec<SchemaDTO>> {
        self.client.describe_schemas(database, no_deadline())
    }

    fn describe_tables(&self, database: &str, schema: Option<&str>) -> Result<Vec<TableDTO>> {
        self.client.describe_tables(database, schema, no_deadline())
    }

    fn describe_columns(
        &self,
        database: &str,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnDTO>> {
        self.client
            .describe_columns(database, schema, table, no_deadline())
    }

    fn describe_table(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDTO> {
        self.client
            .describe_table(database, schema, table, no_deadline())
    }
}

#[cfg(test)]
mod tests;
