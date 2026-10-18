// src/scripts/run-locker-debug.ts

import * as fs from 'fs';
import * as path from 'path';
import { getLockerData, getLockerActionId } from '../game/cards/CardIndex/LockerDeck';

// ===== CONFIGURATION =====
const PLAYER_COUNT = 2;
const MAX_STEPS = 500;
const STARTING_CARD_COUNT = 5;

// ===== FILE LOGGING =====
const logLines: string[] = [];
const logFile = path.join(__dirname, '../../data/debug', `locker-debug-${Date.now()}.txt`);

function log(msg: string): void {
  logLines.push(msg);
}

function logToConsole(msg: string): void {
  console.log(msg);
  logLines.push(msg);
}

function saveLog(): void {
  try {
    const dir = path.dirname(logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(logFile, logLines.join('\n'), 'utf8');
    console.log(`\n📄 Full log saved to: ${logFile}`);
    console.log(`📊 ${logLines.length} lines written`);
  } catch (err) {
    console.error('Failed to save log:', err);
  }
}

// ===== IMPORTS =====
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
  getRandomStartPositions,
  createSimBoard,
} from './sim';
import { AllSpecialActions } from '../game/actions/SpecialActions';
import { ActionManager } from '../game/actions/ActionProcessor';

// ===== LOCKER CARDS WITH ACTIONS =====
const ACTION_LOCKER_CARDS = [  
  { id: 'shoes', name: 'Shoes', actionId: 'shoes' },
  { id: 'nice_for_sale', name: 'Nice for Sale', actionId: 'nice_for_sale' },
];

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

function runDebugGame(): void {
  logToConsole('=== LOCKER CARD DEBUG GAME (DIRECT ACTION ADDITION) ===');
  logToConsole(`Player count: ${PLAYER_COUNT}`);
  logToConsole(`Log file: ${logFile}`);
  logToConsole('Running... (full log will be saved to file)\n');

  log('=== LOCKER CARD DEBUG GAME (DIRECT ACTION ADDITION) ===');
  log(`Player count: ${PLAYER_COUNT}`);
  log(`Max steps: ${MAX_STEPS}`);
  log(`Starting card count: ${STARTING_CARD_COUNT}\n`);

  try {
    // ===== CREATE BOARD =====
    log('Creating board...');
    const board = createSimBoard();
    log('Board created');

    // ===== CREATE PLAYERS =====
    log(`Creating ${PLAYER_COUNT} players...`);
    const players: Player[] = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const player = new Player(`cpu-${i + 1}`, `CPU-${i + 1}`);
      (player as any).isBot = true;
      players.push(player);
      log(`  Created ${player.name}`);
    }

    // ===== CREATE GAME =====
    log('Creating game...');
    const game = new Game();
    game.board = board;
    game.players = players;
    (game as any)._simLogs = [];
    log('Game created');

    // ===== REGISTER CARDS AND ACTIONS =====
    log('Registering cards and actions...');
    try {
      registerAllCards();
      registerAllActions();
      CardProcessor.setGame(game);
      log('Cards and actions registered');
    } catch (err) {
      log(`❌ Error registering cards: ${err}`);
      throw err;
    }

    // ===== PICK RANDOM HERO =====
    const randomHero = HEROES[Math.floor(Math.random() * HEROES.length)];
    log(`\nUsing hero: ${getHeroName(randomHero)} for all players\n`);

    // ===== ASSIGN SAME HERO TO ALL PLAYERS =====
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

    // ===== BUILD DECK =====
    log('Building card deck...');
    const allCardDefs = CardProcessor.getAll();
    log(`Found ${allCardDefs.length} card definitions`);

    const deckCards: any[] = [];
    for (const cardDef of allCardDefs) {
      // Skip all locker cards (we'll add actions directly)
      if (cardDef.id.includes('locker') || 
          cardDef.id === 'cool_for_sale' || 
          cardDef.id === 'free_hugs_tshirt' ||
          cardDef.id === 'grappling_hook' ||
          cardDef.id === 'long_sleeves' ||
          cardDef.id === 'ouija_board' ||
          cardDef.id === 'pyramid_scheme' ||
          cardDef.id === 'shoes' ||
          cardDef.id === 'nice_for_sale') {
        continue;
      }
 
        deckCards.push({
          id: `${cardDef.id}`,
          cardId: cardDef.id,
          name: cardDef.name,
          cost: cardDef.cost,
          image: cardDef.image || 'default.png',
          targetType: cardDef.targetType,
        });
    }

    const cardDrawer = new CardDrawer();
    (game as any).cardManager = cardDrawer;
    cardDrawer.initializeGameDeck(deckCards);
    log(`Deck initialized with ${cardDrawer.getGameDeckSize()} cards`);

    // ===== DIRECTLY ADD LOCKER ACTIONS TO PLAYERS =====
    log('\n=== DIRECTLY ADDING LOCKER ACTIONS ===');
    
    const shuffledActionCards = shuffleArray([...ACTION_LOCKER_CARDS]);
    const playerLockerCards: Map<string, string> = new Map();

   for (let i = 0; i < players.length && i < shuffledActionCards.length; i++) {
  const player = players[i];
  const lockerCard = shuffledActionCards[i];

  log(`Adding ${lockerCard.name} to ${player.name}`);

  // Get the action ID from the locker card data
  const actionId = lockerCard.actionId; // e.g., 'locker_cool_for_sale'
  const action = AllSpecialActions[actionId];
  
  if (action) {
    if (!player.actionManager) {
      player.actionManager = new ActionManager();
    }
    player.actionManager.addAction(action);
    playerLockerCards.set(player.id, lockerCard.id);
    log(`  ✅ Added action: ${actionId} to ${player.name}`);
  } else {
    log(`  ❌ ERROR: Action ${actionId} not found in AllSpecialActions!`);
  }
}

    // ===== DEAL STARTING CARDS =====
    log('\n=== DEALING STARTING CARDS ===');
    for (const player of players) {
      while (player.hand.cards.length < STARTING_CARD_COUNT) {
        const card = cardDrawer.drawGameCard();
        if (card) {
          player.addCard(card);
        } else {
          break;
        }
      }
      log(`${player.name} has ${player.hand.cards.length} cards in hand`);
      log(`  Cards: ${player.hand.cards.map(c => c.name).join(', ')}`);
    }

    // ===== VERIFY ACTIONS ARE AVAILABLE =====
    log('\n=== VERIFYING LOCKER ACTIONS ===');
    for (const player of players) {
      if (player.actionManager) {
        const actions = player.actionManager.getAvailableActions(player, board);
        log(`${player.name} has ${actions.length} available actions:`);
        for (const action of actions) {
          log(`  - ${action.id}: ${action.name}`);
        }
      } else {
        log(`${player.name} has NO ActionManager!`);
      }
    }

    // ===== PLACE PLAYERS =====
    log('\n=== PLACING PLAYERS ===');
    const startPositions = getRandomStartPositions(board, players.length);
    for (let i = 0; i < players.length && i < startPositions.length; i++) {
      const [x, y] = startPositions[i];
      game.board.placePlayer(players[i], x, y);
      log(`${players[i].name} placed at (${x}, ${y})`);
    }

    // ===== ZOMBIE MANAGER =====
    log('\n=== INITIALIZING ZOMBIE MANAGER ===');
    const zombieManager = new ZombieSimManager(board, players, {
      onTrapKill: (ownerId, x, y) => {
        log(`[Trap Kill] by ${ownerId} at (${x},${y})`);
      },
      onTrapFailed: () => {
        log(`[Trap Failed]`);
      },
      onBaitConsumed: (ownerId, x, y) => {
        log(`[Bait Consumed] by ${ownerId} at (${x},${y})`);
      },
      onPlayerAttacked: (playerId, x, y, fromCell) => {
        const player = game.getPlayerById(playerId);
        if (player) {
          log(`[Attack] ${player.name} attacked at (${x},${y})`);
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
      log: (msg: string) => {
        log(`[Zombie] ${msg}`);
      },
    });
    log('ZombieManager created');

    // ===== AI CONTROLLERS =====
    log('\n=== CREATING AI CONTROLLERS ===');
    const gameManager = new GameManager(game);
    const aiControllers = new Map();
    for (const player of players) {
      const ai = new AIController(gameManager, board, players, 1, game);
      aiControllers.set(player.id, ai);
      log(`  Created AI for ${player.name}`);
    }

    // ===== INITIAL ZOMBIE SPAWN =====
    log('\n=== INITIAL ZOMBIE SPAWN ===');
    game._generationCount = 1;
    const initialZombieCount = 0;
    log(`Spawning ${initialZombieCount} initial zombies...`);
    for (let i = 0; i < initialZombieCount; i++) {
      const result = ZombieSpawner.spawnRandom(board);
      if (result.success) {
        const cell = result.spawnedCells[0];
        log(`  Spawned zombie at (${cell.x}, ${cell.y})`);
      }
    }

    for (const player of players) {
      if (player.actionManager) {
        player.actionManager.setCurrentNight(1);
      }
    }

    // ===== PRINT BOARD =====
    log('\n=== INITIAL BOARD STATE ===');
    log('    0  1  2  3  4  5  6  7  8  9  10');
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
      log(row);
    }
    log('========================\n');

    // ===== GAME LOOP =====
    log('=== STARTING GAME LOOP ===\n');
    let step = 0;
    let playerIndex = 0;
    const passedPlayers = new Set<string>();

    while (step < MAX_STEPS) {
      if (game.isGameOver()) {
        log(`Game over! (isGameOver = true)`);
        break;
      }

      const alivePlayers = game.players.filter(p => !p.isEliminated);
      if (passedPlayers.size >= alivePlayers.length && alivePlayers.length > 0) {
        log(`\n[Night ${game.generationCount}] Running zombie phase...`);
        const spawned = zombieManager.zombiePhase(game.generationCount);
        log(`  Zombies spawned: ${spawned}`);

        for (const p of game.players) {
          if (!p.isEliminated) {
            p.addSPs(1);
            const goldEarned = p.currSP + p.currGP;
            p.addGold(goldEarned);
            log(`  ${p.name} gained 1 SP (now ${p.currSP}) and ${goldEarned} gold`);
          }
        }

        game._generationCount++;
        const newNight = game.generationCount;
        log(`  Advancing to Night ${newNight}`);
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
        log(`[Step ${step}] No valid player found, resetting`);
        passedPlayers.clear();
        playerIndex = 0;
        step++;
        continue;
      }

      log(`[Step ${step}] ${currentPlayer.name}'s turn (Gold: ${currentPlayer.gold}, SP: ${currentPlayer.currSP})`);

      const ai = aiControllers.get(currentPlayer.id);
      if (!ai) {
        log(`[Step ${step}] No AI for ${currentPlayer.name}, passing`);
        passedPlayers.add(currentPlayer.id);
        playerIndex++;
        step++;
        continue;
      }

      try {
        const success = ai.takeAction(currentPlayer);
        if (success) {
          log(`[Step ${step}] ${currentPlayer.name} took action successfully`);
          playerIndex++;
        } else {
          log(`[Step ${step}] ${currentPlayer.name} had no actions (passing)`);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }
      } catch (error) {
        log(`[Step ${step}] ERROR: AI for ${currentPlayer.name} crashed: ${error}`);
        passedPlayers.add(currentPlayer.id);
        playerIndex++;
      }

      step++;
      
      if (step > MAX_STEPS) {
        log(`Reached max steps (${MAX_STEPS}), breaking`);
        break;
      }
    }

    // ===== RECORD RESULTS =====
    log('\n=== GAME RESULTS ===');
    const winner = game.players
      .filter(p => !p.isEliminated)
      .sort((a, b) => b.currSP - a.currSP)[0];

    if (winner) {
      log(`🏆 Winner: ${winner.name} with SP: ${winner.currSP}`);
      log(`Winner ID: ${winner.id}`);

      const winnerLockerCard = playerLockerCards.get(winner.id);
      if (winnerLockerCard) {
        const cardName = ACTION_LOCKER_CARDS.find(c => c.id === winnerLockerCard)?.name || winnerLockerCard;
        log(`✅ Winner has locker card: ${cardName}`);
      } else {
        log(`❌ Winner ${winner.name} has NO locker card recorded!`);
      }
    }

    log('\n=== FINAL SCORES ===');
    for (const p of game.players) {
      log(`  ${p.name}: SP=${p.currSP}, Gold=${p.gold}, Health=${p.currHealth}${p.isEliminated ? ' 💀' : ''}`);
    }

  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error}`);
    console.error(error);
  }

  // ===== SAVE LOG =====
  saveLog();
  logToConsole('✅ Debug game complete!');
}

// ===== RUN =====
try {
  runDebugGame();
} catch (error) {
  console.error('Fatal error:', error);
  saveLog();
  process.exit(1);
}