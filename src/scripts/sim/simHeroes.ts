// src/scripts/sim/simHeroes.ts

import { Player } from '../../game/core/Player';
import { Game } from '../../game/core/Game';
import { HeroId } from '../../game/misc/HeroId';
import { HERO_DECK, getHeroConfig, HeroConfig } from '../../game/misc/HeroLoader';
import { AllSpecialActions } from '../../game/actions/SpecialActions';
import { ActionManager } from '../../game/actions/ActionProcessor';

// ===== SHUFFLE FUNCTION =====
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
const heroIdMap: Record<string, HeroId> = {
  'anita_bandage': HeroId.ANITA_BANDAGE,
  'barry_cade': HeroId.BARRY_CADE,
  'phil_t_rags': HeroId.PHIL_T_RAGS,
  'elsa_von_trap': HeroId.ELSA_VON_TRAP,
  'brock_slayton': HeroId.BROCK_SLAYTON,
  'cia_lader': HeroId.CIA_LADER,
  'al_b_tross': HeroId.AL_B_TROSS,
  'archy_tect': HeroId.ARCHY_TECT,
  'lola_ladra': HeroId.LOLA_LADRA,
  'richard_kim': HeroId.RICHARD_KIM,
  'dorothy_deckard': HeroId.DOROTHY_DECKARD,
  'mike_u_strong': HeroId.MIKE_U_STRONG,
};
export function assignSimHeroes(players: Player[], game: Game): void {
  // Get all hero configs
  const heroConfigs = [...HERO_DECK];
  
  // Shuffle
  const shuffledHeroes = shuffleArray(heroConfigs);
  console.log('=== ASSIGNING HEROES (SHUFFLED) ===');

  // Map HeroId to action ID strings (for special actions)
  const heroActionMap: Record<string, string> = {
    'anita_bandage': 'anita_bandage',
    'barry_cade': 'barry_cade',
    'phil_t_rags': 'phil_t_rags',
    'elsa_von_trap': 'elsa_von_trap',
    'brock_slayton': 'brock_slayton',
    'cia_lader': 'cia_lader',
    'al_b_tross': 'al_b_tross',
    'archy_tect': 'archy_tect',
    'lola_ladra': 'lola_ladra',
    'richard_kim': 'richard_kim',
    'dorothy_deckard': 'dorothy_deckard',
    'mike_u_strong': 'mike_u_strong'
  };

  const heroIdMap: Record<string, HeroId> = {
  'anita_bandage': HeroId.ANITA_BANDAGE,
  'barry_cade': HeroId.BARRY_CADE,
  'phil_t_rags': HeroId.PHIL_T_RAGS,
  'elsa_von_trap': HeroId.ELSA_VON_TRAP,
  'brock_slayton': HeroId.BROCK_SLAYTON,
  'cia_lader': HeroId.CIA_LADER,
  'al_b_tross': HeroId.AL_B_TROSS,
  'archy_tect': HeroId.ARCHY_TECT,
  'lola_ladra': HeroId.LOLA_LADRA,
  'richard_kim': HeroId.RICHARD_KIM,
  'dorothy_deckard': HeroId.DOROTHY_DECKARD,
  'mike_u_strong': HeroId.MIKE_U_STRONG,
};
  // Assign heroes to players
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const heroConfig = shuffledHeroes[i % shuffledHeroes.length];
    
    if (heroConfig) {
      // Set hero ID
      player.heroId = heroIdMap[heroConfig.id];
      
      // ===== CALL THE PICK FUNCTION - THIS SETS EVERYTHING =====
      heroConfig.onPick(player, game);
      
      // Log the results
      console.log(`  ${player.name}: ${heroConfig.name} (Gold: ${player.gold}, SP: ${player.currSP}, Health: ${player.currHealth})`);
      console.log(`    Raw/Effective - Melee: ${player.rawMeleeSuccessRate}/${player.getMeleeEffectiveness()}`);
      console.log(`    Raw/Effective - Trap: ${player.rawTrapSuccessRate}/${player.getTrapEffectiveness()}`);
      console.log(`    Raw/Effective - Barricade: ${player.rawBarricadeSuccessRate}/${player.getBarricadeEffectiveness()}`);
      
      // Add special action if hero has one
      const actionId = heroActionMap[heroConfig.id];
      if (actionId) {
        const heroAction = AllSpecialActions[actionId];
        if (heroAction) {
          if (!player.actionManager) {
            player.actionManager = new ActionManager();
          }
          player.actionManager.addAction(heroAction);
          console.log(`    → Added hero action: ${heroAction.name}`);
        } else {
          console.log(`    ⚠️ WARNING: Hero action '${actionId}' not found`);
        }
      }
    }
  }
  
  // Print final global effect summary
  console.log('\n=== GLOBAL EFFECTS SUMMARY ===');
  for (const player of players) {
    const heroName = HERO_DECK.find(h => h.id === player.heroId)?.name || player.heroId || 'None';
    console.log(`  ${player.name} (${heroName}):`);
    console.log(`    Melee: ${player.getMeleeEffectiveness()} (global: ${player.meleeEffectivenessBoost || 0})`);
    console.log(`    Trap: ${player.getTrapEffectiveness()} (global: ${player.trapEffectivenessBoost || 0})`);
    console.log(`    Barricade: ${player.getBarricadeEffectiveness()} (global: ${player.barricadeEffectivenessBoost || 0})`);
    console.log(`    Gold: ${player.gold}, SP: ${player.currSP}, Health: ${player.currHealth}`);
  }
}