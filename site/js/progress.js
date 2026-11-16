// Local progress: best scores, stars, achievements, outfits, golden drops.
import { store } from './api.js';

const KEY = 'dripdash.v2.progress';
const blank = () => ({ levels: {}, achievements: {}, outfit: 'none', golden: 0, seenStory: false });

export const ACHIEVEMENTS = [
  { id: 'first-flow', name: 'First Flow', desc: 'Wake the water in Wellbrook.' },
  { id: 'no-overflow', name: 'Not a Drop Wasted', desc: 'Fill the storage tank with zero overflow.' },
  { id: 'pressure-pro', name: 'Pressure Pro', desc: 'Hold the green band for 45 seconds in the pump room.' },
  { id: 'lead-lag', name: 'Lead & Lag', desc: 'Bring pump 2 online for the big demand spike.' },
  { id: 'night-owl', name: 'Night Owl', desc: 'Finish the fields with 20+ seconds before sunrise.' },
  { id: 'wind-wise', name: 'Wind Wise', desc: 'Water the fields without wasting water in the wind.' },
  { id: 'first-flush', name: 'First-Flush Hero', desc: 'Keep every dirty drop out of the rain tank.' },
  { id: 'smooth-operator', name: 'Smooth Operator', desc: 'Close the tower main slowly, without water hammer.' },
  { id: 'crystal-clear', name: 'Crystal Clear', desc: 'Keep the fountain clear through the whole show.' },
  { id: 'showstopper', name: 'Showstopper', desc: 'Hit 90% of the fountain show beats.' },
  { id: 'valley-restored', name: 'Valley Restored', desc: 'Survive the Evening Rush and rebuild the Heartboard.' },
  { id: 'golden-10', name: 'Golden Collector', desc: 'Collect 10 golden drops.' },
  { id: 'stars-21', name: '21-Star Engineer', desc: 'Earn 3 stars on every level.' },
];

export const OUTFITS = [
  { id: 'none', name: 'Classic Drip', stars: 0 },
  { id: 'hardhat', name: 'Hard Hat', stars: 5 },
  { id: 'vest', name: 'Hi-Vis Vest', stars: 10 },
  { id: 'aqua', name: '25th Anniversary Aqua', stars: 15 },
  { id: 'gold', name: 'Golden Drip', stars: 21 },
];

let state = Object.assign(blank(), store.get(KEY, {}));
const save = () => store.set(KEY, state);

export const progress = {
  get state() { return state; },
  level(id) { return state.levels[id] || { best: 0, stars: 0, done: false, plays: 0 }; },
  totalStars() { return Object.values(state.levels).reduce((s, l) => s + (l.stars || 0), 0); },
  valleyScore() { return Object.values(state.levels).reduce((s, l) => s + (l.best || 0), 0); },
  unlocked(levels, i) { return i === 0 || this.level(levels[i - 1].id).done; },
  record(def, r) {
    const prev = this.level(def.id);
    const out = { newBest: r.total > prev.best && r.stars > 0, newAch: [], prevStars: prev.stars };
    state.levels[def.id] = {
      best: r.stars > 0 ? Math.max(prev.best, r.total) : prev.best,
      stars: Math.max(prev.stars, r.stars), done: prev.done || r.stars > 0, plays: (prev.plays || 0) + 1,
    };
    state.golden += r.golden || 0;
    const ach = [...(r.achievements || [])];
    if (state.golden >= 10) ach.push('golden-10');
    if (this.totalStars() >= 21) ach.push('stars-21');
    for (const a of ach) if (!state.achievements[a]) { state.achievements[a] = Date.now(); out.newAch.push(a); }
    save();
    return out;
  },
  setOutfit(id) { state.outfit = id; save(); },
  outfitUnlocked(o) { return this.totalStars() >= o.stars; },
  markStory() { state.seenStory = true; save(); },
  reset() { state = blank(); save(); },
};
