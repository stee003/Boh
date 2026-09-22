import { clamp, forwardXZ, distXZ } from '../math.js';
import { penetrates } from './physics.js';

const R = 0.34;

export function stepAbilityTimers(player, dt) {
  player.tacticalCd = Math.max(0, (player.tacticalCd || 0) - dt);
  player.speedBuffT = Math.max(0, (player.speedBuffT || 0) - dt);
  player.damageBuffT = Math.max(0, (player.damageBuffT || 0) - dt);
  player.phasingT = Math.max(0, (player.phasingT || 0) - dt);
  player.abilityLockT = Math.max(0, (player.abilityLockT || 0) - dt);
  player.revealedT = Math.max(0, (player.revealedT || 0) - dt);
  player.slowT = Math.max(0, (player.slowT || 0) - dt);
  player.ultActiveT = Math.max(0, (player.ultActiveT || 0) - dt);
  player.resistT = Math.max(0, (player.resistT || 0) - dt);
  player.slamWindow = Math.max(0, (player.slamWindow || 0) - dt);
  player.jumpMul = player.ultId === 'skyhook' && player.ultActiveT > 0 ? 1.35 : 1;
  player.gravMul = player.ultId === 'skyhook' && player.ultActiveT > 0 ? 0.72 : 1;
  player.meleeMul = player.ultId === 'unbreakable' && player.ultActiveT > 0 ? 1.45 : 1;
  if (player.speedBuffT > 0) player.speedMul = (player.speedMul || 1) * (player.speedBuff || 1.2);
  if (player.damageBuffT <= 0) player.damageBuff = 1;
  if (player.resistT <= 0) player.resist = 0;
  if (player.ultActiveT <= 0) player.ultId = null;
}

export function tryAbilities(match, player) {
  const input = player.input || {};
  if (player.abilityLockT > 0 || !match.rules.abilities) return;
  if (input.tactical && !player.prevTac && player.tacticalCd <= 0) {
    if (castTactical(match, player)) {
      const cd = (player.kit?.tactical?.cd || 16) * (player.mods?.cdMul || 1);
      player.tacticalCd = cd;
    }
  }
  if (input.ultimate && !player.prevUlt && (player.ult || 0) >= 100 && player.ultActiveT <= 0) {
    if (castUltimate(match, player)) {
      player.ult = 0;
    }
  }
  player.prevTac = !!input.tactical;
  player.prevUlt = !!input.ultimate;
  if (player.slamLanding) {
    player.slamLanding = false;
    blast(match, player, player.x, player.y, player.z, 3.6, 38, 'slam');
  }
}

function castTactical(match, player) {
  const tac = player.kit?.tactical;
  if (!tac) return false;
  const id = tac.id;
  if (id === 'overdrive') {
    player.speedBuff = tac.speed;
    player.speedBuffT = tac.duration;
  } else if (id === 'aegis') {
    placeWall(match, player, 1.7, 1.8, 0.28, tac.hp, tac.duration, 'aegis');
  } else if (id === 'ping_sweep') {
    reveal(match, player, tac.radius, tac.duration, false);
  } else if (id === 'pylon') {
    placeTurret(match, player, tac);
  } else if (id === 'blink') {
    if (!blink(match, player, tac.distance || 8)) return false;
  } else if (id === 'snare') {
    placeZone(match, player, 'snare', tac);
  } else if (id === 'shade') {
    placeZone(match, player, 'shade', tac);
  } else if (id === 'hex_drone') {
    match.deployables.push({
      id: `dep${match.rng()}`, kind: 'drone', ownerId: player.id, team: player.team,
      x: player.x, y: player.y + 1.8, z: player.z, hp: 60, ttl: tac.duration, radius: tac.radius, cd: 0, dead: false,
    });
  } else if (id === 'slam') {
    player.slamWindow = tac.window || 2.2;
    player.vy = Math.max(player.vy, 6.5);
    player.onGround = false;
  } else if (id === 'updraft') {
    player.vy = tac.force || 11;
    player.onGround = false;
  } else if (id === 'mend') {
    placeZone(match, player, 'mend', tac);
  } else if (id === 'phase') {
    player.phasingT = tac.duration || 0.6;
  } else return false;
  match.events.push({ type: 'ability', playerId: player.id, ability: id, kind: 'tactical' });
  return true;
}

function castUltimate(match, player) {
  const ult = player.kit?.ultimate;
  if (!ult) return false;
  const id = ult.id;
  player.ultId = id;
  player.ultActiveT = ult.duration || 0.1;
  if (id === 'vector_line') {
    player.speedBuff = ult.speed;
    player.speedBuffT = ult.duration;
  } else if (id === 'iron_hymn') {
    player.armor = Math.min(80, (player.armor || 0) + (ult.armor || 40));
    player.resist = ult.resist || 0.2;
    player.resistT = ult.duration;
  } else if (id === 'lattice_eye') {
    reveal(match, player, ult.radius || 80, ult.duration, true);
  } else if (id === 'fortify') {
    placeWall(match, player, 6.2, 2.4, 0.4, ult.hp, ult.duration, 'fortify');
  } else if (id === 'shatter') {
    const dir = forwardXZ(player.yaw);
    match.projectiles.push({
      id: `sh${match.rng()}`, ownerId: player.id, team: player.team, weaponId: 'shatter',
      x: player.x + dir.x, y: player.y + 1.3, z: player.z + dir.z,
      vx: dir.x * 16, vy: 6, vz: dir.z * 16, life: 1.6, damage: ult.damage || 78,
      radius: 0.2, gravity: 12, explode: true, radiusBlast: ult.radius || 4.6,
      bounces: 0, pierce: 0, hitIds: [], traveled: 0, headMul: 1, limbMul: 1,
    });
  } else if (id === 'bastion_dome') {
    match.deployables.push({
      id: `dep${match.rng()}`, kind: 'dome', ownerId: player.id, team: player.team,
      x: player.x, y: player.y, z: player.z, hp: ult.hp || 420, ttl: ult.duration, radius: ult.radius || 4.4, dead: false,
    });
  } else if (id === 'mirror') {
    for (let i = 0; i < (ult.count || 2); i++) spawnDecoy(match, player, i);
  } else if (id === 'blackout') {
    for (const o of match.players) {
      if (!o.alive || o.team === player.team) continue;
      if (distXZ(o, player) <= (ult.radius || 12)) {
        o.abilityLockT = Math.max(o.abilityLockT || 0, ult.duration || 5);
        o.revealedT = 0;
      }
    }
    for (const d of match.deployables) {
      if (d.team !== player.team && distXZ(d, player) <= (ult.radius || 12)) d.disabledT = ult.duration || 5;
    }
  } else if (id === 'unbreakable') {
    player.resist = ult.resist || 0.18;
    player.resistT = ult.duration;
  } else if (id === 'skyhook') {
    player.ultActiveT = ult.duration;
  } else if (id === 'triage') {
    for (const o of match.players) {
      if (!o.alive || o.team !== player.team) continue;
      if (distXZ(o, player) <= (ult.radius || 12)) {
        const before = o.hp;
        o.hp = Math.min(o.maxHp, o.hp + (ult.heal || 40));
        const healed = o.hp - before;
        if (healed > 0 && o.id !== player.id) {
          player.score += 25;
          player.objectiveScore = (player.objectiveScore || 0) + 25;
          player.healed = (player.healed || 0) + healed;
          addUlt(player, healed * 0.04);
        }
      }
    }
  } else if (id === 'catalog') {
    player.catalogT = ult.duration;
    player.ultActiveT = ult.duration;
  } else return false;
  match.events.push({ type: 'ultimate', playerId: player.id, ability: id });
  return true;
}

function placeWall(match, player, w, h, d, hp, ttl, kind) {
  const dir = forwardXZ(player.yaw);
  const x = player.x + dir.x * 1.5;
  const z = player.z + dir.z * 1.5;
  const y = player.y;
  const box = {
    id: `wall${match.rng()}`,
    min: { x: x - w / 2, y, z: z - d / 2 },
    max: { x: x + w / 2, y: y + h, z: z + d / 2 },
    mat: 'trim', solid: true, deployable: true,
  };
  // orient roughly: if facing mostly X, swap w/d
  if (Math.abs(dir.x) > Math.abs(dir.z)) {
    box.min.x = x - d / 2; box.max.x = x + d / 2;
    box.min.z = z - w / 2; box.max.z = z + w / 2;
  }
  match.deployables.push({
    id: box.id, kind, ownerId: player.id, team: player.team,
    x, y, z, hp, maxHp: hp, ttl, box, dead: false,
  });
}

function placeTurret(match, player, tac) {
  const dir = forwardXZ(player.yaw);
  match.deployables.push({
    id: `dep${match.rng()}`, kind: 'pylon', ownerId: player.id, team: player.team,
    x: player.x + dir.x * 1.3, y: player.y, z: player.z + dir.z * 1.3,
    hp: tac.hp || 140, maxHp: tac.hp || 140, ttl: tac.duration || 14, cd: 0.4, dead: false,
    box: null,
  });
}

function placeZone(match, player, kind, tac) {
  const dir = forwardXZ(player.yaw);
  match.deployables.push({
    id: `dep${match.rng()}`, kind, ownerId: player.id, team: player.team,
    x: player.x + dir.x * 2.2, y: player.y, z: player.z + dir.z * 2.2,
    hp: 1, ttl: tac.duration || 5, radius: tac.radius || 4, slow: tac.slow || 0.4,
    hps: tac.hps || 0, dead: false,
  });
}

function reveal(match, player, radius, duration, all) {
  for (const o of match.players) {
    if (!o.alive || o.team === player.team) continue;
    if (!all && distXZ(o, player) > radius) continue;
    if (!all && inSmoke(match, o)) continue;
    o.revealedT = Math.max(o.revealedT || 0, duration);
  }
  player.score += 10;
}

export function inSmoke(match, player) {
  for (const d of match.deployables || []) {
    if (d.dead || d.kind !== 'shade') continue;
    if (distXZ(d, player) <= (d.radius || 3.5) && Math.abs((player.y + 1) - d.y) < 2.4) return true;
  }
  return false;
}

function blink(match, player, distance) {
  const dir = forwardXZ(player.yaw);
  const solids = match._solidCache || [];
  for (let d = distance; d >= 2; d -= 0.8) {
    const x = player.x + dir.x * d;
    const z = player.z + dir.z * d;
    if (!penetrates(x, player.y + 0.05, z, R, 1.7, solids)) {
      player.x = x;
      player.z = z;
      match.events.push({ type: 'blink', playerId: player.id, x, z });
      return true;
    }
  }
  return false;
}

function spawnDecoy(match, player, i) {
  const dir = forwardXZ(player.yaw + (i === 0 ? 0.4 : -0.4));
  const decoy = {
    id: `dec${match.rng()}`,
    name: player.name,
    team: player.team,
    isBot: false,
    isDecoy: true,
    isDummy: false,
    characterId: player.characterId,
    x: player.x + dir.x * 1.2,
    y: player.y,
    z: player.z + dir.z * 1.2,
    vx: dir.x * 6, vy: 0, vz: dir.z * 6,
    yaw: player.yaw, pitch: 0,
    hp: 1, maxHp: 1, armor: 0, alive: true,
    crouch: false, sliding: false, aiming: false, sprinting: true,
    weaponSlot: 0, weapons: player.weapons, shoulder: player.shoulder,
    input: { moveX: 0, moveY: 1, yaw: player.yaw, pitch: 0 },
    decoyT: 8, mods: {}, score: 0, kills: 0, deaths: 0, assists: 0,
    spawnImmunity: 0, phasingT: 0, revealedT: 0,
  };
  match.players.push(decoy);
}

export function stepDeployables(match, dt) {
  for (const d of match.deployables) {
    if (d.dead) continue;
    d.ttl -= dt;
    d.disabledT = Math.max(0, (d.disabledT || 0) - dt);
    if (d.ttl <= 0 || d.hp <= 0) { d.dead = true; if (d.box) d.box.solid = false; continue; }
    if (d.disabledT > 0) continue;
    if (d.kind === 'pylon') {
      d.cd -= dt;
      if (d.cd <= 0) {
        d.cd = 0.48;
        const target = nearestEnemy(match, d, 16);
        if (target) {
          const origin = { x: d.x, y: d.y + 1.3, z: d.z };
          const dir = normalize(target.x - origin.x, target.y + 1 - origin.y, target.z - origin.z);
          match.events.push({ type: 'tracer', origin, point: { x: target.x, y: target.y + 1, z: target.z }, team: d.team, glow: true, weaponId: 'pylon' });
          const owner = match.players.find((p) => p.id === d.ownerId);
          if (owner && match.hurt) match.hurt(target, 7, owner, { zone: 'body', weaponId: 'pylon', dist: distXZ(d, target), point: origin });
        }
      }
    } else if (d.kind === 'drone') {
      const owner = match.players.find((p) => p.id === d.ownerId);
      if (owner?.alive) {
        d.x += (owner.x - d.x) * Math.min(1, dt * 2);
        d.z += (owner.z - d.z) * Math.min(1, dt * 2);
        d.y = owner.y + 1.9;
      }
      d.cd = (d.cd || 0) - dt;
      if (d.cd <= 0) {
        d.cd = 0.7;
        const target = nearestEnemy(match, d, d.radius || 16);
        if (target) {
          target.revealedT = Math.max(target.revealedT || 0, 0.8);
          const owner2 = match.players.find((p) => p.id === d.ownerId);
          if (owner2 && match.hurt) match.hurt(target, 5, owner2, { zone: 'body', weaponId: 'hex_drone', dist: distXZ(d, target), point: { x: target.x, y: target.y + 1, z: target.z } });
        }
      }
    } else if (d.kind === 'snare') {
      for (const p of match.players) {
        if (!p.alive || p.team === d.team) continue;
        if (distXZ(p, d) <= d.radius) { p.slowT = 0.2; p.slowMul = d.slow || 0.55; }
      }
    } else if (d.kind === 'mend') {
      for (const p of match.players) {
        if (!p.alive || p.team !== d.team) continue;
        if (distXZ(p, d) <= d.radius) {
          const before = p.hp;
          p.hp = Math.min(p.maxHp, p.hp + (d.hps || 8) * dt);
          const healed = p.hp - before;
          const owner = match.players.find((o) => o.id === d.ownerId);
          if (owner && healed > 0 && p.id !== owner.id) {
            owner.healed = (owner.healed || 0) + healed;
            addUlt(owner, healed * 0.03);
          }
        }
      }
    }
  }
  match.deployables = match.deployables.filter((d) => !d.dead);
  for (const p of [...match.players]) {
    if (!p.isDecoy) continue;
    p.decoyT -= dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (p.decoyT <= 0 || !p.alive) {
      p.alive = false;
      match.players = match.players.filter((o) => o.id !== p.id);
    }
  }
}

function nearestEnemy(match, src, radius) {
  let best = null;
  let bestD = radius;
  for (const p of match.players) {
    if (!p.alive || p.isDecoy || p.team === src.team) continue;
    if (p.phasingT > 0) continue;
    const d = distXZ(p, src);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function normalize(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

function blast(match, player, x, y, z, radius, damage, weaponId) {
  match.events.push({ type: 'explode', point: { x, y, z }, radius });
  for (const o of match.players) {
    if (!o.alive || o.id === player.id) continue;
    if (o.team === player.team && !match.rules.friendlyFire) continue;
    const d = Math.hypot(o.x - x, o.y - y, o.z - z);
    if (d > radius) continue;
    if (match.hurt) match.hurt(o, damage * (1 - d / radius), player, { zone: 'body', weaponId, dist: d, point: { x, y, z }, splash: true });
  }
}

export function addUlt(player, n) {
  if (!player || player.ultActiveT > 0) return;
  player.ult = clamp((player.ult || 0) + n, 0, 100);
}
