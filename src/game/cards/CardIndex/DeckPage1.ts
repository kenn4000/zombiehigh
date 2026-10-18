// src/game/cards/CardIndex/DeckPage1.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { GameDeckActions } from '../../actions/SpecialActions';

export function registerPage1(): void {

  // ============================================================
  // NOT COOL BRO
  // ============================================================
  CardProcessor.register({
    id: 'not_cool_bro',
    name: 'Not Cool Bro',
    cost: 4,
    image: 'not_cool_bro.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllTraps().length >= 3 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      const game = CardProcessor.getGame();
      if (game) {
        for (const player of game.players) {
          player.trapEffectivenessBoost -= 1;
        }
      }
      p.spendCard(4);
      p.addSPs(1);
      p.addCPs(1);
      return {
        success: true,
        message: 'Played Card: Not Cool Bro - all players Trap Effectiveness -1',
        updates: {}
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p);
      const trapHitValue = CardHelper.getTrapHitValue(p, board, evaluator.allPlayers, evaluator.onNight);
      return cardReward - trapHitValue - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      // No targets needed
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) - 
                    CardHelper.getTrapHitValue(p, board, evaluator.allPlayers, evaluator.onNight) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('not_cool_bro')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // 3D PRINTED WALLS
  // ============================================================
  CardProcessor.register({
    id: '3d_printed_walls',
    name: '3D Printed Walls',
    cost: 6,
    image: 'printed_walls.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 8 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      p.addNPs(1);
      const action = GameDeckActions.printed_walls;
      if (action) {
        p.actionManager.addAction(action);
      }
      return {
        success: true,
        message: 'Played Card: 3D Printed Walls - gained 1 SP, 1 NP, and gained action: Place Barricade (costs 8 gold, once per night)'
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p);
      const nightsLeft = CardHelper.getNightsRemaining(evaluator.onNight);
      const actionValue = 2 * nightsLeft;
      return cardReward + actionValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p);
      const nightsLeft = CardHelper.getNightsRemaining(evaluator.onNight);
      const actionValue = 2 * nightsLeft;
      const value = cardReward + actionValue - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('3d_printed_walls')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // A RANDOM $10 BILL
  // ============================================================
  CardProcessor.register({
    id: 'a_random_10_bill',
    name: 'A Random $10 Bill',
    cost: 0,
    image: 'ten_dollar.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 25,
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.addGold(10);
      return { success: true, message: 'Played Card: 10 Dollar Bill - Gained 10 Gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 10 - p.costCard(0);
    },
    getOptimalTarget: (p, board, evaluator) => {
      return { target: null, value: 10 - p.costCard(0) };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('a_random_10_bill')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // A+ STUDENT
  // ============================================================
  CardProcessor.register({
    id: 'aplus_student',
    name: 'A+ Student',
    cost: 8,
    image: 'aplus_student.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 20 && p.canAffordCard(8),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addNPs(1);
      p.cardPurchaseDiscount += 1;
      return { success: true, message: 'Played Card: A+ Student - Drafting a card costs 1 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getNP(p);
      const passiveValue = CardHelper.getPassiveValue(1.5, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getNP(p);
      const passiveValue = CardHelper.getPassiveValue(1.5, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('aplus_student')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ABANDONED NOTEBOOK
  // ============================================================
  CardProcessor.register({
    id: 'abandoned_notebook',
    name: 'Abandoned Notebook',
    cost: 2,
    image: 'abandoned_notebook.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      CardDrawer.drawCards(p, 2);
      return { success: true, message: 'Played Card: Abandoned Notebook - Drew 2 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('abandoned_notebook')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ALLERGIES
  // ============================================================
  CardProcessor.register({
    id: 'allergies',
    name: 'Allergies',
    cost: 5,
    image: 'allergies.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 5 && board.getAllBaits().length > 0 && p.canAffordCard(5),
    getValidTargets: (p, board) => {
      return board.getAllBaits();
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasBait;
    },
    execute: (p, board, target) => {
      if (!target || !target.hasBait) {
        return { success: false, message: 'No bait at target' };
      }
      p.spendCard(5);
      const tempOwner = target.structureOwner;
      target.clear();
      p.addCPs(2);
      return { success: true, message: `Played Card: Allergies - Removed Bait belonging to ${tempOwner?.name || 'unknown'}` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      if (!target || !target.hasBait) {
        return cardReward - p.costCard(5);
      }
      const baitValue = CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, target, evaluator.onNight);
      return cardReward + baitValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllBaits();
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      for (const target of targets) {
        const cardReward = 2 * CardHelper.getCP(p);
        const baitValue = CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, target, evaluator.onNight);
        const value = cardReward + baitValue - p.costCard(5);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllBaits();
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No bait targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      for (const target of targets) {
        const cardReward = 2 * CardHelper.getCP(p);
        const baitValue = CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, target, evaluator.onNight);
        const value = cardReward + baitValue - p.costCard(5);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Allergies] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('allergies')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // AMBUSHED
  // ============================================================
  CardProcessor.register({
    id: 'ambushed',
    name: 'Ambushed',
    cost: 2,
    image: 'ambushed.jpg',
    targetType: 'multiple',
    maxTargets: 2,
    canPlay: (p, board, targets) => {
      if (!p.canAffordCard(2) || p.currCP < 4) return false;
      
      if (!targets) {
        const emptyCells = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
        return emptyCells.length >= 2;
      }
      
      if (!Array.isArray(targets) || targets.length !== 2) return false;
      for (const target of targets) {
        if (!target || target.isHole || !target.isEmpty) return false;
      }
      return true;
    },
    getValidTargets: (p, board) => {
      return board.getAllCells().filter(c => c.isEmpty && !c.isHole);
    },
    isValidTarget: (p, board, target) => {
      if (Array.isArray(target)) {
        return target.length === 2 && target.every((cell) => cell && cell.isEmpty && !cell.isHole);
      }
      return target && target.isEmpty && !target.isHole;
    },
    execute: (p, board, targets) => {
      if (!targets || targets.length < 1) {
        return { success: false, message: 'No targets selected' };
      }
      
      p.spendCard(2);
      
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { success: false, message: 'ZombieManager not available' };
      }
      
      let spawned = 0;
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      for (const target of targetsArray) {
        if (target && target.isEmpty && !target.isHole) {
          const result = game.zombieManager.spawnZombieAtTarget(target);
          if (result.success) spawned++;
        }
      }
      
      p.addSPs(1);
      p.addCPs(1);
      
      return {
        success: true,
        message: `Played Card: Ambushed - Spawned ${spawned} zombies`,
        updates: {}
      };
    },
    expectedValue: (p, board, evaluator, targets) => {
      // Zombie spawns are neutral - just the card reward (SP + CP)
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      // Score targets by proximity to other players
      const scored = targets.map(t => {
        let score = 0;
        for (const pl of evaluator.allPlayers) {
          if (pl.id === p.id || pl.isEliminated) continue;
          const pPos = board.getPlayerPosition(pl);
          if (!pPos) continue;
          const dist = Math.abs(t.x - pPos.x) + Math.abs(t.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 2;
          }
        }
        return { target: t, score };
      });
      
      scored.sort((a, b) => b.score - a.score);
      const selectedTargets = scored.slice(0, Math.min(2, scored.length)).map(s => s.target);
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) - p.costCard(2);
      
      return { target: selectedTargets, value };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid empty cells available' };
      }
      
      const scored = targets.map(t => {
        let score = 0;
        for (const pl of evaluator.allPlayers) {
          if (pl.id === p.id || pl.isEliminated) continue;
          const pPos = board.getPlayerPosition(pl);
          if (!pPos) continue;
          const dist = Math.abs(t.x - pPos.x) + Math.abs(t.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 2;
          }
        }
        return { target: t, score };
      });
      
      scored.sort((a, b) => b.score - a.score);
      const selectedTargets = scored.slice(0, Math.min(2, scored.length)).map(s => s.target);
      
      console.log(`[Ambushed] Auto-executing with ${selectedTargets.length} targets`);
      return CardProcessor.get('ambushed')!.execute(p, board, selectedTargets);
    }
  });

  // ============================================================
  // ANNOUNCEMENT
  // ============================================================
  CardProcessor.register({
    id: 'announcement',
    name: 'Announcement',
    cost: 4,
    image: 'announcement.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      
      if (board.isPlayerInRoom(p, "Principal's Office")) {
        CardDrawer.drawCards(p, 2);
        return {
          success: true,
          message: 'Played Card: Announcement - gained 1 SP and drew 2 cards'
        };
      }
      
      return {
        success: true,
        message: 'Played Card: Announcement - gained 1 SP'
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      let cardDrawValue = 0;
      if (board.isPlayerInRoom(p, "Principal's Office")) {
        cardDrawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, 2);
      }
      return cardReward + cardDrawValue - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      let cardDrawValue = 0;
      if (board.isPlayerInRoom(p, "Principal's Office")) {
        cardDrawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, 2);
      }
      const value = cardReward + cardDrawValue - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('announcement')!.execute(p, board);
      return result;
    }
  });
}