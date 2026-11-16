// Drip Dash — UI controller: screens, registration, run tickets, score submission.
import { Game } from './game.js';
import { api, store, currentMonth, monthLabel } from './api.js';
import { LIVE } from './config.js';
import { sfx } from './audio.js';
import { mountBoard } from './board.js';

const $ = (s) => document.querySelector(s);
const screens = ['title', 'howto', 'register', 'over', 'board', 'pause'];
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

let player = store.get('dripdash.player');       // { player_key, display_name, company }
let skipped = false;
let run = null;                                   // { ticket: Promise, result }
let pendingResult = null;                         // unsaved result for late registration
let lastScreen = 'title';
let afterRegister = null;

// ---------------------------------------------------------------- game
const game = new Game($('#game'), {
  onGameOver: (r) => onGameOver(r),
});
function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  const playing = name === null;
  $('#hud-buttons').hidden = !playing;
  $('#btn-slide').hidden = !(playing && isTouch);
  if (name && name !== 'board' && name !== 'howto') lastScreen = name;
}

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

function seedFrom(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function startGame() {
  sfx.unlock();
  show(null);
  pendingResult = null;
  const ticket = api.startRun(player?.player_key).catch((e) => ({ error: e.message }));
  run = { ticket };
  game.start(seedFrom(Date.now() + Math.random()));
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
    chip.hidden = false;
    chip.innerHTML = '';
    chip.append(`Playing as ${player.display_name} · ${player.company} `);
    const a = document.createElement('button'); a.className = 'btn link inline'; a.textContent = 'not you?';
    a.onclick = () => { store.del('dripdash.player'); player = null; renderTitle(); };
    chip.append(a);
    api.me(player.player_key).then((me) => {
      if (me && me.best_month) chip.firstChild.textContent = `Playing as ${player.display_name} · ${player.company} · Best this month: ${me.best_month.toLocaleString()}${me.month_rank ? ` (#${me.month_rank})` : ''} `;
    }).catch(() => {});
  } else chip.hidden = true;
}

// ---------------------------------------------------------------- registration
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
    source: params.get('utm_campaign') || params.get('src') || null,
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
  const local = store.get('dripdash.localBest', 0);
  const newLocalBest = r.score > local;
  if (newLocalBest) store.set('dripdash.localBest', r.score);
  $('#over-kicker').textContent = newLocalBest && local > 0 ? 'New personal best!' : ['Splash!', 'Pressure drop!', 'Leak detected!', 'Valve closed!'][Math.floor(Math.random() * 4)];
  $('#over-score').textContent = r.score.toLocaleString();
  $('#over-best').textContent = `Your best: ${Math.max(local, r.score).toLocaleString()}`;
  $('#over-stats').innerHTML = `
    <li><b>${r.distance.toLocaleString()} m</b><span>distance</span></li>
    <li><b>${r.drops}</b><span>drops</span></li>
    <li><b>${r.valves}</b><span>golden valves</span></li>
    <li><b>${(r.durationMs / 1000).toFixed(0)}s</b><span>run time</span></li>`;
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
    const res = await api.submitRun({
      runId: ticket.run_id, playerKey: player.player_key, score: r.score, durationMs: r.durationMs,
      distance: r.distance, drops: r.drops, valves: r.valves,
    });
    if (res && res.accepted === false) { rank.textContent = `Score not counted: ${res.reason || 'failed verification'}.`; return; }
    const bits = [];
    if (res?.month_rank) bits.push(`You're #${res.month_rank} of ${res.month_players} this month`);
    if (res?.best_month) bits.push(`monthly best ${Number(res.best_month).toLocaleString()}`);
    rank.textContent = bits.length ? `${bits.join(' · ')}.` : 'Score saved.';
    if (res?.best_all) $('#over-best').textContent = `Your all-time best: ${Number(res.best_all).toLocaleString()}`;
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
  const text = `I scored ${score} in Drip Dash by inCon-trol Water Systems. Think you can beat me?`;
  try {
    if (navigator.share) await navigator.share({ title: 'Drip Dash', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Challenge copied. Paste it to a colleague!'); }
  } catch { /* user cancelled */ }
};

// ---------------------------------------------------------------- leaderboard overlay
let board = null;
function openBoard() {
  if (!board) board = mountBoard($('#board'), { me: player });
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
$('#btn-pause').onclick = () => { game.pause(); show('pause'); };
$('#btn-resume').onclick = () => { show(null); game.resume(); };
$('#btn-quit').onclick = () => { game.resume(); game.die(); };
const muteBtn = $('#btn-mute');
const setMuteIcon = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; muteBtn.setAttribute('aria-label', sfx.muted ? 'Unmute sound' : 'Mute sound'); };
setMuteIcon();
muteBtn.onclick = () => { sfx.toggle(); setMuteIcon(); };

// pointer / touch input on the play area
const stage = $('#stage');
let touchStart = null;
stage.addEventListener('pointerdown', (e) => {
  if (game.state !== 'playing' || e.target.closest('button, a, input, .card')) return;
  e.preventDefault();
  touchStart = { y: e.clientY, x: e.clientX, t: performance.now(), id: e.pointerId };
  game.press();
}, { passive: false });
stage.addEventListener('pointermove', (e) => {
  if (!touchStart || e.pointerId !== touchStart.id) return;
  const dy = e.clientY - touchStart.y, dx = Math.abs(e.clientX - touchStart.x);
  if (dy > 34 && dy > dx && performance.now() - touchStart.t < 400) { game.slide(); touchStart = null; }
});
const end = () => { touchStart = null; game.release(); };
stage.addEventListener('pointerup', end);
stage.addEventListener('pointercancel', end);
$('#btn-slide').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.slide(); });

addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key;
  if (game.state === 'playing') {
    if ([' ', 'ArrowUp', 'w', 'W'].includes(k)) { e.preventDefault(); if (!e.repeat) game.press(); }
    else if (['ArrowDown', 's', 'S'].includes(k)) { e.preventDefault(); game.slide(); }
    else if (['p', 'P', 'Escape'].includes(k)) { game.pause(); show('pause'); }
  } else if (game.state === 'paused' && ['p', 'P', 'Escape', ' '].includes(k)) {
    e.preventDefault(); show(null); game.resume();
  } else if (!$('#screen-title').hidden || !$('#screen-over').hidden) {
    if (k === ' ' || k === 'Enter') { if (['BUTTON', 'A'].includes(document.activeElement?.tagName)) return; e.preventDefault(); wantPlay(); }
  }
});
addEventListener('keyup', (e) => { if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) game.release(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') { game.pause(); show('pause'); } });
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// boot
$('#demo-badge').hidden = LIVE;
if (params.get('email') && !player) prefill();
renderTitle();
show('title');
if (params.get('view') === 'leaderboard') openBoard();
