// src/game/cards/CardIndex/DeckPage22.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage22(): void {

  // ============================================================
  // VENDING MACHINE
  // ============================================================
  CardProcessor.register({
    id: 'vending_machine',
    name: 'Vending Machine',
    cost: 15,
    image: 'vending_machine.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currHealth <= 2 && p.canAffordCard(15),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(15);
      p.addSPs(1);
      p.addHealths(1);
      return { success: true, message: 'Played Card: Vending Machine - gained 1 SP and 1 Health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(15);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(15);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('vending_machine')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // LUNCHLADY'S HELPER
  // ============================================================
  CardProcessor.register({
    id: 'lunchladys_helper',
    name: "Lunchlady's Helper",
    cost: 12,
    image: 'lunchladys_helper.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBaits().length >= 2 && p.canAffordCard(12),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addCPs(1);
      p.addNPs(1);
      p.baitRadiusBoost += 1;
      return { success: true, message: "Played Card: Lunchlady's Helper - gained 1 CP, 1 NP, bait radius +1" };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getCP(p) + CardHelper.getNP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 1.25;
      return cardReward + passiveValue - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getCP(p) + CardHelper.getNP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 1.25;
      const value = cardReward + passiveValue - p.costCard(12);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('lunchladys_helper')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // WALL IT OFF!
  // ============================================================
  CardProcessor.register({
    id: 'wall_it_off',
    name: 'Wall it Off!',
    cost: 3,
    image: 'wall_it_off.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 2 && p.canAffordCard(3);
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
    },
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).includes(target) && target.isEmpty && !target.isHole;
    },
    execute: (p, board, target) => {
      p.spendCard(3);
      if (target && target.isEmpty && !target.isHole) {
        target.setBarricade(p);
        return { success: true, message: 'Played Card: Wall it Off! - placed a free barricade' };
      }
      return { success: false, message: 'No valid target for barricade' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return -p.costCard(3);
      const barricadeValue = evaluator.getBarricadePlacementValue(p, target);
      return barricadeValue - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getBarricadePlacementValue(p, target) - p.costCard(3);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
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
      
      const targets = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid cells for barricade placement' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getBarricadePlacementValue(p, target) - p.costCard(3);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Wall it Off!] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('wall_it_off')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // FAILED PROJECT
  // ============================================================
  CardProcessor.register({
    id: 'failed_project',
    name: 'Failed Project',
    cost: 6,
    image: 'failed_project.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 3 && p.canAffordCard(6)
      && board.getAllBarricades().some(c => c.structureOwner && c.structureOwner !== p),
    getValidTargets: (p, board) => {
      return board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasBarricade && target.structureOwner && target.structureOwner !== p;
    },
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addCPs(2);
      if (target && target.hasBarricade) {
        target.removeStructure();
      }
      return { success: true, message: 'Played Card: Failed Project - gained 2 CP and destroyed a barricade' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      
      if (!target || !target.hasBarricade) {
        return cardReward - p.costCard(6);
      }
      
      const barricadeValue = evaluator.getBarricadePlacementValue(p, target);
      const opponentDenial = 5;
      return cardReward + barricadeValue + opponentDenial - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 5 - p.costCard(6);
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
        return { success: false, message: 'No opponent barricades to destroy' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 5 - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Failed Project] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('failed_project')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // WATER COOLER
  // ============================================================
  CardProcessor.register({
    id: 'water_cooler',
    name: 'Water Cooler',
    cost: 4,
    image: 'water_cooler.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Front Desk' && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      p.addHealths(1);
      return { success: true, message: 'Played Card: Water Cooler - gained 1 SP and 1 health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('water_cooler')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // WELL-WORN BOOK
  // ============================================================
  CardProcessor.register({
    id: 'well_worn_book',
    name: 'Well-worn Book',
    cost: 6,
    image: 'well_worn_book.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Library' && p.canAffordCard(6) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addGold(12);
      CardDrawer.drawCards(p, 2);
      return { success: true, message: 'Played Card: Well-worn Book - gained 12 gold and drew 2 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 12 + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 12 + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('well_worn_book')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ZOMBIE FLUSH
  // ============================================================
  CardProcessor.register({
    id: 'zombie_flush',
    name: 'Zombie Flush',
    cost: 9,
    image: 'zombie_flush.jpg',
    targetType: 'zombie',
    canPlay: (p, board) => p.canAffordCard(9),
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) return [];
      return game.zombieManager.getAllZombies();
    },
    isValidTarget: (p, board, target) => target && target.hasZombie,
    execute: (p, board, target) => {
      p.spendCard(9);
      p.addSPs(1);
      
      if (target && target.hasZombie) {
        const game = CardProcessor.getGame();
        if (game && game.zombieManager) {
          const result = game.zombieManager.killZombie(target, p);
          if (!result.success) {
            return { success: false, message: result.message };
          }
        } else {
          target.clear();
        }
      }
      return { success: true, message: 'Played Card: Zombie Flush - gained 1 SP and killed a zombie' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const killValue = evaluator.getZombieKillValue(p, target);
      return CardHelper.getSP(p, evaluator.onNight) + killValue - p.costCard(9);
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
        let value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getZombieKillValue(p, target) - p.costCard(9);
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
        return { success: false, message: 'No zombies to kill' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      const pos = board.getPlayerPosition(p);
      
      for (const target of targets) {
        let value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getZombieKillValue(p, target) - p.costCard(9);
        if (pos) {
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          value += Math.max(0, 4 - dist) * 2;
        }
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Zombie Flush] Auto-executing with zombie at (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('zombie_flush')!.execute(p, board, bestTarget);
    }
  });
}