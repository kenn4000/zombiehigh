import { writeFileSync } from 'fs';
import { createRuntimeGame } from './src/server/gameFactory';
import { HeroId } from './src/game/misc/HeroId';
import { CardProcessor } from './src/game/index';

const runtime = createRuntimeGame({ humanNames:['Player 1'], cpuCount:0 });
const player = runtime.players[0];
const manager = runtime.gameManager;
manager.selectHero(player.id, HeroId.RICHARD_KIM);
const standCell = runtime.game.board.getAllCells().find((cell:any) => cell.isEmpty && !cell.isHole && !!cell.roomId);
standCell.setPlayer(player);
manager.startPlayerTurn();
player.syncActionCards();
const actionCard = player.hand.cards.find((card:any) => card.__kind === 'special-action');
const actionType = actionCard.id;
const byId = player.hand.cards.find((card:any) => card.id === actionType || card.cardId === actionType);
const actionCard2 = byId && byId.__kind === 'special-action' ? byId : null;
const decision = {
  gameOver: manager['game'].isGameOver(),
  playerOK: !!player && !player.isEliminated && player === runtime.game.getCurrentPlayer(),
  actionsUsed: manager['actionsUsed'],
  actionType,
  handCardFound: !!byId,
  actionCardFound: !!actionCard2,
  actionId: actionCard2?._specialActionId,
  optionIndex: Number(actionCard2?._specialOptionIndex ?? 0),
  actionExists: !!((actionCard2 && actionCard2._specialActionId && (require('./src/game/index').AllSpecialActions[actionCard2._specialActionId]))),
};
if (actionCard2) {
  const actionId = actionCard2._specialActionId;
  const optionIndex = Number(actionCard2._specialOptionIndex ?? 0);
  const action = (await import('./src/game/index')).AllSpecialActions[actionId];
  const result = player.actionManager.executeOption(player, runtime.game.board, actionId, optionIndex, undefined);
  decision.result = result;
  decision.isUsed = player.actionManager.isActionUsed(actionId);
}
writeFileSync('./debug_perform_step.json', JSON.stringify(decision, null, 2), 'utf8');
