import { WEAPON_LIST, weaponsBySlot, estimateTTK } from '@shared/weapons.js';
import { CHARACTERS } from '@shared/characters.js';
import { MODES } from '@shared/modes.js';
import { MAPS } from '@shared/maps.js';
import { ATTACHMENTS, RANKS, rankFor, levelFromXp, DIFFICULTY_IDS } from '@shared/constants.js';
import { ACHIEVEMENTS, CROSSHAIR_STYLES } from '@shared/progression.js';

const NAV = [
  ['play', 'menu.play'],
  ['ranked', 'menu.ranked'],
  ['loadout', 'menu.loadout'],
  ['characters', 'menu.operators'],
  ['weapons', 'menu.armory'],
  ['customize', 'menu.customize'],
  ['practice', 'menu.practice'],
  ['custom', 'menu.custom'],
  ['profile', 'menu.profile'],
  ['leaders', 'menu.leaderboards'],
  ['social', 'menu.social'],
  ['settings', 'menu.settings'],
  ['exit', 'menu.exit'],
];

const hexA = (hexColor, a) => {
  const h = (hexColor || '#ffffff').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function corners(color) {
  const s = 'stroke-width="2.5" stroke-linecap="square"';
  return `<g fill="none" stroke="${color}" ${s} opacity="0.9">
    <path d="M6 22 V6 H22"/><path d="M98 6 H114 V22"/><path d="M114 98 V114 H98"/><path d="M22 114 H6 V98"/>
  </g>`;
}

/** Vector operator bust generated from the character's visual spec. */
function opPortrait(c, teamColor) {
  const v = c.visual || {};
  const A = v.accent || '#5cffd6';
  const TC = teamColor || A;
  const bulk = v.bulk || 1;
  const sl = v.shoulders?.[0] ?? 1;
  const sr = v.shoulders?.[1] ?? 1;
  const cx = 60;
  const hw = 26 * bulk; // torso half-width
  const shY = 92 - (sl + sr) * 4; // shoulder line drops when bulky
  let body = '';
  // Back gear peeking over the shoulders
  if (v.back === 'plate') body += `<path d="M${cx - hw * 0.72} ${shY + 2} h${hw * 1.44} v-9 h-${hw * 1.44} z" fill="#1b2330" stroke="${hexA(A, 0.5)}"/>`;
  if (v.back === 'pack') {
    body += `<path d="M${cx - hw * 0.8} ${shY + 2} h${hw * 1.6} v-10 h-${hw * 1.6} z" fill="#1b2330"/>`;
    body += `<rect x="${cx - hw * 0.45}" y="${shY - 9}" width="5" height="8" fill="${A}" opacity="0.85"/>`;
    body += `<rect x="${cx + hw * 0.45 - 5}" y="${shY - 9}" width="5" height="8" fill="${A}" opacity="0.85"/>`;
  }
  if (v.back === 'drone') {
    body += `<g><rect x="${cx + hw * 0.42}" y="${shY - 16}" width="16" height="6" rx="2" fill="#cfd6e0"/>`;
    body += `<rect x="${cx + hw * 0.42 + 4}" y="${shY - 14}" width="8" height="2.4" fill="${A}"/></g>`;
  }
  // Torso: asymmetric shoulder masses
  const lCap = 10 * sl;
  const rCap = 10 * sr;
  body += `<path d="M${cx - hw} 118 L${cx - hw} ${shY + 10}
    Q${cx - hw - lCap} ${shY} ${cx - hw + 6} ${shY - 4}
    L${cx - 10} ${shY - 8} L${cx + 10} ${shY - 8}
    L${cx + hw - 6} ${shY - 4}
    Q${cx + hw + rCap} ${shY} ${cx + hw} ${shY + 10}
    L${cx + hw} 118 Z" fill="#151c27" stroke="rgba(232,238,248,0.16)"/>`;
  // Chest plate + accent core
  body += `<path d="M${cx - hw * 0.62} 118 L${cx - hw * 0.62} ${shY + 2} L${cx + hw * 0.62} ${shY + 2} L${cx + hw * 0.62} 118 Z" fill="#1d2531"/>`;
  body += `<rect x="${cx - 5}" y="${shY + 8}" width="10" height="4" rx="1.5" fill="${A}"/>`;
  if (v.coat) {
    body += `<path d="M${cx - hw} 118 L${cx - hw + 3} ${shY + 14} L${cx + hw - 3} ${shY + 14} L${cx + hw} 118 Z" fill="#10151d"/>`;
    body += `<path d="M${cx - hw + 3} ${shY + 14} H${cx + hw - 3}" stroke="${hexA(A, 0.6)}" stroke-width="1.5"/>`;
  }
  if (v.sash) {
    body += `<path d="M${cx - hw * 0.85} ${shY + 4} L${cx + hw * 0.25} ${shY + 4} L${cx + hw * 0.42} 118 L${cx + hw * 0.1} 118 Z" fill="${A}" opacity="0.75"/>`;
  }
  if (v.seam) {
    body += `<path d="M${cx - hw * 0.62} ${shY + 4} V118 M${cx + hw * 0.62} ${shY + 4} V118" stroke="${hexA(A, 0.55)}" stroke-width="1.5"/>`;
  }
  // Neck
  body += `<rect x="${cx - 7}" y="${shY - 14}" width="14" height="10" fill="#0e131b"/>`;
  // Head variants
  const headY = shY - 16;
  if (v.head === 'hood') {
    body += `<path d="M${cx - 21} ${headY + 24} L${cx - 17} ${headY - 6} Q${cx} ${headY - 16} ${cx + 17} ${headY - 6} L${cx + 21} ${headY + 24} Q${cx} ${headY + 32} ${cx - 21} ${headY + 24} Z" fill="#1a212d" stroke="rgba(232,238,248,0.18)"/>`;
    body += `<path d="M${cx - 14} ${headY + 22} L${cx - 11} ${headY} Q${cx} ${headY - 7} ${cx + 11} ${headY} L${cx + 14} ${headY + 22} Q${cx} ${headY + 27} ${cx - 14} ${headY + 22} Z" fill="#070a0f"/>`;
    body += `<rect x="${cx - 10}" y="${headY + 8}" width="20" height="3.6" rx="1.8" fill="${TC}"/>`;
    body += `<rect x="${cx - 10}" y="${headY + 8}" width="20" height="3.6" rx="1.8" fill="${TC}" opacity="0.35" transform="scale(1.25)" style="transform-origin:${cx}px ${headY + 9.8}px"/>`;
  } else if (v.head === 'wide') {
    body += `<rect x="${cx - 22}" y="${headY - 8}" width="44" height="32" rx="7" fill="#181f2b" stroke="rgba(232,238,248,0.18)"/>`;
    body += `<rect x="${cx - 18}" y="${headY + 4}" width="36" height="10" rx="3" fill="#070a0f"/>`;
    body += `<rect x="${cx - 16}" y="${headY + 7}" width="32" height="4.4" rx="2" fill="${TC}"/>`;
    body += `<rect x="${cx - 4}" y="${headY - 4}" width="8" height="3" rx="1.5" fill="${A}"/>`;
  } else {
    body += `<rect x="${cx - 17}" y="${headY - 6}" width="34" height="30" rx="6" fill="#181f2b" stroke="rgba(232,238,248,0.18)"/>`;
    body += `<rect x="${cx - 13}" y="${headY + 5}" width="26" height="8" rx="3" fill="#070a0f"/>`;
    body += `<rect x="${cx - 11}" y="${headY + 7.4}" width="22" height="3.8" rx="1.9" fill="${TC}"/>`;
    body += `<path d="M${cx - 9} ${headY - 2} H${cx + 9}" stroke="${A}" stroke-width="2.4"/>`;
  }
  if (v.antenna) {
    body += `<path d="M${cx + 15} ${headY - 2} L${cx + 24} ${headY - 14}" stroke="#8b97ad" stroke-width="2"/>`;
    body += `<circle cx="${cx + 25}" cy="${headY - 16}" r="2.6" fill="${A}"/>`;
  }
  return `<svg class="portrait" viewBox="0 0 120 120" role="img" aria-label="${esc(c.id)}">
    <defs><radialGradient id="pg-${c.id}" cx="50%" cy="34%" r="75%">
      <stop offset="0%" stop-color="${hexA(A, 0.28)}"/><stop offset="55%" stop-color="${hexA(A, 0.07)}"/><stop offset="100%" stop-color="rgba(7,9,14,0)"/>
    </radialGradient></defs>
    <rect width="120" height="120" fill="#0a0f16"/>
    <rect width="120" height="120" fill="url(#pg-${c.id})"/>
    <g stroke="${hexA(A, 0.14)}"><path d="M0 30 H120 M0 60 H120 M0 90 H120 M30 0 V120 M60 0 V120 M90 0 V120"/></g>
    <g transform="translate(0,4)">${body}</g>
    ${corners(hexA(A, 0.8))}
  </svg>`;
}

/** Side-profile weapon silhouette generated from the weapon's visual spec. */
function weaponGlyph(def, accentColor) {
  const v = def.visual || {};
  const A = accentColor || v.accent || '#5cffd6';
  const body = v.color || '#9eb0c2';
  const dark = '#2a3340';
  let s = '';
  if (v.blade) {
    s += `<path d="M42 27 L138 24.5 L138 29.5 L42 33 Z" fill="${body}"/>`;
    s += `<path d="M42 27.5 L138 25" stroke="${A}" stroke-width="1.6"/>`;
    s += `<rect x="38" y="22" width="5" height="14" rx="1.5" fill="${dark}"/>`;
    s += `<path d="M20 26 L38 26 L38 32 L24 32 Q18 29 20 26 Z" fill="${dark}"/>`;
  } else if (v.fist) {
    s += `<rect x="46" y="18" width="42" height="26" rx="9" fill="${body}"/>`;
    s += `<circle cx="56" cy="18" r="3.4" fill="${dark}"/><circle cx="67" cy="18" r="3.4" fill="${dark}"/><circle cx="78" cy="18" r="3.4" fill="${dark}"/>`;
    s += `<rect x="58" y="26" width="20" height="4" rx="2" fill="${A}"/>`;
  } else {
    const barrel = 18 + (v.barrel || 0.4) * 52;
    s += `<rect x="34" y="21" width="32" height="13" rx="2" fill="${body}"/>`;
    s += `<rect x="34" y="18.6" width="36" height="3" rx="1.4" fill="${dark}"/>`;
    s += `<rect x="66" y="24" width="${barrel}" height="5.6" rx="1.4" fill="${dark}"/>`;
    s += `<rect x="${66 + barrel - 2.4}" y="23" width="2.6" height="7.6" rx="1" fill="${body}"/>`;
    s += `<path d="M68 34 L80 34 L76 46 L66 46 Z" fill="${dark}"/>`;
    if (v.stock) s += `<path d="M34 22 L18 26 L18 36 L34 34 Z" fill="${dark}"/>`;
    if (v.mag === 'drum') s += `<circle cx="58" cy="40" r="9" fill="${body}"/><circle cx="58" cy="40" r="3.4" fill="${dark}"/>`;
    else if (v.mag === 'cell') s += `<rect x="52" y="34" width="14" height="11" rx="2" fill="${A}"/>`;
    else if (v.mag === 'straight') s += `<path d="M52 34 L66 34 L63 48 L50 48 Z" fill="${dark}"/>`;
    if (v.optic === 'holo') {
      s += `<rect x="46" y="9" width="20" height="9" rx="2" fill="none" stroke="${dark}" stroke-width="2.4"/>`;
      s += `<circle cx="56" cy="13.5" r="2.2" fill="${A}"/>`;
    } else if (v.optic === 'scope') {
      s += `<rect x="44" y="8" width="28" height="8" rx="4" fill="${dark}"/>`;
      s += `<circle cx="70" cy="12" r="3.2" fill="${A}"/>`;
    } else {
      s += `<rect x="48" y="14" width="2.6" height="5" fill="${dark}"/><rect x="60" y="14" width="2.6" height="5" fill="${dark}"/>`;
    }
    s += `<rect x="36" y="26.5" width="28" height="2.2" fill="${A}" opacity="0.9"/>`;
  }
  return `<svg class="wpnglyph" viewBox="0 0 160 64" role="img" aria-label="${esc(def.id)}">
    <rect width="160" height="64" fill="#0a0f16"/>
    <g stroke="${hexA(A, 0.12)}"><path d="M0 21 H160 M0 43 H160 M40 0 V64 M120 0 V64"/></g>
    ${s}
    ${corners(hexA(A, 0.55))}
  </svg>`;
}

/** Tiny stroke icon per nav entry. */
function navIcon(id) {
  const i = {
    play: '<path d="M5 3l10 5-10 5z"/>',
    ranked: '<path d="M4 12l4-4 4 4M4 7l4-4 4 4"/>',
    loadout: '<circle cx="9" cy="9" r="5"/><path d="M9 1v3M9 14v3M1 9h3M14 9h3"/>',
    characters: '<circle cx="9" cy="5.5" r="3"/><path d="M3 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/>',
    weapons: '<path d="M2 7h12v3h-3l-1 3H8l1-3H6L2 9z"/>',
    customize: '<path d="M9 2a7 7 0 100 14c1.5 0 2-1 1.4-2s0-2 1.6-2H14a2.5 2.5 0 002-2.5A7 7 0 009 2z"/><circle cx="6" cy="7" r="1"/><circle cx="10" cy="5" r="1"/>',
    practice: '<circle cx="9" cy="9" r="6"/><circle cx="9" cy="9" r="2.5"/>',
    custom: '<path d="M3 3h5v5H3zM10 3h5v5h-5zM3 10h5v5H3zM10 10h5v5h-5z"/>',
    profile: '<rect x="2" y="4" width="14" height="11" rx="1.5"/><circle cx="6.5" cy="9" r="1.8"/><path d="M10 8h4M10 11h4"/>',
    leaders: '<path d="M5 3h8v4a4 4 0 01-8 0zM5 4H2.5a2.5 2.5 0 002.6 3M13 4h2.5a2.5 2.5 0 01-2.6 3M9 11v3M6 15h6"/>',
    social: '<path d="M2 3h14v9H8l-4 3v-3H2z"/>',
    settings: '<circle cx="9" cy="9" r="2.6"/><path d="M9 1.5v3M9 13.5v3M1.5 9h3M13.5 9h3M3.7 3.7l2.1 2.1M12.2 12.2l2.1 2.1M14.3 3.7l-2.1 2.1M5.8 12.2l-2.1 2.1"/>',
    exit: '<path d="M9 2v7M5.5 4.5a5.5 5.5 0 107 0"/>',
  }[id] || '<circle cx="9" cy="9" r="5"/>';
  return `<svg class="nico" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${i}</svg>`;
}

/** Mode glyph for the match-setup cards. */
function modeIcon(id) {
  const i = {
    team_fracture: '<path d="M3 3l5 5M15 3l-5 5M3 15l5-5M15 15l-5-5"/><circle cx="9" cy="9" r="1.6"/>',
    free_fracture: '<circle cx="9" cy="9" r="5.5"/><path d="M9 1v4M9 13v4M1 9h4M13 9h4"/>',
    dominion: '<path d="M5 16V3M5 3h8l-2 2.5L13 8H5"/>',
    pulsepoint: '<circle cx="9" cy="9" r="6.5"/><circle cx="9" cy="9" r="3.4"/><circle cx="9" cy="9" r="0.8" fill="currentColor"/>',
    core_run: '<path d="M9 1.5l6 7.5-6 7.5-6-7.5z"/><circle cx="9" cy="9" r="1.6"/>',
    last_circuit: '<circle cx="9" cy="7" r="4.5"/><path d="M6.5 11v4M9 11.5v4M11.5 11v4"/>',
    arsenal_march: '<path d="M2 6h14M2 6v4h3l1.5 3h2L10 10h6V6"/><circle cx="5" cy="4" r="1"/>',
    ranked_circuit: '<path d="M4 13l5-5 5 5M4 8l5-5 5 5"/>',
  }[id] || '<circle cx="9" cy="9" r="5"/>';
  return `<svg class="mico" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${i}</svg>`;
}

/** Top-down SVG thumbnail rendered from the map's collision boxes. */
function mapThumb(m) {
  const b = m.bounds;
  const S = 96;
  const sx = S / (b.maxX - b.minX);
  const sz = S / (b.maxZ - b.minZ);
  const X = (x) => (x - b.minX) * sx;
  const Z = (z) => (z - b.minZ) * sz;
  let rects = '';
  for (const box of m.boxes || []) {
    if (box.boundary || box.visual || box.max.y < 0.4 || box.min.y > 3) continue;
    const w = (box.max.x - box.min.x) * sx;
    const h = (box.max.z - box.min.z) * sz;
    if (w < 1.2 || h < 1.2) continue;
    const fill = box.mat === 'glass' ? 'rgba(122,240,255,0.3)' : box.mat === 'neon' ? 'rgba(92,255,214,0.55)' : box.mat === 'metal' ? '#31435a' : '#243348';
    rects += `<rect x="${X(box.min.x).toFixed(1)}" y="${Z(box.min.z).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
  }
  const objs = (m.objectives || []).map((o) => `<circle cx="${X(o.x).toFixed(1)}" cy="${Z(o.z).toFixed(1)}" r="3.2" fill="none" stroke="rgba(255,176,58,0.85)" stroke-width="1.2"/>`).join('');
  const sp = (m.spawns ? [...(m.spawns.a || []), ...(m.spawns.b || [])] : []);
  const dots = sp.slice(0, 10).map((p, i) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Z(p.z).toFixed(1)}" r="1.4" fill="${i < (m.spawns?.a?.length || 0) ? 'rgba(46,200,255,0.8)' : 'rgba(255,90,60,0.8)'}"/>`).join('');
  return `<svg class="map-thumb" viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" fill="#0a121c"/><g stroke="rgba(92,255,214,0.07)"><path d="M0 24H96M0 48H96M0 72H96M24 0V96M48 0V96M72 0V96"/></g>${rects}${objs}${dots}</svg>`;
}

const brandLogo = (size = 42) => `<svg class="marksvg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <defs><linearGradient id="vb-grad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#5cffd6"/><stop offset="100%" stop-color="#2ec8ff"/>
  </linearGradient></defs>
  <path d="M24 3 L43 24 L24 45 L5 24 Z" fill="none" stroke="url(#vb-grad)" stroke-width="2.6"/>
  <path d="M24 12 L35 24 L24 36 L13 24 Z" fill="rgba(92,255,214,0.12)" stroke="rgba(92,255,214,0.55)" stroke-width="1.4"/>
  <path d="M24 20 L29 24 L24 28 L19 24 Z" fill="#ffb03a"/>
</svg>`;

export function mountUI(root, game) {
  root.innerHTML = `
    <div class="shell" id="shell">
      <div class="brand">
        <div class="mark" aria-hidden="true">${brandLogo(46)}</div>
        <div>
          <h1>VECTOR<span>BREAK</span></h1>
          <p data-i18n="meta.tagline"></p>
        </div>
      </div>
      <div class="top-actions">
        <div class="profile-chip" id="profile-chip"></div>
        <button class="ghost" data-act="resume" id="menu-resume" hidden data-i18n="play.resume"></button>
        <button class="ghost settings-shortcut" data-act="nav" data-id="settings" data-i18n="menu.settings"></button>
        <div class="lang" role="group" aria-label="language">
          <button data-act="lang" data-lang="en" id="lang-en">EN</button>
          <button data-act="lang" data-lang="it" id="lang-it">IT</button>
        </div>
      </div>
      <nav class="nav" id="nav"></nav>
      <section class="menu-hero" id="menu-hero"></section>
      <section class="panel" id="panel" aria-live="polite"></section>
      <footer class="footer">
        <span id="foot-season"></span>
        <span id="foot-status"></span>
      </footer>
    </div>
    <div id="hud" class="hud hidden"></div>
    <div id="overlays"></div>
    <div id="toast" class="toast hidden"></div>
  `;
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const g = game;
    if (act === 'nav') g.go(el.dataset.id);
    else if (act === 'settings-tab') { g.settingsTab = el.dataset.id; renderPanel(g); }
    else if (act === 'lang') g.setLang(el.dataset.lang);
    else if (act === 'play') g.play();
    else if (act === 'ranked') g.playRanked();
    else if (act === 'drill') g.playDrill(el.dataset.diff);
    else if (act === 'tutorial') g.playTutorial();
    else if (act === 'range') g.playRange();
    else if (act === 'custom-host') g.hostCustom();
    else if (act === 'custom-join') g.joinCustom();
    else if (act === 'join-room') g.joinRoom?.(el.dataset.id);
    else if (act === 'editor') g.openEditor();
    else if (act === 'char') g.pickCharacter(el.dataset.id);
    else if (act === 'weapon') g.inspectWeapon(el.dataset.id);
    else if (act === 'equip') g.equipWeapon(el.dataset.slot, el.dataset.id);
    else if (act === 'attach') g.cycleAttach(el.dataset.slot, el.dataset.kind);
    else if (act === 'kit') g.pickKit(Number(el.dataset.i));
    else if (act === 'buy') g.buyCosmetic(el.dataset.id);
    else if (act === 'equip-cos') g.equipCosmetic(el.dataset.slot, el.dataset.id);
    else if (act === 'mode') { g.draft.modeId = el.dataset.id; g.modeInfoId = null; renderPanel(g); }
    else if (act === 'mode-info') { g.modeInfoId = g.modeInfoId === el.dataset.id ? null : el.dataset.id; renderPanel(g); }
    else if (act === 'map') { g.draft.mapId = el.dataset.id; renderPanel(g); }
    else if (act === 'diff') { g.draft.difficulty = el.dataset.id; renderPanel(g); }
    else if (act === 'team') { g.draft.team = el.dataset.id; renderPanel(g); }
    else if (act === 'fill') { g.draft.fill = el.dataset.id; renderPanel(g); }
    else if (act === 'relay') { g.draft.relay = el.dataset.id === '1'; renderPanel(g); }
    else if (act === 'rebind') g.beginRebind(el.dataset.action);
    else if (act === 'reset-binds') g.resetBindings();
    else if (act === 'reset-profile') g.resetProfile();
    else if (act === 'resume') g.resume();
    else if (act === 'leave') g.leaveMatch();
    else if (act === 'again') g.playAgain();
    else if (act === 'menu') g.leaveMatch();
    else if (act === 'report') g.report(el.dataset.id, el.dataset.reason || 'cheating');
    else if (act === 'commend') g.commend(el.dataset.id);
    else if (act === 'spectate') g.toggleFreeCam();
    else if (act === 'export-replay') g.exportReplay();
    else if (act === 'watch-replay') g.watchReplay();
    else if (act === 'exit') g.exit();
    else if (act === 'edit-tool') g.editorTool(el.dataset.tool);
    else if (act === 'edit-play') g.playtestEditor();
    else if (act === 'edit-save') g.saveEditor();
    else if (act === 'chat-send') g.sendChat(el.dataset.key);
    else if (act === 'friend-add') g.addFriend();
    else if (act === 'party') g.toggleParty();
    else if (act === 'voice') g.toggleVoice();
    else if (act === 'export-profile') g.exportProfile();
    else if (act === 'lb') { g.draft.board = el.dataset.id; g.loadBoard?.(); renderPanel(g); }
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.setting) game.readSettingsFromDom();
    if (e.target.id === 'callsign') game.setName(e.target.value);
  });
  root.addEventListener('change', (e) => {
    if (e.target.dataset.setting) game.readSettingsFromDom();
    if (e.target.id === 'import-file') game.importProfile(e.target.files?.[0]);
  });
  // Keyboard activation for the in-card info buttons (they are role=button spans, not <button>).
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[data-act="mode-info"][role="button"]');
    if (el) { e.preventDefault(); el.click(); }
  });
  game.screen = game.screen || 'play';
  game.draft = game.draft || {
    modeId: 'team_fracture', mapId: 'random', difficulty: 'normal', team: 'a', fill: 'bots', relay: false, board: 'rating',
  };
  refresh(game);
}

export function refresh(game) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const groups = [ ['nav.compete', ['play', 'ranked', 'practice', 'custom']], ['nav.operator', ['loadout', 'characters', 'weapons', 'customize']], ['nav.community', ['profile', 'leaders', 'social']], ['nav.system', ['settings', 'exit']] ];
  nav.innerHTML = groups.map(([label, ids]) => `<div class="nav-group"><p>${esc(game.t(label))}</p>${ids.map((id) => {
    const key = NAV.find((n) => n[0] === id)[1];
    return `<button data-act="nav" data-id="${id}" ${game.screen === id ? 'aria-current="page"' : ''} class="${game.screen === id ? 'on' : ''}">${navIcon(id)}<span>${esc(game.t(key))}</span></button>`;
  }).join('')}</div>`).join('');
  if (game.inMatch) nav.innerHTML = `<div class="nav-group"><p>${esc(game.t('controls.paused'))}</p><button data-act="resume">${esc(game.t('play.resume'))}</button><button class="on" data-act="nav" data-id="settings">${esc(game.t('menu.settings'))}</button><button data-act="leave">${esc(game.t('play.leave'))}</button></div>`;
  document.querySelectorAll('#lang-en, #lang-it').forEach((b) => b.classList.toggle('on', b.dataset.lang === game.i18n.lang));
  document.documentElement.lang = game.i18n.lang;
  const chip = document.getElementById('profile-chip');
  if (chip) {
    if (game.inMatch) { chip.innerHTML = ''; chip.hidden = true; }
    else {
      chip.hidden = false;
      const lv = levelFromXp(game.profile.xp || 0);
      const rk = rankFor(game.profile.rank?.rating || 0);
      chip.innerHTML = `<span class="pc-avatar">${esc((game.profile.name || 'V').slice(0, 1).toUpperCase())}</span><span class="pc-meta"><strong>${esc(game.profile.name || 'VECTOR')}</strong><em>${esc(game.t('profile.level'))} ${lv.level} · ${esc(game.t('rank.' + rk.id))}</em></span>`;
    }
  }
  const foot = document.getElementById('foot-season');
  if (foot) foot.textContent = game.t('menu.version');
  const status = document.getElementById('foot-status');
  if (status) {
    status.textContent = !game.viewReady
      ? game.t('meta.loading')
      : game.net?.online ? `${game.t('net.connected')} ${game.net.ping || 0}ms` : game.t('net.local');
  }
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = game.t(el.dataset.i18n); });
  if (!game.inMatch || game.paused) renderPanel(game);
  document.getElementById('menu-resume').hidden = !game.inMatch;
  document.documentElement.classList.toggle('reduce-motion', !!game.settings.reduceMotion);
  document.documentElement.style.setProperty('--hud', String(game.settings.hudScale || 1));
}

function renderPanel(game) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const screens = { play: playScreen, ranked: rankedScreen, loadout: loadoutScreen, characters: characterScreen, weapons: weaponScreen, customize: customizeScreen, practice: practiceScreen, custom: customScreen, profile: profileScreen, leaders: leaderScreen, social: socialScreen, settings: settingsScreen };
  const focused = panel.contains(document.activeElement) ? document.activeElement.dataset : null;
  const optionsOpen = panel.querySelector('.match-options')?.open;
  const home = game.screen === 'play' && !game.inMatch;
  document.getElementById('shell').classList.toggle('home', home);
  const hero = document.getElementById('menu-hero');
  hero.classList.toggle('hidden', !home);
  if (home) {
    const lv = levelFromXp(game.profile.xp || 0);
    const rk = rankFor(game.profile.rank?.rating || 0);
    const st = game.profile.stats || {};
    const opName = game.t(CHARACTERS.find((c) => c.id === (game.activeCharacter?.() || game.profile.loadouts?.[game.profile.activeLoadout || 0]?.characterId || 'ryn'))?.nameKey || '');
    hero.innerHTML = `
    <div><p class="kicker">${esc(game.t('menu.version'))}</p><h2 class="hero-title">${esc(game.t('home.title'))}</h2><p class="hero-copy">${esc(game.t('home.desc'))}</p>
    <div class="hero-stats">
      <span class="hstat"><em>${esc(game.t('profile.level'))}</em><strong>${lv.level}</strong></span>
      <span class="hstat"><em>${esc(game.t('menu.ranked'))}</em><strong>${esc(game.t('rank.' + rk.id))}</strong></span>
      <span class="hstat"><em>${esc(game.t('profile.wins'))}</em><strong>${st.wins || 0}</strong></span>
      <span class="hstat"><em>${esc(game.t('hud.elim'))}</em><strong>${st.kills || 0}</strong></span>
    </div></div>
    <div class="hero-bottom"><span class="live-badge">${esc(game.t('home.ready'))}</span><h3>${esc(opName)}</h3>
    <button class="ghost" data-act="nav" data-id="loadout">${esc(game.t('home.edit'))} ↗</button>
    <div class="quick-links"><button data-act="tutorial">${esc(game.t('menu.tutorial'))} <span>↗</span></button><button data-act="range">${esc(game.t('home.range'))} <span>↗</span></button></div></div>`;
  }
  panel.innerHTML = (screens[game.screen] || playScreen)(game);
  if (optionsOpen && panel.querySelector('.match-options')) panel.querySelector('.match-options').open = true;
  if (focused?.act) {
    [...panel.querySelectorAll('[data-act]')].find((el) => el.dataset.act === focused.act && el.dataset.id === focused.id && el.dataset.action === focused.action)?.focus({ preventScroll: true });
  }
}

export function playScreen(game) {
  const d = game.draft;
  const modes = MODES.filter((m) => !m.practice);
  const maps = MAPS.filter((m) => m.combat);
  const selected = modes.find((m) => m.id === d.modeId) || modes[0];
  const infoMode = modes.find((m) => m.id === game.modeInfoId) || null;
  // Small info button on the right of every mode row: hover (or focus) opens a
  // brief tooltip, click pins the explanation in the line under the grid.
  const infoButton = (m) => `<span class="mode-info${game.modeInfoId === m.id ? ' pinned' : ''}" role="button" tabindex="0" aria-expanded="${game.modeInfoId === m.id}" aria-label="${esc(game.t(m.nameKey) + ' · ' + game.t('menu.mode_info'))}" data-act="mode-info" data-id="${m.id}">i<span class="mode-info-tip"><strong>${esc(game.t(m.nameKey))}</strong><span>${esc(game.t('mode.' + m.id + '.how'))}</span></span></span>`;
  const description = infoMode
    ? `<p class="fine mode-description"><span class="mode-info-line"><strong>${esc(game.t(infoMode.nameKey))} — ${esc(game.t('menu.mode_info'))}:</strong> ${esc(game.t('mode.' + infoMode.id + '.how'))}<button class="mode-info-close" data-act="mode-info" data-id="${infoMode.id}" aria-label="${esc(game.t('menu.close'))}">✕</button></span></p>`
    : `<p class="fine mode-description">${esc(game.t(selected.descKey))}</p>`;
  return `<div class="play-heading"><p class="kicker">01 / ${esc(game.t('menu.play'))}</p><h2>${esc(game.t('home.setup'))}</h2><p class="lead">${esc(game.t('home.setup_hint'))}</p></div>
    <section class="setup-section"><h3>${esc(game.t('play.mode'))}</h3>
    <div class="mode-grid">${modes.map((m, i) => `<button class="mode-card ${m.id === d.modeId ? 'on' : ''}" data-act="mode" data-id="${m.id}" aria-pressed="${m.id === d.modeId}"><span class="mode-ico">${modeIcon(m.id)}</span><span class="mode-txt"><span class="mode-index">${String(i + 1).padStart(2, '0')}</span><strong>${esc(game.t(m.nameKey))}</strong></span>${infoButton(m)}<span class="mode-check">${m.id === d.modeId ? '●' : '○'}</span></button>`).join('')}</div>${description}</section>
    <section class="setup-section"><h3>${esc(game.t('play.map'))}</h3><div class="map-grid">
      <button class="map-card ${d.mapId === 'random' ? 'on' : ''}" data-act="map" data-id="random" aria-pressed="${d.mapId === 'random'}"><span class="map-thumb random"><svg viewBox="0 0 96 96" aria-hidden="true"><path d="M20 30h24M20 30l10-10M20 30l10 10M76 66H52M76 66L66 56M76 66l-10 10M62 26l-28 44" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span><strong>${esc(game.t('play.random'))}</strong></button>
      ${maps.map((m) => `<button class="map-card ${d.mapId === m.id ? 'on' : ''}" data-act="map" data-id="${m.id}" aria-pressed="${d.mapId === m.id}">${mapThumb(m)}<strong>${esc(game.t(m.nameKey))}</strong></button>`).join('')}</div></section>
    <section class="setup-section"><h3>${esc(game.t('play.difficulty'))}</h3><div class="row">${DIFFICULTY_IDS.map((id) => chip('diff', id, game.t('diff.' + id), d.difficulty === id)).join('')}</div></section>
    <details class="match-options"><summary>${esc(game.t('home.options'))}</summary><div class="stack">
      <div class="row">${chip('team', 'a', game.t('score.team_a'), d.team === 'a')}${chip('team', 'b', game.t('score.team_b'), d.team === 'b')}</div>
      <div class="row">${chip('fill', 'bots', game.t('play.fill'), d.fill === 'bots')}${chip('fill', 'empty', game.t('custom.bots') + ' 0', d.fill === 'empty')}</div>
    </div></details>
    <div class="deploy-dock"><div class="connection-choice">${chip('relay', '0', game.t('menu.offline'), !d.relay)}${chip('relay', '1', game.t('menu.online'), !!d.relay)}</div>
    <button class="primary deploy" data-act="play">${esc(game.t('play.start'))}<span>→</span></button><p class="fine">${esc(game.t(d.relay ? 'home.relay_hint' : 'home.local_hint'))}</p></div>
    ${(game.browserRooms || []).length ? `<h3>${esc(game.t('net.browser'))}</h3><div class="stack">${game.browserRooms.map((r) => `<div class="card"><strong>${esc(game.t('mode.' + r.modeId + '.name'))}</strong><p class="fine">${esc(game.t('map.' + r.mapId + '.name'))} · ${r.players}/${r.capacity}</p>${r.joinable ? `<button class="chip" data-act="join-room" data-id="${esc(r.id)}">${esc(game.t('net.join'))}</button>` : ''}</div>`).join('')}</div>` : ''}`;
}

function rankedScreen(game) {
  const rank = game.profile.rank || { rating: 0, placementsLeft: 5, matches: 0 };
  const current = rankFor(rank.rating || 0);
  const next = RANKS[RANKS.indexOf(current) + 1];
  const span = next ? next.min - current.min : 1;
  const locked = game.rankedLockLeft?.() || 0;
  return `
    <p class="kicker">${esc(game.t('menu.ranked'))}</p>
    <h2>${esc(game.t('rank.' + current.id))}</h2>
    <p class="lead">${esc(game.t('rank.note'))}</p>
    <div class="statline"><span>${Math.round(rank.rating || 0)}</span><span>${next ? esc(game.t('rank.' + next.id)) : ''}</span></div>
    <div class="bar amber"><span style="width:${next ? Math.max(4, ((rank.rating - current.min) / span) * 100) : 100}%"></span></div>
    <p class="fine" style="margin-top:10px">${esc(game.t('rank.placements', { n: rank.placementsLeft ?? 0 }))}</p>
    <p class="fine">${esc(game.t('rank.abandon'))}</p>
    <p class="fine">${esc(game.t('rank.local_warn'))}</p>
    ${locked > 0
      ? `<p class="fine">${esc(game.t('rank.locked', { n: locked }))}</p>`
      : `<button class="primary" data-act="ranked" style="margin-top:12px">${esc(game.t('rank.queue'))}</button>`}
  `;
}

function loadoutScreen(game) {
  const kits = game.profile.loadouts || [];
  const i = game.profile.activeLoadout || 0;
  const load = kits[i] || kits[0];
  const ch = CHARACTERS.find((c) => c.id === load?.characterId) || CHARACTERS[0];
  const accent = ch.visual?.accent || '#5cffd6';
  return `
    <p class="kicker">${esc(game.t('menu.loadout'))}</p>
    <div class="op-head" style="--op:${accent}">
      <div class="op-art small">${opPortrait(ch)}</div>
      <div>
        <h2>${esc(game.t(ch.nameKey))}</h2>
        <p class="fine">${esc(game.t(ch.roleKey))} · ${esc(game.t(ch.tacticalKey))} · ${esc(game.t(ch.ultimateKey))}</p>
      </div>
    </div>
    <div class="row" style="margin-top:10px">${kits.map((k, n) => `<button class="chip ${n === i ? 'on' : ''}" data-act="kit" data-i="${n}">${esc(k.name || game.t('kit.slot', { n: n + 1 }))}</button>`).join('')}</div>
    <p class="fine">${esc(game.t(ch.tacticalKey))} · ${esc(game.t(ch.ultimateKey))}</p>
    ${weaponCard(game, 'primary', load)}
    ${weaponCard(game, 'secondary', load)}
    ${weaponCard(game, 'melee', load)}
    <p class="fine">${esc(game.t('board.cosmetic'))}</p>
  `;
}

function weaponCard(game, slot, load) {
  const state = load?.[slot];
  const id = state?.defId || (slot === 'secondary' ? 'flick2' : slot === 'melee' ? 'vectorblade' : 'linecut');
  const list = weaponsBySlot(slot);
  const at = state?.attachments || [];
  const kinds = [...new Set(list[0]?.attachments || ['barrel', 'optic', 'mag', 'stock'])];
  return `
    <div class="card" style="margin:8px 0">
      <h3>${esc(game.t('kit.' + slot))}</h3>
      <div class="row">${list.map((w) => `<button class="chip ${w.id === id ? 'on' : ''}" data-act="equip" data-slot="${slot}" data-id="${w.id}">${esc(game.t(w.nameKey))}</button>`).join('')}</div>
      ${slot === 'melee' ? '' : `<div class="row" style="margin-top:6px">${kinds.map((k) => {
        const cur = at.find((a) => ATTACHMENTS[a]?.slot === k);
        return `<button class="chip" data-act="attach" data-slot="${slot}" data-kind="${k}">${esc(game.t(cur ? 'attach.' + cur : 'attach.none'))}</button>`;
      }).join('')}</div>`}
    </div>`;
}

function characterScreen(game) {
  const id = game.activeCharacter();
  return `
    <p class="kicker">${esc(game.t('menu.operators'))}</p>
    <h2>${esc(game.t('kit.operator'))}</h2>
    <div class="op-grid">
      ${CHARACTERS.map((c) => {
        const accent = c.visual?.accent || '#5cffd6';
        const on = id === c.id;
        return `
        <button class="op-card ${on ? 'on' : ''}" data-act="char" data-id="${c.id}" style="--op:${accent}">
          <div class="op-art">${opPortrait(c)}</div>
          <div class="op-info">
            <h3>${esc(game.t(c.nameKey))}<em>${esc(game.t(c.roleKey))}</em></h3>
            <p>${esc(game.t(c.blurbKey))}</p>
            <div class="op-abilities">
              <span class="fine" title="${esc(game.t(c.passiveKey))}">● ${esc(game.t(c.passiveKey))}</span>
              <span class="fine" title="${esc(game.t(c.tacticalKey))}">◧ ${esc(game.t(c.tacticalKey))}</span>
              <span class="fine" title="${esc(game.t(c.ultimateKey))}">◆ ${esc(game.t(c.ultimateKey))}</span>
            </div>
          </div>
        </button>`;
      }).join('')}
    </div>`;
}

function weaponScreen(game) {
  const id = game.inspectId || 'linecut';
  const def = WEAPON_LIST.find((w) => w.id === id) || WEAPON_LIST[0];
  const cats = [...new Set(WEAPON_LIST.map((w) => w.category))];
  const accent = def.visual?.accent || '#5cffd6';
  return `
    <p class="kicker">${esc(game.t('menu.armory'))}</p>
    <div class="wpn-hero" style="--op:${accent}">
      <div class="wpn-art">${weaponGlyph(def, accent)}</div>
      <div class="wpn-meta">
        <h2>${esc(game.t(def.nameKey))}</h2>
        <p class="lead" style="margin:4px 0 8px">${esc(game.t(def.descKey))}</p>
        <p class="fine">${esc(game.t(def.projectile ? 'kit.projectile' : 'kit.hitscan'))} · ${esc(game.t('cat.' + def.category))}</p>
      </div>
    </div>
    <div class="grid3">
      ${stat(game.t('kit.dps'), Math.round(def.damage * (def.pellets || 1) * (def.fireRate || 1)))}
      ${stat(game.t('kit.ttk'), estimateTTK(def).toFixed(2) + 's')}
      ${stat(game.t('kit.mag'), def.mag)}
      ${stat(game.t('kit.reload'), def.reload.toFixed(2) + 's')}
      ${stat(game.t('kit.range'), Math.round(def.range))}
      ${stat(game.t('kit.mobility'), def.mobility.toFixed(2))}
    </div>
    ${cats.map((cat) => `<div class="row" style="margin-top:6px">${WEAPON_LIST.filter((w) => w.category === cat).map((w) => `<button class="chip ${w.id === id ? 'on' : ''}" data-act="weapon" data-id="${w.id}">${esc(game.t(w.nameKey))}</button>`).join('')}</div>`).join('')}
  `;
}

function customizeScreen(game) {
  const groups = {};
  for (const c of game.catalog || []) (groups[c.slot] ||= []).push(c);
  const titles = { characterSkin: 'board.skins', weaponSkin: 'board.weapons', emote: 'board.emotes', banner: 'board.banners', killEffect: 'board.effects' };
  return `
    <p class="kicker">${esc(game.t('menu.customize'))}</p>
    <h2>${esc(game.t('board.credits'))}: ${game.profile.credits || 0}</h2>
    <p class="lead">${esc(game.t('board.cosmetic'))}</p>
    <p class="fine">${esc(game.t('season.track'))}: ${game.profile.seasonXp || 0} ${esc(game.t('season.xp'))}</p>
    ${Object.entries(groups).map(([slot, list]) => `
      <h3 style="margin:12px 0 6px;font-size:13px;letter-spacing:0.08em">${esc(game.t(titles[slot] || slot))}</h3>
      <div class="stack">${list.map((c) => {
        const owned = game.owns(c);
        return `<div class="card" style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <div><strong>${esc(game.t(c.nameKey))}</strong><p class="fine">${owned ? esc(game.t('board.owned')) : (c.cost || 0) + ' ' + esc(game.t('board.credits'))}</p></div>
          ${owned
            ? `<button class="chip ${game.profile.equipped?.[c.slot] === c.id ? 'on' : ''}" data-act="equip-cos" data-slot="${c.slot}" data-id="${c.id}">${esc(game.t('board.equip'))}</button>`
            : `<button class="chip" data-act="buy" data-id="${c.id}">${esc(game.t('board.buy'))}</button>`}
        </div>`;
      }).join('')}</div>`).join('')}
  `;
}

function practiceScreen(game) {
  return `
    <p class="kicker">${esc(game.t('menu.practice'))}</p>
    <h2>${esc(game.t('mode.practice.name'))}</h2>
    <p class="lead">${esc(game.t('mode.practice.desc'))}</p>
    <div class="stack">
      <button class="primary" data-act="tutorial">${esc(game.t('menu.tutorial'))}</button>
      <button class="ghost" data-act="range">${esc(game.t('mode.practice.name'))}</button>
      <p class="fine">${esc(game.t('how.4'))}</p>
      <div class="row">${DIFFICULTY_IDS.map((id) => `<button class="chip" data-act="drill" data-diff="${id}">${esc(game.t('diff.' + id))}</button>`).join('')}</div>
      <button class="ghost" data-act="watch-replay">${esc(game.t('replay.play'))}</button>
    </div>`;
}

function customScreen(game) {
  const s = game.settings;
  return `
    <p class="kicker">${esc(game.t('menu.custom'))}</p>
    <h2>${esc(game.t('custom.create'))}</h2>
    <div class="stack">
      <label class="field">${esc(game.t('custom.time'))}<input type="number" min="3" max="20" value="${s.customMinutes || 8}" data-setting="customMinutes" /></label>
      <label class="field">${esc(game.t('custom.score'))}<input type="number" min="10" max="200" value="${s.customScore || 100}" data-setting="customScore" /></label>
      <label class="field">${esc(game.t('custom.health'))}<input type="number" min="50" max="200" value="${s.customHealth || 100}" data-setting="customHealth" /></label>
      <label class="field">${esc(game.t('custom.respawn'))}<input type="number" min="0" max="8" step="0.5" value="${s.customRespawn ?? 3}" data-setting="customRespawn" /></label>
      <label class="field"><span><input type="checkbox" data-setting="customFriendly" ${s.customFriendly ? 'checked' : ''}/> ${esc(game.t('custom.ff'))}</span></label>
      <label class="field"><span><input type="checkbox" data-setting="customRegen" ${s.customRegen !== false ? 'checked' : ''}/> ${esc(game.t('custom.regen'))}</span></label>
      <label class="field">${esc(game.t('custom.code'))}<input id="room-code" maxlength="8" data-setting="roomCode" value="${esc(s.roomCode || '')}" /></label>
      <div class="row">
        <button class="primary" data-act="custom-host">${esc(game.t('custom.create'))}</button>
        <button class="ghost" data-act="custom-join">${esc(game.t('custom.join'))}</button>
        <button class="ghost" data-act="editor">${esc(game.t('editor.title'))}</button>
      </div>
      <p class="fine">${esc(game.t('custom.local_only'))}</p>
    </div>`;
}

function profileScreen(game) {
  const p = game.profile;
  const lv = levelFromXp(p.xp || 0);
  const ach = ACHIEVEMENTS;
  const unlocked = p.achievements || {};
  const challenges = p.challenges?.list || [];
  return `
    <p class="kicker">${esc(game.t('menu.profile'))}</p>
    <h2>${esc(p.name)}</h2>
    <label class="field">${esc(game.t('profile.name'))}<input id="callsign" value="${esc(p.name)}" maxlength="16" /></label>
    <div class="statline" style="margin-top:8px"><span>${esc(game.t('profile.level'))} ${lv.level}</span><span>${lv.into}/${lv.next} ${esc(game.t('score.xp'))}</span></div>
    <div class="bar"><span style="width:${Math.max(4, (lv.into / Math.max(1, lv.next)) * 100)}%"></span></div>
    <div class="grid3" style="margin-top:10px">
      ${stat(game.t('profile.matches'), p.stats.matches || 0)}
      ${stat(game.t('profile.wins'), p.stats.wins || 0)}
      ${stat(game.t('hud.elim'), p.stats.kills || 0)}
      ${stat(game.t('profile.accuracy'), Math.round((p.stats.shots ? p.stats.hits / p.stats.shots : 0) * 100) + '%')}
      ${stat(game.t('profile.headshot'), Math.round((p.stats.hits ? p.stats.headshots / p.stats.hits : 0) * 100) + '%')}
      ${stat(game.t('profile.rating'), Math.round(p.rank?.rating || 0))}
    </div>
    <p class="fine" style="margin-top:8px">${esc(game.t('profile.local'))}</p>
    <div class="row">
      <button class="ghost" data-act="export-profile">${esc(game.t('profile.export'))}</button>
      <label class="chip">${esc(game.t('profile.import'))}<input id="import-file" type="file" accept="application/json" hidden /></label>
    </div>
    <h3 style="margin:14px 0 6px">${esc(game.t('profile.challenges'))}</h3>
    ${challenges.map((c) => `<div class="card"><div class="statline"><span>${esc(game.t('challenge.' + c.template, { n: c.amount, class: c.classId || '' }))}</span><span>${c.progress || 0}/${c.amount}</span></div><div class="bar amber"><span style="width:${Math.min(100, ((c.progress || 0) / c.amount) * 100)}%"></span></div></div>`).join('') || `<p class="fine">—</p>`}
    <h3 style="margin:14px 0 6px">${esc(game.t('profile.achievements'))} ${Object.keys(unlocked).length}/${ach.length}</h3>
    <div class="stack" style="max-height:220px;overflow:auto">
      ${ach.map((a) => `<div class="card ${unlocked[a.id] ? 'on' : ''}"><h3>${esc(game.t('ach.' + a.id + '.name'))}</h3><p>${esc(game.t('ach.' + a.id + '.desc'))}</p></div>`).join('')}
    </div>`;
}

function leaderScreen(game) {
  const rows = game.leaders || [];
  const board = game.draft.board || 'rating';
  return `
    <p class="kicker">${esc(game.t('menu.leaderboards'))}</p>
    <h2>${esc(game.t('lb.' + board))}</h2>
    <div class="row">${['rating', 'wins', 'elims', 'obj'].map((id) => chip('lb', id, game.t('lb.' + id), board === id)).join('')}</div>
    <table><thead><tr><th>#</th><th>${esc(game.t('profile.name'))}</th><th>${esc(game.t('lb.' + board))}</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${Math.round(r.value || 0)}</td></tr>`).join('') || `<tr><td colspan="3">${esc(game.t('lb.offline'))}</td></tr>`}</tbody></table>
    <p class="fine">${esc(game.t('lb.offline'))}</p>`;
}

function socialScreen(game) {
  const friends = game.profile.friends || [];
  return `
    <p class="kicker">${esc(game.t('menu.social'))}</p>
    <h2>${esc(game.t('social.friends'))}</h2>
    <p class="fine">${esc(game.t('social.code'))}: ${esc(game.profile.code || '')}</p>
    <label class="field">${esc(game.t('social.add'))}<input id="friend-code" maxlength="12" /></label>
    <div class="row">
      <button class="primary" data-act="friend-add">${esc(game.t('social.add'))}</button>
      <button class="ghost" data-act="party">${esc(game.t('social.party'))}</button>
      <button class="ghost" data-act="voice">${esc(game.t('social.voice'))}</button>
    </div>
    <div class="stack" style="margin-top:8px">
      ${friends.map((f) => `<div class="card"><strong>${esc(f.name)}</strong><p class="fine">${esc(f.code)}</p></div>`).join('') || `<p class="fine">${esc(game.t('social.empty'))}</p>`}
    </div>
    <p class="fine">${esc(game.t('social.push'))} · ${esc(game.t('social.team_only'))}</p>`;
}

function settingsScreen(game) {
  const s = game.settings;
  const tab = game.settingsTab || 'controls';
  const range = (label, key, min, max, step) => slider(game, label, key, s[key], min, max, step);
  const toggle = (label, key) => `<label class="field toggle-field"><span>${esc(game.t(label))}</span><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`;
  const select = (label, key, options, prefix) => `<label class="field">${esc(game.t(label))}<select data-setting="${key}">${options.map((q) => `<option value="${q}" ${s[key] === q ? 'selected' : ''}>${esc(game.t(prefix + q))}</option>`).join('')}</select></label>`;
  const tabs = ['controls', 'gameplay', 'video', 'audio', 'bindings'];
  const content = {
    controls: `<h3>${esc(game.t('settings.mouse'))}</h3><p class="lead">${esc(game.t('controls.hint'))}</p>
      ${range('set.sens', 'sens', 0.2, 4, 0.05)}${range('set.ads', 'adsSens', 0.3, 1, 0.05)}${toggle('set.inverty', 'invertY')}
      <h3>${esc(game.t('settings.controller'))}</h3>${range('set.controller', 'controllerSens', 0.5, 5, 0.1)}${range('set.deadzone', 'deadzone', 0.05, 0.4, 0.01)}${range('set.accel', 'lookAccel', 1, 2.2, 0.1)}${toggle('set.aimassist', 'aimAssist')}`,
    gameplay: `${toggle('settings.hold_aim', 'holdAim')}${toggle('settings.toggle_crouch', 'toggleCrouch')}${toggle('settings.auto_sprint', 'autoSprint')}${toggle('set.damage_numbers', 'damageNumbers')}${toggle('set.subtitles', 'subtitles')}${range('set.ui_scale', 'hudScale', 0.8, 1.5, 0.05)}
      ${select('set.crosshair', 'crosshair', CROSSHAIR_STYLES, 'set.ch.')}
      <h3>${esc(game.t('menu.language'))}</h3><div class="row"><button class="chip" data-act="lang" data-lang="en">English</button><button class="chip" data-act="lang" data-lang="it">Italiano</button></div>`,
    video: `${range('set.fov', 'fov', 60, 100, 1)}${select('set.preset', 'quality', ['low', 'medium', 'high', 'ultra'], 'set.')}${select('set.colorblind', 'colorblind', ['off', 'deutan', 'protan', 'tritan'], 'set.cb.')}${toggle('set.shake', 'screenShake')}${toggle('set.reduce_shake', 'reduceMotion')}${toggle('set.reduce_fx', 'reduceFx')}${toggle('set.showfps', 'showFps')}`,
    audio: `${range('set.master', 'master', 0, 1, 0.01)}${range('set.music', 'music', 0, 1, 0.01)}${range('set.sfx', 'sfx', 0, 1, 0.01)}${range('set.voice', 'voice', 0, 1, 0.01)}`,
    bindings: `<p class="lead">${esc(game.t('settings.bind_hint'))}</p><div class="binding-grid">${Object.entries(s.bindings).map(([action, code]) => `<div class="statline"><span>${esc(game.t('bind.' + action))}</span><button class="chip" data-act="rebind" data-action="${action}">${esc(game.rebindAction === action ? game.t('set.press') : code)}</button></div>`).join('')}</div><button class="ghost" data-act="reset-binds">${esc(game.t('settings.reset_bindings'))}</button>`,
  };
  return `<p class="kicker">${esc(game.t('nav.system'))}</p><div class="settings-heading"><h2>${esc(game.t('menu.settings'))}</h2><span class="saved-indicator">● ${esc(game.t('settings.saved'))}</span></div>
    <div class="settings-tabs" role="tablist" aria-label="${esc(game.t('menu.settings'))}">${tabs.map((id) => `<button role="tab" aria-selected="${tab === id}" aria-controls="settings-content" class="chip ${tab === id ? 'on' : ''}" data-act="settings-tab" data-id="${id}">${esc(game.t('settings.' + id))}</button>`).join('')}</div>
    <div class="settings-content" id="settings-content" role="tabpanel">${content[tab] || content.controls}</div>`;
}

function slider(game, labelKey, key, value, min, max, step) {
  return `<label class="field range-field">${esc(game.t(labelKey))} <output data-value="${key}">${Number(value).toFixed(2)}</output>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}" /></label>`;
}
function chip(act, id, label, on) {
  return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${!!on}" data-act="${act}" data-id="${id}">${esc(label)}</button>`;
}
function stat(label, value) {
  return `<div class="card"><p class="fine">${esc(label)}</p><strong>${esc(value)}</strong></div>`;
}

export function showHUD(on) {
  document.getElementById('shell')?.classList.toggle('hidden', on);
  document.getElementById('hud')?.classList.toggle('hidden', !on);
}

export function renderHUD(game) {
  const hud = document.getElementById('hud');
  if (!hud) return;
  hud.innerHTML = `
    <div class="objbar">
      <div class="score"><span class="a" id="score-a">0</span> <span id="score-mid">·</span> <span class="b" id="score-b">0</span></div>
      <div class="timer" id="timer">0:00</div>
      <div id="mode-label" class="fine"></div>
    </div>
    <div class="compass" id="compass"></div>
    <canvas class="minimap" id="minimap" width="148" height="148"></canvas>
    <div class="feed" id="feed"></div>
    <div class="vitals">
      <div class="hp" id="hp">100</div>
      <div class="bar hp"><span id="hp-bar" style="width:100%"></span></div>
      <div class="sub" id="armor-line"></div>
      <div class="sub" id="status-line"></div>
    </div>
    <div class="ammo"><strong id="ammo">30</strong><span id="weapon-name"></span><div class="fine" id="fps"></div></div>
    <div class="abilities">
      <div class="ability" id="tac"><span id="tac-name"></span><div class="cd hidden" id="tac-cd"></div></div>
      <div class="ability ult" id="ult"><span id="ult-name"></span><div class="cd hidden" id="ult-cd"></div></div>
    </div>
    <div class="cross cross" id="cross"><i></i><i></i><i></i><i></i></div>
    <div class="prompt hidden" id="prompt"></div>
    <div class="banner hidden" id="banner"></div>
    <div class="chatlog" id="chatlog"></div>
    <div class="chatbox hidden" id="chatbox"></div>
    <div class="lowhp hidden" id="lowhp"></div>
    <div class="damage-dir" id="dmgdir"></div>
  `;
}

export function updateHUD(game, player, match) {
  if (!player || !match) return;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('hp', player.alive ? String(Math.ceil(player.hp)) : game.t('hud.down'));
  const bar = document.getElementById('hp-bar');
  if (bar) bar.style.width = `${Math.max(0, (player.hp / (player.maxHp || 100)) * 100)}%`;
  set('armor-line', player.armor > 0 ? `${game.t('hud.armor')} ${Math.ceil(player.armor)}` : (player.carrying ? game.t('hud.carry') : ''));
  const st = [];
  if (player.reloading) st.push(game.t('hud.reload'));
  if (!player.alive) st.push(`${game.t('hud.respawn')} ${Math.max(0, player.deathT || 0).toFixed(1)}`);
  if (player.slowT > 0) st.push(game.t('hud.loss'));
  set('status-line', st.join(' · '));
  const mag = player.weapons?.[player.weaponSlot || 0];
  const def = WEAPON_LIST.find((w) => w.id === (player.weaponId || mag?.defId));
  set('ammo', player.alive ? (def?.melee ? '—' : `${mag?.mag ?? player.mag ?? 0}`) : '');
  set('weapon-name', def ? game.t(def.nameKey) : '');
  const ch = CHARACTERS.find((c) => c.id === player.characterId);
  set('tac-name', ch ? game.t('hud.tactical') : '');
  set('ult-name', ch ? game.t('hud.ultimate') : '');
  const tac = document.getElementById('tac');
  const ult = document.getElementById('ult');
  const tacCd = document.getElementById('tac-cd');
  const ultCd = document.getElementById('ult-cd');
  if (tac && tacCd) {
    const ready = (player.tacticalCd || 0) <= 0 && player.alive;
    tac.classList.toggle('ready', ready);
    tacCd.classList.toggle('hidden', ready);
    tacCd.textContent = ready ? '' : Math.ceil(player.tacticalCd);
  }
  if (ult && ultCd) {
    const ready = (player.ult || 0) >= 100 && player.alive;
    ult.classList.toggle('ready', ready);
    ultCd.classList.toggle('hidden', ready || !player.alive);
    ultCd.textContent = ready ? game.t('hud.ready') : `${Math.floor(player.ult || 0)}`;
  }
  const mode = MODES.find((m) => m.id === match.modeId);
  if (mode && mode.teams === false) {
    set('score-a', String(player.kills || 0));
    set('score-mid', '/');
    set('score-b', String(match.rules?.scoreLimit || ''));
  } else {
    set('score-a', String(Math.floor(match.teamScore?.a ?? 0)));
    set('score-mid', '·');
    set('score-b', String(Math.floor(match.teamScore?.b ?? 0)));
  }
  const remain = Math.max(0, match.timeLeft || 0);
  set('timer', match.phase === 'overtime' ? game.t('hud.overtime') : `${Math.floor(remain / 60)}:${Math.floor(remain % 60).toString().padStart(2, '0')}`);
  set('mode-label', mode ? game.t(mode.nameKey) : '');
  if (game.settings.showFps) set('fps', `${game.fps || 0} ${game.t('hud.fps')}`);
  document.getElementById('lowhp')?.classList.toggle('hidden', !(player.alive && player.hp < 30));
  const cross = document.getElementById('cross');
  if (cross) {
    cross.className = `cross ${game.settings.crosshair || 'cross'} ${game.hitPulse > 0 ? 'hit' : ''}`;
    cross.style.opacity = '0.9';
  }
  const compass = document.getElementById('compass');
  if (compass) {
    const marks = [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['W', -Math.PI / 2]];
    compass.innerHTML = marks.map(([lab, ang]) => {
      let d = ang - player.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return `<span style="left:${140 - d * 70}px">${lab}</span>`;
    }).join('');
  }
  const feed = document.getElementById('feed');
  if (feed) feed.innerHTML = (game.feed || []).slice(-5).map((f) => `<div>${esc(f)}</div>`).join('');
  const log = document.getElementById('chatlog');
  if (log) log.innerHTML = (game.chat || []).slice(-6).map((c) => `<div><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('');
  const prompt = document.getElementById('prompt');
  if (prompt) {
    prompt.classList.toggle('hidden', !game.prompt);
    prompt.textContent = game.prompt || '';
  }
  const chat = document.getElementById('chatbox');
  if (chat) {
    chat.classList.toggle('hidden', !game.chatOpen);
    if (game.chatOpen && !chat.dataset.built) {
      chat.dataset.built = '1';
      const { QUICK_CHAT } = { QUICK_CHAT: ['chat.move', 'chat.spotted', 'chat.help', 'chat.cover', 'chat.objective', 'chat.nice', 'chat.reloading', 'chat.ult'] };
      chat.innerHTML = QUICK_CHAT.map((k) => `<button data-act="chat-send" data-key="${k}">${esc(game.t(k))}</button>`).join('');
    }
  }
  const dir = document.getElementById('dmgdir');
  if (dir) {
    dir.innerHTML = (game.damageDirs || []).map((d) => `<i style="transform:rotate(${d.ang}rad);opacity:${d.life}"></i>`).join('');
  }
}

export function setBanner(text, ms = 1600) {
  const el = document.getElementById('banner');
  if (!el) return;
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  clearTimeout(setBanner._t);
  if (text) setBanner._t = setTimeout(() => el.classList.add('hidden'), ms);
}

export function toast(text) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
}

export function showPause(game, on) {
  const host = document.getElementById('overlays');
  host.querySelector('.pause')?.remove();
  if (!on) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="box">
      <p class="kicker">VECTORBREAK</p>
      <h2 id="pause-title">${esc(game.t('controls.paused'))}</h2><p class="lead">${esc(game.t('controls.hint'))}</p>
      <div class="stack">
        <button class="primary" data-act="resume">${esc(game.t('play.resume'))}</button>
        <button class="ghost" data-act="nav" data-id="settings">${esc(game.t('menu.settings'))}</button>
        <button class="ghost" data-act="spectate">${esc(game.t('hud.freecam'))}</button>
        <button class="ghost" data-act="export-replay">${esc(game.t('replay.save'))}</button>
        <button class="danger" data-act="leave">${esc(game.t('play.leave'))}</button>
      </div>
    </div></div>`);
  host.querySelector('[data-act="resume"]')?.focus();
}

export function showScoreboard(game, match, on) {
  const host = document.getElementById('overlays');
  host.querySelector('.scoreboard')?.remove();
  if (!on || !match) return;
  const rows = [...match.players].filter((p) => !p.isDecoy && !p.isDummy).sort((a, b) => b.score - a.score || b.kills - a.kills);
  host.insertAdjacentHTML('beforeend', `
    <div class="scoreboard">
      <h2>${esc(game.t(MODES.find((m) => m.id === match.modeId)?.nameKey || 'menu.play'))}</h2>
      <table>
        <thead><tr><th></th><th>${esc(game.t('score.kills'))}</th><th>${esc(game.t('score.deaths'))}</th><th>${esc(game.t('score.assists'))}</th><th>${esc(game.t('hud.score'))}</th><th>${esc(game.t('score.ping'))}</th><th></th></tr></thead>
        <tbody>${rows.map((p) => `<tr class="${p.team === 'b' ? 'team-b' : 'team-a'} ${p.id === game.localId ? 'you' : ''}">
          <td>${esc(p.name)}${p.isBot ? ' ·' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${Math.round(p.score)}</td><td>${p.ping || 0}</td>
          <td>${p.isBot ? '' : `<button data-act="commend" data-id="${esc(p.id)}">${esc(game.t('score.commend'))}</button> <button data-act="report" data-id="${esc(p.id)}">${esc(game.t('score.report'))}</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`);
}

export function showResults(game, summary) {
  const host = document.getElementById('overlays');
  const you = summary?.players?.find((p) => p.id === game.localId);
  const won = summary?.winnerId === game.localId || (you && summary?.winnerTeam && you.team === summary.winnerTeam);
  host.innerHTML = `
    <div class="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="box">
      <p class="kicker">${esc(game.t('score.victory'))}</p>
      <h2>${won ? esc(game.t('score.victory')) : summary?.winnerId || summary?.winnerTeam ? esc(game.t('score.defeat')) : esc(game.t('score.draw'))}</h2>
      <p class="lead">+${you?.xp || 0} ${esc(game.t('score.xp'))} · +${you?.credits || 0} ${esc(game.t('score.credits'))}</p>
      ${(game.lastUnlocks || []).map((a) => `<p class="fine">${esc(game.t('announce.achievement'))}: ${esc(game.t('ach.' + a + '.name'))}</p>`).join('')}
      <table>
        <thead><tr><th></th><th>K</th><th>D</th><th>A</th><th>${esc(game.t('hud.score'))}</th></tr></thead>
        <tbody>${(summary?.players || []).map((p) => `<tr class="${p.id === game.localId ? 'you' : ''}"><td>${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${Math.round(p.score)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="row" style="margin-top:12px">
        <button class="primary" data-act="again">${esc(game.t('play.again'))}</button>
        <button class="ghost" data-act="menu">${esc(game.t('menu.back'))}</button>
      </div>
    </div></div>`;
}

export function showEditorTools(game) {
  const host = document.getElementById('overlays');
  host.querySelector('.editor-tools')?.remove();
  const tools = [['floor', 'editor.floor'], ['wall', 'editor.wall'], ['crate', 'editor.crate'], ['platform', 'editor.platform'], ['spawn_a', 'editor.spawn_a'], ['spawn_b', 'editor.spawn_b'], ['obj', 'editor.obj'], ['erase', 'editor.clear']];
  host.insertAdjacentHTML('beforeend', `
    <div class="editor-tools panel">
      <p class="kicker">${esc(game.t('editor.title'))}</p>
      <div class="row">${tools.map(([id, key]) => `<button class="chip ${game.editor?.tool === id ? 'on' : ''}" data-act="edit-tool" data-tool="${id}">${esc(game.t(key))}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="primary" data-act="edit-play">${esc(game.t('editor.play'))}</button>
        <button class="ghost" data-act="edit-save">${esc(game.t('menu.save'))}</button>
        <button class="ghost" data-act="leave">${esc(game.t('menu.exit'))}</button>
      </div>
      <p class="fine">${esc(game.t('editor.place'))}</p>
    </div>`);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
