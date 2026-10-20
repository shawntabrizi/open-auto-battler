use super::*;
use crate::vectors::{arena_v2_config, asset_bundles, traces, vectors_hash};
use oab_battle::state::CardSetEntry;

fn hex(b: &[u8]) -> alloc::string::String {
    b.iter().map(|x| alloc::format!("{x:02x}")).collect()
}

// Version guard. A deployed engine contract, every stored game, and every
// frontend WASM bundle name the engine by ENGINE_VERSION. If the rules
// change under the same number, an old game would resolve differently on a
// new build and a replay would show a battle that never happened.
#[test]
fn golden_vectors_match_engine_version() {
    let got = vectors_hash();
    assert_eq!(
        got,
        ENGINE_VECTORS_HASH,
        "engine behaviour changed (vectors hash 0x{}). Append a new ENGINE_HISTORY \
         entry with version {} and this hash; never edit a released entry.",
        hex(&got),
        ENGINE_VERSION + 1
    );
}

// One version means one behaviour. Versions count up by one and no two
// versions share a hash (a shared hash would mean a bump with no change, or
// a change that was not recorded).
#[test]
fn engine_history_is_append_only_and_unique() {
    assert!(!ENGINE_HISTORY.is_empty());
    for (i, (v, h)) in ENGINE_HISTORY.iter().enumerate() {
        assert_eq!(*v, i as u32 + 1, "versions are 1, 2, 3, ... in order");
        for (v2, h2) in &ENGINE_HISTORY[i + 1..] {
            assert_ne!(h, h2, "versions {v} and {v2} claim the same behaviour");
        }
    }
    assert_eq!(ENGINE_VERSION, ENGINE_HISTORY.last().unwrap().0);
}

// The hash covers real play: wins, losses, draws, shop actions, an invalid
// turn, and a finished game. A corpus without these would let a rule change
// slip through with the same hash.
#[test]
fn corpus_exercises_every_outcome() {
    let all = traces();
    assert_eq!(all.len(), 12, "four cases on each of sets 0, 1, 2");
    let steps: Vec<_> = all.iter().flat_map(|t| t.steps.iter()).collect();
    let ok: Vec<_> = steps
        .iter()
        .filter_map(|s| s.output.as_ref().ok())
        .collect();
    for want in [
        BattleResult::Victory,
        BattleResult::Defeat,
        BattleResult::Draw,
    ] {
        assert!(ok.iter().any(|o| o.result == want), "no {want:?} in corpus");
    }
    assert!(steps.iter().any(|s| s.output.is_err()), "no invalid turn");
    assert!(
        ok.iter().any(|o| o.state.phase == GamePhase::Completed),
        "no finished game"
    );
    assert!(steps.iter().any(|s| s
        .action
        .actions
        .iter()
        .any(|a| matches!(a, TurnAction::PlayFromHand { .. }))));
    assert!(steps.iter().any(|s| s
        .action
        .actions
        .iter()
        .any(|a| matches!(a, TurnAction::BurnFromHand { .. }))));
}

use oab_battle::types::TurnAction;

// Replay is how a client or an auditor shows a battle from chain data alone
// (`BattleReport.player_board`, opponent, seed). It must give exactly the
// events the turn produced.
#[test]
fn replay_battle_reproduces_every_turn() {
    let bundles = asset_bundles();
    let config = arena_v2_config();
    for t in traces() {
        let pool = bundles[t.case.set_id as usize].card_pool();
        for s in &t.steps {
            let Ok(out) = &s.output else { continue };
            let replay = replay_battle(
                &out.player_board,
                &s.opponent,
                s.battle_seed,
                &pool,
                config.board_size as usize,
            );
            assert_eq!(replay.encode(), out.events.encode());
            assert_eq!(battle_result(&replay), out.result);
        }
    }
}

// A finished game must not take more turns: the mode would otherwise let a
// player keep playing after the run was decided.
#[test]
fn resolve_turn_rejects_a_finished_game() {
    let bundle = &asset_bundles()[0];
    let config = arena_v2_config();
    let mut state = new_game(&config, bundle, 7);
    state.phase = GamePhase::Completed;
    let out = resolve_turn(TurnInput {
        config: &config,
        pool: &bundle.card_pool(),
        state,
        action: CommitTurnAction { actions: vec![] },
        opponent: vec![],
        battle_seed: 1,
        next_shop_seed: 2,
    });
    assert!(matches!(out, Err(GameError::WrongPhase)));
}

// The set hash pins content. A mode caches a bundle and trusts it because
// the hash matches Content; so any change to a card, the rarity table, or
// the set id must change the hash.
#[test]
fn bundle_hash_binds_every_part_of_the_content() {
    let base = asset_bundles()[1].clone();
    let h = base.hash();

    let mut card = base.clone();
    card.cards[3].stats.attack += 1;
    assert_ne!(card.hash(), h, "a card stat change must change the hash");

    let mut rarity = base.clone();
    rarity.set.cards[0].rarity = rarity.set.cards[0].rarity.wrapping_add(1);
    assert_ne!(rarity.hash(), h, "a rarity change must change the hash");

    let mut id = base.clone();
    id.set_id = 7;
    assert_ne!(
        id.hash(),
        h,
        "the same cards under another id are another set"
    );

    assert_eq!(
        base.hash(),
        keccak256(&base.encode()),
        "hash = keccak(SCALE)"
    );
}

// One set has one byte form, so Content and every mode compute one hash.
#[test]
fn bundle_build_is_canonical_and_complete() {
    let cards = oab_assets::cards::get_all();
    let lookup = |id: CardId| cards.iter().find(|c| c.id == id).cloned();
    let set = CardSet {
        cards: vec![
            CardSetEntry {
                card_id: cards[2].id,
                rarity: 1,
            },
            CardSetEntry {
                card_id: cards[0].id,
                rarity: 0,
            },
            CardSetEntry {
                card_id: cards[2].id,
                rarity: 5,
            },
        ],
    };
    let b = SetBundle::build(3, set.clone(), lookup).unwrap();
    let ids: Vec<_> = b.cards.iter().map(|c| c.id).collect();
    assert_eq!(
        ids,
        vec![cards[2].id, cards[0].id],
        "first appearance, no duplicates"
    );

    let mut missing = set;
    missing.cards.push(CardSetEntry {
        card_id: CardId(60_000),
        rarity: 1,
    });
    assert!(
        SetBundle::build(3, missing, lookup).is_none(),
        "a set with an unknown card cannot be played"
    );
    assert!(SetBundle::build(3, CardSet { cards: vec![] }, lookup).is_none());
}
