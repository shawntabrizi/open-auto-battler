import { create } from 'zustand';

interface TutorialStore {
  isOpen: boolean;
  tutorialId: string | null;
  slideIndex: number;
  open: (id: string) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

export const useTutorialStore = create<TutorialStore>((set) => ({
  isOpen: false,
  tutorialId: null,
  slideIndex: 0,
  open: (id) => set({ isOpen: true, tutorialId: id, slideIndex: 0 }),
  close: () => set({ isOpen: false, tutorialId: null, slideIndex: 0 }),
  next: () => set((s) => ({ slideIndex: s.slideIndex + 1 })),
  prev: () => set((s) => ({ slideIndex: Math.max(0, s.slideIndex - 1) })),
  goTo: (index) => set({ slideIndex: index }),
}));
