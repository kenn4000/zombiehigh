<template>
  <div class="sidebar">
    <!-- Each player panel -->
    <div
      v-for="p in players"
      :key="p.id"
      class="player-panel"
      :class="{
        'player-panel--active': p.isActive,
        'player-panel--dead': !p.isAlive,
        'player-panel--me': p.id === viewerId,
      }"
    >
      <!-- Player header -->
      <div class="panel-header">
        <span class="color-dot" :style="{ background: p.color }"></span>
        <strong class="panel-name">{{ p.name }}</strong>
        <span v-if="p.heroId" class="hero-badge">{{ formatId(p.heroId) }}</span>
        <span v-for="lockerId in p.lockerIds" :key="lockerId" class="locker-badge" :title="formatId(lockerId)">{{ formatId(lockerId) }}</span>
        <span v-if="p.isActive" class="turn-indicator">▶</span>
      </div>

      <!-- Stats grid -->
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-label">Health</span>
          <span class="stat-value" :class="hpClass(p)">{{ p.hitPoints }}/{{ p.maxHitPoints }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">SP</span>
          <span class="stat-value">{{ p.survivalPoints }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Gold</span>
          <span class="stat-value gold">{{ p.gold }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">CP</span>
          <span class="stat-value cool">{{ p.coolPoints }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">NP</span>
          <span class="stat-value nice">{{ p.nicePoints }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">GP</span>
          <span class="stat-value">+{{ p.goldProduction }}</span>
        </div>
        <div class="stat" :title="`d6 ≤ ${p.trapSuccessRate} kills zombie (higher = better)`">
          <span class="stat-label">Trap</span>
          <span class="stat-value">{{ p.trapSuccessRate }}</span>
        </div>
        <div class="stat" :title="`Barricade holds if zombie rolls ≤ ${p.barricadeFailRate}`">
          <span class="stat-label">Wall</span>
          <span class="stat-value">{{ p.barricadeFailRate }}</span>
        </div>
        <div class="stat" :title="`d6 > ${p.meleeSuccessRate} kills zombie (costs ${p.meleeCost} gold)`">
          <span class="stat-label">Melee</span>
          <span class="stat-value">{{ p.meleeSuccessRate }}</span>
        </div>

      </div>

      <!-- Active passives — compact tag bar -->
      <div v-if="p.activePassives.length > 0" class="section">
        <div class="section-label">Passives</div>
        <div class="passive-bar">
          <span
            v-for="c in p.activePassives"
            :key="c.name"
            class="passive-tag"
            :title="c.effectText"
          >{{ c.name }}</span>
        </div>
      </div>

      <!-- Active actions — compact tooltip buttons -->
      <div v-if="p.activeActions.length > 0" class="section">
        <div class="section-label">
          Actions
          <span v-if="p.hasStartingAction" class="starting-banner">▶ Starting action required</span>
        </div>
        <div class="action-list">
          <button
            v-for="c in p.activeActions"
            :key="c.name"
            class="action-btn"
            :class="actionBtnClass(p, c)"
            :title="c.requirementText && c.requirementText !== 'None' ? c.requirementText + '\n' + c.effectText : c.effectText"
            :disabled="isActionDisabled(p, c)"
            @click="onActionCardClicked(p, c.name)"
          >{{ stripTag(c.name) }}</button>
        </div>
      </div>

      <!-- Select Locker choice (Open Locker: pick a locker item) — own player only -->
      <div v-if="p.id === viewerId && p.waitingFor && p.waitingFor.type === 'select_locker'" class="section">
        <div class="section-label choice-banner">&#x26A1; {{ p.waitingFor.title }}</div>
        <div class="locker-option-grid">
          <div
            v-for="lockerId in p.waitingFor.lockerIds"
            :key="lockerId"
            class="option-card option-card--locker"
            @click="$emit('select-locker', lockerId)"
          >
            <div class="card-header">
              <div class="option-icon locker-icon">{{ lockerInitials(lockerId) }}</div>
              <div class="card-title-block">
                <div class="card-name">{{ lockerName(lockerId) }}</div>
                <div v-if="lockerDataById(lockerId)" class="stat-row">
                  <span v-if="lockerDataById(lockerId).bonusGold !== 0" class="stat stat--gold">{{ lockerDataById(lockerId).bonusGold > 0 ? '+' : '' }}{{ lockerDataById(lockerId).bonusGold }}G</span>
                  <template v-if="lockerDataById(lockerId).nonGoldBonus && lockerDataById(lockerId).nonGoldBonus !== 'n/a'">
                    <span
                      v-for="(pill, pi) in parseLockerBonusPills(lockerDataById(lockerId).nonGoldBonus)"
                      :key="pi"
                      :class="'stat ' + pill.cls"
                    >{{ pill.text }}</span>
                  </template>
                </div>
              </div>
            </div>
            <div v-if="lockerDataById(lockerId)" class="ability-list">
              <div v-if="lockerDataById(lockerId).startingAction" class="ability-line">
                <span class="ability-badge type-instant">I</span>
                <span>{{ lockerDataById(lockerId).startingAction }}</span>
              </div>
              <div v-for="(ab, i) in (lockerDataById(lockerId).abilities || [])" :key="i" class="ability-line">
                <span class="ability-badge" :class="abilityBadgeClass(ab.type)">{{ ab.type.charAt(0) }}</span>
                <span>{{ ab.effect }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- OR-options choice (e.g. Uncovered Locker Item: pick one) — own player only -->
      <div v-if="p.id === viewerId && p.waitingFor && p.waitingFor.type === 'or_options'" class="section">
        <div class="section-label choice-banner">&#x26A1; {{ p.waitingFor.title }}</div>
        <div class="action-list">
          <button
            v-for="(opt, idx) in p.waitingFor.options"
            :key="opt"
            class="action-btn action-btn--mine"
            @click="$emit('or-option', idx)"
          >{{ formatId(opt) }}</button>
        </div>
      </div>

      <!-- Draw-Keep temp hand (own player only, when pendingDrawKeepCount > 0) -->
      <div v-if="p.id === viewerId && p.pendingDrawKeepCount > 0" class="section">
        <div class="section-label draw-keep-banner">&#x1F4E5; Choose {{ p.pendingDrawKeepCount }} card(s) to keep from drawn cards</div>
        <div class="card-row">
          <card-view
            v-for="c in p.temporaryHand"
            :key="c.name"
            :card="c"
            @card-clicked="onCardClicked($event)"
          />
        </div>
      </div>

      <!-- Hand (own player only) -->
      <div v-if="p.id === viewerId && p.cardsInHand.length > 0" class="section">
        <div class="section-label">
          <template v-if="p.waitingFor && p.waitingFor.type === 'select_card'">
            <span class="discard-banner">&#x26A0; {{ p.waitingFor.title }} &#x2014; click any card below</span>
          </template>
          <template v-else-if="p.hasStartingAction">
            <span class="starting-action-hand-banner">&#x23F8; Resolve starting action first</span>
          </template>
          <template v-else>Hand ({{ p.cardsInHand.length }})</template>
        </div>
        <!-- Discard mode: show all cards in a single flat row so all are visibly selectable -->
        <template v-if="p.waitingFor && p.waitingFor.type === 'select_card'">
          <div class="card-row">
            <card-view
              v-for="c in p.cardsInHand"
              :key="c.name"
              :card="c"
              @card-clicked="onCardClicked($event)"
            />
          </div>
        </template>
        <!-- Normal mode: split into Playable and Unavailable rows -->
        <template v-else>
          <!-- Row 1: playable / can-afford -->
          <div v-if="playableHand(p).length > 0" class="hand-row-label">Playable</div>
          <div v-if="playableHand(p).length > 0" class="card-row">
            <div v-for="c in playableHand(p)" :key="c.name" class="card-with-sell">
              <card-view :card="c" @card-clicked="onCardClicked($event)" />
              <button
                v-if="isMyTurn && phase === 'action'"
                class="sell-btn"
                title="Sell for 1 gold"
                @click.stop="onSellCard(c.name)"
              >&#x1F4B0; Sell</button>
            </div>
          </div>
          <!-- Row 2: requirements not met -->
          <div v-if="unavailableHand(p).length > 0" class="hand-row-label hand-row-label--dim">Unavailable</div>
          <div v-if="unavailableHand(p).length > 0" class="card-row">
            <div v-for="c in unavailableHand(p)" :key="c.name" class="card-with-sell">
              <card-view :card="c" @card-clicked="onCardClicked($event)" />
              <button
                v-if="isMyTurn && phase === 'action'"
                class="sell-btn"
                title="Sell for 1 gold"
                @click.stop="onSellCard(c.name)"
              >&#x1F4B0; Sell</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import CardView from './CardView.vue';
import { PlayerModel } from '../../common/models/PlayerModel';
import { getLockers, LockerApiData } from '../api';

export default Vue.extend({
  name: 'PlayerSidebar',
  components: { CardView },
  props: {
    players: { type: Array as PropType<PlayerModel[]>, required: true },
    viewerId: { type: String, default: '' },
    isMyTurn: { type: Boolean, default: false },
    phase: { type: String, default: '' },
  },
  data() {
    return {
      lockerMap: {} as Record<string, LockerApiData>,
    };
  },
  async mounted() {
    const lockers = await getLockers();
    const lm: Record<string, LockerApiData> = {};
    for (const r of lockers) lm[r.id] = r;
    this.lockerMap = lm;
  },
  methods: {
    formatId(id: string): string {
      return id
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    },
    lockerDataById(id: string): LockerApiData | undefined {
      return this.lockerMap[id];
    },
    lockerName(id: string): string {
      return this.lockerMap[id]?.name ?? this.formatId(id);
    },
    lockerInitials(id: string): string {
      return id.split('_').map((w: string) => w[0].toUpperCase()).join('').slice(0, 2);
    },
    abilityBadgeClass(type: string): string {
      switch (type) {
        case 'Passive':    return 'type-passive';
        case 'Heroic':
        case 'NAction':    return 'type-heroic';
        case 'Villainous':
        case 'CAction':    return 'type-villainous';
        case 'Instant':
        case 'SAction':    return 'type-instant';
        default:           return 'type-basic';
      }
    },
    parseLockerBonusPills(bonus: string): Array<{ text: string; cls: string }> {
      if (!bonus || bonus.toLowerCase() === 'n/a') return [];
      const clsMap: Record<string, string> = {
        SP: 'stat--sp', NP: 'stat--heroic', CP: 'stat--villainous',
        HP: 'stat--hp', HEALTH: 'stat--hp', GP: 'stat--gp', GOLD: 'stat--gold',
      };
      const pills: Array<{ text: string; cls: string }> = [];
      for (const part of bonus.split(/[,;]/)) {
        const t = part.trim();
        if (!t) continue;
        const goldM = t.match(/^([+-]?\d+)\s*gold$/i);
        if (goldM) { pills.push({ text: (parseInt(goldM[1]) > 0 ? '+' : '') + goldM[1] + 'G', cls: 'stat--gold' }); continue; }
        const statM = t.match(/^([+-]?\d+)\s*(SP|NP|CP|HP|HEALTH|GP|Card|Cards)$/i);
        if (statM) {
          const n = parseInt(statM[1]);
          const stat = statM[2].toUpperCase().replace('CARDS', 'Card').replace('CARD', 'Card');
          const cls = clsMap[stat.replace('Card', 'CARD')] || 'stat--sp';
          pills.push({ text: (n > 0 ? '+' : '') + n + ' ' + stat, cls });
          continue;
        }
        pills.push({ text: t, cls: 'stat--sp' });
      }
      return pills;
    },
    hpClass(p: PlayerModel): string {
      const ratio = p.hitPoints / p.maxHitPoints;
      if (ratio <= 0.25) return 'hp-critical';
      if (ratio <= 0.5) return 'hp-low';
      return 'hp-ok';
    },
    sortedHand(p: PlayerModel) {
      return [...p.cardsInHand].sort((a, b) => {
        if (a.isPlayable && !b.isPlayable) return -1;
        if (!a.isPlayable && b.isPlayable) return 1;
        return a.adjustedCost - b.adjustedCost;
      });
    },
    /** Row 1: requirements met (playable or just can't afford) — sorted playable-first then by cost. */
    playableHand(p: PlayerModel) {
      return [...p.cardsInHand]
        .filter(c => c.requirementsMet)
        .sort((a, b) => {
          if (a.isPlayable && !b.isPlayable) return -1;
          if (!a.isPlayable && b.isPlayable) return 1;
          return a.adjustedCost - b.adjustedCost;
        });
    },
    /** Row 2: non-cost requirements not met. */
    unavailableHand(p: PlayerModel) {
      return [...p.cardsInHand]
        .filter(c => !c.requirementsMet)
        .sort((a, b) => a.adjustedCost - b.adjustedCost);
    },
    onCardClicked(cardName: string): void {
      if (!this.isMyTurn || this.phase !== 'action') return;
      const myPlayer = this.players.find(p => p.id === this.viewerId);
      if (myPlayer?.hasStartingAction && (myPlayer?.pendingDrawKeepCount ?? 0) === 0) return;
      this.$emit('play-card', cardName);
    },
    onSellCard(cardName: string): void {
      if (!this.isMyTurn || this.phase !== 'action') return;
      this.$emit('sell-card', cardName);
    },
    onActionCardClicked(p: PlayerModel, cardName: string): void {
      if (p.id !== this.viewerId || !this.isMyTurn || this.phase !== 'action') return;
      if (this.isActionDisabled(p, { name: cardName } as any)) return;
      this.$emit('activate-action', cardName);
    },
    /** Strip the [N] / [C] tag from display, keep the hero/locker item name. */
    stripTag(name: string): string {
      return name.replace(/ \[N\]$/, ' (N)').replace(/ \[C\]$/, ' (C)');
    },
    /** True when a button should be fully disabled. */
    isActionDisabled(p: PlayerModel, c: { name: string }): boolean {
      if (p.id !== this.viewerId || !this.isMyTurn || this.phase !== 'action') return true;
      const isStarting = c.name.includes('(Starting Action)');
      if (isStarting) return false; // starting actions are always clickable
      if (p.hasStartingAction) return true; // must do starting action first
      return p.usedActionNames.includes(c.name);
    },
    /** CSS classes for an action button. */
    actionBtnClass(p: PlayerModel, c: { name: string }): Record<string, boolean> {
      const isStarting = c.name.includes('(Starting Action)');
      const isN = c.name.endsWith(' [N]');
      const isC = c.name.endsWith(' [C]');
      const canAct = p.id === this.viewerId && this.isMyTurn && this.phase === 'action';
      const used = p.usedActionNames.includes(c.name) || (!isStarting && p.hasStartingAction);
      const available = canAct && !used;
      return {
        'action-btn--starting': isStarting,
        'action-btn--n': isN,
        'action-btn--c': isC,
        'action-btn--available': available && !isN && !isC && !isStarting,
        'action-btn--available-n': available && isN,
        'action-btn--available-c': available && isC,
        'action-btn--available-start': available && isStarting,
        'action-btn--unavailable': !used && !canAct,
        'action-btn--used': used,
      };
    },
  },
});
</script>

<style scoped>
.sidebar {
  width: 440px;
  min-width: 440px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: #0f0f1f;
}
.player-panel {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.player-panel--active { border-color: #a78bfa; }
.player-panel--me { border-color: #4a88cc; }
.player-panel--active.player-panel--me { border-color: #a78bfa; }
.player-panel--dead { opacity: 0.4; }

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #13132a;
  border-bottom: 1px solid #333;
}
.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.panel-name {
  flex: 1;
  font-size: 13px;
  color: #e0e0e0;
}
.hero-badge {
  font-size: 10px;
  color: #f0c060;
  background: rgba(240,192,96,0.15);
  padding: 1px 5px;
  border-radius: 3px;
}
.locker-badge {
  font-size: 10px;
  color: #a0c8f0;
  background: rgba(160,200,240,0.12);
  border: 1px solid rgba(160,200,240,0.25);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
  cursor: default;
}
.turn-indicator {
  color: #a78bfa;
  font-size: 12px;
}

.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 8px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #13132a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  padding: 3px 6px;
  min-width: 38px;
}
.stat--wide {
  min-width: 80px;
  flex-direction: row;
  gap: 4px;
  align-items: center;
}
.stat-label {
  font-size: 9px;
  color: #888;
  text-transform: uppercase;
}
.stat-value {
  font-size: 13px;
  font-weight: bold;
  color: #e0e0e0;
}
.stat-value.gold { color: #f0c060; }
.stat-value.cool { color: #6068e0; }
.stat-value.nice { color: #e04040; }
.stat-value.locker { color: #a0c8f0; font-size: 10px; font-weight: normal; }
.hp-ok { color: #4caf50; }
.hp-low { color: #f39c12; }
.hp-critical { color: #e74c3c; }

.section {
  border-top: 1px solid #222;
  padding: 4px 8px 6px;
}
.section-label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.used-label {
  color: #e74c3c;
  font-size: 9px;
}
.card-row {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 4px;
  padding-bottom: 4px;
}
.card-with-sell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.sell-btn {
  font-size: 9px;
  padding: 1px 4px;
  background: #2a1a00;
  color: #f0c060;
  border: 1px solid #705010;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
}
.sell-btn:hover {
  background: #4a3000;
  border-color: #c08020;
}
.hand-row-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7a7aaa;
  padding: 4px 2px 1px;
}
.hand-row-label--dim {
  color: #555568;
}
/* action-list and action-btn used for OR-option buttons and hero action buttons */
.action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.action-btn {
  padding: 4px 10px;
  background: #1a1a3a;
  border: 1px solid #4a4a88;
  border-radius: 4px;
  color: #a0a0d0;
  font-size: 11px;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  cursor: not-allowed;
}
/* OR-option choice buttons (own player) */
.action-btn--mine {
  border-color: #a78bfa;
  color: #a78bfa;
  cursor: pointer;
}
.action-btn--mine:hover {
  background: #2a1a4a;
}
/* Hero action — ready to use */
.action-btn--available {
  border-color: #60d0a0;
  color: #60d0a0;
  cursor: pointer;
  opacity: 1;
}
.action-btn--available:hover {
  background: #102a1a;
}
/* Starting action — gold highlight */
.action-btn--available-start {
  border-color: #f0c060;
  color: #f0c060;
  cursor: pointer;
  opacity: 1;
  font-weight: bold;
}
.action-btn--available-start:hover { background: #2a1a00; }
/* NP action — blue/purple tint */
.action-btn--available-n {
  border-color: #6080e0;
  color: #a0b8ff;
  cursor: pointer;
  opacity: 1;
}
.action-btn--available-n:hover { background: #0a0a2a; }
/* CP action — red tint */
.action-btn--available-c {
  border-color: #e06050;
  color: #ffaaaa;
  cursor: pointer;
  opacity: 1;
}
.action-btn--available-c:hover { background: #2a0a0a; }
/* Hero action — visible but conditions not met (not your turn / wrong phase) */
.action-btn--unavailable {
  opacity: 0.45;
  cursor: default;
}
/* Hero action — already used this night */
.action-btn--used {
  opacity: 0.18;
  cursor: default;
  pointer-events: none;
}
/* Starting action required banner */
.starting-banner {
  color: #f0c060;
  font-size: 9px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
  margin-left: 4px;
}
/* Action/passive card wrappers */
.ability-card-wrap {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}
.ability-card-wrap--passive {
  cursor: default;
  pointer-events: none;
}
.ability-card-wrap--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ability-card-wrap--disabled ::v-deep .card {
  pointer-events: none;
}
/* Discard mode banner in hand section */
.discard-banner {
  color: #e74c3c;
  font-size: 11px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
}
/* Starting action required — hand is locked */
.starting-action-hand-banner {
  color: #f39c12;
  font-size: 11px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
}
/* Draw-keep selection banner */
.draw-keep-banner {
  color: #2ecc71;
  font-size: 11px;
  font-weight: bold;
  text-transform: none;
  letter-spacing: 0;
}
/* Passive bar */
.passive-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.passive-tag {
  font-size: 10px;
  color: #b0b0e0;
  background: rgba(160,160,255,0.10);
  border: 1px solid rgba(160,160,255,0.22);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  cursor: default;
}
/* Locker item / OR-option choice banner */
.choice-banner {
  color: #f0c060;
  text-transform: none;
  font-weight: bold;
  letter-spacing: 0;
  font-size: 11px;
}

/* Locker card picker (Open Locker) */
.locker-option-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.option-card {
  background: #1e2640;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.option-card:hover {
  border-color: #a78bfa;
  background: #252a44;
}
.option-card--locker { border-left: 3px solid #50a050; }
.card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.option-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
}
.locker-icon { background: rgba(80,160,80,0.3); color: #90d090; }
.card-title-block { flex: 1; min-width: 0; }
.card-name {
  font-size: 12px;
  font-weight: bold;
  color: #e0e0e0;
  margin-bottom: 2px;
}
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 2px;
}
.stat {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: bold;
}
.stat--gold  { background: rgba(240,192,60,0.2); color: #f0c060; }
.stat--sp    { background: rgba(100,180,255,0.2); color: #7ac0ff; }
.stat--heroic    { background: rgba(100,200,100,0.2); color: #80d080; }
.stat--villainous { background: rgba(200,100,200,0.2); color: #d080d0; }
.stat--hp    { background: rgba(255,100,100,0.2); color: #ff8080; }
.stat--gp    { background: rgba(240,192,60,0.2); color: #f0c060; }
.ability-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
}
.ability-line {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 11px;
  color: #c0c0d0;
}
.ability-badge {
  min-width: 14px;
  height: 14px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 1px;
}
.type-passive    { background: rgba(100,180,255,0.3); color: #7ac0ff; }
.type-heroic     { background: rgba(100,200,100,0.3); color: #80d080; }
.type-villainous { background: rgba(200,100,200,0.3); color: #d080d0; }
.type-instant    { background: rgba(255,200,50,0.3);  color: #f0c060; }
.type-basic      { background: rgba(180,180,180,0.2); color: #b0b0b0; }
</style>
