//! Build the M1 deploy plan as JSON for `scripts/m1/*.mjs`.
//!
//!   cargo run -p oab-plan -- content <OUT.json>   # Content publish calls + expected reads
//!   cargo run -p oab-plan -- engine  <OUT.json>   # engine contract calls + expected returns
//!
//! All calldata and every expected byte string come from the Rust crates, so
//! the node scripts only submit, read, and compare.

mod house_ghosts;

use oab_battle::state::CardSet;
use oab_engine::vectors::{arena_v2_config, asset_bundles, traces};
use oab_protocol::{ghosts_hash, keccak256};
use parity_scale_codec::Encode;
use serde_json::{json, Value};

fn hex(b: &[u8]) -> String {
    let mut s = String::from("0x");
    for x in b {
        s.push_str(&format!("{x:02x}"));
    }
    s
}

fn selector(sig: &str) -> Vec<u8> {
    keccak256(sig.as_bytes())[..4].to_vec()
}

fn word(n: u64) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[24..].copy_from_slice(&n.to_be_bytes());
    w
}

/// ABI tail of a dynamic `bytes`/`string`: length word + padded data.
fn tail(data: &[u8]) -> Vec<u8> {
    let mut t = word(data.len() as u64).to_vec();
    t.extend_from_slice(data);
    t.resize(t.len() + (32 - data.len() % 32) % 32, 0);
    t
}

/// Calldata for `sig` whose arguments are all dynamic (`bytes`/`string`).
fn call_dynamic(sig: &str, args: &[&[u8]]) -> Vec<u8> {
    let mut out = selector(sig);
    let mut tails = Vec::new();
    let head_len = 32 * args.len();
    for a in args {
        out.extend_from_slice(&word((head_len + tails.len()) as u64));
        tails.extend(tail(a));
    }
    out.extend(tails);
    out
}

/// Calldata for `sig(uint16)`.
fn call_u16(sig: &str, v: u16) -> Vec<u8> {
    let mut out = selector(sig);
    out.extend_from_slice(&word(v as u64));
    out
}

/// ABI return of one `bytes` value.
fn ret_bytes(data: &[u8]) -> Vec<u8> {
    let mut out = word(32).to_vec();
    out.extend(tail(data));
    out
}

fn content_plan() -> Value {
    let cards = oab_assets::cards::get_all();
    let set_meta = oab_assets::sets::get_all_metas();
    let bundles = asset_bundles();
    let sets: Vec<CardSet> = oab_assets::sets::get_all();
    let card_items: Vec<Value> = cards
        .iter()
        .map(|c| {
            json!({
                "id": c.id.0,
                "scale": hex(&c.encode()),
                "publish": hex(&call_dynamic("publishCard(bytes)", &[&c.encode()])),
                "get": hex(&call_u16("getCard(uint16)", c.id.0)),
                "getReturn": hex(&ret_bytes(&c.encode())),
            })
        })
        .collect();
    let set_items: Vec<Value> = bundles
        .iter()
        .enumerate()
        .map(|(i, b)| {
            let id = i as u16;
            assert_eq!(b.set_id, id);
            assert_eq!(b.set, sets[i]);
            let name = set_meta
                .iter()
                .find(|m| m.id == id as u32)
                .map(|m| m.name.to_string())
                .expect("set name");
            let ghosts = house_ghosts::starter(b);
            let set_scale = b.set.encode();
            let ghosts_scale = ghosts.encode();
            json!({
                "id": id,
                "name": name,
                "cards": b.cards.len(),
                "ghosts": ghosts.len(),
                "setHash": hex(&b.hash()),
                "ghostsHash": hex(&ghosts_hash(&ghosts)),
                "bundleBytes": b.encode().len(),
                "publish": hex(&call_dynamic(
                    "publishSet(string,bytes,bytes)",
                    &[name.as_bytes(), &set_scale, &ghosts_scale]
                )),
                "reads": [
                    { "label": "setHash", "call": hex(&call_u16("setHash(uint16)", id)), "expect": hex(&b.hash()) },
                    { "label": "getSet", "call": hex(&call_u16("getSet(uint16)", id)), "expect": hex(&ret_bytes(&set_scale)) },
                    { "label": "getSetBundle", "call": hex(&call_u16("getSetBundle(uint16)", id)), "expect": hex(&ret_bytes(&b.encode())) },
                    { "label": "getHouseGhosts", "call": hex(&call_u16("getHouseGhosts(uint16)", id)), "expect": hex(&ret_bytes(&ghosts_scale)) },
                ],
                "getSetRecord": hex(&call_u16("getSetRecord(uint16)", id)),
            })
        })
        .collect();
    json!({
        "cards": card_items,
        "sets": set_items,
        "setCount": hex(&selector("setCount()")),
        "adminAddress": hex(&selector("adminAddress()")),
    })
}

fn engine_plan() -> Value {
    let bundles = asset_bundles();
    let config = arena_v2_config();
    let mut checks = Vec::new();
    let mut busiest: Option<(usize, Value)> = None;
    for t in traces() {
        let bundle = bundles[t.case.set_id as usize].clone();
        let input = (config.clone(), bundle.clone(), t.start_seed).encode();
        checks.push(json!({
            "label": format!("newGame set {} seed {}", t.case.set_id, t.start_seed),
            "call": hex(&call_dynamic("newGame(bytes)", &[&input])),
            "expect": hex(&ret_bytes(&t.start.encode())),
            "revert": false,
        }));
        let mut state = t.start.clone();
        for (i, s) in t.steps.iter().enumerate() {
            let input = (
                config.clone(),
                bundle.clone(),
                state.clone(),
                s.action.clone(),
                s.opponent.clone(),
                s.battle_seed,
                s.next_shop_seed,
            )
                .encode();
            let call = hex(&call_dynamic("resolveTurn(bytes)", &[&input]));
            let label = format!(
                "resolveTurn set {} round {} step {}",
                t.case.set_id, state.round, i
            );
            match &s.output {
                Ok(out) => {
                    let check = json!({
                        "label": label,
                        "call": call,
                        "expect": hex(&ret_bytes(&out.encode())),
                        "revert": false,
                        "events": out.events.len(),
                        "units": out.player_board.len() + s.opponent.len(),
                    });
                    if busiest
                        .as_ref()
                        .map(|(n, _)| out.events.len() > *n)
                        .unwrap_or(true)
                    {
                        busiest = Some((out.events.len(), check.clone()));
                    }
                    checks.push(check);
                    let replay = (
                        out.player_board.clone(),
                        s.opponent.clone(),
                        s.battle_seed,
                        bundle.clone(),
                        config.board_size,
                    )
                        .encode();
                    checks.push(json!({
                        "label": format!("replayBattle set {} round {}", t.case.set_id, state.round),
                        "call": hex(&call_dynamic("replayBattle(bytes)", &[&replay])),
                        "expect": hex(&ret_bytes(&out.events.encode())),
                        "revert": false,
                    }));
                    state = out.state.clone();
                }
                Err(e) => {
                    let mut data = selector("InvalidTurn(bytes)");
                    data.extend(ret_bytes(&e.encode()));
                    checks.push(json!({
                        "label": label,
                        "call": call,
                        "expect": hex(&data),
                        "revert": true,
                    }));
                }
            }
        }
    }
    // Measurement turns: a full late-round board (house ghost round 10,
    // variant 0) against another (variant 1), with an empty shop action.
    let mut measure = Vec::new();
    for bundle in &bundles {
        let ghosts = house_ghosts::starter(bundle);
        let late: Vec<_> = ghosts.iter().filter(|g| g.round == 10).collect();
        let mut state = oab_engine::new_game(&config, bundle, 42);
        state.round = 10;
        state.mana_limit = config.mana_limit_for_round(10);
        for (slot, u) in late[0].board.iter().enumerate() {
            state.board[slot] = Some(oab_battle::types::BoardUnit {
                card_id: u.card_id,
                perm_attack: u.perm_attack,
                perm_health: u.perm_health,
            });
        }
        let action = oab_battle::types::CommitTurnAction { actions: vec![] };
        let opponent = late[1].board.clone();
        let out = oab_engine::resolve_turn(oab_engine::TurnInput {
            config: &config,
            pool: &bundle.card_pool(),
            state: state.clone(),
            action: action.clone(),
            opponent: opponent.clone(),
            battle_seed: 7,
            next_shop_seed: 8,
        })
        .expect("measurement turn is valid");
        let input = (
            config.clone(),
            bundle.clone(),
            state,
            action,
            opponent,
            7u64,
            8u64,
        )
            .encode();
        measure.push(json!({
            "label": format!("resolveTurn 5v5 round 10 set {}", bundle.set_id),
            "call": hex(&call_dynamic("resolveTurn(bytes)", &[&input])),
            "expect": hex(&ret_bytes(&out.encode())),
            "revert": false,
            "events": out.events.len(),
            "inputBytes": input.len(),
            "outputBytes": out.encode().len(),
        }));
    }
    json!({
        "measure": measure,
        "engineVersion": oab_engine::ENGINE_VERSION,
        "vectorsHash": hex(&oab_engine::ENGINE_VECTORS_HASH),
        "versionCall": hex(&selector("engineVersion()")),
        "hashCall": hex(&selector("vectorsHash()")),
        "checks": checks,
        "busiest": busiest.map(|(_, v)| v),
    })
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (kind, out) = match (args.get(1), args.get(2)) {
        (Some(k), Some(o)) => (k.as_str(), o.as_str()),
        _ => {
            eprintln!("usage: oab-plan <content|engine> <OUT.json>");
            std::process::exit(1);
        }
    };
    let plan = match kind {
        "content" => content_plan(),
        "engine" => engine_plan(),
        _ => {
            eprintln!("unknown plan {kind}");
            std::process::exit(1);
        }
    };
    std::fs::write(out, serde_json::to_string_pretty(&plan).unwrap()).unwrap();
    eprintln!("wrote {out}");
}
