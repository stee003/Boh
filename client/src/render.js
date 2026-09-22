import { animatePose, damp } from './animation.js';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries as mergeGeoParts } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { cameraPose } from '@shared/sim/physics.js';
import { getCharacter } from '@shared/characters.js';
import { getWeapon } from '@shared/weapons.js';

const hex = (c) => new THREE.Color(c);

// Procedural canvas textures: radial glow for FX, a studio env-map for metal
// reflections, and a vertical gradient sky for the lobby.
let _glowTex = null;
function glowTexture() {
  if (_glowTex || typeof document === 'undefined') return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.85)');
  grad.addColorStop(0.6, 'rgba(255,180,80,0.25)');
  grad.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
let _envTex = null;
function envTexture(renderer) {
  if (_envTex || typeof document === 'undefined') return _envTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#233a5c'); grad.addColorStop(0.45, '#0d1626'); grad.addColorStop(1, '#04060a');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(140,225,255,0.85)'; g.fillRect(0, 44, 256, 3);
  g.fillStyle = 'rgba(92,255,214,0.6)'; g.fillRect(0, 86, 256, 2);
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(24, 20, 44, 9); g.fillRect(176, 26, 54, 7);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  _envTex = pmrem.fromEquirectangular(tex).texture;
  tex.dispose(); pmrem.dispose();
  return _envTex;
}
const _skyCache = new Map();
function skyTexture(topHex, bottomHex) {
  if (typeof document === 'undefined') return null;
  const key = topHex + '|' + bottomHex;
  if (_skyCache.has(key)) return _skyCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, topHex);
  grad.addColorStop(0.52, bottomHex);
  grad.addColorStop(1, '#04060a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // sparse stars in the upper hemisphere
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 110;
    const a = 0.25 + Math.random() * 0.6;
    g.fillStyle = `rgba(220,235,255,${(a * (1 - y / 120)).toFixed(2)})`;
    g.fillRect(x, y, Math.random() > 0.85 ? 2 : 1, 1);
  }
  // faint horizon glow band
  g.fillStyle = 'rgba(92,255,214,0.06)';
  g.fillRect(0, 128, 128, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _skyCache.set(key, tex);
  return tex;
}
let _menuBg = null;
function menuBgTexture() {
  if (_menuBg || typeof document === 'undefined') return _menuBg;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0d1728'); grad.addColorStop(0.55, '#070b12'); grad.addColorStop(1, '#04060a');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  _menuBg = new THREE.CanvasTexture(c);
  _menuBg.colorSpace = THREE.SRGBColorSpace;
  return _menuBg;
}

export function teamPalette(mode = 'off') {
  const sets = {
    off: { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6', enemy: '#ffb03a' },
    deutan: { a: '#3d8bff', b: '#ffb000', self: '#7af0ff', enemy: '#ffb000' },
    protan: { a: '#4aa3ff', b: '#ffe14a', self: '#9ad7ff', enemy: '#ffe14a' },
    tritan: { a: '#ff5a7a', b: '#3dffe8', self: '#ff8ad4', enemy: '#3dffe8' },
  };
  return sets[mode] || sets.off;
}

function teamHex(player, palette) {
  const pal = palette || {};
  if (player?.team === 'b') return pal.b || '#ff5a3c';
  if (player?.team === 'ffa') return pal.enemy || '#ffb03a';
  return pal.a || '#2ec8ff';
}

function matFor(map, name, visual) {
  const palette = map.theme?.palette || {};
  const base = palette[name] || palette.wall || '#3a4254';
  const emissiveMats = { neon: 0.55, glass: 0.08, caution: 0.12, trim: 0.2, water: 0.15 };
  const m = new THREE.MeshStandardMaterial({
    color: hex(base),
    roughness: name === 'metal' ? 0.35 : name === 'glass' ? 0.08 : 0.78,
    metalness: name === 'metal' || name === 'trim' ? 0.55 : 0.08,
    emissive: hex(name === 'neon' ? (palette.neon || '#5cffd6') : base),
    emissiveIntensity: emissiveMats[name] || 0,
    transparent: name === 'glass' || name === 'water',
    opacity: name === 'glass' ? 0.38 : name === 'water' ? 0.55 : 1,
  });
  if (visual && name === 'neon') m.emissiveIntensity = 0.8;
  return m;
}

export { buildActor, attachWeapon };

export function createView(canvas) {
  // A discrete-GPU hint can stall context creation for minutes inside a preview iframe.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080c');
  scene.fog = new THREE.Fog('#0b1018', 28, 92);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 220);
  const hemi = new THREE.HemisphereLight('#9ecbff', '#1a120c', 0.55);
  const sun = new THREE.DirectionalLight('#fff1d6', 1.15);
  sun.position.set(18, 32, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(hemi, sun);
  const rim = new THREE.DirectionalLight('#2ec8ff', 0.35);
  rim.position.set(-20, 12, -16);
  scene.add(rim);
  const clock = new THREE.Clock();
  const fx = new THREE.Group();
  scene.add(fx);
  scene.environment = envTexture(renderer);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.42, 0.7, 0.85);
  composer.addPass(bloom);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());
  const state = {
    renderer, scene, camera, sun, fx, mapRoot: null, dynamics: new Map(),
    actors: new Map(), shake: 0, fovKick: 0, quality: 'high', palette: teamPalette('off'),
    menuRig: null, impactFlash: 0, useBloom: true, composer, bloom, fxaa,
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    state.fxaa?.material?.uniforms?.resolution?.value.set(1 / (w * pr), 1 / (h * pr));
  }
  window.addEventListener('resize', resize);
  resize();

  function setQuality(q) {
    state.quality = q;
    const low = q === 'low' || q === 'performance';
    renderer.shadowMap.enabled = !low;
    sun.castShadow = !low;
    renderer.setPixelRatio(low ? 1 : Math.min(1.5, window.devicePixelRatio || 1));
    scene.fog.far = low ? 70 : 96;
    state.useBloom = !low;
  }

  function clearMap() {
    if (state.mapRoot) {
      scene.remove(state.mapRoot);
      state.mapRoot.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    state.dynamics.clear();
    state.mapRoot = null;
    clearMarkers();
  }

  function clearMarkers() {
    if (!state.markers) return;
    for (const mesh of state.markers.values()) {
      scene.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    state.markers.clear();
  }

  function syncWorld(extras = {}) {
    if (!state.markers) state.markers = new Map();
    const keep = new Set();
    const place = (id, make, x, y, z, color) => {
      keep.add(id);
      let mesh = state.markers.get(id);
      if (!mesh) {
        mesh = make();
        state.markers.set(id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(x, y, z);
      if (color && mesh.material?.color) mesh.material.color.set(color);
      return mesh;
    };
    const low = state.quality === 'low' || state.quality === 'performance';
    for (const o of extras.objectives || []) {
      if (extras.modeId === 'pulsepoint' && o.active === false) continue;
      const color = o.owner === 'b' ? '#ff5a3c' : o.owner === 'a' ? '#2ec8ff' : '#ffb03a';
      place(`obj:${o.id}`, () => new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.8, (o.radius || 3) - 0.25), o.radius || 3, low ? 12 : 28),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }),
      ), o.x, (o.y || 0) + 0.08, o.z, color).rotation.x = -Math.PI / 2;
    }
    for (const d of extras.deployables || []) {
      if (d.dead) continue;
      const color = d.team === 'b' ? '#ff5a3c' : '#5cffd6';
      if (d.kind === 'dome') {
        place(`dep:${d.id}`, () => new THREE.Mesh(
          new THREE.SphereGeometry(d.radius || 4.2, 16, 10),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
        ), d.x, d.y + 1.2, d.z, color);
      } else if (d.kind === 'aegis' || d.kind === 'fortify') {
        const box = d.box;
        const w = box ? box.max.x - box.min.x : 1.6;
        const h = box ? box.max.y - box.min.y : 1.6;
        const dep = box ? box.max.z - box.min.z : 0.3;
        place(`dep:${d.id}`, () => new THREE.Mesh(
          new THREE.BoxGeometry(w, h, dep),
          new THREE.MeshStandardMaterial({ color: '#8eb4ff', emissive: '#2ec8ff', emissiveIntensity: 0.25, transparent: true, opacity: 0.72 }),
        ), box ? (box.min.x + box.max.x) / 2 : d.x, box ? (box.min.y + box.max.y) / 2 : d.y + 0.9, box ? (box.min.z + box.max.z) / 2 : d.z, null);
      } else if (d.kind === 'shade') {
        place(`dep:${d.id}`, () => new THREE.Mesh(
          new THREE.SphereGeometry(d.radius || 3.4, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#1a1e28', transparent: true, opacity: 0.38 }),
        ), d.x, d.y + 1.1, d.z, null);
      } else if (d.kind === 'drone') {
        place(`dep:${d.id}`, () => new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.1, 0.28),
          new THREE.MeshStandardMaterial({ color: '#d0d6de', emissive: color, emissiveIntensity: 0.6 }),
        ), d.x, d.y, d.z, null);
      } else {
        place(`dep:${d.id}`, () => new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.22, d.kind === 'pylon' ? 1.1 : 0.08, 8),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
        ), d.x, d.y + (d.kind === 'pylon' ? 0.55 : 0.06), d.z, color);
      }
    }
    for (const c of extras.cores || []) {
      place(`core:${c.team}`, () => new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 10, 8),
        new THREE.MeshBasicMaterial({ color: c.team === 'b' ? '#ff5a3c' : '#2ec8ff' }),
      ), c.x, c.y || 0.6, c.z, c.team === 'b' ? '#ff5a3c' : '#2ec8ff');
    }
    if (!low) {
      for (const p of extras.projectiles || []) {
        place(`prj:${p.id}`, () => new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 6, 5),
          new THREE.MeshBasicMaterial({ color: p.color || '#ffe08a' }),
        ), p.x, p.y, p.z, p.color || '#ffe08a');
      }
    }
    for (const [id, mesh] of state.markers) {
      if (!keep.has(id)) {
        scene.remove(mesh);
        mesh.geometry?.dispose();
        mesh.material?.dispose();
        state.markers.delete(id);
      }
    }
  }

  function buildMap(map) {
    clearMap();
    const root = new THREE.Group();
    const buckets = new Map();
    const edgeGeos = [];
    const low = state.quality === 'low' || state.quality === 'performance';
    for (const b of map.boxes) {
      const w = Math.max(0.05, b.max.x - b.min.x);
      const h = Math.max(0.05, b.max.y - b.min.y);
      const d = Math.max(0.05, b.max.z - b.min.z);
      const cx = (b.min.x + b.max.x) / 2;
      const cy = (b.min.y + b.max.y) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      const dynamic = b.breakable || b.toggle || b.mover || b.visual || b.mat === 'glass';
      if (dynamic) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matFor(map, b.mat, b.visual));
        mesh.position.set(cx, cy, cz);
        mesh.castShadow = !b.visual && !low;
        mesh.receiveShadow = true;
        root.add(mesh);
        state.dynamics.set(b.id, mesh);
      } else if (!low || !b.boundary) {
        const geo = new THREE.BoxGeometry(w, h, d);
        geo.translate(cx, cy, cz);
        const key = b.mat || 'wall';
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(geo);
        if (!b.boundary && !low && w * h * d < 4000) {
          const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
          eg.translate(cx, cy, cz);
          edgeGeos.push(eg);
        }
      }
    }
    for (const [name, geos] of buckets) {
      const merged = mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, matFor(map, name));
      mesh.castShadow = !low;
      mesh.receiveShadow = true;
      root.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    if (edgeGeos.length) {
      const merged = mergeGeometries(edgeGeos, false);
      const lines = new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color: 0x8aa0b8, transparent: true, opacity: 0.18 }));
      root.add(lines);
      edgeGeos.forEach((g) => g.dispose());
    }
    const sky = new THREE.Color(map.theme?.skyTop ?? 0x101820);
    const skyBottom = new THREE.Color(map.theme?.skyBottom ?? 0x07080c);
    scene.background = skyTexture('#' + sky.getHexString(), '#' + skyBottom.getHexString()) || sky;
    scene.fog.color = new THREE.Color(map.theme?.fog ?? 0x0b1018);
    const neon = map.theme?.palette?.neon || '#5cffd6';
    rim.color = hex(neon);
    sun.intensity = sky.getHSL({ h: 0, s: 0, l: 0 }).l < 0.22 ? 0.7 : 1.05;
    hemi.intensity = 0.48;
    for (const light of map.lights || []) {
      const pl = new THREE.PointLight(light.color || neon, (light.intensity || 4) * 0.35, light.distance || 14, 2);
      pl.position.set(light.x, light.y, light.z);
      root.add(pl);
    }
    scene.add(root);
    state.mapRoot = root;
  }

  function syncBoxes(map) {
    for (const b of map.boxes) {
      const mesh = state.dynamics.get(b.id);
      if (!mesh) continue;
      mesh.visible = !b.hidden && !b.broken;
      const cx = (b.min.x + b.max.x) / 2;
      const cy = (b.min.y + b.max.y) / 2;
      const cz = (b.min.z + b.max.z) / 2;
      mesh.position.set(cx, cy, cz);
      if (b.broken) mesh.visible = false;
    }
  }

  function ensureActor(player) {
    let view = state.actors.get(player.id);
    if (view && view.charId === player.characterId && view.team === player.team) return view;
    if (view) {
      scene.remove(view.group);
      state.actors.delete(player.id);
    }
    view = buildActor(player, state.palette);
    scene.add(view.group);
    state.actors.set(player.id, view);
    return view;
  }

  function updateActor(player, dt, opts = {}) {
    const view = ensureActor(player);
    const g = view.group;
    if (opts.hide) { g.visible = false; return view; }
    g.visible = player.alive || (view.animation.death || 0) < 1;
    g.position.set(player.x, player.y, player.z);
    if (opts.weaponId && view.weaponId !== opts.weaponId) {
      attachWeapon(view, opts.weaponId);
      view.equip = 1;
    }
    let face = player.yaw || 0;
    const spd = Math.hypot(player.vx || 0, player.vz || 0);
    if (player.alive && !player.aiming && !player.dodging && spd > 1.8 && (player.vaultT || 0) <= 0) {
      face = Math.atan2(player.vx, -(player.vz || 0.0001));
    }
    view.bodyYaw = dampAngle(view.bodyYaw, face, player.aiming ? 18 : 11, dt);
    g.rotation.set(0, Math.PI - view.bodyYaw, 0);
    const twist = Math.max(-1.15, Math.min(1.15, shortest(view.bodyYaw, player.yaw || 0)));
    view.upper.rotation.y = -twist;
    view.phase += dt;
    const pose = animatePose(view.animation, player, dt);
    view.hips.position.y = pose.height;
    view.hips.rotation.set(pose.lean, 0, pose.roll);
    view.head.rotation.x = -(player.pitch || 0) * 0.4;
    view.ads = damp(view.ads || 0, player.aiming ? 1 : 0, 14, dt);
    view.armR.position.set(0.32 - view.ads * 0.08, 0.42 + view.ads * 0.06, 0.08);
    view.legL.rotation.x = pose.legL;
    view.legR.rotation.x = pose.legR;
    view.kneeL.rotation.x = pose.kneeL;
    view.kneeR.rotation.x = pose.kneeR;
    view.armR.rotation.set(pose.armR, 0, -0.08);
    view.armL.rotation.set(pose.armL, 0, -0.32);
    view.elbowR.rotation.x = pose.elbowR;
    view.elbowL.rotation.x = pose.elbowL;
    if (opts.emote) {
      view.armR.rotation.x = -2.6;
      view.armL.rotation.x = -2.6;
    }
    view.equip = damp(view.equip || 0, 0, 12, dt);
    view.kick = damp(view.kick || 0, 0, 22, dt);
    view.flashT = Math.max(0, (view.flashT || 0) - dt);
    view.flash.visible = view.flashT > 0 && !player.isDummy;
    view.flash.rotation.z += dt * 45;
    view.weapon.position.z = view.weaponBaseZ - view.kick * 0.08;
    // Counter-rotate the bent elbow so the barrel follows the actual pitch.
    view.weapon.rotation.set(1.5 - view.kick * 0.12 + pose.gunTilt + view.equip * 0.65, 0, pose.gunRoll);
    if (view.magazine) view.magazine.position.y = view.magazine.userData.baseY - pose.magDrop;
    if (view.drone) {
      view.drone.position.y = view.droneBaseY + Math.sin(view.phase * 1.7) * 0.03;
      view.drone.rotation.y = view.phase * 0.8;
    }
    const accent = teamHex(player, state.palette);
    if (view.visor?.material) {
      view.visor.material.emissive.set(accent);
      view.visor.material.color.set(accent);
    }
    if (view.teamMat) {
      view.teamMat.color.set(accent);
      view.teamMat.emissive.set(accent);
      view.teamMat.emissiveIntensity = player.flashed ? 1.65 : 0.95;
    }
    if (view.selfRing) view.selfRing.visible = player.id === opts.localId && !!player.alive;
    if (view.hitShell) {
      const on = !!player.flashed;
      view.hitShell.visible = on;
      view.hitShell.material.opacity = on ? 0.32 : 0;
    }
    return view;
  }

  // Shot events, not the held-fire flag, drive every automatic-fire impulse.
  function shot(playerId) {
    const actor = state.actors.get(playerId);
    if (!actor) return;
    actor.flashT = 0.065;
    actor.flash.visible = true;
    actor.flash.scale.setScalar(0.85 + Math.random() * 0.5);
    actor.kick = 1;
  }

  function dropMissing(ids) {
    for (const [id, view] of state.actors) {
      if (!ids.has(id)) {
        scene.remove(view.group);
        state.actors.delete(id);
      }
    }
  }

  function tracer(from, to, color = '#ffe7a0') {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    line.userData.life = 0.08;
    state.fx.add(line);
  }

  function impact(point, normal = [0, 1, 0], color = '#ffb03a') {
    if (state.reduceFx) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(point[0], point[1], point[2]);
    m.userData.life = 0.18;
    m.userData.grow = true;
    state.fx.add(m);
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), new THREE.MeshBasicMaterial({ color }));
    spark.position.copy(m.position);
    spark.lookAt(point[0] + normal[0], point[1] + normal[1], point[2] + normal[2]);
    spark.userData.life = 0.12;
    state.fx.add(spark);
  }

  function ring(x, y, z, color, life = 0.45) {
    if (state.reduceFx) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.35, 20),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    mesh.userData.life = life;
    mesh.userData.grow = true;
    state.fx.add(mesh);
  }

  function tickFx(dt) {
    const dead = [];
    for (const o of state.fx.children) {
      o.userData.life -= dt;
      if (o.material) o.material.opacity = Math.max(0, o.userData.life * 4);
      if (o.userData.grow) o.scale.multiplyScalar(1 + dt * 6);
      if (o.userData.life <= 0) dead.push(o);
    }
    for (const o of dead) {
      state.fx.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  function frameCamera(player, solids, dt, extras = {}) {
    const ads = player.aiming ? 1 : 0;
    const pose = cameraPose(player, solids, ads);
    const look = new THREE.Vector3(
      pose.pos.x + pose.dir.x * 12,
      pose.pos.y + pose.dir.y * 12,
      pose.pos.z + pose.dir.z * 12,
    );
    state.shake = Math.max(0, state.shake - dt * 2.4) + (extras.shake || 0);
    state.fovKick = Math.max(0, state.fovKick - dt * 48) + (extras.fov || 0);
    const shake = extras.reduce ? 0 : state.shake;
    camera.position.set(
      pose.pos.x + (Math.random() - 0.5) * shake,
      pose.pos.y + (Math.random() - 0.5) * shake * 0.55,
      pose.pos.z + (Math.random() - 0.5) * shake,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    const zoom = player.aiming ? (extras.zoom || 1) : 1;
    const base = extras.baseFov || 74;
    const sprint = Math.hypot(player.vx || 0, player.vz || 0) > 8.2 && !player.aiming ? 3 : 0;
    camera.fov = damp(camera.fov, (base + (extras.reduce ? 0 : sprint + state.fovKick)) / zoom, 14, dt);
    camera.updateProjectionMatrix();
  }

  function frameFree(pos, yaw, pitch) {
    const cp = Math.cos(pitch);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(pos.x + Math.sin(yaw) * cp, pos.y + Math.sin(pitch), pos.z - Math.cos(yaw) * cp);
  }

  function menuStage() {
    if (state.menuRig) return;
    clearMap();
    const rig = new THREE.Group();
    const accent = '#5cffd6';
    const amber = '#ffb03a';
    // Platform
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.9, 0.34, 48),
      new THREE.MeshStandardMaterial({ color: '#0e141d', roughness: 0.6, metalness: 0.45 }),
    );
    base.position.y = -0.17;
    base.receiveShadow = true;
    rig.add(base);
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 48),
      new THREE.MeshStandardMaterial({ color: '#101823', roughness: 0.22, metalness: 0.85 }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    top.receiveShadow = true;
    rig.add(top);
    // Glowing polar grid
    const gridMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.22 });
    for (const r of [1.1, 2.0, 2.9, 3.8]) {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.01, Math.sin(a) * r));
      }
      rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(Math.cos(a) * 1.0, 0.01, Math.sin(a) * 1.0),
        new THREE.Vector3(Math.cos(a) * 3.95, 0.01, Math.sin(a) * 3.95),
      ];
      rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    // Rotating rings
    const ringOuter = new THREE.Mesh(
      new THREE.TorusGeometry(4.05, 0.035, 8, 72),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    ringOuter.rotation.x = Math.PI / 2;
    ringOuter.position.y = 0.05;
    rig.add(ringOuter);
    const ringInner = new THREE.Mesh(
      new THREE.TorusGeometry(2.75, 0.022, 8, 64),
      new THREE.MeshBasicMaterial({ color: amber }),
    );
    ringInner.rotation.x = Math.PI / 2;
    ringInner.position.y = 0.04;
    rig.add(ringInner);
    state.menuRings = { outer: ringOuter, inner: ringInner };
    // Floating shards
    state.menuShards = [];
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22 + i * 0.05),
        new THREE.MeshStandardMaterial({ color: '#1c2733', emissive: i === 1 ? amber : accent, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 }),
      );
      const a = (i / 3) * Math.PI * 2 + 0.7;
      shard.position.set(Math.cos(a) * 5.1, 0.9 + i * 0.55, Math.sin(a) * 5.1);
      rig.add(shard);
      state.menuShards.push({ mesh: shard, baseY: shard.position.y, a, i });
    }
    // Pillars with accent strips
    for (let i = 0; i < 8; i++) {
      const h = 2.2 + (i % 3) * 0.5;
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, h, 0.16),
        new THREE.MeshStandardMaterial({ color: '#1c2733', metalness: 0.4, roughness: 0.4 }),
      );
      const a = (i / 8) * Math.PI * 2;
      p.position.set(Math.cos(a) * 5.4, h / 2 - 0.35, Math.sin(a) * 5.4);
      rig.add(p);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, h * 0.8, 0.03),
        new THREE.MeshBasicMaterial({ color: i % 2 ? amber : accent }),
      );
      strip.position.set(Math.cos(a) * 5.4, h / 2 - 0.35, Math.sin(a) * 5.4);
      rig.add(strip);
    }
    // Stage lights
    const spot = new THREE.SpotLight('#dff4ff', 260, 30, 0.5, 0.55, 1.6);
    spot.position.set(0, 9, 0);
    spot.target.position.set(0, 0.6, 0);
    rig.add(spot, spot.target);
    const left = new THREE.PointLight(accent, 26, 16, 2);
    left.position.set(-5, 2.4, -2);
    const right = new THREE.PointLight(amber, 18, 14, 2);
    right.position.set(5, 1.6, 2.5);
    rig.add(left, right);
    // Volumetric-ish light cone from the top spot
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 8.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.set(0, 4.6, 0);
    rig.add(cone);
    // Drifting ember particles for atmosphere
    const pn = 240;
    const ppos = new Float32Array(pn * 3);
    for (let i = 0; i < pn; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 6;
      ppos[i * 3] = Math.cos(a) * r;
      ppos[i * 3 + 1] = 0.2 + Math.random() * 5;
      ppos[i * 3 + 2] = Math.sin(a) * r;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    const pts = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: accent, size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    rig.add(pts);
    state.menuParticles = pts;
    scene.add(rig);
    scene.background = menuBgTexture() || hex('#070b12');
    scene.fog.far = 42;
    state.menuRig = rig;
    state.menuAngle = 0.6;
  }

  function setShowcase(characterId, teamColor = '#2ec8ff') {
    menuStage();
    if (state.showcase) {
      scene.remove(state.showcase.group);
      state.showcase = null;
    }
    const accent = getCharacter(characterId).visual?.accent || teamColor;
    const fake = { id: 'showcase', characterId, team: 'a', alive: true, yaw: 0, pitch: 0, vx: 0, vz: 0, onGround: true };
    state.palette = { ...state.palette, a: teamColor, self: teamColor };
    const actor = buildActor(fake, state.palette);
    actor.visor.material.color = hex(teamColor);
    actor.visor.material.emissive = hex(teamColor);
    actor.group.position.set(0, 0.02, 0);
    // Pedestal glow ring under the showcase character
    const pedestal = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.8, 40),
      new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }),
    );
    pedestal.rotation.x = -Math.PI / 2;
    pedestal.position.y = -0.01;
    actor.group.add(pedestal);
    scene.add(actor.group);
    state.showcase = actor;
    state.showcaseAccent = accent;
  }

  function tickMenu(dt) {
    if (!state.menuRig) return;
    state.menuAngle += dt * 0.22;
    const a = state.menuAngle;
    camera.position.set(Math.sin(a) * 5.4, 1.7 + Math.sin(a * 0.5) * 0.18, Math.cos(a) * 5.4);
    camera.lookAt(0, 1.15, 0);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    if (state.menuParticles) state.menuParticles.rotation.y = a * 0.12;
    const rings = state.menuRings;
    if (rings) {
      rings.outer.rotation.z = a * 0.5;
      rings.inner.rotation.z = -a * 0.8;
    }
    for (const s of state.menuShards || []) {
      s.mesh.position.y = s.baseY + Math.sin(a * 0.9 + s.i * 2.1) * 0.22;
      s.mesh.rotation.y = a * (0.6 + s.i * 0.2);
      s.mesh.rotation.x = a * 0.4;
    }
    if (state.showcase) {
      state.showcase.group.rotation.y = a * 0.35;
      state.showcase.phase = (state.showcase.phase || 0) + dt;
      const s = Math.sin(state.showcase.phase * 2) * 0.25;
      state.showcase.armR.rotation.x = -1.05 + s * 0.08;
      state.showcase.elbowR.rotation.x = -0.45;
      state.showcase.weapon.rotation.x = 1.5;
      state.showcase.armL.rotation.x = -1.15 + s * 0.06;
      state.showcase.elbowL.rotation.x = -0.6;
      state.showcase.hips.position.y = 0.9 + Math.sin(state.showcase.phase * 1.5) * 0.02;
    }
  }

  function render() {
    if (state.useBloom && state.composer) state.composer.render();
    else renderer.render(scene, camera);
  }

  function minimap(canvas2d, map, players, local) {
    if (!canvas2d || !map) return;
    const ctx = canvas2d.getContext('2d');
    const w = canvas2d.width;
    const h = canvas2d.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,12,18,0.2)';
    ctx.fillRect(0, 0, w, h);
    const b = map.bounds;
    const sx = w / (b.maxX - b.minX);
    const sz = h / (b.maxZ - b.minZ);
    const X = (x) => (x - b.minX) * sx;
    const Z = (z) => (z - b.minZ) * sz;
    ctx.fillStyle = 'rgba(180,200,220,0.18)';
    for (const box of map.boxes) {
      if (box.boundary || box.visual || box.max.y < 0.4) continue;
      if (box.min.y > 3) continue;
      ctx.fillRect(X(box.min.x), Z(box.min.z), (box.max.x - box.min.x) * sx, (box.max.z - box.min.z) * sz);
    }
    for (const p of players) {
      if (!p.alive) continue;
      ctx.fillStyle = p.id === local?.id ? (state.palette.self || '#5cffd6') : teamHex(p, state.palette);
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), p.id === local?.id ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function project(point) {
    const v = new THREE.Vector3(point.x, point.y, point.z);
    v.project(camera);
    return { x: v.x, y: v.y, z: v.z };
  }

  return {
    state, resize, setQuality, buildMap, clearMap, syncBoxes, updateActor, dropMissing,
    shot, tracer, impact, ring, tickFx, frameCamera, frameFree, menuStage, setShowcase, tickMenu, render, minimap, syncWorld,
    camera, scene, project,
  };
}

function mergeGeometries(geos, withNormal = true) {
  let verts = 0;
  let idx = 0;
  for (const g of geos) {
    verts += g.attributes.position.count;
    idx += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = withNormal ? new Float32Array(verts * 3) : null;
  const indices = new Uint32Array(idx);
  let vo = 0;
  let io = 0;
  let base = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    if (nor && g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) indices[io++] = src[i] + base;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) indices[io++] = base + i;
    }
    base += g.attributes.position.count;
    vo += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

// ── Organic geometry toolkit ────────────────────────────────
// Rounded, capsule/lathe-based parts merged per-material per limb segment so a
// richer silhouette costs only a few extra draw calls.

function shade(color, lit = 0.32) {
  const c = new THREE.Color(color || '#5cffd6');
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 0.65), Math.max(0.08, Math.min(0.5, lit)));
  return c;
}

const CAP = (r, l, cs = 3, rs = 8) => new THREE.CapsuleGeometry(r, l, cs, rs);
const SPH = (r, ws = 12, hs = 9) => new THREE.SphereGeometry(r, ws, hs);
const CYL = (rt, rb, h, rs = 10) => new THREE.CylinderGeometry(rt, rb, h, rs);
const RBOX = (w, h, d, r = 0.02, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);

function xform(geo, o = {}) {
  if (o.rx) geo.rotateX(o.rx);
  if (o.ry) geo.rotateY(o.ry);
  if (o.rz) geo.rotateZ(o.rz);
  if (o.sx || o.sy || o.sz) geo.scale(o.sx || 1, o.sy || 1, o.sz || 1);
  geo.translate(o.x || 0, o.y || 0, o.z || 0);
  return geo;
}
// Merge-safe: RoundedBoxGeometry is non-indexed, primitives are indexed.
const norm = (g) => (g.index ? g.toNonIndexed() : g);
// Push a primitive into a per-material bucket for later merging.
// NOTE: bucket by the material's uuid — a material used as a plain-object key
// stringifies to "[object Object]", which silently merges every limb into one
// geometry and hands the renderer a string "material" (the body then throws
// mid-frame and only the weapon, drawn earlier in Z order, stays visible).
function put(buckets, mat, geo, o) {
  const key = mat.uuid;
  if (!buckets[key]) buckets[key] = { mat, geos: [] };
  buckets[key].geos.push(norm(xform(geo, o)));
}
function bakedMeshes(buckets) {
  const out = [];
  for (const entry of Object.values(buckets)) {
    if (!entry.geos.length) continue;
    const geos = entry.geos;
    const merged = geos.length === 1 ? geos[0] : mergeGeoParts(geos, false);
    const m = new THREE.Mesh(merged, entry.mat);
    m.castShadow = true;
    out.push(m);
  }
  return out;
}

/**
 * Builds an operator silhouette from its `visual` spec using rounded, organic
 * primitives (capsules, spheres, lathes) instead of boxes.
 * Model front is local +Z (visor/weapon side).
 */
function buildActor(player, palette) {
  const ch = getCharacter(player.characterId);
  const v = ch.visual || {};
  const accent = v.accent || '#5cffd6';
  const bulk = v.bulk || 1;
  const shoulderL = v.shoulders?.[0] ?? 1;
  const shoulderR = v.shoulders?.[1] ?? 1;

  const teamColor = teamHex(player, palette);
  const clothCol = shade(accent, 0.3);
  clothCol.lerp(hex(teamColor), 0.18);
  const cloth = new THREE.MeshStandardMaterial({ color: clothCol, roughness: 0.55, metalness: 0.16 });
  const clothDark = new THREE.MeshStandardMaterial({ color: shade(accent, 0.2), roughness: 0.66, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.42, metalness: 0.52 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 });
  const visorMat = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3 });
  const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.95, roughness: 0.32, metalness: 0.18 });

  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;

  // ── Torso (rounded ribcage + tapered abdomen + collar) ──
  const torsoB = {};
  put(torsoB, cloth, RBOX(0.3 * bulk, 0.18, 0.22, 0.05), { y: 0.02 });            // pelvis
  put(torsoB, cloth, xform(CAP(0.16 * bulk, 0.26), { sx: 1.42, sy: 1, sz: 0.86, y: 0.3 })); // ribcage
  put(torsoB, clothDark, CYL(0.155 * bulk, 0.135 * bulk, 0.2, 14), { y: 0.1 });    // abdomen taper
  put(torsoB, clothDark, CYL(0.095, 0.13, 0.07, 12), { y: 0.52 });                // collar
  put(torsoB, dark, RBOX(0.34 * bulk, 0.3, 0.07, 0.03), { y: 0.32, z: 0.12 });    // chest plate
  put(torsoB, dark, xform(SPH(0.085, 12, 8), { sx: 1.4, sy: 0.7, sz: 0.6, y: 0.05, z: 0.11 })); // groin guard
  put(torsoB, accentMat, RBOX(0.09, 0.11, 0.03, 0.012), { y: 0.33, z: 0.16 });    // chest core
  if (v.seam) {
    put(torsoB, accentMat, RBOX(0.02, 0.4, 0.02, 0.008), { x: 0.23 * bulk, y: 0.28 });
    put(torsoB, accentMat, RBOX(0.02, 0.4, 0.02, 0.008), { x: -0.23 * bulk, y: 0.28 });
  }
  if (v.coat) {
    const coat = new THREE.CylinderGeometry(0.3 * bulk, 0.36 * bulk, 0.36, 16, 1, true);
    put(torsoB, clothDark, coat, { y: -0.02 });
  }
  const upper = new THREE.Group();
  for (const m of bakedMeshes(torsoB)) upper.add(m);

  // ── Head ──
  const head = new THREE.Group();
  head.position.y = 0.64;
  const headB = {};
  let visor;
  if (v.head === 'hood') {
    put(headB, clothDark, xform(SPH(0.155, 18, 14), { sx: 1.0, sy: 1.18, sz: 1.05, y: 0.02 }));
    put(headB, dark, xform(SPH(0.11, 14, 10), { sx: 1.0, sy: 0.85, sz: 0.9, y: -0.03, z: 0.05 }));
    visor = new THREE.Mesh(xform(SPH(1, 18, 8), { sx: 0.105, sy: 0.03, sz: 0.075, y: 0.01, z: 0.13 }), visorMat);
  } else if (v.head === 'wide') {
    put(headB, dark, xform(SPH(0.16, 18, 14), { sx: 1.12, sy: 0.95, sz: 1.02 }));
    put(headB, dark, xform(SPH(0.12, 14, 10), { sx: 1.1, sy: 0.75, sz: 0.95, y: -0.05, z: 0.03 }));
    put(headB, accentMat, RBOX(0.06, 0.045, 0.15, 0.015), { y: 0.15, z: 0.03 });
    visor = new THREE.Mesh(xform(SPH(1, 20, 8), { sx: 0.145, sy: 0.035, sz: 0.07, y: 0.0, z: 0.112 }), visorMat);
  } else {
    put(headB, dark, xform(SPH(0.135, 18, 14), { sx: 1.02, sy: 1.12, sz: 1.05 }));
    put(headB, dark, xform(SPH(0.1, 14, 10), { sx: 1.0, sy: 0.8, sz: 0.9, y: -0.05, z: 0.04 }));
    put(headB, accentMat, RBOX(0.05, 0.04, 0.13, 0.014), { y: 0.15, z: 0.03 });
    visor = new THREE.Mesh(xform(SPH(1, 20, 8), { sx: 0.11, sy: 0.032, sz: 0.065, y: 0.008, z: 0.102 }), visorMat);
  }
  head.add(...bakedMeshes(headB), visor);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), teamMat);
  marker.position.set(0, 0.26, 0);
  head.add(marker);
  head.userData.visor = visor;
  if (v.antenna) {
    const ant = new THREE.Group();
    const rod = new THREE.Mesh(CYL(0.012, 0.008, 0.18, 8), dark);
    const tip = new THREE.Mesh(SPH(0.022, 8, 6), accentMat);
    tip.position.y = 0.09;
    rod.add(tip);
    ant.add(rod);
    ant.position.set(0.09, 0.16, -0.05);
    ant.rotation.z = -0.18;
    head.add(ant);
  }

  // ── Arms ─
  const buildArm = (padScale) => {
    const arm = new THREE.Group();
    const b = {};
    put(b, clothDark, xform(SPH(0.1 * Math.max(0.8, padScale), 12, 9), { sx: 1.05, sy: 0.8, sz: 1.0, y: -0.015 })); // pauldron/deltoid
    put(b, dark, CAP(0.052, 0.13), { y: -0.12 });                       // upper arm
    const elbow = new THREE.Group();
    elbow.position.y = -0.23;
    const eb = {};
    put(eb, dark, SPH(0.052, 10, 8), {});                               // elbow joint
    put(eb, clothDark, CAP(0.048, 0.14), { y: -0.1 });                  // forearm
    put(eb, dark, xform(SPH(0.058, 12, 8), { sx: 1.0, sy: 1.1, sz: 1.15, y: -0.21, z: 0.01 })); // glove
    elbow.add(...bakedMeshes(eb));
    arm.add(...bakedMeshes(b), elbow);
    return { arm, elbow };
  };
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.32, 0.42, 0);
  armR.position.set(0.32, 0.42, 0.08);
  const madeL = buildArm(shoulderL);
  const madeR = buildArm(shoulderR);
  armL.add(...madeL.arm.children);
  armR.add(...madeR.arm.children);
  const elbowL = madeL.elbow;
  const elbowR = madeR.elbow;
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.24, 0.06);
  elbowR.add(weapon);

  // ── Legs ──
  const makeLeg = (leg) => {
    const b = {};
    put(b, cloth, CAP(0.078 * (0.9 + bulk * 0.1), 0.24), { y: -0.2 });   // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    const kb = {};
    put(kb, dark, SPH(0.062, 10, 8), { y: 0 });                          // knee joint
    put(kb, clothDark, CAP(0.058, 0.3), { y: -0.19 });                  // shin
    put(kb, dark, RBOX(0.12, 0.1, 0.24, 0.03), { y: -0.44, z: 0.05 });   // boot
    put(kb, dark, xform(SPH(0.06, 10, 8), { sx: 1.0, sy: 0.7, sz: 1.2, y: -0.46, z: 0.15 })); // toe
    knee.add(...bakedMeshes(kb));
    leg.add(...bakedMeshes(b), knee);
    return knee;
  };
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.12, 0, 0);
  legR.position.set(0.12, 0, 0);
  const kneeL = makeLeg(legL);
  const kneeR = makeLeg(legR);
  if (v.longLegs) { legL.scale.y = 1.1; legR.scale.y = 1.1; }

  // ── Back gear ──
  let drone = null;
  let droneBaseY = 0;
  const back = v.back || 'none';
  const backB = {};
  if (back === 'sash') {
    put(backB, accentMat, RBOX(0.34, 0.055, 0.025, 0.01), { y: 0.3, z: -0.15, rz: 0.5 });
  } else if (back === 'plate') {
    put(backB, dark, RBOX(0.36, 0.3, 0.07, 0.03), { y: 0.28, z: -0.155 });
    put(backB, accentMat, RBOX(0.3, 0.03, 0.02, 0.008), { y: 0.36, z: -0.19 });
  } else if (back === 'pack') {
    put(backB, dark, RBOX(0.3, 0.26, 0.14, 0.04), { y: 0.27, z: -0.18 });
    put(backB, accentMat, CYL(0.035, 0.035, 0.16, 10), { x: -0.08, y: 0.27, z: -0.26, rx: Math.PI / 2 * 0 });
    put(backB, accentMat, CYL(0.035, 0.035, 0.16, 10), { x: 0.08, y: 0.27, z: -0.26 });
  } else if (back === 'drone') {
    put(backB, dark, RBOX(0.26, 0.2, 0.11, 0.04), { y: 0.24, z: -0.17 });
    drone = new THREE.Mesh(
      RBOX(0.15, 0.04, 0.15, 0.02),
      new THREE.MeshStandardMaterial({ color: '#d0d6de', emissive: accent, emissiveIntensity: 0.8 }),
    );
    drone.position.set(0, 0.52, -0.17);
    droneBaseY = 0.52;
  } else {
    put(backB, dark, RBOX(0.26, 0.2, 0.05, 0.02), { y: 0.28, z: -0.155 });
  }
  for (const m of bakedMeshes(backB)) upper.add(m);
  if (drone) upper.add(drone);

  const padL = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.14, 2, 6), teamMat);
  padL.rotation.z = Math.PI / 2;
  padL.position.set(-0.34, 0.5, 0.02);
  const padR = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.14, 2, 6), teamMat);
  padR.rotation.z = Math.PI / 2;
  padR.position.set(0.34, 0.5, 0.06);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26 * bulk, 0.045, 0.018), teamMat);
  stripe.position.set(0, 0.22, 0.175);
  const backMark = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.018), teamMat);
  backMark.position.set(0, 0.34, -0.2);
  backMark.rotation.z = Math.PI / 4;
  upper.add(head, armL, armR, padL, padR, stripe, backMark);
  hips.add(upper, legL, legR);
  group.add(hips);
  const selfRing = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.52, 28),
    new THREE.MeshBasicMaterial({ color: palette?.self || '#5cffd6', side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  selfRing.rotation.x = -Math.PI / 2;
  selfRing.position.y = 0.04;
  selfRing.visible = false;
  const hitShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  hitShell.position.y = 0.95;
  hitShell.scale.set(0.72, 1.2, 0.72);
  hitShell.visible = false;
  group.add(selfRing, hitShell);

  const flash = new THREE.Group();
  const flashMat = new THREE.MeshBasicMaterial({
    color: '#ffe9b0', transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, map: glowTexture() || undefined,
  });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), flashMat);
  const f2 = f1.clone();
  f2.rotation.y = Math.PI / 2;
  const f3 = f1.clone();
  f3.rotation.z = Math.PI / 4;
  flash.add(f1, f2, f3);
  flash.visible = false;
  flash.position.set(0, 0, 0.6);
  weapon.add(flash);

  const view = {
    group, hips, upper, torso: upper, head, visor, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, weapon, flash,
    animation: {},
    charId: player.characterId, team: player.team,
    bodyYaw: 0, phase: Math.random() * 6,
    weaponId: null, weaponBaseZ: 0.12, flashT: 0, kick: 0, prevFiring: false,
    ads: 0, wasFlashed: false, drone, droneBaseY,
  };
  hips.traverse((o) => { if (o.isMesh && o.material?.emissive) o.userData.baseIntensity = o.material.emissiveIntensity; });
  attachWeapon(view, 'linecut');
  return view;
}

function attachWeapon(view, weaponId) {
  const def = getWeapon(weaponId);
  view.weaponId = weaponId;
  view.magazine = null;
  for (const c of [...view.weapon.children]) {
    if (c === view.flash) continue;
    view.weapon.remove(c);
    c.geometry?.dispose();
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose()); else c.material?.dispose();
  }
  const w = view.weapon;
  const bodyColor = def.visual?.color || '#9eb0c2';
  const accentColor = def.visual?.accent || '#5cffd6';
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.6, roughness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1a1f28', metalness: 0.52, roughness: 0.4 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor, emissive: accentColor, emissiveIntensity: def.visual?.glow ? 1.2 : 0.55, metalness: 0.2, roughness: 0.3,
  });
  const body = []; const dark = []; const glow = [];

  if (def.visual?.blade) {
    body.push(xform(RBOX(0.05, 0.028, 0.5, 0.008), { z: 0.28 }));
    body.push(xform(RBOX(0.05, 0.02, 0.4, 0.006), { z: 0.26, y: -0.018 }));
    glow.push(xform(RBOX(0.052, 0.01, 0.46, 0.004), { z: 0.28, y: 0.02 }));
    dark.push(xform(RBOX(0.07, 0.1, 0.03, 0.01), { z: 0.03 }));
    dark.push(xform(CYL(0.02, 0.026, 0.14, 10), { z: -0.06, rx: Math.PI / 2 }));
    w.add(...mesh(body, bodyMat), ...mesh(dark, darkMat), ...mesh(glow, glowMat));
    view.weaponBaseZ = 0.06;
    if (view.flash) view.flash.position.z = 0.12 + 0.55;
    return;
  }
  if (def.visual?.fist) {
    body.push(xform(SPH(0.06, 12, 10), { sx: 1.0, sy: 0.9, sz: 1.1 }));
    for (let i = -1; i <= 1; i++) body.push(xform(SPH(0.02, 8, 6), { x: i * 0.03, y: 0.05, z: 0.03 }));
    glow.push(xform(RBOX(0.05, 0.02, 0.05, 0.006), { z: 0.07 }));
    w.add(...mesh(body, bodyMat), ...mesh(glow, glowMat));
    view.weaponBaseZ = 0.06;
    return;
  }

  const barrelLen = 0.28 + (def.visual?.barrel || 0.4) * 0.7;
  // receiver + rail + handguard + barrel + muzzle, all with detail
  body.push(xform(RBOX(0.062, 0.085, 0.3, 0.014), { z: 0.02 }));                    // receiver
  dark.push(xform(RBOX(0.044, 0.02, 0.28, 0.008), { y: 0.055, z: 0.0 }));           // top rail
  for (let i = 0; i < 6; i++) dark.push(xform(RBOX(0.046, 0.012, 0.012, 0.004), { y: 0.062, z: -0.1 + i * 0.04 })); // rail teeth
  body.push(xform(RBOX(0.05, 0.062, 0.24, 0.016), { z: 0.24 }));                    // handguard
  for (let i = 0; i < 3; i++) {                                                      // M-LOK vents
    dark.push(xform(RBOX(0.054, 0.014, 0.05, 0.005), { z: 0.17 + i * 0.06 }));
    dark.push(xform(RBOX(0.014, 0.05, 0.05, 0.005), { x: 0.026, z: 0.17 + i * 0.06 }));
    dark.push(xform(RBOX(0.014, 0.05, 0.05, 0.005), { x: -0.026, z: 0.17 + i * 0.06 }));
  }
  dark.push(xform(CYL(0.021, 0.024, barrelLen, 12), { z: 0.36 + barrelLen * 0.5, rx: Math.PI / 2 })); // barrel
  body.push(xform(CYL(0.028, 0.03, 0.06, 12), { z: 0.36 + barrelLen + 0.02, rx: Math.PI / 2 }));     // muzzle
  dark.push(xform(RBOX(0.05, 0.012, 0.03, 0.004), { z: 0.36 + barrelLen + 0.02, y: 0.02 }));         // muzzle port
  dark.push(xform(RBOX(0.02, 0.03, 0.02, 0.006), { y: 0.05, z: 0.34 }));            // front sight
  dark.push(xform(RBOX(0.03, 0.024, 0.05, 0.008), { y: 0.05, z: -0.08 }));          // rear sight / handle
  dark.push(xform(RBOX(0.012, 0.03, 0.05, 0.004), { x: 0.032, y: 0.01, z: 0.02 })); // ejection port
  glow.push(xform(RBOX(0.014, 0.014, 0.24, 0.006), { x: 0.034, z: 0.0 }));          // accent stripe
  if (def.visual?.glow) glow.push(xform(RBOX(0.03, 0.03, 0.1, 0.01), { y: -0.02, z: 0.14 })); // power cell

  // grip
  dark.push(xform(RBOX(0.046, 0.13, 0.056, 0.014), { y: -0.1, z: 0.0, rx: 0.25 }));
  // magazine (separate so it can drop)
  const magType = def.visual?.mag;
  let magazine = null;
  if (magType === 'drum') {
    magazine = new THREE.Mesh(CYL(0.07, 0.07, 0.1, 14), bodyMat);
    magazine.rotation.x = Math.PI / 2;
    magazine.position.set(0, -0.09, 0.1);
    const rib = new THREE.Mesh(CYL(0.03, 0.03, 0.105, 10), darkMat);
    rib.rotation.x = Math.PI / 2;
    magazine.add(rib);
  } else if (magType === 'cell') {
    magazine = new THREE.Mesh(RBOX(0.05, 0.09, 0.12, 0.012), glowMat);
    magazine.position.set(0, -0.1, 0.08);
  } else if (magType === 'none') {
    magazine = null;
  } else {
    const mb = [];
    mb.push(xform(RBOX(0.05, 0.16, 0.07, 0.012), {}));
    for (let i = 0; i < 3; i++) mb.push(xform(RBOX(0.052, 0.012, 0.06, 0.004), { y: -0.04 - i * 0.04 }));
    magazine = new THREE.Mesh(mergeGeoParts(mb, false), darkMat);
    magazine.position.set(0, -0.12, 0.07);
    magazine.rotation.x = 0.12;
  }
  if (magazine) { w.add(magazine); view.magazine = magazine; magazine.userData.baseY = magazine.position.y; }

  // stock
  if (def.visual?.stock) {
    dark.push(xform(CYL(0.02, 0.02, 0.12, 10), { z: -0.18, rx: Math.PI / 2 }));    // buffer tube
    body.push(xform(RBOX(0.05, 0.09, 0.14, 0.02), { y: -0.02, z: -0.24 }));        // stock body
    dark.push(xform(RBOX(0.054, 0.1, 0.03, 0.012), { y: -0.02, z: -0.31 }));       // buttpad
  }
  // optic
  const optic = def.visual?.optic;
  if (optic === 'holo') {
    dark.push(xform(RBOX(0.05, 0.05, 0.09, 0.01), { y: 0.085, z: 0.02 }));
    glow.push(xform(RBOX(0.02, 0.02, 0.04, 0.006), { y: 0.09, z: 0.02 }));
  } else if (optic === 'scope') {
    dark.push(xform(CYL(0.035, 0.035, 0.16, 12), { y: 0.09, z: -0.02, rx: Math.PI / 2 }));
    dark.push(xform(CYL(0.02, 0.02, 0.03, 8), { y: 0.12, z: -0.02 }));             // turret
    glow.push(xform(CYL(0.02, 0.02, 0.012, 8), { y: 0.09, z: 0.06, rx: Math.PI / 2 }));
  } else {
    dark.push(xform(RBOX(0.012, 0.03, 0.012, 0.004), { x: 0.02, y: 0.065, z: 0.1 }));
    dark.push(xform(RBOX(0.012, 0.03, 0.012, 0.004), { x: -0.02, y: 0.065, z: 0.1 }));
  }

  w.add(...mesh(body, bodyMat), ...mesh(dark, darkMat), ...mesh(glow, glowMat));
  view.weaponBaseZ = 0.06;
  if (view.flash) view.flash.position.z = 0.36 + barrelLen + 0.08;
}

function mesh(geos, mat) {
  if (!geos.length) return [];
  const g = geos.map(norm);
  return [new THREE.Mesh(g.length === 1 ? g[0] : mergeGeoParts(g, false), mat)];
}

function dampAngle(current, target, speed, dt) {
  const d = shortest(current, target);
  return current + d * (1 - Math.exp(-speed * dt));
}

function shortest(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
