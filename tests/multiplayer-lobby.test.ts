import { strict as assert } from 'node:assert';
import { server, unregisterGameRuntime } from '../src/server/server';
import WebSocket from 'ws';

describe('multiplayer lobby connection', function () {
  this.timeout(15000);
  let origin: string;
  let owned = false;
  let gameId: string | undefined;
  before(async () => {
    if (!server.listening) {
      await new Promise<void>((resolve,reject) => {
        server.once('error',reject);
        server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});
      });
      owned = true;
    }
    const a = server.address();
    assert(a && typeof a !== 'string');
    origin = 'http://127.0.0.1:' + a.port;
  });
  after(async () => {
    if (gameId) unregisterGameRuntime(gameId);
    if (owned) await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections?.();});
  });
  async function call(route:string, body?:unknown, token?:string, cookie?:string) {
    const headers:Record<string,string> = {};
    if (body !== undefined) headers['Content-Type']='application/json';
    if (token) headers.Authorization='Bearer '+token;
    if (cookie) headers.Cookie=cookie;
    const res=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  it('hosts, joins, readies, starts and privately enters two player seats', async () => {
    const host=await call('/api/lobbies',{name:'Lobby Host',public:true});
    assert.equal(host.status,200);
    const code=host.data.room.code;
    const base='/api/lobbies/'+code;
    const h=host.data.token;
    const listed=await call('/api/lobbies');
    assert(listed.data.rooms.some((r:any)=>r.code===code));
    const guest=await call(base+'/join',{name:'Lobby Guest'});
    assert.equal(guest.status,200);
    const g=guest.data.token;
    assert.notEqual(h,g);
    assert.equal((await call(base)).status,401);
    assert.equal((await call(base+'/start',{},g)).status,403);
    assert.equal((await call(base+'/start',{},h)).status,409);
    const guestUpdate=await call(base+'/update',{ready:true,bots:3},g);
    assert.equal(guestUpdate.data.bots,0);
    assert.equal((await call(base+'/update',{bots:1,difficulty:'hard'},h)).data.bots,1);
    const started=await call(base+'/start',{},h);
    assert.equal(started.status,200);
    assert.equal(started.data.started,true);
    const a=await call(base+'/enter',{},h), b=await call(base+'/enter',{},g);
    assert.equal(a.status,200);assert.equal(b.status,200);
    assert(a.cookie && b.cookie);
    const urlA=new URL(a.data.url,origin),urlB=new URL(b.data.url,origin);
    gameId=urlA.pathname.split('/')[2];
    const pA=urlA.searchParams.get('playerId'),pB=urlB.searchParams.get('playerId');
    assert.equal(urlA.pathname,urlB.pathname);assert.notEqual(pA,pB);
    assert.equal((await call('/api/game/'+gameId+'/state')).status,403);
    assert.equal((await call('/api/game/'+gameId+'/state',undefined,undefined,a.cookie)).status,200);
    assert.equal((await call('/api/game/'+gameId+'/action',{playerId:pB,actionId:'anything'},undefined,a.cookie)).status,403);
    const wsUrl=origin.replace('http:','ws:')+'/game-ws?gameId='+gameId+'&playerId='+pB;
    const socket=new WebSocket(wsUrl,{headers:{Cookie:b.cookie}});
    try {
      const message=await new Promise<any>((resolve,reject)=>{socket.once('message',data=>resolve(JSON.parse(data.toString())));socket.once('error',reject);});
      assert.equal(message.type,'gameState');
      assert(message.game);
    } finally { socket.terminate(); }
    assert.equal((await call(base+'/join',{name:'Late Guest'})).status,404);
  });
});
