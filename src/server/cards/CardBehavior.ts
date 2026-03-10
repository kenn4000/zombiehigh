/**
 * Phase 5: Typed card behavior system.
 * Replaces the regex-based CardProcessor string matching with structured data.
 */

export type ResourceDelta = {
  gold?: number;
  sp?: number;
  hp?: number;
  cp?: number;
  np?: number;
  gp?: number;
};

export type CardRequirementDescriptor =
  | { stat: 'SP' | 'HP' | 'CP' | 'NiceP'; operator: '>=' | '<=' | '>' | '<' | '=='; value: number }
  | { adjacentToPlayer: true }
  | { adjacentToZombie: true }
  | { minBarricadesOnBoard: number }
  | { maxOwnTraps: number }
  | { minOwnTraps: number }
  | { minTrapsOnBoard: number }
  | { minBaitsOnBoard: number }
  | { handSize: number; operator: '<=' | '>=' | '==' }
  | { cardsPlayed: number; operator: '>=' }
  | { special: SpecialRequirement }
  | { and: CardRequirementDescriptor[] }
  | { or: CardRequirementDescriptor[] }
  /** Must be in this room (e.g. 'library', 'gymnasium'). */
  | { inRoom: string }
  /** Must NOT be in this room. */
  | { notInRoom: string }
  /** Own barricades placed on board >= n. */
  | { minOwnBarricades: number }
  /** Total traps across all players >= n. */
  | { allPlayersMinTraps: number }
  /** Total barricades across all players >= n. */
  | { allPlayersMinBarricades: number }
  /** An adjacent opponent has at least this much gold. */
  | { adjacentOpponentMinGold: number }
  /** No opponent is currently in this room. */
  | { noOpponentInRoom: string }
  /** Player has placed a trap on a tile in this room. */
  | { trapInRoom: string }
  /** Player has a barricade edge in this room. */
  | { barricadeInRoom: string }
  /** At least N zombies are in this room. */
  | { zombiesInRoom: { room: string; min: number } }
  /** At least N baits are in this room. */
  | { baitsInRoom: { room: string; min: number } }
  /** At least N barricades (any owner) are on edges of this room. */
  | { minBarricadesInRoom: { room: string; min: number } };

export type SpecialRequirement =
  | 'playerLowestSP'
  | 'atLeastOnePlayerDead'
  | 'hpExactly1'
  | 'onBarricadeEdge'
  | 'noPlayersOrZombiesWithin2'
  | 'opponentBaitExists'
  | 'opponentBarricadeExists'
  | 'cpGtHp'
  | 'hpGtCp'
  | 'npGtCp'
  | 'cpGtNp'
  | 'playerHighestSP'
  | 'zombieAdjacentToOpponent'
  | 'allPlayersInDifferentRooms'
  | 'aloneInCurrentRoom'
  | 'adjacentOpponentMinHP2'
  | 'ownActiveTrapOrBarricade'
  | 'activeBaitOnBoard'
  | 'adjacentPlayerAt1HP'
  | 'hasGP'
  | 'noOwnTrapsOrBarricades'
  | 'jumpOverTargetExists'
  | 'jumpOverAnyTargetExists'
  | 'playerInSameRoomExists';

export type Behavior = {
  /** When true, this ACTION card can be activated multiple times per night (each use spends one action). */
  repeatable?: boolean;

  /** Immediate resource gain for the card player (from the effect, not the bonus field). */
  gain?: ResourceDelta;

  /** Give these resources to all alive players. */
  allPlayersGain?: ResourceDelta;

  /** Draw N cards straight to hand. */
  drawCards?: number;

  /** Kill zombie(s) using the targeting system. */
  killZombie?: { count?: number; requireAdjacentPlayer?: boolean; requireAdjacentZombie?: boolean };

  /** Spawn N zombies on the board. */
  spawnZombies?: number;

  /** Spawn N zombies on the board — player selects placement location. */
  spawnZombiesPlayerChoice?: number;

  /** Grant N free movement steps (sets mode M). */
  moveSteps?: number;

  /** When true, barricade tolls are still charged during free move steps (e.g. Mad Dash). */
  moveStepsPayBarricades?: boolean;

  /** Place a structure for free (sets appropriate board mode). */
  placeFree?: {
    trap?: boolean;
    bait?: boolean;
    barricade?: boolean;
    /** Number of barricades to place (default 1). */
    barricadeCount?: number;
  };

  /** Destroy structures. */
  destroy?: {
    /** Player selects which barricade to destroy. */
    anyBarricade?: boolean;
    /** Player selects which trap to destroy. */
    anyTrap?: boolean;
    /** Destroy all barricades within N hexes of caster. */
    allBarricadesWithin?: number;
    /** Player removes one of their own barricades or traps. */
    ownBarricadeOrTrap?: boolean;
    /** Remove an opponent's bait. */
    opponentBait?: boolean;
    /** Destroy all barricades in the same named room as the player. */
    allBarricadesInRoom?: boolean;
  };

  /** Discard N cards, then draw M cards. */
  discardAndDraw?: { discard: number; draw: number };

  /** Draw N cards then discard N cards. (Strategic Draw: draw 3, discard 1 means draw:3 discard:1) */
  drawThenDiscard?: { draw: number; discard: number };

  /** Discard all cards in hand, draw back the same count. */
  discardAllDrawSame?: boolean;

  /** Applied once when an ACTION card is purchased from hand (e.g. Bait Launcher: +1 SP). */
  purchaseGain?: ResourceDelta;

  /** Open Locker: draw N items from the locker discard pile; player equips 1. */
  drawFromLockerDiscard?: number;

  /** Draw N cards, keep K, discard the rest. */
  drawKeep?: { draw: number; keep: number };

  /** Draw N cards to a temporary hand, then player selects K to keep; rest are discarded. */
  drawKeepFromTemp?: { draw: number; keep: number };

  /** Discard 1 card, gain specified gold. */
  discardForGold?: { gold: number };

  /** Replace an opponent's barricade with your own. */
  replaceOpponentBarricade?: boolean;

  /** Replace an opponent's bait with your own. */
  replaceOpponentBait?: boolean;

  /** Give gold to another player (simplest: give to first adjacent alive player). */
  giveGoldToPlayer?: { amount: number };

  /** Steal gold from an adjacent player. */
  stealGoldFromAdjacent?: { amount: number };

  /** Gain gold based on board adjacency. */
  conditionalGold?: {
    goldPerAdjacentZombie?: number;
    goldPerAdjacentPlayer?: number;
    /** Gold per adjacent tile occupied by any player or zombie. */
    goldPerAdjacentOccupant?: number;
  };

  /** Move N steps and optionally gain flat gold or gold per adjacent occupant. */
  moveAndGold?: {
    steps: number;
    goldFlat?: number;
    goldPerAdjacentOccupant?: number;
  };

  /** Heal another player for N HP (auto-targets nearest if needed). */
  healOtherPlayer?: number;

  /** Give HP to an adjacent player with exactly 1 HP. */
  giveHPtoAdjacent?: { hpAmount: number };

  /** If self HP == 1, steal 1 HP from an adjacent player. */
  stealHPFromAdjacent?: boolean;

  /** Jump over an adjacent player or opponent trap tile. */
  jumpOver?: boolean;

  /** Jump over any adjacent occupied tile (player, zombie, trap, bait). */
  jumpOverAny?: boolean;

  /** Teleport to any hex within radius tiles. */
  teleport?: { radius: number };

  /** Move a zombie (direction or to lowest tileID). */
  moveZombie?: { direction: 'awayFromPlayer' | 'toLowestTile'; steps?: number };

  /** Lose HP to kill all adjacent zombies. Gain SP per kill. */
  suicideBurn?: { selfHpCost: number };

  /** Remove all own barricades and traps, gain resources per item removed. */
  removeAllOwnStructures?: { gainPerItem: ResourceDelta };

  /** Move any own trap by one tile (requires target selection). */
  trapRelocation?: boolean;

  /** Swap player position with a neighboring zombie, player, bait, or barricade. */
  spatialSwap?: boolean;

  /** Pick one locker item from the locker discard pile. */
  uncoveredLocker?: boolean;

  /** Teleport to any open tile in the specified room. */
  teleportToRoom?: { room: string };

  /** Gain gold for each zombie in the player's current room. */
  gainGoldPerZombieInCurrentRoom?: { perZombie: number };

  /** Lose HP, kill all zombies in current room, gain SP per kill. */
  roomKillAllZombies?: { hpCost: number; spPerKill: number };

  /** Draw 1 card for each zombie in the current room. */
  drawPerZombieInCurrentRoom?: boolean;

  /** Draw 1 card for each trap in the current room. */
  drawPerTrapInCurrentRoom?: boolean;

  /** Draw N cards then give N cards from hand to a chosen living player. */
  drawAndGiveToPlayer?: { draw: number; give: number };

  /** Give up to N gold to the alive opponent with the lowest SP. */
  giveGoldToLowestSP?: { amount: number };

  /** Select any zombie on the board and move it one step (not just adjacent). */
  moveAnyZombieOneStep?: boolean;

  /** Move an adjacent zombie to any open tile in the specified room. */
  moveAdjacentZombieToRoom?: { room: string };

  /** Remove all own traps/barricades/bait; player chooses: all items yield NP or all yield CP. */
  removeAllOwnStructuresChoiceNPCP?: boolean;

  /** Teleport player to any tile in the same grid row or column. */
  teleportSameRowOrColumn?: boolean;

  /** Grant N free movement steps that bypass barricade costs. */
  freeMovesIgnoreBarricades?: number;

  /** Draw 2 keep 1 only if player is in the specified room; always applies immediate gain. */
  conditionalDrawKeepInRoom?: { room: string; draw: number; keep: number };

  /**
   * Passive effects: applied while the card is in activePassives.
   * These modify ongoing cost calculations and trigger on game events.
   */
  passive?: {
    /** Reduce gold cost to PURCHASE (draft) cards. Used by A+ Student. */
    cardCostReduction?: number;
    /** Reduce gold cost to PLAY cards from hand. Used by Worn Library Card. */
    cardPlayCostReduction?: number;
    baitCostReduction?: number;
    trapCostReduction?: number;
    barricadeCostReduction?: number;
    movementCostReduction?: number;
    /** Reduce gold cost when crossing any barricade. */
    barricadeCrossCostReduction?: number;
    /** Refund gold when crossing an OPPONENT's barricade. */
    barricadeCrossRefund?: number;
    /** Increase own barricade limit. */
    barricadeLimitBonus?: number;
    /** Modify own trap effectiveness (d6 threshold delta). */
    trapEffectivenessBonus?: number;
    /** Modify own barricade effectiveness. */
    barricadeEffectivenessBonus?: number;
    /** Modify opponents' barricade effectiveness (negative = weaker). */
    opponentBarricadeEffectiveness?: number;
    /** Modify ALL traps' effectiveness (negative = weaker). */
    allTrapEffectiveness?: number;
    /** Increase bait attraction radius. */
    baitRadiusBonus?: number;
    /** Triggered when this player takes damage. */
    onDamageTaken?: ResourceDelta;
    /** Triggered when this player gains VP. */
    onCPGained?: ResourceDelta;
    /** Triggered (optionally, player pays goldCost) when this player gains CP — gains ResourceDelta. */
    onCPGainedOptional?: { goldCost: number; gain: ResourceDelta };
    /** Triggered when this player gains HP. */
    onHPGained?: ResourceDelta;
    /** Triggered (optionally, player pays goldCost) when this player gains NP — gains ResourceDelta. */
    onNPGainedOptional?: { goldCost: number; gain: ResourceDelta };
    /** Triggered when this player enters escape mode. */
    onEscapeMove?: { moveSteps: number };
    /** Triggered when ANY player places a bait. */
    onBaitPlaced?: ResourceDelta;
    /** Melee attack gold cost reduction. */
    meleeCostReduction?: number;
    /** Draw N cards on successful melee kill. */
    meleeOnKillDraw?: number;
    /** Increase own melee effectiveness (d6 threshold). */
    meleeEffectivenessBonus?: number;
    /** Movement cost reduction when in the specified room. */
    movementCostInRoom?: { room: string; reduction: number };
    /** Movement cost reduction when NOT in the specified room. */
    movementCostOutsideRoom?: { room: string; reduction: number };
    /** Increase own trap placement cost (for offsetting an effectiveness bonus). */
    trapCostBonus?: number;
    /** Change own trap limit (positive = more traps, negative = fewer). */
    trapLimitBonus?: number;
    /** Increase own bait placement cost. */
    baitCostBonus?: number;
    /** Modify ALL players' barricade effectiveness (positive = stronger for everyone). */
    allBarricadeEffectiveness?: number;
    /** Modify ALL players' melee effectiveness (positive = easier for everyone). */
    allMeleeEffectiveness?: number;
    /** Gain this much gold whenever ANY zombie is killed (any cause). */
    onAnyZombieKilledGold?: number;
    /** Gain this much gold whenever ANY player takes damage. */
    onAnyDamageTakenGold?: number;
    /** Draw N cards when this player's own barricade is destroyed. */
    onOwnBarricadeDestroyedDraw?: number;
  };
};
