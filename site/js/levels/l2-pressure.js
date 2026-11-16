// Level 2 — The Pressure Dance: pump room with VFD speed control and a lead/lag second pump.
// Teaches: pressure bands, variable-frequency drives, staging a second pump for peak demand, leaks.
import { C, text, rr, clamp, rand, dist } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Pipe, Pump, Meter, Slider, spray, panel } from '../kit.js';
import { sfx } from '../audio.js';

const GROUND = 440;
// field demand (zones running) over the shift
const SCHEDULE = [[0, 2], [12, 3], [22, 5], [30, 6], [40, 4], [50, 2], [60, 1], [999, 1]];

class PressureDance extends LevelBase {
  setup() {
    this.supply = this.add(new Pipe({ pts: [[60, 200], [140, 200], [140, 420], [330, 420], [330, 400]], w: 16 }));
    this.feed1 = this.add(new Pipe({ pts: [[140, 300], [330, 300], [330, 280]], w: 14 }));
    this.out1 = this.add(new Pipe({ pts: [[364, 246], [440, 246]], w: 14 }));
    this.out2 = this.add(new Pipe({ pts: [[364, 366], [440, 366], [440, 120]], w: 14 }));
    this.header = this.add(new Pipe({ pts: [[440, 246], [440, 110], [930, 110]], w: 18 }));
    this.p1 = this.add(new Pump({ x: 330, y: 246, r: 32, label: 'PUMP 1 · LEAD', hint: true }));
    this.p2 = this.add(new Pump({ x: 330, y: 366, r: 32, label: 'PUMP 2 · LAG' }));
    this.meter = this.add(new Meter({ x: 610, y: 290, r: 72, max: 120, label: 'DISCHARGE PRESSURE', bands: [[0, 45, C.red], [45, 55, C.amber], [55, 70, C.green], [70, 85, C.amber], [85, 120, C.red]] }));
    this.vfd = this.add(new Slider({ x: 820, y: 190, w: 26, h: 190, label: 'VFD SPEED' }));
    this.p = 0; this.green = 0; this.red = 0; this.over = 0; this.energy = 0; this.leaks = []; this.leakCount = 0; this.spikeLag = 0;
    this.started = false; this.dragging = null;
    this.drip = { ...this.drip, x: 520, y: GROUND, tx: 520, ty: GROUND };
    this.objective = 'Start Pump 1';
    this.hum = 0;
    this.say('Pump room. The school fields need steady pressure between 55 and 70 PSI. Tap PUMP 1 to start the lead pump.', 6);
  }
  demand() { let d = 1; for (const [t, z] of SCHEDULE) if (this.shiftT >= t) d = z; return d; }
  get shiftT() { return this.started ? this.t - this.startT : 0; }
  press(x, y, id) {
    if (this.vfd.hit(x, y)) { this.dragging = id; this.vfd.setFromY(y); this.vfd.hint = false; this.vfd.restore(); }
  }
  drag(x, y, id) { if (this.dragging === id) this.vfd.setFromY(y); }
  release(x, y, id) { if (this.dragging === id) this.dragging = null; }
  tap(x, y) {
    if (this.dragging != null) return;
    for (const L of this.leaks) if (!L.fixed && dist(x, y, L.x, L.y) < 34) { L.fixed = true; if (this.leakCount <= 3) this.bonus(75, L.x, L.y - 20, '+75 LEAK FIXED'); else this.fl.add(L.x, L.y - 20, 'LEAK FIXED'); sfx.valveClose(); return; }
    if (this.p1.hit(x, y)) {
      this.p1.on = !this.p1.on; this.p1.on ? sfx.pumpOn() : sfx.pumpOff(); this.p1.restore(); this.p1.hint = false;
      [this.supply, this.feed1, this.out1, this.header, this.meter, this.vfd].forEach((p) => p.restore());
      if (!this.started && this.p1.on) {
        this.started = true; this.startT = this.t; this.vfd.value = Math.max(this.vfd.value, 0.35); this.vfd.hint = true;
        this.say('Now DRAG the VFD speed to raise or lower pressure. Watch the needle. Field zones will switch on and off all shift.', 6);
      }
      return;
    }
    if (this.p2.hit(x, y)) { this.p2.on = !this.p2.on; this.p2.on ? sfx.pumpOn() : sfx.pumpOff(); this.p2.restore(); this.out2.restore(); }
  }
  step(dt) {
    const s = this.vfd.value;
    this.p1.target = s; this.p2.target = s;
    const cap = this.p1.speed + this.p2.speed * 0.9;
    const D = this.started ? this.demand() + Math.sin(this.t * 1.7) * 0.25 : 0;
    this.D = D;
    let pt = this.started || cap > 0 ? 18 + 95 * cap - 10 * D : 0;
    for (const L of this.leaks) if (!L.fixed) pt -= 9;
    pt = clamp(pt, 0, 120);
    this.p += (pt - this.p) * Math.min(1, dt * 3.2);
    this.meter.value = this.p; this.meter.wobble = this.p > 85 ? 1 : 0;
    this.hum = (this.p1.speed + this.p2.speed) / 2;
    const flow = Math.min(cap, D / 6);
    this.supply.fill = this.feed1.fill = 1; this.supply.flow = this.feed1.flow = flow;
    this.out1.fill = this.p1.speed > 0.05 ? 1 : 0.3; this.out1.flow = this.p1.speed;
    this.out2.fill = this.p2.speed > 0.05 ? 1 : 0.3; this.out2.flow = this.p2.speed;
    this.header.fill = cap > 0.05 ? 1 : 0.3; this.header.flow = flow;
    if (!this.started) return;
    const st = this.shiftT;
    this.objective = st < 60 ? `Hold 55–70 PSI · ${Math.floor(this.green)}s in the green` : 'Shift complete!';
    if (this.p >= 55 && this.p <= 70) this.green += dt;
    if (this.p < 45 || this.p > 85) this.red += dt;
    if (this.p > 85) { this.over += dt; this.say('Too much pressure! Ease off the VFD before something bursts.', 3); this.drip.mood = 'worried'; }
    else if (this.p < 45) { this.say('Pressure\'s too low. The sprinklers are sputtering. Speed up!', 3); this.drip.mood = 'worried'; }
    else this.drip.mood = 'happy';
    if (this.over > 1.4) {
      this.over = 0; this.leakCount++; sfx.alarm(); this.shake = 0.4;
      const L = { x: rand(470, 880), y: 110, fixed: false }; this.leaks.push(L);
      this.say('A joint let go! Tap the LEAK to fix it.', 4);
    }
    for (const L of this.leaks) if (!L.fixed && Math.random() < 0.6) this.fx.burst(L.x, L.y, 1, { speed: 160 });
    // demand cues
    if (st > 27 && st < 29) this.say('Big demand spike coming. Every zone at once! One pump won\'t be enough. Bring PUMP 2 online.', 5);
    if (st > 30 && st < 40) { if (this.p2.on) this.spikeLag += dt; this.p2.hint = !this.p2.on; } else this.p2.hint = false;
    if (st > 41 && st < 43 && this.p2.on) this.say('Spike\'s over. Shut PUMP 2 down to save energy.', 4);
    if (this.p2.on && this.D < 4.5) this.energy += dt;
    this.moveDrip(this.p < 55 ? 500 : this.p > 70 ? 720 : 610, GROUND);
    if (st >= 60) { if (this.green >= 30) this.win('Pressure tamed!'); else this.fail(`Only ${Math.floor(this.green)}s in the green. You need 30.`); }
  }
  timeUp() { if (!this.started) this.fail('The pumps never started.'); }
  render(ctx, t) {
    ctx.fillStyle = '#123b5e'; ctx.fillRect(0, GROUND, 960, 100);
    // skid
    ctx.fillStyle = 'rgba(164,183,215,.12)'; rr(ctx, 230, 200, 230, 230, 10); ctx.fill();
    text(ctx, 'FROM STORAGE TANK', 60, 190, { size: 12, color: C.blue30 });
    // field demand board
    const D = this.started ? this.demand() : 0;
    for (let i = 0; i < 6; i++) {
      const x = 520 + i * 70, on = i < D;
      ctx.fillStyle = on ? '#2f9e55' : 'rgba(164,183,215,.15)'; rr(ctx, x - 26, 128, 52, 18, 5); ctx.fill();
      text(ctx, `Z${i + 1}`, x, 142, { size: 12, color: '#fff', align: 'center' });
      if (on) spray(ctx, x, 126, clamp((this.p - 30) / 40, 0.15, 1.2), t, { reach: 34 });
    }
    text(ctx, 'FIELD ZONES RUNNING', 695, 172, { size: 12, color: C.blue30, align: 'center' });
    for (const p of this.parts) p.draw(ctx, t);
    for (const L of this.leaks) if (!L.fixed) { ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(L.x, L.y, 20 + Math.sin(t * 10) * 3, 0, Math.PI * 2); ctx.stroke(); text(ctx, 'LEAK!', L.x, L.y - 28, { size: 15, color: C.red, align: 'center' }); }
    if (this.started && this.shiftT < 60) {
      const w = 300, f = this.shiftT / 60;
      ctx.fillStyle = 'rgba(164,183,215,.2)'; rr(ctx, 460, 395, w, 10, 5); ctx.fill();
      ctx.fillStyle = C.aqua; rr(ctx, 460, 395, w * f, 10, 5); ctx.fill();
      text(ctx, `SHIFT ${Math.ceil(60 - this.shiftT)}s`, 460 + w + 10, 404, { size: 13, color: C.blue30 });
    }
  }
  score() {
    const win = this.done === 'win';
    const stab = Math.min(2600, this.green / 55 * 2600);
    const eff = Math.max(0, 1500 - this.energy * 60 - this.leakCount * 250);
    const care = Math.max(0, 900 - this.red * 45);
    const bonusDone = win && this.leakCount === 0;
    const ach = [];
    if (win && this.green >= 45) ach.push('pressure-pro');
    if (this.spikeLag >= 5) ach.push('lead-lag');
    return {
      parts: [['Time in the green band', Math.round(win ? stab : 0)], ['Energy & leaks', Math.round(win ? eff : 0)], ['Stable operation', Math.round(win ? care : 0)], ['Bonus: no leaks', bonusDone ? 300 : 0]],
      bonusDone, achievements: ach,
    };
  }
}

const def = {
  id: 'L2', num: 2, title: 'The Pressure Dance', place: 'Irrigation pump station',
  concept: 'Pressure bands, VFD speed control and lead/lag pumps', timeLimit: 80, stars: [3800, 4800], maxScore: 6500, minSeconds: 45,
  bonus: 'Finish the shift without a single leak',
  golden: [{ x: 200, y: 140 }, { x: 760, y: 220 }, { x: 560, y: 410 }],
  photo: 'assets/projects/denton-hs.jpg', photoCaption: 'Pump station · Denton High School',
  note: 'Real irrigation pump stations use VFDs (variable frequency drives) and multiple pumps to hold steady pressure as demand changes, just like you did.',
};
def.create = (opts) => new PressureDance(def, opts);
export default def;
