import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioBus } from '../client/src/audio.js';

test('local and remote gunshots only send finite values to Web Audio', () => {
  const values = [];
  const param = () => ({
    set value(n) { assert.ok(Number.isFinite(n)); values.push(n); },
    setValueAtTime(n, t) { assert.ok(Number.isFinite(n) && Number.isFinite(t)); values.push(n); },
    exponentialRampToValueAtTime(n, t) { assert.ok(Number.isFinite(n) && Number.isFinite(t)); },
  });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param() });
  const audio = new AudioBus();
  audio.ctx = { currentTime: 0, sampleRate: 48000, createGain: node, createBiquadFilter: node, createOscillator: node, createBufferSource: node,
    createBuffer: (_, len) => ({ getChannelData: () => new Float32Array(len) }) };
  audio.sfx = node();
  for (const sound of ['ar', 'smg', 'shotgun', 'energy', 'pistol', 'sniper']) {
    audio.weapon(sound); audio.weapon(sound, true);
    audio.play(sound, { gain: undefined });
  }
  assert.ok(values.includes(0.16), 'normal rifle recipe volume is retained');
  assert.ok(values.includes(0.05), 'remote shot is quieter');
});
