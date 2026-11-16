// The engine against a real SQL warehouse, under the *strict* egress policy a
// hosted deployment uses (so real result links and their redirects must pass
// it). Skipped unless DATABRICKS_HOST / DATABRICKS_HTTP_PATH /
// DATABRICKS_TOKEN are set: the same variables as query-bridge's
// `tests/databricks_live.rs` and pytrilogy's live tests.

mod common;

use std::time::Duration;

use arrow_array::{Array, Int64Array};
use arrow_ipc::reader::StreamReader;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;
use trilogy_engine::settings::hash_key;
use trilogy_engine::{app, Settings};

const KEY: &str = "tre_live";

fn live_app() -> Option<Router> {
    let mut s = Settings::from_env();
    s.server_databricks.as_ref()?;
    s.api_keys = [("live".to_string(), hash_key(KEY))].into();
    s.policy = query_bridge::workers::databricks::EgressPolicy::strict();
    s.sync = Duration::from_secs(120);
    s.max_result_bytes = 512 * 1024 * 1024;
    Some(app(s))
}

macro_rules! live_app {
    () => {
        match live_app() {
            Some(a) => a,
            None => {
                eprintln!("skipped: DATABRICKS_* not set");
                return;
            }
        }
    };
}

async fn post(app: &Router, path: &str, body: Value) -> (StatusCode, Option<u64>, Vec<u8>) {
    let req = Request::post(path)
        .header("authorization", format!("Bearer {KEY}"))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let rows = resp
        .headers()
        .get("x-row-count")
        .and_then(|v| v.to_str().ok()?.parse().ok());
    let bytes = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    (status, rows, bytes)
}

/// Submit and poll until the result arrives, like the studio client.
async fn query(app: &Router, sql: &str, parameters: Value) -> (StatusCode, Option<u64>, Vec<u8>) {
    let mut reply = post(
        app,
        "/v1/statements",
        json!({ "sql": sql, "parameters": parameters }),
    )
    .await;
    for _ in 0..120 {
        if reply.0 != StatusCode::ACCEPTED {
            break;
        }
        let id = serde_json::from_slice::<Value>(&reply.2).unwrap()["statementId"]
            .as_str()
            .unwrap()
            .to_string();
        reply = post(app, &format!("/v1/statements/{id}"), json!({})).await;
    }
    reply
}

fn json_of(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap_or(Value::Null)
}

#[tokio::test(flavor = "multi_thread")]
async fn live_connect_and_typed_parameters() {
    let app = live_app!();
    let (status, _, body) = post(&app, "/v1/connect", json!({})).await;
    assert_eq!(status, StatusCode::OK, "{:?}", json_of(&body));

    let (status, rows, body) = query(
        &app,
        "SELECT :n + 1 AS n, :s AS s, :b AS b",
        json!({ ":n": 41, "s": "x", "b": true }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{:?}", json_of(&body));
    assert_eq!(rows, Some(1));
    assert_eq!(common::decode(&body).0, vec!["n", "s", "b"]);
}

#[tokio::test(flavor = "multi_thread")]
async fn live_millions_of_rows_across_redirecting_chunks() {
    let app = live_app!();
    let n: i64 = 4_000_000;
    let (status, rows, body) = query(&app, &format!("SELECT id FROM range({n})"), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{:?}", json_of(&body));
    assert_eq!(rows, Some(n as u64));
    let reader = StreamReader::try_new(std::io::Cursor::new(body), None).unwrap();
    let mut sum: i64 = 0;
    for batch in reader {
        let batch = batch.unwrap();
        let col = batch
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .unwrap();
        sum += (0..col.len()).map(|i| col.value(i)).sum::<i64>();
    }
    assert_eq!(sum, n * (n - 1) / 2);
}

#[tokio::test(flavor = "multi_thread")]
async fn live_empty_result_describe_and_errors() {
    let app = live_app!();
    let (status, rows, body) = query(&app, "SELECT 1 AS a WHERE 1 = 0", json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(rows, Some(0));
    assert_eq!(common::decode(&body), (vec!["a".to_string()], 0));

    let (status, _, body) = post(
        &app,
        "/v1/describe/table",
        json!({ "database": "samples", "schema": "nyctaxi", "table": "trips" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{:?}", json_of(&body));
    let table = json_of(&body);
    assert!(table["columns"].as_array().is_some_and(|c| !c.is_empty()));

    let (status, _, body) = query(&app, "SELECT * FROM no_such_table_anywhere", json!({})).await;
    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(json_of(&body)["message"]
        .as_str()
        .unwrap()
        .contains("TABLE_OR_VIEW_NOT_FOUND"));
}
