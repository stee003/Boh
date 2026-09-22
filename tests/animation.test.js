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
