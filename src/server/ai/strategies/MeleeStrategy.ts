import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * MeleeStrategy: Decide whether and where to perform a melee attack.
 *
 * Only execute if:
 * - Adjacent zombie exists
 * - Success rate > threshold (50%)
 * - Gold >= meleeCost
 *
 * Consider card plays before melee (hero abilities, equipment bonuses).
 */
export class MeleeStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
        private readonly meleeCost: number = 7,
    ) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        // Check resources
        if (this.player.gold < this.meleeCost) {
            return { actionType: 'PASS', reason: `Not enough gold for melee (need ${this.meleeCost})` };
        }

        // TODO: Check for adjacent zombies
        // TODO: Calculate success rate
        // TODO: Determine if attack is worth attempting

        // Placeholder: never attack for now
        return { actionType: 'PASS', reason: 'No melee attack available' };
    }
}
