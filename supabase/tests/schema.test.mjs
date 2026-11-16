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

const lb = await q(`select * from get_leaderboard('month', null, 10)`);
ok(lb[0].display_name === 'Jane D.' && Number(lb[0].score) === 11100 && Number(lb[0].levels) === 2 && !('email' in lb[0]), 'monthly valley leaderboard ' + JSON.stringify(lb.map((x) => [Number(x.rank), x.display_name, Number(x.score), Number(x.levels)])));
const co = await q(`select * from get_company_board('month', 10)`);
ok(co[0].company === 'Acme Landscaping' && Number(co[0].total) === 15600, 'company board sums top 3 valley scores: ' + JSON.stringify(co.map((c) => [c.company, Number(c.total)])));

await asAdmin();
await q(`update runs set month = to_char((now() at time zone 'America/Chicago') - interval '1 month','YYYY-MM') where player_id = (select id from players where email_norm='bob@builders.com')`);
await asAnon();
const w = await q(`select * from get_monthly_winners(12)`);
ok(w.length === 1 && w[0].display_name === 'Bob B.', 'past winners ' + JSON.stringify(w.map((x) => [x.month, x.display_name, Number(x.score)])));
const all = await q(`select * from get_leaderboard('all', null, 10)`);
ok(all.some((x) => x.display_name === 'Bob B.'), 'all-time board includes earlier months');

await asAdmin(); await q(`update players set is_blocked = true where email_norm = 'carl@parks.gov'`); await asAnon();
ok(!(await q(`select * from get_leaderboard('month', null, 10)`)).some((x) => x.display_name === 'Carl'), 'blocked player hidden');
await expectErr(async () => { for (let i = 0; i < 8; i++) await q(`select start_run($1,'L1')`, [jane.player_key]); }, 'per-player start rate limit');

await asAdmin();
const adm = await q(`select * from admin.monthly_standings limit 5`);
ok(adm.length >= 1 && adm[0].email && adm[0].per_level, 'admin standings view: ' + JSON.stringify(adm[0].per_level));
const rej = await q(`select count(*)::int n from admin.rejected_runs`);
ok(rej[0].n >= 5, `rejected runs recorded for review (${rej[0].n})`);
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
