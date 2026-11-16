// A scripted Databricks: a tiny HTTP/1.1 server on loopback whose handler
// sees each request and returns (status, body). A 3xx's body is sent as its
// Location. Plain http to loopback is what a permissive policy allows, which
// is what lets these run offline.
#![allow(dead_code)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use arrow_array::{Int64Array, RecordBatch, StringArray};
use arrow_ipc::reader::StreamReader;
use arrow_ipc::writer::StreamWriter;
use arrow_schema::{DataType, Field, Schema};
use serde_json::{json, Value};

pub const TOKEN: &str = "dapi-server-secret";
pub const WAREHOUSE: &str = "wh-1234";

#[derive(Clone, Debug)]
pub struct Seen {
    pub method: String,
    pub path: String,
    pub authorization: Option<String>,
    pub body: String,
}

impl Seen {
    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap_or(Value::Null)
    }
}

type Handler = dyn Fn(&Seen, &str) -> (u16, Vec<u8>) + Send + Sync;

pub struct FakeDatabricks {
    pub base: String,
    seen: Arc<Mutex<Vec<Seen>>>,
}

impl FakeDatabricks {
    /// `handler(request, base_url)`; the warehouse metadata call is answered
    /// before it is consulted.
    pub fn start(handler: impl Fn(&Seen, &str) -> (u16, Vec<u8>) + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen: Arc<Mutex<Vec<Seen>>> = Arc::default();
        let (seen2, base2) = (seen.clone(), base.clone());
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
                let (mut len, mut authorization) = (0usize, None);
                loop {
                    let mut h = String::new();
                    reader.read_line(&mut h).unwrap();
                    let h = h.trim_end();
                    if h.is_empty() {
                        break;
                    }
                    let (k, v) = h.split_once(':').unwrap();
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
                    body: String::from_utf8_lossy(&body).into_owned(),
                };
                seen2.lock().unwrap().push(req.clone());
                let (status, mut payload) =
                    if req.path == format!("/api/2.0/sql/warehouses/{WAREHOUSE}") {
                        ok(json!({ "id": WAREHOUSE, "state": "STOPPED" }))
                    } else {
                        handler(&req, &base2)
                    };
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

    pub fn requests(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().clone()
    }
}

pub fn ok(v: Value) -> (u16, Vec<u8>) {
    (200, v.to_string().into_bytes())
}

pub fn arrow_chunk(ids: &[i64]) -> Vec<u8> {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, true),
        Field::new("name", DataType::Utf8, true),
    ]));
    let names: Vec<String> = ids.iter().map(|i| format!("n{i}")).collect();
    let batch = RecordBatch::try_new(
        schema.clone(),
        vec![
            Arc::new(Int64Array::from(ids.to_vec())),
            Arc::new(StringArray::from(names)),
        ],
    )
    .unwrap();
    let mut w = StreamWriter::try_new(Vec::new(), &schema).unwrap();
    w.write(&batch).unwrap();
    w.finish().unwrap();
    w.into_inner().unwrap()
}

pub fn lz4(bytes: &[u8]) -> Vec<u8> {
    let mut enc = lz4_flex::frame::FrameEncoder::new(Vec::new());
    enc.write_all(bytes).unwrap();
    enc.finish().unwrap()
}

/// (column names, row count) of an Arrow IPC stream.
pub fn decode(bytes: &[u8]) -> (Vec<String>, usize) {
    let reader = StreamReader::try_new(std::io::Cursor::new(bytes.to_vec()), None).unwrap();
    let names = reader
        .schema()
        .fields()
        .iter()
        .map(|f| f.name().clone())
        .collect();
    let rows = reader.map(|b| b.unwrap().num_rows()).sum();
    (names, rows)
}

/// A SUCCEEDED statement whose result is the given external links.
pub fn succeeded(id: &str, links: Value, manifest: Value) -> Value {
    json!({
        "statement_id": id,
        "status": { "state": "SUCCEEDED" },
        "manifest": manifest,
        "result": { "external_links": links }
    })
}
