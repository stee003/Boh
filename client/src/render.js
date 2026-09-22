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

/* ── Procedural texture cache ── */
const texCache = new Map();
function noiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = fn(x, y, size);
    const i = (y * size + x) * 4;
    img.data[i] = v.r; img.data[i+1] = v.g; img.data[i+2] = v.b; img.data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function getTexture(name, palette) {
  const key = name + '|' + (palette?.concrete || '');
  if (texCache.has(key)) return texCache.get(key);
  let canvas;
  if (name === 'concrete') {
    canvas = noiseCanvas(256, (x,y)=>{
      const n = Math.sin(x*0.07)*Math.cos(y*0.08)*20 + (Math.random()-0.5)*18;
      const b = 52 + n; return {r:b+2,g:b+1,b:b+6};
    });
  } else if (name === 'metal') {
    canvas = noiseCanvas(256, (x,y)=>{
      const streak = Math.sin(y*0.15 + Math.sin(x*0.02)*2)*12;
      const v = 112 + streak + (Math.random()-0.5)*8;
      return {r:v,g:v+1,b:v+3};
    });
  } else if (name === 'crate') {
    canvas = noiseCanvas(128, (x,y)=>{
      const grain = Math.sin(x*0.25)*Math.cos(y*0.18)*10 + (Math.random()-0.5)*12;
      return {r:154+grain,g:106+grain*0.7,b:68+grain*0.5};
    });
  } else if (name === 'caution') {
    canvas = noiseCanvas(128, (x,y)=>{
      const stripe = ((Math.floor((x+y*0.6)/16)%2)===0) ? 40 : 0;
      return {r:216+stripe*0.6,g:160+stripe*0.2,b:40};
    });
  } else if (name === 'sand') {
    canvas = noiseCanvas(256, ()=>{
      const v = 194 + (Math.random()-0.5)*30; return {r:v+8,g:v-6,b:v-28};
    });
  } else {
    canvas = noiseCanvas(64, ()=>({r:120,g:130,b:140}));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(name==='concrete'?2:1, name==='concrete'?2:1);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

function matFor(map, name, visual) {
  const palette = map.theme?.palette || {};
  const base = palette[name] || palette.wall || '#3a4254';
  const col = hex(base);
  const tex = (name==='concrete'||name==='metal'||name==='crate'||name==='caution'||name==='sand') ? getTexture(name, palette) : null;

  const roughnessMap = {
    concrete:0.92, metal:0.32, glass:0.08, crate:0.78, wood:0.82, sand:0.95, water:0.15, neon:0.4, trim:0.45, caution:0.6
  };
  const metalMap = {
    concrete:0.02, metal:0.72, glass:0.02, crate:0.04, wood:0.03, sand:0.01, water:0.0, neon:0.1, trim:0.6, caution:0.15
  };

  if (name === 'glass') {
    return new THREE.MeshPhysicalMaterial({
      color:col, roughness:0.12, metalness:0.05, transparent:true, opacity:0.28,
      transmission:0.85, thickness:0.2, envMapIntensity:0.8,
      emissive:hex(base), emissiveIntensity:0.06,
    });
  }
  if (name === 'water') {
    return new THREE.MeshPhysicalMaterial({
      color:hex(palette.water||'#1c9aaf'), roughness:0.1, metalness:0.0,
      transparent:true, opacity:0.55, transmission:0.4,
      emissive:hex(palette.water||'#1c9aaf'), emissiveIntensity:0.15,
    });
  }
  if (name === 'neon' || name === 'trim') {
    const neonCol = hex(name==='neon' ? (palette.neon||'#5cffd6') : base);
    return new THREE.MeshStandardMaterial({
      color:visual?neonCol:col, map:tex||null,
      emissive:neonCol, emissiveIntensity: name==='neon'? (visual?1.2:0.75) : 0.35,
      roughness:roughnessMap[name]||0.4, metalness:metalMap[name]||0.2,
    });
  }
  const m = new THREE.MeshStandardMaterial({
    color:col, map:tex,
    roughness:roughnessMap[name]??0.75, metalness:metalMap[name]??0.08,
    emissive:hex(base), emissiveIntensity:0,
  });
  if (tex) { m.color.set(0xffffff); }
  return m;
}

export { buildActor, attachWeapon };

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias:true, alpha:false, powerPreference:'default', failIfMajorPerformanceCaveat:false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio>2?2:window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.physicallyCorrectLights = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#070b14');
  scene.fog = new THREE.FogExp2('#0b111e', 0.018);

  const camera = new THREE.PerspectiveCamera(74, 1, 0.08, 320);

  // Lights
  const hemi = new THREE.HemisphereLight('#8fb8ff', '#1a0e08', 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3d6', 1.35);
  sun.position.set(22, 38, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2; sun.shadow.camera.far = 110;
  sun.shadow.camera.left = -50; sun.shadow.camera.right = 50; sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#2ec8ff', 0.45);
  rim.position.set(-26, 18, -20);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffb03a', 0.22);
  fill.position.set(18, 12, -22);
  scene.add(fill);

  // Sky dome
  const skyGeo = new THREE.SphereGeometry(280, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false,
    uniforms:{
      top:{value:hex('#1a2a4a')}, bottom:{value:hex('#070a12')}, offset:{value:14}, exponent:{value:0.85},
      starOpacity:{value:0.0}
    },
    vertexShader:`varying vec3 vWorld; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent; varying vec3 vWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
      void main(){
        float h = normalize(vWorld+vec3(0.0,offset,0.0)).y;
        float t = pow(max(h,0.0), exponent);
        vec3 col = mix(bottom, top, t);
        // subtle stars
        float star = step(0.998, hash(floor(vWorld.xz*0.12)))*0.7;
        col += star*0.25;
        // horizon glow
        col += vec3(0.06,0.18,0.28)*pow(1.0-max(h,0.0),3.0)*0.6;
        gl_FragColor = vec4(col,1.0);
      }`,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // Ground fog plane (volumetric fake)
  const fogPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(300,300),
    new THREE.MeshBasicMaterial({ color:'#0a1420', transparent:true, opacity:0.12, depthWrite:false })
  );
  fogPlane.rotation.x = -Math.PI/2; fogPlane.position.y = 0.02;
  scene.add(fogPlane);

  const fx = new THREE.Group();
  scene.add(fx);

  const state = {
    renderer, scene, camera, sun, hemi, rim, fill, fx, skyDome, skyMat,
    mapRoot:null, dynamics:new Map(), actors:new Map(), markers:new Map(),
    shake:0, fovKick:0, quality:'high', palette:teamPalette('off'),
    menuRig:null, impactFlash:0, decals:[], time:0,
  };

  // contact shadow texture
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width=shadowCanvas.height=128;
  const sctx = shadowCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(64,64,0,64,64,64);
  grad.addColorStop(0,'rgba(0,0,0,0.45)'); grad.addColorStop(0.4,'rgba(0,0,0,0.22)'); grad.addColorStop(1,'rgba(0,0,0,0)');
  sctx.fillStyle=grad; sctx.fillRect(0,0,128,128);
  const blobTex = new THREE.CanvasTexture(shadowCanvas); blobTex.colorSpace=THREE.NoColorSpace;

  // muzzle flash sprite
  const flashCanvas = document.createElement('canvas'); flashCanvas.width=flashCanvas.height=128;
  const fctx = flashCanvas.getContext('2d');
  const fg = fctx.createRadialGradient(64,64,0,64,64,64);
  fg.addColorStop(0,'rgba(255,245,200,1)'); fg.addColorStop(0.2,'rgba(255,220,120,0.9)'); fg.addColorStop(0.5,'rgba(255,160,40,0.4)'); fg.addColorStop(1,'rgba(0,0,0,0)');
  fctx.fillStyle=fg; fctx.fillRect(0,0,128,128);
  const flashTex = new THREE.CanvasTexture(flashCanvas);

  function resize(){
    const w = canvas.clientWidth||window.innerWidth;
    const h = canvas.clientHeight||window.innerHeight;
    renderer.setSize(w,h,false);
    camera.aspect = w/Math.max(1,h);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function setQuality(q){
    state.quality=q;
    const low = q==='low'||q==='performance';
    const med = q==='medium';
    renderer.shadowMap.enabled = !low;
    sun.castShadow = !low;
    renderer.setPixelRatio(low?1:med?Math.min(1.5,window.devicePixelRatio||1):Math.min(2,window.devicePixelRatio||1));
    state.reduceFx = low;
    scene.fog = low? new THREE.Fog('#0b1018', 26, 72) : med? new THREE.FogExp2('#0b111e',0.022) : new THREE.FogExp2('#0a101d',0.016);
    if (low) { scene.fog = new THREE.Fog('#0b1018', 22, 68); }
  }

  function clearMap(){
    if (state.mapRoot){
      scene.remove(state.mapRoot);
      state.mapRoot.traverse(o=>{
        o.geometry?.dispose();
        if (o.material){
          if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
          else { if (o.material.map && !texCache.has(o.material.map)) o.material.map?.dispose?.(); o.material.dispose(); }
        }
      });
    }
    state.dynamics.clear();
    state.mapRoot=null;
    clearMarkers();
    // clear decals
    for (const d of state.decals){ scene.remove(d); d.geometry?.dispose(); d.material?.dispose(); }
    state.decals=[];
  }
  function clearMarkers(){
    for (const mesh of state.markers.values()){
      scene.remove(mesh);
      mesh.geometry?.dispose(); mesh.material?.dispose();
    }
    state.markers.clear();
  }

  function syncWorld(extras={}){
    const keep=new Set();
    const place=(id,make,x,y,z,color)=>{
      keep.add(id);
      let mesh=state.markers.get(id);
      if (!mesh){ mesh=make(); state.markers.set(id,mesh); scene.add(mesh); }
      mesh.position.set(x,y,z);
      if (color && mesh.material?.color) mesh.material.color.set(color);
      if (mesh.material?.emissive) mesh.material.emissive.set(color||'#ffffff');
      return mesh;
    };
    const low = state.quality==='low'||state.quality==='performance';

    for (const o of extras.objectives||[]){
      if (extras.modeId==='pulsepoint' && o.active===false) continue;
      const color = o.owner==='b' ? '#ff5a3c' : o.owner==='a' ? '#2ec8ff' : '#ffb03a';
      const pulse = 0.5 + Math.sin(state.time*2 + o.x)*0.15;
      place(`obj:${o.id}`, ()=>{
        const g = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(Math.max(0.8,(o.radius||3)-0.35), o.radius||3, low?16:32),
          new THREE.MeshBasicMaterial({ color, side:THREE.DoubleSide, transparent:true, opacity:0.55 })
        );
        ring.rotation.x=-Math.PI/2;
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(o.radius||3, o.radius||3, 2.8, low?12:24,1,true),
          new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.08, side:THREE.DoubleSide })
        );
        cyl.position.y=1.4;
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08,0.08,0.12,8),
          new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.9 })
        );
        core.position.y=0.06;
        g.add(ring,cyl,core);
        g.userData.ring=ring; g.userData.cyl=cyl;
        return g;
      }, o.x, (o.y||0)+0.08, o.z, color);
      const m = state.markers.get(`obj:${o.id}`);
      if (m?.userData?.ring){ m.userData.ring.material.opacity = 0.45 + pulse*0.2; m.scale.setScalar(1+Math.sin(state.time*1.2)*0.02); }
    }

    for (const d of extras.deployables||[]){
      if (d.dead) continue;
      const color = d.team==='b' ? '#ff5a3c' : '#5cffd6';
      if (d.kind==='dome'){
        place(`dep:${d.id}`, ()=>{
          const g=new THREE.Group();
          const sphere=new THREE.Mesh(
            new THREE.SphereGeometry(d.radius||4.2, 20,14),
            new THREE.MeshStandardMaterial({ color, transparent:true, opacity:0.14, side:THREE.DoubleSide, emissive:color, emissiveIntensity:0.6, roughness:0.2, metalness:0.1 })
          );
          const wire=new THREE.Mesh(
            new THREE.SphereGeometry(d.radius||4.2, 12,8),
            new THREE.MeshBasicMaterial({ color, wireframe:true, transparent:true, opacity:0.18 })
          );
          g.add(sphere,wire);
          return g;
        }, d.x, d.y+1.2, d.z, color);
      } else if (d.kind==='aegis'||d.kind==='fortify'){
        const box=d.box;
        const w=box?box.max.x-box.min.x:1.6, h=box?box.max.y-box.min.y:1.6, dep=box?box.max.z-box.min.z:0.3;
        place(`dep:${d.id}`, ()=>{
          return new THREE.Mesh(
            new THREE.BoxGeometry(w,h,dep),
            new THREE.MeshPhysicalMaterial({ color:'#8eb4ff', emissive:'#2ec8ff', emissiveIntensity:0.35, transparent:true, opacity:0.78, roughness:0.25, metalness:0.4, transmission:0.2 })
          );
        }, box?(box.min.x+box.max.x)/2:d.x, box?(box.min.y+box.max.y)/2:d.y+0.9, box?(box.min.z+box.max.z)/2:d.z, null);
      } else if (d.kind==='shade'){
        place(`dep:${d.id}`, ()=>{
          return new THREE.Mesh(
            new THREE.SphereGeometry(d.radius||3.4, 16,12),
            new THREE.MeshStandardMaterial({ color:'#151821', transparent:true, opacity:0.42, roughness:0.9 })
          );
        }, d.x, d.y+1.1, d.z, null);
      } else if (d.kind==='drone'){
        place(`dep:${d.id}`, ()=>{
          const g=new THREE.Group();
          const body=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.08,0.32), new THREE.MeshStandardMaterial({ color:'#d0d6de', emissive:color, emissiveIntensity:0.7, roughness:0.3, metalness:0.5 }));
          const light=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,6), new THREE.MeshBasicMaterial({ color }));
          light.position.y=0.08;
          g.add(body,light);
          return g;
        }, d.x, d.y, d.z, null);
      } else {
        place(`dep:${d.id}`, ()=>{
          return new THREE.Mesh(
            new THREE.CylinderGeometry(0.18,0.24,d.kind==='pylon'?1.2:0.1,8),
            new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:0.45, roughness:0.4, metalness:0.3 })
          );
        }, d.x, d.y+(d.kind==='pylon'?0.6:0.08), d.z, color);
      }
    }

    for (const c of extras.cores||[]){
      place(`core:${c.team}`, ()=>{
        const g=new THREE.Group();
        const sphere=new THREE.Mesh(new THREE.SphereGeometry(0.32,14,10), new THREE.MeshStandardMaterial({ color:c.team==='b'?'#ff5a3c':'#2ec8ff', emissive:c.team==='b'?'#ff5a3c':'#2ec8ff', emissiveIntensity:1.2, roughness:0.2, metalness:0.3 }));
        const halo=new THREE.Mesh(new THREE.SphereGeometry(0.48,12,8), new THREE.MeshBasicMaterial({ color:c.team==='b'?'#ff5a3c':'#2ec8ff', transparent:true, opacity:0.18 }));
        g.add(sphere,halo);
        return g;
      }, c.x, c.y||0.6, c.z, c.team==='b'?'#ff5a3c':'#2ec8ff');
      const m=state.markers.get(`core:${c.team}`);
      if (m){ m.rotation.y+=0.04; m.children[0].scale.setScalar(1+Math.sin(state.time*3)*0.08); }
    }

    if (!low){
      for (const p of extras.projectiles||[]){
        const id=`prj:${p.id}`;
        const mesh=place(id, ()=>{
          const g=new THREE.Group();
          const core=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), new THREE.MeshBasicMaterial({ color:p.color||'#ffe08a' }));
          const trail=new THREE.Mesh(new THREE.SphereGeometry(0.14,6,5), new THREE.MeshBasicMaterial({ color:p.color||'#ffe08a', transparent:true, opacity:0.35 }));
          g.add(core,trail);
          return g;
        }, p.x, p.y, p.z, p.color||'#ffe08a');
        // stretch trail based on velocity if available
        if (p.vx!==undefined){ mesh.lookAt(p.x+p.vx, p.y+p.vy, p.z+p.vz); }
      }
    }

    for (const [id,mesh] of state.markers){
      if (!keep.has(id)){
        scene.remove(mesh);
        mesh.traverse?.(o=>{ o.geometry?.dispose(); o.material?.dispose(); });
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        state.markers.delete(id);
      }
    }
  }

  function buildMap(map){
    clearMap();
    const root=new THREE.Group();
    const buckets=new Map();
    const edgeGeos=[];
    const low=state.quality==='low'||state.quality==='performance';
    const med=state.quality==='medium';

    // collect boxes
    for (const b of map.boxes){
      const w=Math.max(0.05,b.max.x-b.min.x), h=Math.max(0.05,b.max.y-b.min.y), d=Math.max(0.05,b.max.z-b.min.z);
      const cx=(b.min.x+b.max.x)/2, cy=(b.min.y+b.max.y)/2, cz=(b.min.z+b.max.z)/2;
      const dynamic=b.breakable||b.toggle||b.mover||b.visual||b.mat==='glass'||b.mat==='water';
      if (dynamic){
        const mat=matFor(map,b.mat,b.visual);
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
        mesh.position.set(cx,cy,cz);
        mesh.castShadow=!b.visual && !low && b.mat!=='water';
        mesh.receiveShadow=true;
        // add bevel edge highlight for crates
        if (b.mat==='crate' && !low){
          const edge=new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),
            new THREE.LineBasicMaterial({ color:0x6a4a32, transparent:true, opacity:0.18 })
          );
          edge.position.copy(mesh.position);
          root.add(edge);
        }
        root.add(mesh);
        state.dynamics.set(b.id, mesh);
      } else if (!low || !b.boundary){
        const geo=new THREE.BoxGeometry(w,h,d);
        geo.translate(cx,cy,cz);
        const key=b.mat||'wall';
        if (!buckets.has(key)) buckets.set(key,[]);
        buckets.get(key).push(geo);
        if (!b.boundary && !low && !med && w*h*d<5000){
          const eg=new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d));
          eg.translate(cx,cy,cz);
          edgeGeos.push(eg);
        }
      }
    }

    for (const [name,geos] of buckets){
      const merged=mergeGeometries(geos);
      const mat=matFor(map,name);
      const mesh=new THREE.Mesh(merged, mat);
      mesh.castShadow=!low && name!=='water';
      mesh.receiveShadow=true;
      root.add(mesh);
      geos.forEach(g=>g.dispose());
    }

    if (edgeGeos.length){
      const merged=mergeGeometries(edgeGeos,false);
      const lines=new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color:0x7a8da8, transparent:true, opacity:0.12 }));
      root.add(lines);
      edgeGeos.forEach(g=>g.dispose());
    }

    // ground detail: add subtle grid decal
    const bounds=map.bounds;
    const groundSize=Math.max(bounds.maxX-bounds.minX, bounds.maxZ-bounds.minZ)*1.1;
    const gridTexCanvas=document.createElement('canvas'); gridTexCanvas.width=gridTexCanvas.height=256;
    const gctx=gridTexCanvas.getContext('2d');
    gctx.strokeStyle='rgba(92,255,214,0.04)'; gctx.lineWidth=1;
    for (let i=0;i<256;i+=32){ gctx.beginPath(); gctx.moveTo(i,0); gctx.lineTo(i,256); gctx.stroke(); gctx.beginPath(); gctx.moveTo(0,i); gctx.lineTo(256,i); gctx.stroke(); }
    const gridTex=new THREE.CanvasTexture(gridTexCanvas); gridTex.wrapS=gridTex.wrapT=THREE.RepeatWrapping; gridTex.repeat.set(groundSize/8, groundSize/8);
    const gridMat=new THREE.MeshBasicMaterial({ map:gridTex, transparent:true, opacity:0.35, depthWrite:false });
    const gridPlane=new THREE.Mesh(new THREE.PlaneGeometry(groundSize,groundSize), gridMat);
    gridPlane.rotation.x=-Math.PI/2; gridPlane.position.set((bounds.minX+bounds.maxX)/2,0.015,(bounds.minZ+bounds.maxZ)/2);
    root.add(gridPlane);

    // sky and fog from theme
    const skyTop = map.theme?.skyTop ?? 0x101820;
    const skyCol = new THREE.Color(skyTop);
    scene.background = skyCol.clone().multiplyScalar(0.18);
    // update sky dome shader
    if (state.skyMat){
      state.skyMat.uniforms.top.value = skyCol;
      state.skyMat.uniforms.bottom.value = skyCol.clone().multiplyScalar(0.12);
      state.skyMat.uniforms.starOpacity.value = skyCol.getHSL({h:0,s:0,l:0}).l < 0.25 ? 0.6 : 0.15;
    }
    scene.fog.color = new THREE.Color(map.theme?.fog ?? 0x0b1018);

    const neon = map.theme?.palette?.neon || '#5cffd6';
    rim.color = hex(neon);
    sun.intensity = skyCol.getHSL({h:0,s:0,l:0}).l < 0.22 ? 0.85 : 1.25;
    hemi.intensity = 0.58;
    fill.color = hex(neon); fill.intensity = 0.28;

    for (const light of map.lights||[]){
      const pl=new THREE.PointLight(light.color||neon, (light.intensity||4)*0.55, light.distance||14, 2);
      pl.position.set(light.x, light.y, light.z);
      pl.castShadow = !low && (light.intensity||0)>6;
      if (pl.castShadow){ pl.shadow.mapSize.set(512,512); pl.shadow.bias=-0.001; }
      root.add(pl);
      // light bulb mesh
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6), new THREE.MeshBasicMaterial({ color:light.color||neon }));
      bulb.position.copy(pl.position);
      root.add(bulb);
    }

    scene.add(root);
    state.mapRoot=root;
  }

  function syncBoxes(map){
    for (const b of map.boxes){
      const mesh=state.dynamics.get(b.id);
      if (!mesh) continue;
      mesh.visible=!b.hidden && !b.broken;
      const cx=(b.min.x+b.max.x)/2, cy=(b.min.y+b.max.y)/2, cz=(b.min.z+b.max.z)/2;
      mesh.position.set(cx,cy,cz);
      if (b.broken){
        mesh.visible=false;
        // spawn debris fx
        if (!state.reduceFx && Math.random()<0.6){
          impact([cx,cy,cz],[0,1,0],'#8a7a6a');
        }
      }
    }
  }

  function ensureActor(player){
    let view=state.actors.get(player.id);
    if (view && view.charId===player.characterId && view.team===player.team) return view;
    if (view){ scene.remove(view.group); view.group.traverse(o=>{ o.geometry?.dispose(); o.material?.dispose(); }); state.actors.delete(player.id); }
    view=buildActor(player, state.palette, blobTex, flashTex);
    scene.add(view.group);
    state.actors.set(player.id, view);
    return view;
  }

  function updateActor(player, dt, opts={}){
    const view=ensureActor(player);
    const g=view.group;
    if (opts.hide){ g.visible=false; return view; }
    g.visible = player.alive || (view.animation.death||0)<1;
    g.position.set(player.x, player.y, player.z);
    if (opts.weaponId && view.weaponId!==opts.weaponId){
      attachWeapon(view, opts.weaponId);
      view.equip=1;
    }
    view.bodyYaw = dampAngle(view.bodyYaw, player.yaw||0, 16, dt);
    g.rotation.set(0, Math.PI - view.bodyYaw, 0);
    view.upper.rotation.y = -shortest(view.bodyYaw, player.yaw||0);
    view.phase += dt;
    const pose=animatePose(view.animation, player, dt);
    view.hips.position.y = pose.height;
    view.hips.rotation.set(pose.lean, 0, pose.roll);
    view.head.rotation.x = -(player.pitch||0)*0.38;
    view.head.rotation.y = -view.upper.rotation.y*0.35;

    view.ads = damp(view.ads||0, player.aiming?1:0, 14, dt);
    view.armR.position.set(0.34 - view.ads*0.10, 0.44 + view.ads*0.07, 0.08);
    view.armL.position.set(-0.34 + view.ads*0.06, 0.44 + view.ads*0.05, 0.02);

    view.legL.rotation.x = pose.legL;
    view.legR.rotation.x = pose.legR;
    view.kneeL.rotation.x = pose.kneeL;
    view.kneeR.rotation.x = pose.kneeR;
    view.armR.rotation.set(pose.armR, 0, -0.08);
    view.armL.rotation.set(pose.armL, 0, -0.28);
    view.elbowR.rotation.x = pose.elbowR;
    view.elbowL.rotation.x = pose.elbowL;

    if (opts.emote){ view.armR.rotation.x=-2.6; view.armL.rotation.x=-2.6; }

    view.equip = damp(view.equip||0, 0, 12, dt);
    view.kick = damp(view.kick||0, 0, 24, dt);
    view.flashT = Math.max(0, (view.flashT||0)-dt);
    view.flash.visible = view.flashT>0 && !player.isDummy;
    if (view.flashSprite) {
      view.flashSprite.visible = view.flashT>0 && !player.isDummy;
      view.flashSprite.material.opacity = view.flashT*14;
      view.flashSprite.scale.setScalar(0.35 + view.flashT*2.5);
    }
    view.flash.rotation.z += dt*50;
    view.weapon.position.z = view.weaponBaseZ - view.kick*0.09;
    view.weapon.rotation.set(1.5 - view.kick*0.14 + pose.gunTilt + view.equip*0.65, 0, pose.gunRoll);

    if (view.magazine) view.magazine.position.y = view.magazine.userData.baseY - pose.magDrop;
    if (view.drone){
      view.drone.position.y = view.droneBaseY + Math.sin(view.phase*1.7)*0.04;
      view.drone.rotation.y = view.phase*0.9;
      view.drone.rotation.x = Math.sin(view.phase*0.6)*0.2;
    }
    if (view.shadowBlob){
      view.shadowBlob.position.set(0, -player.y + 0.02, 0);
      view.shadowBlob.rotation.x = -Math.PI/2;
      const dist = Math.max(0, player.y - 0.1);
      const scale = Math.max(0.25, 1 - dist*0.18);
      view.shadowBlob.scale.setScalar(scale*0.9);
      view.shadowBlob.material.opacity = Math.max(0, 0.45 - dist*0.15) * (player.alive?1:0);
    }

    const accent = player.id===opts.localId ? state.palette.self : (player.team==='b' ? state.palette.b : state.palette.a);
    view.visor.material.emissive = hex(accent);
    view.visor.material.color = hex(accent);
    if (view.visorGlow) { view.visorGlow.material.color.set(accent); view.visorGlow.material.opacity = 0.55 + Math.sin(view.phase*2.5)*0.15; }

    const flashing = !!player.flashed;
    if (flashing!==view.wasFlashed){
      view.group.traverse(o=>{
        if (!o.isMesh||!o.material?.emissive) return;
        if (o===view.visor) return;
        if (flashing){
          o.userData.baseEmissive = o.material.emissive.getHex();
          o.userData.baseIntensity = o.material.emissiveIntensity;
          o.material.emissive.set('#ff4a3a');
          o.material.emissiveIntensity=0.65;
        } else if (o.userData.baseEmissive!=null){
          o.material.emissive.setHex(o.userData.baseEmissive);
          if (o.userData.baseIntensity!=null) o.material.emissiveIntensity=o.userData.baseIntensity;
          delete o.userData.baseEmissive; delete o.userData.baseIntensity;
        }
      });
      view.wasFlashed=flashing;
    }
    return view;
  }

  function shot(playerId){
    const actor=state.actors.get(playerId);
    if (!actor) return;
    actor.flashT=0.075;
    if (actor.flash) actor.flash.visible=true;
    if (actor.flashSprite) actor.flashSprite.visible=true;
    actor.kick=1;
    // eject brass
    if (!state.reduceFx && actor.weapon){
      const brass=new THREE.Mesh(
        new THREE.CylinderGeometry(0.012,0.012,0.03,6),
        new THREE.MeshStandardMaterial({ color:'#d4b36a', metalness:0.8, roughness:0.25 })
      );
      brass.position.copy(actor.weapon.getWorldPosition(new THREE.Vector3()));
      brass.position.y+=0.12;
      brass.userData.vel = new THREE.Vector3((Math.random()-0.5)*2, 1.5+Math.random()*1.2, (Math.random()-0.5)*2);
      brass.userData.life=0.9;
      brass.userData.spin = new THREE.Vector3(Math.random()*12, Math.random()*12, Math.random()*12);
      state.fx.add(brass);
    }
  }

  function dropMissing(ids){
    for (const [id,view] of state.actors){
      if (!ids.has(id)){
        scene.remove(view.group);
        view.group.traverse(o=>{ o.geometry?.dispose(); o.material?.dispose(); });
        state.actors.delete(id);
      }
    }
  }

  function tracer(from,to,color='#ffe7a0'){
    const dir=new THREE.Vector3(to[0]-from[0], to[1]-from[1], to[2]-from[2]);
    const len=dir.length();
    dir.normalize();
    // core
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const line=new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.95 }));
    line.userData.life=0.09;
    state.fx.add(line);
    // glow
    const glowGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const glow=new THREE.Line(glowGeo, new THREE.LineBasicMaterial({ color, transparent:true, opacity:0.28 }));
    glow.scale.setScalar(1.8);
    glow.userData.life=0.09;
    state.fx.add(glow);
    // light flash at origin
    if (!state.reduceFx){
      const light=new THREE.PointLight(color, 3.5, 4, 2);
      light.position.set(...from);
      light.userData.life=0.06;
      state.fx.add(light);
    }
  }

  function impact(point, normal=[0,1,0], color='#ffb03a'){
    if (state.reduceFx) return;
    const p=new THREE.Vector3(...point);
    const n=new THREE.Vector3(...normal);
    // core
    const m=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(p);
    m.userData.life=0.22; m.userData.grow=true;
    state.fx.add(m);
    // sparks
    for (let i=0;i<6;i++){
      const spark=new THREE.Mesh(
        new THREE.BoxGeometry(0.02,0.02,0.28),
        new THREE.MeshBasicMaterial({ color: i%2?color:'#ffe7a0' })
      );
      spark.position.copy(p);
      const dir=n.clone().add(new THREE.Vector3((Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2 +0.6, (Math.random()-0.5)*1.2)).normalize();
      spark.userData.vel=dir.multiplyScalar(2.5+Math.random()*4.5);
      spark.userData.life=0.18+Math.random()*0.12;
      spark.userData.drag=0.92;
      spark.lookAt(p.clone().add(dir));
      state.fx.add(spark);
    }
    // dust puff
    const puff=new THREE.Mesh(
      new THREE.SphereGeometry(0.18,8,6),
      new THREE.MeshBasicMaterial({ color:'#c8b8a0', transparent:true, opacity:0.32 })
    );
    puff.position.copy(p).add(n.clone().multiplyScalar(0.05));
    puff.userData.life=0.28; puff.userData.grow=true; puff.userData.growSpeed=3.5;
    state.fx.add(puff);
    // decal
    if (state.decals.length<80){
      const decalGeo=new THREE.PlaneGeometry(0.18,0.18);
      const decalMat=new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.35), transparent:true, opacity:0.7, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1 });
      const decal=new THREE.Mesh(decalGeo, decalMat);
      decal.position.copy(p).add(n.clone().multiplyScalar(0.015));
      decal.lookAt(p.clone().add(n));
      decal.userData.life=12; // long lived but fades
      state.decals.push(decal);
      scene.add(decal);
    }
  }

  function ring(x,y,z,color,life=0.5){
    if (state.reduceFx) return;
    const mesh=new THREE.Mesh(
      new THREE.RingGeometry(0.18,0.42,24),
      new THREE.MeshBasicMaterial({ color, side:THREE.DoubleSide, transparent:true, opacity:0.85, depthWrite:false })
    );
    mesh.rotation.x=-Math.PI/2;
    mesh.position.set(x,y+0.05,z);
    mesh.userData.life=life; mesh.userData.grow=true; mesh.userData.growSpeed=2.2;
    state.fx.add(mesh);
    // second ring
    const mesh2=new THREE.Mesh(
      new THREE.RingGeometry(0.1,0.22,20),
      new THREE.MeshBasicMaterial({ color, side:THREE.DoubleSide, transparent:true, opacity:0.6, depthWrite:false })
    );
    mesh2.rotation.x=-Math.PI/2; mesh2.position.set(x,y+0.12,z);
    mesh2.userData.life=life*0.8; mesh2.userData.grow=true; mesh2.userData.growSpeed=3;
    state.fx.add(mesh2);
  }

  function tickFx(dt){
    state.time+=dt;
    const dead=[];
    for (const o of state.fx.children){
      if (o.userData.vel){
        o.position.add(o.userData.vel.clone().multiplyScalar(dt));
        if (o.userData.drag) o.userData.vel.multiplyScalar(Math.pow(o.userData.drag, dt*60));
        else o.userData.vel.y -= 9.8*dt*0.6;
      }
      if (o.userData.spin){
        o.rotation.x+=o.userData.spin.x*dt;
        o.rotation.y+=o.userData.spin.y*dt;
        o.rotation.z+=o.userData.spin.z*dt;
      }
      o.userData.life-=dt;
      if (o.isPointLight){
        o.intensity = Math.max(0, o.userData.life*60);
      } else if (o.material){
        if (o.userData.life<0.2) o.material.opacity = Math.max(0, o.userData.life*5);
        else if (o.material.opacity!==undefined && o.userData.grow) o.material.opacity *= 0.998;
      }
      if (o.userData.grow){
        const s=1+dt*(o.userData.growSpeed||6);
        o.scale.multiplyScalar(s);
      }
      if (o.userData.life<=0) dead.push(o);
    }
    for (const o of dead){
      state.fx.remove(o);
      o.geometry?.dispose(); o.material?.dispose();
    }
    // decals fade
    for (let i=state.decals.length-1;i>=0;i--){
      const d=state.decals[i];
      d.userData.life-=dt;
      if (d.userData.life<=0 || d.userData.life<2) d.material.opacity = Math.max(0, d.userData.life/2 *0.7);
      if (d.userData.life<=0){
        scene.remove(d);
        d.geometry.dispose(); d.material.dispose();
        state.decals.splice(i,1);
      }
    }
  }

  function frameCamera(player, solids, dt, extras={}){
    const ads=player.aiming?1:0;
    const pose=cameraPose(player, solids, ads);
    const look=new THREE.Vector3(
      pose.pos.x+pose.dir.x*12,
      pose.pos.y+pose.dir.y*12,
      pose.pos.z+pose.dir.z*12,
    );
    state.shake=Math.max(0,state.shake-dt*2.6)+(extras.shake||0);
    state.fovKick=Math.max(0,state.fovKick-dt*52)+(extras.fov||0);
    const shake=extras.reduce?0:state.shake;
    const shX=(Math.random()-0.5)*shake, shY=(Math.random()-0.5)*shake*0.55, shZ=(Math.random()-0.5)*shake;
    camera.position.set(pose.pos.x+shX, pose.pos.y+shY, pose.pos.z+shZ);
    camera.up.set(0,1,0);
    camera.lookAt(look);
    const zoom=player.aiming?(extras.zoom||1):1;
    const base=extras.baseFov||74;
    const sprint=Math.hypot(player.vx||0,player.vz||0)>8.2 && !player.aiming ? 3.2 : 0;
    const landKick = player.onGround===false ? 0 : (player.landKick||0);
    camera.fov=damp(camera.fov, (base + (extras.reduce?0:sprint+state.fovKick+landKick*2))/zoom, 15, dt);
    camera.updateProjectionMatrix();
    // sky dome follows camera
    if (skyDome) skyDome.position.copy(camera.position);
  }

  function frameFree(pos,yaw,pitch){
    const cp=Math.cos(pitch);
    camera.position.set(pos.x,pos.y,pos.z);
    camera.lookAt(pos.x+Math.sin(yaw)*cp, pos.y+Math.sin(pitch), pos.z-Math.cos(yaw)*cp);
    if (skyDome) skyDome.position.copy(camera.position);
  }

  function menuStage(){
    if (state.menuRig) return;
    clearMap();
    const rig=new THREE.Group();
    const accent='#5cffd6', amber='#ffb03a';

    // base platform with layered materials
    const baseMat=new THREE.MeshStandardMaterial({ color:'#0c121c', roughness:0.55, metalness:0.6 });
    const base=new THREE.Mesh(new THREE.CylinderGeometry(4.6,5.2,0.38,56), baseMat);
    base.position.y=-0.19; base.receiveShadow=true; base.castShadow=false;
    rig.add(base);
    const topMat=new THREE.MeshStandardMaterial({ color:'#141e2c', roughness:0.35, metalness:0.7, emissive:'#0a1a24', emissiveIntensity:0.15 });
    const top=new THREE.Mesh(new THREE.CircleGeometry(4.3,56), topMat);
    top.rotation.x=-Math.PI/2; top.position.y=0.005; top.receiveShadow=true;
    rig.add(top);

    // inner glow disc
    const glowDisc=new THREE.Mesh(
      new THREE.RingGeometry(0.8,4.2,48),
      new THREE.MeshBasicMaterial({ color:accent, transparent:true, opacity:0.08, side:THREE.DoubleSide })
    );
    glowDisc.rotation.x=-Math.PI/2; glowDisc.position.y=0.012;
    rig.add(glowDisc);

    // polar grid
    const gridMat=new THREE.LineBasicMaterial({ color:accent, transparent:true, opacity:0.18 });
    const gridMat2=new THREE.LineBasicMaterial({ color:amber, transparent:true, opacity:0.12 });
    for (const r of [1.2,2.2,3.2,4.0]){
      const pts=[]; for (let i=0;i<=72;i++){ const a=(i/72)*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(a)*r,0.015,Math.sin(a)*r)); }
      rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), r%2?gridMat:gridMat2));
    }
    for (let i=0;i<16;i++){
      const a=(i/16)*Math.PI*2;
      const pts=[new THREE.Vector3(Math.cos(a)*1.0,0.015,Math.sin(a)*1.0), new THREE.Vector3(Math.cos(a)*4.15,0.015,Math.sin(a)*4.15)];
      rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:accent, transparent:true, opacity:0.08 })));
    }

    // rotating rings with emissive
    const ringOuter=new THREE.Mesh(
      new THREE.TorusGeometry(4.15,0.04,10,80),
      new THREE.MeshStandardMaterial({ color:accent, emissive:accent, emissiveIntensity:1.2, roughness:0.2, metalness:0.3 })
    );
    ringOuter.rotation.x=Math.PI/2; ringOuter.position.y=0.08;
    rig.add(ringOuter);
    const ringInner=new THREE.Mesh(
      new THREE.TorusGeometry(2.85,0.028,8,72),
      new THREE.MeshStandardMaterial({ color:amber, emissive:amber, emissiveIntensity:1.0, roughness:0.3, metalness:0.2 })
    );
    ringInner.rotation.x=Math.PI/2; ringInner.position.y=0.06;
    rig.add(ringInner);
    const ringMid=new THREE.Mesh(
      new THREE.TorusGeometry(3.45,0.015,6,64),
      new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.12 })
    );
    ringMid.rotation.x=Math.PI/2; ringMid.position.y=0.07;
    rig.add(ringMid);
    state.menuRings={ outer:ringOuter, inner:ringInner, mid:ringMid, glow:glowDisc };

    // floating shards with better materials
    state.menuShards=[];
    for (let i=0;i<5;i++){
      const isAmber=i%2===1;
      const shard=new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18 + i*0.06, 0),
        new THREE.MeshPhysicalMaterial({
          color:isAmber?'#2a1e12':'#13202a', emissive:isAmber?amber:accent, emissiveIntensity:0.85,
          metalness:0.6, roughness:0.25, transmission:0.15, thickness:0.1
        })
      );
      const a=(i/5)*Math.PI*2 + 0.6;
      const rad=5.2 + (i%2)*0.6;
      shard.position.set(Math.cos(a)*rad, 0.9 + i*0.5 + Math.sin(i)*0.3, Math.sin(a)*rad);
      shard.castShadow=true;
      rig.add(shard);
      state.menuShards.push({ mesh:shard, baseY:shard.position.y, a, i, rad });
    }

    // pillars with accent strips and caps
    for (let i=0;i<10;i++){
      const h=2.4 + (i%3)*0.7;
      const mat=new THREE.MeshStandardMaterial({ color:'#182232', roughness:0.5, metalness:0.45 });
      const p=new THREE.Mesh(new THREE.BoxGeometry(0.18,h,0.18), mat);
      const a=(i/10)*Math.PI*2;
      p.position.set(Math.cos(a)*5.7, h/2-0.35, Math.sin(a)*5.7);
      p.castShadow=true; p.receiveShadow=true;
      rig.add(p);
      const strip=new THREE.Mesh(
        new THREE.BoxGeometry(0.04,h*0.85,0.04),
        new THREE.MeshBasicMaterial({ color:i%2?amber:accent })
      );
      strip.position.set(Math.cos(a)*5.7, h/2-0.35, Math.sin(a)*5.7);
      rig.add(strip);
      const cap=new THREE.Mesh(
        new THREE.BoxGeometry(0.22,0.06,0.22),
        new THREE.MeshStandardMaterial({ color:i%2?amber:accent, emissive:i%2?amber:accent, emissiveIntensity:0.9 })
      );
      cap.position.set(Math.cos(a)*5.7, h-0.35, Math.sin(a)*5.7);
      rig.add(cap);
    }

    // volumetric light cones
    for (let i=0;i<4;i++){
      const cone=new THREE.Mesh(
        new THREE.ConeGeometry(1.8, 8, 16, 1, true),
        new THREE.MeshBasicMaterial({ color:i%2?amber:accent, transparent:true, opacity:0.04, side:THREE.DoubleSide, depthWrite:false })
      );
      const a=(i/4)*Math.PI*2 + Math.PI/8;
      cone.position.set(Math.cos(a)*3.2, 4, Math.sin(a)*3.2);
      cone.rotation.x=Math.PI;
      rig.add(cone);
    }

    // stage lights
    const spot=new THREE.SpotLight('#e8f8ff', 320, 28, 0.52, 0.45, 1.4);
    spot.position.set(0,9.5,0); spot.target.position.set(0,0.6,0); spot.castShadow=true; spot.shadow.mapSize.set(1024,1024);
    rig.add(spot, spot.target);
    const left=new THREE.PointLight(accent, 32, 18, 2); left.position.set(-5.5,2.6,-2.2);
    const right=new THREE.PointLight(amber, 22, 16, 2); right.position.set(5.2,1.8,2.8);
    const backL=new THREE.PointLight('#8eb4ff', 18, 14, 2); backL.position.set(0,3.5,-6);
    rig.add(left,right,backL);

    // dust particles
    const dustCount=120;
    const dustGeo=new THREE.BufferGeometry();
    const dustPos=new Float32Array(dustCount*3);
    for (let i=0;i<dustCount;i++){
      const a=Math.random()*Math.PI*2, r=2+Math.random()*6, y=Math.random()*6;
      dustPos[i*3]=Math.cos(a)*r; dustPos[i*3+1]=y; dustPos[i*3+2]=Math.sin(a)*r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos,3));
    const dustMat=new THREE.PointsMaterial({ color:accent, size:0.04, transparent:true, opacity:0.35, sizeAttenuation:true });
    const dust=new THREE.Points(dustGeo, dustMat);
    rig.add(dust);
    state.menuDust={ mesh:dust, pos:dustPos };

    scene.add(rig);
    scene.background = hex('#070b14');
    if (state.skyMat){ state.skyMat.uniforms.top.value=hex('#0f1a2e'); state.skyMat.uniforms.bottom.value=hex('#05070c'); }
    scene.fog = new THREE.FogExp2('#070b14', 0.032);
    state.menuRig=rig;
    state.menuAngle=0.6;
  }

  function setShowcase(characterId, teamColor='#2ec8ff'){
    menuStage();
    if (state.showcase){ scene.remove(state.showcase.group); state.showcase.group.traverse(o=>{o.geometry?.dispose(); o.material?.dispose();}); state.showcase=null; }
    const accent=getCharacter(characterId).visual?.accent||teamColor;
    const fake={ id:'showcase', characterId, team:'a', alive:true, yaw:0, pitch:0, vx:0, vz:0, onGround:true };
    state.palette={ ...state.palette, a:teamColor, self:teamColor };
    const actor=buildActor(fake, state.palette, blobTex, flashTex);
    actor.visor.material.color=hex(teamColor); actor.visor.material.emissive=hex(teamColor);
    if (actor.visorGlow){ actor.visorGlow.material.color.set(teamColor); }
    actor.group.position.set(0,0.02,0);
    const pedestal=new THREE.Mesh(
      new THREE.RingGeometry(0.62,0.88,40),
      new THREE.MeshBasicMaterial({ color:accent, side:THREE.DoubleSide, transparent:true, opacity:0.75 })
    );
    pedestal.rotation.x=-Math.PI/2; pedestal.position.y=-0.01;
    actor.group.add(pedestal);
    const underLight=new THREE.PointLight(accent, 18, 6, 2);
    underLight.position.set(0,0.2,0);
    actor.group.add(underLight);
    scene.add(actor.group);
    state.showcase=actor;
    state.showcaseAccent=accent;
  }

  function tickMenu(dt){
    if (!state.menuRig) return;
    state.time+=dt;
    state.menuAngle+=dt*0.20;
    const a=state.menuAngle;
    camera.position.set(Math.sin(a)*5.6, 1.75 + Math.sin(a*0.5)*0.22, Math.cos(a)*5.6);
    camera.lookAt(0,1.18,0);
    camera.fov=50 + Math.sin(state.time*0.3)*1.2;
    camera.updateProjectionMatrix();
    const rings=state.menuRings;
    if (rings){
      rings.outer.rotation.z=a*0.45;
      rings.inner.rotation.z=-a*0.75;
      rings.mid.rotation.z=a*0.25;
      rings.glow.rotation.z=-a*0.15;
      rings.glow.material.opacity=0.06 + Math.sin(state.time*1.1)*0.02;
    }
    for (const s of state.menuShards||[]){
      s.mesh.position.y=s.baseY + Math.sin(state.time*0.9 + s.i*1.8)*0.28;
      s.mesh.position.x=Math.cos(s.a + state.time*0.15)*s.rad;
      s.mesh.position.z=Math.sin(s.a + state.time*0.15)*s.rad;
      s.mesh.rotation.y=state.time*(0.6 + s.i*0.18);
      s.mesh.rotation.x=state.time*0.35 + s.i;
    }
    if (state.menuDust){
      const pos=state.menuDust.pos;
      for (let i=0;i<pos.length/3;i++){
        pos[i*3+1]+=Math.sin(state.time*0.5 + i)*0.002;
        if (pos[i*3+1]>7) pos[i*3+1]=0;
      }
      state.menuDust.mesh.geometry.attributes.position.needsUpdate=true;
      state.menuDust.mesh.rotation.y=state.time*0.04;
    }
    if (state.showcase){
      state.showcase.group.rotation.y=a*0.32;
      state.showcase.phase=(state.showcase.phase||0)+dt;
      const s=Math.sin(state.showcase.phase*2)*0.22;
      state.showcase.armR.rotation.x=-1.05 + s*0.08;
      state.showcase.elbowR.rotation.x=-0.45;
      state.showcase.weapon.rotation.x=1.5;
      state.showcase.armL.rotation.x=-1.15 + s*0.06;
      state.showcase.elbowL.rotation.x=-0.6;
      state.showcase.hips.position.y=0.9 + Math.sin(state.showcase.phase*1.5)*0.025;
      if (state.showcase.shadowBlob){
        state.showcase.shadowBlob.rotation.z=-a*0.32;
      }
    }
  }

  function render(){ renderer.render(scene,camera); }

  function minimap(canvas2d, map, players, local){
    if (!canvas2d||!map) return;
    const ctx=canvas2d.getContext('2d');
    const w=canvas2d.width, h=canvas2d.height;
    ctx.clearRect(0,0,w,h);
    // background
    const gradBg=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w);
    gradBg.addColorStop(0,'rgba(14,21,33,0.9)'); gradBg.addColorStop(1,'rgba(7,10,18,0.8)');
    ctx.fillStyle=gradBg; ctx.fillRect(0,0,w,h);
    // grid
    ctx.strokeStyle='rgba(92,255,214,0.06)'; ctx.lineWidth=0.5;
    for (let i=0;i<w;i+=16){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
    for (let i=0;i<h;i+=16){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

    const b=map.bounds;
    const sx=w/(b.maxX-b.minX), sz=h/(b.maxZ-b.minZ);
    const X=x=>(x-b.minX)*sx, Z=z=>(z-b.minZ)*sz;

    // walls
    ctx.fillStyle='rgba(160,180,200,0.18)';
    for (const box of map.boxes){
      if (box.boundary||box.visual||box.max.y<0.4) continue;
      if (box.min.y>3) continue;
      ctx.fillRect(X(box.min.x), Z(box.min.z), (box.max.x-box.min.x)*sx, (box.max.z-box.min.z)*sz);
    }
    // objectives
    for (const o of (state.markers ? [] : [])){}
    // players with yaw arrows
    for (const p of players){
      if (!p.alive) continue;
      const x=X(p.x), z=Z(p.z);
      const isLocal=p.id===local?.id;
      const col=p.id===local?.id ? '#5cffd6' : (p.team==='b' ? '#ff5a3c' : '#2ec8ff');
      ctx.fillStyle=col;
      ctx.beginPath();
      ctx.arc(x,z,isLocal?4:3,0,Math.PI*2);
      ctx.fill();
      if (!isLocal){
        // direction
        ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.beginPath();
        ctx.moveTo(x,z);
        ctx.lineTo(x+Math.sin(p.yaw||0)*8, z+Math.cos(p.yaw||0)*8*-1);
        ctx.stroke();
      } else {
        // local has outer ring
        ctx.strokeStyle='#5cffd6'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(x,z,7,0,Math.PI*2); ctx.stroke();
      }
    }
    // border
    ctx.strokeStyle='rgba(92,255,214,0.18)'; ctx.lineWidth=1.2; ctx.strokeRect(0.5,0.5,w-1,h-1);
  }

  return {
    state, resize, setQuality, buildMap, clearMap, syncBoxes, updateActor, dropMissing,
    shot, tracer, impact, ring, tickFx, frameCamera, frameFree, menuStage, setShowcase, tickMenu, render, minimap, syncWorld,
    camera, scene,
  };
}

function mergeGeometries(geos, withNormal=true){
  let verts=0, idx=0;
  for (const g of geos){ verts+=g.attributes.position.count; idx+= g.index ? g.index.count : g.attributes.position.count; }
  const pos=new Float32Array(verts*3);
  const nor=withNormal?new Float32Array(verts*3):null;
  const indices=new Uint32Array(idx);
  let vo=0, io=0, base=0;
  for (const g of geos){
    pos.set(g.attributes.position.array, vo*3);
    if (nor && g.attributes.normal) nor.set(g.attributes.normal.array, vo*3);
    if (g.index){ const src=g.index.array; for (let i=0;i<src.length;i++) indices[io++]=src[i]+base; }
    else { for (let i=0;i<g.attributes.position.count;i++) indices[io++]=base+i; }
    base+=g.attributes.position.count; vo+=g.attributes.position.count;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor,3));
  geo.setIndex(new THREE.BufferAttribute(indices,1));
  geo.computeBoundingSphere();
  return geo;
}

function shade(color, lit=0.32){
  const c=new THREE.Color(color||'#5cffd6');
  const hsl={h:0,s:0,l:0}; c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1,hsl.s*0.65), Math.max(0.08,Math.min(0.5,lit)));
  return c;
}

const box=(w,h,d,mat)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);

function buildActor(player, palette, blobTex, flashTex){
  const ch=getCharacter(player.characterId);
  const v=ch.visual||{};
  const accent=v.accent||'#5cffd6';
  const bulk=v.bulk||1;
  const shoulderL=v.shoulders?.[0]??1, shoulderR=v.shoulders?.[1]??1;

  const cloth=new THREE.MeshStandardMaterial({ color:shade(accent,0.30), roughness:0.62, metalness:0.14 });
  const clothDark=new THREE.MeshStandardMaterial({ color:shade(accent,0.20), roughness:0.70, metalness:0.10 });
  const dark=new THREE.MeshStandardMaterial({ color:'#151a22', roughness:0.45, metalness:0.55 });
  const dark2=new THREE.MeshStandardMaterial({ color:'#1c232e', roughness:0.5, metalness:0.5 });
  const accentMat=new THREE.MeshStandardMaterial({ color:accent, emissive:accent, emissiveIntensity:0.85, roughness:0.28, metalness:0.25 });
  const visorMat=new THREE.MeshPhysicalMaterial({ color:'#ffffff', emissive:'#ffffff', emissiveIntensity:1.0, roughness:0.18, metalness:0.2, transmission:0.1, thickness:0.05, transparent:true, opacity:0.92 });

  const group=new THREE.Group();
  const hips=new THREE.Group(); hips.position.y=0.9;

  // contact shadow
  const shadowBlob=new THREE.Mesh(
    new THREE.PlaneGeometry(1.1,1.1),
    new THREE.MeshBasicMaterial({ map:blobTex, transparent:true, opacity:0.4, depthWrite:false })
  );
  shadowBlob.rotation.x=-Math.PI/2; shadowBlob.position.y=0.02;

  const pelvis=box(0.32*bulk,0.20,0.22,dark); pelvis.position.y=0.02; pelvis.castShadow=true;

  const torso=box(0.48*bulk,0.50,0.28,cloth); torso.position.y=0.30; torso.castShadow=true;
  const chest=box(0.36*bulk,0.34,0.06,dark2); chest.position.set(0,0.34,0.145); chest.castShadow=true;
  const core=box(0.10,0.12,0.025,accentMat); core.position.set(0,0.35,0.18);

  const parts=[pelvis,torso,chest,core];

  if (v.seam){
    const seamL=box(0.022,0.46,0.022,accentMat); seamL.position.set(0.245*bulk,0.30,0);
    const seamR=box(0.022,0.46,0.022,accentMat); seamR.position.set(-0.245*bulk,0.30,0);
    parts.push(seamL,seamR);
  }
  if (v.coat){
    const coat=box(0.52*bulk,0.38,0.30,clothDark); coat.position.y=0.02; coat.castShadow=true;
    parts.push(coat);
  }

  // head
  const head=new THREE.Group(); head.position.y=0.66;
  if (v.head==='hood'){
    const hood=box(0.32,0.32,0.32,clothDark); hood.castShadow=true;
    const face=box(0.24,0.19,0.06,dark); face.position.set(0,-0.02,0.14);
    const visor=box(0.19,0.042,0.024,visorMat); visor.position.set(0,0.02,0.175);
    const visorGlow=new THREE.Mesh(new THREE.PlaneGeometry(0.20,0.05), new THREE.MeshBasicMaterial({ color:accent, transparent:true, opacity:0.6 }));
    visorGlow.position.set(0,0.02,0.19);
    head.add(hood,face,visor,visorGlow);
    head.userData.visor=visor; head.userData.glow=visorGlow;
  } else if (v.head==='wide'){
    const helm=box(0.35,0.26,0.31,dark); helm.castShadow=true;
    const visor=box(0.29,0.085,0.036,visorMat); visor.position.set(0,0.01,0.155);
    const visorGlow=new THREE.Mesh(new THREE.PlaneGeometry(0.30,0.09), new THREE.MeshBasicMaterial({ color:accent, transparent:true, opacity:0.55 }));
    visorGlow.position.set(0,0.01,0.175);
    const crest=box(0.07,0.055,0.16,accentMat); crest.position.set(0,0.16,0.05);
    head.add(helm,visor,visorGlow,crest);
    head.userData.visor=visor; head.userData.glow=visorGlow;
  } else {
    const helm=box(0.28,0.28,0.28,dark); helm.castShadow=true;
    const visor=box(0.22,0.08,0.036,visorMat); visor.position.set(0,0.015,0.15);
    const visorGlow=new THREE.Mesh(new THREE.PlaneGeometry(0.23,0.09), new THREE.MeshBasicMaterial({ color:accent, transparent:true, opacity:0.55 }));
    visorGlow.position.set(0,0.015,0.17);
    const crest=box(0.055,0.05,0.13,accentMat); crest.position.set(0,0.165,0.04);
    head.add(helm,visor,visorGlow,crest);
    head.userData.visor=visor; head.userData.glow=visorGlow;
  }
  if (v.antenna){
    const ant=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.009,0.20,6), dark);
    ant.position.set(0.10,0.20,-0.05); ant.rotation.z=-0.18;
    const tip=new THREE.Mesh(new THREE.SphereGeometry(0.024,8,6), accentMat); tip.position.set(0.125,0.30,-0.05);
    head.add(ant,tip);
  }

  // arms
  const armL=new THREE.Group(), armR=new THREE.Group();
  armL.position.set(-0.34,0.44,0); armR.position.set(0.34,0.44,0.08);
  const makeArm=(arm,padScale)=>{
    const limb=box(0.13,0.25,0.13,dark2); limb.position.y=-0.12; limb.castShadow=true;
    const pad=box(0.19,0.12,0.19,clothDark); pad.scale.setScalar(padScale); pad.castShadow=true;
    const padEdge=box(0.195,0.024,0.195,accentMat); padEdge.position.y=-0.05;
    const elbow=new THREE.Group(); elbow.position.y=-0.25;
    const forearm=box(0.11,0.24,0.12,clothDark); forearm.position.y=-0.11; forearm.castShadow=true;
    const glove=box(0.12,0.11,0.12,dark); glove.position.y=-0.25; glove.castShadow=true;
    elbow.add(forearm,glove);
    arm.add(limb,pad,padEdge,elbow);
    return elbow;
  };
  const elbowL=makeArm(armL, shoulderL);
  const elbowR=makeArm(armR, shoulderR);
  const weapon=new THREE.Group(); weapon.position.set(0,-0.26,0.06); elbowR.add(weapon);

  // legs
  const legL=new THREE.Group(), legR=new THREE.Group();
  legL.position.set(-0.13,0,0); legR.position.set(0.13,0,0);
  const makeLeg=(leg)=>{
    const thigh=box(0.15,0.42,0.16,cloth); thigh.position.y=-0.21; thigh.castShadow=true;
    const knee=new THREE.Group(); knee.position.y=-0.42;
    const shin=box(0.13,0.39,0.15,clothDark); shin.position.y=-0.19; shin.castShadow=true;
    const boot=box(0.16,0.13,0.27,dark); boot.position.set(0,-0.44,0.05); boot.castShadow=true;
    knee.add(shin,boot);
    leg.add(thigh,knee);
    return knee;
  };
  const kneeL=makeLeg(legL), kneeR=makeLeg(legR);
  if (v.longLegs){ legL.scale.y=1.12; legR.scale.y=1.12; }

  // back gear
  let drone=null, droneBaseY=0;
  const back=v.back||'none';
  if (back==='sash'){
    const sash=box(0.36,0.06,0.022,accentMat); sash.position.set(0,0.32,-0.16); sash.rotation.z=0.5;
    parts.push(sash);
  } else if (back==='plate'){
    const plate=box(0.38,0.32,0.07,dark); plate.position.set(0,0.30,-0.165); plate.castShadow=true;
    const stripe=box(0.32,0.035,0.02,accentMat); stripe.position.set(0,0.38,-0.205);
    parts.push(plate,stripe);
  } else if (back==='pack'){
    const pack=box(0.32,0.28,0.13,dark); pack.position.set(0,0.29,-0.19); pack.castShadow=true;
    const cellL=box(0.055,0.18,0.024,accentMat); cellL.position.set(-0.09,0.29,-0.265);
    const cellR=box(0.055,0.18,0.024,accentMat); cellR.position.set(0.09,0.29,-0.265);
    parts.push(pack,cellL,cellR);
  } else if (back==='drone'){
    const pack=box(0.28,0.22,0.11,dark); pack.position.set(0,0.26,-0.18); pack.castShadow=true;
    parts.push(pack);
    drone=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.04,0.16), new THREE.MeshStandardMaterial({ color:'#d0d6de', emissive:accent, emissiveIntensity:0.9, roughness:0.3, metalness:0.5 }));
    drone.position.set(0,0.56,-0.18); drone.castShadow=true;
    droneBaseY=0.56; parts.push(drone);
  } else {
    const slim=box(0.28,0.22,0.05,dark); slim.position.set(0,0.30,-0.165);
    parts.push(slim);
  }

  const upper=new THREE.Group();
  for (const m of parts) (m===pelvis?hips:upper).add(m);
  upper.add(head,armL,armR);
  hips.add(upper,legL,legR);
  group.add(hips,shadowBlob);

  const visor=head.userData.visor;
  const visorGlow=head.userData.glow;
  const flash=new THREE.Mesh(
    new THREE.PlaneGeometry(0.24,0.24),
    new THREE.MeshBasicMaterial({ color:'#ffe9b0', transparent:true, opacity:0.95, side:THREE.DoubleSide, depthWrite:false })
  );
  flash.visible=false; flash.position.set(0,0,0.6);
  weapon.add(flash);

  const flashSprite=new THREE.Sprite(new THREE.SpriteMaterial({ map:flashTex, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, color:'#ffffff' }));
  flashSprite.scale.setScalar(0.5); flashSprite.position.set(0,0,0.65); flashSprite.visible=false;
  weapon.add(flashSprite);

  const view={
    group, hips, upper, torso, head, visor, visorGlow, armL, armR, elbowL, elbowR, legL, legR, kneeL, kneeR, weapon, flash, flashSprite, shadowBlob,
    animation:{}, charId:player.characterId, team:player.team, bodyYaw:0, phase:Math.random()*6,
    weaponId:null, weaponBaseZ:0.12, flashT:0, kick:0, prevFiring:false, ads:0, wasFlashed:false, drone, droneBaseY,
  };
  hips.traverse(o=>{ if (o.isMesh&&o.material?.emissive) o.userData.baseIntensity=o.material.emissiveIntensity; });
  attachWeapon(view, 'linecut');
  return view;
}

function attachWeapon(view, weaponId){
  const def=getWeapon(weaponId);
  view.weaponId=weaponId;
  view.magazine=null;
  for (const c of [...view.weapon.children]){
    if (c===view.flash||c===view.flashSprite) continue;
    view.weapon.remove(c);
    c.geometry?.dispose(); c.material?.dispose();
  }
  const w=view.weapon;
  const bodyColor=def.visual?.color||'#9eb0c2';
  const accentColor=def.visual?.accent||'#5cffd6';
  const bodyMat=new THREE.MeshStandardMaterial({ color:bodyColor, metalness:0.58, roughness:0.30 });
  const darkMat=new THREE.MeshStandardMaterial({ color:'#1a1f28', metalness:0.55, roughness:0.42 });
  const glowMat=new THREE.MeshStandardMaterial({ color:accentColor, emissive:accentColor, emissiveIntensity:def.visual?.glow?1.25:0.6, metalness:0.2, roughness:0.28 });

  if (def.visual?.blade){
    const blade=box(0.05,0.032,0.56,bodyMat); blade.position.z=0.30; blade.castShadow=true;
    const edge=box(0.056,0.014,0.54,glowMat); edge.position.set(0,0.022,0.30);
    const guard=box(0.08,0.10,0.034,darkMat); guard.position.z=0.03; guard.castShadow=true;
    const grip=box(0.052,0.13,0.052,darkMat); grip.position.z=-0.05;
    w.add(blade,edge,guard,grip);
    view.weaponBaseZ=0.06;
    if (view.flash){ view.flash.position.z=0.12+0.58; }
    if (view.flashSprite){ view.flashSprite.position.z=0.12+0.62; }
    return;
  }
  if (def.visual?.fist){
    const knuckle=box(0.12,0.12,0.13,bodyMat); knuckle.castShadow=true;
    const tip=box(0.055,0.055,0.055,glowMat); tip.position.z=0.09;
    w.add(knuckle,tip);
    view.weaponBaseZ=0.06;
    return;
  }

  const barrel=0.30 + (def.visual?.barrel||0.4)*0.75;
  const main=box(0.075,0.095,0.32,bodyMat); main.position.z=0.02; main.castShadow=true;
  const rail=box(0.048,0.022,0.28,darkMat); rail.position.set(0,0.058,0.0);
  const barrelMesh=box(0.048,0.048,barrel,darkMat); barrelMesh.position.set(0,0.006,0.18+barrel*0.5); barrelMesh.castShadow=true;
  const muzzle=box(0.058,0.058,0.038,bodyMat); muzzle.position.set(0,0.006,0.18+barrel+0.016);
  const grip=box(0.052,0.14,0.062,darkMat); grip.position.set(0,-0.11,0.0); grip.rotation.x=0.26;
  w.add(main,rail,barrelMesh,muzzle,grip);

  const mag=def.visual?.mag;
  if (mag==='drum'){
    const drum=new THREE.Mesh(new THREE.CylinderGeometry(0.075,0.075,0.11,14), bodyMat);
    drum.rotation.x=Math.PI/2; drum.position.set(0,-0.095,0.11); drum.castShadow=true;
    w.add(drum); view.magazine=drum; drum.userData.baseY=drum.position.y;
  } else if (mag==='cell'){
    const cell=box(0.064,0.095,0.13,glowMat); cell.position.set(0,-0.105,0.09); cell.castShadow=true;
    w.add(cell); view.magazine=cell; cell.userData.baseY=cell.position.y;
  } else if (mag==='straight'||mag===undefined){
    const magMesh=box(0.054,0.17,0.074,darkMat); magMesh.position.set(0,-0.125,0.08); magMesh.rotation.x=0.12; magMesh.castShadow=true;
    w.add(magMesh); view.magazine=magMesh; magMesh.userData.baseY=magMesh.position.y;
  }
  if (def.visual?.stock){
    const stock=box(0.054,0.095,0.18,darkMat); stock.position.set(0,-0.012,-0.22); stock.rotation.x=0.18; stock.castShadow=true;
    w.add(stock);
  }
  const optic=def.visual?.optic;
  if (optic==='holo'){
    const frame=box(0.064,0.054,0.11,darkMat); frame.position.set(0,0.09,0.02); frame.castShadow=true;
    const glass=box(0.038,0.022,0.064,glowMat); glass.position.set(0,0.09,0.02);
    w.add(frame,glass);
  } else if (optic==='scope'){
    const scope=new THREE.Mesh(new THREE.CylinderGeometry(0.038,0.038,0.16,14), darkMat);
    scope.rotation.x=Math.PI/2; scope.position.set(0,0.095,-0.02); scope.castShadow=true;
    const lens=box(0.022,0.022,0.012,glowMat); lens.position.set(0,0.095,0.065);
    w.add(scope,lens);
  } else {
    const postL=box(0.013,0.038,0.013,darkMat); postL.position.set(0.022,0.068,0.11);
    const postR=box(0.013,0.038,0.013,darkMat); postR.position.set(-0.022,0.068,0.11);
    w.add(postL,postR);
  }
  const stripe=box(0.016,0.016,0.26,glowMat); stripe.position.set(0.04,0.002,0.0);
  w.add(stripe);

  view.weaponBaseZ=0.06;
  if (view.flash) view.flash.position.z=0.18+barrel+0.07;
  if (view.flashSprite) view.flashSprite.position.z=0.18+barrel+0.09;
}

function dampAngle(current,target,speed,dt){
  const d=shortest(current,target);
  return current + d*(1-Math.exp(-speed*dt));
}
function shortest(a,b){
  let d=b-a; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2; return d;
}
