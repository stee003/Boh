import { DIFFICULTY } from '../constants.js';
import { currentDef } from './combat.js';
import {
  distXZ, lookDir, shortestAngle, turnToward, yawFromDir,
} from '../math.js';
import { bodyHeight, raycast } from './physics.js';

const NAV_CACHE = new Map();

function keyOf(x, z, step) {
  return `${Math.round(x / step)}:${Math.round(z / step)}`;
}

function columnClear(x, y, z, radius, height, solids, ignore) {
  for (const b of solids) {
    if (!b.solid || b === ignore || b.boundary) continue;
    if (y + height <= b.min.y + 0.05 || y >= b.max.y - 0.02) continue;
    const cx = Math.max(b.min.x, Math.min(x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(z, b.max.z));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
  }
  return true;
}

export function buildNav(map) {
  const cacheKey = `${map.id}:${map.boxes?.length || 0}`;
  if (NAV_CACHE.has(cacheKey)) return NAV_CACHE.get(cacheKey);
  const b = map.bounds || { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
  const step = 2.0;
  const solids = (map.boxes || []).filter((box) => box.solid);
  const nodes = [];
  const grid = new Map();
  for (let x = b.minX + 1.2; x <= b.maxX - 1.2; x += step) {
    for (let z = b.minZ + 1.2; z <= b.maxZ - 1.2; z += step) {
      if (inKill(map, x, 0.2, z)) continue;
      const tops = [];
      for (const box of solids) {
        if (box.boundary) continue;
        if (x < box.min.x + 0.2 || x > box.max.x - 0.2 || z < box.min.z + 0.2 || z > box.max.z - 0.2) continue;
        const top = box.max.y;
        if (top < -3 || top > 12) continue;
        if (!columnClear(x, top + 0.08, z, 0.32, 1.7, solids, box)) continue;
        tops.push(top);
      }
      tops.sort((a, c) => a - c);
      let last = -999;
      for (const top of tops) {
        if (top - last < 0.5) continue;
        last = top;
        if (inKill(map, x, top + 0.2, z)) continue;
        const node = { id: nodes.length, x, y: top, z, links: [] };
        nodes.push(node);
        const k = keyOf(x, z, step);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(node);
      }
    }
  }
  for (const n of nodes) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        if (!ox && !oz) continue;
        const arr = grid.get(keyOf(n.x + ox * step, n.z + oz * step, step));
        if (!arr) continue;
        for (const m of arr) {
          const dy = m.y - n.y;
          const horiz = Math.hypot(m.x - n.x, m.z - n.z);
          if (horiz > step * 1.55) continue;
          if (dy > 1.15 || dy < -4.2) continue;
          const chest = { x: n.x, y: n.y + 0.9, z: n.z };
          const dir = { x: m.x - n.x, y: (m.y + 0.9) - chest.y, z: m.z - n.z };
          const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
          const hit = raycast(chest, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, len, solids);
          if (hit && hit.t < len - 0.4) continue;
          n.links.push({ id: m.id, jump: dy > 0.42, drop: dy < -0.6, cost: horiz + Math.abs(dy) * 0.4 });
        }
      }
    }
  }
  const nav = { nodes, step };
  NAV_CACHE.set(cacheKey, nav);
  return nav;
}

function inKill(map, x, y, z) {
  for (const zone of map.zones || []) {
    if (zone.type !== 'kill') continue;
    if (x >= zone.min.x && x <= zone.max.x && y >= zone.min.y && y <= zone.max.y && z >= zone.min.z && z <= zone.max.z) return true;
  }
  return false;
}

function nearestNode(nav, x, y, z) {
  let best = null;
  let bestD = 1e9;
  for (const n of nav.nodes) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2 + (n.y - y) ** 2 * 0.3;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function findPath(nav, from, to) {
  if (!nav?.nodes?.length) return [];
  const a = nearestNode(nav, from.x, from.y || 0, from.z);
  const b = nearestNode(nav, to.x, to.y || 0, to.z);
  if (!a || !b) return [];
  if (a.id === b.id) return [b];
  const open = [a.id];
  const came = new Map();
  const g = new Map([[a.id, 0]]);
  const f = new Map([[a.id, Math.hypot(a.x - b.x, a.z - b.z)]]);
  const seen = new Set();
  while (open.length) {
    open.sort((i, j) => (f.get(i) || 1e9) - (f.get(j) || 1e9));
    const cur = open.shift();
    if (cur === b.id) break;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = nav.nodes[cur];
    for (const link of node.links) {
      const ng = (g.get(cur) || 0) + link.cost;
      if (ng < (g.get(link.id) ?? 1e9)) {
        came.set(link.id, cur);
        g.set(link.id, ng);
        const m = nav.nodes[link.id];
        f.set(link.id, ng + Math.hypot(m.x - b.x, m.z - b.z));
        if (!open.includes(link.id)) open.push(link.id);
      }
    }
    if (seen.size > 800) break;
  }
  if (!came.has(b.id) && a.id !== b.id) return [b];
  const path = [b];
  let c = b.id;
  let guard = 0;
  while (came.has(c) && guard++ < 400) {
    c = came.get(c);
    path.push(nav.nodes[c]);
    if (c === a.id) break;
  }
  path.reverse();
  return path;
}

function los(match, from, to) {
  const origin = { x: from.x, y: from.y + 1.4, z: from.z };
  const target = { x: to.x, y: to.y + 1.1, z: to.z };
  const dir = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const hit = raycast(origin, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, len, match._solidCache || []);
  return !hit || hit.t > len - 0.4;
}

function desiredRange(def) {
  if (!def) return 14;
  if (def.category === 'shotgun' || def.id === 'pulse7') return 8;
  if (def.category === 'sniper') return 28;
  if (def.category === 'smg') return 12;
  if (def.category === 'lmg') return 18;
  if (def.melee) return 2;
  return 16;
}

export function thinkBot(match, bot, dt) {
  const skill = DIFFICULTY[bot.botDifficulty] || DIFFICULTY.normal;
  bot.thinkT = (bot.thinkT || 0) - dt;
  bot.reactT = Math.max(0, (bot.reactT || 0) - dt);
  bot.strafeT = (bot.strafeT || 0) - dt;
  const input = {
    moveX: 0, moveY: 0, yaw: bot.yaw, pitch: bot.pitch,
    jump: false, crouch: false, sprint: true, fire: false, aim: false,
    reload: false, melee: false, dodge: false, tactical: false, ultimate: false,
    interact: false, drop: false, shoulderTap: false, weaponSlot: -1,
  };
  if (!match.nav) match.nav = buildNav(match.map);
  const enemies = match.players.filter((p) => p.alive && !p.isDecoy && p.id !== bot.id && (p.team !== bot.team || p.team === 'ffa'));
  let visible = null;
  let visibleD = 1e9;
  for (const e of enemies) {
    const d = distXZ(bot, e);
    if (d < visibleD && d < 48 && los(match, bot, e) && !smokeBetween(match, bot, e)) {
      visible = e;
      visibleD = d;
    }
  }
  if (visible && visible !== bot._track) {
    bot._track = visible;
    bot.reactT = skill.react * (0.7 + match.rng() * 0.6);
    bot.trackTime = 0;
  }
  if (visible) bot.trackTime = (bot.trackTime || 0) + dt;
  else bot.trackTime = 0;

  if (bot.thinkT <= 0) {
    bot.thinkT = skill.think;
    bot.goal = pickGoal(match, bot, visible, skill);
    if (bot.goal) bot.path = findPath(match.nav, bot, bot.goal).slice(1);
  }

  let dest = bot.path?.[0];
  if (dest && distXZ(bot, dest) < 1.1 && Math.abs(bot.y - dest.y) < 1.2) {
    bot.path.shift();
    dest = bot.path[0];
  }

  if (visible && bot.reactT <= 0) {
    const eye = bot.y + bodyHeight(bot) - 0.15;
    const aimY = visible.y + (visible.crouch ? 0.7 : 1.15);
    const dx = visible.x - bot.x;
    const dz = visible.z - bot.z;
    const dy = aimY - eye;
    const flat = Math.hypot(dx, dz) || 1;
    const err = skill.error * (Math.PI / 180) * (0.35 + 0.65 * Math.exp(-(bot.trackTime || 0) / skill.track));
    const jitter = (match.rng() - 0.5) * err * 2;
    const wantYaw = yawFromDir(dx, dz) + jitter;
    const wantPitch = Math.atan2(dy, flat) + jitter * 0.6;
    bot.yaw = turnToward(bot.yaw, wantYaw, skill.turn * dt);
    bot.pitch = turnToward(bot.pitch, Math.max(-1.1, Math.min(1.1, wantPitch)), skill.turn * dt);
    const align = Math.abs(shortestAngle(bot.yaw, yawFromDir(dx, dz)));
    const def = currentDef(bot);
    const want = desiredRange(def);
    if (bot.strafeT <= 0) {
      bot.strafeT = 0.45 + match.rng() * 0.7;
      bot.strafe = match.rng() < 0.5 ? -1 : 1;
    }
    input.aim = visibleD > 10 && def.category !== 'shotgun';
    input.fire = align < (0.09 + err) && visibleD < (def.range || 40) * 1.1;
    input.sprint = visibleD > want + 4;
    input.crouch = false;
    if (visibleD > want + 3) input.moveY = 1;
    else if (visibleD < want - 3 && skill.retreatHp >= 0) input.moveY = -0.7;
    else input.moveY = 0.15;
    input.moveX = bot.strafe * (0.7 + (visibleD < 12 ? 0.3 : 0));
    if (bot.hp < skill.retreatHp && visibleD < 18) {
      input.moveY = -1;
      input.fire = bot.hp > 12 && align < 0.2;
      input.sprint = true;
    }
    if ((bot.weapons?.[bot.weaponSlot]?.mag || 1) <= 0) input.reload = true;
    if (skill.ability > 0.5 && match.rng() < skill.ability * dt * 0.8 && (bot.tacticalCd || 0) <= 0) input.tactical = true;
    if ((bot.ult || 0) >= 100 && match.rng() < 0.4) input.ultimate = true;
    if (skill.slide > 0.3 && visibleD > 8 && bot.onGround && match.rng() < skill.slide * dt) {
      input.sprint = true;
      input.crouch = true;
    }
    if (dest && dest.jump && distXZ(bot, dest) < 1.6) input.jump = true;
  } else if (dest) {
    const dx = dest.x - bot.x;
    const dz = dest.z - bot.z;
    bot.yaw = turnToward(bot.yaw, yawFromDir(dx, dz), 4.5 * dt);
    const localForward = Math.cos(shortestAngle(bot.yaw, yawFromDir(dx, dz)));
    input.moveY = localForward > 0.2 ? 1 : 0.4;
    input.sprint = true;
    if (dest.y > bot.y + 0.45 && distXZ(bot, dest) < 1.8) input.jump = true;
    if (dest.drop && bot.onGround && distXZ(bot, dest) < 1.2) input.moveY = 1;
  } else {
    input.moveY = 0.4;
    bot.yaw += dt * 0.4;
  }
  if (visible && skill.ability > 0.7 && (bot.dodgeCd || 0) <= 0 && bot.hp < 50 && match.rng() < 0.15) input.dodge = true;
  bot.input = input;
  void lookDir;
}

function pickGoal(match, bot, visible, skill) {
  if (bot.hp < skill.retreatHp && visible) {
    const away = { x: bot.x + (bot.x - visible.x), y: bot.y, z: bot.z + (bot.z - visible.z) };
    return away;
  }
  if (match.modeId === 'dominion' || match.modeId === 'pulsepoint') {
    const obj = [...(match.objectives || [])].sort((a, b) => distXZ(bot, a) - distXZ(bot, b))[0];
    if (obj && (!visible || match.rng() > skill.flank) && distXZ(bot, obj) > 3) return obj;
  }
  if (match.modeId === 'core_run') {
    const enemy = bot.team === 'a' ? 'b' : 'a';
    const core = match.cores?.[enemy];
    if (core && !core.carrier && distXZ(bot, core) > 2) return core;
    if (bot.carrying) return match.cores?.[bot.team];
  }
  if (visible && skill.flank > 0.4 && match.rng() < skill.flank * 0.5) {
    const side = match.rng() < 0.5 ? 1 : -1;
    return { x: visible.x + side * 8, y: visible.y, z: visible.z + side * -4 };
  }
  if (visible) return { x: visible.x, y: visible.y, z: visible.z };
  const nodes = match.nav?.nodes || [];
  if (!nodes.length) return { x: bot.x + 4, y: bot.y, z: bot.z };
  return nodes[match.rng.int(nodes.length)];
}

function smokeBetween(match, a, b) {
  for (const d of match.deployables || []) {
    if (d.dead || d.kind !== 'shade') continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if (Math.hypot(mx - d.x, mz - d.z) < (d.radius || 3)) return true;
  }
  return false;
}

export function clearNavCache() {
  NAV_CACHE.clear();
}
