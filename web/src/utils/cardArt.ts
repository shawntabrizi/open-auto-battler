/**
 * Card art resolution utility.
 * Resolves card images from the selected card_art NFT's IPFS directory.
 * Returns null when no card art is selected (default = emoji fallback).
 */

import { useCustomizationStore } from '../store/customizationStore';
import { ipfsUrl } from './ipfs';

/** Get the active card art directory CID, or null if using default (emoji). */
function getCardArtCid(): string | null {
  const cardArt = useCustomizationStore.getState().selections.cardArt;
  return cardArt?.ipfsCid ?? null;
}

/** Returns the small (256x340) card art URL, or null if no card art selected. */
export function getCardArtSm(cardId: number): string | null {
  const cid = getCardArtCid();
  if (!cid) return null;
  return ipfsUrl(`ipfs://${cid}/sm/${cardId}.webp`);
}

/** Returns the medium (464x616) card art URL, or null if no card art selected. */
export function getCardArtMd(cardId: number): string | null {
  const cid = getCardArtCid();
  if (!cid) return null;
  return ipfsUrl(`ipfs://${cid}/md/${cardId}.webp`);
}
