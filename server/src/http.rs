//! HTTP server exposing the game as a REST API.
//!
//! Local mode endpoints:
//!   POST /reset   — Start a new game. Body: { "seed": N, "set_id": N } (optional)
//!   POST /shop    — Apply shop actions. Body: { "actions": [...] }
//!   POST /battle  — Run battle. Body: { "opponent": [...] }
//!   GET  /state   — Get current game state.
//!   GET  /cards   — List all cards in the current set.
//!   GET  /sets    — List available card sets.
//!
//! Chain mode endpoints:
//!   POST /reset   — Start a new game on-chain.
//!   POST /submit  — Submit turn (shop + battle handled by chain).
//!   GET  /state, /cards, /sets — Same as local.

use std::sync::Mutex;

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::local::GameSession;
use crate::types::*;

/// Server backend — either local or on-chain.
pub enum Backend {
    Local(GameSession),
    #[cfg(feature = "chain")]
    Chain(crate::chain::ChainGameSession),
}

/// Run the HTTP game server with the given backend.
pub fn serve(port: u16, backend: Backend) -> std::io::Result<()> {
    let addr = format!("0.0.0.0:{}", port);
    let server = Server::http(&addr)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::AddrInUse, e.to_string()))?;

    let mode = match &backend {
        Backend::Local(_) => "local",
        #[cfg(feature = "chain")]
        Backend::Chain(_) => "on-chain",
    };

    eprintln!("OAB Server listening on http://localhost:{} ({})", port, mode);
    eprintln!("Endpoints:");
    eprintln!("  POST /reset   — Start new game");
    eprintln!("  POST /shop    — Apply shop actions {{ \"actions\": [...] }}");
    eprintln!("  POST /battle  — Run battle {{ \"opponent\": [...] }}");
    eprintln!("  POST /submit  — Combined shop+battle (chain mode)");
    eprintln!("  GET  /state   — Get current game state");
    eprintln!("  GET  /cards   — List all cards");
    eprintln!("  GET  /sets    — List available card sets");

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
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let path = request.url().split('?').next().unwrap_or("");
    let method = request.method().clone();

    match (method, path) {
        (Method::Post, "/reset") => handle_reset(request, backend),
        (Method::Post, "/shop") => handle_shop(request, backend),
        (Method::Post, "/battle") => handle_battle(request, backend),
        (Method::Post, "/submit") => handle_submit(request, backend),
        (Method::Get, "/state") => handle_get_state(backend),
        (Method::Get, "/cards") => handle_get_cards(backend),
        (Method::Get, "/sets") => handle_get_sets(backend),
        _ => Err((404, format!("Not found: {} {}", request.method(), path))),
    }
}

fn handle_reset(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;

    let req: ResetRequest = if body.trim().is_empty() {
        ResetRequest {
            seed: None,
            set_id: None,
        }
    } else {
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?
    };

    let seed = req.seed.unwrap_or_else(generate_seed);

    let mut b = backend.lock().unwrap();
    let state = match &mut *b {
        Backend::Local(session) => session.reset(seed, req.set_id).map_err(|e| (400, e))?,
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.reset(seed, req.set_id).map_err(|e| (400, e))?,
    };
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

/// POST /shop — Apply shop actions, return post-shop state (local mode).
fn handle_shop(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: ShopRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let action = oab_core::types::CommitTurnAction {
        actions: req.actions,
    };

    let mut b = backend.lock().unwrap();
    let state = match &mut *b {
        Backend::Local(session) => session.shop(&action).map_err(|e| (400, e))?,
        #[cfg(feature = "chain")]
        Backend::Chain(_) => return Err((400, "Use POST /submit for chain mode".into())),
    };

    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

/// POST /battle — Run battle against provided opponent (local mode).
fn handle_battle(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: BattleRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let mut b = backend.lock().unwrap();
    let result = match &mut *b {
        Backend::Local(session) => session.battle(&req.opponent).map_err(|e| (400, e))?,
        #[cfg(feature = "chain")]
        Backend::Chain(_) => return Err((400, "Use POST /submit for chain mode".into())),
    };

    serde_json::to_string(&result).map_err(|e| (500, e.to_string()))
}

/// POST /submit — Combined shop+battle (chain mode, or legacy).
fn handle_submit(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: StepRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let action = oab_core::types::CommitTurnAction {
        actions: req.actions,
    };

    let mut b = backend.lock().unwrap();
    let result = match &mut *b {
        Backend::Local(_) => {
            return Err((400, "Use POST /shop + POST /battle for local mode".into()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.step(&action).map_err(|e| (400, e))?,
    };

    serde_json::to_string(&result).map_err(|e| (500, e.to_string()))
}

fn handle_get_state(backend: &Mutex<Backend>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let state = match &*b {
        Backend::Local(session) => session.get_state(),
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_state(),
    };
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

fn handle_get_cards(backend: &Mutex<Backend>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let cards = match &*b {
        Backend::Local(session) => session.get_cards(),
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_cards(),
    };
    serde_json::to_string(&cards).map_err(|e| (500, e.to_string()))
}

fn handle_get_sets(backend: &Mutex<Backend>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let sets = match &*b {
        Backend::Local(session) => session.get_sets(),
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_sets(),
    };
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
