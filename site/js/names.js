// Display-name rules for instant feedback on the sign-up form. Mirrors private.name_problem in supabase/schema.sql
// (supabase/tests/schema.test.mjs checks both agree). The server has the final say, and also refuses names that are
// offensive, reserved or already taken.
const LETTER = 'A-Za-zÀ-ÖØ-öø-ÿ';
const ALLOWED = new RegExp(`^[${LETTER}0-9 .'’_-]+$`);
const HAS_LETTER = new RegExp(`[${LETTER}]`);
const FROM = 'àáâãäåāçćčèéêëēěìíîïīñńòóôõöøōùúûüūýÿžš';
const TO = 'aaaaaaaccceeeeeeiiiiinnooooooouuuuuyyzs';

export const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// same as private.name_key: names that differ only in case, accents, spaces or punctuation are the same name
export const nameKey = (s) => [...String(s || '').toLowerCase()].map((ch) => { const i = FROM.indexOf(ch); return i >= 0 ? TO[i] : ch; }).join('').replace(/[^a-z0-9]/g, '');

// null when the format is fine, otherwise the message to show
export function nameProblem(raw) {
  const n = cleanName(raw);
  if (n.length < 3 || n.length > 24) return 'Display name must be 3–24 characters.';
  if (!ALLOWED.test(n)) return "Display names can only use letters, numbers, spaces and . ' - _";
  if (!HAS_LETTER.test(n)) return 'Display names need at least one letter.';
  if (/[.'’_-]{2,}/.test(n)) return "Please don't put two punctuation marks in a row.";
  if (nameKey(n).length < 3) return 'Display name must have at least 3 letters or numbers.';
  return null;
}

/**
 * Live feedback under the display-name field: format first (instant), then "available / taken / not allowed" from the
 * server (debounced). Returns { check() } for the submit handler: resolves to an error message or null.
 */
export function enhanceName(form, api) {
  const input = form.name;
  const el = document.createElement('small');
  el.className = 'field-hint name-hint'; el.id = `${form.id}-name-hint`; el.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-describedby', el.id);
  input.closest('label').after(el);
  input.setAttribute('minlength', '3'); input.setAttribute('maxlength', '24');
  const set = (text, kind) => { el.textContent = text || ''; el.dataset.kind = kind || ''; input.toggleAttribute('aria-invalid', kind === 'bad'); };
  let timer = 0, seq = 0;
  async function server(name) {
    const my = ++seq;
    try {
      const r = await api.checkName(name);
      if (my !== seq) return null;
      if (r.ok) set('✔ Available', 'ok');
      else set(r.message, r.taken ? 'warn' : 'bad');
      return r;
    } catch { if (my === seq) set('', ''); return null; }   // offline: the server still checks on save
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const name = cleanName(input.value);
    if (!name) { set('', ''); return; }
    const p = nameProblem(name);
    if (p) { set(p, name.length < 3 ? '' : 'bad'); return; }   // don't nag while the first letters are typed
    set('Checking…', '');
    timer = setTimeout(() => server(name), 400);
  });
  input.addEventListener('blur', () => { const p = cleanName(input.value) && nameProblem(input.value); if (p) set(p, 'bad'); });
  return {
    // format problems block the form; "taken" is left to the server, because a returning player keeps their own name
    check() { const p = nameProblem(input.value); if (p) { set(p, 'bad'); input.focus(); } return p; },
  };
}
