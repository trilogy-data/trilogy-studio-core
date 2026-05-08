use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;

use crate::protocol::*;
use crate::workers::{CancelHandle, QueryWorker, WorkerFactory};

/// One live driver session. `worker` is held under a Mutex so concurrent
/// execute calls on the same connection serialize correctly. `cancel` lives
/// outside that mutex so the frontend can interrupt a running query without
/// blocking on the executor.
struct Session {
    worker: Arc<Mutex<Box<dyn QueryWorker>>>,
    cancel: Arc<dyn CancelHandle>,
}

/// Owns the worker registry and the live session map. One instance per Tauri
/// app, shared via `tauri::State`.
pub struct SessionManager {
    factories: HashMap<&'static str, Arc<dyn WorkerFactory>>,
    sessions: Mutex<HashMap<String, Session>>,
}

impl SessionManager {
    pub fn new() -> Self {
        let mut factories: HashMap<&'static str, Arc<dyn WorkerFactory>> = HashMap::new();
        #[cfg(feature = "duckdb")]
        {
            let f: Arc<dyn WorkerFactory> = Arc::new(crate::workers::duckdb::DuckDbFactory);
            factories.insert(f.name(), f);
        }
        Self {
            factories,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn connect(&self, args: ConnectArgs) -> Result<ConnectResult> {
        let factory = self
            .factories
            .get(args.driver.as_str())
            .ok_or_else(|| BridgeError::UnknownDriver(args.driver.clone()))?
            .clone();
        let built = factory.build(&args.config)?;
        let query_type = built.worker.query_type().to_string();
        let capabilities = built.worker.capabilities();
        let session_id = uuid::Uuid::new_v4().to_string();
        self.sessions.lock().insert(
            session_id.clone(),
            Session {
                worker: Arc::new(Mutex::new(built.worker)),
                cancel: built.cancel,
            },
        );
        Ok(ConnectResult {
            session_id,
            query_type,
            capabilities,
        })
    }

    fn worker(&self, session_id: &str) -> Result<Arc<Mutex<Box<dyn QueryWorker>>>> {
        self.sessions
            .lock()
            .get(session_id)
            .map(|s| s.worker.clone())
            .ok_or_else(|| BridgeError::SessionNotFound(session_id.to_string()))
    }

    fn cancel_handle(&self, session_id: &str) -> Result<Arc<dyn CancelHandle>> {
        self.sessions
            .lock()
            .get(session_id)
            .map(|s| s.cancel.clone())
            .ok_or_else(|| BridgeError::SessionNotFound(session_id.to_string()))
    }

    pub fn execute(&self, args: ExecuteArgs) -> Result<(Vec<u8>, ExecuteSummary)> {
        let w = self.worker(&args.session_id)?;
        // Hold the per-session lock for the whole call so two concurrent
        // executes on the same connection are serialized — most native
        // drivers don't allow concurrent statements on one connection.
        let mut guard = w.lock();
        guard.execute(&args.sql, args.parameters.as_ref(), &args.identifier)
    }

    pub fn execute_script(&self, session_id: &str, sql: &str) -> Result<()> {
        let w = self.worker(session_id)?;
        let mut guard = w.lock();
        guard.execute_script(sql)
    }

    pub fn cancel(&self, session_id: &str, identifier: &str) -> Result<bool> {
        // Resolve through the per-session cancel handle so we don't block on
        // the worker mutex (which is held by execute() for the duration of
        // the query we're trying to cancel).
        let handle = self.cancel_handle(session_id)?;
        Ok(handle.cancel(identifier))
    }

    pub fn disconnect(&self, session_id: &str) -> Result<()> {
        // Dropping the Arc closes the underlying driver connection when the
        // last reference is gone (after any in-flight call returns).
        self.sessions.lock().remove(session_id);
        Ok(())
    }

    pub fn describe_databases(&self, session_id: &str) -> Result<Vec<DatabaseDTO>> {
        let w = self.worker(session_id)?;
        let guard = w.lock();
        guard.describe_databases()
    }

    pub fn describe_schemas(&self, session_id: &str, database: &str) -> Result<Vec<SchemaDTO>> {
        let w = self.worker(session_id)?;
        let guard = w.lock();
        guard.describe_schemas(database)
    }

    pub fn describe_tables(
        &self,
        session_id: &str,
        database: &str,
        schema: Option<&str>,
    ) -> Result<Vec<TableDTO>> {
        let w = self.worker(session_id)?;
        let guard = w.lock();
        guard.describe_tables(database, schema)
    }

    pub fn describe_columns(
        &self,
        session_id: &str,
        database: &str,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnDTO>> {
        let w = self.worker(session_id)?;
        let guard = w.lock();
        guard.describe_columns(database, schema, table)
    }

    pub fn describe_table(
        &self,
        session_id: &str,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDTO> {
        let w = self.worker(session_id)?;
        let guard = w.lock();
        guard.describe_table(database, schema, table)
    }

    pub fn set_working_directory(&self, session_id: &str, directory: &str) -> Result<()> {
        let w = self.worker(session_id)?;
        let mut guard = w.lock();
        guard.set_working_directory(directory)
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, feature = "duckdb"))]
mod tests {
    use super::*;

    #[test]
    fn duckdb_session_lifecycle() {
        let mgr = SessionManager::new();
        let result = mgr
            .connect(ConnectArgs {
                connection_id: "local:cn".into(),
                driver: "duckdb".into(),
                config: serde_json::Value::Null,
            })
            .expect("connect should succeed");
        assert_eq!(result.query_type, "duckdb");
        assert!(result.capabilities.describe);

        let session_id = result.session_id.clone();

        let (bytes, summary) = mgr
            .execute(ExecuteArgs {
                session_id: session_id.clone(),
                sql: "select 1 as a, 2 as b".into(),
                parameters: None,
                identifier: "q1".into(),
            })
            .expect("execute should succeed");
        assert!(!bytes.is_empty());
        assert_eq!(summary.row_count, 1);

        // describe_databases is callable on a fresh duckdb (defaults: "memory")
        let dbs = mgr.describe_databases(&session_id).expect("describe");
        assert!(!dbs.is_empty(), "duckdb should expose at least one database");

        mgr.disconnect(&session_id).expect("disconnect");
        // After disconnect, the session is gone.
        let err = mgr.execute(ExecuteArgs {
            session_id,
            sql: "select 1".into(),
            parameters: None,
            identifier: "q2".into(),
        });
        assert!(matches!(err, Err(BridgeError::SessionNotFound(_))));
    }

    #[test]
    fn unknown_driver_is_rejected() {
        let mgr = SessionManager::new();
        let err = mgr
            .connect(ConnectArgs {
                connection_id: "x".into(),
                driver: "made-up".into(),
                config: serde_json::Value::Null,
            })
            .unwrap_err();
        assert!(matches!(err, BridgeError::UnknownDriver(_)));
    }
}
