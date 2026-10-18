import { Player, Board, BoardCell, StructurePlacement, MovementUtil, CardProcessor, CardDrawer } from '../index';

export class ActionHandlers {

  // ============================================================
  // STANDARD ACTIONS
  // ============================================================

  /**
   * Move player 1 step
   * @param player - The player
   * @param board - The board
   * @param targetCell - The target cell
   * @param payBarricades - Whether to pay for barricades (default true)
   * @returns success and message
   */
  static move(
    player: Player,
    board: Board,
    targetCell: BoardCell,
    payBarricades: boolean = true
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const currentCell = board.getCell(pos.x, pos.y);
    if (!currentCell) {
      return { success: false, message: 'Current cell not found' };
    }

    if (currentCell === targetCell) {
      return { success: false, message: 'Already at target' };
    }

    // Check if walkable
    if (!targetCell.isEmpty || targetCell.isHole) {
      return { success: false, message: 'Target is not walkable' };
    }

    const neighbors = board.getNeighbors(currentCell);
    const isAdjacent = neighbors.includes(targetCell);
    const isJumpTarget = !isAdjacent && ((Math.abs(targetCell.x - currentCell.x) === 2 && Math.abs(targetCell.y - currentCell.y) === 0) || (Math.abs(targetCell.x - currentCell.x) === 0 && Math.abs(targetCell.y - currentCell.y) === 2));

    let middleCell: BoardCell | null = null;
    if (!isAdjacent && isJumpTarget) {
      const midX = (currentCell.x + targetCell.x) / 2;
      const midY = (currentCell.y + targetCell.y) / 2;
      middleCell = board.getCell(midX, midY);
      if (!middleCell || !(middleCell.hasBarricade || middleCell.hasTrap)) {
        return { success: false, message: 'Target must be adjacent or require a valid leap over a barricade/trap' };
      }
    }

    if (!isAdjacent && !isJumpTarget) {
      return { success: false, message: 'Target must be adjacent or valid jump target' };
    }

    const movementCost = player.getMovementCost(board, targetCell);
    const jumpToll = middleCell ? player.getObstacleJumpToll() : 0;
    const totalCost = movementCost + jumpToll;
    if (player.gold < totalCost) {
      return { success: false, message: `Need ${totalCost} gold to move` };
    }
    player.spendGold(totalCost);

    const moveNotes: string[] = [];
    let tollPaid = 0;
    const jumpOwner = middleCell?.structureOwner;
    if (middleCell && (middleCell.hasBarricade || middleCell.hasTrap) && jumpOwner) {
      if (!payBarricades) {
        return { success: false, message: 'Barricade/trap blocks path' };
      }
      tollPaid = jumpToll;
      moveNotes.push(` (jumped over ${middleCell.hasBarricade ? 'barricade' : 'trap'} and paid ${jumpToll} gold toll)`);
      if (jumpOwner !== player) {
        moveNotes.push(` (${jumpOwner.name} receives 1 gold)`);
        jumpOwner.addGold(1);
      } else {
        player.addGold(1);
        moveNotes.push(` (${player.name} receives 1 gold)`);
      }
    }

    if (targetCell.hasBarricade && targetCell.structureOwner && targetCell.structureOwner !== player) {
      if (!payBarricades) {
        return { success: false, message: 'Barricade blocks path' };
      }
      const hasRefund = player.barricadeCrossRefund === true;
      const toll = 2;
      if (player.gold < toll) {
        return { success: false, message: `Need ${toll} gold to cross barricade` };
      }
      player.spendGold(toll);
      tollPaid += toll;
      const barricadeOwner = targetCell.structureOwner;
      moveNotes.push(` (paid ${toll} gold toll)`);
      moveNotes.push(` (${barricadeOwner.name} receives 1 gold)`);
      barricadeOwner.addGold(1);
      if (hasRefund) {
        player.addGold(2);
      }
    }

    currentCell.clear();
    targetCell.setPlayer(player);

    if (middleCell && (middleCell.hasBarricade || middleCell.hasTrap)) {
      const refund = player.getObstacleJumpRefund();
      if (refund > 0) {
        player.addGold(refund);
        moveNotes.push(` (Influencer refunded ${refund} gold)`);
      }
    }

    return {
      success: true,
      message: `Moved to (${targetCell.x}, ${targetCell.y})${moveNotes.join('')}`
    };
  }

  /**
   * Melee attack adjacent zombie
   */
  static melee(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const currentCell = board.getCell(pos.x, pos.y);
    if (!currentCell) {
      return { success: false, message: 'Current cell not found' };
    }

    if (!targetCell.hasZombie) {
      return { success: false, message: 'No zombie at target' };
    }

    const neighbors = board.getNeighbors(currentCell);
    if (!neighbors.includes(targetCell)) {
      return { success: false, message: 'Target must be adjacent' };
    }

    const meleeCost = player.getMeleeCost();
    if (player.gold < meleeCost) {
      return { success: false, message: `Need ${meleeCost} gold for melee` };
    }
    player.spendGold(meleeCost);

    // Calculate success rate
    const effectiveness = player.getMeleeEffectiveness(); // 1-5
    const successRate = effectiveness / 6;
    const roll = Math.random();

    if (roll > successRate) {
      return { success: true, message: 'Melee attack missed!' };
    }

    // Kill zombie with credit
    const game = CardProcessor.getGame();
    if (game && game.zombieManager) {
      player.addSPs(2);
      const result = game.zombieManager.killZombie(targetCell, player);
      if (!result.success) {
        return { success: false, message: result.message };
      }
      
      // Check melee kill draw passive (Check Its Pockets)
      if (player.meleeKillDraw) {
        const drawResult = CardDrawer.drawCards(player, 1);
        return {
          success: true,
          message: `Melee killed zombie! (drew 1 card from Check Its Pockets)`
        };
      }
      
      return {
        success: true,
        message: `Melee killed zombie!`
      };
    }

    targetCell.clear();
    return { success: true, message: 'Melee killed zombie!' };
  }

  /**
   * Place a trap (standard action)
   */
  static placeTrap(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const resolvedTarget = board.getCell(targetCell?.x ?? -1, targetCell?.y ?? -1) ?? targetCell;
    if (!resolvedTarget || !resolvedTarget.isEmpty || resolvedTarget.isHole) {
      return { success: false, message: 'Invalid target' };
    }

    targetCell = resolvedTarget;

    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    if (dist > 3) {
      return { success: false, message: 'Target must be within 3 tiles' };
    }

    const trapCost = player.getTrapCost();
    if (player.gold < trapCost) {
      return { success: false, message: `Need ${trapCost} gold for trap` };
    }

    const result = StructurePlacement.placeTrapWithEffects(board, player, targetCell);
    if (!result.success) {
      return result;
    }

    player.spendGold(trapCost);

    return {
      success: true,
      message: `Placed trap at (${targetCell.x}, ${targetCell.y}) - gained ${result.spEarned} SP`
    };
  }

  /**
   * Place a barricade (standard action) - now on a single cell
   */
  static placeBarricade(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const resolvedTarget = board.getCell(targetCell?.x ?? -1, targetCell?.y ?? -1) ?? targetCell;
    if (!resolvedTarget || resolvedTarget.isHole) {
      return { success: false, message: 'Invalid cell' };
    }

    targetCell = resolvedTarget;

    // Replace an existing trap/barricade layout if it is within range.
    if (targetCell.hasPlayer || targetCell.hasZombie || targetCell.isHole) {
      return { success: false, message: 'Cell must be a valid placement target' };
    }

    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    if (dist > 3) {
      return { success: false, message: 'Target must be within 3 tiles' };
    }

    const barricadeCost = player.getBarricadeCost();
    if (player.gold < barricadeCost) {
      return { success: false, message: `Need ${barricadeCost} gold for barricade` };
    }

    const result = StructurePlacement.placeBarricadeWithEffects(board, player, targetCell);
    if (!result.success) {
      return result;
    }

    player.spendGold(barricadeCost);

    return {
      success: true,
      message: `Placed barricade at (${targetCell.x}, ${targetCell.y}) - gained ${result.spEarned} SP`
    };
  }

  /**
   * Place a bait (standard action)
   * Range: 3 tiles (not affected by bait radius)
   */
  static placeBait(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    if (!targetCell || !targetCell.isEmpty || targetCell.isHole) {
      return { success: false, message: 'Invalid target' };
    }

    // Bait placement range is always 3 (not affected by bait radius)
    const placementRange = 3;
    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    if (dist > placementRange) {
      return { success: false, message: `Target must be within ${placementRange} tiles` };
    }

    // Check bait cost
    const baitCost = player.getBaitCost();
    if (player.gold < baitCost) {
      return { success: false, message: `Need ${baitCost} gold for bait` };
    }

    // Use StructurePlacement with effects
    const result = StructurePlacement.placeBaitWithEffects(board, player, targetCell);
    if (!result.success) {
      return result;
    }

    // Spend gold after successful placement
    player.spendGold(baitCost);

    return {
      success: true,
      message: `Placed bait at (${targetCell.x}, ${targetCell.y})`
    };
  }

  /**
   * ESCAPE MODE - triggered when a zombie attacks a player
   * Not a standard action - this is a reaction to being bitten
   */
  static escape(
    player: Player,
    board: Board,
    targetCell: BoardCell,
    emergencyRetreat: boolean = false
  ): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const currentCell = board.getCell(pos.x, pos.y);
    if (!currentCell) {
      return { success: false, message: 'Current cell not found' };
    }

    // Validate target
    if (!targetCell || targetCell.isHole || targetCell.isOccupied) {
      return { success: false, message: 'Invalid escape target' };
    }

    // Check distance based on passive
    const maxDistance = emergencyRetreat ? 2 : 1;
    const dist = Math.abs(targetCell.x - pos.x) + Math.abs(targetCell.y - pos.y);
    
    if (dist > maxDistance) {
      return {
        success: false,
        message: `Escape target must be within ${maxDistance} tile${maxDistance > 1 ? 's' : ''}${emergencyRetreat ? ' (Emergency Retreat active)' : ''}`
      };
    }

    // For 2-tile escape, check if there's a valid path (BFS)
    if (emergencyRetreat && dist === 2) {
      const path = board.findShortestPathHuman(pos.x, pos.y, targetCell.x, targetCell.y);
      if (!path || path.length > 3) {
        return { success: false, message: 'No valid path to escape target' };
      }
    }

    // Move player to target
    currentCell.clear();
    targetCell.setPlayer(player);

    return {
      success: true,
      message: `Escaped to (${targetCell.x}, ${targetCell.y})${emergencyRetreat ? ' (Emergency Retreat)' : ''}`
    };
  }

  // ============================================================
  // SPECIAL ACTIONS (called from ActionManager)
  // ============================================================

  /**
   * Move N steps (for special actions like Sprint, Mad Dash)
   */
  static moveSteps(
    player: Player,
    board: Board,
    path: BoardCell[],
    payBarricades: boolean = true,
    ignoreBarricades: boolean = false
  ): { success: boolean; message: string } {
    const result = MovementUtil.moveSteps(board, player, path, payBarricades, ignoreBarricades);
    return {
      success: result.success,
      message: result.message
    };
  }

  /**
   * Jump over occupied tile (Blind Jump, Gym Class Hero)
   */
  static jumpOver(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const result = MovementUtil.executeJump(board, player, targetCell);
    return {
      success: result.success,
      message: result.message
    };
  }

  /**
   * Teleport to target cell
   */
  static teleport(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const result = MovementUtil.teleportTo(board, player, targetCell);
    return {
      success: result.success,
      message: result.message
    };
  }

  /**
   * Place a free trap (no gold cost, but still gets SP bonuses)
   */
  static placeFreeTrap(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const result = StructurePlacement.placeTrapWithEffects(board, player, targetCell);
    return {
      success: result.success,
      message: result.message
    };
  }

  /**
   * Place a free barricade (no gold cost, but still gets SP bonuses)
   */
  static placeFreeBarricade(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } { 
    targetCell.setBarricade(player);
    
   // const spGain = player.heroId === 'VICTOR_STONE' ? 2 : 1;
   // if (spGain > 0) {
   //   player.addSPs(spGain);
    //}
    
    return {
      success: true,
      message: `Placed free barricade at (${targetCell.x}, ${targetCell.y}) - gained SP`
    };
  }

  /**
   * Place a free bait (no gold cost)
   */
  static placeFreeBait(
    player: Player,
    board: Board,
    targetCell: BoardCell
  ): { success: boolean; message: string } {
    const result = StructurePlacement.placeBaitWithEffects(board, player, targetCell);
    return {
      success: result.success,
      message: result.message
    };
  }
}