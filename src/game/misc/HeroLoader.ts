// src/game/heroes/HeroSystem.ts

import { Player } from '../core/Player';
import { Game } from '../core/Game';
import { EventManager, StructureDestroyedEvent, ZombieKilledEvent, StructurePlacedEvent, PlayerDamagedEvent } from '../misc/EventManager';
import { HeroId } from '../misc/HeroId';

// ============================================================
// HERO CONFIGURATION
// ============================================================

export interface HeroConfig {
  id: string;
  name: string;
  startingGold: number;
  startingSP: number;
  startingGP?: number;
  description: string;
  onPick: (player: Player, game: Game) => void;
}

// ============================================================
// HERO PICK FUNCTIONS
// ============================================================

function pickAnitaBandage(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 4;
  player.gold = 36;
  player.currSP = 18; 
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 1;
  player.rawBarricadeSuccessRate = 1;
  player.rawTrapSuccessRate = 5;

  player.trapDiscount=3;
  
  console.log(`[Hero] ${player.name} picked Anita Bandage`);
}

function pickBarryCade(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 4;
  player.gold = 20;
  player.currSP = 16;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 4;
  player.rawBarricadeSuccessRate = 1;
  player.rawTrapSuccessRate = 3;
  
  player.barricadeDiscount=1;
  // Global passive +1 barricade effectiveness for all opponents
  for (const p of game.players) {
    if (p !== player) {
      p.barricadeEffectivenessBoost = (p.barricadeEffectivenessBoost || 0) + 1;
    }
  }
  
  console.log(`[Hero] ${player.name} picked Barry Cade`);
}

function pickPhilTRags(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 4;
  player.gold = 26;
  player.currSP = 16;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 3;
  player.rawBarricadeSuccessRate = 3;
  player.rawTrapSuccessRate = 3;
  
  // Passive: Every time any trap or barricade in the same room as you is destroyed, gain 5 gold
  const handler = (data: StructureDestroyedEvent) => {
    const playerPos = game.board.getPlayerPosition(player);
    if (!playerPos) return;
    
    const playerCell = game.board.getCell(playerPos.x, playerPos.y);
    if (!playerCell) return;
    
    // Check if the destroyed structure is in the same room
    if (playerCell.roomId === data.roomId) {
      player.gold += 5;
      console.log(`[${player.name}] Janitor Passive: +5 gold from ${data.type} destroyed in same room! (Gold: ${player.gold})`);
    }
  };
  
  // Store for cleanup
  player._passiveHandlers = player._passiveHandlers || [];
  player._passiveHandlers.push({
    event: 'structureDestroyed',
    handler: handler,
  });
  
  EventManager.getInstance().on('structureDestroyed', handler);
  
  console.log(`[Hero] ${player.name} picked Phil T. Rags`);
}

function pickElsaVonTrap(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 4;
  player.gold = 22;
  player.currSP = 15;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 3;
  player.rawBarricadeSuccessRate = 2;
  player.rawTrapSuccessRate = 6;

  // Passive: +1 trap limit (can place more traps)
  player.trapLimit = (player.trapLimit || 0) + 1; 

  // Trap placement and kill bonuses are applied by the shared trap logic.
  
  console.log(`[Hero] ${player.name} picked Elsa Von Trap`);
}

function pickBrockSlayton(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 16;
  player.currSP = 14;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 4;
  player.rawBarricadeSuccessRate = 2;
  player.rawTrapSuccessRate = 1;

  // Passive already coded into kills (extra CP+NP on zombie kills)
  
  console.log(`[Hero] ${player.name} picked Brock Slayton`);
}

function pickCiaLader(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 22;
  player.currSP = 17;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 2;
  player.rawBarricadeSuccessRate = 3;
  player.rawTrapSuccessRate = 3;

  // Passive: movement costs -1 gold
  player.movementDiscount = (player.movementDiscount || 0) + 1;
  
  console.log(`[Hero] ${player.name} picked Cia Lader`);
}

function pickAlBTross(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 38;
  player.currSP = 16;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 2;
  player.rawBarricadeSuccessRate = 3;
  player.rawTrapSuccessRate = 3;
  
  // Global: All other players get -1 to all effectivenesses
  for (const p of game.players) {
    if (p !== player) {
      p.meleeEffectivenessBoost = (p.meleeEffectivenessBoost || 0) - 1;
      p.trapEffectivenessBoost = (p.trapEffectivenessBoost || 0) - 1;
      p.barricadeEffectivenessBoost = (p.barricadeEffectivenessBoost || 0) - 1;
    }
  }
  
  console.log(`[Hero] ${player.name} picked Al B. Tross `);
}

function pickArchyTect(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 2;
  player.gold = 21;
  player.currSP = 15;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 2;
  player.rawBarricadeSuccessRate = 4;
  player.rawTrapSuccessRate = 4;

  player.barricadeDiscount=4;
  
  // Global passive: all players barricade limit +1
  for (const p of game.players) {
    if (p !== player) {
      p.barricadeLimitBoost = (p.barricadeLimitBoost || 0) + 1;
    }
  }
  
  console.log(`[Hero] ${player.name} picked Archy Tect`);
}

function pickLolaLadra(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 24;
  player.currSP = 15;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 3;
  player.rawBarricadeSuccessRate = 3;
  player.rawTrapSuccessRate = 4;
  
  // Passive: When any player takes damage, gain 4 gold
  const damageHandler = (data: PlayerDamagedEvent) => {
    player.addGold(4);
    console.log(`[${player.name}] Empathy: +4 gold from ${data.player.name} taking damage! (Gold: ${player.gold})`);
  };
  
  EventManager.getInstance().on('playerDamaged', damageHandler);
  
  (player._passiveHandlers ??= []).push({
    event: 'playerDamaged',
    handler: damageHandler,
  });
  
  console.log(`[Hero] ${player.name} picked Lola Ladra `);
}

function pickRichardKim(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 30;
  player.currSP = 18;
  player.currGP = 3;
  
  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 3;
  player.rawBarricadeSuccessRate = 3;
  player.rawTrapSuccessRate = 4;
  
  console.log(`[Hero] ${player.name} picked Richard Kim`);
}

function pickDorothyDeckard(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 3;
  player.gold = 12;
  player.currSP = 16;

  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 3;
  player.rawBarricadeSuccessRate = 2;
  player.rawTrapSuccessRate = 4;
  
  // Cards cheaper to purchase by 1
  player.cardPurchaseDiscount = (player.cardPurchaseDiscount || 0) + 1; 

  console.log(`[Hero] ${player.name} picked Dorothy Deckard`);
}

function pickMikeUStrong(player: Player, game: Game): void {
  // Base stats
  player.currHealth = 4;
  player.gold = 23;
  player.currSP = 16;

  // Raw effectiveness (base values before passives)
  player.rawMeleeSuccessRate = 5;
  player.rawBarricadeSuccessRate = 1;
  player.rawTrapSuccessRate = 1;
  
  // Global: All other players get +1 to melee effectiveness (Coach's motivation)
  for (const p of game.players) {
    if (p !== player) {
      p.meleeEffectivenessBoost = (p.meleeEffectivenessBoost || 0) + 1;
    }
  }
  
  console.log(`[Hero] ${player.name} picked Mike U. Strong`);
}

// ============================================================
// HERO DECK
// ============================================================

export const HERO_DECK: HeroConfig[] = [
  {
    id: 'anita_bandage',
    name: 'Anita Bandage',
    startingGold: 36,
    startingSP: 18,
    description: 'healer',
    onPick: pickAnitaBandage,
  },
  {
    id: 'barry_cade',
    name: 'Barry Cade',
    startingGold: 20,
    startingSP: 16,
    description: 'Global +1 barricade effectiveness',
    onPick: pickBarryCade,
  },
  {
    id: 'phil_t_rags',
    name: 'Phil T. Rags',
    startingGold: 26,
    startingSP: 16,
    description: '+5 gold when structures in same room are destroyed',
    onPick: pickPhilTRags,
  },
  {
    id: 'elsa_von_trap',
    name: 'Elsa Von Trap',
    startingGold: 22,
    startingSP: 15,
    description: '+1 trap limit, no trap placement SP, +1 SP on trap kills',
    onPick: pickElsaVonTrap,
  },
  {
    id: 'brock_slayton',
    name: 'Brock Slayton',
    startingGold: 16,
    startingSP: 14,
    description: '+1 CP and NP on zombie kills',
    onPick: pickBrockSlayton,
  },
  {
    id: 'cia_lader',
    name: 'Cia Lader',
    startingGold: 22,
    startingSP: 17,
    description: 'Movement costs -1 gold',
    onPick: pickCiaLader,
  },
  {
    id: 'al_b_tross',
    name: 'Al B. Tross',
    startingGold: 38,
    startingSP: 16,
    description: 'Global -1 to all effectiveness for enemies',
    onPick: pickAlBTross,
  },
  {
    id: 'archy_tect',
    name: 'Archy Tect',
    startingGold: 21,
    startingSP: 15,
    description: 'Global +1 barricade limit',
    onPick: pickArchyTect,
  },
  {
    id: 'lola_ladra',
    name: 'Lola Ladra',
    startingGold: 24,
    startingSP: 15,
    description: '+4 gold when any player takes damage',
    onPick: pickLolaLadra,
  },
  {
    id: 'richard_kim',
    name: 'Richard Kim',
    startingGold: 30,
    startingSP: 18,
    description: 'Starts with 3 GP',
    onPick: pickRichardKim,
  },
  {
    id: 'dorothy_deckard',
    name: 'Dorothy Deckard',
    startingGold: 12,
    startingSP: 16,
    description: 'Cards cost 1 less to purchase',
    onPick: pickDorothyDeckard,
  },
  {
    id: 'mike_u_strong',
    name: 'Mike U. Strong',
    startingGold: 23,
    startingSP: 16,
    description: 'global +1 melee for allies',
    onPick: pickMikeUStrong,
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getHeroConfig(heroId: string): HeroConfig | undefined {
  return HERO_DECK.find(h => h.id === heroId);
}

export function getHeroName(heroId: string): string {
  const config = getHeroConfig(heroId);
  return config ? config.name : heroId;
}