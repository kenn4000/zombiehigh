// ZombieSimManager.ts
import { Board, BoardCell, Player, HeroId, ZombieSpawner, OccupantType, CardDrawer } from '../index';

export interface ZombieSimDeps {
  onTrapKill: (ownerId: string, x: number, y: number) => void;
  onTrapFailed: () => void;
  onBaitConsumed: (ownerId: string, x: number, y: number) => void;
  onPlayerAttacked: (playerId: string, x: number, y: number, fromCell: BoardCell) => void;
  getTrapSuccessRate: (player: Player) => number;
  getBarricadeSuccessRate: (player: Player) => number;
  log: (msg: string) => void;
}

export class ZombieSimManager {
  private zombieTrailHexKeys: Set<string> = new Set();
  private zombieTrailMoves: { fromKey: string; toKey: string }[] = [];

  constructor(
    private readonly board: Board,
    private readonly players: Player[],
    private readonly deps: ZombieSimDeps
  ) {}
zombiePhase(generationCount: number): number {
  const speed = this.getZombieSpeed(generationCount);
  this.zombieTrailHexKeys.clear();
  this.zombieTrailMoves = [];

  let zombiesMoved = 0;
  let zombiesKilled = 0;
  let playersAttacked = 0;

  // 1. Find all zombies and give them steps
  const zombies = this.getZombieCells();
  for (const cell of zombies) {
    cell.zombieStepsLeft = speed;
  }

  // 2. Process zombies until all have 0 steps
  let anyMovesLeft = true;
  let loopCount = 0;
  const maxLoops = 1000;

  while (anyMovesLeft && loopCount < maxLoops) {
    anyMovesLeft = false;
    loopCount++;

    const activeZombies = this.getZombieCells()
      .filter(z => z.zombieStepsLeft !== null && z.zombieStepsLeft > 0 && !z.isHole);

    if (activeZombies.length === 0) break;

    // Process each zombie's move
    for (const zombie of activeZombies) {
      if (!zombie.zombieStepsLeft || zombie.zombieStepsLeft <= 0) continue;
      if (zombie.isHole) continue;

      const stepsRemaining = zombie.zombieStepsLeft;
      
      // Find target
      const target = this.findTarget(zombie);
      const targetCell = target ? this.board.getCell(target.x, target.y) ?? null : null;
      if (!targetCell) {
        zombie.zombieTarget = null;
        zombie.zombieStepsLeft = 0;
        continue;
      }

      zombie.zombieTarget = targetCell;

      const path = this.board.findShortestPathZombie(zombie.x, zombie.y, targetCell.x, targetCell.y);
      if (!path || path.length < 2) {
        zombie.zombieTarget = targetCell;
        zombie.zombieStepsLeft = 0;
        continue;
      }

      const nextCell = path[1];
      const fromCell = zombie;
      const toCell = nextCell;

      // Check if target cell is occupied by another zombie (can't stack)
      if (toCell.hasZombie && toCell !== fromCell) {
        // Zombie blocked by another zombie - lose the step
        zombie.zombieStepsLeft = stepsRemaining - 1;
        console.log(`[Zombie] Zombie at (${fromCell.x},${fromCell.y}) blocked by zombie at (${toCell.x},${toCell.y}), lost step`);
        continue;
      }

      // Decrement steps BEFORE moving
      zombie.zombieStepsLeft = stepsRemaining - 1;

      // Record trail
      this.zombieTrailHexKeys.add(`${fromCell.x},${fromCell.y}`);

      // === CHECK BARRICADE ===
      if (toCell.hasBarricade && toCell.structureOwner) {
        const owner = toCell.structureOwner;
        const breakProbability = 1 - this.deps.getBarricadeSuccessRate(owner);
        
       if (Math.random() < breakProbability) {
  this.deps.log(`Barricade broke! (${owner.name})`);
  
  // === CHILD'S TOOL SET PASSIVE ===
  // "When any of your barricades are destroyed, draw 1 card"
  if (owner && owner.childsToolSetActive) {
    const drawnCards = CardDrawer.drawCards(owner, 1);
    this.deps.log(`${owner.name} drew ${drawnCards.length} card(s) from Child's Tool Set (barricade destroyed)`);
  }
  
  toCell.removeStructure();
  // Move zombie onto the cell
  this.moveZombie(fromCell, toCell);
  zombiesMoved++;
} else {
          owner.addCPs(1);
          this.deps.log(`Barricade held! (${owner.name})`);
          // Zombie used its step but didn't move
        }
        continue;
      }

      // === CHECK TRAP ===
      if (toCell.hasTrap && toCell.structureOwner) {
        const trapOwner = toCell.structureOwner;
        if (Math.random() < this.deps.getTrapSuccessRate(trapOwner)) {
          const spGain = 1 + (trapOwner.heroId === HeroId.ELSA_VON_TRAP ? 1 : 0);
          trapOwner.addSPs(spGain);
          this.deps.log(`Trap killed a zombie! ${trapOwner.name} gained ${spGain} SP`);
          this.deps.onTrapKill(trapOwner.id, toCell.x, toCell.y);
          toCell.clear();
          zombiesKilled++;
          // Zombie is dead
          continue;
        } else {
          this.deps.onTrapFailed();
          this.deps.log('Trap failed to activate.');
          toCell.clear();
          // Move zombie onto the cell
          this.moveZombie(fromCell, toCell);
          zombiesMoved++;
          continue;
        }
      }

      // === CHECK PLAYER ===
      if (toCell.hasPlayer) {
        const player = toCell.structureOwner!;
        const beforeHealth = player.currHealth;
        player.loseHealths(1);
        const afterHealth = player.currHealth;
        
        this.deps.log(`${player.name} was attacked at (${toCell.x},${toCell.y})! Health: ${beforeHealth} -> ${afterHealth}`);
        playersAttacked++;

        if (afterHealth <= 0 || player.isEliminated) {
          player.isEliminated = true;
          this.deps.log(`💀 ${player.name} was eliminated!`);
          toCell.clear();
          toCell.zombieId = `zombie-${Date.now()}`;
          toCell.zombieStepsLeft = 0;
          toCell.zombieTarget = null;
          fromCell.zombieId = null;
          fromCell.zombieStepsLeft = null;
          fromCell.zombieTarget = null;
          continue;
        }

        // Player survived - enter escape mode
        const zombieId = fromCell.zombieId;
        
        fromCell.zombieId = null;
        fromCell.zombieStepsLeft = null;
        fromCell.zombieTarget = null;

        this.deps.onPlayerAttacked(player.id, toCell.x, toCell.y, fromCell);

        const playerStillHere = this.board.getCell(toCell.x, toCell.y)?.hasPlayer;
        
        if (!playerStillHere) {
          toCell.zombieId = zombieId || `zombie-${Date.now()}`;
          toCell.zombieStepsLeft = 0;
          toCell.zombieTarget = null;
        } else {
          fromCell.zombieId = zombieId || `zombie-${Date.now()}`;
          fromCell.zombieStepsLeft = 0;
          fromCell.zombieTarget = null;
        }
        continue;
      }

      // === CHECK BAIT ===
      if (toCell.hasBait && toCell.structureOwner) {
        const baitOwner = toCell.structureOwner;
        this.deps.onBaitConsumed(baitOwner.id, toCell.x, toCell.y);
        this.deps.log(`Bait consumed at (${toCell.x},${toCell.y}) (owner: ${baitOwner.name})`);
        
        if (baitOwner.currCP > baitOwner.currNP) {
          baitOwner.addCPs(1);
        } else {
          baitOwner.addNPs(1);
        }
        toCell.clear();
        this.moveZombie(fromCell, toCell);
        zombiesMoved++;
        continue;
      }

      // === NORMAL MOVE ===
      this.moveZombie(fromCell, toCell);
      zombiesMoved++;
      
      // Record trail move
      const fromKey = `${fromCell.x},${fromCell.y}`;
      const toKey = `${toCell.x},${toCell.y}`;
      if (fromKey !== toKey) {
        this.zombieTrailMoves.push({ fromKey, toKey });
      }
    }

    // Check if any zombies still have moves
    anyMovesLeft = this.getZombieCells().some(z => z.zombieStepsLeft !== null && z.zombieStepsLeft > 0);
  }

  // Clear zombie steps after phase
  for (const cell of this.getZombieCells()) {
    cell.zombieStepsLeft = null;
  }

  // Spawn new zombies
  this.spawnZombies();

  // Cleanup baits
  this.clearBaits();
  this.awardFlexPoints();
  
  const totalZombies = this.getZombieCells().length;
  this.deps.log(`Night ended. Zombies: ${totalZombies}, Moved: ${zombiesMoved}, Killed: ${zombiesKilled}, Attacked: ${playersAttacked}`);

  return zombiesKilled + playersAttacked;
}
  private awardFlexPoints(): void {
    // For each trap on the board, check if it's adjacent to a player
    const traps = this.board.getAllTraps();
    const flexPointsEarned: Map<string, number> = new Map();

    for (const trap of traps) {
      if (!trap.structureOwner) continue;
      const ownerId = trap.structureOwner.id;
      
      // Check if any player is adjacent to this trap
      const neighbors = this.board.getNeighbors(trap);
      let adjacentPlayer = false;
      for (const neighbor of neighbors) {
        if (neighbor.hasPlayer) {
          adjacentPlayer = true;
          break;
        }
      }
      
      if (adjacentPlayer) {
        // Award flex point to trap owner
        if (!flexPointsEarned.has(ownerId)) {
          flexPointsEarned.set(ownerId, 0);
        }
        flexPointsEarned.set(ownerId, flexPointsEarned.get(ownerId)! + 1);
      }
    }

    // Apply flex points (convert to CP or NP based on which is higher)
    for (const [playerId, count] of flexPointsEarned) {
      const player = this.players.find(p => p.id === playerId);
      if (!player || player.isEliminated) continue;
      
      const flexPoints = count;
      if (player.currCP > player.currNP) {
        player.addCPs(flexPoints);
      }
      if (player.currNP >= player.currCP) {
        player.addNPs(flexPoints);
      }
      this.deps.log(`${player.name} earned ${flexPoints} flex point(s) for traps adjacent to players!`);
    }
  }

  private findTarget(zombie: BoardCell): { x: number; y: number; type: 'player' | 'bait' } | null {
    const players = this.players.filter(p => !p.isEliminated);
    const targets: { x: number; y: number; type: 'player' | 'bait' }[] = [];

    // Add players
    for (const player of players) {
      const pos = this.board.getPlayerPosition(player);
      if (pos) {
        targets.push({ x: pos.x, y: pos.y, type: 'player' });
      }
    }

    // Add baits
    for (const cell of this.board.getAllCells()) {
      if (cell.hasBait) {
        targets.push({ x: cell.x, y: cell.y, type: 'bait' });
      }
    }

    if (targets.length === 0) return null;

    // Find closest target (prefer players over bait)
    let closest = targets[0];
    let minDist = Math.abs(zombie.x - closest.x) + Math.abs(zombie.y - closest.y);

    for (const target of targets) {
      const dist = Math.abs(zombie.x - target.x) + Math.abs(zombie.y - target.y);
      // Prefer players over bait if distance is within 2
      const adjustedDist = target.type === 'player' ? dist - 1 : dist;
      if (adjustedDist < minDist) {
        minDist = adjustedDist;
        closest = target;
      }
    }

    return closest;
  }

  private moveZombie(from: BoardCell, to: BoardCell): void { 
    const stepsLeft = from.zombieStepsLeft;
    const zombieId = from.zombieId;
     
  from.zombieId = null;
  from.zombieTarget = null;
  from.zombieStepsLeft = null;
   
    to.zombieId = zombieId || `zombie-${Date.now()}`;
    to.zombieStepsLeft = stepsLeft;
    to.zombieTarget = null;
  }

  private getZombieCells(): BoardCell[] {
    return this.board.getAllCells().filter(c => c.hasZombie);
  }

  private spawnZombies(): void {
    const alivePlayers = this.players.filter(p => !p.isEliminated);
    const totalSP = alivePlayers.reduce((sum, p) => sum + p.currSP, 0);
    const spawnCount = Math.floor(totalSP / 15);

    const spawnCandidates = this.board.getAllCells().filter(c =>
      !c.isHole && c.isEmpty && !c.hasTrap && !c.hasBait && !c.hasBarricade
    );
    const cappedSpawn = Math.min(spawnCount, spawnCandidates.length);

    for (let i = 0; i < cappedSpawn; i++) {
      const result = ZombieSpawner.spawnRandom(this.board);
      if (result.success) {
        this.deps.log(`Spawned zombie at (${result.spawnedCells[0].x}, ${result.spawnedCells[0].y})`);
      }
    }

    if (cappedSpawn > 0) {
      this.deps.log(`Spawned ${cappedSpawn} zombies (total SP: ${totalSP})`);
    }
  }

  private clearBaits(): void {
    for (const cell of this.board.getAllCells()) {
      if (cell.hasBait) {
        cell.clear();
      }
    }
  }

  getZombieSpeed(generationCount: number): number {
    if (generationCount <= 3) return 1;
    if (generationCount <= 6) return 2;
    if (generationCount <= 9) return 3;
    return 4;
  }

  getZombieTrailHexKeys(): Set<string> {
    return this.zombieTrailHexKeys;
  }

  getZombieTrailMoves(): { fromKey: string; toKey: string }[] {
    return this.zombieTrailMoves;
  }
  /**
 * Kill a zombie at a specific cell
 */
killZombie(cell: BoardCell, killer: Player): { success: boolean; message: string } {
  if (!cell || !cell.hasZombie) {
    return { success: false, message: 'No zombie at target' };
  }
  
  // Clear the zombie
  cell.zombieId = null;
  cell.zombieStepsLeft = null;
  cell.zombieTarget = null;
  cell.clear();
  
  return { success: true, message: 'Zombie killed' };
}

/**
 * Remove a zombie (alias for killZombie)
 */
removeZombie(cell: BoardCell): { success: boolean; message: string } {
  if (!cell || !cell.hasZombie) {
    return { success: false, message: 'No zombie at target' };
  }
  
  cell.zombieId = null;
  cell.zombieStepsLeft = null;
  cell.zombieTarget = null;
  cell.clear();
  
  return { success: true, message: 'Zombie removed' };
}

/**
 * Get zombie move targets (for AI evaluation)
 */
getZombieMoveTargets(zombie: BoardCell): { x: number; y: number; type: string }[] {
  const targets: { x: number; y: number; type: string }[] = [];
  
  // Get adjacent cells
  const neighbors = this.board.getNeighbors(zombie);
  for (const neighbor of neighbors) {
    if (neighbor.hasPlayer) {
      targets.push({ x: neighbor.x, y: neighbor.y, type: 'player' });
    }
    if (neighbor.hasBait) {
      targets.push({ x: neighbor.x, y: neighbor.y, type: 'bait' });
    }
    if (neighbor.hasTrap) {
      targets.push({ x: neighbor.x, y: neighbor.y, type: 'trap' });
    }
    if (neighbor.hasBarricade) {
      targets.push({ x: neighbor.x, y: neighbor.y, type: 'barricade' });
    }
  }
  
  return targets;
}

/**
 * Spawn a zombie at a specific target cell
 */
spawnZombieAtTarget(cell: BoardCell): { success: boolean; message: string } {
  if (!cell) {
    return { success: false, message: 'Invalid cell' };
  }
  
  if (cell.isHole) {
    return { success: false, message: 'Cannot spawn zombie in a hole' };
  }
  
  if (cell.isOccupied) {
    return { success: false, message: 'Target cell is occupied' };
  }
  
  if (cell.hasTrap || cell.hasBait || cell.hasBarricade) {
    return { success: false, message: 'Target cell has trap, bait, or barricade' };
  }
  
  // Use ZombieSpawner to place the zombie
  const result = ZombieSpawner.spawnAtTarget(this.board, cell);
  return {
    success: result.success,
    message: result.message
  };
}

/**
 * Move a zombie one step to a target cell
 */
moveZombieOneStep(fromCell: BoardCell, toCell: BoardCell): { success: boolean; message: string } {
  if (!fromCell || !fromCell.hasZombie) {
    return { success: false, message: 'No zombie at source' };
  }
  
  if (!toCell || toCell.isHole) {
    return { success: false, message: 'Invalid target cell' };
  }
  
  if (toCell.isOccupied) {
    return { success: false, message: 'Target cell is occupied' };
  }
  
  // Check if target is adjacent
  const neighbors = this.board.getNeighbors(fromCell);
  if (!neighbors.includes(toCell)) {
    return { success: false, message: 'Target must be adjacent to zombie' };
  }
  
  // Move the zombie
  const zombieId = fromCell.zombieId;
  const stepsLeft = fromCell.zombieStepsLeft || 0;
  
  fromCell.zombieId = null;
  fromCell.zombieStepsLeft = null;
  fromCell.zombieTarget = null;
  
  toCell.zombieId = zombieId || `zombie-${Date.now()}`;
  toCell.zombieStepsLeft = stepsLeft;
  toCell.zombieTarget = null;
  
  return { success: true, message: `Zombie moved from (${fromCell.x},${fromCell.y}) to (${toCell.x},${toCell.y})` };
}
  getAllZombies(): BoardCell[] {
    return this.getZombieCells();
  }
}