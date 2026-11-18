# Drip Dash: admin guide

How to connect the shared leaderboard, run the monthly competition, and manage players and scores.

---

## 1. One-time setup: connect the shared leaderboard (about 10 minutes)

Until this is done the game runs in **DEMO MODE**: it's fully playable, but scores are saved only in each player's own browser, and a yellow "DEMO MODE" badge is shown.

1. Go to **supabase.com**, sign up with a company account (for example a shared marketing mailbox), and create a project:
   - Name: `drip-dash`
   - Region: **US East** (or the region closest to Texas that's offered)
   - Plan: **Free**
   - Store the database password in the company password manager. The game doesn't need it.
2. In the project, open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](../supabase/schema.sql), and click **Run**. You should see "Success. No rows returned." It's safe to run again after updates.
3. Open **Project Settings → API Keys** (or **Settings → API**) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **publishable** key (`sb_publishable_…`) or, on older projects, the **anon public** key (`eyJ…`)

   These two values are designed to be public. **Never** use the `service_role` / secret key in the game.
4. Paste both into [`site/js/config.js`](../site/js/config.js):
   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_KEY: 'sb_publishable_xxxxxxxx',
   ```
5. Redeploy the site (see section 6). The DEMO badge disappears and scores go to the shared leaderboard.
6. Play one game on a phone and one on a desktop, then check that both scores appear on `leaderboard.html`.

### Optional hardening (recommended once live)
- **Authentication → Sign In / Providers:** turn off "Allow new users to sign up". The game doesn't use Supabase Auth, so this closes an unused door.
- **Database → Backups:** the free plan has no point-in-time restore. Export the players CSV monthly (section 4).

---

## 2. Monthly competition routine (about 15 minutes, first business day of the month)

Months follow **US Central time**. The leaderboard rolls over automatically at midnight on the 1st, and nothing needs resetting.

1. In Supabase, open **SQL Editor** and run (change the month):
   ```sql
   -- Drip Dash (main game): best run per player
   select * from admin.dash_standings where month = '2026-11' limit 20;
   -- Bring Back the Flow: Valley Score (best score per level, added up) with a per-level breakdown
   select * from admin.flow_standings where month = '2026-11' limit 20;
   -- Drip Run (3D): best run per player (and their longest distance)
   select * from admin.water_run_standings where month = '2026-11' limit 20;
   -- Splash Escape: best run per player (and their longest survival time)
   select * from admin.splash_standings where month = '2026-11' limit 20;
   ```
   All four show name, company and **email** for the top players.
2. Review the top 5. Things to look out for:
   - a huge score from someone with only 1–2 games
   - several accounts from the same company with near-identical scores
   - anything listed in `select * from admin.rejected_runs limit 50;` for that player
3. Email the winners from the address in the standings to confirm. This also verifies that they own the email address.
4. To disqualify a run or block a player:
   ```sql
   -- disqualify one player's runs for a month
   update public.runs set status = 'disqualified', reject_reason = 'manual review'
   where month = '2026-11' and player_id = (select id from public.players where email_norm = 'someone@example.com');

   -- block a player completely (hidden from all boards, can't submit)
   update public.players set is_blocked = true where email_norm = 'someone@example.com';
   ```
5. Each game's **Past Winners** tab fills itself from the top 3 verified scores of each closed month.
6. Announce the winners in the newsletter (template in section 5).

### Fix an offensive display name
```sql
update public.players set display_name = 'Player 123' where email_norm = 'someone@example.com';
```

---

## 3. Viewing scores

| What | Where |
|---|---|
| Public leaderboard (month, all-time, companies, past winners) | `https://<your-site>/leaderboard.html` |
| In-game leaderboard | **Leaderboard** button in the game, or `https://<your-site>/?view=leaderboard` |
| Everything incl. emails (admins only) | Supabase → SQL Editor → `select * from admin.dash_standings;` (runner), `admin.water_run_standings` (Drip Run), `admin.flow_standings` (Flow) or `admin.splash_standings` (Splash Escape) |
| Raw tables | Supabase → Table Editor → `players`, `runs` |
| Suspicious runs auto-rejected | `select * from admin.rejected_runs;` |

Only people you invite to the Supabase project can see emails. The public website and API can't read the tables directly. The SQL test suite checks this.

---

## 4. HubSpot integration (simplest practical approach)

**Recommendation: no live integration yet.** Use HubSpot for sending, and personalized links to pre-fill the form.

### a) Newsletter link (pre-fills the player's details)
Clicking a link in an email (Outlook or any other mail app) doesn't tell a website who you are. The only way to pass details is to put them in the link with your email tool's personalization tokens. **Prefer the `#` form**: everything after `#` stays in the reader's browser and is never sent to any web server or log.
```
https://drip-dash-nine.vercel.app/?utm_source=newsletter&utm_campaign=2026-11#email={{ contact.email }}&name={{ contact.firstname }}&company={{ contact.company }}
```
(`?email=…` also works, but then the address can end up in server logs.)

What the game does with it:
- Fills in the sign-up form, then **removes** the email, name and company from the address bar so they don't stay in history or get forwarded.
- Ignores tokens your mail tool left unfilled (`{{…}}`, `*|…|*`, `%%…%%`, `[…]`).
- Recognises the company from the email domain (see section 4c). The player still checks the details and accepts the rules, so nobody is registered without clicking.

If you send from plain Outlook with no mail-merge, use a plain link with only the `utm_…` part. Players then type their work email once, and the company is filled in from its domain.

### b) Sync players back to HubSpot (monthly, about 5 minutes)
1. Supabase → SQL Editor: `select * from admin.player_export;` → **Download CSV**.
2. HubSpot → Contacts → **Import** → match on Email. Map `dash_best_score`, `water_run_best_score`, `splash_best_score`, `flow_valley_score`, `flow_levels_completed` and `games_played` to custom contact properties (create matching "Drip Dash …" properties once). Use `marketing_opt_in` to decide on newsletter subscription.
3. You can then build HubSpot lists like "played Drip Dash this month" for follow-ups.

### c) Company names: business email, auto-detection, duplicate review
**Rules players see at sign-up (all four games):**
- **Business email only.** New sign-ups with personal addresses (gmail.com, yahoo.com, outlook.com, hotmail.com, icloud.com, ISP addresses like comcast.net, throwaway addresses, …, including country versions like yahoo.co.uk) are refused with a friendly message. Players who registered before this rule keep working. To allow personal addresses (for example for a public contest): `select admin.allow_personal_email(true);`
- **Company from the email domain.** `jane@mail.acme.com`, `bob@acme.com` → the same company. The first person from a domain creates the company; colleagues get it filled in automatically.
- **Uncertain → the player decides.** If the name looks like an existing company (similar spelling, an abbreviation like "IWS", a shorter form like "inCon-trol", a shared distinctive first word, or a guess made from an unknown domain), the form asks: *"Is your company one of these?"* with the options and *"No, … is a different company"*.

**Automatic (only when certain):** names that are the same after tidying (case, punctuation, "&"/"and", "Inc/LLC/Co/Ltd", "The …", common abbreviations like Intl/Svcs/Mfg, or a website typed as the name) are the same company. Everything else stays separate until a person decides. What each player typed is always kept (`admin.player_export.typed_company`).

**Review queue (a few minutes a month, before announcing winners):**
```sql
select * from admin.company_review_queue;     -- possible duplicates, most likely first
```
Each row shows both companies, their player counts and email domains, the reason ("similar spelling", "abbreviation", "same email domain (…)"), and three ready-to-run statements:
- `merge_b_into_a` / `merge_a_into_b`: copy one, run it. Players, domains and the old spelling move to the company you keep. It returns an `undo` statement.
- `dismiss`: "not the same company"; the pair won't come back.

Other tools:
```sql
select * from admin.company_directory;                 -- every company: players, domains, other spellings, merged-in names
select * from admin.company_merges;                    -- merge history with undo statements
select admin.undo_merge(<merge_id>);                   -- puts back exactly the players that were moved
select admin.rename_company('<company id>', 'inCon-trol Water Systems');   -- fix how a name is shown; the old spelling still matches
select admin.set_player_company('person@company.com', '<company id>');   -- move one player
select admin.scan_duplicates();                        -- re-check all companies for look-alikes
```

### Later (optional)
A live sync (a Supabase Edge Function or a Zapier/Make zap calling HubSpot's contacts API whenever someone registers) needs a HubSpot **private app token**. Only add it if the monthly CSV becomes a chore.

---

## 5. Newsletter content kit

- Hero image: [`marketing/newsletter-hero-600x315.jpg`](../marketing/newsletter-hero-600x315.jpg) (email width) and [`marketing/newsletter-hero-1200x630.png`](../marketing/newsletter-hero-1200x630.png) (retina / social).
- Copy-paste HTML block: [`docs/newsletter-snippet.html`](newsletter-snippet.html).
- Monthly section idea: *"🏆 November champion: Jane D. (Acme Landscaping), 4,200 points. Can you beat it? This month's leaderboard resets on the 1st."*
- Email programs can't run games, so always **link** to the game rather than embedding it.

---

## 6. Hosting and deploys

The game is a static website (the `site/` folder, no build step). Whichever host you use, deploying means publishing the `site/` folder. See the README for the host that was set up.

To change art, text or difficulty, edit the files in `site/` and redeploy:
- Levels: each level is one file in `site/js/levels/` (timers, star thresholds, demand curves, dialogue, Field Note photo and caption).
- Text and copy: `site/index.html`.
- Brand colors: `:root` at the top of `site/css/style.css` and `C` in `site/js/engine.js`.

If you change a level's scoring or timing, update its `maxScore` / `minSeconds` **and** the matching row in `private.levels` (top of `supabase/schema.sql`). Otherwise good scores could be rejected.

### Adding a new level (monthly or seasonal challenge)
1. Copy an existing level file in `site/js/levels/` (for example `l4-storm.js`), give it a new `id` (for example `S1`) and change the mechanics, text and photo.
2. Add it to the list in `site/js/levels/index.js` and add a map position in `NODES` in `site/js/map.js`.
3. Register its limits with the server (Supabase → SQL Editor):
   ```sql
   insert into private.levels (id, title, max_score, min_ms) values ('S1', 'Freeze Watch', 7000, 30000);
   ```
4. Push to `main`. Vercel redeploys in about a minute. The new level's best score automatically adds to every player's Valley Score.

---

## 7. Costs and limits (free tiers, as of Nov 2026, so confirm current terms on each provider's pricing page)

| Service | Plan | Cost | Relevant limits |
|---|---|---|---|
| Static hosting (GitHub Pages / Netlify / Cloudflare Pages) | Free | $0 | Far above expected newsletter traffic |
| Supabase | Free | $0 | 500 MB database (millions of score rows), ample API calls. **A free project pauses after about 1 week with no activity.** The included GitHub Action pings it daily to prevent this. If it ever pauses, click "Restore" in the dashboard. |
| Domain (optional, e.g. `play.incontrolwatersystems.com`) | Existing domain | $0 | Add a CNAME record at your DNS provider |

Upgrade path, only if needed: Supabase Pro is about $25/month (no pausing, daily backups).

**Maintenance:** about 15 minutes a month for winner review, plus the newsletter section. Seasonal reskins are optional.
