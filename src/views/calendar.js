import { phaseOn, predictedPeriodDays } from '../cycle.js';
import { addDays, formatDate } from '../dates.js';
import { $, toast } from '../ui.js';

const WEEKDAYS = [...Array(7)].map((_, i) =>
  new Date(Date.UTC(2026, 1, 1 + i)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }),
);

export function render(app) {
  const month = app.calendarMonth || app.today.slice(0, 7);
  const first = `${month}-01`;
  const startPad = new Date(`${first}T00:00:00Z`).getUTCDay();
  const predicted = predictedPeriodDays(app.analysis, 4);
  const a = app.analysis;

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="day pad"></div>');
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) {
    const e = app.byDate.get(d);
    const cls = ['day'];
    if (e?.flow) cls.push(`flow flow-${e.flow}`);
    else if (d > app.today && predicted.has(d)) cls.push('predicted');
    if (d > app.today && !e?.flow && a.lastPeriod && phaseOn(d, a) === 'ovulation') cls.push('ovu');
    if (d === app.today) cls.push('is-today');
    if (d > app.today) cls.push('future');
    const hasMore = e && (e.symptoms || e.note || e.mood || e.energy);
    cells.push(`<button class="${cls.join(' ')}" data-date="${d}" aria-label="${formatDate(d, { month: 'long', day: 'numeric' })}${e?.flow ? `, ${e.flow} flow` : ''}${predicted.has(d) && d > app.today ? ', predicted period' : ''}">
      <span>${Number(d.slice(8))}</span>${hasMore ? '<i class="has-log" aria-hidden="true"></i>' : ''}</button>`);
  }

  const title = new Date(`${first}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `
  <header class="page-head"><h1>Calendar</h1></header>
  <section class="card">
    <div class="cal-head">
      <button class="icon-btn" id="prev" aria-label="Previous month">‹</button>
      <h2>${title}</h2>
      <button class="icon-btn" id="next" aria-label="Next month">›</button>
    </div>
    <div class="cal-grid weekdays" aria-hidden="true">${WEEKDAYS.map((w) => `<div>${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    ${month !== app.today.slice(0, 7) ? '<button class="secondary small-btn" id="this-month">Back to today</button>' : ''}
  </section>
  <section class="legend muted small">
    <span><i class="lg lg-flow"></i>Period</span>
    <span><i class="lg lg-pred"></i>Predicted</span>
    <span><i class="lg lg-ovu"></i>Ovulation (est.)</span>
    <span><i class="lg lg-log"></i>Notes/symptoms</span>
  </section>
  <p class="muted small center">Tap any past day to log or edit it.</p>`;
}

function shift(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function bind(app, root) {
  const month = app.calendarMonth || app.today.slice(0, 7);
  $('#prev', root).addEventListener('click', () => { app.calendarMonth = shift(month, -1); app.render(); });
  $('#next', root).addEventListener('click', () => { app.calendarMonth = shift(month, 1); app.render(); });
  $('#this-month', root)?.addEventListener('click', () => { app.calendarMonth = null; app.render(); });
  root.querySelector('.cal-grid:not(.weekdays)').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn) return;
    if (btn.dataset.date > app.today) return toast("You can't log days that haven't happened yet");
    app.openLog(btn.dataset.date);
  });
}
