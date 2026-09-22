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

export function mountUI(root, game) {
  root.innerHTML = `
    <div class="shell" id="shell">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div>
          <h1>VECTORBREAK</h1>
          <p data-i18n="meta.tagline"></p>
        </div>
      </div>
      <div class="top-actions">
        <div class="lang" role="group" aria-label="language">
          <button data-act="lang" data-lang="en" id="lang-en">EN</button>
          <button data-act="lang" data-lang="it" id="lang-it">IT</button>
        </div>
      </div>
      <nav class="nav" id="nav"></nav>
      <section class="panel" id="panel"></section>
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
  nav.innerHTML = NAV.map(([id, key]) =>
    `<button data-act="nav" data-id="${id}" class="${game.screen === id ? 'on' : ''}">${esc(game.t(key))}</button>`).join('');
  document.querySelectorAll('#lang-en, #lang-it').forEach((b) => b.classList.toggle('on', b.dataset.lang === game.i18n.lang));
  document.documentElement.lang = game.i18n.lang;
  const foot = document.getElementById('foot-season');
  if (foot) foot.textContent = game.t('menu.version');
  const status = document.getElementById('foot-status');
  if (status) status.textContent = game.net?.online ? `${game.t('net.connected')} ${game.net.ping || 0}ms` : game.t('net.local');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = game.t(el.dataset.i18n); });
  if (!game.inMatch) renderPanel(game);
  document.documentElement.style.setProperty('--hud', String(game.settings.hudScale || 1));
}

function renderPanel(game) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const screens = { play: playScreen, ranked: rankedScreen, loadout: loadoutScreen, characters: characterScreen, weapons: weaponScreen, customize: customizeScreen, practice: practiceScreen, custom: customScreen, profile: profileScreen, leaders: leaderScreen, social: socialScreen, settings: settingsScreen };
  panel.innerHTML = (screens[game.screen] || playScreen)(game);
}

function playScreen(game) {
  const d = game.draft;
  const modes = MODES.filter((m) => !m.practice);
  const maps = MAPS.filter((m) => m.combat);
  return `
    <p class="kicker">${esc(game.t('menu.quick'))}</p>
    <h2>${esc(game.t('play.start'))}</h2>
    <p class="lead">${esc(game.t('meta.tagline'))}</p>
    <div class="stack">
      <div class="row">${modes.map((m) => chip('mode', m.id, game.t(m.nameKey), d.modeId === m.id)).join('')}</div>
      <p class="fine">${esc(game.t(MODES.find((m) => m.id === d.modeId)?.descKey || ''))}</p>
      <div class="row">
        ${chip('map', 'random', game.t('play.random'), d.mapId === 'random')}
        ${maps.map((m) => chip('map', m.id, game.t(m.nameKey), d.mapId === m.id)).join('')}
      </div>
      <div class="row">${DIFFICULTY_IDS.map((id) => chip('diff', id, game.t('diff.' + id), d.difficulty === id)).join('')}</div>
      <div class="row">
        ${chip('team', 'a', game.t('score.team_a'), d.team === 'a')}
        ${chip('team', 'b', game.t('score.team_b'), d.team === 'b')}
        ${chip('fill', 'bots', game.t('play.fill'), d.fill === 'bots')}
        ${chip('fill', 'empty', game.t('custom.bots') + ' 0', d.fill === 'empty')}
      </div>
      <div class="row">
        ${chip('relay', '0', game.t('menu.offline'), !d.relay)}
        ${chip('relay', '1', game.t('menu.online'), !!d.relay)}
      </div>
      <button class="primary" data-act="play">${esc(game.t('play.start'))}</button>
      ${(game.browserRooms || []).length ? `<h3 style="margin:8px 0 4px;font-size:13px">${esc(game.t('net.browser'))}</h3><div class="stack">${game.browserRooms.map((r) => `<div class="card" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><strong>${esc(game.t('mode.' + r.modeId + '.name'))}</strong><p class="fine">${esc(game.t('map.' + r.mapId + '.name'))} · ${r.players}/${r.capacity}${r.code ? ' · ' + esc(r.code) : ''}</p></div>${r.joinable ? `<button class="chip" data-act="join-room" data-id="${esc(r.id)}">${esc(game.t('net.join'))}</button>` : ''}</div>`).join('')}</div>` : ''}
      <div class="card"><p class="fine">${esc(game.t('how.1'))}</p><p class="fine">${esc(game.t('how.2'))}</p><p class="fine">${esc(game.t('how.3'))}</p><p class="fine">${esc(game.t('how.4'))}</p></div>
    </div>`;
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
  return `
    <p class="kicker">${esc(game.t('menu.loadout'))}</p>
    <h2>${esc(game.t(ch.nameKey))}</h2>
    <div class="row">${kits.map((k, n) => `<button class="chip ${n === i ? 'on' : ''}" data-act="kit" data-i="${n}">${esc(k.name || game.t('kit.slot', { n: n + 1 }))}</button>`).join('')}</div>
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
    <div class="stack">
      ${CHARACTERS.map((c) => `
        <button class="card ${id === c.id ? 'on' : ''}" data-act="char" data-id="${c.id}" style="text-align:left">
          <h3><span class="swatch" style="background:${c.visual?.accent || '#5cffd6'}"></span>${esc(game.t(c.nameKey))} · ${esc(game.t(c.roleKey))}</h3>
          <p>${esc(game.t(c.blurbKey))}</p>
          <p class="fine">${esc(game.t(c.passiveKey))}</p>
          <p class="fine">${esc(game.t(c.tacticalKey))}</p>
          <p class="fine">${esc(game.t(c.ultimateKey))}</p>
        </button>`).join('')}
    </div>`;
}

function weaponScreen(game) {
  const id = game.inspectId || 'linecut';
  const def = WEAPON_LIST.find((w) => w.id === id) || WEAPON_LIST[0];
  const cats = [...new Set(WEAPON_LIST.map((w) => w.category))];
  return `
    <p class="kicker">${esc(game.t('menu.armory'))}</p>
    <h2>${esc(game.t(def.nameKey))}</h2>
    <p class="lead">${esc(game.t(def.descKey))}</p>
    <div class="grid3">
      ${stat(game.t('kit.dps'), Math.round(def.damage * (def.pellets || 1) * (def.fireRate || 1)))}
      ${stat(game.t('kit.ttk'), estimateTTK(def).toFixed(2) + 's')}
      ${stat(game.t('kit.mag'), def.mag)}
      ${stat(game.t('kit.reload'), def.reload.toFixed(2) + 's')}
      ${stat(game.t('kit.range'), Math.round(def.range))}
      ${stat(game.t('kit.mobility'), def.mobility.toFixed(2))}
    </div>
    <p class="fine" style="margin:8px 0">${esc(game.t(def.projectile ? 'kit.projectile' : 'kit.hitscan'))} · ${esc(game.t('cat.' + def.category))}</p>
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
  const binds = Object.entries(s.bindings || {});
  return `
    <p class="kicker">${esc(game.t('menu.settings'))}</p>
    <h2>${esc(game.t('menu.language'))}</h2>
    <div class="row" style="margin-bottom:12px">
      <button class="chip ${game.i18n.lang === 'en' ? 'on' : ''}" data-act="lang" data-lang="en">${esc(game.t('menu.english'))}</button>
      <button class="chip ${game.i18n.lang === 'it' ? 'on' : ''}" data-act="lang" data-lang="it">${esc(game.t('menu.italian'))}</button>
    </div>
    ${slider(game, 'set.sens', 'sens', s.sens, 0.2, 4, 0.05)}
    ${slider(game, 'set.ads', 'adsSens', s.adsSens, 0.3, 1, 0.05)}
    ${slider(game, 'set.controller', 'controllerSens', s.controllerSens, 0.5, 5, 0.1)}
    ${slider(game, 'set.deadzone', 'deadzone', s.deadzone, 0.05, 0.4, 0.01)}
    ${slider(game, 'set.accel', 'lookAccel', s.lookAccel || 1, 1, 2.2, 0.1)}
    ${slider(game, 'set.fov', 'fov', s.fov, 60, 100, 1)}
    ${slider(game, 'set.master', 'master', s.master, 0, 1, 0.01)}
    ${slider(game, 'set.music', 'music', s.music, 0, 1, 0.01)}
    ${slider(game, 'set.sfx', 'sfx', s.sfx, 0, 1, 0.01)}
    ${slider(game, 'set.voice', 'voice', s.voice, 0, 1, 0.01)}
    ${slider(game, 'set.ui_scale', 'hudScale', s.hudScale, 0.8, 1.5, 0.05)}
    <label class="field"><span><input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''}/> ${esc(game.t('set.inverty'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="screenShake" ${s.screenShake !== false ? 'checked' : ''}/> ${esc(game.t('set.shake'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="reduceMotion" ${s.reduceMotion ? 'checked' : ''}/> ${esc(game.t('set.reduce_shake'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="reduceFx" ${s.reduceFx ? 'checked' : ''}/> ${esc(game.t('set.reduce_fx'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="subtitles" ${s.subtitles !== false ? 'checked' : ''}/> ${esc(game.t('set.subtitles'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="aimAssist" ${s.aimAssist !== false ? 'checked' : ''}/> ${esc(game.t('set.aimassist'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="damageNumbers" ${s.damageNumbers !== false ? 'checked' : ''}/> ${esc(game.t('set.damage_numbers'))}</span></label>
    <label class="field"><span><input type="checkbox" data-setting="showFps" ${s.showFps ? 'checked' : ''}/> ${esc(game.t('set.showfps'))}</span></label>
    <label class="field">${esc(game.t('set.preset'))}
      <select data-setting="quality">${['low', 'medium', 'high', 'ultra'].map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${esc(game.t('set.' + q))}</option>`).join('')}</select>
    </label>
    <label class="field">${esc(game.t('set.colorblind'))}
      <select data-setting="colorblind">${['off', 'deutan', 'protan', 'tritan'].map((q) => `<option value="${q}" ${s.colorblind === q ? 'selected' : ''}>${esc(game.t('set.cb.' + q))}</option>`).join('')}</select>
    </label>
    <label class="field">${esc(game.t('set.crosshair'))}
      <select data-setting="crosshair">${CROSSHAIR_STYLES.map((q) => `<option value="${q}" ${(CROSSHAIR_STYLES.includes(s.crosshair) ? s.crosshair : 'bracket') === q ? 'selected' : ''}>${esc(game.t('set.ch.' + q))}</option>`).join('')}</select>
    </label>
    <h3 style="margin:14px 0 8px">${esc(game.t('set.bind'))}</h3>
    <div class="stack">${binds.map(([action, code]) => `
      <div class="statline"><span>${esc(game.t('bind.' + action))}</span><button class="chip" data-act="rebind" data-action="${action}">${esc(game.rebindAction === action ? game.t('set.press') : code)}</button></div>`).join('')}</div>
    <div class="row" style="margin-top:12px">
      <button class="ghost" data-act="reset-binds">${esc(game.t('menu.reset'))}</button>
      <button class="danger" data-act="reset-profile">${esc(game.t('menu.reset'))}</button>
    </div>`;
}

function slider(game, labelKey, key, value, min, max, step) {
  return `<label class="field">${esc(game.t(labelKey))} <span>${Number(value).toFixed(2)}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}" /></label>`;
}
function chip(act, id, label, on) {
  return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-id="${id}">${esc(label)}</button>`;
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
    <div class="pause"><div class="box">
      <p class="kicker">VECTORBREAK</p>
      <h2>${esc(game.t('play.resume'))}</h2>
      <div class="stack">
        <button class="primary" data-act="resume">${esc(game.t('play.resume'))}</button>
        <button class="ghost" data-act="nav" data-id="settings">${esc(game.t('menu.settings'))}</button>
        <button class="ghost" data-act="spectate">${esc(game.t('hud.freecam'))}</button>
        <button class="ghost" data-act="export-replay">${esc(game.t('replay.save'))}</button>
        <button class="danger" data-act="leave">${esc(game.t('play.leave'))}</button>
      </div>
    </div></div>`);
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
    <div class="pause"><div class="box">
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
