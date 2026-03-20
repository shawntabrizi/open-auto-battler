import type { ComponentType } from 'react';
import Welcome from './01-welcome';
import Shop from './02-shop';
import Battle from './03-battle';
import Winning from './04-winning';

export const slides: ComponentType[] = [Welcome, Shop, Battle, Winning];
