import { expect } from 'chai';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createRuntimeGame } from '../src/server/gameFactory';
import { resolveApiBaseUrl } from '../src/server/api';
import { hydrateGame } from '../src/game/hydrateGame';
import { shouldBootGameRoute } from '../src/client/routeBoot';
import { HeroId } from '../src/game/misc/HeroId';
import { resolveBoardCellTarget, resolvePlayerTargetSelection, resolveTargetSelection } from '../src/game/board/cellTargetResolver';
import { CardDrawer } from '../src/game/cards/CardDrawer';
import { CardProcessor } from '../src/game/cards/CardProcessor';
import { Game } from '../src/game/core/Game';
import { GameManager } from '../src/game/core/GameManager';
import { Player } from '../src/game/core/Player';
import { Board } from '../src/game/board/Board';
import { BoardCell } from '../src/game/board/BoardCell';
import { MovementUtil } from '../src/game/actions/MovementUtilities';
import { ActionHandlers } from '../src/game/actions/ActionHandler';
import { StructurePlacement } from '../src/game/actions/StructurePlacement';
import { resolveAssetPath } from '../src/client/assetPaths';
import { AllSpecialActions } from '../src/game/actions/SpecialActions';

describe('createRuntimeGame', () => {
  it('builds a real sim-style game with 1 human and CPU opponents', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 3,
      difficultyLevels: ['normal', 'normal', 'hard'],
      settings: { firstCardFreeNightDraft: false },
    });

    expect(runtime.game.players.length).to.equal(4);
    expect(runtime.game.board).to.exist;
    expect(runtime.players[0].name).to.equal('Player 1');
    expect(runtime.players[1].name).to.equal('CPU 1');
    expect(runtime.players[3].name).to.equal('CPU 3');
    expect(['hero_selection', 'locker_selection', 'card_purchase', 'placement']).to.include(runtime.gameManager.getPhase());
    expect(['hero_selection', 'locker_selection', 'card_purchase', 'placement']).to.include(runtime.game.phase);
    expect(runtime.players.every(p => p.availableHeroes.length > 0)).to.equal(true);
  });

  it('builds a singleton game deck and stops drawing once the deck is exhausted when reshuffle is off', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
      settings: { reshuffleDeck: false },
    });

    const deckCards = runtime.game.cardManager.getGameCards();

    expect(deckCards.length).to.be.greaterThan(0);
    expect(new Set(deckCards.map((card: any) => card.cardId)).size).to.equal(deckCards.length);

    runtime.game.cardManager.setReshuffleOnEmpty(false);
    let drawn = 0;
    while (runtime.game.cardManager.drawGameCard() !== null) {
      drawn += 1;
    }

    expect(drawn).to.equal(deckCards.length);
    expect(runtime.game.cardManager.drawGameCard()).to.equal(null);
  });

  it('marks CPR Class as unplayable when no opponent is in the same room', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const cprClass = CardProcessor.get('cpr_class');

    expect(cprClass).to.exist;
    expect(cprClass!.canPlay(player, runtime.game.board)).to.equal(false);
  });

  it('registers locker actions under their actual action ids so Shoes and similar actions are playable', () => {
    const shoesAction = (AllSpecialActions as any)['locker_shoes'];
    const coolForSaleAction = (AllSpecialActions as any)['locker_cool_for_sale'];

    expect(shoesAction).to.exist;
    expect(shoesAction.id).to.equal('locker_shoes');
    expect(coolForSaleAction).to.exist;
    expect(coolForSaleAction.id).to.equal('locker_cool_for_sale');
  });

  it('allows Shoes to leap over a barricade as one of its two movement steps', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    start.setPlayer(player);
    player.gold = 2;

    let middle: any;
    let landing: any;
    let finalTarget: any;
    for (const neighbor of board.getNeighbors(start)) {
      if (!neighbor.isEmpty || neighbor.isHole) continue;
      const dx = neighbor.x - start.x;
      const dy = neighbor.y - start.y;
      const candidate = board.getNeighbors(neighbor).find((cell: any) =>
        cell.x === neighbor.x + dx && cell.y === neighbor.y + dy && cell.isEmpty && !cell.isHole
      );
      if (candidate) {
        const nextStep = board.getCell(candidate.x + dx, candidate.y + dy);
        if (nextStep?.isEmpty && !nextStep.isHole && board.getNeighbors(candidate).includes(nextStep)) {
          middle = neighbor;
          landing = candidate;
          finalTarget = nextStep;
          break;
        }
      }
    }
    expect(middle).to.exist;
    expect(landing).to.exist;
    expect(finalTarget).to.exist;
    middle.setBarricade(player);

    const shoes = (AllSpecialActions as any).locker_shoes.options[0];
    expect(shoes.canUse(player, board)).to.equal(true);
    expect(shoes.canUse(player, board, finalTarget)).to.equal(false);
    expect(shoes.execute(player, board, finalTarget).success).to.equal(false);
    expect(board.getPlayerPosition(player)?.id).to.equal(start.id);
    player.gold = 3;
    expect(shoes.canUse(player, board)).to.equal(true);
    expect(shoes.canUse(player, board, finalTarget)).to.equal(true);
    const result = shoes.execute(player, board, finalTarget);
    expect(result.success).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(finalTarget.id);
    expect(player.gold).to.equal(1);
  });

  it('awards a pending flex point when a zombie consumes Janitor bait', () => {
    const runtime = createRuntimeGame({ humanNames: ['Janitor'], cpuCount: 0 });
    const player = runtime.players[0];
    const manager: any = runtime.game.ensureZombieManager();

    manager.deps.onBaitConsumed(player.id, 2, 2);

    expect(runtime.game.getPendingFlexPointSelections()).to.deep.include({
      playerId: player.id,
      count: 1,
      options: ['NP', 'CP'],
    });
    expect(player.currNP).to.equal(0);
    expect(player.currCP).to.equal(0);
    expect(runtime.game.selectFlexPointChoice(player.id, 'CP')).to.equal(true);
    expect(player.currCP).to.equal(1);
  });

  it('does not apply Toe Socks movement discount when entering Gymnasium', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getAllCells().find((cell: any) =>
      cell.isEmpty && !cell.isHole && cell.roomId !== 'Gymnasium' &&
      board.getNeighbors(cell).some((neighbor: any) => neighbor.roomId === 'Gymnasium' && neighbor.isEmpty && !neighbor.isHole) &&
      board.getNeighbors(cell).some((neighbor: any) => neighbor.roomId !== 'Gymnasium' && neighbor.isEmpty && !neighbor.isHole)
    )!;
    const gymTarget = board.getNeighbors(start).find((cell: any) => cell.roomId === 'Gymnasium' && cell.isEmpty && !cell.isHole)!;
    const outsideTarget = board.getNeighbors(start).find((cell: any) => cell.roomId !== 'Gymnasium' && cell.isEmpty && !cell.isHole)!;
    start.setPlayer(player);
    player.nongymMovementDiscount = true;

    expect(player.getMovementCost(board, outsideTarget)).to.equal(2);
    expect(player.getMovementCost(board, gymTarget)).to.equal(3);
    player.gold = 2;
    const blockedByCost = require('../src/game/actions/ActionHandler').ActionHandlers.move(player, board, gymTarget, true);
    expect(blockedByCost.success).to.equal(false);
    expect(board.getPlayerPosition(player)?.id).to.equal(start.id);
  });

  it('discounts Shoes tolls and refunds Influencer gold after jumping a trap', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, trapOwner] = runtime.players;
    const board = runtime.game.board;
    let start: any;
    let trap: any;
    let target: any;

    outer: for (const cell of board.getAllCells().filter((candidate: any) => candidate.isEmpty && !candidate.isHole)) {
      for (const neighbor of board.getNeighbors(cell)) {
        if (!neighbor.isEmpty || neighbor.isHole) continue;
        const dx = neighbor.x - cell.x;
        const dy = neighbor.y - cell.y;
        const landing = board.getCell(neighbor.x + dx, neighbor.y + dy);
        const nextStep = landing && board.getNeighbors(landing).find((candidate: any) =>
          candidate.x === landing.x + dx && candidate.y === landing.y + dy && candidate.isEmpty && !candidate.isHole
        );
        if (!landing?.isEmpty || landing.isHole || !nextStep) continue;
        start = cell;
        trap = neighbor;
        target = nextStep;
        break outer;
      }
    }

    expect(start).to.exist;
    expect(trap).to.exist;
    expect(target).to.exist;
    start.setPlayer(player);
    trap.setTrap(trapOwner);
    player.gold = 1;
    player.barricadeCrossDiscount = 1;
    player.barricadeCrossRefund = true;
    trapOwner.gold = 0;

    const shoes = (AllSpecialActions as any).locker_shoes.options[0];
    expect(shoes.canUse(player, board, target)).to.equal(false);
    player.gold = 2;
    expect(shoes.canUse(player, board, target)).to.equal(true);
    expect(shoes.execute(player, board, target).success).to.equal(true);
    expect(player.gold).to.equal(2);
    expect(trapOwner.gold).to.equal(1);
  });

  it('requires the standard jump toll before refunding Influencer gold after leaping a trap', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, trapOwner] = runtime.players;
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const trap = board.getCell(2, 1)!;
    const target = board.getCell(3, 1)!;
    start.setPlayer(player);
    trap.setTrap(trapOwner);
    player.barricadeCrossRefund = true;
    trapOwner.gold = 0;

    const move = require('../src/game/actions/ActionHandler').ActionHandlers.move;
    player.gold = 4;
    expect(move(player, board, target, true).success).to.equal(false);
    expect(board.getPlayerPosition(player)?.id).to.equal(start.id);
    player.gold = 5;
    expect(move(player, board, target, true).success).to.equal(true);
    expect(player.gold).to.equal(2);
    expect(trapOwner.gold).to.equal(1);
  });

  it('requires four total barricades for Influencer regardless of ownership', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    player.gold = 10;
    const cells = runtime.game.board.getAllCells()
      .filter((cell: any) => cell.isEmpty && !cell.isHole)
      .slice(0, 4);
    cells.forEach((cell: any) => cell.setTrap(player));

    const influencer = CardProcessor.get('influencer')!;
    expect(CardProcessor.canPlayCard(influencer, player, runtime.game.board, runtime.game)).to.equal(false);
    cells.forEach((cell: any) => cell.setBarricade(player));
    expect(CardProcessor.canPlayCard(influencer, player, runtime.game.board, runtime.game)).to.equal(true);
    cells[0].setTrap(opponent);
    expect(CardProcessor.canPlayCard(influencer, player, runtime.game.board, runtime.game)).to.equal(false);
    cells[0].setBarricade(opponent);
    expect(CardProcessor.canPlayCard(influencer, player, runtime.game.board, runtime.game)).to.equal(true);
  });

  it('requires the full toll for Shoes routes that leap over two objects', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    let routeCells: any[] = [];

    outer: for (const start of board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole)) {
      for (const firstObject of board.getNeighbors(start)) {
        if (!firstObject.isEmpty || firstObject.isHole) continue;
        const dx = firstObject.x - start.x;
        const dy = firstObject.y - start.y;
        const firstLanding = board.getCell(firstObject.x + dx, firstObject.y + dy);
        const secondObject = board.getCell(firstObject.x + dx * 2, firstObject.y + dy * 2);
        const finalTarget = board.getCell(firstObject.x + dx * 3, firstObject.y + dy * 3);
        if (!firstLanding?.isEmpty || firstLanding.isHole || !secondObject?.isEmpty || secondObject.isHole || !finalTarget?.isEmpty || finalTarget.isHole) continue;
        if (!board.getNeighbors(firstObject).includes(firstLanding)
          || !board.getNeighbors(firstLanding).includes(secondObject)
          || !board.getNeighbors(secondObject).includes(finalTarget)) continue;
        routeCells = [start, firstObject, firstLanding, secondObject, finalTarget];
        break outer;
      }
    }

    expect(routeCells).to.have.length(5);
    const [start, firstObject, , secondObject, finalTarget] = routeCells;
    start.setPlayer(player);
    firstObject.setBarricade(player);
    secondObject.setTrap(player);
    player.gold = 4;

    const shoes = (AllSpecialActions as any).locker_shoes.options[0];
    const route = MovementUtil.getShoesMoveRoutes(board, player).find((candidate) => candidate.target.id === finalTarget.id);
    expect(route?.jumpedObjects).to.have.length(2);
    expect(shoes.canUse(player, board, finalTarget)).to.equal(false);
    player.gold = 5;
    expect(shoes.canUse(player, board, finalTarget)).to.equal(true);
    expect(shoes.execute(player, board, finalTarget).success).to.equal(true);
    expect(player.gold).to.equal(2);
  });

  it('marks Failed Project unplayable without an opponent barricade and requests only legal targets', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    player.currCP = 3;
    player.gold = 10;
    const failedProject = CardProcessor.get('failed_project')!;

    expect(CardProcessor.canPlayCard(failedProject, player, board, runtime.game)).to.equal(false);
    const unavailableResult = CardProcessor.playCard('failed_project', player, board, runtime.game);
    expect(unavailableResult.success).to.equal(false);
    expect(unavailableResult.needsTarget).to.equal(false);

    const barricade = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    barricade.setBarricade(player);
    expect(CardProcessor.canPlayCard(failedProject, player, board, runtime.game)).to.equal(false);
    barricade.removeStructure();
    barricade.setBarricade(opponent);

    expect(CardProcessor.canPlayCard(failedProject, player, board, runtime.game)).to.equal(true);
    const targetResult = CardProcessor.playCard('failed_project', player, board, runtime.game);
    expect(targetResult.success).to.equal(true);
    expect(targetResult.needsTarget).to.equal(true);
    expect(targetResult.validTargets).to.include(barricade);
  });

  it('allows Coach C to remove an opponent barricade but not its owner’s barricade', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const start = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    start.setPlayer(player);
    const target = board.getNeighbors(start).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const coachAction = (AllSpecialActions as any)[HeroId.MIKE_U_STRONG];
    player.actionManager.addAction(coachAction);
    const coachOption = (AllSpecialActions as any)[HeroId.MIKE_U_STRONG].options.find((option: any) => option.id === 'coach_kick_down');
    expect(coachOption).to.exist;

    target.setBarricade(player);
    expect(coachOption.canUse(player, board, target)).to.equal(false);
    expect(coachOption.execute(player, board, target).success).to.equal(false);
    target.removeStructure();
    target.setBarricade(opponent);
    expect(coachOption.canUse(player, board, target)).to.equal(true);
    expect(player.actionManager.getAvailableActions(player, board)).to.include(coachAction);
    runtime.gameManager.startPlayerTurn();
    const kickDownCard = player.actionCards.find((card: any) => card._specialOptionIndex === 1)!;
    expect(runtime.gameManager.performAction(player.id, kickDownCard.id, { target })).to.equal(true);
    expect(target.hasBarricade).to.equal(false);
  });

  it('keeps Coach Gym Kill available for a nonadjacent zombie in the Gymnasium', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const coachAction = (AllSpecialActions as any)[HeroId.MIKE_U_STRONG];
    player.actionManager.addAction(coachAction);
    const gymCells = board.getCellsInRoom('Gymnasium').filter((cell: any) => cell.isEmpty && !cell.isHole);
    const start = gymCells.find((cell: any) => gymCells.some((candidate: any) =>
      candidate !== cell && !board.getNeighbors(cell).includes(candidate)
    ))!;
    const zombie = gymCells.find((cell: any) => cell !== start && !board.getNeighbors(start).includes(cell))!;
    start.setPlayer(player);
    zombie.setZombie('coach-gym-kill-test', 1);

    expect(coachAction.options[0].canUse(player, board, zombie)).to.equal(true);
    expect(player.actionManager.getAvailableActions(player, board)).to.include(coachAction);
    runtime.gameManager.startPlayerTurn();
    const gymKillCard = player.actionCards.find((card: any) => card._specialOptionIndex === 0)!;
    expect(runtime.gameManager.performAction(player.id, gymKillCard.id, { target: zombie })).to.equal(true);
    expect(zombie.hasZombie).to.equal(false);
  });

  it('moves Hired Muscle to the specifically selected adjacent destination', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    player.gold = 12;
    const origin = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole
      && board.getNeighbors(cell).some((neighbor: any) => neighbor.isEmpty && !neighbor.isHole))!;
    const destination = board.getNeighbors(origin).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    origin.setTrap(player);
    const trapEffectiveness = origin.structureData.effectiveness;
    const card = CardProcessor.get('hired_muscle')!;
    const target = { origin, destination };

    expect(card.canPlay(player, board)).to.equal(true);
    expect(card.getValidTargets?.(player, board)).to.include(origin);
    expect(card.isValidTarget(player, board, target)).to.equal(true);
    expect(card.execute(player, board, target).success).to.equal(true);
    expect(origin.hasTrap).to.equal(false);
    expect(destination.hasTrap).to.equal(true);
    expect(destination.structureOwner).to.equal(player);
    expect(destination.structureData.effectiveness).to.equal(trapEffectiveness);
    expect(player.gold).to.equal(6);
  });

  it('moves a Track C opponent to the specifically selected adjacent tile', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const action = (AllSpecialActions as any)[HeroId.CIA_LADER];
    const option = action.options[1];
    const opponentCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole
      && board.getNeighbors(cell).filter((neighbor: any) => neighbor.isEmpty && !neighbor.isHole).length >= 2)!;
    const destinations = board.getNeighbors(opponentCell).filter((cell: any) => cell.isEmpty && !cell.isHole);
    const destination = destinations[1];
    const playerCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole
      && cell !== opponentCell && !destinations.includes(cell))!;
    playerCell.setPlayer(player);
    opponentCell.setPlayer(opponent);

    expect(option.canUse(player, board, opponent)).to.equal(true);
    expect(option.canUse(player, board, { origin: opponent, destination })).to.equal(true);
    expect(option.execute(player, board, { origin: opponent, destination }).success).to.equal(true);
    expect(board.getPlayerPosition(opponent)).to.equal(destination);
    expect(opponentCell.hasPlayer).to.equal(false);
  });

  it('allows Track N cardinal jumps but rejects diagonal jumps', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const option = (AllSpecialActions as any)[HeroId.CIA_LADER].options[0];
    let cardinalRoute: { start: BoardCell; obstacle: BoardCell; landing: BoardCell } | undefined;
    let diagonalRoute: { start: BoardCell; obstacle: BoardCell; landing: BoardCell } | undefined;

    for (const start of board.getAllCells()) {
      if (!start.isEmpty || start.isHole) continue;
      const cardinalObstacle = board.getCell(start.x + 1, start.y);
      const cardinalLanding = board.getCell(start.x + 2, start.y);
      if (!cardinalRoute && cardinalObstacle?.isEmpty && !cardinalObstacle.isHole
        && cardinalLanding?.isEmpty && !cardinalLanding.isHole) {
        cardinalRoute = { start, obstacle: cardinalObstacle, landing: cardinalLanding };
      }
      const diagonalObstacle = board.getCell(start.x + 1, start.y + 1);
      const diagonalLanding = board.getCell(start.x + 2, start.y + 2);
      if (!diagonalRoute && diagonalObstacle?.isEmpty && !diagonalObstacle.isHole
        && diagonalLanding?.isEmpty && !diagonalLanding.isHole) {
        diagonalRoute = { start, obstacle: diagonalObstacle, landing: diagonalLanding };
      }
    }

    expect(cardinalRoute).to.exist;
    expect(diagonalRoute).to.exist;
    cardinalRoute!.start.setPlayer(player);
    cardinalRoute!.obstacle.setTrap(player);
    expect(option.canUse(player, board, cardinalRoute!.obstacle)).to.equal(true);

    cardinalRoute!.start.clear();
    cardinalRoute!.obstacle.clear();
    diagonalRoute!.start.setPlayer(player);
    diagonalRoute!.obstacle.setTrap(player);
    expect(option.canUse(player, board, diagonalRoute!.obstacle)).to.equal(false);
  });

  it('executes Bully N-Action with its selected zombie target', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;

    expect(manager.selectHero(player.id, HeroId.BROCK_SLAYTON)).to.equal(true);
    const start = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole
      && board.getNeighbors(cell).some((neighbor: any) => neighbor.isEmpty && !neighbor.isHole))!;
    const zombie = board.getNeighbors(start).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    start.setPlayer(player);
    zombie.setZombie('bully-n-action-test', 1);
    manager.startPlayerTurn();
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      expect(manager.performAction(player.id, 'hero_brock_slayton', { optionIndex: 0, target: zombie })).to.equal(true);
    } finally {
      Math.random = originalRandom;
    }
    expect(zombie.hasZombie).to.equal(false);
    expect(player.currSP).to.be.greaterThan(0);
  });

  it('does not allow Mercy when no other living player remains', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.gold = 10;
    player.hand.cards.push({ id: 'mercy-test-card-1', name: 'Test 1' }, { id: 'mercy-test-card-2', name: 'Test 2' });
    const mercy = CardProcessor.get('mercy')!;

    expect(mercy.canPlay(player, runtime.game.board)).to.equal(false);
  });

  it('blocks Bait Launcher targets beyond a barricade even within Manhattan range', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const option = (AllSpecialActions as any).bait_launcher.options[0];
    let route: { start: BoardCell; blocker: BoardCell; target: BoardCell } | undefined;

    for (const start of board.getAllCells()) {
      for (const direction of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
        const first = board.getCell(start.x + direction.dx, start.y + direction.dy);
        const second = board.getCell(start.x + direction.dx * 2, start.y + direction.dy * 2);
        const target = board.getCell(start.x + direction.dx * 3, start.y + direction.dy * 3);
        if (
          start.isEmpty && !start.isHole && first?.isEmpty && second?.isEmpty && target?.isEmpty &&
          board.getNeighbors(start).includes(first) && board.getNeighbors(first).includes(second) &&
          board.getNeighbors(second).includes(target)
        ) {
          route = { start, blocker: first, target };
          break;
        }
      }
      if (route) break;
    }

    expect(route).to.exist;
    route!.start.setPlayer(player);
    expect(option.canUse(player, board, route!.target)).to.equal(true);
    route!.blocker.setBarricade(opponent);
    expect(option.canUse(player, board, route!.target)).to.equal(false);
  });

  it('rotates the round starter from the prior starter and skips eliminated players', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2', 'Player 3'], cpuCount: 0 });
    const { game } = runtime;
    const firstManager = new GameManager(game);
    firstManager.startPlayerTurn();
    expect(game.getCurrentPlayer()?.id).to.equal(runtime.players[0].id);

    game._generationCount = 1;
    game._currentPlayerIndex = 2;
    const secondManager = new GameManager(game);
    secondManager.startPlayerTurn();
    expect(game.getCurrentPlayer()?.id).to.equal(runtime.players[1].id);

    runtime.players[2].isEliminated = true;
    game._generationCount = 2;
    const thirdManager = new GameManager(game);
    thirdManager.startPlayerTurn();
    expect(game.getCurrentPlayer()?.id).to.equal(runtime.players[0].id);
  });

  it('charges locker action gold costs only once even when the option also gives gold or draws cards', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;

    player.gold = 10;
    player.currCP = 2;
    player.hand.cards = [];
    player.actionManager.addAction((AllSpecialActions as any)['locker_cool_for_sale']);

    const coolResult = player.actionManager.executeOption(player, board, 'locker_cool_for_sale', 1);
    expect(coolResult.success).to.equal(true);
    expect(player.gold).to.equal(15);
    expect(player.currCP).to.equal(1);

    player.gold = 10;
    player.actionManager.addAction((AllSpecialActions as any)['locker_long_sleeves']);
    const longSleevesResult = player.actionManager.executeOption(player, board, 'locker_long_sleeves', 0);
    expect(longSleevesResult.success).to.equal(true);
    expect(player.gold).to.equal(8);
  });

  it('prompts for the card to discard or keep for Pyramid Scheme, Long Sleeves, and Secretary C-Action', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { game } = runtime;
    const player = runtime.players[0];
    const handCards = [
      { id: 'hand-card-1', cardId: 'test-1', name: 'First Card' },
      { id: 'hand-card-2', cardId: 'test-2', name: 'Second Card' },
    ];
    player.hand.cards = [...handCards];
    player.gold = 20;

    const pyramid = (AllSpecialActions as any).locker_pyramid_scheme;
    player.actionManager.addAction(pyramid);
    expect(player.actionManager.executeOption(player, game.board, pyramid.id, 0).success).to.equal(true);
    expect(game.pendingCardSelection).to.include({ type: 'discard', playerId: player.id, drawCount: 0 });
    expect(player.hand.cards.map((card: any) => card.id)).to.deep.equal(handCards.map(card => card.id));
    CardDrawer.completeDiscardDraw(player, handCards[0].id, 0);

    const longSleeves = (AllSpecialActions as any).locker_long_sleeves;
    player.actionManager.addAction(longSleeves);
    expect(player.actionManager.executeOption(player, game.board, longSleeves.id, 0).success).to.equal(true);
    expect(game.pendingCardSelection).to.include({ type: 'keep', playerId: player.id, count: 1, keepCount: 1 });
    expect(game.pendingCardSelection?.cards).to.have.length(2);
    CardDrawer.completeDrawKeep(player, [game.pendingCardSelection!.cards[0].id]);

    const secretary = Object.values(AllSpecialActions).find((action: any) =>
      action.options?.some((option: any) => option.id === 'secretary_discard_draw')
    ) as any;
    const secretaryOptionIndex = secretary.options.findIndex((option: any) => option.id === 'secretary_discard_draw');
    player.actionManager.addAction(secretary);
    expect(player.actionManager.executeOption(player, game.board, secretary.id, secretaryOptionIndex).success).to.equal(true);
    expect(game.pendingCardSelection).to.include({ type: 'discard', playerId: player.id, drawCount: 2 });
    expect(player.hand.cards.length).to.be.greaterThan(0);
  });

  it('preserves log history and pending card choices through game snapshots', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.hand.cards = [{ id: 'hand-card-1', cardId: 'test-1', name: 'First Card' }];
    runtime.game.emit('log', 'Player 1 took an action.');
    CardDrawer.discardDraw(player, 2);

    const hydrated = hydrateGame(JSON.parse(JSON.stringify(runtime.game)));

    expect(hydrated.logHistory).to.include('Player 1 took an action.');
    expect(hydrated.pendingCardSelection).to.include({
      type: 'discard',
      playerId: player.id,
      drawCount: 2,
    });
    expect(hydrated.pendingCardSelection?.cards[0].id).to.equal('hand-card-1');
  });

  it('starts the initial action round on night 1 so hero and locker actions work before the first nightly draft', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const cell = board.getAllCells().find((c: any) => c.isEmpty && !c.isHole && !!c.roomId);

    expect(cell).to.exist;
    cell!.setPlayer(player);

    player.currCP = 1;
    runtime.gameManager.selectHero(player.id, HeroId.BARRY_CADE);
    player.actionManager.addAction((AllSpecialActions as any)['locker_cool_for_sale']);

    runtime.gameManager.startPlayerTurn();

    expect(player.actionManager.getCurrentNight()).to.equal(1);
    const actionCard = player.actionCards.find((card: any) => card.actionId === 'locker_cool_for_sale');
    expect(actionCard).to.exist;

    const result = runtime.gameManager.performAction(player.id, actionCard!.id, { optionIndex: 1 });
    expect(result).to.equal(true);
    expect(player.gold).to.be.greaterThanOrEqual(0);
  });

  it('resets placement to the first player and syncs the game current-player index', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
    });

    runtime.game._currentPlayerIndex = 1;
    runtime.gameManager.startPlacementPhase();

    expect(runtime.game.getCurrentPlayer()?.id).to.equal(runtime.players[0].id);
    expect(runtime.gameManager.getPhase()).to.equal('placement');
    expect(runtime.game.board.getAllZombies().length).to.be.greaterThan(0);
  });

  it('gives each player a placement turn, resolves start actions, then starts normal play with player one', () => {
    const runtime = createRuntimeGame({
      humanNames: ['P1', 'P2'],
      cpuCount: 0,
    });

    const [p1, p2] = runtime.players;
    runtime.gameManager.startPlacementPhase();
    p1.selectedLockerStartAction = 'barricade';

    const p1Cell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const p2Cell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && cell !== p1Cell)!;

    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p1.id);
    expect(runtime.gameManager.placeHero(p2.id, p2Cell.x, p2Cell.y)).to.equal(false);
    expect(runtime.gameManager.placeHero(p1.id, p1Cell.x, p1Cell.y)).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p1.id);

    const startActionTarget = runtime.game.board.getAllCells().find((cell: any) => {
      if (!cell.isEmpty || cell.isHole || cell.hasPlayer || cell.hasZombie || cell === p2Cell) return false;
      return Math.abs(cell.x - p1Cell.x) + Math.abs(cell.y - p1Cell.y) <= 2;
    })!;
    expect(runtime.gameManager.resolveStartAction(p1.id, startActionTarget)).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p2.id);

    expect(runtime.gameManager.placeHero(p2.id, p2Cell.x, p2Cell.y)).to.equal(true);
    expect(runtime.gameManager.getPhase()).to.equal('player_turn');
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p1.id);
  });

  it('hydrates the first player as active after the second hero placement', () => {
    const runtime = createRuntimeGame({
      humanNames: ['P1', 'P2'],
      cpuCount: 0,
    });
    const [p1, p2] = runtime.players;
    runtime.gameManager.startPlacementPhase();
    const cells = runtime.game.board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole);

    expect(runtime.gameManager.placeHero(p1.id, cells[0].x, cells[0].y)).to.equal(true);
    expect(runtime.gameManager.placeHero(p2.id, cells[1].x, cells[1].y)).to.equal(true);

    const hydrated = hydrateGame(JSON.parse(JSON.stringify(runtime.game)));
    expect(hydrated.phase).to.equal('player_turn');
    expect(hydrated.getCurrentPlayer()?.id).to.equal(p1.id);
  });

  it('emits a log entry when Al B. Tross misses a super melee attack', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const manager = runtime.gameManager;
    const board = runtime.game.board;
    const logs: string[] = [];
    const originalRandom = Math.random;

    Math.random = () => 1;
    runtime.game.on('log', (message: string) => logs.push(message));

    const heroPicked = manager.selectHero(player.id, HeroId.AL_B_TROSS);
    expect(heroPicked).to.equal(true);

    const playerCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !!cell.roomId)!;
    playerCell.setPlayer(player);
    player.gold = 20;
    manager.startPlayerTurn();
    player.syncActionCards();

    const zombieCell = board.getNeighbors(playerCell).find((cell: any) => cell.isEmpty && !cell.isHole && !cell.hasPlayer && !cell.hasTrap && !cell.hasBarricade)!;
    expect(zombieCell).to.exist;
    zombieCell!.setZombie('test-super-melee-zombie', 1);

    const actionCard = player.actionCards.find((card: any) => card._specialActionId === 'hero_al_b_tross');
    expect(actionCard).to.exist;

    const used = manager.performAction(player.id, actionCard!.id, { target: zombieCell });

    Math.random = originalRandom;

    expect(used).to.equal(true);
    expect(logs.some((message: string) => /Super melee missed/i.test(message))).to.equal(true);
  });

  it('restores all three actions after a standard melee miss', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    const start = board.getCell(0, 5)!;
    const firstStep = board.getCell(1, 5)!;
    const secondStep = board.getCell(2, 5)!;
    const zombieCell = board.getCell(3, 5)!;
    start.setPlayer(player);
    player.gold = 100;
    manager.startPlayerTurn();

    expect(manager.performAction(player.id, 'move', { target: firstStep })).to.equal(true);
    expect(manager.performAction(player.id, 'move', { target: secondStep })).to.equal(true);
    zombieCell.setZombie('adrenaline-standard-melee-zombie', 1);
    const originalRandom = Math.random;
    Math.random = () => 1;
    try {
      expect(manager.performAction(player.id, 'melee', { target: zombieCell })).to.equal(true);
    } finally {
      Math.random = originalRandom;
    }

    expect(manager.getActionsRemaining()).to.equal(3);
    expect(runtime.game.actionsRemaining).to.equal(3);
  });

  it('restores all three actions after a special-action melee miss', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    expect(manager.selectHero(player.id, HeroId.AL_B_TROSS)).to.equal(true);
    board.getCell(0, 5)!.setPlayer(player);
    player.gold = 100;
    manager.startPlayerTurn();

    expect(manager.performAction(player.id, 'move', { target: board.getCell(1, 5) })).to.equal(true);
    expect(manager.performAction(player.id, 'move', { target: board.getCell(2, 5) })).to.equal(true);
    const zombieCell = board.getCell(3, 5)!;
    zombieCell.setZombie('adrenaline-special-melee-zombie', 1);
    const meleeAction = player.actionCards.find((card: any) => card._specialOptionIndex === 0)!;
    const originalRandom = Math.random;
    Math.random = () => 1;
    try {
      expect(manager.performAction(player.id, meleeAction.id, { target: zombieCell })).to.equal(true);
    } finally {
      Math.random = originalRandom;
    }

    expect(manager.getActionsRemaining()).to.equal(3);
    expect(runtime.game.actionsRemaining).to.equal(3);
  });

  it('uses Al B. Tross N on an adjacent zombie and binds Teacher C artwork to the C action', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    const originalRandom = Math.random;
    expect(manager.selectHero(player.id, HeroId.AL_B_TROSS)).to.equal(true);
    const playerCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    playerCell.setPlayer(player);
    player.gold = 20;
    manager.startPlayerTurn();
    const zombieCell = board.getNeighbors(playerCell).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    zombieCell.setZombie('teacher-n-action-zombie', 1);
    player.syncActionCards();
    const nAction = player.actionCards.find((card: any) => card._specialOptionIndex === 0)!;
    const cAction = player.actionCards.find((card: any) => card._specialOptionIndex === 1)!;
    expect(nAction).to.exist;
    expect(cAction).to.exist;
    expect(cAction.image).to.equal('teacher_c_action.jpg');

    Math.random = () => 0;
    try {
      expect(manager.performAction(player.id, nAction.id, { target: zombieCell })).to.equal(true);
    } finally {
      Math.random = originalRandom;
    }

    expect(zombieCell.hasZombie).to.equal(false);
    expect(player.gold).to.equal(10);
  });

  it('moves an opponent trap within two steps of the trap origin, not the player', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    expect(manager.selectHero(player.id, HeroId.AL_B_TROSS)).to.equal(true);
    const playerCell = board.getCell(0, 5)!;
    playerCell.setPlayer(player);
    const origin = board.getCell(7, 5)!;
    origin.setTrap(opponent);
    const barricade = board.getCell(8, 5)!;
    barricade.setBarricade(opponent);
    const playerDestinations = new Set(MovementUtil.getCellsWithinSteps(board, player, 2, true).map((cell: any) => cell.id));
    const destination = MovementUtil.getCellsWithinStepsFromCell(board, origin, 2, true)
      .find((cell: any) => cell.isEmpty && !cell.isHole && !playerDestinations.has(cell.id))!;
    player.gold = 20;
    manager.startPlayerTurn();
    const cAction = player.actionCards.find((card: any) => card._specialOptionIndex === 1)!;
    const moveTrapOption = player.actionManager.getAllActions().find((action: any) => action.id === 'hero_al_b_tross')!.options[1];
    const cpBefore = player.currCP;

    expect(moveTrapOption.canUse(player, board, barricade)).to.equal(false);
    expect(manager.performAction(player.id, cAction.id, { target: { origin, destination } })).to.equal(true);
    expect(origin.hasTrap).to.equal(false);
    expect(destination.hasTrap).to.equal(true);
    expect(destination.structureOwner).to.equal(opponent);
    expect(player.currCP).to.equal(cpBefore + 1);
  });

  it('plays Regret by selecting one of the player\'s own structure cells', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const trap = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    trap.setTrap(player);
    player.gold = 10;
    player.addCard({ id: 'regret-targeting-test', cardId: 'regret', name: 'Regret' });
    runtime.gameManager.startPlayerTurn();

    expect(runtime.gameManager.performAction(player.id, 'regret-targeting-test', {})).to.equal(true);
    expect(runtime.game.targetingCardId).to.equal('regret');
    expect(runtime.game.targetingValidTargets).to.include(trap);

    expect(runtime.gameManager.performAction(player.id, 'regret', { target: trap })).to.equal(true);
    expect(runtime.game.targetingCardId).to.equal(null);
    expect(trap.hasTrap).to.equal(false);
    expect(player.currSP).to.equal(1);
  });

  it('cancels a pending targeted card without using an action', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    board.getCell(0, 5)!.setPlayer(player);
    const trap = board.getCell(1, 5)!;
    trap.setTrap(player);
    player.gold = 10;
    player.addCard({ id: 'regret-cancel-test', cardId: 'regret', name: 'Regret' });
    runtime.gameManager.startPlayerTurn();

    expect(runtime.gameManager.performAction(player.id, 'regret-cancel-test', {})).to.equal(true);
    expect(runtime.game.targetingPlayerId).to.equal(player.id);
    const actionsRemaining = runtime.gameManager.getActionsRemaining();
    expect(runtime.gameManager.performAction(player.id, 'cancel-card-targeting', {})).to.equal(true);
    expect(runtime.game.targetingCardId).to.equal(null);
    expect(runtime.game.targetingPlayerId).to.equal(null);
    expect(runtime.gameManager.getActionsRemaining()).to.equal(actionsRemaining);

    const position = board.getPlayerPosition(player)!;
    const moveTarget = board.getNeighbors(position).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    expect(runtime.gameManager.performAction(player.id, 'move', { target: moveTarget })).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(moveTarget.id);
  });

  it('auto-selects a CPU hero and locker while keeping starting cards in preview', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const cpu = runtime.players.find(p => (p as any).isBot);
    expect(cpu).to.exist;
    expect(cpu!.heroId).to.not.equal(null);
    expect(cpu!.availableLockers?.length ?? 0).to.equal(0);
    expect(cpu!.availableStartingCards?.length ?? 0).to.equal(9);
  });

  it('waits for every human setup lock-in before committing choices and starting placement', () => {
    const runtime = createRuntimeGame({
      humanNames: ['P1', 'P2'],
      cpuCount: 0,
    });

    const [p1, p2] = runtime.players;
    const firstResult = runtime.gameManager.lockInSetup(p1.id, {
      heroId: p1.availableHeroes[0].id,
      lockerId: p1.availableLockers[0].id,
      startingCardIds: p1.availableStartingCards.slice(0, 2).map(card => card.id),
    });

    expect(firstResult).to.equal(true);
    expect(p1.setupLockedIn).to.equal(true);
    expect(p2.setupLockedIn).to.equal(false);
    expect(runtime.gameManager.getPhase()).to.equal('hero_selection');
    expect(runtime.gameManager.lockInSetup(p1.id, {
      heroId: p1.availableHeroes[0].id,
      lockerId: p1.availableLockers[0].id,
      startingCardIds: [],
    })).to.equal(false);

    const secondResult = runtime.gameManager.lockInSetup(p2.id, {
      heroId: p2.availableHeroes[0].id,
      lockerId: p2.availableLockers[0].id,
      startingCardIds: p2.availableStartingCards.slice(0, 2).map(card => card.id),
    });

    expect(secondResult).to.equal(true);
    expect(p1.heroId).to.not.equal(null);
    expect(p2.heroId).to.not.equal(null);
    expect(p1.availableStartingCards).to.have.length(0);
    expect(p2.availableStartingCards).to.have.length(0);
    expect(runtime.gameManager.getPhase()).to.equal('placement');
  });

  it('preserves the live runtime phase when a game is hydrated and a new manager is created', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const initialPhase = runtime.gameManager.getPhase();
    expect(['hero_selection', 'locker_selection', 'card_purchase', 'placement']).to.include(initialPhase);

    const hydrated = hydrateGame(runtime.game);
    const hydratedManager = new GameManager(hydrated);

    expect(hydrated.phase).to.equal(initialPhase);
    expect(hydratedManager.getPhase()).to.equal(initialPhase);
  });

  it('preserves card metadata in game snapshots and restores legacy ID-only hands', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });
    const player = runtime.players[0];
    const card = player.availableStartingCards[0];
    player.hand.cards = [card];
    runtime.gameManager.selectHero(player.id, player.availableHeroes[0].id);

    const raw = JSON.parse(JSON.stringify(runtime.game));
    const hydrated = hydrateGame(raw);
    const restoredCard = hydrated.players[0].hand.cards[0];

    expect(restoredCard).to.include({
      id: card.id,
      cardId: card.cardId,
      name: card.name,
      cost: card.cost,
      image: card.image,
    });
    expect(hydrated.players[0].actionCards.length).to.be.greaterThan(0);

    raw.players[0].hand.cards = [card.id];
    const legacyHydrated = hydrateGame(raw);
    expect(legacyHydrated.players[0].hand.cards[0]).to.include({
      id: card.id,
      cardId: card.cardId,
      name: card.name,
      cost: card.cost,
      image: card.image,
    });
  });

  it('keeps the human setup flow active while CPUs auto-resolve their setup in the background', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const human = runtime.players.find((player: any) => !player.isBot)!;
    const cpu = runtime.players.find((player: any) => player.isBot)!;

    expect(cpu.heroId).to.not.equal(null);
    expect(runtime.game.phase).to.equal('hero_selection');
    expect(human.heroId).to.equal(null);
    expect(human.availableLockers?.length ?? 0).to.be.greaterThan(0);
  });

  it('keeps setup card previews available while players finish locker selection', () => {
    const runtime = createRuntimeGame({
      humanNames: ['P1', 'P2'],
      cpuCount: 0,
    });

    const [p1, p2] = runtime.players;
    runtime.gameManager.setTemporaryHeroSelection(p1.id, HeroId.AL_B_TROSS);
    runtime.gameManager.confirmHeroSelection(p1.id);
    runtime.gameManager.setTemporaryHeroSelection(p2.id, HeroId.ARCHY_TECT);
    runtime.gameManager.confirmHeroSelection(p2.id);

    expect(runtime.game.phase).to.equal('locker_selection');

    const lockerForP1 = p1.availableLockers[0].id;
    runtime.gameManager.setTemporaryLockerSelection(p1.id, lockerForP1);
    runtime.gameManager.confirmLockerSelection(p1.id);

    expect(runtime.game.phase).to.equal('locker_selection');
    expect(p1.availableStartingCards.length).to.equal(9);

    const lockerForP2 = p2.availableLockers[0].id;
    runtime.gameManager.setTemporaryLockerSelection(p2.id, lockerForP2);
    runtime.gameManager.confirmLockerSelection(p2.id);

    expect(runtime.game.phase).to.equal('card_purchase');
    expect(p1.availableStartingCards.length).to.equal(9);
    expect(p2.availableStartingCards.length).to.equal(9);
  });

  it('tracks played cards in a personal played pile instead of the shared deck/discard flow', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const firstCard = { id: 'played-card-1', cardId: 'played-card-1', name: 'Played Card', cost: 1 };
    const secondCard = { id: 'hand-card-1', cardId: 'hand-card-1', name: 'Hand Card', cost: 1 };

    player.hand.cards = [firstCard, secondCard];
    const removed = player.removeCard(firstCard.id);

    expect(removed).to.deep.equal(firstCard);
    expect(player.hand.cards.map((card: any) => card.id)).to.deep.equal([secondCard.id]);
    expect(player.hand.playedCards).to.deep.equal([]);

    player.hand.playedCards.push(removed!);
    expect(player.hand.playedCards.map((card: any) => card.id)).to.deep.equal([firstCard.id]);
  });

  it('keeps discard-draw results attached to the actual discarded card object without recycling them into the shared deck', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const discardCard = { id: 'discarded-card', cardId: 'discarded-card', name: 'Discarded Card', cost: 1 };
    const keepCard = { id: 'keep-card', cardId: 'keep-card', name: 'Keep Card', cost: 1 };

    player.hand.cards = [discardCard, keepCard];
    runtime.game.cardManager.initializeGameDeck([
      { id: 'draw-1', cardId: 'draw-1', name: 'Draw 1', cost: 1 },
      { id: 'draw-2', cardId: 'draw-2', name: 'Draw 2', cost: 1 }
    ]);

    const beforeDiscard = runtime.game.cardManager.getGameDiscardSize();
    const result = CardDrawer.completeDiscardDraw(player, discardCard.id, 1);

    expect(result.success).to.equal(true);
    expect(result.discardedCards[0].id).to.equal(discardCard.id);
    expect(['draw-1', 'draw-2']).to.include(result.keptCards[0].id);
    expect(player.discardPile.some((card: any) => card.id === discardCard.id)).to.equal(true);
    expect(runtime.game.cardManager.getGameDiscardSize()).to.equal(beforeDiscard);
  });

  it('keeps action cards in a dedicated action hand and out of the normal hand until used', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const manager = runtime.gameManager;

    const heroPicked = manager.selectHero(player.id, HeroId.RICHARD_KIM);
    expect(heroPicked).to.equal(true);

    const standCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !!cell.roomId)!;
    standCell.setPlayer(player);
    runtime.gameManager.startPlayerTurn();

    player.syncActionCards();
    expect(player.actionCards.length).to.equal(2);
    expect(player.hand.cards.some((card: any) => card.__kind === 'special-action')).to.equal(false);

    const firstCard = player.actionCards[0];
    expect(firstCard).to.exist;

    const used = manager.performAction(player.id, firstCard.id, {});
    expect(used).to.equal(true);

    expect(player.actionCards.some((card: any) => card.__kind === 'special-action')).to.equal(false);
    expect(player.discardPile.some((card: any) => card.__kind === 'special-action' && card._specialActionId === 'hero_richard_kim')).to.equal(true);
  });

  it('assigns the supplied artwork to every action option that has a matching image', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const expected = new Map([
      ['nurse_heal', 'nurse_n_action.jpg'],
      ['nurse_spawn', 'nurse_c_action.jpg'],
      ['barry_destroy_own', 'football_n_action.jpg'],
      ['barry_destroy_opponent', 'football_c_action.jpg'],
      ['janitor_lose_sp', 'janitor_n_action.jpg'],
      ['janitor_place_bait', 'janitor_c_action.jpg'],
      ['von_trap_explode', 'cheerleader_n_action.jpg'],
      ['von_trap_move', 'cheerleader_c_action.jpg'],
      ['bully_melee', 'bully_n_action.jpg'],
      ['bully_spawn', 'bully_c_action.jpg'],
      ['track_jump', 'runner_n_action.jpg'],
      ['track_move_opponent', 'runner_c_action.jpg'],
      ['bungler_super_melee', 'teacher_n_action.jpg'],
      ['bungler_move_trap', 'teacher_c_action.jpg'],
      ['nerd_barricade_gold', 'nerd_n_action.jpg'],
      ['nerd_replace_barricade', 'nerd_c_action.jpg'],
      ['lunch_lady_solo', 'lunch_lady_n_action.jpg'],
      ['lunch_lady_steal', 'lunch_lady_c_action.jpg'],
      ['principal_safe', 'principal_n_action.jpg'],
      ['principal_spawn', 'principal_c_action.jpg'],
      ['secretary_draw_give', 'secretary_n_action.jpg'],
      ['secretary_discard_draw', 'secretary_c_action.jpg'],
      ['coach_gym_kill', 'coach_n_action.jpg'],
      ['coach_kick_down', 'coach_c_action.jpg'],
      ['cool_sp', 'cool_for_sale_sp_action.jpg'],
      ['cool_gold', 'cool_for_sale_gold_action.jpg'],
      ['hugs_np', 'hug_opponent_action.jpg'],
      ['hugs_cp', 'hug_zombie_action.jpg'],
      ['nice_sp', 'nice_for_sale_sp_action.jpg'],
      ['nice_gold', 'nice_for_sale_gold_action.jpg'],
      ['ouija_np', 'ouija_board_n_action.jpg'],
      ['ouija_cp', 'ouija_board_c_action.jpg'],
      ['printed_walls_place', 'print_walls_action.jpg'],
      ['bait_launcher_place', 'bait_launch_action.jpg'],
      ['confident_step_move', 'first_step_action.jpg'],
      ['gymnastics_jump', 'gymnastics_training_action.jpg'],
      ['grappling_hook_jump', 'grappling_hook_action.jpg'],
      ['long_sleeves_draw', 'long_sleeves_action.jpg'],
      ['pyramid_scheme_discard', 'pyramid_scheme_action.jpg'],
    ]);

    for (const [optionId, image] of expected) {
      expect(player.createActionCard({ id: 'test_action', name: 'Test Action' }, { id: optionId }, 0).image).to.equal(image);
      expect(existsSync(join(process.cwd(), 'public', 'card-art', 'actioncard_assets', image))).to.equal(true);
    }

    const shoesActionCard = player.createActionCard({ id: 'locker_shoes', name: 'Shoes' }, { id: 'shoes_move' }, 0);
    expect(shoesActionCard.image).to.equal('shoes.jpg');
    expect(shoesActionCard.imageKind).to.equal('locker');
    expect(existsSync(join(process.cwd(), 'public', 'card-art', 'lockercard_assets', shoesActionCard.image))).to.equal(true);
  });

  it('refreshes hero actions when a new night starts', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const manager = runtime.gameManager as any;

    const heroPicked = manager.selectHero(player.id, HeroId.RICHARD_KIM);
    expect(heroPicked).to.equal(true);

    const standCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !!cell.roomId)!;
    standCell.setPlayer(player);
    runtime.gameManager.startPlayerTurn();
    player.syncActionCards();

    const firstCard = player.actionCards[0];
    expect(firstCard).to.exist;
    expect(manager.performAction(player.id, firstCard.id, {})).to.equal(true);

    expect(player.actionCards.some((card: any) => card._specialActionId === 'hero_richard_kim')).to.equal(false);

    manager.advanceActionNight();
    player.syncActionCards();

    expect(player.actionCards.some((card: any) => card._specialActionId === 'hero_richard_kim')).to.equal(true);
  });

  it('requires Mike U. Strong Gym Kill to only work in the Gymnasium', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager as any;

    const heroPicked = manager.selectHero(player.id, HeroId.MIKE_U_STRONG);
    expect(heroPicked).to.equal(true);

    const auditoriumCell = board.getAllCells().find((cell: any) => cell.roomId === 'Auditorium' && cell.isEmpty && !cell.isHole)!;
    const adjacentZombieCell = board.getNeighbors(auditoriumCell).find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasZombie)!;
    adjacentZombieCell.setZombie('test-zombie', 1);
    auditoriumCell.setPlayer(player);

    const action = player.actionManager.getAllActions().find((entry: any) => entry.id === 'hero_mike_u_strong');
    const gymKillOption = action.options[0];

    expect(gymKillOption.canUse(player, board, adjacentZombieCell)).to.equal(false);
  });

  it('lets Mike U. Strong use both Gym Kill and Kick Down from their action cards', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;

    expect(manager.selectHero(player.id, HeroId.MIKE_U_STRONG)).to.equal(true);
    const gymCells = board.getCellsInRoom('Gymnasium').filter((cell: any) => cell.isEmpty && !cell.isHole);
    const gymCell = gymCells[0];
    const zombieCell = gymCells.find((cell: any) => cell !== gymCell && !board.getNeighbors(gymCell).includes(cell))!;
    gymCell.setPlayer(player);
    zombieCell.setZombie('mike-gym-kill-test', 1);
    manager.startPlayerTurn();

    const gymKillCard = player.actionCards.find((card: any) => card._specialActionId === 'hero_mike_u_strong' && card._specialOptionIndex === 0)!;
    expect(manager.performAction(player.id, 'hero_mike_u_strong', { optionIndex: 0, target: zombieCell })).to.equal(true);
    expect(zombieCell.hasZombie).to.equal(false);

    const secondRuntime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const secondPlayer = secondRuntime.players[0];
    const secondBoard = secondRuntime.game.board;
    const secondManager = secondRuntime.gameManager;
    expect(secondManager.selectHero(secondPlayer.id, HeroId.MIKE_U_STRONG)).to.equal(true);
    const standCell = secondBoard.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const barricadeCell = secondBoard.getNeighbors(standCell).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    standCell.setPlayer(secondPlayer);
    barricadeCell.setBarricade(secondRuntime.players[1]);
    secondManager.startPlayerTurn();

    const kickDownCard = secondPlayer.actionCards.find((card: any) => card._specialActionId === 'hero_mike_u_strong' && card._specialOptionIndex === 1)!;
    expect(secondManager.performAction(secondPlayer.id, 'hero_mike_u_strong', { optionIndex: 1, target: barricadeCell })).to.equal(true);
    expect(barricadeCell.hasBarricade).to.equal(false);
    expect(secondPlayer.currCP).to.equal(1);
  });

  it('trades one SP for three NP with Phil T. Rags', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const manager = runtime.gameManager;

    expect(manager.selectHero(player.id, HeroId.PHIL_T_RAGS)).to.equal(true);
    player.currSP = 3;
    player.currNP = 0;
    manager.startPlayerTurn();

    const result = manager.performAction(player.id, 'hero_phil_t_rags', { optionIndex: 0 });
    expect(result).to.equal(true);
    expect(player.currSP).to.equal(2);
    expect(player.currNP).to.equal(3);
    expect(manager.getActionsRemaining()).to.equal(2);
    expect(runtime.game.actionsRemaining).to.equal(2);
  });

  it('lets Phil T. Rags place bait on a cell adjacent to an opponent', () => {
    const runtime = createRuntimeGame({ humanNames: ['P1', 'P2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    expect(manager.selectHero(player.id, HeroId.PHIL_T_RAGS)).to.equal(true);

    const playerCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const opponentCell = board.getAllCells().find((cell: any) =>
      cell !== playerCell &&
      cell.isEmpty &&
      !cell.isHole &&
      board.getNeighbors(cell).some((neighbor: any) => neighbor !== playerCell && neighbor.isEmpty && !neighbor.isHole)
    )!;
    playerCell.setPlayer(player);
    opponentCell.setPlayer(opponent);
    const baitCell = board.getNeighbors(opponentCell).find((cell: any) => cell.isEmpty && !cell.isHole && cell !== playerCell)!;
    player.gold = 10;
    manager.startPlayerTurn();

    const baitAction = player.actionCards.find((card: any) => card._specialActionId === 'hero_phil_t_rags' && card._specialOptionIndex === 1)!;
    expect(manager.performAction(player.id, 'hero_phil_t_rags', { optionIndex: 1, target: baitCell })).to.equal(true);
    expect(baitCell.hasBait).to.equal(true);
    expect(player.gold).to.equal(8);
  });

  it('adds the 3D Printed Walls barricade action after the card is played', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    const standCell = board.getCell(1, 1)!;
    const target = board.getNeighbors(standCell).find((cell: any) => cell.isEmpty && !cell.isHole)!;

    standCell.setPlayer(player);
    player.gold = 20;
    player.currNP = 8;
    player.hand.cards = [{ id: 'test-printed-walls', cardId: '3d_printed_walls', name: '3D Printed Walls', cost: 6 }];
    manager.startPlayerTurn();

    expect(manager.performAction(player.id, 'test-printed-walls', {})).to.equal(true);
    const actionCard = player.actionCards.find((card: any) => card._specialActionId === 'game_printed_walls');
    expect(actionCard).to.exist;
    expect(manager.performAction(player.id, actionCard!._specialActionId, { target })).to.equal(true);
    expect(target.hasBarricade).to.equal(true);
    expect(player.gold).to.equal(10);
  });

  it('does not return a player who passed when another player defers after three actions', () => {
    const runtime = createRuntimeGame({ humanNames: ['P1', 'P2'], cpuCount: 0 });
    const [p1, p2] = runtime.players;
    const board = runtime.game.board;
    const p1Cell = board.getCell(1, 1)!;
    const p2Cell = board.getCell(4, 1)!;
    p1Cell.setPlayer(p1);
    p2Cell.setPlayer(p2);
    runtime.gameManager.startPlayerTurn();

    expect(runtime.gameManager.passTurn(p1.id)).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p2.id);
    p2.actionManager.addAction({
      id: 'test_auto_defer',
      name: 'Test Auto Defer',
      description: '',
      isDualOption: false,
      options: [{
        id: 'test_auto_defer_option',
        name: 'Test',
        description: '',
        targetType: 'none',
        canUse: () => true,
        execute: () => ({ success: true, message: 'test action' }),
        expectedValue: () => 0,
      }],
    });
    (runtime.gameManager as any).actionsUsed = 2;
    runtime.game._actionsRemaining = 1;

    expect(runtime.gameManager.performAction(p2.id, 'test_auto_defer', {})).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p2.id);
  });

  it('lets a player defer after two actions and gives their later turn after other players pass', () => {
    const runtime = createRuntimeGame({ humanNames: ['P1', 'P2'], cpuCount: 0 });
    const [p1, p2] = runtime.players;
    const manager = runtime.gameManager;
    manager.startPlayerTurn();
    (manager as any).actionsUsed = 2;
    runtime.game._actionsRemaining = 1;

    expect(manager.deferTurn(p1.id)).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p2.id);
    expect(manager.passTurn(p2.id)).to.equal(true);
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(p1.id);
    expect(manager.getActionsRemaining()).to.equal(3);
  });

  it('allows Elsa Von Trap to move a chosen trap to a destination cell in a second click', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const manager = runtime.gameManager;
    const board = runtime.game.board;

    const heroPicked = manager.selectHero(player.id, HeroId.ELSA_VON_TRAP);
    expect(heroPicked).to.equal(true);

    const standCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !!cell.roomId)!;
    standCell.setPlayer(player);
    manager.startPlayerTurn();

    const origin = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !!cell.roomId && !cell.hasPlayer)!;
    expect(origin).to.exist;
    origin!.setTrap(player);

    const destination = board.getAllCells().find((cell: any) =>
      cell !== origin &&
      cell.isEmpty &&
      !cell.isHole &&
      !cell.hasPlayer &&
      !cell.hasTrap &&
      Math.abs(cell.x - origin!.x) + Math.abs(cell.y - origin!.y) <= 2
    );
    expect(destination).to.exist;

    const result = manager.performAction(player.id, 'hero_elsa_von_trap', {
      optionIndex: 1,
      target: { origin, destination },
    });

    expect(result).to.equal(true);
    expect(origin!.hasTrap).to.equal(false);
    expect(destination!.hasTrap).to.equal(true);
    expect(destination!.structureOwner).to.equal(player);
  });

  it('keeps Split Up unavailable when the opponent shares the room even if another game is globally active', () => {
    const runtime = createRuntimeGame({ humanNames: ['P1', 'P2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    const gymCells = board.getCellsInRoom('Gymnasium').filter((cell: any) => cell.isEmpty && !cell.isHole);
    gymCells[0].setPlayer(player);
    gymCells[1].setPlayer(opponent);
    player.gold = 10;
    player.addCard({ id: 'split_up', cardId: 'split_up', name: 'Split Up' });
    runtime.gameManager.startPlayerTurn();

    createRuntimeGame({ humanNames: ['Other Game'], cpuCount: 0 });

    expect(CardProcessor.get('split_up')!.canPlay(player, board)).to.equal(false);
    expect(runtime.gameManager.performAction(player.id, 'split_up', {})).to.equal(false);
    expect(player.currSP).to.equal(0);
    expect(player.hand.cards.some((card: any) => card.cardId === 'split_up')).to.equal(true);
  });

  it('spawns Nurse C-Action randomly in the current room without a target choice', () => {
    const runtime = createRuntimeGame({ humanNames: ['Nurse'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    runtime.gameManager.selectHero(player.id, HeroId.ANITA_BANDAGE);
    const roomCell = board.getCellsInRoom('Gymnasium').find((cell: any) => cell.isEmpty && !cell.isHole)!;
    roomCell.setPlayer(player);

    const nurseAction = player.actionManager.getAllActions().find((action: any) => action.id === 'hero_anita_bandage')!;
    const spawnOption = nurseAction.options.find((option: any) => option.id === 'nurse_spawn')!;
    const beforeZombies = board.getAllZombies().length;
    const beforeCP = player.currCP;
    const beforeSP = player.currSP;
    const originalRandom = Math.random;
    Math.random = () => 0;
    let result: any;
    try {
      expect(spawnOption.targetType).to.equal('none');
      expect(spawnOption.canUse(player, board)).to.equal(true);
      result = spawnOption.execute(player, board);
    } finally {
      Math.random = originalRandom;
    }

    expect(result.success).to.equal(true);
    expect(board.getAllZombies().length).to.equal(beforeZombies + 1);
    expect(board.getAllZombies().every((cell: any) => cell.roomId === 'Gymnasium')).to.equal(true);
    expect(player.currCP).to.equal(beforeCP + 1);
    expect(player.currSP).to.equal(beforeSP + 2);
  });

  it('allows Nurse N-Action to target the other player when both players are in the Gym', () => {
    const runtime = createRuntimeGame({ humanNames: ['Nurse', 'Patient'], cpuCount: 0 });
    const [player, target] = runtime.players;
    const board = runtime.game.board;
    runtime.gameManager.selectHero(player.id, HeroId.ANITA_BANDAGE);
    const gymCells = board.getCellsInRoom('Gymnasium').filter((cell: any) => cell.isEmpty && !cell.isHole);
    gymCells[0].setPlayer(player);
    gymCells[1].setPlayer(target);
    target.currHealth = 3;
    runtime.gameManager.startPlayerTurn();

    const nurseAction = player.actionManager.getAllActions().find((action: any) => action.id === 'hero_anita_bandage')!;
    const healOption = nurseAction.options.find((option: any) => option.id === 'nurse_heal')!;
    const result = runtime.gameManager.performAction(player.id, nurseAction.id, { optionIndex: 0, target });

    expect(healOption.canUse(player, board, target)).to.equal(true);
    expect(result).to.equal(true);
    expect(target.currHealth).to.equal(4);
  });

  it('keeps locker choices available until the setup is confirmed', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const manager = runtime.gameManager;

    const heroPicked = manager.selectHero(player.id, HeroId.ANITA_BANDAGE);
    expect(heroPicked).to.equal(true);
    expect(player.availableLockers.length).to.be.greaterThan(0);

    manager.setTemporaryLockerSelection(player.id, player.availableLockers[0].id);
    expect(player.availableLockers.length).to.be.greaterThan(0);
    expect(player.tempSelectedLockers).to.deep.equal([player.availableLockers[0].id]);

    const confirmed = manager.confirmLockerSelection(player.id);
    expect(confirmed).to.equal(true);
    expect(player.availableLockers.length).to.equal(0);
  });

  it('keeps a played card in hand while its effect resolves, then moves it to the played pile', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const playedCard = {
      id: 'test-just-played-card-1',
      cardId: 'test-just-played-card',
      name: 'Test Just Played Card',
      cost: 0,
      image: 'test.png',
      targetType: 'none',
    };
    const otherCard = {
      id: 'test-other-card-1',
      cardId: 'test-other-card',
      name: 'Other Card',
      cost: 0,
      image: 'test.png',
      targetType: 'none',
    };

    player.hand.cards = [playedCard, otherCard];

    CardProcessor.register({
      id: 'test-just-played-card',
      name: 'Test Just Played Card',
      cost: 0,
      image: 'test.png',
      targetType: 'none',
      canPlay: () => true,
      getValidTargets: () => [],
      isValidTarget: () => true,
      execute: (p: any) => {
        expect(p.hand.cards.some((card: any) => card.id === playedCard.id)).to.equal(true);
        return { success: true, message: 'ok' };
      },
      expectedValue: () => 0,
    });

    const played = runtime.game.playCard(playedCard.id, player);
    expect(played).to.equal(true);
    expect(player.hand.cards.some((card: any) => card.id === playedCard.id)).to.equal(false);
    expect(player.hand.playedCards.some((card: any) => card.id === playedCard.id)).to.equal(true);
  });

  it('resolves path targets to the full path when a highlighted final tile is clicked', () => {
    const path = [
      { id: 'start', x: 1, y: 1 },
      { id: 'mid', x: 2, y: 1 },
      { id: 'end', x: 3, y: 1 },
    ];
    const validTargets = [path, [{ x: 5, y: 5 }]];

    const resolved = resolveTargetSelection(validTargets, { x: 3, y: 1 });

    expect(resolved).to.deep.equal(path);
  });

  it('accepts a terminal cell click for a path card and resolves it to the matching full path before validation', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    start.setPlayer(player);
    player.gold = 30;

    const pathInfo = require('../src/game/actions/MovementUtilities').MovementUtil.getValidPaths(board, player, 2, true, false)
      .find((entry: any) => entry.steps === 2);

    expect(pathInfo).to.exist;

    const terminalCell = pathInfo!.finalCell;
    const result = CardProcessor.playCard('extra_movement', player, board, runtime.game, { x: terminalCell.x, y: terminalCell.y });

    expect(result.success).to.equal(true);
    expect(board.getPlayerPosition(player)?.x).to.equal(terminalCell.x);
    expect(board.getPlayerPosition(player)?.y).to.equal(terminalCell.y);
  });

  it('does not leave the phase stuck in zombie_phase after the last living player is eliminated', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.isEliminated = true;
    runtime.game._phase = 'player_turn';
    runtime.game._currentPlayerIndex = 0;

    (runtime.game as any).runZombiePhase = (options: any) => {
      options?.onComplete?.();
    };

    (runtime.gameManager as any).endPlayerTurn();

    expect(runtime.game.isGameOver()).to.equal(true);
    expect(runtime.gameManager.getPhase()).to.equal('game_over');
  });

  it('limits trap and barricade placement to a 3-tile max distance from the current player', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const validTargets = board.getAllCells().filter((cell: any) => {
      if (!cell.isEmpty || cell.isHole) return false;
      const dist = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
      return dist === 3;
    });
    expect(validTargets.length).to.be.greaterThan(1);
    const [validTrap, validBarricade] = validTargets;
    const invalid = board.getAllCells().find((cell: any) => {
      if (!cell.isEmpty || cell.isHole) return false;
      const dist = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
      return dist > 3;
    })!;

    start.setPlayer(player);
    player.gold = 50;

    const closeTrap = require('../src/game/actions/ActionHandler').ActionHandlers.placeTrap(player, board, validTrap);
    const closeBarricade = require('../src/game/actions/ActionHandler').ActionHandlers.placeBarricade(player, board, validBarricade);

    expect(closeTrap.success).to.equal(true);
    expect(closeBarricade.success).to.equal(true);

    const farTrap = require('../src/game/actions/ActionHandler').ActionHandlers.placeTrap(player, board, invalid);
    const farBarricade = require('../src/game/actions/ActionHandler').ActionHandlers.placeBarricade(player, board, invalid);

    expect(farTrap.success).to.equal(false);
    expect(farBarricade.success).to.equal(false);
  });

  it('rejects out-of-range trap and barricade placements from the authoritative action path', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const farCell = board.getAllCells().find((cell: any) => {
      if (!cell.isEmpty || cell.isHole || cell === start) return false;
      const dist = Math.abs(cell.x - start.x) + Math.abs(cell.y - start.y);
      return dist > 3;
    })!;

    start.setPlayer(player);
    player.gold = 50;
    runtime.game._phase = 'player_turn';
    runtime.game._currentPlayerIndex = 0;

    expect(runtime.game.executeAction('trap', { target: { x: farCell.x, y: farCell.y } })).to.equal(false);
    expect(runtime.game.executeAction('barricade', { target: { x: farCell.x, y: farCell.y } })).to.equal(false);
  });

  it('ignores bait targets when the zombie is outside the bait owner’s effective radius', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const zombieCell = board.getCell(0, 0)!;
    const playerCell = board.getCell(1, 1)!;
    const baitCell = board.getCell(4, 0)!;

    expect(playerCell.isHole).to.equal(false);
    playerCell.setPlayer(player);
    baitCell.setBait(player);
    zombieCell.setZombie('radius-zombie', 1);

    const zombieManager = runtime.game.ensureZombieManager();
    const target = (zombieManager as any).findTarget(zombieCell);

    expect(target).to.deep.equal({ x: playerCell.x, y: playerCell.y, type: 'player' });
  });

  it('lets a player jump over their own trap when the tile behind it is empty and they can pay the toll', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const middle = board.getCell(2, 1)!;
    const target = board.getCell(3, 1)!;

    start.setPlayer(player);
    middle.setTrap(player);
    player.gold = 20;

    const result = require('../src/game/actions/ActionHandler').ActionHandlers.move(player, board, target, true);

    expect(result.success).to.equal(true);
    expect(board.getPlayerPosition(player)?.x).to.equal(3);
    expect(board.getPlayerPosition(player)?.y).to.equal(1);
  });

  it('excludes the card being played from discard selections and refuses empty discard choices', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const currentCard = { id: 'play-card-1', cardId: 'hidden_report_card', name: 'Hidden Report Card', cost: 0 };
    const otherCard = { id: 'other-card-1', cardId: 'scrap_materials', name: 'Scrap Materials', cost: 1 };
    player.hand.cards = [currentCard, otherCard];
    (player as any)._pendingDiscardExclusionId = currentCard.id;

    const events: any[] = [];
    runtime.game.on('requestDiscardSelection', (payload: any) => events.push(payload));

    const result = CardDrawer.discardDraw(player, 0);
    expect(result.success).to.equal(true);
    expect(events[0].cards.map((card: any) => card.id)).to.deep.equal([otherCard.id]);

    player.hand.cards = [currentCard];
    (player as any)._pendingDiscardExclusionId = currentCard.id;
    const emptyResult = CardDrawer.discardDraw(player, 0);
    expect(emptyResult.success).to.equal(false);
    expect(emptyResult.message).to.match(/no valid.*discard|cannot discard/i);
  });

  it('applies the selected hero’s prescribed melee, barricade, and trap effectiveness instead of the default 3s', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const selected = runtime.gameManager.selectHero(player.id, 'barry_cade' as any);

    expect(selected).to.equal(true);
    expect(player.rawMeleeSuccessRate).to.equal(4);
    expect(player.rawBarricadeSuccessRate).to.equal(1);
    expect(player.rawTrapSuccessRate).to.equal(3);
    expect(player.currHealth).to.equal(4);
  });

  it('queues and resolves stacked start actions after hero placement', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    runtime.gameManager.selectHero(player.id, HeroId.BARRY_CADE);
    player.selectedLockerStartAction = 'barricade';
    player.pendingStartActions = [{ type: 'barricade', description: 'Place a free barricade' }, { type: 'barricade', description: 'Place a free barricade' }];

    const heroCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !cell.hasPlayer)!;
    expect(runtime.gameManager.placeHero(player.id, heroCell.x, heroCell.y)).to.equal(true);
    expect(player.pendingStartActions.length).to.equal(2);

    const firstTarget = runtime.game.board.getAllCells().find((cell: any) => {
      if (!cell.isEmpty || cell.isHole || cell.hasPlayer || cell.hasZombie) return false;
      return Math.abs(cell.x - heroCell.x) + Math.abs(cell.y - heroCell.y) <= 2;
    })!;

    expect(runtime.gameManager.resolveStartAction(player.id, firstTarget)).to.equal(true);
    expect(player.pendingStartActions.length).to.equal(1);

    const secondTarget = runtime.game.board.getAllCells().find((cell: any) => {
      if (!cell.isEmpty || cell.isHole || cell.hasPlayer || cell.hasZombie || cell.id === firstTarget.id) return false;
      return Math.abs(cell.x - heroCell.x) + Math.abs(cell.y - heroCell.y) <= 2;
    })!;

    expect(runtime.gameManager.resolveStartAction(player.id, secondTarget)).to.equal(true);
    expect(player.pendingStartActions.length).to.equal(0);
  });

  it('prevents a player from placing their hero more than once', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const [firstCell, secondCell] = runtime.game.board.getAllCells()
      .filter((cell: any) => cell.isEmpty && !cell.isHole && !cell.hasPlayer);

    expect(runtime.gameManager.placeHero(player.id, firstCell.x, firstCell.y)).to.equal(true);
    expect(runtime.gameManager.placeHero(player.id, secondCell.x, secondCell.y)).to.equal(false);
    const placedAt = runtime.game.board.getPlayerPosition(player);
    expect(placedAt?.x).to.equal(firstCell.x);
    expect(placedAt?.y).to.equal(firstCell.y);
  });

  it('eliminates a trapped player with no legal escape tiles and allows the nightly draft', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1', 'Player 2'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const current = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    current.setPlayer(player);
    player.currHealth = 3;

    const adjacent = board.getNeighbors(current);
    for (const cell of adjacent) {
      if (!cell.isHole && cell.isEmpty) {
        cell.setZombie(`blocked-zombie-${cell.id}`, 0);
      }
    }

    const zombieSource = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !board.getNeighbors(current).includes(cell))!;
    if (zombieSource) {
      zombieSource.setZombie('test-attack-zombie', 0);
    }

    (runtime.game as any).handlePlayerAttacked(player.id, zombieSource.x, zombieSource.y, zombieSource);

    expect((runtime.game as any)._escapeState).to.equal(null);
    expect(runtime.game.hasActiveEscapeState()).to.equal(false);
    expect(player.isEliminated).to.equal(true);
    expect(player.currHealth).to.equal(0);

    runtime.game._phase = 'zombie_phase';
    runtime.gameManager.beginNightlyDraft();
    expect(runtime.gameManager.getPhase()).to.equal('draft');
  });

  it('counts a targeted card play against the action budget', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const human = runtime.players.find((player: any) => !player.isBot)!;
    const cpu = runtime.players.find((player: any) => player.isBot)!;
    runtime.gameManager.selectHero(human.id, 'barry_cade' as any);
    runtime.gameManager.startPlayerTurn();

    const customId = 'targeted_card_budget_test';
    const targetCard = {
      id: customId,
      name: 'Targeted Test Card',
      cost: 0,
      image: 'test',
      targetType: 'player' as const,
      canPlay: () => true,
      getValidTargets: () => [cpu],
      isValidTarget: () => true,
      execute: () => ({ success: true, message: 'ok' }),
      expectedValue: () => 0,
    };

    CardProcessor.register(targetCard as any);
    human.hand.cards = [{ id: 'card-budget-test', cardId: customId, name: 'Targeted Test Card', cost: 0 }];
    const result = runtime.gameManager.performAction(human.id, customId, { target: cpu });

    expect(result).to.equal(true);
    expect(runtime.gameManager.getActionsRemaining()).to.equal(2);
    expect(runtime.gameManager.getActionsUsed()).to.equal(1);
  });

  it('tallies final scores as SP + max(CP, NP) and ends the game only when all players are eliminated', () => {
    const one = new Player('one', 'One');
    const two = new Player('two', 'Two');

    one.currSP = 8;
    one.currNP = 5;
    one.currCP = 3;

    two.currSP = 7;
    two.currNP = 2;
    two.currCP = 10;

    const game = new Game([one, two]);
    const scores = game.getFinalScores();

    expect(scores.map((entry) => entry.playerId)).to.deep.equal(['two', 'one']);
    expect(scores[0].score).to.equal(17);
    expect(scores[1].score).to.equal(13);
    expect(game.isGameOver()).to.equal(false);

    one.isEliminated = true;
    expect(game.isGameOver()).to.equal(false);

    two.isEliminated = true;
    expect(game.isGameOver()).to.equal(true);
  });

  it('keeps hallway cells walkable instead of holes and still labels them as hallway tiles', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const hallwayCells = runtime.game.board.getAllCells().filter((cell: any) => cell.roomId === 'Hallway');
    expect(hallwayCells.length).to.be.greaterThan(0);
    expect(hallwayCells.some((cell: any) => cell.isHole)).to.equal(false);
    expect(hallwayCells.every((cell: any) => !cell.isHole)).to.equal(true);
  });

  it('targets the lowest-SP opponent with Skipping Lunch Today and is unavailable without one', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    player.currSP = 30;
    opponent.currSP = 10;
    const card = CardProcessor.get('skipping_lunch_today')!;

    expect(card.canPlay(player, runtime.game.board)).to.equal(true);
    expect(card.getValidTargets?.(player, runtime.game.board)).to.deep.equal([opponent]);

    const soloRuntime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const soloPlayer = soloRuntime.players[0];
    expect(card.canPlay(soloPlayer, soloRuntime.game.board)).to.equal(false);
    expect(card.getValidTargets?.(soloPlayer, soloRuntime.game.board)).to.deep.equal([]);
  });

  it('logs jump toll refunds to the structure owner and avoids duplicate toll text', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const middle = board.getCell(2, 1)!;
    const target = board.getCell(3, 1)!;

    start.setPlayer(player);
    middle.setTrap(player);
    player.gold = 20;

    const result = require('../src/game/actions/ActionHandler').ActionHandlers.move(player, board, target, true);
    expect(result.success).to.equal(true);
    expect(result.message).to.include(`${player.name} receives 1 gold`);
    expect(result.message).to.not.include('(paid 2 gold toll) (paid 2 gold toll)');
  });

  it('queues a flex-point choice instead of auto-awarding CP/NP when traps are adjacent at night end', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const game = runtime.game;
    const playerCell = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const adjacentTrapCell = board.getNeighbors(playerCell).find((cell: any) => cell.isEmpty && !cell.isHole)!;

    playerCell.setPlayer(player);
    adjacentTrapCell.setTrap(player);
    player.currCP = 0;
    player.currNP = 0;

    game.ensureZombieManager();
    (game.zombieManager as any).awardFlexPoints();

    expect(player.currCP).to.equal(0);
    expect(player.currNP).to.equal(0);
    expect(game.getPendingFlexPointSelections().some((entry: any) => entry.playerId === player.id && entry.count === 1)).to.equal(true);
  });

  it('rejects a stale coordinate target for barricade placement and invalid path card targets', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const occupiedTarget = board.getAllCells().find((cell: any) => cell !== start && cell.isEmpty && !cell.isHole)!;
    occupiedTarget.setZombie('stale-zombie', 1);

    start.setPlayer(player);
    player.gold = 50;

    const staleBarricade = runtime.game.executeAction('barricade', { target: { x: occupiedTarget.x, y: occupiedTarget.y } });
    expect(staleBarricade).to.equal(false);

    const invalidPathResult = CardProcessor.playCard('extra_movement', player, board, runtime.game, { x: occupiedTarget.x, y: occupiedTarget.y });
    expect(invalidPathResult.success).to.equal(false);
  });

  it('executes Extra Movement along the selected path without rejecting the starting tile', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    start.setPlayer(player);
    player.gold = 30;

    const pathInfo = require('../src/game/actions/MovementUtilities').MovementUtil.getValidPaths(board, player, 2, true, false)
      .find((entry: any) => entry.steps === 2);

    expect(pathInfo).to.exist;
    const serializedPath = pathInfo!.path.map((cell: any) => ({ x: cell.x, y: cell.y }));
    const result = CardProcessor.playCard('extra_movement', player, board, runtime.game, serializedPath);
    expect(result.success).to.equal(true);
    expect(board.getPlayerPosition(player)?.x).to.equal(pathInfo!.finalCell.x);
    expect(board.getPlayerPosition(player)?.y).to.equal(pathInfo!.finalCell.y);
  });

  it('executes Extra Movement through the authoritative action manager and spends one action', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const manager = runtime.gameManager;
    const start = board.getCell(1, 1)!;
    start.setPlayer(player);
    player.gold = 30;
    player.hand.cards = [{ id: 'test-extra-movement', cardId: 'extra_movement', name: 'Extra Movement', cost: 1 }];
    manager.startPlayerTurn();

    const pathInfo = MovementUtil.getValidPaths(board, player, 2, true, false).find((entry: any) => entry.steps === 2);
    expect(pathInfo).to.exist;
    const serializedPath = pathInfo!.path.map((cell: any) => ({ x: cell.x, y: cell.y }));
    expect(manager.performAction(player.id, 'test-extra-movement', { target: serializedPath })).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(pathInfo!.finalCell.id);
    expect(manager.getActionsRemaining()).to.equal(2);
  });

  it('executes Panic Run along a serialized three-step route without obstacle jumps', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(4, 4)!;
    start.setPlayer(player);
    board.getCell(5, 4)!.setZombie('panic-run-zombie', 1);
    player.gold = 30;

    const pathInfo = MovementUtil.getValidPaths(board, player, 3, true, false).find((entry: any) => entry.steps === 3);
    expect(pathInfo).to.exist;
    const serializedPath = pathInfo!.path.map((cell: any) => ({ x: cell.x, y: cell.y }));
    const result = CardProcessor.playCard('panic_run', player, board, runtime.game, serializedPath);

    expect(result.success).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(pathInfo!.finalCell.id);
  });

  it('makes Popularity playable with four barricades total across all players', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    player.gold = 10;
    const cells = board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole).slice(0, 4);
    const popularity = CardProcessor.get('popularity')!;

    cells.slice(0, 2).forEach((cell: any) => cell.setBarricade(player));
    cells.slice(2, 3).forEach((cell: any) => cell.setBarricade(opponent));
    expect(CardProcessor.canPlayCard(popularity, player, board, runtime.game)).to.equal(false);
    cells.slice(3).forEach((cell: any) => cell.setBarricade(opponent));
    expect(CardProcessor.canPlayCard(popularity, player, board, runtime.game)).to.equal(true);
  });

  it('refunds the owning player when they jump over their own barricade or trap', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const start = board.getCell(1, 1)!;
    const middle = board.getCell(2, 1)!;
    const target = board.getCell(3, 1)!;

    start.setPlayer(player);
    middle.setTrap(player);
    player.gold = 20;

    const result = require('../src/game/actions/ActionHandler').ActionHandlers.move(player, board, target, true);
    expect(result.success).to.equal(true);
    expect(player.gold).to.equal(16);
  });

  it('closes the human nightly draft after a purchase round and keeps the unpurchased cards in the player discard pile instead of the shared deck', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 40;
    player.hand.cards = [];
    player.draftCards = [
      { id: 'draft-a', cardId: 'draft-a', name: 'Draft A', cost: 4 },
      { id: 'draft-b', cardId: 'draft-b', name: 'Draft B', cost: 4 },
      { id: 'draft-c', cardId: 'draft-c', name: 'Draft C', cost: 4 },
      { id: 'draft-d', cardId: 'draft-d', name: 'Draft D', cost: 4 },
    ];

    const beforeDiscard = runtime.game.cardManager.getGameDiscardSize();
    const result = runtime.gameManager.purchaseDraftCard(player.id, [player.draftCards[0], player.draftCards[1]]);

    expect(result).to.equal(true);
    expect(player.draftCards.length).to.equal(0);
    expect(player.hand.cards.some((card: any) => card.id === 'draft-a' || card.id === 'draft-b')).to.equal(true);
    expect(player.discardPile.some((card: any) => card.id === 'draft-c' || card.id === 'draft-d')).to.equal(true);
    expect(runtime.game.cardManager.getGameDiscardSize()).to.equal(beforeDiscard);
    expect(runtime.game.phase).to.equal('player_turn');
  });

  it('starts a fresh nightly draft offer instead of reusing stale cards from the previous offer', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 40;
    player.hand.cards = [];
    player.draftCards = [
      { id: 'stale-a', cardId: 'stale-a', name: 'Stale A', cost: 4 },
      { id: 'stale-b', cardId: 'stale-b', name: 'Stale B', cost: 4 },
    ];

    runtime.gameManager.startDraftPhase();

    expect(player.draftCards.length).to.equal(4);
    expect(player.draftCards.some((card: any) => card.id === 'stale-a' || card.id === 'stale-b')).to.equal(false);
  });

  it('closes the human nightly draft after a purchase round without recycling stale offer cards back into the shared deck', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 40;
    player.hand.cards = [];
    player.draftCards = [];

    runtime.gameManager.startDraftPhase();
    expect(player.draftCards.length).to.equal(4);

    const beforeOffer = player.draftCards.map((card: any) => card.id);
    const [firstChoice, secondChoice] = [...player.draftCards];
    const beforeDiscard = runtime.game.cardManager.getGameDiscardSize();
    const purchased = runtime.gameManager.purchaseDraftCard(player.id, [firstChoice, secondChoice]);

    expect(purchased).to.equal(true);
    expect(player.draftCards.length).to.equal(0);
    expect(player.hand.cards.some((card: any) => card.id === firstChoice.id || card.id === secondChoice.id)).to.equal(true);
    expect(player.discardPile.some((card: any) => card.id === beforeOffer[2] || card.id === beforeOffer[3])).to.equal(true);
    expect(runtime.game.cardManager.getGameDiscardSize()).to.equal(beforeDiscard);
    expect(runtime.game.phase).to.equal('player_turn');
    expect(beforeOffer.some((id: string) => player.draftCards.some((card: any) => card.id === id))).to.equal(false);
  });

  it('gives gold to all players with Hallway Hustler when bait is placed', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1', 'Player 2'],
      cpuCount: 0,
    });

    const [p1, p2] = runtime.players;
    p1.gold = 20;
    p2.gold = 12;

    p1.heroId = 'halway_hustler' as any;
    p1.baitGlobalRefund = true;
    p2.baitGlobalRefund = false;

    const target = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const result = require('../src/game/actions/StructurePlacement').StructurePlacement.placeBaitWithEffects(runtime.game.board, p2, target);

    expect(result.success).to.equal(true);
    expect(p1.gold).to.equal(21);
    expect(p2.gold).to.equal(12);
  });

  it('lets bot players resolve nightly draft cards in the background instead of waiting on the human draft UI', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
    });

    const cpu = runtime.players.find((player: any) => player.isBot)!;
    cpu.heroId = 'mike_u_strong' as any;
    cpu.gold = 20;
    cpu.hand.cards = [];
    cpu.draftCards = [
      { id: 'draft-card-1', cardId: 'long_jump', name: 'Long Jump', cost: 2 },
      { id: 'draft-card-2', cardId: 'scrap_materials', name: 'Scrap Materials', cost: 1 },
    ];

    runtime.gameManager.startDraftPhase();

    expect(cpu.draftCards.length).to.equal(0);
    expect(cpu.hand.cards.some((card: any) => card.cardId === 'long_jump' || card.cardId === 'scrap_materials')).to.equal(true);
  });

  it('awards trap-kill SP but not SP when barricades break', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const trapCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    const beforeTrapSP = player.currSP;

    const trapResult = require('../src/game/actions/StructurePlacement').StructurePlacement.onTrapKill(player, runtime.game.board, trapCell);
    expect(trapResult.success).to.equal(true);
    expect(player.currSP).to.equal(beforeTrapSP + 1);

    const barricadeCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole)!;
    barricadeCell.setBarricade(player);
    const beforeBarricadeSP = player.currSP;

    const barricadeResult = require('../src/game/actions/StructurePlacement').StructurePlacement.onBarricadeDestroyed(player, runtime.game.board, barricadeCell);
    expect(barricadeResult.success).to.equal(true);
    expect(player.currSP).to.equal(beforeBarricadeSP);

    player.heroId = HeroId.ELSA_VON_TRAP;
    const beforeElsaTrapSP = player.currSP;
    const elsaTrapResult = require('../src/game/actions/StructurePlacement').StructurePlacement.onTrapKill(player, runtime.game.board, trapCell);
    expect(elsaTrapResult.spEarned).to.equal(2);
    expect(player.currSP).to.equal(beforeElsaTrapSP + 2);
  });

  it('allows a move to jump over a barricade with a 2-gold toll', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 20;
    const board = runtime.game.board;

    const start = board.getCell(1, 1)!;
    const mid = board.getCell(2, 1)!;
    const target = board.getCell(3, 1)!;

    start.setPlayer(player);
    mid.setBarricade(player);
    const beforeGold = player.gold;

    const result = require('../src/game/actions/ActionHandler').ActionHandlers.move(player, board, target, true);

    expect(result.success).to.equal(true);
    expect(player.gold).to.equal(beforeGold - 4);
    expect(board.getPlayerPosition(player)?.x).to.equal(3);
    expect(board.getPlayerPosition(player)?.y).to.equal(1);
  });

  it('prompts for flex-point conversion before the nightly draft begins', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const events: any[] = [];
    runtime.game.on('requestFlexPointSelection', (payload: any) => events.push(payload));

    runtime.game.registerFlexPoints(player.id, 3);
    runtime.gameManager.resolvePendingFlexPoints();

    expect(events.length).to.equal(1);
    expect(events[0].count).to.equal(3);

    const chosen = runtime.gameManager.selectFlexPointChoice(player.id, 'NP');
    expect(chosen).to.equal(true);
    expect(player.currNP).to.equal(3);
  });

  it('preserves pending flex-point choices in a serialized two-player game snapshot', () => {
    const runtime = createRuntimeGame({ humanNames: ['P1', 'P2'], cpuCount: 0 });
    const player = runtime.players[0];
    runtime.game.registerFlexPoints(player.id, 2);

    const hydrated = hydrateGame(JSON.parse(JSON.stringify(runtime.game)));

    expect(hydrated.getPendingFlexPointSelections()).to.deep.include({
      playerId: player.id,
      count: 2,
      options: ['NP', 'CP'],
    });
  });

  it('emits a flex-point selection request immediately when points are awarded, not only during nightly draft', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const events: any[] = [];
    runtime.game.on('requestFlexPointSelection', (payload: any) => events.push(payload));

    runtime.game.registerFlexPoints(player.id, 1);

    expect(events.length).to.equal(1);
    expect(events[0].playerId).to.equal(player.id);
    expect(events[0].count).to.equal(1);
  });

  it('replays an outstanding flex-point request when the game resolves pending points again', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const events: any[] = [];
    runtime.game.on('requestFlexPointSelection', (payload: any) => events.push(payload));

    runtime.game.registerFlexPoints(player.id, 1);
    runtime.game.resolvePendingFlexPoints();

    expect(events.length).to.equal(2);
    expect(events[0].count).to.equal(1);
    expect(events[1].count).to.equal(1);
  });

  it('orders zombie movement by closest target before distant zombies and blocks draft start while flex remains pending', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const playerCell = board.getCell(6, 8)!;
    const nearCell = board.getCell(7, 8)!;
    const farCell = board.getCell(2, 2)!;

    playerCell.setPlayer(player);
    nearCell.setZombie('near-zombie', 1);
    farCell.setZombie('far-zombie', 1);

    const zombieManager = runtime.game.ensureZombieManager();
    const turnOrder = (zombieManager as any).getZombieTurnOrder();
    expect(turnOrder.map((cell: any) => `${cell.x},${cell.y}`)).to.deep.equal(['7,8', '2,2']);

    runtime.game.registerFlexPoints(player.id, 2);
    (runtime.gameManager as any).setPhase('zombie_phase');
    runtime.gameManager.beginNightlyDraft();
    expect(runtime.gameManager.getPhase()).to.equal('zombie_phase');
  });

  it('uses the full remaining zombie step budget instead of stopping after the first move when the player is within range', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const playerCell = board.getCell(1, 1)!;
    const zombieCell = board.getCell(3, 1)!;

    playerCell.setPlayer(player);
    zombieCell.setZombie('range-zombie', 3);

    const zombieManager = runtime.game.ensureZombieManager();
    zombieManager.zombiePhase(7, { async: false });

    expect(player.currHealth).to.equal(2);
    expect(runtime.game.getCurrentPlayer()).to.equal(player);
  });

  it('keeps a target-required card in targeting mode without consuming a turn', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 20;
    player.hand.cards = [{ id: 'move-test-card', cardId: 'long_jump', name: 'Long Jump', cost: 10 }];
    runtime.game._currentPlayerIndex = 0;

    const beforeActions = runtime.gameManager.getActionsRemaining();
    const actionResult = runtime.gameManager.performAction(player.id, 'long_jump', {});

    expect(actionResult).to.equal(true);
    expect(runtime.game.targetingCardId).to.equal('long_jump');
    expect(runtime.gameManager.getActionsRemaining()).to.equal(beforeActions);
  });

  it('keeps preview starting cards out of the live hand until the player purchases them', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    expect(player.availableStartingCards.length).to.equal(9);
    expect(player.hand.cards.length).to.equal(0);
    expect(player.hand.cards.some((card: any) => card.id === player.availableStartingCards[0]?.id)).to.equal(false);
  });

  it('auto-places a CPU hero when its sequential placement turn begins', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const human = runtime.players.find((p: any) => !p.isBot)!;
    const cpu = runtime.players.find((p: any) => p.isBot)!;

    const heroId = human.availableHeroes.find((hero: any) => hero.startBonus === 'none')?.id ?? human.availableHeroes[0].id;
    human.tempHeroId = heroId;
    expect(runtime.gameManager.confirmHeroSelection(human.id)).to.equal(true);

    const lockerId = human.availableLockers.find((locker: any) => !locker.startAction || locker.startAction === 'none')?.id ?? human.availableLockers[0].id;
    runtime.gameManager.setTemporaryLockerSelection(human.id, lockerId);
    expect(runtime.gameManager.confirmLockerSelection(human.id)).to.equal(true);

    while (human.availableStartingCards.length > 0) {
      const [nextCard] = human.availableStartingCards;
      expect(runtime.gameManager.purchaseStartingCard(human.id, nextCard)).to.equal(true);
    }

    expect(runtime.gameManager.getPhase()).to.equal('placement');
    expect(runtime.game.getCurrentPlayer()?.id).to.equal(human.id);
    expect(runtime.game.board.getPlayerPosition(cpu)).to.equal(null);

    const humanCell = runtime.game.board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole && !cell.hasPlayer && !cell.hasZombie)!;
    expect(runtime.gameManager.placeHero(human.id, humanCell.x, humanCell.y)).to.equal(true);

    const cpuPos = runtime.game.board.getPlayerPosition(cpu);
    expect(cpuPos).to.not.equal(null);
    expect(cpuPos?.isEmpty).to.equal(false);
  });

  it('caps hero and locker choice pools at 3 cards each', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    expect(runtime.players[0].availableHeroes.length).to.equal(3);
    expect(runtime.players[0].availableLockers.length).to.equal(3);
  });

  it('uses the canonical hole layout from the board setup and keeps zombie movement gated behind an explicit draft start', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const expectedHoles = new Set([
      '0,0', '1,0', '10,0',
      '5,1',
      '4,2', '5,2', '7,2', '7,3',
      '8,2', '9,2',
      '1,3', '2,3', '5,3',
      '2,4', '7,4',
      '8,6', '9,6',
      '2,7', '3,7', '4,7', '6,7', '8,7',
      '3,9', '10,9'
    ]);

    const actualHoles = runtime.game.board.getAllCells()
      .filter(cell => cell.isHole)
      .map(cell => `${cell.x},${cell.y}`)
      .sort();

    expect(actualHoles).to.deep.equal([...expectedHoles].sort());

    const originalPhase = runtime.gameManager.getPhase();
    (runtime.gameManager as any).setPhase('player_turn');
    runtime.gameManager.beginNightlyDraft();
    expect(runtime.gameManager.getPhase()).to.equal('player_turn');
    (runtime.gameManager as any).setPhase('zombie_phase');
    runtime.gameManager.beginNightlyDraft();
    expect(runtime.gameManager.getPhase()).to.equal('draft');
    expect(originalPhase).to.not.equal('draft');
  });

  it('normalizes room aliases so room-based card checks work with Bathroom, Restroom, Closet, and Janitor\'s Closet', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const bathroomCells = runtime.game.board.getCellsInRoom('Bathroom');
    const restroomCells = runtime.game.board.getCellsInRoom('Restroom');
    const closetCells = runtime.game.board.getCellsInRoom('Closet');
    const janitorCells = runtime.game.board.getCellsInRoom("Janitor's Closet");

    expect(restroomCells.length).to.equal(bathroomCells.length);
    expect(janitorCells.length).to.equal(closetCells.length);
    expect(restroomCells.some((cell: any) => cell.roomId === 'Restroom')).to.equal(true);
    expect(janitorCells.some((cell: any) => cell.roomId === "Janitor's Closet")).to.equal(true);
  });

  it('includes the current hand in discard selection requests so the confirm action is available', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.hand.cards = [
      { id: 'card-a', name: 'Card A', cardId: 'card-a', cost: 2 },
      { id: 'card-b', name: 'Card B', cardId: 'card-b', cost: 3 }
    ];

    let payload: any = null;
    runtime.game.on('requestDiscardSelection', (nextPayload: any) => {
      payload = nextPayload;
    });

    CardDrawer.discardDraw(player, 1);

    expect(payload).to.not.equal(null);
    expect(payload.cards.length).to.equal(2);
    expect(payload.cards.map((card: any) => card.id)).to.deep.equal(['card-a', 'card-b']);
  });

  it('treats the specified wall pairs as disconnected', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const blockedPairs = [
      [[6,8],[7,8]],
      [[1,7],[1,8]],
      [[0,5],[0,6]],
      [[1,5],[1,6]],
      [[1,7],[2,7]],
      [[9,6],[9,7]],
      [[8,7],[8,8]],
    ];

    for (const [[x1, y1], [x2, y2]] of blockedPairs) {
      const a = runtime.game.board.getCell(x1, y1);
      const b = runtime.game.board.getCell(x2, y2);
      expect(a).to.not.equal(null);
      expect(b).to.not.equal(null);
      expect(runtime.game.board.getNeighbors(a!).some(cell => cell.x === b!.x && cell.y === b!.y)).to.equal(false);
    }

    const movedFromPairs = [
      [[0,7],[0,8]],
      [[7,9],[8,9]],
      [[1,6],[2,6]],
      [[6,9],[7,9]],
      [[2,6],[3,6]],
      [[2,7],[3,7]],
      [[8,6],[8,7]],
    ];
    for (const [[x1, y1], [x2, y2]] of movedFromPairs) {
      const a = runtime.game.board.getCell(x1, y1);
      const b = runtime.game.board.getCell(x2, y2);
      expect(runtime.game.board.getNeighbors(a!).some(cell => cell.id === b!.id)).to.equal(true);
    }

    for (const cell of runtime.game.board.getAllCells()) {
      for (const neighbor of runtime.game.board.getNeighbors(cell)) {
        expect(cell.isHole).to.equal(neighbor.isHole);
      }
    }
  });

  it('uses the corrected board holes and gym squares', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const expectedHoles = new Set([
      '0,0', '1,0', '10,0',
      '5,1',
      '4,2', '5,2', '7,2', '7,3',
      '8,2', '9,2',
      '1,3', '2,3', '5,3',
      '2,4', '7,4',
      '8,6', '9,6',
      '2,7', '3,7', '4,7', '6,7', '8,7',
      '3,9', '10,9'
    ]);

    const actualHoles = runtime.game.board.getAllCells()
      .filter(cell => cell.isHole)
      .map(cell => `${cell.x},${cell.y}`)
      .sort();

    expect(actualHoles).to.deep.equal([...expectedHoles].sort());

    for (const [x, y] of [[4, 7], [8, 7], [7, 2], [7, 3]]) {
      expect(runtime.game.board.getCell(x, y)?.isHole).to.equal(true);
    }
    for (const [x, y] of [[6, 2], [7, 7]]) {
      expect(runtime.game.board.getCell(x, y)?.roomId).to.equal('Gymnasium');
    }
  });

  it('uses the exact explicit room coordinate map for every room', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const expectedRooms: Record<string, number[][]> = {
      'Science Lab': [[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1],[0,2],[1,2],[2,2],[3,2]],
      'Cafeteria': [[6,0],[7,0],[8,0],[9,0],[6,1],[7,1],[8,1],[9,1],[10,1]],
      'Auditorium': [[8,3],[9,3],[10,3],[8,4],[9,4],[10,4],[8,5],[9,5],[10,5]],
      'Library': [[7,8],[7,9],[8,8],[8,9],[9,7],[9,8],[9,9],[10,7],[10,8]],
      'Lobby': [[4,8],[4,9],[5,7],[5,8],[5,9],[6,9],[6,8]],
      "Principal's Office": [[0,8],[1,8],[1,9],[2,8],[2,9],[3,8],[0,9]],
      "Janitor's Closet": [[0,6],[0,7],[1,6],[1,7]],
      'Restroom': [[0,4],[0,5],[1,4],[1,5]],
      'Hallway': [[10,2],[10,6],[0,3],[5,0]],
    };

    for (const [roomId, coords] of Object.entries(expectedRooms)) {
      const actual = runtime.game.board.getCellsInRoom(roomId).map(cell => [cell.x, cell.y]);
      expect(actual).to.have.deep.members(coords);
    }

    const explicitTiles = new Set<string>(
      Object.values(expectedRooms)
        .flat()
        .map(([x, y]) => `${x},${y}`)
    );

    const unmatchedGymTiles = runtime.game.board.getAllCells().filter(cell => {
      if (cell.isHole) return false;
      const key = `${cell.x},${cell.y}`;
      return !explicitTiles.has(key) && cell.roomId !== 'Gymnasium';
    });

    expect(unmatchedGymTiles).to.deep.equal([]);

    const expectedHoles = new Set([
      '0,0', '1,0', '10,0',
      '5,1',
      '4,2', '5,2', '7,2', '7,3',
      '8,2', '9,2',
      '1,3', '2,3', '5,3',
      '2,4', '7,4',
      '8,6', '9,6',
      '2,7', '3,7', '4,7', '6,7', '8,7',
      '3,9', '10,9'
    ]);

    const actualHoles = runtime.game.board.getAllCells()
      .filter(cell => cell.isHole)
      .map(cell => `${cell.x},${cell.y}`)
      .sort();

    expect(actualHoles).to.deep.equal([...expectedHoles].sort());
  });

  it('gives 1 SP for trap and barricade placement and 1 SP for surviving the zombie phase', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const startCell = board.getAllCells().find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !!cell.roomId);
    expect(startCell).to.exist;
    startCell!.setPlayer(player);

    const trapTarget = board.getNeighbors(startCell!).find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !!cell.roomId);
    const barricadeTarget = board.getAllCells().find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !!cell.roomId && cell !== trapTarget && cell !== startCell);

    expect(trapTarget).to.exist;
    expect(barricadeTarget).to.exist;

    player.gold = 50;
    player.currSP = 0;

    const trapBefore = player.currSP;
    const trapResult = ActionHandlers.placeTrap(player, board, trapTarget);
    expect(trapResult.success).to.equal(true);
    expect(player.currSP).to.equal(trapBefore + 1);

    const barricadeBefore = player.currSP;
    const barricadeResult = ActionHandlers.placeBarricade(player, board, barricadeTarget);
    expect(barricadeResult.success).to.equal(true);
    expect(player.currSP).to.equal(barricadeBefore + 1);

    player.isEliminated = false;
    const beforeSurvival = player.currSP;
    runtime.gameManager['afterZombiePhase']();
    expect(player.currSP).to.equal(beforeSurvival + 1);
  });

  it('awards 1 SP for trap kills and 2 SP for melee kills', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const startCell = board.getAllCells().find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !!cell.roomId);
    expect(startCell).to.exist;
    startCell!.setPlayer(player);

    const zombieCell = board.getNeighbors(startCell!).find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !!cell.roomId);
    expect(zombieCell).to.exist;
    zombieCell!.setZombie();

    const trapCell = board.getNeighbors(startCell!).find((cell: any) => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && !cell.hasZombie && !!cell.roomId && cell !== zombieCell);
    expect(trapCell).to.exist;
    trapCell!.setTrap(player);

    player.currSP = 0;
    player.gold = 100;
    const trapResult = StructurePlacement.onTrapKill(player, board, trapCell!);
    expect(trapResult.success).to.equal(true);
    expect(player.currSP).to.equal(1);

    runtime.game.ensureZombieManager();
    zombieCell!.setZombie();
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const meleeBefore = player.currSP;
      const meleeResult = ActionHandlers.melee(player, board, zombieCell!);
      expect(meleeResult.success).to.equal(true);
      expect(player.currSP).to.equal(meleeBefore + 2);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('triggers Social Blur immediately when the NP gain is applied', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 10;
    player.currNP = 1;
    player.currCP = 0;
    player.NPmustCP = false;

    const socialBlur = CardProcessor.get('social_blur')!;
    expect(socialBlur.canPlay(player, runtime.game.board)).to.equal(true);

    const result = socialBlur.execute(player, runtime.game.board);
    expect(result.success).to.equal(true);
    expect(player.gold).to.equal(8);
    expect(player.currNP).to.equal(2);
    expect(player.currCP).to.equal(1);
  });

  it('uses human path distance for Lunch Lady C and charges Halo Effect during the steal', () => {
    const createTestBoard = (centerHole: boolean) => new Board(
      Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) =>
        new BoardCell(`cell-${x}-${y}`, x, y, 'Hallway', '', centerHole && x === 1 && y === 1)
      ))
    );
    const lunchLadyAction = Object.values(AllSpecialActions).find((action: any) =>
      action.options.some((option: any) => option.id === 'lunch_lady_steal')
    )!;
    const stealOptionIndex = lunchLadyAction.options.findIndex((option: any) => option.id === 'lunch_lady_steal');
    const stealOption = lunchLadyAction.options[stealOptionIndex];

    const blockedBoard = createTestBoard(true);
    const blockedPlayer = new Player('blocked-player');
    const blockedTarget = new Player('blocked-target');
    blockedBoard.getCell(0, 1)!.setPlayer(blockedPlayer);
    blockedBoard.getCell(2, 1)!.setPlayer(blockedTarget);
    expect(blockedBoard.getHumanDistance(0, 1, 2, 1).distance).to.equal(4);
    expect(stealOption.canUse(blockedPlayer, blockedBoard, blockedTarget)).to.equal(false);

    const board = createTestBoard(false);
    const player = new Player('lunch-lady');
    const target = new Player('target');
    board.getCell(0, 1)!.setPlayer(player);
    board.getCell(1, 1)!.setPlayer(target);
    player.gold = 0;
    player.CPmustNP = true;
    target.gold = 4;
    player.actionManager.addAction(lunchLadyAction);

    const result = player.actionManager.executeOption(
      player,
      board,
      lunchLadyAction.id,
      stealOptionIndex,
      target
    );

    expect(result.success).to.equal(true);
    expect(player.gold).to.equal(2);
    expect(player.currCP).to.equal(1);
    expect(player.currNP).to.equal(1);
    expect(target.gold).to.equal(0);
  });

  it('requires Social Blur to have more NP than CP', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.gold = 10;
    const canPlay = CardProcessor.get('social_blur')!.canPlay;

    player.currNP = 0;
    player.currCP = 0;
    expect(canPlay(player, runtime.game.board)).to.equal(false);
    player.currNP = 2;
    player.currCP = 2;
    expect(canPlay(player, runtime.game.board)).to.equal(false);
    player.currNP = 3;
    player.currCP = 2;
    expect(canPlay(player, runtime.game.board)).to.equal(true);
  });

  it('prompts Secretary N to keep one card and transfers the other two to the lowest-SP player', () => {
    const runtime = createRuntimeGame({ humanNames: ['Secretary', 'Lowest SP'], cpuCount: 0 });
    const [secretary, recipient] = runtime.players;
    secretary.currSP = 10;
    recipient.currSP = 0;
    secretary.gold = 0;
    recipient.gold = 0;
    const action = (AllSpecialActions as any).dorothy_deckard;
    secretary.actionManager.addAction(action);

    const result = secretary.actionManager.executeOption(secretary, runtime.game.board, action.id, 0);

    expect(result.success).to.equal(true);
    expect(runtime.game.pendingCardSelection).to.include({
      type: 'keep',
      playerId: secretary.id,
      keepCount: 1,
      recipientPlayerId: recipient.id,
      onComplete: 'secretaryDrawGiveComplete',
    });
    const drawn = [...secretary.tempHand];
    expect(drawn).to.have.length(3);
    expect(secretary.hand.cards.some((card: any) => drawn.some((drawnCard: any) => drawnCard.id === card.id))).to.equal(false);

    runtime.game.completeSecretaryDrawGive(secretary, drawn[1].id, recipient.id);

    expect(secretary.hand.cards.map((card: any) => card.id)).to.include(drawn[1].id);
    expect(recipient.hand.cards.map((card: any) => card.id)).to.include.members([drawn[0].id, drawn[2].id]);
    expect(secretary.currNP).to.equal(1);
    expect(runtime.game.pendingCardSelection).to.equal(null);
  });

  it('allows Blind Jump to target an empty cell behind a zombie', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { board } = runtime.game;
    const player = runtime.players[0];
    let route: { start: BoardCell; middle: BoardCell; landing: BoardCell } | undefined;

    for (const start of board.getAllCells()) {
      if (!start.isEmpty || start.isHole) continue;
      for (const direction of [{ dx: 2, dy: 0 }, { dx: -2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 0, dy: -2 }]) {
        const middle = board.getCell(start.x + direction.dx / 2, start.y + direction.dy / 2);
        const landing = board.getCell(start.x + direction.dx, start.y + direction.dy);
        if (middle?.isEmpty && !middle.isHole && landing?.isEmpty && !landing.isHole) {
          route = { start, middle, landing };
          break;
        }
      }
      if (route) break;
    }

    expect(route).to.exist;
    route!.start.setPlayer(player);
    route!.middle.setZombie('blind-jump-test-zombie', 1);

    expect(MovementUtil.canJumpOver(board, player).targetCell).to.equal(route!.landing);
    expect(MovementUtil.getValidJumpTargets(board, player)).to.include(route!.landing);
    expect(MovementUtil.executeJump(board, player, route!.landing).success).to.equal(true);
    expect(route!.middle.hasZombie).to.equal(true);
  });

  it('requires Spatial Swap to have an adjacent occupied cell before it is playable', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { board } = runtime.game;
    const player = runtime.players[0];
    const card = CardProcessor.get('spatial_swap')!;
    player.gold = 12;
    player.currSP = 22;
    const start = board.getAllCells().find((cell: any) => cell.isEmpty && !cell.isHole
      && board.getNeighbors(cell).length > 0
      && board.getNeighbors(cell).every((neighbor: any) => neighbor.isEmpty && !neighbor.isHole))!;
    start.setPlayer(player);

    expect(card.canPlay(player, board, runtime.game)).to.equal(false);
    const target = board.getNeighbors(start).find((cell: any) => cell.isEmpty && !cell.isHole)!;
    target.setZombie('spatial-swap-test-zombie', 1);

    expect(card.canPlay(player, board, runtime.game)).to.equal(true);
    expect(card.getValidTargets?.(player, board, runtime.game)).to.include(target);
  });

  it('pays Crowded Halls once per distinct occupied neighbor along its two-step path', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { board } = runtime.game;
    const player = runtime.players[0];
    const card = CardProcessor.get('crowded_halls')!;
    player.gold = 30;
    const start = board.getAllCells().find(cell => cell.isEmpty && !cell.isHole)!;
    start.setPlayer(player);
    const paths = MovementUtil.getValidPaths(board, player, 2, true, false)
      .filter(pathInfo => pathInfo.path.length === 3)
      .map(pathInfo => pathInfo.path);
    const path = paths.find(candidate => board.getAllCells().some(cell =>
      !candidate.includes(cell)
      && cell.isEmpty
      && !cell.isHole
      && (board.getNeighbors(candidate[1]).includes(cell) || board.getNeighbors(candidate[2]).includes(cell))
    ));
    expect(path).to.exist;

    const occupiedNeighbor = board.getAllCells().find(cell =>
      !path!.includes(cell)
      && cell.isEmpty
      && !cell.isHole
      && (board.getNeighbors(path![1]).includes(cell) || board.getNeighbors(path![2]).includes(cell))
    )!;
    for (const cell of board.getAllCells()) {
      if (cell !== path![0]) cell.clear();
    }
    occupiedNeighbor.setBarricade(player);
    path![0].setPlayer(player);
    const result = card.execute(player, board, path);

    expect(result.success).to.equal(true);
    expect(player.gold).to.equal(26);
    expect(board.getPlayerPosition(player)).to.equal(path![2]);
  });

  it('replaces Gymnastics Training with its unlocked action card after the card is played', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.gold = 20;
    player.currSP = 20;
    player.hand.cards.push({ id: 'gymnastics-training-test', cardId: 'gymnastics_training', name: 'Gymnastics Training' });

    const played = runtime.game.playCard('gymnastics-training-test', player);

    expect(played).to.equal(true);
    expect(player.gold).to.equal(10);
    expect(player.currSP).to.equal(21);
    expect(player.hand.playedCards.some((card: any) => card.id === 'gymnastics-training-test')).to.equal(true);
    expect(player.actionCards.some((card: any) => card._specialOptionId === 'gymnastics_jump')).to.equal(true);
  });

  it('lets Gymnastics Training jump over an opponent or zombie for 2 gold, but not a trap', () => {
    const action = AllSpecialActions['gymnastics_training'].options[0];

    for (const occupant of ['opponent', 'zombie'] as const) {
      const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
      const [player, opponent] = runtime.players;
      const board = runtime.game.board;
      let route: { start: BoardCell; middle: BoardCell; landing: BoardCell } | undefined;

      for (const start of board.getAllCells()) {
        if (!start.isEmpty || start.isHole) continue;
        for (const middle of board.getNeighbors(start)) {
          const dx = middle.x - start.x;
          const dy = middle.y - start.y;
          const landing = board.getCell(start.x + dx * 2, start.y + dy * 2);
          if (middle.isEmpty && landing?.isEmpty && !landing.isHole) {
            route = { start, middle, landing };
            break;
          }
        }
        if (route) break;
      }

      expect(route).to.exist;
      route!.start.setPlayer(player);
      if (occupant === 'opponent') route!.middle.setPlayer(opponent);
      else route!.middle.setZombie('gymnastics-test-zombie', 1);

      expect(action.canUse(player, board, route!.middle)).to.equal(true);
      const startingGold = player.gold;
      const result = action.execute(player, board, route!.middle);
      expect(result.success).to.equal(true);
      expect(player.gold).to.equal(startingGold + 2);
      expect(board.getPlayerPosition(player)?.id).to.equal(route!.landing.id);
    }

    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    const route = board.getAllCells().flatMap((start: BoardCell) =>
      board.getNeighbors(start).map((middle: BoardCell) => {
        const dx = middle.x - start.x;
        const dy = middle.y - start.y;
        const landing = board.getCell(start.x + dx * 2, start.y + dy * 2);
        return start.isEmpty && !start.isHole && middle.isEmpty && landing?.isEmpty && !landing.isHole
          ? { start, middle, landing }
          : null;
      })
    ).find((entry: any) => entry !== null)!;
    route.start.setPlayer(player);
    route.middle.setTrap(player);

    expect(action.canUse(player, board, route.middle)).to.equal(false);
  });

  it('allows Mad Dash to play its full three-step path including the starting cell', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { game } = runtime;
    const player = runtime.players[0];
    player.gold = 10;
    const board = game.board;
    let selectedPath: any[] | undefined;

    for (const start of board.getAllCells()) {
      if (!start.isEmpty || start.isHole) continue;
      start.setPlayer(player);
      selectedPath = MovementUtil.getValidPaths(board, player, 3, true, false)
        .find(route => route.steps === 3)?.path;
      if (selectedPath) break;
      start.clear();
    }

    expect(selectedPath).to.exist;
    expect(selectedPath).to.have.length(4);
    const madDash = CardProcessor.get('mad_dash')!;
    expect(madDash.isValidTarget(player, board, selectedPath)).to.equal(true);
    expect(game.playCard('mad_dash', player, selectedPath)).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(selectedPath[selectedPath.length - 1].id);
    expect(player.gold).to.equal(5);
  });

  it('applies Toe Socks movement discounts outside the gym', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const board = runtime.game.board;
    const current = board.getAllCells().find(cell => !cell.isHole && !cell.hasPlayer && !cell.hasStructure && cell.roomId !== 'Gymnasium')!;
    const target = board.getNeighbors(current).find(cell => !cell.isHole && !cell.hasPlayer && !cell.hasStructure)!;

    current.setPlayer(player);
    player.nongymMovementDiscount = true;
    player.gold = 10;

    const before = player.gold;
    const result = (runtime.game as any).actionHandlers?.move?.(player, board, target, false);
    expect(result?.success).to.equal(true);
    expect(before - player.gold).to.equal(2);
  });

  it('finishes a human draft purchase and leaves the nightly draft window closed instead of refilling it', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 20;
    player.draftCards = [
      { id: 'draft-a', name: 'Draft A', cost: 4 },
      { id: 'draft-b', name: 'Draft B', cost: 4 },
      { id: 'draft-c', name: 'Draft C', cost: 4 },
      { id: 'draft-d', name: 'Draft D', cost: 4 },
    ];

    const beforeDeck = runtime.game.cardManager.getGameDeckSize();
    const result = runtime.gameManager.purchaseDraftCard(player.id, player.draftCards[0]);

    expect(result).to.equal(true);
    expect(player.draftCards.length).to.equal(0);
    expect(player.hand.cards.some(card => card.id === 'draft-a')).to.equal(true);
    expect(runtime.game.cardManager.getGameDeckSize()).to.equal(beforeDeck - 0);
  });

  it('uses a browser-safe base URL when running in a browser-like environment', () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = { location: { origin: 'http://localhost:3002' } };

    try {
      expect(resolveApiBaseUrl()).to.equal('');
    } finally {
      if (typeof originalWindow === 'undefined') {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
    }
  });

  it('rehydrates a plain JSON game payload into a live Game instance', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
      difficultyLevels: ['normal'],
    });

    const raw = JSON.parse(JSON.stringify(runtime.game));
    raw.globalPassives = {};
    const hydrated = hydrateGame(raw);

    expect(hydrated.on).to.be.a('function');
    expect(hydrated.getPlayerById('missing')).to.equal(undefined);
    expect(hydrated.board.getCell(0, 0)).to.not.equal(null);
    expect(hydrated.players[0].name).to.equal('Player 1');
    expect(hydrated.players[0].actionManager).to.exist;
    expect(hydrated.players[0].availableHeroes.length).to.be.greaterThan(0);
    expect(hydrated.players[0].availableLockers.length).to.be.greaterThan(0);
    expect(hydrated.globalPassives).to.be.instanceOf(Set);
  });

  it('restores the live deck and discard state when a game is rehydrated from JSON', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.draftCards = [
      { id: 'draft-1', cardId: 'draft-1', name: 'Draft 1', cost: 4 },
      { id: 'draft-2', cardId: 'draft-2', name: 'Draft 2', cost: 4 },
      { id: 'draft-3', cardId: 'draft-3', name: 'Draft 3', cost: 4 },
    ];
    runtime.game.cardManager.discardGameCard({ id: 'discard-1', cardId: 'discard-1', name: 'Discard 1', cost: 2 });

    const raw = JSON.parse(JSON.stringify(runtime.game));
    const hydrated = hydrateGame(raw);

    expect(hydrated.cardManager.getGameDeckSize()).to.equal(runtime.game.cardManager.getGameDeckSize());
    expect(hydrated.cardManager.getGameDiscardSize()).to.equal(runtime.game.cardManager.getGameDiscardSize());
    expect(hydrated.getPlayerById(player.id)?.draftCards.length).to.equal(player.draftCards.length);
  });

  it('allows a temporary hero selection before confirmation and keeps the real hero lock until submit', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const heroId = HeroId.RICHARD_KIM;

    expect(runtime.gameManager.setTemporaryHeroSelection(player.id, heroId)).to.equal(true);
    expect(player.tempHeroId).to.equal(heroId);
    expect(player.heroId).to.equal(null);

    expect(runtime.gameManager.confirmHeroSelection(player.id)).to.equal(true);
    expect(player.heroId).to.equal(heroId);
  });

  it('accepts a selected card object for starting-card purchase and allows the Secretary to buy free cards', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const cards = [
      { id: 'card-1', name: 'Card 1', cost: 2 },
      { id: 'card-2', name: 'Card 2', cost: 2 },
    ];
    player.availableStartingCards = cards;
    player.gold = 0;
    player.heroId = HeroId.DOROTHY_DECKARD;

    expect(runtime.gameManager.purchaseStartingCard(player.id, cards[0])).to.equal(true);
    expect(player.availableStartingCards.length).to.equal(1);
    expect(player.hand.cards.some((c: any) => c.id === 'card-1')).to.equal(true);

    const secondRuntime = createRuntimeGame({
      humanNames: ['Player 2'],
      cpuCount: 0,
    });
    const secondPlayer = secondRuntime.players[0];
    secondPlayer.availableStartingCards = [{ id: 'card-3', name: 'Card 3', cost: 2 }];
    secondPlayer.gold = 0;
    secondPlayer.heroId = HeroId.ANITA_BANDAGE;

    expect(secondRuntime.gameManager.purchaseStartingCard(secondPlayer.id, 0)).to.equal(false);
  });

  it('charges 4 gold per nightly draft purchase and closes the human draft when a card object is selected', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    player.gold = 10;
    player.draftCards = [
      { id: 'draft-card-1', name: 'Draft Card 1', cost: 4 },
      { id: 'draft-card-2', name: 'Draft Card 2', cost: 4 },
    ];

    expect(runtime.gameManager.purchaseDraftCard(player.id, player.draftCards[0] as any)).to.equal(true);
    expect(player.gold).to.equal(6);
    expect(player.hand.cards.some((c: any) => c.id === 'draft-card-1')).to.equal(true);
    expect(player.draftCards.length).to.equal(0);
  });

  it('awards each living player current SP + GP as gold at round end', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 1,
    });

    const human = runtime.players[0];
    const cpu = runtime.players[1];
    human.gold = 0;
    human.currSP = 3;
    human.currGP = 2;
    cpu.gold = 0;
    cpu.currSP = 1;
    cpu.currGP = 1;

    (runtime.gameManager as any).awardRoundIncome();

    expect(human.gold).to.equal(5);
    expect(cpu.gold).to.equal(2);
  });

  it('spawns an initial zombie wave when the board is ready for round 1', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const before = runtime.game.board.getAllZombies().length;
    (runtime.gameManager as any).spawnInitialZombies();
    expect(runtime.game.board.getAllZombies().length).to.be.greaterThan(before);
  });

  it('does not leave a zombie and barricade occupying the same tile', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const board = runtime.game.board;
    const player = runtime.players[0];
    const viableCells = board.getAllCells().filter(c => !c.isHole && !c.hasStructure && !c.hasPlayer && !c.hasZombie);
    const zombieCell = viableCells[0]!;
    const barricadeCell = viableCells[1]!;
    const playerCell = viableCells[2]!;

    playerCell.setPlayer(player);
    barricadeCell.setBarricade(player);
    zombieCell.setZombie('test-zombie', 1);

    const originalRandom = Math.random;
    Math.random = () => 0.9;
    try {
      runtime.game.ensureZombieManager().zombiePhase(1);
    } finally {
      Math.random = originalRandom;
    }

    const zombieOnBarricade = board.getAllCells().some(cell => cell.hasZombie && cell.x === barricadeCell.x && cell.y === barricadeCell.y);
    expect(barricadeCell.hasZombie || barricadeCell.hasBarricade).to.equal(true);
    expect(zombieOnBarricade && barricadeCell.hasBarricade).to.equal(false);
    expect(board.getAllCells().some(cell => cell.hasZombie)).to.equal(true);
  });

  it('removes a zombie from the board when a trap kills it', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const board = runtime.game.board;
    const player = runtime.players[0];
    const zombieCell = board.getCell(0, 2)!;
    const trapCell = board.getCell(1, 2)!;
    const playerCell = board.getCell(2, 2)!;

    playerCell.setPlayer(player);
    trapCell.setTrap(player);
    zombieCell.setZombie('test-zombie', 1);

    const originalRandom = Math.random;
    Math.random = () => 0.1;
    try {
      runtime.game.ensureZombieManager().zombiePhase(1);
    } finally {
      Math.random = originalRandom;
    }

    expect(zombieCell.hasZombie).to.equal(false);
    expect(trapCell.hasTrap).to.equal(false);
    expect(board.getAllZombies().length).to.equal(0);
  });

  it('advances from setup into placement once the hero, locker, and starting cards are all complete without noisy duplicate logs', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const logs: string[] = [];
    runtime.game.on('log', (message: string) => logs.push(message));

    const player = runtime.players[0];
    const heroId = player.availableHeroes[0].id;
    player.tempHeroId = heroId;
    expect(runtime.gameManager.confirmHeroSelection(player.id)).to.equal(true);

    const lockerId = player.availableLockers[0].id;
    runtime.gameManager.setTemporaryLockerSelection(player.id, lockerId);
    expect(runtime.gameManager.confirmLockerSelection(player.id)).to.equal(true);

    while (player.availableStartingCards.length > 0) {
      const [nextCard] = player.availableStartingCards;
      expect(runtime.gameManager.purchaseStartingCard(player.id, nextCard)).to.equal(true);
    }

    expect(runtime.gameManager.getPhase()).to.equal('placement');
    expect(logs.some((msg) => /all heroes selected/i.test(msg))).to.equal(false);
    expect(logs.filter((msg) => /selected locker/i.test(msg)).length).to.equal(1);
  });

  it('finalizes a partial starting hand and advances into placement when the player confirms the draft', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const player = runtime.players[0];
    const heroId = player.availableHeroes[0].id;
    player.tempHeroId = heroId;
    expect(runtime.gameManager.confirmHeroSelection(player.id)).to.equal(true);

    const lockerId = player.availableLockers[0].id;
    runtime.gameManager.setTemporaryLockerSelection(player.id, lockerId);
    expect(runtime.gameManager.confirmLockerSelection(player.id)).to.equal(true);

    const selectedCards = player.availableStartingCards.slice(0, 2);
    expect(selectedCards.length).to.equal(2);
    expect(runtime.gameManager.finalizeStartingCards(player.id, selectedCards)).to.equal(true);
    expect(player.availableStartingCards.length).to.equal(0);
    expect(runtime.gameManager.getPhase()).to.equal('placement');
  });

  it('pauses the zombie phase until each bitten player resolves escape', async () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const game = runtime.game as any;
    const board = game.board;
    const player = runtime.players[0];
    let route: { playerCell: BoardCell; firstZombie: BoardCell; secondZombie: BoardCell; escapeTarget: BoardCell } | undefined;

    for (const playerCell of board.getAllCells()) {
      if (!playerCell.isEmpty || playerCell.isHole) continue;
      const firstZombies = board.getNeighbors(playerCell).filter((cell: BoardCell) => cell.isEmpty && !cell.isHole);
      const escapeCandidates = board.getNeighbors(playerCell)
        .flatMap((neighbor: BoardCell) => board.getNeighbors(neighbor))
        .filter((cell: BoardCell, index: number, cells: BoardCell[]) =>
          cell !== playerCell && cell.isEmpty && !cell.isHole && cells.indexOf(cell) === index
        );
      for (const firstZombie of firstZombies) {
        for (const escapeTarget of escapeCandidates) {
          if (Math.abs(escapeTarget.x - playerCell.x) + Math.abs(escapeTarget.y - playerCell.y) > 2) continue;
          const secondZombie = board.getNeighbors(escapeTarget).find((cell: BoardCell) =>
            cell.isEmpty && !cell.isHole
            && cell !== firstZombie
            && Math.abs(cell.x - playerCell.x) + Math.abs(cell.y - playerCell.y) > 1
          );
          if (secondZombie) {
            route = { playerCell, firstZombie, secondZombie, escapeTarget };
            break;
          }
        }
        if (route) break;
      }
      if (route) break;
    }

    expect(route).to.exist;
    player.emergencyRetreat = true;
    route!.playerCell.setPlayer(player);
    route!.firstZombie.setZombie('escape-pause-zombie-1', 1);
    route!.secondZombie.setZombie('escape-pause-zombie-2', 1);
    game._phase = 'zombie_turn';

    const escapePayloads: any[] = [];
    let resolveFirstEscape!: (payload: any) => void;
    let resolveSecondEscape!: (payload: any) => void;
    const firstEscape = new Promise<any>(resolve => { resolveFirstEscape = resolve; });
    const secondEscape = new Promise<any>(resolve => { resolveSecondEscape = resolve; });
    game.on('escapeMode', (payload: any) => {
      if (!payload) return;
      escapePayloads.push(payload);
      if (escapePayloads.length === 1) resolveFirstEscape(payload);
      if (escapePayloads.length === 2) resolveSecondEscape(payload);
    });

    const phaseComplete = new Promise<void>(resolve => {
      game.ensureZombieManager().zombiePhase(0, { async: true, stepDelayMs: 0, onComplete: resolve });
    });
    const firstPayload = await firstEscape;
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(escapePayloads).to.have.length(1);
    expect(game.hasActiveEscapeState(player.id)).to.equal(true);

    expect(firstPayload.validTargets).to.include(route!.escapeTarget);
    expect(game.completeEscape(player.id, route!.escapeTarget)).to.equal(true);

    const secondPayload = await secondEscape;
    expect(secondPayload).to.exist;
    const secondTarget = secondPayload.validTargets.find((cell: BoardCell) => cell.isEmpty && !cell.isHole);
    expect(secondTarget).to.exist;
    expect(game.completeEscape(player.id, secondTarget)).to.equal(true);
    await phaseComplete;

    expect(escapePayloads).to.have.length(2);
  });

  it('automatically resolves escape for a bot during the zombie phase', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const game = runtime.game as any;
    const player = runtime.players[0];
    player.isBot = true;
    game._phase = 'zombie_turn';
    const originalCell = game.board.getCell(2, 2)!;
    const attackerCell = game.board.getCell(2, 1)!;
    originalCell.setPlayer(player);
    originalCell.zombieId = 'bot-escape-test-zombie';
    originalCell.occupantType = 'zombie';
    attackerCell.clear();

    game.handlePlayerAttacked(player.id, originalCell.x, originalCell.y, attackerCell);

    expect(game.hasActiveEscapeState()).to.equal(false);
    expect(attackerCell.hasPlayer).to.equal(true);
    expect(originalCell.hasZombie).to.equal(true);
  });

  it('starts escape mode when a zombie attacks a player and clears it when the player escapes', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const game = runtime.game;
    game._phase = 'zombie_turn';
    const player = runtime.players[0];
    const board = game.board;
    const originalCell = board.getCell(2, 2)!;
    const escapeTarget = board.getCell(1, 2)!;
    const attackerCell = board.getCell(2, 1)!;

    originalCell.structureType = 'player';
    originalCell.structureOwner = player;
    originalCell.structureData = { health: player.currHealth };
    originalCell.zombieId = 'attack-zombie';
    originalCell.zombieStepsLeft = 0;
    originalCell.occupantType = 'zombie';
    attackerCell.zombieId = null;
    attackerCell.zombieStepsLeft = null;
    attackerCell.occupantType = 'empty';

    const gameAny = game as any;
    const escapeEvents: any[] = [];
    let stateChanges = 0;
    gameAny.on('escapeMode', (payload: any) => escapeEvents.push(payload));
    gameAny.on('stateChanged', () => stateChanges++);

    gameAny.handlePlayerAttacked(player.id, originalCell.x, originalCell.y, attackerCell);

    expect(gameAny._escapeState).to.not.equal(null);
    expect(stateChanges).to.equal(1);
    const hydratedGame = hydrateGame(JSON.parse(JSON.stringify(game)));
    expect(hydratedGame.phase).to.equal('zombie_turn');
    expect(hydratedGame.hasActiveEscapeState(player.id)).to.equal(true);
    const hydratedEscape = (hydratedGame as any)._escapeState;
    expect(hydratedEscape.validTargets.map((cell: BoardCell) => cell.id)).to.include(escapeTarget.id);
    expect(gameAny.completeEscape(player.id, escapeTarget)).to.equal(true);
    expect(gameAny._escapeState).to.equal(null);
    expect(escapeEvents[escapeEvents.length - 1]).to.equal(null);
    expect(escapeTarget.hasPlayer).to.equal(true);
    expect(originalCell.hasPlayer).to.equal(false);
    expect(originalCell.hasZombie).to.equal(true);
  });

  it('eliminates a player when no escape tile is open and keeps the attacking zombie on the tile', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const game = runtime.game as any;
    const [player, opponent] = runtime.players;
    const board = game.board;
    const start = board.getAllCells().find((cell: any) => !cell.isHole && cell.isEmpty && board.getNeighbors(cell).length > 0)!;
    start.setPlayer(player);
    const neighbors = board.getNeighbors(start);
    neighbors.forEach((cell: any) => cell.setBarricade(opponent));
    start.zombieId = 'cornering-zombie';
    const attackSource = neighbors[0];

    game.handlePlayerAttacked(player.id, start.x, start.y, attackSource);

    expect(game._escapeState).to.equal(null);
    expect(game.hasActiveEscapeState()).to.equal(false);
    expect(player.isEliminated).to.equal(true);
    expect(player.currHealth).to.equal(0);
    expect(start.hasPlayer).to.equal(false);
    expect(start.hasZombie).to.equal(true);
  });

  it('keeps emergency-retreat escape legal only for valid two-step targets', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1'],
      cpuCount: 0,
    });

    const game = runtime.game;
    const player = runtime.players[0];
    const board = game.board;
    const gameAny = game as any;

    const startCell = board.getCell(2, 2)!;
    const invalidCell = board.getCell(0, 0)!;
    const legalCell = board.getAllCells().find((cell: any) =>
      cell !== startCell &&
      cell.isEmpty &&
      !cell.isHole &&
      Math.abs(cell.x - startCell.x) + Math.abs(cell.y - startCell.y) <= 2
    )!;

    startCell.setPlayer(player);
    player.emergencyRetreat = true;

    gameAny.handlePlayerAttacked(player.id, startCell.x, startCell.y, board.getCell(2, 1)!);
    expect(gameAny._escapeState).to.not.equal(null);
    expect(gameAny._escapeState.canEscapeTwoSteps).to.equal(true);
    expect(gameAny.completeEscape(player.id, invalidCell)).to.equal(false);
    expect(gameAny.hasActiveEscapeState(player.id)).to.equal(true);

    const legalTarget = gameAny._escapeState.validTargets.find((cell: any) => cell.id === legalCell.id);
    expect(legalTarget).to.not.equal(undefined);
    expect(gameAny.completeEscape(player.id, legalTarget)).to.equal(true);
    expect(gameAny._escapeState).to.equal(null);
  });

  it('lets Triple Jump target a Shoes-style route with one jump and two steps', () => {
    const runtime = createRuntimeGame({
      humanNames: ['Player 1', 'Player 2'],
      cpuCount: 0,
    });

    const game = runtime.game;
    const [player, barricadeOwner] = runtime.players;
    const board = game.board;
    let routeCells: any[] = [];

    outer: for (const start of board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole)) {
      for (const obstacle of board.getNeighbors(start)) {
        if (!obstacle.isEmpty || obstacle.isHole) continue;
        const dx = obstacle.x - start.x;
        const dy = obstacle.y - start.y;
        const landing = board.getCell(obstacle.x + dx, obstacle.y + dy);
        const secondStep = board.getCell(obstacle.x + dx * 2, obstacle.y + dy * 2);
        const target = board.getCell(obstacle.x + dx * 3, obstacle.y + dy * 3);
        if (!landing?.isEmpty || landing.isHole || !secondStep?.isEmpty || secondStep.isHole || !target?.isEmpty || target.isHole) continue;
        if (!board.getNeighbors(obstacle).includes(landing)
          || !board.getNeighbors(landing).includes(secondStep)
          || !board.getNeighbors(secondStep).includes(target)) continue;
        start.setPlayer(player);
        obstacle.setBarricade(barricadeOwner);
        const route = MovementUtil.getShoesMoveRoutes(board, player, 6, 3)
          .find(candidate => candidate.target.id === target.id);
        start.clear();
        obstacle.clear();
        if (route?.jumpedObjects.length !== 1) continue;
        routeCells = [start, obstacle, landing, secondStep, target];
        break outer;
      }
    }

    expect(routeCells).to.have.length(5);
    const [start, obstacle, , , target] = routeCells;
    start.setPlayer(player);
    obstacle.setBarricade(barricadeOwner);
    player.gold = 10;
    barricadeOwner.gold = 0;

    const tripleJump = CardProcessor.get('triple_jump')!;
    player.gold = 7;
    expect(tripleJump.isValidTarget(player, board, target)).to.equal(false);
    player.barricadeCrossDiscount = 1;
    player.barricadeCrossRefund = true;
    player.gold = 6;
    expect(tripleJump.isValidTarget(player, board, target)).to.equal(false);
    player.gold = 7;
    expect(tripleJump.getValidTargets(player, board).some((cell: any) => cell.id === target.id)).to.equal(true);
    expect(tripleJump.isValidTarget(player, board, target)).to.equal(true);
    expect(tripleJump.execute(player, board, target).success).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(target.id);
    expect(player.gold).to.equal(2);
    expect(barricadeOwner.gold).to.equal(1);
  });

  it('lets Triple Jump clear three obstacles with walking spaces between them', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, obstacleOwner] = runtime.players;
    const board = runtime.game.board;
    const start = board.getCell(0, 5)!;
    const firstBarricade = board.getCell(1, 5)!;
    const firstLanding = board.getCell(2, 5)!;
    const firstGap = board.getCell(3, 5)!;
    const trap = board.getCell(4, 5)!;
    const secondLanding = board.getCell(5, 5)!;
    const secondGap = board.getCell(6, 5)!;
    const secondBarricade = board.getCell(7, 5)!;
    const finalLanding = board.getCell(8, 5)!;
    const routeCells = [start, firstBarricade, firstLanding, firstGap, trap, secondLanding, secondGap, secondBarricade, finalLanding];

    expect(routeCells.every(cell => !cell.isHole)).to.equal(true);
    expect(routeCells.slice(0, -1).every((cell, index) => board.getNeighbors(cell).includes(routeCells[index + 1]))).to.equal(true);
    start.setPlayer(player);
    firstBarricade.setBarricade(obstacleOwner);
    trap.setTrap(obstacleOwner);
    secondBarricade.setBarricade(obstacleOwner);
    player.gold = 100;

    const tripleJump = CardProcessor.get('triple_jump')!;
    const route = MovementUtil.getShoesMoveRoutes(board, player, 6, 3)
      .find(candidate => candidate.target.id === finalLanding.id);
    expect(route?.jumpedObjects.map(cell => cell.id)).to.deep.equal([
      firstBarricade.id,
      trap.id,
      secondBarricade.id,
    ]);
    expect(tripleJump.getValidTargets(player, board).some((cell: any) => cell.id === finalLanding.id)).to.equal(true);
    expect(tripleJump.execute(player, board, finalLanding).success).to.equal(true);
    expect(board.getPlayerPosition(player)?.id).to.equal(finalLanding.id);
    expect(firstBarricade.hasBarricade).to.equal(true);
    expect(trap.hasTrap).to.equal(true);
    expect(secondBarricade.hasBarricade).to.equal(true);
  });

  it('keeps Principal C playable when the client game has no ZombieManager instance', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.gold = 10;
    runtime.game.zombieManager = null;

    const principalSpawn = (AllSpecialActions as any).richard_kim.options.find((option: any) => option.id === 'principal_spawn');
    expect(principalSpawn.canUse(player, runtime.game.board)).to.equal(true);
  });

  it('requires Area Sabotage structures to be adjacent, not merely two cells away', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    const board = runtime.game.board;
    player.gold = 20;

    let start: any;
    let distant: any;
    for (const cell of board.getAllCells().filter((candidate: any) => candidate.isEmpty && !candidate.isHole)) {
      const candidate = board.getAllCells().find((other: any) =>
        other !== cell && other.roomId === cell.roomId && other.isEmpty && !other.isHole &&
        Math.abs(other.x - cell.x) + Math.abs(other.y - cell.y) === 2 &&
        !board.getNeighbors(cell).includes(other)
      );
      if (candidate) {
        start = cell;
        distant = candidate;
        break;
      }
    }

    expect(start).to.exist;
    expect(distant).to.exist;
    start.setPlayer(player);
    distant.setBarricade(player);
    const areaSabotage = CardProcessor.get('area_sabotage')!;
    expect(areaSabotage.canPlay(player, board)).to.equal(false);

    const adjacent = board.getNeighbors(start).find((cell: any) => cell.roomId === start.roomId && cell.isEmpty && !cell.isHole)!;
    adjacent.setTrap(player);
    expect(areaSabotage.canPlay(player, board)).to.equal(true);
  });

  it('limits Distraction targets to zombies adjacent to opponents', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1', 'Player 2'], cpuCount: 0 });
    const [player, opponent] = runtime.players;
    const board = runtime.game.board;
    player.gold = 10;

    const emptyCells = board.getAllCells().filter((cell: any) => cell.isEmpty && !cell.isHole);
    let positions: { playerCell: any; ownZombieCell: any; opponentCell: any; opponentZombieCell: any } | null = null;
    for (const playerCell of emptyCells) {
      const playerNeighbors = board.getNeighbors(playerCell);
      const ownZombieCell = playerNeighbors.find((cell: any) => cell.isEmpty);
      if (!ownZombieCell) continue;

      for (const opponentCell of emptyCells) {
        if (opponentCell === playerCell || playerNeighbors.includes(opponentCell)) continue;
        const opponentNeighbors = board.getNeighbors(opponentCell);
        if (opponentNeighbors.includes(ownZombieCell)) continue;
        const opponentZombieCell = opponentNeighbors.find((cell: any) =>
          cell.isEmpty && cell !== playerCell && cell !== ownZombieCell && !playerNeighbors.includes(cell)
        );
        if (!opponentZombieCell) continue;
        positions = { playerCell, ownZombieCell, opponentCell, opponentZombieCell };
        break;
      }
      if (positions) break;
    }

    expect(positions).to.exist;
    const { playerCell, ownZombieCell, opponentCell, opponentZombieCell } = positions!;
    playerCell.setPlayer(player);
    opponentCell.setPlayer(opponent);
    ownZombieCell.setZombie('self-adjacent-zombie', 1);
    opponentZombieCell.setZombie('opponent-adjacent-zombie', 1);

    const distraction = CardProcessor.get('distraction')!;
    const validTargets = distraction.getValidTargets(player, board);
    expect(distraction.canPlay(player, board)).to.equal(true);
    expect(validTargets).to.include(opponentZombieCell);
    expect(validTargets).not.to.include(ownZombieCell);
    expect(distraction.isValidTarget(player, board, ownZombieCell)).to.equal(false);
    expect(distraction.isValidTarget(player, board, opponentZombieCell)).to.equal(true);
  });

  it('turns Confident First Step into its reusable action card when played', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const { game, players: [player] } = runtime;
    player.gold = 10;
    game.board.getAllCells()
      .filter((cell: any) => cell.isEmpty && !cell.isHole)
      .slice(0, 2)
      .forEach((cell: any) => cell.setBarricade(player));
    const card = { id: 'confident_first_step-test', cardId: 'confident_first_step', name: 'Confident First Step' };
    player.addCard(card);

    expect(game.playCard(card.id, player)).to.equal(true);
    expect(player.actionManager.getAllActions().some((action: any) => action.id === 'game_confident_first_step')).to.equal(true);
    expect(player.hand.playedCards.some((played: any) => played.id === card.id)).to.equal(true);
  });

  it('opens a three-card locker selection for human Open Locker plays', () => {
    const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
    const player = runtime.players[0];
    player.currSP = 20;
    player.gold = 20;
    expect(runtime.game.cardManager.getLockerDeckSize()).to.be.greaterThan(2);
    const card = { id: 'open_locker-test', cardId: 'open_locker', name: 'Open Locker' };
    player.addCard(card);

    expect(runtime.game.playCard(card.id, player)).to.equal(true);
    expect(runtime.game.pendingCardSelection?.type).to.equal('locker');
    expect(runtime.game.pendingCardSelection?.cards).to.have.length(3);
    expect(player.currSP).to.equal(20);
    expect(player.gold).to.equal(7);
  });

  it('resolves actual hero art filenames to the hero asset folder', () => {
    expect(resolveAssetPath('anita.jpg', 'hero')).to.equal('/card-art/herocard_assets/anita.jpg');
    expect(resolveAssetPath('barry.jpg', 'hero')).to.equal('/card-art/herocard_assets/barry.jpg');
    expect(resolveAssetPath('nurse.png', 'hero')).to.equal('/card-art/herocard_assets/anita.jpg');
  });

  it('resolves board-cell targets even when x or y is zero', () => {
    const leftEdge = { userData: { x: 0, y: 4 }, parent: { userData: {}, parent: null } };
    const topEdge = { userData: { x: 3, y: 0 }, parent: { userData: {}, parent: null } };

    expect(resolveBoardCellTarget(leftEdge)).to.deep.equal({ x: 0, y: 4 });
    expect(resolveBoardCellTarget(topEdge)).to.deep.equal({ x: 3, y: 0 });
  });

  it('resolves player targets by board coordinates to the current snapshot instance', () => {
    const staleTarget = { id: 'player-2', name: 'P2' };
    const currentTarget = { id: 'player-2', name: 'P2' };
    const currentPlayers = [currentTarget];
    const target = resolvePlayerTargetSelection(
      [staleTarget],
      currentPlayers,
      player => player.id === 'player-2' ? { x: 4, y: 3 } : null,
      { x: 4, y: 3 }
    );

    expect(target).to.equal(currentTarget);
  });

  it('only treats actual game URLs as deep-link boot attempts', () => {
    expect(shouldBootGameRoute('http://localhost:3002/')).to.equal(false);
    expect(shouldBootGameRoute('http://localhost:3002/game/abc123?playerId=player-1')).to.equal(true);
    expect(shouldBootGameRoute('http://localhost:3002/spectator/abc123')).to.equal(false);
  });
});
