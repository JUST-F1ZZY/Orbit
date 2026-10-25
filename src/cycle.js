// Orbit's prediction engine. Pure functions, no storage or DOM, so it can be
// unit tested (see tests/cycle.test.js).
//
// How it learns:
// 1. Period starts are found from logged bleeding days.
// 2. Cycle length = days between starts. Recent cycles count more.
// 3. Until there's enough history, the estimate leans on the user's
//    "typical cycle" setting (a prior). Each logged cycle shifts it toward
//    their real numbers.
// 4. Symptom forecasts come from which symptoms showed up at the same point
//    in past cycles, and how bad they were.

import { addDays, diffDays } from './dates.js';

export const SYMPTOMS = [
  { id: 'cramps', label: 'Cramps' },
  { id: 'headache', label: 'Headache' },
  { id: 'bloating', label: 'Bloating' },
  { id: 'breasts', label: 'Tender breasts' },
  { id: 'backache', label: 'Back pain' },
  { id: 'acne', label: 'Acne' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'nausea', label: 'Nausea' },
  { id: 'cravings', label: 'Cravings' },
  { id: 'insomnia', label: 'Poor sleep' },
  { id: 'anxious', label: 'Anxious' },
  { id: 'irritable', label: 'Irritable' },
];

export const SEVERITY = ['', 'mild', 'moderate', 'severe'];

export const symptomLabel = (id) => SYMPTOMS.find((s) => s.id === id)?.label ?? id;

const MIN_CYCLE = 15; // shorter gaps are treated as spotting or a logging slip
const MAX_CYCLE = 60; // longer gaps are likely missed logs, not a real cycle
const RECENCY = 0.85; // each older cycle counts 15% less than the one after it
const PRIOR_WEIGHT = 2; // the setting counts as much as two real cycles
const PRIOR_SD = 3;
const LUTEAL = 14; // days from ovulation to next period, fairly stable for most people

const isBleeding = (e) => e && e.flow && e.flow !== 'spotting';

// Finds each period as { start, end } from entries sorted by date.
// A logged bleeding day starts a new period when there was no bleeding in the
// 7 days before it, so one forgotten day mid-period doesn't split it in two.
export function findPeriods(entries) {
  const days = entries.filter(isBleeding).map((e) => e.date).sort();
  const periods = [];
  for (const date of days) {
    const last = periods[periods.length - 1];
    if (last && diffDays(last.end, date) <= 7) {
      // A 1-day gap is a forgotten log. Bleeding 3-7 days after the period
      // ended is likely spotting, so it doesn't stretch the period.
      if (diffDays(last.end, date) <= 2) last.end = date;
      continue;
    }
    periods.push({ start: date, end: date });
  }
  return periods;
}

// Weighted mean and standard deviation, blended with a prior.
function blend(values, prior, priorSd) {
  let wSum = PRIOR_WEIGHT;
  let mSum = PRIOR_WEIGHT * prior;
  values.forEach((v, i) => {
    const w = RECENCY ** (values.length - 1 - i);
    wSum += w;
    mSum += w * v;
  });
  const mean = mSum / wSum;
  let vSum = PRIOR_WEIGHT * priorSd ** 2;
  values.forEach((v, i) => {
    const w = RECENCY ** (values.length - 1 - i);
    vSum += w * (v - mean) ** 2;
  });
  return { mean, sd: Math.max(1, Math.sqrt(vSum / wSum)) };
}

// The main entry point. Returns everything the screens need.
export function analyze(entries, settings, todayISO) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const periods = findPeriods(sorted);

  const cycles = [];
  const outliers = [];
  for (let i = 1; i < periods.length; i++) {
    const len = diffDays(periods[i - 1].start, periods[i].start);
    const cycle = { start: periods[i - 1].start, length: len };
    (len >= MIN_CYCLE && len <= MAX_CYCLE ? cycles : outliers).push(cycle);
  }
  const recent = cycles.slice(-12);
  const cycleStats = blend(recent.map((c) => c.length), settings.cycleLength, PRIOR_SD);

  // Only finished periods teach us period length (not the one happening now).
  // A single logged day is usually an incomplete log, so it's skipped too.
  const finished = periods.filter((p) => diffDays(p.end, todayISO) > 2 && p.end !== p.start).slice(-6);
  const periodStats = blend(
    finished.map((p) => diffDays(p.start, p.end) + 1),
    settings.periodLength,
    1.5,
  );

  const cycleLength = Math.round(cycleStats.mean);
  const periodLength = Math.min(10, Math.max(2, Math.round(periodStats.mean)));
  const spread = Math.round(cycleStats.sd);

  const lastPeriod = periods[periods.length - 1] || null;
  const result = {
    periods,
    cycles,
    outliers,
    cycleLength,
    periodLength,
    spread,
    confidence: confidence(recent.length, cycleStats.sd),
    cyclesUsed: recent.length,
    lastPeriod,
  };
  if (!lastPeriod) return result;

  const nextStart = addDays(lastPeriod.start, cycleLength);
  result.today = todayISO;
  // "Period ended" tapped on or after the last bleeding day: stop treating it as ongoing.
  result.endedMarked = sorted.some((e) => e.periodEnded && e.date >= lastPeriod.end && e.date <= todayISO);
  result.periodOngoing = !result.endedMarked && diffDays(lastPeriod.end, todayISO) <= 1;
  result.projectedStart = nextStart > todayISO ? nextStart : addDays(todayISO, 1);
  result.cycleDay = diffDays(lastPeriod.start, todayISO) + 1;
  result.nextStart = nextStart;
  result.nextRange = [addDays(nextStart, -spread), addDays(nextStart, spread)];
  result.daysUntilNext = diffDays(todayISO, nextStart);
  result.lateBy = Math.max(0, diffDays(result.nextRange[1], todayISO));
  result.ovulation = addDays(nextStart, -LUTEAL);
  result.phase = phaseOn(todayISO, result);
  return result;
}

function confidence(n, sd) {
  if (n < 2) return { level: 'low', label: 'Still learning' };
  if (n < 4 || sd > 4) return { level: 'medium', label: 'Getting there' };
  return { level: 'high', label: 'Confident' };
}

export const PHASES = {
  menstrual: { label: 'Period', blurb: 'Your period. Energy is often lower, so go easy on yourself.' },
  follicular: { label: 'Follicular', blurb: 'After your period. Energy and mood often pick up.' },
  ovulation: { label: 'Ovulation (est.)', blurb: 'Estimated ovulation window. This is a guess from past cycles, not a fertility test.' },
  luteal: { label: 'Luteal', blurb: 'Before your next period. PMS symptoms tend to show up here.' },
};

// Phase for an offset into a cycle of a given length.
function classify(offset, length, periodLength) {
  if (offset < periodLength) return 'menstrual';
  const ov = length - LUTEAL;
  if (offset >= ov - 2 && offset <= ov + 1) return 'ovulation';
  return offset < ov - 2 ? 'follicular' : 'luteal';
}

// Finds which cycle a date belongs to. Past and current dates use the last
// real period. Dates past the predicted start are projected forward in whole
// predicted cycles. If the period is overdue, projections start tomorrow.
function locate(dateISO, a) {
  const lastStart = a.lastPeriod.start;
  const offset = diffDays(lastStart, dateISO);
  if (offset < a.cycleLength || dateISO <= a.today) {
    return { start: lastStart, offset, projected: false };
  }
  const projStart = a.projectedStart;
  const k = Math.floor(diffDays(projStart, dateISO) / a.cycleLength);
  const start = addDays(projStart, k * a.cycleLength);
  return { start, offset: diffDays(start, dateISO), projected: true };
}

// Which phase a date falls in (null before the first logged period).
export function phaseOn(dateISO, a) {
  if (!a.lastPeriod || dateISO < a.lastPeriod.start) return null;
  if (dateISO <= a.lastPeriod.end) return 'menstrual';
  const { offset, projected } = locate(dateISO, a);
  // Overdue: still the end of the current cycle, period expected any day.
  if (!projected && offset >= a.cycleLength) return 'luteal';
  // Early in the current cycle: it's still the period only if bleeding was
  // logged today or yesterday and it wasn't marked as ended.
  if (!projected && offset < a.periodLength) {
    return a.periodOngoing ? 'menstrual' : 'follicular';
  }
  return classify(offset, a.cycleLength, a.periodLength);
}

// Days the calendar should mark as a predicted period, for the next few cycles.
export function predictedPeriodDays(a, count = 3) {
  if (!a.nextStart) return new Set();
  const days = new Set();
  for (let c = 0; c < count; c++) {
    const start = addDays(a.projectedStart, c * a.cycleLength);
    for (let d = 0; d < a.periodLength; d++) days.add(addDays(start, d));
  }
  return days;
}

// Where a day sits in its cycle. Early days are measured from the start and
// late days from the end, so PMS lines up across cycles of different lengths.
function slot(offset, length) {
  return offset < length / 2 ? `s${offset}` : `e${length - offset}`;
}

// Builds, for each symptom and cycle slot, how often it happened and how bad.
// Only finished cycles are used, and only ones the user actually logged in.
export function symptomHistory(entries, a) {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const history = { cycles: 0, slots: {} };
  for (const c of a.cycles.slice(-12)) {
    let logged = 0;
    const seen = {};
    for (let off = 0; off < c.length; off++) {
      const e = byDate.get(addDays(c.start, off));
      if (!e) continue;
      logged++;
      const key = slot(off, c.length);
      for (const [sym, sev] of Object.entries(e.symptoms || {})) {
        if (!sev) continue;
        (seen[sym] ||= {})[key] = sev;
      }
    }
    if (logged < 3) continue;
    history.cycles++;
    for (const [sym, keys] of Object.entries(seen)) {
      for (const [key, sev] of Object.entries(keys)) {
        const s = ((history.slots[sym] ||= {})[key] ||= { count: 0, sevSum: 0 });
        s.count++;
        s.sevSum += sev;
      }
    }
  }
  return history;
}

// Forecast for one date: symptoms that showed up within a day of this point
// in at least half of the past cycles, with their usual severity.
export function forecastDay(dateISO, a, history) {
  if (!a.lastPeriod || history.cycles < 2) return [];
  const { offset } = locate(dateISO, a);
  if (offset < 0 || offset >= a.cycleLength) return [];
  const out = [];
  for (const [sym, slots] of Object.entries(history.slots)) {
    let count = 0;
    let sevSum = 0;
    for (const off of [offset - 1, offset, offset + 1]) {
      if (off < 0 || off >= a.cycleLength) continue;
      const s = slots[slot(off, a.cycleLength)];
      if (s && s.count > count) {
        count = s.count;
        sevSum = s.sevSum;
      }
    }
    const chance = count / history.cycles;
    if (chance >= 0.5) {
      out.push({ symptom: sym, chance, severity: Math.round(sevSum / count), count, of: history.cycles });
    }
  }
  return out.sort((x, y) => y.chance - x.chance || y.severity - x.severity);
}

// Next `days` days of forecasts, grouped by symptom so the screen can say
// "Cramps likely Nov 3–5, usually moderate" instead of repeating each day.
export function forecastAhead(todayISO, a, history, days = 7) {
  const bySym = {};
  for (let i = 0; i < days; i++) {
    const date = addDays(todayISO, i);
    for (const f of forecastDay(date, a, history)) {
      const g = (bySym[f.symptom] ||= { ...f, from: date, to: date, sevMax: f.severity });
      g.to = date;
      g.sevMax = Math.max(g.sevMax, f.severity);
      g.chance = Math.max(g.chance, f.chance);
    }
  }
  return Object.values(bySym).sort((x, y) => y.chance - x.chance);
}

// Per-phase averages for the Insights screen.
export function phaseSummary(entries, a) {
  const phases = {};
  for (const e of entries) {
    const p = pastPhase(e.date, a);
    if (!p) continue;
    const s = (phases[p] ||= { days: 0, symptoms: {}, mood: [], energy: [] });
    s.days++;
    for (const [sym, sev] of Object.entries(e.symptoms || {})) {
      if (!sev) continue;
      const t = (s.symptoms[sym] ||= { count: 0, sevSum: 0 });
      t.count++;
      t.sevSum += sev;
    }
    if (e.mood) s.mood.push(e.mood);
    if (e.energy) s.energy.push(e.energy);
  }
  return phases;
}

// Phase of a past date using the real cycle it belonged to.
function pastPhase(dateISO, a) {
  const period = [...a.periods].reverse().find((p) => p.start <= dateISO);
  if (!period) return null;
  if (dateISO <= period.end) return 'menstrual';
  const idx = a.periods.indexOf(period);
  const next = a.periods[idx + 1];
  const length = next ? diffDays(period.start, next.start) : a.cycleLength;
  if (length > MAX_CYCLE) return null;
  // Period days were handled above, so pass 0 for period length.
  return classify(diffDays(period.start, dateISO), length, 0);
}
