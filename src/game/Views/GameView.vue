<template>
  <div class="game-view">
    <!-- permanent status bar - always visible -->
    <div style="position:fixed;bottom:8px;right:8px;z-index:99999;background:rgba(15,23,42,0.92);border:1px solid #60a5fa;border-radius:6px;padding:6px 10px;font-size:10px;color:#93c5fd;">
      game:{{ game ? '✓' : '✗' }} player:{{ myPlayer ? '✓' : '✗' }} phase:{{ phase }} board:{{ board ? '✓' : '✗' }}
      <span v-if="renderError" style="color:#f87171;"> ERR:{{ renderError }}</span>
    </div>

    <div v-if="!game || !props?.gameManager" class="render-error">
      Game state is missing.
    </div>

    <template v-else>
      <div v-if="!myPlayer" class="render-error">
        Player {{ props.playerId }} was not found in this game instance.
      </div>

      <div v-else class="game-layout">
        <div class="board-column" v-if="board && !isSetupPhase">
          <div class="board-panel">
            <GameBoard
              :board="board!"
              :is-clickable="isClickable"
              :highlight-targets="highlightTargets"
              :player-colors="playerColors"
              :night-steps="nightSteps"
              :show-zombie-path="phase === 'player_turn' || phase === 'zombie_phase' || phase === 'zombie_turn'"
              @cell-clicked="onHexClicked"
            />
          </div>

          <div class="bottom-dock">
            <PlayerStatsPanel
              v-if="myPlayer"
              :player="myPlayer"
              :phase="phase"
              :is-my-turn="isMyTurn"
              :standard-actions="standardActions"
              :action-mode="actionMode"
              :actions-remaining="actionsRemaining"
              :selected-card-id="selectedActionCardId"
              :is-card-targeting="isCardTargeting"
              :turn-prompt="turnPrompt"
              @mode-changed="onModeChanged"
              @use-action="onPassTurn"
              @defer-turn="onDeferTurn"
              @play-card="handleSelectedCardPlay"
            />

            <ActionPanel
              v-if="!myPlayer?.isEliminated && (phase === 'player_turn' || phase === 'placement' || phase === 'zombie_turn' || phase === 'zombie_phase' || phase === 'draft')"
              :phase="phase"
              :is-my-turn="isMyTurn"
              :actions-remaining="actionsRemaining"
              :special-actions="specialActions"
              :action-mode="actionMode"
              :playable-cards="playableCards"
              :unplayable-cards="unplayableCards"
              :card-play-discount="myPlayer?.cardPlayDiscount ?? 0"
              :selected-card-id="selectedActionCardId"
              @action-clicked="onActionClicked"
              @use-action="onPassTurn"
              @play-card="handleSelectedCardPlay"
              @card-selection-changed="selectedActionCardId = $event"
            />
          </div>
        </div>

        <aside
          class="right-panel"
          :class="{ 'right-panel--collapsed': logCollapsed, 'right-panel--setup': isSetupPhase }"
        >
          <div class="right-panel__toggle" @click="logCollapsed = !logCollapsed">
            {{ logCollapsed ? '›' : '‹' }}
          </div>

          <div v-if="!logCollapsed" class="right-panel__content">
            <div v-if="error" class="error-banner">{{ error }}</div>

            <NewGameSetup
              v-if="showSetupPanel"
              :player="myPlayer"
              :all-players="players"
              :phase="phase"
              :hero-options="myPlayer?.availableHeroes || []"
              :locker-options="myPlayer?.availableLockers || []"
              :starting-card-options="myPlayer?.availableStartingCards || []"
              @select-hero="onSelectHero"
              @toggle-locker="onToggleLocker"
              @confirm-hero="onConfirmHero"
              @confirm-locker="onConfirmLocker"
              @toggle-starting-card="onToggleStartingCard"
              @confirm-setup="onConfirmSetup"
              @skip-starting-cards="onSkipStartingCards"
            />

            <div
              v-else-if="myPlayer?.isBot && (phase === 'hero_selection' || phase === 'locker_selection' || phase === 'card_purchase' || phase === 'draft')"
              class="placeholder-panel zombie-phase-panel"
            >
              <div class="placeholder-title">CPU Thinking</div>
              <div class="placeholder-copy">This CPU is auto-resolving setup and waiting for its turn to place its hero.</div>
            </div>

            <div v-else-if="!myPlayer?.isEliminated && (phase === 'zombie_turn' || phase === 'zombie_phase')" class="placeholder-panel zombie-phase-panel">
              <div class="placeholder-title">{{ phase === 'zombie_turn' ? 'Zombie Movement' : 'Zombie Movement Complete' }}</div>
              <div class="placeholder-copy">
                {{ phase === 'zombie_turn' ? 'The horde is moving through the school.' : (myPlayer?.isBot ? 'The night is resolved and this CPU is drafting in the background.' : 'The night is resolved. Resolve any flex-point choices or begin the nightly draft.') }}
              </div>

              <div v-if="!myPlayer?.isBot && hasOutstandingFlexSelection" class="flex-point-selection-inline">
                <div class="flex-point-selection-title">Choose flex point payment</div>
                <div class="flex-point-selection-copy">
                  You earned {{ flexPointSelection?.count ?? 0 }} flex point(s). Choose whether to spend them as NP or CP.
                </div>
                <div class="flex-point-selection-actions">
                  <button class="flex-point-btn flex-point-btn--np" @click="selectFlexPointChoice('NP')">NP</button>
                  <button class="flex-point-btn flex-point-btn--cp" @click="selectFlexPointChoice('CP')">CP</button>
                </div>
              </div>

              <button
                v-else-if="phase === 'zombie_phase' && !myPlayer?.isBot"
                class="nightly-draft-button"
                @click="beginNightlyDraft"
              >
                Begin Nightly Draft
              </button>
            </div>

            <div v-else-if="!myPlayer?.isEliminated && phase === 'draft' && !myPlayer?.isBot" class="draft-panel">
              <div class="placeholder-title">Draft</div>
              <div class="placeholder-copy">Use the draft overlay below to select your next card.</div>
            </div>

            <div v-else class="placeholder-panel">
              <div class="placeholder-title">{{ phase }}</div>
              <div class="placeholder-copy">Waiting for the game state to advance.</div>
            </div>

            <div class="game-log-shell">
              <GameLog :logs="logs" :collapsed="false" />
            </div>
          </div>
        </aside>
      </div>

      <Teleport to="body">
        <div v-if="tempSelectionState" class="temp-selection-overlay">
          <div class="temp-selection-panel">
            <div class="temp-selection-header">
              {{ tempSelectionState.type === 'locker' ? 'Choose a locker card' : tempSelectionState.type === 'keep' ? `Choose ${tempSelectionState.keepCount ?? tempSelectionState.count ?? 1} card${(tempSelectionState.keepCount ?? tempSelectionState.count ?? 1) === 1 ? '' : 's'} to keep` : tempSelectionState.type === 'discard' ? `Choose ${tempSelectionState.count ?? 1} card${(tempSelectionState.count ?? 1) === 1 ? '' : 's'} to discard` : 'Choose a card' }}
            </div>
            <div class="temp-selection-grid">
              <div
                v-for="card in tempSelectionState.cards"
                :key="card.id"
                class="temp-selection-card"
                :class="{ 'temp-selection-card--selected': isTempSelectionSelected(card.id) }"
                @click="toggleTempSelection(card)"
              >
                <CardView
                  :card="card"
                  :selected="isTempSelectionSelected(card.id)"
                  :compact="false"
                  :card-play-discount="myPlayer?.cardPlayDiscount ?? 0"
                />
              </div>
            </div>
            <button
              class="temp-selection-confirm"
              :disabled="!canConfirmTempSelection()"
              @click="confirmTempSelection"
            >
              Confirm
            </button>
          </div>
        </div>
      </Teleport>

      <div
        v-if="showDraftOverlay"
        class="draft-overlay"
        :class="isInitialDraft ? 'draft-overlay--startup' : 'draft-overlay--nightly'"
        :style="isInitialDraft ? 'inset: 0; padding: 24px; background: rgba(2, 6, 23, 0.68); backdrop-filter: blur(2px);' : 'left: 50%; bottom: 76px; transform: translateX(-50%); width: min(980px, calc(100vw - 24px));'"
      >
        <NewDraftPhase
          :player="myPlayer"
          :generation="generation"
          :draft-cards="myPlayer?.draftCards || []"
          :cost-per-card="Math.max(0, 4 - (myPlayer?.cardPurchaseDiscount || 0))"
          :first-card-free="firstCardFree"
          :compact="!isInitialDraft"
          class="draft-phase-bar"
          :style="isInitialDraft ? 'width: min(1280px, calc(100vw - 48px)); max-height: min(84vh, 860px); overflow: auto;' : 'width: min(980px, calc(100vw - 24px)); max-width: 980px;'"
          @toggle-draft-card="onToggleDraftCard"
          @confirm-draft="onConfirmDraft"
          @skip-draft="onSkipDraft"
        />
      </div>

      <div v-if="phase === 'game_over'" class="game-over-overlay">
        <div class="game-over-panel">
          <div class="game-over-header">Game Over</div>
          <div class="game-over-subtitle">Final Scores</div>
          <ol class="final-score-list">
            <li v-for="(entry, index) in finalScores" :key="entry.playerId" class="final-score-row">
              <span class="final-rank">#{{ index + 1 }}</span>
              <span class="final-name">{{ entry.name }}</span>
              <span class="final-hero">{{ entry.heroId || 'No Hero' }}</span>
              <span class="final-score">{{ entry.score }} pts</span>
              <span class="final-breakdown">SP {{ entry.sp }} · Max(CP,NP) {{ Math.max(entry.cp, entry.np) }}</span>
            </li>
          </ol>
          <button class="game-over-return" @click="returnToLobby">Return to Front Desk</button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onErrorCaptured, onBeforeUnmount } from 'vue';
import GameBoard from './GameBoard.vue';
import ActionPanel from './ActionPanel.vue';
import GameLog from './GameLog.vue';
import NewGameSetup from './GameSetup.vue';
import NewDraftPhase from './DraftPhase.vue';
import PlayerStatsPanel from './PlayerStatsPanel.vue';
import CardView from './CardView.vue';
import { Game, GameManager, Player, Board, HeroId, BoardCell, CardProcessor, CardDrawer, MovementUtil, AllSpecialActions } from '../index';
import { resolvePlayerTargetSelection, resolveTargetSelection } from '../board/cellTargetResolver';
import { hydrateGame } from '../hydrateGame';

// ===== TYPES =====
type GamePhase = 'setup' | 'hero_selection' | 'locker_selection' | 'card_purchase' | 'placement' | 'draft' | 'player_turn' | 'zombie_turn' | 'zombie_phase' | 'game_over';

// ===== PROPS =====
const props = defineProps<{
  playerId: string;
  gameManager: GameManager;
}>();

// ===== EMITS =====
const emit = defineEmits<{
  (e: 'returnToLobby'): void;
}>();

// ===== STATE =====
const game = ref<Game | null>(null);
const error = ref<string | null>(null);
const actionMode = ref('');
const validTargets = ref<any[]>([]);
const selectedActionCardId = ref<string | null>(null);
const openLockerRequestPending = ref(false);
const isCardTargeting = computed(() => !!game.value?.targetingCardId
  && game.value.targetingPlayerId === props.playerId);
const pendingCrowdedHallsStep = ref<{ x: number; y: number } | null>(null);
watch(() => game.value?.targetingCardId, cardId => {
  if (cardId !== 'crowded_halls') pendingCrowdedHallsStep.value = null;
});
const pendingHiredMuscleOrigin = ref<{ x: number; y: number } | null>(null);
watch(() => game.value?.targetingCardId, cardId => {
  if (cardId !== 'hired_muscle') pendingHiredMuscleOrigin.value = null;
});
const pendingTrackMoveOpponentId = ref<string | null>(null);
const pendingVonTrapMoveOrigin = ref<BoardCell | null>(null);
const pendingAlBTrossTrapOrigin = ref<BoardCell | null>(null);
const escapeState = ref<{
  playerId: string;
  validTargets: BoardCell[];
  canEscapeTwoSteps: boolean;
  message: string;
} | null>(null);
const logs = ref<string[]>([]);
const selectedDraftCards = ref<any[]>([]);
const logCollapsed = ref(false);
const flexPointSelection = ref<{ playerId: string; count: number; options: string[] } | null>(null);
const tempSelectionState = ref<{
  type: 'keep' | 'discard' | 'locker';
  playerId: string;
  count: number;
  keepCount?: number;
  drawCount?: number;
  cards: any[];
  selected: string[];
  selectionId?: number;
} | null>(null);
const renderError = ref<string | null>(null);
const phase = ref<GamePhase>('setup');
const showRuntimeDebug = computed(() => new URLSearchParams(window.location.search).get('debug') === '1');
let gameSocket: WebSocket | null = null;
let setupSyncTimer: number | null = null;
let setupSyncInFlight = false;

function syncPhase(): void {
  phase.value = (game.value?.phase as GamePhase) || 'setup';
}

function getVonTrapMoveDestinations(origin: BoardCell | null | undefined): BoardCell[] {
  if (!origin || !game.value?.board) return [];

  const boardObj = game.value.board;
  const destinations: BoardCell[] = [];
  const queue: { cell: BoardCell; dist: number }[] = [{ cell: origin, dist: 0 }];
  const visited = new Set<string>([`${origin.x},${origin.y}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist > 0 && current.dist <= 2) {
      if (current.cell.isEmpty && !current.cell.isHole && !current.cell.hasTrap && !current.cell.hasBarricade) {
        destinations.push(current.cell);
      }
    }
    if (current.dist >= 2) continue;
    for (const neighbor of boardObj.getNeighbors(current.cell)) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (visited.has(key) || neighbor.isHole) continue;
      visited.add(key);
      queue.push({ cell: neighbor, dist: current.dist + 1 });
    }
  }

  return destinations;
}

// ===== COMPUTED =====
const hasOutstandingFlexSelection = computed(() => {
  if (!game.value) return false;
  const pending = game.value.getPendingFlexPointSelections?.() ?? [];
  return pending.some((entry: any) => entry.playerId === props.playerId) || (
    !!flexPointSelection.value && flexPointSelection.value.playerId === props.playerId
  );
});

function syncFlexPointSelection(sourceGame: Game): void {
  const pending = sourceGame.getPendingFlexPointSelections?.() ?? [];
  flexPointSelection.value = pending.find((entry: any) => entry.playerId === props.playerId) ?? null;
}

const myPlayer = computed(() => {
  return game.value?.getPlayerById(props.playerId) || null;
});

const board = computed(() => {
  return game.value?.board || null;
});

const players = computed(() => {
  return game.value?.players || [];
});

const isSetupPhase = computed(() => {
  if (myPlayer.value?.isBot) return false;
  return ['hero_selection', 'locker_selection', 'card_purchase'].includes(phase.value);
});

const showSetupPanel = computed(() => {
  return !myPlayer.value?.isBot && !myPlayer.value?.isEliminated && ['hero_selection', 'locker_selection', 'card_purchase'].includes(phase.value);
});

const showDraftOverlay = computed(() => {
  return !myPlayer.value?.isBot && !myPlayer.value?.isEliminated && phase.value === 'draft';
});

const generation = computed(() => {
  return (game.value as any)?.generationCount || 0;
});

const isInitialDraft = computed(() => {
  return phase.value === 'draft' && generation.value <= 0;
});

const nightSteps = computed(() => {
  return game.value?.nightSteps ?? 1;
});

const actionsRemaining = computed(() => {
  return (game.value as any)?.actionsRemaining || 0;
});

const isMyTurn = computed(() => {
  if (!game.value || !props.playerId || myPlayer.value?.isEliminated) return false;
  return game.value.getCurrentPlayer()?.id === props.playerId;
});

const turnPrompt = computed(() => {
  if (!isMyTurn.value) return '';
  if (phase.value === 'player_turn') return 'YOUR TURN';
  if (phase.value !== 'placement' || !myPlayer.value) return '';

  const position = game.value?.board.getPlayerPosition(myPlayer.value);
  if (!position) return 'PLACE HERO';

  const pendingAction = myPlayer.value.pendingStartActions?.[0];
  return pendingAction ? `PLACE ${String(pendingAction.type).toUpperCase()}` : '';
});

const isClickable = computed(() => {
  if (myPlayer.value?.isEliminated) return false;
  if (phase.value === 'placement') return isMyTurn.value;
  if (escapeState.value) return escapeState.value.playerId === props.playerId;
  if (phase.value === 'player_turn') return isMyTurn.value;
  return false;
});

const firstCardFree = computed(() => {
  return players.value.some(p => p.heroId === 'dorothy_deckard');
});

const highlightTargets = computed(() => {
  if (isCardTargeting.value && game.value?.targetingCardId === 'hired_muscle') {
    const boardObj = game.value.board;
    if (pendingHiredMuscleOrigin.value) {
      const origin = boardObj.getCell(pendingHiredMuscleOrigin.value.x, pendingHiredMuscleOrigin.value.y);
      return origin
        ? boardObj.getNeighbors(origin).filter((cell: BoardCell) => cell.isEmpty && !cell.isHole)
          .map((cell: BoardCell) => ({ x: cell.x, y: cell.y }))
        : [];
    }
    return (game.value.targetingValidTargets || [])
      .filter((cell: any) => cell && Number.isFinite(Number(cell.x)) && Number.isFinite(Number(cell.y)))
      .map((cell: any) => ({ x: Number(cell.x), y: Number(cell.y) }));
  }

  if (isCardTargeting.value && game.value?.targetingCardId === 'crowded_halls') {
    const paths = (game.value.targetingValidTargets || []).filter((entry: any) => Array.isArray(entry) && entry.length === 3);
    return paths
      .filter((path: any[]) => !pendingCrowdedHallsStep.value
        || (path[1]?.x === pendingCrowdedHallsStep.value.x && path[1]?.y === pendingCrowdedHallsStep.value.y))
      .map((path: any[]) => pendingCrowdedHallsStep.value ? path[2] : path[1])
      .filter((cell: any, index: number, cells: any[]) => cell && cells.findIndex((other: any) => other.x === cell.x && other.y === cell.y) === index)
      .map((cell: any) => ({ x: cell.x, y: cell.y }));
  }

  return validTargets.value.flatMap((entry: any) => {
    if (Array.isArray(entry)) {
      const finalCell = entry[entry.length - 1];
      if (!finalCell) return [];
      return [{ x: finalCell.x, y: finalCell.y }];
    }

    if (entry && typeof entry === 'object' && 'x' in entry && 'y' in entry) {
      return [{ x: entry.x, y: entry.y }];
    }

    if (entry && typeof entry === 'object' && 'id' in entry) {
      const currentPlayer = game.value?.getPlayerById(String(entry.id));
      const position = currentPlayer && board.value?.getPlayerPosition(currentPlayer);
      if (position) return [{ x: position.x, y: position.y }];
    }

    return [];
  });
});

const playerColors = computed(() => {
  const map = new Map<string, string>();
  for (const player of players.value) {
    map.set(player.id, player.color || '#a78bfa');
  }
  return map;
});

const finalScores = computed(() => {
  if (!game.value) return [];
  return game.value.getFinalScores ? game.value.getFinalScores() : [...game.value.players]
    .map((player: any) => ({
      playerId: player.id,
      name: player.name,
      heroId: player.heroId ?? null,
      sp: player.currSP ?? 0,
      np: player.currNP ?? 0,
      cp: player.currCP ?? 0,
      score: player.currSP + Math.max(player.currNP ?? 0, player.currCP ?? 0),
    }))
    .sort((a: any, b: any) => b.score - a.score || b.sp - a.sp || b.cp - b.np || a.name.localeCompare(b.name));
});

const standardActions = computed(() => {
  if (!myPlayer.value || !game.value?.board) return [];

  const p = myPlayer.value;
  const board = game.value.board;
  const playerPos = board.getPlayerPosition(p);

  const jumpTargets = playerPos ? MovementUtil.getValidJumpTargets(board, p) : [];
  const adjacentMoveTargets = playerPos
    ? board.getNeighbors(playerPos).filter(cell => cell.isEmpty && !cell.isHole && !cell.hasBarricade)
    : [];
  const moveTargets = [...new Map(
    [...adjacentMoveTargets, ...jumpTargets].map(cell => [cell.id, cell])
  ).values()];
  const hasMoveTarget = moveTargets.length > 0;
  const labelFor = (name: string, cost: number, effectiveness?: number) => {
    const costText = `${cost} 🪙`;
    if (effectiveness === undefined) return `${name} (${costText})`;
    return `${name} (${costText}, ${effectiveness}/8)`;
  };

  const movementCosts = moveTargets.map(target => {
    const isJump = jumpTargets.some(jumpTarget => jumpTarget.id === target.id);
    return p.getMovementCost(board, target) + (isJump ? p.getObstacleJumpToll() : 0);
  });
  const canAffordMove = movementCosts.some(cost => p.gold >= cost);
  const moveLabel = movementCosts.length === 0
    ? labelFor('Move', p.getMovementCost(board))
    : Math.min(...movementCosts) === Math.max(...movementCosts)
      ? labelFor('Move', movementCosts[0])
      : `Move (${Math.min(...movementCosts)}-${Math.max(...movementCosts)} 🪙)`;
  const hasAdjacentZombie = !!playerPos && board.getNeighbors(playerPos).some(cell => cell.hasZombie);

  const canPlaceWithin = (range: number) => {
    if (!playerPos) return false;
    return board.getAllCells().some((cell: BoardCell) => {
      if (!cell.isEmpty || cell.isHole || cell.hasZombie || cell.hasPlayer) return false;
      const dist = Math.abs(cell.x - playerPos.x) + Math.abs(cell.y - playerPos.y);
      return dist <= range;
    });
  };

  const trapCount = board.getAllTraps().filter(cell => cell.structureOwner?.id === p.id).length;
  const barricadeCount = board.getAllBarricades().filter(cell => cell.structureOwner?.id === p.id).length;

  return [
    {
      id: 'move',
      name: 'Move',
      label: moveLabel,
      canUse: hasMoveTarget && canAffordMove,
      visible: hasMoveTarget,
    },
    {
      id: 'melee',
      name: 'Melee',
      label: labelFor('Melee', p.getMeleeCost(), p.getMeleeEffectiveness()),
      canUse: hasAdjacentZombie && p.gold >= p.getMeleeCost(),
      visible: hasAdjacentZombie,
    },
    {
      id: 'trap',
      name: 'Trap',
      label: labelFor('Trap', p.getTrapCost(), p.getTrapEffectiveness()),
      canUse: p.gold >= p.getTrapCost() && trapCount < p.getTrapLimit() && canPlaceWithin(3),
      visible: p.gold >= p.getTrapCost() && trapCount < p.getTrapLimit() && canPlaceWithin(3),
    },
    {
      id: 'bait',
      name: 'Bait',
      label: labelFor('Bait', p.getBaitCost()),
      canUse: p.gold >= p.getBaitCost() && canPlaceWithin(3),
      visible: p.gold >= p.getBaitCost() && canPlaceWithin(3),
    },
    {
      id: 'barricade',
      name: 'Barricade',
      label: labelFor('Barricade', p.getBarricadeCost(), p.getBarricadeEffectiveness()),
      canUse: p.gold >= p.getBarricadeCost() && barricadeCount < p.getBarricadeLimit() && canPlaceWithin(3),
      visible: p.gold >= p.getBarricadeCost() && barricadeCount < p.getBarricadeLimit() && canPlaceWithin(3),
    },
  ].filter(action => action.visible !== false);
});

const specialActions = computed(() => {
  if (!myPlayer.value || !game.value) return [];
  const board = game.value.board;
  if (!board) return [];
  if (myPlayer.value.actionCards?.length) {
    return myPlayer.value.actionCards.map((card: any) => ({
      ...card,
      isPlayable: canPlayCard(card),
    }));
  }
  return myPlayer.value.actionManager.getAvailableActions(myPlayer.value, board as Board).map((action: any) => ({
    ...action,
    options: action.options.map((option: any, optionIndex: number) => ({
      ...option,
      isPlayable: canPlayCard({
        __kind: 'special-action',
        _specialActionId: action.id,
        _specialOptionIndex: optionIndex,
      }),
    })),
  }));
});

const playableCards = computed(() => {
  if (!myPlayer.value) return [];
  const cards = [...(myPlayer.value.hand?.cards || [])];
  return cards.filter((card: any) => canPlayCard(card));
});

const unplayableCards = computed(() => {
  if (!myPlayer.value) return [];
  const cards = [...(myPlayer.value.hand?.cards || [])];
  return cards.filter((card: any) => !canPlayCard(card));
});

// ===== LIFECYCLE =====
// catch any child component errors so we can surface them
onErrorCaptured((err) => {
  renderError.value = err instanceof Error ? err.message : String(err);
  console.error('[GameView] child component error:', err);
  return false;
});

onMounted(() => {
  console.log('[GameView] mounted with playerId:', props.playerId);
  console.log('[GameView] gameManager present:', !!props.gameManager);
  console.log('[GameView] gameManager.game present:', !!(props.gameManager as any)?.game);
  console.log('[GameView] incoming props snapshot:', {
    playerId: props.playerId,
    hasGameManager: !!props.gameManager,
    hasGame: !!(props.gameManager as any)?.game,
    isGameManagerConstructor: !!(props.gameManager as any)?.selectHero,
  });
  game.value = (props.gameManager as any).game;
  syncPhase();
  console.log('[GameView] resolved game object:', !!game.value, game.value ? game.value.phase : 'no game');
  console.log('[GameView] myPlayer lookup:', myPlayer.value ? myPlayer.value.id : 'not found');
  console.log('[GameView] board lookup:', !!game.value?.board);
  setupEventListeners();
  connectGameSocket();
  startSetupStatePolling();
});

onBeforeUnmount(() => {
  gameSocket?.close();
  gameSocket = null;
  if (setupSyncTimer !== null) {
    window.clearInterval(setupSyncTimer);
    setupSyncTimer = null;
  }
});

watch(() => game.value?.phase, (newPhase) => {
  syncPhase();

  if (newPhase === 'player_turn') {
    selectedDraftCards.value = [];
  }

  if (!['hero_selection', 'locker_selection', 'card_purchase', 'draft'].includes(String(newPhase ?? ''))) {
    tempSelectionState.value = null;
    selectedDraftCards.value = [];
  }

  if (newPhase === 'zombie_phase' && myPlayer.value?.isBot) {
    beginNightlyDraft();
  }
});

// ===== EVENT LISTENERS =====
function connectGameSocket(): void {
  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  gameSocket = new WebSocket(`${protocol}//${window.location.host}/game-ws?gameId=${encodeURIComponent(gameId)}&playerId=${encodeURIComponent(props.playerId)}`);
  gameSocket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.type !== 'gameState' || !message.game || !game.value) return;
      applyServerGameState(message.game);
    } catch (socketError) {
      console.error('[GameView] Failed to apply server game update:', socketError);
    }
  });
}

function startSetupStatePolling(): void {
  if (setupSyncTimer !== null) return;

  setupSyncTimer = window.setInterval(async () => {
    if (!['hero_selection', 'locker_selection', 'card_purchase', 'placement', 'player_turn', 'zombie_turn', 'zombie_phase', 'draft'].includes(phase.value)) {
      if (setupSyncTimer !== null) window.clearInterval(setupSyncTimer);
      setupSyncTimer = null;
      return;
    }
    if (setupSyncInFlight) return;

    const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
    if (!gameId) return;

    setupSyncInFlight = true;
    try {
      const response = await fetch(`/api/game/current?gameId=${encodeURIComponent(gameId)}`);
      if (!response.ok) return;
      const result = await response.json();
      if (result.game) applyServerGameState(result.game);
    } catch (syncError) {
      console.warn('[GameView] Setup state sync failed:', syncError);
    } finally {
      setupSyncInFlight = false;
    }
  }, 750);
}

function applyServerGameState(rawGame: any): void {
  const currentGame = game.value;
  if (!currentGame) return;

  const previousPhase = currentGame.phase;
  const existingPlayers = new Map(currentGame.players.map(player => [player.id, player]));
  const nextGame = hydrateGame(rawGame);

  for (const nextPlayer of nextGame.players) {
    const existingPlayer = existingPlayers.get(nextPlayer.id);
    if (existingPlayer && !nextPlayer.setupLockedIn) {
      nextPlayer.tempHeroId = existingPlayer.tempHeroId;
      nextPlayer.tempSelectedLockers = [...existingPlayer.tempSelectedLockers];
      nextPlayer.tempSelectedStartingCards = [...existingPlayer.tempSelectedStartingCards];
    }
  }

  const listeners = (currentGame as any).listeners;
  Object.assign(currentGame, nextGame);
  (currentGame as any).listeners = listeners;
  const incomingEscapeState = (currentGame as any)._escapeState ?? null;
  if (incomingEscapeState || escapeState.value) {
    escapeState.value = incomingEscapeState;
    validTargets.value = incomingEscapeState?.playerId === props.playerId
      ? incomingEscapeState.validTargets ?? []
      : [];
  }
  if (currentGame.targetingCardId) {
    validTargets.value = currentGame.targetingValidTargets ?? [];
    actionMode.value = `${currentGame.targetingType || 'target'}-select`;
  } else if (actionMode.value.endsWith('-select')) {
    validTargets.value = [];
    actionMode.value = '';
  }
  logs.value = [...(currentGame.logHistory ?? [])];
  syncPendingCardSelection(currentGame);
  syncFlexPointSelection(currentGame);
  syncPhase();

  if (previousPhase !== currentGame.phase) {
    currentGame.emit('phaseChanged', currentGame.phase);
  }
  const pendingStartAction = myPlayer.value?.pendingStartActions?.[0];
  if (currentGame.phase === 'placement' && pendingStartAction && currentGame.board.getPlayerPosition(myPlayer.value!)) {
    validTargets.value = getStartActionTargets(myPlayer.value, pendingStartAction.type);
    actionMode.value = `start-action:${pendingStartAction.type}`;
  } else if (!pendingStartAction && actionMode.value.startsWith('start-action:')) {
    actionMode.value = '';
    validTargets.value = [];
  }
  currentGame.emit('stateChanged');
}

function setupEventListeners(): void {
  if (!game.value) return;

  logs.value = [...game.value.logHistory];
  syncPendingCardSelection(game.value);
  game.value.on('log', (msg: string) => {
    logs.value = [...game.value!.logHistory];
  });

  game.value.on('phaseChanged', (nextPhase: string) => {
    phase.value = (nextPhase as GamePhase) || 'setup';
  });

  game.value.on('escapeMode', (data: any) => {
    escapeState.value = data;
    validTargets.value = data?.validTargets ?? [];
  });

  game.value.on('requestFlexPointSelection', (payload: any) => {
    if (!payload || !payload.playerId) return;
    const nextSelection = {
      playerId: payload.playerId,
      count: Number(payload.count ?? 0),
      options: Array.isArray(payload.options) ? payload.options : ['NP', 'CP']
    };

    if (
      flexPointSelection.value?.playerId === payload.playerId &&
      flexPointSelection.value.count === nextSelection.count
    ) {
      return;
    }

    flexPointSelection.value = nextSelection;
  });

  game.value.on('flexPointsResolved', (payload: any) => {
    if (!payload || !payload.playerId) return;
    if (flexPointSelection.value?.playerId === payload.playerId) {
      flexPointSelection.value = null;
    }
  });

  syncFlexPointSelection(game.value);

  game.value.resolvePendingFlexPoints();

  game.value.on('targetingStarted', (cardId: string, targetType: string, targets: any[]) => {
    validTargets.value = targets || [];
    actionMode.value = `${targetType || 'target'}-select`;
  });

  game.value.on('requestKeepSelection', (payload: any) => {
    tempSelectionState.value = {
      type: 'keep',
      playerId: payload.playerId,
      count: payload.keepCount ?? payload.count ?? 1,
      keepCount: payload.keepCount ?? payload.count ?? 1,
      drawCount: payload.drawCount ?? 0,
      cards: payload.cards ?? [],
      selected: []
    };
  });

  game.value.on('requestDiscardSelection', (payload: any) => {
    const cards = payload.cards && payload.cards.length
      ? payload.cards
      : (payload.drawnCards && payload.drawnCards.length ? payload.drawnCards : []);
    tempSelectionState.value = {
      type: 'discard',
      playerId: payload.playerId,
      count: payload.count ?? payload.keepCount ?? 1,
      drawCount: payload.drawCount ?? 0,
      cards,
      selected: []
    };
  });

  game.value.on('startActionAvailable', (payload: any) => {
    if (!payload || payload.playerId !== props.playerId) return;
    const queued = Array.isArray(payload.actions) && payload.actions.length > 0
      ? payload.actions
      : [{ type: payload.type, description: payload.description || 'Place a free bonus' }];
    const current = queued[0];
    if (!current) return;

    validTargets.value = getStartActionTargets(myPlayer.value, current.type);
    actionMode.value = `start-action:${current.type}`;
  });
}

function getStartActionTargets(player: Player | null, type: 'barricade' | 'bait' | 'trap' | 'zombie'): BoardCell[] {
  if (!game.value || !player) return [];

  const pos = game.value.board.getPlayerPosition(player);
  if (!pos) return [];

  if (type === 'zombie') {
    return game.value.board.getAllCells().filter((cell: BoardCell) => {
      if (cell.isHole || !cell.isEmpty || cell.hasPlayer || cell.hasZombie) return false;
      return true;
    });
  }

  const range = type === 'bait' ? 3 : 2;
  return game.value.board.getAllCells().filter((cell: BoardCell) => {
    if (cell.isHole || !cell.isEmpty || cell.hasPlayer || cell.hasZombie) return false;
    const dist = Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y);
    return dist <= range;
  });
}

// ===== SETUP ACTIONS =====
function onSelectHero(heroId: HeroId): void {
  props.gameManager.setTemporaryHeroSelection(props.playerId, heroId);
}

function onConfirmHero(): void {
  props.gameManager.confirmHeroSelection(props.playerId);
}

function onToggleLocker(lockerId: string): void {
  props.gameManager.setTemporaryLockerSelection(props.playerId, lockerId);
}

function onConfirmLocker(): void {
  props.gameManager.confirmLockerSelection(props.playerId);
}

function onToggleStartingCard(card: any): void {
  const player = myPlayer.value;
  if (!player) return;

  const heroId = (player as any).tempHeroId ?? player.heroId;
  const heroKey = heroId ?? '';

  const selected = [...((player as any).tempSelectedStartingCards || (player as any)._selectedStartingCards || [])];
  const idx = selected.findIndex((c: any) => c.id === card.id);

  if (idx > -1) {
    selected.splice(idx, 1);
  } else {
    const selectedLockerId = (player as any).tempSelectedLockers?.[0] ?? null;
    const previewLockerBonus = selectedLockerId
      ? ((player as any).availableLockers || []).find((entry: any) => entry.id === selectedLockerId)?.startingBonus?.gold ?? 0
      : 0;
    const previewHeroGold = heroId
      ? (require('../index') as any).getHeroData(heroId)?.startingGold ?? player.gold
      : player.gold;
    const projectedGold = (previewHeroGold + previewLockerBonus) - ((selected.length + 1) * 4);

    if (heroKey === 'card_shark' || heroKey === 'dorothy_deckard') {
      selected.push(card);
    } else if (projectedGold >= 0) {
      selected.push(card);
    } else {
      return;
    }
  }

  if (heroKey === 'dorothy_deckard') {
    const allCards = [...((player as any).availableStartingCards || [])];
    (player as any).tempSelectedStartingCards = allCards;
    (player as any)._selectedStartingCards = allCards;
    return;
  }

  (player as any).tempSelectedStartingCards = selected;
  (player as any)._selectedStartingCards = selected;
}

async function onConfirmSetup(): Promise<void> {
  const player = myPlayer.value;
  if (!player) return;

  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) {
    error.value = 'Cannot lock setup: game link is missing its game ID.';
    return;
  }

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/setup/lock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: props.playerId,
        heroId: (player as any).tempHeroId ?? player.heroId,
        lockerId: (player as any).tempSelectedLockers?.[0],
        startingCardIds: ((player as any).tempSelectedStartingCards || (player as any)._selectedStartingCards || []).map((card: any) => card.id),
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `Setup lock-in failed (${response.status})`);
    }

    if (result.game) applyServerGameState(result.game);
    error.value = null;
  } catch (lockError) {
    error.value = lockError instanceof Error ? lockError.message : String(lockError);
  }
}

function onSkipStartingCards(): void {
  props.gameManager.skipStartingCards(props.playerId);
}

// ===== PLACEMENT =====
async function onPlaceHero(cell: { x: number; y: number }): Promise<void> {
  await postPlacementCommand('place-hero', cell);
}

async function onResolveStartAction(cell: { x: number; y: number }): Promise<void> {
  await postPlacementCommand('resolve-start-action', cell);
}

async function postPlacementCommand(command: string, cell: { x: number; y: number }): Promise<void> {
  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) {
    error.value = 'Cannot update placement: game link is missing its game ID.';
    return;
  }

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/placement/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: props.playerId, x: cell.x, y: cell.y }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Placement update failed (${response.status})`);
    if (result.game) applyServerGameState(result.game);
    error.value = null;
  } catch (placementError) {
    error.value = placementError instanceof Error ? placementError.message : String(placementError);
  }
}

function serializeActionTarget(target: any): any {
  if (Array.isArray(target)) return target.map(serializeActionTarget);
  if (!target || typeof target !== 'object') return target;
  if ('origin' in target || 'destination' in target) {
    return {
      ...(target.origin ? { origin: serializeActionTarget(target.origin) } : {}),
      ...(target.destination ? { destination: serializeActionTarget(target.destination) } : {}),
    };
  }
  if ('x' in target && 'y' in target) return { x: target.x, y: target.y };
  if (target.id && (target.name || target.heroId)) return { playerId: target.id };
  return target;
}

async function performServerAction(actionId: string, params: any = {}): Promise<boolean> {
  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) {
    error.value = 'Cannot submit action: game link is missing its game ID.';
    return false;
  }

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: props.playerId,
        actionId,
        params: { ...params, target: serializeActionTarget(params?.target) },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (result.game) applyServerGameState(result.game);
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Action could not be completed.');
    }
    error.value = null;
    return true;
  } catch (actionError) {
    error.value = actionError instanceof Error ? actionError.message : String(actionError);
    return false;
  }
}

async function postGameCommand(path: string, payload: Record<string, any> = {}): Promise<boolean> {
  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) return false;

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: props.playerId, ...payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (result.game) applyServerGameState(result.game);
    if (!response.ok || result.success === false) {
      throw new Error(result.error || `Game command failed (${response.status})`);
    }
    error.value = null;
    return true;
  } catch (commandError) {
    error.value = commandError instanceof Error ? commandError.message : String(commandError);
    return false;
  }
}

// ===== DRAFT =====
function onToggleDraftCard(card: any): void {
  const selected = selectedDraftCards.value;
  const idx = selected.findIndex((c: any) => c.id === card.id);
  if (idx > -1) {
    selected.splice(idx, 1);
  } else {
    selected.push(card);
  }
}

function onConfirmDraft(): void {
  const selected = [...selectedDraftCards.value];
  if (selected.length > 0) {
    void postGameCommand('draft/purchase', { cardIds: selected.map((card: any) => card.id) });
  }
  selectedDraftCards.value = [];
}

function onSkipDraft(): void {
  void postGameCommand('draft/skip');
}

// ===== GAME ACTIONS =====
async function onModeChanged(mode: string): Promise<void> {
  if (phase.value !== 'player_turn' || !isMyTurn.value) return;
  if (isCardTargeting.value && !(await cancelTargetedCard())) return;
  actionMode.value = mode;
  if (mode === 'move' || mode === 'trap' || mode === 'bait' || mode === 'barricade' || mode === 'melee') {
    validTargets.value = [];
    if (game.value && myPlayer.value) {
      switch (mode) {
        case 'move': {
          const pos = game.value.board.getPlayerPosition(myPlayer.value);
          if (pos) {
            const currentCell = game.value.board.getCell(pos.x, pos.y);
            if (currentCell) {
              const adjacent = game.value.board.getNeighbors(currentCell)
                .filter(c => c.isEmpty && !c.isHole && !c.hasBarricade);
              const jumpTargets = MovementUtil.getValidJumpTargets(game.value.board, myPlayer.value);
              validTargets.value = [...new Map(
                [...adjacent, ...jumpTargets].map((cell) => [cell.id, cell])
              ).values()];
            }
          }
          break;
        }
        case 'trap':
        case 'barricade': {
          const pos = game.value.board.getPlayerPosition(myPlayer.value);
          if (pos) {
            validTargets.value = game.value.board.getAllCells().filter((c: BoardCell) => {
              if (c.isHole || c.hasZombie || c.hasPlayer) return false;
              const hasReplaceableStructure = c.hasTrap || c.hasBarricade || c.hasBait;
              if (!c.isEmpty && !hasReplaceableStructure) return false;
              const dist = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
              return dist <= 3;
            });
          } else {
            validTargets.value = [];
          }
          break;
        }
        case 'bait': {
          const pos = game.value.board.getPlayerPosition(myPlayer.value);
          if (pos) {
            validTargets.value = game.value.board.getAllCells().filter((c: BoardCell) => {
              if (!c.isEmpty || c.isHole) return false;
              const dist = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
              return dist <= 3;
            });
          } else {
            validTargets.value = [];
          }
          break;
        }
        case 'melee': {
          const pos = game.value.board.getPlayerPosition(myPlayer.value);
          if (pos) {
            const currentCell = game.value.board.getCell(pos.x, pos.y);
            if (currentCell) {
              validTargets.value = game.value.board.getNeighbors(currentCell)
                .filter(c => c.hasZombie);
            }
          }
          break;
        }
      }
    }
  } else {
    validTargets.value = [];
  }
}

function findSpecialActionDefinition(player: any, actionId: string): any {
  return player.actionManager?.getAllActions().find((entry: any) => entry.id === actionId)
    ?? (AllSpecialActions as any)[actionId]
    ?? Object.values(AllSpecialActions).find((entry: any) => entry?.id === actionId);
}

function onActionClicked(actionId: string, params?: any): void {
  const player = myPlayer.value;
  if (!player) return;

  const optionIndex = Number(params?.optionIndex ?? 0);

  if (actionId === 'hero_cia_lader' && optionIndex === 1) {
    const boardObj = game.value?.board;
    if (!boardObj) return;
    const option = findSpecialActionDefinition(player, actionId)?.options?.[optionIndex];
    const wrappedTarget = params?.target;

    if (wrappedTarget?.origin && wrappedTarget?.destination) {
      const opponent = wrappedTarget.origin instanceof Player
        ? wrappedTarget.origin
        : game.value?.getPlayerById(String(wrappedTarget.origin.playerId ?? wrappedTarget.origin.id));
      const destination = boardObj.getCell(Number(wrappedTarget.destination.x), Number(wrappedTarget.destination.y));
      if (!opponent || !destination || !option?.canUse(player, boardObj, { origin: opponent, destination })) return;
      pendingTrackMoveOpponentId.value = null;
      void performServerAction(actionId, { optionIndex, target: { origin: opponent, destination } });
      actionMode.value = '';
      validTargets.value = [];
      return;
    }

    if (wrappedTarget instanceof Player && option?.canUse(player, boardObj, wrappedTarget)) {
      const position = boardObj.getPlayerPosition(wrappedTarget);
      const opponentCell = position && boardObj.getCell(position.x, position.y);
      if (!opponentCell) return;
      pendingTrackMoveOpponentId.value = wrappedTarget.id;
      actionMode.value = 'special:hero_cia_lader:1:destination';
      validTargets.value = boardObj.getNeighbors(opponentCell).filter((cell: BoardCell) => cell.isEmpty && !cell.isHole);
      return;
    }
  }

  if (actionId === 'hero_al_b_tross' && optionIndex === 1) {
    const boardObj = game.value?.board;
    if (!boardObj) return;
    const option = findSpecialActionDefinition(player, actionId)?.options?.[optionIndex];
    const wrappedTarget = params?.target;

    if (wrappedTarget && typeof wrappedTarget === 'object' && 'origin' in wrappedTarget && 'destination' in wrappedTarget) {
      const origin = boardObj.getCell(Number(wrappedTarget.origin?.x), Number(wrappedTarget.origin?.y));
      const destination = boardObj.getCell(Number(wrappedTarget.destination?.x), Number(wrappedTarget.destination?.y));
      if (!origin || !destination || !option?.canUse(player, boardObj, { origin, destination })) return;
      pendingAlBTrossBarricadeOrigin.value = null;
      void performServerAction(actionId, { optionIndex, target: { origin, destination } });
      actionMode.value = '';
      validTargets.value = [];
      return;
    }

    const selectedOrigin = wrappedTarget && typeof wrappedTarget === 'object' && 'x' in wrappedTarget && 'y' in wrappedTarget
      ? boardObj.getCell(Number(wrappedTarget.x), Number(wrappedTarget.y))
      : null;
    if (selectedOrigin?.hasTrap && selectedOrigin.structureOwner?.id !== player.id) {
      pendingAlBTrossTrapOrigin.value = selectedOrigin;
      actionMode.value = 'special:hero_al_b_tross:1:destination';
      validTargets.value = MovementUtil.getCellsWithinStepsFromCell(boardObj, selectedOrigin, 2, true)
        .filter(cell => cell.isEmpty && !cell.isHole);
      return;
    }

    const traps = boardObj.getAllTraps().filter(cell => option?.canUse(player, boardObj, cell));
    if (traps.length > 0) {
      pendingAlBTrossTrapOrigin.value = null;
      actionMode.value = 'special:hero_al_b_tross:1:origin';
      validTargets.value = traps;
      return;
    }
  }

  if (actionId === 'hero_elsa_von_trap' && optionIndex === 1) {
    const wrappedTarget = params?.target;
    const boardObj = game.value?.board;
    if (wrappedTarget && typeof wrappedTarget === 'object' && 'origin' in wrappedTarget && 'destination' in wrappedTarget && boardObj) {
      const origin = boardObj.getCell(Number(wrappedTarget.origin?.x), Number(wrappedTarget.origin?.y));
      const destination = boardObj.getCell(Number(wrappedTarget.destination?.x), Number(wrappedTarget.destination?.y));
      if (!origin || !destination) return;
      pendingVonTrapMoveOrigin.value = null;
      void performServerAction(actionId, { optionIndex, target: { origin, destination } });
      actionMode.value = '';
      validTargets.value = [];
      return;
    }

    const wrappedCell = wrappedTarget && typeof wrappedTarget === 'object' && 'x' in wrappedTarget && 'y' in wrappedTarget
      ? boardObj?.getCell(Number(wrappedTarget.x), Number(wrappedTarget.y))
      : null;
    if (wrappedCell?.hasTrap && wrappedCell.structureOwner?.id === player.id) {
      pendingVonTrapMoveOrigin.value = wrappedCell;
      actionMode.value = 'special:hero_elsa_von_trap:1:destination';
      validTargets.value = [];
      return;
    }

    const trapChoices = (boardObj?.getAllCells() ?? []).filter((cell: BoardCell) => cell.hasTrap && cell.structureOwner?.id === player.id);
    if (trapChoices.length > 0) {
      pendingVonTrapMoveOrigin.value = null;
      actionMode.value = 'special:hero_elsa_von_trap:1:origin';
      validTargets.value = trapChoices;
      return;
    }
  }

  const actionDef = findSpecialActionDefinition(player, actionId);

  if (actionDef) {
    const option = actionDef.options?.[optionIndex];
    const boardObj = game.value?.board;

    if (params?.target !== undefined && option && option.targetType !== 'none' && boardObj) {
      const target = ['cell', 'zombie'].includes(option.targetType) && params.target && typeof params.target === 'object'
        ? boardObj.getCell(Number(params.target.x), Number(params.target.y))
        : params.target;
      if (option.canUse(player, boardObj, target)) {
        void performServerAction(actionId, { ...params, target });
        actionMode.value = '';
        validTargets.value = [];
        return;
      }
    }

    if (option && option.targetType !== 'none') {
      const choices: any[] = [];
      if (!boardObj) {
        void performServerAction(actionId, params || {});
        actionMode.value = '';
        validTargets.value = [];
        return;
      }

      if (option.targetType === 'cell') {
        for (const cell of boardObj.getAllCells()) {
          if (option.canUse(player, boardObj, cell)) {
            choices.push(cell);
          }
        }
      } else if (option.targetType === 'zombie') {
        for (const cell of boardObj.getAllCells()) {
          if (cell.hasZombie && option.canUse(player, boardObj, cell)) {
            choices.push(cell);
          }
        }
      } else if (option.targetType === 'player') {
        for (const candidate of boardObj.getAllPlayers()) {
          if (candidate !== player && option.canUse(player, boardObj, candidate)) {
            choices.push(candidate);
          }
        }
      }

      if (choices.length > 0) {
        actionMode.value = `special:${actionId}:${optionIndex}`;
        validTargets.value = choices;
        return;
      }
    }
  }

  void performServerAction(actionId, params || {});
  actionMode.value = '';
  validTargets.value = [];
}

function handleSelectedCardPlay(cardId: string): void {
  const player = myPlayer.value;
  if (!player) return;
  if (isCardTargeting.value) {
    void cancelTargetedCard();
    return;
  }

  const actionCard = player.actionCards?.find((entry: any) => entry.id === cardId || entry.cardId === cardId);
  if (actionCard && actionCard._specialActionId) {
    const actionId = actionCard._specialActionId;
    const optionIndex = Number(actionCard._specialOptionIndex ?? 0);
    selectedActionCardId.value = cardId;
    onActionClicked(actionId, { optionIndex });
    return;
  }

  const handCard = player.hand?.cards?.find((entry: any) => entry.id === cardId || entry.cardId === cardId);
  if ((handCard?.cardId ?? handCard?.id) === 'open_locker') {
    if (openLockerRequestPending.value) return;
    openLockerRequestPending.value = true;
    selectedActionCardId.value = null;
    actionMode.value = '';
    void performServerAction(cardId, {}).finally(() => {
      openLockerRequestPending.value = false;
    });
    return;
  }

  selectedActionCardId.value = cardId;
  onPlayCard(cardId);
}

async function cancelTargetedCard(): Promise<boolean> {
  const canceled = await performServerAction('cancel-card-targeting');
  if (!canceled) return false;
  selectedActionCardId.value = null;
  actionMode.value = '';
  validTargets.value = [];
  return true;
}

function onPlayCard(cardId: string): void {
  void performServerAction(cardId, {});
  actionMode.value = '';
}

function selectFlexPointChoice(choice: 'NP' | 'CP'): void {
  if (!flexPointSelection.value || flexPointSelection.value.playerId !== props.playerId) return;
  void postGameCommand('flex-point/choose', { choice });
}

function onPassTurn(): void {
  void postPassTurn();
}

function onDeferTurn(): void {
  void postGameCommand('defer-turn');
}

async function postPassTurn(): Promise<void> {
  const gameId = window.location.pathname.match(/^\/game\/([^/]+)/)?.[1];
  if (!gameId) return;

  try {
    const response = await fetch(`/api/game/${encodeURIComponent(gameId)}/pass-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: props.playerId }),
    });
    const result = await response.json().catch(() => ({}));
    if (result.game) applyServerGameState(result.game);
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not pass turn.');
    error.value = null;
  } catch (turnError) {
    error.value = turnError instanceof Error ? turnError.message : String(turnError);
  }
}

function beginNightlyDraft(): void {
  if (phase.value !== 'zombie_phase') return;
  if (escapeState.value) {
    return;
  }
  void postGameCommand('draft/begin');
}

// ===== BOARD INTERACTIONS =====
function onHexClicked(cell: { x: number; y: number }): void {
  const boardCell = game.value?.board.getCell(cell.x, cell.y);
  if (!boardCell) return;

  if (escapeState.value && escapeState.value.playerId === props.playerId) {
    const isLegalTarget = (escapeState.value.validTargets ?? []).some((target: BoardCell) => target.id === boardCell.id);
    if (!isLegalTarget) {
      return;
    }

    void postGameCommand('escape/complete', { x: boardCell.x, y: boardCell.y });
    return;
  }

  if (game.value?.targetingCardId) {
    const cardId = game.value.targetingCardId;
    const player = myPlayer.value;
    if (player && cardId) {
      if (cardId === 'hired_muscle') {
        const boardObj = game.value.board;
        const validOrigins = (game.value.targetingValidTargets || [])
          .map((target: any) => boardObj.getCell(Number(target?.x), Number(target?.y)))
          .filter((target: BoardCell | null): target is BoardCell => !!target?.hasTrap);
        if (!pendingHiredMuscleOrigin.value) {
          if (validOrigins.some((origin: BoardCell) => origin.id === boardCell.id)) {
            pendingHiredMuscleOrigin.value = { x: boardCell.x, y: boardCell.y };
          }
          return;
        }

        const origin = boardObj.getCell(pendingHiredMuscleOrigin.value.x, pendingHiredMuscleOrigin.value.y);
        if (origin && boardObj.getNeighbors(origin).includes(boardCell) && boardCell.isEmpty && !boardCell.isHole) {
          pendingHiredMuscleOrigin.value = null;
          void performServerAction(cardId, { target: { origin, destination: boardCell } });
          actionMode.value = '';
          validTargets.value = [];
        } else if (validOrigins.some((candidate: BoardCell) => candidate.id === boardCell.id)) {
          pendingHiredMuscleOrigin.value = { x: boardCell.x, y: boardCell.y };
        }
        return;
      }

      if (cardId === 'crowded_halls' && game.value.targetingType === 'path') {
        const paths = (game.value.targetingValidTargets || []).filter((entry: any) => Array.isArray(entry) && entry.length === 3);
        if (!pendingCrowdedHallsStep.value) {
          if (paths.some((path: any[]) => path[1]?.x === boardCell.x && path[1]?.y === boardCell.y)) {
            pendingCrowdedHallsStep.value = { x: boardCell.x, y: boardCell.y };
          }
          return;
        }

        const selectedPath = paths.find((path: any[]) =>
          path[1]?.x === pendingCrowdedHallsStep.value?.x
          && path[1]?.y === pendingCrowdedHallsStep.value?.y
          && path[2]?.x === boardCell.x
          && path[2]?.y === boardCell.y
        );
        if (selectedPath) {
          pendingCrowdedHallsStep.value = null;
          void performServerAction(cardId, { target: selectedPath });
          actionMode.value = '';
          validTargets.value = [];
        } else if (paths.some((path: any[]) => path[1]?.x === boardCell.x && path[1]?.y === boardCell.y)) {
          pendingCrowdedHallsStep.value = { x: boardCell.x, y: boardCell.y };
        }
        return;
      }

      let target: any = boardCell;
      if (game.value.targetingType === 'path') {
        const matchedPath = (game.value.targetingValidTargets || []).find((entry: any) => {
          return Array.isArray(entry)
            && entry.length > 0
            && entry[entry.length - 1]?.x === boardCell.x
            && entry[entry.length - 1]?.y === boardCell.y;
        });
        if (matchedPath) {
          target = matchedPath;
        }
      } else if (game.value.targetingType === 'multiple') {
        target = resolveTargetSelection(game.value.targetingValidTargets || validTargets.value, boardCell);
      }

      void performServerAction(cardId, { target });
      actionMode.value = '';
      validTargets.value = [];
    }
    return;
  }

  if (actionMode.value.startsWith('start-action:')) {
    void onResolveStartAction(boardCell);
    return;
  }

  if (phase.value === 'placement') {
    if (!actionMode.value && isMyTurn.value) onPlaceHero(cell);
    return;
  }

  const isAllowedTarget = validTargets.value.some((target: any) => {
    if (Array.isArray(target)) {
      const lastCell = target[target.length - 1];
      return !!lastCell && lastCell.x === boardCell.x && lastCell.y === boardCell.y;
    }
    return !!target && typeof target === 'object' && 'x' in target && 'y' in target && target.x === boardCell.x && target.y === boardCell.y;
  });

  if ((actionMode.value === 'trap' || actionMode.value === 'barricade' || actionMode.value === 'bait') && !isAllowedTarget) {
    return;
  }

  if (actionMode.value === 'special:hero_cia_lader:1:destination') {
    const opponent = pendingTrackMoveOpponentId.value && game.value?.getPlayerById(pendingTrackMoveOpponentId.value);
    const action = opponent && findSpecialActionDefinition(myPlayer.value, 'hero_cia_lader');
    const option = action?.options?.[1];
    const isValidDestination = validTargets.value.some((target: BoardCell) => target.id === boardCell.id);
    if (!opponent || !isValidDestination || !option?.canUse(myPlayer.value, game.value!.board, { origin: opponent, destination: boardCell })) {
      return;
    }

    void performServerAction('hero_cia_lader', {
      optionIndex: 1,
      target: { origin: opponent, destination: boardCell },
    });
    pendingTrackMoveOpponentId.value = null;
    actionMode.value = '';
    validTargets.value = [];
    return;
  }

  if (actionMode.value === 'special:hero_elsa_von_trap:1:origin') {
    const isAllowedTrap = validTargets.value.some((target: any) => target?.x === boardCell.x && target?.y === boardCell.y);
    if (!isAllowedTrap || !boardCell.hasTrap || boardCell.structureOwner?.id !== myPlayer.value?.id) return;
    const chosenTrap = boardCell;
    pendingVonTrapMoveOrigin.value = chosenTrap;
    actionMode.value = 'special:hero_elsa_von_trap:1:destination';
    validTargets.value = getVonTrapMoveDestinations(chosenTrap);
    return;
  }

  if (actionMode.value === 'special:hero_al_b_tross:1:origin') {
    const validOrigin = validTargets.value.some((target: BoardCell) => target.id === boardCell.id);
    if (!validOrigin || !boardCell.hasTrap || boardCell.structureOwner?.id === myPlayer.value?.id) return;
    pendingAlBTrossTrapOrigin.value = boardCell;
    actionMode.value = 'special:hero_al_b_tross:1:destination';
    validTargets.value = MovementUtil.getCellsWithinStepsFromCell(game.value!.board, boardCell, 2, true)
      .filter(cell => cell.isEmpty && !cell.isHole);
    return;
  }

  if (actionMode.value === 'special:hero_al_b_tross:1:destination') {
    const origin = pendingAlBTrossTrapOrigin.value
      && game.value?.board.getCell(pendingAlBTrossTrapOrigin.value.x, pendingAlBTrossTrapOrigin.value.y);
    const destinations = origin && game.value
      ? MovementUtil.getCellsWithinStepsFromCell(game.value.board, origin, 2, true)
      : [];
    const isValidDestination = destinations.some(cell => cell.id === boardCell.id)
      && boardCell.isEmpty && !boardCell.isHole;
    const action = findSpecialActionDefinition(myPlayer.value, 'hero_al_b_tross');
    const option = action?.options?.[1];
    if (!origin || !isValidDestination || !option?.canUse(myPlayer.value, game.value!.board, { origin, destination: boardCell })) return;

    void performServerAction('hero_al_b_tross', {
      optionIndex: 1,
      target: { origin, destination: boardCell },
    });
    pendingAlBTrossTrapOrigin.value = null;
    actionMode.value = '';
    validTargets.value = [];
    return;
  }

  if (actionMode.value === 'special:hero_elsa_von_trap:1:destination') {
    const previousOrigin = pendingVonTrapMoveOrigin.value;
    const origin = previousOrigin && game.value?.board.getCell(previousOrigin.x, previousOrigin.y);
    if (!origin) {
      actionMode.value = '';
      validTargets.value = [];
      return;
    }

    const destinationCandidates = getVonTrapMoveDestinations(origin);
    const isValidDestination = destinationCandidates.some((cell: BoardCell) => cell.x === boardCell.x && cell.y === boardCell.y);
    if (!isValidDestination || (origin.x === boardCell.x && origin.y === boardCell.y)) {
      return;
    }

    void performServerAction('hero_elsa_von_trap', {
      optionIndex: 1,
      target: { origin, destination: boardCell },
    });
    pendingVonTrapMoveOrigin.value = null;
    actionMode.value = '';
    validTargets.value = [];
    return;
  }

  if (actionMode.value.startsWith('special:')) {
    const [_, actionId, optionIndexRaw] = actionMode.value.split(':');
    const optionIndex = Number(optionIndexRaw ?? 0);
    const action = findSpecialActionDefinition(myPlayer.value, actionId);
    const option = action?.options?.[optionIndex];
    let selectedTarget: any;
    if (option?.targetType === 'player') {
      selectedTarget = resolvePlayerTargetSelection(
        validTargets.value,
        game.value?.board.getAllPlayers() ?? [],
        (candidate: Player) => {
          const position = game.value?.board.getPlayerPosition(candidate);
          return position ? { x: position.x, y: position.y } : null;
        },
        boardCell
      );
      if (!selectedTarget) return;
    } else {
      selectedTarget = resolveTargetSelection(validTargets.value, boardCell);
      if (option?.targetType === 'cell' && selectedTarget && game.value?.board) {
        selectedTarget = game.value.board.getCell(Number(selectedTarget.x), Number(selectedTarget.y)) ?? selectedTarget;
      }
    }

    onActionClicked(actionId, { optionIndex, target: selectedTarget });
    actionMode.value = '';
    validTargets.value = [];
    return;
  }

  if (actionMode.value === 'move') {
    onActionClicked('move', { target: boardCell });
  } else if (actionMode.value === 'trap') {
    onActionClicked('trap', { target: boardCell });
  } else if (actionMode.value === 'bait') {
    onActionClicked('bait', { target: boardCell });
  } else if (actionMode.value === 'barricade') {
    onActionClicked('barricade', { target: boardCell });
  } else if (actionMode.value === 'melee') {
    onActionClicked('melee', { target: boardCell });
  }
}

function isTempSelectionSelected(cardId: string): boolean {
  return !!tempSelectionState.value?.selected.includes(cardId);
}

function toggleTempSelection(card: any): void {
  if (!tempSelectionState.value) return;
  const state = tempSelectionState.value;
  const requiredCount = state.type === 'keep' ? (state.keepCount ?? state.count ?? 1) : (state.count ?? 1);
  const nextSelected = new Set(state.selected);

  if (nextSelected.has(card.id)) {
    nextSelected.delete(card.id);
  } else if (nextSelected.size < requiredCount) {
    nextSelected.add(card.id);
  }

  tempSelectionState.value = { ...state, selected: Array.from(nextSelected) };
}

function canConfirmTempSelection(): boolean {
  if (!tempSelectionState.value) return false;
  const requiredCount = tempSelectionState.value.type === 'keep'
    ? (tempSelectionState.value.keepCount ?? tempSelectionState.value.count ?? 1)
    : (tempSelectionState.value.count ?? 1);
  return tempSelectionState.value.selected.length === requiredCount;
}

function confirmTempSelection(): void {
  const state = tempSelectionState.value;
  if (!state || state.selectionId === undefined) return;
  void postGameCommand('selection/complete', {
    selectionId: state.selectionId,
    selectedCardIds: state.selected,
  });
}

function syncPendingCardSelection(sourceGame: Game): void {
  const pending = sourceGame.pendingCardSelection;
  if (!pending || pending.playerId !== props.playerId) {
    tempSelectionState.value = null;
    return;
  }

  const existing = tempSelectionState.value;
  const selected = existing?.selectionId === pending.selectionId ? existing.selected : [];
  tempSelectionState.value = {
    type: pending.type,
    playerId: pending.playerId,
    count: pending.count,
    keepCount: pending.keepCount,
    drawCount: pending.drawCount,
    cards: pending.cards ?? [],
    selected,
    selectionId: pending.selectionId,
  };
}

function canPlayCard(card: any): boolean {
  if (!myPlayer.value || !game.value) return false;

  if (card?.__kind === 'special-action') {
    const action = findSpecialActionDefinition(myPlayer.value, card._specialActionId);
    const option = action?.options?.[card._specialOptionIndex ?? 0];
    if (!action || !option) return false;
    const actionManager = myPlayer.value.actionManager;
    const hasManagedAction = actionManager?.getAllActions().some((entry: any) => entry.id === action.id);
    const isUsed = hasManagedAction && actionManager.isActionUsed(action.id);
    if (isUsed) return false;

    if (option.targetType === 'none') {
      return !!option.canUse(myPlayer.value, game.value.board, undefined);
    }

    const board = game.value.board;
    if (option.targetType === 'player') {
      return board.getAllPlayers().some((candidate: any) => candidate !== myPlayer.value && option.canUse(myPlayer.value, board, candidate));
    }
    if (option.targetType === 'cell') {
      return board.getAllCells().some((cell: any) => option.canUse(myPlayer.value, board, cell));
    }
    if (option.targetType === 'zombie') {
      return board.getAllCells().some((cell: any) => cell.hasZombie && option.canUse(myPlayer.value, board, cell));
    }

    return !!option.canUse(myPlayer.value, board, undefined);
  }

  const definition = CardProcessor.get(card.cardId ?? card.id);
  if (definition && !CardProcessor.canPlayCard(definition, myPlayer.value, game.value.board, game.value)) {
    return false;
  }

  if (card.requirements) {
    for (const req of card.requirements) {
      if (!checkRequirement(req)) return false;
    }
  }

  if (card.goldCost && myPlayer.value.gold < card.goldCost) return false;
  if (card.spCost && myPlayer.value.currSP < card.spCost) return false;
  if (card.cpCost && myPlayer.value.currCP < card.cpCost) return false;
  if (card.npCost && myPlayer.value.currNP < card.npCost) return false;

  return true;
}

function checkRequirement(req: any): boolean {
  if (!myPlayer.value || !game.value) return false;

  const board = game.value.board;
  if (!board) return false;

  switch (req.type) {
    case 'gold':
      return myPlayer.value.gold >= req.value;
    case 'sp':
      return myPlayer.value.currSP >= req.value;
    case 'hp':
      return myPlayer.value.currHealth >= req.value;
    case 'hasTrap': {
      return board.getAllTraps().some(cell => cell.structureOwner?.id === myPlayer.value?.id);
    }
    case 'hasBarricade': {
      return board.getAllBarricades().some(cell => cell.structureOwner?.id === myPlayer.value?.id);
    }
    case 'trapCount': {
      const trapCount = board.getAllTraps().filter(cell => cell.structureOwner?.id === myPlayer.value?.id).length;
      return trapCount >= req.value;
    }
    case 'barricadeCount': {
      const barricadeCount = board.getAllBarricades().filter(cell => cell.structureOwner?.id === myPlayer.value?.id).length;
      return barricadeCount >= req.value;
    }
    case 'hasTrapInRoom': {
      if (req.roomId) {
        const cellsInRoom = board.getCellsInRoom(req.roomId);
        return cellsInRoom.some(cell => cell.hasTrap && cell.structureOwner?.id === myPlayer.value?.id);
      }
      return false;
    }
    case 'hasBarricadeInRoom': {
      if (req.roomId) {
        const cellsInRoom = board.getCellsInRoom(req.roomId);
        return cellsInRoom.some(cell => cell.hasBarricade && cell.structureOwner?.id === myPlayer.value?.id);
      }
      return false;
    }
    default:
      return true;
  }
}

function returnToLobby(): void {
  emit('returnToLobby');
}
</script>

<style scoped>
.game-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 100vh;
  background: #0d0d1a;
  overflow: hidden;
  position: relative;
}

.runtime-debug-panel {
  position: fixed;
  top: 12px;
  right: 12px;
  left: auto;
  z-index: 99999;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.7);
  border-radius: 8px;
  padding: 10px 12px;
  color: #e0f2fe;
  font-size: 11px;
  line-height: 1.5;
  max-width: 320px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.runtime-debug-title {
  font-weight: 700;
  color: #fbbf24;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

.game-layout {
  display: flex;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.board-column {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.board-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 12px;
  overflow: hidden;
}

.bottom-dock {
  flex-shrink: 0;
  background: rgba(13, 13, 26, 0.92);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.right-panel {
  width: 340px;
  max-width: 32vw;
  min-width: 260px;
  border-left: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(13, 13, 26, 0.9);
  display: flex;
  flex-direction: row;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  transition: width 0.2s ease, min-width 0.2s ease;
}

.right-panel--setup {
  width: min(100vw - 24px, 1500px);
  max-width: 100%;
  min-width: 0;
  height: 100vh;
  max-height: 100vh;
  border-left: none;
}

.right-panel--collapsed {
  width: 24px;
  min-width: 24px;
}

.right-panel__toggle {
  width: 24px;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.85);
  border-right: 1px solid rgba(148, 163, 184, 0.2);
  font-size: 18px;
  line-height: 1;
  user-select: none;
}

.right-panel__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  width: 100%;
}

.game-log-shell {
  flex: 1 1 auto;
  min-height: 140px;
  overflow: hidden;
}

.sidebar-panel {
  width: 420px;
  max-width: 40vw;
  min-width: 280px;
  height: 100%;
  border-left: 1px solid #1d1d30;
  background: rgba(13, 13, 26, 0.85);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-panel--wide {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.draft-overlay {
  position: fixed;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.draft-overlay--startup {
  inset: 0;
  padding: 24px;
  background: rgba(2, 6, 23, 0.68);
  backdrop-filter: blur(2px);
}

.draft-overlay--nightly {
  left: 50%;
  bottom: 76px;
  transform: translateX(-50%);
  width: min(980px, calc(100vw - 24px));
}

.draft-phase-bar {
  pointer-events: auto;
}

.draft-phase-bar--startup {
  width: min(1280px, calc(100vw - 48px));
  max-height: min(84vh, 860px);
}

.draft-phase-bar--nightly {
  width: 100%;
  max-width: 980px;
}

.error-banner {
  margin: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(127, 29, 29, 0.4);
  border: 1px solid rgba(239, 68, 68, 0.6);
  color: #fecaca;
  font-size: 12px;
}

.placeholder-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  color: #a0a0b8;
}

.zombie-phase-panel {
  gap: 12px;
  align-items: center;
}

.nightly-draft-button {
  margin-top: 8px;
  padding: 10px 20px;
  border: 1px solid #a78bfa;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #f8fafc;
  font-weight: 700;
  cursor: pointer;
}

.flex-point-selection-inline {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(168, 85, 247, 0.75);
  border-radius: 12px;
  background: rgba(40, 20, 62, 0.7);
  color: #f5e9ff;
}

.flex-point-selection-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #ddd6fe;
}

.flex-point-selection-copy {
  font-size: 12px;
  color: #e9d5ff;
  line-height: 1.4;
}

.flex-point-selection-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
}

.flex-point-btn {
  flex: 1;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  font-weight: 700;
  cursor: pointer;
}

.flex-point-btn--np {
  background: rgba(96, 165, 250, 0.18);
  color: #dbeafe;
}

.flex-point-btn--cp {
  background: rgba(168, 85, 247, 0.2);
  color: #f3e8ff;
}

.render-error {
  background: rgba(127, 29, 29, 0.3);
  border: 1px solid rgba(239, 68, 68, 0.5);
  color: #fecaca;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.temp-selection-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(2px);
}

.temp-selection-panel {
  width: min(760px, calc(100vw - 32px));
  max-height: min(80vh, 760px);
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(96, 165, 250, 0.8);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  padding: 18px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.temp-selection-header {
  font-size: 14px;
  color: #dbeafe;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
}

.temp-selection-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  overflow-y: auto;
  padding: 6px;
}

.temp-selection-card {
  cursor: pointer;
  border-radius: 10px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.temp-selection-card--selected {
  transform: translateY(-2px);
  box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.7);
  border-radius: 10px;
}

.temp-selection-confirm {
  align-self: center;
  padding: 10px 26px;
  border-radius: 999px;
  border: 1px solid #7c3aed;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #f8fafc;
  font-weight: 700;
  cursor: pointer;
}

.temp-selection-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .game-layout {
    flex-direction: column;
    overflow: auto;
  }

  .board-column {
    min-height: 52vh;
  }

  .board-panel {
    min-height: 320px;
  }

  .right-panel {
    width: 100%;
    max-width: none;
    min-width: 0;
    border-left: none;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    min-height: 220px;
  }

  .sidebar-panel {
    width: 100%;
    max-width: none;
    min-width: 0;
    border-left: none;
    border-top: 1px solid #1d1d30;
    max-height: 48vh;
  }
}

.placeholder-title {
  text-transform: capitalize;
  color: #d8d8e8;
  font-weight: 700;
}

.placeholder-copy {
  color: #8a8aa3;
  font-size: 13px;
}
</style>