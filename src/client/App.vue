<template>
  <div id="app">
    <game-view
      v-if="view === 'game'"
      :player-id="playerId"
      :spectator-game-id="spectatorGameId"
    />
    <lobby-view v-else />
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import LobbyView from './views/LobbyView.vue';
import GameView from './views/GameView.vue';

export default Vue.extend({
  name: 'App',
  components: { LobbyView, GameView },
  data() {
    return {
      view: 'lobby' as 'lobby' | 'game',
      playerId: '',
      spectatorGameId: '',
    };
  },
  created() {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('player');
    if (pid && pid.startsWith('p-')) {
      this.playerId = pid;
      this.view = 'game';
      return;
    }

    const path = window.location.pathname;
    const spectatorMatch = path.match(/^\/spectator\/([^/]+)$/);
    if (spectatorMatch) {
      this.spectatorGameId = spectatorMatch[1];
      this.view = 'game';
      return;
    }

    this.view = 'lobby';
  },
});
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  background: #0d0d1a;
  color: #e0e0e0;
  font-family: 'Segoe UI', Tahoma, sans-serif;
}
#app {
  height: 100vh;
  overflow: hidden;
}
</style>
