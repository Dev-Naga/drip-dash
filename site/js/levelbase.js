// Shared level framework. Each level file extends LevelBase and implements:
//   setup(), step(dt), render(ctx, t), tap(x, y), [press(x,y), release(x,y), drag(x,y)], score() -> breakdown
import { W, H, C, FONT, text, rr, clamp, rand, dist, Particles, Floaters, Dialog, drawDrip, blueprint } from './engine.js';
import { sfx } from './audio.js';

export class LevelBase {
  constructor(def, opts = {}) {
    this.def = def; this.opts = opts;
    this.parts = []; this.fx = new Particles(); this.fl = new Floaters(); this.dialog = new Dialog();
    this.t = 0; this.limit = def.timeLimit || 90; this.done = null; this.doneT = 0;
    this.bonusPts = 0; this.golden = { got: 0, total: 0, cur: null, next: rand(9, 14) };
    this.objective = ''; this.drip = { x: 120, y: 420, mood: 'happy', tx: 120, ty: 420, walk: false };
    this.stats = {}; this.shake = 0; this.events = [];
    this.setup();
  }
  add(p) { this.parts.push(p); return p; }
  say(s, hold) { this.dialog.say(s, hold); }
  bonus(n, x, y, label, color = '#fff') { this.bonusPts += n; this.fl.add(x, y, label || `+${n}`, color); }
  get remaining() { return Math.max(0, this.limit - this.t); }
  win(msg) { if (this.done) return; this.done = 'win'; this.doneMsg = msg || 'System restored!'; sfx.win(); this.restoreAll(); this.fx.burst(this.drip.x, this.drip.y - 40, 40, { up: 1, speed: 320 }); }
  fail(msg) { if (this.done) return; this.done = 'fail'; this.doneMsg = msg; sfx.fail(); this.drip.mood = 'worried'; }
  restoreAll() { for (const p of this.parts) p.restore?.(true); }
  moveDrip(x, y) { this.drip.tx = x; this.drip.ty = y; }

  update(dt) {
    if (this.done) { this.doneT += dt; this.fx.update(dt); this.fl.update(dt); for (const p of this.parts) p.update?.(dt); return; }
    this.t += dt;
    for (const p of this.parts) p.update?.(dt);
    this.step(dt);
    this.fx.update(dt); this.fl.update(dt); this.dialog.update(dt);
    if (this.shake > 0) this.shake -= dt;
    // Drip walks toward its target
    const d = this.drip, dx = d.tx - d.x, dy = d.ty - d.y;
    d.walk = Math.abs(dx) > 2; d.x += clamp(dx, -160 * dt, 160 * dt); d.y += clamp(dy, -200 * dt, 200 * dt);
    if (Math.abs(dx) > 2) d.flip = dx < 0;
    // golden drops
    const gd = this.golden;
    if (this.def.golden && !gd.cur) { gd.next -= dt; if (gd.next <= 0 && gd.total < this.def.golden.length) { gd.cur = { ...this.def.golden[gd.total], life: 3.6 }; gd.total++; gd.next = rand(10, 16); sfx.sparkle(); } }
    if (gd.cur) { gd.cur.life -= dt; if (gd.cur.life <= 0) gd.cur = null; }
    if (this.limit && this.t >= this.limit && !this.done) this.timeUp();
  }
  timeUp() { this.fail('Out of time!'); }

  down(x, y, id) {
    if (this.done) return;
    const gd = this.golden.cur;
    if (gd && dist(x, y, gd.x, gd.y) < 34) { this.golden.got++; this.golden.cur = null; this.bonus(100, gd.x, gd.y - 20, '+100 GOLDEN DROP', '#ffd23f'); sfx.valveOpen(); this.fx.burst(gd.x, gd.y, 18, { color: 'rgba(255,210,60,', up: 1 }); return; }
    this.press?.(x, y, id);
    this.tap?.(x, y, id);
  }
  up(x, y, id) { if (!this.done) this.release?.(x, y, id); }
  move(x, y, id) { if (!this.done) this.drag?.(x, y, id); }

  draw(ctx, t) {
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    blueprint(ctx, t);
    this.render(ctx, t);
    // golden drop
    const gd = this.golden.cur;
    if (gd) {
      const a = Math.min(1, gd.life), bob = Math.sin(t * 5) * 4;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(gd.x, gd.y + bob);
      ctx.fillStyle = 'rgba(255,210,60,.25)'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffc93a'; ctx.strokeStyle = '#a77b00'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.bezierCurveTo(-2, -12, -11, -4, -11, 3); ctx.arc(0, 3, 11, Math.PI, 0, true); ctx.bezierCurveTo(11, -4, 2, -12, 0, -16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-4, 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Drip
    const d = this.drip;
    if (!this.hideDrip) {
      const bounce = this.done === 'win' ? Math.abs(Math.sin(t * 8)) * 18 : 0;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 2, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
      drawDrip(ctx, d.x, d.y - bounce, d.r || 22, { t, walk: d.walk, flip: d.flip, mood: this.done === 'win' ? 'wow' : d.mood, outfit: this.opts.outfit, blink: Math.sin(t * 1.7 + 1) > 0.985, sy: 1 + Math.sin(t * 4) * 0.02 });
    }
    this.fx.draw(ctx); this.fl.draw(ctx);
    ctx.restore();
    this.hud(ctx, t);
    this.dialog.draw(ctx, t);
    if (this.done) this.banner(ctx, t);
  }

  hud(ctx, t) {
    ctx.fillStyle = 'rgba(4,18,34,.72)'; ctx.fillRect(0, 0, W, 46);
    ctx.fillStyle = C.aqua; ctx.fillRect(0, 46, W, 2);
    text(ctx, `${this.def.num}. ${this.def.title}`, 14, 30, { size: 22, font: FONT.display, color: '#fff' });
    text(ctx, this.objective, W / 2 + 40, 29, { size: 17, weight: 600, color: C.blue30, align: 'center', maxW: 420 });
    if (this.limit) {
      const r = this.remaining, low = r < 10;
      text(ctx, `${Math.floor(r / 60)}:${String(Math.floor(r % 60)).padStart(2, '0')}`, W - 110, 31, { size: 24, color: low ? C.red : '#fff', align: 'right' });
    }
    const gs = this.golden.got;
    if (gs) text(ctx, `● ${gs}`, W - 180, 31, { size: 18, color: '#ffd23f', align: 'right' });
  }

  banner(ctx, t) {
    const a = Math.min(1, this.doneT * 3);
    ctx.save(); ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = this.done === 'win' ? 'rgba(0,58,102,.85)' : 'rgba(80,10,10,.8)';
    ctx.fillRect(0, H / 2 - 60, W, 120);
    ctx.globalAlpha = a;
    text(ctx, this.done === 'win' ? this.doneMsg : 'Not quite!', W / 2, H / 2 + 4, { size: 46, font: FONT.display, color: '#fff', align: 'center' });
    text(ctx, this.done === 'win' ? 'Wellbrook is a little brighter.' : this.doneMsg, W / 2, H / 2 + 38, { size: 20, weight: 600, color: C.blue30, align: 'center' });
    ctx.restore();
  }

  // final numbers for results/leaderboard
  result() {
    const b = this.score();
    const golden = this.golden.got * 100;
    const parts = [...b.parts, ['Golden drops', golden]];
    if (this.bonusPts) parts.push(['Field bonuses', this.bonusPts]);
    const total = Math.min(this.def.maxScore || Infinity, Math.max(0, Math.round(parts.reduce((s, [, v]) => s + v, 0))));
    const th = this.def.stars;
    const stars = this.done !== 'win' ? 0 : total >= th[1] ? 3 : total >= th[0] ? 2 : 1;
    return { total, stars, parts, bonusDone: !!b.bonusDone, achievements: b.achievements || [], seconds: this.t, golden: this.golden.got };
  }
}
