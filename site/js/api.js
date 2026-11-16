// Data layer: talks to Supabase RPC functions (LIVE) or a browser-only mock (DEMO).
import { CONFIG, LIVE } from './config.js';

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const store = LS;

export function currentMonth(date = new Date()) {
  // Contest months follow US Central time (company HQ in DFW).
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  return `${y}-${m}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------- LIVE (Supabase)
async function rpc(fn, args = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: CONFIG.SUPABASE_KEY };
  if (CONFIG.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${CONFIG.SUPABASE_KEY}`;
  const res = await fetch(`${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.hint)) || `Server error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

const live = {
  mode: 'live',
  register: (p) => rpc('register_player', {
    p_email: p.email, p_name: p.name, p_company: p.company,
    p_consent: !!p.consent, p_opt_in: !!p.optIn, p_source: p.source || null, p_hp: p.hp || '',
  }),
  startRun: (playerKey, level) => rpc('start_run', { p_player_key: playerKey || null, p_level: level }),
  submitRun: (r) => rpc('submit_level', {
    p_run_id: r.runId, p_player_key: r.playerKey, p_level: r.level, p_score: r.score,
    p_duration_ms: r.durationMs, p_stars: r.stars,
  }),
  leaderboard: (period, limit = 50) => rpc('get_leaderboard', { p_period: period, p_month: null, p_limit: limit }),
  companies: (period) => rpc('get_company_board', { p_period: period, p_limit: 25 }),
  winners: () => rpc('get_monthly_winners', { p_months: 12 }),
  me: (playerKey) => rpc('get_player_summary', { p_player_key: playerKey }),
};

// ---------------------------------------------------------------- DEMO (this browser only)
// Mirrors the server: Valley Score = sum of each player's best score per level in the period.
const DEMO_KEY = 'dripdash.v2.demo.db';
function demoDb() {
  let db = LS.get(DEMO_KEY);
  if (!db) {
    const m = currentMonth(), now = Date.now();
    const sample = [['Sample Player A', 'Demo Landscaping', 4], ['Sample Player B', 'Demo Builders', 3], ['Sample Player C', 'Demo Parks Dept.', 2], ['Sample Player D', 'Demo Landscaping', 1]];
    db = { players: {}, runs: [] };
    sample.forEach(([name, company, n], i) => {
      const key = `sample-${i}`;
      db.players[key] = { name, company, email: `sample${i}@example.com` };
      for (let l = 1; l <= n; l++) {
        db.runs.push({ key, level: `L${l}`, score: 3600 + ((i * 7 + l * 13) % 10) * 120, month: m, at: now - (i * 5 + l) * 3600e3 });
        db.runs.push({ key, level: `L${l}`, score: 3000 + l * 100, month: '2026-10', at: now - 40 * 86400e3 });
      }
    });
    LS.set(DEMO_KEY, db);
  }
  return db;
}
function valley(runs) {
  const best = new Map();  // key -> level -> {score, at}
  for (const r of runs) {
    const m = best.get(r.key) || new Map(); const b = m.get(r.level);
    if (!b || r.score > b.score) m.set(r.level, { score: r.score, at: r.at });
    best.set(r.key, m);
  }
  return [...best.entries()].map(([key, m]) => ({
    key, score: [...m.values()].reduce((s, x) => s + x.score, 0), levels: m.size, at: Math.max(...[...m.values()].map((x) => x.at)),
  })).sort((a, b) => b.score - a.score || a.at - b.at);
}
const demo = {
  mode: 'demo',
  async register(p) {
    const db = demoDb(), email = p.email.trim().toLowerCase();
    let key = Object.keys(db.players).find((k) => db.players[k].email === email);
    if (!key) { key = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2); db.players[key] = { name: p.name.trim(), company: p.company.trim(), email }; LS.set(DEMO_KEY, db); }
    return { player_key: key, display_name: db.players[key].name, company: db.players[key].company };
  },
  async startRun() { return { run_id: `demo-${Date.now()}` }; },
  async submitRun(r) {
    const db = demoDb();
    db.runs.push({ key: r.playerKey, level: r.level, score: r.score, month: currentMonth(), at: Date.now() });
    LS.set(DEMO_KEY, db);
    return { accepted: true, ...(await demo.me(r.playerKey)) };
  },
  async leaderboard(period, limit = 50) {
    const db = demoDb(), m = currentMonth();
    return valley(period === 'month' ? db.runs.filter((r) => r.month === m) : db.runs).slice(0, limit).map((v, i) => ({
      rank: i + 1, display_name: db.players[v.key]?.name || '?', company: db.players[v.key]?.company || '', score: v.score, levels: v.levels,
    }));
  },
  async companies(period) {
    const rows = await demo.leaderboard(period, 1000), by = new Map();
    for (const r of rows) { const k = r.company.toLowerCase(), e = by.get(k) || { company: r.company, scores: [] }; e.scores.push(r.score); by.set(k, e); }
    return [...by.values()].map((e) => ({ company: e.company, players: e.scores.length, total: e.scores.sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total).map((e, i) => ({ rank: i + 1, ...e }));
  },
  async winners() {
    const db = demoDb(), m = currentMonth(), out = [];
    for (const mo of [...new Set(db.runs.map((r) => r.month))].filter((x) => x < m).sort().reverse()) {
      valley(db.runs.filter((r) => r.month === mo)).slice(0, 3).forEach((v, i) => out.push({ month: mo, rank: i + 1, display_name: db.players[v.key]?.name, company: db.players[v.key]?.company, score: v.score }));
    }
    return out;
  },
  async me(key) {
    const db = demoDb(), p = db.players[key]; if (!p) return null;
    const m = currentMonth(), board = valley(db.runs.filter((r) => r.month === m)), idx = board.findIndex((v) => v.key === key);
    const all = valley(db.runs.filter((r) => r.key === key))[0];
    return { display_name: p.name, company: p.company, month_score: idx >= 0 ? board[idx].score : 0, month_rank: idx >= 0 ? idx + 1 : null, month_players: board.length, all_score: all?.score || 0 };
  },
};

export const api = LIVE ? live : demo;
