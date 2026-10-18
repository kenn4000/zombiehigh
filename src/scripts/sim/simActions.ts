// src/scripts/sim/simActions.ts

import { ActionProcessor } from '../../game/actions/ActionProcessor';
import { AllSpecialActions } from '../../game/actions/SpecialActions';

export function registerAllActions(): void {
  console.log('=== REGISTERING ACTIONS ===');
  
  // Register all special actions
  for (const [actionId, action] of Object.entries(AllSpecialActions)) {
    ActionProcessor.register(action);
    console.log(`  Registered action: ${actionId} (${action.name})`);
  }
  
  console.log(`Total actions registered: ${ActionProcessor.getAll().length}`);
}