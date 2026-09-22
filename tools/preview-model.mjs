/**
 * Offline model preview: builds the real actor/weapon meshes from client/src/render.js
 * and rasterises them to a PNG with a tiny software z-buffer, so geometry can be reviewed
 * without a browser.  Usage: node tools/preview-model.mjs [outDir]
 *
 * This imports the shipped buildActor()/attachWeapon() — nothing is re-implemented here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import zlib from 'node:zlib';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(root, process.argv[2] || '.preview');
fs.mkdirSync(outDir, { recursive: true });

// Let `@shared/...` resolve under plain node (Vite handles the alias in the browser).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      return nextResolve(pathToFileURL(path.join(root, 'shared', specifier.slice('@shared/'.length))).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { buildActor, attachWeapon } = await import(path.join(root, 'client', 'src', 'render.js'));

// ── PNG writer ──────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ── Software rasteriser ─────────────────────────────────────
function collect(root) {
  root.updateMatrixWorld(true);
  const tris = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    for (let o = obj; o; o = o.parent) if (o.visible === false) return;
    const geo = obj.geometry.index ? obj.geometry : obj.geometry;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    if (!pos) return;
    normalMatrix.getNormalMatrix(obj.matrixWorld);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const mat = mats[0] || {};
    const color = mat.color ? mat.color.clone() : new THREE.Color('#999999');
    const emissive = mat.emissive ? mat.emissive.clone().multiplyScalar(mat.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
    const idx = geo.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i + 1) : i + 1;
      const c = idx ? idx.getX(i + 2) : i + 2;
      const tri = { color, emissive, p: [], n: [] };
      for (const k of [a, b, c]) {
        v.fromBufferAttribute(pos, k).applyMatrix4(obj.matrixWorld);
        tri.p.push([v.x, v.y, v.z]);
        if (nor) {
          n.fromBufferAttribute(nor, k).applyMatrix3(normalMatrix).normalize();
          tri.n.push([n.x, n.y, n.z]);
        } else tri.n.push([0, 1, 0]);
      }
      tris.push(tri);
    }
  });
  return tris;
}

function raster(tris, { w = 620, h = 880, cam, target, fov = 30, bg = [9, 12, 18] }) {
  const eye = new THREE.Vector3(...cam);
  const look = new THREE.Vector3(...target);
  const fwd = look.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const dist = eye.distanceTo(look);
  const scale = (h * 0.5) / Math.tan((fov * Math.PI) / 360);
  const rgb = Buffer.alloc(w * h * 3);
  const depth = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = bg[0]; rgb[i * 3 + 1] = bg[1]; rgb[i * 3 + 2] = bg[2];
  }
  const project = (p) => {
    const dx = p[0] - eye.x, dy = p[1] - eye.y, dz = p[2] - eye.z;
    const zc = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (zc <= 0.02) return null;
    const xc = dx * right.x + dy * right.y + dz * right.z;
    const yc = dx * up.x + dy * up.y + dz * up.z;
    return [(w * 0.5 + (xc / zc) * scale), (h * 0.5 - (yc / zc) * scale), zc];
  };
  const key = new THREE.Vector3(0.5, 0.8, 0.7).normalize();
  const fill = new THREE.Vector3(-0.7, 0.2, -0.4).normalize();
  for (const t of tris) {
    const A = project(t.p[0]); const B = project(t.p[1]); const C = project(t.p[2]);
    if (!A || !B || !C) continue;
    const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((B[0] - px) * (C[1] - py) - (C[0] - px) * (B[1] - py)) / area;
        let w1 = ((C[0] - px) * (A[1] - py) - (A[0] - px) * (C[1] - py)) / area;
        let w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
        const di = y * w + x;
        if (z >= depth[di]) continue;
        depth[di] = z;
        let nx = w0 * t.n[0][0] + w1 * t.n[1][0] + w2 * t.n[2][0];
        let ny = w0 * t.n[0][1] + w1 * t.n[1][1] + w2 * t.n[2][1];
        let nz = w0 * t.n[0][2] + w1 * t.n[1][2] + w2 * t.n[2][2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * (look.x - eye.x) + ny * (look.y - eye.y) + nz * (look.z - eye.z) > 0) { nx = -nx; ny = -ny; nz = -nz; }
        const d1 = Math.max(0, nx * key.x + ny * key.y + nz * key.z);
        const d2 = Math.max(0, nx * fill.x + ny * fill.y + nz * fill.z);
        const fres = Math.pow(1 - Math.max(0, -(nx * (eye.x - (w0 * t.p[0][0] + w1 * t.p[1][0] + w2 * t.p[2][0]))
          + ny * (eye.y - (w0 * t.p[0][1] + w1 * t.p[1][1] + w2 * t.p[2][1]))
          + nz * (eye.z - (w0 * t.p[0][2] + w1 * t.p[1][2] + w2 * t.p[2][2]))) / dist), 3) * 0.35;
        const amb = 0.34;
        const r = t.color.r * (amb + d1 * 0.9 + d2 * 0.35) + fres * 0.5 + t.emissive.r;
        const g = t.color.g * (amb + d1 * 0.9 + d2 * 0.35) + fres * 0.5 + t.emissive.g;
        const b = t.color.b * (amb + d1 * 0.9 + d2 * 0.35) + fres * 0.5 + t.emissive.b;
        rgb[di * 3] = Math.min(255, Math.round(Math.pow(Math.min(1, r), 1 / 2.2) * 255));
        rgb[di * 3 + 1] = Math.min(255, Math.round(Math.pow(Math.min(1, g), 1 / 2.2) * 255));
        rgb[di * 3 + 2] = Math.min(255, Math.round(Math.pow(Math.min(1, b), 1 / 2.2) * 255));
      }
    }
  }
  return rgb;
}

function compose(files, w, h, cols) {
  const rows = Math.ceil(files.length / cols);
  const out = Buffer.alloc(w * h * cols * rows * 3);
  files.forEach((f, i) => {
    const cx = (i % cols) * w;
    const cy = Math.floor(i / cols) * h;
    for (let y = 0; y < h; y++) {
      f.copy(out, ((cy + y) * w * cols + cx) * 3, y * w * 3, (y + 1) * w * 3);
    }
  });
  return out;
}

// ── Scenes ──────────────────────────────────────────────────
const W = 620, H = 880;
const shots = [];

function actorShots(charId, weaponId, file) {
  const view = buildActor({ id: 'x', characterId: charId, team: 'a' }, { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6' });
  attachWeapon(view, weaponId);
  // Hold-pose so the weapon reads clearly, like the lobby showcase.
  view.armR.rotation.set(-1.05, 0, -0.08);
  view.armL.rotation.set(-1.15, 0, -0.32);
  view.elbowR.rotation.x = -0.45;
  view.elbowL.rotation.x = -0.6;
  view.weapon.rotation.set(1.5, 0, 0);
  view.upper.rotation.y = 0;
  const tris = collect(view.group);
  const views = [
    { cam: [0, 1.05, 3.5], target: [0, 0.95, 0], fov: 30 },
    { cam: [2.4, 1.3, 2.7], target: [0, 0.95, 0], fov: 30 },
    { cam: [3.4, 1.0, 0.1], target: [0, 0.95, 0], fov: 30 },
  ];
  const pans = views.map((v) => raster(tris, { w: W, h: H, ...v }));
  writePng(path.join(outDir, file), W * 3, H, compose(pans, W, H, 3));
  return tris.length;
}

function weaponShot(weaponId, file) {
  const view = buildActor({ id: 'x', characterId: 'ryn', team: 'a' }, { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6' });
  attachWeapon(view, weaponId);
  view.group.updateMatrixWorld(true);
  // Isolate the weapon group in world space for a close-up turntable.
  const wpn = new THREE.Group();
  wpn.matrixAutoUpdate = true;
  const clone = view.weapon.clone(true);
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  wpn.add(clone);
  const tris = collect(wpn);
  const box = new THREE.Box3().setFromObject(wpn);
  const c = box.getCenter(new THREE.Vector3());
  const size = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z);
  const d = size * 2.1;
  const views = [
    { cam: [c.x, c.y + 0.05, c.z + d], target: [c.x, c.y, c.z], fov: 28 },
    { cam: [c.x + d * 0.72, c.y + d * 0.45, c.z + d * 0.72], target: [c.x, c.y, c.z], fov: 28 },
    { cam: [c.x + d, c.y + 0.02, c.z], target: [c.x, c.y, c.z], fov: 28 },
  ];
  const pans = views.map((v) => raster(tris, { w: W, h: H, ...v }));
  writePng(path.join(outDir, file), W * 3, H, compose(pans, W, H, 3));
  return tris.length;
}

const counts = {};
for (const [i, id] of ['ryn', 'kael', 'nyx', 'marrow', 'orrin'].entries()) {
  counts[id] = actorShots(id, 'linecut', `actor-${id}.png`);
}
for (const id of ['linecut', 'ashford', 'longreach', 'pulse9', 'vectorblade', 'knuckle']) {
  try { counts[id] = weaponShot(id, `weapon-${id}.png`); } catch (e) { counts[id] = `skip:${e.message}`; }
}
console.log('triangles per subject:', counts);
console.log('wrote previews to', outDir);
