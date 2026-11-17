// Water Run — 3D three-lane runner along "The Water Trail": eight real inCon-trol projects in a row.
// Story: the Trail's fountains are running dry. Drip races from Melissa Lake Park's splash pad to
// Commons at Agora to switch on the evening show, waking every water feature as it passes.
// The world scrolls toward the camera (+Z); Drip stays at z = 0 and switches lanes, jumps and slides.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sfx } from './audio.js?v=wr10';
import { PROJECTS, photoSources } from './run-projects.js?v=wr10';

// Scoring rules — the server checks scores against these (supabase/schema.sql → submit_water_run).
export const RULES = { DROP: 10, VALVE: 100, POWERUP: 25, MULT: 2, START_SPEED: 13, MAX_SPEED: 30, BOOST: 1.5 };

const LANE = 2.2;
const STEP = 1 / 120;
const SEG_LEN = 30, SEG_COUNT = 6, SPAWN_Z = -125, KILL_Z = 12;
const GRAVITY = -30, JUMP_V = 10.2, SLIDE_T = 0.7;
const STAND_H = 1.35, SLIDE_H = 0.62;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const SHADOWS = !MOBILE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the journey: one zone per project, sunrise → evening
export const ZONE_LEN = 300;                      // metres per stop
export const JOURNEY = ZONE_LEN * PROJECTS.length; // 2,400 m to the destination
const LOOK = {
  melissa: { time: 'Sunrise', top: 0x6fb2e6, bottom: 0xffdcb0, sun: 0xffd9a8, sunI: 2.4, hemi: 1.0, sunDir: [-0.6, 0.45, -0.7] },
  epic: { time: 'Morning', top: 0x4f9fe2, bottom: 0xd3eafa, sun: 0xfff1dc, sunI: 2.8, hemi: 1.05, sunDir: [-0.5, 0.7, -0.4] },
  mckinney: { time: 'Late morning', top: 0x4699df, bottom: 0xd8edfb, sun: 0xffffff, sunI: 3.0, hemi: 1.1, sunDir: [-0.35, 0.85, -0.2] },
  olympus: { time: 'Noon', top: 0x4396de, bottom: 0xe2f1fb, sun: 0xffffff, sunI: 3.1, hemi: 1.1, sunDir: [-0.2, 0.95, 0.1] },
  aggie: { time: 'Afternoon', top: 0x58a3dd, bottom: 0xe6eef3, sun: 0xfff0d2, sunI: 2.8, hemi: 1.0, sunDir: [0.35, 0.8, -0.2] },
  arboretum: { time: 'Golden hour · autumn', top: 0x6f9fd2, bottom: 0xf4d9b8, sun: 0xffd7a0, sunI: 2.5, hemi: 0.95, sunDir: [0.55, 0.55, -0.4] },
  chase: { time: 'Sunset', top: 0x4c5f9e, bottom: 0xff9a5e, sun: 0xff9a52, sunI: 2.1, hemi: 0.75, sunDir: [0.7, 0.25, -0.7] },
  agora: { time: 'Evening', top: 0x070d24, bottom: 0x23295a, sun: 0x8fa6ff, sunI: 0.5, hemi: 0.3, sunDir: [0.3, 0.8, 0.3], night: true },
};
// hand-planned surroundings for each stop: [left, right] scene for each 30 m section (k = 0..9)
const LAYOUTS = {
  melissa: [['garden', 'grove'], ['splashKids', 'playground'], ['picnic', 'kiosk'], ['grove', 'splashKids'], ['pavilion', 'benches'], ['playground', 'picnic'], ['splashKids', 'grove'], ['benches', 'pavilion'], ['picnic', 'splashKids'], ['kiosk', 'garden']],
  epic: [['grove', 'benches'], ['garden', 'kiosk'], ['grove', 'fountain'], ['benches', 'garden'], ['picnic', 'kiosk'], ['grove', 'benches'], ['garden', 'fountain'], ['grove', 'kiosk'], ['benches', 'garden'], ['grove', 'benches']],
  mckinney: [['garden', 'fountain'], ['benches', 'garden'], ['grove', 'benches'], ['fountain', 'grove'], ['garden', 'benches'], ['benches', 'fountain'], ['grove', 'garden'], ['garden', 'benches'], ['fountain', 'grove'], ['benches', 'garden']],
  olympus: [['grove', 'grove'], ['benches', 'kiosk'], ['garden', 'benches'], ['grove', 'garden'], ['benches', 'grove'], ['kiosk', null], ['garden', 'benches'], ['grove', 'kiosk'], ['benches', 'garden'], ['grove', 'grove']],
  aggie: [['grove', 'picnic'], ['picnic', 'playground'], ['benches', 'grove'], ['playground', 'picnic'], ['grove', 'benches'], ['picnic', 'grove'], ['playground', 'picnic'], ['grove', 'benches'], ['picnic', 'playground'], ['benches', 'grove']],
  arboretum: [['garden', 'grove'], ['grove', 'picnic'], ['picnic', 'garden'], ['garden', 'grove'], ['playground', 'benches'], ['grove', 'picnic'], ['benches', 'garden'], ['picnic', 'grove'], ['garden', 'playground'], ['grove', 'benches']],
  chase: [['benches', 'kiosk'], ['fountain', null], ['garden', 'benches'], ['kiosk', 'garden'], ['benches', 'fountain'], ['garden', 'kiosk'], ['fountain', null], ['benches', 'garden'], ['kiosk', 'benches'], ['garden', 'fountain']],
  agora: [['pavilion', 'splashKids'], ['splashKids', 'kiosk'], ['benches', 'splashKids'], ['kiosk', 'pavilion'], ['splashKids', 'benches'], ['grove', 'splashKids'], ['splashKids', 'kiosk'], ['pavilion', 'benches'], ['splashKids', 'grove'], ['kiosk', 'splashKids']],
};
// atmosphere per stop: floating particles, how "watery" it sounds, and what's on the horizon
const ATMOS = {
  melissa: { fx: 'sparkle', water: 0.8, back: 'park', hill: 0x7fae63 },
  epic: { fx: 'pollen', water: 0.6, back: 'town', hill: 0x7fa36a },
  mckinney: { fx: 'pollen', water: 0.5, back: 'town', hill: 0x86a56c },
  olympus: { fx: 'mist', water: 0.9, back: 'city', hill: 0x7c9f6a },
  aggie: { fx: 'pollen', water: 0.6, back: 'stadium', hill: 0x6f9e5e },
  arboretum: { fx: 'leaves', water: 0.9, back: 'autumn', hill: 0x9a8a55 },
  chase: { fx: 'motes', water: 0.7, back: 'city', hill: 0x8a7a68 },
  agora: { fx: 'fireflies', water: 0.8, back: 'nightcity', hill: 0x1b2438 },
};
export const ZONES = PROJECTS.map((p, i) => ({ ...p, idx: i, ...LOOK[p.id], ...ATMOS[p.id] }));
export const zoneAt = (d) => ZONES[Math.floor(Math.max(0, d) / ZONE_LEN) % ZONES.length];

const POWERS = {
  shield: { label: 'Pressure Regulator', note: 'blocks one hit', col: 0x00c1d5, dur: 0 },
  magnet: { label: 'Smart Controller', note: 'pulls in drops', col: 0xff5a5a, dur: 8 },
  mult: { label: 'Flow Meter', note: 'double points', col: 0x7ed957, dur: 10 },
  boost: { label: 'Jet Boost', note: 'super speed, can\'t be hit', col: 0xffc845, dur: 3 },
};

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- shared geometry / material / texture caches
const GEO = new Map(), MAT = new Map(), BAKED = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
function mat(color, o = {}) {
  const key = `${color}|${o.rough ?? ''}|${o.metal ?? ''}|${o.emissive || 0}|${o.ei ?? ''}|${o.opacity || 1}|${o.map ? o.map.uuid : ''}|${o.flat ? 1 : 0}|${o.side || 0}|${o.env ?? ''}`;
  if (!MAT.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.82, metalness: o.metal ?? 0, flatShading: !!o.flat, map: o.map || null });
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
    if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    if (o.side) m.side = THREE.DoubleSide;
    if (o.env != null) m.envMapIntensity = o.env;
    MAT.set(key, m);
  }
  return MAT.get(key);
}
// sizes are snapped to 0.05 so randomised scenery reuses a small set of shapes (no per-segment leaks)
const q = (v) => Math.round(v * 20) / 20;
const box = (w, h, d) => { w = q(w); h = q(h); d = q(d); return geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)); };
const cyl = (rt, rb, h, s = 12) => { rt = q(rt); rb = q(rb); h = q(h); return geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)); };
const sph = (r, s = 12) => { r = q(r); return geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0))); };
const ico = (r, d = 1) => { r = Math.max(0.05, Math.round(r * 10) / 10); return geo(`i${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)); };
const cone = (r, h, s = 12) => { r = q(r); h = q(h); return geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s)); };
const plane = (w, h) => { w = q(w); h = q(h); return geo(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)); };
const torus = (r, t, a = TAU, rs = 8, ts = 24) => geo(`t${r},${t},${a},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, rs, ts, a));
function cachedMat(key, make) { if (!MAT.has(key)) MAT.set(key, make()); return MAT.get(key); }
function M(g, m, x = 0, y = 0, z = 0, parent = null, shadow = false) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
  if (shadow && SHADOWS) o.castShadow = true;
  if (parent) parent.add(o);
  return o;
}
function flat(g, m, x, y, z, parent) { const o = M(g, m, x, y, z, parent); o.rotation.x = -Math.PI / 2; o.receiveShadow = SHADOWS; return o; }

// teardrop profile used for Drip and the collectible drops
const DROP_GEO = (() => {
  const pts = [], r = 0.48, cy = 0.5;
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * (Math.PI / 2 + Math.PI / 6); pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), cy + r * Math.sin(a))); }
  const sx = r * Math.cos(Math.PI / 6), sy = cy + r * Math.sin(Math.PI / 6);
  for (let i = 1; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.max(0.001, sx * (1 - t) * (1 - t * 0.35)), sy + (1.42 - sy) * t)); }
  return new THREE.LatheGeometry(pts, 28);
})();

// ---- procedural textures (drawn once on small canvases)
function canvasTex(w, h, draw, repeat = [1, 1], color = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 8; if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (g, w, h, n, cols) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } };
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const rep = [1, SEG_LEN / 7.6];
  TEX = {
    // walkway surfaces, one per project, laid like real paving (no rails, no painted lanes)
    melissa: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2aa3c8'; g.fillRect(0, 0, w, h);
      const blobs = [['#ffcc4d', 60, 50, 46], ['#ff7a59', 200, 120, 34], ['#7ed957', 90, 190, 40], ['#5d85b7', 210, 230, 28], ['#ffcc4d', 230, 20, 20]];
      for (const [c, x, y, r] of blobs) { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r, r * 0.8, x, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 150); g.bezierCurveTo(80, 110, 170, 190, 256, 150); g.stroke();
      speckle(g, w, h, 2500, ['rgba(255,255,255,.18)', 'rgba(0,0,0,.12)']);
    }, rep),
    epic: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5b6068'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, ['#70757c', '#474b52', '#8a8f95']);
      g.strokeStyle = '#3c4046'; g.lineWidth = 2; for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 * 42; x < w + 84; x += 84) g.strokeRect(x - 42, y, 84, 64);
    }, rep),
    mckinney: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#d2cdc2'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, ['#c4beb2', '#dcd8cf']);
      g.strokeStyle = '#a9a396'; g.lineWidth = 2; for (let y = 0; y < h; y += 128) { g.strokeRect(0, y, 128, 128); g.strokeRect(128, y, 128, 128); }
      g.fillStyle = 'rgba(120,110,95,.08)'; g.beginPath(); g.ellipse(70, 180, 40, 22, 0.4, 0, TAU); g.fill();
    }, rep),
    olympus: canvasTex(256, 256, (g, w, h) => {
      const bands = [['#f1efe8', 30], ['#8e989f', 14], ['#f1efe8', 22], ['#6f787f', 10], ['#f1efe8', 36], ['#8e989f', 14], ['#f1efe8', 26], ['#6f787f', 10], ['#f1efe8', 30], ['#8e989f', 14], ['#f1efe8', 50]];
      let x = 0; for (const [c, bw] of bands) { g.fillStyle = c; g.fillRect(x, 0, bw, h); x += bw; }
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      speckle(g, w, h, 1500, ['rgba(0,0,0,.06)']);
    }, rep),
    aggie: canvasTex(256, 256, (g, w, h) => {
      for (let y = 0; y < h; y += 16) { const v = 110 + ((y * 37) % 40); g.fillStyle = `rgb(${v + 40},${v + 8},${v - 30})`; g.fillRect(0, y, w, 14); g.fillStyle = 'rgba(40,25,10,.6)'; g.fillRect(0, y + 14, w, 2); }
      speckle(g, w, h, 1500, ['rgba(60,35,10,.25)']);
    }, rep),
    arboretum: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#8f8576'; g.fillRect(0, 0, w, h);
      const R = mulberry(5);
      for (let i = 0; i < 26; i++) {
        const cx = R() * w, cy = R() * h, r = 18 + R() * 22, n = 6;
        g.fillStyle = ['#c9b99a', '#b8a585', '#d6c7a8', '#a9997d'][i % 4]; g.beginPath();
        for (let k = 0; k < n; k++) { const a = (k / n) * TAU + R() * 0.5, rr = r * (0.75 + R() * 0.3); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        g.closePath(); g.fill();
      }
      speckle(g, w, h, 1500, ['rgba(0,0,0,.1)']);
    }, rep),
    chase: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#e3d5bd'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(170,150,120,.35)'; g.lineWidth = 1; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(0, i * 15 + 4); g.bezierCurveTo(80, i * 15, 160, i * 15 + 8, 256, i * 15 + 3); g.stroke(); }
      g.strokeStyle = '#bba98c'; g.lineWidth = 2; for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) g.strokeRect(x, y, 128, 128);
    }, rep),
    agora: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, ['#353a42', '#24272d']);
      g.strokeStyle = '#1b1e23'; g.lineWidth = 2; for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) g.strokeRect(x, y, 64, 64);
      for (let y = 32; y < h; y += 64) for (let x = 32; x < w; x += 128) { g.fillStyle = '#7a828c'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
    }, rep),
    grass: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#5f9e45'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, ['#6fae52', '#548f3c', '#79b85b']); }, [12, 6]),
    gravel: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b9ad98'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, ['#a49883', '#cfc4b0', '#8f8471']); }, [10, 5]),
    // brick + glass facade for building backdrops
    facade: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#9b4f35'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,25,15,.35)'; for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let y = 16; y < h; y += 64) for (let x = 12; x < w; x += 48) { const gr = g.createLinearGradient(x, y, x + 30, y + 40); gr.addColorStop(0, '#9cc4dc'); gr.addColorStop(1, '#3d5f78'); g.fillStyle = gr; g.fillRect(x, y, 30, 40); g.fillStyle = '#222'; g.fillRect(x + 14, y, 2, 40); }
    }, [2, 1]),
    glass: canvasTex(128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#a9c8dd'); gr.addColorStop(1, '#4c6e88'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(30,40,50,.6)'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 20) g.fillRect(0, y, w, 2);
    }, [3, 3]),
    windows: canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h); const R = mulberry(21); for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { if (R() < 0.45) { g.fillStyle = R() < 0.7 ? '#ffd88a' : '#bfe6ff'; g.fillRect(x, y, 7, 8); } } }, [2, 3]),
    blanket: canvasTex(128, 128, (g, w, h) => { for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#ffffff' : '#e8402e'; g.fillRect(x, y, 16, 16); } }),
    awning: canvasTex(128, 64, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#ffffff' : '#e8402e'; g.fillRect(x, 0, 16, h); } }),
    stone: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#8c8578'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, ['#a39b8d', '#756f63', '#b5ad9e']); }),
  };
  // water: a bumpy normal map that scrolls, plus falling-water streaks
  TEX.waterN = (() => {
    const N = 128, hgt = new Float32Array(N * N), R = mulberry(9);
    for (let k = 0; k < 40; k++) { const cx = R() * N, cy = R() * N, r = 6 + R() * 18, a = R() - 0.5; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let dx = Math.abs(x - cx), dy = Math.abs(y - cy); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); const d = Math.hypot(dx, dy); if (d < r) hgt[y * N + x] += a * (1 + Math.cos((d / r) * Math.PI)); } }
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const hx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], hy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      const nx = -hx * 2, ny = -hy * 2, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t;
  })();
  TEX.streak = canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const x = Math.random() * w, a = 0.25 + Math.random() * 0.6; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(220,245,255,${a * 0.6})`); gr.addColorStop(1, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(x, 0, 1 + Math.random() * 3, h); }
  }, [1, 1]);
  return TEX;
}
// water materials (shared, animated once per frame)
let WM = null;
function waterMats() {
  if (WM) return WM;
  const T = textures();
  const surface = (color, rough = 0.06) => { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15, normalMap: T.waterN, transparent: true, opacity: 0.9, envMapIntensity: 1.6 }); m.normalScale.set(0.55, 0.55); return m; };
  const falling = (color, emissive = 0x18465a) => { const t = T.streak.clone(); t.needsUpdate = true; t.repeat.set(2, 1); const m = new THREE.MeshStandardMaterial({ color, map: t, emissive, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1 }); return m; };
  WM = { pool: surface(0x2f9fd0), pond: surface(0x1f6e88, 0.1), channel: surface(0x37b2de), sheet: falling(0xe8faff), jet: falling(0xf2fdff), glowJet: falling(0x9dffb8, 0x22cc55), glowPool: surface(0x1a6b52) };
  WM.glowPool.emissive = new THREE.Color(0x0a5a33); WM.glowPool.emissiveIntensity = 0.8;
  return WM;
}

// ---- text / brand textures for signs and billboards
const LOGO = new Image(); LOGO.src = new URL('../assets/logo-incontrol.png', import.meta.url).href;
const brandTextures = [];
// Each sign texture repaints from a clean canvas, and only when its own inputs change (logo/fonts/photo),
// so signs never accumulate overdraw or re-upload mid-run.
function signTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  const paint = () => { const g = c.getContext('2d'); g.clearRect(0, 0, w, h); g.globalAlpha = 1; draw(g, w, h); t.needsUpdate = true; };
  paint(); brandTextures.push(paint); t.userData.paint = paint;
  return t;
}
function redrawSigns() { brandTextures.forEach((p) => p()); }
LOGO.onload = redrawSigns;
if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(redrawSigns);
// unlit sign face: crisp, identical in every light, and pushed toward the camera in the depth buffer
function signFace(w, h, key, tex, x, y, z, parent, alpha = false) {
  const m = cachedMat(`face-${key}`, () => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: alpha, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  return M(plane(w, h), m, x, y, z, parent);
}
let BADGE = null;
function infoBadge() {
  if (BADGE) return BADGE;
  BADGE = signTex(128, 128, (g, w) => { g.fillStyle = '#ffc845'; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill(); g.strokeStyle = '#040707'; g.lineWidth = 6; g.stroke(); g.fillStyle = '#040707'; g.font = '700 84px "Zilla Slab", Georgia, serif'; g.textAlign = 'center'; g.fillText('i', 64, 94); });
  return BADGE;
}
const textTex = new Map();
function textSign(text, color) {
  if (textTex.has(text)) return textTex.get(text);
  const t = signTex(1024, 190, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = color; g.fillRect(0, h - 14, w, 14); g.font = '700 86px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText(text, w / 2, 120, w - 40); });
  textTex.set(text, t); return t;
}
const weather = (g, w, h) => { const R = mulberry(w + h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(90,70,40,${0.02 + R() * 0.05})`; g.fillRect(R() * w, R() * h, 2 + R() * 30, 1 + R() * 3); } const gr = g.createLinearGradient(0, h * 0.7, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,45,20,.18)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
const drawLogo = (g, x, y, wMax) => { if (LOGO.complete && LOGO.naturalWidth) { const lw = wMax, lh = lw * LOGO.naturalHeight / LOGO.naturalWidth; g.drawImage(LOGO, x, y, lw, lh); return lh; } g.fillStyle = '#005695'; g.font = '700 40px "Barlow Condensed", sans-serif'; g.fillText('inCon-trol', x, y + 40); return 48; };
const BRAND_ADS = [
  { head: 'Water features, designed & built', sub: 'Design · Construction · Manufacturing · Maintenance', bg: ['#ffffff', '#e6f1fa'] },
  { head: 'Every drop, under control.', sub: 'Water features · Irrigation pump stations · Control panels', bg: ['#005695', '#003a66'], dark: true },
  { head: 'Play Drip Dash!', sub: 'Top this month\'s leaderboard', bg: ['#00C1D5', '#005695'], dark: true, drip: true },
  { head: 'Water harvesting & reuse', sub: 'Fiberglass vaults · Chemical injection · Service', bg: ['#ffffff', '#eaf6ea'] },
];
const adTex = new Map();
function brandAd(i) {
  if (adTex.has(i)) return adTex.get(i);
  const ad = BRAND_ADS[i % BRAND_ADS.length];
  const t = signTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, ad.bg[0]); gr.addColorStop(1, ad.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = ad.dark ? '#ffffff' : '#005695'; g.fillRect(0, h - 22, w, 22);
    if (ad.dark) { g.fillStyle = '#fff'; g.beginPath(); g.roundRect?.(40, 36, 420, 150, 18); g.fill(); }
    drawLogo(g, 60, 52, 380);
    g.fillStyle = ad.dark ? '#ffffff' : '#003a66'; g.font = '700 74px "Zilla Slab", Georgia, serif'; g.fillText(ad.head, 50, 300, w - 100);
    g.fillStyle = ad.dark ? '#CFF6FF' : '#5D85B7'; g.font = '600 44px "Barlow Condensed", sans-serif'; g.fillText(ad.sub, 52, 370, w - 100);
    g.fillStyle = ad.dark ? '#ffffff' : '#005695'; g.font = '700 38px "Barlow Condensed", sans-serif'; g.fillText('incontrolwatersystems.com', 52, 450);
    if (ad.drip) { g.save(); g.translate(860, 250); g.fillStyle = '#2186cf'; g.beginPath(); g.moveTo(0, -150); g.bezierCurveTo(30, -90, 100, -40, 100, 30); g.arc(0, 30, 100, 0, Math.PI); g.bezierCurveTo(-100, -40, -30, -90, 0, -150); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-30, 20, 18, 24, 0, 0, TAU); g.ellipse(32, 20, 18, 24, 0, 0, TAU); g.fill(); g.fillStyle = '#040707'; g.beginPath(); g.arc(-26, 24, 9, 0, TAU); g.arc(36, 24, 9, 0, TAU); g.fill(); g.strokeStyle = '#003a66'; g.lineWidth = 7; g.beginPath(); g.arc(4, 62, 22, 0.2, Math.PI - 0.2); g.stroke(); g.restore(); }
    weather(g, w, h);
  });
  adTex.set(i, t); return t;
}
const gateTex = new Map();
function gateSign(zone) {
  if (gateTex.has(zone.id)) return gateTex.get(zone.id);
  const t = signTex(1024, 160, (g, w, h) => {
    g.fillStyle = zone.night ? '#0b1733' : '#005695'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#00C1D5'; g.fillRect(0, h - 10, w, 10);
    g.fillStyle = '#CFF6FF'; g.font = '700 34px "Barlow Condensed", sans-serif'; g.fillText(zone.idx === ZONES.length - 1 ? 'DESTINATION' : `STOP ${zone.idx + 1} OF ${ZONES.length}`, 30, 52);
    g.fillStyle = '#ffffff'; g.font = '700 64px "Zilla Slab", Georgia, serif'; g.fillText(zone.short, 30, 122, w - 60);
  });
  gateTex.set(zone.id, t); return t;
}
// project billboards: the real gallery photo + a branded header
const photoTex = new Map();
function projectPhoto(p) {
  if (photoTex.has(p.id)) return photoTex.get(p.id);
  const holder = {};
  const t = signTex(1024, 768, (g, w, h) => {
    if (holder.img) { const im = holder.img, s = Math.max(w / im.width, h / im.height); g.drawImage(im, (w - im.width * s) / 2, (h - im.height * s) / 2, im.width * s, im.height * s); }
    else { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5D85B7'); gr.addColorStop(1, '#003a66'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 64px "Zilla Slab", Georgia, serif'; g.fillText(p.short, 40, h / 2, w - 80); }
    // header + footer bands
    g.fillStyle = 'rgba(0,58,102,.88)'; g.fillRect(0, 0, w, 120);
    g.fillStyle = '#fff'; g.font = '600 32px "Barlow Condensed", sans-serif'; g.fillText('INCON-TROL PROJECT', 30, 44);
    g.font = '700 54px "Zilla Slab", Georgia, serif'; g.fillText(p.short, 30, 100, w - 60);
    g.fillStyle = 'rgba(255,200,69,.95)'; g.fillRect(0, h - 78, w, 78);
    g.fillStyle = '#040707'; g.font = '700 42px "Barlow Condensed", sans-serif'; g.fillText('ⓘ  TAP FOR PROJECT INFO', 30, h - 26);
    weather(g, w, h);
  });
  const srcs = photoSources(p);
  const tryLoad = (i) => {
    if (i >= srcs.length) return;          // keep the branded title card
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => { holder.img = img; t.userData.paint(); };
    img.onerror = () => tryLoad(i + 1);
    img.src = srcs[i];
  };
  tryLoad(0);
  photoTex.set(p.id, t); return t;
}

// ---------------------------------------------------------------- Drip (3D)
export function makeDrip(outfit = 'none') {
  const g = new THREE.Group();
  const bodyCol = outfit === 'gold' ? 0xf5c04a : outfit === 'aqua' ? 0x22cfe0 : 0x2186cf;
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.12, metalness: outfit === 'gold' ? 0.6 : 0.02, envMapIntensity: 1.8 });
  const rig = new THREE.Group(); g.add(rig);                 // squash/stretch + lean happens on the rig
  const body = M(DROP_GEO, bodyMat, 0, 0, 0, rig, true);
  const curl = M(torus(0.12, 0.04, Math.PI * 1.3, 8, 14), bodyMat, 0.1, 1.42, 0, rig); curl.rotation.set(0, Math.PI / 2, 0.3);
  const face = new THREE.Group(); rig.add(face);
  const eyes = [], pupils = [];
  for (const sx of [-1, 1]) {
    const eye = M(sph(0.12, 14), mat(0xffffff, { rough: 0.3 }), sx * 0.17, 0.6, 0.39, face); eye.scale.set(0.85, 1.1, 0.6); eyes.push(eye);
    const pu = M(sph(0.065, 12), mat(0x040707, { rough: 0.2 }), sx * 0.17 + 0.02, 0.6, 0.46, face); pupils.push(pu);
    M(sph(0.06, 8), mat(0xff8fa3), sx * 0.3, 0.42, 0.36, face).scale.set(1, 0.6, 0.4);
  }
  const brows = [-1, 1].map((sx) => { const b = M(box(0.16, 0.035, 0.03), mat(0x003a66), sx * 0.17, 0.79, 0.4, face); b.rotation.z = sx * -0.15; return b; });
  const smile = M(torus(0.11, 0.028, Math.PI, 6, 12), mat(0x003a66), 0, 0.44, 0.44, face); smile.rotation.z = Math.PI;
  const mouthO = M(sph(0.07, 10), mat(0x5a1020), 0, 0.42, 0.43, face); mouthO.scale.set(1, 1.2, 0.5); mouthO.visible = false;
  M(sph(0.07, 8), mat(0xffffff, { opacity: 0.85, rough: 0 }), -0.26, 0.74, 0.3, rig).scale.set(0.6, 1.4, 0.5);
  const feet = [];
  for (const sx of [-1, 1]) { const f = M(sph(0.15, 10), mat(0x00477c, { rough: 0.4 }), sx * 0.2, 0.06, 0.04, g, true); f.scale.set(1, 0.55, 1.4); feet.push(f); }
  if (outfit === 'hardhat') {
    M(geo('hat', () => new THREE.SphereGeometry(0.32, 16, 8, 0, TAU, 0, Math.PI / 2)), mat(0xffd23f, { rough: 0.35 }), 0, 0.98, 0, rig, true);
    M(cyl(0.42, 0.42, 0.05, 18), mat(0xffd23f, { rough: 0.35 }), 0, 0.98, 0.04, rig);
    M(box(0.14, 0.1, 0.02), mat(0x005695), 0, 1.13, 0.27, rig);
  }
  if (outfit === 'vest') {
    M(geo('vest', () => new THREE.CylinderGeometry(0.47, 0.5, 0.3, 20, 1, true)), mat(0xff8a1f, { side: 1 }), 0, 0.36, 0, rig);
    M(geo('vests', () => new THREE.CylinderGeometry(0.485, 0.495, 0.06, 20, 1, true)), mat(0xe8ff5a, { emissive: 0x4a5a00, side: 1 }), 0, 0.38, 0, rig);
  }
  const bubble = M(sph(0.95, 18), mat(0x00c1d5, { opacity: 0.22, rough: 0 }), 0, 0.7, 0, g); bubble.visible = false;
  const shadow = M(geo('shadow', () => new THREE.CircleGeometry(0.55, 20)), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.02, 0);
  shadow.rotation.x = -Math.PI / 2;
  g.userData = { rig, body, face, feet, bubble, shadow, eyes, pupils, brows, smile, mouthO };
  return g;
}

// ---------------------------------------------------------------- people (low-poly visitors that walk, play and watch)
const SKIN = [0xf1c9a5, 0xd9a07a, 0xa86b45, 0x7a4a2c, 0xffdfc4];
const SHIRT = [0xff7a59, 0x005695, 0xffc845, 0x7ed957, 0xffffff, 0xc084fc, 0x00c1d5, 0xe8402e];
function person(R, kid = false) {
  const g = new THREE.Group(), s = kid ? 0.62 : 1;
  const shirt = mat(SHIRT[Math.floor(R() * SHIRT.length)], { rough: 0.9 }), pants = mat([0x2b3a55, 0x3d3d3d, 0x6b5a45, 0x1f4f7a][Math.floor(R() * 4)], { rough: 0.9 }), skin = mat(SKIN[Math.floor(R() * SKIN.length)], { rough: 0.7 });
  const legs = [-1, 1].map((sx) => { const p = new THREE.Group(); p.position.set(sx * 0.11 * s, 0.85 * s, 0); M(box(0.13 * s, 0.82 * s, 0.15 * s), pants, 0, -0.41 * s, 0, p); g.add(p); return p; });
  M(cyl(0.2 * s, 0.17 * s, 0.68 * s, 8), shirt, 0, 1.18 * s, 0, g, true);
  M(sph(0.15 * s, 10), skin, 0, 1.66 * s, 0, g);
  M(geo('hair', () => new THREE.SphereGeometry(0.155, 10, 6, 0, TAU, 0, Math.PI / 2)), mat([0x2b1d14, 0x5a3a20, 0xd9b26a, 0x111111][Math.floor(R() * 4)]), 0, 1.68 * s, -0.01, g).scale.setScalar(s);
  const arms = [-1, 1].map((sx) => { const p = new THREE.Group(); p.position.set(sx * 0.26 * s, 1.46 * s, 0); M(box(0.09 * s, 0.6 * s, 0.1 * s), skin, 0, -0.3 * s, 0, p); g.add(p); return p; });
  g.userData = { legs, arms, ph: R() * TAU, s, dynamic: true };
  return g;
}
function animPerson(p, t, mode, speed = 1) {
  const u = p.userData, k = t * 7 * speed + u.ph;
  if (mode === 'walk' || mode === 'run') {
    const amp = mode === 'run' ? 0.9 : 0.55, kk = mode === 'run' ? k * 1.5 : k, a = Math.sin(kk) * amp;
    u.legs[0].rotation.x = a; u.legs[1].rotation.x = -a; u.arms[0].rotation.x = -a * 0.8; u.arms[1].rotation.x = a * 0.8;
  } else if (mode === 'sit' || mode === 'sitGround') {
    u.legs[0].rotation.x = u.legs[1].rotation.x = -1.45;
    u.arms[0].rotation.x = -0.35 + Math.sin(k * 0.25) * 0.15; u.arms[1].rotation.x = -0.35;
  } else if (mode === 'splash' || mode === 'play') {
    const j = Math.abs(Math.sin(k * 0.6)); p.position.y = j * 0.4;
    u.arms[0].rotation.x = -2.6 * j - 0.3; u.arms[1].rotation.x = -2.6 * j - 0.3; u.arms[0].rotation.z = 0.3; u.arms[1].rotation.z = -0.3;
    p.rotation.y += 0.004;
  } else if (mode === 'wave') { u.arms[1].rotation.x = -2.8; u.arms[1].rotation.z = -0.3 + Math.sin(k) * 0.4; }
  else if (mode === 'watch') { p.rotation.z = Math.sin(k * 0.12) * 0.03; const w = Math.sin(k * 0.09) > 0.85; u.arms[1].rotation.x = w ? -2.6 : 0; u.arms[1].rotation.z = w ? -0.3 + Math.sin(k) * 0.3 : 0; }
}

// ---------------------------------------------------------------- game
export class WaterRun {
  constructor(canvas, hooks = {}) {
    this.cv = canvas; this.hooks = hooks;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    if (SHADOWS) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;   // reflections on water, Drip and glass
    this.scene.fog = new THREE.Fog(0xdfeefa, 60, 215);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 420);
    ZONES.forEach((z) => projectPhoto(z));   // photos are ready before their signs come into view
    // sky dome with a vertical gradient that follows the time of day
    this.skyU = { top: { value: new THREE.Color(ZONES[0].top) }, bottom: { value: new THREE.Color(ZONES[0].bottom) } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top;
uniform vec3 bottom;
varying vec3 vP;
void main() {
  float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0);
  gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
  #include <colorspace_fragment>
}`,
    }));
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x6b7a5a, 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6); this.scene.add(this.sun); this.scene.add(this.sun.target);
    if (SHADOWS) {
      this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera; sc.left = -14; sc.right = 14; sc.top = 22; sc.bottom = -14; sc.near = 1; sc.far = 80;
      this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    }
    this.night = new THREE.PointLight(0x7dffb0, 0, 22, 1.6); this.scene.add(this.night);   // Agora glow around Drip
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.outfit = 'none';
    this.player = makeDrip(this.outfit); this.scene.add(this.player); this.scene.add(this.player.userData.shadow);
    this.particles = this.makeParticles();
    this.makeSkyLayer();
    this.ambient = this.makeAmbient();
    this.backdrops = new Map(); this.backdrop = null;
    this.raycaster = new THREE.Raycaster();
    this.state = 'idle';
    this.reset(1);
    this.resize();
    addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.resize()).observe(canvas);
    if (document.fonts) document.fonts.ready.then(() => { if (this.state === 'idle') this.reset(1); });
    this.last = 0; this.acc = 0; this.clock = 0;
    this.renderer.setAnimationLoop((ts) => this.frame(ts));
  }

  setOutfit(o) {
    if (o === this.outfit) return;
    this.outfit = o;
    this.scene.remove(this.player); this.scene.remove(this.player.userData.shadow);
    this.player = makeDrip(o); this.scene.add(this.player); this.scene.add(this.player.userData.shadow);
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const w = Math.max(200, r.width || innerWidth), h = Math.max(200, r.height || innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = h > w;
    this.camera.fov = this.portrait ? 74 : 60;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------ run state
  reset(seed) {
    this.rand = mulberry(seed);
    for (const c of [...this.world.children]) this.world.remove(c);
    this.segs = []; this.objs = [];
    this.t = 0; this.dist = 0; this.speed = RULES.START_SPEED; this.bonus = 0; this.score = 0;
    this.drops = 0; this.valves = 0; this.powerups = 0; this.combo = 0;
    this.lane = 0; this.px = 0; this.py = 0; this.vy = 0; this.slideT = 0; this.fromLane = 0; this.stepPh = 0;
    this.shield = false; this.magnet = 0; this.mult = 0; this.boost = 0; this.stumble = 0; this.inv = 0;
    this.rowDist = 34; this.nextValve = 6; this.nextPower = 9; this.lastFree = 1;
    this.zone = ZONES[0]; this.zonesSeen = [ZONES[0].id]; this.arrived = false; this.lap = 0;
    this.nearProject = null; this.intro = 0;
    this.dead = false; this.deathT = 0;
    // segments aligned so every stop starts exactly on a segment edge
    for (let i = 0; i < SEG_COUNT; i++) this.addSegment(SEG_LEN / 2 - i * SEG_LEN);
    this.applyLook(ZONES[0], 1);
  }

  start(seed = Date.now()) {
    this.reset(seed);
    this.state = 'countdown'; this.countdown = 3.4; this.intro = 1;   // camera swoops down from the water tower
    this.hooks.onZone?.(this.zone, true);
  }
  pause() { if (this.state === 'playing' || this.state === 'countdown') { this.prev = this.state; this.state = 'paused'; } }
  resume(countIn = 0) {
    if (this.state !== 'paused') return;
    if (countIn > 0 && this.prev === 'playing') { this.state = 'countdown'; this.countdown = countIn; this.resumeCount = true; }
    else this.state = this.prev || 'playing';
    this.last = 0;
  }
  quit() { if (this.state === 'paused' || this.state === 'playing' || this.state === 'countdown') { this.state = 'playing'; this.die('quit'); } }

  // ------------------------------------------------ input
  move(dir) {
    if (this.state !== 'playing' || this.dead) return;
    const to = Math.max(-1, Math.min(1, this.lane + dir));
    if (to === this.lane) { sfx.bad(); return; }
    this.fromLane = this.lane; this.lane = to; sfx.slide();
  }
  jump() {
    if (this.state !== 'playing' || this.dead) return;
    if (this.py <= 0.001) { this.vy = JUMP_V; this.slideT = 0; sfx.jump(); }
  }
  slide() {
    if (this.state !== 'playing' || this.dead) return;
    if (this.py > 0.01) this.vy = Math.min(this.vy, -16);
    this.slideT = SLIDE_T; sfx.slide();
  }
  // returns the project whose billboard is under the given screen point (clientX/Y), or null
  pick(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const boards = this.segs.flatMap((s) => s.userData.boards || []);
    const hit = this.raycaster.intersectObjects(boards, false)[0];
    return hit ? hit.object.userData.project : null;
  }

  // ------------------------------------------------ world building
  segInfo(s) {
    const D = this.dist - s.position.z;                 // distance of the segment centre along the Trail
    const index = Math.round((D - SEG_LEN / 2) / SEG_LEN);
    if (index < 0) return { index, zone: ZONES[0], k: -1, lap: 0 };
    const zi = Math.floor(index / (ZONE_LEN / SEG_LEN));
    return { index, zone: ZONES[zi % ZONES.length], k: index % (ZONE_LEN / SEG_LEN), lap: Math.floor(zi / ZONES.length) };
  }
  addSegment(z) {
    const s = new THREE.Group(); s.position.z = z;
    this.world.add(s); this.segs.push(s);
    this.buildSegment(s);
  }
  buildSegment(s) {
    for (const c of [...s.children]) s.remove(c);
    const info = this.segInfo(s), zone = info.zone, R = mulberry(info.index * 131 + 7);
    s.userData = { anims: [], wakers: [], boards: [], puddles: [], zone, info, wake: 0, woke: false };
    const T = textures(), W = waterMats();
    const bridge = zone.id === 'aggie';
    // walkway
    const walk = flat(plane(7.6, SEG_LEN), mat(0xffffff, { map: T[zone.id], rough: zone.id === 'melissa' ? 0.55 : 0.8 }), 0, 0, 0, s);
    walk.material.envMapIntensity = 0.4;
    if (!bridge) {
      // the stream Drip follows: one flowing runnel set flush into the paving on the left, through every stop
      const coping = mat(zone.night ? 0x3a3f48 : 0xc9c2b4, { rough: 0.85 });
      flat(plane(0.22, SEG_LEN), coping, -3.91, 0.004, 0, s);
      flat(plane(0.95, SEG_LEN), mat(0x24343c, { rough: 1 }), -4.5, -0.12, 0, s);
      const stream = flat(plane(0.95, SEG_LEN), zone.night ? W.glowPool : W.channel, -4.5, -0.03, 0, s);
      flat(plane(0.22, SEG_LEN), coping, -5.09, 0.004, 0, s);
      s.userData.wakers.push((w) => { stream.position.y = -0.11 + 0.08 * w; });
      flat(plane(1.0, SEG_LEN), coping, 4.3, 0.002, 0, s);
    }
    // side ground (Aggie Park: pond near the bridge, lawn on the far shores)
    const sideMap = { melissa: T.grass, epic: T.epic, mckinney: T.gravel, olympus: T.olympus, aggie: T.grass, arboretum: T.grass, chase: T.chase, agora: T.agora }[zone.id];
    const inner = bridge ? 16 : 4.8, gw = 85 - inner, gy = bridge ? 0.15 : -0.03;
    flat(plane(gw, SEG_LEN), mat(0xffffff, { map: sideMap, rough: 0.9 }), -(inner + gw / 2) - (bridge ? 0 : 0.4), gy, 0, s);
    flat(plane(gw, SEG_LEN), mat(0xffffff, { map: sideMap, rough: 0.9 }), inner + gw / 2, gy, 0, s);
    // the project's own water feature + its designed surroundings
    this.decor[zone.id].call(this, s, R, info);
    const L = LAYOUTS[zone.id][Math.max(0, info.k)];
    if (info.k >= 0 && L) {
      const mods = this.modules; this.modY = zone.id === 'aggie' ? 0.15 : 0;
      const mx = zone.id === 'aggie' ? 22 : zone.id === 'epic' ? 19 : 17;
      if (L[0]) mods[L[0]].call(this, s, -1, -mx, info.k, zone);
      if (L[1]) mods[L[1]].call(this, s, 1, mx, info.k, zone);
    }
    if (info.k === 0) this.gateway(s, zone);
    // branded billboards and the clickable project billboard (fixed spots in every stop)
    if (info.k === 2 || info.k === 7) this.brandBoard(s, (zone.idx * 2 + (info.k === 7 ? 1 : 0)) % BRAND_ADS.length, info.k === 2 ? -1 : 1, info.k === 2 ? -3 : 3, zone);
    if (info.k === 4) this.projectBoard(s, zone, zone.idx % 2 ? 1 : -1);
    if (info.k === -1) this.startArea(s);
    // shallow puddles on wet walkways: Drip splashes through them
    this.bake(s, info.k < 0 ? 'start' : `${zone.id}:${info.k}`);
    // small moving details (jets, walking people) are only drawn in the nearer sections
    const Wl = [W.jet, W.glowJet, W.sheet];
    s.userData.detail = [];
    s.traverse((o) => { if (o !== s && ((o.userData && o.userData.legs && o.userData.dynamic) || (o.isMesh && Wl.includes(o.material) && o.geometry.type === 'CylinderGeometry'))) s.userData.detail.push(o); });
    if (['melissa', 'agora', 'chase'].includes(zone.id) && info.k % 3 === 1) {
      const lane = (info.k % 2 ? -1 : 1), z = -4;
      flat(geo('puddle', () => new THREE.CircleGeometry(0.85, 20)), W.pool, lane * LANE, 0.012, z, s).scale.set(1, 1.6, 1);
      s.userData.puddles.push({ x: lane * LANE, z, hit: false });
    }
  }

  // Merge every static, opaque piece of scenery in a section into one mesh per material.
  // Each (stop, section) is identical every lap, so the merged geometry is built once and reused.
  bake(s, key) {
    s.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(s.matrixWorld).invert(), W = Object.values(waterMats());
    const isDynamic = (o) => { for (let p = o; p && p !== s; p = p.parent) if (p.userData && p.userData.dynamic) return true; return false; };
    const statics = [];
    s.traverse((o) => {
      if (!o.isMesh || isDynamic(o)) return;
      const m = o.material, g = o.geometry;
      if (!m || !m.isMeshStandardMaterial || m.transparent || W.includes(m)) return;
      if (!g.attributes.normal || !g.attributes.uv) return;
      statics.push(o);
    });
    let baked = BAKED.get(key);
    if (!baked) {
      const groups = new Map();
      for (const o of statics) {
        const gk = `${o.material.uuid}|${o.geometry.index ? 'i' : 'n'}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
        if (!groups.has(gk)) groups.set(gk, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
        const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        groups.get(gk).list.push(g);
      }
      baked = [];
      for (const v of groups.values()) {
        const merged = v.list.length > 1 ? mergeGeometries(v.list, false) : v.list[0];
        if (v.list.length > 1) v.list.forEach((g) => g.dispose());
        if (merged) baked.push({ geo: merged, mat: v.mat, cast: v.cast, recv: v.recv });
      }
      BAKED.set(key, baked);
    }
    for (const o of statics) o.parent.remove(o);
    for (const b of baked) { const m = new THREE.Mesh(b.geo, b.mat); m.castShadow = b.cast && SHADOWS; m.receiveShadow = b.recv && SHADOWS; m.matrixAutoUpdate = false; s.add(m); }
  }

  gateway(s, zone) {
    const z = SEG_LEN / 2 - 1, col = mat(zone.night ? 0x1b2433 : 0x005695, { rough: 0.5, metal: 0.3 });
    for (const sx of [-1, 1]) { M(box(0.5, 6.2, 0.5), col, sx * 5.2, 3.1, z, s, true); M(box(0.8, 0.3, 0.8), mat(0x00c1d5, zone.night ? { emissive: 0x00c1d5, ei: 1.2 } : {}), sx * 5.2, 6.35, z, s); }
    M(box(10.9, 1.7, 0.4), col, 0, 5.45, z, s);
    // sign face: unlit and pushed clear of the beam so it never z-fights
    signFace(8.6, 1.35, `gate-${zone.id}`, gateSign(zone), 0, 5.4, z + 0.32, s);
    for (const sx of [-1, 1]) {
      const j = M(cyl(0.05, 0.22, 2.6, 10), zone.night ? waterMats().glowJet : waterMats().jet, sx * 6.3, 1.3, z, s);
      M(cyl(0.6, 0.7, 0.35, 16), mat(0x9a9488, { rough: 0.8 }), sx * 6.3, 0.17, z, s);
      s.userData.wakers.push((w, t) => { j.scale.y = Math.max(0.01, w * (0.85 + 0.15 * Math.sin(t * 9 + sx))); j.position.y = 1.3 * j.scale.y + 0.2; });
    }
  }

  // Billboards are static: a solid frame, and an unlit face 8 cm in front of it with a depth offset.
  // Unlit (MeshBasic, no tone mapping) keeps logos and photos crisp and identical in every light.
  brandBoard(s, i, sx, z, zone) {
    const x = sx * 7.6, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -sx * 0.32; s.add(g);
    const steel = mat(0x5a6168, { rough: 0.55, metal: 0.6 });
    for (const px of [-1.6, 1.6]) M(cyl(0.12, 0.14, 3.2, 10), steel, px, 1.6, -0.22, g, true);
    M(box(5.5, 3.0, 0.24), mat(0x3b4148, { rough: 0.6, metal: 0.4 }), 0, 4.45, -0.22, g, true);
    signFace(5.1, 2.55, `ad-${i}`, brandAd(i), 0, 4.45, -0.02, g);
    for (const lx of [-1.6, 1.6]) { M(box(0.14, 0.14, 0.7), steel, lx, 6.05, 0.1, g); M(box(0.5, 0.12, 0.25), mat(0x2b2f35, zone.night ? { emissive: 0xfff2c8, ei: 1.5 } : {}), lx, 6.0, 0.45, g); }
  }

  projectBoard(s, zone, sx) {
    const z = 2, x = sx * 7.6, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -sx * 0.38; s.add(g);
    const wood = mat(0x6b4a2b, { rough: 0.85 });
    for (const px of [-2.05, 2.05]) M(box(0.28, 3.6, 0.28), wood, px, 1.8, -0.25, g, true);
    M(box(5.2, 4.1, 0.24), mat(0x2b2f35, { rough: 0.5, metal: 0.4 }), 0, 4.55, -0.25, g, true);
    // a bright, static yellow border (outside the photo, so nothing overlaps it)
    const gold = mat(0xffc845, { emissive: 0xffb000, ei: zone.night ? 1.2 : 0.5, rough: 0.4 });
    M(box(5.0, 0.12, 0.06), gold, 0, 6.44, -0.08, g); M(box(5.0, 0.12, 0.06), gold, 0, 2.66, -0.08, g);
    M(box(0.12, 3.9, 0.06), gold, -2.44, 4.55, -0.08, g); M(box(0.12, 3.9, 0.06), gold, 2.44, 4.55, -0.08, g);
    const face = signFace(4.7, 3.52, `photo-${zone.id}`, projectPhoto(zone), 0, 4.55, -0.02, g);
    face.userData.project = zone;
    // a fixed "i" badge on top marks the one interactive sign
    M(box(0.1, 0.5, 0.1), wood, 0, 6.85, -0.2, g);
    signFace(0.9, 0.9, 'badge-i', infoBadge(), 0, 7.05, -0.02, g, true);
    s.userData.boards.push(face);
    s.userData.boardZ = z; s.userData.project = zone;
    // visitors stop to read it
    const a = person(mulberry(zone.idx * 7 + 1)), b = person(mulberry(zone.idx * 7 + 2), true);
    a.position.set(x - sx * 1.6, 0, z + 2.0); b.position.set(x - sx * 0.8, 0, z + 2.3);
    a.rotation.y = b.rotation.y = sx > 0 ? 2.7 : -2.7; s.add(a); s.add(b);
    s.userData.anims.push((t) => { animPerson(a, t, 'watch'); animPerson(b, t, 'wave'); });
  }

  startArea(s) {
    this.modY = 0;
    const tw = this.playTower(s, 0, -0.5, 12);
    tw.scale.setScalar(1.25);
    this.modules.splashKids.call(this, s, -1, -14, 1, ZONES[0]);
    this.modules.picnic.call(this, s, 1, 15, 2, ZONES[0]);
  }

  playTower(s, x, z, h = 7) {
    const g = new THREE.Group(); g.position.set(x, 0, z); s.add(g);
    const post = mat(0x1f6f4a, { rough: 0.5, metal: 0.3 }), red = mat(0xe8402e, { rough: 0.5 });
    for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) M(cyl(0.12, 0.12, h * 0.7, 10), post, px, h * 0.35, pz, g, true);
    M(box(3.0, 0.25, 3.0), mat(0xffc845, { rough: 0.5 }), 0, h * 0.42, 0, g, true);
    M(cyl(1.2, 1.2, 1.6, 18), mat(0xf1f1f1, { rough: 0.4 }), 0, h * 0.7 + 0.8, 0, g, true);
    M(cone(1.55, 1.2, 18), red, 0, h * 0.7 + 2.2, 0, g, true);
    const bucket = new THREE.Group(); bucket.position.set(0, h * 0.7 + 3.4, 0); bucket.userData.dynamic = true; g.add(bucket);
    M(cyl(0.9, 0.65, 1.1, 16), mat(0xffc845, { rough: 0.4 }), 0, 0, 0, bucket, true);
    const pour = M(cyl(0.6, 1.5, h * 0.95, 14), waterMats().sheet, 0.6, h * 0.5, 0.6, g);
    s.userData.anims.push((t) => { const k = (t % 7) / 7; bucket.rotation.z = k > 0.82 ? Math.min(1.9, (k - 0.82) * 14) : k * 0.1; pour.visible = k > 0.87 && k < 0.99; });
    const slide = M(torus(2.6, 0.5, Math.PI * 0.75, 10, 20), mat(0xf6f6f6, { rough: 0.25 }), 2.6, h * 0.42 - 0.2, 0, g, true); slide.rotation.y = Math.PI / 2; slide.rotation.z = -0.2;
    return g;
  }

  // deterministic tree (seeded), optional autumn colours
  tree(s, x, z, sz = 1, seed = 1, kind = 'oak') {
    const R = mulberry(seed * 977 + 13), g = new THREE.Group(); g.position.set(x, 0, z); s.add(g);
    M(cyl(0.16 * sz, 0.24 * sz, 2.4 * sz, 8), mat(0x5b4030, { rough: 0.95 }), 0, 1.2 * sz, 0, g, true);
    const greens = kind === 'autumn' ? [0xd9822b, 0xe8a33c, 0xb5452a, 0xc9b03a] : [0x3f7a3a, 0x4f8c41, 0x5d9a48];
    for (let i = 0; i < 5; i++) { const b = M(ico(0.9 * sz + R() * 0.5 * sz, 1), mat(greens[i % greens.length], { rough: 0.95, flat: true }), (R() - 0.5) * 1.8 * sz, 2.6 * sz + R() * 1.1 * sz, (R() - 0.5) * 1.8 * sz, g, true); b.scale.y = 0.8; }
    return g;
  }
  // a person placed on purpose: pose + optional back-and-forth walk along z
  visitor(parent, s, seed, x, z, rotY, pose, opt = {}) {
    if (MOBILE && opt.optional) return null;   // phones keep only the key people in each scene
    const p = person(mulberry(seed), !!opt.kid);
    p.position.set(x, opt.y || 0, z); p.rotation.y = rotY; parent.add(p);
    const sc = p.userData.s;
    if (pose === 'sit') p.position.y = (opt.seat ?? 0.45) - 0.85 * sc;
    if (pose === 'sitGround') p.position.y = 0.12 - 0.85 * sc;
    if (opt.walk) {
      const ph = (seed % 7), len = opt.walk, sp = opt.speed || 0.12;
      s.userData.anims.push((t) => { const a = t * sp + ph; p.position.z = z + Math.sin(a) * len; p.rotation.y = Math.cos(a) > 0 ? Math.PI : 0; animPerson(p, t, 'walk', 0.8); });
    } else if (opt.circle) {
      const r = opt.circle, cx = x, cz = z, ph = seed;
      s.userData.anims.push((t) => { const a = t * 1.1 + ph; p.position.x = cx + Math.cos(a) * r; p.position.z = cz + Math.sin(a) * r; p.rotation.y = -a; animPerson(p, t, 'run'); });
    } else if (['sit', 'sitGround', 'watch'].includes(pose)) {
      animPerson(p, 0, pose === 'watch' ? 'idle' : pose);   // posed once, then merged into the static scenery
      p.userData.dynamic = false;
    } else s.userData.anims.push((t) => animPerson(p, t, pose));
    return p;
  }
  bench(g, x, z, rotY, night) {
    const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = rotY; g.add(b);
    const wood = mat(0x9b6b3f, { rough: 0.8 }), iron = mat(0x2b2f35, { metal: 0.6, rough: 0.4 });
    M(box(1.8, 0.08, 0.5), wood, 0, 0.45, 0, b, true); M(box(1.8, 0.4, 0.06), wood, 0, 0.75, -0.24, b, true);
    for (const lx of [-0.75, 0.75]) M(box(0.08, 0.45, 0.5), iron, lx, 0.22, 0, b);
    return b;
  }
  lamp(g, x, z, night, h = 4) {
    M(cyl(0.07, 0.09, h, 8), mat(0x2b2f35, { metal: 0.6, rough: 0.4 }), x, h / 2, z, g);
    M(sph(0.24, 10), mat(0xfff2c8, night ? { emissive: 0xffd27a, ei: 2.2 } : { emissive: 0xfff2c8, ei: 0.15 }), x, h + 0.1, z, g);
  }
  flowerBed(g, x, z, w, d, seed) {
    const R = mulberry(seed);
    M(box(w, 0.35, d), mat(0x8a8274, { rough: 0.85 }), x, 0.17, z, g, true);
    flat(plane(w - 0.2, d - 0.2), mat(0x4a3424, { rough: 1 }), x, 0.36, z, g);
    const cols = [0xff5a8a, 0xffc845, 0xff7a59, 0xc084fc, 0xffffff];
    const n = Math.round(w * d * 1.2);
    for (let i = 0; i < n; i++) { const fx = x + (R() - 0.5) * (w - 0.4), fz = z + (R() - 0.5) * (d - 0.4); M(ico(0.18, 0), mat(i % 3 ? 0x4f8c41 : cols[i % cols.length], { flat: true, rough: 0.9 }), fx, 0.5, fz, g); }
  }

  // hand-built park scenes placed by LAYOUTS (one per side per 30 m), each a complete little place
  get modules() {
    const W = waterMats(), T = textures(), self = this;
    const grp = (s, x, z = 0) => { const g = new THREE.Group(); g.position.set(x, self.modY || 0, z); s.add(g); return g; };
    return {
      // a mini splash pad with kids playing in ground jets, a parent watching from a bench
      splashKids(s, sx, x, k, zone) {
        const g = grp(s, x, (k % 3 - 1) * 3), night = !!zone.night;
        flat(geo('pad34', () => new THREE.CircleGeometry(3.4, 32)), mat(0xffffff, { map: T.melissa, rough: 0.5 }), 0, 0.02, 0, g);
        flat(geo('puddle26', () => new THREE.CircleGeometry(2.4, 28)), night ? W.glowPool : W.pool, 0, 0.035, 0, g);
        const jets = [];
        for (let i = 0; i < 7; i++) { const a = (i / 6) * TAU, r = i === 6 ? 0 : 1.7; const j = M(cyl(0.04, 0.14, 1.8, 8), night ? W.glowJet : W.jet, Math.cos(a) * r, 0.9, Math.sin(a) * r, g); jets.push(j); }
        s.userData.wakers.push((w, t) => jets.forEach((j, i) => { const h = w * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.8 + i))); j.scale.y = Math.max(0.01, h); j.position.y = 0.9 * h; }));
        for (const [bx, col] of [[-3.0, 0xff7a59], [3.0, 0x7ed957]]) { M(cyl(0.16, 0.2, 1.3, 10), mat(col, { rough: 0.4 }), bx, 0.65, -2.2, g, true); M(sph(0.26, 10), mat(col, { rough: 0.4 }), bx, 1.4, -2.2, g); }
        self.visitor(g, s, 11 + k, -0.9, 0.6, 0.5, 'splash', { kid: true });
        self.visitor(g, s, 12 + k, 1.1, -0.4, -0.8, 'splash', { kid: true });
        self.visitor(g, s, 13 + k, 0.2, 1.3, 2.2, 'run', { kid: true, circle: 1.3, optional: true });
        self.bench(g, sx * 4.4, 1.5, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        self.visitor(g, s, 14 + k, sx * 4.4, 1.2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'sit');
        self.visitor(g, s, 15 + k, sx * 4.4, 2.1, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'sit', { optional: true });
        M(box(0.9, 0.05, 0.5), mat([0xff5a8a, 0x00c1d5][k % 2], { rough: 0.9 }), sx * 3.6, 0.03, -0.6, g);
        if (night) self.lamp(g, sx * 4.6, -2.5, true);
      },
      // playground: tower + slide, swings with a kid, parent on a bench
      playground(s, sx, x, k, zone) {
        const g = grp(s, x, 1);
        flat(plane(8, 7), mat(0x2f6fb3, { rough: 0.9 }), 0, 0.02, 0, g);
        const post = mat(0xffc845, { rough: 0.5 }), deck = mat(0x7ed957, { rough: 0.6 });
        for (const [px, pz] of [[-2.8, -2.4], [-1.2, -2.4], [-2.8, -0.8], [-1.2, -0.8]]) M(cyl(0.09, 0.09, 2.6, 8), post, px, 1.3, pz, g, true);
        M(box(1.9, 0.18, 1.9), deck, -2, 1.5, -1.6, g, true);
        M(cone(1.4, 1.0, 4), mat(0xe8402e, { rough: 0.5 }), -2, 3.1, -1.6, g, true).rotation.y = Math.PI / 4;
        const sl = M(box(0.7, 0.06, 2.6), mat(0x00c1d5, { rough: 0.3 }), -2, 0.8, 0.5, g, true); sl.rotation.x = 0.6;
        // swing set
        const iron = mat(0x2b2f35, { metal: 0.6, rough: 0.4 });
        for (const ex of [0.8, 3.4]) for (const ez of [-0.6, 0.6]) { const leg = M(cyl(0.06, 0.06, 2.9, 6), iron, ex, 1.4, 1.5 + ez * 0.9, g); leg.rotation.x = ez * 0.35; }
        M(box(2.8, 0.1, 0.1), iron, 2.1, 2.8, 1.5, g);
        for (let i = 0; i < 2; i++) {
          const piv = new THREE.Group(); piv.position.set(1.5 + i * 1.3, 2.75, 1.5); piv.userData.dynamic = true; g.add(piv);
          for (const rx of [-0.22, 0.22]) M(box(0.02, 2.2, 0.02), iron, rx, -1.1, 0, piv);
          M(box(0.55, 0.06, 0.3), mat(0x1c1c1c), 0, -2.2, 0, piv);
          if (i === 0) self.visitor(piv, s, 21 + k, 0, -2.2, 0, 'sit', { kid: true, seat: -2.15 });
          const ph = i * 1.4; s.userData.anims.push((t) => { piv.rotation.x = Math.sin(t * 1.9 + ph) * (i === 0 ? 0.55 : 0.12); });
        }
        self.visitor(g, s, 22 + k, -1.3, 1.6, 0.4, 'run', { kid: true, circle: 0.9, optional: true });
        self.bench(g, sx * 4.8, -1, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
        self.visitor(g, s, 23 + k, sx * 4.8, -1.2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 'sit');
        self.tree(g, sx * 5.5, 3.5, 1.2, 30 + k);
      },
      // family picnic under a shade tree
      picnic(s, sx, x, k, zone) {
        const g = grp(s, x, (k % 2 ? 2 : -2));
        self.tree(g, sx * 2.2, -2.2, 1.5, 40 + k, zone.id === 'arboretum' ? 'autumn' : 'oak');
        flat(plane(2.6, 2.0), mat(0xffffff, { map: T.blanket, rough: 0.95 }), 0, 0.03, 0.4, g);
        self.visitor(g, s, 41 + k, -0.7, 0.2, 0.6, 'sitGround');
        self.visitor(g, s, 42 + k, 0.7, 0.6, -2.4, 'sitGround');
        self.visitor(g, s, 43 + k, 0, 0.4, 0, 'run', { kid: true, circle: 2.2 });
        M(box(0.5, 0.35, 0.35), mat(0x9b6b3f, { rough: 0.8 }), 0.1, 0.2, 1.0, g, true);
        M(box(0.6, 0.45, 0.4), mat(0x1f6fb3, { rough: 0.5 }), -1.5, 0.22, 1.2, g, true);
        // picnic table nearby
        const tb = new THREE.Group(); tb.position.set(-sx * 3, 0, -1.5); g.add(tb);
        M(box(2, 0.08, 0.9), mat(0x9b6b3f, { rough: 0.8 }), 0, 0.75, 0, tb, true);
        for (const bz of [-0.75, 0.75]) M(box(2, 0.06, 0.3), mat(0x9b6b3f, { rough: 0.8 }), 0, 0.45, bz, tb);
        for (const lx of [-0.8, 0.8]) M(box(0.08, 0.75, 1.6), mat(0x6b4a2b), lx, 0.37, 0, tb);
      },
      // a paved rest area: benches facing the path, lamp, bin, flower bed, a couple strolling
      benches(s, sx, x, k, zone) {
        const g = grp(s, x, 0), night = !!zone.night;
        flat(plane(3.4, 16), mat(0xffffff, { map: T.mckinney, rough: 0.8 }), 0, 0.02, 0, g);
        const face = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        self.bench(g, -sx * 1.2, -3.5, face); self.bench(g, -sx * 1.2, 3.5, face);
        self.visitor(g, s, 51 + k, -sx * 1.2, -3.8, face, 'sit');
        self.visitor(g, s, 52 + k, -sx * 1.2, -3.0, face, 'sit', { optional: true });
        self.visitor(g, s, 53 + k, -sx * 1.2, 3.5, face, 'sit', { optional: k % 2 === 0 });
        self.lamp(g, -sx * 1.4, 0, night);
        M(cyl(0.28, 0.25, 0.8, 10), mat(0x2f6b45, { rough: 0.6 }), -sx * 1.4, 0.4, 1.2, g, true);
        self.flowerBed(g, sx * 2.6, 0, 1.6, 6, 54 + k);
        self.visitor(g, s, 55 + k, sx * 0.6, 0, 0, 'walk', { walk: 6 });
        self.visitor(g, s, 56 + k, sx * 0.1, 0.6, 0, 'walk', { walk: 6, kid: true, optional: true });
      },
      // shade pavilion with families at tables + restrooms
      pavilion(s, sx, x, k, zone) {
        const g = grp(s, x, -1), night = !!zone.night;
        flat(plane(8, 6), mat(0xffffff, { map: T.mckinney, rough: 0.8 }), 0, 0.02, 0, g);
        const col = mat(0xf2efe6, { rough: 0.6 });
        for (const [px, pz] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, 2.4], [3.4, 2.4]]) M(box(0.3, 3, 0.3), col, px, 1.5, pz, g, true);
        M(box(7.8, 0.3, 5.8), mat(0x005695, { rough: 0.5 }), 0, 3.1, 0, g, true);
        const roof = M(cone(5.4, 1.4, 4), mat(0x00477c, { rough: 0.5 }), 0, 3.95, 0, g, true); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.75;
        for (const tz of [-1.2, 1.2]) {
          const tb = new THREE.Group(); tb.position.set(0, 0, tz); g.add(tb);
          M(box(2.2, 0.08, 0.9), mat(0x9b6b3f, { rough: 0.8 }), 0, 0.75, 0, tb, true);
          for (const bz of [-0.75, 0.75]) M(box(2.2, 0.06, 0.3), mat(0x9b6b3f, { rough: 0.8 }), 0, 0.45, bz, tb);
        }
        self.visitor(g, s, 61 + k, -0.5, -1.95, 0, 'sit'); self.visitor(g, s, 62 + k, 0.5, -0.45, Math.PI, 'sit', { kid: true });
        self.visitor(g, s, 63 + k, -0.3, 1.95, Math.PI, 'sit', { optional: true }); self.visitor(g, s, 64 + k, 0.6, 0.45, 0, 'sit', { optional: true });
        // restroom building with a sign
        const rb = new THREE.Group(); rb.position.set(sx * 2, 0, -6.5); g.add(rb);
        M(box(4.5, 3, 2.6), mat(0xd8cfc0, { rough: 0.8 }), 0, 1.5, 0, rb, true);
        M(box(4.8, 0.25, 2.9), mat(0x005695, { rough: 0.5 }), 0, 3.1, 0, rb);
        signFace(2.4, 0.5, 'restrooms', textSign('RESTROOMS', '#005695'), 0, 2.4, 1.32, rb);
        if (night) self.lamp(g, -sx * 3.8, 3, true, 3.4);
      },
      // snack kiosk with an awning, a queue and patio tables
      kiosk(s, sx, x, k, zone) {
        const g = grp(s, x, 1), night = !!zone.night;
        flat(plane(8, 7), mat(0xffffff, { map: T.chase, rough: 0.8 }), 0, 0.02, 0, g);
        const kb = new THREE.Group(); kb.position.set(sx * 1.5, 0, -1.8); kb.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(kb);
        M(box(3.2, 2.5, 2.2), mat(0xf2efe6, { rough: 0.6 }), 0, 1.25, 0, kb, true);
        M(box(2.6, 0.9, 0.05), mat(0x1c2a33, { rough: 0.2 }), 0, 1.5, 1.12, kb);
        const aw = M(box(3.4, 0.08, 1.1), mat(0xffffff, { map: T.awning, rough: 0.8 }), 0, 2.45, 1.5, kb, true); aw.rotation.x = 0.35;
        signFace(3.0, 0.55, 'kiosk-sign', textSign('SNACKS · ICE CREAM · DRINKS', '#e8402e'), 0, 2.95, 1.13, kb);
        if (night) M(box(3.0, 0.06, 0.06), mat(0xfff2c8, { emissive: 0xffd27a, ei: 2 }), 0, 2.15, 1.6, kb);
        for (let i = 0; i < 3; i++) self.visitor(g, s, 71 + k + i, -sx * (0.3 + i * 0.8), -1.8, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'watch', { kid: i === 1, optional: i === 2 });
        for (const [tx, tz] of [[-sx * 1.6, 2.2], [sx * 1.4, 2.4]]) {
          M(cyl(0.5, 0.5, 0.06, 14), mat(0xf2efe6), tx, 0.75, tz, g, true); M(cyl(0.05, 0.05, 0.75, 6), mat(0x2b2f35), tx, 0.37, tz, g);
          M(cyl(0.03, 0.03, 2.4, 6), mat(0xdddddd), tx, 1.2, tz, g); M(cone(1.2, 0.5, 10), mat(k % 2 ? 0x005695 : 0xff7a59, { rough: 0.8 }), tx, 2.4, tz, g, true);
        }
        self.visitor(g, s, 75 + k, -sx * 1.6, 2.9, Math.PI, 'sit', { seat: 0.45 });
        self.visitor(g, s, 76 + k, sx * 1.4, 1.7, 0, 'sit', { seat: 0.45, kid: true, optional: true });
      },
      // formal garden: hedges, flower beds, ornamental trees, someone walking a dog
      garden(s, sx, x, k, zone) {
        const g = grp(s, x, 0);
        const hedge = mat(0x3d6e34, { rough: 0.95, flat: true });
        M(box(0.6, 0.9, 12), hedge, -sx * 3, 0.45, 0, g, true); M(box(0.6, 0.9, 12), hedge, sx * 3, 0.45, 0, g, true);
        self.flowerBed(g, 0, -3.5, 3.6, 2.4, 81 + k); self.flowerBed(g, 0, 3.5, 3.6, 2.4, 82 + k);
        self.tree(g, -sx * 1.5, 0, 0.9, 83 + k, zone.id === 'arboretum' ? 'autumn' : 'oak');
        const walker = self.visitor(g, s, 84 + k, sx * 1.8, 0, 0, 'walk', { walk: 4 });
        if (walker) { const dog = new THREE.Group(); M(box(0.25, 0.22, 0.55), mat(0xc49a6c), 0, 0.3, 0, dog); M(box(0.2, 0.2, 0.22), mat(0xc49a6c), 0, 0.45, 0.32, dog); walker.add(dog); dog.position.set(0.5, 0, 0.6); }
      },
      // a grove of shade trees with seat walls
      grove(s, sx, x, k, zone) {
        const g = grp(s, x, 0), kind = zone.id === 'arboretum' ? 'autumn' : 'oak';
        for (const [tx, tz, sz] of [[-1.5, -4, 1.4], [2, -1, 1.2], [-0.5, 3.5, 1.5], [3, 5, 1.0]]) { self.tree(g, tx, tz, sz, 90 + k + tx, kind); M(cyl(1.1, 1.1, 0.45, 14), mat(0xb7ab96, { rough: 0.8 }), tx, 0.22, tz, g, true); }
        self.visitor(g, s, 95 + k, -0.5, 2.4, 0.3, 'sit', { seat: 0.45 });
        self.visitor(g, s, 96 + k, 1.9, -2.1, 2.8, 'sit', { seat: 0.45, optional: true });
        self.visitor(g, s, 97 + k, -2.5, 0, 0, 'walk', { walk: 5, optional: true });
      },
      // a round civic fountain with people sitting on the rim
      fountain(s, sx, x, k, zone) {
        const g = grp(s, x, 0), night = !!zone.night;
        flat(geo('plaza5', () => new THREE.CircleGeometry(5, 32)), mat(0xffffff, { map: T.chase, rough: 0.8 }), 0, 0.02, 0, g);
        M(cyl(2.6, 2.7, 0.55, 28), mat(0xb7ab96, { rough: 0.7 }), 0, 0.27, 0, g, true);
        const pool = flat(geo('pool24', () => new THREE.CircleGeometry(2.4, 28)), night ? W.glowPool : W.pool, 0, 0.5, 0, g);
        M(cyl(0.35, 0.5, 1.4, 12), mat(0xb7ab96, { rough: 0.7 }), 0, 0.7, 0, g, true);
        M(cyl(1.0, 0.6, 0.25, 18), mat(0xb7ab96, { rough: 0.7 }), 0, 1.45, 0, g, true);
        const jet = M(cyl(0.06, 0.2, 1.6, 10), night ? W.glowJet : W.jet, 0, 2.3, 0, g);
        const ring = M(cyl(0.95, 1.25, 0.9, 18, ), W.sheet, 0, 1.0, 0, g);
        s.userData.wakers.push((w, t) => { jet.scale.y = Math.max(0.01, w * (0.85 + 0.15 * Math.sin(t * 5))); jet.position.y = 1.55 + 0.8 * jet.scale.y; ring.scale.y = Math.max(0.01, w); pool.position.y = 0.3 + 0.2 * w; });
        for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + k; self.visitor(g, s, 101 + k + i, Math.cos(a) * 2.75, Math.sin(a) * 2.75, -a + Math.PI / 2, 'sit', { seat: 0.55, kid: i === 2, optional: i === 2 }); }
        self.lamp(g, 4, -4, night); self.lamp(g, -4, 4, night);
      },
    };
  }

  // the project's own water feature + its fixed surroundings (no random placement)
  get decor() {
    const W = waterMats(), T = textures(), self = this;
    return {
      // Melissa Lake Park Splash Pad — tipping-bucket play tower, white slide, spray hoops, colourful surfacing
      melissa(s, R, info) {
        for (const sx of [-1, 1]) flat(plane(10, SEG_LEN), mat(0xffffff, { map: T.melissa, rough: 0.55 }), sx * 9.8, -0.02, 0, s);
        if (info.k % 3 === 1) self.playTower(s, (info.k % 2 ? -1 : 1) * 10.5, -6);
        for (const [sx, z] of [[-1, 6], [1, -8]]) {
          const x = sx * 8.2;
          const hoop = M(torus(1.4, 0.09, Math.PI, 8, 20), mat(0x1c1c1c, { rough: 0.4, metal: 0.4 }), x, 0, z, s, true); hoop.rotation.y = Math.PI / 2;
          const spray = M(plane(2.6, 1.5), W.sheet, x, 1.0, z, s); spray.rotation.y = Math.PI / 2;
          s.userData.wakers.push((w) => { spray.scale.y = Math.max(0.01, w); spray.position.y = 1.4 - 0.75 * w; });
        }
        for (const [x, z] of [[-6.5, -11], [7, 2], [-7.5, 12], [6.2, 11]]) {
          const j = M(cyl(0.04, 0.16, 2, 8), W.jet, x, 1, z, s); const ph = x + z;
          s.userData.wakers.push((w, t) => { const k = w * (0.5 + 0.5 * Math.abs(Math.sin(t * 2 + ph))); j.scale.y = Math.max(0.01, k); j.position.y = k; });
        }
        if (info.k % 4 === 2) { const sx = info.k % 8 === 2 ? 1 : -1; M(geo('sail', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-3, 0, -3, 3, 0.8, 0, -2, -0.3, 3], 3)); g.computeVertexNormals(); return g; }), mat(0xffffff, { side: 1, rough: 0.9 }), sx * 11, 4.2, 6, s); for (const [px, pz] of [[-3, -3], [3, 0], [-2, 3]]) M(cyl(0.08, 0.08, 4.4, 6), mat(0x8a8f95), sx * 11 + px, 2.2, 6 + pz, s); }
      },
      // The Epic East — angular dark basin spilling into a koi pond, red-orange steel columns, planters, brick facade
      epic(s, R, info) {
        const sx = -1;
        const pond = new THREE.Group(); pond.position.set(sx * 10, 0, 0); s.add(pond);
        M(box(9, 0.42, SEG_LEN), mat(0x3a3f46, { rough: 0.7 }), 0, 0.21, 0, pond, true);
        flat(plane(8.4, SEG_LEN), mat(0x1d2a2e, { rough: 1 }), 0, 0.425, 0, pond);
        const pw = flat(plane(8.4, SEG_LEN), W.pond, 0, 0.43, 0, pond);
        s.userData.wakers.push((w) => { pw.position.y = 0.3 + 0.14 * w; pw.visible = w > 0.05; });
        for (let i = 0; i < 4; i++) {
          const koi = M(geo('koi', () => { const g = new THREE.SphereGeometry(0.22, 8, 6); g.scale(0.5, 0.3, 1.5); return g; }), mat(i % 3 ? 0xff7a2a : 0xf3efe6, { rough: 0.4 }), -2 + i * 1.3, 0.36, -10 + i * 6, pond);
          koi.userData.dynamic = true;
          const cx = koi.position.x, cz = koi.position.z, ph = i * 1.7, r = 1 + (i % 2) * 1.2;
          s.userData.anims.push((t) => { const a = t * 0.5 + ph; koi.position.x = cx + Math.sin(a) * r; koi.position.z = cz + Math.cos(a) * r; koi.rotation.y = a + Math.PI / 2; });
        }
        if (info.k === 3 || info.k === 6) {
          const b = new THREE.Group(); b.position.set(sx * 7.8, 0, info.k === 3 ? -4 : 3); b.rotation.y = 0.4; s.add(b);
          M(cyl(2.6, 2.3, 1.4, 6), mat(0x2a2733, { rough: 0.35, metal: 0.2 }), 0, 0.7, 0, b, true);
          const top = M(cyl(2.4, 2.4, 0.05, 6), W.pool, 0, 1.2, 0, b);
          const spill = M(cyl(2.62, 2.75, 1.3, 6), W.sheet, 0, 0.7, 0, b);
          s.userData.wakers.push((w) => { top.position.y = 0.6 + 0.62 * w; spill.scale.y = Math.max(0.01, w); spill.position.y = 1.35 - 0.65 * w; });
        }
        for (const cx of [-1, 1]) for (let i = 0; i < 2; i++) M(cyl(0.28, 0.28, 7, 14), mat(0xe2531e, { rough: 0.45, metal: 0.3 }), cx * 5.6, 3.5, -10 + i * 20, s, true);
        for (const z of [-5, 5]) { M(cyl(0.7, 0.6, 1.1, 8), mat(0x6e3a8c, { rough: 0.8 }), 6.6, 0.55, z, s, true); M(ico(0.6, 1), mat(z > 0 ? 0xff5a8a : 0xffc845, { flat: true }), 6.6, 1.35, z, s); }
        if (info.k % 3 !== 2) M(box(30, 14, SEG_LEN), mat(0xffffff, { map: T.facade, rough: 0.85 }), 40, 7, 0, s);
        self.visitor(s, s, 200 + info.k, 5.0, 0, 0, 'walk', { walk: 9 });
      },
      // McKinney City Hall — steel hopper on a steel frame, brick + glass civic building, gravel beds with grasses
      mckinney(s, R, info) {
        M(box(26, 16, SEG_LEN), mat(0xffffff, { map: T.facade, rough: 0.85 }), 36, 8, 0, s);
        M(box(1.2, 16.4, SEG_LEN * 0.6), mat(0xffffff, { map: T.glass, rough: 0.1, metal: 0.6 }), 22.6, 8.2, 0, s);
        for (const [x, z] of [[-6, -12], [-6.4, -6], [-5.8, 1], [6, -9], [6.3, 4], [5.9, 11], [-6.2, 9]]) { const g2 = M(cone(0.35, 0.9, 7), mat(0x8aa05a, { flat: true }), x, 0.45, z, s); g2.rotation.z = 0.12; }
        if (info.k === 2 || info.k === 6 || info.k === 8) {
          const g = new THREE.Group(); g.position.set(-8.5, 0, info.k === 6 ? 3 : -3); s.add(g);
          const steel = mat(0x6f777e, { rough: 0.35, metal: 0.85 });
          for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) M(box(0.22, 6, 0.22), steel, px, 3, pz, g, true);
          for (const y of [2.2, 5.8]) { M(box(3.4, 0.18, 0.18), steel, 0, y, -1.6, g); M(box(3.4, 0.18, 0.18), steel, 0, y, 1.6, g); M(box(0.18, 0.18, 3.4), steel, -1.6, y, 0, g); M(box(0.18, 0.18, 3.4), steel, 1.6, y, 0, g); }
          M(cyl(1.5, 1.5, 2.2, 20), mat(0xc9ced2, { rough: 0.25, metal: 0.9 }), 0, 6.9, 0, g, true);
          M(cone(1.5, 2.2, 20), mat(0xc9ced2, { rough: 0.25, metal: 0.9 }), 0, 4.7, 0, g, true).rotation.x = Math.PI;
          const fall = M(cyl(0.12, 0.35, 3.6, 12), W.jet, 0, 1.8, 0, g);
          M(cyl(1.8, 1.9, 0.5, 20), mat(0x6a6f74, { rough: 0.7 }), 0, 0.25, 0, g, true);
          const basin = flat(geo('disc17', () => new THREE.CircleGeometry(1.7, 20)), W.pool, 0, 0.3, 0, g);
          s.userData.wakers.push((w) => { fall.scale.y = Math.max(0.01, w); fall.position.y = 3.6 - 1.8 * w; basin.position.y = 0.05 + 0.45 * w; });
        }
      },
      // 3300 Olympus Drive — stepped cascades both sides of a striped walk, row of trees, bronze sculpture
      olympus(s, R, info) {
        for (const sx of [-1, 1]) {
          for (let step = 0; step < 6; step++) {
            const z = SEG_LEN / 2 - 2.5 - step * 5, hgt = 0.5 + ((step + info.k) % 6) * 0.25;
            M(box(4.2, hgt, 4.8), mat(0x3a3e44, { rough: 0.4 }), sx * 7.2, hgt / 2 - 0.2, z, s, true);
            const pool = flat(plane(3.8, 4.4), W.pool, sx * 7.2, hgt - 0.18, z, s);
            const lip = M(plane(3.8, Math.max(0.2, hgt - 0.1)), W.sheet, sx * 7.2, (hgt - 0.2) / 2, z + 2.42, s);
            s.userData.wakers.push((w) => { pool.position.y = hgt - 0.6 + 0.42 * w; lip.scale.y = Math.max(0.01, w); });
          }
          for (let i = 0; i < 3; i++) { const z = -10 + i * 10; M(box(1.6, 0.6, 1.6), mat(0xd8d4c8), sx * 11.2, 0.3, z, s, true); self.tree(s, sx * 11.2, z, 0.9, info.k * 3 + i + (sx > 0 ? 50 : 0)); }
        }
        if (info.k === 5) {
          const g = new THREE.Group(); g.position.set(13.5, 0, 0); s.add(g);
          const bronze = mat(0x3d2a1e, { rough: 0.35, metal: 0.8 });
          M(sph(1.2, 14), bronze, 0, 2.1, 0, g, true).scale.set(1.5, 1.0, 0.95);
          M(sph(0.75, 12), bronze, 1.5, 2.6, 0, g, true);
          for (const [lx, lz] of [[-0.9, 0.5], [0.9, 0.5], [-0.9, -0.5], [0.9, -0.5]]) M(cyl(0.25, 0.28, 1.4, 8), bronze, lx, 0.7, lz, g, true);
          M(box(3.4, 0.2, 2), mat(0xd8d4c8), 0, 0.1, 0, g);
        }
        if (info.k % 2) M(box(40, 22, SEG_LEN * 0.8), mat(0xffffff, { map: T.glass, rough: 0.08, metal: 0.7 }), 44, 11, 0, s);
      },
      // Aggie Park — pedestrian bridge over a boulder-edged pond with stepping stones; lawns on the far shores
      aggie(s, R, info) {
        for (const sx of [-1, 1]) {
          M(box(0.4, 0.9, SEG_LEN), mat(0x7a5232, { rough: 0.8 }), sx * 3.95, -0.4, 0, s, true);
          for (let i = 0; i < 6; i++) M(box(0.12, 1.1, 0.12), mat(0x2b2f35, { metal: 0.6, rough: 0.4 }), sx * 3.95, 0.55, -SEG_LEN / 2 + i * 5 + 2.5, s);
          M(box(0.1, 0.08, SEG_LEN), mat(0x2b2f35, { metal: 0.6, rough: 0.4 }), sx * 3.95, 1.1, 0, s);
          M(box(0.06, 0.06, SEG_LEN), mat(0x2b2f35, { metal: 0.6, rough: 0.4 }), sx * 3.95, 0.6, 0, s);
          M(box(1.0, 1.4, SEG_LEN), mat(0x5a4a3a, { rough: 0.8 }), sx * 3.6, -1.5, 0, s);
          // shoreline: sloped bank of boulders
          M(box(1.6, 1.8, SEG_LEN), mat(0x8c7a5c, { rough: 0.95 }), sx * 16.2, -0.75, 0, s);
          for (let i = 0; i < 5; i++) { const b = M(ico(0.7 + (i % 3) * 0.25, 0), mat([0xb98a5e, 0xa5764c, 0xc9a07a][i % 3], { rough: 0.9, flat: true }), sx * (15.2 - (i % 2) * 0.6), -0.6, -12 + i * 6, s, true); b.rotation.set(i, i * 2, 0); }
        }
        const pond = flat(plane(32, SEG_LEN), W.pond, 0, -1.6, 0, s);
        flat(plane(32, SEG_LEN), mat(0x3d5a4a, { rough: 1 }), 0, -2.6, 0, s);
        s.userData.wakers.push((w) => { pond.position.y = -2.4 + 0.8 * w; });
        if (info.k % 2 === 0) for (let i = 0; i < 5; i++) { const x = -7 - i * 1.6, z = -6 + i * 2.2; M(cyl(0.6, 0.7, 0.4, 7), mat(0xb98a5e, { rough: 0.9, flat: true }), x, -1.25, z, s); if (i === 2 || i === 4) self.visitor(s, s, 300 + info.k + i, x, z, 0.5, 'wave', { y: -1.05, kid: true }); }
        if (info.k % 3 === 0) for (const sx of [-1, 1]) { const a = M(torus(3.6, 0.12, Math.PI, 8, 24), mat(0x2b2f35, { metal: 0.6, rough: 0.4 }), sx * 3.95, 0, 0, s); a.rotation.y = Math.PI / 2; }
        self.visitor(s, s, 310 + info.k, 2.6, 0, 0, 'walk', { walk: 10, y: 0 });
      },
      // Dallas Arboretum — water curtain from an elevated walkway into a stone-edged stream, autumn trees
      arboretum(s, R, info) {
        const sx = 1;
        M(box(5, 0.6, SEG_LEN), mat(0x6b6458, { rough: 0.9 }), sx * 8.2, -0.45, 0, s);
        const stream = flat(plane(4.4, SEG_LEN), W.channel, sx * 8.2, -0.1, 0, s);
        s.userData.wakers.push((w) => { stream.position.y = -0.5 + 0.42 * w; });
        for (let i = 0; i < 10; i++) { const z = -SEG_LEN / 2 + i * 3 + 0.5; for (const e of [-1, 1]) { const b = M(ico(0.6 + ((i + e) % 3) * 0.1, 0), mat(0xb7a585, { rough: 0.9, flat: true }), sx * 8.2 + e * 2.5, 0, z, s, true); b.rotation.y = i; } }
        if (info.k % 4 === 1) {
          const g = new THREE.Group(); g.position.set(sx * 9, 0, 0); s.add(g);
          for (const pz of [-4, 4]) M(box(0.4, 4.2, 0.4), mat(0x6f777e, { metal: 0.6, rough: 0.4 }), sx * 1.5, 2.1, pz, g, true);
          M(box(4.4, 0.35, 10), mat(0xb9b3a6), 0, 4.3, 0, g, true);
          M(box(4.4, 0.9, 0.08), mat(0x8fb8c8, { opacity: 0.45, rough: 0 }), 0, 4.9, 0, g);
          const curtain = M(plane(8.5, 3.9), W.sheet, -sx * 0.9, 2.2, 0, g); curtain.rotation.y = Math.PI / 2;
          s.userData.wakers.push((w) => { curtain.scale.y = Math.max(0.01, w); curtain.position.y = 4.1 - 1.95 * w; });
          for (let i = 0; i < 3; i++) self.visitor(g, s, 400 + info.k + i, 0.5 - i * 0.7, -2 + i * 2, -Math.PI / 2, i === 1 ? 'wave' : 'watch', { y: 4.47, kid: i === 1 });
        }
        for (const [x, z] of [[-7, -10], [-7.5, 8]]) self.tree(s, x, z, 1.1, info.k + x, 'autumn');
      },
      // Chase Tower — domed building behind long reflecting basins with rows of bubbler jets
      chase(s, R, info) {
        for (const sx of [-1, 1]) {
          M(box(4.6, 0.7, SEG_LEN), mat(0xd9c8a8, { rough: 0.6 }), sx * 7.6, 0.35, 0, s, true);
          const pool = flat(plane(4.0, SEG_LEN), W.pool, sx * 7.6, 0.6, 0, s);
          const jets = [];
          for (let i = 0; i < 6; i++) { const j = M(cyl(0.05, 0.14, 1.0, 8), W.jet, sx * 7.6 + (i % 2 ? 0.8 : -0.8), 1.1, -SEG_LEN / 2 + 2.5 + i * 5, s); jets.push(j); }
          s.userData.wakers.push((w, t) => { pool.position.y = 0.2 + 0.48 * w; jets.forEach((j, i) => { const k = w * (0.8 + 0.2 * Math.sin(t * 6 + i)); j.scale.y = Math.max(0.01, k); j.position.y = 0.68 + 0.5 * k; }); });
          for (const z of [-8, 8]) { M(ico(0.55, 0), mat(0x6a8a5a, { flat: true }), sx * 10.6, 0.4, z, s); for (let k = 0; k < 6; k++) { const leaf = M(cone(0.12, 1.0, 4), mat(0x7f9f8a, { flat: true }), sx * 10.6, 0.7, z, s); leaf.rotation.set(Math.cos(k) * 0.9, 0, Math.sin(k) * 0.9); } }
        }
        if (info.k === 1 || info.k === 6) {
          const g = new THREE.Group(); g.position.set(26, 0, -6); s.add(g);
          M(cyl(10, 10, 9, 32), mat(0xd9c8a8, { rough: 0.6 }), 0, 4.5, 0, g);
          M(cyl(9.2, 9.6, 6, 32), mat(0xffffff, { map: T.glass, rough: 0.1, metal: 0.6 }), 0, 12, 0, g);
          M(cyl(10.2, 10.2, 0.6, 32), mat(0xb7a688), 0, 9.2, 0, g);
          M(geo('dome', () => new THREE.SphereGeometry(9.4, 32, 14, 0, TAU, 0, Math.PI / 2)), mat(0x5f8f84, { rough: 0.45, metal: 0.55 }), 0, 15, 0, g);
          for (let i = 0; i < 12; i++) { const rib = M(torus(9.45, 0.12, Math.PI / 2, 6, 16), mat(0x7aa89c, { metal: 0.6, rough: 0.4 }), 0, 15, 0, g); rib.rotation.set(0, (i / 12) * TAU, Math.PI / 2); }
        }
        self.visitor(s, s, 500 + info.k, -5.1, 0, 0, 'walk', { walk: 8 });
        self.visitor(s, s, 510 + info.k, 5.1, 4, 0, 'walk', { walk: 7, optional: true });
      },
      // Commons at Agora — the destination: an evening splash pad of illuminated ground jets
      agora(s, R, info) {
        for (const sx of [-1, 1]) {
          const field = new THREE.Group(); field.position.set(sx * 9.5, 0, 0); s.add(field);
          const jets = [];
          for (let i = 0; i < 10; i++) {
            const x = (i % 2 ? -1 : 1) * (1 + (i * 0.7) % 3), z = -SEG_LEN / 2 + 2 + i * 2.8;
            const j = M(cyl(0.05, 0.16, 2.2, 8), W.glowJet, x, 1.1, z, field);
            M(geo('nozzle', () => new THREE.CircleGeometry(0.22, 12)), mat(0x9fffc0, { emissive: 0x30ff80, ei: 1.5 }), x, 0.01, z, field).rotation.x = -Math.PI / 2;
            jets.push(j);
          }
          s.userData.wakers.push((w, t) => jets.forEach((j, i) => { const k = w * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 0.7))); j.scale.y = Math.max(0.01, k); j.position.y = 1.1 * k; }));
          for (let i = 0; i < 3; i++) self.lamp(s, sx * 5.4, -10 + i * 10, true);
          self.visitor(field, s, 600 + info.k + (sx > 0 ? 5 : 0), 0.5, -4, 0.3, 'splash', { kid: true });
          self.visitor(field, s, 601 + info.k + (sx > 0 ? 5 : 0), -0.8, 5, 2, 'splash', { kid: true, optional: true });
        }
        if (info.k === 5) {
          const g = new THREE.Group(); g.position.set(0, 0, -2); s.add(g);
          for (const sx of [-1, 1]) {
            const big = M(cyl(0.12, 0.5, 9, 12), W.glowJet, sx * 6.5, 4.5, 0, g);
            s.userData.wakers.push((w, t) => { const k = w * (0.7 + 0.3 * Math.sin(t * 2.2 + sx)); big.scale.y = Math.max(0.01, k); big.position.y = 4.5 * k; });
          }
        }
      },
    };
  }

  // ------------------------------------------------ obstacles & pickups (same hitboxes everywhere; skins match each project)
  obstacle(type, lane, zone, z) {
    const g = new THREE.Group(); g.position.set(lane * LANE, 0, z);
    const zid = zone.id, night = !!zone.night, W = waterMats();
    const o = { kind: 'obs', type, lane, z, g, anims: [] };
    const stone = mat(0xb3ab9c, { rough: 0.8 }), steel = mat(0x6f777e, { rough: 0.35, metal: 0.8 }), dark = mat(0x2f333a, { rough: 0.5 });
    if (type === 'low') {          // jump over
      if (zid === 'olympus' || zid === 'chase') { M(box(1.9, 0.75, 0.5), zid === 'chase' ? mat(0xd9c8a8, { rough: 0.6 }) : mat(0x3a3e44, { rough: 0.4 }), 0, 0.375, 0, g, true); M(plane(1.8, 0.7), W.sheet, 0, 0.36, 0.26, g); }
      else if (zid === 'epic' || zid === 'mckinney') { M(box(1.9, 0.62, 0.55), zid === 'epic' ? mat(0x6e3a8c, { rough: 0.8 }) : stone, 0, 0.31, 0, g, true); for (const x of [-0.55, 0, 0.55]) M(ico(0.24, 1), mat(zid === 'epic' ? 0xff5a8a : 0x8aa05a, { flat: true }), x, 0.78, 0, g); }
      else if (zid === 'aggie' || zid === 'arboretum') { M(ico(0.62, 0), mat(0xb98a5e, { rough: 0.9, flat: true }), -0.45, 0.42, 0, g, true).scale.set(1, 0.75, 0.6); M(ico(0.55, 0), mat(0xa5764c, { rough: 0.9, flat: true }), 0.5, 0.38, 0, g, true).scale.set(1, 0.75, 0.6); }
      else { const p = M(cyl(0.28, 0.28, 1.9, 16), mat(night ? 0x1b2433 : 0x005695, { rough: 0.35, metal: 0.5 }), 0, 0.55, 0, g, true); p.rotation.z = Math.PI / 2; for (const x of [-0.7, 0.7]) M(box(0.18, 0.55, 0.4), mat(night ? 0x00c1d5 : 0xffc845, night ? { emissive: 0x00c1d5, ei: 1.5 } : {}), x, 0.27, 0, g); const wh = M(torus(0.22, 0.04, TAU, 6, 14), mat(0xe8402e, { metal: 0.4 }), 0, 0.88, 0, g); wh.rotation.x = Math.PI / 2; }
      o.y0 = 0; o.y1 = 0.92; o.hw = 0.95; o.hd = 0.3;
    } else if (type === 'high') {  // slide under
      const postMat = zid === 'epic' ? mat(0xe2531e, { rough: 0.45, metal: 0.3 }) : zid === 'aggie' ? mat(0x2b2f35, { metal: 0.6, rough: 0.4 }) : zid === 'chase' ? mat(0xd9c8a8, { rough: 0.6 }) : night ? mat(0x1b2433, { emissive: 0x00c1d5, ei: 0.3 }) : steel;
      for (const x of [-0.95, 0.95]) M(box(0.2, 2.6, 0.25), postMat, x, 1.3, 0, g, true);
      M(box(2.1, 0.5, 0.4), postMat, 0, 1.45, 0, g, true);
      const curtain = M(plane(1.75, 0.6), W.sheet, 0, 0.92, 0.05, g);
      o.anims.push((t) => { curtain.scale.y = 0.85 + 0.15 * Math.sin(t * 14); });
      o.y0 = 0.7; o.y1 = 3; o.hw = 0.95; o.hd = 0.25;
    } else if (type === 'block') { // change lanes
      if (zid === 'mckinney') {
        for (const [px, pz] of [[-0.8, -1], [0.8, -1], [-0.8, 1], [0.8, 1]]) M(box(0.14, 3, 0.14), steel, px, 1.5, pz, g, true);
        M(cyl(0.9, 0.9, 1, 16), mat(0xc9ced2, { rough: 0.25, metal: 0.9 }), 0, 2.8, 0, g, true);
        M(cone(0.9, 1.0, 16), mat(0xc9ced2, { rough: 0.25, metal: 0.9 }), 0, 1.8, 0, g, true).rotation.x = Math.PI;
        M(cyl(0.06, 0.2, 1.3, 8), W.jet, 0, 0.65, 0, g);
      } else if (zid === 'aggie' || zid === 'arboretum') {
        M(ico(1.05, 0), mat(0xb98a5e, { rough: 0.9, flat: true }), 0, 0.95, 0, g, true).scale.set(0.95, 1.2, 1.2);
        M(ico(0.7, 0), mat(0xa5764c, { rough: 0.9, flat: true }), 0.3, 2.1, 0.3, g, true);
        if (zid === 'arboretum') { const f = M(plane(1.4, 2.4), W.sheet, 0, 1.3, 1.25, g); }
      } else {
        const baseMat = zid === 'epic' ? mat(0x2a2733, { rough: 0.35, metal: 0.2 }) : zid === 'olympus' ? mat(0x3a3e44, { rough: 0.4 }) : zid === 'chase' ? mat(0xd9c8a8, { rough: 0.6 }) : night ? mat(0x1b2433) : mat(0xffc845, { rough: 0.5 });
        M(box(1.9, 1.1, 2.6), baseMat, 0, 0.55, 0, g, true);
        const pool = flat(plane(1.7, 2.4), night ? W.glowPool : W.pool, 0, 1.11, 0, g);
        const wall = M(plane(1.7, 1.6), night ? W.glowJet : W.sheet, 0, 1.9, 1.32, g);
        const spout = M(cyl(0.08, 0.25, 1.4, 10), night ? W.glowJet : W.jet, 0, 1.8, 0, g);
        o.anims.push((t) => { spout.scale.y = 0.85 + 0.25 * Math.sin(t * 10); });
      }
      o.y0 = 0; o.y1 = 3.2; o.hw = 0.95; o.hd = 1.3;
    } else if (type === 'grate') { // jump over: trench drain spraying water
      M(box(1.9, 0.08, 1.1), mat(0x56636e, { metal: 0.7, rough: 0.4 }), 0, 0.04, 0, g);
      for (let i = -3; i <= 3; i++) M(box(0.06, 0.1, 1.0), dark, i * 0.25, 0.05, 0, g);
      const spray = []; for (const x of [-0.6, 0, 0.6]) { const j = M(cone(0.24, 0.9, 10), night ? W.glowJet : W.jet, x, 0.45, 0, g); j.rotation.x = Math.PI; spray.push(j); }
      o.anims.push((t) => spray.forEach((j, i) => { j.scale.y = 0.7 + 0.35 * Math.abs(Math.sin(t * 9 + i)); }));
      o.y0 = 0; o.y1 = 0.7; o.hw = 0.95; o.hd = 0.5;
    } else if (type === 'jet') {   // timed geyser: blocks the lane while it's up
      M(cyl(0.7, 0.7, 0.06, 18), dark, 0, 0.03, 0, g);
      const glow = M(cyl(0.55, 0.55, 0.07, 18), mat(0xff4d5e, { emissive: 0xff2233, ei: 1.2 }), 0, 0.04, 0, g);
      const col = M(cyl(0.35, 0.6, 1, 14), night ? W.glowJet : W.jet, 0, 0, 0, g);
      o.phase = this.rand() * 1.6; o.period = 1.8;
      o.anims.push((t) => {
        const k = ((t + o.phase) % o.period) / o.period;
        const h = k < 0.45 ? 0.05 : k < 0.55 ? (k - 0.45) * 10 * 3.6 : 3.6 + Math.sin(t * 30) * 0.15;
        col.scale.y = Math.max(0.05, h); col.position.y = h / 2;
        glow.visible = k > 0.3 && k < 0.55 ? Math.sin(t * 40) > 0 : k >= 0.55;
        o.on = k >= 0.5;
      });
      o.y0 = 0; o.y1 = 4; o.hw = 0.6; o.hd = 0.6;
    }
    this.world.add(g); this.objs.push(o);
    return o;
  }

  pickup(kind, lane, z, y = 0.8, extra = {}) {
    const g = new THREE.Group(); g.position.set(lane * LANE, y, z);
    const nightNow = !!zoneAt(this.dist - z).night;
    if (kind === 'drop') { const d = M(DROP_GEO, nightNow ? mat(0x6fe6ff, { rough: 0.08, emissive: 0x0a8aaa, ei: 1.3 }) : mat(0x37b6f0, { rough: 0.08, env: 2 }), 0, -0.25, 0, g); d.scale.setScalar(0.42); }
    else if (kind === 'valve') {
      const gold = mat(0xf5c04a, { rough: 0.2, metal: 0.9 });
      M(torus(0.42, 0.09, TAU, 10, 22), gold, 0, 0, 0, g);
      for (let i = 0; i < 3; i++) { const sp = M(box(0.8, 0.07, 0.07), gold, 0, 0, 0, g); sp.rotation.z = (i / 3) * Math.PI; }
    } else {
      const p = POWERS[extra.power];
      M(sph(0.55, 18), mat(p.col, { opacity: 0.35, rough: 0 }), 0, 0, 0, g);
      const core = extra.power === 'shield' ? M(torus(0.28, 0.07, TAU, 8, 18), mat(p.col, { emissive: p.col, ei: 0.5 }), 0, 0, 0, g)
        : extra.power === 'magnet' ? M(torus(0.26, 0.09, Math.PI, 8, 14), mat(p.col, { emissive: p.col, ei: 0.4 }), 0, 0, 0, g)
        : extra.power === 'mult' ? M(box(0.42, 0.42, 0.12), mat(p.col, { emissive: p.col, ei: 0.4 }), 0, 0, 0, g)
        : M(cone(0.25, 0.55, 10), mat(p.col, { emissive: p.col, ei: 0.4 }), 0, 0, 0, g);
      if (extra.power === 'boost') core.rotation.x = -Math.PI / 2;
    }
    this.world.add(g);
    const o = { kind, lane, z, y, g, ...extra };
    this.objs.push(o);
    return o;
  }

  // one row of obstacles at SPAWN_Z — always leaves at least one way through
  spawnRow() {
    const t = this.t, lv = Math.min(1, t / 70), zone = zoneAt(this.dist - SPAWN_Z), R = this.rand;
    const lanes = [-1, 0, 1];
    const pickType = () => {
      const opts = [['low', 3], ['block', 3], ['high', t > 5 ? 2.5 : 0], ['grate', t > 10 ? 1.6 : 0], ['jet', t > 25 ? 1.5 : 0]];
      let sum = opts.reduce((a, b) => a + b[1], 0), r = R() * sum;
      for (const [k, w] of opts) { if ((r -= w) <= 0) return k; }
      return 'low';
    };
    let n = R() < 0.55 - lv * 0.35 ? 1 : 2;
    if (lv > 0.5 && R() < 0.25) n = 3;
    const near = lanes.filter((l) => Math.abs(l - this.lastFree) <= 1);
    const free = near[Math.floor(R() * near.length)];
    const used = lanes.filter((l) => l !== free).sort(() => R() - 0.5).slice(0, Math.min(2, n));
    const types = used.map(() => pickType());
    if (n === 3) {
      const tf = R() < 0.5 ? 'low' : (t > 5 ? 'high' : 'low');
      this.obstacle(tf, free, zone, SPAWN_Z);
    }
    used.forEach((l, i) => this.obstacle(types[i], l, zone, SPAWN_Z));
    this.lastFree = free;

    if (this.t >= this.nextPower) {
      this.nextPower = this.t + 10 + R() * 4;
      const kinds = ['shield', 'magnet', 'mult', 'boost'];
      this.pickup('power', free, n === 3 ? SPAWN_Z : SPAWN_Z + 6, n === 3 ? 2.3 : 0.9, { power: kinds[Math.floor(R() * kinds.length)] });
    } else if (this.t >= this.nextValve) {
      this.nextValve = this.t + 6 + R() * 5;
      this.pickup('valve', free, n === 3 ? SPAWN_Z : SPAWN_Z + 6, n === 3 ? 2.3 : 0.9);
    } else if (R() < 0.75) {
      const arc = n === 3;
      for (let i = 0; i < 5; i++) {
        const dz = 4.8 - i * 2.4;
        const y = arc ? 0.8 + 1.5 * Math.sin(((i + 0.5) / 5) * Math.PI) : 0.8;
        this.pickup('drop', free, SPAWN_Z + dz + (arc ? 0 : 9), y);
      }
    }
  }

  // ------------------------------------------------ main loop
  frame(ts) {
    const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0;
    this.last = ts; this.clock += dt;
    if (this.state === 'playing' || this.state === 'countdown' || this.dead) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) { this.step(STEP); this.acc -= STEP; n++; }
      if (n >= 8) this.acc = 0;
    } else this.acc = 0;
    this.animate(dt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) sfx.beat(3 - Math.ceil(this.countdown));
      if (this.countdown <= 0) { this.state = 'playing'; this.resumeCount = false; sfx.win(); }
      this.hooks.onCountdown?.(this.countdown);
      return;
    }
    if (this.dead) { this.deathT += dt; return; }
    this.t += dt;
    const base = Math.min(RULES.MAX_SPEED, RULES.START_SPEED + this.t * 0.24);
    this.speed = this.boost > 0 ? base * RULES.BOOST : base;
    const dz = this.speed * dt;
    this.dist += dz;
    for (const k of ['magnet', 'mult', 'boost', 'stumble', 'inv']) this[k] = Math.max(0, this[k] - dt);

    for (const s of this.segs) {
      s.position.z += dz;
      if (s.position.z - SEG_LEN / 2 > KILL_Z) { s.position.z -= SEG_LEN * SEG_COUNT; this.buildSegment(s); }
    }
    this.rowDist -= dz;
    if (this.rowDist <= 0) { this.spawnRow(); this.rowDist = this.speed * Math.max(0.62, 1.15 - this.t * 0.0065) / (this.boost > 0 ? RULES.BOOST : 1); }

    const tx = this.lane * LANE;
    this.px += (tx - this.px) * Math.min(1, dt * 16);
    if (Math.abs(tx - this.px) < 0.01) this.px = tx;
    this.vy += GRAVITY * dt; this.py += this.vy * dt;
    if (this.py <= 0) { if (this.vy < -6) this.splash(this.px, 0.05, 0, 8); this.py = 0; this.vy = 0; }
    this.slideT = Math.max(0, this.slideT - dt);

    // journey progress
    const zone = zoneAt(this.dist);
    if (zone !== this.zone) {
      this.zone = zone; if (!this.zonesSeen.includes(zone.id)) this.zonesSeen.push(zone.id);
      this.hooks.onZone?.(zone, false); sfx.zone();
    }
    if (!this.arrived && this.dist >= JOURNEY - ZONE_LEN + SEG_LEN * 5) { this.arrived = true; sfx.win(); this.splash(this.px, 1.5, -3, 40); this.hooks.onArrive?.(); }
    this.lap = Math.floor(this.dist / JOURNEY);

    const ph = this.slideT > 0 ? SLIDE_H : STAND_H;
    for (const o of this.objs) {
      o.z += dz; o.g.position.z = o.z;
      if (o.kind === 'obs') {
        if (o.hit || Math.abs(o.z) > o.hd + 0.35) continue;
        if (Math.abs(o.g.position.x - this.px) > o.hw + 0.36) continue;
        if (o.type === 'jet' && !o.on) continue;
        if (this.py + ph <= o.y0 || this.py >= o.y1) continue;
        this.collide(o);
      } else {
        if (this.magnet > 0 && o.kind === 'drop' && o.z > -14 && o.z < 1) {
          o.lane = null; const k = Math.min(1, dt * 10);
          o.g.position.x += (this.px - o.g.position.x) * k; o.y += (this.py + 0.7 - o.y) * k; o.z += (0 - o.z) * k * 0.6; o.g.position.z = o.z;
        }
        o.g.position.y = o.y;
        const reach = this.boost > 0 ? 1.4 : 0.8;
        if (Math.abs(o.z) < reach && Math.abs(o.g.position.x - this.px) < (this.boost > 0 ? 2.6 : 0.8) && Math.abs(o.y - (this.py + 0.6)) < 1.0) this.collect(o);
      }
    }
    this.objs = this.objs.filter((o) => {
      if (o.dead || o.z > KILL_Z) { this.world.remove(o.g); return false; }
      return true;
    });
    this.score = Math.floor(this.dist) + this.bonus;
  }

  collide(o) {
    if (this.boost > 0) { o.hit = true; this.smash(o); return; }
    if (this.inv > 0) return;
    const sideways = Math.abs(this.px - this.lane * LANE) > 0.35 && o.lane === this.lane;
    if (this.shield) {
      this.shield = false; this.inv = 1.0; o.hit = true; sfx.shield(); this.smash(o);
      this.hooks.onToast?.('Pressure Regulator saved you!');
      return;
    }
    if (sideways && this.stumble <= 0) {
      this.lane = this.fromLane; this.stumble = 4; this.inv = 0.4; sfx.bad(); this.ouch = 0.6;
      this.hooks.onToast?.('Careful! Another bump and you\'re out.');
      return;
    }
    this.die(o.type);
  }
  smash(o) { this.splash(o.g.position.x, 1, o.z, 22); o.g.visible = false; }

  collect(o) {
    o.dead = true;
    const m = this.mult > 0 ? RULES.MULT : 1;
    if (o.kind === 'drop') { this.drops++; this.bonus += RULES.DROP * m; this.combo++; this.happy = 0.35; sfx.drop(Math.min(8, this.combo % 9)); }
    else if (o.kind === 'valve') { this.valves++; this.bonus += RULES.VALVE * m; this.happy = 0.8; sfx.valve(); this.hooks.onPop?.(`+${RULES.VALVE * m} Golden valve`); }
    else {
      this.powerups++; this.bonus += RULES.POWERUP; const p = POWERS[o.power]; this.happy = 0.8;
      if (o.power === 'shield') this.shield = true; else this[o.power] = p.dur;
      sfx.power(); this.hooks.onPop?.(`${p.label}: ${p.note}`);
    }
    this.splash(o.g.position.x, o.y, o.z, o.kind === 'drop' ? 5 : 14);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0;
    sfx.hit(); this.splash(this.px, 0.8, 0, 36);
    setTimeout(() => { this.state = 'over'; this.hooks.onGameOver?.(this.result(cause)); }, 900);
  }
  result(cause) {
    const stop = this.arrived ? ZONES.length : Math.min(ZONES.length, Math.floor(this.dist / ZONE_LEN) + 1);
    return { score: this.score, durationMs: Math.round(this.t * 1000), distance: Math.floor(this.dist), drops: this.drops, valves: this.valves, powerups: this.powerups, zones: [...this.zonesSeen], arrived: this.arrived, laps: this.lap, stop, cause };
  }

  // ------------------------------------------------ visuals
  makeParticles() {
    const N = 320, g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dc = dot.getContext('2d'), grd = dc.createRadialGradient(16, 16, 2, 16, 16, 15);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(200,245,255,.9)'); grd.addColorStop(1, 'rgba(200,245,255,0)');
    dc.fillStyle = grd; dc.fillRect(0, 0, 32, 32);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), size: 0.22, transparent: true, depthWrite: false }));
    pts.frustumCulled = false; this.scene.add(pts);
    return { pts, pos, vel: new Float32Array(N * 3), life: new Float32Array(N), n: N, i: 0 };
  }
  splash(x, y, z, n) {
    const P = this.particles; if (REDUCED) n = Math.ceil(n / 3);
    for (let k = 0; k < n; k++) {
      const i = P.i = (P.i + 1) % P.n;
      P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
      P.vel[i * 3] = (Math.random() - 0.5) * 5; P.vel[i * 3 + 1] = 2 + Math.random() * 4; P.vel[i * 3 + 2] = (Math.random() - 0.5) * 5;
      P.life[i] = 0.5 + Math.random() * 0.4;
    }
  }

  // ---- distant scenery per stop (built once, cached, follows the camera so it reads as far away)
  backdropFor(zone) {
    if (this.backdrops.has(zone.back)) return this.backdrops.get(zone.back);
    const g = new THREE.Group(), R = mulberry(zone.back.length * 97 + 3), night = zone.back === 'nightcity';
    flat(geo('farground', () => new THREE.CircleGeometry(330, 40)), mat(zone.hill, { rough: 1 }), 0, -3, 0, g).receiveShadow = false;
    // rolling hills on the horizon
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.02 + 0.96 * (i / 15)), d = 175 + (i % 3) * 12;
      const h = M(ico(34 + (i % 4) * 8, 1), mat(zone.hill, { rough: 1, flat: true }), Math.cos(a) * d, -10, Math.sin(a) * d, g);
      h.scale.y = 0.42 + (i % 3) * 0.08;
    }
    // tree line between the park and the hills
    const leaf = zone.back === 'autumn' ? [0xc9772b, 0xd99a3a, 0x9c4a2a, 0xb58f3a] : night ? [0x0f1a24, 0x142230] : [0x3f6e38, 0x4a7d40, 0x355f31];
    for (let i = 0; i < 46; i++) {
      const a = -Math.PI * (0.03 + 0.94 * (i / 45)), d = 108 + (i % 5) * 6;
      const t = M(ico(4 + (i % 4), 1), mat(leaf[i % leaf.length], { rough: 1, flat: true }), Math.cos(a) * d, 3.5, Math.sin(a) * d, g);
      t.scale.y = 1.25;
    }
    // skylines
    if (['town', 'city', 'nightcity'].includes(zone.back)) {
      const n = zone.back === 'town' ? 10 : 18;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * (0.18 + 0.64 * (i / (n - 1))), d = 135 + (i % 4) * 10;
        const hgt = zone.back === 'town' ? 14 + (i % 3) * 6 : 25 + ((i * 37) % 50), w = 9 + (i % 3) * 4;
        const m = night ? cachedMat('night-windows', () => new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 0.6, map: textures().windows, emissive: 0xffffff, emissiveMap: textures().windows, emissiveIntensity: 0.9 })) : mat(0xffffff, { map: textures().glass, rough: 0.2, metal: 0.5 });
        M(box(w, hgt, w), m, Math.cos(a) * d, hgt / 2 - 2, Math.sin(a) * d, g);
      }
    }
    if (zone.back === 'stadium') {
      const st = new THREE.Group(); st.position.set(-70, -2, -120); g.add(st);
      M(cyl(34, 30, 22, 28, ), mat(0x9a9da2, { rough: 0.6 }), 0, 11, 0, st);
      M(cyl(36, 36, 2, 28), mat(0x5a5e63, { rough: 0.5, metal: 0.4 }), 0, 23, 0, st);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; M(box(1, 16, 1), mat(0xdddddd), Math.cos(a) * 36, 30, Math.sin(a) * 36, st); }
    }
    g.visible = false; this.scene.add(g); this.backdrops.set(zone.back, g);
    return g;
  }
  makeSkyLayer() {
    const sky = this.skyLayer = new THREE.Group(); this.scene.add(sky);
    // soft sun / moon disc
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,250,230,.95)'); gr.addColorStop(0.5, 'rgba(255,230,180,.35)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true, toneMapped: false }));
    this.sunSprite.scale.setScalar(70); sky.add(this.sunSprite);
    // clouds: clusters of soft lit puffs, drifting slowly
    this.clouds = [];
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc8ccd2, fog: false, transparent: true, opacity: 0.92, flatShading: true });
    this.cloudMat = cm;
    for (let i = 0; i < 9; i++) {
      const cl = new THREE.Group(), a = -Math.PI * (0.08 + 0.84 * (i / 8)), d = 190 + (i % 3) * 30;
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(ico(7 + (k % 3) * 3, 1), cm); p.position.set((k - 2) * 8, (k % 2) * 3, (k % 3) * 3); p.scale.y = 0.55; cl.add(p); }
      cl.position.set(Math.cos(a) * d, 60 + (i % 4) * 9, Math.sin(a) * d); cl.userData.base = cl.position.x;
      sky.add(cl); this.clouds.push(cl);
    }
    // stars for the evening
    const N = 300, pos = new Float32Array(N * 3), R = mulberry(77);
    for (let i = 0; i < N; i++) { const a = R() * TAU, e = 0.12 + R() * 1.3, d = 280; pos[i * 3] = Math.cos(a) * Math.cos(e) * d; pos[i * 3 + 1] = Math.sin(e) * d; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * d; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    sky.add(this.stars);
  }
  // floating ambience around the camera: sparkles, pollen, mist, autumn leaves, golden motes, fireflies
  makeAmbient() {
    const N = MOBILE ? 90 : 170, g = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), R = mulberry(5);
    for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 44; pos[i * 3 + 1] = 0.3 + R() * 9; pos[i * 3 + 2] = -60 + R() * 66; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: this.particles.pts.material.map, size: 0.18, transparent: true, depthWrite: false, opacity: 0.8, color: 0xffffff });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; this.scene.add(pts);
    return { pts, pos, n: N, seed: Array.from({ length: N }, () => R() * TAU), fx: null };
  }
  updateAmbient(dt, t, moving) {
    const A = this.ambient, z = this.zone, m = A.pts.material;
    if (A.fx !== z.fx) {
      A.fx = z.fx;
      const look = { sparkle: [0xe8fbff, 0.16, 0.7], pollen: [0xfff6c8, 0.12, 0.6], mist: [0xffffff, 0.9, 0.18], leaves: [0xd98a2b, 0.3, 0.95], motes: [0xffd58a, 0.14, 0.75], fireflies: [0xd8ff7a, 0.22, 1] }[z.fx];
      m.color.setHex(look[0]); m.size = look[1]; m.opacity = look[2]; m.blending = z.fx === 'fireflies' || z.fx === 'motes' ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true;
    }
    const P = A.pos, adv = moving ? this.speed * dt : 0, fx = z.fx;
    for (let i = 0; i < A.n; i++) {
      const ph = A.seed[i]; let x = P[i * 3], y = P[i * 3 + 1], zz = P[i * 3 + 2];
      zz += adv;
      if (fx === 'leaves') { y -= dt * 0.9; x += Math.sin(t * 1.5 + ph) * dt * 0.8; }
      else if (fx === 'mist') { y = 0.4 + (ph % 1) * 1.2; x += Math.sin(t * 0.3 + ph) * dt * 0.3; }
      else if (fx === 'fireflies') { x += Math.sin(t * 0.7 + ph) * dt * 0.9; y += Math.cos(t * 0.9 + ph) * dt * 0.5; }
      else { y += Math.sin(t * 0.5 + ph) * dt * 0.15; x += Math.cos(t * 0.4 + ph) * dt * 0.15; }
      if (zz > 8) zz -= 68; if (y < 0.1) y = 8 + (ph % 1); if (y > 10) y = 0.5;
      if (fx !== 'mist' && Math.abs(x) < 4.2 && y < 2.5) x += x < 0 ? -3 : 3;   // keep the lanes clear
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = zz;
    }
    if (fx === 'fireflies') m.opacity = 0.6 + 0.4 * Math.sin(t * 3);
    A.pts.geometry.attributes.position.needsUpdate = true;
    A.pts.position.x = this.camera.position.x * 0.5;
  }

  applyLook(z, k) {
    this.skyU.top.value.lerp(new THREE.Color(z.top), k);
    this.skyU.bottom.value.lerp(new THREE.Color(z.bottom), k);
    this.scene.fog.color.copy(this.skyU.bottom.value);
    this.hemi.intensity += (z.hemi - this.hemi.intensity) * k;
    this.sun.intensity += (z.sunI - this.sun.intensity) * k;
    this.sun.color.lerp(new THREE.Color(z.sun), k);
    this.night.intensity += ((z.night ? 6 : 0) - this.night.intensity) * k;
    this.renderer.toneMappingExposure += ((z.night ? 1.25 : 1.0) - this.renderer.toneMappingExposure) * k;
  }

  animate(dt) {
    const t = this.clock, P = this.particles, running = this.state === 'playing' && !this.dead;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -50; continue; }
      P.life[i] -= dt; P.vel[i * 3 + 1] -= 14 * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += (P.vel[i * 3 + 2] + (running ? this.speed : 0)) * dt;
    }
    P.pts.geometry.attributes.position.needsUpdate = true;
    // water motion
    const W = waterMats(), T = textures();
    T.waterN.offset.set(t * 0.02, -t * 0.06);
    for (const m of [W.sheet, W.jet, W.glowJet]) m.map.offset.y = (m.map.offset.y - dt * (m === W.sheet ? 1.6 : 2.4)) % 1;
    // segments: scenery animations + "waking" the water features as Drip approaches
    this.nearProject = null;
    for (const s of this.segs) {
      const u = s.userData;
      const nearSeg = s.position.z > -88;
      if (u.detailOn !== nearSeg) { u.detailOn = nearSeg; for (const o of u.detail || []) o.visible = nearSeg; }
      if (nearSeg) for (const a of u.anims) a(t);
      if (s.position.z > -55 && u.wake < 1) {
        if (!u.woke) { u.woke = true; if (running && u.wakers.length > 2) sfx.sparkle?.(); }
        u.wake = Math.min(1, u.wake + dt * 0.9);
      }
      if (this.state === 'idle') u.wake = 1;
      for (const w of u.wakers) w(u.wake, t);
      if (u.boards.length) { const bz = s.position.z + u.boardZ; if (bz > -75 && bz < 4) this.nearProject = u.project; }
    }
    for (const o of this.objs) {
      if (o.anims) for (const a of o.anims) a(t);
      if (o.kind !== 'obs') { o.g.rotation.y = t * 3; if (o.kind === 'drop') o.g.position.y = o.y + Math.sin(t * 5 + o.z) * 0.06; }
    }
    // time of day follows the journey
    this.applyLook(this.zone, Math.min(1, dt * 0.8));
    const bd = this.backdropFor(this.zone);
    if (bd !== this.backdrop) { if (this.backdrop) this.backdrop.visible = false; bd.visible = true; this.backdrop = bd; }
    bd.position.set(this.camera.position.x, 0, this.camera.position.z);
    this.skyLayer.position.set(this.camera.position.x, 0, this.camera.position.z);
    const sdir = this.sunDir || new THREE.Vector3(0, 1, 0);
    this.sunSprite.position.set(sdir.x * 240, Math.max(18, sdir.y * 240), Math.min(-60, sdir.z * 240 - 120));
    this.sunSprite.material.color.copy(this.sun.color);
    this.sunSprite.scale.setScalar(this.zone.night ? 26 : 70);
    const nightK = this.zone.night ? 1 : 0;
    this.stars.material.opacity += (nightK * 0.9 - this.stars.material.opacity) * Math.min(1, dt);
    this.cloudMat.opacity += ((this.zone.night ? 0.15 : 0.92) - this.cloudMat.opacity) * Math.min(1, dt);
    this.cloudMat.color.lerp(new THREE.Color(this.zone.id === 'chase' ? 0xffc9a0 : this.zone.id === 'arboretum' ? 0xfff0d8 : 0xffffff), Math.min(1, dt));
    for (const cl of this.clouds) cl.position.x = cl.userData.base + Math.sin(t * 0.01 + cl.userData.base) * 20 + t * 0.4 % 40;
    this.updateAmbient(dt, t, running);
    // Drip splashes through puddles on wet walkways
    for (const s of this.segs) for (const pd of s.userData.puddles || []) {
      const wz = s.position.z + pd.z;
      if (!pd.hit && running && Math.abs(wz) < 0.7 && Math.abs(pd.x - this.px) < 0.9 && this.py < 0.05) { pd.hit = true; this.splash(this.px, 0.1, 0, REDUCED ? 6 : 18); sfx.splash(); }
    }
    const sd = this.zone.sunDir; const want = new THREE.Vector3(sd[0], sd[1], sd[2]).normalize();
    this.sunDir = (this.sunDir || want.clone()).lerp(want, Math.min(1, dt * 0.8)).normalize();
    this.sun.position.set(this.px + this.sunDir.x * 30, this.sunDir.y * 30, -6 + this.sunDir.z * 30);
    this.sun.target.position.set(this.px, 0, -6);
    this.night.position.set(this.px, 2.5, -1);

    // ---- Drip: run cycle, squash/stretch, lean, expressions
    const p = this.player, u = p.userData;
    p.position.set(this.px, this.py, 0);
    const sliding = this.slideT > 0 && running, air = this.py > 0.01;
    this.happy = Math.max(0, (this.happy || 0) - dt); this.ouch = Math.max(0, (this.ouch || 0) - dt);
    let sy = 1, sxz = 1;
    const stride = t * (running ? 8 + this.speed * 0.45 : 0);
    if (sliding) { sy = 0.48; sxz = 1.25; }
    else if (air) { sy = 1 + Math.min(0.18, this.vy * 0.016); sxz = 1 / Math.sqrt(Math.max(0.6, sy)); }
    else if (running) { sy = 1 + Math.sin(stride * 2) * 0.05; sxz = 1 - Math.sin(stride * 2) * 0.03; }
    else { sy = 1 + Math.sin(t * 2.4) * 0.025; }
    u.rig.scale.set(sxz, sy, sxz);
    u.rig.position.y = running && !air && !sliding ? Math.abs(Math.sin(stride)) * 0.08 : 0;
    const laneDelta = this.lane * LANE - this.px;
    u.rig.rotation.z = laneDelta * -0.14;
    const face = this.dead ? Math.PI : (this.state === 'playing' || this.state === 'countdown' && this.resumeCount ? 0 : Math.PI);
    p.rotation.y += (face + (this.dead ? Math.sin(t * 20) * 0.3 : 0) - p.rotation.y) * Math.min(1, dt * 6);
    if (this.dead) u.rig.rotation.x = Math.min(1.2, this.deathT * 3);
    else u.rig.rotation.x = sliding ? -0.45 : running ? -0.14 - (this.boost > 0 ? 0.15 : 0) : 0;
    u.feet.forEach((f, i) => { const s = running && !air && !sliding ? Math.sin(stride + i * Math.PI) : 0; f.position.z = 0.04 + s * 0.2; f.position.y = 0.06 + Math.max(0, s) * 0.12; f.visible = !sliding; });
    // footstep splashes on wet ground
    if (running && !air && !sliding) { const ph2 = Math.floor(stride / Math.PI); if (ph2 !== this.stepPh) { this.stepPh = ph2; if (['melissa', 'agora', 'chase', 'epic'].includes(this.zone.id) || this.dist % 40 < 6) this.splash(this.px + (ph2 % 2 ? 0.2 : -0.2), 0.05, 0.1, 2); } }
    // expressions: worried near danger, "O" mouth in the air, grin on pickups, X-ish on death
    const near = this.objs.some((o) => o.kind === 'obs' && o.lane === this.lane && o.z > -8 && o.z < 0);
    const blink = Math.sin(t * 1.3) > 0.985 || this.dead;
    u.eyes.forEach((e) => { e.scale.y = blink ? 0.12 : (near || this.ouch > 0 ? 1.3 : 1.1); });
    u.pupils.forEach((pu, i) => { pu.visible = !blink; pu.position.x = (i ? 0.17 : -0.17) + 0.02 + Math.max(-0.05, Math.min(0.05, laneDelta * 0.05)); pu.position.y = 0.6 + (air ? 0.03 : 0); });
    u.brows.forEach((b, i) => { const sx = i ? 1 : -1; b.rotation.z = sx * (near || this.ouch > 0 ? 0.25 : sliding || this.boost > 0 ? -0.35 : -0.15); b.position.y = near ? 0.83 : 0.79; });
    const openMouth = air || this.ouch > 0 || this.dead || near;
    u.mouthO.visible = openMouth; u.smile.visible = !openMouth;
    u.smile.scale.setScalar(this.happy > 0 ? 1.35 : 1);
    u.bubble.visible = this.shield; u.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
    if (this.boost > 0 && running) this.splash(this.px + (Math.random() - 0.5) * 0.6, 0.4 + Math.random(), 0.6, 1);
    u.shadow.position.set(this.px, 0.03, 0); u.shadow.scale.setScalar(Math.max(0.4, 1 - this.py * 0.25)); u.shadow.visible = !SHADOWS;

    // ---- camera: intro swoop from the water tower, then a chase cam with a little bob and a boost kick
    const cam = this.camera, portrait = this.portrait;
    const cx = this.px * (portrait ? 0.35 : 0.55);
    const cy = (portrait ? 4.4 : 3.7) + this.py * 0.25 + (running ? Math.sin(stride * 2) * 0.03 : 0);
    const cz = portrait ? 8.0 : 7.0;
    const fov = (portrait ? 74 : 60) + Math.min(4, Math.max(0, (this.speed - RULES.START_SPEED) * 0.25)) * (running ? 1 : 0) + (this.boost > 0 ? 8 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    if (this.state === 'idle' || this.state === 'over') {
      const off = portrait ? 0 : 2.6;
      cam.position.set(off + Math.sin(t * 0.3) * 0.8, 2.2, 5.4); cam.lookAt(off, 1.0, 0);
      return;
    }
    if (this.state === 'countdown' && this.intro > 0 && !this.resumeCount) {
      const k = Math.max(0, Math.min(1, 1 - this.countdown / 3.4)), e = k * k * (3 - 2 * k);
      cam.position.set(cx + (1 - e) * 5, cy + (1 - e) * 9, cz + (1 - e) * 10);
      cam.lookAt(this.px * 0.4 * e, 0.9 + (1 - e) * 4, -10 * e + (1 - e) * 12);
      return;
    }
    cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 8);
    cam.position.y += (cy - cam.position.y) * Math.min(1, dt * 6);
    cam.position.z += (cz - cam.position.z) * Math.min(1, dt * 6);
    if (this.dead && !REDUCED) cam.position.x += Math.sin(t * 50) * 0.08 * Math.max(0, 0.5 - this.deathT);
    cam.lookAt(this.px * 0.4, 0.9, -10);
    if (!REDUCED) cam.rotateZ(-laneDelta * 0.03);   // a gentle roll into lane changes
  }
}
