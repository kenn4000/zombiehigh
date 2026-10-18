import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage19(): void {

  // ============================================================
  // STAYING AWAKE
  // ============================================================
  CardProcessor.register({
    id: 'staying_awake',
    name: 'Staying Awake',
    cost: 5,
    image: 'staying_awake.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addSPs(1);
      CardDrawer.drawCards(p, 1);
      CardDrawer.discardDraw(p, 0);
      return { success: true, message: 'Played Card: Staying Awake - gained 1 SP, drew 1 card then discarded 1' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(5);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('staying_awake')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // STEM CLUB - FIXED (no walls)
  // ============================================================
  CardProcessor.register({
    id: 'stem_club',
    name: 'STEM Club',
    cost: 12,
    image: 'stem_club.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const hasTrap = board.getAllCells().some(c => c.hasTrap && c.structureOwner === p);
      const hasBarricade = board.getAllBarricades().some(c => c.structureOwner === p);
      return (hasTrap || hasBarricade) && p.canAffordCard(12);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(12);
      p.addSPs(2);
      p.trapDiscount += 1;
      p.barricadeDiscount += 1;
      return { success: true, message: 'Played Card: STEM Club - gained 2 SP, traps and barricades cost 1 less' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getSP(p, evaluator.onNight);
      const passiveValue = CardHelper.getPassiveValue(2.6, evaluator.onNight);
      return cardReward + passiveValue - p.costCard(12);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('stem_club')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // STOLEN WALLET
  // ============================================================
  CardProcessor.register({
    id: 'stolen_wallet',
    name: 'Stolen Wallet',
    cost: 6,
    image: 'stolen_wallet.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 10 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addGold(16);
      return { success: true, message: 'Played Card: Stolen Wallet - gained 16 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 16 - p.costCard(6);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('stolen_wallet')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // STUDENT DISCOUNT
  // ============================================================
  CardProcessor.register({
    id: 'student_discount',
    name: 'Student Discount',
    cost: 6,
    image: 'student_discount.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 3 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      p.baitDiscount += 1;
      return { success: true, message: 'Played Card: Student Discount - gained 1 SP, bait costs 1 less gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      
      const remainingNights = CardHelper.getNightsRemaining(evaluator.onNight);
      const baitRadius = p.getBaitRadius ? p.getBaitRadius() : 3;
      const baitPerNight = baitRadius / 10;
      const expectedBaits = remainingNights * baitPerNight;
      const passiveValue = expectedBaits * 1;
      
      return cardReward + passiveValue - p.costCard(6);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('student_discount')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // STUDENT OF THE MONTH
  // ============================================================
  CardProcessor.register({
    id: 'student_of_the_month',
    name: 'Student of the Month',
    cost: 4,
    image: 'student_of_the_month.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 3 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addNPs(2);
      return { success: true, message: 'Played Card: Student of the Month - gained 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getNP(p) - p.costCard(4);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('student_of_the_month')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // STUDY GROUP
  // ============================================================
  CardProcessor.register({
    id: 'study_group',
    name: 'Study Group',
    cost: 6,
    image: 'study_group.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 21 && p.canAffordCard(6),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(6);
      p.addSPs(1);
      CardDrawer.drawCards(p, 2);
      return { success: true, message: 'Played Card: Study Group - gained 1 SP and drew 2 cards' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 2) - p.costCard(6);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('study_group')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // TAKING A BRIBE
  // ============================================================
  CardProcessor.register({
    id: 'taking_a_bribe',
    name: 'Taking a Bribe',
    cost: 2,
    image: 'taking_a_bribe.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 3 && p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addGold(12);
      p.loseNPs(2);
      return { success: true, message: 'Played Card: Taking a Bribe - gained 12 Gold, lost 2 NP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 12 - 2 * CardHelper.getNP(p) - p.costCard(2);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('taking_a_bribe')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // TAKING A NAP - FIXED (no walls)
  // ============================================================
  CardProcessor.register({
    id: 'taking_a_nap',
    name: 'Taking a Nap',
    cost: 2,
    image: 'taking_a_nap.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 2 && p.canAffordCard(2);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addSPs(2);
      return { success: true, message: 'Played Card: Taking a Nap - gained 2 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 2 * CardHelper.getSP(p, evaluator.onNight) - p.costCard(2);
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('taking_a_nap')!.execute(p, board);
      return result;
    }
  });
}