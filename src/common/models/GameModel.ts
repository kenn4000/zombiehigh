import { GameId, PlayerId } from '../Types';
import { Phase } from '../Phase';
import { PlayerModel } from './PlayerModel';
import { BoardModel } from './BoardModel';

export type GameSettings = {
  firstCardFreeNightDraft: boolean;
};

export type GameModel = {
  id: GameId;
  phase: Phase;
  generation: number;
  actionsRemaining: number;
  activePlayerId: PlayerId;
  playerInEscapeId: PlayerId | undefined;
  /** Set when a played card requires the player to click a zombie tile to kill it. */
  pendingTargetPlayerId: string | undefined;
  /** Set when a played card requires the player to click a board tile to resolve an interaction (trap move, barricade destroy, etc.). */
  pendingInteractionPlayerId: string | undefined;
  currentMode: string;
  /** Player whose turn it is to choose NP or CP for the night's accumulated rewards (undefined if none). */
  nightChoicePlayerId?: string;
  players: ReadonlyArray<PlayerModel>;
  board: BoardModel;
  logs: ReadonlyArray<string>;
  nightScoreHistory: ReadonlyArray<ReadonlyArray<{ id: string; name: string; color: string; score: number }>>;
  settings: GameSettings;
};
