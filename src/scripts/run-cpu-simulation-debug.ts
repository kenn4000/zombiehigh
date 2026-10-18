// src/scripts/run-cpu-simulation-debug.ts

import * as fs from 'fs';
import * as path from 'path';

// ===== WRITE DIRECTLY TO FILE =====
const debugLogFile = path.join(__dirname, '../../debug-output.txt');
const debugLogs: string[] = [];

function debugLog(...args: any[]): void {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  debugLogs.push(msg);
  // Also write to console directly
  process.stdout.write(msg + '\n');
}

// Override console.log to both capture and write directly
const originalLog = console.log;
console.log = (...args: any[]) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  debugLogs.push(msg);
  originalLog(msg);
};

// ===== GLOBAL ERROR HANDLERS =====
process.on('uncaughtException', (error) => {
  debugLog('=== UNCAUGHT EXCEPTION ===');
  debugLog(error.stack || error);
  fs.writeFileSync(debugLogFile, debugLogs.join('\n'), 'utf8');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  debugLog('=== UNHANDLED REJECTION ===');
  debugLog(reason);
  fs.writeFileSync(debugLogFile, debugLogs.join('\n'), 'utf8');
  process.exit(1);
});

// ===== IMPORTS =====
import { Game } from '../game/core/Game';
import { Player } from '../game/core/Player';
import { GameManager } from '../game/core/GameManager';
import { ZombieSimManager } from '../game/misc/ZombieSimManager';
import { AIController } from '../game/core/AIController';
import { CardDrawer } from '../game/cards/CardDrawer';
import { CardProcessor } from '../game/cards/CardProcessor';
import { registerAllCards } from './sim/simDeck';
import {
  getPlayerCountFromArgs,
  getMaxStepsFromArgs,
  getOutputDirFromArgs,
  START_POSITIONS,
  createSimBoard,
  assignSimHeroes
} from './sim';

// Import ZombieSpawner
import { ZombieSpawner } from '../game/misc/ZombieSpawner';

debugLog('=== SCRIPT STARTED ===');
debugLog(`Current directory: ${__dirname}`);

function run(): void {
  try {
    debugLog('=== RUN FUNCTION STARTED ===');
    
    const playerCount = getPlayerCountFromArgs();
    debugLog(`Player count: ${playerCount}`);
    
    const maxSteps = getMaxStepsFromArgs();
    debugLog(`Max steps: ${maxSteps}`);
    
    const outputDir = getOutputDirFromArgs();
    debugLog(`Output dir: ${outputDir}`);

    debugLog(`\n=== CPU SIMULATION ===`);
    debugLog(`Players: ${playerCount}`);
    debugLog(`Max steps: ${maxSteps}\n`);

    // Create board
    debugLog('Creating board...');
    const board = createSimBoard();
    debugLog('Board created');

    // Create players
    debugLog('Creating players...');
    const players: Player[] = [];
    for (let i = 0; i < playerCount; i++) {
      const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
      (player as any).isBot = true;
      players.push(player);
      debugLog(`  Created ${player.name}`);
    }

    // Create game
    debugLog('Creating game...');
    const game = new Game();
    game.board = board;
    game.players = players;
    (game as any)._simLogs = [];
    debugLog('Game created');

    // Assign heroes
    debugLog('Assigning heroes...');
    assignSimHeroes(players, game);
    debugLog('Heroes assigned');

    // ===== REGISTER CARDS =====
    debugLog('=== REGISTERING CARDS ===');
    registerAllCards();
    debugLog('All cards registered');

    // ===== INITIALIZE CARD DECK =====
    debugLog('=== INITIALIZING CARD DECK ===');
    CardProcessor.setGame(game);

    const allCardDefs = CardProcessor.getAll();
    debugLog(`Found ${allCardDefs.length} card definitions`);
    
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
    
    debugLog(`Created ${deckCards.length} cards for the deck`);
    
    const cardDrawer = new CardDrawer();
    (game as any).cardManager = cardDrawer;
    cardDrawer.initializeGameDeck(deckCards);

    debugLog(`Game deck size: ${cardDrawer.getGameDeckSize()}`);

    // ===== DEAL STARTING CARDS =====
    debugLog('=== DEALING STARTING CARDS ===');
    for (const player of players) {
      const cards = CardDrawer.drawCards(player, 5);
      debugLog(`  ${player.name}: Drew ${cards.length} cards (Hand: ${player.hand.cards.length})`);
    }

    // Create zombie sim manager
    debugLog('Creating ZombieSimManager...');
    const zombieManager = new ZombieSimManager(board, players, {
      onTrapKill: (ownerId, x, y) => {
        const msg = `[Trap] Kill at (${x},${y})`;
        (game as any)._simLogs?.push(msg);
        debugLog(msg);
      },
      onTrapFailed: () => {
        const msg = `[Trap] Failed`;
        (game as any)._simLogs?.push(msg);
        debugLog(msg);
      },
      onBaitConsumed: (ownerId, x, y) => {
        const msg = `[Bait] Consumed at (${x},${y})`;
        (game as any)._simLogs?.push(msg);
        debugLog(msg);
      },
      onPlayerAttacked: (playerId, x, y, fromCell) => {
        const player = game.getPlayerById(playerId);
        if (player) {
          const msg = `[Attack] ${player.name} attacked at (${x},${y})`;
          (game as any)._simLogs?.push(msg);
          debugLog(msg);
          (game as any).handlePlayerAttacked(playerId, x, y, fromCell);
        }
      },
      getTrapSuccessRate: (p) => p.getTrapEffectiveness() / 6,
      getBarricadeSuccessRate: (p) => p.getBarricadeEffectiveness() / 6,
      log: (msg: string) => {
        (game as any)._simLogs?.push(`[Zombie] ${msg}`);
        debugLog(`[Zombie] ${msg}`);
      },
    });
    debugLog('ZombieSimManager created');
 
// Place players on the board
debugLog('=== PLACING PLAYERS ===');
let placed = 0;
for (const player of players) {
  if (!game.board.getPlayerPosition(player) && START_POSITIONS.length > placed) {
    const [x, y] = START_POSITIONS[placed];
    // Use board.placePlayer instead of cell.setPlayer directly
    const success = game.board.placePlayer(player, x, y);
    if (success) {
      placed++;
      debugLog(`  ${player.name} placed at (${x}, ${y})`);
    } else {
      debugLog(`  Failed to place ${player.name} at (${x}, ${y})`);
    }
  }
}

  //temporary testing structures here
   const firstcell = board.getCell(4, 5);
  if (firstcell && firstcell.isEmpty) {
    firstcell.setBarricade(players[0]);}
   const nextcell = board.getCell(5, 6);
  if (nextcell && nextcell.isEmpty) {
    nextcell.setTrap(players[0]);}

// ===== PRINT INITIAL BOARD STATE =====
debugLog('\n=== INITIAL BOARD STATE ===');
debugLog('    0  1  2  3  4  5  6  7  8  9  10');
for (let y = 0; y < 10; y++) {
  let row = `${y.toString().padStart(2)} `;
  for (let x = 0; x < 11; x++) {
    const cell = game.board.getCell(x, y);
    if (!cell) {
      row += ' . ';
      continue;
    }
    if (cell.isHole) {
      row += ' X ';
    } else if (cell.hasPlayer) {
      const player = cell.structureOwner;
      const id = player ? player.id.replace('cpu-', 'P') : '?';
      row += ` ${id} `;
    } else if (cell.hasZombie) {
      row += ' Z ';
    } else if (cell.hasTrap) {
      row += ' T ';
    } else if (cell.hasBarricade) {
      row += ' B ';
    } else if (cell.hasBait) {
      row += ' b ';
    } else {
      row += ' . ';
    }
  }
  debugLog(row);
}
debugLog('========================\n');
    // Create GameManager
    debugLog('Creating GameManager...');
    const gameManager = new GameManager(game);
    debugLog('GameManager created');

    // Create AIControllers for each player
    debugLog('=== CREATING AI CONTROLLERS ===');
    const aiControllers = new Map();

    for (const player of players) {
      try {
        debugLog(`  Creating AI for ${player.name}...`);
        const ai = new AIController(gameManager, board, players, 1, game);
        aiControllers.set(player.id, ai);
        debugLog(`  Created AI for ${player.name}`);
      } catch (error) {
        debugLog(`  Failed to create AI for ${player.name}:`, error);
        throw error;
      }
    }

    debugLog('\n=== RUNNING SIMULATION ===\n');

    // ===== INITIAL ZOMBIE SPAWN (Night 1) =====
    debugLog(`[Night 1] Initial zombie spawn...`);
    const initialZombieCount = Math.floor(players.filter(p => !p.isEliminated).length * 1.5);
    debugLog(`[Night 1] Spawning ${initialZombieCount} initial zombies...`);
    
    for (let i = 0; i < initialZombieCount; i++) {
      const result = ZombieSpawner.spawnRandom(board);
      if (result.success) {
        debugLog(`[Night 1] Spawned zombie at (${result.spawnedCells[0].x}, ${result.spawnedCells[0].y})`);
      }
    }
    
    game._generationCount = 1;
    for (const player of players) {
    if (player.actionManager) {
        player.actionManager.setCurrentNight(1);
    }
}
    debugLog(`[Night 1] Zombies spawned. Starting Night 1 with ${board.getAllZombies().length} zombies.\n`);

    let step = 0;
    let playerIndex = 0;
    const passedPlayers = new Set<string>();
    let hasResetThisNight = false;

    // Game loop
    while (step < maxSteps) {
      try {
        // Check game over
        if (game.isGameOver()) {
          debugLog('\nGame over!');
          break;
        }

        // Check if all players have passed
        const alivePlayers = game.players.filter(p => !p.isEliminated);
if (passedPlayers.size >= alivePlayers.length) {
    // All players have passed - run zombie phase
    const zombieCountBefore = game.board.getAllZombies().length;
    debugLog(`\n[Night ${game.generationCount}] Zombies: ${zombieCountBefore} | Running zombie phase...`);

    const spawned = zombieManager.zombiePhase(game.generationCount);
    const zombieCountAfter = game.board.getAllZombies().length;

    // Give each alive player 1 SP for surviving
    for (const p of game.players) {
        if (!p.isEliminated) {
            p.addSPs(1);
            const goldEarned = p.currSP + p.currGP;
            p.addGold(goldEarned);
            const msg = `[Survival] ${p.name} gained 1 SP (now ${p.currSP}) and ${goldEarned} gold`;
            (game as any)._simLogs?.push(msg);
            debugLog(msg);
        }
    }
    
    // ===== INCREMENT NIGHT =====
    game._generationCount++;
    const newNight = game.generationCount;

    // ===== ADVANCE NIGHT FOR ALL ACTION MANAGERS =====
    debugLog(`[Night ${newNight}] Advancing ActionManagers...`);
    for (const p of game.players) {
        if (p.actionManager && !p.isEliminated) {
            p.actionManager.advanceNight(newNight);
            debugLog(`  ${p.name} ActionManager advanced to Night ${newNight}`);
        }
    }

    if (game.generationCount % 10 === 0) {
        debugLog(`[Night ${game.generationCount}] Scores: ${players.map(p => `${p.name}=${p.currSP}`).join(', ')} | Zombies: ${zombieCountAfter} | Spawned: ${spawned}`);
    }

    (game as any)._simLogs?.push(`[Night ${game.generationCount}] Zombies: ${zombieCountBefore} → ${zombieCountAfter} | Spawned: ${spawned}`);

    // Reset passed players for next round
    passedPlayers.clear();
    playerIndex = 0;
    step++;
    continue;
}

        // Get current player (skip eliminated)
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
          debugLog('[WARN] No valid player found, resetting');
          passedPlayers.clear();
          playerIndex = 0;
          step++;
          continue;
        }

        // Log turn start
        if (step % 100 === 0 || step === 0) {
          debugLog(`[DEBUG] ${currentPlayer.name}'s turn - Gold: ${currentPlayer.gold}, SP: ${currentPlayer.currSP}, Hand: ${currentPlayer.hand.cards.length}`);
        }

        // Get AI controller
        const ai = aiControllers.get(currentPlayer.id);
        if (!ai) {
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
          step++;
          continue;
        }

        // Take action with error handling
        try {
          const success = ai.takeAction(currentPlayer);
          if (success) {
            playerIndex++;
          } else {
            debugLog(`  [${currentPlayer.name}] no actions (passing)`);
            passedPlayers.add(currentPlayer.id);
            playerIndex++;
          }
        } catch (error) {
          debugLog(`[ERROR] AI for ${currentPlayer.name} crashed:`, error);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }

        step++;
      } catch (error) {
        debugLog(`[ERROR] Error in game loop step ${step}:`, error);
        step++;
      }
    }

    // ===== SAVE RESULTS =====
    debugLog('Saving results...');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const simId = `sim-${Date.now()}`;
    const logFile = path.join(outputDir, `gamelog-${simId}.txt`);
    const trackingFile = path.join(outputDir, `tracking-${simId}.json`);

    const finalScores = game.players
      .map(p => ({
        id: p.id,
        name: p.name,
        sp: p.currSP,
        np: p.currNP,
        cp: p.currCP,
        health: p.currHealth,
        isEliminated: p.isEliminated,
        heroId: p.heroId || 'none',
        gold: p.gold,
      }))
      .sort((a, b) => b.sp - a.sp);

    const trackingData = {
      gameId: simId,
      phase: game.phase,
      generation: game.generationCount,
      players: finalScores,
      winner: finalScores[0]?.name || 'none',
      steps: step,
      timestamp: new Date().toISOString(),
    };

    const gameLogs = (game as any)._simLogs || [];
    const allLogContent = debugLogs.join('\n') + '\n\n=== GAME LOGS ===\n' + gameLogs.join('\n');

    fs.writeFileSync(logFile, allLogContent, 'utf8');
    fs.writeFileSync(trackingFile, JSON.stringify(trackingData, null, 2), 'utf8');

    debugLog('\n=== SIMULATION COMPLETE ===');
    debugLog(`Game: ${simId}`);
    debugLog(`Steps: ${step}`);
    debugLog(`Final Night: ${game.generationCount}`);
    debugLog(`Phase: ${game.phase}`);
    debugLog(`Log lines: ${debugLogs.length}`);
    debugLog(`Log: ${logFile}`);
    debugLog(`Data: ${trackingFile}`);
    debugLog('\nFinal Scores:');
    for (const p of finalScores) {
      debugLog(`  ${p.name}: SP=${p.sp} | Gold=${p.gold} | Health=${p.health}${p.isEliminated ? ' 💀' : ''}`);
    }
    debugLog(`\n🏆 WINNER: ${trackingData.winner}`);
    
    // Write debug logs to file
    fs.writeFileSync(debugLogFile, debugLogs.join('\n'), 'utf8');
    debugLog(`Debug logs written to: ${debugLogFile}`);
    
  } catch (error) {
    debugLog('=== FATAL ERROR IN RUN FUNCTION ===');
    debugLog(error);
    fs.writeFileSync(debugLogFile, debugLogs.join('\n'), 'utf8');
    throw error;
  }
}

// ===== RUN =====
try {
  run();
} catch (error) {
  debugLog('=== FATAL ERROR ===');
  debugLog(error);
  fs.writeFileSync(debugLogFile, debugLogs.join('\n'), 'utf8');
  process.exit(1);
}
