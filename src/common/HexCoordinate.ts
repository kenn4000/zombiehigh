// Square grid: q = column (0-10), r = row (0-9).
// Four cardinal directions: 0=up, 1=right, 2=down, 3=left.
export const SQUARE_DIRECTIONS: ReadonlyArray<[number, number]> = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
];

export class HexCoordinate {
  constructor(readonly q: number, readonly r: number) { }

  /** Returns the neighbor in one of 4 cardinal directions (0=up,1=right,2=down,3=left). */
  getNeighbor(direction: number): HexCoordinate {
    const [dq, dr] = SQUARE_DIRECTIONS[((direction % 4) + 4) % 4];
    return new HexCoordinate(this.q + dq, this.r + dr);
  }

  /** Manhattan distance on the square grid. */
  distanceTo(other: HexCoordinate): number {
    return Math.abs(this.q - other.q) + Math.abs(this.r - other.r);
  }

  /** All 4 cardinal neighbors (unchecked — may be out of bounds). */
  getAllNeighbors(): HexCoordinate[] {
    return SQUARE_DIRECTIONS.map(([dq, dr]) => new HexCoordinate(this.q + dq, this.r + dr));
  }

  /**
   * All coordinates within Manhattan distance `radius` (excluding self).
   * Forms a diamond shape on the square grid.
   */
  getHexesWithinRadius(radius: number): HexCoordinate[] {
    const results: HexCoordinate[] = [];
    for (let dq = -radius; dq <= radius; dq++) {
      const drRange = radius - Math.abs(dq);
      for (let dr = -drRange; dr <= drRange; dr++) {
        if (dq !== 0 || dr !== 0) {
          results.push(new HexCoordinate(this.q + dq, this.r + dr));
        }
      }
    }
    return results;
  }

  equals(other: HexCoordinate): boolean {
    return this.q === other.q && this.r === other.r;
  }

  key(): string {
    return `${this.q},${this.r}`;
  }

  static fromKey(key: string): HexCoordinate {
    const [q, r] = key.split(',').map(Number);
    return new HexCoordinate(q, r);
  }
}
