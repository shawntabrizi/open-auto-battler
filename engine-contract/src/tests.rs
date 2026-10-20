//! Native tests. Run from the repo root:
//!   CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path engine-contract/Cargo.toml --features std
//!
//! Why: third parties use this contract to check results. Its answer must
//! be the engine crate's answer, byte for byte, through the real ABI
//! dispatch path (selector, ABI `bytes` framing, SCALE payload).

use super::oab_engine_contract::{self, OabEngineContract};
use super::{NewGameInput, ReplayBattleInput, ResolveTurnInput};
use oab_engine::vectors::{arena_v2_config, asset_bundles, traces};
use parity_scale_codec::Encode;
use pvm_contract_sdk::{const_selector, MockHostBuilder, Outcome, ReturnFlags};

/// ABI-encode one `bytes` argument after `selector`.
fn calldata_bytes(sig: &str, arg: &[u8]) -> Vec<u8> {
    let mut d = const_selector(sig).to_vec();
    d.extend_from_slice(&word(32));
    d.extend_from_slice(&word(arg.len() as u64));
    d.extend_from_slice(arg);
    d.resize(d.len() + (32 - arg.len() % 32) % 32, 0);
    d
}

fn word(n: u64) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[24..].copy_from_slice(&n.to_be_bytes());
    w
}

/// Dispatch raw calldata like the runtime would; expect a normal return.
fn call(calldata: &[u8]) -> Vec<u8> {
    let mock = MockHostBuilder::new().caller([7; 20]).build();
    let mut c = OabEngineContract::with_host(mock);
    let sel: [u8; 4] = calldata[..4].try_into().unwrap();
    let mut buf = vec![0u8; 1 << 20];
    let mut out: &mut [u8] = &mut buf;
    match oab_engine_contract::route(&mut c, sel, &calldata[4..], &mut out) {
        Outcome::Return(n) => buf[..n].to_vec(),
        Outcome::Unhandled => panic!("selector not handled"),
    }
}

/// Dispatch raw calldata; expect a revert and return its data.
fn call_revert(calldata: &[u8]) -> Vec<u8> {
    let mock = MockHostBuilder::new().caller([7; 20]).build();
    let mut c = OabEngineContract::with_host(mock.clone());
    let sel: [u8; 4] = calldata[..4].try_into().unwrap();
    let mut buf = vec![0u8; 1 << 20];
    let mut out: &mut [u8] = &mut buf;
    let rv = mock.expect_revert(|| {
        oab_engine_contract::route(&mut c, sel, &calldata[4..], &mut out);
    });
    assert_eq!(rv.flags, ReturnFlags::REVERT);
    rv.data
}

/// The payload of an ABI `bytes` return (or error argument) at `offset_at`.
fn abi_bytes(ret: &[u8], offset_at: usize) -> Vec<u8> {
    let off = u64::from_be_bytes(ret[offset_at + 24..offset_at + 32].try_into().unwrap()) as usize
        + offset_at;
    let len = u64::from_be_bytes(ret[off + 24..off + 32].try_into().unwrap()) as usize;
    ret[off + 32..off + 32 + len].to_vec()
}

#[test]
fn version_and_hash_are_the_crate_constants() {
    let ret = call(&const_selector("engineVersion()"));
    assert_eq!(ret, word(oab_engine::ENGINE_VERSION as u64));
    let ret = call(&const_selector("vectorsHash()"));
    assert_eq!(ret, oab_engine::ENGINE_VECTORS_HASH);
}

#[test]
fn engine_contract_equals_engine_crate_on_the_whole_corpus() {
    let bundles = asset_bundles();
    let config = arena_v2_config();
    let mut checked = 0;
    for t in traces() {
        let bundle = bundles[t.case.set_id as usize].clone();
        let input: NewGameInput = (config.clone(), bundle.clone(), t.start_seed);
        let ret = call(&calldata_bytes("newGame(bytes)", &input.encode()));
        assert_eq!(abi_bytes(&ret, 0), t.start.encode(), "newGame");

        let mut state = t.start.clone();
        for s in &t.steps {
            let input: ResolveTurnInput = (
                config.clone(),
                bundle.clone(),
                state.clone(),
                s.action.clone(),
                s.opponent.clone(),
                s.battle_seed,
                s.next_shop_seed,
            );
            let calldata = calldata_bytes("resolveTurn(bytes)", &input.encode());
            match &s.output {
                Ok(out) => {
                    let ret = call(&calldata);
                    assert_eq!(abi_bytes(&ret, 0), out.encode(), "resolveTurn");
                    let replay: ReplayBattleInput = (
                        out.player_board.clone(),
                        s.opponent.clone(),
                        s.battle_seed,
                        bundle.clone(),
                        config.board_size,
                    );
                    let ret = call(&calldata_bytes("replayBattle(bytes)", &replay.encode()));
                    assert_eq!(abi_bytes(&ret, 0), out.events.encode(), "replayBattle");
                    state = out.state.clone();
                    checked += 1;
                }
                Err(e) => {
                    let ret = call_revert(&calldata);
                    assert_eq!(ret[..4], const_selector("InvalidTurn(bytes)"));
                    assert_eq!(
                        abi_bytes(&ret[4..], 0),
                        e.encode(),
                        "revert carries the rule"
                    );
                }
            }
        }
    }
    assert!(checked >= 60);
}

#[test]
fn malformed_input_reverts_with_bad_input() {
    for sig in [
        "newGame(bytes)",
        "resolveTurn(bytes)",
        "replayBattle(bytes)",
    ] {
        let ret = call_revert(&calldata_bytes(sig, &[1, 2, 3]));
        assert_eq!(ret, const_selector("BadInput()"));
    }
}
