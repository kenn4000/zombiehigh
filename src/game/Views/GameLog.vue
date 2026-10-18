<template>
  <div class="game-log-container">
    <div ref="logBox" class="game-log" :class="{ 'game-log--collapsed': collapsed }">
      <div v-for="(line, i) in recentLogs" :key="i" class="log-line" v-html="line"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, nextTick, ref } from 'vue';

const props = defineProps<{
  logs?: ReadonlyArray<string>;
  collapsed?: boolean;
}>();

const logBox = ref<HTMLElement | null>(null);

const recentLogs = computed(() => {
  const arr = props.logs || [];
  return arr.slice(-30);
});

watch(() => props.logs, () => {
  if (!props.collapsed) {
    nextTick(() => {
      if (logBox.value) {
        logBox.value.scrollTop = logBox.value.scrollHeight;
      }
    });
  }
});
</script>

<style scoped>
.game-log-container {
  flex: 0 0 auto;
  max-height: 140px;
  width: 100%;
}

.game-log {
  height: 100%;
  overflow-y: auto;
  background: #0d0d1a;
  padding: 8px 12px;
  font-size: 12px;
  font-family: monospace;
  color: #aaa;
  transition: opacity 0.2s;
}

.game-log--collapsed {
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

.log-line {
  padding: 1px 0;
  border-bottom: 1px solid #111;
  word-wrap: break-word;
}

.log-line:last-child { border-bottom: none; color: #ddd; }
</style>

<style>
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