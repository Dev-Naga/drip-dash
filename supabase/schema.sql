-- =====================================================================
-- Drip Dash games — Supabase schema (run once in Supabase → SQL Editor)
-- Safe to re-run: functions are replaced, tables/columns created if missing.
--
-- Four games share one backend (players register once, play all):
--   * 'dash' — Drip Dash, the endless runner (the main game). Runs use level 'RUN'.
--     Leaderboard = each player's best single run in the period.
--   * 'flow' — Bring Back the Flow, the 7-level story game. Runs use levels L1…L7.
--     Leaderboard = VALLEY SCORE, the sum of a player's best score on each level.
--   * 'splash' — Splash Escape, the splash-pad survival arena. Runs use level 'SPLASH'.
--     Leaderboard = each player's best single run in the period.
--   * 'wrun' — Drip Dash: Water Run, the 3D three-lane runner. Runs use level 'WRUN'.
--     Leaderboard = each player's best single run in the period.
--   * Monthly boards = runs this calendar month (US Central); all-time = every run.
--
-- Security model
--   * Tables have RLS ON and no policies → the public API key cannot read or
--     write them directly. Emails are never exposed.
--   * The browser can only call the RPC functions below (SECURITY DEFINER),
--     which validate input, rate-limit and check scores against per-level limits.
--   * Admin views live in the `admin` schema, which the API does not expose.
--   * Companies: players join a company by exact (normalized) name or business email domain;
--     look-alike names are only suggested / queued for review (admin.company_review_queue), never auto-merged.
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

-- Per-level limits. Drip Run ('WRUN') is the only game on the site: every other level is inactive, so start_run
-- refuses it. The rows stay so past runs of the retired games keep their titles.
create table if not exists private.levels (
  id         text primary key,
  title      text not null,
  max_score  integer not null,
  min_ms     integer not null,
  active     boolean not null default true
);
insert into private.levels (id, title, max_score, min_ms, active) values
  ('WRUN', 'Drip Run', 1000000, 1000, true),          -- the site's only game, checked by submit_water_run
  ('RUN', 'Drip Dash (runner, retired)', 1000000, 1000, false),
  ('SPLASH', 'Splash Escape (retired)', 1000000, 3000, false),
  ('L1', 'Wake the Water (retired)',      7000, 15000, false),
  ('L2', 'The Pressure Dance (retired)',  6500, 55000, false),
  ('L3', 'Before Sunrise (retired)',      7500, 20000, false),
  ('L4', 'Catch the Storm (retired)',     7500, 45000, false),
  ('L5', 'Lift to the Sky (retired)',     7500, 40000, false),
  ('L6', 'The Grand Show (retired)',      7000, 25000, false),
  ('L7', 'Evening Rush (retired)',        7000, 85000, false)
on conflict (id) do update set title = excluded.title, max_score = excluded.max_score, min_ms = excluded.min_ms, active = excluded.active;
create index if not exists runs_wrun_board_idx on public.runs (level, month, score desc) where status = 'accepted';

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
    where r.status = 'accepted' and not p.is_blocked and r.level not in ('RUN', 'SPLASH', 'WRUN') and (p_month is null or r.month = p_month)
    group by r.player_id, r.level
  )
  select player_id, sum(s)::bigint, count(*)::bigint, max(at) from best group by player_id
$$;

-- Single-run games (runner 'RUN', Splash Escape 'SPLASH', Water Run 'WRUN'): each player's best run (earliest wins ties).
create or replace function private.best_run(p_level text, p_month text)
returns table (player_id uuid, score bigint, levels bigint, last_at timestamptz)
language sql stable as $$
  select distinct on (r.player_id) r.player_id, r.score::bigint, null::bigint, r.submitted_at
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted' and not p.is_blocked and r.level = p_level and (p_month is null or r.month = p_month)
  order by r.player_id, r.score desc, r.submitted_at asc
$$;

-- The only public game is Drip Run ('wrun'). Asking for any other game is an error, not an empty board.
create or replace function private.checked_game(p_game text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if coalesce(p_game, 'wrun') <> 'wrun' then raise exception 'Only Drip Run is available.'; end if;
  return 'wrun';
end $$;
create or replace function private.standings(p_game text, p_month text)
returns table (player_id uuid, score bigint, levels bigint, last_at timestamptz)
language sql stable as $$
  select * from private.best_run('WRUN', p_month) where private.checked_game(p_game) = 'wrun'
$$;
drop function if exists private.dash(text);

-- --------------------------------------------------------------- companies: identity, normalization, duplicate review
-- One row per real company. Players point at a company; what each player typed is kept unchanged in players.company.
--   * Exact matches (after normalization) and known email domains are joined automatically.
--   * Anything fuzzy (similar spelling, abbreviations, shorter names) is never merged automatically:
--     it is suggested to the player at sign-up ("Did you mean…?") and queued in admin.company_review_queue
--     for a person to merge or dismiss. Every merge is logged and can be undone (admin.undo_merge).
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 60),   -- display name shown on leaderboards
  name_norm   text not null,                                              -- normalized words, e.g. 'incontrol water systems'
  name_key    text not null,                                              -- compact key, e.g. 'incontrolwatersystems'
  merged_into uuid references public.companies(id),
  created_via text not null default 'signup',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists companies_key_idx on public.companies (name_key) where merged_into is null;

create table if not exists public.company_domains (      -- business email domain -> company (one company per domain)
  domain      text primary key,
  company_id  uuid not null references public.companies(id),
  added_via   text not null default 'signup',
  created_at  timestamptz not null default now()
);
create index if not exists company_domains_company_idx on public.company_domains (company_id);

create table if not exists public.company_aliases (      -- other spellings that mean this company (added by merges/renames)
  alias_key   text primary key,
  company_id  uuid not null references public.companies(id),
  added_via   text not null default 'merge',
  created_at  timestamptz not null default now()
);

create table if not exists public.company_review (       -- possible duplicates waiting for a human decision
  id          bigint generated always as identity primary key,
  company_a   uuid not null references public.companies(id),
  company_b   uuid not null references public.companies(id),
  score       numeric(4,3) not null,
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending', 'merged', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text,
  check (company_a <> company_b)
);
create unique index if not exists company_review_pair_idx on public.company_review (least(company_a, company_b), greatest(company_a, company_b));

create table if not exists public.company_merge_log (     -- every merge, with what moved, so it can be undone
  id            bigint generated always as identity primary key,
  from_id       uuid not null references public.companies(id),
  into_id       uuid not null references public.companies(id),
  moved_players uuid[] not null default '{}',
  moved_domains text[] not null default '{}',
  moved_aliases text[] not null default '{}',
  added_alias   text,
  note          text,
  merged_at     timestamptz not null default now(),
  undone_at     timestamptz
);

alter table public.players add column if not exists company_id uuid references public.companies(id);
alter table public.players add column if not exists email_domain text;
create index if not exists players_company_idx on public.players (company_id);

alter table public.companies         enable row level security;
alter table public.company_domains   enable row level security;
alter table public.company_aliases   enable row level security;
alter table public.company_review    enable row level security;
alter table public.company_merge_log enable row level security;
revoke all on public.companies, public.company_domains, public.company_aliases, public.company_review, public.company_merge_log from anon, authenticated;

-- Personal / free email providers. Sign-ups must use a business address (see private.settings 'allow_personal_email').
-- Keep in sync with PERSONAL_DOMAINS / PERSONAL_LABELS in site/js/company.js (a test checks this).
create table if not exists private.email_providers (
  domain text primary key,
  kind   text not null check (kind in ('free', 'isp', 'disposable'))
);
insert into private.email_providers (domain, kind) values
  ('gmail.com','free'), ('googlemail.com','free'), ('yahoo.com','free'), ('ymail.com','free'), ('rocketmail.com','free'),
  ('outlook.com','free'), ('hotmail.com','free'), ('live.com','free'), ('msn.com','free'), ('passport.com','free'),
  ('aol.com','free'), ('aim.com','free'), ('icloud.com','free'), ('me.com','free'), ('mac.com','free'),
  ('proton.me','free'), ('protonmail.com','free'), ('pm.me','free'), ('gmx.com','free'), ('gmx.net','free'),
  ('mail.com','free'), ('email.com','free'), ('usa.com','free'), ('zohomail.com','free'), ('yandex.com','free'),
  ('tutanota.com','free'), ('tuta.io','free'), ('fastmail.com','free'), ('hey.com','free'), ('inbox.com','free'),
  ('qq.com','free'), ('163.com','free'), ('126.com','free'), ('rediffmail.com','free'), ('mail.ru','free'),
  ('comcast.net','isp'), ('att.net','isp'), ('sbcglobal.net','isp'), ('bellsouth.net','isp'), ('verizon.net','isp'),
  ('charter.net','isp'), ('cox.net','isp'), ('earthlink.net','isp'), ('optonline.net','isp'), ('frontier.com','isp'),
  ('frontiernet.net','isp'), ('windstream.net','isp'), ('centurylink.net','isp'), ('juno.com','isp'), ('netzero.net','isp'),
  ('roadrunner.com','isp'), ('twc.com','isp'), ('suddenlink.net','isp'), ('embarqmail.com','isp'), ('prodigy.net','isp'),
  ('mailinator.com','disposable'), ('guerrillamail.com','disposable'), ('10minutemail.com','disposable'),
  ('yopmail.com','disposable'), ('temp-mail.org','disposable'), ('trashmail.com','disposable'), ('sharklasers.com','disposable')
on conflict (domain) do nothing;

create table if not exists private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values ('allow_personal_email', 'false') on conflict (key) do nothing;

-- Words that mean the same thing, and legal suffixes that don't change who the company is.
create or replace function private.company_norm(p text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare s text; w text[]; o text[] := '{}'; x text; n int;
begin
  s := lower(btrim(coalesce(p, '')));
  -- a website typed as the company ("www.acme-landscaping.com") means the company named by that domain
  if s ~ '^(https?://)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/?$' then
    s := split_part(coalesce(private.registrable_domain(regexp_replace(regexp_replace(s, '^https?://', ''), '/$', '')), s), '.', 1);
  end if;
  s := translate(s, 'àáâãäåāçćčèéêëēěìíîïīñńòóôõöøōùúûüūýÿžš', 'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyyzs');
  s := replace(replace(s, '&', ' and '), '+', ' and ');
  s := regexp_replace(s, '[.''’`-]', '', 'g');               -- joiners: "inCon-trol" -> "incontrol", "A.B.C." -> "abc"
  s := btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
  if s = '' then return ''; end if;
  foreach x in array string_to_array(s, ' ') loop
    o := o || case x
      when 'intl' then 'international' when 'natl' then 'national' when 'svc' then 'services' when 'svcs' then 'services'
      when 'mfg' then 'manufacturing' when 'assoc' then 'associates' when 'assocs' then 'associates' when 'bros' then 'brothers'
      when 'sys' then 'systems' when 'dept' then 'department' when 'mgmt' then 'management' when 'mgt' then 'management'
      when 'engr' then 'engineering' when 'engrg' then 'engineering' when 'constr' then 'construction' when 'grp' then 'group'
      when 'ctr' then 'center' when 'centre' then 'center' when 'hldgs' then 'holdings'
      else x end;
  end loop;
  if cardinality(o) > 1 and o[1] = 'the' then o := o[2:]; end if;
  loop                                                          -- strip trailing legal suffixes ("Acme Landscaping, LLC")
    n := cardinality(o);
    exit when n <= 1 or o[n] not in ('inc','incorporated','llc','llp','lp','lc','ltd','limited','corp','corporation','co','company',
                                     'plc','pllc','pc','pa','gmbh','ag','sa','bv','nv','pty','srl','sas','and');
    o := o[1:n - 1];
  end loop;
  return array_to_string(o, ' ');
end $$;

create or replace function private.company_key(p text) returns text
language sql immutable set search_path = pg_catalog, private as $$ select replace(private.company_norm(p), ' ', '') $$;

-- Display form for a new company: tidy spacing; Title Case only when typed all-lowercase or all-caps.
create or replace function private.company_display(p text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare s text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if s = lower(s) or (s = upper(s) and char_length(s) > 6) then s := initcap(s); end if;
  return s;
end $$;

-- Registrable domain: mail.acme.com -> acme.com, acme.co.uk stays, ci.dallas.tx.us -> dallas.tx.us
create or replace function private.registrable_domain(p_host text) returns text
language plpgsql immutable set search_path = pg_catalog as $$
declare h text := regexp_replace(lower(btrim(coalesce(p_host, ''), ' .')), '^www\.', ''); l text[]; n int;
begin
  if h !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then return null; end if;
  l := string_to_array(h, '.'); n := cardinality(l);
  if n >= 3 and char_length(l[n]) = 2 and l[n - 1] in ('co','com','org','net','ac','gov','edu','ltd','plc','or','ne','gob','gv','nhs','sch') then
    return array_to_string(l[n - 2:n], '.');
  end if;
  if n >= 3 and l[n] = 'us' and char_length(l[n - 1]) = 2 then return array_to_string(l[n - 2:n], '.'); end if;
  return array_to_string(l[n - 1:n], '.');
end $$;

create or replace function private.email_domain(p_email text) returns text
language sql immutable set search_path = pg_catalog, private as $$
  select private.registrable_domain(split_part(lower(btrim(coalesce(p_email, ''))), '@', 2))
$$;

create or replace function private.is_personal_domain(p_domain text) returns boolean
language sql stable set search_path = pg_catalog, private as $$
  select p_domain is not null and (
    exists (select 1 from private.email_providers e where e.domain = p_domain)
    or split_part(p_domain, '.', 1) in ('gmail','googlemail','yahoo','ymail','hotmail','outlook','live','msn','aol','icloud','protonmail','gmx','yandex')
  )
$$;

-- Trigram similarity (0..1) on compact keys; no extension needed.
create or replace function private.trigrams(p text) returns text[]
language sql immutable set search_path = pg_catalog as $$
  select coalesce(array_agg(distinct substr(s, i, 3)), '{}')
  from (select '  ' || coalesce(p, '') || ' ' s) x, generate_series(1, greatest(char_length(s) - 2, 0)) i
$$;

create or replace function private.trigram_sim(a text, b text) returns numeric
language sql immutable set search_path = pg_catalog, private as $$
  with t as (select private.trigrams(a) ta, private.trigrams(b) tb)
  select coalesce((select count(*) from (select unnest(ta) intersect select unnest(tb)) i)::numeric
         / nullif((select count(*) from (select unnest(ta) union select unnest(tb)) u), 0), 0)
  from t
$$;

-- How alike two normalized names are, and why. 1 = same company name; >= 0.5 = worth asking a person.
create or replace function private.company_match(a_norm text, b_norm text, out score numeric, out reason text)
language plpgsql immutable set search_path = pg_catalog, private as $$
declare ka text := replace(coalesce(a_norm, ''), ' ', ''); kb text := replace(coalesce(b_norm, ''), ' ', '');
        wa text[] := string_to_array(nullif(a_norm, ''), ' '); wb text[] := string_to_array(nullif(b_norm, ''), ' ');
        ia text; ib text; na int; nb int;
begin
  score := 0; reason := null;
  if ka = '' or kb = '' then return; end if;
  if ka = kb then score := 1; reason := 'same name'; return; end if;
  na := cardinality(wa); nb := cardinality(wb);
  select string_agg(left(x, 1), '' order by o) into ia from unnest(wa) with ordinality t(x, o);
  select string_agg(left(x, 1), '' order by o) into ib from unnest(wb) with ordinality t(x, o);
  if (na = 1 and nb >= 2 and ka = ib and char_length(ka) between 2 and 6)
     or (nb = 1 and na >= 2 and kb = ia and char_length(kb) between 2 and 6) then
    score := 0.85; reason := 'abbreviation'; return;
  end if;
  if (na < nb and wb[1:na] = wa and char_length(ka) >= 4) or (nb < na and wa[1:nb] = wb and char_length(kb) >= 4) then
    score := 0.8; reason := 'shorter form of the name'; return;
  end if;
  if least(char_length(ka), char_length(kb)) >= 5 and (starts_with(ka, kb) or starts_with(kb, ka)) then
    score := 0.75; reason := 'one name starts with the other'; return;
  end if;
  score := round(private.trigram_sim(ka, kb), 3); reason := 'similar spelling';
  -- "inControl Construction" vs "inCon-trol Water Systems": a distinctive shared first word is worth a question
  if na >= 2 and nb >= 2 and wa[1] = wb[1] and char_length(wa[1]) >= 5 and score < 0.55
     and wa[1] not in ('city','county','state','national','american','texas','north','south','central','united','first',
                       'global','international','general','premier','advanced','superior','quality','professional','southern','northern','western','eastern') then
    score := 0.55; reason := 'same first word';
  end if;
end $$;

create or replace function private.active_company(p_id uuid) returns uuid
language plpgsql stable set search_path = pg_catalog, public as $$
declare v uuid := p_id; nxt uuid; i int := 0;
begin
  loop
    select merged_into into nxt from public.companies where id = v;
    if not found then return null; end if;
    exit when nxt is null or i > 20;
    v := nxt; i := i + 1;
  end loop;
  return v;
end $$;

create or replace function private.company_by_key(p_key text) returns uuid
language sql stable set search_path = pg_catalog, public, private as $$
  select coalesce(
    (select id from public.companies where name_key = p_key and merged_into is null and p_key <> '' order by created_at limit 1),
    (select private.active_company(company_id) from public.company_aliases where alias_key = p_key and p_key <> ''))
$$;

create or replace function private.company_by_domain(p_domain text) returns uuid
language sql stable set search_path = pg_catalog, public, private as $$
  select private.active_company(company_id) from public.company_domains where domain = p_domain
$$;

-- Possible duplicates of a company: active companies scoring >= 0.5 (never merged automatically).
create or replace function private.similar_companies(p_norm text, p_exclude uuid default null, p_limit int default 5)
returns table (id uuid, name text, score numeric, reason text)
language sql stable set search_path = pg_catalog, public, private as $$
  select c.id, c.name, m.score, m.reason
  from public.companies c cross join lateral private.company_match(p_norm, c.name_norm) m
  where c.merged_into is null and c.id is distinct from p_exclude and m.score >= 0.5
  order by m.score desc, c.created_at
  limit p_limit
$$;

create or replace function private.queue_review(p_a uuid, p_b uuid, p_score numeric, p_reason text) returns void
language sql set search_path = pg_catalog, public as $$
  insert into public.company_review (company_a, company_b, score, reason)
  select p_a, p_b, least(p_score, 0.999), p_reason where p_a is not null and p_b is not null and p_a <> p_b
  on conflict do nothing
$$;

-- The one place a player's company is decided (used by sign-up and by the backfill of older players).
-- Order: the company the player confirmed > exact normalized name/alias > known business email domain > new company.
create or replace function private.assign_company(p_name text, p_domain text, p_chosen uuid, p_new boolean, p_via text default 'signup')
returns uuid
language plpgsql set search_path = pg_catalog, public, private as $$
declare v_norm text := private.company_norm(p_name); v_key text := replace(v_norm, ' ', '');
        v_cid uuid; v_via text; v_dom_cid uuid; v_created boolean := false; r record;
begin
  if p_chosen is not null then v_cid := private.active_company(p_chosen); v_via := 'chosen'; end if;
  if v_cid is null and v_key <> '' then v_cid := private.company_by_key(v_key); v_via := 'name'; end if;
  if v_cid is null and p_domain is not null and not coalesce(p_new, false) then
    -- the domain decides only when the typed name is empty or clearly the same company (e.g. "Acme" for Acme Landscaping);
    -- a different name with a known domain is uncertain: it becomes its own company and the pair goes to review
    select c.id into v_cid from public.companies c
     where c.id = private.company_by_domain(p_domain)
       and (v_key = '' or (select m.score from private.company_match(v_norm, c.name_norm) m) >= 0.75);
    v_via := 'domain';
  end if;
  if v_cid is null then
    if v_key = '' then raise exception 'Please enter your company name.'; end if;
    insert into public.companies (name, name_norm, name_key, created_via)
    values (left(private.company_display(p_name), 60), v_norm, v_key, p_via) returning id into v_cid;
    v_created := true;
  end if;

  if p_domain is not null then
    v_dom_cid := private.company_by_domain(p_domain);
    if v_dom_cid is null then
      -- remember the domain only when it can't point at the wrong company
      if v_created or not exists (select 1 from public.company_domains where company_id = v_cid) then
        insert into public.company_domains (domain, company_id, added_via) values (p_domain, v_cid, p_via) on conflict do nothing;
      end if;
    elsif v_dom_cid <> v_cid then
      perform private.queue_review(v_cid, v_dom_cid, 0.9, 'same email domain (' || p_domain || ')');
    end if;
  end if;

  if v_created then
    for r in select * from private.similar_companies(v_norm, v_cid, 5) loop
      perform private.queue_review(v_cid, r.id, r.score, r.reason);
    end loop;
  end if;
  return v_cid;
end $$;

-- Sign-up helper for the browser: what we can tell about this email + company name. Never writes anything.
-- Edit distance with swapped neighbours counted as one edit (gmial -> gmail = 1). Mirrors editDistance() in site/js/company.js.
create or replace function private.edit_distance(a text, b text)
returns int language plpgsql immutable set search_path = pg_catalog as $$
declare la int := length(coalesce(a, '')); lb int := length(coalesce(b, ''));
        d int[]; i int; j int; c int; w int := lb + 1;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;
  d := array_fill(0, array[(la + 1) * w]);                       -- d[i][j] stored at i*w + j + 1
  for i in 0..la loop d[i * w + 1] := i; end loop;
  for j in 0..lb loop d[j + 1] := j; end loop;
  for i in 1..la loop
    for j in 1..lb loop
      c := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      d[i * w + j + 1] := least(d[(i - 1) * w + j + 1] + 1, d[i * w + j] + 1, d[(i - 1) * w + j] + c);
      if i > 1 and j > 1 and substr(a, i, 1) = substr(b, j - 1, 1) and substr(a, i - 1, 1) = substr(b, j, 1) then
        d[i * w + j + 1] := least(d[i * w + j + 1], d[(i - 2) * w + j - 1] + 1);
      end if;
    end loop;
  end loop;
  return d[la * w + lb + 1];
end $$;

-- A probable typo of a known email domain: incontrolwatersystem.com -> incontrolwatersystems.com, gmial.com -> gmail.com.
-- Known = a company's domain on the leaderboard, or a personal email provider. A domain that is itself known is never a typo.
-- Allowed: 1 edit, or 2 for long domains (12+ characters). Mirrors domainTypo() in site/js/company.js.
create or replace function private.domain_typo(p_domain text)
returns text language sql stable set search_path = pg_catalog, public, private as $$
  with known as (
    select domain as d, 0 as pri from public.company_domains
    union all select domain, 1 from private.email_providers
  )
  select k.d from known k
   where p_domain is not null and length(p_domain) >= 6
     and not exists (select 1 from known x where x.d = p_domain)
     and abs(length(k.d) - length(p_domain)) <= 2
     and private.edit_distance(p_domain, k.d) <= case when length(k.d) >= 12 then 2 else 1 end
   order by private.edit_distance(p_domain, k.d), k.pri, k.d
   limit 1
$$;

create or replace function public.lookup_company(p_email text, p_company text default null)
returns json
language plpgsql stable security definer set search_path = pg_catalog, public, private as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
        v_dom text; v_personal boolean; v_allow boolean; v_biz text; v_norm text; v_key text;
        v_name_c uuid; v_dom_c uuid; v_match uuid; v_via text; v_conflict boolean := false; v_sugg json; v_guess text; v_label text; v_label_c json;
        v_needs boolean := false;
begin
  if length(v_email) > 120 or length(coalesce(p_company, '')) > 60 then raise exception 'Input too long.'; end if;
  v_dom := private.email_domain(v_email);
  v_personal := private.is_personal_domain(v_dom);
  v_allow := coalesce((select value = 'true' from private.settings where key = 'allow_personal_email'), false);
  v_biz := case when v_personal then null else v_dom end;
  v_norm := private.company_norm(p_company); v_key := replace(v_norm, ' ', '');

  v_name_c := private.company_by_key(v_key);
  if v_biz is not null then v_dom_c := private.company_by_domain(v_biz); end if;
  v_match := coalesce(v_name_c, v_dom_c);
  v_via := case when v_name_c is not null then 'name' when v_dom_c is not null then 'domain' end;
  v_conflict := v_name_c is not null and v_dom_c is not null and v_name_c <> v_dom_c;

  if v_biz is not null and v_dom_c is null then
    v_label := split_part(v_biz, '.', 1);
    v_guess := left(initcap(replace(v_label, '-', ' ')), 60);
    -- a company whose name matches the domain (acmelandscaping.com ~ "Acme Landscaping") is offered, not assumed
    select json_build_object('id', s.id, 'name', s.name, 'score', s.score, 'reason', 'matches your email domain')
      into v_label_c from private.similar_companies(replace(v_label, '-', ''), null, 1) s where s.score >= 0.75;
  end if;

  select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'score', s.score, 'reason', s.reason) order by s.score desc), '[]')
    into v_sugg
  from (
    select * from private.similar_companies(v_norm, v_match, 4) where v_key <> ''
    union
    select (v_label_c ->> 'id')::uuid, v_label_c ->> 'name', (v_label_c ->> 'score')::numeric, v_label_c ->> 'reason' where v_label_c is not null and v_match is null
  ) s where s.id is distinct from v_match;

  v_needs := v_conflict
          or (v_match is null and json_array_length(v_sugg) > 0)
          or (v_via = 'domain' and v_key <> '' and v_key <> (select name_key from public.companies where id = v_match));

  return json_build_object(
    'email_valid', v_dom is not null,
    'domain', v_biz,
    'personal', coalesce(v_personal, false),
    'personal_blocked', coalesce(v_personal, false) and not v_allow,
    'match', (select json_build_object('id', c.id, 'name', c.name) from public.companies c where c.id = v_match),
    'via', v_via,
    'domain_company', case when v_conflict then (select json_build_object('id', c.id, 'name', c.name) from public.companies c where c.id = v_dom_c) end,
    'suggestions', v_sugg,
    'guess', case when v_match is null then v_guess end,
    'needs_confirmation', v_needs,
    'domain_typo', private.domain_typo(v_dom)   -- e.g. 'incontrolwatersystems.com' when the email says incontrolwatersystem.com
  );
end $$;

-- --------------------------------------------------------------- display names: rules, uniqueness, blocked words
-- Rules (mirrored for instant feedback in site/js/names.js; the server always decides):
--   3–24 characters after trimming; letters (accents allowed), numbers, spaces and . ' ’ - _ only;
--   at least one letter; no doubled spaces/punctuation; nothing offensive or reserved;
--   unique, ignoring case, accents, spaces and punctuation ("Naga D" = "naga-d" = "NAGAD").
create or replace function private.name_key(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select regexp_replace(translate(lower(coalesce(p, '')), 'àáâãäåāçćčèéêëēěìíîïīñńòóôõöøōùúûüūýÿžš', 'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyyzs'), '[^a-z0-9]', '', 'g')
$$;

-- Words a display name may not contain. whole = true: only as a whole word ("ass" blocks "Big Ass" but not "Cassie").
-- Extend with: insert into private.blocked_names (word, whole) values ('example', true);
create table if not exists private.blocked_names (
  word  text primary key check (word ~ '^[a-z0-9]+$'),
  whole boolean not null default false
);
insert into private.blocked_names (word, whole) values
  ('fuck', false), ('shit', false), ('bitch', false), ('cunt', true), ('cunts', true), ('whore', false), ('slut', false),
  ('nigger', false), ('nigga', false), ('faggot', false), ('pussy', false), ('asshole', false),
  ('bastard', false), ('motherf', false), ('dildo', false), ('porn', false), ('penis', false), ('vagina', false),
  ('hitler', false), ('kkk', false), ('twat', false),
  ('ass', true), ('dick', true), ('cock', true), ('fag', true), ('sex', true), ('anal', true), ('cum', true),
  ('tits', true), ('boobs', true), ('rape', true), ('rapist', true), ('piss', true), ('nazi', true), ('wank', true),
  ('retard', true), ('retarded', true),
  -- reserved: could be mistaken for staff or the company
  ('admin', true), ('administrator', true), ('moderator', true), ('mod', true), ('staff', true), ('official', true),
  ('null', true), ('undefined', true), ('incontrol', true), ('incontrolwatersystems', true), ('dripdash', true), ('driprun', true)
on conflict (word) do update set whole = excluded.whole;

-- null when the name is fine, otherwise the message to show the player
create or replace function private.name_problem(p text) returns text
language plpgsql stable set search_path = pg_catalog, private as $$
declare
  n text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  k text; leet text; toks text[]; ltoks text[];
begin
  if char_length(n) < 3 or char_length(n) > 24 then return 'Display name must be 3–24 characters.'; end if;
  if n !~ '^[A-Za-z0-9À-ÖØ-öø-ÿ .''’_-]+$' then return 'Display names can only use letters, numbers, spaces and . '' - _'; end if;
  if n !~ '[A-Za-zÀ-ÖØ-öø-ÿ]' then return 'Display names need at least one letter.'; end if;
  if n ~ '[.''’_-]{2,}' then return 'Please don''t put two punctuation marks in a row.'; end if;
  k := private.name_key(n);
  if char_length(k) < 3 then return 'Display name must have at least 3 letters or numbers.'; end if;
  leet := translate(k, '0134578', 'oieastb');
  toks := regexp_split_to_array(translate(lower(n), 'àáâãäåāçćčèéêëēěìíîïīñńòóôõöøōùúûüūýÿžš', 'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyyzs'), '[^a-z0-9]+');
  ltoks := array(select translate(t, '0134578', 'oieastb') from unnest(toks) t);
  if exists (select 1 from private.blocked_names b
             where (not b.whole and (strpos(k, b.word) > 0 or strpos(leet, b.word) > 0))
                or (b.whole and (b.word = any(toks) or b.word = any(ltoks) or b.word = k or b.word = leet))) then
    return 'Please choose a different display name.';
  end if;
  return null;
end $$;

create or replace function private.name_taken(p text, p_except uuid) returns boolean
language sql stable set search_path = pg_catalog, public, private as $$
  select exists (select 1 from public.players where private.name_key(display_name) = private.name_key(p) and id is distinct from p_except)
$$;

-- one player per name (same key). If older duplicate names exist the index waits until they are fixed
-- (admin.duplicate_names lists them); sign-up still refuses taken names through private.name_taken either way.
do $$ begin
  if to_regclass('public.players_name_key_uidx') is null then
    if exists (select 1 from public.players group by private.name_key(display_name) having count(*) > 1) then
      raise notice 'Duplicate display names exist: unique name index not created yet. See admin.duplicate_names.';
    else
      create unique index players_name_key_uidx on public.players (private.name_key(display_name));
    end if;
  end if;
end $$;
drop view if exists admin.duplicate_names;
create view admin.duplicate_names as
  select private.name_key(display_name) as name_key, array_agg(display_name || ' <' || email || '>' order by created_at) as players
  from public.players group by 1 having count(*) > 1;

-- live check for the sign-up form: { ok, message }
create or replace function public.check_display_name(p_name text)
returns json language plpgsql stable security definer set search_path = pg_catalog, public, private as $$
declare v_prob text;
begin
  if length(coalesce(p_name, '')) > 100 then return json_build_object('ok', false, 'message', 'Display name must be 3–24 characters.'); end if;
  v_prob := private.name_problem(p_name);
  if v_prob is not null then return json_build_object('ok', false, 'message', v_prob); end if;
  if private.name_taken(btrim(regexp_replace(p_name, '\s+', ' ', 'g')), null) then
    return json_build_object('ok', false, 'taken', true, 'message', 'That display name is already taken. If it''s yours, sign in with the same email.');
  end if;
  return json_build_object('ok', true, 'message', null);
end $$;

-- a player whose saved name breaks the rules (e.g. 2 characters, saved before they existed) picks a new one in-game;
-- names that are already fine can't be changed this way
create or replace function public.fix_display_name(p_player_key uuid, p_name text)
returns json language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_p public.players; v_prob text; v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  select * into v_p from public.players where player_key = p_player_key for update;
  if not found then raise exception 'Unknown player. Please register again.'; end if;
  if v_p.is_blocked then raise exception 'This account is not eligible.'; end if;
  if private.name_problem(v_p.display_name) is null then raise exception 'Your display name already meets the rules.'; end if;
  v_prob := private.name_problem(v_name);
  if v_prob is not null then raise exception '%', v_prob; end if;
  if private.name_taken(v_name, v_p.id) then raise exception 'That display name is already taken. Please choose another.'; end if;
  update public.players set display_name = v_name where id = v_p.id returning * into v_p;
  return json_build_object('display_name', v_p.display_name);
end $$;

-- --------------------------------------------------------------- Drip Run worlds (one per inCon-trol project)
-- The run loops endlessly through the worlds that are live, in sort order. A world is live when its status is 'live',
-- or 'scheduled' and its release_at has passed: a monthly release needs no deploy, only a row here.
--   live       playable now
--   scheduled  playable from release_at (shown as "coming" until then)
--   locked     temporarily out of the rotation (hidden)
--   retired    gone for good (hidden; kept for the record)
-- A brand-new world also needs its scenery in site/js/run-game.js (LOOK, LAYOUTS, ATMOS, decor) and its project
-- in site/js/run-projects.js; the game ignores ids it has no scenery for.
create table if not exists private.worlds (
  id          text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name        text not null check (char_length(name) between 2 and 60),
  sort        int  not null,
  status      text not null default 'scheduled' check (status in ('live', 'scheduled', 'locked', 'retired')),
  release_at  timestamptz,
  note        text,
  updated_at  timestamptz not null default now(),
  check (status <> 'scheduled' or release_at is not null)
);
-- Launch: 4 worlds live, then one more on the 1st of each month (midnight Central). Re-running this file never
-- overwrites changes made with the admin functions below.
insert into private.worlds (id, name, sort, status, release_at, note) values
  ('melissa',   'Melissa Lake Park',            1, 'live',      null, 'launch world'),
  ('epic',      'The Epic East',                2, 'live',      null, 'launch world'),
  ('mckinney',  'McKinney City Hall',           3, 'live',      null, 'launch world'),
  ('olympus',   '3300 Olympus Drive',           4, 'live',      null, 'launch world'),
  ('aggie',     'Aggie Park',                   5, 'scheduled', '2026-12-01 00:00 America/Chicago', 'December release'),
  ('arboretum', 'Dallas Arboretum',             6, 'scheduled', '2027-01-01 00:00 America/Chicago', 'January release'),
  ('chase',     'Chase Tower',                  7, 'scheduled', '2027-02-01 00:00 America/Chicago', 'February release'),
  ('agora',     'Commons at Agora',             8, 'scheduled', '2027-03-01 00:00 America/Chicago', 'March release')
on conflict (id) do nothing;

create or replace function private.world_state(w private.worlds) returns text
language sql stable as $$
  select case
    when w.status = 'live' or (w.status = 'scheduled' and w.release_at <= now()) then 'live'
    when w.status = 'scheduled' then 'coming'
    else w.status end
$$;

-- what the game shows: live worlds (played in this order) and upcoming ones (as "coming <date>")
create or replace function public.get_worlds()
returns json language sql stable security definer set search_path = pg_catalog, public, private as $$
  select coalesce(json_agg(json_build_object('id', w.id, 'name', w.name, 'sort', w.sort, 'state', private.world_state(w),
           'release_at', case when private.world_state(w) = 'coming' then w.release_at end) order by w.sort), '[]')
  from private.worlds w where private.world_state(w) in ('live', 'coming')
$$;

-- admin: schedule, lock, rotate, retire or add worlds (SQL editor only)
create or replace function admin.set_world(p_id text, p_status text, p_release_at timestamptz default null, p_note text default null)
returns text language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare w private.worlds;
begin
  select * into w from private.worlds where id = p_id for update;
  if not found then raise exception 'No world %', p_id; end if;
  if p_status not in ('live', 'scheduled', 'locked', 'retired') then raise exception 'Status must be live, scheduled, locked or retired.'; end if;
  if p_status = 'scheduled' and p_release_at is null then raise exception 'A scheduled world needs a release time.'; end if;
  update private.worlds set status = p_status, release_at = case when p_status = 'scheduled' then p_release_at else release_at end,
    note = coalesce(p_note, note), updated_at = now() where id = p_id;
  if not exists (select 1 from private.worlds x where private.world_state(x) = 'live') then
    raise exception 'At least one world must stay live.';
  end if;
  return p_id || ' is now ' || p_status;
end $$;

create or replace function admin.add_world(p_id text, p_name text, p_sort int, p_status text default 'scheduled', p_release_at timestamptz default null)
returns text language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  insert into private.worlds (id, name, sort, status, release_at, note) values (p_id, p_name, p_sort, p_status, p_release_at, 'added');
  return p_id || ' added (' || p_status || ')';
end $$;

-- admin: fix a display name (same rules as sign-up)
create or replace function admin.rename_player(p_email text, p_name text)
returns text language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_id uuid; v_prob text := private.name_problem(p_name);
begin
  select id into v_id from public.players where email_norm = lower(btrim(p_email));
  if v_id is null then raise exception 'No player with that email.'; end if;
  if v_prob is not null then raise exception '%', v_prob; end if;
  if private.name_taken(p_name, v_id) then raise exception 'That display name is already taken.'; end if;
  update public.players set display_name = btrim(regexp_replace(p_name, '\s+', ' ', 'g')) where id = v_id;
  return 'renamed';
end $$;

drop view if exists admin.worlds;
create view admin.worlds as
  select w.sort, w.id, w.name, w.status, private.world_state(w) as state_now, w.release_at at time zone 'America/Chicago' as release_central, w.note, w.updated_at
  from private.worlds w order by w.sort;

-- players whose names were saved before the current rules (shown on boards until they sign in again or are renamed)
drop view if exists admin.names_to_fix;
create view admin.names_to_fix as
  select email, display_name, private.name_problem(display_name) as problem,
         format('select admin.rename_player(%L, %L);', email, 'NEW NAME') as rename_sql
  from public.players where private.name_problem(display_name) is not null;

-- --------------------------------------------------------------- register_player
drop function if exists public.register_player(text, text, text, boolean, boolean, text, text);
create or replace function public.register_player(
  p_email text, p_name text, p_company text, p_consent boolean,
  p_opt_in boolean default false, p_source text default null, p_hp text default '',
  p_company_id uuid default null,        -- a company the player picked from the suggestions
  p_new_company boolean default false    -- the player confirmed their company is NOT the one their email domain suggests
) returns json
language plpgsql security definer set search_path = public, private as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_co    text := btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'));
  v_ip    text := private.client_ip_hash();
  v_dom   text;
  v_biz   text;
  v_cid   uuid;
  v_p     public.players;
  v_back  boolean := false;   -- a returning player (this email already has a record)
  v_prob  text;
begin
  if coalesce(p_hp, '') <> '' then raise exception 'Registration failed.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Please accept the contest rules.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' or length(v_email) > 120 then raise exception 'Please enter a valid email address.'; end if;
  if char_length(v_co) > 60 or (v_co <> '' and char_length(v_co) < 2) then raise exception 'Company must be 2–60 characters.'; end if;
  if v_name ~ '[<>]' or v_co ~ '[<>]' then raise exception 'Please remove < and > characters.'; end if;
  v_dom := private.email_domain(v_email);
  if v_dom is null then raise exception 'Please enter a valid email address.'; end if;
  v_biz := case when private.is_personal_domain(v_dom) then null else v_dom end;

  select * into v_p from public.players where email_norm = v_email;
  if found then
    v_back := true;
    -- returning player: keep their record (personal addresses registered before this rule keep working)
    if v_p.is_blocked then raise exception 'This account is not eligible.'; end if;
    -- a name saved before the current rules (e.g. 2 characters) is replaced by the name typed now, if that one is valid
    if private.name_problem(v_p.display_name) is not null then
      v_prob := private.name_problem(v_name);
      if v_prob is not null then raise exception 'Please choose a new display name. %', v_prob; end if;
      if private.name_taken(v_name, v_p.id) then raise exception 'That display name is already taken. Please choose another.'; end if;
      update public.players set display_name = v_name where id = v_p.id;
    end if;
    if v_p.company_id is null then
      v_cid := private.assign_company(v_p.company, case when private.is_personal_domain(v_dom) then null else v_dom end, null, false, 'signup');
    end if;
    update public.players set last_seen_at = now(), marketing_opt_in = marketing_opt_in or coalesce(p_opt_in, false),
      company_id = coalesce(company_id, v_cid), email_domain = coalesce(email_domain, v_dom)
    where id = v_p.id returning * into v_p;
  else
    v_prob := private.name_problem(v_name);
    if v_prob is not null then raise exception '%', v_prob; end if;
    if private.name_taken(v_name, null) then raise exception 'That display name is already taken. Please choose another.'; end if;
    if v_biz is null and not coalesce((select value = 'true' from private.settings where key = 'allow_personal_email'), false) then
      raise exception 'Please use your business email address. Personal addresses (like %) can''t join the leaderboard.', v_dom;
    end if;
    if (select count(*) from public.players where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 15 then
      raise exception 'Too many sign-ups from this network. Please try again later.';
    end if;
    if v_co = '' and (p_company_id is null and (v_biz is null or private.company_by_domain(v_biz) is null)) then
      raise exception 'Please enter your company name.';
    end if;
    v_cid := private.assign_company(v_co, v_biz, p_company_id, p_new_company, 'signup');
    if v_co = '' then v_co := (select name from public.companies where id = v_cid); end if;
    begin
      insert into public.players (email, display_name, company, marketing_opt_in, source, ip_hash, last_seen_at, company_id, email_domain)
      values (v_email, v_name, v_co, coalesce(p_opt_in, false), left(p_source, 80), v_ip, now(), v_cid, v_dom)
      returning * into v_p;
    exception when unique_violation then   -- two sign-ups at the same moment: the unique indexes decide
      if sqlerrm ~ 'name_key' then raise exception 'That display name is already taken. Please choose another.'; end if;
      raise exception 'This email was just registered. Please try again.';
    end;
  end if;
  return json_build_object('player_key', v_p.player_key, 'display_name', v_p.display_name,
    'company', coalesce((select name from public.companies where id = private.active_company(v_p.company_id)), v_p.company),
    'company_id', private.active_company(v_p.company_id),
    'returning', v_back);
end $$;

-- --------------------------------------------------------------- start_run (one-time ticket per level attempt)
drop function if exists public.start_run(uuid);
create or replace function public.start_run(p_player_key uuid default null, p_level text default 'WRUN')
returns json
language plpgsql security definer set search_path = public, private as $$
declare v_pid uuid; v_ip text := private.client_ip_hash(); v_id uuid;
begin
  if not exists (select 1 from private.levels where id = p_level and active) then raise exception 'Only Drip Run is available.'; end if;
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
create or replace function public.get_player_summary(p_player_key uuid, p_game text default 'wrun')
returns json
language plpgsql stable security definer set search_path = public, private as $$
declare v_p public.players; v_m text := private.current_month(); v_ms bigint; v_as bigint; v_rank bigint; v_n bigint;
begin
  perform private.checked_game(p_game);
  select * into v_p from public.players where player_key = p_player_key;
  if not found then return null; end if;
  select score into v_ms from private.standings(p_game, v_m) where player_id = v_p.id;
  select score into v_as from private.standings(p_game, null) where player_id = v_p.id;
  select count(*) filter (where score > coalesce(v_ms, -1)) + 1, count(*) into v_rank, v_n from private.standings(p_game, v_m);
  return json_build_object('display_name', v_p.display_name,
    'company', coalesce((select name from public.companies where id = v_p.company_id), v_p.company),
    'month_score', coalesce(v_ms, 0), 'all_score', coalesce(v_as, 0),       -- names used by Bring Back the Flow
    'best_month', coalesce(v_ms, 0), 'best_all', coalesce(v_as, 0),          -- names used by Drip Dash and Splash Escape
    'month_rank', case when v_ms is null then null else v_rank end, 'month_players', v_n);
end $$;

-- --------------------------------------------------------------- retired games
-- Drip Run is the site's only game. The score functions of Drip Dash (runner), Bring Back the Flow and Splash Escape
-- are removed, so nothing can submit to them over the API; their past runs stay in public.runs for the record.
drop function if exists public.submit_run(uuid, uuid, int, int, int, int, int);
drop function if exists public.submit_level(uuid, uuid, text, int, int, int);
drop function if exists public.submit_splash(uuid, uuid, int, int, int, int);

-- --------------------------------------------------------------- submit_water_run — Drip Run (plausibility checks; endless runs)
-- Game facts used for bounds (keep in sync with RULES in site/js/run-game.js):
--   top speed 30 m/s, x1.5 during Jet Boost = 45 m/s; a drop is worth at most 10 x 2 (Flow Meter) = 20;
--   a golden valve at most 100 x 2 = 200; a power-up pickup 25. Drops: at most 5 per obstacle row,
--   rows at least 0.62 s apart; valves at least 6 s apart; power-ups at least 10 s apart.
--   Water delivery: 3 supply inlets per 300 m stop, 150 points each; completing all 3 in a stop adds 300.
drop function if exists public.submit_water_run(uuid, uuid, int, int, int, int, int, int);
create or replace function public.submit_water_run(
  p_run_id uuid, p_player_key uuid, p_score int, p_duration_ms int,
  p_distance int, p_drops int, p_valves int, p_powerups int,
  p_deliveries int default 0, p_stops int default 0
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
  if v_run.level is distinct from 'WRUN' then v_reason := 'ticket is not for Drip Run';
  elsif v_elapsed_ms > 3 * 3600 * 1000 then v_reason := 'ticket expired';
  elsif p_score is null or p_score < 0 or p_score > 1000000 then v_reason := 'invalid score';
  elsif p_duration_ms is null or p_duration_ms < 1000 then v_reason := 'run too short';
  elsif p_duration_ms > v_elapsed_ms + 3000 then v_reason := 'run longer than server clock';
  elsif p_distance is null or p_distance < 0 or p_distance > v_secs * 46 + 30 then v_reason := 'distance not possible in that time';
  elsif p_drops is null or p_drops < 0 or p_drops > v_secs * 9 + 10 then v_reason := 'too many drops for run time';
  elsif p_valves is null or p_valves < 0 or p_valves > v_secs / 5 + 3 then v_reason := 'too many valves for run time';
  elsif p_powerups is null or p_powerups < 0 or p_powerups > v_secs / 9 + 2 then v_reason := 'too many power-ups for run time';
  elsif coalesce(p_deliveries, 0) < 0 or coalesce(p_deliveries, 0) > p_distance / 100 + 3 then v_reason := 'too many water deliveries for distance';
  elsif coalesce(p_stops, 0) < 0 or coalesce(p_stops, 0) * 3 > coalesce(p_deliveries, 0) then v_reason := 'too many completed stops';
  elsif p_score < p_distance then v_reason := 'score lower than distance';
  elsif p_score > p_distance + p_drops * 20 + p_valves * 200 + p_powerups * 25 + coalesce(p_deliveries, 0) * 150 + coalesce(p_stops, 0) * 300 + 10 then v_reason := 'score exceeds possible bonus';
  end if;

  update public.runs set player_id = v_pid, submitted_at = now(), score = p_score, duration_ms = p_duration_ms,
    distance = p_distance, drops = p_drops, valves = p_valves, stars = least(p_powerups, 32000), month = private.current_month(),
    status = case when v_reason is null then 'accepted' else 'rejected' end, reject_reason = v_reason
  where id = p_run_id;
  update public.players set last_seen_at = now() where id = v_pid;
  return (jsonb_build_object('accepted', v_reason is null, 'reason', v_reason) || public.get_player_summary(p_player_key, 'wrun')::jsonb)::json;
end $$;

-- --------------------------------------------------------------- leaderboards (Drip Run only: p_game must be 'wrun')
drop function if exists public.get_leaderboard(text, text, int);
drop function if exists public.get_leaderboard(text, text, int, text);
create or replace function public.get_leaderboard(p_period text default 'month', p_month text default null, p_limit int default 50, p_game text default 'wrun')
returns table (rank bigint, display_name text, company text, score bigint, levels bigint, achieved_at timestamptz)
language sql stable security definer set search_path = public, private as $$
  select row_number() over (order by v.score desc, v.last_at asc), p.display_name, coalesce(c.name, p.company), v.score, v.levels, v.last_at
  from private.standings(p_game, case when p_period = 'all' then null else coalesce(p_month, private.current_month()) end) v
  join public.players p on p.id = v.player_id
  left join public.companies c on c.id = p.company_id
  order by v.score desc, v.last_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

drop function if exists public.get_company_board(text, int);
drop function if exists public.get_company_board(text, int, text);
create or replace function public.get_company_board(p_period text default 'month', p_limit int default 25, p_game text default 'wrun')
returns table (rank bigint, company text, total bigint, players bigint)
language sql stable security definer set search_path = public, private as $$
  with ranked as (
    select coalesce(p.company_id::text, private.company_key(p.company)) ckey, coalesce(c.name, p.company) company, v.score,
           row_number() over (partition by coalesce(p.company_id::text, private.company_key(p.company)) order by v.score desc) rn
    from private.standings(p_game, case when p_period = 'all' then null else private.current_month() end) v
    join public.players p on p.id = v.player_id
    left join public.companies c on c.id = p.company_id
  ), agg as (
    select ckey, min(company) company, sum(score) filter (where rn <= 3) total, count(*) players from ranked group by ckey
  )
  select row_number() over (order by total desc), company, total, players
  from agg order by total desc limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

drop function if exists public.get_monthly_winners(int);
drop function if exists public.get_monthly_winners(int, text);
create or replace function public.get_monthly_winners(p_months int default 12, p_game text default 'wrun')
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
  select k.month, k.rk, p.display_name, coalesce(c.name, p.company), k.score
  from ranked k join public.players p on p.id = k.player_id left join public.companies c on c.id = p.company_id
  where k.rk <= 3 order by k.month desc, k.rk;
$$;

-- --------------------------------------------------------------- permissions
revoke all on all functions in schema public from public;
revoke all on schema private, admin from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function
  public.register_player(text, text, text, boolean, boolean, text, text, uuid, boolean),
  public.lookup_company(text, text),
  public.start_run(uuid, text),
  public.submit_water_run(uuid, uuid, int, int, int, int, int, int, int, int),
  public.get_worlds(),
  public.check_display_name(text),
  public.fix_display_name(uuid, text),
  public.get_player_summary(uuid, text),
  public.get_leaderboard(text, text, int, text),
  public.get_company_board(text, int, text),
  public.get_monthly_winners(int, text)
to anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

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

-- Water Run: best run per player per month (stars = power-ups collected)
drop view if exists admin.water_run_standings;
create view admin.water_run_standings as
  select r.month, p.display_name, p.company, p.email, max(r.score) best_score, max(r.distance) longest_m,
         count(*) games, min(r.submitted_at) first_run, max(r.submitted_at) last_run, p.is_blocked
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'accepted' and r.level = 'WRUN'
  group by r.month, p.id
  order by r.month desc, best_score desc;

-- Bring Back the Flow: Valley Score per player per month
drop view if exists admin.monthly_standings;
drop view if exists admin.flow_standings;
create view admin.flow_standings as
  with best as (
    select r.month, r.player_id, r.level, max(r.score) s, count(*) plays
    from public.runs r where r.status = 'accepted' and r.level not in ('RUN', 'SPLASH', 'WRUN') group by r.month, r.player_id, r.level
  )
  select b.month, p.display_name, p.company, p.email, sum(b.s) valley_score, count(*) levels_completed,
         sum(b.plays) games, string_agg(b.level || ':' || b.s, '  ' order by b.level) per_level, p.is_blocked
  from best b join public.players p on p.id = b.player_id
  group by b.month, p.id
  order by b.month desc, valley_score desc;

drop view if exists admin.player_export;
create view admin.player_export as
  select p.email, p.display_name, p.company typed_company, (select name from public.companies c where c.id = p.company_id) company, p.email_domain, p.marketing_opt_in, p.source, p.created_at, p.last_seen_at,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level = 'RUN') dash_best_score,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level = 'SPLASH') splash_best_score,
         (select max(score) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level = 'WRUN') water_run_best_score,
         (select sum(s) from (select max(score) s from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level not in ('RUN', 'SPLASH', 'WRUN') group by r.level) x) flow_valley_score,
         (select count(distinct level) from public.runs r where r.player_id = p.id and r.status = 'accepted' and r.level not in ('RUN', 'SPLASH', 'WRUN')) flow_levels_completed,
         (select count(*) from public.runs r where r.player_id = p.id and r.status = 'accepted') games_played
  from public.players p order by p.created_at desc;

drop view if exists admin.rejected_runs;
create view admin.rejected_runs as
  select r.submitted_at, p.display_name, p.company, p.email, r.level, r.score, r.stars, r.duration_ms, r.distance, r.drops, r.valves, r.reject_reason
  from public.runs r join public.players p on p.id = r.player_id
  where r.status = 'rejected' order by r.submitted_at desc;

-- --------------------------------------------------------------- company review & merge (admin, SQL editor only)
-- Daily use:   select * from admin.company_review_queue;      -- possible duplicates, best match first,
--              each row has ready-to-run merge / dismiss statements.
create or replace function admin.merge_companies(p_from uuid, p_into uuid, p_note text default null) returns json
language plpgsql set search_path = pg_catalog, public, private as $$
declare f public.companies; t public.companies; v_players uuid[]; v_domains text[]; v_aliases text[]; v_alias text; v_log bigint;
begin
  select * into f from public.companies where id = p_from for update;
  select * into t from public.companies where id = p_into for update;
  if f.id is null or t.id is null then raise exception 'Unknown company.'; end if;
  if f.id = t.id then raise exception 'A company cannot be merged into itself.'; end if;
  if f.merged_into is not null or t.merged_into is not null then raise exception 'Both companies must be active (not already merged).'; end if;
  select coalesce(array_agg(id), '{}') into v_players from public.players where company_id = p_from;
  select coalesce(array_agg(domain), '{}') into v_domains from public.company_domains where company_id = p_from;
  select coalesce(array_agg(alias_key), '{}') into v_aliases from public.company_aliases where company_id = p_from;
  update public.players set company_id = p_into where company_id = p_from;
  update public.company_domains set company_id = p_into where company_id = p_from;
  update public.company_aliases set company_id = p_into where company_id = p_from;
  if f.name_key <> t.name_key then
    insert into public.company_aliases (alias_key, company_id, added_via) values (f.name_key, p_into, 'merge')
    on conflict (alias_key) do nothing returning alias_key into v_alias;
  end if;
  update public.companies set merged_into = p_into, updated_at = now() where id = p_from;
  update public.company_review set status = 'merged', resolved_at = now(), resolved_note = p_note
   where status = 'pending' and least(company_a, company_b) = least(p_from, p_into) and greatest(company_a, company_b) = greatest(p_from, p_into);
  insert into public.company_merge_log (from_id, into_id, moved_players, moved_domains, moved_aliases, added_alias, note)
  values (p_from, p_into, v_players, v_domains, v_aliases, v_alias, p_note) returning id into v_log;
  return json_build_object('merge_id', v_log, 'merged', f.name, 'into', t.name, 'players_moved', cardinality(v_players),
    'domains_moved', v_domains, 'undo', format('select admin.undo_merge(%s);', v_log));
end $$;

create or replace function admin.undo_merge(p_merge_id bigint) returns json
language plpgsql set search_path = pg_catalog, public, private as $$
declare m public.company_merge_log; v_n int;
begin
  select * into m from public.company_merge_log where id = p_merge_id for update;
  if m.id is null then raise exception 'Unknown merge.'; end if;
  if m.undone_at is not null then raise exception 'This merge was already undone.'; end if;
  if exists (select 1 from public.companies where id = m.into_id and merged_into is not null) then
    raise exception 'The target company was merged again later. Undo that merge first.';
  end if;
  update public.players set company_id = m.from_id where id = any(m.moved_players) and company_id = m.into_id;
  get diagnostics v_n = row_count;
  update public.company_domains set company_id = m.from_id where domain = any(m.moved_domains) and company_id = m.into_id;
  update public.company_aliases set company_id = m.from_id where alias_key = any(m.moved_aliases) and company_id = m.into_id;
  if m.added_alias is not null then delete from public.company_aliases where alias_key = m.added_alias and company_id = m.into_id; end if;
  update public.companies set merged_into = null, updated_at = now() where id = m.from_id;
  update public.company_review set status = 'pending', resolved_at = null, resolved_note = 'merge undone'
   where status = 'merged' and least(company_a, company_b) = least(m.from_id, m.into_id) and greatest(company_a, company_b) = greatest(m.from_id, m.into_id);
  update public.company_merge_log set undone_at = now() where id = m.id;
  return json_build_object('restored', (select name from public.companies where id = m.from_id), 'players_restored', v_n);
end $$;

create or replace function admin.dismiss_review(p_review_id bigint, p_note text default 'not the same company') returns void
language sql set search_path = pg_catalog, public as $$
  update public.company_review set status = 'dismissed', resolved_at = now(), resolved_note = p_note where id = p_review_id and status = 'pending'
$$;

-- Fix how a company's name is shown (the old spelling keeps matching new sign-ups).
create or replace function admin.rename_company(p_id uuid, p_name text) returns void
language plpgsql set search_path = pg_catalog, public, private as $$
declare c public.companies; v_norm text := private.company_norm(p_name);
begin
  select * into c from public.companies where id = p_id for update;
  if c.id is null then raise exception 'Unknown company.'; end if;
  if char_length(btrim(p_name)) not between 2 and 60 then raise exception 'Name must be 2–60 characters.'; end if;
  if c.name_key <> replace(v_norm, ' ', '') then
    insert into public.company_aliases (alias_key, company_id, added_via) values (c.name_key, p_id, 'rename') on conflict (alias_key) do nothing;
  end if;
  update public.companies set name = btrim(p_name), name_norm = v_norm, name_key = replace(v_norm, ' ', ''), updated_at = now() where id = p_id;
end $$;

-- Move one player to another company (e.g. after a mistaken sign-up). Their typed company text is kept.
create or replace function admin.set_player_company(p_email text, p_company_id uuid) returns void
language plpgsql set search_path = pg_catalog, public, private as $$
begin
  if private.active_company(p_company_id) is null then raise exception 'Unknown company.'; end if;
  update public.players set company_id = private.active_company(p_company_id) where email_norm = lower(btrim(p_email));
  if not found then raise exception 'No player with that email.'; end if;
end $$;

-- Re-check every company against every other one and queue new possible duplicates. Returns how many were added.
create or replace function admin.scan_duplicates() returns int
language plpgsql set search_path = pg_catalog, public, private as $$
declare c record; s record; v_before int; v_after int;
begin
  select count(*) into v_before from public.company_review;
  for c in select id, name_norm from public.companies where merged_into is null loop
    for s in select * from private.similar_companies(c.name_norm, c.id, 10) loop
      perform private.queue_review(c.id, s.id, s.score, s.reason);
    end loop;
  end loop;
  select count(*) into v_after from public.company_review;
  return v_after - v_before;
end $$;

create or replace function admin.allow_personal_email(p_allow boolean) returns void
language sql set search_path = pg_catalog, private as $$
  update private.settings set value = case when p_allow then 'true' else 'false' end where key = 'allow_personal_email'
$$;

drop view if exists admin.company_review_queue;
create view admin.company_review_queue as
  select r.id review_id, round(r.score * 100) || '%' likeness, r.reason,
         a.name company_a, (select count(*) from public.players where company_id = a.id) players_a,
         (select string_agg(domain, ', ') from public.company_domains where company_id = a.id) domains_a,
         b.name company_b, (select count(*) from public.players where company_id = b.id) players_b,
         (select string_agg(domain, ', ') from public.company_domains where company_id = b.id) domains_b,
         format('select admin.merge_companies(%L, %L);', b.id, a.id) merge_b_into_a,
         format('select admin.merge_companies(%L, %L);', a.id, b.id) merge_a_into_b,
         format('select admin.dismiss_review(%s);', r.id) dismiss,
         r.created_at
  from public.company_review r
  join public.companies a on a.id = r.company_a and a.merged_into is null
  join public.companies b on b.id = r.company_b and b.merged_into is null
  where r.status = 'pending'
  order by r.score desc, r.created_at;

drop view if exists admin.company_directory;
create view admin.company_directory as
  select c.name, (select count(*) from public.players p where p.company_id = c.id) players,
         (select string_agg(domain, ', ' order by domain) from public.company_domains d where d.company_id = c.id) domains,
         (select string_agg(distinct p.company, ' | ') from public.players p where p.company_id = c.id and p.company <> c.name) also_typed_as,
         (select string_agg(m.name, ', ') from public.companies m where m.merged_into = c.id) merged_from,
         c.created_at, c.id
  from public.companies c where c.merged_into is null
  order by players desc, c.name;

drop view if exists admin.company_merges;
create view admin.company_merges as
  select l.id merge_id, f.name merged, t.name into_company, cardinality(l.moved_players) players_moved, l.moved_domains, l.note,
         l.merged_at, l.undone_at, case when l.undone_at is null then format('select admin.undo_merge(%s);', l.id) end undo
  from public.company_merge_log l join public.companies f on f.id = l.from_id join public.companies t on t.id = l.into_id
  order by l.merged_at desc;

-- When the normalization rules change, refresh stored keys and queue any newly-matching pairs for review.
do $$
declare v_changed int;
begin
  update public.companies set name_norm = private.company_norm(name), name_key = private.company_key(name), updated_at = now()
   where name_norm is distinct from private.company_norm(name);
  get diagnostics v_changed = row_count;
  if v_changed > 0 then perform admin.scan_duplicates(); end if;
end $$;

-- Backfill: give every existing player a company (exact matches only; nothing fuzzy is merged).
-- What each player typed stays in players.company. Safe to re-run: only players without a company are touched.
do $$
declare r record; v_dom text;
begin
  for r in select id, email, company from public.players where company_id is null order by created_at loop
    v_dom := private.email_domain(r.email);
    update public.players set email_domain = v_dom,
      company_id = private.assign_company(company, case when private.is_personal_domain(v_dom) then null else v_dom end, null, false, 'backfill')
    where id = r.id;
  end loop;
end $$;

revoke all on all tables in schema admin from anon, authenticated;
revoke all on all functions in schema admin from public, anon, authenticated;

-- --------------------------------------------------------------- hardening (Supabase security advisor)
alter function private.current_month() set search_path = pg_catalog;
alter function private.client_ip_hash() set search_path = pg_catalog;
alter function private.valley(text) set search_path = public, private, pg_catalog;
alter function private.best_run(text, text) set search_path = public, private, pg_catalog;
alter function private.standings(text, text) set search_path = public, private, pg_catalog;
-- Supabase's own RLS event-trigger function: never needs to be callable over the API
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
