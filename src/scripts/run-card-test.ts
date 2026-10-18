// src/scripts/run-card-test.ts

import * as fs from 'fs';
import * as path from 'path';
import { Game } from '../game/core/Game';
import { Player } from '../game/core/Player';
import {Board} from '../game/board/Board';
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

// ===== CONFIGURATION =====
const MAX_STEPS = 60;
const PLAYER_COUNT = 2;

// ===== CARD TO TEST =====
const CARD_TO_TEST = 'missing_hallpass';

// ===== FILE LOGGING =====
const logLines: string[] = [];
const logFile = path.join(__dirname, '../../data/debug', `card-test-${CARD_TO_TEST}-${Date.now()}.txt`);

function log(msg: string): void {
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
    console.log(`\n📄 Log saved to: ${logFile}`);
  } catch (err) {
    console.error('Failed to save log:', err);
  }
}

// ===== BOARD PRINTER =====
function printBoard(board: any, title: string = 'BOARD STATE'): void {
  log(`\n=== ${title} ===`);
  log('    0  1  2  3  4  5  6  7  8  9  10');
  for (let y = 0; y < 10; y++) {
    let row = `${y.toString().padStart(2)} `;
    for (let x = 0; x < 11; x++) {
      const cell = board.getCell(x, y);
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
  log('========================');
}

// ===== PLAYER STATS PRINTER =====
function printPlayerStats(player: Player, title: string = 'PLAYER STATS'): void {
  log(`\n=== ${title} ===`);
  log(`  Name: ${player.name}`);
  log(`  Gold: ${player.gold}`);
  log(`  SP: ${player.currSP}`);
  log(`  NP: ${player.currNP}`);
  log(`  CP: ${player.currCP}`);
  log(`  GP: ${player.currGP}`);
  log(`  Health: ${player.currHealth}`);
  log(`  Eliminated: ${player.isEliminated}`);
  log(`  Cards in hand: ${player.hand.cards.length}`);
  log(`  Cards: ${player.hand.cards.map((c: any) => c.name).join(', ')}`);
  log('========================');
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

// ===== CARD SPECIFIC SETUP =====
function setupCardConditions(cardId: string, board: Board, player: Player, allPlayers: Player[]): void {
  log(`\n=== SETUP FOR CARD: ${cardId} ===`);
  
  switch (cardId) {
    case 'missing_hallpass':
      // Needs: 7 gold, adjacent zombie that can move
      for (const p of allPlayers) {
        p.gold = 15;
        p.currSP = 20;
        p.currHealth = 3;
        log(`  ✅ Gave ${p.name} 15 gold and 20 SP for Missing Hallpass`);
      }
      
      // Place player with adjacent zombie
      const pos = board.getPlayerPosition(player);
      if (pos) {
        const currentCell = board.getCell(pos.x, pos.y);
        if (currentCell) currentCell.clear();
        
        // Place player at (5,5) with empty cells around
        const playerCell = board.getCell(5, 5);
        if (playerCell && !playerCell.isHole && playerCell.isEmpty) {
          playerCell.setPlayer(player);
          log(`  ✅ Moved player to (5,5)`);
          
          // Place a zombie adjacent to the player (at 6,5)
          const zombieCell = board.getCell(6, 5);
          if (zombieCell && !zombieCell.isHole && zombieCell.isEmpty) {
            const result = ZombieSpawner.spawnAtTarget(board, zombieCell);
            if (result.success) {
              log(`  ✅ Placed zombie at (6,5) adjacent to player`);
              
              // Place an empty target cell for the zombie to move to (7,5)
              const targetCell = board.getCell(7, 5);
              if (targetCell && !targetCell.isHole && targetCell.isEmpty) {
                log(`  ✅ Target cell available at (7,5) for zombie to move to`);
              }
            }
          }
        }
      }
      break;
      
    case 'long_jump':
      // ... existing ...
      break;
      
    case 'in_memory_of':
      // ... existing ...
      break;
      
    case 'open_locker':
      // ... existing ...
      break;
      
    default:
      for (const p of allPlayers) {
        p.gold = 20;
        p.currSP = 20;
        p.currHealth = 3;
        log(`  ✅ Generic setup: gave ${p.name} 20 gold and 20 SP`);
      }
      break;
  }
}

function runCardTest(): void {
  log(`=== CARD TEST: ${CARD_TO_TEST} ===`);
  log(`Max steps: ${MAX_STEPS}`);
  log(`Log file: ${logFile}\n`);

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
    log(`\nUsing hero: ${getHeroName(randomHero)}`);

    // ===== ASSIGN HERO =====
    for (const player of players) {
      player.heroId = randomHero;
      player.gold = 10;
      player.currSP = 15;
      player.currHealth = 3;
      player.rawMeleeSuccessRate = 3;
      player.rawBarricadeSuccessRate = 3;
      player.rawTrapSuccessRate = 3;
    }

    // ===== BUILD DECK =====
    log('Building card deck...');
    const allCardDefs = CardProcessor.getAll();
    const deckCards: any[] = [];
    const testCardDef = allCardDefs.find(c => c.id === CARD_TO_TEST);

    if (!testCardDef) {
      log(`❌ ERROR: Card '${CARD_TO_TEST}' not found in registry!`);
      return;
    }

    // Add test card
    deckCards.push({
      id: `${testCardDef.id}-${Date.now()}`,
      cardId: testCardDef.id,
      name: testCardDef.name,
      cost: testCardDef.cost,
      image: testCardDef.image || 'default.png',
      targetType: testCardDef.targetType,
    });
    log(`  Added test card: ${testCardDef.name} (${testCardDef.cost} gold)`);

    // Add filler cards
    const fillerCards = allCardDefs.filter(c => c.id !== CARD_TO_TEST && c.cost <= 2);
    const shuffledFiller = shuffleArray(fillerCards);
    for (let i = 0; i < 5 && i < shuffledFiller.length; i++) {
      const card = shuffledFiller[i];
      deckCards.push({
        id: `${card.id}-${i}`,
        cardId: card.id,
        name: card.name,
        cost: card.cost,
        image: card.image || 'default.png',
        targetType: card.targetType,
      });
    }
    log(`  Added ${deckCards.length - 1} filler cards`);

    const cardDrawer = new CardDrawer();
    (game as any).cardManager = cardDrawer;
    cardDrawer.initializeGameDeck(deckCards);
    log(`Deck initialized with ${cardDrawer.getGameDeckSize()} cards`);

    // ===== OVER-INFLATE CARD VALUE =====
    const originalCard = CardProcessor.get(CARD_TO_TEST);
    if (originalCard) {
      log(`\n=== OVER-INFLATING CARD VALUE ===`);
      const originalExpectedValue = originalCard.expectedValue;
      log(`  Original expectedValue function exists: ${!!originalExpectedValue}`);
      originalCard.expectedValue = (player: Player, board: Board, evaluator: any, target?: any) => {
        return 999;
      };
      log(`  ✅ ExpectedValue set to 999`);
      (originalCard as any)._originalExpectedValue = originalExpectedValue;
    }

    // ===== PLACE PLAYERS =====
    log('\n=== PLACING PLAYER ===');
    // Find a good starting position
    const allCells = board.getAllCells().filter(c => c.isEmpty && !c.isHole);
    let bestPos = allCells[0];
    let bestNeighbors = 0;
    for (const cell of allCells) {
      const neighbors = board.getNeighbors(cell).filter(n => n.isEmpty && !n.isHole);
      if (neighbors.length > bestNeighbors) {
        bestNeighbors = neighbors.length;
        bestPos = cell;
      }
    }
    const player = players[0];
    board.placePlayer(player, bestPos.x, bestPos.y);
    log(`${player.name} placed at (${bestPos.x}, ${bestPos.y}) with ${bestNeighbors} open neighbors`);

    // ===== DEAL CARDS =====
    log('\n=== DEALING CARDS ===');
    for (const p of players) {
      while (p.hand.cards.length < 5) {
        const card = cardDrawer.drawGameCard();
        if (card) {
          p.addCard(card);
        } else {
          break;
        }
      }
      log(`${p.name} has ${p.hand.cards.length} cards in hand`);
      log(`  Cards: ${p.hand.cards.map((c: any) => c.name).join(', ')}`);
    }

    // ===== SETUP CARD CONDITIONS =====
    for (const p of players) {
      setupCardConditions(CARD_TO_TEST, board, p, players);
    }

    // ===== PRINT INITIAL BOARD AND STATS =====
    printBoard(board, 'INITIAL BOARD STATE');
    for (const p of players) {
      printPlayerStats(p, `INITIAL STATS: ${p.name}`);
    }

    // ===== ZOMBIE MANAGER =====
    log('\n=== INITIALIZING ZOMBIE MANAGER ===');
    const zombieManager = new ZombieSimManager(board, players, {
      onTrapKill: (ownerId, x, y) => {},
      onTrapFailed: () => {},
      onBaitConsumed: (ownerId, x, y) => {},
      onPlayerAttacked: (playerId, x, y, fromCell) => {
        const p = game.getPlayerById(playerId);
        if (p) {
          EventManager.getInstance().emit('playerDamaged', {
            player: p,
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
    // Attach zombieManager to game
    (game as any).zombieManager = zombieManager;
    log('ZombieManager created and attached to game');

    // ===== AI CONTROLLER =====
    log('\n=== CREATING AI CONTROLLER ===');
    const gameManager = new GameManager(game);
    const aiControllers = new Map();
    for (const p of players) {
      const ai = new AIController(gameManager, board, players, 1, game);
      aiControllers.set(p.id, ai);
      log(`  Created AI for ${p.name}`);
    }

    // ===== INITIAL ZOMBIE SPAWN =====
    log('\n=== INITIAL ZOMBIE SPAWN ===');
    game._generationCount = 1;
    const initialZombieCount = 1;
    log(`Spawning ${initialZombieCount} initial zombie...`);
    for (let i = 0; i < initialZombieCount; i++) {
      const result = ZombieSpawner.spawnRandom(board);
      if (result.success) {
        const cell = result.spawnedCells[0];
        log(`  Spawned zombie at (${cell.x}, ${cell.y})`);
      }
    }

    for (const p of players) {
      if (p.actionManager) {
        p.actionManager.setCurrentNight(1);
      }
    }

    // ===== PRINT BOARD AFTER ZOMBIE SPAWN =====
    printBoard(board, 'BOARD AFTER INITIAL ZOMBIE SPAWN');

    // ===== GAME LOOP =====
    log('\n=== STARTING GAME LOOP ===\n');
    let step = 0;
    let playerIndex = 0;
    const passedPlayers = new Set<string>();

    while (step < MAX_STEPS) {
      if (game.isGameOver()) {
        log(`Game over!`);
        break;
      }

      const alivePlayers = game.players.filter(p => !p.isEliminated);
      if (passedPlayers.size >= alivePlayers.length && alivePlayers.length > 0) {
        log(`\n[Night ${game.generationCount}] Running zombie phase...`);
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

      log(`[Step ${step}] ${currentPlayer.name}'s turn (Gold: ${currentPlayer.gold}, SP: ${currentPlayer.currSP})`);

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
          log(`[Step ${step}] ✅ ${currentPlayer.name} took action successfully`);
          playerIndex++;
        } else {
          log(`[Step ${step}] ❌ ${currentPlayer.name} had no actions (passing)`);
          passedPlayers.add(currentPlayer.id);
          playerIndex++;
        }
      } catch (error) {
        log(`[Step ${step}] ERROR: AI for ${currentPlayer.name} crashed: ${error}`);
        passedPlayers.add(currentPlayer.id);
        playerIndex++;
      }

      step++;
    }

    // ===== PRINT FINAL BOARD AND STATS =====
    printBoard(board, 'FINAL BOARD STATE');
    for (const p of players) {
      printPlayerStats(p, `FINAL STATS: ${p.name}`);
    }

    // ===== RECORD RESULTS =====
    log('\n=== GAME RESULTS ===');
    for (const p of game.players) {
      log(`  ${p.name}: SP=${p.currSP}, Gold=${p.gold}, Health=${p.currHealth}${p.isEliminated ? ' 💀' : ''}`);
    }

    log('\n=== TEST CARD CHECK ===');
    log(`  Card tested: ${CARD_TO_TEST}`);
    let cardPlayed = false;
    for (const p of players) {
      const hasCard = p.hand.cards.some((c: any) => c.cardId === CARD_TO_TEST);
      if (!hasCard) {
        cardPlayed = true;
        log(`  ✅ ${CARD_TO_TEST} was played by ${p.name} (no longer in hand)!`);
      }
    }
    if (!cardPlayed) {
      log(`  ❌ ${CARD_TO_TEST} is still in hand - wasn't played`);
    }

  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error}`);
    console.error(error);
  }

  // ===== RESTORE ORIGINAL CARD VALUE =====
  const card = CardProcessor.get(CARD_TO_TEST);
  if (card && (card as any)._originalExpectedValue) {
    card.expectedValue = (card as any)._originalExpectedValue;
    delete (card as any)._originalExpectedValue;
    log(`\n  ✅ Restored original expectedValue for ${CARD_TO_TEST}`);
  }

  // ===== SAVE LOG =====
  saveLog();
  log('✅ Card test complete!');
}

// ===== RUN =====
try {
  registerAllCards();
  runCardTest();
} catch (error) {
  console.error('Fatal error:', error);
  saveLog();
  process.exit(1);
}