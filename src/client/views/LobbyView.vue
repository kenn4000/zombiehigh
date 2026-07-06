<template>
  <div class="lobby">
    <h1 class="title">Zombie High</h1>

    <!-- Create new game -->
    <div class="card">
      <h2>New Game</h2>
      <div v-for="(player, i) in playerRows" :key="i" class="player-row">
        <input v-model="player.name" :placeholder="`Player ${i + 1} name`" class="input" />
        <select v-model="player.color" class="select">
          <option v-for="c in colors" :key="c" :value="c">{{ c }}</option>
        </select>
        <button v-if="playerRows.length > 1" class="btn-remove" @click="removePlayer(i)">✕</button>
      </div>
      <div class="row-actions">
        <button v-if="playerRows.length < 5 - cpuOpponentCount" class="btn btn--secondary" @click="addPlayer">+ Add Player</button>
        <button class="btn btn--primary" :disabled="creating" @click="createGame">
          {{ creating ? 'Creating...' : 'Create Game' }}
        </button>
      </div>
      <div class="settings-row">
        <label class="setting-toggle">
          <input type="checkbox" v-model="firstCardFreeNightDraft" />
          <span>First card of each nightly draft is free</span>
        </label>
        <div class="setting-inline">
          <label for="human-count">Human players</label>
          <select id="human-count" :value="playerRows.length" class="select select--compact" @change="onHumanCountChanged">
            <option v-for="n in getHumanOptions()" :key="`hum-${n}`" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="setting-inline">
          <label for="cpu-count">CPU opponents</label>
          <select id="cpu-count" v-model.number="cpuOpponentCount" class="select select--compact">
            <option v-for="n in getCpuOptions()" :key="`cpu-${n}`" :value="n">{{ n }}</option>
          </select>
        </div>
        <div class="setting-inline" v-if="cpuOpponentCount > 0">
          <label for="cpu-difficulty">CPU difficulty</label>
          <select id="cpu-difficulty" v-model="cpuDifficultyLevel" class="select select--compact">
            <option value="easy">easy</option>
            <option value="normal">normal</option>
            <option value="hard">hard</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Created game links -->
    <div v-if="createdLinks.length > 0" class="card created-links">
      <h2>Game Created! Share these links:</h2>
      <div v-for="link in createdLinks" :key="link.playerId" class="link-row">
        <strong>{{ link.name }}:</strong>
        <a :href="link.url" class="player-link">{{ link.url }}</a>
        <button class="btn-copy" @click="copyLink(link.url)">Copy</button>
      </div>
      <div class="link-row">
        <strong>Spectator:</strong>
        <a :href="spectatorUrl" class="player-link">{{ spectatorUrl }}</a>
      </div>
    </div>

    <!-- Existing games -->
    <div v-if="existingGames.length > 0" class="card">
      <h2>Existing Games</h2>
      <div v-for="g in existingGames" :key="g.id" class="game-row">
        <span class="phase-tag">{{ g.phase }}</span>
        <span>Night {{ g.generation }} · {{ g.playerCount }} players</span>
        <a :href="`/spectator/${g.id}`" class="btn btn--small">Spectate</a>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { apiGet, apiPost } from '../api';

type GameSummary = { id: string; phase: string; playerCount: number; generation: number };
type CreateResponse = {
  gameId: string;
  playerUrls: Array<{ name: string; playerId: string; url: string }>;
  spectatorUrl: string;
};

type CreatePlayerPayload = {
  name: string;
  color: string;
  isBot?: boolean;
  difficultyLevel?: 'easy' | 'normal' | 'hard';
};

export default Vue.extend({
  name: 'LobbyView',
  data() {
    return {
      playerRows: [
        { name: 'Player 1', color: 'red' },
      ] as Array<{ name: string; color: string }>,
      colors: ['red', 'blue', 'green', 'yellow', 'cyan', 'magenta', 'orange', 'purple'],
      creating: false,
      error: null as string | null,
      createdLinks: [] as Array<{ name: string; playerId: string; url: string }>,
      spectatorUrl: '',
      existingGames: [] as GameSummary[],
      firstCardFreeNightDraft: false,
      cpuOpponentCount: 0,
      cpuDifficultyLevel: 'normal' as 'easy' | 'normal' | 'hard',
    };
  },
  created() {
    this.loadGames();
  },
  methods: {
    nextAvailableColor(preferredIndex: number): string {
      const usedColors = new Set(this.playerRows.map(p => p.color));
      const preferred = this.colors[preferredIndex % this.colors.length];
      if (preferred && !usedColors.has(preferred)) return preferred;
      return this.colors.find(c => !usedColors.has(c)) ?? this.colors[preferredIndex % this.colors.length];
    },
    getHumanOptions(): number[] {
      const maxHumans = Math.max(1, 5 - this.cpuOpponentCount);
      return Array.from({ length: maxHumans }, (_, i) => i + 1);
    },
    onHumanCountChanged(event: Event): void {
      const target = event.target as HTMLSelectElement;
      const count = Math.max(1, Math.min(5 - this.cpuOpponentCount, Number(target.value) || 1));
      this.setHumanPlayerCount(count);
    },
    setHumanPlayerCount(count: number): void {
      while (this.playerRows.length < count) {
        const idx = this.playerRows.length;
        this.playerRows.push({
          name: `Player ${idx + 1}`,
          color: this.nextAvailableColor(idx),
        });
      }
      while (this.playerRows.length > count) {
        this.playerRows.pop();
      }
      this.clampCpuOpponents();
    },
    addPlayer(): void {
      const maxHumans = 5 - this.cpuOpponentCount;
      if (this.playerRows.length >= maxHumans) return;
      const idx = this.playerRows.length;
      this.playerRows.push({ name: `Player ${idx + 1}`, color: this.nextAvailableColor(idx) });
      this.clampCpuOpponents();
    },
    removePlayer(i: number): void {
      this.playerRows.splice(i, 1);
      this.clampCpuOpponents();
    },
    clampCpuOpponents(): void {
      const maxCpu = Math.max(0, 5 - this.playerRows.length);
      if (this.cpuOpponentCount > maxCpu) this.cpuOpponentCount = maxCpu;
    },
    getCpuOptions(): number[] {
      const maxCpu = Math.max(0, 5 - this.playerRows.length);
      return Array.from({ length: maxCpu + 1 }, (_, i) => i);
    },
    buildCpuPlayers(): CreatePlayerPayload[] {
      const usedColors = new Set(this.playerRows.map(p => p.color));
      const botPlayers: CreatePlayerPayload[] = [];
      for (let i = 0; i < this.cpuOpponentCount; i++) {
        const color = this.colors.find(c => !usedColors.has(c)) ?? this.colors[(this.playerRows.length + i) % this.colors.length];
        usedColors.add(color);
        botPlayers.push({
          name: `CPU ${i + 1}`,
          color,
          isBot: true,
          difficultyLevel: this.cpuDifficultyLevel,
        });
      }
      return botPlayers;
    },
    async createGame(): Promise<void> {
      this.error = null;
      this.creating = true;
      try {
        const humanPlayers: CreatePlayerPayload[] = this.playerRows.map(p => ({ name: p.name, color: p.color }));
        const cpuPlayers = this.buildCpuPlayers();
        const res = await apiPost<CreateResponse>('/api/game', {
          players: [...humanPlayers, ...cpuPlayers],
          settings: { firstCardFreeNightDraft: this.firstCardFreeNightDraft },
        });
        this.createdLinks = res.playerUrls;
        this.spectatorUrl = res.spectatorUrl;
        await this.loadGames();
      } catch (e: unknown) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.creating = false;
      }
    },
    async loadGames(): Promise<void> {
      try {
        this.existingGames = await apiGet<GameSummary[]>('/api/games');
      } catch {
        // silently ignore
      }
    },
    copyLink(url: string): void {
      void navigator.clipboard.writeText(window.location.origin + url);
    },
  },
});
</script>

<style scoped>
.lobby {
  max-width: 640px;
  margin: 40px auto;
  padding: 0 16px;
  color: #e0e0e0;
}
.title {
  font-size: 2.5rem;
  color: #e74c3c;
  margin-bottom: 24px;
  text-align: center;
}
.card {
  background: #1e1e2e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}
h2 { font-size: 1.1rem; margin-bottom: 14px; color: #ccc; }
.player-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.input {
  flex: 1;
  background: #12122a;
  border: 1px solid #444;
  color: #e0e0e0;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 14px;
}
.select {
  background: #12122a;
  border: 1px solid #444;
  color: #e0e0e0;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 14px;
}
.btn-remove {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
}
.btn-remove:hover { color: #e74c3c; }
.row-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}
.settings-row {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #333;
}
.setting-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #ccc;
  font-size: 13px;
  margin-bottom: 8px;
}
.setting-toggle input[type="checkbox"] { accent-color: #a78bfa; width: 16px; height: 16px; cursor: pointer; }
.setting-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  color: #ccc;
  font-size: 13px;
}
.select--compact {
  min-width: 120px;
}
.btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary { background: #2d2d5e; border-color: #a78bfa; color: #a78bfa; }
.btn--primary:hover:not(:disabled) { background: #3d3d7e; }
.btn--secondary { background: #1a1a2e; border-color: #555; color: #ccc; }
.btn--small { padding: 4px 10px; font-size: 12px; background: #1a1a2e; border-color: #555; color: #ccc; }
.created-links { border-color: #4caf50; }
.link-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13px; }
.player-link { color: #a78bfa; text-decoration: none; flex: 1; word-break: break-all; }
.player-link:hover { text-decoration: underline; }
.btn-copy { padding: 2px 8px; font-size: 11px; background: #1a1a2e; border: 1px solid #555; color: #ccc; border-radius: 4px; cursor: pointer; }
.game-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #222; }
.game-row:last-child { border-bottom: none; }
.phase-tag { padding: 2px 8px; background: #333; border-radius: 4px; font-size: 11px; color: #aaa; }
.error { color: #e74c3c; margin-top: 10px; font-size: 13px; }
</style>
