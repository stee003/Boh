import test from 'node:test';
import assert from 'node:assert/strict';
import { Input, defaultBindings } from '../client/src/input.js';
import { bufferInput } from '../client/src/input-buffer.js';

class Target extends EventTarget {}
function setup(t) {
  const win = new Target(), doc = new Target();
  const prev = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element };
  globalThis.window = win; globalThis.document = doc;
  globalThis.Element = class {};
  t.after(() => Object.assign(globalThis, prev));
  const input = new Input();
  input.setBindings(defaultBindings());
  input.capture = true;
  return { input, win, doc };
}
const emit = (target, type, values) => target.dispatchEvent(Object.assign(new Event(type), values));

test('locked mouse look needs no held button; unlocked menu motion is ignored', (t) => {
  const { input, win } = setup(t);
  input.locked = true;
  emit(win, 'mousemove', { movementX: 12, movementY: -8, buttons: 0 });
  assert.deepEqual(input.consumeLook(), { x: 12, y: -8, wheel: 0 });
  input.locked = false;
  emit(win, 'mousemove', { movementX: 100, movementY: 10, buttons: 2 });
  assert.equal(input.consumeLook().x, 0);
});

test('a short fire click survives release until the next input sample', (t) => {
  const { input } = setup(t);
  input.onMouseButton({ button: 0 }, true);
  input.onMouseButton({ button: 0 }, false);
  assert.equal(input.held('fire'), false);
  assert.equal(input.pressed('fire'), true);
  const packet = bufferInput(null, { fire: input.pressed('fire'), weaponSlot: -1 });
  input.endFrame();
  assert.equal(input.pressed('fire'), false);
  assert.equal(bufferInput(packet, { fire: false, weaponSlot: -1 }).fire, true);
});

test('focus loss and pointer unlock clear held fire, aim, keys and motion', (t) => {
  const { input, win, doc } = setup(t);
  for (const event of ['blur', 'pointerlockchange']) {
    input.keys.add('KeyW'); input.mouse.l = input.mouse.r = true; input.mouse.dx = 10;
    emit(event === 'blur' ? win : doc, event, {});
    assert.equal(input.held('forward'), false);
    assert.equal(input.held('fire'), false);
    assert.equal(input.held('aim'), false);
    assert.equal(input.consumeLook().x, 0);
  }
});

test('middle mouse binding works and menus do not collect gameplay keys', (t) => {
  const { input } = setup(t);
  input.setBindings({ fire: 'Mouse1', forward: 'KeyW' });
  input.onMouseButton({ button: 1 }, true);
  assert.equal(input.held('fire'), true);
  input.reset(); input.capture = false;
  input.onKey({ code: 'KeyW' }, true);
  assert.equal(input.held('forward'), false);
});

test('pointer lock rejection is handled rather than an unhandled promise', async (t) => {
  const { input } = setup(t);
  let reported = false;
  input.onLockError = () => { reported = true; };
  assert.equal(await input.requestLock({ requestPointerLock: () => Promise.reject(new Error('blocked')) }), false);
  assert.equal(reported, true);
});

test('input buffer preserves pulses and latest weapon choice but not stale movement', () => {
  const pending = { fire: true, reload: true, weaponSlot: 1, yaw: 0, moveX: 1 };
  const merged = bufferInput(pending, { fire: false, reload: false, weaponSlot: -1, yaw: 1, moveX: 0 });
  assert.equal(merged.fire, true); assert.equal(merged.reload, true);
  assert.equal(merged.weaponSlot, 1); assert.equal(merged.yaw, 1); assert.equal(merged.moveX, 0);
});
