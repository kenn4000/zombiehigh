import { Player } from '../../Player';
import { BoardEvaluator } from '../BoardEvaluator';
import { AIDecision } from '../AIPlayer';

/**
 * TurnManagementStrategy: Decide whether to pass or defer.
 *
 * Pass when:
 * - Gold < 5 and no high-priority actions available
 * - All structures at limit and no immediate threat
 * - Only 1-2 actions remain and no gold recovery (dead turn)
 *
 * Defer when:
 * - Urgent threat (zombie in adjacent hex, HP < 2) — wait for others to move first
 * - Gold depleted but expect income next turn
 * - Waiting for another player's action to create opportunity
 */
export class TurnManagementStrategy {
    constructor(
        private readonly player: Player,
        private readonly evaluator: BoardEvaluator,
    ) { }

    public decideTurnEnd(difficultyLevel: 'easy' | 'normal' | 'hard', actionsRemaining: number): AIDecision {
        const threatLevel = this.evaluator.getZombieThreatLevel(this.player);

        // If critical threat and low HP, defer to let others move first
        if (threatLevel > 70 && this.player.hitPoints <= 1) {
            return {
                actionType: 'DEFER',
                reason: 'Deferring due to critical threat; waiting for others',
            };
        }

        // If low gold and no resources to generate more
        if (this.player.gold < 5) {
            const structures = this.evaluator.getStructureCount(this.player.id);
            if (structures.traps >= this.player.trapLimit &&
                structures.barricades >= this.player.barricadeLimit &&
                structures.baits >= 1) {
                return {
                    actionType: 'PASS',
                    reason: 'Low gold + all structures at limit; passing',
                };
            }
        }

        // If only 1-2 actions remain with no clear use
        if (actionsRemaining <= 2 && this.player.gold < 5) {
            return {
                actionType: 'PASS',
                reason: 'Few actions left + low gold; dead turn',
            };
        }

        // Default: no pass/defer decision yet
        return { actionType: 'PASS', reason: 'No pass/defer decision' };
    }
}
