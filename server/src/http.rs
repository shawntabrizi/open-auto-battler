//! HTTP server exposing the game as a REST API.
//!
//! Endpoints:
//!   POST /reset  — Start a new game. Body: { "seed": N, "set_id": N } (optional)
//!   POST /step   — Submit turn actions. Body: { "actions": [...] }
//!   GET  /state  — Get current game state.

use std::sync::Mutex;

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::game::GameBackend;
use crate::types::*;

/// Run the HTTP game server with the given backend.
pub fn serve(port: u16, backend: Box<dyn GameBackend>) -> std::io::Result<()> {
    let addr = format!("0.0.0.0:{}", port);
    let server = Server::http(&addr)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::AddrInUse, e.to_string()))?;

    eprintln!("OAB Server listening on http://localhost:{}", port);
    eprintln!("Endpoints:");
    eprintln!("  POST /reset  — Start new game {{ \"seed\": N, \"set_id\": N }}");
    eprintln!("  POST /step   — Submit actions {{ \"actions\": [...] }}");
    eprintln!("  GET  /state  — Get current game state");
    eprintln!("  GET  /cards  — List all cards in the current set");
    eprintln!("  GET  /sets   — List available card sets");

    let backend = Mutex::new(backend);

    for mut request in server.incoming_requests() {
        let result = handle_request(&mut request, &backend);

        let response = match result {
            Ok(json) => json_response(200, &json),
            Err((status, msg)) => {
                let err = ErrorResponse { error: msg };
                json_response(status, &serde_json::to_string(&err).unwrap())
            }
        };

        let _ = request.respond(response);
    }

    Ok(())
}

fn handle_request(
    request: &mut Request,
    backend: &Mutex<Box<dyn GameBackend>>,
) -> Result<String, (u16, String)> {
    let path = request.url().split('?').next().unwrap_or("");
    let method = request.method().clone();

    match (method, path) {
        (Method::Post, "/reset") => handle_reset(request, backend),
        (Method::Post, "/submit") => handle_step(request, backend),
        (Method::Get, "/state") => handle_get_state(backend),
        (Method::Get, "/cards") => handle_get_cards(backend),
        (Method::Get, "/sets") => handle_get_sets(backend),
        _ => Err((404, format!("Not found: {} {}", request.method(), path))),
    }
}

fn handle_reset(
    request: &mut Request,
    backend: &Mutex<Box<dyn GameBackend>>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;

    let req: ResetRequest = if body.trim().is_empty() {
        ResetRequest {
            seed: None,
            set_id: None,
            opponents: None,
        }
    } else {
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?
    };

    let seed = req.seed.unwrap_or_else(generate_seed);

    // Convert string-keyed opponent map to i32-keyed
    let opponents = req.opponents.map(|map| {
        map.into_iter()
            .filter_map(|(k, v)| k.parse::<i32>().ok().map(|round| (round, v)))
            .collect()
    });

    let mut b = backend.lock().unwrap();
    let state = b.reset(seed, req.set_id, opponents).map_err(|e| (400, e))?;
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

fn handle_step(
    request: &mut Request,
    backend: &Mutex<Box<dyn GameBackend>>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: StepRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let action = req.into();
    let mut b = backend.lock().unwrap();
    let result = b.step(&action).map_err(|e| (400, e))?;

    serde_json::to_string(&result).map_err(|e| (500, e.to_string()))
}

fn handle_get_state(backend: &Mutex<Box<dyn GameBackend>>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let state = b.get_state();
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

fn handle_get_cards(backend: &Mutex<Box<dyn GameBackend>>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let cards = b.get_cards();
    serde_json::to_string(&cards).map_err(|e| (500, e.to_string()))
}

fn handle_get_sets(backend: &Mutex<Box<dyn GameBackend>>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let sets = b.get_sets();
    serde_json::to_string(&sets).map_err(|e| (500, e.to_string()))
}

fn read_body(request: &mut Request) -> Result<String, (u16, String)> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|e| (400, format!("Failed to read body: {}", e)))?;
    Ok(body)
}

fn json_response(status: u16, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let data = body.as_bytes().to_vec();
    let len = data.len();
    let header = Header::from_bytes("Content-Type", "application/json").unwrap();
    Response::new(
        StatusCode(status),
        vec![header],
        std::io::Cursor::new(data),
        Some(len),
        None,
    )
}

pub fn generate_seed() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(42)
}
