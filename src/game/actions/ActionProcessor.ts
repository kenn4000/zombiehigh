// src/game/actions/ActionProcessor.ts

import { Player, Board, BoardEvaluator, CardProcessor, MovementUtil } from '../index';

export type ActionTargetType = 'cell' | 'wall' | 'player' | 'zombie' | 'path' | 'none';

export interface ActionOption {
  id: string;
  name: string;
  description: string;
  targetType: ActionTargetType;
  maxPathLength?: number;
  goldCost?: number;
  attackType?: 'melee';
  canUse: (player: Player, board: Board, target?: any) => boolean;
  execute: (player: Player, board: Board, target?: any) => { success: boolean; message: string };
  expectedValue: (player: Player, board: Board, evaluator: any, target?: any) => number;
  autoExecute?: (player: Player, board: Board, evaluator: any) => { success: boolean; message: string };
}

export interface ActionEffect {
  id: string;
  name: string;
  description: string;
  isDualOption: boolean;
  options: ActionOption[];
}

// ============================================================
// ACTION MANAGER - Per player, tracks available actions
// ============================================================

export class ActionManager {
  private actions: Map<string, ActionEffect> = new Map();
  private usedActions: Map<string, number> = new Map(); // actionId -> nightUsed
  private currentNight: number = 0;
  private player: Player | null = null;

  bindPlayer(player: Player): void {
    this.player = player;
    this.player.syncActionCards();
  }

  private syncPlayerActionCards(): void {
    if (this.player) {
      this.player.syncActionCards();
    }
  }

  /**
   * Set the current night for tracking when actions are used
   */
  setCurrentNight(night: number): void {
    this.currentNight = night;
  }

  /**
   * Get the current night
   */
  getCurrentNight(): number {
    return this.currentNight;
  }

  addAction(action: ActionEffect): void {
    if (!this.actions.has(action.id)) {
      this.actions.set(action.id, action);
      console.log(`[ActionManager] Added action: ${action.id} (${action.name})`);
      this.syncPlayerActionCards();
    } else {
      console.log(`[ActionManager] Action ${action.id} already exists`);
    }
  }

  removeAction(id: string): void {
    this.actions.delete(id);
    this.usedActions.delete(id);
    this.syncPlayerActionCards();
  }

  /**
   * Check if an action has been used this night
   */
  isActionUsed(id: string): boolean {
    const nightUsed = this.usedActions.get(id);
    return nightUsed === this.currentNight;
  }

  /**
   * Mark an action as used for the current night
   */
  useAction(id: string): boolean {
    if (this.isActionUsed(id)) return false;
    this.usedActions.set(id, this.currentNight);
    this.syncPlayerActionCards();
    return true;
  }

  /**
   * Reset all used actions (legacy method - kept for compatibility)
   * Now only clears actions from previous nights, preserving current night usage
   */
  reset(): void {
    for (const [id, night] of this.usedActions) {
      if (night !== this.currentNight) {
        this.usedActions.delete(id);
      }
    }
    this.syncPlayerActionCards();
  }

  /**
   * Reset for a new night - advances the night counter
   */
  advanceNight(newNight: number): void {
    if (newNight > this.currentNight) {
      this.currentNight = newNight;
      for (const [id, night] of this.usedActions) {
        if (night < this.currentNight) {
          this.usedActions.delete(id);
        }
      }
      this.syncPlayerActionCards();
    }
  }

  getAvailableActions(player: Player, board: Board): ActionEffect[] {
    const result: ActionEffect[] = [];
    console.log(`[ActionManager] getAvailableActions called for ${player?.name || 'unknown'}, checking ${this.actions.size} actions (Night ${this.currentNight})`);
    
    for (const [id, action] of this.actions) {
      if (this.isActionUsed(id)) {
        console.log(`[ActionManager]   ${id} - already used this night (Night ${this.currentNight})`);
        continue;
      }
      
      let anyUsable = false;
      for (const opt of action.options) {
        try {
          if (opt.targetType === 'none') {
            anyUsable = opt.canUse(player, board);
            if (anyUsable) break;
          } else {
            const validTargets = this.getValidTargetsForOption(player, board, opt);
            if (validTargets.length > 0) {
              anyUsable = true;
              break;
            }
          }
        } catch (e) {
          console.log(`[ActionManager]   ${id} - canUse threw error:`, e);
        }
      }
      
      if (anyUsable) {
        console.log(`[ActionManager]   ${id} - available`);
        result.push(action);
      } else {
        console.log(`[ActionManager]   ${id} - not usable (no options available)`);
      }
    }
    return result;
  }

  // Helper method to get valid targets for an option
  private getValidTargetsForOption(player: Player, board: Board, option: ActionOption): any[] {
    if (option.id === 'shoes_move' || option.id === 'shoes') {
      return MovementUtil.getShoesMoveTargets(board, player)
        .filter((target) => option.canUse(player, board, target));
    }

    const targets: any[] = [];
    if (option.targetType === 'player') {
      const game = CardProcessor.getGame();
      if (game) {
        for (const p of game.players) {
          if (p !== player && !p.isEliminated && option.canUse(player, board, p)) {
            targets.push(p);
          }
        }
      }
    } else if (option.targetType === 'cell') {
      const allCells = board.getAllCells();
      for (const cell of allCells) {
        if (option.canUse(player, board, cell)) {
          targets.push(cell);
        }
      }
    } else if (option.targetType === 'zombie') {
      for (const cell of board.getAllCells()) {
        if (cell.hasZombie && option.canUse(player, board, cell)) {
          targets.push(cell);
        }
      }
    } else if (option.targetType === 'wall' || option.targetType === 'path') {
      // For wall or path targets, check if the option is usable
      if (option.canUse(player, board)) {
        targets.push(null);
      }
    }
    
    return targets;
  }

  // Execute an option with auto-execution
  executeOptionAuto(
    player: Player,
    board: Board,
    actionId: string,
    optionIndex: number
  ): { success: boolean; message: string } {
    const action = this.actions.get(actionId);
    if (!action) {
      return { success: false, message: 'Action not available' };
    }
    if (this.isActionUsed(actionId)) {
      return { success: false, message: 'Action already used this night' };
    }
    
    const option = action.options[optionIndex];
    if (!option) {
      return { success: false, message: 'Option not found' };
    }

    if (option.id === 'shoes_move' || option.id === 'shoes') {
      const targets = MovementUtil.getShoesMoveTargets(board, player)
        .filter((target) => option.canUse(player, board, target));
      if (targets.length === 0) return { success: false, message: 'No valid Shoes movement available' };
      const game = CardProcessor.getGame();
      const evaluator = new BoardEvaluator(board, game?.players ?? [player], game?.generationCount || 1);
      const target = targets.reduce((best, candidate) =>
        evaluator.getMoveValue(player, candidate) > evaluator.getMoveValue(player, best) ? candidate : best
      );
      return this.executeOption(player, board, actionId, optionIndex, target);
    }
    
    if (option.autoExecute) {
      const game = CardProcessor.getGame();
      if (!game) {
        return { success: false, message: 'Game not available' };
      }
      
      const evaluator = new BoardEvaluator(board, game.players, game.generationCount || 1);
      const originalSpendGold = player.spendGold.bind(player);
      let spentDuringExecute = 0;

      player.spendGold = ((amount: number) => {
        const successful = originalSpendGold(amount);
        if (successful) {
          spentDuringExecute += amount;
        }
        return successful;
      }) as typeof player.spendGold;

      try {
        const result = option.autoExecute(player, board, evaluator);
        if (result.success) {
          this.useAction(actionId);
          if (option.goldCost && spentDuringExecute < option.goldCost) {
            player.spendGold(option.goldCost - spentDuringExecute);
          }
        }
        return result;
      } finally {
        player.spendGold = originalSpendGold;
      }
    }
    
    return { success: false, message: 'No autoExecute defined for this option' };
  }

  executeOption(
    player: Player,
    board: Board,
    actionId: string,
    optionIndex: number,
    target?: any
  ): { success: boolean; message: string } {
    const action = this.actions.get(actionId);
    if (!action) {
      return { success: false, message: 'Action not available' };
    }
    if (this.isActionUsed(actionId)) {
      return { success: false, message: 'Action already used this night' };
    }
    
    const option = action.options[optionIndex];
    if (!option) {
      return { success: false, message: 'Option not found' };
    }
    if (!option.canUse(player, board, target)) {
      return { success: false, message: 'Cannot use this action now' };
    }
    
    if (option.goldCost && player.gold < option.goldCost) {
      return { success: false, message: `Need ${option.goldCost} gold` };
    }

    const originalSpendGold = player.spendGold.bind(player);
    let spentDuringExecute = 0;

    player.spendGold = ((amount: number) => {
      const successful = originalSpendGold(amount);
      if (successful) {
        spentDuringExecute += amount;
      }
      return successful;
    }) as typeof player.spendGold;

    try {
      const result = option.execute(player, board, target);
      if (result.success) {
        this.useAction(actionId);
        if (option.goldCost && spentDuringExecute < option.goldCost) {
          player.spendGold(option.goldCost - spentDuringExecute);
        }
      }
      return result;
    } finally {
      player.spendGold = originalSpendGold;
    }
  }

  getExpectedValue(
    player: Player,
    board: Board,
    evaluator: any,
    actionId: string,
    optionIndex: number,
    target?: any
  ): number {
    const action = this.actions.get(actionId);
    if (!action) return -999;
    const option = action.options[optionIndex];
    if (!option) return -999;
    return option.expectedValue(player, board, evaluator, target);
  }

  getActionIds(): string[] {
    return Array.from(this.actions.keys());
  }

  getAllActions(): ActionEffect[] {
    return Array.from(this.actions.values());
  }

  getActionCount(): number {
    return this.actions.size;
  }

  clearActions(): void {
    this.actions.clear();
    this.usedActions.clear();
    this.syncPlayerActionCards();
  }

  getActionUsedNight(id: string): number | undefined {
    return this.usedActions.get(id);
  }

  hasEverBeenUsed(id: string): boolean {
    return this.usedActions.has(id);
  }

  getUsedActionsThisNight(): string[] {
    const result: string[] = [];
    for (const [id, night] of this.usedActions) {
      if (night === this.currentNight) {
        result.push(id);
      }
    }
    return result;
  }

  forceUseAction(id: string, night?: number): void {
    this.usedActions.set(id, night ?? this.currentNight);
    this.syncPlayerActionCards();
  }

  forceUnuseAction(id: string): void {
    this.usedActions.delete(id);
    this.syncPlayerActionCards();
  }
}

// ============================================================
// ACTION PROCESSOR - Global registry for all actions
// ============================================================

export class ActionProcessor {
  private static registry: Map<string, ActionEffect> = new Map();

  static register(action: ActionEffect): void {
    if (!this.registry.has(action.id)) {
      this.registry.set(action.id, action);
    }
  }

  static get(id: string): ActionEffect | undefined {
    return this.registry.get(id);
  }

  static getAll(): ActionEffect[] {
    return Array.from(this.registry.values());
  }

  static clear(): void {
    this.registry.clear();
  }
}