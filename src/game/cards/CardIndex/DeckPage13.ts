// src/game/cards/CardIndex/DeckPage13.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { GameConstants } from '../../misc/GameConstants';

export function registerPage13(): void {

  // ============================================================
  // MOUTH GUARD
  // ============================================================
  CardProcessor.register({
    id: 'mouth_guard',
    name: 'Mouth Guard',
    cost: 14,
    image: 'mouth_guard.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(14),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(14);
      p.addSPs(1);
      p.addNPs(1);
      p.meleeDiscount += 2;
      return { success: true, message: 'Played Card: Mouth Guard - gained 1 SP, 1 NP, melee costs 2 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const meleePerNight = p.getMeleeEffectiveness() / 5;
      const expectedMeleeAttacks = remainingNights * meleePerNight;
      const passiveValue = expectedMeleeAttacks * 2;
      return cardReward + passiveValue - p.costCard(14);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const meleePerNight = p.getMeleeEffectiveness() / 5;
      const expectedMeleeAttacks = remainingNights * meleePerNight;
      const passiveValue = expectedMeleeAttacks * 2;
      const value = cardReward + passiveValue - p.costCard(14);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('mouth_guard')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // MR. CLEAN
  // ============================================================
  CardProcessor.register({
    id: 'mr_clean',
    name: 'Mr. Clean',
    cost: 2,
    image: 'mr_clean.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Janitor's Closet" && p.currNP >= 5 && p.canAffordCard(2) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addNPs(4);
      return { success: true, message: 'Played Card: Mr. Clean - gained 4 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getNP(p) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getNP(p) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('mr_clean')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // MYSTERY MEAT
  // ============================================================
  CardProcessor.register({
    id: 'mystery_meat',
    name: 'Mystery Meat',
    cost: 5,
    image: 'mystery_meat.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBaits().length >= 1 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.baitDiscount += 2;
      return { success: true, message: 'Played Card: Mystery Meat - bait costs 2 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 0;
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 2;
      return cardReward + passiveValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 2;
      const value = passiveValue - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('mystery_meat')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // NEWSPAPER INTERVIEW
  // ============================================================
  CardProcessor.register({
    id: 'newspaper_interview',
    name: 'Newspaper Interview',
    cost: 12,
    image: 'newspaper_interview.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(12),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addSPs(2);
      const pos = board.getPlayerPosition(p);
      if (pos) {
        const cell = board.getCell(pos.x, pos.y);
        if (cell) {
          const neighbors = board.getNeighbors(cell);
          const count = neighbors.filter(n => n.hasPlayer).length;
          p.addGold(count * 8);
        }
      }
      return { success: true, message: 'Played Card: Newspaper Interview - gained 2 SP and gold based on adjacent players' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const pos = board.getPlayerPosition(p);
      let count = 0;
      if (pos) {
        const cell = board.getCell(pos.x, pos.y);
        if (cell) {
          count = board.getNeighbors(cell).filter(n => n.hasPlayer).length;
        }
      }
      return 2 * CardHelper.getSP(p, evaluator.onNight) + 8 * count - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      let count = 0;
      if (pos) {
        const cell = board.getCell(pos.x, pos.y);
        if (cell) {
          count = board.getNeighbors(cell).filter(n => n.hasPlayer).length;
        }
      }
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) + 8 * count - p.costCard(12);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('newspaper_interview')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // NICE GUYS FINISH LAST
  // ============================================================
  CardProcessor.register({
    id: 'nice_guys_finish_last',
    name: 'Nice Guys Finish Last',
    cost: 6,
    image: 'nice_guys_finish_last.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 4 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      p.addCPs(1);
      p.loseNPs(1);
      return { success: true, message: 'Played Card: Nice Guys Finish Last - gained 1 SP, 1 CP, lost 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) - CardHelper.getNP(p) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) - CardHelper.getNP(p) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('nice_guys_finish_last')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // NICE REMOVAL
  // ============================================================
  CardProcessor.register({
    id: 'nice_removal',
    name: 'Nice Removal',
    cost: 6,
    image: 'nice_removal.jpg',
    targetType: 'zombie',
    canPlay: (p, board) => p.canAffordCard(6),
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) return [];
      return game.zombieManager.getAllZombies();
    },
    isValidTarget: (p, board, target) => target && target.hasZombie,
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addNPs(2);
      
      if (target && target.hasZombie) {
        const game = CardProcessor.getGame();
        if (game && game.zombieManager) { 
          const result = game.zombieManager.removeZombie(target);
          if (!result.success) {
            return { success: false, message: result.message };
          }
        } else {
          target.clear();
        }
      }
      return { success: true, message: 'Played Card: Nice Removal - gained 2 NP and removed a zombie (no kill credit)' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getZombieKillValue(p, target);
      return 2 * CardHelper.getNP(p) + boardValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { target: null, value: 0 };
      }
      
      const targets = game.zombieManager.getAllZombies();
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      const pos = board.getPlayerPosition(p);
      
      for (const target of targets) {
        let value = 2 * CardHelper.getNP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(6);
        if (pos) {
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          value += Math.max(0, 4 - dist) * 2;
        }
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { success: false, message: 'ZombieManager not available' };
      }
      
      const targets = game.zombieManager.getAllZombies();
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No zombies available to remove' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      const pos = board.getPlayerPosition(p);
      
      for (const target of targets) {
        let value = 2 * CardHelper.getNP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(6);
        if (pos) {
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          value += Math.max(0, 4 - dist) * 2;
        }
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Nice Removal] Auto-executing with zombie at (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('nice_removal')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // NOBODY SAW THAT
  // ============================================================
  CardProcessor.register({
    id: 'nobody_saw_that',
    name: 'Nobody Saw That',
    cost: 0,
    image: 'nobody_saw_that.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 4,
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.addSPs(1);
      p.loseCPs(2);
      return { success: true, message: 'Played Card: Nobody Saw That - gained 1 SP, lost 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) - 2 * CardHelper.getCP(p);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) - 2 * CardHelper.getCP(p);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('nobody_saw_that')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // NURSE'S STATION
  // ============================================================
  CardProcessor.register({
    id: 'nurses_station',
    name: "Nurse's Station",
    cost: 14,
    image: 'nurses_station.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(14),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(14);
      p.addSPs(1);
      p.addHealths(1);
      return { success: true, message: "Played Card: Nurse's Station - gained 1 SP and 1 Health" };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(14);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(14);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('nurses_station')!.execute(p, board);
      return result;
    }
  });
}