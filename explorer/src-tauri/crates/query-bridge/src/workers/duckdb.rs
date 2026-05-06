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
        let mut arrow_iter = stmt
            .query_arrow([])
            .map_err(|e| BridgeError::Driver(e.to_string()))?;

        let schema = arrow_iter.get_schema();
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

        Ok((
            buf,
            ExecuteSummary {
                row_count,
                duration_ms: start.elapsed().as_millis() as u64,
            },
        ))
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
