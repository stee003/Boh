// Regression: the operator body must be built from real per-material meshes.
//
// A material object used as a plain-object key stringifies to "[object Object]",
// so put() once merged every limb into a single geometry and bakedMeshes() handed
// the renderer that string as the mesh's "material". three.js throws while drawing
// such a mesh — after the weapon (further in Z order) already rendered — leaving
// the player as a floating gun. These assertions fail on that regression.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildActor, attachWeapon } from '../client/src/render.js';
import { CHARACTERS } from '@shared/characters.js';
import { WEAPON_LIST } from '@shared/weapons.js';

test('actor body renders with real per-part materials', () => {
  const palette = { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6' };
  for (const ch of CHARACTERS) {
    const view = buildActor({ id: 't', characterId: ch.id, team: 'a', alive: true }, palette);
    attachWeapon(view, 'linecut');
    const meshes = [];
    view.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.ok(meshes.length >= 14, `${ch.id}: full body expected, got ${meshes.length} meshes`);
    for (const m of meshes) {
      assert.ok(m.material && m.material.isMaterial === true, `${ch.id}: every mesh must carry a THREE material`);
      m.geometry.computeBoundingSphere();
      const s = m.geometry.boundingSphere;
      assert.ok(Number.isFinite(s.radius) && s.radius > 0.001, `${ch.id}: degenerate geometry`);
    }
    // The body is split into limb/material parts, not one merged blob.
    const body = meshes.filter((m) => m.parent !== view.weapon);
    const materials = new Set(body.map((m) => m.material));
    assert.ok(materials.size >= 3, `${ch.id}: body should use several distinct materials`);
  }
});

test('weapon swaps keep every mesh on a real material', () => {
  const view = buildActor({ id: 't', characterId: 'ryn', team: 'a', alive: true }, { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6' });
  for (const w of WEAPON_LIST) {
    attachWeapon(view, w.id);
    const meshes = [];
    view.weapon.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.ok(meshes.length >= 2, `${w.id}: weapon should be visible`);
    for (const m of meshes) {
      assert.ok(m.material && m.material.isMaterial === true, `${w.id}: weapon mesh lost its material`);
    }
  }
});

test('the equipped weapon has a stable, visible right-hand mount', () => {
  const view = buildActor({ id: 't', characterId: 'ryn', team: 'a', alive: true }, { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6' });
  assert.equal(view.weapon.visible, true);
  assert.equal(view.weapon.frustumCulled, false);
  assert.ok(view.weapon.scale.x > 1, 'weapon has readable gameplay scale');
  assert.equal(view.weapon.parent, view.elbowR);
  assert.ok(view.weapon.position.x > 0, 'weapon is offset outboard from the torso');
});
