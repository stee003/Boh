// Render-only, frame-rate-independent procedural pose. Never modifies the simulation.
export const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function animatePose(state, player, dt) {
  const speed = Math.hypot(player.vx || 0, player.vz || 0);
  const ground = player.onGround !== false;
  const forward = Math.sin(player.yaw || 0) * (player.vx || 0) - Math.cos(player.yaw || 0) * (player.vz || 0);
  const side = Math.cos(player.yaw || 0) * (player.vx || 0) + Math.sin(player.yaw || 0) * (player.vz || 0);
  state.time = (state.time || 0) + dt;
  state.stride = (state.stride || 0) + speed * dt * 2.2;
  state.move = damp(state.move || 0, ground ? clamp(speed / 7, 0, 1) : 0, 12, dt);
  if (ground && state.grounded === false) state.land = clamp(Math.abs(state.vy || 0) * 0.022, 0.04, 0.2);
  state.grounded = ground;
  state.vy = player.vy;
  state.land = damp(state.land || 0, 0, 12, dt);
  const cycle = Math.sin(state.stride);
  const stride = cycle * state.move * (player.crouch ? 0.35 : 0.7);
  const direction = forward < -0.4 ? -1 : 1;
  const target = {
    height: 0.9 + Math.abs(cycle) * state.move * 0.035 + Math.sin(state.time * 2) * 0.006 - state.land,
    lean: player.sprinting ? -0.13 : 0,
    roll: clamp(-side * 0.025, -0.16, 0.16),
    legL: -stride * direction, legR: stride * direction,
    kneeL: Math.max(0, cycle) * state.move * 0.9 + state.land * 2,
    kneeR: Math.max(0, -cycle) * state.move * 0.9 + state.land * 2,
    armR: -1.05 - (player.pitch || 0), armL: -1.15 - (player.pitch || 0),
    elbowR: -0.45, elbowL: -0.6, gunTilt: 0, gunRoll: 0, magDrop: 0,
  };
  if (player.crouch) Object.assign(target, { height: 0.62, lean: -0.18, legL: -0.9 - stride, legR: -0.9 + stride, kneeL: 1.45, kneeR: 1.45 });
  if (!ground) Object.assign(target, { height: 0.88, lean: -0.12, legL: -0.6, legR: -0.2, kneeL: 1.15, kneeR: 0.6 });
  if (player.sliding) Object.assign(target, { height: 0.4, lean: 0.45, legL: -1.25, legR: -0.85, kneeL: 0.12, kneeR: 0.65 });
  if (player.dodging) Object.assign(target, { height: 0.64, lean: -0.4, roll: side > 0 ? -0.35 : 0.35 });
  if (player.vault || player.vaultT > 0) Object.assign(target, { lean: -0.5, legL: -1.1, kneeL: 1.5, armL: -2.1 });
  if (player.reloading) {
    if (!state.reloading) state.reloadLength = Math.max(player.reloadT || 1.8, 0.1);
    const progress = clamp(1 - (player.reloadT || 0) / state.reloadLength, 0, 1);
    const reach = Math.sin(Math.PI * progress);
    target.armL = -0.35 - reach * 0.75;
    target.elbowL = -0.8 - reach * 0.8;
    target.gunTilt = 0.3 * reach;
    target.gunRoll = -0.35 * reach;
    target.magDrop = Math.sin(Math.PI * clamp((progress - 0.15) / 0.65, 0, 1)) * 0.23;
  }
  state.reloading = !!player.reloading;
  if ((player.meleeCd || 0) > 0) {
    if ((player.meleeCd || 0) > (state.meleeCd || 0)) state.meleeLength = player.meleeCd;
    const t = 1 - player.meleeCd / (state.meleeLength || 0.7);
    target.armR = -1.05 - Math.sin(t * Math.PI) * 1.2;
    target.gunRoll = Math.sin(t * Math.PI * 2) * 0.65;
  }
  state.meleeCd = player.meleeCd;
  if (player.alive === false) {
    state.death = clamp((state.death || 0) + dt * 1.8, 0, 1);
    target.height = 0.9 - state.death * 0.7;
    target.roll = state.death * 1.5;
    target.armL = -0.3; target.armR = 0.3;
  } else state.death = 0;
  state.pose ||= { ...target };
  for (const key of Object.keys(target)) state.pose[key] = damp(state.pose[key], target[key], 16, dt);
  return state.pose;
}
