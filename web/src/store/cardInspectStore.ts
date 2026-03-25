import { create } from 'zustand';
import type { BoardUnitView, CardView } from '../types';
import { useGameStore } from './gameStore';

type InspectCard = CardView | BoardUnitView;

interface RarityInfo {
  rarity: number;
  totalWeight: number;
}

interface CardInspectStore {
  isOpen: boolean;
  card: InspectCard | null;
  rarityInfo: RarityInfo | null;
  open: (card: InspectCard, rarityInfo?: RarityInfo) => void;
  close: () => void;
  toggle: (card: InspectCard, rarityInfo?: RarityInfo) => void;
}

function clearSelection() {
  useGameStore.getState().setSelection(null);
}

export const useCardInspectStore = create<CardInspectStore>((set) => ({
  isOpen: false,
  card: null,
  rarityInfo: null,
  open: (card, rarityInfo) => {
    clearSelection();
    set({ isOpen: true, card, rarityInfo: rarityInfo ?? null });
  },
  close: () => {
    clearSelection();
    set({ isOpen: false, card: null, rarityInfo: null });
  },
  toggle: (card, rarityInfo) => {
    clearSelection();
    set((state) =>
      state.isOpen
        ? { isOpen: false, card: null, rarityInfo: null }
        : { isOpen: true, card, rarityInfo: rarityInfo ?? null }
    );
  },
}));
