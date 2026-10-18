// src/game/actions/StructurePlacement.ts

import { Board, BoardCell, Player, CardProcessor } from '../index';
import { HeroId } from '../misc/HeroId';
import { EventManager, StructureDestroyedEvent, StructurePlacedEvent, ZombieKilledEvent } from '../misc/EventManager';

export interface PlacementResult {
  success: boolean;
  message: string;
  spEarned: number;
  flexPointsEarned: number;
}

export class StructurePlacement {

  static awardPlacementSP(player: Player, type: 'trap' | 'barricade'): number {
    if (type === 'trap' && player.heroId === HeroId.ELSA_VON_TRAP) {
      return 0;
    }

    player.addSPs(1);
    return 1;
  }

  // ===== TRAP PLACEMENT =====

  static placeTrapWithEffects(board: Board, player: Player, target: BoardCell): PlacementResult {
    console.log(`[placeTrapWithEffects] Placing trap for ${player.name} at (${target.x},${target.y})`);
    
    if (!target || target.isHole || target.hasPlayer || target.hasZombie || target.hasStructure) {
      return { success: false, message: 'Invalid target', spEarned: 0, flexPointsEarned: 0 };
    }

    // Check trap limit
    const allTraps = board.getAllTraps();
    const playerTraps = allTraps.filter(c => c.structureOwner && c.structureOwner.id === player.id);
    const limit = player.getTrapLimit();
    
    if (playerTraps.length >= limit) {
      return { success: false, message: 'Trap limit reached', spEarned: 0, flexPointsEarned: 0 };
    }

    // Place the trap
    target.setTrap(player);

    // Emit structure placed event
    EventManager.getInstance().emit('structurePlaced', {
      cell: target,
      roomId: target.roomId || 'unknown',
      owner: player,
      type: 'trap',
      x: target.x,
      y: target.y,
    } as StructurePlacedEvent);

    const spEarned = StructurePlacement.awardPlacementSP(player, 'trap');

    return {
      success: true,
      message: `Trap placed at (${target.x},${target.y})`,
      spEarned,
      flexPointsEarned: 0
    };
  }

  static placeTrapWithoutEffects(board: Board, player: Player, target: BoardCell): PlacementResult {
    if (!target || !target.isEmpty || target.isHole || target.hasStructure) {
      return { success: false, message: 'Invalid target', spEarned: 0, flexPointsEarned: 0 };
    }

    const trapCount = board.getAllTraps().filter(c => c.structureOwner === player).length;
    const limit = player.getTrapLimit();
    if (trapCount >= limit) {
      return { success: false, message: 'Trap limit reached', spEarned: 0, flexPointsEarned: 0 };
    }

    target.setTrap(player);

    // Emit structure placed event (no effects)
    EventManager.getInstance().emit('structurePlaced', {
      cell: target,
      roomId: target.roomId || 'unknown',
      owner: player,
      type: 'trap',
      x: target.x,
      y: target.y,
    } as StructurePlacedEvent);

    return {
      success: true,
      message: `Trap placed at (${target.x},${target.y}) (no effects)`,
      spEarned: 0,
      flexPointsEarned: 0
    };
  }

  // ===== BARRICADE PLACEMENT =====

  static placeBarricadeWithEffects(board: Board, player: Player, targetCell: BoardCell): PlacementResult {
    if (!targetCell || targetCell.isHole || targetCell.hasPlayer || targetCell.hasZombie || targetCell.hasStructure) {
      return { success: false, message: 'Invalid cell', spEarned: 0, flexPointsEarned: 0 };
    }

    const barricadeCount = board.getAllBarricades().filter(c => c.structureOwner === player).length;
    const limit = player.getBarricadeLimit();
    if (barricadeCount >= limit) {
      return { success: false, message: 'Barricade limit reached', spEarned: 0, flexPointsEarned: 0 };
    }

    targetCell.setBarricade(player);

    // Emit structure placed event
    EventManager.getInstance().emit('structurePlaced', {
      cell: targetCell,
      roomId: targetCell.roomId || 'unknown',
      owner: player,
      type: 'barricade',
      x: targetCell.x,
      y: targetCell.y,
    } as StructurePlacedEvent);

    const spEarned = StructurePlacement.awardPlacementSP(player, 'barricade');

    return {
      success: true,
      message: `Barricade placed at (${targetCell.x},${targetCell.y})`,
      spEarned,
      flexPointsEarned: 0
    };
  }

  static placeBarricadeWithoutEffects(board: Board, player: Player, targetCell: BoardCell): PlacementResult {
    if (!targetCell || targetCell.isHole || targetCell.hasStructure) {
      return { success: false, message: 'Invalid cell', spEarned: 0, flexPointsEarned: 0 };
    }

    if (!targetCell.isEmpty) {
      return { success: false, message: 'Cell must be empty to place barricade', spEarned: 0, flexPointsEarned: 0 };
    }

    const barricadeCount = board.getAllBarricades().filter(c => c.structureOwner === player).length;
    const limit = player.getBarricadeLimit();
    if (barricadeCount >= limit) {
      return { success: false, message: 'Barricade limit reached', spEarned: 0, flexPointsEarned: 0 };
    }

    targetCell.setBarricade(player);

    // Emit structure placed event (no effects)
    EventManager.getInstance().emit('structurePlaced', {
      cell: targetCell,
      roomId: targetCell.roomId || 'unknown',
      owner: player,
      type: 'barricade',
      x: targetCell.x,
      y: targetCell.y,
    } as StructurePlacedEvent);

    return {
      success: true,
      message: `Barricade placed at (${targetCell.x},${targetCell.y}) (no effects)`,
      spEarned: 0,
      flexPointsEarned: 0
    };
  }

  // ===== BAIT PLACEMENT =====

  static placeBaitWithEffects(board: Board, player: Player, target: BoardCell): PlacementResult {
    if (!target || !target.isEmpty || target.isHole) {
      return { success: false, message: 'Invalid target', spEarned: 0, flexPointsEarned: 0 };
    }

    target.setBait(player);

    // Emit structure placed event
    EventManager.getInstance().emit('structurePlaced', {
      cell: target,
      roomId: target.roomId || 'unknown',
      owner: player,
      type: 'bait',
      x: target.x,
      y: target.y,
    } as StructurePlacedEvent);

    let spEarned = 0;
    let flexPointsEarned = 0;

    // Trigger bait passives (Hallway Hustler: gain 1 gold when any player places bait)
    const game = CardProcessor.getGame();
    if (game) {
      for (const p of game.players) {
        if (p.baitGlobalRefund) {
          p.addGold(1);
        }
      }
    }

    return {
      success: true,
      message: `Bait placed at (${target.x},${target.y})`,
      spEarned,
      flexPointsEarned
    };
  }

  static placeBaitWithoutEffects(board: Board, player: Player, target: BoardCell): PlacementResult {
    if (!target || !target.isEmpty || target.isHole) {
      return { success: false, message: 'Invalid target', spEarned: 0, flexPointsEarned: 0 };
    }

    target.setBait(player);

    // Emit structure placed event (no effects)
    EventManager.getInstance().emit('structurePlaced', {
      cell: target,
      roomId: target.roomId || 'unknown',
      owner: player,
      type: 'bait',
      x: target.x,
      y: target.y,
    } as StructurePlacedEvent);

    return {
      success: true,
      message: `Bait placed at (${target.x},${target.y}) (no effects)`,
      spEarned: 0,
      flexPointsEarned: 0
    };
  }

  // ===== ZOMBIE BARRICADE INTERACTION =====

  static onBarricadeHeld(owner: Player, board: Board): PlacementResult {
    const flexPointsEarned = 1;

    return {
      success: true,
      message: `Barricade held - gained 1 flex point`,
      spEarned: 0,
      flexPointsEarned
    };
  }

  static onBarricadeDestroyed(owner: Player, board: Board, destroyedAt: BoardCell): PlacementResult {
    const spEarned = 0;

    // Emit structure destroyed event
    EventManager.getInstance().emit('structureDestroyed', {
      cell: destroyedAt,
      roomId: destroyedAt.roomId || 'unknown',
      owner: owner,
      type: 'barricade',
      x: destroyedAt.x,
      y: destroyedAt.y,
    } as StructureDestroyedEvent);

    return {
      success: true,
      message: `Barricade destroyed`,
      spEarned,
      flexPointsEarned: 0
    };
  }

  static onTrapKill(owner: Player, board: Board, trapCell: BoardCell): PlacementResult {
    const spEarned = 1 + (owner.heroId === HeroId.ELSA_VON_TRAP ? 1 : 0);
    owner.addSPs(spEarned);

    // Emit zombie killed event
    EventManager.getInstance().emit('zombieKilled', {
      cell: trapCell,
      roomId: trapCell.roomId || 'unknown',
      killedBy: owner,
      method: 'trap',
      x: trapCell.x,
      y: trapCell.y,
    } as ZombieKilledEvent);

    const game = CardProcessor.getGame();
    if (game) {
      for (const player of game.players) {
        if (player.dogTagsActive && !player.isEliminated) {
          player.gold += 2;
          game.emit('log', `${player.name} gained 2 gold from Dog Tags (trap killed zombie)`);
        }
      }
    }

    return {
      success: true,
      message: `Trap triggered`,
      spEarned,
      flexPointsEarned: 0
    };
  }

  static onTrapFailed(owner: Player, board: Board, trapCell: BoardCell): PlacementResult {
    // Emit structure destroyed event (trap is destroyed)
    EventManager.getInstance().emit('structureDestroyed', {
      cell: trapCell,
      roomId: trapCell.roomId || 'unknown',
      owner: owner,
      type: 'trap',
      x: trapCell.x,
      y: trapCell.y,
    } as StructureDestroyedEvent);

    let goldEarned = 0;

    // === PHIL T. RAGS (Janitor) Passive - Now handled by EventManager ===

    return {
      success: true,
      message: `Trap failed to activate`,
      spEarned: 0,
      flexPointsEarned: 0
    };
  }
}