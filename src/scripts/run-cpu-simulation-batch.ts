// src/scripts/run-cpu-simulation-batch.ts

import * as fs from 'fs';
import * as path from 'path';
import { Game } from '../game/core/Game';
import { Player } from '../game/core/Player';
import { GameManager } from '../game/core/GameManager';
import { ZombieSimManager } from '../game/misc/ZombieSimManager';
import { AIController } from '../game/core/AIController';
import { CardDrawer } from '../game/cards/CardDrawer';
import { CardProcessor } from '../game/cards/CardProcessor';
import { registerAllCards } from './sim/simDeck';
import { assignSimHeroes } from './sim/simHeroes';
import { ZombieSpawner } from '../game/misc/ZombieSpawner';
import { registerAllActions } from './sim/simActions';
import { draftCards } from './sim/simCardDraft';
import { EventManager, CardPlayedEvent } from '../game/misc/EventManager';
import { StatisticsCollector } from './sim/simStatistics';
import {
  getPlayerCountFromArgs,
  getMaxStepsFromArgs,
  getOutputDirFromArgs,
  getRandomStartPositions,
  createSimBoard,
} from './sim';

// ===== CONFIGURATION =====
const SIMULATIONS_PER_SIZE = 4000;
const CARD_OFFER_COUNT = 4;
const STARTING_CARD_COUNT = 8;

// ===== GLOBAL ERROR HANDLERS =====
process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error(error.stack || error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error(reason);
  process.exit(1);
});

// ===== SILENCE CONSOLE LOGS =====
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
  const msg = args.join(' ');
  if (msg.includes('simulating game') || 
      msg.includes('=== BATCH SIMULATION ===') ||
      msg.includes('All simulations complete') ||
      msg.includes('✅ Completed') ||
      msg.includes('📊') ||
      msg.includes('🎉')) {
    originalConsoleLog(msg);
  }
};

function runSimulation(playerCount: number, simId: string): StatisticsCollector {
  const stats = new StatisticsCollector(playerCount);
  
  for (let simNum = 0; simNum < SIMULATIONS_PER_SIZE; simNum++) {
    if (simNum % 100 === 0) {
      console.log(`simulating game [${simNum + 1}/${SIMULATIONS_PER_SIZE}] for ${playerCount} players...`);
    }
    
    try {
      // Create board
      const board = createSimBoard();
      
      // Create players
      const players: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
        const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
        (player as any).isBot = true;
        players.push(player);
      }
      
      // Create game
      const game = new Game();
      game.board = board;
      game.players = players;
      (game as any)._simLogs = [];
      
      // Register cards and actions
      registerAllCards();
      registerAllActions();
      CardProcessor.setGame(game);
      
      // ===== HERO ASSIGNMENT =====
      assignSimHeroes(players, game);
      
      // Record hero plays for statistics
      for (const player of players) {
        stats.recordHeroPlayed(player.heroId || 'none');
      }
      
      // ===== INITIALIZE CARD DECK =====
      const allCardDefs = CardProcessor.getAll();
      const deckCards: any[] = [];
      
      for (const cardDef of allCardDefs) {
        let copies = 3;
        if (cardDef.cost <= 1) copies = 4;
        else if (cardDef.cost <= 2) copies = 3;
        else if (cardDef.cost <= 3) copies = 2;
        else copies = 1;
        
        for (let i = 0; i < copies; i++) {
          deckCards.push({
            id: `${cardDef.id}-${i}`,
            cardId: cardDef.id,
            name: cardDef.name,
            cost: cardDef.cost,
            image: cardDef.image || 'default.png',
            targetType: cardDef.targetType,
          });
        }
      }
      
      const cardDrawer = new CardDrawer();
      (game as any).cardManager = cardDrawer;
      cardDrawer.initializeGameDeck(deckCards);
      
      // ===== TRACK CARDS PER PLAYER =====
      const playerCardsPurchased: Map<string, string[]> = new Map();
      for (const player of players) {
        playerCardsPurchased.set(player.id, []);
      }
      
      // ===== CARD DRAFT PHASE =====
      const cardsPlayedTracker: string[] = [];
      const gameId = `sim-${simId}-${simNum}`;
      
      // ===== REGISTER CARD PLAYED EVENT =====
      const cardPlayedHandler = (data: CardPlayedEvent) => {
        cardsPlayedTracker.push(data.cardId);
        stats.recordCardPlayed(
          data.cardId,
          data.cardName,
          data.player,
          gameId,
          data.spGained || 0,
          data.goldGained || 0,
          data.cpGained || 0,
          data.npGained || 0
        );
      };
      
      EventManager.getInstance().on('cardPlayed', cardPlayedHandler);
      
      for (const player of players) {
        // Deal starting cards
        const startingCards = CardDrawer.drawCards(player, STARTING_CARD_COUNT);
        
        // Track starting cards as offered and purchased (free)
        for (const card of startingCards) {
          stats.recordDraftOffer(card.cardId, card.name, card.cost || 0);
          stats.recordDraftPurchase(card.cardId, card.name, card.cost || 0, playerCount);
          // Track as purchased by this player
          playerCardsPurchased.get(player.id)!.push(card.cardId);
        }
        
        // Offer draft cards
        const draftResult = draftCards(player, board, game, CARD_OFFER_COUNT);
        
        // Record draft offers and purchases
        for (const card of draftResult.cardsOffered) {
          stats.recordDraftOffer(card.cardId, card.cardName, card.cost);
          if (card.purchased) {
            stats.recordDraftPurchase(card.cardId, card.cardName, card.cost, playerCount);
            // Track as purchased by this player
            playerCardsPurchased.get(player.id)!.push(card.cardId);
          }
        }
      }
      
      // Place players on board
      const startPositions = getRandomStartPositions(board, players.length);
      for (let i = 0; i < players.length && i < startPositions.length; i++) {
        const [x, y] = startPositions[i];
        game.board.placePlayer(players[i], x, y);
      }
      
      // ===== ZOMBIE MANAGER =====
      const zombieManager = new ZombieSimManager(board, players, {
        onTrapKill: (ownerId, x, y) => {},
        onTrapFailed: () => {},
        onBaitConsumed: (ownerId, x, y) => {},
        onPlayerAttacked: (playerId, x, y, fromCell) => {
          const player = game.getPlayerById(playerId);
          if (player) {
            EventManager.getInstance().emit('playerDamaged', {
              player: player,
              roomId: fromCell?.roomId || 'unknown',
              x: x,
              y: y,
            });
            (game as any).handlePlayerAttacked(playerId, x, y, fromCell);
          }
        },
        getTrapSuccessRate: (p) => p.getTrapEffectiveness() / 6,
        getBarricadeSuccessRate: (p) => p.getBarricadeEffectiveness() / 6,
        log: (msg: string) => {},
      });
      
      // ===== AI CONTROLLERS =====
      const gameManager = new GameManager(game);
      const aiControllers = new Map();
      for (const player of players) {
        const ai = new AIController(gameManager, board, players, 1, game);
        aiControllers.set(player.id, ai);
      }
      
      // ===== INITIAL ZOMBIE SPAWN =====
      game._generationCount = 1;
      const initialZombieCount = Math.floor(players.filter(p => !p.isEliminated).length * 1.5);
      for (let i = 0; i < initialZombieCount; i++) {
        ZombieSpawner.spawnRandom(board);
      }
      
      // Set ActionManager night
      for (const player of players) {
        if (player.actionManager) {
          player.actionManager.setCurrentNight(1);
        }
      }
      
      // ===== GAME LOOP =====
      let step = 0;
      let playerIndex = 0;
      const passedPlayers = new Set<string>();
      const maxSteps = 300;
      
      while (step < maxSteps) {
        if (game.isGameOver()) break;
        
        const alivePlayers = game.players.filter(p => !p.isEliminated);
        if (passedPlayers.size >= alivePlayers.length) {
          // Zombie phase
          zombieManager.zombiePhase(game.generationCount);
          
          // Survival rewards
          for (const p of game.players) {
            if (!p.isEliminated) {
              p.addSPs(1);
              const goldEarned = p.currSP + p.currGP;
              p.addGold(goldEarned);
            }
          }
          
          game._generationCount++;
          const newNight = game.generationCount;
          for (const p of game.players) {
            if (p.actionManager && !p.isEliminated) {
              p.actionManager.advanceNight(newNight);
            }
          }
          
          passedPlayers.clear();
          playerIndex = 0;
          step++;
          continue;
        }
        
        // Get current player
        let currentPlayer = null;
        let attempts = 0;
        while (attempts < game.players.length) {
          const candidate = game.players[playerIndex % game.players.length];
          if (!candidate.isEliminated && !passedPlayers.has(candidate.id)) {
            currentPlayer = candidate;
            break;
          }
          playerIndex++;
          attempts++;
        }
        
        if (!currentPlayer) {
          passedPlayers.clear();
          playerIndex = 0;
          step++;
          continue;
        }
        
        const ai = aiControllers.get(currentPlayer.id);
        if (!ai) {
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
          step++;
          continue;
        }
        
        try {
          const success = ai.takeAction(currentPlayer);
          if (success) {
            playerIndex++;
          } else {
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          }
        } catch (error) {
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }
        
        step++;
      }
      
      // ===== REMOVE EVENT LISTENER =====
      EventManager.getInstance().off('cardPlayed', cardPlayedHandler);
      
      // ===== RECORD RESULTS =====
      const winner = game.players
        .filter(p => !p.isEliminated)
        .sort((a, b) => b.currSP - a.currSP)[0];
      
      if (winner) {
        // Get cards purchased by winner
        const winnerCardsPurchased = playerCardsPurchased.get(winner.id) || [];
        
        stats.recordGameResult(
          winner,
          game.players,
          gameId,
          step,
          game.generationCount,
          cardsPlayedTracker,
          winnerCardsPurchased  // Now we pass the actual cards purchased by the winner!
        );
      }
      
    } catch (error) {
      // Silent error handling - just skip this simulation
      continue;
    }
  }
  
  return stats;
}

function runBatch(): void {
  console.log('\n=== BATCH SIMULATION ===');
  console.log(`Running ${SIMULATIONS_PER_SIZE} simulations per player count\n`);
  
  const outputDir = getOutputDirFromArgs();
  const simId = `batch-${Date.now()}`;
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Store all stats for combined output
  const allStats: { playerCount: number; stats: StatisticsCollector }[] = [];
  
  // Run for each player count (2-5)
  for (let playerCount = 2; playerCount <= 5; playerCount++) {
    console.log(`\n📊 Running simulations for ${playerCount} players...`);
    const stats = runSimulation(playerCount, simId);
    allStats.push({ playerCount, stats });
    console.log(`✅ Completed ${playerCount} player simulations`);
  }
  
  // ===== COMBINED OUTPUT =====
  console.log('\n📊 Generating combined CSV...');
  
  // Get all card IDs from all stats
  const allCardIds = new Set<string>();
  const cardNames = new Map<string, string>();
  const cardCosts = new Map<string, number>();
  
  for (const { playerCount, stats } of allStats) {
    const finalized = stats.finalize();
    for (const [cardId, cardStat] of finalized.cardStats) {
      allCardIds.add(cardId);
      if (!cardNames.has(cardId)) {
        cardNames.set(cardId, cardStat.cardName);
        cardCosts.set(cardId, cardStat.cost);
      }
    }
  }
  
  // Build combined CSV with enhanced metrics
  let csv = 'Card ID,Card Name,Cost';
  
  const playerCounts = [2, 3, 4, 5];
  const metrics = [
    'Offered', 'Purchased', 'Purchase %', 
    'Played', 'Play %', 
    'Wins (Purchased)', 'Win % (Purchased)',
    'Wins (Played)', 'Win % (Played)',
    'Win % Delta', 'Pick Priority',
    'Avg SP Gain', 'Avg Gold Gain', 'Avg CP Gain', 'Avg NP Gain'
  ];
  
  for (const pc of playerCounts) {
    for (const metric of metrics) {
      csv += `,${pc}p ${metric}`;
    }
  }
  csv += '\n';
  
  // Data rows
  for (const cardId of allCardIds) {
    const cardName = cardNames.get(cardId) || cardId;
    const cost = cardCosts.get(cardId) || 0;
    csv += `${cardId},${cardName},${cost}`;
    
    for (const pc of playerCounts) {
      const statEntry = allStats.find(s => s.playerCount === pc);
      if (statEntry) {
        const finalized = statEntry.stats.finalize();
        const cardStat = finalized.cardStats.get(cardId);
        if (cardStat) {
          const pcPerf = cardStat.performanceByPlayerCount[pc as keyof typeof cardStat.performanceByPlayerCount];
          csv += `,${cardStat.draftCount}`;
          csv += `,${cardStat.draftPurchaseCount}`;
          csv += `,${cardStat.draftPurchasePercentage.toFixed(2)}`;
          csv += `,${cardStat.playCount}`;
          csv += `,${cardStat.playPercentage.toFixed(2)}`;
          csv += `,${cardStat.winCount}`;
          csv += `,${cardStat.winRate.toFixed(2)}`;
          csv += `,${cardStat.winsWhenPlayed}`;
          csv += `,${cardStat.winRateWhenPlayed.toFixed(2)}`;
          csv += `,${cardStat.winRateDelta.toFixed(2)}`;
          csv += `,${cardStat.pickPriority.toFixed(2)}`;
          csv += `,${cardStat.avgSPGained.toFixed(2)}`;
          csv += `,${cardStat.avgGoldGained.toFixed(2)}`;
          csv += `,${cardStat.avgCPGained.toFixed(2)}`;
          csv += `,${cardStat.avgNPGained.toFixed(2)}`;
        } else {
          // Card wasn't offered in this player count
          for (let i = 0; i < metrics.length; i++) {
            csv += `,0`;
          }
        }
      }
    }
    csv += '\n';
  }
  
  // Save combined CSV
  const combinedFile = path.join(outputDir, `combined-card-stats-${simId}.csv`);
  fs.writeFileSync(combinedFile, csv, 'utf8');
  console.log(`✅ Combined CSV saved to: ${combinedFile}`);
  
  // Also save hero stats combined with player count breakdown
  let heroCsv = 'Hero ID,Hero Name';
  for (const pc of playerCounts) {
    heroCsv += `,${pc}p Wins,${pc}p Played,${pc}p Win %`;
  }
  heroCsv += ',Overall Wins,Overall Played,Overall Win %\n';
  
  const allHeroIds = new Set<string>();
  const heroNames = new Map<string, string>();
  
  for (const { playerCount, stats } of allStats) {
    const finalized = stats.finalize();
    for (const [heroId, heroStat] of finalized.heroStats) {
      allHeroIds.add(heroId);
      if (!heroNames.has(heroId)) {
        heroNames.set(heroId, heroStat.heroName);
      }
    }
  }
  
  for (const heroId of allHeroIds) {
    const heroName = heroNames.get(heroId) || heroId;
    heroCsv += `${heroId},${heroName}`;
    
    // Overall stats
    let overallWins = 0;
    let overallPlayed = 0;
    
    for (const pc of playerCounts) {
      const statEntry = allStats.find(s => s.playerCount === pc);
      if (statEntry) {
        const finalized = statEntry.stats.finalize();
        const heroStat = finalized.heroStats.get(heroId);
        if (heroStat) {
          const pcPerf = heroStat.performanceByPlayerCount[pc as keyof typeof heroStat.performanceByPlayerCount];
          heroCsv += `,${pcPerf?.wins || 0},${pcPerf?.games || 0},${(pcPerf?.winRate || 0).toFixed(2)}`;
          overallWins += pcPerf?.wins || 0;
          overallPlayed += pcPerf?.games || 0;
        } else {
          heroCsv += `,0,0,0.00`;
        }
      }
    }
    
    const overallWinRate = overallPlayed > 0 ? (overallWins / overallPlayed) * 100 : 0;
    heroCsv += `,${overallWins},${overallPlayed},${overallWinRate.toFixed(2)}\n`;
  }
  
  const heroFile = path.join(outputDir, `combined-hero-stats-${simId}.csv`);
  fs.writeFileSync(heroFile, heroCsv, 'utf8');
  console.log(`✅ Combined hero stats saved to: ${heroFile}`);
  
  // ===== GENERATE PERFORMANCE REPORT =====
  console.log('\n📊 Generating performance report...');
  
  // Generate report from first stats (all player counts combined)
  const reportStats = allStats[0]?.stats;
  if (reportStats) {
    const report = reportStats.generatePerformanceReport();
    
    // Save performance report as CSV
    let reportCSV = 'Category,Rank,Card Name,Card ID,Win %,Win % Delta,Play %,Pick Priority\n';
    
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
    
    reportCSV += '\n=== WORST VALUE CARDS ===\n';
    report.worstValueCards.forEach((c, i) => {
      reportCSV += `Worst Value,${i+1},${c.cardName},${c.cardId},${c.winRate.toFixed(2)},${c.winRateDelta.toFixed(2)},${c.playPercentage.toFixed(2)},${c.pickPriority.toFixed(2)}\n`;
    });
    
    // Hero rankings
    reportCSV += '\n=== HERO RANKINGS ===\n';
    reportCSV += 'Rank,Hero Name,Win %,Wins,Played\n';
    report.heroRankings.forEach((h, i) => {
      reportCSV += `${i+1},${h.heroName},${h.winRate.toFixed(2)},${h.winCount},${h.playCount}\n`;
    });
    
    const reportFile = path.join(outputDir, `performance-report-${simId}.csv`);
    fs.writeFileSync(reportFile, reportCSV, 'utf8');
    console.log(`✅ Performance report saved to: ${reportFile}`);
    
    // Log summary
    console.log('\n📊 PERFORMANCE SUMMARY:');
    console.log(`  Average Win Rate: ${report.averageWinRate.toFixed(2)}%`);
    console.log(`  Overperformers: ${report.overperformers.length} cards`);
    console.log(`  Underperformers: ${report.underperformers.length} cards`);
    console.log(`  Best Hero: ${report.summary.bestHero}`);
    console.log(`  Worst Hero: ${report.summary.worstHero}`);
    console.log(`  Best Card: ${report.summary.bestCard}`);
    console.log(`  Worst Card: ${report.summary.worstCard}`);
  }
  
  // ===== GENERATE DETAILED SUMMARY =====
  console.log('\n📊 Generating summary...');
  
  const summary: any = {
    simId,
    timestamp: new Date().toISOString(),
    simulationsPerSize: SIMULATIONS_PER_SIZE,
    playerCounts: {}
  };
  
  for (const { playerCount, stats } of allStats) {
    const summaryData = stats.getDetailedSummary();
    summary.playerCounts[playerCount] = summaryData;
  }
  
  // Save summary
  const summaryFile = path.join(outputDir, `summary-${simId}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`✅ Summary saved to: ${summaryFile}`);
  
  console.log(`\n🎉 All simulations complete!`);
  console.log(`📁 Results saved to: ${outputDir}`);
  console.log(`  - Combined card stats: ${combinedFile}`);
  console.log(`  - Combined hero stats: ${heroFile}`);
  console.log(`  - Performance report: ${path.join(outputDir, `performance-report-${simId}.csv`)}`);
  console.log(`  - Summary: ${summaryFile}`);
}

// ===== RUN =====
try {
  registerAllCards();
  runBatch();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}