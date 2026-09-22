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
  const s = 'stroke-width="2.2" stroke-linecap="square"';
  return `<g fill="none" stroke="${color}" ${s} opacity="0.85">
    <path d="M7 24 V7 H24"/><path d="M96 7 H113 V24"/><path d="M113 96 V113 H96"/><path d="M24 113 H7 V96"/>
  </g>`;
}

/** AAA operator portrait — layered, glowing, readable at 96px */
function opPortrait(c, teamColor) {
  const v = c.visual || {};
  const A = v.accent || '#5cffd6';
  const TC = teamColor || A;
  const bulk = v.bulk || 1;
  const sl = v.shoulders?.[0] ?? 1;
  const sr = v.shoulders?.[1] ?? 1;
  const cx = 60;
  const hw = 26 * bulk;
  const shY = 92 - (sl + sr) * 4;

  let body = '';
  // subtle scanlines
  body += `<g opacity="0.12"><path d="M0 18 H120 M0 36 H120 M0 54 H120 M0 72 H120 M0 90 H120 M0 108 H120" stroke="${A}" stroke-width="0.4"/></g>`;

  // back gear
  if (v.back === 'plate') {
    body += `<path d="M${cx - hw * 0.74} ${shY + 3} h${hw * 1.48} v-10 q0 -2 2 -2 h${hw * 1.48 -4} q2 0 2 2 v10 z" fill="#1b2330" stroke="${hexA(A, 0.55)}" stroke-width="1.2"/>`;
    body += `<rect x="${cx - hw*0.6}" y="${shY -2}" width="${hw*1.2}" height="2.2" rx="1" fill="${A}" opacity="0.9"/>`;
  }
  if (v.back === 'pack') {
    body += `<path d="M${cx - hw * 0.82} ${shY + 2} h${hw * 1.64} v-11 q0 -2.5 2.5 -2.5 h${hw*1.64-5} q2.5 0 2.5 2.5 v11 z" fill="#1b2330" stroke="rgba(255,255,255,0.08)"/>`;
    body += `<rect x="${cx - hw * 0.48}" y="${shY - 10}" width="5.5" height="9" rx="1.2" fill="${A}" opacity="0.9"/><rect x="${cx + hw * 0.48 -5.5}" y="${shY - 10}" width="5.5" height="9" rx="1.2" fill="${A}" opacity="0.9"/>`;
    body += `<circle cx="${cx - hw*0.48+2.7}" cy="${shY -12}" r="2" fill="#fff" opacity="0.9"/><circle cx="${cx + hw*0.48-2.8}" cy="${shY -12}" r="2" fill="#fff" opacity="0.9"/>`;
  }
  if (v.back === 'drone') {
    body += `<g><rect x="${cx + hw * 0.42}" y="${shY - 18}" width="17" height="7" rx="2.5" fill="#cfd6e0" stroke="rgba(0,0,0,0.2)"/><rect x="${cx + hw * 0.42 + 4.5}" y="${shY - 15.5}" width="8.5" height="2.6" rx="1" fill="${A}"/><circle cx="${cx + hw*0.42+13}" cy="${shY -14.5}" r="1.2" fill="#fff"/></g>`;
  }

  // torso with asymmetric shoulders, cloth folds
  const lCap = 11 * sl, rCap = 11 * sr;
  body += `<path d="M${cx - hw} 118 L${cx - hw} ${shY + 12}
    Q${cx - hw - lCap} ${shY+2} ${cx - hw + 6} ${shY - 2}
    L${cx - 11} ${shY - 7} L${cx + 11} ${shY - 7}
    L${cx + hw - 6} ${shY - 2}
    Q${cx + hw + rCap} ${shY+2} ${cx + hw} ${shY + 12}
    L${cx + hw} 118 Z" fill="#151c27" stroke="rgba(232,238,248,0.14)" stroke-width="1.1"/>`;
  // chest plate with highlight
  body += `<path d="M${cx - hw * 0.64} 118 L${cx - hw * 0.64} ${shY + 3} L${cx + hw * 0.64} ${shY + 3} L${cx + hw * 0.64} 118 Z" fill="#1d2531" stroke="rgba(255,255,255,0.06)"/>`;
  body += `<path d="M${cx - hw*0.64} ${shY+3} L${cx + hw*0.64} ${shY+3}" stroke="${hexA(A,0.35)}" stroke-width="1.2"/>`;
  body += `<rect x="${cx - 6}" y="${shY + 9}" width="12" height="5" rx="2" fill="${A}" opacity="0.95"/><rect x="${cx -6}" y="${shY+9}" width="12" height="5" rx="2" fill="${A}" opacity="0.25" style="filter:blur(3px)"/>`;
  if (v.coat) {
    body += `<path d="M${cx - hw} 118 L${cx - hw + 2.5} ${shY + 16} L${cx + hw - 2.5} ${shY + 16} L${cx + hw} 118 Z" fill="#10151d"/><path d="M${cx - hw + 2.5} ${shY + 16} H${cx + hw - 2.5}" stroke="${hexA(A, 0.7)}" stroke-width="1.6"/>`;
    body += `<path d="M${cx - hw*0.5} 118 L${cx - hw*0.45} ${shY+20}" stroke="${hexA(A,0.2)}" stroke-width="0.8" stroke-dasharray="3 3"/>`;
  }
  if (v.sash) {
    body += `<path d="M${cx - hw * 0.88} ${shY + 5} L${cx + hw * 0.28} ${shY + 5} L${cx + hw * 0.45} 118 L${cx + hw * 0.13} 118 Z" fill="${A}" opacity="0.85"/><path d="M${cx - hw*0.88} ${shY+5} L${cx + hw*0.28} ${shY+5}" stroke="#fff" stroke-width="0.6" opacity="0.6"/>`;
  }
  if (v.seam) {
    body += `<path d="M${cx - hw * 0.64} ${shY + 5} V118 M${cx + hw * 0.64} ${shY + 5} V118" stroke="${hexA(A, 0.65)}" stroke-width="1.6" stroke-dasharray="5 3"/>`;
  }
  // neck
  body += `<rect x="${cx - 7.5}" y="${shY - 15}" width="15" height="11" rx="2" fill="#0e131b"/>`;

  // head variants — more detailed
  const headY = shY - 17;
  if (v.head === 'hood') {
    body += `<path d="M${cx - 22} ${headY + 26} L${cx - 18.5} ${headY - 7} Q${cx} ${headY - 18} ${cx + 18.5} ${headY - 7} L${cx + 22} ${headY + 26} Q${cx} ${headY + 34} ${cx - 22} ${headY + 26} Z" fill="#1a212d" stroke="rgba(232,238,248,0.20)" stroke-width="1.1"/>`;
    body += `<path d="M${cx - 15} ${headY + 24} L${cx - 12} ${headY+1} Q${cx} ${headY - 8} ${cx + 12} ${headY+1} L${cx + 15} ${headY + 24} Q${cx} ${headY + 29} ${cx - 15} ${headY + 24} Z" fill="#070a0f"/>`;
    body += `<rect x="${cx - 11}" y="${headY + 9}" width="22" height="4.2" rx="2" fill="${TC}"/><rect x="${cx -11}" y="${headY+9}" width="22" height="4.2" rx="2" fill="${TC}" opacity="0.35" style="filter:blur(4px)"/>`;
    body += `<circle cx="${cx}" cy="${headY+11}" r="1.2" fill="#fff" opacity="0.9"/>`;
  } else if (v.head === 'wide') {
    body += `<rect x="${cx - 23}" y="${headY - 9}" width="46" height="34" rx="8" fill="#181f2b" stroke="rgba(232,238,248,0.20)" stroke-width="1.1"/>`;
    body += `<rect x="${cx - 19}" y="${headY + 5}" width="38" height="11" rx="3.5" fill="#070a0f"/>`;
    body += `<rect x="${cx - 17}" y="${headY + 8}" width="34" height="5" rx="2.2" fill="${TC}"/><rect x="${cx -17}" y="${headY+8}" width="34" height="5" rx="2.2" fill="${TC}" opacity="0.32" style="filter:blur(3.5px)"/>`;
    body += `<rect x="${cx - 5}" y="${headY - 4}" width="10" height="3.5" rx="1.5" fill="${A}"/><circle cx="${cx}" cy="${headY+10.5}" r="1" fill="#fff" opacity="0.85"/>`;
  } else {
    body += `<rect x="${cx - 18}" y="${headY - 7}" width="36" height="32" rx="7" fill="#181f2b" stroke="rgba(232,238,248,0.20)" stroke-width="1.1"/>`;
    body += `<rect x="${cx - 14}" y="${headY + 6}" width="28" height="9" rx="3.5" fill="#070a0f"/>`;
    body += `<rect x="${cx - 12}" y="${headY + 8.5}" width="24" height="4.4" rx="2" fill="${TC}"/><rect x="${cx -12}" y="${headY+8.5}" width="24" height="4.4" rx="2" fill="${TC}" opacity="0.30" style="filter:blur(3px)"/>`;
    body += `<path d="M${cx - 10} ${headY - 2} H${cx + 10}" stroke="${A}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${cx}" cy="${headY+10.7}" r="1" fill="#fff" opacity="0.85"/>`;
  }
  if (v.antenna) {
    body += `<path d="M${cx + 16} ${headY - 1} L${cx + 26} ${headY - 15}" stroke="#8b97ad" stroke-width="2.2" stroke-linecap="round"/><circle cx="${cx + 27}" cy="${headY - 17}" r="3" fill="${A}" stroke="#fff" stroke-width="0.6"/><circle cx="${cx+27}" cy="${headY-17}" r="5" fill="${A}" opacity="0.18" style="filter:blur(2px)"/>`;
  }

  // subtle vignette
  body += `<rect width="120" height="120" fill="url(#pg-${c.id})" opacity="0.9"/>`;

  return `<svg class="portrait" viewBox="0 0 120 120" role="img" aria-label="${esc(c.id)}">
    <defs>
      <radialGradient id="pg-${c.id}" cx="50%" cy="32%" r="78%">
        <stop offset="0%" stop-color="${hexA(A, 0.32)}"/><stop offset="45%" stop-color="${hexA(A, 0.09)}"/><stop offset="100%" stop-color="rgba(7,9,14,0)"/>
      </radialGradient>
      <linearGradient id="lg-${c.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${hexA(A,0.18)}"/><stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="#0a0f16"/>
    <rect width="120" height="120" fill="url(#lg-${c.id})"/>
    <g stroke="${hexA(A, 0.10)}" opacity="0.8"><path d="M0 24 H120 M0 48 H120 M0 72 H120 M0 96 H120 M24 0 V120 M48 0 V120 M72 0 V120 M96 0 V120"/></g>
    <g transform="translate(0,2)">${body}</g>
    ${corners(hexA(A, 0.85))}
    <g opacity="0.9"><path d="M8 8 L10 8 L8 10 Z" fill="${A}"/><path d="M112 8 L110 8 L112 10 Z" fill="${A}"/><path d="M8 112 L10 112 L8 110 Z" fill="${A}"/><path d="M112 112 L110 112 L112 110 Z" fill="${A}"/></g>
  </svg>`;
}

/** Weapon glyph — side profile with PBR-ish shading */
function weaponGlyph(def, accentColor) {
  const v = def.visual || {};
  const A = accentColor || v.accent || '#5cffd6';
  const body = v.color || '#9eb0c2';
  const dark = '#222a35';
  const dark2 = '#1a212c';
  let s = '';
  // background grid + glow
  s += `<rect x="0" y="0" width="160" height="64" fill="#0a0f16"/><g stroke="${hexA(A,0.10)}" opacity="0.9"><path d="M0 20 H160 M0 44 H160 M40 0 V64 M80 0 V64 M120 0 V64"/></g>`;
  s += `<ellipse cx="80" cy="32" rx="56" ry="18" fill="${A}" opacity="0.06" style="filter:blur(12px)"/>`;

  if (v.blade) {
    s += `<path d="M44 26 L138 23 L140 26 L138 30 L44 33 Z" fill="${body}" stroke="rgba(255,255,255,0.12)" stroke-width="0.6"/>`;
    s += `<path d="M44 27 L138 24.5" stroke="${A}" stroke-width="1.8" opacity="0.95"/><path d="M44 27 L138 24.5" stroke="${A}" stroke-width="4" opacity="0.18" style="filter:blur(2px)"/>`;
    s += `<rect x="38.5" y="21.5" width="6" height="15" rx="1.8" fill="${dark}" stroke="rgba(255,255,255,0.08)"/>`;
    s += `<path d="M20 26 L38 26 L38 32.5 L24 32.5 Q18 29.5 20 26 Z" fill="${dark2}" stroke="rgba(255,255,255,0.06)"/>`;
    s += `<circle cx="30" cy="29" r="2" fill="${A}" opacity="0.8"/>`;
  } else if (v.fist) {
    s += `<rect x="48" y="17" width="44" height="28" rx="10" fill="${body}" stroke="rgba(255,255,255,0.12)"/>`;
    s += `<circle cx="57" cy="17" r="3.6" fill="${dark}" stroke="rgba(255,255,255,0.1)"/><circle cx="68.5" cy="17" r="3.6" fill="${dark}"/><circle cx="80" cy="17" r="3.6" fill="${dark}"/>`;
    s += `<rect x="59" y="27" width="22" height="5" rx="2.5" fill="${A}"/><rect x="59" y="27" width="22" height="5" rx="2.5" fill="${A}" opacity="0.35" style="filter:blur(3px)"/>`;
    s += `<path d="M48 24 Q52 20 58 22" stroke="rgba(255,255,255,0.18)" fill="none" stroke-width="0.8"/>`;
  } else {
    const barrel = 18 + (v.barrel || 0.4) * 56;
    // receiver
    s += `<rect x="34" y="20" width="34" height="15" rx="2.5" fill="${body}" stroke="rgba(255,255,255,0.12)" stroke-width="0.6"/>`;
    s += `<rect x="34" y="17.5" width="38" height="3.5" rx="1.6" fill="${dark2}"/>`;
    // barrel with shading
    s += `<rect x="68" y="23.5" width="${barrel}" height="6.8" rx="1.8" fill="${dark}" stroke="rgba(255,255,255,0.06)"/>`;
    s += `<rect x="${68 + barrel - 2.8}" y="22.5" width="3.2" height="8.8" rx="1.2" fill="${body}"/>`;
    s += `<rect x="68" y="23.5" width="${barrel}" height="1.2" fill="rgba(255,255,255,0.12)" opacity="0.5"/>`;
    // grip
    s += `<path d="M68 35 L80 35 L76.5 48 L66.5 48 Z" fill="${dark2}" stroke="rgba(255,255,255,0.06)"/>`;
    if (v.stock) s += `<path d="M34 21.5 L16 26 L16 37 L34 35.5 Z" fill="${dark2}" stroke="rgba(255,255,255,0.06)"/><path d="M18 28 L32 29" stroke="${hexA(A,0.25)}" stroke-width="0.6"/>`;
    if (v.mag === 'drum') {
      s += `<circle cx="58" cy="42" r="10" fill="${body}" stroke="rgba(255,255,255,0.12)"/><circle cx="58" cy="42" r="3.8" fill="${dark2}"/><circle cx="58" cy="42" r="1.2" fill="${A}"/>`;
    } else if (v.mag === 'cell') {
      s += `<rect x="52" y="35" width="15" height="12" rx="2.5" fill="${A}" stroke="rgba(255,255,255,0.2)"/><rect x="52" y="35" width="15" height="12" rx="2.5" fill="${A}" opacity="0.28" style="filter:blur(3px)"/>`;
      s += `<rect x="54" y="37" width="11" height="2" rx="1" fill="#fff" opacity="0.7"/>`;
    } else if (v.mag === 'straight') {
      s += `<path d="M52 35 L66 35 L63 50 L50 50 Z" fill="${dark2}" stroke="rgba(255,255,255,0.08)"/><path d="M52 38 L66 38" stroke="rgba(255,255,255,0.12)" stroke-width="0.5"/>`;
    }
    if (v.optic === 'holo') {
      s += `<rect x="46" y="8.5" width="22" height="10" rx="2.5" fill="none" stroke="${dark2}" stroke-width="2.6"/><rect x="48" y="10.5" width="18" height="6" rx="1.5" fill="rgba(0,0,0,0.4)"/>`;
      s += `<circle cx="57" cy="13.5" r="2.6" fill="${A}"/><circle cx="57" cy="13.5" r="4.5" fill="${A}" opacity="0.18" style="filter:blur(2px)"/>`;
    } else if (v.optic === 'scope') {
      s += `<rect x="44" y="7.5" width="30" height="9" rx="4.5" fill="${dark2}" stroke="rgba(255,255,255,0.08)"/><circle cx="72" cy="12" r="3.6" fill="${A}" stroke="#fff" stroke-width="0.4"/><circle cx="72" cy="12" r="5.5" fill="${A}" opacity="0.18" style="filter:blur(2px)"/>`;
    } else {
      s += `<rect x="48" y="13.5" width="2.8" height="5.5" rx="0.8" fill="${dark2}"/><rect x="60" y="13.5" width="2.8" height="5.5" rx="0.8" fill="${dark2}"/>`;
    }
    s += `<rect x="36" y="26.5" width="30" height="2.6" rx="1.2" fill="${A}" opacity="0.92"/><rect x="36" y="26.5" width="30" height="2.6" rx="1.2" fill="${A}" opacity="0.25" style="filter:blur(2.5px)"/>`;
  }

  return `<svg class="wpnglyph" viewBox="0 0 160 64" role="img" aria-label="${esc(def.id)}">
    ${s}
    ${corners(hexA(A, 0.62))}
  </svg>`;
}

const brandLogo = (size = 42) => `<svg class="marksvg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <defs>
    <linearGradient id="vb-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5cffd6"/><stop offset="100%" stop-color="#2ec8ff"/>
    </linearGradient>
    <radialGradient id="vb-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5cffd6" stop-opacity="0.5"/><stop offset="100%" stop-color="#5cffd6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="24" cy="24" r="18" fill="url(#vb-glow)" opacity="0.6"/>
  <path d="M24 4 L42 24 L24 44 L6 24 Z" fill="none" stroke="url(#vb-grad)" stroke-width="2.8" stroke-linejoin="round"/>
  <path d="M24 12 L35 24 L24 36 L13 24 Z" fill="rgba(92,255,214,0.14)" stroke="rgba(92,255,214,0.6)" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M24 20.5 L28.5 24 L24 27.5 L19.5 24 Z" fill="#ffb03a" style="filter:drop-shadow(0 0 6px #ffb03a)"/>
  <circle cx="24" cy="24" r="2" fill="#fff" opacity="0.9"/>
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
    else if (act === 'mode') { g.draft.modeId = el.dataset.id; renderPanel(g); }
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
    return `<button data-act="nav" data-id="${id}" ${game.screen === id ? 'aria-current="page"' : ''} class="${game.screen === id ? 'on' : ''}">${esc(game.t(key))}</button>`;
  }).join('')}</div>`).join('');
  if (game.inMatch) nav.innerHTML = `<div class="nav-group"><p>${esc(game.t('controls.paused'))}</p><button data-act="resume">${esc(game.t('play.resume'))}</button><button class="on" data-act="nav" data-id="settings">${esc(game.t('menu.settings'))}</button><button data-act="leave">${esc(game.t('play.leave'))}</button></div>`;
  document.querySelectorAll('#lang-en, #lang-it').forEach((b) => b.classList.toggle('on', b.dataset.lang === game.i18n.lang));
  document.documentElement.lang = game.i18n.lang;
  const foot = document.getElementById('foot-season');
  if (foot) foot.textContent = game.t('menu.version');
  const status = document.getElementById('foot-status');
  if (status) {
    status.textContent = !game.viewReady
      ? game.t('meta.loading')
      : game.net?.online ? `${game.t('net.connected')} ${game.net.ping || 0}ms ●` : game.t('net.local');
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
  if (home) hero.innerHTML = `
    <div><p class="kicker">${esc(game.t('menu.version'))}</p><h2>${esc(game.t('home.title'))}</h2><p class="hero-copy">${esc(game.t('home.desc'))}</p></div>
    <div class="hero-bottom"><span class="live-badge">${esc(game.t('home.ready'))}</span><h3>${esc(game.t(CHARACTERS.find((c) => c.id === (game.activeCharacter?.() || game.profile.loadouts?.[game.profile.activeLoadout || 0]?.characterId || 'ryn'))?.nameKey || ''))}</h3>
    <button class="ghost" data-act="nav" data-id="loadout">${esc(game.t('home.edit'))} ↗</button>
    <div class="quick-links"><button data-act="tutorial">${esc(game.t('menu.tutorial'))} <span>↗</span></button><button data-act="range">${esc(game.t('home.range'))} <span>↗</span></button></div></div>`;
  panel.innerHTML = (screens[game.screen] || playScreen)(game);
  if (optionsOpen && panel.querySelector('.match-options')) panel.querySelector('.match-options').open = true;
  if (focused?.act) {
    [...panel.querySelectorAll('[data-act]')].find((el) => el.dataset.act === focused.act && el.dataset.id === focused.id && el.dataset.action === focused.action)?.focus({ preventScroll: true });
  }
}

function playScreen(game) {
  const d = game.draft;
  const modes = MODES.filter((m) => !m.practice);
  const maps = MAPS.filter((m) => m.combat);
  const selected = modes.find((m) => m.id === d.modeId) || modes[0];
  return `<div class="play-heading"><p class="kicker">01 / ${esc(game.t('menu.play'))}</p><h2>${esc(game.t('home.setup'))}</h2><p class="lead">${esc(game.t('home.setup_hint'))}</p></div>
    <section class="setup-section"><h3>${esc(game.t('play.mode'))}</h3>
    <div class="mode-grid">${modes.map((m, i) => `<button class="mode-card ${m.id === d.modeId ? 'on' : ''}" data-act="mode" data-id="${m.id}" aria-pressed="${m.id === d.modeId}"><span class="mode-index">${String(i + 1).padStart(2, '0')}</span><strong>${esc(game.t(m.nameKey))}</strong><span class="mode-check">${m.id === d.modeId ? '●' : '○'}</span></button>`).join('')}</div><p class="fine mode-description">${esc(game.t(selected.descKey))}</p></section>
    <section class="setup-section"><h3>${esc(game.t('play.map'))}</h3><div class="row">
      ${chip('map', 'random', game.t('play.random'), d.mapId === 'random')}
      ${maps.map((m) => chip('map', m.id, game.t(m.nameKey), d.mapId === m.id)).join('')}</div></section>
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
    <div class="statline"><span style="font-weight:700;color:white">${Math.round(rank.rating || 0)} ${esc(game.t('profile.rating'))}</span><span>${next ? esc(game.t('rank.' + next.id)) : 'MAX'}</span></div>
    <div class="bar amber"><span style="width:${next ? Math.max(6, ((rank.rating - current.min) / span) * 100) : 100}%"></span></div>
    <div class="grid2" style="margin-top:14px">
      <div class="card"><p class="fine">${esc(game.t('rank.placements', { n: rank.placementsLeft ?? 0 }))}</p><strong style="font-family:var(--mono)">${rank.placementsLeft ?? 0} left</strong></div>
      <div class="card"><p class="fine">${esc(game.t('profile.matches'))}</p><strong style="font-family:var(--mono)">${rank.matches || 0}</strong></div>
    </div>
    <p class="fine" style="margin-top:12px">${esc(game.t('rank.abandon'))}</p>
    <p class="fine">${esc(game.t('rank.local_warn'))}</p>
    ${locked > 0
      ? `<p class="fine" style="color:var(--red)">⛔ ${esc(game.t('rank.locked', { n: locked }))}</p>`
      : `<button class="primary" data-act="ranked" style="margin-top:16px;width:100%;justify-content:center">▶ ${esc(game.t('rank.queue'))}</button>`}
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
        <h2 style="font-size:22px">${esc(game.t(ch.nameKey))}</h2>
        <p class="fine" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"><span style="background:rgba(92,255,214,0.12);padding:2px 8px;border-radius:10px;border:1px solid rgba(92,255,214,0.2)">${esc(game.t(ch.roleKey))}</span> <span>${esc(game.t(ch.tacticalKey))}</span> · <span>${esc(game.t(ch.ultimateKey))}</span></p>
      </div>
    </div>
    <div class="row" style="margin-top:14px">${kits.map((k, n) => `<button class="chip ${n === i ? 'on' : ''}" data-act="kit" data-i="${n}">${esc(k.name || game.t('kit.slot', { n: n + 1 }))}</button>`).join('')}</div>
    ${weaponCard(game, 'primary', load)}
    ${weaponCard(game, 'secondary', load)}
    ${weaponCard(game, 'melee', load)}
    <p class="fine" style="margin-top:10px;opacity:0.7">${esc(game.t('board.cosmetic'))} — attachments affect feel, not damage.</p>
  `;
}

function weaponCard(game, slot, load) {
  const state = load?.[slot];
  const id = state?.defId || (slot === 'secondary' ? 'flick2' : slot === 'melee' ? 'vectorblade' : 'linecut');
  const list = weaponsBySlot(slot);
  const at = state?.attachments || [];
  const kinds = [...new Set(list[0]?.attachments || ['barrel', 'optic', 'mag', 'stock'])];
  const def = WEAPON_LIST.find(w=>w.id===id);
  return `
    <div class="card" style="margin:12px 0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">${esc(game.t('kit.' + slot))}</h3>
        ${def ? `<span class="fine" style="font-family:var(--mono);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px">${esc(game.t('cat.'+def.category))} · ${def.mag} mag</span>` : ''}
      </div>
      <div class="row">${list.map((w) => `<button class="chip ${w.id === id ? 'on' : ''}" data-act="equip" data-slot="${slot}" data-id="${w.id}">${esc(game.t(w.nameKey))}</button>`).join('')}</div>
      ${slot === 'melee' ? '' : `<div class="row" style="margin-top:8px">${kinds.map((k) => {
        const cur = at.find((a) => ATTACHMENTS[a]?.slot === k);
        return `<button class="chip" data-act="attach" data-slot="${slot}" data-kind="${k}" style="font-size:10px">${esc(game.t(cur ? 'attach.' + cur : 'attach.none'))} <span style="opacity:0.6">${k}</span></button>`;
      }).join('')}</div>`}
    </div>`;
}

function characterScreen(game) {
  const id = game.activeCharacter();
  return `
    <p class="kicker">${esc(game.t('menu.operators'))} — ${CHARACTERS.length} available</p>
    <h2>${esc(game.t('kit.operator'))}</h2>
    <p class="lead">Operators are playstyle accents. Gunplay stays primary.</p>
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
              <span class="fine" title="${esc(game.t(c.passiveKey))}">◉ ${esc(game.t(c.passiveKey))}</span>
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
    <p class="kicker">${esc(game.t('menu.armory'))} — ${WEAPON_LIST.length} weapons</p>
    <div class="wpn-hero" style="--op:${accent}">
      <div class="wpn-art">${weaponGlyph(def, accent)}</div>
      <div class="wpn-meta">
        <h2>${esc(game.t(def.nameKey))}</h2>
        <p class="lead" style="margin:6px 0 10px">${esc(game.t(def.descKey))}</p>
        <p class="fine" style="display:flex;gap:6px;flex-wrap:wrap"><span style="background:${hexA(accent,0.15)};border:1px solid ${hexA(accent,0.3)};padding:2px 8px;border-radius:10px;color:${accent}">${esc(game.t(def.projectile ? 'kit.projectile' : 'kit.hitscan'))}</span><span style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px">${esc(game.t('cat.' + def.category))}</span><span style="background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:10px">${def.rarity}</span></p>
      </div>
    </div>
    <div class="grid3">
      ${stat(game.t('kit.dps'), Math.round(def.damage * (def.pellets || 1) * (def.fireRate || 1)))}
      ${stat(game.t('kit.ttk'), estimateTTK(def).toFixed(2) + 's')}
      ${stat(game.t('kit.mag'), def.mag)}
      ${stat(game.t('kit.reload'), def.reload.toFixed(2) + 's')}
      ${stat(game.t('kit.range'), Math.round(def.range)+'m')}
      ${stat(game.t('kit.mobility'), def.mobility.toFixed(2))}
    </div>
    ${cats.map((cat) => `<div style="margin-top:12px"><p class="fine" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em">${esc(game.t('cat.'+cat))}</p><div class="row">${WEAPON_LIST.filter((w) => w.category === cat).map((w) => `<button class="chip ${w.id === id ? 'on' : ''}" data-act="weapon" data-id="${w.id}">${esc(game.t(w.nameKey))}</button>`).join('')}</div></div>`).join('')}
  `;
}

function customizeScreen(game) {
  const groups = {};
  for (const c of game.catalog || []) (groups[c.slot] ||= []).push(c);
  const titles = { characterSkin: 'board.skins', weaponSkin: 'board.weapons', emote: 'board.emotes', banner: 'board.banners', killEffect: 'board.effects' };
  return `
    <p class="kicker">${esc(game.t('menu.customize'))}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <h2 style="margin:0">${esc(game.t('board.credits'))}: <span style="color:var(--amber)">${game.profile.credits || 0}</span></h2>
      <span class="fine" style="background:rgba(92,255,214,0.1);padding:4px 10px;border-radius:20px;border:1px solid rgba(92,255,214,0.15)">${esc(game.t('season.track'))}: ${game.profile.seasonXp || 0} ${esc(game.t('season.xp'))}</span>
    </div>
    <p class="lead">${esc(game.t('board.cosmetic'))}</p>
    ${Object.entries(groups).map(([slot, list]) => `
      <h3 style="margin:16px 0 8px;font-size:12px;letter-spacing:0.1em;display:flex;align-items:center;gap:8px"><span style="width:3px;height:14px;background:var(--mint);border-radius:2px;display:inline-block;box-shadow:0 0 8px var(--mint)"></span>${esc(game.t(titles[slot] || slot))} <span style="opacity:0.6;font-family:var(--mono);font-size:10px">${list.length}</span></h3>
      <div class="stack">${list.map((c) => {
        const owned = game.owns(c);
        return `<div class="card" style="display:flex;justify-content:space-between;gap:12px;align-items:center">
          <div><strong style="font-size:13px">${esc(game.t(c.nameKey))}</strong><p class="fine">${owned ? '✓ '+esc(game.t('board.owned')) : (c.cost || 0) + ' ' + esc(game.t('board.credits'))}</p></div>
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
    <div class="grid2">
      <button class="card" data-act="tutorial" style="text-align:left;padding:16px"><h3>▶ ${esc(game.t('menu.tutorial'))}</h3><p class="fine">Under 10 minutes. Learn movement, shooting, objectives.</p></button>
      <button class="card" data-act="range" style="text-align:left;padding:16px"><h3>◉ ${esc(game.t('home.range'))}</h3><p class="fine">Calibration bay with all weapons and moving targets.</p></button>
    </div>
    <div style="margin-top:16px">
      <h3 style="margin:0 0 8px">${esc(game.t('play.difficulty'))} — Drills</h3>
      <p class="fine" style="margin-bottom:10px">${esc(game.t('how.4'))}</p>
      <div class="row">${DIFFICULTY_IDS.map((id) => `<button class="chip" data-act="drill" data-diff="${id}" style="padding:10px 16px">${esc(game.t('diff.' + id))}</button>`).join('')}</div>
    </div>
    <button class="ghost" data-act="watch-replay" style="margin-top:16px;width:100%">${esc(game.t('replay.play'))} — watch last match</button>
  `;
}

function customScreen(game) {
  const s = game.settings;
  return `
    <p class="kicker">${esc(game.t('menu.custom'))}</p>
    <h2>${esc(game.t('custom.create'))}</h2>
    <p class="lead">Private matches — change time, score, health, respawn, friendly fire, regen. Share a room code.</p>
    <div class="grid2">
      <label class="field">${esc(game.t('custom.time'))} (min)<input type="number" min="3" max="20" value="${s.customMinutes || 8}" data-setting="customMinutes" /></label>
      <label class="field">${esc(game.t('custom.score'))}<input type="number" min="10" max="200" value="${s.customScore || 100}" data-setting="customScore" /></label>
      <label class="field">${esc(game.t('custom.health'))}<input type="number" min="50" max="200" value="${s.customHealth || 100}" data-setting="customHealth" /></label>
      <label class="field">${esc(game.t('custom.respawn'))} (sec)<input type="number" min="0" max="8" step="0.5" value="${s.customRespawn ?? 3}" data-setting="customRespawn" /></label>
      <label class="field toggle-field"><span>${esc(game.t('custom.ff'))}</span><input type="checkbox" data-setting="customFriendly" ${s.customFriendly ? 'checked' : ''}/></label>
      <label class="field toggle-field"><span>${esc(game.t('custom.regen'))}</span><input type="checkbox" data-setting="customRegen" ${s.customRegen !== false ? 'checked' : ''}/></label>
      <label class="field" style="grid-column:1 / -1">${esc(game.t('custom.code'))}<input id="room-code" maxlength="8" data-setting="roomCode" value="${esc(s.roomCode || '')}" placeholder="e.g. A3F9" style="font-family:var(--mono);letter-spacing:0.2em;text-transform:uppercase" /></label>
    </div>
    <div class="row" style="margin-top:16px">
      <button class="primary" data-act="custom-host">${esc(game.t('custom.create'))}</button>
      <button class="ghost" data-act="custom-join">${esc(game.t('custom.join'))}</button>
      <button class="ghost" data-act="editor">${esc(game.t('editor.title'))} — map editor</button>
    </div>
    <p class="fine" style="margin-top:10px">${esc(game.t('custom.local_only'))}</p>
  `;
}

function profileScreen(game) {
  const p = game.profile;
  const lv = levelFromXp(p.xp || 0);
  const ach = ACHIEVEMENTS;
  const unlocked = p.achievements || {};
  const challenges = p.challenges?.list || [];
  return `
    <p class="kicker">${esc(game.t('menu.profile'))} — Level ${lv.level}</p>
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <h2 style="margin:0">${esc(p.name)}</h2>
      <span class="fine" style="background:rgba(255,176,58,0.12);border:1px solid rgba(255,176,58,0.2);padding:4px 12px;border-radius:20px;color:var(--amber);font-family:var(--mono)">LV ${lv.level} · ${Math.round((lv.into/lv.next)*100)}%</span>
    </div>
    <label class="field" style="margin-top:12px">${esc(game.t('profile.name'))}<input id="callsign" value="${esc(p.name)}" maxlength="16" /></label>
    <div class="statline" style="margin-top:12px"><span>${esc(game.t('profile.level'))} ${lv.level}</span><span>${lv.into}/${lv.next} ${esc(game.t('score.xp'))}</span></div>
    <div class="bar"><span style="width:${Math.max(6, (lv.into / Math.max(1, lv.next)) * 100)}%"></span></div>
    <div class="grid3" style="margin-top:14px">
      ${stat(game.t('profile.matches'), p.stats.matches || 0)}
      ${stat(game.t('profile.wins'), p.stats.wins || 0)}
      ${stat(game.t('hud.elim'), p.stats.kills || 0)}
      ${stat(game.t('profile.accuracy'), Math.round((p.stats.shots ? p.stats.hits / p.stats.shots : 0) * 100) + '%')}
      ${stat(game.t('profile.headshot'), Math.round((p.stats.hits ? p.stats.headshots / p.stats.hits : 0) * 100) + '%')}
      ${stat(game.t('profile.rating'), Math.round(p.rank?.rating || 0))}
    </div>
    <p class="fine" style="margin-top:10px;opacity:0.7">${esc(game.t('profile.local'))} — export to keep progress.</p>
    <div class="row" style="margin-top:8px">
      <button class="ghost" data-act="export-profile">${esc(game.t('profile.export'))}</button>
      <label class="chip" style="cursor:pointer">${esc(game.t('profile.import'))}<input id="import-file" type="file" accept="application/json" hidden /></label>
    </div>
    <h3 style="margin:18px 0 8px;display:flex;align-items:center;gap:8px"><span style="width:3px;height:14px;background:var(--amber);border-radius:2px;display:inline-block"></span>${esc(game.t('profile.challenges'))}</h3>
    ${challenges.map((c) => `<div class="card" style="margin-bottom:6px"><div class="statline"><span>${esc(game.t('challenge.' + c.template, { n: c.amount, class: c.classId || '' }))}</span><span style="font-weight:700;color:${c.done?'var(--mint)':'var(--muted)'}">${c.progress || 0}/${c.amount}</span></div><div class="bar amber"><span style="width:${Math.min(100, ((c.progress || 0) / c.amount) * 100)}%"></span></div></div>`).join('') || `<p class="fine">No challenges — play a match to refresh.</p>`}
    <h3 style="margin:18px 0 8px;display:flex;align-items:center;gap:8px"><span style="width:3px;height:14px;background:var(--mint);border-radius:2px;display:inline-block"></span>${esc(game.t('profile.achievements'))} ${Object.keys(unlocked).length}/${ach.length}</h3>
    <div class="stack" style="max-height:240px;overflow:auto;padding-right:4px">
      ${ach.map((a) => `<div class="card ${unlocked[a.id] ? 'on' : ''}" style="padding:10px 12px"><h3 style="font-size:13px;margin:0 0 2px">${unlocked[a.id]?'✓ ':''}${esc(game.t('ach.' + a.id + '.name'))}</h3><p style="font-size:11px">${esc(game.t('ach.' + a.id + '.desc'))}</p></div>`).join('')}
    </div>`;
}

function leaderScreen(game) {
  const rows = game.leaders || [];
  const board = game.draft.board || 'rating';
  return `
    <p class="kicker">${esc(game.t('menu.leaderboards'))}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <h2 style="margin:0">${esc(game.t('lb.' + board))}</h2>
      <div class="row">${['rating', 'wins', 'elims', 'obj'].map((id) => chip('lb', id, game.t('lb.' + id), board === id)).join('')}</div>
    </div>
    <table style="margin-top:12px"><thead><tr><th>#</th><th>${esc(game.t('profile.name'))}</th><th>${esc(game.t('lb.' + board))}</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}" style="${r.you?'font-weight:700':''}"><td>${i + 1}</td><td>${esc(r.name)}${r.you?' — you':''}</td><td>${Math.round(r.value || 0)}</td></tr>`).join('') || `<tr><td colspan="3" style="text-align:center;padding:20px;opacity:0.6">${esc(game.t('lb.offline'))}</td></tr>`}</tbody></table>
    <p class="fine" style="margin-top:10px">Official boards update via relay. Local play shows your personal best.</p>`;
}

function socialScreen(game) {
  const friends = game.profile.friends || [];
  return `
    <p class="kicker">${esc(game.t('menu.social'))}</p>
    <h2>${esc(game.t('social.friends'))}</h2>
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin:10px 0">
      <div><p class="fine">${esc(game.t('social.code'))}</p><strong style="font-family:var(--mono);letter-spacing:0.15em;font-size:16px">${esc(game.profile.code || '')}</strong></div>
      <span style="width:10px;height:10px;border-radius:50%;background:var(--mint);box-shadow:0 0 10px var(--mint)"></span>
    </div>
    <label class="field">${esc(game.t('social.add'))}<input id="friend-code" maxlength="12" placeholder="Enter friend code" style="font-family:var(--mono)" /></label>
    <div class="row" style="margin-top:10px">
      <button class="primary" data-act="friend-add">+ ${esc(game.t('social.add'))}</button>
      <button class="ghost" data-act="party">${esc(game.t('social.party'))}</button>
      <button class="ghost" data-act="voice">🎙 ${esc(game.t('social.voice'))}</button>
    </div>
    <div class="stack" style="margin-top:14px">
      ${friends.map((f) => `<div class="card" style="display:flex;justify-content:space-between"><div><strong>${esc(f.name)}</strong><p class="fine">${esc(f.code)}</p></div><span style="color:var(--mint)">● online</span></div>`).join('') || `<div class="card" style="text-align:center;padding:20px"><p class="fine">${esc(game.t('social.empty'))}</p><p style="font-size:12px;margin-top:4px;opacity:0.7">Add friends by code to queue together.</p></div>`}
    </div>
    <p class="fine" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><span>${esc(game.t('social.push'))}</span><span>·</span><span>${esc(game.t('social.team_only'))}</span></p>`;
}

function settingsScreen(game) {
  const s = game.settings;
  const tab = game.settingsTab || 'controls';
  const range = (label, key, min, max, step) => slider(game, label, key, s[key], min, max, step);
  const toggle = (label, key) => `<label class="field toggle-field"><span>${esc(game.t(label))}</span><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`;
  const select = (label, key, options, prefix) => `<label class="field">${esc(game.t(label))}<select data-setting="${key}">${options.map((q) => `<option value="${q}" ${s[key] === q ? 'selected' : ''}>${esc(game.t(prefix + q))}</option>`).join('')}</select></label>`;
  const tabs = ['controls', 'gameplay', 'video', 'audio', 'bindings'];
  const content = {
    controls: `<h3>Mouse & Look</h3><p class="lead">${esc(game.t('controls.hint'))} — no button hold needed, free mouse look.</p>
      ${range('set.sens', 'sens', 0.2, 4, 0.05)}${range('set.ads', 'adsSens', 0.3, 1, 0.05)}${toggle('set.inverty', 'invertY')}
      <h3>Controller</h3>${range('set.controller', 'controllerSens', 0.5, 5, 0.1)}${range('set.deadzone', 'deadzone', 0.05, 0.4, 0.01)}${range('set.accel', 'lookAccel', 1, 2.2, 0.1)}${toggle('set.aimassist', 'aimAssist')}`,
    gameplay: `${toggle('settings.hold_aim', 'holdAim')}${toggle('settings.toggle_crouch', 'toggleCrouch')}${toggle('settings.auto_sprint', 'autoSprint')}${toggle('set.damage_numbers', 'damageNumbers')}${toggle('set.subtitles', 'subtitles')}${range('set.ui_scale', 'hudScale', 0.8, 1.5, 0.05)}
      ${select('set.crosshair', 'crosshair', CROSSHAIR_STYLES, 'set.ch.')}
      <h3>${esc(game.t('menu.language'))}</h3><div class="row"><button class="chip ${game.i18n.lang==='en'?'on':''}" data-act="lang" data-lang="en">English — default</button><button class="chip ${game.i18n.lang==='it'?'on':''}" data-act="lang" data-lang="it">Italiano</button></div>`,
    video: `${range('set.fov', 'fov', 60, 100, 1)}${select('set.preset', 'quality', ['low', 'medium', 'high', 'ultra'], 'set.')}${select('set.colorblind', 'colorblind', ['off', 'deutan', 'protan', 'tritan'], 'set.cb.')}${toggle('set.shake', 'screenShake')}${toggle('set.reduce_shake', 'reduceMotion')}${toggle('set.reduce_fx', 'reduceFx')}${toggle('set.showfps', 'showFps')}
      <p class="fine" style="margin-top:12px">High/Ultra enables shadows, bloom, contact shadows, and high-res textures. Low disables FX for 60+ fps on integrated GPUs.</p>`,
    audio: `${range('set.master', 'master', 0, 1, 0.01)}${range('set.music', 'music', 0, 1, 0.01)}${range('set.sfx', 'sfx', 0, 1, 0.01)}${range('set.voice', 'voice', 0, 1, 0.01)}
      <p class="fine" style="margin-top:12px">Original synthesized audio — no sampled library. Spatial audio with distance attenuation and stereo panning.</p>`,
    bindings: `<p class="lead">${esc(game.t('settings.bind_hint'))} — click to rebind, Esc to cancel.</p><div class="binding-grid">${Object.entries(s.bindings).map(([action, code]) => `<div class="statline"><span style="font-weight:500">${esc(game.t('bind.' + action))}</span><button class="chip" data-act="rebind" data-action="${action}" style="min-width:110px;justify-content:center">${esc(game.rebindAction === action ? game.t('set.press') : code)}</button></div>`).join('')}</div><button class="ghost" data-act="reset-binds">${esc(game.t('settings.reset_bindings'))}</button>`,
  };
  return `<p class="kicker">${esc(game.t('nav.system'))} — settings</p><div class="settings-heading"><h2>${esc(game.t('menu.settings'))}</h2><span class="saved-indicator">● ${esc(game.t('settings.saved'))}</span></div>
    <div class="settings-tabs" role="tablist" aria-label="${esc(game.t('menu.settings'))}">${tabs.map((id) => `<button role="tab" aria-selected="${tab === id}" aria-controls="settings-content" class="chip ${tab === id ? 'on' : ''}" data-act="settings-tab" data-id="${id}">${esc(game.t('settings.' + id))}</button>`).join('')}</div>
    <div class="settings-content" id="settings-content" role="tabpanel">${content[tab] || content.controls}</div>`;
}

function slider(game, labelKey, key, value, min, max, step) {
  const pct = ((value - min) / (max - min)) * 100;
  return `<label class="field range-field">${esc(game.t(labelKey))} <output data-value="${key}">${Number(value).toFixed(2)}</output>
    <div style="grid-column:1 / -1;position:relative;margin-top:14px">
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}" style="background:linear-gradient(90deg,var(--mint) ${pct}%, rgba(255,255,255,0.08) ${pct}%);height:4px;border-radius:2px" />
    </div>
  </label>`;
}
function chip(act, id, label, on) {
  return `<button class="chip ${on ? 'on' : ''}" aria-pressed="${!!on}" data-act="${act}" data-id="${id}">${esc(label)}</button>`;
}
function stat(label, value) {
  return `<div class="card" style="padding:10px 12px"><p class="fine" style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em">${esc(label)}</p><strong style="font-size:15px;font-family:var(--mono)">${esc(value)}</strong></div>`;
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
      <div id="mode-label" class="fine" style="font-family:var(--mono);letter-spacing:0.08em;margin-top:2px"></div>
    </div>
    <div class="compass" id="compass"></div>
    <canvas class="minimap" id="minimap" width="160" height="160"></canvas>
    <div class="feed" id="feed"></div>
    <div class="vitals">
      <div class="hp" id="hp">100</div>
      <div class="bar hp"><span id="hp-bar" style="width:100%"></span></div>
      <div class="sub" id="armor-line"></div>
      <div class="sub" id="status-line"></div>
    </div>
    <div class="ammo"><strong id="ammo">30</strong><span id="weapon-name"></span><div class="fine" id="fps" style="margin-top:4px;font-family:var(--mono)"></div></div>
    <div class="abilities">
      <div class="ability" id="tac"><span id="tac-name" style="font-weight:600;letter-spacing:0.04em"></span><div class="cd hidden" id="tac-cd"></div></div>
      <div class="ability ult" id="ult"><span id="ult-name" style="font-weight:700"></span><div class="cd hidden" id="ult-cd"></div></div>
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
  if (bar) {
    const pct = Math.max(0, (player.hp / (player.maxHp || 100)) * 100);
    bar.style.width = `${pct}%`;
    bar.style.background = pct<30 ? 'linear-gradient(90deg,#ff4d5a,#ff8a6a)' : pct<60 ? 'linear-gradient(90deg,#ffb03a,#ffe1a8)' : 'linear-gradient(90deg,#2ec8ff,#5cffd6)';
  }
  set('armor-line', player.armor > 0 ? `${game.t('hud.armor')} ${Math.ceil(player.armor)}` : (player.carrying ? game.t('hud.carry') : ''));
  const st = [];
  if (player.reloading) st.push('⟳ '+game.t('hud.reload'));
  if (!player.alive) st.push(`◷ ${game.t('hud.respawn')} ${Math.max(0, player.deathT || 0).toFixed(1)}`);
  if (player.slowT > 0) st.push('⚠ '+game.t('hud.loss'));
  if (player.sprinting) st.push('⚡ sprint');
  set('status-line', st.join(' · '));
  const mag = player.weapons?.[player.weaponSlot || 0];
  const def = WEAPON_LIST.find((w) => w.id === (player.weaponId || mag?.defId));
  set('ammo', player.alive ? (def?.melee ? '—' : `${mag?.mag ?? player.mag ?? 0} / ${mag?.reserve ?? ''}`) : '');
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
    ultCd.textContent = ready ? game.t('hud.ready') : `${Math.floor(player.ult || 0)}%`;
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
  if (game.settings.showFps) set('fps', `${game.fps || 0} FPS · ${game.net?.ping||0}ms`);
  document.getElementById('lowhp')?.classList.toggle('hidden', !(player.alive && player.hp < 30));
  const cross = document.getElementById('cross');
  if (cross) {
    cross.className = `cross ${game.settings.crosshair || 'cross'} ${game.hitPulse > 0 ? 'hit' : ''}`;
    cross.style.opacity = player.aiming ? '0.65' : '0.92';
    cross.style.transform = `translate(-50%,-50%) scale(${player.aiming?0.75:1})`;
  }
  const compass = document.getElementById('compass');
  if (compass) {
    const marks = [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['W', -Math.PI / 2]];
    compass.innerHTML = marks.map(([lab, ang]) => {
      let d = ang - player.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const x = 160 - d * 80;
      if (x<-20||x>340) return '';
      return `<span style="left:${x}px;opacity:${1-Math.abs(d)/2}">${lab}</span>`;
    }).join('') + `<div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--mint);opacity:0.6;box-shadow:0 0 6px var(--mint)"></div>`;
  }
  const feed = document.getElementById('feed');
  if (feed) feed.innerHTML = (game.feed || []).slice(-5).map((f) => `<div>${esc(f)}</div>`).join('');
  const log = document.getElementById('chatlog');
  if (log) log.innerHTML = (game.chat || []).slice(-6).map((c) => `<div><b style="color:var(--mint)">${esc(c.name)}</b> ${esc(c.text)}</div>`).join('');
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
      <p class="kicker">VECTORBREAK — paused</p>
      <h2 id="pause-title">${esc(game.t('controls.paused'))}</h2><p class="lead">${esc(game.t('controls.hint'))} — your controls are neutralized, match continues online.</p>
      <div class="stack">
        <button class="primary" data-act="resume" style="width:100%;justify-content:center">▶ ${esc(game.t('play.resume'))}</button>
        <div class="grid2"><button class="ghost" data-act="nav" data-id="settings">${esc(game.t('menu.settings'))}</button><button class="ghost" data-act="spectate">${esc(game.t('hud.freecam'))}</button></div>
        <div class="grid2"><button class="ghost" data-act="export-replay">${esc(game.t('replay.save'))}</button><button class="danger" data-act="leave">${esc(game.t('play.leave'))}</button></div>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h2 style="margin:0">${esc(game.t(MODES.find((m) => m.id === match.modeId)?.nameKey || 'menu.play'))}</h2><span class="fine" style="font-family:var(--mono)">${match.timeLeft ? Math.floor(match.timeLeft/60)+':'+String(Math.floor(match.timeLeft%60)).padStart(2,'0') : ''}</span></div>
      <table>
        <thead><tr><th>Operator</th><th>${esc(game.t('score.kills'))}</th><th>${esc(game.t('score.deaths'))}</th><th>${esc(game.t('score.assists'))}</th><th>${esc(game.t('hud.score'))}</th><th>${esc(game.t('score.ping'))}</th><th></th></tr></thead>
        <tbody>${rows.map((p) => `<tr class="${p.team === 'b' ? 'team-b' : 'team-a'} ${p.id === game.localId ? 'you' : ''}">
          <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${p.team==='b'?'#ff5a3c':'#2ec8ff'};box-shadow:0 0 6px ${p.team==='b'?'#ff5a3c':'#2ec8ff'}"></span>${esc(p.name)}${p.isBot ? ' · BOT' : ''}</span></td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${Math.round(p.score)}</td><td>${p.ping || 0}</td>
          <td>${p.isBot ? '' : `<button class="chip" data-act="commend" data-id="${esc(p.id)}" style="padding:4px 8px;font-size:10px">${esc(game.t('score.commend'))}</button> <button class="chip" data-act="report" data-id="${esc(p.id)}" style="padding:4px 8px;font-size:10px">${esc(game.t('score.report'))}</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`);
}

export function showResults(game, summary) {
  const host = document.getElementById('overlays');
  const you = summary?.players?.find((p) => p.id === game.localId);
  const won = summary?.winnerId === game.localId || (you && summary?.winnerTeam && you.team === summary.winnerTeam);
  host.innerHTML = `
    <div class="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="box" style="width:min(760px,94vw)">
      <p class="kicker">${won ? 'Victory' : summary?.winnerId || summary?.winnerTeam ? 'Defeat' : 'Draw'} — ${esc(game.t(MODES.find(m=>m.id===summary?.modeId)?.nameKey||''))}</p>
      <h2 style="font-size:38px;margin:8px 0 6px">${won ? esc(game.t('score.victory')) : summary?.winnerId || summary?.winnerTeam ? esc(game.t('score.defeat')) : esc(game.t('score.draw'))}</h2>
      <p class="lead" style="display:flex;gap:10px;flex-wrap:wrap"><span style="background:rgba(92,255,214,0.12);border:1px solid rgba(92,255,214,0.2);padding:4px 10px;border-radius:20px;color:var(--mint)">+${you?.xp || 0} ${esc(game.t('score.xp'))}</span><span style="background:rgba(255,176,58,0.12);border:1px solid rgba(255,176,58,0.2);padding:4px 10px;border-radius:20px;color:var(--amber)">+${you?.credits || 0} ${esc(game.t('score.credits'))}</span><span class="fine">${summary?.duration ? Math.floor(summary.duration/60)+':'+String(Math.floor(summary.duration%60)).padStart(2,'0') : ''} · ${summary?.mapId||''}</span></p>
      ${(game.lastUnlocks || []).map((a) => `<p class="fine" style="background:linear-gradient(90deg, rgba(92,255,214,0.12), transparent);padding:6px 10px;border-left:2px solid var(--mint);border-radius:0 6px 6px 0;margin:6px 0">🏆 ${esc(game.t('announce.achievement'))}: ${esc(game.t('ach.' + a + '.name'))}</p>`).join('')}
      <table style="margin-top:14px">
        <thead><tr><th>Player</th><th>K</th><th>D</th><th>A</th><th>Score</th><th>DMG</th></tr></thead>
        <tbody>${(summary?.players || []).map((p) => `<tr class="${p.id === game.localId ? 'you' : ''}"><td>${esc(p.name)}${p.id===game.localId?' — you':''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.assists}</td><td>${Math.round(p.score)}</td><td>${Math.round(p.damage||0)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="row" style="margin-top:18px">
        <button class="primary" data-act="again" style="flex:1">↻ ${esc(game.t('play.again'))}</button>
        <button class="ghost" data-act="menu" style="flex:1">${esc(game.t('menu.back'))} to menu</button>
      </div>
    </div></div>`;
}

export function showEditorTools(game) {
  const host = document.getElementById('overlays');
  host.querySelector('.editor-tools')?.remove();
  const tools = [['floor', 'editor.floor'], ['wall', 'editor.wall'], ['crate', 'editor.crate'], ['platform', 'editor.platform'], ['spawn_a', 'editor.spawn_a'], ['spawn_b', 'editor.spawn_b'], ['obj', 'editor.obj'], ['erase', 'editor.clear']];
  host.insertAdjacentHTML('beforeend', `
    <div class="editor-tools panel" style="padding:16px">
      <p class="kicker">${esc(game.t('editor.title'))}</p>
      <div class="row" style="margin:8px 0">${tools.map(([id, key]) => `<button class="chip ${game.editor?.tool === id ? 'on' : ''}" data-act="edit-tool" data-tool="${id}">${esc(game.t(key))}</button>`).join('')}</div>
      <div class="row" style="margin-top:10px">
        <button class="primary" data-act="edit-play">▶ ${esc(game.t('editor.play'))}</button>
        <button class="ghost" data-act="edit-save">${esc(game.t('menu.save'))}</button>
        <button class="ghost" data-act="leave">${esc(game.t('menu.exit'))}</button>
      </div>
      <p class="fine" style="margin-top:10px">${esc(game.t('editor.place'))} — left click place, right click erase, drag to orbit.</p>
    </div>`);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[c]));
}
