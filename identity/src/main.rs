//! Open Auto Battler Identity (`@oab/identity`) — PolkaVM contract.
//!
//! The session registry every mode asks "which player does this caller act
//! for?" (`docs/CONTRACT_ARCHITECTURE.md` section 4.3, decisions Q2 and Q3).
//!
//! - A player (the product account) **offers** a session key with an expiry:
//!   `registerSession(session, expiresAt)`. One session per player: a new
//!   offer revokes and burns the player's previous session.
//! - The session key **accepts**: `acceptSession(owner)`. Only then does the
//!   key act for the player. Both sides must sign, so nobody can bind another
//!   person's account as their session key and lock that account out.
//! - `resolve(account)` is the hot path (every game call): one storage read.
//!   A live session key resolves to its owner. An account that was never a
//!   session key resolves to itself. An expired or revoked key **reverts**
//!   (Q3: a mode never guesses the player).
//! - A key that was ever bound stays recorded forever. It can never be bound
//!   again, and never plays as itself.
//!
//! Personhood (ranked identity) is on hold. `rankedIdentity` is a stub that
//! resolves the player and answers "not eligible", so a ranked mode fails
//! closed until a later Identity version adds the precompile check.
//!
//! Storage: every record is one 32-byte word at the fixed key
//! `keccak256(domain ++ key)`, read with `get_storage_or_zero` and written
//! with `set_storage_or_clear` (a zero word deletes the item and frees its
//! deposit). Every item is far below pallet-revive's 416-byte limit
//! (`pallet_revive::limits::STORAGE_BYTES`). Do not mix in `set_storage` with
//! a 32-byte slice: pallet-revive treats that as a different (variable) key.
//! The contract has no allocator, to keep the code blob that every game call
//! loads small.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

/// Largest value pallet-revive stores in one item.
pub const STORAGE_BYTES: usize = 416;

/// Default and initial longest session: 7 days, in seconds.
pub const DEFAULT_MAX_TTL: u64 = 7 * 24 * 60 * 60;

// ── Storage domains ───────────────────────────────────────────────────────────

/// () -> admin address (first 20 bytes of the word).
const DOM_ADMIN: u8 = 0;
/// () -> longest allowed session in seconds (u64 LE, first 8 bytes).
const DOM_MAX_TTL: u8 = 1;
/// session key -> `KeyRecord`. Written when a key is bound; never deleted.
const DOM_KEY: u8 = 2;
/// owner -> `OwnerRecord`. The owner's one offered or bound session.
const DOM_OWNER: u8 = 3;
// Domains 4.. are reserved for the personhood part (context, accepted tiers).

/// A bound session key. `revoked` is set when the owner revokes or rotates.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyRecord {
    pub owner: [u8; 20],
    /// Unix time in seconds. The key is live while `now < expires_at`.
    pub expires_at: u64,
    pub revoked: bool,
}

impl KeyRecord {
    /// Bytes used in the 32-byte storage word (the rest is zero).
    pub const SIZE: usize = 20 + 8 + 1;

    pub fn to_word(&self) -> [u8; 32] {
        let mut b = [0u8; 32];
        b[..20].copy_from_slice(&self.owner);
        b[20..28].copy_from_slice(&self.expires_at.to_le_bytes());
        b[28] = self.revoked as u8;
        b
    }

    /// `None` for the zero word (no record). A bound key's owner is never
    /// zero, so a record is never the zero word.
    pub fn from_word(b: &[u8; 32]) -> Option<Self> {
        if *b == [0u8; 32] {
            return None;
        }
        let mut owner = [0u8; 20];
        owner.copy_from_slice(&b[..20]);
        let mut e = [0u8; 8];
        e.copy_from_slice(&b[20..28]);
        Some(Self {
            owner,
            expires_at: u64::from_le_bytes(e),
            revoked: b[28] != 0,
        })
    }

    pub fn is_live(&self, now: u64) -> bool {
        !self.revoked && now < self.expires_at
    }
}

/// `OwnerRecord.state`: offered by the owner, not yet accepted by the key.
pub const STATE_OFFERED: u8 = 1;
/// `OwnerRecord.state`: accepted; a `KeyRecord` exists for the key.
pub const STATE_BOUND: u8 = 2;

/// The owner's current session (offered or bound).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OwnerRecord {
    pub session: [u8; 20],
    pub expires_at: u64,
    pub state: u8,
}

impl OwnerRecord {
    /// Bytes used in the 32-byte storage word (the rest is zero).
    pub const SIZE: usize = 20 + 8 + 1;

    pub fn to_word(&self) -> [u8; 32] {
        let mut b = [0u8; 32];
        b[..20].copy_from_slice(&self.session);
        b[20..28].copy_from_slice(&self.expires_at.to_le_bytes());
        b[28] = self.state;
        b
    }

    /// `None` for the zero word (no record). The session key is never zero.
    pub fn from_word(b: &[u8; 32]) -> Option<Self> {
        if *b == [0u8; 32] {
            return None;
        }
        let mut session = [0u8; 20];
        session.copy_from_slice(&b[..20]);
        let mut e = [0u8; 8];
        e.copy_from_slice(&b[20..28]);
        Some(Self {
            session,
            expires_at: u64::from_le_bytes(e),
            state: b[28],
        })
    }
}

#[pvm_contract_sdk::contract]
mod oab_identity {
    use super::*;
    use pvm_contract_sdk::{Address, StorageFlags};

    /// The session key is zero or the caller itself.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidSessionKey;

    /// The key is bound to a player and live.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SessionKeyInUse;

    /// The key was bound before (now expired or revoked). It is never reused.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SessionKeyBurned;

    /// A session key cannot own a session.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SessionKeyCannotOwn;

    /// The account owns a session, so it cannot become a session key.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct OwnerCannotBeSessionKey;

    /// `expiresAt` is not in the future.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidExpiry;

    /// `expiresAt` is further away than `maxTtl()`.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct TtlTooLong;

    /// The owner has not offered this key (or the offer was replaced).
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NoOffer;

    /// The offer expired before the key accepted it.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct OfferExpired;

    /// The caller has no offered or bound session.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NoActiveSession;

    /// `account` is a session key that is expired or revoked. A mode must not
    /// act for anyone on its behalf.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct InvalidSession {
        pub account: Address,
    }

    /// The caller is not the admin.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NotAdmin;

    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub enum IdentityError {
        InvalidSessionKey(InvalidSessionKey),
        SessionKeyInUse(SessionKeyInUse),
        SessionKeyBurned(SessionKeyBurned),
        SessionKeyCannotOwn(SessionKeyCannotOwn),
        OwnerCannotBeSessionKey(OwnerCannotBeSessionKey),
        InvalidExpiry(InvalidExpiry),
        TtlTooLong(TtlTooLong),
        NoOffer(NoOffer),
        OfferExpired(OfferExpired),
        NoActiveSession(NoActiveSession),
        InvalidSession(InvalidSession),
        NotAdmin(NotAdmin),
    }

    /// The owner offered `session`. It acts for the owner after it accepts.
    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SessionOffered {
        #[indexed]
        pub owner: Address,
        #[indexed]
        pub session: Address,
        pub expires_at: u64,
    }

    /// `session` accepted and now acts for `owner` until `expires_at`.
    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SessionRegistered {
        #[indexed]
        pub owner: Address,
        #[indexed]
        pub session: Address,
        pub expires_at: u64,
    }

    /// A bound key was revoked (by `revokeSession` or by a new offer). It is
    /// burned for good.
    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SessionRevoked {
        #[indexed]
        pub owner: Address,
        #[indexed]
        pub session: Address,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct MaxTtlSet {
        pub max_ttl: u64,
    }

    pub struct OabIdentity;

    impl OabIdentity {
        // ── host helpers ──

        fn caller_bytes(&self) -> [u8; 20] {
            let mut a = [0u8; 20];
            self.host().caller(&mut a);
            a
        }

        /// Block timestamp in seconds.
        fn now(&self) -> u64 {
            let mut t = [0u8; 32];
            self.host().now(&mut t);
            let mut b = [0u8; 8];
            b.copy_from_slice(&t[0..8]);
            u64::from_le_bytes(b)
        }

        fn skey(&self, domain: u8, k: &[u8; 20]) -> [u8; 32] {
            let mut input = [0u8; 21];
            input[0] = domain;
            input[1..].copy_from_slice(k);
            let mut key = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut key);
            key
        }

        /// The word at a fixed key; the zero word if absent.
        fn load(&self, key: &[u8; 32]) -> [u8; 32] {
            let mut w = [0u8; 32];
            self.host()
                .get_storage_or_zero(StorageFlags::empty(), key, &mut w);
            w
        }

        /// Writes a word at a fixed key; the zero word deletes the item.
        fn store(&self, key: &[u8; 32], w: &[u8; 32]) {
            self.host()
                .set_storage_or_clear(StorageFlags::empty(), key, w);
        }

        fn load_key(&self, session: &[u8; 20]) -> Option<KeyRecord> {
            KeyRecord::from_word(&self.load(&self.skey(DOM_KEY, session)))
        }

        fn store_key(&self, session: &[u8; 20], r: &KeyRecord) {
            self.store(&self.skey(DOM_KEY, session), &r.to_word());
        }

        fn load_owner(&self, owner: &[u8; 20]) -> Option<OwnerRecord> {
            OwnerRecord::from_word(&self.load(&self.skey(DOM_OWNER, owner)))
        }

        fn store_owner(&self, owner: &[u8; 20], r: &OwnerRecord) {
            self.store(&self.skey(DOM_OWNER, owner), &r.to_word());
        }

        /// Deletes the owner's record and frees its deposit.
        fn clear_owner(&self, owner: &[u8; 20]) {
            self.store(&self.skey(DOM_OWNER, owner), &[0u8; 32]);
        }

        fn admin(&self) -> [u8; 20] {
            let w = self.load(&self.skey(DOM_ADMIN, &[0u8; 20]));
            let mut a = [0u8; 20];
            a.copy_from_slice(&w[..20]);
            a
        }

        fn load_max_ttl(&self) -> u64 {
            let w = self.load(&self.skey(DOM_MAX_TTL, &[0u8; 20]));
            let mut b = [0u8; 8];
            b.copy_from_slice(&w[..8]);
            u64::from_le_bytes(b)
        }

        fn store_max_ttl(&self, ttl: u64) {
            let mut w = [0u8; 32];
            w[..8].copy_from_slice(&ttl.to_le_bytes());
            self.store(&self.skey(DOM_MAX_TTL, &[0u8; 20]), &w);
        }

        /// Marks a bound key revoked (burned) if it is not already.
        fn burn(&self, owner: &[u8; 20], session: &[u8; 20]) {
            if let Some(mut k) = self.load_key(session) {
                if !k.revoked {
                    k.revoked = true;
                    self.store_key(session, &k);
                }
            }
            SessionRevoked {
                owner: Address(*owner),
                session: Address(*session),
            }
            .emit(self.host());
        }

        // ── entry points ──

        /// The deployer becomes the admin. `maxTtl` starts at 7 days.
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {
            let caller = self.caller_bytes();
            let mut w = [0u8; 32];
            w[..20].copy_from_slice(&caller);
            self.store(&self.skey(DOM_ADMIN, &[0u8; 20]), &w);
            self.store_max_ttl(DEFAULT_MAX_TTL);
            MaxTtlSet {
                max_ttl: DEFAULT_MAX_TTL,
            }
            .emit(self.host());
        }

        /// Player: offer `session` as the caller's session key until
        /// `expiresAt` (unix seconds). Revokes and burns the caller's previous
        /// bound session. The key acts for the caller after `acceptSession`.
        #[pvm_contract_sdk::method]
        pub fn register_session(
            &mut self,
            session: Address,
            expires_at: u64,
        ) -> Result<(), IdentityError> {
            let owner = self.caller_bytes();
            if self.load_key(&owner).is_some() {
                return Err(SessionKeyCannotOwn.into());
            }
            if session.0 == [0u8; 20] || session.0 == owner {
                return Err(InvalidSessionKey.into());
            }
            let now = self.now();
            if let Some(k) = self.load_key(&session.0) {
                return Err(if k.is_live(now) {
                    SessionKeyInUse.into()
                } else {
                    SessionKeyBurned.into()
                });
            }
            if expires_at <= now {
                return Err(InvalidExpiry.into());
            }
            if expires_at - now > self.load_max_ttl() {
                return Err(TtlTooLong.into());
            }
            if let Some(prev) = self.load_owner(&owner) {
                if prev.state == STATE_BOUND {
                    self.burn(&owner, &prev.session);
                }
            }
            self.store_owner(
                &owner,
                &OwnerRecord {
                    session: session.0,
                    expires_at,
                    state: STATE_OFFERED,
                },
            );
            SessionOffered {
                owner: Address(owner),
                session,
                expires_at,
            }
            .emit(self.host());
            Ok(())
        }

        /// Session key: accept `owner`'s offer. From now until the offer's
        /// expiry, `resolve(caller)` returns `owner`.
        #[pvm_contract_sdk::method]
        pub fn accept_session(&mut self, owner: Address) -> Result<(), IdentityError> {
            let session = self.caller_bytes();
            let mut offer = match self.load_owner(&owner.0) {
                Some(o) if o.state == STATE_OFFERED && o.session == session => o,
                _ => return Err(NoOffer.into()),
            };
            if self.now() >= offer.expires_at {
                return Err(OfferExpired.into());
            }
            if self.load_key(&session).is_some() {
                return Err(SessionKeyBurned.into());
            }
            if self.load_owner(&session).is_some() {
                return Err(OwnerCannotBeSessionKey.into());
            }
            self.store_key(
                &session,
                &KeyRecord {
                    owner: owner.0,
                    expires_at: offer.expires_at,
                    revoked: false,
                },
            );
            offer.state = STATE_BOUND;
            self.store_owner(&owner.0, &offer);
            SessionRegistered {
                owner,
                session: Address(session),
                expires_at: offer.expires_at,
            }
            .emit(self.host());
            Ok(())
        }

        /// Player: end the caller's session. A bound key is burned; an offer
        /// that was never accepted is only withdrawn (the key was never the
        /// caller's, so it is not burned).
        #[pvm_contract_sdk::method]
        pub fn revoke_session(&mut self) -> Result<(), IdentityError> {
            let owner = self.caller_bytes();
            let rec = self.load_owner(&owner).ok_or(NoActiveSession)?;
            if rec.state == STATE_BOUND {
                self.burn(&owner, &rec.session);
            }
            self.clear_owner(&owner);
            Ok(())
        }

        /// Hot path: the player `account` acts for. A live session key gives
        /// its owner; an account that was never a session key gives itself.
        /// Reverts `InvalidSession(account)` for an expired or revoked key.
        #[pvm_contract_sdk::method]
        pub fn resolve(&self, account: Address) -> Result<Address, IdentityError> {
            match self.load_key(&account.0) {
                None => Ok(account),
                Some(k) if k.is_live(self.now()) => Ok(Address(k.owner)),
                Some(_) => Err(InvalidSession { account }.into()),
            }
        }

        /// Personhood stub (on hold). Resolves the player like `resolve`, then
        /// answers tier 0 and a zero alias: nobody is eligible for ranked play
        /// until a later Identity version checks the personhood precompile.
        #[pvm_contract_sdk::method]
        pub fn ranked_identity(
            &self,
            account: Address,
        ) -> Result<(Address, u8, [u8; 32]), IdentityError> {
            let player = self.resolve(account)?;
            Ok((player, 0, [0u8; 32]))
        }

        /// The owner's session: key, expiry (unix seconds), and state
        /// (0 none, 1 offered, 2 bound). A bound key may be expired.
        #[pvm_contract_sdk::method]
        pub fn session_of(&self, owner: Address) -> (Address, u64, u8) {
            match self.load_owner(&owner.0) {
                Some(r) => (Address(r.session), r.expires_at, r.state),
                None => (Address([0u8; 20]), 0, 0),
            }
        }

        /// A key's binding: owner, expiry, and revoked flag. Zero owner if
        /// the key was never bound.
        #[pvm_contract_sdk::method]
        pub fn key_of(&self, session: Address) -> (Address, u64, bool) {
            match self.load_key(&session.0) {
                Some(k) => (Address(k.owner), k.expires_at, k.revoked),
                None => (Address([0u8; 20]), 0, false),
            }
        }

        /// Longest allowed session, in seconds.
        #[pvm_contract_sdk::method]
        pub fn max_ttl(&self) -> u64 {
            self.load_max_ttl()
        }

        /// Admin: set the longest allowed session for new offers.
        #[pvm_contract_sdk::method]
        pub fn set_max_ttl(&mut self, max_ttl: u64) -> Result<(), IdentityError> {
            if self.admin() != self.caller_bytes() {
                return Err(NotAdmin.into());
            }
            self.store_max_ttl(max_ttl);
            MaxTtlSet { max_ttl }.emit(self.host());
            Ok(())
        }

        #[pvm_contract_sdk::method]
        pub fn admin_address(&self) -> Address {
            Address(self.admin())
        }
    }
}

#[cfg(test)]
mod tests;
