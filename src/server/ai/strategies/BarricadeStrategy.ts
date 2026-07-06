import { HexCoordinate } from '../../../common/HexCoordinate';
import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * BarricadeStrategy: Decide whether and where to place a barricade.
 *
 * Only place if:
 * - Gold >= barricadeCost + buffer
 * - Barricade count < limit
 *
 * Target edge logic:
 * - Identify edges with highest zombie traffic
 * - Prioritize edges on board perimeter (contain zombie spawns)
 * - Avoid blocking own escape routes
 */
export class BarricadeStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
        private readonly barricadeCost: number = 5,
        private readonly safetyBuffer: number = 5,
    ) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        // Check resources
        const structureCount = this.evaluator.getStructureCount(this.player.id);
        if (structureCount.barricades >= this.player.barricadeLimit) {
            return { actionType: 'PASS', reason: 'Barricade limit reached' };
        }

        if (this.player.gold < this.barricadeCost + this.safetyBuffer) {
            return { actionType: 'PASS', reason: `Not enough gold for barricade (need ${this.barricadeCost + this.safetyBuffer})` };
        }

        // Find valid placement edges
        const candidateHexes = this.findValidBarricadeHexes();
        if (candidateHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No valid barricade placement edges' };
        }

        // Difficulty-dependent placement
        let bestHex: HexCoordinate;
        switch (difficultyLevel) {
            case 'easy':
                bestHex = candidateHexes[Math.floor(Math.random() * candidateHexes.length)];
                break;
            case 'normal':
            case 'hard':
                bestHex = this.scoreBarricadeHexes(candidateHexes)[0]?.hex || candidateHexes[0];
                break;
        }

        return {
            actionType: 'W',
            targetHex: bestHex,
            reason: `Placing barricade (difficulty: ${difficultyLevel})`,
        };
    }

    private findValidBarricadeHexes(): HexCoordinate[] {
        // TODO: Implement edge-based barricade placement
        // Barricades are placed on edges between hexes, not in hexes themselves
        // This requires different logic than trap placement
        return [];
    }

    private scoreBarricadeHexes(hexes: HexCoordinate[]): Array<{ hex: HexCoordinate; score: number }> {
        return hexes.map(hex => ({
            hex,
            score: Math.random(), // TODO: Implement scoring heuristic
        })).sort((a, b) => b.score - a.score);
    }
}
