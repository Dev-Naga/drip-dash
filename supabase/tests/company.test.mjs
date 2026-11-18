// Company identification, business-email rules, duplicate review/merge, and backfill of existing players.
// Runs supabase/schema.sql in an in-memory Postgres (PGlite) and the browser module site/js/company.js side by side.
// Usage: cd supabase/tests && npm run test:company
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import * as C from '../../site/js/company.js';

const sqlPath = process.argv[2] || '../schema.sql';
const sql = fs.readFileSync(sqlPath, 'utf8');
const db = new PGlite();
let ipN = 0;   // each test sign-up comes from its own network address (the real limit is 15 sign-ups per network per hour)
const q = async (s, p) => {
  if (/register_player/.test(s)) await db.exec(`set request.headers = '{"x-forwarded-for":"10.0.${(ipN >> 8) & 255}.${ipN++ & 255}"}'`);
  return (await db.query(s, p)).rows;
};
const one = async (s, p) => (await q(s, p))[0];
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (fn, re, m) => {
  try { await fn(); ok(false, `${m} (no error)`); } catch (e) { ok(re.test(e.message), `${m} -> ${e.message}`); }
};
const anon = () => db.exec('set role anon');
const admin = () => db.exec('reset role');

await db.exec('create role anon nologin; create role authenticated nologin;');
await db.exec(sql);
await db.exec(`set request.headers = '{"x-forwarded-for":"5.6.7.8"}'`);

// ================================================================ 1. browser and database agree
const NAMES = ['inCon-trol Water Systems', 'InControl Water Systems, Inc.', 'The Acme Landscaping Co.', 'ACME LANDSCAPING LLC',
  'Smith & Sons', 'Smith and Sons Ltd', 'Johnson Bros. Construction', 'Intl Pool Svcs', 'Café Fountains GmbH', 'A.B.C. Irrigation',
  "O'Brien Engr'g Grp", '  City   of  Dallas  ', 'www.incontrolwatersystems.com', 'https://www.Acme-Landscaping.com/', 'acme.co.uk',
  'J.R. Pools', 'Pools.com Services', 'Co', 'The', '—', 'Parks & Rec Dept', 'Ålborg Øresund Systems', 'Water+Co'];
for (const n of NAMES) {
  const r = await one(`select private.company_norm($1) n`, [n]);
  ok(r.n === C.companyNorm(n), `same normalization: "${n}" -> "${r.n}"`);
}
const HOSTS = ['acme.com', 'mail.acme.com', 'WWW.Acme.com.', 'us.mail.acme.com', 'acme.co.uk', 'mail.acme.co.uk', 'acme.com.au',
  'ci.dallas.tx.us', 'dallas.tx.us', 'acme-landscaping.com', 'acme', '-bad.com', 'a..b.com', 'x.y.z.acme.de', ''];
for (const h of HOSTS) {
  const r = await one(`select private.registrable_domain($1) d`, [h]);
  ok(r.d === C.registrableDomain(h), `same registrable domain: "${h}" -> ${r.d}`);
}
const PAIRS = [['acme landscaping', 'acme landscapes'], ['acme landscaping', 'apex landscaping'], ['iws', 'incontrol water systems'],
  ['incontrol', 'incontrol water systems'], ['city parks', 'acme landscaping'], ['acmelandscaping', 'acme landscaping'],
  ['northpark', 'northpark mall'], ['abc', 'a better choice irrigation'], ['incontrol construction', 'incontrol water systems'],
  ['dallas parks', 'dallas water utilities'], ['city parks', 'city water'], ['acme pools', 'acme landscaping']];
for (const [a, b] of PAIRS) {
  const r = await one(`select score::float8 s, reason from private.company_match($1, $2)`, [a, b]);
  const j = C.companyMatch(a, b);
  ok(Math.abs(r.s - j.score) < 0.002 && r.reason === j.reason, `same match score: "${a}" ~ "${b}" = ${r.s} (${r.reason})`);
}
{ // personal-provider lists in sync
  const dbList = (await q(`select domain from private.email_providers`)).map((r) => r.domain).sort();
  const jsList = [...C.PERSONAL_DOMAINS].sort();
  ok(JSON.stringify(dbList) === JSON.stringify(jsList), `personal email lists match (${dbList.length} domains)`);
  const m = sql.match(/split_part\(p_domain, '\.', 1\) in \(([^)]*)\)/);
  const labels = m[1].replace(/'/g, '').split(',').map((s) => s.trim()).sort();
  ok(JSON.stringify(labels) === JSON.stringify([...C.PERSONAL_LABELS].sort()), 'personal brand labels match');
}

// ================================================================ 2. business email only
await admin();
// a player who registered with a personal address before this rule existed (legacy row, no company yet)
await q(`insert into players (email, display_name, company) values ('old.timer@gmail.com', 'Old Timer', 'Legacy Pools')`);
await anon();
for (const e of ['sam@gmail.com', 'sam@yahoo.com', 'sam@outlook.com', 'sam@hotmail.com', 'sam@yahoo.co.uk', 'sam@hotmail.fr',
  'sam@outlook.de', 'sam@icloud.com', 'sam@comcast.net', 'sam@mailinator.com', 'Sam@GMAIL.COM ']) {
  await expectErr(() => q(`select register_player($1,'Sam','Sam Co',true)`, [e]), /business email/, `personal email refused: ${e.trim()}`);
  const l = await one(`select lookup_company($1, null) r`, [e]);
  ok(l.r.personal_blocked === true && l.r.domain === null, `lookup flags ${e.trim()} as personal`);
  ok(C.isPersonalDomain(C.emailDomain(e)), `browser flags ${e.trim()} as personal`);
}
ok(!C.isPersonalDomain('gmailservices.com') && !C.isPersonalDomain('outlookgroup.com') && !C.isPersonalDomain('liveoak.com'),
  'look-alike corporate domains are allowed (gmailservices.com, outlookgroup.com, liveoak.com)');
const legacy = await one(`select register_player('old.timer@gmail.com','Old Timer','Legacy Pools',true) r`);
ok(legacy.r.player_key && legacy.r.company === 'Legacy Pools', 'existing personal-email player can still sign in (data preserved)');

// ================================================================ 3. company from the email domain
const jane = (await one(`select register_player('jane@acme-landscaping.com','Jane','Acme Landscaping, LLC',true) r`)).r;
ok(jane.company === 'Acme Landscaping, LLC' && jane.company_id, 'first player creates the company');
let l = (await one(`select lookup_company('bob@acme-landscaping.com', null) r`)).r;
ok(l.match?.name === 'Acme Landscaping, LLC' && l.via === 'domain' && !l.needs_confirmation, 'colleague: company auto-detected from email domain');
ok(!JSON.stringify(l).includes('@'), 'lookup never returns email addresses');
const bob = (await one(`select register_player('bob@acme-landscaping.com','Bob','',true) r`)).r;
ok(bob.company_id === jane.company_id && bob.company === 'Acme Landscaping, LLC', 'missing company + known domain → joined, name filled in');
const sub = (await one(`select register_player('sue@us.mail.acme-landscaping.com','Sue','Acme',true) r`)).r;
ok(sub.company_id === jane.company_id, 'subdomain email (us.mail.acme-landscaping.com) → same company');
l = (await one(`select lookup_company('kim@acme-landscaping.com', 'Acme Lawn') r`)).r;
ok(l.match?.id === jane.company_id && l.needs_confirmation, 'known domain but a different typed name → asks the player to confirm');
const uk1 = (await one(`select register_player('ann@thames.co.uk','Ann','Thames Fountains',true) r`)).r;
const uk2 = (await one(`select register_player('ben@mail.thames.co.uk','Ben','',true) r`)).r;
ok(uk1.company_id === uk2.company_id, 'country domains: mail.thames.co.uk = thames.co.uk');

// ================================================================ 4. exact duplicates are normalized to one company
for (const [e, n] of [['amy@acme-land.net', 'ACME LANDSCAPING'], ['ty@acmelandscaping.org', 'The Acme Landscaping Co.'], ['lu@acme-tx.com', 'acme  landscaping inc.']]) {
  const r = (await one(`select register_player($1,'Pat',$2,true) r`, [e, n])).r;
  ok(r.company_id === jane.company_id && r.company === 'Acme Landscaping, LLC', `"${n}" → same company (shown as "${r.company}")`);
}
await admin();
ok((await one(`select count(*)::int n from companies where name_key = 'acmelandscaping'`)).n === 1, 'only one Acme Landscaping company record');
ok((await one(`select count(*)::int n from company_domains where company_id = $1`, [jane.company_id])).n === 1,
  "other players' domains are NOT attached to an existing company (avoids pulling in the wrong people later)");
const typed = (await q(`select company from players where company_id = $1 order by created_at`, [jane.company_id])).map((r) => r.company);
ok(typed.includes('ACME LANDSCAPING') && typed.includes('The Acme Landscaping Co.'), 'what each player typed is preserved');
await anon();

// ================================================================ 5. similar names: suggested, never merged automatically
const iws = (await one(`select register_player('ops@incontrolwatersystems.com','Ops','inCon-trol Water Systems',true) r`)).r;
for (const [name, why] of [['Acme Landscapes', 'similar spelling'], ['Apex Landscaping', 'similar spelling'], ['IWS', 'abbreviation'], ['inCon-trol', 'shorter form of the name']]) {
  l = (await one(`select lookup_company('x@newco-${why.length}.com', $1) r`, [name])).r;
  ok(!l.match && l.needs_confirmation && l.suggestions.length > 0 && l.suggestions[0].reason === why,
    `"${name}" → suggests "${l.suggestions[0]?.name}" (${l.suggestions[0]?.reason}, ${l.suggestions[0]?.score}) and asks`);
}
l = (await one(`select lookup_company('pat@cityofplano.org', 'City of Plano Parks') r`)).r;
ok(!l.match && !l.needs_confirmation && l.suggestions.length === 0, 'unrelated company → no suggestions, no question');
const apex = (await one(`select register_player('al@apexlandscaping.com','Al','Apex Landscaping',true) r`)).r;
const iws2 = (await one(`select register_player('z@iwsparts.com','Zed','IWS',true) r`)).r;
ok(apex.company_id !== jane.company_id && iws2.company_id !== iws.company_id, 'similar companies registered without choosing stay separate');
await admin();
const queue = await q(`select * from admin.company_review_queue`);
ok(queue.some((r) => [r.company_a, r.company_b].includes('Apex Landscaping') && [r.company_a, r.company_b].includes('Acme Landscaping, LLC')),
  'Apex vs Acme queued for review');
ok(queue.some((r) => r.reason === 'abbreviation' && [r.company_a, r.company_b].includes('IWS')), 'IWS vs inCon-trol queued for review (abbreviation)');
ok(queue.every((r) => /^select admin\.merge_companies/.test(r.merge_b_into_a) && /^select admin\.dismiss_review/.test(r.dismiss)), 'review queue rows carry ready-to-run merge / dismiss statements');
await anon();

// a website typed as the company name, and a shared distinctive first word
let w2 = (await one(`select register_player('web@iwsfield.net','Web','www.incontrolwatersystems.com',true) r`)).r;
ok(w2.company_id === iws.company_id, '"www.incontrolwatersystems.com" typed as the company → inCon-trol Water Systems');
l = (await one(`select lookup_company('cc@incontrolconstruction.com', 'inControl Construction') r`)).r;
ok(!l.match && l.needs_confirmation && l.suggestions.some((x) => x.reason === 'same first word' && x.name === 'inCon-trol Water Systems'),
  '"inControl Construction" → asks about inCon-trol Water Systems (same first word), not merged');
l = (await one(`select lookup_company('pr@dallasparks.org', 'City of Dallas Parks') r`)).r;
ok(l.suggestions.every((x) => x.reason !== 'same first word'), 'generic first words ("City …") do not trigger questions');

// ================================================================ 6. the player decides when it's uncertain
const pick = (await one(`select register_player('kay@iws-field.com','Kay','IWS field team',true,false,null,'',$1) r`, [iws.company_id])).r;
ok(pick.company_id === iws.company_id && pick.company === 'inCon-trol Water Systems', 'player picks the suggested company → joined');
const own = (await one(`select register_player('max@acme-landscaping.com','Max','Max Lawn Care',true,false,null,'',null,true) r`)).r;
ok(own.company_id !== jane.company_id && own.company === 'Max Lawn Care', 'player says "a different company" despite the known domain → own company');
await admin();
ok((await one(`select company_id from company_domains where domain = 'acme-landscaping.com'`)).company_id === jane.company_id, "...and the domain still belongs to Acme");
await anon();
// typed name of one company, email domain of another → typed name wins, conflict queued
l = (await one(`select lookup_company('nia@acme-landscaping.com', 'Apex Landscaping') r`)).r;
ok(l.match?.id === apex.company_id && l.domain_company?.id === jane.company_id && l.needs_confirmation, 'name/domain conflict → both offered, player asked');
const nia = (await one(`select register_player('nia@acme-landscaping.com','Nia','Apex Landscaping',true) r`)).r;
ok(nia.company_id === apex.company_id, 'conflict without a choice → the company the player typed');

// ================================================================ 7. no confident match → ask, don't guess
l = (await one(`select lookup_company('lee@bluewavepools.com', null) r`)).r;
ok(!l.match && l.guess === 'Bluewavepools' && l.domain === 'bluewavepools.com', `unknown domain → a guess to confirm ("${l.guess}"), not a match`);
await expectErr(() => q(`select register_player('lee@bluewavepools.com','Lee','',true)`), /company name/, 'missing company + unknown domain → asked to type it');
await expectErr(() => q(`select register_player('lee@bluewavepools.com','Lee',' ',true)`), /company name/, 'blank company → asked to type it');
l = (await one(`select lookup_company('liz@acmelandscaping.com', null) r`)).r;
ok(!l.match && l.suggestions[0]?.reason === 'matches your email domain' && l.needs_confirmation,
  'domain that spells an existing company (acmelandscaping.com) → offered, needs confirmation');
await expectErr(() => q(`select lookup_company($1, null)`, ['x'.repeat(130) + '@a.com']), /too long/, 'lookup input length limited');

// ================================================================ 8. leaderboards use one name per company
async function play(key, score) {
  const t = (await one(`select start_run($1, 'RUN') r`, [key])).r;
  await admin(); await q(`update runs set started_at = now() - interval '61 seconds' where id = $1`, [t.run_id]); await anon();
  return (await one(`select submit_run($1,$2,$3,60000,$3,0,0) r`, [t.run_id, key, score])).r;
}
await play(jane.player_key, 3000); await play(bob.player_key, 2000);
const ty = (await one(`select register_player('ty@acmelandscaping.org','Pat','Acme',true) r`)).r;
await play(ty.player_key, 1000); await play(apex.player_key, 2500);
let lb = await q(`select * from get_leaderboard('month', null, 10, 'dash')`);
ok(lb.filter((r) => r.company === 'Acme Landscaping, LLC').length === 3, 'player board shows the one company name for all spellings');
let cb = await q(`select * from get_company_board('month', 10, 'dash')`);
ok(cb.length === 2 && cb[0].company === 'Acme Landscaping, LLC' && Number(cb[0].total) === 6000 && Number(cb[0].players) === 3,
  'company board: Acme spellings combined, Apex separate ' + JSON.stringify(cb.map((c) => [c.company, Number(c.total)])));

// ================================================================ 9. review → merge → undo, dismiss, rename
await anon();
await expectErr(() => q(`select * from companies`), /permission/, 'anon cannot read companies');
await expectErr(() => q(`select * from company_review`), /permission/, 'anon cannot read the review queue');
await expectErr(() => q(`select admin.merge_companies($1,$2)`, [apex.company_id, jane.company_id]), /permission/, 'anon cannot merge companies');
await expectErr(() => q(`select private.assign_company('x', null, null, false)`), /permission/, 'anon cannot call internal functions');
await admin();
const m = (await one(`select admin.merge_companies($1, $2, 'same firm, checked by phone') r`, [apex.company_id, jane.company_id])).r;
ok(m.players_moved === 2 && /undo_merge/.test(m.undo), `merge moves players (${m.players_moved}) and returns an undo statement`);
await anon();
cb = await q(`select * from get_company_board('month', 10, 'dash')`);
ok(cb.length === 1 && Number(cb[0].total) === 7500, 'after merge: one company, top-3 total 3000+2500+2000');
const late = (await one(`select register_player('vi@apex-new.com','Vi','Apex Landscaping Inc',true) r`)).r;
ok(late.company_id === jane.company_id, 'after merge: the old spelling joins the merged company');
await admin();
ok((await one(`select status from company_review where least(company_a,company_b) = least($1::uuid,$2::uuid) and greatest(company_a,company_b) = greatest($1::uuid,$2::uuid)`, [apex.company_id, jane.company_id])).status === 'merged', 'review row marked merged');
const u = (await one(`select admin.undo_merge($1) r`, [m.merge_id])).r;
ok(u.players_restored === 2 && u.restored === 'Apex Landscaping', 'undo restores exactly the players that were moved');
ok((await one(`select company_id from players where email_norm = 'vi@apex-new.com'`)).company_id === jane.company_id,
  'players who joined after the merge are not moved by the undo');
await expectErr(() => q(`select admin.undo_merge($1)`, [m.merge_id]), /already undone/, 'undo cannot run twice');
await expectErr(() => q(`select admin.merge_companies($1, $1)`, [jane.company_id]), /itself/, 'cannot merge a company into itself');
const rv = await one(`select review_id from admin.company_review_queue where reason = 'abbreviation' limit 1`);
await q(`select admin.dismiss_review($1)`, [rv.review_id]);
ok(!(await q(`select 1 from admin.company_review_queue where review_id = $1`, [rv.review_id])).length, 'dismissed pair leaves the queue');
ok((await one(`select admin.scan_duplicates() n`)).n === 0, 'full re-scan does not re-queue dismissed or existing pairs');
await q(`select admin.rename_company($1, 'Thames Fountains Ltd (UK)')`, [uk1.company_id]);
await anon();
const uk3 = (await one(`select register_player('cy@other.co.uk','Cy','Thames Fountains',true) r`)).r;
ok(uk3.company_id === uk1.company_id && uk3.company === 'Thames Fountains Ltd (UK)', 'rename: shown name changes, old spelling still matches');
await admin();
const dir = await q(`select * from admin.company_directory where name like 'Acme%'`);
ok(dir[0].players >= 6 && /ACME LANDSCAPING/.test(dir[0].also_typed_as), 'company directory lists players, domains and other spellings');

// ================================================================ 10. existing data: backfill on re-deploy, nothing fuzzy merged
await q(`insert into players (email, display_name, company) values
  ('r1@riverbend.com','R1','Riverbend Pools'), ('r2@gmail.com','R2','RIVERBEND POOLS, INC.'), ('r3@riverbendpools.net','R3','Riverbend Pool'),
  ('r4@riverbend.com','R4','Riverbend Aquatics')`);
const before = await q(`select email, company from players order by email`);
await db.exec(sql);                                   // re-deploying the schema runs the backfill
ok(true, 'schema re-applied (idempotent) with the backfill');
const bf = await q(`select p.email, p.company typed, c.name, p.company_id from players p join companies c on c.id = p.company_id where p.email like 'r_@%' order by p.email`);
ok(bf.length === 4, 'every existing player now has a company');
ok(bf[0].company_id === bf[1].company_id, '"Riverbend Pools" and "RIVERBEND POOLS, INC." → one company');
ok(bf[2].company_id !== bf[0].company_id, '"Riverbend Pool" (similar, not exact) is NOT merged automatically');
ok(bf[3].company_id !== bf[0].company_id, 'same email domain but a different typed name stays separate (queued for review)');
ok((await q(`select 1 from admin.company_review_queue where company_a in ('Riverbend Pool','Riverbend Pools','Riverbend Aquatics') or company_b in ('Riverbend Pool','Riverbend Pools','Riverbend Aquatics')`)).length >= 2,
  'backfilled look-alikes are in the review queue');
const after = await q(`select email, company from players order by email`);
ok(JSON.stringify(before) === JSON.stringify(after), 'no player email or typed company text was changed');
ok((await one(`select company_id from players where email_norm = 'old.timer@gmail.com'`)).company_id, 'legacy personal-email player got a company too');

// ================================================================ 11. browser helpers
ok(C.emailDomain('Jane.Doe@Mail.AcmeCorp.com ') === 'acmecorp.com', 'browser: email domain from a subdomain address');
ok(C.guessFromDomain('acme-landscaping.com') === 'Acme Landscaping', 'browser: domain guess "Acme Landscaping"');
ok(C.companyKey('inCon-trol Water Systems, Inc.') === 'incontrolwatersystems', 'browser: company key');
ok(C.companyKey('https://www.incontrolwatersystems.com/') === 'incontrolwatersystems', 'browser: website as company → company key');
console.log(fails ? `\n${fails} FAILURE(S)` : '\nALL COMPANY TESTS PASSED');
process.exit(fails ? 1 : 0);
