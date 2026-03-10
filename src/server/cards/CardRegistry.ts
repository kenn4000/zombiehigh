import { CardName } from '../../common/CardName';
import { ICard } from './ICard';
import { ALL_CARD_DEFINITIONS } from './cardData';

/**
 * Phase 5: Static lookup map from CardName to typed ICard.
 * Populated at module load time from cardData.ts.
 */
export class CardRegistry {
  private static readonly cards: Map<CardName, ICard> = (() => {
    const m = new Map<CardName, ICard>();
    for (const card of ALL_CARD_DEFINITIONS) {
      m.set(card.name, card);
    }
    return m;
  })();

  static get(name: CardName): ICard | undefined {
    return this.cards.get(name);
  }

  static has(name: CardName): boolean {
    return this.cards.has(name);
  }

  static getAll(): ReadonlyMap<CardName, ICard> {
    return this.cards;
  }
}
