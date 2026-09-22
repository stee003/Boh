import { animatePose, damp } from './animation.js';
import * as THREE from 'three';
import { cameraPose } from '@shared/sim/physics.js';
import { getCharacter } from '@shared/characters.js';
import { getWeapon } from '@shared/weapons.js';

const hex = (c) => new THREE.Color(c);

export function teamPalette(mode = 'off') {
  const sets = {
    off: { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6', enemy: '#ff5a3c' },
    deutan: { a: '#3d8bff', b: '#ffb000', self: '#7af0ff', enemy: '#ffb000' },
    protan: { a: '#4aa3ff', b: '#ffe14a', self: '#9ad7ff', enemy: '#ffe14a' },
    tritan: { a: '#ff5a7a', b: '#3dffe8', self: '#ff8ad4', enemy: '#3dffe8' },
  };
  return sets[mode] || sets.off;
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
  renderer.shadowMap.enabled = false;
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
  sun.castShadow = false;
  sun.shadow.mapSize.set(1024, 1024);
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
  const state = {
    renderer, scene, camera, sun, fx, mapRoot: null, dynamics: new Map(),
    actors: new Map(), shake: 0, fovKick: 0, quality: 'high', palette: teamPalette('off'),
    menuRig: null, impactFlash: 0,
  };

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
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
    scene.background = sky;
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
    view.bodyYaw = dampAngle(view.bodyYaw, player.yaw || 0, 16, dt);
    g.rotation.set(0, Math.PI - view.bodyYaw, 0);
    view.upper.rotation.y = -shortest(view.bodyYaw, player.yaw || 0);
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
    const accent = player.id === opts.localId ? state.palette.self : (player.team === 'b' ? state.palette.b : state.palette.a);
    view.visor.material.emissive = hex(accent);
    view.visor.material.color = hex(accent);
    // Damage flash: briefly turn armor emissive red while the sim says "flashed".
    const flashing = !!player.flashed;
    if (flashing !== view.wasFlashed) {
      view.group.traverse((o) => {
        if (!o.isMesh || !o.material?.emissive) return;
        if (o === view.visor) return;
        if (flashing) {
          o.userData.baseEmissive = o.material.emissive.getHex();
          o.userData.baseIntensity = o.material.emissiveIntensity;
          o.material.emissive.set('#ff4a3a');
          o.material.emissiveIntensity = 0.55;
        } else if (o.userData.baseEmissive != null) {
          o.material.emissive.setHex(o.userData.baseEmissive);
          if (o.userData.baseIntensity != null) o.material.emissiveIntensity = o.userData.baseIntensity;
          delete o.userData.baseEmissive;
          delete o.userData.baseIntensity;
        }
      });
      view.wasFlashed = flashing;
    }
    return view;
  }

  // Shot events, not the held-fire flag, drive every automatic-fire impulse.
  function shot(playerId) {
    const actor = state.actors.get(playerId);
    if (!actor) return;
    actor.flashT = 0.065;
    actor.flash.visible = true;
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
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color }));
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
      new THREE.MeshStandardMaterial({ color: '#131b26', roughness: 0.45, metalness: 0.55 }),
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
    scene.add(rig);
    scene.background = hex('#070b12');
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
    renderer.render(scene, camera);
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
      ctx.fillStyle = p.id === local?.id ? '#5cffd6' : (p.team === 'b' ? '#ff5a3c' : '#2ec8ff');
      ctx.beginPath();
      ctx.arc(X(p.x), Z(p.z), p.id === local?.id ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return {
    state, resize, setQuality, buildMap, clearMap, syncBoxes, updateActor, dropMissing,
    shot, tracer, impact, ring, tickFx, frameCamera, frameFree, menuStage, setShowcase, tickMenu, render, minimap, syncWorld,
    camera, scene,
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

function shade(color, lit = 0.32) {
  const c = new THREE.Color(color || '#5cffd6');
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 0.65), Math.max(0.08, Math.min(0.5, lit)));
  return c;
}

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

/**
 * Builds an operator silhouette from its `visual` spec:
 * shoulders [L,R], head helm|wide|hood, back sash|plate|pack|drone|none,
 * antenna, coat, longLegs, seam, accent, bulk.
 * Model front is local +Z (visor/weapon side).
 */
function buildActor(player, palette) {
  const ch = getCharacter(player.characterId);
  const v = ch.visual || {};
  const accent = v.accent || '#5cffd6';
  const bulk = v.bulk || 1;
  const shoulderL = v.shoulders?.[0] ?? 1;
  const shoulderR = v.shoulders?.[1] ?? 1;

  const cloth = new THREE.MeshStandardMaterial({ color: shade(accent, 0.3), roughness: 0.6, metalness: 0.14 });
  const clothDark = new THREE.MeshStandardMaterial({ color: shade(accent, 0.2), roughness: 0.68, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.45, metalness: 0.5 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.2 });
  const visorMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3 });
  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;

  const pelvis = box(0.3 * bulk, 0.18, 0.2, dark);
  pelvis.position.y = 0.02;

  const torso = box(0.46 * bulk, 0.48, 0.26, cloth);
  torso.position.y = 0.28;
  torso.castShadow = true;
  const chest = box(0.34 * bulk, 0.32, 0.05, dark);
  chest.position.set(0, 0.32, 0.135);
  const core = box(0.09, 0.11, 0.02, accentMat);
  core.position.set(0, 0.33, 0.165);

  const parts = [pelvis, torso, chest, core];

  if (v.seam) {
    const seamL = box(0.02, 0.42, 0.02, accentMat);
    seamL.position.set(0.235 * bulk, 0.28, 0);
    const seamR = box(0.02, 0.42, 0.02, accentMat);
    seamR.position.set(-0.235 * bulk, 0.28, 0);
    parts.push(seamL, seamR);
  }
  if (v.coat) {
    const coat = box(0.48 * bulk, 0.34, 0.28, clothDark);
    coat.position.y = 0.0;
    parts.push(coat);
  }

  // Head variants
  const head = new THREE.Group();
  head.position.y = 0.64;
  if (v.head === 'hood') {
    const hood = box(0.3, 0.3, 0.3, clothDark);
    const face = box(0.22, 0.17, 0.05, dark);
    face.position.set(0, -0.02, 0.13);
    const visor = box(0.17, 0.035, 0.02, visorMat);
    visor.position.set(0, 0.02, 0.16);
    head.add(hood, face, visor);
    head.userData.visor = visor;
  } else if (v.head === 'wide') {
    const helm = box(0.33, 0.24, 0.29, dark);
    const visor = box(0.27, 0.075, 0.03, visorMat);
    visor.position.set(0, 0.0, 0.14);
    const crest = box(0.06, 0.05, 0.14, accentMat);
    crest.position.set(0, 0.145, 0.05);
    head.add(helm, visor, crest);
    head.userData.visor = visor;
  } else {
    const helm = box(0.26, 0.26, 0.26, dark);
    const visor = box(0.2, 0.07, 0.03, visorMat);
    visor.position.set(0, 0.01, 0.135);
    const crest = box(0.05, 0.045, 0.12, accentMat);
    crest.position.set(0, 0.15, 0.04);
    head.add(helm, visor, crest);
    head.userData.visor = visor;
  }
  let antenna = null;
  if (v.antenna) {
    antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.18, 6), dark);
    antenna.position.set(0.09, 0.18, -0.05);
    antenna.rotation.z = -0.18;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), accentMat);
    tip.position.set(0.115, 0.27, -0.05);
    head.add(antenna, tip);
  }

  // Arms with shoulder pads
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.32, 0.42, 0);
  armR.position.set(0.32, 0.42, 0.08);
  const makeArm = (arm, padScale) => {
    const limb = box(0.12, 0.23, 0.12, dark);
    limb.position.y = -0.11;
    const pad = box(0.17, 0.11, 0.17, clothDark);
    pad.scale.setScalar(padScale);
    const padEdge = box(0.175, 0.02, 0.175, accentMat);
    padEdge.position.y = -0.045;
    const elbow = new THREE.Group();
    elbow.position.y = -0.23;
    const forearm = box(0.1, 0.22, 0.11, clothDark);
    forearm.position.y = -0.1;
    const glove = box(0.11, 0.1, 0.11, dark);
    glove.position.y = -0.23;
    elbow.add(forearm, glove);
    arm.add(limb, pad, padEdge, elbow);
    return elbow;
  };
  const elbowL = makeArm(armL, shoulderL);
  const elbowR = makeArm(armR, shoulderR);
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.24, 0.06);
  elbowR.add(weapon);

  // Articulated knees and planted boots (hips are 0.9 m above the ground).
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.12, 0, 0);
  legR.position.set(0.12, 0, 0);
  const makeLeg = (leg) => {
    const thigh = box(0.14, 0.4, 0.15, cloth);
    thigh.position.y = -0.2;
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    const shin = box(0.12, 0.37, 0.14, clothDark);
    shin.position.y = -0.18;
    const boot = box(0.15, 0.12, 0.25, dark);
    boot.position.set(0, -0.42, 0.05);
    knee.add(shin, boot);
    leg.add(thigh, knee);
    return knee;
  };
  const kneeL = makeLeg(legL);
  const kneeR = makeLeg(legR);
  if (v.longLegs) {
    legL.scale.y = 1.1;
    legR.scale.y = 1.1;
  }

  // Back gear
  let drone = null;
  let droneBaseY = 0;
  const back = v.back || 'none';
  if (back === 'sash') {
    const sash = box(0.34, 0.055, 0.02, accentMat);
    sash.position.set(0, 0.3, -0.15);
    sash.rotation.z = 0.5;
    parts.push(sash);
  } else if (back === 'plate') {
    const plate = box(0.36, 0.3, 0.06, dark);
    plate.position.set(0, 0.28, -0.155);
    const stripe = box(0.3, 0.03, 0.015, accentMat);
    stripe.position.set(0, 0.36, -0.19);
    parts.push(plate, stripe);
  } else if (back === 'pack') {
    const pack = box(0.3, 0.26, 0.12, dark);
    pack.position.set(0, 0.27, -0.18);
    const cellL = box(0.05, 0.16, 0.02, accentMat);
    cellL.position.set(-0.08, 0.27, -0.25);
    const cellR = box(0.05, 0.16, 0.02, accentMat);
    cellR.position.set(0.08, 0.27, -0.25);
    parts.push(pack, cellL, cellR);
  } else if (back === 'drone') {
    const pack = box(0.26, 0.2, 0.1, dark);
    pack.position.set(0, 0.24, -0.17);
    parts.push(pack);
    drone = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.035, 0.14),
      new THREE.MeshStandardMaterial({ color: '#d0d6de', emissive: accent, emissiveIntensity: 0.8 }),
    );
    drone.position.set(0, 0.52, -0.17);
    droneBaseY = 0.52;
    parts.push(drone);
  } else {
    const slim = box(0.26, 0.2, 0.045, dark);
    slim.position.set(0, 0.28, -0.155);
    parts.push(slim);
  }

  const upper = new THREE.Group();
  for (const m of parts) (m === pelvis ? hips : upper).add(m);
  upper.add(head, armL, armR);
  hips.add(upper, legL, legR);
  group.add(hips);

  const visor = head.userData.visor;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.visible = false;
  flash.position.set(0, 0, 0.6);
  weapon.add(flash);

  const view = {
    group, hips, upper, torso, head, visor, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, weapon, flash,
    animation: {},
    charId: player.characterId, team: player.team,
    bodyYaw: 0, phase: Math.random() * 6,
    weaponId: null, weaponBaseZ: 0.12, flashT: 0, kick: 0, prevFiring: false,
    ads: 0, wasFlashed: false, drone, droneBaseY,
  };
  // Store original emissive intensity for the damage-flash restore.
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
    c.material?.dispose();
  }
  const w = view.weapon;
  const bodyColor = def.visual?.color || '#9eb0c2';
  const accentColor = def.visual?.accent || '#5cffd6';
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.55, roughness: 0.32 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1a1f28', metalness: 0.5, roughness: 0.4 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor, emissive: accentColor, emissiveIntensity: def.visual?.glow ? 1.2 : 0.55, metalness: 0.2, roughness: 0.3,
  });

  if (def.visual?.blade) {
    const blade = box(0.05, 0.03, 0.52, bodyMat);
    blade.position.z = 0.28;
    const edge = box(0.055, 0.012, 0.5, glowMat);
    edge.position.set(0, 0.02, 0.28);
    const guard = box(0.07, 0.09, 0.03, darkMat);
    guard.position.z = 0.03;
    const grip = box(0.05, 0.12, 0.05, darkMat);
    grip.position.z = -0.05;
    w.add(blade, edge, guard, grip);
    view.weaponBaseZ = 0.06;
    if (view.flash) view.flash.position.z = 0.12 + 0.55;
    return;
  }
  if (def.visual?.fist) {
    const knuckle = box(0.11, 0.11, 0.12, bodyMat);
    const tip = box(0.05, 0.05, 0.05, glowMat);
    tip.position.z = 0.08;
    w.add(knuckle, tip);
    view.weaponBaseZ = 0.06;
    return;
  }

  const barrel = 0.28 + (def.visual?.barrel || 0.4) * 0.7;
  const main = box(0.07, 0.09, 0.3, bodyMat);
  main.position.z = 0.02;
  const rail = box(0.045, 0.02, 0.26, darkMat);
  rail.position.set(0, 0.055, 0.0);
  const barrelMesh = box(0.045, 0.045, barrel, darkMat);
  barrelMesh.position.set(0, 0.005, 0.17 + barrel * 0.5);
  const muzzle = box(0.055, 0.055, 0.035, bodyMat);
  muzzle.position.set(0, 0.005, 0.17 + barrel + 0.015);
  const grip = box(0.05, 0.13, 0.06, darkMat);
  grip.position.set(0, -0.1, 0.0);
  grip.rotation.x = 0.25;
  w.add(main, rail, barrelMesh, muzzle, grip);

  const mag = def.visual?.mag;
  if (mag === 'drum') {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10), bodyMat);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, -0.09, 0.1);
    w.add(drum);
    view.magazine = drum;
    drum.userData.baseY = drum.position.y;
  } else if (mag === 'cell') {
    const cell = box(0.06, 0.09, 0.12, glowMat);
    cell.position.set(0, -0.1, 0.08);
    w.add(cell);
    view.magazine = cell;
    cell.userData.baseY = cell.position.y;
  } else if (mag === 'straight' || mag === undefined) {
    const magMesh = box(0.05, 0.16, 0.07, darkMat);
    magMesh.position.set(0, -0.12, 0.07);
    magMesh.rotation.x = 0.12;
    w.add(magMesh);
    view.magazine = magMesh;
    magMesh.userData.baseY = magMesh.position.y;
  }
  if (def.visual?.stock) {
    const stock = box(0.05, 0.09, 0.16, darkMat);
    stock.position.set(0, -0.01, -0.21);
    stock.rotation.x = 0.18;
    w.add(stock);
  }
  const optic = def.visual?.optic;
  if (optic === 'holo') {
    const frame = box(0.06, 0.05, 0.1, darkMat);
    frame.position.set(0, 0.085, 0.02);
    const glass = box(0.035, 0.02, 0.06, glowMat);
    glass.position.set(0, 0.085, 0.02);
    w.add(frame, glass);
  } else if (optic === 'scope') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.15, 10), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, -0.02);
    const lens = box(0.02, 0.02, 0.01, glowMat);
    lens.position.set(0, 0.09, 0.06);
    w.add(scope, lens);
  } else {
    const postL = box(0.012, 0.035, 0.012, darkMat);
    postL.position.set(0.02, 0.065, 0.1);
    const postR = box(0.012, 0.035, 0.012, darkMat);
    postR.position.set(-0.02, 0.065, 0.1);
    w.add(postL, postR);
  }
  const stripe = box(0.015, 0.015, 0.24, glowMat);
  stripe.position.set(0.038, 0.0, 0.0);
  w.add(stripe);

  view.weaponBaseZ = 0.06;
  if (view.flash) view.flash.position.z = 0.17 + barrel + 0.06;
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
