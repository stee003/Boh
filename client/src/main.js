import { bufferInput } from './input-buffer.js';
import { AudioBus } from './audio.js';
import { Input, defaultBindings } from './input.js';
import { Relay } from './net.js';
import {
  mountUI, refresh, showHUD, renderHUD, updateHUD, setBanner, toast,
  showPause, showScoreboard, showResults, showEditorTools,
} from './ui.js';
import { createI18n } from '@shared/strings.js';
import { createMatch, stepMatch, consumeEvents, summarize } from '@shared/sim/match.js';
import { emptyInput } from '@shared/sim/physics.js';
import { currentDef } from '@shared/sim/combat.js';
import { COMBAT_MAPS, MAPS, box } from '@shared/maps.js';
import { CHARACTERS, DRILL_NAMES, getCharacter } from '@shared/characters.js';
import { WEAPON_LIST, defaultLoadout, createWeaponState, getWeapon } from '@shared/weapons.js';
import { ATTACHMENTS, unlockedAttachments, rateMatch, rankFor, REPORT_REASONS } from '@shared/constants.js';
import { getMode, QUICK_CHAT } from '@shared/modes.js';
import {
  emptyProfile, challengesFor, computeRewards, applyRewards, evaluateAchievements,
  bumpChallenge, purchaseCosmetic, COSMETIC_SKINS, WEAPON_SKINS, EMOTES, BANNERS, KILL_EFFECTS,
} from '@shared/progression.js';

const PROFILE_KEY = 'vectorbreak.profile.v1';
const SETTINGS_KEY = 'vectorbreak.settings.v1';
const MAPS_KEY = 'vectorbreak.maps.v1';
const DT = 1 / 60;

const game = {
  screen: 'play',
  inMatch: false,
  localId: 'you',
  yaw: 0,
  pitch: 0,
  feed: [],
  chat: [],
  hitPulse: 0,
  damageDirs: [],
  prompt: '',
  fps: 0,
  catalog: buildCatalog(),
  leaders: [],
  lastConfig: null,
  replay: [],
};

const canvas = document.getElementById('view');
const audio = new AudioBus();
const input = new Input();
let view = null;
let teamPalette = fallbackPalette;
game.audio = audio;
game.input = input;
game.view = null;
game.viewReady = false;
game.webglError = null;
game.i18n = createI18n('en');
game.t = (k, v) => game.i18n.t(k, v);
game.settings = loadSettings();
applyTeamCss();
game.profile = loadProfile();
game.i18n.set(game.settings.lang || 'en');
input.setBindings(game.settings.bindings);
input.capture = false;
applyAudio();

game.net = new Relay(game);
game.net.token = game.profile.token;
game.refreshNet = () => { if (!game.inMatch) refresh(game); };
game.onRelay = onRelay;
game.onRelayFault = () => {
  game.fault = true;
  toast(game.t('error.unstable'));
  if (game.inMatch && game.relayLive) game.leaveMatch?.();
};

mountUI(document.getElementById('ui'), game);
renderHUD(game);
dismissBoot();
game.net.connect();
setInterval(() => game.net.pulse(), 2000);
game.graphicsReady = bootGraphics();

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', () => {
  audio.resume();
  if (game.inMatch && !game.paused && !game.editor) input.requestLock(canvas);
});
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === game.settings.bindings.pause) && !e.repeat && !game.rebindAction && game.inMatch && !game.editor && !game.resultsShown) {
    e.preventDefault();
    if (!game.paused) pause();
    else if (e.code !== 'Escape') game.resume();
  }
});

input.onLockChange = (locked) => {
  if (!locked && game.inMatch && !game.paused && !game.editor && !game.resultsShown) pause();
};
input.onFocusLost = () => {
  if (game.inMatch && !game.paused && !game.editor && !game.resultsShown) pause();
};
input.onLockError = () => {
  if (game.inMatch && !game.editor && !game.resultsShown) {
    pause();
    toast(game.t('controls.lock_error'));
  }
};

let acc = 0;
let last = performance.now();
let frames = 0;
let fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  fpsT += dt;
  if (fpsT >= 0.5) { game.fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  input.dragLook = !!game.editor;
  input.pollPad(game.settings);
  if (game.inMatch && !game.editor && !game.resultsShown && (input.padEdge('pause') || input.pressed('pause'))) {
    if (game.paused) game.resume(input.padEdge('pause')); else pause();
  }
  if (game.editor) tickEditor(dt);
  else if (game.replayMode) tickReplay(dt);
  else if (game.inMatch && game.relayLive) tickRelay(dt);
  else if (game.inMatch) tickLocal(dt);
  else tickMenu(dt);
  input.endFrame();
  view?.render?.();
}

function tickMenu(dt) {
  if (!view?.tickMenu) return;
  view.tickMenu(game.settings.reduceMotion ? 0 : dt);
  const id = game.activeCharacter();
  if (view.state.showcase?.charId !== id) view.setShowcase(id, getCharacter(id).visual?.accent);
}

function tickLocal(dt) {
  const match = game.match;
  if (!match) return;
  acc += dt;
  if (acc > DT * 4) acc = DT * 4; // drop backlog after a stall instead of burst-stepping (teleporting)
  const player = match.players.find((p) => p.id === game.localId);
  if (!player) return;
  if (!game.paused && !game.resultsShown) {
    const simInput = gatherInput(player, dt);
    game.pendingInput = bufferInput(game.pendingInput, simInput);
    let steps = 0;
    while (acc >= DT && steps < 4) {
      player.input = game.pendingInput || simInput;
      game.pendingInput = null;
      stepMatch(match, DT);
      acc -= DT;
      steps++;
      const me = match.players.find((p) => p.id === game.localId);
      if (me) {
        game.yaw = me.yaw;
        game.pitch = me.pitch;
        me.input.yaw = me.yaw;
        me.input.pitch = me.pitch;
        simInput.yaw = me.yaw;
        simInput.pitch = me.pitch;
      }
    }
    game.simAlpha = acc;
    if (match.tick % 6 === 0) pushReplay(match);
  } else {
    acc = 0;
    game.simAlpha = 0;
  }
  present(match, player, dt);
  if (match.phase === 'ended' && !game.resultsShown) finishLocal(match);
}

/**
 * Relay mode presents server snapshots (20 Hz). For our own character we
 * integrate the last known velocity at the render rate and gently converge on
 * each new snapshot — the character glides instead of stepping in 50 ms jumps,
 * while the server stays authoritative (large corrections, e.g. respawn, snap).
 */
function smoothLocalPlayer(raw, snap, dt) {
  if (game.replayMode || game.freeCam) return;
  let sm = game._localSmooth;
  if (!sm) {
    game._localSmooth = sm = {
      x: raw.x, y: raw.y, z: raw.z,
      vx: raw.vx || 0, vy: raw.vy || 0, vz: raw.vz || 0,
      correctedFor: snap.time, alive: !!raw.alive,
    };
    return;
  }
  if (raw.alive !== sm.alive) {
    // Spawn or death: adopt the server position immediately.
    sm.x = raw.x; sm.y = raw.y; sm.z = raw.z;
    sm.vx = raw.vx || 0; sm.vy = raw.vy || 0; sm.vz = raw.vz || 0;
    sm.alive = !!raw.alive;
    sm.correctedFor = snap.time;
  }
  sm.x += (raw.vx || 0) * dt;
  sm.y += (raw.vy || 0) * dt;
  sm.z += (raw.vz || 0) * dt;
  if (snap.time > sm.correctedFor + 1e-6) {
    const dts = Math.min(0.3, Math.max(0, snap.time - sm.correctedFor));
    // Where the server should place us, trapezoid between the old and new velocity.
    const ex = sm.x + ((sm.vx + (raw.vx || 0)) * 0.5) * dts;
    const ey = sm.y + ((sm.vy + (raw.vy || 0)) * 0.5) * dts;
    const ez = sm.z + ((sm.vz + (raw.vz || 0)) * 0.5) * dts;
    const eX = raw.x - ex, eY = raw.y - ey, eZ = raw.z - ez;
    if (Math.hypot(eX, eZ) > 3 || Math.abs(eY) > 1.5) {
      sm.x = raw.x; sm.y = raw.y; sm.z = raw.z; // teleport-class correction
    } else {
      sm.x += eX * 0.45;
      sm.y += eY * 0.45;
      sm.z += eZ * 0.45;
    }
    sm.correctedFor = snap.time;
  }
  sm.vx = raw.vx || 0; sm.vy = raw.vy || 0; sm.vz = raw.vz || 0;
  raw.x = sm.x; raw.y = sm.y; raw.z = sm.z;
}

function tickRelay(dt) {
  const snap = game.snap;
  if (!snap) return;
  const raw = (snap.players || []).find((p) => p.id === game.localId);
  if (!raw) return;
  if (!game.paused && !game.replayMode && !game.freeCam) smoothLocalPlayer(raw, snap, dt);
  const look = { ...raw, yaw: game.yaw, pitch: game.pitch };
  if (!game.paused && !game.resultsShown) {
    const simInput = gatherInput(look, dt);
    const kick = shortest(game.yaw, raw.yaw ?? game.yaw);
    if (Math.abs(kick) < 0.4) game.yaw += kick * 0.35;
    look.yaw = game.yaw;
    look.pitch = game.pitch;
    simInput.yaw = game.yaw;
    simInput.pitch = game.pitch;
    game.pendingInput = bufferInput(game.pendingInput, simInput);
    const nowMs = performance.now();
    if (nowMs >= (game._nextInput || 0)) {
      game._nextInput = nowMs + 32;
      game.net.send({ type: 'input', t: Date.now(), input: game.pendingInput, ping: game.net.ping || 0 });
      game.pendingInput = null;
    }
  }
  presentSnap(snap, look, dt);
}

function present(match, player, dt) {
  player.weaponId = currentDef(player).id;
  const solids = match._solidCache || match.map.boxes;
  paintWorld(match, player, game.paused ? 0 : dt, solids);
  handleEvents(match, player, consumeEvents(match));
  hudCommon(player, match, dt);
}

function presentSnap(snap, player, dt) {
  paintPlayers(snap.players || [], player, dt);
  const fake = { map: game.matchMap, boxes: game.matchMap?.boxes || [], _solidCache: game.matchMap?.boxes };
  if (game.freeCam) view.frameFree(game.freePos, game.yaw, game.pitch);
  else view.frameCamera(player, fake._solidCache, dt, camExtras(player));
  for (const ev of snap.events || []) handleOne(ev, player, null);
  snap.events = []; // A 20 Hz snapshot must not replay its effects every render frame.
  hudCommon(player, snap, dt);
  view.tickFx(dt);
  view.syncWorld({
    modeId: snap.modeId,
    objectives: snap.objectives,
    deployables: snap.deployables,
    cores: snap.cores,
    projectiles: snap.projectiles,
  });
}

function displayPose(p, alpha) {
  if (!p || !alpha || !p.alive || (p.vaultT || 0) > 0) return p;
  return {
    ...p,
    x: p.x + (p.vx || 0) * alpha,
    y: p.y + (p.vy || 0) * alpha,
    z: p.z + (p.vz || 0) * alpha,
  };
}

function paintWorld(match, player, dt, solids) {
  const alpha = game.relayLive ? 0 : (game.simAlpha || 0);
  const ids = new Set();
  for (const p of match.players) {
    if (p.isDecoy && !p.alive) continue;
    ids.add(p.id);
    const hide = p.id === game.localId && game.freeCam;
    const shown = displayPose(p, alpha);
    view.updateActor(shown, dt, { localId: game.localId, weaponId: p.weaponId || currentDef(p).id, hide, emote: game.emoteT > 0 && p.id === game.localId });
  }
  view.dropMissing(ids);
  view.syncBoxes(match.map);
  if (game.freeCam) view.frameFree(game.freePos, game.yaw, game.pitch);
  else if (!player.alive && game.spectateId) {
    const spec = match.players.find((p) => p.id === game.spectateId && p.alive) || player;
    view.frameCamera(displayPose(spec, alpha), solids, dt, camExtras(spec));
  } else view.frameCamera(displayPose(player, alpha), solids, dt, camExtras(player));
  view.tickFx(dt);
  view.syncWorld(worldExtras(match));
  view.minimap(document.getElementById('minimap'), match.map, match.players, player);
}

function paintPlayers(players, player, dt) {
  const ids = new Set();
  for (const p of players) {
    ids.add(p.id);
    view.updateActor(p, dt, { localId: game.localId, weaponId: p.weaponId, hide: false });
  }
  view.dropMissing(ids);
  view.minimap(document.getElementById('minimap'), game.matchMap, players, player);
}

function camExtras(player) {
  const def = getWeapon(player.weaponId || 'linecut');
  return {
    baseFov: game.settings.fov || 74,
    zoom: player.aiming ? (def.zoom || 1.12) : 1,
    reduce: game.settings.reduceMotion || game.settings.screenShake === false,
    shake: 0,
  };
}

function hudCommon(player, match, dt) {
  game.hitPulse = Math.max(0, game.hitPulse - dt);
  game.floaters = (game.floaters || []).map((f) => ({ ...f, age: f.age + dt, y: f.y + dt * 0.85, life: f.life - dt })).filter((f) => f.life > 0);
  game.emoteT = Math.max(0, (game.emoteT || 0) - dt);
  if (game.abilityPulse) game.abilityPulse.life -= dt;
  game.damageDirs = (game.damageDirs || []).map((d) => ({ ...d, life: d.life - dt })).filter((d) => d.life > 0);
  updatePrompt(player, match);
  if (!game.lookHint && game.inMatch && !game.editor && !game.paused) {
    if (Math.abs(game.yaw) > 0.2 || Math.abs(game.pitch) > 0.12) game.lookHint = true;
    else if (!game.prompt && (match?.time || 0) > 1.2 && (match?.time || 0) < 12) game.prompt = game.t('tut.look');
  }
  updateTutorial(player);
  updateHUD(game, player, match);
  if (input.held('scoreboard')) showScoreboard(game, match.players ? match : game.match, true);
  else showScoreboard(game, null, false);
  if (game.chatOpen && !input.held('chat')) game.chatOpen = false;
  footsteps(player, dt);
}

function gatherInput(player, dt = DT) {
  const s = game.settings;
  const pad = input.pad;
  let mx = 0;
  let my = 0;
  if (input.held('forward')) my = 1;
  if (input.held('back')) my -= 1;
  if (input.held('right')) mx += 1;
  if (input.held('left')) mx -= 1;
  // Only a *connected* pad contributes axes; stale values from a dropped pad must not move the character.
  if (pad.active) {
    mx += pad.moveX || 0;
    my += pad.moveY || 0;
  }
  const wheel = input.mouse.wheel;
  game._wheel = wheel;
  const look = input.consumeLook();
  const ads = player.aiming ? (s.adsSens || 0.7) : 1;
  const sens = (s.sens || 1.1) * 0.0022 * ads;
  const invert = s.invertY ? -1 : 1;
  game.yaw += look.x * sens;
  game.pitch -= look.y * sens * invert;
  // Keyboard look is capped to a sane rate (a held arrow should turn, not spin).
  const keyLook = 2.4 * dt;
  if (input.held('lookLeft')) game.yaw -= keyLook;
  if (input.held('lookRight')) game.yaw += keyLook;
  if (input.held('lookUp')) game.pitch += keyLook * 0.82 * invert;
  if (input.held('lookDown')) game.pitch -= keyLook * 0.82 * invert;
  if (pad.active) {
    game.yaw += pad.lookX * dt * 60;
    game.pitch -= pad.lookY * invert * dt * 60;
    if (s.aimAssist !== false) aimAssist(player);
  }
  game.pitch = Math.max(-1.2, Math.min(1.15, game.pitch));
  if (game.freeCam) {
    const speed = input.held('sprint') ? 18 : 8;
    const cp = Math.cos(game.pitch);
    const fx = Math.sin(game.yaw) * cp;
    const fz = -Math.cos(game.yaw) * cp;
    const rx = Math.cos(game.yaw);
    const rz = Math.sin(game.yaw);
    game.freePos.x += (fx * my + rx * mx) * speed * (1 / 60);
    game.freePos.y += (Math.sin(game.pitch) * my + (input.held('jump') ? 1 : 0) - (input.held('crouch') ? 1 : 0)) * speed * (1 / 60);
    game.freePos.z += (fz * my + rz * mx) * speed * (1 / 60);
  }
  let crouch = input.held('crouch') || input.padDown('crouch');
  if (s.toggleCrouch && (edge('crouch') || input.padEdge('crouch'))) game.crouchOn = !game.crouchOn;
  if (s.toggleCrouch) crouch = game.crouchOn;
  let aim = input.held('aim') || input.padDown('aim');
  if (!s.holdAim && (edge('aim') || input.padEdge('aim'))) game.aimOn = !game.aimOn;
  if (!s.holdAim) aim = !!game.aimOn;
  const slot = edgeSlot();
  game._wheel = 0;
  if (slot >= 0) game.slot = slot;
  const chat = edge('chat');
  if (chat) game.chatOpen = !game.chatOpen;
  return {
    ...emptyInput(),
    moveX: clamp(mx, -1, 1),
    moveY: clamp(my, -1, 1),
    yaw: game.yaw,
    pitch: game.pitch,
    jump: input.held('jump') || input.padDown('jump'),
    crouch,
    sprint: input.held('sprint') || input.padDown('sprint') || !!s.autoSprint,
    fire: input.held('fire') || input.pressed('fire') || input.padDown('fire'),
    aim,
    reload: edge('reload') || input.padEdge('reload'),
    melee: edge('melee') || input.padEdge('melee'),
    dodge: edge('dodge') || input.padEdge('dodge'),
    tactical: edge('tactical') || input.padEdge('tactical'),
    ultimate: edge('ultimate') || input.padEdge('ultimate'),
    interact: edge('interact'),
    drop: edge('drop'),
    shoulderTap: edge('shoulder') || input.padEdge('shoulder'),
    weaponSlot: slot,
  };
}

function edge(action) { return input.pressed(action); }
function edgeSlot() {
  if (pressed('slot1')) return 0;
  if (pressed('slot2')) return 1;
  if (pressed('slot3')) return 2;
  // Wheel is snapshotted before consumeLook() zeroes it, so scroll-to-swap works.
  const w = game._wheel ?? 0;
  const cur = game.match?.players?.find((p) => p.id === game.localId)?.weaponSlot ?? game.slot ?? 0;
  if (w > 0) return (cur + 1) % 3;
  if (w < 0) return (cur + 2) % 3;
  return -1;
}
function pressed(action) { return input.pressed(action); }

function aimAssist(player) {
  const list = (game.match?.players || game.snap?.players || []).filter((p) => p.alive && p.id !== player.id && p.team !== player.team);
  let best = null;
  let bestA = 0.16;
  for (const e of list) {
    const yaw = Math.atan2(e.x - player.x, -(e.z - player.z));
    const flat = Math.hypot(e.x - player.x, e.z - player.z) || 1;
    const pitch = Math.atan2((e.y + 1.1) - (player.y + 1.4), flat);
    const dy = Math.abs(shortest(game.yaw, yaw));
    const dp = Math.abs(game.pitch - pitch);
    const a = Math.hypot(dy, dp);
    if (a < bestA && flat < 28) { bestA = a; best = { yaw, pitch }; }
  }
  if (!best) return;
  game.yaw += shortest(game.yaw, best.yaw) * 0.08;
  game.pitch += (best.pitch - game.pitch) * 0.08;
}

function handleEvents(match, player, events) {
  for (const ev of events) handleOne(ev, player, match);
}
function handleOne(ev, player, match) {
  if (ev.type === 'shot') {
    const self = ev.playerId === game.localId;
    audio.weapon(ev.sound || 'ar', !self);
    view.shot(ev.playerId);
    if (self && !game.settings.reduceMotion && game.settings.screenShake) view.state.fovKick += 1.5;
  } else if (ev.type === 'tracer' && ev.origin && ev.point) {
    const from = [ev.origin.x, ev.origin.y, ev.origin.z];
    const to = [ev.point.x, ev.point.y, ev.point.z];
    view.tracer(from, to, ev.team === 'b' ? '#ff8a6a' : '#d8fff4');
  } else if (ev.type === 'impact' && ev.point) {
    view.impact([ev.point.x, ev.point.y, ev.point.z], [0, 1, 0], '#ffb03a');
  } else if (ev.type === 'hit' && ev.attackerId === game.localId && !ev.friendly) {
    game.hitPulse = 0.28;
    game.hitHead = ev.zone === 'head';
    game.hitSeq = (game.hitSeq || 0) + 1;
    audio.play(ev.zone === 'head' ? 'head' : 'hit');
    if (ev.point && !game.settings.reduceFx) {
      view.impact([ev.point.x, ev.point.y, ev.point.z], [0, 1, 0], ev.zone === 'head' ? '#ffb03a' : '#ffffff');
    }
    if (game.settings.damageNumbers !== false && ev.amount) floatDamage(ev);
  } else if (ev.type === 'hit' && ev.victimId === game.localId && ev.point && player) {
    const ang = Math.atan2(ev.point.x - player.x, ev.point.z - player.z) - player.yaw;
    game.damageDirs.push({ ang, life: 0.7 });
    if (game.settings.screenShake !== false) view.state.shake += game.settings.reduceMotion ? 0.02 : 0.08;
    audio.play('hit', { gain: 0.04 });
  } else if (ev.type === 'kill') {
    const killerP = playerOf(ev.killerId, match);
    const victimP = playerOf(ev.victimId, match);
    const w = WEAPON_LIST.find((x) => x.id === ev.weaponId);
    game.feed.push({
      killer: killerP?.name || '',
      victim: victimP?.name || '',
      killerTeam: killerP?.team || '',
      victimTeam: victimP?.team || '',
      weapon: w ? game.t(w.nameKey) : '',
      headshot: ev.zone === 'head',
      you: ev.killerId === game.localId || ev.victimId === game.localId,
    });
    if (game.feed.length > 6) game.feed.shift();
    if (ev.killerId === game.localId && ev.point) {
      const fx = game.profile.equipped?.killEffect || 'shard';
      if (fx === 'ring') view.ring(ev.point.x, ev.point.y, ev.point.z, '#ffb03a', 0.5);
      else view.impact([ev.point.x, ev.point.y + 1, ev.point.z], [0, 1, 0], '#5cffd6');
    }
    if (ev.victimId === game.localId) {
      game.spectateId = ev.killerId;
      setBanner(game.t('hud.killed_by') + ' ' + (killerP?.name || ''), 1200);
    }
  } else if (ev.type === 'announce') {
    setBanner(game.t(ev.key), 1400);
    if (ev.key === 'announce.go') audio.play('go');
  } else if (ev.type === 'explode' && ev.point) {
    audio.play('explode');
    view.ring(ev.point.x, ev.point.y, ev.point.z, '#ff5a3c', 0.4);
    view.state.shake += 0.12;
  } else if (ev.type === 'reload_start' && ev.playerId === game.localId) audio.play('reload');
  else if (ev.type === 'dry' && ev.playerId === game.localId) audio.play('empty');
  else if (ev.type === 'melee' && ev.playerId === game.localId) audio.play('melee');
  else if (ev.type === 'ability' || ev.type === 'ultimate') {
    const kind = ev.type === 'ultimate' ? 'ultimate' : 'tactical';
    const caster = playerOf(ev.playerId, match) || { id: ev.playerId, x: ev.x, y: ev.y, z: ev.z };
    view.abilityFx(caster, ev.ability, kind);
    if (ev.playerId === game.localId) {
      audio.play('ability');
      game.abilityPulse = { kind, ability: ev.ability, life: kind === 'ultimate' ? 0.9 : 0.62, seq: (game.abilityPulse?.seq || 0) + 1 };
      const ch = CHARACTERS.find((c) => c.id === player?.characterId);
      const key = kind === 'ultimate' ? ch?.ultimateKey : ch?.tacticalKey;
      if (key) setBanner(String(game.t(key)).split(':')[0], 850);
    }
  } else if (ev.type === 'blink') {
    const target = playerOf(ev.playerId, match) || { id: ev.playerId, x: ev.x, y: 0, z: ev.z };
    view.abilityFx(target, 'blink', 'tactical');
  } else if (ev.type === 'pad' && ev.playerId === game.localId) {
    const w = getWeapon(ev.weaponId);
    toast(game.t(w.nameKey));
  }
}

function floatDamage(ev) {
  if (!ev.point || game.settings.reduceFx) return;
  game.floaters = game.floaters || [];
  game.floaters.push({
    x: ev.point.x, y: ev.point.y + 0.2, z: ev.point.z,
    amount: ev.amount,
    head: ev.zone === 'head',
    life: 0.72,
    age: 0,
  });
  if (game.floaters.length > 12) game.floaters.shift();
}

function playerOf(id, match) {
  return (match?.players || game.snap?.players || []).find((p) => p.id === id) || null;
}

function nameOf(id, match) {
  return playerOf(id, match)?.name || '';
}

function applyTeamCss() {
  const pal = teamPalette(game.settings?.colorblind);
  const root = document.documentElement;
  if (pal?.a) root.style.setProperty('--a', pal.a);
  if (pal?.b) root.style.setProperty('--b', pal.b);
}

function footsteps(player, dt) {
  if (!player?.alive || !player.onGround) return;
  const speed = Math.hypot(player.vx || 0, player.vz || 0);
  if (speed < 1.2) return;
  game.stepAcc = (game.stepAcc || 0) + speed * dt;
  const stride = player.sliding ? 3.2 : player.crouch ? 1.15 : speed > 8 ? 2.35 : 1.7;
  if (game.stepAcc >= stride) {
    game.stepAcc = 0;
    const quiet = (player.characterId === 'nyx' ? 0.4 : 1) * (player.crouch ? 0.45 : 1);
    audio.footstep(player.groundMat || 'concrete', speed, 0, quiet);
  }
}

function updatePrompt(player, match) {
  game.prompt = '';
  if (!player?.alive || !match?.map) return;
  for (const pad of match.map.pads || []) {
    if (Math.hypot(player.x - pad.x, player.z - pad.z) < 1.8) {
      const w = getWeapon(pad.weaponId);
      game.prompt = `${game.t('hud.interact')} · ${game.t(w.nameKey)}`;
    }
  }
  if (game.tutorialStep != null) game.prompt = game.t(TUT[game.tutorialStep] || 'tut.done');
}

const TUT = ['tut.move', 'tut.look', 'tut.sprint', 'tut.jump', 'tut.slide', 'tut.shoot', 'tut.aim', 'tut.reload', 'tut.switch', 'tut.ability', 'tut.obj', 'tut.done'];
function updateTutorial(player) {
  if (game.tutorialStep == null || !player) return;
  const s = game.tutorialStep;
  const movedLook = Math.abs(game.yaw - (game.tutYaw || 0)) > 0.3;
  const tests = [
    () => player.distance > 4,
    () => movedLook,
    () => player.sprinting || player.distance > 18,
    () => (player.jumps || 0) > 0,
    () => (player.slides || 0) > 0,
    () => (player.shots || 0) > 0,
    () => player.aiming && (player.hits || 0) > 0,
    () => player.reloading || (player.shots || 0) > 8,
    () => (player.weaponSlot || 0) !== 0,
    () => (player.tacticalCd || 0) > 0,
    () => Math.hypot(player.x, player.z + 4) < 2.4,
    () => false,
  ];
  if (tests[s]?.()) {
    game.tutorialStep++;
    if (game.tutorialStep >= TUT.length - 1) {
      game.profile.stats.tutorialDone = true;
      setBanner(game.t('tut.done'), 2400);
      game.tutorialStep = null;
      saveProfile();
    }
  }
}

function markers(match) {
  /* objective ownership is readable on the score bar and minimap */
  void match;
}

function finishLocal(match) {
  game.resultsShown = true;
  input.capture = false;
  input.reset();
  input.exitLock();
  const summary = summarize(match);
  const row = summary.players.find((p) => p.id === game.localId);
  if (!row || game.rewarded) {
    showResults(game, summary);
    return;
  }
  game.rewarded = true;
  const win = summary.winnerId === row.id || (summary.winnerTeam && row.team === summary.winnerTeam);
  if (summary.ranked && !game.fault) {
    const before = rankFor(game.profile.rank.rating || 0).id;
    const rated = rateMatch({
      rating: game.profile.rank.rating || 0,
      oppRating: 1000,
      win: !!win,
      matches: game.profile.rank.matches || 0,
      contribution: 1,
    });
    game.profile.rank.rating = rated.next;
    game.profile.rank.matches = (game.profile.rank.matches || 0) + 1;
    game.profile.rank.placementsLeft = Math.max(0, (game.profile.rank.placementsLeft ?? 5) - 1);
    game.profile.rank.peak = Math.max(game.profile.rank.peak || 0, rated.next);
    game._rankedUp = rankFor(rated.next).id !== before;
    toast(game.t('rank.local_warn'));
  }
  absorbSummary(summary, row, win);
  showResults(game, summary);
  input.exitLock();
  saveProfile();
  pushLeader();
}

function absorbSummary(summary, row, win, preset) {
  const rewards = preset || computeRewards(summary, row.id);
  if (!preset && (summary.modeId === 'practice' || summary.modeId === 'tutorial')) {
    rewards.xp = Math.round(rewards.xp * 0.35);
    rewards.credits = Math.round(rewards.credits * 0.35);
  }
  applyRewards(game.profile, rewards);
  row.xp = rewards.xp;
  row.credits = rewards.credits;
  const s = game.profile.stats;
  s.kills += row.kills || 0;
  s.deaths += row.deaths || 0;
  s.assists += row.assists || 0;
  s.matches += 1;
  s.shots += row.shots || 0;
  s.hits += row.hits || 0;
  s.headshots += row.headshots || 0;
  s.damage += row.damage || 0;
  s.objectiveScore += row.objectiveScore || 0;
  s.slides += row.slides || 0;
  s.slideJumps += row.slideJumps || 0;
  s.vaults += row.vaults || 0;
  s.captures += row.captures || 0;
  s.coresStolen += row.coresStolen || 0;
  s.coresReturned += row.coresReturned || 0;
  s.glassBreaks += row.glassBreaks || 0;
  s.mapPlays[summary.mapId] = (s.mapPlays[summary.mapId] || 0) + 1;
  s.characterPlays[row.characterId] = (s.characterPlays[row.characterId] || 0) + 1;
  s.weaponKills = s.weaponKills || {};
  for (const [id, n] of Object.entries(row.weaponKills || {})) s.weaponKills[id] = (s.weaponKills[id] || 0) + n;
  if (win) s.wins += 1;
  if (summary.modeId === 'practice' || summary.modeId === 'tutorial') s.practiceTime += summary.duration || 0;
  bumpChallenge(game.profile, 'kills', row.kills || 0);
  bumpChallenge(game.profile, 'headshots', row.headshots || 0);
  bumpChallenge(game.profile, 'captures', row.captures || 0);
  bumpChallenge(game.profile, 'wins', win ? 1 : 0);
  bumpChallenge(game.profile, 'damage', row.damage || 0);
  bumpChallenge(game.profile, 'slideKills', row.slideKills || 0);
  bumpChallenge(game.profile, 'objectiveScore', row.objectiveScore || 0);
  const ev = {
    win, matchKills: row.matchKills, matchHeadshots: row.matchHeadshots, matchAssists: row.matchAssists,
    matchDeaths: row.matchDeaths, clutchKills: row.clutchKills, revenges: row.revenges, bestMulti: row.bestMulti,
    ultKills: row.ultKills, meleeKills: row.meleeKills, longShots: row.longShots, pointBlank: row.pointBlank,
    slideKills: row.slideKills, matchWallKicks: row.wallKicks, matchAir: row.airTime, matchDodges: row.dodges,
    matchDistance: row.distance, longSlide: row.longSlide, holdTime: row.holdTime, defenseKills: row.defenseKills,
    experimentalKills: row.experimentalKills, pistolKills: row.pistolKills, lmgDamage: row.lmgDamage, oneMag: row.oneMag,
    gunGameWin: row.gunGameWin, lastAliveWin: row.lastAliveWin, flawlessRound: row.flawlessRound,
    topObjective: summary.topObjective === row.id,
    tripleHold: summary.tripleHold && summary.tripleHold === row.team,
    comeback: !!summary.comeback && summary.winnerTeam === row.team,
    rankedUp: !!game._rankedUp,
  };
  game.lastUnlocks = evaluateAchievements(game.profile, ev);
  if (game.lastUnlocks.length) toast(game.t('announce.achievement'));
}

async function startMatch(config) {
  if (game.starting) return;
  game.starting = true;
  audio.resume();
  game.lastConfig = config;
  game.resultsShown = false;
  game.rewarded = false;
  game.fault = false;
  game.paused = false;
  game.freeCam = false;
  game.lookHint = false;
  game.replay = [];
  game.feed = [];
  game.tutorialStep = config.tutorial ? 0 : null;
  game.tutYaw = game.yaw;
  try {
  if (!game.viewReady) toast(game.t('meta.loading'));
  if (!(await ensureGraphics())) {
    toast(game.t('meta.webgl'));
    return;
  }
  if (config.relay && game.net.online) {
    const ok = game.net.send({
      type: 'queue',
      modeId: config.modeId,
      mapId: config.mapId,
      team: config.team || 'a',
      difficulty: config.difficulty || 'normal',
      rules: sanitizeRules(config.rules),
      loadout: currentLoadout(),
      name: game.profile.name,
      code: config.code || '',
    });
    if (ok) {
      setBanner(game.t('play.search'), 2000);
      return;
    }
  }
  if (config.relay && !game.net.online) toast(game.t('error.server_down'));
  setBanner(game.t('meta.loading'));
  await new Promise((r) => requestAnimationFrame(r));
  const match = createMatch({
    modeId: config.modeId,
    mapId: config.mapId,
    map: config.map,
    seed: config.seed || (Date.now() % 100000) + 1,
    rules: config.rules,
    players: config.players,
    recordHistory: false,
  });
  enterMatch(match, false);
  } finally {
    game.starting = false;
  }
}

function enterMatch(match, relay) {
  game.match = match;
  game.inMatch = true;
  game.relayLive = relay;
  game.matchMap = match.map;
  game._localSmooth = null;
  if (view.state.menuRig) {
    view.scene.remove(view.state.menuRig);
    view.state.menuRig = null;
  }
  if (view.state.showcase) {
    view.scene.remove(view.state.showcase.group);
    view.state.showcase = null;
  }
  view.state.actors.clear();
  view.buildMap(match.map);
  view.state.palette = teamPalette(game.settings.colorblind);
  applyTeamCss();
  const me = match.players.find((p) => p.id === game.localId) || match.players[0];
  game.localId = me?.id || 'you';
  game.yaw = me?.yaw || 0;
  game.pitch = 0;
  game.freePos = { x: me?.x || 0, y: (me?.y || 0) + 3, z: me?.z || 0 };
  showHUD(true);
  renderHUD(game);
  input.reset();
  game.pendingInput = null;
  input.capture = true;
  game.paused = false;
  document.getElementById('overlays').innerHTML = '';
  setBanner(match.phase === 'countdown' ? '3' : game.t('announce.go'), 900);
  input.requestLock(canvas);
}

function pause() {
  game.paused = true;
  input.capture = false;
  input.reset();
  game.pendingInput = null;
  game.aimOn = false;
  if (game.relayLive) game.net.send({ type: 'input', input: { ...emptyInput(), yaw: game.yaw, pitch: game.pitch } });
  input.exitLock();
  showPause(game, true);
}
game.resume = (controller = false) => {
  input.reset();
  input.rebind = null;
  game.rebindAction = null;
  game.pendingInput = null;
  input.capture = true;
  game.paused = false;
  showPause(game, false);
  if (game.inMatch) {
    showHUD(true);
    if (!controller) input.requestLock(canvas);
  }
};
game.leaveMatch = () => {
  if (!game.relayLive && game.match?.rules?.ranked && game.match.phase === 'live' && !game.fault) noteAbandon();
  if (game.relayLive) game.net.send({ type: 'leave' });
  game.inMatch = false;
  game.relayLive = false;
  game.paused = false;
  game.editor = null;
  game.replayMode = false;
  game.match = null;
  // Clear per-match control state so a toggled crouch/aim never carries into the next match.
  game.crouchOn = false;
  game.aimOn = false;
  game.slot = 0;
  game.spectateId = null;
  game.chatOpen = false;
  game._localSmooth = null;
  input.capture = false;
  input.exitLock();
  input.reset();
  input.rebind = null;
  game.rebindAction = null;
  game.pendingInput = null;
  showHUD(false);
  document.getElementById('overlays').innerHTML = '';
  bootMenu();
  refresh(game);
};
game.playAgain = () => {
  const cfg = game.lastConfig;
  game.leaveMatch();
  if (cfg) startMatch(cfg);
};
game.toggleFreeCam = () => {
  game.freeCam = !game.freeCam;
  if (game.freeCam) game.profile.stats.spectateTime = (game.profile.stats.spectateTime || 0) + 1;
  game.resume();
};

function noteAbandon() {
  const now = Date.now();
  const rank = game.profile.rank;
  rank.abandons = (rank.abandons || []).filter((t) => now - t < 3600000);
  rank.abandons.push(now);
  if (rank.abandons.length >= 3) rank.banUntil = now + 10 * 60 * 1000;
  saveProfile();
}
game.rankedLockLeft = () => {
  const until = game.profile.rank?.banUntil || 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
};

function bootMenu() {
  if (!view?.menuStage) return;
  view.menuStage();
  view.setShowcase(game.activeCharacter(), getCharacter(game.activeCharacter()).visual?.accent);
  showHUD(false);
}

game.go = (id) => {
  if (id === 'exit') return game.exit();
  if (game.inMatch && id !== 'settings') return;
  game.screen = id;
  if (id === 'leaders') game.loadBoard();
  if (game.inMatch) {
    if (!game.paused) pause();
    showPause(game, false);
    showHUD(false);
  }
  refresh(game);
};
game.setLang = (lang) => {
  game.i18n.set(lang);
  game.settings.lang = game.i18n.lang;
  saveSettings();
  const box = document.getElementById('chatbox');
  if (box) delete box.dataset.built;
  refresh(game);
  toast(game.i18n.lang === 'it' ? game.t('menu.italian') : game.t('menu.english'));
};
game.exit = () => toast(game.t('menu.exit_hint'));
game.play = () => {
  const d = game.draft;
  const mode = getMode(d.modeId);
  const mapId = d.mapId === 'random' ? COMBAT_MAPS[Math.floor(Math.random() * COMBAT_MAPS.length)].id : d.mapId;
  startMatch({
    modeId: mode.id,
    mapId,
    team: d.team,
    difficulty: d.difficulty,
    relay: !!d.relay,
    players: fillPlayers(mode, d.team, d.fill === 'empty' ? 0 : (mode.fill || 8) - 1, d.difficulty),
  });
};
game.playRanked = () => {
  if (game.rankedLockLeft() > 0) return toast(game.t('rank.locked', { n: game.rankedLockLeft() }));
  const mode = getMode('ranked_circuit');
  const mapId = COMBAT_MAPS[Math.floor(Math.random() * COMBAT_MAPS.length)].id;
  startMatch({
    modeId: 'ranked_circuit',
    mapId,
    relay: game.net.online,
    rules: { ranked: true, botDifficulty: 'hard' },
    players: fillPlayers(mode, 'a', 7, 'hard'),
  });
};
game.playDrill = (diff) => {
  const load = currentLoadout();
  const players = [{
    id: 'you', name: game.profile.name, team: 'a',
    characterId: load.characterId, loadout: clone(load), isBot: false,
  }];
  for (let i = 0; i < 4; i++) {
    players.push({
      id: `bot${i}`,
      name: DRILL_NAMES[i % DRILL_NAMES.length],
      team: 'b',
      isBot: true,
      botDifficulty: diff || 'normal',
      characterId: CHARACTERS[(i + 3) % CHARACTERS.length].id,
    });
  }
  startMatch({
    modeId: 'team_fracture',
    mapId: 'neon_district',
    difficulty: diff,
    rules: { timeLimit: 180, scoreLimit: 20, botDifficulty: diff || 'normal' },
    players,
  });
};
game.playTutorial = () => startMatch({ modeId: 'tutorial', mapId: 'calibration_bay', tutorial: true, players: [{ id: 'you', name: game.profile.name, team: 'a', characterId: currentLoadout().characterId, loadout: currentLoadout() }] });
game.playRange = () => startMatch({ modeId: 'practice', mapId: 'calibration_bay', players: [{ id: 'you', name: game.profile.name, team: 'a', characterId: currentLoadout().characterId, loadout: currentLoadout() }] });
game.hostCustom = () => {
  const s = game.settings;
  const mode = getMode(game.draft.modeId || 'team_fracture');
  let code = (s.roomCode || '').trim().toUpperCase();
  if (game.net.online && !code) {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
    s.roomCode = code;
    saveSettings();
    toast(game.t('custom.hosted', { code }));
  }
  startMatch({
    modeId: mode.id,
    mapId: game.draft.mapId === 'random' ? 'neon_district' : game.draft.mapId,
    relay: game.net.online,
    code,
    team: 'a',
    rules: {
      timeLimit: (Number(s.customMinutes) || 8) * 60,
      scoreLimit: Number(s.customScore) || 100,
      friendlyFire: !!s.customFriendly,
      regenRate: s.customRegen === false ? 0 : undefined,
      regenDelay: s.customRegen === false ? 99 : undefined,
      health: Number(s.customHealth) || 100,
      respawn: Number(s.customRespawn ?? 3),
    },
    players: fillPlayers(mode, 'a', (mode.fill || 8) - 1, 'normal'),
  });
};
game.joinCustom = () => {
  const code = (game.settings.roomCode || '').trim().toUpperCase();
  if (!code || !game.net.send({ type: 'join', code, name: game.profile.name, loadout: currentLoadout() })) toast(game.t('error.server_down'));
};
game.joinRoom = (id) => {
  if (!id || !game.net.send({ type: 'join', id, name: game.profile.name, loadout: currentLoadout() })) toast(game.t('error.server_down'));
};
game.loadBoard = async () => {
  game.leaders = localBoard(game.draft.board);
  try {
    const res = await fetch(`/api/leaderboard?board=${encodeURIComponent(game.draft.board || 'rating')}`);
    if (res.ok) {
      const rows = await res.json();
      game.serverBoard = Array.isArray(rows) ? rows : [];
      game.leaders = localBoard(game.draft.board);
      if (game.screen === 'leaders' && !game.inMatch) refresh(game);
    }
  } catch { /* local board still shows */ }
};
game.pickCharacter = (id) => {
  const load = currentLoadout();
  load.characterId = id;
  saveProfile();
  view?.setShowcase?.(id, getCharacter(id).visual?.accent);
  refresh(game);
};
game.activeCharacter = () => currentLoadout().characterId || 'ryn';
game.inspectWeapon = (id) => { game.inspectId = id; refresh(game); };
game.pickKit = (i) => { game.profile.activeLoadout = i; saveProfile(); refresh(game); };
game.equipWeapon = (slot, id) => {
  const load = currentLoadout();
  const prev = load[slot]?.attachments || [];
  load[slot] = createWeaponState(id, prev.filter((a) => getWeapon(id).attachments?.includes(ATTACHMENTS[a]?.slot)));
  saveProfile();
  refresh(game);
};
game.cycleAttach = (slot, kind) => {
  const load = currentLoadout();
  const state = load[slot];
  if (!state) return;
  const weaponXp = game.profile.weaponXp?.[state.defId] || 0;
  const unlocked = unlockedAttachments(weaponXp);
  if (!unlocked.slots.includes(kind) && !unlocked.all) {
    toast(game.t('attach.locked', { n: kind === 'barrel' ? 1 : kind === 'mag' ? 2 : kind === 'stock' ? 3 : 4 }));
    return;
  }
  const options = ['', ...Object.keys(ATTACHMENTS).filter((id) => ATTACHMENTS[id].slot === kind && getWeapon(state.defId).attachments?.includes(kind))];
  const cur = (state.attachments || []).find((a) => ATTACHMENTS[a]?.slot === kind) || '';
  const next = options[(options.indexOf(cur) + 1) % options.length];
  state.attachments = (state.attachments || []).filter((a) => ATTACHMENTS[a]?.slot !== kind);
  if (next) state.attachments.push(next);
  const slots = new Set(state.attachments.map((a) => ATTACHMENTS[a]?.slot));
  if (slots.size >= 4) game.profile.stats.fullAttachmentKits = 1;
  saveProfile();
  refresh(game);
};
game.buyCosmetic = (id) => {
  const item = game.catalog.find((c) => c.id === id);
  const res = purchaseCosmetic(game.profile, item);
  toast(game.t(res.ok ? 'board.owned' : res.error));
  saveProfile();
  refresh(game);
};
game.equipCosmetic = (slot, id) => {
  game.profile.equipped[slot] = id;
  saveProfile();
  refresh(game);
};
game.owns = (c) => (game.profile.inventory?.[c.bag] || []).includes(c.id);
game.beginRebind = (action) => {
  game.rebindAction = action;
  refresh(game);
  input.rebind = (code) => {
    game.settings.bindings[action] = code;
    game.rebindAction = null;
    input.setBindings(game.settings.bindings);
    saveSettings();
    refresh(game);
  };
};
game.resetBindings = () => { game.settings.bindings = defaultBindings(); input.setBindings(game.settings.bindings); saveSettings(); refresh(game); };
game.resetProfile = () => { game.profile = freshProfile(); saveProfile(); refresh(game); toast(game.t('menu.reset')); };
game.readSettingsFromDom = () => {
  document.querySelectorAll('[data-setting]').forEach((el) => {
    const key = el.dataset.setting;
    if (el.type === 'checkbox') game.settings[key] = el.checked;
    else if (el.type === 'range' || el.type === 'number') game.settings[key] = Number(el.value);
    else game.settings[key] = el.value;
  });
  applyAudio();
  if (view?.setQuality) {
    view.setQuality(game.settings.quality);
    view.state.palette = teamPalette(game.settings.colorblind);
    view.state.reduceFx = game.settings.reduceFx;
    applyTeamCss();
  }
  saveSettings();
  document.documentElement.style.setProperty('--hud', String(game.settings.hudScale || 1));
  document.documentElement.classList.toggle('reduce-motion', game.settings.reduceMotion);
  document.querySelectorAll('[data-value]').forEach((el) => {
    el.textContent = Number(game.settings[el.dataset.value]).toFixed(2);
  });
};
game.setName = (name) => {
  const clean = String(name || '').replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 16);
  game.profile.name = clean || 'Rookie';
  saveProfile();
};
game.report = (id, reason) => {
  if (!REPORT_REASONS.includes(reason)) reason = 'cheating';
  const entry = { id, reason, matchId: game.match?.id || null, at: Date.now() };
  game.profile.reportsQueued.push(entry);
  game.net.send({ type: 'report', ...entry, note: '' });
  saveProfile();
  toast(game.t('report.sent'));
};
game.commend = (id) => {
  game.profile.stats.commends = (game.profile.stats.commends || 0) + 1;
  saveProfile();
  toast(game.t('score.commend'));
  void id;
};
game.sendChat = (key) => {
  const text = game.t(key || QUICK_CHAT[0]);
  game.chat.push({ name: game.profile.name, text });
  game.profile.stats.quickChats = (game.profile.stats.quickChats || 0) + 1;
  game.chatOpen = false;
  const box = document.getElementById('chatbox');
  if (box) delete box.dataset.built;
  game.net.send({ type: 'chat', key });
  saveProfile();
};
game.addFriend = () => {
  const code = document.getElementById('friend-code')?.value?.trim();
  if (!code) return;
  game.profile.friends.push({ name: code, code });
  saveProfile();
  refresh(game);
};
game.toggleParty = () => {
  game.profile.stats.partyQueues = (game.profile.stats.partyQueues || 0) + 1;
  toast(game.t('social.party'));
  saveProfile();
};
game.toggleVoice = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    game.mic = stream;
    toast(game.t('social.mic'));
  } catch {
    toast(game.t('social.mic_denied'));
  }
};
game.exportProfile = () => {
  const blob = new Blob([JSON.stringify(game.profile, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vectorbreak-profile.json';
  a.click();
};
game.importProfile = async (file) => {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.version !== 1 || !data.stats) throw new Error('bad');
    game.profile = ensureProfile(data);
    saveProfile();
    refresh(game);
  } catch {
    toast(game.t('error.import'));
  }
};
game.exportReplay = () => {
  if (!game.replay?.length) return toast(game.t('replay.empty'));
  const blob = new Blob([JSON.stringify({ version: 1, frames: game.replay, mapId: game.match?.map?.id })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vectorbreak-replay.json';
  a.click();
  game.profile.stats.replaysWatched = (game.profile.stats.replaysWatched || 0) + 1;
  saveProfile();
};
game.watchReplay = () => {
  if (!game.replay?.length) return toast(game.t('replay.empty'));
  game.replayMode = true;
  game.replayIndex = 0;
  game.inMatch = true;
  showHUD(true);
};
game.openEditor = async () => {
  if (!(await ensureGraphics())) return toast(game.t('meta.webgl'));
  openEditor();
};
game.editorTool = (tool) => { if (game.editor) game.editor.tool = tool; showEditorTools(game); };
game.playtestEditor = () => {
  if (!game.editor) return;
  const map = game.editor.map;
  if ((map.spawns.a.length + map.spawns.b.length) < 2 || !map.objectives.length) return toast(game.t('editor.need'));
  game.editor = null;
  document.querySelector('.editor-tools')?.remove();
  startMatch({
    modeId: 'team_fracture',
    map,
    mapId: map.id,
    rules: { timeLimit: 180, scoreLimit: 15 },
    players: fillPlayers(getMode('team_fracture'), 'a', 3, 'easy'),
  });
};
game.saveEditor = () => {
  if (!game.editor) return;
  const maps = loadCustomMaps();
  maps.push(JSON.parse(JSON.stringify(game.editor.map)));
  localStorage.setItem(MAPS_KEY, JSON.stringify(maps.slice(-12)));
  game.profile.stats.mapsSaved = (game.profile.stats.mapsSaved || 0) + 1;
  saveProfile();
  toast(game.t('editor.saved'));
};

function fillPlayers(mode, team, bots, difficulty) {
  const load = currentLoadout();
  const players = [{
    id: 'you', name: game.profile.name, team: mode.teams ? team : 'ffa',
    characterId: load.characterId, loadout: clone(load), isBot: false,
  }];
  for (let i = 0; i < bots; i++) {
    players.push({
      id: `bot${i}`,
      name: DRILL_NAMES[i % DRILL_NAMES.length],
      isBot: true,
      botDifficulty: difficulty || 'normal',
      characterId: CHARACTERS[(i + 3) % CHARACTERS.length].id,
    });
  }
  return players;
}
function currentLoadout() {
  ensureProfile(game.profile);
  return game.profile.loadouts[game.profile.activeLoadout || 0];
}

function openEditor() {
  const map = blankMap();
  game.editor = { tool: 'crate', map, yaw: 0.8 };
  input.reset();
  input.capture = true;
  game.inMatch = true;
  game.freePos = { x: 8, y: 8, z: 8 };
  game.yaw = 2.4;
  game.pitch = -0.5;
  if (view.state.menuRig) { view.scene.remove(view.state.menuRig); view.state.menuRig = null; }
  if (view.state.showcase) { view.scene.remove(view.state.showcase.group); view.state.showcase = null; }
  view.buildMap(map);
  showHUD(false);
  document.getElementById('shell')?.classList.add('hidden');
  showEditorTools(game);
}
function tickEditor(dt) {
  const ed = game.editor;
  if (!ed) return;
  if (input.held('lookLeft')) ed.yaw -= dt;
  if (input.held('lookRight')) ed.yaw += dt;
  const look = input.consumeLook();
  ed.yaw += look.x * 0.005;
  game.pitch = Math.max(-1.2, Math.min(0.4, game.pitch - look.y * 0.004));
  game.yaw = ed.yaw;
  const dist = 16;
  view.frameFree({
    x: Math.sin(ed.yaw) * dist,
    y: 8 + game.pitch * -4,
    z: Math.cos(ed.yaw) * dist,
  }, ed.yaw + Math.PI, -0.45);
  if (input.mouse.downL) placeEditor(ed, input.mouse.l ? 'left' : 'right');
  if (input.mouse.downR) placeEditor(ed, 'right');
}
function placeEditor(ed, button) {
  const tool = button === 'right' ? 'erase' : ed.tool;
  const ground = editorGround(ed);
  const x = ground.x;
  const z = ground.z;
  if (tool === 'erase') {
    ed.map.boxes = ed.map.boxes.filter((b) => Math.hypot(((b.min.x + b.max.x) / 2) - x, ((b.min.z + b.max.z) / 2) - z) > 1.2 || b.boundary);
  } else if (tool === 'spawn_a' || tool === 'spawn_b') {
    const team = tool === 'spawn_a' ? 'a' : 'b';
    ed.map.spawns[team].push({ x, y: 0, z, yaw: team === 'a' ? Math.PI : 0 });
  } else if (tool === 'obj') {
    ed.map.objectives.push({ id: 'o' + ed.map.objectives.length, x, y: 0, z, radius: 3 });
  } else if (tool === 'floor') ed.map.boxes.push(box(x, -0.4, z, 4, 0.4, 4, 'concrete'));
  else if (tool === 'wall') ed.map.boxes.push(box(x, 0, z, 0.6, 2.6, 4, 'concrete'));
  else if (tool === 'platform') ed.map.boxes.push(box(x, 2.2, z, 4, 0.3, 4, 'metal'));
  else ed.map.boxes.push(box(x, 0, z, 1.4, 1.15, 1.4, 'crate'));
  view.buildMap(ed.map);
  showEditorTools(game);
}
function blankMap() {
  const boxes = [
    box(0, -0.5, 0, 36, 0.5, 36, 'concrete', { id: 'floor' }),
    box(0, 0, -18.6, 38, 5, 1.2, 'concrete', { id: 'n', boundary: true }),
    box(0, 0, 18.6, 38, 5, 1.2, 'concrete', { id: 's', boundary: true }),
    box(-18.6, 0, 0, 1.2, 5, 36, 'concrete', { id: 'w', boundary: true }),
    box(18.6, 0, 0, 1.2, 5, 36, 'concrete', { id: 'e', boundary: true }),
  ];
  return {
    id: 'custom_' + Date.now().toString(36),
    nameKey: 'editor.title',
    combat: true,
    bounds: { minX: -18, maxX: 18, minZ: -18, maxZ: 18, killY: -6 },
    theme: {
      skyTop: 0x101820, fog: 0x0b1018, accent: 0x5cffd6,
      palette: { concrete: '#3a4250', metal: '#8b95a3', neon: '#5cffd6', glass: '#d5e4ee', crate: '#9a6a42', trim: '#5cffd6', caution: '#ffb020', wood: '#8a6244', water: '#1c9aaf', sand: '#c6a56e' },
    },
    boxes, lights: [{ x: 0, y: 5, z: 0, color: '#5cffd6', intensity: 6, distance: 18 }],
    spawns: {
      a: [{ x: 0, y: 0, z: -12, yaw: Math.PI }],
      b: [{ x: 0, y: 0, z: 12, yaw: 0 }],
      ffa: [{ x: -6, y: 0, z: 0, yaw: 0 }],
    },
    objectives: [{ id: 'mid', x: 0, y: 0, z: 0, radius: 3 }],
    zones: [], pads: [],
  };
}

function pushReplay(match) {
  game.replay.push({
    t: match.time,
    players: match.players.filter((p) => !p.isDecoy).map((p) => ({
      id: p.id, name: p.name, team: p.team, characterId: p.characterId,
      x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, alive: p.alive,
      vx: p.vx, vz: p.vz, crouch: p.crouch, sliding: p.sliding, aiming: p.aiming, hp: p.hp,
    })),
  });
  if (game.replay.length > 8000) game.replay.shift();
}
function tickReplay(dt) {
  const frame = game.replay[game.replayIndex | 0];
  if (!frame) return;
  game.replayIndex += dt * 10;
  const ids = new Set();
  for (const p of frame.players) {
    ids.add(p.id);
    view.updateActor({ ...p, vx: 0, vz: 0, onGround: true }, dt, { weaponId: 'linecut', localId: game.localId });
  }
  view.dropMissing(ids);
  const me = frame.players.find((p) => p.id === game.localId) || frame.players[0];
  if (me) view.frameCamera(me, game.matchMap?.boxes || [], dt, { baseFov: game.settings.fov });
  if (game.replayIndex >= game.replay.length) game.replayMode = false;
}

async function onRelay(msg) {
  if (msg.type === 'welcome') {
    game.net.online = true;
    if (msg.token) { game.profile.token = msg.token; game.net.token = msg.token; saveProfile(); }
    refresh(game);
    game.loadBoard?.();
  } else if (msg.type === 'pong') game.net.ping = Math.max(0, Date.now() - (msg.t || 0));
  else if (msg.type === 'start') {
    if (!(await ensureGraphics())) {
      toast(game.t('meta.webgl'));
      game.net.send({ type: 'leave' });
      return;
    }
    game.localId = msg.you || game.localId;
    const map = MAPS.find((m) => m.id === msg.mapId) || COMBAT_MAPS[0];
    enterMatch({
      map,
      players: msg.players || [],
      rules: msg.rules || {},
      phase: msg.phase || 'countdown',
      mapId: map.id,
      modeId: msg.modeId,
      timeLeft: msg.timeLeft,
      teamScore: { a: 0, b: 0 },
    }, true);
    game.snap = {
      players: msg.players || [],
      phase: msg.phase || 'countdown',
      timeLeft: msg.timeLeft,
      teamScore: { a: 0, b: 0 },
      rules: msg.rules,
      modeId: msg.modeId,
    };
  } else if (msg.type === 'snap') {
    game.snap = msg;
    if (game.match) {
      game.match.phase = msg.phase;
      game.match.timeLeft = msg.timeLeft;
      game.match.teamScore = msg.teamScore;
      game.match.time = msg.time;
    }
  } else if (msg.type === 'end') {
    game.relayLive = false;
    game.resultsShown = true;
    const summary = msg.summary;
    if (!summary) return;
    const row = summary.players.find((p) => p.id === game.localId);
    const win = !!row && (summary.winnerTeam === row.team || summary.winnerId === row.id);
    if (row && !game.rewarded) {
      game.rewarded = true;
      if (msg.official && msg.rating != null) {
        const before = rankFor(game.profile.rank.rating || 0).id;
        game.profile.rank.rating = msg.rating;
        game.profile.rank.peak = Math.max(game.profile.rank.peak || 0, msg.rating);
        game.profile.rank.matches = msg.rankMatches ?? ((game.profile.rank.matches || 0) + 1);
        if (msg.placementsLeft != null) game.profile.rank.placementsLeft = msg.placementsLeft;
        game._rankedUp = rankFor(msg.rating).id !== before;
      }
      absorbSummary(summary, row, win, msg.rewards || { xp: 0, credits: 0, weaponXp: {}, seasonXp: 0 });
      saveProfile();
    }
    showResults(game, summary);
    input.capture = false;
    input.reset();
    input.exitLock();
  } else if (msg.type === 'error') {
    if (msg.key === 'rank.locked' && msg.seconds) game.profile.rank.banUntil = Date.now() + msg.seconds * 1000;
    toast(game.t(msg.key || 'error.bad_packet', msg.vars || { n: msg.seconds || 0 }));
  } else if (msg.type === 'chat' && msg.key) game.chat.push({ name: msg.name || '', text: game.t(msg.key) });
}

function buildCatalog() {
  const bag = { character: 'characterSkins', weapon: 'weaponSkins', emote: 'emotes', banner: 'banners', killEffect: 'killEffects' };
  const slot = { character: 'characterSkin', weapon: 'weaponSkin', emote: 'emote', banner: 'banner', killEffect: 'killEffect' };
  const rows = [
    ...COSMETIC_SKINS,
    ...WEAPON_SKINS,
    ...EMOTES.map((c) => ({ ...c, kind: 'emote' })),
    ...BANNERS.map((c) => ({ ...c, kind: 'banner' })),
    ...KILL_EFFECTS.map((c) => ({ ...c, kind: 'killEffect' })),
  ];
  return rows.map((c) => ({ ...c, nameKey: 'cos.' + c.id, bag: bag[c.kind], slot: slot[c.kind] }));
}
function worldExtras(match) {
  return {
    modeId: match.modeId,
    objectives: match.objectives || [],
    deployables: (match.deployables || []).filter((d) => !d.dead),
    cores: match.cores ? Object.values(match.cores) : [],
    projectiles: match.projectiles || [],
  };
}
function sanitizeRules(rules) {
  if (!rules || typeof rules !== 'object') return {};
  const num = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
  };
  const out = {};
  if (rules.timeLimit != null) out.timeLimit = num(rules.timeLimit, 60, 1200);
  if (rules.scoreLimit != null) out.scoreLimit = num(rules.scoreLimit, 1, 500);
  if (rules.health != null) out.health = num(rules.health, 50, 200);
  if (rules.respawn != null) out.respawn = num(rules.respawn, 0, 8);
  if (rules.friendlyFire != null) out.friendlyFire = !!rules.friendlyFire;
  if (rules.regenRate != null) out.regenRate = num(rules.regenRate, 0, 40);
  if (rules.regenDelay != null) out.regenDelay = num(rules.regenDelay, 0, 99);
  if (rules.botDifficulty) out.botDifficulty = String(rules.botDifficulty).slice(0, 16);
  return out;
}
function editorGround(ed) {
  const camYaw = ed.yaw + Math.PI;
  const pitch = -0.45;
  const ox = Math.sin(ed.yaw) * 16;
  const oy = 8 + game.pitch * -4;
  const oz = Math.cos(ed.yaw) * 16;
  const cp = Math.cos(pitch);
  const dx = Math.sin(camYaw) * cp;
  const dy = Math.sin(pitch);
  const dz = -Math.cos(camYaw) * cp;
  const t = dy < -0.02 ? (0.05 - oy) / dy : 10;
  const dist = Math.max(3, Math.min(24, t));
  return {
    x: Math.round(Math.max(-15, Math.min(15, ox + dx * dist))),
    z: Math.round(Math.max(-15, Math.min(15, oz + dz * dist))),
  };
}
function localBoard(kind) {
  const mine = {
    name: game.profile.name,
    you: true,
    value: kind === 'wins' ? game.profile.stats.wins : kind === 'elims' ? game.profile.stats.kills : kind === 'obj' ? game.profile.stats.objectiveScore : game.profile.rank.rating,
  };
  const rest = (game.serverBoard || []).filter((r) => r.name !== mine.name);
  return [mine, ...rest].sort((a, b) => b.value - a.value).slice(0, 20);
}
function pushLeader() {
  game.net.send({ type: 'board', name: game.profile.name, rating: game.profile.rank.rating, wins: game.profile.stats.wins, elims: game.profile.stats.kills, obj: game.profile.stats.objectiveScore });
}

function loadSettings() {
  const base = {
    lang: 'en', sens: 1.15, adsSens: 0.72, controllerSens: 2.2, deadzone: 0.16, lookAccel: 1.15,
    fov: 76, master: 0.8, music: 0.28, sfx: 0.75, voice: 0.7, hudScale: 1,
    invertY: false, screenShake: true, reduceMotion: false, reduceFx: false, subtitles: true,
    holdAim: true, toggleCrouch: false, autoSprint: false, aimAssist: true, damageNumbers: true, showFps: false,
    quality: (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high',
    colorblind: 'off', crosshair: 'cross', bindings: defaultBindings(),
    customMinutes: 8, customScore: 100, customHealth: 100, customRespawn: 3, customRegen: true, roomCode: '',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved) return { ...base, ...saved, bindings: { ...base.bindings, ...(saved.bindings || {}) } };
  } catch { /* keep defaults */ }
  return base;
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(game.settings)); }
function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (saved) return ensureProfile(saved);
  } catch { /* fresh */ }
  return freshProfile();
}
function freshProfile() {
  const p = emptyProfile('Rookie');
  return ensureProfile(p);
}
function ensureProfile(p) {
  p.stats = p.stats || emptyProfile().stats;
  p.stats.mapPlays = p.stats.mapPlays || {};
  p.stats.weaponKills = p.stats.weaponKills || {};
  p.stats.characterPlays = p.stats.characterPlays || {};
  p.inventory = p.inventory || emptyProfile().inventory;
  p.equipped = p.equipped || emptyProfile().equipped;
  p.rank = p.rank || emptyProfile().rank;
  p.achievements = p.achievements || {};
  p.friends = p.friends || [];
  p.reportsQueued = p.reportsQueued || [];
  if (!p.loadouts) {
    p.loadouts = [0, 1, 2, 3].map((i) => ({ ...defaultLoadout('ryn'), name: `Kit ${String.fromCharCode(65 + i)}` }));
  }
  p.activeLoadout = p.activeLoadout || 0;
  if (!p.challenges || p.challenges.day !== new Date().toISOString().slice(0, 10)) {
    const prev = new Map((p.challenges?.list || []).map((c) => [c.id, c]));
    p.challenges = challengesFor(new Date());
    for (const c of p.challenges.list) {
      const old = prev.get(c.id);
      if (old) { c.progress = old.progress; c.done = old.done; }
    }
  }
  if (!p.token) p.token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  if (!p.code) p.code = p.token.slice(0, 6).toUpperCase();
  p.credits = p.credits ?? 250;
  return p;
}
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(game.profile)); }
function loadCustomMaps() {
  try { return JSON.parse(localStorage.getItem(MAPS_KEY) || '[]'); } catch { return []; }
}
function applyAudio() {
  audio.setVolumes({ master: game.settings.master, music: game.settings.music, sfx: game.settings.sfx, voice: game.settings.voice });
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function shortest(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function fallbackPalette(mode = 'off') {
  const sets = {
    off: { a: '#2ec8ff', b: '#ff5a3c', self: '#5cffd6', enemy: '#ffb03a' },
    deutan: { a: '#3d8bff', b: '#ffb000', self: '#7af0ff', enemy: '#ffb000' },
    protan: { a: '#4aa3ff', b: '#ffe14a', self: '#9ad7ff', enemy: '#ffe14a' },
    tritan: { a: '#ff5a7a', b: '#3dffe8', self: '#ff8ad4', enemy: '#3dffe8' },
  };
  return sets[mode] || sets.off;
}

function dismissBoot() {
  window.__vbDismiss?.();
  document.getElementById('boot')?.remove();
}

async function ensureGraphics() {
  if (!game.viewReady && game.graphicsReady) await game.graphicsReady;
  return !game.webglError && !!view;
}

async function bootGraphics() {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const mod = await import('./render.js');
    teamPalette = mod.teamPalette;
    const real = mod.createView(canvas);
    view = real;
    game.view = real;
    real.setQuality(game.settings.quality);
    real.state.palette = teamPalette(game.settings.colorblind);
    real.state.reduceFx = game.settings.reduceFx;
    if (!game.inMatch && !game.starting && !game.editor) bootMenu();
  } catch (err) {
    console.error(err);
    game.webglError = err;
    const webgl = /webgl/i.test(String(err?.message || err));
    toast(webgl ? game.t('meta.webgl') : (err?.message || game.t('meta.webgl')));
  } finally {
    game.viewReady = true;
    if (!game.inMatch) refresh(game);
    if (view && !game._loop) {
      game._loop = true;
      requestAnimationFrame(loop);
    }
  }
}

window.__VB = game;
