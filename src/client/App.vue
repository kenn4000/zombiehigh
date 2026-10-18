<template>
  <div id="app">
    <div v-if="showDebugOverlay && debugSteps.length" class="debug-overlay">
      <div class="debug-title">Load Debug</div>
      <div v-for="(step, index) in debugSteps" :key="`${step}-${index}`" class="debug-step">
        {{ step }}
      </div>
    </div>

    <div v-else-if="bootError" class="boot-error">
      <div class="boot-error-card">
        <h2>Game failed to load</h2>
        <p>{{ bootError }}</p>
        <button @click="resetToLobby">Return to Front Desk</button>
      </div>
    </div>

    <LobbyView v-else-if="!gameManager && !isLoadingGame && !isGameRoute" />

    <GameView 
      v-else-if="gameManager && playerId"
      :player-id="playerId"
      :game-manager="gameManager"
      @return-to-lobby="returnToLobby"
    />

    <div v-if="gameManager && playerId" style="display:none">
      {{ console.log('LIVE RENDER CHECK', { isLoadingGame: isLoadingGame, gameManager: !!gameManager, playerId: playerId, isGameRoute: isGameRoute, bootError: bootError }) }}
    </div>

    <div v-else-if="isGameRoute" style="display:none">
      {{ console.log('FINAL LIVE BOOT STATE', { isGameRoute: isGameRoute, isLoadingGame: isLoadingGame, playerId: playerId, gameManager: !!gameManager, bootError: bootError }) }}
    </div>

    <div v-else class="loading-shell">
      <div class="loading-content">
        <div class="loading-spinner">🧟</div>
        <p>{{ loadingMessage }}</p>
        <div class="loading-state">Route: {{ isGameRoute ? 'game route' : 'front desk route' }}</div>
        <div class="loading-state">gameManager: {{ gameManager ? 'ready' : 'missing' }}</div>
        <div class="loading-state">playerId: {{ playerId || 'missing' }}</div>
        <div class="loading-state">Route: {{ isGameRoute ? 'game route' : 'front desk route' }}</div>
        <div class="loading-state">gameManager: {{ gameManager ? 'ready' : 'missing' }}</div>
        <div class="loading-state">playerId: {{ playerId || 'missing' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import LobbyView from '../game/Views/LobbyView.vue';
import GameView from '../game/Views/GameView.vue';
import { GameManager } from '../game/index';
import { hydrateGame } from '../game/hydrateGame';
import { shouldBootGameRoute, shouldForceRouteReload } from './routeBoot';

const playerId = ref('');
const gameManager = ref<GameManager | null>(null);
const loadingMessage = ref('Loading game...');
const isLoadingGame = ref(false);
const bootError = ref<string | null>(null);
const debugSteps = ref<string[]>([]);
const isGameRoute = ref(false);
const showDebugOverlay = ref(false);

function addDebugStep(step: string): void {
  const stamp = new Date().toLocaleTimeString();
  const line = `[${stamp}] ${step}`;
  debugSteps.value = [...debugSteps.value.slice(-12), line];
  console.log('[ZGH Debug]', step);
}

function getGameIdFromUrl(): string | null {
  const match = window.location.pathname.match(/\/game\/([^/?#]+)/);
  return match ? match[1] : null;
}

onMounted(async () => {
  showDebugOverlay.value = new URLSearchParams(window.location.search).get('debug') === '1';

  addDebugStep('App mounted');

  const currentUrl = window.location.href;
  addDebugStep(`Current URL: ${currentUrl}`);

  isGameRoute.value = window.location.pathname.startsWith('/game/');

  if (!isGameRoute.value) {
    addDebugStep('Front Desk route detected. Showing normal Front Desk UI.');
    bootError.value = null;
    gameManager.value = null;
    playerId.value = '';
    isLoadingGame.value = false;
    return;
  }

  isGameRoute.value = true;

  const shouldReload = shouldForceRouteReload(currentUrl);
  addDebugStep(`Route reload needed: ${shouldReload}`);

  if (shouldReload) {
    const freshUrl = new URL(window.location.href);
    freshUrl.searchParams.set('fresh', '1');
    addDebugStep(`Reloading page with a clean deep-link bootstrap: ${freshUrl.toString()}`);
    window.location.replace(freshUrl.toString());
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const id = params.get('playerId');
  const gameId = params.get('gameId') || getGameIdFromUrl();

  addDebugStep(`Query playerId: ${id ?? 'missing'}`);
  addDebugStep(`Resolved gameId: ${gameId ?? 'missing'}`);

  if (!shouldBootGameRoute(currentUrl)) {
    const missing = !id && !gameId ? 'Missing playerId and gameId in URL.' : !id ? 'Missing playerId in URL.' : 'Missing gameId in URL.';
    addDebugStep(`Game route missing required params. Stopping boot. ${missing}`);
    bootError.value = missing;
    isLoadingGame.value = false;
    return;
  }

  isLoadingGame.value = true;
  playerId.value = id;
  addDebugStep(`Loading game for player ${id} and game ${gameId}`);

  try {
    const response = await fetch(`/api/game/current?gameId=${encodeURIComponent(gameId)}`);
    addDebugStep(`Fetch response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 404) {
        const staleGameMessage = 'This game no longer exists on the current server session. Returning to the Front Desk.';
        addDebugStep(`Game not found. ${staleGameMessage}`);
        bootError.value = staleGameMessage;
        isLoadingGame.value = false;
        setTimeout(() => {
          window.location.replace('/');
        }, 800);
        return;
      }

      throw new Error(`Game fetch failed with ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    addDebugStep(`Response keys: ${Object.keys(data).join(', ') || 'none'}`);

    if (data.game) {
      addDebugStep('Game payload found, hydrating runtime object');
      const hydratedGame = hydrateGame(data.game);
      addDebugStep(`Hydrated object created: ${!!hydratedGame}`);
      addDebugStep(`Hydrated phase: ${hydratedGame?.phase ?? 'unknown'}`);

      gameManager.value = new GameManager(hydratedGame);
      isLoadingGame.value = false;
      addDebugStep(`GameManager created: ${!!gameManager.value}`);
      addDebugStep(`GameView should render for player ${playerId.value}`);
    } else {
      addDebugStep('No data.game present in response');
      gameManager.value = null;
      isLoadingGame.value = false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addDebugStep(`LOAD FAILURE: ${message}`);
    console.error('Failed to load game:', error);
    bootError.value = message;
    gameManager.value = null;
    isLoadingGame.value = false;
  }
});

function resetToLobby() {
  bootError.value = null;
  gameManager.value = null;
  playerId.value = '';
  isLoadingGame.value = false;
  window.location.replace('/');
}

function returnToLobby() {
  addDebugStep('Returning to Front Desk');
  bootError.value = null;
  gameManager.value = null;
  playerId.value = '';
  isLoadingGame.value = false;
  window.location.replace('/');
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  background: #0d0d1a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e0e0e0;
}

#app {
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.debug-overlay {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 99999;
  max-width: 440px;
  max-height: 35vh;
  overflow: auto;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  color: #e2e8f0;
  font-size: 11px;
  line-height: 1.5;
}

.debug-title {
  font-weight: 700;
  color: #fbbf24;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.debug-step {
  white-space: pre-wrap;
  word-break: break-word;
  color: #dbeafe;
}

.loading-shell,
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: #dbeafe;
  font-size: 18px;
  background: #0d0d1a;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.loading-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 24px;
}

.loading-state {
  font-size: 12px;
  color: #93c5fd;
  opacity: 0.9;
}

.loading-spinner {
  font-size: 48px;
  animation: bounce 1s ease-in-out infinite;
  margin-bottom: 16px;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.loading p {
  color: #666;
}

.boot-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #0d0d1a;
  color: #e2e8f0;
  padding: 24px;
}

.boot-error-card {
  max-width: 640px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 12px;
  padding: 24px 20px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
}

.boot-error-card h2 {
  font-size: 22px;
  margin-bottom: 12px;
  color: #f8fafc;
}

.boot-error-card p {
  white-space: pre-wrap;
  color: #cbd5e1;
  margin-bottom: 16px;
}

.boot-error-card button {
  background: #6d5efc;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  font-weight: 700;
}
</style>