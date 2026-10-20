//! Native tests. Run from the repo root:
//!   CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path arena/Cargo.toml --features std
//!
//! `TestHost` wraps `MockHost` and answers the arena's sub-calls the way the
//! deployed `@oab/identity` (M2) and `@oab/content` (M1) answer them, by
//! selector. `MockHost` alone gives one reply per address, and Content gets
//! three different calls.

use super::oab_arena::{ArenaError, BattleReported, GameAbandoned, GameEnded, GameStarted, OabArena};
use super::{
    arena_config, bracket_bytes, house_by_round, pick_opponent, push_ghost, Config, GhostPool, SetMeta,
    MAX_GHOSTS_PER_BRACKET, MAX_HOUSE_ROUND, STORAGE_BYTES, THIN_POOL,
};
use oab_battle::battle::BattleResult;
use oab_battle::types::{BoardUnit, CardId, CommitTurnAction, GhostBoardUnit, TurnAction};
use oab_battle::GameError;
use oab_engine::vectors::{
    arena_v2_block_entropy, arena_v2_seed, asset_bundles, policy_action, traces, MAX_TURNS,
};
use oab_engine::{keccak256, SetBundle, ENGINE_VERSION};
use oab_game::{GamePhase, LocalGameState};
use oab_protocol::{BattleReport, HouseGhost, ModeGame};
use parity_scale_codec::{Decode, Encode};
use pvm_contract_sdk::types::{CallFlags, HostApi, HostResult, StorageFlags};
use pvm_contract_sdk::{Address, Bytes, MockHost, MockHostBuilder, SolEvent};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

const ADMIN: [u8; 20] = [0xAD; 20];
const ALICE: [u8; 20] = [0xA1; 20];
const BOB: [u8; 20] = [0xB0; 20];
const KEY: [u8; 20] = [0x51; 20];
const IDENTITY: [u8; 20] = [0x1D; 20];
const CONTENT: [u8; 20] = [0xC0; 20];
const ENGINE: [u8; 20] = [0xE0; 20];
const T0: u64 = 1_800_000_000;
const HOUR: u64 = 3600;

fn selector(sig: &str) -> [u8; 4] {
    keccak256(sig.as_bytes())[..4].try_into().unwrap()
}

fn word(n: u64) -> Vec<u8> {
    let mut w = vec![0u8; 32];
    w[24..].copy_from_slice(&n.to_be_bytes());
    w
}

fn addr_word(a: [u8; 20]) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(&a);
    w
}

/// ABI return of one `bytes` value.
fn abi_bytes(data: &[u8]) -> Vec<u8> {
    let mut out = word(32);
    out.extend(word(data.len() as u64));
    out.extend_from_slice(data);
    out.resize(64 + data.len().div_ceil(32) * 32, 0);
    out
}

/// What the other contracts hold. Shared by every call of one test.
#[derive(Default)]
struct World {
    /// session key -> (owner, expires at, revoked), as `@oab/identity`.
    sessions: HashMap<[u8; 20], ([u8; 20], u64, bool)>,
    /// `resolve` answers with no data (a wrong Identity address).
    identity_broken: bool,
    bundles: HashMap<u16, Vec<u8>>,
    hashes: HashMap<u16, [u8; 32]>,
    ghosts: HashMap<u16, Vec<u8>>,
}

struct TestHost {
    inner: MockHost,
    world: Rc<RefCell<World>>,
    now: u64,
}

impl TestHost {
    /// The reply of a routed sub-call; `None` = not routed (MockHost default).
    fn route(&self, callee: &[u8; 20], input: &[u8]) -> Option<Result<Vec<u8>, ()>> {
        let w = self.world.borrow();
        let sel: [u8; 4] = input.get(..4)?.try_into().ok()?;
        if *callee == IDENTITY && sel == selector("resolve(address)") {
            if w.identity_broken {
                return Some(Ok(Vec::new()));
            }
            let account: [u8; 20] = input[16..36].try_into().unwrap();
            // M2 Identity: never a key -> itself; live key -> owner; dead key -> revert.
            return Some(match w.sessions.get(&account) {
                None => Ok(addr_word(account).to_vec()),
                Some(&(owner, expires, revoked)) if !revoked && self.now < expires => {
                    Ok(addr_word(owner).to_vec())
                }
                Some(_) => Err(()),
            });
        }
        if *callee == CONTENT {
            let set_id = u16::from_be_bytes(input[34..36].try_into().unwrap());
            if sel == selector("getSetBundle(uint16)") {
                return Some(Ok(abi_bytes(w.bundles.get(&set_id).map(|b| &b[..]).unwrap_or(&[]))));
            }
            if sel == selector("setHash(uint16)") {
                return Some(Ok(w.hashes.get(&set_id).copied().unwrap_or([0; 32]).to_vec()));
            }
            if sel == selector("getHouseGhosts(uint16)") {
                let empty = Vec::<HouseGhost>::new().encode();
                return Some(Ok(abi_bytes(w.ghosts.get(&set_id).unwrap_or(&empty))));
            }
        }
        None
    }

    fn install(&self, callee: &[u8; 20], input: &[u8]) {
        if let Some(reply) = self.route(callee, input) {
            self.inner.mock_call(*callee, reply);
        }
    }
}

#[allow(clippy::too_many_arguments)]
impl HostApi for TestHost {
    fn address(&self, o: &mut [u8; 20]) {
        self.inner.address(o)
    }
    fn get_immutable_data(&self, o: &mut &mut [u8]) {
        self.inner.get_immutable_data(o)
    }
    fn set_immutable_data(&self, d: &[u8]) {
        self.inner.set_immutable_data(d)
    }
    fn balance(&self, o: &mut [u8; 32]) {
        self.inner.balance(o)
    }
    fn balance_of(&self, a: &[u8; 20], o: &mut [u8; 32]) {
        self.inner.balance_of(a, o)
    }
    fn chain_id(&self, o: &mut [u8; 32]) {
        self.inner.chain_id(o)
    }
    fn gas_price(&self) -> u64 {
        self.inner.gas_price()
    }
    fn base_fee(&self, o: &mut [u8; 32]) {
        self.inner.base_fee(o)
    }
    fn call_data_size(&self) -> u64 {
        self.inner.call_data_size()
    }
    fn call(
        &self,
        flags: CallFlags,
        callee: &[u8; 20],
        rt: u64,
        ps: u64,
        dep: &[u8; 32],
        value: &[u8; 32],
        input: &[u8],
        output: Option<&mut &mut [u8]>,
    ) -> HostResult {
        self.install(callee, input);
        self.inner.call(flags, callee, rt, ps, dep, value, input, output)
    }
    fn call_evm(
        &self,
        flags: CallFlags,
        callee: &[u8; 20],
        gas: u64,
        value: &[u8; 32],
        input: &[u8],
        output: Option<&mut &mut [u8]>,
    ) -> HostResult {
        self.install(callee, input);
        self.inner.call_evm(flags, callee, gas, value, input, output)
    }
    fn caller(&self, o: &mut [u8; 20]) {
        self.inner.caller(o)
    }
    fn origin(&self, o: &mut [u8; 20]) {
        self.inner.origin(o)
    }
    fn code_hash(&self, a: &[u8; 20], o: &mut [u8; 32]) {
        self.inner.code_hash(a, o)
    }
    fn code_size(&self, a: &[u8; 20]) -> u64 {
        self.inner.code_size(a)
    }
    fn delegate_call(
        &self,
        flags: CallFlags,
        a: &[u8; 20],
        rt: u64,
        ps: u64,
        dep: &[u8; 32],
        input: &[u8],
        output: Option<&mut &mut [u8]>,
    ) -> HostResult {
        self.inner.delegate_call(flags, a, rt, ps, dep, input, output)
    }
    fn delegate_call_evm(
        &self,
        flags: CallFlags,
        a: &[u8; 20],
        gas: u64,
        input: &[u8],
        output: Option<&mut &mut [u8]>,
    ) -> HostResult {
        self.inner.delegate_call_evm(flags, a, gas, input, output)
    }
    fn deposit_event(&self, t: &[[u8; 32]], d: &[u8]) {
        self.inner.deposit_event(t, d)
    }
    fn get_storage(&self, f: StorageFlags, k: &[u8], o: &mut &mut [u8]) -> HostResult {
        self.inner.get_storage(f, k, o)
    }
    fn hash_keccak_256(&self, i: &[u8], o: &mut [u8; 32]) {
        self.inner.hash_keccak_256(i, o)
    }
    fn call_data_copy(&self, o: &mut [u8], off: u32) {
        self.inner.call_data_copy(o, off)
    }
    fn call_data_load(&self, o: &mut [u8; 32], off: u32) {
        self.inner.call_data_load(o, off)
    }
    fn instantiate(
        &self,
        rt: u64,
        ps: u64,
        dep: &[u8; 32],
        value: &[u8; 32],
        input: &[u8],
        address: Option<&mut [u8; 20]>,
        output: Option<&mut &mut [u8]>,
        salt: Option<&[u8; 32]>,
    ) -> HostResult {
        self.inner.instantiate(rt, ps, dep, value, input, address, output, salt)
    }
    fn now(&self, o: &mut [u8; 32]) {
        self.inner.now(o)
    }
    fn gas_limit(&self) -> u64 {
        self.inner.gas_limit()
    }
    fn set_storage(&self, f: StorageFlags, k: &[u8], v: &[u8]) -> Option<u32> {
        // pallet-revive refuses a value above its item limit.
        assert!(v.len() <= STORAGE_BYTES, "storage item of {} bytes", v.len());
        self.inner.set_storage(f, k, v)
    }
    fn set_storage_or_clear(&self, f: StorageFlags, k: &[u8; 32], v: &[u8; 32]) -> Option<u32> {
        self.inner.set_storage_or_clear(f, k, v)
    }
    fn get_storage_or_zero(&self, f: StorageFlags, k: &[u8; 32], o: &mut [u8; 32]) {
        self.inner.get_storage_or_zero(f, k, o)
    }
    fn value_transferred(&self, o: &mut [u8; 32]) {
        self.inner.value_transferred(o)
    }
    fn return_data_size(&self) -> u64 {
        self.inner.return_data_size()
    }
    fn return_data_copy(&self, o: &mut &mut [u8], off: u32) {
        self.inner.return_data_copy(o, off)
    }
    fn gas_left(&self) -> u64 {
        self.inner.gas_left()
    }
    fn block_author(&self, o: &mut [u8; 20]) {
        self.inner.block_author(o)
    }
    fn block_number(&self, o: &mut [u8; 32]) {
        self.inner.block_number(o)
    }
    fn block_hash(&self, n: &[u8; 32], o: &mut [u8; 32]) {
        self.inner.block_hash(n, o)
    }
    fn return_value(&self, d: &[u8]) {
        self.inner.return_value(d)
    }
    fn consume_all_gas(&self) -> ! {
        self.inner.consume_all_gas()
    }
    fn terminate(&self, b: &[u8; 20]) -> ! {
        self.inner.terminate(b)
    }
    fn revert(&self, d: &[u8]) -> ! {
        self.inner.revert(d)
    }
}

type Event = (Vec<[u8; 32]>, Vec<u8>);

/// One arena's storage, called by any account at any block. MockHost fixes
/// the caller and the clock at build time, so each call builds a new host
/// over the same storage.
struct Chain {
    m: MockHost,
    world: Rc<RefCell<World>>,
    ev: Vec<Event>,
    /// Sub-calls of the last call, as (callee, input).
    calls: Vec<([u8; 20], Vec<u8>)>,
    block: u64,
}

impl Chain {
    /// Deployed by ADMIN, wired to Identity and Content.
    fn new() -> Self {
        let mut ch = Chain {
            m: MockHostBuilder::new().build(),
            world: Rc::new(RefCell::new(World::default())),
            ev: Vec::new(),
            calls: Vec::new(),
            block: 100,
        };
        ch.call(ADMIN, |c| c.new());
        ch.call(ADMIN, |c| c.set_deps(Address(IDENTITY), Address(CONTENT), Address(ENGINE)))
            .unwrap();
        ch
    }

    /// The arena with sets 0..=2 published in Content and cached, allowed.
    fn with_sets(house: bool) -> Self {
        let mut ch = Self::new();
        for b in asset_bundles() {
            ch.publish(&b, if house { house_ghosts(&b) } else { Vec::new() });
            ch.call(ADMIN, |c| c.cache_set(b.set_id)).unwrap();
            ch.call(ADMIN, |c| c.set_allowed_set(b.set_id, true)).unwrap();
        }
        ch
    }

    fn publish(&mut self, b: &SetBundle, ghosts: Vec<HouseGhost>) {
        let mut w = self.world.borrow_mut();
        w.bundles.insert(b.set_id, b.encode());
        w.hashes.insert(b.set_id, b.hash());
        w.ghosts.insert(b.set_id, ghosts.encode());
    }

    fn call_at<R>(&mut self, caller: [u8; 20], block: u64, now: u64, f: impl FnOnce(&mut OabArena) -> R) -> R {
        let m = MockHostBuilder::new()
            .caller(caller)
            .block_number(block)
            .block_timestamp(now)
            .build();
        for (k, v) in self.m.storage_dump() {
            m.set_raw_storage(k, v);
        }
        let host = TestHost {
            inner: m.clone(),
            world: self.world.clone(),
            now,
        };
        let mut c = OabArena::with_host(host);
        let r = f(&mut c);
        self.ev.extend(m.events());
        self.calls = m.take_recorded_calls();
        self.m = m;
        r
    }

    /// A call at the next block (each block gives fresh start entropy).
    fn call<R>(&mut self, caller: [u8; 20], f: impl FnOnce(&mut OabArena) -> R) -> R {
        self.block += 1;
        let b = self.block;
        self.call_at(caller, b, T0, f)
    }

    fn bind(&mut self, key: [u8; 20], owner: [u8; 20], expires: u64) {
        self.world.borrow_mut().sessions.insert(key, (owner, expires, false));
    }

    fn game(&mut self, player: [u8; 20]) -> Option<ModeGame> {
        let b = self.call(ADMIN, |c| c.get_game(Address(player)));
        (!b.0.is_empty()).then(|| ModeGame::decode(&mut &b.0[..]).expect("ModeGame"))
    }

    fn pool(&mut self, set: u16, round: u8, wins: u8, lives: u8) -> GhostPool {
        let b = self.call(ADMIN, |c| c.get_ghosts(set, round, wins, lives));
        GhostPool::decode(&mut &b.0[..]).unwrap()
    }

    fn set_pool(&self, set: u16, round: u8, wins: u8, lives: u8, pool: &GhostPool) {
        let mut k = vec![6u8];
        k.extend_from_slice(&bracket_bytes(set, round, wins, lives));
        self.m.set_raw_storage(keccak256(&k).to_vec(), pool.encode());
    }

    fn storage(&self) -> Vec<(Vec<u8>, Vec<u8>)> {
        let mut d = self.m.storage_dump();
        d.sort();
        d
    }

    fn events_of(&self, topic: [u8; 32]) -> Vec<Event> {
        self.ev.iter().filter(|(t, _)| t[0] == topic).cloned().collect()
    }

    fn reports(&self) -> Vec<([u8; 32], BattleReport)> {
        self.events_of(BattleReported::TOPIC)
            .into_iter()
            .map(|(t, d)| (t[1], decode_report(&d)))
            .collect()
    }
}

/// The SCALE report inside a `BattleReported` data field (ABI `bytes`).
fn decode_report(data: &[u8]) -> BattleReport {
    let len = u64::from_be_bytes(data[56..64].try_into().unwrap()) as usize;
    BattleReport::decode(&mut &data[64..64 + len]).expect("BattleReport")
}

/// Three boards per round for rounds 1..=10, as the published sets have.
fn house_ghosts(b: &SetBundle) -> Vec<HouseGhost> {
    let ids: Vec<CardId> = b.set.cards.iter().filter(|e| e.rarity > 0).map(|e| e.card_id).collect();
    let mut out = Vec::new();
    for round in 1..=10u8 {
        for k in 0..3usize {
            let n = (round as usize).min(5);
            out.push(HouseGhost {
                round,
                board: (0..n)
                    .map(|i| GhostBoardUnit {
                        card_id: ids[(round as usize * 7 + k * 3 + i) % ids.len()],
                        perm_attack: (round / 4) as i16,
                        perm_health: (round / 4) as i16 + k as i16,
                    })
                    .collect(),
            });
        }
    }
    out
}

fn bundle(set_id: u16) -> SetBundle {
    asset_bundles().into_iter().find(|b| b.set_id == set_id).unwrap()
}

fn is_err(r: Result<impl std::fmt::Debug, ArenaError>, name: &str) -> bool {
    match r {
        Err(e) => format!("{e:?}").starts_with(name),
        Ok(v) => panic!("expected {name}, got Ok({v:?})"),
    }
}

/// Play the corpus policy until the game is over. Returns the turns played.
fn play_to_end(ch: &mut Chain, signer: [u8; 20], player: [u8; 20]) -> usize {
    let config = arena_config();
    let mut turns = 0;
    loop {
        let g = ch.game(player).expect("game");
        if g.state.phase != GamePhase::Shop {
            return turns;
        }
        let b = bundle(g.set_id);
        let action = policy_action(&g.state, &config, &b);
        ch.call(signer, |c| c.submit_turn(Bytes(action.encode()))).expect("turn");
        turns += 1;
        assert!(turns < 60, "game does not end");
    }
}

// ── storage limits ────────────────────────────────────────────────────────────

/// The largest board unit: card id and buffs at their extremes.
fn max_unit() -> BoardUnit {
    BoardUnit {
        card_id: CardId(u16::MAX),
        perm_attack: i16::MIN,
        perm_health: i16::MIN,
    }
}

fn max_ghost_board() -> Vec<GhostBoardUnit> {
    vec![
        GhostBoardUnit {
            card_id: CardId(u16::MAX),
            perm_attack: i16::MIN,
            perm_health: i16::MIN,
        };
        5
    ]
}

// pallet-revive refuses an item above 416 bytes, and the call that writes it
// fails. So every item type must fit at its largest possible size, or a game
// would get stuck the first time it reaches that size.
#[test]
fn every_storage_item_fits_416_bytes_at_its_maximum() {
    let config = arena_config();
    // A game never holds more than `bag_size` cards (cards only leave the
    // bag, hand, and board). Bound it from above: a full bag AND a full hand
    // AND a full board, every field at its widest value.
    let game = ModeGame {
        run_id: u64::MAX,
        engine_version: u32::MAX,
        set_id: u16::MAX,
        set_hash: [0xFF; 32],
        config: config.clone(),
        state: LocalGameState {
            bag: vec![CardId(u16::MAX); config.bag_size as usize],
            hand: vec![CardId(u16::MAX); config.hand_size as usize],
            board: vec![Some(max_unit()); config.board_size as usize],
            mana_limit: u8::MAX,
            shop_mana: u8::MAX,
            round: u8::MAX,
            lives: u8::MAX,
            wins: u8::MAX,
            phase: GamePhase::Completed,
            next_card_id: u16::MAX,
            game_seed: u64::MAX,
        },
        alias: Some([0xFF; 32]),
        started_block: u64::MAX,
    };
    let sizes = [
        ("GAME Option<ModeGame>", Some(game).encode().len()),
        ("GHOST pool, 10 boards of 5", vec![max_ghost_board(); MAX_GHOSTS_PER_BRACKET].encode().len()),
        ("HOUSE round, 10 boards of 5", vec![max_ghost_board(); MAX_GHOSTS_PER_BRACKET].encode().len()),
        (
            "CONFIG",
            Config {
                identity: [0xFF; 20],
                content: [0xFF; 20],
                engine: [0xFF; 20],
                draining: true,
            }
            .encode()
            .len(),
        ),
        (
            "SET_META",
            SetMeta {
                hash: [0xFF; 32],
                len: u32::MAX,
                pages: u8::MAX,
                house_rounds: u8::MAX,
                allowed: true,
            }
            .encode()
            .len(),
        ),
        ("NEXT_RUN", u64::MAX.encode().len()),
        ("ADMIN", [0xFFu8; 20].encode().len()),
    ];
    for (name, len) in sizes {
        println!("{name}: {len} bytes");
        assert!(len <= STORAGE_BYTES, "{name} is {len} bytes");
    }
    // The house cache keeps no more than ten boards per round, whatever
    // Content publishes (64 ghosts of one round would be 2 KB).
    let flood: Vec<HouseGhost> = (0..64)
        .map(|_| HouseGhost {
            round: 1,
            board: max_ghost_board(),
        })
        .collect();
    let rounds = house_by_round(&flood);
    assert_eq!(rounds.len(), 1);
    assert_eq!(rounds[0].len(), MAX_GHOSTS_PER_BRACKET);
    assert!(rounds[0].encode().len() <= STORAGE_BYTES);
}

// The same claim, measured: after real play on every set, no stored item is
// above the limit (TestHost also refuses such a write at once).
#[test]
fn every_item_written_by_real_play_fits() {
    let mut ch = Chain::with_sets(true);
    for (i, set) in [0u16, 1, 2].iter().enumerate() {
        let p = [0x60 + i as u8; 20];
        ch.call(p, |c| c.start_game(*set)).unwrap();
        play_to_end(&mut ch, p, p);
        ch.call(p, |c| c.end_game()).unwrap();
    }
    let largest = ch.storage().iter().map(|(_, v)| v.len()).max().unwrap();
    println!("largest stored item: {largest} bytes");
    assert!(largest <= STORAGE_BYTES);
    // The bundle pages are full pages except the last one.
    for set in 0..3u16 {
        let len = bundle(set).encode().len();
        let (_, l, pages, _, _) = ch.call(ADMIN, |c| c.set_info(set));
        assert_eq!(l as usize, len);
        assert_eq!(pages as usize, len.div_ceil(STORAGE_BYTES));
    }
}

// ── the game ──────────────────────────────────────────────────────────────────

// The core product: anyone can start a casual game, play every turn on chain,
// reach game over, end it, and start again.
#[test]
fn a_full_casual_game_runs_to_game_over_and_a_new_one_can_start() {
    let mut ch = Chain::with_sets(true);
    let run = ch.call(ALICE, |c| c.start_game(1)).unwrap();
    assert_eq!(run, 1);
    let g = ch.game(ALICE).unwrap();
    assert_eq!((g.run_id, g.set_id, g.engine_version), (1, 1, ENGINE_VERSION));
    assert_eq!(g.set_hash, bundle(1).hash(), "the game pins the Content set hash");
    assert_eq!(g.config, arena_config());
    assert_eq!(g.alias, None);
    assert!(is_err(ch.call(ALICE, |c| c.start_game(0)), "GameActive"));
    assert!(is_err(ch.call(ALICE, |c| c.end_game()), "WrongPhase"), "cannot end a running game");

    let turns = play_to_end(&mut ch, ALICE, ALICE);
    let g = ch.game(ALICE).unwrap();
    assert_eq!(g.state.phase, GamePhase::Completed);
    assert!(g.state.lives == 0 || g.state.wins >= g.config.wins_to_victory);
    assert!(is_err(ch.call(ALICE, |c| c.submit_turn(Bytes(CommitTurnAction { actions: vec![] }.encode()))), "WrongPhase"));

    // One report per turn, each for Alice and run 1, in round order.
    let reports = ch.reports();
    assert_eq!(reports.len(), turns);
    for (i, (player, r)) in reports.iter().enumerate() {
        assert_eq!(*player, addr_word(ALICE));
        assert_eq!(r.round as usize, i + 1);
        assert_eq!(r.engine_version, ENGINE_VERSION);
    }
    let last = &reports.last().unwrap().1;
    assert_eq!((last.wins, last.lives), (g.state.wins, g.state.lives));

    assert_eq!(ch.call(ALICE, |c| c.end_game()).ok(), Some(false), "no Records yet: not reported");
    let ended = ch.events_of(GameEnded::TOPIC);
    assert_eq!(ended.len(), 1);
    assert_eq!(ended[0].0[1], addr_word(ALICE));
    assert_eq!(ended[0].0[2][24..], 1u64.to_be_bytes());
    assert_eq!(ch.game(ALICE), None);
    // The final board waits in its bracket for later players (arena v2).
    let final_ghost = oab_engine::board_to_ghost(&g.state.board);
    if !final_ghost.is_empty() {
        let pool = ch.pool(1, g.state.round, g.state.wins, g.state.lives);
        assert_eq!(pool.last(), Some(&final_ghost));
    }
    assert!(is_err(ch.call(ALICE, |c| c.end_game()), "NoGame"));

    // A second game overwrites the same item and gets the next run id.
    let items = ch.storage().len();
    assert_eq!(ch.call(ALICE, |c| c.start_game(2)).unwrap(), 2);
    assert_eq!(ch.storage().len(), items, "no new item for a returning player");
    assert_eq!(ch.events_of(GameStarted::TOPIC).len(), 2);
    ch.call(ALICE, |c| c.abandon_game()).unwrap();
    assert_eq!(ch.events_of(GameAbandoned::TOPIC).len(), 1);
    assert_eq!(ch.game(ALICE), None);
}

// Section 7.7: a client replays any battle from the event and the set bundle
// alone, and gets the result the chain reported.
#[test]
fn every_reported_battle_replays_to_the_reported_result() {
    let mut ch = Chain::with_sets(true);
    for (i, set) in [0u16, 1, 2].iter().enumerate() {
        let p = [0x70 + i as u8; 20];
        ch.call(p, |c| c.start_game(*set)).unwrap();
        play_to_end(&mut ch, p, p);
    }
    let reports = ch.reports();
    assert!(reports.len() >= 9, "{} reports", reports.len());
    let mut fought = 0;
    for (_, r) in reports {
        let bytes = ch.call(BOB, |c| c.get_set_bundle(r.set_id));
        let b = SetBundle::decode(&mut &bytes.0[..]).unwrap();
        assert_eq!(b, bundle(r.set_id), "the arena serves the cached bundle");
        let events = oab_engine::replay_battle(
            &r.player_board,
            &r.opponent,
            r.battle_seed,
            &b.card_pool(),
            arena_config().board_size as usize,
        );
        assert_eq!(oab_engine::battle_result(&events), r.result);
        if !r.opponent.is_empty() && !r.player_board.is_empty() {
            fought += 1;
        }
    }
    assert!(fought >= 5, "house ghosts give real fights: {fought}");
}

// ── sessions (Identity) ───────────────────────────────────────────────────────

// The point of a session key: it signs, the game belongs to its owner. The
// seeds are the owner's, so a new key cannot reroll the owner's game.
#[test]
fn a_session_key_plays_for_its_owner() {
    let mut ch = Chain::with_sets(true);
    ch.bind(KEY, ALICE, T0 + HOUR);
    let block = ch.block + 1;
    ch.call(KEY, |c| c.start_game(0)).unwrap();
    // Identity was asked about the signer.
    let resolve = ch
        .calls
        .iter()
        .find(|(to, input)| *to == IDENTITY && input[..4] == selector("resolve(address)"))
        .expect("resolve call");
    assert_eq!(resolve.1[16..36], KEY);
    assert_eq!(ch.game(KEY), None, "the key owns nothing");
    let g = ch.game(ALICE).expect("the owner's game");
    let seed = arena_v2_seed(&ALICE, b"start", arena_v2_block_entropy(block));
    assert_eq!(g.state, oab_engine::new_game(&arena_config(), &bundle(0), seed), "seeded by the owner");
    assert_eq!(ch.events_of(GameStarted::TOPIC)[0].0[1], addr_word(ALICE));

    // The key plays a turn; the owner's game moves and the report names her.
    let action = policy_action(&g.state, &arena_config(), &bundle(0));
    ch.call(KEY, |c| c.submit_turn(Bytes(action.encode()))).unwrap();
    assert_eq!(ch.game(ALICE).unwrap().state.round, 2);
    assert_eq!(ch.reports()[0].0, addr_word(ALICE));
    // Owner and key share one game.
    assert!(is_err(ch.call(ALICE, |c| c.start_game(1)), "GameActive"));
    play_to_end(&mut ch, ALICE, ALICE);
    assert!(ch.call(KEY, |c| c.end_game()).is_ok());
    assert_eq!(ch.game(ALICE), None);
}

// Q3: an expired or revoked key must never act, not even as itself. The call
// reverts and changes nothing.
#[test]
fn an_expired_or_revoked_key_reverts_and_changes_nothing() {
    let mut ch = Chain::with_sets(true);
    ch.bind(KEY, ALICE, T0 + HOUR);
    ch.call(KEY, |c| c.start_game(0)).unwrap();
    let before = ch.storage();
    let n_ev = ch.ev.len();
    let action = Bytes(CommitTurnAction { actions: vec![] }.encode());

    // Expired: at the expiry second.
    let b = ch.block + 1;
    let r = ch.call_at(KEY, b, T0 + HOUR, |c| c.submit_turn(action.clone()));
    assert!(matches!(&r, Err(ArenaError::InvalidSession(e)) if e.account.0 == KEY), "{r:?}");
    let r = ch.call_at(KEY, b, T0 + HOUR, |c| c.abandon_game());
    assert!(matches!(r, Err(ArenaError::InvalidSession(_))));

    // Revoked, still before the expiry.
    ch.world.borrow_mut().sessions.get_mut(&KEY).unwrap().2 = true;
    assert!(is_err(ch.call(KEY, |c| c.submit_turn(action.clone())), "InvalidSession"));
    assert!(is_err(ch.call(KEY, |c| c.start_game(1)), "InvalidSession"));
    assert!(is_err(ch.call(KEY, |c| c.end_game()), "InvalidSession"));

    assert_eq!(ch.storage(), before, "no write");
    assert_eq!(ch.ev.len(), n_ev, "no event");
    // The owner still plays her game on her own account.
    ch.call(ALICE, |c| c.submit_turn(action)).unwrap();
}

// Q3: with no working Identity there is no player, so there is no game.
#[test]
fn without_a_working_identity_no_call_plays() {
    let mut ch = Chain::new();
    ch.call(ADMIN, |c| c.set_deps(Address([0; 20]), Address(CONTENT), Address(ENGINE))).unwrap();
    assert!(is_err(ch.call(ALICE, |c| c.start_game(0)), "NotConfigured"));
    let mut ch = Chain::with_sets(false);
    ch.world.borrow_mut().identity_broken = true;
    assert!(is_err(ch.call(ALICE, |c| c.start_game(0)), "IdentityUnavailable"));
    assert_eq!(ch.game(ALICE), None);
}

// ── ghosts ────────────────────────────────────────────────────────────────────

// Q1: a fresh deployment has empty brackets. A player must meet a house ghost
// there, not an empty board (a free win).
#[test]
fn an_empty_bracket_fights_a_house_ghost() {
    let mut ch = Chain::with_sets(true);
    ch.call(ALICE, |c| c.start_game(0)).unwrap();
    let g = ch.game(ALICE).unwrap();
    assert!(ch.pool(0, 1, 0, 3).is_empty());
    let action = policy_action(&g.state, &arena_config(), &bundle(0));
    ch.call(ALICE, |c| c.submit_turn(Bytes(action.encode()))).unwrap();
    let r = &ch.reports()[0].1;
    let house: Vec<_> = house_ghosts(&bundle(0)).into_iter().filter(|h| h.round == 1).map(|h| h.board).collect();
    assert!(!r.opponent.is_empty());
    assert!(house.contains(&r.opponent), "opponent {:?} is a round-1 house ghost", r.opponent);
    // The player's board joined the bracket for the next player.
    assert_eq!(ch.pool(0, 1, 0, 3), vec![r.player_board.clone()]);

    // Late rounds use the last cached house round.
    let view = |ch: &mut Chain, round| GhostPool::decode(&mut &ch.call(BOB, |c| c.get_house_ghosts(0, round)).0[..]).unwrap();
    let r10 = view(&mut ch, 10);
    assert_eq!(r10.len(), 3);
    assert_eq!(view(&mut ch, 14), r10);
}

// A set without house ghosts keeps arena v2's behaviour: an empty bracket
// gives an empty opponent.
#[test]
fn without_house_ghosts_an_empty_bracket_is_an_empty_board() {
    let mut ch = Chain::with_sets(false);
    ch.call(ALICE, |c| c.start_game(0)).unwrap();
    let g = ch.game(ALICE).unwrap();
    let action = policy_action(&g.state, &arena_config(), &bundle(0));
    ch.call(ALICE, |c| c.submit_turn(Bytes(action.encode()))).unwrap();
    assert!(ch.reports()[0].1.opponent.is_empty());
}

// A thin bracket (fewer than THIN_POOL boards) draws from the pool and the
// house ghosts; a full one only from players' boards.
#[test]
fn thin_brackets_mix_in_house_ghosts_and_full_ones_do_not() {
    let house = vec![vec![GhostBoardUnit { card_id: CardId(1), perm_attack: 0, perm_health: 0 }]; 3];
    let player_board = |n: i16| vec![GhostBoardUnit { card_id: CardId(2), perm_attack: n, perm_health: 0 }];
    let thin: GhostPool = vec![player_board(1)];
    let full: GhostPool = (0..THIN_POOL as i16).map(player_board).collect();
    let (mut from_house, mut from_pool) = (0, 0);
    for seed in 0..200u64 {
        let o = pick_opponent(&thin, &house, seed);
        if house.contains(&o) {
            from_house += 1;
        } else {
            assert_eq!(o, thin[0]);
            from_pool += 1;
        }
        assert!(full.contains(&pick_opponent(&full, &house, seed)));
    }
    assert!(from_house > 100 && from_pool > 20, "house {from_house}, pool {from_pool}");
    assert!(pick_opponent(&vec![], &vec![], 7).is_empty());
}

// A bracket holds the ten newest boards: it never outgrows its storage item,
// and old boards make way for new ones.
#[test]
fn a_ghost_bracket_keeps_the_ten_newest_boards() {
    let mut ch = Chain::with_sets(true);
    let mut boards = Vec::new();
    for i in 0..16u8 {
        let p = [0x80 + i; 20];
        ch.call(p, |c| c.start_game(0)).unwrap();
        let g = ch.game(p).unwrap();
        let action = policy_action(&g.state, &arena_config(), &bundle(0));
        ch.call(p, |c| c.submit_turn(Bytes(action.encode()))).unwrap();
        let board = ch.reports().last().unwrap().1.player_board.clone();
        if !board.is_empty() {
            boards.push(board);
        }
    }
    assert!(boards.len() > MAX_GHOSTS_PER_BRACKET + 1);
    let pool = ch.pool(0, 1, 0, 3);
    assert_eq!(pool.len(), MAX_GHOSTS_PER_BRACKET);
    let newest = boards[boards.len() - MAX_GHOSTS_PER_BRACKET..].to_vec();
    assert_eq!(pool, newest, "the oldest are gone, order kept");

    let mut p: GhostPool = Vec::new();
    push_ghost(&mut p, Vec::new());
    assert!(p.is_empty(), "an empty board is not a ghost");
}

#[test]
fn house_rounds_fill_gaps_from_the_nearest_round() {
    let g = |round, id| HouseGhost { round, board: vec![GhostBoardUnit { card_id: CardId(id), perm_attack: 0, perm_health: 0 }] };
    let rounds = house_by_round(&[g(3, 3), g(5, 5), g(MAX_HOUSE_ROUND + 1, 9), g(0, 9), HouseGhost { round: 4, board: vec![] }]);
    let ids: Vec<u16> = rounds.iter().map(|p| p[0][0].card_id.0).collect();
    assert_eq!(ids, vec![3, 3, 3, 3, 5], "rounds 1-2 take round 3, round 4 takes round 3");
    assert!(house_by_round(&[]).is_empty());
}

// ── turns ─────────────────────────────────────────────────────────────────────

// A turn that breaks a rule reverts with the engine's error and changes
// nothing: no state, no ghost, no report.
#[test]
fn a_turn_with_invalid_actions_reverts_and_changes_nothing() {
    let mut ch = Chain::with_sets(true);
    ch.call(ALICE, |c| c.start_game(0)).unwrap();
    let before = ch.storage();
    let n_ev = ch.ev.len();
    let bad = CommitTurnAction { actions: vec![TurnAction::BurnFromHand { hand_index: 99 }] };
    let r = ch.call(ALICE, |c| c.submit_turn(Bytes(bad.encode())));
    match r {
        Err(ArenaError::InvalidTurn(e)) => {
            assert_eq!(GameError::decode(&mut &e.error.0[..]).unwrap(), GameError::InvalidHandIndex { index: 99 })
        }
        other => panic!("{other:?}"),
    }
    assert!(is_err(ch.call(ALICE, |c| c.submit_turn(Bytes(vec![0xFF, 0xFF]))), "BadInput"));
    assert!(is_err(ch.call(BOB, |c| c.submit_turn(Bytes(CommitTurnAction { actions: vec![] }.encode()))), "NoGame"));
    assert_eq!(ch.storage(), before);
    assert_eq!(ch.ev.len(), n_ev);
}

// M1 proved engine version 1 == arena v2 on the golden-vector corpus. This
// proves the new arena == the engine (so == arena v2) on the same corpus:
// same start seed and state, same battle seeds, same post-turn states, same
// opponents and results. It also proves the seeds come from the player.
#[test]
fn the_arena_matches_the_golden_vectors_turn_by_turn() {
    let all = traces();
    let mut turns = 0;
    for t in &all {
        // No house ghosts: an empty corpus opponent is an empty board, as in v2.
        let mut ch = Chain::with_sets(false);
        let set = t.case.set_id;
        ch.call_at(t.case.caller, t.case.block, T0, |c| c.start_game(set)).unwrap();
        let g = ch.game(t.case.caller).unwrap();
        assert_eq!(g.state.game_seed, t.start_seed, "start seed");
        assert_eq!(g.state, t.start, "start state");
        for step in &t.steps {
            let before = ch.game(t.case.caller).unwrap().state;
            // Force the opponent: the bracket holds only the corpus board.
            let pool: GhostPool = if step.opponent.is_empty() { vec![] } else { vec![step.opponent.clone()] };
            ch.set_pool(set, before.round, before.wins, before.lives, &pool);
            let r = ch.call(t.case.caller, |c| c.submit_turn(Bytes(step.action.encode())));
            let after = ch.game(t.case.caller).unwrap().state;
            match &step.output {
                Err(e) => {
                    assert!(matches!(&r, Err(ArenaError::InvalidTurn(x)) if x.error.0 == e.encode()));
                    assert_eq!(after, before);
                }
                Ok(out) => {
                    turns += 1;
                    assert_eq!(r.ok(), Some(step.battle_seed), "battle seed");
                    assert_eq!(after, out.state, "state after turn {turns}");
                    let rep = ch.reports().last().unwrap().1.clone();
                    assert_eq!(rep.opponent, step.opponent);
                    assert_eq!(rep.result, out.result);
                    assert_eq!(rep.player_board, out.player_board);
                    assert_eq!(rep.round, before.round);
                    assert_eq!((rep.wins, rep.lives), (out.state.wins, out.state.lives));
                }
            }
        }
        assert!(t.steps.len() <= MAX_TURNS + 1);
    }
    assert!(turns >= 60, "corpus too small: {turns}");
}

// ── admin and set cache ───────────────────────────────────────────────────────

// Modes trust Content only at cache time (section 9), so the copy must be
// exactly the pinned set; and only the admin wires and caches.
#[test]
fn cache_set_takes_only_the_pinned_bundle_and_only_from_the_admin() {
    let mut ch = Chain::new();
    let b = bundle(0);
    assert!(is_err(ch.call(ADMIN, |c| c.cache_set(0)), "SetUnavailable"), "Content has no set 0 yet");
    ch.publish(&b, house_ghosts(&b));
    ch.world.borrow_mut().hashes.insert(0, [7; 32]);
    assert!(is_err(ch.call(ADMIN, |c| c.cache_set(0)), "BadContent"), "hash mismatch");
    ch.world.borrow_mut().bundles.insert(0, vec![1, 2, 3]);
    assert!(is_err(ch.call(ADMIN, |c| c.cache_set(0)), "BadContent"), "not a bundle");
    ch.world.borrow_mut().bundles.insert(0, bundle(1).encode());
    ch.world.borrow_mut().hashes.insert(0, bundle(1).hash());
    assert!(is_err(ch.call(ADMIN, |c| c.cache_set(0)), "BadContent"), "another set's bundle");
    ch.publish(&b, house_ghosts(&b));
    assert!(is_err(ch.call(BOB, |c| c.cache_set(0)), "NotAdmin"));
    ch.call(ADMIN, |c| c.cache_set(0)).unwrap();
    assert!(is_err(ch.call(ADMIN, |c| c.cache_set(0)), "AlreadyCached"));
    let (hash, _, _, house_rounds, allowed) = ch.call(ADMIN, |c| c.set_info(0));
    assert_eq!((hash, house_rounds, allowed), (b.hash(), 10, false));

    assert!(is_err(ch.call(ALICE, |c| c.start_game(0)), "SetNotAllowed"));
    assert!(is_err(ch.call(ALICE, |c| c.start_game(1)), "SetUnavailable"));
    assert!(is_err(ch.call(BOB, |c| c.set_allowed_set(0, true)), "NotAdmin"));
    assert!(is_err(ch.call(ADMIN, |c| c.set_allowed_set(1, true)), "SetUnavailable"));
    ch.call(ADMIN, |c| c.set_allowed_set(0, true)).unwrap();
    ch.call(ALICE, |c| c.start_game(0)).unwrap();

    // Draining: no new games, running games go on.
    assert!(is_err(ch.call(BOB, |c| c.set_draining(true)), "NotAdmin"));
    ch.call(ADMIN, |c| c.set_draining(true)).unwrap();
    assert!(is_err(ch.call(BOB, |c| c.start_game(0)), "Draining"));
    let g = ch.game(ALICE).unwrap();
    let action = policy_action(&g.state, &arena_config(), &b);
    ch.call(ALICE, |c| c.submit_turn(Bytes(action.encode()))).unwrap();

    assert!(is_err(ch.call(BOB, |c| c.set_deps(Address(BOB), Address(BOB), Address(BOB))), "NotAdmin"));
    let d = ch.call(BOB, |c| c.deps());
    assert_eq!(d, (Address(IDENTITY), Address(CONTENT), Address(ENGINE), true));
    assert_eq!(ch.call(BOB, |c| c.admin_address()), Address(ADMIN));
    assert_eq!(OabArena::engine_version(), ENGINE_VERSION);
    assert_eq!(BattleResult::Victory.encode(), vec![0u8], "client decodes result 0 as victory");
}
