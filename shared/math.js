/** Small vector helpers shared by the simulation, server, and tests. */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const round = (v, n = 3) => {
  const m = 10 ** n;
  return Math.round(v * m) / m;
};

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy3 = (a, b) => { a.x = b.x; a.y = b.y; a.z = b.z; return a; };
export const set3 = (a, x, y, z) => { a.x = x; a.y = y; a.z = z; return a; };
export const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a) => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a) => Math.hypot(a.x, a.z);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm3 = (a) => {
  const l = len3(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const normXZ = (x, z) => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};

/** yaw 0 looks down -Z (Three.js camera default). Positive yaw turns toward +X. */
export function lookDir(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

export function forwardXZ(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

export function rightXZ(yaw) {
  return { x: Math.cos(yaw), z: Math.sin(yaw) };
}

export function yawFromDir(x, z) {
  return Math.atan2(x, -z);
}

export function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnToward(from, to, maxStep) {
  const d = shortestAngle(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

export function angleBetween(a, b) {
  const d = clamp(dot3(norm3(a), norm3(b)), -1, 1);
  return Math.acos(d);
}

export function approach(cur, target, delta) {
  if (cur < target) return Math.min(cur + delta, target);
  return Math.max(cur - delta, target);
}

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.range = (a, b) => a + (b - a) * next();
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}

export function id32(rng) {
  return Math.floor((rng ? rng() : Math.random()) * 0xffffffff).toString(16).padStart(8, '0');
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
