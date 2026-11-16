-- =====================================================================
-- Drip Dash — Supabase schema (run once in Supabase → SQL Editor)
-- Safe to re-run: functions are replaced; tables are created if missing.
--
-- Security model
--   * Tables have RLS ON and no policies → the public API key cannot read
--     or write them directly. Emails are never exposed.
--   * The browser can only call the RPC functions below (SECURITY DEFINER),
--     which validate input, rate-limit, and check scores for plausibility.
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
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  score         integer,
  duration_ms   integer,
  distance      integer,
  drops         integer,
  valves        integer,
  month         text,                       -- 'YYYY-MM' in US Central time
  status        text not null default 'started'
                check (status in ('started','accepted','rejected','disqualified')),
  reject_reason text,
  ip_hash       text
);
create index if not exists runs_board_idx  on public.runs (month, status, score desc);
create index if not exists runs_player_idx on public.runs (player_id, status);
create index if not exists runs_ip_idx     on public.runs (ip_hash, started_at);

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
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then h := null;
  end;
  ip := coalesce(split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'x-real-ip', 'unknown');
  return md5('dripdash:' || btrim(ip));
end $$;

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
  if coalesce(p_hp, '') <> '' then raise exception 'Registration failed.'; end if;          -- honeypot
  if not coalesce(p_consent, false) then raise exception 'Please accept the contest rules.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  if char_length(v_name) not between 2 and 24 then raise exception 'Display name must be 2–24 characters.'; end if;
  if char_length(v_co) not between 2 and 60 then raise exception 'Company must be 2–60 characters.'; end if;
  if v_name ~ '[<>]' or v_co ~ '[<>]' then raise exception 'Please remove < and > characters.'; end if;

  select * into v_p from public.players where email_norm = v_email;
  if found then
    if v_p.is_blocked then raise exception 'This account is not eligible.'; end if;
    -- Existing player on a new device: keep their public name/company (prevents hijack-renames).
    update public.players set last_seen_at = now(),
      marketing_opt_in = marketing_opt_in or coalesce(p_opt_in, false)
      where id = v_p.id;
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

-- --------------------------------------------------------------- start_run (issues a one-time ticket)
create or replace function public.start_run(p_player_key uuid default null)
returns json
language plpgsql security definer set search_path = public, private as $$
declare v_pid uuid; v_ip text := private.client_ip_hash(); v_id uuid;
begin
  if p_player_key is not null then
    select id into v_pid from public.players where player_key = p_player_key and not is_blocked;
  end if;
  if (select count(*) from public.runs where ip_hash = v_ip and started_at > now() - interval '1 hour') >= 400 then
    raise exception 'Too many games from this network. Take a short break!';
  end if;
  if v_pid is not null and (select count(*) from public.runs where player_id = v_pid and started_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Slow down a little!';
  end if;
  insert into public.runs (player_id, ip_hash) values (v_pid, v_ip) returning id into v_id;
  return json_build_object('run_id', v_id, 'started_at', now());
end $$;

-- --------------------------------------------------------------- player summary
create or replace function public.get_player_summary(p_player_key uuid)
returns json
language plpgsql stable security definer set search_path = public, private as $$
declare v_p public.players; v_m text := private.current_month(); v_best_m int; v_best_a int; v_rank int; v_n int; v_runs int;
begin
  select * into v_p from public.players where player_key = p_player_key;
  if not found then return null; end if;
  select max(score) into v_best_a from public.runs where player_id = v_p.id and status = 'accepted';
  select max(score) into v_best_m from public.runs where player_id = v_p.id and status = 'accepted' and month = v_m;
  select count(*) into v_runs from public.runs where player_id = v_p.id and status = 'accepted';
  with best as (
    select r.player_id, max(r.score) s from public.runs r join public.players p on p.id = r.player_id
    where r.month = v_m and r.status = 'accepted' and not p.is_blocked group by r.player_id)
  select count(*) filter (where s > coalesce(v_best_m, -1)) + 1, count(*) into v_rank, v_n from best;
  return json_build_object(
    'display_name', v_p.display_name, 'company', v_p.company,
    'best_all', coalesce(v_best_a, 0), 'best_month', coalesce(v_best_m, 0),
    'month_rank', case when v_best_m is null then null else v_rank end,
    'month_players', v_n, 'runs', v_runs);
end $$;

-- --------------------------------------------------------------- submit_run (plausibility checks)
-- Game facts used for bounds: top speed ≈ 900 px/s = 90 m/s; drops are worth at most
-- 10 × 5 (combo) × 2 (Flow Meter) = 100; golden valves at most 300; shield bonus 50 each.
create or replace function public.submit_run(
  p_run_id uuid, p_player_key uuid, p_score int, p_duration_ms int,
  p_distance int, p_drops int, p_valves int
) returns json
language plpgsql security definer set search_path = public, private as $$
declare
  v_run public.runs; v_pid uuid; v_blocked boolean;
  v_elapsed_ms numeric; v_reason text := null; v_secs numeric;
  v_summary json;
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

  if v_elapsed_ms > 3 * 3600 * 1000 then v_reason := 'ticket expired';
  elsif p_score is null or p_score < 0 or p_score > 1000000 then v_reason := 'invalid score';
  elsif p_duration_ms < 1000 then v_reason := 'run too short';
  elsif p_duration_ms > v_elapsed_ms + 3000 then v_reason := 'run longer than server clock';
  elsif p_distance < 0 or p_distance > v_secs * 92 + 30 then v_reason := 'distance not possible in that time';
  elsif p_drops < 0 or p_drops > v_secs * 20 + 10 then v_reason := 'too many drops for run time';
  elsif p_valves < 0 or p_valves > v_secs / 2 + 3 then v_reason := 'too many valves for run time';
  elsif p_score < p_distance then v_reason := 'score lower than distance';
  elsif p_score > p_distance + p_drops * 100 + p_valves * 300 + (v_secs / 13 + 2) * 50 then v_reason := 'score exceeds possible bonus';
  end if;

  update public.runs set
    player_id = v_pid, submitted_at = now(), score = p_score, duration_ms = p_duration_ms,
    distance = p_distance, drops = p_drops, valves = p_valves, month = private.current_month(),
    status = case when v_reason is null then 'accepted' else 'rejected' end,
    reject_reason = v_reason
  where id = p_run_id;
  update public.players set last_seen_at = now() where id = v_pid;

  v_summary := public.get_player_summary(p_player_key);
  return (jsonb_build_object('accepted', v_reason is null, 'reason', v_reason) || v_summary::jsonb)::json;
end $$;

-- --------------------------------------------------------------- leaderboards
create or replace function public.get_leaderboard(p_period text default 'month', p_month text default null, p_limit int default 50)
returns table (rank bigint, display_name text, company text, score int, achieved_at timestamptz)
language sql stable security definer set search_path = public, private as $$
  with eligible as (
    select r.player_id, r.score, r.submitted_at
    from public.runs r join public.players p on p.id = r.player_id
    where r.status = 'accepted' and not p.is_blocked
      and (p_period = 'all' or r.month = coalesce(p_month, private.current_month()))
  ), best as (
    select distinct on (player_id) player_id, score, submitted_at
    from eligible order by player_id, score desc, submitted_at asc
  )
  select row_number() over (order by b.score desc, b.submitted_at asc), p.display_name, p.company, b.score, b.submitted_at
  from best b join public.players p on p.id = b.player_id
  order by b.score desc, b.submitted_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.get_company_board(p_period text default 'month', p_limit int default 25)
returns table (rank bigint, company text, total bigint, players bigint)
language sql stable security definer set search_path = public, private as $$
  with best as (
    select r.player_id, max(r.score) s
    from public.runs r join public.players p on p.id = r.player_id
    where r.status = 'accepted' and not p.is_blocked
      and (p_period = 'all' or r.month = private.current_month())
    group by r.player_id
  ), ranked as (
    select lower(btrim(p.company)) ckey, p.company, b.s,
           row_number() over (partition by lower(btrim(p.company)) order by b.s desc) rn
    from best b join public.players p on p.id = b.player_id
  ), agg as (
    select ckey, min(company) company, sum(s) filter (where rn <= 3) total, count(*) players
    from ranked group by ckey
  )
  select row_number() over (order by total desc), company, total, players
  from agg order by total desc limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

create or replace function public.get_monthly_winners(p_months int default 12)
returns table (month text, rank bigint, display_name text, company text, score int)
language sql stable security definer set search_path = public, private as $$
  with best as (
    select distinct on (r.month, r.player_id) r.month, r.player_id, r.score, r.submitted_at
    from public.runs r join public.players p on p.id = r.player_id
    where r.status = 'accepted' and not p.is_blocked and r.month < private.current_month()
    order by r.month, r.player_id, r.score desc, r.submitted_at asc
  ), ranked as (
    select b.*, row_number() over (partition by b.month order by b.score desc, b.submitted_at asc) rk from best b
  )
  select k.month, k.rk, p.display_name, p.company, k.score
  from ranked k join public.players p on p.id = k.player_id
  where k.rk <= 3 and k.month >= to_char((now() at time zone 'America/Chicago') - make_interval(months => greatest(p_months, 1)), 'YYYY-MM')
  order by k.month desc, k.rk;
$$;

-- --------------------------------------------------------------- permissions
revoke all on all functions in schema public from public;
revoke all on schema private, admin from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function
  public.register_player(text, text, text, boolean, boolean, text, text),
  public.start_run(uuid),
  public.submit_run(uuid, uuid, int, int, int, int, int),
  public.get_player_summary(uuid),
  public.get_leaderboard(text, text, int),
  public.get_company_board(text, int),
  public.get_monthly_winners(int)
to anon, authenticated;

-- --------------------------------------------------------------- admin views (dashboard / SQL editor only)
create or replace view admin.monthly_standings as
  select r.month, p.display_name, p.company, p.email, max(r.score) best_score,
         count(*) runs, min(r.submitted_at) first_run, max(r.submitted_at) last_run, p.is_blocked
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted'
  group by r.month, p.id
  order by r.month desc, best_score desc;

create or replace view admin.player_export as
  select p.email, p.display_name, p.company, p.marketing_opt_in, p.source, p.created_at, p.last_seen_at,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted') best_score,
         (select count(*) from public.runs r where r.player_id = p.id and r.status = 'accepted') games_played
  from public.players p order by p.created_at desc;

create or replace view admin.rejected_runs as
  select r.submitted_at, p.display_name, p.company, p.email, r.score, r.duration_ms, r.distance, r.drops, r.valves, r.reject_reason
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'rejected' order by r.submitted_at desc;

revoke all on all tables in schema admin from anon, authenticated;
