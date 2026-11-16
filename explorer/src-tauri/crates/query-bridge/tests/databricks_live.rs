// Live checks against a real Databricks SQL warehouse. Ignored by default;
// they need DATABRICKS_HOST, DATABRICKS_HTTP_PATH and DATABRICKS_TOKEN (the
// same variables pytrilogy's `databricks_server` tests read):
//
//   cargo test --test databricks_live -- --ignored --test-threads=1
//
// They use the `samples` catalog that Databricks provisions in every Unity
// Catalog workspace, and create nothing.
#![cfg(feature = "databricks")]

use std::io::Cursor;
use std::time::{Duration, Instant};

use arrow_array::cast::AsArray;
use arrow_array::types::Int64Type;
use arrow_array::RecordBatch;
use arrow_ipc::reader::StreamReader;
use query_bridge::{BridgeError, ConnectArgs, ExecuteArgs, SessionManager};
use serde_json::json;

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// Connect, or skip (return None) when credentials aren't configured.
fn connect(mgr: &SessionManager) -> Option<String> {
    let (Some(host), Some(http_path), Some(token)) = (
        env("DATABRICKS_HOST"),
        env("DATABRICKS_HTTP_PATH"),
        env("DATABRICKS_TOKEN"),
    ) else {
        eprintln!("skipping: DATABRICKS_HOST / DATABRICKS_HTTP_PATH / DATABRICKS_TOKEN not set");
        return None;
    };
    let start = Instant::now();
    let res = mgr
        .connect(ConnectArgs {
            connection_id: "live".into(),
            driver: "databricks".into(),
            config: json!({ "host": host, "httpPath": http_path, "token": token }),
        })
        .expect("connect");
    eprintln!("connect: {:?}", start.elapsed());
    assert_eq!(res.query_type, "databricks");
    Some(res.session_id)
}

fn run(
    mgr: &SessionManager,
    sid: &str,
    sql: &str,
    params: Option<serde_json::Value>,
) -> Vec<RecordBatch> {
    let start = Instant::now();
    let (bytes, summary) = mgr
        .execute(ExecuteArgs {
            session_id: sid.into(),
            sql: sql.into(),
            parameters: params,
            identifier: format!("live-{}", start.elapsed().as_nanos()),
        })
        .unwrap_or_else(|e| panic!("{sql}: {e}"));
    let batches: Vec<RecordBatch> = StreamReader::try_new(Cursor::new(bytes), None)
        .unwrap()
        .map(|b| b.unwrap())
        .collect();
    let rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows as u64, summary.row_count);
    eprintln!(
        "{rows} rows in {:?}: {}",
        start.elapsed(),
        sql.lines().next().unwrap_or("")
    );
    batches
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn typed_select_with_parameters() {
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    let batches = run(
        &mgr,
        &sid,
        "SELECT CAST(:i AS BIGINT) AS i, :s AS s, CAST(:f AS DOUBLE) AS f, :b AS b, \
         CAST(12.34 AS DECIMAL(10, 2)) AS d, DATE'2024-02-29' AS dt, \
         TIMESTAMP'2024-02-29 12:34:56' AS ts, array(1, 2) AS arr, \
         CAST(NULL AS STRING) AS n, 'it''s; quoted' AS q",
        Some(json!({ "i": 42, "s": "héllo", "f": 1.5, "b": true })),
    );
    let batch = &batches[0];
    let schema = batch.schema();
    for f in schema.fields() {
        eprintln!("  {}: {:?}", f.name(), f.data_type());
    }
    assert_eq!(batch.num_rows(), 1);
    assert_eq!(batch.column(0).as_primitive::<Int64Type>().value(0), 42);
    assert_eq!(batch.column(1).as_string::<i32>().value(0), "héllo");
    assert!(batch.column(8).is_null(0));
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn large_result_spans_chunks() {
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    // Wide enough rows that the warehouse splits the result into several
    // external-link chunks.
    let batches = run(
        &mgr,
        &sid,
        "SELECT id, repeat('x', 200) AS pad FROM range(2000000)",
        None,
    );
    let rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows, 2_000_000);
    let sum: i64 = batches
        .iter()
        .map(|b| {
            b.column(0)
                .as_primitive::<Int64Type>()
                .values()
                .iter()
                .sum::<i64>()
        })
        .sum();
    assert_eq!(
        sum,
        (0..2_000_000i64).sum::<i64>(),
        "rows lost or duplicated across chunks"
    );
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn empty_result_keeps_columns() {
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    let batches = run(
        &mgr,
        &sid,
        "SELECT trip_distance, fare_amount FROM samples.nyctaxi.trips WHERE 1 = 0",
        None,
    );
    let rows: usize = batches.iter().map(|b| b.num_rows()).sum();
    assert_eq!(rows, 0);
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn describe_samples_catalog() {
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    let dbs = mgr.describe_databases(&sid).unwrap();
    eprintln!(
        "catalogs: {:?}",
        dbs.iter().map(|d| &d.name).collect::<Vec<_>>()
    );
    assert!(dbs.iter().any(|d| d.name == "samples"));
    let schemas = mgr.describe_schemas(&sid, "samples").unwrap();
    assert!(schemas.iter().any(|s| s.name == "nyctaxi"));
    let tables = mgr
        .describe_tables(&sid, "samples", Some("nyctaxi"))
        .unwrap();
    assert!(tables.iter().any(|t| t.name == "trips"));
    let table = mgr
        .describe_table(&sid, "samples", Some("nyctaxi"), "trips")
        .unwrap();
    for c in &table.columns {
        eprintln!("  {} {} -> {}", c.name, c.native_type, c.trilogy_type);
    }
    assert!(table
        .columns
        .iter()
        .any(|c| c.name == "fare_amount" && c.trilogy_type != "unknown"));
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn bad_sql_reports_databricks_error() {
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    let err = mgr
        .execute(ExecuteArgs {
            session_id: sid,
            sql: "SELECT * FROM samples.nyctaxi.no_such_table".into(),
            parameters: None,
            identifier: "bad".into(),
        })
        .unwrap_err();
    eprintln!("{err}");
    assert!(err.to_string().contains("TABLE_OR_VIEW_NOT_FOUND"), "{err}");
}

#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn cancel_long_query() {
    let mgr = std::sync::Arc::new(SessionManager::new());
    let Some(sid) = connect(&mgr) else { return };
    let (m, s) = (mgr.clone(), sid.clone());
    let handle = std::thread::spawn(move || {
        m.execute(ExecuteArgs {
            session_id: s,
            // A cross join big enough to run for a while, small enough output.
            sql: "SELECT count(*) FROM range(200000000) a CROSS JOIN range(100000) b".into(),
            parameters: None,
            identifier: "long".into(),
        })
    });
    let deadline = Instant::now() + Duration::from_secs(30);
    while !mgr.cancel(&sid, "long").unwrap() {
        assert!(Instant::now() < deadline, "query never armed");
        std::thread::sleep(Duration::from_millis(50));
    }
    let started = Instant::now();
    let res = handle.join().unwrap();
    eprintln!("cancel returned after {:?}", started.elapsed());
    assert!(matches!(res, Err(BridgeError::Canceled)), "{:?}", res.err());
}

/// Replay resolver-compiled SQL through the bridge. Point
/// DATABRICKS_LIVE_QUERIES at a JSON array of
/// `{label, sql, parameters, expected_rows}` (the SQL from the studio
/// server's `/generate_query` with `dialect: databricks`, row counts from
/// an independent client). Parameters are passed the way the studio sends
/// them: both the `:name` and bare spellings.
#[test]
#[ignore = "needs a live Databricks SQL warehouse"]
fn replays_resolver_generated_queries() {
    let Some(path) = env("DATABRICKS_LIVE_QUERIES") else {
        eprintln!("skipping: DATABRICKS_LIVE_QUERIES not set");
        return;
    };
    let mgr = SessionManager::new();
    let Some(sid) = connect(&mgr) else { return };
    let queries: Vec<serde_json::Value> =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert!(!queries.is_empty());
    for q in &queries {
        let label = q["label"].as_str().unwrap();
        let params = q["parameters"].as_object().map(|m| {
            let mut merged = m.clone();
            for (k, v) in m {
                merged.insert(format!(":{k}"), v.clone());
            }
            serde_json::Value::Object(merged)
        });
        let batches = run(&mgr, &sid, q["sql"].as_str().unwrap(), params);
        let rows: usize = batches.iter().map(|b| b.num_rows()).sum();
        let schema = batches[0].schema();
        let cols: Vec<String> = schema
            .fields()
            .iter()
            .map(|f| format!("{}:{:?}", f.name(), f.data_type()))
            .collect();
        eprintln!("  [{label}] {rows} rows {cols:?}");
        assert_eq!(
            rows as u64,
            q["expected_rows"].as_u64().unwrap(),
            "[{label}] row count differs from the reference client"
        );
    }
}
