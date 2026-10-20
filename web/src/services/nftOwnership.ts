/**
 * Which OAB Collectibles (Scarcity collection 29) the player owns.
 *
 * Scarcity holds one NFT per key, and claimed items land at host-derived purse
 * keys, not at the player's account. No on-chain view lists the tokens of a
 * person: `balanceOf` / `tokenOfOwnerByIndex` answer per key, the collection
 * has no `totalSupply` / `tokenByIndex`, and token ids are one global serial
 * across all collections. Only the host knows the purse keys.
 *
 * The host API for that is NftPurse (`truapi.nftPurse.list`, wire trait 19),
 * which is on host-rust-core branch `cbh/nft-purses` only; no published
 * `@parity/product-sdk-host` or `@parity/truapi` has it (checked 0.27.1 /
 * 0.25.0, 2026-10-20). So the source below is a disabled stub, `ownedNfts`
 * stays empty, and the customize pages show the default cosmetics.
 *
 * What already works is the second half: `readCosmeticItem` turns an item
 * index into a cosmetic from the item's on-chain `oab.*` metadata
 * (`scripts/check-ranked-reads.mjs` checks it against the live collection).
 */

import type { CustomizationType, NftItem } from '../store/customizationStore';
import { ipfsUrl } from '../utils/ipfs';

export const COLLECTIBLES_COLLECTION = 29;

/** ERC-721 address of a Scarcity collection: id big-endian in the first 4 bytes. */
export function collectionAddress(collection: number): `0x${string}` {
  return `0x${collection.toString(16).padStart(8, '0')}00000000000000000000000005200000`;
}

/** One instance held by the player, as a purse listing reports it. */
export interface OwnedInstance {
  collection: number;
  instance: bigint;
  item: number;
}

/** Lists the player's instances. Swap the implementation when NftPurse ships. */
export interface OwnershipSource {
  readonly name: string;
  /** False: the source cannot list anything here, so callers skip it. */
  readonly enabled: boolean;
  list(collections: number[]): Promise<OwnedInstance[]>;
}

/**
 * NftPurse source, disabled until the host API is published. Then: call
 * `truapi.nftPurse.list({ collections })` and map `NftPurseItem { instance,
 * collection, item }` to `OwnedInstance`.
 */
export const nftPurseSource: OwnershipSource = {
  name: 'NftPurse',
  enabled: false,
  list: () => Promise.resolve([]),
};

/** The `ownedNfts` source the app uses. */
export const ownershipSource: OwnershipSource = nftPurseSource;

const SLOTS: readonly CustomizationType[] = [
  'board_bg',
  'hand_bg',
  'card_style',
  'avatar',
  'card_art',
  'theme',
];

/** Item-scope metadata keys the collection defines (docs/NFT_DESIGN.md §4). */
export const ITEM_KEYS = ['oab.slot', 'oab.name', 'oab.asset'] as const;

/**
 * Build a cosmetic from an item's `oab.slot` / `oab.name` / `oab.asset`.
 * Returns null for an item that is not a cosmetic this app can show (unknown
 * slot, missing asset), so a later item kind never breaks the page.
 */
export function cosmeticFromMetadata(
  item: number,
  meta: { slot: string; name: string; asset: string }
): NftItem | null {
  const type = SLOTS.find((s) => s === meta.slot);
  if (!type || !meta.asset.startsWith('ipfs://')) return null;
  return {
    collectionId: COLLECTIBLES_COLLECTION,
    itemId: item,
    type,
    name: meta.name || `Item ${item}`,
    imageUrl: type === 'theme' || type === 'card_art' ? '' : ipfsUrl(meta.asset),
    ipfsCid: meta.asset,
  };
}

/** Reads one item-scope metadata value (`itemMetadata(uint32,bytes)`) as UTF-8. */
export type ItemMetadataReader = (item: number, key: string) => Promise<string>;

export async function readCosmeticItem(
  read: ItemMetadataReader,
  item: number
): Promise<NftItem | null> {
  const [slot, name, asset] = await Promise.all(ITEM_KEYS.map((k) => read(item, k)));
  return cosmeticFromMetadata(item, { slot: slot ?? '', name: name ?? '', asset: asset ?? '' });
}

/** The player's cosmetics: one per distinct owned item of collection 29. */
export async function loadOwnedCosmetics(
  source: OwnershipSource,
  read: ItemMetadataReader
): Promise<NftItem[]> {
  if (!source.enabled) return [];
  const owned = await source.list([COLLECTIBLES_COLLECTION]);
  const items = [...new Set(owned.map((o) => o.item))];
  const out = await Promise.all(items.map((i) => readCosmeticItem(read, i)));
  return out.filter((n): n is NftItem => n !== null);
}
