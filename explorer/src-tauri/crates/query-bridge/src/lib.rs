// query-bridge — driver-agnostic query session manager.
//
// Bridges the lib's RemoteWorkerHost (TypeScript interface) to whatever
// in-process database driver the explorer ships. Each connection in the
// frontend maps to one Session here; sessions own a long-lived driver
// connection so prepared statements / temp tables / transactions can stay
// hot across requests.
//
// The wire shape (serde structs in protocol.rs) is camelCase to match the
// TS DTOs exactly — the Tauri command layer can pass these through with no
// renaming.

pub mod manager;
pub mod protocol;
pub mod workers;

pub use manager::SessionManager;
pub use protocol::{
    BridgeError, Capabilities, ColumnDTO, ConnectArgs, ConnectResult, DatabaseDTO, ExecuteArgs,
    ExecuteSummary, Result, SchemaDTO, TableDTO,
};
