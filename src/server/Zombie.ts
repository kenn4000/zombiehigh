import { HexCoordinate } from '../common/HexCoordinate';
import { Board } from './Board';
import { edgeKey } from './Edge';

let zombieCounter = 0;

/**
 * BFS from `start` through wall-respecting board neighbors toward `goal`.
 * Returns the first step on the shortest path and total step count,
 * or null if goal is unreachable or already there.
 */
function bfsPath(
  start: HexCoordinate,
  goal: HexCoordinate,
  board: Board,
): { dist: number; nextStep: HexCoordinate } | null {
  if (start.equals(goal)) return null;
  const visited = new Set<string>();
  visited.add(start.key());
  // Queue: [current, firstStepFromStart, distanceSoFar]
  const queue: Array<[HexCoordinate, HexCoordinate, number]> = [];
  for (const n of board.getNeighbors(start)) {
    if (!visited.has(n.key())) {
      visited.add(n.key());
      queue.push([n, n, 1]);
    }
  }
  let head = 0;
  while (head < queue.length) {
    const [cur, firstStep, dist] = queue[head++];
    if (cur.equals(goal)) return { dist, nextStep: firstStep };
    for (const n of board.getNeighbors(cur)) {
      if (!visited.has(n.key())) {
        visited.add(n.key());
        queue.push([n, firstStep, dist + 1]);
      }
    }
  }
  return null; // unreachable
}

export class Zombie {
  readonly id: number;
  position: HexCoordinate;
  private alive: boolean = true;

  constructor(position: HexCoordinate) {
    this.id = zombieCounter++;
    this.position = position;
  }

  get isAlive(): boolean { return this.alive; }

  setDead(): void { this.alive = false; }

  /**
   * One step of zombie turn.
   * (a) If bait is reachable within range 3 (BFS steps), move toward the closest bait.
   * (b) Otherwise, move toward the closest living player by BFS steps.
   * Then resolve barricades, player contact, traps, and bait consumption.
   */
  takeTurn(
    board: Board,
    stepIndex: number,
    isZombieAt: (h: HexCoordinate) => boolean,
    isPlayerAt: (h: HexCoordinate) => boolean,
    onBarricadeHold: (ownerId: string) => void,
    onBarricadeBreak: (ownerId: string, edgeKey: string) => void,
    onPlayerHit: (playerId: string) => void,
    onTrapKill: (ownerId: string, trapPos: HexCoordinate) => void,
    onTrapFail: () => void,
    onBaitConsumed: (ownerId: string) => void,
    getTrapOwnerTrapSuccessRate: (hexKey: string) => { ownerId: string; successRate: number } | undefined,
    getPlayerAt: (h: HexCoordinate) => { id: string; hitPoints: number; trapSuccessRate: number } | undefined,
    getBarricadeOwner: (edgeKey: string) => { ownerId: string; barricadeFailRate: number } | undefined,
    getBaitOwner: (hexKey: string) => string | undefined,
    getActivePlayers: () => HexCoordinate[],
    getBaitRadius?: (ownerId: string) => number,
  ): void {
    if (!this.alive) return;

    const DEFAULT_BAIT_RANGE = 3;
    let nextTile: HexCoordinate | undefined;

    // --- (a) Bait: find closest bait within BFS range ---
    {
      let bestDist = Number.MAX_SAFE_INTEGER;
      let bestTileID = Number.MAX_SAFE_INTEGER;
      let bestBait: HexCoordinate | undefined;

      for (const [hexKey, baitOwner] of board.getBaits()) {
        const baitHex = HexCoordinate.fromKey(hexKey);
        const baitRange = getBaitRadius ? getBaitRadius(baitOwner) : DEFAULT_BAIT_RANGE;
        const path = bfsPath(this.position, baitHex, board);
        if (path && path.dist <= baitRange) {
          const tid = board.getTileID(baitHex);
          if (path.dist < bestDist || (path.dist === bestDist && tid < bestTileID)) {
            bestDist = path.dist;
            bestTileID = tid;
            bestBait = baitHex;
          }
        }
      }
      if (bestBait) {
        const path = bfsPath(this.position, bestBait, board);
        nextTile = path?.nextStep;
      }
    }

    // --- (b) No bait: move toward closest living player ---
    if (!nextTile) {
      let bestDist = Number.MAX_SAFE_INTEGER;
      let bestTileID = Number.MAX_SAFE_INTEGER;

      for (const playerPos of getActivePlayers()) {
        const path = bfsPath(this.position, playerPos, board);
        if (path) {
          const tid = board.getTileID(playerPos);
          if (path.dist < bestDist || (path.dist === bestDist && tid < bestTileID)) {
            bestDist = path.dist;
            bestTileID = tid;
            nextTile = path.nextStep;
          }
        }
      }
    }

    if (!nextTile) return; // no reachable target

    // Don't move onto another zombie
    if (isZombieAt(nextTile)) return;

    // Conflict: Barricade
    if (board.hasBarricade(this.position, nextTile)) {
      const ek = edgeKey(this.position, nextTile);
      const barInfo = getBarricadeOwner(ek);
      const failRate = barInfo?.barricadeFailRate ?? 3;
      const roll = Math.floor(Math.random() * 6) + 1;
      if (roll <= failRate) {
        // Barricade holds
        onBarricadeHold(barInfo?.ownerId ?? '');
        return;
      } else {
        // Barricade breaks
        onBarricadeBreak(barInfo?.ownerId ?? '', ek);
        board.removeBarricade(this.position, nextTile);
        this.position = nextTile;
      }
    } else {
      this.position = nextTile;
    }

    // Player contact
    const playerInfo = getPlayerAt(this.position);
    if (playerInfo) {
      onPlayerHit(playerInfo.id);
      return;
    }

    // Trap
    if (board.hasTrap(this.position)) {
      const trapPos = this.position;
      const trapInfo = getTrapOwnerTrapSuccessRate(trapPos.key());
      board.removeTrap(this.position);
      if (trapInfo) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll <= trapInfo.successRate) {
          onTrapKill(trapInfo.ownerId, trapPos);
          this.alive = false;
          return;
        } else {
          onTrapFail();
        }
      }
    }

    // Bait consumption
    if (board.hasBait(this.position)) {
      const ownerId = getBaitOwner(this.position.key());
      board.removeBait(this.position);
      if (ownerId) onBaitConsumed(ownerId);
    }
  }
}
