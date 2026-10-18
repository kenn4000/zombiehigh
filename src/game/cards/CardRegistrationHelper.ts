// src/game/cards/CardRegistrationHelper.ts

import { Player } from '../core/Player';
import { Board } from '../board/Board';
import { BoardCell } from '../board/BoardCell';
import { GameConstants } from '../misc/GameConstants';

export class CardHelper {
  /**
   * Get SP value for current night
   */
  static getSP(player: Player, onNight: number): number {
    return GameConstants.getSPValue(onNight);
  }

  /**
   * Get CP value
   */
  static getCP(player: Player): number {
    return player.currCP || 0;
  }

  /**
   * Get NP value
   */
  static getNP(player: Player): number {
    return player.currNP || 0;
  }

  /**
   * Get health value
   */
  static getHealth(player: Player): number {
    return player.currHealth || 0;
  }

  /**
   * Get health value (player's health value from GameConstants)
   */
  static getHealthValue(player: Player, onNight: number): number {
    return player.getHealthValue(onNight);
  }

  /**
   * Calculate card draw value based on player state and current night
   * Drawing cards is more valuable earlier in the game and when the player has fewer cards
   */
  static getCardDrawValue(
    player: Player, 
    onNight: number, 
    cardsDrawn: number,
    drawnCardCosts: number[] = []
  ): number {
    const r = this.getNightsRemaining(onNight);
    const currentGold = player.gold;
    const g0 = player.currSP + player.currGP; // gold income per round
    const m = 2; // Income growth rate per round (expected 2 SP gain per round)
    
    // 1. Calculate remaining card budget with linear income growth
    const futureIncome = (r * g0) + (m * (r * (r + 1)) / 2);
    const cardBudget = (currentGold + futureIncome) / 3;
    
    // 2. Get raw value of the drawn cards
    let totalRawValue = 0;
    const costs: number[] = [];
    
    for (let i = 0; i < cardsDrawn; i++) { 
      let rawValue = GameConstants.CARD_VALUE; // Base value per card
      
      // Add value based on player's current needs
      if (player.hand.cards.length <= 3) {
        rawValue += 1; // Need cards
      }
      if (player.currHealth == 1) {
        rawValue += 2; // Need cards
      }
      
      const cardCost = drawnCardCosts[i] || (2 + Math.random() * 4);
      costs.push(cardCost);
      totalRawValue += rawValue;
    }
    
    // 3. Calculate cumulative cost
    const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 3;
    const cumulativeCost = avgCost * cardsDrawn;
    
    // 4. Parabolic dropoff based on position relative to budget
    if (cardBudget <= 0) return 0;
    
    const saturationRatio = cumulativeCost / cardBudget;
    const playProbability = Math.max(0, 1 - Math.pow(saturationRatio, 2));
    
    return totalRawValue * playProbability;
  }

  /**
   * Calculate nights remaining
   */
  static getNightsRemaining(onNight: number): number {
    return Math.max(0, GameConstants.EXPECTED_GAME_LENGTH - onNight);
  }

  /**
   * Calculate the value of a passive ability
   */
  static getPassiveValue(valuePerNight: number, onNight: number): number {
    return valuePerNight * this.getNightsRemaining(onNight);
  }

  /**
   * Calculate the total value of traps on zombie paths
   * Each unique trap on a zombie path has value = spValue * (effectiveness/8)
   */
  static getTrapHitValue(
    player: Player,
    board: Board,
    allPlayers: Player[],
    onNight: number
  ): number {
    const spValue = this.getSP(player, onNight);
    const uniqueTrapsOnPaths = new Set<string>();
    const zombieCells = board.getAllCells().filter(c => c.hasZombie);
    
    for (const zombie of zombieCells) {
      let closestPlayer: Player | null = null;
      let minDist = Infinity;
      
      for (const p of allPlayers) {
        if (p.isEliminated) continue;
        const pPos = board.getPlayerPosition(p);
        if (!pPos) continue;
        const dist = Math.abs(zombie.x - pPos.x) + Math.abs(zombie.y - pPos.y);
        if (dist < minDist) {
          minDist = dist;
          closestPlayer = p;
        }
      }
      
      if (!closestPlayer) continue;
      const closestPos = board.getPlayerPosition(closestPlayer);
      if (!closestPos) continue;
      
      const path = board.findShortestPathZombie(zombie.x, zombie.y, closestPos.x, closestPos.y);
      if (!path) continue;
      
      for (const cell of path) {
        if (cell.hasTrap) {
          const key = `${cell.x},${cell.y}`;
          uniqueTrapsOnPaths.add(key);
          break;
        }
      }
    }
    
    return uniqueTrapsOnPaths.size * (spValue / 8);
  }

  /**
   * Calculate the value of removing a bait
   * Value = health saved if a zombie was targeting you + flex point if bait is in range
   */
  static getBaitRemovalValue(
  player: Player,
  board: Board,
  allPlayers: Player[],
  target: BoardCell,
  onNight: number
): number {
  const healthValue = player.getHealthValue(onNight);
  let flexPointsDenied = 0;
  let healthLost = 0;
  const zombieCells = board.getAllCells().filter(c => c.hasZombie);
  const nightSteps = 1 + (onNight > 3 ? 1 : 0) + (onNight > 6 ? 1 : 0) + (onNight > 9 ? 1 : 0);
  const pos = board.getPlayerPosition(player);
  if (!pos) return 0;
  const baitRadius = player.getBaitRadius ? player.getBaitRadius() : 3;
  
  for (const zombie of zombieCells) {
    const distToBait = Math.abs(zombie.x - target.x) + Math.abs(zombie.y - target.y);
    const canReachBait = distToBait <= nightSteps;
    
    // Check if zombie would reach the player
    const distToPlayer = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
    const wouldReachPlayer = distToPlayer <= nightSteps;
    
    // Deny flex point that would have been gained
    if (canReachBait && distToBait <= baitRadius) {
      flexPointsDenied++;
    }
    
    // Deny health that would have been saved
    if (wouldReachPlayer && canReachBait && distToBait <= baitRadius) {
      healthLost++;
    }
  }
  
  // Total value = (flexPointsDenied * FLEX_POINT_VALUE) + (healthLost * healthValue)
  const totalValue = (flexPointsDenied * GameConstants.FLEX_POINT_VALUE) + (healthLost * healthValue);
  
  return totalValue;
}
  static getTrapEffectivenessReductionValue(
  player: Player,
  board: Board,
  allPlayers: Player[],
  onNight: number,
  reductionAmount: number = 1
): number {
  const spValue = this.getSP(player, onNight);
  const remainingNights = this.getNightsRemaining(onNight);
  
  // Estimate how many traps each player will place per night
  // Based on their trap effectiveness and current structures
  let totalNetLoss = 0;
  
  for (const p of allPlayers) {
    if (p.isEliminated) continue;
    
    // Get player's trap and barricade effectiveness
    const trapEff = p.getTrapEffectiveness ? p.getTrapEffectiveness() : 3;
    const barEff = p.getBarricadeEffectiveness ? p.getBarricadeEffectiveness() : 3;
    
    // Calculate their preference for traps vs barricades
    const trapPreference = (trapEff * trapEff) / (trapEff * trapEff + barEff * barEff);
    const barPreference = (barEff * barEff) / (trapEff * trapEff + barEff * barEff);
    
    // Estimate structures placed per night (1-2 based on effectiveness)
    const avgStructuresPerNight = 0.8 + (trapEff / 12) + (barEff / 12);
    
    // Expected traps they would place per night
    const trapsPerNight = avgStructuresPerNight * trapPreference;
    
    // Total traps they would place over remaining nights
    const totalTraps = trapsPerNight * remainingNights;
    
    // For each trap, reducing effectiveness by 1 reduces its kill chance
    // Each trap has value = spValue * (effectiveness/8)
    // Reducing effectiveness by 1 reduces value by spValue/8
    const lossPerTrap = spValue / 8;
    
    // Total loss for this player
    const playerLoss = totalTraps * lossPerTrap * reductionAmount;
    
    // If this is the player themselves, add to total (it's bad)
    // If it's an opponent, subtract from total (it's good for us)
    if (p.id === player.id) {
      totalNetLoss += playerLoss; // Negative for us
    } else {
      totalNetLoss -= playerLoss; // Positive for us (opponents get weaker)
    }
  }
  
  // Also consider existing traps on the board
  const existingTraps = board.getAllTraps();
  for (const cell of existingTraps) {
    const owner = cell.structureOwner;
    if (!owner || owner.isEliminated) continue;
    
    // Each existing trap loses spValue/8 value per point of effectiveness lost
    const existingLoss = spValue / 8 * reductionAmount;
    
    if (owner.id === player.id) {
      totalNetLoss += existingLoss; // Negative for us
    } else {
      totalNetLoss -= existingLoss; // Positive for us
    }
  }
  
  return totalNetLoss;
}
}