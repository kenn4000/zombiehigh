import { ActionManager, HeroId } from '../index' 
import { EventType, StructureDestroyedEvent, ZombieKilledEvent, StructurePlacedEvent } from '../misc/EventManager';

const ACTION_CARD_IMAGE_BY_OPTION: Record<string, string> = {
  nurse_heal: 'nurse_n_action.jpg',
  nurse_spawn: 'nurse_c_action.jpg',
  barry_destroy_own: 'football_n_action.jpg',
  barry_destroy_opponent: 'football_c_action.jpg',
  janitor_lose_sp: 'janitor_n_action.jpg',
  janitor_place_bait: 'janitor_c_action.jpg',
  von_trap_explode: 'cheerleader_n_action.jpg',
  von_trap_move: 'cheerleader_c_action.jpg',
  bully_melee: 'bully_n_action.jpg',
  bully_spawn: 'bully_c_action.jpg',
  track_jump: 'runner_n_action.jpg',
  track_move_opponent: 'runner_c_action.jpg',
  bungler_super_melee: 'teacher_n_action.jpg',
  bungler_move_trap: 'teacher_c_action.jpg',
  nerd_barricade_gold: 'nerd_n_action.jpg',
  nerd_replace_barricade: 'nerd_c_action.jpg',
  lunch_lady_solo: 'lunch_lady_n_action.jpg',
  lunch_lady_steal: 'lunch_lady_c_action.jpg',
  principal_safe: 'principal_n_action.jpg',
  principal_spawn: 'principal_c_action.jpg',
  secretary_draw_give: 'secretary_n_action.jpg',
  secretary_discard_draw: 'secretary_c_action.jpg',
  coach_gym_kill: 'coach_n_action.jpg',
  coach_kick_down: 'coach_c_action.jpg',
  cool_sp: 'cool_for_sale_sp_action.jpg',
  cool_gold: 'cool_for_sale_gold_action.jpg',
  hugs_np: 'hug_opponent_action.jpg',
  hugs_cp: 'hug_zombie_action.jpg',
  nice_sp: 'nice_for_sale_sp_action.jpg',
  nice_gold: 'nice_for_sale_gold_action.jpg',
  ouija_np: 'ouija_board_n_action.jpg',
  ouija_cp: 'ouija_board_c_action.jpg',
  printed_walls_place: 'print_walls_action.jpg',
  bait_launcher_place: 'bait_launch_action.jpg',
  confident_step_move: 'first_step_action.jpg',
  gymnastics_jump: 'gymnastics_training_action.jpg',
  grappling_hook_jump: 'grappling_hook_action.jpg',
  long_sleeves_draw: 'long_sleeves_action.jpg',
  pyramid_scheme_discard: 'pyramid_scheme_action.jpg',
  shoes_move: 'shoes.jpg',
};

const ACTION_CARD_IMAGE_KIND_BY_OPTION: Record<string, 'action' | 'locker'> = {
  shoes_move: 'locker',
};

export class Player {
  // ===== IDENTITY =====
  public readonly id: string;
  public readonly name: string;
  public isBot: boolean = false;
  public color: string;
  public heroId: HeroId | null = null;

  // ===== RESOURCES =====
  public gold: number = 3;
  public currSP: number = 0;
  public currNP: number = 0;
  public currCP: number = 0;
  public currGP: number = 0;
  public currHealth: number = 3;

  // ===== BASE STATS =====
  public rawBarricadeSuccessRate: number = 3;
  public rawTrapSuccessRate: number = 3;
  public rawMeleeSuccessRate: number = 3;
  public barricadeLimit: number = 3;
  public trapLimit: number = 2;

  // ===== PASSIVE MODIFIERS (from cards/effects) =====
  public cardPurchaseDiscount: number = 0;
  public cardPlayDiscount: number = 0;
  public meleeDiscount: number = 0;
  public trapDiscount: number = 0;
  public baitDiscount: number = 0;
  public barricadeDiscount: number = 0;
  public movementDiscount: number = 0;
  public meleeEffectivenessBoost: number = 0;
  public trapEffectivenessBoost: number = 0;
  public barricadeEffectivenessBoost: number = 0;
  public baitRadiusBoost: number = 0;
  public barricadeLimitBoost: number = 0;
  public trapLimitBoost: number = 0;
  public barricadeCrossDiscount: number=0;
  
  //  passive flags
  public meleeKillDraw: boolean = false;
  public baitGlobalRefund: boolean=false;
  public dogTagsActive: boolean = false;
  public leatherJacketActive: boolean = false;
  public rollerBackpackActive: boolean = false;
  public freeHugsActive: boolean = false;
  public childsToolSetActive: boolean = false;
  public barricadeCrossRefund: boolean=false;
  public emergencyRetreat: boolean = false;
  public gymMovementDiscount: boolean =false;
  public nongymMovementDiscount: boolean =false;
  public CPmustNP: boolean=false;
  public NPmustCP: boolean=false;
  public healthGivesSP: boolean=false;
  

  // ===== CARDS =====
  public hand: { cards: any[]; unplayableCards: any[]; playedCards: any[] } = {
    cards: [],
    unplayableCards: [],
    playedCards: []
  };
  public actionCards: any[] = [];
  public discardPile: any[] = [];
  public tempHand: any[] = [];
  public tempKeepCount: number = 0;
  public actionManager: ActionManager = new ActionManager();   
  public availableHeroes: any[] = [];
  public availableLockers: any[] = [];
  public availableStartingCards: any[] = [];
  public draftCards: any[] = [];
  public tempHeroId: HeroId | null = null;
  public tempSelectedLockers: string[] = [];
  public tempSelectedStartingCards: any[] = [];
  public setupLockedIn: boolean = false;
  public selectedLockerStartAction: 'barricade' | 'bait' | 'trap' | 'zombie' | 'none' | null = null;
  public pendingStartActions: Array<{ type: 'barricade' | 'bait' | 'trap' | 'zombie'; description: string }> = [];
  public tempTargetPlayer: Player | null = null;
  public tempCallback: string = '';

  // ===== STATUS =====
  public isEliminated: boolean = false;
  _passiveHandlers?: Array<{
    event: EventType;
    handler: (data: any) => void;
  }>= [];

  // ===== ACTION MODIFIERS (temp per turn) =====
  public freeMoves: number = 0;
  public discountNextCard: boolean = false;

  constructor(id: string, name?: string | HeroId | null, heroId: HeroId | null = null) {
    if (arguments.length === 1) {
      this.id = id;
      this.name = id;
      this.heroId = null;
    } else if (typeof name === 'string') {
      this.id = id;
      this.name = name;
      this.heroId = heroId ?? null;
    } else {
      this.id = id;
      this.name = id;
      this.heroId = (name as HeroId | null) ?? null;
    }

    this.color = 'default';
    this._passiveHandlers = [];
    this.actionManager.bindPlayer(this);
  }

  // ===== RESOURCE METHODS =====

  addGold(amount: number): void {
    this.gold += amount;
  }

  spendGold(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }
  

  addGPs(amount: number): void {
    this.currGP += amount;
  }
 loseGPs(amount: number): void {
    this.currGP -= amount;
  }

  addSPs(amount: number): void {
    this.currSP += amount;
  }
 loseSPs(amount: number): void {
    this.currSP -= amount;
  }
  addNPs(amount: number): void {
    const gain = Math.max(0, amount);
    if (this.NPmustCP && gain > 0) {
      const cost = gain * 2;
      if (this.gold >= cost) {
        this.spendGold(cost);
      }
      this.currCP += gain;
    }
    this.currNP += gain;
    if (this.rollerBackpackActive && gain > 0) {
      this.addGold(2);
    }
  }
loseNPs(amount: number): void {
    this.currNP -= amount;
  }
  addCPs(amount: number): void {
    const gain = Math.max(0, amount);
    if (this.CPmustNP && gain > 0) {
      const cost = gain * 2;
      if (this.gold >= cost) {
        this.spendGold(cost);
      }
      this.currNP += gain;
    }
    this.currCP += gain;
    if (this.leatherJacketActive && gain > 0) {
      this.addGold(2);
    }
  }
loseCPs(amount: number): void {
    this.currCP -= amount;
  }
  addHealths(amount: number): void {
    this.currHealth += amount;
  }
loseHealths(amount: number): void {
  this.currHealth = Math.max(0, this.currHealth - amount);
  if (this.currHealth <= 0) {
    this.isEliminated = true;
  }
}

  getHealthValue(night: number): number {
    const healthScarcity = Math.max(1, 4 - (this.currHealth || 3));
    const nightBonus = 1 + (night / 8);
    return 5 * healthScarcity * nightBonus;
  }

  // ===== COST METHODS =====

  canAfford(amount: number): boolean {
    return this.gold >= amount;
  }

  canAffordCard(amount: number): boolean {
    const finalCost = Math.max(0, amount - this.cardPlayDiscount);
    return this.gold >= finalCost;
  }

  spendCard(amount: number): boolean {
    const finalCost = Math.max(0, amount - this.cardPlayDiscount);
    if (this.gold < finalCost) return false;
    this.gold -= finalCost;
    return true;
  }

  costCard(amount: number): number {
    const finalCost = Math.max(0, amount - this.cardPlayDiscount);
    return finalCost;
  }
  // ===== EFFECTIVENESS GETTERS =====

  getTrapEffectiveness(): number {
    let temp = this.rawTrapSuccessRate + this.trapEffectivenessBoost;
    return Math.max(1, Math.min(6, temp));
  }

  getBarricadeEffectiveness(): number {
    let temp = this.rawBarricadeSuccessRate + this.barricadeEffectivenessBoost;
    return Math.max(1, Math.min(6, temp));
  }

  getMeleeEffectiveness(): number {
    let temp = this.rawMeleeSuccessRate + this.meleeEffectivenessBoost;
    return Math.max(1, Math.min(6, temp));
  }

  getTrapCost(): number {
    return Math.max(0, 10 - this.trapDiscount);
  }

  getBarricadeCost(): number {
    return Math.max(0, 12 - this.barricadeDiscount);
  }

  getObstacleJumpToll(): number {
    return Math.max(0, 2 - this.barricadeCrossDiscount);
  }

  getObstacleJumpRefund(): number {
    return this.barricadeCrossRefund ? 2 : 0;
  }

  getBaitCost(): number {
    return Math.max(0, 5 - this.baitDiscount);
  }

  getMeleeCost(): number {
    return Math.max(0, 8 - this.meleeDiscount);
  }

  getMovementCost(board?: any, target?: any): number {
    let discount = this.movementDiscount || 0;
    const pos = board ? board.getPlayerPosition(this) : null;
    const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : null;
    const targetRoomId = target && board ? board.getCell(target.x, target.y)?.roomId : roomId;

    if (this.gymMovementDiscount && roomId === 'Gymnasium' && targetRoomId === 'Gymnasium') {
      discount += 1;
    }
    if (this.nongymMovementDiscount && roomId !== 'Gymnasium' && targetRoomId !== 'Gymnasium') {
      discount += 1;
    }

    return Math.max(0, 3 - discount);
  }

  getTrapLimit(): number {
    return Math.max(1, this.trapLimit + this.trapLimitBoost);
  }

  getBarricadeLimit(): number {
    return Math.max(1, this.barricadeLimit + this.barricadeLimitBoost);
  }

  getBaitRadius(): number {
    return 3 + this.baitRadiusBoost;
  }

  // ===== CARD METHODS =====

  addCard(card: any): void {
    this.hand.cards.push(card);
  }

  removeCard(cardId: string): any | false {
    const normalized = String(cardId);
    const index = this.hand.cards.findIndex((card: any) => {
      if (!card) return false;
      return String(card.id) === normalized || String(card.cardId) === normalized;
    });
    if (index === -1) return false;
    const [removed] = this.hand.cards.splice(index, 1);
    return removed;
  }

  moveCardToPlayedPile(cardId: string): any | false {
    const normalized = String(cardId);
    const target = this.hand.cards.find((card: any) => {
      if (!card) return false;
      return String(card.id) === normalized || String(card.cardId) === normalized;
    });
    if (!target) return false;

    const index = this.hand.cards.indexOf(target);
    if (index >= 0) {
      this.hand.cards.splice(index, 1);
    }

    const alreadyPlayed = this.hand.playedCards.some((card: any) => {
      if (!card) return false;
      return String(card.id) === String(target.id) || String(card.cardId) === String(target.cardId);
    });
    if (!alreadyPlayed) {
      this.hand.playedCards.push(target);
    }
    return target;
  }

  discardCard(card: any): any | false {
    if (!card) return false;
    this.discardPile.push(card);
    return card;
  }

  getHandSize(): number {
    return this.hand.cards.length;
  }

  private isSpecialActionCard(card: any): boolean {
    return !!card && (card.__kind === 'special-action' || !!card._specialActionId);
  }

  createActionCard(action: any, option: any, index: number): any {
    const actionId = action?.id ?? 'unknown_action';
    const optionId = option?.id ?? `${actionId}_${index}`;
    const actionName = (action?.name || 'Special Action').trim();
    const derivedBase = actionName
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)[0] || 'Special';
    const imageName = ACTION_CARD_IMAGE_BY_OPTION[optionId] ?? `${derivedBase}ActionCard${index + 1}.jpg`;

    return {
      id: `${actionId}__opt${index}`,
      cardId: `${actionId}__opt${index}`,
      name: option?.name ? `${action?.name || 'Special Action'}: ${option.name}` : (option?.name || action?.name || `Action ${index + 1}`),
      description: option?.description || action?.description || '',
      cost: option?.goldCost ?? 0,
      targetType: option?.targetType || 'none',
      type: 'special-action',
      __kind: 'special-action',
      _specialActionId: actionId,
      _specialOptionIndex: index,
      _specialOptionId: optionId,
      image: imageName,
      imageKind: ACTION_CARD_IMAGE_KIND_BY_OPTION[optionId] ?? 'action',
      actionId,
      optionIndex: index,
    };
  }

  syncActionCards(): void {
    const nextHand = this.hand.cards.filter((card: any) => !this.isSpecialActionCard(card));
    const nextActionCards: any[] = [];

    for (const action of this.actionManager.getAllActions()) {
      if (this.actionManager.isActionUsed(action.id)) {
        for (const [index, option] of action.options.entries()) {
          const card = this.createActionCard(action, option, index);
          const alreadyDiscarded = this.discardPile.some((entry: any) => String(entry.id) === String(card.id));
          if (!alreadyDiscarded) {
            this.discardPile.push(card);
          }
        }
        continue;
      }

      for (const [index, option] of action.options.entries()) {
        nextActionCards.push(this.createActionCard(action, option, index));
      }
    }

    this.hand.cards = nextHand;
    this.actionCards = nextActionCards;
    this.discardPile = this.discardPile.filter((card: any) => {
      if (!this.isSpecialActionCard(card) || !card._specialActionId) return true;
      const matchingAction = this.actionManager.getAllActions().find((action: any) => action.id === card._specialActionId);
      return !!matchingAction && this.actionManager.isActionUsed(matchingAction.id);
    });
  }

  // ===== AFFORDANCE CHECKS =====

  canAffordTrap(): boolean {
    return this.gold >= this.getTrapCost();
  }

  canAffordBarricade(): boolean {
    return this.gold >= this.getBarricadeCost();
  }

  canAffordBait(): boolean {
    return this.gold >= this.getBaitCost();
  }

  canAffordMelee(): boolean {
    return this.gold >= this.getMeleeCost();
  }

  // ===== CLONE =====

 // Player.ts
clone(): Player {
  const player = new Player(this.id, this.name, this.heroId); // heroId may be null
  player.gold = this.gold;
  player.currSP = this.currSP;
  player.currNP = this.currNP;
  player.currCP = this.currCP;
  player.currHealth = this.currHealth;
  player.currGP = this.currGP || 0;
  player.rawBarricadeSuccessRate = this.rawBarricadeSuccessRate;
  player.rawTrapSuccessRate = this.rawTrapSuccessRate;
  player.rawMeleeSuccessRate = this.rawMeleeSuccessRate;
  player.barricadeLimit = this.barricadeLimit;
  player.trapLimit = this.trapLimit;
  player.cardPurchaseDiscount = this.cardPurchaseDiscount;
  player.cardPlayDiscount = this.cardPlayDiscount;
  player.meleeDiscount = this.meleeDiscount;
  player.trapDiscount = this.trapDiscount;
  player.baitDiscount = this.baitDiscount;
  player.barricadeDiscount = this.barricadeDiscount;
  player.movementDiscount = this.movementDiscount;
  player.meleeEffectivenessBoost = this.meleeEffectivenessBoost;
  player.trapEffectivenessBoost = this.trapEffectivenessBoost;
  player.barricadeEffectivenessBoost = this.barricadeEffectivenessBoost;
  player.baitRadiusBoost = this.baitRadiusBoost;
  player.barricadeLimitBoost = this.barricadeLimitBoost;
  player.trapLimitBoost = this.trapLimitBoost;
  player.isEliminated = this.isEliminated;
  player.hand = {
    cards: [...this.hand.cards],
    unplayableCards: [...this.hand.unplayableCards],
    playedCards: [...this.hand.playedCards]
  };
  player.discardPile = [...this.discardPile];
  player.freeMoves = this.freeMoves;
  player.discountNextCard = this.discountNextCard;
  
  // Copy locker flags
  player.dogTagsActive = this.dogTagsActive;
  player.leatherJacketActive = this.leatherJacketActive;
  player.rollerBackpackActive = this.rollerBackpackActive;
  player.childsToolSetActive = this.childsToolSetActive;
  
  // Copy temp data
  player.availableHeroes = [...this.availableHeroes];
  player.availableLockers = [...this.availableLockers];
  player.availableStartingCards = [...this.availableStartingCards];
  player.draftCards = [...this.draftCards];
  
  return player;
}
getSPValue(night: number): number {
  return 4 + (12 - night);
}

getCPValue(): number {
  const np = this.currNP || 0;
  const cp = this.currCP || 0;
  const npSq = np * np;
  const cpSq = cp * cp;
  return (4 * cpSq + 2 * npSq + 6) / (npSq + cpSq + 2);
}

getNPValue(): number {
  const np = this.currNP || 0;
  const cp = this.currCP || 0;
  const npSq = np * np;
  const cpSq = cp * cp;
  return (4 * npSq + 2 * cpSq + 6) / (npSq + cpSq + 2);
}
  // ===== SERIALIZATION =====

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      heroId: this.heroId,
      gold: this.gold,
      currSP: this.currSP,
      currNP: this.currNP,
      currCP: this.currCP,
      currHealth: this.currHealth,
      rawBarricadeSuccessRate: this.rawBarricadeSuccessRate,
      rawTrapSuccessRate: this.rawTrapSuccessRate,
      rawMeleeSuccessRate: this.rawMeleeSuccessRate,
      barricadeLimit: this.barricadeLimit,
      trapLimit: this.trapLimit,
      cardPurchaseDiscount: this.cardPurchaseDiscount,
      cardPlayDiscount: this.cardPlayDiscount,
      meleeDiscount: this.meleeDiscount,
      trapDiscount: this.trapDiscount,
      baitDiscount: this.baitDiscount,
      barricadeDiscount: this.barricadeDiscount,
      movementDiscount: this.movementDiscount,
      meleeEffectivenessBoost: this.meleeEffectivenessBoost,
      trapEffectivenessBoost: this.trapEffectivenessBoost,
      barricadeEffectivenessBoost: this.barricadeEffectivenessBoost,
      baitRadiusBoost: this.baitRadiusBoost,
      barricadeLimitBoost: this.barricadeLimitBoost,
      trapLimitBoost: this.trapLimitBoost,
      hand: {
        cards: this.hand.cards.map((card: any) => typeof card === 'string' ? card : { ...card }),
        unplayableCards: this.hand.unplayableCards.map((card: any) => typeof card === 'string' ? card : { ...card }),
        playedCards: this.hand.playedCards.map((card: any) => typeof card === 'string' ? card : { ...card })
      },
      actionCards: this.actionCards.map((card: any) => ({ ...card })),
      discardPile: this.discardPile.map((card: any) => typeof card === 'string' ? card : { ...card }),
      color: this.color,
      currGP: this.currGP,
      availableHeroes: this.availableHeroes.map((hero: any) => ({ ...hero })),
      availableLockers: this.availableLockers.map((locker: any) => ({ ...locker })),
      availableStartingCards: this.availableStartingCards.map((card: any) => ({ ...card })),
      draftCards: this.draftCards.map((card: any) => ({ ...card })),
      isEliminated: this.isEliminated,
      freeMoves: this.freeMoves,
      discountNextCard: this.discountNextCard,
      setupLockedIn: this.setupLockedIn,
      selectedLockerStartAction: this.selectedLockerStartAction,
      pendingStartActions: this.pendingStartActions.map((action: any) => ({ ...action })),
    };
  }
}