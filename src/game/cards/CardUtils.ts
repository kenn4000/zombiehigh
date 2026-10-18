// CardUtils.ts
import { Player, Board, GameConstants, Game } from '../index';

// ============================================================
// VALUE FUNCTIONS
// ============================================================

export function getSPValue(player: Player, night: number): number {
  return GameConstants.FLEX_POINT_VALUE + (GameConstants.EXPECTED_GAME_LENGTH - night);
}

export function getCPValue(player: Player, night: number): number {
  const np = player.currNP || 0;
  const cp = player.currCP || 0;
  const npSq = np * np;
  const cpSq = cp * cp;
  return GameConstants.FLEX_POINT_VALUE*(cpSq + .5 * npSq + 1.5) / (npSq + cpSq + 2);
}

export function getNPValue(player: Player, night: number): number {
  const np = player.currNP || 0;
  const cp = player.currCP || 0;
  const npSq = np * np;
  const cpSq = cp * cp;
  return  GameConstants.FLEX_POINT_VALUE*( npSq + .5 * cpSq + 1.5) / (npSq + cpSq + 2);
}

export function getHealthValue(player: Player, night: number): number {
  const healthScarcity = Math.max(1, 4 - (player.currHealth || 3));
  const nightBonus = 1 + (night / 8);
  return 5 * healthScarcity * nightBonus;
}

// ============================================================
// BOARD HELPERS
// ============================================================

export function countZombiesInRoom(board: Board, roomId: string): number {
  return board.getCellsInRoom(roomId).filter(c => c.hasZombie).length;
}

export function countBaitsOnBoard(board: Board): number {
  return board.getAllBaits().length;
}

export function countBarricadesOnBoard(board: Board): number {
  return board.getAllBarricades().length;
}

export function countTrapsInRoom(board: Board, roomId: string): number {
  return board.getCellsInRoom(roomId).filter(c => c.hasTrap).length;
}

export function countBarricadesInRoom(board: Board, roomId: string): number {
  return board.getCellsInRoom(roomId).filter(c => c.hasBarricade).length;
}

export function countTrapsOnBoard(board: Board): number {
  return board.getAllTraps().length;
}

export function countZombiesOnBoard(board: Board): number {
  return board.getAllZombies().length;
}

export function countPlayersInRoom(board: Board, roomId: string, excludePlayer?: Player): number {
  const cells = board.getCellsInRoom(roomId).filter(c => c.hasPlayer);
  if (excludePlayer) {
    return cells.filter(c => c.structureOwner !== excludePlayer).length;
  }
  return cells.length;
}

// ============================================================
// SHORTHAND HELPERS (for use in cards)
// ============================================================

export function sp(player: Player, night: number): number {
  return player.getSPValue(night);
}

export function cp(player: Player): number {
  return player.getCPValue();
}

export function np(player: Player): number {
  return player.getNPValue();
}

export function health(player: Player, night: number): number {
  return player.getHealthValue(night);
}

// ============================================================
// COMBINED HELPER
// ============================================================

export function getPlayerValues(player: Player, night: number): {
  sp: number;
  cp: number;
  np: number;
  health: number;
} {
  return {
    sp: player.getSPValue(night),
    cp: player.getCPValue(),
    np: player.getNPValue(),
    health: player.getHealthValue(night),
  };
}