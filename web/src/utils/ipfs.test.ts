import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ inHost: false }));
vi.mock('../services/hostEnvironment', () => ({ isInHost: () => host.inHost }));

import { ipfsUrl } from './ipfs';
import { getCardArtSm } from './cardArt';
import { useCustomizationStore } from '../store/customizationStore';

afterEach(() => {
  host.inHost = false;
  useCustomizationStore.getState().clearSelections();
});

describe('ipfsUrl', () => {
  it('resolves ipfs:// URIs to a public gateway when standalone', () => {
    expect(ipfsUrl('ipfs://bafyabc/x.webp')).toBe('https://w3s.link/ipfs/bafyabc/x.webp');
  });

  // The host sandbox CSP blocks every origin but the app's own. A gateway URL
  // would only produce a CSP violation, so the app must not emit one there.
  it('never emits an external URL inside a host', () => {
    host.inHost = true;
    expect(ipfsUrl('ipfs://bafyabc/x.webp')).toBe('');
    expect(ipfsUrl('https://ipfs.io/ipfs/bafyabc')).toBe('');
  });
});

describe('getCardArtSm', () => {
  it('falls back to the emoji card (null) inside a host even with card art selected', () => {
    useCustomizationStore.setState({
      selections: {
        ...useCustomizationStore.getState().selections,
        cardArt: {
          collectionId: 0,
          itemId: 0,
          type: 'card_art',
          name: 'art',
          imageUrl: '',
          ipfsCid: 'bafyart',
        },
      },
    });
    expect(getCardArtSm(1)).toBe('https://w3s.link/ipfs/bafyart/sm/1.webp');
    host.inHost = true;
    expect(getCardArtSm(1)).toBeNull();
  });
});
