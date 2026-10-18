
import { Board , BoardCell ,Player ,HeroId , ZombieSpawner } from '../index';

export interface ZombieManagerDeps {
  onBarricadeHeld: (ownerId: string, x: number, y: number, flexPoints: number) => void;
  onBarricadeBroken: (ownerId: string, x: number, y: number) => void;
  onTrapKill: (ownerId: string, x: number, y: number) => void;
  onTrapFailed: () => void;
  onBaitConsumed: (ownerId: string, x: number, y: number) => void;
  onTrapFlexAwarded?: (ownerId: string, flexPoints: number) => void;
  onPlayerEscape: (playerId: string) => void;
  onPlayerAttacked: (playerId: string, x: number, y: number, fromCell: BoardCell) => void; // ← ADD fromCell
  waitForEscape?: () => Promise<void>;
  getTrapSuccessRate: (player: Player) => number;
  getBarricadeSuccessRate: (player: Player) => number;
  onZombieKilled?: (killerId: string, x: number, y: number, cell: BoardCell) => void;
  getBaitRange: (player: Player) => number;
  log: (msg: string) => void;
  onBarricadePlaced?: (ownerId: string, x: number, y: number) => void;
  onTrapPlaced?: (ownerId: string, x: number, y: number) => void;
}

export class ZombieManager {
  private zombieTrailHexKeys: Set<string> = new Set();
  private zombieTrailMoves: { fromKey: string; toKey: string }[] = [];

  constructor(
    private readonly board: Board,
    private readonly players: Player[],
    private readonly deps: ZombieManagerDeps
  ) {}

  // ===== ZOMBIE PHASE =====

  zombiePhase(
    generationCount: number,
    options: { stepDelayMs?: number; async?: boolean; onComplete?: () => void } = {}
  ): void {
    const resolvedOptions = {
      stepDelayMs: 120,
      async: false,
      ...options,
    };

    const complete = () => {
      resolvedOptions.onComplete?.();
    };

    if (resolvedOptions.async && typeof setTimeout === 'function') {
      void this.zombiePhaseSequence(generationCount, resolvedOptions.stepDelayMs ?? 120).then(complete);
      return;
    }

    this.zombiePhaseSequenceSync(generationCount, resolvedOptions.stepDelayMs ?? 120);
    complete();
  }

  private async zombiePhaseSequence(generationCount: number, stepDelayMs: number): Promise<void> {
    const speed = this.getZombieSpeed(generationCount);
    this.zombieTrailHexKeys.clear();
    this.zombieTrailMoves = [];

    const zombies = this.getZombieCells();
    for (const cell of zombies) {
      cell.zombieStepsLeft = speed;
    }

    let round = 0;
    const maxRounds = 500;
    while (this.getZombieCells().some(z => z.zombieStepsLeft !== null && z.zombieStepsLeft > 0) && round < maxRounds) {
      const turnOrder = this.getZombieTurnOrder();
      if (turnOrder.length === 0) break;

      round++;
      for (const zombie of turnOrder) {
        if (!zombie || !zombie.hasZombie) continue;
        if (!zombie.zombieStepsLeft || zombie.zombieStepsLeft <= 0) continue;

        await new Promise<void>((resolve) => setTimeout(resolve, stepDelayMs));
        this.zombieTrailHexKeys.add(`${zombie.x},${zombie.y}`);
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

        const fromCell = zombie;
        const toCell = path[1];

        if (toCell.hasZombie && toCell !== fromCell) {
          zombie.zombieStepsLeft = 0;
          continue;
        }

        const stepStarted = zombie.zombieStepsLeft ?? 0;
        zombie.zombieStepsLeft = Math.max(0, stepStarted - 1);

        if (toCell.hasBarricade && toCell.structureOwner) {
          const owner = toCell.structureOwner;
          const barricadeSuccessRate = this.deps.getBarricadeSuccessRate(owner);
          const breakProbability = Math.max(0, 1 - barricadeSuccessRate);
          const attempts = Math.max(1, stepStarted);
          let broke = false;
          let attemptsUsed = 0;

          for (let attempt = 1; attempt <= attempts; attempt++) {
            if (Math.random() < breakProbability) {
              broke = true;
              attemptsUsed = attempt;
              break;
            }
          }

          if (broke) {
            const flexPoints = Math.max(0, attemptsUsed - 1);
            if (flexPoints > 0) {
              this.deps.onBarricadeHeld(owner.id, toCell.x, toCell.y, flexPoints);
              this.deps.log(`Barricade held for ${flexPoints} attempt(s) before breaking! (${owner.name}'s barricade) - gained ${flexPoints} flex point(s)`);
            }
            this.deps.onBarricadeBroken(owner.id, toCell.x, toCell.y);
            this.deps.log(`Barricade broke on attempt ${attemptsUsed}! (${owner.name}'s barricade)`);
            toCell.removeStructure();
            this.moveZombie(fromCell, toCell);
            zombie.zombieStepsLeft = 0;
            continue;
          }

          this.deps.onBarricadeHeld(owner.id, toCell.x, toCell.y, attempts);
          this.deps.log(`Barricade held for all ${attempts} attempts! (${owner.name}'s barricade) - gained ${attempts} flex point(s)`);
          zombie.zombieStepsLeft = 0;
          continue;
        }

        if (toCell.hasTrap && toCell.trapOwner) {
          const trapOwner = toCell.trapOwner;
          const successRate = this.deps.getTrapSuccessRate(trapOwner);
          if (Math.random() < successRate) {
            this.deps.onTrapKill(trapOwner.id, toCell.x, toCell.y);
            zombie.zombieId = null;
            zombie.zombieStepsLeft = null;
            zombie.zombieTarget = null;
            zombie.occupantType = 'empty';
            toCell.clear();
            zombie.zombieStepsLeft = 0;
            continue;
          }

          this.deps.onTrapFailed();
          this.deps.log('Trap failed to activate.');
        }

        if (toCell.hasPlayer) {
          const player = toCell.player;
          if (!player) {
            this.moveZombie(fromCell, toCell);
            continue;
          }

          const beforeHealth = player.currHealth;
          player.loseHealths(1);
          const afterHealth = player.currHealth;
          this.deps.log(`${player.name} was attacked at (${toCell.x},${toCell.y})! Health: ${beforeHealth} -> ${afterHealth}`);

          if (afterHealth <= 0 || player.isEliminated) {
            player.isEliminated = true;
            this.deps.log(`💀 ${player.name} was eliminated!`);
            toCell.removePlayer();
            toCell.occupantType = 'zombie';
            toCell.zombieId = `zombie-${Date.now()}`;
            toCell.zombieStepsLeft = 0;
            toCell.zombieTarget = null;
            fromCell.zombieId = null;
            fromCell.zombieStepsLeft = null;
            fromCell.zombieTarget = null;
            zombie.zombieStepsLeft = 0;
            continue;
          }

          fromCell.occupantType = 'empty';
          fromCell.zombieId = null;
          fromCell.zombieStepsLeft = null;
          fromCell.zombieTarget = null;

          toCell.occupantType = 'zombie';
          toCell.zombieId = toCell.zombieId || `zombie-${Date.now()}`;
          toCell.zombieStepsLeft = 0;
          toCell.zombieTarget = null;

          this.deps.onPlayerAttacked(player.id, toCell.x, toCell.y, fromCell);
          await this.deps.waitForEscape?.();
          zombie.zombieStepsLeft = 0;
          continue;
        }

        if (toCell.hasBait && toCell.structureOwner) {
          const baitOwner = toCell.structureOwner;
          this.deps.onBaitConsumed(baitOwner.id, toCell.x, toCell.y);
          this.deps.log(`Bait consumed at (${toCell.x},${toCell.y}) (owner: ${baitOwner.name})`);
          toCell.clear();
          this.moveZombie(fromCell, toCell);
          zombie.zombieStepsLeft = 0;
          continue;
        }

        this.moveZombie(fromCell, toCell);
        const fromKey = `${fromCell.x},${fromCell.y}`;
        const toKey = `${toCell.x},${toCell.y}`;
        if (fromKey !== toKey) {
          this.zombieTrailMoves.push({ fromKey, toKey });
        }
      }
    }

    for (const cell of this.getZombieCells()) {
      cell.zombieStepsLeft = null;
    }

    this.spawnZombies();
    this.clearBaits();
    this.awardFlexPoints();
    this.deps.log('Night ended: Baits removed.');
  }

  private zombiePhaseSequenceSync(generationCount: number, stepDelayMs: number): void {
    const speed = this.getZombieSpeed(generationCount);
    this.zombieTrailHexKeys.clear();
    this.zombieTrailMoves = [];

    const zombies = this.getZombieCells();
    for (const cell of zombies) {
      cell.zombieStepsLeft = speed;
    }

    let round = 0;
    const maxRounds = 500;
    while (this.getZombieCells().some(z => z.zombieStepsLeft !== null && z.zombieStepsLeft > 0) && round < maxRounds) {
      const turnOrder = this.getZombieTurnOrder();
      if (turnOrder.length === 0) break;

      round++;
      for (const zombie of turnOrder) {
        if (!zombie || !zombie.hasZombie) continue;
        if (!zombie.zombieStepsLeft || zombie.zombieStepsLeft <= 0) continue;

        this.zombieTrailHexKeys.add(`${zombie.x},${zombie.y}`);
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

        const fromCell = zombie;
        const toCell = path[1];

        if (toCell.hasZombie && toCell !== fromCell) {
          zombie.zombieStepsLeft = 0;
          continue;
        }

        const stepStarted = zombie.zombieStepsLeft ?? 0;
        zombie.zombieStepsLeft = Math.max(0, stepStarted - 1);

        if (toCell.hasBarricade && toCell.structureOwner) {
          const owner = toCell.structureOwner;
          const barricadeSuccessRate = this.deps.getBarricadeSuccessRate(owner);
          const breakProbability = Math.max(0, 1 - barricadeSuccessRate);
          const attempts = Math.max(1, stepStarted);
          let broke = false;
          let attemptsUsed = 0;

          for (let attempt = 1; attempt <= attempts; attempt++) {
            if (Math.random() < breakProbability) {
              broke = true;
              attemptsUsed = attempt;
              break;
            }
          }

          if (broke) {
            const flexPoints = Math.max(0, attemptsUsed - 1);
            if (flexPoints > 0) {
              this.deps.onBarricadeHeld(owner.id, toCell.x, toCell.y, flexPoints);
              this.deps.log(`Barricade held for ${flexPoints} attempt(s) before breaking! (${owner.name}'s barricade) - gained ${flexPoints} flex point(s)`);
            }
            this.deps.onBarricadeBroken(owner.id, toCell.x, toCell.y);
            this.deps.log(`Barricade broke on attempt ${attemptsUsed}! (${owner.name}'s barricade)`);
            toCell.removeStructure();
            this.moveZombie(fromCell, toCell);
            zombie.zombieStepsLeft = 0;
            continue;
          }

          this.deps.onBarricadeHeld(owner.id, toCell.x, toCell.y, attempts);
          this.deps.log(`Barricade held for all ${attempts} attempts! (${owner.name}'s barricade) - gained ${attempts} flex point(s)`);
          zombie.zombieStepsLeft = 0;
          continue;
        }

        if (toCell.hasTrap && toCell.trapOwner) {
          const trapOwner = toCell.trapOwner;
          const successRate = this.deps.getTrapSuccessRate(trapOwner);
          if (Math.random() < successRate) {
            this.deps.onTrapKill(trapOwner.id, toCell.x, toCell.y);
            zombie.zombieId = null;
            zombie.zombieStepsLeft = null;
            zombie.zombieTarget = null;
            zombie.occupantType = 'empty';
            toCell.clear();
            zombie.zombieStepsLeft = 0;
            continue;
          }

          this.deps.onTrapFailed();
          this.deps.log('Trap failed to activate.');
        }

        if (toCell.hasPlayer) {
          const player = toCell.player;
          if (!player) {
            this.moveZombie(fromCell, toCell);
            continue;
          }

          const beforeHealth = player.currHealth;
          player.loseHealths(1);
          const afterHealth = player.currHealth;
          this.deps.log(`${player.name} was attacked at (${toCell.x},${toCell.y})! Health: ${beforeHealth} -> ${afterHealth}`);

          if (afterHealth <= 0 || player.isEliminated) {
            player.isEliminated = true;
            this.deps.log(`💀 ${player.name} was eliminated!`);
            toCell.removePlayer();
            toCell.occupantType = 'zombie';
            toCell.zombieId = `zombie-${Date.now()}`;
            toCell.zombieStepsLeft = 0;
            toCell.zombieTarget = null;
            fromCell.zombieId = null;
            fromCell.zombieStepsLeft = null;
            fromCell.zombieTarget = null;
            zombie.zombieStepsLeft = 0;
            continue;
          }

          fromCell.occupantType = 'empty';
          fromCell.zombieId = null;
          fromCell.zombieStepsLeft = null;
          fromCell.zombieTarget = null;

          toCell.occupantType = 'zombie';
          toCell.zombieId = toCell.zombieId || `zombie-${Date.now()}`;
          toCell.zombieStepsLeft = 0;
          toCell.zombieTarget = null;

          this.deps.onPlayerAttacked(player.id, toCell.x, toCell.y, fromCell);
          zombie.zombieStepsLeft = 0;
          continue;
        }

        if (toCell.hasBait && toCell.structureOwner) {
          const baitOwner = toCell.structureOwner;
          this.deps.onBaitConsumed(baitOwner.id, toCell.x, toCell.y);
          this.deps.log(`Bait consumed at (${toCell.x},${toCell.y}) (owner: ${baitOwner.name})`);
          toCell.clear();
          this.moveZombie(fromCell, toCell);
          zombie.zombieStepsLeft = 0;
          continue;
        }

        this.moveZombie(fromCell, toCell);
        const fromKey = `${fromCell.x},${fromCell.y}`;
        const toKey = `${toCell.x},${toCell.y}`;
        if (fromKey !== toKey) {
          this.zombieTrailMoves.push({ fromKey, toKey });
        }
      }
    }

    for (const cell of this.getZombieCells()) {
      cell.zombieStepsLeft = null;
    }

    this.spawnZombies();
    this.clearBaits();
    this.awardFlexPoints();
    this.deps.log('Night ended: Baits removed.');
  }

  getZombieTurnOrder(): BoardCell[] {
    return this.getZombieCells()
      .filter(z => z && z.hasZombie && z.zombieStepsLeft !== null && z.zombieStepsLeft > 0)
      .map(zombie => {
        const target = this.findTarget(zombie);
        const targetCell = target ? this.board.getCell(target.x, target.y) ?? null : null;
        return {
          zombie,
          distance: targetCell ? Math.abs(zombie.x - targetCell.x) + Math.abs(zombie.y - targetCell.y) : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.distance - b.distance || a.zombie.x - b.zombie.x || a.zombie.y - b.zombie.y)
      .map(({ zombie }) => zombie);
  }

  // ===== FIND TARGET =====

  private findTarget(zombie: BoardCell): {x: number, y: number, type: 'player' | 'bait'} | null {
    const players = this.players.filter(p => !p.isEliminated);
    const targets: {x: number, y: number, type: 'player' | 'bait'}[] = [];

    // Add players
    for (const player of players) {
      const pos = this.board.getPlayerPosition(player);
      if (pos) {
        targets.push({x: pos.x, y: pos.y, type: 'player'});
      }
    }

    // Only consider bait that is within the bait owner's effective radius of the zombie.
    for (const cell of this.board.getAllCells()) {
      if (!cell.hasBait || !cell.structureOwner) continue;
      const owner = cell.structureOwner;
      const baitRadius = owner.getBaitRadius ? owner.getBaitRadius() : 3;
      const distToZombie = Math.abs(zombie.x - cell.x) + Math.abs(zombie.y - cell.y);
      if (distToZombie <= baitRadius) {
        targets.push({x: cell.x, y: cell.y, type: 'bait'});
      }
    }

    if (targets.length === 0) return null;

    // Find closest target
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

  // ===== ZOMBIE MOVEMENT =====

  private moveZombie(from: BoardCell, to: BoardCell): void {
    // Preserve the remaining step budget before clearing the source tile.
    // If we clear the source first, the remaining steps are lost and the zombie
    // stops after a single move even when it should continue toward its target.
    const stepsLeft = from.zombieStepsLeft ?? 0;

    from.occupantType = 'empty';
    from.zombieId = null;
    from.zombieTarget = null;
    from.zombieStepsLeft = null;

    if (to.hasPlayer) {
      to.removePlayer();
    }
    // Zombies must not remain co-occupied with barricades, traps, or bait. These are
    // explicitly resolved before movement, but if a stale state still reaches this method,
    // the structure must be cleared rather than leaving both occupants on the same tile.
    if (to.hasStructure) {
      to.removeStructure();
    }

    to.occupantType = 'zombie';
    to.zombieId = `zombie-${Date.now()}`;
    to.zombieStepsLeft = stepsLeft;
    to.zombieTarget = null;
  }

  // ===== GET ZOMBIE CELLS =====

  private getZombieCells(): BoardCell[] {
    return this.board.getAllCells().filter(c => c.hasZombie);
  }

  // ===== SPAWN ZOMBIES =====

  private spawnZombies(): void {
  const spawnCandidates = this.board.getAllCells().filter(c => 
    !c.isHole && c.isEmpty && c.spawnId !== 'z' && c.spawnId !== ''
  );

  // Calculate spawn count based on total SP of alive players / 15
  const alivePlayers = this.players.filter(p => !p.isEliminated);
  const totalSP = alivePlayers.reduce((sum, p) => sum + p.currSP, 0);
  const spawnCount = Math.floor(totalSP / 15);
  const cappedSpawn = Math.min(spawnCount, spawnCandidates.length);

  console.log(`[ZombieManager] Spawning ${cappedSpawn} zombies (total SP: ${totalSP}, candidates: ${spawnCandidates.length})`);

  for (let i = 0; i < cappedSpawn; i++) {
    const result = ZombieSpawner.spawnRandom(this.board);
    if (result.success) {
      this.deps.log(`Spawned zombie at (${result.spawnedCells[0].x}, ${result.spawnedCells[0].y})`);
    } else {
      this.deps.log(`Failed to spawn zombie: ${result.message}`);
    }
  }
}

/**
   * Kill a zombie - triggers all kill-related events
   * Use this for cards like Homerun Bat, Time Out, etc.
   */
  killZombie(cell: BoardCell, killer: Player): { success: boolean; message: string } {
    if (!cell || !cell.hasZombie) {
      return { success: false, message: 'No zombie at target' };
    }
    
    const x = cell.x;
    const y = cell.y;
    
    // Clear the zombie
    cell.clear();
     for (const player of this.players) {
    if (player.dogTagsActive && !player.isEliminated) {
      player.addGold(2);
      this.deps.log(`${player.name} gained 2 gold from Dog Tags!`);
    }
  }
     if (killer.heroId === HeroId.BROCK_SLAYTON) {
    killer.addCPs(1);
    killer.addNPs(1);
    this.deps.log(`${killer.name} gained 1 extra CP and NP from Brock Slayton's passive!`);}
    // Emit kill event
    if (this.deps.onZombieKilled) {
      this.deps.onZombieKilled(killer.id, x, y, cell);
    }
    
    return { success: true, message: `Zombie killed at (${x}, ${y})` };
  }

  /**
   * Remove a zombie - does NOT trigger kill events
   * Use this for cards like Nice Removal, Ambushed (if it removes), etc.
   */
  removeZombie(cell: BoardCell): { success: boolean; message: string } {
    if (!cell || !cell.hasZombie) {
      return { success: false, message: 'No zombie at target' };
    }
    
    const x = cell.x;
    const y = cell.y;
    
    cell.clear();
    
    return { success: true, message: `Zombie removed at (${x}, ${y})` };
  }


  // ===== NIGHT END FLEX POINTS =====

  private awardFlexPoints(): void {
    const traps = this.board.getAllTraps();
    const flexPointsEarned: Map<string, number> = new Map();

    for (const trap of traps) {
      if (!trap.structureOwner) continue;
      const ownerId = trap.structureOwner.id;

      const neighbors = this.board.getNeighbors(trap);
      const adjacentPlayer = neighbors.some(neighbor => neighbor.hasPlayer);
      if (!adjacentPlayer) continue;

      flexPointsEarned.set(ownerId, (flexPointsEarned.get(ownerId) ?? 0) + 1);
    }

    for (const [playerId, count] of flexPointsEarned) {
      const player = this.players.find(p => p.id === playerId);
      if (!player || player.isEliminated) continue;

      const flexPoints = count;
      if (this.deps.onTrapFlexAwarded) {
        this.deps.onTrapFlexAwarded(playerId, flexPoints);
        continue;
      }

      this.deps.log(`${player.name} earned ${flexPoints} flex point(s) for traps adjacent to players!`);
    }
  }

  // ===== BAIT CLEANUP =====

  private clearBaits(): void {
    for (const cell of this.board.getAllCells()) {
      if (cell.hasBait) {
        cell.clear();
      }
    }
  }

  // ===== GETTERS =====

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
   * Move a zombie one step to an adjacent empty cell
   * Used by cards like Hypnotism, Missing Hallpass
   */
  moveZombieOneStep(zombie: BoardCell, targetCell: BoardCell): { success: boolean; message: string } {
    if (!zombie || !zombie.hasZombie) {
      return { success: false, message: 'No zombie at source' };
    }
    
    if (!targetCell || !targetCell.isEmpty || targetCell.isHole) {
      return { success: false, message: 'Target cell is not empty' };
    }
    
    const neighbors = this.board.getNeighbors(zombie);
    if (!neighbors.includes(targetCell)) {
      return { success: false, message: 'Target is not adjacent' };
    }
    
    // Check for natural wall
    const wall = this.board.getWallBetween(zombie.x, zombie.y, targetCell.x, targetCell.y);
    if (wall && wall.isNatural) {
      return { success: false, message: 'Natural wall blocks movement' };
    }
    
    // Move zombie
    zombie.occupantType = 'empty';
    zombie.zombieId = null;
    zombie.zombieStepsLeft = null;
    zombie.zombieTarget = null;
    
    targetCell.occupantType = 'zombie';
    targetCell.zombieId = `zombie-${Date.now()}`;
    targetCell.zombieStepsLeft = 0;
    targetCell.zombieTarget = null;
    
    return { success: true, message: `Zombie moved to (${targetCell.x},${targetCell.y})` };
  }

  /**
   * Get all valid move targets for a zombie (adjacent empty cells)
   * Used for UI targeting
   */
  getZombieMoveTargets(zombie: BoardCell): BoardCell[] {
    if (!zombie || !zombie.hasZombie) return [];
    return this.board.getNeighbors(zombie).filter(c => c.isEmpty && !c.isHole);
  }

  /**
   * Spawn a zombie at a specific target cell
   * Used by cards like Hole in the Ceiling, One vs One
   */
  spawnZombieAtTarget(target: BoardCell): { success: boolean; message: string } {
    if (!target || target.isHole) {
      return { success: false, message: 'Invalid target' };
    }
    
    if (target.isOccupied) {
      return { success: false, message: 'Target cell is occupied' };
    }
    
    if (target.hasTrap || target.hasBait) {
      return { success: false, message: 'Target cell has trap or bait' };
    }
    
    target.occupantType = 'zombie';
    target.zombieId = `zombie-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    target.zombieStepsLeft = 0;
    target.zombieTarget = null;
    
    return { success: true, message: `Zombie spawned at (${target.x},${target.y})` };
  }

  /**
   * Spawn a zombie in a specific room using the lowest open tile
   * Used for random spawning
   */
  spawnZombieInRoom(roomId: string): { success: boolean; message: string } {
    const cells = this.board.getCellsInRoom(roomId)
      .filter(c => 
        !c.isHole && 
        c.isEmpty && 
        !c.hasTrap && 
        !c.hasBait &&
        !c.hasPlayer &&
        !c.hasZombie
      )
      .sort((a, b) => {
        const aVal = a.spawnId === 'z' ? 999 : parseInt(a.spawnId);
        const bVal = b.spawnId === 'z' ? 999 : parseInt(b.spawnId);
        return aVal - bVal;
      });
    
    if (cells.length === 0) {
      return { success: false, message: `No open tiles in ${roomId}` };
    }
    
    return this.spawnZombieAtTarget(cells[0]);
  }

  /**
   * Spawn a zombie in a random room based on a 20-sided die roll
   * Used for random spawning
   */
  spawnZombieRandom(roll?: number): { success: boolean; message: string } {
    const roomRolls = [
      { min: 1, max: 5, room: 'Gymnasium' },
      { min: 6, max: 7, room: 'Front Desk' },
      { min: 8, max: 8, room: 'Restroom' },
      { min: 9, max: 9, room: "Janitor's Closet" },
      { min: 10, max: 11, room: 'Library' },
      { min: 12, max: 13, room: 'Cafeteria' },
      { min: 14, max: 15, room: 'Auditorium' },
      { min: 16, max: 17, room: "Principal's Office" },
      { min: 18, max: 20, room: 'Science Lab' },
    ];

    const attempts = 20;
    const triedRooms = new Set<string>();
    let currentRoll = roll ?? Math.floor(Math.random() * 20) + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const entry = roomRolls.find(r => currentRoll >= r.min && currentRoll <= r.max);
      if (!entry || triedRooms.has(entry.room)) {
        currentRoll = Math.floor(Math.random() * 20) + 1;
        continue;
      }
      
      triedRooms.add(entry.room);
      const result = this.spawnZombieInRoom(entry.room);
      if (result.success) {
        return result;
      }
      
      currentRoll = Math.floor(Math.random() * 20) + 1;
    }

    // Fallback: check all rooms
    for (const entry of roomRolls) {
      const result = this.spawnZombieInRoom(entry.room);
      if (result.success) {
        return result;
      }
    }

    return { success: false, message: 'No open tiles in any room' };
  }

  /**
   * Spawn multiple zombies (used by Ambushed)
   */
  spawnMultipleZombies(count: number, firstTarget?: BoardCell): { success: boolean; message: string; spawned: BoardCell[] } {
    const spawned: BoardCell[] = [];
    const errors: string[] = [];

    // Spawn first zombie at target if provided
    if (firstTarget) {
      const result = this.spawnZombieAtTarget(firstTarget);
      if (result.success) {
        spawned.push(firstTarget);
      } else {
        errors.push(`First zombie: ${result.message}`);
      }
    }

    // Spawn remaining zombies
    for (let i = spawned.length; i < count; i++) {
      const result = this.spawnZombieRandom();
      if (result.success) {
        // Find the spawned zombie cell
        const zombieCells = this.getZombieCells();
        const newZombie = zombieCells.find(c => c.zombieId && !spawned.includes(c));
        if (newZombie) {
          spawned.push(newZombie);
        }
      } else {
        errors.push(result.message);
      }
    }

    return {
      success: spawned.length > 0,
      message: errors.length > 0 ? errors.join('; ') : `Spawned ${spawned.length} zombies`,
      spawned
    };
  }

  /**
   * Get all zombies on the board
   */
  getAllZombies(): BoardCell[] {
    return this.getZombieCells();
  }

  /**
   * Get zombies in a specific room
   */
  getZombiesInRoom(roomId: string): BoardCell[] {
    return this.board.getCellsInRoom(roomId).filter(c => c.hasZombie);
  }
}