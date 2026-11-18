// Data layer: talks to Supabase RPC functions (LIVE) or a browser-only mock (DEMO).
import { CONFIG, LIVE } from './config.js';
import { companyNorm, companyKey, companyMatch, emailDomain, isPersonalDomain, guessFromDomain, domainTypo, PERSONAL_MSG } from './company.js';

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

// Four games share one backend:
//   'dash'   = Drip Dash runner (level 'RUN'): leaderboard = each player's best single run.
//   'flow'   = Bring Back the Flow (levels L1…): leaderboard = Valley Score (best per level, summed).
//   'splash' = Splash Escape (level 'SPLASH'): leaderboard = each player's best single run.
//   'wrun'   = Drip Dash: Water Run (level 'WRUN'): leaderboard = each player's best single run.
const GAME_OF = (level) => ({ RUN: 'dash', SPLASH: 'splash', WRUN: 'wrun' }[level] || 'flow');
const live = {
  mode: 'live',
  register: (p) => rpc('register_player', {
    p_email: p.email, p_name: p.name, p_company: p.company,
    p_consent: !!p.consent, p_opt_in: !!p.optIn, p_source: p.source || null, p_hp: p.hp || '',
    p_company_id: p.companyId || null, p_new_company: !!p.newCompany,
  }),
  lookupCompany: (email, company) => rpc('lookup_company', { p_email: email, p_company: company || null }),
  startRun: (playerKey, level = 'RUN') => rpc('start_run', { p_player_key: playerKey || null, p_level: level }),
  submitRun: (r) => (r.level === 'WRUN'
    ? rpc('submit_water_run', { p_run_id: r.runId, p_player_key: r.playerKey, p_score: r.score, p_duration_ms: r.durationMs, p_distance: r.distance, p_drops: r.drops, p_valves: r.valves, p_powerups: r.powerups, p_deliveries: r.deliveries || 0, p_stops: r.stopsDone || 0 })
    : r.level === 'SPLASH'
    ? rpc('submit_splash', { p_run_id: r.runId, p_player_key: r.playerKey, p_score: r.score, p_duration_ms: r.durationMs, p_drops: r.drops, p_powerups: r.powerups })
    : r.level && r.level !== 'RUN'
    ? rpc('submit_level', { p_run_id: r.runId, p_player_key: r.playerKey, p_level: r.level, p_score: r.score, p_duration_ms: r.durationMs, p_stars: r.stars })
    : rpc('submit_run', { p_run_id: r.runId, p_player_key: r.playerKey, p_score: r.score, p_duration_ms: r.durationMs, p_distance: r.distance, p_drops: r.drops, p_valves: r.valves })),
  leaderboard: (period, limit = 50, game = 'dash') => rpc('get_leaderboard', { p_period: period, p_month: null, p_limit: limit, p_game: game }),
  companies: (period, game = 'dash') => rpc('get_company_board', { p_period: period, p_limit: 25, p_game: game }),
  winners: (game = 'dash') => rpc('get_monthly_winners', { p_months: 12, p_game: game }),
  me: (playerKey, game = 'dash') => rpc('get_player_summary', { p_player_key: playerKey, p_game: game }),
};

// ---------------------------------------------------------------- DEMO (this browser only) — mirrors the server rules
const DEMO_KEY = 'dripdash.demo.v5';
function demoDb() {
  let db = LS.get(DEMO_KEY);
  if (!db) {
    const m = currentMonth(), now = Date.now();
    db = { players: {}, runs: [] };
    const sample = [['Sample Player A', 'Demo Landscaping', 3120, 4], ['Sample Player B', 'Demo Builders', 2480, 3], ['Sample Player C', 'Demo Parks Dept.', 1910, 2], ['Sample Player D', 'Demo Landscaping', 1550, 1], ['Sample Player E', 'Demo Hospitality', 980, 0]];
    sample.forEach(([name, company, dash, levels], i) => {
      const key = `sample-${i}`;
      db.players[key] = { name, company, email: `sample${i}@example.com` };
      db.runs.push({ key, level: 'RUN', score: dash, month: m, at: now - i * 3600e3 });
      db.runs.push({ key, level: 'RUN', score: Math.round(dash * 0.8), month: '2026-10', at: now - 40 * 86400e3 });
      db.runs.push({ key, level: 'SPLASH', score: 600 + ((i * 5 + 3) % 6) * 210, month: m, at: now - i * 5400e3 });
      db.runs.push({ key, level: 'SPLASH', score: 500 + i * 90, month: '2026-10', at: now - 41 * 86400e3 });
      db.runs.push({ key, level: 'WRUN', score: 900 + ((i * 3 + 1) % 5) * 520, month: m, at: now - i * 4000e3 });
      db.runs.push({ key, level: 'WRUN', score: 700 + i * 150, month: '2026-10', at: now - 42 * 86400e3 });
      for (let l = 1; l <= levels; l++) {
        db.runs.push({ key, level: `L${l}`, score: 3600 + ((i * 7 + l * 13) % 10) * 120, month: m, at: now - (i * 5 + l) * 3600e3 });
        db.runs.push({ key, level: `L${l}`, score: 3000 + l * 100, month: '2026-10', at: now - 40 * 86400e3 });
      }
    });
    LS.set(DEMO_KEY, db);
  }
  return db;
}
// one row per player: dash/splash = best single run; flow = sum of best per level
function standings(runs, game) {
  const by = new Map();
  for (const r of runs) {
    if (GAME_OF(r.level) !== game) continue;
    const m = by.get(r.key) || new Map(); const b = m.get(r.level);
    if (!b || r.score > b.score || (r.score === b.score && r.at < b.at)) m.set(r.level, { score: r.score, at: r.at });
    by.set(r.key, m);
  }
  return [...by.entries()].map(([key, m]) => {
    const v = [...m.values()];
    return { key, score: v.reduce((s, x) => s + x.score, 0), levels: game === 'flow' ? m.size : null, at: Math.max(...v.map((x) => x.at)) };
  }).sort((a, b) => b.score - a.score || a.at - b.at);
}
// demo companies = the distinct (normalized) company names of this browser's demo players
function demoCompanies(db) {
  const by = new Map();
  for (const p of Object.values(db.players)) {
    const norm = companyNorm(p.company), id = norm.replace(/ /g, '');
    if (!id) continue;
    const c = by.get(id) || { id, name: p.company, norm, domains: new Set() };
    const d = emailDomain(p.email); if (d && !isPersonalDomain(d) && !/example\.com$/.test(d)) c.domains.add(d);
    by.set(id, c);
  }
  return [...by.values()];
}
const demo = {
  mode: 'demo',
  async register(p) {
    const db = demoDb(), email = p.email.trim().toLowerCase();
    let key = Object.keys(db.players).find((k) => db.players[k].email === email);
    const returning = !!key;
    if (!key) {
      if (isPersonalDomain(emailDomain(email))) throw new Error(PERSONAL_MSG(emailDomain(email)));
      const cos = demoCompanies(db), chosen = p.companyId && cos.find((c) => c.id === p.companyId);
      const same = cos.find((c) => c.id === companyKey(p.company));
      key = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      db.players[key] = { name: p.name.trim(), company: (chosen || same)?.name || p.company.trim(), email }; LS.set(DEMO_KEY, db);
    }
    return { player_key: key, display_name: db.players[key].name, company: db.players[key].company, returning };
  },
  // Same answers as the live lookup_company, worked out from this browser's demo players.
  async lookupCompany(email, company) {
    const db = demoDb(), d = emailDomain(email), personal = isPersonalDomain(d), biz = personal ? null : d;
    const cos = demoCompanies(db), norm = companyNorm(company), key = norm.replace(/ /g, '');
    const byName = key && cos.find((c) => c.id === key);
    const byDomain = biz && cos.find((c) => c.domains.has(biz));
    const match = byName || byDomain || null;
    const sugg = key ? cos.filter((c) => c !== match).map((c) => ({ id: c.id, name: c.name, ...companyMatch(norm, c.norm) })).filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 4) : [];
    return {
      email_valid: !!d, domain: biz, personal, personal_blocked: personal,
      match: match && { id: match.id, name: match.name }, via: byName ? 'name' : byDomain ? 'domain' : null,
      domain_company: byName && byDomain && byName !== byDomain ? { id: byDomain.id, name: byDomain.name } : null,
      suggestions: sugg, guess: !match && biz ? guessFromDomain(biz) : null,
      needs_confirmation: !!(byName && byDomain && byName !== byDomain) || (!match && sugg.length > 0) || (!byName && byDomain && key !== byDomain.id),
      domain_typo: domainTypo(d, cos.flatMap((c) => [...c.domains])),
    };
  },
  async startRun(playerKey, level = 'RUN') { return { run_id: `demo-${level}-${Date.now()}` }; },
  async submitRun(r) {
    const db = demoDb(), level = r.level || 'RUN';
    db.runs.push({ key: r.playerKey, level, score: r.score, month: currentMonth(), at: Date.now() });
    LS.set(DEMO_KEY, db);
    return { accepted: true, ...(await demo.me(r.playerKey, GAME_OF(level))) };
  },
  async leaderboard(period, limit = 50, game = 'dash') {
    const db = demoDb(), m = currentMonth();
    return standings(period === 'month' ? db.runs.filter((r) => r.month === m) : db.runs, game).slice(0, limit).map((v, i) => ({
      rank: i + 1, display_name: db.players[v.key]?.name || '?', company: db.players[v.key]?.company || '', score: v.score, levels: v.levels, achieved_at: new Date(v.at).toISOString(),
    }));
  },
  async companies(period, game = 'dash') {
    const rows = await demo.leaderboard(period, 1000, game), by = new Map();
    for (const r of rows) { const k = r.company.toLowerCase(), e = by.get(k) || { company: r.company, scores: [] }; e.scores.push(r.score); by.set(k, e); }
    return [...by.values()].map((e) => ({ company: e.company, players: e.scores.length, total: e.scores.sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total).map((e, i) => ({ rank: i + 1, ...e }));
  },
  async winners(game = 'dash') {
    const db = demoDb(), m = currentMonth(), out = [];
    for (const mo of [...new Set(db.runs.map((r) => r.month))].filter((x) => x < m).sort().reverse()) {
      standings(db.runs.filter((r) => r.month === mo), game).slice(0, 3).forEach((v, i) => out.push({ month: mo, rank: i + 1, display_name: db.players[v.key]?.name, company: db.players[v.key]?.company, score: v.score }));
    }
    return out;
  },
  async me(key, game = 'dash') {
    const db = demoDb(), p = db.players[key]; if (!p) return null;
    const m = currentMonth(), board = standings(db.runs.filter((r) => r.month === m), game), idx = board.findIndex((v) => v.key === key);
    const all = standings(db.runs.filter((r) => r.key === key), game)[0];
    const monthScore = idx >= 0 ? board[idx].score : 0;
    return {
      display_name: p.name, company: p.company, month_rank: idx >= 0 ? idx + 1 : null, month_players: board.length,
      // runner names
      best_month: monthScore, best_all: all?.score || 0,
      // flow names
      month_score: monthScore, all_score: all?.score || 0,
    };
  },
};

export const api = LIVE ? live : demo;
