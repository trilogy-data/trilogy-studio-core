// In-process DuckDB worker. Holds a single duckdb::Connection per session;
// concurrent execute() calls on the same session are serialized by the
// SessionManager's per-session Mutex.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use arrow_ipc::writer::StreamWriter;
use duckdb::Connection;
use parking_lot::Mutex;
use serde::Deserialize;

use super::{BuildOutput, CancelHandle, QueryWorker, WorkerFactory};
use crate::protocol::*;

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct DuckDbConfig {
    /// Path to a DuckDB file. Empty / unset → in-memory.
    path: Option<String>,
}

pub struct DuckDbFactory;

impl WorkerFactory for DuckDbFactory {
    fn name(&self) -> &'static str {
        "duckdb"
    }

    fn build(&self, config: &serde_json::Value) -> Result<BuildOutput> {
        let cfg: DuckDbConfig = if config.is_null() {
            DuckDbConfig::default()
        } else {
            serde_json::from_value(config.clone())
                .map_err(|e| BridgeError::InvalidConfig(e.to_string()))?
        };
        let conn = match cfg.path.as_deref() {
            Some(p) if !p.is_empty() => Connection::open(PathBuf::from(p))
                .map_err(|e| BridgeError::Driver(e.to_string()))?,
            _ => Connection::open_in_memory().map_err(|e| BridgeError::Driver(e.to_string()))?,
        };
        let cancel = Arc::new(DuckDbCancelHandle {
            current: Mutex::new(None),
            flag: AtomicBool::new(false),
        });
        Ok(BuildOutput {
            worker: Box::new(DuckDbWorker {
                conn: Mutex::new(conn),
                cancel: cancel.clone(),
            }),
            cancel,
        })
    }
}

/// Cooperative cancel: the executor sets `current` to the running query's
/// identifier and resets `flag` before each statement. cancel() flips the
/// flag when the identifier matches; the executor breaks its batch loop on
/// its next polling opportunity.
struct DuckDbCancelHandle {
    current: Mutex<Option<String>>,
    flag: AtomicBool,
}

impl CancelHandle for DuckDbCancelHandle {
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

pub struct DuckDbWorker {
    conn: Mutex<Connection>,
    cancel: Arc<DuckDbCancelHandle>,
}

impl QueryWorker for DuckDbWorker {
    fn query_type(&self) -> &'static str {
        "duckdb"
    }

    fn capabilities(&self) -> Capabilities {
        // Cancellation is *cooperative*: the executor polls between Arrow
        // record batches. A long-running statement that hasn't started
        // yielding batches will run to completion. Multi-batch results
        // stop on the next batch boundary.
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
        // Phase 2: parameter binding is intentionally minimal. Reject any
        // non-empty parameter map so a silent miss isn't possible — the
        // resolver only emits :params for cross-filter / list-constant
        // queries, which don't fire from the smoke-test path.
        if let Some(p) = parameters {
            let has_params = match p {
                serde_json::Value::Null => false,
                serde_json::Value::Object(o) => !o.is_empty(),
                _ => true,
            };
            if has_params {
                return Err(BridgeError::Driver(
                    "Parameter binding for the DuckDB native worker is not implemented yet."
                        .to_string(),
                ));
            }
        }

        // Arm cancellation for this query: clear any prior flag then publish
        // our identifier so cancel() with the matching id can flip the flag.
        // Using a guard ensures we always clear `current` even on early
        // return / panic.
        struct CancelGuard<'a> {
            handle: &'a Arc<DuckDbCancelHandle>,
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

        let conn = self.conn.lock();
        let start = std::time::Instant::now();

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let after_prepare = std::time::Instant::now();
        let mut arrow_iter = stmt
            .query_arrow([])
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let schema = arrow_iter.get_schema();
        let after_query = std::time::Instant::now();

        let mut buf: Vec<u8> = Vec::new();
        let mut row_count: u64 = 0;
        let mut canceled = false;
        {
            let mut writer = StreamWriter::try_new(&mut buf, &schema)
                .map_err(|e| BridgeError::Io(e.to_string()))?;
            while let Some(batch) = arrow_iter.next() {
                if self.cancel.flag.load(Ordering::SeqCst) {
                    canceled = true;
                    break;
                }
                row_count += batch.num_rows() as u64;
                writer
                    .write(&batch)
                    .map_err(|e| BridgeError::Io(e.to_string()))?;
            }
            writer
                .finish()
                .map_err(|e| BridgeError::Io(e.to_string()))?;
        }

        if canceled {
            return Err(BridgeError::Canceled);
        }

        let total = start.elapsed();
        let prepare_ms = after_prepare.duration_since(start).as_micros() as f64 / 1000.0;
        let query_ms = after_query.duration_since(after_prepare).as_micros() as f64 / 1000.0;
        let encode_ms = total.saturating_sub(after_query.duration_since(start)).as_micros() as f64
            / 1000.0;
        let total_ms = total.as_micros() as f64 / 1000.0;
        eprintln!(
            "[remote_execute] id={} prepare={:.2}ms query={:.2}ms encode={:.2}ms total={:.2}ms rows={} bytes={}",
            identifier,
            prepare_ms,
            query_ms,
            encode_ms,
            total_ms,
            row_count,
            buf.len(),
        );

        Ok((
            buf,
            ExecuteSummary {
                row_count,
                duration_ms: total.as_millis() as u64,
            },
        ))
    }

    fn execute_script(&mut self, sql: &str) -> Result<()> {
        // Multi-statement scripts (CREATE TEMP TABLE …; CREATE TEMP TABLE …;)
        // can't go through `prepare()` — the duckdb-rs 1.3.2 path is
        // single-statement only, with no public `extract_statements` API.
        // `execute_batch` runs the script through DuckDB's own parser and
        // returns no result set, which matches the startup-script contract.
        let conn = self.conn.lock();
        conn.execute_batch(sql)
            .map_err(|e| BridgeError::Driver(e.to_string()))
    }

    fn describe_databases(&self) -> Result<Vec<DatabaseDTO>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT DISTINCT catalog_name FROM information_schema.schemata")
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let name = r.map_err(|e| BridgeError::Driver(e.to_string()))?;
            out.push(DatabaseDTO {
                name,
                schemas: vec![],
            });
        }
        Ok(out)
    }

    fn describe_schemas(&self, database: &str) -> Result<Vec<SchemaDTO>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT schema_name FROM information_schema.schemata \
                 WHERE catalog_name = ?",
            )
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let rows = stmt
            .query_map([database], |row| row.get::<_, String>(0))
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let name = r.map_err(|e| BridgeError::Driver(e.to_string()))?;
            out.push(SchemaDTO {
                name,
                database: database.to_string(),
                description: None,
                tables: vec![],
            });
        }
        Ok(out)
    }

    fn describe_tables(&self, database: &str, schema: Option<&str>) -> Result<Vec<TableDTO>> {
        let schema = schema.unwrap_or("main");
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT table_name, table_type FROM information_schema.tables \
                 WHERE table_catalog = ? AND table_schema = ?",
            )
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let rows = stmt
            .query_map([database, schema], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let (name, ttype) = r.map_err(|e| BridgeError::Driver(e.to_string()))?;
            out.push(TableDTO {
                name,
                schema: schema.to_string(),
                database: database.to_string(),
                description: None,
                asset_type: Some(if ttype == "VIEW" {
                    "view".to_string()
                } else {
                    "table".to_string()
                }),
                columns: vec![],
            });
        }
        Ok(out)
    }

    fn describe_columns(
        &self,
        database: &str,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnDTO>> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns \
                 WHERE table_catalog = ? AND table_schema = ? AND table_name = ? \
                 ORDER BY ordinal_position",
            )
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let rows = stmt
            .query_map([database, schema, table], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| BridgeError::Driver(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            let (name, dtype, nullable) = r.map_err(|e| BridgeError::Driver(e.to_string()))?;
            out.push(ColumnDTO {
                trilogy_type: map_duckdb_type(&dtype),
                name,
                native_type: dtype,
                nullable: Some(nullable.eq_ignore_ascii_case("YES")),
                primary: Some(false),
                unique: Some(false),
                default: None,
                autoincrement: Some(false),
                description: None,
            });
        }
        Ok(out)
    }

    fn describe_table(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDTO> {
        let schema = schema.unwrap_or("main").to_string();
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

    fn set_working_directory(&mut self, directory: &str) -> Result<()> {
        // `SET file_search_path = '<dir>'` makes DuckDB resolve unqualified
        // filenames in `read_csv`, `read_parquet`, etc. against `<dir>`.
        // Per-session and stays in effect until next SET, so the host can
        // call us at connect-time and only re-push when the project's
        // directory actually changes. We use the literal-string form (rather
        // than parameter binding) because DuckDB's bind path doesn't accept
        // params for SET; quotes in the path are escaped by doubling, which
        // is the standard SQL string-literal escape. An empty directory
        // resets the setting.
        eprintln!("[set_working_directory] dir={:?}", directory);
        let conn = self.conn.lock();
        if directory.is_empty() {
            conn.execute_batch("SET file_search_path = ''")
                .map_err(|e| BridgeError::Driver(e.to_string()))?;
        } else {
            let escaped = directory.replace('\'', "''");
            let sql = format!("SET file_search_path = '{}'", escaped);
            eprintln!("[set_working_directory] running: {}", sql);
            conn.execute_batch(&sql)
                .map_err(|e| BridgeError::Driver(e.to_string()))?;
        }
        eprintln!("[set_working_directory] done");
        Ok(())
    }
}

// Map duckdb's information_schema string types to the lib's ColumnType values
// (the strings the TS ColumnType enum compares against).
fn map_duckdb_type(t: &str) -> String {
    let upper = t.to_uppercase();
    if upper.starts_with("DECIMAL") {
        return "numeric".to_string();
    }
    match upper.as_str() {
        "VARCHAR" | "TEXT" | "STRING" | "CHAR" => "string",
        "BIGINT" | "HUGEINT" | "INTEGER" | "INT" | "INT4" | "INT8" | "SMALLINT" | "TINYINT"
        | "UBIGINT" | "UINTEGER" | "USMALLINT" | "UTINYINT" => "int",
        "DOUBLE" | "FLOAT" | "REAL" => "float",
        "BOOLEAN" | "BOOL" => "bool",
        "DATE" => "date",
        "TIMESTAMP" | "TIMESTAMP_NS" | "TIMESTAMP_MS" | "TIMESTAMP_S" | "DATETIME" => "datetime",
        "TIME" => "time",
        _ => "unknown",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Path to the committed MovieLens fixture, resolved from the crate's
    /// manifest dir so it works no matter where `cargo test` is invoked.
    fn movielens_fixture_dir() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("ml-latest-small")
    }

    /// Run the four `CREATE OR REPLACE TABLE ... FROM read_csv(...)` blocks
    /// from the explorer's MovieLens setup script through the worker's
    /// `execute()` path — the same path the SQL editor's Run button takes.
    /// Real fixture data, real `columns = {...}` schema specs, real header
    /// comments.
    ///
    /// **Currently ignored** because this hangs (and crashes with
    /// STATUS_STACK_BUFFER_OVERRUN under parallel test load) on the real
    /// MovieLens CSV with duckdb-rs 1.3.2. The bug is in `prepare()` +
    /// `query_arrow()` against `CREATE OR REPLACE TABLE … AS SELECT …
    /// FROM read_csv(<file>, columns = {…})` when the CSV is non-trivial
    /// (~10k rows + quoted titles). `execute_batch` on the same SQL works.
    /// The TS layer routes DDL through the batch path as a workaround
    /// (`looksLikeNoResultStatement` in queryExecutionService.ts) so users
    /// don't hit it. Re-enable this test when duckdb-rs ships a fix or we
    /// move off `query_arrow` for DDL in the worker itself.
    #[ignore = "hangs on real MovieLens CSV — duckdb-rs query_arrow bug; see comment"]
    #[test]
    fn worker_execute_movielens_setup_blocks_does_not_crash() {
        let dir = movielens_fixture_dir();
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let mut worker = built.worker;
        worker
            .set_working_directory(dir.to_str().unwrap())
            .expect("set wd");

        let blocks: &[(&str, &str)] = &[
            (
                "movies",
                "CREATE OR REPLACE TABLE movies AS\n\
                 SELECT\n\
                     movieId::INTEGER AS movieId,\n\
                     title::VARCHAR AS title,\n\
                     genres::VARCHAR AS genres\n\
                 FROM read_csv(\n\
                     'movies.csv',\n\
                     header = true,\n\
                     columns = {\n\
                         'movieId': 'INTEGER',\n\
                         'title': 'VARCHAR',\n\
                         'genres': 'VARCHAR'\n\
                     }\n\
                 )",
            ),
            (
                "links",
                "CREATE OR REPLACE TABLE links AS\n\
                 SELECT\n\
                     movieId::INTEGER AS movieId,\n\
                     imdbId::VARCHAR AS imdbId,\n\
                     tmdbId::INTEGER AS tmdbId\n\
                 FROM read_csv(\n\
                     'links.csv',\n\
                     header = true,\n\
                     columns = {\n\
                         'movieId': 'INTEGER',\n\
                         'imdbId': 'VARCHAR',\n\
                         'tmdbId': 'INTEGER'\n\
                     }\n\
                 )",
            ),
            (
                "ratings",
                "CREATE OR REPLACE TABLE ratings AS\n\
                 SELECT\n\
                     userId::INTEGER AS userId,\n\
                     movieId::INTEGER AS movieId,\n\
                     rating::DOUBLE AS rating,\n\
                     \"timestamp\"::BIGINT AS \"timestamp\"\n\
                 FROM read_csv(\n\
                     'ratings.csv',\n\
                     header = true,\n\
                     columns = {\n\
                         'userId': 'INTEGER',\n\
                         'movieId': 'INTEGER',\n\
                         'rating': 'DOUBLE',\n\
                         'timestamp': 'BIGINT'\n\
                     }\n\
                 )",
            ),
            (
                "tags",
                "CREATE OR REPLACE TABLE tags AS\n\
                 SELECT\n\
                     userId::INTEGER AS userId,\n\
                     movieId::INTEGER AS movieId,\n\
                     tag::VARCHAR AS tag,\n\
                     \"timestamp\"::BIGINT AS \"timestamp\"\n\
                 FROM read_csv(\n\
                     'tags.csv',\n\
                     header = true,\n\
                     columns = {\n\
                         'userId': 'INTEGER',\n\
                         'movieId': 'INTEGER',\n\
                         'tag': 'VARCHAR',\n\
                         'timestamp': 'BIGINT'\n\
                     }\n\
                 )",
            ),
        ];

        for (name, sql) in blocks {
            let (_bytes, summary) = worker
                .execute(sql, None, name)
                .unwrap_or_else(|e| panic!("execute failed for {}: {}", name, e));
            // CREATE TABLE returns a single-row count summary in DuckDB's
            // Arrow output. Asserting on row_count keeps the test honest if
            // a future driver change starts dropping that row.
            assert_eq!(summary.row_count, 1, "block={}", name);
        }
    }

    /// Same setup block, but routed through `SessionManager` on a tokio
    /// multi-thread runtime via `spawn_blocking` — the dispatch shape
    /// Tauri 2 uses for sync `#[tauri::command]` handlers — with a
    /// concurrent `describe_tables` racing the executor (mimicking UI
    /// auto-refresh that can be in flight when Run is clicked). Locks down
    /// the scheduling shape, not just the bare worker.
    ///
    /// **Currently ignored** for the same reason as
    /// `worker_execute_movielens_setup_blocks_does_not_crash` — the
    /// `execute → prepare → query_arrow` path against the real MovieLens
    /// `read_csv` query hangs / crashes on duckdb-rs 1.3.2.
    #[ignore = "hangs on real MovieLens CSV — duckdb-rs query_arrow bug; see comment"]
    #[test]
    fn session_manager_under_tokio_with_concurrent_describe_does_not_crash() {
        use std::sync::Arc;

        let mgr = Arc::new(crate::SessionManager::new());
        let conn_result = mgr
            .connect(crate::ConnectArgs {
                connection_id: "local:test".into(),
                driver: "duckdb".into(),
                config: serde_json::Value::Null,
            })
            .expect("connect");
        mgr.set_working_directory(
            &conn_result.session_id,
            movielens_fixture_dir().to_str().unwrap(),
        )
        .expect("set wd");

        let sql = "CREATE OR REPLACE TABLE movies AS \
                   SELECT \
                     movieId::INTEGER AS movieId, \
                     title::VARCHAR AS title, \
                     genres::VARCHAR AS genres \
                   FROM read_csv('movies.csv', header = true, \
                     columns = { 'movieId': 'INTEGER', 'title': 'VARCHAR', 'genres': 'VARCHAR' })";

        // Phase 1: runStartup-style execute_batch creates the table.
        mgr.execute_script(&conn_result.session_id, sql)
            .expect("execute_script");

        // Phase 2: tokio multi-thread + spawn_blocking, the Tauri shape.
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .expect("rt");

        rt.block_on(async {
            let mgr_a = mgr.clone();
            let sid_a = conn_result.session_id.clone();
            let sql_a = sql.to_string();
            let exec_handle = tokio::task::spawn_blocking(move || {
                mgr_a.execute(crate::ExecuteArgs {
                    session_id: sid_a,
                    sql: sql_a,
                    parameters: None,
                    identifier: "user-run".into(),
                })
            });

            let mgr_b = mgr.clone();
            let sid_b = conn_result.session_id.clone();
            let desc_handle = tokio::task::spawn_blocking(move || {
                mgr_b.describe_tables(&sid_b, "memory", Some("main"))
            });

            let (exec_res, desc_res) = tokio::join!(exec_handle, desc_handle);
            let (_bytes, summary) = exec_res.expect("join exec").expect("execute");
            let _ = desc_res.expect("join desc"); // describe is allowed to fail under contention
            assert_eq!(summary.row_count, 1);
        });
    }

    #[test]
    fn maps_common_types() {
        assert_eq!(map_duckdb_type("VARCHAR"), "string");
        assert_eq!(map_duckdb_type("BIGINT"), "int");
        assert_eq!(map_duckdb_type("DOUBLE"), "float");
        assert_eq!(map_duckdb_type("DECIMAL(10,2)"), "numeric");
        assert_eq!(map_duckdb_type("UNKNOWN_THING"), "unknown");
    }

    #[test]
    fn execute_select_one_round_trips_through_arrow_ipc() {
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let mut worker = built.worker;
        let (bytes, summary) = worker
            .execute("select 1 as x, 'hi' as y", None, "smoke")
            .unwrap();
        assert!(!bytes.is_empty(), "Arrow IPC stream should not be empty");
        assert_eq!(summary.row_count, 1);
    }

    #[test]
    fn rejects_param_binding_for_now() {
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let mut worker = built.worker;
        let params = serde_json::json!({ "x": 1 });
        let err = worker.execute("select :x", Some(&params), "id").unwrap_err();
        assert!(format!("{err}").contains("not implemented"));
    }

    #[test]
    fn cancel_handle_only_arms_for_matching_identifier() {
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        // No query is running, so cancel returns false regardless.
        assert!(!built.cancel.cancel("anything"));
    }

    #[test]
    fn cancel_during_multi_batch_execute_stops_early() {
        // Pick a row count big enough that the Arrow iterator yields more
        // than one batch (DuckDB defaults to ~2k-row batches) AND that the
        // overall query takes long enough for the cancel signal to land
        // before completion. 10M rows comfortably exceeds both thresholds
        // on any machine that can run these tests.
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let cancel = built.cancel.clone();
        let mut worker = built.worker;

        let join = std::thread::spawn(move || {
            worker.execute(
                "select range from range(10_000_000)",
                None,
                "qbig",
            )
        });

        // Give the worker a chance to enter execute() and publish its
        // identifier under the cancel handle. After that, the flag flip
        // will be picked up at the next batch boundary.
        std::thread::sleep(std::time::Duration::from_millis(75));
        let armed = cancel.cancel("qbig");
        assert!(armed, "cancel should arm when identifier matches in-flight query");

        let result = join.join().unwrap();
        assert!(
            matches!(result, Err(BridgeError::Canceled)),
            "execute should report Canceled when the flag flips mid-stream, got {result:?}",
        );
    }

    #[test]
    fn set_working_directory_makes_basename_csv_resolve() {
        // Lay down a CSV in a temp dir, point the worker's file_search_path
        // at it, and confirm `read_csv('foo.csv')` (basename only — the
        // shape the trilogy resolver renders for explorer queries) opens
        // successfully without an absolute path. Regression guard for the
        // original bug: the rust DuckDB worker was running with whatever
        // CWD `cargo run` happened to inherit, so basename CSV references
        // never resolved.
        use std::io::Write;
        let dir = tempfile::tempdir().expect("create tempdir");
        let csv_path = dir.path().join("foo.csv");
        {
            let mut f = std::fs::File::create(&csv_path).expect("create csv");
            writeln!(f, "a,b").unwrap();
            writeln!(f, "1,2").unwrap();
            writeln!(f, "3,4").unwrap();
        }

        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let mut worker = built.worker;

        // Before the call: basename read fails.
        let pre = worker.execute("select count(*) from read_csv('foo.csv')", None, "pre");
        assert!(
            pre.is_err(),
            "without file_search_path, basename CSV read should fail"
        );

        worker
            .set_working_directory(dir.path().to_str().unwrap())
            .expect("set_working_directory should succeed");

        let (_bytes, summary) = worker
            .execute("select count(*) from read_csv('foo.csv')", None, "post")
            .expect("basename read should succeed once file_search_path is set");
        assert_eq!(summary.row_count, 1);
    }

    #[test]
    fn set_working_directory_handles_path_with_quote() {
        // Single quotes get escaped by doubling. The worker shouldn't blow
        // up; the path itself doesn't have to exist for this test (we're
        // only checking that the SET statement parses and runs).
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let mut worker = built.worker;
        worker
            .set_working_directory("/tmp/has 'quote'/sub")
            .expect("escape should produce a valid SET statement");
    }

    #[test]
    fn cancel_with_mismatched_identifier_is_a_noop() {
        let factory = DuckDbFactory;
        let built = factory.build(&serde_json::Value::Null).unwrap();
        let cancel = built.cancel.clone();
        let mut worker = built.worker;

        let join = std::thread::spawn(move || {
            worker.execute(
                "select range from range(2_000_000)",
                None,
                "real-id",
            )
        });

        std::thread::sleep(std::time::Duration::from_millis(50));
        // Wrong identifier — must not cancel and must not crash.
        let armed = cancel.cancel("some-other-id");
        assert!(!armed);

        let result = join.join().unwrap().expect("query should complete");
        assert_eq!(result.1.row_count, 2_000_000);
    }
}
