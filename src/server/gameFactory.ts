import { Game, Player, CardDrawer, CardProcessor, setupNewBoard } from '../game/index';
import { LOCKER_DECK } from '../game/cards/CardIndex/LockerDeck';
import { GameManager } from '../game/core/GameManager';
import { registerAllCards } from '../scripts/sim/simDeck';
import { v4 as uuidv4 } from 'uuid';

export type RuntimeGameOptions = {
  humanNames?: string[];
  cpuCount?: number;
  difficultyLevels?: Array<'easy' | 'normal' | 'hard'>;
  settings?: {
    firstCardFreeNightDraft?: boolean;
    reshuffleDeck?: boolean;
  };
};

export function createRuntimeGame(options: RuntimeGameOptions = {}): {
  game: Game;
  gameManager: GameManager;
  players: Player[];
} {
  const humanNames = options.humanNames && options.humanNames.length > 0
    ? options.humanNames
    : ['Player 1'];

  const cpuCount = Math.max(0, Math.min(4, options.cpuCount ?? 0));
  const difficultyLevels = options.difficultyLevels ?? [];

  const players: Player[] = [];
  const reshuffleDeck = options.settings?.reshuffleDeck ?? true;
  for (let i = 0; i < humanNames.length; i++) {
    const player = new Player(uuidv4(), humanNames[i] || `Player ${i + 1}`);
    (player as any).color = ['red', 'blue', 'green', 'yellow', 'cyan'][i % 5] ?? 'red';
    players.push(player);
  }

  for (let i = 0; i < cpuCount; i++) {
    const player = new Player(`cpu-${i + 1}-${uuidv4()}`, `CPU ${i + 1}`);
    (player as any).isBot = true;
    (player as any).difficultyLevel = difficultyLevels[i] ?? 'normal';
    (player as any).color = ['orange', 'purple', 'magenta', 'cyan'][i % 4] ?? 'orange';
    players.push(player);
  }

  const game = new Game(players, setupNewBoard());
  registerAllCards();

  const allCardDefs = CardProcessor.getAll();
  const deckCards: any[] = [];
  for (const cardDef of allCardDefs) {
    deckCards.push({
      id: `${cardDef.id}-0`,
      cardId: cardDef.id,
      name: cardDef.name,
      cost: cardDef.cost,
      image: cardDef.image || 'default.png',
      targetType: cardDef.targetType,
    });
  }

  const cardDrawer = new CardDrawer();
  (game as any).cardManager = cardDrawer;
  cardDrawer.setReshuffleOnEmpty(reshuffleDeck);
  cardDrawer.initializeGameDeck(deckCards);
  cardDrawer.initializeLockerDeck(LOCKER_DECK.map(card => ({
    id: `${card.id}-${uuidv4()}`,
    cardId: card.id,
    name: card.name,
    cost: 0,
    image: card.image,
    targetType: 'none',
  })));

  const gameManager = new GameManager(game);
  gameManager.startGame();

  return { game, gameManager, players };
}
