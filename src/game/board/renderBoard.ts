/* renderBoard.ts
import { Board } from '../index';

export function renderBoard(board: Board, options: { showRoomIds?: boolean; showSpawnIds?: boolean } = {}): string {
  const rows = board.cells.length;
  const cols = board.cells[0]?.length || 0;
  let output = '';

  // Optional header
  if (options.showRoomIds) {
    output += 'Rooms:\n';
  }

  for (let y = 0; y < rows; y++) {
    // Top walls
    let top = '';
    for (let x = 0; x < cols; x++) {
      const cell = board.cells[y]?.[x];
      if (!cell) { top += '   '; continue; }
      
      const northWall = board.getHWall(x, y - 1);
      const isNorthBlocked = northWall ? northWall.isNatural || northWall.barricadeOwner !== null : true;
      top += isNorthBlocked ? '+---' : '+   ';
    }
    top += '+';
    output += top + '\n';

    // Middle row
    let mid = '';
    for (let x = 0; x < cols; x++) {
      const cell = board.cells[y]?.[x];
      if (!cell) { mid += '|   '; continue; }

      const westWall = board.getVWall(x - 1, y);
      const isWestBlocked = westWall ? westWall.isNatural || westWall.barricadeOwner !== null : true;
      mid += isWestBlocked ? '|' : ' ';

      let content = ' ';
      if (cell.isHole) content = '·';
      else if (cell.hasPlayer) content = 'P';
      else if (cell.hasZombie) content = 'Z';
      else if (cell.hasTrap) content = 'T';
      else if (cell.hasBait) content = 'B';
      else if (options.showRoomIds && cell.roomId) content = cell.roomId.substring(0, 1).toUpperCase();
      else if (options.showSpawnIds && cell.spawnId !== 'z') content = cell.spawnId;
      else if (!cell.isEmpty) content = '?';
      
      mid += ` ${content} `;
    }
    
    const lastCell = board.cells[y]?.[cols-1];
    const eastWall = board.getVWall(cols-1, y);
    const isEastBlocked = eastWall ? eastWall.isNatural || eastWall.barricadeOwner !== null : true;
    mid += isEastBlocked ? '|' : ' ';
    output += mid + '\n';
  }

  // Bottom border
  let bottom = '';
  for (let x = 0; x < cols; x++) {
    const cell = board.cells[rows-1]?.[x];
    if (!cell) { bottom += '   '; continue; }
    const southWall = board.getHWall(x, rows-1);
    const isSouthBlocked = southWall ? southWall.isNatural || southWall.barricadeOwner !== null : true;
    bottom += isSouthBlocked ? '+---' : '+   ';
  }
  bottom += '+';
  output += bottom;

  return output;
}

// Quick debug helper
export function logBoard(board: Board, label?: string): void {
  if (label) console.log(`\n=== ${label} ===`);
  console.log(renderBoard(board));
}*/