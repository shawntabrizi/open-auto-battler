import type { ComponentType } from 'react';
import Welcome from './01-welcome';
import Goal from './02-goal';
import Cards from './03-cards';
import Shop from './04-shop';
import Battle from './05-battle';
import Strategy from './06-strategy';
import Closing from './07-closing';

export const slides: ComponentType[] = [Welcome, Goal, Cards, Shop, Battle, Strategy, Closing];
