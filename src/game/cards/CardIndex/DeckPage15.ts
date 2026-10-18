// src/game/cards/CardIndex/DeckPage15.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage15(): void {

  // ============================================================
  // PERMISSION SLIP
  // ============================================================
  CardProcessor.register({
    id: 'permission_slip',
    name: 'Permission Slip',
    cost: 6,
    image: 'permission_slip.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Principal's Office" && p.currNP >= 5 && p.canAffordCard(6) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addNPs(4);
      return { success: true, message: 'Played Card: Permission Slip - gained 4 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getNP(p) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getNP(p) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('permission_slip')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PHYSICAL EXERCISE
  // ============================================================
  CardProcessor.register({
    id: 'physical_exercise',
    name: 'Physical Exercise',
    cost: 5,
    image: 'physical_exercise.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 20 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(2);
      p.addNPs(2);
      CardDrawer.drawCards(p, 1);
      return { success: true, message: 'Played Card: Physical Exercise - gained 2 CP, 2 NP, and drew 1 card' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('physical_exercise')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PLAGIARISM
  // ============================================================
  CardProcessor.register({
    id: 'plagiarism',
    name: 'Plagiarism',
    cost: 10,
    image: 'plagiarism.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBarricades().length > 0 && p.canAffordCard(10),
    getValidTargets: (p, board) => {
      return board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasBarricade && target.structureOwner && target.structureOwner !== p;
    },
    execute: (p, board, target) => {
      p.spendCard(10);
      p.addCPs(3);
      if (target && target.hasBarricade && target.structureOwner && target.structureOwner !== p) {
        target.removeStructure();
        target.setBarricade(p);
      }
      return { success: true, message: 'Played Card: Plagiarism - gained 3 CP and replaced opponent barricade with yours' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 3 * CardHelper.getCP(p);
      
      if (!target || !target.hasBarricade || target.structureOwner === p) {
        return cardReward - p.costCard(10);
      }
      
      const barricadeValue = evaluator.getBarricadePlacementValue(p, target);
      const opponentDenial = 3;
      return cardReward + barricadeValue + opponentDenial - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 3 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 3 - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No opponent barricades to steal' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 3 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 3 - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Plagiarism] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('plagiarism')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // POCKET TRAP
  // ============================================================
  CardProcessor.register({
    id: 'pocket_trap',
    name: 'Pocket Trap',
    cost: 4,
    image: 'pocket_trap.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currSP <= 17 && p.canAffordCard(4),
    getValidTargets: (p, board) => board.getAllCells().filter(c => c.isEmpty && !c.isHole),
    isValidTarget: (p, board, target) => target && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(4);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = StructurePlacement.placeTrapWithEffects(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Pocket Trap - ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const trapValue = evaluator.getTrapPlacementValue(p, target);
      return trapValue - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getTrapPlacementValue(p, target) - p.costCard(10);
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
        const value = evaluator.getTrapPlacementValue(p, target) - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Pocket Trap] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('pocket_trap')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // POPULARITY
  // ============================================================
  CardProcessor.register({
    id: 'popularity',
    name: 'Popularity',
    cost: 8,
    image: 'popularity.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBarricades().length >= 4 && p.canAffordCard(8),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addCPs(1);
      p.barricadeCrossDiscount += 1;
      return { success: true, message: 'Played Card: Popularity - gained 1 CP, pay 1 less gold crossing barricades' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const opponentBarricades = board.getAllBarricades().filter(c => c.structureOwner !== p).length;
      const crossingRate = 0.2 + (opponentBarricades / 10);
      const expectedCrossings = remainingNights * crossingRate; 
      return cardReward + expectedCrossings - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {

      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const opponentBarricades = board.getAllBarricades().filter(c => c.structureOwner !== p).length;
      const crossingRate = 0.2 + (opponentBarricades / 10);
      const expectedCrossings = remainingNights * crossingRate; 
 
      const value = cardReward + expectedCrossings - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('popularity')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // PRACTICAL JOKE
  // ============================================================
  CardProcessor.register({
    id: 'practical_joke',
    name: 'Practical Joke',
    cost: 6,
    image: 'practical_joke.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth >= 2 && n.structureOwner !== p) && p.canAffordCard(6);
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth >= 2 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
    },
    isValidTarget: (p, board, target) => {
      if (!(target instanceof Player)) return false;
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.structureOwner === target && target.currHealth >= 2 && target !== p);
    },
    execute: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      const playerCell = pos && board.getCell(pos.x, pos.y);
      if (!(target instanceof Player) || target.currHealth < 2 || !playerCell
        || !board.getNeighbors(playerCell).some(cell => cell.structureOwner === target)) {
        return { success: false, message: 'Invalid Practical Joke target' };
      }
      if (!p.spendCard(6)) return { success: false, message: 'Need 6 gold' };
      p.addCPs(3);
      target.loseHealths(1);
      p.addHealths(1);
      const targetName = target.name;
      return { success: true, message: `Played Card: Practical Joke - gained 3 CP and stole 1 health from ${targetName}` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 3 * CardHelper.getCP(p);
      const healthValue = CardHelper.getHealthValue(p, evaluator.onNight);
      return cardReward + healthValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth >= 2 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let highestHealth = bestTarget.currHealth;
      for (const target of targets) {
        if (target.currHealth > highestHealth) {
          highestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      const value = 3 * CardHelper.getCP(p) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(6);
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
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth >= 2 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid targets available' };
      }
      
      let bestTarget = targets[0];
      let highestHealth = bestTarget.currHealth;
      for (const target of targets) {
        if (target.currHealth > highestHealth) {
          highestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      console.log(`[Practical Joke] Auto-executing with target ${bestTarget.name} (health: ${bestTarget.currHealth})`);
      return CardProcessor.get('practical_joke')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // PRINCIPAL'S SECRET
  // ============================================================
  CardProcessor.register({
    id: "principals_secret",
    name: "Principal's Secret",
    cost: 16,
    image: 'principals_secret.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Principal's Office" && p.canAffordCard(16) : false;
    },
    getValidTargets: (p, board) => {
      return board.getAllCells().filter(c => c.roomId === 'Cafeteria' && c.isEmpty && !c.isHole);
    },
    isValidTarget: (p, board, target) => {
      return target && target.roomId === 'Cafeteria' && target.isEmpty && !target.isHole;
    },
    execute: (p, board, target) => {
      p.spendCard(16);
      p.addCPs(2);
      p.addNPs(2);
      if (target && target.isEmpty && !target.isHole) {
        const currentPos = board.getPlayerPosition(p);
        if (currentPos) {
          const currentCell = board.getCell(currentPos.x, currentPos.y);
          if (currentCell) currentCell.clear();
        }
        target.setPlayer(p);
      }
      return { success: true, message: "Played Card: Principal's Secret - gained 2 CP, 2 NP, and moved to Cafeteria" };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p);
      
      if (!target) {
        return cardReward - p.costCard(16);
      }
      
      const moveValue = evaluator.getMoveValue(p, target);
      return cardReward + moveValue - p.costCard(16);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.roomId === 'Cafeteria' && c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(16);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.roomId === 'Cafeteria' && c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets in Cafeteria' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + 2 * CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(16);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Principal's Secret] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get("principals_secret")!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // PROTECTION MONEY
  // ============================================================
  CardProcessor.register({
    id: 'protection_money',
    name: 'Protection Money',
    cost: 5,
    image: 'protection_money.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 2 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(1);
      p.addGold(10);
      return { success: true, message: 'Played Card: Protection Money - gained 1 CP and 10 Gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCP(p) + 10 - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCP(p) + 10 - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('protection_money')!.execute(p, board);
      return result;
    }
  });
}