// The play screen offers a small info button on the right of every mode row.
// Hovering/focusing it opens a tooltip; clicking pins the explanation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playScreen } from '../client/src/ui.js';
import { createI18n } from '@shared/strings.js';
import { MODES } from '@shared/modes.js';

const fakeGame = (modeInfoId = null) => {
  const i18n = createI18n('en');
  return {
    t: (k, v) => i18n.t(k, v),
    i18n,
    draft: { modeId: 'team_fracture', mapId: 'random', difficulty: 'normal', team: 'a', fill: 'bots', relay: false, board: 'rating' },
    modeInfoId,
    browserRooms: [],
  };
};

const visibleModes = MODES.filter((m) => !m.practice);

test('every mode row has an info button with a how-it-works tooltip', () => {
  const html = playScreen(fakeGame());
  const infoButtons = [...html.matchAll(/class="mode-info( pinned)?"/g)];
  assert.equal(infoButtons.length, visibleModes.length);
  const tips = [...html.matchAll(/class="mode-info-tip">([\s\S]*?)<\/span><\/span>/g)].map((m) => m[1]);
  assert.equal(tips.length, visibleModes.length);
  for (const [m, tip] of visibleModes.map((m, i) => [m, tips[i]])) {
    assert.ok(!/<button/.test(tip), `${m.id}: tooltip must not nest a button inside the card button`);
    assert.ok(tip.length > 60, `${m.id}: tooltip should carry a real explanation`);
  }
  // No <button> may be nested inside the <button class="mode-card"> (invalid HTML breaks the whole row).
  for (const m of visibleModes) {
    const card = html.slice(html.indexOf(`data-id="${m.id}" aria-pressed`));
    const inner = card.slice(0, card.indexOf('<span class="mode-check"'));
    assert.ok(!/<button/.test(inner), `${m.id}: info control must not be a nested <button>`);
  }
});

test('clicking a mode pins its explanation in the description line', () => {
  const html = playScreen(fakeGame('dominion'));
  assert.ok(html.includes('mode-info pinned'), 'pinned info button is flagged');
  assert.ok(html.includes('mode-info-close'), 'pinned line offers a close control');
  assert.ok(html.includes('Dominion — How it works'), 'description line explains the pinned mode');
  // Unpinned view falls back to the selected mode's one-liner.
  const plain = playScreen(fakeGame());
  assert.ok(!plain.includes('mode-info pinned'));
});
