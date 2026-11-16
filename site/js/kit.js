// Component kit: living-blueprint water-system parts (pipes, valves, pumps, gauges, tanks, dials, buttons).
// Every part has `life` 0..1 — 0 draws pale blueprint linework, 1 full colour. Restoring = animating life to 1.
import { C, FONT, rr, text, clamp, lerp, dist, inRect } from './engine.js';

function living(ctx, life, colored, outline) {
  if (life < 1) { ctx.save(); ctx.globalAlpha *= (1 - life) * 0.9; ctx.setLineDash([6, 5]); ctx.strokeStyle = C.line; ctx.fillStyle = 'rgba(164,183,215,.06)'; ctx.lineWidth = 2; outline(); ctx.restore(); }
  if (life > 0) { ctx.save(); ctx.globalAlpha *= life; colored(); ctx.restore(); }
}
const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);

export class Part {
  constructor(o) { Object.assign(this, { life: 0, lifeTarget: 0 }, o); }
  restore(on = true) { this.lifeTarget = on ? 1 : 0; }
  tick(dt) { this.life = approach(this.life, this.lifeTarget, 3, dt); if (Math.abs(this.life - this.lifeTarget) < 0.01) this.life = this.lifeTarget; }
}

// ------------------------------------------------------------ Pipe with flowing water
export class Pipe extends Part {
  constructor(o) { super({ w: 14, flow: 0, fill: 0, dirty: 0, offset: 0, ...o }); }
  update(dt) { this.tick(dt); this.offset += dt * 90 * this.flow; }
  path(ctx) { ctx.beginPath(); this.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); }
  draw(ctx) {
    const w = this.w;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    living(ctx, this.life, () => {
      this.path(ctx); ctx.strokeStyle = C.steelDark; ctx.lineWidth = w + 6; ctx.stroke();
      this.path(ctx); ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = w; ctx.stroke();
      if (this.fill > 0.01) {
        const wc = this.dirty > 0.3 ? `rgba(${Math.round(lerp(56, 140, this.dirty))},${Math.round(lerp(182, 110, this.dirty))},${Math.round(lerp(232, 60, this.dirty))},` : 'rgba(56,182,232,';
        this.path(ctx); ctx.strokeStyle = wc + (0.35 + 0.65 * this.fill) + ')'; ctx.lineWidth = w - 4; ctx.stroke();
        if (this.flow > 0.02) {
          ctx.setLineDash([10, 16]); ctx.lineDashOffset = -this.offset;
          this.path(ctx); ctx.strokeStyle = `rgba(210,245,255,${0.35 + 0.5 * this.flow})`; ctx.lineWidth = Math.max(2, (w - 8) * 0.5); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }, () => {
      ctx.setLineDash([]); this.path(ctx); ctx.strokeStyle = 'rgba(164,183,215,.5)'; ctx.lineWidth = w + 2; ctx.stroke();
      this.path(ctx); ctx.strokeStyle = C.bp; ctx.lineWidth = w - 2; ctx.stroke();
      ctx.setLineDash([8, 6]); this.path(ctx); ctx.strokeStyle = 'rgba(164,183,215,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }
}

// ------------------------------------------------------------ Valve (tap to toggle; optional hold-to-close)
export class Valve extends Part {
  constructor(o) { super({ r: 20, open: false, anim: 0, label: '', hint: false, ...o }); }
  hit(x, y) { return dist(x, y, this.x, this.y) < this.r + 16; }
  update(dt) { this.tick(dt); this.anim = approach(this.anim, this.open ? 1 : 0, 9, dt); }
  draw(ctx, t) {
    const { x, y, r } = this;
    living(ctx, this.life, () => {
      ctx.fillStyle = '#3d4a57'; rr(ctx, x - r * 0.9, y - r * 0.55, r * 1.8, r * 1.1, 5); ctx.fill();          // body
      ctx.fillStyle = '#566473'; ctx.fillRect(x - r * 0.2, y - r * 1.25, r * 0.4, r * 0.75);                // stem
      ctx.save(); ctx.translate(x, y - r * 1.35); ctx.rotate(this.anim * Math.PI * 1.5);
      ctx.strokeStyle = this.open ? '#2bb673' : '#d33a2c'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = this.open ? C.green : C.red; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }, () => { ctx.strokeRect(x - r * 0.9, y - r * 0.55, r * 1.8, r * 1.1); ctx.beginPath(); ctx.arc(x, y - r * 1.35, r * 0.7, 0, Math.PI * 2); ctx.stroke(); });
    if (this.hint) pulseRing(ctx, x, y - r * 0.6, r + 18, t);
    if (this.label) text(ctx, this.label, x, y + r + 16, { size: 13, weight: 700, color: C.blue30, align: 'center' });
    if (this.closing > 0) { ctx.strokeStyle = C.amber; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y - r * 0.6, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.closing); ctx.stroke(); }
  }
}

// ------------------------------------------------------------ Pump (cutaway with spinning impeller)
export class Pump extends Part {
  constructor(o) { super({ r: 34, on: false, speed: 0, target: 0, angle: 0, label: '', heat: 0, hint: false, ...o }); }
  hit(x, y) { return dist(x, y, this.x, this.y) < this.r + 18 || inRect(x, y, { x: this.x - this.r * 2.6, y: this.y - this.r * 0.7, w: this.r * 1.8, h: this.r * 1.4 }); }
  update(dt) {
    this.tick(dt);
    const goal = this.on ? (this.target || 1) : 0;
    this.speed = approach(this.speed, goal, 2.2, dt);
    this.angle += this.speed * dt * 18;
  }
  draw(ctx, t) {
    const { x, y, r } = this;
    living(ctx, this.life, () => {
      // motor
      const mx = x - r * 2.5, mw = r * 1.7, mh = r * 1.2;
      ctx.fillStyle = C.blue; rr(ctx, mx, y - mh / 2, mw, mh, 8); ctx.fill();
      ctx.fillStyle = C.deep; for (let i = 0; i < 5; i++) ctx.fillRect(mx + 6 + i * (mw - 12) / 5, y - mh / 2 + 4, 4, mh - 8);
      ctx.fillStyle = '#7d8790'; ctx.fillRect(mx + mw, y - 6, r * 0.8, 12);
      // volute
      ctx.fillStyle = '#c63b2f'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2833'; ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.angle);
      ctx.strokeStyle = this.speed > 0.05 ? C.waterHi : '#7d8790'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(r * 0.4, r * 0.15, r * 0.62, -r * 0.05); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      // status lamp
      ctx.fillStyle = this.on ? (this.heat > 0.6 ? C.red : C.green) : '#55606a';
      ctx.beginPath(); ctx.arc(mx + 12, y - mh / 2 - 8, 6, 0, Math.PI * 2); ctx.fill();
      if (this.heat > 0.05) {
        ctx.fillStyle = `rgba(255,90,60,${this.heat * 0.5})`; ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 3; i++) { const ph = (t * 1.2 + i / 3) % 1; ctx.fillStyle = `rgba(230,230,230,${(1 - ph) * this.heat})`; ctx.beginPath(); ctx.arc(x - 10 + i * 10, y - r - ph * 30, 5 + ph * 6, 0, Math.PI * 2); ctx.fill(); }
      }
    }, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(x - r * 2.5, y - r * 0.6, r * 1.7, r * 1.2); });
    if (this.hint) pulseRing(ctx, x - r * 0.8, y, r * 2, t);
    if (this.label) text(ctx, this.label, x - r * 0.8, y + r + 18, { size: 13, color: C.blue30, align: 'center' });
  }
}

// ------------------------------------------------------------ Pressure gauge instrument
export class Meter extends Part {
  constructor(o) { super({ r: 52, value: 0, shown: 0, min: 0, max: 100, bands: [], unit: 'PSI', label: '', ...o }); }
  update(dt) { this.tick(dt); this.shown = approach(this.shown, this.value, 8, dt); }
  angle(v) { return Math.PI * 0.75 + clamp((v - this.min) / (this.max - this.min), 0, 1) * Math.PI * 1.5; }
  draw(ctx, t) {
    const { x, y, r } = this;
    living(ctx, this.life, () => {
      ctx.fillStyle = '#b8902f'; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fbf8ef'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      for (const [a, b, col] of this.bands) {
        ctx.strokeStyle = col; ctx.lineWidth = r * 0.16;
        ctx.beginPath(); ctx.arc(x, y, r * 0.8, this.angle(a), this.angle(b)); ctx.stroke();
      }
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      for (let i = 0; i <= 10; i++) { const a = this.angle(this.min + i * (this.max - this.min) / 10); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); ctx.stroke(); }
      const wob = this.wobble ? Math.sin(t * 40) * 0.03 * this.wobble : 0;
      const a = this.angle(this.shown) + wob;
      ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * r * 0.15, y - Math.sin(a) * r * 0.15); ctx.lineTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      text(ctx, `${Math.round(this.shown)}`, x, y + r * 0.5, { size: r * 0.36, color: C.deep, align: 'center' });
      text(ctx, this.unit, x, y + r * 0.78, { size: r * 0.2, weight: 600, color: '#667', align: 'center' });
    }, () => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); });
    if (this.label) text(ctx, this.label, x, y - r - 12, { size: 14, color: C.blue30, align: 'center' });
  }
}

// ------------------------------------------------------------ Tank (ground / corrugated / tower)
export class Tank extends Part {
  constructor(o) { super({ level: 0, band: null, label: '', style: 'ground', dirty: 0, slosh: 0, ...o }); }
  update(dt) { this.tick(dt); this.slosh += dt; }
  draw(ctx, t) {
    const { x, y, w, h } = this;
    living(ctx, this.life, () => {
      if (this.style === 'tower') {
        // legs
        ctx.strokeStyle = '#8a96a3'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + h); ctx.lineTo(x + w * 0.05, this.legBottom); ctx.moveTo(x + w * 0.8, y + h); ctx.lineTo(x + w * 0.95, this.legBottom);
        ctx.moveTo(x + w * 0.5, y + h); ctx.lineTo(x + w * 0.5, this.legBottom); ctx.stroke();
        ctx.lineWidth = 2; for (let k = 1; k < 4; k++) { const yy = y + h + (this.legBottom - y - h) * k / 4; ctx.beginPath(); ctx.moveTo(x + w * 0.1, yy); ctx.lineTo(x + w * 0.9, yy); ctx.stroke(); }
      }
      const body = () => (this.style === 'tower' ? (ctx.beginPath(), ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)) : rr(ctx, x, y, w, h, this.style === 'corrugated' ? 6 : 10));
      body(); ctx.fillStyle = this.style === 'corrugated' ? '#c4ccd4' : this.style === 'tower' ? '#e9eef2' : '#d8cbb0'; ctx.fill();
      ctx.save(); body(); ctx.clip();
      // water
      const wl = y + h * (1 - clamp(this.level, 0, 1.02));
      const col = this.dirty > 0.05 ? `rgba(${Math.round(lerp(56, 130, this.dirty))},${Math.round(lerp(170, 120, this.dirty))},${Math.round(lerp(225, 70, this.dirty))},.85)` : 'rgba(56,170,225,.85)';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x, y + h);
      for (let i = 0; i <= 20; i++) { const xx = x + w * i / 20; ctx.lineTo(xx, wl + Math.sin(this.slosh * 3 + i * 0.7) * 2.5); }
      ctx.lineTo(x + w, y + h); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, wl, w, 3);
      if (this.style === 'corrugated') { ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; for (let xx = x + 6; xx < x + w; xx += 9) { ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke(); } }
      ctx.restore();
      body(); ctx.strokeStyle = '#5b6773'; ctx.lineWidth = 3; ctx.stroke();
      // band + overflow line
      if (this.band) {
        const y1 = y + h * (1 - this.band[1]), y0 = y + h * (1 - this.band[0]);
        ctx.fillStyle = 'rgba(61,220,132,.22)'; ctx.fillRect(x + w + 6, y1, 12, y0 - y1);
        ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.strokeRect(x + w + 6, y1, 12, y0 - y1);
      }
      // level ruler
      ctx.fillStyle = '#1d2833'; ctx.fillRect(x + w + 24, y, 6, h);
      ctx.fillStyle = C.aqua; ctx.fillRect(x + w + 24, y + h * (1 - clamp(this.level, 0, 1)), 6, h * clamp(this.level, 0, 1));
      text(ctx, `${Math.round(clamp(this.level, 0, 1.2) * 100)}%`, x + w + 34, y + h * (1 - clamp(this.level, 0, 1)) + 5, { size: 14, color: '#fff' });
    }, () => { if (this.style === 'tower') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); } else ctx.strokeRect(x, y, w, h); });
    if (this.label) text(ctx, this.label, x + w / 2, y - 10, { size: 14, color: C.blue30, align: 'center' });
  }
}

// ------------------------------------------------------------ Vertical slider (VFD speed etc.)
export class Slider extends Part {
  constructor(o) { super({ value: 0, label: 'VFD', drag: false, hint: false, ...o }); }
  hit(x, y) { return inRect(x, y, { x: this.x - 26, y: this.y - 14, w: this.w + 52, h: this.h + 28 }); }
  setFromY(py) { this.value = clamp(1 - (py - this.y) / this.h, 0, 1); }
  update(dt) { this.tick(dt); }
  draw(ctx, t) {
    const { x, y, w, h } = this;
    living(ctx, this.life, () => {
      ctx.fillStyle = '#1d2833'; rr(ctx, x - 14, y - 20, w + 28, h + 52, 10); ctx.fill();
      const g = ctx.createLinearGradient(0, y + h, 0, y);
      g.addColorStop(0, '#2bb673'); g.addColorStop(0.7, C.amber); g.addColorStop(1, C.red);
      ctx.fillStyle = '#33424f'; rr(ctx, x, y, w, h, w / 2); ctx.fill();
      ctx.fillStyle = g; rr(ctx, x, y + h * (1 - this.value), w, h * this.value, w / 2); ctx.fill();
      const ky = y + h * (1 - this.value);
      ctx.fillStyle = '#fff'; rr(ctx, x - 10, ky - 9, w + 20, 18, 6); ctx.fill();
      ctx.fillStyle = C.blue; ctx.fillRect(x - 4, ky - 2, w + 8, 4);
      text(ctx, `${Math.round(this.value * 60)} Hz`, x + w / 2, y + h + 24, { size: 14, color: '#fff', align: 'center' });
    }, () => ctx.strokeRect(x, y, w, h));
    if (this.hint) pulseRing(ctx, x + w / 2, y + h * (1 - this.value), 30, t);
    if (this.label) text(ctx, this.label, x + w / 2, y - 28, { size: 14, color: C.blue30, align: 'center' });
  }
}

// ------------------------------------------------------------ Button (tap or hold)
export class Btn extends Part {
  constructor(o) { super({ life: 1, lifeTarget: 1, color: C.blue, held: false, on: false, hint: false, sub: '', ...o }); }
  hit(x, y) { return inRect(x, y, { x: this.x - 6, y: this.y - 6, w: this.w + 12, h: this.h + 12 }); }
  update(dt) { this.tick(dt); }
  draw(ctx, t) {
    const { x, y, w, h } = this;
    const press = this.held ? 3 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, x, y + 4, w, h, 10); ctx.fill();
    ctx.fillStyle = this.disabled ? '#55606a' : (this.on ? (this.onColor || C.green) : this.color); rr(ctx, x, y + press, w, h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; rr(ctx, x + 1, y + press + 1, w - 2, h - 2, 9); ctx.stroke();
    text(ctx, this.label, x + w / 2, y + press + h / 2 + (this.sub ? -2 : 6), { size: 18, color: '#fff', align: 'center' });
    if (this.sub) text(ctx, this.sub, x + w / 2, y + press + h / 2 + 15, { size: 12, weight: 600, color: 'rgba(255,255,255,.8)', align: 'center' });
    if (this.hint) pulseRing(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.65, t);
  }
}

export function pulseRing(ctx, x, y, r, t) {
  const p = (t * 1.4) % 1;
  ctx.strokeStyle = `rgba(0,193,213,${1 - p})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, r * (0.8 + p * 0.5), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.aqua; ctx.beginPath(); ctx.moveTo(x, y - r - 18 - Math.sin(t * 6) * 4); ctx.lineTo(x - 8, y - r - 30 - Math.sin(t * 6) * 4); ctx.lineTo(x + 8, y - r - 30 - Math.sin(t * 6) * 4); ctx.fill();
}

// Sprinkler spray fan
export function spray(ctx, x, y, power, t, { reach = 60, color = 'rgba(160,225,250,', spread = 1 } = {}) {
  if (power <= 0.02) return;
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = -3; i <= 3; i++) {
    const a = -Math.PI / 2 + i * 0.32 * spread + Math.sin(t * 5 + i) * 0.05;
    const R = reach * power * (0.8 + 0.2 * Math.sin(t * 9 + i * 2));
    ctx.strokeStyle = color + (0.25 + 0.5 * power) + ')';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.9, x + Math.cos(a) * R, y + Math.sin(a) * R * 0.35 + R * 0.25); ctx.stroke();
  }
}

// Panel card (HMI-style box)
export function panel(ctx, x, y, w, h, title, life = 1) {
  ctx.save(); ctx.globalAlpha *= 0.4 + 0.6 * life;
  ctx.fillStyle = 'rgba(6,24,44,.78)'; rr(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(164,183,215,.35)'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, h, 12); ctx.stroke();
  if (title) text(ctx, title, x + 12, y + 20, { size: 14, color: C.blue30 });
  ctx.restore();
}
