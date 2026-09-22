import test from 'node:test';
import assert from 'node:assert/strict';
import { animatePose, damp } from '../client/src/animation.js';
const standing = { alive: true, onGround: true, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0 };
test('pose blending is finite and continuous across movement/action states', () => {
  const state = {};
  animatePose(state, standing, 1 / 60);
  for (const change of [{ crouch: true }, { sliding: true }, { onGround: false, vy: -5 }, {}, { dodging: true }, { vaultT: 0.4 }, { reloading: true, reloadT: 1 }, { meleeCd: 0.5 }, { alive: false }]) {
    const before = state.pose.height;
    const pose = animatePose(state, { ...standing, ...change }, 1 / 60);
    for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(pose.height - before) < 0.15, 'no sudden pose snap');
  }
});
test('paused poses do not advance and damping is frame-rate-independent', () => {
  const state = {};
  const pose = { ...animatePose(state, standing, 0) };
  assert.deepEqual(animatePose(state, { ...standing, crouch: true }, 0), pose);
  let a = 0, b = 0;
  for (let i = 0; i < 30; i++) a = damp(a, 1, 12, 1 / 30);
  for (let i = 0; i < 144; i++) b = damp(b, 1, 12, 1 / 144);
  assert.ok(Math.abs(a - b) < 1e-10);
});
test('reload lowers the magazine then returns it, landing compresses the pose', () => {
  const state = {};
  animatePose(state, { ...standing, reloading: true, reloadT: 2 }, 0.1);
  const middle = animatePose(state, { ...standing, reloading: true, reloadT: 1 }, 0.1).magDrop;
  assert.ok(middle > 0.1);
  assert.ok(animatePose(state, standing, 0.3).magDrop < middle);
  animatePose(state, { ...standing, onGround: false, vy: -8 }, 0.1);
  animatePose(state, standing, 1 / 60);
  assert.ok(state.land > 0.1);
});

test('lateral locomotion is mirrored and not a forward-run pose', () => {
  const settle = (player) => {
    const state = {};
    let pose;
    for (let i = 0; i < 36; i++) pose = animatePose(state, player, 1 / 60);
    return pose;
  };
  const forward = settle({ ...standing, vx: 0, vz: -7 });
  const left = settle({ ...standing, vx: -7, vz: 0 });
  const right = settle({ ...standing, vx: 7, vz: 0 });
  assert.ok(Math.abs(left.torsoRoll) > 0.001, 'left strafe has torso counter-roll');
  assert.ok(left.torsoRoll * right.torsoRoll < 0, 'left and right strafes mirror');
  assert.ok(Math.abs(left.legYawL - forward.legYawL) > 0.01, 'strafe changes leg path');
  assert.ok(Math.abs(left.armLYaw - forward.armLYaw) > 0.01, 'strafe changes support arm');
  assert.ok(Math.max(left.kneeL, left.kneeR, right.kneeL, right.kneeR) > 0.2, 'moving knees bend');
});

test('locomotion animates the complete upper body, not only the legs', () => {
  const state = {};
  let pose;
  for (let i = 0; i < 36; i++) pose = animatePose(state, { ...standing, vx: 3, vz: -5, yaw: 0 }, 1 / 60);
  assert.ok(Math.abs(pose.torsoPitch) > 0.001);
  assert.ok(Math.abs(pose.torsoRoll) > 0.001);
  assert.ok(Math.abs(pose.headRoll) > 0.001);
  assert.ok(Math.abs(pose.elbowL - (-0.6)) > 0.001);
});
