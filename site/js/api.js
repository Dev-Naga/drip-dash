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
  startRun: (playerKey) => rpc('start_run', { p_player_key: playerKey || null }),
  submitRun: (r) => rpc('submit_run', {
    p_run_id: r.runId, p_player_key: r.playerKey, p_score: r.score, p_duration_ms: r.durationMs,
    p_distance: r.distance, p_drops: r.drops, p_valves: r.valves,
  }),
  leaderboard: (period, limit = 50) => rpc('get_leaderboard', { p_period: period, p_month: null, p_limit: limit }),
  companies: (period) => rpc('get_company_board', { p_period: period, p_limit: 25 }),
  winners: () => rpc('get_monthly_winners', { p_months: 12 }),
  me: (playerKey) => rpc('get_player_summary', { p_player_key: playerKey }),
};

// ---------------------------------------------------------------- DEMO (this browser only)
const DEMO_KEY = 'dripdash.demo.db';
function demoDb() {
  let db = LS.get(DEMO_KEY);
  if (!db) {
    const m = currentMonth();
    const now = Date.now();
    const sample = [
      ['Sample Player A', 'Demo Landscaping', 3120], ['Sample Player B', 'Demo Builders', 2480],
      ['Sample Player C', 'Demo Parks Dept.', 1910], ['Sample Player D', 'Demo Landscaping', 1550],
      ['Sample Player E', 'Demo Hospitality', 980],
    ];
    db = { players: {}, runs: [] };
    sample.forEach(([name, company, score], i) => {
      const key = `sample-${i}`;
      db.players[key] = { name, company, email: `sample${i}@example.com` };
      db.runs.push({ key, score, month: m, at: now - i * 3600e3, status: 'accepted' });
      db.runs.push({ key, score: Math.round(score * 0.8), month: '2026-10', at: now - 40 * 86400e3, status: 'accepted' });
    });
    LS.set(DEMO_KEY, db);
  }
  return db;
}
function bestPerPlayer(runs) {
  const best = new Map();
  for (const r of runs) {
    if (r.status !== 'accepted') continue;
    const b = best.get(r.key);
    if (!b || r.score > b.score || (r.score === b.score && r.at < b.at)) best.set(r.key, r);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
}
const demo = {
  mode: 'demo',
  async register(p) {
    const db = demoDb();
    const email = p.email.trim().toLowerCase();
    let key = Object.keys(db.players).find(k => db.players[k].email === email);
    if (!key) {
      key = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      db.players[key] = { name: p.name.trim(), company: p.company.trim(), email };
      LS.set(DEMO_KEY, db);
    }
    return { player_key: key, display_name: db.players[key].name, company: db.players[key].company };
  },
  async startRun() { return { run_id: `demo-${Date.now()}`, started_at: new Date().toISOString() }; },
  async submitRun(r) {
    const db = demoDb();
    const month = currentMonth();
    db.runs.push({ key: r.playerKey, score: r.score, month, at: Date.now(), status: 'accepted' });
    LS.set(DEMO_KEY, db);
    return { accepted: true, ...(await demo.me(r.playerKey)) };
  },
  async leaderboard(period, limit = 50) {
    const db = demoDb();
    const m = currentMonth();
    const runs = period === 'month' ? db.runs.filter(r => r.month === m) : db.runs;
    return bestPerPlayer(runs).slice(0, limit).map((r, i) => ({
      rank: i + 1, display_name: db.players[r.key]?.name || '?', company: db.players[r.key]?.company || '',
      score: r.score, achieved_at: new Date(r.at).toISOString(),
    }));
  },
  async companies(period) {
    const rows = await demo.leaderboard(period, 1000);
    const by = new Map();
    for (const r of rows) {
      const k = r.company.toLowerCase();
      const e = by.get(k) || { company: r.company, scores: [] };
      e.scores.push(r.score); by.set(k, e);
    }
    return [...by.values()].map(e => ({
      company: e.company, players: e.scores.length,
      total: e.scores.sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total).map((e, i) => ({ rank: i + 1, ...e }));
  },
  async winners() {
    const db = demoDb();
    const m = currentMonth();
    const months = [...new Set(db.runs.map(r => r.month))].filter(x => x < m).sort().reverse();
    const out = [];
    for (const mo of months) {
      bestPerPlayer(db.runs.filter(r => r.month === mo)).slice(0, 3).forEach((r, i) => out.push({
        month: mo, rank: i + 1, display_name: db.players[r.key]?.name, company: db.players[r.key]?.company, score: r.score,
      }));
    }
    return out;
  },
  async me(key) {
    const db = demoDb();
    const p = db.players[key];
    if (!p) return null;
    const m = currentMonth();
    const mine = db.runs.filter(r => r.key === key && r.status === 'accepted');
    const bestAll = Math.max(0, ...mine.map(r => r.score));
    const bestMonth = Math.max(0, ...mine.filter(r => r.month === m).map(r => r.score));
    const board = bestPerPlayer(db.runs.filter(r => r.month === m));
    const idx = board.findIndex(r => r.key === key);
    return {
      display_name: p.name, company: p.company, best_all: bestAll, best_month: bestMonth,
      month_rank: idx >= 0 ? idx + 1 : null, month_players: board.length, runs: mine.length,
    };
  },
};

export const api = LIVE ? live : demo;
