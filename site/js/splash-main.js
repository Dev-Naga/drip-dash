// Splash Escape — UI controller: screens, controls, registration, run tickets, score submission, achievements.
import { SplashGame, drawSpritz } from './splash-game.js';
import { api, store, currentMonth, monthLabel } from './api.js';
import { LIVE } from './config.js';
import { sfx } from './audio.js';
import { mountBoard } from './board.js';
import { enhanceRegistration, linkDetails } from './company.js';

const $ = (s) => document.querySelector(s);
const screens = ['title', 'howto', 'register', 'over', 'board', 'pause', 'ach'];
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

let player = store.get('dripdash.player');       // shared sign-up across all three games
let skipped = false;
let run = null;
let pendingResult = null;
let lastScreen = 'title';
let afterRegister = null;

const ACH = [
  { id: 'first', name: 'First Splash', desc: 'Finish your first run', test: () => true },
  { id: 's30', name: 'Splash Survivor', desc: 'Survive 30 seconds', test: (r) => r.durationMs >= 30000 },
  { id: 's60', name: 'Minute in the Mist', desc: 'Survive 60 seconds', test: (r) => r.durationMs >= 60000 },
  { id: 's90', name: 'Water World Legend', desc: 'Survive 90 seconds', test: (r) => r.durationMs >= 90000 },
  { id: 'nohit', name: 'Bone Dry', desc: 'Go 30 seconds without getting hit', test: (r) => r.noHitSeconds >= 30 },
  { id: 'combo', name: 'Combo Fountain', desc: 'Reach a x5 golden-drop combo', test: (r) => r.bestCombo >= 5 },
  { id: 'gold', name: 'Golden Collector', desc: 'Collect 25 golden drops in one run', test: (r) => r.drops >= 25 },
  { id: 'shade', name: 'Shade Seeker', desc: 'Let an umbrella block 5 splashes in one run', test: (r) => r.blocked >= 5 },
  { id: 'dodge', name: 'Close Call', desc: 'Dash straight through a hazard', test: (r) => r.dodges >= 1 },
  { id: 'k2', name: '2,000 Club', desc: 'Score 2,000 points', test: (r) => r.score >= 2000 },
];

// ---------------------------------------------------------------- game
const game = new SplashGame($('#game'), { onGameOver: (r) => onGameOver(r) });
window.__splash = game;   // handy for testing in the console

function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  const playing = name === null;
  $('#hud-buttons').hidden = !playing;
  $('#btn-dash').hidden = !(playing && isTouch);
  if (name && !['board', 'howto', 'ach'].includes(name)) lastScreen = name;
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

function startGame() {
  sfx.unlock();
  show(null);
  pendingResult = null;
  const ticket = api.startRun(player?.player_key, 'SPLASH').catch((e) => ({ error: e.message }));
  run = { ticket };
  game.start((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
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
    api.me(player.player_key, 'splash').then((me) => {
      if (me && me.best_month) chip.firstChild.textContent = `Playing as ${player.display_name} · ${player.company} · Best this month: ${me.best_month.toLocaleString()}${me.month_rank ? ` (#${me.month_rank})` : ''} `;
    }).catch(() => {});
  } else chip.hidden = true;
}
const titleCv = $('#title-spritz');
(function animateTitle(ts) {
  if (!$('#screen-title').hidden) {
    const c = titleCv.getContext('2d'), t = ts / 1000;
    c.clearRect(0, 0, titleCv.width, titleCv.height);
    const moods = ['happy', 'happy', 'joy', 'happy', 'worried', 'happy'];
    drawSpritz(c, 110, 236 + Math.sin(t * 3) * 3, 62, { t, mood: moods[Math.floor(t / 1.6) % moods.length], look: { x: Math.sin(t * 0.9) * 0.8, y: 0.2 }, blink: Math.sin(t * 1.7) > 0.985 });
  }
  requestAnimationFrame(animateTitle);
})(0);

// ---------------------------------------------------------------- registration (same as the other games)
const reg = enhanceRegistration($('#form-register'), api);   // business email + company detection (js/company.js)
function prefill() { reg.prefill(); }
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#reg-error');
  err.textContent = '';
  const data = {
    name: f.name.value.trim(), email: f.email.value.trim(), company: f.company.value.trim(),
    consent: f.consent.checked, optIn: f.optin.checked, hp: f.website.value,
    source: params.get('utm_campaign') || params.get('src') || 'splash',
  };
  if (data.name.length < 2) return (err.textContent = 'Please enter a display name (2–24 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) return (err.textContent = 'Please enter a valid email address.');
  if (data.company.length < 2) return (err.textContent = 'Please enter your company.');
  if (!data.consent) return (err.textContent = 'Please accept the contest rules to join the leaderboard.');
  const btn = $('#btn-register'); btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const co = await reg.resolve();                // confirm the company if the match is uncertain
    if (!co) return;                               // player chose to edit the company name
    Object.assign(data, co); btn.textContent = 'Saving…';
    const res = await api.register(data);
    player = { player_key: res.player_key, display_name: res.display_name, company: res.company };
    store.set('dripdash.player', player);
    toast(`${res.returning ? 'Welcome back' : 'Welcome'}, ${player.display_name}!`);
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

// ---------------------------------------------------------------- achievements
const earned = () => store.get('splash.ach', {});
function renderAch() {
  const got = earned(), n = ACH.filter((a) => got[a.id]).length;
  $('#ach-note').textContent = `${n} of ${ACH.length} earned · personal best ${store.get('splash.best', 0).toLocaleString()} · longest run ${(store.get('splash.longest', 0) / 1000).toFixed(1)} s`;
  $('#ach-list').innerHTML = ACH.map((a) => `<li class="${got[a.id] ? 'got' : ''}"><span class="ach-ic">${got[a.id] ? '🏅' : '🔒'}</span><span><b>${a.name}</b><small>${a.desc}</small></span></li>`).join('');
}
function openAch() { renderAch(); show('ach'); }

// ---------------------------------------------------------------- game over & submission
async function onGameOver(r) {
  $('#hud-buttons').hidden = true; $('#btn-dash').hidden = true;
  const best = store.get('splash.best', 0);
  const isBest = r.score > best;
  if (isBest) store.set('splash.best', r.score);
  if (r.durationMs > store.get('splash.longest', 0)) store.set('splash.longest', r.durationMs);
  const got = earned(), fresh = ACH.filter((a) => !got[a.id] && a.test(r));
  fresh.forEach((a) => (got[a.id] = Date.now()));
  store.set('splash.ach', got);

  await new Promise((res) => setTimeout(res, 700));   // let the final splash play out
  $('#over-kicker').textContent = isBest && best > 0 ? 'New personal best!' : ['Soaked!', 'Total splashdown!', 'Drenched!', 'Washed out!'][Math.floor(Math.random() * 4)];
  $('#over-score').textContent = r.score.toLocaleString();
  $('#over-best').textContent = `Your best: ${Math.max(best, r.score).toLocaleString()}`;
  $('#over-stats').innerHTML = `
    <li><b>${(r.durationMs / 1000).toFixed(1)}s</b><span>survived</span></li>
    <li><b>${r.drops}</b><span>golden drops</span></li>
    <li><b>x${r.bestCombo || 0}</b><span>best combo</span></li>
    <li><b>${r.powerups}</b><span>power-ups</span></li>`;
  $('#over-ach').innerHTML = fresh.length ? `🏅 Unlocked: ${fresh.map((a) => `<b>${a.name}</b>`).join(', ')}` : '';
  if (fresh.length) setTimeout(() => sfx.star(2), 200);
  $('#over-rank').textContent = '';
  $('#btn-save').hidden = true;
  show('over');
  setTimeout(() => $('#btn-again').focus(), 50);

  if (!player) {
    pendingResult = r;
    $('#btn-save').hidden = false;
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
    const res = await api.submitRun({ game: 'splash', level: 'SPLASH', runId: ticket.run_id, playerKey: player.player_key, score: r.score, durationMs: r.durationMs, drops: r.drops, powerups: r.powerups });
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
  const text = `I scored ${score} in Splash Escape by inCon-trol Water Systems. Can you stay drier than me?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Splash Escape', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Challenge copied. Paste it to a colleague!'); }
  } catch { /* cancelled */ }
};

// ---------------------------------------------------------------- leaderboard overlay
let board = null;
function openBoard() {
  if (!board) board = mountBoard($('#board'), { me: player, game: 'splash' });
  else board.refresh();
  show('board');
}

// ---------------------------------------------------------------- wiring
$('#btn-play').onclick = wantPlay;
$('#btn-again').onclick = wantPlay;
$('#btn-board').onclick = openBoard;
$('#btn-board2').onclick = openBoard;
$('#btn-howto').onclick = () => show('howto');
$('#btn-ach').onclick = openAch;
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show(lastScreen)));
const doPause = () => { game.pause(); show('pause'); game.keys.clear(); game.stick = null; game.pointer = null; };
$('#btn-pause').onclick = doPause;
$('#btn-resume').onclick = () => { show(null); game.resume(); };
$('#btn-quit').onclick = () => { game.quit(); };
const muteBtn = $('#btn-mute');
const setMuteIcon = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound'); };
setMuteIcon();
muteBtn.onclick = () => { sfx.toggle(); setMuteIcon(); };

// pointer input: touch = floating joystick, mouse = hold to move toward the cursor, right-click = dash
const stage = $('#stage'), cv = $('#game');
let ptr = null;
const active = () => game.state === 'playing' || game.state === 'countdown';
function localXY(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
stage.addEventListener('pointerdown', (e) => {
  if (!active() || e.target.closest('button, a, input, .card')) return;
  e.preventDefault();
  if (e.button === 2) { game.dash(); return; }
  const [x, y] = localXY(e);
  ptr = { id: e.pointerId, type: e.pointerType };
  if (e.pointerType === 'mouse') { const [wx, wy] = game.toWorld(x, y); game.pointer = { x: wx, y: wy }; }
  else game.stick = { ox: x, oy: y, x: 0, y: 0 };
  try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
}, { passive: false });
stage.addEventListener('pointermove', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const [x, y] = localXY(e);
  if (ptr.type === 'mouse') { const [wx, wy] = game.toWorld(x, y); game.pointer = { x: wx, y: wy }; return; }
  const s = game.stick; if (!s) return;
  let dx = (x - s.ox) / 50, dy = (y - s.oy) / 50; const m = Math.hypot(dx, dy);
  if (m > 1) { s.ox = x - dx / m * 50; s.oy = y - dy / m * 50; dx /= m; dy /= m; }    // drag the joystick base along
  s.x = m < 0.15 ? 0 : dx; s.y = m < 0.15 ? 0 : dy;
});
const release = (e) => { if (ptr && e.pointerId === ptr.id) { ptr = null; game.stick = null; game.pointer = null; } };
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('contextmenu', (e) => e.preventDefault());
$('#btn-dash').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.dash(); });

const MOVE = { ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', a: 'a', A: 'a', d: 'd', D: 'd', w: 'w', W: 'w', s: 's', S: 's' };
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key;
  if (active()) {
    if (MOVE[k]) { e.preventDefault(); game.keys.add(MOVE[k]); }
    else if (k === ' ' || k === 'Shift') { e.preventDefault(); if (!e.repeat) game.dash(); }
    else if (['p', 'P', 'Escape'].includes(k)) doPause();
  } else if (game.state === 'paused' && ['p', 'P', 'Escape', ' '].includes(k)) {
    e.preventDefault(); show(null); game.resume();
  } else if (!$('#screen-title').hidden || !$('#screen-over').hidden) {
    if (k === ' ' || k === 'Enter') { if (['BUTTON', 'A'].includes(document.activeElement?.tagName)) return; e.preventDefault(); wantPlay(); }
  }
});
addEventListener('keyup', (e) => { if (MOVE[e.key]) game.keys.delete(MOVE[e.key]); });
addEventListener('blur', () => game.keys.clear());
document.addEventListener('visibilitychange', () => { if (document.hidden && active()) doPause(); });

// boot
$('#demo-badge').hidden = LIVE;
if (linkDetails.email && !player) { prefill(); }
renderTitle();
show('title');
if (params.get('view') === 'leaderboard') openBoard();
// Preview aid for screenshots: ?dev&t=65 fast-forwards a run to 65 s and freezes it (never submitted).
if (params.has('dev') && params.get('t')) {
  skipped = true; player = null; show(null);
  game.start(12345); game.hp = 99;
  for (let i = 0; i < 120 * (3.3 + Number(params.get('t'))); i++) { game.step(1 / 120); game.ambient(1 / 120); }
  game.hp = 3; game.inv = 0; game.state = 'paused';
}
