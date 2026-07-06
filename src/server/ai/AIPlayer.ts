import { HexCoordinate } from '../../common/HexCoordinate';
import { Player } from '../Player';
import { Game } from '../Game';
import { LegacyCard } from '../cards/LegacyCard';
import { HeroData, LockerData } from '../DraftData';
import { PlayerId } from '../../common/Types';
import { getTileRoom } from '../../common/RoomLookup';

/**
 * AIDecision represents a single decision made by the AI player.
 * This can be an action (Move, Trap, Barricade, Bait, Attack) or meta-actions (Pass, Defer).
 */
export interface AIDecision {
    actionType: 'M' | 'T' | 'B' | 'W' | 'A' | 'PASS' | 'DEFER';
    targetHex?: HexCoordinate;
    secondaryHex?: HexCoordinate;
    cardToPlay?: LegacyCard;
    reason?: string; // Debug info
}

/**
 * AIPlayer: Core decision engine for bot players.
 * Evaluates board state and makes greedy decisions optimized for:
 * 1. Survival (HP > 0)
 * 2. SP Maximization (primary scoring)
 * 3. Resource Generation (gold income)
 */
export class AIPlayer {
    private readonly player: Player;
    private readonly game: Game;
    private readonly difficultyLevel: 'easy' | 'normal' | 'hard';

    constructor(player: Player, game: Game) {
        this.player = player;
        this.game = game;
        this.difficultyLevel = player.difficultyLevel;
    }

    /**
     * Main decision method: evaluate current game state and return next action.
     * Called once per turn (can recurse for multi-action turns).
     */
    public decideTurnAction(): AIDecision {
        if (!this.canAct()) {
            return { actionType: 'PASS', reason: 'Cannot act' };
        }

        const self = this.game.toModel(this.player.id as PlayerId).players.find(p => p.id === this.player.id) as {
            moveCost: number;
            trapCost: number;
            baitCost: number;
            barricadeCost: number;
            trapLimit: number;
            trapsPlaced: number;
            trapSuccessRate: number;
            barricadeFailRate: number;
            barricadeLimit: number;
            survivalPoints: number;
            nicePoints: number;
            coolPoints: number;
            hitPoints: number;
            currentRoom: string;
            cardsInHand: Array<{
                name: string;
                isPlayable: boolean;
                requirementsMet: boolean;
                adjustedCost: number;
                requirementText?: string;
                effectText?: string;
                bonusText?: string;
            }>;
        } | undefined;

        // (a) If likely bite threat this night, move to the safest adjacent tile.
        if (this.isInBiteRangeThisNight()) {
            const escapeHex = this.pickSafestAdjacentMove(self?.moveCost ?? 0);
            if (escapeHex) {
                return {
                    actionType: 'M',
                    targetHex: escapeHex,
                    reason: 'Threatened by nearby zombie; moving away',
                };
            }
        }

        const candidates = this.buildCandidates(self);
        if (candidates.length > 0) {
            const bestScore = Math.max(...candidates.map(c => c.score));
            const tied = candidates.filter(c => c.score === bestScore);
            const best = tied[Math.floor(Math.random() * tied.length)];
            return best.decision;
        }

        return {
            actionType: 'PASS',
            reason: 'No safe move or playable card; passing',
        };
    }

    private isInBiteRangeThisNight(): boolean {
        const zombieSpeed = this.getZombieSpeedForGeneration(this.game.getGenerationCount());
        const zombies = this.game.getZombies().filter(z => z.isAlive);
        // Conservative threat check: zombie can move `speed` then bite from adjacency (+1).
        return zombies.some(z => z.position.distanceTo(this.player.position) <= zombieSpeed + 1);
    }

    private pickSafestAdjacentMove(moveCost: number): HexCoordinate | undefined {
        if (this.player.gold < moveCost) return undefined;
        const board = this.game.getBoard();
        const zombies = this.game.getZombies().filter(z => z.isAlive);
        const neighbors = board.getNeighbors(this.player.position)
            .filter(h => !this.game.isPlayerAt(h) && !this.game.isZombieAt(h) && !board.hasTrap(h) && !board.hasBait(h));

        if (neighbors.length === 0) return undefined;

        const scored = neighbors.map(h => {
            const minDist = zombies.length > 0
                ? Math.min(...zombies.map(z => z.position.distanceTo(h)))
                : 99;
            return { hex: h, score: minDist };
        }).sort((a, b) => b.score - a.score);

        return scored[0]?.hex;
    }

    private pickRandomAdjacentMove(moveCost: number): HexCoordinate | undefined {
        if (this.player.gold < moveCost) return undefined;
        const board = this.game.getBoard();
        const neighbors = board.getNeighbors(this.player.position)
            .filter(h => !this.game.isPlayerAt(h) && !this.game.isZombieAt(h) && !board.hasTrap(h) && !board.hasBait(h));
        if (neighbors.length === 0) return undefined;
        return neighbors[Math.floor(Math.random() * neighbors.length)];
    }

    private buildCandidates(self: {
        moveCost: number;
        trapCost: number;
        baitCost: number;
        barricadeCost: number;
        trapLimit: number;
        trapsPlaced: number;
        trapSuccessRate: number;
        barricadeFailRate: number;
        barricadeLimit: number;
        survivalPoints: number;
        nicePoints: number;
        coolPoints: number;
        hitPoints: number;
        currentRoom: string;
        cardsInHand: Array<{
            name: string;
            isPlayable: boolean;
            requirementsMet: boolean;
            adjustedCost: number;
            requirementText?: string;
            effectText?: string;
            bonusText?: string;
        }>;
    } | undefined): Array<{ decision: AIDecision; score: number }> {
        if (!self) return [];

        const candidates: Array<{ decision: AIDecision; score: number }> = [];
        const zombies = this.game.getZombies().filter(z => z.isAlive);
        const inThreat = this.isInBiteRangeThisNight();
        const ownTrapHexes = [...this.game.getBoard().getTraps().entries()]
            .filter(([, t]) => t.ownerId === this.player.id)
            .map(([k]) => HexCoordinate.fromKey(k));
        const ownBaitCount = [...this.game.getBoard().getBaits().values()]
            .filter(ownerId => ownerId === this.player.id)
            .length;

        const board = this.game.getBoard();
        const desiredRooms = this.getDesiredRoomsForConditionalCards(self);
        const allHexes = board.getAllHexes().filter(h =>
            this.player.position.distanceTo(h) <= 3 &&
            !this.game.isPlayerAt(h) &&
            !this.game.isZombieAt(h) &&
            !board.hasTrap(h) &&
            !board.hasBait(h),
        );

        // Move candidates.
        if (this.player.gold >= self.moveCost) {
            const neighbors = board.getNeighbors(this.player.position)
                .filter(h => !this.game.isPlayerAt(h) && !this.game.isZombieAt(h) && !board.hasTrap(h) && !board.hasBait(h));

            for (const h of neighbors) {
                const minDist = zombies.length > 0 ? Math.min(...zombies.map(z => z.position.distanceTo(h))) : 99;
                let score = 10 + minDist * 4;
                const moveRoom = getTileRoom(h.q, h.r);
                if (desiredRooms.has(moveRoom)) {
                    // Push movement into rooms that unlock held conditional cards.
                    score += 24;
                }
                if (inThreat) score += 25;
                else score += 2;
                candidates.push({
                    decision: {
                        actionType: 'M',
                        targetHex: h,
                        reason: 'Scored movement for safety/positioning',
                    },
                    score,
                });
            }
        }

        const trapTargets = allHexes.filter(h => this.player.position.distanceTo(h) <= 2);
        const baitTargetKeys = new Set<string>();
        for (const z of zombies) {
            for (const h of board.getNeighbors(z.position)) {
                if (this.game.isPlayerAt(h) || this.game.isZombieAt(h) || board.hasTrap(h) || board.hasBait(h)) continue;
                baitTargetKeys.add(h.key());
            }
        }
        const baitTargets = [...baitTargetKeys].map(k => HexCoordinate.fromKey(k));

        const canTrap = self.trapCost != null && this.player.gold >= self.trapCost && self.trapsPlaced < self.trapLimit && trapTargets.length > 0;
        const canBait = self.baitCost != null && this.player.gold >= self.baitCost && baitTargets.length > 0;
        const ownBarricadeCount = [...board.getBarricades().values()].filter(b => b.ownerId === this.player.id).length;
        const canBarricade = self.barricadeCost != null && this.player.gold >= self.barricadeCost && ownBarricadeCount < self.barricadeLimit;

        if (canTrap) {
            for (const h of trapTargets) {
                const nearbyZombies = zombies.filter(z => z.position.distanceTo(h) <= 2).length;
                const forcesInteraction = this.willForceTrapInteractionNextNight(h);
                // User-requested trap efficiency: (1 + 2*(trapSuccessRate/6)) SP / 16 gold.
                // We scale it so it can be compared against card-action scores.
                const trapEfficiency = (1 + 2 * (self.trapSuccessRate / 6)) / 16;
                let score = 14 + nearbyZombies * 6 - (self.trapCost * 0.08) + (inThreat ? 8 : 0);
                if (forcesInteraction) {
                    score += trapEfficiency * 300;
                }
                candidates.push({
                    decision: {
                        actionType: 'T',
                        targetHex: h,
                        reason: forcesInteraction
                            ? 'Scored trap placement (forced next-night interaction efficiency)'
                            : 'Scored trap placement',
                    },
                    score,
                });
            }
        }

        if (canBait) {
            const generation = this.game.getGenerationCount();
            // Prevent long-game stalemates caused by repeated low-value bait placement.
            if (ownBaitCount >= 2 && !inThreat) {
                // Skip bait entirely when enough of our bait is already on board.
            } else {
                for (const h of baitTargets) {
                    const nearbyZombies = zombies.filter(z => z.position.distanceTo(h) <= 3).length;
                    const nearOwnTrap = ownTrapHexes.some(t => t.distanceTo(h) <= 2);

                    if (!nearOwnTrap && !inThreat) {
                        continue;
                    }

                    let score = 8 + nearbyZombies * 3 - (self.baitCost * 0.2);
                    if (nearOwnTrap) score += 9;
                    else score -= 6;
                    // Discourage spamming bait; prefer SP structures/cards once a few are out.
                    score -= ownBaitCount * 5;
                    // Downweight bait as games get very long unless it's trap-synergistic.
                    if (generation > 25 && !nearOwnTrap) score -= 20;
                    if (generation > 40) score -= 12;
                    if (inThreat) score -= 10;
                    if (score <= 0) continue;
                    candidates.push({
                        decision: {
                            actionType: 'B',
                            targetHex: h,
                            reason: 'Scored bait placement',
                        },
                        score,
                    });
                }
            }
        }

        if (canBarricade) {
            const edgeSeen = new Set<string>();
            const anchorHexes = board.getAllHexes().filter(h => this.player.position.distanceTo(h) <= 2);
            for (const a of anchorHexes) {
                for (const b of board.getNeighbors(a)) {
                    const edgeId = [a.key(), b.key()].sort().join('|');
                    if (edgeSeen.has(edgeId)) continue;
                    edgeSeen.add(edgeId);
                    if (board.hasBarricade(a, b)) continue;

                    const blocksPath = this.willZombieCrossEdgeNextNight(a, b);
                    if (!blocksPath) continue;

                    // User-requested barricade efficiency:
                    // (2 - (barricadeSuccessRate / 6)) SP / 11 gold.
                    const barricadeSuccessRate = self.barricadeFailRate;
                    const barricadeEfficiency = (2 - (barricadeSuccessRate / 6)) / 11;
                    const score = 24 + barricadeEfficiency * 280 - (self.barricadeCost * 0.08) + (inThreat ? 6 : 0);

                    candidates.push({
                        decision: {
                            actionType: 'W',
                            targetHex: a,
                            secondaryHex: b,
                            reason: 'Scored barricade on predicted zombie path (efficiency model)',
                        },
                        score,
                    });
                }
            }
        }

        const bestStructureLikeScore = candidates.length > 0
            ? Math.max(...candidates.map(c => c.score))
            : 0;

        // Card plays are scored on the same scale as board actions so the AI can compare directly.
        for (const c of self.cardsInHand.filter(c => c.isPlayable)) {
            const localCard = this.player.cardsInHand.find(x => x.name === c.name);
            if (!localCard) continue;

            let score = this.scoreCardTacticalValue(
                c.effectText,
                c.bonusText,
                c.adjustedCost ?? 0,
                inThreat,
                this.player.hitPoints,
                bestStructureLikeScore,
            );

            score += this.scoreConditionalPlayBonus(c.requirementText, c.requirementsMet, self.currentRoom);

            if (score <= 0) continue;

            candidates.push({
                decision: {
                    actionType: 'PASS',
                    cardToPlay: localCard,
                    reason: `Scored card play: ${localCard.name}`,
                },
                score,
            });
        }

        // Low-priority random roam if there are no stronger options.
        const roamHex = this.pickRandomAdjacentMove(self.moveCost);
        if (roamHex) {
            candidates.push({
                decision: {
                    actionType: 'M',
                    targetHex: roamHex,
                    reason: 'Low-priority roam move',
                },
                score: inThreat ? 1 : 8,
            });
        }

        return candidates;
    }

    private scoreConditionalPlayBonus(
        requirementTextRaw: string | undefined,
        requirementsMet: boolean,
        currentRoom: string,
    ): number {
        const req = (requirementTextRaw ?? '').trim();
        if (!this.isConditionalRequirement(req) || !requirementsMet) return 0;

        let bonus = 0;
        if (this.extractRoomRequirement(req) != null) bonus += 26;
        if (this.hasStatGate(req)) bonus += 14;
        if (req.toLowerCase().includes('highest sp')) bonus += 8;
        if (this.extractRoomRequirement(req) === currentRoom) bonus += 8;
        return bonus;
    }

    private getDesiredRoomsForConditionalCards(self: {
        survivalPoints: number;
        nicePoints: number;
        coolPoints: number;
        hitPoints: number;
        cardsInHand: Array<{
            isPlayable: boolean;
            adjustedCost: number;
            requirementText?: string;
        }>;
    }): Set<string> {
        const rooms = new Set<string>();
        for (const c of self.cardsInHand) {
            if (c.isPlayable) continue;
            const req = (c.requirementText ?? '').trim();
            if (!this.isConditionalRequirement(req)) continue;
            if (c.adjustedCost > this.player.gold) continue;
            if (!this.meetsSimpleStatGates(req, self)) continue;
            const room = this.extractRoomRequirement(req);
            if (room) rooms.add(room);
        }
        return rooms;
    }

    private isConditionalRequirement(requirementTextRaw: string | undefined): boolean {
        const req = (requirementTextRaw ?? '').trim().toLowerCase();
        return req.length > 0 && req !== 'none';
    }

    private hasStatGate(requirementTextRaw: string | undefined): boolean {
        const req = (requirementTextRaw ?? '').toLowerCase();
        return /(sp|np|cp|hp|health)\s*(>=|<=|==|=|≥|≤)/.test(req)
            || req.includes('highest sp')
            || req.includes('last card in hand');
    }

    private meetsSimpleStatGates(requirementTextRaw: string | undefined, self: {
        survivalPoints: number;
        nicePoints: number;
        coolPoints: number;
        hitPoints: number;
        cardsInHand: Array<unknown>;
    }): boolean {
        const req = (requirementTextRaw ?? '').toLowerCase();
        const compact = req.replace(/\s+/g, '');

        const checks: Array<{ key: string; value: number }> = [
            { key: 'sp', value: self.survivalPoints },
            { key: 'np', value: self.nicePoints },
            { key: 'cp', value: self.coolPoints },
            { key: 'hp', value: self.hitPoints },
            { key: 'health', value: self.hitPoints },
        ];

        for (const c of checks) {
            const gte = compact.match(new RegExp(`${c.key}(?:>=|≥)(\\d+)`));
            if (gte && c.value < parseInt(gte[1], 10)) return false;
            const lte = compact.match(new RegExp(`${c.key}(?:<=|≤)(\\d+)`));
            if (lte && c.value > parseInt(lte[1], 10)) return false;
            const eq = compact.match(new RegExp(`${c.key}(?:==|=)(\\d+)`));
            if (eq && c.value !== parseInt(eq[1], 10)) return false;
        }

        if (req.includes('last card in hand') && self.cardsInHand.length !== 1) return false;
        return true;
    }

    private extractRoomRequirement(requirementTextRaw: string | undefined): string | undefined {
        const req = (requirementTextRaw ?? '').toLowerCase();
        const roomAliases: Array<{ aliases: string[]; room: string }> = [
            { aliases: ['science lab', 'science-lab'], room: 'science-lab' },
            { aliases: ['principal\'s office', 'principals office', 'principals-office'], room: 'principals-office' },
            { aliases: ['janitor\'s closet', 'janitors closet', 'janitors-closet'], room: 'janitors-closet' },
            { aliases: ['restroom', 'restrooms'], room: 'restrooms' },
            { aliases: ['library'], room: 'library' },
            { aliases: ['cafeteria'], room: 'cafeteria' },
            { aliases: ['gymnasium'], room: 'gymnasium' },
        ];

        for (const entry of roomAliases) {
            if (entry.aliases.some(a => req.includes(a))) return entry.room;
        }
        return undefined;
    }

    private willForceTrapInteractionNextNight(trapHex: HexCoordinate): boolean {
        const board = this.game.getBoard();
        const speed = this.getZombieSpeedForGeneration(this.game.getGenerationCount());
        const zombies = this.game.getZombies().filter(z => z.isAlive);
        const alivePlayers = this.game.players.filter(p => p.isAlive);
        if (alivePlayers.length === 0 || zombies.length === 0) return false;

        // Match Zombie.takeTurn target preference: closest bait in range 3, then closest living player.
        for (const z of zombies) {
            let target: HexCoordinate | undefined;

            let bestBaitDist = Number.MAX_SAFE_INTEGER;
            let bestBaitTileID = Number.MAX_SAFE_INTEGER;
            for (const [baitKey] of board.getBaits()) {
                const baitHex = HexCoordinate.fromKey(baitKey);
                const distToBait = this.shortestPathLength(z.position, baitHex);
                if (distToBait != null && distToBait <= 3) {
                    const tid = board.getTileID(baitHex);
                    if (distToBait < bestBaitDist || (distToBait === bestBaitDist && tid < bestBaitTileID)) {
                        bestBaitDist = distToBait;
                        bestBaitTileID = tid;
                        target = baitHex;
                    }
                }
            }

            if (!target) {
                let bestPlayerDist = Number.MAX_SAFE_INTEGER;
                let bestPlayerTileID = Number.MAX_SAFE_INTEGER;
                for (const p of alivePlayers) {
                    const d = this.shortestPathLength(z.position, p.position);
                    if (d == null) continue;
                    const tid = board.getTileID(p.position);
                    if (d < bestPlayerDist || (d === bestPlayerDist && tid < bestPlayerTileID)) {
                        bestPlayerDist = d;
                        bestPlayerTileID = tid;
                        target = p.position;
                    }
                }
            }

            if (!target) continue;
            const path = this.shortestPath(z.position, target);
            if (path.length <= 1) continue;

            // Path includes start at index 0. Zombie can move up to `speed` steps tonight.
            const maxIndex = Math.min(speed, path.length - 1);
            for (let i = 1; i <= maxIndex; i++) {
                if (path[i].equals(trapHex)) return true;
            }
        }

        return false;
    }

    private shortestPathLength(start: HexCoordinate, goal: HexCoordinate): number | undefined {
        const path = this.shortestPath(start, goal);
        if (path.length === 0) return undefined;
        return path.length - 1;
    }

    private willZombieCrossEdgeNextNight(a: HexCoordinate, b: HexCoordinate): boolean {
        const speed = this.getZombieSpeedForGeneration(this.game.getGenerationCount());
        const zombies = this.game.getZombies().filter(z => z.isAlive);
        const alivePlayers = this.game.players.filter(p => p.isAlive);
        const board = this.game.getBoard();
        if (alivePlayers.length === 0 || zombies.length === 0) return false;

        const edgeA = a.key();
        const edgeB = b.key();

        for (const z of zombies) {
            let target: HexCoordinate | undefined;

            let bestBaitDist = Number.MAX_SAFE_INTEGER;
            let bestBaitTileID = Number.MAX_SAFE_INTEGER;
            for (const [baitKey] of board.getBaits()) {
                const baitHex = HexCoordinate.fromKey(baitKey);
                const distToBait = this.shortestPathLength(z.position, baitHex);
                if (distToBait != null && distToBait <= 3) {
                    const tid = board.getTileID(baitHex);
                    if (distToBait < bestBaitDist || (distToBait === bestBaitDist && tid < bestBaitTileID)) {
                        bestBaitDist = distToBait;
                        bestBaitTileID = tid;
                        target = baitHex;
                    }
                }
            }

            if (!target) {
                let bestPlayerDist = Number.MAX_SAFE_INTEGER;
                let bestPlayerTileID = Number.MAX_SAFE_INTEGER;
                for (const p of alivePlayers) {
                    const d = this.shortestPathLength(z.position, p.position);
                    if (d == null) continue;
                    const tid = board.getTileID(p.position);
                    if (d < bestPlayerDist || (d === bestPlayerDist && tid < bestPlayerTileID)) {
                        bestPlayerDist = d;
                        bestPlayerTileID = tid;
                        target = p.position;
                    }
                }
            }

            if (!target) continue;
            const path = this.shortestPath(z.position, target);
            if (path.length <= 1) continue;

            const maxIndex = Math.min(speed, path.length - 1);
            for (let i = 1; i <= maxIndex; i++) {
                const prev = path[i - 1].key();
                const cur = path[i].key();
                const crosses = (prev === edgeA && cur === edgeB) || (prev === edgeB && cur === edgeA);
                if (crosses) return true;
            }
        }

        return false;
    }

    private shortestPath(start: HexCoordinate, goal: HexCoordinate): HexCoordinate[] {
        if (start.equals(goal)) return [start];

        const board = this.game.getBoard();
        const visited = new Set<string>();
        visited.add(start.key());

        const queue: Array<{ cur: HexCoordinate; path: HexCoordinate[] }> = [{ cur: start, path: [start] }];
        let head = 0;
        while (head < queue.length) {
            const item = queue[head++];
            for (const n of board.getNeighbors(item.cur)) {
                if (visited.has(n.key())) continue;
                const nextPath = [...item.path, n];
                if (n.equals(goal)) return nextPath;
                visited.add(n.key());
                queue.push({ cur: n, path: nextPath });
            }
        }
        return [];
    }

    private pickRandomPlayableCard(): LegacyCard | undefined {
        const model = this.game.toModel(this.player.id as PlayerId);
        const self = model.players.find(p => p.id === this.player.id);
        if (!self || self.cardsInHand.length === 0) return undefined;

        const playableNames = self.cardsInHand
            .filter(c => c.isPlayable)
            .map(c => c.name as string);

        if (playableNames.length === 0) return undefined;
        const randomName = playableNames[Math.floor(Math.random() * playableNames.length)];
        return this.player.cardsInHand.find(c => c.name === randomName);
    }

    private getZombieSpeedForGeneration(generation: number): number {
        if (generation <= 3) return 1;
        if (generation <= 6) return 2;
        if (generation <= 9) return 3;
        return 4;
    }

    /**
     * Setup phase: select hero from available options.
     */
    public selectHero(heroOptions: HeroData[]): HeroData {
        if (heroOptions.length === 0) throw new Error('No hero options available');

        switch (this.difficultyLevel) {
            case 'easy':
                // Random selection
                return heroOptions[Math.floor(Math.random() * heroOptions.length)];

            case 'normal':
            case 'hard':
                // Prioritize heroes with high starting gold + health
                let best = heroOptions[0];
                let bestScore = this.scoreHero(best);

                for (const hero of heroOptions) {
                    const score = this.scoreHero(hero);
                    if (score > bestScore) {
                        best = hero;
                        bestScore = score;
                    }
                }
                return best;
        }
    }

    /**
     * Setup phase: select locker items from available options.
     */
    public selectLockers(lockerOptions: LockerData[], maxSelections: number): LockerData[] {
        if (lockerOptions.length === 0) return [];

        switch (this.difficultyLevel) {
            case 'easy':
                // Random selection (up to maxSelections)
                const shuffled = [...lockerOptions].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, maxSelections);

            case 'normal':
            case 'hard':
                // Prioritize gold-heavy items + useful passives
                const scored = lockerOptions.map(locker => ({
                    locker,
                    score: this.scoreLocker(locker),
                })).sort((a, b) => b.score - a.score);

                return scored.slice(0, maxSelections).map(s => s.locker);
        }
    }

    /**
     * Setup phase: select starting cards from available options.
     */
    public selectStartingCards(cardOptions: LegacyCard[], maxSelections: number): LegacyCard[] {
        if (cardOptions.length === 0) return [];

        switch (this.difficultyLevel) {
            case 'easy':
                // Random selection
                const shuffled = [...cardOptions].sort(() => Math.random() - 0.5);
                return shuffled.slice(0, maxSelections);

            case 'normal':
            case 'hard':
                // Prioritize cards with low play cost + immediate value
                const scored = cardOptions.map(card => ({
                    card,
                    score: this.scoreCard(card),
                })).sort((a, b) => b.score - a.score);

                return scored.slice(0, maxSelections).map(s => s.card);
        }
    }

    /**
     * Placement phase: select starting board position.
     */
    public selectPlacementPosition(validPositions: HexCoordinate[]): HexCoordinate {
        if (validPositions.length === 0) throw new Error('No valid positions');

        switch (this.difficultyLevel) {
            case 'easy':
                // Random position
                return validPositions[Math.floor(Math.random() * validPositions.length)];

            case 'normal':
                // Avoid other players (pick position furthest from others)
                return this.scorePlacementPositions(validPositions)[0]?.pos || validPositions[0];

            case 'hard':
                // Strategic positioning based on hero abilities
                return this.scoreHardPlacementPositions(validPositions)[0]?.pos || validPositions[0];
        }
    }

    /**
     * Draft phase: select card from draft options.
     */
    public selectDraftCard(cardOptions: LegacyCard[]): LegacyCard {
        if (cardOptions.length === 0) throw new Error('No draft options');

        switch (this.difficultyLevel) {
            case 'easy':
                // Random
                return cardOptions[Math.floor(Math.random() * cardOptions.length)];

            case 'normal':
            case 'hard':
                // Highest immediate value
                const scored = cardOptions.map(card => ({
                    card,
                    score: this.scoreCard(card),
                })).sort((a, b) => b.score - a.score);

                return scored[0]?.card || cardOptions[0];
        }
    }

    /**
     * Draft phase: select 0..N cards with positive value, where value is compared
     * against spending that same gold on core board actions (trap/barricade/move economy).
     */
    public selectDraftCards(
        cardOptions: LegacyCard[],
        maxSelections: number,
        costPerCard: number,
        firstCardFree: boolean,
    ): LegacyCard[] {
        if (cardOptions.length === 0 || maxSelections <= 0) return [];

        const self = this.game.toModel(this.player.id as PlayerId).players.find(p => p.id === this.player.id) as {
            trapCost?: number;
            barricadeCost?: number;
            moveCost?: number;
            trapSuccessRate?: number;
            barricadeFailRate?: number;
        } | undefined;

        const trapCost = Math.max(1, self?.trapCost ?? 16);
        const barricadeCost = Math.max(1, self?.barricadeCost ?? 11);
        const moveCost = Math.max(1, self?.moveCost ?? 3);
        const trapRate = Math.max(0, Math.min(6, self?.trapSuccessRate ?? 4));
        const barricadeRate = Math.max(0, Math.min(6, self?.barricadeFailRate ?? 3));

        const trapValuePerGold = ((1 + 2 * (trapRate / 6)) / trapCost) * 100;
        const barricadeValuePerGold = ((2 - (barricadeRate / 6)) / barricadeCost) * 100;
        const moveValuePerGold = 18 / moveCost;
        const opportunityPerGold = Math.max(trapValuePerGold, barricadeValuePerGold, moveValuePerGold);

        const scored = cardOptions
            .map(card => {
                const tacticalValue = this.scoreCardTacticalValue(
                    card.effect,
                    card.bonus,
                    card.playCost,
                    this.isInBiteRangeThisNight(),
                    this.player.hitPoints,
                    0,
                );
                return { card, tacticalValue };
            })
            .sort((a, b) => b.tacticalValue - a.tacticalValue);

        const picked: LegacyCard[] = [];
        let paidCards = 0;
        for (const s of scored) {
            if (picked.length >= maxSelections) break;

            const thisCardPaid = !(firstCardFree && picked.length === 0);
            const projectedPaid = paidCards + (thisCardPaid ? 1 : 0);
            const projectedCost = projectedPaid * costPerCard;
            if (projectedCost > this.player.gold) continue;

            const marginalGoldCost = thisCardPaid ? costPerCard : 0;
            const opportunityCost = marginalGoldCost * opportunityPerGold;
            const netValue = s.tacticalValue - opportunityCost;
            if (netValue <= 0) continue;

            picked.push(s.card);
            if (thisCardPaid) paidCards++;
        }

        return picked;
    }

    // ---- Scoring helpers ----

    private scoreHero(hero: HeroData): number {
        let score = 0;
        score += hero.startGold * 2; // Gold is valuable
        score += (hero.initHealth - 2) * 10; // Health matters (offset by min of 2)
        score += hero.startSP; // SP is scoring metric
        return score;
    }

    private scoreLocker(locker: LockerData): number {
        let score = locker.bonusGold * 1.5; // Gold bonus

        // Bonus for passive abilities (they generate value automatically)
        if (locker.abilities?.some(a => a.type === 'Passive')) {
            score += 15;
        }

        return score;
    }

    private scoreCard(card: LegacyCard): number {
        return this.scoreCardTacticalValue(
            card.effect,
            card.bonus,
            card.playCost,
            this.isInBiteRangeThisNight(),
            this.player.hitPoints,
            0,
        );
    }

    private scoreCardTacticalValue(
        effectTextRaw: string | undefined,
        bonusTextRaw: string | undefined,
        adjustedCost: number,
        inThreat: boolean,
        hitPoints: number,
        structureReferenceScore: number,
    ): number {
        const effectText = (effectTextRaw ?? '').toLowerCase();
        const bonusText = (bonusTextRaw ?? '').toLowerCase();
        const text = `${effectText} ${bonusText}`;

        let score = 8;
        score += Math.max(0, 8 - Math.max(0, adjustedCost)) * 2;

        if (text.includes('draw')) score += 14;
        if (text.includes('remove a zombie') || text.includes('kill zombie') || text.includes('kill a zombie')) score += 18;
        if (text.includes('sp')) score += 13;
        if (text.includes('gold')) score += 10;
        if (text.includes('np') || text.includes('cp')) score += 6;
        if (text.includes('free trap') || text.includes('place a free trap') || text.includes('trap')) score += 9;
        if (text.includes('free barricade') || text.includes('barricade')) score += 9;
        if (text.includes('move') || text.includes('jump') || text.includes('escape')) score += 8;

        const hasDefensiveText =
            text.includes('health') || text.includes('heal') || text.includes('remove a zombie') ||
            text.includes('kill zombie') || text.includes('barricade') || text.includes('move') || text.includes('jump');

        if (text.includes('health') || text.includes('heal')) {
            score += hitPoints <= 2 ? 20 : 8;
        }

        if (inThreat) {
            score += hasDefensiveText ? 10 : -8;
        }

        // If structures are currently very strong options, cards need to clear a higher bar.
        score -= structureReferenceScore * 0.18;

        return score;
    }

    private scorePlacementPositions(positions: HexCoordinate[]): Array<{ pos: HexCoordinate; score: number }> {
        // TODO: Implement proper board-aware scoring
        // For now, return in order (just use first)
        return positions.map(pos => ({
            pos,
            score: Math.random(),
        })).sort((a, b) => b.score - a.score);
    }

    private scoreHardPlacementPositions(positions: HexCoordinate[]): Array<{ pos: HexCoordinate; score: number }> {
        // TODO: Implement strategic positioning
        // Consider board corners, defensive positions, trap zones, etc.
        return positions.map(pos => ({
            pos,
            score: Math.random(),
        })).sort((a, b) => b.score - a.score);
    }

    /**
     * Helper: Check if this player is alive and can act.
     */
    private canAct(): boolean {
        return this.player.isAlive && this.player.gold >= 0;
    }

    /**
     * Helper: Get current player state for analysis.
     */
    public getPlayerState() {
        return {
            gold: this.player.gold,
            hp: this.player.hitPoints,
            sp: this.player.survivalPoints,
            position: this.player.position,
            trapLimit: this.player.trapLimit,
            barricadeLimit: this.player.barricadeLimit,
        };
    }
}
