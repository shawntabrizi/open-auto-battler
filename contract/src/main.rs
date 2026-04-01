//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! A smart contract implementing the sealed arena game mode on PolkaVM.
//! Players start a game with a card set, submit turns each round (shop actions + battle),
//! and play until they accumulate enough wins or lose all lives.
//!
//! ## Functions (Ethereum ABI)
//!
//! - `startGame(bytes,uint64)` — Start a new arena game.
//!   Params: SCALE-encoded CardSet, seed nonce.
//!   The card pool must be passed in once and is stored for the session.
//!
//! - `submitTurn(bytes,bytes)` — Submit shop actions and an enemy board to battle.
//!   Params: SCALE-encoded CommitTurnAction, SCALE-encoded enemy Vec<CombatUnit>.
//!
//! - `getGameState()` -> `bytes` — Read the caller's current game state.
//!
//! - `abandonGame()` — Forfeit the current game.

#![no_main]
#![no_std]

extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::vec;
use alloc::vec::Vec;
use parity_scale_codec::{Decode, Encode};
use uapi::{HostFn, HostFnImpl as api, ReturnFlags, StorageFlags};

use oab_battle::battle::{resolve_battle, BattleResult, CombatUnit};
use oab_battle::rng::{BattleRng, XorShiftRng};
use oab_battle::state::CardSet;
use oab_battle::types::*;
use oab_battle::{apply_shop_start_triggers, verify_and_apply_turn};

// ── Panic handler ────────────────────────────────────────────────────────────

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    unsafe {
        core::arch::asm!("unimp");
        core::hint::unreachable_unchecked();
    }
}

// ── Allocator ────────────────────────────────────────────────────────────────

const HEAP_SIZE: usize = 120 * 1024;

#[repr(transparent)]
struct SyncHeap(core::cell::UnsafeCell<[u8; HEAP_SIZE]>);
unsafe impl Sync for SyncHeap {}

static HEAP: SyncHeap = SyncHeap(core::cell::UnsafeCell::new([0; HEAP_SIZE]));
static HEAP_POS: core::sync::atomic::AtomicUsize = core::sync::atomic::AtomicUsize::new(0);

struct BumpAlloc;

unsafe impl core::alloc::GlobalAlloc for BumpAlloc {
    unsafe fn alloc(&self, layout: core::alloc::Layout) -> *mut u8 {
        let align = layout.align();
        let size = layout.size();
        loop {
            let pos = HEAP_POS.load(core::sync::atomic::Ordering::Relaxed);
            let aligned = (pos + align - 1) & !(align - 1);
            let new_pos = aligned + size;
            if new_pos > HEAP_SIZE {
                return core::ptr::null_mut();
            }
            if HEAP_POS
                .compare_exchange_weak(
                    pos,
                    new_pos,
                    core::sync::atomic::Ordering::Relaxed,
                    core::sync::atomic::Ordering::Relaxed,
                )
                .is_ok()
            {
                return unsafe { (HEAP.0.get() as *mut u8).add(aligned) };
            }
        }
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: core::alloc::Layout) {}
}

#[global_allocator]
static ALLOC: BumpAlloc = BumpAlloc;

// ── Game types ───────────────────────────────────────────────────────────────

/// Game configuration for sealed arena (matches oab_game::sealed::default_config)
fn default_config() -> GameConfig {
    GameConfig {
        starting_lives: 3,
        wins_to_victory: 10,
        starting_mana_limit: 3,
        max_mana_limit: 10,
        full_mana_each_round: false,
        board_size: 5,
        hand_size: 5,
        bag_size: 50,
    }
}

#[derive(Debug, Clone, Encode, Decode)]
struct GameConfig {
    starting_lives: i32,
    wins_to_victory: i32,
    starting_mana_limit: i32,
    max_mana_limit: i32,
    full_mana_each_round: bool,
    board_size: u32,
    hand_size: u32,
    bag_size: u32,
}

impl GameConfig {
    fn mana_limit_for_round(&self, round: i32) -> i32 {
        (self.starting_mana_limit + round - 1).min(self.max_mana_limit)
    }
}

/// Persistent game session stored per player.
/// Kept lean to fit within the 416-byte storage value limit.
/// The card set is stored in a separate storage key.
#[derive(Debug, Clone, Encode, Decode)]
struct ArenaSession {
    /// Cards remaining in bag
    bag: Vec<CardId>,
    /// Player's current hand
    hand: Vec<CardId>,
    /// Board slots (index 0 = front)
    board: Vec<Option<BoardUnit>>,
    /// Current mana limit
    mana_limit: i32,
    /// Available shop mana
    shop_mana: i32,
    /// Current round
    round: i32,
    /// Lives remaining
    lives: i32,
    /// Wins accumulated
    wins: i32,
    /// 0 = Shop, 1 = Completed
    phase: u8,
    /// Next unique card ID counter
    next_card_id: u32,
    /// Deterministic seed
    game_seed: u64,
}

const PHASE_SHOP: u8 = 0;
const PHASE_COMPLETED: u8 = 1;

// ── Function selectors ───────────────────────────────────────────────────────

// keccak256("startGame(bytes,uint64)")[0..4]
const START_GAME: [u8; 4] = [0x8c, 0x66, 0x0a, 0x82];
// keccak256("submitTurn(bytes,bytes)")[0..4]
const SUBMIT_TURN: [u8; 4] = [0x20, 0xfa, 0x49, 0x07];
// keccak256("getGameState()")[0..4]
const GET_GAME_STATE: [u8; 4] = [0x17, 0x60, 0xf3, 0xa3];
// keccak256("abandonGame()")[0..4]
const ABANDON_GAME: [u8; 4] = [0xd6, 0xb5, 0x6d, 0xed];

// ── ABI helpers ──────────────────────────────────────────────────────────────

fn read_calldata() -> Vec<u8> {
    let size = api::call_data_size() as usize;
    let mut data = alloc::vec![0u8; size];
    api::call_data_copy(&mut data, 0);
    data
}

fn read_u256_as_usize(data: &[u8], offset: usize) -> Option<usize> {
    if offset + 32 > data.len() {
        return None;
    }
    let slice = &data[offset + 24..offset + 32];
    let val = u64::from_be_bytes(slice.try_into().ok()?);
    Some(val as usize)
}

fn read_u256_as_u64(data: &[u8], offset: usize) -> Option<u64> {
    if offset + 32 > data.len() {
        return None;
    }
    let slice = &data[offset + 24..offset + 32];
    Some(u64::from_be_bytes(slice.try_into().ok()?))
}

fn read_abi_bytes(params: &[u8], offset: usize) -> Option<Vec<u8>> {
    if offset + 32 > params.len() {
        return None;
    }
    let len = read_u256_as_usize(params, offset)?;
    let start = offset + 32;
    let end = start + len;
    if end > params.len() {
        return None;
    }
    Some(params[start..end].to_vec())
}

fn caller_address() -> [u8; 20] {
    let mut addr = [0u8; 20];
    api::caller(&mut addr);
    addr
}

// ── Storage helpers ──────────────────────────────────────────────────────────

/// Storage key for a player's game session: keccak256("game" ++ address)
fn game_storage_key(addr: &[u8; 20]) -> [u8; 32] {
    let mut key_input = [0u8; 24]; // "game" (4) + address (20)
    key_input[0..4].copy_from_slice(b"game");
    key_input[4..24].copy_from_slice(addr);
    let mut key = [0u8; 32];
    api::hash_keccak_256(&key_input, &mut key);
    key
}

/// Storage key for a player's card set: keccak256("cset" ++ address)
fn card_set_storage_key(addr: &[u8; 20]) -> [u8; 32] {
    let mut key_input = [0u8; 24];
    key_input[0..4].copy_from_slice(b"cset");
    key_input[4..24].copy_from_slice(addr);
    let mut key = [0u8; 32];
    api::hash_keccak_256(&key_input, &mut key);
    key
}

fn load_session(addr: &[u8; 20]) -> Option<ArenaSession> {
    let key = game_storage_key(addr);
    let mut buf = [0u8; 16 * 1024]; // 16 KB buffer should be enough for session
    let mut buf_ref: &mut [u8] = &mut buf;
    let result = api::get_storage(StorageFlags::empty(), &key, &mut buf_ref);
    match result {
        Ok(()) => ArenaSession::decode(&mut &*buf_ref).ok(),
        Err(_) => None,
    }
}

fn save_session(addr: &[u8; 20], session: &ArenaSession) {
    let key = game_storage_key(addr);
    let encoded = session.encode();
    api::set_storage(StorageFlags::empty(), &key, &encoded);
}

fn save_card_set(addr: &[u8; 20], card_set: &CardSet) {
    let key = card_set_storage_key(addr);
    let encoded = card_set.encode();
    api::set_storage(StorageFlags::empty(), &key, &encoded);
}

fn load_card_set(addr: &[u8; 20]) -> Option<CardSet> {
    let key = card_set_storage_key(addr);
    let mut buf = [0u8; 2 * 1024]; // card set is ~393 bytes
    let mut buf_ref: &mut [u8] = &mut buf;
    match api::get_storage(StorageFlags::empty(), &key, &mut buf_ref) {
        Ok(()) => CardSet::decode(&mut &*buf_ref).ok(),
        Err(_) => None,
    }
}

fn delete_session(addr: &[u8; 20]) {
    let key = game_storage_key(addr);
    api::set_storage(StorageFlags::empty(), &key, &[]);
    let key2 = card_set_storage_key(addr);
    api::set_storage(StorageFlags::empty(), &key2, &[]);
}

// ── Card pool reconstruction ─────────────────────────────────────────────────

fn build_card_pool_from_set(card_set: &CardSet, all_cards: &[UnitCard]) -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    for entry in &card_set.cards {
        if let Some(card) = all_cards.iter().find(|c| c.id == entry.card_id) {
            pool.insert(card.id, card.clone());
        }
    }
    pool
}

// ── Sealed bag creation (matches oab_game::sealed::create_starting_bag) ──────

fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
    if set.cards.is_empty() {
        return Vec::new();
    }

    let mut bag = Vec::with_capacity(bag_size);
    let mut rng = XorShiftRng::seed_from_u64(seed);

    let total_weight: u32 = set.cards.iter().map(|e| e.rarity).sum();
    if total_weight == 0 {
        return Vec::new();
    }

    for _ in 0..bag_size {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 {
                continue;
            }
            if target < entry.rarity {
                bag.push(entry.card_id);
                break;
            }
            target -= entry.rarity;
        }
    }

    bag
}

// ── Hand drawing (matches oab_game::state::draw_hand) ────────────────────────

fn derive_hand_indices(bag_len: usize, game_seed: u64, round: i32, hand_size: usize) -> Vec<usize> {
    if bag_len == 0 {
        return Vec::new();
    }
    let hand_count = hand_size.min(bag_len);
    let seed = game_seed ^ (round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);

    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count {
        let j = i + rng.gen_range(bag_len - i);
        indices.swap(i, j);
    }
    indices.truncate(hand_count);
    indices
}

fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
    session.bag.append(&mut session.hand);
    let indices = derive_hand_indices(
        session.bag.len(),
        session.game_seed,
        session.round,
        hand_size,
    );
    if indices.is_empty() {
        return;
    }
    let mut sorted = indices;
    sorted.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(sorted.len());
    for idx in sorted {
        drawn.push(session.bag.remove(idx));
    }
    drawn.reverse();
    session.hand = drawn;
}

// ── Seed derivation ──────────────────────────────────────────────────────────

fn derive_seed(addr: &[u8; 20], context: &[u8], nonce: u64) -> u64 {
    let mut input = Vec::with_capacity(20 + context.len() + 8);
    input.extend_from_slice(addr);
    input.extend_from_slice(context);
    input.extend_from_slice(&nonce.to_le_bytes());
    let mut hash = [0u8; 32];
    api::hash_keccak_256(&input, &mut hash);
    u64::from_le_bytes(hash[0..8].try_into().unwrap())
}

// ── Game logic ───────────────────────────────────────────────────────────────

fn handle_start_game(calldata: &[u8]) {
    let addr = caller_address();

    // Must not have an active game
    if load_session(&addr).is_some() {
        return; // Game already active
    }

    // Decode params: (bytes cardSetAndPool, uint64 seedNonce)
    // cardSetAndPool = SCALE-encoded (CardSet, Vec<UnitCard>)
    if calldata.len() < 4 + 64 {
        return;
    }
    let params = &calldata[4..];
    let off_data = match read_u256_as_usize(params, 0) {
        Some(v) => v,
        None => return,
    };
    let seed_nonce = match read_u256_as_u64(params, 32) {
        Some(v) => v,
        None => return,
    };
    let data_bytes = match read_abi_bytes(params, off_data) {
        Some(v) => v,
        None => return,
    };

    let (card_set, all_cards): (CardSet, Vec<UnitCard>) =
        match Decode::decode(&mut &data_bytes[..]) {
            Ok(v) => v,
            Err(_) => return,
        };

    let config = default_config();
    let seed = derive_seed(&addr, b"start", seed_nonce);

    let bag = create_starting_bag(&card_set, seed, config.bag_size as usize);

    let mut session = ArenaSession {
        bag,
        hand: Vec::new(),
        board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1),
        shop_mana: 0,
        round: 1,
        lives: config.starting_lives,
        wins: 0,
        phase: PHASE_SHOP,
        next_card_id: 1000,
        game_seed: seed,
    };

    // Draw initial hand
    draw_hand(&mut session, config.hand_size as usize);

    // Apply shop start triggers
    let card_pool = build_card_pool_from_set(&card_set, &all_cards);
    apply_shop_start_on_session(&mut session, &card_pool);

    save_session(&addr, &session);
    save_card_set(&addr, &card_set);

    // Return the seed as confirmation
    let mut output = [0u8; 32];
    output[24..32].copy_from_slice(&seed.to_be_bytes());
    api::return_value(ReturnFlags::empty(), &output);
}

fn handle_submit_turn(calldata: &[u8]) {
    let addr = caller_address();

    let mut session = match load_session(&addr) {
        Some(s) => s,
        None => return, // No active game
    };

    if session.phase != PHASE_SHOP {
        return; // Wrong phase
    }

    // Decode params: (bytes turnAction, bytes enemyAndCards)
    // turnAction = SCALE-encoded CommitTurnAction
    // enemyAndCards = SCALE-encoded (Vec<CombatUnit>, Vec<UnitCard>)
    if calldata.len() < 4 + 64 {
        return;
    }
    let params = &calldata[4..];
    let off_action = match read_u256_as_usize(params, 0) {
        Some(v) => v,
        None => return,
    };
    let off_enemy = match read_u256_as_usize(params, 32) {
        Some(v) => v,
        None => return,
    };
    let action_bytes = match read_abi_bytes(params, off_action) {
        Some(v) => v,
        None => return,
    };
    let enemy_bytes = match read_abi_bytes(params, off_enemy) {
        Some(v) => v,
        None => return,
    };

    let action: CommitTurnAction = match Decode::decode(&mut &action_bytes[..]) {
        Ok(v) => v,
        Err(_) => return,
    };
    let (enemy_units, all_cards): (Vec<CombatUnit>, Vec<UnitCard>) =
        match Decode::decode(&mut &enemy_bytes[..]) {
            Ok(v) => v,
            Err(_) => return,
        };

    let card_set = match load_card_set(&addr) {
        Some(cs) => cs,
        None => return,
    };
    let card_pool = build_card_pool_from_set(&card_set, &all_cards);
    let config = default_config();

    // Reconstruct ShopState for turn verification
    let mut shop_state = oab_battle::state::ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };

    // Verify and apply the turn
    if verify_and_apply_turn(&mut shop_state, &action).is_err() {
        return; // Invalid turn
    }

    shop_state.shop_mana = 0;

    // Extract player combat units from board
    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = shop_state
        .board
        .iter()
        .enumerate()
        .filter_map(|(slot, board_unit)| {
            let board_unit = board_unit.as_ref()?;
            player_slots.push(slot);
            card_pool.get(&board_unit.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = board_unit.perm_attack;
                cu.health_buff = board_unit.perm_health;
                cu.health = cu.health.saturating_add(board_unit.perm_health).max(0);
                cu
            })
        })
        .collect();

    // Generate battle seed
    let battle_seed = derive_seed(&addr, b"battle", session.game_seed);

    // Run the battle
    let mut rng = XorShiftRng::seed_from_u64(battle_seed);
    let events = resolve_battle(
        player_units,
        enemy_units,
        &mut rng,
        &card_pool,
        config.board_size as usize,
    );

    // Extract result
    let result = events
        .iter()
        .rev()
        .find_map(|e| {
            if let oab_battle::battle::CombatEvent::BattleEnd { result } = e {
                Some(result.clone())
            } else {
                None
            }
        })
        .unwrap_or(BattleResult::Draw);

    // Apply mana delta from battle
    let mana_delta = oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0);

    // Apply permanent stat deltas
    let permanent_deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
    for (unit_id, (attack_delta, health_delta)) in &permanent_deltas {
        let unit_index = unit_id.raw() as usize;
        if unit_index == 0 || unit_index > player_slots.len() {
            continue;
        }
        let slot = player_slots[unit_index - 1];
        let should_remove = {
            if let Some(Some(board_unit)) = shop_state.board.get_mut(slot) {
                board_unit.perm_attack = board_unit.perm_attack.saturating_add(*attack_delta);
                board_unit.perm_health = board_unit.perm_health.saturating_add(*health_delta);
                card_pool
                    .get(&board_unit.card_id)
                    .map(|card| card.stats.health.saturating_add(board_unit.perm_health) <= 0)
                    .unwrap_or(false)
            } else {
                false
            }
        };
        if should_remove {
            shop_state.board[slot] = None;
        }
    }

    // Update wins/lives
    match result {
        BattleResult::Victory => session.wins += 1,
        BattleResult::Defeat => session.lives -= 1,
        BattleResult::Draw => {}
    }

    let completed_round = session.round;
    let game_over =
        session.lives <= 0 || session.wins >= config.wins_to_victory;

    if !game_over {
        // Advance to next round
        let new_seed = derive_seed(&addr, b"shop", session.game_seed);
        session.game_seed = new_seed;
        session.round += 1;
        session.mana_limit = config.mana_limit_for_round(session.round);
        if config.full_mana_each_round {
            session.shop_mana = session.mana_limit;
        } else {
            session.shop_mana = mana_delta;
        }
        session.board = shop_state.board;
        session.hand = Vec::new();
        session.bag = {
            // Reconstruct bag: unused hand cards return to bag
            let mut bag = session.bag.clone();
            bag.extend(shop_state.hand.iter());
            bag
        };
        session.phase = PHASE_SHOP;

        // Draw new hand
        draw_hand(&mut session, config.hand_size as usize);

        // Apply shop start triggers for next round
        apply_shop_start_on_session_with_result(&mut session, &card_pool, Some(result.clone()));
    } else {
        // Game over
        session.board = shop_state.board;
        session.hand = shop_state.hand;
        session.shop_mana = mana_delta;
        session.phase = PHASE_COMPLETED;
    }

    save_session(&addr, &session);

    // Return: (uint8 result, int32 wins, int32 lives, int32 round)
    let mut output = [0u8; 128];
    // result at slot 0
    output[31] = match result {
        BattleResult::Victory => 0,
        BattleResult::Defeat => 1,
        BattleResult::Draw => 2,
    };
    // wins at slot 1
    output[60..64].copy_from_slice(&(session.wins as u32).to_be_bytes());
    // lives at slot 2
    output[92..96].copy_from_slice(&(session.lives as u32).to_be_bytes());
    // round at slot 3
    output[124..128].copy_from_slice(&(completed_round as u32).to_be_bytes());

    api::return_value(ReturnFlags::empty(), &output);
}

fn handle_get_game_state(calldata: &[u8]) {
    let _ = calldata;
    let addr = caller_address();

    let session = match load_session(&addr) {
        Some(s) => s,
        None => {
            api::return_value(ReturnFlags::empty(), &[0u8; 32]);
        }
    };

    let encoded = session.encode();

    // ABI encode as bytes
    let padded_len = (encoded.len() + 31) / 32 * 32;
    let total = 64 + padded_len;
    let mut output = alloc::vec![0u8; total];
    // offset to bytes = 32
    output[31] = 32;
    // length
    let len_bytes = (encoded.len() as u64).to_be_bytes();
    output[56..64].copy_from_slice(&len_bytes);
    // data
    output[64..64 + encoded.len()].copy_from_slice(&encoded);

    api::return_value(ReturnFlags::empty(), &output);
}

fn handle_abandon_game() {
    let addr = caller_address();
    if load_session(&addr).is_none() {
        return;
    }
    delete_session(&addr);
    // Return success (1)
    let mut output = [0u8; 32];
    output[31] = 1;
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Shop trigger helpers ─────────────────────────────────────────────────────

fn apply_shop_start_on_session(session: &mut ArenaSession, card_pool: &BTreeMap<CardId, UnitCard>) {
    let mut shop_state = oab_battle::state::ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    apply_shop_start_triggers(&mut shop_state);
    session.hand = shop_state.hand;
    session.board = shop_state.board;
    session.shop_mana = shop_state.shop_mana;
}

fn apply_shop_start_on_session_with_result(
    session: &mut ArenaSession,
    card_pool: &BTreeMap<CardId, UnitCard>,
    result: Option<BattleResult>,
) {
    let mut shop_state = oab_battle::state::ShopState {
        card_pool: card_pool.clone(),
        set_id: 0,
        hand: session.hand.clone(),
        board: session.board.clone(),
        mana_limit: session.mana_limit,
        shop_mana: session.shop_mana,
        round: session.round,
        game_seed: session.game_seed,
    };
    oab_battle::apply_shop_start_triggers_with_result(&mut shop_state, result);
    session.hand = shop_state.hand;
    session.board = shop_state.board;
    session.shop_mana = shop_state.shop_mana;
}

// ── Contract entry points ────────────────────────────────────────────────────

#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn deploy() {}

#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn call() {
    // Reset bump allocator for each call
    HEAP_POS.store(0, core::sync::atomic::Ordering::Relaxed);

    let calldata = read_calldata();
    if calldata.len() < 4 {
        return;
    }

    let selector: [u8; 4] = calldata[..4].try_into().unwrap();

    match selector {
        START_GAME => handle_start_game(&calldata),
        SUBMIT_TURN => handle_submit_turn(&calldata),
        GET_GAME_STATE => handle_get_game_state(&calldata),
        ABANDON_GAME => handle_abandon_game(),
        _ => {}
    }
}
