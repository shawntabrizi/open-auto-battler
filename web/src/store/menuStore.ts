import { create } from 'zustand';

interface MenuStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Set by TopBar when mounted — tells global hamburger to hide its floating button */
  hasTopBar: boolean;
  setHasTopBar: (v: boolean) => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  hasTopBar: false,
  setHasTopBar: (v) => set({ hasTopBar: v }),
}));
