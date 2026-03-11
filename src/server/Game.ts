import { GameId, PlayerId } from '../common/Types';
import { Phase } from '../common/Phase';
import { HexCoordinate } from '../common/HexCoordinate';
import { Color } from '../common/Color';
import { Board } from './Board';
import { getTileRoom } from '../common/RoomLookup';
import { Barricade } from './Barricade';
import { Trap } from './Trap';
import { Player } from './Player';
import { Zombie } from './Zombie';
import { GameActions } from './GameActions';
import { LegacyCardProcessor } from './LegacyCardProcessor';
import { DraftManager, DRAFT_CARD_COST_GOLD } from './DraftManager';
import { CARDS_DATA } from './data/cardsData';
import { LegacyCard } from './cards/LegacyCard';
import { SerializedGame, SerializedPlayer, SerializedCard } from './SerializedGame';
import { GameModel, GameSettings } from '../common/models/GameModel';
import { PlayerModel } from '../common/models/PlayerModel';
import {
  BoardModel, TileModel, TrapModel, BaitModel,
  BarricadeModel, ZombieModel, PlayerPositionModel,
} from '../common/models/BoardModel';
import { CardModel, CardType, CardSubtype } from '../common/models/CardModel';
import { PlayerInputType } from '../common/models/PlayerInputModel';
import { HeroId } from '../common/HeroId';
import { LockerId } from '../common/LockerId';
import { CardName } from '../common/CardName';
import { CardRegistry } from './cards/CardRegistry';
import { RequirementEvaluator } from './cards/RequirementEvaluator';
import { BehaviorExecutor } from './cards/BehaviorExecutor';
import { IGame } from './cards/IGame';


function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export class Game implements IGame {
  readonly id: GameId;
  readonly createdAtMs: number;
  settings: GameSettings = { firstCardFreeNightDraft: false };

  // Server-side collections (live references)
  readonly players: Player[];
  private readonly zombies: Zombie[] = [];
  private readonly deck: LegacyCard[] = [];
  readonly board: Board;
  private readonly passedPlayerIds: Set<PlayerId> = new Set();

  // Subsystems
  private readonly actions: GameActions;
  private readonly cardProcessor: LegacyCardProcessor;
  private readonly draftManager: DraftManager;

  // Phase-tracking state
  private _setupPhase: boolean = true;
  private _draftingPhase: boolean = false;
  private _placementPhase: boolean = false;
  private playerInEscapeId: PlayerId | undefined = undefined;
  private validEscapeHexes: HexCoordinate[] = [];

  // Turn state
  private currentTurnIndex: number = 0;
  private firstPlayerOffset: number = 0;
  private actionsRemaining: number = 3;
  private generationCount: number = 1;
  private nightScoreHistory: Array<Array<{ id: string; name: string; color: string; score: number }>> = [];
  private currentMode: string = '';
  private firstBarricadeHex: HexCoordinate | undefined = undefined;
  private setupPlayerIndex: number = 0;

  // Pending zombie-targeting state
  private pendingTargetCardName: string | undefined = undefined;
  private pendingTargetPlayerId: PlayerId | undefined = undefined;
  // Optional room filter: only zombies in this room can be targeted
  private pendingTargetRoomFilter: string | undefined = undefined;
  // Optional filter: only zombies adjacent to at least one player (e.g. Distraction)
  private pendingTargetRequireAdjacentPlayer: boolean = false;
  // Optional filter: only zombies adjacent to the current player (e.g. Homerun Bat)
  private pendingTargetRequireAdjacentZombie: boolean = false;
  // Rewards granted on a successful zombie kill via targeting
  private pendingTargetSPReward: number = 0;
  private pendingTargetNPReward: number = 0;

  // Flag: next bait placement is free (no gold cost, no action cost)
  private pendingFreeBait: boolean = false;
  // Flag: next move is a Jump Over (must land directly behind an adjacent obstacle)
  private pendingJumpOver: boolean = false;
  // Flag: jump-over accepts ANY occupied adjacent tile (Gym Class Hero; false = players/opponent-traps only)
  private pendingJumpOverAny: boolean = false;
  // SP/NP rewards to apply when the pending jump-over resolves (Spotter [N])
  private pendingJumpOverSP: number = 0;
  private pendingJumpOverNP: number = 0;
  // Flag: next barricade placement is free and position-unrestricted (starting action)
  private pendingFreeBarricadeCount: number = 0;
  // Bully [N] / Bungler [N]: next melee attack in mode 'A' costs no gold
  private pendingFreeMelee: boolean = false;
  // Bungler [N]: override success rate for next melee (e.g. rate 5 for super melee)
  private pendingMeleeSuccessRateOverride: number | undefined = undefined;
  // Override SP reward on next melee kill (Bungler super melee = 1 SP instead of 2)
  private pendingMeleeSpReward: number | undefined = undefined;
  // Grant +1 NP on next successful melee (Bully / Bungler)
  private pendingMeleeNPReward: boolean = false;
  // Card Shark [N]: discards from pending-discard go to this player's hand instead of playedCards
  private pendingDiscardRecipientId: PlayerId | undefined = undefined;
  // drawKeepFromTemp: leftover unchosen cards are sent to this player's hand instead of discarded
  private pendingDrawKeepRecipientId: PlayerId | undefined = undefined;

  // Free move steps: player may move N tiles without gold cost
  private pendingFreeMoveSteps: number = 0;
  private pendingFreeMovePlayerId: PlayerId | undefined = undefined;
  // Flag: Shoes – free steps still charge opponent barricade toll
  private pendingFreeMovesPayBarricades: boolean = false;
  // Flag: Scout Training starting action – next trap placement is free
  private pendingFreeTrap: boolean = false;
  private pendingPostMoveAdjacencyGold: { playerId: PlayerId; goldPerOccupant: number } | undefined = undefined;

  // Pending locker item choice (Uncovered Locker Item card): player selects from options
  private pendingLockerOptions: Map<PlayerId, import('./DraftData').LockerData[]> = new Map();
  // Pending OR action choice (e.g. Ouji Board: NP vs CP option)
  private pendingOrActionChoice: Map<PlayerId, { card: LegacyCard; effects: string[] }> = new Map();

  // Hex keys visited by zombies during the last zombie phase (shown as trails on board)
  private zombieTrailHexKeys: Set<string> = new Set();
  // Movement pairs for trail arrows: from → to for each zombie step
  private zombieTrailMoves: Array<{ fromKey: string; toKey: string }> = [];
  // Night choice tracking: accumulated NP/CP rewards per player from the zombie phase
  private pendingNightPoints: Map<string, number> = new Map();
  private nightChoiceQueue: PlayerId[] = [];

  // Pending interactive card effects (destroy barricade, swap, relocate trap, etc.)
  private pendingInteraction: {
    type: string;
    playerId: PlayerId;
    cardName: string;
    data?: { hexKey?: string };
  } | undefined = undefined;

  // Persistence
  readonly gameLog: string[] = [];
  lastSaveId: number = 0;

  constructor(id: GameId, board: Board, players: Player[]) {
    this.id = id;
    this.board = board;
    this.players = players;
    this.createdAtMs = Date.now();

    // cardProcessor holds a live reference to this.zombies; always stays in sync
    this.cardProcessor = new LegacyCardProcessor(this.board, this.players, this.zombies);

    this.actions = new GameActions(
      this.board,
      (msg) => this.log(msg),
      (h) => this.isPlayerAt(h),
      (h) => this.isZombieAt(h),
      (p) => this.getAdjustedMovementCost(p),
      (p) => this.getAdjustedBaitCost(p),
      (p) => this.getAdjustedTrapCost(p),
      (p) => this.getAdjustedBarricadeCost(p),
      () => { /* reclassify: no-op in Phase 3; playability computed on-demand in toModel() */ },
    );
    this.actions.setGoldTransferCallback((ownerId, amount) => {
      const owner = this.getPlayerById(ownerId as PlayerId);
      if (owner) owner.addGold(amount);
    });
    this.actions.setBarricadeCrossCostCallback((p) => this.getAdjustedBarricadeCrossCost(p));
    this.actions.setBarricadeCrossRefundCallback((p) => this.getBarricadeCrossRefund(p));
    this.actions.setBarricadeLimitCallback((p) => this.getAdjustedBarricadeLimit(p));
    this.actions.setTrapLimitCallback((p) => this.getAdjustedTrapLimit(p));
    this.actions.setBaitPlacedCallback((p) => this.fireOnBaitPlaced(p));
    this.actions.setPlayerNameCallback((id) => this.getPlayerById(id as PlayerId)?.name ?? 'Player');

    this.draftManager = new DraftManager();
    this.draftManager.loadAllFromResources();
    this.draftManager.dealSetupOptions(this.players);
    this.initDeck();
  }

  // ---- Deck initialization ----

  private initDeck(): void {
    this.deck.length = 0;
    this.deck.push(...CARDS_DATA);
    shuffleArray(this.deck);
  }

  // ---- Phase ----

  getPhase(): Phase {
    if (this.isGameOver()) return Phase.GAME_OVER;
    if (this._setupPhase) return Phase.SETUP;
    if (this._placementPhase) return Phase.PLACEMENT;
    if (this.playerInEscapeId !== undefined) return Phase.ESCAPE;
    if (this._draftingPhase) return Phase.DRAFTING;
    if (this.nightChoiceQueue.length > 0) return Phase.NIGHT_CHOICE;
    return Phase.ACTION;
  }

  isGameOver(): boolean {
    return this.players.every(p => !p.isAlive);
  }

  // ---- Accessors ----

  getBoard(): Board { return this.board; }
  getZombies(): Zombie[] { return this.zombies; }
  getDeck(): LegacyCard[] { return this.deck; }
  getActionsRemaining(): number { return this.actionsRemaining; }
  getGenerationCount(): number { return this.generationCount; }
  getCurrentMode(): string { return this.currentMode; }
  getValidEscapeHexes(): HexCoordinate[] { return this.validEscapeHexes; }

  getCurrentPlayer(): Player {
    return this.players[this.currentTurnIndex];
  }

  getPlayerById(id: PlayerId | string): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  isZombieAt(h: HexCoordinate): boolean {
    return this.zombies.some(z => z.isAlive && z.position.equals(h));
  }

  isPlayerAt(h: HexCoordinate): boolean {
    return this.players.some(p => p.isAlive && p.isPlaced && p.position.equals(h));
  }

  log(msg: string): void {
    this.gameLog.push(msg);
  }

  /** IGame: draw N cards from the deck into the player's hand. */
  drawCards(player: Player, count: number): void {
    if (!player.isAlive) return;
    let drawn = 0;
    for (let i = 0; i < count && this.deck.length > 0; i++) {
      player.cardsInHand.push(this.deck.shift()!);
      drawn++;
    }
    if (drawn < count) {
      this.log(`${player.name} draws ${drawn}/${count} card(s) (deck empty). Hand: ${player.cardsInHand.length}`);
    } else {
      this.log(`${player.name} draws ${drawn} card(s). Hand: ${player.cardsInHand.length}`);
    }
  }

  /** IGame: spawn N zombies at the lowest available board tiles. */
  spawnZombies(count: number): void {
    let placed = 0;
    for (const h of this.board.getTilesInIDOrder()) {
      if (placed >= count) break;
      if (!this.isPlayerAt(h) && !this.isZombieAt(h) && !this.board.hasTrap(h) && !this.board.hasBait(h)) {
        this.zombies.push(new Zombie(h));
        placed++;
      }
    }
    if (placed > 0) this.log(`Spawned ${placed} zombie(s).`);
  }

  // ---- Setup ----

  selectHero(playerId: PlayerId, heroId: HeroId): void {
    if (!this._setupPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;
    const hero = p.setupHeroOptions.find(h => h.id === heroId);
    if (!hero) return;
    // Switching away from Card Shark: clear auto-selected cards
    if (p.selectedHero?.id === HeroId.CARD_SHARK && heroId !== HeroId.CARD_SHARK) {
      p.selectedStartingCards = [];
    }
    p.selectedHero = hero;
    // Card Shark starting bonus: all 10 starting cards are free — auto-select them all
    if (hero.id === HeroId.CARD_SHARK) {
      p.selectedStartingCards = [...p.setupCardOptions];
    }
    p.setupConfirmed = false;
  }

  selectLocker(playerId: PlayerId, lockerId: LockerId): void {
    if (!this._setupPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;
    const locker = p.setupLockerOptions.find(r => r.id === lockerId);
    if (!locker) return;
    const idx = p.selectedLockers.findIndex(r => r.id === lockerId);
    if (idx >= 0) {
      // Toggle off
      p.selectedLockers.splice(idx, 1);
    } else if (p.selectedLockers.length < 2) {
      // Select (max 2)
      p.selectedLockers.push(locker);
    } else {
      // Replace oldest selection
      p.selectedLockers[0] = locker;
    }
    p.setupConfirmed = false;
  }

  toggleKeepStartingCard(playerId: PlayerId, cardName: string): void {
    if (!this._setupPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;
    const card = p.setupCardOptions.find(c => c.name === cardName);
    if (!card) return;
    const idx = p.selectedStartingCards.indexOf(card);
    if (idx >= 0) {
      p.selectedStartingCards.splice(idx, 1);
    } else {
      p.selectedStartingCards.push(card);
    }
    p.setupConfirmed = false;
  }

  confirmSetup(playerId: PlayerId): boolean {
    if (!this._setupPhase) return false;
    const p = this.getPlayerById(playerId);
    if (!p) return false;
    const ok = this.draftManager.confirmSelection(p);
    if (!ok) return false;
    p.setupConfirmed = true;
    return true;
  }

  tryStartGame(): boolean {
    if (!this._setupPhase) return true;
    const ok = this.draftManager.tryStartGame(this.players);
    if (!ok) return false;

    // Remove from the game deck any cards already assigned to players' starting hands (prevents duplicates)
    const ownedNames = new Set(this.players.flatMap(p => p.cardsInHand.map(c => c.name)));
    for (let i = this.deck.length - 1; i >= 0; i--) {
      if (ownedNames.has(this.deck[i].name)) this.deck.splice(i, 1);
    }

    // Apply card-draw starting bonuses that require deck access
    for (const p of this.players) {
      for (const locker of p.selectedLockers) {
        if (locker.id === LockerId.PERMANENT_RECORD) { this.drawCards(p, 6); this.log(`${p.name}: Permanent Record – drew 6 cards.`); }
        else if (locker.id === LockerId.VITAMINS) { this.drawCards(p, 1); this.log(`${p.name}: Vitamins – drew 1 card.`); }
        else if (locker.id === LockerId.PYRAMID_SCHEME) { this.drawCards(p, 2); this.log(`${p.name}: Pyramid Scheme – drew 2 cards.`); }
        else if (locker.id === LockerId.FRESH_WOUND_DRESSING) { this.drawCards(p, 1); this.log(`${p.name}: Fresh Wound Dressing – drew 1 card.`); }
        else if (locker.id === LockerId.LONG_SLEEVES) { this.drawCards(p, 2); this.log(`${p.name}: Long Sleeves – drew 2 extra cards.`); }
        else if (locker.id === LockerId.LEATHER_JACKET) { this.fireOnCPGained(p); this.log(`${p.name}: Leather Jacket – starting CP triggers passive.`); }
        else if (locker.id === LockerId.ROLLER_BACKPACK) { this.fireOnNPGained(p); this.log(`${p.name}: Roller Backpack – starting NP triggers passive.`); }
      }
    }

    this._setupPhase = false;
    this._draftingPhase = false;
    this._placementPhase = true;
    this.playerInEscapeId = undefined;
    this.passedPlayerIds.clear();
    this.currentTurnIndex = 0;
    this.actionsRemaining = 3;
    this.generationCount = 1;
    this.currentMode = '';

    // Mark all players as unplaced until they choose their starting tile
    for (const p of this.players) p.isPlaced = false;
    // Spawn initial zombies before players choose positions
    const zombieCount = Math.min(3, this.players.filter(pl => pl.isAlive).length);
    this.spawnInitialZombies(zombieCount);
    this.log(`${zombieCount} zombie${zombieCount !== 1 ? 's' : ''} have appeared! Choose your starting positions in turn order!`);
    // Log starting-action announcements for each player
    for (const p of this.players) {
      const starts = p.activeActions.filter(c => c.name.includes('(Starting Action)'));
      for (const sa of starts) {
        const heroName = sa.name.replace(' (Starting Action)', '');
        this.log(`<b>${p.name}</b> must take <span class="log-cardname">${heroName}</span>'s starting action: ${sa.description}`);
      }
    }
    return true;
  }

  private choosePlacementHex(playerId: PlayerId, hex: HexCoordinate): void {
    if (!this._placementPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer()) return;
    if (!this.board.isWithinBounds(hex)) { this.log('Choose a valid board tile.'); return; }
    if (this.isPlayerAt(hex)) { this.log('That tile is occupied. Choose another.'); return; }
    const neighbors = this.board.getNeighbors(hex);
    if (neighbors.some(n => this.isPlayerAt(n))) {
      this.log('Cannot start adjacent to another player. Choose another tile.'); return;
    }
    p.position = hex;
    p.isPlaced = true;
    this.log(`${p.name} placed at ${hex.key()}.`);
    const alivePlayers = this.players.filter(pl => pl.isAlive);
    if (alivePlayers.every(pl => pl.isPlaced)) {
      this._placementPhase = false;
      this.currentTurnIndex = 0;
      this.log('All players placed! Game begins!');
    } else {
      do {
        this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      } while (!this.players[this.currentTurnIndex].isAlive || this.players[this.currentTurnIndex].isPlaced);
    }
  }

  // ---- Mode selection ----

  setMode(mode: string): void {
    if (this.isGameOver()) return;
    this.currentMode = this.currentMode === mode ? '' : mode;
    this.firstBarricadeHex = undefined;
  }

  /** Place a barricade by clicking the shared edge between two adjacent hexes. */
  handleEdgePlacement(playerId: PlayerId, qa: number, ra: number, qb: number, rb: number): void {
    if (this.isGameOver() || this._setupPhase || this._draftingPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer()) return;

    const hexA = new HexCoordinate(qa, ra);
    const hexB = new HexCoordinate(qb, rb);

    // Free barricade (from card or starting action) — no adjacency, no gold, no action cost
    if (this.pendingFreeBarricadeCount > 0) {
      const bFreeBar = this.snapStats(p);
      if (this.actions.handleFreeBarricade(p, hexA, hexB)) {
        this.logRichAction(p, 'placed a free barricade', bFreeBar, this.snapStats(p));
        this.pendingFreeBarricadeCount--;
        if (this.pendingFreeBarricadeCount <= 0) {
          this.currentMode = '';
          this.maybeEndTurn();
        }
      }
      return;
    }

    if (this.actionsRemaining <= 0) return;

    const hexA2 = new HexCoordinate(qa, ra);
    const hexB2 = new HexCoordinate(qb, rb);
    const aAdj = p.position.distanceTo(hexA2) <= 1;
    const bAdj = p.position.distanceTo(hexB2) <= 1;
    if (!aAdj && !bAdj) {
      this.log('You must be adjacent to one of the two edge hexes to place a barricade.');
      return;
    }

    const [first, second] = aAdj ? [hexA2, hexB2] : [hexB2, hexA2];
    const bBar = this.snapStats(p);
    if (this.actions.handleBarricade(p, first, second)) {
      this.logRichAction(p, 'placed a barricade', bBar, this.snapStats(p), this.getAdjustedBarricadeCost(p));
      this.useAction();
      this.currentMode = '';
    }
  }

  // ---- Main action handler ----

  processAction(playerId: PlayerId, hex: HexCoordinate): void {
    if (this._placementPhase) { this.choosePlacementHex(playerId, hex); return; }
    if (this.isGameOver() || this._setupPhase || this.nightChoiceQueue.length > 0) return;

    // Pending interactive effect resolution (destroy barricade, swap, etc.)
    if (this.pendingInteraction !== undefined && this.pendingInteraction.playerId === playerId) {
      this.resolvePendingInteraction(playerId, hex);
      return;
    }

    // Zombie targeting resolution (does not cost an action)
    if (this.pendingTargetCardName !== undefined && this.pendingTargetPlayerId === playerId) {
      if (this.isZombieAt(hex)) {
        const zombie = this.zombies.find(z => z.isAlive && z.position.equals(hex));
        if (zombie) {
          // Check room filter (e.g. Gym Coach requires zombie to be in the gymnasium)
          if (this.pendingTargetRoomFilter !== undefined) {
            const zombieRoom = getTileRoom(zombie.position.q, zombie.position.r);
            if (zombieRoom !== this.pendingTargetRoomFilter) {
              this.log(`You must select a zombie in the ${this.pendingTargetRoomFilter.replace(/-/g, ' ')}.`);
              return;
            }
          }
          if (this.pendingTargetRequireAdjacentPlayer) {
            const isAdjacentToPlayer = this.players.some(pl =>
              pl.isAlive && pl.position.distanceTo(zombie.position) === 1
            );
            if (!isAdjacentToPlayer) {
              this.log('You must select a zombie that is adjacent to a player.');
              return;
            }
          }
          if (this.pendingTargetRequireAdjacentZombie) {
            const currentPlayer = this.getPlayerById(playerId as PlayerId);
            if (!currentPlayer || currentPlayer.position.distanceTo(zombie.position) !== 1) {
              this.log('You must select a zombie that is adjacent to you.');
              return;
            }
          }
          zombie.setDead();
          this.zombies.splice(this.zombies.indexOf(zombie), 1);
          const killer = this.getPlayerById(playerId)!;
          let rewardMsg = '';
          if (this.pendingTargetSPReward > 0) { killer.addSurvivalPoints(this.pendingTargetSPReward); rewardMsg += ` +${this.pendingTargetSPReward} SP`; }
          if (this.pendingTargetNPReward > 0) { killer.addNicePoints(this.pendingTargetNPReward); rewardMsg += ` +${this.pendingTargetNPReward} NP`; }
          this.log(`${killer.name} removed a zombie with ${this.pendingTargetCardName}.${rewardMsg}`);
          this.pendingTargetCardName = undefined;
          this.pendingTargetPlayerId = undefined;
          this.pendingTargetRoomFilter = undefined;
          this.pendingTargetRequireAdjacentPlayer = false;
          this.pendingTargetRequireAdjacentZombie = false;
          this.pendingTargetSPReward = 0;
          this.pendingTargetNPReward = 0;
        }
      } else {
        this.log('Select a tile containing the zombie you wish to remove.');
      }
      return;
    }

    // Escape mode
    if (this.getPhase() === Phase.ESCAPE) {
      if (playerId === this.playerInEscapeId) {
        if (this.validEscapeHexes.some(h => h.equals(hex))) {
          const p = this.getPlayerById(playerId)!;
          if (this.actions.handleEscape(p, hex)) {
            this.checkLastSurvivorAndCleanup();
            if (p.isAlive) this.log(`${p.name} escaped to safety.`);
            this.clearEscapeState();
          }
        } else {
          this.log('Invalid escape! Choose a highlighted tile.');
        }
      }
      return;
    }

    if (this._draftingPhase) return;

    const p = this.getPlayerById(playerId);
    const hasPendingFreePlacement = this.pendingFreeTrap || this.pendingFreeBait
      || this.pendingFreeBarricadeCount > 0 || this.pendingFreeMoveSteps > 0
      || this.pendingFreeMelee || this.pendingJumpOver;
    if (!p || p !== this.getCurrentPlayer() || (this.actionsRemaining <= 0 && !hasPendingFreePlacement)) return;

    // Jump-over resolution — handled before the mode switch so it works regardless of currentMode
    if (this.pendingJumpOver) {
      const validJumps = this.getJumpOverHexes(p);
      if (validJumps.some(h => h.equals(hex))) {
        p.position = hex;
        this.pendingJumpOver = false;
        this.pendingJumpOverAny = false;
        this.currentMode = '';
        const rewardParts: string[] = [];
        if (this.pendingJumpOverSP > 0) { p.addSurvivalPoints(this.pendingJumpOverSP); rewardParts.push(`+${this.pendingJumpOverSP} SP`); }
        if (this.pendingJumpOverNP > 0) { p.addNicePoints(this.pendingJumpOverNP); this.fireOnNPGained(p); rewardParts.push(`+${this.pendingJumpOverNP} NP`); }
        this.pendingJumpOverSP = 0;
        this.pendingJumpOverNP = 0;
        const rewardMsg = rewardParts.length > 0 ? ` ${rewardParts.join(', ')}` : '';
        this.log(`${p.name} jumped over an obstacle!${rewardMsg}`);
        this.maybeEndTurn();
      } else {
        this.log(`${p.name}: Choose a highlighted tile directly behind an adjacent target.`);
      }
      return; // jump-over never consumes a turn action
    }

    let success = false;

    switch (this.currentMode) {
      case 'M':
        // Free move: player earned steps from a card (e.g. Scouting Report) — no gold cost
        if (this.pendingFreeMoveSteps > 0 && this.pendingFreeMovePlayerId === playerId) {
          if (hex.distanceTo(p.position) === 1 && !this.isPlayerAt(hex) && !this.isZombieAt(hex) && !this.board.hasTrap(hex)) {
            // Shoes (pendingFreeMovesPayBarricades): still charge opponent barricade toll
            if (this.pendingFreeMovesPayBarricades) {
              const bar = this.board.getBarricade(p.position, hex);
              if (bar && bar.ownerId !== p.id) {
                const tollCost = this.getAdjustedBarricadeCrossCost(p);
                if (p.gold < tollCost) {
                  this.log(`${p.name}: Need ${tollCost} gold barricade toll to cross (Shoes step).`);
                  return;
                }
                p.spendGold(tollCost);
                const barOwner = this.getPlayerById(bar.ownerId as PlayerId);
                if (barOwner) barOwner.addGold(1);
                this.log(`${p.name} paid ${tollCost} gold barricade toll (Shoes step).`);
              }
            }
            p.position = hex;
            this.pendingFreeMoveSteps--;
            // Apply per-step adjacency gold (e.g. Crowded Halls) after each step
            if (this.pendingPostMoveAdjacencyGold?.playerId === playerId) {
              const pmg = this.pendingPostMoveAdjacencyGold!;
              const pmNeighbors = this.board.getNeighbors(p.position);
              const pmCount = pmNeighbors.filter(n => this.isPlayerAt(n) || this.isZombieAt(n)).length;
              const pmBonus = pmCount * pmg.goldPerOccupant;
              p.addGold(pmBonus);
              this.log(`${p.name} gains ${pmBonus} gold (${pmCount} adjacent occupant(s)).`);
            }
            if (this.pendingFreeMoveSteps > 0) {
              this.log(`${p.name} takes a free step (${this.pendingFreeMoveSteps} step(s) remaining).`);
            } else {
              this.pendingFreeMovePlayerId = undefined;
              this.pendingFreeMovesPayBarricades = false;
              this.pendingPostMoveAdjacencyGold = undefined;
              this.currentMode = '';
              this.log(`${p.name} used all free steps.`);
              this.maybeEndTurn();
            }
          } else {
            this.log('Cannot move there: must be an adjacent, unoccupied tile.');
          }
          return; // free moves never consume an action
        }
        // Paid move
        if (!this.board.hasTrap(hex) && !this.isPlayerAt(hex) && !this.isZombieAt(hex) && !this.board.hasBait(hex)) {
          success = this.actions.handleMove(p, hex);
        } else {
          this.log('Cannot move there: Tile is occupied or trapped!');
        }
        break;
      case 'T':
        // Free trap (Scout Training starting action): place without gold/distance check
        if (this.pendingFreeTrap) {
          if (
            this.board.isWithinBounds(hex) &&
            !this.isPlayerAt(hex) && !this.isZombieAt(hex) &&
            !this.board.hasTrap(hex) && !this.board.hasBait(hex)
          ) {
            const currentTraps = [...this.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
            if (currentTraps >= this.getAdjustedTrapLimit(p)) { this.log('Trap limit reached!'); break; }
            const bFreeTrap = this.snapStats(p);
            if (p.selectedHero?.id !== HeroId.VON_TRAP) p.addSurvivalPoints(1);
            this.board.placeTrap(hex, new Trap(p.id));
            this.pendingFreeTrap = false;
            this.currentMode = '';
            this.logRichAction(p, 'placed a free trap', bFreeTrap, this.snapStats(p));
            this.maybeEndTurn();
          } else {
            this.log('Invalid trap placement.');
          }
          return; // free trap does not consume an action
        }
        {
          const bT = this.snapStats(p); success = this.actions.handleTrap(p, hex);
          if (success) this.logRichAction(p, 'placed a trap', bT, this.snapStats(p), this.getAdjustedTrapCost(p));
        }
        break;
      case 'B':
        if (this.pendingFreeBait) {
          {
            const bFB = this.snapStats(p);
            if (this.actions.handleFreeBait(p, hex)) {
              this.logRichAction(p, 'placed a free bait', bFB, this.snapStats(p));
              this.pendingFreeBait = false;
              this.currentMode = '';
              this.maybeEndTurn();
            }
          }
          return; // free bait does not consume a turn action
        }
        {
          const bB = this.snapStats(p); success = this.actions.handleBait(p, hex);
          if (success) this.logRichAction(p, 'placed bait', bB, this.snapStats(p), this.getAdjustedBaitCost(p));
        }
        break;
      case 'A': {
        // Melee attack: spend gold, roll d6 — kill adjacent zombie on roll <= meleeSuccessRate
        const meleeNeighbors = this.board.getNeighbors(p.position);
        if (!meleeNeighbors.some(n => n.equals(hex))) {
          this.log('Melee target must be an adjacent tile.');
          break;
        }
        if (!this.isZombieAt(hex)) {
          this.log('No zombie at that tile to attack.');
          break;
        }
        const isFree = this.pendingFreeMelee;
        const rateOverride = this.pendingMeleeSuccessRateOverride;
        const spOverride = this.pendingMeleeSpReward;
        const npBonus = this.pendingMeleeNPReward;
        this.pendingFreeMelee = false;
        this.pendingMeleeSuccessRateOverride = undefined;
        this.pendingMeleeSpReward = undefined;
        this.pendingMeleeNPReward = false;
        if (!isFree) {
          if (p.gold < this.getAdjustedMeleeCost(p)) {
            this.log(`Need ${this.getAdjustedMeleeCost(p)} Gold to attempt a melee attack!`);
            break;
          }
          p.spendGold(this.getAdjustedMeleeCost(p));
        }
        const effectiveRate = rateOverride ?? this.getAdjustedMeleeSuccessRate(p);
        const meleeRoll = Math.ceil(Math.random() * 6);
        if (meleeRoll <= effectiveRate) {
          const target = this.zombies.find(z => z.isAlive && z.position.equals(hex));
          if (target) {
            target.setDead();
            this.zombies.splice(this.zombies.indexOf(target), 1);
          }
          const spReward = spOverride ?? 2;
          p.addSurvivalPoints(spReward);
          this.fireOnPersonalZombieKill(p);
          let killMsg = `${p.name} killed a zombie in melee! (rolled ${meleeRoll}, needed ≤${effectiveRate}) +${spReward} SP`;
          if (npBonus) { p.addNicePoints(1); this.fireOnNPGained(p); killMsg += ' +1 NP'; }
          this.log(killMsg);
          this.fireMeleeOnKillDraw(p);
          this.fireOnAnyZombieKilled();
        } else {
          this.log(`${p.name}'s melee attack failed! (rolled ${meleeRoll}, needed ≤${effectiveRate})`);
        }
        success = true;
        break;
      }
      case 'W':
        if (this.pendingFreeBarricadeCount > 0) {
          // Free barricade: edge clicks are the primary path; tile clicks are blocked in wall mode
          // (kept for completeness)
          return;
        }
        if (this.firstBarricadeHex === undefined) {
          if (p.position.distanceTo(hex) <= 1) {
            this.firstBarricadeHex = hex;
            this.log('Select adjacent tile to finish wall.');
          }
        } else {
          const bW = this.snapStats(p);
          success = this.actions.handleBarricade(p, this.firstBarricadeHex, hex);
          if (success) this.logRichAction(p, 'placed a barricade', bW, this.snapStats(p), this.getAdjustedBarricadeCost(p));
          this.firstBarricadeHex = undefined;
        }
        break;
    }

    if (success) {
      this.useAction();
      this.currentMode = '';
    }
  }

  useAction(): void {
    this.actionsRemaining--;
    // Don't end the turn if the current player still has a pending discard, interaction,
    // free placement, free moves, or draw-keep selection to resolve
    if (this.actionsRemaining <= 0
      && !this.getCurrentPlayer()?.pendingDiscardDraw
      && !this.pendingInteraction
      && this.pendingFreeBarricadeCount <= 0
      && this.pendingFreeMoveSteps <= 0
      && !this.pendingFreeBait
      && !this.pendingFreeTrap
      && !this.pendingJumpOver
      && (this.getCurrentPlayer()?.pendingDrawKeepCount ?? 0) <= 0) {
      this.endTurn();
    }
  }

  /** End the turn only if there are no more actions and nothing pending to resolve. */
  private maybeEndTurn(): void {
    if (this.actionsRemaining <= 0
      && !this.getCurrentPlayer()?.pendingDiscardDraw
      && !this.pendingInteraction
      && this.pendingFreeBarricadeCount <= 0
      && this.pendingFreeMoveSteps <= 0
      && !this.pendingFreeBait
      && !this.pendingFreeTrap
      && !this.pendingJumpOver
      && (this.getCurrentPlayer()?.pendingDrawKeepCount ?? 0) <= 0) {
      this.endTurn();
    }
  }

  passTurn(playerId: PlayerId): void {
    if (this.playerInEscapeId !== undefined || this.isGameOver() || this.nightChoiceQueue.length > 0) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer()) return;
    if (p.pendingDiscardDraw || this.pendingInteraction) return; // must resolve pending effects before passing
    this.passedPlayerIds.add(playerId);
    this.endTurn();
  }

  deferTurn(playerId: PlayerId): void {
    if (this.playerInEscapeId !== undefined || this.isGameOver() || this.nightChoiceQueue.length > 0) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer()) return;
    if (p.pendingDiscardDraw || this.pendingInteraction) return;
    // Prevent defer when all other alive players have already passed (would cause a stuck state)
    const aliveCount = this.players.filter(pl => pl.isAlive).length;
    if (this.passedPlayerIds.size >= aliveCount - 1) {
      this.log(`${p.name} cannot defer — all other players have already passed.`);
      return;
    }
    this.log(`${p.name} defers their remaining action(s) and will go again after other players.`);
    this.endTurn(); // advance WITHOUT adding to passedPlayerIds
  }

  private endTurn(): void {
    if (this.isGameOver() || this.playerInEscapeId !== undefined) return;
    this.actionsRemaining = 3;
    this.currentMode = '';
    // Clear any pending free-move steps for the player whose turn just ended
    this.pendingFreeMoveSteps = 0;
    this.pendingFreeMovePlayerId = undefined;
    this.pendingFreeMovesPayBarricades = false;
    this.pendingFreeTrap = false;
    this.pendingFreeBarricadeCount = 0;
    this.pendingJumpOver = false;
    this.pendingJumpOverAny = false;
    this.pendingJumpOverSP = 0;
    this.pendingJumpOverNP = 0;

    const aliveCount = this.players.filter(p => p.isAlive).length;
    if (this.passedPlayerIds.size >= aliveCount) {
      this.zombiePhase();
      // Award 1 SP to every surviving player at end of night
      for (const p of this.players) { if (p.isAlive) p.addSurvivalPoints(1); }
      if (this.playerInEscapeId === undefined && !this.isGameOver()) {
        // Snapshot scores at end of this night (after zombie phase)
        this.nightScoreHistory.push(this.players.map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          score: p.survivalPoints + Math.max(p.nicePoints, p.coolPoints),
        })));
        this.generationCount++;
        const survivors = this.players.filter(p => p.isAlive).length;
        this.log(`<b>Day ${this.generationCount}: ${survivors} survivor${survivors !== 1 ? 's' : ''} remaining.</b>`);
        this.passedPlayerIds.clear();
        this.actionsRemaining = 3;
        for (const p of this.players) p.usedActions = [];
        // Rotate who goes first each generation
        const alivePlayers = this.players.filter(p => p.isAlive);
        if (alivePlayers.length > 0) {
          const startPlayer = alivePlayers[this.firstPlayerOffset % alivePlayers.length];
          this.currentTurnIndex = this.players.indexOf(startPlayer);
          this.firstPlayerOffset++;
        } else {
          this.currentTurnIndex = 0;
        }
        this.buildNightChoiceQueue();
        if (this.nightChoiceQueue.length === 0) {
          this.startDraftingPhase();
        }
        // else: wait for resolveNightChoice calls; it will call startDraftingPhase when queue empties
      }
    } else {
      do {
        this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
      } while (!this.getCurrentPlayer().isAlive || this.passedPlayerIds.has(this.getCurrentPlayer().id));
    }
  }

  // ---- Pending interaction resolution ----

  private resolvePendingInteraction(playerId: PlayerId, hex: HexCoordinate): void {
    const pi = this.pendingInteraction!;
    const player = this.getPlayerById(playerId);
    const pname = player?.name ?? 'Player';

    switch (pi.type) {
      case 'destroy_any_barricade': {
        const key = this.findBarricadeAtHex(hex);
        if (key) {
          this.board.getBarricades().delete(key);
          this.log(`${pname} destroyed a barricade.`);
          this.pendingInteraction = undefined;
        } else {
          this.log('No barricade at that hex. Select a highlighted tile.');
        }
        break;
      }

      case 'destroy_any_trap': {
        if (this.board.getTraps().has(hex.key())) {
          this.board.getTraps().delete(hex.key());
          this.log(`${pname} removed a trap.`);
          this.pendingInteraction = undefined;
        } else {
          this.log('No trap there. Select a highlighted tile.');
        }
        break;
      }

      case 'destroy_own_structure': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const trap = this.board.getTraps().get(hex.key());
        if (trap && trap.ownerId === player.id) {
          this.board.getTraps().delete(hex.key());
          this.log(`${pname} removed their own trap.`);
          this.pendingInteraction = undefined;
          break;
        }
        const barKey = this.findOwnBarricadeAtHex(player.id, hex);
        if (barKey) {
          this.board.getBarricades().delete(barKey);
          this.log(`${pname} removed their own barricade.`);
          this.pendingInteraction = undefined;
          break;
        }
        this.log('No own structure there. Select a highlighted tile.');
        break;
      }

      case 'replace_opponent_barricade': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const barKey = this.findOpponentBarricadeAtHex(player.id, hex);
        if (barKey) {
          this.board.getBarricades().get(barKey)!.ownerId = player.id;
          this.log(`${pname} claimed an opponent's barricade!`);
          this.pendingInteraction = undefined;
        } else {
          this.log("No opponent barricade there. Select a highlighted tile.");
        }
        break;
      }

      case 'move_zombie_away': {
        const zombie = this.zombies.find(z => z.isAlive && z.position.equals(hex));
        if (!zombie) { this.log('No zombie there. Select a highlighted tile.'); break; }
        const nearestPlayer = this.players
          .filter(p => p.isAlive)
          .reduce<{ dist: number; player: Player }>((best, p) => {
            const dist = p.position.distanceTo(zombie.position);
            return dist < best.dist ? { dist, player: p } : best;
          }, { dist: Infinity, player: this.players[0] }).player;
        const neighbors = this.board.getNeighbors(zombie.position)
          .filter(n => !this.isPlayerAt(n) && !this.isZombieAt(n));
        if (neighbors.length === 0) {
          this.log('No valid tile to move that zombie.');
          this.pendingInteraction = undefined;
          break;
        }
        const dest = neighbors.reduce<{ dist: number; hex: HexCoordinate }>((best, n) => {
          const dist = n.distanceTo(nearestPlayer.position);
          return dist > best.dist ? { dist, hex: n } : best;
        }, { dist: -1, hex: neighbors[0] }).hex;
        zombie.position = dest;
        this.log(`${pname} moved a zombie away from players.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'trap_relocate_step1': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const trap = this.board.getTraps().get(hex.key());
        if (trap) {
          this.pendingInteraction = { ...pi, type: 'trap_relocate_step2', data: { hexKey: hex.key() } };
          this.log(`${pname}: trap selected. Now choose a destination hex.`);
        } else {
          this.log('No trap there. Select a highlighted tile.');
        }
        break;
      }

      case 'trap_relocate_step2': {
        const srcKey = pi.data?.hexKey;
        if (!srcKey || !player) { this.pendingInteraction = undefined; break; }
        const srcHex = HexCoordinate.fromKey(srcKey);
        if (srcHex.distanceTo(hex) !== 1) {
          this.log('Destination must be adjacent to the trap. Select a highlighted tile.');
          break;
        }
        if (this.board.getTraps().has(hex.key()) || this.isPlayerAt(hex) || this.isZombieAt(hex)) {
          this.log('That hex is occupied. Choose an empty destination.');
          break;
        }
        if (!this.board.isWithinBounds(hex)) {
          this.log('That hex is outside the board.');
          break;
        }
        const trap = this.board.getTraps().get(srcKey);
        if (!trap) { this.pendingInteraction = undefined; break; }
        this.board.getTraps().delete(srcKey);
        this.board.getTraps().set(hex.key(), trap);
        this.log(`${pname} relocated their trap to ${hex.key()}.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'spatial_swap': {
        if (!player) { this.pendingInteraction = undefined; break; }
        if (player.position.distanceTo(hex) !== 1) {
          this.log('Target must be adjacent. Select a highlighted tile.');
          break;
        }
        const targetPlayer = this.players.find(pl => pl.isAlive && pl.id !== player.id && pl.position.equals(hex));
        const targetZombie = this.zombies.find(z => z.isAlive && z.position.equals(hex));
        if (targetPlayer) {
          const tmp = player.position;
          player.position = targetPlayer.position;
          targetPlayer.position = tmp;
          this.log(`${pname} swapped positions with ${targetPlayer.name}!`);
          this.pendingInteraction = undefined;
        } else if (targetZombie) {
          const tmp = player.position;
          player.position = targetZombie.position;
          targetZombie.position = tmp;
          this.log(`${pname} swapped positions with a zombie!`);
          this.pendingInteraction = undefined;
        } else {
          this.log('No player or zombie there. Select a highlighted tile.');
        }
        break;
      }

      case 'heal_player': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const target = this.players.find(pl => pl.isAlive && pl.id !== player.id && pl.position.equals(hex));
        if (!target) { this.log('No ally there. Select a highlighted tile.'); break; }
        if (player.position.distanceTo(hex) > 2) { this.log('Target must be within 2 hexes. Select a highlighted tile.'); break; }
        target.addHealth(1);
        this.log(`${pname} healed ${target.name} for 1 HP.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'heal_player_in_room_simple': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const cprRoom = getTileRoom(player.position.q, player.position.r);
        const cprTarget = this.players.find(pl =>
          pl.isAlive && pl.id !== player.id &&
          getTileRoom(pl.position.q, pl.position.r) === cprRoom &&
          pl.position.equals(hex)
        );
        if (!cprTarget) { this.log('No ally in your room there. Select a highlighted tile.'); break; }
        cprTarget.addHealth(1);
        this.log(`${pname} healed ${cprTarget.name} for 1 HP.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'place_zombie': {
        if (!this.board.isWithinBounds(hex) || this.isPlayerAt(hex) || this.isZombieAt(hex)) {
          this.log('Choose an empty board tile to place the zombie.');
          break;
        }
        this.zombies.push(new Zombie(hex));
        this.log(`${pname} placed a zombie at ${hex.key()}.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'move_player_step1': {
        // Select a target player (alive, not passed, not the activating player)
        if (!player) { this.pendingInteraction = undefined; break; }
        const target1 = this.players.find(pl =>
          pl.isAlive && pl.id !== player.id &&
          !this.passedPlayerIds.has(pl.id as PlayerId) &&
          pl.position.equals(hex)
        );
        if (!target1) {
          this.log('Choose a highlighted active (non-passed) player.');
          break;
        }
        pi.data = { hexKey: hex.key() };
        pi.type = 'move_player_step2';
        this.log(`${pname}: now select a destination tile for ${target1.name}.`);
        break;
      }

      case 'move_player_step2': {
        // Move the previously selected player to an adjacent tile
        if (!player || !pi.data?.hexKey) { this.pendingInteraction = undefined; break; }
        const targetPos = HexCoordinate.fromKey(pi.data.hexKey);
        const targetPlayer = this.players.find(pl => pl.isAlive && pl.position.equals(targetPos));
        if (!targetPlayer) { this.pendingInteraction = undefined; break; }
        const mates = this.board.getNeighbors(targetPlayer.position);
        if (!mates.some(n => n.equals(hex)) || this.isPlayerAt(hex) || this.isZombieAt(hex) || this.board.hasTrap(hex) || this.board.hasBait(hex)) {
          this.log('Choose a valid adjacent empty tile for the target player.');
          break;
        }
        targetPlayer.position = hex;
        player.addCoolPoints(1);
        this.log(`${pname} moved ${targetPlayer.name} to ${hex.key()} (+1 CP).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'destroy_own_barricade_reward': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const barKey = this.findOwnBarricadeAtHex(player.id as PlayerId, hex);
        if (!barKey) { this.log('No own barricade there. Select a highlighted tile.'); break; }
        this.board.getBarricades().delete(barKey);
        this.fireOnStructureDestroyedAt(barKey, player.id);
        player.addSurvivalPoints(1);
        player.addNicePoints(1);
        this.log(`${pname} destroyed their own barricade: +1 SP, +1 NP.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'destroy_opponent_barricade_in_room': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const barKey = this.findOpponentBarricadeAtHex(player.id as PlayerId, hex);
        if (!barKey) { this.log("No opponent barricade there. Select a highlighted tile."); break; }
        const playerRoom = getTileRoom(player.position.q, player.position.r);
        const parts = barKey.split('|');
        const barRoom = parts.length === 2 ? getTileRoom(HexCoordinate.fromKey(parts[0]).q, HexCoordinate.fromKey(parts[0]).r) : undefined;
        if (barRoom !== playerRoom) { this.log("That barricade is not in your room. Select a highlighted tile."); break; }
        const barOwnerId = this.board.getBarricades().get(barKey)?.ownerId;
        this.board.getBarricades().delete(barKey);
        this.fireOnStructureDestroyedAt(barKey, barOwnerId);
        player.addCoolPoints(1);
        player.addGold(4);
        this.log(`${pname} destroyed an opponent's barricade: +1 CP, +4 gold.`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'heal_player_in_room': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const healRoom = getTileRoom(player.position.q, player.position.r);
        const healTarget = this.players.find(pl =>
          pl.isAlive && pl.id !== player.id &&
          pl.hitPoints <= 3 &&
          getTileRoom(pl.position.q, pl.position.r) === healRoom &&
          pl.position.equals(hex)
        );
        if (!healTarget) { this.log('No injured ally in your room there. Select a highlighted tile.'); break; }
        healTarget.addHealth(1);
        player.addNicePoints(1);
        player.addSurvivalPoints(1);
        this.log(`${pname} healed ${healTarget.name} for 1 HP (+1 NP, +1 SP).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'blow_up_own_trap': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const trap = this.board.getTraps().get(hex.key());
        if (!trap || trap.ownerId !== player.id) { this.log('No own trap there. Select a highlighted tile.'); break; }
        this.board.getTraps().delete(hex.key());
        this.fireOnStructureDestroyedAt(hex.key());
        const neighbors = this.board.getNeighbors(hex);
        let killCount = 0;
        for (const n of neighbors) {
          const z = this.zombies.find(zz => zz.isAlive && zz.position.equals(n));
          if (z) { z.setDead(); killCount++; }
        }
        if (killCount > 0) {
          player.addSurvivalPoints(1);
          player.addNicePoints(killCount);
          this.log(`${pname} blew up their trap, killing ${killCount} zombie(s): +1 SP, +${killCount} NP.`);
        } else {
          this.log(`${pname} blew up their trap, but no adjacent zombies were killed.`);
        }
        this.pendingInteraction = undefined;
        break;
      }

      case 'own_trap_move_step1': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const trap2 = this.board.getTraps().get(hex.key());
        if (!trap2 || trap2.ownerId !== player.id) { this.log('No own trap there. Select a highlighted tile.'); break; }
        pi.data = { hexKey: hex.key() };
        pi.type = 'own_trap_move_step2';
        this.log(`${pname}: trap selected. Now choose a destination within 2 steps.`);
        break;
      }

      case 'own_trap_move_step2': {
        if (!player || !pi.data?.hexKey) { this.pendingInteraction = undefined; break; }
        const srcTrap = this.board.getTraps().get(pi.data.hexKey);
        if (!srcTrap) { this.pendingInteraction = undefined; break; }
        const srcHex = HexCoordinate.fromKey(pi.data.hexKey);
        if (srcHex.distanceTo(hex) > 2) { this.log('Destination must be within 2 steps.'); break; }
        if (this.board.getTraps().has(hex.key()) || this.isPlayerAt(hex) || this.isZombieAt(hex)) {
          this.log('That hex is occupied. Choose an empty destination.'); break;
        }
        this.board.getTraps().delete(pi.data.hexKey);
        this.board.getTraps().set(hex.key(), srcTrap);
        player.addCoolPoints(1);
        this.log(`${pname} moved their trap to ${hex.key()} (+1 CP).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'opp_trap_move_step1': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const oppTrap = this.board.getTraps().get(hex.key());
        if (!oppTrap || oppTrap.ownerId === player.id) { this.log("No opponent's trap there. Select a highlighted tile."); break; }
        pi.data = { hexKey: hex.key() };
        pi.type = 'opp_trap_move_step2';
        this.log(`${pname}: opponent's trap selected. Now choose a destination within 2 steps.`);
        break;
      }

      case 'opp_trap_move_step2': {
        if (!player || !pi.data?.hexKey) { this.pendingInteraction = undefined; break; }
        const srcOppTrap = this.board.getTraps().get(pi.data.hexKey);
        if (!srcOppTrap) { this.pendingInteraction = undefined; break; }
        const srcOppHex = HexCoordinate.fromKey(pi.data.hexKey);
        if (srcOppHex.distanceTo(hex) > 2) { this.log('Destination must be within 2 steps.'); break; }
        if (this.board.getTraps().has(hex.key()) || this.isPlayerAt(hex) || this.isZombieAt(hex)) {
          this.log('That hex is occupied. Choose an empty destination.'); break;
        }
        this.board.getTraps().delete(pi.data.hexKey);
        this.board.getTraps().set(hex.key(), srcOppTrap);
        player.addCoolPoints(1);
        this.log(`${pname} moved an opponent's trap to ${hex.key()} (+1 CP).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'steal_gold': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const stealTarget = this.players.find(pl =>
          pl.isAlive && pl.id !== player.id &&
          player.position.distanceTo(pl.position) <= 2 &&
          pl.position.equals(hex)
        );
        if (!stealTarget) { this.log('No valid target there. Select a highlighted player.'); break; }
        const stolen = Math.min(4, stealTarget.gold);
        stealTarget.spendGold(stolen);
        player.addGold(stolen);
        player.addCoolPoints(1);
        this.log(`${pname} stole ${stolen} gold from ${stealTarget.name} (+1 CP).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'coach_destroy_adjacent': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const adjHexes = this.board.getNeighbors(player.position);
        // Check for opponent trap at hex
        const oppTrapAdj = this.board.getTraps().get(hex.key());
        if (oppTrapAdj && oppTrapAdj.ownerId !== player.id && adjHexes.some(n => n.equals(hex))) {
          this.board.getTraps().delete(hex.key());
          this.fireOnStructureDestroyedAt(hex.key());
          player.addCoolPoints(1);
          this.log(`${pname} destroyed an adjacent opponent trap (+1 CP).`);
          this.pendingInteraction = undefined;
          break;
        }
        // Check for opponent barricade endpoint at hex
        const coachBarKey = this.findOpponentBarricadeAtHex(player.id as PlayerId, hex);
        if (coachBarKey) {
          const bParts = coachBarKey.split('|');
          const isAdj = bParts.length === 2 && (
            adjHexes.some(n => n.key() === bParts[0] || n.key() === bParts[1]) ||
            player.position.key() === bParts[0] || player.position.key() === bParts[1]
          );
          if (isAdj) {
            const coachBarOwnerId = this.board.getBarricades().get(coachBarKey)?.ownerId;
            this.board.getBarricades().delete(coachBarKey);
            this.fireOnStructureDestroyedAt(coachBarKey, coachBarOwnerId);
            player.addCoolPoints(1);
            this.log(`${pname} destroyed an adjacent opponent barricade (+1 CP).`);
            this.pendingInteraction = undefined;
            break;
          }
        }
        this.log('No adjacent opponent structure there. Select a highlighted tile.');
        break;
      }

      case 'teleport_within_2': {
        if (!player) { this.pendingInteraction = undefined; break; }
        if (player.position.distanceTo(hex) > 2) { this.log('Target must be within 2 steps. Select a highlighted tile.'); break; }
        if (this.isPlayerAt(hex) && !hex.equals(player.position)) { this.log('That tile is occupied. Select a highlighted tile.'); break; }
        if (this.isZombieAt(hex)) { this.log('A zombie is there. Select a highlighted tile.'); break; }
        player.position = hex;
        this.log(`${pname} teleported to ${hex.key()} (Grappling Hook).`);
        this.pendingInteraction = undefined;
        break;
      }

      case 'move_any_zombie_one_step': {
        if (!player) { this.pendingInteraction = undefined; break; }
        const mazZombie = this.zombies.find(z => z.isAlive && z.position.equals(hex));
        if (!mazZombie) { this.log('Select a highlighted zombie to move.'); break; }
        this.pendingInteraction = { type: 'move_any_zombie_one_step_place', playerId: pi.playerId, cardName: pi.cardName, data: { hexKey: hex.key() } };
        this.log(`${pname} selected a zombie. Now select an adjacent tile to move it to.`);
        break;
      }

      case 'terror_sprint': {
        if (!player) { this.pendingInteraction = undefined; break; }
        if (hex.q !== player.position.q && hex.r !== player.position.r) {
          this.log('Must select a tile in the same row or column. Select a highlighted tile.');
          break;
        }
        if (this.isPlayerAt(hex) && !hex.equals(player.position)) {
          this.log('That tile is occupied. Select a highlighted tile.');
          break;
        }
        if (this.isZombieAt(hex)) {
          this.log('A zombie is there. Select a highlighted tile.');
          break;
        }
        player.position = hex;
        this.log(`${pname} sprinted to ${hex.key()} (Terror Sprint).`);
        this.pendingInteraction = undefined;
        break;
      }

      default: {
        // Handle move_adjacent_zombie_to_room:ROOM — step 1: select an adjacent zombie
        if (pi.type.startsWith('move_adjacent_zombie_to_room:')) {
          if (!player) { this.pendingInteraction = undefined; break; }
          const zombie = this.zombies.find(z => z.isAlive && z.position.equals(hex));
          if (!zombie) { this.log('Select an adjacent zombie to move.'); break; }
          if (player.position.distanceTo(hex) !== 1) { this.log('Select a zombie adjacent to you.'); break; }
          const targetRoom = pi.type.slice('move_adjacent_zombie_to_room:'.length);
          // Store selected zombie hex and advance to step 2
          this.pendingInteraction = { type: `move_adjacent_zombie_place:${targetRoom}`, playerId: pi.playerId, cardName: pi.cardName, data: { hexKey: hex.key() } };
          const room = targetRoom.replace(/-/g, ' ');
          this.log(`${pname} selected a zombie. Now select a tile in the ${room} to move it to.`);
          break;
        }
        // Handle move_adjacent_zombie_place:ROOM — step 2: select destination tile in room
        if (pi.type.startsWith('move_adjacent_zombie_place:')) {
          if (!player || !pi.data?.hexKey) { this.pendingInteraction = undefined; break; }
          const targetRoom = pi.type.slice('move_adjacent_zombie_place:'.length);
          const hexRoom = getTileRoom(hex.q, hex.r);
          if (hexRoom !== targetRoom) {
            this.log(`Choose a tile in the ${targetRoom.replace(/-/g, ' ')}.`);
            break;
          }
          if (this.isPlayerAt(hex) || this.isZombieAt(hex) || this.board.hasTrap(hex)) {
            this.log('That tile is occupied. Choose an open tile.');
            break;
          }
          const zombiePos = HexCoordinate.fromKey(pi.data.hexKey);
          const zombie = this.zombies.find(z => z.isAlive && z.position.equals(zombiePos));
          if (!zombie) { this.pendingInteraction = undefined; break; }
          zombie.position = hex;
          this.log(`${pname} moved a zombie to the ${targetRoom.replace(/-/g, ' ')} (${pi.cardName}).`);
          this.pendingInteraction = undefined;
          break;
        }
        // Handle teleport_to_room:* (e.g. Underground Passageway → Janitor's Closet)
        if (pi.type.startsWith('teleport_to_room:')) {
          if (!player) { this.pendingInteraction = undefined; break; }
          const targetRoom = pi.type.slice('teleport_to_room:'.length);
          const hexRoom = getTileRoom(hex.q, hex.r);
          if (hexRoom !== targetRoom) {
            this.log(`Choose an open tile in the target room.`);
            break;
          }
          if (this.isPlayerAt(hex) && !hex.equals(player.position)) {
            this.log('That tile is occupied by another player. Choose an empty tile.');
            break;
          }
          player.position = hex;
          this.log(`${pname} teleported to ${targetRoom.replace(/-/g, ' ')}.`);
          this.pendingInteraction = undefined;
          break;
        }
        // Handle teleport_within_N (generic radius teleport, e.g. Long Jump radius 3)
        if (pi.type.startsWith('teleport_within_')) {
          if (!player) { this.pendingInteraction = undefined; break; }
          const radius = parseInt(pi.type.slice('teleport_within_'.length), 10);
          if (player.position.distanceTo(hex) > radius) { this.log(`Target must be within ${radius} steps. Select a highlighted tile.`); break; }
          if (this.isPlayerAt(hex) && !hex.equals(player.position)) { this.log('That tile is occupied. Select a highlighted tile.'); break; }
          if (this.isZombieAt(hex)) { this.log('A zombie is there. Select a highlighted tile.'); break; }
          player.position = hex;
          this.log(`${pname} teleported to ${hex.key()} (${pi.cardName}).`);
          this.pendingInteraction = undefined;
          break;
        }
        // Handle move_any_zombie_one_step_place — step 2: select destination adjacent to zombie
        if (pi.type === 'move_any_zombie_one_step_place') {
          if (!player || !pi.data?.hexKey) { this.pendingInteraction = undefined; break; }
          const zombiePos = HexCoordinate.fromKey(pi.data.hexKey);
          const mazZomb = this.zombies.find(z => z.isAlive && z.position.equals(zombiePos));
          if (!mazZomb) { this.pendingInteraction = undefined; break; }
          if (zombiePos.distanceTo(hex) !== 1) { this.log('Select a tile adjacent to the zombie.'); break; }
          if (this.isPlayerAt(hex) || this.isZombieAt(hex) || this.board.hasTrap(hex)) { this.log('That tile is occupied. Choose an open tile.'); break; }
          mazZomb.position = hex;
          this.log(`${pname} moved a zombie to ${hex.key()} (${pi.cardName}).`);
          this.pendingInteraction = undefined;
          break;
        }
        // Handle give_cards_to_player:N — player selects target player to give N cards
        if (pi.type.startsWith('give_cards_to_player:')) {
          if (!player) { this.pendingInteraction = undefined; break; }
          const giveCount = parseInt(pi.type.slice('give_cards_to_player:'.length), 10);
          const target = this.players.find(pl => pl.isAlive && pl.id !== player.id && pl.position.equals(hex));
          if (!target) { this.log('Select a highlighted player to give cards to.'); break; }
          this.pendingDiscardRecipientId = target.id as PlayerId;
          const actualGive = Math.min(giveCount, player.cardsInHand.length);
          if (actualGive <= 0) { this.log(`${pname} has no cards to give.`); this.pendingInteraction = undefined; break; }
          this.startPendingDiscard(player, actualGive, 0);
          this.log(`${pname} chose to give ${actualGive} card(s) to ${target.name}. Select card(s) to send.`);
          this.pendingInteraction = undefined;
          break;
        }
        this.pendingInteraction = undefined;
        break;
      }
    }
    // If the interaction was fully resolved in this call, check if the turn should now end
    if (this.pendingInteraction === undefined) {
      this.maybeEndTurn();
    }
  }

  /** Find the edgeKey of any barricade that has `hex` as one of its endpoints. */
  private findBarricadeAtHex(hex: HexCoordinate): string | undefined {
    for (const key of this.board.getBarricades().keys()) {
      const parts = key.split('|');
      if (parts.length === 2 &&
        (HexCoordinate.fromKey(parts[0]).equals(hex) || HexCoordinate.fromKey(parts[1]).equals(hex))) {
        return key;
      }
    }
    return undefined;
  }

  /** Find the edgeKey of a barricade owned by `ownerId` that has `hex` as an endpoint. */
  private findOwnBarricadeAtHex(ownerId: PlayerId, hex: HexCoordinate): string | undefined {
    for (const [key, bar] of this.board.getBarricades()) {
      if (bar.ownerId !== ownerId) continue;
      const parts = key.split('|');
      if (parts.length === 2 &&
        (HexCoordinate.fromKey(parts[0]).equals(hex) || HexCoordinate.fromKey(parts[1]).equals(hex))) {
        return key;
      }
    }
    return undefined;
  }

  /** Find the edgeKey of a barricade NOT owned by `myId` that has `hex` as an endpoint. */
  private findOpponentBarricadeAtHex(myId: PlayerId, hex: HexCoordinate): string | undefined {
    for (const [key, bar] of this.board.getBarricades()) {
      if (bar.ownerId === myId) continue;
      const parts = key.split('|');
      if (parts.length === 2 &&
        (HexCoordinate.fromKey(parts[0]).equals(hex) || HexCoordinate.fromKey(parts[1]).equals(hex))) {
        return key;
      }
    }
    return undefined;
  }

  // ---- Zombie phase ----
  private zombiePhase(): void {
    const speed = this.getZombieSpeed();
    // Clear previous night's zombie trails
    this.zombieTrailHexKeys.clear();
    this.zombieTrailMoves = [];

    for (let step = 0; step < speed && this.playerInEscapeId === undefined && !this.isGameOver(); step++) {
      // Sort zombies by bait proximity for deterministic move order
      this.zombies.sort((a, b) => {
        const aDist = this.getMinBaitDist(a);
        const bDist = this.getMinBaitDist(b);
        if (aDist !== bDist) return aDist - bDist;
        return this.getClosestBaitTileID(a) - this.getClosestBaitTileID(b);
      });

      const activeZombies = [...this.zombies];
      for (const z of activeZombies) {
        if (!z.isAlive) continue;
        // Record zombie's position before it moves (for trail display)
        const trailFromKey = z.position.key();
        this.zombieTrailHexKeys.add(trailFromKey);
        z.takeTurn(
          this.board, step,
          (h) => this.isZombieAt(h),
          (h) => this.isPlayerAt(h),
          (ownerId) => {
            const barOwner = this.getPlayerById(ownerId as PlayerId);
            this.log(`Barricade held! (${barOwner?.name ?? 'Unknown'}'s barricade)`);
            this.accumulateNight(ownerId, 1);
          },
          (ownerId, ek) => {
            const barOwner = this.getPlayerById(ownerId as PlayerId);
            this.log(`Barricade broken! (${barOwner?.name ?? 'Unknown'}'s barricade)`);
            this.fireOnStructureDestroyedAt(ek, ownerId);
          },
          (pid) => this.setPlayerInEscape(pid as PlayerId),
          (ownerId, trapPos) => {
            this.log(`Trap at ${trapPos.key()} killed a zombie!`);
            const owner = this.getPlayerById(ownerId as PlayerId);
            if (owner) {
              owner.addNicePoints(1);
              this.fireOnNPGained(owner);
              // Cheerleader (Von Trap) earns 3 SP per trap kill; others earn 1 SP
              const trapSP = owner.selectedHero?.id === HeroId.VON_TRAP ? 3 : 1;
              owner.addSurvivalPoints(trapSP);
              this.fireOnPersonalZombieKill(owner);
            }
            this.fireOnStructureDestroyedAt(trapPos.key());
            this.fireOnAnyZombieKilled();
          },
          () => this.log('Trap failed to activate.'),
          (ownerId) => {
            this.log(`Bait consumed by zombie (owner: ${ownerId})`);
            this.accumulateNight(ownerId, 1);
          },
          (hexKey) => {
            const t = this.board.getTraps().get(hexKey);
            if (!t) return undefined;
            const owner = this.getPlayerById(t.ownerId as PlayerId);
            return { ownerId: t.ownerId, successRate: this.getAdjustedTrapSuccessRate(owner ?? undefined) };
          },
          (h) => {
            const p = this.players.find(pl => pl.isAlive && pl.position.equals(h));
            return p ? { id: p.id, hitPoints: p.hitPoints, trapSuccessRate: p.trapSuccessRate } : undefined;
          },
          (ek) => {
            const b = this.board.getBarricades().get(ek);
            if (!b) return undefined;
            const owner = this.getPlayerById(b.ownerId as PlayerId);
            return { ownerId: b.ownerId, barricadeFailRate: this.getAdjustedBarricadeFailRate(owner ?? undefined) };
          },
          (hexKey) => this.board.getBaits().get(hexKey),
          () => this.players.filter(p => p.isAlive).map(p => p.position),
          (ownerId) => this.getAdjustedBaitRangeForOwner(ownerId),
        );
        // Record where the zombie landed (for arrow rendering)
        const trailToKey = z.position.key();
        if (trailToKey !== trailFromKey) {
          this.zombieTrailMoves.push({ fromKey: trailFromKey, toKey: trailToKey });
        }

        if (this.playerInEscapeId !== undefined || this.isGameOver()) break;
      }

      // Purge dead zombies after each movement step
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        if (!this.zombies[i].isAlive) this.zombies.splice(i, 1);
      }
    }

    // Step 3: Spawn
    this.spawnZombiesByTileID();
    // Step 4: Income + bait cleanup
    this.incomePhase();
    this.computeAdjacentProximityPoints(); // must be called before bait cleanup
    this.board.clearBaits();
    this.log('Night ended: Baits removed.');
  }

  private getZombieSpeed(): number {
    if (this.generationCount <= 3) return 1;
    if (this.generationCount <= 6) return 2;
    if (this.generationCount <= 9) return 3;
    return 4;
  }

  private getMinBaitDist(z: Zombie): number {
    let min = 4;
    for (const [hexKey] of this.board.getBaits()) {
      const d = z.position.distanceTo(HexCoordinate.fromKey(hexKey));
      if (d < min) min = d;
    }
    return min;
  }

  private getClosestBaitTileID(z: Zombie): number {
    let minDist = 4;
    let bestTileID = 999;
    for (const [hexKey] of this.board.getBaits()) {
      const baitHex = HexCoordinate.fromKey(hexKey);
      const d = z.position.distanceTo(baitHex);
      const tid = this.board.getTileID(baitHex);
      if (d < minDist || (d === minDist && tid < bestTileID)) {
        minDist = d;
        bestTileID = tid;
      }
    }
    return bestTileID;
  }

  private spawnZombiesByTileID(): void {
    const totalSP = this.players.filter(p => p.isAlive).reduce((s, p) => s + p.survivalPoints, 0);
    const spawnCount = Math.floor(totalSP / 15);
    if (spawnCount <= 0) return;
    let placed = 0;
    // Prefer Gymnasium tiles; fall back to any open tile if the gym is full
    const gymTiles = this.board.getGymnasiumTiles();
    const gymKeys = new Set(gymTiles.map(h => h.key()));
    const orderedCandidates = [
      ...gymTiles,
      ...this.board.getTilesInIDOrder().filter(h => !gymKeys.has(h.key())),
    ];
    for (const h of orderedCandidates) {
      if (placed >= spawnCount) break;
      if (!this.isPlayerAt(h) && !this.isZombieAt(h) && !this.board.hasTrap(h) && !this.board.hasBait(h)) {
        this.zombies.push(new Zombie(h));
        placed++;
      }
    }
    if (placed > 0) this.log(`Spawned ${placed} zombie(s) in the Gymnasium (SP/15=${spawnCount}).`);
  }

  private incomePhase(): void {
    for (const p of this.players) {
      if (!p.isAlive) continue;
      p.addGold(p.survivalPoints + p.goldProduction);
    }
  }

  private accumulateNight(ownerId: string, amount: number): void {
    const owner = this.getPlayerById(ownerId as PlayerId);
    if (!owner?.isAlive) return;
    this.pendingNightPoints.set(ownerId, (this.pendingNightPoints.get(ownerId) ?? 0) + amount);
  }

  /** Count each alive player's traps/baits/barricades that are directly adjacent to an opponent. */
  private computeAdjacentProximityPoints(): void {
    for (const owner of this.players) {
      if (!owner.isAlive) continue;
      const opponents = this.players.filter(p => p.isAlive && p.id !== owner.id);
      if (opponents.length === 0) continue;
      let count = 0;
      for (const [hexKey, trap] of this.board.getTraps()) {
        if (trap.ownerId !== owner.id) continue;
        const h = HexCoordinate.fromKey(hexKey);
        for (const opp of opponents) if (h.distanceTo(opp.position) <= 1) count++;
      }
      for (const [hexKey, baitOwnerId] of this.board.getBaits()) {
        if (baitOwnerId !== owner.id) continue;
        const h = HexCoordinate.fromKey(hexKey);
        for (const opp of opponents) if (h.distanceTo(opp.position) <= 1) count++;
      }
      for (const [ek, bar] of this.board.getBarricades()) {
        if (bar.ownerId !== owner.id) continue;
        const parts = ek.split('|');
        if (parts.length !== 2) continue;
        const hexA = HexCoordinate.fromKey(parts[0]);
        const hexB = HexCoordinate.fromKey(parts[1]);
        for (const opp of opponents) {
          if (opp.position.equals(hexA) || opp.position.equals(hexB)) count++;
        }
      }
      if (count > 0) this.accumulateNight(owner.id, count);
    }
  }

  /** Build ordered queue of players who need to choose NP or CP for the night. */
  private buildNightChoiceQueue(): void {
    this.nightChoiceQueue = this.players
      .filter(p => p.isAlive && (this.pendingNightPoints.get(p.id) ?? 0) > 0)
      .map(p => p.id as PlayerId);
    if (this.nightChoiceQueue.length > 0) {
      const names = this.nightChoiceQueue
        .map(pid => this.getPlayerById(pid)?.name ?? pid).join(', ');
      this.log(`Night rewards pending — ${names} must choose NP or CP.`);
    }
  }

  /** Resolve a player's night choice: all accumulated points become either NP or CP. */
  resolveNightChoice(playerId: PlayerId, choice: 'np' | 'cp'): void {
    if (this.nightChoiceQueue[0] !== playerId) return;
    const points = this.pendingNightPoints.get(playerId) ?? 0;
    const p = this.getPlayerById(playerId);
    if (p && points > 0) {
      if (choice === 'np') {
        const before = p.nicePoints;
        p.addNicePoints(points);
        this.fireOnNPGained(p);
        this.log(`${p.name} took night rewards as NP: +${points} (${before}→${p.nicePoints}).`);
      } else {
        const before = p.coolPoints;
        p.addCoolPoints(points);
        this.fireOnCPGained(p);
        this.log(`${p.name} took night rewards as CP: +${points} (${before}→${p.coolPoints}).`);
      }
    }
    this.pendingNightPoints.delete(playerId);
    this.nightChoiceQueue.shift();
    if (this.nightChoiceQueue.length === 0) {
      this.startDraftingPhase();
    }
  }

  spawnInitialZombies(count: number): void {
    this.spawnZombies(count);
  }

  // ---- Escape mode ----

  setPlayerInEscape(playerId: PlayerId): void {
    const p = this.getPlayerById(playerId);
    if (!p) return;
    p.takeDamage(1);
    this.fireOnDamageTaken(p);
    if (!p.isAlive) {
      this.log(`${p.name} was bitten and eliminated!`);
      this.checkLastSurvivorAndCleanup();
      return;
    }
    this.log(`${p.name} was bitten! (${p.hitPoints} HP remaining)`);
    this.playerInEscapeId = playerId;
    this.calculateValidEscapeHexes(p);
    this.log(`ESCAPE! ${p.name} must move to an adjacent tile!`);
  }

  private checkLastSurvivorAndCleanup(): void {
    const alive = this.players.filter(p => p.isAlive);
    if (alive.length === 1 && !alive[0].isLastSurvivor) {
      const last = alive[0];
      last.isLastSurvivor = true;
      last.addSurvivalPoints(5);
      this.log(`<b>${last.name}</b> is the last survivor! +5 bonus SP!`);
    }
    if (alive.length === 0) {
      // End-of-game cleanup: award 1 SP per active trap/barricade to its owner
      let bonusLog: string[] = [];
      for (const [, trap] of this.board.getTraps()) {
        const owner = this.getPlayerById(trap.ownerId as PlayerId);
        if (owner) { owner.addSurvivalPoints(1); bonusLog.push(`${owner.name} +1 SP (trap)`); }
      }
      for (const [, bar] of this.board.getBarricades()) {
        const owner = this.getPlayerById(bar.ownerId as PlayerId);
        if (owner) { owner.addSurvivalPoints(1); bonusLog.push(`${owner.name} +1 SP (barricade)`); }
      }
      if (bonusLog.length > 0) this.log(`End-game bonus SP: ${bonusLog.join(', ')}.`);
      this.board.getTraps().clear();
      this.board.getBarricades().clear();
    }
  }

  private calculateValidEscapeHexes(p: Player): void {
    this.validEscapeHexes = [];

    // Check whether an active passive (e.g. Emergency Retreat) grants extra escape steps
    let moveSteps = 1;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      const bonus = icard?.behavior?.passive?.onEscapeMove?.moveSteps;
      if (bonus != null && bonus > moveSteps) moveSteps = bonus;
    }

    if (moveSteps <= 1) {
      // Original single-step logic
      for (const neighbor of this.board.getNeighbors(p.position)) {
        if (
          !this.isPlayerAt(neighbor) &&
          !this.isZombieAt(neighbor) &&
          !this.board.hasTrap(neighbor) &&
          !this.board.hasBarricade(p.position, neighbor)
        ) {
          this.validEscapeHexes.push(neighbor);
        }
      }
      return;
    }

    // Multi-step BFS flood-fill
    const visited = new Set<string>();
    visited.add(p.position.key());
    let frontier: HexCoordinate[] = [p.position];

    for (let step = 0; step < moveSteps; step++) {
      const nextFrontier: HexCoordinate[] = [];
      for (const current of frontier) {
        for (const neighbor of this.board.getNeighbors(current)) {
          const key = neighbor.key();
          if (visited.has(key)) continue;
          // Can't cross a barricade or pass through a zombie
          if (this.board.hasBarricade(current, neighbor)) continue;
          if (this.isZombieAt(neighbor)) continue;
          visited.add(key);
          // Valid escape destination: unoccupied by another player and no trap
          if (!this.isPlayerAt(neighbor) && !this.board.hasTrap(neighbor)) {
            this.validEscapeHexes.push(neighbor);
          }
          nextFrontier.push(neighbor);
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
  }

  private clearEscapeState(): void {
    this.playerInEscapeId = undefined;
    this.validEscapeHexes = [];
    if (this.isGameOver()) return;

    const aliveCount = this.players.filter(p => p.isAlive).length;
    if (this.passedPlayerIds.size >= aliveCount) {
      // The zombie phase already ran (with spawn + income) before escape was triggered.
      // Do NOT re-run zombiePhase — just advance to the next generation / drafting.
      this.generationCount++;
      this.passedPlayerIds.clear();
      this.currentTurnIndex = 0;
      this.actionsRemaining = 3;
      for (const p of this.players) p.usedActions = [];
      this.startDraftingPhase();
    }
    // If not all players had passed (rare mid-generation escape), normal turn flow resumes.
  }

  // ---- Drafting phase ----

  private startDraftingPhase(): void {
    this._draftingPhase = true;
    for (const p of this.players) {
      if (!p.isAlive) continue;
      p.temporaryHand = [];
      p.selectedDraftCards = [];
      for (let i = 0; i < 4 && this.deck.length > 0; i++) {
        p.temporaryHand.push(this.deck.shift()!);
      }
    }
  }

  toggleSelectDraftCard(playerId: PlayerId, cardName: string): void {
    if (!this._draftingPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;
    const card = p.temporaryHand.find(c => c.name === cardName);
    if (!card) return;
    const idx = p.selectedDraftCards.indexOf(card);
    if (idx >= 0) {
      p.selectedDraftCards.splice(idx, 1);
    } else {
      p.selectedDraftCards.push(card);
    }
  }

  confirmDraftSelection(playerId: PlayerId): void {
    if (!this._draftingPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;

    const costPerCard = this.getAdjustedDraftCostPerCard(p);
    const paidCount = this.settings.firstCardFreeNightDraft ? Math.max(0, p.selectedDraftCards.length - 1) : p.selectedDraftCards.length;
    const totalCost = paidCount * costPerCard;
    if (p.gold < totalCost) {
      this.log('Not enough gold to purchase selected cards!');
      return;
    }

    p.spendGold(totalCost);
    p.cardsInHand.push(...p.selectedDraftCards);
    p.temporaryHand = [];
    p.selectedDraftCards = [];
    this.checkDraftingComplete();
  }

  skipDraftCard(playerId: PlayerId): void {
    if (!this._draftingPhase) return;
    const p = this.getPlayerById(playerId);
    if (!p) return;
    p.temporaryHand = [];
    p.selectedDraftCards = [];
    this.checkDraftingComplete();
  }

  private checkDraftingComplete(): void {
    const allDone = this.players.filter(p => p.isAlive).every(p => p.temporaryHand.length === 0);
    if (allDone) {
      this._draftingPhase = false;
      this.finishGeneration();
    }
  }

  private finishGeneration(): void {
    this.log(`Draft complete. Night ${this.generationCount} begins.`);
    this.passedPlayerIds.clear();
    this.currentTurnIndex = 0;
    this.actionsRemaining = 3;
  }

  // ---- Card play ----

  private snapStats(p: Player): { gold: number; sp: number; cp: number; np: number; gp: number; hp: number; handSize: number } {
    return { gold: p.gold, sp: p.survivalPoints, cp: p.coolPoints, np: p.nicePoints, gp: p.goldProduction, hp: p.hitPoints, handSize: p.cardsInHand.length };
  }

  private logRichAction(
    p: Player, verb: string,
    before: ReturnType<Game['snapStats']>, after: ReturnType<Game['snapStats']>,
    cost = 0,
  ): void {
    const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`;
    const d = {
      np: after.np - before.np, cp: after.cp - before.cp,
      sp: after.sp - before.sp, gp: after.gp - before.gp,
      gold: after.gold - before.gold, hp: after.hp - before.hp,
    };
    const parts: string[] = [];
    if (d.np) parts.push(`<span class="log-np">${fmt(d.np)} NP (${before.np}→${after.np})</span>`);
    if (d.cp) parts.push(`<span class="log-cp">${fmt(d.cp)} CP (${before.cp}→${after.cp})</span>`);
    if (d.sp) parts.push(`<span class="log-sp">${fmt(d.sp)} SP (${before.sp}→${after.sp})</span>`);
    if (d.gp) parts.push(`<span class="log-gp">${fmt(d.gp)} GP (${before.gp}→${after.gp})</span>`);
    if (d.gold) parts.push(`<span class="log-gold">${fmt(d.gold)} gold (${before.gold}→${after.gold})</span>`);
    if (d.hp) parts.push(`<span class="log-hp">${fmt(d.hp)} HP (${before.hp}→${after.hp})</span>`);
    const header = `<b>${p.name}</b> ${verb}` +
      (cost > 0 ? ` for <span class="log-goldcost">${cost} gold</span>` : '');
    const body = parts.length ? `<br><span class="log-indent">→ ${parts.join(' · ')}</span>` : '';
    this.gameLog.push(header + body);
  }

  private logRichCardPlay(
    p: Player, cardName: string, cost: number,
    before: ReturnType<Game['snapStats']>, after: ReturnType<Game['snapStats']>,
    verb = 'played',
  ): void {
    const fmt = (n: number) => n > 0 ? `+${n}` : `${n}`;
    const d = {
      np: after.np - before.np, cp: after.cp - before.cp,
      sp: after.sp - before.sp, gp: after.gp - before.gp,
      gold: after.gold - before.gold, hp: after.hp - before.hp,
      cards: after.handSize - before.handSize,
    };
    const parts: string[] = [];
    if (d.np) parts.push(`<span class="log-np">${fmt(d.np)} NP (${before.np}→${after.np})</span>`);
    if (d.cp) parts.push(`<span class="log-cp">${fmt(d.cp)} CP (${before.cp}→${after.cp})</span>`);
    if (d.sp) parts.push(`<span class="log-sp">${fmt(d.sp)} SP (${before.sp}→${after.sp})</span>`);
    if (d.gp) parts.push(`<span class="log-gp">${fmt(d.gp)} GP (${before.gp}→${after.gp})</span>`);
    if (d.gold) parts.push(`<span class="log-gold">${fmt(d.gold)} gold (${before.gold}→${after.gold})</span>`);
    if (d.hp) parts.push(`<span class="log-hp">${fmt(d.hp)} HP (${before.hp}→${after.hp})</span>`);
    if (d.cards > 0) parts.push(`<span class="log-card-draw">drew ${d.cards} card${d.cards > 1 ? 's' : ''}</span>`);
    else if (d.cards < -1) { const extra = -d.cards - 1; parts.push(`<span class="log-card-draw">discarded ${extra} card${extra > 1 ? 's' : ''}</span>`); }
    const header = `<b>${p.name}</b> ${verb} <span class="log-cardname">"${cardName}"</span>` +
      (cost > 0 ? ` for <span class="log-goldcost">${cost} gold</span>` : '');
    const body = parts.length ? `<br><span class="log-indent">→ ${parts.join(' · ')}</span>` : '';
    this.gameLog.push(header + body);
  }

  playCard(playerId: PlayerId, cardName: string): void {
    if (this._setupPhase || this._draftingPhase || this.isGameOver() || this.nightChoiceQueue.length > 0) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer() || this.actionsRemaining <= 0) return;

    const card = p.cardsInHand.find(c => c.name === cardName);
    if (!card) return;

    const icard = CardRegistry.get(card.name as CardName);
    if (icard) {
      // Phase 5 typed path: requirement check, cost deduction, bonus, behavior execution
      const ctx = { board: this.board, players: this.players, zombies: this.zombies };
      if (!RequirementEvaluator.meets(p, icard.requirements, ctx)) return;
      const adjustedCost = this.getAdjustedCardCost(p, card);
      if (p.gold < adjustedCost) {
        this.log(`${p.name}: Not enough gold to play "${cardName}" (need ${adjustedCost}, have ${p.gold}).`);
        return;
      }
      const before = this.snapStats(p);
      p.spendGold(adjustedCost);
      p.cardsInHand = p.cardsInHand.filter(c => c !== card);
      if (icard.cardType === CardType.PASSIVE) {
        p.activePassives.push(card);
        BehaviorExecutor.execute(icard.behavior, p, this, card.name);
      } else if (icard.cardType === CardType.ACTION) {
        p.activeActions.push(card);
        // Apply one-time purchase gain for ACTION cards if specified (e.g. Bait Launcher: +1 SP)
        const pg = icard.behavior?.purchaseGain;
        if (pg) {
          if (pg.sp != null) p.addSurvivalPoints(pg.sp);
          if (pg.np != null) { p.addNicePoints(pg.np); if (pg.np > 0) this.fireOnNPGained(p); }
          if (pg.cp != null) { p.addCoolPoints(pg.cp); if (pg.cp > 0) this.fireOnCPGained(p); }
          if (pg.gold != null) p.addGold(pg.gold);
          if (pg.hp != null) p.addHealth(pg.hp);
          if (pg.gp != null) p.goldProduction += pg.gp;
        }
        // ACTION cards execute their behavior only when activated, not when purchased
      } else {
        p.playedCards.push(card);
        BehaviorExecutor.execute(icard.behavior, p, this, card.name);
      }
      const after = this.snapStats(p);
      this.logRichCardPlay(p, card.name, adjustedCost, before, after);
      this.useAction();
    } else {
      // Legacy fallback for cards not yet in the typed registry
      const before = this.snapStats(p);
      if (this.cardProcessor.playCard(p, card, (msg) => this.log(msg))) {
        const after = this.snapStats(p);
        this.logRichCardPlay(p, card.name, card.playCost, before, after);
        this.useAction();
      }
    }
  }

  /** IGame interface: queue a pending discard for the player. */
  startPendingDiscard(player: Player, discard: number, draw: number, goldReward?: number): void {
    if (discard <= 0) {
      // Nothing to discard — just draw immediately
      if (draw > 0) this.drawCards(player, draw);
      return;
    }
    player.pendingDiscardDraw = { left: discard, draw, goldReward };
    this.log(`${player.name} must discard ${discard} card${discard > 1 ? 's' : ''}.`);
  }

  /** Draw N cards from deck into player's temporary hand; player must keep K of them. */
  startDrawKeepFromTemp(player: Player, draw: number, keep: number): void {
    player.temporaryHand = [];
    for (let i = 0; i < draw && this.deck.length > 0; i++) {
      player.temporaryHand.push(this.deck.shift()!);
    }
    player.pendingDrawKeepCount = Math.min(keep, player.temporaryHand.length);
    this.log(`${player.name} drew ${player.temporaryHand.length} card(s) — choose ${player.pendingDrawKeepCount} to keep.`);
  }

  /** Keep a card from the player's temporary draw-keep hand. */
  keepDrawnCard(playerId: PlayerId, cardName: string): void {
    const p = this.getPlayerById(playerId);
    if (!p || p.pendingDrawKeepCount <= 0) return;
    const card = p.temporaryHand.find(c => c.name === cardName);
    if (!card) return;
    p.cardsInHand.push(card);
    p.temporaryHand = p.temporaryHand.filter(c => c !== card);
    p.pendingDrawKeepCount -= 1;
    this.log(`${p.name} kept ${cardName}.`);
    if (p.pendingDrawKeepCount <= 0) {
      // Route remaining temp-hand cards to recipient if set, otherwise discard
      if (this.pendingDrawKeepRecipientId) {
        const recipient = this.getPlayerById(this.pendingDrawKeepRecipientId);
        this.pendingDrawKeepRecipientId = undefined;
        if (recipient?.isAlive && p.temporaryHand.length > 0) {
          recipient.cardsInHand.push(...p.temporaryHand);
          this.log(`${p.name}: remaining ${p.temporaryHand.length} card(s) sent to ${recipient.name}.`);
        } else if (p.temporaryHand.length > 0) {
          p.playedCards.push(...p.temporaryHand);
          this.log(`${p.name}: remaining cards discarded.`);
        }
      } else if (p.temporaryHand.length > 0) {
        p.playedCards.push(...p.temporaryHand);
        this.log(`${p.name}: remaining cards discarded.`);
      }
      p.temporaryHand = [];
      this.maybeEndTurn();
    }
  }

  /** Returns true if the player currently has a pending draw-keep selection waiting for input. */
  playerHasPendingDrawKeep(playerId: PlayerId): boolean {
    const p = this.getPlayerById(playerId);
    return (p?.pendingDrawKeepCount ?? 0) > 0;
  }

  /** IGame interface: initiate a Blind Jump - player selects a tile directly behind an adjacent player, ignoring barricades. */
  startJumpOver(player: Player): void {
    this.pendingJumpOver = true;
    this.pendingJumpOverAny = false;
    this.currentMode = 'M';
    this.log(`${player.name}: Select a tile directly behind an adjacent player or opponent trap to jump to (barricades ignored).`);
  }

  /** Gym Class Hero: jump over any adjacent occupied tile (player, zombie, trap, bait). */
  startJumpOverAny(player: Player): void {
    const jumpHexes = this.getJumpOverHexesForAny(player);
    if (jumpHexes.length === 0) {
      this.log(`${player.name}: No valid jump targets — need an adjacent occupied tile with an empty tile behind it.`);
      return;
    }
    this.pendingJumpOver = true;
    this.pendingJumpOverAny = true;
    this.currentMode = 'M';
    this.log(`${player.name}: Select a highlighted tile to jump over an adjacent obstacle.`);
  }

  /** Helper used only by startJumpOverAny availability check (avoids flag-dependency). */
  private getJumpOverHexesForAny(player: Player): HexCoordinate[] {
    const results: HexCoordinate[] = [];
    for (const [dq, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][]) {
      const neighbor = new HexCoordinate(player.position.q + dq, player.position.r + dr);
      if (!this.board.isWithinBounds(neighbor)) continue;
      if (!this.isPlayerAt(neighbor) && !this.isZombieAt(neighbor) && !this.board.hasTrap(neighbor) && !this.board.hasBait(neighbor)) continue;
      const landing = new HexCoordinate(player.position.q + 2 * dq, player.position.r + 2 * dr);
      if (!this.board.isWithinBounds(landing)) continue;
      if (this.isPlayerAt(landing) || this.isZombieAt(landing)) continue;
      results.push(landing);
    }
    return results;
  }

  /** Returns all valid landing tiles for a jump-over move. 
   * In normal mode (player/opponent-trap): the mid tile must be an alive player or an opponent's trap.
   * In anyOccupied mode (Gym Class Hero): mid tile may be any player, zombie, trap, or bait. */
  private getJumpOverHexes(player: Player): HexCoordinate[] {
    const results: HexCoordinate[] = [];
    for (const [dq, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as [number, number][]) {
      const neighbor = new HexCoordinate(player.position.q + dq, player.position.r + dr);
      if (!this.board.isWithinBounds(neighbor)) continue;
      // Determine if the neighbor tile is a valid obstacle to jump over
      let isValidObstacle: boolean;
      if (this.pendingJumpOverAny) {
        // Gym Class Hero: any occupied tile counts
        isValidObstacle =
          this.isPlayerAt(neighbor) ||
          this.isZombieAt(neighbor) ||
          this.board.hasTrap(neighbor) ||
          this.board.hasBait(neighbor);
      } else {
        // Spotter / Blind Jump: alive player OR an opponent's trap
        const trap = this.board.getTraps().get(neighbor.key());
        isValidObstacle = this.isPlayerAt(neighbor) || (trap != null && trap.ownerId !== player.id);
      }
      if (!isValidObstacle) continue;
      const landing = new HexCoordinate(player.position.q + 2 * dq, player.position.r + 2 * dr);
      if (!this.board.isWithinBounds(landing)) continue;
      if (this.isPlayerAt(landing) || this.isZombieAt(landing)) continue;
      results.push(landing);
    }
    return results;
  }

  /** IGame interface: set pending free-bait flag and enter bait placement mode. */
  startFreeBait(): void {
    this.pendingFreeBait = true;
    this.currentMode = 'B';
  }

  /** IGame interface: set pending free-trap flag and enter trap placement mode. */
  startChoiceNPCP(player: Player, count: number, sourceCardName: string): void {
    if (count === 0) return;
    const fakeCard = { name: sourceCardName } as LegacyCard;
    this.pendingOrActionChoice.set(player.id as PlayerId, {
      card: fakeCard,
      effects: [`gain ${count} np`, `gain ${count} cp`],
    });
  }

  startFreeTrap(): void {
    this.pendingFreeTrap = true;
    this.currentMode = 'T';
  }

  startFreeBarricade(count = 1): void {
    this.pendingFreeBarricadeCount = count;
    this.currentMode = 'W';
  }

  /** IGame interface: defer a per-adjacent-occupant gold reward to after the player finishes free move steps (e.g. Crowded Halls). */
  setPendingPostMoveAdjacencyGold(player: Player, goldPerOccupant: number): void {
    this.pendingPostMoveAdjacencyGold = { playerId: player.id as PlayerId, goldPerOccupant };
    this.log(`${player.name}: adjacency gold (${goldPerOccupant}/occupant) will be counted after you finish moving.`);
  }

  /** IGame interface: grant player N cost-free movement steps (e.g. from Scouting Report). */
  startFreeMoves(player: Player, steps: number, payBarricades?: boolean): void {
    if (steps <= 0) return;
    this.pendingFreeMoveSteps = steps;
    this.pendingFreeMovePlayerId = player.id as PlayerId;
    if (payBarricades) this.pendingFreeMovesPayBarricades = true;
    this.currentMode = 'M';
    this.log(`${player.name} may take ${steps} free step(s). Select a destination tile.`);
  }

  /** Called when a player selects a card to discard (pending discard state). */
  discardCardFromPending(playerId: PlayerId, cardName: string): void {
    const p = this.getPlayerById(playerId);
    if (!p || !p.pendingDiscardDraw) return;
    const card = p.cardsInHand.find(c => c.name === cardName);
    if (!card) return;
    p.cardsInHand = p.cardsInHand.filter(c => c !== card);
    // Card Shark [N]: discards are sent to the lowest-SP player instead of being removed
    if (this.pendingDiscardRecipientId) {
      const recipient = this.getPlayerById(this.pendingDiscardRecipientId);
      if (recipient?.isAlive) {
        recipient.cardsInHand.push(card);
        this.log(`${p.name} sends ${card.name} to ${recipient.name}.`);
      } else {
        p.playedCards.push(card);
        this.log(`${p.name} discarded ${card.name}.`);
      }
    } else {
      p.playedCards.push(card);
      this.log(`${p.name} discarded ${card.name}.`);
    }
    p.pendingDiscardDraw.left -= 1;
    if (p.pendingDiscardDraw.left <= 0) {
      this.pendingDiscardRecipientId = undefined;
      const drawCount = p.pendingDiscardDraw.draw;
      const goldReward = p.pendingDiscardDraw.goldReward;
      p.pendingDiscardDraw = undefined;
      if (goldReward != null && goldReward > 0) {
        p.addGold(goldReward);
        this.log(`${p.name} gains ${goldReward} gold.`);
      }
      if (drawCount > 0) this.drawCards(p, drawCount);
      // If no actions remaining, end the turn now that discard is resolved
      if (this.actionsRemaining <= 0 && !this.isGameOver()) {
        this.endTurn();
      }
    }
  }

  /** Returns true if the player currently has a pending discard waiting for input. */
  playerHasPendingDiscard(playerId: PlayerId): boolean {
    const p = this.getPlayerById(playerId);
    return p?.pendingDiscardDraw !== undefined;
  }

  activateCardAction(playerId: PlayerId, cardName: string): void {
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer()) return;

    const card = p.activeActions.find(c => c.name === cardName);
    if (!card) return;

    const isStartingAction = card.name.includes('(Starting Action)');
    // Must use any remaining starting actions before regular nightly actions
    if (!isStartingAction && p.activeActions.some(c => c.name.includes('(Starting Action)'))) {
      this.log(`${p.name}: Use your starting action first.`);
      return;
    }
    // One action limit per card is enforced below (per icard.behavior.repeatable)
    const icard = CardRegistry.get(card.name as CardName);
    if (icard) {
      const isRepeatable = icard.behavior?.repeatable === true;
      if (!isStartingAction && !isRepeatable && p.usedActions.some(c => c === card)) return; // already used this night
      if (!isStartingAction && this.actionsRemaining <= 0) {
        this.log(`${p.name}: No actions remaining this turn.`);
        return;
      }
      if (!isRepeatable) p.usedActions.push(card);
      const before = this.snapStats(p);
      BehaviorExecutor.execute(icard.behavior, p, this, card.name);
      const after = this.snapStats(p);
      this.logRichCardPlay(p, card.name, 0, before, after, 'used action of');
      if (!isStartingAction) this.useAction();
    } else {
      // Legacy fallback for hero/relic action cards not registered in CardRegistry
      this.activateLegacyHeroAction(p, card, isStartingAction);
      // Consume an action if the legacy handler actually executed (card is now in usedActions)
      if (!isStartingAction && p.usedActions.includes(card)) this.useAction();
    }

    // If this was one of a paired [N]/[C] action, also mark the sibling as used
    // Only do this if the card was actually consumed (i.e. it's now in usedActions)
    if (!isStartingAction && p.usedActions.includes(card) && (card.name.endsWith(' [N]') || card.name.endsWith(' [C]'))) {
      const siblingTag = card.name.endsWith(' [N]') ? ' [C]' : ' [N]';
      const baseName = card.name.slice(0, -4);
      const sibling = p.activeActions.find(c => c.name === baseName + siblingTag && !p.usedActions.includes(c));
      if (sibling) p.usedActions.push(sibling);
    }
  }

  private activateLegacyHeroAction(p: Player, card: LegacyCard, isStartingAction: boolean): void {
    const consume = (): void => {
      if (isStartingAction) {
        p.activeActions = p.activeActions.filter(c => c !== card);
      } else {
        p.usedActions.push(card);
      }
    };
    const name = card.name;

    // ---- Explicit per-hero dispatch (no text parsing) ----
    if (name === 'School Nurse [N]') { this.heroNurseN(p, consume, name); return; }
    if (name === 'School Nurse [C]') { this.heroNurseC(p, consume); return; }
    if (name === 'Barry Cade [N]') { this.heroBarryN(p, consume, name); return; }
    if (name === 'Barry Cade [C]') { this.heroBarryC(p, consume, name); return; }
    if (name === 'Von Trap [N]') { this.heroVonTrapN(p, consume, name); return; }
    if (name === 'Von Trap [C]') { this.heroVonTrapC(p, consume, name); return; }
    if (name === 'Bloodthirster [N]') { this.heroBloodthirsterN(p, consume); return; }
    if (name === 'Bloodthirster [C]') { this.heroBloodthirsterC(p, consume); return; }
    if (name === 'Spotter [N]') { this.heroSpotterN(p, consume); return; }
    if (name === 'Spotter [C]') { this.heroSpotterC(p, consume, name); return; }
    if (name === 'Bungler [N]') { this.heroBunglerN(p, consume); return; }
    if (name === 'Bungler [C]') { this.heroBunglerC(p, consume, name); return; }
    if (name === 'Archy Tect [N]') { this.heroArchyTectN(p, consume); return; }
    if (name === 'Archy Tect [C]') { this.heroArchyTectC(p, consume, name); return; }
    if (name === 'Loan Wolf [N]') { this.heroLoanWolfN(p, consume); return; }
    if (name === 'Loan Wolf [C]') { this.heroLoanWolfC(p, consume, name); return; }
    if (name === 'Richard [N]') { this.heroRichardN(p, consume); return; }
    if (name === 'Richard [C]') { this.heroRichardC(p, consume); return; }
    if (name === 'Card Shark [N]') { this.heroCardSharkN(p, consume); return; }
    if (name === 'Card Shark [C]') { this.heroCardSharkC(p, consume); return; }
    if (name === 'Gym Coach [N]') { this.heroGymCoachN(p, consume, name); return; }
    if (name === 'Gym Coach [C]') { this.heroGymCoachC(p, consume, name); return; }

    // ---- Locker action dispatch ----
    if (name === 'Dog Tags (Starting Action)') { this.lockerDogTagsSpawn(p, consume); return; }
    if (name === 'Scout Training (Starting Action)') { this.lockerScoutTrainingTrap(p, consume); return; }
    if (name === 'Shoes [N]') { this.lockerShoesN(p, consume); return; }
    if (name === 'Grappling Hook [N]') { this.lockerGrapplingHookN(p, consume, name); return; }
    if (name === 'Long Sleeves [N]') { this.lockerLongSleevesN(p, consume); return; }
    if (name === 'Cool for Sale [N]') { this.lockerCoolForSaleN(p, consume); return; }
    if (name === 'Cool for Sale [C]') { this.lockerCoolForSaleC(p, consume); return; }
    if (name === 'Nice for Sale [N]') { this.lockerNiceForSaleN(p, consume); return; }
    if (name === 'Nice for Sale [C]') { this.lockerNiceForSaleC(p, consume); return; }
    if (name === 'Ouji Board [N]') { this.lockerOujiBoardN(p, consume); return; }
    if (name === 'Ouji Board [C]') { this.lockerOujiBoardC(p, consume); return; }
    if (name === 'Free Hugs T-Shirt [N]') { this.lockerFreeHugsN(p, consume); return; }
    if (name === 'Free Hugs T-Shirt [C]') { this.lockerFreeHugsC(p, consume); return; }

    // ---- Legacy fallback (starting actions + locker actions still text-parsed) ----
    const eff = card.effect.replace(/^action:\s*/i, '').toLowerCase();
    if (eff.includes('bait')) {
      consume();
      this.pendingFreeBait = true;
      this.currentMode = 'B';
      this.log(`${p.name}: Select a tile to place a free bait.`);
    } else if ((eff.includes('place') || eff.includes('placing')) && eff.includes('barricade')) {
      consume();
      this.startFreeBarricade(1);
      this.log(`${p.name}: Select any two adjacent tiles to place a free barricade anywhere on the map.`);
    } else if (eff.includes('place') && eff.includes('zombie')) {
      consume();
      this.startPendingInteraction('place_zombie', p.id, card.name);
    } else if (eff.match(/pay\s+\d+\s+gold.*turn.*(?:sp|np|cp).*into/)) {
      consume();
      this.applyOrActionEffect(p, eff);
    } else if (eff.includes(' or ')) {
      consume();
      const parts = eff.split(/\s+or\s+/i).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        this.pendingOrActionChoice.set(p.id as PlayerId, { card, effects: parts });
        this.log(`${p.name}: Choose an option for ${card.name}.`);
      } else {
        this.applyOrActionEffect(p, eff);
      }
    } else if (eff.includes('discard') && eff.includes('your hand') && (eff.includes('gold production') || eff.includes(' gp'))) {
      // Pyramid Scheme (Relic): pay 3 gold, discard 1 card from hand, gain 1 GP
      if (p.cardsInHand.length === 0) { this.log(`${p.name}: You have no cards to discard.`); return; }
      if (p.gold < 3) { this.log(`${p.name}: Not enough gold (needs 3).`); return; }
      consume();
      p.spendGold(3);
      p.goldProduction += 1;
      this.startPendingDiscard(p, 1, 0);
      this.log(`${p.name} paid 3 gold and gains +1 GP. Choose a card to discard.`);
    } else {
      consume();
      this.log(`${p.name} activated: ${card.name}.`);
    }
  }

  // ---- Hero Action Implementations ----

  private heroNurseN(p: Player, consume: () => void, cardName: string): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const healTargets = this.players.filter(pl =>
      pl.isAlive && pl.id !== p.id && pl.hitPoints <= 3 &&
      getTileRoom(pl.position.q, pl.position.r) === playerRoom
    );
    if (healTargets.length === 0) {
      this.log(`${p.name}: No injured players (≤3 HP) in your room to heal.`); return;
    }
    consume();
    this.startPendingInteraction('heal_player_in_room', p.id, cardName);
  }

  private heroNurseC(p: Player, consume: () => void): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const roomTile = this.board.getTilesInIDOrder().find(h =>
      getTileRoom(h.q, h.r) === playerRoom &&
      !this.isPlayerAt(h) && !this.isZombieAt(h) &&
      !this.board.hasTrap(h) && !this.board.hasBait(h)
    );
    if (!roomTile) {
      this.log(`${p.name}: No open tile in the ${playerRoom.replace(/-/g, ' ')} to spawn a zombie.`); return;
    }
    consume();
    this.zombies.push(new Zombie(roomTile));
    p.addCoolPoints(1);
    p.addSurvivalPoints(1);
    this.log(`${p.name} spawned a zombie in the ${playerRoom.replace(/-/g, ' ')}. +1 CP, +1 SP.`);
  }

  private heroBarryN(p: Player, consume: () => void, cardName: string): void {
    const ownBarricades = [...this.board.getBarricades()].filter(([, b]) => b.ownerId === p.id);
    if (ownBarricades.length === 0) { this.log(`${p.name}: No own barricades to destroy.`); return; }
    consume();
    this.startPendingInteraction('destroy_own_barricade_reward', p.id, cardName);
  }

  private heroBarryC(p: Player, consume: () => void, cardName: string): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const opponentBarInRoom = [...this.board.getBarricades()].some(([ek, b]) => {
      if (b.ownerId === p.id) return false;
      const parts = ek.split('|');
      return parts.length === 2 && getTileRoom(HexCoordinate.fromKey(parts[0]).q, HexCoordinate.fromKey(parts[0]).r) === playerRoom;
    });
    if (!opponentBarInRoom) { this.log(`${p.name}: No opponent barricades in your current room.`); return; }
    consume();
    this.startPendingInteraction('destroy_opponent_barricade_in_room', p.id, cardName);
  }

  private heroVonTrapN(p: Player, consume: () => void, cardName: string): void {
    const ownTraps = [...this.board.getTraps().entries()].filter(([, t]) => t.ownerId === p.id);
    if (ownTraps.length === 0) { this.log(`${p.name}: No own traps to blow up.`); return; }
    consume();
    this.startPendingInteraction('blow_up_own_trap', p.id, cardName);
  }

  private heroVonTrapC(p: Player, consume: () => void, cardName: string): void {
    const ownTraps = [...this.board.getTraps().entries()].filter(([, t]) => t.ownerId === p.id);
    if (ownTraps.length === 0) { this.log(`${p.name}: No own traps to relocate.`); return; }
    consume();
    this.startPendingInteraction('own_trap_move_step1', p.id, cardName);
  }

  private heroBloodthirsterN(p: Player, consume: () => void): void {
    const adjZombie = this.board.getNeighbors(p.position).some(n => this.isZombieAt(n));
    if (!adjZombie) { this.log(`${p.name}: No adjacent zombie for a free melee attack.`); return; }
    consume();
    this.pendingFreeMelee = true;
    this.pendingMeleeNPReward = true;
    this.currentMode = 'A';
    this.log(`${p.name}: Select an adjacent zombie for a free melee attack (no gold cost).`);
  }

  private heroBloodthirsterC(p: Player, consume: () => void): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const roomTile = this.board.getTilesInIDOrder().find(h =>
      getTileRoom(h.q, h.r) === playerRoom &&
      !this.isPlayerAt(h) && !this.isZombieAt(h) &&
      !this.board.hasTrap(h) && !this.board.hasBait(h)
    );
    if (!roomTile) { this.log(`${p.name}: No open tile in your room to spawn a zombie.`); return; }
    consume();
    this.zombies.push(new Zombie(roomTile));
    p.addGold(3);
    p.addCoolPoints(1);
    this.fireOnCPGained(p);
    this.drawCards(p, 1);
    this.log(`${p.name} spawned a zombie in the ${playerRoom.replace(/-/g, ' ')}. +3 gold, +1 CP, drew 1 card.`);
  }

  private heroSpotterN(p: Player, consume: () => void): void {
    const jumpHexes = this.getJumpOverHexes(p);
    if (jumpHexes.length === 0) {
      this.log(`${p.name}: No valid jump-over targets (must be adjacent to a player or opponent trap with open tile behind).`);
      return;
    }
    consume();
    this.pendingJumpOverSP = 1;
    this.pendingJumpOverNP = 1;
    this.pendingJumpOver = true;
    this.pendingJumpOverAny = false;
    this.currentMode = 'M';
    this.log(`${p.name}: Select a highlighted tile to jump over a player or trap. (+1 SP, +1 NP on success)`);
  }

  private heroSpotterC(p: Player, consume: () => void, cardName: string): void {
    const canMove = this.players.some(pl =>
      pl.isAlive && pl.id !== p.id &&
      !this.passedPlayerIds.has(pl.id as PlayerId) &&
      this.board.getNeighbors(pl.position).some(n => !this.isPlayerAt(n) && !this.isZombieAt(n) && !this.board.hasTrap(n))
    );
    if (!canMove) { this.log(`${p.name}: No active players with an open adjacent tile.`); return; }
    consume();
    this.startPendingInteraction('move_player_step1', p.id, cardName);
  }

  private heroBunglerN(p: Player, consume: () => void): void {
    const adjZombie = this.board.getNeighbors(p.position).some(n => this.isZombieAt(n));
    if (!adjZombie) { this.log(`${p.name}: Must be adjacent to a zombie.`); return; }
    if (p.gold < 10) { this.log(`${p.name}: Not enough gold (needs 10).`); return; }
    consume();
    p.spendGold(10);
    this.pendingFreeMelee = true;
    this.pendingMeleeSuccessRateOverride = 5;
    this.pendingMeleeSpReward = 1;
    this.pendingMeleeNPReward = true;
    this.currentMode = 'A';
    this.log(`${p.name} paid 10 gold for a super melee (rate 5). Select adjacent zombie.`);
  }

  private heroBunglerC(p: Player, consume: () => void, cardName: string): void {
    const hasOppTrap = [...this.board.getTraps().values()].some(t => t.ownerId !== p.id);
    if (!hasOppTrap) { this.log(`${p.name}: No opponent traps on the board.`); return; }
    consume();
    this.startPendingInteraction('opp_trap_move_step1', p.id, cardName);
  }

  private heroArchyTectN(p: Player, consume: () => void): void {
    const barricadeCount = this.board.getBarricades().size;
    if (barricadeCount === 0) { this.log(`${p.name}: No barricades on the board.`); return; }
    consume();
    p.addNicePoints(1);
    this.fireOnNPGained(p);
    p.addGold(barricadeCount);
    this.log(`${p.name} gained +1 NP and +${barricadeCount} gold (${barricadeCount} barricade(s) on board).`);
  }

  private heroArchyTectC(p: Player, consume: () => void, cardName: string): void {
    const ownCount = [...this.board.getBarricades().values()].filter(b => b.ownerId === p.id).length;
    if (ownCount >= this.getAdjustedBarricadeLimit(p)) {
      this.log(`${p.name}: Barricade limit reached — cannot place another.`); return;
    }
    const hasOppBar = [...this.board.getBarricades().values()].some(b => b.ownerId !== p.id);
    if (!hasOppBar) { this.log(`${p.name}: No opponent barricades on the board.`); return; }
    consume();
    this.startPendingInteraction('replace_opponent_barricade', p.id, cardName);
  }

  private heroLoanWolfN(p: Player, consume: () => void): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const othersInRoom = this.players.some(pl =>
      pl.isAlive && pl.id !== p.id &&
      getTileRoom(pl.position.q, pl.position.r) === playerRoom
    );
    if (othersInRoom) { this.log(`${p.name}: Other players are in your room.`); return; }
    consume();
    p.addNicePoints(1);
    this.fireOnNPGained(p);
    p.addGold(6);
    this.log(`${p.name} used Loan Wolf [N]: +1 NP, +6 gold (alone in room).`);
  }

  private heroLoanWolfC(p: Player, consume: () => void, cardName: string): void {
    const stealTargets = this.players.filter(pl =>
      pl.isAlive && pl.id !== p.id && p.position.distanceTo(pl.position) <= 2
    );
    if (stealTargets.length === 0) { this.log(`${p.name}: No players within 2 steps to steal from.`); return; }
    consume();
    this.startPendingInteraction('steal_gold', p.id, cardName);
  }

  private heroRichardN(p: Player, consume: () => void): void {
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const zombiesInRoom = this.zombies.filter(z =>
      z.isAlive && getTileRoom(z.position.q, z.position.r) === playerRoom
    );
    if (zombiesInRoom.length > 0) {
      this.log(`${p.name}: There are ${zombiesInRoom.length} zombie(s) in your room.`); return;
    }
    consume();
    p.addNicePoints(1);
    this.fireOnNPGained(p);
    p.addGold(6);
    for (const other of this.players) if (other.id !== p.id && other.isAlive) other.addGold(3);
    this.log(`${p.name} used Richard [N]: +1 NP, +6 gold. All other players gain 3 gold.`);
  }

  private heroRichardC(p: Player, consume: () => void): void {
    if (p.gold < 4) { this.log(`${p.name}: Not enough gold (needs 4).`); return; }
    const playerRoom = getTileRoom(p.position.q, p.position.r);
    const roomTile = this.board.getTilesInIDOrder().find(h =>
      getTileRoom(h.q, h.r) === playerRoom &&
      !this.isPlayerAt(h) && !this.isZombieAt(h) &&
      !this.board.hasTrap(h) && !this.board.hasBait(h)
    );
    if (!roomTile) { this.log(`${p.name}: No open tile in your room.`); return; }
    consume();
    p.spendGold(4);
    p.goldProduction += 1;
    p.addCoolPoints(1);
    this.fireOnCPGained(p);
    this.zombies.push(new Zombie(roomTile));
    this.log(`${p.name} paid 4 gold: +1 GP, +1 CP, spawned zombie in ${playerRoom.replace(/-/g, ' ')}.`);
  }

  private heroCardSharkN(p: Player, consume: () => void): void {
    consume();
    p.addNicePoints(1);
    this.fireOnNPGained(p);
    // Find the overall lowest-SP alive player; tiebreak by tile ID (lower address wins)
    const allAlive = this.players.filter(pl => pl.isAlive);
    const overallLowest = allAlive.sort((a, b) => {
      if (a.survivalPoints !== b.survivalPoints) return a.survivalPoints - b.survivalPoints;
      return this.board.getTileID(a.position) - this.board.getTileID(b.position);
    })[0];
    if (overallLowest?.id === p.id) {
      // Card Shark is the lowest-SP player — they keep all 3 automatically
      this.drawCards(p, 3);
      this.log(`${p.name}: Card Shark – drew 3 cards and keeps all (lowest SP). +1 NP.`);
    } else {
      // Someone else is the lowest SP player — CS keeps 1, that player gets the other 2
      const recipient = this.players.filter(pl => pl.isAlive && pl.id !== p.id)
        .sort((a, b) => {
          if (a.survivalPoints !== b.survivalPoints) return a.survivalPoints - b.survivalPoints;
          return this.board.getTileID(a.position) - this.board.getTileID(b.position);
        })[0];
      if (recipient) this.pendingDrawKeepRecipientId = recipient.id as PlayerId;
      this.startDrawKeepFromTemp(p, 3, 1);
      this.log(`${p.name}: Card Shark – drew 3 cards. Choose 1 to keep; the other 2 go to ${recipient?.name ?? 'lowest SP player'}. +1 NP.`);
    }
  }

  private heroCardSharkC(p: Player, consume: () => void): void {
    if (p.cardsInHand.length === 0) { this.log(`${p.name}: No cards to discard.`); return; }
    consume();
    p.addCoolPoints(2);
    this.fireOnCPGained(p);
    this.startPendingDiscard(p, 1, 2);
    this.log(`${p.name}: +2 CP. Choose a card to discard, then draw 2.`);
  }

  private heroGymCoachN(p: Player, consume: () => void, cardName: string): void {
    const room = getTileRoom(p.position.q, p.position.r);
    if (room !== 'gymnasium') { this.log(`${p.name}: Must be in the Gymnasium.`); return; }
    const gymZombies = this.zombies.filter(z =>
      z.isAlive && getTileRoom(z.position.q, z.position.r) === 'gymnasium'
    );
    if (gymZombies.length === 0) { this.log(`${p.name}: No zombies in the Gymnasium.`); return; }
    consume();
    this.pendingTargetRoomFilter = 'gymnasium';
    this.pendingTargetSPReward = 1;
    this.pendingTargetNPReward = 1;
    this.startZombieTargeting(p.id as PlayerId, cardName);
  }

  private heroGymCoachC(p: Player, consume: () => void, cardName: string): void {
    if (!this.hasAdjacentOpponentStructure(p)) {
      this.log(`${p.name}: No opponent barricades or traps adjacent to your position.`); return;
    }
    consume();
    this.startPendingInteraction('coach_destroy_adjacent', p.id, cardName);
  }

  private hasAdjacentOpponentStructure(p: Player): boolean {
    const adjTiles = this.board.getNeighbors(p.position);
    for (const n of adjTiles) {
      const trap = this.board.getTraps().get(n.key());
      if (trap && trap.ownerId !== p.id) return true;
    }
    for (const [ek, bar] of this.board.getBarricades()) {
      if (bar.ownerId === p.id) continue;
      const parts = ek.split('|');
      if (parts.length !== 2) continue;
      const hexA = HexCoordinate.fromKey(parts[0]);
      const hexB = HexCoordinate.fromKey(parts[1]);
      if (adjTiles.some(n => n.equals(hexA) || n.equals(hexB))) return true;
    }
    return false;
  }

  // ---- Locker Action Implementations ----

  private lockerDogTagsSpawn(p: Player, consume: () => void): void {
    const spawnTile = this.board.getTilesInIDOrder().find(h =>
      !this.isPlayerAt(h) && !this.isZombieAt(h)
    );
    if (!spawnTile) { this.log(`${p.name}: Dog Tags – no open tile to spawn a zombie.`); return; }
    consume();
    this.zombies.push(new Zombie(spawnTile));
    this.log(`${p.name}: Dog Tags – spawned a zombie at ${spawnTile.key()}.`);
  }

  private lockerScoutTrainingTrap(p: Player, consume: () => void): void {
    consume();
    this.pendingFreeTrap = true;
    this.currentMode = 'T';
    this.log(`${p.name}: Scout Training – select any tile to place a free trap.`);
  }

  private lockerShoesN(p: Player, consume: () => void): void {
    if (p.gold < 1) { this.log(`${p.name}: Shoes – need 1 gold.`); return; }
    consume();
    p.spendGold(1);
    this.pendingFreeMovesPayBarricades = true;
    this.startFreeMoves(p, 2);
    this.log(`${p.name}: Shoes – 2 free steps (barricade tolls still apply).`);
  }

  private lockerGrapplingHookN(p: Player, consume: () => void, cardName: string): void {
    if (p.gold < 1) { this.log(`${p.name}: Grappling Hook – need 1 gold.`); return; }
    const validTiles = this.board.getAllHexes()
      .filter(h => p.position.distanceTo(h) <= 2 && !this.isPlayerAt(h) && !this.isZombieAt(h));
    if (validTiles.length === 0) { this.log(`${p.name}: Grappling Hook – no valid tiles within 2 steps.`); return; }
    consume();
    p.spendGold(1);
    this.startPendingInteraction('teleport_within_2', p.id, cardName);
  }

  private lockerLongSleevesN(p: Player, consume: () => void): void {
    if (p.gold < 2) { this.log(`${p.name}: Long Sleeves – need 2 gold.`); return; }
    consume();
    p.spendGold(2);
    this.startDrawKeepFromTemp(p, 2, 1);
    this.log(`${p.name}: Long Sleeves – drew 2 cards. Choose 1 to keep.`);
  }

  private lockerCoolForSaleN(p: Player, consume: () => void): void {
    if (p.gold < 2) { this.log(`${p.name}: Cool for Sale [N] – need 2 gold.`); return; }
    if (p.coolPoints < 1) { this.log(`${p.name}: Cool for Sale [N] – need at least 1 CP.`); return; }
    consume();
    p.spendGold(2);
    p.coolPoints -= 1;
    p.addSurvivalPoints(1);
    this.log(`${p.name}: Cool for Sale – paid 2 gold, -1 CP, +1 SP.`);
  }

  private lockerCoolForSaleC(p: Player, consume: () => void): void {
    if (p.gold < 2) { this.log(`${p.name}: Cool for Sale [C] – need 2 gold.`); return; }
    if (p.coolPoints < 1) { this.log(`${p.name}: Cool for Sale [C] – need at least 1 CP.`); return; }
    consume();
    p.spendGold(2);
    p.coolPoints -= 1;
    p.addGold(7);
    this.log(`${p.name}: Cool for Sale – paid 2 gold, -1 CP, +7 gold.`);
  }

  private lockerNiceForSaleN(p: Player, consume: () => void): void {
    if (p.gold < 2) { this.log(`${p.name}: Nice for Sale [N] – need 2 gold.`); return; }
    if (p.nicePoints < 1) { this.log(`${p.name}: Nice for Sale [N] – need at least 1 NP.`); return; }
    consume();
    p.spendGold(2);
    p.nicePoints -= 1;
    p.addSurvivalPoints(1);
    this.log(`${p.name}: Nice for Sale – paid 2 gold, -1 NP, +1 SP.`);
  }

  private lockerNiceForSaleC(p: Player, consume: () => void): void {
    if (p.gold < 2) { this.log(`${p.name}: Nice for Sale [C] – need 2 gold.`); return; }
    if (p.nicePoints < 1) { this.log(`${p.name}: Nice for Sale [C] – need at least 1 NP.`); return; }
    consume();
    p.spendGold(2);
    p.nicePoints -= 1;
    p.addGold(7);
    this.log(`${p.name}: Nice for Sale – paid 2 gold, -1 NP, +7 gold.`);
  }

  private lockerOujiBoardN(p: Player, consume: () => void): void {
    if (p.gold < 1) { this.log(`${p.name}: Ouji Board [N] – need 1 gold.`); return; }
    if (p.survivalPoints < 1) { this.log(`${p.name}: Ouji Board [N] – need at least 1 SP.`); return; }
    consume();
    p.spendGold(1);
    p.survivalPoints -= 1;
    p.addNicePoints(2);
    this.fireOnNPGained(p);
    this.log(`${p.name}: Ouji Board – paid 1 gold, -1 SP, +2 NP.`);
  }

  private lockerOujiBoardC(p: Player, consume: () => void): void {
    if (p.gold < 1) { this.log(`${p.name}: Ouji Board [C] – need 1 gold.`); return; }
    if (p.survivalPoints < 1) { this.log(`${p.name}: Ouji Board [C] – need at least 1 SP.`); return; }
    consume();
    p.spendGold(1);
    p.survivalPoints -= 1;
    p.addCoolPoints(2);
    this.fireOnCPGained(p);
    this.log(`${p.name}: Ouji Board – paid 1 gold, -1 SP, +2 CP.`);
  }

  private lockerFreeHugsN(p: Player, consume: () => void): void {
    if (p.gold < 1) { this.log(`${p.name}: Free Hugs T-Shirt [N] – need 1 gold.`); return; }
    const neighbors = this.board.getNeighbors(p.position);
    const adjOpponents = this.players.filter(o =>
      o.id !== p.id && o.isAlive && neighbors.some(n => n.equals(o.position))
    );
    if (adjOpponents.length === 0) { this.log(`${p.name}: Free Hugs T-Shirt [N] – no adjacent opponents.`); return; }
    consume();
    p.spendGold(1);
    const gained = 2 * adjOpponents.length;
    p.addNicePoints(gained);
    this.fireOnNPGained(p);
    this.log(`${p.name}: Free Hugs – +${gained} NP (${adjOpponents.length} adjacent opponent(s)).`);
  }

  private lockerFreeHugsC(p: Player, consume: () => void): void {
    const neighbors = this.board.getNeighbors(p.position);
    const adjZombies = this.zombies.filter(z =>
      z.isAlive && neighbors.some(n => n.equals(z.position))
    );
    if (adjZombies.length === 0) { this.log(`${p.name}: Free Hugs T-Shirt [C] – no adjacent zombies.`); return; }
    consume();
    const gained = adjZombies.length;
    p.addCoolPoints(gained);
    this.fireOnCPGained(p);
    this.log(`${p.name}: Free Hugs – +${gained} CP (${gained} adjacent zombie(s)).`);
  }

  /** Fire Goth (Schadenfreude) passive when a structure is destroyed at the given hex/edge key. */
  private fireOnStructureDestroyedAt(hexKeyOrEdgeKey: string, ownerId?: string): void {
    let room: string;
    if (hexKeyOrEdgeKey.includes('|')) {
      const h = HexCoordinate.fromKey(hexKeyOrEdgeKey.split('|')[0]);
      room = getTileRoom(h.q, h.r);
    } else {
      const h = HexCoordinate.fromKey(hexKeyOrEdgeKey);
      room = getTileRoom(h.q, h.r);
    }
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      if (pl.selectedHero?.id !== HeroId.SCHADENFREUDE) continue;
      if (getTileRoom(pl.position.q, pl.position.r) !== room) continue;
      pl.addGold(2);
      this.accumulateNight(pl.id, 1);
      this.log(`${pl.name}: structure destroyed in same room — +2 gold (night: choose NP or CP).`);
    }
    // Child's Tool Set: owner draws 1 card when their own barricade is destroyed
    if (ownerId && hexKeyOrEdgeKey.includes('|')) {
      const owner = this.getPlayerById(ownerId as PlayerId);
      if (owner?.isAlive) {
        for (const passive of owner.activePassives) {
          const icard = CardRegistry.get(passive.name as CardName);
          const drawN = icard?.behavior?.passive?.onOwnBarricadeDestroyedDraw;
          if (drawN) {
            this.drawCards(owner, drawN);
            this.log(`${owner.name}: Child's Tool Set – own barricade destroyed, drew ${drawN} card(s).`);
          }
        }
      }
    }
  }

  /** Fire Bully (Bloodthirster) passive when the player personally kills a zombie (melee or trap). */
  private fireOnPersonalZombieKill(p: Player): void {
    if (p.selectedHero?.id === HeroId.BLOODTHIRSTER) {
      p.addSurvivalPoints(1);
      this.log(`${p.name}: Bloodthirster passive — +1 extra SP.`);
    }
  }

  startZombieTargeting(playerId: PlayerId, cardName: string, requireAdjacentPlayer?: boolean, requireAdjacentZombie?: boolean): void {
    this.pendingTargetPlayerId = playerId;
    this.pendingTargetCardName = cardName;
    if (requireAdjacentPlayer) this.pendingTargetRequireAdjacentPlayer = true;
    if (requireAdjacentZombie) this.pendingTargetRequireAdjacentZombie = true;
    this.log(`Select which zombie to remove with ${cardName}.`);
  }

  startPendingInteraction(type: string, playerId: string, cardName: string): void {
    const player = this.getPlayerById(playerId as PlayerId);
    this.pendingInteraction = { type, playerId: playerId as PlayerId, cardName };
    const labels: Record<string, string> = {
      destroy_any_barricade: 'Select a highlighted barricade endpoint to destroy.',
      destroy_any_trap: 'Select a highlighted tile to destroy the trap.',
      destroy_own_structure: 'Select a highlighted tile to destroy your own structure.',
      place_zombie: 'Select a highlighted empty tile to place a zombie.',
      destroy_own_barricade_reward: 'Select one of your barricades to destroy (+1 SP, +1 NP).',
      destroy_opponent_barricade_in_room: 'Select an opponent\'s barricade in your room to destroy (+1 CP, +4 gold).',
      replace_opponent_barricade: "Select a highlighted tile to claim an opponent's barricade.",
      move_zombie_away: 'Select a highlighted zombie tile to move it away.',
      trap_relocate_step1: 'Select one of your traps to relocate.',
      spatial_swap: 'Select an adjacent player or zombie to swap positions with.',
      heal_player: 'Select a highlighted ally within 2 hexes to heal for 1 HP.',
      heal_player_in_room: 'Select an injured ally (≤3 HP) in your room to heal (+1 NP, +1 SP).',
      heal_player_in_room_simple: 'Select a highlighted ally in your room to heal for 1 HP.',
      move_player_step1: 'Select a highlighted active player to move.',
      move_player_step2: 'Select a highlighted empty tile to move the chosen player to.',
      blow_up_own_trap: 'Select one of your traps to blow up (kills adjacent zombies).',
      own_trap_move_step1: 'Select one of your traps to move.',
      own_trap_move_step2: 'Select a destination within 2 steps for your trap (+1 CP).',
      opp_trap_move_step1: "Select an opponent's trap to move.",
      opp_trap_move_step2: "Select a destination within 2 steps for the opponent's trap (+1 CP).",
      steal_gold: 'Select a player within 2 steps to steal up to 4 gold from (+1 CP).',
      coach_destroy_adjacent: "Select an adjacent opponent barricade or trap to destroy (+1 CP).",
      teleport_within_2: 'Select any tile within 2 steps to teleport to (no barricade tolls).',
      terror_sprint: 'Select a tile in the same row or column to sprint to.',
    };
    let label = labels[type];
    if (!label && type.startsWith('teleport_to_room:')) {
      const room = type.slice('teleport_to_room:'.length).replace(/-/g, ' ');
      label = `${player?.name ?? 'Player'}: select a tile in the ${room} to teleport to.`;
    }
    if (!label && type.startsWith('teleport_within_')) {
      const radius = type.slice('teleport_within_'.length);
      label = `Select any tile within ${radius} steps to teleport to.`;
    }
    if (!label && type.startsWith('move_adjacent_zombie_to_room:')) {
      label = 'Select an adjacent zombie to move.';
    }
    if (!label && type.startsWith('move_adjacent_zombie_place:')) {
      const room = type.slice('move_adjacent_zombie_place:'.length).replace(/-/g, ' ');
      label = `Select a tile in the ${room} to move the zombie to.`;
    }
    if (!label && type === 'move_any_zombie_one_step') {
      label = 'Select any zombie on the board to move one step.';
    }
    if (!label && type === 'move_any_zombie_one_step_place') {
      label = 'Select an adjacent tile to move the zombie to.';
    }
    if (!label && type.startsWith('give_cards_to_player:')) {
      const count = type.slice('give_cards_to_player:'.length);
      label = `Select a player to give ${count} card(s) to.`;
    }
    this.log(label ?? `${player?.name ?? 'Player'}: select a tile to resolve ${cardName}.`);
  }

  selectLockerFromPool(playerId: string): void {
    const player = this.getPlayerById(playerId as PlayerId);
    if (!player) return;
    const options = this.draftManager.peekLockerOptions(3);
    if (options.length === 0) {
      this.log(`${player.name} found no available locker items.`);
      return;
    }
    if (options.length === 1) {
      // Only one option — apply it immediately
      this.draftManager.consumeLocker(options[0].id);
      this.draftManager.applyLockerToPlayer(player, options[0]);
      this.log(`${player.name} equipped locker item: ${options[0].name}!`);
      return;
    }
    // Store options and let the player choose
    this.pendingLockerOptions.set(player.id as PlayerId, options);
    this.log(`${player.name} must choose a locker item: ${options.map(r => r.name).join(', ')}.`);
  }

  /** Open Locker: shuffle locker discard pile, draw N, player picks 1 to equip. */
  selectLockerFromDiscard(playerId: string, draw: number): void {
    const player = this.getPlayerById(playerId as PlayerId);
    if (!player) return;
    const discardPile = this.draftManager.getLockerDiscard();
    if (discardPile.length === 0) {
      this.log(`${player.name}: Open Locker – locker discard pile is empty!`);
      return;
    }
    // Shuffle then draw top N
    const shuffled = [...discardPile].sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, Math.min(draw, shuffled.length));
    if (options.length === 1) {
      this.draftManager.consumeLocker(options[0].id);
      this.draftManager.applyLockerToPlayer(player, options[0]);
      this.log(`${player.name}: Open Locker – equipped ${options[0].name}!`);
      return;
    }
    this.pendingLockerOptions.set(player.id as PlayerId, options);
    this.log(`${player.name}: Open Locker – choose a locker item: ${options.map(r => r.name).join(', ')}.`);
  }

  /** Sell a card from hand for 1 gold. Counts as 1 action. */
  sellCard(playerId: PlayerId, cardName: string): void {
    if (this._setupPhase || this._draftingPhase || this.isGameOver() || this.nightChoiceQueue.length > 0) return;
    const p = this.getPlayerById(playerId);
    if (!p || p !== this.getCurrentPlayer() || this.actionsRemaining <= 0) return;
    const cardIdx = p.cardsInHand.findIndex(c => c.name === cardName);
    if (cardIdx < 0) return;
    const card = p.cardsInHand.splice(cardIdx, 1)[0];
    p.playedCards.push(card);
    p.addGold(1);
    this.log(`${p.name} sold "${cardName}" for 1 gold.`);
    this.useAction();
  }

  /** Resolve a locker item choice by lockerId (sent from client via select_locker). */
  resolveLockerChoice(playerId: PlayerId, lockerId: string): void {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const options = this.pendingLockerOptions.get(playerId);
    if (!options || options.length === 0) return;
    const chosen = options.find(r => r.id === lockerId);
    if (!chosen) {
      this.log('Invalid locker item selection.');
      return;
    }
    this.pendingLockerOptions.delete(playerId);
    this.draftManager.consumeLocker(chosen.id);
    this.draftManager.applyLockerToPlayer(player, chosen);
    this.log(`${player.name} equipped locker item: ${chosen.name}!`);
  }

  /** Resolve a generic or_options choice during the action phase. */
  resolveOrOption(playerId: PlayerId, index: number): void {
    // OR action choice takes priority (e.g. Ouji Board NP vs CP)
    const orAction = this.pendingOrActionChoice.get(playerId);
    if (orAction) {
      const p = this.getPlayerById(playerId);
      if (!p) return;
      const eff = orAction.effects[index];
      if (eff == null) return;
      this.pendingOrActionChoice.delete(playerId);
      this.applyOrActionEffect(p, eff);
      return;
    }
    const options = this.pendingLockerOptions.get(playerId);
    if (options && options.length > 0) {
      const chosen = options[index];
      if (chosen) this.resolveLockerChoice(playerId, chosen.id);
    }
  }

  /**
   * Apply a single OR-option action effect string to the player.
   * Handles patterns like "pay N gold to turn X SP into Y NP",
   * "gain N NP per adjacent opponent", "gain N CP per adjacent zombie", etc.
   */
  private applyOrActionEffect(p: Player, eff: string): void {
    const lower = eff.toLowerCase().trim();

    // Extract gold cost ("pay N gold")
    const goldCostMatch = lower.match(/pay\s+(\d+)\s+gold/);
    const goldCost = goldCostMatch ? parseInt(goldCostMatch[1]) : 0;
    if (p.gold < goldCost) {
      this.log(`${p.name}: Not enough gold (needs ${goldCost}).`);
      return;
    }
    if (goldCost > 0) p.spendGold(goldCost);

    // "turn X sp/np/cp into Y sp/np/cp/gold"
    const convMatch = lower.match(/turn\s+(\d+)\s+(sp|np|cp)\s+into\s+(\d+)\s+(sp|np|cp|gold)/);
    if (convMatch) {
      const fromAmt = parseInt(convMatch[1]);
      const fromStat = convMatch[2];
      const toAmt = parseInt(convMatch[3]);
      const toStat = convMatch[4];

      // Verify and deduct source stat
      let ok = false;
      if (fromStat === 'sp' && p.survivalPoints >= fromAmt) { p.survivalPoints -= fromAmt; ok = true; }
      else if (fromStat === 'np' && p.nicePoints >= fromAmt) { p.nicePoints -= fromAmt; ok = true; }
      else if (fromStat === 'cp' && p.coolPoints >= fromAmt) { p.coolPoints -= fromAmt; ok = true; }
      if (!ok) { if (goldCost > 0) p.addGold(goldCost); this.log(`${p.name}: Not enough ${fromStat.toUpperCase()} to convert.`); return; }

      // Apply destination stat
      if (toStat === 'sp') p.survivalPoints += toAmt;
      else if (toStat === 'np') { p.nicePoints += toAmt; this.fireOnNPGained(p); }
      else if (toStat === 'cp') { p.coolPoints += toAmt; this.fireOnCPGained(p); }
      else if (toStat === 'gold') p.addGold(toAmt);
      this.log(`${p.name}: converted ${fromAmt} ${fromStat.toUpperCase()} → ${toAmt} ${toStat.toUpperCase()}.`);
      return;
    }

    // "gain N np per adjacent opponent/player"
    const adjNpMatch = lower.match(/gain\s+(\d+)\s+np\s+per\s+adjacent\s+(?:opponent|player)/);
    if (adjNpMatch) {
      const perOpp = parseInt(adjNpMatch[1]);
      const neighbors = this.board.getNeighbors(p.position);
      const count = this.players.filter(o => o.id !== p.id && o.isAlive && neighbors.some(n => n.equals(o.position))).length;
      const gained = perOpp * count;
      if (gained > 0) { p.nicePoints += gained; this.fireOnNPGained(p); }
      this.log(`${p.name} gained ${gained} NP (${count} adjacent opponent(s)).`);
      return;
    }

    // "gain N cp per adjacent zombie"
    const adjCpMatch = lower.match(/gain\s+(\d+)\s+cp\s+per\s+adjacent\s+zombie/);
    if (adjCpMatch) {
      const perZ = parseInt(adjCpMatch[1]);
      const neighbors = this.board.getNeighbors(p.position);
      const count = this.zombies.filter(z => z.isAlive && neighbors.some(n => n.equals(z.position))).length;
      const gained = perZ * count;
      if (gained > 0) { p.coolPoints += gained; this.fireOnCPGained(p); }
      this.log(`${p.name} gained ${gained} CP (${count} adjacent zombie(s)).`);
      return;
    }

    // "gain N np/cp/sp/gold" — simple gain used by choices like Identity Crisis
    const gainSimpleMatch = lower.match(/^gain\s+(\d+)\s+(np|cp|sp|gold)$/);
    if (gainSimpleMatch) {
      const n = parseInt(gainSimpleMatch[1]);
      const stat = gainSimpleMatch[2];
      if (stat === 'np') { p.addNicePoints(n); this.fireOnNPGained(p); }
      else if (stat === 'cp') { p.addCoolPoints(n); this.fireOnCPGained(p); }
      else if (stat === 'sp') p.survivalPoints += n;
      else p.addGold(n);
      this.log(`${p.name} gained ${n} ${stat.toUpperCase()}.`);
      return;
    }

    // Fallback: just log stub
    this.log(`${p.name} activated: ${eff}`);
  }

  // ---- Cost adjustments (driven by active passives) ----

  private getAdjustedDraftCostPerCard(p: Player): number {
    let cost = DRAFT_CARD_COST_GOLD;
    // Hero passives like Card Shark: "Cards cost 2 less gold to purchase"
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.cardCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.cardCostReduction);
      } else {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('cards cost') && eff.includes('less')) {
          const m = eff.match(/cards cost\s*(\d+)\s*less/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
    }
    return cost;
  }

  private getAdjustedCardCost(p: Player, c: LegacyCard): number {
    let cost = c.playCost;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.cardPlayCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.cardPlayCostReduction);
      } else {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('playing cards costs')) {
          const m = eff.match(/costs\s*(\d+)\s*less/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
    }
    return cost;
  }

  private getAdjustedMovementCost(p: Player): number {
    let cost = 3;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.movementCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.movementCostReduction);
      } else if (!icard) {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('movement cost')) {
          const m = eff.match(/movement costs?\s*-\s*(\d+)/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
      const inRoomBonus = icard?.behavior?.passive?.movementCostInRoom;
      if (inRoomBonus && getTileRoom(p.position.q, p.position.r) === inRoomBonus.room) {
        cost = Math.max(0, cost - inRoomBonus.reduction);
      }
      const outsideRoomBonus = icard?.behavior?.passive?.movementCostOutsideRoom;
      if (outsideRoomBonus && getTileRoom(p.position.q, p.position.r) !== outsideRoomBonus.room) {
        cost = Math.max(0, cost - outsideRoomBonus.reduction);
      }
    }
    return cost;
  }

  private getAdjustedBaitCost(p: Player): number {
    let cost = 5;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.baitCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.baitCostReduction);
      } else {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('bait cost')) {
          const m = eff.match(/cost\s*-\s*(\d+)/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
      if (icard?.behavior?.passive?.baitCostBonus != null)
        cost += icard.behavior.passive.baitCostBonus;
    }
    return Math.max(0, cost);
  }

  private getAdjustedTrapCost(p: Player): number {
    let cost = 16;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.trapCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.trapCostReduction);
      } else {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('trap') && eff.includes('cost')) {
          const m = eff.match(/cost\s*(\d+)\s*less/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
      if (icard?.behavior?.passive?.trapCostBonus != null) {
        cost += icard.behavior.passive.trapCostBonus;
      }
    }
    return Math.max(0, cost);
  }

  private getAdjustedBarricadeCost(p: Player): number {
    let cost = 10;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.barricadeCostReduction != null) {
        cost = Math.max(0, cost - icard.behavior.passive.barricadeCostReduction);
      } else {
        const eff = passive.effect.toLowerCase();
        if (eff.includes('barricade') && eff.includes('cost')) {
          const m = eff.match(/cost\s*(\d+)\s*less/);
          if (m) cost = Math.max(0, cost - parseInt(m[1]));
        }
      }
    }
    return cost;
  }

  /** Base toll for crossing ANY barricade during normal movement, reduced by passive effects. */
  private getAdjustedBarricadeCrossCost(p: Player): number {
    let toll = 2;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.barricadeCrossCostReduction != null) {
        toll = Math.max(0, toll - icard.behavior.passive.barricadeCrossCostReduction);
      }
    }
    return toll;
  }

  /** Gold refunded after the player crosses an opponent's barricade (passive effects). */
  private getBarricadeCrossRefund(p: Player): number {
    let refund = 0;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.barricadeCrossRefund != null) {
        refund += icard.behavior.passive.barricadeCrossRefund;
      }
    }
    return refund;
  }

  private getAdjustedBarricadeLimit(p: Player): number {
    let limit = p.barricadeLimit;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.barricadeLimitBonus != null)
        limit += icard.behavior.passive.barricadeLimitBonus;
    }
    return limit;
  }

  private getAdjustedTrapLimit(p: Player): number {
    let limit = p.trapLimit;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.trapLimitBonus != null)
        limit += icard.behavior.passive.trapLimitBonus;
    }
    return Math.max(0, limit);
  }

  private getAdjustedTrapSuccessRate(owner: Player | undefined): number {
    let rate = owner?.trapSuccessRate ?? 4;
    if (!owner) return rate;
    for (const passive of owner.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.trapEffectivenessBonus != null)
        rate += icard.behavior.passive.trapEffectivenessBonus;
    }
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        if (icard?.behavior?.passive?.allTrapEffectiveness != null)
          rate += icard.behavior.passive.allTrapEffectiveness;
      }
    }
    return Math.max(1, Math.min(5, rate));
  }

  private getAdjustedBarricadeFailRate(barricadeOwner: Player | undefined): number {
    let rate = barricadeOwner?.barricadeFailRate ?? 3;
    if (!barricadeOwner) return rate;
    for (const passive of barricadeOwner.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.barricadeEffectivenessBonus != null)
        rate += icard.behavior.passive.barricadeEffectivenessBonus;
    }
    for (const pl of this.players) {
      if (!pl.isAlive || pl.id === barricadeOwner.id) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        if (icard?.behavior?.passive?.opponentBarricadeEffectiveness != null)
          rate += icard.behavior.passive.opponentBarricadeEffectiveness;
      }
    }
    // allBarricadeEffectiveness applies globally (e.g. Barry Cade)
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        if (icard?.behavior?.passive?.allBarricadeEffectiveness != null)
          rate += icard.behavior.passive.allBarricadeEffectiveness;
      }
    }
    return Math.max(1, Math.min(5, rate));
  }

  private getAdjustedMeleeCost(p: Player): number {
    let cost = p.meleeCost;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.meleeCostReduction != null)
        cost = Math.max(0, cost - icard.behavior.passive.meleeCostReduction);
    }
    return cost;
  }

  private getAdjustedMeleeSuccessRate(p: Player): number {
    let rate = p.meleeSuccessRate;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.meleeEffectivenessBonus != null)
        rate += icard.behavior.passive.meleeEffectivenessBonus;
    }
    // allMeleeEffectiveness applies globally (e.g. Gym Coach +1 = easier, Bungler/Gas Leak -1 = harder)
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        if (icard?.behavior?.passive?.allMeleeEffectiveness != null)
          rate += icard.behavior.passive.allMeleeEffectiveness;
      }
    }
    return Math.max(1, Math.min(5, rate));
  }

  private getAdjustedBaitRangeForOwner(ownerId: string): number {
    const owner = this.getPlayerById(ownerId as PlayerId);
    let range = 3;
    if (!owner) return range;
    for (const passive of owner.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      if (icard?.behavior?.passive?.baitRadiusBonus != null)
        range += icard.behavior.passive.baitRadiusBonus;
    }
    return range;
  }

  // ---- Passive event fire helpers ----

  private fireOnDamageTaken(p: Player): void {
    // Only fire the victim's own onDamageTaken passives if they survived the hit
    if (p.isAlive) {
      for (const passive of p.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        const delta = icard?.behavior?.passive?.onDamageTaken;
        if (delta) {
          if (delta.sp != null) p.addSurvivalPoints(delta.sp);
          if (delta.hp != null) p.addHealth(delta.hp);
          if (delta.gold != null) p.addGold(delta.gold);
          if (delta.cp != null) { p.addCoolPoints(delta.cp); this.fireOnCPGained(p); }
          if (delta.np != null) { p.addNicePoints(delta.np); this.fireOnNPGained(p); }
          if (delta.gp != null) p.goldProduction += delta.gp;
          this.log(`${p.name}: onDamageTaken passive triggered.`);
        }
      }
    } // end isAlive check
    // onAnyDamageTakenGold: all players with this passive earn gold when anyone takes damage
    for (const other of this.players) {
      if (!other.isAlive) continue;
      for (const passive of other.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        const gold = icard?.behavior?.passive?.onAnyDamageTakenGold;
        if (gold != null) {
          other.addGold(gold);
          this.log(`${other.name}: damage watch +${gold} gold (Loan Wolf).`);
        }
      }
    }
  }

  private fireOnAnyZombieKilled(): void {
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        const gold = icard?.behavior?.passive?.onAnyZombieKilledGold;
        if (gold != null) {
          pl.addGold(gold);
          this.log(`${pl.name}: zombie kill bonus +${gold} gold (Dog Tags).`);
        }
      }
    }
  }

  private fireOnBaitPlaced(placer: Player): void {
    for (const pl of this.players) {
      if (!pl.isAlive) continue;
      for (const passive of pl.activePassives) {
        const icard = CardRegistry.get(passive.name as CardName);
        const delta = icard?.behavior?.passive?.onBaitPlaced;
        if (delta) {
          const gains: string[] = [];
          if (delta.gold != null) { pl.addGold(delta.gold); gains.push(`+${delta.gold} gold`); }
          if (delta.sp != null) { pl.addSurvivalPoints(delta.sp); gains.push(`+${delta.sp} SP`); }
          if (delta.np != null) { pl.addNicePoints(delta.np); gains.push(`${delta.np >= 0 ? '+' : ''}${delta.np} NP`); }
          if (delta.cp != null) { pl.addCoolPoints(delta.cp); gains.push(`${delta.cp >= 0 ? '+' : ''}${delta.cp} CP`); }
          this.log(`${pl.name}: "${passive.name}" triggered by ${placer.name}'s bait placement (${gains.join(', ') || 'no reward'}).`);
        }
      }
    }
  }

  fireOnCPGained(p: Player): void {
    if (!p.isAlive) return;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      const opt = icard?.behavior?.passive?.onCPGainedOptional;
      if (opt && p.gold >= opt.goldCost) {
        p.spendGold(opt.goldCost);
        if (opt.gain.np != null) p.addNicePoints(opt.gain.np);
        if (opt.gain.sp != null) p.addSurvivalPoints(opt.gain.sp);
        if (opt.gain.gold != null) p.addGold(opt.gain.gold);
        if (opt.gain.hp != null) p.addHealth(opt.gain.hp);
        this.log(`${p.name}: paid ${opt.goldCost} gold for CP gain bonus.`);
      }
    }
  }

  fireOnNPGained(p: Player): void {
    if (!p.isAlive) return;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      const opt = icard?.behavior?.passive?.onNPGainedOptional;
      if (opt && p.gold >= opt.goldCost) {
        p.spendGold(opt.goldCost);
        if (opt.gain.cp != null) p.addCoolPoints(opt.gain.cp);
        if (opt.gain.sp != null) p.addSurvivalPoints(opt.gain.sp);
        if (opt.gain.gold != null) p.addGold(opt.gain.gold);
        if (opt.gain.hp != null) p.addHealth(opt.gain.hp);
        this.log(`${p.name}: paid ${opt.goldCost} gold for NP gain bonus.`);
      }
    }
  }

  private fireMeleeOnKillDraw(p: Player): void {
    if (!p.isAlive) return;
    for (const passive of p.activePassives) {
      const icard = CardRegistry.get(passive.name as CardName);
      const n = icard?.behavior?.passive?.meleeOnKillDraw;
      if (n != null && n > 0) {
        this.drawCards(p, n);
        this.log(`${p.name}: melee kill draw (${n} card(s)).`);
      }
    }
  }

  // No-ops: Phase 3 computes playability lazily in toModel()
  reclassifyCards(_player?: Player): void { }
  reclassifyCardsForAll(): void { }

  // ---- Reset ----

  reset(): void {
    this.zombies.length = 0;
    this.deck.length = 0;
    this.passedPlayerIds.clear();
    this.currentTurnIndex = 0;
    this.actionsRemaining = 3;
    this.generationCount = 1;
    this.currentMode = '';
    this.playerInEscapeId = undefined;
    this._draftingPhase = false;
    this._placementPhase = false;
    this._setupPhase = true;
    this.setupPlayerIndex = 0;
    this.firstBarricadeHex = undefined;
    this.pendingTargetCardName = undefined;
    this.pendingTargetPlayerId = undefined;
    this.pendingTargetRoomFilter = undefined;
    this.pendingTargetRequireAdjacentPlayer = false;
    this.pendingTargetRequireAdjacentZombie = false;
    this.pendingInteraction = undefined;
    this.pendingFreeBait = false;
    this.pendingFreeBarricadeCount = 0;
    this.pendingFreeMoveSteps = 0;
    this.pendingFreeMovePlayerId = undefined;
    this.pendingFreeMovesPayBarricades = false;
    this.pendingFreeTrap = false;
    this.pendingLockerOptions.clear();
    this.pendingOrActionChoice.clear();
    this.zombieTrailHexKeys.clear();
    this.zombieTrailMoves = [];
    this.pendingNightPoints.clear();
    this.nightChoiceQueue = [];
    this.validEscapeHexes = [];
    this.board.reset();
    for (const p of this.players) p.reset();
    this.draftManager.loadAllFromResources();
    this.draftManager.dealSetupOptions(this.players);
    this.initDeck();
  }

  // ---- Serialization ----

  serialize(): SerializedGame {
    return {
      id: this.id,
      phase: this.getPhase(),
      generation: this.generationCount,
      actionsRemaining: this.actionsRemaining,
      activePlayerId: this.getCurrentPlayer().id,
      playerInEscapeId: this.playerInEscapeId,
      currentMode: this.currentMode,
      firstBarricadeHex: this.firstBarricadeHex
        ? { q: this.firstBarricadeHex.q, r: this.firstBarricadeHex.r }
        : undefined,
      pendingTargetCardName: this.pendingTargetCardName,
      pendingTargetPlayerId: this.pendingTargetPlayerId,
      pendingInteraction: this.pendingInteraction,
      passedPlayerIds: [...this.passedPlayerIds],
      setupPlayerIndex: this.setupPlayerIndex,
      players: this.players.map(p => this.serializePlayer(p)),
      board: {
        barricades: [...this.board.getBarricades().entries()].map(([k, b]) => ({
          edgeKey: k,
          ownerId: b.ownerId as PlayerId,
        })),
        traps: [...this.board.getTraps().entries()].map(([k, t]) => ({
          hexKey: k,
          ownerId: t.ownerId as PlayerId,
        })),
        baits: [...this.board.getBaits().entries()].map(([k, ownerId]) => ({
          hexKey: k,
          ownerId,
        })),
      },
      zombies: this.zombies
        .filter(z => z.isAlive)
        .map(z => ({ id: z.id, q: z.position.q, r: z.position.r })),
      deck: this.deck.map(c => this.serializeCard(c)),
      gameLog: [...this.gameLog],
      createdAtMs: this.createdAtMs,
      lastSaveId: this.lastSaveId,
      settings: { ...this.settings },
    };
  }

  private serializePlayer(p: Player): SerializedPlayer {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      q: p.position.q,
      r: p.position.r,
      gold: p.gold,
      hitPoints: p.hitPoints,
      maxHitPoints: p.maxHitPoints,
      survivalPoints: p.survivalPoints,
      nicePoints: p.nicePoints,
      coolPoints: p.coolPoints,
      goldProduction: p.goldProduction,
      trapLimit: p.trapLimit,
      trapSuccessRate: p.trapSuccessRate,
      barricadeFailRate: p.barricadeFailRate,
      meleeSuccessRate: p.meleeSuccessRate,
      meleeCost: p.meleeCost,
      cardsInHand: p.cardsInHand.map(c => this.serializeCard(c)),
      playedCards: p.playedCards.map(c => this.serializeCard(c)),
      activeActions: p.activeActions.map(c => this.serializeCard(c)),
      usedActions: p.usedActions.map(c => this.serializeCard(c)),
      activePassives: p.activePassives.map(c => this.serializeCard(c)),
      temporaryHand: p.temporaryHand.map(c => this.serializeCard(c)),
      selectedDraftCards: p.selectedDraftCards.map(c => this.serializeCard(c)),
      selectedHeroId: p.selectedHero?.id as HeroId | undefined,
      selectedLockerIds: p.selectedLockers.map(r => r.id as LockerId),
      setupConfirmed: p.setupConfirmed,
      selectedStartingCards: p.selectedStartingCards.map(c => this.serializeCard(c)),
      setupCardOptions: p.setupCardOptions.map(c => this.serializeCard(c)),
      setupHeroOptionIds: p.setupHeroOptions.map(h => h.id as HeroId),
      setupLockerOptionIds: p.setupLockerOptions.map(r => r.id as LockerId),
      isPlaced: p.isPlaced,
      isLastSurvivor: p.isLastSurvivor,
    };
  }

  private serializeCard(c: LegacyCard): SerializedCard {
    return {
      name: c.name,
      effect: c.effect,
      requirement: c.requirement,
      bonus: c.bonus,
      playCost: c.playCost,
      description: c.description,
    };
  }

  private static fromCard(c: SerializedCard): LegacyCard {
    return new LegacyCard(c.name, c.effect, c.requirement, c.bonus, c.playCost, c.description);
  }

  static deserialize(data: SerializedGame): Game {
    // Reconstruct board
    const board = new Board();
    for (const b of data.board.barricades) {
      const parts = b.edgeKey.split('|');
      board.placeBarricade(
        HexCoordinate.fromKey(parts[0]),
        HexCoordinate.fromKey(parts[1]),
        new Barricade(b.ownerId),
      );
    }
    for (const t of data.board.traps) {
      board.placeTrap(HexCoordinate.fromKey(t.hexKey), new Trap(t.ownerId));
    }
    for (const bait of data.board.baits) {
      board.placeBait(HexCoordinate.fromKey(bait.hexKey), bait.ownerId);
    }

    // Create minimal players (constructor will overwrite their setup state via dealSetupOptions)
    const players = data.players.map(sp =>
      new Player(sp.id, sp.name, sp.color, new HexCoordinate(sp.q, sp.r)),
    );

    // Create Game (this runs initDeck and dealSetupOptions — we'll overwrite both)
    const game = new Game(data.id, board, players);

    // Restore deck (overwrite the freshly-shuffled one)
    game.deck.length = 0;
    game.deck.push(...data.deck.map(Game.fromCard));

    // Restore all player state (overwriting what constructor/dealSetupOptions changed)
    for (let i = 0; i < players.length; i++) {
      const sp = data.players[i];
      const p = players[i];
      p.gold = sp.gold;
      p.hitPoints = sp.hitPoints;
      p.maxHitPoints = sp.maxHitPoints;
      p.survivalPoints = sp.survivalPoints;
      p.nicePoints = sp.nicePoints;
      p.coolPoints = sp.coolPoints;
      p.goldProduction = sp.goldProduction;
      p.trapLimit = sp.trapLimit;
      p.trapSuccessRate = sp.trapSuccessRate;
      p.barricadeFailRate = sp.barricadeFailRate;
      p.meleeSuccessRate = sp.meleeSuccessRate ?? 3;
      p.meleeCost = sp.meleeCost ?? 7;
      p.cardsInHand = sp.cardsInHand.map(Game.fromCard);
      p.playedCards = sp.playedCards.map(Game.fromCard);
      p.activeActions = sp.activeActions.map(Game.fromCard);
      p.usedActions = sp.usedActions.map(Game.fromCard);
      p.activePassives = sp.activePassives.map(Game.fromCard);
      p.temporaryHand = sp.temporaryHand.map(Game.fromCard);
      p.selectedDraftCards = sp.selectedDraftCards.map(Game.fromCard);
      p.selectedStartingCards = sp.selectedStartingCards.map(Game.fromCard);
      p.setupCardOptions = sp.setupCardOptions.map(Game.fromCard);
      p.setupConfirmed = sp.setupConfirmed;
      p.isPlaced = sp.isPlaced ?? true;
      p.isLastSurvivor = sp.isLastSurvivor ?? false;
      // Hero/locker option lists require full HeroData/LockerData objects;
      // not recoverable from IDs alone without the original pool. Left empty post-load.
      p.setupHeroOptions = [];
      p.setupLockerOptions = [];
    }

    // Restore Game private fields
    game._setupPhase = data.phase === Phase.SETUP;
    game._draftingPhase = data.phase === Phase.DRAFTING;
    game._placementPhase = data.phase === Phase.PLACEMENT;
    if (data.settings) game.settings = { ...data.settings };
    game.playerInEscapeId = data.playerInEscapeId;
    game.generationCount = data.generation;
    game.actionsRemaining = data.actionsRemaining;
    game.currentMode = data.currentMode;
    game.firstBarricadeHex = data.firstBarricadeHex
      ? new HexCoordinate(data.firstBarricadeHex.q, data.firstBarricadeHex.r)
      : undefined;
    game.pendingTargetCardName = data.pendingTargetCardName;
    game.pendingTargetPlayerId = data.pendingTargetPlayerId;
    game.pendingInteraction = data.pendingInteraction;
    game.setupPlayerIndex = data.setupPlayerIndex;
    game.lastSaveId = data.lastSaveId;

    for (const id of data.passedPlayerIds) game.passedPlayerIds.add(id);

    const activeIdx = players.findIndex(p => p.id === data.activePlayerId);
    if (activeIdx >= 0) game.currentTurnIndex = activeIdx;

    // Restore zombies
    for (const sz of data.zombies) {
      game.zombies.push(new Zombie(new HexCoordinate(sz.q, sz.r)));
    }

    // Restore log
    game.gameLog.length = 0;
    game.gameLog.push(...data.gameLog);

    // Restore escape hexes
    if (data.playerInEscapeId) {
      const escapee = game.getPlayerById(data.playerInEscapeId);
      if (escapee) game.calculateValidEscapeHexes(escapee);
    }

    return game;
  }

  // ---- Model generation ----

  toModel(playerId: PlayerId): GameModel {
    return {
      id: this.id,
      phase: this.getPhase(),
      generation: this.generationCount,
      actionsRemaining: this.actionsRemaining,
      activePlayerId: this.getCurrentPlayer().id,
      playerInEscapeId: this.playerInEscapeId,
      pendingTargetPlayerId: this.pendingTargetPlayerId,
      pendingInteractionPlayerId: this.pendingInteraction?.playerId,
      currentMode: this.currentMode,
      nightChoicePlayerId: this.nightChoiceQueue[0],
      players: this.players.map(p => this.playerToModel(p, playerId)),
      board: this.boardToModel(),
      logs: this.gameLog.slice(-50),
      nightScoreHistory: this.nightScoreHistory,
      settings: { ...this.settings },
    };
  }

  private legacyCardToModel(card: LegacyCard, owner: Player, isOwner: boolean): CardModel {
    const adjustedCost = this.getAdjustedCardCost(owner, card);
    let isPlayable: boolean;
    let requirementsMet: boolean;
    if (isOwner) {
      const icard = CardRegistry.get(card.name as CardName);
      if (icard) {
        const ctx = { board: this.board, players: this.players, zombies: this.zombies };
        requirementsMet = RequirementEvaluator.meets(owner, icard.requirements, ctx);
        isPlayable = requirementsMet && owner.gold >= adjustedCost;
        // Spatial Swap: must have an adjacent player or zombie to swap with
        if (card.name === CardName.SPATIAL_SWAP) {
          const nbrs = this.board.getNeighbors(owner.position);
          const hasAdjTarget =
            this.players.some(pl => pl.isAlive && pl.id !== owner.id && nbrs.some(n => n.equals(pl.position))) ||
            this.zombies.some(z => z.isAlive && nbrs.some(n => n.equals(z.position)));
          if (!hasAdjTarget) { isPlayable = false; requirementsMet = false; }
        }
        // They Just Keep Coming: must have room for at least 2 more barricades
        if (card.name === CardName.THEY_JUST_KEEP_COMING) {
          const ownBarricades = [...this.board.getBarricades().values()].filter(b => b.ownerId === owner.id).length;
          if ((this.getAdjustedBarricadeLimit(owner) - ownBarricades) < 2) { isPlayable = false; requirementsMet = false; }
        }
      } else {
        requirementsMet = this.cardProcessor.meetsRequirement(owner, card);
        isPlayable = requirementsMet && owner.gold >= (adjustedCost > 0 ? adjustedCost : card.playCost);
        // School Nurse [N]: unplayable when no injured ally (≤3 HP) is in the same room
        if (card.name === 'School Nurse [N]') {
          const ownerRoom = getTileRoom(owner.position.q, owner.position.r);
          const hasTarget = this.players.some(pl =>
            pl.isAlive && pl.id !== owner.id && pl.hitPoints <= 3 &&
            getTileRoom(pl.position.q, pl.position.r) === ownerRoom
          );
          if (!hasTarget) { isPlayable = false; requirementsMet = false; }
        }
        // Gym Coach [N]: must be in gymnasium with at least one zombie there
        if (card.name === 'Gym Coach [N]') {
          const coachRoom = getTileRoom(owner.position.q, owner.position.r);
          if (coachRoom !== 'gymnasium') { isPlayable = false; requirementsMet = false; }
          else {
            const hasGymZombie = this.zombies.some(z => z.isAlive && getTileRoom(z.position.q, z.position.r) === 'gymnasium');
            if (!hasGymZombie) { isPlayable = false; requirementsMet = false; }
          }
        }
        // Gym Coach [C]: must have an adjacent opponent barricade or trap
        if (card.name === 'Gym Coach [C]') {
          if (!this.hasAdjacentOpponentStructure(owner)) { isPlayable = false; requirementsMet = false; }
        }
        // Bloodthirster [N]: unplayable when no adjacent zombie
        if (card.name === 'Bloodthirster [N]') {
          const nbrs = this.board.getNeighbors(owner.position);
          const hasAdjZombie = this.zombies.some(z => z.isAlive && nbrs.some(n => n.equals(z.position)));
          if (!hasAdjZombie) { isPlayable = false; requirementsMet = false; }
        }
        // Von Trap [N]/[C]: unplayable when no own traps are on the board
        if (card.name === 'Von Trap [N]' || card.name === 'Von Trap [C]') {
          const hasOwnTraps = [...this.board.getTraps().values()].some(t => t.ownerId === owner.id);
          if (!hasOwnTraps) { isPlayable = false; requirementsMet = false; }
        }
        // Free Hugs T-Shirt [N]: unplayable when no adjacent opponent or insufficient gold
        if (card.name === 'Free Hugs T-Shirt [N]') {
          const nbrs = this.board.getNeighbors(owner.position);
          const hasAdjOpp = this.players.some(o => o.id !== owner.id && o.isAlive && nbrs.some(n => n.equals(o.position)));
          if (!hasAdjOpp || owner.gold < 1) { isPlayable = false; requirementsMet = false; }
        }
        // Free Hugs T-Shirt [C]: unplayable when no adjacent zombie
        if (card.name === 'Free Hugs T-Shirt [C]') {
          const nbrs2 = this.board.getNeighbors(owner.position);
          const hasAdjZombie = this.zombies.some(z => z.isAlive && nbrs2.some(n => n.equals(z.position)));
          if (!hasAdjZombie) { isPlayable = false; requirementsMet = false; }
        }
        // Trap Flex: unplayable when player is at their trap limit
        if (card.name === 'Trap Flex') {
          const currentTraps = [...this.board.getTraps().values()].filter(t => t.ownerId === owner.id).length;
          if (currentTraps >= this.getAdjustedTrapLimit(owner)) { isPlayable = false; requirementsMet = false; }
        }
      }
    } else {
      isPlayable = false;
      requirementsMet = false;
    }
    const icard2 = CardRegistry.get(card.name as CardName);
    let cardType: CardType;
    if (icard2) {
      cardType = icard2.cardType;
    } else {
      const eff = (card.effect ?? '').toLowerCase();
      cardType = CardType.INSTANT;
      if (eff.startsWith('passive:')) cardType = CardType.PASSIVE;
      else if (eff.startsWith('action:')) cardType = CardType.ACTION;
    }
    return {
      name: card.name as CardName,
      playCost: card.playCost,
      adjustedCost,
      isPlayable,
      requirementsMet,
      cardType,
      cardSubtype: CardSubtype.GAME_DECK,
      requirementText: card.requirement,
      effectText: card.effect,
      bonusText: card.bonus,
      description: card.description,
    };
  }

  private playerToModel(p: Player, viewerId: PlayerId): PlayerModel {
    const isViewer = p.id === viewerId;
    const trapsPlaced = [...this.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
    const cm = (c: LegacyCard) => this.legacyCardToModel(c, p, isViewer);

    return {
      id: p.id,
      name: p.name,
      color: p.color,
      isActive: p === this.getCurrentPlayer(),
      isAlive: p.isAlive,
      gold: p.gold,
      hitPoints: p.hitPoints,
      maxHitPoints: p.maxHitPoints,
      survivalPoints: p.survivalPoints,
      nicePoints: p.nicePoints,
      coolPoints: p.coolPoints,
      goldProduction: p.goldProduction,
      trapLimit: p.trapLimit,
      trapSuccessRate: this.getAdjustedTrapSuccessRate(p),
      barricadeFailRate: this.getAdjustedBarricadeFailRate(p),
      meleeSuccessRate: this.getAdjustedMeleeSuccessRate(p),
      meleeCost: this.getAdjustedMeleeCost(p),
      moveCost: this.getAdjustedMovementCost(p),
      trapCost: this.getAdjustedTrapCost(p),
      baitCost: this.getAdjustedBaitCost(p),
      barricadeCost: this.getAdjustedBarricadeCost(p),
      trapsPlaced,
      currentRoom: getTileRoom(p.position.q, p.position.r),
      heroId: p.selectedHero?.id as HeroId | undefined,
      lockerIds: p.selectedLockers.map(r => r.id as LockerId),
      // Only reveal own cards; hide opponent hands
      cardsInHand: isViewer ? p.cardsInHand.map(cm) : [],
      playedCards: p.playedCards.map(cm),
      activeActions: p.activeActions.map(cm),
      activePassives: p.activePassives.map(cm),
      usedActionNames: p.usedActions.map(c => c.name),
      hasStartingAction: p.activeActions.some(c => c.name.includes('(Starting Action)')),
      temporaryHand: isViewer ? p.temporaryHand.map(cm) : [],
      selectedDraftCards: isViewer ? p.selectedDraftCards.map(cm) : [],
      setupCardOptions: isViewer ? p.setupCardOptions.map(cm) : [],
      setupHeroOptionIds: isViewer ? p.setupHeroOptions.map(h => h.id as HeroId) : [],
      setupLockerOptionIds: isViewer ? p.setupLockerOptions.map(r => r.id as LockerId) : [],
      selectedStartingCards: isViewer ? p.selectedStartingCards.map(cm) : [],
      selectedHeroId: p.selectedHero?.id as HeroId | undefined,
      heroStartingCardsFree: p.selectedHero?.id === HeroId.CARD_SHARK,
      selectedLockerIds: p.selectedLockers.map(r => r.id as LockerId),
      setupConfirmed: p.setupConfirmed,
      pendingNightPoints: this.pendingNightPoints.get(p.id) ?? 0,
      waitingFor: p.pendingDiscardDraw
        ? {
          type: PlayerInputType.SELECT_CARD,
          title: `Discard a card (${p.pendingDiscardDraw.left} remaining) — click one at a time`,
          validCardNames: p.cardsInHand.map(c => c.name),
          minCount: 1,
          maxCount: 1,
        }
        : (isViewer && this.pendingOrActionChoice.has(p.id))
          ? {
            type: PlayerInputType.OR_OPTIONS,
            title: `${this.pendingOrActionChoice.get(p.id)!.card.name}: Choose an option`,
            options: this.pendingOrActionChoice.get(p.id)!.effects,
          }
          : (isViewer && (this.pendingLockerOptions.get(p.id)?.length ?? 0) > 0)
            ? {
              type: PlayerInputType.SELECT_LOCKER,
              title: 'Choose a locker item to equip',
              lockerIds: (this.pendingLockerOptions.get(p.id) ?? []).map(r => r.id as string),
            }
            : undefined,
      draftCostPerCard: this.getAdjustedDraftCostPerCard(p),
      pendingDrawKeepCount: p.pendingDrawKeepCount,
      isLastSurvivor: p.isLastSurvivor,
      q: p.position.q,
      r: p.position.r,
    };
  }

  private boardToModel(): BoardModel {
    const tiles: TileModel[] = this.board.getTilesInIDOrder().map(h => ({
      key: h.key(),
      q: h.q,
      r: h.r,
      tileId: this.board.getTileID(h),
      walls: this.board.getWalls(h),
    }));

    const traps: TrapModel[] = [...this.board.getTraps().entries()].map(([hexKey, trap]) => {
      const owner = this.getPlayerById(trap.ownerId as PlayerId);
      return { hexKey, ownerId: trap.ownerId as PlayerId, ownerColor: owner?.color ?? Color.RED };
    });

    const baits: BaitModel[] = [...this.board.getBaits().entries()].map(([hexKey, ownerId]) => {
      const owner = this.getPlayerById(ownerId);
      return { hexKey, ownerId, ownerColor: owner?.color ?? Color.RED };
    });

    const barricades: BarricadeModel[] = [...this.board.getBarricades().entries()].map(([edgeKey, bar]) => {
      const [hexKeyA, hexKeyB] = edgeKey.split('|');
      const owner = this.getPlayerById(bar.ownerId as PlayerId);
      return {
        edgeKey,
        ownerId: bar.ownerId as PlayerId,
        ownerColor: owner?.color ?? Color.RED,
        hexKeyA,
        hexKeyB,
      };
    });

    const zombies: ZombieModel[] = this.zombies
      .filter(z => z.isAlive)
      .map(z => ({ id: z.id, hexKey: z.position.key(), q: z.position.q, r: z.position.r }));

    const playerPositions: PlayerPositionModel[] = this.players
      .filter(p => p.isAlive && p.isPlaced)
      .map(p => ({ id: p.id, name: p.name, color: p.color, hexKey: p.position.key(), q: p.position.q, r: p.position.r }));

    const highlightedHexKeys = this.computeHighlightedHexKeys();

    return { tiles, traps, baits, barricades, zombies, players: playerPositions, highlightedHexKeys, zombieTrailHexKeys: [...this.zombieTrailHexKeys], zombieTrailMoves: [...this.zombieTrailMoves] };
  }

  private computeHighlightedHexKeys(): string[] {
    if (this._placementPhase) {
      const placedHexes = this.players.filter(p => p.isAlive && p.isPlaced).map(p => p.position);
      const zombieHexes = this.zombies.filter(z => z.isAlive).map(z => z.position);
      return this.board.getAllHexes().filter(h => {
        if (placedHexes.some(ph => ph.equals(h))) return false;
        if (this.board.getNeighbors(h).some(n => placedHexes.some(ph => ph.equals(n)))) return false;
        if (zombieHexes.some(zh => zh.equals(h))) return false;
        if (this.board.getNeighbors(h).some(n => zombieHexes.some(zh => zh.equals(n)))) return false;
        return true;
      }).map(h => h.key());
    }
    if (this.validEscapeHexes.length > 0) {
      return this.validEscapeHexes.map(h => h.key());
    }
    // Zombie targeting highlights (filtered by room and/or adjacency if applicable)
    if (this.pendingTargetCardName !== undefined) {
      const currentPlayer = this.pendingTargetPlayerId ? this.getPlayerById(this.pendingTargetPlayerId) : undefined;
      return this.zombies
        .filter(z => z.isAlive && (
          this.pendingTargetRoomFilter === undefined ||
          getTileRoom(z.position.q, z.position.r) === this.pendingTargetRoomFilter
        ) && (
            !this.pendingTargetRequireAdjacentZombie ||
            (currentPlayer && currentPlayer.position.distanceTo(z.position) === 1)
          ) && (
            !this.pendingTargetRequireAdjacentPlayer ||
            this.players.some(pl => pl.isAlive && pl.position.distanceTo(z.position) === 1)
          ))
        .map(z => z.position.key());
    }
    if (!this.pendingInteraction) {
      // Jump-over highlights: tiles directly behind an adjacent player
      if (this.pendingJumpOver) {
        const p2 = this.players.find(pl => pl.isAlive && pl.id === this.getCurrentPlayer()?.id);
        return p2 ? this.getJumpOverHexes(p2).map(h => h.key()) : [];
      }
      // Free-move highlights (Shoes, etc.)
      if (this.pendingFreeMoveSteps > 0 && this.pendingFreeMovePlayerId) {
        const fmp = this.getPlayerById(this.pendingFreeMovePlayerId);
        if (fmp) {
          return this.board.getNeighbors(fmp.position)
            .filter(h => !this.isPlayerAt(h) && !this.isZombieAt(h) && !this.board.hasTrap(h))
            .map(h => h.key());
        }
      }
      return [];
    }

    const pi = this.pendingInteraction;
    const player = this.getPlayerById(pi.playerId);

    switch (pi.type) {
      case 'destroy_any_barricade': {
        const keys0 = new Set<string>();
        for (const k of this.board.getBarricades().keys()) {
          const parts = k.split('|');
          if (parts.length === 2) { keys0.add(parts[0]); keys0.add(parts[1]); }
        }
        return [...keys0];
      }
      case 'destroy_own_barricade_reward': {
        if (!player) return [];
        const keys1 = new Set<string>();
        for (const [edKey, bar] of this.board.getBarricades()) {
          if (bar.ownerId !== player.id) continue;
          const parts = edKey.split('|');
          if (parts.length === 2) { keys1.add(parts[0]); keys1.add(parts[1]); }
        }
        return [...keys1];
      }
      case 'destroy_opponent_barricade_in_room': {
        if (!player) return [];
        const playerRoom2 = getTileRoom(player.position.q, player.position.r);
        const keys2 = new Set<string>();
        for (const [edKey, bar] of this.board.getBarricades()) {
          if (bar.ownerId === player.id) continue;
          const parts = edKey.split('|');
          if (parts.length !== 2) continue;
          const barRoom = getTileRoom(HexCoordinate.fromKey(parts[0]).q, HexCoordinate.fromKey(parts[0]).r);
          if (barRoom === playerRoom2) { keys2.add(parts[0]); keys2.add(parts[1]); }
        }
        return [...keys2];
      }
      case 'destroy_any_trap':
        return [...this.board.getTraps().keys()];
      case 'destroy_own_structure': {
        if (!player) return [];
        const keys = new Set<string>();
        for (const [hexKey, trap] of this.board.getTraps())
          if (trap.ownerId === player.id) keys.add(hexKey);
        for (const [edKey, bar] of this.board.getBarricades()) {
          if (bar.ownerId !== player.id) continue;
          const parts = edKey.split('|');
          if (parts.length === 2) { keys.add(parts[0]); keys.add(parts[1]); }
        }
        return [...keys];
      }
      case 'replace_opponent_barricade': {
        if (!player) return [];
        const keys = new Set<string>();
        for (const [edKey, bar] of this.board.getBarricades()) {
          if (bar.ownerId === player.id) continue;
          const parts = edKey.split('|');
          if (parts.length === 2) { keys.add(parts[0]); keys.add(parts[1]); }
        }
        return [...keys];
      }
      case 'move_zombie_away':
        return this.zombies.filter(z => z.isAlive).map(z => z.position.key());
      case 'trap_relocate_step1':
        return [...this.board.getTraps().keys()];
      case 'trap_relocate_step2': {
        if (!pi.data?.hexKey) return [];
        const srcHex = HexCoordinate.fromKey(pi.data.hexKey);
        return this.board.getNeighbors(srcHex)
          .filter(h => !this.board.getTraps().has(h.key()) && !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      }
      case 'spatial_swap':
        if (!player) return [];
        return this.board.getNeighbors(player.position)
          .filter(n => this.isPlayerAt(n) || this.isZombieAt(n))
          .map(n => n.key());
      case 'heal_player':
        if (!player) return [];
        return this.players
          .filter(pl => pl.isAlive && pl.id !== player.id && player.position.distanceTo(pl.position) <= 2)
          .map(pl => pl.position.key());
      case 'heal_player_in_room_simple': {
        if (!player) return [];
        const cprRoom = getTileRoom(player.position.q, player.position.r);
        return this.players
          .filter(pl => pl.isAlive && pl.id !== player.id &&
            getTileRoom(pl.position.q, pl.position.r) === cprRoom)
          .map(pl => pl.position.key());
      }
      case 'place_zombie':
        return this.board.getAllHexes()
          .filter(h => !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      case 'move_player_step1':
        // Highlight all alive non-passed players (excluding the activating player)
        if (!player) return [];
        return this.players
          .filter(pl => pl.isAlive && pl.id !== player.id && !this.passedPlayerIds.has(pl.id as PlayerId))
          .map(pl => pl.position.key());
      case 'move_player_step2': {
        // Highlight valid adjacent empty tiles for the selected target player
        if (!player || !pi.data?.hexKey) return [];
        const tPos = HexCoordinate.fromKey(pi.data.hexKey);
        return this.board.getNeighbors(tPos)
          .filter(n => !this.isPlayerAt(n) && !this.isZombieAt(n) && !this.board.hasTrap(n) && !this.board.hasBait(n))
          .map(n => n.key());
      }
      case 'heal_player_in_room': {
        if (!player) return [];
        const healRoom = getTileRoom(player.position.q, player.position.r);
        return this.players
          .filter(pl => pl.isAlive && pl.id !== player.id && pl.hitPoints <= 3 &&
            getTileRoom(pl.position.q, pl.position.r) === healRoom)
          .map(pl => pl.position.key());
      }
      case 'blow_up_own_trap':
        if (!player) return [];
        return [...this.board.getTraps().entries()]
          .filter(([, trap]) => trap.ownerId === player.id)
          .map(([hexKey]) => hexKey);
      case 'own_trap_move_step1':
        if (!player) return [];
        return [...this.board.getTraps().entries()]
          .filter(([, trap]) => trap.ownerId === player.id)
          .map(([hexKey]) => hexKey);
      case 'own_trap_move_step2': {
        if (!player || !pi.data?.hexKey) return [];
        const srcHexM = HexCoordinate.fromKey(pi.data.hexKey);
        return this.board.getAllHexes()
          .filter(h => srcHexM.distanceTo(h) <= 2 && !this.board.getTraps().has(h.key()) && !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      }
      case 'opp_trap_move_step1':
        if (!player) return [];
        return [...this.board.getTraps().entries()]
          .filter(([, trap]) => trap.ownerId !== player.id)
          .map(([hexKey]) => hexKey);
      case 'opp_trap_move_step2': {
        if (!player || !pi.data?.hexKey) return [];
        const srcOppHexM = HexCoordinate.fromKey(pi.data.hexKey);
        return this.board.getAllHexes()
          .filter(h => srcOppHexM.distanceTo(h) <= 2 && !this.board.getTraps().has(h.key()) && !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      }
      case 'steal_gold':
        if (!player) return [];
        return this.players
          .filter(pl => pl.isAlive && pl.id !== player.id && player.position.distanceTo(pl.position) <= 2)
          .map(pl => pl.position.key());
      case 'teleport_within_2':
        if (!player) return [];
        return this.board.getAllHexes()
          .filter(h => player.position.distanceTo(h) <= 2 && !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      case 'terror_sprint':
        if (!player) return [];
        return this.board.getAllHexes()
          .filter(h => (h.q === player.position.q || h.r === player.position.r)
            && !h.equals(player.position) && !this.isPlayerAt(h) && !this.isZombieAt(h))
          .map(h => h.key());
      case 'coach_destroy_adjacent': {
        if (!player) return [];
        const adjHexes = this.board.getNeighbors(player.position);
        const coachKeys = new Set<string>();
        for (const n of adjHexes) {
          const trap = this.board.getTraps().get(n.key());
          if (trap && trap.ownerId !== player.id) coachKeys.add(n.key());
        }
        for (const [edKey, bar] of this.board.getBarricades()) {
          if (bar.ownerId === player.id) continue;
          const parts = edKey.split('|');
          if (parts.length !== 2) continue;
          if (adjHexes.some(n => n.key() === parts[0] || n.key() === parts[1]) ||
            parts[0] === player.position.key() || parts[1] === player.position.key()) {
            coachKeys.add(parts[0]);
            coachKeys.add(parts[1]);
          }
        }
        return [...coachKeys];
      }
      default: {
        // Teleport-to-room: highlight open tiles in the target room
        if (pi.type.startsWith('teleport_to_room:')) {
          const targetRoom = pi.type.slice('teleport_to_room:'.length);
          return this.board.getAllHexes()
            .filter(h => getTileRoom(h.q, h.r) === targetRoom && !this.isPlayerAt(h))
            .map(h => h.key());
        }
        // Generic teleport_within_N: highlight tiles within radius
        if (pi.type.startsWith('teleport_within_')) {
          if (!player) return [];
          const radius = parseInt(pi.type.slice('teleport_within_'.length), 10);
          return this.board.getAllHexes()
            .filter(h => player.position.distanceTo(h) <= radius && !this.isPlayerAt(h) && !this.isZombieAt(h))
            .map(h => h.key());
        }
        // move_any_zombie_one_step (step 1): highlight all alive zombies
        if (pi.type === 'move_any_zombie_one_step') {
          return this.zombies.filter(z => z.isAlive).map(z => z.position.key());
        }
        // move_any_zombie_one_step_place (step 2): highlight tiles adjacent to selected zombie
        if (pi.type === 'move_any_zombie_one_step_place' && pi.data?.hexKey) {
          const zombiePos = HexCoordinate.fromKey(pi.data.hexKey);
          return this.board.getNeighbors(zombiePos)
            .filter(h => !this.isPlayerAt(h) && !this.isZombieAt(h) && !this.board.hasTrap(h))
            .map(h => h.key());
        }
        // give_cards_to_player:N (step 1): highlight all other alive players
        if (pi.type.startsWith('give_cards_to_player:')) {
          if (!player) return [];
          return this.players
            .filter(pl => pl.isAlive && pl.id !== player.id)
            .map(pl => pl.position.key());
        }
        // Missing Hallpass step 1: highlight adjacent zombies
        if (pi.type.startsWith('move_adjacent_zombie_to_room:')) {
          if (!player) return [];
          return this.zombies
            .filter(z => z.isAlive && player.position.distanceTo(z.position) === 1)
            .map(z => z.position.key());
        }
        // Missing Hallpass step 2: highlight open tiles in target room
        if (pi.type.startsWith('move_adjacent_zombie_place:')) {
          const targetRoom = pi.type.slice('move_adjacent_zombie_place:'.length);
          return this.board.getAllHexes()
            .filter(h => getTileRoom(h.q, h.r) === targetRoom && !this.isPlayerAt(h) && !this.isZombieAt(h) && !this.board.hasTrap(h))
            .map(h => h.key());
        }
        return [];
      }
    }
  }
}
