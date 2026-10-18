// src/game/cards/CardIndex/DeckPage20.ts

import { CardProcessor } from '../CardProcessor';
import { Player } from '../../core/Player';
import { Board } from '../../board/Board';
import { BoardCell } from '../../board/BoardCell';
import { CardDrawer } from '../CardDrawer';
import { CardHelper } from '../CardRegistrationHelper';
import { MovementUtil } from '../../actions/MovementUtilities';
import { AllSpecialActions } from '../../actions/SpecialActions';
import { ZombieSpawner } from '../../misc/ZombieSpawner';

export function registerPage20(): void {

  // ============================================================
  // TALENT SHOW
  // ============================================================
  CardProcessor.register({
    id: 'talent_show',
    name: 'Talent Show',
    cost: 8,
    image: 'talent_show.jpg',
    targetType: 'none',
    canPlay: (p, board) => {
      const pos = board.getPlayerPosition(p);
      return pos ? board.getCell(pos.x, pos.y)?.roomId === 'Auditorium' && p.canAffordCard(8) : false;
    },
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(8);
      p.addSPs(1);
      p.addGPs(1);
      const auditoriumCells = board.getCellsInRoom('Auditorium');
      const trapCount = auditoriumCells.filter(c => c.hasTrap).length;
      if (trapCount > 0) {
        CardDrawer.drawCards(p, trapCount);
      }
      return { success: true, message: `Played Card: Talent Show - gained 1 SP, 1 GP, drew ${trapCount} cards` };
    },
    expectedValue: (p, board, evaluator, target) => {
      const auditoriumCells = board.getCellsInRoom('Auditorium');
      const trapCount = auditoriumCells.filter(c => c.hasTrap).length;
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      return CardHelper.getSP(p, evaluator.onNight) + gpValue + CardHelper.getCardDrawValue(p, evaluator.onNight, trapCount) - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const auditoriumCells = board.getCellsInRoom('Auditorium');
      const trapCount = auditoriumCells.filter(c => c.hasTrap).length;
    const gpValue = CardHelper.getNightsRemaining(evaluator.onNight);
      const value = CardHelper.getSP(p, evaluator.onNight) + gpValue + CardHelper.getCardDrawValue(p, evaluator.onNight, trapCount) - p.costCard(8);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('talent_show')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // TEACHER'S PET
  // ============================================================
  CardProcessor.register({
    id: 'teachers_pet',
    name: "Teacher's Pet",
    cost: 7,
    image: 'teachers_pet.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 10 && p.canAffordCard(7),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(7);
      p.addNPs(5);
      return { success: true, message: "Played Card: Teacher's Pet - gained 5 NP" };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 5 * CardHelper.getNP(p) - p.costCard(7);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 5 * CardHelper.getNP(p) - p.costCard(7);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('teachers_pet')!.execute(p, board);
      return result;
    }
  });
// ============================================================
// TERMITE DAMAGE - FIXED
// ============================================================
CardProcessor.register({
  id: 'termite_damage',
  name: 'Termite Damage',
  cost: 5,
  image: 'termite_damage.jpg',
  targetType: 'none',
  canPlay: (p, board) => p.currCP >= 8 && p.canAffordCard(5),
  getValidTargets: () => [],
  isValidTarget: () => true,
  execute: (p, board) => {
    p.spendCard(5);
    p.addCPs(2);
    
    const game = CardProcessor.getGame();
    if (game) {
      for (const player of game.players) {
        if (!player.isEliminated) {
          player.barricadeEffectivenessBoost -= 1;
        }
      }
    }
    
    return { success: true, message: 'Played Card: Termite Damage - gained 2 CP, all players barricade effectiveness -1' };
  },
  expectedValue: (p, board, evaluator, target) => {
    const cardReward = 2 * CardHelper.getCP(p);
    
    // Each barricade loses 0.5 value per effectiveness point
    // Using the correct formula: SP + 4 * (effectiveness / 8)
    const lossPerBarricade = 0.5;
    
    const allBarricades = board.getAllBarricades();
    let yourLoss = 0;
    let opponentLoss = 0;
    
    for (const barricade of allBarricades) {
      if (barricade.structureOwner === p) {
        yourLoss += lossPerBarricade;
      } else if (barricade.structureOwner) {
        opponentLoss += lossPerBarricade;
      }
    }
    
    // Net effect = opponent loss (good) - your loss (bad)
    const netBarricadeEffect = opponentLoss - yourLoss;
    
    return cardReward + netBarricadeEffect - p.costCard(5);
  },
  getOptimalTarget: (p, board, evaluator) => {
    // No target needed - affects all players
    const cardReward = 2 * CardHelper.getCP(p);
    
    const lossPerBarricade = 0.5;
    const allBarricades = board.getAllBarricades();
    let yourLoss = 0;
    let opponentLoss = 0;
    
    for (const barricade of allBarricades) {
      if (barricade.structureOwner === p) {
        yourLoss += lossPerBarricade;
      } else if (barricade.structureOwner) {
        opponentLoss += lossPerBarricade;
      }
    }
    
    const netBarricadeEffect = opponentLoss - yourLoss;
    const value = cardReward + netBarricadeEffect - p.costCard(2);
    
    return { target: null, value };
  },
  autoExecute: (p, board, evaluator) => {
    const result = CardProcessor.get('termite_damage')!.execute(p, board);
    return result;
  }
});
  // ============================================================
  // TERROR SPRINT
  // ============================================================
  CardProcessor.register({
    id: 'terror_sprint',
    name: 'Terror Sprint',
    cost: 9,
    image: 'terror_sprint.jpg',
    targetType: 'cell',
    canPlay: (p, board) => p.canAffordCard(9),
    getValidTargets: (p, board) => MovementUtil.getTeleportTargetsRowColumn(board, p),
    isValidTarget: (p, board, target) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return false;
      return (target.x === pos.x || target.y === pos.y) && target.isEmpty && !target.isHole;
    },
    execute: (p, board, target) => {
      p.spendCard(9);
      
      if (!target) return { success: false, message: 'No target selected' };
      
      const result = MovementUtil.teleportTo(board, p, target);
      if (!result.success) return { success: false, message: result.message };
      
      return { 
        success: true, 
        message: `Played Card: Terror Sprint - ${result.message}` 
      };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const boardValue = evaluator.getMoveValue(p, target);
      return boardValue - p.costCard(9);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsRowColumn(board, p);
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getMoveValue(p, target) - p.costCard(9);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const targets = MovementUtil.getTeleportTargetsRowColumn(board, p);
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No valid teleport targets available' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      
      for (const target of targets) {
        const value = evaluator.getMoveValue(p, target) - p.costCard(9);
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Terror Sprint] Auto-executing with target (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('terror_sprint')!.execute(p, board, bestTarget);
    }
  });

  // ============================================================
  // THANK YOU NOTE
  // ============================================================
  CardProcessor.register({
    id: 'thank_you_note',
    name: 'Thank You Note',
    cost: 4,
    image: 'thank_you_note.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.currNP >= 8 && p.canAffordCard(4),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(4);
      p.addGold(12);
      return { success: true, message: 'Played Card: Thank You Note - gained 12 Gold' };
    },
    expectedValue: (p, board, evaluator, target) => {
      return 12 - p.costCard(4);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const value = 12 - p.costCard(4);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('thank_you_note')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // THERAPY GROUP
  // ============================================================
  CardProcessor.register({
    id: 'therapy_group',
    name: 'Therapy Group',
    cost: 11,
    image: 'therapy_group.jpg',
    targetType: 'none',
    canPlay: (p, board) => p.canAffordCard(11),
    getValidTargets: () => [],
    isValidTarget: () => true,
    execute: (p, board) => {
      p.spendCard(11);
      p.addSPs(1);
      p.healthGivesSP = true;
      return { success: true, message: 'Played Card: Therapy Group - gained 1 SP, gain SP when losing health' };
    },
    expectedValue: (p, board, evaluator, target) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const spValue = CardHelper.getSP(p, evaluator.onNight);
      const currentHealth = p.currHealth;
      const passiveValue = currentHealth * spValue/2;
      return cardReward + passiveValue - p.costCard(11);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const cardReward = CardHelper.getSP(p, evaluator.onNight);
      const spValue = CardHelper.getSP(p, evaluator.onNight);
      const currentHealth = p.currHealth;
      const passiveValue = currentHealth * spValue/2;
      const value = cardReward + passiveValue - p.costCard(11);
      return { target: null, value };
    },
    autoExecute: (p, board, evaluator) => {
      const result = CardProcessor.get('therapy_group')!.execute(p, board);
      return result;
    }
  });

  // ============================================================
  // THEY JUST KEEP COMING!
  // ============================================================
  CardProcessor.register({
    id: 'they_just_keep_coming',
    name: 'They just keep coming!',
    cost: 12,
    image: 'they_just_keep_coming.jpg',
    targetType: 'multiple',
    maxTargets: 2,
    canPlay: (p, board) => p.currNP >= 5 && p.canAffordCard(12),
    getValidTargets: (p, board) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return [];
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return [];
      
      const emptyNeighbors = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
      const targets: any[] = [];
      
      for (let i = 0; i < emptyNeighbors.length; i++) {
        for (let j = i + 1; j < emptyNeighbors.length; j++) {
          targets.push([emptyNeighbors[i], emptyNeighbors[j]]);
        }
      }
      
      if (targets.length === 0 && emptyNeighbors.length > 0) {
        targets.push([emptyNeighbors[0]]);
      }
      
      return targets;
    },
    isValidTarget: (p, board, target) => {
      if (!target) return false;
      const targetsArray = Array.isArray(target) ? target : [target];
      if (targetsArray.length === 0 || targetsArray.length > 2) return false;
      
      for (const t of targetsArray) {
        if (!t || !t.isEmpty || t.isHole) {
          return false;
        }
      }
      return true;
    },
    execute: (p, board, target) => {
      p.spendCard(12);
      p.addNPs(1);
      
      const targetsArray = Array.isArray(target) ? target : [target];
      let placedCount = 0;
      
      for (const t of targetsArray) {
        if (t && t.isEmpty && !t.isHole) {
          t.setBarricade(p);
          placedCount++;
        }
      }
      
      if (placedCount < 2) {
        const pos = board.getPlayerPosition(p);
        if (pos) {
          const cell = board.getCell(pos.x, pos.y);
          if (cell) {
            const emptyNeighbors = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
            for (const neighbor of emptyNeighbors) {
              if (placedCount >= 2) break;
              neighbor.setBarricade(p);
              placedCount++;
            }
          }
        }
      }
      
      return { 
        success: true, 
        message: `Played Card: They just keep coming! - gained 1 NP, placed ${placedCount} free barricades` 
      };
    },
    expectedValue: (p, board, evaluator, targets) => {
      const cardReward = CardHelper.getNP(p);
      
      if (!targets) {
        return cardReward - p.costCard(12);
      }
      
      const targetsArray = Array.isArray(targets) ? targets : [targets];
      if (targetsArray.length === 0) {
        return cardReward - p.costCard(12);
      }
      
      let totalBarricadeValue = 0;
      for (const t of targetsArray) {
        if (t && t.isEmpty && !t.isHole) {
          totalBarricadeValue += evaluator.getBarricadePlacementValue(p, t);
        }
      }
      
      return cardReward + totalBarricadeValue - p.costCard(12);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) return { target: null, value: 0 };
      
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) return { target: null, value: 0 };
      
      const emptyNeighbors = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
      
      if (emptyNeighbors.length === 0) {
        return { target: null, value: 0 };
      }
      
      const sorted = emptyNeighbors.sort((a, b) => {
        const valA = evaluator.getBarricadePlacementValue(p, a);
        const valB = evaluator.getBarricadePlacementValue(p, b);
        return valB - valA;
      });
      
      const selected = sorted.slice(0, Math.min(2, sorted.length));
      const targetsArray = selected.length === 1 ? [selected[0]] : selected;
      const totalBarricadeValue = selected.reduce((sum, t) => sum + evaluator.getBarricadePlacementValue(p, t), 0);
      const value = CardHelper.getNP(p) + totalBarricadeValue - p.costCard(12);
      
      return { target: targetsArray, value };
    },
    autoExecute: (p, board, evaluator) => {
      const pos = board.getPlayerPosition(p);
      if (!pos) {
        return { success: false, message: 'Player not on board' };
      }
      const cell = board.getCell(pos.x, pos.y);
      if (!cell) {
        return { success: false, message: 'Player cell not found' };
      }
      
      const emptyNeighbors = board.getNeighbors(cell).filter(c => c.isEmpty && !c.isHole);
      
      if (emptyNeighbors.length === 0) {
        return { success: false, message: 'No empty adjacent cells for barricades' };
      }
      
      const sorted = emptyNeighbors.sort((a, b) => {
        const valA = evaluator.getBarricadePlacementValue(p, a);
        const valB = evaluator.getBarricadePlacementValue(p, b);
        return valB - valA;
      });
      
      const selected = sorted.slice(0, Math.min(2, sorted.length));
      const targetsArray = selected.length === 1 ? [selected[0]] : selected;
      
      console.log(`[They just keep coming!] Auto-executing with ${selected.length} targets`);
      return CardProcessor.get('they_just_keep_coming')!.execute(p, board, targetsArray);
    }
  });

  // ============================================================
  // TIME OUT
  // ============================================================
  CardProcessor.register({
    id: 'time_out',
    name: 'Time Out',
    cost: 8,
    image: 'time_out.jpg',
    targetType: 'zombie',
    canPlay: (p, board) => p.canAffordCard(8),
    getValidTargets: (p, board) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) return [];
      return game.zombieManager.getAllZombies();
    },
    isValidTarget: (p, board, target) => target && target.hasZombie,
    execute: (p, board, target) => {
      p.spendCard(8);
      p.addCPs(2);
      
      if (target && target.hasZombie) {
        const game = CardProcessor.getGame();
        if (game && game.zombieManager) {
          const result = game.zombieManager.killZombie(target, p);
          if (!result.success) {
            return { success: false, message: result.message };
          }
        } else {
          target.clear();
        }
      }
      return { success: true, message: 'Played Card: Time Out - gained 2 CP and killed a zombie' };
    },
    expectedValue: (p, board, evaluator, target) => {
      if (!target) return 0;
      const killValue = evaluator.getZombieKillValue(p, target);
      return 2 * CardHelper.getCP(p) + killValue - p.costCard(8);
    },
    getOptimalTarget: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { target: null, value: 0 };
      }
      
      const targets = game.zombieManager.getAllZombies();
      
      if (!targets || targets.length === 0) {
        return { target: null, value: 0 };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      const pos = board.getPlayerPosition(p);
      
      for (const target of targets) {
        let value = 2 * CardHelper.getCP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(8);
        if (pos) {
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          value += Math.max(0, 4 - dist) * 2;
        }
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      return { target: bestTarget, value: bestValue };
    },
    autoExecute: (p, board, evaluator) => {
      const game = CardProcessor.getGame();
      if (!game || !game.zombieManager) {
        return { success: false, message: 'ZombieManager not available' };
      }
      
      const targets = game.zombieManager.getAllZombies();
      
      if (!targets || targets.length === 0) {
        return { success: false, message: 'No zombies to kill' };
      }
      
      let bestTarget = targets[0];
      let bestValue = -Infinity;
      const pos = board.getPlayerPosition(p);
      
      for (const target of targets) {
        let value = 2 * CardHelper.getCP(p) + evaluator.getZombieKillValue(p, target) - p.costCard(8);
        if (pos) {
          const dist = Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y);
          value += Math.max(0, 4 - dist) * 2;
        }
        if (value > bestValue) {
          bestValue = value;
          bestTarget = target;
        }
      }
      
      console.log(`[Time Out] Auto-executing with zombie at (${bestTarget.x},${bestTarget.y}) value: ${bestValue.toFixed(2)}`);
      return CardProcessor.get('time_out')!.execute(p, board, bestTarget);
    }
  });
}