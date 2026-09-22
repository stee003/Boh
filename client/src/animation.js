// Render-only, frame-rate-independent procedural pose. Never modifies the simulation.
//
// The simulation gives us velocity and intent, not a skeletal animation clip.  This
// layer turns that signal into a deliberately small, readable locomotion rig.  The
// important distinction is that forward/backward and lateral locomotion have their
// own gait: a strafe never gets mistaken for a run pointed in the travel direction.
export const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;

export function animatePose(state, player, dt) {
  dt = clamp(finite(dt), 0, 0.1);
  const vx = finite(player.vx);
  const vz = finite(player.vz);
  const speed = Math.hypot(vx, vz);
  const ground = player.onGround !== false;
  const yaw = finite(player.yaw);
  const pitch = finite(player.pitch);
  // Player-relative velocity.  +forward is the direction the visor is looking;
  // +side is the operator's right.  Keep these signed all the way to the pose so
  // left and right can be authored as mirrored, rather than identical, gaits.
  const forward = Math.sin(yaw) * vx - Math.cos(yaw) * vz;
  const side = Math.cos(yaw) * vx + Math.sin(yaw) * vz;
  const speedSafe = Math.max(speed, 0.001);
  const forwardN = clamp(forward / 7.5, -1, 1);
  const sideN = clamp(side / 7.5, -1, 1);
  const sideRatio = clamp(Math.abs(side) / speedSafe, 0, 1);
  const strafeSign = side === 0 ? 0 : Math.sign(side);
  const crouch = !!player.crouch;

  state.time = finite(state.time) + dt;
  // Cadence scales with speed, rather than making a slow walk look like a sprint.
  // A full cycle takes about 0.9 s at walk and 0.65 s at sprint speed.
  state.stride = finite(state.stride) + dt * (speed > 0.1 ? 2.9 + speed * 0.52 : 0);
  state.move = damp(finite(state.move), ground ? clamp(speed / 7.4, 0, 1) : 0, 14, dt);
  state.strafeBlend = damp(finite(state.strafeBlend), ground ? sideRatio : 0, 12, dt);
  state.strafeSign = damp(finite(state.strafeSign), ground ? strafeSign : 0, 16, dt);
  state.forwardBlend = damp(finite(state.forwardBlend), ground ? 1 - sideRatio : 0, 12, dt);

  if (ground && state.grounded === false) {
    state.land = clamp(Math.abs(finite(state.vy)) * 0.022, 0.04, 0.2);
  }
  state.grounded = ground;
  state.vy = finite(player.vy);
  state.land = damp(finite(state.land), 0, 12, dt);

  const cycle = Math.sin(state.stride);
  const opposite = Math.sin(state.stride + Math.PI);
  const liftL = Math.max(0, cycle);
  const liftR = Math.max(0, opposite);
  const move = state.move;
  const lateralGait = Math.sin(state.stride * 0.5 + Math.PI * 0.25);
  const fwdGait = cycle * state.forwardBlend;
  const strafeGait = cycle * state.strafeBlend;
  const crouchFactor = crouch ? 0.32 : 1;
  const kneeBase = move * (0.08 + state.strafeBlend * 0.08);

  // The pose is intentionally explicit.  Keeping every joint target here makes
  // transitions deterministic and lets the renderer blend the complete upper
  // body, not just the legs and gun.
  const target = {
    height: 0.9 + Math.abs(cycle) * move * (crouch ? 0.014 : 0.035) + Math.sin(state.time * 2) * 0.004 - state.land,
    pelvisX: -sideN * move * 0.018,
    pelvisZ: -forwardN * move * 0.012,
    lean: (player.sprinting ? -0.13 : -forwardN * 0.035) * crouchFactor,
    roll: clamp(-sideN * 0.055 + lateralGait * move * 0.018, -0.16, 0.16),
    torsoPitch: (player.sprinting ? -0.055 : -forwardN * 0.026) * crouchFactor,
    torsoYaw: -sideN * move * 0.055,
    torsoRoll: -sideN * move * 0.07 + lateralGait * move * 0.025,
    headPitch: -pitch * 0.4 + Math.sin(state.time * 2) * move * 0.014,
    headYaw: sideN * move * 0.045,
    headRoll: sideN * move * 0.035,

    // Forward/backward gait: alternating thigh swing and heel recovery.
    // Strafe gait: smaller forward swing plus signed lateral counter-stepping.
    legL: (-fwdGait * 0.68 - strafeGait * 0.22 + state.strafeSign * lateralGait * move * 0.08) * crouchFactor,
    legR: (fwdGait * 0.68 + strafeGait * 0.22 - state.strafeSign * lateralGait * move * 0.08) * crouchFactor,
    legYawL: (-sideN * 0.09 + strafeGait * 0.16) * crouchFactor,
    legYawR: (-sideN * 0.09 - strafeGait * 0.16) * crouchFactor,
    legRollL: state.strafeSign * (0.06 + liftL * 0.035) * move,
    legRollR: state.strafeSign * (0.06 + liftR * 0.035) * move,
    kneeL: kneeBase + (0.12 + liftL * 0.74 * state.forwardBlend + liftL * 0.42 * state.strafeBlend) * move,
    kneeR: kneeBase + (0.12 + liftR * 0.74 * state.forwardBlend + liftR * 0.42 * state.strafeBlend) * move,
    kneeYawL: -state.strafeSign * liftL * 0.12 * move,
    kneeYawR: -state.strafeSign * liftR * 0.12 * move,
    kneeRollL: state.strafeSign * liftL * 0.09 * move,
    kneeRollR: state.strafeSign * liftR * 0.09 * move,

    // A carried weapon should settle, not freeze the shoulders. The support arm
    // counter-swings more visibly while the weapon arm stays on the sight line.
    armR: -1.05 - pitch + fwdGait * 0.055 + strafeGait * 0.075,
    armL: -1.15 - pitch - fwdGait * 0.18 - strafeGait * 0.22,
    armRYaw: -sideN * 0.07 + strafeGait * 0.08,
    armLYaw: -sideN * 0.11 - strafeGait * 0.12,
    armRRoll: -0.08 + sideN * 0.05,
    armLRoll: -0.32 - sideN * 0.06,
    elbowR: -0.45 + liftR * 0.12 * move,
    elbowL: -0.6 - liftL * 0.18 * move,
    elbowRYaw: -sideN * 0.08,
    elbowLYaw: -sideN * 0.12,
    shoulderR: sideN * 0.04 + lateralGait * move * 0.035,
    shoulderL: -sideN * 0.04 - lateralGait * move * 0.035,
    gunTilt: 0,
    gunRoll: -sideN * 0.045,
    magDrop: 0,
  };

  if (crouch) Object.assign(target, {
    height: 0.62,
    lean: -0.18 - forwardN * 0.03,
    torsoPitch: -0.08,
    legL: -0.72 - fwdGait * 0.34,
    legR: -0.72 + fwdGait * 0.34,
    legYawL: -sideN * 0.12,
    legYawR: -sideN * 0.12,
    kneeL: 1.18 + liftL * 0.18 * move,
    kneeR: 1.18 + liftR * 0.18 * move,
    kneeYawL: -sideN * 0.16,
    kneeYawR: -sideN * 0.16,
    armL: target.armL - 0.12,
    elbowL: target.elbowL - 0.15,
  });
  if (!ground) Object.assign(target, {
    height: 0.88,
    lean: -0.12,
    torsoPitch: -0.08,
    torsoRoll: sideN * 0.04,
    legL: -0.58,
    legR: -0.2,
    legYawL: 0.08,
    legYawR: -0.08,
    kneeL: 1.12,
    kneeR: 0.62,
    kneeYawL: 0,
    kneeYawR: 0,
    armL: -1.35,
    elbowL: -0.75,
  });
  if (player.sliding) Object.assign(target, {
    height: 0.4,
    lean: 0.45,
    torsoPitch: 0.22,
    legL: -1.25,
    legR: -0.85,
    legYawL: 0.16,
    legYawR: -0.16,
    kneeL: 0.18,
    kneeR: 0.7,
    kneeYawL: 0,
    kneeYawR: 0,
    armL: -1.55,
    elbowL: -0.55,
  });
  if (player.dodging) Object.assign(target, {
    height: 0.64,
    lean: -0.4,
    torsoRoll: side > 0 ? -0.35 : 0.35,
    roll: side > 0 ? -0.35 : 0.35,
  });
  if (player.vault || player.vaultT > 0) Object.assign(target, {
    lean: -0.5,
    torsoPitch: -0.22,
    legL: -1.1,
    kneeL: 1.5,
    armL: -2.1,
    elbowL: -0.35,
  });

  if (player.reloading) {
    if (!state.reloading) state.reloadLength = Math.max(finite(player.reloadT, 1.8), 0.1);
    const progress = clamp(1 - finite(player.reloadT) / Math.max(state.reloadLength || 1.8, 0.1), 0, 1);
    const reach = Math.sin(Math.PI * progress);
    target.armL = -0.35 - reach * 0.75;
    target.armLYaw = -0.28 + reach * 0.12;
    target.armLRoll = -0.48;
    target.elbowL = -0.8 - reach * 0.8;
    target.elbowLYaw = -0.22;
    target.gunTilt = 0.3 * reach;
    target.gunRoll = -0.35 * reach;
    target.magDrop = Math.sin(Math.PI * clamp((progress - 0.15) / 0.65, 0, 1)) * 0.23;
    target.torsoPitch = -0.08 * reach;
  }
  state.reloading = !!player.reloading;

  if ((finite(player.meleeCd) || 0) > 0) {
    if (finite(player.meleeCd) > finite(state.meleeCd)) state.meleeLength = finite(player.meleeCd);
    const t = clamp(1 - finite(player.meleeCd) / Math.max(state.meleeLength || 0.7, 0.1), 0, 1);
    target.armR = -1.05 - Math.sin(t * Math.PI) * 1.2;
    target.armRYaw = Math.sin(t * Math.PI) * 0.25;
    target.gunRoll = Math.sin(t * Math.PI * 2) * 0.65;
    target.torsoYaw = Math.sin(t * Math.PI) * 0.1;
  }
  state.meleeCd = finite(player.meleeCd);

  if (player.alive === false) {
    state.death = clamp(finite(state.death) + dt * 1.8, 0, 1);
    target.height = 0.9 - state.death * 0.7;
    target.roll = state.death * 1.5;
    target.torsoRoll = state.death * 0.5;
    target.armL = -0.3;
    target.armR = 0.3;
  } else state.death = 0;

  state.pose ||= { ...target };
  for (const key of Object.keys(target)) {
    state.pose[key] = damp(finite(state.pose[key], target[key]), target[key], 18, dt);
  }
  return state.pose;
}
