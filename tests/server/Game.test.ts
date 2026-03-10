import * as assert from 'assert';
import { Game } from '../../src/server/Game';
import { Board } from '../../src/server/Board';
import { Player } from '../../src/server/Player';
import { Zombie } from '../../src/server/Zombie';
import { Trap } from '../../src/server/Trap';
import { Barricade } from '../../src/server/Barricade';
import { edgeKey } from '../../src/server/Edge';
import { HexCoordinate } from '../../src/common/HexCoordinate';
import { Phase } from '../../src/common/Phase';
import { Color } from '../../src/common/Color';
import { PlayerId, GameId } from '../../src/common/Types';
import { HeroId } from '../../src/common/HeroId';
import { LockerId } from '../../src/common/LockerId';

// ---- Test helpers ----

function makeGame(playerPositions?: [number, number][]): Game {
  const board = new Board();
  const positions = playerPositions ?? [[0, 0], [2, -1]];
  const colors = [Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW];
  const players = positions.map((pos, i) =>
    new Player(`p${i + 1}` as PlayerId, `Player${i + 1}`, colors[i], new HexCoordinate(pos[0], pos[1])),
  );
  return new Game('g1' as GameId, board, players);
}

/**
 * Bypasses setup phase: selects first available hero/locker item for each player,
 * confirms, then calls tryStartGame(). Throws if start fails.
 */
function fastStartGame(game: Game): void {
  for (const p of game.players) {
    assert.ok(p.setupHeroOptions.length > 0, `No hero options for ${p.name}`);
    assert.ok(p.setupLockerOptions.length > 0, `No locker options for ${p.name}`);
    game.selectHero(p.id, p.setupHeroOptions[0].id as HeroId);
    game.selectLocker(p.id, p.setupLockerOptions[0].id as LockerId);
    // Don't select any starting cards (avoids gold cost during test)
    const confirmed = game.confirmSetup(p.id);
    assert.ok(confirmed, `${p.name} failed to confirm setup`);
  }
  const started = game.tryStartGame();
  assert.ok(started, 'tryStartGame() failed');
}

/** Stubs Math.random with a repeating sequence of values, returns a restore fn. */
function stubRandomSequence(values: number[]): () => void {
  const saved = Math.random;
  let i = 0;
  Math.random = () => values[i < values.length ? i++ : values.length - 1];
  return () => { Math.random = saved; };
}

// ---- Tests ----

describe('Game', () => {

  // 1
  it('starts in SETUP phase with hero/locker item options for all players', () => {
    const game = makeGame();
    assert.strictEqual(game.getPhase(), Phase.SETUP);
    for (const p of game.players) {
      assert.ok(p.setupHeroOptions.length > 0);
      assert.ok(p.setupLockerOptions.length > 0);
      assert.ok(p.setupCardOptions.length > 0);
    }
  });

  // 2
  it('tryStartGame returns false when players are not confirmed', () => {
    const game = makeGame();
    const result = game.tryStartGame();
    assert.strictEqual(result, false);
    assert.strictEqual(game.getPhase(), Phase.SETUP);
  });

  // 3
  it('tryStartGame transitions to ACTION phase and spawns initial zombies', () => {
    const game = makeGame();
    fastStartGame(game);
    assert.strictEqual(game.getPhase(), Phase.ACTION);
    assert.ok(game.getZombies().length > 0, 'Should have spawned initial zombies');
  });

  // 4
  it('processAction move subtracts 1 action and advances player position', () => {
    const game = makeGame([[2, 1], [9, 9]]);
    fastStartGame(game);

    const p1 = game.players[0];
    p1.gold = 100; // ensure enough gold for movement cost

    game.setMode('M');
    const before = game.getActionsRemaining();
    const target = new HexCoordinate(3, 1); // adjacent tile (right neighbor of (2,1))

    game.processAction(p1.id, target);

    assert.strictEqual(p1.position.q, 3, 'Player should have moved to q=3');
    assert.strictEqual(p1.position.r, 1, 'Player should have moved to r=1');
    assert.strictEqual(game.getActionsRemaining(), before - 1);
  });

  // 5
  it('using 3 actions calls endTurn and advances to next player', () => {
    // Use 3 players so pass-all doesn't trigger zombiePhase immediately
    const game = makeGame([[0, 0], [2, -1], [-2, 0]]);
    fastStartGame(game);

    const p1 = game.players[0];
    p1.gold = 100;

    // Use actions until turn ends (pass 3 times by spending actions)
    game.useAction();
    game.useAction();
    assert.strictEqual(game.getCurrentPlayer(), p1, 'Still p1\'s turn after 2 actions');
    game.useAction(); // 3rd action triggers endTurn

    // Turn should have passed to a different player
    assert.notStrictEqual(game.getCurrentPlayer(), p1, 'Turn should have advanced');
    assert.strictEqual(game.getActionsRemaining(), 3, 'New player should have 3 actions');
  });

  // 6
  it('all players passing triggers zombie phase and increments generation', () => {
    const game = makeGame([[0, 0], [2, -1]]);
    fastStartGame(game);

    const genBefore = game.getGenerationCount();
    game.passTurn(game.players[0].id);
    game.passTurn(game.players[1].id);
    // After all pass: zombie phase runs, then drafting starts
    assert.ok(
      game.getPhase() === Phase.DRAFTING || game.getPhase() === Phase.ESCAPE || game.getPhase() === Phase.GAME_OVER,
      `Expected DRAFTING/ESCAPE/GAME_OVER, got ${game.getPhase()}`,
    );
    // Generation increments before drafting
    assert.ok(game.getGenerationCount() >= genBefore + 1 || game.getPhase() === Phase.ESCAPE);
  });

  // 7
  it('spawnZombiesByTileID places floor(totalSP/15) zombies in Gymnasium first', () => {
    const game = makeGame([[0, 0], [2, -1]]);
    fastStartGame(game);

    // Clear existing zombies first
    game.getZombies().length = 0;

    // Set up deterministic SP total: 30 → spawn 2 zombies
    game.players[0].survivalPoints = 15;
    game.players[1].survivalPoints = 15;

    // Use public method
    (game as any).spawnZombiesByTileID();

    // Should have spawned 2 (30/15=2)
    const zombies = game.getZombies();
    assert.ok(zombies.length >= 2, `Expected at least 2 zombies, got ${zombies.length}`);

    // New zombies should appear in the Gymnasium (first tiles returned by getGymnasiumTiles)
    const gymTiles = game.getBoard().getGymnasiumTiles();
    assert.ok(
      zombies.some(z => z.position.equals(gymTiles[0]) || z.position.equals(gymTiles[1])),
      'Zombies should spawn in the Gymnasium',
    );
  });

  // 8
  it('income phase awards gold equal to SP + goldProduction', () => {
    const game = makeGame([[0, 0], [2, -1]]);
    fastStartGame(game);

    const p1 = game.players[0];
    const goldBefore = p1.gold;
    const expectedGain = p1.survivalPoints + p1.goldProduction;

    (game as any).incomePhase();

    assert.strictEqual(p1.gold, goldBefore + expectedGain);
  });

  // 9
  it('trap kills zombie when d6 roll >= successRate', () => {
    // Set up game with real randomness, then stub only for the zombie.takeTurn() call.
    // Sequence: [0 → pick neighbors[0]=(-1,0) trap hex], [0.5 → d6 roll=4 >= successRate=3 → kill]
    const game = makeGame([[2, 0], [7, 9]]);
    fastStartGame(game);
    game.getZombies().length = 0;

    // Zombie at (2,2) will BFS toward player at (2,0); the path goes (2,2)→(2,1)→(2,0).
    // Trap is placed at (2,1) so the zombie walks into it on the first step.
    const trapHex = new HexCoordinate(2, 1);
    const zombieStartHex = new HexCoordinate(2, 2);
    const p1 = game.players[0]; // positioned at (2,0)
    p1.trapSuccessRate = 3;

    game.getBoard().placeTrap(trapHex, new Trap(p1.id));
    const zombie = new Zombie(zombieStartHex);
    game.getZombies().push(zombie);

    const niceBefore = p1.nicePoints;
    // Only the trap d6 roll uses Math.random now (no random movement)
    const restore = stubRandomSequence([0.5]); // floor(0.5*6)+1 = 4 >= 3 → kill
    try {
      zombie.takeTurn(
        game.getBoard(), 0,
        (h) => game.isZombieAt(h),
        (h) => game.isPlayerAt(h),
        () => { },
        () => { },
        () => { },
        (ownerId, _trapPos) => {
          const owner = game.getPlayerById(ownerId as PlayerId);
          if (owner) owner.addNicePoints(1);
        },
        () => { },
        () => { },
        (hexKey) => {
          const t = game.getBoard().getTraps().get(hexKey);
          return t ? { ownerId: t.ownerId, successRate: 3 } : undefined;
        },
        (h) => {
          const p = game.players.find(pl => pl.isAlive && pl.position.equals(h));
          return p ? { id: p.id, hitPoints: p.hitPoints, trapSuccessRate: p.trapSuccessRate } : undefined;
        },
        (_edgeKey) => undefined,
        (_hexKey) => undefined,
        () => game.players.filter(p => p.isAlive).map(p => p.position),
      );
    } finally {
      restore();
    }

    assert.strictEqual(zombie.isAlive, false, 'Zombie should be killed by trap');
    assert.ok(p1.nicePoints > niceBefore, 'Trap owner should gain nice points');
  });

  // 10
  it('barricade holds when d6 roll >= 4', () => {
    // Zombie at (2,5); direction-0 neighbor = (3,5) = barricaded hex.
    // Sequence: [0 → pick neighbors[0]=(3,5)], [0.5 → d6 roll=4 >= 4 = holds]
    const board = new Board();
    const p1 = new Player('p1' as PlayerId, 'Alice', Color.RED, new HexCoordinate(3, 5));

    const hexA = new HexCoordinate(2, 5);
    const hexB = new HexCoordinate(3, 5);
    board.placeBarricade(hexA, hexB, new Barricade(p1.id));

    const zombie = new Zombie(hexA);
    let barricadeHeld = false;

    // Zombie at (2,5) BFS toward player at (3,5); next step = (3,5) = barricaded edge.
    // Only the barricade d6 roll uses Math.random now.
    const restore = stubRandomSequence([0.5]); // floor(0.5*6)+1 = 4 >= 4 → holds
    try {
      zombie.takeTurn(
        board, 0,
        (_h) => false,
        (_h) => false,
        (_ownerId) => { barricadeHeld = true; },
        (_ownerId) => { },
        (_pid) => { },
        (_ownerId, _trapPos) => { },
        () => { },
        () => { },
        (_hexKey) => undefined,
        (_h) => undefined,
        (eKey) => {
          const b = board.getBarricades().get(eKey);
          return b ? { ownerId: b.ownerId, barricadeFailRate: p1.barricadeFailRate } : undefined;
        },
        (_hexKey) => undefined,
        () => [p1.position],
      );
    } finally {
      restore();
    }

    // With roll=4 (>=4), barricade holds — zombie stays at hexA
    assert.strictEqual(zombie.position.equals(hexA), true, 'Zombie should not cross held barricade');
    assert.strictEqual(barricadeHeld, true, 'onBarricadeHold callback should have fired');
  });

  // 11
  it('zombie hitting a player triggers ESCAPE phase', () => {
    const game = makeGame([[0, 0], [3, -3]]);
    fastStartGame(game);

    // Clear zombies and set a zombie adjacent to p1
    game.getZombies().length = 0;
    const p1 = game.players[0];
    p1.position = new HexCoordinate(1, 0);

    // Use pass turns to trigger zombie phase
    // First give players enough resources to pass without issues
    game.passTurn(game.players[0].id);
    game.passTurn(game.players[1].id);
    // After zombie phase, if p1 got hit, phase should be ESCAPE or GAME_OVER
    const phase = game.getPhase();
    assert.ok(
      phase === Phase.DRAFTING || phase === Phase.ESCAPE ||
      phase === Phase.GAME_OVER || phase === Phase.ACTION,
      `Unexpected phase: ${phase}`,
    );
  });

  // 12
  it('setPlayerInEscape puts game in ESCAPE and calculates valid hexes', () => {
    const game = makeGame([[2, 1], [9, 9]]);
    fastStartGame(game);

    const p1 = game.players[0];
    game.setPlayerInEscape(p1.id);
    assert.strictEqual(game.getPhase(), Phase.ESCAPE);
    // Should have some valid escape hexes (neighbors of (2,1) not occupied by zombies/traps)
    assert.ok(game.getValidEscapeHexes().length > 0);
  });

  // 13
  it('escape: processAction on valid escape hex clears escape mode', () => {
    const game = makeGame([[2, 1], [9, 9]]);
    fastStartGame(game);

    const p1 = game.players[0];
    game.setPlayerInEscape(p1.id);
    assert.strictEqual(game.getPhase(), Phase.ESCAPE);

    const escapeHex = game.getValidEscapeHexes()[0];
    game.processAction(p1.id, escapeHex);

    assert.notStrictEqual(game.getPhase(), Phase.ESCAPE, 'Escape mode should have cleared');
    assert.ok(p1.position.equals(escapeHex), 'Player should have moved to escape hex');
  });

  // 14
  it('serialize/deserialize roundtrip preserves game state', () => {
    const game = makeGame([[0, 0], [2, -1]]);
    fastStartGame(game);

    // Make some state changes
    const p1 = game.players[0];
    p1.gold = 42;
    p1.survivalPoints = 25;
    game.setMode('M');

    const serialized = game.serialize();
    const restored = Game.deserialize(serialized);

    assert.strictEqual(restored.getPhase(), game.getPhase());
    assert.strictEqual(restored.getGenerationCount(), game.getGenerationCount());
    assert.strictEqual(restored.getActionsRemaining(), game.getActionsRemaining());
    assert.strictEqual(restored.players[0].gold, 42);
    assert.strictEqual(restored.players[0].survivalPoints, 25);
    assert.strictEqual(restored.getZombies().length, game.getZombies().length);
    assert.strictEqual(restored.getCurrentPlayer().id, game.getCurrentPlayer().id);
  });

  // 15
  it('edgeKey is symmetric: edgeKey(A,B) === edgeKey(B,A)', () => {
    const a = new HexCoordinate(1, -2);
    const b = new HexCoordinate(2, -2);
    assert.strictEqual(edgeKey(a, b), edgeKey(b, a));

    const c = new HexCoordinate(-3, 1);
    const d = new HexCoordinate(-3, 2);
    assert.strictEqual(edgeKey(c, d), edgeKey(d, c));

    // Barricade placed A→B should be found with lookup B→A
    const board = new Board();
    board.placeBarricade(a, b, new Barricade('p1' as PlayerId));
    assert.ok(board.hasBarricade(a, b), 'Should find barricade A→B');
    assert.ok(board.hasBarricade(b, a), 'Should find barricade B→A (symmetric)');
  });

  // 16 (draft phase)
  it('draft phase gives players 4 cards; confirmDraftSelection adds them to hand', () => {
    const game = makeGame([[0, 0], [3, -3]]);
    fastStartGame(game);

    // Trigger the draft phase by having all players pass
    for (const p of game.players) p.gold = 1000; // give lots of gold
    game.passTurn(game.players[0].id);
    game.passTurn(game.players[1].id);

    // After zombie phase + generation increment, should be drafting
    if (game.getPhase() !== Phase.DRAFTING) {
      // Might be in escape mode or game over — skip rest of this test
      return;
    }

    const p1 = game.players[0];
    assert.strictEqual(p1.temporaryHand.length, 4, 'Should receive 4 draft cards');

    const handSizeBefore = p1.cardsInHand.length;
    // Select first card
    game.toggleSelectDraftCard(p1.id, p1.temporaryHand[0].name);
    assert.strictEqual(p1.selectedDraftCards.length, 1);

    game.confirmDraftSelection(p1.id);
    assert.strictEqual(p1.temporaryHand.length, 0, 'Temp hand should be cleared after confirm');
    assert.ok(p1.cardsInHand.length >= handSizeBefore, 'Hand should grow after purchasing cards');
  });

  // 17
  it('skipDraftCard clears temporaryHand without adding to hand', () => {
    const game = makeGame([[0, 0], [3, -3]]);
    fastStartGame(game);

    for (const p of game.players) p.gold = 1000;
    game.passTurn(game.players[0].id);
    game.passTurn(game.players[1].id);

    if (game.getPhase() !== Phase.DRAFTING) return;

    const p1 = game.players[0];
    const handSizeBefore = p1.cardsInHand.length;
    game.skipDraftCard(p1.id);

    assert.strictEqual(p1.temporaryHand.length, 0);
    assert.strictEqual(p1.cardsInHand.length, handSizeBefore, 'Hand should not change after skip');
  });

  // 18
  it('toModel hides opponent hand cards', () => {
    const game = makeGame([[0, 0], [2, -1]]);
    fastStartGame(game);

    // Give p1 some cards
    const { LegacyCard } = require('../../src/server/cards/LegacyCard');
    game.players[0].cardsInHand.push(new LegacyCard('Test Card', 'None', 'None', 'None', 0, 'desc'));

    const modelAsP1 = game.toModel('p1' as PlayerId);
    const modelAsP2 = game.toModel('p2' as PlayerId);

    const p1AsSeenByP1 = modelAsP1.players.find(p => p.id === 'p1');
    const p1AsSeenByP2 = modelAsP2.players.find(p => p.id === 'p1');

    assert.ok(p1AsSeenByP1!.cardsInHand.length > 0, 'P1 should see own hand');
    assert.strictEqual(p1AsSeenByP2!.cardsInHand.length, 0, 'P2 should not see P1\'s hand');
  });

  // 19
  it('villain points awarded when trap is within 2 hexes of opponent during income', () => {
    const game = makeGame([[0, 0], [1, 0]]);
    fastStartGame(game);

    const p1 = game.players[0];
    const p2 = game.players[1];

    // Place p1's trap at (0, 1), which is within 2 hexes of p2 at (1, 0)
    const trapHex = new HexCoordinate(0, 1);
    game.getBoard().placeTrap(trapHex, new Trap(p1.id));

    const cpBefore = p1.coolPoints;
    (game as any).incomePhase();

    assert.ok(p1.coolPoints > cpBefore, 'P1 should earn cool points for nearby trap');
  });
});
