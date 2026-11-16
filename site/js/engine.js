// Drip Dash: Bring Back the Flow — core engine (stage, loop, input, scenes, drawing helpers).
export const W = 960, H = 540;
export const C = {
  blue: '#005695', blue60: '#5D85B7', blue30: '#A4B7D7', black: '#040707', aqua: '#00C1D5', deep: '#003a66',
  bp: '#0b2a4a', bp2: '#06203a', line: 'rgba(164,183,215,.55)', grid: 'rgba(164,183,215,.07)',
  water: '#38b6e8', waterHi: '#9fe3f0', green: '#3ddc84', amber: '#ffbe3d', red: '#ff5a4f', brass: '#c9a24a',
  steel: '#8a96a3', steelDark: '#4d5965', panel: '#dfe6ec', text: '#eef6ff',
};
export const FONT = { ui: '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif', display: '"Zilla Slab", Georgia, serif' };

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const rand = (a, b) => a + Math.random() * (b - a);
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
export function mixColor(a, b, t) {
  const pa = hex(a), pb = hex(b);
  return `rgb(${Math.round(lerp(pa[0], pb[0], t))},${Math.round(lerp(pa[1], pb[1], t))},${Math.round(lerp(pa[2], pb[2], t))})`;
}
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function text(ctx, s, x, y, { size = 18, weight = 700, color = C.text, align = 'left', base = 'alphabetic', font = FONT.ui, stroke = null, sw = 4, maxW } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke) { ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y, maxW); }
  ctx.fillStyle = color; ctx.fillText(s, x, y, maxW);
}
export function wrap(ctx, s, maxW, size = 18, weight = 600, font = FONT.ui) {
  ctx.font = `${weight} ${size}px ${font}`;
  const words = s.split(' '), lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Blueprint backdrop
export function blueprint(ctx, t = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bp); g.addColorStop(1, C.bp2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 24) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 24) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
}

// ------------------------------------------------------------ particles
export class Particles {
  constructor() { this.list = []; }
  burst(x, y, n, { color = 'rgba(120,210,245,', speed = 220, up = 0.6, life = 0.7, size = 3.5, g = 600 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 2 * up;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, r: size * (0.5 + Math.random()), c: color, g });
    }
  }
  update(dt) {
    for (const p of this.list) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; }
    this.list = this.list.filter((p) => p.life > 0);
  }
  draw(ctx) {
    for (const p of this.list) {
      ctx.fillStyle = p.c + clamp(p.life / p.max, 0, 1).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Floating score/labels
export class Floaters {
  constructor() { this.list = []; }
  add(x, y, s, color = '#fff', size = 20) { this.list.push({ x, y, s, color, size, life: 1.1 }); }
  update(dt) { for (const f of this.list) { f.life -= dt; f.y -= 34 * dt; } this.list = this.list.filter((f) => f.life > 0); }
  draw(ctx) {
    for (const f of this.list) {
      ctx.globalAlpha = clamp(f.life * 2, 0, 1);
      text(ctx, f.s, f.x, f.y, { size: f.size, color: f.color, align: 'center', stroke: 'rgba(0,30,60,.8)' });
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------ Stage: canvas scaling + loop + input
export class Stage {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.scene = null; this.time = 0; this.last = 0;
    this.pointers = new Map();
    this.resize();
    addEventListener('resize', () => this.resize());
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - this.ox) / this.s, y: (e.clientY - r.top - this.oy) / this.s }; };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
      const p = pos(e); this.pointers.set(e.pointerId, p); this.onInput?.(); this.scene?.down?.(p.x, p.y, e.pointerId);
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e); this.hover = p;
      if (this.pointers.has(e.pointerId)) { this.pointers.set(e.pointerId, p); this.scene?.move?.(p.x, p.y, e.pointerId); }
      else this.scene?.hoverMove?.(p.x, p.y);
    });
    const up = (e) => { const p = pos(e); if (this.pointers.has(e.pointerId)) { this.pointers.delete(e.pointerId); this.scene?.up?.(p.x, p.y, e.pointerId); } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    requestAnimationFrame((t) => this.frame(t));
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    this.canvas.width = Math.round(cw * dpr); this.canvas.height = Math.round(ch * dpr);
    this.s = Math.min(cw / W, ch / H);
    this.ox = (cw - W * this.s) / 2; this.oy = (ch - H * this.s) / 2;
    this.dpr = dpr; this.cw = cw; this.ch = ch;
  }
  go(scene) { this.scene?.exit?.(); this.scene = scene; this.pointers.clear(); scene.enter?.(); }
  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.last) this.last = ts;
    const dt = Math.min(0.05, (ts - this.last) / 1000); this.last = ts;
    this.time += dt;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bp2; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = this.s * this.dpr;
    ctx.setTransform(k, 0, 0, k, this.ox * this.dpr, this.oy * this.dpr);
    if (this.scene) {
      if (!this.paused) this.scene.update?.(dt);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
      this.scene.draw?.(ctx, this.time);
      ctx.restore();
    }
  }
}

// ------------------------------------------------------------ Characters
// Drip — brand mascot. outfit: 'none' | 'hardhat' | 'vest' | 'aqua' | 'gold'
export function drawDrip(ctx, x, feetY, r, o = {}) {
  const t = o.t || 0, sx = o.sx || 1, sy = o.sy || 1, mood = o.mood || 'happy';
  const gold = o.outfit === 'gold', aqua = o.outfit === 'aqua';
  ctx.save();
  ctx.translate(x, feetY); ctx.rotate(o.tilt || 0); ctx.scale(sx * (o.flip ? -1 : 1), sy); ctx.translate(0, -1.06 * r);
  const k = r / 70;
  if (!o.noFeet) {
    const step = o.walk ? Math.sin(t * 14) : 0;
    ctx.fillStyle = gold ? '#a77b00' : '#00477c';
    ctx.beginPath(); ctx.ellipse(-26 * k + step * 8 * k, 74 * k - Math.max(0, step) * 6 * k, 18 * k, 9 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(28 * k - step * 8 * k, 74 * k - Math.max(0, -step) * 6 * k, 18 * k, 9 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, -134 * k);
  ctx.bezierCurveTo(-4 * k, -112 * k, -70 * k, -52 * k, -70 * k, 0);
  ctx.arc(0, 0, 70 * k, Math.PI, 0, true);
  ctx.bezierCurveTo(70 * k, -52 * k, 4 * k, -112 * k, 0, -134 * k);
  ctx.closePath();
  const g = ctx.createRadialGradient(-22 * k, 0, 4 * k, -10 * k, 10 * k, 95 * k);
  if (gold) { g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffc93a'); g.addColorStop(1, '#c98a00'); }
  else if (aqua) { g.addColorStop(0, '#d2fbff'); g.addColorStop(0.45, '#2fd3e3'); g.addColorStop(1, '#00909f'); }
  else { g.addColorStop(0, '#9FE3F0'); g.addColorStop(0.45, '#2F8FD0'); g.addColorStop(1, C.blue); }
  ctx.fillStyle = g; ctx.fill();
  const ink = gold ? '#7a5900' : C.deep;
  ctx.lineWidth = 5 * k; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -134 * k);
  ctx.bezierCurveTo(12 * k, -148 * k, 32 * k, -144 * k, 28 * k, -130 * k);
  ctx.bezierCurveTo(24 * k, -120 * k, 12 * k, -124 * k, 16 * k, -132 * k);
  ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 9 * k;
  ctx.beginPath(); ctx.moveTo(-38 * k, -40 * k); ctx.bezierCurveTo(-34 * k, -62 * k, -18 * k, -82 * k, -8 * k, -92 * k); ctx.stroke();
  // vest
  if (o.outfit === 'vest') {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 68 * k, 0.15, Math.PI - 0.15); ctx.lineTo(-60 * k, 20 * k); ctx.closePath(); ctx.clip();
    ctx.fillStyle = '#ff8a1f'; ctx.fillRect(-72 * k, 14 * k, 144 * k, 70 * k);
    ctx.fillStyle = '#e8ff5a'; ctx.fillRect(-72 * k, 38 * k, 144 * k, 9 * k);
    ctx.restore();
  }
  // eyes
  const blink = o.blink ? 0.12 : 1;
  for (const ex of [-18, 22]) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = ink; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.ellipse(ex * k, -2 * k, 15 * k, 19 * k * blink, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (blink > 0.5) {
      const lx = (o.lookX ?? 5), ly = (o.lookY ?? 2);
      ctx.fillStyle = C.black; ctx.beginPath(); ctx.arc((ex + lx) * k, ly * k, 8 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((ex + lx + 3) * k, (ly - 4) * k, 3 * k, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.strokeStyle = ink; ctx.lineWidth = 4 * k; ctx.beginPath();
  if (mood === 'worried') { ctx.moveTo(-32 * k, -20 * k); ctx.lineTo(-8 * k, -28 * k); ctx.moveTo(36 * k, -20 * k); ctx.lineTo(12 * k, -28 * k); }
  else { ctx.moveTo(-32 * k, -26 * k); ctx.lineTo(-8 * k, -20 * k); ctx.moveTo(36 * k, -26 * k); ctx.lineTo(12 * k, -20 * k); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,143,163,.7)';
  ctx.beginPath(); ctx.ellipse(-34 * k, 26 * k, 9 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(40 * k, 26 * k, 9 * k, 5 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ink;
  if (mood === 'worried') { ctx.beginPath(); ctx.moveTo(-10 * k, 40 * k); ctx.quadraticCurveTo(4 * k, 30 * k, 18 * k, 40 * k); ctx.lineWidth = 4 * k; ctx.stroke(); }
  else if (mood === 'wow') { ctx.beginPath(); ctx.ellipse(4 * k, 38 * k, 8 * k, 11 * k, 0, 0, Math.PI * 2); ctx.fill(); }
  else {
    ctx.beginPath(); ctx.moveTo(-14 * k, 30 * k); ctx.quadraticCurveTo(4 * k, 52 * k, 20 * k, 30 * k); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.moveTo(-5 * k, 39 * k); ctx.quadraticCurveTo(4 * k, 45 * k, 12 * k, 39 * k); ctx.closePath(); ctx.fill();
  }
  if (mood === 'worried') { ctx.fillStyle = '#bff0ff'; ctx.beginPath(); ctx.ellipse(52 * k, -40 * k, 6 * k, 9 * k, 0.3, 0, Math.PI * 2); ctx.fill(); }
  // hard hat
  if (o.outfit === 'hardhat') {
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#a07800'; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.ellipse(0, -96 * k, 44 * k, 30 * k, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    ctx.fillRect(-56 * k, -98 * k, 112 * k, 10 * k); ctx.strokeRect(-56 * k, -98 * k, 112 * k, 10 * k);
    ctx.fillStyle = C.blue; ctx.font = `700 ${16 * k}px ${FONT.ui}`; ctx.textAlign = 'center'; ctx.fillText('iC', 0, -106 * k);
  }
  ctx.restore();
}

// Gauge — the mentor: a brass-rimmed pressure gauge with a needle moustache
export function drawGauge(ctx, x, y, r, { t = 0, talking = false, mood = 'calm' } = {}) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#6b5420'; ctx.fillRect(-r * 0.18, r * 0.8, r * 0.36, r * 0.55);         // stem
  ctx.fillStyle = '#8a6d2b'; ctx.fillRect(-r * 0.3, r * 1.2, r * 0.6, r * 0.18);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  g.addColorStop(0, '#f6dc8a'); g.addColorStop(1, '#a67c20');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = r * 0.04;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * 0.75 + i * (Math.PI * 1.5 / 8);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74); ctx.stroke();
  }
  ctx.strokeStyle = C.red; ctx.lineWidth = r * 0.08;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.7, Math.PI * 0.12, Math.PI * 0.25); ctx.stroke();
  // eyes
  const blink = (Math.sin(t * 1.3) > 0.985) ? 0.15 : 1;
  for (const ex of [-0.25, 0.25]) {
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(ex * r, -r * 0.18, r * 0.07, r * 0.1 * blink, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#555'; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-r * 0.38, -r * 0.36 - (mood === 'stern' ? -r * 0.04 : 0)); ctx.lineTo(-r * 0.14, -r * 0.33); ctx.moveTo(r * 0.38, -r * 0.36 - (mood === 'stern' ? -r * 0.04 : 0)); ctx.lineTo(r * 0.14, -r * 0.33); ctx.stroke();
  // needle moustache
  const wig = talking ? Math.sin(t * 22) * 0.12 : Math.sin(t * 2) * 0.03;
  ctx.fillStyle = '#1d1d1d';
  for (const s of [-1, 1]) {
    ctx.save(); ctx.rotate(s * (0.18 + wig));
    ctx.beginPath(); ctx.moveTo(0, r * 0.06); ctx.quadraticCurveTo(s * r * 0.3, r * 0.02, s * r * 0.52, r * 0.16); ctx.quadraticCurveTo(s * r * 0.28, r * 0.14, 0, r * 0.14); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(0, r * 0.08, r * 0.08, 0, Math.PI * 2); ctx.fill();
  if (talking) { ctx.fillStyle = '#7a2a2a'; ctx.beginPath(); ctx.ellipse(0, r * 0.32, r * 0.1, r * 0.06 + Math.abs(Math.sin(t * 18)) * r * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// Speech: Gauge (bottom-left) with typewriter bubble
export class Dialog {
  constructor() { this.queue = []; this.cur = null; }
  // New lines replace the current one (instructions must never go stale); repeats are ignored.
  say(s, hold = 4.5) { if (this.cur && this.cur.s === s) return; if (this.recent === s && this.recentT > 0) return; this.queue = []; this.cur = { s, hold, t: 0 }; this.recent = s; this.recentT = 6; }
  now(s, hold = 4.5) { this.say(s, hold); }
  next() { this.cur = this.queue.shift() || null; }
  update(dt) { if (this.recentT > 0) this.recentT -= dt; if (!this.cur) return; this.cur.t += dt; if (this.cur.t > this.cur.hold + this.cur.s.length / 45) this.next(); }
  get talking() { return !!this.cur && this.cur.t < this.cur.s.length / 45; }
  draw(ctx, t, x = 18, y = 446) {
    const r = 30;
    drawGauge(ctx, x + r + 6, y + r + 14, r, { t, talking: this.talking });
    if (!this.cur) return;
    const n = Math.floor(this.cur.t * 45), s = this.cur.s.slice(0, n);
    const lines = wrap(ctx, this.cur.s, 430, 17, 600);
    const bw = 460, bh = 20 + lines.length * 21, bx = x + r * 2 + 22, by = y + r + 14 - bh / 2 - 4;
    ctx.fillStyle = 'rgba(255,255,255,.95)'; rr(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(bx, by + bh / 2 - 8); ctx.lineTo(bx - 12, by + bh / 2); ctx.lineTo(bx, by + bh / 2 + 8); ctx.fill();
    let rem = s.length, yy = by + 26;
    for (const ln of lines) {
      const part = ln.slice(0, Math.max(0, rem)); rem -= ln.length + 1;
      text(ctx, part, bx + 14, yy, { size: 17, weight: 600, color: C.deep });
      yy += 21;
    }
  }
}
