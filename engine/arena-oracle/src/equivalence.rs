//! Engine == arena v2, case by case.
//!
//! Why: M1 moves the turn pipeline out of the arena into `oab-engine`. The
//! golden-vector hash is only a valid "version 1" if version 1 is what the
//! live arena does. This test runs the real arena methods (MockHost storage,
//! caller, block number, events) and the engine on the same inputs, and
//! requires equal start states, equal seeds, equal post-turn states, and an
//! equal `BattleReported` payload for every corpus turn.

use super::oab_arena::OabArena;
use super::{bracket_bytes, ArenaSession, BATTLE_REPORTED_TOPIC, DOM_GHOST};
use oab_battle::battle::BattleResult;
use oab_battle::types::GhostBoardUnit;
use oab_engine::vectors::{asset_bundles, traces, MAX_TURNS};
use oab_game::LocalGameState;
use parity_scale_codec::Encode;
use pvm_contract_sdk::{Bytes, MockHost, MockHostBuilder};

fn skey(domain: u8, k: &[u8]) -> [u8; 32] {
    let mut input = vec![domain];
    input.extend_from_slice(k);
    oab_engine::keccak256(&input)
}

fn to_local(s: &ArenaSession) -> LocalGameState {
    LocalGameState {
        bag: s.bag.clone(),
        hand: s.hand.clone(),
        board: s.board.clone(),
        mana_limit: s.mana_limit,
        shop_mana: s.shop_mana,
        round: s.round,
        lives: s.lives,
        wins: s.wins,
        phase: s.phase.clone(),
        next_card_id: s.next_card_id,
        game_seed: s.game_seed,
    }
}

fn session(c: &OabArena) -> ArenaSession {
    use parity_scale_codec::Decode;
    let b = c.get_game_state();
    ArenaSession::decode(&mut &b.0[..]).expect("active arena game")
}

/// The arena as `caller` at `block`, with all asset cards and sets 0..2
/// registered in order (so set ids equal the bundle ids).
fn arena_for(caller: [u8; 20], block: u64) -> (OabArena, MockHost) {
    let mock = MockHostBuilder::new()
        .caller(caller)
        .block_number(block)
        .build();
    let mut c = OabArena::with_host(mock.clone());
    c.new();
    for card in oab_assets::cards::get_all() {
        assert!(c.register_card(Bytes(card.encode())));
    }
    for (i, set) in oab_assets::sets::get_all().iter().enumerate() {
        assert!(c.register_set(i as u16, Bytes(set.encode())));
    }
    (c, mock)
}

fn report_payload(result: &BattleResult, wins: u8, lives: u8, round: u8, seed: u64, opp: &[GhostBoardUnit]) -> Vec<u8> {
    let mut d = vec![
        match result {
            BattleResult::Victory => 0u8,
            BattleResult::Defeat => 1,
            BattleResult::Draw => 2,
        },
        wins,
        lives,
        round,
    ];
    d.extend_from_slice(&seed.to_be_bytes());
    d.extend_from_slice(&opp.to_vec().encode());
    d
}

#[test]
fn engine_matches_arena_v2_on_every_corpus_turn() {
    let bundles = asset_bundles();
    let all = traces();
    assert_eq!(all.len(), 12);
    let mut turns = 0usize;
    for t in &all {
        let set_id = t.case.set_id;
        assert_eq!(bundles[set_id as usize].set_id, set_id);
        let (mut c, mock) = arena_for(t.case.caller, t.case.block);

        // Start: same seed (arena v2 seed policy) and same first shop.
        assert_eq!(c.start_game(set_id), t.start_seed, "start seed");
        let s = session(&c);
        assert_eq!(s.set_id, set_id);
        assert_eq!(to_local(&s).encode(), t.start.encode(), "start state");

        for step in &t.steps {
            let before = session(&c);
            // Force the opponent: a one-ghost (or empty) pool in the bracket
            // the arena reads for this turn.
            let pool: Vec<Vec<GhostBoardUnit>> = if step.opponent.is_empty() {
                vec![]
            } else {
                vec![step.opponent.clone()]
            };
            mock.set_raw_storage(
                skey(DOM_GHOST, &bracket_bytes(set_id, before.round, before.wins, before.lives)).to_vec(),
                pool.encode(),
            );
            let events_before = mock.events().len();
            let seed = c.submit_turn(Bytes(step.action.encode()));
            let after = session(&c);
            match &step.output {
                Err(_) => {
                    assert_eq!(seed, 0, "an invalid turn is rejected");
                    assert_eq!(after.encode(), before.encode(), "a rejected turn changes nothing");
                    assert_eq!(mock.events().len(), events_before, "a rejected turn reports nothing");
                }
                Ok(out) => {
                    turns += 1;
                    assert_eq!(seed, step.battle_seed, "battle seed");
                    assert_eq!(to_local(&after).encode(), out.state.encode(), "state after turn {turns}");
                    let ev = mock.events();
                    assert_eq!(ev.len(), events_before + 1);
                    let (topics, data) = &ev[ev.len() - 1];
                    assert_eq!(topics[0], BATTLE_REPORTED_TOPIC);
                    assert_eq!(
                        data,
                        &report_payload(&out.result, out.state.wins, out.state.lives, before.round, step.battle_seed, &step.opponent),
                        "BattleReported payload"
                    );
                }
            }
        }
        assert!(t.steps.len() <= MAX_TURNS + 1);
    }
    assert!(turns >= 60, "corpus too small: {turns} turns");
}
