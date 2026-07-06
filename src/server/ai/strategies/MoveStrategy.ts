import { HexCoordinate } from '../../../common/HexCoordinate';
import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * MoveStrategy: Decide whether and where to move.
 *
 * Priority:
 * 1. Escape if HP < 2 and zombie adjacent
 * 2. Move toward high-SP opportunity hexes (trap placement zones, safe bait spots)
 * 3. Move toward gold-rich areas (if gold < 10 and no immediate threat)
 * 4. Random safe hex (exploration)
 */
export class MoveStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
        private readonly baseMovementCost: number = 3,
    ) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        const threatLevel = this.evaluator.getZombieThreatLevel(this.player);

        // Check survival: escape if critical threat
        if (threatLevel > 60 && this.player.hitPoints <= 2) {
            return this.decideEscape();
        }

        // Check if we can afford to move
        if (this.player.gold < this.baseMovementCost) {
            return { actionType: 'PASS', reason: 'Not enough gold to move' };
        }

        // Difficulty-dependent strategies
        switch (difficultyLevel) {
            case 'easy':
                return this.decideEasy();
            case 'normal':
                return this.decideNormal();
            case 'hard':
                return this.decideHard();
        }
    }

    private decideEscape(): AIDecision {
        // Find safe hexes away from zombies
        const safeHexes = this.evaluator.getSafeHexes(this.player, 1);
        if (safeHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No safe escape hexes available' };
        }

        // Pick the one furthest away (heuristic)
        const bestHex = safeHexes[0]; // TODO: sort by distance from nearest zombie
        return {
            actionType: 'M',
            targetHex: bestHex,
            reason: 'Escaping zombie threat',
        };
    }

    private decideEasy(): AIDecision {
        // Easy: random safe move or pass
        const safeHexes = this.evaluator.getSafeHexes(this.player, 1);
        if (safeHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No safe hexes to move to' };
        }

        const randomHex = safeHexes[Math.floor(Math.random() * safeHexes.length)];
        return {
            actionType: 'M',
            targetHex: randomHex,
            reason: 'Easy: random safe move',
        };
    }

    private decideNormal(): AIDecision {
        // Normal: move toward opportunity zones
        const safeHexes = this.evaluator.getSafeHexes(this.player, 1);
        if (safeHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No safe hexes to move to' };
        }

        // TODO: Score hexes based on nearby opportunities (traps, baits, other players)
        // For now, pick first safe hex
        return {
            actionType: 'M',
            targetHex: safeHexes[0],
            reason: 'Normal: moving toward opportunity zone',
        };
    }

    private decideHard(): AIDecision {
        // Hard: strategic movement toward high-value positions
        const safeHexes = this.evaluator.getSafeHexes(this.player, 1);
        if (safeHexes.length === 0) {
            return { actionType: 'PASS', reason: 'No safe hexes to move to' };
        }

        // TODO: Implement sophisticated positional scoring
        // Consider: board corners, trap placement zones, escape routes
        return {
            actionType: 'M',
            targetHex: safeHexes[0],
            reason: 'Hard: strategic positioning',
        };
    }
}
