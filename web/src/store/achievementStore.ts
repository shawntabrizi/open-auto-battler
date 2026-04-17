import { create } from 'zustand';

const ACHIEVEMENT_BRONZE = 0b001;
const ACHIEVEMENT_SILVER = 0b010;
const ACHIEVEMENT_GOLD = 0b100;

interface AchievementStore {
  /** Map of card ID to achievement bitmap (bronze=1, silver=2, gold=4). */
  achievements: Map<number, number>;
  /** Whether achievements have been fetched for the current account. */
  isLoaded: boolean;

  /** Fetch achievement bitmaps for the given account from on-chain storage. */
  fetchAchievements: (api: AchievementApi | null, accountAddress: string) => Promise<void>;
  /** Check if a card has the bronze achievement (played on board for a battle). */
  hasBronze: (cardId: number) => boolean;
  /** Check if a card has the silver achievement (10 wins). */
  hasSilver: (cardId: number) => boolean;
  /** Check if a card has the gold achievement (perfect 10 wins, no losses). */
  hasGold: (cardId: number) => boolean;
  /** Check if a card has holographic effect (silver or gold achievement). */
  isHolographic: (cardId: number) => boolean;
  /** Clear achievements (on account switch / disconnect). */
  clear: () => void;
}

interface AchievementEntry {
  keyArgs: unknown[];
  value: unknown;
}

interface AchievementApi {
  query: {
    OabCardRegistry: {
      VictoryAchievements: {
        getEntries: (accountAddress: string) => Promise<AchievementEntry[]>;
      };
    };
  };
}

export const useAchievementStore = create<AchievementStore>((set, get) => ({
  achievements: new Map(),
  isLoaded: false,

  fetchAchievements: async (api: AchievementApi | null, accountAddress: string) => {
    if (!api || !accountAddress) return;

    try {
      const entries =
        await api.query.OabCardRegistry.VictoryAchievements.getEntries(accountAddress);
      const achievements = new Map<number, number>();
      for (const entry of entries) {
        // Key is (AccountId, card_id), value is u8 bitmap
        const bits = Number(entry.value);
        if (bits > 0) {
          const cardId = Number(entry.keyArgs[1]);
          achievements.set(cardId, bits);
        }
      }
      set({ achievements, isLoaded: true });
    } catch (err) {
      // VictoryAchievements storage may not exist on older chains — treat as empty
      console.warn('Failed to fetch victory achievements:', err);
      set({ achievements: new Map(), isLoaded: true });
    }
  },

  hasBronze: (cardId: number) => ((get().achievements.get(cardId) ?? 0) & ACHIEVEMENT_BRONZE) !== 0,
  hasSilver: (cardId: number) => ((get().achievements.get(cardId) ?? 0) & ACHIEVEMENT_SILVER) !== 0,
  hasGold: (cardId: number) => ((get().achievements.get(cardId) ?? 0) & ACHIEVEMENT_GOLD) !== 0,
  isHolographic: (cardId: number) => {
    const bits = get().achievements.get(cardId) ?? 0;
    return (bits & (ACHIEVEMENT_SILVER | ACHIEVEMENT_GOLD)) !== 0;
  },

  clear: () => set({ achievements: new Map(), isLoaded: false }),
}));
