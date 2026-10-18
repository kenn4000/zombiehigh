
import { Player, CardProcessor } from '../index';

let selectionSequence = 0;

export type DrawMode = 
  | 'draw_x'
  | 'draw_x_keep_y'
  | 'discard_draw'
  | 'draw_x_discard_y'
  | 'draw_keep_replace';

export interface DrawResult {
  success: boolean;
  message: string;
  drawnCards: any[];
  keptCards: any[];
  discardedCards: any[];
}

export class CardDrawer {
  // ============================================================
  // DECK MANAGEMENT
  // ============================================================
  
  private gameDeck: any[] = [];
  private gameDiscard: any[] = [];
  private heroDeck: any[] = [];
  private heroDiscard: any[] = [];
  private lockerDeck: any[] = [];
  private lockerDiscard: any[] = [];
  private reshuffleOnEmpty: boolean = true;

  // ===== INITIALIZATION =====

  initializeGameDeck(cards: any[]): void {
    this.gameDeck = this.shuffle(cards);
    this.gameDiscard = [];
  }

  setReshuffleOnEmpty(enabled: boolean): void {
    this.reshuffleOnEmpty = !!enabled;
  }

  isReshuffleOnEmpty(): boolean {
    return this.reshuffleOnEmpty;
  }

  initializeHeroDeck(cards: any[]): void {
    this.heroDeck = this.shuffle(cards);
    this.heroDiscard = [];
  }

  initializeLockerDeck(cards: any[]): void {
    this.lockerDeck = this.shuffle(cards);
    this.lockerDiscard = [];
  }

  // ===== DRAW =====

  drawGameCard(): any | null {
    if (this.gameDeck.length === 0) {
      if (!this.reshuffleOnEmpty) {
        return null;
      }
      this.reshuffleGameDiscard();
      if (this.gameDeck.length === 0) {
        return null;
      }
    }
    return this.gameDeck.shift() || null;
  }

  drawHeroCard(): any | null {
    if (this.heroDeck.length === 0) {
      this.reshuffleHeroDiscard();
    }
    return this.heroDeck.shift() || null;
  }

  drawLockerCard(): any | null {
    if (this.lockerDeck.length === 0) {
      this.reshuffleLockerDiscard();
    }
    return this.lockerDeck.shift() || null;
  }

  // ===== RESHUFFLE =====

  reshuffleGameDiscard(): void {
    if (!this.reshuffleOnEmpty) return;
    if (this.gameDiscard.length === 0) return;
    this.gameDeck.push(...this.gameDiscard);
    this.gameDiscard = [];
    this.shuffle(this.gameDeck);
  }

  reshuffleHeroDiscard(): void {
    if (this.heroDiscard.length === 0) return;
    this.heroDeck.push(...this.heroDiscard);
    this.heroDiscard = [];
    this.shuffle(this.heroDeck);
  }

  reshuffleLockerDiscard(): void {
    if (this.lockerDiscard.length === 0) return;
    this.lockerDeck.push(...this.lockerDiscard);
    this.lockerDiscard = [];
    this.shuffle(this.lockerDeck);
  }

  // ===== DISCARD =====

  discardGameCard(card: any): void {
    this.gameDiscard.push(card);
  }

  discardHeroCard(card: any): void {
    this.heroDiscard.push(card);
  }

  discardLockerCard(card: any): void {
    this.lockerDiscard.push(card);
  }

  beginLockerSelection(player: Player, cards: any[]): void {
    const game = CardProcessor.getGame();
    if (!game) return;

    game.pendingCardSelection = {
      selectionId: ++selectionSequence,
      type: 'locker',
      playerId: player.id,
      count: 1,
      drawCount: cards.length,
      cards: cards.map(card => ({ ...card, cardId: card.cardId ?? card.id })),
      onComplete: 'lockerCardSelectionComplete',
    };
  }

  // ===== GETTERS =====

  getGameCards(): any[] { return [...this.gameDeck, ...this.gameDiscard]; }
  getGameDeckSize(): number { return this.gameDeck.length; }
  getGameDiscardSize(): number { return this.gameDiscard.length; }
  getHeroDeckSize(): number { return this.heroDeck.length; }
  getLockerDeckSize(): number { return this.lockerDeck.length; }

  playCard(player: Player, cardId: string, target?: any): any {
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available', needsTarget: false };
    }

    const result = CardProcessor.playCard(cardId, player, game.board, game, target);
    if (result.success && !result.needsTarget) {
      const handCard = player.hand.cards.find((card: any) => String(card.id) === String(cardId) || String(card.cardId) === String(cardId));
      if (handCard) {
        player.moveCardToPlayedPile(handCard.id);
      }
    }

    return result;
  }

  // ===== SHUFFLE =====

  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ============================================================
  // STATIC DRAW METHODS (for players)
  // ============================================================

  /**
   * Draw X cards, optionally adding them straight into the player's live hand.
   * Use addToHand=false for preview/draft lists that should not appear in the live hand yet.
   */
  static drawCards(player: Player, count: number, addToHand: boolean = true): any[] {
    const drawn: any[] = [];
    const game = CardProcessor.getGame();

    console.log(`[CardDrawer] drawCards called for ${player.name}, count: ${count}, addToHand: ${addToHand}`);
    console.log(`[CardDrawer] Game exists: ${!!game}`);
    console.log(`[CardDrawer] CardManager exists: ${!!game?.cardManager}`);
    console.log(`[CardDrawer] Game deck size: ${game?.cardManager?.getGameDeckSize()}`);

    if (!game || !game.cardManager) {
      console.log(`[CardDrawer] No game or cardManager available!`);
      return drawn;
    }

    for (let i = 0; i < count; i++) {
      const card = game.cardManager.drawGameCard();
      if (!card) {
        if (game.cardManager.isReshuffleOnEmpty()) {
          console.log(`[CardDrawer] Deck empty, reshuffling discard...`);
          game.cardManager.reshuffleGameDiscard();
          const reshuffledCard = game.cardManager.drawGameCard();
          if (!reshuffledCard) {
            console.log(`[CardDrawer] Still no cards after reshuffle!`);
            break;
          }
          drawn.push(reshuffledCard);
          if (addToHand) {
            player.addCard(reshuffledCard);
          }
          continue;
        }

        console.log(`[CardDrawer] Deck exhausted and reshuffle is disabled.`);
        break;
      }
      drawn.push(card);
      if (addToHand) {
        player.addCard(card);
      }
    }

    console.log(`[CardDrawer] Drew ${drawn.length} cards for ${player.name}`);
    return drawn;
  }

  /**
   * Draw X cards, keep Y of them (discard the rest)
   * Player selects which cards to keep via UI
   */
  static drawKeep(player: Player, drawCount: number, keepCount: number, recipientPlayerId?: string): DrawResult {
    const drawn: any[] = [];
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    for (let i = 0; i < drawCount; i++) {
      const card = game.cardManager.drawGameCard();
      if (card) drawn.push(card);
    }

    if (drawn.length === 0) {
      return { success: false, message: 'No cards to draw', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    player.tempHand = drawn;
    player.tempKeepCount = keepCount;
    if ((player as any).isBot) {
      if (recipientPlayerId) {
        game.completeSecretaryDrawGive(player, drawn[0].id, recipientPlayerId);
        return {
          success: true,
          message: `Kept 1 card and gave ${drawn.length - 1} to the lowest-SP player`,
          drawnCards: drawn,
          keptCards: drawn.slice(0, keepCount),
          discardedCards: [],
        };
      }
      return CardDrawer.completeDrawKeep(player, drawn.slice(0, keepCount).map(card => card.id));
    }

    game.pendingCardSelection = {
      selectionId: ++selectionSequence,
      type: 'keep',
      playerId: player.id,
      count: keepCount,
      keepCount,
      drawCount,
      cards: drawn.map(c => ({ ...c, id: c.id, name: c.name, cardId: c.cardId ?? c.id, image: c.image, cost: c.cost, targetType: c.targetType })),
      onComplete: recipientPlayerId ? 'secretaryDrawGiveComplete' : 'drawKeepComplete',
      ...(recipientPlayerId ? { recipientPlayerId } : {}),
    };

    game.emit('requestKeepSelection', {
      playerId: player.id,
      drawCount,
      keepCount,
      cards: drawn.map(c => ({ ...c, id: c.id, name: c.name, cardId: c.cardId ?? c.id, image: c.image, cost: c.cost, targetType: c.targetType })),
      onComplete: 'drawKeepComplete'
    });

    return {
      success: true,
      message: `Drew ${drawCount}, keep ${keepCount} (select cards)`,
      drawnCards: drawn,
      keptCards: [],
      discardedCards: []
    };
  }

  /**
   * Complete a draw-keep action (after player selects cards)
   */
  static completeDrawKeep(player: Player, keptCardIds: string[]): DrawResult {
    const tempHand = player.tempHand || [];
    const game = CardProcessor.getGame();

    const kept: any[] = [];
    const discarded: any[] = [];

    for (const card of tempHand) {
      if (keptCardIds.includes(card.id)) {
        kept.push(card);
        player.addCard(card);
      } else {
        discarded.push(card);
        player.discardCard(card);
      }
    }

    player.tempHand = [];
    player.tempKeepCount = 0;
    if (game?.pendingCardSelection?.playerId === player.id && game.pendingCardSelection.type === 'keep') {
      game.pendingCardSelection = null;
    }

    return {
      success: true,
      message: `Kept ${kept.length}, discarded ${discarded.length}`,
      drawnCards: tempHand,
      keptCards: kept,
      discardedCards: discarded
    };
  }

  /**
   * Prompt player to discard 1 card, then auto-draw X cards
   */
  static discardDraw(player: Player, drawCount: number = 1): DrawResult {
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    const exclusionId = (player as any)._pendingDiscardExclusionId ?? null;
    const selectableCards = player.hand.cards.filter((card: any) => {
      if (!card) return false;
      return String(card.id) !== String(exclusionId);
    });

    if (selectableCards.length === 0) {
      return { success: false, message: 'No valid cards to discard', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    const payload = selectableCards.map((card: any) => ({
      ...card,
      id: card.id,
      name: card.name,
      cardId: card.cardId ?? card.id,
      image: card.image,
      cost: card.cost,
      targetType: card.targetType,
    }));

    if ((player as any).isBot) {
      return CardDrawer.completeDiscardDraw(player, selectableCards[0].id, drawCount);
    }

    game.pendingCardSelection = {
      selectionId: ++selectionSequence,
      type: 'discard',
      playerId: player.id,
      count: 1,
      drawCount,
      cards: payload,
      onComplete: 'discardDrawComplete',
    };

    game.emit('requestDiscardSelection', {
      playerId: player.id,
      count: 1,
      drawCount: drawCount,
      cards: payload,
      onComplete: 'discardDrawComplete'
    });

    return {
      success: true,
      message: `Select 1 card to discard, then draw ${drawCount}`,
      drawnCards: [],
      keptCards: [],
      discardedCards: []
    };
  }

  /**
   * Complete discard-draw (called after player selects a card)
   * drawCount is passed from the event
   */
  static completeDiscardDraw(player: Player, discardedCardId: string, drawCount: number): DrawResult {
    const game = CardProcessor.getGame();
    const removed = player.removeCard(discardedCardId);
    if (!removed) {
      return { success: false, message: 'Card not found', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    player.discardCard(removed);

    const drawn: any[] = [];
    for (let i = 0; i < drawCount; i++) {
      const card = game?.cardManager?.drawGameCard();
      if (card) {
        drawn.push(card);
        player.addCard(card);
      }
    }

    if (game?.pendingCardSelection?.playerId === player.id && game.pendingCardSelection.type === 'discard') {
      game.pendingCardSelection = null;
    }

    return {
      success: true,
      message: `Discarded 1, drew ${drawn.length}`,
      drawnCards: drawn,
      keptCards: drawn,
      discardedCards: [removed]
    };
  }

  /**
   * Draw X cards, then discard Y cards from hand
   */
  static drawDiscard(player: Player, drawCount: number, discardCount: number): DrawResult {
    const game = CardProcessor.getGame();
    if (!game) {
      return { success: false, message: 'Game not available', drawnCards: [], keptCards: [], discardedCards: [] };
    }

    const drawn: any[] = [];
    for (let i = 0; i < drawCount; i++) {
      const card = game.cardManager.drawGameCard();
      if (card) {
        drawn.push(card);
        player.addCard(card);
      }
    }

    const selectableCards = player.hand.cards.map((card: any) => ({
      ...card,
      id: card.id,
      name: card.name,
      cardId: card.cardId ?? card.id,
      image: card.image,
      cost: card.cost,
      targetType: card.targetType,
    }));

    game.emit('requestDiscardSelection', {
      playerId: player.id,
      count: discardCount,
      drawCount: 0,
      onComplete: 'drawDiscardComplete',
      cards: selectableCards,
      drawnCards: drawn.map(c => ({ ...c, id: c.id, name: c.name, cardId: c.cardId ?? c.id, image: c.image, cost: c.cost, targetType: c.targetType }))
    });

    return {
      success: true,
      message: `Drew ${drawn.length}, discard ${discardCount}`,
      drawnCards: drawn,
      keptCards: drawn,
      discardedCards: []
    };
  }

  /**
   * Complete a discard action (after player selects cards to discard)
   */
  static completeDrawDiscard(player: Player, discardCardIds: string[], drawnCards: any[]): DrawResult {
    const game = CardProcessor.getGame();
    const discarded: any[] = [];
    for (const cardId of discardCardIds) {
      const removed = player.removeCard(cardId);
      if (removed) {
        discarded.push(removed);
        player.discardCard(removed);
      }
    }

    return {
      success: true,
      message: `Discarded ${discarded.length} cards`,
      drawnCards: drawnCards || [],
      keptCards: drawnCards || [],
      discardedCards: discarded
    };
  }

  /**
   * Discard ALL cards in hand, then draw the same number of cards
   */
  static discardAllDraw(player: Player): DrawResult {
    const game = CardProcessor.getGame();
    const count = player.hand.cards.length;
    const discarded = [...player.hand.cards];

    player.hand.cards = [];

    for (const card of discarded) {
      player.discardCard(card);
    }

    const drawn: any[] = [];
    for (let i = 0; i < count; i++) {
      const card = game?.cardManager?.drawGameCard();
      if (card) {
        drawn.push(card);
        player.addCard(card);
      }
    }

    return {
      success: true,
      message: `Discarded ${discarded.length}, drew ${drawn.length}`,
      drawnCards: drawn,
      keptCards: drawn,
      discardedCards: discarded
    };
  } 
populateDeckFromRegistry(cardRegistry: Map<string, any>, copiesPerCard?: Map<string, number>): void {
  const cards: any[] = [];
  
  for (const [id, cardDef] of cardRegistry) { 
    let copies = 1; 
    
    for (let i = 0; i < copies; i++) {
      cards.push({
        id: `${id}-${i}`,
        cardId: id,
        name: cardDef.name,
        cost: cardDef.cost,
        image: cardDef.image,
        type: cardDef.targetType,
        description: cardDef.description || '', 
      });
    }
  }
  
  this.gameDeck = this.shuffle(cards);
  this.gameDiscard = [];
  console.log(`[CardDrawer] Populated deck with ${this.gameDeck.length} cards`);
}
getLockerDiscardSize(): number { 
  return this.lockerDiscard.length; 
} 
}