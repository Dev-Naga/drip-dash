// Runs supabase/schema.sql against an in-memory Postgres (PGlite) and checks security + scoring rules.
// Usage: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const sqlPath = process.argv[2] || '../schema.sql';
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(true, m + ' -> ' + e.message); } };

await db.exec('create role anon nologin; create role authenticated nologin;');
const sql = fs.readFileSync(sqlPath, 'utf8');
await db.exec(sql); ok(true, 'schema applied');
await db.exec(sql); ok(true, 'schema re-applied (idempotent)');
await db.exec(`set request.headers = '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}'`);

const asAnon = () => db.exec('set role anon');
const asAdmin = () => db.exec('reset role');
await asAnon();
await expectErr(() => q('select * from public.players'), 'anon cannot read players');
await expectErr(() => q('select * from public.runs'), 'anon cannot read runs');
await expectErr(() => q('select * from admin.player_export'), 'anon cannot read admin views');
await expectErr(() => q('select * from private.levels'), 'anon cannot read level limits');
await expectErr(() => q(`select register_player('a@b.com','Al','Co',false)`), 'consent required');
await expectErr(() => q(`select register_player('bad','Al','Co',true)`), 'invalid email rejected');
await expectErr(() => q(`select register_player('x@y.com','Al','Co',true,false,null,'spam')`), 'honeypot blocks bots');

const jane = (await q(`select register_player('Jane@Acme.com','Jane D.','Acme Landscaping',true,true,'nov') r`))[0].r;
ok(jane.player_key && jane.display_name === 'Jane D.', 'register returns key');
const jane2 = (await q(`select register_player('jane@acme.com ','Hacker','Evil',true) r`))[0].r;
ok(jane2.player_key === jane.player_key && jane2.display_name === 'Jane D.', 'same email → same player, no rename');
const bob = (await q(`select register_player('bob@builders.com','Bob B.','Acme Landscaping',true) r`))[0].r;
const carl = (await q(`select register_player('carl@parks.gov','Carl','City Parks',true) r`))[0].r;

async function play(key, level, secs, score, stars = 3) {
  const t = (await q(`select start_run($1, $2) r`, [key, level]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]); await asAnon();
  return (await q(`select submit_level($1,$2,$3,$4,$5,$6) r`, [t.run_id, key, level, score, Math.round(secs * 1000), stars]))[0].r;
}

await expectErr(() => q(`select start_run($1, 'L99')`, [jane.player_key]), 'unknown level rejected');
let r = await play(jane.player_key, 'L1', 30, 5800);
ok(r.accepted && r.month_score === 5800 && r.month_rank === 1, `valid L1 run accepted (${JSON.stringify(r)})`);
r = await play(jane.player_key, 'L2', 62, 5000);
ok(r.accepted && r.month_score === 10800, 'valley score sums levels (5800+5000)');
r = await play(jane.player_key, 'L1', 28, 5200);
ok(r.accepted && r.month_score === 10800, 'worse replay does not lower valley score');
r = await play(jane.player_key, 'L1', 26, 6100);
ok(r.month_score === 11100, 'better replay raises valley score');
r = await play(bob.player_key, 'L1', 40, 4500);
ok(r.accepted && r.month_rank === 2, 'second player ranked #2');
r = await play(carl.player_key, 'L3', 30, 6000);

r = await play(jane.player_key, 'L3', 30, 99999);
ok(!r.accepted && /maximum/.test(r.reason), `score above level max rejected (${r.reason})`);
r = await play(jane.player_key, 'L7', 20, 5000);
ok(!r.accepted && /fast/.test(r.reason), `impossibly fast finale rejected (${r.reason})`);
r = await play(jane.player_key, 'L3', 30, 5000, 0);
ok(!r.accepted && /stars/.test(r.reason), `zero-star submission rejected (${r.reason})`);
{
  const t = (await q(`select start_run($1,'L1') r`, [bob.player_key]))[0].r;
  const x = (await q(`select submit_level($1,$2,'L1',5000,60000,3) r`, [t.run_id, bob.player_key]))[0].r;
  ok(!x.accepted && /clock/.test(x.reason), `fake duration rejected (${x.reason})`);
  await expectErr(() => q(`select submit_level($1,$2,'L1',5000,20000,3)`, [t.run_id, bob.player_key]), 'ticket reuse blocked');
}
{
  const t = (await q(`select start_run($1,'L1') r`, [bob.player_key]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '40 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_level($1,$2,'L5',5000,30000,3) r`, [t.run_id, bob.player_key]))[0].r;
  ok(!x.accepted && /different level/.test(x.reason), `ticket for another level rejected (${x.reason})`);
}
{
  const t = (await q(`select start_run($1,'L1') r`, [bob.player_key]))[0].r;
  await expectErr(() => q(`select submit_level($1,$2,'L1',500,16000,1)`, [t.run_id, jane.player_key]), 'ticket of another player blocked');
}
{
  const t = (await q(`select start_run(null,'L1') r`))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '25 seconds' where id = $1`, [t.run_id]); await asAnon();
  const dee = (await q(`select register_player('dee@x.com','Dee','City Parks',true) r`))[0].r;
  const x = (await q(`select submit_level($1,$2,'L1',4000,20000,2) r`, [t.run_id, dee.player_key]))[0].r;
  ok(x.accepted, 'anonymous ticket claimed after registering');
}

const lb = await q(`select * from get_leaderboard('month', null, 10, 'flow')`);
ok(lb[0].display_name === 'Jane D.' && Number(lb[0].score) === 11100 && Number(lb[0].levels) === 2 && !('email' in lb[0]), 'monthly valley leaderboard ' + JSON.stringify(lb.map((x) => [Number(x.rank), x.display_name, Number(x.score), Number(x.levels)])));
const co = await q(`select * from get_company_board('month', 10, 'flow')`);
ok(co[0].company === 'Acme Landscaping' && Number(co[0].total) === 15600, 'company board sums top 3 valley scores: ' + JSON.stringify(co.map((c) => [c.company, Number(c.total)])));

await asAdmin();
await q(`update runs set month = to_char((now() at time zone 'America/Chicago') - interval '1 month','YYYY-MM') where player_id = (select id from players where email_norm='bob@builders.com')`);
await asAnon();
const w = await q(`select * from get_monthly_winners(12, 'flow')`);
ok(w.length === 1 && w[0].display_name === 'Bob B.', 'past winners ' + JSON.stringify(w.map((x) => [x.month, x.display_name, Number(x.score)])));
const all = await q(`select * from get_leaderboard('all', null, 10, 'flow')`);
ok(all.some((x) => x.display_name === 'Bob B.'), 'all-time board includes earlier months');

await asAdmin(); await q(`update players set is_blocked = true where email_norm = 'carl@parks.gov'`); await asAnon();
ok(!(await q(`select * from get_leaderboard('month', null, 10, 'flow')`)).some((x) => x.display_name === 'Carl'), 'blocked player hidden');
await expectErr(async () => { for (let i = 0; i < 8; i++) await q(`select start_run($1,'L1')`, [jane.player_key]); }, 'per-player start rate limit');

await asAdmin();
const adm = await q(`select * from admin.flow_standings limit 5`);
ok(adm.length >= 1 && adm[0].email && adm[0].per_level, 'admin standings view: ' + JSON.stringify(adm[0].per_level));
const rej = await q(`select count(*)::int n from admin.rejected_runs`);
ok(rej[0].n >= 5, `rejected runs recorded for review (${rej[0].n})`);

// ---------------------------------------------------------------- Drip Dash runner ('dash')
await asAnon();
const erin = (await q(`select register_player('erin@acme.com','Erin','Acme Landscaping',true) r`))[0].r;
async function dash(key, secs, score, dist, drops, valves) {
  const t = (await q(`select start_run($1) r`, [key]))[0].r;            // default level = RUN
  await asAdmin(); await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]); await asAnon();
  return (await q(`select submit_run($1,$2,$3,$4,$5,$6,$7) r`, [t.run_id, key, score, Math.round(secs * 1000), dist, drops, valves]))[0].r;
}
r = await dash(erin.player_key, 40, 4200, 2600, 60, 3);
ok(r.accepted && r.best_month === 4200 && r.month_rank === 1, `runner: valid run accepted (${JSON.stringify(r)})`);
r = await dash(erin.player_key, 30, 3000, 1800, 40, 2);
ok(r.accepted && r.best_month === 4200, 'runner: board keeps best single run (not a sum)');
r = await dash(erin.player_key, 10, 99999, 900, 10, 0);
ok(!r.accepted && /bonus/.test(r.reason), `runner: inflated score rejected (${r.reason})`);
r = await dash(erin.player_key, 5, 2000, 2000, 0, 0);
ok(!r.accepted && /distance/.test(r.reason), `runner: impossible distance rejected (${r.reason})`);
{
  const t = (await q(`select start_run($1,'L1') r`, [erin.player_key]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '30 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_run($1,$2,500,20000,400,0,0) r`, [t.run_id, erin.player_key]))[0].r;
  ok(!x.accepted && /not for Drip Dash/.test(x.reason), `runner: Flow ticket can't be used for a runner score (${x.reason})`);
}
{
  const t = (await q(`select start_run($1) r`, [erin.player_key]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '30 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_level($1,$2,'RUN',500,20000,3) r`, [t.run_id, erin.player_key]))[0].r;
  ok(!x.accepted, 'runner ticket can\'t be submitted as a Flow level');
}
const dlb = await q(`select * from get_leaderboard('month', null, 10)`);
ok(dlb.length === 1 && dlb[0].display_name === 'Erin' && Number(dlb[0].score) === 4200 && dlb[0].levels === null, 'runner board is the default and only has runner players ' + JSON.stringify(dlb.map((x) => [x.display_name, Number(x.score)])));
const flb = await q(`select * from get_leaderboard('month', null, 10, 'flow')`);
ok(!flb.some((x) => x.display_name === 'Erin'), 'Flow board does not include runner scores');
const dco = await q(`select * from get_company_board('month', 10, 'dash')`);
ok(dco.length === 1 && Number(dco[0].total) === 4200, 'runner company board');
const me = (await q(`select get_player_summary($1) r`, [erin.player_key]))[0].r;
const meFlow = (await q(`select get_player_summary($1, 'flow') r`, [erin.player_key]))[0].r;
ok(me.best_month === 4200 && meFlow.month_score === 0, 'player summary is per game');
await asAdmin();
const dadm = await q(`select * from admin.dash_standings limit 5`);
ok(dadm.length === 1 && dadm[0].email === 'erin@acme.com' && dadm[0].best_score === 4200, 'admin runner standings view');
const exp = await q(`select * from admin.player_export where email = 'erin@acme.com'`);
ok(exp[0].dash_best_score === 4200, 'player export includes both games');

// ---------------------------------------------------------------- Splash Escape ('splash')
await asAnon();
const fay = (await q(`select register_player('fay@acme.com','Fay','Acme Landscaping',true) r`))[0].r;
async function splash(key, secs, score, drops, pups, level = 'SPLASH') {
  const t = (await q(`select start_run($1, $2) r`, [key, level]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]); await asAnon();
  return (await q(`select submit_splash($1,$2,$3,$4,$5,$6) r`, [t.run_id, key, score, Math.round(secs * 1000), drops, pups]))[0].r;
}
r = await splash(fay.player_key, 62, 1900, 20, 4);
ok(r.accepted && r.best_month === 1900 && r.month_rank === 1, `splash: valid run accepted (${JSON.stringify(r)})`);
r = await splash(fay.player_key, 40, 900, 8, 2);
ok(r.accepted && r.best_month === 1900, 'splash: board keeps best single run');
r = await splash(fay.player_key, 30, 9000, 10, 1);
ok(!r.accepted && /bonus/.test(r.reason), `splash: inflated score rejected (${r.reason})`);
await asAdmin(); await q(`delete from runs where status = 'started'`); await asAnon();   // stay under the per-player start rate limit
r = await splash(fay.player_key, 20, 500, 80, 0);
ok(!r.accepted && /golden drops/.test(r.reason), `splash: impossible pickups rejected (${r.reason})`);
r = await splash(fay.player_key, 2, 20, 0, 0);
ok(!r.accepted && /short/.test(r.reason), `splash: too-short run rejected (${r.reason})`);
{
  const t = (await q(`select start_run(null,'RUN') r`))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '31 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_splash($1,$2,300,30000,0,0) r`, [t.run_id, fay.player_key]))[0].r;
  ok(!x.accepted && /not for Splash/.test(x.reason), `splash: runner ticket can't post a splash score (${x.reason})`);
}
{
  const t = (await q(`select start_run(null,'SPLASH') r`))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '30 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_run($1,$2,500,20000,400,0,0) r`, [t.run_id, fay.player_key]))[0].r;
  ok(!x.accepted, 'splash ticket can\'t post a runner score');
  await expectErr(() => q(`select submit_splash($1,$2,200,20000,0,0)`, [t.run_id, fay.player_key]), 'splash: ticket reuse blocked');
}
const slb = await q(`select * from get_leaderboard('month', null, 10, 'splash')`);
ok(slb.length === 1 && slb[0].display_name === 'Fay' && Number(slb[0].score) === 1900, 'splash board only has splash players ' + JSON.stringify(slb.map((x) => [x.display_name, Number(x.score)])));
ok(!(await q(`select * from get_leaderboard('month', null, 10)`)).some((x) => x.display_name === 'Fay'), 'runner board excludes splash scores');
ok(!(await q(`select * from get_leaderboard('month', null, 10, 'flow')`)).some((x) => x.display_name === 'Fay'), 'Flow board excludes splash scores');
ok(Number((await q(`select * from get_company_board('month', 10, 'splash')`))[0].total) === 1900, 'splash company board');
await asAdmin();
const sadm = await q(`select * from admin.splash_standings limit 5`);
ok(sadm.length === 1 && sadm[0].email === 'fay@acme.com' && sadm[0].best_score === 1900, 'admin splash standings view');
const sexp = await q(`select * from admin.player_export where email = 'fay@acme.com'`);
ok(sexp[0].splash_best_score === 1900 && sexp[0].flow_valley_score === null, 'player export: splash best, not counted as Flow');

// ---------------------------------------------------------------- Water Run ('wrun')
await asAdmin(); await q(`delete from runs where status = 'started'`); await asAnon();
const gus = (await q(`select register_player('gus@builders.com','Gus','Builders Inc',true) r`))[0].r;
async function wrun(key, secs, score, dist, drops, valves, pups, level = 'WRUN') {
  const t = (await q(`select start_run($1, $2) r`, [key, level]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]); await asAnon();
  return (await q(`select submit_water_run($1,$2,$3,$4,$5,$6,$7,$8) r`, [t.run_id, key, score, Math.round(secs * 1000), dist, drops, valves, pups]))[0].r;
}
r = await wrun(gus.player_key, 74, 3954, 1634, 147, 3, 4);
ok(r.accepted && r.best_month === 3954 && r.month_rank === 1, `wrun: valid run accepted (${JSON.stringify(r)})`);
r = await wrun(gus.player_key, 40, 1700, 708, 48, 2, 1);
ok(r.accepted && r.best_month === 3954, 'wrun: board keeps best single run');
r = await wrun(gus.player_key, 30, 20000, 900, 30, 1, 1);
ok(!r.accepted && /bonus/.test(r.reason), `wrun: inflated score rejected (${r.reason})`);
await asAdmin(); await q(`delete from runs where status = 'started'`); await asAnon();
r = await wrun(gus.player_key, 10, 3000, 3000, 0, 0, 0);
ok(!r.accepted && /distance/.test(r.reason), `wrun: impossible distance rejected (${r.reason})`);
r = await wrun(gus.player_key, 20, 2000, 500, 200, 0, 0);
ok(!r.accepted && /drops/.test(r.reason), `wrun: impossible drops rejected (${r.reason})`);
r = await wrun(gus.player_key, 30, 600, 500, 5, 0, 0, 'RUN');
ok(!r.accepted && /not for Water Run/.test(r.reason), `wrun: runner ticket can't post a Water Run score (${r.reason})`);
await asAdmin(); await q(`delete from runs where status = 'started'`); await asAnon();
{
  const t = (await q(`select start_run($1,'WRUN') r`, [gus.player_key]))[0].r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '30 seconds' where id = $1`, [t.run_id]); await asAnon();
  const x = (await q(`select submit_run($1,$2,500,20000,400,0,0) r`, [t.run_id, gus.player_key]))[0].r;
  ok(!x.accepted, 'Water Run ticket can\'t post a Drip Dash score');
}
const wlb = await q(`select * from get_leaderboard('month', null, 10, 'wrun')`);
ok(wlb.length === 1 && wlb[0].display_name === 'Gus' && Number(wlb[0].score) === 3954, 'wrun board only has Water Run players ' + JSON.stringify(wlb.map((x) => [x.display_name, Number(x.score)])));
ok(!(await q(`select * from get_leaderboard('month', null, 10)`)).some((x) => x.display_name === 'Gus'), 'Drip Dash board excludes Water Run scores');
ok(!(await q(`select * from get_leaderboard('month', null, 10, 'splash')`)).some((x) => x.display_name === 'Gus'), 'Splash board excludes Water Run scores');
ok(!(await q(`select * from get_leaderboard('month', null, 10, 'flow')`)).some((x) => x.display_name === 'Gus'), 'Flow board excludes Water Run scores');
await asAdmin();
const wadm = await q(`select * from admin.water_run_standings limit 5`);
ok(wadm.length === 1 && wadm[0].email === 'gus@builders.com' && wadm[0].best_score === 3954, 'admin Water Run standings view');
const wexp = await q(`select * from admin.player_export where email = 'gus@builders.com'`);
ok(wexp[0].water_run_best_score === 3954 && wexp[0].flow_valley_score === null && wexp[0].dash_best_score === null, 'player export: Water Run best, not counted elsewhere');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
