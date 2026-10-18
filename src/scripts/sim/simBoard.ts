
import { Board } from '../../game/board/Board';
import { BoardCell } from '../../game/board/BoardCell';

function getRoomId(x: number, y: number): string {
  if (x < 4 && y < 3) return 'science-lab';
  if (x > 6 && y < 3) return 'cafeteria';
  if (x > 8 && y > 2 && y < 6) return 'auditorium';
  if (x > 6 && y > 7) return 'library';
  if (x > 3 && x < 7 && y > 7) return 'Front Desk';
  if (x < 2 && y > 5 && y < 8) return 'janitors-closet';
  if (x < 2 && y > 3 && y < 5) return 'restrooms';
  if (x < 4 && y > 7) return 'principals-office';
  if ((x === 0 && y === 3) || (x > 3 && x < 7 && y === 0) || (x === 10 && y > 5 && y < 8)) return 'tunnel';
  return 'gymnasium';
}

export function createSimBoard(rows: number = 10, cols: number = 11): Board {
  const cells: BoardCell[][] = [];

  const holePositions = new Set([
    '0,0', '1,0', '10,0',
    '4,1', '5,1', '6,1',
    '4,2', '5,2', '6,2',
    '8,2', '9,2',
    '1,3', '2,3', '5,3', '8,3',
    '2,4', '7,4', '8,4',
    '3,6', '9,6', '10,6',
    '2,7', '3,7', '6,7', '9,7', '10,7',
    '0,9', '3,9', '10,9'
  ]);

  for (let y = 0; y < rows; y++) {
    cells[y] = [];
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const isHole = holePositions.has(key);
      const cell = new BoardCell(
        key,
        x,
        y,
        getRoomId(x, y),
        '',
        isHole
      );
      cells[y][x] = cell;
    }
  }

  return new Board(cells);
}