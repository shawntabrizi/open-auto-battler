import { create } from 'zustand';
import { storageService } from '../services/storage';
import { isInHost } from '../services/hostEnvironment';

const DECKS_STORAGE_KEY = 'oab-constructed-decks';
const SELECTED_DECK_KEY = 'oab-constructed-selected-deck';

export interface ConstructedDeck {
  id: string;
  name: string;
  cards: number[]; // card IDs (length should be 50)
  createdAt: number;
  updatedAt: number;
}

interface ConstructedStore {
  decks: ConstructedDeck[];
  selectedDeckId: string | null;
  loaded: boolean;

  loadDecks: () => Promise<void>;
  saveDeck: (deck: ConstructedDeck) => Promise<void>;
  deleteDeck: (id: string) => Promise<void>;
  selectDeck: (id: string | null) => void;
  getDeck: (id: string) => ConstructedDeck | undefined;
}

function generateId(): string {
  return `deck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyDeck(name?: string): ConstructedDeck {
  return {
    id: generateId(),
    name: name ?? 'New Deck',
    cards: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export const useConstructedStore = create<ConstructedStore>((set, get) => ({
  decks: [],
  selectedDeckId: isInHost() ? null : (localStorage.getItem(SELECTED_DECK_KEY) ?? null),
  loaded: false,

  loadDecks: async () => {
    if (get().loaded) return;
    const data = await storageService.readJSON<ConstructedDeck[]>(DECKS_STORAGE_KEY);
    const selectedId = await storageService.readString(SELECTED_DECK_KEY);
    set({
      decks: data ?? [],
      selectedDeckId: selectedId ?? get().selectedDeckId,
      loaded: true,
    });
  },

  saveDeck: async (deck: ConstructedDeck) => {
    const { decks } = get();
    const idx = decks.findIndex((d) => d.id === deck.id);
    const updated = { ...deck, updatedAt: Date.now() };
    const next =
      idx >= 0 ? decks.map((d) => (d.id === deck.id ? updated : d)) : [...decks, updated];
    set({ decks: next });
    await storageService.writeJSON(DECKS_STORAGE_KEY, next);
  },

  deleteDeck: async (id: string) => {
    const next = get().decks.filter((d) => d.id !== id);
    set((s) => ({
      decks: next,
      selectedDeckId: s.selectedDeckId === id ? null : s.selectedDeckId,
    }));
    await storageService.writeJSON(DECKS_STORAGE_KEY, next);
  },

  selectDeck: (id: string | null) => {
    set({ selectedDeckId: id });
    if (id) {
      storageService.writeString(SELECTED_DECK_KEY, id);
    } else {
      storageService.remove(SELECTED_DECK_KEY);
    }
  },

  getDeck: (id: string) => {
    return get().decks.find((d) => d.id === id);
  },
}));
