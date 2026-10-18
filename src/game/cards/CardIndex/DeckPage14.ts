// src/game/cards/CardIndex/DeckPage14.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { ZombieSpawner } from '../../misc/ZombieSpawner';

export function registerPage14(): void {

  // ============================================================
  // OLD SANDWICH
  // ============================================================
  CardProcessor.register({
    id: 'old_sandwich',
    name: 'Old Sandwich',
    cost: 12,
    image: 'old_sandwich.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currHealth === 1 && p.canAffordCard(12),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addSPs(2);
      p.addHealths(1);
      return { success: true, message: 'Played Card: Old Sandwich - gained 2 SP and 1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(12);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('old_sandwich')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ONE VS ONE
  // ============================================================
CardProcessor.register({
  id: 'one_vs_one',
  name: 'One vs One',
  cost: 4,
  image: 'one_vs_one.jpg',
  targetType: 'cell',
  canPlay: (p, board) => {
    const pos = board.getPlayerPosition(p);
    return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Gymnasium' && p.canAffordCard(4) : false;
  },
  getValidTargets: (p, board) => {
    // Only targets in the Gymnasium
    return board.getCellsInRoom('Gymnasium').filter(c => c.isEmpty && !c.isHole);
  },
  isValidTarget: (p, board, target) => {
    return target && target.roomId === 'Gymnasium' && target.isEmpty && !target.isHole;
  },
  execute: (p, board, target) => {
    p.spendCard(4);
    p.addSPs(2); // Changed from 3 to 2
    
    if (target) {
      const game = CardProcessor.getGame();
      if (game && game.zombieManager) {
        const result = game.zombieManager.spawnZombieAtTarget(target);
        if (!result.success) {
          return { success: false, message: result.message };
        }
      } else {
        ZombieSpawner.spawnAtTarget(board, target);
      }
    }
    return { success: true, message: 'Played Card: One vs One - gained 2 SP and spawned a zombie in the Gymnasium' };
  },
  expectedValue: (p, board, evaluator, target) => {
    // Now 2 SP instead of 3
    return 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(4);
  },
  getOptimalTarget: (p, board, evaluator) => {
    // Only targets in Gymnasium
    const targets = board.getCellsInRoom('Gymnasium').filter(c => c.isEmpty && !c.isHole);
    
    if (!targets || targets.length === 0) {
      return { target: null, value: 0 };
    }
    
    let bestTarget = targets[0];
    let bestScore = -Infinity;
    
    for (const target of targets) {
      let score = 0;
      // Prefer targets near the Gymnasium exits (where players might be)
      for (const pl of evaluator.allPlayers) {
        if (pl.id === p.id || pl.isEliminated) continue;
        const pPos = board.getPlayerPosition(pl);
        if (!pPos) continue;
        // Check if player is in or near Gymnasium
        const playerRoom = board.getCell(pPos.x, pPos.y)?.roomId;
        if (playerRoom === 'Gymnasium') {
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 3;
          }
        } else {
          // Target near the Gymnasium exit (closer to other players)
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 5) {
            score += (6 - dist) * 1;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }
    
    const value = 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(4);
    return { target: bestTarget, value };
  },
  autoExecute: (p, board, evaluator) => {
    const targets = board.getCellsInRoom('Gymnasium').filter(c => c.isEmpty && !c.isHole);
    
    if (!targets || targets.length === 0) {
      return { success: false, message: 'No valid targets in Gymnasium' };
    }
    
    let bestTarget = targets[0];
    let bestScore = -Infinity;
    
    for (const target of targets) {
      let score = 0;
      for (const pl of evaluator.allPlayers) {
        if (pl.id === p.id || pl.isEliminated) continue;
        const pPos = board.getPlayerPosition(pl);
        if (!pPos) continue;
        const playerRoom = board.getCell(pPos.x, pPos.y)?.roomId;
        if (playerRoom === 'Gymnasium') {
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 3;
          }
        } else {
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 5) {
            score += (6 - dist) * 1;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }
    
    console.log(`[One vs One] Auto-executing with target (${bestTarget.x},${bestTarget.y})`);
    return CardProcessor.get('one_vs_one')!.execute(p, board, bestTarget);
  }
});

  // ============================================================
  // OOPS!
  // ============================================================
  CardProcessor.register({
    id: 'oops',
    name: 'Oops!',
    cost: 3,
    image: 'oops.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 5 && p.canAffordCard(3),
    getValidTargets: (p, board) => {
      return board.getAllTraps();
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasTrap;
    },
    execute: (p, board, target) => {
      p.spendCard(3);
      p.addCPs(2);
      if (target && target.hasTrap) {
        target.clear();
      }
      return { success: true, message: 'Played Card: Oops! - gained 2 CP and removed a trap' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      
      if (!target || !target.hasTrap) {
        return cardReward - p.costCard(3);
      }
      
      const trapValue = evaluator.getTrapPlacementValue(p, target);
      return cardReward + trapValue - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllTraps();
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        let bonus = 0;
        if (target.structureOwner && target.structureOwner !== p) {
          bonus = 5;
        }
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) + bonus - p.costCard(3);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllTraps();
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No traps to remove' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        let bonus = 0;
        if (target.structureOwner && target.structureOwner !== p) {
          bonus = 5;
        }
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) + bonus - p.costCard(3);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Oops!] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('oops')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // PANIC RUN
  // ============================================================
  CardProcessor.register({
    id: 'panic_run',
    name: 'Panic Run',
    cost: 6,
    image: 'panic_run.jpg',
    targetType: 'path',
    maxPathLength: 3,
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      return cell ? board.getNeighbors(cell).some(n => n.hasZombie) && p.canAffordCard(6) : false;
    },
    getValidTargets: (p, board) => {
      const paths = MovementUtil.getValidPaths(board, p, 3, true, false);
      return paths.map(pathInfo => pathInfo.path);
    },
    isValidTarget: (p, board, target) => {
      if (!Array.isArray(target)) return false;
      const pos = board.getPlayerPosition(p);
      const start = pos ? board.getCell(pos.x, pos.y) : null;
      if (!start) return false;
      const steps = target[0]?.id === start.id ? target.slice(1) : target;
      if (steps.length === 0 || steps.length > 3) return false;
      let current = start;
      for (const entry of steps) {
        const cell = board.getCell(Number(entry.x), Number(entry.y));
        if (!cell || !cell.isEmpty || cell.isHole || !board.getNeighbors(current).includes(cell)) return false;
        current = cell;
      }
      return true;
    },
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addSPs(1);
      
      const result = MovementUtil.moveSteps(board, p, target, true, false);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Panic Run - gained 1 SP and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target || target.length === 0) return 0;
      const finalCell = target[target.length - 1];
      const boardValue = evaluator.getMoveValue(p, finalCell);
      return CardHelper.getSP(p, evaluator.onNight) + boardValue - p.costCard(6);
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
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, finalCell) - p.costCard(6);
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
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, finalCell) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      console.log(`[Panic Run] Auto-executing with path of length ${bestPath.length}`);
      return CardProcessor.get('panic_run')!.execute(p, board, bestPath);
    }
  });

  // ============================================================
  // PARAMEDIC KIT
  // ============================================================
  CardProcessor.register({
    id: 'paramedic_kit',
    name: 'Paramedic Kit',
    cost: 12,
    image: 'paramedic_kit.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(12),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addHealths(1);
      CardDrawer.drawCards(p, 2);
      return { success: true, message: 'Played Card: Paramedic Kit - gained 1 health and drew 2 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getHealthValue(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getHealthValue(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(12);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('paramedic_kit')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PASSED NOTE
  // ============================================================
  CardProcessor.register({
    id: 'passed_note',
    name: 'Passed Note',
    cost: 3,
    image: 'passed_note.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(3),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      CardDrawer.drawCards(p, 3);
      return { success: true, message: 'Played Card: Passed Note - drew 3 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('passed_note')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PASSED SHOP CLASS
  // ============================================================
  CardProcessor.register({
    id: 'passed_shop_class',
    name: 'Passed Shop Class',
    cost: 10,
    image: 'passed_shop_class.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      return board.getAllCells().some(c => c.hasTrap && c.structureOwner === p) && p.canAffordCard(10);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(10);
      p.addSPs(1);
      p.addCPs(1);
      p.addNPs(1);
      p.trapDiscount += 2;
      return { success: true, message: 'Played Card: Passed Shop Class - gained 1 SP, 1 CP, 1 NP, traps cost 2 less' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p);
      const passiveValue = CardHelper.getPassiveValue(1, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p);
      const passiveValue = CardHelper.getPassiveValue(1, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(10);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('passed_shop_class')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PE SHORTS
  // ============================================================
  CardProcessor.register({
    id: 'pe_shorts',
    name: 'PE Shorts',
    cost: 4,
    image: 'pe_shorts.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP <= 15 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      CardDrawer.drawCards(p, 1);
      return { success: true, message: 'Played Card: PE Shorts - gained 1 SP and drew 1 card' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('pe_shorts')!.execute(p, board);
      return result;
    }
  });
}