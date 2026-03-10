import { HexCoordinate } from '../common/HexCoordinate';
import { Board } from './Board';
import { Player } from './Player';
import { Barricade } from './Barricade';
import { Trap } from './Trap';
import { HeroId } from '../common/HeroId';

/**
 * GameActions: handles all player board actions.
 * Mirrors GameActions.java with string-based passive effects replaced by
 * a typed cost-lookup from the Game (injected as callbacks for now).
 */
export class GameActions {
  constructor(
    private readonly board: Board,
    private readonly log: (msg: string) => void,
    private readonly isPlayerAt: (h: HexCoordinate) => boolean,
    private readonly isZombieAt: (h: HexCoordinate) => boolean,
    private readonly getAdjustedMovementCost: (p: Player) => number,
    private readonly getAdjustedBaitCost: (p: Player) => number,
    private readonly getAdjustedTrapCost: (p: Player) => number,
    private readonly getAdjustedBarricadeCost: (p: Player) => number,
    private readonly reclassifyCards: () => void,
  ) { }

  handleMove(p: Player, target: HexCoordinate): boolean {
    if (!target || !this.board.isWithinBounds(target)) return false;

    // Wall-aware adjacency: target must be a reachable neighbor (no hard wall between them)
    const validNeighbors = this.board.getNeighbors(p.position);
    if (
      !validNeighbors.some(n => n.equals(target)) ||
      this.isPlayerAt(target) ||
      this.isZombieAt(target) ||
      this.board.hasTrap(target) ||
      this.board.hasBait(target)
    ) return false;

    const baseMoveCost = this.getAdjustedMovementCost(p);
    const barricade = this.board.getBarricade(p.position, target);
    // Only charge a toll for someone else's barricade; own barricades are free to cross
    const hasOpponentBarricade = barricade !== undefined && barricade.ownerId !== p.id;
    const tollCost = hasOpponentBarricade ? this._getBarricadeCrossCost(p) : 0;
    const requiredGold = baseMoveCost + tollCost;

    if (p.gold < requiredGold) {
      this.log(`Need ${requiredGold} Gold to move${hasOpponentBarricade ? ` (includes ${tollCost} gold barricade toll)` : ''}!`);
      return false;
    }

    p.spendGold(baseMoveCost);

    if (hasOpponentBarricade && barricade) {
      p.spendGold(tollCost);
      // Barricade owner receives 1 gold
      this._giveGoldToOwner(barricade.ownerId, 1);
      this.log(`${p.name} paid ${tollCost} gold toll to cross a barricade (${this._getPlayerName(barricade.ownerId)} received 1).`);

      // Apply refund passives (e.g. Barricade Runner)
      const refund = this._getBarricadeCrossRefund(p);
      if (refund > 0) {
        p.addGold(refund);
        this.log(`${p.name} recovered ${refund} gold (barricade crossing refund).`);
      }
    }

    p.position = target;
    this.reclassifyCards();
    return true;
  }

  handleTrap(p: Player, target: HexCoordinate): boolean {
    const trapCost = this.getAdjustedTrapCost(p);
    if (p.gold < trapCost) {
      this.log(`Not enough Gold! Need ${trapCost}.`);
      return false;
    }

    const currentTraps = [...this.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
    if (currentTraps >= this._getAdjustedTrapLimit(p)) {
      this.log('Trap limit reached!');
      return false;
    }

    if (
      p.position.distanceTo(target) <= 2 &&
      !this.isPlayerAt(target) &&
      !this.isZombieAt(target) &&
      !this.board.hasTrap(target) &&
      !this.board.hasBait(target)
    ) {
      p.spendGold(trapCost);
      // Cheerleader (Von Trap) earns SP from trap kills, not trap placement
      if (p.selectedHero?.id !== HeroId.VON_TRAP) p.addSurvivalPoints(1);
      this.board.placeTrap(target, new Trap(p.id));
      this.reclassifyCards();
      return true;
    }
    return false;
  }

  handleFreeBait(p: Player, target: HexCoordinate): boolean {
    if (
      !this.isPlayerAt(target) &&
      !this.isZombieAt(target) &&
      !this.board.hasBait(target) &&
      !this.board.hasTrap(target)
    ) {
      this.board.placeBait(target, p.id);
      this._onBaitPlaced(p);
      this.reclassifyCards();
      return true;
    }
    this.log('Invalid bait placement. Choose an empty hex.');
    return false;
  }

  handleBait(p: Player, target: HexCoordinate): boolean {
    const baitCost = this.getAdjustedBaitCost(p);
    if (p.gold < baitCost) {
      this.log(`Not enough Gold! Need ${baitCost}.`);
      return false;
    }

    if (
      p.position.distanceTo(target) <= 3 &&
      !this.isPlayerAt(target) &&
      !this.isZombieAt(target) &&
      !this.board.hasBait(target) &&
      !this.board.hasTrap(target)
    ) {
      p.spendGold(baitCost);
      this.board.placeBait(target, p.id);
      this._onBaitPlaced(p);
      this.reclassifyCards();
      return true;
    }
    return false;
  }

  handleBarricade(p: Player, start: HexCoordinate, end: HexCoordinate): boolean {
    const barricadeCost = this.getAdjustedBarricadeCost(p);
    if (p.gold < barricadeCost) {
      this.log('Not enough Gold!');
      return false;
    }

    // Wall-aware edge check: end must be a wall-less neighbor of start
    const validNeighbors = this.board.getNeighbors(start);
    if (p.position.distanceTo(start) <= 2 && validNeighbors.some(n => n.equals(end))) {
      if (this.board.hasBarricade(start, end)) {
        this.log('A barricade already exists on that edge.');
        return false;
      }
      const ownBarricades = [...this.board.getBarricades().values()].filter(b => b.ownerId === p.id).length;
      if (ownBarricades >= this._getAdjustedBarricadeLimit(p)) {
        this.log('Barricade limit reached!');
        return false;
      }
      p.spendGold(barricadeCost);
      this.board.placeBarricade(start, end, new Barricade(p.id));
      p.addSurvivalPoints(1);
      this.reclassifyCards();
      return true;
    }
    return false;
  }

  handleEscape(p: Player, target: HexCoordinate): boolean {
    const neighbors = this.board.getNeighbors(p.position);
    const canEscape = neighbors.some(n =>
      !this.isPlayerAt(n) && !this.isZombieAt(n) && !this.board.hasTrap(n),
    );

    if (!canEscape) {
      this.log(`${p.name} is cornered and eliminated!`);
      p.takeDamage(999);
      return true;
    }

    // Target is pre-validated by validEscapeHexes (supports multi-step Emergency Retreat)
    if (
      target &&
      !this.isPlayerAt(target) &&
      !this.isZombieAt(target) &&
      !this.board.hasTrap(target)
    ) {
      p.position = target;
      this.reclassifyCards();
      return true;
    }

    this.log('Select a valid empty tile to escape!');
    return false;
  }

  /** Place a barricade for free — no gold cost, no adjacency to player required. Used by starting actions. */
  handleFreeBarricade(p: Player, start: HexCoordinate, end: HexCoordinate): boolean {
    if (!this.board.isWithinBounds(start) || !this.board.isWithinBounds(end)) return false;
    // Wall-aware: cannot place a barricade across a hard wall
    const validNeighbors = this.board.getNeighbors(start);
    if (!validNeighbors.some(n => n.equals(end))) {
      this.log('Those two tiles are not adjacent (or a hard wall exists between them).');
      return false;
    }
    if (this.board.hasBarricade(start, end)) {
      this.log('A barricade already exists on that edge.');
      return false;
    }
    this.board.placeBarricade(start, end, new Barricade(p.id));
    this.reclassifyCards();
    return true;
  }

  // Injected by Game to allow barricade crossing gold transfer
  private _giveGoldToOwner: (ownerId: string, amount: number) => void = () => { };
  private _getPlayerName: (id: string) => string = () => 'Player';
  private _getBarricadeCrossCost: (p: Player) => number = () => 2;
  private _getBarricadeCrossRefund: (p: Player) => number = () => 0;
  private _getAdjustedBarricadeLimit: (p: Player) => number = () => 3;
  private _getAdjustedTrapLimit: (p: Player) => number = () => 2;
  private _onBaitPlaced: (p: Player) => void = () => { };

  setGoldTransferCallback(fn: (ownerId: string, amount: number) => void): void {
    this._giveGoldToOwner = fn;
  }

  setBarricadeCrossCostCallback(fn: (p: Player) => number): void {
    this._getBarricadeCrossCost = fn;
  }

  setBarricadeCrossRefundCallback(fn: (p: Player) => number): void {
    this._getBarricadeCrossRefund = fn;
  }

  setBarricadeLimitCallback(fn: (p: Player) => number): void {
    this._getAdjustedBarricadeLimit = fn;
  }

  setTrapLimitCallback(fn: (p: Player) => number): void {
    this._getAdjustedTrapLimit = fn;
  }

  setBaitPlacedCallback(fn: (p: Player) => void): void {
    this._onBaitPlaced = fn;
  }

  setPlayerNameCallback(fn: (id: string) => string): void {
    this._getPlayerName = fn;
  }
}
