use std::sync::Arc;

use crate::protocol::*;

/// One-per-session driver instance. The SessionManager hands out `&mut self`
/// access through a `Mutex<Box<dyn QueryWorker>>` so workers don't need to
/// be `Sync` themselves — most native driver handles aren't.
pub trait QueryWorker: Send {
    fn query_type(&self) -> &'static str;
    fn capabilities(&self) -> Capabilities;

    /// Run a SQL statement and produce an Arrow IPC stream (full schema +
    /// all batches) plus a summary. Phase 5 will swap this for a streaming
    /// callback.
    fn execute(
        &mut self,
        sql: &str,
        parameters: Option<&serde_json::Value>,
        identifier: &str,
    ) -> Result<(Vec<u8>, ExecuteSummary)>;

    fn describe_databases(&self) -> Result<Vec<DatabaseDTO>>;
    fn describe_schemas(&self, database: &str) -> Result<Vec<SchemaDTO>>;
    fn describe_tables(&self, database: &str, schema: Option<&str>) -> Result<Vec<TableDTO>>;
    fn describe_columns(&self, database: &str, schema: &str, table: &str) -> Result<Vec<ColumnDTO>>;
    fn describe_table(
        &self,
        database: &str,
        schema: Option<&str>,
        table: &str,
    ) -> Result<TableDTO>;

    /// Set the directory the engine should resolve relative file references
    /// against. The explorer pushes its project's `directoryPath` here so
    /// `read_csv('movies.csv')` (basename, as the trilogy resolver renders it)
    /// finds the file in the project root. Default is a no-op for drivers
    /// without a notion of file CWD; DuckDB maps this to
    /// `SET file_search_path`.
    fn set_working_directory(&mut self, _directory: &str) -> Result<()> {
        Ok(())
    }
}

/// Out-of-band cancel signal. Lives outside the worker's mutex so the
/// frontend's cancel call doesn't block waiting for execute() to release it.
/// Workers cooperate by polling the underlying flag between record batches.
pub trait CancelHandle: Send + Sync {
    /// Attempt to cancel the named in-flight query. Returns true when the
    /// cancel was *armed* (the worker will stop on its next polling
    /// opportunity). Returns false when no query with that identifier is
    /// currently running.
    fn cancel(&self, identifier: &str) -> bool;
}

/// A no-op cancel handle for drivers that don't yet support cancellation.
pub struct NoopCancelHandle;

impl CancelHandle for NoopCancelHandle {
    fn cancel(&self, _identifier: &str) -> bool {
        false
    }
}

pub trait WorkerFactory: Send + Sync {
    fn name(&self) -> &'static str;
    fn build(&self, config: &serde_json::Value) -> Result<BuildOutput>;
}

/// What a factory hands the SessionManager: a worker (executes queries
/// under a mutex) plus a separately-shared cancel handle.
pub struct BuildOutput {
    pub worker: Box<dyn QueryWorker>,
    pub cancel: Arc<dyn CancelHandle>,
}

#[cfg(feature = "duckdb")]
pub mod duckdb;
