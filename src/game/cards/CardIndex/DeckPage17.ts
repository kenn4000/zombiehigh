// src/game/cards/CardIndex/DeckPage17.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage17(): void {

  // ============================================================
  // SELL A KIDNEY
  // ============================================================
  CardProcessor.register({
    id: 'sell_a_kidney',
    name: 'Sell a Kidney',
    cost: 1,
    image: 'sell_a_kidney.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(1),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(1);
      p.addGPs(2);
      p.loseSPs(1);
      return { success: true, message: 'Played Card: Sell a Kidney - gained 2 GP, lost 1 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return 2*gpValue - CardHelper.getSP(p, evaluator.onNight) - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = 2*gpValue - CardHelper.getSP(p, evaluator.onNight) - p.costCard(1);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('sell_a_kidney')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SNITCH
  // ============================================================
  CardProcessor.register({
    id: 'snitch',
    name: 'Snitch',
    cost: 6,
    image: 'snitch.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 4 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addGold(20);
      p.loseCPs(3);
      return { success: true, message: 'Played Card: Snitch - gained 20 Gold, lost 3 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 20 - 3 * CardHelper.getCP(p) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 20 - 3 * CardHelper.getCP(p) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('snitch')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SENIOR PRANK
  // ============================================================
  CardProcessor.register({
    id: 'senior_prank',
    name: 'Senior Prank',
    cost: 4,
    image: 'senior_prank.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 9 && p.canAffordCard(4),
    getValidTargets: (p, board) => {
      return board.getAllTraps();
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasTrap;
    },
    execute: (p, board, target) => {
      p.spendCard(4);
      p.addCPs(2);
      if (target && target.hasTrap) {
        target.clear();
      }
      return { success: true, message: 'Played Card: Senior Prank - gained 2 CP and removed a trap' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      
      if (!target || !target.hasTrap) {
        return cardReward - p.costCard(4);
      }
      
      const trapValue = evaluator.getTrapPlacementValue(p, target);
      return cardReward + trapValue - p.costCard(4);
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
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) + bonus - p.costCard(4);
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
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) + bonus - p.costCard(4);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Senior Prank] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('senior_prank')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // SHOP TEACHER'S PET
  // ============================================================
  CardProcessor.register({
    id: "shop_teachers_pet",
    name: "Shop Teacher's Pet",
    cost: 8,
    image: 'shop_teachers_pet.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 3 && p.canAffordCard(8);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addNPs(1);
      p.barricadeLimitBoost += 1;
      return { success: true, message: "Played Card: Shop Teacher's Pet - gained 1 NP, barricade limit +1" };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getNP(p);
      
      const currentBarricades = board.getAllBarricades().filter(c => c.structureOwner === p).length;
      const barricadeLimit = p.getBarricadeLimit ? p.getBarricadeLimit() : 3;
      const slotsAvailable = barricadeLimit - currentBarricades;
      
      if (slotsAvailable > 2) {
        return cardReward - p.costCard(8);
      }
      
      const zombieCount = board.getAllZombies().length;
      const zombiePressure = Math.min(1, zombieCount / 15);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const passiveValue = zombiePressure * remainingNights / 1.5;
      
      return cardReward + passiveValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getNP(p);
      
      const currentBarricades = board.getAllBarricades().filter(c => c.structureOwner === p).length;
      const barricadeLimit = p.getBarricadeLimit ? p.getBarricadeLimit() : 3;
      const slotsAvailable = barricadeLimit - currentBarricades;
      
      let value;
      if (slotsAvailable > 2) {
        value = cardReward - p.costCard(8);
      } else {
        const zombieCount = board.getAllZombies().length;
        const zombiePressure = Math.min(1, zombieCount / 15);
        const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
        const passiveValue = zombiePressure * remainingNights / 1.5;
        value = cardReward + passiveValue - p.costCard(8);
      }
      
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get("shop_teachers_pet")!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SHUT THAT DOOR!
  // ============================================================
  CardProcessor.register({
    id: 'shut_that_door',
    name: 'Shut that Door!',
    cost: 3,
    image: 'shut_that_door.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.canAffordCard(3),
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
      
      if (!target) return { success: false, message: 'No target selected' };
      
      target.setBarricade(p);
      return { 
        success: true, 
        message: `Played Card: Shut that Door! - placed barricade at (${target.x},${target.y})` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
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
      
      console.log(`[Shut that Door!] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('shut_that_door')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // SIDE HUSTLE
  // ============================================================
  CardProcessor.register({
    id: 'side_hustle',
    name: 'Side Hustle',
    cost: 7,
    image: 'side_hustle.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 18 && p.canAffordCard(7),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(7);
      p.addSPs(1);
      p.addGPs(1);
      return { success: true, message: 'Played Card: Side Hustle - gained 1 SP and 1 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return 2 * CardHelper.getSP(p, evaluator.onNight) + gpValue - p.costCard(7);
    },
    getOptimalTarget: (p, board, evaluator) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) + gpValue - p.costCard(7);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('side_hustle')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SINCERE THANKS
  // ============================================================
  CardProcessor.register({
    id: 'sincere_thanks',
    name: 'Sincere Thanks',
    cost: 5,
    image: 'sincere_thanks.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 2 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addNPs(1);
      p.addGold(10);
      return { success: true, message: 'Played Card: Sincere Thanks - gained 1 NP and 10 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getNP(p) + 10 - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getNP(p) + 10 - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('sincere_thanks')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SKATEBOARD ACCIDENT
  // ============================================================
  CardProcessor.register({
    id: 'skateboard_accident',
    name: 'Skateboard Accident',
    cost: 10,
    image: 'skateboard_accident.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 5 && p.canAffordCard(10),
    getValidTargets: (p, board) => {
      return board.getAllBarricades().filter(c => c.structureOwner && c.structureOwner !== p);
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasBarricade && target.structureOwner && target.structureOwner !== p;
    },
    execute: (p, board, target) => {
      p.spendCard(10);
      p.addSPs(1);
      p.addCPs(2);
      if (target && target.hasBarricade) {
        target.removeStructure();
      }
      return { success: true, message: 'Played Card: Skateboard Accident - gained 1 SP, 2 CP, destroyed a barricade' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getCP(p);
      
      if (!target || !target.hasBarricade) {
        return cardReward - p.costCard(10);
      }
      
      const barricadeValue = evaluator.getBarricadePlacementValue(p, target);
      const opponentDenial = 5;
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
        const value = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 5 - p.costCard(10);
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
        const value = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getCP(p) + evaluator.getBarricadePlacementValue(p, target) + 5 - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Skateboard Accident] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('skateboard_accident')!.execute(p, board, bestTarget);
    }
  });
}