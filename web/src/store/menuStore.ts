import { create } from 'zustand';

interface MenuStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useMenuStore = create<MenuStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
