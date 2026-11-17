// Water Run — a three-lane 3D endless runner (Three.js, low-poly, everything built in code).
// The world scrolls toward the camera (+Z); Drip stays at z = 0 and switches lanes, jumps and slides.
import * as THREE from 'three';
import { sfx } from './audio.js';

// Scoring rules — the server checks scores against these (supabase/schema.sql → submit_water_run).
export const RULES = { DROP: 10, VALVE: 100, POWERUP: 25, MULT: 2, START_SPEED: 13, MAX_SPEED: 30, BOOST: 1.5 };

const LANE = 2.2;
const STEP = 1 / 120;
const SEG_LEN = 30, SEG_COUNT = 6, SPAWN_Z = -125, KILL_Z = 12;
const GRAVITY = -30, JUMP_V = 10.2, SLIDE_T = 0.7;
const STAND_H = 1.35, SLIDE_H = 0.62;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Five zones, each a stylised take on a real inCon-trol gallery project.
export const ZONE_LEN = 450;   // metres per zone
export const ZONES = [
  { id: 'splash', name: 'Splash Park', ref: 'Melissa Lake Park Splash Pad', sky: 0x8fd3f4, fog: 0xc4ebfb, light: 1 },
  { id: 'cascade', name: 'Cascade Plaza', ref: '3300 Olympus Drive', sky: 0x9cc9ef, fog: 0xd2e6f6, light: 1 },
  { id: 'koi', name: 'Koi Court', ref: 'The Epic East', sky: 0xa6d7f2, fog: 0xcfe9f6, light: 0.95 },
  { id: 'city', name: 'City Bridge', ref: 'Chase Tower and the downtown skyline', sky: 0xf2b98a, fog: 0xf3cfaf, light: 0.85 },
  { id: 'night', name: 'Fountain Lights', ref: 'inCon-trol illuminated fountain shows', sky: 0x0b1733, fog: 0x13244a, light: 0.38 },
];
export const zoneAt = (d) => ZONES[Math.floor(Math.max(0, d) / ZONE_LEN) % ZONES.length];

const POWERS = {
  shield: { label: 'Pressure Regulator', note: 'blocks one hit', col: 0x00c1d5, dur: 0 },
  magnet: { label: 'Smart Controller', note: 'pulls in drops', col: 0xff5a5a, dur: 8 },
  mult: { label: 'Flow Meter', note: 'double points', col: 0x7ed957, dur: 10 },
  boost: { label: 'Jet Boost', note: 'super speed, can\'t be hit', col: 0xffc845, dur: 3 },
};

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- shared geometry / material caches
const GEO = new Map(), MAT = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
function mat(color, o = {}) {
  const key = `${color}|${o.emissive || 0}|${o.opacity || 1}|${o.shiny ? 1 : 0}|${o.map ? o.map.uuid : ''}`;
  if (!MAT.has(key)) {
    const M = o.shiny ? THREE.MeshPhongMaterial : THREE.MeshLambertMaterial;
    const m = new M({ color, flatShading: !o.shiny && !o.map, map: o.map || null });
    if (o.shiny) { m.shininess = 90; m.specular = new THREE.Color(0xbbeeff); }
    if (o.emissive) m.emissive = new THREE.Color(o.emissive);
    if (o.opacity && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
    MAT.set(key, m);
  }
  return MAT.get(key);
}
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 10) => geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const sph = (r, s = 10) => geo(`s${r},${s}`, () => new THREE.SphereGeometry(r, s, Math.max(6, s * 0.7 | 0)));
const cone = (r, h, s = 10) => geo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
function M(g, m, x = 0, y = 0, z = 0, parent = null) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; }

// teardrop profile used for Drip and the collectible drops
const DROP_GEO = (() => {
  const pts = [], r = 0.48, cy = 0.5;
  for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * (Math.PI / 2 + Math.PI / 6); pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a)), cy + r * Math.sin(a))); }
  const sx = r * Math.cos(Math.PI / 6), sy = cy + r * Math.sin(Math.PI / 6);
  for (let i = 1; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(Math.max(0.001, sx * (1 - t) * (1 - t * 0.35)), sy + (1.42 - sy) * t)); }
  return new THREE.LatheGeometry(pts, 20);
})();

// canvas textures for the track surfaces
function stripeTex(draw) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  draw(c.getContext('2d'), 128, 256);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, SEG_LEN / 6);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const laneLines = (g, col, dash) => { g.fillStyle = col; for (const x of [44, 84]) { if (dash) for (let y = 0; y < 256; y += 64) g.fillRect(x - 2, y, 4, 36); else g.fillRect(x - 2, 0, 4, 256); } };
let TRACK = null;
function trackTextures() {
  if (TRACK) return TRACK;
  TRACK = {
    splash: stripeTex((g, w, h) => { g.fillStyle = '#25a9c4'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffcc4d'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 47) % w, (i * 83) % h, 10, 0, 7); g.fill(); } g.fillStyle = '#ff7a59'; g.beginPath(); g.arc(90, 200, 8, 0, 7); g.fill(); laneLines(g, 'rgba(255,255,255,.7)'); }),
    cascade: stripeTex((g, w, h) => { for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? '#efeee9' : '#9aa3aa'; g.fillRect(0, y, w, 32); } laneLines(g, 'rgba(60,70,80,.35)'); }),
    koi: stripeTex((g, w, h) => { g.fillStyle = '#545b64'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3d434a'; g.lineWidth = 3; for (let y = 0; y < h; y += 42) for (let x = (y / 42) % 2 * 21; x < w; x += 42) g.strokeRect(x, y, 42, 42); laneLines(g, 'rgba(255,90,70,.6)'); }),
    city: stripeTex((g, w, h) => { g.fillStyle = '#3a3e45'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 300; i++) g.fillRect((i * 37) % w, (i * 91) % h, 2, 2); laneLines(g, '#f4f4f4', true); g.fillStyle = '#ffc845'; g.fillRect(2, 0, 4, h); g.fillRect(w - 6, 0, 4, h); }),
    night: stripeTex((g, w, h) => { g.fillStyle = '#1b2433'; g.fillRect(0, 0, w, h); g.strokeStyle = '#26344a'; g.lineWidth = 2; for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } laneLines(g, 'rgba(0,193,213,.9)'); }),
  };
  return TRACK;
}

// ---------------------------------------------------------------- Drip (3D)
export function makeDrip(outfit = 'none') {
  const g = new THREE.Group();
  const bodyCol = outfit === 'gold' ? 0xf5c04a : outfit === 'aqua' ? 0x22cfe0 : 0x2186cf;
  const body = M(DROP_GEO, mat(bodyCol, { shiny: true }), 0, 0, 0, g);
  // cowlick wave on top
  const curl = M(geo('curl', () => new THREE.TorusGeometry(0.12, 0.04, 6, 12, Math.PI * 1.3)), mat(bodyCol, { shiny: true }), 0.1, 1.42, 0, g);
  curl.rotation.set(0, Math.PI / 2, 0.3);
  const face = new THREE.Group(); face.position.set(0, 0, 0); g.add(face);
  for (const sx of [-1, 1]) {
    const eye = M(sph(0.12, 12), mat(0xffffff), sx * 0.17, 0.6, 0.39, face); eye.scale.set(0.85, 1.1, 0.6);
    M(sph(0.065, 10), mat(0x040707), sx * 0.17 + 0.02, 0.6, 0.46, face);
    M(sph(0.06, 8), mat(0xff8fa3), sx * 0.3, 0.42, 0.36, face).scale.set(1, 0.6, 0.4);
    const brow = M(box(0.16, 0.035, 0.03), mat(0x003a66), sx * 0.17, 0.79, 0.4, face); brow.rotation.z = sx * -0.15;
  }
  const smile = M(geo('smile', () => new THREE.TorusGeometry(0.11, 0.028, 6, 12, Math.PI)), mat(0x003a66), 0, 0.44, 0.44, face); smile.rotation.z = Math.PI;
  // shine
  M(sph(0.07, 8), mat(0xffffff, { opacity: 0.8 }), -0.26, 0.74, 0.3, g).scale.set(0.6, 1.4, 0.5);
  const feet = [];
  for (const sx of [-1, 1]) { const f = M(sph(0.15, 10), mat(0x00477c), sx * 0.2, 0.06, 0.04, g); f.scale.set(1, 0.55, 1.4); feet.push(f); }
  if (outfit === 'hardhat') {
    M(geo('hat', () => new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(0xffd23f), 0, 0.98, 0, g);
    M(cyl(0.42, 0.42, 0.05, 16), mat(0xffd23f), 0, 0.98, 0.04, g);
    M(box(0.14, 0.1, 0.02), mat(0x005695), 0, 1.13, 0.27, g);
  }
  if (outfit === 'vest') {
    M(geo('vest', () => new THREE.CylinderGeometry(0.47, 0.5, 0.3, 18, 1, true)), mat(0xff8a1f), 0, 0.36, 0, g);
    M(geo('vests', () => new THREE.CylinderGeometry(0.485, 0.495, 0.06, 18, 1, true)), mat(0xe8ff5a), 0, 0.38, 0, g);
  }
  // shield bubble
  const bubble = M(sph(0.95, 16), mat(0x00c1d5, { opacity: 0.22 }), 0, 0.7, 0, g); bubble.visible = false;
  // drop shadow
  const shadow = M(geo('shadow', () => new THREE.CircleGeometry(0.55, 16)), mat(0x000000, { opacity: 0.25 }), 0, 0.02, 0);
  shadow.rotation.x = -Math.PI / 2;
  g.userData = { body, face, feet, bubble, shadow };
  return g;
}

// ---------------------------------------------------------------- game
export class WaterRun {
  constructor(canvas, hooks = {}) {
    this.cv = canvas; this.hooks = hooks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(ZONES[0].fog, 45, 120);
    this.scene.background = new THREE.Color(ZONES[0].sky);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 170);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5b7a5b, 1.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6); this.sun.position.set(-6, 12, 6); this.scene.add(this.sun);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.outfit = 'none';
    this.player = makeDrip(this.outfit); this.scene.add(this.player); this.scene.add(this.player.userData.shadow);
    this.particles = this.makeParticles();
    this.state = 'idle';
    this.reset(1);
    this.resize();
    addEventListener('resize', () => this.resize());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.resize()).observe(canvas);
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
    this.lane = 0; this.px = 0; this.py = 0; this.vy = 0; this.slideT = 0; this.fromLane = 0;
    this.shield = false; this.magnet = 0; this.mult = 0; this.boost = 0; this.stumble = 0; this.inv = 0;
    this.rowDist = 30; this.nextValve = 6; this.nextPower = 9; this.lastFree = 1;
    this.zone = ZONES[0]; this.zonesSeen = [ZONES[0].id];
    this.dead = false; this.deathT = 0;
    for (let i = 0; i < SEG_COUNT; i++) this.addSegment(SEG_LEN / 2 - i * SEG_LEN + 6);
  }

  start(seed = Date.now()) {
    this.reset(seed);
    this.state = 'countdown'; this.countdown = 3.2;
    this.hooks.onZone?.(this.zone, true);
  }
  pause() { if (this.state === 'playing' || this.state === 'countdown') { this.prev = this.state; this.state = 'paused'; } }
  resume() { if (this.state === 'paused') { this.state = this.prev || 'playing'; this.last = 0; } }
  quit() { if (this.state === 'paused' || this.state === 'playing') { this.state = 'playing'; this.die('quit'); } }

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
    if (this.py > 0.01) this.vy = Math.min(this.vy, -16);   // fast-fall into a slide
    this.slideT = SLIDE_T; sfx.slide();
  }

  // ------------------------------------------------ world building
  addSegment(z) {
    const zone = zoneAt(this.dist - z);
    const s = new THREE.Group(); s.position.z = z;
    this.buildSegment(s, zone);
    s.userData.zone = zone; this.world.add(s); this.segs.push(s);
  }
  buildSegment(s, zone) {
    const R = mulberry(Math.floor((this.dist - s.position.z) * 7) + 11);
    s.userData.anims = [];
    const tex = trackTextures()[zone.id];
    const track = M(geo('track', () => new THREE.PlaneGeometry(7.2, SEG_LEN)), mat(0xffffff, { map: tex }), 0, 0, 0, s); track.rotation.x = -Math.PI / 2;
    const side = { splash: 0x63b552, cascade: 0xd8d4c8, koi: 0x2a7fa6, city: 0x2b6f9e, night: 0x101826 }[zone.id];
    const sideY = zone.id === 'city' ? -3.5 : zone.id === 'koi' ? -0.15 : -0.02;
    for (const sx of [-1, 1]) {
      const p = M(geo('side', () => new THREE.PlaneGeometry(60, SEG_LEN)), mat(side), sx * 33.6, sideY, 0, s); p.rotation.x = -Math.PI / 2;
      // curb / edge
      const curbCol = { splash: 0xffc845, cascade: 0xf2f0ea, koi: 0x2c3036, city: 0x9aa3ab, night: 0x00c1d5 }[zone.id];
      M(box(0.3, 0.3, SEG_LEN), mat(curbCol, zone.id === 'night' ? { emissive: 0x007f8f } : {}), sx * 3.75, 0.15, 0, s);
      if (zone.id === 'koi') { const walk = M(geo('walk', () => new THREE.PlaneGeometry(2.5, SEG_LEN)), mat(0x6e757d), sx * 5.1, 0.01, 0, s); walk.rotation.x = -Math.PI / 2; }
    }
    const B = this.decor[zone.id];
    B.call(this, s, R);
  }

  get decor() {
    const self = this;
    return {
      // Melissa Lake Park Splash Pad: water tower with tipping bucket, slides, spray posts, shade umbrellas
      splash(s, R) {
        const sx = R() < 0.5 ? -1 : 1, z = (R() - 0.5) * 10;
        const tw = new THREE.Group(); tw.position.set(sx * 8.5, 0, z); s.add(tw);
        for (const [x, zz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M(cyl(0.12, 0.12, 4.2, 6), mat(0x2b2b2b), x * 0.9, 2.1, zz * 0.9, tw);
        M(cyl(1.3, 1.3, 1.6, 12), mat(0xf4f4f4), 0, 4.8, 0, tw);
        M(cone(1.5, 1.1, 12), mat(0xe8402e), 0, 6.15, 0, tw);
        M(box(1.6, 0.2, 1.6), mat(0x2b2b2b), 0, 4.0, 0, tw);
        const bucket = M(cyl(0.6, 0.45, 0.8, 10), mat(0xffc845), -sx * 1.7, 4.6, 0, tw);
        s.userData.anims.push((t) => { const k = (t % 6) / 6; bucket.rotation.z = k > 0.85 ? -sx * (k - 0.85) * 12 : 0; });
        const fall = M(cyl(0.35, 0.6, 4.4, 8), mat(0xbff3ff, { opacity: 0.55 }), -sx * 2.2, 2.2, 0, tw);
        s.userData.anims.push((t) => { const k = (t % 6) / 6; fall.visible = k > 0.88; });
        // slide
        const sl = new THREE.Group(); sl.position.set(-sx * 9, 0, z + 8); s.add(sl);
        M(box(1.6, 3, 1.6), mat([0xff7a59, 0x7ed957, 0x5d85b7][Math.floor(R() * 3)]), 0, 1.5, 0, sl);
        const tube = M(geo('slide', () => new THREE.TorusGeometry(2.2, 0.45, 8, 16, Math.PI / 1.4)), mat(0xf9f9f9), sx * 1.6, 1.6, 0, sl); tube.rotation.y = Math.PI / 2;
        // spray posts
        for (let i = 0; i < 4; i++) {
          const x = (R() < 0.5 ? -1 : 1) * (5 + R() * 5), zz = (R() - 0.5) * SEG_LEN;
          const col = [0xff7a59, 0xffc845, 0x7ed957, 0x00c1d5, 0xc084fc][Math.floor(R() * 5)];
          M(cyl(0.18, 0.22, 1.6, 8), mat(col), x, 0.8, zz, s);
          M(sph(0.3, 8), mat(col), x, 1.7, zz, s);
          const jet = M(cone(0.45, 1.2, 8), mat(0xe6fbff, { opacity: 0.8 }), x, 2.4, zz, s); jet.rotation.x = Math.PI;
          const ph = R() * 6; s.userData.anims.push((t) => { const k = 0.6 + 0.4 * Math.sin(t * 4 + ph); jet.scale.set(k, k, k); });
        }
        for (let i = 0; i < 2; i++) { const x = (R() < 0.5 ? -1 : 1) * (12 + R() * 8); const u = new THREE.Group(); u.position.set(x, 0, (R() - 0.5) * SEG_LEN); s.add(u); M(cyl(0.08, 0.08, 2.8, 6), mat(0xeeeeee), 0, 1.4, 0, u); M(cone(1.8, 0.8, 8), mat(R() < 0.5 ? 0xff7a59 : 0x005695), 0, 3, 0, u); }
        self.trees(s, R, 3, 14);
      },
      // 3300 Olympus Drive: stepped weir cascades, striped pavers, rows of trees, bronze sculpture
      cascade(s, R) {
        for (const sx of [-1, 1]) {
          const c = new THREE.Group(); c.position.set(sx * 7.5, 0, (R() - 0.5) * 12); s.add(c);
          for (let i = 0; i < 4; i++) {
            M(box(4, 0.5 + i * 0.5, 2), mat(0xcfccc4), 0, (0.5 + i * 0.5) / 2, -i * 2, c);
            const sheet = M(box(3.4, 0.5, 0.06), mat(0x9fe3f0, { opacity: 0.75 }), 0, 0.25 + i * 0.5, -i * 2 + 1.0, c);
            s.userData.anims.push((t) => { sheet.material.opacity = 0.6 + 0.2 * Math.sin(t * 6 + i); });
            M(box(3.6, 0.04, 1.8), mat(0x52b8de), 0, 0.52 + i * 0.5, -i * 2, c);
          }
        }
        if (R() < 0.6) { const sc = new THREE.Group(); sc.position.set((R() < 0.5 ? -1 : 1) * 12, 0, (R() - 0.5) * 20); s.add(sc); M(sph(1.1, 8), mat(0x3a2f28), 0, 1.6, 0, sc).scale.set(1.3, 0.9, 0.8); M(cyl(0.18, 0.18, 1.1, 6), mat(0x3a2f28), 0.6, 0.55, 0, sc); M(cyl(0.18, 0.18, 1.1, 6), mat(0x3a2f28), -0.6, 0.55, 0, sc); }
        for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const z = -SEG_LEN / 2 + i * 7.5 + 2; M(cyl(0.15, 0.2, 1.2, 6), mat(0x6b4a2b), sx * 11, 0.6, z, s); M(cone(1.1, 3.2, 8), mat(0x2f7d3a), sx * 11, 2.8, z, s); }
      },
      // The Epic East: red steel columns, angular fountain basin, koi ponds
      koi(s, R) {
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 2; i++) { const z = -8 + i * 15; M(cyl(0.3, 0.3, 6, 10), mat(0xd9381e), sx * 6.6, 3, z, s); }
          // koi swimming in the side pond
          for (let i = 0; i < 3; i++) {
            const k = M(box(0.25, 0.08, 0.7), mat(R() < 0.5 ? 0xff7a2a : 0xf5f5f5), sx * (7 + R() * 6), -0.05, (R() - 0.5) * SEG_LEN, s);
            const ph = R() * 6, cx = k.position.x, cz = k.position.z; s.userData.anims.push((t) => { k.position.x = cx + Math.sin(t * 0.6 + ph) * 1.5; k.position.z = cz + Math.cos(t * 0.6 + ph) * 1.5; k.rotation.y = -(t * 0.6 + ph); });
          }
        }
        const b = new THREE.Group(); b.position.set((R() < 0.5 ? -1 : 1) * 9, 0, (R() - 0.5) * 12); s.add(b);
        M(cyl(2.2, 2.4, 0.9, 6), mat(0x4a3b5c), 0, 0.3, 0, b);
        M(cyl(2.0, 2.0, 0.05, 6), mat(0x4fb5dc), 0, 0.76, 0, b);
        const spill = M(cyl(2.45, 2.6, 0.7, 6, ), mat(0xbff3ff, { opacity: 0.45 }), 0, 0.35, 0, b);
        s.userData.anims.push((t) => { spill.material.opacity = 0.35 + 0.15 * Math.sin(t * 5); });
        for (let i = 0; i < 3; i++) { const x = (R() < 0.5 ? -1 : 1) * (5.6), z = (R() - 0.5) * SEG_LEN; M(box(1, 0.9, 1), mat(0x2f2a3a), x, 0.45, z, s); M(sph(0.55, 8), mat(0x3e9b4f), x, 1.2, z, s); M(sph(0.18, 6), mat(0xc084fc), x + 0.2, 1.6, z, s); }
      },
      // City bridge over the river with a downtown skyline (inspired by Chase Tower)
      city(s, R) {
        for (const sx of [-1, 1]) {
          M(box(0.12, 1.1, SEG_LEN), mat(0x5d85b7), sx * 4.0, 0.7, 0, s);
          for (let i = 0; i < 6; i++) M(box(0.15, 1.2, 0.15), mat(0x3d4a57), sx * 4.0, 0.6, -SEG_LEN / 2 + i * 5, s);
          M(box(1.2, 3.5, SEG_LEN), mat(0x6e7781), sx * 4.6, -1.75, 0, s);
          // lamp posts
          M(cyl(0.07, 0.07, 3.4, 6), mat(0x2b2b2b), sx * 4.2, 1.7, 0, s);
          M(sph(0.22, 8), mat(0xfff2c0, { emissive: 0xffd27a }), sx * 4.2, 3.45, 0, s);
          // skyline towers
          for (let i = 0; i < 2; i++) {
            const h = 14 + R() * 30, w = 4 + R() * 5;
            const x = sx * (22 + R() * 26), z = (R() - 0.5) * SEG_LEN;
            M(box(w, h, w), mat([0x8aa4bf, 0x5d85b7, 0xa4b7d7, 0x7c8b99][Math.floor(R() * 4)]), x, h / 2 - 3.5, z, s);
            M(box(w * 0.6, 3, w * 0.6), mat(0x3c4f63), x, h - 2, z, s);
          }
        }
        if (R() < 0.5) { // signature tower with an angled crown
          const x = (R() < 0.5 ? -1 : 1) * 30;
          M(box(7, 48, 7), mat(0x6f8aa6), x, 20.5, 0, s);
          const crown = M(box(7.2, 6, 7.2), mat(0x9fb3c8), x, 46, 0, s); crown.rotation.z = 0.35;
        }
        // bridge cables arch
        if (R() < 0.6) { const a = M(geo('arch', () => new THREE.TorusGeometry(5.2, 0.18, 6, 24, Math.PI)), mat(0xd9e2ea), 0, 3.4, (R() - 0.5) * 8, s); }
      },
      // Fountain Lights: night plaza with colour-changing illuminated jets
      night(s, R) {
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            const x = sx * (6 + R() * 7), z = (R() - 0.5) * SEG_LEN;
            M(cyl(1.2, 1.3, 0.4, 12), mat(0x26344a), x, 0.2, z, s);
            const col = new THREE.Color().setHSL(R(), 0.9, 0.6);
            const jm = new THREE.MeshLambertMaterial({ color: col, emissive: col, transparent: true, opacity: 0.8, depthWrite: false });
            const jet = M(cyl(0.12, 0.35, 4, 8), jm, x, 2.2, z, s);
            const ph = R() * 6, hue = R(); s.userData.anims.push((t) => { const k = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.7 + ph)); jet.scale.y = k; jet.position.y = 0.4 + 2 * k; jm.color.setHSL((hue + t * 0.05) % 1, 0.9, 0.6); jm.emissive.copy(jm.color); });
          }
          for (let i = 0; i < 3; i++) M(sph(0.15, 6), mat(0x9ff0ff, { emissive: 0x00c1d5 }), sx * 4.4, 0.6, -SEG_LEN / 2 + i * 10, s);
        }
      },
    };
  }
  trees(s, R, n, minX) {
    for (let i = 0; i < n; i++) { const x = (R() < 0.5 ? -1 : 1) * (minX + R() * 14), z = (R() - 0.5) * SEG_LEN; M(cyl(0.2, 0.25, 1.4, 6), mat(0x6b4a2b), x, 0.7, z, s); M(sph(1.5, 7), mat(0x3f9b4a), x, 2.4, z, s); }
  }

  // ------------------------------------------------ obstacles & pickups
  obstacle(type, lane, zone, z) {
    const g = new THREE.Group(); g.position.set(lane * LANE, 0, z);
    const zid = zone.id, night = zid === 'night';
    const accent = { splash: 0xff7a59, cascade: 0x9aa3aa, koi: 0xd9381e, city: 0xffc845, night: 0x00c1d5 }[zid];
    const o = { kind: 'obs', type, lane, z, g, anims: [] };
    if (type === 'low') {          // jump over: pipe barricade / weir wall / planter edge
      if (zid === 'cascade') { M(box(1.9, 0.75, 0.5), mat(0xcfccc4), 0, 0.375, 0, g); M(box(1.7, 0.1, 0.45), mat(0x7fd6ef), 0, 0.8, 0, g); }
      else if (zid === 'koi') { M(box(1.9, 0.8, 0.5), mat(0x2f2a3a), 0, 0.4, 0, g); M(sph(0.3, 6), mat(0x3e9b4f), -0.5, 0.95, 0, g); M(sph(0.3, 6), mat(0x3e9b4f), 0.5, 0.95, 0, g); }
      else { const p = M(cyl(0.28, 0.28, 1.9, 12), mat(night ? 0x26344a : 0x005695), 0, 0.55, 0, g); p.rotation.z = Math.PI / 2; for (const x of [-0.7, 0.7]) M(box(0.18, 0.55, 0.4), mat(accent, night ? { emissive: 0x007f8f } : {}), x, 0.27, 0, g); M(box(0.5, 0.12, 0.5), mat(0xffc845), 0, 0.85, 0, g); }
      o.y0 = 0; o.y1 = 0.92; o.hw = 0.95; o.hd = 0.3;
    } else if (type === 'high') {  // slide under: water arch / pipe gantry / red beam
      for (const x of [-0.95, 0.95]) M(box(0.18, 2.6, 0.25), mat(zid === 'koi' ? 0xd9381e : 0x3d4a57), x, 1.3, 0, g);
      M(box(2.1, 0.5, 0.35), mat(zid === 'koi' ? 0xd9381e : night ? 0x26344a : 0x005695), 0, 1.45, 0, g);
      const curtain = M(box(1.7, 0.55, 0.12), mat(0xbff3ff, { opacity: 0.7 }), 0, 0.95, 0, g);
      o.anims.push((t) => { curtain.scale.y = 0.8 + 0.2 * Math.sin(t * 14); });
      o.y0 = 0.7; o.y1 = 3; o.hw = 0.95; o.hd = 0.25;
    } else if (type === 'block') { // change lanes: fountain basin / cascade block / planter / water wall
      if (zid === 'city') { M(box(1.9, 2.4, 3), mat(0x5d85b7), 0, 1.2, 0, g); M(box(1.9, 0.5, 3.02), mat(0xffc845), 0, 2.0, 0, g); M(box(1.5, 0.6, 0.05), mat(0xffffff), 0, 1.1, 1.52, g); }
      else {
        M(box(1.9, 1.1, 2.6), mat(zid === 'cascade' ? 0xcfccc4 : zid === 'koi' ? 0x4a3b5c : night ? 0x26344a : 0xffc845), 0, 0.55, 0, g);
        const wall = M(box(1.7, 1.6, 0.25), mat(0xbff3ff, night ? { emissive: 0x2a9fd3, opacity: 0.8 } : { opacity: 0.75 }), 0, 1.9, 0, g);
        const spout = M(cyl(0.08, 0.25, 1.3, 8), mat(0xffffff, { opacity: 0.8 }), 0, 2.9, 0, g);
        o.anims.push((t) => { spout.scale.y = 0.8 + 0.3 * Math.sin(t * 10); wall.position.y = 1.9 + 0.05 * Math.sin(t * 12); });
      }
      o.y0 = 0; o.y1 = 3.2; o.hw = 0.95; o.hd = 1.3;
    } else if (type === 'grate') { // jump over: drain grate spraying water
      M(box(1.9, 0.08, 1.1), mat(0x56636e), 0, 0.04, 0, g);
      for (let i = -3; i <= 3; i++) M(box(0.06, 0.1, 1.0), mat(0x1f262c), i * 0.25, 0.05, 0, g);
      const spray = []; for (const x of [-0.6, 0, 0.6]) { const j = M(cone(0.22, 0.9, 6), mat(0xbff3ff, { opacity: 0.7 }), x, 0.45, 0, g); j.rotation.x = Math.PI; spray.push(j); }
      o.anims.push((t) => spray.forEach((j, i) => { j.scale.y = 0.7 + 0.35 * Math.abs(Math.sin(t * 9 + i)); }));
      o.y0 = 0; o.y1 = 0.7; o.hw = 0.95; o.hd = 0.5;
    } else if (type === 'jet') {   // timed geyser: blocks the lane while it's up
      const ring = M(cyl(0.7, 0.7, 0.06, 14), mat(0x26344a), 0, 0.03, 0, g);
      const glow = M(cyl(0.55, 0.55, 0.07, 14), mat(0xff4d5e, { emissive: 0x991122 }), 0, 0.04, 0, g);
      const col = M(cyl(0.35, 0.6, 1, 10), mat(0xdff8ff, { opacity: 0.85 }), 0, 0, 0, g);
      o.phase = this.rand() * 1.6; o.period = 1.8;
      o.anims.push((t) => {
        const k = ((t + o.phase) % o.period) / o.period;       // 0..0.45 off, 0.45..0.55 rising, 0.55..1 on
        const h = k < 0.45 ? 0.05 : k < 0.55 ? (k - 0.45) * 10 * 3.6 : 3.6 + Math.sin(t * 30) * 0.15;
        col.scale.y = Math.max(0.05, h); col.position.y = h / 2;
        glow.visible = k > 0.3 && k < 0.55 ? Math.sin(t * 40) > 0 : k >= 0.55;
        o.on = k >= 0.5;
      });
      ring.visible = true;
      o.y0 = 0; o.y1 = 4; o.hw = 0.6; o.hd = 0.6;
    }
    this.world.add(g); this.objs.push(o);
    return o;
  }

  pickup(kind, lane, z, y = 0.8, extra = {}) {
    const g = new THREE.Group(); g.position.set(lane * LANE, y, z);
    if (kind === 'drop') { const d = M(DROP_GEO, mat(0x37b6f0, { shiny: true }), 0, -0.25, 0, g); d.scale.setScalar(0.42); }
    else if (kind === 'valve') {
      const w = M(geo('valve', () => new THREE.TorusGeometry(0.42, 0.09, 8, 18)), mat(0xf5c04a, { shiny: true }), 0, 0, 0, g);
      for (let i = 0; i < 3; i++) { const sp = M(box(0.8, 0.07, 0.07), mat(0xf5c04a, { shiny: true }), 0, 0, 0, g); sp.rotation.z = (i / 3) * Math.PI; }
    } else {
      const p = POWERS[extra.power];
      M(sph(0.55, 14), mat(p.col, { opacity: 0.35 }), 0, 0, 0, g);
      const core = extra.power === 'shield' ? M(geo('pshield', () => new THREE.TorusGeometry(0.28, 0.07, 6, 16)), mat(p.col, { emissive: 0x004d55 }), 0, 0, 0, g)
        : extra.power === 'magnet' ? M(geo('pmag', () => new THREE.TorusGeometry(0.26, 0.09, 6, 12, Math.PI)), mat(p.col), 0, 0, 0, g)
        : extra.power === 'mult' ? M(box(0.42, 0.42, 0.12), mat(p.col, { emissive: 0x245f17 }), 0, 0, 0, g)
        : M(cone(0.25, 0.55, 8), mat(p.col, { emissive: 0x7a5600 }), 0, 0, 0, g);
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
    // prefer a free lane next to the previous free lane so it's always reachable
    const near = lanes.filter((l) => Math.abs(l - this.lastFree) <= 1);
    const free = near[Math.floor(R() * near.length)];
    const used = lanes.filter((l) => l !== free).sort(() => R() - 0.5).slice(0, Math.min(2, n));
    const types = used.map(() => pickType());
    if (n === 3) {          // all three lanes: the "free" lane gets a passable obstacle
      const tf = R() < 0.5 ? 'low' : (t > 5 ? 'high' : 'low');
      this.obstacle(tf, free, zone, SPAWN_Z);
    }
    used.forEach((l, i) => this.obstacle(types[i], l, zone, SPAWN_Z));
    this.lastFree = free;

    // pickups in the free lane (or an arc over a low obstacle)
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
      if (this.countdown <= 0) { this.state = 'playing'; sfx.win(); }
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

    // move the world toward the camera; recycle track segments
    for (const s of this.segs) {
      s.position.z += dz;
      if (s.position.z - SEG_LEN / 2 > KILL_Z) {
        s.position.z -= SEG_LEN * SEG_COUNT;
        for (const c of [...s.children]) s.remove(c);
        const zone = zoneAt(this.dist - s.position.z);
        s.userData.zone = zone; this.buildSegment(s, zone);
      }
    }
    // spawn rows
    this.rowDist -= dz;
    if (this.rowDist <= 0) { this.spawnRow(); this.rowDist = this.speed * Math.max(0.62, 1.15 - this.t * 0.0065) / (this.boost > 0 ? RULES.BOOST : 1); }

    // player physics
    const tx = this.lane * LANE;
    this.px += (tx - this.px) * Math.min(1, dt * 16);
    if (Math.abs(tx - this.px) < 0.01) this.px = tx;
    this.vy += GRAVITY * dt; this.py += this.vy * dt;
    if (this.py <= 0) { if (this.vy < -6) this.splash(this.px, 0.05, 0, 6); this.py = 0; this.vy = 0; }
    this.slideT = Math.max(0, this.slideT - dt);

    // zone changes
    const zone = zoneAt(this.dist);
    if (zone !== this.zone) { this.zone = zone; if (!this.zonesSeen.includes(zone.id)) this.zonesSeen.push(zone.id); this.hooks.onZone?.(zone, false); sfx.zone(); }

    // objects
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
    if (sideways && this.stumble <= 0) {     // clipped the side of an obstacle: bounce back once
      this.lane = this.fromLane; this.stumble = 4; this.inv = 0.4; sfx.bad();
      this.hooks.onToast?.('Careful! Another bump and you\'re out.');
      return;
    }
    this.die(o.type);
  }
  smash(o) { this.splash(o.g.position.x, 1, o.z, 18); o.g.visible = false; }

  collect(o) {
    o.dead = true;
    const m = this.mult > 0 ? RULES.MULT : 1;
    if (o.kind === 'drop') { this.drops++; this.bonus += RULES.DROP * m; this.combo++; sfx.drop(Math.min(8, this.combo % 9)); }
    else if (o.kind === 'valve') { this.valves++; this.bonus += RULES.VALVE * m; sfx.valve(); this.hooks.onPop?.(`+${RULES.VALVE * m} Golden valve`); }
    else {
      this.powerups++; this.bonus += RULES.POWERUP; const p = POWERS[o.power];
      if (o.power === 'shield') this.shield = true; else this[o.power] = p.dur;
      sfx.power(); this.hooks.onPop?.(`${p.label}: ${p.note}`);
    }
    this.splash(o.g.position.x, o.y, o.z, o.kind === 'drop' ? 4 : 12);
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0;
    sfx.hit(); this.splash(this.px, 0.8, 0, 30);
    setTimeout(() => { this.state = 'over'; this.hooks.onGameOver?.(this.result(cause)); }, 900);
  }
  result(cause) {
    return { score: this.score, durationMs: Math.round(this.t * 1000), distance: Math.floor(this.dist), drops: this.drops, valves: this.valves, powerups: this.powerups, zones: [...this.zonesSeen], cause };
  }

  // ------------------------------------------------ visuals
  makeParticles() {
    const N = 260, g = new THREE.BufferGeometry();
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

  animate(dt) {
    const t = this.clock, P = this.particles;
    for (let i = 0; i < P.n; i++) {
      if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -50; continue; }
      P.life[i] -= dt; P.vel[i * 3 + 1] -= 14 * dt;
      P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += (P.vel[i * 3 + 2] + (this.state === 'playing' && !this.dead ? this.speed : 0)) * dt;
    }
    P.pts.geometry.attributes.position.needsUpdate = true;
    for (const s of this.segs) for (const a of s.userData.anims || []) a(t);
    for (const o of this.objs) {
      if (o.anims) for (const a of o.anims) a(t);
      if (o.kind !== 'obs') { o.g.rotation.y = t * 3; if (o.kind === 'drop') o.g.position.y = o.y + Math.sin(t * 5 + o.z) * 0.06; }
    }
    // lighting / sky follow the zone
    const z = this.zone, bg = this.scene.background, fog = this.scene.fog.color, k = Math.min(1, dt * 1.5);
    bg.lerp(new THREE.Color(z.sky), k); fog.lerp(new THREE.Color(z.fog), k);
    this.hemi.intensity += (1.6 * z.light - this.hemi.intensity) * k;
    this.sun.intensity += (1.6 * z.light - this.sun.intensity) * k;

    // Drip
    const p = this.player, u = p.userData;
    const running = this.state === 'playing' && !this.dead;
    p.position.set(this.px, this.py, 0);
    const sliding = this.slideT > 0 && running;
    const air = this.py > 0.01;
    let sy = 1, sxz = 1;
    if (sliding) { sy = 0.48; sxz = 1.25; }
    else if (air) { sy = 1 + Math.min(0.15, Math.abs(this.vy) * 0.015); sxz = 1 / Math.sqrt(sy); }
    else if (running) { sy = 1 + Math.sin(t * 22) * 0.05; sxz = 1 - Math.sin(t * 22) * 0.03; }
    p.scale.set(sxz, sy, sxz);
    p.rotation.z = (this.lane * LANE - this.px) * -0.12;
    const face = this.dead ? Math.PI : (this.state === 'playing' ? 0 : Math.PI);   // show the face when not running
    p.rotation.y += (face + (this.dead ? Math.sin(t * 20) * 0.3 : 0) - p.rotation.y) * Math.min(1, dt * 6);
    if (this.dead) { p.rotation.x = Math.min(1.2, this.deathT * 3); }
    else p.rotation.x = sliding ? -0.4 : running ? -0.12 : 0;
    u.feet.forEach((f, i) => { const s = running && !air && !sliding ? Math.sin(t * 22 + i * Math.PI) : 0; f.position.z = 0.04 + s * 0.18; f.position.y = 0.06 + Math.max(0, s) * 0.08; f.visible = !sliding; });
    u.bubble.visible = this.shield; u.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
    if (this.boost > 0 && running) this.splash(this.px + (Math.random() - 0.5) * 0.6, 0.4 + Math.random(), 0.6, 1);
    u.shadow.position.set(this.px, 0.03, 0); u.shadow.scale.setScalar(Math.max(0.4, 1 - this.py * 0.25));

    // camera
    const cam = this.camera, portrait = this.portrait;
    const cx = this.px * (portrait ? 0.35 : 0.55);
    const cy = (portrait ? 4.4 : 3.7) + this.py * 0.25;
    const cz = portrait ? 8.0 : 7.0;
    cam.position.x += (cx - cam.position.x) * Math.min(1, dt * 8);
    cam.position.y += (cy - cam.position.y) * Math.min(1, dt * 6);
    cam.position.z = cz;
    if (this.dead && !REDUCED) cam.position.x += Math.sin(t * 50) * 0.08 * Math.max(0, 0.5 - this.deathT);
    cam.lookAt(this.px * 0.4, 0.9, -10);
    if (this.state === 'idle' || this.state === 'over') { // gentle idle drift on the title screen
      const off = this.portrait ? 0 : 2.6;   // desktop: Drip stands to the left of the title card
      cam.position.x = off + Math.sin(t * 0.3) * 0.8; cam.position.y = 2.2; cam.position.z = 5.4; cam.lookAt(off, 1.0, 0);
    }
  }
}
