// Company identification for the sign-up form, shared by all four games.
//
//  * Business email only: personal providers (gmail.com, yahoo.com, outlook.com, …) are refused.
//  * The company is recognised from the email domain (mail.acme.com, acme.com and acme.co.uk all → the company that
//    owns acme.*) and filled in automatically when the leaderboard already knows that domain.
//  * When the match is uncertain (similar spelling, abbreviation, a guess from the domain), the player is asked to
//    confirm: "Is your company one of these?". Nothing uncertain is ever merged automatically.
//  * Newsletter links can pre-fill the form: ?email=…&name=…&company=… or, better (never sent to any server),
//    #email=…&company=…. These personal details are removed from the address bar as soon as the page reads them.
//
// The normalization below mirrors private.company_norm / registrable_domain in supabase/schema.sql
// (supabase/tests/company.test.mjs checks that both give the same answers). The server always has the final say.

// ---------------------------------------------------------------- normalization (mirror of the SQL)
const FROM = 'àáâãäåāçćčèéêëēěìíîïīñńòóôõöøōùúûüūýÿžš';
const TO = 'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyyzs';
const ABBR = {
  intl: 'international', natl: 'national', svc: 'services', svcs: 'services', mfg: 'manufacturing', assoc: 'associates',
  assocs: 'associates', bros: 'brothers', sys: 'systems', dept: 'department', mgmt: 'management', mgt: 'management',
  engr: 'engineering', engrg: 'engineering', constr: 'construction', grp: 'group', ctr: 'center', centre: 'center', hldgs: 'holdings',
};
const SUFFIX = new Set(['inc', 'incorporated', 'llc', 'llp', 'lp', 'lc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company',
  'plc', 'pllc', 'pc', 'pa', 'gmbh', 'ag', 'sa', 'bv', 'nv', 'pty', 'srl', 'sas', 'and']);

export function companyNorm(name) {
  let s = String(name || '').toLowerCase().trim();
  // a website typed as the company ("www.acme-landscaping.com") means the company named by that domain
  if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\/?$/.test(s)) s = (registrableDomain(s.replace(/^https?:\/\//, '').replace(/\/$/, '')) || s).split('.')[0];
  s = [...s].map((ch) => { const i = FROM.indexOf(ch); return i >= 0 ? TO[i] : ch; }).join('');
  s = s.replace(/&/g, ' and ').replace(/\+/g, ' and ');
  s = s.replace(/[.'’`-]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!s) return '';
  let w = s.split(' ').map((x) => ABBR[x] || x);
  if (w.length > 1 && w[0] === 'the') w = w.slice(1);
  while (w.length > 1 && SUFFIX.has(w[w.length - 1])) w = w.slice(0, -1);
  return w.join(' ');
}
export const companyKey = (name) => companyNorm(name).replace(/ /g, '');

const SLD = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc', 'or', 'ne', 'gob', 'gv', 'nhs', 'sch']);
export function registrableDomain(host) {
  const h = String(host || '').toLowerCase().trim().replace(/^[ .]+|[ .]+$/g, '').replace(/^www\./, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)) return null;
  const l = h.split('.'), n = l.length;
  if (n >= 3 && l[n - 1].length === 2 && SLD.has(l[n - 2])) return l.slice(n - 3).join('.');
  if (n >= 3 && l[n - 1] === 'us' && l[n - 2].length === 2) return l.slice(n - 3).join('.');
  return l.slice(n - 2).join('.');
}
export const emailDomain = (email) => registrableDomain(String(email || '').trim().toLowerCase().split('@')[1] || '');

// Keep in sync with private.email_providers in supabase/schema.sql (a test checks this).
export const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'rocketmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'passport.com', 'aol.com', 'aim.com', 'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net',
  'mail.com', 'email.com', 'usa.com', 'zohomail.com', 'yandex.com', 'tutanota.com', 'tuta.io', 'fastmail.com', 'hey.com', 'inbox.com',
  'qq.com', '163.com', '126.com', 'rediffmail.com', 'mail.ru',
  'comcast.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'verizon.net', 'charter.net', 'cox.net', 'earthlink.net', 'optonline.net',
  'frontier.com', 'frontiernet.net', 'windstream.net', 'centurylink.net', 'juno.com', 'netzero.net', 'roadrunner.com', 'twc.com',
  'suddenlink.net', 'embarqmail.com', 'prodigy.net',
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'yopmail.com', 'temp-mail.org', 'trashmail.com', 'sharklasers.com',
]);
// Same brand under another country ending (yahoo.co.uk, hotmail.fr, outlook.de, …)
export const PERSONAL_LABELS = new Set(['gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn', 'aol', 'icloud', 'protonmail', 'gmx', 'yandex']);
export const isPersonalDomain = (d) => !!d && (PERSONAL_DOMAINS.has(d) || PERSONAL_LABELS.has(d.split('.')[0]));
export const guessFromDomain = (d) => (d ? d.split('.')[0].replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase()).slice(0, 60) : '');

// Edit distance where swapping two neighbouring letters counts as one edit (gmial -> gmail = 1). Mirrors private.edit_distance.
export function editDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  const la = a.length, lb = b.length;
  if (!la) return lb;
  if (!lb) return la;
  const d = Array.from({ length: la + 1 }, (_, i) => Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[la][lb];
}
// A probable typo of a known domain (company domains first, then personal providers), or null. Mirrors private.domain_typo.
export function domainTypo(domain, companyDomains = []) {
  if (!domain || domain.length < 6) return null;
  const known = [...new Set(companyDomains)].map((d) => [d, 0]).concat([...PERSONAL_DOMAINS].map((d) => [d, 1]));
  if (known.some(([d]) => d === domain)) return null;
  let best = null;
  for (const [d, pri] of known) {
    if (Math.abs(d.length - domain.length) > 2) continue;
    const dist = editDistance(domain, d);
    if (dist > (d.length >= 12 ? 2 : 1)) continue;
    if (!best || dist < best.dist || (dist === best.dist && (pri < best.pri || (pri === best.pri && d < best.d)))) best = { d, dist, pri };
  }
  return best ? best.d : null;
}
// The same address with its domain corrected: pat@mail.acme.con + acme.com -> pat@mail.acme.com
export function fixEmailDomain(email, from, to) {
  const [local, host = ''] = String(email).trim().split('@');
  const h = host.toLowerCase();
  return `${local}@${h.endsWith(from) ? h.slice(0, h.length - from.length) + to : to}`;
}

const FIRST_WORD_STOP = new Set(['city', 'county', 'state', 'national', 'american', 'texas', 'north', 'south', 'central', 'united', 'first',
  'global', 'international', 'general', 'premier', 'advanced', 'superior', 'quality', 'professional', 'southern', 'northern', 'western', 'eastern']);
function trigrams(s) { const p = `  ${s} `, t = new Set(); for (let i = 0; i + 3 <= p.length; i++) t.add(p.slice(i, i + 3)); return t; }
function trigramSim(a, b) {
  const A = trigrams(a), B = trigrams(b); let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter++; });
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}
// Same scoring as private.company_match: 1 = same name, >= 0.5 = worth asking about.
export function companyMatch(aNorm, bNorm) {
  const ka = aNorm.replace(/ /g, ''), kb = bNorm.replace(/ /g, '');
  if (!ka || !kb) return { score: 0, reason: null };
  if (ka === kb) return { score: 1, reason: 'same name' };
  const wa = aNorm.split(' '), wb = bNorm.split(' ');
  const ia = wa.map((x) => x[0]).join(''), ib = wb.map((x) => x[0]).join('');
  if ((wa.length === 1 && wb.length >= 2 && ka === ib && ka.length >= 2 && ka.length <= 6)
    || (wb.length === 1 && wa.length >= 2 && kb === ia && kb.length >= 2 && kb.length <= 6)) return { score: 0.85, reason: 'abbreviation' };
  const pre = (s, l) => s.length < l.length && l.slice(0, s.length).join(' ') === s.join(' ');
  if ((pre(wa, wb) && ka.length >= 4) || (pre(wb, wa) && kb.length >= 4)) return { score: 0.8, reason: 'shorter form of the name' };
  if (Math.min(ka.length, kb.length) >= 5 && (ka.startsWith(kb) || kb.startsWith(ka))) return { score: 0.75, reason: 'one name starts with the other' };
  const score = Math.round(trigramSim(ka, kb) * 1000) / 1000;
  // a distinctive shared first word is worth a question ("inControl Construction" vs "inCon-trol Water Systems")
  if (wa.length >= 2 && wb.length >= 2 && wa[0] === wb[0] && wa[0].length >= 5 && score < 0.55 && !FIRST_WORD_STOP.has(wa[0])) return { score: 0.55, reason: 'same first word' };
  return { score, reason: 'similar spelling' };
}

// ---------------------------------------------------------------- details from a newsletter link
const MERGE_TAG = /^(\{\{.*\}\}|\*\|.*\|\*|%%.*%%|\[.*\]|<.*>|\$\{.*\})$/;   // an un-filled mail-merge placeholder
function readLinkDetails() {
  const out = {};
  if (typeof location === 'undefined') return out;
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
  for (const k of ['email', 'name', 'company']) {
    const v = (h.get(k) || q.get(k) || '').trim();
    if (v && !MERGE_TAG.test(v)) out[k] = v.slice(0, k === 'email' ? 120 : 60);
  }
  // don't leave personal details in the address bar, history or shared links
  if (['email', 'name', 'company'].some((k) => q.has(k) || h.has(k))) {
    ['email', 'name', 'company'].forEach((k) => { q.delete(k); h.delete(k); });
    const qs = q.toString(), hs = h.toString();
    try { history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + (hs ? `#${hs}` : '')); } catch { /* ignore */ }
  }
  return out;
}
export const linkDetails = readLinkDetails();

// ---------------------------------------------------------------- the sign-up form
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PERSONAL_MSG = (d) => `Please use your business email address. Personal addresses${d ? ` like ${d}` : ''} can't join the leaderboard.`;

/**
 * Adds company detection to a #form-register form.
 * @param {HTMLFormElement} form
 * @param {{ lookupCompany: (email: string, company: string) => Promise<object> }} api
 * @returns {{ prefill(): void, resolve(): Promise<null | {companyId?: string, newCompany?: boolean, company?: string}> }}
 */
export function enhanceRegistration(form, api) {
  const emailIn = form.email, coIn = form.company;
  const hint = (input, cls) => {
    const el = document.createElement('small'); el.className = `field-hint ${cls}`; el.setAttribute('aria-live', 'polite');
    el.id = `${form.id}-${input.name}-hint`; input.setAttribute('aria-describedby', el.id);
    input.closest('label').after(el); return el;
  };
  const emailHint = hint(emailIn, 'email-hint'), coHint = hint(coIn, 'co-hint');
  const panel = document.createElement('div');
  panel.className = 'co-confirm'; panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-live', 'polite');
  coHint.after(panel);

  const st = { autofilled: false, guessed: false, chosen: null, seq: 0, timer: 0, typoOk: null };
  const setHint = (el, html, kind = '') => { el.innerHTML = html || ''; el.dataset.kind = kind; };
  const setCompany = (v) => { coIn.value = v; coIn.classList.remove('autofill'); void coIn.offsetWidth; coIn.classList.add('autofill'); };

  async function lookup() {
    const email = emailIn.value.trim(), d = emailDomain(email);
    panel.hidden = true;
    if (!d || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setHint(emailHint, ''); return; }
    const my = ++st.seq;
    let res = null;
    try { res = await api.lookupCompany(email, coIn.value.trim()); } catch { res = null; }
    if (my !== st.seq) return;                                   // a newer keystroke won
    if (res ? res.personal_blocked : isPersonalDomain(d)) {
      setHint(emailHint, `✋ ${esc(PERSONAL_MSG(d))}`, 'bad'); emailIn.setAttribute('aria-invalid', 'true'); return;
    }
    emailIn.removeAttribute('aria-invalid');
    if (res?.domain_typo && st.typoOk !== d) {
      const fixed = fixEmailDomain(email, d, res.domain_typo);
      setHint(emailHint, `Did you mean <b>${esc(fixed)}</b>? <button type="button" class="btn link typo-fix">Yes, fix it</button>`, 'warn');
      emailHint.querySelector('.typo-fix').onclick = () => { emailIn.value = fixed; emailIn.focus(); lookup(); };
      if (isPersonalDomain(res.domain_typo)) return;
    } else {
      setHint(emailHint, res?.domain ? `Business email ✔ <span class="muted">(${esc(res.domain)})</span>` : '', 'ok');
    }
    if (!res) return;
    const empty = !coIn.value.trim();
    if (res.match && res.via === 'domain' && (empty || st.autofilled)) {
      setCompany(res.match.name); Object.assign(st, { autofilled: true, guessed: false, chosen: res.match });
      setHint(coHint, `✔ Recognised from your email domain <b>${esc(res.domain)}</b>`, 'ok');
    } else if ((empty || st.autofilled) && res.suggestions?.[0]?.reason === 'matches your email domain') {
      const s = res.suggestions[0];
      setCompany(s.name); Object.assign(st, { autofilled: true, guessed: true, chosen: s });
      setHint(coHint, `Is this your company? It looks like your email domain <b>${esc(res.domain)}</b>. You'll be asked to confirm.`, 'warn');
    } else if ((empty || st.autofilled) && res.guess) {
      setCompany(res.guess); Object.assign(st, { autofilled: true, guessed: true, chosen: null });
      setHint(coHint, `We guessed this from <b>${esc(res.domain)}</b>. Please check it, and correct it if needed.`, 'warn');
    } else if (res.match && res.via === 'name') {
      setHint(coHint, `✔ ${esc(res.match.name)} is already on the leaderboard`, 'ok');
    }
  }
  const soon = () => { clearTimeout(st.timer); st.timer = setTimeout(lookup, 450); };
  emailIn.addEventListener('input', soon);
  emailIn.addEventListener('change', lookup);
  coIn.addEventListener('input', () => { Object.assign(st, { autofilled: false, guessed: false, chosen: null }); setHint(coHint, ''); panel.hidden = true; coIn.classList.remove('autofill'); });
  coIn.addEventListener('change', () => { if (emailIn.value.trim()) lookup(); });

  function ask(title, options, editInput = coIn, editLabel = '✎ Let me edit the company name') {
    return new Promise((resolve) => {
      panel.innerHTML = `<p class="co-q">${title}</p>${options.map((o, i) => `<button type="button" class="btn ${i === 0 ? 'primary' : ''} co-opt" data-i="${i}">${o.label}</button>`).join('')}<button type="button" class="btn link co-edit">${editLabel}</button>`;
      panel.hidden = false;
      panel.querySelectorAll('.co-opt').forEach((b) => (b.onclick = () => { panel.hidden = true; resolve(options[+b.dataset.i].value); }));
      panel.querySelector('.co-edit').onclick = () => { panel.hidden = true; editInput.focus(); editInput.select(); resolve(null); };
      panel.querySelector('.co-opt')?.focus();
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  return {
    prefill() {
      for (const k of ['email', 'name', 'company']) if (linkDetails[k] && !form[k].value) form[k].value = linkDetails[k];
      if (form.email.value) lookup();
    },
    // Call on submit, after the basic checks. Resolves to extra fields for api.register, or null if the player went back to edit.
    async resolve() {
      const email = emailIn.value.trim(), typed = coIn.value.trim(), d = emailDomain(email);
      let res;
      try { res = await api.lookupCompany(email, typed); } catch { res = null; }
      if (res ? res.personal_blocked : isPersonalDomain(d)) throw new Error(PERSONAL_MSG(d));
      if (!res) return {};
      if (res.domain_typo && st.typoOk !== d) {
        // a mistyped domain would create a second player for the same person, so check before saving
        const fixed = fixEmailDomain(email, d, res.domain_typo);
        if (isPersonalDomain(res.domain_typo)) throw new Error(`That looks like a typo of ${res.domain_typo}. ${PERSONAL_MSG('')}`);
        const pick = await ask(`Is your email <b>${esc(fixed)}</b>? <small>“${esc(d)}” looks like a typo of ${esc(res.domain_typo)}.</small>`,
          [{ label: `Yes, use ${esc(fixed)}`, value: 'fix' }, { label: `No, ${esc(email)} is right`, value: 'keep' }], emailIn, '✎ Let me edit my email');
        if (!pick) return null;
        if (pick === 'fix') { emailIn.value = fixed; await lookup(); } else st.typoOk = d;
        return this.resolve();
      }                                       // offline: the server still decides safely (exact matches only)
      const typedKey = companyKey(typed), sugg = res.suggestions || [];
      if (st.chosen && !st.guessed && companyKey(st.chosen.name) === typedKey) return { companyId: st.chosen.id };
      if (!res.needs_confirmation && !st.guessed && !(sugg.length && !res.match)) return res.match ? { companyId: res.match.id } : {};

      const opts = [], seen = new Set();
      const add = (c, note) => { if (c && !seen.has(c.id)) { seen.add(c.id); opts.push({ label: `${esc(c.name)}${note ? ` <small>${note}</small>` : ''}`, value: { companyId: c.id, company: c.name } }); } };
      add(res.match, res.via === 'domain' ? 'matches your email domain' : 'on the leaderboard');
      add(res.domain_company, 'matches your email domain');
      sugg.forEach((s) => add(s, s.reason === 'matches your email domain' ? s.reason : ''));
      const isExisting = res.match && companyKey(res.match.name) === typedKey;
      if (typed && !isExisting) {
        opts.push({ label: st.guessed && !opts.length ? `Yes, “${esc(typed)}” is right` : `No, “${esc(typed)}” is a different company`, value: { newCompany: true } });
      }
      if (!opts.length) return {};
      const title = opts.length === 1 ? 'Please confirm your company:' : 'Is your company one of these? Choosing the right one keeps your company\'s scores together.';
      const choice = await ask(title, opts);
      if (choice?.companyId) { st.chosen = { id: choice.companyId, name: choice.company }; st.guessed = false; coIn.value = choice.company; }
      if (choice?.newCompany) st.guessed = false;
      return choice;
    },
  };
}
