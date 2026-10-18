// GameManager.ts
import { Game , Player , CardProcessor,CardDrawer,HERO_DECK, getHeroData, applyHeroPassive, HeroId, LOCKER_DECK, getLockerData, applyLockerPassive , AllSpecialActions, StructurePlacement, ZombieSpawner } from '../index'; 

export type GamePhase = 'setup' | 'hero_selection' | 'locker_selection' | 'card_purchase' | 'placement' | 'player_turn' | 'zombie_phase' | 'draft' | 'game_over';

export class GameManager {
  private game: Game;
  private phase: GamePhase = 'hero_selection';
  private currentPlayerIndex: number = 0;
  private roundStartingPlayerIndex: number = 0;
  private activeTurnQueue: string[] = [];
  private deferredTurnQueue: string[] = [];
  private totalPlayers: number = 0;
  private actionsPerTurn: number = 3;
  private actionsUsed: number = 0;

  // Draft state
  private draftCards: any[] = [];

  private setPhase(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    (this.game as any)._phase = nextPhase;
    this.game.emit('phaseChanged', nextPhase);

    if (this.phase === 'hero_selection') {
      this.runBotHeroSelection();
    } else if (this.phase === 'locker_selection') {
      this.runBotLockerSelection();
    } else if (this.phase === 'card_purchase') {
      this.runBotCardPurchase();
    } else if (this.phase === 'placement') {
      this.runBotPlacement();
    }
  }

  private resolveInitialPhase(): GamePhase {
    const existingPhase = (this.game as any)._phase ?? (this.game as any).phase ?? 'hero_selection';
    const validPhases: GamePhase[] = [
      'setup',
      'hero_selection',
      'locker_selection',
      'card_purchase',
      'placement',
      'player_turn',
      'zombie_phase',
      'draft',
      'game_over',
    ];

    if (typeof existingPhase === 'string' && validPhases.includes(existingPhase as GamePhase)) {
      return existingPhase as GamePhase;
    }

    return 'hero_selection';
  }

  constructor(game: Game) {
    this.game = game;
    this.totalPlayers = game.players.length;
    this.phase = this.resolveInitialPhase();
    this.currentPlayerIndex = Number((game as any)._currentPlayerIndex ?? game.currentPlayerIndex ?? 0);
    this.roundStartingPlayerIndex = Number(game._roundStartingPlayerIndex ?? this.currentPlayerIndex);
    (this.game as any)._phase = this.phase;
  }

  // ============================================================
  // INITIAL SETUP
  // ============================================================

  /**
   * Start the game - handle hero selection, locker selection, and initial card purchase
   */
  startGame(): void {
    this.game.emit('log', 'Game started! Select your heroes.');

    this.dealHeroes();
    this.dealLockers();
    this.dealInitialCardsForSetup();
    this.setPhase('hero_selection');
  }

  /**
   * Deal heroes to each player.
   * Keep the setup pool capped at the requested 3 choices.
   */
  private dealHeroes(): void {
    const heroCount = Math.min(3, Math.max(3, Math.floor(12 / this.totalPlayers)));
    const shuffled = this.shuffleArray([...HERO_DECK]);
    
    for (const player of this.game.players) {
      const available = shuffled.splice(0, heroCount);
      player.availableHeroes = available;
      this.game.emit('heroesDealt', { playerId: player.id, heroes: available });
    }
  }

  /**
   * Deal locker cards to each player.
   * Keep the setup pool capped at the requested 3 choices.
   */
  private dealLockers(): void {
    const lockerCount = Math.min(3, Math.max(3, Math.floor(24 / this.totalPlayers)));
    const shuffled = this.shuffleArray([...LOCKER_DECK]);
    
    for (const player of this.game.players) {
      const available = shuffled.splice(0, lockerCount);
      player.availableLockers = available;
      this.game.emit('lockersDealt', { playerId: player.id, lockers: available });
    }
  }

  // ============================================================
  // PLAYER SELECTION
  // ============================================================

  /**
   * Set a temporary hero preview without locking the player yet.
   */
  setTemporaryHeroSelection(playerId: string, heroId: HeroId): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;

    const heroData = getHeroData(heroId);
    if (!heroData) return false;

    player.tempHeroId = heroId;
    this.game.emit('heroPreview', { playerId, heroId });
    return true;
  }

  /**
   * Confirm the temporary hero selection and lock it in.
   */
  confirmHeroSelection(playerId: string): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player || !player.tempHeroId) return false;

    const confirmed = this.selectHero(playerId, player.tempHeroId);
    if (confirmed) {
      player.tempHeroId = null;
    }
    return confirmed;
  }

  /**
   * Player selects a hero
   */
 selectHero(playerId: string, heroId: HeroId): boolean {
  console.log(`[GameManager.selectHero] playerId: ${playerId}, heroId: ${heroId}`);
  
  const player = this.game.getPlayerById(playerId);
  if (!player) {
    console.log(`[GameManager.selectHero] Player not found: ${playerId}`);
    return false;
  }
  
  const heroData = getHeroData(heroId);
  if (!heroData) {
    console.log(`[GameManager.selectHero] Hero data not found for: ${heroId}`);
    return false;
  }
  
  console.log(`[GameManager.selectHero] Found hero: ${heroData.name}`);
  player.heroId = heroId;
  player.currHealth = heroData.stats[0];
  player.rawMeleeSuccessRate = heroData.stats[1];
  player.rawBarricadeSuccessRate = heroData.stats[2];
  player.rawTrapSuccessRate = heroData.stats[3];

  // Apply starting stats.
  // Initial setup lets players buy a full 9-card draft, so the starting gold floor must be
  // high enough to complete that purchase flow without getting stuck in card_purchase.
  const setupGoldFloor = 9 * 4;
  player.gold = Math.max(heroData.startingGold, setupGoldFloor);
  player.currSP = heroData.startingSP;
  if (heroData.startingGP) {
    player.currGP = heroData.startingGP;
  }
  
  // Apply hero passive
  applyHeroPassive(heroId, player, this.game.players);
  
  // Add the hero's shared dual-option action bundle keyed by hero id.
  const heroAction = AllSpecialActions[heroId];
  if (heroAction) {
    player.actionManager.addAction(heroAction);
  } else {
    const legacyActionN = AllSpecialActions[heroData.actionN];
    const legacyActionC = AllSpecialActions[heroData.actionC];
    if (legacyActionN) player.actionManager.addAction(legacyActionN);
    if (legacyActionC) player.actionManager.addAction(legacyActionC);
  }
  
  this.game.emit('heroSelected', { playerId, heroId });
  this.game.emit('log', `${player.name} selected ${heroData.name}`);
  
  this.checkAllHeroesSelected();
  
  return true;
}
  /**
   * Toggle a temporary locker preview without locking it in yet.
   */
  setTemporaryLockerSelection(playerId: string, lockerId: string): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;

    const idx = player.tempSelectedLockers.indexOf(lockerId);
    if (idx >= 0) {
      player.tempSelectedLockers.splice(idx, 1);
    } else if (player.tempSelectedLockers.length === 0) {
      player.tempSelectedLockers.push(lockerId);
    } else {
      player.tempSelectedLockers = [lockerId];
    }

    this.game.emit('lockerPreview', { playerId, lockerIds: [...player.tempSelectedLockers] });
    return true;
  }

  /**
   * Commit the temporary locker selection.
   */
  confirmLockerSelection(playerId: string): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;
    if (player.tempSelectedLockers.length !== 1) return false;

    const selected = this.selectLockers(playerId, player.tempSelectedLockers);
    if (selected) {
      player.tempSelectedLockers = [];
    }
    return selected;
  }

  /**
   * Finalize the current player's full setup selection in one shot.
   * This acts like a true lock-in and cannot be undone.
   */
  lockInSetup(
    playerId: string,
    selection?: { heroId: HeroId; lockerId: string; startingCardIds: string[] }
  ): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player || player.setupLockedIn) return false;

    if (selection) {
      const heroAvailable = player.availableHeroes.some(hero => hero.id === selection.heroId);
      const lockerAvailable = player.availableLockers.some(locker => locker.id === selection.lockerId);
      const availableCardIds = new Set(player.availableStartingCards.map(card => card.id));
      const hasValidCards = selection.startingCardIds.every(cardId => availableCardIds.has(cardId));
      const hasUniqueCards = new Set(selection.startingCardIds).size === selection.startingCardIds.length;
      if (!heroAvailable || !lockerAvailable || !hasValidCards || !hasUniqueCards) return false;

      player.tempHeroId = selection.heroId;
      player.tempSelectedLockers = [selection.lockerId];
      player.tempSelectedStartingCards = selection.startingCardIds.map(cardId =>
        player.availableStartingCards.find(card => card.id === cardId)
      );
    }

    const heroId = player.tempHeroId ?? player.heroId;
    const lockerId = player.tempSelectedLockers[0];
    if (!heroId || !lockerId || !player.availableLockers.some(locker => locker.id === lockerId)) return false;

    player.setupLockedIn = true;
    this.game.emit('stateChanged');

    const humansReady = this.getHumanPlayers().every(human => human.setupLockedIn);
    if (!humansReady) return true;

    for (const human of this.getHumanPlayers()) {
      if (!human.heroId && human.tempHeroId && !this.selectHero(human.id, human.tempHeroId)) return false;
    }

    for (const human of this.getHumanPlayers()) {
      if (human.availableLockers.length > 0 && human.tempSelectedLockers.length === 1) {
        if (!this.selectLockers(human.id, human.tempSelectedLockers)) return false;
      }
    }

    this.dealInitialCards();
    if (this.phase !== 'card_purchase') this.setPhase('card_purchase');

    for (const human of this.getHumanPlayers()) {
      if (human.availableStartingCards.length === 0) continue;
      const selectedIds = new Set(human.tempSelectedStartingCards.map(card => card.id));
      const cardsToBuy = human.availableStartingCards.filter(card => selectedIds.has(card.id));
      if (!this.finalizeStartingCards(human.id, cardsToBuy)) return false;
    }

    this.checkAllCardsPurchased();
    return true;
  }

  /**
   * Player selects locker cards (choose 1)
   */
selectLockers(playerId: string, lockerIds: string[]): boolean {
  if (lockerIds.length !== 1) return false;
  
  const player = this.game.getPlayerById(playerId);
  if (!player) return false;
  
  const selectedLockers: any[] = [];
  for (const id of lockerIds) {
    const locker = player.availableLockers?.find(l => l.id === id);
    if (!locker) return false;
    selectedLockers.push(locker);
  }
  
  // Apply locker bonuses
  for (const locker of selectedLockers) {
    // Apply starting bonus
    if (locker.startingBonus) {
      const bonus = locker.startingBonus;
      if (bonus.gold) player.gold += bonus.gold;
      if (bonus.sp) player.currSP += bonus.sp;
      if (bonus.np) player.currNP += bonus.np;
      if (bonus.cp) player.currCP += bonus.cp;
      if (bonus.health) player.currHealth += bonus.health;
      if (bonus.gp) player.currGP += bonus.gp;
      if (bonus.drawCards) {
        CardDrawer.drawCards(player, bonus.drawCards);
      }
    }
    
    // Apply locker passive
    applyLockerPassive(locker.id, player, this.game.players);
    
    // Add locker action - pass the actual ActionEffect object
    if (locker.actionId && AllSpecialActions[locker.actionId]) {
      player.actionManager.addAction(AllSpecialActions[locker.actionId]);
    }
    
    // Handle start actions
    if (locker.startAction && locker.startAction !== 'none') {
      player.selectedLockerStartAction = locker.startAction;
      player.pendingStartActions = this.getQueuedStartActions(player);
      this.game.emit('startActionAvailable', {
        playerId: player.id,
        type: locker.startAction,
        description: locker.startActionDescription || `Place a ${locker.startAction}`,
        actions: [...player.pendingStartActions],
        index: 0,
      });
    }
  }
  
  player.availableLockers = [];
    const lockerNames = selectedLockers.map((locker: any) => locker.name).join(', ');
    this.game.emit('lockersSelected', { playerId, lockers: selectedLockers });
    this.game.emit('log', `${player.name} selected locker: ${lockerNames}`);

    this.runBotLockerSelection();
    this.checkAllLockersSelected();
  return true;
}

  // ============================================================
  // INITIAL CARD PURCHASE
  // ============================================================

  /**
   * Deal initial cards to all players (9 cards each) during setup preview.
   * This is intentionally available before a hero is locked so the draft panel can be visible
   * and previewed immediately while the user is still selecting their setup options.
   */
  dealInitialCardsForSetup(): void {
    for (const player of this.game.players) {
      if ((player.availableStartingCards?.length ?? 0) > 0) {
        continue;
      }

      const cards = CardDrawer.drawCards(player, 9, false);
      player.availableStartingCards = cards;
      this.game.emit('startingCardsDealt', { playerId: player.id, cards });
    }
  }

  /**
   * Deal initial cards to all players (9 cards each)
   */
  dealInitialCards(): void {
    let anyCardsDealt = false;

    for (const player of this.game.players) {
      const hasPreviewCards = (player.availableStartingCards?.length ?? 0) > 0;
      if (hasPreviewCards) {
        anyCardsDealt = true;
        continue;
      }

      const heroData = player.heroId ? getHeroData(player.heroId) : null;
      const isSecretary = player.heroId === HeroId.DOROTHY_DECKARD;
      const cards = CardDrawer.drawCards(player, 9, false);

      if (isSecretary) {
        for (const card of cards) {
          player.addCard(card);
        }
        this.game.emit('log', `${player.name} (Secretary) got all 9 starting cards for free!`);
      } else {
        player.availableStartingCards = cards;
        this.game.emit('startingCardsDealt', { playerId: player.id, cards });
      }
    }

    const allPlayersReady = this.game.players.every(player => (player.availableStartingCards?.length ?? 0) > 0);
    if (allPlayersReady) {
      this.setPhase('card_purchase');
      this.game.emit('log', 'Purchase your starting cards (4 gold each).');
    } else if (anyCardsDealt) {
      this.game.emit('log', 'Waiting for all players to finish their starting card selection.');
    }
  }

  /**
   * Player purchases a starting card.
   * Accepts either an array index or the selected card object.
   */
  purchaseStartingCard(playerId: string, cardIndexOrCard: number | { id: string }): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;

    const isSecretary = player.heroId === HeroId.DOROTHY_DECKARD;
    const cost = isSecretary ? 0 : 4;
    const card = typeof cardIndexOrCard === 'number'
      ? player.availableStartingCards?.[cardIndexOrCard]
      : player.availableStartingCards?.find((entry: any) => entry.id === cardIndexOrCard.id);

    if (!card) return false;

    if (!isSecretary && player.gold < cost) {
      this.game.emit('error', 'Not enough gold');
      return false;
    }

    if (!isSecretary) {
      player.spendGold(cost);
    }
    player.addCard(card);

    const cardIndex = player.availableStartingCards.findIndex((entry: any) => entry.id === card.id);
    if (cardIndex >= 0) {
      player.availableStartingCards.splice(cardIndex, 1);
    }

    this.game.emit('stateChanged');
    this.checkAllCardsPurchased();
    return true;
  }

  /**
   * Purchase a batch of starting cards and emit one consolidated log message.
   */
  purchaseStartingCards(playerId: string, cards: Array<number | { id: string }>): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;
    if (!cards.length) return true;

    const isSecretary = player.heroId === HeroId.DOROTHY_DECKARD;
    const resolvedCards = cards
      .map((cardRef) => typeof cardRef === 'number'
        ? player.availableStartingCards?.[cardRef]
        : player.availableStartingCards?.find((entry: any) => entry.id === cardRef.id))
      .filter(Boolean) as any[];

    if (!resolvedCards.length) return false;

    const totalCost = isSecretary ? 0 : resolvedCards.length * 4;
    if (!isSecretary && player.gold < totalCost) {
      this.game.emit('error', 'Not enough gold');
      return false;
    }

    for (const card of resolvedCards) {
      if (!isSecretary) {
        player.spendGold(4);
      }
      player.addCard(card);

      const cardIndex = player.availableStartingCards.findIndex((entry: any) => entry.id === card.id);
      if (cardIndex >= 0) {
        player.availableStartingCards.splice(cardIndex, 1);
      }
    }

    this.game.emit('log', `${player.name} purchased ${resolvedCards.length} card${resolvedCards.length === 1 ? '' : 's'} for ${totalCost} gold`);
    this.game.emit('stateChanged');
    this.checkAllCardsPurchased();
    return true;
  }

  /**
   * Finalize a player’s starting hand. Any selected cards are purchased,
   * all remaining preview cards are discarded, and the phase advances once everybody is done.
   */
  finalizeStartingCards(playerId: string, selectedCards: Array<number | { id: string }> = []): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;
    if (this.phase !== 'card_purchase') {
      this.game.emit('error', 'Finish the setup flow before locking in your starting hand.');
      return false;
    }

    const selected = (selectedCards.length > 0 ? selectedCards : [])
      .map((cardRef) => typeof cardRef === 'number'
        ? player.availableStartingCards?.[cardRef]
        : player.availableStartingCards?.find((entry: any) => entry.id === cardRef.id))
      .filter(Boolean) as any[];

    const selectedIds = new Set(selected.map((card: any) => card.id));
    const remainingCards = [...(player.availableStartingCards || [])].filter((card: any) => !selectedIds.has(card.id));

    const isSecretary = player.heroId === HeroId.DOROTHY_DECKARD;
    const totalCost = isSecretary ? 0 : selected.length * 4;
    if (!isSecretary && player.gold < totalCost) {
      this.game.emit('error', 'Not enough gold to finish the starting hand');
      return false;
    }

    for (const card of selected) {
      if (!isSecretary) {
        player.spendGold(4);
      }
      player.addCard(card);
      const cardIndex = player.availableStartingCards.findIndex((entry: any) => entry.id === card.id);
      if (cardIndex >= 0) {
        player.availableStartingCards.splice(cardIndex, 1);
      }
    }

    for (const card of remainingCards) {
      player.discardCard(card);
    }

    player.availableStartingCards = [];
    (player as any).tempSelectedStartingCards = [];
    (player as any)._selectedStartingCards = [];

    this.game.emit('log', `${player.name} locked in starting hand${selected.length ? ` (${selected.length} selected)` : ''}${remainingCards.length ? ` and skipped ${remainingCards.length} card${remainingCards.length === 1 ? '' : 's'}` : ''}.`);
    this.game.emit('stateChanged');
    this.runBotCardPurchase();
    this.checkAllCardsPurchased();
    return true;
  }

  /**
   * Player skips purchasing remaining starting cards
   */
  skipStartingCards(playerId: string): void {
    const player = this.game.getPlayerById(playerId);
    if (!player) return;
    
    // Discard remaining cards
    if (player.availableStartingCards) {
      for (const card of player.availableStartingCards) {
        player.discardCard(card);
      }
      player.availableStartingCards = [];
    }
    
    this.game.emit('log', `${player.name} skipped remaining starting cards`);
    this.checkAllCardsPurchased();
  }

  // ============================================================
  // PLACEMENT PHASE
  // ============================================================

  /**
   * Start placement phase - players place their heroes
   */
  startPlacementPhase(): void {
    this.currentPlayerIndex = 0;
    this.roundStartingPlayerIndex = 0;
    this.game._roundStartingPlayerIndex = 0;
    this.game._currentPlayerIndex = this.currentPlayerIndex;
    this.spawnInitialZombies();
    this.game.emit('log', 'Place your heroes on the board!');
    this.setPhase('placement');
    if (this.phase === 'placement' && this.currentPlayerIndex === 0) {
      this.game.emit('turnStarted', this.game.getCurrentPlayer());
    }
  }

  /**
   * Queue the hero/locker setup actions to resolve immediately after placement.
   */
  private getQueuedStartActions(player: Player): Array<{ type: 'barricade' | 'bait' | 'trap' | 'zombie'; description: string }> {
    const queue: Array<{ type: 'barricade' | 'bait' | 'trap' | 'zombie'; description: string }> = [];

    const heroData = player.heroId ? getHeroData(player.heroId) : null;
    if (heroData?.startBonus && heroData.startBonus !== 'none') {
      queue.push({
        type: heroData.startBonus,
        description: `${player.name} place a free ${heroData.startBonus}`,
      });
    }

    if (player.selectedLockerStartAction && player.selectedLockerStartAction !== 'none') {
      queue.push({
        type: player.selectedLockerStartAction,
        description: `${player.name} place a free ${player.selectedLockerStartAction}`,
      });
    }

    return queue;
  }

  private emitStartActionPrompt(player: Player): void {
    const next = player.pendingStartActions?.[0];
    if (!next) return;

    const label = next.type.charAt(0).toUpperCase() + next.type.slice(1);
    this.game.emit('log', `Waiting on ${player.name} to place their initial ${next.type}. ${next.description}`);
    this.game.emit('startActionAvailable', {
      playerId: player.id,
      type: next.type,
      description: next.description,
      actions: [...player.pendingStartActions],
      index: 0,
      label,
    });

    if (player.isBot) {
      const targets = this.getStartActionTargets(player, next.type);
      const preferredTarget = targets[0];
      if (preferredTarget) {
        this.resolveStartAction(player.id, preferredTarget);
      }
    }
  }

  private getStartActionTargets(player: Player, type: 'barricade' | 'bait' | 'trap' | 'zombie'): any[] {
    const pos = this.game.board.getPlayerPosition(player);
    if (!pos) return [];

    if (type === 'zombie') {
      return this.game.board.getAllCells().filter((cell: any) => {
        if (cell.isHole || !cell.isEmpty || cell.hasPlayer || cell.hasZombie) return false;
        return true;
      });
    }

    const range = type === 'bait' ? 3 : 2;
    return this.game.board.getAllCells().filter((cell: any) => {
      if (cell.isHole || !cell.isEmpty || cell.hasPlayer || cell.hasZombie) return false;
      const dist = Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y);
      return dist <= range;
    });
  }

  private executeQueuedStartAction(player: Player, type: 'barricade' | 'bait' | 'trap' | 'zombie', target: any): { success: boolean; message: string } {
    const resolvedTarget = target && typeof target === 'object' && 'x' in target && 'y' in target
      ? this.game.board.getCell(Number(target.x), Number(target.y))
      : null;

    if (!resolvedTarget) {
      return { success: false, message: 'Invalid start action target' };
    }

    const validTargets = this.getStartActionTargets(player, type);
    const isValid = validTargets.some((cell: any) => cell.x === resolvedTarget.x && cell.y === resolvedTarget.y);
    if (!isValid) {
      return { success: false, message: `Target is not valid for ${type}` };
    }

    switch (type) {
      case 'barricade': {
        const result = StructurePlacement.placeBarricadeWithEffects(this.game.board, player, resolvedTarget);
        return { success: result.success, message: result.message };
      }
      case 'trap': {
        const result = StructurePlacement.placeTrapWithEffects(this.game.board, player, resolvedTarget);
        return { success: result.success, message: result.message };
      }
      case 'bait': {
        const result = StructurePlacement.placeBaitWithEffects(this.game.board, player, resolvedTarget);
        return { success: result.success, message: result.message };
      }
      case 'zombie': {
        const result = ZombieSpawner.spawnAtTarget(this.game.board, resolvedTarget);
        return { success: result.success, message: result.message };
      }
      default:
        return { success: false, message: 'Unknown start action' };
    }
  }

  public resolveStartAction(playerId: string, target: any): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;

    const pending = player.pendingStartActions?.[0];
    if (!pending) return false;

    const result = this.executeQueuedStartAction(player, pending.type, target);
    if (!result.success) {
      this.game.emit('error', result.message);
      return false;
    }

    player.pendingStartActions.shift();
    this.game.emit('log', `${player.name} resolved a free ${pending.type}: ${result.message}`);

    if (player.pendingStartActions.length > 0) {
      this.emitStartActionPrompt(player);
    } else {
      this.checkAllPlaced();
    }

    return true;
  }

  /**
   * Player places their hero on the board
   */
  placeHero(playerId: string, x: number, y: number): boolean {
    const player = this.game.getPlayerById(playerId);
    if (
      !player ||
      this.game.board.getPlayerPosition(player) ||
      (this.phase === 'placement' && this.game.getCurrentPlayer()?.id !== playerId)
    ) return false;
    
    const cell = this.game.board.getCell(x, y);
    if (!cell || !cell.isEmpty || cell.isHole) return false;
    
    cell.setPlayer(player);
    this.game.emit('heroPlaced', { playerId, x, y });
    this.game.emit('log', `${player.name} placed their hero at (${x}, ${y})`);

    player.pendingStartActions = this.getQueuedStartActions(player);
    if (player.pendingStartActions.length > 0) {
      this.emitStartActionPrompt(player);
      return true;
    }
    
    // Check if all players have placed
    this.checkAllPlaced();
    
    return true;
  }

  // ============================================================
  // PLAYER TURN
  // ============================================================

  /**
   * Start player turn phase
   */
  startPlayerTurn(): void {
    if (this.game.isGameOver()) {
      this.endGame();
      return;
    }

    const playerCount = this.game.players.length;
    let aliveIndex = -1;
    const firstOffset = this.game._generationCount > 0 ? 1 : 0;
    for (let offset = firstOffset; offset < firstOffset + playerCount; offset++) {
      const candidateIndex = (this.roundStartingPlayerIndex + offset) % playerCount;
      if (!this.game.players[candidateIndex]?.isEliminated) {
        aliveIndex = candidateIndex;
        break;
      }
    }
    this.currentPlayerIndex = aliveIndex >= 0 ? aliveIndex : 0;
    this.roundStartingPlayerIndex = this.currentPlayerIndex;
    this.game._roundStartingPlayerIndex = this.currentPlayerIndex;
    this.game._currentPlayerIndex = this.currentPlayerIndex;
    this.activeTurnQueue = this.game.players
      .map((_, offset) => this.game.players[(this.currentPlayerIndex + offset) % this.game.players.length])
      .filter((player) => !player.isEliminated)
      .map((player) => player.id);
    this.deferredTurnQueue = [];

    const currentNight = Math.max(1, (this.game._generationCount ?? 0) + 1);
    for (const player of this.game.players) {
      if (player.isEliminated) continue;
      const playerNight = Math.max(player.actionManager.getCurrentNight(), currentNight);
      player.actionManager.advanceNight(playerNight);
      player.actionManager.setCurrentNight(playerNight);
      player.syncActionCards();
    }

    this.setPhase('player_turn');
    this.actionsUsed = 0;
    this.game._actionsRemaining = this.actionsPerTurn;
    this.game.emit('turnStarted', this.game.getCurrentPlayer());
    this.game.emit('log', `${this.game.getCurrentPlayer()?.name}'s turn! (${this.actionsPerTurn} actions)`);
  }

  /**
   * Player performs an action (move, melee, trap, barricade, bait, card, special action)
   */
  performAction(playerId: string, actionType: string, params: any): boolean {
    if (this.game.isGameOver()) {
      this.endGame();
      return false;
    }
    if (this.game.pendingCardSelection) return false;

    const player = this.game.getPlayerById(playerId);
    if (!player || player.isEliminated || player !== this.game.getCurrentPlayer()) return false;
    if (actionType === 'cancel-card-targeting') {
      if (!this.game.targetingCardId || this.game.targetingPlayerId !== playerId) return false;
      this.game.clearTargetingState();
      this.game.emit('stateChanged');
      return true;
    }
    if (this.actionsUsed >= this.actionsPerTurn) return false;

    const actionCard = player.actionCards.find((card: any) => card.id === actionType || card.cardId === actionType)
      ?? player.hand.cards.find((card: any) => card.__kind === 'special-action' && (card.id === actionType || card.cardId === actionType));
    const handCard = player.hand.cards.find((card: any) => card.id === actionType || card.cardId === actionType);
    const cardKey = handCard?.cardId ?? actionType;

    if (actionCard) {
      const actionId = actionCard._specialActionId;
      const optionIndex = Number(actionCard._specialOptionIndex ?? 0);
      const action = player.actionManager.getAllActions().find((entry: any) => entry.id === actionId)
        ?? AllSpecialActions[actionId];
      if (!action) {
        this.game.emit('error', `Action ${actionId} not found`);
        return false;
      }
      const option = action.options?.[optionIndex];

      const result = player.actionManager.executeOption(player, this.game.board, actionId, optionIndex, params?.target);
      if (result.success) {
        this.recordActionUsed();
        if (option?.attackType === 'melee') this.applyAdrenalineBoost(player);
        this.game.emit('log', result.message);
        this.game.emit('actionUsed', { playerId, actionType: actionId, optionIndex });
        this.game.emit('stateChanged');
        this.checkTurnEnd();
      } else {
        this.game.emit('error', result.message);
      }
      return result.success;
    }

    // Check if action is a card
    const card = CardProcessor.get(cardKey) ?? CardProcessor.get(actionType);
    if (card) {
      // Play card
      const success = this.game.playCard(actionType, player, params?.target);
      if (success) {
        if (this.game.targetingCardId) {
          this.game.emit('stateChanged');
          return true;
        }
        this.recordActionUsed();
        if (actionType === 'melee' || card.attackType === 'melee') this.applyAdrenalineBoost(player);
        this.game.emit('actionUsed', { playerId, actionType });
        this.game.emit('stateChanged');
        this.checkTurnEnd();
      }
      return success;
    }
    
    // Check if action is a special action (from hero/locker/card)
    const specialAction = player.actionManager.getAllActions().find((entry: any) => entry.id === actionType)
      ?? AllSpecialActions[actionType];
    if (specialAction) {
      // Special action (non-dual or dual)
      if (specialAction.isDualOption) {
        // Need to specify which option
        if (params?.optionIndex === undefined) return false;
        const option = specialAction.options[params.optionIndex];
        const result = player.actionManager.executeOption(
          player,
          this.game.board,
          actionType,
          params.optionIndex,
          params?.target
        );
        if (result.success) {
          this.recordActionUsed();
          if (option?.attackType === 'melee') this.applyAdrenalineBoost(player);
          this.game.emit('log', result.message);
          this.game.emit('actionUsed', { playerId, actionType });
          this.game.emit('stateChanged');
          this.checkTurnEnd();
        } else {
          this.game.emit('error', result.message);
        }
        return result.success;
      } else {
        // Single option action
        const option = specialAction.options[0];
        const result = player.actionManager.executeOption(
          player,
          this.game.board,
          actionType,
          0,
          params?.target
        );
        if (result.success) {
          this.recordActionUsed();
          if (option?.attackType === 'melee') this.applyAdrenalineBoost(player);
          this.game.emit('log', result.message);
          this.game.emit('actionUsed', { playerId, actionType });
          this.game.emit('stateChanged');
          this.checkTurnEnd();
        } else {
          this.game.emit('error', result.message);
        }
        return result.success;
      }
    }
    
    // Check if it's a standard action (move, melee, trap, barricade, bait)
    const standardActions = ['move', 'melee', 'trap', 'barricade', 'bait'];
    if (standardActions.includes(actionType)) {
      // Delegate to ActionHandlers (via Game)
      const success = this.game.executeAction(actionType, params);
      if (success) {
        this.recordActionUsed();
        if (actionType === 'melee') this.applyAdrenalineBoost(player);
        this.game.emit('actionUsed', { playerId, actionType });
        this.game.emit('stateChanged');
        this.checkTurnEnd();
      }
      return success;
    }
    
    this.game.emit('error', `Unknown action: ${actionType}`);
    return false;
  }

  /** Pass permanently for the current night. */
  passTurn(playerId: string): boolean {
    if (this.game.pendingCardSelection) return false;
    if (this.game.isGameOver()) {
      this.endGame();
      return false;
    }

    const player = this.game.getPlayerById(playerId);
    if (!player || player.isEliminated || player !== this.game.getCurrentPlayer()) return false;

    this.game.emit('log', `${player.name} passed.`);
    this.finishCurrentTurn(player, false);
    return true;
  }

  /** Defer after two actions to take another turn later this night. */
  deferTurn(playerId: string): boolean {
    if (this.game.pendingCardSelection) return false;
    const player = this.game.getPlayerById(playerId);
    if (
      !player ||
      player.isEliminated ||
      player !== this.game.getCurrentPlayer() ||
      this.actionsUsed !== this.actionsPerTurn - 1
    ) return false;

    this.game.emit('log', `${player.name} deferred their turn.`);
    this.finishCurrentTurn(player, true);
    return true;
  }

  private finishCurrentTurn(player: Player, defer: boolean): void {
    if (this.activeTurnQueue[0] !== player.id) return;

    this.activeTurnQueue.shift();
    if (defer && !this.deferredTurnQueue.includes(player.id)) {
      this.deferredTurnQueue.push(player.id);
    }
    this.advanceTurnQueue();
  }

  private advanceTurnQueue(): void {
    const isAlive = (playerId: string) => {
      const player = this.game.getPlayerById(playerId);
      return !!player && !player.isEliminated;
    };

    this.activeTurnQueue = this.activeTurnQueue.filter(isAlive);
    this.deferredTurnQueue = this.deferredTurnQueue.filter(isAlive);

    if (this.activeTurnQueue.length === 0) {
      if (this.deferredTurnQueue.length === 0) {
        this.game._actionsRemaining = 0;
        this.endPlayerTurn();
        this.game.emit('stateChanged');
        return;
      }

      this.activeTurnQueue = this.deferredTurnQueue;
      this.deferredTurnQueue = [];
    }

    const nextPlayer = this.game.getPlayerById(this.activeTurnQueue[0]);
    if (!nextPlayer) return;

    this.currentPlayerIndex = this.game.players.indexOf(nextPlayer);
    this.game._currentPlayerIndex = this.currentPlayerIndex;
    this.actionsUsed = 0;
    this.game._actionsRemaining = this.actionsPerTurn;
    this.game.emit('turnStarted', nextPlayer);
    this.game.emit('stateChanged');
    this.game.emit('log', `${nextPlayer.name}'s turn!`);
  }

  private recordActionUsed(): void {
    this.actionsUsed++;
    this.game._actionsRemaining = Math.max(0, this.actionsPerTurn - this.actionsUsed);
  }

  private applyAdrenalineBoost(player: Player): void {
    this.actionsUsed = 0;
    this.game._actionsRemaining = this.actionsPerTurn;
    this.game.emit('log', `${player.name}'s adrenaline restored all ${this.actionsPerTurn} actions.`);
  }

  /** Automatically defer after using all three actions in a turn. */
  private checkTurnEnd(): void {
    if (this.actionsUsed >= this.actionsPerTurn) {
      const player = this.game.getCurrentPlayer();
      if (!player) return;
      this.game.emit('log', `${player.name} used all actions and deferred.`);
      this.finishCurrentTurn(player, true);
    }
  }

  /**
   * End player turn phase - proceed to zombie phase
   */
  private endPlayerTurn(): void {
    this.game.emit('log', 'All players have passed. Zombie movement phase started...');
    this.game.runZombiePhase({
      async: true,
      stepDelayMs: 120,
      onComplete: () => {
        this.afterZombiePhase();
        if (this.game.isGameOver()) {
          this.endGame();
          return;
        }
        this.setPhase('zombie_phase');
        this.game.emit('log', 'Zombie movement resolved. The nightly draft is ready to begin.');
      },
    });
  }

  // ============================================================
  // DRAFT PHASE
  // ============================================================

  /**
   * Start draft phase (4 cards dealt to each player)
   */
  private dealDraftOffer(player: Player, size: number = 4): void {
    const staleCards = [...(player.draftCards ?? [])];
    for (const stale of staleCards) {
      player.discardCard(stale);
    }

    const nextOffer: any[] = [];
    while (nextOffer.length < size) {
      const replacement = this.game.cardManager?.drawGameCard();
      if (!replacement) break;
      nextOffer.push(replacement);
    }

    player.draftCards = nextOffer;
    this.game.emit('draftCardsDealt', { playerId: player.id, cards: player.draftCards });
  }

  startDraftPhase(): void {
    if (this.game.isGameOver()) {
      this.endGame();
      return;
    }

    this.setPhase('draft');
    this.game.emit('log', 'Draft phase! 4 cards available.');

    for (const player of this.game.players) {
      if (player.isEliminated) continue;

      if (player.isBot && (player.draftCards?.length ?? 0) > 0) {
        this.game.emit('draftCardsDealt', { playerId: player.id, cards: player.draftCards });
      } else {
        this.dealDraftOffer(player, 4);
      }
    }

    this.runBotDraft();
    this.game.emit('draftStarted');
  }

  private runBotDraft(): void {
    if (this.phase !== 'draft') return;

    for (const player of this.game.players) {
      if (!(player as any).isBot || player.isEliminated) continue;

      let draftPasses = 0;
      while ((player.draftCards?.length ?? 0) > 0 && draftPasses < 8) {
        const affordableCards = [...(player.draftCards ?? [])].filter((card: any) => {
          const cost = Math.max(0, 4 - (player.cardPurchaseDiscount || 0));
          return player.gold >= cost;
        });

        if (!affordableCards.length) {
          this.skipDraft(player.id);
          break;
        }

        const chosenCard = affordableCards
          .sort((a: any, b: any) => Number(b.cost ?? 0) - Number(a.cost ?? 0))[0];

        const purchased = this.purchaseDraftCard(player.id, chosenCard);
        if (!purchased) {
          this.skipDraft(player.id);
          break;
        }

        draftPasses++;
        if (this.phase !== 'draft') break;
      }

      if (this.phase !== 'draft') break;
    }
  }

  beginNightlyDraft(): void {
    if (this.game.isGameOver()) {
      this.endGame();
      return;
    }

    const currentPhase = this.getPhase();
    if (currentPhase !== 'zombie_phase') return;
    if (this.game.hasActiveEscapeState()) {
      this.game.emit('log', 'Resolve the trapped escape state before the nightly draft can begin.');
      return;
    }
    if (this.game.getPendingFlexPointSelections().length > 0) {
      this.game.emit('log', 'Resolve outstanding flex-point choices before starting the nightly draft.');
      this.game.resolvePendingFlexPoints(false);
      return;
    }
    this.resolvePendingFlexPoints();
    this.startDraftPhase();
  }

  resolvePendingFlexPoints(): void {
    this.game.resolvePendingFlexPoints(false);
  }

  selectFlexPointChoice(playerId: string, choice: 'NP' | 'CP'): boolean {
    return this.game.selectFlexPointChoice(playerId, choice);
  }

  /**
   * Player purchases a draft card.
   * Accepts either a numeric index or the selected card object.
   */
  purchaseDraftCard(playerId: string, cardIndexOrCard: number | { id: string } | any[]): boolean {
    const player = this.game.getPlayerById(playerId);
    if (!player) return false;

    const selectedCards = Array.isArray(cardIndexOrCard) ? cardIndexOrCard : [cardIndexOrCard];
    const chosen = selectedCards.length > 0
      ? (typeof selectedCards[0] === 'number'
          ? player.draftCards?.[selectedCards[0]]
          : selectedCards[0])
      : null;

    if (!chosen) return false;

    const cardsToBuy = Array.isArray(cardIndexOrCard)
      ? selectedCards.filter((entry: any) => !!entry)
      : [chosen];

    const totalCost = cardsToBuy.reduce((sum: number, item: any) => {
      const card = typeof item === 'number' ? player.draftCards?.[item] : item;
      if (!card) return sum;
      const cost = 4;
      const discount = player.cardPurchaseDiscount || 0;
      return sum + Math.max(0, cost - discount);
    }, 0);

    if (player.gold < totalCost) {
      this.game.emit('error', 'Not enough gold');
      return false;
    }

    const purchasedIds = new Set<string>();
    for (const item of cardsToBuy) {
      const card = typeof item === 'number' ? player.draftCards?.[item] : player.draftCards?.find((entry: any) => entry.id === item.id);
      if (!card) continue;
      player.spendGold(Math.max(0, 4 - (player.cardPurchaseDiscount || 0)));
      player.addCard(card);
      purchasedIds.add(card.id);
      const removalIndex = player.draftCards.findIndex((entry: any) => entry.id === card.id);
      if (removalIndex >= 0) {
        player.draftCards.splice(removalIndex, 1);
      }
    }

    const shouldFinalizeHumanDraft = !player.isBot;
    if (shouldFinalizeHumanDraft) {
      const remainingToDiscard = [...player.draftCards.filter((entry: any) => !purchasedIds.has(entry.id))];
      for (const card of remainingToDiscard) {
        player.discardCard(card);
      }

      player.draftCards = [];
      this.game.emit('draftCardsDealt', { playerId: player.id, cards: [] });
    } else {
      const remainingToDiscard = [...player.draftCards.filter((entry: any) => !purchasedIds.has(entry.id))];
      for (const card of remainingToDiscard) {
        player.discardCard(card);
      }

      // Bot draft resolution should consume the current offer and stop instead of
      // regenerating a stale replacement pile that keeps the draft window open.
      player.draftCards = player.draftCards.filter((entry: any) => purchasedIds.has(entry.id));
      this.game.emit('draftCardsDealt', { playerId: player.id, cards: player.draftCards });
    }

    this.game.emit('log', `${player.name} purchased ${cardsToBuy.length} draft card${cardsToBuy.length === 1 ? '' : 's'} for ${totalCost} gold`);
    this.game.emit('stateChanged');

    this.checkDraftComplete();
    return true;
  }

  /**
   * Player skips draft purchase
   */
  skipDraft(playerId: string): void {
    const player = this.game.getPlayerById(playerId);
    if (!player) return;
    
    if (player.draftCards) {
      for (const card of player.draftCards) {
        player.discardCard(card);
      }
      player.draftCards = [];
    }
    
    this.game.emit('log', `${player.name} skipped draft.`);
    this.checkDraftComplete();
  }

  /**
   * Check if all players have completed draft
   */
  advanceActionNight(): void {
    const nextNight = Math.max(
      (this.game._generationCount ?? 0) + 1,
      ...this.game.players
        .filter((player) => !player.isEliminated)
        .map((player) => player.actionManager.getCurrentNight() + 1)
    );

    for (const player of this.game.players) {
      if (player.isEliminated) continue;
      player.actionManager.advanceNight(nextNight);
      player.actionManager.setCurrentNight(nextNight);
      player.syncActionCards();
    }
  }

  private checkDraftComplete(): void {
    const allDone = this.game.players.every(p => 
      p.isEliminated || !p.draftCards || p.draftCards.length === 0
    );
    
    if (allDone) {
      this.game.emit('draftComplete');
      
      // Reset for next turn
      for (const player of this.game.players) {
        if (!player.isEliminated) {
          player.actionManager.reset();
        }
      }
      this.advanceActionNight();
      
      // Start next player turn
      this.startPlayerTurn();
    }
  }

  // ============================================================
  // ZOMBIE PHASE COMPLETION
  // ============================================================

  /**
   * Called after zombie phase - award round income and handle survivors.
   */
  afterZombiePhase(): void {
    for (const player of this.game.players) {
      if (player.isEliminated) continue;

      player.addSPs(1);
      this.game.emit('log', `${player.name} survived the zombie phase and gained 1 SP.`);

      const income = player.currSP + (player.currGP ?? 0);
      if (income > 0) {
        player.addGold(income);
        this.game.emit('log', `${player.name} gained ${income} gold from SP + GP income.`);
      }
    }

    this.spawnNightZombies();

    if (this.game.isGameOver()) {
      this.endGame();
      return;
    }
  }

  /**
   * Award the end-of-round gold income to all living players.
   */
  awardRoundIncome(): void {
    for (const player of this.game.players) {
      if (player.isEliminated) continue;
      const income = player.currSP + (player.currGP ?? 0);
      if (income > 0) {
        player.addGold(income);
        this.game.emit('log', `${player.name} received ${income} gold from round income.`);
      }
    }
  }

  /**
   * Spawn additional zombies (total players SP  / 15)
   */
  private spawnNightZombies(): void {
    this.game.ensureZombieManager();

    const alivePlayers = this.game.players.filter(p => !p.isEliminated);
    const spawnCount = Math.max(1, Math.floor(alivePlayers.reduce((sum, player) => sum + player.currSP, 0) / 15));

    let spawned = 0;
    for (let i = 0; i < spawnCount; i++) {
      const result = this.game.zombieManager?.spawnZombieRandom() ?? { success: false, message: 'No zombie manager' };
      if (result.success) spawned++;
    }

    if (spawned > 0) {
      this.game.emit('log', `Spawned ${spawned} new zombies.`);
    }
  }

  private spawnInitialZombies(): void {
    if (this.game.board.getAllZombies().length > 0) return;

    this.game.ensureZombieManager();

    const alivePlayers = this.game.players.filter(p => !p.isEliminated);
    const spawnCount = Math.max(1, Math.floor(alivePlayers.reduce((sum, player) => sum + player.currSP, 0) / 15));

    let spawned = 0;
    for (let i = 0; i < spawnCount; i++) {
      const result = this.game.zombieManager?.spawnZombieRandom() ?? { success: false, message: 'No zombie manager' };
      if (result.success) spawned++;
    }

    if (spawned > 0) {
      this.game.emit('log', `Initial zombie wave: ${spawned} zombies spawned.`);
    } else {
      const fallback = this.game.zombieManager?.spawnZombieRandom() ?? { success: false, message: 'No zombie manager' };
      if (fallback.success) {
        this.game.emit('log', 'Initial zombie wave: 1 zombie spawned.');
      }
    }
  }

  // ============================================================
  // GAME OVER
  // ============================================================

  private endGame(): void {
    this.setPhase('game_over');

    const finalScores = this.game.getFinalScores();
    const winner = finalScores[0] ?? null;
    const winnerPlayer = winner ? this.game.getPlayerById(winner.playerId) ?? null : null;

    if (winnerPlayer) {
      winnerPlayer.addSPs(5);
      this.game.emit('log', `${winnerPlayer.name} survived the longest! Bonus 5 SP!`);
    }

    this.game.emit('gameOver', {
      winner: winnerPlayer,
      winnerId: winnerPlayer?.id ?? null,
      finalScores,
      rank: finalScores,
    });
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private runBotHeroSelection(): void {
    if (this.phase !== 'hero_selection') return;

    let progressed = false;
    for (const player of this.game.players) {
      if (!player.isBot || player.heroId) continue;
      const heroOptions = player.availableHeroes ?? [];
      if (!heroOptions.length) continue;
      const chosen = heroOptions[Math.floor(Math.random() * heroOptions.length)];
      this.setTemporaryHeroSelection(player.id, chosen.id);
      this.confirmHeroSelection(player.id);
      progressed = true;
    }

    if (progressed) {
      this.checkAllHeroesSelected();
      this.runBotLockerSelection();
    }
  }

  private runBotLockerSelection(): void {
    if (this.phase !== 'locker_selection' && this.phase !== 'hero_selection') return;

    let progressed = false;
    for (const player of this.game.players) {
      if (!player.isBot || !player.heroId || !player.availableLockers?.length) continue;
      const lockers = player.availableLockers ?? [];
      if (!lockers.length) continue;
      const chosen = lockers[Math.floor(Math.random() * lockers.length)];
      this.setTemporaryLockerSelection(player.id, chosen.id);
      this.confirmLockerSelection(player.id);
      progressed = true;
    }

    if (progressed) {
      this.checkAllLockersSelected();
      this.runBotCardPurchase();
    }
  }

  private runBotCardPurchase(): void {
    if (this.phase !== 'card_purchase' && this.phase !== 'locker_selection' && this.phase !== 'hero_selection') return;

    let progressed = false;
    for (const player of this.game.players) {
      if (!player.isBot || !player.heroId || player.availableLockers?.length !== 0 || !player.availableStartingCards?.length) continue;

      progressed = true;
      const isSecretary = player.heroId === HeroId.DOROTHY_DECKARD;
      if (isSecretary) {
        this.finalizeStartingCards(player.id, [...player.availableStartingCards]);
        continue;
      }

      const evaluator = new (require('../board/BoardEvaluator').BoardEvaluator)(this.game.board, this.game.players, this.game.generationCount || 0);
      const scored = [...player.availableStartingCards].map((card: any) => {
        const cardId = card.cardId ?? card.id;
        const cardDef = CardProcessor.get(cardId) ?? (card as any);
        const baseCost = Math.max(0, Number(card.cost ?? cardDef?.cost ?? 4) || 4);
        let expectedValue = baseCost * 1.5;

        try {
          if (cardDef && typeof cardDef.expectedValue === 'function') {
            expectedValue = cardDef.expectedValue(player, this.game.board, evaluator, null);
          }
        } catch (error) {
          expectedValue = baseCost * 1.5;
        }

        return { card, expectedValue, cost: baseCost };
      }).sort((a, b) => b.expectedValue - a.expectedValue || b.cost - a.cost);

      const selected: any[] = [];
      let remainingGold = player.gold;
      for (const entry of scored) {
        const purchasePrice = Math.max(0, entry.cost || 4);
        if (purchasePrice === 0 || remainingGold < purchasePrice) continue;
        if (entry.expectedValue <= purchasePrice * 0.8) continue;
        selected.push(entry.card);
        remainingGold -= purchasePrice;
      }

      this.finalizeStartingCards(player.id, selected);
    }

    if (progressed) {
      this.checkAllCardsPurchased();
    }
  }

  private runBotPlacement(): void {
    const player = this.game.getCurrentPlayer();
    if (!player?.isBot || this.game.board.getPlayerPosition(player)) return;

    const validCells = this.game.board.getAllCells().filter(cell => {
      if (cell.isHole || !cell.isEmpty || cell.hasPlayer || cell.hasZombie) return false;
      return true;
    });

    if (!validCells.length) return;

    const chosen = validCells[Math.floor(Math.random() * validCells.length)];
    this.placeHero(player.id, chosen.x, chosen.y);
  }

  private getHumanPlayers(): Player[] {
    return this.game.players.filter(player => !player.isBot);
  }

  private getBotPlayers(): Player[] {
    return this.game.players.filter(player => player.isBot);
  }

  private advanceSetupIfReady(): boolean {
    const allHeroesChosen = this.game.players.every(player => player.heroId !== null);
    const allLockersChosen = this.game.players.every(player => (player.availableLockers?.length ?? 0) === 0);
    const allCardsLocked = this.game.players.every(player => (player.availableStartingCards?.length ?? 0) === 0);

    if (this.phase === 'hero_selection' && allHeroesChosen) {
      this.setPhase('locker_selection');
      return true;
    }

    if (this.phase === 'locker_selection' && allLockersChosen) {
      this.dealInitialCards();
      return true;
    }

    if (this.phase === 'card_purchase' && allCardsLocked) {
      this.startPlacementPhase();
      return true;
    }

    return false;
  }

  private checkAllHeroesSelected(): void {
    const humans = this.getHumanPlayers();
    const bots = this.getBotPlayers();
    const humansReady = humans.length === 0 || humans.every(player => player.heroId !== null);
    const botsReady = bots.length === 0 || bots.every(player => player.heroId !== null);

    if (humansReady && botsReady) {
      this.game.emit('allHeroesSelected');
      this.advanceSetupIfReady();
      return;
    }
  }

  private checkAllLockersSelected(): void {
    const humans = this.getHumanPlayers();
    const bots = this.getBotPlayers();
    const humansReady = humans.length === 0 || humans.every(player => (player.availableLockers?.length ?? 0) === 0);
    const botsReady = bots.length === 0 || bots.every(player => (player.availableLockers?.length ?? 0) === 0);

    if (humansReady && botsReady) {
      this.game.emit('allLockersSelected');
      this.advanceSetupIfReady();
      return;
    }
  }

  private checkAllCardsPurchased(): void {
    const humans = this.getHumanPlayers();
    const bots = this.getBotPlayers();
    const humansReady = humans.length === 0 || humans.every(player => (player.availableStartingCards?.length ?? 0) === 0);
    const botsReady = bots.length === 0 || bots.every(player => (player.availableStartingCards?.length ?? 0) === 0);

    if (humansReady && botsReady) {
      this.game.emit('allCardsPurchased');
      this.advanceSetupIfReady();
      return;
    }
  }

  private checkAllPlaced(): void {
    const allPlaced = this.game.players.every(player => this.game.board.getPlayerPosition(player) !== null);
    if (allPlaced) {
      this.game.emit('allHeroesPlaced');
      this.startPlayerTurn();
      return;
    }

    if (this.phase !== 'placement') return;

    for (let offset = 1; offset <= this.game.players.length; offset++) {
      const nextIndex = (this.currentPlayerIndex + offset) % this.game.players.length;
      const nextPlayer = this.game.players[nextIndex];
      if (this.game.board.getPlayerPosition(nextPlayer)) continue;

      this.currentPlayerIndex = nextIndex;
      this.game._currentPlayerIndex = nextIndex;
      this.game.emit('log', `${nextPlayer.name}'s placement turn.`);
      this.game.emit('turnStarted', nextPlayer);
      if (nextPlayer.isBot) this.runBotPlacement();
      return;
    }
  }

  private getHeroActions(heroId: HeroId): { actionN: string; actionC: string } | null {
    const heroData = getHeroData(heroId);
    if (!heroData) return null;

    const heroAction = AllSpecialActions[heroId];
    if (heroAction) {
      return { actionN: heroAction.options[0]?.id ?? heroData.actionN, actionC: heroAction.options[1]?.id ?? heroData.actionC };
    }

    return { actionN: heroData.actionN, actionC: heroData.actionC };
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // ============================================================
  // GETTERS
  // ============================================================

  getPhase(): GamePhase {
    const livePhase = (this.game as any)._phase;
    const validPhases: GamePhase[] = [
      'setup',
      'hero_selection',
      'locker_selection',
      'card_purchase',
      'placement',
      'player_turn',
      'zombie_phase',
      'draft',
      'game_over',
    ];

    if (typeof livePhase === 'string' && validPhases.includes(livePhase as GamePhase)) {
      this.phase = livePhase as GamePhase;
      return this.phase;
    }

    return this.phase;
  }
  getCurrentPlayer(): Player | null { return this.game.getCurrentPlayer(); }
  getActionsRemaining(): number { return this.actionsPerTurn - this.actionsUsed; }
  getActionsUsed(): number { return this.actionsUsed; }
}