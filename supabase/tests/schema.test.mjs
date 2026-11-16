import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const sqlPath = process.argv[2];
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, m) => { try { await fn(); ok(false, m + ' (no error)'); } catch (e) { ok(true, m + ' -> ' + e.message); } };

// Supabase-like roles
await db.exec(`create role anon nologin; create role authenticated nologin;`);
await db.exec(fs.readFileSync(sqlPath, 'utf8'));
ok(true, 'schema applied');
// re-run idempotency
await db.exec(fs.readFileSync(sqlPath, 'utf8'));
ok(true, 'schema re-applied (idempotent)');

await db.exec(`set request.headers = '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}'`);

// act as anon
await db.exec('set role anon');
await expectErr(() => q('select * from public.players'), 'anon cannot read players');
await expectErr(() => q('select * from admin.player_export'), 'anon cannot read admin views');
await expectErr(() => q(`select register_player('a@b.com','Al','Co',false)`), 'consent required');
await expectErr(() => q(`select register_player('bad','Al','Co',true)`), 'invalid email');
await expectErr(() => q(`select register_player('x@y.com','Al','Co',true,false,null,'spam')`), 'honeypot');

const reg = (await q(`select register_player('Jane@Acme.com','Jane D.','Acme Landscaping',true,true,'nov') r`))[0].r;
ok(reg.player_key && reg.display_name === 'Jane D.', 'register returns key');
const reg2 = (await q(`select register_player('jane@acme.com ','Hacker','Evil',true) r`))[0].r;
ok(reg2.player_key === reg.player_key && reg2.display_name === 'Jane D.', 'same email returns same player, no rename');
const bob = (await q(`select register_player('bob@builders.com','Bob B.','Acme Landscaping',true) r`))[0].r;

// helper: start a run and backdate it (simulate elapsed play time)
async function play(key, secs, score, dist, drops, valves) {
  const t = (await q(`select start_run($1) r`, [key]))[0].r;
  await db.exec('reset role');
  await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]);
  await db.exec('set role anon');
  return (await q(`select submit_run($1,$2,$3,$4,$5,$6,$7) r`, [t.run_id, key, score, Math.round(secs * 1000), dist, drops, valves]))[0].r;
}

let r = await play(reg.player_key, 40, 4200, 2600, 60, 3);
ok(r.accepted === true && r.best_month === 4200 && r.month_rank === 1, `valid run accepted (${JSON.stringify(r)})`);
r = await play(bob.player_key, 30, 3000, 1800, 40, 2);
ok(r.accepted && r.month_rank === 2, 'second player ranked #2');
r = await play(reg.player_key, 10, 99999, 900, 10, 0);
ok(r.accepted === false && /bonus/.test(r.reason), `inflated score rejected (${r.reason})`);
r = await play(reg.player_key, 5, 2000, 2000, 0, 0);
ok(r.accepted === false && /distance/.test(r.reason), `impossible distance rejected (${r.reason})`);

// duration longer than server clock
{
  const t = (await q(`select start_run($1) r`, [bob.player_key]))[0].r;
  const x = (await q(`select submit_run($1,$2,500,60000,400,0,0) r`, [t.run_id, bob.player_key]))[0].r;
  ok(x.accepted === false && /clock/.test(x.reason), `fake duration rejected (${x.reason})`);
  await expectErr(() => q(`select submit_run($1,$2,500,2000,100,0,0)`, [t.run_id, bob.player_key]), 'ticket reuse blocked');
}
// ticket owned by another player
{
  const t = (await q(`select start_run($1) r`, [bob.player_key]))[0].r;
  await expectErr(() => q(`select submit_run($1,$2,500,2000,100,0,0)`, [t.run_id, reg.player_key]), 'ticket of another player blocked');
}
// anonymous ticket claimed after late registration
{
  const t = (await q(`select start_run(null) r`))[0].r;
  await db.exec('reset role');
  await q(`update runs set started_at = now() - interval '20 seconds' where id = $1`, [t.run_id]);
  await db.exec('set role anon');
  const carl = (await q(`select register_player('carl@parks.gov','Carl','City Parks',true) r`))[0].r;
  const x = (await q(`select submit_run($1,$2,1500,18000,1100,20,1) r`, [t.run_id, carl.player_key]))[0].r;
  ok(x.accepted === true, 'anonymous ticket claimed after registering');
}

const lb = await q(`select * from get_leaderboard('month', null, 10)`);
ok(lb.length === 3 && lb[0].display_name === 'Jane D.' && !('email' in lb[0]), 'monthly leaderboard (no email) ' + JSON.stringify(lb.map(x => [x.rank, x.display_name, x.score])));
const all = await q(`select * from get_leaderboard('all', null, 10)`);
ok(all.length === 3, 'all-time leaderboard');
const co = await q(`select * from get_company_board('month', 10)`);
ok(co[0].company === 'Acme Landscaping' && Number(co[0].total) === 7200, 'company board sums top 3: ' + JSON.stringify(co));

// past winners: move Jane's run to last month
await db.exec('reset role');
await q(`update runs set month = to_char((now() at time zone 'America/Chicago') - interval '1 month','YYYY-MM') where score = 4200`);
await db.exec('set role anon');
const w = await q(`select * from get_monthly_winners(12)`);
ok(w.length === 1 && w[0].display_name === 'Jane D.', 'past winners ' + JSON.stringify(w));

// blocked player disappears
await db.exec('reset role');
await q(`update players set is_blocked = true where email_norm = 'bob@builders.com'`);
await db.exec('set role anon');
const lb2 = await q(`select * from get_leaderboard('month', null, 10)`);
ok(!lb2.some(x => x.display_name === 'Bob B.'), 'blocked player hidden from board');
await expectErr(() => q(`select start_run($1)`, [bob.player_key]).then(async () => { const t = (await q(`select start_run($1) r`, [bob.player_key]))[0].r; await q(`select submit_run($1,$2,500,2000,100,0,0)`, [t.run_id, bob.player_key]); }), 'blocked player cannot submit');

// rate limit
{
  const k = reg.player_key;
  await expectErr(async () => { for (let i = 0; i < 8; i++) await q(`select start_run($1)`, [k]); }, 'per-player start rate limit');
}
await db.exec('reset role');
const adm = await q(`select * from admin.monthly_standings`);
ok(adm.length >= 1 && adm[0].email, 'admin view works for dashboard role');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
