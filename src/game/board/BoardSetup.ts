// boardSetup.ts
import { Board, BoardCell } from '../index';

export function setupNewBoard(): Board {
  const MAX_X = 10;
  const MAX_Y = 9;

  const cells: BoardCell[][] = [];
  const roomHoles = new Set<string>([
    '0,0', '1,0', '10,0',
    '5,1',
    '4,2', '5,2', '7,2', '7,3',
    '8,2', '9,2',
    '1,3', '2,3', '5,3',
    '2,4', '7,4',
    '8,6', '9,6',
    '2,7', '3,7', '4,7', '6,7', '8,7',
    '3,9', '10,9'
  ]);

  const scienceLabTiles = new Set<string>([
    '2,0', '3,0', '4,0', '0,1', '1,1', '2,1', '3,1', '4,1', '0,2', '1,2', '2,2', '3,2'
  ]);

  const cafeteriaTiles = new Set<string>([
    '6,0', '7,0', '8,0', '9,0', '6,1', '7,1', '8,1', '9,1', '10,1'
  ]);

  const auditoriumTiles = new Set<string>([
    '8,3', '9,3', '10,3', '8,4', '9,4', '10,4', '8,5', '9,5', '10,5'
  ]);

  const libraryTiles = new Set<string>([
    '7,8', '7,9', '8,8', '8,9', '9,7', '9,8', '9,9', '10,7', '10,8'
  ]);

  const frontDeskTiles = new Set<string>([
    '4,8', '4,9', '5,7', '5,8', '5,9', '6,9', '6,8'
  ]);

  const principalOfficeTiles = new Set<string>([
    '0,8', '1,8', '1,9', '2,8', '2,9', '3,8', '0,9'
  ]);

  const janitorsClosetTiles = new Set<string>([
    '0,6', '0,7', '1,6', '1,7'
  ]);

  const bathroomTiles = new Set<string>([
    '0,4', '0,5', '1,4', '1,5'
  ]);

  const hallwayTiles = new Set<string>([
    '10,2', '10,6',
    '0,3', '5,0'
  ]);

  function getRoomForCell(x: number, y: number): string {
    const key = `${x},${y}`;

    if (hallwayTiles.has(key)) return 'Hallway';
    if (roomHoles.has(key)) return '';
    if (scienceLabTiles.has(key)) return 'Science Lab';
    if (cafeteriaTiles.has(key)) return 'Cafeteria';
    if (auditoriumTiles.has(key)) return 'Auditorium';
    if (libraryTiles.has(key)) return 'Library';
    if (frontDeskTiles.has(key)) return 'Front Desk';
    if (principalOfficeTiles.has(key)) return "Principal's Office";
    if (janitorsClosetTiles.has(key)) return "Janitor's Closet";
    if (bathroomTiles.has(key)) return 'Restroom';

    return 'Gymnasium';
  }

  for (let y = 0; y <= MAX_Y; y++) {
    cells[y] = [];
    for (let x = 0; x <= MAX_X; x++) {
      const roomId = getRoomForCell(x, y);
      const isHole = roomHoles.has(`${x},${y}`);
      cells[y][x] = new BoardCell(`c${x}-${y}`, x, y, roomId, '', isHole);
    }
  }

  return new Board(cells);
}