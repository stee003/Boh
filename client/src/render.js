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

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
    g.visible = player.alive || (view.fall || 0) < 1;
    g.position.set(player.x, player.y, player.z);
    const speed = Math.hypot(player.vx, player.vz);
    const moveYaw = speed > 0.6 ? Math.atan2(player.vx, -player.vz) : player.yaw;
    view.bodyYaw = dampAngle(view.bodyYaw, player.alive ? moveYaw : player.yaw, 9, dt);
    g.rotation.set(0, view.bodyYaw, 0);
    const aim = shortest(view.bodyYaw, player.yaw);
    view.torso.rotation.y = Math.max(-1.05, Math.min(1.05, aim));
    view.torso.rotation.x = player.pitch * 0.4;
    view.head.rotation.x = player.pitch * 0.25;
    view.phase += dt * (4 + speed * 1.3);
    const swing = Math.sin(view.phase * 2) * Math.min(0.85, speed * 0.09);
    const crouch = player.crouch || player.sliding;
    if (!player.alive) {
      view.fall = Math.min(1.2, (view.fall || 0) + dt * 2.4);
      g.rotation.z = view.fall * 1.35;
      g.position.y = player.y + 0.15 * (1 - Math.min(1, view.fall));
    } else {
      view.fall = 0;
      if (player.sliding) {
        view.hips.position.y = 0.42;
        view.hips.rotation.x = 1.05;
        view.legL.rotation.x = 0.2;
        view.legR.rotation.x = 1.2;
      } else if (!player.onGround) {
        view.hips.position.y = 0.9;
        view.hips.rotation.x = -0.15;
        view.legL.rotation.x = -0.45;
        view.legR.rotation.x = 0.35;
      } else if (crouch) {
        view.hips.position.y = 0.58;
        view.hips.rotation.x = 0.35;
        view.legL.rotation.x = swing * 0.35 + 0.5;
        view.legR.rotation.x = -swing * 0.35 + 0.5;
      } else {
        view.hips.position.y = 0.9 + Math.abs(Math.sin(view.phase * 2)) * 0.025 * Math.min(1, speed / 4);
        view.hips.rotation.x = speed > 7 ? 0.12 : 0;
        view.legL.rotation.x = swing;
        view.legR.rotation.x = -swing;
      }
    }
    const ads = player.aiming ? 1 : 0;
    view.armR.rotation.x = -0.9 - ads * 0.25 + player.pitch * 0.2;
    view.armL.rotation.x = -0.55 - ads * 0.35;
    view.armR.rotation.z = -0.15;
    view.armL.rotation.z = 0.25;
    if (player.reloading) view.armL.rotation.x = -0.2 + Math.sin(performance.now() / 70) * 0.25;
    if (player.meleeCd > 0.12) view.armR.rotation.x = -0.2;
    if (opts.emote) {
      view.armR.rotation.x = -2.2;
      view.armL.rotation.x = -2.2;
    }
    const accent = player.id === opts.localId ? state.palette.self : (player.team === 'b' ? state.palette.b : state.palette.a);
    view.visor.material.emissive = hex(accent);
    view.visor.material.color = hex(accent);
    if (opts.weaponId && view.weaponId !== opts.weaponId) attachWeapon(view, opts.weaponId);
    if (player.flashed) view.group.traverse((o) => { if (o.isMesh && o.material?.emissive) o.material.emissiveIntensity = 0.4; });
    return view;
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
    const shake = extras.reduce ? state.shake * 0.25 : state.shake;
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
    camera.fov = (base + sprint + state.fovKick) / zoom;
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
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 40),
      new THREE.MeshStandardMaterial({ color: '#121820', roughness: 0.7, metalness: 0.3 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    rig.add(floor);
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.04, 8, 40),
      new THREE.MeshBasicMaterial({ color: '#5cffd6' }),
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.04;
    rig.add(ringMesh);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 2.4 + (i % 3) * 0.5, 0.18),
        new THREE.MeshStandardMaterial({ color: '#1c2733', emissive: i % 2 ? '#2ec8ff' : '#ffb03a', emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.4 }),
      );
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 5.2, 1.2, Math.sin(a) * 5.2);
      rig.add(p);
    }
    scene.add(rig);
    scene.background = hex('#070b12');
    scene.fog.far = 40;
    state.menuRig = rig;
    state.menuAngle = 0.6;
  }

  function setShowcase(characterId, teamColor = '#2ec8ff') {
    menuStage();
    if (state.showcase) {
      scene.remove(state.showcase.group);
    }
    const fake = { id: 'showcase', characterId, team: 'a', alive: true };
    state.palette = { ...state.palette, a: teamColor, self: teamColor };
    const actor = buildActor(fake, state.palette);
    actor.group.position.set(0, 0, 0);
    scene.add(actor.group);
    state.showcase = actor;
  }

  function tickMenu(dt) {
    if (!state.menuRig) return;
    state.menuAngle += dt * 0.22;
    const a = state.menuAngle;
    camera.position.set(Math.sin(a) * 5.4, 1.7, Math.cos(a) * 5.4);
    camera.lookAt(0, 1.15, 0);
    camera.fov = 52;
    camera.updateProjectionMatrix();
    if (state.showcase) {
      state.showcase.group.rotation.y = a * 0.35;
      state.showcase.phase = (state.showcase.phase || 0) + dt;
      const s = Math.sin(state.showcase.phase * 2) * 0.25;
      state.showcase.armR.rotation.x = -0.7 + s * 0.1;
      state.showcase.armL.rotation.x = -0.5;
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
    tracer, impact, ring, tickFx, frameCamera, frameFree, menuStage, setShowcase, tickMenu, render, minimap, syncWorld,
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

function buildActor(player, palette) {
  const ch = getCharacter(player.characterId);
  const accent = player.team === 'b' ? palette.b : palette.a;
  const bulk = ch.visual?.bulk || 1;
  const cloth = new THREE.MeshStandardMaterial({ color: shade(ch.visual?.accent || '#5cffd6', 0.28), roughness: 0.62, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141820', roughness: 0.5, metalness: 0.4 });
  const visorMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.3 });
  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * bulk, 0.48, 0.26), cloth);
  torso.position.y = 0.28;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), dark);
  head.position.y = 0.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.04), visorMat);
  visor.position.set(0, 0.66, 0.14);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.32, 0.42, 0);
  armR.position.set(0.32, 0.42, 0.08);
  const limb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), dark);
  limb.position.y = -0.2;
  limb.castShadow = true;
  armL.add(limb);
  armR.add(limb.clone());
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.32, 0.12);
  armR.add(weapon);
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.12, 0, 0);
  legR.position.set(0.12, 0, 0);
  const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.14), cloth);
  legMesh.position.y = -0.24;
  legMesh.castShadow = true;
  legL.add(legMesh);
  legR.add(legMesh.clone());
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.1), dark);
  pack.position.set(0, 0.3, -0.16);
  hips.add(torso, head, visor, armL, armR, legL, legR, pack);
  group.add(hips);
  const view = { group, hips, torso, head, visor, armL, armR, legL, legR, weapon, charId: player.characterId, team: player.team, bodyYaw: 0, phase: Math.random() * 6, weaponId: null };
  attachWeapon(view, 'linecut');
  return view;
}

function attachWeapon(view, weaponId) {
  const def = getWeapon(weaponId);
  view.weaponId = weaponId;
  while (view.weapon.children.length) {
    const c = view.weapon.children.pop();
    c.geometry?.dispose();
    c.material?.dispose();
  }
  const barrel = def.melee ? 0.55 : 0.28 + (def.visual?.barrel || 0.4) * 0.7;
  const color = def.visual?.color || '#9eb0c2';
  const accentColor = def.visual?.accent || '#5cffd6';
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.07, barrel),
    new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35 }),
  );
  body.position.z = barrel * 0.35;
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.025, Math.min(0.16, barrel * 0.28)),
    new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.55 }),
  );
  accent.position.set(0, 0.045, barrel * 0.12);
  view.weapon.add(body, accent);
}

function shade(color, lit = 0.32) {
  const c = new THREE.Color(color || '#5cffd6');
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * 0.65), Math.max(0.08, Math.min(0.5, lit)));
  return c;
}

function dampAngle(current, target, speed, dt) {
  const d = shortest(current, target);
  const step = Math.max(-1, Math.min(1, d)) * Math.min(1, speed * dt);
  return current + d * Math.min(1, speed * dt);
  void step;
}

function shortest(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
