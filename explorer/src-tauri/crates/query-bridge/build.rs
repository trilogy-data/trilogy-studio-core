fn main() {
    // duckdb-sys 1.3.x links against Windows Restart Manager APIs
    // (RmStartSession / RmEndSession / RmRegisterResources / RmGetList) but
    // doesn't emit the link directive itself, so the final binary errors
    // with LNK2019 unless we add it. `#[cfg(target_os)]` in build scripts
    // refers to the *host*, so use the CARGO_CFG_* env vars to query the
    // target instead.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let duckdb_enabled = std::env::var_os("CARGO_FEATURE_DUCKDB").is_some();
    if target_os == "windows" && duckdb_enabled {
        println!("cargo:rustc-link-lib=dylib=rstrtmgr");
    }
}
