import { MOVE } from '../constants.js';
import { clamp, lerp, lookDir, norm3 } from '../math.js';
import { resolveWeapon } from '../weapons.js';
import { aimRay, hitboxesOf, rayAABB, raySphere, raycast } from './physics.js';

const DEG = Math.PI / 180;

export function currentDef(player) {
  const slot = player.weaponSlot || 0;
  const state = player.weapons?.[slot] || player.weapons?.[0];
  if (!state) return resolveWeapon({ defId: 'linecut' });
  return resolveWeapon(state);
}

export function currentState(player) {
  return player.weapons?.[player.weaponSlot || 0] || player.weapons?.[0];
}

export function computeHitDamage(def, zone, dist, charge = 1) {
  let dmg = def.damage;
  if (def.fireMode === 'charge') dmg = 18 + (def.damage - 18) * clamp(charge, 0, 1);
  const mul = zone === 'head' ? (def.headMul || 1.6) : zone === 'limb' ? (def.limbMul || 0.85) : 1;
  dmg *= mul * clamp(charge && def.fireMode !== 'charge' ? charge : 1, 0.2, 1.5);
  if (def.fireMode !== 'charge') dmg = def.damage * mul;
  if (dist > (def.falloffStart || 10)) {
    const span = Math.max(0.2, (def.range || 40) - (def.falloffStart || 10));
    const t = clamp((dist - def.falloffStart) / span, 0, 1);
    dmg *= lerp(1, def.falloff ?? 0.7, t);
  }
  return dmg;
}

function deviate(dir, spread, rng) {
  if (spread <= 0.0001) return dir;
  const a = rng() * Math.PI * 2;
  const r = rng() * spread;
  const up = Math.abs(dir.y) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const rx = dir.y * up.z - dir.z * up.y;
  const ry = dir.z * up.x - dir.x * up.z;
  const rz = dir.x * up.y - dir.y * up.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const right = { x: rx / rl, y: ry / rl, z: rz / rl };
  const ux = dir.y * right.z - dir.z * right.y;
  const uy = dir.z * right.x - dir.x * right.z;
  const uz = dir.x * right.y - dir.y * right.x;
  return norm3({
    x: dir.x + right.x * Math.cos(a) * r + ux * Math.sin(a) * r,
    y: dir.y + right.y * Math.cos(a) * r + uy * Math.sin(a) * r,
    z: dir.z + right.z * Math.cos(a) * r + uz * Math.sin(a) * r,
  });
}

function lagged(match, player, attacker) {
  if (!match.lagQuery || !attacker || attacker.isBot) return player;
  const h = match.lagQuery(player.id, attacker.id);
  if (!h) return player;
  return { ...player, x: h.x, y: h.y, z: h.z, crouch: h.crouch, sliding: h.sliding };
}

export function domeBlock(origin, dir, dome, maxT) {
  const c = { x: dome.x, y: dome.y + 1.2, z: dome.z };
  const r = dome.radius || 4.4;
  const ocx = origin.x - c.x;
  const ocy = origin.y - c.y;
  const ocz = origin.z - c.z;
  const b = ocx * dir.x + ocy * dir.y + ocz * dir.z;
  const c0 = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  const disc = b * b - c0;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = -b - s;
  const t2 = -b + s;
  const inside = c0 <= 0;
  const t = inside ? t2 : t1;
  if (t < 0.05 || t > maxT) return null;
  return t;
}

function deeplyInside(pose, box) {
  if (!pose || !box?.min || !box?.max) return false;
  const reach = MOVE.radius * 0.55;
  if (pose.y + 1.5 <= box.min.y + 0.05 || pose.y >= box.max.y - 0.02) return false;
  const cx = Math.max(box.min.x, Math.min(pose.x, box.max.x));
  const cz = Math.max(box.min.z, Math.min(pose.z, box.max.z));
  return (pose.x - cx) ** 2 + (pose.z - cz) ** 2 < reach * reach;
}

export function traceShot(match, attacker, origin, dir, maxDist) {
  const solids = match._solidCache || [];
  let bestT = maxDist;
  let best = null;
  const world = raycast(origin, dir, bestT, solids);
  if (world) {
    bestT = world.t;
    best = { kind: 'world', t: world.t, box: world.box };
  }
  for (const d of match.deployables || []) {
    if (d.dead || d.kind !== 'dome') continue;
    const t = domeBlock(origin, dir, d, bestT);
    if (t != null && t < bestT) {
      bestT = t;
      best = { kind: 'dome', t, deployable: d };
    }
  }
  let playerBest = null;
  for (const p of match.players) {
    if (!p.alive || p.id === attacker.id) continue;
    if (p.spawnImmunity > 0 && !p.isDecoy) continue;
    if (p.phasingT > 0) continue;
    const pose = lagged(match, p, attacker);
    for (const hb of hitboxesOf(pose)) {
      const t = hb.type === 'sphere'
        ? raySphere(origin, dir, hb.c, hb.r, maxDist)
        : rayAABB(origin, dir, hb, maxDist);
      if (t != null && (!playerBest || t < playerBest.t)) {
        playerBest = { kind: 'player', t, player: p, zone: hb.zone, pose };
      }
    }
  }
  if (playerBest && (!best || playerBest.t < best.t)) {
    best = playerBest;
    bestT = playerBest.t;
  } else if (
    playerBest && best?.kind === 'world' && deeplyInside(playerBest.pose, best.box)
    && playerBest.t <= best.t + 0.35
  ) {
    // A victim swallowed by the blocking volume is hittable; a brush in front of cover is not.
    best = playerBest;
    bestT = playerBest.t;
  }
  if (best) {
    best.point = {
      x: origin.x + dir.x * best.t,
      y: origin.y + dir.y * best.t,
      z: origin.z + dir.z * best.t,
    };
    best.dist = best.t;
  }
  return best;
}

function spreadOf(player, def) {
  let s = player.aiming ? def.spread.ads : def.spread.hip;
  const spd = Math.hypot(player.vx, player.vz);
  if (!player.onGround) s += def.spread.air || 0;
  else if (player.sliding) s += def.spread.slide || 0;
  else if (spd > 1.5) s += (def.spread.move || 0) * Math.min(1, spd / 8);
  s += player.heat || 0;
  if (player.crouch && player.onGround && spd < 1.2 && player.aiming) s *= 0.85;
  return s;
}

function applyRecoil(player, def) {
  const pat = def.recoil?.length ? def.recoil : [[0.4, 0]];
  const idx = Math.min(player.shotIndex || 0, pat.length - 1);
  const scale = (def.recoilScale || 1) * (player.aiming ? 0.7 : 1) * (player.crouch ? 0.85 : 1);
  const kickP = pat[idx][0] * scale * DEG;
  const kickY = pat[idx][1] * scale * DEG;
  player.pitch = clamp(player.pitch + kickP, -1.35, 1.25);
  player.yaw += kickY;
  player.recoilP = (player.recoilP || 0) + kickP;
  player.recoilY = (player.recoilY || 0) + kickY;
  player.shotIndex = (player.shotIndex || 0) + 1;
  player.viewKick = Math.min(1.2, (player.viewKick || 0) + 0.5);
}

function recoverRecoil(player, def, dt, firing) {
  player.viewKick = Math.max(0, (player.viewKick || 0) - dt * 6);
  if (firing) return;
  const rate = (def?.recoilRecovery || 10) * DEG * dt;
  const nextP = clamp((player.recoilP || 0) - Math.sign(player.recoilP || 0) * rate, Math.min(0, player.recoilP || 0), Math.max(0, player.recoilP || 0));
  const nextY = clamp((player.recoilY || 0) - Math.sign(player.recoilY || 0) * rate * 1.15, Math.min(0, player.recoilY || 0), Math.max(0, player.recoilY || 0));
  player.pitch -= (player.recoilP || 0) - nextP;
  player.yaw -= (player.recoilY || 0) - nextY;
  player.recoilP = nextP;
  player.recoilY = nextY;
  player.pitch = clamp(player.pitch, -1.35, 1.25);
  if (Math.abs(nextP) < 0.002 && (player.shotIndex || 0) > 0) player.shotIndex = 0;
  player.heat = Math.max(0, (player.heat || 0) - dt * 0.02);
}

function spawnProjectile(match, player, def, origin, dir, charge = 1) {
  const speed = (def.projectileSpeed || 70) * (charge > 0 && def.fireMode === 'charge' ? 0.7 + charge * 0.5 : 1) * (player.mods?.projectileSpeed || 1);
  match.projectiles.push({
    id: `p${match.rng()}`,
    ownerId: player.id,
    team: player.team,
    weaponId: def.id,
    x: origin.x, y: origin.y, z: origin.z,
    vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
    life: 2.4,
    damage: def.fireMode === 'charge' ? 18 + (def.damage - 18) * charge : def.damage,
    headMul: def.headMul, limbMul: def.limbMul,
    radius: def.radius || 0.08,
    bounces: def.bounces || 0,
    pierce: def.pierce || 0,
    gravity: def.gravity || 0,
    splitAt: def.splitAt || 0,
    splitCount: def.splitCount || 0,
    splitDamage: def.splitDamage || 0,
    splitSpread: def.splitSpread || 0,
    traveled: 0,
    slow: def.slow || 0,
    slowTime: def.slowTime || 0,
    hitIds: [],
    color: def.visual?.accent || '#5cffd6',
  });
}

function deliver(match, attacker, def, hit, dmg) {
  if (!hit) return;
  if (hit.kind === 'world' && hit.box?.breakable) {
    hit.box.hp -= dmg;
    match.events.push({ type: 'impact', point: hit.point, mat: hit.box.mat, normal: null });
    if (hit.box.hp <= 0) {
      hit.box.hp = 0;
      hit.box.solid = false;
      hit.box.broken = true;
      hit.box.hidden = true;
      attacker.glassBreaks = (attacker.glassBreaks || 0) + 1;
      match.events.push({ type: 'glass', id: hit.box.id, point: hit.point });
    }
    return;
  }
  if (hit.kind === 'player' && match.hurt) {
    const friendly = attacker.team === hit.player.team && attacker.team !== 'ffa' && !match.rules.friendlyFire;
    if (friendly) {
      match.events.push({ type: 'blocked', point: hit.point });
      return;
    }
    match.hurt(hit.player, dmg, attacker, {
      zone: hit.zone, weaponId: def.id, dist: hit.dist || 0, point: hit.point, slow: def.slow, slowTime: def.slowTime,
    });
  } else if (hit.kind === 'world' || hit.kind === 'dome') {
    match.events.push({ type: 'impact', point: hit.point, mat: hit.box?.mat || 'metal' });
  }
}

function fireOne(match, player, def, charge = 1) {
  const state = currentState(player);
  if (!def.melee) {
    if (!state || state.mag <= 0) {
      match.events.push({ type: 'dry', playerId: player.id });
      player.fireCd = 0.28;
      return false;
    }
    state.mag -= 1;
  }
  player.shots = (player.shots || 0) + 1;
  player.magKills = player.magKills || 0;
  applyRecoil(player, def);
  const ads = player.aiming ? 1 : 0;
  const ray = aimRay(player, match._solidCache, ads);
  const spread = spreadOf(player, def) * (def.fireMode === 'charge' ? 1 - charge * 0.4 : 1);
  const pellets = def.pellets || 1;
  player.heat = (player.heat || 0) + (def.heat || 0);
  match.events.push({
    type: 'shot', playerId: player.id, weaponId: def.id, origin: ray.origin,
    quiet: !!def.quiet, sound: def.sound, point: ray.aim,
  });
  if (def.projectile) {
    const dir = deviate(ray.dir, spread, match.rng);
    spawnProjectile(match, player, def, ray.origin, dir, charge);
    return true;
  }
  for (let i = 0; i < pellets; i++) {
    const dir = deviate(ray.dir, spread, match.rng);
    const hit = traceShot(match, player, ray.origin, dir, Math.max(8, def.range || 80));
    const dist = hit?.dist || (def.range || 40);
    const dmg = computeHitDamage(def, hit?.zone || 'body', dist, charge) * (player.damageBuff || 1);
    if (hit) deliver(match, player, def, hit, dmg);
    match.events.push({
      type: 'tracer',
      origin: ray.origin,
      point: hit?.point || {
        x: ray.origin.x + dir.x * 40,
        y: ray.origin.y + dir.y * 40,
        z: ray.origin.z + dir.z * 40,
      },
      weaponId: def.id,
      team: player.team,
      glow: !!def.visual?.glow,
    });
  }
  return true;
}

export function stepWeapons(match, player, dt) {
  const input = player.input || {};
  player.fireCd = Math.max(0, (player.fireCd || 0) - dt);
  player.meleeCd = Math.max(0, (player.meleeCd || 0) - dt);
  player.sprintToFire = Math.max(0, (player.sprintToFire || 0) - dt);
  const firingHeld = !!input.fire && player.phasingT <= 0 && player.spawnImmunity < 0.55;

  if (input.weaponSlot >= 0 && input.weaponSlot <= 2 && input.weaponSlot !== player.weaponSlot) {
    player.weaponSlot = input.weaponSlot;
    player.reloading = false;
    player.reloadT = 0;
    player.burstQueue = 0;
    player.sprintToFire = 0.08;
  }

  const def = currentDef(player);
  const state = currentState(player);

  // Switch clears reload first. Auto-reload only the slot that is actually empty after that.
  const emptyMag = !!(state && state.mag <= 0);
  const reloadTime = emptyMag ? (def.reloadEmpty || 0) : (def.reload || 0);
  const canReload = !!(state && !def.melee && !player.reloading && state.mag < def.mag && state.reserve > 0 && reloadTime > 0);
  const manual = !!input.reload && canReload;
  const auto = !manual && canReload && emptyMag && (def.reloadEmpty || 0) > 0 && (player.burstQueue || 0) <= 0;
  if (manual || auto) {
    player.reloading = true;
    player.reloadT = reloadTime * (player.reloadMul || 1);
    player.burstQueue = 0;
    match.events.push({ type: 'reload_start', playerId: player.id, auto });
  }
  if (player.reloading) {
    if (firingHeld && state.mag > 0) {
      player.reloading = false;
      player.reloadT = 0;
    } else {
      player.reloadT -= dt;
      if (player.reloadT <= 0) {
        if (def.shellReload && state.mag < def.mag && state.reserve > 0) {
          state.mag += 1;
          state.reserve -= 1;
          if (state.mag < def.mag && state.reserve > 0) player.reloadT = def.reload;
          else player.reloading = false;
        } else {
          const need = def.mag - state.mag;
          const take = Math.min(need, state.reserve);
          state.mag += take;
          state.reserve -= take;
          player.reloading = false;
          match.events.push({ type: 'reloaded', playerId: player.id });
        }
      }
    }
  }

  if (player.wasSprinting && firingHeld) player.sprintToFire = Math.max(player.sprintToFire, def.sprintToFire || 0.1);
  player.wasSprinting = !!player.sprinting;

  recoverRecoil(player, def, dt, firingHeld && player.fireCd > 0);

  const meleeHeld = !!input.melee || (def.melee && firingHeld);
  if (meleeHeld && !player.prevMelee && player.meleeCd <= 0 && player.phasingT <= 0) {
    doMelee(match, player);
  }
  player.prevMelee = meleeHeld;

  if (player.reloading || player.sprintToFire > 0 || player.vaultT > 0 || player.phasingT > 0) {
    player.firing = false;
    return;
  }

  if (def.melee) {
    player.firing = false;
    return;
  }

  if (def.fireMode === 'charge') {
    if (firingHeld && state?.mag > 0) {
      player.charge = Math.min(1, (player.charge || 0) + dt / (def.chargeTime || 0.8));
      player.speedMul = (player.speedMul || 1) * (def.chargeSlow || 0.7);
      player.firing = false;
    } else if ((player.charge || 0) >= (def.minCharge || 0.2)) {
      fireOne(match, player, def, player.charge);
      player.charge = 0;
      player.fireCd = 1 / def.fireRate;
      player.firing = true;
    } else player.charge = 0;
    return;
  }

  if (def.fireMode === 'burst') {
    if (firingHeld && !player.prevFire && player.fireCd <= 0 && (player.burstQueue || 0) <= 0) {
      player.burstQueue = def.burst || 3;
    }
    if ((player.burstQueue || 0) > 0 && player.fireCd <= 0) {
      const ok = fireOne(match, player, def, 1);
      player.burstQueue -= 1;
      player.fireCd = player.burstQueue > 0 ? (def.burstInterval || 0.05) : 1 / (def.fireRate * (player.fireRateMul || 1));
      if (!ok) player.burstQueue = 0;
      player.firing = true;
    } else player.firing = false;
    player.prevFire = firingHeld;
    return;
  }

  if (def.fireMode === 'auto') {
    if (firingHeld && player.fireCd <= 0) {
      fireOne(match, player, def, 1);
      player.fireCd = 1 / (def.fireRate * (player.fireRateMul || 1));
      player.firing = true;
    } else player.firing = firingHeld && player.fireCd > 0;
  } else {
    if (firingHeld && !player.prevFire && player.fireCd <= 0) {
      fireOne(match, player, def, 1);
      player.fireCd = 1 / (def.fireRate * (player.fireRateMul || 1));
      player.firing = true;
    } else player.firing = false;
  }
  player.prevFire = firingHeld;
  if (!player.firing && player.fireCd <= 0) player.shotIndex = Math.max(0, (player.shotIndex || 0) - 0);
}

function doMelee(match, player) {
  const melee = player.weapons?.[2];
  const def = resolveWeapon(melee || { defId: 'vectorblade' });
  player.meleeCd = (def.meleeCd || 0.7) / (player.meleeMul || 1);
  const dir = lookDir(player.yaw, player.pitch * 0.3);
  player.vx += dir.x * (def.lunge || 3);
  player.vz += dir.z * (def.lunge || 3);
  match.events.push({ type: 'melee', playerId: player.id, weaponId: def.id });
  let hitAny = false;
  for (const other of match.players) {
    if (!other.alive || other.id === player.id) continue;
    const dx = other.x - player.x;
    const dz = other.z - player.z;
    const dy = (other.y + 1) - (player.y + 1);
    const dist = Math.hypot(dx, dy, dz);
    if (dist > (def.range || 2.2) + 0.4) continue;
    const flat = Math.hypot(dx, dz) || 1;
    const dot = (dx / flat) * dir.x + (dz / flat) * dir.z;
    if (dot < Math.cos(def.meleeArc || 0.9)) continue;
    const friendly = player.team === other.team && player.team !== 'ffa' && !match.rules.friendlyFire;
    if (friendly) continue;
    const zone = dy > 0.45 ? 'head' : 'body';
    const dmg = def.damage * (zone === 'head' ? def.headMul : 1) * (player.meleeMul || 1) * (player.damageBuff || 1);
    if (match.hurt) match.hurt(other, dmg, player, { zone, weaponId: def.id, dist, point: { x: other.x, y: other.y + 1, z: other.z }, melee: true, slow: def.slow, slowTime: def.slowTime });
    hitAny = true;
  }
  if (!hitAny) match.events.push({ type: 'melee_whiff', playerId: player.id });
}

export function stepProjectiles(match, dt) {
  const next = [];
  for (const p of match.projectiles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    const owner = match.players.find((pl) => pl.id === p.ownerId);
    p.vy -= (p.gravity || 0) * dt;
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    const nz = p.z + p.vz * dt;
    const dist = Math.hypot(nx - p.x, ny - p.y, nz - p.z) || 0.001;
    const dir = { x: (nx - p.x) / dist, y: (ny - p.y) / dist, z: (nz - p.z) / dist };
    const hit = owner ? traceShot(match, owner, { x: p.x, y: p.y, z: p.z }, dir, dist) : null;
    p.traveled += dist;
    if (p.splitAt && !p.splitDone && p.traveled >= p.splitAt) {
      p.splitDone = true;
      const base = owner || { id: p.ownerId, team: p.team };
      for (let i = 0; i < (p.splitCount || 3); i++) {
        const childDir = deviate(dir, p.splitSpread || 0.08, match.rng);
        match.projectiles.push({
          ...p,
          id: `s${match.rng()}`,
          x: p.x, y: p.y, z: p.z,
          vx: childDir.x * Math.hypot(p.vx, p.vy, p.vz),
          vy: childDir.y * Math.hypot(p.vx, p.vy, p.vz),
          vz: childDir.z * Math.hypot(p.vx, p.vy, p.vz),
          damage: p.splitDamage || p.damage * 0.7,
          splitAt: 0,
          splitDone: true,
          traveled: 0,
          hitIds: [],
          life: 1.2,
        });
      }
      continue;
    }
    if (hit && hit.kind === 'player') {
      if (p.hitIds.includes(hit.player.id)) {
        p.x = nx; p.y = ny; p.z = nz;
        next.push(p);
        continue;
      }
      p.hitIds.push(hit.player.id);
      const mul = hit.zone === 'head' ? (p.headMul || 1.4) : hit.zone === 'limb' ? (p.limbMul || 0.85) : 1;
      if (owner && match.hurt) {
        const friendly = owner.team === hit.player.team && owner.team !== 'ffa' && !match.rules.friendlyFire;
        if (!friendly) {
          match.hurt(hit.player, p.damage * mul, owner, {
            zone: hit.zone, weaponId: p.weaponId, dist: p.traveled, point: hit.point, slow: p.slow, slowTime: p.slowTime,
          });
        }
      }
      if ((p.pierce || 0) > 0) {
        p.pierce -= 1;
        p.x = hit.point.x + dir.x * 0.3;
        p.y = hit.point.y + dir.y * 0.3;
        p.z = hit.point.z + dir.z * 0.3;
        next.push(p);
        continue;
      }
      match.events.push({ type: 'impact', point: hit.point, mat: 'metal' });
      continue;
    }
    if (hit && (hit.kind === 'world' || hit.kind === 'dome')) {
      if (hit.box?.breakable) {
        hit.box.hp -= p.damage;
        if (hit.box.hp <= 0) {
          hit.box.solid = false;
          hit.box.broken = true;
          hit.box.hidden = true;
        }
      }
      if ((p.bounces || 0) > 0 && hit.kind === 'world') {
        p.bounces -= 1;
        const n = faceNormal(hit.box, hit.point);
        const dot = p.vx * n.x + p.vy * n.y + p.vz * n.z;
        p.vx = (p.vx - 2 * dot * n.x) * 0.86;
        p.vy = (p.vy - 2 * dot * n.y) * 0.86;
        p.vz = (p.vz - 2 * dot * n.z) * 0.86;
        p.x = hit.point.x + n.x * 0.12;
        p.y = hit.point.y + n.y * 0.12;
        p.z = hit.point.z + n.z * 0.12;
        match.events.push({ type: 'impact', point: hit.point, mat: hit.box?.mat || 'metal' });
        next.push(p);
        continue;
      }
      if (p.explode) explode(match, p, hit.point);
      else match.events.push({ type: 'impact', point: hit.point, mat: hit.box?.mat || 'concrete' });
      continue;
    }
    p.x = nx; p.y = ny; p.z = nz;
    next.push(p);
  }
  match.projectiles = next;
}

function faceNormal(box, point) {
  if (!box) return { x: 0, y: 1, z: 0 };
  const faces = [
    { n: { x: -1, y: 0, z: 0 }, d: Math.abs(point.x - box.min.x) },
    { n: { x: 1, y: 0, z: 0 }, d: Math.abs(point.x - box.max.x) },
    { n: { x: 0, y: -1, z: 0 }, d: Math.abs(point.y - box.min.y) },
    { n: { x: 0, y: 1, z: 0 }, d: Math.abs(point.y - box.max.y) },
    { n: { x: 0, y: 0, z: -1 }, d: Math.abs(point.z - box.min.z) },
    { n: { x: 0, y: 0, z: 1 }, d: Math.abs(point.z - box.max.z) },
  ];
  faces.sort((a, b) => a.d - b.d);
  return faces[0].n;
}

export function explode(match, src, point) {
  const radius = src.radiusBlast || 4.4;
  const maxD = src.damage || 70;
  match.events.push({ type: 'explode', point, radius });
  for (const p of match.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - point.x, (p.y + 0.8) - point.y, p.z - point.z);
    if (d > radius) continue;
    const fall = 1 - d / radius;
    const owner = match.players.find((pl) => pl.id === src.ownerId);
    const amount = maxD * fall * (p.id === src.ownerId ? 0.4 : 1);
    if (match.hurt && owner) match.hurt(p, amount, owner, { zone: 'body', weaponId: src.weaponId || 'shatter', dist: d, point, splash: true });
  }
}

export { lookDir };
