use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectArgs {
    pub connection_id: String,
    pub driver: String,
    #[serde(default)]
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub session_id: String,
    pub query_type: String,
    pub capabilities: Capabilities,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub cancel: bool,
    pub describe: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteArgs {
    pub session_id: String,
    pub sql: String,
    #[serde(default)]
    pub parameters: Option<serde_json::Value>,
    pub identifier: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteSummary {
    pub row_count: u64,
    pub duration_ms: u64,
}

// Describe DTOs. `camelCase` so Tauri's invoke layer hands the TS side the
// exact RemoteDatabaseDTO/RemoteSchemaDTO/etc. shapes from
// lib/connections/remoteWorker.ts without any frontend renaming.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseDTO {
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub schemas: Vec<SchemaDTO>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDTO {
    pub name: String,
    pub database: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tables: Vec<TableDTO>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableDTO {
    pub name: String,
    pub schema: String,
    pub database: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// "table" | "view"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_type: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub columns: Vec<ColumnDTO>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnDTO {
    pub name: String,
    /// Driver-native type label (e.g. "BIGINT", "VARCHAR").
    #[serde(rename = "type")]
    pub native_type: String,
    /// Lib's ColumnType enum value, lowercase: "string" | "int" | "float" | etc.
    pub trilogy_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nullable: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unique: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autoincrement: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

pub type Result<T> = std::result::Result<T, BridgeError>;

#[derive(Debug, thiserror::Error)]
pub enum BridgeError {
    #[error("unknown driver: {0}")]
    UnknownDriver(String),
    /// Explicitly stable string the frontend matches on to trigger a
    /// reconnect. Don't change the prefix without updating
    /// lib/connections/remoteWorker.ts.
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("driver error: {0}")]
    Driver(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("invalid config: {0}")]
    InvalidConfig(String),
    /// Stable string the frontend matches on to surface "query cancelled by
    /// user" instead of treating cancel as a generic driver error.
    #[error("query canceled by user")]
    Canceled,
}
