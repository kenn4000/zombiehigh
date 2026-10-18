export type BoardCellTarget = { x: number; y: number };

export function isBoardCellTarget(target: any): target is BoardCellTarget {
  return !!target &&
    typeof target === 'object' &&
    'x' in target &&
    'y' in target &&
    typeof target.x === 'number' &&
    typeof target.y === 'number';
}

export function resolveTargetSelection(validTargets: any[], clickedCell: BoardCellTarget): any {
  if (!Array.isArray(validTargets)) return clickedCell;

  const directMatch = validTargets.find((target: any) => isBoardCellTarget(target)
    && Number(target.x) === Number(clickedCell.x)
    && Number(target.y) === Number(clickedCell.y));
  if (directMatch) return directMatch;

  const pairOrPathMatch = validTargets.find((target: any) => {
    if (!Array.isArray(target) || target.length === 0) return false;
    return target.some((entry: any) => isBoardCellTarget(entry)
      && Number(entry.x) === Number(clickedCell.x)
      && Number(entry.y) === Number(clickedCell.y));
  });

  if (pairOrPathMatch) return pairOrPathMatch;

  const pathMatch = validTargets.find((target: any) => {
    if (!Array.isArray(target) || target.length === 0) return false;
    const lastCell = target[target.length - 1];
    return isBoardCellTarget(lastCell)
      && Number(lastCell.x) === Number(clickedCell.x)
      && Number(lastCell.y) === Number(clickedCell.y);
  });

  return pathMatch ?? clickedCell;
}

export function resolvePlayerTargetSelection<T extends { id: string }>(
  validTargets: readonly T[],
  currentPlayers: readonly T[],
  getPosition: (player: T) => BoardCellTarget | null,
  clickedCell: BoardCellTarget
): T | null {
  const currentTarget = currentPlayers.find((player) => {
    const position = getPosition(player);
    return position?.x === clickedCell.x && position?.y === clickedCell.y;
  });

  return currentTarget && validTargets.some((target) => target.id === currentTarget.id)
    ? currentTarget
    : null;
}

export function resolveBoardCellTarget(target: any): BoardCellTarget | null {
  let current = target;

  while (current) {
    if (current.object && current.object !== current) {
      current = current.object;
      continue;
    }

    const userData = current.userData;

    if (
      userData &&
      typeof userData === 'object' &&
      'x' in userData &&
      'y' in userData &&
      userData.x !== undefined &&
      userData.y !== undefined
    ) {
      return {
        x: Number(userData.x),
        y: Number(userData.y),
      };
    }

    current = current.parent ?? null;
  }

  return null;
}
