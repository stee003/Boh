// Render-only, frame-rate-independent procedural pose — AAA overhaul
// Never modifies simulation. Adds breathing, sway, weight shift, landing anticipation.

export const damp = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a,b,t)=> a + (b-a)*t;

function smoothStep(t){ return t*t*(3-2*t); }

export function animatePose(state, player, dt) {
  const speed = Math.hypot(player.vx || 0, player.vz || 0);
  const ground = player.onGround !== false;
  const forward = Math.sin(player.yaw || 0) * (player.vx || 0) - Math.cos(player.yaw || 0) * (player.vz || 0);
  const side = Math.cos(player.yaw || 0) * (player.vx || 0) + Math.sin(player.yaw || 0) * (player.vz || 0);

  state.time = (state.time || 0) + dt;
  state.stride = (state.stride || 0) + speed * dt * 2.35;
  state.breathe = (state.breathe || 0) + dt * (player.sprinting ? 2.2 : player.aiming ? 0.7 : 1.1);
  state.move = damp(state.move || 0, ground ? clamp(speed / 7.2, 0, 1) : 0, 14, dt);
  state.speedSmooth = damp(state.speedSmooth || 0, speed, 10, dt);

  // landing anticipation
  if (ground && state.grounded === false) {
    const impact = clamp(Math.abs(state.vy || 0) * 0.024, 0.06, 0.28);
    state.land = impact;
    state.landKick = impact * 1.8;
  }
  state.grounded = ground;
  state.vy = player.vy;
  state.land = damp(state.land || 0, 0, 10, dt);
  state.landKick = damp(state.landKick || 0, 0, 16, dt);

  // stride with asymmetric gait
  const cycle = Math.sin(state.stride);
  const cycle2 = Math.sin(state.stride * 0.5);
  const moveFactor = state.move;
  const crouchMul = player.crouch ? 0.42 : 1;
  const strideAmp = moveFactor * crouchMul * (player.sprinting ? 0.85 : 0.68);
  const direction = forward < -0.35 ? -1 : 1;

  // breathing influences height and lean
  const breatheY = Math.sin(state.breathe) * 0.012 * (player.aiming ? 0.35 : 1) * (1 - moveFactor*0.6);
  const breatheLean = Math.sin(state.breathe * 0.7) * 0.015 * (1 - moveFactor*0.7);

  const target = {
    height: 0.92 + Math.abs(cycle) * moveFactor * 0.038 + breatheY - state.land * 0.9,
    lean: (player.sprinting ? -0.14 : 0.02) + breatheLean + side*0.008 - forward*0.015,
    roll: clamp(-side * 0.028, -0.18, 0.18) + cycle*moveFactor*0.04*direction,
    swayX: Math.sin(state.time*1.3)*0.008 + side*0.01,
    swayY: Math.cos(state.time*0.9)*0.006,
    legL: -strideAmp * cycle * direction,
    legR: strideAmp * cycle * direction,
    kneeL: Math.max(0, cycle) * moveFactor * 0.95 * crouchMul + state.land*2.2 + (player.crouch?0.3:0),
    kneeR: Math.max(0, -cycle) * moveFactor * 0.95 * crouchMul + state.land*2.2 + (player.crouch?0.3:0),
    armR: -1.08 - (player.pitch||0)*0.9 + Math.sin(state.stride)*moveFactor*0.12,
    armL: -1.18 - (player.pitch||0)*0.85 + Math.sin(state.stride+0.5)*moveFactor*0.10,
    elbowR: -0.48 - moveFactor*0.12,
    elbowL: -0.62 - moveFactor*0.08,
    gunTilt: Math.sin(state.breathe*0.6)*0.02 + moveFactor*0.03,
    gunRoll: side*0.015,
    magDrop: 0,
    headBob: Math.abs(cycle)*moveFactor*0.025,
  };

  if (player.crouch) {
    Object.assign(target, {
      height: 0.64 + breatheY*0.5 - state.land*0.4,
      lean: -0.20 + breatheLean,
      legL: -0.95 - strideAmp*cycle*0.6,
      legR: -0.95 + strideAmp*cycle*0.6,
      kneeL: 1.48, kneeR: 1.48,
      armR: -1.25 - (player.pitch||0)*0.6,
      armL: -1.35,
    });
  }
  if (!ground) {
    Object.assign(target, {
      height: 0.90 + Math.sin(state.time*2.2)*0.01 - state.land*0.2,
      lean: -0.14 + (player.vy||0)*0.01,
      legL: -0.65 + cycle2*0.2, legR: -0.25 + cycle2*0.15,
      kneeL: 1.18, kneeR: 0.65,
      armR: -0.85 - (player.pitch||0)*0.5,
      armL: -1.0,
    });
  }
  if (player.sliding) {
    Object.assign(target, {
      height: 0.42, lean: 0.48 + side*0.05, roll: side>0?-0.35:0.35,
      legL: -1.30, legR: -0.88, kneeL: 0.15, kneeR: 0.70,
      armR: -0.9, armL: -0.6,
    });
  }
  if (player.dodging) {
    Object.assign(target, {
      height: 0.66, lean: -0.42, roll: side>0 ? -0.38 : 0.38,
      legL: -0.8, legR: -0.8, kneeL: 0.9, kneeR: 0.9,
    });
  }
  if (player.vault || player.vaultT>0) {
    Object.assign(target, { lean:-0.55, legL:-1.15, kneeL:1.55, armL:-2.15, armR:-1.5 });
  }

  // reload with 3-phase: out, swap, in
  if (player.reloading) {
    if (!state.reloading) state.reloadLength = Math.max(player.reloadT||1.8, 0.1);
    const progress = clamp(1 - (player.reloadT||0)/state.reloadLength, 0, 1);
    const p = smoothStep(progress);
    // phases
    let reach=0, tilt=0, roll=0, drop=0;
    if (p<0.25){ // lift
      const t=p/0.25;
      reach = Math.sin(t*Math.PI*0.5)*0.6;
      tilt = t*0.25;
      roll = -t*0.25;
    } else if (p<0.65){ // mag out/in
      const t=(p-0.25)/0.4;
      reach = 0.6 + Math.sin(t*Math.PI)*0.35;
      tilt = 0.25 + Math.sin(t*Math.PI)*0.15;
      roll = -0.25 - Math.sin(t*Math.PI)*0.18;
      drop = Math.sin(Math.PI*clamp((t-0.15)/0.7,0,1))*0.26;
    } else { // return
      const t=(p-0.65)/0.35;
      reach = 0.6*(1-t);
      tilt = 0.25*(1-t);
      roll = -0.25*(1-t);
    }
    target.armL = -0.38 - reach*0.85;
    target.elbowL = -0.85 - reach*0.9;
    target.gunTilt = tilt;
    target.gunRoll = roll;
    target.magDrop = drop;
  }
  state.reloading = !!player.reloading;

  // melee with anticipation + follow-through
  if ((player.meleeCd||0)>0) {
    if ((player.meleeCd||0) > (state.meleeCd||0)) state.meleeLength = player.meleeCd;
    const t = 1 - player.meleeCd / (state.meleeLength||0.7);
    const swing = Math.sin(t*Math.PI);
    const overshoot = t>0.7 ? Math.sin((t-0.7)/0.3*Math.PI)*0.25 : 0;
    target.armR = -1.08 - swing*1.35 + overshoot;
    target.gunRoll = Math.sin(t*Math.PI*2)*0.70;
    target.lean += swing*0.12;
  }
  state.meleeCd = player.meleeCd;

  // death
  if (player.alive===false) {
    state.death = clamp((state.death||0)+dt*1.6,0,1);
    const d=state.death;
    const eased = 1 - Math.pow(1-d,3);
    target.height = 0.92 - eased*0.72;
    target.roll = eased*1.6 * (Math.sin(state.time*0.5)>0?1:-1);
    target.lean = eased*0.6;
    target.armL=-0.3 - eased*0.5; target.armR=0.3 + eased*0.5;
    target.legL=-0.2; target.legR=0.2;
  } else state.death=0;

  // aim sway when ADS
  if (player.aiming) {
    target.swayX *= 0.25;
    target.swayY *= 0.25;
    target.headBob *= 0.3;
  }

  state.pose ||= { ...target };
  for (const key of Object.keys(target)) state.pose[key] = damp(state.pose[key], target[key], 15, dt);
  return state.pose;
}
