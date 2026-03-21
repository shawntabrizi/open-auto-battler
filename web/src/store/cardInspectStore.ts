import { create } from 'zustand';
import type { BoardUnitView, CardView } from '../types';
import { useGameStore } from './gameStore';

type InspectCard = CardView | BoardUnitView;

interface CardInspectStore {
  isOpen: boolean;
  card: InspectCard | null;
  open: (card: InspectCard) => void;
  close: () => void;
  toggle: (card: InspectCard) => void;
}

function clearSelection() {
  useGameStore.getState().setSelection(null);
}

export const useCardInspectStore = create<CardInspectStore>((set) => ({
  isOpen: false,
  card: null,
  open: (card) => {
    clearSelection();
    set({ isOpen: true, card });
  },
  close: () => {
    clearSelection();
    set({ isOpen: false, card: null });
  },
  toggle: (card) => {
    clearSelection();
    set((state) => (state.isOpen ? { isOpen: false, card: null } : { isOpen: true, card }));
  },
}));
