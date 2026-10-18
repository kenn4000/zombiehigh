import { expect } from 'chai';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

import { AllSpecialActions } from '../src/game/actions/SpecialActions';
import { MovementUtil } from '../src/game/actions/MovementUtilities';
import { HeroId } from '../src/game/misc/HeroId';
import { CardProcessor } from '../src/game/cards/CardProcessor';
import { LOCKER_DECK } from '../src/game/cards/CardIndex/LockerDeck';
import { createRuntimeGame } from '../src/server/gameFactory';
import { registerGameRuntime, server, unregisterGameRuntime } from '../src/server/server';

type StateMessage = { type: string; game: any };

type PlayerSocket = {
  socket: WebSocket;
  nextState: () => Promise<StateMessage>;
};

const openSockets = new Set<WebSocket>();
let baseUrl = '';
let websocketUrl = '';

const REMAINING_CARD_IDS = `
allergies ambushed attendance_sheet banned_book bathroom_trap blind_jump booby_traps
book_barriers book_return_slot bookmark broom_handle brown_bag_negotiation classic_fiction
confident_first_step copied_notes crowded_halls detention_slip dirty_work disgusting_mess
distraction dumpster_diving extra_movement visiting_faculty_id food_fight graffiti grave_robber
gym_class_hero athletic_footwear hearty_lunch homerun_bat hypnotism influencer iron_welding
pa_announcement lunch_tray mad_dash mailroom_cart mental_preparation missing_hallpass mr_clean
mystery_meat nice_removal one_vs_one panic_run passed_shop_class permission_slip practical_joke
principals_secret scrap_materials regret secret_notes science_kit shop_teachers_pet shut_that_door
snack_track split_up spoiled_milk stem_club taking_a_nap talent_show time_out toe_socks toolbelt
triple_jump under_the_table backstage_tunnel trap_blueprints lunchladys_helper wall_it_off
water_cooler well_worn_book zombie_flush
`.trim().split(/\s+/);

function connectPlayer(gameId: string, playerId: string): Promise<PlayerSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${websocketUrl}/game-ws?gameId=${gameId}&playerId=${playerId}`);
    const queuedStates: StateMessage[] = [];
    const stateWaiters: Array<(state: StateMessage) => void> = [];
    openSockets.add(socket);

    socket.on('message', (raw) => {
      const state = JSON.parse(raw.toString()) as StateMessage;
      const waiter = stateWaiters.shift();
      if (waiter) waiter(state);
      else queuedStates.push(state);
    });

    socket.once('error', reject);
    socket.once('open', () => {
      resolve({
        socket,
        nextState: () => queuedStates.length > 0
          ? Promise.resolve(queuedStates.shift()!)
          : new Promise((stateResolve) => stateWaiters.push(stateResolve)),
      });
    });
  });
}

async function closePlayer(client: PlayerSocket): Promise<void> {
  openSockets.delete(client.socket);
  if (client.socket.readyState === WebSocket.CLOSED) return;
  const closed = once(client.socket, 'close');
  client.socket.close();
  await closed;
}

function makeScenario(startTurn = true, playerCount = 2): {
  gameId: string;
  runtime: ReturnType<typeof createRuntimeGame>;
  player: ReturnType<typeof createRuntimeGame>['players'][number];
  opponent: ReturnType<typeof createRuntimeGame>['players'][number];
  start: any;
} {
  const runtime = createRuntimeGame({
    humanNames: Array.from({ length: playerCount }, (_, index) => `Playtest ${index + 1}`),
    cpuCount: 0,
  });
  const [player, opponent] = runtime.players;
  const board = runtime.game.board;
  const start = board.getAllCells().find((cell: any) =>
    !cell.isHole && cell.isEmpty && board.getNeighbors(cell).filter((neighbor: any) => neighbor.isEmpty).length >= 3
  );
  if (!start) throw new Error('Could not find a suitable multiplayer playtest start cell');

  start.setPlayer(player);
  const opponentCell = board.getAllCells().find((cell: any) =>
    cell.isEmpty && !cell.isHole && Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y) >= 5
  );
  if (!opponentCell) throw new Error('Could not find a distant opponent start cell');
  opponentCell.setPlayer(opponent);

  player.gold = 100;
  opponent.gold = 100;
  if (startTurn) runtime.gameManager.startPlayerTurn();

  const gameId = `playtest-${randomUUID()}`;
  registerGameRuntime(gameId, runtime.game, runtime.gameManager);
  return { gameId, runtime, player, opponent, start };
}

async function connectBothPlayers(gameId: string, playerId: string, opponentId: string): Promise<[PlayerSocket, PlayerSocket]> {
  const clients = await Promise.all([
    connectPlayer(gameId, playerId),
    connectPlayer(gameId, opponentId),
  ]);
  const initialStates = await Promise.all(clients.map((client) => client.nextState()));
  expect(initialStates.every((state) => state.type === 'gameState')).to.equal(true);
  return clients;
}

async function postAction(gameId: string, playerId: string, actionId: string, params: any = {}) {
  return fetch(`${baseUrl}/api/game/${gameId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, actionId, params }),
  });
}

function makeSweepScenario(playerCount = 2): ReturnType<typeof makeScenario> {
  const scenario = makeScenario(true, playerCount);
  const board = scenario.runtime.game.board;
  scenario.runtime.game.cardManager.initializeLockerDeck(LOCKER_DECK.map((locker) => ({
    id: locker.id,
    cardId: locker.id,
    name: locker.name,
    image: locker.image,
  })));
  const oldOpponentPosition = board.getPlayerPosition(scenario.opponent);
  oldOpponentPosition?.clear();
  const adjacentCell = board.getNeighbors(scenario.start).find((cell: any) => cell.isEmpty && !cell.isHole);
  if (adjacentCell) adjacentCell.setPlayer(scenario.opponent);

  scenario.player.gold = 1000;
  scenario.player.currCP = 1000;
  scenario.player.currNP = 1000;
  scenario.player.currSP = 1000;
  scenario.player.currGP = 1000;
  scenario.player.currHealth = 1;
  scenario.opponent.currHealth = 1;

  const openCells = board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole);
  for (const cell of openCells.slice(0, 3)) cell.setTrap(scenario.opponent);
  for (const cell of openCells.slice(3, 5)) cell.setBarricade(scenario.opponent);

  const playerPosition = board.getPlayerPosition(scenario.player);
  if (playerPosition) {
    const zombieCell = board.getNeighbors(playerPosition).find((cell: any) => cell.isEmpty && !cell.isHole);
    zombieCell?.setZombie(`playtest-zombie-${scenario.gameId}`, 1);
  }
  return scenario;
}

function serializeTarget(target: any, players: any[]): any {
  if (Array.isArray(target)) return target.map((entry) => serializeTarget(entry, players));
  if (target && players.includes(target)) return { playerId: target.id };
  if (target && typeof target === 'object' && 'origin' in target && 'destination' in target) {
    return {
      origin: serializeTarget(target.origin, players),
      destination: serializeTarget(target.destination, players),
    };
  }
  if (target && typeof target === 'object' && 'origin' in target && 'destination' in target) {
    return {
      origin: serializeTarget(target.origin, players),
      destination: serializeTarget(target.destination, players),
    };
  }
  if (target && typeof target === 'object' && 'cell' in target) {
    return { ...target, cell: serializeTarget(target.cell, players) };
  }
  if (target && typeof target === 'object' && 'x' in target && 'y' in target) {
    return { x: target.x, y: target.y };
  }
  return target;
}

function moveSweepPlayersToRoom(
  scenario: ReturnType<typeof makeScenario>,
  roomId: string,
  opponentSharesRoom: boolean,
): boolean {
  const board = scenario.runtime.game.board;
  board.getPlayerPosition(scenario.player)?.clear();
  board.getPlayerPosition(scenario.opponent)?.clear();

  const roomCells = board.getCellsInRoom(roomId).filter((cell: any) => cell.isEmpty && !cell.isHole);
  const playerCell = roomCells.find((cell: any) =>
    board.getNeighbors(cell).some((neighbor: any) => neighbor.isEmpty && !neighbor.isHole)
  );
  if (!playerCell) return false;
  playerCell.setPlayer(scenario.player);
  scenario.start = playerCell;

  const opponentCell = opponentSharesRoom
    ? board.getNeighbors(playerCell).find((cell: any) => cell.isEmpty && !cell.isHole)
      ?? roomCells.find((cell: any) => cell !== playerCell && cell.isEmpty && !cell.isHole)
    : board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && cell.roomId !== roomId);
  if (!opponentCell) return false;
  opponentCell.setPlayer(scenario.opponent);
  return true;
}

function placeOwnedStructures(
  scenario: ReturnType<typeof makeScenario>,
  type: 'barricade' | 'trap' | 'bait',
  count: number,
  roomId?: string,
): void {
  const board = scenario.runtime.game.board;
  const hasStructure = (cell: any) => type === 'barricade' ? cell.hasBarricade : type === 'trap' ? cell.hasTrap : cell.hasBait;
  const owned = board.getAllCells().filter((cell: any) =>
    hasStructure(cell) && cell.structureOwner === scenario.player && (!roomId || cell.roomId === roomId)
  );
  let remaining = Math.max(0, count - owned.length);
  const candidates = (roomId ? board.getCellsInRoom(roomId) : board.getAllCells()).filter((cell: any) =>
    !cell.hasPlayer && !cell.hasZombie && (!roomId || cell.roomId === roomId)
  );
  for (const cell of candidates) {
    if (remaining <= 0) break;
    if (type === 'barricade') cell.setBarricade(scenario.player);
    else if (type === 'trap') cell.setTrap(scenario.player);
    else cell.setBait(scenario.player);
    if (hasStructure(cell) && cell.structureOwner === scenario.player) remaining--;
  }
}

function prepareRemainingCardScenario(cardId: string, scenario: ReturnType<typeof makeScenario>): void {
  const game = scenario.runtime.game;
  game.ensureZombieManager();
  scenario.player.currGP = 2;
  scenario.opponent.currHealth = 3;

  if (cardId !== 'hypnotism') {
    placeOwnedStructures(scenario, 'barricade', 4);
    placeOwnedStructures(scenario, 'trap', 2);
    placeOwnedStructures(scenario, 'bait', 2);
    placeOwnedStructures(scenario, 'trap', 1, 'Restroom');
    placeOwnedStructures(scenario, 'trap', 1, "Janitor's Closet");
    placeOwnedStructures(scenario, 'trap', 1, 'Front Desk');
    placeOwnedStructures(scenario, 'barricade', 2, 'Library');
    placeOwnedStructures(scenario, 'bait', 1, 'Science Lab');
  }

  if (cardId === 'influencer') {
    const candidates = game.board.getAllCells().filter((cell: any) =>
      cell.isEmpty && !cell.isHole && !cell.hasBarricade && !cell.hasTrap && !cell.hasBait && !cell.hasPlayer && !cell.hasZombie
    );
    candidates.slice(0, 4).forEach((cell: any) => cell.setBarricade(scenario.opponent));
  }

  if (cardId === 'visiting_faculty_id') {
    scenario.player.hand.playedCards = Array.from({ length: 6 }, (_, index) => ({
      id: `previously-played-${index}`,
      cardId: `previously-played-${index}`,
    }));
  }
  if (cardId === 'grave_robber' && scenario.runtime.players[2]) {
    scenario.runtime.players[2].isEliminated = true;
  }
}

function prepareRemainingCardRoom(cardId: string, scenario: ReturnType<typeof makeScenario>): void {
  const board = scenario.runtime.game.board;
  const position = board.getPlayerPosition(scenario.player);
  if (!position) return;

  if (['distraction', 'homerun_bat', 'mental_preparation', 'missing_hallpass', 'panic_run',
    'hypnotism', 'nice_removal', 'time_out', 'zombie_flush'].includes(cardId)) {
    const adjacent = board.getNeighbors(position).find((cell: any) => !cell.hasPlayer);
    if (adjacent) {
      adjacent.clear();
      scenario.runtime.game.zombieManager.spawnZombieAtTarget(adjacent);
    }
  }

  if (['blind_jump', 'gym_class_hero'].includes(cardId)) {
    const directions = [{ dx: 0, dy: -2 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }];
    for (const direction of directions) {
      const middle = board.getCell(position.x + direction.dx / 2, position.y + direction.dy / 2);
      const destination = board.getCell(position.x + direction.dx, position.y + direction.dy);
      if (!middle || !destination || middle.hasPlayer || middle.hasZombie || destination.hasPlayer || destination.hasZombie) continue;
      middle.clear();
      middle.setBarricade(scenario.opponent);
      destination.clear();
      break;
    }
  }
}

async function sendAndObserve(
  scenario: ReturnType<typeof makeScenario>,
  clients: [PlayerSocket, PlayerSocket],
  actionId: string,
  params: any,
): Promise<{ response: Response; result: any }> {
  const playerUpdate = clients[0].nextState();
  const opponentUpdate = clients[1].nextState();
  const response = await postAction(scenario.gameId, scenario.player.id, actionId, params);
  const result = await response.json() as any;
  const [playerSnapshot, opponentSnapshot] = await Promise.all([playerUpdate, opponentUpdate]);
  expect(playerSnapshot.type).to.equal('gameState');
  expect(opponentSnapshot.type).to.equal('gameState');
  return { response, result };
}

function candidateActionTargets(option: any, scenario: ReturnType<typeof makeScenario>): any[] {
  const board = scenario.runtime.game.board;
  const cells = board.getAllCells();
  const zombies = cells.filter((cell: any) => cell.hasZombie);
  if (option.id === 'bungler_move_trap') {
    const origin = cells.find((cell: any) => cell.isEmpty && !cell.isHole && cell !== scenario.start);
    origin?.setTrap(scenario.opponent);
    const destinations = origin ? MovementUtil.getCellsWithinStepsFromCell(board, origin, 2, true) : [];
    const validDestinations = destinations.filter((cell: any) => cell.isEmpty && !cell.isHole && cell !== origin);
    return validDestinations.map((destination: any) => ({ origin, destination }));
  }
  if (option.id === 'track_move_opponent') {
    return [scenario.opponent].flatMap((opponent: any) => {
      const position = board.getPlayerPosition(opponent);
      const cell = position && board.getCell(position.x, position.y);
      return cell
        ? board.getNeighbors(cell)
          .filter((destination: any) => destination.isEmpty && !destination.isHole)
          .map((destination: any) => ({ origin: opponent, destination }))
        : [];
    });
  }
  switch (option.targetType) {
    case 'none': return [undefined];
    case 'player': return [scenario.opponent, scenario.player];
    case 'zombie': return zombies;
    case 'path': {
      const position = board.getPlayerPosition(scenario.player);
      const paths = position
        ? board.getNeighbors(position).map((cell: any) => [position, cell])
        : [];
      return [...paths, ...cells, undefined];
    }
    default:
      return [...cells, undefined];
  }
}

function prepareActionScenario(action: any, option: any, scenario: ReturnType<typeof makeScenario>): void {
  const game = scenario.runtime.game;
  const board = game.board;
  const position = board.getPlayerPosition(scenario.player);
  if (action.id.startsWith('hero_')) {
    scenario.player.heroId = action.id.slice('hero_'.length) as HeroId;
  }

  if (action.id === 'hero_lola_ladra' && option.id === 'lunch_lady_solo') {
    const currentPosition = board.getPlayerPosition(scenario.opponent);
    const otherRoom = board.getAllCells().find((cell: any) =>
      cell.isEmpty && !cell.isHole && cell.roomId !== position?.roomId
    );
    currentPosition?.clear();
    otherRoom?.setPlayer(scenario.opponent);
  }

  if (action.id === 'hero_mike_u_strong' && option.id === 'coach_gym_kill') {
    const gymCell = board.getAllCells().find((cell: any) =>
      cell.roomId === 'Gymnasium' && cell.isEmpty && !cell.isHole
      && board.getNeighbors(cell).some((neighbor: any) => neighbor.isEmpty && !neighbor.isHole)
    );
    if (gymCell) {
      position?.clear();
      gymCell.setPlayer(scenario.player);
      scenario.start = gymCell;
    }
  }

  if (action.id === 'hero_richard_kim' && option.id === 'principal_spawn') {
    (game as any).ensureZombieManager?.();
  }

  if (action.id === 'locker_pyramid_scheme') {
    scenario.player.addCard({ id: 'pyramid-scheme-discard', cardId: 'playtest_discard', name: 'Playtest discard' });
  }

  if (action.id === 'hero_barry_cade' || action.id === 'hero_elsa_von_trap'
    || action.id === 'hero_archy_tect' || action.id === 'hero_mike_u_strong') {
    const adjacentEmpty = position
      ? board.getNeighbors(position).filter((cell: any) => cell.isEmpty && !cell.isHole)
      : [];
    const localRoomCells = position
      ? board.getCellsInRoom(position.roomId).filter((cell: any) => cell.isEmpty && !cell.isHole)
      : [];

    if ((option.id === 'barry_destroy_own' || option.id === 'von_trap_explode') && localRoomCells[0]) {
      option.id === 'barry_destroy_own'
        ? localRoomCells[0].setBarricade(scenario.player)
        : localRoomCells[0].setTrap(scenario.player);
    }
    if (option.id === 'barry_destroy_opponent' || option.id === 'coach_kick_down' || option.id === 'nerd_replace_barricade') {
      (adjacentEmpty[0] ?? localRoomCells[0])?.setBarricade(scenario.opponent);
    }
    if (option.id === 'von_trap_move' && localRoomCells[0]) {
      localRoomCells[0].setTrap(scenario.player);
    }
    if (option.id === 'nerd_replace_barricade') {
      scenario.player.barricadeLimit = 5;
    }
  }

  if (action.id === 'hero_brock_slayton' || action.id === 'hero_al_b_tross'
    || action.id === 'locker_free_hugs' || (action.id === 'hero_mike_u_strong' && option.id === 'coach_gym_kill')) {
    const actorPosition = board.getPlayerPosition(scenario.player);
    const zombieCell = actorPosition
      ? board.getNeighbors(actorPosition).find((cell: any) => cell.isEmpty && !cell.isHole)
      : undefined;
    zombieCell?.setZombie(`action-${option.id}-${scenario.gameId}`, 1);
  }

  if (action.id === 'locker_shoes' || (action.id === 'game_confident_first_step' && option.id === 'confident_step_move')) {
    const opponentPosition = board.getPlayerPosition(scenario.opponent);
    const farCell = board.getAllCells().find((cell: any) =>
      cell.isEmpty && !cell.isHole && Math.abs(cell.x - scenario.start.x) + Math.abs(cell.y - scenario.start.y) >= 5
    );
    opponentPosition?.clear();
    farCell?.setPlayer(scenario.opponent);
    for (const neighbor of board.getNeighbors(scenario.start)) {
      if (!neighbor.hasPlayer) neighbor.clear();
    }
  }

  const actorPosition = board.getPlayerPosition(scenario.player);
  const adjacentTarget = actorPosition
    ? board.getNeighbors(actorPosition).find((cell: any) => !cell.hasPlayer)
    : undefined;
  if (adjacentTarget && ['barry_destroy_own', 'barry_destroy_opponent', 'von_trap_explode', 'von_trap_move',
    'bully_melee', 'bungler_super_melee', 'nerd_replace_barricade', 'coach_kick_down', 'coach_gym_kill', 'hugs_cp'].includes(option.id)) {
    adjacentTarget.clear();
    if (option.id === 'barry_destroy_own') adjacentTarget.setBarricade(scenario.player);
    else if (option.id === 'barry_destroy_opponent' || option.id === 'nerd_replace_barricade' || option.id === 'coach_kick_down') {
      adjacentTarget.setBarricade(scenario.opponent);
    } else if (option.id === 'von_trap_explode' || option.id === 'von_trap_move') {
      adjacentTarget.setTrap(scenario.player);
    } else {
      adjacentTarget.setZombie(`action-${option.id}-${scenario.gameId}`, 1);
    }
  }
}

function cardTargetCandidates(card: any, scenario: ReturnType<typeof makeScenario>): any[] {
  const game = scenario.runtime.game;
  const board = game.board;
  const allCells = board.getAllCells();
  if (card.targetType === 'none') return [undefined];

  let validTargets: any[] = [];
  try {
    validTargets = CardProcessor.getValidTargets(card, board, game, scenario.player);
  } catch {
    validTargets = [];
  }

  if (card.targetType === 'path') {
    return [
      ...validTargets.flatMap((target: any) => {
        const path = Array.isArray(target) ? target : target.path;
        if (Array.isArray(path) && path.length > 0) return [path, [path[path.length - 1]]];
        return [target.finalCell ?? target];
      }),
      ...allCells.filter((cell: any) => cell.isEmpty && !cell.isHole),
    ];
  }
  if (card.targetType === 'multiple') {
    if (validTargets.length > 0 && Array.isArray(validTargets[0])) return validTargets;
    const pool = validTargets.length > 0 ? validTargets : allCells.filter((cell: any) => cell.isEmpty && !cell.isHole);
    const selected = pool.slice(0, card.maxTargets ?? 2);
    return selected.length > 0 ? [selected] : [];
  }
  if (card.targetType === 'cell' || card.targetType === 'zombie') return [...validTargets, ...allCells];
  if (card.targetType === 'player') return [...validTargets, ...game.players];
  return validTargets;
}

describe('multiplayer action playtest', function () {
  this.timeout(120000);

  before(async () => {
    server.listen(0);
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    websocketUrl = `ws://127.0.0.1:${address.port}`;
  });

  after(async () => {
    for (const socket of openSockets) socket.close();
    await Promise.all(Array.from(openSockets, (socket) => once(socket, 'close').catch(() => undefined)));
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('moves through the HTTP action route and broadcasts the authoritative board to both players', async () => {
    const scenario = makeScenario();
    const target = scenario.runtime.game.board.getNeighbors(scenario.start)
      .find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const playerUpdate = clients[0].nextState();
      const opponentUpdate = clients[1].nextState();
      const response = await postAction(scenario.gameId, scenario.player.id, 'move', {
        target: { x: target.x, y: target.y },
      });
      const result = await response.json() as any;
      const [playerSnapshot, opponentSnapshot] = await Promise.all([playerUpdate, opponentUpdate]);

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(result.game.board.cells[target.y][target.x].structureOwnerId).to.equal(scenario.player.id);
      expect(playerSnapshot.game.board.cells[target.y][target.x].structureOwnerId).to.equal(scenario.player.id);
      expect(opponentSnapshot.game.board.cells[target.y][target.x].structureOwnerId).to.equal(scenario.player.id);
      expect(scenario.runtime.gameManager.getActionsRemaining()).to.equal(2);
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('executes a hero action using a coordinate target resolved by the server', async () => {
    const scenario = makeScenario();
    const action = (AllSpecialActions as any)[HeroId.MIKE_U_STRONG];
    scenario.player.actionManager.addAction(action);
    const target = scenario.runtime.game.board.getNeighbors(scenario.start)
      .find((cell: any) => cell.isEmpty && !cell.isHole)!;
    target.setBarricade(scenario.opponent);
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const update = clients[1].nextState();
      const response = await postAction(scenario.gameId, scenario.player.id, action.id, {
        optionIndex: 1,
        target: { x: target.x, y: target.y },
      });
      const result = await response.json() as any;
      const broadcast = await update;

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(result.game.board.cells[target.y][target.x].structureType).to.equal(null);
      expect(result.game.players[0].currCP).to.equal(scenario.player.currCP);
      expect(broadcast.game.board.cells[target.y][target.x].structureType).to.equal(null);
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('executes Shoes through the locker action route and charges the jump toll', async () => {
    const scenario = makeScenario();
    const board = scenario.runtime.game.board;
    let middle: any;
    let landing: any;
    let target: any;

    for (const candidateStart of board.getAllCells()) {
      if (!candidateStart.isEmpty || candidateStart.isHole) continue;
      for (const candidateMiddle of board.getNeighbors(candidateStart)) {
        if (!candidateMiddle.isEmpty || candidateMiddle.isHole) continue;
        const dx = candidateMiddle.x - candidateStart.x;
        const dy = candidateMiddle.y - candidateStart.y;
        const candidateLanding = board.getCell(candidateMiddle.x + dx, candidateMiddle.y + dy);
        const candidateTarget = board.getCell(candidateMiddle.x + dx * 2, candidateMiddle.y + dy * 2);
        if (!candidateLanding?.isEmpty || candidateLanding.isHole
          || !candidateTarget?.isEmpty || candidateTarget.isHole
          || !board.getNeighbors(candidateMiddle).includes(candidateLanding)
          || !board.getNeighbors(candidateLanding).includes(candidateTarget)) continue;
        if (candidateStart === scenario.opponent || candidateStart === scenario.start) continue;
        middle = candidateMiddle;
        landing = candidateLanding;
        target = candidateTarget;
        scenario.start = candidateStart;
        break;
      }
      if (target) break;
    }
    expect(target).to.exist;

    board.getPlayerPosition(scenario.player)?.clear();
    scenario.start.setPlayer(scenario.player);
    middle.setBarricade(scenario.opponent);
    scenario.player.gold = 3;
    scenario.player.actionManager.addAction((AllSpecialActions as any).locker_shoes);
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const update = clients[1].nextState();
      const response = await postAction(scenario.gameId, scenario.player.id, 'locker_shoes', {
        optionIndex: 0,
        target: { x: target.x, y: target.y },
      });
      const result = await response.json() as any;
      const broadcast = await update;

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(result.game.board.cells[target.y][target.x].structureOwnerId).to.equal(scenario.player.id);
      expect(scenario.player.gold).to.equal(0);
      expect(scenario.opponent.gold).to.equal(101);
      expect(broadcast.game.players[0].gold).to.equal(0);
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('plays a targeted game-deck card through the multiplayer route and resolves its target coordinates', async () => {
    const scenario = makeScenario();
    const board = scenario.runtime.game.board;
    const barricade = board.getNeighbors(scenario.start).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    barricade.setBarricade(scenario.opponent);
    scenario.player.currCP = 3;
    scenario.player.gold = 10;
    scenario.player.addCard({
      id: 'failed-project-playtest',
      cardId: 'failed_project',
      name: 'Failed Project',
      cost: 6,
      targetType: 'cell',
    });
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const update = clients[1].nextState();
      const response = await postAction(scenario.gameId, scenario.player.id, 'failed_project', {
        target: { x: barricade.x, y: barricade.y },
      });
      const result = await response.json() as any;
      const broadcast = await update;

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(result.game.board.cells[barricade.y][barricade.x].structureType).to.equal(null);
      expect(scenario.player.currCP).to.equal(5);
      expect(scenario.player.hand.playedCards.some((card: any) => card.cardId === 'failed_project')).to.equal(true);
      expect(broadcast.game.board.cells[barricade.y][barricade.x].structureType).to.equal(null);
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('completes escape through the multiplayer route and broadcasts the new position', async () => {
    const scenario = makeScenario();
    const board = scenario.runtime.game.board;
    const escapeTarget = board.getNeighbors(scenario.start).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    (scenario.runtime.game as any).handlePlayerAttacked(
      scenario.player.id,
      scenario.start.x,
      scenario.start.y,
      escapeTarget,
    );
    expect(scenario.runtime.game.hasActiveEscapeState(scenario.player.id)).to.equal(true);
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const update = clients[1].nextState();
      const response = await fetch(`${baseUrl}/api/game/${scenario.gameId}/escape/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: scenario.player.id, x: escapeTarget.x, y: escapeTarget.y }),
      });
      const result = await response.json() as any;
      const broadcast = await update;

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(scenario.runtime.game.hasActiveEscapeState()).to.equal(false);
      expect(board.getPlayerPosition(scenario.player)?.id).to.equal(escapeTarget.id);
      expect(result.game.board.cells[escapeTarget.y][escapeTarget.x].structureType).to.equal('player');
      expect(broadcast.game.board.cells[escapeTarget.y][escapeTarget.x].structureType).to.equal('player');
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('checks Clairvoyance prerequisites before moving the card out of the hand', async () => {
    const scenario = makeScenario();
    scenario.player.currSP = 25;
    scenario.player.gold = 20;
    scenario.player.addCard({
      id: 'clairvoyance-playtest',
      cardId: 'clairvoyance',
      name: 'Clairvoyance',
      cost: 6,
      targetType: 'none',
    });
    const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

    try {
      const { response, result } = await sendAndObserve(scenario, clients, 'clairvoyance', {});

      expect(response.status).to.equal(200);
      expect(result.success).to.equal(true);
      expect(scenario.player.hand.cards.some((card: any) => card.cardId === 'clairvoyance')).to.equal(false);
      expect(scenario.player.hand.playedCards.some((card: any) => card.cardId === 'clairvoyance')).to.equal(true);
      expect(scenario.player.hand.cards).to.have.length(4);
    } finally {
      await Promise.all(clients.map(closePlayer));
      unregisterGameRuntime(scenario.gameId);
    }
  });

  it('rejects an action submitted by the non-current multiplayer participant', async () => {
    const scenario = makeScenario();
    const phaseScenario = makeScenario(false);
    const target = scenario.runtime.game.board.getNeighbors(scenario.start)
      .find((cell: any) => cell.isEmpty && !cell.isHole)!;

    try {
      const response = await postAction(scenario.gameId, scenario.opponent.id, 'move', {
        target: { x: target.x, y: target.y },
      });
      const result = await response.json() as any;

      expect(response.status).to.equal(409);
      expect(result.success).to.equal(false);
      expect(scenario.runtime.game.board.getPlayerPosition(scenario.player)?.id).to.equal(scenario.start.id);

      const invalidTargetResponse = await postAction(scenario.gameId, scenario.player.id, 'move', {
        target: { x: -1, y: -1 },
      });
      const invalidTargetResult = await invalidTargetResponse.json() as any;
      expect(invalidTargetResponse.status).to.equal(409);
      expect(invalidTargetResult.success).to.equal(false);
      expect(scenario.runtime.game.board.getPlayerPosition(scenario.player)?.id).to.equal(scenario.start.id);

      const phaseTarget = phaseScenario.runtime.game.board.getNeighbors(phaseScenario.start)
        .find((cell: any) => cell.isEmpty && !cell.isHole)!;
      const phaseResponse = await postAction(phaseScenario.gameId, phaseScenario.player.id, 'move', {
        target: { x: phaseTarget.x, y: phaseTarget.y },
      });
      const phaseResult = await phaseResponse.json() as any;
      expect(phaseResponse.status).to.equal(409);
      expect(phaseResult.error).to.equal('The game is not in the player action phase');
      expect(phaseScenario.runtime.game.board.getPlayerPosition(phaseScenario.player)?.id).to.equal(phaseScenario.start.id);
    } finally {
      unregisterGameRuntime(scenario.gameId);
      unregisterGameRuntime(phaseScenario.gameId);
    }
  });

  it('sweeps every unique hero, locker, and game-deck action option through multiplayer HTTP', async () => {
    const actions = Array.from(new Map(
      Object.values(AllSpecialActions).map((action: any) => [action.id, action])
    ).values()) as any[];
    let exercised = 0;
    const gated: string[] = [];
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      for (const action of actions) {
        for (let optionIndex = 0; optionIndex < action.options.length; optionIndex++) {
          const scenario = makeSweepScenario();
          const option = action.options[optionIndex];
          prepareActionScenario(action, option, scenario);
          scenario.player.actionManager.addAction(action);
          const candidates = candidateActionTargets(option, scenario);
          let target: any = candidates[0];
          let eligible = false;
          for (const candidate of candidates) {
            try {
              if (option.canUse(scenario.player, scenario.runtime.game.board, candidate)) {
                target = candidate;
                eligible = true;
                break;
              }
            } catch {
              continue;
            }
          }

          const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);
          try {
            const { response, result } = await sendAndObserve(
              scenario,
              clients,
              action.id,
              { optionIndex, ...(target === undefined ? {} : { target: serializeTarget(target, scenario.runtime.game.players) }) },
            );
            if (eligible) {
              expect(response.status, `${action.id}[${optionIndex}]`).to.equal(200);
              expect(result.success, `${action.id}[${optionIndex}]`).to.equal(true);
              exercised++;
            } else {
              expect(response.status, `${action.id}[${optionIndex}]`).to.equal(409);
              expect(result.success, `${action.id}[${optionIndex}]`).to.equal(false);
              gated.push(`${action.id}:${option.id}`);
            }
          } finally {
            await Promise.all(clients.map(closePlayer));
            unregisterGameRuntime(scenario.gameId);
          }
        }
      }
    } finally {
      console.log = originalLog;
    }

    expect(actions.length).to.be.greaterThan(0);
    console.log(`Action registry sweep: ${exercised} options executed; ${gated.length} prerequisite-gated: ${gated.join(', ')}`);
  });

  it('exercises the remaining prerequisite-gated deck cards through multiplayer HTTP', async () => {
    const cards = REMAINING_CARD_IDS.map((cardId) => CardProcessor.get(cardId)).filter(Boolean) as any[];
    expect(cards.length).to.equal(REMAINING_CARD_IDS.length);
    expect(CardProcessor.getAll().length - cards.length, 'update the coverage manifest when the card registry changes').to.equal(103);
    const exercised: string[] = [];
    const gated: string[] = [];
    const originalLog = console.log;
    console.log = () => undefined;

    try {
      for (const card of cards) {
        const scenario = makeSweepScenario(card.id === 'grave_robber' ? 3 : 2);
        prepareRemainingCardScenario(card.id, scenario);
        scenario.player.addCard({
          id: `${card.id}-multiplayer-playtest`,
          cardId: card.id,
          name: card.name,
          cost: card.cost,
          targetType: card.targetType,
        });
        const clients = await connectBothPlayers(scenario.gameId, scenario.player.id, scenario.opponent.id);

        try {
          let played = false;
          const resourceProfiles = [
            [1000, 1000, 1000], [0, 0, 0], [20, 20, 20],
            [0, 1000, 1000], [1000, 0, 1000], [1000, 1000, 0],
            [20, 1000, 1000], [1000, 20, 1000], [1000, 1000, 20],
          ];
          const profiles = resourceProfiles.flatMap(([sp, np, cp]) => [1, 3, 5].flatMap((health) => [1, 2, 4, 6].map((handSize) => ({
            sp, np, cp, health, handSize,
          }))));

          let sawPlayablePrerequisite = false;
          let sawTargets = false;
          let sawValidTarget = false;
          const roomIds = Array.from(new Set(
            scenario.runtime.game.board.getAllCells().map((cell: any) => cell.roomId).filter(Boolean)
          )) as string[];

          cardSearch:
          for (const roomId of roomIds) {
            for (const opponentSharesRoom of [true, false]) {
              if (!moveSweepPlayersToRoom(scenario, roomId, opponentSharesRoom)) continue;
              prepareRemainingCardRoom(card.id, scenario);
              for (const profile of profiles) {
                scenario.player.currSP = profile.sp;
                scenario.player.currNP = profile.np;
                scenario.player.currCP = profile.cp;
                scenario.player.currHealth = profile.health;
                scenario.player.gold = 1000;
                const testCard = scenario.player.hand.cards.find((handCard: any) => handCard.cardId === card.id);
                scenario.player.hand.cards = [
                  testCard,
                  ...Array.from({ length: profile.handSize - 1 }, (_, index) => ({
                    id: `${card.id}-fixture-${index}`,
                    cardId: 'playtest_fixture_card',
                    name: 'Playtest fixture card',
                  })),
                ];

                let basePlayable = false;
                try {
                  basePlayable = card.canPlay(scenario.player, scenario.runtime.game.board);
                } catch {
                  basePlayable = false;
                }
                if (!basePlayable) continue;
                sawPlayablePrerequisite = true;

                const targets = cardTargetCandidates(card, scenario);
                if (targets.length > 0) sawTargets = true;
                let eligibleTarget: any;
                let eligible = false;
                for (const target of targets) {
                  try {
                    if (card.isValidTarget(scenario.player, scenario.runtime.game.board, target)
                      && card.canPlay(scenario.player, scenario.runtime.game.board, target)) {
                      eligibleTarget = target;
                      eligible = true;
                      break;
                    }
                  } catch {
                    continue;
                  }
                }
                if (!eligible) continue;
                sawValidTarget = true;

                const { response, result } = await sendAndObserve(
                  scenario,
                  clients,
                  card.id,
                  { target: serializeTarget(eligibleTarget, scenario.runtime.game.players) },
                );
                expect(response.status, card.id).to.equal(200);
                expect(result.success, card.id).to.equal(true);
                exercised.push(card.id);
                played = true;
                break cardSearch;
              }
            }
          }

          if (!played) {
            const fallbackTarget = cardTargetCandidates(card, scenario)[0];
            const { response, result } = await sendAndObserve(
              scenario,
              clients,
              card.id,
              fallbackTarget === undefined ? {} : { target: serializeTarget(fallbackTarget, scenario.runtime.game.players) },
            );
            if (response.status === 200 && result.success
              && scenario.player.hand.playedCards.some((playedCard: any) => playedCard.cardId === card.id)) {
              exercised.push(card.id);
            } else if (response.status === 200 && result.success && scenario.runtime.game.targetingCardId) {
              gated.push(`${card.id}(awaiting target)`);
            } else {
              expect(response.status, `${card.id}; targeting=${scenario.runtime.game.targetingCardId}; played=${scenario.player.hand.playedCards.length}`).to.equal(409);
              expect(result.success, card.id).to.equal(false);
              const reason = !sawPlayablePrerequisite
                ? 'prerequisite'
                : !sawTargets || !sawValidTarget ? 'target' : 'server-rejected';
              gated.push(`${card.id}[${reason}]`);
            }
          }
        } finally {
          await Promise.all(clients.map(closePlayer));
          unregisterGameRuntime(scenario.gameId);
        }
      }
    } finally {
      console.log = originalLog;
    }

    expect(exercised.length, `unplayed remaining cards: ${gated.join(', ')}`).to.equal(cards.length);
    console.log(`Game-deck sweep: ${exercised.length}/${cards.length} unresolved cards played; 103 known successes skipped.`);
  });
});