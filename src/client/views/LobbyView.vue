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
        <button v-if="playerRows.length < 5" class="btn btn--secondary" @click="addPlayer">+ Add Player</button>
        <button class="btn btn--primary" :disabled="creating" @click="createGame">
          {{ creating ? 'Creating...' : 'Create Game' }}
        </button>
      </div>
      <div class="settings-row">
        <label class="setting-toggle">
          <input type="checkbox" v-model="firstCardFreeNightDraft" />
          <span>First card of each nightly draft is free</span>
        </label>
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

export default Vue.extend({
  name: 'LobbyView',
  data() {
    return {
      playerRows: [
        { name: 'Player 1', color: 'red' },
        { name: 'Player 2', color: 'blue' },
      ] as Array<{ name: string; color: string }>,
      colors: ['red', 'blue', 'green', 'yellow', 'cyan', 'magenta', 'orange', 'purple'],
      creating: false,
      error: null as string | null,
      createdLinks: [] as Array<{ name: string; playerId: string; url: string }>,
      spectatorUrl: '',
      existingGames: [] as GameSummary[],
      firstCardFreeNightDraft: false,
    };
  },
  created() {
    this.loadGames();
  },
  methods: {
    addPlayer(): void {
      const colors = ['green', 'yellow', 'cyan', 'magenta', 'orange', 'purple'];
      this.playerRows.push({ name: `Player ${this.playerRows.length + 1}`, color: colors[this.playerRows.length - 2] ?? 'green' });
    },
    removePlayer(i: number): void {
      this.playerRows.splice(i, 1);
    },
    async createGame(): Promise<void> {
      this.error = null;
      this.creating = true;
      try {
        const res = await apiPost<CreateResponse>('/api/game', {
          players: this.playerRows.map(p => ({ name: p.name, color: p.color })),
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
}
.setting-toggle input[type="checkbox"] { accent-color: #a78bfa; width: 16px; height: 16px; cursor: pointer; }
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
