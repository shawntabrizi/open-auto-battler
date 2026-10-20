//! Identity probe — a test contract shaped like a mode's hot path, used only
//! by the M2 on-chain check (`scripts/m2/check-identity.mjs`). Not a product
//! contract; not registered in CDM.
//!
//! `play()` does what every mode call will do: resolve `msg.sender` through
//! Identity (revert if Identity reverts, decision Q3), then write one small
//! item for the player. The first `play()` of a player creates the item, so
//! it shows the storage deposit a session key pays in PGAS.

#![cfg_attr(not(any(test, feature = "std", feature = "abi-gen")), no_main, no_std)]

#[cfg(all(feature = "abi-gen", not(test)))]
extern crate alloc;

pvm_contract_sdk::abi_import! {
    #![abi_import(alloc = true)]
    pragma solidity ^0.8.30;

    interface IIdentity {
        function resolve(address account) external view returns (address);
    }
}

#[pvm_contract_sdk::contract(allocator = "pico", allocator_size = 65536)]
mod oab_identity_probe {
    use super::*;
    use pvm_contract_sdk::{Address, StorageFlags};

    /// The Identity call failed (bad address, or the caller's key is
    /// expired or revoked).
    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub struct IdentityFailed;

    #[derive(Debug, pvm_contract_sdk::SolError)]
    pub enum ProbeError {
        IdentityFailed(IdentityFailed),
    }

    #[derive(pvm_contract_sdk::SolEvent)]
    pub struct Played {
        #[indexed]
        pub caller: Address,
        #[indexed]
        pub player: Address,
        pub count: u32,
    }

    pub struct OabIdentityProbe;

    impl OabIdentityProbe {
        fn identity(&self) -> Address {
            let mut buf = [0u8; 32];
            let mut out = &mut buf[..];
            let _ = self
                .host()
                .get_storage(StorageFlags::empty(), &[0u8; 32], &mut out);
            let mut a = [0u8; 20];
            if out.len() == 20 {
                a.copy_from_slice(out);
            }
            Address(a)
        }

        #[pvm_contract_sdk::constructor]
        pub fn new(&mut self, identity: Address) {
            self.host()
                .set_storage(StorageFlags::empty(), &[0u8; 32], &identity.0);
        }

        /// Resolve the caller, then count one play for the player.
        #[pvm_contract_sdk::method]
        pub fn play(&mut self) -> Result<Address, ProbeError> {
            use i_identity::IIdentity;
            let mut caller = [0u8; 20];
            self.host().caller(&mut caller);
            let player = IIdentity::from_address(self.identity())
                .resolve(Address(caller))
                .call(self)
                .map_err(|_| IdentityFailed)?;
            let mut key = [1u8; 32];
            key[12..].copy_from_slice(&player.0);
            let mut buf = [0u8; 32];
            let mut out = &mut buf[..];
            let count = match self
                .host()
                .get_storage(StorageFlags::empty(), &key, &mut out)
            {
                Ok(_) if out.len() == 4 => u32::from_le_bytes([out[0], out[1], out[2], out[3]]),
                _ => 0,
            } + 1;
            self.host()
                .set_storage(StorageFlags::empty(), &key, &count.to_le_bytes());
            Played {
                caller: Address(caller),
                player,
                count,
            }
            .emit(self.host());
            Ok(player)
        }

        #[pvm_contract_sdk::method]
        pub fn identity_address(&self) -> Address {
            self.identity()
        }
    }
}
