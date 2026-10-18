// src/game/cards/CardIndex/DeckPage10.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { ZombieSpawner } from '../../misc/ZombieSpawner';
import { GameConstants } from '../../misc/GameConstants';

export function registerPage10(): void {

  // ============================================================
  // HOLE IN THE CEILING
  // ============================================================
  CardProcessor.register({
    id: 'hole_in_the_ceiling',
    name: 'Hole in the Ceiling',
    cost: 6,
    image: 'hole_in_the_ceiling.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.currCP >= 10 && p.canAffordCard(6),
    getValidTargets: (p, board) => board.getAllCells().filter(c => c.isEmpty && !c.isHole),
    isValidTarget: (p, board, target) => target && target.isEmpty && !target.isHole,
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addSPs(1);
      p.addCPs(2);
      
      if (target) {
        const game = CardProcessor.getGame();
        if (game && game.zombieManager) {
          const result = game.zombieManager.spawnZombieAtTarget(target);
          if (!result.success) {
            return { success: false, message: result.message };
          }
        } else {
          ZombieSpawner.spawnAtTarget(board, target);
        }
      }
      return { success: true, message: 'Played Card: Hole in the Ceiling - gained 1 SP, 2 CP, and spawned a zombie' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      return CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getCP(p) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestScore = -Infinity;
      
      for (const target of targets) {
        let score = 0;
        for (const pl of evaluator.allPlayers) {
          if (pl.id === p.id || pl.isEliminated) continue;
          const pPos = board.getPlayerPosition(pl);
          if (!pPos) continue;
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
      
      const value = CardHelper.getSP(p, evaluator.onNight) + 2 * CardHelper.getCP(p) - p.costCard(6);
      return { target: bestTarget, value };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid targets available' };
      }
      
      let bestTarget = targets[0];
      let bestScore = -Infinity;
      
      for (const target of targets) {
        let score = 0;
        for (const pl of evaluator.allPlayers) {
          if (pl.id === p.id || pl.isEliminated) continue;
          const pPos = board.getPlayerPosition(pl);
          if (!pPos) continue;
          const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
          if (dist <= 3) {
            score += (4 - dist) * 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
        }
      }
      
      console.log(`[Hole in the Ceiling] Auto-executing with target (${bestTarget.x},${bestTarget.y})`);
      return CardProcessor.get('hole_in_the_ceiling')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // HOMERUN BAT
  // ============================================================
  CardProcessor.register({
    id: 'homerun_bat',
    name: 'Homerun Bat',
    cost: 5,
    image: 'homerun_bat.jpg',
    targetType: 'zombie',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      return cell ? board.getNeighbors(cell).some(n => n.hasZombie) && p.canAffordCard(5) : false;
    },
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      return board.getNeighbors(cell).filter(n => n.hasZombie);
    },
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return false;
      return board.getNeighbors(cell).includes(target) && target.hasZombie;
    },
    execute: (p, board, target) => {
      p.spendCard(5);
      p.addSPs(2);
      
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
      
      return { success: true, message: 'Played Card: Homerun Bat - gained 2 SP and killed adjacent zombie' };
    },
    expectedValue: (p, board, evaluator, target) => {
  if (!target) return 0;
  
  const spValue = CardHelper.getSP(p, evaluator.onNight);
  const healthValue = CardHelper.getHealthValue(p, evaluator.onNight);
  const effectiveness = p.getMeleeEffectiveness();
  const successRate = effectiveness / 8;
  
  // Card reward: 2 SP
  const cardReward = 2 * spValue;
  
  // Kill value: health saved if zombie reaches player
  const pos = board.getPlayerPosition(p);
  let healthSaved = 0;
  if (pos) {
    const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
    const willReachPlayer = dist <= evaluator.nightSteps;
    if (willReachPlayer) {
      healthSaved = healthValue;
    }
  }
  const killValue = (2 * spValue + healthSaved) * successRate;
  
  // Total = card reward + kill value
  return cardReward + killValue - p.costCard(5);
},
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const targets = board.getNeighbors(cell).filter(n => n.hasZombie);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getSP(p, evaluator.onNight) + evaluator.getZombieKillValue(p, target) - p.costCard(5);
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
      
      const targets = board.getNeighbors(cell).filter(n => n.hasZombie);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No adjacent zombies to kill' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = 2 * CardHelper.getSP(p, evaluator.onNight) + evaluator.getZombieKillValue(p, target) - p.costCard(5);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Homerun Bat] Auto-executing with zombie at (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('homerun_bat')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // HONOR ROLL
  // ============================================================
  CardProcessor.register({
    id: 'honor_roll',
    name: 'Honor Roll',
    cost: 8,
    image: 'honor_roll.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 5 && p.canAffordCard(8),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addNPs(4);
      return { success: true, message: 'Played Card: Honor Roll - gained 4 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getNP(p) - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getNP(p) - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('honor_roll')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // HYPNOTISM
  // ============================================================
  CardProcessor.register({
    id: 'hypnotism',
    name: 'Hypnotism',
    cost: 9,
    image: 'hypnotism.jpg',
    targetType: 'multiple',
    maxTargets: 2,
    canPlay: (p, board, targets) => {
      const traps = board.getAllTraps().filter(c => c.structureOwner === p).length;
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p).length;
      
      if (traps !== 0 || barricades !== 0) return false;
      if (p.currSP < 20) return false;
      if (!p.canAffordCard(9)) return false;
      
      if (!targets) {
        const game = CardProcessor.getGame();
        if (!game || !game.zombieManager) return false;
        const zombies = game.zombieManager.getAllZombies();
        return zombies.some((z: BoardCell) => game.zombieManager.getZombieMoveTargets(z).length > 0);
      }
      
      if (!Array.isArray(targets) || targets.length !== 2) return false;
      const [zombieCell, targetCell] = targets;
      
      if (!zombieCell || !zombieCell.hasZombie) return false;
      
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) return false;
      if (!targetCell.isEmpty || targetCell.isHole) return false;
      
      return true;
    },
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) return [];
      
      const result: any[] = [];
      const zombies = game.zombieManager.getAllZombies();
      
      for (const zombie of zombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          result.push([zombie, target]);
        }
      }
      
      return result;
    },
    isValidTarget: (p, board, target) => {
      if (!Array.isArray(target) || target.length !== 2) return false;
      const [zombieCell, targetCell] = target;
      
      if (!zombieCell || !zombieCell.hasZombie) return false;
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) return false;
      if (!targetCell.isEmpty || targetCell.isHole) return false;
      
      return true;
    },
    execute: (p, board, targets) => {
      p.spendCard(9);
      p.addSPs(3);
      
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      if (targetsArray.length < 2) {
        return { success: false, message: 'Need both zombie and target location' };
      }
      
      const [zombieCell, targetCell] = targetsArray;
      
      if (!zombieCell || !zombieCell.hasZombie) {
        return { success: false, message: 'No zombie at source' };
      }
      
      const neighbors = board.getNeighbors(zombieCell);
      if (!neighbors.includes(targetCell)) {
        return { success: false, message: 'Target must be adjacent to zombie' };
      }
      if (!targetCell.isEmpty || targetCell.isHole) {
        return { success: false, message: 'Target cell must be empty' };
      }
      
      const game = CardProcessor.getGame();
      if (game && game.zombieManager) {
        const result = game.zombieManager.moveZombieOneStep(zombieCell, targetCell);
        if (!result.success) {
          return { success: false, message: result.message };
        }
        return { 
          success: true, 
          message: `Played Card: Hypnotism - gained 3 SP and ${result.message}` 
        };
      }
      
      return { success: true, message: 'Played Card: Hypnotism - gained 3 SP' };
    },
    expectedValue: (p, board, evaluator, targets) => {
      if (!targets) return 0;
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      if (targetsArray.length < 2) return 0;
      
      const [zombieCell, targetCell] = targetsArray;
      const cardReward = 3 * CardHelper.getSP(p, evaluator.onNight);
      
      let moveValue = 0;
      for (const pl of evaluator.allPlayers) {
        if (pl.id === p.id || pl.isEliminated) continue;
        const pPos = board.getPlayerPosition(pl);
        if (!pPos) continue;
        const distToTarget = Math.abs(targetCell.x - pPos.x) + Math.abs(targetCell.y - pPos.y);
        const distToZombie = Math.abs(zombieCell.x - pPos.x) + Math.abs(zombieCell.y - pPos.y);
        if (distToTarget < distToZombie) {
          moveValue += (distToZombie - distToTarget) * 0.5;
        }
      }
      
      return cardReward + moveValue - p.costCard(9);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { target: null, value: 0 };
      }
      
      const zombies = game.zombieManager.getAllZombies();
      let bestMove: { zombie: BoardCell; target: BoardCell } | null = null;
      let bestValue = -Infinity;
      
      for (const zombie of zombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          let value = 0;
          for (const pl of evaluator.allPlayers) {
            if (pl.id === p.id || pl.isEliminated) continue;
            const pPos = board.getPlayerPosition(pl);
            if (!pPos) continue;
            const distToTarget = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
            const distToZombie = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
            if (distToTarget < distToZombie) {
              value += (distToZombie - distToTarget) * 0.5;
            }
          }
          value += 3 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(9);
          
          if (value > bestValue) {
            bestValue = value;
            bestMove = { zombie, target };
          }
        }
      }
      
      if (!bestMove) {
        return { target: null, value: 0 };
      }
      
      return { target: [bestMove.zombie, bestMove.target], value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { success: false, message: 'ZombieManager not available' };
      }
      
      const zombies = game.zombieManager.getAllZombies();
      let bestMove: { zombie: BoardCell; target: BoardCell } | null = null;
      let bestValue = -Infinity;
      
      for (const zombie of zombies) {
        const moveTargets = game.zombieManager.getZombieMoveTargets(zombie);
        for (const target of moveTargets) {
          let value = 0;
          for (const pl of evaluator.allPlayers) {
            if (pl.id === p.id || pl.isEliminated) continue;
            const pPos = board.getPlayerPosition(pl);
            if (!pPos) continue;
            const distToTarget = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
            const distToZombie = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
            if (distToTarget < distToZombie) {
              value += (distToZombie - distToTarget) * 0.5;
            }
          }
          value += 3 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(9);
          
          if (value > bestValue) {
            bestValue = value;
            bestMove = { zombie, target };
          }
        }
      }
      
      if (!bestMove) {
        return { success: false, message: 'No valid moves available' };
      }
      
      console.log(`[Hypnotism] Auto-executing with zombie at (${bestMove.zombie.x},${bestMove.zombie.y}) -> (${bestMove.target.x},${bestMove.target.y})`);
      return CardProcessor.get('hypnotism')!.execute(p, board, [bestMove.zombie, bestMove.target]);
    }
  });

  // ============================================================
  // IDENTITY CRISIS
  // ============================================================
  CardProcessor.register({
    id: 'identity_crisis',
    name: 'Identity Crisis',
    cost: 4,
    image: 'identity_crisis.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 25 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      const baits = board.getAllBaits().filter(c => c.structureOwner === p);
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      let count = 0;
      for (const cell of traps) { cell.clear(); count++; }
      for (const cell of baits) { cell.clear(); count++; }
      for (const cell of barricades) { cell.clear(); count++; }
      return { success: true, message: `Played Card: Identity Crisis - removed ${count} structures` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      const baits = board.getAllBaits().filter(c => c.structureOwner === p);
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      const structureCount = traps.length + baits.length + barricades.length;
      
      const flexPointsTotal = structureCount * GameConstants.FLEX_POINT_VALUE;
      
      let boardDelta = 0;
      for (const cell of traps) {
        boardDelta -= evaluator.getTrapPlacementValue(p, cell);
      }
      for (const cell of barricades) {
        boardDelta -= evaluator.getBarricadePlacementValue(p, cell);
      }
      for (const cell of baits) {
        boardDelta -= CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, cell, evaluator.onNight);
      }
      
      return flexPointsTotal + boardDelta - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      const baits = board.getAllBaits().filter(c => c.structureOwner === p);
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      const structureCount = traps.length + baits.length + barricades.length;
      
      const flexPointsTotal = structureCount * GameConstants.FLEX_POINT_VALUE;
      
      let boardDelta = 0;
      for (const cell of traps) {
        boardDelta -= evaluator.getTrapPlacementValue(p, cell);
      }
      for (const cell of barricades) {
        boardDelta -= evaluator.getBarricadePlacementValue(p, cell);
      }
      for (const cell of baits) {
        boardDelta -= CardHelper.getBaitRemovalValue(p, board, evaluator.allPlayers, cell, evaluator.onNight);
      }
      
      const value = flexPointsTotal + boardDelta - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('identity_crisis')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // IN MEMORY OF...
  // ============================================================
  CardProcessor.register({
  id: 'in_memory_of',
  name: 'In Memory Of...',
  cost: 1,
  image: 'in_memory_of.jpg',
  targetType: 'none',
  canPlay: (p, board) => {
  console.log(`[in_memory_of] canPlay called for ${p.name}`);
  const pos = board.getPlayerPosition(p);
  if (!pos) {
    console.log(`[in_memory_of] No position`);
    return false;
  }
  const cell = board.getCell(pos.x, pos.y);
  const roomId = cell?.roomId;
  console.log(`[in_memory_of] Room: ${roomId}, SP: ${p.currSP}, Gold: ${p.gold}`);
  console.log(`[in_memory_of] Condition checks: room !== Gymnasium: ${roomId !== 'Gymnasium'}, SP>=20: ${p.currSP >= 20}, canAfford: ${p.canAffordCard(1)}`);
  
  return roomId !== 'Gymnasium' && p.currSP >= 20 && p.canAffordCard(1);
},
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
  p.spendCard(1);
  p.loseHealths(1);
  
  const pos = board.getPlayerPosition(p);
  if (!pos) {
    return { success: false, message: 'Player not on board' };
  }
  
  const roomId = board.getCell(pos.x, pos.y)?.roomId;
  if (!roomId) {
    return { success: false, message: 'Not in a valid room' };
  }
  
  const game = CardProcessor.getGame();
  if (!game) {
    return { success: false, message: 'Game not available' };
  }
  
  const roomCells = board.getCellsInRoom(roomId);
  const zombiesInRoom = roomCells.filter(c => c.hasZombie);
  let killCount = 0;
  
  // Directly clear zombie cells
  for (const zombieCell of zombiesInRoom) {
    // Check if there's a zombie manager with kill method
    if (game.zombieManager && typeof game.zombieManager.killZombie === 'function') {
      const result = game.zombieManager.killZombie(zombieCell, p);
      if (result.success) {
        killCount++;
        p.addSPs(1);
      }
    } else {
      // Directly clear the zombie cell
      // Store the position before clearing
      const x = zombieCell.x;
      const y = zombieCell.y;
      
      // Clear the zombie
      zombieCell.zombieId = null;
      zombieCell.zombieStepsLeft = null;
      zombieCell.zombieTarget = null;
      
      // Also clear any other properties
      zombieCell.clear();
      
      // Since we manually cleared, we need to add SP
      killCount++;
      p.addSPs(1);
      
      // Log the kill
      console.log(`[In Memory Of...] Killed zombie at (${x},${y})`);
    }
  }
  
  if (killCount === 0) {
    return { 
      success: true, 
      message: `Played Card: In Memory Of... - lost 1 health, but no zombies found in ${roomId}` 
    };
  }
  
  return { 
    success: true, 
    message: `Played Card: In Memory Of... - lost 1 health, killed ${killCount} zombies in ${roomId}, gained ${killCount} SP` 
  };
},
  expectedValue: (p, board, evaluator, target) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return -p.costCard(1);
    
    const roomId = board.getCell(pos.x, pos.y)?.roomId;
    if (!roomId) return -p.costCard(1);
    
    if (roomId === 'Gymnasium') return -p.costCard(1) - CardHelper.getHealthValue(p, evaluator.onNight);
    
    const roomCells = board.getCellsInRoom(roomId);
    const zombieCount = roomCells.filter(c => c.hasZombie).length;
    
    const healthLoss = CardHelper.getHealthValue(p, evaluator.onNight);
    const spGain = zombieCount * CardHelper.getSP(p, evaluator.onNight);
    
    return spGain - healthLoss - p.costCard(1);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return { target: null, value: -p.costCard(1) };
    
    const roomId = board.getCell(pos.x, pos.y)?.roomId;
    if (!roomId) return { target: null, value: -p.costCard(1) };
    
    if (roomId === 'Gymnasium') {
      return { target: null, value: -p.costCard(1) - CardHelper.getHealthValue(p, evaluator.onNight) };
    }
    
    const roomCells = board.getCellsInRoom(roomId);
    const zombieCount = roomCells.filter(c => c.hasZombie).length;
    
    const healthLoss = CardHelper.getHealthValue(p, evaluator.onNight);
    const spGain = zombieCount * CardHelper.getSP(p, evaluator.onNight);
    const value = spGain - healthLoss - p.costCard(1);
    
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('in_memory_of')!.execute(p, board);
    return result;
  }
});

  // ============================================================
  // INFLUENCER
  // ============================================================
  CardProcessor.register({
    id: 'influencer',
    name: 'Influencer',
    cost: 5,
    image: 'influencer.jpg',
    targetType: 'none',
    canPlay: (p, board) => board.getAllBarricades().length >= 4 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addSPs(1);
      p.barricadeCrossRefund = true;
      return { success: true, message: 'Played Card: Influencer - gained 1 SP and refunds 2 gold after leaping a barricade or trap' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const opponentObstacles = board.getAllBarricades().length;
      const crossingRate = 0.2 + (opponentObstacles / 10);
      const expectedCrossings = remainingNights * crossingRate;
      const passiveValue = expectedCrossings * 2;
      
      return cardReward + passiveValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const opponentObstacles = board.getAllBarricades().length;
      const crossingRate = 0.2 + (opponentObstacles / 10);
      const expectedCrossings = remainingNights * crossingRate;
      const passiveValue = expectedCrossings * 2;
      const value = cardReward + passiveValue - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('influencer')!.execute(p, board);
      return result;
    }
  });
// ============================================================
// IRON WELDING  
// ============================================================
CardProcessor.register({
  id: 'iron_welding',
  name: 'Iron Welding',
  cost: 12,
  image: 'iron_welding.jpg',
  targetType: 'none',
  canPlay: (p, board) => p.currGP >= 2 && board.getAllBarricades().length >= 4 && p.canAffordCard(12),
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(12);
    p.addSPs(1);
    p.loseGPs(2); 
    p.barricadeEffectivenessBoost += 1;
    return { success: true, message: 'Played Card: Iron Welding - gained 1 SP and barricade effectiveness +1' };
  },
  expectedValue: (p, board, evaluator, target) => {
    const spValue = CardHelper.getSP(p, evaluator.onNight);
    const flexValue = GameConstants.FLEX_POINT_VALUE;
    const cardReward = spValue;
    
    const currentEff = p.getBarricadeEffectiveness();
    if (currentEff >= 6) {
      return cardReward - p.costCard(12);
    }
    
    // Barricade value = spValue + flexValue * 8 / (8 - effectiveness)
    const oldEff = currentEff;
    const newEff = currentEff + 1;
    
    const oldBarricadeValue = spValue + flexValue * 8 / (8 - oldEff);
    const newBarricadeValue = spValue + flexValue * 8 / (8 - newEff);
    const deltaPerBarricade = newBarricadeValue - oldBarricadeValue;
    
    // Value of existing barricades
    const existingBarricades = board.getAllBarricades().filter(c => c.structureOwner === p);
    const existingValue = existingBarricades.length * deltaPerBarricade;
    
    // Value of future barricades (estimated)
    const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
    const futureBarricades = remainingNights * 0.7;
    const futureValue = futureBarricades * deltaPerBarricade;
     
    
    return cardReward + existingValue + futureValue - remainingNights - p.costCard(12);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const spValue = CardHelper.getSP(p, evaluator.onNight);
    const flexValue = GameConstants.FLEX_POINT_VALUE;
    const cardReward = spValue;
    
    const currentEff = p.getBarricadeEffectiveness();
    if (currentEff >= 6) {
      const value = cardReward - p.costCard(12);
      return { target: null, value };
    }
    
    const oldEff = currentEff;
    const newEff = currentEff + 1;
    
    const oldBarricadeValue = spValue + flexValue * 8 / (8 - oldEff);
    const newBarricadeValue = spValue + flexValue * 8 / (8 - newEff);
    const deltaPerBarricade = newBarricadeValue - oldBarricadeValue;
    
    const existingBarricades = board.getAllBarricades().filter(c => c.structureOwner === p);
    const existingValue = existingBarricades.length * deltaPerBarricade;
    
    const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
    const futureBarricades = remainingNights * 0.7;
    const futureValue = futureBarricades * deltaPerBarricade; 
    const value = cardReward + existingValue + futureValue - remainingNights - p.costCard(12);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('iron_welding')!.execute(p, board);
    return result;
  }
});
}