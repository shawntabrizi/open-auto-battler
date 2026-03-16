import { create } from 'zustand';

interface AchievementStore {
  /** Set of card IDs the connected player has unlocked via victory achievements. */
  unlockedCardIds: Set<number>;
  /** Whether achievements have been fetched for the current account. */
  isLoaded: boolean;

  /** Fetch VictoryAchievements for the given account from on-chain storage. */
  fetchAchievements: (api: any, accountAddress: string) => Promise<void>;
  /** Check if a card ID is unlocked. */
  isHolographic: (cardId: number) => boolean;
  /** Clear achievements (on account switch / disconnect). */
  clear: () => void;
}

export const useAchievementStore = create<AchievementStore>((set, get) => ({
  unlockedCardIds: new Set(),
  isLoaded: false,

  fetchAchievements: async (api: any, accountAddress: string) => {
    if (!api || !accountAddress) return;

    try {
      const entries = await api.query.AutoBattle.VictoryAchievements.getEntries(accountAddress);
      const cardIds = new Set<number>();
      for (const entry of entries) {
        // Key is (AccountId, card_id), value is bool
        if (entry.value) {
          const cardId = Number(entry.keyArgs[1]);
          cardIds.add(cardId);
        }
      }
      set({ unlockedCardIds: cardIds, isLoaded: true });
    } catch (err) {
      // VictoryAchievements storage may not exist on older chains — treat as empty
      console.warn('Failed to fetch victory achievements:', err);
      set({ unlockedCardIds: new Set(), isLoaded: true });
    }
  },

  isHolographic: (cardId: number) => get().unlockedCardIds.has(cardId),

  clear: () => set({ unlockedCardIds: new Set(), isLoaded: false }),
}));
