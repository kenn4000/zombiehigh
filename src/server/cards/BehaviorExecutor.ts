import { Player } from '../Player';
import { IGame } from './IGame';
import { Behavior } from './CardBehavior';
import { HexCoordinate } from '../../common/HexCoordinate';
import { getTileRoom } from '../../common/RoomLookup';

/**
 * Phase 5: Executes typed Behavior objects against a player and game.
 * Replaces the stub LegacyCardProcessor.executeEffect().
 *
 * Note: The card's `bonus` field is still parsed by LegacyCardProcessor.parseAndApplyBonus()
 * before this runs. BehaviorExecutor only handles what the `effect` field describes.
 */
export class BehaviorExecutor {
  static execute(behavior: Behavior | undefined, player: Player, game: IGame, cardName: string): void {
    if (!behavior) return;

    // --- Immediate resource gain (from effect, not bonus) ---
    if (behavior.gain) {
      applyDelta(player, behavior.gain);
      if ((behavior.gain.np ?? 0) > 0) game.fireOnNPGained(player);
      if ((behavior.gain.cp ?? 0) > 0) game.fireOnCPGained(player);
    }

    // --- Give resources to all alive players ---
    if (behavior.allPlayersGain) {
      const delta = behavior.allPlayersGain;
      const alive = game.players.filter(p => p.isAlive);
      for (const p of alive) applyDelta(p, delta);
      game.log(`All players gain: ${describeDelta(delta)}`);
    }

    // --- Draw cards ---
    if (behavior.drawCards) {
      game.drawCards(player, behavior.drawCards);
    }

    // --- Kill zombie(s) via targeting system ---
    if (behavior.killZombie) {
      const count = behavior.killZombie.count ?? 1;
      const requireAdj = behavior.killZombie.requireAdjacentPlayer;
      const requireAdjZombie = behavior.killZombie.requireAdjacentZombie;
      if (count === 1) {
        game.startZombieTargeting(player.id, cardName, requireAdj, requireAdjZombie);
      } else {
        for (let i = 0; i < count; i++) {
          game.startZombieTargeting(player.id, cardName, requireAdj, requireAdjZombie);
        }
      }
    }

    // --- Spawn zombies ---
    if (behavior.spawnZombies != null) {
      game.spawnZombies(behavior.spawnZombies);
    }

    // --- Spawn zombies — player chooses placement location ---
    if (behavior.spawnZombiesPlayerChoice != null) {
      for (let i = 0; i < behavior.spawnZombiesPlayerChoice; i++) {
        game.startPendingInteraction('place_zombie', player.id, cardName);
      }
    }

    // --- Free movement steps: grant free steps via game state ---
    if (behavior.moveSteps != null) {
      game.startFreeMoves(player, behavior.moveSteps, behavior.moveStepsPayBarricades);
    }

    // --- Place structures for free ---
    if (behavior.placeFree) {
      if (behavior.placeFree.trap) {
        game.startFreeTrap();
        game.log(`${player.name} places a free trap anywhere. Select a tile.`);
      } else if (behavior.placeFree.bait) {
        game.startFreeBait();
        game.log(`${player.name} places a free bait. Select a tile.`);
      } else if (behavior.placeFree.barricade) {
        const count = behavior.placeFree.barricadeCount ?? 1;
        game.startFreeBarricade(count);
        game.log(`${player.name} places ${count} free barricade(s). Select two adjacent tiles.`);
      }
    }

    // --- Destroy structures ---
    if (behavior.destroy) {
      if (behavior.destroy.anyBarricade) {
        game.startPendingInteraction('destroy_any_barricade', player.id, cardName);
      }
      if (behavior.destroy.anyTrap) {
        game.startPendingInteraction('destroy_any_trap', player.id, cardName);
      }
      if (behavior.destroy.allBarricadesWithin != null) {
        const radius = behavior.destroy.allBarricadesWithin;
        const destroyed: string[] = [];
        for (const edgeKey of game.board.getBarricades().keys()) {
          const parts = edgeKey.split('|');
          if (parts.length === 2) {
            const hexA = HexCoordinate.fromKey(parts[0]);
            const hexB = HexCoordinate.fromKey(parts[1]);
            if (player.position.distanceTo(hexA) <= radius || player.position.distanceTo(hexB) <= radius) {
              destroyed.push(edgeKey);
            }
          }
        }
        for (const key of destroyed) {
          game.board.getBarricades().delete(key);
        }
        game.log(`${player.name} destroyed ${destroyed.length} barricade(s) within ${radius} hexes.`);
      }
      if (behavior.destroy.allBarricadesInRoom) {
        const room = getTileRoom(player.position.q, player.position.r);
        const destroyed: string[] = [];
        for (const edgeKey of game.board.getBarricades().keys()) {
          const parts = edgeKey.split('|');
          if (parts.length === 2) {
            const hexA = HexCoordinate.fromKey(parts[0]);
            if (getTileRoom(hexA.q, hexA.r) === room) {
              destroyed.push(edgeKey);
            }
          }
        }
        for (const key of destroyed) {
          game.board.getBarricades().delete(key);
        }
        game.log(`${player.name} destroyed ${destroyed.length} barricade(s) in the ${room}.`);
      }
      if (behavior.destroy.ownBarricadeOrTrap) {
        game.startPendingInteraction('destroy_own_structure', player.id, cardName);
      }
      if (behavior.destroy.opponentBait) {
        const entry = [...game.board.getBaits().entries()].find(([, ownerId]) => ownerId !== player.id);
        if (entry) {
          game.board.getBaits().delete(entry[0]);
          game.log(`${player.name} removed an opponent's bait.`);
        }
      }
    }

    // --- Discard N, draw M (player chooses which cards to discard) ---
    if (behavior.discardAndDraw) {
      const { discard, draw } = behavior.discardAndDraw;
      // If the player has cards to discard, queue a pending discard; otherwise just draw
      if (player.cardsInHand.length > 0) {
        game.startPendingDiscard(player, Math.min(discard, player.cardsInHand.length), draw);
      } else {
        game.drawCards(player, draw);
      }
    }

    // --- Draw N, discard M (draw first, then player selects discards) ---
    if (behavior.drawThenDiscard) {
      const { draw, discard } = behavior.drawThenDiscard;
      game.drawCards(player, draw);
      game.log(`${player.name} drew ${draw} card(s).`);
      if (player.cardsInHand.length > 0) {
        game.startPendingDiscard(player, Math.min(discard, player.cardsInHand.length), 0);
      }
    }

    // --- Discard all, draw same number ---
    if (behavior.discardAllDrawSame) {
      const handSize = player.cardsInHand.length;
      player.playedCards.push(...player.cardsInHand);
      player.cardsInHand = [];
      game.log(`${player.name} discarded ${handSize} card(s).`);
      game.drawCards(player, handSize);
    }

    // --- Draw N, keep K ---
    if (behavior.drawKeep) {
      const { draw, keep } = behavior.drawKeep;
      game.drawCards(player, draw);
      const toDiscard = draw - keep;
      if (toDiscard > 0 && player.cardsInHand.length > 0) {
        // Prompt the player to interactively choose which cards to discard
        game.log(`${player.name} drew ${draw} — choose ${toDiscard} to discard.`);
        game.startPendingDiscard(player, toDiscard, 0);
      } else {
        game.log(`${player.name} drew ${draw}, kept ${keep}.`);
      }
    }

    // --- Draw N to temporary hand, player selects K to keep ---
    if (behavior.drawKeepFromTemp) {
      const { draw, keep } = behavior.drawKeepFromTemp;
      game.startDrawKeepFromTemp(player, draw, keep);
    }

    // --- Discard 1 card for gold (player chooses which card) ---
    if (behavior.discardForGold) {
      if (player.cardsInHand.length > 0) {
        game.startPendingDiscard(player, 1, 0, behavior.discardForGold.gold);
      }
    }

    // --- Replace opponent's barricade ---
    if (behavior.replaceOpponentBarricade) {
      game.startPendingInteraction('replace_opponent_barricade', player.id, cardName);
    }

    // --- Replace opponent's bait ---
    if (behavior.replaceOpponentBait) {
      const entry = [...game.board.getBaits().entries()].find(([, ownerId]) => ownerId !== player.id);
      if (entry) {
        game.board.getBaits().set(entry[0], player.id);
        game.log(`${player.name} claimed an opponent's bait.`);
      }
    }

    // --- Give gold to another player ---
    if (behavior.giveGoldToPlayer) {
      const amount = behavior.giveGoldToPlayer.amount;
      if (player.gold >= amount) {
        const others = game.players.filter(p => p.id !== player.id && p.isAlive);
        if (others.length > 0) {
          player.spendGold(amount);
          others[0].addGold(amount);
          game.log(`${player.name} gave ${amount} gold to ${others[0].name}.`);
        }
      } else {
        game.log(`${player.name} doesn't have enough gold to give.`);
      }
    }

    // --- Steal gold from adjacent player ---
    if (behavior.stealGoldFromAdjacent) {
      const amount = behavior.stealGoldFromAdjacent.amount;
      const neighbors = game.board.getNeighbors(player.position);
      const adjacentPlayer = game.players.find(
        p => p.id !== player.id && p.isAlive && neighbors.some(n => n.equals(p.position)),
      );
      if (adjacentPlayer) {
        const stolen = Math.min(amount, adjacentPlayer.gold);
        adjacentPlayer.spendGold(stolen);
        player.addGold(stolen);
        game.log(`${player.name} stole ${stolen} gold from ${adjacentPlayer.name}.`);
      }
    }

    // --- Conditional gold gains ---
    if (behavior.conditionalGold) {
      const neighbors = game.board.getNeighbors(player.position);
      let gained = 0;
      if (behavior.conditionalGold.goldPerAdjacentZombie) {
        const zombieCount = neighbors.filter(n => game.isZombieAt(n)).length;
        const bonus = zombieCount * behavior.conditionalGold.goldPerAdjacentZombie;
        player.addGold(bonus);
        gained += bonus;
        game.log(`${player.name} gains ${bonus} gold (${zombieCount} adjacent zombie(s)).`);
      }
      if (behavior.conditionalGold.goldPerAdjacentPlayer) {
        const playerCount = neighbors.filter(n => game.isPlayerAt(n)).length;
        const bonus = playerCount * behavior.conditionalGold.goldPerAdjacentPlayer;
        player.addGold(bonus);
        gained += bonus;
        game.log(`${player.name} gains ${bonus} gold (${playerCount} adjacent player(s)).`);
      }
      if (behavior.conditionalGold.goldPerAdjacentOccupant) {
        if (behavior.moveSteps != null) {
          // Defer gold until after free moves complete so position reflects final landing spot
          game.setPendingPostMoveAdjacencyGold(player, behavior.conditionalGold.goldPerAdjacentOccupant);
        } else {
          const occupantCount = neighbors.filter(n => game.isPlayerAt(n) || game.isZombieAt(n)).length;
          const bonus = occupantCount * behavior.conditionalGold.goldPerAdjacentOccupant;
          player.addGold(bonus);
          gained += bonus;
          game.log(`${player.name} gains ${bonus} gold (${occupantCount} adjacent occupant(s)).`);
        }
      }
    }

    // --- Move + gold ---
    if (behavior.moveAndGold) {
      game.setMode('M');
      game.log(`${player.name} may take a free step.`);
      if (behavior.moveAndGold.goldFlat) {
        player.addGold(behavior.moveAndGold.goldFlat);
        game.log(`${player.name} gains ${behavior.moveAndGold.goldFlat} gold.`);
      }
      if (behavior.moveAndGold.goldPerAdjacentOccupant) {
        const neighbors = game.board.getNeighbors(player.position);
        const occupants = neighbors.filter(n => game.isPlayerAt(n) || game.isZombieAt(n)).length;
        const bonus = occupants * behavior.moveAndGold.goldPerAdjacentOccupant;
        player.addGold(bonus);
        game.log(`${player.name} gains ${bonus} gold (${occupants} adjacent occupant(s)).`);
      }
    }

    // --- Heal another player (interactive targeting) ---
    if (behavior.healOtherPlayer != null) {
      game.startPendingInteraction('heal_player_in_room_simple', player.id, cardName);
    }

    // --- Give HP to adjacent player with 1 HP ---
    if (behavior.giveHPtoAdjacent) {
      const neighbors = game.board.getNeighbors(player.position);
      const target = game.players.find(
        p => p.id !== player.id && p.isAlive && p.hitPoints === 1 && neighbors.some(n => n.equals(p.position)),
      );
      if (target) {
        target.addHealth(behavior.giveHPtoAdjacent.hpAmount);
        player.takeDamage(behavior.giveHPtoAdjacent.hpAmount);
        game.log(`${player.name} gave ${behavior.giveHPtoAdjacent.hpAmount} HP to ${target.name}.`);
      }
    }

    // --- Steal HP from adjacent player if self HP == 1 ---
    if (behavior.stealHPFromAdjacent) {
      if (player.hitPoints === 1) {
        const neighbors = game.board.getNeighbors(player.position);
        const target = game.players.find(
          p => p.id !== player.id && p.isAlive && neighbors.some(n => n.equals(p.position)),
        );
        if (target) {
          target.takeDamage(1);
          player.addHealth(1);
          game.log(`${player.name} stole 1 HP from ${target.name}!`);
        }
      }
    }

    // --- Jump over adjacent player or opponent trap ---
    if (behavior.jumpOver) {
      game.startJumpOver(player);
    }

    // --- Jump over any adjacent occupied tile (player, zombie, trap, bait) ---
    if (behavior.jumpOverAny) {
      game.startJumpOverAny(player);
    }

    // --- Teleport to any hex within radius ---
    if (behavior.teleport) {
      game.startPendingInteraction(`teleport_within_${behavior.teleport.radius}`, player.id, cardName);
    }

    // --- Move a zombie ---
    if (behavior.moveZombie) {
      if (behavior.moveZombie.direction === 'toLowestTile') {
        // Move a neighbor zombie to the lowest available tileID hex
        const neighbors = game.board.getNeighbors(player.position);
        const adjZombie = (game as any).getZombies?.()?.find?.(
          (z: any) => z.isAlive && neighbors.some((n: any) => n.equals(z.position)),
        );
        if (adjZombie) {
          const tiles = game.board.getTilesInIDOrder();
          const target = tiles.find(h => !game.isPlayerAt(h) && !game.isZombieAt(h));
          if (target) {
            adjZombie.position = target;
            game.log(`${player.name} herded a zombie to ${target.key()}.`);
          }
        }
      } else {
        game.startPendingInteraction('move_zombie_away', player.id, cardName);
      }
    }

    // --- Suicide burn ---
    if (behavior.suicideBurn) {
      const { selfHpCost } = behavior.suicideBurn;
      player.takeDamage(selfHpCost);
      const neighbors = game.board.getNeighbors(player.position);
      const zombies = (game as any).getZombies?.() ?? [];
      let killed = 0;
      for (const z of zombies) {
        if (z.isAlive && neighbors.some((n: any) => n.equals(z.position))) {
          z.setDead();
          player.addSurvivalPoints(1);
          killed++;
        }
      }
      game.log(`${player.name} used Suicide Burn! Lost ${selfHpCost} HP, killed ${killed} zombie(s).`);
    }

    // --- Remove all own structures ---
    if (behavior.removeAllOwnStructures) {
      const { gainPerItem } = behavior.removeAllOwnStructures;
      let count = 0;
      for (const [key, trap] of [...game.board.getTraps().entries()]) {
        if (trap.ownerId === player.id) {
          game.board.getTraps().delete(key);
          applyDelta(player, gainPerItem);
          count++;
        }
      }
      for (const [key, bar] of [...game.board.getBarricades().entries()]) {
        if (bar.ownerId === player.id) {
          game.board.getBarricades().delete(key);
          applyDelta(player, gainPerItem);
          count++;
        }
      }
      game.log(`${player.name} removed ${count} own structure(s).`);
    }

    // --- Trap relocation ---
    if (behavior.trapRelocation) {
      game.startPendingInteraction('trap_relocate_step1', player.id, cardName);
    }

    // --- Spatial swap ---
    if (behavior.spatialSwap) {
      game.startPendingInteraction('spatial_swap', player.id, cardName);
    }

    // --- Uncovered locker item ---
    if (behavior.uncoveredLocker) {
      game.selectLockerFromPool(player.id);
    }

    // --- Open Locker: draw N from locker discard, player equips 1 ---
    if (behavior.drawFromLockerDiscard != null) {
      game.selectLockerFromDiscard(player.id, behavior.drawFromLockerDiscard);
    }

    // --- Teleport to a specific room ---
    if (behavior.teleportToRoom) {
      const targetRoom = behavior.teleportToRoom.room;
      game.startPendingInteraction(`teleport_to_room:${targetRoom}`, player.id, cardName);
    }

    // --- Gain gold per zombie in current room ---
    if (behavior.gainGoldPerZombieInCurrentRoom) {
      const myRoom = getTileRoom(player.position.q, player.position.r);
      const zombies = (game as any).getZombies?.() ?? [];
      const count = zombies.filter((z: any) => z.isAlive && getTileRoom(z.position.q, z.position.r) === myRoom).length;
      const bonus = count * behavior.gainGoldPerZombieInCurrentRoom.perZombie;
      player.addGold(bonus);
      game.log(`${player.name} gains ${bonus} gold (${count} zombie(s) in room).`);
    }

    // --- Kill all zombies in current room (costs HP, gains SP per kill) ---
    if (behavior.roomKillAllZombies) {
      const { hpCost, spPerKill } = behavior.roomKillAllZombies;
      player.takeDamage(hpCost);
      const myRoom = getTileRoom(player.position.q, player.position.r);
      const zombies = (game as any).getZombies?.() ?? [];
      let killed = 0;
      for (const z of zombies) {
        if (z.isAlive && getTileRoom(z.position.q, z.position.r) === myRoom) {
          z.setDead();
          player.addSurvivalPoints(spPerKill);
          killed++;
        }
      }
      game.log(`${player.name} cleared the room! Killed ${killed} zombie(s), lost ${hpCost} HP.`);
    }

    // --- Draw 1 card per zombie in current room ---
    if (behavior.drawPerZombieInCurrentRoom) {
      const myRoom = getTileRoom(player.position.q, player.position.r);
      const zombies = (game as any).getZombies?.() ?? [];
      const count = zombies.filter((z: any) => z.isAlive && getTileRoom(z.position.q, z.position.r) === myRoom).length;
      if (count > 0) {
        game.drawCards(player, count);
        game.log(`${player.name} draws ${count} card(s) (${count} zombie(s) in room).`);
      }
    }

    // --- Draw 1 card per trap in current room ---
    if (behavior.drawPerTrapInCurrentRoom) {
      const myRoom = getTileRoom(player.position.q, player.position.r);
      const count = [...game.board.getTraps().entries()].filter(([key]) => {
        const coord = HexCoordinate.fromKey(key);
        return getTileRoom(coord.q, coord.r) === myRoom;
      }).length;
      if (count > 0) {
        game.drawCards(player, count);
        game.log(`${player.name} draws ${count} card(s) (${count} trap(s) in room).`);
      }
    }

    // --- Draw N cards then give N cards to another player ---
    if (behavior.drawAndGiveToPlayer) {
      const { draw, give } = behavior.drawAndGiveToPlayer;
      game.drawCards(player, draw);
      game.log(`${player.name} drew ${draw} card(s). Choose ${give} to give to a player.`);
      game.startPendingInteraction(`give_cards_to_player:${give}`, player.id, cardName);
    }

    // --- Give gold to the alive opponent with the lowest SP ---
    if (behavior.giveGoldToLowestSP) {
      const amount = behavior.giveGoldToLowestSP.amount;
      const alive = game.players.filter(p => p.id !== player.id && p.isAlive);
      if (alive.length > 0) {
        const target = alive.reduce((a, b) => a.survivalPoints <= b.survivalPoints ? a : b);
        const actual = Math.min(amount, player.gold);
        player.spendGold(actual);
        target.addGold(actual);
        game.log(`${player.name} gave ${actual} gold to ${target.name} (lowest SP).`);
      }
    }

    // --- Select any zombie on the board and move it 1 step ---
    if (behavior.moveAnyZombieOneStep) {
      game.startPendingInteraction('move_any_zombie_one_step', player.id, cardName);
    }

    // --- Move an adjacent zombie to a specific room ---
    if (behavior.moveAdjacentZombieToRoom) {
      const { room } = behavior.moveAdjacentZombieToRoom;
      game.startPendingInteraction(`move_adjacent_zombie_to_room:${room}`, player.id, cardName);
    }

    // --- Remove all own structures; player chooses whether each yields NP or CP ---
    if (behavior.removeAllOwnStructuresChoiceNPCP) {
      let count = 0;
      for (const [key, trap] of [...game.board.getTraps().entries()]) {
        if (trap.ownerId === player.id) {
          game.board.getTraps().delete(key);
          count++;
        }
      }
      for (const [key, bar] of [...game.board.getBarricades().entries()]) {
        if (bar.ownerId === player.id) {
          game.board.getBarricades().delete(key);
          count++;
        }
      }
      for (const [key, ownerId] of [...game.board.getBaits().entries()]) {
        if (ownerId === player.id) {
          game.board.getBaits().delete(key);
          count++;
        }
      }
      game.log(`${player.name} removed ${count} own structure(s). Choose NP or CP.`);
      game.startChoiceNPCP(player, count, cardName);
    }

    // --- Teleport to any tile in the same hex row or column ---
    if (behavior.teleportSameRowOrColumn) {
      game.startPendingInteraction('terror_sprint', player.id, cardName);
    }

    // --- Free moves that bypass barricade costs ---
    if (behavior.freeMovesIgnoreBarricades != null) {
      game.startFreeMoves(player, behavior.freeMovesIgnoreBarricades, false);
    }

    // --- Conditional draw/keep only if in specified room (uses temp hand selection) ---
    if (behavior.conditionalDrawKeepInRoom) {
      const { room, draw, keep } = behavior.conditionalDrawKeepInRoom;
      const myRoom = getTileRoom(player.position.q, player.position.r);
      if (myRoom === room) {
        game.startDrawKeepFromTemp(player, draw, keep);
      }
    }

    // Passive cards: no immediate effect beyond being moved to activePassives by playCard()
  }
}

/** Apply a ResourceDelta to a player. */
function applyDelta(p: Player, delta: import('./CardBehavior').ResourceDelta): void {
  if (delta.gold != null) p.addGold(delta.gold);
  if (delta.sp != null) p.addSurvivalPoints(delta.sp);
  if (delta.hp != null) p.addHealth(delta.hp);
  if (delta.cp != null) p.addCoolPoints(delta.cp);
  if (delta.np != null) p.addNicePoints(delta.np);
  if (delta.gp != null) p.goldProduction += delta.gp;
}

/** Describe a ResourceDelta as a human-readable string. */
function describeDelta(delta: import('./CardBehavior').ResourceDelta): string {
  const parts: string[] = [];
  if (delta.gold) parts.push(`${delta.gold} gold`);
  if (delta.sp) parts.push(`${delta.sp} SP`);
  if (delta.hp) parts.push(`${delta.hp} HP`);
  if (delta.cp) parts.push(`${delta.cp} CP`);
  if (delta.np) parts.push(`${delta.np} NP`);
  if (delta.gp) parts.push(`${delta.gp} GP`);
  return parts.join(', ') || '(nothing)';
}

/** Discard up to N cards from hand, oldest first. Returns how many were discarded. */
function autoDiscard(player: Player, count: number): number {
  const toDiscard = Math.min(count, player.cardsInHand.length);
  const discarded = player.cardsInHand.splice(0, toDiscard);
  player.playedCards.push(...discarded);
  return toDiscard;
}
