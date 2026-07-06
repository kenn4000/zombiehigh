import { PlayerId } from '../../common/Types';
import { HexCoordinate } from '../../common/HexCoordinate';
import { Player } from '../Player';
import { Game } from '../Game';
import { AIPlayer } from './AIPlayer';
import { HeroId } from '../../common/HeroId';
import { LegacyCard } from '../cards/LegacyCard';

/**
 * GameIntegration: Helper module to bridge AI decision-making with Game event hooks.
 * Provides methods for wiring up AI auto-resolution at various game phases.
 */
export class GameIntegration {
    /**
     * Auto-resolve AI player setup selections (hero, lockers, cards).
     */
    static autoResolveAISetup(player: Player, game: Game): void {
        if (!player.isBot) return;

        const aiPlayer = new AIPlayer(player, game);

        // Select hero
        if (player.setupHeroOptions.length > 0 && !player.selectedHero) {
            const hero = aiPlayer.selectHero(player.setupHeroOptions);
            player.selectedHero = hero;
            if (hero.id === HeroId.CARD_SHARK) {
                player.selectedStartingCards = [...player.setupCardOptions];
            }
            game.log(`${player.name} (AI): Selected hero ${hero.name}`);
        }

        // Select lockers (max 2)
        if (player.setupLockerOptions.length > 0 && player.selectedLockers.length === 0) {
            const lockers = aiPlayer.selectLockers(player.setupLockerOptions, 2);
            player.selectedLockers = lockers;
            game.log(`${player.name} (AI): Selected lockers: ${lockers.map(l => l.name).join(', ')}`);
        }

        // Select starting cards
        if (player.setupCardOptions.length > 0 && player.selectedStartingCards.length === 0 && player.selectedHero?.id !== HeroId.CARD_SHARK) {
            const cards = aiPlayer.selectStartingCards(player.setupCardOptions, player.setupCardOptions.length);
            player.selectedStartingCards = cards;
            game.log(`${player.name} (AI): Selected ${cards.length} starting cards`);
        }
    }

    /**
     * Auto-resolve AI player board placement.
     */
    static autoResolvePlacement(playerId: PlayerId, validPositions: HexCoordinate[], player: Player, game: Game): void {
        if (!player.isBot || player.isPlaced) return;

        const aiPlayer = new AIPlayer(player, game);
        const position = aiPlayer.selectPlacementPosition(validPositions);

        game.log(`${player.name} (AI-${player.difficultyLevel}): Placing at hex (${position.q}, ${position.r})`);
        // Return the position to be placed by the game
    }

    /**
     * Auto-resolve AI player draft card selection.
     */
    static autoResolveDraftSelection(playerId: PlayerId, cardOptions: LegacyCard[], player: Player, game: Game): LegacyCard {
        if (!player.isBot || cardOptions.length === 0) return cardOptions[0];

        const aiPlayer = new AIPlayer(player, game);
        const selectedCard = aiPlayer.selectDraftCard(cardOptions);

        game.log(`${player.name} (AI): Drafted ${selectedCard.name}`);
        return selectedCard;
    }
}
