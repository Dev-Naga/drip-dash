// Drip Dash: Bring Back the Flow — app controller (screens, map, levels, scoring, leaderboard).
import { Stage, C, W, H, drawDrip, drawGauge, blueprint, text, FONT } from './engine.js';
import { MapScene } from './map.js';
import { LEVELS } from './levels/index.js';
import { progress, ACHIEVEMENTS, OUTFITS } from './progress.js';
import { api, store, currentMonth, monthLabel } from './api.js';
import { LIVE } from './config.js';
import { sfx } from './audio.js';
import { mountBoard } from './board.js';
import { enhanceRegistration, linkDetails } from './company.js';

const $ = (s) => document.querySelector(s);
// level photos are stored relative to the site root; this page lives in /flow/
const asset = (p) => new URL('../' + p, import.meta.url).href;
const SCREENS = ['title', 'story', 'register', 'level', 'results', 'album', 'board', 'pause'];
const params = new URLSearchParams(location.search);
const stage = new Stage($('#game'));
let player = store.get('dripdash.player');
let skipped = false, lastScreen = 'title', afterRegister = null;
let current = null;      // { def, index, level, ticket }
let pending = null;      // unsaved result (registered later)
let board = null;

// ---------------------------------------------------------------- screens
function show(name) {
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  const inLevel = stage.scene instanceof PlayScene;
  $('#top-buttons').hidden = !(name === null || (name === null && inLevel));
  $('#btn-pause').hidden = !inLevel;
  $('#btn-album').hidden = inLevel; $('#btn-board-top').hidden = inLevel;
  if (name && !['board', 'album', 'pause'].includes(name)) lastScreen = name;
}
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms); }

// ---------------------------------------------------------------- scenes
class PlayScene {
  constructor(def, index) { this.def = def; this.index = index; this.level = def.create({ outfit: progress.state.outfit }); this.finished = false; }
  update(dt) {
    this.level.update(dt);
    sfx.humSet(this.level.hum ?? 0);
    if (this.level.done && this.level.doneT > 1.8 && !this.finished) { this.finished = true; sfx.humSet(0); finishLevel(this); }
  }
  draw(ctx, t) { this.level.draw(ctx, t); }
  down(x, y, id) { this.level.down(x, y, id); }
  move(x, y, id) { this.level.move(x, y, id); }
  up(x, y, id) { this.level.up(x, y, id); }
  exit() { sfx.humSet(0); }
}
const mapScene = new MapScene(LEVELS, { onSelect: (def, i) => openBriefing(def, i) });
function goMap() { stage.paused = false; stage.go(mapScene); show(null); }

// ---------------------------------------------------------------- title & story
function renderTitle() {
  const m = currentMonth(), [y, mo] = m.split('-').map(Number);
  $('#month-banner').textContent = `${monthLabel(m)} challenge · ends ${monthLabel(m).split(' ')[0]} ${new Date(y, mo, 0).getDate()}`;
  const chip = $('#player-chip');
  if (player) {
    chip.hidden = false; chip.textContent = `Playing as ${player.display_name} · ${player.company} `;
    const b = document.createElement('button'); b.className = 'btn link inline'; b.textContent = 'not you?';
    b.onclick = () => { store.del('dripdash.player'); player = null; renderTitle(); }; chip.append(b);
  } else chip.hidden = true;
}
const STORY = [
  { title: 'The Big Hush', text: 'One stormy August night, lightning struck the Heartboard, the control panel that keeps Wellbrook\'s water moving. By morning every pump, tank and fountain in the valley had gone still.', art: 'storm' },
  { title: 'Meet Drip', text: 'Drip was halfway through the pipes when everything stopped. A small drop with a big sense of direction, and the only one still awake.', art: 'drip' },
  { title: 'Meet Gauge', text: 'Gauge has kept this valley flowing for 25 summers, ever since it was just a wrench and a garage. He can\'t move an inch, but he knows every pipe in town.', art: 'gauge' },
  { title: 'The Plan', text: 'Restore each system, recover its Spark Chip and rebuild the Heartboard. Operate valves, pumps and controls like a pro, and Wellbrook flows again.', art: 'chips' },
];
let storyI = 0, storyCanvas = null;
function openStory() {
  storyI = 0; show('story'); renderStory();
  if (!storyCanvas) {
    storyCanvas = document.createElement('canvas'); storyCanvas.width = 720; storyCanvas.height = 300; $('#story-art').append(storyCanvas);
    const sctx = storyCanvas.getContext('2d');
    const loop = (ts) => { if (!$('#screen-story').hidden) drawStory(sctx, ts / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
function renderStory() {
  const s = STORY[storyI];
  $('#story-title').textContent = s.title; $('#story-text').textContent = s.text;
  $('#story-dots').innerHTML = STORY.map((_, i) => `<span class="${i === storyI ? 'on' : ''}"></span>`).join('');
  $('#btn-story-next').textContent = storyI === STORY.length - 1 ? 'To the valley!' : 'Next';
}
function drawStory(ctx, t) {
  ctx.setTransform(0.75, 0, 0, 0.75, 0, 0);
  blueprint(ctx, t);
  const art = STORY[storyI].art;
  if (art === 'storm') {
    const flash = (t % 3) < 0.12;
    ctx.fillStyle = flash ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 960, 400);
    ctx.fillStyle = '#dfe6ec'; ctx.fillRect(400, 150, 160, 220); ctx.fillStyle = '#1d2833'; ctx.fillRect(425, 180, 110, 60);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#55606a'; ctx.beginPath(); ctx.arc(445 + i * 35, 280, 10, 0, 7); ctx.fill(); }
    text(ctx, 'HEARTBOARD', 480, 140, { size: 22, color: C.blue30, align: 'center' });
    ctx.strokeStyle = flash ? '#fff' : '#ffd23f'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(520, 0); ctx.lineTo(470, 80); ctx.lineTo(510, 80); ctx.lineTo(460, 170); ctx.stroke();
    ctx.fillStyle = 'rgba(160,180,200,.5)'; for (let i = 0; i < 40; i++) { const x = (i * 97 + t * 400) % 960, y = (i * 53 + t * 700) % 400; ctx.fillRect(x, y, 2, 14); }
  } else if (art === 'drip') {
    drawDrip(ctx, 480, 330 + Math.sin(t * 3) * 4, 70, { t, blink: Math.sin(t * 1.7) > 0.98 });
  } else if (art === 'gauge') {
    drawGauge(ctx, 480, 180, 95, { t, talking: true });
  } else {
    drawDrip(ctx, 300, 340, 50, { t, mood: 'wow' });
    drawGauge(ctx, 660, 180, 70, { t, talking: (t % 2) < 1 });
    for (let i = 0; i < 6; i++) { const on = (t * 1.5) % 7 > i; ctx.fillStyle = on ? C.aqua : 'rgba(164,183,215,.2)'; ctx.fillRect(360 + i * 44, 60, 30, 40); }
  }
}

// ---------------------------------------------------------------- registration
const reg = enhanceRegistration($('#form-register'), api);   // business email + company detection (js/company.js)
function prefill() { reg.prefill(); }
$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#reg-error'); err.textContent = '';
  const d = { name: f.name.value.trim(), email: f.email.value.trim(), company: f.company.value.trim(), consent: f.consent.checked, optIn: f.optin.checked, hp: f.website.value, source: params.get('utm_campaign') || null };
  if (d.name.length < 2) return (err.textContent = 'Please enter a display name (2–24 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return (err.textContent = 'Please enter a valid email address.');
  if (d.company.length < 2) return (err.textContent = 'Please enter your company.');
  if (!d.consent) return (err.textContent = 'Please accept the contest rules to join the leaderboard.');
  const btn = $('#btn-register'); btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const co = await reg.resolve();                // confirm the company if the match is uncertain
    if (!co) return;                               // player chose to edit the company name
    Object.assign(d, co); btn.textContent = 'Saving…';
    const r = await api.register(d);
    player = { player_key: r.player_key, display_name: r.display_name, company: r.company };
    store.set('dripdash.player', player); toast(`${r.returning ? 'Welcome back' : 'Welcome'}, ${player.display_name}!`);
    const next = afterRegister; afterRegister = null; next ? next() : show('title');
  } catch (ex) { err.textContent = ex.message || 'Could not save. Please try again.'; }
  finally { btn.disabled = false; btn.textContent = 'Save & play'; }
});
$('#btn-skip').onclick = () => { skipped = true; const n = afterRegister; afterRegister = null; n ? n() : show('title'); };

function enterValley() {
  if (!progress.state.seenStory) openStory(); else goMap();
}
function wantPlay() {
  sfx.unlock();
  if (!player && !skipped) { afterRegister = enterValley; show('register'); prefill(); return; }
  enterValley();
}

// ---------------------------------------------------------------- levels
function openBriefing(def, i) {
  sfx.tap();
  const p = progress.level(def.id);
  $('#lv-kicker').textContent = `Level ${def.num} of ${LEVELS.length}`;
  $('#lv-title').textContent = def.title; $('#lv-place').textContent = def.place;
  $('#lv-concept').textContent = def.concept; $('#lv-bonus').textContent = def.bonus;
  $('#lv-best').textContent = p.best ? `${p.best.toLocaleString()} · ${'★'.repeat(p.stars)}${'☆'.repeat(3 - p.stars)}` : 'not played yet';
  $('#btn-lv-play').onclick = () => startLevel(def, i);
  show('level');
}
function startLevel(def, i) {
  sfx.unlock();
  const scene = new PlayScene(def, i);
  current = { def, index: i, scene, ticket: api.startRun(player?.player_key, def.id).catch((e) => ({ error: e.message })) };
  stage.paused = false; stage.go(scene); show(null);
}
async function finishLevel(scene) {
  const { def } = scene, r = scene.level.result();
  const rec = progress.record(def, r);
  // stars + numbers
  $('#rs-kicker').textContent = r.stars ? `Level ${def.num} complete` : scene.level.doneMsg || 'Level failed';
  $('#rs-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < r.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.25}s">★</span>`).join('');
  r.stars && [0, 1, 2].slice(0, r.stars).forEach((i) => setTimeout(() => sfx.star(i), 250 + i * 250));
  $('#rs-score').textContent = r.total.toLocaleString();
  $('#rs-best').textContent = rec.newBest ? 'New personal best!' : `Best: ${progress.level(def.id).best.toLocaleString()}`;
  $('#rs-breakdown').innerHTML = r.parts.filter(([, v]) => v).map(([k, v]) => `<li><span>${k}</span><b>${v > 0 ? '+' : ''}${Math.round(v).toLocaleString()}</b></li>`).join('');
  // field note
  const note = $('#rs-note');
  if (r.stars && def.photo) { note.hidden = false; $('#rs-photo').src = asset(def.photo); $('#rs-photo').alt = def.photoCaption || ''; $('#rs-cap').textContent = def.photoCaption || ''; $('#rs-notetext').textContent = def.note; }
  else note.hidden = true;
  $('#rs-ach').innerHTML = rec.newAch.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return `<div class="ach-pop">🏅 <b>${a.name}</b> · ${a.desc}</div>`; }).join('');
  const unlockedOutfit = OUTFITS.find((o) => o.stars > 0 && progress.totalStars() >= o.stars && rec.prevStars + (progress.totalStars() - progress.level(def.id).stars) < o.stars);
  if (unlockedOutfit) $('#rs-ach').innerHTML += `<div class="ach-pop">👕 Outfit unlocked: <b>${unlockedOutfit.name}</b> (equip it in the Album)</div>`;
  const next = LEVELS[scene.index + 1];
  $('#btn-next').hidden = !(r.stars && next);
  $('#btn-next').onclick = () => openBriefing(next, scene.index + 1);
  $('#btn-replay').onclick = () => startLevel(def, scene.index);
  $('#btn-save').hidden = true; $('#rs-rank').textContent = '';
  show('results');
  if (!r.stars) return;
  if (!player) { pending = { r, def }; $('#btn-save').hidden = false; $('#rs-rank').textContent = 'Register to put this score on the leaderboard.'; return; }
  submit(r, def);
}
async function submit(r, def) {
  const rank = $('#rs-rank'); rank.textContent = 'Saving score…';
  try {
    const ticket = await current.ticket;
    if (ticket?.error) throw new Error(ticket.error);
    const res = await api.submitRun({ runId: ticket.run_id, playerKey: player.player_key, level: def.id, score: r.total, durationMs: Math.round(r.seconds * 1000), stars: r.stars });
    if (res && res.accepted === false) { rank.textContent = `Score not counted: ${res.reason || 'failed verification'}.`; return; }
    rank.textContent = res?.month_rank ? `Valley Score this month: ${Number(res.month_score).toLocaleString()} · #${res.month_rank} of ${res.month_players}` : 'Score saved.';
  } catch (e) { rank.textContent = `Couldn't save your score (${e.message}).`; }
}
$('#btn-save').onclick = () => { afterRegister = async () => { show('results'); $('#btn-save').hidden = true; if (pending) await submit(pending.r, pending.def); pending = null; }; show('register'); prefill(); };
$('#btn-share').onclick = async () => {
  const url = location.origin + location.pathname, txt = `I scored ${$('#rs-score').textContent} restoring Wellbrook in Drip Dash by inCon-trol Water Systems. Can you beat me?`;
  try { if (navigator.share) await navigator.share({ title: 'Drip Dash', text: txt, url }); else { await navigator.clipboard.writeText(`${txt} ${url}`); toast('Challenge copied!'); } } catch { /* cancelled */ }
};

// ---------------------------------------------------------------- album
function renderAlbum(tab = 'ach') {
  document.querySelectorAll('[data-atab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.atab === tab)));
  const body = $('#album-body');
  if (tab === 'ach') {
    body.innerHTML = `<p class="muted small">${Object.keys(progress.state.achievements).length} of ${ACHIEVEMENTS.length} unlocked</p><ul class="ach-list">${ACHIEVEMENTS.map((a) => `<li class="${progress.state.achievements[a.id] ? 'got' : ''}"><span>${progress.state.achievements[a.id] ? '🏅' : '🔒'}</span><div><b>${a.name}</b><small>${a.desc}</small></div></li>`).join('')}</ul>`;
  } else if (tab === 'notes') {
    body.innerHTML = `<div class="notes">${LEVELS.map((l) => { const got = progress.level(l.id).done; return `<figure class="${got ? '' : 'locked'}">${got ? `<img src="${asset(l.photo)}" alt="${l.photoCaption}">` : '<div class="ph">🔒</div>'}<figcaption><b>${got ? l.photoCaption : `Level ${l.num}`}</b>${got ? `<small>${l.note}</small>` : '<small>Complete the level to unlock this Field Note.</small>'}</figcaption></figure>`; }).join('')}</div>
      <p class="small center"><a href="https://www.incontrolwatersystems.com" target="_blank" rel="noopener">See more real projects →</a></p>`;
  } else {
    const stars = progress.totalStars();
    body.innerHTML = `<p class="muted small">You have ★ ${stars}. Earn stars to unlock outfits.</p><div class="outfits">${OUTFITS.map((o) => { const ok = progress.outfitUnlocked(o); return `<button class="outfit ${progress.state.outfit === o.id ? 'on' : ''}" data-outfit="${o.id}" ${ok ? '' : 'disabled'}><canvas width="120" height="130" data-draw="${o.id}"></canvas><b>${o.name}</b><small>${ok ? (progress.state.outfit === o.id ? 'Equipped' : 'Tap to equip') : `★ ${o.stars} needed`}</small></button>`; }).join('')}</div>`;
    body.querySelectorAll('canvas[data-draw]').forEach((cv) => { const c = cv.getContext('2d'); c.clearRect(0, 0, 120, 130); drawDrip(c, 60, 122, 34, { outfit: cv.dataset.draw }); });
    body.querySelectorAll('[data-outfit]').forEach((b) => (b.onclick = () => { progress.setOutfit(b.dataset.outfit); sfx.good(); renderAlbum('outfits'); }));
  }
}
document.querySelectorAll('[data-atab]').forEach((b) => (b.onclick = () => renderAlbum(b.dataset.atab)));
function openAlbum() { renderAlbum('ach'); show('album'); }
function openBoard() { if (!board) board = mountBoard($('#board'), { me: player, game: 'flow' }); else board.refresh(); show('board'); }

// ---------------------------------------------------------------- wiring
$('#btn-play').onclick = wantPlay;
$('#btn-board').onclick = openBoard; $('#btn-board-top').onclick = openBoard;
$('#btn-album').onclick = openAlbum; $('#btn-album2').onclick = openAlbum;
$('#btn-story-next').onclick = () => { sfx.tap(); if (storyI < STORY.length - 1) { storyI++; renderStory(); } else { progress.markStory(); goMap(); } };
$('#btn-story-skip').onclick = () => { progress.markStory(); goMap(); };
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => (lastScreen === 'title' && !(stage.scene) ? show('title') : backFromOverlay())));
function backFromOverlay() { if (lastScreen === 'title') show('title'); else if (lastScreen === 'results') show('results'); else show(null); }
document.querySelectorAll('[data-to="map"]').forEach((b) => (b.onclick = goMap));
$('#btn-pause').onclick = () => { if (stage.scene instanceof PlayScene) { stage.paused = true; sfx.humSet(0); show('pause'); } };
$('#btn-resume').onclick = () => { stage.paused = false; show(null); };
$('#btn-restart').onclick = () => startLevel(current.def, current.index);
$('#btn-quit').onclick = goMap;
const muteBtn = $('#btn-mute');
const setMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
setMute(); muteBtn.onclick = () => { sfx.toggle(); setMute(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && stage.scene instanceof PlayScene && !stage.paused && !stage.scene.finished) { stage.paused = true; sfx.humSet(0); show('pause'); } });
addEventListener('keydown', (e) => {
  if (stage.scene instanceof PlayScene && !stage.paused && /^[1-5]$/.test(e.key)) stage.scene.level.key?.(e.key);
  if ((e.key === 'Escape' || e.key === 'p') && stage.scene instanceof PlayScene) { if (stage.paused) { stage.paused = false; show(null); } else $('#btn-pause').click(); } });

// rotate prompt for portrait phones
const rot = $('#rotate'); let rotateOk = false;
function checkRotate() { rot.hidden = rotateOk || !(matchMedia('(pointer: coarse)').matches && innerHeight > innerWidth); }
$('#btn-rotate-ok').onclick = () => { rotateOk = true; checkRotate(); };
addEventListener('resize', checkRotate); checkRotate();

// title backdrop: the map, dimmed
stage.go(mapScene);
$('#demo-badge').hidden = LIVE;
renderTitle(); show('title');
if (params.get('view') === 'leaderboard') openBoard();
// deep link to a level (e.g. from a newsletter): only levels the player has unlocked, unless ?dev is set
if (params.has('level')) { const i = LEVELS.findIndex((l) => l.id === params.get('level')); if (i >= 0 && (params.has('dev') || progress.unlocked(LEVELS, i))) { skipped = skipped || params.has('dev'); startLevel(LEVELS[i], i); } }
