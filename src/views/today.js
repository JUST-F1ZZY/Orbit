import { PHASES, SEVERITY, forecastAhead, symptomLabel as symLabel } from '../cycle.js';
import { formatDate } from '../dates.js';
import { $, esc } from '../ui.js';

// The cycle wheel: four phase arcs and a dot for today.
function ring(a) {
  const L = a.cycleLength;
  const C = 2 * Math.PI * 80;
  const ov = L - 14;
  const segs = [
    ['menstrual', 0, a.periodLength],
    ['follicular', a.periodLength, ov - 2],
    ['ovulation', ov - 2, ov + 2],
    ['luteal', ov + 2, L],
  ].filter(([, s, e]) => e > s);
  const arcs = segs
    .map(([p, s, e]) => {
      const len = ((e - s) / L) * C - 3;
      return `<circle class="arc arc-${p}" cx="100" cy="100" r="80"
        stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-(s / L) * C).toFixed(1)}"/>`;
    })
    .join('');
  const day = Math.min(a.cycleDay, L);
  const angle = ((day - 0.5) / L) * 2 * Math.PI - Math.PI / 2;
  const x = 100 + 80 * Math.cos(angle);
  const y = 100 + 80 * Math.sin(angle);
  const late = a.cycleDay > L;
  return `<svg viewBox="0 0 200 200" class="ring" role="img" aria-label="Cycle day ${a.cycleDay} of about ${L}">
    <g transform="rotate(-90 100 100)">${arcs}</g>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" class="ring-dot"/>
    <text x="100" y="80" class="ring-small">${late ? 'Period due' : 'Cycle day'}</text>
    <text x="100" y="130" class="ring-big">${a.cycleDay}</text>
  </svg>`;
}

function nextPeriodText(a) {
  const d = a.daysUntilNext;
  if (a.phase === 'menstrual') return `Period, day ${a.cycleDay}`;
  if (a.lateBy > 0) return `${a.lateBy} day${a.lateBy === 1 ? '' : 's'} later than expected`;
  if (d < 0) return 'Due any day now';
  if (d === 0) return 'Expected today';
  if (d === 1) return 'Expected tomorrow';
  return `In ${d} days`;
}

function forecastCard(app) {
  const a = app.analysis;
  if (app.history.cycles < 2) {
    const n = app.history.cycles;
    return `<section class="card">
      <h2>What to expect</h2>
      <p class="muted">Log symptoms through ${n === 0 ? 'two cycles' : 'one more cycle'} and Orbit will start forecasting which ones are coming and how bad they usually get.</p>
    </section>`;
  }
  const items = forecastAhead(app.today, a, app.history, 7);
  const list = items.length
    ? items
        .map((f) => {
          const when = f.from === f.to ? formatDate(f.from, { weekday: 'short' }) : `${formatDate(f.from, { weekday: 'short' })} to ${formatDate(f.to, { weekday: 'short' })}`;
          return `<li>
            <div><b>${esc(symLabel(f.symptom))}</b><span class="muted"> · ${when}</span></div>
            <div class="muted small">Usually ${SEVERITY[f.severity]}${f.sevMax > f.severity ? `, sometimes ${SEVERITY[f.sevMax]}` : ''} · ${f.count} of ${f.of} cycles</div>
            <span class="sev sev-${f.sevMax}" aria-hidden="true"></span>
          </li>`;
        })
        .join('')
    : '<li class="muted">Nothing you usually get is due in the next week.</li>';
  return `<section class="card">
    <h2>Next 7 days</h2>
    <ul class="forecast">${list}</ul>
    <p class="muted small">Based on your past cycles. An estimate, not a promise.</p>
  </section>`;
}

function todayLogSummary(app) {
  const e = app.byDate.get(app.today);
  if (!e) return '';
  const bits = [];
  if (e.flow) bits.push(`Flow: ${e.flow}`);
  const syms = Object.entries(e.symptoms || {}).filter(([, v]) => v);
  if (syms.length) bits.push(syms.map(([k, v]) => `${symLabel(k)} (${SEVERITY[v]})`).join(', '));
  if (e.note) bits.push(`“${esc(e.note)}”`);
  return `<p class="muted small logged-today">Logged today: ${bits.join(' · ') || 'mood/energy'}</p>`;
}

export function render(app) {
  const a = app.analysis;
  const header = `<header class="page-head"><p class="muted">${formatDate(app.today, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>Today</h1></header>`;

  if (!a.lastPeriod) {
    return `${header}
    <section class="card center">
      <h2>Start logging</h2>
      <p class="muted">Log how you feel any day. Once you mark a period, Orbit starts predicting from there.</p>
      <button id="log-today" class="wide">Log today</button>
      <p class="muted small">Had a period recently? Mark those days in the Calendar.</p>
    </section>`;
  }

  const phase = PHASES[a.phase];
  const lateNote = a.lateBy > 0
    ? `<section class="card notice">
        <b>Your period is later than Orbit expected.</b>
        <p class="muted small">Cycles shift for lots of reasons, like stress, illness, travel, or changes in sleep. If you're worried, a doctor or nurse can help.</p>
      </section>`
    : '';

  return `${header}
  <section class="hero-ring">
    ${ring(a)}
    <p class="phase-name phase-${a.phase}">${phase.label}</p>
    <p class="muted small phase-blurb">${phase.blurb}</p>
  </section>

  <div class="row center-row">
    <button id="log-today">${app.byDate.has(app.today) ? 'Edit today' : 'Log today'}</button>
  </div>
  ${todayLogSummary(app)}

  ${lateNote}

  <section class="card">
    <h2>Next period</h2>
    <p class="big">${nextPeriodText(a)}</p>
    ${a.phase === 'menstrual'
      ? `<p class="muted">Next one around <b>${formatDate(a.nextStart)}</b></p>`
      : `<p class="muted">Around <b>${formatDate(a.nextStart)}</b>, likely ${formatDate(a.nextRange[0])} to ${formatDate(a.nextRange[1])}</p>`}
    <p class="confidence conf-${a.confidence.level}">
      <span class="pill">${a.confidence.label}</span>
      <span class="muted small">${a.cyclesUsed === 0 ? 'Using your settings until a full cycle is logged' : `Based on ${a.cyclesUsed} cycle${a.cyclesUsed === 1 ? '' : 's'}`}</span>
    </p>
  </section>

  ${forecastCard(app)}

  <p class="muted small center">Predictions are estimates. Orbit is not birth control.</p>`;
}

export function bind(app, root) {
  $('#log-today', root)?.addEventListener('click', () => app.openLog(app.today));
}

