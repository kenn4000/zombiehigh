import { Player } from '../../Player';
import { LegacyCard } from '../../cards/LegacyCard';
import { AIDecision } from '../AIPlayer';

/**
 * CardPlayStrategy: Decide whether and which card to play.
 *
 * Greedy approach: Evaluate all playable cards by immediate benefit
 * - Gold-generating cards (high priority if gold < 10)
 * - SP/HP-generating cards (priority if threatened)
 * - Mobility cards (Shoes, Grappling Hook) if need to escape
 * - Trap/Barricade enhancers (if planning to use action next)
 *
 * Skip card play if better to save gold for core actions.
 */
export class CardPlayStrategy {
    constructor(private readonly player: Player) { }

    public decide(difficultyLevel: 'easy' | 'normal' | 'hard'): AIDecision {
        // Check if player has any playable cards
        const playableCards = this.player.cardsInHand.filter(card => {
            // TODO: Implement card playability check (requirements, cost, etc.)
            return true; // Placeholder
        });

        if (playableCards.length === 0) {
            return { actionType: 'PASS', reason: 'No playable cards' };
        }

        // TODO: Score cards by value
        // For now, skip card play
        return { actionType: 'PASS', reason: 'Skipping card play (strategy not implemented)' };
    }
}
