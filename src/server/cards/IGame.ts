import { HexCoordinate } from '../../common/HexCoordinate';
import { Player } from '../Player';
import { Board } from '../Board';

/**
 * Minimal game interface exposed to card behavior executors.
 * Avoids cards holding a reference to the full Game class.
 */
export interface IGame {
  readonly board: Board;
  readonly players: readonly Player[];

  isZombieAt(h: HexCoordinate): boolean;
  isPlayerAt(h: HexCoordinate): boolean;
  log(msg: string): void;

  /** Draw N cards from the deck into the player's hand. */
  drawCards(player: Player, count: number): void;

  /** Draw N cards from the deck into the player's temporary hand; player must then keep K of them. */
  startDrawKeepFromTemp(player: Player, draw: number, keep: number): void;

  /** Spawn N zombies on the board at lowest available tileIDs. */
  spawnZombies(count: number): void;

  /**
   * Begin zombie-targeting mode: stores pending state, waiting for
   * the player to click a hex containing a zombie.
   */
  startZombieTargeting(playerId: string, cardName: string, requireAdjacentPlayer?: boolean, requireAdjacentZombie?: boolean): void;

  /**
   * Begin a pending interaction that requires the player to click a
   * highlighted hex to resolve (destroy barricade, destroy trap, move
   * zombie away, trap relocation, spatial swap, etc.).
   *
   * Supported types:
   *   'destroy_any_barricade' | 'destroy_any_trap' | 'destroy_own_structure'
   *   'replace_opponent_barricade' | 'move_zombie_away'
   *   'trap_relocate_step1' | 'spatial_swap'
   *   'heal_player:N'                       – player selects target to heal N HP
   *   'teleport_to_room:ROOM'               – player moves to open tile in ROOM
   *   'give_cards_to_player:N'              – player selects N cards to give
   *   'move_any_zombie_one_step'            – player selects a zombie to move
   *   'move_adjacent_zombie_to_room:ROOM'   – move adjacent zombie to ROOM
   *   'remove_all_structures_choice_npcp'   – player chooses NP or CP per structure
   *   'terror_sprint'                       – player selects tile in same row/col
   *   'free_moves_ignore_barricades:N'      – player takes N steps ignoring barricades
   */

  startPendingInteraction(type: string, playerId: string, cardName: string): void;

  /**
   * Auto-grant the player a locker item from the pool (for UNCOVERED_LOCKER card).
   * Picks a random available locker item and applies hero/locker effects.
   */
  selectLockerFromPool(playerId: string): void;

  /**
   * Open Locker: shuffle the locker discard pile, draw N items, player picks 1 to equip.
   */
  selectLockerFromDiscard(playerId: string, draw: number): void;

  /** Sell a card from hand for 1 gold; costs 1 action. */
  sellCard(playerId: string, cardName: string): void;

  /** Set the current board interaction mode ('M', 'T', 'B', 'W', ''). */
  setMode(mode: string): void;

  /** Initiate a Blind Jump: player must land directly behind an adjacent player (ignores barricades). */
  startJumpOver(player: Player): void;

  /** Gym Class Hero: jump over any adjacent occupied tile (player, zombie, trap, bait). */
  startJumpOverAny(player: Player): void;

  /** Set free-bait flag and switch to bait placement mode (next bait placed is free). */
  startFreeBait(): void;

  /** Set free-trap flag and switch to trap placement mode (trap placed anywhere for free). */
  startFreeTrap(): void;

  /**
   * Remove all own structures (traps, barricades, baits), then present a NP vs CP choice
   * awarding `count` of the chosen type. Used by Identity Crisis.
   */
  startChoiceNPCP(player: Player, count: number, sourceCardName: string): void;

  /** Set free-barricade count and switch to wall placement mode (next N barricades placed are free). */
  startFreeBarricade(count?: number): void;

  /**
   * Queue a pending discard: the player must choose `discard` cards from their hand,
   * then receive `draw` new cards.
   */
  startPendingDiscard(player: Player, discard: number, draw: number, goldReward?: number): void;

  /**
   * Grant player N free movement steps: they may move N adjacent tiles without
   * spending gold. Each click in move mode consumes one free step.
   */
  startFreeMoves(player: Player, steps: number, payBarricades?: boolean): void;

  /**
   * Defer a per-adjacent-occupant gold reward to after free movement completes.
   * Used by cards that move then reward gold based on final position (e.g. Crowded Halls).
   */
  setPendingPostMoveAdjacencyGold(player: Player, goldPerOccupant: number): void;

  /** Fire the 'CP gained' passive hook for a player (e.g. Leather Jacket). */
  fireOnCPGained(player: Player): void;

  /** Fire the 'NP gained' passive hook for a player (e.g. Roller Backpack). */
  fireOnNPGained(player: Player): void;
}
