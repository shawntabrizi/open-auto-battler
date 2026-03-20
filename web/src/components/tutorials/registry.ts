import type { ComponentType } from 'react';
import { slides as howToPlaySlides } from './how-to-play';

export interface TutorialDef {
  id: string;
  title: string;
  slides: ComponentType[];
}

export const tutorials: TutorialDef[] = [
  {
    id: 'how-to-play',
    title: 'How to Play',
    slides: howToPlaySlides,
  },
];

export function getTutorial(id: string): TutorialDef | undefined {
  return tutorials.find((t) => t.id === id);
}
