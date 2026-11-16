// Tests run the worker against a scripted local HTTP server, so the whole
// path (request bodies, polling, chunk downloads, Arrow re-encoding) is
// exercised without a Databricks workspace. Plain http is allowed for
// loopback hosts only, which is what makes this possible.

use super::*;

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::atomic::AtomicUsize;

use arrow_array::{Int64Array, RecordBatch, StringArray};
use arrow_ipc::reader::StreamReader;
use arrow_ipc::writer::StreamWriter;

const TOKEN: &str = "dapi-test-secret";
const WAREHOUSE: &str = "abc123";

#[derive(Clone, Debug)]
struct Seen {
    method: String,
    path: String,
    authorization: Option<String>,
    /// Every request header, names lowercased.
    headers: Vec<(String, String)>,
    body: String,
}

type Handler = dyn Fn(&Seen) -> (u16, Vec<u8>) + Send + Sync;

struct MockServer {
    base: String,
    seen: Arc<Mutex<Vec<Seen>>>,
}

impl MockServer {
    fn start(handler: impl Fn(&Seen) -> (u16, Vec<u8>) + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen: Arc<Mutex<Vec<Seen>>> = Arc::new(Mutex::new(Vec::new()));
        let seen2 = seen.clone();
        let handler: Arc<Handler> = Arc::new(handler);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 {
                    continue;
                }
                let mut parts = line.split_whitespace();
                let method = parts.next().unwrap_or("").to_string();
                let path = parts.next().unwrap_or("").to_string();
                let mut len = 0usize;
                let mut authorization = None;
                let mut headers = Vec::new();
                loop {
                    let mut h = String::new();
                    reader.read_line(&mut h).unwrap();
                    let h = h.trim_end();
                    if h.is_empty() {
                        break;
                    }
                    let (k, v) = h.split_once(':').unwrap();
                    headers.push((k.to_ascii_lowercase(), v.trim().to_string()));
                    match k.to_ascii_lowercase().as_str() {
                        "content-length" => len = v.trim().parse().unwrap(),
                        "authorization" => authorization = Some(v.trim().to_string()),
                        _ => {}
                    }
                }
                let mut body = vec![0u8; len];
                reader.read_exact(&mut body).unwrap();
                let req = Seen {
                    method,
                    path,
                    authorization,
                    headers,
                    body: String::from_utf8_lossy(&body).into_owned(),
                };
                seen2.lock().push(req.clone());
                let (status, mut payload) = handler(&req);
                // A 3xx's body is its Location.
                let location = if (300..400).contains(&status) {
                    let l = String::from_utf8_lossy(&payload).into_owned();
                    payload.clear();
                    format!("Location: {l}\r\n")
                } else {
                    String::new()
                };
                let head = format!(
                    "HTTP/1.1 {status} X\r\n{location}Content-Length: {}\r\nConnection: close\r\n\r\n",
                    payload.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&payload);
            }
        });
        Self { base, seen }
    }

    fn requests(&self) -> Vec<Seen> {
        self.seen.lock().clone()
    }
}

fn ok(v: Value) -> (u16, Vec<u8>) {
    (200, v.to_string().into_bytes())
}

/// Route the warehouse check every build() makes; everything else goes to
/// `rest`.
fn with_warehouse(
    rest: impl Fn(&Seen) -> (u16, Vec<u8>) + Send + Sync + 'static,
) -> impl Fn(&Seen) -> (u16, Vec<u8>) + Send + Sync + 'static {
    move |req| {
        if req.path == format!("/api/2.0/sql/warehouses/{WAREHOUSE}") {
            ok(json!({ "id": WAREHOUSE, "state": "STOPPED" }))
        } else {
            rest(req)
        }
    }
}

fn build_worker(base: &str) -> BuildOutput {
    DatabricksFactory
        .build(&json!({
            "host": base,
            "httpPath": format!("/sql/1.0/warehouses/{WAREHOUSE}"),
            "token": TOKEN,
            "catalog": "main",
            "schema": "sales",
        }))
        .expect("build")
}

fn arrow_chunk(ids: &[i64], names: &[&str]) -> Vec<u8> {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, true),
        Field::new("name", DataType::Utf8, true),
    ]));
    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(Int64Array::from(ids.to_vec())),
            Arc::new(StringArray::from(names.to_vec())),
        ],
    )
    .unwrap();
    let mut w = StreamWriter::try_new(Vec::new(), &schema).unwrap();
    w.write(&batch).unwrap();
    w.finish().unwrap();
    w.into_inner().unwrap()
}

fn decode(bytes: &[u8]) -> (Vec<String>, usize) {
    let reader = StreamReader::try_new(Cursor::new(bytes.to_vec()), None).unwrap();
    let names = reader
        .schema()
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();
    let rows = reader.map(|b| b.unwrap().num_rows()).sum();
    (names, rows)
}

// --- config ----------------------------------------------------------------

#[test]
fn normalizes_workspace_hosts() {
    assert_eq!(
        normalize_base_url("dbc-1.cloud.databricks.com").unwrap(),
        "https://dbc-1.cloud.databricks.com"
    );
    assert_eq!(
        normalize_base_url(" https://adb-1.2.azuredatabricks.net/?o=1#x ").unwrap(),
        "https://adb-1.2.azuredatabricks.net"
    );
    assert_eq!(
        normalize_base_url("https://dbc-1.cloud.databricks.com/sql/1.0/warehouses/a").unwrap(),
        "https://dbc-1.cloud.databricks.com"
    );
    assert_eq!(
        normalize_base_url("http://127.0.0.1:9000").unwrap(),
        "http://127.0.0.1:9000"
    );
    assert!(normalize_base_url("http://dbc-1.cloud.databricks.com").is_err());
    assert!(normalize_base_url("  ").is_err());
}

#[test]
fn api_paths_cannot_change_the_authority() {
    let settings = DatabricksSettings::new(
        Some("dbc-1.cloud.databricks.com"),
        None,
        Some(WAREHOUSE),
        Some(TOKEN),
        None,
        None,
    )
    .unwrap();
    let c = Client::new(settings.clone(), EgressPolicy::permissive()).unwrap();
    assert_eq!(
        c.url("/api/2.0/sql/statements/s/result/chunks/1").unwrap(),
        "https://dbc-1.cloud.databricks.com/api/2.0/sql/statements/s/result/chunks/1"
    );
    assert!(c.url("@evil.example/api").is_err());
    assert!(c.url("//evil.example/api").is_err());
    assert!(c.url(".evil.example/api").is_err());
    // A strict client also keeps response-supplied paths under the SQL API.
    let strict = Client::new(
        settings,
        EgressPolicy::strict()
            .with_resolver(Arc::new(|_, _| Ok(vec!["52.1.2.3".parse().unwrap()]))),
    )
    .unwrap();
    assert!(strict.url("/api/2.0/sql/statements/s").is_ok());
    assert!(strict.url("/api/2.0/token/create").is_err());
    assert!(normalize_base_url("https://user@dbc-1.cloud.databricks.com").is_err());
}

#[test]
fn reads_warehouse_id_from_http_path() {
    assert_eq!(
        warehouse_id_from_http_path("/sql/1.0/warehouses/abc123").as_deref(),
        Some("abc123")
    );
    assert_eq!(
        warehouse_id_from_http_path("sql/1.0/endpoints/xyz/").as_deref(),
        Some("xyz")
    );
    assert_eq!(
        warehouse_id_from_http_path("sql/protocolv1/o/123/0123-456-abc"),
        None
    );
}

#[test]
fn rejects_cluster_http_path_and_missing_token() {
    let err = DatabricksFactory
        .build(&json!({ "host": "dbc-1.cloud.databricks.com", "httpPath": "sql/protocolv1/o/1/2", "token": "t" }))
        .err()
        .unwrap();
    assert!(err.to_string().contains("SQL warehouse"));
    let err = DatabricksFactory
        .build(&json!({ "host": "dbc-1.cloud.databricks.com", "warehouseId": "w" }))
        .err()
        .unwrap();
    assert!(err.to_string().contains("token"));
}

#[test]
fn connect_reports_bad_token_without_echoing_it() {
    let server = MockServer::start(|_| {
        (
            401,
            json!({ "error_code": "UNAUTHENTICATED", "message": "Invalid access token." })
                .to_string()
                .into_bytes(),
        )
    });
    let err = DatabricksFactory
        .build(&json!({ "host": server.base, "warehouseId": WAREHOUSE, "token": TOKEN }))
        .err()
        .unwrap()
        .to_string();
    assert!(
        err.contains("401") && err.contains("Invalid access token"),
        "{err}"
    );
    assert!(err.contains("expired"), "should carry the 401 hint: {err}");
    assert!(!err.contains(TOKEN));
    let reqs = server.requests();
    assert_eq!(
        reqs[0].authorization.as_deref(),
        Some("Bearer dapi-test-secret")
    );
}

// --- execute ---------------------------------------------------------------

#[test]
fn execute_polls_and_stitches_arrow_chunks() {
    let polls = Arc::new(AtomicUsize::new(0));
    let polls2 = polls.clone();
    let server_base = Arc::new(Mutex::new(String::new()));
    let sb = server_base.clone();
    let server = MockServer::start(with_warehouse(move |req| {
        let base = sb.lock().clone();
        match (req.method.as_str(), req.path.as_str()) {
            ("POST", "/api/2.0/sql/statements") => ok(json!({
                "statement_id": "st1",
                "status": { "state": "PENDING" }
            })),
            ("GET", "/api/2.0/sql/statements/st1") => {
                if polls2.fetch_add(1, Ordering::SeqCst) == 0 {
                    return ok(json!({ "statement_id": "st1", "status": { "state": "RUNNING" } }));
                }
                ok(json!({
                    "statement_id": "st1",
                    "status": { "state": "SUCCEEDED" },
                    "manifest": { "format": "ARROW_STREAM", "total_chunk_count": 2 },
                    "result": { "external_links": [{
                        "chunk_index": 0,
                        "external_link": format!("{base}/storage/chunk0"),
                        "http_headers": { "x-ms-blob-type": "BlockBlob" },
                        "next_chunk_internal_link": "/api/2.0/sql/statements/st1/result/chunks/1"
                    }]}
                }))
            }
            ("GET", "/api/2.0/sql/statements/st1/result/chunks/1") => ok(json!({
                "external_links": [{
                    "chunk_index": 1,
                    "external_link": format!("{base}/storage/chunk1")
                }]
            })),
            ("GET", "/storage/chunk0") => (200, arrow_chunk(&[1, 2], &["a", "b"])),
            ("GET", "/storage/chunk1") => (200, arrow_chunk(&[3], &["c"])),
            _ => (404, b"{}".to_vec()),
        }
    }));
    *server_base.lock() = server.base.clone();

    let mut built = build_worker(&server.base);
    let (bytes, summary) = built
        .worker
        .execute(
            "SELECT id, name FROM t WHERE name = :n AND id > :i",
            Some(&json!({ "n": "a", "i": 0 })),
            "q1",
        )
        .expect("execute");
    assert_eq!(summary.row_count, 3);
    assert_eq!(
        decode(&bytes),
        (vec!["id".to_string(), "name".to_string()], 3)
    );

    let reqs = server.requests();
    let submit = reqs.iter().find(|r| r.method == "POST").unwrap();
    let body: Value = serde_json::from_str(&submit.body).unwrap();
    assert_eq!(body["warehouse_id"], WAREHOUSE);
    assert_eq!(body["disposition"], "EXTERNAL_LINKS");
    assert_eq!(body["format"], "ARROW_STREAM");
    assert_eq!(body["catalog"], "main");
    assert_eq!(body["schema"], "sales");
    let params = body["parameters"].as_array().unwrap();
    assert!(params.contains(&json!({ "name": "n", "value": "a", "type": "STRING" })));
    assert!(params.contains(&json!({ "name": "i", "value": "0", "type": "BIGINT" })));

    // Presigned storage links must never see the workspace token.
    for r in reqs.iter().filter(|r| r.path.starts_with("/storage/")) {
        assert_eq!(r.authorization, None, "token leaked to {}", r.path);
    }
    let internal = reqs
        .iter()
        .find(|r| r.path.ends_with("/result/chunks/1"))
        .unwrap();
    assert!(internal.authorization.is_some());
}

#[test]
fn execute_decompresses_lz4_chunks() {
    let server_base = Arc::new(Mutex::new(String::new()));
    let sb = server_base.clone();
    let server = MockServer::start(with_warehouse(move |req| {
        let base = sb.lock().clone();
        match req.path.as_str() {
            "/api/2.0/sql/statements" => ok(json!({
                "statement_id": "st",
                "status": { "state": "SUCCEEDED" },
                "manifest": { "result_compression": "LZ4_FRAME" },
                "result": { "external_links": [{ "external_link": format!("{base}/storage/c") }] }
            })),
            "/storage/c" => {
                let mut enc = lz4_flex::frame::FrameEncoder::new(Vec::new());
                enc.write_all(&arrow_chunk(&[7], &["x"])).unwrap();
                (200, enc.finish().unwrap())
            }
            _ => (404, b"{}".to_vec()),
        }
    }));
    *server_base.lock() = server.base.clone();
    let mut built = build_worker(&server.base);
    let (bytes, summary) = built.worker.execute("SELECT 1", None, "q").unwrap();
    assert_eq!(summary.row_count, 1);
    assert_eq!(decode(&bytes).1, 1);
}

#[test]
fn empty_result_keeps_manifest_columns() {
    let server = MockServer::start(with_warehouse(|_| {
        ok(json!({
            "statement_id": "st",
            "status": { "state": "SUCCEEDED" },
            "manifest": { "schema": { "columns": [
                { "name": "id", "type_name": "LONG" },
                { "name": "amount", "type_name": "DECIMAL", "type_precision": 10, "type_scale": 2 }
            ]}, "total_row_count": 0 },
            "result": {}
        }))
    }));
    let mut built = build_worker(&server.base);
    let (bytes, summary) = built.worker.execute("SELECT ...", None, "q").unwrap();
    assert_eq!(summary.row_count, 0);
    assert_eq!(
        decode(&bytes),
        (vec!["id".to_string(), "amount".to_string()], 0)
    );
}

#[test]
fn failed_statement_surfaces_databricks_message() {
    let server = MockServer::start(with_warehouse(|_| {
        ok(json!({
            "statement_id": "st",
            "status": { "state": "FAILED", "error": {
                "error_code": "BAD_REQUEST",
                "message": "[TABLE_OR_VIEW_NOT_FOUND] The table `nope` cannot be found."
            }}
        }))
    }));
    let mut built = build_worker(&server.base);
    let err = built
        .worker
        .execute("SELECT * FROM nope", None, "q")
        .unwrap_err();
    assert!(err.to_string().contains("TABLE_OR_VIEW_NOT_FOUND"), "{err}");
}

#[test]
fn cancel_stops_polling_and_cancels_server_side() {
    let server = MockServer::start(with_warehouse(|req| {
        if req.path.ends_with("/cancel") {
            return ok(json!({}));
        }
        ok(json!({ "statement_id": "slow", "status": { "state": "RUNNING" } }))
    }));
    let built = build_worker(&server.base);
    let cancel = built.cancel.clone();
    let mut worker = built.worker;
    let handle = std::thread::spawn(move || worker.execute("SELECT sleep()", None, "q-long"));
    // Wait for the query to be armed, then cancel it.
    let deadline = Instant::now() + Duration::from_secs(5);
    while !cancel.cancel("q-long") {
        assert!(Instant::now() < deadline, "query never armed");
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(!cancel.cancel("someone-else"));
    let res = handle.join().unwrap();
    assert!(matches!(res, Err(BridgeError::Canceled)), "{:?}", res.err());
    assert!(server
        .requests()
        .iter()
        .any(|r| r.method == "POST" && r.path == "/api/2.0/sql/statements/slow/cancel"));
}

// --- describe / scripts ----------------------------------------------------

#[test]
fn describe_columns_binds_names_as_parameters() {
    let server = MockServer::start(with_warehouse(|_| {
        ok(json!({
            "statement_id": "st",
            "status": { "state": "SUCCEEDED" },
            "result": { "data_array": [
                ["id", "bigint", "NO", null],
                ["tags", "array<string>", "YES", "free-form labels"]
            ]}
        }))
    }));
    let built = build_worker(&server.base);
    let cols = built
        .worker
        .describe_columns("main", "sales", "it's")
        .unwrap();
    assert_eq!(cols.len(), 2);
    assert_eq!(cols[0].trilogy_type, "int");
    assert_eq!(cols[0].nullable, Some(false));
    assert_eq!(cols[1].trilogy_type, "array");
    assert_eq!(cols[1].description.as_deref(), Some("free-form labels"));

    let reqs = server.requests();
    let body: Value = serde_json::from_str(&reqs.last().unwrap().body).unwrap();
    assert_eq!(body["disposition"], "INLINE");
    assert_eq!(body["format"], "JSON_ARRAY");
    assert!(!body["statement"].as_str().unwrap().contains("it's"));
    assert!(body["parameters"]
        .as_array()
        .unwrap()
        .contains(&json!({ "name": "table", "value": "it's", "type": "STRING" })));
}

#[test]
fn execute_script_runs_each_statement() {
    let server = MockServer::start(with_warehouse(|_| {
        ok(json!({ "statement_id": "s", "status": { "state": "SUCCEEDED" } }))
    }));
    let mut built = build_worker(&server.base);
    built
        .worker
        .execute_script("CREATE TABLE a (x INT); -- note; here\nINSERT INTO a VALUES (1);")
        .unwrap();
    let stmts: Vec<String> = server
        .requests()
        .iter()
        .filter(|r| r.method == "POST")
        .map(|r| {
            serde_json::from_str::<Value>(&r.body).unwrap()["statement"]
                .as_str()
                .unwrap()
                .to_string()
        })
        .collect();
    assert_eq!(stmts.len(), 2);
    assert_eq!(stmts[0], "CREATE TABLE a (x INT)");
    assert!(stmts[1].ends_with("INSERT INTO a VALUES (1)"));
}

#[test]
fn splits_statements_outside_quotes_and_comments() {
    let s = split_statements(
        "SELECT 'a;b', \"c;d\", `e;f`; /* x; y */ SELECT 'it\\'s;'; -- only a comment;\n ;",
    );
    assert_eq!(s.len(), 2, "{s:?}");
    assert_eq!(s[0], "SELECT 'a;b', \"c;d\", `e;f`");
    assert!(s[1].ends_with("SELECT 'it\\'s;'"), "{s:?}");
    assert!(split_statements(" -- nothing\n ").is_empty());
}

#[test]
fn maps_parameters_and_rejects_collections() {
    let sql = "SELECT :b, :f, :z";
    let p = to_statement_params(sql, Some(&json!({ "b": true, "f": 1.5, "z": null }))).unwrap();
    assert!(p.contains(&json!({ "name": "b", "value": "true", "type": "BOOLEAN" })));
    assert!(p.contains(&json!({ "name": "f", "value": "1.5", "type": "DOUBLE" })));
    assert!(p.contains(&json!({ "name": "z" })));
    assert!(to_statement_params("SELECT :l", Some(&json!({ "l": [1, 2] }))).is_err());
    assert!(to_statement_params(sql, None).unwrap().is_empty());
}

#[test]
fn binds_studio_parameter_spellings_once() {
    // The studio merges `{":p0": …}` with the resolver's `{"p0": …}`.
    let p = to_statement_params(
        "SELECT * FROM t WHERE a = :p0 AND b > :p1 AND c::string = :p2",
        Some(&json!({ ":p0": "FRANCE", "p0": "FRANCE", ":p1": 9000, ":unused": 1, "p2": "x" })),
    )
    .unwrap();
    assert_eq!(
        p,
        vec![
            json!({ "name": "p0", "value": "FRANCE", "type": "STRING" }),
            json!({ "name": "p1", "value": "9000", "type": "BIGINT" }),
            json!({ "name": "p2", "value": "x", "type": "STRING" }),
        ]
    );
    // A `::type` cast is not a parameter marker.
    assert!(referenced_param_names("SELECT '1'::int, x:: string").is_empty());
}

#[test]
fn maps_databricks_types() {
    assert_eq!(map_databricks_type("string"), "string");
    assert_eq!(map_databricks_type("varchar(10)"), "string");
    assert_eq!(map_databricks_type("BIGINT"), "int");
    assert_eq!(map_databricks_type("decimal(10,2)"), "numeric");
    assert_eq!(map_databricks_type("timestamp_ntz"), "datetime");
    assert_eq!(map_databricks_type("map<string,int>"), "map");
    assert_eq!(map_databricks_type("variant"), "unknown");
}

// --- engine paths: redirects, size caps, out-of-band cancel -----------------

fn client_for(base: &str) -> Client {
    let settings =
        DatabricksSettings::new(Some(base), None, Some(WAREHOUSE), Some(TOKEN), None, None)
            .unwrap();
    Client::new(settings, EgressPolicy::permissive()).unwrap()
}

fn link_response(link: &str) -> Value {
    json!({
        "statement_id": "st",
        "status": { "state": "SUCCEEDED" },
        "result": { "external_links": [{
            "external_link": link,
            "http_headers": { "x-ms-blob-type": "BlockBlob" }
        }]}
    })
}

fn header<'a>(req: &'a Seen, name: &str) -> Option<&'a str> {
    req.headers
        .iter()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.as_str())
}

#[test]
fn downloads_follow_redirects_hop_by_hop() {
    let server = MockServer::start(|req| match req.path.as_str() {
        // Relative, as Databricks-managed storage answers.
        "/storage/big" => (307, b"/storage/big-part".to_vec()),
        "/storage/big-part" => (200, arrow_chunk(&[1, 2, 3], &["a", "b", "c"])),
        _ => (404, b"{}".to_vec()),
    });
    let client = client_for(&server.base);
    let resp = link_response(&format!("{}/storage/big", server.base));
    let (bytes, rows) = client.collect_arrow(&resp, 0, &|| false).unwrap();
    assert_eq!(rows, 3);
    assert_eq!(decode(&bytes).1, 3);
    let reqs = server.requests();
    assert_eq!(reqs.len(), 2);
    for r in &reqs {
        assert_eq!(r.authorization, None, "token leaked to {}", r.path);
        // Same host: the link's own headers go along.
        assert_eq!(header(r, "x-ms-blob-type"), Some("BlockBlob"));
    }
}

#[test]
fn link_headers_stay_with_the_host_databricks_named() {
    let other = MockServer::start(|_| (200, arrow_chunk(&[1], &["a"])));
    // `localhost` vs `127.0.0.1`: a different host, still loopback.
    let target = other.base.replace("127.0.0.1", "localhost") + "/elsewhere";
    let first = MockServer::start(move |_| (302, target.clone().into_bytes()));
    let client = client_for(&first.base);
    let resp = link_response(&format!("{}/storage/c", first.base));
    let (_, rows) = client.collect_arrow(&resp, 0, &|| false).unwrap();
    assert_eq!(rows, 1);
    assert_eq!(
        header(&first.requests()[0], "x-ms-blob-type"),
        Some("BlockBlob")
    );
    assert_eq!(header(&other.requests()[0], "x-ms-blob-type"), None);
}

#[test]
fn redirect_loops_and_bad_hops_are_refused() {
    let looping = MockServer::start(|_| (307, b"/storage/again".to_vec()));
    let client = client_for(&looping.base);
    let err = client
        .collect_arrow(
            &link_response(&format!("{}/storage/x", looping.base)),
            0,
            &|| false,
        )
        .unwrap_err();
    assert!(err.to_string().contains("too many"), "{err}");
    assert_eq!(looping.requests().len(), MAX_REDIRECTS_PLUS_ONE);

    // A hop to plain http off loopback fails the egress check.
    let off_box = MockServer::start(|_| (307, b"http://example.com/x".to_vec()));
    let client = client_for(&off_box.base);
    let err = client
        .collect_arrow(
            &link_response(&format!("{}/storage/x", off_box.base)),
            0,
            &|| false,
        )
        .unwrap_err();
    assert!(matches!(err, BridgeError::EgressDenied(_)), "{err:?}");
}

const MAX_REDIRECTS_PLUS_ONE: usize = client::MAX_DOWNLOAD_REDIRECTS + 1;

#[test]
fn result_size_cap_uses_manifest_and_bytes() {
    let server = MockServer::start(|_| (200, arrow_chunk(&[1, 2, 3, 4, 5, 6], &["a"; 6])));
    let client = client_for(&server.base);
    let mut resp = link_response(&format!("{}/storage/c", server.base));
    resp["manifest"] = json!({ "total_byte_count": 10_000 });
    let err = client.collect_arrow(&resp, 1_000, &|| false).unwrap_err();
    assert!(matches!(err, BridgeError::TooLarge(_)), "{err:?}");
    // Refused on the manifest alone: nothing downloaded.
    assert!(server.requests().is_empty());

    // An undeclared size is caught while downloading.
    resp["manifest"] = json!({});
    let err = client.collect_arrow(&resp, 64, &|| false).unwrap_err();
    assert!(matches!(err, BridgeError::TooLarge(_)), "{err:?}");
    assert!(client.collect_arrow(&resp, 1 << 20, &|| false).is_ok());
}

#[test]
fn stateless_wait_returns_running_and_maps_cancel() {
    let polls = Arc::new(AtomicUsize::new(0));
    let p = polls.clone();
    let server = MockServer::start(move |req| match req.path.as_str() {
        "/api/2.0/sql/statements/s-run" => {
            p.fetch_add(1, Ordering::SeqCst);
            ok(json!({ "statement_id": "s-run", "status": { "state": "RUNNING" } }))
        }
        _ => ok(json!({ "statement_id": "s-gone", "status": { "state": "CANCELED" } })),
    });
    let client = client_for(&server.base);
    // Past the deadline the last (still running) response comes back.
    let running = json!({ "statement_id": "s-run", "status": { "state": "PENDING" } });
    let out = client
        .wait(running, Instant::now() + Duration::from_millis(700), None)
        .unwrap();
    assert_eq!(statement_state(&out), "RUNNING");
    assert!(polls.load(Ordering::SeqCst) >= 1);
    // Without a local flag, CANCELED is the user's own (out-of-band) cancel.
    let canceled = client.status("s-gone").unwrap();
    assert!(matches!(
        client.wait(canceled, no_deadline(), None),
        Err(BridgeError::Canceled)
    ));
    assert!(check_statement_id("../warehouses").is_err());
    assert!(check_statement_id("01ef-ab").is_ok());
}

#[test]
fn server_settings_are_never_mixed_with_caller_credentials() {
    let server = DatabricksSettings::new(
        Some("dbc-srv.cloud.databricks.com"),
        Some("/sql/1.0/warehouses/srv"),
        None,
        Some("server-token"),
        Some("main"),
        None,
    )
    .unwrap();
    // No connection keys: the server's warehouse, caller's catalog/schema.
    let s = DatabricksSettings::resolve(&json!({ "schema": "sales" }), Some(&server)).unwrap();
    assert_eq!(s.base_url, "https://dbc-srv.cloud.databricks.com");
    assert_eq!(s.catalog.as_deref(), Some("main"));
    assert_eq!(s.schema.as_deref(), Some("sales"));
    // A caller host without a token never inherits the server's token.
    let err = DatabricksSettings::resolve(
        &json!({ "host": "dbc-mine.cloud.databricks.com", "warehouseId": "w" }),
        Some(&server),
    )
    .unwrap_err();
    assert!(err.to_string().contains("token"), "{err}");
    // And a token alone doesn't borrow the server's host.
    assert!(DatabricksSettings::resolve(&json!({ "token": "t" }), Some(&server)).is_err());
    assert!(DatabricksSettings::resolve(&json!({}), None).is_err());
    assert!(!format!("{s:?}").contains("server-token"));
}
