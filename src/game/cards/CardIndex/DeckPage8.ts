// src/game/cards/CardIndex/DeckPage8.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage8(): void {

  // ============================================================
  // EXTRA MOVEMENT
  // ============================================================
  CardProcessor.register({
    id: 'extra_movement',
    name: 'Extra Movement',
    cost: 1,
    image: 'extra_movement.jpg',
    targetType: 'path',
    maxPathLength: 2,
    canPlay: (p, board) => p.canAffordCard(1),
    getValidTargets: (p, board) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      return paths.map(pathInfo => pathInfo.path);
    },
    isValidTarget: (p, board, target) => {
      if (!Array.isArray(target)) return false;
      const pos = board.getPlayerPosition(p);
      const start = pos ? board.getCell(pos.x, pos.y) : null;
      if (!start) return false;
      const steps = target[0]?.id === start.id ? target.slice(1) : target;
      if (steps.length === 0 || steps.length > 2) return false;
      let current = start;
      for (const entry of steps) {
        const cell = board.getCell(Number(entry.x), Number(entry.y));
        if (!cell || !cell.isEmpty || cell.isHole || !board.getNeighbors(current).includes(cell)) return false;
        current = cell;
      }
      return true;
    },
    execute: (p, board, target) => {
      p.spendCard(1);
      
      const result = MovementUtil.moveSteps(board, p, target, true, false);
      if (!result.success) {
        return { success: false, message: result.message };
      }
      
      return { 
        success: true, 
        message: `Played Card: Extra Movement - ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target || target.length === 0) return 0;
      const finalCell = target[target.length - 1];
      const boardValue = evaluator.getMoveValue(p, finalCell);
      return boardValue - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      
      if (!paths || paths.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestPath = paths[0].path;
      let bestValue = -Infinity;
      
      for (const pathInfo of paths) {
        const path = pathInfo.path;
        const finalCell = path[path.length - 1];
        const value = evaluator.getMoveValue(p, finalCell) - p.costCard(1);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      return { target: bestPath, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      
      if (!paths || paths.length === 0) {
        return { success: false, message: 'No valid paths available' };
      }
      
      let bestPath = paths[0].path;
      let bestValue = -Infinity;
      
      for (const pathInfo of paths) {
        const path = pathInfo.path;
        const finalCell = path[path.length - 1];
        const value = evaluator.getMoveValue(p, finalCell) - p.costCard(1);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      console.log(`[Extra Movement] Auto-executing with path of length ${bestPath.length}`);
      return CardProcessor.get('extra_movement')!.execute(p, board, bestPath);
    }
  });

  // ============================================================
  // VISITING FACULTY ID
  // ============================================================
  CardProcessor.register({
    id: 'visiting_faculty_id',
    name: 'Visiting Faculty ID',
    cost: 6,
    image: 'visiting_faculty_id.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.hand.playedCards.length >= 6 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addNPs(2);
      p.addCPs(2);
      p.loseSPs(2);
      p.cardPlayDiscount += 2;
      return { success: true, message: 'Played Card: Visiting Faculty ID - gained 2 NP, 2 CP, lost 2 SP, and cards cost 2 less to play' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getNP(p) + 2 * CardHelper.getCP(p) - 2 * CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const passiveValue = (p.hand.cards.length + remainingNights) * 1.5;
      return cardReward + passiveValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = 2 * CardHelper.getNP(p) + 2 * CardHelper.getCP(p) - 2 * CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const passiveValue = (p.hand.cards.length + remainingNights) * 1.5;
      const value = cardReward + passiveValue - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('visiting_faculty_id')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // FIRST AID KIT
  // ============================================================
  CardProcessor.register({
    id: 'first_aid_kit',
    name: 'First Aid Kit',
    cost: 13,
    image: 'first_aid_kit.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(13),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(13);
      p.addSPs(1);
      p.addHealths(1);
      return { success: true, message: 'Played Card: First Aid Kit - gained 1 SP and 1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(13);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(13);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('first_aid_kit')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // FOOD FIGHT
  // ============================================================
  CardProcessor.register({
    id: 'food_fight',
    name: 'Food Fight',
    cost: 13,
    image: 'food_fight.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Cafeteria' && p.currSP >= 20 && p.canAffordCard(13) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(13);
      p.addSPs(3);
      const cafeteriaCells = board.getCellsInRoom('Cafeteria');
      const zombieCount = cafeteriaCells.filter(c => c.hasZombie).length;
      const goldGained = 4 * zombieCount;
      p.addGold(goldGained);
      return { success: true, message: `Played Card: Food Fight - gained 3 SP and ${goldGained} Gold` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cafeteriaCells = board.getCellsInRoom('Cafeteria');
      const zombieCount = cafeteriaCells.filter(c => c.hasZombie).length;
      return 3 * CardHelper.getSP(p, evaluator.onNight) + 4 * zombieCount - p.costCard(13);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cafeteriaCells = board.getCellsInRoom('Cafeteria');
      const zombieCount = cafeteriaCells.filter(c => c.hasZombie).length;
      const value = 3 * CardHelper.getSP(p, evaluator.onNight) + 4 * zombieCount - p.costCard(13);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('food_fight')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // FREE TRAP PIECES
  // ============================================================
  CardProcessor.register({
    id: 'free_trap_pieces',
    name: 'Free Trap Pieces',
    cost: 5,
    image: 'free_trap_pieces.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currSP <= 20 && p.canAffordCard(5),
    getValidTargets: (p, board) => board.getAllCells().filter(c => c.isEmpty && !c.isHole),
    isValidTarget: (p, board, target) => target && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(5);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = StructurePlacement.placeTrapWithEffects(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Free Trap Pieces - ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const trapValue = evaluator.getTrapPlacementValue(p, target);
      return trapValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getTrapPlacementValue(p, target) - p.costCard(9);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid trap placement targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getTrapPlacementValue(p, target) - p.costCard(9);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Free Trap Pieces] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('free_trap_pieces')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // GOOD SCIENCE
  // ============================================================
  CardProcessor.register({
    id: 'good_science',
    name: 'Good Science',
    cost: 6,
    image: 'good_science.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Science Lab' && p.canAffordCard(6) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addNPs(3);
      return { success: true, message: 'Played Card: Good Science - gained 3 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getNP(p) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getNP(p) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('good_science')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // GRAFFITI
  // ============================================================
  CardProcessor.register({
    id: 'graffiti',
    name: 'Graffiti',
    cost: 3,
    image: 'graffiti.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Restroom' && p.currSP <= 25 && p.canAffordCard(3) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addSPs(1);
      p.addCPs(1);
      p.addNPs(1);
      return { success: true, message: 'Played Card: Graffiti - gained 1 SP, 1 CP, and 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('graffiti')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // GRAVE ROBBER
  // ============================================================
  CardProcessor.register({
    id: 'grave_robber',
    name: 'Grave Robber',
    cost: 4,
    image: 'grave_robber.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const game = CardProcessor.getGame();
      return game ? game.players.some((pl: Player) => pl.isEliminated) && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      CardDrawer.drawCards(p, 2);
      return { success: true, message: 'Played Card: Grave Robber - gained 1 SP and drew 2 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('grave_robber')!.execute(p, board);
      return result;
    }
  });
}