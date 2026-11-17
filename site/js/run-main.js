// Water Run — UI controller: screens, controls (keys / swipe / click), registration, run tickets, scores.
import { api, store, currentMonth, monthLabel } from './api.js';
import { LIVE } from './config.js';
import { sfx } from './audio.js';
import { mountBoard } from './board.js';
import { PROJECTS, photoSources } from './run-projects.js';

const $ = (s) => document.querySelector(s);
const screens = ['title', 'howto', 'register', 'over', 'board', 'pause', 'nogl', 'project', 'collection'];
const params = new URLSearchParams(location.search);

let player = store.get('dripdash.player');       // shared sign-up across every Drip Dash game
let skipped = false, run = null, pendingResult = null, lastScreen = 'title', afterRegister = null;
let game = null, ZONES = [];

function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  const playing = name === null;
  $('#hud-buttons').hidden = !playing;
  $('#run-hud').hidden = !playing;
  $('#journey').hidden = !playing;
  if (!playing) $('#proj-chip').hidden = true;
  if (name && !['board', 'howto', 'project', 'collection'].includes(name)) lastScreen = name;
}
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}
function pop(msg) {
  const p = $('#pop'); p.textContent = msg; p.hidden = false; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
  clearTimeout(pop.h); pop.h = setTimeout(() => (p.hidden = true), 1600);
}
function zoneBanner(zone, lap = 0) {
  const b = $('#zone-banner');
  const last = zone.idx === PROJECTS.length - 1;
  b.querySelector('small').textContent = `${lap ? 'Encore lap · ' : ''}${last ? 'Destination' : `Stop ${zone.idx + 1} of ${PROJECTS.length}`} · ${zone.time}`;
  $('#zb-name').textContent = zone.name; $('#zb-ref').textContent = zone.story;
  b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout(zoneBanner.h); zoneBanner.h = setTimeout(() => (b.hidden = true), 3200);
}

// ---------------------------------------------------------------- boot the 3D game (needs WebGL + the Three.js CDN)
async function boot() {
  try {
    const test = document.createElement('canvas');
    if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('no webgl');
    const mod = await import('./run-game.js');
    ZONES = mod.ZONES;
    game = new mod.WaterRun($('#game'), {
      onGameOver: (r) => onGameOver(r),
      onZone: (z, first) => { if (!first) zoneBanner(z, game.lap); },
      onArrive: () => { celebrate(); },
      onToast: (m) => toast(m),
      onPop: (m) => pop(m),
      onCountdown: (c) => { const el = $('#countdown'); el.hidden = c <= 0; el.textContent = c > 0 ? Math.ceil(c) : ''; },
    });
    game.setOutfit(store.get('dripdash.outfit', 'none'));
    window.__wrun = game;   // for testing in the console
    $('#zone-list').innerHTML = `<b>8 stops, all real inCon-trol projects:</b><br>${ZONES.map((z) => z.short).join(' → ')}`;
    $('#jr-stops').innerHTML = ZONES.map((z, i) => `<span style="left:${(i / ZONES.length) * 100}%" title="${z.name}">${i === ZONES.length - 1 ? '⛲' : ''}</span>`).join('') + '<span class="jr-drip" id="jr-drip">💧</span>';
    requestAnimationFrame(hud);
  } catch (e) {
    console.warn('Water Run could not start 3D:', e);
    show('nogl');
  }
}

function hud() {
  if (game && (game.state === 'playing' || game.state === 'countdown')) {
    $('#h-score').textContent = game.score.toLocaleString();
    $('#h-dist').textContent = `${Math.floor(game.dist).toLocaleString()} m`;
    $('#h-drops').textContent = game.drops;
    $('#h-mult').hidden = !(game.mult > 0);
    const chips = [];
    if (game.shield) chips.push('<span class="pw shield">🛡 Shield</span>');
    if (game.magnet > 0) chips.push(`<span class="pw magnet">🧲 ${game.magnet.toFixed(0)}s</span>`);
    if (game.mult > 0) chips.push(`<span class="pw mult">x2 ${game.mult.toFixed(0)}s</span>`);
    if (game.boost > 0) chips.push(`<span class="pw boost">🚀 ${game.boost.toFixed(1)}s</span>`);
    if (game.stumble > 0) chips.push('<span class="pw warn">⚠ Careful</span>');
    const html = chips.join('');
    if (hud.last !== html) { $('#h-powers').innerHTML = html; hud.last = html; }
    // journey progress to Commons at Agora
    const J = ZONES.length * 300, d = game.dist % J, k = Math.min(1, d / J);
    $('#jr-fill').style.width = `${k * 100}%`; $('#jr-drip').style.left = `${k * 100}%`;
    const left = Math.max(0, Math.ceil((J - d) / 10) * 10);
    $('#jr-label').textContent = game.lap > 0 ? `Encore lap ${game.lap} · ${game.zone.short}` : game.arrived ? 'Commons at Agora: show is ON!' : `${game.zone.short} · ${left.toLocaleString()} m to Commons at Agora`;
    // nearby project sign
    const np = game.state === 'playing' ? game.nearProject : null;
    if (np) { $('#pc-name').textContent = np.name; }
    $('#proj-chip').hidden = !np;
  }
  requestAnimationFrame(hud);
}

function startGame() {
  if (!game) return;
  sfx.unlock();
  show(null);
  pendingResult = null;
  game.setOutfit(store.get('dripdash.outfit', 'none'));
  const ticket = api.startRun(player?.player_key, 'WRUN').catch((e) => ({ error: e.message }));
  run = { ticket };
  game.start((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  zoneBanner(ZONES[0]);
}
function wantPlay() {
  if (!player && !skipped) { afterRegister = startGame; show('register'); prefill(); return; }
  startGame();
}

// ---------------------------------------------------------------- title
function renderTitle() {
  const m = currentMonth();
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  $('#month-banner').textContent = `${monthLabel(m)} competition · ends ${monthLabel(m).split(' ')[0]} ${last}`;
  const chip = $('#player-chip');
  if (player) {
    chip.hidden = false; chip.innerHTML = '';
    chip.append(`Playing as ${player.display_name} · ${player.company} `);
    const a = document.createElement('button'); a.className = 'btn link inline'; a.textContent = 'not you?';
    a.onclick = () => { store.del('dripdash.player'); player = null; renderTitle(); };
    chip.append(a);
    api.me(player.player_key, 'wrun').then((me) => {
      if (me && me.best_month) chip.firstChild.textContent = `Playing as ${player.display_name} · ${player.company} · Best this month: ${me.best_month.toLocaleString()}${me.month_rank ? ` (#${me.month_rank})` : ''} `;
    }).catch(() => {});
  } else chip.hidden = true;
}

// ---------------------------------------------------------------- registration (shared with the other games)
function prefill() {
  const f = $('#form-register');
  for (const k of ['email', 'name', 'company']) {
    const v = params.get(k);
    if (v && !f[k].value && !/^\{\{.*\}\}$/.test(v)) f[k].value = v.slice(0, 120);
  }
}
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#reg-error');
  err.textContent = '';
  const data = {
    name: f.name.value.trim(), email: f.email.value.trim(), company: f.company.value.trim(),
    consent: f.consent.checked, optIn: f.optin.checked, hp: f.website.value,
    source: params.get('utm_campaign') || params.get('src') || 'water-run',
  };
  if (data.name.length < 2) return (err.textContent = 'Please enter a display name (2–24 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return (err.textContent = 'Please enter a valid email address.');
  if (data.company.length < 2) return (err.textContent = 'Please enter your company.');
  if (!data.consent) return (err.textContent = 'Please accept the contest rules to join the leaderboard.');
  const btn = $('#btn-register'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const res = await api.register(data);
    player = { player_key: res.player_key, display_name: res.display_name, company: res.company };
    store.set('dripdash.player', player);
    toast(`Welcome, ${player.display_name}!`);
    const next = afterRegister; afterRegister = null;
    if (next) next(); else show('title');
  } catch (ex) {
    err.textContent = ex.message || 'Could not save. Please try again.';
  } finally { btn.disabled = false; btn.textContent = 'Save & play'; }
});
$('#btn-skip').onclick = () => {
  skipped = true;
  const next = afterRegister; afterRegister = null;
  if (next === startGame) startGame(); else show(lastScreen === 'register' ? 'title' : lastScreen);
};

// ---------------------------------------------------------------- game over & submission
async function onGameOver(r) {
  $('#countdown').hidden = true;
  const best = store.get('wrun.best', 0), isBest = r.score > best;
  if (isBest) store.set('wrun.best', r.score);
  const seen = new Set([...store.get('wrun.zones', []), ...r.zones]); store.set('wrun.zones', [...seen]);
  $('#over-kicker').textContent = r.cause === 'quit' ? 'Run ended' : isBest && best > 0 ? 'New personal best!' : ['Splash!', 'Wipeout!', 'Soaked!', 'Pressure drop!'][Math.floor(Math.random() * 4)];
  $('#over-score').textContent = r.score.toLocaleString();
  $('#over-best').textContent = `Your best: ${Math.max(best, r.score).toLocaleString()}`;
  $('#over-stats').innerHTML = `
    <li><b>${r.distance.toLocaleString()} m</b><span>distance</span></li>
    <li><b>${r.drops}</b><span>drops</span></li>
    <li><b>${r.valves}</b><span>golden valves</span></li>
    <li><b>${(r.durationMs / 1000).toFixed(0)}s</b><span>run time</span></li>`;
  $('#over-journey').innerHTML = r.arrived
    ? `⛲ <b>You reached Commons at Agora</b> and switched on the evening show!${r.laps ? ` Plus ${r.laps} encore lap${r.laps > 1 ? 's' : ''}.` : ''}`
    : `You made it to <b>stop ${r.stop} of 8: ${ZONES[r.stop - 1].short}</b>. ${Math.max(0, 2400 - r.distance).toLocaleString()} m short of Commons at Agora.`;
  if (r.arrived) store.set('wrun.arrived', (store.get('wrun.arrived', 0) || 0) + 1);
  $('#over-zones').innerHTML = `<small>Stops reached · tap one to read about the project</small>${ZONES.map((z) => `<button class="${r.zones.includes(z.id) ? 'on' : ''}" data-proj="${z.id}">${r.zones.includes(z.id) ? '✔' : '○'} ${z.short}</button>`).join('')}`;
  $('#over-zones').querySelectorAll('[data-proj]').forEach((b) => (b.onclick = () => openProject(b.dataset.proj, false)));
  $('#over-rank').textContent = '';
  $('#btn-save').hidden = true;
  show('over');
  setTimeout(() => $('#btn-again').focus(), 50);
  if (!player) {
    pendingResult = r; $('#btn-save').hidden = false;
    $('#over-rank').textContent = 'Register to put this score on the leaderboard.';
    return;
  }
  await submit(r);
}
async function submit(r) {
  const rank = $('#over-rank');
  rank.textContent = 'Saving score…';
  try {
    const ticket = await run.ticket;
    if (ticket?.error) throw new Error(ticket.error);
    const res = await api.submitRun({ level: 'WRUN', runId: ticket.run_id, playerKey: player.player_key, score: r.score, durationMs: r.durationMs, distance: r.distance, drops: r.drops, valves: r.valves, powerups: r.powerups });
    if (res && res.accepted === false) { rank.textContent = `Score not counted: ${res.reason || 'failed verification'}.`; return; }
    const bits = [];
    if (res?.month_rank) bits.push(`You're #${res.month_rank} of ${res.month_players} this month`);
    if (res?.best_month) bits.push(`monthly best ${Number(res.best_month).toLocaleString()}`);
    rank.textContent = bits.length ? `${bits.join(' · ')}.` : 'Score saved.';
  } catch (e) {
    rank.textContent = `Couldn't save your score (${e.message}). Check your connection and try again.`;
  }
}
$('#btn-save').onclick = () => {
  afterRegister = async () => { show('over'); $('#btn-save').hidden = true; if (pendingResult) await submit(pendingResult); pendingResult = null; };
  show('register'); prefill();
};
$('#btn-share').onclick = async () => {
  const score = $('#over-score').textContent;
  const url = location.origin + location.pathname;
  const text = `I scored ${score} in Drip Dash: Water Run by inCon-trol Water Systems. Can you beat me?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Drip Dash: Water Run', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Challenge copied. Paste it to a colleague!'); }
  } catch { /* cancelled */ }
};

// ---------------------------------------------------------------- project information panels (verified gallery info only)
let projectFromRun = false;
function openProject(id, fromRun) {
  const p = PROJECTS.find((x) => x.id === id); if (!p) return;
  projectFromRun = !!fromRun;
  if (fromRun && game) game.pause();
  const found = new Set(store.get('wrun.projects', [])); found.add(id); store.set('wrun.projects', [...found]); renderCount();
  const i = PROJECTS.indexOf(p);
  $('#pj-stop').textContent = i === PROJECTS.length - 1 ? 'Destination' : `Stop ${i + 1} of ${PROJECTS.length}`;
  $('#pj-name').textContent = p.name;
  const img = $('#pj-img'), srcs = photoSources(p, 1200); let k = 0;
  $('#pj-noimg').hidden = true; img.hidden = false; img.alt = `${p.name} (inCon-trol gallery photo)`;
  img.onerror = () => { k++; if (k < srcs.length) img.src = srcs[k]; else { img.hidden = true; $('#pj-noimg').hidden = false; } };
  img.src = srcs[0];
  const facts = [['Project', p.name]];
  if (p.location) facts.push(['Location', p.location]);
  if (p.summary) facts.push(['About', p.summary]);
  facts.push(['In the photo', p.seen]);
  facts.push(['Architect / designer', 'Not listed in the inCon-trol gallery']);
  facts.push(['Listed in', 'inCon-trol Water Systems project gallery']);
  $('#pj-facts').innerHTML = facts.map(([k2, v]) => `<dt>${k2}</dt><dd>${v}</dd>`).join('');
  $('#pj-close').textContent = fromRun ? 'Resume run' : 'Back';
  show('project');
  if (fromRun) { $('#hud-buttons').hidden = true; }
  sfx.click?.();
}
$('#pj-close').onclick = () => {
  if (projectFromRun && game && game.state === 'paused') { show(null); game.resume(1.5); }
  else show(lastScreen);
};
function renderCount() { $('#proj-count').textContent = new Set(store.get('wrun.projects', [])).size; }
function openCollection() {
  const found = new Set(store.get('wrun.projects', []));
  $('#trail-list').innerHTML = PROJECTS.map((p, i) => `<li class="${found.has(p.id) ? 'got' : ''}"><button data-proj="${p.id}"><span class="tl-n">${i === PROJECTS.length - 1 ? '⛲' : i + 1}</span><span><b>${p.name}</b><small>${found.has(p.id) ? 'Discovered' : 'Not discovered yet (tap to preview)'}</small></span></button></li>`).join('');
  $('#trail-list').querySelectorAll('[data-proj]').forEach((b) => (b.onclick = () => openProject(b.dataset.proj, false)));
  show('collection');
}
$('#btn-projects').onclick = openCollection;
$('#proj-chip').onclick = (e) => { e.stopPropagation(); if (game?.nearProject && game.state === 'playing') openProject(game.nearProject.id, true); };
function celebrate() {
  const b = $('#zone-banner');
  b.querySelector('small').textContent = 'You made it!';
  $('#zb-name').textContent = 'The show is ON ⛲';
  $('#zb-ref').textContent = 'Commons at Agora is lit up. Keep running: every metre still scores!';
  b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout(zoneBanner.h); zoneBanner.h = setTimeout(() => (b.hidden = true), 3600);
}

// ---------------------------------------------------------------- leaderboard overlay
let board = null;
function openBoard() {
  if (!board) board = mountBoard($('#board'), { me: player, game: 'wrun' });
  else board.refresh();
  show('board');
}

// ---------------------------------------------------------------- wiring
$('#btn-play').onclick = wantPlay;
$('#btn-again').onclick = wantPlay;
$('#btn-board').onclick = openBoard;
$('#btn-board2').onclick = openBoard;
$('#btn-howto').onclick = () => show('howto');
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show(lastScreen)));
const doPause = () => { if (!game) return; game.pause(); show('pause'); };
$('#btn-pause').onclick = doPause;
$('#btn-resume').onclick = () => { show(null); game.resume(); };
$('#btn-quit').onclick = () => { game.quit(); };
const muteBtn = $('#btn-mute');
const setMuteIcon = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound'); };
setMuteIcon();
muteBtn.onclick = () => { sfx.toggle(); setMuteIcon(); };

// swipe (touch or mouse drag) and tap/click zones
const stage = $('#stage');
let sw = null;
const playing = () => game && game.state === 'playing';
stage.addEventListener('pointerdown', (e) => {
  if (!playing() || e.target.closest('button, a, input, .card')) return;
  e.preventDefault();
  const proj = game.pick(e.clientX, e.clientY);
  if (proj) { sw = null; openProject(proj.id, true); return; }
  sw = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, done: false };
}, { passive: false });
stage.addEventListener('pointermove', (e) => {
  if (!sw || sw.done || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  sw.done = true;
  if (Math.abs(dx) > Math.abs(dy)) game.move(dx > 0 ? 1 : -1); else if (dy < 0) game.jump(); else game.slide();
});
stage.addEventListener('pointerup', (e) => {
  if (!sw || e.pointerId !== sw.id) return;
  if (!sw.done) {   // a tap/click: sides change lanes, the middle jumps
    const w = stage.clientWidth, x = e.clientX;
    if (x < w * 0.3) game.move(-1); else if (x > w * 0.7) game.move(1); else game.jump();
  }
  sw = null;
});
stage.addEventListener('pointercancel', () => (sw = null));
stage.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key;
  if (playing()) {
    if (['ArrowLeft', 'a', 'A'].includes(k)) { e.preventDefault(); if (!e.repeat) game.move(-1); }
    else if (['ArrowRight', 'd', 'D'].includes(k)) { e.preventDefault(); if (!e.repeat) game.move(1); }
    else if (['ArrowUp', 'w', 'W', ' '].includes(k)) { e.preventDefault(); if (!e.repeat) game.jump(); }
    else if (['ArrowDown', 's', 'S'].includes(k)) { e.preventDefault(); if (!e.repeat) game.slide(); }
    else if (['p', 'P', 'Escape'].includes(k)) doPause();
    else if (['i', 'I'].includes(k) && game.nearProject) openProject(game.nearProject.id, true);
  } else if (!$('#screen-project').hidden && ['Escape', 'Enter', 'i', 'I'].includes(k)) {
    e.preventDefault(); $('#pj-close').click();
  } else if (game && game.state === 'paused' && ['p', 'P', 'Escape', ' '].includes(k)) {
    e.preventDefault(); show(null); game.resume();
  } else if (!$('#screen-title').hidden || !$('#screen-over').hidden) {
    if (k === ' ' || k === 'Enter') { if (['BUTTON', 'A'].includes(document.activeElement?.tagName)) return; e.preventDefault(); wantPlay(); }
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game && (game.state === 'playing' || game.state === 'countdown')) doPause(); });

$('#demo-badge').hidden = LIVE;
if (params.get('email') && !player) prefill();
renderTitle();
renderCount();
show('title');
await boot();
if (params.get('view') === 'leaderboard') openBoard();
// Preview aid for screenshots: ?dev&d=600 fast-forwards a run to 600 m (can't be hit) and freezes it. Never submitted.
if (game && params.has('dev') && params.get('d')) {
  skipped = true; player = null; show(null);
  game.start(4242); game.countdown = 0; game.state = 'playing';
  const target = Number(params.get('d'));
  while (game.dist < target) { game.inv = 1; game.shield = false; game.step(1 / 120); }
  game.inv = 0; game.state = 'paused'; game.prev = 'playing';
  game.applyLook(game.zone, 1); game.segs.forEach((sg) => { sg.userData.wake = 1; });
  if (params.has('jump')) { game.py = 1.2; }
  if (params.has('slide')) { game.slideT = 0.5; }
}
