import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CHARACTERS, DRILL_NAMES } from '../shared/characters.js';
import { DIFFICULTY_IDS, MAX_PLAYERS, MAX_REWIND, rankFor, rateMatch } from '../shared/constants.js';
import { COMBAT_MAPS } from '../shared/maps.js';
import { MODES, getMode, QUICK_CHAT } from '../shared/modes.js';
import { STRINGS } from '../shared/strings.js';
import { computeRewards } from '../shared/progression.js';
import {
  consumeEvents, createMatch, endMatch, historyPose, publicPlayer, setInput, stepMatch, summarize,
} from '../shared/sim/match.js';
import { inputAge, rewindSeconds, sanitizeInput, sanitizeLoadout, sanitizeName, sanitizeReport, sanitizeRules } from './guard.js';
import {
  accountFor, addReport, allAccounts, audit, closeReport, findAccountByName, leaderboard, listAudit, listReports, noteAbandon, saveAccount,
} from './store.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_KEY = process.env.VECTORBREAK_ADMIN_KEY || 'lattice-desk';
const TICK = 1 / 60;
const SNAP_MS = 50;

const rooms = new Map();
const sockets = new Set();
let seq = 1;

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function modeAllowed(id) {
  return MODES.some((m) => m.id === id && !m.practice);
}

function mapAllowed(id) {
  return COMBAT_MAPS.some((m) => m.id === id);
}

function slim(p) {
  const row = publicPlayer(p, true);
  row.weaponSlot = p.weaponSlot || 0;
  row.weapons = (p.weapons || []).map((w) => ({ defId: w.defId, mag: w.mag }));
  row.mag = p.weapons?.[p.weaponSlot || 0]?.mag ?? 0;
  return row;
}

function worldSnap(match, events) {
  return {
    type: 'snap',
    tick: match.tick,
    time: match.time,
    phase: match.phase,
    timeLeft: match.timeLeft,
    modeId: match.modeId,
    teamScore: match.teamScore,
    players: match.players.filter((p) => !p.isDecoy).map(slim),
    objectives: (match.objectives || []).map((o) => ({
      id: o.id, x: o.x, y: o.y || 0, z: o.z, radius: o.radius, owner: o.owner, active: o.active, progress: o.progress,
    })),
    deployables: (match.deployables || []).filter((d) => !d.dead).map((d) => ({
      id: d.id, kind: d.kind, x: d.x, y: d.y, z: d.z, team: d.team, radius: d.radius,
      box: d.box ? { min: d.box.min, max: d.box.max } : null,
    })),
    cores: match.cores ? Object.values(match.cores).map((c) => ({ team: c.team, x: c.x, y: c.y, z: c.z })) : [],
    projectiles: (match.projectiles || []).slice(0, 24).map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, color: p.color })),
    events: events.filter((e) => ['shot', 'tracer', 'impact', 'hit', 'kill', 'announce', 'explode', 'dry', 'melee', 'ability', 'ultimate', 'pad'].includes(e.type)).slice(-32),
  };
}

function browserList() {
  return [...rooms.values()].filter((r) => !r.done).slice(0, 24).map((r) => ({
    id: r.id,
    modeId: r.modeId,
    mapId: r.mapId,
    players: r.clients.length,
    capacity: r.capacity,
    phase: r.match?.phase || 'queue',
    code: r.code || null,
    joinable: !r.started && r.clients.length < r.capacity,
  }));
}

function detach(client, { abandon = false } = {}) {
  const room = client.room;
  if (!room) return;
  room.clients = room.clients.filter((c) => c !== client);
  client.room = null;
  if (abandon && room.ranked && room.match?.phase === 'live' && !room.fault && room.humansAtStart >= 2) {
    noteAbandon(client.account);
    audit('abandon', client.account.name);
  }
  if (room.match && client.playerId) {
    const p = room.match.players.find((x) => x.id === client.playerId);
    if (p && p.alive) {
      p.isBot = true;
      p.botDifficulty = room.difficulty || 'normal';
    }
  }
  if (!room.clients.length) {
    clearTimeout(room.timer);
    room.timer = null;
    if (room.match && room.match.phase !== 'ended') {
      room.fault = true;
      endMatch(room.match, { reason: 'empty' });
    }
    rooms.delete(room.id);
  }
}

function begin(room) {
  if (room.started || room.done || !rooms.has(room.id)) return;
  clearTimeout(room.timer);
  room.timer = null;
  if (!room.clients.some((c) => c.ws.readyState === 1)) {
    rooms.delete(room.id);
    return;
  }
  room.started = true;
  const humans = room.clients.filter((c) => c.ws.readyState === 1);
  const mode = getMode(room.modeId);
  const players = humans.map((c) => ({
    id: c.playerId,
    name: c.account.name,
    team: room.ranked ? undefined : (c.team === 'b' ? 'b' : 'a'),
    isBot: false,
    characterId: c.loadout.characterId,
    loadout: c.loadout,
    ping: c.ping || 40,
  }));
  const fill = Math.min(MAX_PLAYERS, mode.fill || 8);
  const bots = Math.max(0, fill - players.length);
  for (let i = 0; i < bots; i++) {
    players.push({
      id: `bot${i}`,
      name: DRILL_NAMES[i % DRILL_NAMES.length],
      isBot: true,
      botDifficulty: room.difficulty || 'normal',
      characterId: CHARACTERS[(i + 2) % CHARACTERS.length].id,
    });
  }
  const match = createMatch({
    id: room.id,
    modeId: room.modeId,
    mapId: room.mapId,
    seed: (Date.now() % 90000) + room.clients.length + 3,
    rules: room.rules,
    players,
    recordHistory: true,
  });
  match.lagQuery = (victimId, attackerId) => {
    const attacker = match.players.find((p) => p.id === attackerId);
    if (!attacker || attacker.isBot) return null;
    const rewind = Math.min(MAX_REWIND, rewindSeconds(attacker.ping));
    return historyPose(match, victimId, match.time - rewind);
  };
  room.match = match;
  room.humansAtStart = humans.length;
  room.acc = 0;
  room.lastSnap = 0;
  room.pending = [];
  for (const c of humans) {
    const me = match.players.find((p) => p.id === c.playerId);
    if (me) me.ping = c.ping || 40;
    send(c.ws, {
      type: 'start',
      matchId: match.id,
      modeId: match.modeId,
      mapId: match.map.id,
      you: c.playerId,
      players: match.players.filter((p) => !p.isDecoy).map(slim),
      rules: {
        scoreLimit: match.rules.scoreLimit,
        timeLimit: match.rules.timeLimit,
        ranked: !!match.rules.ranked,
        teams: match.rules.teams,
        respawn: match.rules.respawn,
      },
      timeLeft: match.timeLeft,
      phase: match.phase,
    });
  }
}

function schedule(room) {
  if (room.timer || room.started) return;
  const wait = room.code ? 3500 : 1100;
  room.timer = setTimeout(() => begin(room), wait);
}

function openRoom(opts) {
  const mode = getMode(opts.modeId);
  const ranked = mode.id === 'ranked_circuit' && !opts.code;
  const id = `c${(seq++).toString(36)}`;
  const room = {
    id,
    code: opts.code || '',
    modeId: mode.id,
    mapId: mapAllowed(opts.mapId) ? opts.mapId : COMBAT_MAPS[(seq + Date.now()) % COMBAT_MAPS.length].id,
    rules: sanitizeRules(opts.rules, { ranked }),
    ranked,
    difficulty: DIFFICULTY_IDS.includes(opts.difficulty) ? opts.difficulty : (ranked ? 'hard' : 'normal'),
    capacity: Math.min(MAX_PLAYERS, mode.fill || 8),
    clients: [],
    started: false,
    done: false,
    fault: false,
    match: null,
    timer: null,
    pending: [],
    acc: 0,
    lastSnap: 0,
    humansAtStart: 0,
    rewarded: false,
  };
  rooms.set(id, room);
  return room;
}

function bindAccount(client, token, name) {
  const prevFlags = client.account?.flags || 0;
  client.account = accountFor(token || client.account?.token, sanitizeName(name || client.account?.name));
  client.account.flags = Math.max(client.account.flags || 0, prevFlags);
  return client.account;
}

function queueClient(client, msg) {
  if (!client.account?.token) bindAccount(client, '', msg.name);
  if (client.account.banUntil > Date.now()) {
    send(client.ws, { type: 'error', key: 'rank.locked', seconds: Math.ceil((client.account.banUntil - Date.now()) / 1000), vars: { n: Math.ceil((client.account.banUntil - Date.now()) / 1000) } });
    return;
  }
  detach(client, { abandon: client.room?.match?.phase === 'live' });
  const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const requested = modeAllowed(msg.modeId) ? msg.modeId : 'team_fracture';
  const ranked = requested === 'ranked_circuit' && !code;
  if (ranked && (client.ping || 0) > 180) {
    send(client.ws, { type: 'error', key: 'error.high_ping' });
    return;
  }
  let room = null;
  if (code) room = [...rooms.values()].find((r) => r.code === code && !r.started && !r.done);
  else if (!msg.id) {
    room = [...rooms.values()].find((r) => !r.code && !r.started && !r.done && r.modeId === requested && r.clients.length < r.capacity);
  } else {
    room = rooms.get(String(msg.id));
    if (room?.started) room = null;
  }
  if (!room) {
    if (msg.id && !code) {
      send(client.ws, { type: 'error', key: 'error.bad_code' });
      return;
    }
    room = openRoom({
      modeId: requested,
      mapId: msg.mapId,
      code,
      rules: msg.rules,
      difficulty: msg.difficulty,
    });
  }
  if (room.clients.length >= room.capacity) {
    send(client.ws, { type: 'error', key: 'error.full' });
    return;
  }
  client.room = room;
  client.team = msg.team === 'b' ? 'b' : 'a';
  client.loadout = sanitizeLoadout(msg.loadout);
  client.playerId = `h${client.account.token.slice(0, 8)}${seq.toString(36)}`;
  room.clients.push(client);
  if (room.clients.length >= room.capacity) begin(room);
  else schedule(room);
}

function finish(room) {
  if (room.rewarded || !room.match) return;
  room.rewarded = true;
  room.done = true;
  const summary = summarize(room.match);
  const humans = room.clients.filter((c) => c.ws.readyState === 1);
  const official = room.ranked && room.humansAtStart >= 2 && !room.fault && summary.completed;
  const opp = humans.length
    ? humans.reduce((s, c) => s + (c.account.rating || 0), 0) / humans.length
    : 1000;
  for (const c of humans) {
    const row = summary.players.find((p) => p.id === c.playerId);
    if (!row) continue;
    const win = summary.winnerId === row.id || (summary.winnerTeam && row.team === summary.winnerTeam);
    const rewards = computeRewards(summary, row.id);
    if (summary.modeId === 'practice' || summary.modeId === 'tutorial') {
      rewards.xp = Math.round(rewards.xp * 0.35);
      rewards.credits = Math.round(rewards.credits * 0.35);
    }
    c.account.xp += rewards.xp || 0;
    c.account.credits += rewards.credits || 0;
    c.account.matches += 1;
    c.account.elims += row.kills || 0;
    c.account.obj += row.objectiveScore || 0;
    if (win) c.account.wins += 1;
    let rating = null;
    let rankedUp = false;
    if (official && !c.abandoned) {
      const before = rankFor(c.account.rating || 0).id;
      const rated = rateMatch({
        rating: c.account.rating || 0,
        oppRating: opp,
        win: !!win,
        matches: c.account.matches || 0,
        contribution: 1,
      });
      c.account.rating = rated.next;
      c.account.peak = Math.max(c.account.peak || 0, rated.next);
      c.account.placementsLeft = Math.max(0, (c.account.placementsLeft ?? 5) - 1);
      rating = rated.next;
      rankedUp = rankFor(rated.next).id !== before;
    }
    saveAccount(c.account);
    send(c.ws, {
      type: 'end',
      summary,
      rewards,
      official,
      rating,
      rankedUp,
      rankMatches: c.account.matches,
      placementsLeft: c.account.placementsLeft,
    });
  }
  setTimeout(() => rooms.delete(room.id), 4000);
}

function tickRooms(dt, now) {
  for (const room of rooms.values()) {
    if (!room.match || room.match.phase === 'ended') {
      if (room.match?.phase === 'ended') finish(room);
      continue;
    }
    room.acc += dt;
    let steps = 0;
    while (room.acc >= TICK && steps < 4) {
      stepMatch(room.match, TICK);
      room.pending.push(...consumeEvents(room.match));
      room.acc -= TICK;
      steps++;
    }
    if (now - room.lastSnap >= SNAP_MS) {
      const snap = worldSnap(room.match, room.pending.splice(0, room.pending.length));
      for (const c of room.clients) send(c.ws, snap);
      room.lastSnap = now;
    }
    if (room.match.phase === 'ended') finish(room);
  }
}

function onMessage(client, raw) {
  if (typeof raw !== 'string' || raw.length > 8000) {
    client.account.flags = (client.account.flags || 0) + 1;
    if (client.account.flags > 12) {
      client.account.banUntil = Date.now() + 10 * 60 * 1000;
      saveAccount(client.account);
      send(client.ws, { type: 'error', key: 'error.banned' });
      client.ws.close();
    }
    return;
  }
  const now = Date.now();
  client.bucket = (client.bucket || []).filter((t) => now - t < 1000);
  client.bucket.push(now);
  if (client.bucket.length > 90) {
    if (!client.flaggedAt || now - client.flaggedAt > 1000) {
      client.account.flags = (client.account.flags || 0) + 1;
      client.flaggedAt = now;
      saveAccount(client.account);
    }
    return;
  }
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'hello') {
    bindAccount(client, msg.token, msg.name);
    send(client.ws, { type: 'welcome', token: client.account.token, name: client.account.name });
  } else if (msg.type === 'ping') {
    const sample = Date.now() - Number(msg.t);
    if (Number.isFinite(sample)) client.skew = client.skew == null ? sample : Math.min(client.skew, sample);
    send(client.ws, { type: 'pong', t: msg.t });
  } else if (msg.type === 'queue' || msg.type === 'join') {
    queueClient(client, msg);
  } else if (msg.type === 'input' && client.room?.match && client.playerId) {
    const sample = now - Number(msg.t);
    if (Number.isFinite(sample)) client.skew = client.skew == null ? sample : Math.min(client.skew, sample);
    const age = Number.isFinite(sample) ? Math.max(0, sample - (client.skew || 0)) : inputAge(msg.t, now);
    const input = sanitizeInput(msg.input, age);
    const ping = Math.max(0, Math.min(400, Number(msg.ping) || client.ping || 40));
    client.ping = ping;
    const player = client.room.match.players.find((p) => p.id === client.playerId);
    if (player && !player.isBot) {
      player.ping = ping;
      setInput(client.room.match, player.id, input);
    }
  } else if (msg.type === 'leave') {
    client.abandoned = true;
    detach(client, { abandon: true });
  } else if (msg.type === 'chat') {
    if ((client.account.mutedUntil || 0) > now) return;
    if (!QUICK_CHAT.includes(msg.key)) return;
    const room = client.room;
    if (!room) return;
    for (const c of room.clients) send(c.ws, { type: 'chat', name: client.account.name, key: msg.key });
  } else if (msg.type === 'report') {
    const report = sanitizeReport(msg);
    if (!report.target) return;
    const target = findAccountByName(report.target) || allAccounts().find((a) => a.token.startsWith(report.target));
    addReport({ ...report, from: client.account.name, targetName: target?.name || report.target });
    if (target) target.flags = (target.flags || 0) + 1;
    audit('report', `${client.account.name} -> ${report.target}`);
  }
}

function adminOk(req) {
  return req.headers['x-admin-key'] === ADMIN_KEY;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, sockets: sockets.size }));
    return;
  }
  if (url.pathname === '/api/browser') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(browserList()));
    return;
  }
  if (url.pathname === '/api/leaderboard') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(leaderboard(url.searchParams.get('board') || 'rating')));
    return;
  }
  if (url.pathname === '/api/strings') {
    const lang = url.searchParams.get('lang') === 'it' ? 'it' : 'en';
    const out = {};
    for (const [key, row] of Object.entries(STRINGS)) out[key] = row[lang] || row.en;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
    return;
  }
  if (url.pathname === '/api/admin/reports') {
    if (!adminOk(req)) { res.writeHead(401).end('no'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ reports: listReports(), audit: listAudit() }));
    return;
  }
  if (url.pathname === '/api/admin/action' && req.method === 'POST') {
    if (!adminOk(req)) { res.writeHead(401).end('no'); return; }
    const body = await readBody(req);
    const action = ['kick', 'ban', 'mute', 'dismiss'].includes(body.action) ? body.action : 'dismiss';
    const report = closeReport(body.reportId, action);
    const target = allAccounts().find((a) => a.token === body.target || a.name === report?.targetName || a.name === body.target);
    if (target && action === 'ban') target.banUntil = Date.now() + 24 * 3600 * 1000;
    if (target && action === 'mute') target.mutedUntil = Date.now() + 30 * 60 * 1000;
    if (target) saveAccount(target);
    if (action === 'kick' || action === 'ban') {
      for (const c of sockets) {
        if (c.account === target) c.ws.close();
      }
    }
    audit(action, target?.name || body.target || '');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const html = fs.readFileSync(path.join(root, 'public', 'admin.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Vectorbreak relay. Play at the client. Desk: /admin');
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const client = {
    ws,
    account: accountFor(`guest${seq}`, 'Rookie'),
    room: null,
    playerId: null,
    ping: 40,
    bucket: [],
    abandoned: false,
    loadout: sanitizeLoadout(null),
    team: 'a',
  };
  sockets.add(client);
  send(ws, { type: 'welcome', token: client.account.token, name: client.account.name });
  ws.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    if (text.includes('"type":"hello"') || text.includes('"type": "hello"')) {
      try {
        const hello = JSON.parse(text);
        if (hello.token) client.account = accountFor(hello.token, sanitizeName(hello.name));
      } catch { /* onMessage handles the rest */ }
    }
    onMessage(client, text);
  });
  ws.on('close', () => {
    sockets.delete(client);
    detach(client, { abandon: false });
  });
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tickRooms(dt, now);
}, 16);

server.listen(PORT, HOST, () => {
  console.log(`Vectorbreak relay on http://${HOST}:${PORT}`);
});
