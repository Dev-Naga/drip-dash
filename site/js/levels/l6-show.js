// Level 6 — The Grand Show: restore the plaza fountain, then perform the show.
// Teaches: water features, fiberglass equipment vaults, filtration (backwash), precise chemical dosing.
import { C, FONT, text, rr, clamp, rand, inRect, mixColor } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Btn, Meter, panel } from '../kit.js';
import { sfx } from '../audio.js';

const JETS = [250, 365, 480, 595, 710];
const BASIN_Y = 262;
const BEAT = 0.6;     // seconds per beat (100 bpm)
// show chart: [beat, jet]
const CHART = [[0, 2], [1, 1], [2, 3], [3, 2], [4, 0], [5, 4], [6, 1], [7, 3], [8, 2], [8.5, 2], [9, 0], [10, 4], [11, 1], [11.5, 3],
  [12, 2], [13, 0], [13.5, 1], [14, 2], [14.5, 3], [15, 4], [16, 2], [17, 0], [17, 4], [18, 1], [18, 3], [19, 2], [20, 2]];

class GrandShow extends LevelBase {
  setup() {
    this.dose = this.add(new Btn({ x: 560, y: 368, w: 110, h: 48, label: 'DOSE', sub: 'chemical injection', color: '#7a4fbf', hint: true }));
    this.wash = this.add(new Btn({ x: 690, y: 368, w: 110, h: 48, label: 'BACKWASH', sub: 'cartridge filter', color: '#3d6f8f' }));
    this.dp = this.add(new Meter({ x: 880, y: 395, r: 34, max: 30, unit: 'PSI Δ', label: 'FILTER', bands: [[0, 15, C.green], [15, 22, C.amber], [22, 30, C.red]] }));
    this.dp.restore();
    this.clarity = 0.22; this.chlor = 0.1; this.filt = 0.2; this.overdoseT = 0; this.washT = 0;
    this.phase = 'restore'; this.showT = -3; this.notes = CHART.map(([b, j]) => ({ t: b * BEAT, j, state: 0 }));
    this.hits = 0; this.perfect = 0; this.miss = 0; this.minShowClarity = 1; this.jetFire = [0, 0, 0, 0, 0]; this.clarSum = 0; this.clarN = 0;
    this.drip = { ...this.drip, x: 140, y: 300, tx: 140, ty: 300, r: 20 };
    this.objective = 'Clear the fountain water';
    this.say('The plaza fountain! The water\'s cloudy and the filter\'s clogged. Down in the vault, tap DOSE to add sanitizer, a little at a time. Too much and you\'ll overdo it.', 7);
  }
  tap(x, y) {
    if (this.dose.hit(x, y)) {
      this.chlor = Math.min(1.3, this.chlor + 0.2); sfx.click(); this.dose.hint = false; this.dose.held = true; setTimeout(() => (this.dose.held = false), 120);
      if (this.chlor > 0.85) this.say('Whoa, too strong! Wait for it to settle before dosing again.', 3);
      return;
    }
    if (this.wash.hit(x, y)) {
      if (this.filt > 0.25) { this.filt = 0; this.washT = 1.4; sfx.splash(); this.washes = (this.washes || 0) + 1; if (this.washes <= 4) this.bonus(40, 745, 350, '+40 BACKWASHED'); else this.fl.add(745, 350, 'BACKWASHED'); this.wash.hint = false; }
      return;
    }
    if (this.phase === 'show' && y > 80 && y < 330) {
      const j = JETS.findIndex((jx) => Math.abs(x - jx) < 57);
      if (j >= 0) this.hitJet(j);
    }
  }
  hitJet(j) {
    let best = null, bd = 9;
    for (const n of this.notes) if (n.j === j && n.state === 0) { const d = Math.abs(n.t - this.showT); if (d < bd) { bd = d; best = n; } }
    if (best && bd < 0.32) {
      best.state = bd < 0.14 ? 2 : 1; this.hits++; if (best.state === 2) this.perfect++;
      this.jetFire[j] = 1; sfx.beat(j);
      this.fl.add(JETS[j], 150, best.state === 2 ? 'PERFECT' : 'GOOD', best.state === 2 ? C.aqua : '#fff', 18);
      this.fx.burst(JETS[j], 110, 10, { speed: 200 });
    } else { sfx.bad(); this.jetFire[j] = 0.25; }
  }
  key(k) { if (this.phase === 'show') { const j = '12345'.indexOf(k); if (j >= 0) this.hitJet(j); } }
  step(dt) {
    // water chemistry
    this.chlor = Math.max(0, this.chlor - 0.045 * dt);
    this.filt = Math.min(1, this.filt + (this.phase === 'show' ? 0.03 : 0.045) * dt);
    if (this.washT > 0) this.washT -= dt;
    const over = this.chlor > 0.85;
    if (over) this.overdoseT += dt;
    let dc = 0;
    if (this.chlor > 0.25 && !over) dc += 0.07 * this.chlor;
    if (over) dc -= 0.01;
    if (this.filt > 0.75) dc -= 0.05;
    if (this.phase === 'show') dc -= 0.018;
    this.clarity = clamp(this.clarity + dc * dt, 0, 1);
    this.dp.value = 6 + this.filt * 22;
    if (this.filt > 0.7) { this.wash.hint = true; this.say('Filter pressure is climbing. It\'s clogged! Tap BACKWASH.', 3); }
    if (this.clarity < 0.6 && this.phase === 'show') this.say('Water\'s getting cloudy mid-show. Give it a DOSE!', 2.5);
    // phases
    if (this.phase === 'restore') {
      this.objective = `Clear the water · clarity ${Math.round(this.clarity * 100)}%`;
      if (this.clarity >= 0.9) { this.phase = 'show'; this.showT = -3.2; sfx.win(); this.say('Crystal clear! SHOWTIME. Tap each jet when its ring lands on the nozzle (or press keys 1–5).', 6); }
      this.moveDrip(520, 440);
    } else {
      this.showT += dt;
      this.clarSum += this.clarity; this.clarN++;
      this.minShowClarity = Math.min(this.minShowClarity, this.clarity);
      for (const n of this.notes) if (n.state === 0 && this.showT - n.t > 0.32) { n.state = -1; this.miss++; }
      const left = this.notes.filter((n) => n.state === 0).length;
      this.objective = `Fountain show · ${this.hits}/${this.notes.length} beats`;
      this.moveDrip(130, 300);
      if (left === 0 && this.showT > this.notes[this.notes.length - 1].t + 1) this.win(this.hits / this.notes.length >= 0.9 ? 'Standing ovation!' : 'What a show!');
    }
    for (let j = 0; j < 5; j++) this.jetFire[j] = Math.max(0, this.jetFire[j] - dt * 1.6);
    this.hum = this.washT > 0 ? 0.2 : 0.45;
    this.drip.mood = over || this.clarity < 0.5 ? 'worried' : 'happy';
  }
  timeUp() { this.fail(this.phase === 'restore' ? 'The water never cleared in time.' : 'Out of time.'); }
  render(ctx, t) {
    // night plaza backdrop — downtown towers & a spire
    ctx.fillStyle = 'rgba(93,133,183,.28)';
    [[60, 120, 70], [150, 80, 60], [800, 90, 80], [890, 140, 60]].forEach(([x, y, w]) => ctx.fillRect(x, y, w, BASIN_Y - y));
    ctx.beginPath(); ctx.moveTo(760, BASIN_Y); ctx.lineTo(760, 160); ctx.lineTo(775, 90); ctx.lineTo(790, 160); ctx.lineTo(790, BASIN_Y); ctx.fill();
    ctx.fillStyle = 'rgba(255,217,138,.25)'; for (let i = 0; i < 20; i++) ctx.fillRect(70 + (i % 4) * 14 + (i > 11 ? 740 : 0), 135 + Math.floor(i / 4) * 22, 7, 9);
    // basin
    const water = mixColor('#6f8a3a', '#38b6e8', this.clarity);
    ctx.fillStyle = '#c9b8a3'; rr(ctx, 190, BASIN_Y - 6, 580, 40, 10); ctx.fill();
    ctx.fillStyle = water; rr(ctx, 200, BASIN_Y, 560, 22, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 8; i++) ctx.fillRect(220 + i * 68 + Math.sin(t * 2 + i) * 6, BASIN_Y + 6, 26, 2);
    // jets
    const wash = this.washT > 0;
    JETS.forEach((jx, j) => {
      ctx.fillStyle = '#5b6773'; ctx.fillRect(jx - 7, BASIN_Y - 4, 14, 8);
      let h = 0;
      if (!wash) {
        if (this.phase === 'restore') h = 40 + 20 * Math.sin(t * 2 + j) * this.clarity;
        else h = 30 + this.jetFire[j] * 180;
      }
      h *= this.filt > 0.75 ? 0.5 : 1;
      if (h > 4) {
        const g = ctx.createLinearGradient(0, BASIN_Y - h, 0, BASIN_Y);
        const hue = ['rgba(0,193,213,', 'rgba(120,200,255,', 'rgba(255,255,255,', 'rgba(120,200,255,', 'rgba(0,193,213,'][j];
        g.addColorStop(0, hue + '.15)'); g.addColorStop(1, mixColor('#6f8a3a', '#9fe3f0', this.clarity));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(jx - 5, BASIN_Y); ctx.quadraticCurveTo(jx - 3, BASIN_Y - h * 0.6, jx, BASIN_Y - h); ctx.quadraticCurveTo(jx + 3, BASIN_Y - h * 0.6, jx + 5, BASIN_Y); ctx.fill();
        if (this.jetFire[j] > 0.3) { ctx.fillStyle = `rgba(0,193,213,${this.jetFire[j] * 0.25})`; ctx.beginPath(); ctx.arc(jx, BASIN_Y - h, 30, 0, Math.PI * 2); ctx.fill(); }
      }
      // show rings
      if (this.phase === 'show') {
        for (const n of this.notes) {
          if (n.j !== j || n.state !== 0) continue;
          const dtn = n.t - this.showT;
          if (dtn > 2.2 || dtn < -0.32) continue;
          const y = BASIN_Y - 10 - dtn * 75, r = 16 + Math.max(0, dtn) * 10;
          ctx.strokeStyle = dtn < 0.14 ? C.aqua : '#fff'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(jx, y, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(jx, BASIN_Y - 10, 16, 0, Math.PI * 2); ctx.stroke();
        text(ctx, String(j + 1), jx, BASIN_Y + 50, { size: 14, color: C.blue30, align: 'center' });
      }
    });
    if (this.phase === 'show' && this.showT < 0) text(ctx, Math.ceil(-this.showT) || 'GO', 480, 180, { size: 64, font: FONT.display, color: '#fff', align: 'center', stroke: C.deep, sw: 6 });
    // underground vault cutaway
    ctx.fillStyle = '#2a2016'; ctx.fillRect(0, 300, 960, 240);
    panel(ctx, 190, 320, 760, 112, 'FIBERGLASS EQUIPMENT VAULT (BELOW GRADE)');
    ctx.fillStyle = '#c63b2f'; ctx.beginPath(); ctx.arc(250, 385, 20, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.blue; rr(ctx, 200, 372, 34, 26, 4); ctx.fill();
    text(ctx, 'FEATURE PUMP', 240, 425, { size: 11, color: C.blue30, align: 'center' });
    ctx.fillStyle = '#9aa6b2'; rr(ctx, 300, 350, 34, 66, 8); ctx.fill(); ctx.fillStyle = mixColor('#ffffff', '#7a6a3a', this.filt); ctx.fillRect(306, 358, 22, 50);
    text(ctx, 'FILTER', 317, 428, { size: 11, color: C.blue30, align: 'center' });
    // chlorine & clarity gauges
    const bar = (x, label, v, lo, hi, col) => {
      text(ctx, label, x, 350, { size: 12, color: C.blue30 });
      ctx.fillStyle = 'rgba(164,183,215,.2)'; rr(ctx, x, 358, 150, 12, 6); ctx.fill();
      if (lo != null) { ctx.fillStyle = 'rgba(61,220,132,.35)'; ctx.fillRect(x + 150 * lo, 358, 150 * (hi - lo), 12); }
      ctx.fillStyle = col; rr(ctx, x, 358, 150 * clamp(v, 0, 1), 12, 6); ctx.fill();
    };
    bar(370, 'SANITIZER', this.chlor / 1.1, 0.25 / 1.1, 0.85 / 1.1, this.chlor > 0.85 ? C.red : '#b07aff');
    text(ctx, 'CLARITY', 370, 392, { size: 12, color: C.blue30 });
    ctx.fillStyle = 'rgba(164,183,215,.2)'; rr(ctx, 370, 400, 150, 12, 6); ctx.fill();
    ctx.fillStyle = mixColor('#6f8a3a', '#38b6e8', this.clarity); rr(ctx, 370, 400, 150 * this.clarity, 12, 6); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(370 + 150 * 0.9, 396); ctx.lineTo(370 + 150 * 0.9, 416); ctx.stroke();
    for (const p of this.parts) p.draw(ctx, t);
    if (wash) text(ctx, 'BACKWASHING…', 480, 230, { size: 20, color: '#fff', align: 'center' });
  }
  score() {
    const win = this.done === 'win', n = this.notes.length;
    const acc = this.hits / n;
    const show = Math.round(acc * 1800 + (this.perfect / n) * 600);
    const clar = Math.round((this.clarN ? this.clarSum / this.clarN : 0) * 1000);
    const chem = Math.max(0, 600 - this.overdoseT * 80);
    const bonusDone = win && this.minShowClarity >= 0.6;
    const ach = [];
    if (bonusDone) ach.push('crystal-clear');
    if (win && acc >= 0.9) ach.push('showstopper');
    return {
      parts: [['Fountain restored', win ? 1500 : 0], ['Show performance', win ? show : 0], ['Water clarity', win ? clar : 0], ['Careful dosing', Math.round(win ? chem : 0)], ['Bonus: clear all show', bonusDone ? 300 : 0]],
      bonusDone, achievements: ach,
    };
  }
}

const def = {
  id: 'L6', num: 6, title: 'The Grand Show', place: 'Plaza fountain & equipment vault',
  concept: 'Water features, filtration and chemical dosing', timeLimit: 110, stars: [4100, 5000], maxScore: 7000, minSeconds: 25,
  bonus: 'Keep the water clear through the entire show',
  golden: [{ x: 120, y: 200 }, { x: 860, y: 230 }, { x: 480, y: 120 }],
  photo: 'assets/projects/aa-hq.jpg', photoCaption: 'Water feature · American Airlines Headquarters',
  note: 'Behind every calm water feature is a hidden vault with pumps, filters and chemical dosing. inCon-trol designs, builds and maintains them.',
};
def.create = (opts) => new GrandShow(def, opts);
export default def;
