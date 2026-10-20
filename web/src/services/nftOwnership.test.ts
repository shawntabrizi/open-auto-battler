import { describe, expect, it, vi } from 'vitest';
import {
  collectionAddress,
  cosmeticFromMetadata,
  loadOwnedCosmetics,
  nftPurseSource,
  ownershipSource,
  type OwnershipSource,
} from './nftOwnership';

describe('collection address', () => {
  it('matches the live ERC-721 addresses of collections 29 and 30 (docs/NFT_DESIGN.md)', () => {
    expect(collectionAddress(29)).toBe('0x0000001d00000000000000000000000005200000');
    expect(collectionAddress(30)).toBe('0x0000001e00000000000000000000000005200000');
  });
});

describe('cosmetic from item metadata', () => {
  it('maps an item to the customize slot its oab.slot names', () => {
    const nft = cosmeticFromMetadata(3, {
      slot: 'board_bg',
      name: 'Cosmic Tree',
      asset: 'ipfs://bafyexample',
    });
    expect(nft).toMatchObject({
      collectionId: 29,
      itemId: 3,
      type: 'board_bg',
      name: 'Cosmic Tree',
    });
    expect(nft?.imageUrl).toContain('bafyexample');
  });

  it('skips items the app cannot show, so a future item kind (card unlocks) does not break the page', () => {
    expect(cosmeticFromMetadata(9, { slot: 'card', name: 'x', asset: 'ipfs://a' })).toBeNull();
    expect(cosmeticFromMetadata(1, { slot: 'avatar', name: 'x', asset: '' })).toBeNull();
  });
});

describe('owned cosmetics', () => {
  it('stays empty and reads nothing while NftPurse is not available', async () => {
    // Without the purse API there is no way to find the player's tokens;
    // the UI must keep the default cosmetics, not guess.
    expect(ownershipSource).toBe(nftPurseSource);
    expect(nftPurseSource.enabled).toBe(false);
    const read = vi.fn(() => Promise.resolve(''));
    expect(await loadOwnedCosmetics(ownershipSource, read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('reads each owned item once when a source lists instances', async () => {
    const source: OwnershipSource = {
      name: 'fake',
      enabled: true,
      list: () =>
        Promise.resolve([
          { collection: 29, instance: 10n, item: 0 },
          { collection: 29, instance: 11n, item: 0 },
        ]),
    };
    const meta: Record<string, string> = {
      'oab.slot': 'avatar',
      'oab.name': 'Cosmic Elf',
      'oab.asset': 'ipfs://elf',
    };
    const read = vi.fn((_item: number, key: string) => Promise.resolve(meta[key] ?? ''));
    const owned = await loadOwnedCosmetics(source, read);
    expect(owned.map((n) => n.name)).toEqual(['Cosmic Elf']);
    expect(read).toHaveBeenCalledTimes(3);
  });
});
