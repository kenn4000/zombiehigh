// src/game/cards/CardIndex/DeckPage6.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { AllSpecialActions } from '../../actions/SpecialActions';

function getOpponentAdjacentZombies(player: Player, board: Board): BoardCell[] {
  const targets = new Set<BoardCell>();
  for (const opponent of board.getAllPlayers()) {
    if (opponent === player) continue;
    const position = board.getPlayerPosition(opponent);
    if (!position) continue;
    for (const neighbor of board.getNeighbors(position)) {
      if (neighbor.hasZombie) targets.add(neighbor);
    }
  }
  return Array.from(targets);
}

export function registerPage6(): void {

  // ============================================================
  // PHOTO LAB
  // ============================================================
  CardProcessor.register({
    id: 'photo_lab',
    name: 'Photo Lab',
    cost: 2,
    image: 'photo_lab.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      CardDrawer.drawKeep(p, 3, 2);
      return { success: true, message: 'Played Card: Photo Lab - Drew 3 cards and kept 2' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('photo_lab')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DEATH SCENT
  // ============================================================
  CardProcessor.register({
    id: 'death_scent',
    name: 'Death Scent',
    cost: 9,
    image: 'death_scent.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId !== 'Gymnasium' && p.canAffordCard(9) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(9);
      p.addNPs(1);
      p.addCPs(1);
      const pos = board.getPlayerPosition(p);
      const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : '';
      const roomCells = roomId ? board.getCellsInRoom(roomId) : [];
      const zombieCount = roomCells.filter(c => c.hasZombie).length;
      const goldGained = zombieCount * 5;
      p.addGold(goldGained);
      return { success: true, message: `Played Card: Death Scent - gained 1 NP, 1 CP, and ${goldGained} gold` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const pos = board.getPlayerPosition(p);
      const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : '';
      const roomCells = roomId ? board.getCellsInRoom(roomId) : [];
      const zombieCount = roomCells.filter(c => c.hasZombie).length;
      return CardHelper.getNP(p) + CardHelper.getCP(p) + 5 * zombieCount - p.costCard(9);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : '';
      const roomCells = roomId ? board.getCellsInRoom(roomId) : [];
      const zombieCount = roomCells.filter(c => c.hasZombie).length;
      const value = CardHelper.getNP(p) + CardHelper.getCP(p) + 5 * zombieCount - p.costCard(9);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('death_scent')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DEMERIT SLIP
  // ============================================================
  CardProcessor.register({
    id: 'demerit_slip',
    name: 'Demerit Slip',
    cost: 3,
    image: 'demerit_slip.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 3 && p.canAffordCard(3),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addCPs(1);
      CardDrawer.drawCards(p, 1);
      return { success: true, message: 'Played Card: Demerit Slip - gained 1 CP and drew 1 card' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('demerit_slip')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DETENTION SLIP
  // ============================================================
  CardProcessor.register({
    id: 'detention_slip',
    name: 'Detention Slip',
    cost: 3,
    image: 'detention_slip.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Principal's Office" && p.currCP >= 5 && p.canAffordCard(3) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addCPs(4);
      return { success: true, message: 'Played Card: Detention Slip - gained 4 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getCP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getCP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('detention_slip')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DIRTY HALL MONITOR
  // ============================================================
  CardProcessor.register({
    id: 'dirty_hall_monitor',
    name: 'Dirty Hall Monitor',
    cost: 1,
    image: 'dirty_hall_monitor.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 3 && p.currNP >= 3 && p.canAffordCard(1),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(1);
      p.addCPs(3);
      p.addNPs(-2);
      return { success: true, message: 'Played Card: Dirty Hall Monitor - gained 3 CP and lost 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getCP(p) - 2 * CardHelper.getNP(p) - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getCP(p) - 2 * CardHelper.getNP(p) - p.costCard(1);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('dirty_hall_monitor')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DIRTY WORK
  // ============================================================
  CardProcessor.register({
    id: 'dirty_work',
    name: 'Dirty Work',
    cost: 4,
    image: 'dirty_work.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? (board.getCell(pos.x, pos.y)?.roomId === 'Restroom' || board.getCell(pos.x, pos.y)?.roomId === "Janitor's Closet") && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      p.addGold(8);
      return { success: true, message: 'Played Card: Dirty Work - gained 1 SP and 8 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + 8 - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + 8 - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('dirty_work')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DISGUSTING MESS
  // ============================================================
  CardProcessor.register({
    id: 'disgusting_mess',
    name: 'Disgusting Mess',
    cost: 4,
    image: 'disgusting_mess.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Restroom' && p.currCP >= 5 && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addCPs(4);
      return { success: true, message: 'Played Card: Disgusting Mess - gained 4 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getCP(p) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getCP(p) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('disgusting_mess')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DISTRACTION
  // ============================================================
  CardProcessor.register({
    id: 'distraction',
    name: 'Distraction',
    cost: 10,
    image: 'distraction.jpg',
    targetType: 'zombie',
    canPlay: (p, board) => getOpponentAdjacentZombies(p, board).length > 0 && p.canAffordCard(10),
    getValidTargets: (p, board) => getOpponentAdjacentZombies(p, board),
    isValidTarget: (p, board, target) => getOpponentAdjacentZombies(p, board).includes(target),
    execute: (p, board, target) => {
      p.spendCard(10);
      p.addSPs(1);
      p.addNPs(2);
      
      if (target && target.hasZombie) {
        const game = CardProcessor.getGame();
        if (game && game.zombieManager) {
          const result = game.zombieManager.removeZombie(target);
          if (!result.success) {
            return { success: false, message: result.message };
          }
          return { success: true, message: `Played Card: Distraction - gained 1 SP, 2 NP, and removed adjacent zombie (no kill credit)` };
        } else {
          target.clear();
        }
      }
      return { success: true, message: 'Played Card: Distraction - gained 1 SP and 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target || !target.hasZombie) return 0;
      const zombieRemoveValue = evaluator.getZombieKillValue(p, target);
      return CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getNP(p) + zombieRemoveValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = getOpponentAdjacentZombies(p, board);
      if (targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getNP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = getOpponentAdjacentZombies(p, board);
      if (targets.length === 0) return { success: false, message: 'No opponent-adjacent zombies to distract' };
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getNP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(10);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Distraction] Auto-executing with zombie at (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('distraction')!.execute(p, board, bestTarget);
    }
  });
}