import { Game, Player, Board, BoardCell } from './index';
import { ActionManager } from './actions/ActionProcessor';
import { CardProcessor } from './cards/CardProcessor';

function restoreCardEntry(entry: any): any {
  const instanceId = typeof entry === 'string' ? entry : entry?.id;
  if (!instanceId) return entry;

  const suppliedCardId = typeof entry === 'object' ? entry.cardId : undefined;
  const inferredCardId = String(suppliedCardId ?? instanceId).replace(/-\d+$/, '');
  const definition = CardProcessor.get(String(suppliedCardId ?? instanceId)) ?? CardProcessor.get(inferredCardId);
  if (!definition) {
    return typeof entry === 'string'
      ? { id: instanceId, cardId: inferredCardId, name: inferredCardId }
      : entry;
  }

  return {
    ...definition,
    ...(typeof entry === 'object' ? entry : {}),
    id: instanceId,
    cardId: suppliedCardId ?? definition.id,
  };
}

function restoreCardList(entries: any): any[] {
  return Array.isArray(entries) ? entries.map(restoreCardEntry) : [];
}

function reconstructBoard(rawBoard: any, players: Player[] = []): Board {
  if (!rawBoard || !Array.isArray(rawBoard.cells)) {
    return new Board([]);
  }

  const playerById = new Map(players.map(player => [player.id, player]));

  const cells = rawBoard.cells.map((row: any[]) =>
    row.map((cell: any) => {
      if (!cell) return null;

      const boardCell = new BoardCell(
        cell.id,
        cell.x,
        cell.y,
        cell.roomId,
        cell.spawnId,
        !!cell.isHole
      );

      boardCell.occupantType = cell.occupantType || 'empty';
      boardCell.zombieId = cell.zombieId ?? null;
      boardCell.zombieStepsLeft = cell.zombieStepsLeft ?? null;
      boardCell.zombieTarget = null;
      boardCell.structureType = cell.structureType ?? null;
      boardCell.structureData = cell.structureData || {};

      const ownerId = cell.structureOwnerId ?? cell.ownerId ?? null;
      const owner = ownerId ? playerById.get(ownerId) ?? null : null;
      boardCell.structureOwner = owner;

      if (cell.structureType === 'player' && owner) {
        boardCell.setPlayer(owner);
      } else if (cell.structureType === 'trap' && owner) {
        boardCell.setTrap(owner);
      } else if (cell.structureType === 'barricade' && owner) {
        boardCell.setBarricade(owner);
      } else if (cell.structureType === 'bait' && owner) {
        boardCell.setBait(owner);
      }

      return boardCell;
    })
  );

  return new Board(cells as BoardCell[][]);
}

function reconstructPlayer(raw: any): Player {
  const player = new Player(raw.id, raw.name, raw.heroId ?? null);
  const safePlayer = player as any;

  Object.assign(safePlayer, raw);
  safePlayer.actionManager = new ActionManager();
  safePlayer.availableHeroes = safePlayer.availableHeroes || [];
  safePlayer.availableLockers = safePlayer.availableLockers || [];
  safePlayer.availableStartingCards = safePlayer.availableStartingCards || [];
  safePlayer.draftCards = safePlayer.draftCards || [];
  safePlayer.discardPile = safePlayer.discardPile || [];
  safePlayer.tempHeroId = safePlayer.tempHeroId ?? null;
  safePlayer.tempSelectedLockers = safePlayer.tempSelectedLockers || [];
  safePlayer.tempSelectedStartingCards = safePlayer.tempSelectedStartingCards || [];
  safePlayer.setupLockedIn = safePlayer.setupLockedIn ?? false;
  safePlayer.hand = safePlayer.hand || { cards: [], unplayableCards: [], playedCards: [] };
  safePlayer.tempHand = safePlayer.tempHand || [];

  return player;
}

export function hydrateGame(rawGame: any): Game {
  if (!rawGame || typeof rawGame !== 'object') {
    throw new Error('Game payload is empty');
  }

  const players = Array.isArray(rawGame.players)
    ? rawGame.players.map((p: any) => reconstructPlayer(p))
    : [];

  const board = reconstructBoard(rawGame.board, players);
  const game = new Game(players, board);

  for (const player of game.players) {
    player.hand.cards = restoreCardList(player.hand?.cards);
    player.hand.unplayableCards = restoreCardList(player.hand?.unplayableCards);
    player.hand.playedCards = restoreCardList(player.hand?.playedCards);
    player.actionCards = restoreCardList((player as any).actionCards);
    player.discardPile = restoreCardList(player.discardPile);
    player.tempHand = restoreCardList(player.tempHand);
  }

  const rawCardManager = rawGame.cardManager || {};
  const restoredCardManager = new (game.cardManager?.constructor ?? (require('./cards/CardDrawer').CardDrawer))();
  (restoredCardManager as any).gameDeck = Array.isArray(rawCardManager.gameDeck) ? [...rawCardManager.gameDeck] : [];
  (restoredCardManager as any).gameDiscard = Array.isArray(rawCardManager.gameDiscard) ? [...rawCardManager.gameDiscard] : [];
  (restoredCardManager as any).heroDeck = Array.isArray(rawCardManager.heroDeck) ? [...rawCardManager.heroDeck] : [];
  (restoredCardManager as any).heroDiscard = Array.isArray(rawCardManager.heroDiscard) ? [...rawCardManager.heroDiscard] : [];
  (restoredCardManager as any).lockerDeck = Array.isArray(rawCardManager.lockerDeck) ? [...rawCardManager.lockerDeck] : [];
  (restoredCardManager as any).lockerDiscard = Array.isArray(rawCardManager.lockerDiscard) ? [...rawCardManager.lockerDiscard] : [];
  game.cardManager = restoredCardManager;

  const runtimePhase = rawGame._phase ?? rawGame.phase ?? 'setup';
  const phaseCandidates = [
    'setup',
    'hero_selection',
    'locker_selection',
    'card_purchase',
    'placement',
    'player_turn',
    'zombie_turn',
    'zombie_phase',
    'draft',
    'game_over',
  ];
  const normalizedPhase = typeof runtimePhase === 'string' && phaseCandidates.includes(runtimePhase as any)
    ? runtimePhase
    : 'setup';

  game._phase = normalizedPhase as any;
  game._currentPlayerIndex = rawGame._currentPlayerIndex ?? rawGame.currentPlayerIndex ?? 0;
  game._actionsRemaining = rawGame._actionsRemaining ?? rawGame.actionsRemaining ?? 3;
  game._generationCount = rawGame._generationCount ?? rawGame.generationCount ?? 0;
  game._nightSteps = rawGame._nightSteps ?? rawGame.nightSteps ?? 1;
  game.logHistory = Array.isArray(rawGame.logHistory) ? [...rawGame.logHistory] : [];
  game.pendingCardSelection = rawGame.pendingCardSelection ?? null;

  const rawEscapeState = rawGame._escapeState ?? rawGame.escapeState ?? null;
  (game as any)._escapeState = rawEscapeState ? {
    ...rawEscapeState,
    validTargets: (rawEscapeState.validTargets ?? [])
      .map((target: any) => game.board.getCell(Number(target.x), Number(target.y)))
      .filter((cell: BoardCell | null): cell is BoardCell => !!cell),
  } : null;

  const rawGlobalPassives = rawGame.globalPassives ?? [];
  game.globalPassives = new Set(Array.isArray(rawGlobalPassives)
    ? rawGlobalPassives
    : Object.keys(rawGlobalPassives || {}));

  game.targetingCardId = rawGame.targetingCardId ?? null;
  game.targetingType = rawGame.targetingType ?? null;
  game.targetingValidTargets = rawGame.targetingValidTargets || [];
  game.targetingPlayerId = rawGame.targetingPlayerId
    ?? (typeof rawGame.targetingPlayer === 'string' ? rawGame.targetingPlayer : rawGame.targetingPlayer?.id)
    ?? null;

  // Restore runtime-only state that is not automatically serialized by JSON.
  const pendingFlexPoints = rawGame.pendingFlexPoints instanceof Map
    ? rawGame.pendingFlexPoints
    : Array.isArray(rawGame.pendingFlexPoints)
      ? new Map(rawGame.pendingFlexPoints)
      : new Map();
  (game as any).pendingFlexPoints = pendingFlexPoints;

  const pendingFlexPointRequests = rawGame.pendingFlexPointRequests instanceof Set
    ? rawGame.pendingFlexPointRequests
    : Array.isArray(rawGame.pendingFlexPointRequests)
      ? new Set(rawGame.pendingFlexPointRequests)
      : new Set();
  (game as any).pendingFlexPointRequests = pendingFlexPointRequests;

  const lastFlexPointRequestCounts = rawGame.lastFlexPointRequestCounts instanceof Map
    ? rawGame.lastFlexPointRequestCounts
    : Array.isArray(rawGame.lastFlexPointRequestCounts)
      ? new Map(rawGame.lastFlexPointRequestCounts)
      : new Map();
  (game as any).lastFlexPointRequestCounts = lastFlexPointRequestCounts;

  (game as any).listeners = new Map();

  return game;
}
