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
use tauri::{AppHandle, Manager};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            kv_get,
            kv_set,
            kv_del,
            kv_keys,
            fs_read_dir,
            fs_read_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
