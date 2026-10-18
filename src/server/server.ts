// src/server/server.ts

import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Game, Player, Board, BoardCell } from '../game/index';
import { GameManager } from '../game/core/GameManager';
import { CardDrawer } from '../game/cards/CardDrawer';
import { applyLockerCard, getLockerData } from '../game/cards/CardIndex/LockerDeck';
import { v4 as uuidv4 } from 'uuid';
import { createRuntimeGame } from './gameFactory';

export const app = express();
export const server = createServer(app);
export const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  let url: URL;
  try {
    url = new URL(request.url ?? '', 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }

  if (
    url.pathname === '/game-ws' &&
    url.searchParams.has('gameId') &&
    url.searchParams.has('playerId')
  ) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.on('error', (error) => {
        console.warn('[WebSocket] Connection error:', error.message);
      });
      wss.emit('connection', ws, request);
    });
    return;
  }

  socket.destroy();
});

// ===== STORAGE =====
const games = new Map<string, Game>();
const gameManagers = new Map<string, GameManager>();
const gamePlayers = new Map<string, Map<string, WebSocket>>(); // gameId -> { playerId: ws }

export function registerGameRuntime(gameId: string, game: Game, gameManager: GameManager): void {
  games.set(gameId, game);
  gameManagers.set(gameId, gameManager);
  gamePlayers.set(gameId, new Map());
  game.on('phaseChanged', () => broadcastGameState(gameId, game));
  game.on('stateChanged', () => broadcastGameState(gameId, game));
}

export function unregisterGameRuntime(gameId: string): void {
  for (const socket of gamePlayers.get(gameId)?.values() ?? []) {
    socket.close();
  }
  gamePlayers.delete(gameId);
  gameManagers.delete(gameId);
  games.delete(gameId);
}

// ===== MIDDLEWARE =====
const projectRoot = process.cwd();
const publicDir = path.resolve(projectRoot, 'public');

app.use(express.json());
app.use('/card-art', express.static(path.join(publicDir, 'card-art')));
app.use(express.static(publicDir));

// ===== API ROUTES =====

// Get all games
app.get('/api/games', (req, res) => {
  const gameList = Array.from(games.entries()).map(([id, game]) => ({
    id,
    phase: game.phase || 'setup',
    playerCount: game.players.length,
    generation: game.generationCount || 0,
  }));
  res.json(gameList);
});

// Create a new game
app.post('/api/game', (req, res) => {
  try {
    const { players: playerData, settings } = req.body;
    const runtime = createRuntimeGame({
      humanNames: playerData.filter((p: any) => !p.isBot).map((p: any) => p.name),
      cpuCount: playerData.filter((p: any) => p.isBot).length,
      difficultyLevels: playerData.filter((p: any) => p.isBot).map((p: any) => p.difficultyLevel || 'normal'),
      settings: {
        firstCardFreeNightDraft: !!settings?.firstCardFreeNightDraft,
        reshuffleDeck: settings?.reshuffleDeck ?? true,
      }
    });

    const { game, gameManager, players } = runtime;
    const gameId = uuidv4();

    for (const player of players) {
      const payload = playerData.find((p: any) => p.name === player.name && !p.isBot === !player.id.startsWith('cpu-'));
      if (payload && payload.color) {
        (player as any).color = payload.color;
      }
    }

    registerGameRuntime(gameId, game, gameManager);

    const playerUrls = players.map((player: Player) => ({
      name: player.name,
      playerId: player.id,
      url: `/game/${gameId}?playerId=${player.id}&fresh=1`
    }));

    const spectatorUrl = `/spectator/${gameId}`;

    res.json({
      gameId,
      playerUrls,
      spectatorUrl
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Get game state
app.get('/api/game/:gameId/state', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  // Send the game instance (it will be serialized)
  res.json({ game });
});

// Get current game (for App.vue)
app.get('/api/game/current', (req, res) => {
  const gameId = req.query.gameId as string;
  if (!gameId) {
    return res.status(400).json({ error: 'No game ID provided' });
  }
  
  const game = games.get(gameId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json({ game });
});

app.post('/api/game/:gameId/setup/lock-in', (req, res) => {
  const { gameId } = req.params;
  const { playerId, heroId, lockerId, startingCardIds } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  const player = game?.getPlayerById(playerId);

  if (!game || !gameManager || !player) {
    return res.status(404).json({ error: 'Game or player not found' });
  }

  const lockedIn = gameManager.lockInSetup(playerId, {
    heroId,
    lockerId,
    startingCardIds: Array.isArray(startingCardIds) ? startingCardIds : [],
  });

  if (!lockedIn) {
    return res.status(409).json({ error: 'Setup selection is invalid or already locked in' });
  }

  broadcastGameState(gameId, game);
  return res.json({ lockedIn: player.setupLockedIn, phase: game.phase, game });
});

app.post('/api/game/:gameId/placement/place-hero', (req, res) => {
  const { gameId } = req.params;
  const { playerId, x, y } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);

  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'placement') {
    return res.status(409).json({ error: 'The game is not in the placement phase', game });
  }
  if (!gameManager.placeHero(playerId, Number(x), Number(y))) {
    return res.status(409).json({ error: "Hero placement is invalid or it is not this player's turn", game });
  }

  broadcastGameState(gameId, game);
  return res.json({ phase: game.phase, game });
});

app.post('/api/game/:gameId/placement/resolve-start-action', (req, res) => {
  const { gameId } = req.params;
  const { playerId, x, y } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);

  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'placement') {
    return res.status(409).json({ error: 'The game is not in the placement phase' });
  }
  if (!gameManager.resolveStartAction(playerId, { x: Number(x), y: Number(y) })) {
    return res.status(409).json({ error: "Starting action target is invalid or it is not this player's action", game });
  }

  broadcastGameState(gameId, game);
  return res.json({ phase: game.phase, game });
});

function resolveActionTarget(game: Game, target: any): any {
  if (Array.isArray(target)) return target.map((entry) => resolveActionTarget(game, entry));
  if (!target || typeof target !== 'object') return target;

  if ('origin' in target || 'destination' in target) {
    return {
      ...(target.origin ? { origin: resolveActionTarget(game, target.origin) } : {}),
      ...(target.destination ? { destination: resolveActionTarget(game, target.destination) } : {}),
    };
  }
  if ('cell' in target) {
    return { ...target, cell: resolveActionTarget(game, target.cell) };
  }
  if (target.playerId) return game.getPlayerById(String(target.playerId)) ?? target;
  if ('x' in target && 'y' in target) {
    return game.board.getCell(Number(target.x), Number(target.y)) ?? target;
  }
  return target;
}

app.post('/api/game/:gameId/action', (req, res) => {
  const { gameId } = req.params;
  const { playerId, actionId, params = {} } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'player_turn' || game.phase !== 'player_turn') {
    return res.status(409).json({ error: 'The game is not in the player action phase', game });
  }

  const actionParams = { ...params, target: resolveActionTarget(game, params.target) };
  const success = gameManager.performAction(playerId, String(actionId), actionParams);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Action was rejected; the game state has been refreshed.',
    game,
  });
});

app.post('/api/game/:gameId/escape/complete', (req, res) => {
  const { gameId } = req.params;
  const { playerId, x, y } = req.body ?? {};
  const game = games.get(gameId);
  if (!game || !game.players.some(player => player.id === playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }

  const targetCell = game.board.getCell(Number(x), Number(y));
  const success = !!targetCell && game.completeEscape(String(playerId), targetCell);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Escape target was rejected; the game state has been refreshed.',
    game,
  });
});

app.post('/api/game/:gameId/pass-turn', (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'player_turn' || game.phase !== 'player_turn') {
    return res.status(409).json({ error: 'The game is not in the player action phase', game });
  }

  const success = gameManager.passTurn(playerId);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Turn pass was rejected; the game state has been refreshed.',
    game,
  });
});

app.post('/api/game/:gameId/defer-turn', (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'player_turn' || game.phase !== 'player_turn') {
    return res.status(409).json({ error: 'The game is not in the player action phase', game });
  }

  const success = gameManager.deferTurn(playerId);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Turn defer was rejected; the game state has been refreshed.',
    game,
  });
});

app.post('/api/game/:gameId/draft/begin', (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'zombie_phase' || game.phase !== 'zombie_phase') {
    return res.status(409).json({ error: 'The nightly draft is not ready to begin', game });
  }

  gameManager.beginNightlyDraft();
  broadcastGameState(gameId, game);
  return res.json({ success: true, game });
});

app.post('/api/game/:gameId/draft/purchase', (req, res) => {
  const { gameId } = req.params;
  const { playerId, cardIds } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  const player = game?.getPlayerById(playerId);
  if (!game || !gameManager || !player) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'draft' || !Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(409).json({ error: 'Draft purchase is not valid in the current state', game });
  }

  const selectedCards = cardIds.map((cardId: string) =>
    player.draftCards.find((card: any) => card.id === cardId)
  );
  if (selectedCards.some((card: any) => !card)) {
    return res.status(409).json({ error: 'One or more selected cards are no longer available', game });
  }

  const success = gameManager.purchaseDraftCard(playerId, selectedCards);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Draft purchase was rejected.',
    game,
  });
});

app.post('/api/game/:gameId/draft/skip', (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (gameManager.getPhase() !== 'draft') {
    return res.status(409).json({ error: 'The game is not in the draft phase', game });
  }

  gameManager.skipDraft(playerId);
  broadcastGameState(gameId, game);
  return res.json({ success: true, game });
});

app.post('/api/game/:gameId/flex-point/choose', (req, res) => {
  const { gameId } = req.params;
  const { playerId, choice } = req.body ?? {};
  const game = games.get(gameId);
  const gameManager = gameManagers.get(gameId);
  if (!game || !gameManager || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (choice !== 'NP' && choice !== 'CP') {
    return res.status(400).json({ error: 'Flex-point choice must be NP or CP', game });
  }

  const success = gameManager.selectFlexPointChoice(playerId, choice);
  broadcastGameState(gameId, game);
  return res.status(success ? 200 : 409).json({
    success,
    error: success ? undefined : 'Flex-point choice was rejected.',
    game,
  });
});

app.post('/api/game/:gameId/selection/complete', (req, res) => {
  const { gameId } = req.params;
  const { playerId, selectionId, selectedCardIds } = req.body ?? {};
  const game = games.get(gameId);
  const pending = game?.pendingCardSelection;
  const selectedIds = Array.isArray(selectedCardIds) ? selectedCardIds.map(String) : [];

  if (!game || !game.getPlayerById(playerId)) {
    return res.status(404).json({ error: 'Game or player not found' });
  }
  if (!pending || pending.playerId !== playerId || pending.selectionId !== Number(selectionId)) {
    return res.status(409).json({ error: 'There is no matching card selection to complete', game });
  }

  const allowedIds = new Set(pending.cards.map((card: any) => String(card.id)));
  const requiredCount = pending.type === 'keep' ? (pending.keepCount ?? pending.count) : pending.count;
  if (
    selectedIds.length !== requiredCount ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id: string) => !allowedIds.has(id))
  ) {
    return res.status(400).json({ error: 'Selected cards do not match the pending choice', game });
  }

  const player = game.getPlayerById(playerId)!;
  let result;
  if (pending.onComplete === 'secretaryDrawGiveComplete') {
    if (!pending.recipientPlayerId) {
      return res.status(409).json({ error: 'The Secretary card recipient is missing', game });
    }
    game.completeSecretaryDrawGive(player, selectedIds[0], pending.recipientPlayerId);
    result = { success: true, message: 'Kept 1 card and gave 2 to the lowest-SP player' };
  } else if (pending.onComplete === 'lockerCardSelectionComplete') {
    const selectedCard = pending.cards.find((card: any) => String(card.id) === selectedIds[0]);
    const lockerData = selectedCard && getLockerData(String(selectedCard.cardId ?? selectedCard.id));
    if (!selectedCard || !lockerData) {
      return res.status(409).json({ error: 'The selected locker card is no longer available', game });
    }
    applyLockerCard(lockerData.id, player, game.players, game.board);
    for (const card of pending.cards) {
      if (String(card.id) !== selectedIds[0]) game.cardManager.discardLockerCard(card);
    }
    game.pendingCardSelection = null;
    result = { success: true, message: `Selected ${lockerData.name} from Open Locker` };
  } else {
    result = pending.type === 'keep'
      ? CardDrawer.completeDrawKeep(player, selectedIds)
      : CardDrawer.completeDiscardDraw(player, selectedIds[0], pending.drawCount);
  }

  if (!result.success) {
    return res.status(409).json({ error: result.message, game });
  }

  game.emit('log', result.message);
  game.emit('stateChanged');
  broadcastGameState(gameId, game);
  return res.json({ success: true, game });
});

// ===== WEBSOCKET =====
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const gameId = url.searchParams.get('gameId');
  const playerId = url.searchParams.get('playerId');
  
  if (!gameId || !playerId) {
    ws.close();
    return;
  }
  
  const game = games.get(gameId);
  if (!game || !game.getPlayerById(playerId)) {
    ws.close();
    return;
  }
  
  // Store connection
  const playerMap = gamePlayers.get(gameId);
  if (playerMap) {
    playerMap.set(playerId, ws);
  }
  
  // Send initial game state
  ws.send(JSON.stringify({
    type: 'gameState',
    game: game
  }));
  
  // Handle messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleGameMessage(gameId, playerId, data, ws);
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    const playerMap = gamePlayers.get(gameId);
    if (playerMap) {
      playerMap.delete(playerId);
    }
  });
});

function handleGameMessage(gameId: string, playerId: string, data: any, ws: WebSocket): void {
  const game = games.get(gameId);
  if (!game) return;
  
  switch (data.type) {
    case 'action':
      // Handle game actions
      // game.executeAction(playerId, data.action, data.params);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

function broadcastGameState(gameId: string, game: Game): void {
  const playerMap = gamePlayers.get(gameId);
  if (!playerMap) return;

  const message = JSON.stringify({ type: 'gameState', game });
  for (const socket of playerMap.values()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

// ===== BOARD CREATION =====
function createDefaultBoard(): Board {
  // This is a placeholder - you need proper board creation
  // For now, create a simple 10x11 board
  const rows = 10;
  const cols = 11;
  const cells: BoardCell[][] = [];
  
  for (let y = 0; y < rows; y++) {
    cells[y] = [];
    for (let x = 0; x < cols; x++) {
      // Create a cell
      const cell = new BoardCell(
        `${x},${y}`,
        x,
        y,
        getRoomId(x, y), // Room ID based on position
        '', // spawnId
        false // isHole
      );
      cells[y][x] = cell;
    }
  }
  
  // Create walls (all open for now)
  const vWalls: any[][] = [];
  const hWalls: any[][] = [];
  
  for (let y = 0; y < rows; y++) {
    vWalls[y] = [];
    for (let x = 0; x < cols - 1; x++) {
      vWalls[y][x] = { isNatural: false, barricadeOwner: null };
    }
  }
  
  for (let y = 0; y < rows - 1; y++) {
    hWalls[y] = [];
    for (let x = 0; x < cols; x++) {
      hWalls[y][x] = { isNatural: false, barricadeOwner: null };
    }
  }
  
  return new Board(cells, vWalls, hWalls);
}

function getRoomId(x: number, y: number): string {
  const key = `${x},${y}`;
  const holeSet = new Set([
    '0,0', '1,0', '10,0',
    '4,1', '5,1', '6,1',
    '4,2', '5,2', '6,2',
    '8,2', '9,2',
    '1,3', '2,3', '5,3', '8,3',
    '2,4', '7,4', '8,4',
    '3,6', '9,6',
    '2,7', '3,7', '6,7', '9,7',
    '0,9', '3,9', '10,9'
  ]);

  if ((x === 10 && y === 2) || (x === 10 && y === 6) || (x === 10 && y === 7) || (x === 0 && y === 3) || (x === 4 && y === 0) || (x === 5 && y === 0) || (x === 6 && y === 0)) return 'hallway';
  if (holeSet.has(key)) return 'hole';
  if ((x === 2 && y === 0) || (x === 3 && y === 0) || (x === 0 && y === 1) || (x === 1 && y === 1) || (x === 2 && y === 1) || (x === 3 && y === 1) || (x === 0 && y === 2) || (x === 1 && y === 2) || (x === 2 && y === 2) || (x === 3 && y === 2)) return 'science-lab';
  if ((x === 7 && y === 0) || (x === 8 && y === 0) || (x === 9 && y === 0) || (x === 7 && y === 1) || (x === 8 && y === 1) || (x === 9 && y === 1) || (x === 10 && y === 1)) return 'cafeteria';
  if ((x === 9 && y === 3) || (x === 10 && y === 3) || (x === 9 && y === 4) || (x === 10 && y === 4) || (x === 9 && y === 5) || (x === 10 && y === 5)) return 'auditorium';
  if ((x === 7 && y === 8) || (x === 7 && y === 9) || (x === 8 && y === 8) || (x === 8 && y === 9) || (x === 9 && y === 8) || (x === 9 && y === 9) || (x === 10 && y === 8)) return 'library';
  if ((x === 4 && y === 8) || (x === 4 && y === 9) || (x === 5 && y === 8) || (x === 5 && y === 9) || (x === 6 && y === 9) || (x === 6 && y === 8)) return 'Front Desk';
  if ((x === 0 && y === 8) || (x === 1 && y === 8) || (x === 1 && y === 9) || (x === 2 && y === 8) || (x === 2 && y === 9) || (x === 3 && y === 8)) return 'principal-office';
  if ((x === 0 && y === 6) || (x === 0 && y === 7) || (x === 1 && y === 6) || (x === 1 && y === 7)) return 'janitors-closet';
  if ((x === 0 && y === 4) || (x === 0 && y === 5) || (x === 1 && y === 4) || (x === 1 && y === 5)) return 'restroom';
  if ((x === 10 && y === 2) || (x === 10 && y === 6) || (x === 10 && y === 7) || (x === 0 && y === 3) || (x === 4 && y === 0) || (x === 5 && y === 0) || (x === 6 && y === 0)) return 'hallway';
  return 'gymnasium';
}

// ===== START SERVER =====
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}