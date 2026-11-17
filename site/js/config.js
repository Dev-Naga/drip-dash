// Drip Dash runtime configuration.
// Fill SUPABASE_URL and SUPABASE_KEY (the project's *publishable* / anon key — safe to expose)
// to switch from DEMO mode (scores saved only in this browser) to the LIVE shared leaderboard.
export const CONFIG = {
  SUPABASE_URL: 'https://kkhjnjwmhpzxnqjtprzw.supabase.co',
  SUPABASE_KEY: 'sb_publishable_tON4dxYbokSvo9PIjqrjYw_ZujYTXBo',   // publishable key: safe to expose; the database only allows the game RPCs
  COMPANY_NAME: 'inCon-trol Water Systems',
  COMPANY_URL: 'https://www.incontrolwatersystems.com',
  TIMEZONE_LABEL: 'Central Time',
  CONTEST_RULES_URL: 'rules.html',
  PRIVACY_URL: 'rules.html#privacy',
};

export const LIVE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
