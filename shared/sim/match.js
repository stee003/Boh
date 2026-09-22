import { SCORE } from '../constants.js';
import { getCharacter } from '../characters.js';
import { cloneMap } from '../maps.js';
import { resolveRules } from '../modes.js';
import { GUN_GAME_LADDER, createWeaponState, getWeapon, resolveWeapon } from '../weapons.js';
import { clamp, distXZ, makeRng } from '../math.js';
import { stepAbilityTimers, stepDeployables, tryAbilities, addUlt } from './abilities.js';
import { thinkBot, buildNav } from './ai.js';
import { currentDef, stepProjectiles, stepWeapons } from './combat.js';
import { emptyInput, findSupport, raycast, simulateMovement } from './physics.js';

export { emptyInput, buildNav };

export function isEnemy(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (a.isDecoy || b.isDecoy) return a.team !== b.team && a.team !== 'ffa';
  if (a.team === 'ffa' || b.team === 'ffa') return true;
  return a.team !== b.team;
}

export function createMatch(config = {}) {
  const rules = resolveRules(config.modeId || 'team_fracture', config.rules || {});
  const map = cloneMap(config.map || config.mapId || (rules.practice ? 'calibration_bay' : 'neon_district'));
  const rng = makeRng(config.seed || (Date.now() % 100000) + 1);
  const match = {
    id: config.id || `m${rng.int(1e9).toString(16)}`,
    modeId: rules.modeId,
    rules,
    map,
    rng,
    players: [],
    projectiles: [],
    deployables: [],
    events: [],
    feed: [],
    recentDeaths: [],
    teamScore: { a: 0, b: 0 },
    phase: rules.practice ? 'live' : 'countdown',
    countdown: rules.practice ? 0 : 3.2,
    time: 0,
    timeLeft: rules.timeLimit || 0,
    tick: 0,
    objectives: (map.objectives || []).map((o) => ({ ...o, owner: null, progress: 0, active: false })),
    cores: null,
    ladder: GUN_GAME_LADDER.slice(),
    nav: null,
    overtime: false,
    round: 1,
    roundTime: rules.roundTime || 80,
    rotateT: rules.rotate || 30,
    objIndex: 0,
    winnerTeam: null,
    winnerId: null,
    endReason: null,
    tripleHold: false,
    history: [],
    recordHistory: !!config.recordHistory,
  };
  match.hurt = (v, a, atk, info) => hurtPlayer(match, v, a, atk, info);
  const roster = config.players || [];
  balanceTeams(roster, rules);
  for (const desc of roster) addPlayer(match, desc);
  if (rules.practice) addPracticeTargets(match);
  setupMode(match);
  rebuildSolids(match);
  for (const p of match.players) spawnPlayer(match, p);
  match.nav = buildNav(map);
  return match;
}

function balanceTeams(roster, rules) {
  let a = 0;
  let b = 0;
  for (const d of roster) {
    if (!rules.teams) { d.team = 'ffa'; continue; }
    if (d.team === 'a' || d.team === 'b') {
      if (d.team === 'a') a++; else b++;
      continue;
    }
    d.team = a <= b ? 'a' : 'b';
    if (d.team === 'a') a++; else b++;
  }
}

export function addPlayer(match, desc) {
  const character = getCharacter(desc.characterId || 'ryn');
  const loadout = desc.loadout || {
    characterId: character.id,
    primary: createWeaponState('linecut'),
    secondary: createWeaponState('flick2'),
    melee: createWeaponState('vectorblade'),
  };
  const mods = { ...character.passive };
  const player = {
    id: desc.id || `p${match.rng.int(1e9)}`,
    name: String(desc.name || 'Rookie').slice(0, 16),
    team: desc.team || 'a',
    isBot: !!desc.isBot,
    isDummy: !!desc.isDummy,
    isDecoy: false,
    botDifficulty: desc.botDifficulty || match.rules.botDifficulty || 'normal',
    characterId: character.id,
    kit: character,
    mods,
    maxHp: mods.maxHp || match.rules.health || 100,
    hp: mods.maxHp || match.rules.health || 100,
    armor: (match.rules.armor || 0) + (mods.armor || 0),
    weapons: [loadout.primary, loadout.secondary, loadout.melee].map((w) => ({ ...w, attachments: [...(w.attachments || [])] })),
    weaponSlot: 0,
    loadout,
    shoulder: 1,
    yaw: 0,
    pitch: 0,
    x: 0, y: 1, z: 0,
    vx: 0, vy: 0, vz: 0,
    alive: true,
    onGround: false,
    input: emptyInput(),
    score: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    objectiveScore: 0,
    damageDealt: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    ult: 0,
    recentDamage: [],
    weaponKills: {},
    weaponsUsed: [],
    ping: desc.ping || (desc.isBot ? 8 : 20),
    color: desc.color ?? 0,
    lives: match.rules.lives || 0,
    tier: 0,
    spawnImmunity: 0,
    regenDelayLeft: 0,
    tacticalCd: 0,
    speedMul: 1,
    fireRateMul: 1,
    reloadMul: 1,
    mobility: 1,
    matchKills: 0,
    matchDeaths: 0,
    matchAssists: 0,
    matchHeadshots: 0,
    clutchKills: 0,
    revenges: 0,
    bestMulti: 0,
    ultKills: 0,
    meleeKills: 0,
    longShots: 0,
    pointBlank: 0,
    slideKills: 0,
    defenseKills: 0,
    experimentalKills: 0,
    pistolKills: 0,
    lmgDamage: 0,
    oneMag: 0,
    killsThisMag: 0,
    holdTime: 0,
    coresStolen: 0,
    coresReturned: 0,
    glassBreaks: 0,
    slides: 0,
    slideJumps: 0,
    vaults: 0,
    dodges: 0,
    wallKickCount: 0,
    distance: 0,
    airTime: 0,
    longSlide: 0,
    multiTimes: [],
  };
  refill(player);
  if (match.modeId === 'arsenal_march') equipTier(match, player);
  match.players.push(player);
  return player;
}

function addPracticeTargets(match) {
  const spots = [
    { x: -4, z: 6 }, { x: 0, z: 10 }, { x: 4, z: 6 }, { x: -4, z: 14 }, { x: 4, z: 14 },
  ];
  spots.forEach((s, i) => {
    const d = addPlayer(match, {
      id: `dummy${i}`, name: 'Target', team: 'b', isDummy: true, characterId: 'orrin',
    });
    d.homeX = s.x;
    d.homeZ = s.z;
    d.dummyMove = i === 4;
    d.maxHp = 100;
    d.mods = {};
  });
}

function setupMode(match) {
  if (match.modeId === 'pulsepoint' && match.objectives[0]) match.objectives[0].active = true;
  if (match.modeId === 'core_run') {
    const ca = centroid(match.map.spawns.a);
    const cb = centroid(match.map.spawns.b);
    match.cores = {
      a: { team: 'a', x: ca.x, y: 0.6, z: ca.z + 3, homeX: ca.x, homeZ: ca.z + 3, homeY: 0.6, carrier: null, atHome: true },
      b: { team: 'b', x: cb.x, y: 0.6, z: cb.z - 3, homeX: cb.x, homeZ: cb.z - 3, homeY: 0.6, carrier: null, atHome: true },
    };
  }
}

function centroid(list = []) {
  if (!list.length) return { x: 0, z: 0 };
  let x = 0; let z = 0;
  for (const s of list) { x += s.x; z += s.z; }
  return { x: x / list.length, z: z / list.length };
}

export function setInput(match, id, input) {
  const p = match.players.find((x) => x.id === id);
  if (!p) return;
  p.input = { ...emptyInput(), ...input };
  p.lastInputAt = match.time;
}

/**
 * A human player who stops sending input (paused, tab hidden, connection hiccup)
 * must stop moving: their last input frame decays to "no input" after `after`
 * seconds of silence instead of being re-applied forever. Bots, dummies and
 * decoys set their input directly every step, so they are skipped.
 */
export function decayStaleInputs(match, after = 0.3) {
  for (const p of match.players) {
    if (p.isBot || p.isDummy || p.isDecoy) continue;
    if (p.lastInputAt != null && match.time - p.lastInputAt > after) {
      // Zero the action/motion bits but KEEP the last sent view direction:
      // the sim adopts input.yaw/pitch as the player's aim, so a plain empty
      // input would snap the character back to facing north.
      p.input = { ...emptyInput(), yaw: p.input.yaw, pitch: p.input.pitch };
    }
  }
}

export function setLoadout(match, id, loadout) {
  const p = match.players.find((x) => x.id === id);
  if (!p || !loadout) return;
  if (match.rules.lockLoadout && p.alive && match.phase === 'live') return;
  p.pendingLoadout = loadout;
  if (!p.alive || match.phase !== 'live') applyLoadout(p, loadout, match);
}

function applyLoadout(player, loadout, match) {
  const character = getCharacter(loadout.characterId || player.characterId);
  player.characterId = character.id;
  player.kit = character;
  player.mods = { ...character.passive };
  player.maxHp = player.mods.maxHp || match.rules.health || 100;
  player.weapons = [loadout.primary, loadout.secondary, loadout.melee].map((w) => ({
    ...w, attachments: [...(w.attachments || [])],
  }));
  player.loadout = loadout;
  refill(player);
  player.pendingLoadout = null;
}

function refill(player) {
  for (const w of player.weapons || []) {
    const def = resolveWeapon(w);
    if (def.melee) { w.mag = 1; w.reserve = 1; continue; }
    w.mag = def.mag;
    w.reserve = def.reserve;
  }
}

function equipTier(match, player) {
  const id = match.ladder[Math.min(player.tier || 0, match.ladder.length - 1)];
  player.weapons[0] = createWeaponState(id);
  player.weapons[0].reserve = 999;
  player.weapons[0].mag = resolveWeapon(player.weapons[0]).mag;
  player.weaponSlot = 0;
  if (!player.weaponsUsed.includes(id)) player.weaponsUsed.push(id);
}

export function stepMatch(match, dt) {
  dt = Math.min(0.05, Math.max(0, dt || 0));
  if (match.phase === 'ended') return;
  match.time += dt;
  match.tick += 1;
  if (match.phase === 'countdown') {
    match.countdown -= dt;
    if (match.countdown <= 0) {
      match.phase = 'live';
      match.events.push({ type: 'announce', key: 'announce.go' });
    }
  } else if ((match.phase === 'live' || match.phase === 'overtime') && match.rules.timeLimit > 0) {
    match.timeLeft -= dt;
    if (match.modeId === 'last_circuit') match.roundTime -= dt;
  }
  rebuildSolids(match);
  for (const p of [...match.players]) {
    if (p.isBot && p.alive && !p.isDummy && match.phase !== 'ended') thinkBot(match, p, dt);
    stepPlayer(match, p, dt);
  }
  stepProjectiles(match, dt);
  stepDeployables(match, dt);
  if (match.phase === 'live' || match.phase === 'overtime') stepMode(match, dt);
  if (match.recordHistory) pushHistory(match);
  if (match.events.length > 240) match.events.splice(0, match.events.length - 160);
}

function pushHistory(match) {
  match.history.push({
    t: match.time,
    players: match.players.map((p) => ({
      id: p.id, x: p.x, y: p.y, z: p.z, crouch: !!p.crouch, sliding: !!p.sliding, alive: p.alive,
    })),
  });
  const cut = match.time - 0.3;
  while (match.history.length && match.history[0].t < cut) match.history.shift();
}

export function historyPose(match, id, time) {
  if (!match.history?.length) return null;
  let best = match.history[0];
  let bestD = Math.abs(best.t - time);
  for (const h of match.history) {
    const d = Math.abs(h.t - time);
    if (d < bestD) { best = h; bestD = d; }
  }
  return best.players.find((p) => p.id === id) || null;
}

function rebuildSolids(match) {
  const list = [];
  for (const b of match.map.boxes) {
    if (b.broken) { b.solid = false; b.hidden = true; continue; }
    if (b.mover && b.baseMin) {
      const axis = b.mover.axis || 'y';
      const off = Math.sin(match.time * (b.mover.speed || 0.4) * Math.PI * 2 + (b.mover.phase || 0)) * b.mover.amp;
      const prev = b.min[axis];
      b.min[axis] = b.baseMin[axis] + off;
      b.max[axis] = b.baseMax[axis] + off;
      b.delta = { x: 0, y: 0, z: 0, [axis]: b.min[axis] - prev };
    } else b.delta = { x: 0, y: 0, z: 0 };
    if (b.toggle) {
      const u = (match.time + (b.toggle.phase || 0)) % b.toggle.period;
      const open = u < (b.toggle.open || 3);
      b.solid = !open;
      b.hidden = open;
    }
    if (b.solid !== false) list.push(b);
  }
  for (const d of match.deployables) {
    if (d.dead) continue;
    if ((d.kind === 'aegis' || d.kind === 'fortify') && d.box) {
      d.box.solid = d.hp > 0;
      if (d.box.solid) list.push(d.box);
    }
  }
  match._solidCache = list;
}

function stepPlayer(match, player, dt) {
  if (player.isDecoy) return;
  player.speedMul = 1;
  player.fireRateMul = 1;
  player.reloadMul = 1;
  const frozen = match.phase === 'countdown' || match.phase === 'ended';
  if (!player.isBot && player.input) {
    if (Number.isFinite(player.input.yaw)) player.yaw = player.input.yaw;
    if (Number.isFinite(player.input.pitch)) player.pitch = clamp(player.input.pitch, -1.35, 1.25);
    if (player.input.shoulderTap && !player.prevShoulder) player.shoulder = (player.shoulder || 1) * -1;
    player.prevShoulder = !!player.input.shoulderTap;
  }
  if (!player.alive) {
    if (match.modeId === 'last_circuit' || match.phase === 'ended') return;
    if (match.rules.respawn <= 0 && !player.isDummy) return;
    player.deathT -= dt;
    if (player.deathT <= 0) {
      if (player.pendingLoadout && !match.rules.lockLoadout) applyLoadout(player, player.pendingLoadout, match);
      spawnPlayer(match, player);
    }
    return;
  }
  if (player.isDummy) {
    stepDummy(match, player, dt);
    return;
  }
  player.regenDelayLeft = Math.max(0, (player.regenDelayLeft || 0) - dt);
  const regenDelay = Math.max(0.3, (match.rules.regenDelay || 4) + (player.mods?.regenDelay || 0));
  if (player.regenDelayLeft <= 0 && player.hp < player.maxHp && match.rules.regenRate > 0 && !frozen) {
    player.hp = Math.min(player.maxHp, player.hp + match.rules.regenRate * dt);
  }
  void regenDelay;
  player.spawnImmunity = Math.max(0, (player.spawnImmunity || 0) - dt);
  stepAbilityTimers(player, dt);
  if (player.characterId === 'brassa') {
    for (const d of match.deployables) {
      if (d.ownerId === player.id && distXZ(d, player) < 7) player.reloadMul = player.mods.reloadNearDeploy || 0.85;
    }
  }
  const def = currentDef(player);
  player.mobility = def.mobility || 1;
  if ((player.catalogT || 0) > 0) {
    player.catalogT -= dt;
    if (def.category === 'experimental') player.fireRateMul = 1.12;
  }
  if (!player.weaponsUsed.includes(def.id)) player.weaponsUsed.push(def.id);
  if (frozen) return;
  tryAbilities(match, player);
  const input = player.input || emptyInput();
  simulateMovement(player, input, match._solidCache, dt, match.rules);
  applyZones(match, player);
  stepWeapons(match, player, dt);
  stepCores(match, player);
  stepPads(match, player);
  if (player.y < (match.map.bounds?.killY ?? -12)) {
    hurtPlayer(match, player, 999, null, { zone: 'body', weaponId: 'void', dist: 0, point: { x: player.x, y: player.y, z: player.z }, void: true });
  }
}

function stepDummy(match, player, dt) {
  player.spawnImmunity = 0;
  player.yaw += dt * 0.15;
  if (player.dummyMove) {
    player.x = player.homeX + Math.sin(match.time * 0.7) * 6;
    player.z = player.homeZ;
    player.y = 0.3;
  }
  if (player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 40 * dt);
  if (!player.alive) {
    player.deathT -= dt;
    if (player.deathT <= 0) {
      player.alive = true;
      player.hp = player.maxHp;
      player.x = player.homeX;
      player.z = player.homeZ;
      player.y = 0;
    }
  }
}

function applyZones(match, player) {
  for (const z of match.map.zones || []) {
    if (player.x < z.min.x || player.x > z.max.x || player.y < z.min.y || player.y > z.max.y || player.z < z.min.z || player.z > z.max.z) continue;
    if (z.type === 'slow') player.speedMul *= z.mul || 0.8;
    if (z.type === 'kill') {
      hurtPlayer(match, player, 999, null, { zone: 'body', weaponId: 'void', dist: 0, point: { x: player.x, y: player.y, z: player.z }, void: true });
    }
  }
}

function stepPads(match, player) {
  if (!player.input?.interact) return;
  for (const pad of match.map.pads || []) {
    if (distXZ(player, pad) < 1.7) {
      player.weapons[0] = createWeaponState(pad.weaponId);
      player.weapons[0].reserve = 999;
      player.weapons[0].mag = resolveWeapon(player.weapons[0]).mag;
      player.weaponSlot = 0;
      player.reloading = false;
      match.events.push({ type: 'pad', playerId: player.id, weaponId: pad.weaponId });
    }
  }
}

function stepCores(match, player) {
  if (match.modeId !== 'core_run' || !match.cores) return;
  const enemy = player.team === 'a' ? 'b' : 'a';
  const foe = match.cores[enemy];
  const own = match.cores[player.team];
  if (player.input?.drop && player.carrying) dropCore(match, player);
  if (!player.carrying && foe && !foe.carrier && distXZ(player, foe) < 1.65 && Math.abs(player.y - foe.y) < 2) {
    foe.carrier = player.id;
    foe.atHome = false;
    player.carrying = enemy;
    player.score += SCORE.coreSteal;
    player.coresStolen = (player.coresStolen || 0) + 1;
    addUlt(player, 12);
    match.events.push({ type: 'announce', key: 'announce.core_taken', team: enemy, playerId: player.id });
    pushFeed(match, { kind: 'core', name: player.name, team: player.team });
  }
  if (player.carrying && own && distXZ(player, { x: own.homeX, z: own.homeZ }) < 2.5) {
    match.teamScore[player.team] += 1;
    player.score += SCORE.coreReturn;
    player.objectiveScore += SCORE.coreReturn;
    player.coresReturned = (player.coresReturned || 0) + 1;
    addUlt(player, 18);
    const taken = player.carrying;
    player.carrying = null;
    resetCore(match, taken);
    match.events.push({ type: 'announce', key: 'announce.core_home', team: player.team, playerId: player.id });
  }
  if (!player.carrying && own && !own.atHome && !own.carrier && distXZ(player, own) < 1.6) {
    resetCore(match, player.team);
    player.score += 40;
    match.events.push({ type: 'announce', key: 'announce.core_recovered', team: player.team });
  }
  if (player.carrying && match.cores[player.carrying]) {
    const c = match.cores[player.carrying];
    c.x = player.x;
    c.y = player.y + 1.15;
    c.z = player.z;
  }
}

function dropCore(match, player) {
  if (!player.carrying) return;
  const c = match.cores[player.carrying];
  if (!c) return;
  c.carrier = null;
  c.x = player.x;
  c.y = player.y + 0.4;
  c.z = player.z;
  player.carrying = null;
  match.events.push({ type: 'announce', key: 'announce.core_dropped' });
}

function resetCore(match, team) {
  const c = match.cores?.[team];
  if (!c) return;
  c.carrier = null;
  c.atHome = true;
  c.x = c.homeX;
  c.y = c.homeY;
  c.z = c.homeZ;
  for (const p of match.players) if (p.carrying === team) p.carrying = null;
}

export function spawnPlayer(match, player) {
  if (player.pendingLoadout && !match.rules.lockLoadout) applyLoadout(player, player.pendingLoadout, match);
  const s = pickSpawn(match, player);
  const solids = match._solidCache || match.map.boxes.filter((b) => b.solid);
  const support = findSupport(s.x, s.z, 0.3, (s.y || 0) + 1.5, 4, solids);
  player.x = s.x;
  player.y = support ? support.y : (s.y || 0);
  player.z = s.z;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.yaw = s.yaw || 0;
  player.pitch = 0;
  player.hp = player.maxHp;
  player.armor = (match.rules.armor || 0) + (player.mods?.armor || 0);
  player.alive = true;
  player.onGround = true;
  player.spawnImmunity = match.rules.practice ? 0 : 0.75;
  player.reloading = false;
  player.reloadT = 0;
  player.sliding = false;
  player.crouch = false;
  player.burstQueue = 0;
  player.charge = 0;
  player.carrying = null;
  player.killsThisMag = 0;
  if (match.modeId === 'arsenal_march') equipTier(match, player);
  else refill(player);
  match.events.push({ type: 'spawn', playerId: player.id });
}

export function pickSpawn(match, player) {
  const ffa = player.team === 'ffa' || match.modeId === 'free_fracture' || match.modeId === 'arsenal_march';
  const list = (ffa ? match.map.spawns.ffa : match.map.spawns[player.team]) || match.map.spawns.a || [{ x: 0, y: 0, z: 0, yaw: 0 }];
  let best = list[0];
  let bestScore = -1e9;
  const active = activeObjective(match);
  for (const s of list) {
    let score = match.rng() * 5;
    for (const o of match.players) {
      if (!o.alive || o.id === player.id || o.isDecoy || o.isDummy) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (isEnemy(player, o)) {
        if (d < 6) score -= 130;
        else if (d < 12) score -= 36;
        else score += Math.min(34, d);
        if (d < 30 && sees(match, s, o)) score -= 28;
      } else if (d < 3.5) score -= 6;
    }
    for (const death of match.recentDeaths) {
      if (match.time - death.time < 8 && Math.hypot(death.x - s.x, death.z - s.z) < 7) score -= 20;
    }
    if (active && Math.hypot(active.x - s.x, active.z - s.z) < 8) score -= 14;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best || list[0];
}

function sees(match, from, to) {
  const origin = { x: from.x, y: (from.y || 0) + 1.4, z: from.z };
  const dir = { x: to.x - origin.x, y: (to.y + 1) - origin.y, z: to.z - origin.z };
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const hit = raycast(origin, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, len, match._solidCache || []);
  return !hit || hit.t > len - 0.5;
}

function activeObjective(match) {
  if (match.modeId === 'pulsepoint') return match.objectives[match.objIndex] || null;
  return null;
}

export function hurtPlayer(match, victim, amount, attacker, info = {}) {
  if (!victim?.alive || victim.spawnImmunity > 0) return;
  if (victim.phasingT > 0) return;
  if (victim.isDecoy) {
    victim.alive = false;
    victim.hp = 0;
    match.events.push({ type: 'decoy_pop', id: victim.id, point: info.point });
    return;
  }
  let dmg = Math.max(0, amount);
  if (victim.resist > 0) dmg *= 1 - victim.resist;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg);
    victim.armor -= absorbed;
    dmg -= absorbed;
  }
  victim.hp -= dmg;
  victim.regenDelayLeft = Math.max(0.4, (match.rules.regenDelay || 4) + (victim.mods?.regenDelay || 0));
  victim.flinch = Math.min(0.35, dmg / 90) * (victim.mods?.flinch ?? 1);
  if (dmg > 0) victim.flashed = 0.09; // brief red armor flash so "I was hit" is readable
  if (attacker && attacker.id !== victim.id && !info.void) {
    attacker.damageDealt = (attacker.damageDealt || 0) + amount;
    attacker.hits = (attacker.hits || 0) + (info.splash ? 0 : 1);
    if (info.zone === 'head') attacker.headshots = (attacker.headshots || 0) + 1;
    if (info.zone === 'head') attacker.matchHeadshots = (attacker.matchHeadshots || 0) + 1;
    if (getWeapon(info.weaponId)?.category === 'lmg') attacker.lmgDamage = (attacker.lmgDamage || 0) + amount;
    addUlt(attacker, amount * 0.032);
    victim.recentDamage.push({ id: attacker.id, time: match.time, amount, weaponId: info.weaponId });
    victim.recentDamage = victim.recentDamage.filter((h) => match.time - h.time < 5);
    if (attacker.characterId === 'lumen') victim.revealedT = Math.max(victim.revealedT || 0, attacker.mods.markOnHit || 1.5);
    if (info.slow) { victim.slowT = info.slowTime || 0.5; victim.slowMul = 1 - info.slow; }
  }
  match.events.push({
    type: 'hit',
    attackerId: attacker?.id || null,
    victimId: victim.id,
    zone: info.zone || 'body',
    amount: Math.round(amount),
    point: info.point,
    weaponId: info.weaponId,
    friendly: attacker && !isEnemy(attacker, victim),
  });
  if (victim.hp <= 0) killPlayer(match, victim, attacker, info);
}

function killPlayer(match, victim, attacker, info) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths += 1;
  victim.matchDeaths = (victim.matchDeaths || 0) + 1;
  victim.deathT = victim.isDummy ? 0.8 : (match.rules.respawn || 3);
  victim.killerId = attacker?.id || null;
  victim.deathWeapon = info.weaponId;
  victim.deathZone = info.zone;
  victim.deathDist = info.dist || 0;
  if (victim.lives) victim.lives -= 1;
  if (victim.carrying) dropCore(match, victim);
  match.recentDeaths.push({ x: victim.x, z: victim.z, time: match.time });
  if (match.recentDeaths.length > 24) match.recentDeaths.shift();
  const teamKill = attacker && !isEnemy(attacker, victim);
  const weapon = getWeapon(info.weaponId || 'linecut');
  if (attacker && attacker.id !== victim.id && !teamKill && !info.void) {
    attacker.kills += 1;
    attacker.matchKills = (attacker.matchKills || 0) + 1;
    attacker.killsThisMag = (attacker.killsThisMag || 0) + 1;
    if (attacker.killsThisMag >= 3) attacker.oneMag = 1;
    const onObj = nearObjective(match, victim) || nearObjective(match, attacker);
    const defending = isDefending(match, attacker);
    let personal = onObj ? SCORE.objElim : SCORE.elim;
    if (defending) {
      personal += SCORE.defend;
      attacker.defenseKills = (attacker.defenseKills || 0) + 1;
    }
    if (info.zone === 'head') personal += SCORE.headshotBonus;
    attacker.score += personal;
    if (onObj) attacker.objectiveScore += personal;
    addUlt(attacker, 16);
    attacker.weaponKills[info.weaponId] = (attacker.weaponKills[info.weaponId] || 0) + 1;
    if (weapon.category === 'experimental') attacker.experimentalKills += 1;
    if (weapon.category === 'pistol') attacker.pistolKills += 1;
    if (weapon.melee || info.melee) attacker.meleeKills += 1;
    if ((info.dist || 0) >= 40) attacker.longShots += 1;
    if (weapon.category === 'shotgun' && (info.dist || 99) < 4) attacker.pointBlank += 1;
    if (attacker.sliding) attacker.slideKills += 1;
    if (attacker.hp < 22) attacker.clutchKills += 1;
    if (attacker.ultActiveT > 0) attacker.ultKills += 1;
    if (attacker.lastKillerId && attacker.lastKillerId === victim.id) {
      attacker.revenges += 1;
      match.events.push({ type: 'revenge', playerId: attacker.id });
    }
    attacker.multiTimes.push(match.time);
    attacker.multiTimes = attacker.multiTimes.filter((t) => match.time - t <= 8);
    attacker.bestMulti = Math.max(attacker.bestMulti || 0, attacker.multiTimes.length);
    if (match.modeId === 'team_fracture' || match.modeId === 'ranked_circuit') match.teamScore[attacker.team] += 1;
    if (match.modeId === 'free_fracture') attacker.elimCount = (attacker.elimCount || 0) + 1;
    if (match.modeId === 'arsenal_march') {
      if (info.melee || weapon.melee) victim.tier = Math.max(0, (victim.tier || 0) - 1);
      attacker.tier = (attacker.tier || 0) + 1;
      if (attacker.tier >= match.ladder.length) {
        attacker.gunGameWin = true;
        endMatch(match, { winnerId: attacker.id, reason: 'ladder' });
      } else equipTier(match, attacker);
    }
  }
  const assistIds = [];
  for (const hit of victim.recentDamage || []) {
    if (match.time - hit.time > 4.5) continue;
    if (attacker && hit.id === attacker.id) continue;
    const mate = match.players.find((p) => p.id === hit.id);
    if (!mate || assistIds.includes(mate.id) || !isEnemy(mate, victim)) continue;
    assistIds.push(mate.id);
    mate.assists += 1;
    mate.matchAssists = (mate.matchAssists || 0) + 1;
    mate.score += SCORE.assist;
    addUlt(mate, 10);
  }
  victim.lastKillerId = attacker?.id || null;
  pushFeed(match, {
    kind: 'kill',
    killer: attacker?.name || '',
    killerTeam: attacker?.team || '',
    victim: victim.name,
    victimTeam: victim.team,
    weaponId: info.weaponId || 'void',
    zone: info.zone,
    killerId: attacker?.id,
    victimId: victim.id,
  });
  match.events.push({
    type: 'kill',
    killerId: attacker?.id || null,
    victimId: victim.id,
    weaponId: info.weaponId,
    zone: info.zone,
    point: { x: victim.x, y: victim.y, z: victim.z },
  });
  if (match.modeId === 'last_circuit') {
    const alive = (team) => match.players.some((p) => p.team === team && p.alive && !p.isDecoy && !p.isDummy);
    if (!alive('a') || !alive('b')) finishRound(match, !alive('a') ? 'b' : 'a');
  }
}

function nearObjective(match, player) {
  for (const o of match.objectives || []) {
    if (match.modeId === 'pulsepoint' && !o.active && match.objectives[match.objIndex] !== o) continue;
    if (distXZ(player, o) <= (o.radius || 3) + 2) return true;
  }
  return false;
}

function isDefending(match, player) {
  for (const o of match.objectives || []) {
    if (o.owner === player.team && distXZ(player, o) <= (o.radius || 3) + 3) return true;
  }
  return false;
}

function pushFeed(match, entry) {
  match.feed.push({ ...entry, t: match.time });
  if (match.feed.length > 8) match.feed.shift();
}

function stepMode(match, dt) {
  if (match.modeId === 'dominion') stepZones(match, dt, match.objectives.slice(0, 3), 1.15);
  if (match.modeId === 'pulsepoint') {
    match.rotateT -= dt;
    match.objectives.forEach((o, i) => { o.active = i === match.objIndex; });
    if (match.rotateT <= 0) {
      match.objIndex = (match.objIndex + 1) % Math.max(1, match.objectives.length);
      match.rotateT = match.rules.rotate || 30;
      match.events.push({ type: 'announce', key: 'announce.rotate' });
    }
    const obj = match.objectives[match.objIndex];
    if (obj) stepZones(match, dt, [obj], 2.3);
  }
  if (match.modeId === 'last_circuit' && match.roundTime <= 0) {
    const ah = hpSum(match, 'a');
    const bh = hpSum(match, 'b');
    finishRound(match, ah === bh ? null : ah > bh ? 'a' : 'b');
  }
  match.leadA = Math.min(match.leadA ?? 0, match.teamScore.a - match.teamScore.b);
  match.leadB = Math.min(match.leadB ?? 0, match.teamScore.b - match.teamScore.a);
  if (match.phase === 'overtime' && match.teamScore.a !== match.teamScore.b) {
    endMatch(match, { winnerTeam: match.teamScore.a > match.teamScore.b ? 'a' : 'b', reason: 'overtime' });
    return;
  }
  if (match.timeLeft <= 0 && match.rules.timeLimit > 0 && match.phase === 'live') {
    const tied = scoresTied(match);
    if (tied && match.rules.overtime) {
      match.phase = 'overtime';
      match.overtime = true;
      match.timeLeft = 60;
      match.events.push({ type: 'announce', key: 'announce.overtime' });
    } else endMatch(match, { winnerTeam: leadingTeam(match), winnerId: leadingPlayer(match), reason: 'time' });
  }
  if (match.rules.scoreLimit > 0 && match.phase !== 'ended') {
    if (match.rules.teams && (match.teamScore.a >= match.rules.scoreLimit || match.teamScore.b >= match.rules.scoreLimit)) {
      if (match.teamScore.a !== match.teamScore.b) {
        endMatch(match, { winnerTeam: match.teamScore.a > match.teamScore.b ? 'a' : 'b', reason: 'score' });
      }
    }
    if (!match.rules.teams) {
      const top = [...match.players].filter((p) => !p.isDummy).sort((a, b) => (b.elimCount || b.kills) - (a.elimCount || a.kills))[0];
      if (top && (top.elimCount || top.kills) >= match.rules.scoreLimit) endMatch(match, { winnerId: top.id, reason: 'score' });
    }
  }
}

function stepZones(match, dt, zones, pointRate) {
  const owners = new Set();
  for (const obj of zones) {
    let a = 0; let b = 0;
    for (const p of match.players) {
      if (!p.alive || p.isDecoy || p.isDummy) continue;
      if (distXZ(p, obj) <= obj.radius && Math.abs(p.y - (obj.y || 0)) < 3) {
        if (p.team === 'a') a++;
        else if (p.team === 'b') b++;
        p.holdTime = (p.holdTime || 0) + dt;
        p.objectiveTime = (p.objectiveTime || 0) + dt;
      }
    }
    obj.contested = a > 0 && b > 0;
    obj.presence = { a, b };
    if (!obj.contested && a > b) obj.progress = (obj.progress || 0) + dt * 32 * (1 + (a - 1) * 0.3);
    else if (!obj.contested && b > a) obj.progress = (obj.progress || 0) - dt * 32 * (1 + (b - 1) * 0.3);
    if ((obj.progress || 0) >= 100 && obj.owner !== 'a') awardCapture(match, obj, 'a');
    if ((obj.progress || 0) <= -100 && obj.owner !== 'b') awardCapture(match, obj, 'b');
    obj.progress = clamp(obj.progress || 0, -100, 100);
    if (obj.owner && !obj.contested) {
      match.teamScore[obj.owner] += dt * pointRate;
      owners.add(obj.owner);
    }
  }
  if (zones.length >= 3 && zones.every((o) => o.owner === 'a')) match.tripleHold = 'a';
  if (zones.length >= 3 && zones.every((o) => o.owner === 'b')) match.tripleHold = 'b';
}

function awardCapture(match, obj, team) {
  obj.owner = team;
  obj.progress = team === 'a' ? 100 : -100;
  for (const p of match.players) {
    if (p.team === team && p.alive && distXZ(p, obj) <= obj.radius + 0.4) {
      p.score += SCORE.capture;
      p.objectiveScore += SCORE.capture;
      p.captures = (p.captures || 0) + 1;
      addUlt(p, 14);
    }
  }
  match.events.push({ type: 'announce', key: 'announce.captured', team, obj: obj.id });
}

function finishRound(match, winner) {
  if (match.phase === 'ended') return;
  if (winner) match.teamScore[winner] += 1;
  const aliveWinner = match.players.filter((p) => p.team === winner && p.alive && !p.isDecoy);
  if (aliveWinner.length === 1) aliveWinner[0].lastAliveWin = true;
  const deaths = match.players.filter((p) => p.team === winner && p.matchDeaths === 0);
  if (winner && deaths.length === match.players.filter((p) => p.team === winner && !p.isDecoy).length) {
    for (const p of deaths) p.flawlessRound = true;
  }
  match.events.push({ type: 'announce', key: 'announce.round', team: winner || 'draw', round: match.round });
  if (match.teamScore.a >= match.rules.scoreLimit || match.teamScore.b >= match.rules.scoreLimit) {
    endMatch(match, { winnerTeam: match.teamScore.a === match.teamScore.b ? null : match.teamScore.a > match.teamScore.b ? 'a' : 'b', reason: 'rounds' });
    return;
  }
  match.round += 1;
  match.roundTime = match.rules.roundTime || 80;
  for (const p of match.players) {
    if (p.isDecoy || p.isDummy) continue;
    p.lives = match.rules.lives || 1;
    spawnPlayer(match, p);
  }
}

function hpSum(match, team) {
  return match.players.filter((p) => p.team === team && p.alive && !p.isDecoy).reduce((s, p) => s + p.hp, 0);
}

function scoresTied(match) {
  if (!match.rules.teams) {
    const vals = match.players.filter((p) => !p.isDummy).map((p) => p.elimCount || p.kills);
    vals.sort((a, b) => b - a);
    return vals.length > 1 && vals[0] === vals[1];
  }
  return match.teamScore.a === match.teamScore.b;
}

function leadingTeam(match) {
  if (!match.rules.teams) return null;
  if (match.teamScore.a === match.teamScore.b) return null;
  return match.teamScore.a > match.teamScore.b ? 'a' : 'b';
}

function leadingPlayer(match) {
  const list = match.players.filter((p) => !p.isDummy && !p.isDecoy);
  list.sort((a, b) => (b.elimCount || b.kills) - (a.elimCount || a.kills) || b.score - a.score);
  return list[0]?.id || null;
}

export function endMatch(match, result = {}) {
  if (match.phase === 'ended') return;
  match.phase = 'ended';
  match.winnerTeam = result.winnerTeam ?? leadingTeam(match);
  match.winnerId = result.winnerId ?? (match.winnerTeam ? null : leadingPlayer(match));
  match.endReason = result.reason || 'time';
  match.events.push({ type: 'announce', key: 'announce.circuit_closed', team: match.winnerTeam, winnerId: match.winnerId });
}

export function summarize(match) {
  const players = match.players.filter((p) => !p.isDecoy && !p.isDummy).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    isBot: !!p.isBot,
    characterId: p.characterId,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    score: p.score,
    objectiveScore: p.objectiveScore || 0,
    damage: Math.round(p.damageDealt || 0),
    shots: p.shots || 0,
    hits: p.hits || 0,
    headshots: p.headshots || 0,
    weaponKills: { ...p.weaponKills },
    weaponsUsed: [...(p.weaponsUsed || [])],
    matchKills: p.matchKills || 0,
    matchDeaths: p.matchDeaths || 0,
    matchAssists: p.matchAssists || 0,
    matchHeadshots: p.matchHeadshots || 0,
    clutchKills: p.clutchKills || 0,
    revenges: p.revenges || 0,
    bestMulti: p.bestMulti || 0,
    ultKills: p.ultKills || 0,
    meleeKills: p.meleeKills || 0,
    longShots: p.longShots || 0,
    pointBlank: p.pointBlank || 0,
    slideKills: p.slideKills || 0,
    defenseKills: p.defenseKills || 0,
    experimentalKills: p.experimentalKills || 0,
    pistolKills: p.pistolKills || 0,
    lmgDamage: p.lmgDamage || 0,
    oneMag: p.oneMag || 0,
    holdTime: p.holdTime || 0,
    captures: p.captures || 0,
    coresStolen: p.coresStolen || 0,
    coresReturned: p.coresReturned || 0,
    slides: p.slides || 0,
    slideJumps: p.slideJumps || 0,
    vaults: p.vaults || 0,
    dodges: p.dodges || 0,
    wallKicks: p.wallKickCount || 0,
    distance: p.distance || 0,
    airTime: p.airTime || 0,
    longSlide: p.longSlide || 0,
    glassBreaks: p.glassBreaks || 0,
    gunGameWin: !!p.gunGameWin,
    lastAliveWin: !!p.lastAliveWin,
    flawlessRound: !!p.flawlessRound,
  }));
  let topObjective = null;
  let bestObj = -1;
  for (const p of players) if (p.objectiveScore > bestObj) { bestObj = p.objectiveScore; topObjective = p.id; }
  return {
    id: match.id,
    modeId: match.modeId,
    mapId: match.map.id,
    winnerTeam: match.winnerTeam,
    winnerId: match.winnerId,
    reason: match.endReason,
    duration: match.time,
    completed: match.phase === 'ended',
    ranked: !!match.rules.ranked,
    botMatch: match.players.some((p) => p.isBot),
    teamScore: { ...match.teamScore },
    tripleHold: match.tripleHold,
    comeback: (match.winnerTeam === 'a' && (match.leadA ?? 0) <= -12) || (match.winnerTeam === 'b' && (match.leadB ?? 0) <= -12),
    players,
    topObjective,
  };
}

export function consumeEvents(match) {
  const ev = match.events;
  match.events = [];
  return ev;
}

export function publicPlayer(p, full = false) {
  return {
    id: p.id, name: p.name, team: p.team, characterId: p.characterId,
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
    vx: p.vx, vy: p.vy, vz: p.vz,
    crouch: !!p.crouch, sliding: !!p.sliding, aiming: !!p.aiming, sprinting: !!p.sprinting,
    onGround: !!p.onGround, dodging: !!p.dodging, vault: (p.vaultT || 0) > 0,
    hp: p.hp, armor: p.armor, alive: p.alive, maxHp: p.maxHp,
    reloadT: p.reloadT || 0, meleeCd: p.meleeCd || 0,
    weaponId: currentDef(p).id, firing: !!p.firing, reloading: !!p.reloading,
    shoulder: p.shoulder || 1, revealed: (p.revealedT || 0) > 0,
    score: p.score, kills: p.kills, deaths: p.deaths, assists: p.assists,
    ping: p.ping || 0, isBot: !!p.isBot, isDummy: !!p.isDummy, isDecoy: !!p.isDecoy,
    ult: full ? p.ult : undefined,
    tacticalCd: full ? p.tacticalCd : undefined,
    dodgeCd: full ? p.dodgeCd : undefined,
    mag: full ? (p.weapons?.[p.weaponSlot]?.mag ?? 0) : undefined,
    reserve: full ? (p.weapons?.[p.weaponSlot]?.reserve ?? 0) : undefined,
    deathT: full ? p.deathT : undefined,
    killerId: full ? p.killerId : undefined,
    carrying: p.carrying || null,
    tier: p.tier || 0,
    charge: full ? (p.charge || 0) : 0,
    spawnImmunity: p.spawnImmunity || 0,
    phasing: (p.phasingT || 0) > 0,
    flashed: (p.flashed || 0) > 0,
    color: p.color || 0,
    objectiveScore: p.objectiveScore || 0,
  };
}
