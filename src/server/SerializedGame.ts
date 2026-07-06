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

export type SerializedCardPlayEvent = {
  playerId: PlayerId;
  playerName: string;
  cardName: string;
  source: 'play' | 'activate';
  generation: number;
  turnIndex: number;
  atMs: number;
};

export type SerializedFinalScore = {
  playerId: PlayerId;
  playerName: string;
  survivalPoints: number;
  nicePoints: number;
  coolPoints: number;
  finalScore: number;
  isAlive: boolean;
  rank: number;
};

export type SerializedPlayerTrackingMetrics = {
  playerId: PlayerId;
  playerName: string;
  heroId?: HeroId;
  heroName?: string;
  stepsTaken: number;
  trapsBuilt: number;
  barricadesBuilt: number;
  cardsBought: number;
  cardsBoughtByName: Array<{ cardName: string; count: number }>;
  cardsPlayed: number;
  cardsActivated: number;
  cardsPlayedByName: Array<{ cardName: string; count: number }>;
  finalSP: number;
  finalNP: number;
  finalCP: number;
  finalScore: number;
  rank?: number;
};

export type SerializedTracking = {
  gameLog: string[];
  cardsPlayedByPlayer: SerializedCardPlayEvent[];
  playerMetricsByPlayer?: SerializedPlayerTrackingMetrics[];
  finalScoresByPlayer?: SerializedFinalScore[];
  completedAtMs?: number;
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
  tracking?: SerializedTracking;
  createdAtMs: number;
  lastSaveId: number;
  settings?: { firstCardFreeNightDraft: boolean };
};
