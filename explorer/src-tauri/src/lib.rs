// Trilogy Explorer — Tauri 2 entry point.
//
// Provides:
//   1. kv_*    — disk-backed KvBackend for lib's idbKv (host-adapter principle)
//   2. fs_*    — read-dir / read-file commands so the frontend can ingest CSVs
//                and other source files from a user-picked directory without
//                going through @tauri-apps/plugin-fs's per-path scope dance
//   3. dialog plugin — for native open-directory pickers
//
// The lib stays unaware of all this; explorer simply plugs the right
// backends in at boot.

use std::fs;
use std::path::PathBuf;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use query_bridge::{
    ColumnDTO, ConnectArgs, ConnectResult, DatabaseDTO, ExecuteArgs, SchemaDTO, SessionManager,
    TableDTO,
};

const KV_SUBDIR: &str = "kv";

// ---------------------------------------------------------------------------
// KV storage (lib's idbKv pluggable backend)
// ---------------------------------------------------------------------------

fn kv_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    let dir = base.join(KV_SUBDIR);
    fs::create_dir_all(&dir).map_err(|e| format!("could not create kv dir: {e}"))?;
    Ok(dir)
}

fn key_to_filename(key: &str) -> String {
    let safe: String = key
        .chars()
        .map(|c| match c {
            ':' | '/' | '\\' | '?' | '*' | '|' | '<' | '>' | '"' => '_',
            _ => c,
        })
        .collect();
    format!("{safe}.json")
}

fn filename_to_key(name: &str) -> Option<String> {
    name.strip_suffix(".json").map(|s| s.replace('_', ":"))
}

#[tauri::command]
fn kv_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let path = kv_dir(&app)?.join(key_to_filename(&key));
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn kv_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let path = kv_dir(&app)?.join(key_to_filename(&key));
    fs::write(&path, value).map_err(|e| e.to_string())
}

#[tauri::command]
fn kv_del(app: AppHandle, key: String) -> Result<(), String> {
    let path = kv_dir(&app)?.join(key_to_filename(&key));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn kv_keys(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = kv_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if let Some(name) = entry.file_name().to_str() {
            if let Some(key) = filename_to_key(name) {
                out.push(key);
            }
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Directory / file ingestion
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
fn fs_read_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = match entry.file_name().to_str() {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Skip hidden files (dotfiles) — projects rarely want them.
        if name.starts_with('.') {
            continue;
        }
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            is_dir: meta.is_dir(),
            size: meta.len(),
        });
    }
    Ok(out)
}

#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Remote-worker query bridge (lib's RemoteWorkerHost interface).
//
// Each frontend RemoteWorkerConnection corresponds to one session in the
// SessionManager state, which owns a long-lived driver connection. Execute
// returns the full Arrow IPC stream as a raw byte buffer via
// `tauri::ipc::Response::new` so it skips JSON serialization. Phase 5 will
// swap this for a streamed channel.
// ---------------------------------------------------------------------------

#[tauri::command]
fn remote_connect(
    state: State<'_, SessionManager>,
    connection_id: String,
    driver: String,
    config: serde_json::Value,
) -> Result<ConnectResult, String> {
    state
        .connect(ConnectArgs {
            connection_id,
            driver,
            config,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_execute(
    state: State<'_, SessionManager>,
    session_id: String,
    sql: String,
    parameters: Option<serde_json::Value>,
    identifier: String,
) -> Result<tauri::ipc::Response, String> {
    let (bytes, _summary) = state
        .execute(ExecuteArgs {
            session_id,
            sql,
            parameters,
            identifier,
        })
        .map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn remote_cancel(
    state: State<'_, SessionManager>,
    session_id: String,
    identifier: String,
) -> Result<bool, String> {
    state
        .cancel(&session_id, &identifier)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_disconnect(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<(), String> {
    state.disconnect(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_describe_databases(
    state: State<'_, SessionManager>,
    session_id: String,
) -> Result<Vec<DatabaseDTO>, String> {
    state
        .describe_databases(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_describe_schemas(
    state: State<'_, SessionManager>,
    session_id: String,
    database: String,
) -> Result<Vec<SchemaDTO>, String> {
    state
        .describe_schemas(&session_id, &database)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_describe_tables(
    state: State<'_, SessionManager>,
    session_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<TableDTO>, String> {
    state
        .describe_tables(&session_id, &database, schema.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_describe_columns(
    state: State<'_, SessionManager>,
    session_id: String,
    database: String,
    schema: String,
    table: String,
) -> Result<Vec<ColumnDTO>, String> {
    state
        .describe_columns(&session_id, &database, &schema, &table)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remote_describe_table(
    state: State<'_, SessionManager>,
    session_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<TableDTO, String> {
    state
        .describe_table(&session_id, &database, schema.as_deref(), &table)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SessionManager::new())
        .invoke_handler(tauri::generate_handler![
            kv_get,
            kv_set,
            kv_del,
            kv_keys,
            fs_read_dir,
            fs_read_text,
            remote_connect,
            remote_execute,
            remote_cancel,
            remote_disconnect,
            remote_describe_databases,
            remote_describe_schemas,
            remote_describe_tables,
            remote_describe_columns,
            remote_describe_table,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
