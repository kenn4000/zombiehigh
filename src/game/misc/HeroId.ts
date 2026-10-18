 
import { Player, Board } from '../index'; 

export enum HeroId {
  ANITA_BANDAGE = 'anita_bandage',
  BARRY_CADE = 'barry_cade',
  PHIL_T_RAGS = 'phil_t_rags',
  ELSA_VON_TRAP = 'elsa_von_trap',
  BROCK_SLAYTON = 'brock_slayton',
  CIA_LADER = 'cia_lader',
  AL_B_TROSS = 'al_b_tross',
  ARCHY_TECT = 'archy_tect',
  LOLA_LADRA = 'lola_ladra',
  RICHARD_KIM = 'richard_kim',
  DOROTHY_DECKARD = 'dorothy_deckard',
  MIKE_U_STRONG = 'mike_u_strong'
}

// ============================================================
// HERO DATA
// ============================================================

export interface HeroData {
  id: HeroId;
  name: string;
  title: string;
  cost: number;
  image: string;
  startingGold: number;
  startingSP: number;
  startingGP?: number;
  startBonus?: 'barricade' | 'bait' | 'trap' | 'none';
  keepAllStartingCards?: boolean;
  passiveDescription: string;
  stats: [number, number, number, number]; // [Health, Melee, Barricade, Trap]
  actionN: string;
  actionC: string;
}

export const HERO_DECK: HeroData[] = [
  {
    id: HeroId.ANITA_BANDAGE,
    name: 'Anita Bandage',
    title: 'School Nurse',
    cost: 4,
    image: 'anita.jpg',
    startingGold: 36,
    startingSP: 18,
    startBonus: 'none',
    passiveDescription: 'Traps cost 3 less gold',
    stats: [4, 1, 1, 5],
    actionN: 'nurse_heal',
    actionC: 'nurse_spawn'
  },
  {
    id: HeroId.BARRY_CADE,
    name: 'Barry Cade',
    title: 'Varsity Football Star',
    cost: 0,
    image: 'barry.jpg',
    startingGold: 20,
    startingSP: 16,
    startBonus: 'barricade',
    passiveDescription: 'All players barricade success rate +1',
    stats: [4, 4, 1, 3],
    actionN: 'barry_destroy_own',
    actionC: 'barry_destroy_opponent'
  },
  {
    id: HeroId.PHIL_T_RAGS,
    name: 'Phil T. Rags',
    title: 'Janitor',
    cost: 0,
    image: 'phil.jpg',
    startingGold: 26,
    startingSP: 16,
    startBonus: 'bait',
    passiveDescription: 'Every time any trap or barricade in the same room as you is destroyed, gain 5 gold',
    stats: [4, 3, 3, 3],
    actionN: 'janitor_lose_sp',
    actionC: 'janitor_place_bait'
  },
  {
    id: HeroId.ELSA_VON_TRAP,
    name: 'Elsa Von Trap',
    title: 'Cheerleading Captain',
    cost: 0,
    image: 'elsa.jpg',
    startingGold: 22,
    startingSP: 15,
    startBonus: 'trap',
    passiveDescription: 'Your trap limit +1 and your trap successes grant an additional +1 SP, but you do not gain placement SP for any traps',
    stats: [4, 3, 2, 6],
    actionN: 'von_trap_explode',
    actionC: 'von_trap_move'
  },
  {
    id: HeroId.BROCK_SLAYTON,
    name: 'Brock Slayton',
    title: 'School Bully',
    cost: 0,
    image: 'brock.jpg',
    startingGold: 16,
    startingSP: 14,
    startBonus: 'none',
    passiveDescription: 'Whenever you kill a zombie, gain an additional 1 CP and NP',
    stats: [3, 4, 2, 1],
    actionN: 'bully_melee',
    actionC: 'bully_spawn'
  },
  {
    id: HeroId.CIA_LADER,
    name: 'Cia Lader',
    title: 'Track Star',
    cost: 4,
    image: 'cia.jpg',
    startingGold: 22,
    startingSP: 17,
    startBonus: 'none',
    passiveDescription: 'Using standard movement costs one less gold for you',
    stats: [3, 2, 3, 3],
    actionN: 'track_jump',
    actionC: 'track_move_opponent'
  },
  {
    id: HeroId.AL_B_TROSS,
    name: 'Al B. Tross',
    title: 'Substitute Teacher',
    cost: 0,
    image: 'al.jpg',
    startingGold: 38,
    startingSP: 16,
    startBonus: 'none',
    passiveDescription: 'All opponents melee, barricade, and trap success rates -1 (min 1)',
    stats: [3, 2, 3, 3],
    actionN: 'bungler_super_melee',
    actionC: 'bungler_move_trap'
  },
  {
    id: HeroId.ARCHY_TECT,
    name: 'Archy Tect',
    title: 'Valedictorian',
    cost: 0,
    image: 'archy.jpg',
    startingGold: 21,
    startingSP: 15,
    startBonus: 'none',
    passiveDescription: 'All players barricade limit +1',
    stats: [2, 2, 4, 4],
    actionN: 'nerd_barricade_gold',
    actionC: 'nerd_replace_barricade'
  },
  {
    id: HeroId.LOLA_LADRA,
    name: 'Lola Ladra',
    title: 'Lunch Lady',
    cost: 0,
    image: 'lola.jpg',
    startingGold: 24,
    startingSP: 15,
    startBonus: 'none',
    passiveDescription: 'When any player (including yourself) takes damage, gain 4 gold',
    stats: [3, 3, 3, 4],
    actionN: 'lunch_lady_solo',
    actionC: 'lunch_lady_steal'
  },
  {
    id: HeroId.RICHARD_KIM,
    name: 'Richard Kim',
    title: 'Principal',
    cost: 0,
    image: 'richard.jpg',
    startingGold: 30,
    startingSP: 18,
    startingGP: 3,
    startBonus: 'none',
    passiveDescription: '',
    stats: [3, 3, 3, 4],
    actionN: 'principal_safe',
    actionC: 'principal_spawn'
  },
  {
    id: HeroId.DOROTHY_DECKARD,
    name: 'Dorothy Deckard',
    title: 'Secretary',
    cost: 0,
    image: 'dorothy.jpg',
    startingGold: 12,
    startingSP: 16,
    startBonus: 'none',
    keepAllStartingCards: true,
    passiveDescription: '',
    stats: [3, 3, 2, 4],
    actionN: 'secretary_draw_give',
    actionC: 'secretary_discard_draw'
  },
  {
    id: HeroId.MIKE_U_STRONG,
    name: 'Mike U. Strong',
    title: 'Gym Coach',
    cost: 0,
    image: 'mike.jpg',
    startingGold: 23,
    startingSP: 16,
    startBonus: 'none',
    passiveDescription: 'All players melee success rate +1',
    stats: [4, 5, 1, 1],
    actionN: 'coach_gym_kill',
    actionC: 'coach_kick_down'
  }
];

// ============================================================
// HERO PASSIVE APPLICATION
// ============================================================

export function applyHeroPassive(heroId: HeroId, player: Player, allPlayers: Player[]): void {
  switch (heroId) {
    case HeroId.BARRY_CADE:
      for (const p of allPlayers) {
        p.barricadeEffectivenessBoost += 1;
      }
      break;

    case HeroId.ELSA_VON_TRAP:
      player.trapLimitBoost += 1;
      break;

    case HeroId.CIA_LADER:
      player.movementDiscount += 1;
      break;

    case HeroId.AL_B_TROSS:
      for (const p of allPlayers) {
        if (p !== player) {
          p.meleeEffectivenessBoost -= 1;
          p.barricadeEffectivenessBoost -= 1;
          p.trapEffectivenessBoost -= 1;
        }
      }
      break;

    case HeroId.ARCHY_TECT:
      for (const p of allPlayers) {
        p.barricadeLimitBoost += 1;
      }
      break;

    case HeroId.MIKE_U_STRONG:
      for (const p of allPlayers) {
        p.meleeEffectivenessBoost += 1;
      }
      break;

    // Heroes with action-specific passives (no global effect):
    // ANITA_BANDAGE, PHIL_T_RAGS, BROCK_SLAYTON, LOLA_LADRA, RICHARD_KIM, DOROTHY_DECKARD
    default:
      break;
  }
}

// ============================================================
// HELPER: Get hero data by ID
// ============================================================

export function getHeroData(heroId: HeroId): HeroData | undefined {
  return HERO_DECK.find(h => h.id === heroId);
}

// ============================================================
// HELPER: Get hero actions
// ============================================================

export function getHeroActions(heroId: HeroId): { actionN: string; actionC: string } | null {
  const hero = getHeroData(heroId);
  if (!hero) return null;
  return { actionN: hero.actionN, actionC: hero.actionC };
}

// ============================================================
// HELPER: Get hero display name
// ============================================================

export function getHeroDisplayName(heroId: HeroId): string {
  const names: Record<HeroId, string> = {
    [HeroId.ANITA_BANDAGE]: 'Anita Bandage',
    [HeroId.BARRY_CADE]: 'Barry Cade',
    [HeroId.PHIL_T_RAGS]: 'Phil T. Rags',
    [HeroId.ELSA_VON_TRAP]: 'Elsa Von Trap',
    [HeroId.BROCK_SLAYTON]: 'Brock Slayton',
    [HeroId.CIA_LADER]: 'Cia Lader',
    [HeroId.AL_B_TROSS]: 'Al B. Tross',
    [HeroId.ARCHY_TECT]: 'Archy Tect',
    [HeroId.LOLA_LADRA]: 'Lola Ladra',
    [HeroId.RICHARD_KIM]: 'Richard Kim',
    [HeroId.DOROTHY_DECKARD]: 'Dorothy Deckard',
    [HeroId.MIKE_U_STRONG]: 'Mike U. Strong'
  };
  return names[heroId];
}

// ============================================================
// HELPER: Get hero title
// ============================================================

export function getHeroTitle(heroId: HeroId): string {
  const titles: Record<HeroId, string> = {
    [HeroId.ANITA_BANDAGE]: 'School Nurse',
    [HeroId.BARRY_CADE]: 'Varsity Football Star',
    [HeroId.PHIL_T_RAGS]: 'Janitor',
    [HeroId.ELSA_VON_TRAP]: 'Cheerleading Captain',
    [HeroId.BROCK_SLAYTON]: 'School Bully',
    [HeroId.CIA_LADER]: 'Track Star',
    [HeroId.AL_B_TROSS]: 'Substitute Teacher',
    [HeroId.ARCHY_TECT]: 'Valedictorian',
    [HeroId.LOLA_LADRA]: 'Lunch Lady',
    [HeroId.RICHARD_KIM]: 'Principal',
    [HeroId.DOROTHY_DECKARD]: 'Secretary',
    [HeroId.MIKE_U_STRONG]: 'Gym Coach'
  };
  return titles[heroId];
}

// ============================================================
// HELPER: Get hero image
// ============================================================

export function getHeroImage(heroId: HeroId): string {
  const images: Record<HeroId, string> = {
    [HeroId.ANITA_BANDAGE]: 'anita.jpg',
    [HeroId.BARRY_CADE]: 'barry.jpg',
    [HeroId.PHIL_T_RAGS]: 'phil.jpg',
    [HeroId.ELSA_VON_TRAP]: 'elsa.jpg',
    [HeroId.BROCK_SLAYTON]: 'brock.jpg',
    [HeroId.CIA_LADER]: 'cia.jpg',
    [HeroId.AL_B_TROSS]: 'al.jpg',
    [HeroId.ARCHY_TECT]: 'archy.jpg',
    [HeroId.LOLA_LADRA]: 'lola.jpg',
    [HeroId.RICHARD_KIM]: 'richard.jpg',
    [HeroId.DOROTHY_DECKARD]: 'dorothy.jpg',
    [HeroId.MIKE_U_STRONG]: 'mike.jpg'
  };
  return images[heroId];
}