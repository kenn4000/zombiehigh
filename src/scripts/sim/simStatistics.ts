// src/scripts/sim/simStatistics.ts

import * as fs from 'fs';
import * as path from 'path';
import { Player } from '../../game/core/Player';
import { CardProcessor } from '../../game/cards/CardProcessor';

// ============================================================
// INTERFACES
// ============================================================

export interface CardStatistics {
  cardId: string;
  cardName: string;
  cost: number;
  
  // Draft metrics
  draftCount: number;
  draftPurchaseCount: number;
  draftPurchasePercentage: number;
  
  // Play metrics
  playCount: number;
  playPercentage: number;
  
  // Win metrics (when purchased)
  winCount: number;
  winRate: number;
  totalGames: number;
  
  // Win metrics (when played)
  winsWhenPlayed: number;
  winRateWhenPlayed: number;
  
  // Impact metrics
  totalSPGained: number;
  totalGoldGained: number;
  totalCPGained: number;
  totalNPGained: number;
  avgSPGained: number;
  avgGoldGained: number;
  avgCPGained: number;
  avgNPGained: number;
  
  // Performance by player count
  performanceByPlayerCount: {
    2: { games: number; wins: number; winRate: number; played: number; purchaseRate: number; };
    3: { games: number; wins: number; winRate: number; played: number; purchaseRate: number; };
    4: { games: number; wins: number; winRate: number; played: number; purchaseRate: number; };
    5: { games: number; wins: number; winRate: number; played: number; purchaseRate: number; };
  };
  
  // Comparison metrics
  winRateDelta: number;
  pickPriority: number;
  valueEfficiency: number;
}

export interface HeroStatistics {
  heroId: string;
  heroName: string;
  winCount: number;
  playCount: number;
  winRate: number;
  performanceByPlayerCount: {
    2: { games: number; wins: number; winRate: number; };
    3: { games: number; wins: number; winRate: number; };
    4: { games: number; wins: number; winRate: number; };
    5: { games: number; wins: number; winRate: number; };
  };
}

export interface PlayerStats {
  sp: number;
  cp: number;
  np: number;
  gold: number;
  health: number;
  isEliminated: boolean;
  heroId: string;
}

export interface GameResult {
  gameId: string;
  playerCount: number;
  winner: string;
  winnerId: string;
  winnerHero: string;
  winningScore: number;
  winnerSP: number;
  winnerCP: number;
  winnerNP: number;
  totalSteps: number;
  finalNight: number;
  cardsPlayed: string[];
  cardsPurchased: string[];
  playerStats: Map<string, PlayerStats>;
  allSPs: number[];
  allCPs: number[];
  allNPs: number[];
}

export interface SimulationStatistics {
  playerCount: number;
  totalSimulations: number;
  cardStats: Map<string, CardStatistics>;
  heroStats: Map<string, HeroStatistics>;
  gameResults: GameResult[];
}

export interface PerformanceReport {
  averageWinRate: number;
  totalSimulations: number;
  overperformers: CardStatistics[];
  underperformers: CardStatistics[];
  bestValueCards: CardStatistics[];
  worstValueCards: CardStatistics[];
  mostPlayedCards: CardStatistics[];
  leastPlayedCards: CardStatistics[];
  cardRankings: CardStatistics[];
  heroRankings: HeroStatistics[];
  summary: {
    totalCardsTracked: number;
    totalHeroesTracked: number;
    avgPurchaseRate: number;
    avgPlayRate: number;
    bestHero: string;
    worstHero: string;
    bestCard: string;
    worstCard: string;
  };
}

// ============================================================
// STATISTICS COLLECTOR
// ============================================================

export class StatisticsCollector {
  private stats: SimulationStatistics = {
    playerCount: 0,
    totalSimulations: 0,
    cardStats: new Map(),
    heroStats: new Map(),
    gameResults: [],
  };
  
  // Card tracking
  private cardOfferedCount: Map<string, number> = new Map();
  private cardPurchasedCount: Map<string, number> = new Map();
  private cardPlayedCount: Map<string, number> = new Map();
  private cardWinCount: Map<string, number> = new Map();
  private cardWinWhenPlayedCount: Map<string, number> = new Map();
  
  // Card impact tracking
  private cardSPGained: Map<string, number[]> = new Map();
  private cardGoldGained: Map<string, number[]> = new Map();
  private cardCPGained: Map<string, number[]> = new Map();
  private cardNPGained: Map<string, number[]> = new Map();
  
  // Card performance by player count
  private cardPerformanceByPC: Map<string, Map<number, { games: number; wins: number; played: number; purchased: number; }>> = new Map();
  
  // Hero tracking
  private heroWinCount: Map<string, number> = new Map();
  private heroPlayCount: Map<string, number> = new Map();
  private heroPerformanceByPC: Map<string, Map<number, { games: number; wins: number; }>> = new Map();
  
  // Game tracking
  private gameWinners: Map<string, string> = new Map(); // gameId -> winnerId
  private gamePlayerCounts: Map<string, number> = new Map(); // gameId -> playerCount
  
  constructor(playerCount: number) {
    this.stats.playerCount = playerCount;
  }
  
  // ============================================================
  // RECORD METHODS
  // ============================================================

  recordDraftOffer(cardId: string, cardName: string, cost: number): void {
    const key = cardId;
    if (!this.cardOfferedCount.has(key)) {
      this.cardOfferedCount.set(key, 0);
      this.cardPurchasedCount.set(key, 0);
      this.cardPlayedCount.set(key, 0);
      this.cardWinCount.set(key, 0);
      this.cardWinWhenPlayedCount.set(key, 0);
      this.cardSPGained.set(key, []);
      this.cardGoldGained.set(key, []);
      this.cardCPGained.set(key, []);
      this.cardNPGained.set(key, []);
      this.cardPerformanceByPC.set(key, new Map());
    }
    this.cardOfferedCount.set(key, (this.cardOfferedCount.get(key) || 0) + 1);
  }
  
  recordDraftPurchase(cardId: string, cardName: string, cost: number, playerCount: number): void {
    const key = cardId;
    this.cardPurchasedCount.set(key, (this.cardPurchasedCount.get(key) || 0) + 1);
    
    // Track by player count
    if (!this.cardPerformanceByPC.has(key)) {
      this.cardPerformanceByPC.set(key, new Map());
    }
    const pcMap = this.cardPerformanceByPC.get(key)!;
    if (!pcMap.has(playerCount)) {
      pcMap.set(playerCount, { games: 0, wins: 0, played: 0, purchased: 0 });
    }
    const stats = pcMap.get(playerCount)!;
    stats.purchased++;
  }
  
  recordCardPlayed(
    cardId: string, 
    cardName: string, 
    player: Player, 
    gameId: string,
    spGained: number = 0,
    goldGained: number = 0,
    cpGained: number = 0,
    npGained: number = 0
  ): void {
    const key = cardId;
    this.cardPlayedCount.set(key, (this.cardPlayedCount.get(key) || 0) + 1);
    
    // Track impact
    if (!this.cardSPGained.has(key)) this.cardSPGained.set(key, []);
    if (!this.cardGoldGained.has(key)) this.cardGoldGained.set(key, []);
    if (!this.cardCPGained.has(key)) this.cardCPGained.set(key, []);
    if (!this.cardNPGained.has(key)) this.cardNPGained.set(key, []);
    
    this.cardSPGained.get(key)!.push(spGained);
    this.cardGoldGained.get(key)!.push(goldGained);
    this.cardCPGained.get(key)!.push(cpGained);
    this.cardNPGained.get(key)!.push(npGained);
    
    // Track played by player count
    const playerCount = this.gamePlayerCounts.get(gameId) || this.stats.playerCount;
    if (this.cardPerformanceByPC.has(key)) {
      const pcMap = this.cardPerformanceByPC.get(key)!;
      if (!pcMap.has(playerCount)) {
        pcMap.set(playerCount, { games: 0, wins: 0, played: 0, purchased: 0 });
      }
      const stats = pcMap.get(playerCount)!;
      stats.played++;
    }
  }
  
  recordGameResult(
    winner: Player,
    allPlayers: Player[],
    gameId: string,
    steps: number,
    finalNight: number,
    cardsPlayed: string[],
    cardsPurchased: string[] = []
  ): void {
    const heroId = winner.heroId || 'none';
    const playerCount = allPlayers.filter(p => !p.isEliminated).length;
    
    // Track game metadata
    this.gameWinners.set(gameId, winner.id);
    this.gamePlayerCounts.set(gameId, playerCount);
    
    // Record winner's hero
    this.heroWinCount.set(heroId, (this.heroWinCount.get(heroId) || 0) + 1);
    this.heroPlayCount.set(heroId, (this.heroPlayCount.get(heroId) || 0) + 1);
    
    // Track hero performance by player count
    if (!this.heroPerformanceByPC.has(heroId)) {
      this.heroPerformanceByPC.set(heroId, new Map());
    }
    const heroPcMap = this.heroPerformanceByPC.get(heroId)!;
    if (!heroPcMap.has(playerCount)) {
      heroPcMap.set(playerCount, { games: 0, wins: 0 });
    }
    const heroStats = heroPcMap.get(playerCount)!;
    heroStats.games++;
    heroStats.wins++;
    
    // Track hero plays for all players
    for (const p of allPlayers) {
      if (!p.isEliminated && p.heroId) {
        const hId = p.heroId;
        if (!this.heroPlayCount.has(hId)) {
          this.heroPlayCount.set(hId, 0);
        }
        this.heroPlayCount.set(hId, (this.heroPlayCount.get(hId) || 0) + 1);
      }
    }
    
    // Collect player stats
    const playerStats = new Map<string, PlayerStats>();
    const allSPs: number[] = [];
    const allCPs: number[] = [];
    const allNPs: number[] = [];
    
    for (const p of allPlayers) {
      const stats: PlayerStats = {
        sp: p.currSP,
        cp: p.currCP,
        np: p.currNP,
        gold: p.gold,
        health: p.currHealth,
        isEliminated: p.isEliminated,
        heroId: p.heroId || 'none',
      };
      playerStats.set(p.id, stats);
      allSPs.push(p.currSP);
      allCPs.push(p.currCP);
      allNPs.push(p.currNP);
    }
    
    // Record game result
    this.stats.gameResults.push({
      gameId,
      playerCount: playerCount,
      winner: winner.name,
      winnerId: winner.id,
      winnerHero: heroId,
      winningScore: winner.currSP,
      winnerSP: winner.currSP,
      winnerCP: winner.currCP,
      winnerNP: winner.currNP,
      totalSteps: steps,
      finalNight,
      cardsPlayed,
      cardsPurchased,
      playerStats,
      allSPs,
      allCPs,
      allNPs,
    });
    
    // Record card wins (when purchased)
    for (const cardId of cardsPurchased) {
      const key = cardId;
      this.cardWinCount.set(key, (this.cardWinCount.get(key) || 0) + 1);
      
      // Track wins by player count
      if (this.cardPerformanceByPC.has(key)) {
        const pcMap = this.cardPerformanceByPC.get(key)!;
        if (!pcMap.has(playerCount)) {
          pcMap.set(playerCount, { games: 0, wins: 0, played: 0, purchased: 0 });
        }
        const stats = pcMap.get(playerCount)!;
        stats.games++;
        stats.wins++;
      }
    }
    
    // Record card wins (when played)
    for (const cardId of cardsPlayed) {
      const key = cardId;
      this.cardWinWhenPlayedCount.set(key, (this.cardWinWhenPlayedCount.get(key) || 0) + 1);
    }
  }
  
  recordHeroPlayed(heroId: string): void {
    if (!this.heroPlayCount.has(heroId)) {
      this.heroPlayCount.set(heroId, 0);
    }
    this.heroPlayCount.set(heroId, (this.heroPlayCount.get(heroId) || 0) + 1);
  }
  
  // ============================================================
  // FINALIZE & REPORT
  // ============================================================

  finalize(): SimulationStatistics {
    const allCardIds = new Set([
      ...this.cardOfferedCount.keys(),
      ...this.cardPurchasedCount.keys(),
      ...this.cardPlayedCount.keys(),
      ...this.cardWinCount.keys(),
      ...this.cardWinWhenPlayedCount.keys(),
    ]);
    
    const totalGames = this.stats.gameResults.length;
    
    // Calculate expected win rate for this player count
    // In a game with N players, expected win rate is 1/N * 100
    const expectedWinRate = this.stats.playerCount > 0 ? (1 / this.stats.playerCount) * 100 : 25;
    
    for (const cardId of allCardIds) {
      const offered = this.cardOfferedCount.get(cardId) || 0;
      const purchased = this.cardPurchasedCount.get(cardId) || 0;
      const played = this.cardPlayedCount.get(cardId) || 0;
      const wins = this.cardWinCount.get(cardId) || 0;
      const winsWhenPlayed = this.cardWinWhenPlayedCount.get(cardId) || 0;
      
      const spGains = this.cardSPGained.get(cardId) || [];
      const goldGains = this.cardGoldGained.get(cardId) || [];
      const cpGains = this.cardCPGained.get(cardId) || [];
      const npGains = this.cardNPGained.get(cardId) || [];
      
      const cardDef = CardProcessor.get(cardId);
      const cardName = cardDef ? cardDef.name : cardId;
      const cost = cardDef ? cardDef.cost : 0;
      
      // Build performance by player count
      const pcMap = this.cardPerformanceByPC.get(cardId) || new Map();
      const perfByPC: any = {
        2: { games: 0, wins: 0, winRate: 0, played: 0, purchaseRate: 0 },
        3: { games: 0, wins: 0, winRate: 0, played: 0, purchaseRate: 0 },
        4: { games: 0, wins: 0, winRate: 0, played: 0, purchaseRate: 0 },
        5: { games: 0, wins: 0, winRate: 0, played: 0, purchaseRate: 0 },
      };
      
      for (const [pc, stats] of pcMap) {
        if (pc >= 2 && pc <= 5) {
          const winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0;
          const purchaseRate = stats.purchased > 0 ? (stats.purchased / (stats.games || 1)) * 100 : 0;
          perfByPC[pc] = {
            games: stats.games,
            wins: stats.wins,
            winRate: winRate,
            played: stats.played,
            purchaseRate: purchaseRate,
          };
        }
      }
      
      // Calculate win rate delta against expected win rate for this player count
      const cardWinRate = purchased > 0 ? (wins / purchased) * 100 : 0;
      const winRateDelta = cardWinRate - expectedWinRate;
      
      const cardStats: CardStatistics = {
        cardId,
        cardName,
        cost,
        draftCount: offered,
        draftPurchaseCount: purchased,
        draftPurchasePercentage: offered > 0 ? (purchased / offered) * 100 : 0,
        playCount: played,
        playPercentage: purchased > 0 ? (played / purchased) * 100 : 0,
        winCount: wins,
        winRate: cardWinRate,
        totalGames,
        winsWhenPlayed,
        winRateWhenPlayed: played > 0 ? (winsWhenPlayed / played) * 100 : 0,
        totalSPGained: spGains.reduce((a, b) => a + b, 0),
        totalGoldGained: goldGains.reduce((a, b) => a + b, 0),
        totalCPGained: cpGains.reduce((a, b) => a + b, 0),
        totalNPGained: npGains.reduce((a, b) => a + b, 0),
        avgSPGained: spGains.length > 0 ? spGains.reduce((a, b) => a + b, 0) / spGains.length : 0,
        avgGoldGained: goldGains.length > 0 ? goldGains.reduce((a, b) => a + b, 0) / goldGains.length : 0,
        avgCPGained: cpGains.length > 0 ? cpGains.reduce((a, b) => a + b, 0) / cpGains.length : 0,
        avgNPGained: npGains.length > 0 ? npGains.reduce((a, b) => a + b, 0) / npGains.length : 0,
        performanceByPlayerCount: perfByPC,
        winRateDelta: winRateDelta,
        pickPriority: cost > 0 ? (cardWinRate / (cost + 1)) : 0,
        valueEfficiency: cost > 0 ? (cardWinRate / (cost + 0.5)) : 0,
      };
      
      this.stats.cardStats.set(cardId, cardStats);
    }
    
    // Build hero statistics
    for (const [heroId, wins] of this.heroWinCount) {
      const plays = this.heroPlayCount.get(heroId) || 0;
      
      // Build hero performance by player count
      const heroPcMap = this.heroPerformanceByPC.get(heroId) || new Map();
      const heroPerfByPC: any = {
        2: { games: 0, wins: 0, winRate: 0 },
        3: { games: 0, wins: 0, winRate: 0 },
        4: { games: 0, wins: 0, winRate: 0 },
        5: { games: 0, wins: 0, winRate: 0 },
      };
      
      for (const [pc, stats] of heroPcMap) {
        if (pc >= 2 && pc <= 5) {
          const winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0;
          heroPerfByPC[pc] = {
            games: stats.games,
            wins: stats.wins,
            winRate: winRate,
          };
        }
      }
      
      this.stats.heroStats.set(heroId, {
        heroId,
        heroName: heroId.replace('hero_', '').replace(/_/g, ' '),
        winCount: wins,
        playCount: plays,
        winRate: plays > 0 ? (wins / plays) * 100 : 0,
        performanceByPlayerCount: heroPerfByPC,
      });
    }
    
    this.stats.totalSimulations = this.stats.gameResults.length;
    return this.stats;
  }
  
  calculateExpectedWinRate(): number {
    return this.stats.playerCount > 0 ? (1 / this.stats.playerCount) * 100 : 25;
  }
  
  getDetailedSummary(): any {
    const finalized = this.finalize();
    const results = finalized.gameResults;
    const totalSims = results.length;
    
    if (totalSims === 0) {
      return {
        totalSimulations: 0,
        playerCount: this.stats.playerCount,
        averageSteps: 0,
        averageNight: 0,
        averageSP: 0,
        averageCP: 0,
        averageNP: 0,
        averageWinnerSP: 0,
        averageWinnerMaxCPNP: 0,
      };
    }
    
    let totalSteps = 0;
    let totalNights = 0;
    let totalSP = 0;
    let totalCP = 0;
    let totalNP = 0;
    let totalWinnerSP = 0;
    let totalWinnerMaxCPNP = 0;
    let playerCounts = 0;
    
    for (const result of results) {
      totalSteps += result.totalSteps;
      totalNights += result.finalNight;
      totalWinnerSP += result.winnerSP;
      totalWinnerMaxCPNP += Math.max(result.winnerCP, result.winnerNP);
      
      for (const [playerId, stats] of result.playerStats) {
        totalSP += stats.sp;
        totalCP += stats.cp;
        totalNP += stats.np;
        playerCounts++;
      }
    }
    
    const totalPlayers = playerCounts || 1;
    
    return {
      totalSimulations: totalSims,
      playerCount: this.stats.playerCount,
      averageSteps: totalSteps / totalSims,
      averageNight: totalNights / totalSims,
      averageSP: totalSP / totalPlayers,
      averageCP: totalCP / totalPlayers,
      averageNP: totalNP / totalPlayers,
      averageWinnerSP: totalWinnerSP / totalSims,
      averageWinnerMaxCPNP: totalWinnerMaxCPNP / totalSims,
    };
  }
  
  generatePerformanceReport(): PerformanceReport {
    const finalized = this.finalize();
    const expectedWinRate = this.calculateExpectedWinRate();
    const cardStats = Array.from(finalized.cardStats.values());
    const heroStats = Array.from(finalized.heroStats.values());
    
    // Overperformers: win rate > expected + 10%
    const overperformers = cardStats
      .filter(c => c.winRate > expectedWinRate + 10 && c.draftPurchaseCount > 5)
      .sort((a, b) => b.winRateDelta - a.winRateDelta);
    
    // Underperformers: win rate < expected - 10%
    const underperformers = cardStats
      .filter(c => c.winRate < expectedWinRate - 10 && c.draftPurchaseCount > 5)
      .sort((a, b) => a.winRateDelta - b.winRateDelta);
    
    // Best value cards (win rate / cost)
    const bestValue = [...cardStats]
      .filter(c => c.draftPurchaseCount > 5 && c.cost > 0)
      .sort((a, b) => b.pickPriority - a.pickPriority)
      .slice(0, 10);
    
    // Worst value cards
    const worstValue = [...cardStats]
      .filter(c => c.draftPurchaseCount > 5 && c.cost > 0)
      .sort((a, b) => a.pickPriority - b.pickPriority)
      .slice(0, 10);
    
    // Most played cards
    const mostPlayed = [...cardStats]
      .filter(c => c.draftPurchaseCount > 5)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10);
    
    // Least played cards
    const leastPlayed = [...cardStats]
      .filter(c => c.draftPurchaseCount > 5)
      .sort((a, b) => a.playCount - b.playCount)
      .slice(0, 10);
    
    // Hero rankings
    const heroRankings = [...heroStats]
      .sort((a, b) => b.winRate - a.winRate);
    
    // Find best and worst
    const bestHero = heroRankings.length > 0 ? heroRankings[0] : null;
    const worstHero = heroRankings.length > 0 ? heroRankings[heroRankings.length - 1] : null;
    const bestCard = cardStats.length > 0 ? cardStats.reduce((a, b) => a.winRate > b.winRate ? a : b) : null;
    const worstCard = cardStats.length > 0 ? cardStats.reduce((a, b) => a.winRate < b.winRate ? a : b) : null;
    
    // Calculate averages
    const avgPurchaseRate = cardStats.reduce((sum, c) => sum + c.draftPurchasePercentage, 0) / (cardStats.length || 1);
    const avgPlayRate = cardStats.reduce((sum, c) => sum + c.playPercentage, 0) / (cardStats.length || 1);
    
    return {
      averageWinRate: expectedWinRate,
      totalSimulations: finalized.totalSimulations,
      overperformers,
      underperformers,
      bestValueCards: bestValue,
      worstValueCards: worstValue,
      mostPlayedCards: mostPlayed,
      leastPlayedCards: leastPlayed,
      cardRankings: cardStats.sort((a, b) => b.winRate - a.winRate),
      heroRankings,
      summary: {
        totalCardsTracked: cardStats.length,
        totalHeroesTracked: heroStats.length,
        avgPurchaseRate,
        avgPlayRate,
        bestHero: bestHero ? `${bestHero.heroName} (${bestHero.winRate.toFixed(2)}%)` : 'None',
        worstHero: worstHero ? `${worstHero.heroName} (${worstHero.winRate.toFixed(2)}%)` : 'None',
        bestCard: bestCard ? `${bestCard.cardName} (${bestCard.winRate.toFixed(2)}%)` : 'None',
        worstCard: worstCard ? `${worstCard.cardName} (${worstCard.winRate.toFixed(2)}%)` : 'None',
      },
    };
  }
  
  // ============================================================
  // EXPORT METHODS
  // ============================================================

  exportToExcel(outputDir: string, simId: string): void {
    const stats = this.finalize();
    const report = this.generatePerformanceReport();
    const expectedWinRate = this.calculateExpectedWinRate();
    
    // ===== CARD STATS (Detailed) =====
    let cardCSV = 'Card ID,Card Name,Cost,Offered,Purchased,Purchase %,Played,Play %,Wins (Purchased),Win % (Purchased),Wins (Played),Win % (Played),Win % Delta (vs Expected),Avg SP Gain,Avg Gold Gain,Avg CP Gain,Avg NP Gain,2p Win %,2p Played,3p Win %,3p Played,4p Win %,4p Played,5p Win %,5p Played\n';
    for (const [cardId, cardStat] of stats.cardStats) {
      const pc = cardStat.performanceByPlayerCount;
      cardCSV += `${cardStat.cardId},${cardStat.cardName},${cardStat.cost},${cardStat.draftCount},${cardStat.draftPurchaseCount},${cardStat.draftPurchasePercentage.toFixed(2)},${cardStat.playCount},${cardStat.playPercentage.toFixed(2)},${cardStat.winCount},${cardStat.winRate.toFixed(2)},${cardStat.winsWhenPlayed},${cardStat.winRateWhenPlayed.toFixed(2)},${cardStat.winRateDelta.toFixed(2)},${cardStat.avgSPGained.toFixed(2)},${cardStat.avgGoldGained.toFixed(2)},${cardStat.avgCPGained.toFixed(2)},${cardStat.avgNPGained.toFixed(2)},${pc[2]?.winRate.toFixed(2) || 0},${pc[2]?.played || 0},${pc[3]?.winRate.toFixed(2) || 0},${pc[3]?.played || 0},${pc[4]?.winRate.toFixed(2) || 0},${pc[4]?.played || 0},${pc[5]?.winRate.toFixed(2) || 0},${pc[5]?.played || 0}\n`;
    }
    
    // ===== HERO STATS =====
    let heroCSV = 'Hero ID,Hero Name,Wins,Played,Win %,2p Win %,2p Wins/Games,3p Win %,3p Wins/Games,4p Win %,4p Wins/Games,5p Win %,5p Wins/Games\n';
    for (const [heroId, heroStat] of stats.heroStats) {
      const pc = heroStat.performanceByPlayerCount;
      heroCSV += `${heroStat.heroId},${heroStat.heroName},${heroStat.winCount},${heroStat.playCount},${heroStat.winRate.toFixed(2)},${pc[2]?.winRate.toFixed(2) || 0},${pc[2]?.wins || 0}/${pc[2]?.games || 0},${pc[3]?.winRate.toFixed(2) || 0},${pc[3]?.wins || 0}/${pc[3]?.games || 0},${pc[4]?.winRate.toFixed(2) || 0},${pc[4]?.wins || 0}/${pc[4]?.games || 0},${pc[5]?.winRate.toFixed(2) || 0},${pc[5]?.wins || 0}/${pc[5]?.games || 0}\n`;
    }
    
    // ===== PERFORMANCE REPORT =====
    let reportCSV = `Expected Win Rate: ${expectedWinRate.toFixed(2)}%\n`;
    reportCSV += 'Category,Rank,Card Name,Card ID,Win %,Win % Delta,Play %,Pick Priority\n';
    
    reportCSV += '\n=== OVERPERFORMERS ===\n';
    report.overperformers.forEach((c, i) => {
      reportCSV += `Overperformer,${i+1},${c.cardName},${c.cardId},${c.winRate.toFixed(2)},${c.winRateDelta.toFixed(2)},${c.playPercentage.toFixed(2)},${c.pickPriority.toFixed(2)}\n`;
    });
    
    reportCSV += '\n=== UNDERPERFORMERS ===\n';
    report.underperformers.forEach((c, i) => {
      reportCSV += `Underperformer,${i+1},${c.cardName},${c.cardId},${c.winRate.toFixed(2)},${c.winRateDelta.toFixed(2)},${c.playPercentage.toFixed(2)},${c.pickPriority.toFixed(2)}\n`;
    });
    
    reportCSV += '\n=== BEST VALUE CARDS ===\n';
    report.bestValueCards.forEach((c, i) => {
      reportCSV += `Best Value,${i+1},${c.cardName},${c.cardId},${c.winRate.toFixed(2)},${c.winRateDelta.toFixed(2)},${c.playPercentage.toFixed(2)},${c.pickPriority.toFixed(2)}\n`;
    });
    
    // ===== SUMMARY REPORT =====
    let summaryCSV = 'Metric,Value\n';
    summaryCSV += `Total Simulations,${report.totalSimulations}\n`;
    summaryCSV += `Expected Win Rate (${this.stats.playerCount}p),${expectedWinRate.toFixed(2)}%\n`;
    summaryCSV += `Total Cards Tracked,${report.summary.totalCardsTracked}\n`;
    summaryCSV += `Total Heroes Tracked,${report.summary.totalHeroesTracked}\n`;
    summaryCSV += `Average Purchase Rate,${report.summary.avgPurchaseRate.toFixed(2)}%\n`;
    summaryCSV += `Average Play Rate,${report.summary.avgPlayRate.toFixed(2)}%\n`;
    summaryCSV += `Best Hero,${report.summary.bestHero}\n`;
    summaryCSV += `Worst Hero,${report.summary.worstHero}\n`;
    summaryCSV += `Best Card,${report.summary.bestCard}\n`;
    summaryCSV += `Worst Card,${report.summary.worstCard}\n`;
    
    // ===== HERO RANKINGS =====
    let heroRankCSV = 'Rank,Hero Name,Win %,Wins,Played\n';
    report.heroRankings.forEach((h, i) => {
      heroRankCSV += `${i+1},${h.heroName},${h.winRate.toFixed(2)},${h.winCount},${h.playCount}\n`;
    });
    
    // Save all files
    const cardFile = path.join(outputDir, `card-stats-${simId}.csv`);
    const heroFile = path.join(outputDir, `hero-stats-${simId}.csv`);
    const reportFile = path.join(outputDir, `performance-report-${simId}.csv`);
    const summaryFile = path.join(outputDir, `summary-${simId}.csv`);
    const heroRankFile = path.join(outputDir, `hero-rankings-${simId}.csv`);
    
    fs.writeFileSync(cardFile, cardCSV, 'utf8');
    fs.writeFileSync(heroFile, heroCSV, 'utf8');
    fs.writeFileSync(reportFile, reportCSV, 'utf8');
    fs.writeFileSync(summaryFile, summaryCSV, 'utf8');
    fs.writeFileSync(heroRankFile, heroRankCSV, 'utf8');
    
    console.log(`📊 Exported statistics to ${outputDir}`);
    console.log(`  - Card stats: ${cardFile}`);
    console.log(`  - Hero stats: ${heroFile}`);
    console.log(`  - Performance report: ${reportFile}`);
    console.log(`  - Summary: ${summaryFile}`);
    console.log(`  - Hero rankings: ${heroRankFile}`);
  }
}