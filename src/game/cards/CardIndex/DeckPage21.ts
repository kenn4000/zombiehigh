// src/game/cards/CardIndex/DeckPage21.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { StructurePlacement } from '../../actions/StructurePlacement';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage21(): void {

  // ============================================================
  // TOE SOCKS
  // ============================================================
  CardProcessor.register({
    id: 'toe_socks',
    name: 'Toe Socks',
    cost: 14,
    image: 'toe_socks.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const roomId = board.getCell(pos.x, pos.y)?.roomId;
      const game = CardProcessor.getGame();
      if (!game) return false;
      return game.players
        .filter((pl: Player) => !pl.isEliminated && pl !== p)
        .every((pl: Player) => {
          const pPos = board.getPlayerPosition(pl);
          return pPos ? board.getCell(pPos.x, pPos.y)?.roomId !== roomId : true;
        }) && p.canAffordCard(14);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(14);
      p.addSPs(1);
      p.nongymMovementDiscount = true;
      return { success: true, message: 'Played Card: Toe Socks - gained 1 SP, movement costs 1 less outside Gymnasium' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(2, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(14);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(2, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(14);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('toe_socks')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // TOOLBELT
  // ============================================================
  CardProcessor.register({
    id: 'toolbelt',
    name: 'Toolbelt',
    cost: 7,
    image: 'toolbelt.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 1 && p.canAffordCard(7);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(7);
      p.addSPs(1);
      p.barricadeDiscount += 1;
      return { success: true, message: 'Played Card: Toolbelt - gained 1 SP, barricades cost 1 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(7);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(0.7, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(7);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('toolbelt')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // TRANSFUSION
  // ============================================================
  CardProcessor.register({
    id: 'transfusion',
    name: 'Transfusion',
    cost: 2,
    image: 'transfusion.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth === 1 && n.structureOwner !== p) && p.canAffordCard(2);
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth === 1 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
    },
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).some(n => n.structureOwner === target && target.currHealth === 1 && target !== p);
    },
    execute: (p, board, target) => {
      p.spendCard(2);
      p.addNPs(3);
      p.addHealths(-1);
      let targetName = 'no target';
      if (target && target instanceof Player && target.currHealth === 1) {
        target.addHealths(1);
        targetName = target.name;
      }
      return { success: true, message: `Played Card: Transfusion - gained 3 NP, lost 1 Health, healed ${targetName} from 1 to 2` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 3 * CardHelper.getNP(p) - CardHelper.getHealthValue(p, evaluator.onNight);
      return cardReward - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth === 1 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      const bestTarget = targets[0];
      const value = 3 * CardHelper.getNP(p) - CardHelper.getHealthValue(p, evaluator.onNight) - p.costCard(2);
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
      
      const targets = board.getNeighbors(cell)
        .filter(n => n.hasPlayer && n.structureOwner && n.structureOwner.currHealth === 1 && n.structureOwner !== p)
        .map(n => n.structureOwner!);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No adjacent players with health 1 to heal' };
      }
      
      const bestTarget = targets[0];
      console.log(`[Transfusion] Auto-executing with target ${bestTarget.name} (health: ${bestTarget.currHealth})`);
      return CardProcessor.get('transfusion')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // TRAP FLEX
  // ============================================================
  CardProcessor.register({
    id: 'trap_flex',
    name: 'Trap Flex',
    cost: 6,
    image: 'trap_flex.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 6 && p.canAffordCard(6),
    getValidTargets: (p, board) => board.getAllCells().filter(c => c.isEmpty && !c.isHole),
    isValidTarget: (p, board, target) => target && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addCPs(2);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = StructurePlacement.placeTrapWithEffects(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Trap Flex - gained 2 CP and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const cardReward = 2 * CardHelper.getCP(p);
      const trapValue = evaluator.getTrapPlacementValue(p, target);
      return cardReward + trapValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) - p.costCard(6);
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
        return { success: false, message: 'No valid trap placement targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getCP(p) + evaluator.getTrapPlacementValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Trap Flex] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('trap_flex')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // TRIPLE JUMP
  // ============================================================
  const TRIPLE_JUMP_MAX_STEPS = 6;
  const TRIPLE_JUMP_MAX_JUMPS = 3;
  CardProcessor.register({
    id: 'triple_jump',
    name: 'Triple Jump',
    cost: 6,
    image: 'triple_jump.jpg',
    targetType: 'cell',
    canPlay: (p, board, target) => {
      if (!p.canAffordCard(6)) return false;
      const routes = MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS);
      return routes.some((route) => {
        const toll = route.jumpedObjects.length * p.getObstacleJumpToll();
        return p.gold >= p.costCard(6) + toll && (!target || (route.target.x === target.x && route.target.y === target.y));
      });
    },
    getValidTargets: (p, board) => {
      return MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS)
        .filter((route) => p.gold >= p.costCard(6) + route.jumpedObjects.length * p.getObstacleJumpToll())
        .map((route) => route.target);
    },
    isValidTarget: (p, board, target) => {
      if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return false;
      const route = MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS)
        .find((candidate) => candidate.target.x === target.x && candidate.target.y === target.y);
      return !!route && p.gold >= p.costCard(6) + route.jumpedObjects.length * p.getObstacleJumpToll();
    },
    execute: (p, board, target) => {
      const route = target && MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS)
        .find((candidate) => candidate.target.x === target.x && candidate.target.y === target.y);
      if (!route) return { success: false, message: 'Invalid Triple Jump target' };
      const toll = route.jumpedObjects.length * p.getObstacleJumpToll();
      if (p.gold < p.costCard(6) + toll) return { success: false, message: `Need ${p.costCard(6) + toll} gold for Triple Jump and jump tolls` };

      const position = board.getPlayerPosition(p);
      const currentCell = position && board.getCell(position.x, position.y);
      if (!currentCell) return { success: false, message: 'Player not on board' };

      p.spendCard(6);
      p.spendGold(toll);
      currentCell.clear();
      route.target.setPlayer(p);
      for (const jumpedObject of route.jumpedObjects) {
        jumpedObject.structureOwner?.addGold(1);
      }
      p.addGold(route.jumpedObjects.length * p.getObstacleJumpRefund());
      p.addSPs(1);

      return {
        success: true,
        message: `Played Card: Triple Jump - gained 1 SP and moved 3 steps to (${route.target.x},${route.target.y})`
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const route = MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS)
        .find((candidate) => candidate.target.x === target.x && candidate.target.y === target.y);
      const toll = (route?.jumpedObjects.length ?? 0) * p.getObstacleJumpToll();
      return CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, target) - p.costCard(6) - toll;
    },
    getOptimalTarget: (p, board, evaluator) => {
      const routes = MovementUtil.getShoesMoveRoutes(board, p, TRIPLE_JUMP_MAX_STEPS, TRIPLE_JUMP_MAX_JUMPS)
        .filter((route) => p.gold >= p.costCard(6) + route.jumpedObjects.length * p.getObstacleJumpToll());
      if (routes.length === 0) {
        return { target: null, value: 0 };
      }

      let bestTarget = routes[0].target;
      let bestValue = -Infinity;

      for (const route of routes) {
        const target = route.target;
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, target)
          - p.costCard(6) - route.jumpedObjects.length * p.getObstacleJumpToll();
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }

      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const best = CardProcessor.get('triple_jump')!.getOptimalTarget!(p, board, evaluator);
      if (!best.target) return { success: false, message: 'No valid Triple Jump targets available' };
      return CardProcessor.get('triple_jump')!.execute(p, board, best.target);
    }
  });

  // ============================================================
  // UNDER THE TABLE
  // ============================================================
  CardProcessor.register({
    id: 'under_the_table',
    name: 'Under the Table',
    cost: 5,
    image: 'under_the_table.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBaits().length >= 1 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(1);
      p.baitDiscount += 1;
      return { success: true, message: 'Played Card: Under the Table - gained 1 CP, bait costs 1 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getCP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 1;
      return cardReward + passiveValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getCP(p);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 1;
      const value = cardReward + passiveValue - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('under_the_table')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BACKSTAGE TUNNEL
  // ============================================================
  CardProcessor.register({
    id: 'backstage_tunnel',
    name: 'Backstage Tunnel',
    cost: 11,
    image: 'backstage_tunnel.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Auditorium' && p.canAffordCard(11) : false;
    },
    getValidTargets: (p, board) => MovementUtil.getTeleportTargetsInRoom(board, "Janitor's Closet"),
    isValidTarget: (p, board, target) => target && target.roomId === "Janitor's Closet" && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(11);
      p.addSPs(1);
      p.addCPs(1);
      p.addNPs(1);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Backstage Tunnel - gained 1 SP, 1 CP, 1 NP, and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const cardReward = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p);
      const boardValue = evaluator.getMoveValue(p, target);
      return cardReward + boardValue - p.costCard(11);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, "Janitor's Closet");
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(11);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsInRoom(board, "Janitor's Closet");
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets in Janitor\'s Closet' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + CardHelper.getNP(p) + evaluator.getMoveValue(p, target) - p.costCard(11);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Backstage Tunnel] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('backstage_tunnel')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // TRAP BLUEPRINTS
  // ============================================================
  CardProcessor.register({
    id: 'trap_blueprints',
    name: 'Trap Blueprints',
    cost: 10,
    image: 'trap_blueprints.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      return traps.length >= 2 && p.canAffordCard(10);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(10);
      p.addSPs(2);
      p.trapDiscount += 2;
      return { success: true, message: 'Played Card: Trap Blueprints - gained 2 SP, traps cost 2 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(1.2, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(10);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = 2 * CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(1.2, evaluator.onNight);
      const value = cardReward + passiveValue - p.costCard(10);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('trap_blueprints')!.execute(p, board);
      return result;
    }
  });
}