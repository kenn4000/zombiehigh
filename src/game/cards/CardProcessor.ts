// CardProcessor.ts
import { Player, Board, BoardCell, Game } from '../index';
import { registerLockerCards } from './LockerCards';

import { EventManager, CardPlayedEvent } from '../misc/EventManager';
import { registerPage1 } from './CardIndex/DeckPage1';
import { registerPage2 } from './CardIndex/DeckPage2';
import { registerPage3 } from './CardIndex/DeckPage3';
import { registerPage4 } from './CardIndex/DeckPage4';
import { registerPage5 } from './CardIndex/DeckPage5';
import { registerPage6 } from './CardIndex/DeckPage6';
import { registerPage7 } from './CardIndex/DeckPage7';
import { registerPage8 } from './CardIndex/DeckPage8';
import { registerPage9 } from './CardIndex/DeckPage9';
import { registerPage10 } from './CardIndex/DeckPage10';
import { registerPage11 } from './CardIndex/DeckPage11';
import { registerPage12 } from './CardIndex/DeckPage12';
import { registerPage13 } from './CardIndex/DeckPage13';
import { registerPage14 } from './CardIndex/DeckPage14';
import { registerPage15 } from './CardIndex/DeckPage15';
import { registerPage16 } from './CardIndex/DeckPage16';
import { registerPage17 } from './CardIndex/DeckPage17';
import { registerPage18 } from './CardIndex/DeckPage18';
import { registerPage19 } from './CardIndex/DeckPage19';
import { registerPage20 } from './CardIndex/DeckPage20';
import { registerPage21 } from './CardIndex/DeckPage21';
import { registerPage22 } from './CardIndex/DeckPage22';

export function registerAllCards(): void {
  registerPage1();
  registerPage2();
  registerPage3();
  registerPage4();
  registerPage5();
  registerPage6();
  registerPage7();
  registerPage8();
  registerPage9();
  registerPage10();
  registerPage11();
  registerPage12();
  registerPage13();
  registerPage14();
  registerPage15();
  registerPage16();
  registerPage17();
  registerPage18();
  registerPage19();
  registerPage20();
  registerPage21();
  registerPage22();
}

export type TargetType = 'cell' | 'player' | 'zombie' | 'path' | 'none' | 'multiple';

export interface CardEffect {
  id: string;
  name: string;
  cost: number;
  image: string;
  targetType: TargetType;
  maxTargets?: number;
  maxPathLength?: number;
  attackType?: 'melee';
  canPlay: (player: Player, board: Board, target?: any) => boolean;
  getValidTargets: (player: Player, board: Board) => any[];
  isValidTarget: (player: Player, board: Board, target: any) => boolean;
  execute: (player: Player, board: Board, target?: any) => { success: boolean; message: string; updates?: Partial<Game> };
  expectedValue: (player: Player, board: Board, evaluator: any, target?: any) => number;
  getOptimalTarget?: (player: Player, board: Board, evaluator: any) => { target: any; value: number };
  autoExecute?: (player: Player, board: Board, evaluator: any) => { success: boolean; message: string; updates?: Partial<Game> };
}

export interface CardResult {
  success: boolean;
  message: string;
  needsTarget: boolean;
  targetType?: TargetType;
  validTargets?: any[];
  cardId?: string;
  gameUpdates?: Partial<Game>;
}

export class CardProcessor {
  private static registry: Map<string, CardEffect> = new Map();
  private static gameInstance: any = null;
  private static initialized: boolean = false;

  // ===== GAME SETUP =====

  static setGame(game: any): void {
    this.gameInstance = game;
    if (!this.initialized) {
      registerAllCards();
      registerLockerCards(); // Register locker cards with CardProcessor
      this.initialized = true;
    }
  }

  static getGame(): any {
    return this.gameInstance;
  }

  // ===== REGISTRY =====

  static register(card: CardEffect): void {
    if (this.registry.has(card.id)) {
      console.log(`[CardProcessor] Card ${card.id} already registered, skipping`);
      return;
    }
    this.registry.set(card.id, card);
  }

  static get(id: string): CardEffect | undefined {
    return this.registry.get(id);
  }

  static getAll(): CardEffect[] {
    return Array.from(this.registry.values());
  }

  static clear(): void {
    this.registry.clear();
    this.initialized = false;
  }

  // ===== PLAY CARD =====

  static playCard(
    cardId: string,
    player: Player,
    board: Board,
    game: Game,
    target?: any
  ): CardResult {
    this.gameInstance = game;
    const card = this.get(cardId);
    if (!card) {
      return { success: false, message: `Card '${cardId}' not found in registry`, needsTarget: false };
    }

    if (!this.canPlayCard(card, player, board, game)) {
      return { success: false, message: 'Prerequisites not met or no valid targets', needsTarget: false };
    }

    // If card needs a target and none provided
    if (card.targetType !== 'none' && !target) {
      const validTargets = this.getValidTargets(card, board, game, player);
      return {
        success: true,
        message: 'Select target',
        needsTarget: true,
        targetType: card.targetType,
        validTargets,
        cardId
      };
    }

    const normalizedTarget = this.normalizeTargetForPlay(card, board, game, player, target);

    // Validate target shape before running effects.
    if (card.targetType !== 'none' && normalizedTarget !== undefined && normalizedTarget !== null && !card.isValidTarget(player, board, normalizedTarget)) {
      return { success: false, message: `Invalid target for ${card.name}`, needsTarget: false };
    }

    // Check prerequisites (with target if provided)
    if (!card.canPlay(player, board, normalizedTarget)) {
      return { success: false, message: 'Prerequisites not met', needsTarget: false };
    }

    // Execute the card
    const result = card.execute(player, board, normalizedTarget);
    
    if (result.success) {
      // ===== EMIT CARD PLAYED EVENT =====
      EventManager.getInstance().emit('cardPlayed', {
        player: player,
        cardId: cardId,
        cardName: card.name,
        cost: card.cost || 0,
        spGained: 0,
        goldGained: 0,
        cpGained: 0,
        npGained: 0,
      } as CardPlayedEvent);

      return {
        success: result.success,
        message: result.message,
        needsTarget: false,
        gameUpdates: result.updates
      };
    }

    return {
      success: result.success,
      message: result.message,
      needsTarget: false,
      gameUpdates: result.updates
    };
  }

  static canPlayCard(card: CardEffect, player: Player, board: Board, _game: Game): boolean {
    return card.canPlay(player, board);
  }

  // ===== GET VALID TARGETS =====

  static normalizeTargetForPlay(card: CardEffect, board: Board, game: Game, player: Player, target: any): any {
    if (card.targetType === 'player' && target && typeof target === 'object' && 'x' in target && 'y' in target) {
      return board.getCell(Number(target.x), Number(target.y))?.structureOwner ?? target;
    }
    if (card.targetType !== 'path' || target === undefined || target === null) {
      return target;
    }

    if (Array.isArray(target) && target.length > 0) {
      return target.map((entry: any) => {
        if (!entry || typeof entry !== 'object' || !('x' in entry) || !('y' in entry)) return entry;
        return board.getCell(Number(entry.x), Number(entry.y)) ?? entry;
      });
    }

    if (!target || typeof target !== 'object' || !('x' in target) || !('y' in target)) {
      return target;
    }

    const validTargets = this.getValidTargets(card, board, game, player);
    const matchingPath = validTargets.find((candidate: any) => {
      if (!Array.isArray(candidate) || candidate.length === 0) return false;
      const lastCell = candidate[candidate.length - 1];
      return !!lastCell && Number(lastCell.x) === Number(target.x) && Number(lastCell.y) === Number(target.y);
    });

    return matchingPath ?? target;
  }

  static getValidTargets(card: CardEffect, board: Board, game: Game, player: Player): any[] {
    // If card has its own getValidTargets, use it
    if (card.getValidTargets) {
      return card.getValidTargets(player, board);
    }

    switch (card.targetType) {
      case 'cell':
        return board.getAllCells().filter(c => 
          !c.isHole && 
          c.isEmpty && 
          card.canPlay(player, board, c)
        );
      case 'player':
        return game.players.filter((p: Player) => 
          !p.isEliminated && 
          p !== player && 
          card.canPlay(player, board, p)
        );
      case 'zombie':
        return board.getAllCells().filter(c => 
          c.hasZombie && 
          card.canPlay(player, board, c)
        );
      case 'multiple':
        return board.getAllCells().filter(c => c.isEmpty && !c.isHole);
      case 'path':
        const paths: any[] = [];
        const pos = board.getPlayerPosition(player);
        if (!pos) return [];
        
        const startCell = board.getCell(pos.x, pos.y);
        if (!startCell) return [];
        
        const maxSteps = card.maxPathLength || 2;
        const visited = new Set<string>();
        const queue: { cell: BoardCell; dist: number; path: BoardCell[] }[] = [
          { cell: startCell, dist: 0, path: [startCell] }
        ];
        visited.add(startCell.id);
        
        while (queue.length > 0) {
          const { cell, dist, path } = queue.shift()!;
          
          if (dist > 0 && dist <= maxSteps && cell.isEmpty && !cell.isHole) {
            // Check if path is valid (doesn't cross barricades)
            const isValidPath = path.every(step => step.isEmpty || step.isHole === false);
            if (isValidPath && card.canPlay(player, board, path)) {
              paths.push({ path, steps: dist, finalCell: cell });
            }
          }
          
          if (dist < maxSteps) {
            for (const neighbor of board.getNeighbors(cell)) {
              // Can't move through barricades, players, or zombies
              if (!visited.has(neighbor.id) && 
                  neighbor.isEmpty && 
                  !neighbor.isHole &&
                  !neighbor.hasBarricade &&
                  !neighbor.hasPlayer &&
                  !neighbor.hasZombie) {
                visited.add(neighbor.id);
                queue.push({ cell: neighbor, dist: dist + 1, path: [...path, neighbor] });
              }
            }
          }
        }
        return paths;
      default:
        return [];
    }
  }

  // ===== TARGET QUERIES =====

  static getTargetType(cardId: string): TargetType | null {
    const card = this.get(cardId);
    return card ? card.targetType : null;
  }

  static needsTarget(cardId: string): boolean {
    const card = this.get(cardId);
    return card ? card.targetType !== 'none' : false;
  }

  // ===== UTILITY =====

  static getCardCount(): number {
    return this.registry.size;
  }

  static isRegistered(cardId: string): boolean {
    return this.registry.has(cardId);
  }
}