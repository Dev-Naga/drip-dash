// Valley map scene — Wellbrook comes back to life as systems are restored.
import { W, H, C, FONT, text, rr, clamp, dist, blueprint, drawDrip, drawGauge } from './engine.js';
import { progress } from './progress.js';

export const NODES = [
  { x: 110, y: 330, icon: 'tank' }, { x: 245, y: 215, icon: 'pump' }, { x: 395, y: 345, icon: 'field' },
  { x: 535, y: 205, icon: 'rain' }, { x: 670, y: 335, icon: 'tower' }, { x: 790, y: 205, icon: 'fountain' }, { x: 875, y: 385, icon: 'panel' },
];

export class MapScene {
  constructor(levels, { onSelect, outfit }) { this.levels = levels; this.onSelect = onSelect; this.outfit = outfit; this.flow = 0; this.hover = -1; }
  enter() {}
  update(dt) { this.flow += dt * 60; }
  current() { const i = this.levels.findIndex((l) => !progress.level(l.id).done); return i < 0 ? this.levels.length - 1 : i; }
  nodeAt(x, y) { return NODES.findIndex((n, i) => i < this.levels.length && dist(x, y, n.x, n.y) < 42); }
  down(x, y) {
    const i = this.nodeAt(x, y);
    if (i >= 0 && progress.unlocked(this.levels, i)) this.onSelect(this.levels[i], i);
  }
  hoverMove(x, y) { this.hover = this.nodeAt(x, y); }
  draw(ctx, t) {
    blueprint(ctx, t);
    // hills
    ctx.fillStyle = 'rgba(93,133,183,.10)';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 300 + Math.sin(x / 140) * 40 + Math.sin(x / 47) * 10);
    ctx.lineTo(W, H); ctx.fill();
    // restored blooms
    this.levels.forEach((l, i) => {
      if (!progress.level(l.id).done) return;
      const n = NODES[i], g = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, 130);
      g.addColorStop(0, 'rgba(61,220,132,.35)'); g.addColorStop(0.5, 'rgba(0,193,213,.15)'); g.addColorStop(1, 'rgba(0,193,213,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, 130, 0, Math.PI * 2); ctx.fill();
    });
    // pipeline path between nodes
    for (let i = 0; i < NODES.length - 1; i++) {
      const a = NODES[i], b = NODES[i + 1], live = i < this.levels.length && progress.level(this.levels[i].id).done;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (i % 2 ? -40 : 40);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
      if (live) {
        ctx.strokeStyle = C.steelDark; ctx.lineWidth = 14; ctx.stroke();
        ctx.strokeStyle = C.water; ctx.lineWidth = 8; ctx.stroke();
        ctx.setLineDash([8, 14]); ctx.lineDashOffset = -this.flow; ctx.strokeStyle = 'rgba(210,245,255,.8)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
      } else { ctx.setLineDash([6, 6]); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
    }
    // nodes
    const cur = this.current();
    NODES.forEach((n, i) => {
      const l = this.levels[i];
      const avail = l && progress.unlocked(this.levels, i), p = l ? progress.level(l.id) : null;
      const r = 36 + (this.hover === i && avail ? 4 : 0);
      if (avail && i === cur && !p.done) {
        const ph = (t * 1.2) % 1; ctx.strokeStyle = `rgba(0,193,213,${1 - ph})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 6 + ph * 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = p?.done ? '#fff' : avail ? 'rgba(255,255,255,.9)' : 'rgba(11,42,74,.9)';
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = p?.done ? C.green : avail ? C.aqua : C.line; ctx.lineWidth = 4; ctx.setLineDash(avail ? [] : [5, 5]); ctx.stroke(); ctx.setLineDash([]);
      icon(ctx, n.icon, n.x, n.y, p?.done || avail ? 1 : 0.35, t);
      if (!l) { text(ctx, 'Coming soon', n.x, n.y + r + 20, { size: 14, color: C.blue30, align: 'center' }); return; }
      text(ctx, `${l.num}. ${l.title}`, n.x, n.y + r + 22, { size: 16, color: avail ? '#fff' : C.blue30, align: 'center', stroke: 'rgba(6,32,58,.9)' });
      if (!avail) { ctx.fillStyle = C.blue30; rr(ctx, n.x - 8, n.y + r - 22, 16, 12, 2); ctx.fill(); ctx.strokeStyle = C.blue30; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(n.x, n.y + r - 22, 6, Math.PI, 0); ctx.stroke(); }
      for (let s = 0; s < 3; s++) star(ctx, n.x - 22 + s * 22, n.y - r - 10, 9, s < (p?.stars || 0));
    });
    // Drip at current node
    const dn = NODES[cur];
    drawDrip(ctx, dn.x - 52, dn.y + 26 + Math.sin(t * 3) * 2, 20, { t, outfit: progress.state.outfit, blink: Math.sin(t * 1.7) > 0.985 });
    // header
    ctx.fillStyle = 'rgba(4,18,34,.72)'; ctx.fillRect(0, 0, W, 56);
    text(ctx, 'Wellbrook Valley', 18, 38, { size: 30, font: FONT.display, color: '#fff' });
    text(ctx, `Valley Score ${progress.valleyScore().toLocaleString()}  ·  ★ ${progress.totalStars()}/21`, 290, 36, { size: 20, color: C.aqua });
    // Heartboard chips
    text(ctx, 'HEARTBOARD', 18, 86, { size: 13, color: C.blue30 });
    for (let i = 0; i < 6; i++) {
      const on = this.levels[i] && progress.level(this.levels[i].id).done;
      ctx.fillStyle = on ? C.aqua : 'rgba(164,183,215,.15)'; rr(ctx, 18 + i * 22, 94, 16, 20, 3); ctx.fill();
      if (on) { ctx.fillStyle = '#fff'; ctx.fillRect(22 + i * 22, 98, 8, 3); }
    }
    drawGauge(ctx, W - 54, H - 62, 26, { t });
  }
}

export function star(ctx, x, y, r, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = on ? '#ffd23f' : 'rgba(164,183,215,.25)'; ctx.fill();
  if (on) { ctx.strokeStyle = '#a77b00'; ctx.lineWidth = 1.5; ctx.stroke(); }
}

export function icon(ctx, kind, x, y, a = 1, t = 0) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y);
  ctx.lineWidth = 3; ctx.strokeStyle = C.deep; ctx.fillStyle = C.blue;
  switch (kind) {
    case 'tank': rr(ctx, -14, -16, 28, 32, 4); ctx.fill(); ctx.fillStyle = C.water; ctx.fillRect(-14, 0, 28, 16); break;
    case 'pump': ctx.fillStyle = '#c63b2f'; ctx.beginPath(); ctx.arc(6, 2, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.blue; rr(ctx, -20, -8, 16, 18, 3); ctx.fill(); break;
    case 'field': ctx.fillStyle = '#2f9e55'; rr(ctx, -20, -12, 40, 24, 4); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke(); break;
    case 'rain': ctx.fillStyle = '#7d8fa3'; ctx.beginPath(); ctx.arc(-6, -6, 10, 0, Math.PI * 2); ctx.arc(6, -8, 12, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.water; ctx.lineWidth = 2.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 8, 6); ctx.lineTo(i * 8 - 3, 16); ctx.stroke(); } break;
    case 'tower': ctx.fillStyle = '#c4ccd4'; ctx.beginPath(); ctx.ellipse(0, -8, 15, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7d8790'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-12, 18); ctx.moveTo(8, 0); ctx.lineTo(12, 18); ctx.stroke(); break;
    case 'fountain': ctx.fillStyle = '#c9b8a3'; rr(ctx, -18, 6, 36, 10, 3); ctx.fill(); ctx.strokeStyle = C.water; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 9, 6); ctx.quadraticCurveTo(i * 10, -18 - Math.sin(t * 3 + i) * 3, i * 16, -2); ctx.stroke(); } break;
    case 'panel': ctx.fillStyle = '#dfe6ec'; rr(ctx, -14, -18, 28, 36, 3); ctx.fill(); ctx.fillStyle = C.green; ctx.fillRect(-8, -10, 6, 6); ctx.fillStyle = C.amber; ctx.fillRect(2, -10, 6, 6); ctx.fillStyle = '#1d2833'; ctx.fillRect(-8, 2, 16, 9); break;
  }
  ctx.restore();
}
