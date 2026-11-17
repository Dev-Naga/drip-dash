// Splash Escape — top-down survival arena on a circular splash pad.
// World units: the pad is a circle of radius R centred on (0, 0). Everything is drawn in code.
import { sfx } from './audio.js';

// Scoring rules — the server checks scores against these (supabase/schema.sql → submit_splash).
export const RULES = { PTS_PER_SEC: 10, DROP: 25, MAX_COMBO: 5, POWERUP: 50, COIN_EVERY: 1.25, POWER_FIRST: 9, POWER_EVERY: 11 };

const R = 300;            // pad radius
const PILLAR = 40;        // centre fountain basin radius (solid)
const PR = 14;            // player radius (drawn)
const HIT = PR * 0.78;    // player hit radius (a little forgiving)
const SPEED = 235;
const STEP = 1 / 120;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
export const COL = {
  blue: '#005695', blue60: '#5D85B7', blue30: '#A4B7D7', deep: '#003a66', ink: '#040707',
  aqua: '#00C1D5', water: '#7FE3F0', sun: '#FFC845', coral: '#FF7A59', lime: '#7ED957', white: '#ffffff', danger: '#ff4d5e',
};
const DRAINS = [30, 150, 270].map((d) => ({ x: Math.cos(d * Math.PI / 180) * 178, y: Math.sin(d * Math.PI / 180) * 178 }));
const SPRINKLERS = [-40, 140].map((d) => ({ a: d * Math.PI / 180 }));
const NOZZLES = Array.from({ length: 12 }, (_, i) => (i / 12) * TAU + TAU / 24);
const POWER_KINDS = {
  shield: { label: 'Bubble Shield', col: COL.aqua, desc: 'blocks one hit' },
  slow: { label: 'Smart Controller', col: COL.lime, desc: 'slows all water for 5 s' },
  magnet: { label: 'Drop Magnet', col: COL.sun, desc: 'pulls golden drops to you' },
  heart: { label: 'Refill', col: COL.coral, desc: '+1 health' },
};
// Hazards unlock as the run goes on (seconds of survival).
const UNLOCKS = [
  { t: 6, key: 'geyser', text: 'NEW: Pop-up geysers! Watch for bubbling rings.' },
  { t: 12, key: 'beam', text: 'The Big Fountain is waking up! Stay out of its spray arm.' },
  { t: 20, key: 'jet', text: 'NEW: High-pressure jets fire across the pad!' },
  { t: 28, key: 'drain', text: 'NEW: Drain grates are pulling! Don\'t get sucked in.' },
  { t: 38, key: 'bot', text: 'A fountain cart is on the loose!' },
  { t: 50, key: 'sprinkler', text: 'Rotor sprinklers ON. Umbrellas block the spray!' },
  { t: 62, key: 'wave', text: 'SPLASH WAVES! Slip through the gap or DASH.' },
  { t: 75, key: 'beam3', text: 'Fountain overdrive! Three spray arms!' },
];

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---------------------------------------------------------------- mascot: "Spritz", an original water-drop character
// Drawn standing on the pad (feet at y), size = body radius in px.
export function drawSpritz(c, x, y, s, o = {}) {
  const t = o.t || 0, mood = o.mood || 'happy';
  const lx = clamp(o.look?.x || 0, -1, 1), ly = clamp(o.look?.y || 0, -1, 1);
  const squash = o.squash || 0;
  c.save();
  c.translate(x, y);
  // shadow
  c.fillStyle = 'rgba(0,40,70,.25)';
  c.beginPath(); c.ellipse(0, 0, s * 1.05, s * 0.36, 0, 0, TAU); c.fill();
  c.scale(1 + squash * 0.12, 1 - squash * 0.12);
  c.rotate(clamp(lx * 0.18, -0.2, 0.2));
  const cy = -s * 1.05;
  // body (teardrop)
  const g = c.createRadialGradient(-s * 0.35, cy - s * 0.3, s * 0.15, 0, cy, s * 1.5);
  g.addColorStop(0, '#CFF6FF'); g.addColorStop(0.45, '#3CC7EA'); g.addColorStop(1, '#0A6FB0');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, cy - s * 1.55);
  c.bezierCurveTo(s * 0.35, cy - s * 1.0, s * 1.0, cy - s * 0.45, s * 1.0, cy + s * 0.12);
  c.arc(0, cy + s * 0.12, s, 0, Math.PI);
  c.bezierCurveTo(-s * 1.0, cy - s * 0.45, -s * 0.35, cy - s * 1.0, 0, cy - s * 1.55);
  c.fill();
  c.strokeStyle = 'rgba(0,58,102,.55)'; c.lineWidth = Math.max(1, s * 0.07); c.stroke();
  // shine
  c.fillStyle = 'rgba(255,255,255,.75)';
  c.beginPath(); c.ellipse(-s * 0.45, cy - s * 0.45, s * 0.14, s * 0.3, -0.5, 0, TAU); c.fill();
  // swim floatie (sun yellow with coral stripes)
  const fy = cy + s * 0.55;
  c.lineWidth = s * 0.32;
  c.strokeStyle = COL.sun;
  c.beginPath(); c.ellipse(0, fy, s * 1.08, s * 0.34, 0, 0, TAU); c.stroke();
  c.strokeStyle = COL.coral;
  for (const a0 of [0.35, 1.45, 2.55]) { c.beginPath(); c.ellipse(0, fy, s * 1.08, s * 0.34, 0, a0, a0 + 0.38); c.stroke(); }
  // re-draw the front of the body over the back of the floatie
  c.save(); c.beginPath(); c.rect(-s * 1.4, fy, s * 2.8, s * 0.2); c.clip();
  c.fillStyle = g; c.beginPath(); c.arc(0, cy + s * 0.12, s * 0.98, 0, Math.PI); c.fill(); c.restore();
  c.strokeStyle = COL.sun; c.lineWidth = s * 0.32;
  c.beginPath(); c.ellipse(0, fy, s * 1.08, s * 0.34, 0, 0.05, Math.PI - 0.05); c.stroke();
  c.strokeStyle = COL.coral;
  c.beginPath(); c.ellipse(0, fy, s * 1.08, s * 0.34, 0, 1.4, 1.75); c.stroke();
  // goggles pushed up on the forehead
  const gy = cy - s * 0.62;
  c.strokeStyle = COL.coral; c.lineWidth = s * 0.13;
  c.beginPath(); c.moveTo(-s * 0.72, gy + s * 0.12); c.quadraticCurveTo(0, gy - s * 0.12, s * 0.72, gy + s * 0.12); c.stroke();
  for (const sx of [-1, 1]) {
    c.fillStyle = 'rgba(180,240,255,.9)'; c.strokeStyle = COL.coral; c.lineWidth = s * 0.1;
    c.beginPath(); c.ellipse(sx * s * 0.3, gy, s * 0.22, s * 0.16, 0, 0, TAU); c.fill(); c.stroke();
  }
  // face
  const ex = s * 0.33, ey = cy - s * 0.1, blink = o.blink;
  c.fillStyle = COL.ink; c.strokeStyle = COL.ink; c.lineCap = 'round';
  if (mood === 'hurt') {
    c.lineWidth = s * 0.11;
    for (const sx of [-1, 1]) { const px = sx * ex; c.beginPath(); c.moveTo(px - s * 0.12, ey - s * 0.12); c.lineTo(px + s * 0.12, ey + s * 0.12); c.moveTo(px + s * 0.12, ey - s * 0.12); c.lineTo(px - s * 0.12, ey + s * 0.12); c.stroke(); }
  } else if (mood === 'joy') {
    c.lineWidth = s * 0.11;
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * ex, ey + s * 0.05, s * 0.13, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  } else {
    const big = mood === 'worried' ? 1.25 : 1;
    for (const sx of [-1, 1]) {
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(sx * ex, ey, s * 0.2 * big, (blink ? 0.04 : 0.25) * s * big, 0, 0, TAU); c.fill();
      if (!blink) { c.fillStyle = COL.ink; c.beginPath(); c.arc(sx * ex + lx * s * 0.07, ey + ly * s * 0.08, s * 0.11 * big, 0, TAU); c.fill(); }
    }
    if (mood === 'worried' || mood === 'dash') {
      c.lineWidth = s * 0.08; c.strokeStyle = COL.ink;
      for (const sx of [-1, 1]) {
        c.beginPath();
        if (mood === 'dash') { c.moveTo(sx * (ex + s * 0.18), ey - s * 0.36); c.lineTo(sx * (ex - s * 0.14), ey - s * 0.26); } else { c.moveTo(sx * (ex + s * 0.16), ey - s * 0.32); c.lineTo(sx * (ex - s * 0.12), ey - s * 0.42); }
        c.stroke();
      }
    }
  }
  // cheeks
  c.fillStyle = 'rgba(255,122,89,.35)';
  for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * s * 0.58, ey + s * 0.22, s * 0.13, s * 0.08, 0, 0, TAU); c.fill(); }
  // mouth
  const my = cy + s * 0.25;
  c.lineWidth = s * 0.09; c.strokeStyle = COL.ink;
  if (mood === 'worried' || mood === 'hurt') { c.fillStyle = '#7a1f2b'; c.beginPath(); c.ellipse(0, my, s * 0.11, s * 0.14, 0, 0, TAU); c.fill(); }
  else if (mood === 'joy') { c.fillStyle = '#7a1f2b'; c.beginPath(); c.arc(0, my - s * 0.05, s * 0.2, 0, Math.PI); c.closePath(); c.fill(); }
  else if (mood === 'dash') { c.beginPath(); c.moveTo(-s * 0.15, my); c.lineTo(s * 0.15, my); c.stroke(); }
  else { c.beginPath(); c.arc(0, my - s * 0.1, s * 0.18, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  c.restore();
}

// ---------------------------------------------------------------- game
export class SplashGame {
  constructor(canvas, hooks = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.hooks = hooks;
    this.state = 'idle';
    this.keys = new Set(); this.stick = null; this.pointer = null;
    this.bg = document.createElement('canvas');
    this.logo = new Image(); this.logo.onload = () => this.paintBackground(); this.logo.src = new URL('../assets/logo-incontrol.png', import.meta.url).href;
    this.reset(1);
    this.resize();
    addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.resize()).observe(canvas);
    this.last = 0; this.acc = 0;
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ------------------------------------------------ setup
  resize() {
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(320, r.width || innerWidth); this.h = Math.max(320, r.height || innerHeight);
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
    const portrait = this.h > this.w;
    const availH = this.h - (portrait ? 150 : 24), availW = this.w - (portrait ? 16 : 24);
    this.scale = Math.min(availW, availH) / (2 * (R + 30));
    this.cx = this.w / 2; this.cy = portrait ? this.h / 2 + 22 : this.h / 2;
    this.paintBackground();
  }
  toScreen(x, y) { return [this.cx + x * this.scale, this.cy + y * this.scale]; }
  toWorld(sx, sy) { return [(sx - this.cx) / this.scale, (sy - this.cy) / this.scale]; }

  reset(seed) {
    this.rand = mulberry(seed);
    this.t = 0; this.bonus = 0; this.score = 0;
    this.hp = 3; this.inv = 0; this.shield = false; this.slow = 0; this.magnet = 0;
    this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.drops = 0; this.powerups = 0; this.hits = 0; this.firstHitAt = null; this.blocked = 0; this.dodges = 0;
    this.p = { x: 0, y: 120, vx: 0, vy: 0, face: { x: 0, y: 1 } };
    this.dashT = 0; this.dashCd = 0; this.dashDir = { x: 0, y: 1 };
    this.joyT = 0; this.shake = 0; this.countdown = 0;
    this.coins = []; this.powers = []; this.umbrellas = []; this.falls = []; this.geysers = []; this.jets = []; this.bots = []; this.pellets = []; this.waves = [];
    this.parts = []; this.ripples = []; this.pops = []; this.banner = null; this.unlocked = new Set();
    this.drainState = DRAINS.map(() => ({ phase: 'idle', t: 3 + this.rand() * 4 }));
    this.spr = SPRINKLERS.map((s) => ({ ...s, phase: 'rest', t: 1 + this.rand() * 3, sweep: 0, emit: 0 }));
    this.beam = { a: this.rand() * TAU, dir: 1, phase: 'off', t: 0, arms: 1, cycles: 0 };
    this.timers = { coin: 0.3, power: RULES.POWER_FIRST, fall: 1.4, geyser: 0, jet: 0, umbrella: 15, wave: 0 };
    this.coins.push(this.spawnPoint(40), this.spawnPoint(40));
    for (const c of this.coins) c.life = 12;
  }

  start(seed = Date.now()) {
    this.reset(seed);
    this.state = 'countdown'; this.countdown = 3.2;
    sfx.click();
  }
  pause() { if (this.state === 'playing' || this.state === 'countdown') { this.prevState = this.state; this.state = 'paused'; } }
  resume() { if (this.state === 'paused') { this.state = this.prevState || 'playing'; this.last = 0; } }
  quit() { if (this.state === 'paused' || this.state === 'playing') this.end(); }

  // ------------------------------------------------ input
  dash() {
    if (this.state !== 'playing' || this.dashCd > 0) return;
    const v = this.inputVec();
    const m = Math.hypot(v.x, v.y);
    this.dashDir = m > 0.1 ? { x: v.x / m, y: v.y / m } : { ...this.p.face };
    this.dashT = 0.2; this.dashCd = 2.2;
    sfx.jump2();
    for (let i = 0; i < 8; i++) this.part(this.p.x, this.p.y, -this.dashDir.x * 120 + (this.rand() - 0.5) * 80, -this.dashDir.y * 120 + (this.rand() - 0.5) * 80, 0.4, COL.water, 3);
  }
  inputVec() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('a')) x -= 1;
    if (k.has('ArrowRight') || k.has('d')) x += 1;
    if (k.has('ArrowUp') || k.has('w')) y -= 1;
    if (k.has('ArrowDown') || k.has('s')) y += 1;
    if (x || y) { const m = Math.hypot(x, y); return { x: x / m, y: y / m }; }
    if (this.stick) return { x: this.stick.x, y: this.stick.y };
    if (this.pointer) {
      const dx = this.pointer.x - this.p.x, dy = this.pointer.y - this.p.y, d = Math.hypot(dx, dy);
      if (d < 4) return { x: 0, y: 0 };
      const m = Math.min(1, d / 40);
      return { x: dx / d * m, y: dy / d * m };
    }
    return { x: 0, y: 0 };
  }

  // ------------------------------------------------ helpers
  spawnPoint(minFromPlayer = 0, near = null, spread = 0) {
    for (let i = 0; i < 30; i++) {
      let x, y;
      if (near) { const a = this.rand() * TAU, d = this.rand() * spread; x = near.x + Math.cos(a) * d; y = near.y + Math.sin(a) * d; }
      else { const a = this.rand() * TAU, d = Math.sqrt(this.rand()) * (R - 30); x = Math.cos(a) * d; y = Math.sin(a) * d; }
      const r = Math.hypot(x, y);
      if (r > R - 28 || r < PILLAR + 26) continue;
      if (minFromPlayer && Math.hypot(x - this.p.x, y - this.p.y) < minFromPlayer) continue;
      return { x, y };
    }
    return { x: 0, y: -(PILLAR + 80) };
  }
  part(x, y, vx, vy, life, col, size) {
    if (this.parts.length > (REDUCED ? 80 : 260)) return;
    this.parts.push({ x, y, vx, vy, life, max: life, col, size });
  }
  splash(x, y, n = 10, col = COL.water) {
    for (let i = 0; i < (REDUCED ? n / 2 : n); i++) { const a = this.rand() * TAU, v = 40 + this.rand() * 120; this.part(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + this.rand() * 0.35, col, 2 + this.rand() * 2.5); }
    this.ripples.push({ x, y, r: 4, life: 0.6 });
  }
  pop(x, y, text, col = '#fff') { this.pops.push({ x, y, text, col, life: 1 }); }
  announce(text) { this.banner = { text, life: 3.2 }; sfx.alarm(); }
  inUmbrella() { return this.umbrellas.some((u) => Math.hypot(this.p.x - u.x, this.p.y - u.y) < u.r); }

  hit(source) {
    if (this.inv > 0 || this.state !== 'playing') return;
    if (this.dashT > 0) { return; }
    if (this.shield) {
      this.shield = false; this.inv = 1.0; sfx.shield();
      this.pop(this.p.x, this.p.y - 30, 'Shield popped!', COL.aqua); this.splash(this.p.x, this.p.y, 16, COL.aqua);
      return;
    }
    this.hp -= 1; this.hits += 1; this.inv = 1.6; this.combo = 0;
    if (this.firstHitAt == null) this.firstHitAt = this.t;
    this.shake = REDUCED ? 0 : 0.35;
    sfx.hit(); this.splash(this.p.x, this.p.y, 22);
    this.pop(this.p.x, this.p.y - 30, source || 'Splash!', COL.danger);
    if (this.hp <= 0) this.end();
  }
  // A hazard touched the player: hit, or count a dodge if the player is dashing through it.
  touch(source) {
    if (this.dashT > 0 && this.inv <= 0) { if (!this._dodgedThisDash) { this.dodges++; this._dodgedThisDash = true; this.pop(this.p.x, this.p.y - 30, 'Dodged!', COL.sun); } return; }
    this.hit(source);
  }
  end() {
    if (this.state === 'over') return;
    this.state = 'over';
    sfx.fail();
    this.hooks.onGameOver?.(this.result());
  }
  result() {
    return {
      score: this.score, durationMs: Math.round(this.t * 1000), drops: this.drops, powerups: this.powerups,
      bestCombo: this.bestCombo, hits: this.hits, noHitSeconds: this.firstHitAt == null ? this.t : this.firstHitAt,
      blocked: this.blocked, dodges: this.dodges,
    };
  }

  // ------------------------------------------------ simulation
  frame(ts) {
    const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0;
    this.last = ts;
    if (this.state === 'playing' || this.state === 'countdown') {
      this.acc += dt;
      while (this.acc >= STEP) { this.step(STEP); this.acc -= STEP; }
    } else this.acc = 0;
    this.ambient(dt);
    this.draw(ts / 1000);
    requestAnimationFrame((t) => this.frame(t));
  }

  ambient(dt) {
    for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy *= 0.96; q.life -= dt; }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const r of this.ripples) { r.r += 60 * dt; r.life -= dt; }
    this.ripples = this.ripples.filter((r) => r.life > 0);
    for (const p of this.pops) { p.y -= 30 * dt; p.life -= dt; }
    this.pops = this.pops.filter((p) => p.life > 0);
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    this.shake = Math.max(0, this.shake - dt);
  }

  step(dt) {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) sfx.beat(3 - Math.ceil(this.countdown));
      if (this.countdown <= 0) { this.state = 'playing'; sfx.win(); }
      this.movePlayer(dt);
      return;
    }
    this.t += dt;
    const hdt = this.slow > 0 ? dt * 0.5 : dt;    // hazards run at half speed under the Smart Controller
    this.inv = Math.max(0, this.inv - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.dashT > 0) { this.dashT -= dt; if (this.dashT <= 0) this._dodgedThisDash = false; }
    this.joyT = Math.max(0, this.joyT - dt);
    if (this.combo && (this.comboT -= dt) <= 0) this.combo = 0;

    for (const u of UNLOCKS) if (this.t >= u.t && !this.unlocked.has(u.key)) { this.unlocked.add(u.key); this.announce(u.text); }

    this.movePlayer(dt);
    this.director(hdt, dt);
    this.updateHazards(hdt);
    this.updatePickups(dt);
    this.score = Math.floor(this.t * RULES.PTS_PER_SEC) + this.bonus;
  }

  movePlayer(dt) {
    const p = this.p, v = this.inputVec();
    if (this.dashT > 0) { p.vx = this.dashDir.x * SPEED * 3.1; p.vy = this.dashDir.y * SPEED * 3.1; }
    else {
      const k = Math.min(1, dt * 14);
      p.vx = lerp(p.vx, v.x * SPEED, k); p.vy = lerp(p.vy, v.y * SPEED, k);
    }
    if (Math.hypot(v.x, v.y) > 0.15) { const m = Math.hypot(v.x, v.y); p.face = { x: v.x / m, y: v.y / m }; }
    // drain suction
    if (this.state === 'playing') DRAINS.forEach((d, i) => {
      if (this.drainState[i].phase !== 'on') return;
      const dx = d.x - p.x, dy = d.y - p.y, dist = Math.hypot(dx, dy);
      if (dist < 125 && dist > 1) { const f = 175 * (1 - dist / 125) * (this.slow > 0 ? 0.5 : 1); p.x += dx / dist * f * dt; p.y += dy / dist * f * dt; }
    });
    p.x += p.vx * dt; p.y += p.vy * dt;
    const r = Math.hypot(p.x, p.y);
    if (r > R - PR - 4) { p.x *= (R - PR - 4) / r; p.y *= (R - PR - 4) / r; }
    if (r < PILLAR + PR) { const k = (PILLAR + PR) / (r || 1); p.x = (p.x || 0.01) * k; p.y *= k; }
    if (!REDUCED && Math.hypot(p.vx, p.vy) > 120 && this.rand() < dt * 18) this.part(p.x + (this.rand() - 0.5) * 10, p.y + 4, -p.vx * 0.1, -p.vy * 0.1, 0.4, 'rgba(255,255,255,.8)', 2);
  }

  director(hdt, dt) {
    const t = this.t, T = this.timers;
    // golden drops (cap 3 on the pad) and power-ups — timed on the real clock
    if ((T.coin -= dt) <= 0) { T.coin = RULES.COIN_EVERY; if (this.coins.length < 3) this.coins.push({ ...this.spawnPoint(70), life: 9 }); }
    if ((T.power -= dt) <= 0) {
      T.power = RULES.POWER_EVERY;
      const kinds = ['shield', 'slow', 'magnet'].concat(this.hp < 3 ? ['heart', 'heart'] : []);
      this.powers.push({ ...this.spawnPoint(90), kind: kinds[Math.floor(this.rand() * kinds.length)], life: 8 });
    }
    if ((T.umbrella -= dt) <= 0) { T.umbrella = 14; this.umbrellas.push({ ...this.spawnPoint(60), r: 48, life: 7, max: 7 }); }

    // falling drops
    if ((T.fall -= hdt) <= 0) {
      T.fall = Math.max(0.38, 1.3 - t * 0.012);
      const n = 1 + Math.floor(t / 40);
      for (let i = 0; i < n; i++) {
        const near = this.rand() < 0.55;
        const pt = near ? this.spawnPoint(0, this.p, 70) : this.spawnPoint();
        const warn = Math.max(0.7, 1.15 - t * 0.005);
        this.falls.push({ ...pt, r: 22 + Math.min(14, t * 0.12), warn, max: warn, splash: 0 });
      }
    }
    if (this.unlocked.has('geyser') && (T.geyser -= hdt) <= 0) {
      T.geyser = Math.max(1.0, 3.2 - t * 0.025);
      const pt = this.rand() < 0.6 ? this.spawnPoint(0, this.p, 90) : this.spawnPoint();
      const warn = Math.max(0.7, 1.05 - t * 0.004);
      this.geysers.push({ ...pt, r: 34, warn, max: warn, on: 0 });
    }
    if (this.unlocked.has('jet') && (T.jet -= hdt) <= 0) {
      T.jet = Math.max(1.5, 4.5 - t * 0.03);
      const a = NOZZLES[Math.floor(this.rand() * NOZZLES.length)];
      const sx = Math.cos(a) * (R - 10), sy = Math.sin(a) * (R - 10);
      const tgt = { x: this.p.x + (this.rand() - 0.5) * 60, y: this.p.y + (this.rand() - 0.5) * 60 };
      let dx = tgt.x - sx, dy = tgt.y - sy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      // extend to the far rim
      const b = 2 * (sx * dx + sy * dy), c = sx * sx + sy * sy - (R - 10) * (R - 10);
      const k = (-b + Math.sqrt(Math.max(0, b * b - 4 * c))) / 2;
      const warn = Math.max(0.7, 1.0 - t * 0.003);
      this.jets.push({ a, x1: sx, y1: sy, x2: sx + dx * k, y2: sy + dy * k, warn, max: warn, on: 0 });
    }
    if (this.unlocked.has('bot') && this.bots.length < (t > 70 ? 2 : 1)) {
      const a = this.rand() * TAU, sp = 75 + Math.min(45, t * 0.4);
      const pt = this.spawnPoint(160);
      this.bots.push({ ...pt, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, pulse: 1.5, rings: [], glow: 0 });
    }
    if (this.unlocked.has('wave') && (T.wave -= hdt) <= 0) {
      T.wave = Math.max(4.2, 8 - (t - 62) * 0.04);
      this.waves.push({ r: PILLAR + 4, gap: this.rand() * TAU, gapW: 0.95, speed: 80 + Math.min(50, (t - 62) * 0.5) });
    }
  }

  updateHazards(hdt) {
    const p = this.p, under = this.inUmbrella();
    // falling drops: shadow grows, then splash
    for (const f of this.falls) {
      if (f.warn > 0) {
        f.warn -= hdt;
        if (f.warn <= 0) {
          f.splash = 0.22; sfx.splash(); this.splash(f.x, f.y, 12);
          if (Math.hypot(p.x - f.x, p.y - f.y) < f.r + HIT) {
            if (under) { this.blocked++; this.pop(p.x, p.y - 30, 'Blocked!', COL.aqua); } else this.touch('Splashed!');
          }
        }
      } else f.splash -= hdt;
    }
    this.falls = this.falls.filter((f) => f.warn > 0 || f.splash > 0);
    // geysers
    for (const g of this.geysers) {
      if (g.warn > 0) { g.warn -= hdt; if (g.warn <= 0) { g.on = 0.6; sfx.valveOpen(); } if (!REDUCED && this.rand() < 0.3) this.part(g.x + (this.rand() - 0.5) * g.r, g.y + (this.rand() - 0.5) * g.r, 0, -20, 0.3, 'rgba(255,255,255,.9)', 2); }
      else {
        g.on -= hdt;
        if (this.rand() < 0.6) this.part(g.x + (this.rand() - 0.5) * 12, g.y, (this.rand() - 0.5) * 140, (this.rand() - 0.5) * 140, 0.5, COL.water, 3);
        if (Math.hypot(p.x - g.x, p.y - g.y) < g.r + HIT) this.touch('Geyser!');
      }
    }
    this.geysers = this.geysers.filter((g) => g.warn > 0 || g.on > 0);
    // central fountain arms: off → warm-up → on
    if (this.unlocked.has('beam')) {
      const B = this.beam;
      B.arms = this.unlocked.has('beam3') ? 3 : this.t > 40 ? 2 : 1;
      const speed = (0.55 + Math.min(0.75, this.t * 0.006)) * B.dir;
      B.t -= hdt;
      if (B.phase === 'off' && B.t <= 0) { B.phase = 'warm'; B.t = 1.1; }
      else if (B.phase === 'warm' && B.t <= 0) { B.phase = 'on'; B.t = 6 + Math.min(3, this.t * 0.03); sfx.pumpOn(); }
      else if (B.phase === 'on' && B.t <= 0) { B.phase = 'off'; B.t = Math.max(1.4, 2.6 - this.t * 0.01); B.cycles++; if (this.t > 50 && this.rand() < 0.6) B.dir *= -1; sfx.pumpOff(); }
      if (B.phase !== 'off') B.a += speed * hdt * (B.phase === 'warm' ? 0.5 : 1);
      if (B.phase === 'on') {
        for (let i = 0; i < B.arms; i++) {
          const a = B.a + (i / B.arms) * TAU;
          const d = segDist(p.x, p.y, Math.cos(a) * PILLAR, Math.sin(a) * PILLAR, Math.cos(a) * R, Math.sin(a) * R);
          if (d < 9 + HIT) this.touch('Fountain spray!');
        }
      }
    }
    // high-pressure jets across the pad
    for (const j of this.jets) {
      if (j.warn > 0) { j.warn -= hdt; if (j.warn <= 0) { j.on = 0.45; sfx.splash(); } }
      else { j.on -= hdt; if (segDist(p.x, p.y, j.x1, j.y1, j.x2, j.y2) < 9 + HIT) this.touch('Jet blast!'); }
    }
    this.jets = this.jets.filter((j) => j.warn > 0 || j.on > 0);
    // drains
    if (this.unlocked.has('drain')) DRAINS.forEach((d, i) => {
      const s = this.drainState[i];
      s.t -= hdt;
      if (s.phase === 'idle' && s.t <= 0) { s.phase = 'warn'; s.t = 1.2; }
      else if (s.phase === 'warn' && s.t <= 0) { s.phase = 'on'; s.t = 3; sfx.pumpOn(); }
      else if (s.phase === 'on' && s.t <= 0) { s.phase = 'idle'; s.t = Math.max(2.5, 6 - this.t * 0.03) + this.rand() * 2; }
      if (s.phase === 'on') {
        if (Math.hypot(p.x - d.x, p.y - d.y) < 18 + HIT) this.touch('Down the drain!');
        if (!REDUCED && this.rand() < 0.5) { const a = this.rand() * TAU; this.part(d.x + Math.cos(a) * 90, d.y + Math.sin(a) * 90, -Math.cos(a) * 140, -Math.sin(a) * 140, 0.6, 'rgba(255,255,255,.75)', 2); }
      }
    });
    // fountain carts
    for (const b of this.bots) {
      b.x += b.vx * hdt; b.y += b.vy * hdt;
      const r = Math.hypot(b.x, b.y);
      if (r > R - 30 || r < PILLAR + 34) {
        const nx = b.x / r, ny = b.y / r, dot = b.vx * nx + b.vy * ny;
        if ((r > R - 30 && dot > 0) || (r < PILLAR + 34 && dot < 0)) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
      }
      b.pulse -= hdt; b.glow = Math.max(0, 0.6 - b.pulse);
      if (b.pulse <= 0) { b.pulse = Math.max(1.6, 2.6 - this.t * 0.01); b.rings.push({ r: 20 }); sfx.splash(); }
      for (const ring of b.rings) {
        ring.r += 150 * hdt;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (Math.abs(d - ring.r) < 7 + HIT) this.touch('Fountain cart!');
      }
      b.rings = b.rings.filter((ring) => ring.r < 95);
      if (Math.hypot(p.x - b.x, p.y - b.y) < 20 + HIT) this.touch('Bumped!');
    }
    // rotor sprinklers
    if (this.unlocked.has('sprinkler')) for (const s of this.spr) {
      s.t -= hdt;
      if (s.phase === 'rest' && s.t <= 0) { s.phase = 'warn'; s.t = 0.9; }
      else if (s.phase === 'warn' && s.t <= 0) { s.phase = 'on'; s.t = 4.5; }
      else if (s.phase === 'on' && s.t <= 0) { s.phase = 'rest'; s.t = 3.5 + this.rand() * 2; }
      if (s.phase === 'on') {
        s.sweep += hdt * 1.7;
        s.emit -= hdt;
        if (s.emit <= 0) {
          s.emit = 0.1;
          const sx = Math.cos(s.a) * (R - 8), sy = Math.sin(s.a) * (R - 8);
          const dir = s.a + Math.PI + Math.sin(s.sweep) * 0.75;
          this.pellets.push({ x: sx, y: sy, vx: Math.cos(dir) * 210, vy: Math.sin(dir) * 210, life: 3 });
        }
      }
    }
    for (const q of this.pellets) {
      q.x += q.vx * hdt; q.y += q.vy * hdt; q.life -= hdt;
      if (Math.hypot(p.x - q.x, p.y - q.y) < 5 + HIT) {
        if (under) { this.blocked++; q.life = 0; } else { this.touch('Sprinkler!'); q.life = 0; }
      }
      if (this.umbrellas.some((u) => Math.hypot(q.x - u.x, q.y - u.y) < u.r)) { q.life = 0; if (this.rand() < 0.4) this.part(q.x, q.y, 0, 0, 0.25, COL.water, 2); }
      if (Math.hypot(q.x, q.y) > R + 6 || Math.hypot(q.x, q.y) < PILLAR) q.life = 0;
    }
    this.pellets = this.pellets.filter((q) => q.life > 0);
    // splash waves (ring with a gap)
    for (const w of this.waves) {
      w.r += w.speed * hdt;
      const d = Math.hypot(p.x, p.y);
      if (Math.abs(d - w.r) < 8 + HIT) {
        const a = Math.atan2(p.y, p.x);
        if (Math.abs(angDiff(a, w.gap)) > w.gapW / 2) this.touch('Wave!');
      }
    }
    this.waves = this.waves.filter((w) => w.r < R + 10);
  }

  updatePickups(dt) {
    const p = this.p;
    for (const c of this.coins) {
      c.life -= dt;
      if (this.magnet > 0) { const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy); if (d < 220 && d > 1) { c.x += dx / d * 260 * dt; c.y += dy / d * 260 * dt; } }
      if (Math.hypot(p.x - c.x, p.y - c.y) < PR + 12) {
        c.life = 0;
        this.combo = this.comboT > 0 && this.combo ? Math.min(RULES.MAX_COMBO, this.combo + 1) : 1;
        this.comboT = 3; this.bestCombo = Math.max(this.bestCombo, this.combo);
        const v = RULES.DROP * this.combo;
        this.bonus += v; this.drops++; this.joyT = 0.5;
        sfx.drop(this.combo); this.splash(c.x, c.y, 8, COL.sun);
        this.pop(c.x, c.y - 20, this.combo > 1 ? `+${v}  x${this.combo}` : `+${v}`, COL.sun);
      }
    }
    this.coins = this.coins.filter((c) => c.life > 0);
    for (const u of this.powers) {
      u.life -= dt;
      if (Math.hypot(p.x - u.x, p.y - u.y) < PR + 16) {
        u.life = 0; this.powerups++; this.bonus += RULES.POWERUP; this.joyT = 0.6;
        if (u.kind === 'shield') this.shield = true;
        if (u.kind === 'slow') this.slow = 5;
        if (u.kind === 'magnet') this.magnet = 8;
        if (u.kind === 'heart') this.hp = Math.min(3, this.hp + 1);
        sfx.power(); this.splash(u.x, u.y, 14, POWER_KINDS[u.kind].col);
        this.pop(u.x, u.y - 24, POWER_KINDS[u.kind].label, POWER_KINDS[u.kind].col);
      }
    }
    this.powers = this.powers.filter((u) => u.life > 0);
    for (const u of this.umbrellas) u.life -= dt;
    this.umbrellas = this.umbrellas.filter((u) => u.life > 0);
  }

  // nearest warning, for the mascot's face
  danger() {
    const p = this.p; let near = false;
    for (const f of this.falls) if (f.warn > 0 && Math.hypot(p.x - f.x, p.y - f.y) < f.r + 30) near = true;
    for (const g of this.geysers) if (Math.hypot(p.x - g.x, p.y - g.y) < g.r + 30) near = true;
    for (const j of this.jets) if (segDist(p.x, p.y, j.x1, j.y1, j.x2, j.y2) < 40) near = true;
    return near;
  }

  // ------------------------------------------------ drawing
  paintBackground() {
    if (!this.w) return;
    const bg = this.bg; bg.width = this.cv.width; bg.height = this.cv.height;
    const c = bg.getContext('2d'), s = this.scale;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // lawn with mowing stripes
    c.fillStyle = '#5DB451'; c.fillRect(0, 0, this.w, this.h);
    c.fillStyle = 'rgba(255,255,255,.07)';
    for (let x = -this.h; x < this.w; x += 56) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 28, 0); c.lineTo(x + 28 + this.h, this.h); c.lineTo(x + this.h, this.h); c.fill(); }
    c.translate(this.cx, this.cy); c.scale(s, s);
    // park decor (outside the pad)
    const deco = mulberry(7);
    const far = Math.hypot(this.w, this.h) / s;
    for (let i = 0; i < 60; i++) {
      const a = deco() * TAU, d = R + 70 + deco() * far * 0.6;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const k = deco();
      if (k < 0.45) { // tree (top-down)
        const r = 22 + deco() * 18;
        c.fillStyle = 'rgba(0,40,0,.25)'; c.beginPath(); c.arc(x + 6, y + 6, r, 0, TAU); c.fill();
        c.fillStyle = '#2F8A3A'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        c.fillStyle = '#46A84C'; c.beginPath(); c.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, TAU); c.fill();
      } else if (k < 0.7) { // flower bed
        c.fillStyle = '#7A5230'; c.beginPath(); c.ellipse(x, y, 26, 14, a, 0, TAU); c.fill();
        for (let f = 0; f < 7; f++) { c.fillStyle = [COL.coral, COL.sun, '#fff', '#c084fc'][f % 4]; c.beginPath(); c.arc(x + (deco() - 0.5) * 36, y + (deco() - 0.5) * 16, 3.5, 0, TAU); c.fill(); }
      } else { // patio umbrella table
        const cols = [COL.blue, COL.aqua, COL.sun, COL.coral];
        c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(x + 5, y + 5, 24, 0, TAU); c.fill();
        for (let w = 0; w < 8; w++) { c.fillStyle = w % 2 ? '#fff' : cols[i % 4]; c.beginPath(); c.moveTo(x, y); c.arc(x, y, 24, (w / 8) * TAU, ((w + 1) / 8) * TAU); c.fill(); }
      }
    }
    // paver deck
    c.fillStyle = '#E8DFC9'; c.beginPath(); c.arc(0, 0, R + 30, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(120,100,70,.25)'; c.lineWidth = 1;
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * R, Math.sin(a) * R); c.lineTo(Math.cos(a) * (R + 30), Math.sin(a) * (R + 30)); c.stroke(); }
    c.beginPath(); c.arc(0, 0, R + 15, 0, TAU); c.stroke();
    // branded text around the deck
    c.save();
    c.fillStyle = 'rgba(0,86,149,.85)'; c.font = '700 13px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const label = ' INCON-TROL WATER WORLD  •  SPLASH ESCAPE  •  ';
    const full = label.repeat(3); const step = TAU / full.length;
    for (let i = 0; i < full.length; i++) { const a = -Math.PI / 2 + i * step; c.save(); c.translate(Math.cos(a) * (R + 22), Math.sin(a) * (R + 22)); c.rotate(a + Math.PI / 2); c.fillText(full[i], 0, 0); c.restore(); }
    c.restore();
    // pad surface: colourful wedges in brand blues
    const wedges = ['#1E8FCB', '#36B4DE', '#2A9FD3', '#4CC3E3'];
    for (let i = 0; i < 16; i++) { c.fillStyle = wedges[i % 4]; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, (i / 16) * TAU, ((i + 1) / 16) * TAU); c.closePath(); c.fill(); }
    // painted rings
    c.lineWidth = 12; c.strokeStyle = 'rgba(255,200,69,.85)'; c.beginPath(); c.arc(0, 0, 92, 0, TAU); c.stroke();
    c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,.55)'; c.setLineDash([14, 10]); c.beginPath(); c.arc(0, 0, 238, 0, TAU); c.stroke(); c.setLineDash([]);
    c.fillStyle = 'rgba(255,122,89,.7)';
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; c.beginPath(); c.arc(Math.cos(a) * 140, Math.sin(a) * 140, 5, 0, TAU); c.fill(); }
    // decals: little drops and stars
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3, d = 205;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      c.fillStyle = i % 2 ? 'rgba(255,255,255,.35)' : 'rgba(255,200,69,.45)';
      c.beginPath(); c.moveTo(x, y - 12); c.quadraticCurveTo(x + 9, y, x, y + 7); c.quadraticCurveTo(x - 9, y, x, y - 12); c.fill();
    }
    // non-slip texture specks
    const sp = mulberry(3); c.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 400; i++) { const a = sp() * TAU, d = Math.sqrt(sp()) * R; c.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.5, 1.5); }
    // trench drain around the edge + curb
    c.lineWidth = 7; c.strokeStyle = '#2b3946'; c.beginPath(); c.arc(0, 0, R - 3, 0, TAU); c.stroke();
    c.strokeStyle = '#8aa0b2'; c.lineWidth = 1.2;
    for (let i = 0; i < 180; i++) { const a = (i / 180) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * (R - 6.5), Math.sin(a) * (R - 6.5)); c.lineTo(Math.cos(a) * (R + 0.5), Math.sin(a) * (R + 0.5)); c.stroke(); }
    c.lineWidth = 4; c.strokeStyle = '#f7f2e6'; c.beginPath(); c.arc(0, 0, R + 2, 0, TAU); c.stroke();
    // rim nozzles
    for (const a of NOZZLES) { const x = Math.cos(a) * (R - 12), y = Math.sin(a) * (R - 12); c.fillStyle = '#b08d3c'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill(); c.fillStyle = '#e6c46a'; c.beginPath(); c.arc(x - 1, y - 1, 3, 0, TAU); c.fill(); }
    // sprinkler heads
    for (const sp2 of SPRINKLERS) { const x = Math.cos(sp2.a) * (R - 8), y = Math.sin(sp2.a) * (R - 8); c.fillStyle = '#1c1c1c'; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill(); c.fillStyle = '#4a4a4a'; c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); }
    // drain grates
    for (const d of DRAINS) {
      c.fillStyle = '#56636e'; c.beginPath(); c.arc(d.x, d.y, 22, 0, TAU); c.fill();
      c.fillStyle = '#2b3138'; c.beginPath(); c.arc(d.x, d.y, 18, 0, TAU); c.fill();
      c.strokeStyle = '#9aa8b4'; c.lineWidth = 2;
      for (let k = -12; k <= 12; k += 6) { const h = Math.sqrt(18 * 18 - k * k); c.beginPath(); c.moveTo(d.x + k, d.y - h); c.lineTo(d.x + k, d.y + h); c.stroke(); }
    }
    // centre basin (stone)
    c.fillStyle = '#d9d2c1'; c.beginPath(); c.arc(0, 0, PILLAR, 0, TAU); c.fill();
    c.fillStyle = '#0d6fa6'; c.beginPath(); c.arc(0, 0, PILLAR - 7, 0, TAU); c.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  w2s(x, y) { return [x * this.scale, y * this.scale]; }

  draw(time) {
    const c = this.ctx, s = this.scale, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg, 0, 0);
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = (Math.random() - 0.5) * 10 * this.shake; sy = (Math.random() - 0.5) * 10 * this.shake; }
    c.setTransform(d * s, 0, 0, d * s, d * (this.cx + sx), d * (this.cy + sy));

    // water sheen on the pad
    c.save(); c.beginPath(); c.arc(0, 0, R - 6, 0, TAU); c.clip();
    c.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + time * 0.05 * (i % 2 ? 1 : -1), dd = 90 + i * 30; c.beginPath(); c.ellipse(Math.cos(a) * dd, Math.sin(a) * dd, 50, 18, a, 0, TAU); c.fill(); }
    c.restore();

    // park attractions around the deck: mushroom fountains with animated water canopies
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * (R + 78), y = Math.sin(a) * (R + 78);
      const k = 1 + Math.sin(time * 3 + i) * 0.06;
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 5, y + 5, 30, 0, TAU); c.fill();
      c.fillStyle = 'rgba(127,227,240,.55)'; c.beginPath(); c.arc(x, y, 30 * k, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2;
      for (let j = 0; j < 10; j++) { const b = (j / 10) * TAU + time * 0.6; c.beginPath(); c.moveTo(x + Math.cos(b) * 8, y + Math.sin(b) * 8); c.lineTo(x + Math.cos(b) * 28 * k, y + Math.sin(b) * 28 * k); c.stroke(); }
      c.fillStyle = [COL.coral, COL.sun, COL.lime, COL.aqua][i]; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
    }

    // centre fountain water dome
    const pulse = 1 + Math.sin(time * 6) * 0.05;
    const on = this.beam.phase === 'on';
    c.fillStyle = on ? 'rgba(200,245,255,.95)' : 'rgba(170,230,250,.8)';
    c.beginPath(); c.arc(0, 0, (PILLAR - 12) * pulse, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 9 * pulse, 0, TAU); c.fill();
    c.fillStyle = COL.blue; c.font = '700 11px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('iC', 0, 1);

    // safe-zone umbrellas
    for (const u of this.umbrellas) {
      const fade = Math.min(1, u.life / 1.2, (u.max - u.life) / 0.3 + 0.2);
      c.globalAlpha = 0.25 * fade; c.fillStyle = '#003a66'; c.beginPath(); c.arc(u.x, u.y, u.r, 0, TAU); c.fill();
      c.globalAlpha = fade;
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.arc(u.x, u.y, u.r, time * 0.5, time * 0.5 + TAU); c.stroke(); c.setLineDash([]);
      const ur = 26;
      for (let w = 0; w < 8; w++) { c.fillStyle = w % 2 ? '#fff' : COL.coral; c.beginPath(); c.moveTo(u.x, u.y - 10); c.arc(u.x, u.y - 10, ur, (w / 8) * TAU, ((w + 1) / 8) * TAU); c.fill(); }
      c.fillStyle = '#333'; c.beginPath(); c.arc(u.x, u.y - 10, 3, 0, TAU); c.fill();
      if (u.life < 2 && Math.sin(time * 18) > 0) { c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(u.x, u.y - 10, ur, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }

    // drain state overlays
    DRAINS.forEach((dr, i) => {
      const st = this.drainState[i];
      if (st.phase === 'warn' || st.phase === 'on') {
        c.save(); c.translate(dr.x, dr.y);
        c.strokeStyle = st.phase === 'on' ? 'rgba(255,77,94,.85)' : 'rgba(255,200,69,.9)'; c.lineWidth = 3;
        for (let k = 0; k < 3; k++) { const rr = 30 + ((time * 60 + k * 30) % 95); c.globalAlpha = 1 - rr / 125; c.beginPath(); c.arc(0, 0, 125 - rr, 0, TAU); c.stroke(); }
        c.globalAlpha = 1;
        c.rotate(time * (st.phase === 'on' ? 6 : 2));
        c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(0, 0, 13, (k / 3) * TAU, (k / 3) * TAU + 1.2); c.stroke(); }
        c.restore();
      }
    });

    // golden drops
    for (const g of this.coins) {
      const bob = Math.sin(time * 5 + g.x) * 3, blink = g.life < 2 && Math.sin(time * 20) > 0;
      if (blink) continue;
      c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(g.x, g.y + 6, 8, 3, 0, 0, TAU); c.fill();
      const y = g.y - 6 + bob;
      const gr = c.createLinearGradient(g.x - 8, y - 12, g.x + 8, y + 8); gr.addColorStop(0, '#FFF3B0'); gr.addColorStop(0.5, COL.sun); gr.addColorStop(1, '#D99A00');
      c.fillStyle = gr; c.beginPath(); c.moveTo(g.x, y - 14); c.quadraticCurveTo(g.x + 11, y, g.x, y + 8); c.quadraticCurveTo(g.x - 11, y, g.x, y - 14); c.fill();
      c.strokeStyle = '#a87400'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(g.x - 3, y - 2, 2, 0, TAU); c.fill();
    }
    // power-ups
    for (const u of this.powers) {
      if (u.life < 2 && Math.sin(time * 20) > 0) continue;
      const k = POWER_KINDS[u.kind], y = u.y - 4 + Math.sin(time * 4 + u.x) * 3;
      c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(u.x, y, 15, 0, TAU); c.fill();
      c.strokeStyle = k.col; c.lineWidth = 3; c.stroke();
      this.icon(c, u.kind, u.x, y, 9);
    }

    // telegraphs + hazards
    for (const f of this.falls) {
      if (f.warn > 0) {
        const k = 1 - f.warn / f.max;
        c.fillStyle = `rgba(0,30,60,${0.15 + 0.3 * k})`; c.beginPath(); c.arc(f.x, f.y, f.r * (0.4 + 0.6 * k), 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,77,94,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(f.x, f.y, f.r, 0, TAU * k); c.stroke();
        // the drop falling from above
        const hY = f.y - 160 * (1 - k);
        c.globalAlpha = 0.3 + 0.7 * k;
        c.fillStyle = 'rgba(160,235,255,.95)'; c.beginPath(); c.moveTo(f.x, hY - 16); c.quadraticCurveTo(f.x + 10, hY, f.x, hY + 6); c.quadraticCurveTo(f.x - 10, hY, f.x, hY - 16); c.fill();
        c.globalAlpha = 1;
      } else {
        c.strokeStyle = `rgba(255,255,255,${f.splash * 4})`; c.lineWidth = 4; c.beginPath(); c.arc(f.x, f.y, f.r * (1.3 - f.splash), 0, TAU); c.stroke();
      }
    }
    for (const g of this.geysers) {
      if (g.warn > 0) {
        const k = 1 - g.warn / g.max;
        c.strokeStyle = `rgba(255,200,69,${0.5 + 0.5 * Math.sin(time * 20)})`; c.lineWidth = 3; c.beginPath(); c.arc(g.x, g.y, g.r, 0, TAU); c.stroke();
        c.fillStyle = `rgba(255,255,255,${0.15 + 0.3 * k})`; c.beginPath(); c.arc(g.x, g.y, g.r * k, 0, TAU); c.fill();
      } else {
        const gr = c.createRadialGradient(g.x, g.y, 2, g.x, g.y, g.r);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.6, 'rgba(127,227,240,.9)'); gr.addColorStop(1, 'rgba(127,227,240,.2)');
        c.fillStyle = gr; c.beginPath(); c.arc(g.x, g.y, g.r * (0.9 + Math.sin(time * 30) * 0.08), 0, TAU); c.fill();
      }
    }
    for (const j of this.jets) {
      const nx = Math.cos(j.a) * (R - 12), ny = Math.sin(j.a) * (R - 12);
      if (j.warn > 0) {
        const k = 1 - j.warn / j.max;
        c.strokeStyle = `rgba(255,77,94,${0.35 + 0.5 * k})`; c.lineWidth = 2 + 6 * k; c.setLineDash([10, 8]); c.lineDashOffset = -time * 60;
        c.beginPath(); c.moveTo(j.x1, j.y1); c.lineTo(j.x2, j.y2); c.stroke(); c.setLineDash([]);
        c.fillStyle = `rgba(255,77,94,${0.5 + 0.5 * Math.sin(time * 25)})`; c.beginPath(); c.arc(nx, ny, 10, 0, TAU); c.fill();
      } else {
        c.lineCap = 'round';
        c.strokeStyle = 'rgba(127,227,240,.85)'; c.lineWidth = 22; c.beginPath(); c.moveTo(j.x1, j.y1); c.lineTo(j.x2, j.y2); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.moveTo(j.x1, j.y1); c.lineTo(j.x2, j.y2); c.stroke();
        c.lineCap = 'butt';
      }
    }
    if (this.unlocked.has('beam') && this.beam.phase !== 'off') {
      const B = this.beam;
      for (let i = 0; i < B.arms; i++) {
        const a = B.a + (i / B.arms) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        if (B.phase === 'warm') {
          c.strokeStyle = `rgba(255,200,69,${0.4 + 0.4 * Math.sin(time * 20)})`; c.lineWidth = 4; c.setLineDash([6, 8]);
          c.beginPath(); c.moveTo(ca * PILLAR, sa * PILLAR); c.lineTo(ca * R, sa * R); c.stroke(); c.setLineDash([]);
        } else {
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(127,227,240,.8)'; c.lineWidth = 20; c.beginPath(); c.moveTo(ca * PILLAR, sa * PILLAR); c.lineTo(ca * (R - 6), sa * (R - 6)); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 7; c.beginPath(); c.moveTo(ca * PILLAR, sa * PILLAR); c.lineTo(ca * (R - 6), sa * (R - 6)); c.stroke();
          c.lineCap = 'butt';
          if (!REDUCED && Math.random() < 0.5) this.part(ca * (R - 10), sa * (R - 10), (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, 0.4, '#fff', 2.5);
        }
      }
    }
    for (const b of this.bots) {
      for (const ring of b.rings) { c.strokeStyle = `rgba(255,255,255,${1 - ring.r / 95})`; c.lineWidth = 8; c.beginPath(); c.arc(b.x, b.y, ring.r, 0, TAU); c.stroke(); c.strokeStyle = `rgba(127,227,240,${1 - ring.r / 95})`; c.lineWidth = 3; c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(b.x + 3, b.y + 6, 22, 12, 0, 0, TAU); c.fill();
      c.fillStyle = b.glow > 0 ? (Math.sin(time * 30) > 0 ? COL.danger : COL.sun) : COL.sun;
      c.beginPath(); c.arc(b.x, b.y, 20, 0, TAU); c.fill();
      c.strokeStyle = COL.deep; c.lineWidth = 2.5; c.stroke();
      c.fillStyle = COL.blue; c.beginPath(); c.arc(b.x, b.y, 11, 0, TAU); c.fill();
      c.fillStyle = 'rgba(200,245,255,.95)'; c.beginPath(); c.arc(b.x, b.y, 6 + Math.sin(time * 12) * 1.5, 0, TAU); c.fill();
    }
    if (this.unlocked.has('sprinkler')) for (const s2 of this.spr) {
      if (s2.phase === 'warn') { const x = Math.cos(s2.a) * (R - 8), y = Math.sin(s2.a) * (R - 8); c.strokeStyle = `rgba(255,77,94,${0.5 + 0.5 * Math.sin(time * 25)})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 15, 0, TAU); c.stroke(); }
    }
    c.fillStyle = 'rgba(200,245,255,.95)';
    for (const q of this.pellets) { c.beginPath(); c.arc(q.x, q.y, 4.5, 0, TAU); c.fill(); }
    for (const w of this.waves) {
      const a0 = w.gap + w.gapW / 2, a1 = w.gap - w.gapW / 2 + TAU;
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(127,227,240,.75)'; c.lineWidth = 18; c.beginPath(); c.arc(0, 0, w.r, a0, a1); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, w.r, a0, a1); c.stroke();
      c.lineCap = 'butt';
    }

    // ripples + particles
    for (const r of this.ripples) { c.strokeStyle = `rgba(255,255,255,${r.life})`; c.lineWidth = 2; c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke(); }
    for (const q of this.parts) { c.globalAlpha = Math.max(0, q.life / q.max); c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y, q.size, 0, TAU); c.fill(); }
    c.globalAlpha = 1;

    // player
    if (this.state !== 'idle') this.drawPlayer(c, time);

    // score pops (world)
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 18px "Barlow Condensed", sans-serif';
    for (const p of this.pops) { c.globalAlpha = Math.min(1, p.life * 2); c.lineWidth = 4; c.strokeStyle = 'rgba(0,40,80,.8)'; c.strokeText(p.text, p.x, p.y); c.fillStyle = p.col; c.fillText(p.text, p.x, p.y); }
    c.globalAlpha = 1;

    this.drawHud(c, time);
  }

  drawPlayer(c, time) {
    const p = this.p, flick = this.inv > 0 && this.state === 'playing' && Math.sin(time * 40) > 0;
    if (this.dashT > 0) for (let i = 1; i <= 3; i++) { c.globalAlpha = 0.18 * (4 - i); c.fillStyle = COL.water; c.beginPath(); c.arc(p.x - p.vx * 0.012 * i, p.y - p.vy * 0.012 * i - 12, PR, 0, TAU); c.fill(); }
    c.globalAlpha = flick ? 0.35 : 1;
    const mood = this.inv > 0.8 && this.hits ? 'hurt' : this.dashT > 0 ? 'dash' : this.joyT > 0 ? 'joy' : this.danger() ? 'worried' : 'happy';
    const moving = Math.hypot(p.vx, p.vy) / SPEED;
    drawSpritz(c, p.x, p.y + 6, PR * 1.3, { t: time, mood, look: p.face, squash: Math.sin(time * 16) * moving * 0.5, blink: Math.sin(time * 1.3) > 0.985 });
    c.globalAlpha = 1;
    if (this.shield) { c.strokeStyle = `rgba(0,193,213,${0.6 + 0.3 * Math.sin(time * 6)})`; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - 12, PR + 12, 0, TAU); c.stroke(); c.fillStyle = 'rgba(0,193,213,.12)'; c.fill(); }
    if (this.magnet > 0) { c.strokeStyle = 'rgba(255,200,69,.5)'; c.lineWidth = 1.5; c.setLineDash([4, 6]); c.beginPath(); c.arc(p.x, p.y, 40 + (time * 40) % 30, 0, TAU); c.stroke(); c.setLineDash([]); }
    // dash cooldown ring at the feet
    if (this.state === 'playing') {
      const k = 1 - this.dashCd / 2.2;
      c.strokeStyle = k >= 1 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)'; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(p.x, p.y + 6, PR + 6, (PR + 6) * 0.38, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
    }
  }

  icon(c, kind, x, y, s) {
    c.save(); c.translate(x, y); c.lineWidth = 2.2; c.lineCap = 'round';
    if (kind === 'shield') { c.strokeStyle = COL.aqua; c.fillStyle = 'rgba(0,193,213,.3)'; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(-s * 0.35, -s * 0.35, s * 0.25, 0, TAU); c.fill(); }
    else if (kind === 'slow') { c.strokeStyle = '#2f8a3a'; c.beginPath(); c.arc(0, 0, s, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.7); c.moveTo(0, 0); c.lineTo(s * 0.5, s * 0.2); c.stroke(); }
    else if (kind === 'magnet') { c.strokeStyle = '#c0392b'; c.lineWidth = 4; c.beginPath(); c.arc(0, -s * 0.1, s * 0.7, Math.PI, 0, true); c.stroke(); c.strokeStyle = '#ccc'; c.beginPath(); c.moveTo(-s * 0.7, -s * 0.1); c.lineTo(-s * 0.7, -s * 0.6); c.moveTo(s * 0.7, -s * 0.1); c.lineTo(s * 0.7, -s * 0.6); c.stroke(); }
    else if (kind === 'heart') { c.fillStyle = COL.coral; c.beginPath(); c.moveTo(0, s * 0.8); c.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.5, -s * 1.1, 0, -s * 0.35); c.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.4, -s * 0.2, 0, s * 0.8); c.fill(); }
    c.restore();
  }

  drawHud(c, time) {
    const d = this.dpr;
    c.setTransform(d, 0, 0, d, 0, 0);
    // brand plate (bottom-left)
    if (this.logo.complete && this.logo.naturalWidth) {
      const lw = Math.min(150, this.w * 0.26), lh = lw * this.logo.naturalHeight / this.logo.naturalWidth;
      c.fillStyle = 'rgba(255,255,255,.88)'; this.round(c, 10, this.h - lh - 22, lw + 16, lh + 12, 10); c.fill();
      c.drawImage(this.logo, 18, this.h - lh - 16, lw, lh);
    }
    if (this.state === 'idle') return;
    c.textBaseline = 'top'; c.textAlign = 'left';
    // score + time
    c.fillStyle = 'rgba(0,40,80,.55)'; this.round(c, 10, 10, 168, 84, 14); c.fill();
    c.fillStyle = '#fff'; c.font = '700 36px "Barlow Condensed", sans-serif'; c.fillText(this.score.toLocaleString(), 22, 12);
    c.font = '600 17px "Barlow Condensed", sans-serif'; c.fillStyle = '#CFF6FF';
    c.fillText(`⏱ ${this.t.toFixed(1)}s   💧 ${this.drops}`, 22, 52);
    // hearts
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = i < this.hp ? 1 : 0.25;
      const hx = 26 + i * 26, hy = 80;
      c.fillStyle = COL.water; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(hx, hy - 10); c.quadraticCurveTo(hx + 9, hy + 1, hx, hy + 6); c.quadraticCurveTo(hx - 9, hy + 1, hx, hy - 10); c.fill(); c.stroke();
    }
    c.globalAlpha = 1;
    if (this.combo > 1) { c.font = '700 22px "Barlow Condensed", sans-serif'; c.fillStyle = COL.sun; c.fillText(`COMBO x${this.combo}`, 110, 70); }
    // active power-ups
    let py = 104;
    const chips = [];
    if (this.shield) chips.push(['shield', 'Shield', null]);
    if (this.slow > 0) chips.push(['slow', 'Slow-mo', this.slow]);
    if (this.magnet > 0) chips.push(['magnet', 'Magnet', this.magnet]);
    if (this.inUmbrella() && this.state === 'playing') chips.push(['shield', 'Under umbrella', null]);
    for (const [k, label, left] of chips) {
      c.fillStyle = 'rgba(0,40,80,.55)'; this.round(c, 10, py, 168, 28, 10); c.fill();
      this.icon(c, k, 26, py + 14, 8);
      c.fillStyle = '#fff'; c.font = '600 17px "Barlow Condensed", sans-serif'; c.fillText(label + (left ? ` ${left.toFixed(1)}s` : ''), 42, py + 5);
      py += 32;
    }
    // banner
    if (this.banner) {
      const a = Math.min(1, this.banner.life * 2, (3.2 - this.banner.life) * 4);
      c.globalAlpha = a; c.font = '700 22px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
      const tw = Math.min(this.w - 40, c.measureText(this.banner.text).width + 30);
      const by = this.h > this.w ? 100 : 14;
      c.fillStyle = 'rgba(255,200,69,.95)'; this.round(c, this.w / 2 - tw / 2, by, tw, 36, 18); c.fill();
      c.fillStyle = COL.ink; c.fillText(this.banner.text, this.w / 2, by + 7, this.w - 60);
      c.globalAlpha = 1;
    }
    // countdown
    if (this.state === 'countdown') {
      const n = Math.ceil(this.countdown);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 110px "Zilla Slab", Georgia, serif';
      const k = this.countdown - Math.floor(this.countdown);
      c.globalAlpha = 0.4 + 0.6 * k;
      c.lineWidth = 8; c.strokeStyle = COL.deep; c.strokeText(n > 0 ? String(n) : 'GO!', this.w / 2, this.h / 2 - 40);
      c.fillStyle = '#fff'; c.fillText(n > 0 ? String(n) : 'GO!', this.w / 2, this.h / 2 - 40);
      c.globalAlpha = 1; c.font = '700 22px "Barlow Condensed", sans-serif';
      c.lineWidth = 5; const tip = 'Dodge the water • grab golden drops • DASH to escape';
      c.strokeText(tip, this.w / 2, this.h / 2 + 40, this.w - 30); c.fillText(tip, this.w / 2, this.h / 2 + 40, this.w - 30);
    }
    // touch joystick
    if (this.stick && this.stick.ox != null) {
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(this.stick.ox, this.stick.oy, 50, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.arc(this.stick.ox + this.stick.x * 50, this.stick.oy + this.stick.y * 50, 22, 0, TAU); c.fill();
    }
  }
  round(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
}
