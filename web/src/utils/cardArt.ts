/**
 * Card art resolution utility.
 * Resolves card images from the selected card_art NFT's IPFS directory,
 * falling back to the default genesis card art CID.
 */

import { useCustomizationStore } from '../store/customizationStore';
import { ipfsUrl } from './ipfs';

/** Default card art directory CID from styles.json genesis set. */
const DEFAULT_CARD_ART_CID = 'bafybeialdf7cqyadsw2i57s6f5vdjyggotdtmcjzu7jr2oyp2ejuvkmxfy';

/** Get the active card art directory CID — selected NFT or default. */
function getCardArtCid(): string {
  const cardArt = useCustomizationStore.getState().selections.cardArt;
  return cardArt?.ipfsCid ?? DEFAULT_CARD_ART_CID;
}

/** Returns the small (256x340) card art URL. */
export function getCardArtSm(cardId: number): string {
  return ipfsUrl(`ipfs://${getCardArtCid()}/sm/${cardId}.webp`);
}

/** Returns the medium (464x616) card art URL. */
export function getCardArtMd(cardId: number): string {
  return ipfsUrl(`ipfs://${getCardArtCid()}/md/${cardId}.webp`);
}
