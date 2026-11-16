// Level 4 — Catch the Storm: rainwater harvesting with a first-flush diverter.
// Teaches: harvesting rain, sending the dirty first flush to drain, gutter maintenance, using stored water.
import { C, text, rr, clamp, rand, inRect, mixColor } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Pipe, Pump, Tank, Btn } from '../kit.js';
import { sfx } from '../audio.js';

const GROUND = 440;
const STORM_END = 46;

class CatchTheStorm extends LevelBase {
  setup() {
    this.spout = this.add(new Pipe({ pts: [[318, 168], [318, 330]], w: 14 }));
    this.toDrain = this.add(new Pipe({ pts: [[318, 352], [318, 432]], w: 12 }));
    this.toTank = this.add(new Pipe({ pts: [[340, 340], [470, 340], [470, 214]], w: 14 }));
    this.outlet = this.add(new Pipe({ pts: [[600, 410], [700, 410]], w: 12 }));
    this.toGarden = this.add(new Pipe({ pts: [[734, 410], [734, 350], [800, 350]], w: 12 }));
    this.tank = this.add(new Tank({ x: 470, y: 190, w: 130, h: 240, level: 0.05, style: 'corrugated', label: 'RAIN HARVEST TANK' }));
    this.pump = this.add(new Pump({ x: 734, y: 410, r: 24, label: 'BOOSTER' }));
    this.div = this.add(new Btn({ x: 268, y: 360, w: 100, h: 44, label: 'TO DRAIN', sub: 'diverter', color: '#8a5a2b', life: 0, lifeTarget: 0, hint: false }));
    this.mode = 'drain';
    this.rain = []; this.runTotal = 0; this.clean = 0; this.cleanMissed = 0; this.dirtyIn = 0; this.overflow = 0;
    this.clog = 0; this.nextClog = 12; this.spill = 0; this.garden = 0.08; this.sunSaid = false; this.phase = 'storm';
    this.drip = { ...this.drip, x: 400, y: GROUND, tx: 400, ty: GROUND };
    this.objective = 'Divert the dirty first flush, then catch clean rain';
    this.say('Storm rolling in over the library! The first rain off a roof is DIRTY. Leave the diverter on DRAIN until the water runs clear, then tap it to send it to the TANK.', 7);
  }
  intensity() {
    const t = this.t;
    if (t < 3) return t / 3 * 0.4;
    if (t < 8) return 0.4 + (t - 3) / 5 * 0.6;
    if (t < 38) return 0.85 + Math.sin(t * 0.7) * 0.15;
    if (t < STORM_END) return Math.max(0, 1 - (t - 38) / 8);
    return 0;
  }
  dirtiness() { return clamp(1 - this.runTotal / 4.5, 0, 1); }   // first flush ≈ first 4.5 units of runoff
  tap(x, y) {
    if (this.div.hit(x, y)) {
      this.mode = this.mode === 'drain' ? 'tank' : 'drain';
      this.div.label = this.mode === 'drain' ? 'TO DRAIN' : 'TO TANK';
      this.div.color = this.mode === 'drain' ? '#8a5a2b' : C.blue;
      sfx.valveOpen(); this.div.restore(); this.toTank.restore(); this.tank.restore(); this.div.hint = false;
      if (this.mode === 'tank' && this.dirtiness() > 0.35) this.say('Too soon! That water is still dirty. It\'ll foul the tank.', 3);
      return;
    }
    if (inRect(x, y, { x: 40, y: 130, w: 300, h: 60 })) {
      if (this.clog > 0.2) { this.clog = 0; this.bonus(60, 300, 140, '+60 GUTTER CLEARED'); sfx.splash(); this.fx.burst(300, 160, 12, { color: 'rgba(130,160,70,' }); }
      return;
    }
    if (this.pump.hit(x, y)) {
      this.pump.on = !this.pump.on; this.pump.on ? sfx.pumpOn() : sfx.pumpOff();
      [this.pump, this.outlet, this.toGarden].forEach((p) => p.restore());
    }
  }
  step(dt) {
    const I = this.intensity();
    this.spout.restore(); this.toDrain.restore();
    // rain particles
    for (let i = 0; i < I * 800 * dt; i++) this.rain.push({ x: rand(0, 960), y: rand(40, 60), v: rand(500, 700) });
    for (const r of this.rain) r.y += r.v * dt;
    this.rain = this.rain.filter((r) => r.y < GROUND);
    // gutter debris
    if (this.t > this.nextClog && this.t < STORM_END) { this.clog = Math.min(1, this.clog + 0.55); this.nextClog = this.t + rand(9, 13); this.say('Leaves are blocking the gutter! Tap the ROOF GUTTER to clear it.', 3.5); }
    const runoff = I * 0.6 * dt;                // roof catchment
    const captured = runoff * (1 - this.clog * 0.85);
    this.spill += runoff - captured;
    const dirt = this.dirtiness();
    this.runTotal += captured;
    // diverter
    if (this.mode === 'tank') {
      const before = this.tank.level;
      this.tank.level += captured * 0.055;
      if (dirt > 0.05) this.dirtyIn += captured * dirt;
      this.tank.dirty = clamp(this.dirtyIn / Math.max(0.5, this.runTotal), 0, 1) * 2;
      if (dirt <= 0.05) this.clean += captured;
      if (this.tank.level > 1) { this.overflow += this.tank.level - 1; this.tank.level = 1; this.say('Tank\'s full and overflowing! Run the booster to the garden to make room.', 3); }
    } else if (dirt <= 0.05) this.cleanMissed += captured;
    // pipes
    const col = (p, on, f) => { p.fill = on ? 1 : 0.2; p.flow = f; p.dirty = dirt; };
    col(this.spout, captured > 0.0005, I);
    col(this.toDrain, this.mode === 'drain' && captured > 0.0005, I);
    col(this.toTank, this.mode === 'tank' && captured > 0.0005, I);
    // garden booster
    const draw = this.pump.on && this.tank.level > 0.02 ? 0.035 * this.pump.speed : 0;
    this.tank.level = Math.max(0, this.tank.level - draw * dt);
    this.garden = Math.min(1.1, this.garden + (draw > 0 ? 0.09 * this.pump.speed : 0) * dt - (this.phase === 'sun' ? 0.004 * dt : 0));
    this.outlet.fill = this.toGarden.fill = draw > 0 ? 1 : 0.2; this.outlet.flow = this.toGarden.flow = draw > 0 ? 1 : 0;
    this.toGarden.dirty = this.outlet.dirty = this.tank.dirty;
    this.hum = this.pump.speed * 0.5;
    if (this.pump.on && this.tank.level <= 0.02) { this.pump.on = false; sfx.pumpOff(); this.say('Tank\'s empty. That\'s all the rain we caught.', 3); }
    // phases
    if (this.t >= STORM_END && this.phase === 'storm') {
      this.phase = 'sun'; this.div.hint = false; this.pump.hint = true;
      this.say('Storm\'s passed. The library garden is thirsty. Tap the BOOSTER to water it with the rain you saved. Free water!', 6);
    }
    if (this.phase === 'storm' && this.mode === 'drain' && dirt < 0.05 && I > 0.3) { this.div.hint = true; this.say('Water\'s running clear now. Switch the diverter to the TANK!', 3); }
    this.objective = this.phase === 'storm' ? `Catch clean rain · tank ${Math.round(this.tank.level * 100)}%` : `Water the garden · ${Math.round(clamp(this.garden, 0, 1) * 100)}%`;
    if (this.phase === 'sun' && this.pump.speed > 0.1) this.pump.hint = false;
    this.moveDrip(this.phase === 'sun' ? 820 : this.mode === 'tank' ? 420 : 370, GROUND);
    this.drip.mood = (this.mode === 'tank' && dirt > 0.3) || this.clog > 0.4 ? 'worried' : 'happy';
    if (this.phase === 'sun' && this.garden >= 0.95) { this.pump.on = false; this.win('Every drop put to work!'); }
    if (this.phase === 'sun' && this.tank.level <= 0.02 && this.garden < 0.95) this.fail('Not enough rain saved to water the garden.');
  }
  timeUp() { this.fail('The garden dried out.'); }
  render(ctx, t) {
    const I = this.intensity();
    // storm sky
    ctx.fillStyle = `rgba(20,30,45,${I * 0.45})`; ctx.fillRect(0, 48, 960, 392);
    for (let i = 0; i < 6; i++) { const x = ((i * 190 + t * 18) % 1150) - 100; ctx.fillStyle = `rgba(110,125,145,${0.2 + I * 0.6})`; ctx.beginPath(); ctx.ellipse(x, 70, 90, 26, 0, 0, Math.PI * 2); ctx.ellipse(x + 50, 58, 60, 24, 0, 0, Math.PI * 2); ctx.fill(); }
    if (this.phase === 'sun') { ctx.fillStyle = 'rgba(255,215,110,.9)'; ctx.beginPath(); ctx.arc(860, 100, 34, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(170,200,230,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (const r of this.rain) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - 3, r.y + 12); } ctx.stroke();
    ctx.fillStyle = '#123b5e'; ctx.fillRect(0, GROUND, 960, 100);
    // library
    ctx.fillStyle = '#7a8796'; ctx.fillRect(50, 190, 250, 250);
    ctx.fillStyle = '#5b6773'; ctx.beginPath(); ctx.moveTo(30, 190); ctx.lineTo(175, 120); ctx.lineTo(320, 190); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffd98a'; ctx.globalAlpha = 0.5 + I * 0.4; ctx.fillRect(80 + i * 72, 240, 44, 60); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#3d4a57'; ctx.fillRect(160, 350, 40, 90);
    text(ctx, 'LIBRARY', 175, 330, { size: 18, color: '#fff', align: 'center' });
    // gutter
    ctx.fillStyle = '#9aa6b2'; rr(ctx, 26, 186, 300, 10, 4); ctx.fill();
    for (let i = 0; i < Math.round(this.clog * 10); i++) { ctx.fillStyle = i % 2 ? '#7a9a3a' : '#a0782e'; ctx.beginPath(); ctx.ellipse(250 + (i * 13) % 70, 186, 8, 4, i, 0, Math.PI * 2); ctx.fill(); }
    if (this.clog > 0.2) {
      text(ctx, 'TAP GUTTER TO CLEAR', 175, 178, { size: 14, color: C.amber, align: 'center', stroke: 'rgba(0,0,0,.6)' });
      if (I > 0.2) { ctx.fillStyle = 'rgba(120,180,230,.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(300 + i * 5 + Math.sin(t * 20 + i) * 2, 196, 3, 40 + i * 10); }
    }
    text(ctx, 'ROOF GUTTER', 175, 212, { size: 12, color: C.blue30, align: 'center' });
    // drain + garden
    ctx.fillStyle = '#1d2833'; ctx.fillRect(296, 430, 44, 10); text(ctx, 'STORM DRAIN', 318, 458, { size: 12, color: C.blue30, align: 'center' });
    const gm = clamp(this.garden, 0, 1);
    for (let i = 0; i < 7; i++) {
      const gx = 800 + i * 22, h = 18 + gm * 26 + Math.sin(i) * 4;
      ctx.strokeStyle = mixColor('#8a6d3b', '#2f9e55', gm); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(gx, GROUND); ctx.quadraticCurveTo(gx - 6, GROUND - h / 2, gx + (gm - 0.5) * 6, GROUND - h); ctx.stroke();
      if (gm > 0.6) { ctx.fillStyle = ['#ff7aa2', '#ffd23f', '#b07aff'][i % 3]; ctx.beginPath(); ctx.arc(gx + (gm - 0.5) * 6, GROUND - h, 5, 0, Math.PI * 2); ctx.fill(); }
    }
    text(ctx, 'LIBRARY GARDEN', 870, 375, { size: 13, color: C.blue30, align: 'center' });
    if (this.pump.on && this.tank.level > 0.02) for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(140,210,245,.7)'; ctx.beginPath(); ctx.arc(805 + ((t * 120 + i * 40) % 140), 350 + Math.sin(t * 9 + i) * 6, 3, 0, Math.PI * 2); ctx.fill(); }
    for (const p of this.parts) p.draw(ctx, t);
    // runoff quality badge
    const dirt = this.dirtiness();
    if (this.phase === 'storm' && I > 0.05) {
      ctx.fillStyle = mixColor('#8a5a2b', '#38b6e8', 1 - dirt); rr(ctx, 336, 230, 110, 46, 10); ctx.fill();
      text(ctx, dirt > 0.05 ? 'DIRTY RUNOFF' : 'CLEAN RUNOFF', 391, 252, { size: 15, color: '#fff', align: 'center' });
      text(ctx, dirt > 0.05 ? 'send to drain' : 'send to tank!', 391, 270, { size: 12, weight: 600, color: '#fff', align: 'center' });
    }
  }
  score() {
    const win = this.done === 'win';
    const quality = Math.max(0, 1500 - this.tank.dirty * 3000);
    const capture = Math.min(1200, this.clean / Math.max(1, this.clean + this.cleanMissed + this.overflow * 25) * 1200);
    const care = Math.max(0, 700 - this.spill * 300);
    const time = win ? Math.round(this.remaining * 15) : 0;
    const bonusDone = win && this.dirtyIn < 0.01;
    return {
      parts: [['Garden watered with rain', win ? 2000 : 0], ['Tank water quality', Math.round(win ? quality : 0)], ['Clean rain captured', Math.round(win ? capture : 0)], ['Gutter care', Math.round(win ? care : 0)], ['Time bonus', time], ['Bonus: first-flush hero', bonusDone ? 300 : 0]],
      bonusDone, achievements: bonusDone ? ['first-flush'] : [],
    };
  }
}

const def = {
  id: 'L4', num: 4, title: 'Catch the Storm', place: 'Library roof & rain harvesting tank',
  concept: 'Rainwater harvesting and first-flush diversion', timeLimit: 80, stars: [4300, 5300], maxScore: 7500, minSeconds: 40,
  bonus: 'Keep every dirty drop out of the tank',
  golden: [{ x: 640, y: 150 }, { x: 120, y: 380 }, { x: 900, y: 250 }],
  photo: 'assets/projects/melissa-txdot.jpg', photoCaption: 'Water harvesting tank · Melissa TxDOT',
  note: 'Harvested water is stored in tanks like this one and pumped out for irrigation, so less drinking water goes on the landscape. The control panels sit right next to the tank.',
};
def.create = (opts) => new CatchTheStorm(def, opts);
export default def;
