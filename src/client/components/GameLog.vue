<template>
  <div ref="logBox" class="game-log">
    <div v-for="(line, i) in recentLogs" :key="i" class="log-line" v-html="line"></div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'GameLog',
  props: {
    logs: { type: Array as () => ReadonlyArray<string>, default: () => [] },
  },
  computed: {
    recentLogs(): string[] {
      const arr = this.logs as string[];
      return arr.slice(-30);
    },
  },
  watch: {
    logs() {
      this.$nextTick(() => {
        const el = this.$refs['logBox'] as HTMLElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  },
});
</script>

<style>
.game-log {
  height: 120px;
  overflow-y: auto;
  background: #0d0d1a;
  border-top: 1px solid #333;
  padding: 8px 12px;
  font-size: 12px;
  font-family: monospace;
  color: #aaa;
}
.log-line {
  padding: 1px 0;
  border-bottom: 1px solid #111;
}
.log-line:last-child { border-bottom: none; color: #ddd; }

/* Rich log span colours */
.log-np      { color: #ff6677; font-weight: bold; }
.log-cp      { color: #5599ff; font-weight: bold; }
.log-sp      { color: #55cc55; font-weight: bold; }
.log-gp      { color: #cccc22; font-weight: bold; }
.log-gold    { color: #ffd700; font-weight: bold; }
.log-goldcost { color: #ffd700; }
.log-hp      { color: #ffbbcc; font-weight: bold; }
.log-cardname { color: #ffcc88; font-style: italic; }
.log-card-draw { color: #aaddff; }
.log-indent  { opacity: 0.85; font-size: 11px; display: block; padding-left: 12px; }
</style>
