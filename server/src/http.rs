//! HTTP server exposing the game as a REST API.
//!
//! Local mode endpoints (multi-session, keyed by agent_id):
//!   POST /reset   — Start a new game. Body: { "agent_id": "a0", "seed": N, "set_id": N }
//!   POST /shop    — Apply shop actions. Body: { "agent_id": "a0", "actions": [...] }
//!   POST /battle  — Run battle. Body: { "agent_id": "a0", "opponent": [...] }
//!   GET  /state?agent_id=a0 — Get game state for an agent.
//!   GET  /cards   — List all cards in the current set.
//!   GET  /sets    — List available card sets.
//!
//! Chain mode endpoints:
//!   POST /reset   — Start a new game on-chain.
//!   POST /submit  — Submit turn (shop + battle handled by chain).
//!   GET  /state, /cards, /sets — Same as local.

use std::collections::HashMap;
use std::sync::Mutex;

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::constructed::ConstructedMatch;
use crate::local::GameSession;
use crate::types::*;

/// Local mode backend — manages multiple game sessions keyed by agent_id.
pub struct LocalBackend {
    sessions: HashMap<String, GameSession>,
    constructed_matches: HashMap<String, ConstructedMatch>,
    default_set_id: u32,
}

impl LocalBackend {
    pub fn new(default_set_id: u32) -> Self {
        Self {
            sessions: HashMap::new(),
            constructed_matches: HashMap::new(),
            default_set_id,
        }
    }

    fn get_session(&self, agent_id: &str) -> Result<&GameSession, String> {
        self.sessions
            .get(agent_id)
            .ok_or_else(|| format!("No session for agent '{}'. Call POST /reset first.", agent_id))
    }

    fn get_session_mut(&mut self, agent_id: &str) -> Result<&mut GameSession, String> {
        self.sessions
            .get_mut(agent_id)
            .ok_or_else(|| format!("No session for agent '{}'. Call POST /reset first.", agent_id))
    }
}

/// Server backend — either local (multi-session) or on-chain (single session).
pub enum Backend {
    Local(LocalBackend),
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
    eprintln!("Endpoints (sealed):");
    eprintln!("  POST /reset   — Start new game {{ \"agent_id\": \"a0\", ... }}");
    eprintln!("  POST /shop    — Apply shop actions {{ \"agent_id\": \"a0\", \"actions\": [...] }}");
    eprintln!("  POST /battle  — Run battle {{ \"agent_id\": \"a0\", \"opponent\": [...] }}");
    eprintln!("  POST /submit  — Combined shop+battle (chain mode)");
    eprintln!("  GET  /state?agent_id=a0 — Get game state");
    eprintln!("  GET  /cards   — List all cards");
    eprintln!("  GET  /sets    — List available card sets");
    eprintln!("Endpoints (constructed):");
    eprintln!("  POST /constructed/create  — Create match {{ \"match_id\": \"m1\" }}");
    eprintln!("  POST /constructed/join    — Join match {{ \"match_id\": \"m1\", \"agent_id\": \"a0\", \"deck\": [...] }}");
    eprintln!("  POST /constructed/shop    — Shop {{ \"match_id\": \"m1\", \"agent_id\": \"a0\", \"actions\": [...] }}");
    eprintln!("  POST /constructed/battle  — Battle {{ \"match_id\": \"m1\" }}");
    eprintln!("  GET  /constructed/state?match_id=m1&agent_id=a0 — Get state");

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
        (Method::Get, "/state") => handle_get_state(request, backend),
        (Method::Get, "/cards") => handle_get_cards(backend),
        (Method::Get, "/sets") => handle_get_sets(backend),
        // Constructed mode
        (Method::Post, "/constructed/create") => handle_constructed_create(request, backend),
        (Method::Post, "/constructed/join") => handle_constructed_join(request, backend),
        (Method::Post, "/constructed/shop") => handle_constructed_shop(request, backend),
        (Method::Post, "/constructed/battle") => handle_constructed_battle(request, backend),
        (Method::Get, "/constructed/state") => handle_constructed_state(request, backend),
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
            agent_id: "default".into(),
            seed: None,
            set_id: None,
        }
    } else {
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?
    };

    let seed = req.seed.unwrap_or_else(generate_seed);

    let mut b = backend.lock().unwrap();
    let state = match &mut *b {
        Backend::Local(local) => {
            let set_id = req.set_id.unwrap_or(local.default_set_id);
            let session = GameSession::new(seed, set_id).map_err(|e| (400, e))?;
            local.sessions.insert(req.agent_id, session);
            let session = local.sessions.values().last().unwrap();
            session.get_state()
        }
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.reset(seed, req.set_id).map_err(|e| (400, e))?,
    };
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

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
        Backend::Local(local) => {
            let session = local.get_session_mut(&req.agent_id).map_err(|e| (400, e))?;
            session.shop(&action).map_err(|e| (400, e))?
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => return Err((400, "Use POST /submit for chain mode".into())),
    };

    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

fn handle_battle(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: BattleRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let mut b = backend.lock().unwrap();
    let result = match &mut *b {
        Backend::Local(local) => {
            let session = local.get_session_mut(&req.agent_id).map_err(|e| (400, e))?;
            session.battle(&req.opponent).map_err(|e| (400, e))?
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => return Err((400, "Use POST /submit for chain mode".into())),
    };

    serde_json::to_string(&result).map_err(|e| (500, e.to_string()))
}

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

fn handle_get_state(
    request: &Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let agent_id = parse_query_param(request.url(), "agent_id")
        .unwrap_or_else(|| "default".to_string());

    let b = backend.lock().unwrap();
    let state = match &*b {
        Backend::Local(local) => {
            let session = local.get_session(&agent_id).map_err(|e| (400, e))?;
            session.get_state()
        }
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_state(),
    };
    serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
}

fn handle_get_cards(backend: &Mutex<Backend>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let cards = match &*b {
        Backend::Local(local) => {
            // Cards are global — use any session
            let session = local
                .sessions
                .values()
                .next()
                .ok_or_else(|| (400, "No sessions. Call POST /reset first.".to_string()))?;
            session.get_cards()
        }
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_cards(),
    };
    serde_json::to_string(&cards).map_err(|e| (500, e.to_string()))
}

fn handle_get_sets(backend: &Mutex<Backend>) -> Result<String, (u16, String)> {
    let b = backend.lock().unwrap();
    let sets = match &*b {
        Backend::Local(local) => {
            let session = local
                .sessions
                .values()
                .next()
                .ok_or_else(|| (400, "No sessions. Call POST /reset first.".to_string()))?;
            session.get_sets()
        }
        #[cfg(feature = "chain")]
        Backend::Chain(session) => session.get_sets(),
    };
    serde_json::to_string(&sets).map_err(|e| (500, e.to_string()))
}

/// Parse a query parameter from a URL string.
fn parse_query_param(url: &str, key: &str) -> Option<String> {
    let query = url.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next()? == key {
            return kv.next().map(|v| v.to_string());
        }
    }
    None
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

// ── Constructed mode handlers ──

fn handle_constructed_create(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: ConstructedCreateRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let mut b = backend.lock().unwrap();
    match &mut *b {
        Backend::Local(local) => {
            let set_id = req.set_id.unwrap_or(local.default_set_id);
            if local.constructed_matches.contains_key(&req.match_id) {
                return Err((400, format!("Match '{}' already exists", req.match_id)));
            }
            let m = ConstructedMatch::new(req.match_id.clone(), set_id);
            local.constructed_matches.insert(req.match_id.clone(), m);
            let resp = ConstructedCreateResponse {
                match_id: req.match_id,
                set_id,
            };
            serde_json::to_string(&resp).map_err(|e| (500, e.to_string()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => Err((400, "Constructed mode not supported in chain mode".into())),
    }
}

fn handle_constructed_join(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: ConstructedJoinRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let seed = req.seed.unwrap_or_else(generate_seed);

    let mut b = backend.lock().unwrap();
    match &mut *b {
        Backend::Local(local) => {
            let m = local
                .constructed_matches
                .get_mut(&req.match_id)
                .ok_or_else(|| (404, format!("Match '{}' not found", req.match_id)))?;
            let state = m.join(req.agent_id, req.deck, seed).map_err(|e| (400, e))?;
            serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => Err((400, "Constructed mode not supported in chain mode".into())),
    }
}

fn handle_constructed_shop(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: ConstructedShopRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let action = oab_core::types::CommitTurnAction {
        actions: req.actions,
    };

    let mut b = backend.lock().unwrap();
    match &mut *b {
        Backend::Local(local) => {
            let m = local
                .constructed_matches
                .get_mut(&req.match_id)
                .ok_or_else(|| (404, format!("Match '{}' not found", req.match_id)))?;
            let state = m.shop(&req.agent_id, &action).map_err(|e| (400, e))?;
            serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => Err((400, "Constructed mode not supported in chain mode".into())),
    }
}

fn handle_constructed_battle(
    request: &mut Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let body = read_body(request)?;
    let req: ConstructedBattleRequest =
        serde_json::from_str(&body).map_err(|e| (400, format!("Invalid JSON: {}", e)))?;

    let mut b = backend.lock().unwrap();
    match &mut *b {
        Backend::Local(local) => {
            let m = local
                .constructed_matches
                .get_mut(&req.match_id)
                .ok_or_else(|| (404, format!("Match '{}' not found", req.match_id)))?;
            let results = m.battle().map_err(|e| (400, e))?;
            let resp = ConstructedBattleResponse { results };
            serde_json::to_string(&resp).map_err(|e| (500, e.to_string()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => Err((400, "Constructed mode not supported in chain mode".into())),
    }
}

fn handle_constructed_state(
    request: &Request,
    backend: &Mutex<Backend>,
) -> Result<String, (u16, String)> {
    let match_id = parse_query_param(request.url(), "match_id")
        .ok_or_else(|| (400, "Missing match_id query parameter".to_string()))?;
    let agent_id = parse_query_param(request.url(), "agent_id")
        .ok_or_else(|| (400, "Missing agent_id query parameter".to_string()))?;

    let b = backend.lock().unwrap();
    match &*b {
        Backend::Local(local) => {
            let m = local
                .constructed_matches
                .get(&match_id)
                .ok_or_else(|| (404, format!("Match '{}' not found", match_id)))?;
            let state = m.get_state(&agent_id).map_err(|e| (400, e))?;
            serde_json::to_string(&state).map_err(|e| (500, e.to_string()))
        }
        #[cfg(feature = "chain")]
        Backend::Chain(_) => Err((400, "Constructed mode not supported in chain mode".into())),
    }
}

pub fn generate_seed() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(42)
}
