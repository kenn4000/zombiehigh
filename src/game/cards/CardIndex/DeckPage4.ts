// src/game/cards/CardIndex/DeckPage4.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { GameConstants } from '../../misc/GameConstants';

export function registerPage4(): void {

  // ============================================================
  // CHANGE IN CHARACTER
  // ============================================================
  CardProcessor.register({
    id: 'change_in_character',
    name: 'Change In Character',
    cost: 2,
    image: 'change_in_character.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 4 && p.currCP >= 2 && p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addSPs(1);
      p.addNPs(1);
      p.loseCPs(2);
      return { success: true, message: 'Played Card: Change in Character - gained 1 SP, 1 NP, and lost 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - 2 * CardHelper.getCP(p) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - 2 * CardHelper.getCP(p) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('change_in_character')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CHEAT SHEET
  // ============================================================
  CardProcessor.register({
    id: 'cheat_sheet',
    name: 'Cheat Sheet',
    cost: 4,
    image: 'cheat_sheet.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      CardDrawer.drawKeep(p, 4, 2);
      return { 
        success: true, 
        message: 'Played Card: Cheat Sheet - Draw 4 cards, keep 2 (select cards)', 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 4) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 4) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      // This card requires the player to select which cards to keep
      const result = CardProcessor.get('cheat_sheet')!.execute(p, board);
      return result;
    }
  });
// ============================================================
// CHECK ITS POCKETS 
// ============================================================
CardProcessor.register({
  id: 'check_its_pockets',
  name: 'Check Its Pockets',
  cost: 7,
  image: 'check_its_pockets.jpg',
  targetType: 'none',
  canPlay: (p, board) => p.canAffordCard(7),
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(7);
    p.addGPs(1);
    p.meleeKillDraw = true;
    return { success: true, message: 'Played Card: Check Its Pockets - gained 1 GP, and will draw one card after each successful melee kill' };
  },
  expectedValue: (p, board, evaluator, target) => {
    // GP value decreases over time
    const gpValue = 12 - evaluator.onNight;
    
    // Calculate melee kill probability per night
    // Melee effectiveness is 1-6, success rate = effectiveness/6
    // We assume ~1 melee attempt per night (on average)
    const meleeEffectiveness = p.getMeleeEffectiveness();
    const successRate = meleeEffectiveness / 6;
    
    // Expected kills per night = successRate * (attempts per night)
    // Assume 0.5 melee attempts per night (sometimes you have adjacent zombies)
    const attemptsPerNight = 0.5;
    const expectedKillsPerNight = successRate * attemptsPerNight;
    
    // Each successful melee kill gives 1 card draw
    // Card draw value depends on player state and remaining nights
    const cardDrawValuePerKill = 3; // Base value of drawing 1 card
    
    // Passive value = expected kills per night * card draw value * nights remaining
    const nightsRemaining = CardHelper.getNightsRemaining(evaluator.onNight);
    const passiveValue = expectedKillsPerNight * cardDrawValuePerKill * nightsRemaining;
    
    return gpValue + passiveValue - p.costCard(7);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const gpValue = CardHelper.getNightsRemaining( evaluator.onNight);
    
    const meleeEffectiveness = p.getMeleeEffectiveness();
    const successRate = meleeEffectiveness / 8;
    const attemptsPerNight = 2*successRate;
    const expectedKillsPerNight = successRate * attemptsPerNight;
    const cardDrawValuePerKill = GameConstants.CARD_VALUE; 
    const passiveValue = expectedKillsPerNight * cardDrawValuePerKill * gpValue;
    
    const value = gpValue + passiveValue - p.costCard(7);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('check_its_pockets')!.execute(p, board);
    return result;
  }
});

  // ============================================================
  // CHICKEN DINNER
  // ============================================================
  CardProcessor.register({
    id: 'chicken_dinner',
    name: 'Chicken Dinner',
    cost: 4,
    image: 'chicken_dinner.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const alive = board.getPlayers().filter(pl => !pl.isEliminated);
      return alive.every(pl => pl.currSP <= p.currSP) && p.canAffordCard(4);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addSPs(1);
      p.addNPs(1);
      return { success: true, message: 'Played Card: Chicken Dinner - gained 1 SP and 1 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return   CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value =   CardHelper.getSP(p, evaluator.onNight) + CardHelper.getNP(p) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('chicken_dinner')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CLAIRVOYANCE
  // ============================================================
  CardProcessor.register({
    id: 'clairvoyance',
    name: 'Clairvoyance',
    cost: 6,
    image: 'clairvoyance.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.hand.cards.length === 1 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      CardDrawer.drawCards(p, 4);
      return { success: true, message: 'Played Card: Clairvoyance - gained 1 SP and drew 4 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 4) - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 4) - p.costCard(6);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('clairvoyance')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CLASS CLOWN
  // ============================================================
  CardProcessor.register({
    id: 'class_clown',
    name: 'Class Clown',
    cost: 3,
    image: 'class_clown.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 3 && p.canAffordCard(3),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addCPs(2);
      return { success: true, message: 'Played Card: Class Clown - Gained 2 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getCP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 2 * CardHelper.getCP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('class_clown')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CLASS CURVE
  // ============================================================
  CardProcessor.register({
    id: 'class_curve',
    name: 'Class Curve',
    cost: 3,
    image: 'class_curve.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(3),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addNPs(1);
      const game = CardProcessor.getGame();
      if (game) {
        for (const player of game.players) {
          if (!player.isEliminated) player.addGold(3);
        }
      }
      return { success: true, message: 'Played Card: Class Curve - Gained 1 NP and all players gained 3 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const npValue = CardHelper.getNP(p);
      const goldValue = 3;
      const opponentValue = -1.5;
      return npValue + goldValue + opponentValue - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const npValue = CardHelper.getNP(p);
      const goldValue = 3;
      const opponentValue = -1.5;
      const value = npValue + goldValue + opponentValue - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('class_curve')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CLASSIC FICTION
  // ============================================================
  CardProcessor.register({
    id: 'classic_fiction',
    name: 'Classic Fiction',
    cost: 5,
    image: 'classic_fiction.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Library' && p.currNP >= 6 && p.canAffordCard(5) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addNPs(4);
      return { success: true, message: 'Played Card: Classic Fiction - Gained 4 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getNP(p) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getNP(p) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('classic_fiction')!.execute(p, board);
      return result;
    }
  });
}