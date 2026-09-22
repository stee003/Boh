import { ATTACHMENTS, DIFFICULTY_IDS, MAX_REWIND, REPORT_REASONS } from '../shared/constants.js';
import { getCharacter } from '../shared/characters.js';
import { createWeaponState, getWeapon, weaponsBySlot } from '../shared/weapons.js';
import { emptyInput } from '../shared/sim/physics.js';

const num = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export function sanitizeName(name) {
  const clean = String(name || '').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return clean.length >= 1 ? clean : 'Rookie';
}

/** Client position, kills, score, and rewards are never copied. Stale input becomes empty. */
export function sanitizeInput(raw, ageMs = 0) {
  if (!raw || typeof raw !== 'object' || ageMs > 250) return emptyInput();
  const slot = Number(raw.weaponSlot);
  return {
    ...emptyInput(),
    moveX: num(raw.moveX, -1, 1, 0),
    moveY: num(raw.moveY, -1, 1, 0),
    yaw: num(raw.yaw, -64, 64, 0),
    pitch: num(raw.pitch, -1.35, 1.25, 0),
    jump: !!raw.jump,
    crouch: !!raw.crouch,
    sprint: !!raw.sprint,
    fire: !!raw.fire,
    aim: !!raw.aim,
    reload: !!raw.reload,
    melee: !!raw.melee,
    dodge: !!raw.dodge,
    tactical: !!raw.tactical,
    ultimate: !!raw.ultimate,
    interact: !!raw.interact,
    drop: !!raw.drop,
    shoulderTap: !!raw.shoulderTap,
    weaponSlot: slot >= 0 && slot <= 2 ? slot : -1,
  };
}

export function rewindSeconds(pingMs) {
  return Math.min(MAX_REWIND, Math.max(0, Number(pingMs) || 0) / 1000);
}

export function sanitizeRules(rules, { ranked = false } = {}) {
  if (ranked) return { ranked: true, botDifficulty: 'hard' };
  if (!rules || typeof rules !== 'object') return {};
  const out = {};
  if (rules.timeLimit != null) out.timeLimit = num(rules.timeLimit, 60, 20 * 60, 8 * 60);
  if (rules.scoreLimit != null) out.scoreLimit = num(rules.scoreLimit, 1, 500, 100);
  if (rules.health != null) out.health = num(rules.health, 50, 200, 100);
  if (rules.respawn != null) out.respawn = num(rules.respawn, 0, 8, 3);
  if (rules.friendlyFire != null) out.friendlyFire = !!rules.friendlyFire;
  if (rules.regenRate != null) out.regenRate = num(rules.regenRate, 0, 40, 18);
  if (rules.regenDelay != null) out.regenDelay = num(rules.regenDelay, 0, 99, 4);
  if (DIFFICULTY_IDS.includes(rules.botDifficulty)) out.botDifficulty = rules.botDifficulty;
  return out;
}

function slotState(slot, fallback, incoming) {
  const options = weaponsBySlot(slot);
  const id = options.some((w) => w.id === incoming?.defId) ? incoming.defId : fallback;
  const allowed = new Set(getWeapon(id).attachments || []);
  const used = new Set();
  const attachments = [];
  for (const key of Array.isArray(incoming?.attachments) ? incoming.attachments : []) {
    const def = ATTACHMENTS[key];
    if (!def || used.has(def.slot) || !allowed.has(def.slot)) continue;
    used.add(def.slot);
    attachments.push(key);
  }
  return createWeaponState(id, attachments);
}

export function sanitizeLoadout(raw) {
  return {
    characterId: getCharacter(raw?.characterId || 'ryn').id,
    primary: slotState('primary', 'linecut', raw?.primary),
    secondary: slotState('secondary', 'flick2', raw?.secondary),
    melee: slotState('melee', 'vectorblade', raw?.melee),
  };
}

export function sanitizeReport(raw) {
  const reason = REPORT_REASONS.includes(raw?.reason) ? raw.reason : 'cheating';
  return {
    target: String(raw?.id || raw?.target || '').slice(0, 32),
    reason,
    matchId: raw?.matchId ? String(raw.matchId).slice(0, 32) : null,
    note: String(raw?.note || '').replace(/[^\p{L}\p{N} .,:;!?'-]/gu, '').slice(0, 180),
  };
}

export function inputAge(sentAt, now = Date.now()) {
  const sent = Number(sentAt);
  if (!Number.isFinite(sent)) return 0;
  return Math.max(0, now - sent);
}
