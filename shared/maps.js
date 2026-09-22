/** Compact competitive lattices — AAA visual overhaul. Geometry is data; sim never special-cases a map. */

let seq = 1;
const nextId = (prefix) => `${prefix}${seq++}`;

export function box(cx, bottom, cz, w, h, d, mat = 'concrete', extra = {}) {
  const b = {
    id: extra.id || nextId('b'),
    min: { x: cx - w / 2, y: bottom, z: cz - d / 2 },
    max: { x: cx + w / 2, y: bottom + h, z: cz + d / 2 },
    mat,
    solid: extra.solid !== false,
  };
  if (extra.boundary) b.boundary = true;
  if (extra.breakable) {
    b.breakable = true;
    b.hp = extra.hp || 80;
    b.maxHp = b.hp;
  }
  if (extra.toggle) b.toggle = extra.toggle;
  if (extra.mover) b.mover = { ...extra.mover };
  if (extra.visual) b.visual = true;
  return b;
}

export function slab(cx, top, cz, w, d, mat = 'metal', thick = 0.3, extra = {}) {
  return box(cx, top - thick, cz, w, thick, d, mat, extra);
}

function floor(minX, maxX, minZ, maxZ, mat = 'concrete', y = 0, extra = {}) {
  return box((minX + maxX) / 2, y - 0.5, (minZ + maxZ) / 2, Math.max(0.5, maxX - minX), 0.5, Math.max(0.5, maxZ - minZ), mat, { id: extra.id || nextId('f'), ...extra });
}

function walls(minX, maxX, minZ, maxZ, h = 7) {
  const t = 1.4;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const w = maxX - minX;
  const d = maxZ - minZ;
  return [
    box(cx, 0, minZ - t / 2, w + t * 2, h, t, 'concrete', { boundary: true }),
    box(cx, 0, maxZ + t / 2, w + t * 2, h, t, 'concrete', { boundary: true }),
    box(minX - t / 2, 0, cz, t, h, d, 'concrete', { boundary: true }),
    box(maxX + t / 2, 0, cz, t, h, d, 'concrete', { boundary: true }),
  ];
}

function stairs(cx, cz, width, length, height, axis, mat = 'metal', y0 = 0) {
  const steps = Math.max(2, Math.ceil(height / 0.32));
  const sh = height / steps;
  const sd = Math.max(length / steps, 0.48);
  const boxes = [];
  for (let i = 0; i < steps; i++) {
    const along = -((steps * sd) / 2) + sd * i + sd / 2;
    let x = cx, z = cz, w = width, d = sd + 0.02;
    if (axis === 'z+') z = cz + along;
    else if (axis === 'z-') z = cz - along;
    else if (axis === 'x+') { x = cx + along; w = sd + 0.02; d = width; }
    else { x = cx - along; w = sd + 0.02; d = width; }
    boxes.push(box(x, y0 + sh * i, z, w, 0.26, d, mat));
  }
  return boxes;
}

function crate(x, z, w = 1.4, h = 1.15, d = 1.4, mat = 'crate') {
  return box(x, 0, z, w, h, d, mat);
}

function sp(x, z, yaw, y = 0) {
  return { x, y, z, yaw };
}

function theme(p) {
  return {
    fog: 0x0b1020,
    skyTop: 0x1a1440,
    skyBottom: 0x07090f,
    ambient: 0x93a6c4,
    sun: 0xfff1dc,
    accent: 0x5cffd6,
    fogDensity: 0.018,
    hemiSky: 0x7d8eae,
    hemiGround: 0x1a140e,
    palette: {
      concrete: '#2c3446',
      metal: '#747e8e',
      neon: '#ff2f86',
      glass: '#b7e4ff',
      sand: '#c6a56e',
      wood: '#8a6244',
      water: '#1c9aaf',
      trim: '#5cffd6',
      grass: '#3f7d4e',
      caution: '#ffb020',
      crate: '#9a6a42',
    },
    ...p,
  };
}

function pack(def) { return def; }
const PI = Math.PI;

function neonDistrict() {
  const boxes = [
    floor(-38, 38, -34, 34, 'concrete'),
    ...walls(-38, 38, -34, 34, 8),
    box(-30, 0, -22, 12, 6.2, 12, 'concrete'),
    box(-31, 0, -4, 12, 7.2, 10, 'concrete'),
    box(-29, 0, 16, 14, 5.4, 12, 'concrete'),
    ...stairs(-20, -22, 3.2, 6.2, 6.2, 'x+', 'metal'),
    ...stairs(-20, 16, 3.2, 6.2, 5.4, 'x+', 'metal'),
    box(-18, 0, -22, 1.2, 1.3, 6, 'crate'),
    box(-18, 0, 8, 1.4, 1.2, 4, 'crate'),
    slab(25, 3.3, 0, 20, 34, 'metal'),
    box(18, 0, -8, 1.1, 3.3, 1.1, 'metal'),
    box(32, 0, 6, 1.1, 3.3, 1.1, 'metal'),
    box(24, 0, 14, 1.1, 3.3, 1.1, 'metal'),
    ...stairs(25, -23.5, 4.2, 7.2, 3.3, 'z+', 'metal'),
    ...stairs(25, 23.5, 4.2, 7.2, 3.3, 'z-', 'metal'),
    crate(22, 3.3 - 0.01, 1.3, 1.05, 1.3, 'crate'),
    box(22, 3.3, -6, 1.5, 1.05, 1.5, 'crate'),
    box(29, 3.3, 7, 1.8, 1.15, 1.2, 'crate'),
    box(20, 3.3, 12, 1.2, 0.9, 2, 'crate'),
    crate(-1.5, -12, 1.8, 1.15, 1.4),
    crate(2.2, -4, 1.5, 1.35, 2.2),
    crate(-2, 6, 2.1, 1.05, 1.3),
    crate(1.2, 15, 1.3, 1.45, 1.3),
    box(0, 0, -2, 0.7, 1.7, 0.7, 'metal'),
    box(-6, 0, 0, 0.45, 1.5, 3.2, 'concrete'),
    box(6, 0, 2, 0.45, 1.5, 2.6, 'concrete'),
    box(-8, 0, -25, 6, 1.25, 0.5, 'concrete'),
    box(10, 0, -25, 5, 1.25, 0.5, 'concrete'),
    box(-8, 0, 25, 6, 1.25, 0.5, 'concrete'),
    box(10, 0, 25, 5, 1.25, 0.5, 'concrete'),
    // neon dressings — more density
    box(-22, 3.2, -12, 0.3, 1.4, 3.2, 'neon', { solid: false, visual: true }),
    box(16, 4.4, 0, 0.25, 0.5, 8, 'neon', { solid: false, visual: true }),
    box(0, 0.05, 0, 1.2, 0.08, 1.2, 'trim', { solid: false, visual: true }),
    box(-30, 5.4, -22, 3, 0.8, 0.2, 'neon', { solid: false, visual: true }),
    box(-30, 2.2, -22, 0.15, 2.2, 0.15, 'trim', { solid: false, visual: true }),
    box(-31, 0, -4, 0.15, 2.0, 8, 'trim', { solid: false, visual: true }),
    box(25, 3.38, 0, 18, 0.06, 0.06, 'neon', { solid: false, visual: true }),
  ];
  return pack({
    id: 'neon_district',
    nameKey: 'map.neon_district.name',
    descKey: 'map.neon_district.desc',
    combat: true,
    bounds: { minX: -38, maxX: 38, minZ: -34, maxZ: 34, killY: -12 },
    theme: theme({
      fog: 0x140a20, skyTop: 0x4a1a6a, skyBottom: 0x0a0610, accent: 0xff2f86, fogDensity: 0.022,
      palette: { concrete: '#2e263e', metal: '#7a8296', neon: '#ff2f86', glass: '#e9c6ff', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#5cffd6', grass: '#3f7d4e', caution: '#ffb020', crate: '#b07a4e' },
    }),
    boxes,
    lights: [
      { x: -20, y: 4.5, z: -16, color: '#ff2f86', intensity: 14, distance: 20 },
      { x: 24, y: 5, z: 0, color: '#5cffd6', intensity: 12, distance: 22 },
      { x: 0, y: 4, z: -10, color: '#7af0ff', intensity: 8, distance: 16 },
      { x: -28, y: 3, z: 12, color: '#ffb03a', intensity: 7, distance: 14 },
      { x: -30, y: 6, z: -22, color: '#ff5a9a', intensity: 6, distance: 12 },
      { x: 25, y: 6, z: 8, color: '#5cffd6', intensity: 5, distance: 12 },
      { x: 0, y: 1.5, z: 1, color: '#ffb03a', intensity: 3, distance: 8 },
    ],
    spawns: {
      a: [sp(-10, -30, PI), sp(0, -31, PI), sp(12, -30, PI), sp(-22, -30, PI), sp(22, -29, PI * 0.85)],
      b: [sp(-10, 30, 0), sp(0, 31, 0), sp(12, 30, 0), sp(-22, 30, 0.2), sp(24, 29, -0.3)],
      ffa: [sp(-22, -18, 0.4), sp(24, 8, 0, 3.3), sp(0, -8, PI), sp(-16, 20, 0), sp(28, -10, PI / 2), sp(8, 18, 0), sp(-8, 6, -1)],
    },
    objectives: [
      { id: 'lane_w', x: -22, y: 0, z: -8, radius: 3.2 },
      { id: 'mid', x: 0, y: 0, z: 1, radius: 3.4 },
      { id: 'lane_e', x: 24, y: 0, z: 6, radius: 3.2 },
      { id: 'roof', x: 26, y: 3.3, z: -8, radius: 3 },
      { id: 'south', x: -8, y: 0, z: 20, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function orbitalYard() {
  const boxes = [ floor(-42, 42, -34, 34, 'metal'), ...walls(-42, 42, -34, 34, 8) ];
  const cols = [-30, -10, 10, 30], rows = [-22, -10, 2, 14];
  for (const x of cols) for (const z of rows) {
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    boxes.push(box(x, 0, z, 2.7, 2.55, 6.1, 'caution'));
    if ((Math.abs(x) === 30 && z === -10) || (x === -10 && z === 14)) boxes.push(box(x, 2.55, z, 2.7, 2.4, 6.1, 'metal'));
  }
  boxes.push(box(0, 0, 0, 3.2, 0.9, 3.2, 'metal'), slab(0, 5.1, -10, 6, 6, 'metal'), ...stairs(-6, -10, 3, 5.5, 5.1, 'x+', 'metal'));
  boxes.push(slab(34, 0.3, 0, 4.2, 4.2, 'caution', 0.3, { mover: { axis: 'y', amp: 2.1, speed: 0.35 } }), box(-36, 0, 0, 1, 3.5, 8, 'metal'), box(0, 2.2, -28, 10, 0.3, 0.3, 'neon', { solid: false, visual: true }));
  boxes.push(box(-30, 3.2, -22, 2.7, 0.08, 0.08, 'neon', { solid:false, visual:true }), box(10, 3.2, 14, 2.7, 0.08, 0.08, 'neon', { solid:false, visual:true }));
  return pack({
    id: 'orbital_yard', nameKey: 'map.orbital_yard.name', descKey: 'map.orbital_yard.desc', combat: true,
    bounds: { minX: -42, maxX: 42, minZ: -34, maxZ: 34, killY: -12 },
    theme: theme({
      fog: 0x1a130a, skyTop: 0x5a3418, skyBottom: 0x120c08, accent: 0xffb020, fogDensity: 0.018,
      palette: { concrete: '#3e352c', metal: '#9a9488', neon: '#ffb020', glass: '#ffe8c0', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#ffb020', grass: '#3f7d4e', caution: '#e89a22', crate: '#b07a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 6, z: 0, color: '#ffb020', intensity: 16, distance: 26 },
      { x: -20, y: 4, z: -16, color: '#ff7a3c', intensity: 9, distance: 16 },
      { x: 20, y: 4, z: 12, color: '#ffe0a8', intensity: 9, distance: 16 },
      { x: 34, y: 4, z: 0, color: '#5cffd6', intensity: 7, distance: 14 },
      { x: -36, y: 2, z: 0, color: '#ffb020', intensity: 5, distance: 10 },
    ],
    spawns: {
      a: [sp(-18, -30, PI), sp(0, -30, PI), sp(18, -30, PI), sp(-32, -28, PI), sp(32, -28, PI)],
      b: [sp(-18, 30, 0), sp(0, 30, 0), sp(18, 30, 0), sp(-32, 28, 0), sp(28, 28, 0)],
      ffa: [sp(-16, 0, PI / 2), sp(16, -8, 0), sp(0, 12, PI), sp(36, -14, -PI / 2), sp(-36, 14, 0.4), sp(8, -20, PI)],
    },
    objectives: [
      { id: 'pad', x: 0, y: 0, z: 0, radius: 3.6 },
      { id: 'west', x: -20, y: 0, z: 8, radius: 3.2 },
      { id: 'east', x: 20, y: 0, z: -8, radius: 3.2 },
      { id: 'lift', x: 34, y: 0, z: 0, radius: 3 },
      { id: 'cat', x: 0, y: 5.1, z: -10, radius: 2.8 },
    ],
    zones: [], pads: [],
  });
}

function floodline() {
  const boxes = [
    floor(-40, -6, -32, 32, 'concrete'), floor(6, 40, -32, 32, 'concrete'), floor(-6, 6, -32, 32, 'concrete', -1.05),
    ...walls(-40, 40, -32, 32, 7),
    box(0, -0.2, -18, 5.2, 0.35, 3.2, 'metal'), box(0, -0.2, 0, 5.2, 0.35, 3.4, 'metal'), box(0, -0.2, 18, 5.2, 0.35, 3.2, 'metal'),
    ...stairs(0, -26, 4, 5.2, 1.15, 'z+', 'metal', -1.05), ...stairs(0, 26, 4, 5.2, 1.15, 'z-', 'metal', -1.05),
    ...stairs(-4, -10, 2.4, 4.2, 1.15, 'x-', 'metal', -1.05), ...stairs(4, 10, 2.4, 4.2, 1.15, 'x+', 'metal', -1.05),
    box(0, -0.85, 0, 10, 0.4, 60, 'water', { solid: false, visual: true }),
    box(-28, 0, -20, 14, 4.2, 0.4, 'concrete'), box(-28, 0, -8, 14, 4.2, 0.4, 'concrete'), box(-34.8, 0, -14, 0.4, 4.2, 12, 'concrete'), box(-22, 0, -14, 0.4, 4.2, 8, 'concrete'),
    box(-28, 0, -14, 2.2, 2.6, 0.35, 'metal', { toggle: { period: 11, open: 4, phase: 0 } }),
    box(-26, 0, 12, 16, 3.6, 0.4, 'concrete'), box(-26, 0, 24, 16, 3.6, 0.4, 'concrete'), box(-26, 0, 18, 2.4, 2.6, 0.35, 'metal', { toggle: { period: 11, open: 4, phase: 5 } }),
    box(28, 0, -16, 0.4, 4, 18, 'concrete'), box(20, 0, -16, 0.4, 4, 10, 'concrete'), box(24, 0, -6, 8, 2.5, 0.35, 'metal', { toggle: { period: 13, open: 5, phase: 2 } }), box(30, 0, 14, 12, 3.2, 8, 'concrete'),
    crate(-14, -6, 1.5, 1.1, 1.5), crate(14, 8, 1.6, 1.2, 1.4), crate(-12, 22, 1.2, 1, 2),
    box(-16, 2.4, 0, 0.2, 0.7, 4, 'trim', { solid: false, visual: true }),
    box(-28, 1.5, -20, 14, 0.08, 0.08, 'neon', { solid:false, visual:true }),
    box(20, 1.5, -16, 0.08, 0.08, 18, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'floodline', nameKey: 'map.floodline.name', descKey: 'map.floodline.desc', combat: true,
    bounds: { minX: -40, maxX: 40, minZ: -32, maxZ: 32, killY: -8 },
    theme: theme({
      fog: 0x061e2a, skyTop: 0x184e60, skyBottom: 0x060e14, accent: 0x3dffe8, fogDensity: 0.024,
      palette: { concrete: '#1e2e38', metal: '#6a8a96', neon: '#3dffe8', glass: '#b8fff2', sand: '#c6a56e', wood: '#8a6244', water: '#18b8c8', trim: '#7af0ff', grass: '#3f7d4e', caution: '#ffb020', crate: '#8a6a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 3, z: 0, color: '#3dffe8', intensity: 12, distance: 20 },
      { x: -24, y: 3, z: -14, color: '#7af0ff', intensity: 8, distance: 14 },
      { x: 24, y: 3, z: 10, color: '#9ad7ff', intensity: 8, distance: 14 },
      { x: 0, y: 2, z: -18, color: '#5cffd6', intensity: 6, distance: 12 },
      { x: 0, y: 0.5, z: 0, color: '#18b8c8', intensity: 5, distance: 18 },
    ],
    spawns: {
      a: [sp(-20, -28, PI), sp(-8, -28, PI), sp(16, -28, PI), sp(30, -26, PI), sp(-32, -20, PI / 2)],
      b: [sp(-20, 28, 0), sp(-8, 28, 0), sp(18, 28, 0), sp(30, 26, 0), sp(-30, 22, -0.4)],
      ffa: [sp(-14, 0, 0), sp(14, -10, PI), sp(0, 8, 1), sp(-24, 16, 0), sp(28, -8, PI), sp(8, 20, 0)],
    },
    objectives: [
      { id: 'west', x: -24, y: 0, z: 0, radius: 3.2 },
      { id: 'bridge', x: 0, y: 0, z: 0, radius: 3 },
      { id: 'east', x: 24, y: 0, z: 6, radius: 3.2 },
      { id: 'north', x: -10, y: 0, z: 22, radius: 3 },
      { id: 'south', x: 12, y: 0, z: -20, radius: 3 },
    ],
    zones: [{ id: 'channel', type: 'slow', min: { x: -5, y: -2, z: -32 }, max: { x: 5, y: 0.05, z: 32 }, mul: 0.78 }],
    pads: [],
  });
}

function dustStation() {
  const boxes = [
    floor(-40, 40, -32, 32, 'sand'), floor(8, 36, -10, 22, 'sand'), ...walls(-40, 40, -32, 32, 7),
    box(-2, 0, -18, 3.2, 2.5, 8, 'metal'), box(-2, 0, -4, 3.2, 2.5, 7, 'metal'), box(-2, 0, 10, 3.2, 2.5, 8, 'metal'), box(-2, 0, 22, 3.2, 2.2, 5, 'caution'),
    crate(18, 0, 2, 1.2, 2), crate(24, 8, 1.6, 1.1, 1.6), crate(16, 14, 1.4, 1.4, 1.4), box(28, 0, 4, 0.5, 1.6, 8, 'concrete'),
    floor(-36, -14, -8, 20, 'concrete', -2.2), box(-25, -2.2, -8, 22, 2.2, 0.5, 'concrete'), box(-25, 2.1, 6, 16, 0.35, 10, 'concrete'),
    ...stairs(-18, -12, 3.2, 5.5, 2.2, 'z+', 'metal', -2.2), ...stairs(-30, 18, 3, 5, 2.2, 'z-', 'metal', -2.2),
    box(-36, 1.5, 0, 0.2, 0.4, 6, 'caution', { solid: false, visual: true }), crate(-8, -24, 1.5, 1.1, 1.5), crate(8, 26, 1.5, 1.1, 1.5),
    box(-2, 2.8, -18, 3.2, 0.06, 8, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'dust_station', nameKey: 'map.dust_station.name', descKey: 'map.dust_station.desc', combat: true,
    bounds: { minX: -40, maxX: 40, minZ: -32, maxZ: 32, killY: -10 },
    theme: theme({
      fog: 0x2a1e12, skyTop: 0xd49a5a, skyBottom: 0x6e4a2a, accent: 0xffb020, fogDensity: 0.014, sun: 0xffe0b0, ambient: 0xf0d2a8,
      palette: { concrete: '#a89880', metal: '#9a8e80', neon: '#ffb020', glass: '#f8e8c8', sand: '#d8b88a', wood: '#8a6244', water: '#1c9aaf', trim: '#ffe0a0', grass: '#8a8a48', caution: '#e8a840', crate: '#be8c5e' },
    }),
    boxes,
    lights: [
      { x: 20, y: 5, z: 6, color: '#ffd2a0', intensity: 10, distance: 22 },
      { x: -24, y: 1, z: 6, color: '#ffb020', intensity: 6, distance: 14 },
      { x: 0, y: 4, z: 0, color: '#ffcf8a', intensity: 5, distance: 16 },
      { x: -2, y: 3.5, z: -18, color: '#ff8a3c', intensity: 4, distance: 10 },
    ],
    spawns: {
      a: [sp(-8, -28, PI), sp(6, -28, PI), sp(20, -26, PI), sp(-24, -26, PI), sp(32, -20, PI)],
      b: [sp(-8, 28, 0), sp(8, 28, 0), sp(22, 26, 0), sp(-22, 26, 0), sp(-32, 16, 0)],
      ffa: [sp(20, 6, 1), sp(-24, 4, 0.2), sp(0, -8, PI), sp(12, 18, 0), sp(-16, -16, 0.8), sp(30, 10, -1)],
    },
    objectives: [
      { id: 'yard', x: 20, y: 0, z: 6, radius: 3.6 },
      { id: 'platform', x: 4, y: 0, z: 0, radius: 3.2 },
      { id: 'trench', x: -24, y: -2.2, z: 6, radius: 3.2 },
      { id: 'northcar', x: 4, y: 0, z: 18, radius: 3 },
      { id: 'south', x: -6, y: 0, z: -20, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function skybridge() {
  const boxes = [
    floor(-36, 36, -28, 28, 'concrete'), ...walls(-36, 36, -28, 28, 12),
    box(-22, 0, 0, 10, 8.2, 14, 'concrete'), box(22, 0, 0, 10, 8.2, 14, 'concrete'),
    slab(-22, 4.1, -12, 14, 5, 'metal'), slab(-22, 4.1, 12, 14, 5, 'metal'), slab(22, 4.1, -12, 14, 5, 'metal'), slab(22, 4.1, 12, 14, 5, 'metal'),
    slab(-22, 8.2, 0, 12, 16, 'metal'), slab(22, 8.2, 0, 12, 16, 'metal'),
    slab(0, 4.1, -6, 16, 3.2, 'metal'), slab(0, 4.1, 6, 16, 3.2, 'metal'), slab(0, 8.2, 0, 14, 3.4, 'metal'),
    box(0, 8.2, -1.9, 12, 2.1, 0.12, 'glass', { breakable: true, hp: 60 }), box(0, 8.2, 1.9, 12, 2.1, 0.12, 'glass', { breakable: true, hp: 60 }),
    box(-6, 4.1, -6, 0.12, 2, 2.6, 'glass', { breakable: true, hp: 50 }), box(6, 4.1, 6, 0.12, 2, 2.6, 'glass', { breakable: true, hp: 50 }),
    ...stairs(-22, -20, 3.4, 6.5, 4.1, 'z+', 'metal'), ...stairs(22, 20, 3.4, 6.5, 4.1, 'z-', 'metal'), ...stairs(-30, 0, 3.2, 6, 4.1, 'x+', 'metal'), ...stairs(14, 0, 3, 5.5, 4.1, 'x-', 'metal'),
    ...stairs(-22, -12, 3.2, 5.4, 4.1, 'z+', 'metal', 4.1), ...stairs(22, 12, 3.2, 5.4, 4.1, 'z-', 'metal', 4.1),
    crate(-8, -16, 1.4, 1.1, 1.4), crate(8, 16, 1.4, 1.1, 1.4), box(0, 6.2, 0, 0.3, 0.3, 6, 'trim', { solid: false, visual: true }),
    box(0, 8.2, 0, 14, 0.06, 0.06, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'skybridge', nameKey: 'map.skybridge.name', descKey: 'map.skybridge.desc', combat: true,
    bounds: { minX: -36, maxX: 36, minZ: -28, maxZ: 28, killY: -12 },
    theme: theme({
      fog: 0x0e1e32, skyTop: 0x7ac4ff, skyBottom: 0x1a3050, accent: 0x9ad7ff, fogDensity: 0.016,
      palette: { concrete: '#2a4a68', metal: '#9ab6cc', neon: '#9ad7ff', glass: '#e0f4ff', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#e8f7ff', grass: '#3f7d4e', caution: '#ffb020', crate: '#8a6a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 10, z: 0, color: '#d8f4ff', intensity: 14, distance: 24 },
      { x: -22, y: 6, z: 0, color: '#7ec8ff', intensity: 9, distance: 14 },
      { x: 22, y: 6, z: 0, color: '#ffd0a8', intensity: 9, distance: 14 },
      { x: 0, y: 2, z: 0, color: '#9ad7ff', intensity: 5, distance: 12 },
    ],
    spawns: {
      a: [sp(-30, -22, PI * 0.85), sp(-14, -22, PI), sp(0, -22, PI), sp(14, -22, PI), sp(28, -20, PI)],
      b: [sp(-28, 22, 0.2), sp(-12, 22, 0), sp(0, 22, 0), sp(16, 22, 0), sp(30, 20, -0.2)],
      ffa: [sp(-22, 2, 0, 8.2), sp(22, -12, PI, 4.1), sp(0, 0, 1.2, 8.2), sp(-8, -6, PI), sp(10, 10, 0), sp(-30, 6, 0.5)],
    },
    objectives: [
      { id: 'west', x: -22, y: 4.1, z: -12, radius: 3 },
      { id: 'bridge', x: 0, y: 4.1, z: 0, radius: 3 },
      { id: 'east', x: 22, y: 4.1, z: 12, radius: 3 },
      { id: 'high', x: 0, y: 8.2, z: 0, radius: 2.8 },
      { id: 'ground', x: 0, y: 0, z: -12, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function glassworks() {
  const boxes = [
    floor(-36, 36, -30, 30, 'concrete'), ...walls(-36, 36, -30, 30, 7),
    box(-16, 0, 0, 3.2, 1.35, 28, 'metal'), box(0, 0, 2, 3.2, 1.35, 22, 'metal'), box(16, 0, -2, 3.2, 1.35, 26, 'metal'),
    box(-28, 0, -16, 8, 3.4, 8, 'concrete'), box(-28, 0, 16, 8, 3.4, 8, 'concrete'), box(28, 0, -14, 8, 3.2, 10, 'concrete'), box(28, 0, 16, 8, 3.2, 8, 'concrete'),
    slab(0, 3.6, -20, 10, 6, 'metal'), ...stairs(0, -14, 3.4, 5.5, 3.6, 'z-', 'metal'),
    box(-8, 1.6, -20, 0.12, 1.8, 4, 'glass', { breakable: true, hp: 40 }), box(8, 1.6, 12, 0.12, 1.8, 4, 'glass', { breakable: true, hp: 40 }),
    crate(-8, 8, 1.3, 1, 1.3), crate(8, -8, 1.3, 1.1, 1.3), box(0, 2.2, 0, 0.2, 0.5, 8, 'trim', { solid: false, visual: true }),
    box(-16, 1.8, 0, 3.2, 0.06, 0.06, 'neon', { solid:false, visual:true }), box(0, 1.8, 2, 3.2, 0.06, 0.06, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'glassworks', nameKey: 'map.glassworks.name', descKey: 'map.glassworks.desc', combat: true,
    bounds: { minX: -36, maxX: 36, minZ: -30, maxZ: 30, killY: -12 },
    theme: theme({
      fog: 0x0e221a, skyTop: 0x1e5a42, skyBottom: 0x08140f, accent: 0x8dffc6, fogDensity: 0.018,
      palette: { concrete: '#1e342a', metal: '#7a9688', neon: '#8dffc6', glass: '#d8ffe8', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#b6ffd8', grass: '#3f7d4e', caution: '#ffb020', crate: '#8a6a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 4.5, z: 0, color: '#b6ffd8', intensity: 12, distance: 22 },
      { x: -20, y: 3, z: -10, color: '#8dffc6', intensity: 7, distance: 14 },
      { x: 20, y: 3, z: 10, color: '#ffe0a0', intensity: 7, distance: 14 },
      { x: 0, y: 6, z: -20, color: '#8dffc6', intensity: 6, distance: 12 },
    ],
    spawns: {
      a: [sp(-12, -26, PI), sp(0, -26, PI), sp(14, -26, PI), sp(-28, -24, PI), sp(28, -22, PI)],
      b: [sp(-12, 26, 0), sp(0, 26, 0), sp(14, 26, 0), sp(-28, 24, 0), sp(26, 24, 0)],
      ffa: [sp(-8, 0, 1), sp(10, -6, PI), sp(0, -20, 0, 3.6), sp(-24, 8, 0.4), sp(24, -8, -0.5), sp(4, 16, PI)],
    },
    objectives: [
      { id: 'west', x: -16, y: 0, z: 8, radius: 3 },
      { id: 'mid', x: 0, y: 0, z: 2, radius: 3.2 },
      { id: 'east', x: 16, y: 0, z: -8, radius: 3 },
      { id: 'loft', x: 0, y: 3.6, z: -20, radius: 2.8 },
      { id: 'north', x: -8, y: 0, z: 18, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function relaySpire() {
  const boxes = [
    floor(-34, 34, -34, 34, 'metal'), ...walls(-34, 34, -34, 34, 10),
    box(-18, 0, -18, 10, 6.4, 10, 'concrete'), box(18, 0, -18, 10, 6.4, 10, 'concrete'), box(-18, 0, 18, 10, 6.4, 10, 'concrete'), box(18, 0, 18, 10, 6.4, 10, 'concrete'),
    box(0, 0, 0, 5, 8.4, 5, 'metal'), slab(0, 3.6, -18, 16, 6, 'metal'), slab(0, 3.6, 18, 16, 6, 'metal'), slab(-18, 3.6, 0, 6, 16, 'metal'), slab(18, 3.6, 0, 6, 16, 'metal'),
    slab(0, 6.4, -18, 8, 8, 'metal'), slab(0, 6.4, 18, 8, 8, 'metal'),
    ...stairs(0, -26, 3.4, 6.2, 3.6, 'z+', 'metal'), ...stairs(0, 26, 3.4, 6.2, 3.6, 'z-', 'metal'), ...stairs(-26, 0, 3.4, 6.2, 3.6, 'x+', 'metal'), ...stairs(26, 0, 3.4, 6.2, 3.6, 'x-', 'metal'), ...stairs(0, -18, 3, 5, 2.8, 'z+', 'metal', 3.6),
    crate(-8, -8, 1.3, 1.1, 1.3), crate(8, 8, 1.3, 1.1, 1.3), crate(8, -6, 1.2, 1, 1.2), box(0, 7.2, 0, 0.4, 2.2, 0.4, 'trim'), box(0, 5, -24, 6, 0.25, 0.25, 'neon', { solid: false, visual: true }),
    box(0, 8.4, 0, 0.6, 0.6, 0.6, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'relay_spire', nameKey: 'map.relay_spire.name', descKey: 'map.relay_spire.desc', combat: true,
    bounds: { minX: -34, maxX: 34, minZ: -34, maxZ: 34, killY: -12 },
    theme: theme({
      fog: 0x14081e, skyTop: 0x5a1e7a, skyBottom: 0x0e0614, accent: 0xd28bff, fogDensity: 0.02,
      palette: { concrete: '#3a2846', metal: '#9a8aa8', neon: '#d28bff', glass: '#f0d8ff', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#e4c2ff', grass: '#3f7d4e', caution: '#ffb020', crate: '#8a6a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 8, z: 0, color: '#d28bff', intensity: 18, distance: 24 },
      { x: -18, y: 5, z: -18, color: '#ff8ad4', intensity: 8, distance: 12 },
      { x: 18, y: 5, z: 18, color: '#7af0ff', intensity: 8, distance: 12 },
      { x: 0, y: 2, z: -18, color: '#d28bff', intensity: 5, distance: 10 },
      { x: 0, y: 9, z: 0, color: '#ffffff', intensity: 6, distance: 18 },
    ],
    spawns: {
      a: [sp(-8, -30, PI), sp(0, -30, PI), sp(8, -30, PI), sp(-26, -26, PI * 0.75), sp(26, -26, PI * 1.25)],
      b: [sp(-8, 30, 0), sp(0, 30, 0), sp(8, 30, 0), sp(-26, 26, 0.4), sp(26, 26, -0.4)],
      ffa: [sp(0, -18, PI, 3.6), sp(-18, 0, 0.5, 3.6), sp(18, 2, 1, 6.4), sp(0, 10, 0), sp(-10, 8, PI), sp(12, -12, 0.8)],
    },
    objectives: [
      { id: 'core', x: 6, y: 0, z: 0, radius: 3 },
      { id: 'north', x: 0, y: 3.6, z: -18, radius: 3 },
      { id: 'south', x: 0, y: 3.6, z: 18, radius: 3 },
      { id: 'east', x: 18, y: 3.6, z: 0, radius: 2.8 },
      { id: 'west', x: -18, y: 0, z: 8, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function cinderMarket() {
  const boxes = [ floor(-32, 32, -32, 32, 'wood'), ...walls(-32, 32, -32, 32, 6), box(-22, 0, -22, 10, 4.6, 10, 'concrete'), box(22, 0, -22, 10, 4.6, 10, 'concrete'), box(-22, 0, 22, 10, 4.2, 10, 'concrete'), box(22, 0, 22, 10, 4.2, 10, 'concrete'), ...stairs(-14, -22, 3, 5.2, 4.6, 'x+', 'wood'), ...stairs(14, 22, 3, 5.2, 4.2, 'x-', 'wood') ];
  const stalls = [[-10, -10], [-10, -4], [-10, 6], [-10, 12], [10, -12], [10, -4], [10, 6], [10, 14], [-4, -14], [6, -14], [-6, 14], [4, 10], [-16, 0], [16, 2], [0, -8], [0, 8]];
  for (const [x, z] of stalls) {
    if (Math.abs(x) < 2.2 || Math.abs(z) < 2.2) continue;
    boxes.push(box(x, 0, z, 2.1, 1.15, 2.1, 'wood'), box(x, 1.15, z, 2.2, 0.12, 2.2, 'caution', { solid: false, visual: true }));
  }
  boxes.push(box(0, 0, 0, 2.4, 1.3, 2.4, 'trim'), box(-22, 3.4, -22, 2, 0.5, 0.2, 'neon', { solid: false, visual: true }), box(22, 3.4, 22, 2, 0.5, 0.2, 'neon', { solid: false, visual: true }));
  boxes.push(box(0, 3.5, 0, 2.4, 0.08, 2.4, 'neon', { solid:false, visual:true }));
  return pack({
    id: 'cinder_market', nameKey: 'map.cinder_market.name', descKey: 'map.cinder_market.desc', combat: true,
    bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32, killY: -12 },
    theme: theme({
      fog: 0x2a100a, skyTop: 0x6a2818, skyBottom: 0x180a06, accent: 0xff5a3c, fogDensity: 0.022,
      palette: { concrete: '#523a30', metal: '#9a8070', neon: '#ff5a3c', glass: '#ffd8c8', sand: '#c6a56e', wood: '#b06a3c', water: '#1c9aaf', trim: '#ffb08a', grass: '#3f7d4e', caution: '#ffb020', crate: '#cc8c4e' },
    }),
    boxes,
    lights: [
      { x: 0, y: 3.5, z: 0, color: '#ffb08a', intensity: 14, distance: 20 },
      { x: -16, y: 3, z: -8, color: '#ff5a3c', intensity: 8, distance: 14 },
      { x: 16, y: 3, z: 10, color: '#ffb020', intensity: 8, distance: 14 },
      { x: -22, y: 4, z: 22, color: '#ff8a5a', intensity: 6, distance: 12 },
      { x: 22, y: 5, z: -22, color: '#ff5a3c', intensity: 6, distance: 12 },
    ],
    spawns: {
      a: [sp(-8, -28, PI), sp(0, -28, PI), sp(10, -28, PI), sp(-28, -28, PI), sp(28, -28, PI)],
      b: [sp(-8, 28, 0), sp(0, 28, 0), sp(10, 28, 0), sp(-28, 28, 0), sp(28, 28, 0)],
      ffa: [sp(-12, 4, 0.5), sp(12, -6, PI), sp(0, 12, 0), sp(-20, 8, 0.2), sp(18, 16, -0.4), sp(6, -18, PI)],
    },
    objectives: [
      { id: 'plaza', x: 0, y: 0, z: 0, radius: 3.3 },
      { id: 'west', x: -14, y: 0, z: 6, radius: 3 },
      { id: 'east', x: 14, y: 0, z: -6, radius: 3 },
      { id: 'shop', x: -22, y: 4.6, z: -22, radius: 2.6 },
      { id: 'lane', x: 0, y: 0, z: 16, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function sublevel9() {
  const boxes = [ floor(-26, 26, -38, 38, 'concrete'), ...walls(-26, 26, -38, 38, 5.5), box(-16, 0, -20, 0.6, 3.4, 14, 'concrete'), box(-16, 0, 8, 0.6, 3.4, 16, 'concrete'), box(16, 0, -8, 0.6, 3.4, 18, 'concrete'), box(16, 0, 24, 0.6, 3.4, 10, 'concrete') ];
  for (let z = -28; z <= 28; z += 8) { boxes.push(box(-8, 0, z, 1.15, 3.3, 1.15, 'metal'), box(8, 0, z + 4, 1.15, 3.3, 1.15, 'metal')); }
  boxes.push(box(-20, 0, -10, 3.2, 2.3, 14, 'caution'), box(-20, 0, 14, 3.2, 2.3, 10, 'caution'), box(0, 0, 0, 1.6, 1.1, 2.4, 'crate'), box(0, 0, -16, 1.4, 1.2, 1.4, 'crate'), box(4, 0, 18, 1.5, 1, 1.5, 'crate'), box(0, 3.6, 0, 8, 0.2, 0.3, 'neon', { solid: false, visual: true }));
  boxes.push(box(-8, 0.1, -28, 0.08, 0.08, 56, 'neon', { solid:false, visual:true }), box(8, 0.1, 28, 0.08, 0.08, 56, 'neon', { solid:false, visual:true }));
  return pack({
    id: 'sublevel_9', nameKey: 'map.sublevel_9.name', descKey: 'map.sublevel_9.desc', combat: true,
    bounds: { minX: -26, maxX: 26, minZ: -38, maxZ: 38, killY: -12 },
    theme: theme({
      fog: 0x0e1820, skyTop: 0x1e3246, skyBottom: 0x060a10, accent: 0x7af0ff, fogDensity: 0.026,
      palette: { concrete: '#222e38', metal: '#5e6e7a', neon: '#7af0ff', glass: '#c0d4dc', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#9ad7ff', grass: '#3f7d4e', caution: '#d8a040', crate: '#8a6a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 3.2, z: -12, color: '#9ad7ff', intensity: 8, distance: 14 },
      { x: 0, y: 3.2, z: 12, color: '#ffb020', intensity: 7, distance: 14 },
      { x: -18, y: 2.4, z: 0, color: '#7af0ff', intensity: 6, distance: 10 },
      { x: -8, y: 1, z: -28, color: '#7af0ff', intensity: 4, distance: 18 },
      { x: 8, y: 1, z: 28, color: '#ffb020', intensity: 4, distance: 18 },
    ],
    spawns: {
      a: [sp(-6, -34, PI), sp(0, -34, PI), sp(8, -34, PI), sp(-18, -32, PI), sp(18, -30, PI)],
      b: [sp(-6, 34, 0), sp(0, 34, 0), sp(8, 34, 0), sp(-18, 32, 0), sp(16, 32, 0)],
      ffa: [sp(-20, 0, 0.4), sp(12, -8, PI), sp(0, 16, 0), sp(-8, 8, 1), sp(18, 12, -0.6), sp(4, -20, PI)],
    },
    objectives: [
      { id: 'platform', x: 0, y: 0, z: 0, radius: 3.2 },
      { id: 'west', x: -20, y: 0, z: 4, radius: 3 },
      { id: 'east', x: 12, y: 0, z: -12, radius: 3 },
      { id: 'north', x: 0, y: 0, z: 22, radius: 3 },
      { id: 'south', x: -4, y: 0, z: -22, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function harborLattice() {
  const boxes = [
    floor(-32, 32, -30, 22, 'wood'), floor(-18, 18, 22, 30, 'wood'), ...walls(-36, 36, -32, 18, 7),
    box(0, 0, -28, 20, 6, 1.2, 'concrete', { boundary: true }),
    box(-20, 0, -8, 2.6, 2.5, 6, 'caution'), box(-20, 2.5, -8, 2.6, 2.4, 6, 'metal'), box(-10, 0, 4, 2.6, 2.5, 6, 'caution'),
    box(12, 0, -6, 2.6, 2.5, 6.2, 'metal'), box(22, 0, 6, 2.6, 2.5, 6, 'caution'), box(22, 2.5, 6, 2.6, 2.3, 6, 'metal'),
    box(0, 0, 12, 8, 2.2, 14, 'metal'), box(0, 2.2, 12, 6, 1.6, 10, 'concrete'), ...stairs(6, 12, 3, 5, 2.2, 'x-', 'metal'),
    box(-28, 0, 14, 1.2, 7, 1.2, 'caution'), box(28, 0, -2, 1.2, 7, 1.2, 'caution'), slab(-28, 7, 10, 8, 1.4, 'caution', 0.3),
    crate(8, -14, 1.4, 1.1, 1.4), crate(-6, -16, 1.6, 1.2, 1.2), box(0, 0.2, 26, 16, 0.2, 8, 'water', { solid: false, visual: true }),
    box(-20, 0.2, -8, 2.6, 0.06, 6, 'neon', { solid:false, visual:true }), box(22, 0.2, 6, 2.6, 0.06, 6, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'harbor_lattice', nameKey: 'map.harbor_lattice.name', descKey: 'map.harbor_lattice.desc', combat: true,
    bounds: { minX: -36, maxX: 36, minZ: -32, maxZ: 36, killY: -6 },
    theme: theme({
      fog: 0x0a1a28, skyTop: 0x1e4a6a, skyBottom: 0x081018, accent: 0xffb020, fogDensity: 0.018,
      palette: { concrete: '#344050', metal: '#7a8a94', neon: '#ffb020', glass: '#d0e4ee', sand: '#c6a56e', wood: '#8d6a45', water: '#1a8ac0', trim: '#ffd27a', grass: '#3f7d4e', caution: '#e8a830', crate: '#b07a4a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 5, z: 8, color: '#ffe0b0', intensity: 12, distance: 20 },
      { x: -20, y: 4, z: -8, color: '#ffb020', intensity: 8, distance: 14 },
      { x: 22, y: 4, z: 4, color: '#9ad7ff', intensity: 7, distance: 14 },
      { x: -28, y: 8, z: 14, color: '#ff7a3c', intensity: 6, distance: 12 },
      { x: 0, y: 1, z: 26, color: '#1a8ac0', intensity: 8, distance: 20 },
    ],
    spawns: {
      a: [sp(-12, -26, PI), sp(0, -26, PI), sp(14, -26, PI), sp(-24, -22, PI), sp(24, -20, PI)],
      b: [sp(-8, 16, 0), sp(6, 16, 0), sp(-18, 8, 0.6), sp(16, 6, -0.4), sp(0, 4, 0)],
      ffa: [sp(-20, -8, 0.5, 4.95), sp(12, -10, PI), sp(0, 12, PI, 3.85), sp(22, 6, -1, 4.85), sp(-8, 10, 0), sp(8, -22, PI)],
    },
    objectives: [
      { id: 'dock', x: 0, y: 0, z: -8, radius: 3.4 },
      { id: 'ship', x: 0, y: 2.2, z: 12, radius: 3 },
      { id: 'west', x: -16, y: 0, z: 6, radius: 3 },
      { id: 'east', x: 18, y: 0, z: -4, radius: 3 },
      { id: 'crane', x: -28, y: 0, z: 8, radius: 2.8 },
    ],
    zones: [
      { id: 'water', type: 'kill', min: { x: -40, y: -4, z: 31 }, max: { x: 40, y: 2, z: 42 } },
      { id: 'water_e', type: 'kill', min: { x: 33, y: -4, z: -40 }, max: { x: 42, y: 2, z: 40 } },
      { id: 'water_w', type: 'kill', min: { x: -42, y: -4, z: -40 }, max: { x: -33, y: 2, z: 40 } },
    ],
    pads: [],
  });
}

function atriumLoop() {
  const boxes = [
    floor(-26, 26, -26, -9, 'concrete'), floor(-26, 26, 9, 26, 'concrete'), floor(-26, -9, -9, 9, 'concrete'), floor(9, 26, -9, 9, 'concrete'), floor(-12, 12, -12, 12, 'metal', -3.1),
    ...walls(-26, 26, -26, 26, 8),
    slab(0, 4, -16, 22, 6, 'metal'), slab(0, 4, 16, 22, 6, 'metal'), slab(-16, 4, 0, 6, 14, 'metal'), slab(16, 4, 0, 6, 14, 'metal'),
    ...stairs(0, -7, 3.6, 6, 3.1, 'z-', 'metal', -3.1), ...stairs(0, 7, 3.6, 6, 3.1, 'z+', 'metal', -3.1), ...stairs(-7, 0, 3.4, 5.5, 3.1, 'x-', 'metal', -3.1), ...stairs(7, 0, 3.4, 5.5, 3.1, 'x+', 'metal', -3.1),
    ...stairs(0, -22, 3.4, 6, 4, 'z+', 'metal'), ...stairs(0, 22, 3.4, 6, 4, 'z-', 'metal'),
    crate(-12, -12, 1.3, 1.1, 1.3), crate(12, 12, 1.3, 1.1, 1.3), box(0, -2.6, 0, 2, 0.9, 2, 'trim'), box(0, 4.4, -16, 8, 0.2, 0.2, 'neon', { solid: false, visual: true }),
    box(0, 4, -16, 22, 0.06, 0.06, 'neon', { solid:false, visual:true }), box(0, 4, 16, 22, 0.06, 0.06, 'neon', { solid:false, visual:true }),
  ];
  return pack({
    id: 'atrium_loop', nameKey: 'map.atrium_loop.name', descKey: 'map.atrium_loop.desc', combat: true,
    bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26, killY: -10 },
    theme: theme({
      fog: 0x1c1812, skyTop: 0xecd8a8, skyBottom: 0x2e2418, accent: 0xffd27a, fogDensity: 0.016,
      palette: { concrete: '#ddd5c4', metal: '#bcb6a6', neon: '#ffd27a', glass: '#fff8e6', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#fff1cc', grass: '#3f7d4e', caution: '#ffb020', crate: '#c8a87a' },
    }),
    boxes,
    lights: [
      { x: 0, y: 6, z: 0, color: '#fff1cc', intensity: 14, distance: 24 },
      { x: 0, y: 5, z: -16, color: '#ffd27a', intensity: 8, distance: 14 },
      { x: 0, y: 2, z: 0, color: '#ffe8b0', intensity: 6, distance: 12 },
      { x: -16, y: 5, z: 0, color: '#ffd27a', intensity: 5, distance: 10 },
      { x: 16, y: 5, z: 0, color: '#ffd27a', intensity: 5, distance: 10 },
    ],
    spawns: {
      a: [sp(-10, -22, PI), sp(0, -22, PI), sp(10, -22, PI), sp(-18, -18, PI * 0.8), sp(18, -18, PI * 1.2)],
      b: [sp(-10, 22, 0), sp(0, 22, 0), sp(10, 22, 0), sp(-18, 18, 0.3), sp(18, 18, -0.3)],
      ffa: [sp(0, -16, PI, 4), sp(4, 3, 0, -3.1), sp(-16, 0, 0.6, 4), sp(12, -12, PI), sp(-8, 8, 0.2), sp(16, 6, -1)],
    },
    objectives: [
      { id: 'pit', x: 0, y: -3.1, z: 0, radius: 3.4 },
      { id: 'north', x: 0, y: 4, z: -16, radius: 3 },
      { id: 'south', x: 0, y: 4, z: 16, radius: 3 },
      { id: 'west', x: -16, y: 0, z: 0, radius: 3 },
      { id: 'east', x: 16, y: 0, z: 0, radius: 3 },
    ],
    zones: [], pads: [],
  });
}

function calibrationBay() {
  const boxes = [
    floor(-28, 28, -34, 22, 'concrete'), ...walls(-28, 28, -34, 22, 6),
    box(-8, 0, -6, 0.3, 1.2, 16, 'metal'), box(8, 0, -6, 0.3, 1.2, 16, 'metal'),
    box(0, 0, -20, 0.3, 1.4, 0.3, 'trim'), box(0, 0, -10, 0.3, 1.4, 0.3, 'trim'), box(0, 0, 0, 0.3, 1.4, 0.3, 'trim'), box(0, 0, 10, 0.3, 1.4, 0.3, 'trim'),
    slab(0, 0.3, 8, 2.2, 2.2, 'caution', 0.25, { mover: { axis: 'x', amp: 6, speed: 0.45 } }),
    crate(-16, 6, 1.2, 1.1, 6), crate(16, -8, 1.2, 1.4, 4), box(0, 2.2, -28, 8, 0.4, 0.2, 'neon', { solid: false, visual: true }),
    box(-8, 1.5, -6, 0.08, 0.08, 16, 'neon', { solid:false, visual:true }), box(8, 1.5, -6, 0.08, 0.08, 16, 'neon', { solid:false, visual:true }),
    box(0, 0.05, -20, 8, 0.05, 0.05, 'trim', { solid:false, visual:true }),
  ];
  const pads = [
    ['linecut', -18, -28], ['kestrel', -12, -28], ['hammerfall', -6, -28], ['glassline', 0, -28],
    ['longbow', 6, -28], ['furnace', 12, -28], ['helix', 18, -28], ['flick2', -18, -24],
    ['bankshot', -10, -24], ['gravneedle', 0, -24], ['pulse7', 10, -24], ['vectorblade', 18, -24],
  ].map(([weaponId, x, z]) => ({ id: weaponId, x, y: 0, z, weaponId }));
  return pack({
    id: 'calibration_bay', nameKey: 'map.calibration_bay.name', descKey: 'map.calibration_bay.desc', combat: false, practice: true,
    bounds: { minX: -28, maxX: 28, minZ: -34, maxZ: 22, killY: -8 },
    theme: theme({
      fog: 0x0e151e, skyTop: 0x243044, skyBottom: 0x0c0e14, accent: 0x5cffd6, fogDensity: 0.014,
      palette: { concrete: '#343e50', metal: '#8a96a6', neon: '#5cffd6', glass: '#d5e4ee', sand: '#c6a56e', wood: '#8a6244', water: '#1c9aaf', trim: '#5cffd6', grass: '#3f7d4e', caution: '#ffb020', crate: '#9a6a42' },
    }),
    boxes,
    lights: [
      { x: 0, y: 5, z: -8, color: '#e8f4ff', intensity: 14, distance: 28 },
      { x: -12, y: 3, z: 4, color: '#5cffd6', intensity: 6, distance: 12 },
      { x: 12, y: 3, z: 4, color: '#5cffd6', intensity: 6, distance: 12 },
      { x: 0, y: 3, z: -28, color: '#5cffd6', intensity: 5, distance: 10 },
    ],
    spawns: {
      a: [sp(0, -30, PI), sp(-6, -30, PI), sp(6, -30, PI)],
      b: [sp(0, 16, 0)],
      ffa: [sp(0, -30, PI), sp(-8, -16, PI), sp(8, -12, PI)],
    },
    objectives: [{ id: 'pad', x: 0, y: 0, z: -4, radius: 2.5 }],
    zones: [], pads,
  });
}

export const MAPS = [ neonDistrict(), orbitalYard(), floodline(), dustStation(), skybridge(), glassworks(), relaySpire(), cinderMarket(), sublevel9(), harborLattice(), atriumLoop(), calibrationBay() ];
export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
export const COMBAT_MAPS = MAPS.filter((m) => m.combat);
export function getMap(id) { return MAP_BY_ID[id] || MAP_BY_ID.neon_district; }
export function cloneMap(idOrMap) {
  const src = typeof idOrMap === 'string' ? getMap(idOrMap) : idOrMap;
  const map = JSON.parse(JSON.stringify(src));
  for (const b of map.boxes) {
    b.baseMin = { ...b.min }; b.baseMax = { ...b.max };
    if (b.breakable) { b.hp = b.maxHp || b.hp || 80; b.maxHp = b.hp; }
  }
  return map;
}
export function validateMap(map) {
  const errors = [];
  if (!map?.id) errors.push('missing id');
  if (!map.boxes?.length) errors.push('no geometry');
  for (const team of ['a', 'b', 'ffa']) if (!map.spawns?.[team]?.length) errors.push(`no ${team} spawns`);
  if (!map.objectives?.length) errors.push('no objectives');
  const solids = (map.boxes || []).filter((b) => b.solid !== false);
  for (const team of ['a', 'b', 'ffa']) for (const s of map.spawns?.[team] || []) {
    if (![s.x, s.y, s.z].every(Number.isFinite)) errors.push('bad spawn');
    for (const b of solids) {
      if (b.boundary) continue;
      const inside = s.x > b.min.x + 0.2 && s.x < b.max.x - 0.2 && s.z > b.min.z + 0.2 && s.z < b.max.z - 0.2 && s.y + 0.2 < b.max.y && s.y + 1.2 > b.min.y;
      if (inside) errors.push(`spawn inside ${b.id} on ${map.id}`);
    }
  }
  return errors;
}
export function schematicBounds(map) { return map.bounds; }
