import test from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, allKeys, createI18n } from '../shared/strings.js';
import { WEAPON_LIST } from '../shared/weapons.js';
import { CHARACTERS } from '../shared/characters.js';
import { MODES } from '../shared/modes.js';
import { MAPS } from '../shared/maps.js';
import { ACHIEVEMENTS } from '../shared/progression.js';

test('every string has English and Italian', () => {
  const keys = allKeys();
  assert.ok(keys.length > 100);
  for (const key of keys) {
    const row = STRINGS[key];
    assert.equal(typeof row.en, 'string', key);
    assert.equal(typeof row.it, 'string', key);
    assert.ok(row.en.length > 0, key);
    assert.ok(row.it.length > 0, key);
  }
  const en = createI18n('en');
  const it = createI18n('it');
  assert.notEqual(en.t('menu.play'), it.t('menu.play'));
  assert.equal(en.t('missing.key'), 'missing.key');
});

test('weapons, operators, modes, maps, and badges have both languages', () => {
  const needed = [];
  for (const w of WEAPON_LIST) needed.push(w.nameKey, w.descKey);
  for (const c of CHARACTERS) needed.push(c.nameKey, c.blurbKey, c.passiveKey, c.tacticalKey, c.ultimateKey, c.roleKey);
  for (const m of MODES) needed.push(m.nameKey, m.descKey);
  for (const map of MAPS) needed.push(map.nameKey, map.descKey);
  for (const a of ACHIEVEMENTS) needed.push(`ach.${a.id}.name`, `ach.${a.id}.desc`);
  const missing = needed.filter((key) => !STRINGS[key]?.en || !STRINGS[key]?.it);
  assert.deepEqual(missing, []);
});
