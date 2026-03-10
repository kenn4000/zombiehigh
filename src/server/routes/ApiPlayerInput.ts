import { Router, Request, Response } from 'express';
import { GameLoader } from '../database/GameLoader';
import { WebSocketManager } from '../WebSocketManager';
import { isPlayerId, PlayerId } from '../../common/Types';
import { Phase } from '../../common/Phase';
import { HexCoordinate } from '../../common/HexCoordinate';
import { HeroId } from '../../common/HeroId';
import { LockerId } from '../../common/LockerId';
import { InputResponse } from '../../common/inputs/InputResponse';

// Extended input types for server-side use (not yet in common InputResponse)
type SelectHeroInput = { type: 'select_hero'; heroId: HeroId };
type SelectLockerInput = { type: 'select_locker'; lockerId: LockerId };
type ActivateActionInput = { type: 'activate_action'; cardName: string };
type SetModeInput = { type: 'set_mode'; mode: string };
type StartGameInput = { type: 'start_game' };
type SelectEdgeInput = { type: 'select_edge'; qa: number; ra: number; qb: number; rb: number };
type DeferInput = { type: 'defer' };
type NightChoiceInput = { type: 'night_choice'; choice: 'np' | 'cp' };
type SellCardInput = { type: 'sell_card'; cardName: string };

type ServerInput = InputResponse | SelectHeroInput | SelectLockerInput | ActivateActionInput | SetModeInput | StartGameInput | SelectEdgeInput | DeferInput | NightChoiceInput | SellCardInput;

const router = Router();

router.post('/api/player-input/:playerId', (req: Request, res: Response) => {
  const { playerId } = req.params;
  if (!playerId || !isPlayerId(playerId)) {
    res.status(400).json({ error: 'Invalid playerId' });
    return;
  }

  const pid = playerId as PlayerId;
  const game = GameLoader.getGameForPlayer(pid);
  if (!game) {
    res.status(404).json({ error: 'Game not found for this player' });
    return;
  }

  const input = req.body as ServerInput;
  const phase = game.getPhase();

  switch (input.type) {
    case 'select_hex': {
      const hex = new HexCoordinate(input.hex.q, input.hex.r);
      game.processAction(pid, hex);
      break;
    }

    case 'select_card': {
      const cardName = input.cardNames[0];
      if (!cardName) break;
      if (phase === Phase.SETUP) {
        game.toggleKeepStartingCard(pid, cardName);
      } else if (phase === Phase.DRAFTING) {
        game.toggleSelectDraftCard(pid, cardName);
      } else if (phase === Phase.ACTION || phase === Phase.ESCAPE) {
        // If the player has a pending draw-keep selection, this card click keeps a card from temp hand
        if (game.playerHasPendingDrawKeep(pid)) {
          game.keepDrawnCard(pid, cardName);
          // If the player has a pending discard queued, this card click is a discard choice
        } else if (game.playerHasPendingDiscard(pid)) {
          game.discardCardFromPending(pid, cardName);
        } else {
          game.playCard(pid, cardName);
        }
      }
      break;
    }

    case 'confirm': {
      if (phase === Phase.SETUP) {
        game.confirmSetup(pid);
      } else if (phase === Phase.ACTION) {
        game.passTurn(pid);
      } else if (phase === Phase.DRAFTING) {
        game.confirmDraftSelection(pid);
      }
      break;
    }
    case 'defer': {
      if (phase === Phase.ACTION) {
        game.deferTurn(pid);
      }
      break;
    }

    case 'or_options': {
      if (phase === Phase.DRAFTING && input.index === 0) {
        game.skipDraftCard(pid);
      } else if (phase === Phase.ACTION) {
        // Resolve pending player choice (e.g. Uncovered Relic)
        game.resolveOrOption(pid, input.index);
      }
      break;
    }

    case 'select_locker': {
      if (phase === Phase.ACTION) {
        // Resolve pending locker item choice during action phase
        game.resolveLockerChoice(pid, input.lockerId);
      } else {
        game.selectLocker(pid, input.lockerId);
      }
      break;
    }

    case 'select_hero': {
      game.selectHero(pid, input.heroId);
      break;
    }

    case 'activate_action': {
      game.activateCardAction(pid, input.cardName);
      break;
    }

    case 'set_mode': {
      game.setMode(input.mode);
      break;
    }

    case 'night_choice': {
      game.resolveNightChoice(pid, (input as NightChoiceInput).choice);
      break;
    }

    case 'start_game': {
      game.tryStartGame();
      break;
    }

    case 'sell_card': {
      game.sellCard(pid, input.cardName);
      break;
    }

    case 'select_edge': {
      game.handleEdgePlacement(pid, input.qa, input.ra, input.qb, input.rb);
      break;
    }

    default:
      res.status(400).json({ error: 'Unknown input type' });
      return;
  }

  game.lastSaveId++;
  GameLoader.saveGame(game);
  // Push updated state to all connected WebSocket clients in this game
  WebSocketManager.broadcastToGame(game);
  res.json(game.toModel(pid));
});

export default router;
