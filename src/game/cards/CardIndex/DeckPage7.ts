// src/game/cards/CardIndex/DeckPage7.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage7(): void {

  // ============================================================
  // DROPPED CASH
  // ============================================================
  CardProcessor.register({
    id: 'dropped_cash',
    name: 'Dropped Cash',
    cost: 1,
    image: 'dropped_cash.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(1),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(1);
      p.addGold(8);
      return { success: true, message: 'Played Card: Dropped Cash - gained 8 Gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 8 - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 8 - p.costCard(1);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('dropped_cash')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DROPPING A COURSE
  // ============================================================
  CardProcessor.register({
    id: 'dropping_a_course',
    name: 'Dropping a Course',
    cost: 6,
    image: 'dropping_a_course.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 6 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addNPs(4); 
      const result = CardDrawer.discardAllDraw(p);
      return { success: true, message: `Played Card: Dropping a Course - gained 4 NP, ${result.message}` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const npValue = 4 * CardHelper.getNP(p);
      const drawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, p.hand.cards.length);
      return npValue + drawValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const npValue = 4 * CardHelper.getNP(p);
      const drawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, p.hand.cards.length);
      const value = npValue + drawValue - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('dropping_a_course')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DUMPSTER DIVING
  // ============================================================
  CardProcessor.register({
    id: 'dumpster_diving',
    name: 'Dumpster Diving',
    cost: 4,
    image: 'dumpster_diving.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.hand.cards.length >= 5 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4); 
      CardDrawer.discardDraw(p, 2);
      return { success: true, message: 'Played Card: Dumpster Diving - discarded 1 card, then drew 2' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('dumpster_diving')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // EMBARASSMENT
  // ============================================================
  CardProcessor.register({
    id: 'embarassment',
    name: 'Embarassment',
    cost: 2,
    image: 'embarassment.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 3 && p.currCP >= 3 && p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addNPs(3);
      p.loseCPs(2);
      return { success: true, message: 'Played Card: Embarassment - gained 3 NP and lost 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getNP(p) - 2 * CardHelper.getCP(p) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getNP(p) - 2 * CardHelper.getCP(p) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('embarassment')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // EMERGENCY RETREAT
  // ============================================================
  CardProcessor.register({
    id: 'emergency_retreat',
    name: 'Emergency Retreat',
    cost: 9,
    image: 'emergency_retreat.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(9),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(9);
      p.addSPs(1);
      p.emergencyRetreat = true;
      return { success: true, message: 'Played Card: Emergency Retreat - gained 1 SP, passive: escape 2 tiles after zombie attack' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const healthSaved = p.currHealth -1;
      const passiveValue = CardHelper.getHealthValue(p, evaluator.onNight) * healthSaved * 0.5;
      return cardReward + passiveValue - p.costCard(9);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const healthSaved = p.currHealth -1;
      const passiveValue = CardHelper.getHealthValue(p, evaluator.onNight) * healthSaved * 0.5;
      const value = cardReward + passiveValue - p.costCard(9);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('emergency_retreat')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ENGINEERING CLUB
  // ============================================================
  CardProcessor.register({
    id: 'engineering_club',
    name: 'Engineering Club',
    cost: 12,
    image: 'engineering_club.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const traps = board.getAllTraps().filter(c => c.structureOwner === p).length;
      return traps === 0 && p.currSP >= 25 && p.canAffordCard(12);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addSPs(2);
      p.trapEffectivenessBoost += 1;
      p.trapDiscount -= 2;
      return { success: true, message: 'Played Card: Engineering Club - gained 2 SP, trap effectiveness +1, traps cost +2 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
  const spValue = CardHelper.getSP(p, evaluator.onNight);
  const cardReward = 2 * spValue;
  
  // Max traps is 2
  const currentTraps = Math.min(
    board.getAllTraps().filter(c => c.structureOwner === p).length,
    2
  );
  
  // Existing traps get free benefit
  const existingBenefit = currentTraps * (spValue / 8);
  
  // Future traps: max 2 total, so remaining = 2 - currentTraps
  const remainingTrapSlots = Math.max(0, 2 - currentTraps);
  const netPerFutureTrap = (spValue / 8) - 2; // benefit - cost penalty
  const futureValue = remainingTrapSlots * netPerFutureTrap;
  
  return cardReward + existingBenefit + futureValue - p.costCard(12);
},
    getOptimalTarget: (p, board, evaluator) => { 
  const spValue = CardHelper.getSP(p, evaluator.onNight);
  const cardReward = 2 * spValue;
  
  // Max traps is 2
  const currentTraps = Math.min(
    board.getAllTraps().filter(c => c.structureOwner === p).length,
    2
  );
  
  // Existing traps get free benefit
  const existingBenefit = currentTraps * (spValue / 8);
  
  // Future traps: max 2 total, so remaining = 2 - currentTraps
  const remainingTrapSlots = Math.max(0, 2 - currentTraps);
  const netPerFutureTrap = (spValue / 8) - 2; // benefit - cost penalty
  const futureValue = remainingTrapSlots * netPerFutureTrap;
  
  let value= cardReward + existingBenefit + futureValue - p.costCard(12);
  return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('engineering_club')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ENGINEERING EXAM KEY
  // ============================================================
  CardProcessor.register({
    id: 'engineering_exam_key',
    name: 'Engineering Exam Key',
    cost: 6,
    image: 'engineering_exam_key.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 5 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addCPs(2);
      p.trapDiscount += 1;
      return { success: true, message: 'Played Card: Engineering Exam Key - gained 2 CP, traps cost 1 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = 2 * CardHelper.getCP(p);
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('engineering_exam_key')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // EXPERIMENT
  // ============================================================
  CardProcessor.register({
    id: 'experiment',
    name: 'Experiment',
    cost: 2,
    image: 'experiment.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Science Lab' && p.currSP <= 25 && p.canAffordCard(2) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addSPs(1);
      p.addGold(8);
      return { success: true, message: 'Played Card: Experiment - gained 1 SP and 8 Gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + 8 - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + 8 - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('experiment')!.execute(p, board);
      return result;
    }
  });
}