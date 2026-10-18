// src/game/misc/ZombieSpawner.ts - Updated with new structure-based system

import { Board, BoardCell } from '../index';

export interface SpawnResult {
  success: boolean;
  message: string;
  spawnedCells: BoardCell[];
}

export class ZombieSpawner {

  private static ROOM_ROLLS: { min: number; max: number; roomId: string }[] = [
    { min: 1, max: 5, roomId: 'Gym' },
    { min: 6, max: 7, roomId: 'Front Desk' },
    { min: 8, max: 8, roomId: 'Bathroom' },
    { min: 9, max: 9, roomId: 'Closet' },
    { min: 10, max: 11, roomId: 'Library' },
    { min: 12, max: 13, roomId: 'Cafeteria' },
    { min: 14, max: 15, roomId: 'Auditorium' },
    { min: 16, max: 17, roomId: 'Office' },
    { min: 18, max: 20, roomId: 'Science Lab' },
  ];

  private static normalizeRoomId(roomId: string): string {
    const canonical = roomId.toLowerCase().trim();
    const map: Record<string, string> = {
      gymnasium: 'Gym',
      gym: 'Gym',
      lobby: 'Front Desk',
      'front desk': 'Front Desk',
      'front-desk': 'Front Desk',
      frontdesk: 'Front Desk',
      bathroom: 'Bathroom',
      restroom: 'Bathroom',
      restrooms: 'Bathroom',
      closet: 'Closet',
      janitorscloset: 'Closet',
      'janitors-closet': 'Closet',
      library: 'Library',
      cafeteria: 'Cafeteria',
      cafetaria: 'Cafeteria',
      auditorium: 'Auditorium',
      office: 'Office',
      principalsoffice: 'Office',
      'principals-office': 'Office',
      'science-lab': 'Science Lab',
      sciencelab: 'Science Lab',
      'science lab': 'Science Lab',
    };
    return map[canonical] ?? roomId;
  }

  static spawnRandom(board: Board, roll?: number): SpawnResult {
    const attempts = 20;
    const triedRooms = new Set<string>();
 
    const allRooms = this.getAllRoomIds(); 
    for (const roomId of allRooms) {
      const cells = board.getCellsInRoom(roomId);
      const openCells = cells.filter(c =>
        !c.isHole &&
        c.isEmpty &&
        !c.hasTrap &&
        !c.hasBait &&
        !c.hasBarricade &&
        !c.hasPlayer &&
        !c.hasZombie
      ); 
    }

    for (let attempt = 0; attempt < attempts; attempt++) {
      const currentRoll = roll ?? Math.floor(Math.random() * 20) + 1;
      const roomId = this.getRoomFromRoll(currentRoll);

      if (!roomId || triedRooms.has(roomId)) {
        roll = Math.floor(Math.random() * 20) + 1;
        continue;
      }

      triedRooms.add(roomId); 

      const spawnCell = this.findLowestOpenTileInRoom(board, roomId);
      if (spawnCell) { 
        return this.spawnAtTarget(board, spawnCell);
      }
 
      roll = Math.floor(Math.random() * 20) + 1;
    }

    // Fallback: Check all rooms
    console.log('[ZombieSpawner] All rooms full, checking fallback...');
    for (const roomId of this.getAllRoomIds()) {
      const spawnCell = this.findLowestOpenTileInRoom(board, roomId);
      if (spawnCell) {
        console.log(`[ZombieSpawner] Fallback: Found cell in ${roomId} at (${spawnCell.x}, ${spawnCell.y})`);
        return this.spawnAtTarget(board, spawnCell);
      }
    }

    // Ultimate fallback: find ANY empty cell
    console.log('[ZombieSpawner] No rooms have open cells, trying any empty cell...');
    const anyEmpty = board.getAllCells().filter(c =>
      c.isEmpty && !c.isHole && !c.hasTrap && !c.hasBait && !c.hasBarricade
    );
    console.log(`[ZombieSpawner] Found ${anyEmpty.length} empty cells total`);
    if (anyEmpty.length > 0) {
      const cell = anyEmpty[Math.floor(Math.random() * anyEmpty.length)];
      console.log(`[ZombieSpawner] Ultimate fallback: Spawning at (${cell.x}, ${cell.y})`);
      return this.spawnAtTarget(board, cell);
    }

    return { success: false, message: 'No open cells available', spawnedCells: [] };
  }

  static spawnInRoom(board: Board, roomId: string): SpawnResult {
    const spawnCell = this.findLowestOpenTileInRoom(board, roomId);
    if (!spawnCell) {
      return { success: false, message: `No open tiles in ${roomId}`, spawnedCells: [] };
    }
    return this.spawnAtTarget(board, spawnCell);
  }

  static spawnAtTarget(board: Board, target: BoardCell): SpawnResult {
    if (!target) {
      return { success: false, message: 'No target provided', spawnedCells: [] };
    }

    if (target.isHole) {
      return { success: false, message: 'Cannot spawn zombie in a hole', spawnedCells: [] };
    }

    if (target.isOccupied) {
      return { success: false, message: 'Target cell is occupied', spawnedCells: [] };
    }

    if (target.hasTrap || target.hasBait || target.hasBarricade) {
      return { success: false, message: 'Target cell has trap, bait, or barricade', spawnedCells: [] };
    }

    // Set zombie data directly (no occupantType needed)
    target.zombieId = `zombie-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    target.zombieStepsLeft = 0;
    target.zombieTarget = null;

    return {
      success: true,
      message: `Zombie spawned at (${target.x}, ${target.y})`,
      spawnedCells: [target]
    };
  }

  static spawnMultipleRandom(board: Board, count: number): SpawnResult {
    const spawned: BoardCell[] = [];
    const errors: string[] = [];

    for (let i = 0; i < count; i++) {
      const result = this.spawnRandom(board);
      if (result.success) {
        spawned.push(...result.spawnedCells);
      } else {
        errors.push(result.message);
      }
    }

    return {
      success: spawned.length > 0,
      message: errors.length > 0 ? errors.join('; ') : `Spawned ${spawned.length} zombies`,
      spawnedCells: spawned
    };
  }

  // ===== PRIVATE HELPERS =====

  private static getRoomFromRoll(roll: number): string | null {
    for (const entry of this.ROOM_ROLLS) {
      if (roll >= entry.min && roll <= entry.max) {
        return entry.roomId;
      }
    }
    return null;
  }

  private static getAllRoomIds(): string[] {
    return this.ROOM_ROLLS.map(entry => entry.roomId);
  }

  private static findLowestOpenTileInRoom(board: Board, roomId: string): BoardCell | null {
    const normalizedRoomId = this.normalizeRoomId(roomId);
    const cells = board.getCellsInRoom(normalizedRoomId)
      .filter(c =>
        !c.isHole &&
        c.isEmpty &&
        !c.hasTrap &&
        !c.hasBait &&
        !c.hasBarricade &&
        !c.hasPlayer &&
        !c.hasZombie
      )
      .sort((a, b) => {
        const aVal = a.spawnId === 'z' ? 999 : parseInt(a.spawnId) || 0;
        const bVal = b.spawnId === 'z' ? 999 : parseInt(b.spawnId) || 0;
        return aVal - bVal;
      });

    return cells.length > 0 ? cells[0] : null;
  }
}