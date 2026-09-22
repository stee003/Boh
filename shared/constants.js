/** Tunable rules. Modes and private matches override the match.* block. */

export const MOVE = {
  gravity: 32,
  walk: 6.35,
  sprint: 9.55,
  crouch: 3.15,
  aimMul: 0.7,
  groundAccel: 58,
  groundDecel: 46,
  airAccel: 16,
  jump: 8.85,
  coyote: 0.12,
  jumpBuffer: 0.12,
  slideMinSpeed: 6.3,
  slideDuration: 0.7,
  slideFriction: 7.4,
  slideBoost: 1.14,
  slideSteer: 7.5,
  dodgeSpeed: 12.2,
  dodgeTime: 0.18,
  dodgeCd: 1.45,
  wallKickSpeed: 8.4,
  wallKickUp: 5.6,
  wallKickCd: 0.28,
  wallKickMax: 2,
  stepHeight: 0.46,
  vaultDur: 0.3,
  radius: 0.34,
  height: 1.72,
  crouchHeight: 1.12,
  eyeDrop: 0.16,
  fallDeath: -15,
};

export const SCORE = {
  elim: 100,
  assist: 50,
  capture: 150,
  defend: 75,
  objElim: 125,
  support: 50,
  coreSteal: 50,
  coreReturn: 200,
  headshotBonus: 15,
};

export const DIFFICULTY = {
  beginner: { error: 9.2, react: 0.58, turn: 2.3, think: 0.42, flank: 0.05, retreatHp: 0, track: 1.35, slide: 0.02, ability: 0.15 },
  easy: { error: 6.2, react: 0.4, turn: 3.1, think: 0.32, flank: 0.16, retreatHp: 16, track: 1.0, slide: 0.08, ability: 0.35 },
  normal: { error: 3.8, react: 0.26, turn: 4.5, think: 0.22, flank: 0.36, retreatHp: 28, track: 0.68, slide: 0.2, ability: 0.6 },
  hard: { error: 2.25, react: 0.16, turn: 6.1, think: 0.16, flank: 0.58, retreatHp: 36, track: 0.42, slide: 0.4, ability: 0.8 },
  expert: { error: 1.28, react: 0.1, turn: 8.2, think: 0.12, flank: 0.78, retreatHp: 42, track: 0.3, slide: 0.62, ability: 0.92 },
};

export const DIFFICULTY_IDS = ['beginner', 'easy', 'normal', 'hard', 'expert'];

export const RANKS = [
  { id: 'drift', min: 0 },
  { id: 'pulse', min: 400 },
  { id: 'signal', min: 800 },
  { id: 'vector', min: 1200 },
  { id: 'apex', min: 1600 },
  { id: 'crown', min: 2000 },
  { id: 'singularity', min: 2400 },
];

export const ATTACHMENTS = {
  heavy_barrel: { slot: 'barrel', range: 1.16, reload: 1.12, mobility: 0.98 },
  light_barrel: { slot: 'barrel', range: 0.92, recoil: 1.1, mobility: 1.04 },
  reflex: { slot: 'optic', ads: 0.78, zoom: 0.92 },
  scout_optic: { slot: 'optic', ads: 1.28, zoom: 1.42 },
  extended_mag: { slot: 'mag', mag: 1.28, reload: 1.14 },
  quick_mag: { slot: 'mag', mag: 0.82, reload: 0.78 },
  light_stock: { slot: 'stock', mobility: 1.05, recoil: 1.12 },
  stable_stock: { slot: 'stock', mobility: 0.94, recoil: 0.82 },
};

export const ATTACHMENT_IDS = Object.keys(ATTACHMENTS);

export const REGIONS = [
  { id: 'local', ping: 8 },
  { id: 'north', ping: 28 },
  { id: 'central', ping: 42 },
  { id: 'south', ping: 55 },
  { id: 'island', ping: 78 },
];

export const MAX_REWIND = 0.15;
export const TICK_RATE = 60;
export const SNAP_RATE = 20;
export const MAX_PLAYERS = 16;
export const REPORT_REASONS = ['cheating', 'abusive', 'exploiting', 'name'];

export function rankFor(rating) {
  let current = RANKS[0];
  for (const r of RANKS) if (rating >= r.min) current = r;
  return current;
}

export function rateMatch({ rating, oppRating, win, draws, matches, contribution }) {
  const K = matches < 8 ? 40 : 28;
  const expected = 1 / (1 + 10 ** ((oppRating - rating) / 400));
  const result = draws ? 0.5 : win ? 1 : 0;
  const c = contribution ?? 1;
  const contrib = Math.max(0.9, Math.min(1.1, c));
  const delta = Math.round(K * (result - expected) * contrib);
  return { delta, next: Math.max(0, rating + delta), expected };
}

export function levelFromXp(xp) {
  let level = 1;
  let rem = Math.max(0, xp | 0);
  let next = 400;
  while (rem >= next && level < 80) {
    rem -= next;
    level += 1;
    next = Math.round(380 + level * 115);
  }
  return { level, into: rem, next, xp: xp | 0 };
}

export function weaponLevelFromXp(xp) {
  let level = 0;
  let rem = Math.max(0, xp | 0);
  let next = 180;
  while (rem >= next && level < 20) {
    rem -= next;
    level += 1;
    next = Math.round(160 + level * 70);
  }
  return { level, into: rem, next };
}

/** Sidegrades unlock quickly. They never raise base damage. */
export function unlockedAttachments(weaponXp) {
  const { level } = weaponLevelFromXp(weaponXp || 0);
  const slots = [];
  if (level >= 1) slots.push('barrel');
  if (level >= 2) slots.push('mag');
  if (level >= 3) slots.push('stock');
  if (level >= 4) slots.push('optic');
  return { level, slots, all: level >= 4 };
}
