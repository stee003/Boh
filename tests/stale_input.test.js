import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, setInput, stepMatch, decayStaleInputs, publicPlayer } from '../shared/sim/match.js';
import { emptyInput } from '../shared/sim/physics.js';

function makeMatch() {
  return createMatch({
    modeId: 'team_fracture',
    mapId: 'calibration_bay',
    seed: 5,
    rules: { timeLimit: 60, scoreLimit: 99, respawn: 1, fillBots: false },
    players: [
      { id: 'you', name: 'Rookie', team: 'a', characterId: 'ryn' },
      { id: 'foe', name: 'Bot', team: 'b', isBot: true, botDifficulty: 'beginner' },
    ],
  });
}

test('a held input that stops arriving decays to no input (no eternal A held)', () => {
  const match = makeMatch();
  const you = match.players.find((p) => p.id === 'you');
  const foe = match.players.find((p) => p.id === 'foe');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);

  // Hold "A" (moveX -1) for a second while input keeps arriving, looking east.
  for (let i = 0; i < 60; i++) {
    setInput(match, 'you', { ...emptyInput(), moveX: -1, yaw: 0.9, pitch: 0.2 });
    stepMatch(match, 1 / 60);
  }
  const yawWhileHeld = you.yaw;
  assert.ok(Math.abs(yawWhileHeld - 0.9) < 0.01, `aim should follow input, got ${yawWhileHeld}`);
  const speedWhileHeld = Math.hypot(you.vx, you.vz);
  assert.ok(speedWhileHeld > 2, `should be moving while held, got ${speedWhileHeld}`);

  // The client now stops sending input (paused / tab hidden / hiccup).
  for (let i = 0; i < 120; i++) {
    decayStaleInputs(match, 0.3);
    stepMatch(match, 1 / 60);
  }
  const speedAfter = Math.hypot(you.vx, you.vz);
  assert.ok(speedAfter < 0.4, `should be stopped after input stops, got ${speedAfter}`);

  // And crucially: no ongoing drift afterwards (the old "A held" bug).
  const xStopped = you.x;
  for (let i = 0; i < 120; i++) {
    decayStaleInputs(match, 0.3);
    stepMatch(match, 1 / 60);
  }
  assert.ok(Math.abs(you.x - xStopped) < 0.15, `no ongoing drift, moved ${Math.abs(you.x - xStopped)}`);
  // The view direction must survive the decay (no snap-back to north).
  assert.ok(Math.abs(you.yaw - yawWhileHeld) < 0.02, `yaw should stay ${yawWhileHeld}, got ${you.yaw}`);

  // Decay must not touch bots.
  assert.ok(foe.input, 'bot input object exists');
  const botInput = { ...foe.input };
  decayStaleInputs(match, 0.3);
  assert.deepEqual(foe.input, botInput, 'bot input must not be zeroed by decay');
});

test('fresh input within the window keeps moving', () => {
  const match = makeMatch();
  const you = match.players.find((p) => p.id === 'you');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);
  for (let i = 0; i < 60; i++) {
    setInput(match, 'you', { ...emptyInput(), moveX: 1 });
    decayStaleInputs(match, 0.3);
    stepMatch(match, 1 / 60);
  }
  const speed = Math.hypot(you.vx, you.vz);
  assert.ok(speed > 2, `fresh input should keep moving, got ${speed}`);
});

test('new players have no input until the first frame arrives', () => {
  const match = makeMatch();
  const you = match.players.find((p) => p.id === 'you');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);
  for (let i = 0; i < 60; i++) stepMatch(match, 1 / 60);
  assert.equal(you.lastInputAt, undefined, 'never received input');
  decayStaleInputs(match, 0.3);
  assert.deepEqual(you.input, emptyInput(), 'default input is empty');
  const speed = Math.hypot(you.vx, you.vz);
  assert.ok(speed < 0.4, `should not drift without input, got ${speed}`);
});

test('public players expose the hit flash for the renderer', () => {
  const match = makeMatch();
  const you = match.players.find((p) => p.id === 'you');
  const foe = match.players.find((p) => p.id === 'foe');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);
  assert.equal(publicPlayer(you).flashed, false);
  you.spawnImmunity = 0;
  match.hurt(you, 20, foe, { zone: 'body', weaponId: 'linecut', dist: 4, point: { x: you.x, y: you.y, z: you.z } });
  assert.equal(publicPlayer(you).flashed, true, 'hurt player should flash');
  for (let i = 0; i < 30; i++) stepMatch(match, 1 / 60);
  assert.equal(publicPlayer(you).flashed, false, 'flash should decay');
});
