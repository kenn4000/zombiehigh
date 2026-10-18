// src/game/cards/CardIndex/DeckPage2.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage2(): void {
CardProcessor.register({
  id: 'area_sabotage',
  name: 'Area Sabotage',
  cost: 9,
  image: 'area_sabotage.jpg',
  targetType: 'none',
  canPlay: (p, board) => {
    if (!p.canAffordCard(9)) return false;
    const pos = board.getPlayerPosition(p);
    if (!pos) return false;
    const cell = board.getCell(pos.x, pos.y);
    if (!cell) return false;
    
    // Sabotage is only playable while adjacent to a structure in the room.
    const roomId = cell.roomId;
    if (!roomId) return false;
    return board.getNeighbors(cell).some(c => c.roomId === roomId && (c.hasBarricade || c.hasTrap));
  },
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(9);
    
    const pos = board.getPlayerPosition(p);
    const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : null;
    let structuresDestroyed = 0;
    
    if (roomId) {
      // Get all cells in the room
      const cellsInRoom = board.getCellsInRoom(roomId);
      for (const cell of cellsInRoom) {
        if (cell.hasBarricade) {
          cell.removeStructure();
          structuresDestroyed++;
        }
        if (cell.hasTrap) {
          cell.clear();
          structuresDestroyed++;
        }
      }
    }
    
    // Award CP based on number of structures destroyed
    const cpGained = structuresDestroyed;
    p.addCPs(cpGained);
    
    return { 
      success: true, 
      message: `Played Card: Area Sabotage - Destroyed ${structuresDestroyed} structures in ${roomId || 'unknown room'}, gained ${cpGained} CP` 
    };
  },
  expectedValue: (p, board, evaluator, target) => {
    const pos = board.getPlayerPosition(p);
    const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : null;
    
    if (!roomId) {
      return -p.costCard(9);
    }
    
    // Count structures in the room
    const cellsInRoom = board.getCellsInRoom(roomId);
    let structureCount = 0;
    for (const cell of cellsInRoom) {
      if (cell.hasBarricade || cell.hasTrap) {
        structureCount++;
      }
    }
    
    // Each structure destroyed gives 1 CP
    const cpValue = CardHelper.getCP(p);
    const cardReward = structureCount * cpValue;
    
    // Add value for removing opponent structures
    let opponentDenial = 0;
    for (const cell of cellsInRoom) {
      if (cell.hasBarricade && cell.structureOwner && cell.structureOwner !== p) {
        opponentDenial += 2;
      }
      if (cell.hasTrap && cell.structureOwner && cell.structureOwner !== p) {
        opponentDenial += 1;
      }
    }
    
    return cardReward + opponentDenial - p.costCard(9);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const pos = board.getPlayerPosition(p);
    const roomId = pos ? board.getCell(pos.x, pos.y)?.roomId : null;
    
    if (!roomId) {
      return { target: null, value: -p.costCard(9) };
    }
    
    const cellsInRoom = board.getCellsInRoom(roomId);
    let structureCount = 0;
    let opponentDenial = 0;
    const cpValue = CardHelper.getCP(p);
    
    for (const cell of cellsInRoom) {
      if (cell.hasBarricade || cell.hasTrap) {
        structureCount++;
      }
      if (cell.hasBarricade && cell.structureOwner && cell.structureOwner !== p) {
        opponentDenial += 2;
      }
      if (cell.hasTrap && cell.structureOwner && cell.structureOwner !== p) {
        opponentDenial += 1;
      }
    }
    
    const cardReward = structureCount * cpValue;
    const value = cardReward + opponentDenial - p.costCard(9);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('area_sabotage')!.execute(p, board);
    return result;
  }
});

  // ============================================================
  // ATM
  // ============================================================
  CardProcessor.register({
    id: 'atm',
    name: 'ATM',
    cost: 1,
    image: 'atm.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP <= 20 && p.currGP >= 1 && p.canAffordCard(1),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(1);
      p.addGold(12);
      p.loseGPs(1);
      return { success: true, message: 'Played Card: ATM - gained 12 Gold, lost 1 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return 12-gpValue- p.costCard(1);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = evaluator.onNight - p.costCard(1);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('atm')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // ATTENDANCE SHEET
  // ============================================================
  CardProcessor.register({
    id: 'attendance_sheet',
    name: 'Attendance Sheet',
    cost: 5,
    image: 'attendance_sheet.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === "Principal's Office" && (p.currNP === 0 || p.currCP === 0) && p.canAffordCard(5) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addSPs(1);
      p.addGPs(1);
      return { success: true, message: 'Played Card: Attendance Sheet - gained 1 SP, and 1 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return gpValue+ CardHelper.getSP(p, evaluator.onNight)  - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = gpValue+ CardHelper.getSP(p, evaluator.onNight) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('attendance_sheet')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BACKPACK SEARCH
  // ============================================================
  CardProcessor.register({
    id: 'backpack_search',
    name: 'Backpack Search',
    cost: 5,
    image: 'backpack_search.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 8 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(2);
      CardDrawer.discardDraw(p, 3);
      return { 
        success: true, 
        message: 'Played Card: Backpack Search - Discarded one card, then drew 3 cards'
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = 2 * CardHelper.getCP(p);
      const cardDrawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, 3);
      return cardReward + cardDrawValue - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = 2 * CardHelper.getCP(p);
      const cardDrawValue = CardHelper.getCardDrawValue(p, evaluator.onNight, 3);
      const value = cardReward + cardDrawValue - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      // This card requires discarding a card first (UI interaction)
      const result = CardProcessor.get('backpack_search')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BACKPACK WITH SUPPLIES
  // ============================================================
  CardProcessor.register({
    id: 'backpack_with_supplies',
    name: 'Backpack With Supplies',
    cost: 5,
    image: 'backpack_with_supplies.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP >= 17 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addSPs(1);
      p.addGold(10);
      return { success: true, message: 'Played Card: Backpack with Supplies - gained 1 SP, and 10 gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) + 10 - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) + 10 - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('backpack_with_supplies')!.execute(p, board);
      return result;
    }
  });
  
// ============================================================
// BAIT LAUNCHER    
// ============================================================
CardProcessor.register({
  id: 'bait_launcher',
  name: 'Bait Launcher',
  cost: 18,
  image: 'bait_launcher.jpg',
  targetType: 'none', // No target needed - it just adds the action
  canPlay: (p, board) => p.currSP >= 20 && p.canAffordCard(18),
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(18);
    p.addSPs(1);
    
    // Add the repeatable bait launcher action
    const action = AllSpecialActions['bait_launcher'];
    if (action) {
      p.actionManager.addAction(action);
    }
    
    return { 
      success: true, 
      message: 'Played Card: Bait Launcher - gained 1 SP and unlocked repeatable bait launcher action' 
    };
  },
  expectedValue: (p, board, evaluator, target) => {
    const cardReward = CardHelper.getSP(p, evaluator.onNight);
    const nightsLeft = CardHelper.getNightsRemaining(evaluator.onNight);
    
    // The repeatable action lets you place bait once per night
    // Each bait is worth about 4-6 value (health saved + flex point)
    // But you also pay 2 gold per use, so net value is about 3 per use
    const valuePerUse = 3;
    const totalValue = nightsLeft * valuePerUse;
    
    return cardReward + totalValue - p.costCard(18);
  },
  getOptimalTarget: (p, board, evaluator) => {
    // No target needed - just the card value
    const cardReward = CardHelper.getSP(p, evaluator.onNight);
    const nightsLeft = CardHelper.getNightsRemaining(evaluator.onNight);
    const valuePerUse = 3;
    const totalValue = nightsLeft * valuePerUse;
    const value = cardReward + totalValue - p.costCard(18);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('bait_launcher')!.execute(p, board);
    return result;
  }
});

  // ============================================================
  // BANNED BOOK
  // ============================================================
  CardProcessor.register({
    id: 'banned_book',
    name: 'Banned Book',
    cost: 3,
    image: 'banned_book.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Library' && p.canAffordCard(3) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addCPs(3);
      return { success: true, message: 'Played Card: Banned Book - gained 3 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 3 * CardHelper.getCP(p) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 3 * CardHelper.getCP(p) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('banned_book')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // BATHROOM TRAP
  // ============================================================
  CardProcessor.register({
    id: 'bathroom_trap',
    name: 'Bathroom Trap',
    cost: 2,
    image: 'bathroom_trap.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      return board.getAllCells().some(c => c.hasTrap && c.roomId === 'Restroom' && c.structureOwner === p) && p.canAffordCard(2);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addSPs(1);
      return { success: true, message: 'Played Card: Bathroom Trap - gained 1 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) - p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('bathroom_trap')!.execute(p, board);
      return result;
    }
  });
}