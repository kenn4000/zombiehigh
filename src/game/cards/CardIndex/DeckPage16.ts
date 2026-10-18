// src/game/cards/CardIndex/DeckPage16.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';

export function registerPage16(): void {

  // ============================================================
  // SCRAP MATERIALS
  // ============================================================
  CardProcessor.register({
    id: 'scrap_materials',
    name: 'Scrap Materials',
    cost: 2,
    image: 'scrap_materials.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      return barricades.length >= 2 && p.canAffordCard(2);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(2);
      p.addGPs(1);
      return { success: true, message: 'Played Card: Scrap Materials - gained 1 GP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return gpValue - p.costCard(2);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = gpValue- p.costCard(2);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('scrap_materials')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // RECYCLING CLUB
  // ============================================================
  CardProcessor.register({
    id: 'recycling_club',
    name: 'Recycling Club',
    cost: 4,
    image: 'recycling_club.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currSP <= 20 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addCPs(1);
      p.addNPs(1);
      CardDrawer.drawKeep(p, 3, 1);
      return { success: true, message: 'Played Card: Recycling Club - gained 1 CP, 1 NP, and drew 3 cards kept 1' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getCP(p) + CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getCP(p) + CardHelper.getNP(p) + CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('recycling_club')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // REGRET
  // ============================================================
  CardProcessor.register({
    id: 'regret',
    name: 'Regret',
    cost: 4,
    image: 'regret.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const hasTrap = board.getAllCells().some(c => c.hasTrap && c.structureOwner === p);
      const hasBarricade = board.getAllBarricades().some(c => c.structureOwner === p);
      return (hasTrap || hasBarricade) && p.canAffordCard(4);
    },
    getValidTargets: (p, board) => {
      return [
        ...board.getAllTraps().filter(c => c.structureOwner === p),
        ...board.getAllBarricades().filter(c => c.structureOwner === p),
      ];
    },
    isValidTarget: (p, board, target) => {
      if (!target) return false;
      const cell = board.getCell(Number(target.x), Number(target.y));
      return !!cell && cell.structureOwner === p && (cell.hasTrap || cell.hasBarricade);
    },
    execute: (p, board, target) => {
      const cell = target && board.getCell(Number(target.x), Number(target.y));
      if (!cell || cell.structureOwner !== p || (!cell.hasTrap && !cell.hasBarricade)) {
        return { success: false, message: 'Invalid structure target' };
      }
      const wasTrap = cell.hasTrap;
      p.spendCard(4);
      p.addSPs(1);
      cell.clear();
      return {
        success: true,
        message: `Played Card: Regret - gained 1 SP and destroyed own ${wasTrap ? 'trap' : 'barricade'}`,
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      
      if (!target) {
        return cardReward - p.costCard(4);
      }
      
      let structureValue = 0;
      if (target.hasTrap) {
        structureValue = evaluator.getTrapPlacementValue(p, target);
      } else if (target.hasBarricade) {
        structureValue = evaluator.getBarricadePlacementValue(p, target);
      }
      
      return cardReward - structureValue - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets: any[] = [];
      
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      targets.push(...traps, ...barricades);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = Infinity;
      
      for (const target of targets) {
        let structureValue = 0;
        if (target.hasTrap) {
          structureValue = evaluator.getTrapPlacementValue(p, target);
        } else if (target.hasBarricade) {
          structureValue = evaluator.getBarricadePlacementValue(p, target);
        }
        const netValue = CardHelper.getSP(p, evaluator.onNight) - structureValue - p.costCard(4);
        if (netValue < bestValue) {
          bestValue = netValue;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets: any[] = [];
      
      const traps = board.getAllTraps().filter(c => c.structureOwner === p);
      const barricades = board.getAllBarricades().filter(c => c.structureOwner === p);
      targets.push(...traps, ...barricades);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No own structures to destroy' };
      }
      
      let bestTarget = targets[0];
      let bestValue = Infinity;
      
      for (const target of targets) {
        let structureValue = 0;
        if (target.hasTrap) {
          structureValue = evaluator.getTrapPlacementValue(p, target);
        } else if (target.hasBarricade) {
          structureValue = evaluator.getBarricadePlacementValue(p, target);
        }
        const netValue = CardHelper.getSP(p, evaluator.onNight) - structureValue - p.costCard(4);
        if (netValue < bestValue) {
          bestValue = netValue;
          bestTarget = target;
        }
      }
      
      console.log(`[Regret] Auto-executing at (${bestTarget.x},${bestTarget.y})`);
      return CardProcessor.get('regret')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // RUNNING JUMP
  // ============================================================
 CardProcessor.register({
  id: 'running_jump',
  name: 'Running Jump',
  cost: 3,
  image: 'running_jump.jpg',
  targetType: 'cell',
  canPlay: (p, board) => p.canAffordCard(3),
  getValidTargets: (p, board) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return [];
    const result: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: board.getCell(pos.x, pos.y)!, dist: 0 }];
    visited.add(`${pos.x},${pos.y}`);
    
    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;
      if (dist > 0 && dist <= 3 && cell.isEmpty && !cell.isHole) {
        result.push(cell);
      }
      if (dist < 3) {
        for (const neighbor of board.getNeighbors(cell)) {
          const key = `${neighbor.x},${neighbor.y}`;
          // Explicitly check for barricades on the tile
          if (!visited.has(key) && neighbor.isEmpty && !neighbor.isHole && !neighbor.hasBarricade) {
            visited.add(key);
            queue.push({ cell: neighbor, dist: dist + 1 });
          }
        }
      }
    }
    return result;
  },
  isValidTarget: (p, board, target) => {
    const pos = board.getPlayerPosition(p);
    if (!pos) return false;
    const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
    // Explicitly check for barricades on the tile
    return dist <= 3 && target.isEmpty && !target.isHole && !target.hasBarricade;
  },
  execute: (p, board, target) => {
    p.spendCard(3);
    
    if (!target) return { success: false, message: 'No target selected' };
    
    // Check target is valid (explicit barricade check)
    if (target.hasBarricade) {
      return { success: false, message: 'Cannot jump to a tile with a barricade' };
    }
    if (!target.isEmpty || target.isHole) {
      return { success: false, message: 'Target tile is not empty' };
    }
    
    const result = MovementUtil.teleportTo(board, p, target);
    if (!result.success) return { success: false, message: result.message };
    
    return { 
      success: true, 
      message: `Played Card: Running Jump - ${result.message}` 
    };
  },
  expectedValue: (p, board, evaluator, target) => {
    if (!target) return 0;
    // Check if target has barricade
    if (target.hasBarricade) return -p.costCard(3);
    const boardValue = evaluator.getMoveValue(p, target);
    return boardValue - p.costCard(3);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const targets = CardProcessor.get('running_jump')!.getValidTargets(p, board);
    
    if (!targets || targets.length === 0) {
      return { target: null, value: 0 };
    }
    
    let bestTarget = targets[0];
    let bestValue = -Infinity;
    
    for (const target of targets) {
      // Skip targets with barricades
      if (target.hasBarricade) continue;
      const value = evaluator.getMoveValue(p, target) - p.costCard(3);
      if (value > bestValue) {
        bestValue = value;
        bestTarget = target;
      }
    }
    
    return { target: bestTarget, value: bestValue };
  },
  autoExecute: (p, board, evaluator) => {
    const targets = CardProcessor.get('running_jump')!.getValidTargets(p, board);
    
    if (!targets || targets.length === 0) {
      return { success: false, message: 'No valid jump targets available' };
    }
    
    let bestTarget = targets[0];
    let bestValue = -Infinity;
    
    for (const target of targets) {
      if (target.hasBarricade) continue;
      const value = evaluator.getMoveValue(p, target) - p.costCard(3);
      if (value > bestValue) {
        bestValue = value;
        bestTarget = target;
      }
    }
    
    console.log(`[Running Jump] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
    return CardProcessor.get('running_jump')!.execute(p, board, bestTarget);
  }
});

  // ============================================================
  // SAVED YOU A SEAT
  // ============================================================
  CardProcessor.register({
    id: 'saved_you_a_seat',
    name: 'Saved you a Seat',
    cost: 5,
    image: 'saved_you_a_seat.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currCP >= 10 && p.canAffordCard(5),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(5);
      p.addCPs(4);
      return { success: true, message: 'Played Card: Saved you a Seat - gained 4 CP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 4 * CardHelper.getCP(p) - p.costCard(5);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 4 * CardHelper.getCP(p) - p.costCard(5);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('saved_you_a_seat')!.execute(p, board);
      return result;
    }
  });
// ============================================================
// SECRET NOTES
// ============================================================
CardProcessor.register({
  id: 'secret_notes',
  name: 'Secret Notes',
  cost: 5,
  image: 'secret_notes.jpg',
  targetType: 'none',
  canPlay: (p, board) => {
    const pos = board.getPlayerPosition(p);
    return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Auditorium' && p.currSP >= 25 && p.canAffordCard(5) : false;
  },
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(5);
    p.addGPs(1);
    CardDrawer.drawCards(p, 3);
    return { success: true, message: 'Played Card: Secret Notes - gained 1 GP and drew 3 cards' };
  },
  expectedValue: (p, board, evaluator, target) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
    return gpValue + CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(5);
  },
  getOptimalTarget: (p, board, evaluator) => {
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
    const value = gpValue + CardHelper.getCardDrawValue(p, evaluator.onNight, 3) - p.costCard(5);
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('secret_notes')!.execute(p, board);
    return result;
  }
});
  // ============================================================
  // SCIENCE KIT
  // ============================================================
  CardProcessor.register({
    id: 'science_kit',
    name: 'Science Kit',
    cost: 3,
    image: 'science_kit.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      return board.getAllCells().some(c => c.hasBait && c.structureOwner === p && c.roomId === 'Science Lab') && p.canAffordCard(3);
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(3);
      p.addSPs(1);
      return { success: true, message: 'Played Card: Science Kit - gained 1 SP' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return CardHelper.getSP(p, evaluator.onNight) - p.costCard(3);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = CardHelper.getSP(p, evaluator.onNight) - p.costCard(3);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('science_kit')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // SECRET PASSAGE
  // ============================================================
  CardProcessor.register({
    id: 'secret_passage',
    name: 'Secret Passage',
    cost: 6,
    image: 'secret_passage.jpg',
    targetType: 'cell',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Science Lab' && p.canAffordCard(6) : false;
    },
    getValidTargets: (p, board) => {
      return board.getCellsInRoom('Auditorium').filter(c => c.isEmpty && !c.isHole);
    },
    isValidTarget: (p, board, target) => {
      return target && target.roomId === 'Auditorium' && target.isEmpty && !target.isHole;
    },
    execute: (p, board, target) => {
      p.spendCard(6);
      p.addSPs(1);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Secret Passage - gained 1 SP and ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      return CardHelper.getSP(p, evaluator.onNight) + boardValue - p.costCard(6);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = board.getCellsInRoom('Auditorium').filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = board.getCellsInRoom('Auditorium').filter(c => c.isEmpty && !c.isHole);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets in Auditorium' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = CardHelper.getSP(p, evaluator.onNight) + evaluator.getMoveValue(p, target) - p.costCard(6);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Secret Passage] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('secret_passage')!.execute(p, board, bestTarget);
    }
  });
}