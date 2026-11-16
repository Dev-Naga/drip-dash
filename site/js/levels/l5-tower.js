// Level 5 — Lift to the Sky: fill the elevated tower, ride out the dinner rush, close the main without water hammer.
// Teaches: head vs. elevation (the pump must beat the height of the water), pump overheating, slow-closing valves.
import { C, text, rr, clamp, rand, dist } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Pipe, Pump, Tank, Meter, Valve, Btn } from '../kit.js';
import { sfx } from '../audio.js';

const GROUND = 440;

class LiftToTheSky extends LevelBase {
  setup() {
    this.ground = this.add(new Tank({ x: 40, y: 250, w: 110, h: 180, level: 0.9, label: 'GROUND TANK', life: 1, lifeTarget: 1 }));
    this.suction = this.add(new Pipe({ pts: [[150, 410], [300, 410]], w: 14, life: 1, lifeTarget: 1, fill: 1 }));
    this.riser = this.add(new Pipe({ pts: [[334, 380], [380, 380], [380, 95], [560, 95], [560, 112]], w: 16 }));
    this.townPipe = this.add(new Pipe({ pts: [[600, 190], [600, 300], [930, 300]], w: 14 }));
    this.pump = this.add(new Pump({ x: 300, y: 410, r: 30, label: 'BOOSTER PUMP', life: 1, lifeTarget: 1 }));
    this.tower = this.add(new Tank({ x: 520, y: 110, w: 160, h: 80, level: 0.12, band: [0.45, 1], style: 'tower', legBottom: GROUND, label: 'WATER TOWER' }));
    this.meter = this.add(new Meter({ x: 230, y: 180, r: 58, max: 100, unit: '% HEAD', label: 'PUMP PRESSURE', bands: [[0, 100, 'rgba(0,0,0,0)']] }));
    this.boost = this.add(new Btn({ x: 160, y: 300, w: 150, h: 60, label: 'HOLD TO PUMP', sub: 'booster', color: C.blue, hint: true }));
    this.main = this.add(new Valve({ x: 760, y: 300, label: 'TOWN MAIN' }));
    this.holding = null; this.heat = 0; this.heatMax = 0; this.trips = 0; this.tripT = 0;
    this.phase = 'fill'; this.rushT = 0; this.lowT = 0; this.closeHold = 0; this.closeId = null; this.hammer = false; this.mainDown = 0;
    this.lights = 0;
    this.drip = { ...this.drip, x: 230, y: GROUND, tx: 230, ty: GROUND };
    this.objective = 'Fill the water tower';
    this.say('The water tower is nearly empty. HOLD the booster to push water up. The higher the water, the harder the pump has to push. Don\'t let it overheat!', 7);
  }
  headNeeded() { return 0.42 + 0.36 * this.tower.level; }
  press(x, y, id) {
    if (this.boost.hit(x, y) || this.pump.hit(x, y)) { this.holding = id; this.boost.held = true; this.boost.hint = false; [this.riser, this.tower, this.meter].forEach((p) => p.restore()); return; }
    if (this.phase === 'close' && this.main.hit(x, y)) { this.closeId = id; this.mainDown = this.t; }
  }
  release(x, y, id) {
    if (id === this.holding) { this.holding = null; this.boost.held = false; }
    if (id === this.closeId) {
      this.closeId = null;
      if (this.t - this.mainDown < 0.35 && this.closeHold < 0.5 && this.main.open) {
        // slammed shut → water hammer
        this.main.open = false; this.hammer = true; this.shake = 0.8; sfx.hammer(); this.fx.burst(760, 300, 30, { speed: 300 });
        this.say('BANG! That\'s water hammer, a pressure shockwave from slamming a valve. Close mains slowly next time.', 6);
        this.finishClose();
      }
    }
  }
  finishClose() { this.main.open = false; this.main.closing = 0; this.townPipe.flow = 0; this.winAt = this.t + 0.9; }
  step(dt) {
    if (this.winAt && this.t >= this.winAt) return this.win(this.hammer ? 'Tower secured (with a bang)' : 'Smooth as glass!');
    const p = this.pump;
    // pump spool: holding drives speed up, release lets it coast down
    if (this.tripT > 0) { this.tripT -= dt; p.on = false; }
    else p.on = !!this.holding;
    p.target = 1;
    const speed = p.speed;
    if (speed > 0.93) { this.heat += dt * 0.55; if (this.heat > 0.5) this.say('Pump\'s running hot! Ease off, pulse it, don\'t pin it.', 3); }
    else this.heat = Math.max(0, this.heat - dt * 0.35);
    p.heat = this.heat; this.heatMax = Math.max(this.heatMax, this.heat);
    if (this.heat >= 1) { this.heat = 0.6; this.trips++; this.tripT = 3; sfx.alarm(); this.shake = 0.3; this.say('Thermal trip! The pump shut itself off to cool down. Three seconds lost.', 4); }
    const need = this.headNeeded();
    const lift = Math.max(0, speed - need) * 0.11;
    this.tower.level = Math.min(1.02, this.tower.level + lift * dt);
    this.meter.value = speed * 100; this.meter.wobble = this.heat;
    this.meter.bands = [[0, need * 100, 'rgba(255,90,79,.55)'], [need * 100, 93, 'rgba(61,220,132,.8)'], [93, 100, 'rgba(255,190,61,.9)']];
    this.riser.fill = lift > 0 ? 1 : Math.max(0.3, this.riser.fill - dt); this.riser.flow = lift > 0 ? Math.min(1, lift * 20) : 0;
    this.hum = speed * 0.8;
    this.ground.level = Math.max(0.3, this.ground.level - lift * 0.3 * dt);
    if (speed > 0.2 && speed < need && this.holding) this.say('Not enough pressure to lift water that high. Keep holding!', 2.5);
    // phases
    if (this.phase === 'fill') {
      this.objective = `Fill the tower above the line · ${Math.round(this.tower.level * 100)}%`;
      if (this.tower.level >= 0.8) {
        this.phase = 'rush'; this.main.open = true; this.main.restore(); this.townPipe.restore(); sfx.valveOpen();
        this.say('Dinner time! Everyone\'s cooking and showering. Keep the tower ABOVE the line for 30 seconds.', 5);
      }
    } else if (this.phase === 'rush') {
      this.rushT += dt;
      const demand = 0.022 * (1 + 0.6 * Math.sin(this.rushT * 0.9) + (this.rushT > 14 && this.rushT < 20 ? 0.9 : 0));
      this.tower.level = Math.max(0, this.tower.level - demand * dt);
      this.townPipe.fill = 1; this.townPipe.flow = 0.6 + demand * 15;
      this.lights = Math.min(1, this.lights + dt);
      if (this.tower.level < 0.45) { this.lowT += dt; this.say('Tower\'s below the line. Town pressure\'s dropping! Pump!', 2.5); }
      if (this.tower.level <= 0.02) return this.fail('The town ran dry.');
      if (this.rushT > 14 && this.rushT < 15) this.say('Everyone\'s watering lawns too! Demand spike!', 3);
      this.objective = `Keep the tower above the line · ${Math.ceil(30 - this.rushT)}s`;
      if (this.rushT >= 30) {
        this.phase = 'close'; this.main.hint = true;
        this.say('Storm warning. Isolate the tower. PRESS AND HOLD the TOWN MAIN to close it slowly. Slam it and you\'ll get water hammer!', 7);
      }
    } else if (this.phase === 'close') {
      this.objective = 'Hold the TOWN MAIN to close it slowly';
      this.townPipe.flow = this.main.open ? 0.6 * (1 - this.closeHold / 1.6) : 0;
      if (this.closeId != null && this.main.open) {
        this.closeHold += dt; this.main.closing = this.closeHold / 1.6; this.main.hint = false;
        if (this.closeHold >= 1.6) { sfx.valveClose(); this.finishClose(); }
      }
    }
    this.moveDrip(this.phase === 'fill' ? 330 : this.phase === 'rush' ? 470 : 720, GROUND);
    this.drip.mood = this.heat > 0.5 || (this.phase === 'rush' && this.tower.level < 0.45) ? 'worried' : 'happy';
  }
  timeUp() { this.fail('Time\'s up before the tower was secured.'); }
  render(ctx, t) {
    ctx.fillStyle = '#123b5e'; ctx.fillRect(0, GROUND, 960, 100);
    // hill + town
    ctx.fillStyle = 'rgba(93,133,183,.15)'; ctx.beginPath(); ctx.moveTo(420, GROUND); ctx.quadraticCurveTo(600, 380, 760, GROUND); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const hx = 790 + i * 42, hy = GROUND - 44 - (i % 2) * 8;
      ctx.fillStyle = '#5b6773'; ctx.fillRect(hx, hy, 36, GROUND - hy);
      ctx.fillStyle = '#3d4a57'; ctx.beginPath(); ctx.moveTo(hx - 4, hy); ctx.lineTo(hx + 18, hy - 18); ctx.lineTo(hx + 40, hy); ctx.fill();
      ctx.fillStyle = this.lights > 0 && (this.phase !== 'fill') ? `rgba(255,217,138,${this.tower.level > 0.3 ? 0.95 : 0.3})` : 'rgba(255,255,255,.08)';
      ctx.fillRect(hx + 8, hy + 12, 9, 10); ctx.fillRect(hx + 21, hy + 12, 9, 10);
    }
    text(ctx, 'WELLBROOK HOMES', 870, 470, { size: 12, color: C.blue30, align: 'center' });
    // head line on tower
    const tw = this.tower;
    text(ctx, `${Math.round(60 + tw.level * 40)} ft`, tw.x + tw.w / 2, tw.y + tw.h + 26, { size: 14, color: '#fff', align: 'center' });
    for (const p of this.parts) p.draw(ctx, t);
    // head-needed tick
    const a = this.meter.angle(this.headNeeded() * 100), m = this.meter;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m.x + Math.cos(a) * m.r * 0.9, m.y + Math.sin(a) * m.r * 0.9); ctx.lineTo(m.x + Math.cos(a) * (m.r + 12), m.y + Math.sin(a) * (m.r + 12)); ctx.stroke();
    text(ctx, 'needed to lift', m.x + 74, m.y - 40, { size: 12, color: C.blue30 });
    if (this.tripT > 0) text(ctx, `THERMAL TRIP ${this.tripT.toFixed(1)}s`, 300, 360, { size: 16, color: C.red, align: 'center' });
  }
  score() {
    const win = this.done === 'win';
    const stab = Math.max(0, 1500 - this.lowT * 120);
    const care = Math.max(0, 1200 - this.trips * 400 - this.heatMax * 300);
    const time = win ? Math.round(this.remaining * 15) : 0;
    const bonusDone = win && !this.hammer;
    return {
      parts: [['Tower filled & town supplied', win ? 2000 : 0], ['Town pressure held', Math.round(win ? stab : 0)], ['Pump care', Math.round(win ? care : 0)], ['Time bonus', time], ['Bonus: no water hammer', bonusDone ? 300 : 0]],
      bonusDone, achievements: bonusDone ? ['smooth-operator'] : [],
    };
  }
}

const def = {
  id: 'L5', num: 5, title: 'Lift to the Sky', place: 'Elevated water tower',
  concept: 'Pressure head, pump care and water hammer', timeLimit: 120, stars: [4200, 5200], maxScore: 7500, minSeconds: 45,
  bonus: 'Close the town main without water hammer',
  golden: [{ x: 460, y: 240 }, { x: 860, y: 200 }, { x: 120, y: 160 }],
  photo: 'assets/projects/prosper-ms4.jpg', photoCaption: 'Storage tank & water tower · Prosper, TX',
  note: 'Elevated towers use height to make pressure: every 2.31 ft of water is 1 PSI. Pumps that feed them have to overcome that head, just like your booster did.',
};
def.create = (opts) => new LiftToTheSky(def, opts);
export default def;
