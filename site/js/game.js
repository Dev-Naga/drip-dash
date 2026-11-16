// Drip Dash — game engine (Canvas 2D, no dependencies).
import { sfx } from './audio.js';
import { store } from './api.js';

// ------------------------------------------------------------ constants
const WORLD_H = 540;
const G = 452;                 // ground line (y of the running surface)
const MIN_W = 540, MAX_W = 1100;
const STEP = 1 / 120;          // fixed physics step
const GRAVITY = 2700;
const JUMP_V = 860, JUMP2_V = 760, FASTFALL_V = 1150;
const HOLD_TIME = 0.22, COYOTE = 0.09, BUFFER = 0.13;
const SLIDE_TIME = 0.6;
const PX_PER_M = 10;
// Moving text is fully readable up to LABEL_FULL px/s, fades out, and is gone by LABEL_GONE
// (reached ~9 s and ~24 s into a run). Fast-scrolling text causes eye strain; by then
// players recognise each obstacle by its shape and colour.
const LABEL_FULL = 480, LABEL_GONE = 620;
const REDUCED_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ZONE_M = 1100;           // metres per zone
const BRAND = { blue: '#005695', blue60: '#5D85B7', blue30: '#A4B7D7', black: '#040707', aqua: '#00C1D5', deep: '#003a66' };

const ZONES = [
  { name: 'Turf Field', sub: 'Irrigation zone' },
  { name: 'Pump Station', sub: 'Mechanical room' },
  { name: 'Fountain Plaza', sub: 'Water feature district' },
];

const HINTS = {
  sprinkler: 'TAP to jump',
  valvebox: 'TAP to jump',
  standpipe: 'HOLD for a higher jump',
  lowpipe: 'SWIPE ↓ (or ↓ key) to slide',
  geyser: 'TAP TWICE to double-jump the geyser',
};

// ------------------------------------------------------------ helpers
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rectsHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------ mascot
export function drawDrip(ctx, x, feetY, r, o = {}) {
  const t = o.t || 0;
  const sx = o.sx || 1, sy = o.sy || 1;
  const cy = feetY - 1.06 * r * sy;
  ctx.save();
  ctx.translate(x, feetY);
  ctx.rotate(o.tilt || 0);
  ctx.scale(sx, sy);
  ctx.translate(0, -1.06 * r);
  const k = r / 70; // svg units -> px

  // feet
  if (!o.sliding) {
    const step = o.running ? Math.sin(t * 22) : 0;
    ctx.fillStyle = '#00477c';
    ctx.beginPath(); ctx.ellipse(-26 * k + step * 10 * k, 74 * k - Math.max(0, step) * 8 * k, 18 * k, 9 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(28 * k - step * 10 * k, 74 * k - Math.max(0, -step) * 8 * k, 18 * k, 9 * k, 0, 0, Math.PI * 2); ctx.fill();
  }

  // body
  ctx.beginPath();
  ctx.moveTo(0, -134 * k);
  ctx.bezierCurveTo(-4 * k, -112 * k, -70 * k, -52 * k, -70 * k, 0);
  ctx.arc(0, 0, 70 * k, Math.PI, 0, true);
  ctx.bezierCurveTo(70 * k, -52 * k, 4 * k, -112 * k, 0, -134 * k);
  ctx.closePath();
  const g = ctx.createRadialGradient(-22 * k, 0, 4 * k, -10 * k, 10 * k, 95 * k);
  const outfit = o.outfit || 'none';
  if (outfit === 'gold') { g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffc93a'); g.addColorStop(1, '#c98a00'); }
  else if (outfit === 'aqua') { g.addColorStop(0, '#d2fbff'); g.addColorStop(0.45, '#2fd3e3'); g.addColorStop(1, '#00909f'); }
  else { g.addColorStop(0, '#9FE3F0'); g.addColorStop(0.45, '#2F8FD0'); g.addColorStop(1, BRAND.blue); }
  const ink = outfit === 'gold' ? '#7a5900' : BRAND.deep;
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 5 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();

  // cowlick wave
  ctx.beginPath();
  ctx.moveTo(0, -134 * k);
  ctx.bezierCurveTo(12 * k, -148 * k, 32 * k, -144 * k, 28 * k, -130 * k);
  ctx.bezierCurveTo(24 * k, -120 * k, 12 * k, -124 * k, 16 * k, -132 * k);
  ctx.lineCap = 'round'; ctx.stroke();

  // shine
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 9 * k;
  ctx.beginPath(); ctx.moveTo(-38 * k, -40 * k); ctx.bezierCurveTo(-34 * k, -62 * k, -18 * k, -82 * k, -8 * k, -92 * k); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-42 * k, -22 * k, 6 * k, 0, Math.PI * 2); ctx.fill();

  // hi-vis vest (clipped to the lower body)
  if (outfit === 'vest') {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 68 * k, 0.15, Math.PI - 0.15); ctx.lineTo(-60 * k, 20 * k); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#ff8a1f'; ctx.fillRect(-72 * k, 14 * k, 144 * k, 70 * k);
    ctx.fillStyle = '#e8ff5a'; ctx.fillRect(-72 * k, 38 * k, 144 * k, 9 * k);
    ctx.restore();
  }

  // eyes
  const blink = o.blink ? 0.12 : 1;
  const look = o.dead ? 0 : 5;
  for (const ex of [-18, 22]) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.ellipse(ex * k, -2 * k, 15 * k, 19 * k * blink, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (blink > 0.5) {
      if (o.dead) {
        ctx.strokeStyle = BRAND.black; ctx.lineWidth = 4 * k;
        ctx.beginPath(); ctx.moveTo((ex - 7) * k, -9 * k); ctx.lineTo((ex + 7) * k, 5 * k); ctx.moveTo((ex + 7) * k, -9 * k); ctx.lineTo((ex - 7) * k, 5 * k); ctx.stroke();
      } else {
        ctx.fillStyle = BRAND.black; ctx.beginPath(); ctx.arc((ex + look) * k, 2 * k, 8 * k, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((ex + look + 3) * k, -2 * k, 3 * k, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // brows
  ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 4 * k;
  ctx.beginPath(); ctx.moveTo(-32 * k, -26 * k); ctx.lineTo(-8 * k, -20 * k); ctx.moveTo(36 * k, -26 * k); ctx.lineTo(12 * k, -20 * k); ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(255,143,163,.7)';
  ctx.beginPath(); ctx.ellipse(-34 * k, 26 * k, 9 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(40 * k, 26 * k, 9 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  // mouth
  ctx.fillStyle = BRAND.deep;
  if (o.dead) {
    ctx.beginPath(); ctx.ellipse(4 * k, 38 * k, 8 * k, 10 * k, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(-14 * k, 30 * k); ctx.quadraticCurveTo(4 * k, 50 * k, 20 * k, 30 * k); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.moveTo(-5 * k, 38 * k); ctx.quadraticCurveTo(4 * k, 44 * k, 12 * k, 38 * k); ctx.closePath(); ctx.fill();
  }
  // hard hat with the inCon-trol badge
  if (outfit === 'hardhat') {
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#a07800'; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.ellipse(0, -96 * k, 44 * k, 30 * k, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-56 * k, -98 * k, 112 * k, 10 * k); ctx.strokeRect(-56 * k, -98 * k, 112 * k, 10 * k);
    ctx.fillStyle = BRAND.blue; ctx.font = `700 ${16 * k}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('iC', 0, -106 * k);
  }
  ctx.restore();

  if (o.shield) {
    ctx.save();
    ctx.strokeStyle = `rgba(0,193,213,${0.55 + 0.25 * Math.sin(t * 8)})`;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, cy - 0.3 * r * sy, r * 1.55 * sx, r * 1.75 * sy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,193,213,.10)'; ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------ game
export class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.logo = new Image();
    this.logo.src = 'assets/logo-incontrol.png';
    this.sprites = new Map();
    // sprites that contain text must be re-rendered once the web fonts arrive
    document.fonts?.ready.then(() => this.sprites.clear());
    this.state = 'ready';
    this.seenHints = new Set(store.get('dripdash.hints', []));
    this.outfit = store.get('dripdash.outfit', 'none');
    this.time = 0;
    this.acc = 0;
    this.last = 0;
    this.resize();
    this.reset(1);
    this.state = 'ready';
    addEventListener('resize', () => this.resize());
    requestAnimationFrame((ts) => this.frame(ts));
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, rect.width), ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    // Fit the gameplay band (highest collectible → just below ground), not the empty sky,
    // and aim for ~900 world-px of width when the aspect ratio allows it.
    const BAND_TOP = 140, BAND_BOT = 525;
    let s = Math.min(cw / MIN_W, ch / (BAND_BOT - BAND_TOP), Math.max(cw / 900, ch / WORLD_H));
    if (cw / s > MAX_W) s = cw / MAX_W;
    this.scale = s; this.dpr = dpr;
    this.sprites?.clear();
    this.cssW = cw; this.cssH = ch;
    this.W = cw / s;
    const centre = ch > cw ? 0.46 : 0.5;
    this.oy = ch * centre - ((BAND_TOP + BAND_BOT) / 2) * s;
    const oy = this.oy;
    this.viewTop = -oy / s;                 // world y at top of canvas
    this.viewBottom = (ch - oy) / s;        // world y at bottom of canvas
    this.playerX = clamp(this.W * 0.17, 96, 170);  // narrow screens: run further left to see more ahead
    if (this.p) this.p.x = this.playerX;
  }

  reset(seed) {
    this.rng = mulberry32(seed >>> 0 || 1);
    this.p = { x: this.playerX || 170, y: G, vy: 0, onGround: true, jumps: 0, slide: 0, holding: false, holdT: 0,
      sx: 1, sy: 1, coyote: 0, buffer: 0, lastJumpT: -1, invuln: 0, blinkT: 2 };
    this.obstacles = []; this.items = []; this.particles = []; this.floaters = [];
    this.scroll = 0; this.distPx = 0; this.t = 0;
    this.speed = 380;
    this.nextObstacleAt = 1500; this.nextPowerT = 12 + this.rng() * 5;
    this.bonus = 0; this.drops = 0; this.valves = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.power = { magnet: 0, double: 0, shield: false };
    this.zone = 0; this.zoneFade = 1; this.prevZone = 0;
    this.shake = 0; this.dieT = 0; this.flash = 0;
    this.activeHint = null;
  }

  get score() { return Math.floor(this.distPx / PX_PER_M) + this.bonus; }
  get distance() { return Math.floor(this.distPx / PX_PER_M); }
  get multiplier() { return Math.min(5, 1 + Math.floor(this.combo / 5)); }
  get labelAlpha() { return clamp((LABEL_GONE - this.speed) / (LABEL_GONE - LABEL_FULL), 0, 1); }

  // Draw scrolling text only while the world is slow enough to read it comfortably.
  movingText(text, x, y) {
    const a = this.labelAlpha;
    if (a <= 0.02) return;
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillText(text, this.snapX(x), this.snapY(y));
    ctx.restore();
  }

  start(seed) {
    this.reset(seed || (Math.random() * 2 ** 31) | 0);
    this.state = 'playing';
    this.startedAt = performance.now();
    this.playMs = 0;
    this.hooks.onZone?.(ZONES[0]);
  }

  pause() { if (this.state === 'playing') { this.state = 'paused'; this.hooks.onPause?.(true); } }
  resume() { if (this.state === 'paused') { this.state = 'playing'; this.last = 0; this.hooks.onPause?.(false); } }

  // ---------------- input
  press() {
    sfx.unlock();
    if (this.state !== 'playing') return;
    this.p.holding = true;
    this.p.buffer = BUFFER;
    this.tryJump();
  }
  release() { this.p.holding = false; }
  slide() {
    if (this.state !== 'playing') return;
    const p = this.p;
    // A swipe starts with a touch, which already jumped; undo a jump that just began.
    if (!p.onGround && p.jumps === 1 && this.t - p.lastJumpT < 0.16 && p.y > G - 40) {
      p.y = G; p.vy = 0; p.onGround = true; p.jumps = 0; p.buffer = 0;
    }
    if (p.onGround) {
      if (p.slide <= 0) sfx.slide();
      p.slide = SLIDE_TIME;
      p.holding = false;
    } else {
      p.vy = Math.max(p.vy, FASTFALL_V);
      p.queueSlide = true;
    }
  }
  tryJump() {
    const p = this.p;
    if (p.buffer <= 0) return;
    if (p.onGround || p.coyote > 0) {
      p.vy = -JUMP_V; p.onGround = false; p.jumps = 1; p.holdT = 0; p.slide = 0; p.coyote = 0;
      p.sx = 0.8; p.sy = 1.25; p.buffer = 0; p.lastJumpT = this.t;
      sfx.jump(); this.splash(p.x, G, 6, 0.6);
    } else if (p.jumps < 2) {
      p.vy = -JUMP2_V; p.jumps = 2; p.holdT = 0; p.buffer = 0; p.sx = 0.85; p.sy = 1.2;
      sfx.jump2(); this.splash(p.x, p.y - 10, 8, 0.8);
    }
  }

  // ---------------- loop
  frame(ts) {
    requestAnimationFrame((t2) => this.frame(t2));
    if (!this.last) this.last = ts;
    let dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    this.time += dt;
    if (this.state === 'playing') {
      // Advance exactly this frame's elapsed time, split into equal sub-steps of ≤ STEP.
      // (A fixed-step accumulator gives uneven 1-or-2-step frames on 75/90/144 Hz screens,
      // which reads as stutter/blur and gets worse as the world scrolls faster.)
      const n = Math.max(1, Math.ceil(dt / STEP - 1e-6));
      for (let i = 0; i < n && this.state === 'playing'; i++) this.update(dt / n);
      this.playMs += dt * 1000;
    } else if (this.state === 'dying') {
      this.updateDying(dt);
    } else if (this.state === 'ready' || this.state === 'over') {
      this.scroll += 60 * dt; // gentle attract scroll
      this.updateParticles(dt);
      const p = this.p;
      p.blinkT -= dt; if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 2.5;
    }
    this.render();
  }

  update(dt) {
    const p = this.p;
    this.t += dt;
    // speed curve: ~380 → ~880 px/s over ~90 s
    this.speed = 380 + 520 * (1 - Math.exp(-this.t / 42));
    const dx = this.speed * dt;
    this.scroll += dx; this.distPx += dx;

    // zone progression
    const z = Math.floor(this.distance / ZONE_M);
    if (z !== this.zone) {
      this.prevZone = this.zone; this.zone = z; this.zoneFade = 0;
      sfx.zone(); this.hooks.onZone?.(ZONES[z % ZONES.length], z);
      this.floatText(this.W / 2, 150, `${ZONES[z % ZONES.length].name}!`, '#fff', 30, 1.6, true);
    }
    if (this.zoneFade < 1) this.zoneFade = Math.min(1, this.zoneFade + dt / 1.4);

    // player physics
    p.buffer -= dt;
    if (p.buffer > 0) this.tryJump();
    let g = GRAVITY;
    if (p.vy < 0 && p.holding && p.holdT < HOLD_TIME) { g *= 0.5; p.holdT += dt; }
    if (!p.onGround) {
      p.vy += g * dt;
      p.y += p.vy * dt;
      if (p.y >= G) {
        p.y = G; p.vy = 0; p.onGround = true; p.jumps = 0;
        p.sx = 1.25; p.sy = 0.78;
        this.splash(p.x, G, 5, 0.5);
        if (p.queueSlide) { p.queueSlide = false; p.slide = SLIDE_TIME; sfx.slide(); }
      }
    } else {
      p.coyote = COYOTE;
    }
    if (!p.onGround) p.coyote -= dt;
    if (p.slide > 0) p.slide -= dt;
    p.sx = lerp(p.sx, 1, Math.min(1, dt * 10));
    p.sy = lerp(p.sy, 1, Math.min(1, dt * 10));
    if (p.invuln > 0) p.invuln -= dt;
    p.blinkT -= dt; if (p.blinkT < -0.12) p.blinkT = 2 + this.rng() * 2.5;

    // power timers
    if (this.power.magnet > 0) this.power.magnet -= dt;
    if (this.power.double > 0) this.power.double -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    // spawn
    if (this.distPx + this.W + 200 >= this.nextObstacleAt) this.spawn();
    this.nextPowerT -= dt;

    // move world objects
    for (const o of this.obstacles) { o.x -= dx; o.age += dt; }
    for (const it of this.items) { it.x -= dx; }
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -200);
    this.items = this.items.filter(it => it.x > -100 && !it.gone);

    // trail
    if (p.onGround && this.rng() < 0.35) this.particles.push({ x: p.x - 14, y: G - 4, vx: -60 - this.rng() * 60, vy: -40 - this.rng() * 60, life: 0.4, max: 0.4, r: 2 + this.rng() * 2.5, c: 'rgba(95,180,230,' });

    this.collide();
    this.collect(dt);
    this.updateParticles(dt);
    this.updateHint();
    this.hooks.onTick?.(this);
  }

  // ---------------- spawning
  spawn() {
    const rng = this.rng;
    const t = this.t;
    const diff = clamp(t / 80, 0, 1);
    const x0 = this.nextObstacleAt - this.distPx; // screen x where it appears
    const pool = [['sprinkler', 3], ['valvebox', 2.2]];
    if (t > 7) pool.push(['standpipe', 2]);
    if (t > 13) pool.push(['lowpipe', 2.2]);
    if (t > 22) pool.push(['geyser', 1.8]);
    if (t > 34) pool.push(['combo', 1.4]);
    let total = pool.reduce((a, b) => a + b[1], 0), r = rng() * total, type = pool[0][0];
    for (const [k, w] of pool) { if ((r -= w) < 0) { type = k; break; } }
    if (type === this.lastType && (type === 'lowpipe' || type === 'geyser')) type = 'valvebox';
    this.lastType = type;

    let width = 0;
    if (type === 'combo') {
      this.addObstacle('valvebox', x0);
      const gap = 230 + this.speed * 0.32;
      this.addObstacle('lowpipe', x0 + gap);
      width = gap + 170;
      this.lineDrops(x0 + gap + 10, G - 20, 5, 34);
    } else {
      const o = this.addObstacle(type, x0);
      width = o.w;
      // collectibles shaped around the obstacle
      if (type === 'lowpipe') { if (rng() < 0.8) this.lineDrops(x0 + 10, G - 20, 5, 34); }
      else if (type !== 'geyser' && rng() < 0.65) this.arcDrops(o);
      if (type !== 'lowpipe' && rng() < 0.13 + diff * 0.07) {
        this.items.push({ kind: 'valve', x: x0 + o.w / 2, y: G - 228, bob: rng() * 6 });
      }
    }

    // power-up in the gap after this obstacle
    const gapS = lerp(1.15, 0.66, diff) + rng() * lerp(0.7, 0.42, diff);
    const gapPx = Math.max(330, this.speed * gapS);
    if (this.nextPowerT <= 0) {
      const kinds = ['shield', 'magnet', 'double'];
      this.items.push({ kind: 'power', type: kinds[Math.floor(rng() * 3)], x: x0 + width + gapPx * 0.5, y: G - 135, bob: 0 });
      this.nextPowerT = 13 + rng() * 7;
    } else if (rng() < 0.35) {
      this.lineDrops(x0 + width + gapPx * 0.3, G - 26, 4, 36);
    }
    this.nextObstacleAt += width + gapPx;
  }

  addObstacle(type, x) {
    const rng = this.rng;
    const diff = clamp(this.t / 80, 0, 1);
    let o;
    switch (type) {
      case 'sprinkler': o = { w: 26, h: 40 + Math.round(rng() * 14) }; break;
      case 'valvebox': o = { w: 62, h: 48 }; break;
      case 'standpipe': o = { w: 34, h: Math.round(lerp(112, 148, diff) + rng() * 10) }; break;
      case 'lowpipe': o = { w: 170, h: 62 }; break;
      case 'geyser': o = { w: 30, h: 32, period: 1.7, phase: rng() * 1.7, jet: 165 }; break;
    }
    o.type = type; o.x = x; o.age = 0; o.id = Math.random();
    this.obstacles.push(o);
    return o;
  }

  arcDrops(o) {
    const n = 5, hgt = o.type === 'standpipe' ? o.h + 70 : o.h + 60;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      this.items.push({ kind: 'drop', x: o.x + o.w / 2 + (f - 0.5) * 180, y: G - 24 - Math.sin(f * Math.PI) * hgt, bob: i });
    }
  }
  lineDrops(x, y, n, gap) { for (let i = 0; i < n; i++) this.items.push({ kind: 'drop', x: x + i * gap, y, bob: i }); }

  // ---------------- collisions
  obstacleRects(o) {
    switch (o.type) {
      case 'sprinkler': {
        const pop = clamp(o.age * 3 + 0.3, 0, 1);
        return [{ x: o.x + 3, y: G - o.h * pop, w: o.w - 6, h: o.h * pop }];
      }
      case 'valvebox': return [{ x: o.x + 4, y: G - o.h + 4, w: o.w - 8, h: o.h - 4 }];
      case 'standpipe': return [{ x: o.x + 3, y: G - o.h, w: o.w - 6, h: o.h }];
      case 'lowpipe': return [{ x: o.x, y: G - 110, w: o.w, h: 62 }];
      case 'geyser': {
        const rs = [{ x: o.x + 4, y: G - o.h, w: o.w - 8, h: o.h }];
        if (this.geyserOn(o) > 0.5) rs.push({ x: o.x + 5, y: G - o.h - o.jet, w: o.w - 10, h: o.jet });
        return rs;
      }
    }
    return [];
  }
  geyserOn(o) {
    // 0 = off, 0..0.5 = warning wobble, 1 = full jet
    const ph = ((this.t + o.phase) % o.period) / o.period;
    if (ph < 0.45) return 1;
    if (ph > 0.82) return 0.25;
    return 0;
  }
  playerRect() {
    const p = this.p;
    if (p.slide > 0 && p.onGround) return { x: p.x - 22, y: G - 30, w: 44, h: 28 };
    return { x: p.x - 17, y: p.y - 60, w: 34, h: 56 };
  }

  collide() {
    const p = this.p;
    if (p.invuln > 0) return;
    const pr = this.playerRect();
    for (const o of this.obstacles) {
      if (o.x > p.x + 60 || o.x + o.w < p.x - 60) continue;
      for (const r of this.obstacleRects(o)) {
        if (rectsHit(pr, r)) {
          if (this.power.shield) {
            this.power.shield = false; p.invuln = 1.1; sfx.shield();
            this.shake = 0.25; this.flash = 0.25;
            this.splash(o.x + o.w / 2, G - 30, 18, 1.4);
            o.x = -9999; // smash it
            this.floatText(p.x, p.y - 90, 'SHIELD SAVED YOU!', BRAND.aqua, 18, 1);
            this.hooks.onPower?.(this.power);
            return;
          }
          this.die(o);
          return;
        }
      }
    }
  }

  collect(dt) {
    const p = this.p;
    const cx = p.x, cy = (p.slide > 0 && p.onGround) ? G - 16 : p.y - 34;
    const mult2 = this.power.double > 0 ? 2 : 1;
    for (const it of this.items) {
      if (this.power.magnet > 0 && it.kind === 'drop') {
        const dx = cx - it.x, dy = cy - it.y, d = Math.hypot(dx, dy);
        if (d < 260) { it.x += (dx / d) * 900 * dt; it.y += (dy / d) * 900 * dt; }
      }
      const R = it.kind === 'drop' ? 30 : 36;
      if (Math.abs(it.x - cx) < R && Math.abs(it.y - cy) < R + 8) {
        it.gone = true;
        if (it.kind === 'drop') {
          this.drops++; this.combo++; this.comboT = 1.1; this.bestCombo = Math.max(this.bestCombo, this.combo);
          const pts = 10 * this.multiplier * mult2;
          this.bonus += pts;
          sfx.drop(this.combo);
          this.sparkle(it.x, it.y, 'rgba(120,200,240,', 5);
          if (this.combo % 5 === 0 && this.multiplier > 1) this.floatText(it.x, it.y - 30, `COMBO x${this.multiplier}`, BRAND.aqua, 18, 0.9);
        } else if (it.kind === 'valve') {
          this.valves++;
          const pts = 150 * mult2; this.bonus += pts;
          sfx.valve(); this.sparkle(it.x, it.y, 'rgba(255,200,40,', 14);
          this.floatText(it.x, it.y - 30, `+${pts} GOLDEN VALVE`, '#ffcc33', 18, 1);
        } else if (it.kind === 'power') {
          sfx.power(); this.sparkle(it.x, it.y, 'rgba(0,193,213,', 16);
          const label = { shield: 'PRESSURE REGULATOR — 1 free hit', magnet: 'SMART CONTROLLER — drop magnet', double: 'FLOW METER — double points' }[it.type];
          if (it.type === 'shield') { if (this.power.shield) this.bonus += 50; this.power.shield = true; }
          if (it.type === 'magnet') this.power.magnet = 8;
          if (it.type === 'double') this.power.double = 10;
          this.floatText(this.W / 2, 190, label, '#fff', 20, 1.6, true);
          this.hooks.onPower?.(this.power);
        }
      }
    }
  }

  die() {
    const p = this.p;
    this.state = 'dying'; this.dieT = 0;
    sfx.hit(); this.shake = 0.4; this.flash = 0.35;
    this.splash(p.x, p.y - 30, 30, 2);
    p.vy = -520; p.dead = true;
    this.hooks.onHit?.();
  }
  updateDying(dt) {
    const p = this.p;
    this.dieT += dt;
    p.vy += GRAVITY * 0.6 * dt; p.y = Math.min(G, p.y + p.vy * dt);
    this.updateParticles(dt);
    if (this.shake > 0) this.shake -= dt;
    if (this.dieT > 0.95) {
      this.state = 'over';
      this.hooks.onGameOver?.({
        score: this.score, distance: this.distance, drops: this.drops, valves: this.valves,
        durationMs: Math.round(this.playMs), bestCombo: this.bestCombo, zone: this.zone,
      });
    }
  }

  // ---------------- fx
  splash(x, y, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + this.rng() * 0.8);
      const v = (120 + this.rng() * 260) * power;
      this.particles.push({ x, y, vx: Math.cos(a) * v - 80, vy: Math.sin(a) * v, life: 0.6, max: 0.6, r: 2 + this.rng() * 3.5, c: 'rgba(80,170,230,', g: 900 });
    }
  }
  sparkle(x, y, c, n) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, v = 80 + this.rng() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, max: 0.45, r: 2 + this.rng() * 2, c });
    }
  }
  floatText(x, y, text, color, size, life, screen = false) {
    this.floaters.push({ x, y, text, color, size, life, max: life, screen });
  }
  updateParticles(dt) {
    for (const q of this.particles) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 300) * dt; }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const f of this.floaters) { f.life -= dt; if (!f.screen) f.y -= 40 * dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    if (this.shake > 0) this.shake -= dt;
    if (this.flash > 0) this.flash -= dt;
  }
  updateHint() {
    this.activeHint = null;
    for (const o of this.obstacles) {
      const d = o.x - this.p.x;
      if (d > 40 && d < 520 && !this.seenHints.has(o.type)) {
        this.activeHint = { o, text: HINTS[o.type] };
        if (d < 120) {
          this.seenHints.add(o.type);
          store.set('dripdash.hints', [...this.seenHints]);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ rendering
  render() {
    const ctx = this.ctx, s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let shx = 0, shy = 0;
    if (this.shake > 0 && !REDUCED_MOTION) { shx = (Math.random() - 0.5) * 12 * this.shake; shy = (Math.random() - 0.5) * 12 * this.shake; }
    ctx.setTransform(s, 0, 0, s, shx * this.dpr, this.oy * this.dpr + shy * this.dpr);

    const zA = this.prevZone % ZONES.length, zB = this.zone % ZONES.length;
    if (this.zoneFade < 1 && zA !== zB) {
      this.drawZone(zA, 1);
      ctx.globalAlpha = this.zoneFade; this.drawZone(zB, this.zoneFade); ctx.globalAlpha = 1;
    } else this.drawZone(zB, 1);

    // items
    for (const it of this.items) this.drawItem(it);
    // obstacles
    for (const o of this.obstacles) this.drawObstacle(o);
    // hint
    if (this.activeHint && this.state === 'playing') this.drawHint(this.activeHint);
    // particles
    for (const q of this.particles) {
      ctx.fillStyle = q.c + clamp(q.life / q.max, 0, 1).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    // player
    const p = this.p;
    if (!(p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0)) {
      const sliding = p.slide > 0 && p.onGround;
      let sx = p.sx, sy = p.sy;
      if (sliding) { sx = 1.4; sy = 0.5; }
      else if (!p.onGround) { sx *= 0.92; sy *= 1.08; }
      else if (this.state === 'playing') { sy *= 1 + Math.sin(this.time * 22) * 0.04; }
      else if (this.state === 'ready') { sy *= 1 + Math.sin(this.time * 3) * 0.03; }
      const tilt = p.dead ? Math.min(1.2, this.dieT * 3) : (!p.onGround ? clamp(p.vy / 4000, -0.15, 0.2) : 0);
      // shadow
      ctx.fillStyle = 'rgba(0,30,60,.18)';
      const sh = clamp(1 - (G - p.y) / 300, 0.3, 1);
      ctx.beginPath(); ctx.ellipse(p.x, G + 3, 24 * sh * (sliding ? 1.4 : 1), 5 * sh, 0, 0, Math.PI * 2); ctx.fill();
      drawDrip(ctx, p.x, p.y, 24, {
        sx, sy, tilt, t: this.time, running: this.state === 'playing' && p.onGround && !sliding,
        blink: p.blinkT < 0, sliding, dead: p.dead, shield: this.power.shield, outfit: this.outfit,
      });
    }
    // floaters
    ctx.textAlign = 'center';
    for (const f of this.floaters) {
      const a = clamp(f.life / f.max * 2, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,40,80,.75)';
      const fx = this.snapX(f.x), fy = this.snapY(f.y);
      ctx.strokeText(f.text, fx, fy); ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy);
      ctx.globalAlpha = 1;
    }
    // flash
    if (this.flash > 0 && !REDUCED_MOTION) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, this.viewTop, this.W, this.viewBottom - this.viewTop);
    }
    if (this.state === 'playing' || this.state === 'dying' || this.state === 'paused') this.drawHud();
  }

  drawHud() {
    const ctx = this.ctx, s = this.scale * this.dpr;
    // HUD in screen space so it hugs the canvas edges
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // whole-pixel layout so HUD text and boxes stay crisp
    const u = Math.round(clamp(this.scale, 0.6, 1.3) * 20) / 20;
    const pad = Math.round(12 * u);
    const fillText = ctx.fillText.bind(ctx);
    const txt = (t, x, y) => fillText(t, Math.round(x * this.dpr) / this.dpr, Math.round(y * this.dpr) / this.dpr);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,40,80,.55)';
    roundRect(ctx, pad, pad, 168 * u, 56 * u, 12 * u); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${30 * u}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    txt(this.score.toLocaleString(), pad + 12 * u, pad + 4 * u);
    ctx.font = `600 ${13 * u}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    ctx.fillStyle = BRAND.blue30;
    txt(`${this.distance} m  ·  ${this.drops} drops`, pad + 12 * u, pad + 37 * u);

    // combo + powers on the right of the score box
    let x = pad + 178 * u;
    if (this.multiplier > 1) {
      ctx.fillStyle = BRAND.aqua; roundRect(ctx, x, pad, 58 * u, 26 * u, 8 * u); ctx.fill();
      ctx.fillStyle = BRAND.deep; ctx.font = `700 ${18 * u}px "Barlow Condensed", sans-serif`;
      txt(`x${this.multiplier}`, x + 10 * u, pad + 3 * u); x += 66 * u;
    }
    const pw = [];
    if (this.power.shield) pw.push(['shield', 1, 'Shield']);
    if (this.power.magnet > 0) pw.push(['magnet', this.power.magnet / 8, 'Magnet']);
    if (this.power.double > 0) pw.push(['double', this.power.double / 10, '2x']);
    for (const [k, f, label] of pw) {
      ctx.fillStyle = 'rgba(0,40,80,.55)'; roundRect(ctx, x, pad, 70 * u, 26 * u, 8 * u); ctx.fill();
      ctx.save(); ctx.translate(x + 13 * u, pad + 13 * u); ctx.scale(u * 0.55, u * 0.55); this.drawPowerIcon(k, 0, 0); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = `600 ${13 * u}px "Barlow Condensed", sans-serif`;
      txt(label, x + 28 * u, pad + 6 * u);
      ctx.fillStyle = BRAND.aqua; ctx.fillRect(x + 6 * u, pad + 22 * u, 58 * u * clamp(f, 0, 1), 2.5 * u);
      x += 76 * u;
    }
    ctx.textBaseline = 'alphabetic';
  }

  drawHint({ o, text }) {
    const ctx = this.ctx;
    const x = this.snapX(clamp(o.x + o.w / 2, 120, this.W - 120));
    const y = this.snapY(o.type === 'lowpipe' ? G - 150 : G - Math.max(o.h, 60) - 70);
    ctx.font = '700 17px "Barlow Condensed", "Arial Narrow", sans-serif';
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = 'rgba(0,58,102,.88)';
    roundRect(ctx, x - w / 2, y - 22, w, 32, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 8, y + 10); ctx.lineTo(x + 8, y + 10); ctx.lineTo(x, y + 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(text, x, y);
  }

  // ---------------- items
  drawItem(it) {
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 5 + it.bob) * 3;
    const x = it.x, y = it.y + bob;
    if (it.kind === 'drop') {
      ctx.fillStyle = '#4FB3E8'; ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y - 12);
      ctx.bezierCurveTo(x - 1, y - 9, x - 8, y - 3, x - 8, y + 2);
      ctx.arc(x, y + 2, 8, Math.PI, 0, true);
      ctx.bezierCurveTo(x + 8, y - 3, x + 1, y - 9, x, y - 12);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x - 3, y + 1, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (it.kind === 'valve') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.time * 2);
      ctx.fillStyle = 'rgba(255,210,60,.25)'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c98a00'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffcc33'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#ffcc33'; ctx.fillRect(-2, -14, 4, 14); }
      ctx.fillStyle = '#c98a00'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (it.kind === 'power') {
      ctx.save(); ctx.translate(x, y);
      const pulse = 1 + Math.sin(this.time * 6) * 0.06;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(0,193,213,.22)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = BRAND.aqua; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      this.drawPowerIcon(it.type, 0, 0);
      ctx.restore();
    }
  }

  drawPowerIcon(type, x, y) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y);
    if (type === 'shield') {
      // pressure gauge
      ctx.fillStyle = BRAND.blue; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e23c3c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, -6); ctx.stroke();
      ctx.fillStyle = BRAND.black; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === 'magnet') {
      // smart controller box with signal
      ctx.fillStyle = BRAND.blue; roundRect(ctx, -11, -11, 22, 22, 4); ctx.fill();
      ctx.fillStyle = '#7CFC9A'; ctx.fillRect(-7, -7, 14, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(-7, 2, 4, 4); ctx.fillRect(-1, 2, 4, 4); ctx.fillRect(5, 2, 2, 4);
      ctx.strokeStyle = BRAND.aqua; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -11, 9, -2.4, -0.7); ctx.stroke();
    } else {
      // flow meter "2x"
      ctx.fillStyle = BRAND.blue; roundRect(ctx, -14, -10, 28, 20, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '700 15px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('2x', 0, 1); ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  // ---------------- obstacles
  drawObstacle(o) {
    const ctx = this.ctx;
    const x = o.x;
    if (o.type === 'sprinkler') {
      const pop = clamp(o.age * 3 + 0.3, 0, 1), h = o.h * pop;
      ctx.fillStyle = '#2d2f33'; ctx.fillRect(x - 4, G - 6, o.w + 8, 8);                        // collar
      ctx.fillStyle = '#4a4e55'; roundRect(ctx, x + 3, G - h, o.w - 6, h, 4); ctx.fill();        // riser
      ctx.fillStyle = '#7a8088'; ctx.fillRect(x + 6, G - h + 4, 3, h - 8);
      ctx.fillStyle = '#1f8a4c'; roundRect(ctx, x, G - h - 6, o.w, 9, 3); ctx.fill();            // green cap
      // spray fan
      if (pop >= 1) {
        ctx.strokeStyle = 'rgba(120,200,240,.7)'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) {
          const a = -Math.PI / 2 + i * 0.45 + Math.sin(this.time * 6) * 0.08;
          ctx.beginPath(); ctx.moveTo(x + o.w / 2, G - h - 6);
          ctx.quadraticCurveTo(x + o.w / 2 + Math.cos(a) * 30, G - h - 6 + Math.sin(a) * 30, x + o.w / 2 + Math.cos(a) * 44, G - h + 10 + Math.sin(a) * 14);
          ctx.stroke();
        }
      }
    } else if (o.type === 'valvebox') {
      ctx.fillStyle = '#1f6b3a'; roundRect(ctx, x, G - o.h, o.w, o.h, 6); ctx.fill();
      ctx.fillStyle = '#16502b'; ctx.fillRect(x, G - o.h + 14, o.w, 3);
      ctx.fillStyle = '#121416'; roundRect(ctx, x - 4, G - o.h - 6, o.w + 8, 12, 4); ctx.fill();   // black lid
      ctx.fillStyle = '#d7e3ea'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
      this.movingText('VALVE', x + o.w / 2, G - o.h + 32);
    } else if (o.type === 'standpipe') {
      const g = ctx.createLinearGradient(x, 0, x + o.w, 0);
      g.addColorStop(0, BRAND.deep); g.addColorStop(0.35, BRAND.blue60); g.addColorStop(1, BRAND.blue);
      ctx.fillStyle = g; ctx.fillRect(x + 4, G - o.h, o.w - 8, o.h);
      ctx.fillStyle = '#3d4a57';
      for (const fy of [G - o.h, G - o.h * 0.5, G - 10]) roundRect(ctx, x - 2, fy, o.w + 4, 10, 2), ctx.fill();
      // red handwheel
      ctx.strokeStyle = '#d33a2c'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x + o.w / 2, G - o.h - 12, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + o.w / 2 - 12, G - o.h - 12); ctx.lineTo(x + o.w / 2 + 12, G - o.h - 12); ctx.moveTo(x + o.w / 2, G - o.h - 24); ctx.lineTo(x + o.w / 2, G - o.h); ctx.stroke();
      // leak drips
      const d = (this.time * 2 + o.id * 10) % 1;
      ctx.fillStyle = 'rgba(120,200,240,.9)'; ctx.beginPath(); ctx.arc(x + o.w + 3, G - o.h * 0.5 + 12 + d * 40, 3, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'lowpipe') {
      // hangers up to the top of the view
      ctx.strokeStyle = '#59636e'; ctx.lineWidth = 4;
      for (const hx of [x + 24, x + o.w - 24]) { ctx.beginPath(); ctx.moveTo(hx, this.viewTop); ctx.lineTo(hx, G - 104); ctx.stroke(); }
      const top = G - 110;
      const g = ctx.createLinearGradient(0, top, 0, top + 62);
      g.addColorStop(0, BRAND.blue60); g.addColorStop(0.45, BRAND.blue); g.addColorStop(1, BRAND.deep);
      ctx.fillStyle = g; roundRect(ctx, x, top + 6, o.w, 50, 8); ctx.fill();
      ctx.fillStyle = '#3d4a57'; for (const fx of [x - 4, x + o.w / 2 - 6, x + o.w - 8]) { roundRect(ctx, fx, top, 12, 62, 3); ctx.fill(); }
      // leaking spray underneath
      ctx.fillStyle = 'rgba(120,200,240,.55)';
      for (let i = 0; i < 6; i++) {
        const px = x + 20 + i * 26, ph = (this.time * 3 + i * 0.37) % 1;
        ctx.beginPath(); ctx.arc(px, top + 58 + ph * 30, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center';
      this.movingText('MAIN LINE', x + o.w / 2 + 40, top + 36);
    } else if (o.type === 'geyser') {
      const on = this.geyserOn(o);
      // head
      ctx.fillStyle = '#2d2f33'; ctx.fillRect(x - 4, G - 6, o.w + 8, 8);
      ctx.fillStyle = '#5b6068'; roundRect(ctx, x + 3, G - o.h, o.w - 6, o.h, 4); ctx.fill();
      ctx.fillStyle = '#d4a017'; ctx.fillRect(x, G - o.h - 4, o.w, 7);
      if (on >= 1) {
        const jh = o.jet;
        const g = ctx.createLinearGradient(0, G - o.h - jh, 0, G - o.h);
        g.addColorStop(0, 'rgba(160,220,250,.35)'); g.addColorStop(0.3, 'rgba(90,180,235,.9)'); g.addColorStop(1, 'rgba(0,120,200,.95)');
        ctx.fillStyle = g;
        const wob = Math.sin(this.time * 30) * 2;
        ctx.beginPath();
        ctx.moveTo(x + 6, G - o.h);
        ctx.quadraticCurveTo(x + 2 + wob, G - o.h - jh * 0.5, x - 4, G - o.h - jh);
        ctx.lineTo(x + o.w + 4, G - o.h - jh);
        ctx.quadraticCurveTo(x + o.w - 2 - wob, G - o.h - jh * 0.5, x + o.w - 6, G - o.h);
        ctx.fill();
        ctx.fillStyle = 'rgba(200,240,255,.8)';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + o.w / 2 + Math.sin(this.time * 9 + i) * 16, G - o.h - jh - 4 + Math.cos(this.time * 7 + i) * 6, 5, 0, Math.PI * 2); ctx.fill(); }
      } else if (on > 0) {
        // warning burble
        ctx.fillStyle = 'rgba(120,200,240,.8)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + o.w / 2 + (i - 1) * 7, G - o.h - 8 - Math.abs(Math.sin(this.time * 18 + i)) * 12, 3.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }

  // ---------------- scenery
  drawZone(z, alpha) {
    if (z === 0) this.drawTurf(); else if (z === 1) this.drawPumpStation(); else this.drawPlaza();
  }

  tiles(par, tileW, fn) {
    const off = (this.scroll * par) % tileW;
    const first = Math.floor((this.scroll * par) / tileW);
    for (let i = -1; i <= Math.ceil(this.W / tileW) + 1; i++) fn((i * tileW) - off, first + i);
  }

  sky(c0, c1) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, this.viewTop, 0, G);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.fillRect(-2, this.viewTop, this.W + 4, G - this.viewTop + 2);
  }

  // ---- crisp sprites: detailed art is rendered once at the screen's real pixel density,
  // then copied onto whole device pixels so it stays sharp while scrolling fast.
  sprite(key, w, h, pad, draw) {
    const S = this.scale * this.dpr;
    const k = `${key}@${S.toFixed(3)}`;
    let c = this.sprites.get(k);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil((w + pad * 2) * S); c.height = Math.ceil((h + pad * 2) * S);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.scale(S, S); g.translate(pad, pad);
      draw(g);
      c.pad = pad;
      this.sprites.set(k, c);
    }
    return c;
  }
  blit(c, x, y) {
    const ctx = this.ctx, m = ctx.getTransform();
    const S = this.scale * this.dpr;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, Math.round(m.a * (x - c.pad) + m.e), Math.round(m.d * (y - c.pad) + m.f));
    ctx.restore();
    return S;
  }
  logoReady() { return this.logo.complete && this.logo.naturalWidth > 0; }
  // Snap a world coordinate so text lands on a whole device pixel.
  snapX(x) { const m = this.ctx.getTransform(); return (Math.round(m.a * x + m.e) - m.e) / m.a; }
  snapY(y) { const m = this.ctx.getTransform(); return (Math.round(m.d * y + m.f) - m.f) / m.d; }

  billboard(x, y, w, h, dark = false) {
    const ctx = this.ctx;
    ctx.fillStyle = '#59636e'; ctx.fillRect(x + w * 0.2, y + h, 6, G - y - h); ctx.fillRect(x + w * 0.8 - 6, y + h, 6, G - y - h);
    if (!this.logoReady()) return;
    const face = this.sprite(`board${w}x${h}${dark ? 'd' : ''}`, w, h, 3, (g) => {
      g.fillStyle = dark ? '#eef4f8' : '#fff';
      g.strokeStyle = BRAND.blue; g.lineWidth = 3;
      roundRect(g, 0, 0, w, h, 6); g.fill(); g.stroke();
      const lw = w - 20, lh = lw * this.logo.naturalHeight / this.logo.naturalWidth;
      g.drawImage(this.logo, 10, 6, lw, lh);
    });
    this.blit(face, x, y);
    // tagline is small moving text: fade it with speed (the logo itself stays)
    const a = this.labelAlpha;
    if (a > 0.02) {
      const tag = this.sprite(`tag${w}`, w, 16, 1, (g) => {
        g.fillStyle = BRAND.blue; g.font = 'italic 700 12px "Zilla Slab", Georgia, serif'; g.textAlign = 'center';
        g.fillText('Creating Smart Water Solutions', w / 2, 12);
      });
      const ctx2 = this.ctx; ctx2.save(); ctx2.globalAlpha *= a;
      this.blit(tag, x, y + h - 20);
      ctx2.restore();
    }
  }

  groundBase(top, fill) {
    const ctx = this.ctx;
    ctx.fillStyle = fill; ctx.fillRect(-2, G, this.W + 4, this.viewBottom - G + 2);
  }

  drawTurf() {
    const ctx = this.ctx;
    this.sky('#9FD3F2', '#EAF6FC');
    // sun
    ctx.fillStyle = 'rgba(255,240,180,.85)'; ctx.beginPath(); ctx.arc(this.W - 120, 90, 38, 0, Math.PI * 2); ctx.fill();
    // clouds
    this.tiles(0.08, 380, (x, i) => {
      const y = 50 + hash(i) * 90, s = 0.7 + hash(i + 3) * 0.6;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.ellipse(x + 60, y, 48 * s, 18 * s, 0, 0, Math.PI * 2); ctx.ellipse(x + 90, y - 10, 34 * s, 20 * s, 0, 0, Math.PI * 2); ctx.ellipse(x + 30, y - 4, 28 * s, 14 * s, 0, 0, Math.PI * 2); ctx.fill();
    });
    // far hills
    ctx.fillStyle = '#A9D4A6';
    ctx.beginPath(); ctx.moveTo(-2, G);
    for (let x = -2; x <= this.W + 12; x += 12) { const w = x + this.scroll * 0.18; ctx.lineTo(x, G - 120 - Math.sin(w / 140) * 26 - Math.sin(w / 53) * 10); }
    ctx.lineTo(this.W + 12, G); ctx.fill();
    ctx.fillStyle = '#86C383';
    ctx.beginPath(); ctx.moveTo(-2, G);
    for (let x = -2; x <= this.W + 12; x += 12) { const w = x + this.scroll * 0.35; ctx.lineTo(x, G - 60 - Math.sin(w / 90) * 18); }
    ctx.lineTo(this.W + 12, G); ctx.fill();
    // background sprinklers + billboard
    this.tiles(0.5, 260, (x, i) => {
      if (i % 7 === 3) { this.billboard(x + 10, G - 150, 200, 92); return; }
      if (hash(i * 7) < 0.55) {
        const bx = x + 130, by = G - 40;
        ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const ph = (this.time * 0.8 + k * 0.2 + hash(i)) % 1;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + (k - 2) * 22, by - 70, bx + (k - 2) * 44, by - 6);
          ctx.globalAlpha = 0.4 + 0.4 * Math.sin(ph * Math.PI); ctx.stroke(); ctx.globalAlpha = 1;
        }
        ctx.fillStyle = '#3e4a3e'; ctx.fillRect(bx - 3, by - 6, 6, 8);
      }
    });
    // ground: grass + soil + buried pipe
    this.groundBase(G, '#8B6B4A');
    ctx.fillStyle = '#5DBB63'; ctx.fillRect(-2, G, this.W + 4, 14);
    ctx.fillStyle = '#4FA455';
    this.tiles(1, 24, (x, i) => { ctx.beginPath(); ctx.moveTo(x, G); ctx.lineTo(x + 5, G - 7 - hash(i) * 5); ctx.lineTo(x + 10, G); ctx.fill(); });
    ctx.fillStyle = '#7a5c3e'; this.tiles(1, 70, (x, i) => { ctx.beginPath(); ctx.arc(x + hash(i) * 60, G + 30 + hash(i + 1) * 60, 3 + hash(i + 2) * 4, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = BRAND.blue; ctx.fillRect(-2, G + 46, this.W + 4, 14);
    ctx.fillStyle = BRAND.blue60; ctx.fillRect(-2, G + 48, this.W + 4, 3);
    ctx.fillStyle = '#3d4a57'; this.tiles(1, 220, (x) => { ctx.fillRect(x, G + 42, 10, 22); });
  }

  drawPumpStation() {
    const ctx = this.ctx;
    this.sky('#1B2632', '#33475A');
    // back wall panels
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
    this.tiles(0.12, 120, (x) => { ctx.beginPath(); ctx.moveTo(x, this.viewTop); ctx.lineTo(x, G); ctx.stroke(); });
    // big horizontal header pipes
    for (const [y, h, par] of [[110, 34, 0.2], [190, 22, 0.25]]) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, BRAND.blue60); g.addColorStop(0.5, BRAND.blue); g.addColorStop(1, BRAND.deep);
      ctx.fillStyle = g; ctx.fillRect(-2, y, this.W + 4, h);
      ctx.fillStyle = '#4d5965'; this.tiles(par, 180, (x) => ctx.fillRect(x, y - 4, 12, h + 8));
    }
    // pumps & control panels
    this.tiles(0.5, 240, (x, i) => {
      if (i % 4 === 1) {
        // control panel with logo plate
        if (this.logoReady()) {
          const panel = this.sprite('panel', 120, 196, 2, (g) => {
            g.fillStyle = '#c9d1d8'; roundRect(g, 0, 0, 120, 196, 6); g.fill();
            g.strokeStyle = '#8c969f'; g.lineWidth = 2; g.strokeRect(10, 10, 100, 176);
            g.fillStyle = '#fff'; g.fillRect(16, 18, 88, 36);
            g.drawImage(this.logo, 18, 20, 84, 84 * this.logo.naturalHeight / this.logo.naturalWidth);
            g.fillStyle = '#1d2833'; g.fillRect(22, 90, 76, 30);
          });
          this.blit(panel, x + 20, G - 200);
        }
        x = this.snapX(x);
        for (let k = 0; k < 3; k++) {
          const on = Math.sin(this.time * 3 + k * 2 + i) > 0;
          ctx.fillStyle = on ? ['#3ddc84', '#ffcc33', '#ff5a4f'][k] : '#55606a';
          ctx.beginPath(); ctx.arc(x + 52 + k * 28, G - 128, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#3ddc84'; ctx.font = '600 13px "Barlow Condensed", monospace'; ctx.textAlign = 'left';
        this.movingText(`${(60 + Math.sin(this.time + i) * 4).toFixed(1)} PSI`, x + 48, G - 90);
        ctx.fillStyle = '#7d8790'; ctx.font = '600 10px "Barlow Condensed", sans-serif';
        this.movingText('UL 508A', x + 48, G - 60);
      } else {
        // vertical pump + motor
        const px = x + 80;
        ctx.fillStyle = '#4d5965'; ctx.fillRect(px - 50, G - 26, 140, 26);
        ctx.fillStyle = BRAND.blue; roundRect(ctx, px - 30, G - 150, 60, 80, 8); ctx.fill();
        ctx.fillStyle = BRAND.deep; for (let k = 0; k < 5; k++) ctx.fillRect(px - 26, G - 140 + k * 14, 52, 4);
        ctx.fillStyle = '#7d8790'; ctx.fillRect(px - 18, G - 70, 36, 44);
        ctx.fillStyle = BRAND.blue60; ctx.fillRect(px + 18, G - 56, 70, 18);
        ctx.fillStyle = '#d33a2c'; ctx.beginPath(); ctx.arc(px + 60, G - 66, 9, 0, Math.PI * 2); ctx.fill();
      }
    });
    // floor
    this.groundBase(G, '#5e6873');
    ctx.fillStyle = '#8A949E'; ctx.fillRect(-2, G, this.W + 4, 16);
    this.tiles(1, 40, (x, i) => { ctx.fillStyle = i % 2 ? '#f2c230' : '#1d2833'; ctx.fillRect(x, G, 20, 6); ctx.fillRect(x + 20, G, 20, 0); });
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
    this.tiles(1, 30, (x) => { ctx.beginPath(); ctx.moveTo(x, G + 22); ctx.lineTo(x, this.viewBottom); ctx.stroke(); });
  }

  drawPlaza() {
    const ctx = this.ctx;
    this.sky('#5E9BD6', '#FFD9B5');
    // skyline in brand tints
    for (const [par, col, base, var_] of [[0.1, 'rgba(93,133,183,.55)', 210, 140], [0.22, 'rgba(0,86,149,.55)', 130, 110]]) {
      ctx.fillStyle = col;
      this.tiles(par, 70, (x, i) => {
        const h = base + hash(i * 3.1 + par) * var_;
        ctx.fillRect(x, G - h, 62, h);
        if (par > 0.2) { ctx.fillStyle = 'rgba(255,230,160,.5)'; for (let wy = G - h + 12; wy < G - 30; wy += 18) for (let wx = 8; wx < 56; wx += 14) if (hash(i * 13 + wy + wx) > 0.55) ctx.fillRect(x + wx, wy, 6, 8); ctx.fillStyle = col; }
      });
    }
    // fountains + lamp posts + billboard
    this.tiles(0.55, 300, (x, i) => {
      if (i % 6 === 2) { this.billboard(x + 40, G - 160, 210, 96); return; }
      const fx = x + 150;
      // basin
      ctx.fillStyle = '#d9cdbd'; roundRect(ctx, fx - 90, G - 34, 180, 34, 6); ctx.fill();
      ctx.fillStyle = '#4FB3E8'; ctx.fillRect(fx - 82, G - 30, 164, 10);
      // jets (choreographed)
      for (let k = -3; k <= 3; k++) {
        const h = 50 + 60 * (0.5 + 0.5 * Math.sin(this.time * 2.2 + k * 0.7 + i));
        const g = ctx.createLinearGradient(0, G - 30 - h, 0, G - 30);
        g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(120,200,240,.85)');
        ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(fx + k * 22, G - 30); ctx.quadraticCurveTo(fx + k * 26, G - 30 - h * 1.3, fx + k * 34, G - 30 - h * 0.3); ctx.stroke();
      }
      // lamp
      ctx.fillStyle = '#2b3138'; ctx.fillRect(x + 10, G - 130, 5, 130);
      ctx.fillStyle = 'rgba(255,220,140,.9)'; ctx.beginPath(); ctx.arc(x + 12, G - 134, 9, 0, Math.PI * 2); ctx.fill();
    });
    // pavers
    this.groundBase(G, '#B7A690');
    ctx.fillStyle = '#C9B8A3'; ctx.fillRect(-2, G, this.W + 4, 12);
    ctx.strokeStyle = 'rgba(80,60,40,.25)'; ctx.lineWidth = 2;
    this.tiles(1, 48, (x) => { ctx.beginPath(); ctx.moveTo(x, G); ctx.lineTo(x, G + 12); ctx.stroke(); });
    this.tiles(1, 64, (x, i) => { ctx.beginPath(); ctx.moveTo(x + (i % 2) * 32, G + 12); ctx.lineTo(x + (i % 2) * 32, this.viewBottom); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(-2, G + 12); ctx.lineTo(this.W + 2, G + 12); ctx.stroke();
  }
}

export { ZONES, BRAND };
