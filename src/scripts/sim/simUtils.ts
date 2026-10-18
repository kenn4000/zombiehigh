
import { Board } from '../../game/board/Board';
import * as path from 'path';

export function getPlayerCountFromArgs(): number {
  const byEquals = process.argv.find(a => a.startsWith('--players='));
  const bySpaceIndex = process.argv.findIndex(a => a === '--players');

  const raw = byEquals
    ? byEquals.split('=')[1]
    : (bySpaceIndex >= 0 ? process.argv[bySpaceIndex + 1] : undefined);

  const parsed = raw ? Number(raw) : 4;
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 5) {
    throw new Error('Invalid --players value. Expected an integer from 2 to 5.');
  }
  return parsed;
}

export function getMaxStepsFromArgs(): number {
  const byEquals = process.argv.find(a => a.startsWith('--max-steps='));
  const bySpaceIndex = process.argv.findIndex(a => a === '--max-steps');

  const raw = byEquals
    ? byEquals.split('=')[1]
    : (bySpaceIndex >= 0 ? process.argv[bySpaceIndex + 1] : undefined);

  const parsed = raw ? Number(raw) : 5000;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5000;
}

export function getOutputDirFromArgs(): string {
  const byEquals = process.argv.find(a => a.startsWith('--output='));
  const bySpaceIndex = process.argv.findIndex(a => a === '--output');

  const raw = byEquals
    ? byEquals.split('=')[1]
    : (bySpaceIndex >= 0 ? process.argv[bySpaceIndex + 1] : undefined);

  return raw && raw.trim().length > 0 ? raw.trim() : path.join(process.cwd(), 'data');
}

export const START_POSITIONS: Array<[number, number]> = [
  [1, 1],
  [7, 8],
  [5, 5],
  [1, 8],
  [5, 4],
];

export function getRandomStartPositions(board: Board, playerCount: number): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  const usedPositions = new Set<string>();
  
  // Get all valid cells (not holes, not occupied)
  const validCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 11; x++) {
      const cell = board.getCell(x, y);
      if (cell && !cell.isHole && !cell.isOccupied) {
        validCells.push({ x, y });
      }
    }
  }
  
  // Shuffle valid cells
  for (let i = validCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [validCells[i], validCells[j]] = [validCells[j], validCells[i]];
  }
  
  // Take the first playerCount positions
  for (let i = 0; i < Math.min(playerCount, validCells.length); i++) {
    const cell = validCells[i];
    positions.push([cell.x, cell.y]);
  }
  
  return positions;
}