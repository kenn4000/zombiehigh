// src/game/misc/LockerDeck.ts

import { Player, Board, CardDrawer, StructurePlacement, ZombieSpawner} from '../../index'; 

export interface LockerCardData {
  id: string;
  name: string;
  image: string;
  startingBonus: {
    gold?: number;
    sp?: number;
    np?: number;
    cp?: number;
    health?: number;
    gp?: number;
    drawCards?: number;
  };
  passiveDescription: string;
  startAction?: 'barricade' | 'bait' | 'trap' | 'zombie' | 'none';
  startActionDescription?: string;
  actionId?: string;
}

export const LOCKER_DECK: LockerCardData[] = [
  // ============================================================
  // PAGE 1
  // ============================================================
  {
    id: 'charity_fund',
    name: 'Charity Fund',
    image: 'charityfund.jpg',
    startingBonus: { gold: 27 },
    passiveDescription: '',
    startAction: 'none'
  },
  {
    id: 'childs_tool_set',
    name: "Child's Tool Set",
    image: 'childtool.jpg',
    startingBonus: { gold: 9 },
    passiveDescription: 'Your barricade effectiveness -1 (min 1). When any of your barricades are destroyed, draw 1 card',
    startAction: 'none'
  },
  {
    id: 'cool_for_sale',
    name: 'Cool for Sale',
    image: 'coolsale.png',
    startingBonus: { cp: 2 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_cool_for_sale'
  },
  {
    id: 'dirty_gym_socks',
    name: 'Dirty Gym Socks',
    image: 'gymsocks.jpg',
    startingBonus: { gold: 11 },
    passiveDescription: 'Your bait radius increases by 2 tiles, but bait costs 1 more gold',
    startAction: 'none'
  },
  {
    id: 'dog_tags',
    name: 'Dog Tags',
    image: 'dogtag.jpg',
    startingBonus: { gold: 6, cp: 1 },
    passiveDescription: 'Gain 2 gold whenever a zombie is killed by any player',
    startAction: 'zombie',
    startActionDescription: 'Place a zombie on any open tile'
  },
  {
    id: 'free_hugs_tshirt',
    name: 'Free Hugs T-Shirt',
    image: 'freehugs.png',
    startingBonus: { cp: 1 },
    passiveDescription: 'Gain 2 NP per adjacent opponent, OR gain 1 CP per adjacent zombie',
    startAction: 'none',
    actionId: 'locker_free_hugs'
  },
  {
    id: 'fresh_wound_dressing',
    name: 'Fresh Wound Dressing',
    image: 'freshdress.jpg',
    startingBonus: { health: -1, sp: 3 },
    passiveDescription: '',
    startAction: 'none'
  },
  {
    id: 'gas_leak',
    name: 'Gas Leak',
    image: 'gasleak.jpg',
    startingBonus: { health: -1, sp: 1, gp: 2 },
    passiveDescription: "All player's melee attack effectiveness -1",
    startAction: 'none'
  },

  // ============================================================
  // PAGE 2
  // ============================================================
  {
    id: 'grappling_hook',
    name: 'Grappling Hook',
    image: 'grappling.png',
    startingBonus: {},
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_grappling_hook'
  },
  {
    id: 'leather_jacket',
    name: 'Leather Jacket',
    image: 'leatherjacket.jpg',
    startingBonus: { cp: 2, gold: 9 },
    passiveDescription: 'When you gain any amount of CP (including this), gain 2 gold',
    startAction: 'none'
  },
  {
    id: 'long_sleeves',
    name: 'Long Sleeves',
    image: 'longsleeve.png',
    startingBonus: { gold: 10, drawCards: 2 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_long_sleeves'
  },
  {
    id: 'nice_for_sale',
    name: 'Nice for Sale',
    image: 'nicesale.png',
    startingBonus: { np: 2 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_nice_for_sale'
  },
  {
    id: 'ouija_board',
    name: 'Ouija Board',
    image: 'ouija.jpg',
    startingBonus: { sp: 2, gold: 2 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_ouija_board'
  },
  {
    id: 'part_time_job',
    name: 'Part Time Job',
    image: 'parttime.jpg',
    startingBonus: { gp: 3, sp: -1, gold: 11 },
    passiveDescription: '',
    startAction: 'none'
  },
  {
    id: 'permanent_record',
    name: 'Permanent Record',
    image: 'permrecord.jpg',
    startingBonus: { gold: 6, drawCards: 6 },
    passiveDescription: '',
    startAction: 'none'
  },
  {
    id: 'pyramid_scheme',
    name: 'Pyramid Scheme',
    image: 'pyramid.jpg',
    startingBonus: { drawCards: 3 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_pyramid_scheme'
  },

  // ============================================================
  // PAGE 3
  // ============================================================
  {
    id: 'quality_over_quantity',
    name: 'Quality over Quantity',
    image: 'quality.jpg',
    startingBonus: { gold: 4 },
    passiveDescription: 'Your barricade effectiveness +1, but your barricade limit -1',
    startAction: 'barricade',
    startActionDescription: 'Place one free barricade anywhere on the map'
  },
  {
    id: 'roller_backpack',
    name: 'Roller Backpack',
    image: 'roller.jpg',
    startingBonus: { np: 2, gold: 8 },
    passiveDescription: 'When you gain any amount of NP (including this), gain 2 gold',
    startAction: 'none'
  },
  {
    id: 'scout_training',
    name: 'Scout Training',
    image: 'scouttrain.png',
    startingBonus: { gp: 2, sp: -1, gold: 4 },
    passiveDescription: 'Your trap effectiveness +1, but your trap limit -1',
    startAction: 'trap',
    startActionDescription: 'Place one free trap'
  },
  {
    id: 'sharpened_stick',
    name: 'Sharpened Stick',
    image: 'sharpstick.png',
    startingBonus: { sp: 1 },
    passiveDescription: 'Your melee attack effectiveness +1',
    startAction: 'none'
  },
  {
    id: 'shoes',
    name: 'Shoes',
    image: 'shoes.jpg',
    startingBonus: { gold: 7 },
    passiveDescription: '',
    startAction: 'none',
    actionId: 'locker_shoes'
  },
  {
    id: 'vitamins',
    name: 'Vitamins',
    image: 'vitamins.jpg',
    startingBonus: { health: 1, gold: 7, drawCards: 1 },
    passiveDescription: '',
    startAction: 'none'
  },
  {
    id: 'wall_in_a_box',
    name: 'Wall-in-a-Box',
    image: 'wallinbox.png',
    startingBonus: { gold: 18 }, 
    passiveDescription: '',
    startAction: 'barricade',
    startActionDescription: 'Place one free barricade'
  }
];
 
export function getLockerData(id: string): LockerCardData | undefined {
  return LOCKER_DECK.find(l => l.id === id);
}

/**
 * Apply ALL effects of a locker card to a player
 * - Starting bonuses (gold, SP, NP, CP, health, GP, draw cards)
 * - Passive effects
 * - Start actions (place barricade, trap, bait, or zombie)
 */
export function applyLockerCard(
  cardId: string, 
  player: Player, 
  allPlayers: Player[],
  board?: Board
): void {
  const card = getLockerData(cardId);
  if (!card) {
    console.log(`[LockerCard] WARNING: Card ${cardId} not found in LOCKER_DECK`);
    return;
  }

  console.log(`[LockerCard] Applying ${card.name} to ${player.name}`);

  // ===== 1. APPLY STARTING BONUSES =====
  if (card.startingBonus.gold) {
    player.gold += card.startingBonus.gold;
    console.log(`  +${card.startingBonus.gold} Gold (now ${player.gold})`);
  }
  
  if (card.startingBonus.sp) {
    player.currSP += card.startingBonus.sp;
    console.log(`  +${card.startingBonus.sp} SP (now ${player.currSP})`);
  }
  
  if (card.startingBonus.np) {
    player.currNP += card.startingBonus.np;
    console.log(`  +${card.startingBonus.np} NP (now ${player.currNP})`);
  }
  
  if (card.startingBonus.cp) {
    player.currCP += card.startingBonus.cp;
    console.log(`  +${card.startingBonus.cp} CP (now ${player.currCP})`);
  }
  
  if (card.startingBonus.health) {
    player.currHealth += card.startingBonus.health;
    console.log(`  ${card.startingBonus.health >= 0 ? '+' : ''}${card.startingBonus.health} Health (now ${player.currHealth})`);
  }
  
  if (card.startingBonus.gp) {
    player.currGP += card.startingBonus.gp;
    console.log(`  +${card.startingBonus.gp} GP (now ${player.currGP})`);
  }
  
  if (card.startingBonus.drawCards) {
    const drawn = CardDrawer.drawCards(player, card.startingBonus.drawCards);
    console.log(`  Drew ${drawn.length} cards (now ${player.hand.cards.length} in hand)`);
  }

  // ===== 2. APPLY PASSIVE EFFECTS =====
  // (Keep your existing switch statement)
  switch (cardId) {
    case 'childs_tool_set':
      player.barricadeEffectivenessBoost = (player.barricadeEffectivenessBoost || 0) - 1;
      player.childsToolSetActive = true;
      console.log(`  Passive: Barricade effectiveness -1, draw on barricade destroyed`);
      break;
      
    case 'dirty_gym_socks':
      player.baitRadiusBoost = (player.baitRadiusBoost || 0) + 2;
      player.baitDiscount = (player.baitDiscount || 0) - 1;
      console.log(`  Passive: Bait radius +2, bait costs 1 more gold`);
      break;
      
    case 'dog_tags':
      player.dogTagsActive = true;
      console.log(`  Passive: Gain 2 gold when any zombie is killed`);
      break;
      
    case 'gas_leak':
      for (const p of allPlayers) {
        if (p !== player) {
          p.meleeEffectivenessBoost = (p.meleeEffectivenessBoost || 0) - 1;
        }
      }
      console.log(`  Passive: All other players melee effectiveness -1`);
      break;
      
    case 'leather_jacket':
      player.leatherJacketActive = true;
      console.log(`  Passive: Gain 2 gold when gaining CP`);
      break;
      
    case 'quality_over_quantity':
      player.barricadeEffectivenessBoost = (player.barricadeEffectivenessBoost || 0) + 1;
      player.barricadeLimit = Math.max(1, (player.barricadeLimit || 3) - 1);
      console.log(`  Passive: Barricade effectiveness +1, barricade limit -1`);
      break;
      
    case 'roller_backpack':
      player.rollerBackpackActive = true;
      console.log(`  Passive: Gain 2 gold when gaining NP`);
      break;
      
    case 'scout_training':
      player.trapEffectivenessBoost = (player.trapEffectivenessBoost || 0) + 1;
      player.trapLimit = Math.max(1, (player.trapLimit || 3) - 1);
      console.log(`  Passive: Trap effectiveness +1, trap limit -1`);
      break;
      
    case 'sharpened_stick':
      player.meleeEffectivenessBoost = (player.meleeEffectivenessBoost || 0) + 1;
      console.log(`  Passive: Melee effectiveness +1`);
      break;

    case 'free_hugs_tshirt':
      player.freeHugsActive = true;
      console.log(`  Passive: Gain NP/CP from adjacent opponents/zombies`);
      break;
      
    default:
      // No passive for this card
      break;
  }

  // ===== 3. EXECUTE START ACTION =====
  if (card.startAction && card.startAction !== 'none' && board) {
    console.log(`  Start Action: ${card.startActionDescription || card.startAction}`);
    
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      console.log(`  ⚠️ Player not on board, cannot perform start action`);
      return;
    }

    switch (card.startAction) {
      case 'barricade': {
        // Find a valid empty cell near the player (within 2 tiles)
        const validCells = board.getAllCells().filter(c => 
          c.isEmpty && !c.isHole && 
          Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y) <= 2
        );
        if (validCells.length > 0) {
          const target = validCells[Math.floor(Math.random() * validCells.length)];
          const result = StructurePlacement.placeBarricadeWithEffects(board, player, target);
          if (result.success) {
            console.log(`  ✅ Placed free barricade at (${target.x},${target.y})`);
          } else {
            console.log(`  ❌ Failed to place barricade: ${result.message}`);
          }
        } else {
          console.log(`  ⚠️ No valid cells for barricade within 2 tiles`);
        }
        break;
      }
      
      case 'trap': {
        const validCells = board.getAllCells().filter(c => 
          c.isEmpty && !c.isHole && 
          Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y) <= 2
        );
        if (validCells.length > 0) {
          const target = validCells[Math.floor(Math.random() * validCells.length)];
          const result = StructurePlacement.placeTrapWithEffects(board, player, target);
          if (result.success) {
            console.log(`  ✅ Placed free trap at (${target.x},${target.y})`);
          } else {
            console.log(`  ❌ Failed to place trap: ${result.message}`);
          }
        } else {
          console.log(`  ⚠️ No valid cells for trap within 2 tiles`);
        }
        break;
      }
      
      case 'zombie': {
        // Find a valid empty cell anywhere on the board (not near players)
        const validCells = board.getAllCells().filter(c => 
          c.isEmpty && !c.isHole && !c.hasPlayer && !c.hasZombie
        );
        if (validCells.length > 0) {
          const target = validCells[Math.floor(Math.random() * validCells.length)];
          const result = ZombieSpawner.spawnAtTarget(board, target);
          if (result.success) {
            console.log(`  ✅ Placed zombie at (${target.x},${target.y})`);
          } else {
            console.log(`  ❌ Failed to place zombie: ${result.message}`);
          }
        } else {
          console.log(`  ⚠️ No valid cells for zombie placement`);
        }
        break;
      }
      
      case 'bait': {
        const validCells = board.getAllCells().filter(c => 
          c.isEmpty && !c.isHole && 
          Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y) <= 3
        );
        if (validCells.length > 0) {
          const target = validCells[Math.floor(Math.random() * validCells.length)];
          const result = StructurePlacement.placeBaitWithEffects(board, player, target);
          if (result.success) {
            console.log(`  ✅ Placed free bait at (${target.x},${target.y})`);
          } else {
            console.log(`  ❌ Failed to place bait: ${result.message}`);
          }
        } else {
          console.log(`  ⚠️ No valid cells for bait within 3 tiles`);
        }
        break;
      }
      
      default:
        console.log(`  ⚠️ Unknown start action: ${card.startAction}`);
    }
  }
  
  console.log(`[LockerCard] ✅ ${card.name} applied to ${player.name}`);
}

// Keep the old function for backward compatibility if needed
export function applyLockerPassive(cardId: string, player: Player, allPlayers: Player[]): void {
  applyLockerCard(cardId, player, allPlayers);
}
export const LOCKER_ACTION_MAP: Record<string, string> = {
  'cool_for_sale': 'locker_cool_for_sale',
  'free_hugs_tshirt': 'locker_free_hugs',
  'grappling_hook': 'locker_grappling_hook',
  'long_sleeves': 'locker_long_sleeves',
  'ouija_board': 'locker_ouija_board',
  'pyramid_scheme': 'locker_pyramid_scheme',
  'shoes': 'locker_shoes',
  'nice_for_sale': 'locker_nice_for_sale',
};

export function getLockerActionId(lockerCardId: string): string | undefined {
  return LOCKER_ACTION_MAP[lockerCardId];
}