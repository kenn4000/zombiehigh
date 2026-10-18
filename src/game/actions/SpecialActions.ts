
import { getSPValue } from '../cards/CardUtils';
import { Player, Board, BoardCell, StructurePlacement, MovementUtil, CardDrawer, ZombieSpawner, CardHelper, CardProcessor, ActionEffect, sp, cp, np, health, countZombiesInRoom, countBarricadesOnBoard, countTrapsInRoom, GameConstants } from '../index';

function getVonTrapMoveDestinations(board: Board, origin: BoardCell): BoardCell[] {
  const destinations: BoardCell[] = [];
  const queue: { cell: BoardCell; dist: number }[] = [{ cell: origin, dist: 0 }];
  const visited = new Set<string>([`${origin.x},${origin.y}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist > 0 && current.dist <= 2) {
      if (current.cell.isEmpty && !current.cell.isHole && !current.cell.hasTrap && !current.cell.hasBarricade) {
        destinations.push(current.cell);
      }
    }
    if (current.dist >= 2) continue;
    for (const neighbor of board.getNeighbors(current.cell)) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (visited.has(key) || neighbor.isHole) continue;
      visited.add(key);
      queue.push({ cell: neighbor, dist: current.dist + 1 });
    }
  }

  return destinations;
}

function spawnNurseZombie(player: Player, board: Board): { success: boolean; message: string } {
  const position = board.getPlayerPosition(player);
  if (!position) return { success: false, message: 'Player not on board' };

  const roomId = board.getCell(position.x, position.y)?.roomId;
  if (!roomId) return { success: false, message: 'Player not in a room' };

  const candidates = board.getCellsInRoom(roomId).filter(cell => cell.isEmpty && !cell.isHole);
  if (candidates.length === 0) {
    return { success: false, message: 'No empty cells in current room to spawn zombie' };
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const result = ZombieSpawner.spawnAtTarget(board, target);
  if (!result.success) return { success: false, message: result.message };

  player.addCPs(1);
  player.addSPs(2);
  return { success: true, message: `Nurse Action (C) - Spawned zombie in ${roomId}, gained 1 CP and 2 SP` };
}

// ============================================================
// HERO ACTIONS (12 Heroes)
// ============================================================

export const HeroActions: Record<string, ActionEffect> = {

  // ============================================================
  // 1. ANITA BANDAGE - School Nurse
  // ============================================================
  anita_bandage: {
    id: 'hero_anita_bandage',
    name: 'Anita Bandage',
    description: 'Heal or Spawn',
    isDualOption: true,
    options: [
     {
  id: 'nurse_heal',
  name: 'Heal',
  description: 'Heal any opponent in current room by 1 (max 5) to gain 1 NP, 1 SP, 1 card, and gold equal to number of players',
  targetType: 'player',
  goldCost: 0,
  canUse: (player: Player, board: Board, target?: any) => {
    if (!target || !(target instanceof Player) || target.isEliminated || target === player || target.currHealth >= 5) return false;
    const pos = board.getPlayerPosition(player);
    if (!pos) return false;
    const tPos = board.getPlayerPosition(target);
    if (!tPos) return false;
    return board.getCell(pos.x, pos.y)?.roomId === board.getCell(tPos.x, tPos.y)?.roomId;
  },
  execute: (player: Player, board: Board, target?: any) => {
    if (!target || !(target instanceof Player) || target.isEliminated) {
      return { success: false, message: 'Invalid target' };
    }
    
    // Get number of alive players for gold reward
    const game = CardProcessor.getGame();
    let goldReward = 0;
    if (game) {
      const alivePlayers = game.players.filter((p: Player)=> !p.isEliminated).length;
      goldReward = alivePlayers;
    } else {
      goldReward = 2; // Fallback
    }
    
    target.addHealths(1);
    player.addNPs(1);
    player.addSPs(1);
    CardDrawer.drawCards(player, 1);
    player.addGold(goldReward);
    
    return { 
      success: true, 
      message: `Nurse Action (N) - Healed ${target.name} to ${target.currHealth} health, gained 1 NP, 1 card, 1 SP, and ${goldReward} gold` 
    };
  },
  expectedValue: (player: Player, board: Board, evaluator: any, target?: any) => {
    if (!target) return 0;
    
    // Get number of alive players for gold reward
    const game = CardProcessor.getGame();
    let goldReward = 0;
    if (game) {
      const alivePlayers = game.players.filter((p: Player) => !p.isEliminated).length;
      goldReward = alivePlayers;
    } else {
      goldReward = 2;
    }
    
    const npValue = CardHelper.getNP(player) || 0;
    const spValue = CardHelper.getSP(player, evaluator.onNight) || 0;
    const cardValue = 3; // Value of drawing 1 card
    const goldValue = goldReward * 2; // Gold value (2 per gold)
    
    let healthValue = 0;
    if (target && target instanceof Player) {
      const maxHealth = 5;
      const currentHealth = target.currHealth || 0;
      const healthMissing = maxHealth - currentHealth;
      healthValue = healthMissing * 5;
    }
    
    const totalValue = npValue + spValue + cardValue + goldValue + healthValue;
    return totalValue;
  },
  autoExecute: (player: Player, board: Board, evaluator: any) => {
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available' };
    }
    
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }
    
    const roomId = board.getCell(pos.x, pos.y)?.roomId;
    if (!roomId) {
      return { success: false, message: 'Player not in a room' };
    }
    
    const validTargets: Player[] = [];
    for (const p of game.players) {
      if (p === player || p.isEliminated) continue;
      const pPos = board.getPlayerPosition(p);
      if (!pPos) continue;
      const pRoomId = board.getCell(pPos.x, pPos.y)?.roomId;
      if (pRoomId === roomId && p.currHealth < 5) {
        validTargets.push(p);
      }
    }
    
    if (validTargets.length === 0) {
      return { success: false, message: 'No valid targets to heal' };
    }
    
    let bestTarget = validTargets[0];
    let lowestHealth = bestTarget.currHealth;
    for (const p of validTargets) {
      if (p.currHealth < lowestHealth) {
        lowestHealth = p.currHealth;
        bestTarget = p;
      }
    }
    
    // Get number of alive players for gold reward
    let goldReward = 0;
    if (game) {
      const alivePlayers = game.players.filter((p: Player) => !p.isEliminated).length;
      goldReward = alivePlayers;
    } else {
      goldReward = 2;
    }
    
    bestTarget.addHealths(1);
    player.addNPs(1);
    player.addSPs(1);
    CardDrawer.drawCards(player, 1);
    player.addGold(goldReward);
    
    return { 
      success: true, 
      message: `Nurse Action (N) - Healed ${bestTarget.name} to ${bestTarget.currHealth} health, gained 1 NP, 1 SP, 1 card, and ${goldReward} gold` 
    };
  }
},
      {
        id: 'nurse_spawn',
        name: 'Spawn Zombie',
        description: 'Gain 1 CP and 2 SP, spawn 1 zombie in current room (must have open tile)',
        targetType: 'none',
        goldCost: 0,
        canUse: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const roomId = board.getCell(pos.x, pos.y)?.roomId;
          return !!roomId && board.getCellsInRoom(roomId).some(cell => cell.isEmpty && !cell.isHole);
        },
        execute: (player, board) => spawnNurseZombie(player, board),
        expectedValue: (player: Player, board: Board, evaluator: any) =>
          CardHelper.getCP(player) + 2 * CardHelper.getSP(player, evaluator.onNight),
        autoExecute: (player: Player, board: Board) => spawnNurseZombie(player, board)
      }
    ]
  },

// ============================================================
// 2. BARRY CADE - Varsity Football Star
// ============================================================
barry_cade: {
  id: 'hero_barry_cade',
  name: 'Barry Cade',
  description: 'Destroy own barricade or opponent barricade',
  isDualOption: true,
  options: [
    {
      id: 'barry_destroy_own',
      name: 'Destroy Own Barricade',
      description: 'Destroy any one of your own barricades to earn 1 SP and 1 NP',
      targetType: 'cell',
      goldCost: 0,
      canUse: (player, board, target) => {
        if (!target || !target.hasBarricade || target.structureOwner !== player) return false;
        return true;
      },
      execute: (player, board, target) => {
        if (!target || !target.hasBarricade || target.structureOwner !== player) {
          return { success: false, message: 'Invalid target' };
        }
        target.removeStructure();
        player.addSPs(1);
        player.addNPs(1);
        return { success: true, message: `Barry Action (N) - Destroyed own barricade at (${target.x},${target.y}), gained 1 SP and 1 NP` };
      },
      expectedValue: (player, board, evaluator, target) => {
        const spValue = CardHelper.getSP(player, evaluator.onNight);
        const npValue = CardHelper.getNP(player);
        const cardReward = spValue + npValue;
        
        if (!target || !target.hasBarricade || target.structureOwner !== player) {
          return cardReward;
        }
        
        const barricadeValue = evaluator.getBarricadePlacementValue(player, target);
        const total = cardReward - barricadeValue;
        
        return total;
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        const targets = board.getAllBarricades().filter(c => c.structureOwner === player);
        if (targets.length === 0) {
          return { success: false, message: 'No own barricades to destroy' };
        }
        
        // Find the barricade with the lowest value (least loss)
        let bestTarget = targets[0];
        let bestValue = Infinity;
        
        for (const target of targets) {
          const value = evaluator.getBarricadePlacementValue(player, target);
          if (value < bestValue) {
            bestValue = value;
            bestTarget = target;
          }
        }
        
        bestTarget.removeStructure();
        player.addSPs(1);
        player.addNPs(1);
        return { success: true, message: `Barry Action (N) - Destroyed own barricade at (${bestTarget.x},${bestTarget.y}), gained 1 SP and 1 NP` };
      }
    },
    {
      id: 'barry_destroy_opponent',
      name: 'Destroy Opponent Barricade',
      description: 'Destroy any opponent\'s barricade in the same room to gain 1 CP and 6 gold',
      targetType: 'cell',
      goldCost: 0,
      canUse: (player, board, target) => {
        if (!target || !target.hasBarricade || !target.structureOwner || target.structureOwner === player) return false;
        const pos = board.getPlayerPosition(player);
        if (!pos) return false;
        return target.roomId === board.getCell(pos.x, pos.y)?.roomId;
      },
      execute: (player, board, target) => {
        if (!target || !target.hasBarricade || !target.structureOwner || target.structureOwner === player) {
          return { success: false, message: 'Invalid target' };
        }
        const owner = target.structureOwner;
        target.removeStructure();
        owner.addSPs(1);
        player.addCPs(1);
        player.addGold(6);
        return { success: true, message: `Barry Action (C) - Destroyed ${owner.name}'s barricade at (${target.x},${target.y}), gained 1 CP and 6 gold` };
      },
      expectedValue: (player, board, evaluator, target) => {
        const cpValue = CardHelper.getCP(player);
        const goldReward = 4;
        const cardReward = cpValue + goldReward;
        
        if (!target || !target.hasBarricade || !target.structureOwner || target.structureOwner === player) {
          return cardReward;
        }
        
        const barricadeValue = evaluator.getBarricadePlacementValue(player, target);
        const opponentDenial = 5;
        const total = cardReward + barricadeValue + opponentDenial;
        
        return total;
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        const pos = board.getPlayerPosition(player);
        if (!pos) {
          return { success: false, message: 'Player not on board' };
        }
        const roomId = board.getCell(pos.x, pos.y)?.roomId;
        if (!roomId) {
          return { success: false, message: 'Player not in a room' };
        }
        
        const targets = board.getAllBarricades().filter(c => 
          c.structureOwner && c.structureOwner !== player && c.roomId === roomId
        );
        
        if (targets.length === 0) {
          return { success: false, message: 'No opponent barricades in current room' };
        }
        
        const bestTarget = targets[0];
        const owner = bestTarget.structureOwner;
        bestTarget.removeStructure();
        if (owner) owner.addSPs(1);
        player.addCPs(1);
        player.addGold(4);
        return { success: true, message: `Barry Action (C) - Destroyed ${owner?.name}'s barricade at (${bestTarget.x},${bestTarget.y}), gained 1 CP and 4 gold` };
      }
    }
  ]
},

  // ============================================================
  // 3. PHIL T. RAGS - Janitor
  // ============================================================
  phil_t_rags: {
    id: 'hero_phil_t_rags',
    name: 'Phil T. Rags',
    description: 'Lose SP for NP or Place Bait',
    isDualOption: true,
    options: [
      {
        id: 'janitor_lose_sp',
        name: 'Lose SP for NP',
        description: 'Lose 1 SP and gain 3 NP',
        targetType: 'none',
        goldCost: 0,
        canUse: () => true,
        execute: (player) => {
          player.loseSPs(1);
          player.addNPs(3);
          return { success: true, message: 'Janitor Action (N) - Lost 1 SP, gained 3 NP' };
        },
        expectedValue: (player, board, evaluator) => {
          return -CardHelper.getSP(player, evaluator.onNight) + 3 * CardHelper.getNP(player);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          player.loseSPs(1);
          player.addNPs(3);
          return { success: true, message: 'Janitor Action (N) - Lost 1 SP, gained 3 NP' };
        }
      },
      {
        id: 'janitor_place_bait',
        name: 'Place Bait Adjacent to Opponent',
        description: 'Pay 2 gold to gain 2 CP and place a bait adjacent to any opponent',
        targetType: 'cell',
        goldCost: 2,
        canUse: (player, board, target) => {
          if (player.gold < 2) return false;
          if (!target || !target.isEmpty || target.isHole) return false;
          for (const neighbor of board.getNeighbors(target)) {
            if (neighbor.hasPlayer && neighbor.structureOwner !== player) {
              return true;
            }
          }
          return false;
        },
        execute: (player, board, target) => {
          if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
          if (!target || !target.isEmpty || target.isHole) {
            return { success: false, message: 'Invalid target' };
          }
          const result = StructurePlacement.placeBaitWithEffects(board, player, target);
          if (!result.success) return result;
          player.spendGold(2);
          player.addCPs(2);
          return { success: true, message: 'Janitor Action (C) - Placed bait adjacent to opponent, gained 1 CP' };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          return  CardHelper.getCP(player) + evaluator.getBaitPlacementValue(target) - 2;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 2) {
            return { success: false, message: 'Need 2 gold' };
          }
          
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'Game not available' };
          }
          
          // Find all opponents and check adjacent cells
          let bestTarget: BoardCell | null = null;
          let bestScore = -Infinity;
          
          for (const p of game.players) {
            if (p === player || p.isEliminated) continue;
            const pPos = board.getPlayerPosition(p);
            if (!pPos) continue;
            
            const pCell = board.getCell(pPos.x, pPos.y);
            if (!pCell) continue;
            
            for (const neighbor of board.getNeighbors(pCell)) {
              if (neighbor.isEmpty && !neighbor.isHole) {
                const dist = Math.abs(neighbor.x - pos.x) + Math.abs(neighbor.y - pos.y);
                let score = 0;
                // Prefer cells closer to the player
                if (dist <= 2) score += 10 - dist * 2;
                // Prefer cells near other opponents too
                for (const otherP of game.players) {
                  if (otherP === player || otherP === p || otherP.isEliminated) continue;
                  const otherPos = board.getPlayerPosition(otherP);
                  if (!otherPos) continue;
                  const otherDist = Math.abs(neighbor.x - otherPos.x) + Math.abs(neighbor.y - otherPos.y);
                  if (otherDist <= 2) score += (3 - otherDist) * 2;
                }
                if (score > bestScore) {
                  bestScore = score;
                  bestTarget = neighbor;
                }
              }
            }
          }
          
          if (!bestTarget) {
            return { success: false, message: 'No valid target for bait placement' };
          }
          
          const result = StructurePlacement.placeBaitWithEffects(board, player, bestTarget);
          if (!result.success) return result;
          player.spendGold(2);
          player.addCPs(1);
          return { success: true, message: `Janitor Action (C) - Placed bait at (${bestTarget.x},${bestTarget.y}) adjacent to opponent, gained 1 CP` };
        }
      }
    ]
  },

  // ============================================================
  // 4. ELSA VON TRAP - Cheerleading Captain
  // ============================================================
  elsa_von_trap: {
    id: 'hero_elsa_von_trap',
    name: 'Elsa Von Trap',
    description: 'Explode trap or Move trap',
    isDualOption: true,
    options: [
      {
        id: 'von_trap_explode',
        name: 'Explode Trap',
        description: 'Gain 1 NP and explode any of your traps to kill all adjacent zombies, earn 1 SP per zombie killed',
        targetType: 'cell',
        goldCost: 0,
        canUse: (player, board, target) => {
          if (!target || !target.hasTrap || target.structureOwner !== player) return false;
          return true;
        },
        execute: (player, board, target) => {
          if (!target || !target.hasTrap || target.structureOwner !== player) {
            return { success: false, message: 'Invalid target' };
          }
          const neighbors = board.getNeighbors(target);
          let killed = 0;
          for (const neighbor of neighbors) {
            if (neighbor.hasZombie) {
              const game = CardProcessor.getGame();
              if (game && game.zombieManager) {
                const result = game.zombieManager.killZombie(neighbor, player);
                if (result.success) killed++;
              } else {
                neighbor.clear();
                killed++;
              }
            }
          }
          target.clear();
          player.addNPs(1);
          player.addSPs(killed);
          return { success: true, message: `Cheerleader Action (N) - Exploded trap, killed ${killed} zombies, gained 1 NP and ${killed} SP` };
        },
        expectedValue: (player, board, evaluator, target) => {
  if (!target || !target.hasTrap || target.structureOwner !== player) {
    return 0;
  }
  
  const npValue = CardHelper.getNP(player);
  const spValue = CardHelper.getSP(player, evaluator.onNight);
  
  // Count adjacent zombies
  const neighbors = board.getNeighbors(target);
  const zombieCount = neighbors.filter((n: BoardCell) => n.hasZombie).length;
  
  // Each zombie killed gives 1 SP
  const killValue = zombieCount * spValue;
  
  // Direct calculation: NP + (zombies killed * SP)
  const total = npValue + killValue;
  
  console.log(`[Elsa Explode Trap] np: ${npValue}, zombieCount: ${zombieCount}, killValue: ${killValue}, total: ${total}`);
  
  return total;
},
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const traps = board.getAllTraps().filter(c => c.structureOwner === player);
          if (traps.length === 0) {
            return { success: false, message: 'No own traps to explode' };
          }
          
          // Find the trap with the most adjacent zombies
          let bestTrap = traps[0];
          let mostZombies = 0;
          
          for (const trap of traps) {
            const neighbors = board.getNeighbors(trap);
            const zombieCount = neighbors.filter(n => n.hasZombie).length;
            if (zombieCount > mostZombies) {
              mostZombies = zombieCount;
              bestTrap = trap;
            }
          }
          
          const neighbors = board.getNeighbors(bestTrap);
          let killed = 0;
          for (const neighbor of neighbors) {
            if (neighbor.hasZombie) {
              const game = CardProcessor.getGame();
              if (game && game.zombieManager) {
                const result = game.zombieManager.killZombie(neighbor, player);
                if (result.success) killed++;
              } else {
                neighbor.clear();
                killed++;
              }
            }
          }
          bestTrap.clear();
          player.addNPs(1);
          player.addSPs(killed);
          return { success: true, message: `Cheerleader Action (N) - Exploded trap at (${bestTrap.x},${bestTrap.y}), killed ${killed} zombies, gained 1 NP and ${killed} SP` };
        }
      },
      {
        id: 'von_trap_move',
        name: 'Move Trap 2 Steps',
        description: 'Gain 1 CP and move any of your traps 2 steps',
        targetType: 'cell',
        goldCost: 0,
        canUse: (player, board, target) => {
          if (!target) return false;

          if (typeof target === 'object' && 'origin' in target && 'destination' in target) {
            const origin = target.origin as BoardCell;
            const destination = target.destination as BoardCell;
            if (!origin || !destination) return false;
            if (!origin.hasTrap || origin.structureOwner !== player) return false;
            const validDestinations = getVonTrapMoveDestinations(board, origin);
            return validDestinations.some((cell) => cell.x === destination.x && cell.y === destination.y);
          }

          if (!target.hasTrap || target.structureOwner !== player) return false;
          return getVonTrapMoveDestinations(board, target).length > 0;
        },
        execute: (player, board, target) => {
          const origin = (target && typeof target === 'object' && 'origin' in target) ? (target.origin as BoardCell) : target;
          const destination = (target && typeof target === 'object' && 'destination' in target) ? (target.destination as BoardCell) : undefined;

          if (!origin || !origin.hasTrap || origin.structureOwner !== player) {
            return { success: false, message: 'Invalid target' };
          }

          const validDestinations = getVonTrapMoveDestinations(board, origin);
          const finalDestination = destination ?? validDestinations[0];
          if (!finalDestination) {
            return { success: false, message: 'No valid destination within 2 steps' };
          }

          if (destination && !validDestinations.some((cell) => cell.x === destination.x && cell.y === destination.y)) {
            return { success: false, message: 'Destination is not within 2 steps of the trap' };
          }

          const trapOwner = origin.structureOwner;
          const effectiveness = origin.structureData.effectiveness;
          origin.clear();
          finalDestination.setTrap(trapOwner!);
          finalDestination.structureData.effectiveness = effectiveness;
          player.addCPs(1);
          return { success: true, message: 'Cheerleader Action (C) - Moved trap 2 steps, gained 1 CP' };
        },
        expectedValue: (player, board, evaluator, target) => {
  if (!target || !target.hasTrap || target.structureOwner !== player) {
    return 0;
  }
  
  const cpValue = CardHelper.getCP(player);
  
  // Direct calculation: CP reward + improvement from moving trap
  // Find the best empty cell within 2 steps
  const destinations = MovementUtil.getCellsWithinSteps(board, player, 2, true);
  const emptyTarget = destinations.find(c => c.isEmpty && !c.isHole);
  
  let moveValue = 1;
  if (emptyTarget) {
    // Value of moving the trap to a better position
    const currentValue = evaluator.getTrapPlacementValue(player, target);
    const newValue = evaluator.getTrapPlacementValue(player, emptyTarget);
    moveValue = newValue - currentValue;
  }
  
  const total = cpValue + moveValue;
  
  console.log(`[Elsa Move Trap] cp: ${cpValue}, moveValue: ${moveValue}, total: ${total}`);
  
  return total;
},
        autoExecute: (player: Player, board: Board, evaluator: any) => {
  const traps = board.getAllTraps().filter(c => c.structureOwner === player);
  if (traps.length === 0) {
    return { success: false, message: 'No own traps to move' };
  }
  
  // Find the trap with the best destination
  let bestTrap = traps[0];
  let bestScore = -Infinity;
  let bestDestination: BoardCell | null = null;
  
  for (const trap of traps) {
    const destinations = MovementUtil.getCellsWithinSteps(board, player, 2, true);
    for (const dest of destinations) {
      if (dest.isEmpty && !dest.isHole) {
        let score = 0;
        const zombies = board.getAllZombies();
        for (const zombie of zombies) {
          const dist = Math.abs(dest.x - zombie.x) + Math.abs(dest.y - zombie.y);
          if (dist <= 2) score += (3 - dist) * 3;
        }
        if (score > bestScore) {
          bestScore = score;
          bestTrap = trap;
          bestDestination = dest;
        }
      }
    }
  }
  
  if (!bestDestination) {
    return { success: false, message: 'No valid destination within 2 steps' };
  }
  
  const trapOwner = bestTrap.structureOwner;
  const effectiveness = bestTrap.structureData.effectiveness;
  bestTrap.clear();
  bestDestination.setTrap(trapOwner!);
  bestDestination.structureData.effectiveness = effectiveness;
  player.addCPs(1);
  return { success: true, message: `Moved trap from (${bestTrap.x},${bestTrap.y}) to (${bestDestination.x},${bestDestination.y})` };
}
      }
    ]
  },

  // ============================================================
  // 5. BROCK SLAYTON - School Bully
  // ============================================================
  brock_slayton: {
    id: 'hero_brock_slayton',
    name: 'Brock Slayton',
    description: 'Free Melee or Spawn Zombie',
    isDualOption: true,
    options: [
      {
  id: 'bully_melee',
  name: 'Free Melee Attack',
  description: 'Take one free melee attack (success based on melee effectiveness), if successful gain 2 SP + 1 NP, if failed gain 1 NP as consolation',
  attackType: 'melee',
  targetType: 'zombie',
  goldCost: 0,
  canUse: (player, board, target) => {
    if (!target || !target.hasZombie) return false;
    const pos = board.getPlayerPosition(player);
    if (!pos) return false;
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) return false;
    return board.getNeighbors(cell).includes(target);
  },
  execute: (player, board, target) => {
    if (!target || !target.hasZombie) {
      return { success: false, message: 'Invalid target' };
    }
    
    // Calculate success rate based on melee effectiveness / 8
    const effectiveness = player.getMeleeEffectiveness();
    const successRate = Math.min(effectiveness / 8, 1);
    const roll = Math.random();
    const isSuccess = roll < successRate;
    
    if (isSuccess) {
      // Success! Kill the zombie
      const game = CardProcessor.getGame();
      if (game && game.zombieManager) {
        const result = game.zombieManager.killZombie(target, player);
        if (result.success) {
          player.addSPs(2);  // Standard melee SP
          player.addNPs(1);  // Bonus NP for successful bully melee
          return { 
            success: true, 
            message: `Bully Action (N) - Melee killed zombie! (${(successRate * 100).toFixed(0)}% success rate)` 
          };
        }
        return result;
      }
      target.clear();
      player.addSPs(2);
      player.addNPs(1);
      return { 
        success: true, 
        message: `Bully Action (N) - Melee killed zombie! (${(successRate * 100).toFixed(0)}% success rate)` 
      };
    } else {
      // Failed! Get consolation NP
      player.addNPs(1);
      return { 
        success: true, 
        message: `Bully Action (N) - Melee failed (${(successRate * 100).toFixed(0)}% success rate), gained 1 NP as consolation` 
      };
    }
  },
  expectedValue: (player, board, evaluator, target) => {
    if (!target) return 0;
    
    const effectiveness = player.getMeleeEffectiveness();
    const successRate = Math.min(effectiveness / 8, 1);
    const spValue = CardHelper.getSP(player, evaluator.onNight) || 0;
    const npValue = CardHelper.getNP(player) || 0;
    const killValue = evaluator.getZombieKillValue(player, target);
    
    // Expected value = (success chance * (kill value + 2 SP + 1 NP)) + (fail chance * 1 NP)
    const successValue = killValue + (2 * spValue) + npValue;
    const failValue = npValue;
    
    return (successRate * successValue) + ((1 - successRate) * failValue);
  },
  autoExecute: (player: Player, board: Board, evaluator: any) => {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) {
      return { success: false, message: 'Player cell not found' };
    }
    
    const targets = board.getNeighbors(cell).filter(n => n.hasZombie);
    if (targets.length === 0) {
      return { success: false, message: 'No adjacent zombies to attack' };
    }
    
    // Pick the zombie with the highest kill value
    let bestTarget = targets[0];
    let bestValue = -Infinity;
    for (const target of targets) {
      const value = evaluator.getZombieKillValue(player, target);
      if (value > bestValue) {
        bestValue = value;
        bestTarget = target;
      }
    }
    
    // Calculate success rate
    const effectiveness = player.getMeleeEffectiveness();
    const successRate = Math.min(effectiveness / 8, 1);
    const roll = Math.random();
    const isSuccess = roll < successRate;
    
    if (isSuccess) {
      const game = CardProcessor.getGame();
      if (game && game.zombieManager) {
        const result = game.zombieManager.killZombie(bestTarget, player);
        if (result.success) {
          player.addSPs(2);
          player.addNPs(1);
          return { 
            success: true, 
            message: `Bully Action (N) - Melee killed zombie at (${bestTarget.x},${bestTarget.y})! (${(successRate * 100).toFixed(0)}% success rate)` 
          };
        }
        return result;
      }
      bestTarget.clear();
      player.addSPs(2);
      player.addNPs(1);
      return { 
        success: true, 
        message: `Bully Action (N) - Melee killed zombie at (${bestTarget.x},${bestTarget.y})! (${(successRate * 100).toFixed(0)}% success rate)` 
      };
    } else {
      player.addNPs(1);
      return { 
        success: true, 
        message: `Bully Action (N) - Melee failed at (${bestTarget.x},${bestTarget.y}) (${(successRate * 100).toFixed(0)}% success rate), gained 1 NP as consolation` 
      };
    }
  }
},
      {
  id: 'bully_spawn',
  name: 'Spawn Zombie',
  description: 'Gain 1 CP, draw 1 card, and spawn 1 zombie (roll room die)',
  targetType: 'none',
  goldCost: 0,
  canUse: (player, board) => { 
    const emptyCells = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
    return emptyCells.length > 0;
  },
  execute: (player, board) => { 
    const result = ZombieSpawner.spawnRandom(board);
    if (!result.success) return result;
    
    player.addCPs(1);
    CardDrawer.drawCards(player, 1);
    return { success: true, message: `Bully Action (C) - Spawned zombie in random room, gained 3 gold, 1 CP, and drew 1 card` };
  },
  expectedValue: (player, board, evaluator) => {
    const cpValue = CardHelper.getCP(player);
    const goldValue = 3;
    const cardDrawValue = CardHelper.getCardDrawValue(player, evaluator.onNight, 1); 
    return cpValue + goldValue + cardDrawValue;
  },
  autoExecute: (player: Player, board: Board, evaluator: any) => {
    const result = ZombieSpawner.spawnRandom(board);
    if (!result.success) return result;
    player.addGold(3);
    player.addCPs(1);
    CardDrawer.drawCards(player, 1);
    return { success: true, message: `Bully Action (C) - Spawned zombie in random room, gained 3 gold, 1 CP, and drew 1 card` };
  }
}
    ]
  },

  // ============================================================
  // 6. CIA LADER - Track Star
  // ============================================================
  cia_lader: {
    id: 'hero_cia_lader',
    name: 'Cia Lader',
    description: 'Jump Over or Move Opponent',
    isDualOption: true,
    options: [
      {
        id: 'track_jump',
        name: 'Jump Over',
        description: 'Gain 1 SP and 1 NP and jump over opponent player or trap (must have empty tile behind)',
        targetType: 'cell',
        goldCost: 0,
        canUse: (player, board, target): boolean => {
  if (!target) return false;
  if (typeof target !== 'object' || !('x' in target) || !('y' in target)) return false;
  
  // Target must be a player or trap
  if (!target.hasPlayer && !target.hasTrap) return false;
  
  const pos = board.getPlayerPosition(player);
  if (!pos) return false;
  
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  
  const landingX = pos.x + dx * 2;
  const landingY = pos.y + dy * 2;
  const landingCell = board.getCell(landingX, landingY);
  
  return !!(landingCell && landingCell.isEmpty && !landingCell.isHole);
},
        execute: (player, board, target) => {
          if (!target || (!target.hasPlayer && !target.hasTrap)) {
            return { success: false, message: 'Must jump over an adjacent player or trap' };
          }
          const pos = board.getPlayerPosition(player);
          if (!pos) return { success: false, message: 'Player not on board' };
          const dx = target.x - pos.x;
          const dy = target.y - pos.y;
          if (Math.abs(dx) + Math.abs(dy) !== 1) {
            return { success: false, message: 'Track jumps must be cardinal' };
          }
          const landingX = pos.x + dx * 2;
          const landingY = pos.y + dy * 2;
          const landingCell = board.getCell(landingX, landingY);
          if (!landingCell || !landingCell.isEmpty || landingCell.isHole) {
            return { success: false, message: 'No empty landing tile' };
          }
          const currentCell = board.getCell(pos.x, pos.y);
          if (currentCell) currentCell.clear();
          landingCell.setPlayer(player);
          player.addSPs(1);
          player.addNPs(1);
          return { success: true, message: 'Track Action (N) - Jump to gain 1 SP and 1 NP' };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          const pos = board.getPlayerPosition(player);
          if (!pos) return 0;
          const dx = target.x - pos.x;
          const dy = target.y - pos.y;
          if (Math.abs(dx) + Math.abs(dy) !== 1) return 0;
          const landingX = pos.x + dx * 2;
          const landingY = pos.y + dy * 2;
          const landingCell = board.getCell(landingX, landingY);
          if (!landingCell) return 0;
          return CardHelper.getSP(player, evaluator.onNight) +CardHelper.getNP(player)+ evaluator.getMoveValue(player, landingCell);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Player cell not found' };
          }
          
          // Find adjacent player or trap to jump over
          const targets = board.getNeighbors(cell).filter(n => n.hasPlayer || n.hasTrap);
          
          if (targets.length === 0) {
            return { success: false, message: 'No adjacent player or trap to jump over' };
          }
          
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          
          for (const target of targets) {
            const dx = target.x - pos.x;
            const dy = target.y - pos.y;
            const landingX = pos.x + dx * 2;
            const landingY = pos.y + dy * 2;
            const landingCell = board.getCell(landingX, landingY);
            if (landingCell && landingCell.isEmpty && !landingCell.isHole) {
              // Score the landing position: prefer cells that are safe (far from zombies)
              let score = 0;
              const zombies = board.getAllZombies();
              for (const zombie of zombies) {
                const dist = Math.abs(landingCell.x - zombie.x) + Math.abs(landingCell.y - zombie.y);
                if (dist <= 2) score += (3 - dist) * 2;
              }
              // Bonus for jumping over a player
              if (target.hasPlayer) score += 5;
              if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
              }
            }
          }
          
          const dx = bestTarget.x - pos.x;
          const dy = bestTarget.y - pos.y;
          const landingX = pos.x + dx * 2;
          const landingY = pos.y + dy * 2;
          const landingCell = board.getCell(landingX, landingY);
          if (!landingCell || !landingCell.isEmpty || landingCell.isHole) {
            return { success: false, message: 'No empty landing tile' };
          }
          
          const currentCell = board.getCell(pos.x, pos.y);
          if (currentCell) currentCell.clear();
          landingCell.setPlayer(player);
          player.addSPs(1);
          player.addNPs(1);
          return { success: true, message: `Track Action (N) - Jumped over ${bestTarget.hasPlayer ? 'player' : 'trap'} to (${landingX},${landingY}), gained 1 SP and 1 NP` };
        }
      },
     {
  id: 'track_move_opponent',
  name: 'Move Opponent 1 Step',
  description: 'Gain 1 CP and move any opponent (that has not passed) 1 step',
  targetType: 'player',
  goldCost: 0,
  canUse: (player, board, target) => {
    const opponent = target?.origin ?? target;
    if (!opponent || !(opponent instanceof Player) || opponent.isEliminated || opponent === player) return false;
    const pos = board.getPlayerPosition(opponent);
    if (!pos) return false;
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) return false;
    const destination = target?.destination;
    const destinations = board.getNeighbors(cell).filter((neighbor: BoardCell) => neighbor.isEmpty && !neighbor.isHole);
    return destination
      ? destinations.some((neighbor: BoardCell) => neighbor.id === destination.id)
      : destinations.length > 0;
  },
  execute: (player, board, target) => {
    const opponent = target?.origin ?? target;
    const destination = target?.destination;
    if (!opponent || !(opponent instanceof Player) || opponent.isEliminated || opponent === player) {
      return { success: false, message: 'Invalid target' };
    }
    const pos = board.getPlayerPosition(opponent);
    if (!pos) return { success: false, message: 'Target not on board' };
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) return { success: false, message: 'Target cell not found' };
    if (!destination || !board.getNeighbors(cell).includes(destination) || !destination.isEmpty || destination.isHole) {
      return { success: false, message: 'Select an adjacent empty destination for the opponent' };
    }
    cell.clear();
    destination.setPlayer(opponent);
    player.addCPs(1);
    return { success: true, message: `Track Action (C) - Moved ${opponent.name} 1 step, gained 1 CP` };
  },
  expectedValue: (player, board, evaluator, target) => {
    const opponent = target?.origin ?? target;
    if (!opponent || !(opponent instanceof Player) || opponent.isEliminated || opponent === player) {
      return 0;
    }
    
    const cpValue = CardHelper.getCP(player);
    
    // Find if there's an empty cell to move the opponent to
    const pos = board.getPlayerPosition(opponent);
    if (!pos) return cpValue;
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) return cpValue;
    const neighbors = board.getNeighbors(cell);
    const emptyNeighbor = target?.destination ?? neighbors.find((n: BoardCell) => n.isEmpty && !n.isHole);
    if (!emptyNeighbor) return cpValue;
    
    // Calculate the value of moving the opponent
    // 1. Denial value: moving opponent away from safety or toward zombies
    let moveValue = 0;
    
    // Check if the opponent would be moved closer to zombies
    const zombies = board.getAllZombies();
    let oldZombieDist = Infinity;
    let newZombieDist = Infinity;
    
    for (const zombie of zombies) {
      const oldDist = Math.abs(cell.x - zombie.x) + Math.abs(cell.y - zombie.y);
      const newDist = Math.abs(emptyNeighbor.x - zombie.x) + Math.abs(emptyNeighbor.y - zombie.y);
      if (oldDist < oldZombieDist) oldZombieDist = oldDist;
      if (newDist < newZombieDist) newZombieDist = newDist;
    }
    
    // If moving closer to zombies, that's good for you (denial)
    if (newZombieDist < oldZombieDist) {
      moveValue += (oldZombieDist - newZombieDist) * 2;
    }
    
    // Check if moving away from other players (isolation is bad for them)
    const game = CardProcessor.getGame();
    if (game) {
      for (const p of game.players) {
        if (p === player || p === opponent || p.isEliminated) continue;
        const pPos = board.getPlayerPosition(p);
        if (!pPos) continue;
        const oldDist = Math.abs(cell.x - pPos.x) + Math.abs(cell.y - pPos.y);
        const newDist = Math.abs(emptyNeighbor.x - pPos.x) + Math.abs(emptyNeighbor.y - pPos.y);
        if (newDist > oldDist) {
          moveValue += (newDist - oldDist) * 1;
        }
      }
    }
    
    const total = cpValue + moveValue;
    console.log(`[Cia Lader Move Opponent] cpValue: ${cpValue}, moveValue: ${moveValue}, total: ${total}`);
    
    return total;
  },
  autoExecute: (player: Player, board: Board, evaluator: any) => {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) {
      return { success: false, message: 'Player cell not found' };
    }
    
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available' };
    }
    
    // Find an opponent to move (prefer opponents near zombies)
    let bestTarget: Player | null = null;
    let bestScore = -Infinity;
    
    for (const p of game.players) {
      if (p === player || p.isEliminated) continue;
      const pPos = board.getPlayerPosition(p);
      if (!pPos) continue;
      const pCell = board.getCell(pPos.x, pPos.y);
      if (!pCell) continue;
      
      const neighbors = board.getNeighbors(pCell);
      const emptyNeighbor = neighbors.find((n: BoardCell) => n.isEmpty && !n.isHole);
      if (emptyNeighbor) {
        // Score: prefer opponents near zombies
        let score = 0;
        const zombies = board.getAllZombies();
        for (const zombie of zombies) {
          const dist = Math.abs(emptyNeighbor.x - zombie.x) + Math.abs(emptyNeighbor.y - zombie.y);
          if (dist <= 2) score += (3 - dist) * 3;
        }
        // Also prefer opponents close to the player (easier to target)
        const distToPlayer = Math.abs(pPos.x - pos.x) + Math.abs(pPos.y - pos.y);
        if (distToPlayer <= 3) score += (4 - distToPlayer) * 2;
        
        if (score > bestScore) {
          bestScore = score;
          bestTarget = p;
        }
      }
    }
    
    if (!bestTarget) {
      return { success: false, message: 'No valid opponent to move' };
    }
    
    const pPos = board.getPlayerPosition(bestTarget);
    if (!pPos) {
      return { success: false, message: 'Target not on board' };
    }
    const pCell = board.getCell(pPos.x, pPos.y);
    if (!pCell) {
      return { success: false, message: 'Target cell not found' };
    }
    const neighbors = board.getNeighbors(pCell);
    const emptyNeighbor = neighbors.find((n: BoardCell) => n.isEmpty && !n.isHole);
    if (!emptyNeighbor) {
      return { success: false, message: 'No empty adjacent cell to move target to' };
    }
    
    pCell.clear();
    emptyNeighbor.setPlayer(bestTarget);
    player.addCPs(1);
    return { success: true, message: `Track Action (C) - Moved ${bestTarget.name} 1 step, gained 1 CP` };
  }
}
    ]
  },

  // ============================================================
  // 7. AL B. TROSS - Substitute Teacher
  // ============================================================
  al_b_tross: {
    id: 'hero_al_b_tross',
    name: 'Al B. Tross',
    description: 'Super Melee or Move Trap',
    isDualOption: true,
    options: [
      {
        id: 'bungler_super_melee',
        name: 'Super Melee',
        description: 'Pay 10 gold for one melee attack with success rate 6/8 that grants 1 NP and 2 SP if zombie killed',
        attackType: 'melee',
        targetType: 'zombie',
        goldCost: 10,
        canUse: (player, board, target) => {
          if (player.gold < 10) return false;
          if (!target || !target.hasZombie) return false;
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return false;
          return board.getNeighbors(cell).includes(target);
        },
        execute: (player, board, target) => {
          if (player.gold < 10) return { success: false, message: 'Need 10 gold' };
          if (!target || !target.hasZombie) {
            return { success: false, message: 'Invalid target' };
          }
          const successRate = 3 / 4;
          if (Math.random() > successRate) {
            player.spendGold(10);
            return { success: true, message: 'Teacher Action (N) - Super melee missed!' };
          }
          const game = CardProcessor.getGame();
          if (game && game.zombieManager) {
            const result = game.zombieManager.killZombie(target, player);
            if (result.success) {
              player.spendGold(10);
              player.addNPs(1);
              player.addSPs(2);
              return { success: true, message: 'Teacher Action (N) - Super melee killed zombie, gained 1 NP and 1 SP' };
            }
            return result;
          }
          target.clear();
          player.spendGold(10);
          return { success: true, message: 'Super melee killed zombie' };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          const successRate = 5 / 6;
          return successRate * (evaluator.getZombieKillValue(target) + CardHelper.getNP(player) + CardHelper.getSP(player, evaluator.onNight)) - 10;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 10) {
            return { success: false, message: 'Need 10 gold' };
          }
          
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Player cell not found' };
          }
          
          const targets = board.getNeighbors(cell).filter(n => n.hasZombie);
          if (targets.length === 0) {
            return { success: false, message: 'No adjacent zombies to attack' };
          }
          
          // Find the zombie closest to other players
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          const game = CardProcessor.getGame();
          
          for (const target of targets) {
            let score = 0;
            if (game) {
              for (const p of game.players) {
                if (p === player || p.isEliminated) continue;
                const pPos = board.getPlayerPosition(p);
                if (!pPos) continue;
                const dist = Math.abs(target.x - pPos.x) + Math.abs(target.y - pPos.y);
                if (dist <= 3) {
                  score += (4 - dist) * 2;
                }
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
          
          const successRate = 6 / 8;
          if (Math.random() > successRate) {
            player.spendGold(10);
            return { success: true, message: 'Teacher Action (N) - Super melee missed!' };
          }
          
          if (game && game.zombieManager) {
            const result = game.zombieManager.killZombie(bestTarget, player);
            if (result.success) {
              player.spendGold(10);
              player.addNPs(1);
              player.addSPs(1);
              return { success: true, message: `Teacher Action (N) - Super melee killed zombie at (${bestTarget.x},${bestTarget.y}), gained 1 NP and 1 SP` };
            }
            return result;
          }
          bestTarget.clear();
          player.spendGold(10);
          return { success: true, message: `Teacher Action (N) - Super melee killed zombie at (${bestTarget.x},${bestTarget.y})` };
        }
      },
     {
  id: 'bungler_move_trap',
  name: 'Move Opponent Trap 2 Steps',
  description: 'Gain 1 CP and move any opponent\'s trap to an empty cell within 2 steps of its original location',
  targetType: 'cell',
  goldCost: 0,
  canUse: (player, board, target) => {
    const origin = target?.origin ?? target;
    const trap = origin && board.getCell(Number(origin.x), Number(origin.y));
    if (!trap?.hasTrap || trap.structureOwner === player) return false;
    const destinations = MovementUtil.getCellsWithinStepsFromCell(board, trap, 2, true);
    if (!target?.origin || !target?.destination) {
      return destinations.some(cell => cell.isEmpty && !cell.isHole && cell.id !== trap.id);
    }
    const destination = board.getCell(Number(target.destination.x), Number(target.destination.y));
    return !!destination && destination.isEmpty && !destination.isHole
      && destination.id !== trap.id && destinations.some(cell => cell.id === destination.id);
  },
  execute: (player, board, target) => {
    const origin = target?.origin && board.getCell(Number(target.origin.x), Number(target.origin.y));
    const destination = target?.destination && board.getCell(Number(target.destination.x), Number(target.destination.y));
    if (!origin?.hasTrap || origin.structureOwner === player || !destination || !destination.isEmpty || destination.isHole) {
      return { success: false, message: 'Invalid target' };
    }
    const reachable = MovementUtil.getCellsWithinStepsFromCell(board, origin, 2, true);
    if (destination.id === origin.id || !reachable.some(cell => cell.id === destination.id)) {
      return { success: false, message: 'Destination must be within 2 steps of the trap\'s original location' };
    }
    const trapOwner = origin.structureOwner;
    const structureData = { ...origin.structureData };
    origin.clear();
    destination.setTrap(trapOwner!);
    destination.structureData = structureData;
    player.addCPs(1);
    return { success: true, message: `Moved opponent trap to (${destination.x},${destination.y}), gained 1 CP` };
  },
  expectedValue: (player, board, evaluator, target) => {
    if (!target || !target.hasTrap || target.structureOwner === player) {
      return 0;
    }
    const destinations = MovementUtil.getCellsWithinStepsFromCell(board, target, 2, true)
      .filter(cell => cell.isEmpty && !cell.isHole && cell.id !== target.id);
    const bestPlacementValue = Math.max(0, ...destinations.map(cell => evaluator.getTrapPlacementValue(player, cell)));
    return CardHelper.getCP(player) + bestPlacementValue * 0.5;
  },
  autoExecute: (player: Player, board: Board, evaluator: any) => {
    const traps = board.getAllTraps().filter(cell => cell.structureOwner && cell.structureOwner !== player);
    if (traps.length === 0) {
      return { success: false, message: 'No opponent traps to move' };
    }

    let bestTrap = traps[0];
    let bestDestination: BoardCell | null = null;
    let bestScore = -Infinity;
    for (const trap of traps) {
      const destinations = MovementUtil.getCellsWithinStepsFromCell(board, trap, 2, true)
        .filter(cell => cell.isEmpty && !cell.isHole && cell.id !== trap.id);
      for (const destination of destinations) {
        const score = evaluator.getTrapPlacementValue(player, destination);
        if (score > bestScore) {
          bestScore = score;
          bestTrap = trap;
          bestDestination = destination;
        }
      }
    }

    if (!bestDestination) {
      return { success: false, message: 'No valid destination within 2 steps' };
    }

    const trapOwner = bestTrap.structureOwner;
    const structureData = { ...bestTrap.structureData };
    bestTrap.clear();
    bestDestination.setTrap(trapOwner!);
    bestDestination.structureData = structureData;
    player.addCPs(1);
    return { success: true, message: `Moved opponent trap from (${bestTrap.x},${bestTrap.y}) to (${bestDestination.x},${bestDestination.y}), gained 1 CP` };
  }
}
    ]
  },

  // ============================================================
  // 8. ARCHY TECT - Valedictorian
  // ============================================================
  archy_tect: {
    id: 'hero_archy_tect',
    name: 'Archy Tect',
    description: 'Gain Gold per Barricade or Replace Barricade',
    isDualOption: true,
    options: [
      {
        id: 'nerd_barricade_gold',
        name: 'Barricade Gold',
        description: 'Gain 1 NP and gain 1 gold per active barricade (any owner) on the board',
        targetType: 'none',
        goldCost: 0,
        canUse: () => true,
        execute: (player, board) => {
          const barricades = board.getAllBarricades();
          const count = barricades.length;
          player.addNPs(1);
          player.addGold(count);
          return { success: true, message: `Nerd Action (N) - Gained 1 NP and ${count} gold from barricades` };
        },
        expectedValue: (player, board, evaluator) => {
          const barricades = board.getAllBarricades();
          const count = barricades.length;
          return CardHelper.getNP(player) + count;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const barricades = board.getAllBarricades();
          const count = barricades.length;
          player.addNPs(1);
          player.addGold(count);
          return { success: true, message: `Nerd Action (N) - Gained 1 NP and ${count} gold from barricades` };
        }
      },
      {
        id: 'nerd_replace_barricade',
        name: 'Replace Barricade',
        description: 'Replace one of your opponent\'s barricades with your own and gain 1 CP',
        targetType: 'cell',
        goldCost: 0,
        canUse: (player: Player, board: Board, target?: any) => {
        if (!target) return false;
        const pos = board.getPlayerPosition(player);
        if (!pos) return false;
        
        // Check if target is adjacent
        const dx = Math.abs(target.x - pos.x);
        const dy = Math.abs(target.y - pos.y);
        if (dx + dy !== 1) return false;
        
        // Check if target has a barricade owned by someone else
        const cell = board.getCell(target.x, target.y);
        if (!cell || !cell.hasBarricade) return false;
        if (!cell.structureOwner || cell.structureOwner === player) return false;
        
        // Check if player has enough gold
        if (player.gold < 2) return false;
        
        // Check if player is under barricade limit
        const playerBarricades = board.getAllCells().filter(c => 
          c.hasBarricade && c.structureOwner === player
        ).length;
        const barricadeLimit = player.getBarricadeLimit ? player.getBarricadeLimit() : 5;
        if (playerBarricades >= barricadeLimit) return false;
        
        return true;
      },
      execute: (player: Player, board: Board, target?: any) => {
        if (!target) {
          return { success: false, message: 'Invalid target' };
        }
        
        const cell = board.getCell(target.x, target.y);
        if (!cell || !cell.hasBarricade) {
          return { success: false, message: 'No barricade at target' };
        }
        
        if (!cell.structureOwner || cell.structureOwner === player) {
          return { success: false, message: 'Barricade is not owned by an enemy' };
        }
        
        // Check barricade limit before placing
        const playerBarricades = board.getAllCells().filter(c => 
          c.hasBarricade && c.structureOwner === player
        ).length;
        const barricadeLimit = player.getBarricadeLimit ? player.getBarricadeLimit() : 5;
        if (playerBarricades >= barricadeLimit) {
          return { success: false, message: 'Barricade limit reached' };
        }
        
        // Remove enemy barricade
        cell.removeStructure();
        
        // Place player's barricade
        cell.setBarricade(player);
        
        // Spend gold
        player.spendGold(2);
        
        return { 
          success: true, 
          message: `Replaced enemy barricade at (${cell.x}, ${cell.y}) with your own` 
        };
      },
      expectedValue: (player: Player, board: Board, evaluator: any, target?: any) => {
        if (!target) return 0;
        
        const cell = board.getCell(target.x, target.y);
        if (!cell || !cell.hasBarricade) return 0;
        
        const enemyOwner = cell.structureOwner;
        if (!enemyOwner || enemyOwner === player) return 0;
        
        // Check if player is under barricade limit
        const playerBarricades = board.getAllCells().filter(c => 
          c.hasBarricade && c.structureOwner === player
        ).length;
        const barricadeLimit = player.getBarricadeLimit ? player.getBarricadeLimit() : 5;
        if (playerBarricades >= barricadeLimit) return 0;
        
        const spValue = GameConstants.getSPValue(evaluator?.onNight || 1);
        const cpValue =player.getCPValue();
        const flexPointValue = GameConstants.FLEX_POINT_VALUE;
        
        // Get enemy's barricade effectiveness
        const enemyEffectiveness = enemyOwner.getBarricadeEffectiveness();
        
        // Get player's barricade effectiveness
        const playerEffectiveness = player.getBarricadeEffectiveness();
        
        // Calculate value based on whether barricade is on a zombie path
        let blockingValue = 0;
        let isOnPath = false;
        
        const zombieCells = board.getAllCells().filter(c => c.hasZombie);
        const pos = board.getPlayerPosition(player);
        
        if (pos) {
          // Get all players from the game via CardProcessor
          const game = CardProcessor.getGame();
          if (!game) return cpValue + 1; // Fallback if no game reference
          
          for (const zombie of zombieCells) {
            // Find closest player the zombie is targeting
            let targetPlayer: Player | null = null;
            let minDist = Infinity;
            
            for (const p of game.players) {
              if (p.isEliminated) continue;
              const pPos = board.getPlayerPosition(p);
              if (!pPos) continue;
              const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
              if (dist < minDist) {
                minDist = dist;
                targetPlayer = p;
              }
            }
            
            if (!targetPlayer) continue;
            const targetPos = board.getPlayerPosition(targetPlayer);
            if (!targetPos) continue;
            
            // Check if barricade is on zombie's path
            const path = board.findShortestPathZombie(
              zombie.x, zombie.y, 
              targetPos.x, targetPos.y
            );
            
            if (!path) continue;
            
            let barricadeOnPath = false;
            for (let i = 0; i < path.length - 1; i++) {
              if (path[i].x === cell.x && path[i].y === cell.y) {
                barricadeOnPath = true;
                break;
              }
            }
            
            if (barricadeOnPath) {
              isOnPath = true;
              
              // Value = flex point value * (8/(8-barricadeSuccessRate)) + 1 CP value
              const enemyBlockingValue = flexPointValue * (8 / Math.max(1, 8 - enemyEffectiveness));
              const playerBlockingValue = flexPointValue * (8 / Math.max(1, 8 - playerEffectiveness));
              
              // The value of replacing is the DIFFERENCE in blocking value
              // plus stealing the flex points from the enemy
              blockingValue += (playerBlockingValue - enemyBlockingValue);
              
              // Add CP value for the steal
              blockingValue += cpValue;
              
              break;
            }
          }
        }
        
        // If not on a zombie path, just the CP value for stealing
        let totalValue = 0;
        
        if (isOnPath) {
          totalValue = blockingValue;
        } else {
          // Just the CP value of stealing (plus a small bonus for denying the enemy)
          totalValue = cpValue + 1;
        }
        
        // Subtract the gold cost (2)
        totalValue -= 2;
        
        // Add value of stealing flex points (enemy loses them)
        const enemyBarricadeValue = flexPointValue * (8 / Math.max(1, 8 - enemyEffectiveness));
        totalValue += enemyBarricadeValue * 0.5;
        
        return Math.max(0, totalValue);
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        const pos = board.getPlayerPosition(player);
        if (!pos) {
          return { success: false, message: 'Player not on board' };
        }
        
        const cell = board.getCell(pos.x, pos.y);
        if (!cell) {
          return { success: false, message: 'Current cell not found' };
        }
        
        // Check barricade limit
        const playerBarricades = board.getAllCells().filter(c => 
          c.hasBarricade && c.structureOwner === player
        ).length;
        const barricadeLimit = player.getBarricadeLimit ? player.getBarricadeLimit() : 5;
        if (playerBarricades >= barricadeLimit) {
          return { success: false, message: 'Barricade limit reached' };
        }
        
        // Find adjacent enemy barricade
        const neighbors = board.getNeighbors(cell);
        let bestTarget = null;
        let bestScore = -Infinity;
        
        const game = CardProcessor.getGame();
        if (!game) {
          return { success: false, message: 'Game not available' };
        }
        
        for (const neighbor of neighbors) {
          if (neighbor.hasBarricade && neighbor.structureOwner && neighbor.structureOwner !== player) {
            // Score based on whether it's on a zombie path
            let score = 0;
            const enemyOwner = neighbor.structureOwner;
            
            // Check if on zombie path
            const zombieCells = board.getAllCells().filter(c => c.hasZombie);
            let onPath = false;
            
            for (const zombie of zombieCells) {
              // Find closest player
              let targetPlayer: Player | null = null;
              let minDist = Infinity;
              
              for (const p of game.players) {
                if (p.isEliminated) continue;
                const pPos = board.getPlayerPosition(p);
                if (!pPos) continue;
                const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
                if (dist < minDist) {
                  minDist = dist;
                  targetPlayer = p;
                }
              }
              
              if (!targetPlayer) continue;
              const targetPos = board.getPlayerPosition(targetPlayer);
              if (!targetPos) continue;
              
              const path = board.findShortestPathZombie(
                zombie.x, zombie.y, 
                targetPos.x, targetPos.y
              );
              
              if (path) {
                for (let i = 0; i < path.length - 1; i++) {
                  if (path[i].x === neighbor.x && path[i].y === neighbor.y) {
                    onPath = true;
                    break;
                  }
                }
              }
              if (onPath) break;
            }
            
            if (onPath) {
              score += 10; // High value if on path
            }
            
            // Enemy effectiveness - higher effectiveness = better to steal
            if (enemyOwner) {
              const enemyEff = enemyOwner.getBarricadeEffectiveness();
              score += enemyEff * 0.5;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestTarget = neighbor;
            }
          }
        }
        
        if (!bestTarget) {
          return { success: false, message: 'No adjacent enemy barricades to replace' };
        }
        
        // Execute
        bestTarget.removeStructure();
        bestTarget.setBarricade(player);
        player.spendGold(2);
        
        return { 
          success: true, 
          message: `Replaced enemy barricade at (${bestTarget.x}, ${bestTarget.y}) with your own` 
        };
      }
    }
    ]
  },

  // ============================================================
  // 9. LOLA LADRA - Lunch Lady
  // ============================================================
  lola_ladra: {
    id: 'hero_lola_ladra',
    name: 'Lola Ladra',
    description: 'Steal Gold or Solo NP',
    isDualOption: true,
    options: [
      {
        id: 'lunch_lady_steal',
        name: 'Steal Gold',
        description: 'If there is a player within two steps, steal 4 gold (or all if less) and gain 1 CP',
        targetType: 'player',
        goldCost: 0,
        canUse: (player, board, target) => {
          if (!target || !(target instanceof Player) || target.isEliminated || target === player) return false;
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const tPos = board.getPlayerPosition(target);
          if (!tPos) return false;
          const { distance } = board.getHumanDistance(pos.x, pos.y, tPos.x, tPos.y);
          return distance >= 0 && distance <= 2;
        },
        execute: (player, board, target) => {
          if (!target || !(target instanceof Player) || target.isEliminated || target === player) {
            return { success: false, message: 'Invalid target' };
          }
          const steal = Math.min(4, target.gold);
          target.spendGold(steal);
          player.addGold(steal);
          player.addCPs(1);
          return { success: true, message: `Lunchlady Action (C) - Stole ${steal} gold from ${target.name}, gained 1 CP` };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          const steal = Math.min(4, target.gold);
          return 1.2*steal +  CardHelper.getCP(player);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'Game not available' };
          }
          
          // Find the player within 2 steps with the most gold
          let bestTarget: Player | null = null;
          let mostGold = 0;
          
          for (const p of game.players) {
            if (p === player || p.isEliminated) continue;
            const pPos = board.getPlayerPosition(p);
            if (!pPos) continue;
            const { distance } = board.getHumanDistance(pos.x, pos.y, pPos.x, pPos.y);
            if (distance >= 0 && distance <= 2 && p.gold > mostGold) {
              mostGold = p.gold;
              bestTarget = p;
            }
          }
          
          if (!bestTarget || mostGold === 0) {
            return { success: false, message: 'No players with gold within 2 steps' };
          }
          
          const steal = Math.min(4, bestTarget.gold);
          bestTarget.spendGold(steal);
          player.addGold(steal);
          player.addCPs(1);
          return { success: true, message: `Lunchlady Action (C) - Stole ${steal} gold from ${bestTarget.name}, gained 1 CP` };
        }
      },
      {
        id: 'lunch_lady_solo',
        name: 'Solo NP',
        description: 'If there are no other players in the same room, gain 1 NP and 6 gold',
        targetType: 'none',
        goldCost: 0,
        canUse: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const roomId = board.getCell(pos.x, pos.y)?.roomId;
          if (!roomId) return false;
          const playersInRoom = board.getCellsInRoom(roomId).filter((c: BoardCell) => c.hasPlayer && c.structureOwner !== player);
          return playersInRoom.length === 0;
        },
        execute: (player, board) => {
          player.addNPs(1);
          player.addGold(6);
          return { success: true, message: 'Lunchlady Action (N) - Alone in room, gained 1 NP and 6 gold' };
        },
        expectedValue: (player, board, evaluator) => {
          return CardHelper.getNP(player) + 6;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const roomId = board.getCell(pos.x, pos.y)?.roomId;
          if (!roomId) {
            return { success: false, message: 'Player not in a room' };
          }
          const playersInRoom = board.getCellsInRoom(roomId).filter((c: BoardCell) => c.hasPlayer && c.structureOwner !== player);
          if (playersInRoom.length > 0) {
            return { success: false, message: 'Not alone in room' };
          }
          player.addNPs(1);
          player.addGold(6);
          return { success: true, message: 'Lunchlady Action (N) - Alone in room, gained 1 NP and 6 gold' };
        }
      }
    ]
  },

  // ============================================================
  // 10. RICHARD KIM - Principal
  // ============================================================
  richard_kim: {
    id: 'hero_richard_kim',
    name: 'Richard Kim',
    description: 'Safe Room NP or Spawn Zombie',
    isDualOption: true,
    options: [
      {
        id: 'principal_safe',
        name: 'Safe Room',
        description: 'If no zombies in current room, earn 1 NP and 6 gold, all other players earn 3 gold',
        targetType: 'none',
        goldCost: 0,
        canUse: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const roomId = board.getCell(pos.x, pos.y)?.roomId;
          if (!roomId) return false;
          const zombiesInRoom = board.getCellsInRoom(roomId).filter((c: BoardCell) => c.hasZombie);
          return zombiesInRoom.length === 0;
        },
        execute: (player, board) => {
          const game = CardProcessor.getGame();
          player.addNPs(1);
          player.addGold(6);
          if (game) {
            for (const p of game.players) {
              if (p !== player && !p.isEliminated) {
                p.addGold(3);
              }
            }
          }
          return { success: true, message: 'Principal Action (N) - No zombies in room, gained 1 NP and 6 gold, all others gained 3 gold' };
        },
        expectedValue: (player, board, evaluator) => {
          const game = CardProcessor.getGame();
          const players = game ? game.players.filter((p: Player) => !p.isEliminated && p !== player).length : 3;
          return CardHelper.getNP(player)+ 6;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const roomId = board.getCell(pos.x, pos.y)?.roomId;
          if (!roomId) {
            return { success: false, message: 'Player not in a room' };
          }
          const zombiesInRoom = board.getCellsInRoom(roomId).filter((c: BoardCell) => c.hasZombie);
          if (zombiesInRoom.length > 0) {
            return { success: false, message: 'Zombies in current room' };
          }
          
          const game = CardProcessor.getGame();
          player.addNPs(1);
          player.addGold(6);
          if (game) {
            for (const p of game.players) {
              if (p !== player && !p.isEliminated) {
                p.addGold(3);
              }
            }
          }
          return { success: true, message: 'Principal Action (N) - No zombies in room, gained 1 NP and 6 gold, all others gained 3 gold' };
        }
      },
      {
        id: 'principal_spawn',
        name: 'Spawn Zombie',
        description: 'Pay 4 gold to gain 1 GP and 1 CP, and spawn 1 zombie (roll room die)',
        targetType: 'none',
        goldCost: 4,
        canUse: (player, board) => {
          if (player.gold < 4) return false;
          const rooms = ['Gymnasium', 'Front Desk', 'Restroom', "Janitor's Closet", 'Library', 'Cafeteria', 'Auditorium', "Principal's Office", 'Science Lab'];
          for (const room of rooms) {
            const cells = board.getCellsInRoom(room).filter((c: BoardCell) => c.isEmpty && !c.isHole && !c.hasTrap && !c.hasBait && !c.hasBarricade);
            if (cells.length > 0) return true;
          }
          return false;
        },
        execute: (player, board) => {
          if (player.gold < 4) return { success: false, message: 'Need 4 gold' };
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'ZombieManager not available' };
          }
          const zombieManager = game.zombieManager ?? game.ensureZombieManager?.();
          if (!zombieManager) return { success: false, message: 'ZombieManager not available' };
          const result = zombieManager.spawnZombieRandom();
          if (!result.success) return result;
          player.spendGold(4);
          player.addGPs(1);
          player.addCPs(1);
          return { success: true, message: 'Principal Action (C) - Spawned zombie in random room, gained 1 GP and 1 CP' };
        },
        expectedValue: (player, board, evaluator) => {
          const gpValue = evaluator.getSPValue(player) - 4;
          return gpValue +  CardHelper.getCP(player);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 4) {
            return { success: false, message: 'Need 4 gold' };
          }
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'ZombieManager not available' };
          }
          const zombieManager = game.zombieManager ?? game.ensureZombieManager?.();
          if (!zombieManager) return { success: false, message: 'ZombieManager not available' };
          const result = zombieManager.spawnZombieRandom();
          if (!result.success) return result;
          player.spendGold(4);
          player.addGPs(1);
          player.addCPs(1);
          return { success: true, message: 'Principal Action (C) - Spawned zombie in random room, gained 1 GP and 1 CP' };
        }
      }
    ]
  },
// ============================================================
// 11. DOROTHY DECKARD - Secretary (FIXED - No Errors, Always Available)
// ============================================================
dorothy_deckard: {
  id: 'hero_dorothy_deckard',
  name: 'Dorothy Deckard',
  description: 'Draw Cards or Discard Draw',
  isDualOption: true,
  options: [
    {
      id: 'secretary_draw_give',
      name: 'Draw 3, Keep 1, Give 2',
      description: 'Draw 3 cards, keep 1, give 2 to lowest SP player, gain 1 NP',
      targetType: 'none',
      goldCost: 0,
      canUse: (player, board) => {
        try {
          // Always available - even if deck is empty, will handle gracefully
          return true;
        } catch (e) {
          console.log('[Dorothy] Draw and Give canUse error:', e);
          return true;
        }
      },
      execute: (player, board) => {
        try {
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'Game not available' };
          }
          
          // Find lowest SP player
          let lowestSP = Infinity;
          let lowestPlayer: Player | null = null;
          for (const p of game.players) {
            if (!p.isEliminated && p.currSP < lowestSP) {
              lowestSP = p.currSP;
              lowestPlayer = p;
            }
          }
          
          if (lowestPlayer && lowestSP < player.currSP) {
            const selection = CardDrawer.drawKeep(player, 3, 1, lowestPlayer.id);
            if (!selection.success) {
              player.addNPs(1);
              return { success: true, message: 'No cards available to draw, but gained 1 NP' };
            }
            return {
              success: true,
              message: `Drew 3 cards, keep 1, give 2 to ${lowestPlayer.name}`,
            };
          }

          const drawn = CardDrawer.drawCards(player, 3);
          if (drawn.length === 0) {
            player.addNPs(1);
            return { success: true, message: 'No cards available to draw, but gained 1 NP' };
          }
          player.addNPs(1);
          return {
            success: true,
            message: 'Drew 3 cards (has lowest SP), gained 1 NP',
          };
        } catch (e) {
          console.error('[Dorothy] Draw and Give execute error:', e);
          player.addNPs(1);
          return { success: true, message: 'Action completed with error' };
        }
      },
      expectedValue: (player, board, evaluator) => {
        try {
          const game = CardProcessor.getGame();
          if (!game) return 5;
          
          // Find lowest SP player
          let lowestSP = Infinity;
          let lowestPlayer: Player | null = null;
          for (const p of game.players) {
            if (!p.isEliminated && p.currSP < lowestSP) {
              lowestSP = p.currSP;
              lowestPlayer = p;
            }
          }
          
          const npValue = 16 - evaluator.onNight; // NP value
          
          // If current player has lowest SP, they keep all 3 cards
          if (lowestPlayer === player) {
            const cardValue = CardHelper.getCardDrawValue(player, evaluator.onNight, 3);
            return npValue + cardValue;
          }
          
          // Otherwise, keep 1 card and give 2 to lowest SP player
          const cardValue = CardHelper.getCardDrawValue(player, evaluator.onNight, 1) * 1.5;
          return npValue + cardValue;
        } catch (e) {
          return 10; // Fallback value
        }
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        try {
          const game = CardProcessor.getGame();
          if (!game) {
            return { success: false, message: 'Game not available' };
          }
          
          // Find lowest SP player
          let lowestSP = Infinity;
          let lowestPlayer: Player | null = null;
          for (const p of game.players) {
            if (!p.isEliminated && p.currSP < lowestSP) {
              lowestSP = p.currSP;
              lowestPlayer = p;
            }
          }
          
          // Draw 3 cards
          const drawn = CardDrawer.drawCards(player, 3);
          if (drawn.length === 0) {
            player.addNPs(1);
            return { success: true, message: 'No cards available to draw, but gained 1 NP' };
          }
          
          // If current player has lowest SP, keep all 3
          if (lowestPlayer === player) {
            player.addNPs(1);
            return { 
              success: true, 
              message: `Drew 3 cards (has lowest SP), gained 1 NP` 
            };
          }
          
          // Find the best card to keep (highest expected value)
          // Use the evaluator to determine card value
          let bestCard = drawn[0];
          let bestValue = -Infinity;
          
          for (const card of drawn) {
            // Try to evaluate the card's value
            try {
              const cardEffect = CardProcessor.get(card.cardId);
              let value = 0;
              if (cardEffect && cardEffect.expectedValue) {
                // Use the card's expected value if available
                value = cardEffect.expectedValue(player, board, evaluator, null);
              } else {
                // Fallback: use card cost as value
                value = card.cost || 2;
              }
              
              if (value > bestValue) {
                bestValue = value;
                bestCard = card;
              }
            } catch (e) {
              // If evaluation fails, keep the first card
              bestCard = drawn[0];
            }
          }
          
          // Keep the best card
          const keptCard = bestCard;
          const giveCards = drawn.filter(c => c.id !== keptCard.id);
          
          // Add kept card to player's hand (if not already there)
          // Note: drawCards already added all cards to hand, so we need to remove the ones we're giving away
          for (const card of giveCards) {
            player.removeCard(card.id);
          }
          
          // Give remaining cards to lowest SP player
          if (lowestPlayer) {
            for (const card of giveCards) {
              lowestPlayer.addCard(card);
            }
          }
          
          player.addNPs(1);
          
          return { 
            success: true, 
            message: `Kept 1 card, gave ${giveCards.length} cards to ${lowestPlayer?.name || 'no one'}, gained 1 NP` 
          };
        } catch (e) {
          console.error('[Dorothy] Draw and Give autoExecute error:', e);
          player.addNPs(1);
          return { success: true, message: 'Action completed with error' };
        }
      }
    },
    {
      id: 'secretary_discard_draw',
      name: 'Discard and Draw',
      description: 'Discard 1 card to draw 2 cards and gain 1 SP',
      targetType: 'none',
      goldCost: 0,
      canUse: (player, board) => {
        try {
          // Check if player has at least 1 card to discard
          // If not, still return true but the execute will handle it
          return true; // Always available - if no cards, message will say so
        } catch (e) {
          console.log('[Dorothy] Discard and Draw canUse error:', e);
          return true; // Always return true
        }
      },
      execute: (player, board) => {
        try {
          if (player.hand.cards.length < 1) {
            // Still give them 1 SP as a consolation
            player.addSPs(1);
            return { success: true, message: 'No cards to discard, but gained 1 SP anyway' };
          }
          CardDrawer.discardDraw(player, 2);
          player.addSPs(1);
          return { success: true, message: 'Discarded 1 card, drew 2 cards, gained 1 SP' };
        } catch (e) {
          // Even if error, give SP
          player.addSPs(1);
          return { success: true, message: 'Action completed with error' };
        }
      },
      expectedValue: (player, board, evaluator) => {
        try {
          // 2 cards drawn + 1 SP
          const cardValue = CardHelper.getCardDrawValue(player, evaluator.onNight,2);
          const spValue =CardHelper.getSP(player, evaluator.onNight);
          
          // If player has no cards, value is lower
          if (player.hand.cards.length < 1) {
            return spValue; // Just the SP value
          }
          
          return cardValue + spValue;
        } catch (e) {
          return 10; // High fallback value to ensure it gets chosen
        }
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        try {
          if (player.hand.cards.length < 1) {
            player.addSPs(1);
            return { success: true, message: 'No cards to discard, but gained 1 SP' };
          }
          CardDrawer.discardDraw(player, 2);
          player.addSPs(1);
          return { success: true, message: 'Discarded 1 card, drew 2 cards, gained 1 SP' };
        } catch (e) {
          player.addSPs(1);
          return { success: true, message: 'Action completed' };
        }
      }
    }
  ]
},

// ============================================================
// 12. MIKE U. STRONG - Gym Coach 
// ============================================================
mike_u_strong: {
  id: 'hero_mike_u_strong',
  name: 'Mike U. Strong',
  description: 'Gym Kill or Kick Down',
  isDualOption: true,
  options: [
    {
      id: 'coach_gym_kill',
      name: 'Gym Kill',
      description: 'Kill a zombie in the Gymnasium and gain 1 SP',
      attackType: 'melee',
      targetType: 'zombie',
      goldCost: 0,
      canUse: (player, board, target) => {
        try {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const currentCell = board.getCell(pos.x, pos.y);
          if (!currentCell || currentCell.roomId !== 'Gymnasium') return false;

          // The Gymnasium restriction applies to both the player and the target.
          if (target) {
            const targetCell = board.getCell(Number(target.x), Number(target.y));
            return !!targetCell?.hasZombie && targetCell.roomId === 'Gymnasium';
          }

          return board.getCellsInRoom('Gymnasium').some(cell => cell.hasZombie);
        } catch (e) {
          console.log('[Mike] Gym Kill canUse error:', e);
          return false;
        }
      },
      execute: (player, board, target) => {
        try {
          const pos = board.getPlayerPosition(player);
          const playerCell = pos && board.getCell(pos.x, pos.y);
          if (!target || !target.hasZombie || target.roomId !== 'Gymnasium' || playerCell?.roomId !== 'Gymnasium') {
            return { success: false, message: 'Target must be a zombie in the Gymnasium' };
          }
          
          const game = CardProcessor.getGame();
          if (game && game.zombieManager) {
            const result = game.zombieManager.killZombie(target, player);
            if (result.success) {
              player.addSPs(1);
              return { success: true, message: 'Mike killed zombie, gained 1 SP' };
            }
            return result;
          }
          
          target.clear();
          player.addSPs(1);
          return { success: true, message: 'Mike killed zombie, gained 1 SP' };
        } catch (e) {
          return { success: false, message: `Error: ${e}` };
        }
      },
      expectedValue: (player, board, evaluator, target) => {
        try {
          if (!target) return 0;
          const spValue = 16 - evaluator.onNight;
          const effectiveness = player.getMeleeEffectiveness();
          const successRate = Math.min(effectiveness / 6, 1);
          const boardDelta = evaluator.getZombieKillValue(player, target);
          return successRate * (spValue + boardDelta);
        } catch (e) {
          return 3; // Default value
        }
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        try {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell || cell.roomId !== 'Gymnasium') {
            return { success: false, message: 'Mike must be in the Gymnasium to use Gym Kill' };
          }

          // Find adjacent zombie
          const targets = board.getNeighbors(cell).filter(n => n.hasZombie);

          if (targets.length === 0) {
            return { success: false, message: 'No adjacent zombies' };
          }

          const bestTarget = targets[0];
          const game = CardProcessor.getGame();
          if (game && game.zombieManager) {
            const result = game.zombieManager.killZombie(bestTarget, player);
            if (result.success) {
              player.addSPs(1);
              return { success: true, message: 'Mike killed zombie, gained 1 SP' };
            }
            return result;
          }

          bestTarget.clear();
          player.addSPs(1);
          return { success: true, message: 'Mike killed zombie, gained 1 SP' };
        } catch (e) {
          return { success: false, message: `Error: ${e}` };
        }
      }
    },
    {
      id: 'coach_kick_down',
      name: 'Kick Down',
      description: 'Remove an adjacent barricade and gain 1 CP',
      targetType: 'cell',
      goldCost: 0,
      canUse: (player, board, target) => {
        try {
          // If target provided, check it specifically
          if (target) {
            const pos = board.getPlayerPosition(player);
            if (!pos) return false;
            const currentCell = board.getCell(pos.x, pos.y);
            const targetCell = board.getCell(Number(target.x), Number(target.y));
            return !!currentCell && !!targetCell?.hasBarricade && targetCell.structureOwner !== player
              && board.getNeighbors(currentCell).includes(targetCell);
          }
          
          // No target - check if there's ANY adjacent barricade
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return false;
          
          const neighbors = board.getNeighbors(cell);
          for (const neighbor of neighbors) {
            if (neighbor.hasBarricade && neighbor.structureOwner !== player) {
              return true;
            }
          }
          return false;
        } catch (e) {
          console.log('[Mike] Kick Down canUse error:', e);
          return false;
        }
      },
      execute: (player, board, target) => {
        try {
          if (!target) {
            return { success: false, message: 'Invalid target' };
          }
          
          const tCell = board.getCell(target.x, target.y);
          if (!tCell || !tCell.hasBarricade || tCell.structureOwner === player) {
            return { success: false, message: 'No barricade at target' };
          }
          
          // Remove the barricade
          tCell.removeStructure();
          player.addCPs(1);
          
          return { success: true, message: `Mike kicked down barricade, gained 1 CP` };
        } catch (e) {
          return { success: false, message: `Error: ${e}` };
        }
      },
      expectedValue: (player, board, evaluator, target) => {
        try {
          if (!target) return 0;
          // Value of removing a barricade (opens up movement)
          const boardDelta = evaluator.getMoveValue(player, target);
          const cpValue = 16 - evaluator.onNight;
          
          // Extra value if the barricade belongs to an opponent
          const cell = board.getCell(target.x, target.y);
          let opponentBonus = 0;
          if (cell && cell.structureOwner && cell.structureOwner !== player) {
            opponentBonus = 5;
          }
          
          return boardDelta + cpValue + opponentBonus;
        } catch (e) {
          return 3; // Default value
        }
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        try {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Current cell not found' };
          }
          
          // Find adjacent barricade
          const targets = board.getNeighbors(cell).filter(n => n.hasBarricade && n.structureOwner !== player);
          
          if (targets.length === 0) {
            return { success: false, message: 'No adjacent barricades' };
          }
          
          // Prefer barricades owned by opponents
          let bestTarget = targets[0];
          for (const target of targets) {
            if (target.structureOwner && target.structureOwner !== player) {
              bestTarget = target;
              break;
            }
          }
          
          bestTarget.removeStructure();
          player.addCPs(1);
          
          return { success: true, message: 'Mike kicked down barricade, gained 1 CP' };
        } catch (e) {
          return { success: false, message: `Error: ${e}` };
        }
      }
    }
  ]
}
};

// ============================================================
// LOCKER ACTIONS (4 Dual-Option Items)
// ============================================================

export const LockerActions: Record<string, ActionEffect> = {
  cool_for_sale: {
    id: 'locker_cool_for_sale',
    name: 'Cool For Sale',
    description: 'Pay 2 gold to convert CP to SP or Gold',
    isDualOption: true,
    options: [
      {
        id: 'cool_sp',
        name: 'CP → SP',
        description: 'Pay 2 gold to lose 1 CP and gain 1 SP',
        targetType: 'none',
        goldCost: 2,
        canUse: (player) => player.gold >= 2 && player.currCP >= 1,
        execute: (player) => {
          if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
          if (player.currCP < 1) return { success: false, message: 'Need at least 1 CP' };
          player.spendGold(2);
          player.loseCPs(1);
          player.addSPs(1);
          return { success: true, message: 'Cool for Sale - Spent 2 gold, lost 1 CP, gained 1 SP' };
        },
        expectedValue: (player, board, evaluator) => CardHelper.getSP(player, evaluator.onNight) - CardHelper.getCP(player) - 2, 
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 2 || player.currCP < 1) {
            return { success: false, message: 'Cannot perform this action' };
          }
          player.spendGold(2);
          player.loseCPs(1);
          player.addSPs(1);
          return { success: true, message: 'Cool for Sale - Spent 2 gold, lost 1 CP, gained 1 SP' };
        }
      },
      {
        id: 'cool_gold',
        name: 'CP → Gold',
        description: 'Pay 2 gold to lose 1 CP and gain 7 gold',
        targetType: 'none',
        goldCost: 2,
        canUse: (player) => player.gold >= 2 && player.currCP >= 1,
        execute: (player) => {
          if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
          if (player.currCP < 1) return { success: false, message: 'Need at least 1 CP' };
          player.spendGold(2);
          player.loseCPs(1);
          player.addGold(7);
          return { success: true, message: 'Cool for Sale - Spent 2 gold, lost 1 CP, gained 7 gold' };
        },
        expectedValue: (player, board, evaluator) => 7 - CardHelper.getCP(player) - 2, 
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 2 || player.currCP < 1) {
            return { success: false, message: 'Cannot perform this action' };
          }
          player.spendGold(2);
          player.loseCPs(1);
          player.addGold(7);
          return { success: true, message: 'Cool for Sale - Spent 2 gold, lost 1 CP, gained 7 gold' };
        }
      }
    ]
  },

  free_hugs: {
    id: 'locker_free_hugs',
    name: 'Free Hugs',
    description: 'Gain NP from adjacent players or CP from adjacent zombies',
    isDualOption: true,
    options: [
      {
        id: 'hugs_np',
        name: 'Hugs → NP',
        description: 'Gain 2 NP per adjacent player (opponent)',
        targetType: 'none',
        goldCost: 0,
        canUse: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return false;
          return board.getNeighbors(cell).filter((n: BoardCell) => n.hasPlayer && n.structureOwner !== player).length > 0;
        },
        execute: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return { success: false, message: 'Player not on board' };
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return { success: false, message: 'Current cell not found' };
          const adjacentPlayers = board.getNeighbors(cell).filter((n: BoardCell) => n.hasPlayer && n.structureOwner !== player);
          const npGain = adjacentPlayers.length * 2;
          player.addNPs(npGain);
          return { success: true, message: `Free Hugs (N) - Gained ${npGain} NP from ${adjacentPlayers.length} adjacent players` };
        },
        expectedValue: (player, board, evaluator) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return 0;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return 0;
          const count = board.getNeighbors(cell).filter((n: BoardCell) => n.hasPlayer && n.structureOwner !== player).length+69; //keketest;
          return count * 2 *CardHelper.getNP(player);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Current cell not found' };
          }
          const adjacentPlayers = board.getNeighbors(cell).filter((n: BoardCell) => n.hasPlayer && n.structureOwner !== player);
          if (adjacentPlayers.length === 0) {
            return { success: false, message: 'No adjacent players' };
          }
          const npGain = adjacentPlayers.length * 2;
          player.addNPs(npGain);
          return { success: true, message: `Free Hugs (N) - Gained ${npGain} NP from ${adjacentPlayers.length} adjacent players` };
        }
      },
      {
        id: 'hugs_cp',
        name: 'Hugs → CP',
        description: 'Gain 1 CP per adjacent zombie',
        targetType: 'none',
        goldCost: 0,
        canUse: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return false;
          return board.getNeighbors(cell).filter((n: BoardCell) => n.hasZombie).length > 0;
        },
        execute: (player, board) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return { success: false, message: 'Player not on board' };
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return { success: false, message: 'Current cell not found' };
          const adjacentZombies = board.getNeighbors(cell).filter((n: BoardCell) => n.hasZombie);
          const cpGain = adjacentZombies.length;
          player.addCPs(cpGain);
          return { success: true, message: `Free Hugs (C) - Gained ${cpGain} CP from ${adjacentZombies.length} adjacent zombies` };
        },
        expectedValue: (player, board, evaluator) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) return 0;
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return 0;
          const count = board.getNeighbors(cell).filter((n: BoardCell) => n.hasZombie).length+69; //keketest
          return count * CardHelper.getCP(player);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Current cell not found' };
          }
          const adjacentZombies = board.getNeighbors(cell).filter((n: BoardCell) => n.hasZombie);
          if (adjacentZombies.length === 0) {
            return { success: false, message: 'No adjacent zombies' };
          }
          const cpGain = adjacentZombies.length;
          player.addCPs(cpGain);
          return { success: true, message: `Free Hugs (C) - Gained ${cpGain} CP from ${adjacentZombies.length} adjacent zombies` };
        }
      }
    ]
  },

  nice_for_sale: {
  id: 'locker_nice_for_sale',
  name: 'Nice For Sale',
  description: 'Pay 2 gold to convert NP to SP or Gold',
  isDualOption: true,
  options: [
    {
      id: 'nice_sp',
      name: 'NP → SP',
      description: 'Pay 2 gold to lose 1 NP and gain 1 SP',
      targetType: 'none',
      goldCost: 2,
      canUse: (player, board) => {
        return player.gold >= 2 && player.currNP >= 1;
      },
      execute: (player, board) => {
        if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
        if (player.currNP < 1) return { success: false, message: 'Need at least 1 NP' };
        player.spendGold(2);
        player.loseNPs(1);
        player.addSPs(1);
        return { success: true, message: 'Nice for Sale - Spent 2 gold, lost 1 NP, gained 1 SP' };
      },
      expectedValue: (player, board, evaluator) => {
        const spValue = CardHelper.getSP(player, evaluator.onNight);
        const npValue = CardHelper.getNP(player);
        return spValue - npValue - 2 + 69;
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        if (player.gold < 2 || player.currNP < 1) {
          return { success: false, message: 'Cannot perform this action' };
        }
        player.spendGold(2);
        player.loseNPs(1);
        player.addSPs(1);
        return { success: true, message: 'Nice for Sale - Spent 2 gold, lost 1 NP, gained 1 SP' };
      }
    },
    {
      id: 'nice_gold',
      name: 'NP → Gold',
      description: 'Pay 2 gold to lose 1 NP and gain 7 gold',
      targetType: 'none',
      goldCost: 2,
      canUse: (player, board) => {
        return player.gold >= 2 && player.currNP >= 1;
      },
      execute: (player, board) => {
        if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
        if (player.currNP < 1) return { success: false, message: 'Need at least 1 NP' };
        player.spendGold(2);
        player.loseNPs(1);
        player.addGold(7);
        return { success: true, message: 'Nice for Sale - Spent 2 gold, lost 1 NP, gained 7 gold' };
      },
      expectedValue: (player, board, evaluator) => {
        const npValue = player.getNPValue();
        return 7 - npValue - 2;
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        if (player.gold < 2 || player.currNP < 1) {
          return { success: false, message: 'Cannot perform this action' };
        }
        player.spendGold(2);
        player.loseNPs(1);
        player.addGold(7);
        return { success: true, message: 'Nice for Sale - Spent 2 gold, lost 1 NP, gained 7 gold' };
      }
    }
  ]
},

  ouija_board: {
    id: 'locker_ouija_board',
    name: 'Ouija Board',
    description: 'Lose SP to gain NP or CP',
    isDualOption: true,
    options: [
      {
        id: 'ouija_np',
        name: 'SP → NP',
        description: 'Pay 1 gold to lose 1 SP and gain 2 NP',
        targetType: 'none',
        goldCost: 1,
        canUse: (player) => player.gold >= 1 && player.currSP >= 1,
        execute: (player) => {
          if (player.gold < 1) return { success: false, message: 'Need 1 gold' };
          if (player.currSP < 1) return { success: false, message: 'Need at least 1 SP' };
          player.spendGold(1);
          player.loseSPs(1);
          player.addNPs(2);
          return { success: true, message: 'Ouija Board (N) - Spent 1 gold, lost 1 SP, gained 2 NP' };
        },
        expectedValue: (player, board, evaluator) => 2 *CardHelper.getNP(player) -CardHelper.getSP(player, evaluator.onNight)- 1, 
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 1 || player.currSP < 1) {
            return { success: false, message: 'Cannot perform this action' };
          }
          player.spendGold(1);
          player.loseSPs(1);
          player.addNPs(2);
          return { success: true, message: 'Ouija Board (N) - Spent 1 gold, lost 1 SP, gained 2 NP' };
        }
      },
      {
        id: 'ouija_cp',
        name: 'SP → CP',
        description: 'Pay 2 gold to lose 1 SP and gain 2 CP',
        targetType: 'none',
        goldCost: 2,
        canUse: (player) => player.gold >= 2 && player.currSP >= 1,
        execute: (player) => {
          if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
          if (player.currSP < 1) return { success: false, message: 'Need at least 1 SP' };
          player.spendGold(2);
          player.loseSPs(1);
          player.addCPs(2);
          return { success: true, message: 'Ouija Board (C) - Spent 2 gold, lost 1 SP, gained 2 CP' };
        },
        expectedValue: (player, board, evaluator) => 2 * CardHelper.getCP(player) - CardHelper.getSP(player, evaluator.onNight) - 2, 
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 2 || player.currSP < 1) {
            return { success: false, message: 'Cannot perform this action' };
          }
          player.spendGold(2);
          player.loseSPs(1);
          player.addCPs(2);
          return { success: true, message: 'Ouija Board (C) - Spent 2 gold, lost 1 SP, gained 2 CP' };
        }
      }
    ]
  }
};

// ============================================================
// GAME DECK ACTION CARDS (Single-Option Actions)
// ============================================================

export const GameDeckActions: Record<string, ActionEffect> = {
  // 3D Printed Walls
  printed_walls: {
    id: 'game_printed_walls',
    name: '3D Printed Walls',
    description: 'Spend 4 gold to place a barricade on a cell within 2 steps',
    isDualOption: false,
    options: [
      {
        id: 'printed_walls_place',
        name: 'Place Barricade',
        description: 'Spend 4 gold to place a barricade on a cell within 2 steps',
        targetType: 'cell',
        goldCost: 4,
        canUse: (player, board, target) => {
          if (player.gold < 4) return false;
          if (!target || target.isHole || !target.isEmpty) return false;
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          return dist <= 2;
        },
        execute: (player, board, target) => {
          if (player.gold < 4) return { success: false, message: 'Need 4 gold' };
          if (!target || target.isHole || !target.isEmpty) {
            return { success: false, message: 'Invalid target' };
          }
          const result = StructurePlacement.placeBarricadeWithEffects(board, player, target);
          if (result.success) {
            player.spendGold(4);
          }
          return {
            success: result.success,
            message: 'Printed Walls - ' + result.message
          };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return -4;
          const barricadeValue = evaluator.getBarricadePlacementValue(target);
          return barricadeValue - 4;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 4) {
            return { success: false, message: 'Need 4 gold' };
          }
          
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          
          const targets: BoardCell[] = [];
          const allCells = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
          for (const cell of allCells) {
            const dist = Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y);
            if (dist <= 2) {
              targets.push(cell);
            }
          }
          
          if (targets.length === 0) {
            return { success: false, message: 'No valid targets' };
          }
          
          // Find the best target (near zombies or on zombie paths)
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          const zombies = board.getAllZombies();
          
          for (const target of targets) {
            let score = 0;
            for (const zombie of zombies) {
              const dist = Math.abs(target.x - zombie.x) + Math.abs(target.y - zombie.y);
              if (dist <= 2) {
                score += (3 - dist) * 3;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
          
          const result = StructurePlacement.placeBarricadeWithEffects(board, player, bestTarget);
          if (result.success) {
            player.spendGold(4);
          }
          return {
            success: result.success,
            message: `Printed Walls - ${result.message} at (${bestTarget.x},${bestTarget.y})`
          };
        }
      }
    ]
  },

  // Bait Launcher
  bait_launcher: {
    id: 'game_bait_launcher',
    name: 'Bait Launcher',
    description: 'Place 1 bait for free within 3 steps',
    isDualOption: false,
    options: [
      {
        id: 'bait_launcher_place',
        name: 'Place Free Bait',
        description: 'Place 1 bait for free within 3 steps',
        targetType: 'cell',
        goldCost: 0,
        canUse: (player, board, target): boolean => {
          if (!target || typeof target !== 'object' || !('x' in target) || !('y' in target)) {
            return false;
          }
          if (!target.isEmpty || target.isHole) return false;
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          return MovementUtil.getReachableCells(board, pos, 3, false)
            .some(cell => cell.id === target.id);
        },
        execute: (player, board, target) => {
          if (!target || !target.isEmpty || target.isHole) {
            return { success: false, message: 'Invalid target' };
          }
          const result = StructurePlacement.placeBaitWithEffects(board, player, target);
          return {
            success: result.success,
            message: `Bait Launcher - ${result.message}`
          };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          return evaluator.getBaitPlacementValue(target);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          
          const targets = MovementUtil.getReachableCells(board, pos, 3, false);
          
          if (targets.length === 0) {
            return { success: false, message: 'No valid targets' };
          }
          
          // Find the best target (near zombies)
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          const zombies = board.getAllZombies();
          
          for (const target of targets) {
            let score = 0;
            for (const zombie of zombies) {
              const dist = Math.abs(target.x - zombie.x) + Math.abs(target.y - zombie.y);
              if (dist <= 2) {
                score += (3 - dist) * 3;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
          
          const result = StructurePlacement.placeBaitWithEffects(board, player, bestTarget);
          return {
            success: result.success,
            message: `Bait Launcher - ${result.message} at (${bestTarget.x},${bestTarget.y})`
          };
        }
      }
    ]
  },

  // Confident First Step
  confident_first_step: {
  id: 'game_confident_first_step',
  name: 'Confident First Step',
  description: 'Move one free step (cannot jump over traps or barricades)',
  isDualOption: false,
  options: [
    {
      id: 'confident_step_move',
      name: 'Free Move',
      description: 'Move one free step',
      targetType: 'cell',
      goldCost: 0,
      canUse: (player, board, target) => {
        if (!target || target.isHole) return false;
        // Must be empty (no player, zombie, trap, barricade, bait)
        if (!target.isEmpty) return false; 
        if (target.hasBarricade) return false;
        const pos = board.getPlayerPosition(player);
        if (!pos) return false;
        const cell = board.getCell(pos.x, pos.y);
        if (!cell) return false;
        return board.getNeighbors(cell).includes(target);
      },
        execute: (player, board, target) => {
          if (!target || !target.isEmpty || target.isHole) {
            return { success: false, message: 'Invalid target' };
          }
          const pos = board.getPlayerPosition(player);
          if (!pos) return { success: false, message: 'Player not on board' };
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) return { success: false, message: 'Current cell not found' };
          cell.clear();
          target.setPlayer(player);
          return { success: true, message: 'Confident First Step - Moved 1 free step (ignored barricades)' };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return 0;
          return evaluator.getMoveValue(player, target);
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          const cell = board.getCell(pos.x, pos.y);
          if (!cell) {
            return { success: false, message: 'Player cell not found' };
          }
          
          const targets = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
          if (targets.length === 0) {
            return { success: false, message: 'No valid targets' };
          }
          
          // Find the best target (away from zombies)
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          const zombies = board.getAllZombies();
          
          for (const target of targets) {
            let score = 0;
            for (const zombie of zombies) {
              const dist = Math.abs(target.x - zombie.x) + Math.abs(target.y - zombie.y);
              if (dist <= 2) {
                score += (3 - dist) * 2;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
          
          cell.clear();
          bestTarget.setPlayer(player);
          return { success: true, message: `Confident First Step - Moved to (${bestTarget.x},${bestTarget.y}) (ignored barricades)` };
        }
      }
    ]
  },

  // Gymnastics Training 
gymnastics_training: {
  id: 'game_gymnastics_training',
  name: 'Gymnastics Training',
  description: 'Jump over an adjacent player or zombie into an open tile, gain 2 gold',
  isDualOption: false,
  options: [
    {
      id: 'gymnastics_jump',
      name: 'Jump Over',
      description: 'Jump over an adjacent player or zombie into an open tile, gain 2 gold',
      targetType: 'cell',
      goldCost: 0,
      canUse: (player, board, target): boolean => {
        if (!target || typeof target !== 'object' || !('x' in target) || !('y' in target)) {
          return false;
        }
        const pos = board.getPlayerPosition(player);
        if (!pos) return false;
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const middleCell = board.getCell(target.x, target.y);
        if (!middleCell || !board.getNeighbors(pos).includes(middleCell)) return false;
        
        // Only another player or a zombie can be jumped over.
        if (middleCell.hasPlayer && middleCell.structureOwner === player) return false;
        if (!middleCell.hasPlayer && !middleCell.hasZombie) return false;
        
        // Landing cell must be empty and not a hole
        const landingX = pos.x + dx * 2;
        const landingY = pos.y + dy * 2;
        const landingCell = board.getCell(landingX, landingY);
        return !!(landingCell && landingCell.isEmpty && !landingCell.isHole);
      },
      execute: (player, board, target) => {
        const pos = board.getPlayerPosition(player);
        if (!pos) return { success: false, message: 'Player not on board' };
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const landingX = pos.x + dx * 2;
        const landingY = pos.y + dy * 2;
        const landingCell = board.getCell(landingX, landingY);
        if (!landingCell || !landingCell.isEmpty || landingCell.isHole) {
          return { success: false, message: 'No empty landing tile' };
        }
        
        // Recheck the jumped-over occupant and landing tile at execution time.
        const middleCell = board.getCell(target.x, target.y);
        if (!middleCell || !board.getNeighbors(pos).includes(middleCell)) {
          return { success: false, message: 'Must jump over an adjacent player or zombie' };
        }
        if (middleCell.hasPlayer && middleCell.structureOwner === player) {
          return { success: false, message: 'Cannot jump over yourself' };
        }
        if (!middleCell.hasPlayer && !middleCell.hasZombie) {
          return { success: false, message: 'Must jump over a player or zombie' };
        }
        
        const currentCell = board.getCell(pos.x, pos.y);
        if (currentCell) currentCell.clear();
        landingCell.setPlayer(player);
        player.addGold(2);
        return { success: true, message: `Gymnastics Training - Jumped over ${middleCell.hasPlayer ? 'player' : 'zombie'} and gained 2 gold` };
      },
      expectedValue: (player, board, evaluator, target) => {
        if (!target) return 0;
        const pos = board.getPlayerPosition(player);
        if (!pos) return 0;
        const dx = target.x - pos.x;
        const dy = target.y - pos.y;
        const landingX = pos.x + dx * 2;
        const landingY = pos.y + dy * 2;
        const landingCell = board.getCell(landingX, landingY);
        if (!landingCell) return 0;
        return 2 + evaluator.getMoveValue(player, landingCell);
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        const pos = board.getPlayerPosition(player);
        if (!pos) {
          return { success: false, message: 'Player not on board' };
        }
        const cell = board.getCell(pos.x, pos.y);
        if (!cell) {
          return { success: false, message: 'Player cell not found' };
        }
        
        const targets = board.getNeighbors(cell).filter(target => {
          if (target.hasPlayer && target.structureOwner === player) return false;
          if (!target.hasPlayer && !target.hasZombie) return false;
          const landing = board.getCell(pos.x + (target.x - pos.x) * 2, pos.y + (target.y - pos.y) * 2);
          return !!landing && landing.isEmpty && !landing.isHole;
        });
        
        if (targets.length === 0) {
          return { success: false, message: 'No adjacent player or zombie with an open landing tile' };
        }
        
        let bestTarget = targets[0];
        let bestScore = -Infinity;
        
        for (const target of targets) {
          const dx = target.x - pos.x;
          const dy = target.y - pos.y;
          const landingX = pos.x + dx * 2;
          const landingY = pos.y + dy * 2;
          const landingCell = board.getCell(landingX, landingY);
          if (landingCell && landingCell.isEmpty && !landingCell.isHole) {
            let score = 0;
            const zombies = board.getAllZombies();
            for (const zombie of zombies) {
              const dist = Math.abs(landingCell.x - zombie.x) + Math.abs(landingCell.y - zombie.y);
              if (dist <= 2) score += (3 - dist) * 2;
            }
            // Prefer disrupting a player, while keeping zombie jumps viable.
            if (target.hasPlayer) score += 5;
            if (target.hasZombie) score += 3;
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
        }
        
        const dx = bestTarget.x - pos.x;
        const dy = bestTarget.y - pos.y;
        const landingX = pos.x + dx * 2;
        const landingY = pos.y + dy * 2;
        const landingCell = board.getCell(landingX, landingY);
        if (!landingCell || !landingCell.isEmpty || landingCell.isHole) {
          return { success: false, message: 'No empty landing tile' };
        }
        
        const currentCell = board.getCell(pos.x, pos.y);
        if (currentCell) currentCell.clear();
        landingCell.setPlayer(player);
        player.addGold(2);
        return { success: true, message: `Gymnastics Training - Jumped over ${bestTarget.hasPlayer ? 'player' : 'zombie'} to (${landingX},${landingY}), gained 2 gold` };
      }
    }
  ]
},

  // Grappling Hook
  grappling_hook: {
    id: 'locker_grappling_hook',
    name: 'Grappling Hook',
    description: 'Pay 1 Gold to make one long jump to any tile within 2 steps',
    isDualOption: false,
    options: [
      {
        id: 'grappling_hook_jump',
        name: 'Long Jump',
        description: 'Jump to any tile within 2 steps (pay 1 gold)',
        targetType: 'cell',
        goldCost: 1,
        canUse: (player, board, target) => {
          if (player.gold < 1) return false;
          if (!target || !target.isEmpty || target.isHole) return false;
          const pos = board.getPlayerPosition(player);
          if (!pos) return false;
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          return dist <= 2;
        },
        execute: (player, board, target) => {
          if (player.gold < 1) return { success: false, message: 'Need 1 gold' };
          if (!target || !target.isEmpty || target.isHole) {
            return { success: false, message: 'Invalid target' };
          }
          const pos = board.getPlayerPosition(player);
          if (!pos) return { success: false, message: 'Player not on board' };
          const currentCell = board.getCell(pos.x, pos.y);
          if (currentCell) currentCell.clear();
          target.setPlayer(player);
          player.spendGold(1);
          return { success: true, message: `Grappling Hook - jumped to (${target.x}, ${target.y})` };
        },
        expectedValue: (player, board, evaluator, target) => {
          if (!target) return -1;
          const moveValue = evaluator.getMoveValue(player, target); 
          return moveValue - 1;
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 1) {
            return { success: false, message: 'Need 1 gold' };
          }
          
          const pos = board.getPlayerPosition(player);
          if (!pos) {
            return { success: false, message: 'Player not on board' };
          }
          
          const targets: BoardCell[] = [];
          const allCells = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
          for (const cell of allCells) {
            const dist = Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y);
            if (dist <= 2) {
              targets.push(cell);
            }
          }
          
          if (targets.length === 0) {
            return { success: false, message: 'No valid targets' };
          }
          
          let bestTarget = targets[0];
          let bestScore = -Infinity;
          const zombies = board.getAllZombies();
          
          for (const target of targets) {
            let score = 0;
            for (const zombie of zombies) {
              const dist = Math.abs(target.x - zombie.x) + Math.abs(target.y - zombie.y);
              if (dist <= 2) {
                score += (3 - dist) * 2;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }
          
          const currentCell = board.getCell(pos.x, pos.y);
          if (currentCell) currentCell.clear();
          bestTarget.setPlayer(player);
          player.spendGold(1);
          return { success: true, message: `Grappling Hook - jumped to (${bestTarget.x}, ${bestTarget.y})` };
        }
      }
    ]
  },

  // Long Sleeves
  long_sleeves: {
  id: 'locker_long_sleeves',
  name: 'Long Sleeves',
  description: 'Pay 2 gold to draw two cards and keep one',
  isDualOption: false,
  options: [
    {
      id: 'long_sleeves_draw',
      name: 'Draw 2, Keep 1',
      description: 'Pay 2 gold to draw two cards and keep one',
      targetType: 'none',
      goldCost: 2,
      canUse: (player, board) => {
        if (player.gold < 2) return false;
        const game = CardProcessor.getGame();
        if (!game || !game.cardManager) return false;
        // Fix: use getGameDeckSize() instead of getDeckSize('game')
        return game.cardManager.getGameDeckSize() >= 2;
      },
      execute: (player, board) => {
        if (player.gold < 2) return { success: false, message: 'Need 2 gold' };
        const result = CardDrawer.drawKeep(player, 2, 1);
        if (result.success) {
          player.spendGold(2);
        }
        return {
          success: result.success,
          message: result.success ? 'Long Sleeves - spend 2 gold to draw 2 cards and keep 1' : result.message
        };
      },
      expectedValue: (player, board, evaluator) => {
        return 2 ; 
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        if (player.gold < 2) {
          return { success: false, message: 'Need 2 gold' };
        }
        const game = CardProcessor.getGame();
        if (!game || !game.cardManager) {
          return { success: false, message: 'Game or CardManager not available' };
        }
        // Fix: use getGameDeckSize() instead of getDeckSize('game')
        if (game.cardManager.getGameDeckSize() < 2) {
          return { success: false, message: 'Not enough cards in deck' };
        }
        const result = CardDrawer.drawKeep(player, 2, 1);
        if (result.success) {
          player.spendGold(2);
        }
        return {
          success: result.success,
          message: result.success ? 'Long Sleeves - spend 2 gold to draw 2 cards and keep 1' : result.message
        };
      }
    }
  ]
},

  // Pyramid Scheme
  pyramid_scheme: {
    id: 'locker_pyramid_scheme',
    name: 'Pyramid Scheme',
    description: 'Pay 3 gold to discard 1 card from your hand, gain 1 GP',
    isDualOption: false,
    options: [
      {
        id: 'pyramid_scheme_discard',
        name: 'Discard for GP',
        description: 'Pay 3 gold to discard 1 card, gain 1 GP',
        targetType: 'none',
        goldCost: 3,
        canUse: (player, board) => {
          if (player.gold < 3) return false;
          return player.hand.cards.length >= 1;
        },
        execute: (player, board) => {
          if (player.gold < 3) return { success: false, message: 'Need 3 gold' };
          if (player.hand.cards.length < 1) {
            return { success: false, message: 'No cards to discard' };
          }
          const result = CardDrawer.discardDraw(player, 0);
          if (result.success) {
            player.spendGold(3);
            player.addGPs(1);
          }
          return {
            success: result.success,
            message: result.success ? `Pyramid Scheme - spent 3 gold and discarded 1 card to gain 1 GP` : result.message
          };
        },
        expectedValue: (player, board, evaluator) => {
          return evaluator.getSPValue(player) - 9; 
        },
        autoExecute: (player: Player, board: Board, evaluator: any) => {
          if (player.gold < 3) {
            return { success: false, message: 'Need 3 gold' };
          }
          if (player.hand.cards.length < 1) {
            return { success: false, message: 'No cards to discard' };
          }
          const result = CardDrawer.discardDraw(player, 0);
          if (result.success) {
            player.spendGold(3);
            player.addGPs(1);
          }
          return {
            success: result.success,
            message: result.success ? `Pyramid Scheme - spent 3 gold and discarded 1 card to gain 1 GP` : result.message
          };
        }
      }
    ]
  },

  // Shoes
  shoes: {
  id: 'locker_shoes',
  name: 'Shoes',
  description: 'Pay 1 gold to take two steps',
  isDualOption: false,
  options: [
    {
      id: 'shoes_move',
      name: 'Move 2 Steps',
      description: 'Pay 1 gold to take two steps',
      targetType: 'cell',  
      maxPathLength: 2,
      goldCost: 1,
     canUse: (player, board, target) => {
          if (player.gold < 1) return false;
          const routes = MovementUtil.getShoesMoveRoutes(board, player);
          const affordableRoutes = routes.filter((route) => player.gold >= 1 + route.jumpedObjects.length * player.getObstacleJumpToll());
          if (!target) return affordableRoutes.length > 0;
          return affordableRoutes.some((route) => route.target.x === target.x && route.target.y === target.y);
},
      execute: (player, board, target) => {
  const route = target && MovementUtil.getShoesMoveRoutes(board, player)
    .find((candidate) => candidate.target.x === target.x && candidate.target.y === target.y);
  if (!route) return { success: false, message: 'Invalid target' };
  const totalCost = 1 + route.jumpedObjects.length * player.getObstacleJumpToll();
  if (player.gold < totalCost) return { success: false, message: `Need ${totalCost} gold for Shoes and jump tolls` };
  
  const pos = board.getPlayerPosition(player);
  if (!pos) return { success: false, message: 'Player not on board' };
  
  const currentCell = board.getCell(pos.x, pos.y);
  if (currentCell) currentCell.clear();
  route.target.setPlayer(player);
  player.spendGold(totalCost);
  for (const jumpedObject of route.jumpedObjects) {
    jumpedObject.structureOwner?.addGold(1);
  }
  player.addGold(route.jumpedObjects.length * player.getObstacleJumpRefund());
  
  return { success: true, message: `Shoes - moved 2 steps to (${route.target.x}, ${route.target.y})` };
},
      expectedValue: (player, board, evaluator, target) => {
        if (!target) return -1;
        const moveValue = evaluator.getMoveValue(player, target) ;
        const route = MovementUtil.getShoesMoveRoutes(board, player)
          .find((candidate) => candidate.target.x === target.x && candidate.target.y === target.y);
        return moveValue - (route ? 1 + route.jumpedObjects.length * player.getObstacleJumpToll() : 1);
      },
      autoExecute: (player: Player, board: Board, evaluator: any) => {
        const routes = MovementUtil.getShoesMoveRoutes(board, player)
          .filter((route) => player.gold >= 1 + route.jumpedObjects.length * player.getObstacleJumpToll());
        if (routes.length === 0) {
          return { success: false, message: 'No valid Shoes movement available' };
        }

        const bestRoute = routes.reduce((best, route) =>
          evaluator.getMoveValue(player, route.target) > evaluator.getMoveValue(player, best.target) ? route : best
        );
        return LockerActions.shoes.options[0].execute(player, board, bestRoute.target);
}
    }
  ]
}
};

// ============================================================
// COMBINED EXPORT
// ============================================================

const LockerActionAliases = {
  locker_cool_for_sale: LockerActions.cool_for_sale,
  locker_free_hugs: LockerActions.free_hugs,
  locker_grappling_hook: GameDeckActions.grappling_hook,
  locker_long_sleeves: GameDeckActions.long_sleeves,
  locker_nice_for_sale: LockerActions.nice_for_sale,
  locker_ouija_board: LockerActions.ouija_board,
  locker_pyramid_scheme: GameDeckActions.pyramid_scheme,
  locker_shoes: GameDeckActions.shoes,
} as const;

export const AllSpecialActions: Record<string, ActionEffect> = {
  ...HeroActions,
  ...LockerActions,
  ...LockerActionAliases,
  ...GameDeckActions
};