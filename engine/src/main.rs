// trilogy-engine            serve (HOST, PORT; defaults 127.0.0.1:5680)
// trilogy-engine new-key ID mint an API key and its TRILOGY_ENGINE_API_KEYS entry

use std::net::SocketAddr;

use trilogy_engine::settings::{hash_key, new_key};
use trilogy_engine::{app, Settings};

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None | Some("serve") => serve().await,
        Some("new-key") => {
            let Some(id) = args.get(1).filter(|s| !s.contains([':', ','])) else {
                eprintln!(
                    "usage: trilogy-engine new-key <id>   (who the key is for; no ':' or ',')"
                );
                std::process::exit(2);
            };
            let key = new_key();
            println!("API key (give to the user, shown once): {key}");
            println!(
                "TRILOGY_ENGINE_API_KEYS entry:          {id}:{}",
                hash_key(&key)
            );
        }
        Some(other) => {
            eprintln!("unknown command {other:?}; use `serve` or `new-key <id>`");
            std::process::exit(2);
        }
    }
}

async fn serve() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(5680);
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .unwrap_or_else(|e| panic!("bad HOST/PORT {host}:{port}: {e}"));

    let settings = Settings::from_env();
    eprintln!(
        "engine: listening on {addr}; keys: {}, strict egress: {}, server warehouse: {}",
        settings.api_keys.len(),
        settings.policy.strict,
        settings.server_databricks.is_some(),
    );
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("bind {addr}: {e}"));
    axum::serve(listener, app(settings))
        .with_graceful_shutdown(shutdown())
        .await
        .expect("server");
}

async fn shutdown() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
}
