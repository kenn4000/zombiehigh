// src/scripts/sim/simCardDraft.ts

import { Player } from '../../game/core/Player';
import { CardProcessor } from '../../game/cards/CardProcessor';
import { BoardEvaluator } from '../../game/board/BoardEvaluator';
import { Board } from '../../game/board/Board';
import { Game } from '../../game/core/Game';

export interface CardPurchaseRecord {
  cardId: string;
  cardName: string;
  cost: number;
  purchased: boolean;
  purchasePrice: number;
}

export interface CardDraftResult {
  playerId: string;
  playerName: string;
  cardsOffered: CardPurchaseRecord[];
  cardsPurchased: CardPurchaseRecord[];
  totalSpent: number;
  remainingGold: number;
}

export function draftCards(
  player: Player,
  board: Board,
  game: Game,
  cardsToOffer: number = 4
): CardDraftResult {
  const allCards = CardProcessor.getAll();
  const shuffled = [...allCards];
  
  // Shuffle the card pool
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // Offer cards
  const offered: CardPurchaseRecord[] = [];
  for (let i = 0; i < Math.min(cardsToOffer, shuffled.length); i++) {
    const cardDef = shuffled[i];
    offered.push({
      cardId: cardDef.id,
      cardName: cardDef.name,
      cost: cardDef.cost || 0,
      purchased: false,
      purchasePrice: 4, // Fixed price of 4 gold per card
    });
  }
  
  // Greedy purchase algorithm
  const purchased: CardPurchaseRecord[] = [];
  let totalSpent = 0;
  let remainingGold = player.gold;
  
  // Sort offered cards by expected value (highest first)
  const evaluator = new BoardEvaluator(board, game.players, game.generationCount || 1);
  
  // Score each card
  const scoredCards = offered.map(record => {
    const cardEffect = CardProcessor.get(record.cardId);
    let expectedValue = 0;
    
    if (cardEffect) {
      try {
        // Try to get optimal target and value
        if (cardEffect.getOptimalTarget) {
          const optimal = cardEffect.getOptimalTarget(player, board, evaluator);
          expectedValue = optimal.value || 0;
        } else if (cardEffect.expectedValue) {
          expectedValue = cardEffect.expectedValue(player, board, evaluator, null);
        } else {
          expectedValue = record.cost * 2; // Fallback
        }
      } catch (e) {
        expectedValue = record.cost; // Fallback
      }
    }
    
    return {
      record,
      expectedValue,
      isPlayable: cardEffect ? true : false,
    };
  });
  
  // Sort by expected value (highest first)
  scoredCards.sort((a, b) => b.expectedValue - a.expectedValue);
  
  // Greedy purchase: buy cards with positive expected value
  for (const scored of scoredCards) {
    const { record, expectedValue, isPlayable } = scored;
    
    // Only purchase if:
    // 1. Card is playable
    // 2. Expected value > purchase price (4 gold)
    // 3. Player has enough gold
    // 4. Card has positive value (or at least break-even)
    const purchasePrice = 4;
    const isWorthIt = expectedValue > purchasePrice * 0.8; // Threshold: 80% of cost
    
    if (isPlayable && isWorthIt && remainingGold >= purchasePrice) {
      // Purchase the card
      record.purchased = true;
      purchased.push(record);
      totalSpent += purchasePrice;
      remainingGold -= purchasePrice;
      
      // Actually add the card to player's hand
      const cardInstance = {
        id: `${record.cardId}-${Date.now()}-${Math.random()}`,
        cardId: record.cardId,
        name: record.cardName,
        cost: record.cost,
        image: 'default.png',
        targetType: 'none',
      };
      player.addCard(cardInstance);
    }
  }
  
  return {
    playerId: player.id,
    playerName: player.name,
    cardsOffered: offered,
    cardsPurchased: purchased,
    totalSpent,
    remainingGold,
  };
}