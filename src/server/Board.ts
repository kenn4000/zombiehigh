import { HexCoordinate } from '../common/HexCoordinate';
import { edgeKey } from './Edge';
import { Barricade } from './Barricade';
import { Trap } from './Trap';
import { PlayerId } from '../common/Types';

export type WallFlags = { top: boolean; right: boolean; bottom: boolean; left: boolean };

/**
 * Static 10-row × 11-column square grid board.
 * q = column (0–10), r = row (0–9).
 * Wall flags block movement through the matching edge.
 * BLANK cells are absent from the tile map entirely.
 */
const TILE_DATA: ReadonlyArray<[number, number, Partial<WallFlags>]> = [
  // Row 0 (A)
  [2, 0, { left: true, top: true }],
  [3, 0, { top: true }],
  [4, 0, { top: true, bottom: true }],
  [5, 0, { top: true, bottom: true }],
  [6, 0, { top: true, bottom: true }],
  [7, 0, { top: true }],
  [8, 0, { top: true }],
  [9, 0, { top: true, right: true }],
  // Row 1 (B)
  [0, 1, { left: true, top: true }],
  [1, 1, { top: true }],
  [2, 1, {}],
  [3, 1, { right: true }],
  [7, 1, { left: true }],
  [8, 1, { bottom: true }],
  [9, 1, { bottom: true }],
  [10, 1, { right: true, top: true }],
  // Row 2 (C)
  [0, 2, { left: true }],
  [1, 2, { bottom: true }],
  [2, 2, { bottom: true }],
  [3, 2, { right: true }],
  [7, 2, { left: true, right: true }],
  [10, 2, { left: true, right: true }],
  // Row 3 (D)
  [0, 3, { left: true, right: true }],
  [3, 3, { left: true }],
  [4, 3, { top: true, right: true }],
  [6, 3, { top: true, left: true }],
  [7, 3, { right: true, bottom: true }],
  [9, 3, { left: true, top: true }],
  [10, 3, { right: true }],
  // Row 4 (E)
  [0, 4, { left: true }],
  [1, 4, { top: true, right: true }],
  [3, 4, { left: true }],
  [4, 4, {}],
  [5, 4, { top: true }],
  [6, 4, { right: true }],
  [9, 4, { left: true }],
  [10, 4, { right: true }],
  // Row 5 (F)
  [0, 5, { left: true }],
  [1, 5, { bottom: true }],
  [2, 5, { top: true }],
  [3, 5, { bottom: true }],
  [4, 5, {}],
  [5, 5, {}],
  [6, 5, {}],
  [7, 5, { top: true }],
  [8, 5, { top: true }],
  [9, 5, { bottom: true }],
  [10, 5, { right: true }],
  // Row 6 (G)
  [0, 6, { left: true }],
  [1, 6, { top: true, right: true }],
  [2, 6, { right: true, left: true, bottom: true }],
  [4, 6, { left: true }],
  [5, 6, {}],
  [6, 6, { bottom: true }],
  [7, 6, {}],
  [8, 6, { right: true }],
  [10, 6, { right: true, left: true }],
  // Row 7 (H)
  [0, 7, { left: true, bottom: true }],
  [1, 7, { right: true }],
  [4, 7, { left: true, bottom: true }],
  [5, 7, { right: true }],
  [7, 7, { left: true, bottom: true }],
  [8, 7, { right: true }],
  [10, 7, { left: true, right: true }],
  // Row 8 (I)
  [0, 8, { left: true, top: true, bottom: true }],
  [1, 8, {}],
  [2, 8, { top: true }],
  [3, 8, { top: true, bottom: true }],
  [4, 8, { top: true }],
  [5, 8, {}],
  [6, 8, { top: true }],
  [7, 8, { top: true }],
  [8, 8, {}],
  [9, 8, { top: true }],
  [10, 8, { right: true, bottom: true }],
  // Row 9 (J)
  [1, 9, { bottom: true, left: true }],
  [2, 9, { bottom: true, right: true }],
  [4, 9, { left: true, bottom: true }],
  [5, 9, { bottom: true }],
  [6, 9, { bottom: true, right: true }],
  [7, 9, { left: true, bottom: true }],
  [8, 9, { bottom: true }],
  [9, 9, { right: true, bottom: true }],
];

/**
 * Explicit tileIDs for all 83 tiles on the board.
 * IDs 1–83, each uniquely assigned to one tile.
 */
const NAMED_TILE_IDS: Map<string, number> = new Map([
  // Row A (r=0)
  ['2,0', 26], ['3,0', 54], ['4,0', 79], ['5,0', 45], ['6,0', 35], ['7,0', 27], ['8,0', 55], ['9,0', 46],
  // Row B (r=1)
  ['0,1', 53], ['1,1', 34], ['2,1', 44], ['3,1', 61], ['7,1', 70], ['8,1', 62], ['9,1', 36], ['10,1', 56],
  // Row C (r=2)
  ['0,2', 60], ['1,2', 69], ['2,2', 75], ['3,2', 80], ['7,2', 76], ['10,2', 47],
  // Row D (r=3)
  ['0,3', 43], ['3,3', 17], ['4,3', 2], ['6,3', 18], ['7,3', 19], ['9,3', 71], ['10,3', 28],
  // Row E (r=4)
  ['0,4', 33], ['1,4', 81], ['3,4', 16], ['4,4', 11], ['5,4', 7], ['6,4', 12], ['9,4', 63], ['10,4', 37],
  // Row F (r=5)
  ['0,5', 52], ['1,5', 68], ['2,5', 25], ['3,5', 15], ['4,5', 5], ['5,5', 4], ['6,5', 6], ['7,5', 3], ['8,5', 20], ['9,5', 77], ['10,5', 57],
  // Row G (r=6)
  ['0,6', 42], ['1,6', 74], ['2,6', 24], ['4,6', 10], ['5,6', 8], ['6,6', 9], ['7,6', 13], ['8,6', 21], ['10,6', 29],
  // Row H (r=7)
  ['0,7', 32], ['1,7', 67], ['4,7', 1], ['5,7', 14], ['7,7', 23], ['8,7', 22], ['10,7', 38],
  // Row I (r=8)
  ['0,8', 59], ['1,8', 82], ['2,8', 51], ['3,8', 66], ['4,8', 73], ['5,8', 83], ['6,8', 65], ['7,8', 78], ['8,8', 72], ['9,8', 64], ['10,8', 48],
  // Row J (r=9)
  ['1,9', 50], ['2,9', 41], ['4,9', 31], ['5,9', 40], ['6,9', 49], ['7,9', 30], ['8,9', 39], ['9,9', 58],
]);

function fullWalls(partial: Partial<WallFlags>): WallFlags {
  return {
    top: partial.top ?? false,
    right: partial.right ?? false,
    bottom: partial.bottom ?? false,
    left: partial.left ?? false,
  };
}
/**
 * Gymnasium tiles: the open central area (rows D-H, roughly cols 2-9)
 * that isn't claimed by any named room. These are the preferred spawn points
 * for freshly-generated zombies each night.
 */
const GYMNASIUM_KEYS = new Set<string>([
  // Row D (r=3)
  '3,3', '4,3', '6,3', '7,3',
  // Row E (r=4)
  '3,4', '4,4', '5,4', '6,4',
  // Row F (r=5)
  '2,5', '3,5', '4,5', '5,5', '6,5', '7,5', '8,5',
  // Row G (r=6)
  '2,6', '4,6', '5,6', '6,6', '7,6', '8,6',
  // Row H (r=7)
  '4,7', '5,7', '7,7', '8,7',
]);
export class Board {
  /** hex.key() → WallFlags for accessible tiles */
  private readonly tileWalls: Map<string, WallFlags> = new Map();
  /** Tiles in deterministic tileID order (row-major: r then q) */
  private readonly tilesByID: HexCoordinate[] = [];
  /** hex.key() → tileID */
  private readonly tileIDByKey: Map<string, number> = new Map();

  /** edgeKey → Barricade */
  private readonly barricades: Map<string, Barricade> = new Map();
  /** hex.key() → Trap */
  private readonly traps: Map<string, Trap> = new Map();
  /** hex.key() → ownerId */
  private readonly baits: Map<string, PlayerId> = new Map();

  constructor() {
    // First pass: register walls and assign explicit IDs where specified.
    let nextId = 26;
    const unnamedKeys: string[] = [];
    for (const [q, r, partial] of TILE_DATA) {
      const h = new HexCoordinate(q, r);
      const k = h.key();
      this.tileWalls.set(k, fullWalls(partial));
      const namedId = NAMED_TILE_IDS.get(k);
      if (namedId !== undefined) {
        this.tileIDByKey.set(k, namedId);
      } else {
        unnamedKeys.push(k);
      }
    }
    // Second pass: sequentially number the rest.
    for (const k of unnamedKeys) {
      this.tileIDByKey.set(k, nextId++);
    }
    // Build tilesByID array sorted by assigned ID.
    const sorted = TILE_DATA
      .map(([q, r]) => new HexCoordinate(q, r))
      .sort((a, b) => this.tileIDByKey.get(a.key())! - this.tileIDByKey.get(b.key())!);
    this.tilesByID.push(...sorted);
  }

  isWithinBounds(h: HexCoordinate): boolean {
    return this.tileWalls.has(h.key());
  }

  getTileID(h: HexCoordinate): number {
    return this.tileIDByKey.get(h.key()) ?? -1;
  }

  getTileByID(tileID: number): HexCoordinate | undefined {
    // tilesByID is sorted by ID; IDs are 1-based and sequential.
    return this.tilesByID[tileID - 1];
  }

  getTilesInIDOrder(): HexCoordinate[] {
    return [...this.tilesByID];
  }

  getAllHexes(): HexCoordinate[] {
    return [...this.tilesByID];
  }

  /** Returns tiles in the Gymnasium area, in tileID order. Used for zombie spawning. */
  getGymnasiumTiles(): HexCoordinate[] {
    return this.tilesByID.filter(h => GYMNASIUM_KEYS.has(h.key()));
  }

  getWalls(h: HexCoordinate): WallFlags {
    return this.tileWalls.get(h.key()) ?? { top: false, right: false, bottom: false, left: false };
  }

  /**
   * Returns accessible neighbors of h, respecting hard-wall flags.
   * A move from h in direction d is blocked if:
   *   - h's wall on that side is true, OR
   *   - the neighbor's wall on the opposite side is true.
   */
  getNeighbors(h: HexCoordinate): HexCoordinate[] {
    const hw = this.getWalls(h);
    // Directions: 0=up(r-1), 1=right(q+1), 2=down(r+1), 3=left(q-1)
    const checks: [HexCoordinate, boolean, 'top' | 'right' | 'bottom' | 'left'][] = [
      [new HexCoordinate(h.q, h.r - 1), hw.top, 'bottom'],
      [new HexCoordinate(h.q + 1, h.r), hw.right, 'left'],
      [new HexCoordinate(h.q, h.r + 1), hw.bottom, 'top'],
      [new HexCoordinate(h.q - 1, h.r), hw.left, 'right'],
    ];
    const neighbors: HexCoordinate[] = [];
    for (const [n, blockedHere, neighborSide] of checks) {
      if (blockedHere) continue;
      const nw = this.tileWalls.get(n.key());
      if (!nw) continue; // BLANK or out-of-bounds
      if (nw[neighborSide]) continue; // neighbor's wall blocks from its side
      neighbors.push(n);
    }
    return neighbors;
  }

  // ---- Barricades ----

  placeBarricade(a: HexCoordinate, b: HexCoordinate, bar: Barricade): void {
    this.barricades.set(edgeKey(a, b), bar);
  }

  hasBarricade(a: HexCoordinate, b: HexCoordinate): boolean {
    return this.barricades.has(edgeKey(a, b));
  }

  getBarricade(a: HexCoordinate, b: HexCoordinate): Barricade | undefined {
    return this.barricades.get(edgeKey(a, b));
  }

  removeBarricade(a: HexCoordinate, b: HexCoordinate): void {
    this.barricades.delete(edgeKey(a, b));
  }

  getBarricades(): Map<string, Barricade> {
    return this.barricades;
  }

  // ---- Traps ----

  placeTrap(h: HexCoordinate, t: Trap): void {
    this.traps.set(h.key(), t);
  }

  hasTrap(h: HexCoordinate): boolean {
    return this.traps.has(h.key());
  }

  getTrap(h: HexCoordinate): Trap | undefined {
    return this.traps.get(h.key());
  }

  removeTrap(h: HexCoordinate): void {
    this.traps.delete(h.key());
  }

  getTraps(): Map<string, Trap> {
    return this.traps;
  }

  // ---- Baits ----

  placeBait(h: HexCoordinate, ownerId: PlayerId): void {
    this.baits.set(h.key(), ownerId);
  }

  hasBait(h: HexCoordinate): boolean {
    return this.baits.has(h.key());
  }

  getBaitOwner(h: HexCoordinate): PlayerId | undefined {
    return this.baits.get(h.key());
  }

  removeBait(h: HexCoordinate): void {
    this.baits.delete(h.key());
  }

  getBaits(): Map<string, PlayerId> {
    return this.baits;
  }

  clearBaits(): void {
    this.baits.clear();
  }

  reset(): void {
    this.barricades.clear();
    this.traps.clear();
    this.baits.clear();
  }
}
