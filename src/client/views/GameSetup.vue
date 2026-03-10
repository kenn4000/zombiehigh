<template>
  <div class="game-setup">
    <div class="setup-title">Setup Phase — Choose Your Hero, Locker Item &amp; Starting Cards</div>

    <!-- Hero selection -->
    <div class="setup-section">
      <div class="setup-section-label">Choose Hero</div>
      <div class="option-grid">
        <div
          v-for="heroId in player.setupHeroOptionIds"
          :key="heroId"
          class="option-card option-card--hero"
          :class="{ 'option-card--selected': player.selectedHeroId === heroId }"
          @click="$emit('select-hero', heroId)"
        >
          <div class="card-header">
            <div class="option-icon">{{ heroInitials(heroId) }}</div>
            <div class="card-title-block">
              <div class="card-name">{{ heroName(heroId) }}</div>
              <div v-if="heroData(heroId)" class="stat-row">
                <span class="stat stat--hp">{{ heroData(heroId).initHealth }} HP</span>
                <span class="stat stat--gold">{{ heroData(heroId).startGold }}G</span>
                <span class="stat stat--sp">{{ heroData(heroId).startSP }} SP</span>
                <span v-if="heroData(heroId).startGP > 0" class="stat stat--gp">+{{ heroData(heroId).startGP }} GP</span>
              </div>
            </div>
          </div>
          <div v-if="heroData(heroId) && heroData(heroId).startingAction && heroData(heroId).startingAction !== 'None'" class="ability-list">
            <div class="ability-line">
              <span class="ability-badge type-instant">I</span>
              <span>{{ heroData(heroId).startingAction }}</span>
            </div>
          </div>
          <div v-if="heroData(heroId) && heroData(heroId).abilities && heroData(heroId).abilities.length" class="ability-list">
            <div v-for="(ab, i) in heroData(heroId).abilities" :key="i" class="ability-line">
              <span class="ability-badge" :class="abilityBadgeClass(ab.type)">{{ ab.type.charAt(0) }}</span>
              <span>{{ ab.effect }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Locker item selection -->
    <div class="setup-section">
      <div class="setup-section-label">Choose 2 Locker Items</div>
      <div class="option-grid">
        <div
          v-for="lockerId in player.setupLockerOptionIds"
          :key="lockerId"
          class="option-card option-card--locker"
          :class="{ 'option-card--selected': player.selectedLockerIds.includes(lockerId) }"
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

    <!-- Starting card selection -->
    <div class="setup-section">
      <div class="setup-section-label">
        Choose Starting Cards
        <span class="cost-preview" :class="goldOk ? 'cost-ok' : 'cost-over'">
          Cost: {{ totalStartingCost }} gold (have {{ potentialGold }})
        </span>
      </div>
      <div class="card-option-row">
        <card-view
          v-for="c in player.setupCardOptions"
          :key="c.name"
          :card="c"
          :selected="isStartingCardSelected(c.name)"
          @card-clicked="$emit('toggle-starting-card', $event)"
        />
      </div>
    </div>

    <!-- Confirm button -->
    <div class="setup-actions">
      <div v-if="player.setupConfirmed" class="confirmed-badge">Ready — waiting for others...</div>
      <button
        v-else
        class="btn-confirm"
        :disabled="!canConfirm"
        @click="$emit('confirm-setup')"
      >
        Confirm Selection
      </button>
      <button
        v-if="allConfirmed"
        class="btn-start"
        @click="$emit('start-game')"
      >
        Start Game!
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import CardView from '../components/CardView.vue';
import { PlayerModel } from '../../common/models/PlayerModel';
import { getHeroes, getLockers, HeroApiData, LockerApiData } from '../api';

export default Vue.extend({
  name: 'GameSetup',
  components: { CardView },
  props: {
    player: { type: Object as PropType<PlayerModel>, required: true },
    allPlayers: { type: Array as PropType<PlayerModel[]>, required: true },
  },
  data() {
    return {
      heroMap: {} as Record<string, HeroApiData>,
      lockerMap: {} as Record<string, LockerApiData>,
    };
  },
  computed: {
    totalStartingCost(): number {
      return this.player.heroStartingCardsFree ? 0 : this.player.selectedStartingCards.length * 4;
    },
    potentialGold(): number {
      const hero = this.player.selectedHeroId ? this.heroMap[this.player.selectedHeroId] : undefined;
      const lockerGold = this.player.selectedLockerIds.reduce((sum, id) => sum + (this.lockerMap[id]?.bonusGold ?? 0), 0);
      return (hero?.startGold ?? 0) + lockerGold;
    },
    goldOk(): boolean {
      return this.potentialGold >= (this.totalStartingCost as number);
    },
    canConfirm(): boolean {
      return !!(this.player.selectedHeroId && this.player.selectedLockerIds.length === 2);
    },
    allConfirmed(): boolean {
      return this.allPlayers.every(p => p.setupConfirmed);
    },
  },
  async created() {
    const [heroes, lockers] = await Promise.all([getHeroes(), getLockers()]);
    const hm: Record<string, HeroApiData> = {};
    for (const h of heroes) hm[h.id] = h;
    this.heroMap = hm;
    const lm: Record<string, LockerApiData> = {};
    for (const r of lockers) lm[r.id] = r;
    this.lockerMap = lm;
  },
  methods: {
    formatId(id: string): string {
      return id.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    },
    heroInitials(id: string): string {
      return id.split('_').map((w: string) => w[0].toUpperCase()).join('').slice(0, 2);
    },
    lockerInitials(id: string): string {
      return id.split('_').map((w: string) => w[0].toUpperCase()).join('').slice(0, 2);
    },
    heroData(id: string): HeroApiData | undefined {
      return this.heroMap[id];
    },
    heroName(id: string): string {
      return this.heroMap[id]?.name ?? this.formatId(id);
    },
    lockerDataById(id: string): LockerApiData | undefined {
      return this.lockerMap[id];
    },
    lockerName(id: string): string {
      return this.lockerMap[id]?.name ?? this.formatId(id);
    },
    isStartingCardSelected(name: string): boolean {
      return this.player.selectedStartingCards.some(c => c.name === name);
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
        case 'Action':
        default:           return 'type-basic';
      }
    },
    lockerBonusClass(bonus: string): string {
      if (!bonus) return 'stat--sp';
      const b = bonus.toUpperCase();
      if (b.includes('HP') || b.includes('HEALTH')) return 'stat--heroic';
      if (b.includes('VP')) return 'stat--villainous';
      return 'stat--sp';
    },
    parseLockerBonusPills(bonus: string): Array<{ text: string; cls: string }> {
      if (!bonus || bonus.toLowerCase() === 'n/a') return [];
      const clsMap: Record<string, string> = {
        SP: 'stat--sp', NP: 'stat--heroic', CP: 'stat--villainous',
        HP: 'stat--hp', HEALTH: 'stat--hp',
        GP: 'stat--gp', GOLD: 'stat--gold',
      };
      const pills: Array<{ text: string; cls: string }> = [];
      for (const part of bonus.split(/[,;]/)) {
        const t = part.trim();
        if (!t) continue;
        // "N gold"
        const goldM = t.match(/^([+-]?\d+)\s*gold$/i);
        if (goldM) { pills.push({ text: (parseInt(goldM[1]) > 0 ? '+' : '') + goldM[1] + 'G', cls: 'stat--gold' }); continue; }
        // "N STAT" or "-N STAT"
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
  },
});
</script>

<style scoped>
.game-setup {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
  color: #e0e0e0;
}
.setup-title {
  font-size: 16px;
  font-weight: bold;
  color: #a78bfa;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
}
.setup-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.setup-section-label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 10px;
}
.cost-preview {
  font-size: 12px;
  font-style: italic;
}
.cost-ok { color: #4caf50; }
.cost-over { color: #e74c3c; }

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Shared card base */
.option-card {
  background: #1e1e2e;
  border: 2px solid #444;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 220px;
  transition: border-color 0.15s, background 0.15s;
}
.option-card:hover { background: #252540; border-color: #6a6aaa; }
.option-card--selected { border-color: #a78bfa; background: #2a1e4e; }
/* Hero cards: purple accent; Locker item cards: green accent */
.option-card--hero  { border-left: 3px solid #9060d0; }
.option-card--locker { border-left: 3px solid #50a050; }

/* Card header: icon + name/stats */
.card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.option-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #2a2a4a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 13px;
  color: #c0a0f0;
  flex-shrink: 0;
}
.locker-icon {
  background: #2a3a2a;
  color: #80c080;
}
.card-title-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.card-name {
  font-size: 13px;
  font-weight: bold;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Stat pills */
.stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.stat {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: bold;
}
.stat--hp      { background: #1e3a1e; color: #60c090; }
.stat--heroic   { background: #3a1818; color: #e06060; }
.stat--villainous { background: #1a1a3a; color: #6060e0; }
.stat--gold    { background: #3a3010; color: #d4a520; }
.stat--sp      { background: #e0e0e0; color: #111111; }
.stat--gp      { background: #1e3a1e; color: #70c070; }

/* Ability list */
.ability-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-top: 1px solid #333;
  padding-top: 5px;
}
.ability-line {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  font-size: 10px;
  color: #bbb;
  line-height: 1.3;
}
.ability-badge {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  margin-top: 1px;
}
.type-passive   { background: #2a0a4a; color: #c060e8; }
.type-heroic    { background: #3a1010; color: #e06060; }
.type-villainous { background: #10103a; color: #6068e0; }
.type-basic     { background: #2a2a2a; color: #c0c0c0; }
.type-instant   { background: #1a3a1a; color: #60c060; }

.card-option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.setup-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #333;
}
.btn-confirm {
  padding: 10px 24px;
  background: #2a2a6a;
  border: 1px solid #a78bfa;
  color: #a78bfa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.btn-confirm:hover:not(:disabled) { background: #3a3a8a; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
.confirmed-badge {
  color: #4caf50;
  font-size: 13px;
}
.btn-start {
  padding: 10px 24px;
  background: #1f3d1f;
  border: 1px solid #4caf50;
  color: #4caf50;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.btn-start:hover { background: #2a5a2a; }
</style>
