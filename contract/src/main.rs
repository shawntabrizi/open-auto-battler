//! Open Auto Battler Arena — PolkaVM Smart Contract
//!
//! A smart contract implementing the sealed arena game mode on PolkaVM.
//!
//! ## Admin Functions
//!
//! - `registerCard(bytes)` — Store a single card definition on-chain.
//!   Params: SCALE-encoded UnitCard. Keyed by the card's ID.
//!
//! - `registerSet(uint16,bytes)` — Store a card set on-chain.
//!   Params: set ID, SCALE-encoded CardSet.
//!
//! ## Player Functions
//!
//! - `startGame(uint16,uint64)` — Start a new arena game.
//!   Params: set ID, seed nonce. Card data is read from on-chain storage.
//!
//! - `submitTurn(bytes,bytes)` — Submit shop actions and an enemy board to battle.
//!   Params: SCALE-encoded CommitTurnAction, SCALE-encoded Vec<CombatUnit>.
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
    starting_lives: RoundValue,
    wins_to_victory: RoundValue,
    starting_mana_limit: ManaValue,
    max_mana_limit: ManaValue,
    full_mana_each_round: bool,
    board_size: IndexValue,
    hand_size: IndexValue,
    bag_size: IndexValue,
}

impl GameConfig {
    fn mana_limit_for_round(&self, round: RoundValue) -> ManaValue {
        (self.starting_mana_limit + round.saturating_sub(1)).min(self.max_mana_limit)
    }
}

#[derive(Debug, Clone, Encode, Decode)]
struct ArenaSession {
    bag: Vec<CardId>,
    hand: Vec<CardId>,
    board: Vec<Option<BoardUnit>>,
    mana_limit: ManaValue,
    shop_mana: ManaValue,
    round: RoundValue,
    lives: RoundValue,
    wins: RoundValue,
    phase: u8,
    next_card_id: u16,
    game_seed: u64,
    set_id: SetIdValue,
}

const PHASE_SHOP: u8 = 0;
const PHASE_COMPLETED: u8 = 1;

// ── Function selectors ───────────────────────────────────────────────────────

const REGISTER_CARD: [u8; 4] = [0xd6, 0xc0, 0x9c, 0x1d];
const REGISTER_SET: [u8; 4] = [0xd8, 0xf4, 0x1b, 0x6a];
const START_GAME: [u8; 4] = [0xe8, 0xc0, 0x12, 0x7d];
const SUBMIT_TURN: [u8; 4] = [0x20, 0xfa, 0x49, 0x07];
const GET_GAME_STATE: [u8; 4] = [0x17, 0x60, 0xf3, 0xa3];
const ABANDON_GAME: [u8; 4] = [0xd6, 0xb5, 0x6d, 0xed];

// ── ABI helpers ──────────────────────────────────────────────────────────────

fn read_calldata() -> Vec<u8> {
    let size = api::call_data_size() as usize;
    let mut data = alloc::vec![0u8; size];
    api::call_data_copy(&mut data, 0);
    data
}

fn read_u256_as_usize(data: &[u8], offset: usize) -> Option<usize> {
    if offset + 32 > data.len() { return None; }
    let slice = &data[offset + 24..offset + 32];
    Some(u64::from_be_bytes(slice.try_into().ok()?) as usize)
}

fn read_u256_as_u64(data: &[u8], offset: usize) -> Option<u64> {
    if offset + 32 > data.len() { return None; }
    let slice = &data[offset + 24..offset + 32];
    Some(u64::from_be_bytes(slice.try_into().ok()?))
}

fn read_u256_as_u16(data: &[u8], offset: usize) -> Option<u16> {
    if offset + 32 > data.len() { return None; }
    let slice = &data[offset + 30..offset + 32];
    Some(u16::from_be_bytes(slice.try_into().ok()?))
}

fn read_abi_bytes(params: &[u8], offset: usize) -> Option<Vec<u8>> {
    if offset + 32 > params.len() { return None; }
    let len = read_u256_as_usize(params, offset)?;
    let start = offset + 32;
    let end = start + len;
    if end > params.len() { return None; }
    Some(params[start..end].to_vec())
}

fn caller_address() -> [u8; 20] {
    let mut addr = [0u8; 20];
    api::caller(&mut addr);
    addr
}

// ── Storage keys ─────────────────────────────────────────────────────────────

fn hash_key(prefix: &[u8], suffix: &[u8]) -> [u8; 32] {
    let mut input = alloc::vec![0u8; prefix.len() + suffix.len()];
    input[..prefix.len()].copy_from_slice(prefix);
    input[prefix.len()..].copy_from_slice(suffix);
    let mut key = [0u8; 32];
    api::hash_keccak_256(&input, &mut key);
    key
}

/// Storage key for a card: keccak256("card" ++ card_id_le_bytes)
fn card_storage_key(card_id: CardId) -> [u8; 32] {
    hash_key(b"card", &card_id.0.to_le_bytes())
}

/// Storage key for a card set: keccak256("set_" ++ set_id_le_bytes)
fn set_storage_key(set_id: SetIdValue) -> [u8; 32] {
    hash_key(b"set_", &set_id.to_le_bytes())
}

/// Storage key for a player's game session: keccak256("game" ++ address)
fn game_storage_key(addr: &[u8; 20]) -> [u8; 32] {
    hash_key(b"game", addr)
}

// ── Storage read/write helpers ───────────────────────────────────────────────

fn storage_read<T: Decode>(key: &[u8; 32], buf: &mut [u8]) -> Option<T> {
    let mut buf_ref: &mut [u8] = buf;
    match api::get_storage(StorageFlags::empty(), key, &mut buf_ref) {
        Ok(()) => T::decode(&mut &*buf_ref).ok(),
        Err(_) => None,
    }
}

fn storage_write(key: &[u8; 32], data: &[u8]) {
    api::set_storage(StorageFlags::empty(), key, data);
}

fn storage_delete(key: &[u8; 32]) {
    api::set_storage(StorageFlags::empty(), key, &[]);
}

fn load_session(addr: &[u8; 20]) -> Option<ArenaSession> {
    let key = game_storage_key(addr);
    let mut buf = [0u8; 512];
    storage_read(&key, &mut buf)
}

fn save_session(addr: &[u8; 20], session: &ArenaSession) {
    storage_write(&game_storage_key(addr), &session.encode());
}

fn delete_session(addr: &[u8; 20]) {
    storage_delete(&game_storage_key(addr));
}

fn load_card(card_id: CardId) -> Option<UnitCard> {
    let key = card_storage_key(card_id);
    let mut buf = [0u8; 256];
    storage_read(&key, &mut buf)
}

fn save_card(card: &UnitCard) {
    storage_write(&card_storage_key(card.id), &card.encode());
}

fn load_card_set(set_id: SetIdValue) -> Option<CardSet> {
    let key = set_storage_key(set_id);
    let mut buf = [0u8; 416];
    storage_read(&key, &mut buf)
}

fn save_card_set(set_id: SetIdValue, card_set: &CardSet) {
    storage_write(&set_storage_key(set_id), &card_set.encode());
}

// ── Card pool reconstruction from storage ────────────────────────────────────

fn build_card_pool_from_storage(card_set: &CardSet) -> BTreeMap<CardId, UnitCard> {
    let mut pool = BTreeMap::new();
    for entry in &card_set.cards {
        if let Some(card) = load_card(entry.card_id) {
            pool.insert(card.id, card);
        }
    }
    pool
}

// ── Sealed bag creation ──────────────────────────────────────────────────────

fn create_starting_bag(set: &CardSet, seed: u64, bag_size: usize) -> Vec<CardId> {
    if set.cards.is_empty() { return Vec::new(); }
    let mut bag = Vec::with_capacity(bag_size);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let total_weight: u32 = set.cards.iter().map(|e| e.rarity as u32).sum();
    if total_weight == 0 { return Vec::new(); }
    for _ in 0..bag_size {
        let mut target = rng.gen_range(total_weight as usize) as u32;
        for entry in &set.cards {
            if entry.rarity == 0 { continue; }
            if target < entry.rarity as u32 { bag.push(entry.card_id); break; }
            target -= entry.rarity as u32;
        }
    }
    bag
}

// ── Hand drawing ─────────────────────────────────────────────────────────────

fn draw_hand(session: &mut ArenaSession, hand_size: usize) {
    session.bag.append(&mut session.hand);
    let bag_len = session.bag.len();
    if bag_len == 0 { return; }
    let hand_count = hand_size.min(bag_len);
    let seed = session.game_seed ^ (session.round as u64);
    let mut rng = XorShiftRng::seed_from_u64(seed);
    let mut indices: Vec<usize> = (0..bag_len).collect();
    for i in 0..hand_count {
        let j = i + rng.gen_range(bag_len - i);
        indices.swap(i, j);
    }
    indices.truncate(hand_count);
    indices.sort_unstable_by(|a, b| b.cmp(a));
    let mut drawn = Vec::with_capacity(hand_count);
    for idx in indices { drawn.push(session.bag.remove(idx)); }
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

// ── ShopState helpers ────────────────────────────────────────────────────────

fn make_shop_state(session: &ArenaSession, card_pool: &BTreeMap<CardId, UnitCard>) -> oab_battle::state::ShopState {
    oab_battle::state::ShopState {
        card_pool: card_pool.clone(), set_id: 0,
        hand: session.hand.clone(), board: session.board.clone(),
        mana_limit: session.mana_limit, shop_mana: session.shop_mana,
        round: session.round, game_seed: session.game_seed,
    }
}

fn sync_from_shop_state(session: &mut ArenaSession, shop: &oab_battle::state::ShopState) {
    session.hand = shop.hand.clone();
    session.board = shop.board.clone();
    session.shop_mana = shop.shop_mana;
}

// ── Admin: registerCard ──────────────────────────────────────────────────────

fn handle_register_card(calldata: &[u8]) {
    if calldata.len() < 4 + 32 { return; }
    let params = &calldata[4..];
    let off = match read_u256_as_usize(params, 0) { Some(v) => v, None => return };
    let data = match read_abi_bytes(params, off) { Some(v) => v, None => return };
    let card: UnitCard = match Decode::decode(&mut &data[..]) { Ok(v) => v, Err(_) => return };
    save_card(&card);
    let mut output = [0u8; 32];
    output[31] = 1;
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Admin: registerSet ───────────────────────────────────────────────────────

fn handle_register_set(calldata: &[u8]) {
    if calldata.len() < 4 + 64 { return; }
    let params = &calldata[4..];
    let set_id = match read_u256_as_u16(params, 0) { Some(v) => v, None => return };
    let off = match read_u256_as_usize(params, 32) { Some(v) => v, None => return };
    let data = match read_abi_bytes(params, off) { Some(v) => v, None => return };
    let card_set: CardSet = match Decode::decode(&mut &data[..]) { Ok(v) => v, Err(_) => return };
    save_card_set(set_id, &card_set);
    let mut output = [0u8; 32];
    output[31] = 1;
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Player: startGame ────────────────────────────────────────────────────────

fn handle_start_game(calldata: &[u8]) {
    let addr = caller_address();
    if load_session(&addr).is_some() { return; }

    if calldata.len() < 4 + 64 { return; }
    let params = &calldata[4..];
    let set_id = match read_u256_as_u16(params, 0) { Some(v) => v, None => return };
    let seed_nonce = match read_u256_as_u64(params, 32) { Some(v) => v, None => return };

    let card_set = match load_card_set(set_id) { Some(cs) => cs, None => return };
    let card_pool = build_card_pool_from_storage(&card_set);
    if card_pool.is_empty() { return; }

    let config = default_config();
    let seed = derive_seed(&addr, b"start", seed_nonce);
    let bag = create_starting_bag(&card_set, seed, config.bag_size as usize);

    let mut session = ArenaSession {
        bag, hand: Vec::new(),
        board: vec![None; config.board_size as usize],
        mana_limit: config.mana_limit_for_round(1), shop_mana: 0,
        round: 1, lives: config.starting_lives, wins: 0,
        phase: PHASE_SHOP, next_card_id: 1000, game_seed: seed, set_id,
    };

    draw_hand(&mut session, config.hand_size as usize);
    let mut shop = make_shop_state(&session, &card_pool);
    apply_shop_start_triggers(&mut shop);
    sync_from_shop_state(&mut session, &shop);

    save_session(&addr, &session);

    let mut output = [0u8; 32];
    output[24..32].copy_from_slice(&seed.to_be_bytes());
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Player: submitTurn ───────────────────────────────────────────────────────

fn handle_submit_turn(calldata: &[u8]) {
    let addr = caller_address();
    let mut session = match load_session(&addr) { Some(s) => s, None => return };
    if session.phase != PHASE_SHOP { return; }

    if calldata.len() < 4 + 64 { return; }
    let params = &calldata[4..];
    let off_action = match read_u256_as_usize(params, 0) { Some(v) => v, None => return };
    let off_enemy = match read_u256_as_usize(params, 32) { Some(v) => v, None => return };
    let action_bytes = match read_abi_bytes(params, off_action) { Some(v) => v, None => return };
    let enemy_bytes = match read_abi_bytes(params, off_enemy) { Some(v) => v, None => return };

    let action: CommitTurnAction = match Decode::decode(&mut &action_bytes[..]) { Ok(v) => v, Err(_) => return };
    let enemy_units: Vec<CombatUnit> = match Decode::decode(&mut &enemy_bytes[..]) { Ok(v) => v, Err(_) => return };

    // Load card pool from on-chain storage
    let card_set = match load_card_set(session.set_id) { Some(cs) => cs, None => return };
    let card_pool = build_card_pool_from_storage(&card_set);
    let config = default_config();

    let mut shop_state = make_shop_state(&session, &card_pool);
    if verify_and_apply_turn(&mut shop_state, &action).is_err() { return; }
    shop_state.shop_mana = 0;

    // Extract player combat units
    let mut player_slots = Vec::new();
    let player_units: Vec<CombatUnit> = shop_state.board.iter().enumerate()
        .filter_map(|(slot, bu)| {
            let bu = bu.as_ref()?;
            player_slots.push(slot);
            card_pool.get(&bu.card_id).map(|card| {
                let mut cu = CombatUnit::from_card(card.clone());
                cu.attack_buff = bu.perm_attack;
                cu.health_buff = bu.perm_health;
                cu.health = cu.health.saturating_add(bu.perm_health).max(0);
                cu
            })
        }).collect();

    let battle_seed = derive_seed(&addr, b"battle", session.game_seed);
    let mut rng = XorShiftRng::seed_from_u64(battle_seed);
    let events = resolve_battle(player_units, enemy_units, &mut rng, &card_pool, config.board_size as usize);

    let result = events.iter().rev().find_map(|e| {
        if let oab_battle::battle::CombatEvent::BattleEnd { result } = e { Some(result.clone()) } else { None }
    }).unwrap_or(BattleResult::Draw);

    let mana_delta: ManaValue = oab_battle::battle::player_shop_mana_delta_from_events(&events).max(0) as ManaValue;
    let permanent_deltas = oab_battle::battle::player_permanent_stat_deltas_from_events(&events);
    for (unit_id, (attack_delta, health_delta)) in &permanent_deltas {
        let idx = unit_id.raw() as usize;
        if idx == 0 || idx > player_slots.len() { continue; }
        let slot = player_slots[idx - 1];
        let remove = if let Some(Some(bu)) = shop_state.board.get_mut(slot) {
            bu.perm_attack = bu.perm_attack.saturating_add(*attack_delta);
            bu.perm_health = bu.perm_health.saturating_add(*health_delta);
            card_pool.get(&bu.card_id).map(|c| c.stats.health.saturating_add(bu.perm_health) <= 0).unwrap_or(false)
        } else { false };
        if remove { shop_state.board[slot] = None; }
    }

    match result {
        BattleResult::Victory => session.wins += 1,
        BattleResult::Defeat => session.lives -= 1,
        BattleResult::Draw => {}
    }

    let completed_round = session.round;
    let game_over = session.lives == 0 || session.wins >= config.wins_to_victory;

    if !game_over {
        let new_seed = derive_seed(&addr, b"shop", session.game_seed);
        session.game_seed = new_seed;
        session.round += 1;
        session.mana_limit = config.mana_limit_for_round(session.round);
        session.shop_mana = if config.full_mana_each_round { session.mana_limit } else { mana_delta };
        session.board = shop_state.board;
        let mut bag = session.bag.clone();
        bag.extend(shop_state.hand.iter());
        session.bag = bag;
        session.hand = Vec::new();
        session.phase = PHASE_SHOP;

        draw_hand(&mut session, config.hand_size as usize);
        let mut shop = make_shop_state(&session, &card_pool);
        oab_battle::apply_shop_start_triggers_with_result(&mut shop, Some(result.clone()));
        sync_from_shop_state(&mut session, &shop);
    } else {
        session.board = shop_state.board;
        session.hand = shop_state.hand;
        session.shop_mana = mana_delta;
        session.phase = PHASE_COMPLETED;
    }

    save_session(&addr, &session);

    let mut output = [0u8; 128];
    output[31] = match result { BattleResult::Victory => 0, BattleResult::Defeat => 1, BattleResult::Draw => 2 };
    output[63] = session.wins;
    output[95] = session.lives;
    output[127] = completed_round;
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Player: getGameState ─────────────────────────────────────────────────────

fn handle_get_game_state(calldata: &[u8]) {
    let _ = calldata;
    let addr = caller_address();
    let session = match load_session(&addr) {
        Some(s) => s,
        None => { api::return_value(ReturnFlags::empty(), &[0u8; 32]); }
    };
    let encoded = session.encode();
    let padded_len = (encoded.len() + 31) / 32 * 32;
    let total = 64 + padded_len;
    let mut output = alloc::vec![0u8; total];
    output[31] = 32;
    output[56..64].copy_from_slice(&(encoded.len() as u64).to_be_bytes());
    output[64..64 + encoded.len()].copy_from_slice(&encoded);
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Player: abandonGame ──────────────────────────────────────────────────────

fn handle_abandon_game() {
    let addr = caller_address();
    if load_session(&addr).is_none() { return; }
    delete_session(&addr);
    let mut output = [0u8; 32];
    output[31] = 1;
    api::return_value(ReturnFlags::empty(), &output);
}

// ── Contract entry points ────────────────────────────────────────────────────

#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn deploy() {}

#[no_mangle]
#[polkavm_derive::polkavm_export]
pub extern "C" fn call() {
    HEAP_POS.store(0, core::sync::atomic::Ordering::Relaxed);
    let calldata = read_calldata();
    if calldata.len() < 4 { return; }
    let selector: [u8; 4] = calldata[..4].try_into().unwrap();
    match selector {
        REGISTER_CARD => handle_register_card(&calldata),
        REGISTER_SET => handle_register_set(&calldata),
        START_GAME => handle_start_game(&calldata),
        SUBMIT_TURN => handle_submit_turn(&calldata),
        GET_GAME_STATE => handle_get_game_state(&calldata),
        ABANDON_GAME => handle_abandon_game(),
        _ => {}
    }
}
