// Level 1 — Wake the Water: reservoir intake → pump → ground storage tank.
// Teaches: valves, starting a pump (never dry), tank level bands, intake screens.
import { C, text, rr, clamp, rand, inRect } from '../engine.js';
import { LevelBase } from '../levelbase.js';
import { Pipe, Valve, Pump, Meter, Tank } from '../kit.js';
import { sfx } from '../audio.js';

const GROUND = 440;

class WakeTheWater extends LevelBase {
  setup() {
    this.suction = this.add(new Pipe({ pts: [[205, 420], [470, 420], [470, 412]], w: 16 }));
    this.discharge = this.add(new Pipe({ pts: [[470, 346], [470, 140], [765, 140], [765, 168]], w: 16 }));
    this.outlet = this.add(new Pipe({ pts: [[830, 405], [930, 405]], w: 12 }));
    this.v1 = this.add(new Valve({ x: 300, y: 420, label: 'SUCTION', hint: true }));
    this.v2 = this.add(new Valve({ x: 610, y: 140, label: 'DISCHARGE' }));
    this.pump = this.add(new Pump({ x: 470, y: 380, label: 'PUMP' }));
    this.meter = this.add(new Meter({ x: 600, y: 300, r: 42, max: 120, bands: [[0, 40, C.amber], [40, 75, C.green], [75, 120, C.red]], label: 'DISCHARGE' }));
    this.tank = this.add(new Tank({ x: 700, y: 170, w: 130, h: 250, level: 0.12, band: [0.7, 0.88], label: 'GROUND STORAGE TANK' }));
    this.screen = { x: 182, y: 392, w: 32, h: 56, clog: 0 };
    this.nextLeaf = 12;
    this.waste = 0; this.dryMax = 0; this.deadhead = 0; this.clears = 0; this.stage = 0;
    this.drip = { ...this.drip, x: 236, y: GROUND, tx: 236, ty: GROUND };
    this.objective = 'Open the suction valve';
    this.say('Drip! Lightning fried the Heartboard and every system in Wellbrook went quiet. Let\'s wake the water. Tap the SUCTION valve.', 6);
  }
  tap(x, y) {
    if (inRect(x, y, { x: this.screen.x - 14, y: this.screen.y - 14, w: this.screen.w + 28, h: this.screen.h + 28 })) {
      if (this.screen.clog > 0.15) { this.screen.clog = 0; this.clears++; this.bonus(50, 200, 370, '+50 SCREEN CLEARED'); sfx.splash(); this.fx.burst(198, 410, 14, { color: 'rgba(120,180,90,' }); }
      return;
    }
    if (this.v1.hit(x, y)) { this.v1.open = !this.v1.open; this.v1.open ? sfx.valveOpen() : sfx.valveClose(); this.v1.restore(); this.suction.restore(); this.v1.hint = false; if (this.stage === 0 && this.v1.open) { this.stage = 1; this.pump.hint = true; this.objective = 'Start the pump'; this.say('Water\'s at the pump. Now tap the PUMP to start it. Never run one dry, it cooks itself.'); } return; }
    if (this.pump.hit(x, y)) { this.pump.on = !this.pump.on; this.pump.on ? sfx.pumpOn() : sfx.pumpOff(); this.pump.restore(); this.meter.restore(); this.pump.hint = false; if (this.stage === 1 && this.pump.on && this.v1.open) { this.stage = 2; this.v2.hint = true; this.objective = 'Open the discharge valve'; this.say('Hear that hum? Open the DISCHARGE valve and send it uphill to the tank.'); } return; }
    if (this.v2.hit(x, y)) { this.v2.open = !this.v2.open; this.v2.open ? sfx.valveOpen() : sfx.valveClose(); this.v2.restore(); this.discharge.restore(); this.tank.restore(); this.outlet.restore(); this.v2.hint = false; if (this.stage === 2 && this.v2.open) { this.stage = 3; this.objective = 'Fill to the green band, then stop the pump'; this.say('Water\'s moving! Fill the tank into the GREEN band, then tap the pump to stop it.', 6); } }
  }
  step(dt) {
    const { pump, v1, v2, tank, screen } = this;
    // leaves clog the intake screen
    if (this.t > this.nextLeaf && v1.open) { screen.clog = Math.min(1, screen.clog + 0.4); this.nextLeaf = this.t + rand(9, 13); if (screen.clog > 0.3) this.say('Leaves on the intake screen! Tap the screen to clear it.', 3); }
    const suctionOk = v1.open ? 1 - screen.clog * 0.8 : 0;
    const flow = pump.speed * suctionOk * (v2.open ? 1 : 0);
    this.flow = flow;
    // dry running / deadheading
    if (pump.on && !v1.open) { pump.heat = Math.min(1.2, pump.heat + dt * 0.45); if (pump.heat > 0.3) this.say('STOP! That pump has no water. Open suction or shut it off!', 2.5); }
    else if (pump.on && !v2.open && this.stage >= 2) { pump.heat = Math.min(1.2, pump.heat + dt * 0.12); this.deadhead += dt; }
    else pump.heat = Math.max(0, pump.heat - dt * 0.4);
    this.dryMax = Math.max(this.dryMax, pump.heat);
    if (pump.heat >= 1.2) return this.fail('The pump overheated. Always give a pump water before starting it.');
    // pressure
    this.meter.value = pump.speed * (v1.open ? (v2.open ? 58 - screen.clog * 20 : 100) : 15);
    this.meter.wobble = pump.heat;
    // tank fill + small draw to the fields
    tank.level += flow * 0.03 * dt - (tank.level > 0.02 ? 0.004 * dt : 0);
    if (tank.level > 1) { this.waste += tank.level - 1; tank.level = 1; if (Math.random() < 0.5) this.fx.burst(765 + rand(-50, 50), 172, 2, { speed: 140 }); this.say('Overflow! That\'s water we paid to pump. Stop the pump!', 2.5); }
    // pipes
    this.suction.fill = v1.open ? 1 : 0.4; this.suction.flow = flow;
    this.discharge.fill = Math.max(this.discharge.fill * (1 - dt * 0.5), flow > 0.05 ? 1 : 0); this.discharge.flow = flow;
    this.outlet.fill = tank.level > 0.05 ? 1 : 0; this.outlet.flow = tank.level > 0.05 ? 0.3 : 0;
    // drip follows the water
    if (this.stage >= 3) this.moveDrip(650, GROUND); else if (this.stage >= 1) this.moveDrip(380, GROUND);
    this.drip.mood = pump.heat > 0.3 || tank.level > 0.95 ? 'worried' : 'happy';
    if (this.stage === 3 && tank.level > 0.55 && tank.level < 0.7 && flow > 0) this.say('Almost there. Get ready to stop the pump.', 2);
    // win: level in band and not filling
    if (this.stage >= 3 && flow < 0.03 && tank.level >= tank.band[0] && tank.level <= tank.band[1]) this.win('Water is moving!');
    if (this.stage >= 3 && tank.level < 0.02 && !pump.on) this.objective = 'Start the pump again';
  }
  render(ctx, t) {
    // ground & reservoir
    ctx.fillStyle = '#123b5e'; ctx.fillRect(0, GROUND, 960, 100);
    ctx.fillStyle = '#1b4a70'; ctx.fillRect(0, GROUND, 960, 4);
    ctx.fillStyle = 'rgba(56,170,225,.55)';
    ctx.beginPath(); ctx.moveTo(0, 300);
    for (let x = 0; x <= 230; x += 10) ctx.lineTo(x, 300 + Math.sin(t * 2 + x / 30) * 3);
    ctx.lineTo(230, 300); ctx.lineTo(215, GROUND); ctx.lineTo(0, GROUND); ctx.fill();
    text(ctx, 'RESERVOIR', 100, 290, { size: 14, color: C.blue30, align: 'center' });
    // intake screen with leaves
    const s = this.screen;
    ctx.strokeStyle = '#9aa6b2'; ctx.lineWidth = 2; ctx.strokeRect(s.x, s.y, s.w, s.h);
    for (let yy = s.y + 6; yy < s.y + s.h; yy += 7) { ctx.beginPath(); ctx.moveTo(s.x, yy); ctx.lineTo(s.x + s.w, yy); ctx.stroke(); }
    for (let i = 0; i < Math.round(s.clog * 9); i++) { ctx.fillStyle = i % 2 ? '#7a9a3a' : '#a0782e'; ctx.beginPath(); ctx.ellipse(s.x + 6 + (i * 11) % 24, s.y + 8 + ((i * 17) % 44), 7, 4, i, 0, Math.PI * 2); ctx.fill(); }
    if (s.clog > 0.3) text(ctx, 'TAP TO CLEAR', s.x + s.w / 2, s.y - 8, { size: 13, color: C.amber, align: 'center' });
    text(ctx, 'INTAKE', s.x + s.w / 2, s.y + s.h + 16, { size: 12, color: C.blue30, align: 'center' });
    // field sprinkler beyond the tank
    if (this.outlet.fill > 0) { ctx.fillStyle = '#2f7d46'; ctx.fillRect(900, GROUND - 4, 60, 4); }
    for (const p of this.parts) p.draw(ctx, t);
    if (this.flow > 0.05) text(ctx, `${Math.round(this.flow * 300)} GPM`, 470, 125, { size: 15, color: C.aqua, align: 'center' });
  }
  score() {
    const win = this.done === 'win';
    const eff = Math.max(0, 1500 - this.waste * 4000 - this.deadhead * 40);
    const stab = Math.max(0, 1000 - this.dryMax * 900);
    const time = win ? Math.max(0, Math.round((this.limit - this.t) * 20)) : 0;
    const bonusDone = win && this.waste < 0.001;
    const ach = [];
    if (win) ach.push('first-flow');
    if (bonusDone) ach.push('no-overflow');
    return {
      parts: [['Tank filled', win ? 2000 : 0], ['Water efficiency', Math.round(win ? eff : 0)], ['Pump care', Math.round(win ? stab : 0)], ['Time bonus', time], ['Bonus: zero overflow', bonusDone ? 300 : 0]],
      bonusDone, achievements: ach,
    };
  }
}

const def = {
  id: 'L1', num: 1, title: 'Wake the Water', place: 'Reservoir & ground storage tank',
  concept: 'Valves, pumps and tank levels', timeLimit: 90, stars: [4400, 5500], maxScore: 7000, minSeconds: 12,
  bonus: 'Fill the tank without any overflow',
  golden: [{ x: 120, y: 360 }, { x: 640, y: 230 }, { x: 900, y: 300 }],
  photo: 'assets/projects/prosper-ms4.jpg', photoCaption: 'Ground storage tank · Prosper Middle School',
  note: 'Ground storage tanks like this one hold non-potable water so school fields stay green. Spot the water tower behind it? You\'ll meet one in Level 5.',
};
def.create = (opts) => new WakeTheWater(def, opts);
export default def;
