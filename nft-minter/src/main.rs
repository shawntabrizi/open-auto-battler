//! Open Auto Battler — NFT claim minter (PolkaVM)
//!
//! The item selector that `indiv-pallet-nft-claims` calls when a player spends a
//! Scarcity claim credit on the OAB collectibles collection. The runtime calls
//! `mint(uint32 collection, bytes32 credit)` as the collection owner and mints
//! the item index this contract returns. This contract does not mint: the
//! pallet does, without a deposit, after this call returns.
//!
//! Rules this contract keeps on purpose (see `docs/NFT_DESIGN.md`):
//!
//! - **Deterministic.** The item is a pure function of the credit. The same
//!   credit always maps to the same item, so the host and the frontend can
//!   preview a claim before the player spends the credit.
//! - **Immutable.** No storage, no admin, no upgrade path, no fallback. The
//!   only entry point is `mint`. A new item table ships as a new contract that
//!   the collection owner registers with `setContractMinter`.
//! - **Caller-independent.** The runtime calls as the collection owner. A call
//!   from any other account gets the same answer and changes nothing, so the
//!   contract does not check the caller.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

use pvm_contract_sdk::U256;

/// One claimable item: its Scarcity item index in the OAB collectibles
/// collection, and its draw weight.
pub struct Entry {
    pub item: u32,
    pub weight: u32,
}

/// Season 0 item table. Item indices are the ones `defineItem` returned on
/// Paseo Asset Hub Next for the OAB collectibles collection; see
/// `docs/NFT_DESIGN.md` for the item names. Weights sum to [`TOTAL_WEIGHT`].
pub const TABLE: [Entry; 9] = [
    // Common (18% each): the Cosmic single slots.
    Entry {
        item: 0,
        weight: 180,
    }, // avatar     Cosmic Elf
    Entry {
        item: 1,
        weight: 180,
    }, // hand_bg    Cosmic Soil
    Entry {
        item: 2,
        weight: 180,
    }, // card_style Cosmic Vines
    Entry {
        item: 3,
        weight: 180,
    }, // board_bg   Cosmic Tree
    // Rare (7% each): full card art sets.
    Entry {
        item: 4,
        weight: 70,
    }, // card_art   Cosmic Cards
    Entry {
        item: 5,
        weight: 70,
    }, // card_art   Kawaii Cards
    Entry {
        item: 6,
        weight: 70,
    }, // card_art   Full Moon Cards
    // Epic (3.5% each): full UI themes.
    Entry {
        item: 7,
        weight: 35,
    }, // theme      Cyberpunk
    Entry {
        item: 8,
        weight: 35,
    }, // theme      Pastel
];

pub const TOTAL_WEIGHT: u32 = 1000;

/// Pick the item for `credit`.
///
/// `roll = uint256(credit) % TOTAL_WEIGHT`, then walk the cumulative weights.
/// This is the same rule as Solidity `uint256(credit) % 1000`, so a frontend
/// can preview it with `BigInt(credit) % 1000n` and the table.
pub fn select(credit: &[u8; 32]) -> u32 {
    let roll = U256::from_be_bytes(*credit) % U256::from(TOTAL_WEIGHT);
    let mut roll: u32 = roll.to::<u32>();
    for entry in TABLE.iter() {
        if roll < entry.weight {
            return entry.item;
        }
        roll -= entry.weight;
    }
    // Unreachable while the weights sum to TOTAL_WEIGHT (a test holds this).
    TABLE[0].item
}

#[pvm_contract_sdk::contract("INftClaimsMinter.sol")]
mod oab_nft_minter {
    use super::*;

    pub struct OabNftMinter;

    impl OabNftMinter {
        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self) {}

        /// Item index for the claim of `credit`. `collection` is not read: the
        /// table belongs to the collection that registered this contract.
        #[pvm_contract_sdk::method]
        pub fn mint(_collection: u32, credit: [u8; 32]) -> u32 {
            select(&credit)
        }
    }
}

// ── Native tests ──────────────────────────────────────────────────────────────
//
// Run from the repo root (inside the crate the riscv cargo config applies):
//   CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path nft-minter/Cargo.toml --features std

#[cfg(test)]
mod tests {
    use super::oab_nft_minter::{self, OabNftMinter};
    use super::{select, TABLE, TOTAL_WEIGHT};
    use pvm_contract_sdk::{const_selector, keccak256, MockHostBuilder, Outcome};

    /// Byte-for-byte the calldata the Asset Hub Next runtime builds in
    /// `minter_call_data` (runtimes/next-asset-hub-paseo/src/lib.rs).
    fn runtime_call_data(collection: u32, credit: [u8; 32]) -> Vec<u8> {
        let mut data = Vec::with_capacity(68);
        data.extend_from_slice(&keccak256(b"mint(uint32,bytes32)")[..4]);
        data.extend_from_slice(&[0u8; 28]);
        data.extend_from_slice(&collection.to_be_bytes());
        data.extend_from_slice(&credit);
        data
    }

    /// The runtime's `decode_minter_item`: exactly one canonical uint32 word,
    /// anything else fails the claim with `MinterContractInvalidReturn`.
    fn runtime_decode_item(data: &[u8]) -> Option<u32> {
        if data.len() != 32 || data[..28] != [0u8; 28] {
            return None;
        }
        Some(u32::from_be_bytes(data[28..].try_into().ok()?))
    }

    /// Dispatch raw calldata through the macro-generated router, as the
    /// runtime's `bare_call` would, with `caller` as the calling account.
    fn call_raw(caller: [u8; 20], calldata: &[u8]) -> (Outcome, Vec<u8>) {
        let mock = MockHostBuilder::new().caller(caller).build();
        let mut c = OabNftMinter::with_host(mock);
        let sel: [u8; 4] = calldata[..4].try_into().unwrap();
        let mut buf = [0u8; oab_nft_minter::MAX_RETURN_LEN];
        let mut out: &mut [u8] = &mut buf;
        let outcome = oab_nft_minter::route(&mut c, sel, &calldata[4..], &mut out);
        let n = match outcome {
            Outcome::Return(n) => n,
            _ => 0,
        };
        (outcome, buf[..n].to_vec())
    }

    fn credit(i: u64) -> [u8; 32] {
        keccak256(&i.to_le_bytes())
    }

    // Wire contract: if the selector or the return shape drifts, every claim
    // into the collection fails, so the test speaks the runtime's own bytes.
    #[test]
    fn answers_the_runtime_calldata_with_one_canonical_uint32() {
        assert_eq!(
            const_selector("mint(uint32,bytes32)"),
            keccak256(b"mint(uint32,bytes32)")[..4]
        );
        for i in 0..64 {
            let (outcome, ret) = call_raw([0x01; 20], &runtime_call_data(29, credit(i)));
            assert!(
                matches!(outcome, Outcome::Return(_)),
                "mint must return, got {outcome:?}"
            );
            let item = runtime_decode_item(&ret).expect("runtime must accept the return");
            assert_eq!(item, select(&credit(i)));
        }
    }

    // Determinism: a player sees the item before spending the credit
    // (preview_mints / frontend). If the answer could change between preview
    // and claim, the preview would lie.
    #[test]
    fn same_credit_always_selects_the_same_item() {
        for i in 0..256 {
            let c = credit(i);
            let first = OabNftMinter::mint(29, c);
            for _ in 0..3 {
                assert_eq!(OabNftMinter::mint(29, c), first);
            }
        }
    }

    // Caller independence: the runtime calls as the collection owner, but the
    // pick must not depend on who calls, or a preview made by another account
    // (the claimant, the host) would differ from the real claim.
    #[test]
    fn caller_does_not_change_the_pick() {
        for i in 0..32 {
            let data = runtime_call_data(29, credit(i));
            let (_, a) = call_raw([0x11; 20], &data);
            let (_, b) = call_raw([0xEE; 20], &data);
            let (_, z) = call_raw([0x00; 20], &data);
            assert_eq!(a, b);
            assert_eq!(a, z);
        }
    }

    // The rule is the documented `uint256(credit) % 1000` walk, so the
    // frontend preview (`BigInt(credit) % 1000n`) matches the chain. Fixed
    // vectors pin the boundaries of the cumulative table.
    #[test]
    fn roll_is_uint256_credit_mod_total_weight() {
        let at = |roll: u32| {
            let mut c = [0u8; 32];
            c[28..].copy_from_slice(&roll.to_be_bytes());
            select(&c)
        };
        assert_eq!(at(0), 0);
        assert_eq!(at(179), 0);
        assert_eq!(at(180), 1);
        assert_eq!(at(719), 3);
        assert_eq!(at(720), 4);
        assert_eq!(at(929), 6);
        assert_eq!(at(930), 7);
        assert_eq!(at(964), 7);
        assert_eq!(at(965), 8);
        assert_eq!(at(999), 8);
        // High bytes take part in the modulo: 2^255 % 1000 = 968 → item 8.
        let mut hi = [0u8; 32];
        hi[0] = 0x80;
        assert_eq!(select(&hi), 8);
        // All ones: (2^256 - 1) % 1000 = 935 → item 7.
        assert_eq!(select(&[0xFF; 32]), 7);
    }

    // Distribution: rarity tiers are a promise to players. Over many hashed
    // credits each item must land near its weight, and every item must be
    // reachable. A broken walk (off-by-one, wrong total) fails this.
    #[test]
    fn distribution_follows_the_weights() {
        const N: u64 = 200_000;
        let mut hits = [0u64; 9];
        for i in 0..N {
            let item = select(&credit(i)) as usize;
            hits[item] += 1;
        }
        for (entry, &h) in TABLE.iter().zip(hits.iter()) {
            let expected = N as f64 * entry.weight as f64 / TOTAL_WEIGHT as f64;
            let tolerance = 5.0 * expected.sqrt() + 1.0; // ~5 sigma
            assert!(
                (h as f64 - expected).abs() < tolerance,
                "item {} hit {h}, expected {expected:.0} ± {tolerance:.0}",
                entry.item
            );
        }
    }

    // Table integrity: the weights must sum to the modulus (else some rolls
    // fall off the end) and item indices must be unique (else an item is
    // silently overweighted).
    #[test]
    fn table_weights_sum_to_total_and_items_are_unique() {
        let sum: u32 = TABLE.iter().map(|e| e.weight).sum();
        assert_eq!(sum, TOTAL_WEIGHT);
        for (i, a) in TABLE.iter().enumerate() {
            assert!(a.weight > 0, "a zero-weight entry is dead config");
            for b in TABLE.iter().skip(i + 1) {
                assert_ne!(a.item, b.item);
            }
        }
    }

    // Immutability: `mint` is the only entry point. Any other selector — an
    // owner setter, an upgrade hook, `setCodeHash`-style admin — must not
    // dispatch, so no one can change the table after registration.
    #[test]
    fn no_entry_point_besides_mint() {
        for sig in [
            "owner()",
            "setTable(bytes)",
            "transferOwnership(address)",
            "upgrade(bytes32)",
            "setCodeHash(bytes32)",
            "terminate()",
            "mint(uint32,bytes32,address)",
        ] {
            let mut data = const_selector(sig).to_vec();
            data.extend_from_slice(&[0u8; 64]);
            let (outcome, _) = call_raw([0x11; 20], &data);
            assert_eq!(outcome, Outcome::Unhandled, "{sig} must not dispatch");
        }
    }
}
