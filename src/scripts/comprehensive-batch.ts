// src/scripts/run-comprehensive-batch.ts

import * as fs from 'fs';
import * as path from 'path';
import { Game } from '../game/core/Game';
import { Player } from '../game/core/Player';
import { GameManager } from '../game/core/GameManager';
import { BoardEvaluator } from '../game/board/BoardEvaluator';
import { HeroId } from '../game/misc/HeroId';
import { ZombieSimManager } from '../game/misc/ZombieSimManager';
import { AIController } from '../game/core/AIController';
import { CardDrawer } from '../game/cards/CardDrawer';
import { CardProcessor } from '../game/cards/CardProcessor';
import { registerAllCards } from './sim/simDeck';
import { assignSimHeroes } from './sim/simHeroes';
import { ZombieSpawner } from '../game/misc/ZombieSpawner';
import { registerAllActions } from './sim/simActions';
import { EventManager, CardPlayedEvent } from '../game/misc/EventManager';
import { draftCards } from './sim/simCardDraft';
import {
  getPlayerCountFromArgs,
  getMaxStepsFromArgs,
  getOutputDirFromArgs,
  getRandomStartPositions,
  createSimBoard,
} from './sim';
import { LOCKER_DECK, getLockerData, applyLockerCard } from '../game/cards/CardIndex/LockerDeck';
import { ComprehensiveStats } from './ComprehensiveStats.js';

if (global.gc) {
  console.log('Garbage collection enabled');
} else {
  console.log('Run with --expose-gc to enable garbage collection');
}

// ===== GLOBAL ERROR HANDLING =====
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT]', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// ===== CONFIGURATION =====
const SIMULATIONS_PER_SIZE = 10000;
const CARD_OFFER_COUNT = 4;
const STARTING_CARD_COUNT = 9;
const AI_TIMEOUT_MS = 5000;
const GAME_TIMEOUT_MS = 60000;

// ===== SILENCE CONSOLE LOGS =====
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = function(...args: any[]) {
  const msg = args.join(' ');
  if (msg.includes('simulating game') ||
      msg.includes('=== COMPREHENSIVE BATCH ===') ||
      msg.includes('All simulations complete') ||
      msg.includes('✅ Completed') ||
      msg.includes('📊') ||
      msg.includes('🎉') ||
      msg.includes('[TIMEOUT]') ||
      msg.includes('[ERROR]') ||
      msg.includes('[UNCAUGHT]') ||
      msg.includes('[UNHANDLED]') ||
      msg.includes('[FAILURE]') ||
      msg.includes('[SKIP]') ||
      msg.includes('[FALLBACK]')) {
    originalConsoleLog(msg);
  }
};
console.error = function(...args: any[]) {
  const msg = args.join(' ');
  if (msg.includes('Fatal') || msg.includes('Error executing')) {
    originalConsoleError(msg);
  }
};

// ============================================================
// SHUFFLE FUNCTION
// ============================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================================
// TIMEOUT WRAPPER FOR AI ACTIONS
// ============================================================

function executeAIWithTimeout(
  ai: AIController,
  player: Player,
  timeoutMs: number = AI_TIMEOUT_MS
): { success: boolean; timedOut: boolean } {
  let timedOut = false;
  let result = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.log(`[TIMEOUT] AI for ${player.name} timed out after ${timeoutMs}ms`);
  }, timeoutMs);

  try {
    result = ai.takeAction(player);
  } catch (error) {
    console.error(`[ERROR] AI for ${player.name} crashed:`, error);
    result = false;
  } finally {
    clearTimeout(timeoutId);
  }

  return { success: result, timedOut };
}

// ============================================================
// CALCULATE SCORE
// ============================================================

function calculateScore(player: Player): number {
  return player.currSP + Math.max(player.currNP || 0, player.currCP || 0);
}

// ============================================================
// RUN SIMULATION
// ============================================================

function runSimulation(playerCount: number, batchId: string): ComprehensiveStats {
  const stats = new ComprehensiveStats(playerCount, SIMULATIONS_PER_SIZE);

  for (let simNum = 0; simNum < SIMULATIONS_PER_SIZE; simNum++) {
    if (simNum % 200 === 0) {
      console.log(`simulating game [${simNum + 1}/${SIMULATIONS_PER_SIZE}] for ${playerCount} players...`);
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write('');
      }
    }

    let gameCompleted = false;
    let currentPhase = 'start';

    const gameTimeout = setTimeout(() => {
      if (!gameCompleted) {
        console.log(`[TIMEOUT] Game ${simNum} for ${playerCount}p timed out at phase: ${currentPhase}`);
        stats.recordTimedOut();
        gameCompleted = true;
      }
    }, GAME_TIMEOUT_MS);

    try {
      currentPhase = 'create_board';
      const board = createSimBoard();

      // Skip if board is too crowded
      const initialZombieCount = board.getAllZombies().length;
      const initialBarricadeCount = board.getAllBarricades().length;
      if (initialZombieCount > 20 || initialBarricadeCount > 20) {
        console.log(`[SKIP] Game ${simNum} for ${playerCount}p: too many obstacles (Z:${initialZombieCount}, B:${initialBarricadeCount})`);
        stats.recordFailedGame();
        gameCompleted = true;
        clearTimeout(gameTimeout);
        continue;
      }

      currentPhase = 'create_players';
      const players: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
        const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
        (player as any).isBot = true;
        players.push(player);
      }

      currentPhase = 'create_game';
      const game = new Game();
      game.board = board;
      game.players = players;
      (game as any)._simLogs = [];

      currentPhase = 'register_cards';
      registerAllCards();
      registerAllActions();
      CardProcessor.setGame(game);

      currentPhase = 'assign_heroes';
      assignSimHeroes(players, game);

      for (const player of players) {
        stats.recordHeroPlayed(player.heroId || 'none', false);
      }

      currentPhase = 'assign_lockers';
      const shuffledLockers = shuffleArray([...LOCKER_DECK]);
      const playerLockerCards: Map<string, string> = new Map();

      for (let i = 0; i < players.length && i < shuffledLockers.length; i++) {
        const player = players[i];
        const lockerCard = shuffledLockers[i];

        const lockerData = getLockerData(lockerCard.id);
        if (lockerData) {
          applyLockerCard(lockerCard.id, player, game.players, board);
          playerLockerCards.set(player.id, lockerCard.id);
          stats.recordLockerCardDealt(player.id, lockerCard.id, false);
        }
      }

      currentPhase = 'build_deck';
      const allCardDefs = CardProcessor.getAll();
      const deckCards: any[] = [];

      for (const cardDef of allCardDefs) {
        if (LOCKER_DECK.some(lc => lc.id === cardDef.id)) {
          continue;
        }

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

      currentPhase = 'init_card_drawer';
      const cardDrawer = new CardDrawer();
      (game as any).cardManager = cardDrawer;
      cardDrawer.initializeGameDeck(deckCards);

      currentPhase = 'init_locker_deck';
      const lockerDeckCards = LOCKER_DECK.map(card => ({
        id: `${card.id}-${Date.now()}-${Math.random()}`,
        cardId: card.id,
        name: card.name,
        cost: 0,
        image: 'default.png',
        targetType: 'none',
      }));
      cardDrawer.initializeLockerDeck(lockerDeckCards);

      currentPhase = 'card_draft';
      const gameId = `sim-${batchId}-${simNum}`;

      // Clear EventManager before registering new listeners
      EventManager.getInstance().clear();

      // ===== TRACK CARDS PLAYED PER PLAYER =====
      const playerCardsPlayed: Map<string, string[]> = new Map();
      for (const player of players) {
        playerCardsPlayed.set(player.id, []);
      }

      const cardPlayedHandler = (data: CardPlayedEvent) => {
        const playerId = data.player.id;
        if (!playerCardsPlayed.has(playerId)) {
          playerCardsPlayed.set(playerId, []);
        }
        playerCardsPlayed.get(playerId)!.push(data.cardId);
        stats.recordCardPlayed(data.cardId, data.cardName);
      };
      EventManager.getInstance().on('cardPlayed', cardPlayedHandler);

      currentPhase = 'deal_starting_cards';
      for (const player of players) {
        const isDorothy = player.heroId === 'dorothy_deckard' || player.heroId === HeroId.DOROTHY_DECKARD;

        const drawnCards: any[] = [];
        for (let i = 0; i < STARTING_CARD_COUNT; i++) {
          const card = cardDrawer.drawGameCard();
          if (card) {
            drawnCards.push(card);
          }
        }

        if (isDorothy) {
          for (const card of drawnCards) {
            player.addCard(card);
            stats.recordCardOffer(card.cardId, card.name, card.cost || 0);
            stats.recordCardPurchase(card.cardId, card.name, card.cost || 0);
          }
        } else {
          let remainingGold = player.gold;

          const scoredCards = drawnCards.map(card => {
            const cardDef = CardProcessor.get(card.cardId);
            let expectedValue = 0;
            if (cardDef) {
              try {
                const evaluator = new BoardEvaluator(board, game.players, game.generationCount || 1);
                if (cardDef.expectedValue) {
                  expectedValue = cardDef.expectedValue(player, board, evaluator, null);
                }
              } catch (e) {
                expectedValue = card.cost * 2;
              }
            }
            return { card, expectedValue, cost: card.cost || 0 };
          });

          scoredCards.sort((a, b) => b.expectedValue - a.expectedValue);

          for (const scored of scoredCards) {
            const purchasePrice = Math.max(0, scored.cost - (player.cardPurchaseDiscount || 0));
            if (scored.expectedValue > purchasePrice * 0.8 && remainingGold >= purchasePrice) {
              player.addCard(scored.card);
              remainingGold -= purchasePrice;
              stats.recordCardOffer(scored.card.cardId, scored.card.name, scored.cost);
              stats.recordCardPurchase(scored.card.cardId, scored.card.name, scored.cost);
            } else {
              cardDrawer.discardGameCard(scored.card);
              stats.recordCardOffer(scored.card.cardId, scored.card.name, scored.cost);
            }
          }

          player.gold = remainingGold;
        }
      }

      currentPhase = 'offer_draft_cards';
      for (const player of players) {
        const draftResult = draftCards(player, board, game, CARD_OFFER_COUNT);

        for (const card of draftResult.cardsOffered) {
          stats.recordCardOffer(card.cardId, card.cardName, card.cost);
          if (card.purchased) {
            stats.recordCardPurchase(card.cardId, card.cardName, card.cost);
          }
        }
      }

      currentPhase = 'place_players';
      const startPositions = getRandomStartPositions(board, players.length);
      for (let i = 0; i < players.length && i < startPositions.length; i++) {
        const [x, y] = startPositions[i];
        game.board.placePlayer(players[i], x, y);
      }

      currentPhase = 'create_zombie_manager';
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

      (game as any).zombieManager = zombieManager;

      currentPhase = 'create_ai_controllers';
      const gameManager = new GameManager(game);
      const aiControllers = new Map();
      for (const player of players) {
        const ai = new AIController(gameManager, board, players, 1, game);

        const originalExecuteAction = ai.executeAction.bind(ai);
        ai.executeAction = function(player: Player, action: any): boolean {
          const result = originalExecuteAction(player, action);
          if (result && action && action.specialAction) {
            const actionId = action.specialAction.actionId;
            const actionName = action.specialAction.actionDef?.name || actionId;
            stats.recordSpecialActionUse(
              actionId,
              actionName,
              game.generationCount,
              false
            );
          }
          return result;
        };

        aiControllers.set(player.id, ai);
      }

      currentPhase = 'spawn_zombies';
      game._generationCount = 1;
      const zombieSpawnCount = Math.floor(players.filter(p => !p.isEliminated).length * 1.5);
      for (let i = 0; i < zombieSpawnCount; i++) {
        ZombieSpawner.spawnRandom(board);
      }

      for (const player of players) {
        if (player.actionManager) {
          player.actionManager.setCurrentNight(1);
        }
      }

      currentPhase = 'game_loop';
      let step = 0;
      let playerIndex = 0;
      const passedPlayers = new Set<string>();
      const maxSteps = 300;

      while (step < maxSteps) {
        if (game.isGameOver()) break;

        const alivePlayers = game.players.filter(p => !p.isEliminated);
        if (passedPlayers.size >= alivePlayers.length && alivePlayers.length > 0) {
          zombieManager.zombiePhase(game.generationCount);

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
          const result = executeAIWithTimeout(ai, currentPlayer);
          if (result.timedOut) {
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          } else if (result.success) {
            playerIndex++;
          } else {
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          }
        } catch (error) {
          console.log(`[ERROR] AI for ${currentPlayer.name} crashed: ${error}`);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }

        step++;
      }

      currentPhase = 'cleanup';
      EventManager.getInstance().off('cardPlayed', cardPlayedHandler);

      currentPhase = 'record_results';

      // ===== FIND WINNER BY SCORE (SP + max(NP, CP)) =====
      let winner = game.players
  .sort((a, b) => calculateScore(b) - calculateScore(a))[0];

// No fallback needed anymore because there's always at least 1 player
// But keep it for safety
if (!winner && game.players.length > 0) {
  winner = game.players[0];
  console.log(`[FALLBACK] Game ${simNum} had no winner, using first player: ${winner.name}`);
}

      if (winner) {
        const winnerLockerCard = playerLockerCards.get(winner.id);
        const winnerHero = winner.heroId || 'none';

        stats.recordHeroPlayed(winnerHero, true);

        if (winnerLockerCard) {
          stats.recordLockerCardDealt(winner.id, winnerLockerCard, true);
        }

        // ===== RECORD ALL CARD PLAYS FOR ALL PLAYERS =====
        stats.recordCardPlaysForGame(players, winner, playerCardsPlayed);

        // Get all cards played by the winner (for the game results)
        const winnerCardPlays = playerCardsPlayed.get(winner.id) || [];

        stats.recordGameResult(
          gameId,
          winner,
          winnerLockerCard,
          game.generationCount,
          step,
          winnerCardPlays
        );
      } else {
        console.log(`[FAILURE] Game ${simNum} for ${playerCount}p had no winner`);
        stats.recordNoWinner();
      }

      gameCompleted = true;
      clearTimeout(gameTimeout);

    } catch (error) {
      gameCompleted = true;
      clearTimeout(gameTimeout);
      console.log(`[ERROR] Game ${simNum} for ${playerCount}p crashed at phase '${currentPhase}': ${error}`);
      stats.recordFailedGame();
      continue;
    }

    if (simNum > 0 && simNum % 20 === 0) {
      if (global.gc) {
        global.gc();
      }
    }
  }

  console.log(`[${playerCount}p] Summary: ${stats.totalGames} completed, ${stats.failedGames} failed, ${stats.noWinnerGames} no winner, ${stats.timedOutGames} timed out`);
  return stats;
}

// ============================================================
// RUN BATCH
// ============================================================

function runBatch(): void {
  console.log('\n=== COMPREHENSIVE BATCH SIMULATION ===');
  console.log(`Running ${SIMULATIONS_PER_SIZE} simulations per player count\n`);

  const outputDir = getOutputDirFromArgs();
  const batchId = `batch-${Date.now()}`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allStats: ComprehensiveStats[] = [];
  const allCardData: Map<string, any> = new Map();
  const allLockerData: Map<string, any> = new Map();
  const allHeroData: Map<string, any> = new Map();

  for (let playerCount = 2; playerCount <= 5; playerCount++) {
    console.log(`\n📊 Running simulations for ${playerCount} players...`);
    const stats = runSimulation(playerCount, batchId);
    allStats.push(stats);
    stats.exportToCSV(outputDir, batchId, fs, path);
    console.log(`✅ Completed ${playerCount} player simulations`);

    // ===== FINALIZE THE STATS FIRST =====
    stats.finalize();

    // Collect card data
    for (const [cardId, cardStat] of stats.cardStats) {
      if (!allCardData.has(cardId)) {
        allCardData.set(cardId, {
          cardId: cardId,
          cardName: cardStat.cardName,
          cost: cardStat.cost,
          totalOffered: 0,
          totalPurchased: 0,
          totalPlayed: 0,
          totalWins: 0,
          totalGames: 0,
          winRates: {} as Record<number, { winRate: number; games: number; wins: number; purchased: number; offered: number; played: number }>,
        });
      }
      const data = allCardData.get(cardId)!;
      const winRate = cardStat.gamesPlayed > 0 ? (cardStat.winsWhenPlayed / cardStat.gamesPlayed) * 100 : 0;
      data.winRates[playerCount] = {
        winRate: winRate,
        games: cardStat.gamesPlayed,
        wins: cardStat.winsWhenPlayed,
        purchased: cardStat.purchased,
        offered: cardStat.offered,
        played: cardStat.played,
      };
      data.totalOffered += cardStat.offered;
      data.totalPurchased += cardStat.purchased;
      data.totalPlayed += cardStat.played;
      data.totalWins += cardStat.winsWhenPlayed;
      data.totalGames += cardStat.gamesPlayed;
    }

    // Collect locker data
    for (const [lockerId, lockerStat] of stats.lockerCardStats) {
      if (!allLockerData.has(lockerId)) {
        allLockerData.set(lockerId, {
          lockerId: lockerId,
          lockerName: lockerStat.cardName,
          winRates: {} as Record<number, { winRate: number; games: number; wins: number }>,
          totalGames: 0,
          totalWins: 0,
        });
      }
      const data = allLockerData.get(lockerId)!;
      const winRate = lockerStat.gamesWithCard > 0 ? (lockerStat.winsWithCard / lockerStat.gamesWithCard) * 100 : 0;
      data.winRates[playerCount] = {
        winRate: winRate,
        games: lockerStat.gamesWithCard,
        wins: lockerStat.winsWithCard,
      };
      data.totalGames += lockerStat.gamesWithCard;
      data.totalWins += lockerStat.winsWithCard;
    }

    // Collect hero data
    for (const [heroId, heroStat] of stats.heroStats) {
      if (!allHeroData.has(heroId)) {
        allHeroData.set(heroId, {
          heroId: heroId,
          heroName: heroStat.heroName,
          winRates: {} as Record<number, { winRate: number; games: number; wins: number }>,
          totalGames: 0,
          totalWins: 0,
        });
      }
      const data = allHeroData.get(heroId)!;
      const winRate = heroStat.gamesPlayed > 0 ? (heroStat.wins / heroStat.gamesPlayed) * 100 : 0;
      data.winRates[playerCount] = {
        winRate: winRate,
        games: heroStat.gamesPlayed,
        wins: heroStat.wins,
      };
      data.totalGames += heroStat.gamesPlayed;
      data.totalWins += heroStat.wins;
    }
  }

  // ===== GENERATE COMBINED SUMMARY =====

  const playerCounts = [2, 3, 4, 5];
  const expectedWinRates: Record<number, number> = { 2: 50, 3: 33.33, 4: 25, 5: 20 };

  // 1. Combined Card Summary with Deltas
  let cardCSV = 'Card ID,Card Name,Cost,';
  for (const pc of playerCounts) {
    cardCSV += `${pc}p Win %,${pc}p Games,${pc}p Wins,${pc}p Purchased,${pc}p Offered,${pc}p Played,${pc}p Purchase %,${pc}p Play %,${pc}p Win % Delta,`;
  }
  cardCSV += 'Overall Win %,Overall Games,Overall Wins,Overall Avg Delta\n';

  for (const [cardId, data] of allCardData) {
    cardCSV += `${data.cardId},${data.cardName},${data.cost},`;
    let totalGames = 0;
    let totalWins = 0;
    let totalDelta = 0;
    let deltaCount = 0;

    for (const pc of playerCounts) {
      const pcData = data.winRates[pc];
      if (pcData) {
        const purchaseRate = pcData.offered > 0 ? (pcData.purchased / pcData.offered) * 100 : 0;
        const playRate = pcData.purchased > 0 ? (pcData.played / pcData.purchased) * 100 : 0;
        const delta = pcData.winRate - expectedWinRates[pc];
        cardCSV += `${pcData.winRate.toFixed(2)},${pcData.games},${pcData.wins},${pcData.purchased},${pcData.offered},${pcData.played},${purchaseRate.toFixed(2)},${playRate.toFixed(2)},${delta.toFixed(2)},`;
        totalGames += pcData.games;
        totalWins += pcData.wins;
        totalDelta += delta;
        deltaCount++;
      } else {
        cardCSV += `0,0,0,0,0,0,0,0,0,`;
      }
    }

    const overallWinRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
    const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : 0;
    cardCSV += `${overallWinRate.toFixed(2)},${totalGames},${totalWins},${avgDelta.toFixed(2)}\n`;
  }

  // 2. Combined Locker Summary with Deltas
  let lockerCSV = 'Locker ID,Locker Name,';
  for (const pc of playerCounts) {
    lockerCSV += `${pc}p Win %,${pc}p Games,${pc}p Wins,${pc}p Win % Delta,`;
  }
  lockerCSV += 'Overall Win %,Overall Games,Overall Wins,Overall Avg Delta\n';

  for (const [lockerId, data] of allLockerData) {
    lockerCSV += `${data.lockerId},${data.lockerName},`;
    let totalGames = 0;
    let totalWins = 0;
    let totalDelta = 0;
    let deltaCount = 0;

    for (const pc of playerCounts) {
      const pcData = data.winRates[pc];
      if (pcData) {
        const delta = pcData.winRate - expectedWinRates[pc];
        lockerCSV += `${pcData.winRate.toFixed(2)},${pcData.games},${pcData.wins},${delta.toFixed(2)},`;
        totalGames += pcData.games;
        totalWins += pcData.wins;
        totalDelta += delta;
        deltaCount++;
      } else {
        lockerCSV += `0,0,0,0,`;
      }
    }

    const overallWinRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
    const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : 0;
    lockerCSV += `${overallWinRate.toFixed(2)},${totalGames},${totalWins},${avgDelta.toFixed(2)}\n`;
  }

  // 3. Combined Hero Summary with Deltas
  let heroCSV = 'Hero ID,Hero Name,';
  for (const pc of playerCounts) {
    heroCSV += `${pc}p Win %,${pc}p Games,${pc}p Wins,${pc}p Win % Delta,`;
  }
  heroCSV += 'Overall Win %,Overall Games,Overall Wins,Overall Avg Delta\n';

  for (const [heroId, data] of allHeroData) {
    heroCSV += `${data.heroId},${data.heroName},`;
    let totalGames = 0;
    let totalWins = 0;
    let totalDelta = 0;
    let deltaCount = 0;

    for (const pc of playerCounts) {
      const pcData = data.winRates[pc];
      if (pcData) {
        const delta = pcData.winRate - expectedWinRates[pc];
        heroCSV += `${pcData.winRate.toFixed(2)},${pcData.games},${pcData.wins},${delta.toFixed(2)},`;
        totalGames += pcData.games;
        totalWins += pcData.wins;
        totalDelta += delta;
        deltaCount++;
      } else {
        heroCSV += `0,0,0,0,`;
      }
    }

    const overallWinRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
    const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : 0;
    heroCSV += `${overallWinRate.toFixed(2)},${totalGames},${totalWins},${avgDelta.toFixed(2)}\n`;
  }

  // 4. Overall Summary with Success Rates
  let summaryCSV = 'Player Count,Simulations,Completed,Failed,No Winner,Timed Out,Success Rate,Expected Win Rate\n';
  for (const stats of allStats) {
    const successRate = (stats.totalGames / SIMULATIONS_PER_SIZE) * 100;
    summaryCSV += `${stats.playerCount},${SIMULATIONS_PER_SIZE},${stats.totalGames},${stats.failedGames},${stats.noWinnerGames},${stats.timedOutGames},${successRate.toFixed(2)}%,${expectedWinRates[stats.playerCount].toFixed(2)}%\n`;
  }

  // 5. Balance Report
  let balanceCSV = 'Category,Name,Overall Win %,Expected Win %,Delta,Status\n';

  for (const [cardId, data] of allCardData) {
    const totalGames = data.totalGames || 1;
    const overallWinRate = (data.totalWins / totalGames) * 100;
    const avgDelta = overallWinRate - 25;
    let status = 'Balanced';
    if (avgDelta > 15) status = '🚨 OVERPOWERED';
    else if (avgDelta > 8) status = '⚠️ Strong';
    else if (avgDelta < -15) status = '💀 UNDERPOWERED';
    else if (avgDelta < -8) status = '⚠️ Weak';
    if (data.totalGames > 20) {
      balanceCSV += `Card,${data.cardName},${overallWinRate.toFixed(2)},25.00,${avgDelta.toFixed(2)},${status}\n`;
    }
  }

  for (const [lockerId, data] of allLockerData) {
    const totalGames = data.totalGames || 1;
    const overallWinRate = (data.totalWins / totalGames) * 100;
    const avgDelta = overallWinRate - 25;
    let status = 'Balanced';
    if (avgDelta > 15) status = '🚨 OVERPOWERED';
    else if (avgDelta > 8) status = '⚠️ Strong';
    else if (avgDelta < -15) status = '💀 UNDERPOWERED';
    else if (avgDelta < -8) status = '⚠️ Weak';
    if (data.totalGames > 20) {
      balanceCSV += `Locker,${data.lockerName},${overallWinRate.toFixed(2)},25.00,${avgDelta.toFixed(2)},${status}\n`;
    }
  }

  for (const [heroId, data] of allHeroData) {
    const totalGames = data.totalGames || 1;
    const overallWinRate = (data.totalWins / totalGames) * 100;
    const avgDelta = overallWinRate - 25;
    let status = 'Balanced';
    if (avgDelta > 15) status = '🚨 OVERPOWERED';
    else if (avgDelta > 8) status = '⚠️ Strong';
    else if (avgDelta < -15) status = '💀 UNDERPOWERED';
    else if (avgDelta < -8) status = '⚠️ Weak';
    if (data.totalGames > 20) {
      balanceCSV += `Hero,${data.heroName},${overallWinRate.toFixed(2)},25.00,${avgDelta.toFixed(2)},${status}\n`;
    }
  }

  // Save all combined files
  const cardFile = path.join(outputDir, `combined-card-stats-${batchId}.csv`);
  const lockerFile = path.join(outputDir, `combined-locker-stats-${batchId}.csv`);
  const heroFile = path.join(outputDir, `combined-hero-stats-${batchId}.csv`);
  const summaryFile = path.join(outputDir, `summary-${batchId}.csv`);
  const balanceFile = path.join(outputDir, `balance-report-${batchId}.csv`);

  fs.writeFileSync(cardFile, cardCSV, 'utf8');
  fs.writeFileSync(lockerFile, lockerCSV, 'utf8');
  fs.writeFileSync(heroFile, heroCSV, 'utf8');
  fs.writeFileSync(summaryFile, summaryCSV, 'utf8');
  fs.writeFileSync(balanceFile, balanceCSV, 'utf8');

  console.log(`\n✅ Combined results saved to: ${outputDir}`);
  console.log(`  - Combined card stats: ${cardFile}`);
  console.log(`  - Combined locker stats: ${lockerFile}`);
  console.log(`  - Combined hero stats: ${heroFile}`);
  console.log(`  - Summary: ${summaryFile}`);
  console.log(`  - Balance report: ${balanceFile}`);

  console.log(`\n🎉 All simulations complete!`);
  console.log(`📁 Results saved to: ${outputDir}`);
}

// ============================================================
// RUN
// ============================================================

try {
  registerAllCards();
  runBatch();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}