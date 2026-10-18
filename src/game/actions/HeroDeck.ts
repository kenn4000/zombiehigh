// HeroDeck.ts
import { HeroId, HERO_DECK} from '../index';

export interface HeroData {
  id: HeroId;
  name: string;
  title: string;
  cost: number; // Draft cost
  image: string;
  
  // Starting stats
  startingGold: number;
  startingSP: number;
  startingGP?: number; // Optional gold production
  
  // Starting bonus (free placement)
  startBonus?: 'barricade' | 'bait' | 'trap' | 'none';
  keepAllStartingCards?: boolean;
  
  // Passive description (for display)
  passiveDescription: string;
  
  // Stats: [Health, MeleeEffectiveness, BarricadeEffectiveness, TrapEffectiveness]
  stats: [number, number, number, number];
  
  // Action IDs (matching the ActionEffect ids)
  actionN: string; // The "N" (nice) action
  actionC: string; // The "C" (cool) action
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