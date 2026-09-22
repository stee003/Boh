import { MOVE } from '../constants.js';
import {
  approach, clamp, distXZ, forwardXZ, len3, lookDir, norm3, rightXZ, sub3,
} from '../math.js';

export function emptyInput() {
  return {
    moveX: 0, moveY: 0, yaw: 0, pitch: 0,
    jump: false, crouch: false, sprint: false, fire: false, aim: false,
    reload: false, melee: false, dodge: false, tactical: false, ultimate: false,
    interact: false, drop: false, shoulderTap: false, weaponSlot: -1, emote: 0,
  };
}

export function circleOverlaps(x, z, r, b) {
  const cx = clamp(x, b.min.x, b.max.x);
  const cz = clamp(z, b.min.z, b.max.z);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function bodyHeight(p) {
  return (p.sliding || p.crouch || p.vaultT > 0) ? MOVE.crouchHeight : MOVE.height;
}

export function eyeHeight(p) {
  return bodyHeight(p) - 0.15;
}

export function penetrates(x, y, z, radius, height, solids) {
  for (const b of solids) {
    if (!b.solid) continue;
    if (y + height <= b.min.y + 0.02 || y >= b.max.y - 0.001) continue;
    if (circleOverlaps(x, z, radius, b)) return b;
  }
  return null;
}

export function findSupport(x, z, radius, feetY, maxDrop, solids) {
  let best = null;
  for (const b of solids) {
    if (!b.solid) continue;
    if (!circleOverlaps(x, z, radius * 0.66, b)) continue;
    const top = b.max.y;
    if (top > feetY + 0.1) continue;
    if (top < feetY - maxDrop) continue;
    if (!best || top > best.y) best = { y: top, mat: b.mat || 'concrete', id: b.id, box: b };
  }
  return best;
}

export function findCeiling(x, z, radius, feetY, height, solids) {
  const head = feetY + height;
  let best = null;
  for (const b of solids) {
    if (!b.solid) continue;
    if (!circleOverlaps(x, z, radius * 0.62, b)) continue;
    if (b.min.y < head && b.min.y > feetY + 0.3) {
      if (best == null || b.min.y < best) best = b.min.y;
    }
  }
  return best;
}

export function rayAABB(o, d, box, maxT) {
  let tmin = 0;
  let tmax = maxT;
  for (const ax of ['x', 'y', 'z']) {
    const od = d[ax];
    const oo = o[ax];
    if (Math.abs(od) < 1e-8) {
      if (oo < box.min[ax] || oo > box.max[ax]) return null;
    } else {
      let t1 = (box.min[ax] - oo) / od;
      let t2 = (box.max[ax] - oo) / od;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmax < tmin) return null;
    }
  }
  if (tmax < 0) return null;
  const t = tmin >= 0 ? tmin : tmax;
  if (t < 0 || t > maxT) return null;
  return t;
}

export function raycast(origin, dir, maxDist, solids) {
  let best = null;
  for (const b of solids) {
    if (!b.solid) continue;
    const t = rayAABB(origin, dir, b, maxDist);
    if (t != null && (!best || t < best.t)) best = { t, box: b };
  }
  return best;
}

export function raySphere(o, d, c, r, maxT) {
  const ocx = o.x - c.x;
  const ocy = o.y - c.y;
  const ocz = o.z - c.z;
  const b = ocx * d.x + ocy * d.y + ocz * d.z;
  const c0 = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
  const disc = b * b - c0;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = (-b - s) >= 0 ? (-b - s) : (-b + s);
  if (t < 0 || t > maxT) return null;
  return t;
}

export function integrate(body, solids, dt, radius, height) {
  const prevY = body.y;
  let nx = body.x + body.vx * dt;
  let nz = body.z + body.vz * dt;
  let ny = body.y;
  let stepped = false;
  const stepH = MOVE.stepHeight;

  if (penetrates(nx, ny, nz, radius, height, solids)) {
    if (body.vy <= 1.5) {
      for (let s = 0.08; s <= stepH + 0.001; s += 0.08) {
        if (!penetrates(nx, ny + s, nz, radius, height, solids)) {
          ny += s;
          stepped = true;
          break;
        }
      }
    }
    if (!stepped) {
      const xOk = !penetrates(nx, ny, body.z, radius, height, solids);
      const zOk = !penetrates(body.x, ny, nz, radius, height, solids);
      if (xOk && !zOk) nz = body.z;
      else if (zOk && !xOk) nx = body.x;
      else if (xOk && zOk) {
        if (Math.abs(body.vx) >= Math.abs(body.vz)) nz = body.z;
        else nx = body.x;
      } else {
        nx = body.x;
        nz = body.z;
        body.vx *= 0.15;
        body.vz *= 0.15;
      }
      if (penetrates(nx, ny, nz, radius, height, solids)) {
        nx = body.x;
        nz = body.z;
      }
    }
  }

  if (!stepped) ny += body.vy * dt;

  let onGround = false;
  let groundMat = body.groundMat || 'concrete';
  let groundBox = null;
  if (body.vy <= 0.35 || stepped) {
    const searchFrom = Math.max(prevY, ny) + 0.08;
    const crossed = Math.max(0.28, prevY - Math.min(ny, prevY) + 0.2);
    const floor = findSupport(nx, nz, radius, searchFrom, crossed + (stepped ? stepH : 0.15), solids);
    if (floor && floor.y <= searchFrom && floor.y >= ny - 0.04) {
      ny = floor.y;
      body.vy = 0;
      onGround = true;
      groundMat = floor.mat;
      groundBox = floor.box;
    }
  }

  if (body.vy > 0) {
    const ceil = findCeiling(nx, nz, radius, ny, height, solids);
    if (ceil != null && ny + height > ceil) {
      ny = ceil - height - 0.01;
      body.vy = 0;
    }
  }

  if (penetrates(nx, ny, nz, radius, height, solids)) {
    let freed = false;
    for (let s = 0.05; s <= 1.4; s += 0.05) {
      if (!penetrates(nx, ny + s, nz, radius, height, solids)) {
        ny += s;
        freed = true;
        onGround = false;
        break;
      }
    }
    if (!freed) {
      nx = body.x;
      ny = prevY;
      nz = body.z;
      body.vx = 0;
      body.vz = 0;
    }
  }

  body.x = nx;
  body.y = ny;
  body.z = nz;
  body.onGround = onGround;
  body.groundMat = groundMat;
  body.groundBox = groundBox;
  body.stepped = stepped;
  return body;
}

export function nearestWall(x, y, z, height, solids) {
  let best = null;
  const r = MOVE.radius;
  for (const b of solids) {
    if (!b.solid || b.boundary) continue;
    if (y + 0.25 > b.max.y - 0.05 || y + height - 0.2 < b.min.y) continue;
    const cx = clamp(x, b.min.x, b.max.x);
    const cz = clamp(z, b.min.z, b.max.z);
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.001 || d > r + 0.38) continue;
    if (!best || d < best.d) best = { nx: dx / d, nz: dz / d, d, box: b };
  }
  return best;
}

function tryVault(player, solids, wishY) {
  if (wishY < 0.55 || player.vaultT > 0 || player.dodging) return false;
  if (!player.onGround && player.vy > 1) return false;
  const dir = forwardXZ(player.yaw);
  const probeX = player.x + dir.x * 0.62;
  const probeZ = player.z + dir.z * 0.62;
  let best = null;
  for (const b of solids) {
    if (!b.solid || b.boundary || b.breakable) continue;
    if (!circleOverlaps(probeX, probeZ, 0.3, b)) continue;
    const rel = b.max.y - player.y;
    if (rel < 0.48 || rel > 1.22) continue;
    const top = b.max.y;
    if (penetrates(probeX, top + 0.02, probeZ, 0.3, MOVE.height, solids)) continue;
    const landX = player.x + dir.x * 1.15;
    const landZ = player.z + dir.z * 1.15;
    if (penetrates(landX, top + 0.02, landZ, 0.3, MOVE.height, solids)) continue;
    if (!best || rel < best.rel) best = { top, landX, landZ, rel };
  }
  if (!best) return false;
  player.vaultT = MOVE.vaultDur * (player.mods?.vault || 1);
  player.vaultDur = player.vaultT;
  player.vaultFrom = { x: player.x, y: player.y, z: player.z };
  player.vaultTo = { x: best.landX, y: best.top, z: best.landZ };
  player.vx = 0;
  player.vz = 0;
  player.vy = 0;
  player.sliding = false;
  player.vaults = (player.vaults || 0) + 1;
  return true;
}

export function simulateMovement(player, input, solids, dt, rules) {
  const mods = player.mods || {};
  const heightStand = MOVE.height;
  let height = bodyHeight(player);
  const wishX = clamp(input.moveX || 0, -1, 1);
  const wishY = clamp(input.moveY || 0, -1, 1);
  const wishLen = Math.hypot(wishX, wishY) || 1;
  const nxn = wishLen > 1 ? wishX / wishLen : wishX;
  const nyn = wishLen > 1 ? wishY / wishLen : wishY;
  const fwd = forwardXZ(player.yaw);
  const right = rightXZ(player.yaw);
  const wx = fwd.x * nyn + right.x * nxn;
  const wz = fwd.z * nyn + right.z * nxn;

  player.dodgeCd = Math.max(0, (player.dodgeCd || 0) - dt);
  player.wallKickCd = Math.max(0, (player.wallKickCd || 0) - dt);
  player.slideCd = Math.max(0, (player.slideCd || 0) - dt);

  if (player.vaultT > 0) {
    player.vaultT -= dt;
    const u = 1 - Math.max(0, player.vaultT) / (player.vaultDur || MOVE.vaultDur);
    const e = u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
    player.x = player.vaultFrom.x + (player.vaultTo.x - player.vaultFrom.x) * e;
    player.y = player.vaultFrom.y + (player.vaultTo.y - player.vaultFrom.y) * Math.min(1, e * 1.15);
    player.z = player.vaultFrom.z + (player.vaultTo.z - player.vaultFrom.z) * e;
    player.vx = 0;
    player.vz = 0;
    player.vy = 0;
    if (player.vaultT <= 0) {
      player.x = player.vaultTo.x;
      player.y = player.vaultTo.y;
      player.z = player.vaultTo.z;
      player.onGround = true;
      player.vaultT = 0;
    }
    player.crouch = false;
    player.aiming = false;
    return;
  }

  const jumpEdge = !!input.jump && !player.prevJump;
  player.prevJump = !!input.jump;
  if (input.jump) player.jumpBuffer = MOVE.jumpBuffer;
  else player.jumpBuffer = Math.max(0, (player.jumpBuffer || 0) - dt);

  const speedMul = (player.speedMul || 1) * (rules.moveSpeed || 1) * (mods.speed || 1) * (player.slowT > 0 ? (player.slowMul || 0.7) : 1);
  const mobility = (player.mobility || 1) * speedMul;
  const crouchHeld = !!input.crouch;
  const spd = Math.hypot(player.vx, player.vz);

  if (crouchHeld && player.onGround && player.sprinting && !player.sliding && spd >= MOVE.slideMinSpeed && player.slideCd <= 0) {
    player.sliding = true;
    player.slideT = MOVE.slideDuration * (mods.slideTime || 1);
    const dir = spd > 0.2 ? { x: player.vx / spd, z: player.vz / spd } : fwd;
    const boost = Math.max(spd, MOVE.sprint * mobility) * MOVE.slideBoost;
    player.vx = dir.x * boost;
    player.vz = dir.z * boost;
    player.slides = (player.slides || 0) + 1;
    player.slideDist = 0;
  }

  if (input.dodge && !player.prevDodge && player.dodgeCd <= 0 && player.alive) {
    let dx = wx;
    let dz = wz;
    if (Math.hypot(dx, dz) < 0.2) { dx = -fwd.x; dz = -fwd.z; }
    const l = Math.hypot(dx, dz) || 1;
    player.vx = (dx / l) * MOVE.dodgeSpeed;
    player.vz = (dz / l) * MOVE.dodgeSpeed;
    player.vy = Math.max(player.vy, 0.4);
    player.dodging = true;
    player.dodgeT = MOVE.dodgeTime;
    player.dodgeCd = MOVE.dodgeCd * (mods.cdMul || 1);
    player.sliding = false;
    player.onGround = false;
    player.dodges = (player.dodges || 0) + 1;
    if (mods.dodgeDamage) {
      player.damageBuff = 1 + mods.dodgeDamage;
      player.damageBuffT = mods.dodgeDamageTime || 2;
    }
  }
  player.prevDodge = !!input.dodge;

  if (player.dodging) {
    player.dodgeT -= dt;
    if (player.dodgeT <= 0) player.dodging = false;
  }

  const wantAim = !!input.aim && !player.dodging;
  player.aiming = wantAim;
  const wantSprint = !!input.sprint && !input.fire && nyn > 0.4 && !wantAim && !crouchHeld && player.onGround && !player.sliding && !player.reloading;

  if (player.sliding) {
    player.slideT -= dt;
    player.slideDist = (player.slideDist || 0) + spd * dt;
    const fr = MOVE.slideFriction * (mods.slideFriction || 1);
    const ns = Math.max(0, spd - fr * dt);
    if (spd > 0.05) {
      player.vx = (player.vx / spd) * ns + wx * MOVE.slideSteer * dt;
      player.vz = (player.vz / spd) * ns + wz * MOVE.slideSteer * dt;
    }
    if (player.slideT <= 0 || !player.onGround) player.sliding = false;
    if (player.slideDist > (player.longSlide || 0)) player.longSlide = player.slideDist;
  } else if (!player.dodging) {
    let target = MOVE.walk * mobility;
    if (wantSprint) target = MOVE.sprint * mobility;
    if (crouchHeld && player.onGround) target = MOVE.crouch * mobility;
    if (wantAim) target *= MOVE.aimMul;
    if (player.carrying) target *= 0.88;
    const accel = (player.onGround ? MOVE.groundAccel : MOVE.airAccel) * (player.onGround ? 1 : 1);
    player.vx = approach(player.vx, wx * target, accel * dt);
    player.vz = approach(player.vz, wz * target, accel * dt);
    if (Math.hypot(nxn, nyn) < 0.08 && player.onGround) {
      player.vx = approach(player.vx, 0, MOVE.groundDecel * dt);
      player.vz = approach(player.vz, 0, MOVE.groundDecel * dt);
    }
  }

  player.sprinting = wantSprint && !player.sliding;
  player.crouch = (crouchHeld || player.sliding) && player.onGround;

  if (player.onGround) {
    player.coyote = MOVE.coyote;
    player.wallKicks = 0;
    if (player.slamWindow > 0 && player.vy <= 0 && player._wasAir) {
      player.slamLanding = true;
    }
  } else player.coyote = Math.max(0, (player.coyote || 0) - dt);
  player._wasAir = !player.onGround;

  const canJump = player.coyote > 0 && player.jumpBuffer > 0 && !player.dodging;
  if (canJump) {
    const wasSlide = player.sliding;
    player.vy = MOVE.jump * (mods.jump || 1) * (player.jumpMul || 1);
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.sliding = false;
    player.jumps = (player.jumps || 0) + 1;
    if (wasSlide) player.slideJumps = (player.slideJumps || 0) + 1;
  } else if (jumpEdge && !player.onGround && player.wallKickCd <= 0 && (player.wallKicks || 0) < MOVE.wallKickMax) {
    const wall = nearestWall(player.x, player.y, player.z, heightStand, solids);
    if (wall) {
      player.vx = wall.nx * MOVE.wallKickSpeed + wx * 2.2;
      player.vz = wall.nz * MOVE.wallKickSpeed + wz * 2.2;
      player.vy = MOVE.wallKickUp;
      player.wallKicks = (player.wallKicks || 0) + 1;
      player.wallKickCd = MOVE.wallKickCd;
      player.wallKickCount = (player.wallKickCount || 0) + 1;
    }
  }

  if (!player.onGround) player.vy -= MOVE.gravity * (rules.gravity || 1) * (player.gravMul || 1) * dt;
  if (player.carrying) player.sprinting = false;

  const h = bodyHeight(player);
  if (!player.crouch && !player.sliding) {
    if (penetrates(player.x, player.y, player.z, MOVE.radius, heightStand, solids)) player.crouch = true;
  }

  tryVault(player, solids, nyn);
  if (player.vaultT > 0) return;

  integrate(player, solids, dt, MOVE.radius, bodyHeight(player) );
  if (player.onGround && player.groundBox?.delta) {
    player.x += player.groundBox.delta.x || 0;
    player.y += player.groundBox.delta.y || 0;
    player.z += player.groundBox.delta.z || 0;
  }
  player.distance = (player.distance || 0) + Math.hypot(player.vx, player.vz) * dt;
  if (!player.onGround) player.airTime = (player.airTime || 0) + dt;
  void h;
  void distXZ;
  void len3;
}

export function cameraPose(player, solids, ads = 0) {
  const dir = lookDir(player.yaw, player.pitch);
  const right = rightXZ(player.yaw);
  const shoulder = player.shoulder || 1;
  const dist = 3.15 + (1.55 - 3.15) * ads;
  const side = (0.52 + (0.32 - 0.52) * ads) * shoulder;
  const eye = player.y + eyeHeight(player);
  const focus = {
    x: player.x + right.x * side * 0.22,
    y: eye + 0.02,
    z: player.z + right.z * side * 0.22,
  };
  let cam = {
    x: focus.x - dir.x * dist + right.x * side,
    y: focus.y - dir.y * dist + 0.18,
    z: focus.z - dir.z * dist + right.z * side,
  };
  const to = sub3(cam, focus);
  const camDist = len3(to) || 1;
  const nd = { x: to.x / camDist, y: to.y / camDist, z: to.z / camDist };
  const hit = solids ? raycast(focus, nd, camDist, solids) : null;
  if (hit && hit.t < camDist - 0.02) {
    const t = Math.max(0.28, hit.t - 0.16);
    cam = { x: focus.x + nd.x * t, y: focus.y + nd.y * t, z: focus.z + nd.z * t };
  }
  return { pos: cam, dir, focus, dist };
}

export function muzzlePos(player) {
  const dir = lookDir(player.yaw, player.pitch);
  const right = rightXZ(player.yaw);
  const shoulder = player.shoulder || 1;
  const h = eyeHeight(player);
  return {
    x: player.x + right.x * 0.22 * shoulder + dir.x * 0.42,
    y: player.y + h - 0.1 + dir.y * 0.3,
    z: player.z + right.z * 0.22 * shoulder + dir.z * 0.42,
  };
}

export function aimRay(player, solids, ads = 0) {
  const cam = cameraPose(player, solids, ads);
  const world = solids ? raycast(cam.pos, cam.dir, 220, solids) : null;
  const dist = world ? Math.max(1.5, world.t) : 90;
  const aim = {
    x: cam.pos.x + cam.dir.x * dist,
    y: cam.pos.y + cam.dir.y * dist,
    z: cam.pos.z + cam.dir.z * dist,
  };
  const origin = muzzlePos(player);
  let dir = norm3(sub3(aim, origin));
  if (!Number.isFinite(dir.x) || dist < 1.55) dir = cam.dir;
  return { origin, dir, aim, cam, dist };
}

export function hitboxesOf(p) {
  const h = bodyHeight(p);
  const headY = p.y + h - 0.01;
  return [
    { zone: 'head', type: 'sphere', c: { x: p.x, y: headY, z: p.z }, r: p.crouch || p.sliding ? 0.15 : 0.17 },
    { zone: 'body', type: 'aabb', min: { x: p.x - 0.23, y: p.y + h * 0.4, z: p.z - 0.15 }, max: { x: p.x + 0.23, y: p.y + h - 0.14, z: p.z + 0.15 } },
    { zone: 'limb', type: 'aabb', min: { x: p.x - 0.4, y: p.y + h * 0.46, z: p.z - 0.12 }, max: { x: p.x - 0.2, y: p.y + h * 0.8, z: p.z + 0.12 } },
    { zone: 'limb', type: 'aabb', min: { x: p.x + 0.2, y: p.y + h * 0.46, z: p.z - 0.12 }, max: { x: p.x + 0.4, y: p.y + h * 0.8, z: p.z + 0.12 } },
    { zone: 'limb', type: 'aabb', min: { x: p.x - 0.18, y: p.y + 0.02, z: p.z - 0.13 }, max: { x: p.x - 0.02, y: p.y + h * 0.46, z: p.z + 0.13 } },
    { zone: 'limb', type: 'aabb', min: { x: p.x + 0.02, y: p.y + 0.02, z: p.z - 0.13 }, max: { x: p.x + 0.18, y: p.y + h * 0.46, z: p.z + 0.13 } },
  ];
}
