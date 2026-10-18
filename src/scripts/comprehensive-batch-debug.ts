// src/scripts/comprehensive-batch-debug.ts

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

// ===== CONFIGURATION =====
const SIMULATIONS_PER_SIZE = 100; // Small for debugging
const CARD_OFFER_COUNT = 4;
const STARTING_CARD_COUNT = 9;
const AI_TIMEOUT_MS = 10000;

// ============================================================
// COMPREHENSIVE STATISTICS (simplified for debug)
// ============================================================

interface CardStats {
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

interface LockerCardStats {
  cardId: string;
  cardName: string;
  gamesWithCard: number;
  winsWithCard: number;
  winRate: number;
}

interface HeroStats {
  heroId: string;
  heroName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

interface SpecialActionStats {
  actionId: string;
  actionName: string;
  totalUses: number;
  usesByGeneration: Map<number, number>;
  usesByWinner: number;
}

interface GameResult {
  gameId: string;
  playerCount: number;
  winner: string;
  winnerHero: string;
  winnerLockerCard: string;
  finalSP: number;
  finalNight: number;
  totalSteps: number;
  cardsPlayed: string[];
}

class ComprehensiveStats {
  cardStats: Map<string, CardStats> = new Map();
  lockerCardStats: Map<string, LockerCardStats> = new Map();
  heroStats: Map<string, HeroStats> = new Map();
  specialActionStats: Map<string, SpecialActionStats> = new Map();
  gameResults: GameResult[] = [];
  playerCount: number;
  totalGames: number = 0;
  
  constructor(playerCount: number) {
    this.playerCount = playerCount;
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
  
  recordCardPlayed(cardId: string, cardName: string, gameId: string): void {
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
  
  recordLockerCardDealt(playerId: string, cardId: string, isWinner: boolean): void {
    const stats = this.lockerCardStats.get(cardId);
    if (stats) {
      stats.gamesWithCard++;
      if (isWinner) {
        stats.winsWithCard++;
      }
    }
  }
  
  recordHeroPlayed(heroId: string, isWinner: boolean): void {
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
    stats.gamesPlayed++;
    if (isWinner) {
      stats.wins++;
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
  
  recordGameResult(
    gameId: string,
    winner: Player,
    lockerCard: string | undefined,
    finalNight: number,
    totalSteps: number,
    cardsPlayed: string[]
  ): void {
    this.totalGames++;
    this.gameResults.push({
      gameId,
      playerCount: this.playerCount,
      winner: winner.name,
      winnerHero: winner.heroId || 'none',
      winnerLockerCard: lockerCard || 'none',
      finalSP: winner.currSP,
      finalNight,
      totalSteps,
      cardsPlayed,
    });
    for (const cardId of cardsPlayed) {
      const stats = this.cardStats.get(cardId);
      if (stats) {
        stats.winsWhenPlayed++;
        stats.gamesPlayed++;
      }
    }
  }
  
  finalize(): void {
    for (const [cardId, stats] of this.lockerCardStats) {
      stats.winRate = stats.gamesWithCard > 0 ? (stats.winsWithCard / stats.gamesWithCard) * 100 : 0;
    }
    for (const [heroId, stats] of this.heroStats) {
      stats.winRate = stats.gamesPlayed > 0 ? (stats.wins / stats.gamesPlayed) * 100 : 0;
    }
  }
  
  exportToCSV(outputDir: string, batchId: string): void {
    // Simplified export for debug
    this.finalize();
    const playerDir = path.join(outputDir, `${this.playerCount}p`);
    if (!fs.existsSync(playerDir)) {
      fs.mkdirSync(playerDir, { recursive: true });
    }
    console.log(`📊 ${this.playerCount}p Stats would be exported to ${playerDir}`);
  }
}

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
  playerIndex: number,
  step: number,
  timeoutMs: number = AI_TIMEOUT_MS
): { success: boolean; timedOut: boolean } {
  console.log(`[AI_START] ${player.name} (idx:${playerIndex}) taking action at step ${step}...`);
  let timedOut = false;
  let result = false;
  
  const timeoutId = setTimeout(() => {
    timedOut = true;
    console.log(`[TIMEOUT] AI for ${player.name} timed out after ${timeoutMs}ms at step ${step}`);
  }, timeoutMs);
  
  try {
    const startTime = Date.now();
    result = ai.takeAction(player);
    const elapsed = Date.now() - startTime;
    console.log(`[AI_DONE] ${player.name} action result: ${result} (took ${elapsed}ms)`);
  } catch (error) {
    console.error(`[ERROR] AI for ${player.name} crashed:`, error);
    result = false;
  } finally {
    clearTimeout(timeoutId);
  }
  
  return { success: result, timedOut };
}

// ============================================================
// RUN SIMULATION (DEBUG)
// ============================================================

function runSimulation(playerCount: number, batchId: string): ComprehensiveStats {
  console.log(`[RUN] Starting simulation for ${playerCount} players`);
  const stats = new ComprehensiveStats(playerCount);
  
  for (let simNum = 0; simNum < SIMULATIONS_PER_SIZE; simNum++) { EventManager.getInstance().clear();
    console.log(`\n[GAME] ========== GAME ${simNum + 1}/${SIMULATIONS_PER_SIZE} for ${playerCount}p ==========`);
    
    let gameCompleted = false;
    let currentPhase = 'start';
    
    const gameTimeout = setTimeout(() => {
      if (!gameCompleted) {
        console.log(`[TIMEOUT] Game ${simNum} for ${playerCount}p timed out at phase: ${currentPhase}`);
      }
    }, 60000); // 60 second timeout for debug
    
    try {
      currentPhase = 'create_board';
      console.log(`[PHASE] ${currentPhase}`);
      const board = createSimBoard();
      
      currentPhase = 'create_players';
      console.log(`[PHASE] ${currentPhase}`);
      const players: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
        const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
        (player as any).isBot = true;
        players.push(player);
        console.log(`  Created ${player.name}`);
      }
      
      currentPhase = 'create_game';
      console.log(`[PHASE] ${currentPhase}`);
      const game = new Game();
      game.board = board;
      game.players = players;
      (game as any)._simLogs = [];
      
      currentPhase = 'register_cards';
      console.log(`[PHASE] ${currentPhase}`);
      registerAllCards();
      registerAllActions();
      CardProcessor.setGame(game);
      
      currentPhase = 'assign_heroes';
      console.log(`[PHASE] ${currentPhase}`);
      assignSimHeroes(players, game);
      
      for (const player of players) {
        stats.recordHeroPlayed(player.heroId || 'none', false);
        console.log(`  ${player.name} -> ${player.heroId}`);
      }
      
      currentPhase = 'assign_lockers';
      console.log(`[PHASE] ${currentPhase}`);
      const shuffledLockers = shuffleArray([...LOCKER_DECK]);
      const playerLockerCards: Map<string, string> = new Map();
      
      for (let i = 0; i < players.length && i < shuffledLockers.length; i++) {
        const player = players[i];
        const lockerCard = shuffledLockers[i];
        console.log(`  ${player.name} -> ${lockerCard.name}`);
        
        const lockerData = getLockerData(lockerCard.id);
        if (lockerData) {
          applyLockerCard(lockerCard.id, player, game.players, board);
          playerLockerCards.set(player.id, lockerCard.id);
          stats.recordLockerCardDealt(player.id, lockerCard.id, false);
        }
      }
      
      currentPhase = 'build_deck';
      console.log(`[PHASE] ${currentPhase}`);
      const allCardDefs = CardProcessor.getAll();
      console.log(`  Found ${allCardDefs.length} card definitions`);
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
      console.log(`  Created ${deckCards.length} deck cards`);
      
      currentPhase = 'init_card_drawer';
      console.log(`[PHASE] ${currentPhase}`);
      const cardDrawer = new CardDrawer();
      (game as any).cardManager = cardDrawer;
      cardDrawer.initializeGameDeck(deckCards);
      
      currentPhase = 'init_locker_deck';
      console.log(`[PHASE] ${currentPhase}`);
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
      console.log(`[PHASE] ${currentPhase}`);
      const cardsPlayedTracker: string[] = [];
      const gameId = `sim-${batchId}-${simNum}`;
      
      const cardPlayedHandler = (data: CardPlayedEvent) => {
        cardsPlayedTracker.push(data.cardId);
        stats.recordCardPlayed(data.cardId, data.cardName, gameId);
      };
      EventManager.getInstance().on('cardPlayed', cardPlayedHandler);
      
      currentPhase = 'deal_starting_cards';
      console.log(`[PHASE] ${currentPhase}`);
      for (const player of players) {
        console.log(`  Dealing to ${player.name}...`);
        const isDorothy = player.heroId === 'dorothy_deckard' || player.heroId === HeroId.DOROTHY_DECKARD;
        console.log(`    Dorothy? ${isDorothy}`);
        
        const drawnCards: any[] = [];
        for (let i = 0; i < STARTING_CARD_COUNT; i++) {
          const card = cardDrawer.drawGameCard();
          if (card) {
            drawnCards.push(card);
          }
        }
        console.log(`    Drew ${drawnCards.length} cards`);
        
        if (isDorothy) {
          for (const card of drawnCards) {
            player.addCard(card);
            stats.recordCardOffer(card.cardId, card.name, card.cost || 0);
            stats.recordCardPurchase(card.cardId, card.name, card.cost || 0);
          }
          console.log(`    Dorothy kept all ${drawnCards.length} cards for free`);
        } else {
          let remainingGold = player.gold;
          console.log(`    Starting gold: ${remainingGold}`);
          
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
          
          let purchased = 0;
          for (const scored of scoredCards) {
            const purchasePrice = Math.max(0, scored.cost - (player.cardPurchaseDiscount || 0));
            if (scored.expectedValue > purchasePrice * 0.8 && remainingGold >= purchasePrice) {
              player.addCard(scored.card);
              remainingGold -= purchasePrice;
              purchased++;
              stats.recordCardOffer(scored.card.cardId, scored.card.name, scored.cost);
              stats.recordCardPurchase(scored.card.cardId, scored.card.name, scored.cost);
              console.log(`    Purchased ${scored.card.name} for ${purchasePrice} gold`);
            } else {
              cardDrawer.discardGameCard(scored.card);
              stats.recordCardOffer(scored.card.cardId, scored.card.name, scored.cost);
            }
          }
          player.gold = remainingGold;
          console.log(`    Purchased ${purchased} cards, remaining gold: ${remainingGold}`);
        }
      }
      
      currentPhase = 'offer_draft_cards';
      console.log(`[PHASE] ${currentPhase}`);
      for (const player of players) {
        console.log(`  Draft for ${player.name}...`);
        const draftResult = draftCards(player, board, game, CARD_OFFER_COUNT);
        
        for (const card of draftResult.cardsOffered) {
          stats.recordCardOffer(card.cardId, card.cardName, card.cost);
          if (card.purchased) {
            stats.recordCardPurchase(card.cardId, card.cardName, card.cost);
          }
        }
      }
      
      currentPhase = 'place_players';
      console.log(`[PHASE] ${currentPhase}`);
      const startPositions = getRandomStartPositions(board, players.length);
      for (let i = 0; i < players.length && i < startPositions.length; i++) {
        const [x, y] = startPositions[i];
        game.board.placePlayer(players[i], x, y);
        console.log(`  ${players[i].name} at (${x},${y})`);
      }
      
      currentPhase = 'create_zombie_manager';
      console.log(`[PHASE] ${currentPhase}`);
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
      console.log(`  ZombieManager created`);
      (game as any).zombieManager = zombieManager;
      
      currentPhase = 'create_ai_controllers';
      console.log(`[PHASE] ${currentPhase}`);
      const gameManager = new GameManager(game);
      const aiControllers = new Map();
      for (const player of players) {
        const ai = new AIController(gameManager, board, players, 1, game);
        console.log(`  Created AI for ${player.name}`);
        
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
      console.log(`[PHASE] ${currentPhase}`);
      game._generationCount = 1;
      const initialZombieCount = Math.floor(players.filter(p => !p.isEliminated).length * 1.5);
      console.log(`  Spawning ${initialZombieCount} initial zombies...`);
      for (let i = 0; i < initialZombieCount; i++) {
        ZombieSpawner.spawnRandom(board);
      }
      
      for (const player of players) {
        if (player.actionManager) {
          player.actionManager.setCurrentNight(1);
        }
      }
      
      currentPhase = 'game_loop';
      console.log(`[PHASE] ${currentPhase}`);
      console.log(`[GAME_LOOP] Starting game loop for ${playerCount} players`);
      
      let step = 0;
      let playerIndex = 0;
      const passedPlayers = new Set<string>();
      const maxSteps = 300;
      let lastHeartbeat = 0;
      
      while (step < maxSteps) {
        if (game.isGameOver()) {
          console.log(`[GAME_LOOP] Game over at step ${step}`);
          break;
        }
        
        // Log heartbeat every 10 steps
        if (step - lastHeartbeat >= 10) {
          lastHeartbeat = step;
          const aliveCount = game.players.filter(p => !p.isEliminated).length;
          console.log(`[HEARTBEAT] Step ${step}, alive: ${aliveCount}, passed: ${passedPlayers.size}`);
        }
        
        const alivePlayers = game.players.filter(p => !p.isEliminated);
        if (passedPlayers.size >= alivePlayers.length && alivePlayers.length > 0) {
          console.log(`[ZOMBIE_PHASE] Night ${game.generationCount}, step ${step}`);
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
          console.log(`[GAME_LOOP] No valid player found, resetting`);
          passedPlayers.clear();
          playerIndex = 0;
          step++;
          continue;
        }
        
        const ai = aiControllers.get(currentPlayer.id);
        if (!ai) {
          console.log(`[GAME_LOOP] No AI for ${currentPlayer.name}, passing`);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
          step++;
          continue;
        }
        
        try {
          const result = executeAIWithTimeout(ai, currentPlayer, playerIndex, step);
          if (result.timedOut) {
            console.log(`[GAME_LOOP] ${currentPlayer.name} timed out, passing`);
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          } else if (result.success) {
            console.log(`[GAME_LOOP] ${currentPlayer.name} action succeeded`);
            playerIndex++;
          } else {
            console.log(`[GAME_LOOP] ${currentPlayer.name} had no actions, passing`);
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          }
        } catch (error) {
          console.error(`[GAME_LOOP] AI for ${currentPlayer.name} crashed:`, error);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }
        
        step++;
      }
      
      console.log(`[GAME_LOOP] Exited loop at step ${step}, gameOver: ${game.isGameOver()}`);
      
      currentPhase = 'cleanup';
      console.log(`[PHASE] ${currentPhase}`);
      EventManager.getInstance().off('cardPlayed', cardPlayedHandler);
      
      currentPhase = 'record_results';
      console.log(`[PHASE] ${currentPhase}`);
      const winner = game.players
        .filter(p => !p.isEliminated)
        .sort((a, b) => b.currSP - a.currSP)[0];
      
      if (winner) {
        console.log(`[WINNER] ${winner.name} with SP: ${winner.currSP}`);
        const winnerLockerCard = playerLockerCards.get(winner.id);
        const winnerHero = winner.heroId || 'none';
        
        stats.recordHeroPlayed(winnerHero, true);
        
        if (winnerLockerCard) {
          stats.recordLockerCardDealt(winner.id, winnerLockerCard, true);
        }
        
        stats.recordGameResult(
          gameId,
          winner,
          winnerLockerCard,
          game.generationCount,
          step,
          cardsPlayedTracker
        );
      } else {
        console.log(`[WINNER] No winner found!`);
      }
      
      gameCompleted = true;
      clearTimeout(gameTimeout);
      console.log(`[GAME] Game ${simNum + 1} completed successfully`);
      
    } catch (error) {
      gameCompleted = true;
      clearTimeout(gameTimeout);
      console.log(`[ERROR] Game ${simNum} for ${playerCount}p crashed at phase '${currentPhase}':`, error);
      continue;
    }
    
    if (simNum > 0 && simNum % 20 === 0) {
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  console.log(`[RUN] Finished simulation for ${playerCount} players`);
  return stats;
}

// ============================================================
// RUN BATCH
// ============================================================

function runBatch(): void {
  console.log('\n=== COMPREHENSIVE BATCH DEBUG SIMULATION ===');
  console.log(`Running ${SIMULATIONS_PER_SIZE} simulations per player count (DEBUG MODE)\n`);
  
  const outputDir = getOutputDirFromArgs();
  const batchId = `debug-${Date.now()}`;
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const allStats: ComprehensiveStats[] = [];
  
  for (let playerCount = 2; playerCount <= 5; playerCount++) {
    console.log(`\n📊 Running debug simulations for ${playerCount} players...`);
    const stats = runSimulation(playerCount, batchId);
    allStats.push(stats);
    stats.exportToCSV(outputDir, batchId);
    console.log(`✅ Completed ${playerCount} player debug simulations`);
  }
  
  console.log(`\n🎉 All debug simulations complete!`);
  console.log(`📁 Results would be saved to: ${outputDir}`);
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