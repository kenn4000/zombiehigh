import { PlayerId } from '../Types';
import { Color } from '../Color';
import { CardModel } from './CardModel';
import { PlayerInputModel } from './PlayerInputModel';
import { HeroId } from '../HeroId';
import { LockerId } from '../LockerId';

export type PlayerModel = {
  id: PlayerId;
  name: string;
  color: Color;
  isActive: boolean;
  isAlive: boolean;

  // Resources
  gold: number;
  hitPoints: number;
  maxHitPoints: number;
  survivalPoints: number;
  nicePoints: number;
  coolPoints: number;
  goldProduction: number;

  // Board limits
  trapLimit: number;
  trapSuccessRate: number;
  barricadeFailRate: number;
  meleeSuccessRate: number;
  meleeCost: number;
  moveCost: number;
  trapCost: number;
  baitCost: number;
  barricadeCost: number;
  trapsPlaced: number;

  // Current room (used for card playability checks)
  currentRoom: string;

  // Hero / locker items
  heroId: HeroId | undefined;
  lockerIds: ReadonlyArray<LockerId>;

  // Cards
  cardsInHand: ReadonlyArray<CardModel>;
  playedCards: ReadonlyArray<CardModel>;
  activeActions: ReadonlyArray<CardModel>;
  activePassives: ReadonlyArray<CardModel>;
  usedActionNames: ReadonlyArray<string>;
  /** True when the player still has an unresolved starting action that must be done first. */
  hasStartingAction: boolean;

  // Draft
  temporaryHand: ReadonlyArray<CardModel>;
  selectedDraftCards: ReadonlyArray<CardModel>;
  /** Gold cost per card during the draft phase (usually 4, reduced by hero passives). */
  draftCostPerCard: number;
  /** When > 0, player must select this many cards from temporaryHand to keep. */
  pendingDrawKeepCount: number;

  /** Points accumulated this night from barricade holds, bait consumed, and object adjacency. 0 if none. */
  pendingNightPoints: number;

  // Setup
  setupCardOptions: ReadonlyArray<CardModel>;
  setupHeroOptionIds: ReadonlyArray<HeroId>;
  setupLockerOptionIds: ReadonlyArray<LockerId>;
  selectedStartingCards: ReadonlyArray<CardModel>;
  selectedHeroId: HeroId | undefined;
  /** True when selected hero gives all starting cards for free (Card Shark). */
  heroStartingCardsFree: boolean;
  selectedLockerIds: ReadonlyArray<LockerId>;
  setupConfirmed: boolean;

  // What input this player needs to provide (undefined if not their turn / nothing pending)
  waitingFor: PlayerInputModel | undefined;

  isLastSurvivor: boolean;

  // Position
  q: number;
  r: number;
};
