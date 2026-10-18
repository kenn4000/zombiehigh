// src/game/cards/CardIndex/DeckPage9.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage9(): void {

  // ============================================================
  // GYM CLASS HERO
  // ============================================================
  CardProcessor.register({
    id: 'gym_class_hero',
    name: 'Gym Class Hero',
    cost: 6,
    image: 'gym_class_hero.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      if (!p.canAffordCard(6) || p.currNP < 6) return false;
      const result = MovementUtil.canJumpOver(board, p);
      return result.success;
    },
    getValidTargets: (p, board) => MovementUtil.getValidJumpTargets(board, p),
    isValidTarget: (p, board, target) => {
      const result = MovementUtil.canJumpOver(board, p);
      return result.success && result.targetCell === target;
    },
    execute: (p, board, target) => {
      if (!target) return { success: false, message: 'No target selected' };
      
      const jumpResult = MovementUtil.executeJump(board, p, target);
      if (!jumpResult.success) return { success: false, message: jumpResult.message };
      
      p.spendCard(6);
      p.addNPs(2);
      
      return { 
        success: true, 
        message: `Played Card: Gym Class Hero - gained 2 NP and ${jumpResult.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      return 2 * CardHelper.getNP(p) + boardValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getValidJumpTargets(board, p);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getValidJumpTargets(board, p);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid jump targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Gym Class Hero] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('gym_class_hero')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // ATHLETIC FOOTWEAR
  // ============================================================
  CardProcessor.register({
    id: 'athletic_footwear',
    name: 'Athletic Footwear',
    cost: 8,
    image: 'athletic_footwear.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Gymnasium' && p.canAffordCard(8) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addSPs(1);
      p.gymMovementDiscount = true;
      return { success: true, message: 'Played Card: Athletic Footwear - gained 1 SP, movement costs 1 less in Gymnasium' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      return CardHelper.getSP(p, evaluator.onNight) + passiveValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      const value = CardHelper.getSP(p, evaluator.onNight) + passiveValue - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('athletic_footwear')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // GYMNASTICS TRAINING
  // ============================================================
  CardProcessor.register({
    id: 'gymnastics_training',
    name: 'Gymnastics Training',
    cost: 10,
    image: 'gymnastics_training.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 20 && p.canAffordCard(10),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p) => {
      if (!p.spendCard(10)) return { success: false, message: 'Need 10 gold' };
      p.addSPs(1);
      const action = AllSpecialActions['gymnastics_training'];
      if (!action) return { success: false, message: 'Gymnastics action is not registered' };
      p.actionManager.addAction(action);
      return { success: true, message: 'Played Card: Gymnastics Training - gained 1 SP and unlocked Gymnastics Training Action' };
    },
    expectedValue: (p, board, evaluator) => CardHelper.getSP(p, evaluator.onNight) + 5 - p.costCard(10),
    getOptimalTarget: (p, board, evaluator) => ({
      target: null,
      value: CardHelper.getSP(p, evaluator.onNight) + 5 - p.costCard(10),
    }),
    autoExecute: (p, board) => CardProcessor.get('gymnastics_training')!.execute(p, board),
  });

  // ============================================================
  // HALLWAY HUSTLER
  // ============================================================
  CardProcessor.register({
    id: 'hallway_hustler',
    name: 'Hallway Hustler',
    cost: 8,
    image: 'hallway_hustler.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(8),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addSPs(1);
      p.baitGlobalRefund = true;
      return { success: true, message: 'Played Card: Hallway Hustler - gained 1 SP, and gains 1 gold when any player places bait' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const game = CardProcessor.getGame();
      const alivePlayers = game ? game.players.filter((player: Player) => !player.isEliminated).length : 4;
      const passiveValue = (alivePlayers * remainingNights) / 3;
      return cardReward + passiveValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const game = CardProcessor.getGame();
      const alivePlayers = game ? game.players.filter((player: Player) => !player.isEliminated).length : 4;
      const passiveValue = (alivePlayers * remainingNights) / 3;
      const value = cardReward + passiveValue - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('hallway_hustler')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // HALO EFFECT
  // ============================================================
  CardProcessor.register({
    id: 'halo_effect',
    name: 'Halo Effect',
    cost: 10,
    image: 'halo_effect.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(10),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(10);
      p.addCPs(1);
      p.CPmustNP = true;
      return { success: true, message: 'Played Card: Halo Effect - gained 1 CP, passive: gain CP → lose 2 gold, gain 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const npValue = CardHelper.getNP(p);
      const netValuePerNight = npValue - 2;
      const cardReward = CardHelper.getCP(p) + npValue - 2;
      const passiveValue = netValuePerNight * remainingNights;
      return cardReward + passiveValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const npValue = CardHelper.getNP(p);
      const netValuePerNight = npValue - 2;
      const cardReward = CardHelper.getCP(p) + npValue - 2;
      const passiveValue = netValuePerNight * remainingNights;
      const value = cardReward + passiveValue - p.costCard(10);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('halo_effect')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // HEARTY LUNCH
  // ============================================================
  CardProcessor.register({
    id: 'hearty_lunch',
    name: 'Hearty Lunch',
    cost: 2,
    image: 'hearty_lunch.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Cafeteria' && p.canAffordCard(2) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addNPs(2);
      return { success: true, message: 'Played Card: Hearty Lunch - gained 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getNP(p) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getNP(p) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('hearty_lunch')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // HIDDEN REPORT CARD
  // ============================================================
  CardProcessor.register({
    id: 'hidden_report_card',
    name: 'Hidden Report Card',
    cost: 0,
    image: 'hidden_report_card.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.hand.cards.length >= 2,
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.addGold(8);
      (p as any)._pendingDiscardExclusionId = 'hidden_report_card';
      const excludedId = p.hand.cards.find((card: any) => card.id && card.cardId === 'hidden_report_card')?.id ?? 'hidden_report_card';
      (p as any)._pendingDiscardExclusionId = excludedId;
      CardDrawer.discardDraw(p, 0);
      return { success: true, message: 'Played Card: Hidden Report Card - discarded 1 card and gained 8 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const handSize = Math.max(0, p.hand.cards.length - 2);
      return handSize * handSize / 2 + 4;
    },
    getOptimalTarget: (p, board, evaluator) => {
      const handSize = Math.max(0, p.hand.cards.length - 2);
      const value = handSize * handSize / 2 + 4;
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('hidden_report_card')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // HIRED MUSCLE
  // ============================================================
  CardProcessor.register({
    id: 'hired_muscle',
    name: 'Hired Muscle',
    cost: 6,
    image: 'hired_muscle.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      if (p.currSP > 20 || !p.canAffordCard(6)) return false;
      return board.getAllTraps().some(trap => board.getNeighbors(trap).some(cell => cell.isEmpty && !cell.isHole));
    },
    getValidTargets: (p, board) => {
      return board.getAllTraps().filter(trap => board.getNeighbors(trap).some(cell => cell.isEmpty && !cell.isHole));
    },
    isValidTarget: (p, board, target) => {
      return !!target?.origin?.hasTrap
        && !!target.destination?.isEmpty
        && !target.destination.isHole
        && board.getNeighbors(target.origin).includes(target.destination);
    },
    execute: (p, board, target) => {
      if (!target?.origin?.hasTrap
        || !target.destination?.isEmpty
        || target.destination.isHole
        || !board.getNeighbors(target.origin).includes(target.destination)) {
        return { success: false, message: 'Select a trap and an adjacent empty destination' };
      }
      if (!p.spendCard(6)) return { success: false, message: 'Need 6 gold' };
      p.addSPs(1);

      const trapOwner = target.origin.structureOwner;
      const trapEffectiveness = target.origin.structureData?.effectiveness;
      target.origin.clear();
      target.destination.setTrap(trapOwner!);
      if (trapEffectiveness) {
        target.destination.structureData.effectiveness = trapEffectiveness;
      }
      
      return { 
        success: true, 
        message: `Played Card: Hired Muscle - gained 1 SP and moved a trap to (${target.destination.x},${target.destination.y})`
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      
      const origin = target?.origin ?? target;
      const destination = target?.destination;
      if (!origin?.hasTrap) {
        return cardReward - p.costCard(6);
      }
      
      const currentTrapValue = evaluator.getTrapPlacementValue(p, origin);
      const improvement = destination?.isEmpty
        ? evaluator.getTrapPlacementValue(p, destination) - currentTrapValue
        : 0;
      return cardReward + improvement - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllTraps().filter(trap => board.getNeighbors(trap).some(cell => cell.isEmpty && !cell.isHole));
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestDestination = board.getNeighbors(bestTarget).find(cell => cell.isEmpty && !cell.isHole)!;
      let bestImprovement = -Infinity;
      
      for (const target of targets) {
        const currentValue = evaluator.getTrapPlacementValue(p, target);
        const neighbors = board.getNeighbors(target);
        let bestNeighborValue = currentValue;
        let targetBestDestination = neighbors.find(neighbor => neighbor.isEmpty && !neighbor.isHole)!;
        
        for (const neighbor of neighbors) {
          if (neighbor.isEmpty && !neighbor.isHole) {
            const neighborValue = evaluator.getTrapPlacementValue(p, neighbor);
            if (neighborValue > bestNeighborValue) {
              bestNeighborValue = neighborValue;
              targetBestDestination = neighbor;
            }
          }
        }
        
        const improvement = bestNeighborValue - currentValue;
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestTarget = target;
          bestDestination = targetBestDestination;
        }
      }
      
      const value = CardHelper.getSP(p, evaluator.onNight) + bestImprovement - p.costCard(6);
      return { target: { origin: bestTarget, destination: bestDestination }, value };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllTraps().filter(trap => board.getNeighbors(trap).some(cell => cell.isEmpty && !cell.isHole));
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No traps to move' };
      }
      
      let bestTarget = targets[0];
      let bestDestination = board.getNeighbors(bestTarget).find(cell => cell.isEmpty && !cell.isHole)!;
      let bestImprovement = -Infinity;
      
      for (const target of targets) {
        const currentValue = evaluator.getTrapPlacementValue(p, target);
        const neighbors = board.getNeighbors(target);
        let bestNeighborValue = currentValue;
        let targetBestDestination = neighbors.find(neighbor => neighbor.isEmpty && !neighbor.isHole)!;
        
        for (const neighbor of neighbors) {
          if (neighbor.isEmpty && !neighbor.isHole) {
            const neighborValue = evaluator.getTrapPlacementValue(p, neighbor);
            if (neighborValue > bestNeighborValue) {
              bestNeighborValue = neighborValue;
              targetBestDestination = neighbor;
            }
          }
        }
        
        const improvement = bestNeighborValue - currentValue;
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestTarget = target;
          bestDestination = targetBestDestination;
        }
      }
      
      console.log(`[Hired Muscle] Auto-executing with trap at (${bestTarget.x},${bestTarget.y}) improvement: ${bestImprovement.toFixed(2)}`);
      return CardProcessor.get('hired_muscle')!.execute(p, board, { origin: bestTarget, destination: bestDestination });
    }
  });
}