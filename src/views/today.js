import { PHASES, SEVERITY, forecastAhead, symptomLabel as symLabel } from '../cycle.js';
import * as db from '../db.js';
import { formatDate, addDays, diffDays } from '../dates.js';
import { $, esc, toast } from '../ui.js';
import { KOFI_URL, SUPPORT_NOTE } from '../config.js';

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

function quickActions(app) {
  const a = app.analysis;
  const e = app.byDate.get(app.today);
  const bleedingToday = e?.flow && e.flow !== 'spotting';
  const log = `<button id="log-today" class="secondary">${e ? 'Edit today' : 'Log today'}</button>`;
  let main = '';
  if (a.periodOngoing) {
    main = (bleedingToday ? '' : '<button data-action="still">Still bleeding</button>') +
      '<button data-action="ended" class="secondary">Period ended</button>';
  } else if (a.phase === 'menstrual') {
    main = '';
  } else {
    main = '<button data-action="started">Period started</button>';
  }
  return `<div class="row center-row quick">${main}${log}</div>`;
}

function backupNudge(app) {
  const s = app.settings;
  if (app.entries.length < 5) return '';
  if (s.backupSnoozedUntil && app.today < s.backupSnoozedUntil) return '';
  const age = s.lastBackup ? diffDays(s.lastBackup, app.today) : null;
  if (age !== null && age < 30) return '';
  return `<section class="card notice">
    <b>${age === null ? "You haven't backed up yet" : `Last backup was ${age} days ago`}</b>
    <p class="muted small">Your data only lives on this phone. A backup file is the only way to get it back if the phone is lost.</p>
    <div class="row"><button data-action="backup">Back up now</button><button data-action="snooze" class="secondary">Later</button></div>
  </section>`;
}

// only shows once, after 2 cycles
function supportCard(app) {
  if (!KOFI_URL || app.settings.supportCardDone || app.analysis.cycles.length < 2) return '';
  return `<section class="card support">
    <b>Orbit has tracked ${app.analysis.cycles.length} of your cycles 💗</b>
    <p class="muted small">${SUPPORT_NOTE}</p>
    <p class="muted small">If it's been useful, a tip of any size helps. This is the only time Orbit will ask.</p>
    <div class="row">
      <a class="button" data-action="support" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">Support on Ko-fi</a>
      <button data-action="support-dismiss" class="secondary">No thanks</button>
    </div>
  </section>`;
}

export function render(app) {
  const a = app.analysis;
  const header = `<header class="page-head"><p class="muted">${formatDate(app.today, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>Today</h1></header>`;

  if (!a.lastPeriod) {
    return `${header}
    <section class="card center">
      <h2>Start logging</h2>
      <p class="muted">Log how you feel any day. Once you mark a period, Orbit starts predicting from there.</p>
      <div class="row center-row">
        <button data-action="started">Period started today</button>
        <button id="log-today" class="secondary">Log today</button>
      </div>
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

  ${quickActions(app)}
  ${todayLogSummary(app)}

  ${lateNote}
  ${backupNudge(app)}
  ${supportCard(app)}

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
  root.addEventListener('click', async (ev) => {
    const action = ev.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    const merge = (date, fields) => db.put({ ...(app.byDate.get(date) || { date }), ...fields });
    const bleeding = (date) => {
      const flow = app.byDate.get(date)?.flow;
      return flow && flow !== 'spotting' ? flow : 'medium';
    };
    if (action === 'started') {
      await merge(app.today, { flow: bleeding(app.today), periodEnded: undefined });
      toast('Period started. Tap Edit today to change the flow.');
    }
    if (action === 'still') {
      // fill in a day or two if they forgot
      const end = app.analysis.lastPeriod.end;
      const from = diffDays(end, app.today) <= 2 ? addDays(end, 1) : app.today;
      for (let d = from; d <= app.today; d = addDays(d, 1)) await merge(d, { flow: bleeding(d) });
      toast('Logged');
    }
    if (action === 'backup') {
      if (!(await db.exportData())) return;
      toast('Backup saved');
    }
    if (action === 'snooze') {
      await db.saveSettings({ ...app.settings, backupSnoozedUntil: addDays(app.today, 7) });
    }
    if (action === 'support' || action === 'support-dismiss') {
      await db.saveSettings({ ...app.settings, supportCardDone: true });
      if (action === 'support-dismiss') toast('No problem. Thanks for using Orbit');
    }
    if (action === 'ended') {
      await merge(app.today, { periodEnded: true });
      toast('Period marked as ended');
    }
    app.reload();
  });
}

