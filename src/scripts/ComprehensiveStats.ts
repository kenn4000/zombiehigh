// src/scripts/ComprehensiveStats.ts

import { Player } from '../game/core/Player';
import { CardProcessor } from '../game/cards/CardProcessor';
import { LOCKER_DECK } from '../game/cards/CardIndex/LockerDeck';

// Make sure SIMULATIONS_PER_SIZE is defined or passed in
// I'll pass it as a parameter instead

export interface CardStats {
  cardId: string;
  cardName: string;
  cost: number;
  offered: number;
  purchased: number;
  played: number;
  winsWhenPurchased: number;
  winsWhenPlayed: number;
  gamesPlayed: number;
}

export interface LockerCardStats {
  cardId: string;
  cardName: string;
  gamesWithCard: number;
  winsWithCard: number;
  winRate: number;
}

export interface HeroStats {
  heroId: string;
  heroName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

export interface SpecialActionStats {
  actionId: string;
  actionName: string;
  totalUses: number;
  usesByGeneration: Map<number, number>;
  usesByWinner: number;
}

export interface GameResult {
  gameId: string;
  playerCount: number;
  winner: string;
  winnerHero: string;
  winnerLockerCard: string;
  finalSP: number;
  finalNP: number;
  finalCP: number;
  finalScore: number;
  finalNight: number;
  totalSteps: number;
  cardsPlayed: string[];
}

export class ComprehensiveStats {
  cardStats: Map<string, CardStats> = new Map();
  lockerCardStats: Map<string, LockerCardStats> = new Map();
  heroStats: Map<string, HeroStats> = new Map();
  specialActionStats: Map<string, SpecialActionStats> = new Map();
  gameResults: GameResult[] = [];
  playerCount: number;
  totalGames: number = 0;
  failedGames: number = 0;
  noWinnerGames: number = 0;
  timedOutGames: number = 0;
  simulationsPerSize: number;

  constructor(playerCount: number, simulationsPerSize: number) {
    this.playerCount = playerCount;
    this.simulationsPerSize = simulationsPerSize;
    for (const card of LOCKER_DECK) {
      this.lockerCardStats.set(card.id, {
        cardId: card.id,
        cardName: card.name,
        gamesWithCard: 0,
        winsWithCard: 0,
        winRate: 0,
      });
    }
  }

  recordCardOffer(cardId: string, cardName: string, cost: number): void {
    if (!this.cardStats.has(cardId)) {
      this.cardStats.set(cardId, {
        cardId,
        cardName,
        cost,
        offered: 0,
        purchased: 0,
        played: 0,
        winsWhenPurchased: 0,
        winsWhenPlayed: 0,
        gamesPlayed: 0,
      });
    }
    this.cardStats.get(cardId)!.offered++;
  }

  recordCardPurchase(cardId: string, cardName: string, cost: number): void {
    if (!this.cardStats.has(cardId)) {
      this.cardStats.set(cardId, {
        cardId,
        cardName,
        cost,
        offered: 0,
        purchased: 0,
        played: 0,
        winsWhenPurchased: 0,
        winsWhenPlayed: 0,
        gamesPlayed: 0,
      });
    }
    this.cardStats.get(cardId)!.purchased++;
  }

  recordCardPlayed(cardId: string, cardName: string): void {
    if (!this.cardStats.has(cardId)) {
      const cardDef = CardProcessor.get(cardId);
      this.cardStats.set(cardId, {
        cardId,
        cardName,
        cost: cardDef?.cost || 0,
        offered: 0,
        purchased: 0,
        played: 0,
        winsWhenPurchased: 0,
        winsWhenPlayed: 0,
        gamesPlayed: 0,
      });
    }
    this.cardStats.get(cardId)!.played++;
  }

recordLockerCardDealt(playerId: string, cardId: string, isWinner: boolean = false): void {
  const stats = this.lockerCardStats.get(cardId);
  if (stats) {
    if (isWinner) {
      // Winner: only increment wins
      stats.winsWithCard++;
    } else {
      // Player: only increment gamesWithCard
      stats.gamesWithCard++;
    }
  }
}

  recordHeroPlayed(heroId: string, isWinner: boolean = false): void {
  if (!this.heroStats.has(heroId)) {
    const heroName = heroId.replace('hero_', '').replace(/_/g, ' ');
    this.heroStats.set(heroId, {
      heroId,
      heroName,
      gamesPlayed: 0,
      wins: 0,
      winRate: 0,
    });
  }
  const stats = this.heroStats.get(heroId)!;
  
  if (isWinner) {
    stats.wins++; // Only increment wins
  } else {
    stats.gamesPlayed++; // Only increment gamesPlayed
  }
}

  recordSpecialActionUse(actionId: string, actionName: string, generation: number, isWinner: boolean): void {
    if (!this.specialActionStats.has(actionId)) {
      this.specialActionStats.set(actionId, {
        actionId,
        actionName,
        totalUses: 0,
        usesByGeneration: new Map(),
        usesByWinner: 0,
      });
    }
    const stats = this.specialActionStats.get(actionId)!;
    stats.totalUses++;
    stats.usesByGeneration.set(generation, (stats.usesByGeneration.get(generation) || 0) + 1);
    if (isWinner) {
      stats.usesByWinner++;
    }
  }

  recordCardPlaysForGame(
    allPlayers: Player[],
    winner: Player | null,
    playerCardsPlayed: Map<string, string[]>
  ): void {
    for (const [playerId, cardIds] of playerCardsPlayed) {
      const isWinner = winner ? playerId === winner.id : false;
      for (const cardId of cardIds) {
        const stats = this.cardStats.get(cardId);
        if (stats) {
          stats.gamesPlayed++;
          if (isWinner) {
            stats.winsWhenPlayed++;
          }
        }
      }
    }
  }

  recordGameResult(
    gameId: string,
    winner: Player,
    lockerCard: string | undefined,
    finalNight: number,
    totalSteps: number,
    cardsPlayed: string[]
  ): void {
    const finalNP = winner.currNP || 0;
    const finalCP = winner.currCP || 0;
    const finalScore = winner.currSP + Math.max(finalNP, finalCP);

    this.totalGames++;
    this.gameResults.push({
      gameId,
      playerCount: this.playerCount,
      winner: winner.name,
      winnerHero: winner.heroId || 'none',
      winnerLockerCard: lockerCard || 'none',
      finalSP: winner.currSP,
      finalNP: finalNP,
      finalCP: finalCP,
      finalScore: finalScore,
      finalNight,
      totalSteps,
      cardsPlayed,
    });
  }

  recordFailedGame(): void {
    this.failedGames++;
  }

  recordNoWinner(): void {
    this.noWinnerGames++;
  }

  recordTimedOut(): void {
    this.timedOutGames++;
  }

  finalize(): void {
    for (const [cardId, stats] of this.lockerCardStats) {
      stats.winRate = stats.gamesWithCard > 0 ? (stats.winsWithCard / stats.gamesWithCard) * 100 : 0;
    }
    for (const [heroId, stats] of this.heroStats) {
      stats.winRate = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0;
    }
  }

  exportToCSV(outputDir: string, batchId: string, fs: any, path: any): void {
    this.finalize();

    let cardCSV = 'Card ID,Card Name,Cost,Offered,Purchased,Purchase %,Played,Play %,Wins (Purchased),Win % (Purchased),Wins (Played),Win % (Played),Games Played\n';
    for (const [cardId, stats] of this.cardStats) {
      const purchaseRate = stats.offered > 0 ? (stats.purchased / stats.offered) * 100 : 0;
      const playRate = stats.purchased > 0 ? (stats.played / stats.purchased) * 100 : 0;
      const winRatePurchased = stats.purchased > 0 ? (stats.winsWhenPurchased / stats.purchased) * 100 : 0;
      const winRatePlayed = stats.gamesPlayed > 0 ? (stats.winsWhenPlayed / stats.gamesPlayed) * 100 : 0;
      cardCSV += `${stats.cardId},${stats.cardName},${stats.cost},${stats.offered},${stats.purchased},${purchaseRate.toFixed(2)},${stats.played},${playRate.toFixed(2)},${stats.winsWhenPurchased},${winRatePurchased.toFixed(2)},${stats.winsWhenPlayed},${winRatePlayed.toFixed(2)},${stats.gamesPlayed}\n`;
    }

    let lockerCSV = 'Locker Card ID,Locker Card Name,Games With Card,Wins With Card,Win %\n';
    for (const [cardId, stats] of this.lockerCardStats) {
      lockerCSV += `${stats.cardId},${stats.cardName},${stats.gamesWithCard},${stats.winsWithCard},${stats.winRate.toFixed(2)}\n`;
    }

    let heroCSV = 'Hero ID,Hero Name,Games Played,Wins,Win %\n';
    for (const [heroId, stats] of this.heroStats) {
      heroCSV += `${stats.heroId},${stats.heroName},${stats.gamesPlayed},${stats.wins},${stats.winRate.toFixed(2)}\n`;
    }

    let actionCSV = 'Action ID,Action Name,Total Uses,Uses By Winner,Win Usage %\n';
    for (const [actionId, stats] of this.specialActionStats) {
      const winUsageRate = stats.totalUses > 0 ? (stats.usesByWinner / stats.totalUses) * 100 : 0;
      actionCSV += `${stats.actionId},${stats.actionName},${stats.totalUses},${stats.usesByWinner},${winUsageRate.toFixed(2)}\n`;
    }

    let genCSV = 'Action ID,Action Name,Generation,Uses\n';
    for (const [actionId, stats] of this.specialActionStats) {
      const sortedGens = Array.from(stats.usesByGeneration.keys()).sort((a, b) => a - b);
      for (const gen of sortedGens) {
        genCSV += `${stats.actionId},${stats.actionName},${gen},${stats.usesByGeneration.get(gen)}\n`;
      }
    }

    let resultsCSV = 'Game ID,Player Count,Winner,Winner Hero,Winner Locker Card,Final SP,Final NP,Final CP,Final Score,Final Night,Total Steps,Cards Played\n';
    for (const result of this.gameResults) {
      resultsCSV += `${result.gameId},${result.playerCount},${result.winner},${result.winnerHero},${result.winnerLockerCard},${result.finalSP},${result.finalNP},${result.finalCP},${result.finalScore},${result.finalNight},${result.totalSteps},${result.cardsPlayed.length}\n`;
    }

    let summaryCSV = 'Metric,Value\n';
    summaryCSV += `Player Count,${this.playerCount}\n`;
    summaryCSV += `Total Simulations Attempted,${this.simulationsPerSize}\n`;
    summaryCSV += `Total Games Completed,${this.totalGames}\n`;
    summaryCSV += `Failed Games,${this.failedGames}\n`;
    summaryCSV += `No Winner Games,${this.noWinnerGames}\n`;
    summaryCSV += `Timed Out Games,${this.timedOutGames}\n`;
    summaryCSV += `Success Rate,${((this.totalGames / this.simulationsPerSize) * 100).toFixed(2)}%\n`;
    summaryCSV += `Total Cards Tracked,${this.cardStats.size}\n`;
    summaryCSV += `Total Heroes Tracked,${this.heroStats.size}\n`;
    summaryCSV += `Total Locker Cards Tracked,${this.lockerCardStats.size}\n`;
    summaryCSV += `Total Special Actions Tracked,${this.specialActionStats.size}\n`;

    let bestHero = { name: 'None', rate: 0 };
    let worstHero = { name: 'None', rate: 100 };
    let bestLocker = { name: 'None', rate: 0 };
    let worstLocker = { name: 'None', rate: 100 };
    let bestAction = { name: 'None', rate: 0 };
    let worstAction = { name: 'None', rate: 100 };

    for (const [heroId, stats] of this.heroStats) {
      const heroName = stats.heroName || heroId;
      if (stats.gamesPlayed > 2 && stats.winRate > bestHero.rate) {
        bestHero = { name: heroName, rate: stats.winRate };
      }
      if (stats.gamesPlayed > 2 && stats.winRate < worstHero.rate) {
        worstHero = { name: heroName, rate: stats.winRate };
      }
    }

    for (const [cardId, stats] of this.lockerCardStats) {
      const cardName = stats.cardName || cardId;
      if (stats.gamesWithCard > 2 && stats.winRate > bestLocker.rate) {
        bestLocker = { name: cardName, rate: stats.winRate };
      }
      if (stats.gamesWithCard > 2 && stats.winRate < worstLocker.rate) {
        worstLocker = { name: cardName, rate: stats.winRate };
      }
    }

    for (const [actionId, stats] of this.specialActionStats) {
      const actionName = stats.actionName || actionId;
      const usageRate = stats.totalUses > 0 ? (stats.usesByWinner / stats.totalUses) * 100 : 0;
      if (stats.totalUses > 2 && usageRate > bestAction.rate) {
        bestAction = { name: actionName, rate: usageRate };
      }
      if (stats.totalUses > 2 && usageRate < worstAction.rate) {
        worstAction = { name: actionName, rate: usageRate };
      }
    }

    summaryCSV += `Best Hero,${bestHero.name} (${bestHero.rate.toFixed(2)}%)\n`;
    summaryCSV += `Worst Hero,${worstHero.name} (${worstHero.rate.toFixed(2)}%)\n`;
    summaryCSV += `Best Locker Card,${bestLocker.name} (${bestLocker.rate.toFixed(2)}%)\n`;
    summaryCSV += `Worst Locker Card,${worstLocker.name} (${worstLocker.rate.toFixed(2)}%)\n`;
    summaryCSV += `Best Special Action,${bestAction.name} (${bestAction.rate.toFixed(2)}% win rate when used)\n`;
    summaryCSV += `Worst Special Action,${worstAction.name} (${worstAction.rate.toFixed(2)}% win rate when used)\n`;

    const playerDir = path.join(outputDir, `${this.playerCount}p`);
    if (!fs.existsSync(playerDir)) {
      fs.mkdirSync(playerDir, { recursive: true });
    }

    fs.writeFileSync(path.join(playerDir, `card-stats-${batchId}.csv`), cardCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `locker-stats-${batchId}.csv`), lockerCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `hero-stats-${batchId}.csv`), heroCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `special-action-stats-${batchId}.csv`), actionCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `special-action-by-generation-${batchId}.csv`), genCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `game-results-${batchId}.csv`), resultsCSV, 'utf8');
    fs.writeFileSync(path.join(playerDir, `summary-${batchId}.csv`), summaryCSV, 'utf8');

    console.log(`📊 ${this.playerCount}p Stats exported to ${playerDir}`);
  }
}