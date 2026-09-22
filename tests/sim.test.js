import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, summarize } from '../shared/sim/match.js';
import { computeHitDamage } from '../shared/sim/combat.js';
import { WEAPON_LIST, WEAPON_CATEGORIES, resolveWeapon, estimateTTK } from '../shared/weapons.js';
import { CHARACTERS } from '../shared/characters.js';
import { MODES } from '../shared/modes.js';
import { MAPS, validateMap, COMBAT_MAPS } from '../shared/maps.js';
import { ACHIEVEMENTS } from '../shared/progression.js';
import { rateMatch, rankFor } from '../shared/constants.js';
import { ATTACHMENTS } from '../shared/constants.js';

test('arsenal, operators, modes, maps, achievements meet the content bar', () => {
  assert.ok(WEAPON_LIST.length >= 25);
  assert.ok(WEAPON_CATEGORIES.length >= 8);
  assert.equal(new Set(WEAPON_LIST.map((w) => w.id)).size, WEAPON_LIST.length);
  for (const w of WEAPON_LIST) {
    assert.ok(w.recoil?.length, w.id);
    assert.ok(w.damage > 0, w.id);
    assert.ok(w.nameKey && w.descKey, w.id);
  }
  assert.ok(CHARACTERS.length >= 8);
  assert.ok(MODES.length >= 8);
  assert.ok(COMBAT_MAPS.length >= 8);
  assert.ok(MAPS.length >= 12);
  assert.ok(ACHIEVEMENTS.length >= 50);
});

test('maps have safe spawns and objectives', () => {
  for (const map of MAPS) {
    const errors = validateMap(map);
    assert.deepEqual(errors, [], map.id);
  }
});

test('attachments never change damage', () => {
  const base = resolveWeapon({ defId: 'linecut', attachments: [] });
  const modded = resolveWeapon({ defId: 'linecut', attachments: Object.keys(ATTACHMENTS) });
  assert.equal(modded.damage, base.damage);
  assert.notEqual(modded.reload, base.reload);
});

test('headshots outdamage body and limbs', () => {
  const w = WEAPON_LIST.find((x) => x.id === 'linecut');
  const body = computeHitDamage(w, 'body', 10, 1);
  const head = computeHitDamage(w, 'head', 10, 1);
  const limb = computeHitDamage(w, 'limb', 10, 1);
  assert.ok(head > body);
  assert.ok(limb < body);
  assert.ok(estimateTTK(w) > 0.2 && estimateTTK(w) < 1.2);
});

test('player stays grounded, jumps, and can be eliminated', () => {
  const match = createMatch({
    modeId: 'team_fracture',
    mapId: 'calibration_bay',
    seed: 7,
    rules: { timeLimit: 30, scoreLimit: 5, respawn: 1, fillBots: false },
    players: [
      { id: 'you', name: 'Rookie', team: 'a', characterId: 'ryn' },
      { id: 'foe', name: 'Ash Meridian', team: 'b', isBot: true, botDifficulty: 'beginner' },
    ],
  });
  const you = match.players.find((p) => p.id === 'you');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);
  const y0 = you.y;
  for (let i = 0; i < 30; i++) stepMatch(match, 1 / 60);
  assert.ok(Math.abs(you.y - y0) < 0.35, `drifted to ${you.y} from ${y0}`);
  assert.equal(you.onGround, true);
  you.input.jump = true;
  stepMatch(match, 1 / 60);
  you.input.jump = false;
  stepMatch(match, 1 / 60);
  assert.ok(you.y > y0 + 0.05, `jump y ${you.y}`);
  you.hp = 10;
  match.hurt(you, 50, match.players[1], { zone: 'body', weaponId: 'linecut', dist: 8, point: { x: you.x, y: you.y, z: you.z } });
  assert.equal(you.alive, false);
  assert.equal(match.players[1].kills, 1);
  assert.equal(match.teamScore.b, 1);
  for (let i = 0; i < 90; i++) stepMatch(match, 1 / 60);
  assert.equal(you.alive, true);
});

test('slide starts from a sprint and score summary is finite', () => {
  const match = createMatch({
    modeId: 'free_fracture',
    mapId: 'neon_district',
    seed: 3,
    rules: { timeLimit: 5, scoreLimit: 99 },
    players: [
      { id: 'you', name: 'Rookie', team: 'ffa' },
      { id: 'b1', name: 'Nim Rusk', team: 'ffa', isBot: true, botDifficulty: 'easy' },
    ],
  });
  const you = match.players.find((p) => p.id === 'you');
  while (match.phase === 'countdown') stepMatch(match, 1 / 60);
  you.input = { ...you.input, moveY: 1, sprint: true, yaw: you.yaw, pitch: 0 };
  for (let i = 0; i < 40; i++) stepMatch(match, 1 / 60);
  const speed = Math.hypot(you.vx, you.vz);
  assert.ok(speed > 6, `speed ${speed}`);
  you.input.crouch = true;
  you.input.sprint = true;
  stepMatch(match, 1 / 60);
  assert.equal(you.sliding, true);
  for (let i = 0; i < 120; i++) stepMatch(match, 1 / 60);
  const summary = summarize(match);
  for (const p of summary.players) {
    assert.ok(Number.isFinite(p.kills));
    assert.ok(Number.isFinite(p.score));
  }
  assert.ok(match.nav.nodes.length > 20);
});

test('ranked rating moves with the match, not only with kills', () => {
  const win = rateMatch({ rating: 1000, oppRating: 1000, win: true, matches: 20, contribution: 1 });
  const loss = rateMatch({ rating: 1000, oppRating: 1000, win: false, matches: 20, contribution: 1.1 });
  assert.ok(win.delta > 0);
  assert.ok(loss.delta < 0);
  assert.ok(Math.abs(loss.delta) < Math.abs(win.delta) + 8);
  assert.equal(rankFor(0).id, 'drift');
  assert.equal(rankFor(1600).id, 'apex');
  assert.equal(rankFor(2400).id, 'singularity');
});

test('sixteen-player step stays finite', () => {
  const players = [];
  for (let i = 0; i < 16; i++) {
    players.push({
      id: `p${i}`,
      name: `Drill ${i}`,
      team: i < 8 ? 'a' : 'b',
      isBot: true,
      botDifficulty: 'normal',
      characterId: CHARACTERS[i % CHARACTERS.length].id,
    });
  }
  const match = createMatch({ modeId: 'dominion', mapId: 'atrium_loop', seed: 11, rules: { timeLimit: 20 }, players });
  const t0 = Date.now();
  for (let i = 0; i < 90; i++) stepMatch(match, 1 / 60);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 4000, `stress ${elapsed}ms`);
  for (const p of match.players) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), p.id);
  }
});
