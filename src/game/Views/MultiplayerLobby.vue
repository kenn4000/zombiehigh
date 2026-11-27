<template>
  <main class="lobby">
    <h1 class="title">🧟 Zombie High</h1>
    <section v-if="!room" class="card">
      <h2>Front Desk</h2>
      <label>Player name <input v-model.trim="name" maxlength="32" placeholder="Your name"></label>
      <div class="actions">
        <button :disabled="busy || !name" @click="create(false)">Play vs CPU</button>
        <button :disabled="busy || !name" @click="create(true)">Host game</button>
      </div>
      <h2>Join a game</h2>
      <div class="actions"><input v-model.trim="code" maxlength="8" placeholder="Room code" @keyup.enter="join(code)"><button :disabled="busy || !name || !code" @click="join(code)">Join</button></div>
      <h2>Public lobbies <button class="small" @click="list">Refresh</button></h2>
      <p v-if="!publicRooms.length">No open public lobbies.</p>
      <div class="seat" v-for="entry in publicRooms" :key="entry.code"><span>{{ entry.host }} · {{ entry.humans }} human / {{ entry.bots }} CPU</span><button :disabled="busy || !name" @click="join(entry.code)">Join</button></div>
      <button v-if="saved" @click="resume">Reconnect to last lobby</button>
    </section>
    <section v-else class="card">
      <h2>Waiting room <span class="code">{{ room.code }}</span></h2>
      <p>Share the room code, not a player link. Everyone joins from the Front Desk on the same server.</p>
      <div class="seat" v-for="p in room.members" :key="p.name">
        <span><span class="dot" :style="{background:p.color}"></span>{{ p.name }}{{p.you?' (you)':''}}{{p.host?' · Host':''}}</span>
        <span>{{ !p.connected ? 'Disconnected' : p.host || p.ready ? 'Ready' : 'Not ready' }}</span>
      </div>
      <div class="seat" v-for="n in room.bots" :key="'cpu'+n"><span>CPU {{n}}</span><span>{{room.difficulty}} · Ready</span></div>
      <div class="seat empty" v-for="n in 5-room.members.length-room.bots" :key="'empty'+n">Open slot</div>
      <label>Player color <select :value="me?.color" @change="update({color: inputValue($event)})"><option v-for="c in colors" :key="c" :disabled="room.members.some(p=>!p.you && p.color===c)">{{c}}</option></select></label>
      <template v-if="room.host">
        <label>CPU opponents <select :value="room.bots" @change="update({bots:Number(inputValue($event))})"><option v-for="n in 6-room.members.length" :value="n-1" :key="n">{{n-1}}</option></select></label>
        <label>CPU difficulty <select :value="room.difficulty" @change="update({difficulty:inputValue($event)})"><option>easy</option><option>normal</option><option>hard</option></select></label>
        <label><input type="checkbox" :checked="room.firstCardFreeNightDraft" @change="update({firstCardFreeNightDraft:checked($event)})"> First card of each nightly draft is free</label>
        <label><input type="checkbox" :checked="room.reshuffleDeck" @change="update({reshuffleDeck:checked($event)})"> Reshuffle deck when empty</label>
        <label><input type="checkbox" :checked="room.public" @change="update({public:checked($event)})"> List in public lobbies</label>
      </template>
      <p v-else>Host settings: {{room.bots}} CPU · {{room.difficulty}} · Free first card: {{room.firstCardFreeNightDraft?'yes':'no'}} · Reshuffle: {{room.reshuffleDeck?'yes':'no'}}</p>
      <div class="actions">
        <button v-if="room.host" :disabled="busy || !canStart" @click="start">Start game</button>
        <button v-else :disabled="busy" @click="update({ready:!me?.ready})">{{me?.ready?'Not ready':'Ready up'}}</button>
        <button :disabled="busy" @click="leave">Leave lobby</button>
      </div>
    </section>
    <p v-if="error" class="error" role="alert">{{error}}</p>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
type Member = {name:string;color:string;ready:boolean;host:boolean;you:boolean;connected:boolean};
type Room = {code:string;host:boolean;members:Member[];bots:number;difficulty:string;firstCardFreeNightDraft:boolean;reshuffleDeck:boolean;public:boolean;started:boolean};
type Session = {code:string;token:string};
type Listed = {code:string;host:string;humans:number;bots:number};
const colors = ['red','blue','green','yellow','cyan','magenta','orange','purple'];
const key = 'zgh-lobby-session';
const name = ref(localStorage.getItem('zgh-player-name') || '');
const code = ref(''); const room = ref<Room|null>(null); const busy = ref(false); const error = ref('');
const publicRooms = ref<Listed[]>([]); const saved = ref<Session|null>(null);
let active: Session|null = null; let timer: ReturnType<typeof setInterval>|undefined; let entering=false; let polling=false;
try { saved.value = JSON.parse(sessionStorage.getItem(key)||'null'); } catch {}
const me = computed(()=>room.value?.members.find(p=>p.you));
const canStart = computed(()=>!!room.value && room.value.members.length+room.value.bots>=2 && room.value.members.every(p=>p.host || (p.ready && p.connected)));
function inputValue(e:Event) { return (e.target as HTMLInputElement).value; }
function checked(e:Event) { return (e.target as HTMLInputElement).checked; }
async function request<T>(path:string, body?:unknown, session?:Session):Promise<T>{
  const headers: Record<string,string> = {};
  if (body!==undefined) headers['Content-Type']='application/json';
  if (session) headers.Authorization='Bearer '+session.token;
  const r=await fetch('/api/lobbies'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data=await r.json(); if(!r.ok) throw new Error(data.error||'Connection failed'); return data;
}
function remember(session:Session) { active=session; saved.value=session; sessionStorage.setItem(key,JSON.stringify(session)); localStorage.setItem('zgh-player-name',name.value); }
async function run(fn:()=>Promise<void>){ if(busy.value)return; busy.value=true;error.value='';try{await fn();}catch(e){error.value=String(e instanceof Error?e.message:e);}finally{busy.value=false;} }
async function create(host:boolean){await run(async()=>{const result=await request<{token:string;room:Room}>('',{name:name.value,public:false});remember({code:result.room.code,token:result.token});room.value=result.room;if(!host)room.value=await request<Room>('/'+active!.code+'/update',{bots:1},active!);});}
async function join(value:string){await run(async()=>{const result=await request<{token:string;room:Room}>('/'+encodeURIComponent(value.toUpperCase())+'/join',{name:name.value});remember({code:result.room.code,token:result.token});room.value=result.room;});}
async function update(body:object){await run(async()=>{if(active)room.value=await request<Room>('/'+active.code+'/update',body,active);});}
async function start(){await run(async()=>{if(active){room.value=await request<Room>('/'+active.code+'/start',{},active);await enter();}});}
async function enter(){if(!active||entering)return;entering=true;try{const result=await request<{url:string}>('/'+active.code+'/enter',{},active);window.location.assign(result.url);}catch(e){entering=false;throw e;}}
async function poll(){if(!active||busy.value||entering||polling)return;polling=true;const session=active;try{const result=await request<Room>('/'+session.code,undefined,session);if(active!==session||busy.value)return;room.value=result;error.value='';if(result.started)await enter();}catch(e){error.value='Lobby connection: '+(e instanceof Error?e.message:String(e));}finally{polling=false;}}
async function resume(){if(!saved.value)return;await run(async()=>{active=saved.value;room.value=await request<Room>('/'+active.code,undefined,active);if(room.value.started)await enter();});}
async function leave(){await run(async()=>{if(active)await request('/'+active.code+'/leave',{},active);active=null;room.value=null;saved.value=null;sessionStorage.removeItem(key);await list();});}
async function list(){try{publicRooms.value=(await request<{rooms:Listed[]}>('')).rooms;}catch(e){error.value='Could not reach lobby server';}}
onMounted(()=>{void list();timer=setInterval(()=>{if(active)void poll();else if(!busy.value)void list();},2000);});
onUnmounted(()=>{if(timer)clearInterval(timer);});
</script>
<style scoped>
.lobby{max-width:680px;margin:40px auto;padding:0 16px;color:#e0e0e0}.title{text-align:center;color:#e74c3c;font-size:2.8rem;letter-spacing:2px}.card{background:#1e1e2e;border:1px solid #444;border-radius:12px;padding:24px}.card h2{font-size:1.2rem;margin:20px 0 12px;color:#ccc}.actions,.seat{display:flex;gap:10px;align-items:center;margin:10px 0}.seat{justify-content:space-between;border:1px solid #444;border-radius:6px;padding:12px}.empty{color:#888;border-style:dashed}.dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:8px}.code{font-family:monospace;color:#a78bfa;letter-spacing:2px}label{display:flex;align-items:center;gap:10px;margin:12px 0;justify-content:space-between}input,select,button{background:#12122a;color:#eee;border:1px solid #555;border-radius:6px;padding:8px 12px;font:inherit}button{cursor:pointer;color:#c4b5fd;border-color:#a78bfa;background:#2d2d5e}button:disabled{opacity:.45;cursor:not-allowed}.small{font-size:.8rem;padding:4px 8px}.error{color:#ff8a80}input[type=checkbox]{accent-color:#a78bfa}
</style>
