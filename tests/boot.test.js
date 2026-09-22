import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('boot overlay is not blocked on a third-party font stylesheet', () => {
  const html = fs.readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('fonts.googleapis.com'), false);
  assert.equal(html.includes('fonts.gstatic.com'), false);
  assert.match(html, /__vbDismiss/);
});

test('the menu shell does not wait on three.js before it can dismiss boot', () => {
  const main = fs.readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  assert.equal(/^import\s.+render\.js/m.test(main), false);
  assert.match(main, /import\('\.\/render\.js'\)/);
  assert.match(main, /dismissBoot\(\)/);
  assert.doesNotMatch(main, /powerPreference:\s*'high-performance'/);
});

test('WebGL context is not requested as high-performance', () => {
  const render = fs.readFileSync(new URL('../client/src/render.js', import.meta.url), 'utf8');
  assert.doesNotMatch(render, /powerPreference:\s*'high-performance'/);
  assert.match(render, /powerPreference:\s*'default'/);
});
