// The engine's HTTP contract against a scripted Databricks. The studio client
// (lib/connections/httpRemoteWorkerHost.ts) is written against exactly these
// shapes: status codes, `{code, message}` errors, Arrow bodies and headers.

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use query_bridge::workers::databricks::{DatabricksSettings, EgressPolicy};
use serde_json::{json, Value};
use tower::ServiceExt;
use trilogy_engine::settings::hash_key;
use trilogy_engine::{app, Settings};

use common::*;

const KEY: &str = "tre_test_key";
const STUDIO: &str = "https://trilogydata.dev";

fn settings_for(fake: &FakeDatabricks) -> Settings {
    Settings {
        api_keys: [("tester".to_string(), hash_key(KEY))].into(),
        // The fake is plain http on loopback; strict mode is covered below
        // and in query-bridge's egress tests.
        policy: EgressPolicy::permissive(),
        server_databricks: Some(
            DatabricksSettings::new(
                Some(&fake.base),
                None,
                Some(WAREHOUSE),
                Some(TOKEN),
                Some("main"),
                Some("sales"),
            )
            .unwrap(),
        ),
        poll: Duration::from_secs(1),
        sync: Duration::from_secs(5),
        ..Settings::default()
    }
}

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Vec<u8>,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or(Value::Null)
    }
    fn code(&self) -> String {
        self.json()["code"].as_str().unwrap_or("").to_string()
    }
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|v| v.to_str().ok())
    }
}

async fn send(
    app: &Router,
    method: Method,
    path: &str,
    body: Option<Value>,
    key: Option<&str>,
) -> Reply {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("origin", STUDIO);
    if let Some(k) = key {
        req = req.header("authorization", format!("Bearer {k}"));
    }
    let req = match body {
        Some(b) => req
            .header("content-type", "application/json")
            .body(Body::from(b.to_string())),
        None => req.body(Body::empty()),
    }
    .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let headers = resp.headers().clone();
    let body = resp
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes()
        .to_vec();
    Reply {
        status,
        headers,
        body,
    }
}

async fn post(app: &Router, path: &str, body: Value) -> Reply {
    send(app, Method::POST, path, Some(body), Some(KEY)).await
}

fn no_statements(_: &Seen, _: &str) -> (u16, Vec<u8>) {
    (404, b"{}".to_vec())
}

// --- privacy and auth -------------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
async fn without_keys_only_health_is_served() {
    let app = app(Settings::default());
    assert_eq!(
        send(&app, Method::GET, "/health", None, None).await.status,
        StatusCode::OK
    );
    assert_eq!(
        send(&app, Method::GET, "/v1/info", None, Some(KEY))
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    let r = send(
        &app,
        Method::POST,
        "/v1/connect",
        Some(json!({})),
        Some(KEY),
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[tokio::test(flavor = "multi_thread")]
async fn every_v1_route_needs_a_valid_key() {
    let fake = FakeDatabricks::start(no_statements);
    let app = app(settings_for(&fake));
    let missing = send(&app, Method::GET, "/v1/info", None, None).await;
    assert_eq!(missing.status, StatusCode::UNAUTHORIZED);
    assert_eq!(missing.code(), "unauthorized");
    let wrong = send(
        &app,
        Method::POST,
        "/v1/connect",
        Some(json!({})),
        Some("tre_nope"),
    )
    .await;
    assert_eq!(wrong.status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong.json()["message"], "Invalid engine API key.");
    // Nothing reached Databricks.
    assert!(fake.requests().is_empty());

    let info = send(&app, Method::GET, "/v1/info", None, Some(KEY)).await;
    assert_eq!(info.status, StatusCode::OK);
    assert_eq!(info.json()["databricks"]["serverWarehouse"], true);
    assert_eq!(info.json()["drivers"], json!(["databricks"]));
}

#[tokio::test(flavor = "multi_thread")]
async fn cors_allows_the_studio_and_exposes_result_headers() {
    let fake = FakeDatabricks::start(no_statements);
    let app = app(settings_for(&fake));
    let preflight = Request::builder()
        .method(Method::OPTIONS)
        .uri("/v1/statements")
        .header("origin", STUDIO)
        .header("access-control-request-method", "POST")
        .header(
            "access-control-request-headers",
            "authorization,content-type",
        )
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(preflight).await.unwrap();
    assert!(resp.status().is_success());
    assert_eq!(resp.headers()["access-control-allow-origin"], STUDIO);

    let info = send(&app, Method::GET, "/v1/info", None, Some(KEY)).await;
    let exposed = info
        .header("access-control-expose-headers")
        .unwrap()
        .to_ascii_lowercase();
    for h in ["x-row-count", "x-duration-ms", "x-statement-id"] {
        assert!(exposed.contains(h), "{exposed}");
    }

    let evil = Request::builder()
        .method(Method::OPTIONS)
        .uri("/v1/statements")
        .header("origin", "https://evil.example")
        .header("access-control-request-method", "POST")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(evil).await.unwrap();
    assert!(resp.headers().get("access-control-allow-origin").is_none());
}

// --- connect and credentials ------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
async fn connect_verifies_the_server_warehouse() {
    let fake = FakeDatabricks::start(no_statements);
    let app = app(settings_for(&fake));
    let r = post(
        &app,
        "/v1/connect",
        json!({ "driver": "databricks", "config": {} }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json());
    assert_eq!(r.json()["queryType"], "databricks");
    let reqs = fake.requests();
    assert_eq!(reqs[0].path, format!("/api/2.0/sql/warehouses/{WAREHOUSE}"));
    assert_eq!(
        reqs[0].authorization.as_deref(),
        Some(&*format!("Bearer {TOKEN}"))
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn databricks_errors_pass_through_without_the_token() {
    let fake = FakeDatabricks::start(no_statements);
    let other = FakeDatabricks::start(no_statements);
    let app = app(settings_for(&fake));
    // A caller-named workspace whose warehouse doesn't exist.
    let r = post(
        &app,
        "/v1/connect",
        json!({ "config": { "host": other.base, "warehouseId": "missing", "token": "caller-tok" } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_GATEWAY);
    assert_eq!(r.code(), "driver_error");
    let message = r.json()["message"].as_str().unwrap().to_string();
    assert!(
        message.contains("404") && message.contains("warehouse HTTP path"),
        "{message}"
    );
    assert!(!message.contains("caller-tok"));
    // The caller's token went to the caller's host, never the server's.
    assert_eq!(
        other.requests()[0].authorization.as_deref(),
        Some("Bearer caller-tok")
    );
    assert!(fake.requests().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn caller_credentials_are_never_mixed_with_the_servers() {
    let fake = FakeDatabricks::start(no_statements);
    let app_ = app(settings_for(&fake));
    // A host without a token must not borrow the server's.
    let r = post(
        &app_,
        "/v1/connect",
        json!({ "config": { "host": "dbc-x.cloud.databricks.com", "warehouseId": "w" } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(r.json()["message"].as_str().unwrap().contains("token"));
    assert!(fake.requests().is_empty());

    // Pinned engine: caller credentials refused outright.
    let mut pinned = settings_for(&fake);
    pinned.allow_caller_credentials = false;
    let r = post(
        &app(pinned),
        "/v1/connect",
        json!({ "config": { "token": "t" } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);

    // No server warehouse and no caller one.
    let mut bare = settings_for(&fake);
    bare.server_databricks = None;
    let r = post(&app(bare), "/v1/connect", json!({ "config": {} })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.code(), "invalid_request");
}

#[tokio::test(flavor = "multi_thread")]
async fn strict_egress_refuses_non_databricks_hosts() {
    let fake = FakeDatabricks::start(no_statements);
    let mut strict = settings_for(&fake);
    strict.policy = EgressPolicy::strict();
    let app = app(strict);
    for host in [
        "evil.example",
        "http://127.0.0.1:9",
        "dbc-1.cloud.databricks.com:8443",
    ] {
        let r = post(
            &app,
            "/v1/connect",
            json!({ "config": { "host": host, "warehouseId": "w", "token": "t" } }),
        )
        .await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{host}: {:?}", r.json());
        assert_eq!(r.code(), "invalid_request");
    }
    // The server's own (loopback) warehouse fails strict mode too.
    let r = post(&app, "/v1/connect", json!({ "config": {} })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[tokio::test(flavor = "multi_thread")]
async fn malformed_bodies_use_the_error_shape() {
    let fake = FakeDatabricks::start(no_statements);
    let app = app(settings_for(&fake));
    let r = post(&app, "/v1/statements", json!({ "config": {} })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert_eq!(r.code(), "invalid_request");
    let r = post(&app, "/v1/connect", json!({ "driver": "duckdb" })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    assert!(r.json()["message"]
        .as_str()
        .unwrap()
        .contains("unsupported driver"));
    let r = post(&app, "/v1/statements/..%2Fwarehouses/cancel", json!({})).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

// --- statements -------------------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
async fn executes_and_streams_multi_chunk_lz4_arrow() {
    let fake = FakeDatabricks::start(|req, base| match req.path.as_str() {
        "/api/2.0/sql/statements" => ok(succeeded(
            "st-1",
            json!([{
                "external_link": format!("{base}/storage/c0"),
                "next_chunk_internal_link": "/api/2.0/sql/statements/st-1/result/chunks/1"
            }]),
            json!({ "result_compression": "LZ4_FRAME" }),
        )),
        "/api/2.0/sql/statements/st-1/result/chunks/1" => ok(json!({
            "external_links": [{ "external_link": format!("{base}/storage/c1") }]
        })),
        // Large results on managed storage redirect to a sibling path.
        "/storage/c0" => (307, b"/storage/c0-real".to_vec()),
        "/storage/c0-real" => (200, lz4(&arrow_chunk(&[1, 2]))),
        "/storage/c1" => (200, lz4(&arrow_chunk(&[3]))),
        _ => (404, b"{}".to_vec()),
    });
    let app = app(settings_for(&fake));
    let r = post(
        &app,
        "/v1/statements",
        json!({ "config": { "schema": "other" }, "sql": "SELECT * FROM t WHERE id > :p0", "parameters": { ":p0": 0, "p0": 0 } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json());
    assert_eq!(
        r.header("content-type"),
        Some("application/vnd.apache.arrow.stream")
    );
    assert_eq!(r.header("x-row-count"), Some("3"));
    assert_eq!(r.header("x-statement-id"), Some("st-1"));
    assert_eq!(
        decode(&r.body),
        (vec!["id".to_string(), "name".to_string()], 3)
    );

    let reqs = fake.requests();
    let submit = reqs
        .iter()
        .find(|q| q.path == "/api/2.0/sql/statements")
        .unwrap()
        .json();
    assert_eq!(submit["catalog"], "main");
    assert_eq!(submit["schema"], "other");
    assert_eq!(submit["format"], "ARROW_STREAM");
    assert_eq!(
        submit["parameters"],
        json!([{ "name": "p0", "value": "0", "type": "BIGINT" }])
    );
    for q in reqs.iter().filter(|q| q.path.starts_with("/storage/")) {
        assert_eq!(q.authorization, None, "token sent to {}", q.path);
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn empty_results_keep_their_columns() {
    let fake = FakeDatabricks::start(|_, _| {
        ok(json!({
            "statement_id": "st-e",
            "status": { "state": "SUCCEEDED" },
            "manifest": { "schema": { "columns": [{ "name": "a", "type_name": "LONG" }] } },
            "result": {}
        }))
    });
    let r = post(
        &app(settings_for(&fake)),
        "/v1/statements",
        json!({ "sql": "SELECT a FROM t WHERE false" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.header("x-row-count"), Some("0"));
    assert_eq!(decode(&r.body), (vec!["a".to_string()], 0));
}

#[tokio::test(flavor = "multi_thread")]
async fn long_statements_answer_202_and_poll_to_completion() {
    let polls = Arc::new(AtomicUsize::new(0));
    let p = polls.clone();
    let fake = FakeDatabricks::start(move |req, base| match req.path.as_str() {
        "/api/2.0/sql/statements" => {
            ok(json!({ "statement_id": "st-slow", "status": { "state": "PENDING" } }))
        }
        "/api/2.0/sql/statements/st-slow" => {
            // Running through the submit request's whole wait, done after.
            if p.fetch_add(1, Ordering::SeqCst) < 4 {
                ok(json!({ "statement_id": "st-slow", "status": { "state": "RUNNING" } }))
            } else {
                ok(succeeded(
                    "st-slow",
                    json!([{ "external_link": format!("{base}/storage/x") }]),
                    json!({}),
                ))
            }
        }
        "/storage/x" => (200, arrow_chunk(&[9])),
        _ => (404, b"{}".to_vec()),
    });
    let app = app(settings_for(&fake));
    let first = post(&app, "/v1/statements", json!({ "sql": "SELECT slow()" })).await;
    assert_eq!(first.status, StatusCode::ACCEPTED, "{:?}", first.json());
    assert_eq!(first.json()["statementId"], "st-slow");

    let mut reply = first;
    for _ in 0..10 {
        reply = post(&app, "/v1/statements/st-slow", json!({ "config": {} })).await;
        if reply.status != StatusCode::ACCEPTED {
            break;
        }
    }
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.header("x-row-count"), Some("1"));
    // The submit asked Databricks to hold the request for the poll window.
    let submit = fake.requests()[0].json();
    assert_eq!(submit["wait_timeout"], "5s");
    assert_eq!(submit["on_wait_timeout"], "CONTINUE");
}

#[tokio::test(flavor = "multi_thread")]
async fn cancel_by_statement_id() {
    let fake = FakeDatabricks::start(|req, _| match (req.method.as_str(), req.path.as_str()) {
        ("POST", "/api/2.0/sql/statements/st-c/cancel") => ok(json!({})),
        _ => ok(json!({ "statement_id": "st-c", "status": { "state": "CANCELED" } })),
    });
    let app = app(settings_for(&fake));
    let r = post(&app, "/v1/statements/st-c/cancel", json!({})).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(r.json(), json!({ "canceled": true }));
    assert!(fake
        .requests()
        .iter()
        .any(|q| q.path == "/api/2.0/sql/statements/st-c/cancel"));
    // A poll that lands after the cancel reads as the user's cancel.
    let r = post(&app, "/v1/statements/st-c", json!({})).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
    assert_eq!(r.code(), "canceled");
    assert_eq!(r.json()["message"], "query canceled by user");
}

#[tokio::test(flavor = "multi_thread")]
async fn failed_statements_carry_the_databricks_message() {
    let fake = FakeDatabricks::start(|_, _| {
        ok(
            json!({ "statement_id": "st-f", "status": { "state": "FAILED", "error": {
                "message": "[TABLE_OR_VIEW_NOT_FOUND] The table `nope` cannot be found."
            }}}),
        )
    });
    let r = post(
        &app(settings_for(&fake)),
        "/v1/statements",
        json!({ "sql": "SELECT * FROM nope" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_GATEWAY);
    assert!(r.json()["message"]
        .as_str()
        .unwrap()
        .contains("TABLE_OR_VIEW_NOT_FOUND"));
}

#[tokio::test(flavor = "multi_thread")]
async fn list_parameters_are_refused() {
    let fake = FakeDatabricks::start(no_statements);
    let r = post(
        &app(settings_for(&fake)),
        "/v1/statements",
        json!({ "sql": "SELECT :l", "parameters": { "l": [1, 2] } }),
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_GATEWAY);
    assert!(fake
        .requests()
        .iter()
        .all(|q| q.path != "/api/2.0/sql/statements"));
}

#[tokio::test(flavor = "multi_thread")]
async fn results_over_the_cap_are_refused() {
    let fake = FakeDatabricks::start(|req, base| match req.path.as_str() {
        "/api/2.0/sql/statements" => ok(succeeded(
            "st-big",
            json!([{ "external_link": format!("{base}/storage/big") }]),
            json!({ "total_byte_count": 10_000_000 }),
        )),
        _ => (200, arrow_chunk(&[1])),
    });
    let mut s = settings_for(&fake);
    s.max_result_bytes = 1_000_000;
    let r = post(&app(s), "/v1/statements", json!({ "sql": "SELECT *" })).await;
    assert_eq!(r.status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(r.code(), "too_large");
    assert!(fake
        .requests()
        .iter()
        .all(|q| !q.path.starts_with("/storage/")));
}

#[tokio::test(flavor = "multi_thread")]
async fn sheds_load_past_the_inflight_limit() {
    let fake = FakeDatabricks::start(no_statements);
    let mut s = settings_for(&fake);
    s.max_inflight = 0;
    let r = post(&app(s), "/v1/connect", json!({})).await;
    assert_eq!(r.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(r.code(), "overloaded");
    assert_eq!(r.header("retry-after"), Some("2"));
}

// --- scripts and describe ---------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
async fn scripts_run_statement_by_statement() {
    let fake = FakeDatabricks::start(|_, _| {
        ok(json!({ "statement_id": "s", "status": { "state": "SUCCEEDED" } }))
    });
    let r = post(
        &app(settings_for(&fake)),
        "/v1/script",
        json!({ "sql": "CREATE TEMP VIEW a AS SELECT 1; -- note; here\nSELECT 2;" }),
    )
    .await;
    assert_eq!(r.status, StatusCode::NO_CONTENT);
    let statements: Vec<String> = fake
        .requests()
        .iter()
        .filter(|q| q.path == "/api/2.0/sql/statements")
        .map(|q| q.json()["statement"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(statements.len(), 2);
    assert_eq!(statements[0], "CREATE TEMP VIEW a AS SELECT 1");
}

#[tokio::test(flavor = "multi_thread")]
async fn describe_returns_the_studio_dtos() {
    let fake = FakeDatabricks::start(|req, _| {
        let sql = req.json()["statement"].as_str().unwrap_or("").to_string();
        let rows = if sql.contains("information_schema.tables") {
            json!([["orders", "MANAGED", null], ["v_orders", "VIEW", "a view"]])
        } else if sql.contains("information_schema.columns") {
            json!([
                ["id", "bigint", "NO", null],
                ["tags", "array<string>", "YES", "labels"]
            ])
        } else {
            json!([["main"], ["samples"]])
        };
        ok(
            json!({ "statement_id": "d", "status": { "state": "SUCCEEDED" }, "result": { "data_array": rows } }),
        )
    });
    let app = app(settings_for(&fake));

    let dbs = post(&app, "/v1/describe/databases", json!({})).await;
    assert_eq!(
        dbs.json(),
        json!([{ "name": "main" }, { "name": "samples" }])
    );

    let tables = post(&app, "/v1/describe/tables", json!({ "database": "main" })).await;
    let tables = tables.json();
    assert_eq!(
        tables[0]["schema"], "sales",
        "falls back to the server's schema"
    );
    assert_eq!(tables[1]["assetType"], "view");

    let table = post(
        &app,
        "/v1/describe/table",
        json!({ "database": "main", "schema": "s", "table": "orders" }),
    )
    .await;
    let table = table.json();
    assert_eq!(table["columns"][0]["trilogyType"], "int");
    assert_eq!(table["columns"][0]["type"], "bigint");
    assert_eq!(table["columns"][1]["nullable"], true);

    // Names are bound as parameters, never spliced into SQL.
    let q = fake.requests().last().unwrap().json();
    assert!(q["parameters"]
        .as_array()
        .unwrap()
        .contains(&json!({ "name": "table", "value": "orders", "type": "STRING" })));

    let r = post(&app, "/v1/describe/schemas", json!({})).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = post(&app, "/v1/describe/columns", json!({ "database": "main" })).await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = post(&app, "/v1/describe/everything", json!({})).await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}
