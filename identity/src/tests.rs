//! Native tests against `MockHost`. Run from the repo root:
//!   CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path identity/Cargo.toml --features std

use super::oab_identity::{
    IdentityError, OabIdentity, SessionOffered, SessionRegistered, SessionRevoked,
};
use super::{KeyRecord, OwnerRecord, DEFAULT_MAX_TTL, STATE_BOUND, STATE_OFFERED, STORAGE_BYTES};
use pvm_contract_sdk::{Address, MockHost, MockHostBuilder, SolEvent};

const ADMIN: [u8; 20] = [0xAD; 20];
const ALICE: [u8; 20] = [0xA1; 20];
const BOB: [u8; 20] = [0xB0; 20];
const KEY_1: [u8; 20] = [0x51; 20];
const KEY_2: [u8; 20] = [0x52; 20];
const T0: u64 = 1_800_000_000;
const HOUR: u64 = 3600;

/// One contract's storage, called by any account at any time. MockHost fixes
/// the caller and the clock at build time, so every call builds a new host
/// over the same storage.
struct Chain {
    m: MockHost,
    /// Events of every call so far.
    ev: Vec<(Vec<[u8; 32]>, Vec<u8>)>,
}

impl Chain {
    fn deploy() -> Self {
        let m = MockHostBuilder::new()
            .caller(ADMIN)
            .block_timestamp(T0)
            .build();
        OabIdentity::with_host(m.clone()).new();
        let ev = m.events();
        Chain { m, ev }
    }

    fn call<R>(&mut self, caller: [u8; 20], now: u64, f: impl FnOnce(&mut OabIdentity) -> R) -> R {
        let m = MockHostBuilder::new()
            .caller(caller)
            .block_timestamp(now)
            .build();
        for (k, v) in self.m.storage_dump() {
            m.set_raw_storage(k, v);
        }
        let mut c = OabIdentity::with_host(m.clone());
        let r = f(&mut c);
        self.ev.extend(m.events());
        self.m = m;
        r
    }

    fn offer(
        &mut self,
        owner: [u8; 20],
        key: [u8; 20],
        expires_at: u64,
    ) -> Result<(), IdentityError> {
        self.call(owner, T0, |c| c.register_session(Address(key), expires_at))
    }

    fn accept(&mut self, key: [u8; 20], owner: [u8; 20], now: u64) -> Result<(), IdentityError> {
        self.call(key, now, |c| c.accept_session(Address(owner)))
    }

    /// Offer and accept: the full setup a client does (one prompt + one
    /// silent session-signed call).
    fn bind(&mut self, owner: [u8; 20], key: [u8; 20], expires_at: u64) {
        self.offer(owner, key, expires_at).expect("offer");
        self.accept(key, owner, T0).expect("accept");
    }

    fn resolve(&mut self, account: [u8; 20], now: u64) -> Result<[u8; 20], IdentityError> {
        self.call(ADMIN, now, |c| c.resolve(Address(account)).map(|a| a.0))
    }

    fn events(&self, topic: [u8; 32]) -> Vec<(Vec<[u8; 32]>, Vec<u8>)> {
        self.ev
            .iter()
            .filter(|(t, _)| t[0] == topic)
            .cloned()
            .collect()
    }
}

fn topic_addr(a: [u8; 20]) -> [u8; 32] {
    let mut t = [0u8; 32];
    t[12..].copy_from_slice(&a);
    t
}

fn is_invalid_session(r: Result<[u8; 20], IdentityError>, account: [u8; 20]) -> bool {
    matches!(r, Err(IdentityError::InvalidSession(e)) if e.account.0 == account)
}

// The point of a session: the key signs, the game credits the player. Both
// sides sign, and the key acts for the player only after it accepted.
#[test]
fn a_session_key_resolves_to_its_player_only_after_it_accepts() {
    let mut ch = Chain::deploy();
    ch.offer(ALICE, KEY_1, T0 + HOUR).unwrap();
    assert_eq!(
        ch.resolve(KEY_1, T0).unwrap(),
        KEY_1,
        "an offer alone binds nothing: the key is still a plain account"
    );
    ch.accept(KEY_1, ALICE, T0 + 1).unwrap();
    assert_eq!(ch.resolve(KEY_1, T0 + 1).unwrap(), ALICE);
    assert_eq!(
        ch.resolve(KEY_1, T0 + HOUR - 1).unwrap(),
        ALICE,
        "live until the last second"
    );
    // The player still plays as itself on its own account.
    assert_eq!(ch.resolve(ALICE, T0 + 1).unwrap(), ALICE);
    assert_eq!(
        ch.call(ADMIN, T0, |c| c.session_of(Address(ALICE))),
        (Address(KEY_1), T0 + HOUR, STATE_BOUND)
    );
    assert_eq!(
        ch.call(ADMIN, T0, |c| c.key_of(Address(KEY_1))),
        (Address(ALICE), T0 + HOUR, false)
    );
    // Indexers and the client follow both steps by owner and key.
    let offered = ch.events(SessionOffered::TOPIC);
    let registered = ch.events(SessionRegistered::TOPIC);
    assert_eq!(offered.len(), 1);
    assert_eq!(registered.len(), 1);
    let (t, data) = &registered[0];
    assert_eq!(t[1], topic_addr(ALICE));
    assert_eq!(t[2], topic_addr(KEY_1));
    assert_eq!(data[24..32], (T0 + HOUR).to_be_bytes());
}

// Casual play is open to everyone: an account that was never a session key is
// the player itself (the reference registry's rule; design kind `Direct`).
#[test]
fn a_plain_account_resolves_to_itself() {
    let mut ch = Chain::deploy();
    assert_eq!(ch.resolve(BOB, T0).unwrap(), BOB);
    assert_eq!(ch.resolve([0u8; 20], T0).unwrap(), [0u8; 20]);
}

// The session mnemonic sits in plain host storage on Android. Expiry caps how
// long a leaked key is useful. After expiry the key must not fall back to
// acting as itself (it would start a fresh casual identity): it reverts (Q3).
#[test]
fn an_expired_key_reverts_and_never_plays_as_itself() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    assert!(is_invalid_session(ch.resolve(KEY_1, T0 + HOUR), KEY_1));
    assert!(is_invalid_session(
        ch.resolve(KEY_1, T0 + 365 * 24 * HOUR),
        KEY_1
    ));
    // Expired is burned: neither the owner nor anyone else can bind it again.
    assert!(matches!(
        ch.call(ALICE, T0 + 2 * HOUR, |c| c
            .register_session(Address(KEY_1), T0 + 3 * HOUR)),
        Err(IdentityError::SessionKeyBurned(_))
    ));
    assert!(matches!(
        ch.call(BOB, T0 + 2 * HOUR, |c| c
            .register_session(Address(KEY_1), T0 + 3 * HOUR)),
        Err(IdentityError::SessionKeyBurned(_))
    ));
}

// Revoke is the answer to a leaked key. The key must stop working at once and
// for good, and it must not turn into a fresh casual player.
#[test]
fn a_revoked_key_reverts_and_is_burned_for_good() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    ch.call(ALICE, T0, |c| c.revoke_session()).unwrap();
    assert!(is_invalid_session(ch.resolve(KEY_1, T0), KEY_1));
    assert_eq!(
        ch.call(ADMIN, T0, |c| c.key_of(Address(KEY_1))),
        (Address(ALICE), T0 + HOUR, true)
    );
    assert_eq!(
        ch.call(ADMIN, T0, |c| c.session_of(Address(ALICE))),
        (Address([0u8; 20]), 0, 0)
    );
    let revoked = ch.events(SessionRevoked::TOPIC);
    assert_eq!(revoked.len(), 1);
    assert_eq!(revoked[0].0[2], topic_addr(KEY_1));
    // The owner record is deleted, not left as an empty item: an empty item
    // keeps its item deposit locked on chain (seen live on Paseo Next).
    // Left: admin, max ttl, and the burned key's record.
    let dump = ch.m.storage_dump();
    assert_eq!(dump.len(), 3);
    assert!(dump.iter().all(|(_, v)| !v.is_empty()));
    // A burned key can never be registered again, by anyone.
    for owner in [ALICE, BOB] {
        assert!(matches!(
            ch.offer(owner, KEY_1, T0 + HOUR),
            Err(IdentityError::SessionKeyBurned(_))
        ));
    }
    // Nothing left to revoke.
    assert!(matches!(
        ch.call(ALICE, T0, |c| c.revoke_session()),
        Err(IdentityError::NoActiveSession(_))
    ));
}

// Limit: one session per player. A new offer is a rotation: the old key dies
// at once, so a lost device's key cannot keep playing.
#[test]
fn one_session_per_player_rotation_burns_the_old_key() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    ch.offer(ALICE, KEY_2, T0 + HOUR).unwrap();
    assert!(
        is_invalid_session(ch.resolve(KEY_1, T0), KEY_1),
        "the old key dies at the new offer, before the new key accepts"
    );
    assert_eq!(ch.resolve(KEY_2, T0).unwrap(), KEY_2, "not yet accepted");
    ch.accept(KEY_2, ALICE, T0).unwrap();
    assert_eq!(ch.resolve(KEY_2, T0).unwrap(), ALICE);
    assert_eq!(
        ch.call(ADMIN, T0, |c| c.session_of(Address(ALICE))),
        (Address(KEY_2), T0 + HOUR, STATE_BOUND)
    );
    assert!(matches!(
        ch.offer(ALICE, KEY_1, T0 + HOUR),
        Err(IdentityError::SessionKeyBurned(_))
    ));
}

// Without the key's own signature, a player could bind someone else's account
// as their session key: that account would then play for the attacker and,
// after a revoke, be locked out for good. The accept step stops this.
#[test]
fn a_player_cannot_bind_another_players_account() {
    let mut ch = Chain::deploy();
    // BOB offers ALICE's account as his session key. Nothing changes for her.
    ch.offer(BOB, ALICE, T0 + HOUR).unwrap();
    assert_eq!(ch.resolve(ALICE, T0).unwrap(), ALICE);
    // BOB withdraws the offer: ALICE's account is not burned.
    ch.call(BOB, T0, |c| c.revoke_session()).unwrap();
    assert_eq!(ch.resolve(ALICE, T0).unwrap(), ALICE);
    assert!(ch.call(BOB, T0, |c| c.revoke_session()).is_err());
    // ALICE still uses her account as a player with her own session.
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    assert_eq!(ch.resolve(KEY_1, T0).unwrap(), ALICE);
    // A key accepts only the offer it was given.
    ch.offer(BOB, KEY_2, T0 + HOUR).unwrap();
    assert!(matches!(
        ch.accept(KEY_2, ALICE, T0),
        Err(IdentityError::NoOffer(_))
    ));
    assert!(matches!(
        ch.accept(KEY_1, BOB, T0),
        Err(IdentityError::NoOffer(_))
    ));
}

// A key bound to one player can never be taken over by another player.
#[test]
fn a_bound_key_cannot_be_registered_by_another_player() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    assert!(matches!(
        ch.offer(BOB, KEY_1, T0 + HOUR),
        Err(IdentityError::SessionKeyInUse(_))
    ));
    assert!(matches!(
        ch.offer(ALICE, KEY_1, T0 + HOUR),
        Err(IdentityError::SessionKeyInUse(_)),
    ));
    assert_eq!(ch.resolve(KEY_1, T0).unwrap(), ALICE);
}

// Two offers for one key (by two players, before it accepts): the key binds
// to the one it accepts; the other offer can no longer bind it.
#[test]
fn a_key_with_two_offers_binds_once() {
    let mut ch = Chain::deploy();
    ch.offer(ALICE, KEY_1, T0 + HOUR).unwrap();
    ch.offer(BOB, KEY_1, T0 + HOUR).unwrap();
    ch.accept(KEY_1, ALICE, T0).unwrap();
    assert!(matches!(
        ch.accept(KEY_1, BOB, T0),
        Err(IdentityError::SessionKeyBurned(_))
    ));
    assert_eq!(ch.resolve(KEY_1, T0).unwrap(), ALICE);
}

// Owners and keys are separate roles. A session key that could own a session
// would chain sessions; resolve follows one link only.
#[test]
fn a_session_key_cannot_own_and_an_owner_cannot_be_a_key() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    assert!(matches!(
        ch.offer(KEY_1, KEY_2, T0 + HOUR),
        Err(IdentityError::SessionKeyCannotOwn(_))
    ));
    // Still true after the key is burned.
    ch.call(ALICE, T0, |c| c.revoke_session()).unwrap();
    assert!(matches!(
        ch.offer(KEY_1, KEY_2, T0 + HOUR),
        Err(IdentityError::SessionKeyCannotOwn(_))
    ));
    // BOB owns a session, so he cannot accept to be ALICE's key.
    ch.offer(BOB, KEY_2, T0 + HOUR).unwrap();
    ch.offer(ALICE, BOB, T0 + HOUR).unwrap();
    assert!(matches!(
        ch.accept(BOB, ALICE, T0),
        Err(IdentityError::OwnerCannotBeSessionKey(_))
    ));
    // Zero and self are not keys.
    assert!(matches!(
        ch.offer(ALICE, [0u8; 20], T0 + HOUR),
        Err(IdentityError::InvalidSessionKey(_))
    ));
    assert!(matches!(
        ch.offer(ALICE, ALICE, T0 + HOUR),
        Err(IdentityError::InvalidSessionKey(_))
    ));
}

// An offer is only good until its own expiry, and only while it is the
// owner's current offer.
#[test]
fn stale_offers_cannot_be_accepted() {
    let mut ch = Chain::deploy();
    ch.offer(ALICE, KEY_1, T0 + HOUR).unwrap();
    assert!(matches!(
        ch.accept(KEY_1, ALICE, T0 + HOUR),
        Err(IdentityError::OfferExpired(_))
    ));
    ch.offer(ALICE, KEY_2, T0 + HOUR).unwrap();
    assert!(matches!(
        ch.accept(KEY_1, ALICE, T0),
        Err(IdentityError::NoOffer(_))
    ));
    // KEY_1 was never bound, so the replaced offer did not burn it.
    assert_eq!(ch.resolve(KEY_1, T0).unwrap(), KEY_1);
    ch.offer(BOB, KEY_1, T0 + HOUR).unwrap();
}

// Limit: TTL. A long-lived key is a long-lived bearer credential. Only the
// admin may change the limit.
#[test]
fn expiry_must_be_in_the_future_and_within_max_ttl() {
    let mut ch = Chain::deploy();
    assert_eq!(ch.call(ADMIN, T0, |c| c.max_ttl()), DEFAULT_MAX_TTL);
    assert!(matches!(
        ch.offer(ALICE, KEY_1, T0),
        Err(IdentityError::InvalidExpiry(_))
    ));
    assert!(matches!(
        ch.offer(ALICE, KEY_1, T0 + DEFAULT_MAX_TTL + 1),
        Err(IdentityError::TtlTooLong(_))
    ));
    ch.offer(ALICE, KEY_1, T0 + DEFAULT_MAX_TTL).unwrap();

    assert!(matches!(
        ch.call(ALICE, T0, |c| c.set_max_ttl(10 * DEFAULT_MAX_TTL)),
        Err(IdentityError::NotAdmin(_))
    ));
    ch.call(ADMIN, T0, |c| c.set_max_ttl(HOUR)).unwrap();
    assert!(matches!(
        ch.offer(BOB, KEY_2, T0 + HOUR + 1),
        Err(IdentityError::TtlTooLong(_))
    ));
    ch.offer(BOB, KEY_2, T0 + HOUR).unwrap();
    assert_eq!(ch.call(ADMIN, T0, |c| c.admin_address()), Address(ADMIN));
}

// Ranked play is on hold. Until personhood is built, the stub must answer
// "not eligible" for everyone, and must still refuse a dead key.
#[test]
fn ranked_identity_stub_fails_closed() {
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    let r = ch
        .call(ADMIN, T0, |c| c.ranked_identity(Address(KEY_1)))
        .unwrap();
    assert_eq!(r, (Address(ALICE), 0, [0u8; 32]));
    let r = ch.call(ADMIN, T0 + HOUR, |c| c.ranked_identity(Address(KEY_1)));
    assert!(matches!(r, Err(IdentityError::InvalidSession(_))));
}

// pallet-revive stores at most 416 bytes per item; a bigger write fails on
// chain but not in MockHost. Every item this contract writes must fit.
#[test]
fn every_storage_item_fits_the_416_byte_limit() {
    assert_eq!(KeyRecord::SIZE, 29);
    assert_eq!(OwnerRecord::SIZE, 29);
    let mut ch = Chain::deploy();
    ch.bind(ALICE, KEY_1, T0 + HOUR);
    ch.offer(ALICE, KEY_2, T0 + HOUR).unwrap();
    ch.offer(BOB, [0x77; 20], T0 + HOUR).unwrap();
    ch.call(ADMIN, T0, |c| c.set_max_ttl(u64::MAX)).unwrap();
    let dump = ch.m.storage_dump();
    // admin, max ttl, KEY_1, ALICE, BOB
    assert_eq!(dump.len(), 5);
    for (_, v) in &dump {
        assert!(v.len() <= STORAGE_BYTES, "item of {} bytes", v.len());
        assert!(v.len() <= 32, "the read buffer is 32 bytes");
    }
}

// The records round-trip, so `resolve` reads exactly what `acceptSession`
// wrote.
#[test]
fn records_round_trip() {
    let k = KeyRecord {
        owner: ALICE,
        expires_at: u64::MAX - 1,
        revoked: true,
    };
    assert_eq!(KeyRecord::from_bytes(&k.to_bytes()), Some(k));
    let o = OwnerRecord {
        session: KEY_1,
        expires_at: 7,
        state: STATE_OFFERED,
    };
    assert_eq!(OwnerRecord::from_bytes(&o.to_bytes()), Some(o));
    assert_eq!(KeyRecord::from_bytes(&[0u8; 28]), None);
    assert_eq!(KeyRecord::from_bytes(&[]), None);
}
