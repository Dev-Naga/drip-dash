// Tiny synthesized sound effects (no audio files to download).
import { store } from './api.js';

let ctx = null;
let muted = store.get('dripdash.muted', false);

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ f0, f1 = f0, dur = 0.12, type = 'sine', vol = 0.18, delay = 0 }) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ac(); },
  get muted() { return muted; },
  toggle() { muted = !muted; store.set('dripdash.muted', muted); return muted; },
  jump() { tone({ f0: 420, f1: 760, dur: 0.12, type: 'triangle', vol: 0.12 }); },
  jump2() { tone({ f0: 560, f1: 980, dur: 0.12, type: 'triangle', vol: 0.12 }); },
  slide() { tone({ f0: 300, f1: 140, dur: 0.16, type: 'sine', vol: 0.12 }); },
  drop(combo = 1) { const f = 880 + Math.min(combo, 8) * 60; tone({ f0: f, f1: f * 1.5, dur: 0.07, type: 'sine', vol: 0.09 }); },
  valve() { [0, 0.07, 0.14].forEach((d, i) => tone({ f0: 660 + i * 220, dur: 0.1, type: 'square', vol: 0.06, delay: d })); },
  power() { [0, 0.06, 0.12, 0.18].forEach((d, i) => tone({ f0: 520 + i * 160, dur: 0.12, type: 'triangle', vol: 0.1, delay: d })); },
  shield() { tone({ f0: 200, f1: 90, dur: 0.25, type: 'sawtooth', vol: 0.08 }); },
  hit() { tone({ f0: 260, f1: 60, dur: 0.45, type: 'sawtooth', vol: 0.14 }); },
  zone() { [0, 0.1].forEach((d, i) => tone({ f0: 500 + i * 250, dur: 0.18, type: 'triangle', vol: 0.08, delay: d })); },
};
