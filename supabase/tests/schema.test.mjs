// Runs supabase/schema.sql against an in-memory Postgres (PGlite) and checks security, Drip Run scoring,
// worlds, display-name rules and that the retired games can't be reached.
// Usage: cd supabase/tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import * as N from '../../site/js/names.js';

const sqlPath = process.argv[2] || '../schema.sql';
const db = new PGlite();
let ipN = 0;
const q = async (s, p) => {
  if (/register_player/.test(s)) await db.exec(`set request.headers = '{"x-forwarded-for":"10.1.${(ipN >> 8) & 255}.${ipN++ & 255}"}'`);
  return (await db.query(s, p)).rows;
};
const one = async (s, p) => (await q(s, p))[0];
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, re, m) => {
  try { await fn(); ok(false, `${m} (no error)`); } catch (e) { ok(re.test(e.message), `${m} -> ${e.message}`); }
};

await db.exec('create role anon nologin; create role authenticated nologin;');
const sql = fs.readFileSync(sqlPath, 'utf8');
await db.exec(sql); ok(true, 'schema applied');
await db.exec(sql); ok(true, 'schema re-applied (idempotent)');
await db.exec(`set request.headers = '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}'`);

const asAnon = () => db.exec('set role anon');
const asAdmin = () => db.exec('reset role');
const reg = async (email, name, co = 'Acme Landscaping') => (await one(`select register_player($1,$2,$3,true) r`, [email, name, co])).r;

// ================================================================ 1. nothing private is reachable
await asAnon();
await expectErr(() => q('select * from public.players'), /permission/, 'anon cannot read players');
await expectErr(() => q('select * from public.runs'), /permission/, 'anon cannot read runs');
await expectErr(() => q('select * from admin.player_export'), /permission/, 'anon cannot read admin views');
await expectErr(() => q('select * from private.levels'), /permission/, 'anon cannot read level limits');
await expectErr(() => q('select * from private.worlds'), /permission/, 'anon cannot read the world schedule table');
await expectErr(() => q(`select admin.set_world('aggie','live')`), /permission/, 'anon cannot change worlds');
await expectErr(() => q(`select admin.rename_player('x@y.com','Hacker')`), /permission/, 'anon cannot rename players');
await expectErr(() => q(`select private.name_problem('abc')`), /permission/, 'anon cannot call internal functions');

// ================================================================ 2. the retired games can't be reached
for (const f of ['submit_run(uuid,uuid,int,int,int,int,int)', 'submit_level(uuid,uuid,text,int,int,int)', 'submit_splash(uuid,uuid,int,int,int,int)']) {
  await asAdmin();
  const gone = (await one(`select to_regprocedure($1) is null g`, [`public.${f}`])).g;
  ok(gone, `retired score function removed: ${f.split('(')[0]}`);
}
await asAnon();
for (const lv of ['RUN', 'SPLASH', 'L1', 'L7']) await expectErr(() => q(`select start_run(null, $1)`, [lv]), /Only Drip Run/, `start_run refuses retired level ${lv}`);
for (const g of ['dash', 'flow', 'splash']) {
  await expectErr(() => q(`select * from get_leaderboard('month', null, 10, $1)`, [g]), /Only Drip Run/, `leaderboard refuses game '${g}'`);
  await expectErr(() => q(`select * from get_company_board('month', 10, $1)`, [g]), /Only Drip Run/, `company board refuses game '${g}'`);
}
const t0 = (await one(`select start_run(null) r`)).r;
ok(!!t0.run_id, 'start_run defaults to Drip Run');

// ================================================================ 3. sign-up basics
await expectErr(() => q(`select register_player('a@b.com','Alan','Co',false)`), /rules/, 'consent required');
await expectErr(() => q(`select register_player('bad','Alan','Co',true)`), /valid email/, 'invalid email rejected');
await expectErr(() => q(`select register_player('x@y.com','Alan','Co',true,false,null,'spam')`), /failed/, 'honeypot blocks bots');
const jane = await reg('Jane@Acme.com', 'Jane D.');
ok(jane.player_key && jane.display_name === 'Jane D.' && jane.returning === false, 'register returns key, new player');
const jane2 = await reg('jane@acme.com ', 'Someone Else', 'Evil');
ok(jane2.player_key === jane.player_key && jane2.display_name === 'Jane D.' && jane2.returning === true, 'same email → same player, name kept, "Welcome back"');

// ================================================================ 4. display-name rules
const BAD = [
  ['Al', /3–24/], ['  B  ', /3–24/], ['x'.repeat(25), /3–24/], ['Bob<script>', /only use|remove </], ['Bob@Home', /only use/],
  ['12345', /letter/], ['A..B', /punctuation/], ['Jo--hn', /punctuation/], ['Fuck You', /different/], ['ShitStorm', /different/],
  ['Big Ass', /different/], ['B1g 4ss', /different/], ['Admin', /different/], ['The Moderator', /different/], ['inCon-trol', /different/],
  ['Nazi Fan', /different/],
];
for (const [name, re] of BAD) {
  await expectErr(() => reg(`bad${ipN}@acme.com`, name), re, `name refused: "${name}"`);
}
const GOOD = ['Cassie', 'Dickson Lee', "O'Brien", 'José M.', 'Mary-Kate', 'Ann_B 99', 'Scunthorpe Sam', 'Nazir', 'Swanky', 'Therapist Tim', 'Jane D. Smith'];
for (const [i, name] of GOOD.entries()) {
  const p = await reg(`good${i}@acme.com`, name);
  ok(p.display_name === name, `name accepted: "${name}"`);
}
await expectErr(() => reg('copy@acme.com', 'jane d'), /taken/, 'duplicate name refused (case)');
await expectErr(() => reg('copy2@acme.com', 'JANE-D'), /taken/, 'duplicate name refused (punctuation/spacing)');
await expectErr(() => reg('copy3@acme.com', 'Jose M'), /taken/, 'duplicate name refused (accents)');
let c = (await one(`select check_display_name('Jane D.') r`)).r;
ok(!c.ok && c.taken, 'check_display_name: taken');
c = (await one(`select check_display_name('Al') r`)).r;
ok(!c.ok && /3–24/.test(c.message), 'check_display_name: too short');
c = (await one(`select check_display_name('Brand New Name') r`)).r;
ok(c.ok, 'check_display_name: available');
// a name saved before the rules (2 characters) is replaced at the next sign-in
await asAdmin(); await q(`insert into players (email, display_name, company) values ('kp@acme.com', 'KP', 'Acme Landscaping')`); await asAnon();
await expectErr(() => reg('kp@acme.com', 'KP'), /new display name/, 'legacy short name must be replaced at sign-in');
await expectErr(() => reg('kp@acme.com', 'Jane D.'), /taken/, 'replacement name must be free');
const kp = await reg('kp@acme.com', 'Kim Park');
ok(kp.display_name === 'Kim Park' && kp.returning, 'legacy short name replaced with a valid one');
// a remembered (signed-in) player with a legacy name fixes it in-game with their player key
await asAdmin(); await q(`insert into players (email, display_name, company) values ('jb@acme.com', 'JB', 'Acme Landscaping')`);
const jbKey = (await one(`select player_key from players where email_norm = 'jb@acme.com'`)).player_key; await asAnon();
await expectErr(() => q(`select fix_display_name($1, 'JB')`, [jbKey]), /3–24/, 'fix_display_name: new name must follow the rules');
await expectErr(() => q(`select fix_display_name($1, 'Kim Park')`, [jbKey]), /taken/, 'fix_display_name: new name must be free');
ok((await one(`select fix_display_name($1, 'Jordan B') r`, [jbKey])).r.display_name === 'Jordan B', 'fix_display_name: legacy name replaced');
await expectErr(() => q(`select fix_display_name($1, 'Someone Else')`, [jbKey]), /already meets/, 'fix_display_name: valid names cannot be changed this way');
await expectErr(() => q(`select fix_display_name(gen_random_uuid(), 'Ghost Rider')`), /Unknown player/, 'fix_display_name: needs a real player key');
await asAdmin();
ok((await q(`select * from admin.names_to_fix`)).length === 0, 'admin.names_to_fix is empty after the fix');
await expectErr(() => q(`update players set display_name = 'Kim-Park' where email_norm = 'jane@acme.com'`), /duplicate|unique/, 'unique index backs the rule');
ok((await one(`select admin.rename_player('jane@acme.com', 'Jane Doe') r`)).r === 'renamed', 'admin can rename (rules apply)');
await expectErr(() => q(`select admin.rename_player('jane@acme.com', 'Kim Park')`), /taken/, 'admin rename refuses a taken name');
await asAnon();
// browser mirror gives the same answer on format rules
for (const name of ['Al', 'Jane D.', "O'Brien", '12345', 'A..B', 'Bob<x>', 'José M.', 'x'.repeat(25), 'Ann_B 99']) {
  const s = (await one(`select check_display_name($1) r`, [name])).r;
  const js = N.nameProblem(name);
  ok((s.ok || !!s.taken) === !js, `browser and server agree on "${name}" (${js || 'ok'})`);
}

// ================================================================ 5. worlds
let w = (await one(`select get_worlds() r`)).r;
const live = w.filter((x) => x.state === 'live').map((x) => x.id);
ok(JSON.stringify(live) === JSON.stringify(['melissa', 'epic', 'mckinney', 'olympus']), `4 launch worlds live: ${live}`);
ok(w.some((x) => x.state === 'coming' && x.release_at), 'upcoming worlds are listed with a release date');
await asAdmin();
await q(`update private.worlds set release_at = now() - interval '1 minute' where id = 'aggie'`);    // the 1st of the month arrives
await asAnon();
w = (await one(`select get_worlds() r`)).r;
ok(w.find((x) => x.id === 'aggie').state === 'live', 'scheduled world goes live on its release date with no deploy');
await asAdmin();
ok(/locked/.test((await one(`select admin.set_world('epic', 'locked') r`)).r), 'admin can lock a world');
await asAnon();
w = (await one(`select get_worlds() r`)).r;
ok(!w.some((x) => x.id === 'epic'), 'locked world is out of the rotation');
await asAdmin();
await q(`select admin.set_world('epic', 'live')`);
await q(`select admin.set_world('chase', 'scheduled', now() + interval '40 days')`);
ok((await one(`select state_now from admin.worlds where id = 'chase'`)).state_now === 'coming', 'admin can reschedule a world');
await expectErr(async () => { for (const id of ['melissa', 'epic', 'mckinney', 'olympus', 'aggie']) await q(`select admin.set_world($1, 'locked')`, [id]); }, /At least one world/, 'the last live world cannot be locked');
await q(`update private.worlds set status = 'live' where id in ('melissa','epic','mckinney','olympus')`);
await q(`update private.worlds set status = 'scheduled', release_at = now() + interval '8 days' where id = 'aggie'`);
ok(/added/.test((await one(`select admin.add_world('newpark', 'New Park', 9, 'scheduled', now() + interval '120 days') r`)).r), 'admin can add a future world');
await expectErr(() => q(`select admin.set_world('aggie', 'scheduled')`), /release time/, 'scheduled needs a release time');
await asAnon();

// ================================================================ 6. Drip Run scoring (endless) and tickets
async function wrun(key, secs, score, dist, drops = 0, valves = 0, pups = 0, dels = 0, stops = 0) {
  const t = (await one(`select start_run($1, 'WRUN') r`, [key])).r;
  await asAdmin(); await q(`update runs set started_at = now() - make_interval(secs => $1) where id = $2`, [secs + 1, t.run_id]); await asAnon();
  return (await one(`select submit_water_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r`, [t.run_id, key, score, Math.round(secs * 1000), dist, drops, valves, pups, dels, stops])).r;
}
const clear = async () => { await asAdmin(); await q(`delete from runs where status = 'started'`); await asAnon(); };
const gus = await reg('gus@builders.com', 'Gus', 'Builders Inc');
let r = await wrun(gus.player_key, 74, 3954, 1634, 147, 3, 4);
ok(r.accepted && r.best_month === 3954 && r.month_rank === 1, `valid run accepted (${JSON.stringify(r)})`);
r = await wrun(gus.player_key, 40, 1700, 708, 48, 2, 1);
ok(r.accepted && r.best_month === 3954, 'board keeps best single run');
// endless: a long run past every world (20 minutes, 30 km) is fine if it is physically possible
r = await wrun(gus.player_key, 1200, 40000 + 2000 + 40 * 150 + 13 * 300, 40000, 100, 0, 0, 40, 13);
ok(r.accepted && r.best_month > 50000, `endless 20-minute run accepted (${r.reason || r.best_month})`);
r = await wrun(gus.player_key, 30, 20000, 900, 30, 1, 1);
ok(!r.accepted && /bonus/.test(r.reason), `inflated score rejected (${r.reason})`);
await clear();
r = await wrun(gus.player_key, 10, 3000, 3000);
ok(!r.accepted && /distance/.test(r.reason), `impossible distance rejected (${r.reason})`);
r = await wrun(gus.player_key, 20, 2000, 500, 200);
ok(!r.accepted && /drops/.test(r.reason), `impossible drops rejected (${r.reason})`);
r = await wrun(gus.player_key, 0.5, 20, 10);
ok(!r.accepted && /short/.test(r.reason), `too-short run rejected (${r.reason})`);
await clear();
r = await wrun(gus.player_key, 30, 600 + 40 * 150, 600, 0, 0, 0, 40, 0);
ok(!r.accepted && /deliveries/.test(r.reason), `impossible deliveries rejected (${r.reason})`);
r = await wrun(gus.player_key, 30, 600 + 2 * 150 + 2 * 300, 600, 0, 0, 0, 2, 2);
ok(!r.accepted && /stops/.test(r.reason), `stops without 3 deliveries each rejected (${r.reason})`);
await clear();
{
  const t = (await one(`select start_run($1,'WRUN') r`, [gus.player_key])).r;
  const x = (await one(`select submit_water_run($1,$2,5000,60000,2000,10,0,0) r`, [t.run_id, gus.player_key])).r;
  ok(!x.accepted && /clock/.test(x.reason), `duration longer than the server clock rejected (${x.reason})`);
  await expectErr(() => q(`select submit_water_run($1,$2,100,2000,50,0,0,0)`, [t.run_id, gus.player_key]), /already submitted/, 'a ticket can be submitted only once');
}
{
  const t = (await one(`select start_run($1,'WRUN') r`, [gus.player_key])).r;
  await expectErr(() => q(`select submit_water_run($1,$2,100,2000,50,0,0,0)`, [t.run_id, jane.player_key]), /another player/, 'ticket of another player blocked');
  await expectErr(() => q(`select submit_water_run(gen_random_uuid(),$1,100,2000,50,0,0,0)`, [gus.player_key]), /Unknown game ticket/, 'made-up ticket refused');
  await expectErr(() => q(`select submit_water_run($1,gen_random_uuid(),100,2000,50,0,0,0)`, [t.run_id]), /Unknown player/, 'made-up player refused');
}
await clear();
{
  const t = (await one(`select start_run(null,'WRUN') r`)).r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '31 seconds' where id = $1`, [t.run_id]); await asAnon();
  const dee = await reg('dee@x.com', 'Dee Dee', 'City Parks');
  const x = (await one(`select submit_water_run($1,$2,800,30000,700,5,0,0) r`, [t.run_id, dee.player_key])).r;
  ok(x.accepted, 'anonymous ticket claimed after registering (score kept for the right player)');
}
await clear();
await expectErr(async () => { for (let i = 0; i < 8; i++) await q(`select start_run($1,'WRUN')`, [gus.player_key]); }, /Slow down/, 'per-player start rate limit');
await clear();

// ================================================================ 7. leaderboards
const wlb = await q(`select * from get_leaderboard('month', null, 10)`);
ok(wlb[0].display_name === 'Gus' && Number(wlb[0].score) > 50000 && !('email' in wlb[0]), 'leaderboard: best run first, no emails ' + JSON.stringify(wlb.map((x) => [x.display_name, Number(x.score)])));
ok(wlb.every((x, i) => Number(x.rank) === i + 1) && wlb.every((x, i) => i === 0 || Number(wlb[i - 1].score) >= Number(x.score)), 'ranks are consecutive and sorted');
ok(new Set(wlb.map((x) => x.display_name)).size === wlb.length, 'one row per player');
const cb = await q(`select * from get_company_board('month', 10)`);
ok(cb.length >= 2 && cb[0].company === 'Builders Inc', 'company board ' + JSON.stringify(cb.map((x) => [x.company, Number(x.total)])));
await asAdmin(); await q(`update players set is_blocked = true where email_norm = 'gus@builders.com'`); await asAnon();
ok(!(await q(`select * from get_leaderboard('month', null, 10)`)).some((x) => x.display_name === 'Gus'), 'blocked player hidden');
{
  const t = (await one(`select start_run($1,'WRUN') r`, [gus.player_key])).r;
  await asAdmin(); await q(`update runs set started_at = now() - interval '20 seconds' where id = $1`, [t.run_id]); await asAnon();
  await expectErr(() => q(`select submit_water_run($1,$2,100,10000,90,0,0,0)`, [t.run_id, gus.player_key]), /not eligible/, 'blocked player cannot submit');
}
await asAdmin(); await q(`update players set is_blocked = false where email_norm = 'gus@builders.com'`);
await q(`update runs set month = to_char((now() at time zone 'America/Chicago') - interval '1 month','YYYY-MM') where player_id = (select id from players where email_norm='dee@x.com')`);
await asAnon();
const wn = await q(`select * from get_monthly_winners(12)`);
ok(wn.length === 1 && wn[0].display_name === 'Dee Dee', 'past winners ' + JSON.stringify(wn.map((x) => [x.month, x.display_name])));
ok((await q(`select * from get_leaderboard('all', null, 10)`)).some((x) => x.display_name === 'Dee Dee'), 'all-time board includes earlier months');
const me = (await one(`select get_player_summary($1) r`, [gus.player_key])).r;
ok(me.best_month > 50000 && me.month_rank === 1, 'player summary');
await expectErr(() => q(`select get_player_summary($1, 'flow')`, [gus.player_key]), /Only Drip Run/, 'player summary refuses retired games');

// ================================================================ 8. admin views still work
await asAdmin();
const wadm = await q(`select * from admin.water_run_standings limit 5`);
ok(wadm.length >= 1 && wadm[0].email, 'admin Drip Run standings view');
ok((await q(`select count(*)::int n from admin.rejected_runs`))[0].n >= 5, 'rejected runs recorded for review');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(fails ? 1 : 0);
