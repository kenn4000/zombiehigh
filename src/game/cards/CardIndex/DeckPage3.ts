// src/game/cards/CardIndex/DeckPage3.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage3(): void {

  // ============================================================
  // BLIND JUMP
  // ============================================================
  CardProcessor.register({
    id: 'blind_jump',
    name: 'Blind Jump',
    cost: 3,
    image: 'blind_jump.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      if (!p.canAffordCard(3)) return false;
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
      
      p.spendCard(3);
      CardDrawer.drawCards(p, 1);
      
      return { 
        success: true, 
        message: `Played Card: Blind Jump - drew 1 card and ${jumpResult.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target); 
      return boardValue + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getValidJumpTargets(board, p);
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getMoveValue(p, target) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
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
        const value = evaluator.getMoveValue(p, target) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Blind Jump] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('blind_jump')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // BOOBY TRAPS
  // ============================================================
  CardProcessor.register({
    id: 'booby_traps',
    name: 'Booby Traps',
    cost: 2,
    image: 'booby_traps.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const janitorCells = board.getCellsInRoom("Janitor's Closet");
      for (const cell of janitorCells) {
        if (cell.hasTrap && cell.structureOwner === p) {
          return p.canAffordCard(2);
        }
      }
      return false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addGPs(1);
      return { success: true, message: 'Played Card: Booby Traps - gained 1 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const gpValue = CardHelper.getNightsRemaining( evaluator.onNight);
      return gpValue - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const gpValue = CardHelper.getNightsRemaining( evaluator.onNight);
      const value = gpValue - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('booby_traps')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BOOK BARRIERS
  // ============================================================
  CardProcessor.register({
    id: 'book_barriers',
    name: 'Book Barriers',
    cost: 5,
    image: 'book_barriers.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const library = board.getCellsInRoom('Library');
      let barricades = 0;
      for (const cell of library) {
        if (cell.hasBarricade) barricades++;
      }
      return barricades >= 2 && p.canAffordCard(5);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addSPs(2);
      return { success: true, message: 'Played Card: Book Barriers - gained 2 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('book_barriers')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BOOK RETURN SLOT
  // ============================================================
  CardProcessor.register({
    id: 'book_return_slot',
    name: 'Book Return Slot',
    cost: 10,
    image: 'book_return_slot.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell || cell.roomId !== 'Library') return false;
      if (!p.canAffordCard(10)) return false;
      return true;
    },
    getValidTargets: (p, board) => MovementUtil.getTeleportTargetsInRoom(board, 'Science Lab'),
    isValidTarget: (p, board, target) => target && target.roomId === 'Science Lab' && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      if (!target) return { success: false, message: 'No target selected' };
      
      p.spendCard(10);
      p.addGold(10);
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Book Return Slot - ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 10;
      const boardValue = evaluator.getMoveValue(p, target);
      return 10 + boardValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Science Lab');
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 10 + evaluator.getMoveValue(p, target) - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Science Lab');
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 10 + evaluator.getMoveValue(p, target) - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Book Return Slot] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('book_return_slot')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // BOOKMARK
  // ============================================================
  CardProcessor.register({
    id: 'bookmark',
    name: 'Bookmark',
    cost: 8,
    image: 'bookmark.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Library' && p.canAffordCard(8) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addSPs(2);
      const libraryCells = board.getCellsInRoom('Library');
      const zombieCount = libraryCells.filter(c => c.hasZombie).length;
      CardDrawer.drawCards(p, zombieCount);
      return { success: true, message: `Played Card: Bookmark - gained 2 SP and drew ${zombieCount} cards` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const libraryCells = board.getCellsInRoom('Library');
      const zombieCount = libraryCells.filter(c => c.hasZombie).length;
      return 2 * CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, zombieCount) - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const libraryCells = board.getCellsInRoom('Library');
      const zombieCount = libraryCells.filter(c => c.hasZombie).length;
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, zombieCount) - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('bookmark')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BRASS KNUCKLES
  // ============================================================
  CardProcessor.register({
    id: 'brass_knuckles',
    name: 'Brass Knuckles',
    cost: 19,
    image: 'brass_knuckles.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(19),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(19);
      p.addSPs(1);
      p.addCPs(1);
      p.meleeEffectivenessBoost += 1;
      return { success: true, message: 'Played Card: Brass Knuckles - gained 1 SP, 1 CP, and melee effectiveness +1' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p);
      
      let passiveValue = 0;
      
      if (p.getMeleeEffectiveness() < 6) {
        const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
        const spValue = CardHelper.getSP(p, evaluator.onNight);
        const expectedExtraKills = remainingNights / 8;
        let valuePerKill = 2 * spValue;
        passiveValue = expectedExtraKills * valuePerKill;
      }
      
      return cardReward + passiveValue - p.costCard(19);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p);
      
      let passiveValue = 0;
      if (p.getMeleeEffectiveness() < 5) {
        const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
        const spValue = CardHelper.getSP(p, evaluator.onNight);
        const expectedExtraKills = remainingNights / 8;
        let valuePerKill = 2 * spValue;
        passiveValue = expectedExtraKills * valuePerKill;
      }
      
      const value = cardReward + passiveValue - p.costCard(19);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('brass_knuckles')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BROOM HANDLE
  // ============================================================
  CardProcessor.register({
    id: 'broom_handle',
    name: 'Broom Handle',
    cost: 2,
    image: 'broom_handle.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Janitor's Closet" && p.canAffordCard(2) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addNPs(3);
      p.addCPs(3);
      p.addSPs(-1);
      return { success: true, message: 'Played Card: Broom Handle - gained 3 NP, 3 CP, and lost 1 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getNP(p) + 3 * CardHelper.getCP(p) - CardHelper.getSP(p, evaluator.onNight) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getNP(p) + 3 * CardHelper.getCP(p) - CardHelper.getSP(p, evaluator.onNight) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('broom_handle')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BROWN BAG NEGOTIATION
  // ============================================================
  CardProcessor.register({
    id: 'brown_bag_negotiation',
    name: 'Brown Bag Negotiation',
    cost: 6,
    image: 'brown_bag_negotiation.jpg',
    targetType: 'cell',
    canPlay: (p, board) => board.getAllBaits().length > 0 && p.canAffordCard(6),
    getValidTargets: (p, board) => {
      return board.getAllBaits();
    },
    isValidTarget: (p, board, target) => {
      return target && target.hasBait;
    },
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addCPs(2);
      if (target && target.hasBait) {
        const oldOwner = target.structureOwner;
        target.clear();
        target.setBait(p);
        return { success: true, message: `Played Card: Brown Bag Negotiation - replaced ${oldOwner?.name || 'unknown'}'s bait with your own` };
      }
      return { success: true, message: 'Played Card: Brown Bag Negotiation - gained 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      
      if (!target || !target.hasBait) {
        return cardReward - p.costCard(6);
      }
      
      const baitValue = CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, target, evaluator.onNight);
      return cardReward + baitValue - p.costCard(6);
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
        const value = cardReward + baitValue - p.costCard(6);
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
        const value = cardReward + baitValue - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Brown Bag Negotiation] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('brown_bag_negotiation')!.execute(p, board, bestTarget);
    }
  });
}