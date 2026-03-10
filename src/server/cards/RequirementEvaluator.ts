import { Player } from '../Player';
import { Board } from '../Board';
import { HexCoordinate } from '../../common/HexCoordinate';
import { CardRequirementDescriptor, SpecialRequirement } from './CardBehavior';
import { getTileRoom } from '../../common/RoomLookup';

type GameContext = {
  board: Board;
  players: readonly Player[];
  zombies: readonly { position: HexCoordinate; isAlive: boolean }[];
};

/**
 * Phase 5: Evaluates typed CardRequirementDescriptors against player and game state.
 * Replaces the regex-based LegacyCardProcessor.meetsRequirement().
 */
export class RequirementEvaluator {
  static meets(
    player: Player,
    requirements: ReadonlyArray<CardRequirementDescriptor>,
    ctx: GameContext,
  ): boolean {
    return requirements.every(req => this.evalOne(player, req, ctx));
  }

  private static evalOne(
    p: Player,
    req: CardRequirementDescriptor,
    ctx: GameContext,
  ): boolean {
    if ('stat' in req) {
      const val = req.stat === 'SP' ? p.survivalPoints
        : req.stat === 'HP' ? p.hitPoints
          : req.stat === 'NiceP' ? p.nicePoints
            : p.coolPoints; // CP
      switch (req.operator) {
        case '>=': return val >= req.value;
        case '<=': return val <= req.value;
        case '>': return val > req.value;
        case '<': return val < req.value;
        case '==': return val === req.value;
      }
    }

    if ('adjacentToPlayer' in req) {
      const neighbors = ctx.board.getNeighbors(p.position);
      return neighbors.some(n =>
        ctx.players.some(other => other.id !== p.id && other.isAlive && other.position.equals(n)),
      );
    }

    if ('adjacentToZombie' in req) {
      const neighbors = ctx.board.getNeighbors(p.position);
      return neighbors.some(n =>
        ctx.zombies.some(z => z.isAlive && z.position.equals(n)),
      );
    }

    if ('minBarricadesOnBoard' in req) {
      return ctx.board.getBarricades().size >= req.minBarricadesOnBoard;
    }

    if ('maxOwnTraps' in req) {
      const ownTraps = [...ctx.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
      return ownTraps <= req.maxOwnTraps;
    }

    if ('minOwnTraps' in req) {
      const ownTraps = [...ctx.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
      return ownTraps >= req.minOwnTraps;
    }

    if ('minTrapsOnBoard' in req) {
      return ctx.board.getTraps().size >= req.minTrapsOnBoard;
    }

    if ('minBaitsOnBoard' in req) {
      return ctx.board.getBaits().size >= req.minBaitsOnBoard;
    }

    if ('handSize' in req) {
      const sz = p.cardsInHand.length;
      switch (req.operator) {
        case '<=': return sz <= req.handSize;
        case '>=': return sz >= req.handSize;
        case '==': return sz === req.handSize;
      }
    }

    if ('cardsPlayed' in req) {
      switch (req.operator) {
        case '>=': return p.playedCards.length >= req.cardsPlayed;
      }
    }

    if ('special' in req) {
      return this.evalSpecial(p, req.special, ctx);
    }

    if ('and' in req) {
      return req.and.every(sub => this.evalOne(p, sub, ctx));
    }

    if ('or' in req) {
      return req.or.some(sub => this.evalOne(p, sub, ctx));
    }

    if ('inRoom' in req) {
      return getTileRoom(p.position.q, p.position.r) === req.inRoom;
    }

    if ('notInRoom' in req) {
      return getTileRoom(p.position.q, p.position.r) !== req.notInRoom;
    }

    if ('minOwnBarricades' in req) {
      const own = [...ctx.board.getBarricades().values()].filter(b => b.ownerId === p.id).length;
      return own >= req.minOwnBarricades;
    }

    if ('allPlayersMinTraps' in req) {
      return ctx.board.getTraps().size >= req.allPlayersMinTraps;
    }

    if ('allPlayersMinBarricades' in req) {
      return ctx.board.getBarricades().size >= req.allPlayersMinBarricades;
    }

    if ('adjacentOpponentMinGold' in req) {
      const neighbors = ctx.board.getNeighbors(p.position);
      return neighbors.some(n =>
        ctx.players.some(
          other => other.id !== p.id && other.isAlive && other.position.equals(n) && other.gold >= req.adjacentOpponentMinGold,
        ),
      );
    }

    if ('noOpponentInRoom' in req) {
      const room = req.noOpponentInRoom;
      return !ctx.players.some(
        other => other.id !== p.id && other.isAlive && getTileRoom(other.position.q, other.position.r) === room,
      );
    }

    if ('trapInRoom' in req) {
      const room = req.trapInRoom;
      return [...ctx.board.getTraps().entries()].some(([key, trap]) => {
        const coord = HexCoordinate.fromKey(key);
        return trap.ownerId === p.id && getTileRoom(coord.q, coord.r) === room;
      });
    }

    if ('barricadeInRoom' in req) {
      const room = req.barricadeInRoom;
      return [...ctx.board.getBarricades().entries()].some(([edgeKey, bar]) => {
        if (bar.ownerId !== p.id) return false;
        const parts = edgeKey.split('|');
        const hexA = HexCoordinate.fromKey(parts[0]);
        return getTileRoom(hexA.q, hexA.r) === room;
      });
    }

    if ('zombiesInRoom' in req) {
      const { room, min } = req.zombiesInRoom;
      const count = ctx.zombies.filter(z => z.isAlive && getTileRoom(z.position.q, z.position.r) === room).length;
      return count >= min;
    }

    if ('baitsInRoom' in req) {
      const { room, min } = req.baitsInRoom;
      const count = [...ctx.board.getBaits().keys()].filter(key => {
        const coord = HexCoordinate.fromKey(key);
        return getTileRoom(coord.q, coord.r) === room;
      }).length;
      return count >= min;
    }

    if ('minBarricadesInRoom' in req) {
      const { room, min } = req.minBarricadesInRoom;
      const count = [...ctx.board.getBarricades().keys()].filter(edgeKey => {
        const parts = edgeKey.split('|');
        const hexA = HexCoordinate.fromKey(parts[0]);
        return getTileRoom(hexA.q, hexA.r) === room;
      }).length;
      return count >= min;
    }

    return true;
  }

  private static evalSpecial(
    p: Player,
    special: SpecialRequirement,
    ctx: GameContext,
  ): boolean {
    switch (special) {
      case 'playerLowestSP': {
        const aliveSPs = ctx.players.filter(pl => pl.isAlive).map(pl => pl.survivalPoints);
        return p.survivalPoints === Math.min(...aliveSPs);
      }

      case 'atLeastOnePlayerDead':
        return ctx.players.some(pl => !pl.isAlive);

      case 'hpExactly1':
        return p.hitPoints === 1;

      case 'onBarricadeEdge': {
        const neighbors = ctx.board.getNeighbors(p.position);
        return neighbors.some(n => ctx.board.hasBarricade(p.position, n));
      }

      case 'noPlayersOrZombiesWithin2': {
        const hexes = p.position.getHexesWithinRadius(2);
        const hasPlayerNearby = hexes.some(h =>
          ctx.players.some(other => other.id !== p.id && other.isAlive && other.position.equals(h)),
        );
        const hasZombieNearby = hexes.some(h =>
          ctx.zombies.some(z => z.isAlive && z.position.equals(h)),
        );
        return !hasPlayerNearby && !hasZombieNearby;
      }

      case 'opponentBaitExists':
        for (const [, ownerId] of ctx.board.getBaits()) {
          if (ownerId !== p.id) return true;
        }
        return false;

      case 'opponentBarricadeExists':
        for (const [, bar] of ctx.board.getBarricades()) {
          if (bar.ownerId !== p.id) return true;
        }
        return false;

      case 'cpGtHp':
        return p.coolPoints > p.hitPoints;

      case 'hpGtCp':
        return p.hitPoints > p.coolPoints;

      case 'ownActiveTrapOrBarricade': {
        const hasTrap = [...ctx.board.getTraps().values()].some(t => t.ownerId === p.id);
        const hasBarricade = [...ctx.board.getBarricades().values()].some(b => b.ownerId === p.id);
        return hasTrap || hasBarricade;
      }

      case 'activeBaitOnBoard':
        return ctx.board.getBaits().size > 0;

      case 'adjacentPlayerAt1HP': {
        const neighbors = ctx.board.getNeighbors(p.position);
        return neighbors.some(n =>
          ctx.players.some(
            other => other.id !== p.id && other.isAlive && other.hitPoints === 1 && other.position.equals(n),
          ),
        );
      }

      case 'hasGP':
        return p.goldProduction >= 1;

      case 'noOwnTrapsOrBarricades': {
        const ownTraps = [...ctx.board.getTraps().values()].filter(t => t.ownerId === p.id).length;
        const ownBarricades = [...ctx.board.getBarricades().values()].filter(b => b.ownerId === p.id).length;
        return ownTraps === 0 && ownBarricades === 0;
      }

      case 'npGtCp':
        return p.nicePoints > p.coolPoints;

      case 'cpGtNp':
        return p.coolPoints > p.nicePoints;

      case 'playerHighestSP': {
        const aliveSPs = ctx.players.filter(pl => pl.isAlive).map(pl => pl.survivalPoints);
        return p.survivalPoints === Math.max(...aliveSPs);
      }

      case 'zombieAdjacentToOpponent': {
        return ctx.players.some(other => {
          if (other.id === p.id || !other.isAlive) return false;
          const nb = ctx.board.getNeighbors(other.position);
          return nb.some(n => ctx.zombies.some(z => z.isAlive && z.position.equals(n)));
        });
      }

      case 'allPlayersInDifferentRooms': {
        const alivePlayers = ctx.players.filter(pl => pl.isAlive);
        const rooms = alivePlayers.map(pl => getTileRoom(pl.position.q, pl.position.r));
        return new Set(rooms).size === alivePlayers.length;
      }

      case 'aloneInCurrentRoom': {
        const myRoom = getTileRoom(p.position.q, p.position.r);
        const others = ctx.players.filter(pl => pl.id !== p.id && pl.isAlive);
        return !others.some(pl => getTileRoom(pl.position.q, pl.position.r) === myRoom);
      }

      case 'adjacentOpponentMinHP2': {
        const neighbors = ctx.board.getNeighbors(p.position);
        return neighbors.some(n =>
          ctx.players.some(other => other.id !== p.id && other.isAlive && other.hitPoints >= 2 && other.position.equals(n)),
        );
      }

      case 'jumpOverTargetExists': {
        const dirs: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (const [dq, dr] of dirs) {
          const neighbor = new HexCoordinate(p.position.q + dq, p.position.r + dr);
          if (!ctx.board.isWithinBounds(neighbor)) continue;
          if (!ctx.players.some(other => other.isAlive && other.id !== p.id && other.position.equals(neighbor))) continue;
          const landing = new HexCoordinate(p.position.q + 2 * dq, p.position.r + 2 * dr);
          if (!ctx.board.isWithinBounds(landing)) continue;
          if (ctx.players.some(other => other.isAlive && other.position.equals(landing))) continue;
          if (ctx.zombies.some(z => z.isAlive && z.position.equals(landing))) continue;
          return true;
        }
        return false;
      }

      case 'playerInSameRoomExists': {
        const myRoom = getTileRoom(p.position.q, p.position.r);
        return ctx.players.some(other => other.id !== p.id && other.isAlive &&
          getTileRoom(other.position.q, other.position.r) === myRoom);
      }

      case 'jumpOverAnyTargetExists': {
        // Any occupied adjacent tile (player, zombie, trap, bait) with an empty landing behind
        const dirs2: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (const [dq, dr] of dirs2) {
          const neighbor = new HexCoordinate(p.position.q + dq, p.position.r + dr);
          if (!ctx.board.isWithinBounds(neighbor)) continue;
          const occupied =
            ctx.players.some(other => other.isAlive && other.id !== p.id && other.position.equals(neighbor)) ||
            ctx.zombies.some(z => z.isAlive && z.position.equals(neighbor)) ||
            ctx.board.hasTrap(neighbor) ||
            ctx.board.hasBait(neighbor);
          if (!occupied) continue;
          const landing = new HexCoordinate(p.position.q + 2 * dq, p.position.r + 2 * dr);
          if (!ctx.board.isWithinBounds(landing)) continue;
          if (ctx.players.some(other => other.isAlive && other.position.equals(landing))) continue;
          if (ctx.zombies.some(z => z.isAlive && z.position.equals(landing))) continue;
          return true;
        }
        return false;
      }

      default:
        return true;
    }
  }
}
