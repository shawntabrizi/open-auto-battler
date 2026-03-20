import type { ComponentType } from 'react';
import Welcome from './01-welcome';
import Goal from './02-goal';
import Cards from './03-cards';
import Bag from './04-bag';
import Shop from './05-shop';
import Battle from './06-battle';
import Strategy from './07-strategy';
import Closing from './08-closing';

export const slides: ComponentType[] = [Welcome, Goal, Cards, Bag, Shop, Battle, Strategy, Closing];
