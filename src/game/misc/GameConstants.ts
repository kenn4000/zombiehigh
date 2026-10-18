// src/game/core/GameConstants.ts

/**
 * Game balance constants for tuning
 * All values that affect game balance should be defined here
 * Changing these values will affect AI decision-making and game flow
 */
export class GameConstants {
  /**
   * Expected game length in nights
   * Used to calculate SP value (higher = longer game)
   * Default: 12
   */
  static EXPECTED_GAME_LENGTH: number = 12;

  /**
   * Value of a flex point (CP/NP)
   * Used in barricade and trap calculations
   * Default: 4
   */
  static FLEX_POINT_VALUE: number = 4;

  /**
   * Base card value multiplier
   * Used when cards don't have explicit expectedValue
   * Default: 3
   */
  static CARD_VALUE: number = 3;

  /**
   * Cost multipliers for actions
   * Used to balance action costs
   */
  static ACTION_COSTS = {
    TRAP: 12,
    BAIT: 5,
    BARRICADE: 10,
    MELEE: 8,
    MOVE: 3,
  };

  /**
   * SP gain multipliers
   */
  static SP_GAIN = {
    MELEE_KILL: 2,
    TRAP_KILL: 1,
    SURVIVAL: 1,
    ELSA_VON_TRAP_BONUS: 2,
  };

  /**
   * Health value multiplier
   * Used in threat calculations
   */
  static HEALTH_VALUE_MULTIPLIER: number = 5;

  /**
   * Base zombie speed
   * Speed increases every 3 nights
   */
  static getZombieSpeed(night: number): number {
    return Math.floor((night - 1) / 3) + 1;
  }

  /**
   * SP value based on expected game length
   * Higher value when game is longer (more nights to play)
   */
  static getSPValue(currentNight: number): number {
    // SP value decreases as the game progresses
    // At night 1: EXPECTED_GAME_LENGTH - 0 = 12
    // At night 12: EXPECTED_GAME_LENGTH - 11 = 1
    return this.FLEX_POINT_VALUE+Math.max(1, this.EXPECTED_GAME_LENGTH - currentNight + 1);
  }
 
}