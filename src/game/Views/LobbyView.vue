<template>
  <div class="lobby">
    <h1 class="title">🧟 Zombie High</h1>

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
        <label class="setting-toggle">
          <input type="checkbox" v-model="reshuffleDeck" />
          <span>Reshuffle the deck when empty</span>
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
      </div>
    </div>

    <!-- Created game links -->
    <div v-if="createdLinks.length > 0" class="card created-links">
      <h2>🎮 Game Created! Share these links:</h2>
      <div v-for="link in createdLinks" :key="link.playerId" class="link-row">
        <strong>{{ link.name }}:</strong>
        <a :href="link.url" class="player-link" target="_blank">{{ link.url }}</a>
        <button class="btn-copy" @click="copyLink(link.url)">📋 Copy</button>
      </div>
      <div class="link-row">
        <strong>👁️ Spectator:</strong>
        <a :href="spectatorUrl" class="player-link" target="_blank">{{ spectatorUrl }}</a>
        <button class="btn-copy" @click="copyLink(spectatorUrl)">📋 Copy</button>
      </div>
      <div class="link-row" style="margin-top: 12px; border-top: 1px solid #333; padding-top: 12px;">
        <button class="btn btn--primary" @click="copyAllLinks">📋 Copy All Links</button>
        <button class="btn btn--secondary" @click="resetGameCreation">🔄 Create Another Game</button>
      </div>
    </div>

    <!-- Existing games -->
    <div v-if="existingGames.length > 0" class="card">
      <h2>📋 Existing Games</h2>
      <div v-for="g in existingGames" :key="g.id" class="game-row">
        <span class="phase-tag" :class="`phase-${g.phase}`">{{ g.phase }}</span>
        <span>Night {{ g.generation }} · {{ g.playerCount }} players</span>
        <a :href="`/spectator/${g.id}`" class="btn btn--small">👁️ Spectate</a>
      </div>
    </div>

    <div v-if="error" class="error">❌ {{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { apiGet, apiPost } from '../../server/api';

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
};

// ===== STATE =====
const colors = ['red', 'blue', 'green', 'yellow', 'cyan', 'magenta', 'orange', 'purple'];
const playerRows = ref<Array<{ name: string; color: string }>>([
  { name: 'Player 1', color: 'red' },
]);
const creating = ref(false);
const error = ref<string | null>(null);
const createdLinks = ref<Array<{ name: string; playerId: string; url: string }>>([]);
const spectatorUrl = ref('');
const existingGames = ref<GameSummary[]>([]);
const firstCardFreeNightDraft = ref(false);
const reshuffleDeck = ref(true);
const cpuOpponentCount = ref(0);

// ===== METHODS =====
function nextAvailableColor(preferredIndex: number): string {
  const usedColors = new Set(playerRows.value.map(p => p.color));
  const preferred = colors[preferredIndex % colors.length];
  if (preferred && !usedColors.has(preferred)) return preferred;
  return colors.find(c => !usedColors.has(c)) ?? colors[preferredIndex % colors.length];
}

function getHumanOptions(): number[] {
  const maxHumans = Math.max(1, 5 - cpuOpponentCount.value);
  return Array.from({ length: maxHumans }, (_, i) => i + 1);
}

function onHumanCountChanged(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const count = Math.max(1, Math.min(5 - cpuOpponentCount.value, Number(target.value) || 1));
  setHumanPlayerCount(count);
}

function setHumanPlayerCount(count: number): void {
  while (playerRows.value.length < count) {
    const idx = playerRows.value.length;
    playerRows.value.push({
      name: `Player ${idx + 1}`,
      color: nextAvailableColor(idx),
    });
  }
  while (playerRows.value.length > count) {
    playerRows.value.pop();
  }
  clampCpuOpponents();
}

function addPlayer(): void {
  const maxHumans = 5 - cpuOpponentCount.value;
  if (playerRows.value.length >= maxHumans) return;
  const idx = playerRows.value.length;
  playerRows.value.push({ name: `Player ${idx + 1}`, color: nextAvailableColor(idx) });
  clampCpuOpponents();
}

function removePlayer(i: number): void {
  playerRows.value.splice(i, 1);
  clampCpuOpponents();
}

function clampCpuOpponents(): void {
  const maxCpu = Math.max(0, 5 - playerRows.value.length);
  if (cpuOpponentCount.value > maxCpu) cpuOpponentCount.value = maxCpu;
}

function getCpuOptions(): number[] {
  const maxCpu = Math.max(0, 5 - playerRows.value.length);
  return Array.from({ length: maxCpu + 1 }, (_, i) => i);
}

function buildCpuPlayers(): CreatePlayerPayload[] {
  const usedColors = new Set(playerRows.value.map(p => p.color));
  const botPlayers: CreatePlayerPayload[] = [];
  for (let i = 0; i < cpuOpponentCount.value; i++) {
    const color = colors.find(c => !usedColors.has(c)) ?? colors[(playerRows.value.length + i) % colors.length];
    usedColors.add(color);
    botPlayers.push({
      name: `CPU ${i + 1}`,
      color,
      isBot: true,
    });
  }
  return botPlayers;
}

async function createGame(): Promise<void> {
  error.value = null;
  creating.value = true;
  try {
    const humanPlayers: CreatePlayerPayload[] = playerRows.value.map(p => ({ name: p.name, color: p.color }));
    const cpuPlayers = buildCpuPlayers();
    const res = await apiPost<CreateResponse>('/api/game', {
      players: [...humanPlayers, ...cpuPlayers],
      settings: {
        firstCardFreeNightDraft: firstCardFreeNightDraft.value,
        reshuffleDeck: reshuffleDeck.value,
      },
    });
    createdLinks.value = res.playerUrls;
    spectatorUrl.value = res.spectatorUrl;
    await loadGames();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    creating.value = false;
  }
}

async function loadGames(): Promise<void> {
  try {
    existingGames.value = await apiGet<GameSummary[]>('/api/games');
  } catch {
    // silently ignore
  }
}

function copyLink(url: string): void {
  const fullUrl = window.location.origin + url;
  void navigator.clipboard.writeText(fullUrl).then(() => {
    // Optional: Show a brief success indicator
    const btn = document.activeElement as HTMLElement;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = fullUrl;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
}

function copyAllLinks(): void {
  if (createdLinks.value.length === 0) {
    alert('No links to copy!');
    return;
  }
  
  const allLinks = createdLinks.value
    .map(l => `${l.name}: ${window.location.origin + l.url}`)
    .join('\n') + `\n\nSpectator: ${window.location.origin + spectatorUrl.value}`;
  
  navigator.clipboard.writeText(allLinks).then(() => {
    alert('✅ All links copied to clipboard!');
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = allLinks;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('✅ All links copied to clipboard!');
  });
}

function resetGameCreation(): void {
  createdLinks.value = [];
  spectatorUrl.value = '';
}

// ===== LIFECYCLE =====
onMounted(() => {
  loadGames();
});
</script>

<style scoped>
.lobby {
  max-width: 680px;
  margin: 40px auto;
  padding: 0 16px;
  color: #e0e0e0;
}

.title {
  font-size: 2.8rem;
  color: #e74c3c;
  margin-bottom: 24px;
  text-align: center;
  text-shadow: 0 0 40px rgba(231, 76, 60, 0.3);
  letter-spacing: 2px;
}

.card {
  background: #1e1e2e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
}

.card h2 {
  font-size: 1.1rem;
  margin-bottom: 16px;
  color: #ccc;
}

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
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: #a78bfa;
}

.select {
  background: #12122a;
  border: 1px solid #444;
  color: #e0e0e0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: #a78bfa;
}

.btn-remove {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 18px;
  padding: 0 8px;
  transition: color 0.2s;
}

.btn-remove:hover {
  color: #e74c3c;
}

.row-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.settings-row {
  margin-top: 12px;
  padding-top: 12px;
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

.setting-toggle input[type="checkbox"] {
  accent-color: #a78bfa;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

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
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn--primary {
  background: #2d2d5e;
  border-color: #a78bfa;
  color: #a78bfa;
}

.btn--primary:hover:not(:disabled) {
  background: #3d3d7e;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.2);
}

.btn--secondary {
  background: #1a1a2e;
  border-color: #555;
  color: #ccc;
}

.btn--secondary:hover:not(:disabled) {
  background: #2a2a4a;
}

.btn--small {
  padding: 4px 12px;
  font-size: 12px;
  background: #1a1a2e;
  border-color: #555;
  color: #ccc;
}

.btn--small:hover:not(:disabled) {
  background: #2a2a4a;
}

.created-links {
  border-color: #4caf50;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 13px;
}

.link-row strong {
  min-width: 70px;
  color: #a0a0c0;
}

.player-link {
  color: #a78bfa;
  text-decoration: none;
  flex: 1;
  word-break: break-all;
}

.player-link:hover {
  text-decoration: underline;
}

.btn-copy {
  padding: 4px 12px;
  font-size: 12px;
  background: #1a1a2e;
  border: 1px solid #555;
  color: #ccc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy:hover {
  background: #2a2a4a;
  border-color: #a78bfa;
}

.game-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #222;
}

.game-row:last-child {
  border-bottom: none;
}

.phase-tag {
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.phase-setup { background: #553399; color: #c0a0f0; }
.phase-player_turn { background: #225522; color: #80c080; }
.phase-zombie_turn { background: #882222; color: #ff8080; }
.phase-draft { background: #224488; color: #80a0e0; }
.phase-game_over { background: #555; color: #aaa; }
.phase-placement { background: #884422; color: #e0a080; }
.phase-hero_selection { background: #442288; color: #c080e0; }
.phase-locker_selection { background: #228844; color: #80e0a0; }
.phase-card_purchase { background: #884422; color: #e0a060; }

.error {
  color: #e74c3c;
  margin-top: 10px;
  font-size: 14px;
  text-align: center;
  padding: 12px;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(231, 76, 60, 0.2);
}

/* Responsive */
@media (max-width: 600px) {
  .lobby {
    margin: 20px auto;
  }
  
  .title {
    font-size: 2rem;
  }
  
  .player-row {
    flex-wrap: wrap;
  }
  
  .player-row .input {
    flex: 1 1 100%;
  }
  
  .player-row .select {
    flex: 1;
  }
  
  .row-actions {
    flex-wrap: wrap;
  }
  
  .row-actions .btn {
    flex: 1;
  }
  
  .link-row {
    flex-wrap: wrap;
  }
  
  .link-row strong {
    min-width: 100%;
  }
  
  .link-row .player-link {
    flex: 1 1 100%;
    order: 1;
  }
  
  .link-row .btn-copy {
    order: 2;
  }
}
</style>