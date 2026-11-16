// Level 3 — Before Sunrise: schedule irrigation zones on the school fields before dawn.
// Teaches: zones, station capacity (too many zones = pressure collapse), wind waste, overwatering.
import { C, FONT, text, rr, clamp, rand, inRect, mixColor } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Meter, spray, panel } from '../kit.js';
import { sfx } from '../audio.js';

const FX = 110, FY = 66, FW = 630, FH = 360, COLS = 3, ROWS = 2;
const ZW = FW / COLS, ZH = FH / ROWS;
const RATE = 1 / 10.5;        // moisture per second at full supply

class BeforeSunrise extends LevelBase {
  setup() {
    this.zones = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      this.zones.push({ i: this.zones.length, c, r, x: FX + c * ZW, y: FY + r * ZH, m: rand(0.05, 0.25), on: false, flash: 0 });
    }
    this.meter = this.add(new Meter({ x: 852, y: 200, r: 52, max: 100, label: 'STATION PSI', bands: [[0, 40, C.red], [40, 52, C.amber], [52, 80, C.green], [80, 100, C.amber]] }));
    this.meter.restore();
    this.wind = null; this.nextWind = 14; this.windWaste = 0; this.puddle = 0; this.overT = 0; this.puddleWarned = false;
    this.drip = { ...this.drip, x: 70, y: 430, tx: 70, ty: 430, r: 18 };
    this.objective = 'Water every zone before sunrise';
    this.say('School fields, 4 a.m. The kids play at sunrise. Tap a ZONE to start its sprinklers. The station can only feed TWO zones at full pressure.', 7);
  }
  get running() { return this.zones.filter((z) => z.on).length; }
  tap(x, y) {
    for (const z of this.zones) {
      if (inRect(x, y, { x: z.x, y: z.y, w: ZW, h: ZH })) {
        z.on = !z.on; z.flash = 0.3; z.on ? sfx.valveOpen() : sfx.valveClose();
        if (this.running > 2) this.say('Three zones at once? Pressure\'s collapsing. Every head is just dribbling now!', 4);
        return;
      }
    }
  }
  step(dt) {
    const n = this.running;
    const supply = n <= 2 ? 1 : (2 / n) * 0.75;     // over-subscription loses coverage
    if (n > 2) this.overT += dt;
    this.meter.value = n === 0 ? 72 : n <= 2 ? 66 - n * 2 + Math.sin(this.t * 3) : 66 - (n - 2) * 14;
    // wind gusts on an edge column
    this.nextWind -= dt;
    if (!this.wind && this.nextWind <= 0) { this.wind = { col: Math.random() < 0.5 ? 0 : 2, t: 5.5 }; sfx.alarm(); this.say(`Wind gust on the ${this.wind.col === 0 ? 'WEST' : 'EAST'} side! Spray's blowing off the field. Pause those zones.`, 4); }
    if (this.wind) { this.wind.t -= dt; if (this.wind.t <= 0) { this.wind = null; this.nextWind = rand(9, 13); } }
    let any = false;
    for (const z of this.zones) {
      z.flash = Math.max(0, z.flash - dt);
      if (!z.on) continue;
      any = true;
      const gust = this.wind && this.wind.col === z.c;
      const eff = gust ? 0.35 : 1;
      const add = RATE * supply * dt;
      if (gust) this.windWaste += add * (1 - eff);
      if (z.m >= 1) { this.puddle += add; if (!this.puddleWarned) { this.puddleWarned = true; this.say('That zone\'s soaked, it\'s puddling! Turn it off when the bar is full.', 4); } }
      z.m = Math.min(1.15, z.m + add * eff);
    }
    this.hum = any ? 0.5 : 0;
    // Drip walks to the first running zone
    const z = this.zones.find((q) => q.on);
    if (z) this.moveDrip(z.x + ZW / 2, z.y + ZH - 12); else this.moveDrip(70, 430);
    this.drip.mood = n > 2 || (this.wind && this.zones.some((q) => q.on && q.c === this.wind.col)) ? 'worried' : 'happy';
    const done = this.zones.filter((q) => q.m >= 0.95).length;
    this.objective = `Water every zone before sunrise · ${done}/6 green`;
    if (done === 6) { this.zones.forEach((q) => (q.on = false)); this.win('Fields are green!'); }
    if (this.remaining < 15 && this.remaining > 14) this.say('The sun\'s nearly up. Hurry!', 2);
  }
  timeUp() { this.fail('The sun came up before the fields were watered.'); }
  render(ctx, t) {
    const dawn = clamp(this.t / this.limit, 0, 1);
    // sky tint: night → dawn
    ctx.fillStyle = `rgba(255,150,80,${dawn * 0.18})`; ctx.fillRect(0, 48, 960, 492);
    // field zones (blueprint → green as they get wet)
    for (const z of this.zones) {
      const m = clamp(z.m, 0, 1);
      ctx.fillStyle = mixColor('#6b5a3a', '#2f9e55', m); ctx.globalAlpha = 0.25 + 0.75 * m;
      ctx.fillRect(z.x + 2, z.y + 2, ZW - 4, ZH - 4); ctx.globalAlpha = 1;
      if (z.m > 1.02) { ctx.fillStyle = 'rgba(80,170,230,.45)'; ctx.beginPath(); ctx.ellipse(z.x + ZW / 2, z.y + ZH / 2, 40 * (z.m - 1) * 8, 18 * (z.m - 1) * 8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = z.on ? C.aqua : 'rgba(164,183,215,.5)'; ctx.lineWidth = z.on ? 3 : 1.5; ctx.setLineDash(z.on ? [] : [6, 5]);
      ctx.strokeRect(z.x + 2, z.y + 2, ZW - 4, ZH - 4); ctx.setLineDash([]);
      if (z.flash) { ctx.fillStyle = `rgba(255,255,255,${z.flash})`; ctx.fillRect(z.x, z.y, ZW, ZH); }
    }
    // field markings
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(FX + 30, FY + 30, FW - 60, FH - 60);
    ctx.beginPath(); ctx.moveTo(FX + FW / 2, FY + 30); ctx.lineTo(FX + FW / 2, FY + FH - 30); ctx.stroke();
    ctx.beginPath(); ctx.arc(FX + FW / 2, FY + FH / 2, 46, 0, Math.PI * 2); ctx.stroke();
    // sprinklers + labels + moisture bars
    const n = this.running, power = n <= 2 ? 1 : 0.35;
    for (const z of this.zones) {
      const gust = this.wind && this.wind.col === z.c;
      for (const [hx, hy] of [[0.25, 0.3], [0.75, 0.3], [0.25, 0.75], [0.75, 0.75]]) {
        const sx = z.x + ZW * hx, sy = z.y + ZH * hy;
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
        if (z.on) { ctx.save(); if (gust) { ctx.translate(sx, sy); ctx.transform(1, 0, z.c === 0 ? -0.8 : 0.8, 1, 0, 0); ctx.translate(-sx, -sy); } spray(ctx, sx, sy, power, t + hx * 3, { reach: 46, spread: 1.6 }); ctx.restore(); }
      }
      text(ctx, `ZONE ${z.i + 1}`, z.x + 12, z.y + 24, { size: 15, color: '#fff', stroke: 'rgba(0,0,0,.4)', sw: 3 });
      const bw = ZW - 24;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, z.x + 12, z.y + ZH - 24, bw, 10, 5); ctx.fill();
      ctx.fillStyle = z.m >= 0.95 ? C.green : C.water; rr(ctx, z.x + 12, z.y + ZH - 24, bw * clamp(z.m, 0, 1), 10, 5); ctx.fill();
      if (z.m >= 0.95) text(ctx, '✓', z.x + ZW - 20, z.y + 26, { size: 22, color: C.green });
    }
    // wind
    if (this.wind) {
      const cx = FX + this.wind.col * ZW, dir = this.wind.col === 0 ? -1 : 1;
      ctx.strokeStyle = 'rgba(230,240,255,.7)'; ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const yy = FY + 30 + i * 50, ph = ((t * 2 + i * 0.37) % 1);
        const x0 = cx + (dir > 0 ? ph * ZW : ZW - ph * ZW);
        ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + dir * 40, yy); ctx.stroke();
      }
      text(ctx, 'WIND!', cx + ZW / 2, FY + FH / 2, { size: 30, color: '#fff', align: 'center', stroke: 'rgba(0,0,0,.5)' });
    }
    // side panel: station + sunrise
    panel(ctx, 770, 60, 180, 370, 'STATION CONTROLLER');
    for (const p of this.parts) p.draw(ctx, t);
    text(ctx, `${n} / 2 zones`, 860, 290, { size: 22, color: n > 2 ? C.red : '#fff', align: 'center' });
    text(ctx, n > 2 ? 'OVER CAPACITY' : 'capacity', 860, 310, { size: 13, color: n > 2 ? C.red : C.blue30, align: 'center' });
    // sunrise bar
    text(ctx, 'SUNRISE', 860, 350, { size: 13, color: C.blue30, align: 'center' });
    ctx.fillStyle = 'rgba(164,183,215,.2)'; rr(ctx, 790, 360, 140, 12, 6); ctx.fill();
    const g = ctx.createLinearGradient(790, 0, 930, 0); g.addColorStop(0, '#2a3f7a'); g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g; rr(ctx, 790, 360, 140 * dawn, 12, 6); ctx.fill();
    ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(790 + 140 * dawn, 366, 9, 0, Math.PI * 2); ctx.fill();
  }
  score() {
    const win = this.done === 'win';
    const eff = Math.max(0, 1500 - (this.windWaste + this.puddle) * 900);
    const stab = Math.max(0, 1000 - this.overT * 70);
    const time = win ? Math.round(this.remaining * 30) : 0;
    const bonusDone = win && this.puddle < 0.02;
    const ach = [];
    if (win && this.remaining >= 20) ach.push('night-owl');
    if (win && this.windWaste < 0.05) ach.push('wind-wise');
    return {
      parts: [['Fields watered', win ? 2000 : 0], ['Water efficiency', Math.round(win ? eff : 0)], ['Station pressure', Math.round(win ? stab : 0)], ['Time before sunrise', time], ['Bonus: no puddles', bonusDone ? 300 : 0]],
      bonusDone, achievements: ach,
    };
  }
}

const def = {
  id: 'L3', num: 3, title: 'Before Sunrise', place: 'School athletic fields',
  concept: 'Irrigation zones, station capacity and wind', timeLimit: 75, stars: [4300, 5300], maxScore: 7500, minSeconds: 30,
  bonus: 'Water every zone without making a puddle',
  golden: [{ x: 300, y: 250 }, { x: 640, y: 140 }, { x: 480, y: 360 }],
  photo: 'assets/projects/sandbrock-ranch.jpg', photoCaption: 'Non-potable water system · Sandbrock Ranch Elementary',
  note: 'Storage tank, pumps and controls working together so a school\'s fields stay green on non-potable water. Notice the green field behind the tank.',
};
def.create = (opts) => new BeforeSunrise(def, opts);
export default def;
