// Game.ts
import { Board, Player, CardProcessor, TargetType, ZombieManager, CardDrawer, setupNewBoard, BoardCell, ActionHandlers, StructurePlacement, MovementUtil } from '../index';
import { HeroId } from '../misc/HeroId';

export type Phase = 'setup' | 'draft' | 'player_turn' | 'zombie_turn' | 'zombie_phase' | 'game_over';

export class Game {
  // ===== CORE =====
  public board: Board;
  public players: Player[] = [];
  public zombieManager: ZombieManager | null = null;
  public globalPassives: Set<string> = new Set();
  public cardManager: CardDrawer = new CardDrawer();
  public actionHandlers = ActionHandlers;
  
  // ===== STATE =====
  public _phase: Phase = 'setup';
  public _currentPlayerIndex: number = 0;
  public _roundStartingPlayerIndex: number = 0;
  public _actionsRemaining: number = 3;
  public _generationCount: number = 0;
  public _nightSteps: number = 1;
  public logHistory: string[] = [];
  public pendingCardSelection: {
    selectionId: number;
    type: 'keep' | 'discard' | 'locker';
    playerId: string;
    count: number;
    keepCount?: number;
    drawCount: number;
    cards: any[];
    onComplete: 'drawKeepComplete' | 'discardDrawComplete' | 'secretaryDrawGiveComplete' | 'lockerCardSelectionComplete';
    recipientPlayerId?: string;
  } | null = null;

  // ===== EVENTS =====
  private listeners: Map<string, Function[]> = new Map();
  private pendingFlexPoints: Map<string, number> = new Map();
  private pendingFlexPointRequests: Set<string> = new Set();
  private lastFlexPointRequestCounts: Map<string, number> = new Map();

  // ===== ESCAPE STATE =====
  private _escapeState: {
    playerId: string;
    validTargets: BoardCell[];
    canEscapeTwoSteps: boolean;
    attackedAt: { x: number; y: number };
  } | null = null;
  private escapeResolutionResolver: (() => void) | null = null;

  // ===== TARGETING PHASE =====
  public targetingCardId: string | null = null;
  public targetingType: TargetType | null = null;
  public targetingValidTargets: any[] = [];
  public targetingPlayerId: string | null = null;

  constructor(players: Player[] = [], board: Board = setupNewBoard()) {
    this.players = players;
    this.board = board;
    CardProcessor.setGame(this);
  }

  ensureZombieManager(): ZombieManager {
    if (!this.zombieManager) {
      this.zombieManager = new ZombieManager(this.board, this.players, {
        onBarricadeHeld: (ownerId: string, x: number, y: number, flexPoints: number) => {
          const owner = this.getPlayerById(ownerId);
          if (owner) {
            this.registerFlexPoints(ownerId, flexPoints);
            this.emit('barricadeHeld', owner, x, y, flexPoints);
            this.emit('log', `${owner.name} earned ${flexPoints} flex point(s) and must choose CP or NP before the nightly draft.`);
          }
        },
        onTrapFlexAwarded: (ownerId: string, flexPoints: number) => {
          const owner = this.getPlayerById(ownerId);
          if (owner) {
            this.registerFlexPoints(ownerId, flexPoints);
            this.emit('log', `${owner.name} earned ${flexPoints} flex point(s) for adjacent traps and must choose CP or NP before the nightly draft.`);
          }
        },
        onBarricadeBroken: (ownerId, x, y) => {
          const owner = this.getPlayerById(ownerId);
          if (owner) this.emit('barricadeBroken', owner, x, y);
        },
        onPlayerEscape: (playerId) => {
          const player = this.getPlayerById(playerId);
          if (player) this.emit('playerEscaped', player);
        },
        onTrapKill: (ownerId, x, y) => {
          const owner = this.getPlayerById(ownerId);
          if (owner) {
            const spEarned = 1 + (owner.heroId === HeroId.ELSA_VON_TRAP ? 1 : 0);
            owner.addSPs(spEarned);
            this.emit('log', `Trap at (${x},${y}) killed a zombie; ${owner.name} gained ${spEarned} SP.`);
            this.emit('trapKill', owner, x, y);
          }
        },
        onTrapFailed: () => this.emit('trapFailed'),
        onBaitConsumed: (ownerId, x, y) => {
          const owner = this.getPlayerById(ownerId);
          if (owner) {
            this.registerFlexPoints(ownerId, 1);
            this.emit('baitConsumed', owner, x, y);
            this.emit('log', `${owner.name} earned 1 flex point for bait being consumed and must choose CP or NP before the nightly draft.`);
          }
        },
        onPlayerAttacked: (playerId: string, x: number, y: number, fromCell: BoardCell) => {
          this.handlePlayerAttacked(playerId, x, y, fromCell);
        },
        waitForEscape: () => this.waitForEscapeResolution(),
        getTrapSuccessRate: (p) => p.getTrapEffectiveness() / 6,
        getBarricadeSuccessRate: (p) => p.getBarricadeEffectiveness() / 6,
        getBaitRange: (p) => p.getBaitRadius(),
        log: (msg) => this.emit('log', msg)
      });
    }

    return this.zombieManager;
  }

  // ===== PLAYER MANAGEMENT =====

  addPlayer(player: Player): void {
    this.players.push(player);
  }

  getCurrentPlayer(): Player | null {
    return this.players[this._currentPlayerIndex] || null;
  }

  getPlayerById(id: string): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  getPendingFlexPointSelections(): Array<{ playerId: string; count: number; options: string[] }> {
    return Array.from(this.pendingFlexPoints.entries())
      .filter(([, count]) => count > 0)
      .map(([playerId, count]) => ({ playerId, count, options: ['NP', 'CP'] }));
  }

  registerFlexPoints(playerId: string, count: number): number {
    if (!count || count <= 0) return 0;
    const total = (this.pendingFlexPoints.get(playerId) ?? 0) + count;
    this.pendingFlexPoints.set(playerId, total);

    this.pendingFlexPointRequests.add(playerId);
    this.lastFlexPointRequestCounts.set(playerId, total);
    this.emit('requestFlexPointSelection', { playerId, count: total, options: ['NP', 'CP'] });

    return total;
  }

  resolvePendingFlexPoints(forceReplay: boolean = true): void {
    for (const [playerId, count] of this.pendingFlexPoints.entries()) {
      if (count <= 0) continue;

      if (!forceReplay) {
        const lastCount = this.lastFlexPointRequestCounts.get(playerId);
        if (this.pendingFlexPointRequests.has(playerId) && lastCount === count) {
          continue;
        }
      }

      this.pendingFlexPointRequests.add(playerId);
      this.lastFlexPointRequestCounts.set(playerId, count);
      this.emit('requestFlexPointSelection', { playerId, count, options: ['NP', 'CP'] });
    }
  }

  selectFlexPointChoice(playerId: string, choice: 'NP' | 'CP'): boolean {
    const count = this.pendingFlexPoints.get(playerId) ?? 0;
    if (count <= 0) return false;

    const player = this.getPlayerById(playerId);
    if (!player) return false;

    if (choice === 'NP') {
      player.addNPs(count);
    } else {
      player.addCPs(count);
    }

    this.pendingFlexPoints.delete(playerId);
    this.pendingFlexPointRequests.delete(playerId);
    this.lastFlexPointRequestCounts.delete(playerId);
    this.emit('flexPointsResolved', { playerId, count, choice });
    return true;
  }

  // ===== TURN MANAGEMENT =====

  startGame(): void {
    this._phase = 'setup';
    this._currentPlayerIndex = 0;
    this._actionsRemaining = 3;
    this._generationCount = 0;
    this._nightSteps = 1;
    this.emit('gameStarted');
    this.emit('phaseChanged', 'setup');
  }

  endTurn(): void {
    const player = this.getCurrentPlayer();
    this.emit('turnEnded', player);
    
    let nextIndex = (this._currentPlayerIndex + 1) % this.players.length;
    let attempts = 0;
    while (this.players[nextIndex].isEliminated && attempts < this.players.length) {
      nextIndex = (nextIndex + 1) % this.players.length;
      attempts++;
    }
    
    if (attempts >= this.players.length || this.isGameOver()) {
      this._phase = 'game_over';
      this.emit('gameOver');
      return;
    }
    
    this._currentPlayerIndex = nextIndex;
    this._actionsRemaining = 3;
    this.emit('turnStarted', this.getCurrentPlayer());
  }

  useAction(): boolean {
    if (this._actionsRemaining <= 0) return false;
    this._actionsRemaining--;
    if (this._actionsRemaining === 0) {
      this.emit('actionsDepleted');
    }
    return true;
  }

  // ===== ZOMBIE PHASE =====

  runZombiePhase(options: { async?: boolean; stepDelayMs?: number; onComplete?: () => void } = {}): void {
    this._phase = 'zombie_turn';
    this.emit('phaseChanged', 'zombie_turn');

    this.ensureZombieManager();

    const finalizeZombiePhase = () => {
      this._generationCount++;
      this._nightSteps = this.getNightSteps();
      this._phase = 'zombie_phase';
      this.emit('phaseChanged', 'zombie_phase');
      this.emit('zombiePhaseComplete');
      this.emit('log', 'Zombie movement resolved. Click “Begin Nightly Draft” to continue.');
      options.onComplete?.();
    };

    this.zombieManager!.zombiePhase(this._generationCount, {
      ...options,
      onComplete: finalizeZombiePhase,
    });
  }

  // ===== DRAFT PHASE =====

  startDraftPhase(): void {
    this._phase = 'draft';
    this.emit('phaseChanged', 'draft');
    this.emit('draftStarted');
    
    // Draft logic here
    
    this._phase = 'player_turn';
    this._currentPlayerIndex = 0;
    this._actionsRemaining = 3;
    this.emit('phaseChanged', 'player_turn');
    this.emit('turnStarted', this.getCurrentPlayer());
  }

  // ===== ESCAPE HANDLING =====

  hasActiveEscapeState(playerId?: string): boolean {
    if (!this._escapeState) return false;
    return playerId ? this._escapeState.playerId === playerId : true;
  }

  private waitForEscapeResolution(): Promise<void> {
    if (!this._escapeState) return Promise.resolve();
    return new Promise(resolve => {
      this.escapeResolutionResolver = resolve;
    });
  }

  private resolveEscapeWaiter(): void {
    const resolve = this.escapeResolutionResolver;
    this.escapeResolutionResolver = null;
    resolve?.();
  }

  private handlePlayerAttacked(playerId: string, x: number, y: number, fromCell: BoardCell): void {
    const player = this.getPlayerById(playerId);
    if (!player) return;

    const canEscapeTwoSteps = player.emergencyRetreat === true;
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return;

    const currentCell = this.board.getCell(pos.x, pos.y);
    if (!currentCell) return;

    let validTargets: BoardCell[] = [];
    if (fromCell && fromCell.isEmpty && !fromCell.isHole) {
      validTargets.push(fromCell);
    }
    
    if (canEscapeTwoSteps) {
      const visited = new Set<string>();
      const queue: { cell: BoardCell; dist: number }[] = [{ cell: currentCell, dist: 0 }];
      visited.add(currentCell.id);

      while (queue.length > 0) {
        const { cell, dist } = queue.shift()!;
        if (dist > 0 && dist <= 2 && cell.isEmpty && !cell.isHole) {
          validTargets.push(cell);
        }
        if (dist < 2) {
          for (const neighbor of this.board.getNeighbors(cell)) {
            if (!visited.has(neighbor.id) && neighbor.isEmpty && !neighbor.isHole && !neighbor.hasBarricade) {
              visited.add(neighbor.id);
              queue.push({ cell: neighbor, dist: dist + 1 });
            }
          }
        }
      }
    } else {
      validTargets = this.board.getNeighbors(currentCell).filter(c => c.isEmpty && !c.isHole && !c.hasBarricade);
    }

    if (validTargets.length === 0) {
      const remainingHealth = player.currHealth;
      player.loseHealths(remainingHealth);
      this.emit('playerDamaged', player, remainingHealth);
      if (currentCell.hasPlayer && currentCell.structureOwner === player) {
        currentCell.removePlayer();
        currentCell.occupantType = currentCell.hasZombie ? 'zombie' : 'empty';
      }
      this.emit('log', `${player.name} was eliminated by the zombie swarm because no legal escape tiles remained.`);
      this._escapeState = null;
      this.emit('escapeMode', null);
      this.emit('stateChanged');
      return;
    }

    this._escapeState = {
      playerId: player.id,
      validTargets,
      canEscapeTwoSteps,
      attackedAt: { x, y }
    };

    this.emit('escapeMode', {
      playerId: player.id,
      validTargets,
      canEscapeTwoSteps,
      message: `${player.name} was attacked! Choose an escape tile${canEscapeTwoSteps ? ' (2 steps available!)' : ''}`
    });
    this.emit('stateChanged');

    if (player.isBot && validTargets.length > 0) {
      this.completeEscape(playerId, validTargets[0]);
    }
  }

  completeEscape(playerId: string, targetCell: BoardCell): boolean {
    if (!this._escapeState || this._escapeState.playerId !== playerId) {
      this.emit('error', 'No escape in progress');
      return false;
    }

    const player = this.getPlayerById(playerId);
    if (!player) return false;

    const isValid = this._escapeState.validTargets.some(t => t.id === targetCell.id);
    if (!isValid) {
      this.emit('error', 'Invalid escape target');
      return false;
    }

    const pos = this.board.getPlayerPosition(player);
    if (!pos) return false;

    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    const maxDist = this._escapeState.canEscapeTwoSteps ? 2 : 1;

    if (dist > maxDist) {
      this.emit('error', `Target must be within ${maxDist} tiles`);
      return false;
    }

    const currentCell = this.board.getCell(pos.x, pos.y);
    if (currentCell && currentCell.hasPlayer && currentCell.structureOwner === player) {
      // Preserve the zombie that already occupied this tile during the attack.
      // Clearing the whole cell would remove the attacker instead of letting it remain.
      currentCell.removePlayer();
      currentCell.occupantType = currentCell.hasZombie ? 'zombie' : 'empty';
      currentCell.zombieStepsLeft = currentCell.zombieStepsLeft ?? 0;
      currentCell.zombieTarget = null;
    }

    targetCell.setPlayer(player);

    this.emit('playerEscaped', player, targetCell);
    this.emit('log', `${player.name} escaped to (${targetCell.x}, ${targetCell.y})`);

    this._escapeState = null;
    this.emit('escapeMode', null);
    this.emit('stateChanged');
    this.resolveEscapeWaiter();
    return true;
  }

  cancelEscape(playerId: string): boolean {
    if (!this._escapeState || this._escapeState.playerId !== playerId) {
      return false;
    }

    const player = this.getPlayerById(playerId);
    if (player) {
      player.loseHealths(1);
      this.emit('playerDamaged', player, 1);
      this.emit('log', `${player.name} chose not to escape and took 1 damage!`);
    }

    this._escapeState = null;
    this.emit('escapeMode', null);
    this.emit('stateChanged');
    this.resolveEscapeWaiter();
    return true;
  }

  onCardDiscardSelected(player: Player, cardId: string, drawCount: number): void {
    const result = CardDrawer.completeDiscardDraw(player, cardId, drawCount);
    this.emit('discardDrawComplete', result);
    this.emit('stateChanged');
  }

  private resolveTargetCell(target: any): BoardCell | null {
    if (!target || typeof target !== 'object') return null;
    const x = Number((target as any).x);
    const y = Number((target as any).y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return this.board.getCell(x, y) ?? null;
  }

  private isWithinPlacementRange(player: Player, targetCell: BoardCell, range: number = 3): boolean {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return false;
    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    return dist <= range;
  }

  // ===== EXECUTE ACTIONS =====

  executeAction(actionType: string, params: any): boolean {
    const player = this.getCurrentPlayer();
    if (!player || this._phase !== 'player_turn') return false;
    if (this._actionsRemaining <= 0) return false;

    let success = false;
    
    console.log(`[Game.executeAction] ${player.name} executing ${actionType} with params:`, params);
    
    switch (actionType) {
      case 'move':
        success = this.handleMove(player, params);
        break;
      case 'trap':
        success = this.handleTrap(player, params);
        break;
      case 'bait':
        success = this.handleBait(player, params);
        break;
      case 'barricade':
        console.log(`[Game.executeAction] Calling handleBarricade for ${player.name}`);
        success = this.handleBarricade(player, params);
        break;
      case 'melee':
        success = this.handleMelee(player, params);
        break;
      default:
        success = this.playCard(actionType, player, params);
        break;
    }
    
    console.log(`[Game.executeAction] ${player.name} ${actionType} result: ${success}`);
    
    if (success) {
      this.useAction();
      this.emit('actionExecuted', actionType, params);
      this.emit('stateChanged');
    }
    
    return success;
  }

  completeSecretaryDrawGive(player: Player, keptCardId: string, lowestPlayerId: string): void {
    const tempHand = player.tempHand || [];
    const keptCard = tempHand.find(c => c.id === keptCardId);
    
    if (keptCard) {
      player.addCard(keptCard);
    }
     
    const lowestPlayer = this.getPlayerById(lowestPlayerId);
    const cardsToGive = tempHand.filter(c => c.id !== keptCardId);
    if (lowestPlayer) {
      for (const card of cardsToGive) {
        lowestPlayer.addCard(card);
      }
    }
    
    player.tempHand = [];
    player.tempTargetPlayer = null;
    player.tempCallback = '';
    player.addNPs(1);
    if (this.pendingCardSelection?.playerId === player.id && this.pendingCardSelection.onComplete === 'secretaryDrawGiveComplete') {
      this.pendingCardSelection = null;
    }
    this.emit('stateChanged');
  }

  // ===== PLAY CARD =====

  clearTargetingState(): void {
    this.targetingCardId = null;
    this.targetingType = null;
    this.targetingValidTargets = [];
    this.targetingPlayerId = null;
  }

  playCard(cardId: string, player: Player, target?: any): boolean {
    const handCard = player.hand.cards.find((card: any) => String(card.id) === String(cardId) || String(card.cardId) === String(cardId));
    const registryCardId = handCard?.cardId ?? cardId;
    const cardDef = CardProcessor.get(registryCardId);

    const result = CardProcessor.playCard(registryCardId, player, this.board, this, target);

    if (!result.success) {
      this.clearTargetingState();
      this.emit('error', result.message);
      return false;
    }

    if (result.needsTarget) {
      this.targetingCardId = result.cardId || null;
      this.targetingType = result.targetType || null;
      this.targetingValidTargets = result.validTargets || [];
      this.targetingPlayerId = player.id;
      this.emit('targetingStarted', result.cardId, result.targetType, result.validTargets);
      return true;
    }

    this.clearTargetingState();

    if (handCard) {
      player.moveCardToPlayedPile(handCard.id);
    }

    if (result.gameUpdates) {
      this.applyUpdates(result.gameUpdates);
    }

    const cardName = CardProcessor.get(registryCardId)?.name ?? registryCardId;
    this.emit('log', `${player.name} played ${cardName}. ${result.message}`);
    this.useAction();
    this.emit('cardPlayed', registryCardId, player);
    this.emit('stateChanged');

    return true;
  }

  // ===== ACTION HANDLERS =====

  private applyUpdates(updates: Partial<Game>): void {
    if (updates.players) {
      // Handle player updates
    }
    if (updates.board) {
      // Handle board updates
    }
  }

  // ===== HANDLE BAIT =====

  private handleBait(player: Player, params: any): boolean {
    let target = params?.target || params;
    if (!target) {
      console.log(`[Bait] Invalid params for ${player.name}`);
      return false;
    }

    const resolvedTarget = this.resolveTargetCell(target);
    if (!resolvedTarget) {
      console.log(`[Bait] Invalid target for ${player.name}`);
      return false;
    }

    if (!this.isWithinPlacementRange(player, resolvedTarget, 3)) {
      this.emit('error', 'Target must be within 3 tiles');
      return false;
    }

    const baitCost = player.getBaitCost();
    if (player.gold < baitCost) {
      this.emit('error', `Not enough gold for bait (need ${baitCost})`);
      return false;
    }

    const result = StructurePlacement.placeBaitWithEffects(this.board, player, resolvedTarget);
    if (result.success) {
      player.spendGold(baitCost);
      this.emit('log', result.message);
      return true;
    } else {
      this.emit('error', result.message);
      return false;
    }
  }

  // ===== HANDLE BARRICADE (UPDATED FOR CELL-BASED BARRICADES) =====

  private handleBarricade(player: Player, params: any): boolean {
    console.log(`[handleBarricade] Called for ${player.name} with params:`, JSON.stringify(params));
    
    // Barricade is now placed on a single cell
    let targetCell = params?.target || params?.cell || params;
    
    if (!targetCell) {
      console.log(`[handleBarricade] Invalid params for ${player.name}`);
      return false;
    }

    // If targetCell is an object with cellA/cellB (old format), extract the target
    if (targetCell.cellA && targetCell.cellB) {
      console.log(`[handleBarricade] Old wall format detected, using cellA`);
      targetCell = targetCell.cellA;
    }

    const resolvedTargetCell = this.resolveTargetCell(targetCell);
    if (!resolvedTargetCell) {
      console.log(`[handleBarricade] Invalid target for ${player.name}`);
      return false;
    }

    targetCell = resolvedTargetCell;

    console.log(`[handleBarricade] ${player.name} placing barricade on cell (${targetCell.x},${targetCell.y})`);

    if (!this.isWithinPlacementRange(player, targetCell, 3)) {
      console.log(`[handleBarricade] ${player.name} target is out of range`);
      this.emit('error', 'Target must be within 3 tiles');
      return false;
    }

    const cost = player.getBarricadeCost();
    if (player.gold < cost) {
      console.log(`[handleBarricade] ${player.name} can't afford (need ${cost}, have ${player.gold})`);
      return false;
    }

    // Check if target cell is valid
    if (targetCell.isHole) {
      console.log(`[handleBarricade] Target is a hole`);
      this.emit('error', 'Cannot place barricade on a hole');
      return false;
    }

    if (!targetCell.isEmpty || targetCell.hasStructure) {
      console.log(`[handleBarricade] Target is not empty (has ${targetCell.structureType || 'occupant'})`);
      this.emit('error', 'Cell must be empty to place barricade');
      return false;
    }

    // Check barricade limit
    const barricadeCount = this.board.getAllBarricades().filter(c => c.structureOwner === player).length;
    const limit = player.getBarricadeLimit();
    if (barricadeCount >= limit) {
      console.log(`[handleBarricade] ${player.name} barricade limit reached (${barricadeCount}/${limit})`);
      this.emit('error', `Barricade limit reached (${limit})`);
      return false;
    }

    // Place barricade on cell
    const health = 3; // Default health
    targetCell.setBarricade(player, health);
    player.spendGold(cost);

    console.log(`[handleBarricade] ✅ ${player.name} placed barricade at (${targetCell.x},${targetCell.y})!`);
    this.emit('log', `${player.name} placed a barricade at (${targetCell.x},${targetCell.y})! (cost ${cost} gold)`);
    return true;
  }

  // ===== HANDLE TRAP =====

  private handleTrap(player: Player, params: any): boolean {
    let target = params?.target || params;
    if (!target) {
      console.log(`[Trap] Invalid params for ${player.name}`);
      return false;
    }

    const resolvedTarget = this.resolveTargetCell(target);
    if (!resolvedTarget) {
      console.log(`[Trap] Invalid target for ${player.name}`);
      return false;
    }

    if (!this.isWithinPlacementRange(player, resolvedTarget, 3)) {
      this.emit('error', 'Target must be within 3 tiles');
      return false;
    }

    const trapCost = player.getTrapCost();
    if (player.gold < trapCost) {
      this.emit('error', `Not enough gold for trap (need ${trapCost})`);
      return false;
    }

    const result = StructurePlacement.placeTrapWithEffects(this.board, player, resolvedTarget);
    if (result.success) {
      player.spendGold(trapCost);
      this.emit('log', `${result.message} (cost ${trapCost} gold)`);
      return true;
    } else {
      this.emit('error', result.message);
      return false;
    }
  }

  // ===== HANDLE MOVE =====

  private handleMove(player: Player, params: any): boolean {
    let target = params?.target || params;
    if (!target) {
      console.log(`[Move] Invalid params for ${player.name}`);
      return false;
    }

    const resolvedTarget = this.resolveTargetCell(target);
    if (!resolvedTarget) {
      console.log(`[Move] Invalid target for ${player.name}`);
      return false;
    }

    const result = ActionHandlers.move(player, this.board, resolvedTarget, true);
    if (result.success) {
      this.emit('log', result.message);
    } else {
      this.emit('error', result.message);
    }
    return result.success;
  }

  // ===== HANDLE MELEE =====

  private handleMelee(player: Player, params: any): boolean {
    let target = params?.target || params;
    if (!target) {
      console.log(`[Melee] Invalid params for ${player.name}`);
      return false;
    }

    const resolvedTarget = this.resolveTargetCell(target);
    if (!resolvedTarget) {
      console.log(`[Melee] Invalid target for ${player.name}`);
      return false;
    }

    const result = ActionHandlers.melee(player, this.board, resolvedTarget);
    if (result.success) {
      this.emit('log', result.message);
    } else {
      this.emit('error', result.message);
    }
    return result.success;
  }

  // ===== HELPERS =====

  addGlobalPassive(id: string): void {
    this.globalPassives.add(id);
  }

  removeGlobalPassive(id: string): void {
    this.globalPassives.delete(id);
  }

  hasGlobalPassive(id: string): boolean {
    return this.globalPassives.has(id);
  }

  getNightSteps(): number {
    return 1 + (this._generationCount > 3 ? 1 : 0) + (this._generationCount > 6 ? 1 : 0) + (this._generationCount > 9 ? 1 : 0);
  }

  toJSON(): Record<string, any> {
    return {
      ...this,
      _escapeState: this._escapeState ? {
        ...this._escapeState,
        validTargets: this._escapeState.validTargets.map(({ x, y }) => ({ x, y })),
      } : null,
      pendingFlexPoints: Array.from(this.pendingFlexPoints.entries()),
      pendingFlexPointRequests: Array.from(this.pendingFlexPointRequests),
      lastFlexPointRequestCounts: Array.from(this.lastFlexPointRequestCounts.entries()),
    };
  }

  isGameOver(): boolean {
    return this.players.length > 0 && this.players.every(p => p.isEliminated);
  }

  getFinalScore(player: Player): number {
    return player.currSP + Math.max(player.currNP ?? 0, player.currCP ?? 0);
  }

  getFinalScores(): Array<{ playerId: string; name: string; heroId: string | null; score: number; sp: number; np: number; cp: number }> {
    return [...this.players]
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        heroId: player.heroId ?? null,
        sp: player.currSP ?? 0,
        np: player.currNP ?? 0,
        cp: player.currCP ?? 0,
        score: this.getFinalScore(player),
      }))
      .sort((a, b) => b.score - a.score || b.sp - a.sp || b.cp - b.np || a.name.localeCompare(b.name));
  }

  // ===== GETTERS =====

  get phase(): Phase { return this._phase; }
  get currentPlayerIndex(): number { return this._currentPlayerIndex; }
  get actionsRemaining(): number { return this._actionsRemaining; }
  get generationCount(): number { return this._generationCount; }
  get nightSteps(): number { return this._nightSteps; }

  // ===== EVENTS =====

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public emit(event: string, ...args: any[]): void {
    if (event === 'log' && typeof args[0] === 'string') {
      this.logHistory.push(args[0]);
      if (this.logHistory.length > 100) this.logHistory.shift();
    }

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(...args);
      }
    }
  }
}