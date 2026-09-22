import test from 'node:test';
import assert from 'node:assert/strict';
import { rewindSeconds, sanitizeInput, sanitizeRules } from '../server/guard.js';
import { MAX_REWIND } from '../shared/constants.js';

test('client position, kills, and stale fire never enter the sim input', () => {
  const fresh = sanitizeInput({
    moveX: 2, moveY: -0.4, yaw: 1.2, pitch: 9, fire: true, weaponSlot: 1,
    x: 40, y: 3, z: -12, kills: 9, xp: 500, rating: 2400,
  }, 20);
  assert.equal(fresh.moveX, 1);
  assert.equal(fresh.moveY, -0.4);
  assert.equal(fresh.fire, true);
  assert.equal(fresh.weaponSlot, 1);
  assert.equal(fresh.pitch, 1.25);
  assert.equal(fresh.x, undefined);
  assert.equal(fresh.kills, undefined);
  assert.equal(fresh.xp, undefined);
  const stale = sanitizeInput({ fire: true, moveY: 1, yaw: 0.4 }, 300);
  assert.equal(stale.fire, false);
  assert.equal(stale.moveY, 0);
});

test('ranked rules ignore client overrides and rewind stays inside 150ms', () => {
  const ranked = sanitizeRules({ timeLimit: 10, scoreLimit: 1, regenRate: 99, health: 400, ranked: true }, { ranked: true });
  assert.deepEqual(ranked, { ranked: true, botDifficulty: 'hard' });
  const casual = sanitizeRules({ timeLimit: 90, scoreLimit: 40, botDifficulty: 'expert', damage: 99 });
  assert.equal(casual.timeLimit, 90);
  assert.equal(casual.scoreLimit, 40);
  assert.equal(casual.botDifficulty, 'expert');
  assert.equal(casual.damage, undefined);
  assert.equal(rewindSeconds(40), 0.04);
  assert.equal(rewindSeconds(900), MAX_REWIND);
  assert.equal(rewindSeconds(-20), 0);
});
