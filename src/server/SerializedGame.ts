import { GameId, PlayerId } from '../common/Types';
import { Phase } from '../common/Phase';
import { Color } from '../common/Color';
import { HeroId } from '../common/HeroId';
import { LockerId } from '../common/LockerId';

export type SerializedHex = { q: number; r: number };

export type SerializedCard = {
  name: string;
  effect: string;
  requirement: string;
  bonus: string;
  playCost: number;
  description: string;
};

export type SerializedPlayer = {
  id: PlayerId;
  name: string;
  color: Color;
  q: number;
  r: number;
  gold: number;
  hitPoints: number;
  maxHitPoints: number;
  survivalPoints: number;
  nicePoints: number;
  coolPoints: number;
  goldProduction: number;
  trapLimit: number;
  trapSuccessRate: number;
  barricadeFailRate: number;
  meleeSuccessRate: number;
  meleeCost: number;
  cardsInHand: SerializedCard[];
  playedCards: SerializedCard[];
  activeActions: SerializedCard[];
  usedActions: SerializedCard[];
  activePassives: SerializedCard[];
  temporaryHand: SerializedCard[];
  selectedDraftCards: SerializedCard[];
  selectedHeroId: HeroId | undefined;
  selectedLockerIds: LockerId[];
  setupConfirmed: boolean;
  selectedStartingCards: SerializedCard[];
  setupCardOptions: SerializedCard[];
  setupHeroOptionIds: HeroId[];
  setupLockerOptionIds: LockerId[];
  isPlaced: boolean;
  isLastSurvivor: boolean;
};

export type SerializedZombie = {
  id: number;
  q: number;
  r: number;
};

export type SerializedBoard = {
  barricades: Array<{ edgeKey: string; ownerId: PlayerId }>;
  traps: Array<{ hexKey: string; ownerId: PlayerId }>;
  baits: Array<{ hexKey: string; ownerId: PlayerId }>;
};

export type SerializedGame = {
  id: GameId;
  phase: Phase;
  generation: number;
  actionsRemaining: number;
  activePlayerId: PlayerId;
  playerInEscapeId: PlayerId | undefined;
  currentMode: string;
  firstBarricadeHex: SerializedHex | undefined;
  pendingTargetCardName: string | undefined;
  pendingTargetPlayerId: PlayerId | undefined;
  pendingInteraction: {
    type: string;
    playerId: PlayerId;
    cardName: string;
    data?: { hexKey?: string };
  } | undefined;
  passedPlayerIds: PlayerId[];
  setupPlayerIndex: number;
  players: SerializedPlayer[];
  board: SerializedBoard;
  zombies: SerializedZombie[];
  deck: SerializedCard[];
  gameLog: string[];
  createdAtMs: number;
  lastSaveId: number;
  settings?: { firstCardFreeNightDraft: boolean };
};
