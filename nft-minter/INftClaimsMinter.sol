// SPDX-License-Identifier: MIT-0
pragma solidity ^0.8.30;

/// The item-selection callback that `indiv-pallet-nft-claims` calls on a
/// contract registered with `NftClaimsMinter.setContractMinter(collection, minter)`.
/// The runtime ABI-encodes `mint(uint32,bytes32)` and accepts exactly one
/// canonical `uint32` word back: the item index to mint.
interface INftClaimsMinter {
    function mint(uint32 collection, bytes32 credit) external pure returns (uint32);
}
