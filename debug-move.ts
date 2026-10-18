import { createRuntimeGame } from './src/server/gameFactory';

const runtime = createRuntimeGame({ humanNames: ['Player 1'], cpuCount: 0 });
const board = runtime.game.board;
const player = runtime.players[0];
const start = board.getCell(1, 1)!;
const mid = board.getCell(2, 1)!;
const target = board.getCell(3, 1)!;
console.log('phase', runtime.gameManager.getPhase());
console.log('start', { x: start.x, y: start.y, room: start.roomId });
console.log('mid before', { x: mid.x, y: mid.y, room: mid.roomId, hasBarricade: mid.hasBarricade, hasTrap: mid.hasTrap, isEmpty: mid.isEmpty });
console.log('target before', { x: target.x, y: target.y, room: target.roomId, hasBarricade: target.hasBarricade, hasTrap: target.hasTrap, isEmpty: target.isEmpty });
start.setPlayer(player);
mid.setBarricade(player);
player.gold = 20;
console.log('before gold', player.gold);
const result = require('./src/game/actions/ActionHandler').ActionHandlers.move(player, board, target, true);
console.log('result', result);
console.log('after gold', player.gold, 'pos', board.getPlayerPosition(player));
