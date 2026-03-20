import type { ComponentType } from 'react';
import Welcome from './01-welcome';
import Goal from './02-goal';
import Cards from './03-cards';
import Bag from './04-bag';
import Shop from './05-shop';
import RoundProgression from './06-round-progression';
import Battle from './07-battle';
import Strategy from './08-strategy';
import Closing from './09-closing';

export const slides: ComponentType[] = [Welcome, Goal, Cards, Bag, Shop, RoundProgression, Battle, Strategy, Closing];
