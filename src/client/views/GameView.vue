<template>
  <div class="game-view">
    <!-- Error banner -->
    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Loading -->
    <div v-if="!game" class="loading">Loading game...</div>

    <template v-else>
      <!-- Header bar -->
      <div class="header-bar">
        <span class="phase-badge" :class="`phase-${game.phase}`">{{ game.phase.toUpperCase() }}</span>
        <span>Night {{ game.generation }}</span>
        <span v-if="game.phase === 'action'">Actions: {{ game.actionsRemaining }}</span>
        <span v-if="game.playerInEscapeId" class="escape-alert">&#9888; ESCAPE IN PROGRESS</span>
        <span v-if="isMyTurn && game.phase === 'action'" class="your-turn">Your Turn</span>
      </div>

      <!-- SETUP phase -->
      <template v-if="game.phase === 'setup'">
        <div class="main-area">
          <game-setup
            v-if="myPlayer"
            :player="myPlayer"
            :all-players="game.players"
            @select-hero="onSelectHero"
            @select-locker="onSelectLocker"
            @toggle-starting-card="onToggleStartingCard"
            @confirm-setup="onConfirmAction({ type: 'confirm' })"
            @start-game="onConfirmAction({ type: 'start_game' })"
          />
          <div v-else class="spectator-wait">Spectator view — waiting for setup to complete...</div>
        </div>
      </template>

      <!-- DRAFTING phase — keep game layout visible, show draft as overlay on board -->
      <template v-else-if="game.phase === 'drafting'">
        <div class="main-area">
          <!-- My panel on the left — visible so player can see their stats -->
          <player-sidebar
            v-if="myPlayer"
            :players="[myPlayer]"
            :viewer-id="playerId"
            :is-my-turn="false"
            :phase="game.phase"
            class="sidebar--left"
          />

          <!-- Board in the centre (dimmed), draft panel overlaid on top -->
          <div class="board-wrap board-wrap--draft-host">
            <game-board
              :board="game.board"
              :is-clickable="false"
            />
            <div class="draft-overlay" v-if="myPlayer">
              <draft-phase
                :player="myPlayer"
                :generation="game.generation"
                :first-card-free-night-draft="game.settings && game.settings.firstCardFreeNightDraft"
                @toggle-draft-card="onToggleDraftCard"
                @confirm-draft="onConfirmAction({ type: 'confirm' })"
                @skip-draft="onConfirmAction({ type: 'or_options', index: 0 })"
              />
            </div>
            <div v-else class="draft-overlay spectator-wait">Spectator — waiting for drafting to complete...</div>
          </div>

          <!-- Opponents on the right — visible so player can see their stats -->
          <player-sidebar
            v-if="myPlayer && opponentPlayers.length"
            :players="opponentPlayers"
            :viewer-id="playerId"
            :is-my-turn="false"
            :phase="game.phase"
            class="sidebar--right"
          />
        </div>
      </template>

      <!-- GAME_OVER phase -->
      <template v-else-if="game.phase === 'game_over'">
        <div class="game-over">
          <h1 class="game-over__title">Game Over</h1>
          <table class="score-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>SP</th>
                <th>NP</th>
                <th>CP</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(player, idx) in sortedPlayers"
                :key="player.id"
                :class="{ 'score-row--me': player.id === playerId }"
              >
                <td>{{ idx + 1 }}</td>
                <td>
                  <span class="color-dot" :style="{ background: player.color }"></span>
                  <span :class="{'last-survivor-name': player.isLastSurvivor}">{{ player.name }}</span>
                  <span v-if="player.isLastSurvivor"> ★</span>
                </td>
                <td>{{ player.survivalPoints }}</td>
                <td>{{ player.nicePoints }}</td>
                <td>{{ player.coolPoints }}</td>
                <td class="score-total">{{ playerTotal(player) }}</td>
                <td>{{ player.isAlive ? 'Survived' : 'Eliminated' }}</td>
              </tr>
            </tbody>
          </table>

          <!-- Score-over-time chart -->
          <div v-if="game.nightScoreHistory && game.nightScoreHistory.length > 0" class="score-chart-wrap">
            <h2 class="score-chart__title">Score per Night</h2>
            <svg class="score-chart" :viewBox="`0 0 ${chartW} ${chartH}`" :width="chartW" :height="chartH">
              <!-- Axes -->
              <line :x1="pad" :y1="pad" :x2="pad" :y2="chartH - pad" stroke="#aaa" stroke-width="1"/>
              <line :x1="pad" :y1="chartH - pad" :x2="chartW - pad" :y2="chartH - pad" stroke="#aaa" stroke-width="1"/>
              <!-- Night labels -->
              <text
                v-for="n in game.nightScoreHistory.length"
                :key="'nl'+n"
                :x="nightX(n - 1)"
                :y="chartH - pad + 14"
                text-anchor="middle"
                font-size="11"
                fill="#ccc"
              >N{{ n }}</text>
              <!-- Lines per player -->
              <polyline
                v-for="pid in chartPlayerIds"
                :key="'line'+pid"
                :points="playerPoints(pid)"
                fill="none"
                :stroke="playerColor(pid)"
                stroke-width="2"
                stroke-linejoin="round"
              />
              <!-- Dots per player per night -->
              <circle
                v-for="pt in allDots"
                :key="pt.key"
                :cx="pt.x"
                :cy="pt.y"
                r="3"
                :fill="pt.color"
              />
              <!-- Legend -->
              <g v-for="(pid, li) in chartPlayerIds" :key="'leg'+pid">
                <rect :x="pad + li * 100" :y="8" width="12" height="12" :fill="playerColor(pid)" rx="2"/>
                <text :x="pad + li * 100 + 16" y="19" font-size="11" fill="#ccc">{{ playerName(pid) }}</text>
              </g>
            </svg>
          </div>

          <button class="lobby-btn" @click="returnToLobby">Return to Lobby</button>
        </div>
      </template>

      <!-- ACTION / ESCAPE phase -->
      <template v-else>
        <div class="main-area">
          <!-- My own panel on the left -->
          <player-sidebar
            v-if="myPlayer"
            :players="[myPlayer]"
            :viewer-id="playerId"
            :is-my-turn="isMyTurn"
            :phase="game.phase"
            class="sidebar--left"
            @play-card="onPlayCard"
            @activate-action="onActivateAction"
            @or-option="onOrOption"
            @sell-card="onSellCard"
          />

          <!-- Board in the centre -->
          <div class="board-wrap">
            <game-board
              :board="game.board"
              :is-clickable="isClickable"
              :is-wall-mode="actionMode === 'W'"
              @hex-clicked="onHexClicked"
              @edge-clicked="onEdgeClicked"
            />
          </div>

          <!-- Right sidebar (collapsible) -->
          <div class="right-sidebar-wrap" :class="{ 'right-sidebar-wrap--collapsed': rightSidebarCollapsed }">
            <button class="right-sidebar-tab" :title="rightSidebarCollapsed ? 'Show opponents' : 'Hide opponents'" @click="rightSidebarCollapsed = !rightSidebarCollapsed">
              {{ rightSidebarCollapsed ? '◀' : '▶' }}
            </button>

            <!-- Opponents on the right -->
            <player-sidebar
              v-if="myPlayer && opponentPlayers.length"
              :players="opponentPlayers"
              :viewer-id="playerId"
              :is-my-turn="isMyTurn"
              :phase="game.phase"
              class="sidebar--right"
              @play-card="onPlayCard"
              @activate-action="onActivateAction"
              @or-option="onOrOption"
              @sell-card="onSellCard"
            />

            <!-- Spectator: no split, show everyone on the right -->
            <player-sidebar
              v-if="!myPlayer"
              :players="game.players"
              :viewer-id="playerId"
              :is-my-turn="isMyTurn"
              :phase="game.phase"
              class="sidebar--right"
              @play-card="onPlayCard"
              @activate-action="onActivateAction"
              @or-option="onOrOption"
              @sell-card="onSellCard"
            />
          </div>
        </div>

        <!-- Night choice prompt (shown between zombie phase and draft phase) -->
        <div
          v-if="game.phase === 'night_choice' && game.nightChoicePlayerId === playerId"
          class="night-choice-bar"
        >
          <span class="night-choice-msg">
            You earned <b>{{ nightChoicePoints }}</b> point{{ nightChoicePoints !== 1 ? 's' : '' }} from tonight’s events — take all as:
          </span>
          <button class="btn btn--np" @click="sendInput({ type: 'night_choice', choice: 'np' })">
            NP (Nice Points)
          </button>
          <button class="btn btn--cp" @click="sendInput({ type: 'night_choice', choice: 'cp' })">
            CP (Cool Points)
          </button>
        </div>
        <div
          v-else-if="game.phase === 'night_choice'"
          class="night-choice-bar night-choice-bar--waiting"
        >
          <span class="night-choice-msg">Waiting for players to choose their night rewards…</span>
        </div>

        <!-- Action bar (only in action/escape) -->
        <action-bar
          :phase="game.phase"
          :is-my-turn="isMyTurn"
          :action-mode="actionMode"
          :actions-remaining="game.actionsRemaining"
          :has-adjacent-zombie="hasAdjacentZombie"
          :trap-cost="myPlayer ? myPlayer.trapCost : 16"
          :bait-cost="myPlayer ? myPlayer.baitCost : 5"
          :barricade-cost="myPlayer ? myPlayer.barricadeCost : 10"
          :melee-cost="myPlayer ? myPlayer.meleeCost : 1"
          :move-cost="myPlayer ? myPlayer.moveCost : 3"
          :active-actions="myPlayer ? myPlayer.activeActions : []"
          :used-action-names="myPlayer ? myPlayer.usedActionNames : []"
          :has-starting-action="myPlayer ? myPlayer.hasStartingAction : false"
          @mode-changed="onModeChanged"
          @confirm-action="onConfirmAction"
          @activate-action="onActivateAction"
        />

        <!-- Game log -->
        <game-log :logs="game.logs" />
      </template>
    </template>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import GameBoard from '../components/GameBoard.vue';
import ActionBar from '../components/ActionBar.vue';
import GameLog from '../components/GameLog.vue';
import PlayerSidebar from '../components/PlayerSidebar.vue';
import GameSetup from './GameSetup.vue';
import DraftPhase from './DraftPhase.vue';
import { getGameState, getSpectatorState, sendPlayerInput } from '../api';
import { GameModel } from '../../common/models/GameModel';
import { PlayerModel } from '../../common/models/PlayerModel';

export default Vue.extend({
  name: 'GameView',
  components: { GameBoard, ActionBar, GameLog, PlayerSidebar, GameSetup, DraftPhase },
  props: {
    playerId: { type: String, default: '' },
    spectatorGameId: { type: String, default: '' },
  },
  data() {
    return {
      game: null as GameModel | null,
      actionMode: '',
      error: null as string | null,
      pollTimer: null as ReturnType<typeof setInterval> | null,
      wsConn: null as WebSocket | null,
      wsConnected: false,
      rightSidebarCollapsed: false,
    };
  },
  computed: {
    myPlayer(): PlayerModel | undefined {
      if (!this.game || !this.playerId) return undefined;
      return this.game.players.find((p: PlayerModel) => p.id === this.playerId);
    },
    isMyTurn(): boolean {
      if (!this.game || !this.playerId) return false;
      return this.game.activePlayerId === this.playerId;
    },
    isClickable(): boolean {
      const phase = this.game?.phase;
      if (phase === 'night_choice') return false;
      if (phase === 'placement') return this.isMyTurn;
      // During escape, only the bitten player (playerInEscapeId) can click
      if (phase === 'escape') return this.game?.playerInEscapeId === this.playerId;
      // During zombie targeting, the player who played the card must click a zombie tile
      if (this.game?.pendingTargetPlayerId === this.playerId) return true;
      // During board interactions (e.g. trap relocation), the card-player must click the highlighted tile
      if (this.game?.pendingInteractionPlayerId === this.playerId) return true;
      return phase === 'action' && this.isMyTurn;
    },
    sortedPlayers(): PlayerModel[] {
      if (!this.game) return [];
      return [...this.game.players].sort((a: PlayerModel, b: PlayerModel) =>
        (b.survivalPoints + Math.max(b.nicePoints, b.coolPoints)) -
        (a.survivalPoints + Math.max(a.nicePoints, a.coolPoints))
      );
    },
    chartW(): number { return 600; },
    chartH(): number { return 220; },
    pad(): number { return 40; },
    chartPlayerIds(): string[] {
      if (!this.game?.nightScoreHistory?.length) return [];
      const ids = new Set<string>();
      for (const night of this.game.nightScoreHistory) for (const e of night) ids.add(e.id);
      return [...ids];
    },
    allDots(): Array<{ key: string; x: number; y: number; color: string }> {
      if (!this.game?.nightScoreHistory?.length) return [];
      const maxScore = this.chartMaxScore();
      const nights = this.game.nightScoreHistory.length;
      const result: Array<{ key: string; x: number; y: number; color: string }> = [];
      for (const pid of this.chartPlayerIds) {
        this.game.nightScoreHistory.forEach((night, ni) => {
          const e = night.find((e: { id: string }) => e.id === pid);
          if (!e) return;
          result.push({ key: `${pid}-${ni}`, x: this.nightX(ni), y: this.scoreY(e.score, maxScore), color: e.color });
        });
      }
      return result;
    },
    opponentPlayers(): PlayerModel[] {
      if (!this.game) return [];
      return this.game.players.filter((p: PlayerModel) => p.id !== this.playerId);
    },
    hasAdjacentZombie(): boolean {
      if (!this.myPlayer || !this.game) return false;
      const { q, r } = this.myPlayer as { q: number; r: number };
      return (this.game.board.zombies as Array<{ q: number; r: number }>).some(
        z => (Math.abs(z.q - q) === 1 && z.r === r) || (z.q === q && Math.abs(z.r - r) === 1),
      );
    },
    nightChoicePoints(): number {
      return this.myPlayer?.pendingNightPoints ?? 0;
    },
  },
  watch: {
    game(g: GameModel | null) {
      this.actionMode = g?.currentMode ?? '';
    },
    'game.activePlayerId'(newId: string): void {
      if (!this.playerId) return;
      if (newId === this.playerId && (this.game?.phase === 'action' || this.game?.phase === 'placement')) {
        this.playBeep(880);
      }
    },
    'game.phase'(newPhase: string): void {
      if (newPhase === 'drafting') {
        this.playBeep(660);
      } else if (newPhase === 'escape' && this.game?.activePlayerId === this.playerId) {
        this.playBeep(440, 0.25);
      }
    },
  },
  created() {
    this.fetchGame();
    this.connectWebSocket();
    this.startPolling();
  },
  beforeDestroy() {
    this.stopPolling();
    if (this.wsConn) {
      this.wsConn.close();
      this.wsConn = null;
    }
  },
  methods: {
    async fetchGame(): Promise<void> {
      try {
        if (this.playerId) {
          this.game = await getGameState(this.playerId);
        } else if (this.spectatorGameId) {
          this.game = await getSpectatorState(this.spectatorGameId);
        }
        this.error = null;
        this.restartPolling();
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : String(e);
      }
    },
    startPolling(): void {
      // When WebSocket is active, poll slowly as fallback only; otherwise poll at normal rate
      const interval = this.wsConnected ? 10000 : (this.isMyTurn ? 500 : 2000);
      this.pollTimer = setInterval(() => this.fetchGame(), interval);
    },
    stopPolling(): void {
      if (this.pollTimer !== null) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },
    restartPolling(): void {
      this.stopPolling();
      this.startPolling();
    },
    connectWebSocket(): void {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      let wsUrl: string;
      if (this.playerId) {
        wsUrl = `${proto}//${host}/ws?playerId=${encodeURIComponent(this.playerId)}`;
      } else if (this.spectatorGameId) {
        wsUrl = `${proto}//${host}/ws?spectator=${encodeURIComponent(this.spectatorGameId)}`;
      } else {
        return;
      }
      const ws = new WebSocket(wsUrl);
      this.wsConn = ws;

      ws.onopen = () => {
        this.wsConnected = true;
        this.restartPolling();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'game_update' && msg.data) {
            this.game = msg.data as GameModel;
            this.error = null;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        this.wsConnected = false;
        this.wsConn = null;
        this.restartPolling();
        // Reconnect after 3 seconds
        setTimeout(() => this.connectWebSocket(), 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    },
    playBeep(freq = 880, duration = 0.12): void {
      try {
        const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch { /* audio not available */ }
    },
    async sendInput(input: unknown): Promise<void> {
      if (!this.playerId) return;
      try {
        this.game = await sendPlayerInput(this.playerId, input);
        this.error = null;
        this.restartPolling();
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : String(e);
      }
    },
    async onHexClicked(hex: { q: number; r: number }): Promise<void> {
      await this.sendInput({ type: 'select_hex', hex });
    },
    async onModeChanged(mode: string): Promise<void> {
      this.actionMode = mode; // optimistic
      await this.sendInput({ type: 'set_mode', mode });
    },
    async onConfirmAction(input: unknown): Promise<void> {
      await this.sendInput(input);
    },
    async onPlayCard(cardName: string): Promise<void> {
      await this.sendInput({ type: 'select_card', cardNames: [cardName] });
    },
    async onOrOption(index: number): Promise<void> {
      await this.sendInput({ type: 'or_options', index });
    },
    async onActivateAction(cardName: string): Promise<void> {
      await this.sendInput({ type: 'activate_action', cardName });
    },
    async onSellCard(cardName: string): Promise<void> {
      await this.sendInput({ type: 'sell_card', cardName });
    },
    async onSelectHero(heroId: string): Promise<void> {
      await this.sendInput({ type: 'select_hero', heroId });
    },
    async onSelectLocker(lockerId: string): Promise<void> {
      await this.sendInput({ type: 'select_locker', lockerId });
    },
    async onToggleStartingCard(cardName: string): Promise<void> {
      await this.sendInput({ type: 'select_card', cardNames: [cardName] });
    },
    async onToggleDraftCard(cardName: string): Promise<void> {
      await this.sendInput({ type: 'select_card', cardNames: [cardName] });
    },
    async onEdgeClicked(edge: { q1: number; r1: number; q2: number; r2: number }): Promise<void> {
      await this.sendInput({ type: 'select_edge', qa: edge.q1, ra: edge.r1, qb: edge.q2, rb: edge.r2 });
    },
    returnToLobby(): void {
      window.location.href = '/';
    },
    playerTotal(player: PlayerModel): number {
      return player.survivalPoints + Math.max(player.nicePoints, player.coolPoints);
    },
    chartMaxScore(): number {
      if (!this.game?.nightScoreHistory?.length) return 1;
      let max = 1;
      for (const night of this.game.nightScoreHistory) for (const e of night) if (e.score > max) max = e.score;
      return max;
    },
    nightX(ni: number): number {
      const nights = this.game?.nightScoreHistory?.length ?? 1;
      const inner = (this.chartW as number) - 2 * (this.pad as number);
      return (this.pad as number) + (nights <= 1 ? inner / 2 : (ni / (nights - 1)) * inner);
    },
    scoreY(score: number, maxScore: number): number {
      const inner = (this.chartH as number) - 2 * (this.pad as number);
      return (this.pad as number) + inner - (score / maxScore) * inner;
    },
    playerPoints(pid: string): string {
      if (!this.game?.nightScoreHistory?.length) return '';
      const max = this.chartMaxScore();
      return this.game.nightScoreHistory
        .map((night: ReadonlyArray<{ id: string; score: number }>, ni: number) => {
          const e = night.find((e: { id: string }) => e.id === pid);
          return e ? `${this.nightX(ni)},${this.scoreY(e.score, max)}` : null;
        })
        .filter(Boolean)
        .join(' ');
    },
    playerColor(pid: string): string {
      if (!this.game?.nightScoreHistory?.length) return '#888';
      for (const night of this.game.nightScoreHistory) {
        const e = (night as ReadonlyArray<{ id: string; color: string }>).find((e) => e.id === pid);
        if (e) return e.color;
      }
      return '#888';
    },
    playerName(pid: string): string {
      if (!this.game?.nightScoreHistory?.length) return pid;
      for (const night of this.game.nightScoreHistory) {
        const e = (night as ReadonlyArray<{ id: string; name: string }>).find((e) => e.id === pid);
        if (e) return e.name;
      }
      return pid;
    },
  },
});
</script>

<style scoped>
.game-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d0d1a;
  color: #e0e0e0;
  overflow: hidden;
}
.error-banner {
  background: #5c1c1c;
  color: #ff8080;
  padding: 8px 16px;
  font-size: 13px;
  flex-shrink: 0;
}
.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 18px;
}
.header-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 8px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
  font-size: 14px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.phase-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 12px;
}
.phase-setup { background: #553399; }
.phase-action { background: #225522; }
.phase-escape { background: #882222; }
.phase-drafting { background: #224488; }
.phase-game_over { background: #555; }
.escape-alert { color: #e74c3c; font-weight: bold; }
.your-turn { color: #a78bfa; font-weight: bold; }
.right-sidebar-wrap {
  position: relative;
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  transition: width 0.25s ease;
  width: 440px;
  overflow: hidden;
}
.right-sidebar-wrap--collapsed {
  width: 28px;
}
.right-sidebar-tab {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 24px;
  height: 48px;
  background: #2a2a4a;
  border: 1px solid #555;
  border-radius: 4px 0 0 4px;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}
.right-sidebar-tab:hover { background: #3a3a6a; }
.right-sidebar-wrap .sidebar--right {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  margin-left: 28px;
}
.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.main-area--draft {
  gap: 0;
}
.board-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.board-wrap--small {
  max-width: 380px;
  opacity: 0.6;
  pointer-events: none;
  flex-shrink: 0;
}
/* Draft overlay host — board dims behind the draft panel */
.board-wrap--draft-host {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}
.board-wrap--draft-host > :first-child {
  opacity: 0.6;
  pointer-events: none;
}
.draft-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(8, 8, 20, 0.6);
  z-index: 5;
  overflow-y: auto;
  padding: 0 16px 24px;
}
.draft-overlay > .draft-phase {
  background: #14142a;
  border: 1px solid #3a3a6a;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  max-width: 1000px;
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
}
.spectator-wait {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  font-size: 15px;
  padding: 24px;
}
.game-over {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 32px;
  gap: 24px;
  overflow-y: auto;
}
.game-over__title {
  font-size: 36px;
  font-weight: bold;
  color: #aaa;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin: 0;
}
.score-table {
  border-collapse: collapse;
  min-width: 480px;
  font-size: 15px;
}
.score-table th {
  background: #1a1a2e;
  color: #a0a0c0;
  padding: 8px 16px;
  text-align: left;
  border-bottom: 2px solid #333;
}
.score-table td {
  padding: 8px 16px;
  border-bottom: 1px solid #222;
}
.score-table tbody tr:hover {
  background: #14142a;
}
.score-row--me td {
  color: #a78bfa;
  font-weight: bold;
}
.last-survivor-name {
  font-style: italic;
  font-weight: bold;
}
.score-total {
  font-weight: bold;
  color: #f0c040;
}
.color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.score-chart-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.score-chart__title {
  font-size: 16px;
  color: #a0a0c0;
  margin: 0;
}
.score-chart {
  background: #10101e;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: visible;
}
.lobby-btn {
  padding: 10px 28px;
  background: #553399;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  cursor: pointer;
}
.lobby-btn:hover {
  background: #6644aa;
}

/* Night choice bar */
.night-choice-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  background: #141428;
  border-top: 2px solid #ffd700;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.night-choice-bar--waiting {
  border-top-color: #444;
}
.night-choice-msg { color: #ddd; font-size: 14px; }
.btn--np { border-color: #ff6677; color: #ff6677; }
.btn--np:hover { background: #3d1f2a; }
.btn--cp { border-color: #5599ff; color: #5599ff; }
.btn--cp:hover { background: #1f2a3d; }
</style>
