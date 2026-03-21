import { create } from 'zustand';

interface ShortcutHelpStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useShortcutHelpStore = create<ShortcutHelpStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
