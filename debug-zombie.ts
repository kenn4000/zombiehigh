import { createRuntimeGame } from './src/server/gameFactory';

const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
const board = runtime.game.board;
const player = runtime.players[0];
const viableCells = board.getAllCells().filter(c => !c.isHole && !c.hasStructure && !c.hasPlayer && !c.hasZombie);
console.log('viableCount', viableCells.length);
for (const c of viableCells.slice(0,10)) console.log('cell', c.x, c.y, c.roomId);
const zombieCell = viableCells[0]!;
const barricadeCell = viableCells[1]!;
const playerCell = viableCells[2]!;
playerCell.setPlayer(player);
barricadeCell.setBarricade(player);
zombieCell.setZombie('test-zombie', 1);
console.log('before', {
  zombieCell: `${zombieCell.x},${zombieCell.y} hasZombie=${zombieCell.hasZombie} hasBarricade=${zombieCell.hasBarricade}`,
  barricadeCell: `${barricadeCell.x},${barricadeCell.y} hasZombie=${barricadeCell.hasZombie} hasBarricade=${barricadeCell.hasBarricade}`,
  playerCell: `${playerCell.x},${playerCell.y} hasPlayer=${playerCell.hasPlayer}`,
});
const originalRandom = Math.random;
Math.random = () => 0.9;
try {
  runtime.game.ensureZombieManager().zombiePhase(1);
} finally {
  Math.random = originalRandom;
}
console.log('after', {
  zombieCell: `${zombieCell.x},${zombieCell.y} hasZombie=${zombieCell.hasZombie} hasBarricade=${zombieCell.hasBarricade}`,
  barricadeCell: `${barricadeCell.x},${barricadeCell.y} hasZombie=${barricadeCell.hasZombie} hasBarricade=${barricadeCell.hasBarricade}`,
  allZombies: board.getAllZombies().map(c => `${c.x},${c.y}`),
  allBarricades: board.getAllBarricades().map(c => `${c.x},${c.y}`),
});
