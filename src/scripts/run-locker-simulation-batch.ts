// src/scripts/run-locker-simulation-batch.ts

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
import { ZombieSpawner } from '../game/misc/ZombieSpawner';
import { registerAllActions } from './sim/simActions';
import { EventManager } from '../game/misc/EventManager';
import { HeroId } from '../game/misc/HeroId';
import { 
  getPlayerCountFromArgs, 
  getMaxStepsFromArgs, 
  getOutputDirFromArgs,
  getRandomStartPositions,
  createSimBoard,
} from './sim';

// ===== SILENCE CONSOLE LOGS =====
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = function(...args: any[]) {
  const msg = args.join(' ');
  // Only show progress messages and important info
  if (msg.includes('simulating game') || 
      msg.includes('=== LOCKER CARD SIMULATION ===') ||
      msg.includes('All simulations complete') ||
      msg.includes('✅ Completed') ||
      msg.includes('📊') ||
      msg.includes('🎉') ||
      msg.includes('Error') ||
      msg.includes('WARNING')) {
    originalConsoleLog(msg);
  }
};
console.error = function(...args: any[]) {
  // Always show errors
  originalConsoleError(...args);
};

// ===== CONFIGURATION =====
const SIMULATIONS_PER_SIZE = 800;
const STARTING_CARD_COUNT = 4;

// ===== LOCKER CARD DEFINITIONS =====
const LOCKER_CARDS = [
  { id: 'locker_charity_fund', name: 'Charity Fund' },
  { id: 'locker_childs_tool_set', name: "Child's Tool Set" },
  { id: 'locker_cool_for_sale', name: 'Cool for Sale' },
  { id: 'locker_dirty_gym_socks', name: 'Dirty Gym Socks' },
  { id: 'locker_dog_tags', name: 'Dog Tags' },
  { id: 'locker_free_hugs_tshirt', name: 'Free Hugs T-Shirt' },
  { id: 'locker_fresh_wound_dressing', name: 'Fresh Wound Dressing' },
  { id: 'locker_gas_leak', name: 'Gas Leak' },
  { id: 'locker_grappling_hook', name: 'Grappling Hook' },
  { id: 'locker_leather_jacket', name: 'Leather Jacket' },
  { id: 'locker_long_sleeves', name: 'Long Sleeves' },
  { id: 'locker_nice_for_sale', name: 'Nice for Sale' },
  { id: 'locker_ouija_board', name: 'Ouija Board' },
  { id: 'locker_part_time_job', name: 'Part Time Job' },
  { id: 'locker_permanent_record', name: 'Permanent Record' },
  { id: 'locker_pyramid_scheme', name: 'Pyramid Scheme' },
  { id: 'locker_quality_over_quantity', name: 'Quality over Quantity' },
  { id: 'locker_roller_backpack', name: 'Roller Backpack' },
  { id: 'locker_scout_training', name: 'Scout Training' },
  { id: 'locker_sharpened_stick', name: 'Sharpened Stick' },
  { id: 'locker_shoes', name: 'Shoes' },
  { id: 'locker_vitamins', name: 'Vitamins' },
  { id: 'locker_wall_in_a_box', name: 'Wall-in-a-Box' },
];

// ===== STATISTICS TRACKING =====
interface LockerCardStats {
  cardId: string;
  cardName: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

// ===== SHUFFLE FUNCTION =====
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ===== HERO POOL =====
const HEROES: HeroId[] = [
  HeroId.MIKE_U_STRONG,
  HeroId.BARRY_CADE,
  HeroId.ANITA_BANDAGE,
  HeroId.AL_B_TROSS,
  HeroId.BROCK_SLAYTON,
  HeroId.ELSA_VON_TRAP,
  HeroId.PHIL_T_RAGS,
  HeroId.LOLA_LADRA,
  HeroId.RICHARD_KIM,
  HeroId.DOROTHY_DECKARD,
  HeroId.CIA_LADER,
  HeroId.ARCHY_TECT,
];

function getHeroName(heroId: HeroId): string {
  const names: Record<HeroId, string> = {
    [HeroId.MIKE_U_STRONG]: 'Mike U. Strong',
    [HeroId.BARRY_CADE]: 'Barry Cade',
    [HeroId.ANITA_BANDAGE]: 'Anita Bandage',
    [HeroId.AL_B_TROSS]: 'Al B. Tross',
    [HeroId.BROCK_SLAYTON]: 'Brock Slayton',
    [HeroId.ELSA_VON_TRAP]: 'Elsa Von Trap',
    [HeroId.PHIL_T_RAGS]: 'Phil T. Rags',
    [HeroId.LOLA_LADRA]: 'Lola Ladra',
    [HeroId.RICHARD_KIM]: 'Richard Kim',
    [HeroId.DOROTHY_DECKARD]: 'Dorothy Deckard',
    [HeroId.CIA_LADER]: 'Cia Lader',
    [HeroId.ARCHY_TECT]: 'Archy Tect',
  };
  return names[heroId] || 'Unknown';
}

// ===== APPLY LOCKER CARD =====
function applyLockerCard(cardId: string, player: any, allPlayers: any[], board: any): void {
  // Simple application - just log it for now
  // You can expand this later
}

function runLockerSimulation(playerCount: number, batchId: string): Map<string, LockerCardStats> {
  const stats: Map<string, LockerCardStats> = new Map();
  for (const card of LOCKER_CARDS) {
    stats.set(card.id, {
      cardId: card.id,
      cardName: card.name,
      gamesPlayed: 0,
      wins: 0,
      winRate: 0,
    });
  }
  
  const randomHero = HEROES[Math.floor(Math.random() * HEROES.length)];
  
  for (let simNum = 0; simNum < SIMULATIONS_PER_SIZE; simNum++) {
    if (simNum % 100 === 0) {
      console.log(`simulating game [${simNum + 1}/${SIMULATIONS_PER_SIZE}] for ${playerCount} players...`);
    }
    
    try {
      const board = createSimBoard();
      
      const players: Player[] = [];
      for (let i = 0; i < playerCount; i++) {
        const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
        (player as any).isBot = true;
        players.push(player);
      }
      
      const game = new Game();
      game.board = board;
      game.players = players;
      (game as any)._simLogs = [];
      
      registerAllCards();
      registerAllActions();
      CardProcessor.setGame(game);
      
      // Assign hero
      for (const player of players) {
        player.heroId = randomHero;
        player.gold = 30;
        player.currSP = 15;
        player.currHealth = 3;
        player.rawMeleeSuccessRate = 3;
        player.rawBarricadeSuccessRate = 3;
        player.rawTrapSuccessRate = 3;
        player.meleeEffectivenessBoost = 0;
        player.trapEffectivenessBoost = 0;
        player.barricadeEffectivenessBoost = 0;
        player.movementDiscount = 0;
        player.cardPurchaseDiscount = 0;
      }
      
      // Build deck
      const allCardDefs = CardProcessor.getAll();
      const deckCards: any[] = [];
      
      for (const cardDef of allCardDefs) {
        if (LOCKER_CARDS.some(lc => lc.id === cardDef.id)) {
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
      
      const cardDrawer = new CardDrawer();
      (game as any).cardManager = cardDrawer;
      cardDrawer.initializeGameDeck(deckCards);
      
      // Deal locker cards
      const shuffledLockerCards = shuffleArray([...LOCKER_CARDS]);
      const playerLockerCards: Map<string, string> = new Map();
      
      for (let i = 0; i < players.length && i < shuffledLockerCards.length; i++) {
        const player = players[i];
        const lockerCard = shuffledLockerCards[i];
        
        const cardInstance = {
          id: `${lockerCard.id}-${Date.now()}-${Math.random()}`,
          cardId: lockerCard.id,
          name: lockerCard.name,
          cost: 0,
          image: 'default.png',
          targetType: 'none',
        };
        
        player.addCard(cardInstance);
        playerLockerCards.set(player.id, lockerCard.id);
        applyLockerCard(lockerCard.id, player, game.players, board);
      }
      
      // Deal starting cards
      for (const player of players) {
        while (player.hand.cards.length < STARTING_CARD_COUNT) {
          const card = cardDrawer.drawGameCard();
          if (card) {
            player.addCard(card);
          } else {
            break;
          }
        }
      }
      
      // Place players
      const startPositions = getRandomStartPositions(board, players.length);
      for (let i = 0; i < players.length && i < startPositions.length; i++) {
        const [x, y] = startPositions[i];
        game.board.placePlayer(players[i], x, y);
      }
      
      // Zombie manager
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
      
      // AI Controllers
      const gameManager = new GameManager(game);
      const aiControllers = new Map();
      for (const player of players) {
        const ai = new AIController(gameManager, board, players, 1, game);
        aiControllers.set(player.id, ai);
      }
      
      // Initial zombie spawn
      game._generationCount = 1;
      const initialZombieCount = Math.floor(players.filter(p => !p.isEliminated).length * 1.5);
      for (let i = 0; i < initialZombieCount; i++) {
        ZombieSpawner.spawnRandom(board);
      }
      
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
      
      // Record results
      const winner = game.players
        .filter(p => !p.isEliminated)
        .sort((a, b) => b.currSP - a.currSP)[0];
      
      if (winner) {
        const winnerLockerCard = playerLockerCards.get(winner.id);
        if (winnerLockerCard) {
          const cardStats = stats.get(winnerLockerCard);
          if (cardStats) {
            cardStats.gamesPlayed++;
            cardStats.wins++;
          }
        }
        
        for (const [playerId, cardId] of playerLockerCards) {
          if (playerId !== winner.id) {
            const cardStats = stats.get(cardId);
            if (cardStats) {
              cardStats.gamesPlayed++;
            }
          }
        }
      }
      
    } catch (error) {
      console.error(`[${playerCount}p] Error in simulation:`, error);
      continue;
    }
  }
  
  // Calculate win rates
  for (const [cardId, cardStats] of stats) {
    cardStats.winRate = cardStats.gamesPlayed > 0 ? (cardStats.wins / cardStats.gamesPlayed) * 100 : 0;
  }
  
  return stats;
}

function runBatch(): void {
  console.log('\n=== LOCKER CARD SIMULATION ===');
  console.log(`Running ${SIMULATIONS_PER_SIZE} simulations per player count\n`);
  
  const outputDir = getOutputDirFromArgs();
  const batchId = `batch-${Date.now()}`;
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const allResults: { playerCount: number; stats: Map<string, LockerCardStats> }[] = [];
  
  for (let playerCount = 2; playerCount <= 5; playerCount++) {
    console.log(`\n📊 Running simulations for ${playerCount} players...`);
    const stats = runLockerSimulation(playerCount, batchId);
    allResults.push({ playerCount, stats });
    console.log(`✅ Completed ${playerCount} player simulations`);
  }
  
  // Combine results
  console.log('\n📊 Combining all results...');
  const expectedWinRates = { 2: 50, 3: 33.33, 4: 25, 5: 20 };
  
  let combinedCSV = 'Player Count,Locker Card,Games,Wins,Win %,Expected Win %\n';
  for (const { playerCount, stats } of allResults) {
    for (const [cardId, cardStats] of stats) {
      combinedCSV += `${playerCount},${cardStats.cardName},${cardStats.gamesPlayed},${cardStats.wins},${cardStats.winRate.toFixed(2)},${expectedWinRates[playerCount as keyof typeof expectedWinRates].toFixed(2)}\n`;
    }
  }
  
  const combinedFile = path.join(outputDir, `locker-combined-${batchId}.csv`);
  fs.writeFileSync(combinedFile, combinedCSV, 'utf8');
  console.log(`✅ Combined results saved to: ${combinedFile}`);
  
  console.log(`\n🎉 All simulations complete!`);
  console.log(`📁 Results saved to: ${outputDir}`);
}

// ===== RUN =====
try {
  registerAllCards();
  runBatch();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}