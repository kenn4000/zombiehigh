import { HexCoordinate } from '../../../common/HexCoordinate';
import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * TrapStrategy: Decide whether and where to place a trap.
 *
 * Only place if:
 * - Gold >= trapCost + buffer (keep safety margin)
 * - Trap count < limit
 *
 * Target hex logic:
 * - Within 2 hexes of current position
 * - Anticipate zombie approach vectors
 * - Prefer placing on bait-adjacent tiles (zombies more likely to hit)
 */
export class TrapStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
        private readonly trapCost: number = 5,
        private readonly safetyBuffer: number = 5,
    ) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        // Check resources
        const structureCount = this.evaluator.getStructureCount(this.player.id);
        if (structureCount.traps >= this.player.trapLimit) {
            return { actionType: 'PASS', reason: 'Trap limit reached' };
        }

        if (this.player.gold < this.trapCost + this.safetyBuffer) {
            return { actionType: 'PASS', reason: `Not enough gold for trap (need ${this.trapCost + this.safetyBuffer})` };
        }

        // Find valid placement hexes (within 2 steps)
        const candidateHexes = this.findValidTrapHexes();
        if (candidateHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No valid trap placement hexes' };
        }

        // Difficulty-dependent placement
        let bestHex: HexCoordinate;
        switch (difficultyLevel) {
            case 'easy':
                bestHex = candidateHexes[Math.floor(Math.random() * candidateHexes.length)];
                break;
            case 'normal':
            case 'hard':
                bestHex = this.scoreTrapHexes(candidateHexes)[0]?.hex || candidateHexes[0];
                break;
        }

        return {
            actionType: 'T',
            targetHex: bestHex,
            reason: `Placing trap (difficulty: ${difficultyLevel})`,
        };
    }

    private findValidTrapHexes(): HexCoordinate[] {
        // Get all hexes within 2 steps of player
        const candidates: HexCoordinate[] = [];

        // TODO: Implement proper BFS within 2 hexes
        // For now, return empty (requires board traversal integration)
        return candidates;
    }

    private scoreTrapHexes(hexes: HexCoordinate[]): Array<{ hex: HexCoordinate; score: number }> {
        return hexes.map(hex => ({
            hex,
            score: Math.random(), // TODO: Implement scoring heuristic
        })).sort((a, b) => b.score - a.score);
    }
}
