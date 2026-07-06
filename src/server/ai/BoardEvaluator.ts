import { HexCoordinate } from '../../common/HexCoordinate';
import { Player } from '../Player';
import { Board } from '../Board';
import { Zombie } from '../Zombie';

/**
 * BoardEvaluator: Analyzes board state to inform AI decision-making.
 * Provides utilities for:
 * - Zombie threat assessment
 * - Safe hex identification
 * - Gold/SP opportunity detection
 * - Pathfinding via BFS
 */
export class BoardEvaluator {
    constructor(
        private readonly board: Board,
        private readonly allPlayers: Player[],
        private readonly allZombies: Zombie[],
    ) { }

    /**
     * Estimate threat level for a player based on zombie proximity and health.
     * Returns a score: 0 (safe) to 100 (critical).
     */
    public getZombieThreatLevel(player: Player): number {
        if (!player.isAlive) return 0;

        let threatScore = 0;

        // Scan for zombies within radius 3
        const zombiesNearby = this.allZombies.filter(z => {
            const dist = z.position.distanceTo(player.position);
            return dist <= 3;
        });

        if (zombiesNearby.length === 0) return 0;

        // Threat increases with proximity and count
        const nearestDist = Math.min(...zombiesNearby.map(z => z.position.distanceTo(player.position)));

        if (nearestDist === 0) {
            threatScore += 80; // Zombie in same hex (should not happen, but critical)
        } else if (nearestDist === 1) {
            threatScore += 60; // Adjacent zombie (high threat)
        } else if (nearestDist === 2) {
            threatScore += 30; // One move away
        } else {
            threatScore += 10; // Further away but present
        }

        // Scale by count
        threatScore += Math.min(20, zombiesNearby.length * 5);

        // Critical if low HP
        if (player.hitPoints <= 1) {
            threatScore += 30;
        }

        return Math.min(100, threatScore);
    }

    /**
     * Get all hexes within range that are safe (no zombie, no other player, no trap/bait).
     */
    public getSafeHexes(player: Player, maxDistance: number = 1): HexCoordinate[] {
        const safe: HexCoordinate[] = [];

        // Use BFS to explore neighbors iteratively
        const visited = new Set<string>();
        const queue: { hex: HexCoordinate; dist: number }[] = [{ hex: player.position, dist: 0 }];
        visited.add(player.position.toString());

        while (queue.length > 0) {
            const { hex, dist } = queue.shift()!;

            if (dist <= maxDistance) {
                const neighbors = this.board.getNeighbors(hex);
                for (const neighbor of neighbors) {
                    const key = neighbor.toString();
                    if (visited.has(key)) continue;
                    visited.add(key);

                    const isOccupied = this.allZombies.some(z => z.position.equals(neighbor)) ||
                        this.allPlayers.some(p => p !== player && p.position.equals(neighbor)) ||
                        this.board.hasTrap(neighbor) ||
                        this.board.hasBait(neighbor);

                    if (!isOccupied) {
                        safe.push(neighbor);
                    }

                    if (dist + 1 <= maxDistance) {
                        queue.push({ hex: neighbor, dist: dist + 1 });
                    }
                }
            }
        }

        return safe;
    }

    /**
     * Find shortest path from start to goal using BFS.
     * Returns array of HexCoordinates (including start, excluding goal if unreachable).
     * Returns empty array if start === goal or no path exists.
     */
    public findPath(start: HexCoordinate, goal: HexCoordinate): HexCoordinate[] {
        if (start.equals(goal)) return [];

        const queue: { hex: HexCoordinate; path: HexCoordinate[] }[] = [{ hex: start, path: [start] }];
        const visited = new Set<string>();
        visited.add(start.toString());

        while (queue.length > 0) {
            const { hex, path } = queue.shift()!;

            if (hex.equals(goal)) {
                return path;
            }

            const neighbors = this.board.getNeighbors(hex);
            for (const neighbor of neighbors) {
                const key = neighbor.toString();
                if (visited.has(key)) continue;
                visited.add(key);

                queue.push({ hex: neighbor, path: [...path, neighbor] });
            }
        }

        return []; // No path found
    }

    /**
     * Estimate SP gain opportunity from nearby trap/bait placements.
     * Considers zombie positions and likely movement targets.
     */
    public getSPGainOpportunity(player: Player): number {
        // TODO: Implement heuristic for SP opportunities
        // - Traps: 3 SP per zombie kill (von Trap: 4 SP)
        // - Bait: Attracts zombies (positive for traps near bait)
        // For now, return a placeholder
        return 0;
    }

    /**
     * Estimate gold generation opportunities (how much gold can player earn next turn).
     */
    public getGoldOpportunities(player: Player): { total: number; sources: string[] } {
        const sources: string[] = [];
        let total = player.survivalPoints + player.goldProduction;

        sources.push(`Base income: SP(${player.survivalPoints}) + GP(${player.goldProduction})`);

        // TODO: Add more opportunities
        // - Cards that generate gold on action
        // - Barricade destruction payoffs
        // - Trap destruction bonuses
        // - Melee kill bonuses

        return { total, sources };
    }

    /**
     * Check if player can reach target hex with current gold (accounting for movement cost + barricade tolls).
     */
    public canReachWithGold(player: Player, target: HexCoordinate, movementCost: number = 3): boolean {
        // Simple check: does player have enough gold for base movement?
        // TODO: Account for barricade tolls along path
        return player.gold >= movementCost;
    }

    /**
     * Get count of player's existing structures on board.
     */
    public getStructureCount(playerId: string): { traps: number; barricades: number; baits: number } {
        const traps = Array.from(this.board.getTraps().values()).filter(t => t.ownerId === playerId).length;
        const barricades = Array.from(this.board.getBarricades().values()).filter(b => b.ownerId === playerId).length;
        const baits = Array.from(this.board.getBaits().values()).filter(ownerId => ownerId === playerId).length;

        return { traps, barricades, baits };
    }
}
