import { randomBytes } from 'crypto';
import type { Express, Request, Response } from 'express';

const colors = ['red','blue','green','yellow','cyan','magenta','orange','purple'];
type Member = { token: string; name: string; color: string; ready: boolean; seen: number; playerId?: string };
type Room = { code: string; host: string; members: Member[]; bots: number; difficulty: 'easy'|'normal'|'hard'; firstCardFreeNightDraft: boolean; reshuffleDeck: boolean; public: boolean; gameId?: string };
type Launch = (room: Room) => { gameId: string; playerIds: string[] };
const rooms = new Map<string, Room>();
const matches = new Map<string, Room>();
const now = () => Date.now();
const token = () => randomBytes(32).toString('hex');
const nameOf = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 32) : '';
const cookieKey = (id: string) => 'zgh_match_' + id;
function cookieValue(header: string | undefined, key: string) {
  return (header || '').split(';').map(s => s.trim()).find(s => s.startsWith(key + '='))?.slice(key.length + 1);
}
export function matchMember(gameId: string, cookie: string | undefined) {
  const room = matches.get(gameId);
  if (!room) return undefined;
  const value = cookieValue(cookie, cookieKey(gameId));
  return room.members.find(m => m.token === value);
}
export function isLobbyMatch(gameId: string) { return matches.has(gameId); }
function prune() {
  for (const [code, room] of rooms) {
    if (room.gameId) continue;
    room.members = room.members.filter(m => now() - m.seen < 90000);
    if (!room.members.length) { rooms.delete(code); continue; }
    if (!room.members.some(m => m.token === room.host)) room.host = room.members[0].token;
  }
}
function view(room: Room, member: Member) {
  return { code: room.code, host: room.host === member.token, you: member.name,
    members: room.members.map(m => ({ name: m.name, color: m.color, ready: m.ready, host: m.token === room.host, you: m === member, connected: now() - m.seen < 12000 })),
    bots: room.bots, difficulty: room.difficulty, firstCardFreeNightDraft: room.firstCardFreeNightDraft,
    reshuffleDeck: room.reshuffleDeck, public: room.public, started: !!room.gameId };
}
function roomFor(req: Request, res: Response) {
  prune();
  const room = rooms.get(String(req.params.code).toUpperCase());
  const member = room?.members.find(m => 'Bearer ' + m.token === req.get('authorization'));
  if (!room || !member) { res.status(401).json({ error: 'Lobby membership expired or invalid' }); return; }
  member.seen = now();
  return { room, member };
}
function addMember(room: Room, name: string) {
  const member: Member = { token: token(), name, color: colors.find(c => !room.members.some(m => m.color === c))!, ready: false, seen: now() };
  room.members.push(member); return member;
}
export function installLobbyRoutes(app: Express, launch: Launch) {
  app.get('/api/lobbies', (_req, res) => {
    prune();
    res.json({ rooms: [...rooms.values()].filter(r => r.public && !r.gameId && r.members.length + r.bots < 5)
      .map(r => ({ code: r.code, host: r.members.find(m => m.token === r.host)?.name, humans: r.members.length, bots: r.bots })) });
  });
  app.post('/api/lobbies', (req, res) => {
    prune();
    const name = nameOf(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Enter a player name' });
    if (rooms.size >= 1000) return res.status(503).json({ error: 'Server lobby capacity reached' });
    let code: string; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (rooms.has(code));
    const room: Room = { code, host: '', members: [], bots: 0, difficulty: 'normal', firstCardFreeNightDraft: false, reshuffleDeck: true, public: req.body?.public === true };
    const member = addMember(room, name);
    room.host = member.token; rooms.set(code, room);
    res.json({ token: member.token, room: view(room, member) });
  });
  app.post('/api/lobbies/:code/join', (req, res) => {
    prune();
    const room = rooms.get(String(req.params.code).toUpperCase());
    const name = nameOf(req.body?.name);
    if (!room || room.gameId) return res.status(404).json({ error: 'Lobby not found or already started' });
    if (!name || room.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: 'Choose a unique player name' });
    if (room.members.length + room.bots >= 5) return res.status(409).json({ error: 'Lobby full' });
    const member = addMember(room, name);
    res.json({ token: member.token, room: view(room, member) });
  });
  app.get('/api/lobbies/:code', (req, res) => {
    const auth = roomFor(req, res); if (!auth) return;
    res.set('Cache-Control', 'no-store').json(view(auth.room, auth.member));
  });
  app.post('/api/lobbies/:code/update', (req, res) => {
    const auth = roomFor(req, res); if (!auth) return;
    const { room, member } = auth; const body = req.body ?? {};
    if (room.gameId) return res.status(409).json({ error: 'Game already started' });
    if (typeof body.ready === 'boolean') member.ready = body.ready;
    if (colors.includes(body.color) && !room.members.some(m => m !== member && m.color === body.color)) member.color = body.color;
    if (member.token === room.host) {
      if (Number.isInteger(body.bots)) room.bots = Math.max(0, Math.min(5-room.members.length, body.bots));
      if (['easy','normal','hard'].includes(body.difficulty)) room.difficulty = body.difficulty;
      if (typeof body.firstCardFreeNightDraft === 'boolean') room.firstCardFreeNightDraft = body.firstCardFreeNightDraft;
      if (typeof body.reshuffleDeck === 'boolean') room.reshuffleDeck = body.reshuffleDeck;
      if (typeof body.public === 'boolean') room.public = body.public;
    }
    res.json(view(room, member));
  });
  app.post('/api/lobbies/:code/leave', (req, res) => {
    const auth = roomFor(req, res); if (!auth) return;
    const { room, member } = auth;
    if (room.gameId) return res.status(409).json({ error: 'Game already started' });
    room.members = room.members.filter(m => m !== member);
    if (!room.members.length) rooms.delete(room.code);
    else if (room.host === member.token) room.host = room.members[0].token;
    res.json({ ok: true });
  });
  app.post('/api/lobbies/:code/start', (req, res) => {
    const auth = roomFor(req, res); if (!auth) return;
    const { room, member } = auth;
    if (room.host !== member.token) return res.status(403).json({ error: 'Only the host can start' });
    if (room.gameId) return res.json(view(room, member));
    if (room.members.length + room.bots < 2 || room.members.some(m => m !== member && (!m.ready || now()-m.seen >= 12000))) return res.status(409).json({ error: 'Need at least two players and all guests connected and ready' });
    try {
      const match = launch(room); room.gameId = match.gameId;
      room.members.forEach((m,i) => { m.playerId = match.playerIds[i]; });
      matches.set(match.gameId, room);
      res.json(view(room, member));
    } catch (e) { console.error('Lobby launch failed', e); res.status(500).json({ error: 'Could not start game' }); }
  });
  app.post('/api/lobbies/:code/enter', (req, res) => {
    const auth = roomFor(req, res); if (!auth) return;
    const { room, member } = auth;
    if (!room.gameId || !member.playerId) return res.status(409).json({ error: 'Game has not started' });
    res.cookie(cookieKey(room.gameId), member.token, { httpOnly: true, sameSite: 'strict', secure: req.secure || req.get('x-forwarded-proto') === 'https', path: '/' });
    res.set('Cache-Control', 'no-store').json({ url: '/game/' + room.gameId + '?playerId=' + member.playerId + '&fresh=1' });
  });
  // Existing legacy test games keep their original behavior. Lobby matches
  // require the private membership cookie for reads and for every game action.
  app.use('/api/game', (req, res, next) => {
    const id = req.path === '/current' ? String(req.query.gameId || '') : req.path.split('/')[1];
    if (!id || !isLobbyMatch(id)) return next();
    const member = matchMember(id, req.headers.cookie);
    if (!member || (req.method !== 'GET' && req.body?.playerId !== member.playerId)) return res.status(403).json({ error: 'Not authorized for this player' });
    next();
  });
}
