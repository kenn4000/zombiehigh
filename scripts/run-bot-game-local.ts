import * as fs from 'fs';
import * as path from 'path';
import { Game } from '../src/server/Game';
import { Board } from '../src/server/Board';
import { Player } from '../src/server/Player';
import { Color } from '../src/common/Color';
import { HexCoordinate } from '../src/common/HexCoordinate';
import { Phase } from '../src/common/Phase';
import { generateGameId, generatePlayerId, PlayerId } from '../src/common/Types';
import { LockerId } from '../src/common/LockerId';
import { AIPlayer } from '../src/server/ai/AIPlayer';

type RunnerHeartbeat = {
    step: number;
    phase: string;
    generation: number;
    currentPlayerId?: string;
    currentPlayerName?: string;
    currentPlayerAlive?: boolean;
    waitingForType?: string;
    highlightedHexCount?: number;
    pendingInteractionType?: string;
    pendingTargetCardName?: string;
    pendingTargetPlayerId?: string;
    actionsRemaining?: number;
    lastDecisionActionType?: string;
    lastDecisionReason?: string;
    lastDecisionCard?: string;
};

function parseHex(key: string): HexCoordinate {
    const [qRaw, rRaw] = key.split(',');
    return new HexCoordinate(Number(qRaw), Number(rRaw));
}

function getPlayerCountFromArgs(): number {
    const byEquals = process.argv.find(a => a.startsWith('--players='));
    const bySpaceIndex = process.argv.findIndex(a => a === '--players');

    const raw = byEquals
        ? byEquals.split('=')[1]
        : (bySpaceIndex >= 0 ? process.argv[bySpaceIndex + 1] : undefined);

    const parsed = raw ? Number(raw) : 5;
    if (!Number.isInteger(parsed) || parsed < 2 || parsed > 5) {
        throw new Error('Invalid --players value. Expected an integer from 2 to 5.');
    }
    return parsed;
}

function getHeartbeatFileFromArgs(): string | undefined {
    const byEquals = process.argv.find(a => a.startsWith('--heartbeat-file='));
    const bySpaceIndex = process.argv.findIndex(a => a === '--heartbeat-file');

    const raw = byEquals
        ? byEquals.split('=')[1]
        : (bySpaceIndex >= 0 ? process.argv[bySpaceIndex + 1] : undefined);

    return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

function writeHeartbeat(filePath: string | undefined, snapshot: RunnerHeartbeat): void {
    if (!filePath) return;
    try {
        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch {
        // Best-effort diagnostics only.
    }
}

function resolveEmptyPendingDiscard(game: Game, playerId: PlayerId): boolean {
    const player = game.getPlayerById(playerId);
    if (!player?.pendingDiscardDraw || player.cardsInHand.length > 0) {
        return false;
    }

    const { draw, goldReward } = player.pendingDiscardDraw;
    player.pendingDiscardDraw = undefined;

    const outcome: string[] = ['had no cards left to discard'];
    if (goldReward != null && goldReward > 0) {
        player.addGold(goldReward);
        outcome.push(`gained ${goldReward} gold`);
    }
    if (draw > 0) {
        game.drawCards(player, draw);
        outcome.push(`drew ${draw} card(s)`);
    }

    game.log(`${player.name} ${outcome.join(' and ')}.`);

    const gAny = game as any;
    if (typeof gAny.maybeEndTurn === 'function') {
        gAny.maybeEndTurn();
    }

    return true;
}

function resolveLivePendingCardSelection(game: Game, playerId: PlayerId): boolean {
    const player = game.getPlayerById(playerId);
    if (!player) {
        return false;
    }

    if (player.pendingDrawKeepCount > 0) {
        const card = player.temporaryHand[0];
        if (card) {
            game.keepDrawnCard(playerId, card.name);
            return true;
        }

        player.pendingDrawKeepCount = 0;
        game.log(`${player.name} had no temporary cards left to keep; canceled pending keep selection.`);
        const gAny = game as any;
        if (typeof gAny.maybeEndTurn === 'function') {
            gAny.maybeEndTurn();
        }
        return true;
    }

    if (player.pendingDiscardDraw) {
        const card = player.cardsInHand[0];
        if (card) {
            game.discardCardFromPending(playerId, card.name);
            return true;
        }

        return resolveEmptyPendingDiscard(game, playerId);
    }

    return false;
}

function cancelImpossiblePendingInteraction(game: Game): boolean {
    const gAny = game as any;
    const pendingInteraction = gAny.pendingInteraction as
        | { type: string; playerId: PlayerId; cardName: string }
        | undefined;

    if (!pendingInteraction) {
        return false;
    }

    const player = game.getPlayerById(pendingInteraction.playerId);
    game.log(`${player?.name ?? 'Bot'} had no valid highlighted tiles left for ${pendingInteraction.cardName}; canceled pending interaction.`);
    gAny.pendingInteraction = undefined;

    if (typeof gAny.maybeEndTurn === 'function') {
        gAny.maybeEndTurn();
    }

    return true;
}

function cancelImpossibleSoftPendingState(game: Game, playerId: PlayerId): boolean {
    const gAny = game as any;
    const player = game.getPlayerById(playerId);
    if (!player) {
        return false;
    }

    if (gAny.pendingJumpOver) {
        game.log(`${player.name} had no valid jump-over landing tile left; canceled jump effect.`);
        gAny.pendingJumpOver = false;
        gAny.pendingJumpOverAny = false;
        gAny.pendingJumpOverSP = 0;
        gAny.pendingJumpOverNP = 0;
        if (typeof gAny.maybeEndTurn === 'function') {
            gAny.maybeEndTurn();
        }
        return true;
    }

    if (gAny.pendingFreeMoveSteps > 0 && gAny.pendingFreeMovePlayerId === playerId) {
        game.log(`${player.name} had no valid free-move destination left; canceled remaining free steps.`);
        gAny.pendingFreeMoveSteps = 0;
        gAny.pendingFreeMovePlayerId = undefined;
        gAny.pendingFreeMovesPayBarricades = false;
        if (typeof gAny.maybeEndTurn === 'function') {
            gAny.maybeEndTurn();
        }
        return true;
    }

    return false;
}

function run(): void {
    const playerCount = getPlayerCountFromArgs();
    const heartbeatFile = getHeartbeatFileFromArgs();
    const gameId = generateGameId();
    const board = new Board();
    const startPositions: Array<[number, number]> = [
        [1, 1],
        [9, 8],
        [9, 1],
        [1, 8],
        [5, 4],
    ];

    const colors: Color[] = [Color.RED, Color.BLUE, Color.GREEN, Color.YELLOW, Color.CYAN];
    const players: Player[] = Array.from({ length: playerCount }, (_, i) => new Player(
        generatePlayerId(),
        `CPU-${i + 1}`,
        colors[i],
        new HexCoordinate(...startPositions[i]),
        true,
        'normal',
    ));

    const game = new Game(gameId, board, players);
    let lastTurnKey = '';
    let turnAttempts = 0;
    let lastDecisionActionType = '';
    let lastDecisionReason = '';
    let lastDecisionCard = '';

    const maxSteps = 20000;
    for (let step = 0; step < maxSteps; step++) {
        const phase = game.getPhase();
        if (step % 25 === 0) {
            const current = game.getCurrentPlayer();
            const model = game.toModel(current.id as PlayerId);
            const self = model.players.find(pl => pl.id === current.id);
            const gAny = game as any;
            writeHeartbeat(heartbeatFile, {
                step,
                phase: String(phase),
                generation: game.getGenerationCount(),
                currentPlayerId: current.id,
                currentPlayerName: current.name,
                currentPlayerAlive: current.isAlive,
                waitingForType: self?.waitingFor?.type,
                highlightedHexCount: model.board.highlightedHexKeys.length,
                pendingInteractionType: gAny.pendingInteraction?.type,
                pendingTargetCardName: gAny.pendingTargetCardName,
                pendingTargetPlayerId: gAny.pendingTargetPlayerId,
                actionsRemaining: game.getActionsRemaining(),
                lastDecisionActionType,
                lastDecisionReason,
                lastDecisionCard,
            });
        }
        if (phase === Phase.GAME_OVER) break;

        if (phase === Phase.SETUP) {
            for (const p of game.players) {
                if (!p.selectedHero && p.setupHeroOptions.length > 0) {
                    p.selectedHero = p.setupHeroOptions[0];
                }
                if (p.selectedLockers.length < 2 && p.setupLockerOptions.length >= 2) {
                    p.selectedLockers = [p.setupLockerOptions[0], p.setupLockerOptions[1]];
                }
                if (p.selectedStartingCards.length === 0) {
                    if (p.selectedHero?.id === 'card_shark') {
                        p.selectedStartingCards = [...p.setupCardOptions];
                    } else {
                        const startGold = p.selectedHero?.startGold ?? 0;
                        const lockerGold = p.selectedLockers.reduce((sum, l) => sum + (l.bonusGold ?? 0), 0);
                        const keepCount = Math.max(0, Math.min(p.setupCardOptions.length, Math.floor((startGold + lockerGold) / 4)));
                        p.selectedStartingCards = p.setupCardOptions.slice(0, keepCount);
                    }
                }
                if (!p.setupConfirmed) game.confirmSetup(p.id as PlayerId);
            }
            game.tryStartGame();
            continue;
        }

        if (phase === Phase.PLACEMENT) {
            const model = game.toModel(game.getCurrentPlayer().id as PlayerId);
            const firstHex = model.board.highlightedHexKeys[0];
            if (firstHex) {
                game.processAction(game.getCurrentPlayer().id as PlayerId, parseHex(firstHex));
            } else {
                game.autoResolvePlacement();
            }
            continue;
        }

        if (phase === Phase.NIGHT_CHOICE) {
            const model = game.toModel(game.getCurrentPlayer().id as PlayerId);
            if (model.nightChoicePlayerId) {
                game.resolveNightChoice(model.nightChoicePlayerId as PlayerId, 'np');
            }
            continue;
        }

        if (phase === Phase.DRAFTING) {
            for (const p of game.players) {
                if (p.isAlive) game.confirmDraftSelection(p.id as PlayerId);
            }
            continue;
        }

        if (phase === Phase.ESCAPE) {
            const model = game.toModel(game.getCurrentPlayer().id as PlayerId);
            const escapePlayerId = model.playerInEscapeId as PlayerId | undefined;
            if (escapePlayerId && model.board.highlightedHexKeys.length > 0) {
                const before = game.getPlayerById(escapePlayerId);
                const beforePos = before?.position.key();
                let resolved = false;

                for (const hk of model.board.highlightedHexKeys) {
                    game.processAction(escapePlayerId, parseHex(hk));
                    const after = game.getPlayerById(escapePlayerId);
                    const moved = !!after && after.position.key() !== beforePos;
                    if (game.getPhase() !== Phase.ESCAPE || !after?.isAlive || moved) {
                        resolved = true;
                        break;
                    }
                }

                if (resolved) {
                    continue;
                }
            }

            if (escapePlayerId) {
                // Fallback for escape deadlock: no legal escape tile exists.
                const trapped = game.getPlayerById(escapePlayerId);
                if (trapped && trapped.hitPoints > 0) {
                    trapped.takeDamage(trapped.hitPoints);
                    game.log(`${trapped.name} had no valid escape tile and was eliminated.`);
                }

                const alive = game.players.filter(p => p.isAlive);
                if (alive.length === 1 && !alive[0].isLastSurvivor) {
                    alive[0].isLastSurvivor = true;
                    alive[0].addSurvivalPoints(5);
                    game.log(`<b>${alive[0].name}</b> is the last survivor! +5 bonus SP!`);
                }
                if (alive.length === 0) {
                    for (const [, trap] of game.board.getTraps()) {
                        const owner = game.getPlayerById(trap.ownerId as PlayerId);
                        if (owner) owner.addSurvivalPoints(1);
                    }
                    for (const [, bar] of game.board.getBarricades()) {
                        const owner = game.getPlayerById(bar.ownerId as PlayerId);
                        if (owner) owner.addSurvivalPoints(1);
                    }
                    game.board.getTraps().clear();
                    game.board.getBarricades().clear();
                }

                const gAny = game as any;
                gAny.playerInEscapeId = undefined;
                gAny.validEscapeHexes = [];
            }
            continue;
        }

        if (phase === Phase.ACTION) {
            const active = game.getCurrentPlayer();
            if (!active) {
                continue;
            }

            const activeId = active.id as PlayerId;
            if (resolveLivePendingCardSelection(game, activeId)) {
                continue;
            }

            if (resolveEmptyPendingDiscard(game, activeId)) {
                continue;
            }

            const gAny = game as any;
            if (!active?.isAlive) {
                const pendingInteraction = gAny.pendingInteraction as { playerId: PlayerId; cardName: string } | undefined;
                if (pendingInteraction?.playerId === activeId) {
                    game.log(`${active.name} could not finish ${pendingInteraction.cardName} after being eliminated; canceled pending interaction.`);
                    gAny.pendingInteraction = undefined;
                    if (typeof gAny.maybeEndTurn === 'function') {
                        gAny.maybeEndTurn();
                    }
                    continue;
                }

                if (gAny.pendingTargetPlayerId === activeId && gAny.pendingTargetCardName !== undefined) {
                    game.log(`${active.name} could not finish ${gAny.pendingTargetCardName} after being eliminated; canceled pending target.`);
                    gAny.pendingTargetCardName = undefined;
                    gAny.pendingTargetPlayerId = undefined;
                    gAny.pendingTargetRoomFilter = undefined;
                    gAny.pendingTargetRequireAdjacentPlayer = false;
                    gAny.pendingTargetRequireAdjacentZombie = false;
                    gAny.pendingTargetSPReward = 0;
                    gAny.pendingTargetNPReward = 0;
                    continue;
                }

                game.passTurn(activeId);
                continue;
            }

            const model = game.toModel(activeId);
            const self = model.players.find(pl => pl.id === active.id);
            const waitingFor = self?.waitingFor;

            // Resolve explicit pending interactions first.
            if (waitingFor) {
                switch (waitingFor.type) {
                    case 'confirm':
                        game.passTurn(active.id as PlayerId);
                        break;
                    case 'select_hex': {
                        const pick = waitingFor.validHexKeys[0];
                        if (pick) game.processAction(active.id as PlayerId, parseHex(pick));
                        else game.passTurn(active.id as PlayerId);
                        break;
                    }
                    case 'select_card': {
                        const card = waitingFor.validCardNames[0];
                        if (card) {
                            if (game.playerHasPendingDrawKeep(active.id as PlayerId)) game.keepDrawnCard(active.id as PlayerId, card);
                            else if (game.playerHasPendingDiscard(active.id as PlayerId)) game.discardCardFromPending(active.id as PlayerId, card);
                            else game.playCard(active.id as PlayerId, card);
                        } else if (resolveEmptyPendingDiscard(game, active.id as PlayerId)) {
                            break;
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    }
                    case 'or_options':
                        game.resolveOrOption(active.id as PlayerId, 0);
                        break;
                    case 'select_locker': {
                        const lid = waitingFor.lockerIds[0];
                        if (lid) game.resolveLockerChoice(active.id as PlayerId, lid as LockerId);
                        else game.passTurn(active.id as PlayerId);
                        break;
                    }
                    case 'select_player': {
                        const targetId = waitingFor.validPlayerIds[0] as PlayerId | undefined;
                        const target = targetId ? game.getPlayerById(targetId) : undefined;
                        if (target?.isAlive) {
                            game.processAction(active.id as PlayerId, target.position);
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    }
                    default:
                        game.passTurn(active.id as PlayerId);
                        break;
                }
                continue;
            }

            // Some pending interactions are only represented via highlighted hexes.
            // Resolve those before asking AI for a new strategic action.
            if (model.board.highlightedHexKeys.length > 0) {
                const pick = model.board.highlightedHexKeys[0];
                const pendingTargetPlayerId = gAny.pendingTargetPlayerId as PlayerId | undefined;
                const pendingInteractionPlayerId = gAny.pendingInteraction?.playerId as PlayerId | undefined;
                const actorId = pendingTargetPlayerId ?? pendingInteractionPlayerId ?? activeId;
                game.processAction(actorId, parseHex(pick));
                continue;
            }

            if (cancelImpossibleSoftPendingState(game, activeId)) {
                continue;
            }

            if (cancelImpossiblePendingInteraction(game)) {
                continue;
            }

            // Targeted-zombie card effects can deadlock if no valid zombie remains.
            // Clear impossible pending target state so the simulation can continue.
            if (gAny.pendingTargetCardName !== undefined) {
                game.log(`No valid zombie targets remained for ${gAny.pendingTargetCardName}; canceled pending target.`);
                gAny.pendingTargetCardName = undefined;
                gAny.pendingTargetPlayerId = undefined;
                gAny.pendingTargetRoomFilter = undefined;
                gAny.pendingTargetRequireAdjacentPlayer = false;
                gAny.pendingTargetRequireAdjacentZombie = false;
                gAny.pendingTargetSPReward = 0;
                gAny.pendingTargetNPReward = 0;
                continue;
            }

            // Use the actual AI brain for normal action decisions.
            const ai = new AIPlayer(active, game);
            const decision = ai.decideTurnAction();
            lastDecisionActionType = decision.actionType;
            lastDecisionReason = decision.reason ?? '';
            lastDecisionCard = decision.cardToPlay?.name ?? '';
            const beforeKey = `${active.id}:${game.getGenerationCount()}:${game.getActionsRemaining()}:${active.position.key()}`;

            if (decision.cardToPlay) {
                game.playCard(active.id as PlayerId, decision.cardToPlay.name);
            } else {
                switch (decision.actionType) {
                    case 'M':
                        if (decision.targetHex) {
                            game.setMode('M');
                            game.processAction(active.id as PlayerId, decision.targetHex);
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    case 'T':
                        if (decision.targetHex) {
                            game.setMode('T');
                            game.processAction(active.id as PlayerId, decision.targetHex);
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    case 'B':
                        if (decision.targetHex) {
                            game.setMode('B');
                            game.processAction(active.id as PlayerId, decision.targetHex);
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    case 'W':
                        if (decision.targetHex && decision.secondaryHex) {
                            game.handleEdgePlacement(
                                active.id as PlayerId,
                                decision.targetHex.q,
                                decision.targetHex.r,
                                decision.secondaryHex.q,
                                decision.secondaryHex.r,
                            );
                        } else {
                            game.passTurn(active.id as PlayerId);
                        }
                        break;
                    case 'A':
                    case 'DEFER':
                    case 'PASS':
                    default:
                        game.passTurn(active.id as PlayerId);
                        break;
                }
            }

            const afterActive = game.getCurrentPlayer();
            const afterKey = `${afterActive.id}:${game.getGenerationCount()}:${game.getActionsRemaining()}:${afterActive.position.key()}`;
            if (beforeKey === afterKey) {
                const turnKey = `${afterActive.id}:${game.getGenerationCount()}`;
                if (turnKey === lastTurnKey) turnAttempts++;
                else { lastTurnKey = turnKey; turnAttempts = 1; }
                if (turnAttempts >= 5) {
                    game.passTurn(afterActive.id as PlayerId);
                    turnAttempts = 0;
                }
            } else {
                turnAttempts = 0;
            }

            continue;
        }
    }

    {
        const current = game.getCurrentPlayer();
        const model = game.toModel(current.id as PlayerId);
        const self = model.players.find(pl => pl.id === current.id);
        const gAny = game as any;
        writeHeartbeat(heartbeatFile, {
            step: maxSteps,
            phase: String(game.getPhase()),
            generation: game.getGenerationCount(),
            currentPlayerId: current.id,
            currentPlayerName: current.name,
            currentPlayerAlive: current.isAlive,
            waitingForType: self?.waitingFor?.type,
            highlightedHexCount: model.board.highlightedHexKeys.length,
            pendingInteractionType: gAny.pendingInteraction?.type,
            pendingTargetCardName: gAny.pendingTargetCardName,
            pendingTargetPlayerId: gAny.pendingTargetPlayerId,
            actionsRemaining: game.getActionsRemaining(),
            lastDecisionActionType,
            lastDecisionReason,
            lastDecisionCard,
        });
    }

    const tracking = game.getTrackingData();
    const outDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const logFile = path.join(outDir, `gamelog-${game.id}.txt`);
    const trackingFile = path.join(outDir, `tracking-${game.id}.json`);

    fs.writeFileSync(logFile, tracking.gameLog.join('\n'), 'utf8');
    fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2), 'utf8');

    console.log(`GAME_ID=${game.id}`);
    console.log(`PLAYER_COUNT=${playerCount}`);
    console.log(`PHASE=${game.getPhase()}`);
    console.log(`LOG_FILE=${logFile}`);
    console.log(`TRACKING_FILE=${trackingFile}`);
    console.log(`LOG_LINES=${tracking.gameLog.length}`);
    if (tracking.finalScoresByPlayer) {
        console.log(`WINNER=${tracking.finalScoresByPlayer[0]?.playerName ?? 'n/a'}`);
    }
}

run();