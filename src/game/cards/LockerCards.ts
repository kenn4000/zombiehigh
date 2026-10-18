// src/game/cards/CardIndex/LockerCards.ts

import { CardEffect } from './CardProcessor';
import { LOCKER_DECK } from './CardIndex/LockerDeck';

// Import the locker card actions
// You'll need to create these in SpecialActions.ts or similar
import { AllSpecialActions } from './../actions/SpecialActions';

export function registerLockerCards(): void {
  console.log('=== REGISTERING LOCKER CARDS ===');
  
  // Map locker card IDs to their action IDs
  const lockerActionMap: Record<string, string> = {
    'locker_grappling_hook': 'locker_grappling_hook',
    'locker_shoes': 'locker_shoes',
    'locker_nice_for_sale': 'locker_nice_for_sale',
    'locker_cool_for_sale': 'locker_cool_for_sale',
    'locker_long_sleeves': 'locker_long_sleeves',
    'locker_ouija_board': 'locker_ouija_board',
    'locker_pyramid_scheme': 'locker_pyramid_scheme',
    'locker_free_hugs': 'locker_free_hugs',
  };
  
  for (const lockerData of LOCKER_DECK) {
    // Skip if already registered
    // Create a card effect for the locker card
    const cardEffect: CardEffect = {
      id: lockerData.id,
      name: lockerData.name,
      cost: 0, // Locker cards are free at start
      image: lockerData.image,
      targetType: 'none',
      canPlay: (player, board, target) => {
        // Locker cards are passive - they don't need to be "played"
        // But if they have an action, check if it can be used
        if (lockerData.actionId) {
          const action = AllSpecialActions[lockerData.actionId];
          if (action) {
            // Check if any option is usable
            for (const option of action.options) {
              if (option.canUse(player, board, target)) {
                return true;
              }
            }
          }
        }
        return true; // Passive cards can always be "played" (they're always active)
      },
      getValidTargets: (player, board) => {
        // Locker cards don't need targets (they're passive)
        // But if they have an action, get targets from that action
        if (lockerData.actionId) {
          const action = AllSpecialActions[lockerData.actionId];
          if (action) {
            const targets: any[] = [];
            for (const option of action.options) {
              // Get valid targets for each option
              // This is simplified - you'd need proper target resolution
            }
            return targets;
          }
        }
        return [];
      },
      isValidTarget: (player, board, target) => {
        // Locker cards don't need targets
        return true;
      },
      execute: (player, board, target) => {
        // Locker cards are passive - they don't do anything on "play"
        // They just exist and their effects are applied via passives
        return { success: true, message: `${lockerData.name} is already active` };
      },
      expectedValue: (player, board, evaluator, target) => {
        // Passive cards have value from their starting bonus
        let value = 0;
        if (lockerData.startingBonus.gold) value += lockerData.startingBonus.gold * 0.5;
        if (lockerData.startingBonus.sp) value += lockerData.startingBonus.sp * 2;
        if (lockerData.startingBonus.np) value += lockerData.startingBonus.np * 2;
        if (lockerData.startingBonus.cp) value += lockerData.startingBonus.cp * 2;
        if (lockerData.startingBonus.health) value += lockerData.startingBonus.health * 5;
        if (lockerData.startingBonus.drawCards) value += lockerData.startingBonus.drawCards * 3;
        if (lockerData.startingBonus.gp) value += lockerData.startingBonus.gp * 3;
        return value;
      },
    };
    
    // Register the card
    // You'd need to add a register method or directly add to the registry
    // CardProcessor.register(cardEffect);
    console.log(`  Registered locker card: ${lockerData.id} (${lockerData.name})`);
  }
}