// src/scripts/simUtils/simDeck.ts

import { CardProcessor } from '../../game/cards/CardProcessor';
// Import all card pages to register them
import { registerPage1 } from '../../game/cards/CardIndex/DeckPage1';
import { registerPage2 } from '../../game/cards/CardIndex/DeckPage2';
import { registerPage3 } from '../../game/cards/CardIndex/DeckPage3';
import { registerPage4 } from '../../game/cards/CardIndex/DeckPage4';
import { registerPage5 } from '../../game/cards/CardIndex/DeckPage5';
import { registerPage6 } from '../../game/cards/CardIndex/DeckPage6';
import { registerPage7 } from '../../game/cards/CardIndex/DeckPage7';
import { registerPage8 } from '../../game/cards/CardIndex/DeckPage8';
import { registerPage9 } from '../../game/cards/CardIndex/DeckPage9';
import { registerPage10 } from '../../game/cards/CardIndex/DeckPage10';
import { registerPage11 } from '../../game/cards/CardIndex/DeckPage11';
import { registerPage12 } from '../../game/cards/CardIndex/DeckPage12';
import { registerPage13 } from '../../game/cards/CardIndex/DeckPage13';
import { registerPage14 } from '../../game/cards/CardIndex/DeckPage14';
import { registerPage15 } from '../../game/cards/CardIndex/DeckPage15';
import { registerPage16 } from '../../game/cards/CardIndex/DeckPage16';
import { registerPage17 } from '../../game/cards/CardIndex/DeckPage17';
import { registerPage18 } from '../../game/cards/CardIndex/DeckPage18';
import { registerPage19 } from '../../game/cards/CardIndex/DeckPage19';
import { registerPage20 } from '../../game/cards/CardIndex/DeckPage20';
import { registerPage21 } from '../../game/cards/CardIndex/DeckPage21';
import { registerPage22 } from '../../game/cards/CardIndex/DeckPage22';

let cardsRegistered = false;

export function registerAllCards(): void {
  if (cardsRegistered) return;
  
  console.log('=== REGISTERING CARDS ===');
  registerPage1();
  registerPage2();
  registerPage3();
  registerPage4();
  registerPage5();
  registerPage6();
  registerPage7();
  registerPage8();
  registerPage9();
  registerPage10();
  registerPage11();
  registerPage12();
  registerPage13();
  registerPage14();
  registerPage15();
  registerPage16();
  registerPage17();
  registerPage18();
  registerPage19();
  registerPage20();
  registerPage21();
  registerPage22();
  cardsRegistered = true;
  console.log('All cards registered');
}