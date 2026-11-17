-- =====================================================================
-- Drip Dash games — Supabase schema (run once in Supabase → SQL Editor)
-- Safe to re-run: functions are replaced, tables/columns created if missing.
--
-- Three games share one backend (players register once, play all):
--   * 'dash' — Drip Dash, the endless runner (the main game). Runs use level 'RUN'.
--     Leaderboard = each player's best single run in the period.
--   * 'flow' — Bring Back the Flow, the 7-level story game. Runs use levels L1…L7.
--     Leaderboard = VALLEY SCORE, the sum of a player's best score on each level.
--   * 'splash' — Splash Escape, the splash-pad survival arena. Runs use level 'SPLASH'.
--     Leaderboard = each player's best single run in the period.
--   * Monthly boards = runs this calendar month (US Central); all-time = every run.
--
-- Security model
--   * Tables have RLS ON and no policies → the public API key cannot read or
--     write them directly. Emails are never exposed.
--   * The browser can only call the RPC functions below (SECURITY DEFINER),
--     which validate input, rate-limit and check scores against per-level limits.
--   * Admin views live in the `admin` schema, which the API does not expose.
-- =====================================================================

create schema if not exists admin;
create schema if not exists private;

-- --------------------------------------------------------------- tables
create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  email_norm     text generated always as (lower(btrim(email))) stored unique,
  display_name   text not null check (char_length(display_name) between 2 and 24),
  company        text not null check (char_length(company) between 2 and 60),
  player_key     uuid not null default gen_random_uuid() unique,
  consent_at     timestamptz not null default now(),
  marketing_opt_in boolean not null default false,
  source         text,
  ip_hash        text,
  is_blocked     boolean not null default false,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

create table if not exists public.runs (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid references public.players(id) on delete cascade,
  level         text,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  score         integer,
  stars         smallint,
  duration_ms   integer,
  month         text,                       -- 'YYYY-MM' in US Central time
  status        text not null default 'started'
                check (status in ('started','accepted','rejected','disqualified')),
  reject_reason text,
  ip_hash       text
);
alter table public.runs add column if not exists level text;
alter table public.runs add column if not exists stars smallint;
alter table public.runs add column if not exists distance integer;
alter table public.runs add column if not exists drops integer;
alter table public.runs add column if not exists valves integer;
create index if not exists runs_board_idx  on public.runs (month, status, player_id, level);
create index if not exists runs_player_idx on public.runs (player_id, status);
create index if not exists runs_ip_idx     on public.runs (ip_hash, started_at);

-- Per-level limits (keep in sync with maxScore / minSeconds in site/js/levels/*.js)
create table if not exists private.levels (
  id         text primary key,
  title      text not null,
  max_score  integer not null,
  min_ms     integer not null,
  active     boolean not null default true
);
insert into private.levels (id, title, max_score, min_ms) values
  ('RUN', 'Drip Dash (runner)', 1000000, 1000),   -- runner runs are checked by submit_run
  ('SPLASH', 'Splash Escape', 1000000, 3000),      -- splash runs are checked by submit_splash
  ('L1', 'Wake the Water',      7000, 15000),
  ('L2', 'The Pressure Dance',  6500, 55000),
  ('L3', 'Before Sunrise',      7500, 20000),
  ('L4', 'Catch the Storm',     7500, 45000),
  ('L5', 'Lift to the Sky',     7500, 40000),
  ('L6', 'The Grand Show',      7000, 25000),
  ('L7', 'Evening Rush',        7000, 85000)
on conflict (id) do update set title = excluded.title, max_score = excluded.max_score, min_ms = excluded.min_ms;

alter table public.players enable row level security;
alter table public.runs    enable row level security;
revoke all on public.players, public.runs from anon, authenticated;

-- --------------------------------------------------------------- helpers (not exposed)
create or replace function private.current_month() returns text
language sql stable as $$ select to_char(now() at time zone 'America/Chicago', 'YYYY-MM') $$;

create or replace function private.client_ip_hash() returns text
language plpgsql stable as $$
declare h json; ip text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  ip := coalesce(split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'x-real-ip', 'unknown');
  return md5('dripdash:' || btrim(ip));
end $$;

-- Valley scores for a period: one row per eligible player.
create or replace function private.valley(p_month text)    -- p_month null = all-time
returns table (player_id uuid, score bigint, levels bigint, last_at timestamptz)
language sql stable as $$
  with best as (
    select r.player_id, r.level, max(r.score) s, max(r.submitted_at) at
    from public.runs r join public.players p on p.id = r.player_id
    where r.status = 'accepted' and not p.is_blocked and r.level not in ('RUN', 'SPLASH') and (p_month is null or r.month = p_month)
    group by r.player_id, r.level
  )
  select player_id, sum(s)::bigint, count(*)::bigint, max(at) from best group by player_id
$$;

-- Single-run games (runner 'RUN', Splash Escape 'SPLASH'): each player's best run (earliest wins ties).
create or replace function private.best_run(p_level text, p_month text)
returns table (player_id uuid, score bigint, levels bigint, last_at timestamptz)
language sql stable as $$
  select distinct on (r.player_id) r.player_id, r.score::bigint, null::bigint, r.submitted_at
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted' and not p.is_blocked and r.level = p_level and (p_month is null or r.month = p_month)
  order by r.player_id, r.score desc, r.submitted_at asc
$$;

create or replace function private.standings(p_game text, p_month text)
returns table (player_id uuid, score bigint, levels bigint, last_at timestamptz)
language sql stable as $$
  select * from private.best_run('RUN', p_month) where coalesce(p_game, 'dash') not in ('flow', 'splash')
  union all
  select * from private.best_run('SPLASH', p_month) where p_game = 'splash'
  union all
  select * from private.valley(p_month) where p_game = 'flow'
$$;
drop function if exists private.dash(text);

-- --------------------------------------------------------------- register_player
create or replace function public.register_player(
  p_email text, p_name text, p_company text, p_consent boolean,
  p_opt_in boolean default false, p_source text default null, p_hp text default ''
) returns json
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_co    text := btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'));
  v_ip    text := private.client_ip_hash();
  v_p     public.players;
begin
  if coalesce(p_hp, '') <> '' then raise exception 'Registration failed.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Please accept the contest rules.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  if char_length(v_name) not between 2 and 24 then raise exception 'Display name must be 2–24 characters.'; end if;
  if char_length(v_co) not between 2 and 60 then raise exception 'Company must be 2–60 characters.'; end if;
  if v_name ~ '[<>]' or v_co ~ '[<>]' then raise exception 'Please remove < and > characters.'; end if;

  select * into v_p from public.players where email_norm = v_email;
  if found then
    if v_p.is_blocked then raise exception 'This account is not eligible.'; end if;
    update public.players set last_seen_at = now(), marketing_opt_in = marketing_opt_in or coalesce(p_opt_in, false) where id = v_p.id;
  else
    if (select count(*) from public.players where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 15 then
      raise exception 'Too many sign-ups from this network. Please try again later.';
    end if;
    insert into public.players (email, display_name, company, marketing_opt_in, source, ip_hash, last_seen_at)
    values (v_email, v_name, v_co, coalesce(p_opt_in, false), left(p_source, 80), v_ip, now())
    returning * into v_p;
  end if;
  return json_build_object('player_key', v_p.player_key, 'display_name', v_p.display_name, 'company', v_p.company);
end $$;

-- --------------------------------------------------------------- start_run (one-time ticket per level attempt)
drop function if exists public.start_run(uuid);
create or replace function public.start_run(p_player_key uuid default null, p_level text default 'RUN')
returns json
language plpgsql security definer set search_path = public, private as $$
declare v_pid uuid; v_ip text := private.client_ip_hash(); v_id uuid;
begin
  if not exists (select 1 from private.levels where id = p_level and active) then raise exception 'Unknown level.'; end if;
  if p_player_key is not null then
    select id into v_pid from public.players where player_key = p_player_key and not is_blocked;
  end if;
  if (select count(*) from public.runs where ip_hash = v_ip and started_at > now() - interval '1 hour') >= 400 then
    raise exception 'Too many games from this network. Take a short break!';
  end if;
  if v_pid is not null and (select count(*) from public.runs where player_id = v_pid and started_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Slow down a little!';
  end if;
  insert into public.runs (player_id, level, ip_hash) values (v_pid, p_level, v_ip) returning id into v_id;
  return json_build_object('run_id', v_id, 'started_at', now());
end $$;

-- --------------------------------------------------------------- player summary (per game)
drop function if exists public.get_player_summary(uuid);
create or replace function public.get_player_summary(p_player_key uuid, p_game text default 'dash')
returns json
language plpgsql stable security definer set search_path = public, private as $$
declare v_p public.players; v_m text := private.current_month(); v_ms bigint; v_as bigint; v_rank bigint; v_n bigint;
begin
  select * into v_p from public.players where player_key = p_player_key;
  if not found then return null; end if;
  select score into v_ms from private.standings(p_game, v_m) where player_id = v_p.id;
  select score into v_as from private.standings(p_game, null) where player_id = v_p.id;
  select count(*) filter (where score > coalesce(v_ms, -1)) + 1, count(*) into v_rank, v_n from private.standings(p_game, v_m);
  return json_build_object('display_name', v_p.display_name, 'company', v_p.company,
    'month_score', coalesce(v_ms, 0), 'all_score', coalesce(v_as, 0),       -- names used by Bring Back the Flow
    'best_month', coalesce(v_ms, 0), 'best_all', coalesce(v_as, 0),          -- names used by Drip Dash and Splash Escape
    'month_rank', case when v_ms is null then null else v_rank end, 'month_players', v_n);
end $$;

-- --------------------------------------------------------------- submit_run — Drip Dash runner (plausibility checks)
-- Game facts used for bounds: top speed ≈ 900 px/s = 90 m/s; drops are worth at most
-- 10 × 5 (combo) × 2 (Flow Meter) = 100; golden valves at most 300; shield bonus 50 each.
drop function if exists public.submit_run(uuid, uuid, int, int, int, int, int);
create or replace function public.submit_run(
  p_run_id uuid, p_player_key uuid, p_score int, p_duration_ms int,
  p_distance int, p_drops int, p_valves int
) returns json
language plpgsql security definer set search_path = public, private as $$
declare v_run public.runs; v_pid uuid; v_blocked boolean; v_elapsed_ms numeric; v_reason text := null; v_secs numeric;
begin
  select id, is_blocked into v_pid, v_blocked from public.players where player_key = p_player_key;
  if v_pid is null then raise exception 'Unknown player. Please register again.'; end if;
  if v_blocked then raise exception 'This account is not eligible.'; end if;

  select * into v_run from public.runs where id = p_run_id for update;
  if not found then raise exception 'Unknown game ticket.'; end if;
  if v_run.status <> 'started' then raise exception 'This game was already submitted.'; end if;
  if v_run.player_id is not null and v_run.player_id <> v_pid then raise exception 'Ticket belongs to another player.'; end if;

  v_elapsed_ms := extract(epoch from (now() - v_run.started_at)) * 1000;
  v_secs := greatest(p_duration_ms, 0) / 1000.0;
  if v_run.level is distinct from 'RUN' then v_reason := 'ticket is not for Drip Dash';
  elsif v_elapsed_ms > 3 * 3600 * 1000 then v_reason := 'ticket expired';
  elsif p_score is null or p_score < 0 or p_score > 1000000 then v_reason := 'invalid score';
  elsif p_duration_ms < 1000 then v_reason := 'run too short';
  elsif p_duration_ms > v_elapsed_ms + 3000 then v_reason := 'run longer than server clock';
  elsif p_distance < 0 or p_distance > v_secs * 92 + 30 then v_reason := 'distance not possible in that time';
  elsif p_drops < 0 or p_drops > v_secs * 20 + 10 then v_reason := 'too many drops for run time';
  elsif p_valves < 0 or p_valves > v_secs / 2 + 3 then v_reason := 'too many valves for run time';
  elsif p_score < p_distance then v_reason := 'score lower than distance';
  elsif p_score > p_distance + p_drops * 100 + p_valves * 300 + (v_secs / 13 + 2) * 50 then v_reason := 'score exceeds possible bonus';
  end if;

  update public.runs set player_id = v_pid, submitted_at = now(), score = p_score, duration_ms = p_duration_ms,
    distance = p_distance, drops = p_drops, valves = p_valves, month = private.current_month(),
    status = case when v_reason is null then 'accepted' else 'rejected' end, reject_reason = v_reason
  where id = p_run_id;
  update public.players set last_seen_at = now() where id = v_pid;
  return (jsonb_build_object('accepted', v_reason is null, 'reason', v_reason) || public.get_player_summary(p_player_key, 'dash')::jsonb)::json;
end $$;

-- --------------------------------------------------------------- submit_level — Bring Back the Flow (per-level limits)
create or replace function public.submit_level(
  p_run_id uuid, p_player_key uuid, p_level text, p_score int, p_duration_ms int, p_stars int
) returns json
language plpgsql security definer set search_path = public, private as $$
declare v_run public.runs; v_pid uuid; v_blocked boolean; v_lv private.levels; v_elapsed numeric; v_reason text := null;
begin
  select id, is_blocked into v_pid, v_blocked from public.players where player_key = p_player_key;
  if v_pid is null then raise exception 'Unknown player. Please register again.'; end if;
  if v_blocked then raise exception 'This account is not eligible.'; end if;

  select * into v_run from public.runs where id = p_run_id for update;
  if not found then raise exception 'Unknown game ticket.'; end if;
  if v_run.status <> 'started' then raise exception 'This game was already submitted.'; end if;
  if v_run.player_id is not null and v_run.player_id <> v_pid then raise exception 'Ticket belongs to another player.'; end if;
  select * into v_lv from private.levels where id = v_run.level;

  v_elapsed := extract(epoch from (now() - v_run.started_at)) * 1000;
  if v_run.level is distinct from p_level or p_level in ('RUN', 'SPLASH') then v_reason := 'ticket is for a different level';
  elsif v_elapsed > 3 * 3600 * 1000 then v_reason := 'ticket expired';
  elsif p_score is null or p_score < 0 or p_score > v_lv.max_score then v_reason := 'score above level maximum';
  elsif p_stars is null or p_stars not between 1 and 3 then v_reason := 'invalid stars';
  elsif p_duration_ms < v_lv.min_ms then v_reason := 'level finished impossibly fast';
  elsif p_duration_ms > v_elapsed + 3000 then v_reason := 'run longer than server clock';
  end if;

  update public.runs set player_id = v_pid, submitted_at = now(), score = p_score, stars = p_stars,
    duration_ms = p_duration_ms, month = private.current_month(),
    status = case when v_reason is null then 'accepted' else 'rejected' end, reject_reason = v_reason
  where id = p_run_id;
  update public.players set last_seen_at = now() where id = v_pid;

  return (jsonb_build_object('accepted', v_reason is null, 'reason', v_reason) || public.get_player_summary(p_player_key, 'flow')::jsonb)::json;
end $$;

-- --------------------------------------------------------------- submit_splash — Splash Escape (plausibility checks)
-- Game facts used for bounds (keep in sync with site/js/splash-game.js):
--   survival = 10 points per second; a golden drop is worth at most 25 x 5 (combo) = 125;
--   a power-up pickup is worth 50; golden drops spawn at most ~0.8/s, power-ups every >= 9 s.
create or replace function public.submit_splash(
  p_run_id uuid, p_player_key uuid, p_score int, p_duration_ms int, p_drops int, p_powerups int
) returns json
language plpgsql security definer set search_path = public, private as $$
declare v_run public.runs; v_pid uuid; v_blocked boolean; v_elapsed_ms numeric; v_reason text := null; v_secs numeric;
begin
  select id, is_blocked into v_pid, v_blocked from public.players where player_key = p_player_key;
  if v_pid is null then raise exception 'Unknown player. Please register again.'; end if;
  if v_blocked then raise exception 'This account is not eligible.'; end if;

  select * into v_run from public.runs where id = p_run_id for update;
  if not found then raise exception 'Unknown game ticket.'; end if;
  if v_run.status <> 'started' then raise exception 'This game was already submitted.'; end if;
  if v_run.player_id is not null and v_run.player_id <> v_pid then raise exception 'Ticket belongs to another player.'; end if;

  v_elapsed_ms := extract(epoch from (now() - v_run.started_at)) * 1000;
  v_secs := greatest(coalesce(p_duration_ms, 0), 0) / 1000.0;
  if v_run.level is distinct from 'SPLASH' then v_reason := 'ticket is not for Splash Escape';
  elsif v_elapsed_ms > 3 * 3600 * 1000 then v_reason := 'ticket expired';
  elsif p_score is null or p_score < 0 or p_score > 1000000 then v_reason := 'invalid score';
  elsif p_duration_ms is null or p_duration_ms < 3000 then v_reason := 'run too short';
  elsif p_duration_ms > v_elapsed_ms + 3000 then v_reason := 'run longer than server clock';
  elsif p_drops is null or p_drops < 0 or p_drops > v_secs * 1.0 + 6 then v_reason := 'too many golden drops for run time';
  elsif p_powerups is null or p_powerups < 0 or p_powerups > v_secs / 6 + 2 then v_reason := 'too many power-ups for run time';
  elsif p_score > floor(v_secs * 10) + p_drops * 125 + p_powerups * 50 + 20 then v_reason := 'score exceeds possible bonus';
  end if;

  update public.runs set player_id = v_pid, submitted_at = now(), score = p_score, duration_ms = p_duration_ms,
    drops = p_drops, valves = p_powerups, month = private.current_month(),
    status = case when v_reason is null then 'accepted' else 'rejected' end, reject_reason = v_reason
  where id = p_run_id;
  update public.players set last_seen_at = now() where id = v_pid;
  return (jsonb_build_object('accepted', v_reason is null, 'reason', v_reason) || public.get_player_summary(p_player_key, 'splash')::jsonb)::json;
end $$;

-- --------------------------------------------------------------- leaderboards (p_game: 'dash' runner | 'flow' Valley Score | 'splash' Splash Escape)
drop function if exists public.get_leaderboard(text, text, int);
drop function if exists public.get_leaderboard(text, text, int, text);
create or replace function public.get_leaderboard(p_period text default 'month', p_month text default null, p_limit int default 50, p_game text default 'dash')
returns table (rank bigint, display_name text, company text, score bigint, levels bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public, private as $$
  select row_number() over (order by v.score desc, v.last_at asc), p.display_name, p.company, v.score, v.levels, v.last_at
  from private.standings(p_game, case when p_period = 'all' then null else coalesce(p_month, private.current_month()) end) v
  join public.players p on p.id = v.player_id
  order by v.score desc, v.last_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

drop function if exists public.get_company_board(text, int);
drop function if exists public.get_company_board(text, int, text);
create or replace function public.get_company_board(p_period text default 'month', p_limit int default 25, p_game text default 'dash')
returns table (rank bigint, company text, total bigint, players bigint)
language sql stable security definer set search_path = public, private as $$
  with ranked as (
    select lower(btrim(p.company)) ckey, p.company, v.score,
           row_number() over (partition by lower(btrim(p.company)) order by v.score desc) rn
    from private.standings(p_game, case when p_period = 'all' then null else private.current_month() end) v
    join public.players p on p.id = v.player_id
  ), agg as (
    select ckey, min(company) company, sum(score) filter (where rn <= 3) total, count(*) players from ranked group by ckey
  )
  select row_number() over (order by total desc), company, total, players
  from agg order by total desc limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

drop function if exists public.get_monthly_winners(int);
drop function if exists public.get_monthly_winners(int, text);
create or replace function public.get_monthly_winners(p_months int default 12, p_game text default 'dash')
returns table (month text, rank bigint, display_name text, company text, score bigint)
language sql stable security definer set search_path = public, private as $$
  with months as (
    select distinct r.month from public.runs r
    where r.status = 'accepted' and r.month < private.current_month()
      and r.month >= to_char((now() at time zone 'America/Chicago') - make_interval(months => greatest(p_months, 1)), 'YYYY-MM')
  ), ranked as (
    select m.month, v.player_id, v.score, row_number() over (partition by m.month order by v.score desc, v.last_at asc) rk
    from months m cross join lateral private.standings(p_game, m.month) v
  )
  select k.month, k.rk, p.display_name, p.company, k.score
  from ranked k join public.players p on p.id = k.player_id
  where k.rk <= 3 order by k.month desc, k.rk;
$$;

-- --------------------------------------------------------------- permissions
revoke all on all functions in schema public from public;
revoke all on schema private, admin from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function
  public.register_player(text, text, text, boolean, boolean, text, text),
  public.start_run(uuid, text),
  public.submit_run(uuid, uuid, int, int, int, int, int),
  public.submit_level(uuid, uuid, text, int, int, int),
  public.submit_splash(uuid, uuid, int, int, int, int),
  public.get_player_summary(uuid, text),
  public.get_leaderboard(text, text, int, text),
  public.get_company_board(text, int, text),
  public.get_monthly_winners(int, text)
to anon, authenticated;

-- --------------------------------------------------------------- admin views (dashboard / SQL editor only)
-- Drip Dash runner: best run per player per month
drop view if exists admin.dash_standings;
create view admin.dash_standings as
  select r.month, p.display_name, p.company, p.email, max(r.score) best_score, count(*) games,
         min(r.submitted_at) first_run, max(r.submitted_at) last_run, p.is_blocked
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted' and r.level = 'RUN'
  group by r.month, p.id
  order by r.month desc, best_score desc;

-- Splash Escape: best run per player per month (drops = golden drops, valves = power-ups)
drop view if exists admin.splash_standings;
create view admin.splash_standings as
  select r.month, p.display_name, p.company, p.email, max(r.score) best_score, max(r.duration_ms) / 1000 longest_seconds,
         count(*) games, min(r.submitted_at) first_run, max(r.submitted_at) last_run, p.is_blocked
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted' and r.level = 'SPLASH'
  group by r.month, p.id
  order by r.month desc, best_score desc;

-- Bring Back the Flow: Valley Score per player per month
drop view if exists admin.monthly_standings;
drop view if exists admin.flow_standings;
create view admin.flow_standings as
  with best as (
    select r.month, r.player_id, r.level, max(r.score) s, count(*) plays
    from public.runs r where r.status = 'accepted' and r.level not in ('RUN', 'SPLASH') group by r.month, r.player_id, r.level
  )
  select b.month, p.display_name, p.company, p.email, sum(b.s) valley_score, count(*) levels_completed,
         sum(b.plays) games, string_agg(b.level || ':' || b.s, '  ' order by b.level) per_level, p.is_blocked
  from best b join public.players p on p.id = b.player_id
  group by b.month, p.id
  order by b.month desc, valley_score desc;

drop view if exists admin.player_export;
create view admin.player_export as
  select p.email, p.display_name, p.company, p.marketing_opt_in, p.source, p.created_at, p.last_seen_at,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level = 'RUN') dash_best_score,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level = 'SPLASH') splash_best_score,
         (select sum(s) from (select max(score) s from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level not in ('RUN', 'SPLASH') group by r.level) x) flow_valley_score,
         (select count(distinct level) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level not in ('RUN', 'SPLASH')) flow_levels_completed,
         (select count(*) from public.runs r where r.player_id = p.id and r.status = 'accepted') games_played
  from public.players p order by p.created_at desc;

drop view if exists admin.rejected_runs;
create view admin.rejected_runs as
  select r.submitted_at, p.display_name, p.company, p.email, r.level, r.score, r.stars, r.duration_ms, r.distance, r.drops, r.valves, r.reject_reason
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'rejected' order by r.submitted_at desc;

revoke all on all tables in schema admin from anon, authenticated;
