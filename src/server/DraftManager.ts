import { LegacyCard } from './cards/LegacyCard';
import { HeroData, LockerData } from './DraftData';
import { HeroId } from '../common/HeroId';
import { LockerId } from '../common/LockerId';
import { Player } from './Player';
import { CardName } from '../common/CardName';
import { HEROES_DATA } from './data/heroesData';
import { LOCKER_DATA } from './data/lockerData';
import { CARDS_DATA } from './data/cardsData';

const HERO_PASSIVE_CARD_NAMES: Partial<Record<HeroId, CardName>> = {
  [HeroId.SCHADENFREUDE]: CardName.HERO_SCHADENFREUDE_PASSIVE,
  [HeroId.BARRY_CADE]: CardName.HERO_BARRY_CADE_PASSIVE,
  [HeroId.VON_TRAP]: CardName.HERO_VON_TRAP_PASSIVE,
  [HeroId.BLOODTHIRSTER]: CardName.HERO_BLOODTHIRSTER_PASSIVE,
  [HeroId.SPOTTER]: CardName.HERO_SPOTTER_PASSIVE,
  [HeroId.BUNGLER]: CardName.HERO_BUNGLER_PASSIVE,
  [HeroId.ARCHY_TECT]: CardName.HERO_ARCHY_TECT_PASSIVE,
  [HeroId.LOAN_WOLF]: CardName.HERO_LOAN_WOLF_PASSIVE,
  [HeroId.GYM_COACH]: CardName.HERO_GYM_COACH_PASSIVE,
};

const LOCKER_PASSIVE_CARD_NAMES: Partial<Record<LockerId, CardName>> = {
  [LockerId.SHOES]: CardName.LOCKER_SHOES_PASSIVE,
  [LockerId.LEATHER_JACKET]: CardName.LOCKER_LEATHER_JACKET_PASSIVE,
  [LockerId.ROLLER_BACKPACK]: CardName.LOCKER_ROLLER_BACKPACK_PASSIVE,
  [LockerId.DOG_TAGS]: CardName.LOCKER_DOG_TAGS_PASSIVE,
  [LockerId.CHILDS_TOOL_SET]: CardName.LOCKER_CHILDS_TOOL_SET_PASSIVE,
  [LockerId.DIRTY_GYM_SOCKS]: CardName.LOCKER_DIRTY_GYM_SOCKS_PASSIVE,
  [LockerId.SCOUT_TRAINING]: CardName.LOCKER_SCOUT_TRAINING_PASSIVE,
  [LockerId.QUALITY_OVER_QUANTITY]: CardName.LOCKER_QUALITY_OVER_QUANTITY_PASSIVE,
  [LockerId.SHARPENED_STICK]: CardName.LOCKER_SHARPENED_STICK_PASSIVE,
  [LockerId.GAS_LEAK]: CardName.LOCKER_GAS_LEAK_PASSIVE,
};

export { HeroData, LockerData };

export const STARTING_CARD_OFFER_COUNT = 10;
export const STARTING_CARD_KEEP_COST_GOLD = 4;
export const DRAFT_CARD_COST_GOLD = 4;

export class DraftManager {
  private heroPool: HeroData[] = [];
  private lockerPool: LockerData[] = [];
  private cardDeck: LegacyCard[] = [];

  private heroDiscard: HeroData[] = [];
  private lockerDiscard: LockerData[] = [];
  private cardDiscard: LegacyCard[] = [];

  loadAllFromResources(): void {
    this.heroPool = [];
    this.lockerPool = [];
    this.cardDeck = [];
    this.heroDiscard = [];
    this.lockerDiscard = [];
    this.cardDiscard = [];

    this.heroPool.push(...HEROES_DATA);
    this.lockerPool.push(...LOCKER_DATA);
    this.cardDeck.push(...CARDS_DATA.map(c => new LegacyCard(c.name, c.effect, c.requirement, c.bonus, c.playCost, c.description)));

    shuffle(this.heroPool);
    shuffle(this.lockerPool);
    shuffle(this.cardDeck);
  }

  dealSetupOptions(players: Player[]): void {
    const alive = players.filter(p => p.isAlive);
    if (alive.length === 0) return;

    const heroesPerPlayer = Math.floor(11 / alive.length);
    const lockersPerPlayer = Math.floor(21 / alive.length);

    for (const p of alive) {
      p.clearSetupDraftState();
      p.setupHeroOptions.push(...this.drawHeroes(heroesPerPlayer));
      p.setupLockerOptions.push(...this.drawLockers(lockersPerPlayer));
      p.setupCardOptions.push(...this.drawCards(STARTING_CARD_OFFER_COUNT));
    }
  }

  confirmSelection(p: Player): boolean {
    if (!p.selectedHero) return false;
    if (p.selectedLockers.length < 2) return false;
    const cost = this.startingCardCost(p);
    const potentialGold = this.calculatePotentialStartGold(p);
    return potentialGold >= cost;
  }

  /** Card Shark keeps all starting cards for free; everyone else pays 4 gold each. */
  private startingCardCost(p: Player): number {
    if (p.selectedHero?.id === HeroId.CARD_SHARK) return 0;
    return p.selectedStartingCards.length * STARTING_CARD_KEEP_COST_GOLD;
  }

  finalizePlayerSelection(p: Player): void {
    // Gold must be set by applyHeroEffects BEFORE this is called
    const cost = this.startingCardCost(p);
    p.spendGold(cost);

    p.cardsInHand = [];
    p.cardsInHand.push(...p.selectedStartingCards);

    for (const h of p.setupHeroOptions) {
      if (h !== p.selectedHero) this.heroDiscard.push(h);
    }
    for (const r of p.setupLockerOptions) {
      if (!p.selectedLockers.includes(r)) this.lockerDiscard.push(r);
    }
    for (const c of p.setupCardOptions) {
      if (!p.selectedStartingCards.includes(c)) this.cardDiscard.push(c);
    }
  }

  private calculatePotentialStartGold(p: Player): number {
    let total = 0;
    if (p.selectedHero) total += p.selectedHero.startGold;
    for (const locker of p.selectedLockers) {
      total += locker.bonusGold;
    }
    return total;
  }

  tryStartGame(players: Player[]): boolean {
    const alive = players.filter(p => p.isAlive);
    for (const p of alive) {
      if (!p.setupConfirmed) return false;
      if (!this.confirmSelection(p)) return false;
    }
    for (const p of alive) {
      // Apply hero & locker item effects first so gold is set before finalizePlayerSelection deducts card costs
      this.applyHeroEffects(p);
      this.applyLockerEffects(p);
      this.finalizePlayerSelection(p);
    }
    return true;
  }

  applyHeroEffects(p: Player): void {
    if (!p.selectedHero) return;
    const hero = p.selectedHero;

    p.gold = hero.startGold;
    p.survivalPoints = hero.startSP;
    p.hitPoints = Math.min(4, hero.initHealth);
    p.maxHitPoints = 4;
    p.goldProduction = hero.startGP ?? 0;
    if (hero.meleeSuccess != null) p.meleeSuccessRate = hero.meleeSuccess;

    // Per-hero barricade/trap rate and limit overrides.
    // Melee formula: roll ≤ meleeSuccessRate → kill (higher = easier, direct mapping).
    // Barricade formula: roll ≤ barricadeFailRate → holds (higher = better, direct mapping).
    // All three combat rolls use the same convention: d6 <= rate = success (higher = more likely).
    // Trap formula: roll <= trapSuccessRate → kills zombie (higher = easier; abilityScore 4 → rate 5).
    switch (hero.id) {
      case HeroId.BARRY_CADE:
        p.trapSuccessRate = 3;    // 2-trap ability → harder traps (roll ≤ 3 = 50%)
        break;
      case HeroId.VON_TRAP:
        p.barricadeFailRate = 2; // 2-barricade ability → weaker barricades
        p.trapSuccessRate = 5;   // 4-trap ability → better traps (roll ≤ 5 = 83%)
        p.trapLimit = 3;         // Trap Limit +1
        break;
      case HeroId.ARCHY_TECT:
        p.barricadeFailRate = 4; // 4-barricade ability → stronger barricades
        p.barricadeLimit = 4;    // Barricade Limit +1
        break;
      case HeroId.LOAN_WOLF:
        p.trapSuccessRate = 5;   // 4-trap ability → better traps
        break;
      case HeroId.RICHARD:
        p.trapSuccessRate = 5;   // 4-trap ability → better traps
        break;
      case HeroId.CARD_SHARK:
        p.barricadeFailRate = 2; // 2-barricade ability → weaker barricades
        p.trapSuccessRate = 5;   // 4-trap ability → better traps
        break;
      case HeroId.SCHOOL_NURSE:
        p.maxHitPoints = 4;      // 4 Health max (applies to HP cap, already set above)
        break;
    }

    if (hero.startingAction && hero.startingAction.trim().toLowerCase() !== 'none') {
      p.activeActions.push(new LegacyCard(
        `${hero.name} (Starting Action)`,
        `Action: ${hero.startingAction}`,
        'None', 'None', 0, hero.startingAction,
      ));
    }

    if (hero.abilities) {
      let i = 0;
      while (i < hero.abilities.length) {
        const ability = hero.abilities[i];
        if (ability.type === 'Passive') {
          const heroPassiveName = (HERO_PASSIVE_CARD_NAMES[hero.id] ?? `${hero.name}: ${ability.effect}`) as CardName;
          p.activePassives.push(new LegacyCard(
            heroPassiveName,
            `Passive: ${ability.effect}`,
            'None', 'None', 0, ability.effect,
          ));
          i++;
        } else if (ability.type === 'Action') {
          if (i + 1 < hero.abilities.length && hero.abilities[i + 1].type === 'Action') {
            // NP-action and CP-action become two separate labelled buttons
            const next = hero.abilities[i + 1];
            p.activeActions.push(new LegacyCard(
              `${hero.name} [N]`,
              `Action: ${ability.effect}`,
              'None', 'None', 0, ability.effect,
            ));
            p.activeActions.push(new LegacyCard(
              `${hero.name} [C]`,
              `Action: ${next.effect}`,
              'None', 'None', 0, next.effect,
            ));
            i += 2;
          } else {
            p.activeActions.push(new LegacyCard(
              `${hero.name}: ${ability.effect}`,
              `Action: ${ability.effect}`,
              'None', 'None', 0, ability.effect,
            ));
            i++;
          }
        } else if (ability.type === 'Heroic' || ability.type === 'Villainous') {
          // Heroic and Villainous abilities each become a separate clickable action button
          p.activeActions.push(new LegacyCard(
            `${hero.name}: ${ability.effect}`,
            `Action: ${ability.effect}`,
            'None', 'None', 0, ability.effect,
          ));
          i++;
        } else { i++; }
      }
    }
  }

  applyLockerEffects(p: Player): void {
    for (const locker of p.selectedLockers) {
      this._applyOneLockerEffect(p, locker);
    }
  }

  private _applyOneLockerEffect(p: Player, relic: import('./DraftData').LockerData): void {

    p.addGold(relic.bonusGold);

    if (relic.nonGoldBonus && relic.nonGoldBonus !== 'n/a') {
      this.parseAndApplyBonus(p, relic.nonGoldBonus);
    }

    if (relic.startingAction && relic.startingAction.trim().toLowerCase() !== 'none') {
      p.activeActions.push(new LegacyCard(
        `${relic.name} (Starting Action)`,
        `Action: ${relic.startingAction}`,
        'None', 'None', 0, relic.startingAction,
      ));
    }

    if (relic.abilities) {
      let i = 0;
      while (i < relic.abilities.length) {
        const ability = relic.abilities[i];
        if (ability.type === 'Passive') {
          const lockerPassiveName = (LOCKER_PASSIVE_CARD_NAMES[relic.id] ?? `${relic.name}: ${ability.effect}`) as CardName;
          p.activePassives.push(new LegacyCard(
            lockerPassiveName,
            `Passive: ${ability.effect}`,
            'None', 'None', 0, ability.effect,
          ));
          i++;
        } else if (ability.type === 'Action') {
          if (i + 1 < relic.abilities.length && relic.abilities[i + 1].type === 'Action') {
            // NP-action and CP-action become two separate labelled buttons
            const next = relic.abilities[i + 1];
            p.activeActions.push(new LegacyCard(
              `${relic.name} [N]`,
              `Action: ${ability.effect}`,
              'None', 'None', 0, ability.effect,
            ));
            p.activeActions.push(new LegacyCard(
              `${relic.name} [C]`,
              `Action: ${next.effect}`,
              'None', 'None', 0, next.effect,
            ));
            i += 2;
          } else {
            p.activeActions.push(new LegacyCard(
              `${relic.name} [N]`,
              `Action: ${ability.effect}`,
              'None', 'None', 0, ability.effect,
            ));
            i++;
          }
        } else { i++; }
      }
    }
  }

  private parseAndApplyBonus(p: Player, bonus: string): void {
    // Supports semicolon-separated multi-bonus strings, e.g. "3 SP;-1 HP;1 CP"
    for (const token of bonus.split(';')) {
      const parts = token.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const amount = parseInt(parts[0], 10);
      if (isNaN(amount)) continue;
      switch (parts[1].toUpperCase()) {
        case 'SP': p.survivalPoints += amount; break;
        case 'HP':
        case 'HEALTH': p.hitPoints = Math.min(4, Math.max(0, p.hitPoints + amount)); break;
        case 'CP': p.coolPoints += amount; break;
        case 'NP': p.nicePoints += amount; break;
        case 'GP': p.goldProduction += amount; break;
      }
    }
  }

  drawFromDeck(n: number): LegacyCard[] {
    const out: LegacyCard[] = [];
    for (let i = 0; i < n && this.cardDeck.length > 0; i++) {
      out.push(this.cardDeck.shift()!);
    }
    return out;
  }

  private drawHeroes(n: number): HeroData[] { return drawFromPool(this.heroPool, n); }
  private drawLockers(n: number): LockerData[] { return drawFromPool(this.lockerPool, n); }
  private drawCards(n: number): LegacyCard[] { return drawFromPool(this.cardDeck, n); }

  getAllCards(): LegacyCard[] { return [...this.cardDeck]; }
  getHeroDiscard(): HeroData[] { return this.heroDiscard; }
  getLockerDiscard(): LockerData[] { return this.lockerDiscard; }

  getAvailableLockers(): LockerData[] {
    return [...this.lockerPool, ...this.lockerDiscard];
  }

  /** Return up to n locker items as options for player choice (does NOT consume them). */
  peekLockerOptions(n: number): LockerData[] {
    const available = [...this.lockerPool, ...this.lockerDiscard];
    return available.slice(0, n);
  }

  /** Remove a locker item from the pool/discard after a player has claimed it. */
  consumeLocker(lockerId: string): void {
    let idx = this.lockerPool.findIndex(r => r.id === lockerId);
    if (idx >= 0) { this.lockerPool.splice(idx, 1); return; }
    idx = this.lockerDiscard.findIndex(r => r.id === lockerId);
    if (idx >= 0) this.lockerDiscard.splice(idx, 1);
  }

  applyLockerToPlayer(player: Player, locker: LockerData): void {
    if (!player.selectedLockers.includes(locker)) {
      player.selectedLockers.push(locker);
    }
    this._applyOneLockerEffect(player, locker);
  }
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function drawFromPool<T>(pool: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.shift()!);
  }
  return out;
}
