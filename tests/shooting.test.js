import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, consumeEvents } from '../shared/sim/match.js';
import { stepWeapons } from '../shared/sim/combat.js';
import { emptyInput, aimRay } from '../shared/sim/physics.js';

function fixture() {
  const m = createMatch({ modeId: 'team_fracture', mapId: 'calibration_bay', seed: 3, rules: { fillBots: false }, players: [{ id: 'you', team: 'a' }, { id: 'foe', team: 'b' }] });
  const p = m.players[0];
  m.phase = 'live'; m.map.boxes = []; m._solidCache = [];
  for (const pl of m.players) { pl.spawnImmunity = 0; pl.phasingT = 0; pl.x = 0; pl.y = 0; pl.z = 0; pl.yaw = 0; pl.pitch = 0; }
  p.input = emptyInput();
  return { m, p };
}
test('held automatic fire consumes rounds and emits multiple shot events', () => {
  const { m, p } = fixture(); p.input.fire = true;
  const before = p.weapons[0].mag;
  for (let i = 0; i < 60; i++) stepWeapons(m, p, 1 / 60);
  const shots = consumeEvents(m).filter(e => e.type === 'shot');
  assert.ok(shots.length >= 5); assert.equal(before - p.weapons[0].mag, shots.length);
});
test('crosshair ray damages a target in its path', () => {
  const { m, p } = fixture();
  p.input.fire = true; p.aiming = true;
  const ray = aimRay(p, []);
  const foe = m.players[1];
  // Center the target body on the shared camera/muzzle aim ray.
  foe.x = ray.origin.x + ray.dir.x * 10;
  foe.z = ray.origin.z + ray.dir.z * 10;
  foe.y = ray.origin.y + ray.dir.y * 10 - 1.1;
  const before = foe.hp + foe.armor;
  for (let i = 0; i < 60; i++) stepWeapons(m, p, 1 / 60);
  assert.ok(foe.hp + foe.armor < before, 'shots should damage the aimed-at enemy');
});
test('firing interrupts sprint rather than extending sprint-to-fire forever', () => {
  const { m, p } = fixture();
  p.onGround = true; p.input = { ...emptyInput(), moveY: 1, sprint: true };
  for (let i = 0; i < 15; i++) stepMatch(m, 1 / 60);
  const before = p.weapons[0].mag;
  p.input.fire = true;
  for (let i = 0; i < 60; i++) stepMatch(m, 1 / 60);
  assert.equal(p.sprinting, false);
  assert.ok(p.weapons[0].mag < before);
});
test('holding fire cannot cancel an empty-magazine reload', () => {
  const { m, p } = fixture();
  p.weapons[0].mag = 0;
  p.input.reload = true;
  stepWeapons(m, p, 1 / 60);
  p.input.reload = false; p.input.fire = true;
  for (let i = 0; i < 240; i++) stepWeapons(m, p, 1 / 60);
  assert.ok(consumeEvents(m).some(e => e.type === 'reloaded'));
  assert.ok(p.weapons[0].mag > 0);
});

test('fire with the melee slot equipped swings the weapon', () => {
  const { m, p } = fixture();
  p.weaponSlot = 2; p.input.fire = true;
  stepWeapons(m, p, 1 / 60);
  assert.ok(consumeEvents(m).some(e => e.type === 'melee'));
});

test('an empty magazine reloads without the reload key', () => {
  const { m, p } = fixture();
  p.weapons[0].mag = 0;
  p.input.reload = false;
  p.input.fire = true;
  stepWeapons(m, p, 1 / 60);
  assert.equal(p.reloading, true);
  assert.equal(p.weapons[0].mag, 0);
});

test('switching weapons resolves reload state from the new slot', () => {
  const { m, p } = fixture();
  p.weapons[0].mag = 0; // Old gun needs reload, new gun does not.
  p.input.weaponSlot = 1; p.input.reload = true;
  stepWeapons(m, p, 1 / 60);
  assert.equal(p.weaponSlot, 1);
  assert.equal(p.reloading, false);
});
