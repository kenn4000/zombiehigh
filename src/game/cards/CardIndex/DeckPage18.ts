// src/game/cards/CardIndex/DeckPage18.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage18(): void {

  // ============================================================
  // SKIPPING LUNCH TODAY
  // ============================================================
  CardProcessor.register({
    id: 'skipping_lunch_today',
    name: 'Skipping Lunch Today',
    cost: 3,
    image: 'skipping_lunch_today.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      const game = CardProcessor.getGame();
      return p.canAffordCard(3) && !!game?.players.some((player: Player) => player !== p && !player.isEliminated);
    },
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game) return [];
      const alive = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (alive.length === 0) return [];
      const lowestSP = Math.min(...alive.map((pl: Player) => pl.currSP));
      return alive.filter((pl: Player) => pl.currSP === lowestSP);
    },
    isValidTarget: (p, board, target) => {
      if (!(target && target instanceof Player && !target.isEliminated && target !== p)) return false;
      const game = CardProcessor.getGame();
      if (!game) return false;
      const alive = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (alive.length === 0) return false;
      const lowestSP = Math.min(...alive.map((pl: Player) => pl.currSP));
      return target.currSP === lowestSP;
    },
    execute: (p, board, target) => {
      p.spendCard(3);
      p.addNPs(2);
      const amount = Math.min(5, p.gold);
      p.spendGold(amount);
      let targetName = 'no target';
      if (target && target instanceof Player && !target.isEliminated) {
        target.addGold(amount);
        targetName = target.name;
      }
      return { success: true, message: `Played Card: Skipping Lunch Today - gained 2 NP, gave ${amount} gold to ${targetName}` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const npValue = 2 * CardHelper.getNP(p);
      const goldGiven = Math.min(5, p.gold);
      return npValue - goldGiven - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) return { target: null, value: 0 };
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      const lowestSP = Math.min(...targets.map((pl: Player) => pl.currSP));
      const bestTarget = targets.find((pl: Player) => pl.currSP === lowestSP);
      
      if (!bestTarget) {
        return { target: null, value: 0 };
      }
      
      const npValue = 2 * CardHelper.getNP(p);
      const goldGiven = Math.min(5, p.gold);
      const value = npValue - goldGiven - p.costCard(3);
      return { target: bestTarget, value };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) {
        return { success: false, message: 'Game not available' };
      }
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (targets.length === 0) {
        return { success: false, message: 'No valid targets available' };
      }
      
      const lowestSP = Math.min(...targets.map((pl: Player) => pl.currSP));
      const bestTarget = targets.find((pl: Player) => pl.currSP === lowestSP);
      
      if (!bestTarget) {
        return { success: false, message: 'No target found' };
      }
      
      console.log(`[Skipping Lunch Today] Auto-executing with target ${bestTarget.name} (SP: ${bestTarget.currSP})`);
      return CardProcessor.get('skipping_lunch_today')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // SNACK TRACK
  // ============================================================
  CardProcessor.register({
    id: 'snack_track',
    name: 'Snack Track',
    cost: 8,
    image: 'snack_track.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Cafeteria' && p.canAffordCard(8) : false;
    },
    getValidTargets: (p, board) => MovementUtil.getTeleportTargetsInRoom(board, 'Front Desk'),
    isValidTarget: (p, board, target) => target && target.roomId === 'Front Desk' && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(8);
      p.addSPs(2);
      p.loseHealths(1);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Snack Track - gained 2 SP, lost 1 Health, and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      return 2 * CardHelper.getSP(p, evaluator.onNight) - CardHelper.getHealthValue(p, evaluator.onNight) + boardValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Front Desk');
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getSP(p, evaluator.onNight) - CardHelper.getHealthValue(p, evaluator.onNight) + evaluator.getMoveValue(p, target) - p.costCard(8);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, 'Front Desk');
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets in Front Desk' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getSP(p, evaluator.onNight) - CardHelper.getHealthValue(p, evaluator.onNight) + evaluator.getMoveValue(p, target) - p.costCard(8);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Snack Track] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('snack_track')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // SOCIAL BLUR
  // ============================================================
  CardProcessor.register({
    id: 'social_blur',
    name: 'Social Blur',
    cost: 10,
    image: 'social_blur.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP > p.currCP && p.canAffordCard(10),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.NPmustCP = true;
      p.addNPs(1);
      return { success: true, message: 'Played Card: Social Blur - gained 1 NP, passive: gain NP → lose 2 gold, gain 1 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getNP(p) + CardHelper.getCP(p) - 2;
      const passiveValue = CardHelper.getPassiveValue(1, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getNP(p) + CardHelper.getCP(p) - 2;
      const passiveValue = CardHelper.getPassiveValue(1, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(10);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('social_blur')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SPATIAL SWAP
  // ============================================================
  CardProcessor.register({
    id: 'spatial_swap',
    name: 'Spatial Swap',
    cost: 12,
    image: 'spatial_swap.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      const currentCell = pos && board.getCell(pos.x, pos.y);
      return !!currentCell && board.getNeighbors(currentCell).some(cell => cell.isOccupied && !cell.isHole)
        && p.currSP >= 22 && p.canAffordCard(12);
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell).filter(n => n.isOccupied && !n.isHole);
    },
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).includes(target) && target.isOccupied && !target.isHole;
    },
    execute: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      const currentCell = pos && board.getCell(pos.x, pos.y);
      if (!target || !target.isOccupied || target.isHole || !currentCell || !board.getNeighbors(currentCell).includes(target)) {
        return { success: false, message: 'No valid target to swap with' };
      }
      if (!p.spendCard(12)) return { success: false, message: 'Need 12 gold' };
      p.addSPs(2);
      
      // Store target occupant info
      const targetHasPlayer = target.hasPlayer;
      const targetPlayer = target.structureOwner;
      const targetZombieId = target.zombieId;
      const targetHasTrap = target.hasTrap;
      const targetHasBait = target.hasBait;
      const targetHasBarricade = target.hasBarricade;
      const targetStructureData = target.structureData ? { ...target.structureData } : {};
      
      // Clear target
      target.clear();
      
      // Move player to target
      target.setPlayer(p);
      
      // Move whatever was in target to current cell
      currentCell.clear();
      
      if (targetHasPlayer && targetPlayer) {
        currentCell.setPlayer(targetPlayer);
      } else if (targetZombieId) {
        currentCell.zombieId = targetZombieId;
        currentCell.zombieStepsLeft = 0;
        currentCell.zombieTarget = null;
      } else if (targetHasTrap && targetPlayer) {
        currentCell.setTrap(targetPlayer);
        if (targetStructureData.effectiveness) {
          currentCell.structureData.effectiveness = targetStructureData.effectiveness;
        }
      } else if (targetHasBait && targetPlayer) {
        currentCell.setBait(targetPlayer);
        if (targetStructureData.radius) {
          currentCell.structureData.radius = targetStructureData.radius;
        }
      } else if (targetHasBarricade && targetPlayer) {
        currentCell.setBarricade(targetPlayer);
      }
      
      return { 
        success: true, 
        message: `Played Card: Spatial Swap - gained 2 SP and swapped with ${targetHasPlayer ? 'player' : targetZombieId ? 'zombie' : 'structure'} at (${target.x},${target.y})` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      return 2 * CardHelper.getSP(p, evaluator.onNight) + boardValue - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell).filter(n => n.isOccupied);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestScore = -Infinity;
      
      for (const target of targets) {
        let score = evaluator.getMoveValue(p, target);
        if (target.hasZombie) score += 10;
        if (target.hasPlayer && target.structureOwner !== p) score += 5;
        if (target.hasTrap && target.structureOwner !== p) score += 5;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
      
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) + bestScore - p.costCard(11);
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
      
      const targets = board.getNeighbors(cell).filter(n => n.isOccupied);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No occupied adjacent cells to swap with' };
      }
      
      let bestTarget = targets[0];
      let bestScore = -Infinity;
      
      for (const target of targets) {
        let score = evaluator.getMoveValue(p, target);
        if (target.hasZombie) score += 10;
        if (target.hasPlayer && target.structureOwner !== p) score += 5;
        if (target.hasTrap && target.structureOwner !== p) score += 5;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
      
      console.log(`[Spatial Swap] Auto-executing with target (${bestTarget.x},${bestTarget.y})`);
      return CardProcessor.get('spatial_swap')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // SPLIT UP
  // ============================================================
  CardProcessor.register({
    id: 'split_up',
    name: 'Split Up',
    cost: 1,
    image: 'split_up.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const roomId = board.getCell(pos.x, pos.y)?.roomId;
      return board.getAllPlayers()
        .filter((pl: Player) => !pl.isEliminated && pl !== p)
        .every((pl: Player) => {
          const pPos = board.getPlayerPosition(pl);
          return pPos ? board.getCell(pPos.x, pPos.y)?.roomId !== roomId : true;
        }) && p.canAffordCard(1);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(1);
      p.addSPs(2);
      return { success: true, message: 'Played Card: Split Up - gained 2 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(1);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('split_up')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SPOILED MILK
  // ============================================================
  CardProcessor.register({
    id: 'spoiled_milk',
    name: 'Spoiled Milk',
    cost: 4,
    image: 'spoiled_milk.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Cafeteria' && p.currCP >= 6 && p.canAffordCard(4) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addCPs(3);
      return { success: true, message: 'Played Card: Spoiled Milk - gained 3 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getCP(p) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getCP(p) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('spoiled_milk')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SPONSORSHIP
  // ============================================================
  CardProcessor.register({
    id: 'sponsorship',
    name: 'Sponsorship',
    cost: 6,
    image: 'sponsorship.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 8 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      p.addGPs(2);
      return { success: true, message: 'Played Card: Sponsorship - gained 1 SP and 2 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return CardHelper.getSP(p, evaluator.onNight) + 2*gpValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = CardHelper.getSP(p, evaluator.onNight) + 2*gpValue - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('sponsorship')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SPOTTING FOR A STRANGER
  // ============================================================
  CardProcessor.register({
    id: 'spotting_for_a_stranger',
    name: 'Spotting for a Stranger',
    cost: 3,
    image: 'spotting_for_a_stranger.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 3 && p.canAffordCard(3),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addNPs(1);
      CardDrawer.drawCards(p, 1);
      return { success: true, message: 'Played Card: Spotting for a Stranger - gained 1 NP and drew 1 card' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('spotting_for_a_stranger')!.execute(p, board);
      return result;
    }
  });
}