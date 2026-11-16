// The hosted remote query engine.
//
// The browser studio can't call Databricks directly (the Statement API sends
// no CORS headers), so this server runs those queries on its behalf and hands
// back Arrow IPC, the same bytes the desktop explorer's in-process bridge
// produces. The drivers are the explorer's `query-bridge` crate; this file is
// only the HTTP contract around them. The studio's client is
// lib/connections/httpRemoteWorkerHost.ts; the contract is written up in
// docs/remote-worker-service.md.
//
// A separate service from pyserver (the resolver): the resolver is CPU-bound
// parse-and-plan, this is I/O-bound and memory-shaped, and it is an outbound
// proxy to customer warehouses whose secrets don't belong in the resolver.
//
// - Private. With no API keys only /health is served; every /v1 route needs
//   `Authorization: Bearer <key>`, checked against sha256 digests in
//   constant time.
// - Stateless. Every call carries its connection config and the warehouse
//   holds the statement, so any machine answers any call and scale-to-zero
//   loses nothing.
// - Submit, then poll. A statement call waits at most `poll` and answers with
//   the result or `202 {statementId}`; the client polls by id. No request
//   outlives the proxy's timeouts, however long the query runs.
// - Credentials. A call names its own workspace and token, or none of them and
//   runs on the server's warehouse. Never a mix (DatabricksSettings::resolve).
// - Egress. Strict by default: Databricks hosts, https/443, no private
//   addresses, every redirect hop re-checked (query-bridge's EgressPolicy).

pub mod settings;

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::rejection::JsonRejection;
use axum::extract::{FromRequest, Path, Request, State};
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use axum::http::{HeaderName, HeaderValue, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use query_bridge::workers::databricks::{
    statement_id, statement_state, to_statement_params, Client, DatabricksSettings, ResultMode,
};
use query_bridge::BridgeError;
use serde::Deserialize;
use serde_json::{json, Value};
use subtle::ConstantTimeEq;
use tokio::sync::Semaphore;
use tower_http::cors::{AllowOrigin, CorsLayer};

pub use settings::Settings;

pub const ARROW_MEDIA_TYPE: &str = "application/vnd.apache.arrow.stream";
/// Response headers the browser must be allowed to read.
pub const EXPOSED_HEADERS: [&str; 3] = ["x-row-count", "x-duration-ms", "x-statement-id"];
pub const DRIVERS: [&str; 1] = ["databricks"];

/// Pages allowed to read responses: the hosted studio, the desktop shell and
/// local dev. Every query route also needs an API key, so CORS is not the
/// boundary; it keeps arbitrary sites from using a key a user pasted.
fn origin_allowed(origin: &str, extra: &[String]) -> bool {
    let local = |prefix: &str| {
        origin
            .strip_prefix(prefix)
            .is_some_and(|port| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()))
    };
    matches!(
        origin,
        "https://trilogy-data.github.io" | "https://trilogydata.dev" | "app://."
    ) || local("http://localhost:")
        || local("http://127.0.0.1:")
        || extra.iter().any(|o| o == origin)
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    fn invalid(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_request", message)
    }
}

impl From<BridgeError> for ApiError {
    fn from(e: BridgeError) -> Self {
        let (status, code) = match &e {
            BridgeError::InvalidConfig(_)
            | BridgeError::EgressDenied(_)
            | BridgeError::UnknownDriver(_) => (StatusCode::BAD_REQUEST, "invalid_request"),
            BridgeError::Canceled => (StatusCode::CONFLICT, "canceled"),
            BridgeError::TooLarge(_) => (StatusCode::PAYLOAD_TOO_LARGE, "too_large"),
            BridgeError::Timeout(_) => (StatusCode::GATEWAY_TIMEOUT, "timeout"),
            BridgeError::Io(_) => (StatusCode::BAD_GATEWAY, "upstream_unreachable"),
            BridgeError::Driver(_) | BridgeError::SessionNotFound(_) => {
                (StatusCode::BAD_GATEWAY, "driver_error")
            }
        };
        Self::new(status, code, e.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        // `detail` too, so clients written against FastAPI's shape still work.
        let body =
            Json(json!({ "code": self.code, "message": self.message, "detail": self.message }));
        let mut resp = (self.status, body).into_response();
        if self.status == StatusCode::SERVICE_UNAVAILABLE {
            resp.headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from_static("2"));
        }
        resp
    }
}

type ApiResult<T> = Result<T, ApiError>;

/// A JSON body whose rejections use the engine's error shape.
pub struct Body<T>(pub T);

impl<S, T> FromRequest<S> for Body<T>
where
    Json<T>: FromRequest<S, Rejection = JsonRejection>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        Json::<T>::from_request(req, state)
            .await
            .map(|Json(v)| Body(v))
            .map_err(|e| ApiError::invalid(e.body_text()))
    }
}

// ---------------------------------------------------------------------------
// Wire models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCall {
    #[serde(default = "default_driver")]
    driver: String,
    #[serde(default)]
    config: Value,
}

fn default_driver() -> String {
    "databricks".into()
}

#[derive(Deserialize)]
pub struct ExecuteCall {
    #[serde(flatten)]
    call: EngineCall,
    sql: String,
    #[serde(default)]
    parameters: Option<Value>,
}

#[derive(Deserialize)]
pub struct ScriptCall {
    #[serde(flatten)]
    call: EngineCall,
    sql: String,
}

#[derive(Deserialize)]
pub struct DescribeCall {
    #[serde(flatten)]
    call: EngineCall,
    #[serde(default)]
    database: Option<String>,
    #[serde(default)]
    schema: Option<String>,
    #[serde(default)]
    table: Option<String>,
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

struct Engine {
    settings: Settings,
    inflight: Arc<Semaphore>,
}

type AppState = Arc<Engine>;

pub fn app(settings: Settings) -> Router {
    let cors = cors_layer(settings.extra_origins.clone());
    let mut router = Router::new().route("/health", get(health));
    if settings.enabled() {
        let state: AppState = Arc::new(Engine {
            inflight: Arc::new(Semaphore::new(settings.max_inflight)),
            settings,
        });
        let v1 = Router::new()
            .route("/info", get(info))
            .route("/connect", post(connect))
            .route("/statements", post(submit))
            .route("/statements/{id}", post(poll))
            .route("/statements/{id}/cancel", post(cancel))
            .route("/script", post(script))
            .route("/describe/{kind}", post(describe))
            .route_layer(middleware::from_fn_with_state(state.clone(), require_key))
            .with_state(state);
        router = router.nest("/v1", v1);
    } else {
        eprintln!("engine: TRILOGY_ENGINE_API_KEYS is not set; serving /health only, no queries.");
    }
    router.layer(cors)
}

fn cors_layer(extra: Vec<String>) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().is_ok_and(|o| origin_allowed(o, &extra))
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE])
        .expose_headers(EXPOSED_HEADERS.map(HeaderName::from_static))
        .max_age(Duration::from_secs(600))
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "drivers": DRIVERS }))
}

/// `Authorization: Bearer <key>`. Every configured digest is compared, in
/// constant time, so timing says nothing about which key (or how much of
/// one) matched.
async fn require_key(State(engine): State<AppState>, req: Request, next: Next) -> Response {
    let presented = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            let (scheme, key) = v.split_once(' ')?;
            scheme.eq_ignore_ascii_case("bearer").then(|| key.trim())
        })
        .filter(|k| !k.is_empty());
    let Some(presented) = presented else {
        return ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Engine API key required (Authorization: Bearer).",
        )
        .into_response();
    };
    let digest = settings::hash_key(presented);
    let mut matched = 0u8;
    for expected in engine.settings.api_keys.values() {
        matched |= digest.as_bytes().ct_eq(expected.as_bytes()).unwrap_u8();
    }
    if matched == 0 {
        return ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Invalid engine API key.",
        )
        .into_response();
    }
    next.run(req).await
}

impl Engine {
    fn settings_for(&self, call: &EngineCall) -> ApiResult<DatabricksSettings> {
        if call.driver != "databricks" {
            return Err(ApiError::invalid(format!(
                "unsupported driver {:?}; this engine runs: {}",
                call.driver,
                DRIVERS.join(", ")
            )));
        }
        if !self.settings.allow_caller_credentials
            && DatabricksSettings::names_connection(&call.config)
        {
            return Err(ApiError::invalid(
                "This engine only runs its own configured warehouse; remove host, httpPath and token from the connection.",
            ));
        }
        Ok(DatabricksSettings::resolve(
            &call.config,
            self.settings.server_databricks.as_ref(),
        )?)
    }

    fn client_for(&self, call: &EngineCall) -> ApiResult<Client> {
        Ok(Client::new(
            self.settings_for(call)?,
            self.settings.policy.clone(),
        )?)
    }
}

/// Admit the call (or 503 at once) and run it on the blocking pool: the
/// driver is synchronous HTTP.
async fn run<T: Send + 'static>(
    engine: &AppState,
    work: impl FnOnce(&Engine) -> ApiResult<T> + Send + 'static,
) -> ApiResult<T> {
    let permit = engine.inflight.clone().try_acquire_owned().map_err(|_| {
        ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "overloaded",
            "Engine is busy; retry shortly.",
        )
    })?;
    let engine = engine.clone();
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work(&engine)
    })
    .await
    .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "internal", e.to_string()))?
}

/// 200 with the Arrow stream once the statement succeeded, else 202 with its
/// id for the client to poll.
fn arrow_or_pending(
    engine: &Engine,
    client: &Client,
    resp: Value,
    started: Instant,
) -> ApiResult<Response> {
    let id = statement_id(&resp)?;
    if statement_state(&resp) != "SUCCEEDED" {
        let body = json!({ "statementId": id, "state": statement_state(&resp) });
        return Ok((StatusCode::ACCEPTED, Json(body)).into_response());
    }
    let (bytes, rows) = client.collect_arrow(&resp, engine.settings.max_result_bytes, &|| false)?;
    let mut out = (StatusCode::OK, Bytes::from(bytes)).into_response();
    let h = out.headers_mut();
    h.insert(CONTENT_TYPE, HeaderValue::from_static(ARROW_MEDIA_TYPE));
    h.insert("x-row-count", HeaderValue::from(rows));
    h.insert(
        "x-duration-ms",
        HeaderValue::from(started.elapsed().as_millis() as u64),
    );
    if let Ok(v) = HeaderValue::from_str(&id) {
        h.insert("x-statement-id", v);
    }
    Ok(out)
}

async fn info(State(engine): State<AppState>) -> Json<Value> {
    let s = &engine.settings;
    let server = s.server_databricks.as_ref();
    Json(json!({
        "drivers": DRIVERS,
        "databricks": {
            "serverWarehouse": server.is_some(),
            "callerCredentials": s.allow_caller_credentials,
            "catalog": server.and_then(|d| d.catalog.clone()),
            "schema": server.and_then(|d| d.schema.clone()),
        },
        "limits": {
            "maxResultBytes": s.max_result_bytes,
            "pollSeconds": s.poll.as_secs(),
        },
    }))
}

async fn connect(
    State(engine): State<AppState>,
    Body(call): Body<EngineCall>,
) -> ApiResult<Json<Value>> {
    run(&engine, move |e| {
        e.client_for(&call)?.verify()?;
        Ok(Json(json!({
            "queryType": "databricks",
            "capabilities": { "cancel": true, "describe": true },
        })))
    })
    .await
}

async fn submit(
    State(engine): State<AppState>,
    Body(body): Body<ExecuteCall>,
) -> ApiResult<Response> {
    run(&engine, move |e| {
        let started = Instant::now();
        let client = e.client_for(&body.call)?;
        let params = to_statement_params(&body.sql, body.parameters.as_ref())?;
        let resp = client.submit(&body.sql, params, ResultMode::Arrow, e.settings.poll)?;
        let resp = client.wait(resp, started + e.settings.poll, None)?;
        arrow_or_pending(e, &client, resp, started)
    })
    .await
}

async fn poll(
    State(engine): State<AppState>,
    Path(id): Path<String>,
    Body(call): Body<EngineCall>,
) -> ApiResult<Response> {
    run(&engine, move |e| {
        let started = Instant::now();
        let client = e.client_for(&call)?;
        let resp = client.wait(client.status(&id)?, started + e.settings.poll, None)?;
        arrow_or_pending(e, &client, resp, started)
    })
    .await
}

async fn cancel(
    State(engine): State<AppState>,
    Path(id): Path<String>,
    Body(call): Body<EngineCall>,
) -> ApiResult<Json<Value>> {
    run(&engine, move |e| {
        e.client_for(&call)?.cancel(&id)?;
        Ok(Json(json!({ "canceled": true })))
    })
    .await
}

async fn script(
    State(engine): State<AppState>,
    Body(body): Body<ScriptCall>,
) -> ApiResult<StatusCode> {
    run(&engine, move |e| {
        let deadline = Instant::now() + e.settings.sync;
        e.client_for(&body.call)?.run_script(&body.sql, deadline)?;
        Ok(StatusCode::NO_CONTENT)
    })
    .await
}

async fn describe(
    State(engine): State<AppState>,
    Path(kind): Path<String>,
    Body(body): Body<DescribeCall>,
) -> ApiResult<Json<Value>> {
    if !matches!(
        kind.as_str(),
        "databases" | "schemas" | "tables" | "columns" | "table"
    ) {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "invalid_request",
            format!("unknown describe kind {kind:?}"),
        ));
    }
    run(&engine, move |e| {
        let deadline = Instant::now() + e.settings.sync;
        let client = e.client_for(&body.call)?;
        let to_json = |v: Result<Value, serde_json::Error>| {
            v.map(Json).map_err(|err| {
                ApiError::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    err.to_string(),
                )
            })
        };
        if kind == "databases" {
            return to_json(serde_json::to_value(client.describe_databases(deadline)?));
        }
        let database = body
            .database
            .as_deref()
            .filter(|d| !d.is_empty())
            .ok_or_else(|| ApiError::invalid("database is required"))?;
        let schema = body.schema.as_deref().filter(|s| !s.is_empty());
        if kind == "schemas" {
            return to_json(serde_json::to_value(
                client.describe_schemas(database, deadline)?,
            ));
        }
        if kind == "tables" {
            return to_json(serde_json::to_value(
                client.describe_tables(database, schema, deadline)?,
            ));
        }
        let table = body
            .table
            .as_deref()
            .filter(|t| !t.is_empty())
            .ok_or_else(|| ApiError::invalid("table is required"))?;
        if kind == "columns" {
            let schema = schema.unwrap_or(client.default_schema()).to_string();
            return to_json(serde_json::to_value(
                client.describe_columns(database, &schema, table, deadline)?,
            ));
        }
        to_json(serde_json::to_value(
            client.describe_table(database, schema, table, deadline)?,
        ))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::origin_allowed;

    #[test]
    fn origins() {
        for ok in [
            "https://trilogydata.dev",
            "https://trilogy-data.github.io",
            "http://localhost:5173",
            "http://127.0.0.1:8080",
            "app://.",
        ] {
            assert!(origin_allowed(ok, &[]), "{ok}");
        }
        for bad in [
            "https://evil.example",
            "https://trilogydata.dev.evil.example",
            "http://localhost:",
            "http://localhost:80/x",
            "http://localhost.evil.example:80",
        ] {
            assert!(!origin_allowed(bad, &[]), "{bad}");
        }
        assert!(origin_allowed(
            "https://studio.example",
            &["https://studio.example".into()]
        ));
    }
}
