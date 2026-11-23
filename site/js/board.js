// Leaderboard view, shared by the in-game overlay and leaderboard.html.
import { api, currentMonth, monthLabel } from './api.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r);

// Drip Run leaderboard: each player's best single run (this month, all-time), companies, past winners.
export function mountBoard(root, { me = null } = {}) {
  const month = currentMonth();
  const flow = false;
  root.innerHTML = `
    <div class="tabs" role="tablist">
      <button role="tab" data-tab="month" aria-selected="true">${esc(monthLabel(month).split(' ')[0])}</button>
      <button role="tab" data-tab="all">All-Time</button>
      <button role="tab" data-tab="companies">Companies</button>
      <button role="tab" data-tab="winners">Past Winners</button>
    </div>
    <div class="board-body" aria-live="polite"></div>`;
  const body = root.querySelector('.board-body');
  const tabs = root.querySelectorAll('[role=tab]');

  async function show(tab) {
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    body.innerHTML = '<p class="muted center">Loading…</p>';
    try {
      if (tab === 'month' || tab === 'all') {
        const rows = await api.leaderboard(tab, 50);
        const caption = flow
          ? (tab === 'month' ? `${monthLabel(month)} Valley Score: each player's best score on every level played this month, added up. Resets on the 1st (Central Time).` : 'All-time Valley Score: best score on every level, added up.')
          : (tab === 'month' ? `${monthLabel(month)}: best run per player. Resets on the 1st (Central Time).` : 'Best run ever, per player.');
        body.innerHTML = rows.length ? `
          <p class="muted small">${esc(caption)}</p>
          <ol class="rows">${rows.map((r) => `
            <li class="${me && r.display_name === me.display_name && r.company === me.company ? 'me' : ''} ${r.rank <= 3 ? 'top' : ''}">
              <span class="rk">${medal(r.rank)}</span>
              <span class="who"><b>${esc(r.display_name)}</b><small>${esc(r.company)}${r.levels ? ` · ${r.levels} level${r.levels === 1 ? '' : 's'}` : ''}</small></span>
              <span class="sc">${Number(r.score).toLocaleString()}</span>
            </li>`).join('')}</ol>`
          : `<p class="muted center">No scores yet this ${tab === 'month' ? 'month' : 'season'}. Be the first!</p>`;
      } else if (tab === 'companies') {
        const rows = await api.companies('month');
        body.innerHTML = rows.length ? `
          <p class="muted small">Team score = sum of each company's top 3 players this month.</p>
          <ol class="rows">${rows.map((r) => `
            <li class="${r.rank <= 3 ? 'top' : ''}">
              <span class="rk">${medal(r.rank)}</span>
              <span class="who"><b>${esc(r.company)}</b><small>${r.players} player${r.players === 1 ? '' : 's'}</small></span>
              <span class="sc">${Number(r.total).toLocaleString()}</span>
            </li>`).join('')}</ol>`
          : '<p class="muted center">No company scores yet.</p>';
      } else {
        const rows = await api.winners();
        if (!rows.length) { body.innerHTML = '<p class="muted center">Winners appear here after the first month closes.</p>'; return; }
        const byMonth = {};
        rows.forEach((r) => (byMonth[r.month] ||= []).push(r));
        body.innerHTML = Object.keys(byMonth).sort().reverse().map((m) => `
          <h3 class="month-h">${esc(monthLabel(m))}</h3>
          <ol class="rows">${byMonth[m].map((r) => `
            <li class="top"><span class="rk">${medal(r.rank)}</span>
              <span class="who"><b>${esc(r.display_name)}</b><small>${esc(r.company)}${r.levels ? ` · ${r.levels} level${r.levels === 1 ? '' : 's'}` : ''}</small></span>
              <span class="sc">${Number(r.score).toLocaleString()}</span></li>`).join('')}</ol>`).join('');
      }
    } catch (e) {
      body.innerHTML = `<p class="error center" role="alert">Couldn't load the leaderboard. ${esc(e.message)}</p><p class="center"><button type="button" class="btn retry">Try again</button></p>`;
      body.querySelector('.retry').onclick = () => show(tab);
    }
  }
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  show('month');
  return { refresh: () => show(root.querySelector('[aria-selected=true]')?.dataset.tab || 'month') };
}
