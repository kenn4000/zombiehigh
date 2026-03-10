import { HexCoordinate } from '../common/HexCoordinate';
import { Color } from '../common/Color';
import { PlayerId } from '../common/Types';
import { LegacyCard } from './cards/LegacyCard';
import { HeroData, LockerData } from './DraftData';

export class Player {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: Color;

  // Resources
  gold: number = 0;
  hitPoints: number = 3;
  maxHitPoints: number = 4;
  survivalPoints: number = 10;
  nicePoints: number = 0;
  coolPoints: number = 0;
  goldProduction: number = 0;

  // Board limits
  trapLimit: number = 2;
  barricadeLimit: number = 3;
  trapSuccessRate: number = 4;    // d6 roll <= this kills zombie (higher = more likely; default 4 = 67%)
  barricadeFailRate: number = 3;  // barricade holds when zombie rolls <= this (d6)
  meleeSuccessRate: number = 3;   // d6 roll <= this kills zombie in melee (higher = more likely to succeed)
  meleeCost: number = 7;          // gold cost to attempt a melee attack

  // Position
  position: HexCoordinate;
  private readonly startPosition: HexCoordinate;
  isPlaced: boolean = false;
  isLastSurvivor: boolean = false;

  // Card hands
  cardsInHand: LegacyCard[] = [];
  playedCards: LegacyCard[] = [];
  activeActions: LegacyCard[] = [];
  usedActions: LegacyCard[] = [];
  activePassives: LegacyCard[] = [];

  // Draft/night hands
  temporaryHand: LegacyCard[] = [];
  selectedDraftCards: LegacyCard[] = [];

  // Setup state
  setupHeroOptions: HeroData[] = [];
  setupLockerOptions: LockerData[] = [];
  setupCardOptions: LegacyCard[] = [];
  selectedStartingCards: LegacyCard[] = [];
  selectedHero: HeroData | undefined = undefined;
  selectedLockers: LockerData[] = [];
  setupConfirmed: boolean = false;

  /** Pending discard state: player must discard `left` cards, then draw `draw` cards. */
  pendingDiscardDraw: { left: number; draw: number; goldReward?: number } | undefined = undefined;

  /** When > 0, player must select this many cards from temporaryHand to keep. */
  pendingDrawKeepCount: number = 0;

  constructor(id: PlayerId, name: string, color: Color, position: HexCoordinate) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.position = position;
    this.startPosition = position;
  }

  get isAlive(): boolean { return this.hitPoints > 0; }

  takeDamage(amount: number): void {
    this.hitPoints = Math.max(0, this.hitPoints - amount);
  }

  addHealth(amount: number): void {
    this.hitPoints = Math.min(this.maxHitPoints, Math.max(0, this.hitPoints + amount));
  }

  setHealth(val: number): void {
    this.hitPoints = Math.min(this.maxHitPoints, Math.max(0, val));
  }

  addGold(amount: number): void { this.gold += amount; }

  spendGold(amount: number): void {
    this.gold = Math.max(0, this.gold - amount);
  }

  addSurvivalPoints(val: number): void { this.survivalPoints += val; }
  addNicePoints(val: number): void { this.nicePoints += val; }
  addCoolPoints(val: number): void { this.coolPoints += val; }

  clearSetupDraftState(): void {
    this.setupHeroOptions = [];
    this.setupLockerOptions = [];
    this.setupCardOptions = [];
    this.selectedStartingCards = [];
    this.selectedHero = undefined;
    this.selectedLockers = [];
    this.setupConfirmed = false;
  }

  reset(): void {
    this.position = this.startPosition;
    this.isPlaced = false;
    this.isLastSurvivor = false;
    this.gold = 0;
    this.hitPoints = 3;
    this.maxHitPoints = 4;
    this.survivalPoints = 10;
    this.nicePoints = 0;
    this.coolPoints = 0;
    this.goldProduction = 0;
    this.trapLimit = 2;
    this.barricadeLimit = 3;
    this.trapSuccessRate = 4;
    this.barricadeFailRate = 3;
    this.meleeSuccessRate = 3;
    this.meleeCost = 7;
    this.cardsInHand = [];
    this.playedCards = [];
    this.activeActions = [];
    this.usedActions = [];
    this.activePassives = [];
    this.temporaryHand = [];
    this.selectedDraftCards = [];
    this.pendingDiscardDraw = undefined;
    this.clearSetupDraftState();
  }
}
