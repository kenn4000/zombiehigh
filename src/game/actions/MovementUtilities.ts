// src/game/misc/MovementUtil.ts

import { Board, BoardCell, Player } from '../index';

export interface JumpResult {
  success: boolean;
  message: string;
  middleCell: BoardCell | null;
  targetCell: BoardCell | null;
}

export interface MoveResult {
  success: boolean;
  message: string;
  fromCell: BoardCell | null;
  toCell: BoardCell | null;
}
export interface ShoesMoveRoute {
  target: BoardCell;
  jumpedObjects: BoardCell[];
}
interface PathNode {
  cell: BoardCell;
  g: number;          // Cost from start
  h: number;          // Heuristic to goal (Manhattan)
  f: number;          // Total estimated cost (g + h)
  jumps: number;
  parentKey: string | null;
}
// Helper function to reconstruct path
function reconstructPath(
  target: BoardCell,
  cameFrom: Map<string, { cell: BoardCell; cameFrom: string; dist: number; jumps: number }>,
  distance: number,
  jumps: number
): { path: BoardCell[]; jumps: number; distance: number } {
  const path: BoardCell[] = [];
  let current: string | undefined = target.id;
  
  while (current && current !== '') {
    const entry = cameFrom.get(current);
    if (entry) {
      path.unshift(entry.cell);
      current = entry.cameFrom;
    } else {
      break;
    }
  }
  
  return { path, jumps, distance };
}

export class MovementUtil {
  static getShoesMoveRoutes(board: Board, player: Player, maxSteps: number = 2, maxJumps: number = maxSteps): ShoesMoveRoute[] {
    const start = board.getPlayerPosition(player);
    if (!start) return [];

    let frontier: ShoesMoveRoute[] = [{ target: start, jumpedObjects: [] }];
    const reachableRoutes = new Map<string, ShoesMoveRoute>();

    for (let step = 0; step < maxSteps; step++) {
      const nextFrontier = new Map<string, ShoesMoveRoute>();
      const addRoute = (route: ShoesMoveRoute): void => {
        const existing = nextFrontier.get(route.target.id);
        if (!existing || route.jumpedObjects.length < existing.jumpedObjects.length) {
          nextFrontier.set(route.target.id, route);
        }
      };

      for (const route of frontier) {
        for (const adjacent of board.getNeighbors(route.target)) {
          if (adjacent.isEmpty) {
            addRoute({ target: adjacent, jumpedObjects: route.jumpedObjects });
            continue;
          }

          if (!adjacent.hasTrap && !adjacent.hasBarricade) continue;
          if (route.jumpedObjects.length >= maxJumps) continue;
          const dx = adjacent.x - route.target.x;
          const dy = adjacent.y - route.target.y;
          const landing = board.getNeighbors(adjacent).find((cell) =>
            cell.x === adjacent.x + dx && cell.y === adjacent.y + dy
          );
          if (!landing || !landing.isEmpty) continue;

          addRoute({ target: landing, jumpedObjects: [...route.jumpedObjects, adjacent] });
        }
      }

      frontier = [...nextFrontier.values()];
      for (const route of frontier) {
        const existing = reachableRoutes.get(route.target.id);
        if (!existing || route.jumpedObjects.length < existing.jumpedObjects.length) {
          reachableRoutes.set(route.target.id, route);
        }
      }
    }

    return [...reachableRoutes.values()];
  }

  static getShoesMoveTargets(board: Board, player: Player, maxSteps: number = 2): BoardCell[] {
    return this.getShoesMoveRoutes(board, player, maxSteps).map((route) => route.target);
  }

  /**
   * Check if a player can jump over an occupied tile to an empty tile behind it
   * Returns the middle cell and target cell if valid
   */
  static canJumpOver(board: Board, player: Player): JumpResult {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board', middleCell: null, targetCell: null };
    }
    
    const { x, y } = pos;
    
    // Check all four directions
    const directions = [
      { dx: 0, dy: -2, name: 'North' },
      { dx: 0, dy: 2, name: 'South' },
      { dx: -2, dy: 0, name: 'West' },
      { dx: 2, dy: 0, name: 'East' }
    ];
    
    for (const dir of directions) {
      const targetX = x + dir.dx;
      const targetY = y + dir.dy;
      
      // Check bounds
      if (targetX < 0 || targetX >= board.cells[0].length || 
          targetY < 0 || targetY >= board.cells.length) {
        continue;
      }
      
      const midX = (x + targetX) / 2;
      const midY = (y + targetY) / 2;
      
      const adjacent = board.getCell(midX, midY);
      const behind = board.getCell(targetX, targetY);
      const isTrapOrBarricadeJump = !!adjacent && (adjacent.hasTrap || adjacent.hasBarricade || adjacent.hasZombie);
      
      if (isTrapOrBarricadeJump && behind && behind.isEmpty && !behind.isHole) {
        return { 
          success: true, 
          message: `Can jump ${dir.name}`, 
          middleCell: adjacent, 
          targetCell: behind 
        };
      }
    }
    
    return { success: false, message: 'No valid jump target found', middleCell: null, targetCell: null };
  }

  /**
   * Execute a jump - moves player over an occupied tile to the target
   */
  static executeJump(board: Board, player: Player, targetCell: BoardCell): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }
    
    const { x, y } = pos;
    
    // Verify target is exactly 2 steps away in a cardinal direction
    const dx = Math.abs(targetCell.x - x);
    const dy = Math.abs(targetCell.y - y);
    const isValidDistance = (dx === 2 && dy === 0) || (dx === 0 && dy === 2);
    
    if (!isValidDistance) {
      return { success: false, message: 'Target must be exactly 2 steps away' };
    }
    
    // Find the middle cell
    const midX = (x + targetCell.x) / 2;
    const midY = (y + targetCell.y) / 2;
    const middle = board.getCell(midX, midY);
    
    // Verify middle cell is occupied
    if (!middle || !middle.isOccupied) {
      return { success: false, message: 'Middle cell must be occupied' };
    }
    
    // Verify target is empty
    if (!targetCell.isEmpty || targetCell.isHole) {
      return { success: false, message: 'Target cell must be empty' };
    }
    
    // Move player
    const currentCell = board.getCell(x, y);
    if (currentCell) {
      currentCell.clear();
    }
    targetCell.setPlayer(player);
    
    return { 
      success: true, 
      message: `Jumped over occupied tile to (${targetCell.x}, ${targetCell.y})` 
    };
  }

  /**
   * Check if player can jump and return valid targets for UI highlighting
   */
  static getValidJumpTargets(board: Board, player: Player): BoardCell[] {
    const targets: BoardCell[] = [];
    const pos = board.getPlayerPosition(player);
    if (!pos) return targets;
    
    const { x, y } = pos;
    const directions = [
      { dx: 0, dy: -2 },
      { dx: 0, dy: 2 },
      { dx: -2, dy: 0 },
      { dx: 2, dy: 0 }
    ];
    
    for (const dir of directions) {
      const targetX = x + dir.dx;
      const targetY = y + dir.dy;
      
      if (targetX < 0 || targetX >= board.cells[0].length || 
          targetY < 0 || targetY >= board.cells.length) {
        continue;
      }
      
      const midX = (x + targetX) / 2;
      const midY = (y + targetY) / 2;
      
      const adjacent = board.getCell(midX, midY);
      const behind = board.getCell(targetX, targetY);
      const isTrapOrBarricadeJump = !!adjacent && (adjacent.hasTrap || adjacent.hasBarricade || adjacent.hasZombie);
      
      if (isTrapOrBarricadeJump && behind && behind.isEmpty && !behind.isHole) {
        targets.push(behind);
      }
    }
    
    return targets;
  }

  /**
   * Move a player from one cell to another.
   * Handles barricade tolls automatically.
   */
  static movePlayer(
    board: Board,
    player: Player,
    from: BoardCell,
    to: BoardCell
  ): { success: boolean; message: string } {
    if (!to.isWalkable) {
      return { success: false, message: 'Target cell is not walkable' };
    }

    // Check if target has a barricade (barricade is on the cell now)
    if (to.hasBarricade && to.structureOwner && to.structureOwner !== player) {
      const toll = 2;
      if (player.gold < toll) {
        return { success: false, message: `Need ${toll} gold to cross barricade` };
      }
      player.spendGold(toll);
      to.structureOwner.addGold(1);
    }

    // Move player
    from.clear();
    to.setPlayer(player);
    player.spendGold(1); // Movement cost

    return { success: true, message: `Moved to (${to.x},${to.y})` };
  }

  /**
   * Calculate distance from a zombie to its nearest target (player or bait).
   * Used for zombie AI ordering.
   */
  static getZombiePriorityDistance(
    board: Board,
    zombie: BoardCell,
    players: Player[]
  ): { target: BoardCell | null; distance: number } {
    let closestTarget: BoardCell | null = null;
    let minDist = Infinity;

    // Check all players
    for (const player of players) {
      if (player.isEliminated) continue;
      const pos = board.getPlayerPosition(player);
      if (!pos) continue;
      
      const dist = Math.abs(zombie.x - pos.x) + Math.abs(zombie.y - pos.y);
      if (dist < minDist) {
        minDist = dist;
        closestTarget = board.getCell(pos.x, pos.y);
      }
    }

    // Check all baits
    for (const cell of board.getAllCells()) {
      if (cell.hasBait) {
        const dist = Math.abs(zombie.x - cell.x) + Math.abs(zombie.y - cell.y);
        // Baits are less priority than players (add +2 to distance)
        const adjustedDist = dist + 2;
        if (adjustedDist < minDist) {
          minDist = adjustedDist;
          closestTarget = cell;
        }
      }
    }

    return { target: closestTarget, distance: minDist };
  }

  /**
   * Get all cells within a zombie's remaining steps.
   * Used for range visualization.
   */
  static getZombieReachableCells(
    board: Board,
    zombie: BoardCell,
    steps: number
  ): BoardCell[] {
    const reachable: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: zombie, dist: 0 }];
    visited.add(zombie.id);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;
      
      if (dist > 0 && dist <= steps) {
        reachable.push(cell);
      }

      if (dist < steps) {
        for (const neighbor of board.getNeighbors(cell)) {
          if (visited.has(neighbor.id)) continue;
          // Zombies ignore traps, baits, but are blocked by barricades
          if (neighbor.isHole) continue;
          if (neighbor.hasBarricade) continue;
          visited.add(neighbor.id);
          queue.push({ cell: neighbor, dist: dist + 1 });
        }
      }
    }

    return reachable;
  }

  /**
   * Calculate the shortest distance between two cells using BFS.
   * For ZOMBIES - ignores barricades and traps
   */
  static getDistanceForZombies(
    board: Board,
    from: BoardCell,
    to: BoardCell
  ): number {
    if (from === to) return 0;
    if (!from || !to || from.isHole || to.isHole) return -1;

    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: from, dist: 0 }];
    visited.add(from.id);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;
      
      for (const neighbor of board.getNeighbors(cell)) {
        if (visited.has(neighbor.id)) continue;
        if (!neighbor || neighbor.isHole) continue;
        // Zombies ignore barricades and traps!

        if (neighbor === to) return dist + 1;
        
        visited.add(neighbor.id);
        queue.push({ cell: neighbor, dist: dist + 1 });
      }
    }

    return -1;
  }

  /**
   * Get distance for HUMANS with jump capability
   * - Can jump over barricades and traps (costs 1 extra movement)
   * - Jump requires empty landing cell behind the obstacle
   */
  static getDistanceForHumans(
    board: Board,
    from: BoardCell,
    to: BoardCell,
    canJump: boolean = true
  ): { distance: number; jumps: number } {
    if (from === to) return { distance: 0, jumps: 0 };
    if (!from || !to || from.isHole || to.isHole) return { distance: -1, jumps: 0 };

    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number; jumps: number; cameFrom: string }[] = [
      { cell: from, dist: 0, jumps: 0, cameFrom: '' }
    ];
    visited.add(from.id);

    while (queue.length > 0) {
      const { cell, dist, jumps } = queue.shift()!;
      
      // Check normal movement (adjacent cells)
      for (const neighbor of board.getNeighbors(cell)) {
        if (visited.has(neighbor.id)) continue;
        if (!neighbor || neighbor.isHole) continue;
        
        // If neighbor has a barricade or trap, try to jump over it
        if ((neighbor.hasBarricade || neighbor.hasTrap) && canJump) {
          // Calculate landing cell (2 steps in same direction)
          const dx = neighbor.x - cell.x;
          const dy = neighbor.y - cell.y;
          const landingX = neighbor.x + dx;
          const landingY = neighbor.y + dy;
          const landingCell = board.getCell(landingX, landingY);
          
          // Check if landing cell is valid and empty
          if (landingCell && !landingCell.isHole && landingCell.isEmpty) {
            const jumpKey = `jump-${landingCell.id}`;
            if (!visited.has(jumpKey)) {
              visited.add(jumpKey);
              // Jump costs 2 movement (1 for the jump, 1 for the landing)
              if (landingCell === to) {
                return { distance: dist + 2, jumps: jumps + 1 };
              }
              queue.push({
                cell: landingCell,
                dist: dist + 2,
                jumps: jumps + 1,
                cameFrom: cell.id
              });
            }
          }
          continue; // Skip the blocked cell
        }
        
        // Normal movement (cell is walkable)
        if (neighbor === to) {
          return { distance: dist + 1, jumps: jumps };
        }
        
        visited.add(neighbor.id);
        queue.push({
          cell: neighbor,
          dist: dist + 1,
          jumps: jumps,
          cameFrom: cell.id
        });
      }
      
      // Also check if we can jump from current position directly
      if (canJump) {
        const directions = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
          { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];
        
        for (const dir of directions) {
          const midX = cell.x + dir.dx;
          const midY = cell.y + dir.dy;
          const landX = cell.x + 2 * dir.dx;
          const landY = cell.y + 2 * dir.dy;
          
          const midCell = board.getCell(midX, midY);
          const landCell = board.getCell(landX, landY);
          
          if (!midCell || !landCell) continue;
          if (midCell.isHole || landCell.isHole) continue;
          
          // Can jump over barricade or trap
          if ((midCell.hasBarricade || midCell.hasTrap) && landCell.isEmpty) {
            const jumpKey = `jump-${landCell.id}`;
            if (!visited.has(jumpKey)) {
              visited.add(jumpKey);
              if (landCell === to) {
                return { distance: dist + 2, jumps: jumps + 1 };
              }
              queue.push({
                cell: landCell,
                dist: dist + 2,
                jumps: jumps + 1,
                cameFrom: cell.id
              });
            }
          }
        }
      }
    }

    return { distance: -1, jumps: 0 };
  }

 

  /**
   * Move a player N steps in a chosen path (step-by-step)
   */
  static moveSteps(
    board: Board,
    player: Player,
    path: BoardCell[],
    payBarricades: boolean = true,
    ignoreBarricades: boolean = false
  ): { success: boolean; message: string; fromCell: BoardCell | null; toCell: BoardCell | null } {
    if (!path || path.length === 0) {
      return { success: false, message: 'No path provided', fromCell: null, toCell: null };
    }

    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board', fromCell: null, toCell: null };
    }

    const fromCell = board.getCell(pos.x, pos.y);
    if (!fromCell) {
      return { success: false, message: 'Current cell not found', fromCell: null, toCell: null };
    }

    const movementPath = path[0]?.id === fromCell.id ? path.slice(1) : path;
    if (movementPath.length === 0) {
      return { success: false, message: 'No movement steps available', fromCell, toCell: null };
    }

    // Validate path is contiguous and cells are valid
    let current = fromCell;
    let stepsTaken = 0;
    for (const target of movementPath) {
      if (target.isHole) {
        return { success: false, message: `Path blocked by hole at (${target.x},${target.y})`, fromCell, toCell: null };
      }
      
      if (!target.isEmpty && target !== fromCell) {
        return { success: false, message: `Path blocked at (${target.x},${target.y})`, fromCell, toCell: null };
      }
      
      const neighbors = board.getNeighbors(current);
      if (!neighbors.includes(target)) {
        return { success: false, message: `Path not contiguous at (${target.x},${target.y})`, fromCell, toCell: null };
      }

      // Handle barricades on the target cell
      if (target.hasBarricade && target.structureOwner && target.structureOwner !== player) {
        if (ignoreBarricades) {
          // Ignore barricades - free crossing
        } else if (payBarricades) {
          // Pay toll
          const toll = 2;
          if (player.gold < toll) {
            return { success: false, message: `Not enough gold for barricade toll at (${target.x},${target.y})`, fromCell, toCell: null };
          }
          player.spendGold(toll);
          target.structureOwner.addGold(1);
        } else {
          return { success: false, message: `Barricade blocks path at (${target.x},${target.y})`, fromCell, toCell: null };
        }
      }

      current = target;
      stepsTaken++;
    }

    // Execute the movement
    const finalTarget = movementPath[movementPath.length - 1];
    fromCell.clear();
    finalTarget.setPlayer(player);

    return {
      success: true,
      message: `Moved ${stepsTaken} steps to (${finalTarget.x},${finalTarget.y})`,
      fromCell,
      toCell: finalTarget
    };
  }

  /**
   * Get all valid paths within N steps (BFS with path tracking)
   */
  static getValidPaths(
    board: Board,
    player: Player,
    maxSteps: number,
    payBarricades: boolean = true,
    ignoreBarricades: boolean = false
  ): { path: BoardCell[]; steps: number; finalCell: BoardCell; cost: number }[] {
    const pos = board.getPlayerPosition(player);
    if (!pos) return [];

    const startCell = board.getCell(pos.x, pos.y);
    if (!startCell) return [];

    const result: { path: BoardCell[]; steps: number; finalCell: BoardCell; cost: number }[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number; path: BoardCell[]; cost: number }[] = [
      { cell: startCell, dist: 0, path: [startCell], cost: 0 }
    ];
    visited.add(startCell.id);

    while (queue.length > 0) {
      const { cell, dist, path, cost } = queue.shift()!;

      if (dist > 0 && dist <= maxSteps && cell.isEmpty && !cell.isHole) {
        result.push({ path: [...path], steps: dist, finalCell: cell, cost });
      }

      if (dist < maxSteps) {
        for (const neighbor of board.getNeighbors(cell)) {
          if (visited.has(neighbor.id)) continue;
          if (neighbor.isHole) continue;
          if (!neighbor.isEmpty && neighbor !== startCell) continue;

          // Handle barricades on neighbor
          let newCost = cost;
          if (neighbor.hasBarricade && neighbor.structureOwner && neighbor.structureOwner !== player) {
            if (ignoreBarricades) {
              // Ignore barricades - free crossing
            } else if (payBarricades) {
              newCost += 2; // Barricade toll cost
            } else {
              continue; // Barricade blocks path
            }
          }

          visited.add(neighbor.id);
          queue.push({
            cell: neighbor,
            dist: dist + 1,
            path: [...path, neighbor],
            cost: newCost
          });
        }
      }
    }

    return result;

    return result;
  }

  /**
   * Get all valid teleport targets in a specific room
   */
  static getTeleportTargetsInRoom(board: Board, roomId: string): BoardCell[] {
    return board.getCellsInRoom(roomId).filter(c => c.isEmpty && !c.isHole);
  }

  /**
   * Get all cells within N steps of the player (BFS)
   */
  static getCellsWithinSteps(
    board: Board,
    player: Player,
    maxSteps: number,
    ignoreBarricades: boolean = false
  ): BoardCell[] {
    const pos = board.getPlayerPosition(player);
    if (!pos) return [];

    return this.getCellsWithinStepsFromCell(board, pos, maxSteps, ignoreBarricades);
  }

  static getCellsWithinStepsFromCell(
    board: Board,
    startCell: BoardCell,
    maxSteps: number,
    ignoreBarricades: boolean = false
  ): BoardCell[] {

    const result: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [
      { cell: board.getCell(startCell.x, startCell.y)!, dist: 0 }
    ];
    visited.add(`${startCell.x},${startCell.y}`);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;

      if (dist > 0 && dist <= maxSteps && cell.isEmpty && !cell.isHole) {
        result.push(cell);
      }

      if (dist < maxSteps) {
        for (const neighbor of board.getNeighbors(cell)) {
          const key = `${neighbor.x},${neighbor.y}`;
          if (visited.has(key)) continue;
          
          // Check for barricades (unless ignored)
          if (!ignoreBarricades && neighbor.hasBarricade) {
            continue;
          }

          visited.add(key);
          queue.push({ cell: neighbor, dist: dist + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Get all valid teleport targets in same row or column (ignore walls)
   */
  static getTeleportTargetsRowColumn(board: Board, player: Player): BoardCell[] {
    const pos = board.getPlayerPosition(player);
    if (!pos) return [];

    const result: BoardCell[] = [];
    for (const cell of board.getAllCells()) {
      if (cell.isHole) continue;
      if (cell.x === pos.x || cell.y === pos.y) {
        if (cell.isEmpty && !cell.isHole) {
          result.push(cell);
        }
      }
    }
    return result;
  }

  /**
   * Teleport player to a target cell (no path checks, no barricades)
   */
  static teleportTo(board: Board, player: Player, targetCell: BoardCell): { success: boolean; message: string } {
    const pos = board.getPlayerPosition(player);
    if (!pos) {
      return { success: false, message: 'Player not on board' };
    }

    const fromCell = board.getCell(pos.x, pos.y);
    if (!fromCell) {
      return { success: false, message: 'Current cell not found' };
    }

    if (!targetCell.isEmpty || targetCell.isHole) {
      return { success: false, message: 'Target cell must be empty' };
    }

    fromCell.clear();
    targetCell.setPlayer(player);

    return {
      success: true,
      message: `Teleported to (${targetCell.x},${targetCell.y})`
    };
  }

  /**
   * Find the next step in a path (for step-by-step movement)
   */
  static findPath(
    board: Board,
    start: BoardCell,
    goal: BoardCell,
    ignoreBarricades: boolean = false
  ): { dist: number; nextStep: BoardCell } | null {
    if (!start || !goal || start === goal) return null;
    if (start.isHole || goal.isHole) return null;

    const visited = new Set<string>();
    visited.add(start.id);

    // Queue: [current, firstStepFromStart, distance]
    const queue: { cell: BoardCell; firstStep: BoardCell; dist: number }[] = [];

    for (const neighbor of board.getNeighbors(start)) {
      if (neighbor.isHole) continue;
      if (!visited.has(neighbor.id)) {
        visited.add(neighbor.id);
        // Check barricade on neighbor
        if (!ignoreBarricades && neighbor.hasBarricade) continue;
        queue.push({ cell: neighbor, firstStep: neighbor, dist: 1 });
      }
    }

    let head = 0;
    while (head < queue.length) {
      const { cell, firstStep, dist } = queue[head++];
      if (cell === goal) return { dist, nextStep: firstStep };

      for (const neighbor of board.getNeighbors(cell)) {
        if (neighbor.isHole) continue;
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          if (!ignoreBarricades && neighbor.hasBarricade) continue;
          queue.push({ cell: neighbor, firstStep, dist: dist + 1 });
        }
      }
    }
    return null;
  }

  /**
   * Find the closest target (player or bait) from a starting position.
   * Used for zombie AI ordering.
   */
  static findClosestTarget(
    board: Board,
    start: BoardCell,
    targets: BoardCell[],
    preferPlayers: boolean = true
  ): { target: BoardCell; distance: number } | null {
    let closest: BoardCell | null = null;
    let minDist = Infinity;
    let minId = Infinity;

    for (const target of targets) {
      if (target.isHole) continue;
      const result = this.findPath(board, start, target);
      if (result) {
        let adjustedDist = result.dist;
        // Prefer players over bait by reducing distance for players
        if (preferPlayers && target.hasPlayer) {
          adjustedDist -= 1;
        }
        const id = parseInt(target.id.split('-')[1]) || 0;
        if (adjustedDist < minDist || (adjustedDist === minDist && id < minId)) {
          minDist = adjustedDist;
          minId = id;
          closest = target;
        }
      }
    }

    return closest ? { target: closest, distance: minDist } : null;
  }

  /**
   * Get the full path from start to goal (as array of cells).
   */
  static getFullPath(
    board: Board,
    start: BoardCell,
    goal: BoardCell,
    ignoreBarricades: boolean = false
  ): BoardCell[] {
    const path: BoardCell[] = [start];
    let current = start;

    while (current !== goal) {
      const next = this.findPath(board, current, goal, ignoreBarricades);
      if (!next) break;
      path.push(next.nextStep);
      current = next.nextStep;
    }
    return path;
  }

  /**
   * Get all cells within reachable steps (BFS).
   */
  static getReachableCells(
    board: Board,
    start: BoardCell,
    steps: number,
    ignoreBarricades: boolean = true
  ): BoardCell[] {
    const reachable: BoardCell[] = [];
    const visited = new Set<string>();
    const queue: { cell: BoardCell; dist: number }[] = [{ cell: start, dist: 0 }];
    visited.add(start.id);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;

      if (dist > 0 && dist <= steps && cell.isEmpty && !cell.isHole) {
        reachable.push(cell);
      }

      if (dist < steps) {
        for (const neighbor of board.getNeighbors(cell)) {
          if (visited.has(neighbor.id)) continue;
          if (neighbor.isHole) continue;
          if (!ignoreBarricades && neighbor.hasBarricade) continue;

          visited.add(neighbor.id);
          queue.push({ cell: neighbor, dist: dist + 1 });
        }
      }
    }

    return reachable;
  }
static getPathForHumans(
  board: Board,
  from: BoardCell,
  to: BoardCell,
  canJump: boolean = true
): { path: BoardCell[]; jumps: number; distance: number } | null {
  if (!from || !to || from.isHole || to.isHole) return null;
  if (from === to) return { path: [from], jumps: 0, distance: 0 };

  // Target must be open to land on
  if (!this.isOpenTile(to)) return null;

  const manhattanDist = (a: BoardCell, b: BoardCell): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  // A* structures
  const openSet = new Map<string, PathNode>();
  const closedSet = new Map<string, PathNode>(); // Store closed nodes for path reconstruction

  const startNode: PathNode = {
    cell: from,
    g: 0,
    h: manhattanDist(from, to),
    f: manhattanDist(from, to),
    jumps: 0,
    parentKey: null,
  };
  openSet.set(from.id, startNode);

  let iterations = 0;
  const maxIterations = 800; // Higher limit for A* with jumping

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f-score
    let currentKey: string | null = null;
    let lowestF = Infinity;
    for (const [key, node] of openSet.entries()) {
      if (node.f < lowestF) {
        lowestF = node.f;
        currentKey = key;
      }
    }
    if (!currentKey) break;

    const current = openSet.get(currentKey)!;

    // Goal reached
    if (current.cell.id === to.id) {
      return this.reconstructAStarPath(currentKey, openSet, closedSet);
    }

    // Move from open to closed
    openSet.delete(currentKey);
    closedSet.set(currentKey, current);

    // Get valid transitions (walk + jumps)
    const transitions = this.getValidTransitions(board, current.cell, canJump);

    for (const trans of transitions) {
      const neighborId = trans.cell.id;

      // Skip if already closed
      if (closedSet.has(neighborId)) continue;

      // Calculate tentative g-score (cost so far)
      const tentativeG = current.g + trans.cost;

      const existingNode = openSet.get(neighborId);
      if (!existingNode || tentativeG < existingNode.g) {
        const hScore = manhattanDist(trans.cell, to);
        const neighborNode: PathNode = {
          cell: trans.cell,
          g: tentativeG,
          h: hScore,
          f: tentativeG + hScore,
          jumps: current.jumps + (trans.isJump ? 1 : 0),
          parentKey: currentKey,
        };
        openSet.set(neighborId, neighborNode);
      }
    }
  }

  // If we exceed iterations, log and return null
  if (iterations >= maxIterations) {
    console.log(`[MovementUtil] A* hit max iterations (${maxIterations}) from (${from.x},${from.y}) to (${to.x},${to.y})`);
  }
  return null;
}

/**
 * Checks if a tile is valid to land on (empty, no barricade, no trap).
 */
private static isOpenTile(cell: BoardCell | null | undefined): boolean {
  if (!cell || cell.isHole) return false;
  return cell.isEmpty && !cell.hasBarricade && !cell.hasTrap;
}

/**
 * Generates valid transitions (walk and jump) from a given cell.
 */
private static getValidTransitions(
  board: Board,
  cell: BoardCell,
  canJump: boolean
): { cell: BoardCell; cost: number; isJump: boolean }[] {
  const transitions: { cell: BoardCell; cost: number; isJump: boolean }[] = [];
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const dir of directions) {
    const adjX = cell.x + dir.dx;
    const adjY = cell.y + dir.dy;
    const adjCell = board.getCell(adjX, adjY);

    if (!adjCell || adjCell.isHole) continue;

    // 1-step walk (must be open)
    if (this.isOpenTile(adjCell)) {
      transitions.push({ cell: adjCell, cost: 1, isJump: false });
      continue;
    }

    // Jump over barricade or trap (2 steps)
    if (canJump && (adjCell.hasBarricade || adjCell.hasTrap)) {
      const landX = cell.x + 2 * dir.dx;
      const landY = cell.y + 2 * dir.dy;
      const landCell = board.getCell(landX, landY);

      if (landCell && this.isOpenTile(landCell)) {
    transitions.push({ cell: landCell, cost: 2, isJump: true });
  }
    }
  }

  return transitions;
}

/**
 * Reconstructs the path from the closed set using parent pointers.
 */
private static reconstructAStarPath(
  targetKey: string,
  openSet: Map<string, PathNode>,
  closedSet: Map<string, PathNode>
): { path: BoardCell[]; jumps: number; distance: number } {
  const path: BoardCell[] = [];
  let currKey: string | null = targetKey;
  let finalNode: PathNode | null = null;

  // Walk backwards using parent links (stored in both open and closed sets)
  while (currKey) {
    // Try openSet first, then closedSet
    let node: PathNode | undefined = openSet.get(currKey);
    if (!node) {
      node = closedSet.get(currKey);
    }
    if (!node) break;
    
    if (!finalNode) finalNode = node;
    path.unshift(node.cell);
    currKey = node.parentKey;
  }

  return {
    path,
    jumps: finalNode ? finalNode.jumps : 0,
    distance: finalNode ? finalNode.g : 0,
  };
}

}