// Board.ts
import { BoardCell, Player, MovementUtil } from '../index';

export const BLOCKED_BOARD_PAIRS: ReadonlySet<string> = new Set([
  '6,8|7,8',
  '1,7|1,8',
  '0,5|0,6',
  '1,5|1,6',
]);

export const WALL_OPENINGS: ReadonlySet<string> = new Set([
  '0,7|0,8',
  '7,9|8,9',
]);

export class Board {
  public readonly cells: BoardCell[][];

  constructor(cells: BoardCell[][], _vWalls?: any[], _hWalls?: any[]) {
    this.cells = cells;
  }

  getHWall(_x: number, _y: number): { isNatural: boolean; barricadeOwner: Player | null } | null {
    return null;
  }

  getVWall(_x: number, _y: number): { isNatural: boolean; barricadeOwner: Player | null } | null {
    return null;
  }

  getWallBetween(_x1: number, _y1: number, _x2: number, _y2: number): { isNatural: boolean; barricadeOwner: Player | null } | null {
    return null;
  }

  // ===== CELL ACCESS =====

  getCell(x: number, y: number): BoardCell | null {
    return this.cells[y]?.[x] || null;
  }

  getAllCells(): BoardCell[] {
    const result: BoardCell[] = [];
    for (const row of this.cells) {
      for (const cell of row) {
        if (cell) result.push(cell);
      }
    }
    return result;
  }

  getCellRoom(x: number, y: number): string | null {
    const cell = this.getCell(x, y);
    return cell ? cell.roomId : null;
  }

  getPlayerRoom(player: Player): string | null {
    const pos = this.getPlayerPosition(player);
    if (!pos) return null;
    return this.getCellRoom(pos.x, pos.y);
  }

  areInSameRoom(cellA: BoardCell, cellB: BoardCell): boolean {
    return this.normalizeRoomId(cellA.roomId) === this.normalizeRoomId(cellB.roomId);
  }

  isPlayerInRoom(player: Player, roomId: string): boolean {
    const room = this.getPlayerRoom(player);
    return room !== null && this.normalizeRoomId(room) === this.normalizeRoomId(roomId);
  }

  private normalizeRoomId(roomId: string): string {
    const raw = (roomId ?? '').toString().trim();
    if (!raw) return '';

    const aliases: Record<string, string> = {
      gymnasium: 'Gymnasium',
      gym: 'Gymnasium',
      hallway: 'Hallway',
      hallways: 'Hallway',
      lobby: 'Front Desk',
      'front desk': 'Front Desk',
      'front-desk': 'Front Desk',
      frontdesk: 'Front Desk',
      bathroom: 'Restroom',
      restroom: 'Restroom',
      restrooms: 'Restroom',
      closet: "Janitor's Closet",
      janitorcloset: "Janitor's Closet",
      janitorscloset: "Janitor's Closet",
      library: 'Library',
      cafeteria: 'Cafeteria',
      auditorium: 'Auditorium',
      office: "Principal's Office",
      principalsoffice: "Principal's Office",
      sciencelab: 'Science Lab',
      'science lab': 'Science Lab',
      'science-lab': 'Science Lab',
      tunnel: 'Tunnel',
    };

    const normalized = raw
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    return aliases[normalized] ?? raw;
  }

  getCellsInRoom(roomId: string): BoardCell[] {
    const target = this.normalizeRoomId(roomId);
    return this.getAllCells().filter(c => this.normalizeRoomId(c.roomId) === target);
  }

  // ===== NEIGHBOR CHECKS =====

  getNeighbors(cell: BoardCell): BoardCell[] {
    const neighbors: BoardCell[] = [];
    const { x, y } = cell;

    const checkNeighbor = (nx: number, ny: number) => {
      const neighbor = this.getCell(nx, ny);
      if (!neighbor) return;
      if (cell.isHole !== neighbor.isHole) return;

      const pairKey = `${Math.min(x, nx)},${Math.min(y, ny)}|${Math.max(x, nx)},${Math.max(y, ny)}`;
      if (BLOCKED_BOARD_PAIRS.has(pairKey)) return;

      neighbors.push(neighbor);
    };

    checkNeighbor(x, y - 1);
    checkNeighbor(x, y + 1);
    checkNeighbor(x - 1, y);
    checkNeighbor(x + 1, y);

    return neighbors;
  }
  getWalkableNeighbors(cell: BoardCell): BoardCell[] {
    return this.getNeighbors(cell).filter(neighbor => neighbor.isWalkable);
  }

  // ===== PLAYER OPERATIONS =====

  getPlayerPosition(player: Player): BoardCell | null {
    for (const cell of this.getAllCells()) {
      if (cell.hasPlayer && cell.structureOwner === player) return cell;
    }
    return null;
  }

  getPlayers(): Player[] {
    const players: Player[] = [];
    for (const cell of this.getAllCells()) {
      if (cell.hasPlayer && cell.structureOwner) {
        players.push(cell.structureOwner);
      }
    }
    return players;
  }

  getPlayerById(id: string): Player | null {
    for (const cell of this.getAllCells()) {
      if (cell.hasPlayer && cell.structureOwner?.id === id) {
        return cell.structureOwner;
      }
    }
    return null;
  }

  // ===== OCCUPANCY CHECKS =====

  isOccupied(x: number, y: number): boolean {
    const cell = this.getCell(x, y);
    return cell ? cell.isOccupied : true;
  }

  isEmpty(x: number, y: number): boolean {
    const cell = this.getCell(x, y);
    return cell ? cell.isEmpty : false;
  }

  // ===== GET ALL ENTITIES =====

  getAllTraps(): BoardCell[] {
    return this.getAllCells().filter(c => c.hasTrap);
  }

  getAllZombies(): BoardCell[] {
    return this.getAllCells().filter(c => c.hasZombie);
  }

  getAllBaits(): BoardCell[] {
    return this.getAllCells().filter(c => c.hasBait);
  }

  getAllBarricades(): BoardCell[] {
    return this.getAllCells().filter(c => c.hasBarricade);
  }

  getAllPlayers(): Player[] {
    return this.getAllCells()
      .filter(c => c.hasPlayer)
      .map(c => c.structureOwner!)
      .filter((p): p is Player => p !== null);
  }

  getAllPlayerStructures(owner: Player): BoardCell[] {
    return this.getAllCells().filter(c => 
      c.hasStructure && c.structureOwner === owner
    );
  }

  // ===== PATHFINDING =====
findShortestPathHuman(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    canJump: boolean = true
  ): BoardCell[] | null {
    const from = this.getCell(x1, y1);
    const to = this.getCell(x2, y2);
    if (!from || !to) return null;
    
    const result = MovementUtil.getPathForHumans(this, from, to, canJump);
    return result ? result.path : null;
  }

  getHumanDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    canJump: boolean = true
  ): { distance: number; jumps: number } {
    const from = this.getCell(x1, y1);
    const to = this.getCell(x2, y2);
    if (!from || !to) return { distance: -1, jumps: 0 };
    
    return MovementUtil.getDistanceForHumans(this, from, to, canJump);
  }
  /**
   * Shortest path for ZOMBIES - walks through traps, baits
   * Blocked by: holes, other zombies, players, barricades
   */
findShortestPathZombie(x1: number, y1: number, x2: number, y2: number): BoardCell[] | null {
  const start = this.getCell(x1, y1);
  const end = this.getCell(x2, y2);
  if (!start || !end || start.isHole || end.isHole) return null;
  if (start === end) return [start];

  const queue: { cell: BoardCell; path: BoardCell[] }[] = [{ cell: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(start.id);

  while (queue.length > 0) {
    const { cell, path } = queue.shift()!;
    
    for (const neighbor of this.getNeighbors(cell)) {
      // Only blocked by holes
      if (neighbor.isHole) continue;
      if (visited.has(neighbor.id)) continue;
      
      // Zombies can path through everything else (players, barricades, traps, bait, other zombies)
      // They will interact with whatever is on the cell when they try to step onto it
      
      const newPath = [...path, neighbor];
      if (neighbor === end) {
        return newPath;
      }
      
      visited.add(neighbor.id);
      queue.push({ cell: neighbor, path: newPath });
    }
  }
  
  return null;
}
placePlayer(player: Player, x: number, y: number): boolean {
  try {
    console.log(`[Board.placePlayer] Placing ${player.name} at (${x},${y})`);
    
    // First, remove player from any current position
    const currentPos = this.getPlayerPosition(player);
    if (currentPos) {
      console.log(`[Board.placePlayer] Removing from (${currentPos.x},${currentPos.y})`);
      currentPos.removePlayer();
    }
    
    // Then place at new position
    const cell = this.getCell(x, y);
    if (!cell) {
      console.log(`[Board.placePlayer] Cell (${x},${y}) not found`);
      return false;
    }
    if (cell.isHole) {
      console.log(`[Board.placePlayer] Cell (${x},${y}) is a hole`);
      return false;
    }
    if (!cell.isEmpty) {
      console.log(`[Board.placePlayer] Cell (${x},${y}) is not empty`);
      console.log(`  hasPlayer: ${cell.hasPlayer}`);
      console.log(`  hasZombie: ${cell.hasZombie}`);
      console.log(`  hasTrap: ${cell.hasTrap}`);
      console.log(`  hasBarricade: ${cell.hasBarricade}`);
      console.log(`  hasBait: ${cell.hasBait}`);
      return false;
    }
    
    cell.setPlayer(player);
    console.log(`[Board.placePlayer] Successfully placed ${player.name} at (${x},${y})`);
    return true;
  } catch (error) {
    console.error(`[Board.placePlayer] Error:`, error);
    return false;
  }
}
  

  /**
   * Get all cells within a radius (Manhattan distance)
   */
  getCellsInRadius(x: number, y: number, radius: number): BoardCell[] {
    const result: BoardCell[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const cell = this.getCell(x + dx, y + dy);
        if (cell) result.push(cell);
      }
    }
    return result;
  }

  // ===== CLONE =====

 clone(): Board {
  const newCells: BoardCell[][] = [];
  for (let y = 0; y < this.cells.length; y++) {
    newCells[y] = [];
    for (let x = 0; x < this.cells[y].length; x++) {
      const cell = this.cells[y][x];
      if (!cell) {
        newCells[y][x] = null as any;
        continue;
      }
      const newCell = new BoardCell(
        cell.id,
        cell.x,
        cell.y,
        cell.roomId,
        cell.spawnId,
        cell.isHole
      );
      
      // Copy primitive values (not references)
      newCell.zombieId = cell.zombieId ? String(cell.zombieId) : null;
      newCell.zombieStepsLeft = cell.zombieStepsLeft;
      newCell.zombieTarget = null;
      
      // Copy structure type (primitive)
      newCell.structureType = cell.structureType;
      
      // IMPORTANT: Don't copy structureOwner reference
      // This will be set by the evaluator
      newCell.structureOwner = null;
      
      // Copy structure data as a shallow copy
      newCell.structureData = cell.structureData ? { ...cell.structureData } : {};
      
      newCells[y][x] = newCell;
    }
  }
  return new Board(newCells);
}

  // ===== VALIDATION =====

  validate(): boolean {
    for (const cell of this.getAllCells()) {
      // Each cell should have valid state
      if (cell.isHole && cell.hasStructure) return false;
      if (cell.hasPlayer && !cell.structureOwner) return false;
      if (cell.hasZombie && !cell.zombieId) return false;
      if (cell.hasStructure && !cell.structureOwner) return false;
      if (cell.hasTrap && cell.structureType !== 'trap') return false;
      if (cell.hasBait && cell.structureType !== 'bait') return false;
      if (cell.hasBarricade && cell.structureType !== 'barricade') return false;
    }
    return true;
  }
}