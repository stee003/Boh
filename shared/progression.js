import { GUN_GAME_LADDER } from './weapons.js';
import { CHARACTERS } from './characters.js';
import { levelFromXp, weaponLevelFromXp, rankFor } from './constants.js';

export const ACHIEVEMENTS = [
  { id: 'first_fracture', cat: 'combat', test: (s) => s.kills >= 1 },
  { id: 'hot_circuit', cat: 'combat', test: (s, e) => (e.matchKills || 0) >= 5 },
  { id: 'relentless', cat: 'combat', test: (s, e) => (e.matchKills || 0) >= 10 },
  { id: 'breaker', cat: 'combat', test: (s, e) => (e.matchKills || 0) >= 20 },
  { id: 'century', cat: 'combat', test: (s) => s.kills >= 100 },
  { id: 'thousand_cuts', cat: 'combat', test: (s) => s.kills >= 1000 },
  { id: 'clean_head', cat: 'combat', test: (s) => s.headshots >= 1 },
  { id: 'marksman_eye', cat: 'combat', test: (s, e) => (e.matchHeadshots || 0) >= 8 },
  { id: 'surgeon', cat: 'combat', test: (s, e) => (e.matchKills || 0) >= 8 && (e.matchHeadshots || 0) / e.matchKills >= 0.5 },
  { id: 'assist_engine', cat: 'combat', test: (s, e) => (e.matchAssists || 0) >= 8 },
  { id: 'untouchable', cat: 'combat', test: (s, e) => e.win && (e.matchDeaths || 0) === 0 && (e.matchKills || 0) >= 5 },
  { id: 'close_call', cat: 'combat', test: (s, e) => (e.clutchKills || 0) >= 1 },
  { id: 'revenge', cat: 'combat', test: (s, e) => (e.revenges || 0) >= 1 },
  { id: 'multi_break', cat: 'combat', test: (s, e) => (e.bestMulti || 0) >= 3 },
  { id: 'shutdown', cat: 'combat', test: (s, e) => (e.ultKills || 0) >= 1 },
  { id: 'melee_break', cat: 'combat', test: (s, e) => (e.meleeKills || 0) >= 1 },
  { id: 'long_shot', cat: 'combat', test: (s, e) => (e.longShots || 0) >= 1 },
  { id: 'point_blank', cat: 'combat', test: (s, e) => (e.pointBlank || 0) >= 1 },
  { id: 'first_drift', cat: 'movement', test: (s) => s.slides >= 1 },
  { id: 'slide_break', cat: 'movement', test: (s, e) => (e.slideKills || 0) >= 1 },
  { id: 'drift_jump', cat: 'movement', test: (s) => s.slideJumps >= 1 },
  { id: 'wallrunner', cat: 'movement', test: (s, e) => (e.matchWallKicks || 0) >= 8 },
  { id: 'vault_cadet', cat: 'movement', test: (s) => s.vaults >= 1 },
  { id: 'airtime', cat: 'movement', test: (s, e) => (e.matchAir || 0) >= 18 },
  { id: 'dodge_artist', cat: 'movement', test: (s, e) => (e.matchDodges || 0) >= 12 },
  { id: 'speed_circuit', cat: 'movement', test: (s, e) => (e.matchDistance || 0) >= 1400 },
  { id: 'chain_drift', cat: 'movement', test: (s, e) => (e.longSlide || 0) >= 12 },
  { id: 'zone_taken', cat: 'objectives', test: (s) => s.captures >= 1 },
  { id: 'holder', cat: 'objectives', test: (s, e) => (e.holdTime || 0) >= 30 },
  { id: 'core_thief', cat: 'objectives', test: (s) => s.coresStolen >= 1 },
  { id: 'core_home', cat: 'objectives', test: (s) => s.coresReturned >= 1 },
  { id: 'defender', cat: 'objectives', test: (s, e) => (e.defenseKills || 0) >= 5 },
  { id: 'objective_first', cat: 'objectives', test: (s, e) => !!e.topObjective },
  { id: 'triple_hold', cat: 'objectives', test: (s, e) => !!e.tripleHold },
  { id: 'last_one', cat: 'objectives', test: (s, e) => !!e.lastAliveWin },
  { id: 'polymath', cat: 'weapons', test: (s) => Object.values(s.weaponKills || {}).filter((n) => n > 0).length >= 8 },
  { id: 'arsenal_complete', cat: 'weapons', test: (s, e) => !!e.gunGameWin },
  { id: 'attachment_tuner', cat: 'weapons', test: (s) => s.fullAttachmentKits >= 1 },
  { id: 'experimental_taste', cat: 'weapons', test: (s, e) => (e.experimentalKills || 0) >= 1 },
  { id: 'iron_sidearm', cat: 'weapons', test: (s, e) => (e.pistolKills || 0) >= 5 },
  { id: 'glass_maker', cat: 'weapons', test: (s) => s.glassBreaks >= 10 },
  { id: 'furnace_operator', cat: 'weapons', test: (s, e) => (e.lmgDamage || 0) >= 400 },
  { id: 'one_mag', cat: 'weapons', test: (s, e) => (e.oneMag || 0) >= 1 },
  { id: 'placed', cat: 'ranked', test: (s) => (s.rankMatches || 0) >= 5 },
  { id: 'signal_rank', cat: 'ranked', test: (s) => (s.peakRating || 0) >= 800 },
  { id: 'apex_rank', cat: 'ranked', test: (s) => (s.peakRating || 0) >= 1600 },
  { id: 'singularity', cat: 'ranked', test: (s) => (s.peakRating || 0) >= 2400 },
  { id: 'promotion', cat: 'ranked', test: (s, e) => !!e.rankedUp },
  { id: 'comeback', cat: 'ranked', test: (s, e) => !!e.comeback },
  { id: 'cartographer', cat: 'exploration', test: (s) => Object.keys(s.mapPlays || {}).length >= 8 },
  { id: 'night_market', cat: 'exploration', test: (s) => (s.mapPlays || {}).cinder_market >= 1 },
  { id: 'all_lattices', cat: 'exploration', test: (s) => Object.keys(s.mapPlays || {}).length >= 11 },
  { id: 'editor', cat: 'exploration', test: (s) => s.mapsSaved >= 1 },
  { id: 'practice_makes', cat: 'exploration', test: (s) => (s.practiceTime || 0) >= 300 },
  { id: 'party_up', cat: 'social', test: (s) => s.partyQueues >= 1 },
  { id: 'teammate', cat: 'social', test: (s) => s.friendMatches >= 10 },
  { id: 'quick_talker', cat: 'social', test: (s) => s.quickChats >= 20 },
  { id: 'commend', cat: 'social', test: (s) => s.commends >= 1 },
  { id: 'operator_loyal', cat: 'mastery', test: (s) => Object.values(s.characterPlays || {}).some((n) => n >= 15) },
  { id: 'weapon_bond', cat: 'mastery', test: (s) => Object.values(s.weaponXp || {}).some((xp) => weaponLevelFromXp(xp).level >= 5) },
  { id: 'max_loadout', cat: 'mastery', test: (s) => s.loadoutCount >= 4 },
  { id: 'seasoned', cat: 'mastery', test: (s) => levelFromXp(s.xp || 0).level >= 10 },
  { id: 'veteran', cat: 'mastery', test: (s) => levelFromXp(s.xp || 0).level >= 25 },
  { id: 'challenge_hunter', cat: 'mastery', test: (s) => s.challengesDone >= 10 },
  { id: 'flawless_round', cat: 'mastery', test: (s, e) => !!e.flawlessRound },
  { id: 'tutorial_grad', cat: 'mastery', test: (s) => !!s.tutorialDone },
  { id: 'spectator', cat: 'exploration', test: (s) => s.spectateTime >= 30 },
  { id: 'replay_watcher', cat: 'exploration', test: (s) => s.replaysWatched >= 1 },
];

export const COSMETIC_SKINS = [
  { id: 'default', kind: 'character', cost: 0, colors: null },
  { id: 'ash_circuit', kind: 'character', cost: 400, colors: { suit: '#2a2424', armor: '#c4784a', cloth: '#e7b15a' } },
  { id: 'tide_mesh', kind: 'character', cost: 400, colors: { suit: '#142028', armor: '#3aa7b5', cloth: '#d6fff4' } },
  { id: 'violet_seam', kind: 'character', cost: 700, colors: { suit: '#24182c', armor: '#8a5cff', cloth: '#f0d8ff' } },
  { id: 'paper_white', kind: 'character', cost: 700, colors: { suit: '#d7dde4', armor: '#8e99a6', cloth: '#ffffff' } },
  { id: 'night_orchard', kind: 'character', cost: 900, colors: { suit: '#121612', armor: '#6ea85a', cloth: '#d6ffb0' } },
];

export const WEAPON_SKINS = [
  { id: 'factory', kind: 'weapon', cost: 0 },
  { id: 'stripe', kind: 'weapon', cost: 250 },
  { id: 'honeycomb', kind: 'weapon', cost: 350 },
  { id: 'frost', kind: 'weapon', cost: 500 },
  { id: 'ember', kind: 'weapon', cost: 500 },
  { id: 'signal', kind: 'weapon', cost: 800 },
];

export const EMOTES = [
  { id: 'wave', cost: 0 },
  { id: 'salute', cost: 200 },
  { id: 'clap', cost: 200 },
  { id: 'inspect', cost: 300 },
];

export const BANNERS = [
  { id: 'blank', cost: 0 },
  { id: 'chevron', cost: 150 },
  { id: 'split', cost: 150 },
  { id: 'orbit', cost: 300 },
  { id: 'lattice', cost: 450 },
];

export const KILL_EFFECTS = [
  { id: 'shard', cost: 0 },
  { id: 'ring', cost: 350 },
  { id: 'column', cost: 500 },
];

export const CROSSHAIR_STYLES = ['bracket', 'dot', 'chevron', 'circle', 'hash'];

export const SEASON = {
  id: 's1',
  nameKey: 'season.s1.name',
  descKey: 'season.s1.desc',
  featuredMap: 'neon_district',
  tiers: [
    { xp: 0, reward: { type: 'banner', id: 'chevron' } },
    { xp: 200, reward: { type: 'credits', amount: 100 } },
    { xp: 500, reward: { type: 'emote', id: 'salute' } },
    { xp: 900, reward: { type: 'weaponSkin', id: 'stripe' } },
    { xp: 1400, reward: { type: 'credits', amount: 200 } },
    { xp: 2000, reward: { type: 'characterSkin', id: 'tide_mesh' } },
    { xp: 2800, reward: { type: 'killEffect', id: 'ring' } },
    { xp: 3800, reward: { type: 'weaponSkin', id: 'frost' } },
    { xp: 5000, reward: { type: 'characterSkin', id: 'violet_seam' } },
    { xp: 6500, reward: { type: 'banner', id: 'lattice' } },
  ],
};

const CHALLENGE_TEMPLATES = [
  { id: 'elims', stat: 'kills', amounts: [10, 20, 25], cadence: 'daily', xp: 120, credits: 40 },
  { id: 'heads', stat: 'headshots', amounts: [4, 8, 10], cadence: 'daily', xp: 140, credits: 50 },
  { id: 'caps', stat: 'captures', amounts: [3, 6, 10], cadence: 'daily', xp: 150, credits: 50 },
  { id: 'wins', stat: 'wins', amounts: [1, 2, 3], cadence: 'daily', xp: 160, credits: 60 },
  { id: 'damage', stat: 'damage', amounts: [800, 1500, 2500], cadence: 'daily', xp: 130, credits: 40 },
  { id: 'slides', stat: 'slideKills', amounts: [1, 2, 3], cadence: 'daily', xp: 140, credits: 45 },
  { id: 'week_wins', stat: 'wins', amounts: [5], cadence: 'weekly', xp: 400, credits: 150 },
  { id: 'week_elims', stat: 'kills', amounts: [40], cadence: 'weekly', xp: 380, credits: 140 },
  { id: 'week_obj', stat: 'objectiveScore', amounts: [600], cadence: 'weekly', xp: 420, credits: 160 },
  { id: 'week_modes', stat: 'modesPlayed', amounts: [3], cadence: 'weekly', xp: 300, credits: 120 },
  { id: 'week_class', stat: 'classKills', amounts: [12], cadence: 'weekly', xp: 360, credits: 130, classPick: true },
];

function hashDate(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function challengesFor(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const week = `${date.getUTCFullYear()}-W${Math.floor((date.getUTCDate() + 6) / 7)}-${date.getUTCMonth()}`;
  const dailySeed = hashDate(day);
  const weekSeed = hashDate(week);
  const dailies = CHALLENGE_TEMPLATES.filter((t) => t.cadence === 'daily');
  const weeklies = CHALLENGE_TEMPLATES.filter((t) => t.cadence === 'weekly');
  const pick = (list, seed, n) => {
    const copy = [...list];
    const out = [];
    let s = seed;
    while (out.length < n && copy.length) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const i = s % copy.length;
      const t = copy.splice(i, 1)[0];
      const amount = t.amounts[s % t.amounts.length];
      const cls = t.classPick ? ['ar', 'smg', 'shotgun', 'sniper', 'marksman', 'lmg', 'pistol', 'experimental'][s % 8] : null;
      out.push({
        id: `${t.cadence}:${t.id}:${day}:${amount}:${cls || ''}`,
        template: t.id,
        cadence: t.cadence,
        stat: t.stat,
        amount,
        classId: cls,
        xp: t.xp,
        credits: t.credits,
        progress: 0,
        done: false,
      });
    }
    return out;
  };
  return {
    day,
    week,
    list: [...pick(dailies, dailySeed, 3), ...pick(weeklies, weekSeed, 3)],
  };
}

export function emptyProfile(name = 'Rookie') {
  return {
    version: 1,
    name,
    xp: 0,
    credits: 250,
    seasonXp: 0,
    weaponXp: {},
    characterXp: {},
    stats: {
      kills: 0, deaths: 0, assists: 0, wins: 0, matches: 0, shots: 0, hits: 0,
      headshots: 0, playtime: 0, objectiveScore: 0, damage: 0, slides: 0,
      slideJumps: 0, vaults: 0, captures: 0, coresStolen: 0, coresReturned: 0,
      glassBreaks: 0, practiceTime: 0, spectateTime: 0, replaysWatched: 0,
      partyQueues: 0, friendMatches: 0, quickChats: 0, commends: 0,
      challengesDone: 0, mapsSaved: 0, fullAttachmentKits: 0, loadoutCount: 4,
      tutorialDone: false, rankMatches: 0, peakRating: 0,
      mapPlays: {}, weaponKills: {}, characterPlays: {},
    },
    loadouts: null,
    inventory: {
      characterSkins: ['default'],
      weaponSkins: ['factory'],
      emotes: ['wave'],
      banners: ['blank'],
      killEffects: ['shard'],
      crosshairs: ['bracket'],
      badges: [],
    },
    equipped: {
      characterSkin: 'default',
      weaponSkin: 'factory',
      emote: 'wave',
      banner: 'blank',
      killEffect: 'shard',
      crosshair: 'bracket',
      badge: null,
    },
    achievements: {},
    challenges: null,
    rank: { rating: 0, matches: 0, placementsLeft: 5, peak: 0, abandons: [] },
    friends: [],
    blocked: [],
    muted: [],
    reportsQueued: [],
  };
}

export function computeRewards(summary, playerId) {
  const p = summary.players.find((x) => x.id === playerId);
  if (!p) return { xp: 0, credits: 0, weaponXp: {}, seasonXp: 0, win: false };
  const win = summary.winnerId ? summary.winnerId === playerId : summary.winnerTeam && p.team === summary.winnerTeam;
  let xp = 90;
  xp += Math.min(420, (p.kills || 0) * 16);
  xp += Math.min(180, (p.assists || 0) * 9);
  xp += Math.min(220, Math.round((p.objectiveScore || 0) * 0.35));
  if (win) xp += 150;
  if (summary.completed) xp += 40;
  xp = Math.round(xp * (summary.botMatch ? 0.85 : 1) * (summary.ranked && !summary.botMatch ? 1.15 : 1));
  const credits = Math.round(35 + xp * 0.12);
  const weaponXp = {};
  for (const [id, n] of Object.entries(p.weaponKills || {})) weaponXp[id] = 30 + n * 20;
  const used = p.weaponsUsed || [];
  for (const id of used) weaponXp[id] = (weaponXp[id] || 20) + 15;
  return { xp, credits, weaponXp, seasonXp: Math.round(xp * 0.8), win, characterId: p.characterId };
}

export function applyRewards(profile, rewards) {
  profile.xp = (profile.xp || 0) + (rewards.xp || 0);
  profile.credits = (profile.credits || 0) + (rewards.credits || 0);
  profile.seasonXp = (profile.seasonXp || 0) + (rewards.seasonXp || 0);
  profile.weaponXp = profile.weaponXp || {};
  for (const [id, n] of Object.entries(rewards.weaponXp || {})) {
    profile.weaponXp[id] = (profile.weaponXp[id] || 0) + n;
  }
  if (rewards.characterId) {
    profile.characterXp[rewards.characterId] = (profile.characterXp[rewards.characterId] || 0) + Math.round((rewards.xp || 0) * 0.5);
  }
  grantSeasonRewards(profile);
  return profile;
}

export function grantSeasonRewards(profile) {
  const owned = new Set([
    ...(profile.inventory.characterSkins || []),
    ...(profile.inventory.weaponSkins || []),
    ...(profile.inventory.emotes || []),
    ...(profile.inventory.banners || []),
    ...(profile.inventory.killEffects || []),
  ]);
  for (const tier of SEASON.tiers) {
    if ((profile.seasonXp || 0) < tier.xp) continue;
    const r = tier.reward;
    if (r.type === 'credits') continue;
    const bagKey = {
      banner: 'banners', emote: 'emotes', weaponSkin: 'weaponSkins',
      characterSkin: 'characterSkins', killEffect: 'killEffects',
    }[r.type];
    if (!bagKey) continue;
    if (!profile.inventory[bagKey].includes(r.id)) profile.inventory[bagKey].push(r.id);
    owned.add(r.id);
  }
}

export function purchaseCosmetic(profile, item) {
  if (!item) return { ok: false, error: 'error.unknown_item' };
  const bag = {
    character: 'characterSkins',
    weapon: 'weaponSkins',
    emote: 'emotes',
    banner: 'banners',
    killEffect: 'killEffects',
  }[item.kind];
  if (!bag) return { ok: false, error: 'error.unknown_item' };
  if (profile.inventory[bag].includes(item.id)) return { ok: false, error: 'error.owned' };
  if ((profile.credits || 0) < item.cost) return { ok: false, error: 'error.credits' };
  profile.credits -= item.cost;
  profile.inventory[bag].push(item.id);
  return { ok: true };
}

export function evaluateAchievements(profile, event = {}) {
  const stats = { ...profile.stats, xp: profile.xp, weaponXp: profile.weaponXp, peakRating: profile.rank?.peak || 0, rankMatches: profile.rank?.matches || 0 };
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    let ok = false;
    try { ok = !!a.test(stats, event); } catch { ok = false; }
    if (ok) {
      profile.achievements[a.id] = Date.now();
      if (!profile.inventory.badges.includes(a.id)) profile.inventory.badges.push(a.id);
      unlocked.push(a.id);
    }
  }
  return unlocked;
}

export function favoriteWeapon(stats) {
  let best = null;
  let n = 0;
  for (const [id, k] of Object.entries(stats?.weaponKills || {})) {
    if (k > n) { n = k; best = id; }
  }
  return best;
}

export function accuracyOf(stats) {
  if (!stats?.shots) return 0;
  return stats.hits / stats.shots;
}

export function headshotRate(stats) {
  if (!stats?.hits) return 0;
  return stats.headshots / stats.hits;
}

export function kdOf(stats) {
  return (stats?.kills || 0) / Math.max(1, stats?.deaths || 0);
}

export function rankLabelId(rating) {
  return rankFor(rating || 0).id;
}

export const LADDER = GUN_GAME_LADDER;
export const OPERATOR_COUNT = CHARACTERS.length;

export function bumpChallenge(profile, stat, amount = 1, classId = null) {
  if (!profile.challenges?.list) return [];
  const done = [];
  for (const c of profile.challenges.list) {
    if (c.done) continue;
    if (c.stat !== stat) continue;
    if (c.classId && c.classId !== classId) continue;
    c.progress = Math.min(c.amount, (c.progress || 0) + amount);
    if (c.progress >= c.amount) {
      c.done = true;
      profile.xp = (profile.xp || 0) + c.xp;
      profile.credits = (profile.credits || 0) + c.credits;
      profile.stats.challengesDone = (profile.stats.challengesDone || 0) + 1;
      done.push(c);
    }
  }
  return done;
}
