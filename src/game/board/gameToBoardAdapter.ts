// utils/gameToBoardAdapter.ts
import { Game, Board, BoardCell } from '../index';

export function gameToBoardModel(game: Game, board: Board) {
  const cells = board.getAllCells();
  
  return {
    tiles: cells.map(cell => cellToTile(cell)),
    traps: cells.filter(c => c.hasTrap).map(cellToTrap),
    baits: cells.filter(c => c.hasBait).map(cellToBait),
    barricades: cells.filter(c => c.hasBarricade).map(cellToBarricade),
    zombies: cells.filter(c => c.hasZombie).map(cellToZombie),
    players: game.players.filter(p => !p.isEliminated).map(p => playerToPlayerPosition(p, board)),
    highlightedHexKeys: [],
    zombieTrailHexKeys: game.zombieManager?.getZombieTrailHexKeys() || [],
    zombieTrailMoves: game.zombieManager?.getZombieTrailMoves() || [],
  };
}

function cellToTile(cell: BoardCell) {
  return {
    key: `${cell.x},${cell.y}`,
    q: cell.x,
    r: cell.y,
    isHole: cell.isHole || false,
    roomId: cell.roomId,
    // These can be computed from the cell's structure if needed
    hasBarricade: cell.hasBarricade,
    hasTrap: cell.hasTrap,
    hasBait: cell.hasBait,
    hasPlayer: cell.hasPlayer,
    hasZombie: cell.hasZombie,
    ownerId: cell.owner?.id || null,
  };
}

function cellToTrap(cell: BoardCell) {
  return {
    hexKey: `${cell.x},${cell.y}`,
    ownerId: cell.structureOwner?.id || '',
    ownerColor: '#ff8800',
    effectiveness: cell.structureData.effectiveness || 0,
  };
}

function cellToBait(cell: BoardCell) {
  return {
    hexKey: `${cell.x},${cell.y}`,
    ownerId: cell.structureOwner?.id || '',
    ownerColor: '#ffcc00',
    radius: cell.structureData.radius || 0,
  };
}

function cellToBarricade(cell: BoardCell) {
  return {
    hexKey: `${cell.x},${cell.y}`,
    ownerId: cell.structureOwner?.id || '',
    ownerColor: '#8b4513',
    health: cell.structureData.health || 3,
  };
}

function cellToZombie(cell: BoardCell) {
  return {
    id: cell.zombieId || `z-${cell.x},${cell.y}`,
    q: cell.x,
    r: cell.y,
    hexKey: `${cell.x},${cell.y}`,
    stepsLeft: cell.zombieStepsLeft || 0,
  };
}

function playerToPlayerPosition(player: any, board: Board) {
  const pos = board.getPlayerPosition(player);
  if (!pos) {
    return {
      id: player.id,
      name: player.name,
      hexKey: `0,0`,
      q: 0,
      r: 0,
      color: '#4a9eff',
    };
  }
  return {
    id: player.id,
    name: player.name,
    hexKey: `${pos.x},${pos.y}`,
    q: pos.x,
    r: pos.y,
    color: '#4a9eff',
  };
}