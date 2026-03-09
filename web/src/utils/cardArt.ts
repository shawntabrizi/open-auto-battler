/**
 * Card art resolution utility.
 * Resolves card images from the selected card_art NFT's IPFS directory.
 * Falls back to null (emoji fallback) when no card art set is selected.
 */

import { useCustomizationStore } from '../store/customizationStore';
import { ipfsUrl } from './ipfs';

/** Returns the small (256x340) card art URL from the selected IPFS card art set, or null. */
export function getCardArtSm(cardId: number): string | null {
  const cardArt = useCustomizationStore.getState().selections.cardArt;
  if (!cardArt) return null;
  return ipfsUrl(`ipfs://${cardArt.ipfsCid}/sm/${cardId}.webp`);
}

/** Returns the medium (464x616) card art URL from the selected IPFS card art set, or null. */
export function getCardArtMd(cardId: number): string | null {
  const cardArt = useCustomizationStore.getState().selections.cardArt;
  if (!cardArt) return null;
  return ipfsUrl(`ipfs://${cardArt.ipfsCid}/md/${cardId}.webp`);
}
