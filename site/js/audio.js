// Synthesized sound effects + a soft pump hum (no audio files to download).
import { store } from './api.js';

let ctx = null;
let muted = store.get('dripdash.muted', false);
let hum = null;

function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone({ f0, f1 = f0, dur = 0.12, type = 'sine', vol = 0.15, delay = 0 }) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.2, vol = 0.12, freq = 1200, delay = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + delay);
}

export const sfx = {
  unlock() { ac(); },
  get muted() { return muted; },
  toggle() { muted = !muted; store.set('dripdash.muted', muted); if (muted) { this.humSet(0); ambience.set({ on: false }); } return muted; },
  // --- Drip Dash (runner) ---
  jump() { tone({ f0: 420, f1: 760, dur: 0.12, type: 'triangle', vol: 0.12 }); },
  jump2() { tone({ f0: 560, f1: 980, dur: 0.12, type: 'triangle', vol: 0.12 }); },
  slide() { tone({ f0: 300, f1: 140, dur: 0.16, type: 'sine', vol: 0.12 }); },
  drop(combo = 1) { const f = 880 + Math.min(combo, 8) * 60; tone({ f0: f, f1: f * 1.5, dur: 0.07, type: 'sine', vol: 0.09 }); },
  valve() { [0, 0.07, 0.14].forEach((d, i) => tone({ f0: 660 + i * 220, dur: 0.1, type: 'square', vol: 0.06, delay: d })); },
  power() { [0, 0.06, 0.12, 0.18].forEach((d, i) => tone({ f0: 520 + i * 160, dur: 0.12, type: 'triangle', vol: 0.1, delay: d })); },
  shield() { tone({ f0: 200, f1: 90, dur: 0.25, type: 'sawtooth', vol: 0.08 }); },
  hit() { tone({ f0: 260, f1: 60, dur: 0.45, type: 'sawtooth', vol: 0.14 }); },
  zone() { [0, 0.1].forEach((d, i) => tone({ f0: 500 + i * 250, dur: 0.18, type: 'triangle', vol: 0.08, delay: d })); },
  // --- Bring Back the Flow ---
  tap() { tone({ f0: 700, f1: 900, dur: 0.05, type: 'triangle', vol: 0.06 }); },
  valveOpen() { noise(0.12, 0.12, 900); tone({ f0: 300, f1: 520, dur: 0.15, type: 'triangle', vol: 0.1, delay: 0.05 }); },
  valveClose() { noise(0.12, 0.12, 700); tone({ f0: 420, f1: 240, dur: 0.15, type: 'triangle', vol: 0.1, delay: 0.05 }); },
  pumpOn() { tone({ f0: 80, f1: 220, dur: 0.6, type: 'sawtooth', vol: 0.05 }); },
  pumpOff() { tone({ f0: 220, f1: 60, dur: 0.6, type: 'sawtooth', vol: 0.05 }); },
  splash() { noise(0.25, 0.1, 2500); },
  sparkle() { [0, 0.06, 0.12].forEach((d, i) => tone({ f0: 1200 + i * 300, dur: 0.08, type: 'sine', vol: 0.05, delay: d })); },
  good() { tone({ f0: 660, f1: 990, dur: 0.12, type: 'triangle', vol: 0.09 }); },
  bad() { tone({ f0: 220, f1: 140, dur: 0.25, type: 'square', vol: 0.06 }); },
  alarm() { [0, 0.18].forEach((d) => tone({ f0: 880, f1: 660, dur: 0.14, type: 'square', vol: 0.05, delay: d })); },
  hammer() { noise(0.35, 0.25, 180); tone({ f0: 120, f1: 50, dur: 0.4, type: 'square', vol: 0.12 }); },
  beat(n = 0) { const f = [523, 587, 659, 784, 880][n % 5]; tone({ f0: f, dur: 0.25, type: 'triangle', vol: 0.1 }); tone({ f0: f * 2, dur: 0.15, type: 'sine', vol: 0.03 }); },
  click() { tone({ f0: 1500, dur: 0.03, type: 'square', vol: 0.02 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone({ f0: f, dur: 0.22, type: 'triangle', vol: 0.1, delay: i * 0.11 })); },
  fail() { [392, 330, 262].forEach((f, i) => tone({ f0: f, dur: 0.25, type: 'triangle', vol: 0.09, delay: i * 0.14 })); },
  star(i) { tone({ f0: 700 + i * 200, f1: 1100 + i * 200, dur: 0.18, type: 'triangle', vol: 0.1 }); },
  // continuous pump hum, level 0..1
  humSet(level) {
    const a = ctx; if (!a) return;
    if (!hum) {
      if (level <= 0 || muted) return;
      const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 400; g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g).connect(a.destination); o.start(); o2.start();
      hum = { o, o2, g };
    }
    const l = muted ? 0 : level;
    hum.g.gain.setTargetAtTime(l * 0.035, a.currentTime, 0.15);
    hum.o.frequency.setTargetAtTime(45 + l * 70, a.currentTime, 0.2);
    hum.o2.frequency.setTargetAtTime(90 + l * 140, a.currentTime, 0.2);
  },
};

// ---------------------------------------------------------------- park ambience (Drip Run)
// A looping filtered-noise "fountain" bed, plus birdsong by day and crickets in the evening. All synthesized.
let amb = null;
function ambNodes() {
  const a = ac(); if (!a) return null;
  if (amb) return amb;
  const len = a.sampleRate * 3, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.06 * w) / 1.06; d[i] = w * 0.6 + last * 2.4; }
  const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  const g = a.createGain(); g.gain.value = 0;
  src.connect(bp).connect(lp).connect(g).connect(a.destination); src.start();
  amb = { g, birds: false, crickets: false, nextBird: 0, nextCricket: 0 };
  return amb;
}
export const ambience = {
  // cfg: { on, water: 0..1, birds, crickets }
  set(cfg) {
    if (!cfg.on || muted) { if (amb && ctx) amb.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); if (amb) { amb.birds = amb.crickets = false; } return; }
    const n = ambNodes(); if (!n) return;
    n.g.gain.setTargetAtTime(0.045 * (cfg.water ?? 0.6), ctx.currentTime, 0.6);
    n.birds = !!cfg.birds; n.crickets = !!cfg.crickets;
  },
  tick() {
    if (!amb || muted || !ctx) return;
    const now = ctx.currentTime;
    if (amb.birds && now > amb.nextBird) {
      amb.nextBird = now + 1.6 + Math.random() * 3.5;
      const f = 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) tone({ f0: f + Math.random() * 300, f1: f * (0.75 + Math.random() * 0.2), dur: 0.07, type: 'sine', vol: 0.018, delay: i * 0.09 });
    }
    if (amb.crickets && now > amb.nextCricket) {
      amb.nextCricket = now + 0.9 + Math.random() * 0.6;
      for (let i = 0; i < 3; i++) tone({ f0: 4300, f1: 4200, dur: 0.035, type: 'triangle', vol: 0.008, delay: i * 0.06 });
    }
  },
};
