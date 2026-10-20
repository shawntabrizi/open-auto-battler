//! Open Auto Battler Content registry (`@oab/content`) — PolkaVM contract.
//!
//! Holds cards and card sets. A published card or set never changes
//! (`docs/CONTRACT_ARCHITECTURE.md` section 4.2):
//!
//! - `publishCard` stores a card under its own id. An id is taken once.
//! - `publishSet` assigns the next set id (decision Q11), pins the set's
//!   `SetBundle` hash, and stores the set's house ghosts (decision Q1).
//! - Nothing is ever overwritten or deleted. There is no upgrade path.
//!
//! Storage is SCALE blobs at `keccak256(domain ++ key)`, as in the arena.
//! pallet-revive limits one storage value to 416 bytes
//! (`pallet_revive::limits::STORAGE_BYTES`), so a bundle is never stored as
//! one blob: `getSetBundle` builds it from the stored set and cards, and each
//! house ghost is its own item.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

// The contract macro declares `extern crate alloc` at the crate root (except on
// the abi-gen build) but injects no `use` imports, so import them here.
#[cfg(all(feature = "abi-gen", not(test)))]
extern crate alloc;
#[allow(unused_imports)]
use alloc::{string::String, vec, vec::Vec};

use parity_scale_codec::{Decode, DecodeAll, Encode};

use oab_battle::state::CardSet;
use oab_battle::types::UnitCard;
use oab_protocol::{
    CardMeta, CardOrigin, HouseGhost, SetBundle, SetRecord, COMMUNITY_CARD_ID_START,
    MAX_HOUSE_GHOSTS, MAX_HOUSE_GHOST_UNITS, MAX_SET_NAME_LEN,
};

/// Largest value pallet-revive stores in one item.
const STORAGE_BYTES: usize = 416;

// ── Storage domains ───────────────────────────────────────────────────────────

/// () -> admin address.
const DOM_ADMIN: u8 = 0;
/// address -> bool.
const DOM_CURATOR: u8 = 1;
/// card_id -> `UnitCard`.
const DOM_CARD: u8 = 2;
/// card_id -> `CardMeta`.
const DOM_CARD_META: u8 = 3;
/// set_id -> `SetRecord`.
const DOM_SET: u8 = 4;
/// set_id -> `CardSet`.
const DOM_SET_CARDS: u8 = 5;
/// set_id ++ index (u16 LE) -> `HouseGhost`.
const DOM_GHOST: u8 = 6;
/// set_id -> number of house ghosts (u16).
const DOM_GHOST_COUNT: u8 = 7;
/// () -> next set id (u16).
const DOM_NEXT_SET: u8 = 8;

fn ghost_key(set_id: u16, index: u16) -> [u8; 4] {
    let s = set_id.to_le_bytes();
    let i = index.to_le_bytes();
    [s[0], s[1], i[0], i[1]]
}

#[pvm_contract_sdk::contract(allocator = "pico", allocator_size = 262144)]
mod oab_content {
    use super::*;
    use pvm_contract_sdk::{Address, Bytes, StorageFlags};

    /// The caller is not the admin.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NotAdmin;

    /// The caller is not a curator.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct NotCurator;

    /// The input bytes are not the expected SCALE value.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadPayload;

    /// A card with this id is already published. Cards never change.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct CardExists {
        pub card_id: u16,
    }

    /// Ids from 0x8000 are reserved for community cards.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct ReservedCardId {
        pub card_id: u16,
    }

    /// The set references a card that is not published.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct UnknownCard {
        pub card_id: u16,
    }

    /// The set is empty, too large for one storage item, or has a bad name.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadSet;

    /// A house ghost is empty, too large, has round 0, or uses a card that is
    /// not in the set; or there are too many.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct BadHouseGhosts;

    /// All 65 536 set ids are used.
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct SetIdsExhausted;

    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub enum ContentError {
        NotAdmin(NotAdmin),
        NotCurator(NotCurator),
        BadPayload(BadPayload),
        CardExists(CardExists),
        ReservedCardId(ReservedCardId),
        UnknownCard(UnknownCard),
        BadSet(BadSet),
        BadHouseGhosts(BadHouseGhosts),
        SetIdsExhausted(SetIdsExhausted),
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct CardPublished {
        #[indexed]
        pub card_id: u16,
        pub publisher: Address,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct SetPublished {
        #[indexed]
        pub set_id: u16,
        pub set_hash: [u8; 32],
        pub ghosts_hash: [u8; 32],
        pub publisher: Address,
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct CuratorSet {
        #[indexed]
        pub who: Address,
        pub allowed: bool,
    }

    pub struct OabContent;

    impl OabContent {
        // ── raw SCALE storage at keccak(domain ++ key) ──

        fn caller_bytes(&self) -> [u8; 20] {
            let mut a = [0u8; 20];
            self.host().caller(&mut a);
            a
        }

        fn block_number_u64(&self) -> u64 {
            let mut number = [0u8; 32];
            self.host().block_number(&mut number);
            let mut b = [0u8; 8];
            b.copy_from_slice(&number[0..8]);
            u64::from_le_bytes(b)
        }

        fn skey(&self, domain: u8, k: &[u8]) -> [u8; 32] {
            let mut input = Vec::with_capacity(1 + k.len());
            input.push(domain);
            input.extend_from_slice(k);
            let mut key = [0u8; 32];
            self.host().hash_keccak_256(&input, &mut key);
            key
        }

        fn read_scale<T: Decode>(&self, domain: u8, k: &[u8]) -> Option<T> {
            let key = self.skey(domain, k);
            let mut buf = vec![0u8; STORAGE_BYTES];
            let mut out = buf.as_mut_slice();
            self.host()
                .get_storage(StorageFlags::empty(), &key, &mut out)
                .ok()?;
            if out.is_empty() {
                return None;
            }
            T::decode(&mut &out[..]).ok()
        }

        fn write_scale<T: Encode>(&self, domain: u8, k: &[u8], v: &T) {
            let key = self.skey(domain, k);
            self.host()
                .set_storage(StorageFlags::empty(), &key, &v.encode());
        }

        fn has(&self, domain: u8, k: &[u8]) -> bool {
            let key = self.skey(domain, k);
            let mut buf = vec![0u8; STORAGE_BYTES];
            let mut out = buf.as_mut_slice();
            self.host()
                .get_storage(StorageFlags::empty(), &key, &mut out)
                .is_ok()
        }

        // ── accessors ──

        fn admin(&self) -> Option<[u8; 20]> {
            self.read_scale(DOM_ADMIN, &[])
        }

        fn curator(&self, who: &[u8; 20]) -> bool {
            self.read_scale(DOM_CURATOR, who).unwrap_or(false)
        }

        fn load_card(&self, id: u16) -> Option<UnitCard> {
            self.read_scale(DOM_CARD, &id.to_le_bytes())
        }

        fn load_set_cards(&self, id: u16) -> Option<CardSet> {
            self.read_scale(DOM_SET_CARDS, &id.to_le_bytes())
        }

        fn load_record(&self, id: u16) -> Option<SetRecord> {
            self.read_scale(DOM_SET, &id.to_le_bytes())
        }

        fn next_set(&self) -> u16 {
            self.read_scale(DOM_NEXT_SET, &[]).unwrap_or(0)
        }

        fn bundle(&self, set_id: u16) -> Option<SetBundle> {
            let set = self.load_set_cards(set_id)?;
            SetBundle::build(set_id, set, |id| self.load_card(id.0))
        }

        fn ghosts(&self, set_id: u16) -> Vec<HouseGhost> {
            let n: u16 = self
                .read_scale(DOM_GHOST_COUNT, &set_id.to_le_bytes())
                .unwrap_or(0);
            (0..n)
                .filter_map(|i| self.read_scale(DOM_GHOST, &ghost_key(set_id, i)))
                .collect()
        }

        fn keccak(&self, data: &[u8]) -> [u8; 32] {
            let mut h = [0u8; 32];
            self.host().hash_keccak_256(data, &mut h);
            h
        }

        fn ensure_curator(&self) -> Result<[u8; 20], ContentError> {
            let caller = self.caller_bytes();
            if !self.curator(&caller) {
                return Err(NotCurator.into());
            }
            Ok(caller)
        }

        // ── entry points ──

        /// The deployer becomes the admin and the first curator.
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {
            let caller = self.caller_bytes();
            self.write_scale(DOM_ADMIN, &[], &caller);
            self.write_scale(DOM_CURATOR, &caller, &true);
            CuratorSet {
                who: Address(caller),
                allowed: true,
            }
            .emit(self.host());
        }

        /// Curator: publish one card (SCALE `UnitCard`). The id is the card's
        /// own id; it must be free and below 0x8000.
        #[pvm_contract_sdk::method]
        pub fn publish_card(&mut self, card: Bytes) -> Result<(), ContentError> {
            let publisher = self.ensure_curator()?;
            let card = UnitCard::decode_all(&mut &card.0[..]).map_err(|_| BadPayload)?;
            let id = card.id.0;
            if id >= COMMUNITY_CARD_ID_START {
                return Err(ReservedCardId { card_id: id }.into());
            }
            if self.has(DOM_CARD, &id.to_le_bytes()) {
                return Err(CardExists { card_id: id }.into());
            }
            if card.encoded_size() > STORAGE_BYTES {
                return Err(BadPayload.into());
            }
            self.write_scale(DOM_CARD, &id.to_le_bytes(), &card);
            let meta = CardMeta {
                publisher,
                block: self.block_number_u64(),
                origin: CardOrigin::Curated,
            };
            self.write_scale(DOM_CARD_META, &id.to_le_bytes(), &meta);
            CardPublished {
                card_id: id,
                publisher: Address(publisher),
            }
            .emit(self.host());
            Ok(())
        }

        /// Curator: publish a set (SCALE `CardSet`) with its house ghosts
        /// (SCALE `Vec<HouseGhost>`, may be empty). Every card must be
        /// published. Returns the new set id and the `SetBundle` hash.
        #[pvm_contract_sdk::method]
        pub fn publish_set(
            &mut self,
            name: String,
            card_set: Bytes,
            house_ghosts: Bytes,
        ) -> Result<(u16, [u8; 32]), ContentError> {
            let publisher = self.ensure_curator()?;
            if name.is_empty() || name.len() > MAX_SET_NAME_LEN {
                return Err(BadSet.into());
            }
            let set = CardSet::decode_all(&mut &card_set.0[..]).map_err(|_| BadPayload)?;
            if set.cards.is_empty() || set.encoded_size() > STORAGE_BYTES {
                return Err(BadSet.into());
            }
            let ghosts =
                Vec::<HouseGhost>::decode_all(&mut &house_ghosts.0[..]).map_err(|_| BadPayload)?;
            if ghosts.len() > MAX_HOUSE_GHOSTS {
                return Err(BadHouseGhosts.into());
            }
            for g in &ghosts {
                let fits = g.round > 0
                    && !g.board.is_empty()
                    && g.board.len() <= MAX_HOUSE_GHOST_UNITS
                    && g.board
                        .iter()
                        .all(|u| set.cards.iter().any(|e| e.card_id == u.card_id));
                if !fits {
                    return Err(BadHouseGhosts.into());
                }
            }

            let set_id = self.next_set();
            let next = set_id.checked_add(1).ok_or(SetIdsExhausted)?;
            for entry in &set.cards {
                if !self.has(DOM_CARD, &entry.card_id.0.to_le_bytes()) {
                    return Err(UnknownCard {
                        card_id: entry.card_id.0,
                    }
                    .into());
                }
            }
            let bundle = SetBundle::build(set_id, set, |id| self.load_card(id.0)).ok_or(BadSet)?;
            let set_hash = self.keccak(&bundle.encode());
            let g_hash = self.keccak(&ghosts.encode());

            let key = set_id.to_le_bytes();
            self.write_scale(DOM_SET_CARDS, &key, &bundle.set);
            for (i, g) in ghosts.iter().enumerate() {
                self.write_scale(DOM_GHOST, &ghost_key(set_id, i as u16), g);
            }
            self.write_scale(DOM_GHOST_COUNT, &key, &(ghosts.len() as u16));
            self.write_scale(
                DOM_SET,
                &key,
                &SetRecord {
                    name,
                    hash: set_hash,
                    ghosts_hash: g_hash,
                    publisher,
                    block: self.block_number_u64(),
                },
            );
            self.write_scale(DOM_NEXT_SET, &[], &next);
            SetPublished {
                set_id,
                set_hash,
                ghosts_hash: g_hash,
                publisher: Address(publisher),
            }
            .emit(self.host());
            Ok((set_id, set_hash))
        }

        /// Admin: allow or remove a curator.
        #[pvm_contract_sdk::method]
        pub fn set_curator(&mut self, who: Address, allowed: bool) -> Result<(), ContentError> {
            if self.admin() != Some(self.caller_bytes()) {
                return Err(NotAdmin.into());
            }
            self.write_scale(DOM_CURATOR, &who.0, &allowed);
            CuratorSet { who, allowed }.emit(self.host());
            Ok(())
        }

        // ── views ──

        /// SCALE `UnitCard`, or empty bytes.
        #[pvm_contract_sdk::method]
        pub fn get_card(&self, card_id: u16) -> Bytes {
            Bytes::from(
                self.load_card(card_id)
                    .map(|c| c.encode())
                    .unwrap_or_default(),
            )
        }

        /// SCALE `CardMeta`, or empty bytes.
        #[pvm_contract_sdk::method]
        pub fn get_card_meta(&self, card_id: u16) -> Bytes {
            Bytes::from(
                self.read_scale::<CardMeta>(DOM_CARD_META, &card_id.to_le_bytes())
                    .map(|m| m.encode())
                    .unwrap_or_default(),
            )
        }

        /// SCALE `CardSet`, or empty bytes.
        #[pvm_contract_sdk::method]
        pub fn get_set(&self, set_id: u16) -> Bytes {
            Bytes::from(
                self.load_set_cards(set_id)
                    .map(|s| s.encode())
                    .unwrap_or_default(),
            )
        }

        /// SCALE `SetBundle` (the set and every card it uses), or empty bytes.
        #[pvm_contract_sdk::method]
        pub fn get_set_bundle(&self, set_id: u16) -> Bytes {
            Bytes::from(self.bundle(set_id).map(|b| b.encode()).unwrap_or_default())
        }

        /// SCALE `SetRecord` (name, hashes, publisher, block), or empty bytes.
        #[pvm_contract_sdk::method]
        pub fn get_set_record(&self, set_id: u16) -> Bytes {
            Bytes::from(
                self.load_record(set_id)
                    .map(|r| r.encode())
                    .unwrap_or_default(),
            )
        }

        /// keccak256(SCALE(SetBundle)) of a published set; zero if absent.
        #[pvm_contract_sdk::method]
        pub fn set_hash(&self, set_id: u16) -> [u8; 32] {
            self.load_record(set_id)
                .map(|r| r.hash)
                .unwrap_or([0u8; 32])
        }

        /// SCALE `Vec<HouseGhost>` of a set (empty vector if none or absent).
        #[pvm_contract_sdk::method]
        pub fn get_house_ghosts(&self, set_id: u16) -> Bytes {
            Bytes::from(self.ghosts(set_id).encode())
        }

        /// Number of published sets. Set ids are `0..setCount()`.
        #[pvm_contract_sdk::method]
        pub fn set_count(&self) -> u16 {
            self.next_set()
        }

        #[pvm_contract_sdk::method]
        pub fn is_curator(&self, who: Address) -> bool {
            self.curator(&who.0)
        }

        #[pvm_contract_sdk::method]
        pub fn admin_address(&self) -> Address {
            Address(self.admin().unwrap_or([0u8; 20]))
        }
    }
}

#[cfg(test)]
mod tests;
