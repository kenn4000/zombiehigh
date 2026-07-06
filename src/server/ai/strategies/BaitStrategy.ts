import { HexCoordinate } from '../../../common/HexCoordinate';
import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * BaitStrategy: Decide whether and where to place bait.
 *
 * Only place if:
 * - Gold >= baitCost
 * - No bait already placed
 *
 * Target hex logic:
 * - Place at max distance from own position (3+ hexes) to lure zombies away
 * - Avoid placing near other player positions (don't feed zombies to competitors)
 * - Consider placing on board edges to concentrate zombie spawns
 */
export class BaitStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
        private readonly baitCost: number = 3,
    ) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        // Check resources
        const structureCount = this.evaluator.getStructureCount(this.player.id);
        if (structureCount.baits >= 1) {
            return { actionType: 'PASS', reason: 'Bait already placed' };
        }

        if (this.player.gold < this.baitCost) {
            return { actionType: 'PASS', reason: `Not enough gold for bait (need ${this.baitCost})` };
        }

        // Find valid placement hexes
        const candidateHexes = this.findValidBaitHexes();
        if (candidateHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No valid bait placement hexes' };
        }

        // Difficulty-dependent placement
        let bestHex: HexCoordinate;
        switch (difficultyLevel) {
            case 'easy':
                bestHex = candidateHexes[Math.floor(Math.random() * candidateHexes.length)];
                break;
            case 'normal':
            case 'hard':
                bestHex = this.scoreBaitHexes(candidateHexes)[0]?.hex || candidateHexes[0];
                break;
        }

        return {
            actionType: 'B',
            targetHex: bestHex,
            reason: `Placing bait (difficulty: ${difficultyLevel})`,
        };
    }

    private findValidBaitHexes(): HexCoordinate[] {
        // TODO: Implement bait hex finding
        // Bait must be placed within certain range of player
        // Should avoid occupied hexes
        return [];
    }

    private scoreBaitHexes(hexes: HexCoordinate[]): Array<{ hex: HexCoordinate; score: number }> {
        return hexes.map(hex => ({
            hex,
            score: Math.random(), // TODO: Implement scoring heuristic
        })).sort((a, b) => b.score - a.score);
    }
}
