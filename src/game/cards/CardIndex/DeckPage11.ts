// src/game/cards/CardIndex/DeckPage11.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { GameConstants } from '../../misc/GameConstants';

export function registerPage11(): void {

  // ============================================================
  // LAB ACCIDENT
  // ============================================================
  CardProcessor.register({
    id: 'lab_accident',
    name: 'Lab Accident',
    cost: 3,
    image: 'lab_accident.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Science Lab' && p.canAffordCard(3) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addCPs(2);
      return { success: true, message: 'Played Card: Lab Accident - gained 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getCP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getCP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('lab_accident')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LAST MEAL
  // ============================================================
  CardProcessor.register({
    id: 'last_meal',
    name: 'Last Meal',
    cost: 18,
    image: 'last_meal.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currHealth <= 2 && p.canAffordCard(18),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(18);
      p.addSPs(1);
      p.addNPs(1);
      p.addCPs(1);
      p.addHealths(1);
      return { success: true, message: 'Played Card: Last Meal - gained 1 SP, 1 NP, 1 CP, and 1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) + CardHelper.getCP(p) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(18);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) + CardHelper.getCP(p) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(18);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('last_meal')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LATE PAPER
  // ============================================================
  CardProcessor.register({
    id: 'late_paper',
    name: 'Late Paper',
    cost: 0,
    image: 'late_paper.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 4,
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.addSPs(1);
      p.loseNPs(2);
      return { success: true, message: 'Played Card: Late Paper - gained 1 SP and lost 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) - 2 * CardHelper.getNP(p);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) - 2 * CardHelper.getNP(p);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('late_paper')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LEFTOVER LUNCH TRAY
  // ============================================================
  CardProcessor.register({
    id: 'leftover_lunch_tray',
    name: 'Leftover Lunch Tray',
    cost: 6,
    image: 'leftover_lunch_tray.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.canAffordCard(6),
    getValidTargets: (p, board) => board.getAllCells().filter(c => c.isEmpty && !c.isHole),
    isValidTarget: (p, board, target) => target && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addGold(1);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = StructurePlacement.placeBaitWithEffects(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Leftover Lunch Tray - gained 1 GP and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const baitValue = evaluator.getBaitPlacementValue(p, target);
      const nightsRemaining = CardHelper.getNightsRemaining(evaluator.onNight);
      return nightsRemaining + baitValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 1 + evaluator.getBaitPlacementValue(p, target) - p.costCard(6);
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
        return { success: false, message: 'No valid bait placement targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 1 + evaluator.getBaitPlacementValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Leftover Lunch Tray] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('leftover_lunch_tray')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // WORN LIBRARY CARD
  // ============================================================
  CardProcessor.register({
    id: 'worn_library_card',
    name: 'Worn Library Card',
    cost: 5,
    image: 'worn_library_card.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP <= 20 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(1);
      p.addNPs(1);
      p.loseSPs(1);
      p.cardPlayDiscount += 1;
      return { success: true, message: 'Played Card: Worn Library Card - gained 1 CP, 1 NP, lost 1 SP, cards cost 1 less to play' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getCP(p) + CardHelper.getNP(p) - CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const cardsPerNight = 1.5;
      const passiveValue = remainingNights * cardsPerNight;
      return cardReward + passiveValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getCP(p) + CardHelper.getNP(p) - CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const cardsPerNight = 1.5;
      const passiveValue = remainingNights * cardsPerNight;
      const value = cardReward + passiveValue - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('worn_library_card')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LONG JUMP
  // ============================================================
 CardProcessor.register({
  id: 'long_jump',
  name: 'Long Jump',
  cost: 10,
  image: 'long_jump.jpg',
  targetType: 'cell',
  canPlay: (p, board) => p.canAffordCard(10),
  getValidTargets: (p, board) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return [];
    const result: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: board.getCell(pos.x, pos.y)!, dist: 0 }];
    visited.add(`${pos.x},${pos.y}`);
    
    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;
      if (dist > 0 && dist <= 3 && cell.isEmpty && !cell.isHole && !cell.hasBarricade) {
        result.push(cell);
      }
      if (dist < 3) {
        for (const neighbor of board.getNeighbors(cell)) {
          const key = `${neighbor.x},${neighbor.y}`;
          // Check for barricades
          if (!visited.has(key) && neighbor.isEmpty && !neighbor.isHole && !neighbor.hasBarricade) {
            visited.add(key);
            queue.push({ cell: neighbor, dist: dist + 1 });
          }
        }
      }
    }
    return result;
  },
  isValidTarget: (p, board, target) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return false;
    const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
    return dist <= 3 && target.isEmpty && !target.isHole && !target.hasBarricade;
  },
  execute: (p, board, target) => {
    p.spendCard(10);
    
    if (!target) return { success: false, message: 'No target selected' };
    
    // Check target is valid
    if (target.hasBarricade) {
      return { success: false, message: 'Cannot jump to a tile with a barricade' };
    }
    if (!target.isEmpty || target.isHole) {
      return { success: false, message: 'Target tile is not empty' };
    }
    
    const result = MovementUtil.teleportTo(board, p, target);
    if (!result.success) return { success: false, message: result.message };
    
    p.addGPs(1);
    
    return { 
      success: true, 
      message: `Played Card: Long Jump - gained 1 GP and ${result.message}` 
    };
  },
  expectedValue: (p, board, evaluator, target) => {
    if (!target) return 0;
    const boardValue = evaluator.getMoveValue(p, target);
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
    return gpValue + boardValue - p.costCard(10);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const targets = CardProcessor.get('long_jump')!.getValidTargets(p, board);
    
    if (!targets || targets.length === 0) {
      return { target: null, value: 0 };
    }
    
    let bestTarget = targets[0];
    let bestValue = -Infinity;
    
    for (const target of targets) {
      // Skip targets with barricades
      if (target.hasBarricade) continue;
      const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = gpValue + evaluator.getMoveValue(p, target) - p.costCard(10);
      if (value > bestValue) {
        bestValue = value;
        bestTarget = target;
      }
    }
    
    return { target: bestTarget, value: bestValue };
  },
  autoExecute: (p, board, evaluator) => {
    const targets = CardProcessor.get('long_jump')!.getValidTargets(p, board);
    
    if (!targets || targets.length === 0) {
      return { success: false, message: 'No valid jump targets available' };
    }
    
    let bestTarget = targets[0];
    let bestValue = -Infinity;
    
    for (const target of targets) {
      if (target.hasBarricade) continue;
      const gpValue = 12 - evaluator.onNight;
      const value = gpValue + evaluator.getMoveValue(p, target) - p.costCard(10);
      if (value > bestValue) {
        bestValue = value;
        bestTarget = target;
      }
    }
    
    console.log(`[Long Jump] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
    return CardProcessor.get('long_jump')!.execute(p, board, bestTarget);
  }
});

  // ============================================================
  // PA ANNOUNCEMENT
  // ============================================================
  CardProcessor.register({
    id: 'pa_announcement',
    name: 'PA Announcement',
    cost: 3,
    image: 'pa_announcement.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      return board.getAllCells().some(c => c.hasTrap && c.structureOwner === p && c.roomId === 'Front Desk') && p.canAffordCard(3);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addSPs(1);
      p.addCPs(1);
      p.addNPs(1);
      return { success: true, message: 'Played Card: PA Announcement - gained 1 SP, 1 CP, and 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('pa_announcement')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LUNCH FROM HOME
  // ============================================================
  CardProcessor.register({
    id: 'lunch_from_home',
    name: 'Lunch from Home',
    cost: 7,
    image: 'lunch_from_home.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currHealth <= 3 && p.canAffordCard(7),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(7);
      p.addHealths(1);
      return { success: true, message: 'Played Card: Lunch from Home - gained 1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(7);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(7);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('lunch_from_home')!.execute(p, board);
      return result;
    }
  });
}