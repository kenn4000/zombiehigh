// src/game/cards/CardIndex/DeckPage5.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { applyLockerCard, getLockerData } from './LockerDeck';

export function registerPage5(): void {

  // ============================================================
  // CONFIDENT FIRST STEP
  // ============================================================
  CardProcessor.register({
    id: 'confident_first_step',
    name: 'Confident First Step',
    cost: 6,
    image: 'confident_first_step.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 2 && p.canAffordCard(6);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p) => {
      p.spendCard(6);
      p.addSPs(1);
      p.actionManager.addAction(AllSpecialActions.confident_first_step);
      return {
        success: true,
        message: 'Played Card: Confident First Step - gained 1 SP and unlocked its free-move action'
      };
    },
    expectedValue: (p, board, evaluator) => {
      return CardHelper.getSP(p, evaluator.onNight) + 1 - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      return { target: null, value: CardHelper.getSP(p, evaluator.onNight) + 1 - p.costCard(6) };
    },
    autoExecute: (p, board, evaluator) => {
      return CardProcessor.get('confident_first_step')!.execute(p, board);
    }
  });

  // ============================================================
  // COPIED NOTES
  // ============================================================
  CardProcessor.register({
    id: 'copied_notes',
    name: 'Copied Notes',
    cost: 3,
    image: 'copied_notes.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      return board.getAllCells().some(c => c.hasTrap && c.structureOwner === p) && p.canAffordCard(3);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addSPs(1);
      return { success: true, message: 'Played Card: Copied Notes - gained 1 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('copied_notes')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CPR CLASS
  // ============================================================
  CardProcessor.register({
    id: 'cpr_class',
    name: 'CPR Class',
    cost: 2,
    image: 'cpr_class.jpg',
    targetType: 'player',
    canPlay: (p, board) => {
      if (!p.canAffordCard(2) || !board) return false;
      const playerPos = board.getPlayerPosition(p);
      if (!playerPos) return false;

      const roomId = board.getCellRoom(playerPos.x, playerPos.y);
      if (!roomId) return false;

      const game = CardProcessor.getGame();
      return !!game?.players.some((pl: Player) =>
        !pl.isEliminated &&
        pl !== p &&
        board.getPlayerPosition(pl) &&
        board.getCellRoom(board.getPlayerPosition(pl)!.x, board.getPlayerPosition(pl)!.y) === roomId
      );
    },
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game || !board) return [];

      const playerPos = board.getPlayerPosition(p);
      if (!playerPos) return [];
      const roomId = board.getCellRoom(playerPos.x, playerPos.y);
      if (!roomId) return [];

      return game.players.filter((pl: Player) => {
        if (pl.isEliminated || pl === p) return false;
        const pos = board.getPlayerPosition(pl);
        return !!pos && board.getCellRoom(pos.x, pos.y) === roomId;
      });
    },
    isValidTarget: (p, board, target) => {
      if (!(target instanceof Player) || target.isEliminated || target === p || !board) return false;
      const playerPos = board.getPlayerPosition(p);
      const targetPos = board.getPlayerPosition(target);
      if (!playerPos || !targetPos) return false;
      return board.getCellRoom(playerPos.x, playerPos.y) === board.getCellRoom(targetPos.x, targetPos.y);
    },
    execute: (p, board, target) => {
      p.spendCard(2);
      p.addNPs(3);
      let targetName = 'no target';
      if (target && target instanceof Player && !target.isEliminated) {
        target.addHealths(1);
        targetName = target.name;
      }
      return { 
        success: true, 
        message: `Played Card: CPR Class - gained 3 NP and healed ${targetName}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const npValue = 3 * CardHelper.getNP(p);
      let healValue = 0;
      if (target && target instanceof Player && !target.isEliminated && target !== p) {
        healValue = CardHelper.getHealthValue(target, evaluator.onNight) * 0.4;
      }
      return npValue + healValue - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) return { target: null, value: 0 };
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let lowestHealth = Infinity;
      for (const target of targets) {
        if (target.currHealth < lowestHealth) {
          lowestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      const npValue = 3 * CardHelper.getNP(p);
      const healValue = CardHelper.getHealthValue(bestTarget, evaluator.onNight) * 0.4;
      const value = npValue + healValue - p.costCard(2);
      
      return { target: bestTarget, value };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game) {
        return { success: false, message: 'Game not available' };
      }
      
      const targets = game.players.filter((pl: Player) => !pl.isEliminated && pl !== p);
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid targets available' };
      }
      
      let bestTarget = targets[0];
      let lowestHealth = Infinity;
      for (const target of targets) {
        if (target.currHealth < lowestHealth) {
          lowestHealth = target.currHealth;
          bestTarget = target;
        }
      }
      
      console.log(`[CPR Class] Auto-executing with target ${bestTarget.name} (health: ${bestTarget.currHealth})`);
      return CardProcessor.get('cpr_class')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // CRAM SESSION
  // ============================================================
  CardProcessor.register({
    id: 'cram_session',
    name: 'Cram Session',
    cost: 2,
    image: 'cram_session.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(2),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2); 
      CardDrawer.drawKeep(p, 3, 1);
      return { 
        success: true, 
        message: 'Played Card: Cram Session - Draw 3 cards, keep 1 (select cards)' 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('cram_session')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // CROWDED HALLS
  // ============================================================
  CardProcessor.register({
    id: 'crowded_halls',
    name: 'Crowded Halls',
    cost: 6,
    image: 'crowded_halls.jpg',
    targetType: 'path',
    maxPathLength: 2,
    canPlay: (p, board) => p.canAffordCard(6),
    getValidTargets: (p, board) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      return paths.filter(pathInfo => pathInfo.path.length === 3).map(pathInfo => pathInfo.path);
    },
    isValidTarget: (p, board, target) => Array.isArray(target) && target.length === 3,
    execute: (p, board, target) => {
      if (!target || target.length < 3) {
        return { success: false, message: 'Invalid path selected' };
      }
      if (!p.canAffordCard(6)) return { success: false, message: 'Need 6 gold' };

      const countedNeighbors = new Set<string>();
      let currentPos = board.getPlayerPosition(p);
      if (!currentPos) return { success: false, message: 'Player not on board' };

      p.spendCard(6);
      p.addSPs(1);
      p.addCPs(1);

      for (let i = 1; i < target.length; i++) {
        const fromCell = target[i - 1];
        const toCell = target[i];

        fromCell.clear();
        toCell.setPlayer(p);

        for (const neighbor of board.getNeighbors(toCell)) {
          if (!neighbor.isHole && neighbor.isOccupied && neighbor !== target[i - 1] && neighbor !== target[i + 1]) {
            countedNeighbors.add(neighbor.id);
          }
        }
      }

      const totalGold = countedNeighbors.size * 2;
      p.addGold(totalGold);

      return {
        success: true,
        message: `Played Card: Crowded Halls - moved 2 steps, gained ${totalGold} gold, 1 SP, and 1 CP`
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target || target.length < 3) return 0;
      const finalCell = target[target.length - 1];
      const boardValue = evaluator.getMoveValue(p, finalCell);
      const goldValue = 4;
      return CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + goldValue + boardValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      const validPaths = paths.filter(pathInfo => pathInfo.path.length === 3).map(pathInfo => pathInfo.path);
      
      if (!validPaths || validPaths.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestPath = validPaths[0];
      let bestValue = -Infinity;
      
      for (const path of validPaths) {
        const finalCell = path[path.length - 1];
        const goldValue = 4;
        const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + goldValue + evaluator.getMoveValue(p, finalCell) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      return { target: bestPath, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const paths = MovementUtil.getValidPaths(board, p, 2, true, false);
      const validPaths = paths.filter(pathInfo => pathInfo.path.length === 3).map(pathInfo => pathInfo.path);
      
      if (!validPaths || validPaths.length === 0) {
        return { success: false, message: 'No valid 2-step paths available' };
      }
      
      let bestPath = validPaths[0];
      let bestValue = -Infinity;
      
      for (const path of validPaths) {
        const finalCell = path[path.length - 1];
        const goldValue = 4;
        const value = CardHelper.getSP(p, evaluator.onNight) + CardHelper.getCP(p) + goldValue + evaluator.getMoveValue(p, finalCell) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestPath = path;
        }
      }
      
      console.log(`[Crowded Halls] Auto-executing with path of length ${bestPath.length}`);
      return CardProcessor.get('crowded_halls')!.execute(p, board, bestPath);
    }
  });

  // ============================================================
  // CRUSTY BAND-AID
  // ============================================================
  CardProcessor.register({
    id: 'crusty_bandaid',
    name: 'Crusty Band-Aid',
    cost: 11,
    image: 'crusty_bandaid.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(11),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(11);
      p.addHealths(1);
      CardDrawer.drawCards(p, 1);
      return { success: true, message: 'Played Card: Crusty Bandaid - gained 1 health and drew 1 card' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getHealthValue(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(11);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getHealthValue(p, evaluator.onNight) + CardHelper.getCardDrawValue(p, evaluator.onNight, 1) - p.costCard(11);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('crusty_bandaid')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // DAREDEVIL
  // ============================================================
  CardProcessor.register({
    id: 'daredevil',
    name: 'Daredevil',
    cost: 5,
    image: 'daredevil.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currHealth === 1 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(5);
      return { success: true, message: 'Played Card: Daredevil - gained 5 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 5 * CardHelper.getCP(p) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 5 * CardHelper.getCP(p) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('daredevil')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // OPEN LOCKER
  // ============================================================
 CardProcessor.register({
  id: 'open_locker',
  name: 'Open Locker',
  cost: 13,
  image: 'open_locker.jpg',
  targetType: 'none',
  canPlay: (p, board) => p.currSP >= 20 && p.canAffordCard(13),
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board, target) => {
    const game = CardProcessor.getGame();
    if (!game || !game.cardManager) {
      return { success: false, message: 'Game or card manager not available' };
    }
    
    const cardDrawer = game.cardManager;
    
    // Get 3 locker cards from the locker deck
    const lockerCards: any[] = [];
    for (let i = 0; i < 3; i++) {
      const card = cardDrawer.drawLockerCard();
      if (card) {
        lockerCards.push(card);
      } else {
        break;
      }
    }
    
    if (lockerCards.length === 0) {
      return { success: false, message: 'No locker cards available' };
    }

    if (!p.spendCard(13)) {
      for (const card of lockerCards) cardDrawer.discardLockerCard(card);
      return { success: false, message: 'Need 13 gold' };
    }
    
    // Human players choose one card from the three revealed locker cards.
    if (!p.isBot && !target?.selectedCard) {
      cardDrawer.beginLockerSelection(p, lockerCards);
      return {
        success: true,
        message: 'Played Card: Open Locker - choose one of three locker cards'
      };
    }

    // AI auto-execute, pick the best locker card
    if (!target || !target.selectedCard) {
      // Auto-select the best locker card based on value
      let bestCard = lockerCards[0];
      let bestValue = -Infinity;
       
      
      for (const card of lockerCards) {
        const lockerData = getLockerData(card.cardId);
        let value = 0;
        if (lockerData) {
          if (lockerData.startingBonus.gold) value += lockerData.startingBonus.gold * 0.5;
          if (lockerData.startingBonus.sp) value += lockerData.startingBonus.sp * 2;
          if (lockerData.startingBonus.np) value += lockerData.startingBonus.np * 2;
          if (lockerData.startingBonus.cp) value += lockerData.startingBonus.cp * 2;
          if (lockerData.startingBonus.health) value += lockerData.startingBonus.health * 5;
          if (lockerData.startingBonus.drawCards) value += lockerData.startingBonus.drawCards * 3;
          if (lockerData.startingBonus.gp) value += lockerData.startingBonus.gp * 3;
        }
        if (value > bestValue) {
          bestValue = value;
          bestCard = card;
        }
      }
      
      // Apply the selected locker card
      const bestLockerData = getLockerData(bestCard.cardId);
      if (bestLockerData) {
        applyLockerCard(bestLockerData.id, p, game.players, board);
      }
      
      // Return other cards to locker discard
      for (const card of lockerCards) {
        if (card.id !== bestCard.id) {
          cardDrawer.discardLockerCard(card);
        }
      }
      
      return { 
        success: true, 
        message: `Played Card: Open Locker - auto-selected ${bestCard.name} for free` 
      };
    }
    
    // Manual selection (for human players)
    const selectedCard = target.selectedCard;
    const lockerData = target.lockerData;
    
    if (lockerData) {
      applyLockerCard(lockerData.id, p, game.players, board);
    }
    
    // Return other cards to locker discard
    for (const card of lockerCards) {
      if (card.id !== selectedCard.id) {
        cardDrawer.discardLockerCard(card);
      }
    }
    
    return { 
      success: true, 
      message: `Played Card: Open Locker - played ${selectedCard.name} for free` 
    };
  },
  expectedValue: (p, board, evaluator, target) => {
    // Average locker card value is around 18
    return 18 - p.costCard(13);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const value = 18 - p.costCard(13);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('open_locker')!.execute(p, board, null);
    return result;
  }
});
}