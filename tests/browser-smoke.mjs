// Start the relay and Vite before running: npm run test:browser
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('vectorbreak.settings.v1')) localStorage.setItem('vectorbreak.settings.v1', JSON.stringify({ quality: 'low', reduceMotion: true }));
  });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__VB?.viewReady);
  assert.equal(await page.evaluate(() => !!__VB.webglError), false);
  assert.equal(await page.locator('[data-act="play"]').isVisible(), true);
  await page.locator('.settings-shortcut').click();
  await page.locator('[data-setting="sens"]').fill('1.5');
  assert.equal(await page.locator('[data-value="sens"]').textContent(), '1.50');
  // The same slider node must survive input events, otherwise dragging breaks.
  const intact = await page.locator('[data-setting="sens"]').evaluate(el => {
    el.value = '1.7'; el.dispatchEvent(new Event('input', { bubbles: true }));
    return el.isConnected;
  });
  assert.equal(intact, true);
  await page.reload();
  await page.waitForFunction(() => window.__VB?.viewReady);
  assert.equal(await page.evaluate(() => __VB.settings.sens), 1.7);
  await page.locator('[data-act="range"]').click();
  await page.waitForFunction(() => __VB.inMatch);
  if (await page.locator('.pause').count()) await page.locator('.pause [data-act="resume"]').click();
  await page.waitForFunction(() => __VB.input.locked && !__VB.paused);
  await page.waitForFunction(() => __VB.match.phase === 'live');
  assert.equal(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id), 'view');
  // Relative mouse movement, with no buttons pressed, updates yaw and normal Y.
  const before = await page.evaluate(() => ({ yaw: __VB.yaw, pitch: __VB.pitch }));
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 20, movementY: 10, buttons: 0 })));
  await page.waitForFunction(yaw => __VB.yaw > yaw, before.yaw);
  assert.ok(await page.evaluate(pitch => __VB.pitch < pitch, before.pitch));
  const magBefore = await page.evaluate(() => __VB.match.players[0].weapons[0].mag);
  await page.mouse.down();
  await page.waitForFunction(mag => __VB.match.players[0].weapons[0].mag <= mag - 4, magBefore);
  await page.mouse.up();
  console.log('Local held fire, free mouse look, HUD click-through and settings persistence: passed');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __VB.paused && !__VB.input.locked);
  await page.locator('.pause [data-id="settings"]').click();
  await page.locator('[data-setting="sens"]').fill('2');
  await page.locator('[data-act="settings-tab"][data-id="gameplay"]').click();
  await page.locator('[data-setting="toggleCrouch"]').check();
  await page.locator('#menu-resume').click();
  await page.waitForFunction(() => __VB.input.locked && !__VB.paused);
  assert.equal(await page.evaluate(() => __VB.settings.sens), 2);
  assert.equal(await page.evaluate(() => __VB.input.mouse.l), false);
  // Focus loss clears every held action and pauses local play.
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => __VB.paused);
  assert.equal(await page.evaluate(() => __VB.input.keys.size), 0);
  await page.keyboard.up('KeyW');
  await page.locator('.pause [data-act="leave"]').click();
  // Responsive menu remains horizontally contained and deploy stays reachable.
  await page.locator('#nav [data-id="play"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('[data-act="play"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-act="play"]').isVisible(), true);
  console.log('Pause/resume, in-match settings, focus-loss cleanup and narrow layout: passed');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForFunction(() => __VB.net.online);
  await page.locator('[data-act="relay"][data-id="1"]').click();
  await page.locator('[data-act="play"]').click();
  await page.waitForFunction(() => __VB.relayLive);
  // Asynchronous matchmaking may expire browser activation; Resume restores it.
  if (await page.locator('.pause').count()) await page.locator('.pause [data-act="resume"]').click();
  await page.waitForFunction(() => __VB.input.locked && __VB.snap?.phase === 'live');
  const relayMag = await page.evaluate(() => __VB.snap.players.find(p => p.id === __VB.localId).mag);
  await page.mouse.down();
  await page.waitForFunction(mag => __VB.snap.players.find(p => p.id === __VB.localId).mag <= mag - 3, relayMag);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => __VB.paused);
  await page.locator('.pause [data-id="settings"]').click();
  await page.locator('[data-act="settings-tab"][data-id="controls"]').click();
  assert.equal(await page.locator('[data-setting="sens"]').isVisible(), true);
  assert.equal(await page.evaluate(() => __VB.input.held('fire')), false);
  await page.locator('#nav [data-act="leave"]').click();
  console.log('Dedicated relay held fire and in-match settings: passed');
  assert.deepEqual(errors, []);
  console.log('No browser runtime errors.');
} finally {
  await browser.close();
}
