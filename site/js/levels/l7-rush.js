// Level 7 — Evening Rush (finale): the rebuilt Heartboard runs every system at once.
// Teaches: SCADA/HMI supervision — one operator watching pumps, irrigation, harvesting and features together.
import { C, FONT, text, rr, clamp, rand, inRect, mixColor } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Slider, Btn, spray } from '../kit.js';
import { sfx } from '../audio.js';

const TILES = [
  { key: 'pump', title: 'PUMP STATION', x: 20, y: 60 },
  { key: 'field', title: 'SCHOOL FIELDS', x: 485, y: 60 },
  { key: 'rain', title: 'RAIN HARVEST', x: 20, y: 250 },
  { key: 'fountain', title: 'PLAZA FOUNTAIN', x: 485, y: 250 },
];
const TW = 455, TH = 180;

class EveningRush extends LevelBase {
  setup() {
    this.hideDrip = true;
    // pump tile
    this.vfd = this.add(new Slider({ x: 400, y: 92, w: 20, h: 110, label: '', value: 0.55, life: 1, lifeTarget: 1 }));
    this.p = 60; this.D = 3; this.nextD = 5;
    // field tile
    this.zones = [0, 1, 2].map((i) => ({ i, m: rand(0.55, 0.8), on: false, x: 505 + i * 140, y: 92 }));
    // rain tile
    this.divBtn = this.add(new Btn({ x: 330, y: 300, w: 120, h: 44, label: 'TO DRAIN', sub: 'diverter', color: '#8a5a2b' }));
    this.mode = 'drain'; this.tank = 0.6; this.tankDirty = 0; this.storm = null; this.nextStorm = 9;
    // fountain tile
    this.doseBtn = this.add(new Btn({ x: 815, y: 286, w: 110, h: 40, label: 'DOSE', color: '#7a4fbf' }));
    this.washBtn = this.add(new Btn({ x: 815, y: 336, w: 110, h: 40, label: 'BACKWASH', color: '#3d6f8f' }));
    this.clar = 0.8; this.filt = 0.2; this.lastDose = -9; this.overT = 0;
    this.health = { pump: 1, field: 1, rain: 1, fountain: 1 };
    this.hsum = 0; this.hn = 0; this.allGreen = 0; this.dragging = null; this.alerts = {};
    this.objective = 'Keep Wellbrook green for 90 seconds';
    this.say('The Heartboard is back! It\'s the Evening Rush. Every system is live. Keep all four tiles GREEN. You\'ve trained for this.', 6);
  }
  press(x, y, id) { if (this.vfd.hit(x, y)) { this.dragging = id; this.vfd.setFromY(y); } }
  drag(x, y, id) { if (this.dragging === id) this.vfd.setFromY(y); }
  release(x, y, id) { if (this.dragging === id) this.dragging = null; }
  tap(x, y) {
    if (this.dragging != null) return;
    for (const z of this.zones) if (inRect(x, y, { x: z.x, y: z.y, w: 120, h: 120 })) {
      if (!z.on && this.zones.filter((q) => q.on).length >= 2) { this.say('Only two zones at a time. Shut one off first.', 3); sfx.bad(); return; }
      z.on = !z.on; z.on ? sfx.valveOpen() : sfx.valveClose(); return;
    }
    if (this.divBtn.hit(x, y)) { this.mode = this.mode === 'drain' ? 'tank' : 'drain'; this.divBtn.label = this.mode === 'drain' ? 'TO DRAIN' : 'TO TANK'; this.divBtn.color = this.mode === 'drain' ? '#8a5a2b' : C.blue; sfx.valveOpen(); return; }
    if (this.doseBtn.hit(x, y)) { if (this.t - this.lastDose < 1.6) { this.overT = 3; this.say('Overdosed the fountain! Wait between doses.', 3); sfx.bad(); } else { this.clar = Math.min(1, this.clar + 0.22); sfx.click(); } this.lastDose = this.t; return; }
    if (this.washBtn.hit(x, y)) { if (this.filt > 0.2) { this.filt = 0; sfx.splash(); } }
  }
  step(dt) {
    const T = this.t;
    // --- pump station: demand random walk
    this.nextD -= dt;
    if (this.nextD <= 0) { this.D = clamp(this.D + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2)), 1, 6); this.nextD = rand(4, 7); }
    const pt = 18 + 95 * (this.vfd.value * 1.25) - 10 * this.D;
    this.p += (pt - this.p) * Math.min(1, dt * 2);
    this.health.pump = this.p >= 55 && this.p <= 70 ? 1 : this.p >= 45 && this.p <= 85 ? 0.5 : 0;
    // --- fields: evening heat dries zones
    let fh = 0;
    for (const z of this.zones) {
      z.m = clamp(z.m + (z.on ? 0.11 : -0.028 - (T > 45 ? 0.01 : 0)) * dt, 0, 1.15);
      if (z.on && z.m > 1.05) this.health.overwater = true;
      fh += z.m >= 0.5 && z.m <= 1.05 ? 1 : z.m >= 0.3 ? 0.5 : 0;
    }
    this.health.field = fh / 3;
    // --- rain harvest: storms with a dirty first flush
    this.nextStorm -= dt;
    if (!this.storm && this.nextStorm <= 0) { this.storm = { t: 0 }; sfx.alarm(); this.alerts.rain = 1; }
    let rh = 1;
    if (this.storm) {
      this.storm.t += dt;
      const dirty = this.storm.t < 2.6;
      if (this.mode === 'tank') { this.tank = Math.min(1, this.tank + 0.06 * dt); if (dirty) this.tankDirty = Math.min(1, this.tankDirty + 0.35 * dt); }
      else if (!dirty) rh = 0.5;  // clean rain going to waste
      if (this.storm.t > 8) { this.storm = null; this.nextStorm = rand(12, 16); }
    }
    this.tank = Math.max(0, this.tank - 0.012 * dt);
    this.tankDirty = Math.max(0, this.tankDirty - 0.03 * dt);
    if (this.tank < 0.3) rh = Math.min(rh, 0.5);
    if (this.tankDirty > 0.25) rh = 0;
    this.health.rain = rh;
    // --- fountain: clarity drifts, filter clogs
    this.filt = Math.min(1, this.filt + 0.04 * dt);
    this.clar = clamp(this.clar - (0.03 + (this.filt > 0.75 ? 0.05 : 0)) * dt, 0, 1);
    if (this.overT > 0) this.overT -= dt;
    this.health.fountain = this.overT > 0 ? 0 : this.clar >= 0.6 ? (this.filt > 0.75 ? 0.5 : 1) : this.clar >= 0.4 ? 0.5 : 0;
    // valley health
    const h = (this.health.pump + this.health.field + this.health.rain + this.health.fountain) / 4;
    this.hsum += h * dt; this.hn += dt; this.valley = h;
    if (h >= 0.999) this.allGreen += dt;
    this.objective = `Valley health ${Math.round(h * 100)}% · keep every tile green`;
    this.hum = 0.3 + this.vfd.value * 0.4;
    if (T > 44 && T < 45) this.say('Halfway there! Sun\'s setting, so the fields dry faster now.', 3);
  }
  timeUp() {
    const avg = this.hsum / Math.max(1, this.hn);
    if (avg >= 0.6) this.win('WELLBROOK FLOWS AGAIN!'); else this.fail(`Valley health averaged ${Math.round(avg * 100)}%. You need 60%.`);
  }
  tile(ctx, tl, t) {
    const h = this.health[tl.key];
    const col = h >= 1 ? C.green : h >= 0.5 ? C.amber : C.red;
    ctx.fillStyle = 'rgba(6,24,44,.85)'; rr(ctx, tl.x, tl.y, TW, TH, 12); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = h < 0.5 ? 3 + Math.abs(Math.sin(t * 8)) * 3 : 3; rr(ctx, tl.x, tl.y, TW, TH, 12); ctx.stroke();
    ctx.fillStyle = col; rr(ctx, tl.x + 12, tl.y + 10, 12, 12, 6); ctx.fill();
    text(ctx, tl.title, tl.x + 32, tl.y + 22, { size: 16, color: '#fff' });
    text(ctx, h >= 1 ? 'NORMAL' : h >= 0.5 ? 'WARNING' : 'ALARM', tl.x + TW - 14, tl.y + 22, { size: 14, color: col, align: 'right' });
  }
  render(ctx, t) {
    TILES.forEach((tl) => this.tile(ctx, tl, t));
    // pump tile content
    const pa = Math.PI * 0.75 + clamp(this.p / 120, 0, 1) * Math.PI * 1.5, cx = 140, cy = 160;
    for (const [a, b, col] of [[0, 45, C.red], [45, 55, C.amber], [55, 70, C.green], [70, 85, C.amber], [85, 120, C.red]]) { ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, cy, 52, Math.PI * 0.75 + a / 120 * Math.PI * 1.5, Math.PI * 0.75 + b / 120 * Math.PI * 1.5); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(pa) * 48, cy + Math.sin(pa) * 48); ctx.stroke();
    text(ctx, `${Math.round(this.p)} PSI`, cx, cy + 38, { size: 18, color: '#fff', align: 'center' });
    text(ctx, `Demand: ${this.D} zones`, 240, 120, { size: 16, color: C.blue30 });
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i < this.D ? '#2f9e55' : 'rgba(164,183,215,.15)'; rr(ctx, 240 + i * 22, 132, 16, 12, 3); ctx.fill(); }
    text(ctx, 'drag VFD →', 300, 190, { size: 14, color: C.blue30 });
    // fields
    for (const z of this.zones) {
      const m = clamp(z.m, 0, 1);
      ctx.fillStyle = mixColor('#6b5a3a', '#2f9e55', m); rr(ctx, z.x, z.y, 120, 120, 8); ctx.fill();
      ctx.strokeStyle = z.on ? C.aqua : 'rgba(164,183,215,.4)'; ctx.lineWidth = z.on ? 3 : 1.5; rr(ctx, z.x, z.y, 120, 120, 8); ctx.stroke();
      if (z.on) spray(ctx, z.x + 60, z.y + 70, 0.8, t + z.i, { reach: 40, spread: 1.5 });
      text(ctx, `ZONE ${z.i + 1}`, z.x + 8, z.y + 18, { size: 13, color: '#fff' });
      ctx.fillStyle = 'rgba(0,0,0,.4)'; rr(ctx, z.x + 8, z.y + 102, 104, 8, 4); ctx.fill();
      ctx.fillStyle = z.m > 1.05 ? C.amber : z.m < 0.5 ? C.red : C.water; rr(ctx, z.x + 8, z.y + 102, 104 * m, 8, 4); ctx.fill();
      text(ctx, z.on ? 'ON' : 'tap', z.x + 112, z.y + 18, { size: 12, color: z.on ? C.aqua : C.blue30, align: 'right' });
    }
    // rain
    const st = this.storm;
    if (st) {
      ctx.strokeStyle = 'rgba(170,200,230,.6)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 30; i++) { const x = 40 + ((i * 53 + t * 300) % 260), y = 286 + ((i * 37 + t * 500) % 120); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10); } ctx.stroke();
      const dirty = st.t < 2.6;
      ctx.fillStyle = dirty ? '#8a5a2b' : C.water; rr(ctx, 40, 380, 150, 34, 8); ctx.fill();
      text(ctx, dirty ? 'FIRST FLUSH: DIRTY' : 'CLEAN RAIN', 115, 402, { size: 14, color: '#fff', align: 'center' });
    } else text(ctx, `Next storm in ${Math.ceil(this.nextStorm)}s`, 40, 300, { size: 15, color: C.blue30 });
    ctx.fillStyle = '#c4ccd4'; rr(ctx, 230, 296, 80, 116, 6); ctx.fill();
    ctx.fillStyle = mixColor('#38b6e8', '#8a5a2b', this.tankDirty); ctx.fillRect(232, 296 + 116 * (1 - this.tank), 76, 116 * this.tank - 2);
    text(ctx, `TANK ${Math.round(this.tank * 100)}%`, 270, 290, { size: 13, color: '#fff', align: 'center' });
    // fountain
    const fx = 590;
    ctx.fillStyle = '#c9b8a3'; rr(ctx, fx - 80, 390, 200, 22, 6); ctx.fill();
    ctx.fillStyle = mixColor('#6f8a3a', '#38b6e8', this.clar); rr(ctx, fx - 74, 393, 188, 12, 5); ctx.fill();
    for (let j = 0; j < 3; j++) { const h = (this.filt > 0.75 ? 25 : 55) + Math.sin(t * 3 + j) * 10; ctx.strokeStyle = mixColor('#6f8a3a', '#9fe3f0', this.clar); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx - 40 + j * 60, 392); ctx.lineTo(fx - 40 + j * 60, 392 - h); ctx.stroke(); }
    text(ctx, `Clarity ${Math.round(this.clar * 100)}%`, 505, 300, { size: 15, color: '#fff' });
    text(ctx, `Filter ${this.filt > 0.75 ? 'CLOGGED' : 'OK'}`, 690, 300, { size: 15, color: this.filt > 0.75 ? C.red : C.blue30 });
    for (const p of this.parts) p.draw(ctx, t);
    // valley health bar
    const h = this.valley ?? 1;
    ctx.fillStyle = 'rgba(164,183,215,.2)'; rr(ctx, 560, 452, 380, 16, 8); ctx.fill();
    ctx.fillStyle = h >= 0.75 ? C.green : h >= 0.5 ? C.amber : C.red; rr(ctx, 560, 452, 380 * h, 16, 8); ctx.fill();
    text(ctx, 'VALLEY HEALTH', 560, 490, { size: 14, color: C.blue30 });
    const avg = this.hsum / Math.max(1, this.hn);
    text(ctx, `avg ${Math.round(avg * 100)}% (need 60%)`, 940, 490, { size: 14, color: '#fff', align: 'right' });
  }
  score() {
    const win = this.done === 'win', avg = this.hsum / Math.max(1, this.hn);
    const bonusDone = win && avg >= 0.85;
    return {
      parts: [['Heartboard rebuilt', win ? 2000 : 0], ['Average valley health', win ? Math.round(avg * 2600) : 0], ['All-green time', win ? Math.round(this.allGreen * 14) : 0], ['Bonus: 85%+ health', bonusDone ? 300 : 0]],
      bonusDone, achievements: win ? ['valley-restored'] : [],
    };
  }
}

const def = {
  id: 'L7', num: 7, title: 'Evening Rush', place: 'The Heartboard (master control panel)',
  concept: 'Running every system at once from one control panel', timeLimit: 90, stars: [4000, 5000], maxScore: 7000, minSeconds: 80,
  bonus: 'Average 85% valley health or better',
  golden: [{ x: 470, y: 240 }, { x: 900, y: 440 }, { x: 250, y: 230 }],
  photo: 'assets/projects/chase-tower.jpg', photoCaption: 'Downtown water feature · Chase Tower',
  note: 'inCon-trol builds its own UL 508A control panels in-house: PLC controls, touch-screen HMIs and remote access that keep complex water systems in sync.',
};
def.create = (opts) => new EveningRush(def, opts);
export default def;
