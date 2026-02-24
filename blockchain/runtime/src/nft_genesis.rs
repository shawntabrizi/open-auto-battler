//! Populate pallet-nfts storage with genesis NFT style collections.
//! Called once during genesis build, after all pallet genesis configs.

use alloc::vec::Vec;

use polkadot_sdk::*;

use frame_support::BoundedVec;
use pallet_nfts::{
    CollectionConfig, CollectionDetails, CollectionRole, CollectionRoles, CollectionSettings,
    ItemConfig, ItemDeposit, ItemDetails, ItemMetadata, ItemMetadataDeposit, ItemSettings,
    MintSettings, MintType,
};
use sp_keyring::Sr25519Keyring;

use crate::Runtime;

pub fn initialize() {
    let alice = Sr25519Keyring::Alice.to_account_id();
    let styles = oab_core::cards::get_all_nft_styles();

    let mut max_collection_id: u32 = 0;

    for collection in &styles {
        let collection_id: u32 = collection.id;
        let item_count = collection.items.len() as u32;

        if collection_id >= max_collection_id {
            max_collection_id = collection_id + 1;
        }

        // Collection details
        pallet_nfts::Collection::<Runtime>::insert(
            collection_id,
            CollectionDetails {
                owner: alice.clone(),
                owner_deposit: 0u128,
                items: item_count,
                item_metadatas: item_count,
                item_configs: item_count,
                attributes: 0,
            },
        );

        // Collection config
        pallet_nfts::CollectionConfigOf::<Runtime>::insert(
            collection_id,
            CollectionConfig {
                settings: CollectionSettings::all_enabled(),
                max_supply: None,
                mint_settings: MintSettings {
                    mint_type: MintType::Public,
                    price: Option::<u128>::None,
                    start_block: Option::<u32>::None,
                    end_block: Option::<u32>::None,
                    default_item_settings: ItemSettings::all_enabled(),
                },
            },
        );

        // Collection roles: Alice gets Admin + Issuer + Freezer
        let mut roles = CollectionRoles::none();
        roles.add_role(CollectionRole::Admin);
        roles.add_role(CollectionRole::Issuer);
        roles.add_role(CollectionRole::Freezer);
        pallet_nfts::CollectionRoleOf::<Runtime>::insert(collection_id, &alice, roles);

        // Track Alice's collection ownership
        pallet_nfts::CollectionAccount::<Runtime>::insert(&alice, collection_id, ());

        // Items
        for item in collection.items {
            let item_id: u32 = item.id;

            // Item details
            pallet_nfts::Item::<Runtime>::insert(
                collection_id,
                item_id,
                ItemDetails {
                    owner: alice.clone(),
                    approvals: Default::default(),
                    deposit: ItemDeposit {
                        account: alice.clone(),
                        amount: 0u128,
                    },
                },
            );

            // Ownership index
            pallet_nfts::Account::<Runtime>::insert((&alice, collection_id, item_id), ());

            // Item config
            pallet_nfts::ItemConfigOf::<Runtime>::insert(
                collection_id,
                item_id,
                ItemConfig {
                    settings: ItemSettings::all_enabled(),
                },
            );

            // Item metadata
            let metadata_bytes: Vec<u8> = item.metadata_json.as_bytes().to_vec();
            let bounded_data: BoundedVec<u8, <Runtime as pallet_nfts::Config>::StringLimit> =
                BoundedVec::try_from(metadata_bytes).expect("NFT metadata exceeds StringLimit");

            pallet_nfts::ItemMetadataOf::<Runtime>::insert(
                collection_id,
                item_id,
                ItemMetadata {
                    deposit: ItemMetadataDeposit {
                        account: None,
                        amount: 0u128,
                    },
                    data: bounded_data,
                },
            );
        }
    }

    // Set next collection ID so future creates don't collide
    pallet_nfts::NextCollectionId::<Runtime>::put(max_collection_id);
}
