// src/game/core/AIController.ts

import { Player } from './Player';
import { Board } from '../board/Board';
import { BoardCell } from '../board/BoardCell';
import { BoardEvaluator } from '../board/BoardEvaluator';
import { GameManager } from './GameManager';
import { Game } from './Game';
import { CardProcessor } from '../cards/CardProcessor';
import { GameConstants } from '../misc/GameConstants';
import { ActionEffect } from '../actions/ActionProcessor';

// Define the action type with specialAction
interface AIAction {
  type: string;
  target: any;
  value: number;
  card?: any;
  effect?: any;
  steps?: number;
  specialAction?: {
    actionDef: any;
    option: any;
    actionId: string;
  };
}

export class AIController {
  private evaluator: BoardEvaluator;
  private board: Board;
  private players: Player[];
  private onNight: number;
  private game: Game;
  private usedCells: Set<string> = new Set();

  private readonly TRAP_COST = GameConstants.ACTION_COSTS.TRAP;
  private readonly BAIT_COST = GameConstants.ACTION_COSTS.BAIT;
  private readonly BARRICADE_COST = GameConstants.ACTION_COSTS.BARRICADE;
  private readonly MELEE_COST = GameConstants.ACTION_COSTS.MELEE;
  private readonly MOVE_COST = GameConstants.ACTION_COSTS.MOVE; 
  private readonly JUMP_COST = 5;       
  private readonly JUMP_TOLL = 1;        

  constructor(gameManager: GameManager, board: Board, players: Player[], onNight: number, game: Game) {
    this.board = board;
    this.players = players;
    this.onNight = onNight;
    this.game = game;
    this.evaluator = new BoardEvaluator(board, players, onNight);
  }

  takeAction(player: Player): boolean {
    try { 

      console.log(`\n${'='.repeat(50)}`);
      console.log(`[AI] ${player.name} taking action...`);
      console.log(`[AI] Gold: ${player.gold}, SP: ${player.currSP}, Health: ${player.currHealth}`);
      console.log(`[AI] Hand: ${player.hand.cards.length} cards`);
      
      const pos = this.board.getPlayerPosition(player);
      if (!pos) {
        console.log(`[AI] ${player.name} has no position`);
        return false;
      }
      console.log(`[AI] Position: (${pos.x}, ${pos.y})`);

      if (player.isEliminated) {
        console.log(`[AI] ${player.name} is eliminated`);
        return false;
      }

      const actions = this.getPossibleActions(player);

      if (actions.length === 0) {
        console.log(`[AI] ${player.name} no possible actions`);
        return false;
      }

      // Sort by expected value (highest first)
      actions.sort((a, b) => b.value - a.value);

      // Log ALL actions with their values
      console.log(`\n[AI] ALL ACTIONS WITH VALUES:`);
      console.log(`${'-'.repeat(60)}`);
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const targetStr = action.target ? `(${action.target.x},${action.target.y})` : 'none';
        const cardStr = action.card ? `[${action.card.name}]` : '';
        const specialStr = action.specialAction ? `[${action.specialAction.actionId}]` : '';
        console.log(`  ${(i + 1).toString().padStart(2)}. ${action.type.padEnd(12)} at ${targetStr.padEnd(12)} ${cardStr} ${specialStr} value: ${action.value.toFixed(4)}`);
      }
      console.log(`${'-'.repeat(60)}`);

      // Take the best action
      const best = actions[0];
      console.log(`\n[AI] BEST ACTION: ${best.type} at (${best.target?.x ?? '?'},${best.target?.y ?? '?'}) value: ${best.value.toFixed(4)}`);

      // ===== PRINT BOARD STATE BEFORE EXECUTING =====
      console.log(`\n[AI] BOARD STATE BEFORE EXECUTION:`);
      console.log(`    0  1  2  3  4  5  6  7  8  9  10`);
      for (let y = 0; y < 10; y++) {
        let row = `${y.toString().padStart(2)} `;
        for (let x = 0; x < 11; x++) {
          const cell = this.board.getCell(x, y);
          if (!cell) {
            row += ' . ';
            continue;
          }
          if (cell.isHole) {
            row += ' X ';
          } else if (cell.hasPlayer) {
            const p = cell.structureOwner;
            const id = p ? p.id.replace('cpu-', 'P') : '?';
            row += ` ${id} `;
          } else if (cell.hasZombie) {
            row += ' Z ';
          } else if (cell.hasTrap) {
            row += ' T ';
          } else if (cell.hasBarricade) {
            row += ' B ';
          } else if (cell.hasBait) {
            row += ' b ';
          } else {
            row += ' . ';
          }
        }
        console.log(row);
      }
      console.log(`   Player ${player.name} is at (${pos.x},${pos.y})`);
      console.log(`   Target: ${best.type} at (${best.target?.x ?? '?'},${best.target?.y ?? '?'})`);
      console.log('========================');

      if (best.value <= 0) {
        console.log(`[AI] Best action has negative/zero value (${best.value.toFixed(4)}), passing`);
        return false;
      }

      console.log(`[AI] Executing: ${best.type}`);
      const result = this.executeAction(player, best);
      console.log(`[AI] Execution ${result ? 'SUCCESS' : 'FAILED'}`);
      console.log(`${'='.repeat(50)}\n`);
      return result;
    } catch (error) {
      console.error(`[AI] Error in takeAction for ${player.name}:`, error);
      return false;
    }
  }

  private getCostForAction(type: string): number {
    switch (type) {
      case 'melee': return this.MELEE_COST;
      case 'trap': return this.TRAP_COST;
      case 'move': return this.MOVE_COST;
      case 'bait': return this.BAIT_COST;
      case 'barricade': return this.BARRICADE_COST;
      default: return 0;
    }
  }
private getJumpTargets(player: Player): BoardCell[] {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return [];
    const targets: BoardCell[] = [];
    const directions = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
        { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];
    for (const d of directions) {
        const midX = pos.x + d.dx;
        const midY = pos.y + d.dy;
        const landX = pos.x + 2 * d.dx;
        const landY = pos.y + 2 * d.dy;
        if (landX < 0 || landX >= 10 || landY < 0 || landY >= 10) continue; //come back here to figure out which has 11 and which is 10
        const midCell = this.board.getCell(midX, midY);
        const landCell = this.board.getCell(landX, landY);
        if (!midCell || !landCell) continue; 
        if (!midCell.hasTrap && !midCell.hasBarricade) continue; 
        if (!landCell.isEmpty || landCell.isHole) continue;
        targets.push(landCell);
    }
    return targets;
}
  private getPossibleActions(player: Player): AIAction[] {
    const actions: AIAction[] = [];
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return actions;

    const currentCell = this.board.getCell(pos.x, pos.y);
    if (!currentCell) return actions;

    console.log(`\n[AI] Evaluating actions at (${pos.x},${pos.y})...`);

    // 1. MELEE attacks
    if (player.gold >= this.MELEE_COST) {
      const meleeTargets = this.board.getNeighbors(currentCell).filter(c => c.hasZombie);
      console.log(`[AI] Melee targets: ${meleeTargets.length}`);
      for (const target of meleeTargets) {
        try {
          const rawValue = this.getMeleeValue(player, target);
          const netValue = rawValue - this.MELEE_COST;
          console.log(`  Melee at (${target.x},${target.y}): rawValue=${rawValue.toFixed(2)}, cost=${this.MELEE_COST}, netValue=${netValue.toFixed(2)}`);
          actions.push({ type: 'melee', target, value: netValue });
        } catch (e) {
          console.error(`[AI] Error evaluating melee:`, e);
        }
      }
    }

    // 2. TRAP placement
    if (player.gold >= this.TRAP_COST) {
      const trapTargets = this.getTrapTargets(player);
      console.log(`[AI] Trap targets: ${trapTargets.length}`);
      for (const target of trapTargets) {
        try {
          const rawValue = this.getTrapValue(player, target);
          const netValue = rawValue - this.TRAP_COST;
          console.log(`  Trap at (${target.x},${target.y}): rawValue=${rawValue.toFixed(2)}, cost=${this.TRAP_COST}, netValue=${netValue.toFixed(2)}`);
          actions.push({ type: 'trap', target, value: netValue });
        } catch (e) {
          console.error(`[AI] Error evaluating trap:`, e);
        }
      }
    }

    // 3. MOVEMENT - Include all cells within 3 steps
    if (player.gold >= this.MOVE_COST) {
      const moveTargets = this.getReachableCells(player, 3);
      console.log(`[AI] Move targets: ${moveTargets.length}`);
      for (const target of moveTargets) {
        try {
          const playerPos = this.board.getPlayerPosition(player);
          if (!playerPos) continue;
          const steps = Math.abs(target.x - playerPos.x) + Math.abs(target.y - playerPos.y);
          const totalCost = steps * this.MOVE_COST;
          
          if (player.gold < totalCost) continue;
          
          const boardDelta = this.evaluator.getMoveValue(player, target);
          const netValue = boardDelta - totalCost;
          
          console.log(`  Move to (${target.x},${target.y}): steps=${steps}, cost=${totalCost}, boardDelta=${boardDelta.toFixed(2)}, netValue=${netValue.toFixed(2)}`);
          actions.push({ type: 'move', target, value: netValue, steps: steps });
        } catch (e) {
          console.error(`[AI] Error evaluating move:`, e);
        }
      }
    }

    // 4. BAIT placement
    if (player.gold >= this.BAIT_COST) {
      const baitTargets = this.getBaitTargets(player);
      console.log(`[AI] Bait targets: ${baitTargets.length}`);
      for (const target of baitTargets) {
        try {
          const rawValue = this.getBaitValue(player, target);
          const netValue = rawValue - this.BAIT_COST;
          console.log(`  Bait at (${target.x},${target.y}): rawValue=${rawValue.toFixed(2)}, cost=${this.BAIT_COST}, netValue=${netValue.toFixed(2)}`);
          actions.push({ type: 'bait', target, value: netValue });
        } catch (e) {
          console.error(`[AI] Error evaluating bait:`, e);
        }
      }
    }

    // 5. BARRICADE placement
    if (player.gold >= this.BARRICADE_COST) {
      const barricadeTargets = this.getBarricadeTargets(player);
      console.log(`[AI] Barricade targets: ${barricadeTargets.length}`);
      for (const target of barricadeTargets) {
        try {
          const rawValue = this.getBarricadeValue(player, target);
          const netValue = rawValue - this.BARRICADE_COST;
          console.log(`  Barricade at (${target.x},${target.y}): rawValue=${rawValue.toFixed(2)}, cost=${this.BARRICADE_COST}, netValue=${netValue.toFixed(2)}`);
          actions.push({ type: 'barricade', target, value: netValue });
        } catch (e) {
          console.error(`[AI] Error evaluating barricade:`, e);
        }
      }
    }

    // 6. SPECIAL ACTIONS (Repeatable actions from cards/heroes/lockers)
    if (player.actionManager) {
      console.log(`[AI] Checking action manager for ${player.name}...`);
      
      let specialActions: ActionEffect[] = [];
      
      try {
        specialActions = player.actionManager.getAvailableActions(player, this.board);
        console.log(`[AI] getAvailableActions(player, board) returned: ${specialActions.length}`);
      } catch (e) {
        console.log(`[AI] getAvailableActions(player, board) failed:`, e);
      }
      
      console.log(`[AI] Total special actions found: ${specialActions.length}`);

      for (const actionDef of specialActions) {
        console.log(`[AI] Processing special action: ${actionDef.id} - ${actionDef.name}`);
        const options = actionDef.options || [];
        console.log(`[AI]   Options: ${options.length}`);
        
        for (const option of options) {
          console.log(`[AI]   Option: ${option.id} - ${option.name}`);
          console.log(`[AI]     Target type: ${option.targetType}`);
          console.log(`[AI]     Gold cost: ${option.goldCost}`);
          
          if (!option.canUse) {
            console.log(`[AI]     No canUse function, skipping`);
            continue;
          }
          
          // Get targets if needed
          let targets: any[] = [];
          const playerPos = this.board.getPlayerPosition(player);
          
          if (option.targetType === 'player') {
            const game = CardProcessor.getGame();
            if (game) {
              for (const p of game.players) {
                if (p !== player && !p.isEliminated && option.canUse(player, this.board, p)) {
                  targets.push(p);
                }
              }
            }
          } else if (option.targetType === 'cell') {
            if (playerPos) { 
              if (actionDef.id === 'bungler_move_trap') {
                const allTraps = this.board.getAllTraps();
                for (const trap of allTraps) {
                  if (option.canUse(player, this.board, trap)) {
                    targets.push(trap);
                  }
                }
              } else if (actionDef.id === 'track_jump' || actionDef.id === 'game_gymnastics_training') {
                const cell = this.board.getCell(playerPos.x, playerPos.y);
                if (cell) {
                  for (const neighbor of this.board.getNeighbors(cell)) {
                    // Gymnastics Training and Track Jump target players or zombies.
                    if (neighbor.hasPlayer || neighbor.hasZombie || neighbor.hasTrap) {
                      const dx = neighbor.x - playerPos.x;
                      const dy = neighbor.y - playerPos.y;
                      const landingX = playerPos.x + dx * 2;
                      const landingY = playerPos.y + dy * 2;
                      const landingCell = this.board.getCell(landingX, landingY);
                      // Must have an empty landing cell behind the target
                      if (landingCell && landingCell.isEmpty && !landingCell.isHole) {
                        if (option.canUse(player, this.board, neighbor)) {
                          targets.push(neighbor);
                        }
                      }
                    }
                  }
                }
              } else {
                // Normal cell targeting for all other actions
                let range = 2;
                if (actionDef.id === 'hero_barry_cade' || 
                    actionDef.id === 'hero_elsa_von_trap' ||
                    actionDef.id === 'hero_archy_tect') {
                  range = 100; // Global range for hero actions
                }
                if (actionDef.id === 'game_bait_launcher') range = 3;
                if (actionDef.id === 'locker_grappling_hook') range = 2;
                if (actionDef.id === 'game_gymnastics_training') range = 1; // Already handled above, but keep for safety
                
                // Don't filter by isEmpty - barricades, traps, etc. are not empty!
                const allCells = this.board.getAllCells().filter(c => !c.isHole);
                for (const cell of allCells) {
                  const dist = Math.abs(cell.x - playerPos.x) + Math.abs(cell.y - playerPos.y);
                  if (dist <= range && option.canUse(player, this.board, cell)) {
                    targets.push(cell);
                  }
                }
              }
            }
          } else if (option.targetType === 'zombie') {
            if (playerPos) {
              const cell = this.board.getCell(playerPos.x, playerPos.y);
              if (cell) {
                for (const neighbor of this.board.getNeighbors(cell)) {
                  if (neighbor.hasZombie && option.canUse(player, this.board, neighbor)) {
                    targets.push(neighbor);
                  }
                }
              }
            }
          } else if (option.targetType === 'path') {
            if (option.canUse(player, this.board)) {
              targets.push(null);
            }
          } else {
            // 'none' target type - just check if the option can be used
            // and push a single null target if it can
            if (option.canUse && option.canUse(player, this.board)) {
              targets.push(null);
              console.log(`[AI]     'none' target action ${option.name} is usable`);
            } else {
              console.log(`[AI]     'none' target action ${option.name} is NOT usable`);
            }
          }
          
          console.log(`[AI]     Targets found: ${targets.length}`);
          
          if (targets.length === 0 && option.targetType !== 'none') {
            console.log(`[AI]     No targets found for ${option.name}, skipping`);
            continue;
          }
          
          for (const target of targets) {
            try {
              let value = 0;
              const goldCost = option.goldCost || 0;
              
              if (option.expectedValue) {
                const evaluator = new BoardEvaluator(this.board, this.game.players, this.onNight);
                // For 'none' target type, pass null as the target
                value = option.expectedValue(player, this.board, evaluator, target);
                console.log(`[AI]       expectedValue: ${value.toFixed(2)}`);
              } else {
                // Fallback: estimate value based on action type
                const actionId = actionDef.id;
                if (actionId === 'game_bait_launcher') {
                  if (target) {
                    value = this.evaluator.getBaitPlacementValue(player, target);
                  }
                } else if (actionId === 'game_printed_walls' || actionId === 'locker_nice_for_sale' || actionId === 'locker_cool_for_sale') {
                  if (target) {
                    value = this.evaluator.getBarricadePlacementValue(player, target);
                  }
                } else if (actionId === 'game_confident_first_step' || 
                           actionId === 'game_gymnastics_training' || 
                           actionId === 'locker_shoes' ||
                           actionId === 'locker_grappling_hook') {
                  if (target) {
                    value = this.evaluator.getMoveValue(player, target);
                  }
                } else if (actionId.includes('nurse') || actionId.includes('barry') || 
                           actionId.includes('janitor') || actionId.includes('von_trap') ||
                           actionId.includes('bully') || actionId.includes('track') ||
                           actionId.includes('bungler') || actionId.includes('nerd') ||
                           actionId.includes('lunch_lady') || actionId.includes('principal') ||
                           actionId.includes('secretary') || actionId.includes('coach')) {
                  // Hero actions - base value
                  value = 3;
                } else {
                  value = 2;
                }
                console.log(`[AI]       fallback value: ${value.toFixed(2)}`);
              }
              
              const netValue = value - goldCost;
              console.log(`[AI]       netValue: ${netValue.toFixed(2)} (value: ${value.toFixed(2)} - cost: ${goldCost})`);
              
              if (netValue > -20) {
                console.log(`[AI]       ✅ Adding special action: ${option.name}`);
                actions.push({
                  type: 'special',
                  target: target,
                  value: netValue,
                  specialAction: {
                    actionDef: actionDef,
                    option: option,
                    actionId: actionDef.id
                  }
                });
              } else {
                console.log(`[AI]       ❌ Skipping ${option.name} (netValue too low: ${netValue.toFixed(2)})`);
              }
            } catch (e) {
              console.error(`[AI] Error evaluating special action ${option.name}:`, e);
            }
          }
        }
      }
    } else {
      console.log(`[AI] No ActionManager for ${player.name}`);
    }
// 7. JUMP action
if (player.gold >= this.JUMP_COST) {
    const jumpTargets = this.getJumpTargets(player);
    console.log(`[AI] Jump targets: ${jumpTargets.length}`);
    for (const target of jumpTargets) {
        const rawValue = this.evaluator.getMoveValue(player, target);
        const netValue = rawValue - this.JUMP_COST;
        console.log(`  Jump to (${target.x},${target.y}): rawValue=${rawValue.toFixed(2)}, cost=${this.JUMP_COST}, netValue=${netValue.toFixed(2)}`);
        actions.push({ type: 'jump', target, value: netValue });
    }
}

    // 8. CARD actions
    console.log(`[AI] Checking ${player.hand.cards.length} cards in hand...`);
    for (const card of player.hand.cards) {
      try {
        const effect = CardProcessor.get(card.cardId);
        if (effect) {
          const canPlay = effect.canPlay(player, this.board);
          if (canPlay) {
            const onNight = this.game.generationCount || 1;
            const evaluator = new BoardEvaluator(this.board, this.game.players, onNight);
            
            let cardValue: number;
            let target: any = null;
            let steps: number | undefined = undefined;
            
            if (effect.getOptimalTarget) {
              const optimal = effect.getOptimalTarget(player, this.board, evaluator);
              cardValue = optimal.value;
              target = optimal.target;
              console.log(`  Card: ${card.name} (${card.cardId}) - canPlay: true, optimal value: ${cardValue.toFixed(2)}`);
            } else if (effect.targetType === 'none' || effect.getValidTargets(player, this.board).length === 0) {
              cardValue = effect.expectedValue(player, this.board, evaluator, null);
              console.log(`  Card: ${card.name} (${card.cardId}) - canPlay: true, value: ${cardValue.toFixed(2)}`);
            } else {
              const targets = effect.getValidTargets(player, this.board);
              let bestValue = -Infinity;
              let bestTarget = null;
              
              for (const t of targets) {
                const value = effect.expectedValue(player, this.board, evaluator, t);
                if (value > bestValue) {
                  bestValue = value;
                  bestTarget = t;
                }
              }
              
              cardValue = bestValue;
              target = bestTarget;
              console.log(`  Card: ${card.name} (${card.cardId}) - canPlay: true, best value: ${cardValue.toFixed(2)}`);
            }
            
            actions.push({
              type: 'card',
              target: target,
              value: cardValue,
              card: card,
              effect: effect,
              steps: steps
            });
          } else {
            console.log(`  Card: ${card.name} - canPlay: false (prerequisites not met)`);
          }
        } else {
          console.log(`  Card: ${card.name} - no effect found in registry`);
        }
      } catch (e) {
        console.error(`[AI] Error evaluating card ${card.name}:`, e);
      }
    }

    return actions;
  }

  private hasValidTargetForOption(player: Player, option: any): boolean {
    const playerPos = this.board.getPlayerPosition(player);
    
    if (option.targetType === 'player') {
      const game = CardProcessor.getGame();
      if (game) {
        for (const p of game.players) {
          if (p !== player && !p.isEliminated && option.canUse(player, this.board, p)) {
            return true;
          }
        }
      }
    } else if (option.targetType === 'cell') {
      if (playerPos) {
        if (option.id === 'bungler_move_trap') {
          const allTraps = this.board.getAllTraps();
          for (const trap of allTraps) {
            if (option.canUse(player, this.board, trap)) {
              return true;
            }
          }
          return false;
        }
        if (option.id === 'track_jump' || option.id === 'game_gymnastics_training') {
          const cell = this.board.getCell(playerPos.x, playerPos.y);
          if (cell) {
            for (const neighbor of this.board.getNeighbors(cell)) {
              if (neighbor.hasPlayer || neighbor.hasTrap) {
                const dx = neighbor.x - playerPos.x;
                const dy = neighbor.y - playerPos.y;
                const landingX = playerPos.x + dx * 2;
                const landingY = playerPos.y + dy * 2;
                const landingCell = this.board.getCell(landingX, landingY);
                if (landingCell && landingCell.isEmpty && !landingCell.isHole) {
                  if (option.canUse(player, this.board, neighbor)) {
                    return true;
                  }
                }
              }
            }
          }
          return false;
        }
        
        // Normal cell targeting
        const allCells = this.board.getAllCells().filter(c => !c.isHole);
        for (const cell of allCells) {
          if (option.canUse(player, this.board, cell)) {
            return true;
          }
        }
      }
    } else if (option.targetType === 'zombie') {
      const playerPos = this.board.getPlayerPosition(player);
      if (playerPos) {
        const cell = this.board.getCell(playerPos.x, playerPos.y);
        if (cell) {
          for (const neighbor of this.board.getNeighbors(cell)) {
            if (neighbor.hasZombie && option.canUse(player, this.board, neighbor)) {
              return true;
            }
          }
        }
      }
    } else if (option.targetType === 'path' || option.targetType === 'none') {
      return option.canUse(player, this.board);
    }
    
    return false;
  }

  private evaluateCard(player: Player, card: any, effect: any, target: any): number {
    try {
      if (effect.expectedValue) {
        const value = effect.expectedValue(player, this.board, this.evaluator, target);
        return value;
      }
      console.warn(`[AI] Card ${card.name} has no expectedValue, using cost as value`);
      return effect.cost || 0;
    } catch (e) {
      console.error(`[AI] Error evaluating card ${card.name}:`, e);
      return -10;
    }
  }

  private getTrapTargets(player: Player): BoardCell[] {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return [];

    const zombies = this.board.getAllZombies();
    const emptyCells = this.board.getAllCells().filter(c => 
      c.isEmpty && !c.isHole && !this.usedCells.has(`${c.x},${c.y}`)
    );

    return emptyCells.filter(c => {
      const distFromPlayer = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
      if (distFromPlayer > 2) return false;

      for (const zombie of zombies) {
        const dist = Math.abs(c.x - zombie.x) + Math.abs(c.y - zombie.y);
        if (dist <= 2) return true;
      }
      return false;
    });
  }

  private getBaitTargets(player: Player): BoardCell[] {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return [];

    const emptyCells = this.board.getAllCells().filter(c => 
      c.isEmpty && !c.isHole && !this.usedCells.has(`${c.x},${c.y}`)
    );

    return emptyCells.filter(c => {
      const dist = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
      return dist <= 3;
    });
  }

  private getBarricadeTargets(player: Player): BoardCell[] {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return [];

    const zombies = this.board.getAllZombies();
    const emptyCells = this.board.getAllCells().filter(c => 
      c.isEmpty && !c.isHole && !this.usedCells.has(`${c.x},${c.y}`)
    );

    return emptyCells.filter(c => {
      const distFromPlayer = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
      if (distFromPlayer > 2) return false;

      for (const zombie of zombies) {
        const dist = Math.abs(c.x - zombie.x) + Math.abs(c.y - zombie.y);
        if (dist <= 2) return true;
      }
      return false;
    });
  }

  public executeAction(player: Player, action: AIAction): boolean {
    try {
      switch (action.type) {
        case 'melee':
          return this.executeMelee(player, action.target);

        case 'trap': {
          try {
            const cell = this.board.getCell(action.target.x, action.target.y);
            if (!cell) {
              console.log(`[AI] Trap target cell not found`);
              return false;
            }
            if (player.gold < this.TRAP_COST) {
              console.log(`[AI] Not enough gold`);
              return false;
            }
            
            console.log(`[AI] Cell (${cell.x},${cell.y}) status:`);
            console.log(`  isEmpty: ${cell.isEmpty}`);
            console.log(`  isHole: ${cell.isHole}`);
            console.log(`  hasTrap: ${cell.hasTrap}`);
            console.log(`  hasBarricade: ${cell.hasBarricade}`);
            console.log(`  hasBait: ${cell.hasBait}`);
            console.log(`  hasPlayer: ${cell.hasPlayer}`);
            console.log(`  hasZombie: ${cell.hasZombie}`);
            console.log(`  structureType: ${cell.structureType}`);
            console.log(`  structureOwner: ${cell.structureOwner?.name || 'none'}`);
            
            if (cell.hasPlayer && cell.structureOwner === player) {
              console.log(`[AI] WARNING: Cell (${cell.x},${cell.y}) incorrectly has ${player.name} on it. Removing...`);
              cell.removePlayer();
            }
            
            if (!cell.isEmpty || cell.isHole) {
              console.log(`[AI] Cell not available for trap placement`);
              return false;
            }
            
            cell.setTrap(player);
            player.gold -= this.TRAP_COST;
            this.usedCells.add(`${cell.x},${cell.y}`);
            console.log(`[AI] ${player.name} placed trap at (${cell.x},${cell.y})`);
            return true;
          } catch (error) {
            console.error(`[AI] Error placing trap:`, error);
            return false;
          }
        }
        case 'jump': {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return false;
    const currentCell = this.board.getCell(pos.x, pos.y);
    if (!currentCell) return false;

    const targetCell = action.target;
    // Verify distance is exactly 2 in one axis
    const dx = Math.abs(targetCell.x - pos.x);
    const dy = Math.abs(targetCell.y - pos.y);
    if ((dx !== 2 || dy !== 0) && (dx !== 0 || dy !== 2)) {
        console.log(`[AI] Jump target not exactly 2 steps away`);
        return false;
    }
    const midX = (pos.x + targetCell.x) / 2;
    const midY = (pos.y + targetCell.y) / 2;
    const midCell = this.board.getCell(midX, midY);
    if (!midCell || (!midCell.hasTrap && !midCell.hasBarricade)) {
        console.log(`[AI] Middle cell does not have trap or barricade`);
        return false;
    }
    if (!targetCell.isEmpty || targetCell.isHole) {
        console.log(`[AI] Landing cell not available`);
        return false;
    }
    if (player.gold < this.JUMP_COST) {
        console.log(`[AI] Not enough gold for jump`);
        return false;
    }

    // Spend total cost
    player.spendGold(this.JUMP_COST);
    // Pay toll to owner of obstacle (if any and not self)
    const owner = midCell.structureOwner;
    if (owner && owner !== player) {
        owner.addGold(this.JUMP_TOLL);
        console.log(`[AI] Paid ${this.JUMP_TOLL} gold toll to ${owner.name}`);
    }
     if (owner && owner == player) {
        owner.addGold(this.JUMP_TOLL);
        console.log(`[AI] Paid ${this.JUMP_TOLL} gold toll to themself`);
    }
    player.addGold(player.getObstacleJumpRefund());

    // Move player
    currentCell.clear();
    targetCell.setPlayer(player);
    console.log(`[AI] ${player.name} jumped to (${targetCell.x},${targetCell.y})`);
    return true;
}
  case 'move': {
  if (player.gold < this.MOVE_COST) return false;
  const currentPos = this.board.getPlayerPosition(player);
  if (!currentPos) return false;
  const currentCell = this.board.getCell(currentPos.x, currentPos.y);
  if (!currentCell) return false;

  const targetCell = this.board.getCell(action.target.x, action.target.y);
  if (!targetCell) {
    console.log(`[AI] Target cell (${action.target.x},${action.target.y}) not found`);
    return false;
  }

  if (!targetCell.isEmpty || targetCell.isHole || targetCell.hasBarricade || targetCell.hasTrap) {
    console.log(`[AI] Target cell (${targetCell.x},${targetCell.y}) is not available`);
    return false;
  }

  // ===== SAFETY TIMEOUT FOR PATHFINDING =====
  let path: BoardCell[] | null = null;
  let pathfindingDone = false;
  let pathfindingError: Error | null = null;

  const pathTimeout = setTimeout(() => {
    if (!pathfindingDone) {
      console.log(`[AI] ⚠️ PATHFINDING TIMEOUT for ${player.name} from (${currentPos.x},${currentPos.y}) to (${targetCell.x},${targetCell.y})`);
      pathfindingDone = true;
      pathfindingError = new Error('Pathfinding timeout');
    }
  }, 500);

  try {
    path = this.board.findShortestPathHuman(
      currentPos.x, currentPos.y,
      targetCell.x, targetCell.y,
      true
    );
    pathfindingDone = true;
    clearTimeout(pathTimeout);
  } catch (error) {
    clearTimeout(pathTimeout);
    pathfindingDone = true;
    pathfindingError = error as Error;
    console.log(`[AI] Pathfinding error:`, error);
  }

  if (pathfindingError || !path || path.length < 2) {
    console.log(`[AI] No valid path to (${targetCell.x},${targetCell.y}) - skipping move`);
    return false;
  }

  if (targetCell.hasPlayer && targetCell.structureOwner === player) {
    console.log(`[AI] WARNING: Target cell (${targetCell.x},${targetCell.y}) incorrectly has ${player.name} on it. Removing...`);
    targetCell.removePlayer();
  }

  currentCell.clear();
  targetCell.setPlayer(player);
  const steps = action.steps || (Math.abs(targetCell.x - currentPos.x) + Math.abs(targetCell.y - currentPos.y));
  const totalCost = steps * this.MOVE_COST;
  player.gold -= totalCost;
  
  console.log(`[AI] ${player.name} moved to (${targetCell.x},${targetCell.y}) cost: ${totalCost}`);
  return true;
}

        case 'bait': {
          const cell = this.board.getCell(action.target.x, action.target.y);
          if (!cell) {
            console.log(`[AI] Bait target cell not found`);
            return false;
          }
          if (player.gold < this.BAIT_COST) {
            console.log(`[AI] Not enough gold for bait`);
            return false;
          }
          
          if (cell.hasPlayer && cell.structureOwner === player) {
            console.log(`[AI] WARNING: Cell (${cell.x},${cell.y}) incorrectly has ${player.name} on it. Removing...`);
            cell.removePlayer();
          }
          
          if (!cell.isEmpty || cell.isHole) {
            console.log(`[AI] Cell not available for bait placement`);
            return false;
          }
          
          cell.setBait(player);
          player.gold -= this.BAIT_COST;
          this.usedCells.add(`${cell.x},${cell.y}`);
          console.log(`[AI] ${player.name} placed bait at (${cell.x},${cell.y})`);
          return true;
        }

        case 'barricade': {
          const cell = this.board.getCell(action.target.x, action.target.y);
          if (!cell) {
            console.log(`[AI] Barricade target cell not found`);
            return false;
          }
          if (player.gold < this.BARRICADE_COST) {
            console.log(`[AI] Not enough gold for barricade`);
            return false;
          }
          
          if (cell.hasPlayer && cell.structureOwner === player) {
            console.log(`[AI] WARNING: Cell (${cell.x},${cell.y}) incorrectly has ${player.name} on it. Removing...`);
            cell.removePlayer();
          }
          
          if (!cell.isEmpty || cell.isHole) {
            console.log(`[AI] Cell not available for barricade placement`);
            return false;
          }
          
          cell.setBarricade(player);
          player.gold -= this.BARRICADE_COST;
          this.usedCells.add(`${cell.x},${cell.y}`);
          console.log(`[AI] ${player.name} placed barricade at (${cell.x},${cell.y})`);
          return true;
        }

        case 'special': {
          if (!action.specialAction) return false;
          
          const { actionDef, option } = action.specialAction;
          
          console.log(`[AI] Executing special option: ${option.id} - ${option.name}`);
          
          if (player.actionManager && player.actionManager.isActionUsed(actionDef.id)) {
            console.log(`[AI] Special action ${option.name} already used this night`);
            return false;
          }
          
          // MARK AS USED BEFORE EXECUTION (to prevent retries)
          if (player.actionManager) {
            player.actionManager.useAction(actionDef.id);
          }
          
          // Check if the option has autoExecute
          if (option.autoExecute) {
            const onNight = this.game.generationCount || 1;
            const evaluator = new BoardEvaluator(this.board, this.game.players, onNight);
            const result = option.autoExecute(player, this.board, evaluator);
            if (result.success) {
              console.log(`[AI] ${player.name} auto-executed special action: ${option.name}`);
              return true;
            } else {
              console.log(`[AI] ${player.name} auto-execute failed: ${result.message}`);
              return false;
            }
          }
          
          // Fallback to regular execution with stored target
          const goldCost = option.goldCost || 0;
          if (player.gold < goldCost) {
            console.log(`[AI] Not enough gold for special action (need ${goldCost}, have ${player.gold})`);
            return false;
          }
          
          if (option.canUse && !option.canUse(player, this.board, action.target)) {
            console.log(`[AI] Special action ${option.name} no longer valid`);
            return false;
          }
          
          const result = option.execute(player, this.board, action.target);
          
          if (result.success) {
            if (goldCost > 0) {
              player.gold -= goldCost;
            }
            console.log(`[AI] ${player.name} used special action: ${option.name}`);
            return true;
          } else {
            console.log(`[AI] ${player.name} failed to use special action: ${result.message}`);
            return false;
          }
        }

        case 'card': {
          if (!action.card || !action.effect) return false;
          
          const cost = action.effect.cost || 0;
          if (player.gold < cost) return false;
          
          let target = action.target;
          if (!target && action.effect.getOptimalTarget) {
            const onNight = this.game.generationCount || 1;
            const evaluator = new BoardEvaluator(this.board, this.game.players, onNight);
            const optimal = action.effect.getOptimalTarget(player, this.board, evaluator);
            target = optimal.target;
            console.log(`[AI] ${player.name} using optimal target for ${action.card.name} value: ${optimal.value.toFixed(2)}`);
          }
          
          const result = CardProcessor.playCard(
            action.card.cardId,
            player,
            this.board,
            this.game,
            target
          );
          
          if (result.success) {
            player.gold -= cost;
            player.moveCardToPlayedPile(action.card.id);
            console.log(`[AI] ${player.name} played ${action.card.name} successfully`);
            if (result.gameUpdates) {
              Object.assign(this.game, result.gameUpdates);
            }
            return true;
          } else {
            console.log(`[AI] ${player.name} failed to play ${action.card.name}: ${result.message}`);
            return false;
          }
        }

        default:
          return false;
      }
    } catch (error) {
      console.error(`[AI] Error executing ${action.type}:`, error);
      return false;
    }
  }

  private executeMelee(player: Player, target: BoardCell): boolean {
    if (!target.hasZombie) return false;
    if (player.gold < this.MELEE_COST) return false;

    const successRate = player.getMeleeEffectiveness() / 6;
    const roll = Math.random();

    player.gold -= this.MELEE_COST;

    if (roll >= successRate) {
      console.log(`[AI] ${player.name} missed melee attack on zombie at (${target.x},${target.y})`);
      return true;
    }

    target.clear();
    player.addSPs(2);
    console.log(`[AI] ${player.name} killed zombie at (${target.x},${target.y}) with melee!`);
    return true;
  }
  
  private getMeleeValue(player: Player, target: BoardCell): number {
    const spValue = 16 - this.onNight;
    const effectiveness = player.getMeleeEffectiveness();
    const boardDelta = this.evaluator.getZombieKillValue(player, target);
    const expectedValue = (effectiveness / 8) * (2 * spValue + boardDelta);
    return expectedValue;
  }

  private getTrapValue(player: Player, target: BoardCell): number {
    const spValue = 16 - this.onNight;
    const effectiveness = player.getTrapEffectiveness();
    const boardDelta = this.evaluator.getTrapPlacementValue(player, target);
    const expectedValue = spValue + (effectiveness / 8) * (spValue + boardDelta);
    return expectedValue;
  }

  private getBarricadeValue(player: Player, target: BoardCell): number {
    const spValue = 16 - this.onNight;
    const effectiveness = player.getBarricadeEffectiveness();
    const boardDelta = this.evaluator.getBarricadePlacementValue(player, target);
    const baseValue = spValue + 4 * (8 / Math.max(effectiveness, 1));
    return baseValue + boardDelta;
  }

  private getBaitValue(player: Player, target: BoardCell): number {
    const boardDelta = this.evaluator.getBaitPlacementValue(player, target);
    return boardDelta;
  }

  private getMoveValue(player: Player, target: BoardCell): number {
    const boardDelta = this.evaluator.getMoveValue(player, target);
    return boardDelta;
  }

  private getReachableCells(player: Player, maxSteps: number): BoardCell[] {
    const pos = this.board.getPlayerPosition(player);
    if (!pos) return [];

    const currentCell = this.board.getCell(pos.x, pos.y);
    if (!currentCell) return [];

    const reachable: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: currentCell, dist: 0 }];
    visited.add(`${currentCell.x},${currentCell.y}`);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;

      if (dist > 0 && dist <= maxSteps && cell.isEmpty && !cell.isHole) {
        reachable.push(cell);
      }

      if (dist < maxSteps) {
        for (const neighbor of this.board.getNeighbors(cell)) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (visited.has(key)) continue;
          if (neighbor.hasBarricade || neighbor.hasPlayer || neighbor.hasZombie) continue;
          if (neighbor.isHole) continue;
          visited.add(key);
          queue.push({ cell: neighbor, dist: dist + 1 });
        }
      }
    }

    const zombies = this.board.getAllZombies();
    reachable.sort((a, b) => {
      const distA = this.getDistanceToNearestZombie(a, zombies);
      const distB = this.getDistanceToNearestZombie(b, zombies);
      return distB - distA;
    });

    return reachable.slice(0, 10);
  }

  private getDistanceToNearestZombie(cell: BoardCell, zombies: BoardCell[]): number {
    let minDist = Infinity;
    for (const zombie of zombies) {
      const dist = Math.abs(zombie.x - cell.x) + Math.abs(zombie.y - cell.y);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }
}