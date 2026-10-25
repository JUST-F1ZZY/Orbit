import { PHASES, SEVERITY, phaseSummary, symptomLabel } from '../cycle.js';
import { formatDate } from '../dates.js';

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const MOOD_WORDS = ['', 'rough', 'low', 'okay', 'good', 'great'];
const ENERGY_WORDS = ['', 'low', 'medium', 'high'];

export function render(app) {
  const a = app.analysis;
  const head = '<header class="page-head"><h1>Insights</h1></header>';

  if (!a.lastPeriod) {
    return `${head}<section class="card"><p class="muted">Log a period and some days, and your patterns will show up here.</p></section>`;
  }

  const tiles = `
  <section class="tiles">
    <div class="tile"><span class="tile-num">${a.cycleLength}</span><span class="muted small">day cycle</span></div>
    <div class="tile"><span class="tile-num">±${a.spread}</span><span class="muted small">days of variation</span></div>
    <div class="tile"><span class="tile-num">${a.periodLength}</span><span class="muted small">day period</span></div>
    <div class="tile"><span class="tile-num">${a.cycles.length}</span><span class="muted small">cycles logged</span></div>
  </section>
  ${a.cycles.length < 2 ? '<p class="muted small">These numbers start from your settings and get more accurate with each cycle you log.</p>' : ''}`;

  // Bar per recent cycle, scaled so the longest one fills the row.
  const recent = a.cycles.slice(-8).reverse();
  const max = Math.max(...recent.map((c) => c.length), 1);
  const history = recent.length
    ? `<section class="card">
        <h2>Recent cycles</h2>
        <ul class="bars">${recent
          .map((c) => `<li><span class="muted small bar-label">${formatDate(c.start)}</span>
            <span class="bar"><span style="width:${(c.length / max) * 100}%"></span></span>
            <b class="small">${c.length}d</b></li>`)
          .join('')}</ul>
        ${a.outliers.length ? `<p class="muted small">${a.outliers.length} unusually long or short gap${a.outliers.length === 1 ? ' was' : 's were'} left out (often a missed log).</p>` : ''}
      </section>`
    : '';

  const phases = phaseSummary(app.entries, a);
  const phaseCards = Object.keys(PHASES)
    .filter((p) => phases[p]?.days)
    .map((p) => {
      const s = phases[p];
      const top = Object.entries(s.symptoms)
        .sort((x, y) => y[1].count - x[1].count)
        .slice(0, 4)
        .map(([sym, t]) => {
          const pct = Math.round((t.count / s.days) * 100);
          return `<li><span>${symptomLabel(sym)}</span><span class="muted small">${pct}% of days · usually ${SEVERITY[Math.round(t.sevSum / t.count)]}</span></li>`;
        })
        .join('');
      const mood = s.mood.length ? `Mood mostly ${MOOD_WORDS[Math.round(avg(s.mood))]}` : '';
      const energy = s.energy.length ? `energy ${ENERGY_WORDS[Math.round(avg(s.energy))]}` : '';
      return `<section class="card">
        <h2 class="phase-${p}">${PHASES[p].label}</h2>
        <p class="muted small">${s.days} logged day${s.days === 1 ? '' : 's'}${mood || energy ? ` · ${[mood, energy].filter(Boolean).join(', ')}` : ''}</p>
        ${top ? `<ul class="sym-list">${top}</ul>` : '<p class="muted small">No symptoms logged in this phase.</p>'}
      </section>`;
    })
    .join('');

  return `${head}${tiles}${history}
    <h2 class="section-title">By phase</h2>
    ${phaseCards || '<section class="card"><p class="muted">Log symptoms, mood, or energy to see how they change across your cycle.</p></section>'}
    <p class="muted small center">Patterns from your own logs. Not a diagnosis.</p>`;
}
