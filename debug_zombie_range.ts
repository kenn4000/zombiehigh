import { writeFileSync } from 'fs';
import { createRuntimeGame } from './src/server/gameFactory';

const runtime = createRuntimeGame({ humanNames:['Player 1'], cpuCount:0 });
const player = runtime.players[0];
const board = runtime.game.board;
const playerCell = board.getCell(1,1)!;
const zombieCell = board.getCell(3,1)!;
playerCell.setPlayer(player);
zombieCell.setZombie('range-zombie', 3);
const before = { playerHealth: player.currHealth, zombie: {x:zombieCell.x,y:zombieCell.y, hasZombie:zombieCell.hasZombie, steps:zombieCell.zombieStepsLeft} };
const zm = runtime.game.ensureZombieManager();
zm.zombiePhase(7, { async: false });
const after = { playerHealth: player.currHealth, boardZombies: board.getAllCells().filter(c => c.hasZombie).map(c=>({x:c.x,y:c.y,steps:c.zombieStepsLeft})), playerPos: board.getPlayerPosition(player), zombieTarget: zombieCell.zombieTarget };
writeFileSync('./debug_zombie_range.json', JSON.stringify({ before, after }, null, 2), 'utf8');
