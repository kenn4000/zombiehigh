// BoardEvaluator.ts

import { Player, Board, BoardCell, GameConstants } from '../index';

export class BoardEvaluator {
  private readonly nightSteps: number;

  constructor(
    private readonly board: Board,
    private readonly allPlayers: Player[],
    private readonly onNight: number
  ) {
    this.nightSteps = 1 + (onNight > 3 ? 1 : 0) + (onNight > 6 ? 1 : 0) + (onNight > 9 ? 1 : 0);
  }
private getSPValue(): number {
    return GameConstants.getSPValue(this.onNight);
  }
  // ============================================================
  // MAIN EVALUATION
  // ============================================================

  evaluate(player: Player): number {
    const zombieCells = this.board.getAllCells().filter(c => c.hasZombie);
    
    // 1. Calculate threat: expected health loss from zombies
    const threat = this.calculateThreat(player, zombieCells);
    
    // 2. Calculate trap value: each trap on a path gets SP value
    const trapValue = this.calculateTrapValue(player, zombieCells);
    
    // 3. Calculate barricade value: each zombie on a path counts for safety
    const barricadeValue = this.calculateBarricadeValue(player, zombieCells);
    
    // 4. Calculate position safety
    const safetyValue = this.calculateSafetyValue(player, zombieCells);
    
    // Total score = -threat + trapValue + barricadeValue + safetyValue
    const score = -threat + trapValue + barricadeValue + safetyValue;
    
    return score;
  }

  getBoardScore(player: Player): number {
    return this.evaluate(player);
  }

  // ============================================================
  // TRAP PLACEMENT VALUE - DIRECT CALCULATION (NO CLONE)
  // ============================================================

  getTrapPlacementValue(player: Player, targetCell: BoardCell): number {
    if (!targetCell) return 0;
    
    const spValue = GameConstants.getSPValue(this.onNight);
    const healthValue = player.getHealthValue(this.onNight);
    const effectiveness = player.getTrapEffectiveness(); // 1-6
    const successRate = effectiveness / 8;
    
    let totalValue = 0;
    const zombieCells = this.board.getAllCells().filter(c => c.hasZombie);
    
    for (const zombie of zombieCells) {
      // Find the player this zombie is targeting
      let targetPlayer: Player | null = null;
      let minDist = Infinity;
      
      for (const p of this.allPlayers) {
        if (p.isEliminated) continue;
        const pPos = this.board.getPlayerPosition(p);
        if (!pPos) continue;
        const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
        if (dist < minDist) {
          minDist = dist;
          targetPlayer = p;
        }
      }
      
      if (!targetPlayer) continue;
      const targetPos = this.board.getPlayerPosition(targetPlayer);
      if (!targetPos) continue;
      
      // Check if trap is on the zombie's path to the player
      const path = this.board.findShortestPathZombie(zombie.x, zombie.y, targetPos.x, targetPos.y);
      if (!path) continue;
      
      let trapOnPath = false;
      let trapIndex = -1;
      for (let i = 0; i < path.length; i++) {
        if (path[i].x === targetCell.x && path[i].y === targetCell.y) {
          trapOnPath = true;
          trapIndex = i;
          break;
        }
      }
      
      if (!trapOnPath) continue;
      
      // Check if there's a barricade before the trap
      let barricadeBeforeTrap = false;
      for (let i = 0; i < trapIndex; i++) {
        if (path[i].hasBarricade) {
          barricadeBeforeTrap = true;
          break;
        }
      }
      
      // If there's a barricade before the trap, the zombie might not reach the trap
      if (barricadeBeforeTrap) continue;
      
      // Check if the zombie will reach the player
      const stepsToPlayer = path.length - 1;
      const willReachPlayer = stepsToPlayer <= this.nightSteps;
      
      // Calculate trap value based on whether zombie reaches player
      if (willReachPlayer) {
        // (a) Zombie will reach player: (spValue + healthValue) * successRate
        totalValue += (spValue + healthValue) * successRate;
      } else {
        // (b) Zombie won't reach player but will reach trap: spValue * successRate
        totalValue += spValue * successRate;
      }
    }
    
    return totalValue;
  }

  // ============================================================
  // BARRICADE PLACEMENT VALUE - DIRECT CALCULATION (NO CLONE)
  // ============================================================
getBarricadePlacementValue(player: Player, targetCell: BoardCell): number {
  if (!targetCell || !targetCell.isEmpty || targetCell.isHole) return 0;
  
  const spValue = GameConstants.getSPValue(this.onNight);
  const healthValue = player.getHealthValue(this.onNight);
  const effectiveness = player.getBarricadeEffectiveness(); // 1-6
  const successRate = Math.min(effectiveness / 8, 1);
  const barricadeValue = GameConstants.FLEX_POINT_VALUE * 8 / Math.max(1, 8 - effectiveness);
  
  let totalValue = 0;
  let zombiesBlocked = 0;
  
  // Get all zombies on the board
  const zombieCells = this.board.getAllCells().filter(c => c.hasZombie);
  
  // Find the player's position
  const playerPos = this.board.getPlayerPosition(player);
  if (!playerPos) return 0;
  
  // For each zombie, check if the barricade would be useful against it
  for (const zombie of zombieCells) {
    // Find the nearest player this zombie would target
    let targetPlayer: Player | null = null;
    let minDist = Infinity;
    
    for (const p of this.allPlayers) {
      if (p.isEliminated || p === player) continue; // Only consider other players? Or all?
      const pPos = this.board.getPlayerPosition(p);
      if (!pPos) continue;
      const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
      if (dist < minDist) {
        minDist = dist;
        targetPlayer = p;
      }
    }
    
    // If no target player found, skip this zombie
    if (!targetPlayer) continue;
    
    const targetPos = this.board.getPlayerPosition(targetPlayer);
    if (!targetPos) continue;
    
    // Check if the zombie can reach the target player
    const path = this.board.findShortestPathZombie(
      zombie.x, zombie.y, 
      targetPos.x, targetPos.y
    );
    
    if (!path || path.length === 0) continue;
    
    // Check if the target cell is on this zombie's path
    let barricadeOnPath = false;
    let barricadeIndex = -1;
    
    // Check each cell in the path (excluding the zombie's current cell)
    for (let i = 1; i < path.length; i++) {
      if (path[i].x === targetCell.x && path[i].y === targetCell.y) {
        barricadeOnPath = true;
        barricadeIndex = i;
        break;
      }
    }
    
    if (!barricadeOnPath) continue;
    
    // Check if there's already a barricade before this one on the path
    let earlierBarricade = false;
    for (let i = 1; i < barricadeIndex; i++) {
      if (path[i].hasBarricade) {
        earlierBarricade = true;
        break;
      }
    }
    
    if (earlierBarricade) continue;
    
    // Check if this is the closest barricade to the zombie
    let closerBarricade = false;
    for (let i = 1; i < barricadeIndex; i++) {
      if (path[i].hasBarricade && path[i].structureOwner === player) {
        closerBarricade = true;
        break;
      }
    }
    
    if (closerBarricade) continue;
    
    // This zombie will encounter this barricade
    zombiesBlocked++;
    
    // Calculate the distance from zombie to barricade
    const stepsToBarricade = barricadeIndex;
    const stepsToPlayer = path.length - 1;
    
    // Calculate how many steps the zombie can move this night
    const zombieSpeed = 1; // Default zombie speed
    const stepsZombieCanMove = Math.min(this.nightSteps, stepsToPlayer);
    
    // Will the zombie reach the barricade this night?
    const willReachBarricade = stepsToBarricade <= stepsZombieCanMove;
    
    // Will the zombie reach the player this night?
    const willReachPlayer = stepsToPlayer <= stepsZombieCanMove;
    
    // Calculate value based on the situation
    if (willReachPlayer) {
      // Zombie will reach player - barricade is critical
      const remainingStepsAfterBarricade = Math.max(0, stepsToPlayer - stepsToBarricade - 1);
      const stallFactor = Math.pow(1 - successRate, remainingStepsAfterBarricade);
      const healthSaved = healthValue * (1 - stallFactor);
      totalValue += barricadeValue + healthSaved;
      
      // Additional value for each zombie blocked
      totalValue += GameConstants.FLEX_POINT_VALUE * 0.5;
    } else if (willReachBarricade) {
      // Zombie will reach barricade but not player - good for SP
      totalValue += barricadeValue * 0.7;
    } else {
      // Zombie won't reach either - still some value (future protection)
      totalValue += barricadeValue * 0.3;
    }
  }
   
  
  // Log what we found
  console.log(`[BarricadeEval] Cell (${targetCell.x},${targetCell.y}): ${zombiesBlocked} zombies blocked, total value: ${totalValue.toFixed(2)}`);
  
  return totalValue;
}

  // ============================================================
  // MOVE VALUE - DIRECT CALCULATION  
  // ============================================================

  getMoveValue(player: Player, targetCell: BoardCell): number {
    if (!targetCell) return 0;
    
    // Calculate threat at current position vs target position
    const currentPos = this.board.getPlayerPosition(player);
    if (!currentPos) return 0;
    
    const healthValue = player.getHealthValue(this.onNight);
    const zombieCells = this.board.getAllCells().filter(c => c.hasZombie);
    
    const currentThreat = this.calculateThreatAtPosition(currentPos, zombieCells, healthValue);
    const targetThreat = this.calculateThreatAtPosition(targetCell, zombieCells, healthValue);
    
    // Move value is the reduction in threat
    return currentThreat - targetThreat;
  }

  private calculateThreatAtPosition(pos: { x: number; y: number }, zombieCells: BoardCell[], healthValue: number): number {
    let totalThreat = 0;
    
    for (const zombie of zombieCells) {
      const dist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
      if (dist <= this.nightSteps) {
        // The closer the zombie, the higher the threat
        const threatMultiplier = 1 - ((dist - 1) / this.nightSteps);
        totalThreat += threatMultiplier * healthValue;
      }
    }
    
    return totalThreat;
  }

  // ============================================================
  // BAIT PLACEMENT VALUE - DIRECT CALCULATION (NO CLONE)
  // ============================================================

getBaitPlacementValue(player: Player, targetCell: BoardCell): number {
  if (!targetCell) return 0;
  
  const healthValue = player.getHealthValue(this.onNight);
  const pos = this.board.getPlayerPosition(player);
  if (!pos) return 0;
  
  let flexPoints = 0;
  let healthSaved = 0;
  const zombieCells = this.board.getAllCells().filter(c => c.hasZombie);
  const nightSteps = 1 + (this.onNight > 3 ? 1 : 0) + (this.onNight > 6 ? 1 : 0) + (this.onNight > 9 ? 1 : 0);
  const baitRadius = player.getBaitRadius ? player.getBaitRadius() : 3;
  
  for (const zombie of zombieCells) {
    // Check if zombie can reach the bait
    const distToBait = Math.abs(zombie.x - targetCell.x) + Math.abs(zombie.y - targetCell.y);
    const canReachBait = distToBait <= nightSteps;
    
    // Check if zombie would reach the player
    const distToPlayer = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
    const wouldReachPlayer = distToPlayer <= nightSteps;
    
    // 1. FLEX POINT: If zombie will reach the bait (regardless of who it was targeting)
    if (canReachBait && distToBait <= baitRadius) {
      flexPoints++;
    }
    
    // 2. HEALTH SAVED: If zombie was going to reach player but will go for bait instead
    if (wouldReachPlayer && canReachBait && distToBait <= baitRadius) {
      healthSaved++;
    }
  }
  
  // Total value = (flexPoints * FLEX_POINT_VALUE) + (healthSaved * healthValue)
  const totalValue = (flexPoints * GameConstants.FLEX_POINT_VALUE) + (healthSaved * healthValue);
  
  console.log(`  Bait at (${targetCell.x},${targetCell.y}): flexPoints=${flexPoints}, healthSaved=${healthSaved}, value=${totalValue.toFixed(2)}`);
  
  return totalValue;
}

  // ============================================================
  // ZOMBIE KILL VALUE (MELEE) - DIRECT CALCULATION (NO CLONE)
  // ============================================================

  getZombieKillValue(player: Player, zombieCell: BoardCell): number {
    if (!zombieCell || !zombieCell.hasZombie) return 0;
    
    const spValue = GameConstants.getSPValue(this.onNight);
    const healthValue = player.getHealthValue(this.onNight);
    const effectiveness = player.getMeleeEffectiveness(); // 1-6
    const successRate = effectiveness / 8;
    
    // Value of killing a zombie = 2 * spValue + healthValue (if zombie was going to reach player)
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return 0;
    
    const dist = Math.abs(zombieCell.x - pos.x) + Math.abs(zombieCell.y - pos.y);
    const willReachPlayer = dist <= this.nightSteps;
    
    const killValue = willReachPlayer ? (2 * spValue + healthValue) : (2 * spValue);
    return killValue * successRate;
  }

  // ============================================================
  // THREAT CALCULATION
  // ============================================================

  /**
   * Calculate expected health loss from zombies
   * Barricades reduce threat (each barricade on a path blocks the zombie)
   * Traps kill zombies (a trap on the path kills the zombie)
   */
  private calculateThreat(player: Player, zombieCells: BoardCell[]): number {
    if (!player || player.isEliminated) return 0;
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return 0;
    
    const healthValue = player.getHealthValue(this.onNight);
    let totalThreat = 0;
    
    for (const zombie of zombieCells) {
      // Calculate distance from zombie to player (Manhattan)
      const dist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
      
      // If zombie is within nightSteps, it can reach the player
      if (dist <= this.nightSteps) {
        // Check for barricades and traps on the path
        const path = this.board.findShortestPathZombie(zombie.x, zombie.y, pos.x, pos.y);
        if (!path) continue;
        
        let reachProbability = 1;
        
        // Check for barricades
        let barricadePos = -1;
        let barricadeEffectiveness = 0;
        
        for (let i = 0; i < path.length - 1; i++) {
          const cell = path[i];
          if (cell.hasBarricade) {
            barricadePos = i;
            if (cell.structureOwner) {
              barricadeEffectiveness = cell.structureOwner.getBarricadeEffectiveness();
            }
            break;
          }
        }
        
        if (barricadePos >= 0 && barricadeEffectiveness > 0) {
          const p = barricadeEffectiveness / 8;
          const remainingSteps = dist - barricadePos - 1;
          reachProbability = (1 - p) * Math.pow(1 - p, remainingSteps);
          reachProbability = Math.min(Math.max(reachProbability, 0), 1);
        }
        
        // Check for traps
        let trapKills = false;
        for (let i = 0; i < path.length - 1; i++) {
          const cell = path[i];
          if (cell.hasTrap && cell.structureOwner) {
            const trapOwner = cell.structureOwner;
            const trapEffectiveness = trapOwner.getTrapEffectiveness();
            const trapSuccessRate = trapEffectiveness / 8;
            if (Math.random() < trapSuccessRate) {
              trapKills = true;
              break;
            }
          }
        }
        
        if (trapKills) {
          reachProbability = 0;
        }
        
        totalThreat += reachProbability * healthValue;
      }  
    }
    
    return totalThreat;
  }

  // ============================================================
  // TRAP VALUE CALCULATION
  // ============================================================

  /**
   * Calculate value of traps on zombie paths
   * Each trap on a path gets: SP value + (effectiveness/8) * SP value
   * A trap should only count once per zombie path (not double count)
   */
  private calculateTrapValue(player: Player, zombieCells: BoardCell[]): number {
    const spValue =GameConstants.getSPValue(this.onNight);
    const effectiveness = player.getTrapEffectiveness(); // 1-6
    const baseValue = spValue + (effectiveness / 8) * spValue;
    
    let totalValue = 0;
    const processedTraps = new Set<string>();
    
    for (const zombie of zombieCells) {
      // Find closest player to this zombie
      let closestPlayer: Player | null = null;
      let minDist = Infinity;
      
      for (const p of this.allPlayers) {
        if (p.isEliminated) continue;
        const pPos = this.board.getPlayerPosition(p);
        if (!pPos) continue;
        const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
        if (dist < minDist) {
          minDist = dist;
          closestPlayer = p;
        }
      }
      
      if (!closestPlayer) continue;
      const closestPos = this.board.getPlayerPosition(closestPlayer);
      if (!closestPos) continue;
      
      const path = this.board.findShortestPathZombie(zombie.x, zombie.y, closestPos.x, closestPos.y);
      if (!path) continue;
      
      // Check for traps on the path
      for (let i = 0; i < path.length - 1; i++) {
        const cell = path[i];
        if (cell.hasTrap && cell.structureOwner === player) {
          const key = `${cell.x},${cell.y}`;
          // Only count each trap once (don't double count for multiple zombies)
          if (!processedTraps.has(key)) {
            processedTraps.add(key);
            totalValue += baseValue;
          }
          break; // Only count the first trap on the path for this zombie
        }
      }
    }
    
    return totalValue;
  }

  // ============================================================
  // BARRICADE VALUE CALCULATION
  // ============================================================

  /**
   * Calculate value of barricades on zombie paths
   * Each barricade on a path gets: SP value + 4 * (8 / effectiveness)
   * Barricades should count each zombie they protect against (safety value)
   */
  private calculateBarricadeValue(player: Player, zombieCells: BoardCell[]): number {
  if (!player || player.isEliminated) return 0;
  
  const spValue = GameConstants.getSPValue(this.onNight);
  const effectiveness = player.getBarricadeEffectiveness(); // 1-6
  const successRate = Math.min(effectiveness / 8, 1);
  const barricadeValue = GameConstants.FLEX_POINT_VALUE * 8 / Math.max(1, 8 - effectiveness);
  const healthValue = player.getHealthValue(this.onNight);
  
  let totalValue = 0;
  const processedBarricades = new Set<string>();
  
  for (const zombie of zombieCells) {
    // Find the player this zombie is targeting (closest player)
    let targetPlayer: Player | null = null;
    let minDist = Infinity;
    
    for (const p of this.allPlayers) {
      if (p.isEliminated) continue;
      const pPos = this.board.getPlayerPosition(p);
      if (!pPos) continue;
      const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
      if (dist < minDist) {
        minDist = dist;
        targetPlayer = p;
      }
    }
    
    if (!targetPlayer) continue;
    const targetPos = this.board.getPlayerPosition(targetPlayer);
    if (!targetPos) continue;
    
    // Find path from zombie to target player
    const path = this.board.findShortestPathZombie(
      zombie.x, zombie.y, 
      targetPos.x, targetPos.y
    );
    
    if (!path || path.length === 0) continue;
    
    // Check for barricades on the path
    for (let i = 0; i < path.length - 1; i++) {
      const cell = path[i];
      if (cell.hasBarricade && cell.structureOwner === player) {
        const key = `${cell.x},${cell.y}`;
        // Only count each barricade once (don't double count for multiple zombies)
        if (!processedBarricades.has(key)) {
          processedBarricades.add(key);
          
          // Calculate value based on position and effectiveness
          const stepsToBarricade = i;
          const stepsToPlayer = path.length - 1;
          const stepsZombieCanMove = Math.min(this.nightSteps, stepsToPlayer);
          
          // Will the zombie reach the barricade this night?
          const willReachBarricade = stepsToBarricade <= stepsZombieCanMove;
          const willReachPlayer = stepsToPlayer <= stepsZombieCanMove;
          
          if (willReachPlayer && !willReachBarricade) {
            // Zombie will reach player before barricade - barricade is less useful
            totalValue += barricadeValue * 0.3;
          } else if (willReachBarricade) {
            // Zombie will hit barricade - full value
            const remainingSteps = Math.max(0, stepsToPlayer - stepsToBarricade - 1);
            const stallFactor = Math.pow(1 - successRate, remainingSteps);
            const healthSaved = healthValue * (1 - stallFactor);
            totalValue += barricadeValue + (healthSaved * 0.5);
          } else {
            // Zombie won't reach either - barricade is future protection
            totalValue += barricadeValue * 0.5;
          }
          
          // Bonus if barricade is near the player (defensive perimeter)
          const playerPos = this.board.getPlayerPosition(player);
          if (playerPos) {
            const distToPlayer = Math.abs(cell.x - playerPos.x) + Math.abs(cell.y - playerPos.y);
            if (distToPlayer <= 2) {
              totalValue += spValue * 0.5;
            }
          }
           
          break;
        }
      }
    }
  }
  
  return totalValue;
}

  // ============================================================
  // SAFETY VALUE
  // ============================================================

  /**
   * Calculate safety value of current position
   * Nearby zombies reduce safety, nearby allies increase safety
   */
  private calculateSafetyValue(player: Player, zombieCells: BoardCell[]): number {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return 0;
    
    let safetyScore = 0;
    
    // Count nearby zombies (farther is better)
    for (const zombie of zombieCells) {
      const dist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
      if (dist <= 2) {
        safetyScore -= (3 - dist) * 2;
      }
    }
    
    // Count nearby allies (closer is better)
    for (const p of this.allPlayers) {
      if (p === player || p.isEliminated) continue;
      const pPos = this.board.getPlayerPosition(p);
      if (!pPos) continue;
      const dist = Math.abs(pPos.x - pos.x) + Math.abs(pPos.y - pos.y);
      if (dist <= 2) {
        safetyScore += (2 - dist);
      }
    }
    
    return safetyScore;
  }
}