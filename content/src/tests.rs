//! Native tests against `MockHost`. Run from the repo root:
//!   CARGO_PVM_CONTRACT_INTERNAL=1 cargo test --manifest-path content/Cargo.toml --features std

use super::oab_content::{ContentError, OabContent, SetPublished};
use super::STORAGE_BYTES;
use oab_battle::state::{CardSet, CardSetEntry};
use oab_battle::types::{CardId, GhostBoardUnit, UnitCard};
use oab_protocol::{ghosts_hash, HouseGhost, SetBundle, SetRecord};
use parity_scale_codec::{Decode, Encode};
use pvm_contract_sdk::{Address, Bytes, MockHost, MockHostBuilder, SolEvent};

const ADMIN: [u8; 20] = [0xAD; 20];
const CURATOR: [u8; 20] = [0xC0; 20];
const STRANGER: [u8; 20] = [0x55; 20];

fn host(caller: [u8; 20], block: u64) -> MockHost {
    MockHostBuilder::new()
        .caller(caller)
        .block_number(block)
        .build()
}

/// The same contract storage seen from another caller (MockHost fixes the
/// caller at build time).
fn as_caller(from: &MockHost, caller: [u8; 20], block: u64) -> (OabContent, MockHost) {
    let m = host(caller, block);
    for (k, v) in from.storage_dump() {
        m.set_raw_storage(k, v);
    }
    (OabContent::with_host(m.clone()), m)
}

fn deployed() -> (OabContent, MockHost) {
    let m = host(ADMIN, 5);
    let mut c = OabContent::with_host(m.clone());
    c.new();
    (c, m)
}

fn cards() -> Vec<UnitCard> {
    oab_assets::cards::get_all()
}

fn publish_all_cards(c: &mut OabContent) {
    for card in cards() {
        c.publish_card(Bytes(card.encode())).expect("publish card");
    }
}

/// The starter ghost list rule in miniature: one board per round from the
/// set's first cards.
fn some_ghosts(set: &CardSet) -> Vec<HouseGhost> {
    (1..=3u8)
        .map(|round| HouseGhost {
            round,
            board: set.cards[..round as usize]
                .iter()
                .map(|e| GhostBoardUnit {
                    card_id: e.card_id,
                    perm_attack: 0,
                    perm_health: round as i16 - 1,
                })
                .collect(),
        })
        .collect()
}

fn local_bundle(set_id: u16, set: &CardSet) -> SetBundle {
    let all = cards();
    SetBundle::build(set_id, set.clone(), |id| {
        all.iter().find(|c| c.id == id).cloned()
    })
    .unwrap()
}

fn publish(
    c: &mut OabContent,
    name: &str,
    set: &CardSet,
    ghosts: &[HouseGhost],
) -> Result<(u16, [u8; 32]), ContentError> {
    c.publish_set(
        name.into(),
        Bytes(set.encode()),
        Bytes(ghosts.to_vec().encode()),
    )
}

// Cards never change once published: a mode that cached a set, and every
// replay of an old battle, depends on the card meaning what it meant then.
#[test]
fn a_published_card_can_never_be_replaced() {
    let (mut c, _m) = deployed();
    let card = cards()[0].clone();
    c.publish_card(Bytes(card.encode())).unwrap();
    let mut changed = card.clone();
    changed.stats.attack += 5;
    assert!(matches!(
        c.publish_card(Bytes(changed.encode())),
        Err(ContentError::CardExists(e)) if e.card_id == card.id.0
    ));
    assert_eq!(
        UnitCard::decode(&mut &c.get_card(card.id.0).0[..]).unwrap(),
        card
    );
}

// A published set never changes either. Publishing more content must leave
// every earlier set's bytes, hash, and ghosts exactly as they were.
#[test]
fn a_published_set_is_immutable_while_content_grows() {
    let (mut c, m) = deployed();
    publish_all_cards(&mut c);
    let sets = oab_assets::sets::get_all();
    publish(
        &mut c,
        "Foundations of War",
        &sets[0],
        &some_ghosts(&sets[0]),
    )
    .unwrap();
    let snapshot = (
        c.get_set_bundle(0),
        c.get_set_record(0),
        c.get_house_ghosts(0),
        c.set_hash(0),
    );
    let keys_before: Vec<_> = m.storage_dump();

    publish(&mut c, "The Hollow Swarm", &sets[1], &some_ghosts(&sets[1])).unwrap();
    publish(&mut c, "Foundations of War", &sets[0], &[]).unwrap(); // same cards again
    assert!(c.publish_card(Bytes(cards()[1].encode())).is_err());

    assert_eq!(
        (
            c.get_set_bundle(0),
            c.get_set_record(0),
            c.get_house_ghosts(0),
            c.set_hash(0)
        ),
        snapshot
    );
    let after: std::collections::HashMap<_, _> = m.storage_dump().into_iter().collect();
    // Only the next-set counter may move.
    let counter = oab_protocol::keccak256(&[super::DOM_NEXT_SET]).to_vec();
    for (k, v) in keys_before {
        if k == counter {
            continue;
        }
        assert_eq!(after.get(&k), Some(&v), "an existing storage item changed");
    }
}

// Set ids are assigned by Content (decision Q11), so nobody can squat or
// overwrite an id. Two publishes of the same cards get two ids and two
// hashes; a failed publish consumes no id.
#[test]
fn auto_assigned_set_ids_never_collide() {
    let (mut c, _m) = deployed();
    publish_all_cards(&mut c);
    let sets = oab_assets::sets::get_all();
    assert_eq!(c.set_count(), 0);
    let (a, ha) = publish(&mut c, "A", &sets[0], &[]).unwrap();
    let mut bad = sets[1].clone();
    bad.cards.push(CardSetEntry {
        card_id: CardId(7_777),
        rarity: 1,
    });
    assert!(matches!(
        publish(&mut c, "Bad", &bad, &[]),
        Err(ContentError::UnknownCard(e)) if e.card_id == 7_777
    ));
    let (b, hb) = publish(&mut c, "A again", &sets[0], &[]).unwrap();
    let (d, _) = publish(&mut c, "B", &sets[1], &[]).unwrap();
    assert_eq!(
        (a, b, d),
        (0, 1, 2),
        "ids are 0, 1, 2 in publish order; the failure used none"
    );
    assert_ne!(ha, hb, "the set id is part of the hash");
    assert_eq!(c.set_count(), 3);
    assert!(c.get_set_bundle(3).0.is_empty());
}

// The hash binds the content: a mode copies the bundle once and checks it
// against `setHash`. It must equal keccak(SCALE(SetBundle)) computed off
// chain from the same cards, and the stored bytes must decode to that bundle.
#[test]
fn set_hash_binds_the_bundle_computed_off_chain() {
    let (mut c, m) = deployed();
    publish_all_cards(&mut c);
    for (i, set) in oab_assets::sets::get_all().iter().enumerate() {
        let (id, hash) = publish(&mut c, "set", set, &some_ghosts(set)).unwrap();
        assert_eq!(id as usize, i);
        let local = local_bundle(id, set);
        assert_eq!(hash, local.hash());
        assert_eq!(c.set_hash(id), local.hash());
        let onchain = SetBundle::decode(&mut &c.get_set_bundle(id).0[..]).unwrap();
        assert_eq!(onchain, local);
        assert_eq!(onchain.hash(), c.set_hash(id));
        assert_eq!(CardSet::decode(&mut &c.get_set(id).0[..]).unwrap(), *set);
    }
    // The SetPublished event carries the same hash, indexed by set id.
    let ev = m.events();
    let (topics, data) = ev
        .iter()
        .rev()
        .find(|(t, _)| t[0] == SetPublished::TOPIC)
        .unwrap();
    assert_eq!(topics[1][30..], 2u16.to_be_bytes());
    assert_eq!(data[..32], c.set_hash(2));
    assert_eq!(c.set_hash(9), [0u8; 32], "absent set => zero hash");
}

// House ghosts (decision Q1) seed a new mode's ghost pools. They must come
// back exactly as published, with a hash in the set record.
#[test]
fn house_ghosts_are_retrievable_and_hashed() {
    let (mut c, _m) = deployed();
    publish_all_cards(&mut c);
    let set = oab_assets::sets::get_all()[2].clone();
    let ghosts = some_ghosts(&set);
    let (id, _) = publish(&mut c, "Fortune's Reckoning", &set, &ghosts).unwrap();
    let back = Vec::<HouseGhost>::decode(&mut &c.get_house_ghosts(id).0[..]).unwrap();
    assert_eq!(back, ghosts);
    let rec = SetRecord::decode(&mut &c.get_set_record(id).0[..]).unwrap();
    assert_eq!(rec.ghosts_hash, ghosts_hash(&ghosts));
    assert_eq!(rec.name, "Fortune's Reckoning");
    assert_eq!(rec.publisher, ADMIN);
    assert_eq!(rec.block, 5);
    assert_eq!(
        Vec::<HouseGhost>::decode(&mut &c.get_house_ghosts(77).0[..]).unwrap(),
        vec![]
    );
}

// A house ghost may only use the set's own cards, so a mode never needs a
// card outside the bundle it cached; malformed ghost lists are rejected
// whole.
#[test]
fn bad_house_ghosts_are_rejected() {
    let (mut c, _m) = deployed();
    publish_all_cards(&mut c);
    let sets = oab_assets::sets::get_all();
    let outside = sets[1]
        .cards
        .iter()
        .find(|e| !sets[0].cards.iter().any(|f| f.card_id == e.card_id))
        .unwrap()
        .card_id;
    let unit = |card_id| GhostBoardUnit {
        card_id,
        perm_attack: 0,
        perm_health: 0,
    };
    let ok = sets[0].cards[0].card_id;
    let cases = vec![
        vec![HouseGhost {
            round: 1,
            board: vec![unit(outside)],
        }],
        vec![HouseGhost {
            round: 1,
            board: vec![],
        }],
        vec![HouseGhost {
            round: 0,
            board: vec![unit(ok)],
        }],
        vec![HouseGhost {
            round: 1,
            board: vec![unit(ok); 6],
        }],
        vec![
            HouseGhost {
                round: 1,
                board: vec![unit(ok)]
            };
            65
        ],
    ];
    for g in cases {
        assert!(matches!(
            publish(&mut c, "x", &sets[0], &g),
            Err(ContentError::BadHouseGhosts(_))
        ));
    }
    assert_eq!(c.set_count(), 0);
}

// Only curators publish; only the admin names curators. Otherwise anyone
// could fill the id space or publish sets that look official.
#[test]
fn publishing_needs_a_curator_and_curators_need_the_admin() {
    let (mut c, m) = deployed();
    assert!(
        c.is_curator(Address(ADMIN)),
        "the deployer is the first curator"
    );
    assert_eq!(c.admin_address(), Address(ADMIN));
    let card = cards()[0].clone();

    let (mut s, _) = as_caller(&m, STRANGER, 6);
    assert!(matches!(
        s.publish_card(Bytes(card.encode())),
        Err(ContentError::NotCurator(_))
    ));
    assert!(matches!(
        publish(&mut s, "x", &oab_assets::sets::get_all()[0], &[]),
        Err(ContentError::NotCurator(_))
    ));
    assert!(matches!(
        s.set_curator(Address(STRANGER), true),
        Err(ContentError::NotAdmin(_))
    ));

    c.set_curator(Address(CURATOR), true).unwrap();
    let (mut k, km) = as_caller(&m, CURATOR, 7);
    k.publish_card(Bytes(card.encode())).unwrap();
    let meta = oab_protocol::CardMeta::decode(&mut &k.get_card_meta(card.id.0).0[..]).unwrap();
    assert_eq!(meta.publisher, CURATOR);
    assert_eq!(meta.origin, oab_protocol::CardOrigin::Curated);

    let (mut a, am) = as_caller(&km, ADMIN, 8);
    a.set_curator(Address(CURATOR), false).unwrap();
    let (mut k2, _) = as_caller(&am, CURATOR, 9);
    assert!(matches!(
        k2.publish_card(Bytes(cards()[1].encode())),
        Err(ContentError::NotCurator(_))
    ));
}

// Community card ids are an extension point only: the range is reserved,
// so a later community flow cannot collide with curated ids.
#[test]
fn community_card_ids_are_reserved() {
    let (mut c, _m) = deployed();
    let mut card = cards()[0].clone();
    card.id = CardId(oab_protocol::COMMUNITY_CARD_ID_START);
    assert!(matches!(
        c.publish_card(Bytes(card.encode())),
        Err(ContentError::ReservedCardId(_))
    ));
    card.id = CardId(0xFFFF);
    assert!(matches!(
        c.publish_card(Bytes(card.encode())),
        Err(ContentError::ReservedCardId(_))
    ));
}

// pallet-revive stores at most 416 bytes per item. A larger write would
// make the publish fail on chain, so every item Content writes for the real
// sets must fit.
#[test]
fn every_storage_item_fits_the_chain_limit() {
    let (mut c, m) = deployed();
    publish_all_cards(&mut c);
    for set in oab_assets::sets::get_all() {
        let ghosts: Vec<HouseGhost> = (1..=10u8)
            .flat_map(|round| (0..3).map(move |_| round))
            .map(|round| HouseGhost {
                round,
                board: set.cards[..5]
                    .iter()
                    .map(|e| GhostBoardUnit {
                        card_id: e.card_id,
                        perm_attack: i16::MAX,
                        perm_health: i16::MIN,
                    })
                    .collect(),
            })
            .collect();
        publish(&mut c, &"n".repeat(64), &set, &ghosts).unwrap();
    }
    for (_, v) in m.storage_dump() {
        assert!(v.len() <= STORAGE_BYTES, "item of {} bytes", v.len());
    }
    assert!(publish(
        &mut c,
        &"n".repeat(65),
        &oab_assets::sets::get_all()[0],
        &[]
    )
    .is_err());
}

// Trailing bytes mean the caller encoded something else; reject instead of
// storing a value that differs from what the curator signed.
#[test]
fn payloads_must_decode_exactly() {
    let (mut c, _m) = deployed();
    let mut bytes = cards()[0].encode();
    bytes.push(0);
    assert!(matches!(
        c.publish_card(Bytes(bytes)),
        Err(ContentError::BadPayload(_))
    ));
    assert!(matches!(
        c.publish_card(Bytes(vec![1, 2])),
        Err(ContentError::BadPayload(_))
    ));
}
