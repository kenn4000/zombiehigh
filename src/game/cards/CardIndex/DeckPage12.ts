// src/game/cards/CardIndex/DeckPage12.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage12(): void {

  // ============================================================
  // LUNCH MONEY
  // ============================================================
  CardProcessor.register({
    id: 'lunch_money',
    name: 'Lunch Money',
    cost: 1,
    image: 'lunch_money.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.hasPlayer && n.structureOwner && n.structureOwner.gold >= 5) && p.canAffordCard(1);
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.gold >= 5)
        .map(n => n.structureOwner!);
    },
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.structureOwner === target && target.gold >= 5);
    },
    execute: (p, board, target) => {
      p.spendCard(1);
      let targetName = 'unknown player';
      if (target && target instanceof Player && target.gold >= 5) {
        target.spendGold(5);
        p.addGold(5);
        targetName = target.name;
      }
      return { success: true, message: `Played Card: Lunch Money - took 5 gold from ${targetName}` };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 5 - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.gold >= 5)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let mostGold = bestTarget.gold;
      for (const target of targets) {
        if (target.gold > mostGold) {
          mostGold = target.gold;
          bestTarget = target;
        }
      }
      
      const value = 5 - p.costCard(1);
      return { target: bestTarget, value };
    },
    autoExecute: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) {
        return { success: false, message: 'Player not on board' };
      }
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) {
        return { success: false, message: 'Player cell not found' };
      }
      
      const targets = board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.gold >= 5)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No adjacent players with gold to steal' };
      }
      
      let bestTarget = targets[0];
      let mostGold = bestTarget.gold;
      for (const target of targets) {
        if (target.gold > mostGold) {
          mostGold = target.gold;
          bestTarget = target;
        }
      }
      
      console.log(`[Lunch Money] Auto-executing with target ${bestTarget.name} (gold: ${bestTarget.gold})`);
      return CardProcessor.get('lunch_money')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // LUNCH TRAY
  // ============================================================
  CardProcessor.register({
    id: 'lunch_tray',
    name: 'Lunch Tray',
    cost: 4,
    image: 'lunch_tray.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Cafeteria' && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addCPs(2);
      p.addNPs(2);
      return { success: true, message: 'Played Card: Lunch Tray - gained 2 CP and 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('lunch_tray')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // MAD DASH
  // ============================================================
  CardProcessor.register({
    id: 'mad_dash',
    name: 'Mad Dash',
    cost: 5,
    image: 'mad_dash.jpg',
    targetType: 'path',
    maxPathLength: 3,
    canPlay: (p, board) => p.canAffordCard(5),
    getValidTargets: (p, board) => {
      const paths = MovementUtil.getValidPaths(board, p, 3, true, false);
      return paths.map(pathInfo => pathInfo.path);
    },
    isValidTarget: (p, board, target) => {
      const start = board.getPlayerPosition(p);
      return Array.isArray(target)
        && !!start
        && target.length > 1
        && target[0]?.x === start.x
        && target[0]?.y === start.y
        && target.length - 1 <= 3;
    },
    execute: (p, board, target) => {
      p.spendCard(5);
      p.addSPs(1);
      
      const result = MovementUtil.moveSteps(board, p, target, true, false);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Mad Dash - gained 1 SP and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target || target.length === 0) return 0;
      const finalCell = target[target.length - 1];
      const boardValue = evaluator.getMoveValue(p, finalCell);
      return CardHelper.getSP(p, evaluator.onNight) + boardValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 3, true, false);
      
      if (!paths || paths.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestPath = paths[0].path;
      let bestValue = -Infinity;
      
      for (const pathInfo of paths) {
        const path = pathInfo.path;
        const finalCell = path[path.length - 1];
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, finalCell) - p.costCard(5);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      return { target: bestPath, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 3, true, false);
      
      if (!paths || paths.length === 0) {
        return { success: false, message: 'No valid paths available' };
      }
      
      let bestPath = paths[0].path;
      let bestValue = -Infinity;
      
      for (const pathInfo of paths) {
        const path = pathInfo.path;
        const finalCell = path[path.length - 1];
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, finalCell) - p.costCard(5);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      console.log(`[Mad Dash] Auto-executing with path of length ${bestPath.length}`);
      return CardProcessor.get('mad_dash')!.execute(p, board, bestPath);
    }
  });

  // ============================================================
  // MAILROOM CART
  // ============================================================
  CardProcessor.register({
    id: 'mailroom_cart',
    name: 'Mailroom Cart',
    cost: 12,
    image: 'mailroom_cart.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      if (board.getCell(pos.x, pos.y)?.roomId !== 'Front Desk') return false;
      const restroomCells = board.getCellsInRoom('Restroom').filter(c => c.isEmpty && !c.isHole);
      return restroomCells.length > 0 && p.canAffordCard(12);
    },
    getValidTargets: (p, board) => MovementUtil.getTeleportTargetsInRoom(board, 'Restroom'),
    isValidTarget: (p, board, target) => target && target.roomId === 'Restroom' && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(12);
      p.addSPs(1);
      p.addGPs(1);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Mailroom Cart - gained 1 SP, 1 GP, and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return CardHelper.getSP(p, evaluator.onNight) + gpValue + boardValue - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Restroom');
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
      const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
        const value = CardHelper.getSP(p, evaluator.onNight) + gpValue + evaluator.getMoveValue(p, target) - p.costCard(12);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Restroom');
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets in Restroom' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const gpValue = 12 - evaluator.onNight;
        const value = CardHelper.getSP(p, evaluator.onNight) + gpValue + evaluator.getMoveValue(p, target) - p.costCard(12);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Mailroom Cart] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('mailroom_cart')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // MENTAL PREPARATION
  // ============================================================
  CardProcessor.register({
    id: 'mental_preparation',
    name: 'Mental Preparation',
    cost: 4,
    image: 'mental_preparation.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      return cell ? board.getNeighbors(cell).some(n => n.hasZombie) && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      p.addNPs(1);
      return { success: true, message: 'Played Card: Mental Preparation - gained 1 SP and 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('mental_preparation')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // MERCY
  // ============================================================
  CardProcessor.register({
    id: 'mercy',
    name: 'Mercy',
    cost: 5,
    image: 'mercy.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      const game = CardProcessor.getGame();
      return p.hand.cards.length >= 2
        && p.canAffordCard(5)
        && !!game?.players.some((player: Player) => player !== p && !player.isEliminated);
    },
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      return game ? game.players.filter((pl: Player) => !pl.isEliminated && pl !== p) : [];
    },
    isValidTarget: (p, board, target) => {
      return target && target instanceof Player && !target.isEliminated && target !== p;
    },
    execute: (p, board, target) => {
      p.spendCard(5);
      p.addNPs(2);
      
      let targetName = 'no target';
      if (target && target instanceof Player && !target.isEliminated) {
        targetName = target.name;
        
        CardDrawer.drawCards(p, 2);
        
        const cardsToGive = p.hand.cards.splice(0, 2);
        for (const card of cardsToGive) {
          target.addCard(card);
        }
      }
      
      return { 
        success: true, 
        message: `Played Card: Mercy - gained 2 NP and gave 2 cards to ${targetName}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) return { target: null, value: 0 };
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let lowestHealth = Infinity;
      for (const target of targets) {
        if (target.currHealth < lowestHealth) {
          lowestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      const value = 2 * CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(5);
      return { target: bestTarget, value };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) {
        return { success: false, message: 'Game not available' };
      }
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid targets available' };
      }
      
      let bestTarget = targets[0];
      let lowestHealth = Infinity;
      for (const target of targets) {
        if (target.currHealth < lowestHealth) {
          lowestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      console.log(`[Mercy] Auto-executing with target ${bestTarget.name} (health: ${bestTarget.currHealth})`);
      return CardProcessor.get('mercy')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // MISSING HALLPASS
  // ============================================================
  CardProcessor.register({
    id: 'missing_hallpass',
    name: 'Missing Hallpass',
    cost: 7,
    image: 'missing_hallpass.jpg',
    targetType: 'multiple',
    maxTargets: 2,
    canPlay: (p, board, targets) => {
      if (!p.canAffordCard(7)) return false;
      
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      
      const adjacentZombies = board.getNeighbors(cell).filter(n => n.hasZombie);
      if (adjacentZombies.length === 0) return false;
      
      if (!targets) {
        const game = CardProcessor.getGame();
        if (!game || !game.zombieManager) return false;
        return adjacentZombies.some((z: BoardCell) => game.zombieManager.getZombieMoveTargets(z).length > 0);
      }
      
      if (!Array.isArray(targets) || targets.length !== 2) return false;
      const [zombieCell, targetCell] = targets;
      
      if (!adjacentZombies.includes(zombieCell)) return false;
      if (!zombieCell.hasZombie) return false;
      
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) return false;
      if (!targetCell.isEmpty || targetCell.isHole) return false;
      
      return true;
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) return [];
      
      const adjacentZombies = board.getNeighbors(cell).filter(n => n.hasZombie);
      const result: any[] = [];
      
      for (const zombie of adjacentZombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          result.push([zombie, target]);
        }
      }
      
      return result;
    },
    isValidTarget: (p, board, target) => {
      if (!Array.isArray(target) || target.length !== 2) return false;
      const [zombieCell, targetCell] = target;
      
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      
      const adjacentZombies = board.getNeighbors(cell).filter(n => n.hasZombie);
      if (!adjacentZombies.includes(zombieCell)) return false;
      if (!zombieCell.hasZombie) return false;
      
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) return false;
      if (!targetCell.isEmpty || targetCell.isHole) return false;
      
      return true;
    },
    execute: (p, board, targets) => {
      p.spendCard(7);
      p.addSPs(1);
      
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      if (targetsArray.length < 2) {
        return { success: false, message: 'Need both zombie and target location' };
      }
      
      const [zombieCell, targetCell] = targetsArray;
      
      if (!zombieCell || !zombieCell.hasZombie) {
        return { success: false, message: 'No zombie at source' };
      }
      
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) {
        return { success: false, message: 'Target must be adjacent to zombie' };
      }
      if (!targetCell.isEmpty || targetCell.isHole) {
        return { success: false, message: 'Target cell must be empty' };
      }
      
      const game = CardProcessor.getGame();
      if (game && game.zombieManager) {
        const result = game.zombieManager.moveZombieOneStep(zombieCell, targetCell);
        if (!result.success) {
          return { success: false, message: result.message };
        }
        return { 
          success: true, 
          message: `Played Card: Missing Hallpass - gained 1 SP and ${result.message}` 
        };
      }
      
      return { success: true, message: 'Played Card: Missing Hallpass - gained 1 SP' };
    },
    expectedValue: (p, board, evaluator, targets) => {
      if (!targets) return 0;
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      if (targetsArray.length < 2) return 0;
      
      const [zombieCell, targetCell] = targetsArray;
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      
      let moveValue = 0;
      const pos = board.getPlayerPosition(p);
      if (pos) {
        const oldDist = Math.abs(zombieCell.x - pos.x) + Math.abs(zombieCell.y - pos.y);
        const newDist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
        if (newDist > oldDist) {
          moveValue = (newDist - oldDist) * 2;
        }
      }
      
      return cardReward + moveValue - p.costCard(7);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { target: null, value: 0 };
      }
      
      const adjacentZombies = board.getNeighbors(cell).filter(n => n.hasZombie);
      let bestMove: { zombie: BoardCell; target: BoardCell } | null = null;
      let bestValue = -Infinity;
      
      for (const zombie of adjacentZombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          const oldDist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
          const newDist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          let value = (newDist - oldDist) * 2 + CardHelper.getSP(p, evaluator.onNight) - p.costCard(7);
          if (value > bestValue) {
            bestValue = value;
            bestMove = { zombie, target };
          }
        }
      }
      
      if (!bestMove) {
        return { target: null, value: 0 };
      }
      
      return { target: [bestMove.zombie, bestMove.target], value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) {
        return { success: false, message: 'Player not on board' };
      }
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) {
        return { success: false, message: 'Player cell not found' };
      }
      
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { success: false, message: 'ZombieManager not available' };
      }
      
      const adjacentZombies = board.getNeighbors(cell).filter(n => n.hasZombie);
      let bestMove: { zombie: BoardCell; target: BoardCell } | null = null;
      let bestValue = -Infinity;
      
      for (const zombie of adjacentZombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          const oldDist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
          const newDist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          let value = (newDist - oldDist) * 2 + CardHelper.getSP(p, evaluator.onNight) - p.costCard(7);
          if (value > bestValue) {
            bestValue = value;
            bestMove = { zombie, target };
          }
        }
      }
      
      if (!bestMove) {
        return { success: false, message: 'No valid moves available' };
      }
      
      console.log(`[Missing Hallpass] Auto-executing with zombie at (${bestMove.zombie.x},${bestMove.zombie.y}) -> (${bestMove.target.x},${bestMove.target.y})`);
      return CardProcessor.get('missing_hallpass')!.execute(p, board, [bestMove.zombie, bestMove.target]);
    }
  });

  // ============================================================
  // MORNING JOGGING CLUB
  // ============================================================
  CardProcessor.register({
    id: 'morning_jogging_club',
    name: 'Morning Jogging Club',
    cost: 9,
    image: 'morning_jogging_club.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 8 && p.canAffordCard(9),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(9);
      p.addNPs(2);
      const game = CardProcessor.getGame();
      if (game) {
        for (const player of game.players) {
          if (!player.isEliminated) player.addHealths(1);
        }
      }
      return { success: true, message: 'Played Card: Morning Jogging Club - gained 2 NP, all players +1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const game = CardProcessor.getGame();
      const aliveCount = game ? game.players.filter((pl: Player) => !pl.isEliminated).length : 0;
      const selfValue = CardHelper.getHealthValue(p, evaluator.onNight)/aliveCount; 
      return  2 * CardHelper.getNP(p) + selfValue - p.costCard(9);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      const aliveCount = game ? game.players.filter((pl: Player) => !pl.isEliminated).length : 0;
      const selfValue = CardHelper.getHealthValue(p, evaluator.onNight)/aliveCount; 
      const value = 2 * CardHelper.getNP(p) + selfValue - p.costCard(9);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('morning_jogging_club')!.execute(p, board);
      return result;
    }
  });
}