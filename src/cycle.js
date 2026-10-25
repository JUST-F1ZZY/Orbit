// prediction engine - pure functions, tested in tests/cycle.test.js

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

// new period = bleeding with none in the previous 7 days
export function findPeriods(entries) {
  const days = entries.filter(isBleeding).map((e) => e.date).sort();
  const periods = [];
  for (const date of days) {
    const last = periods[periods.length - 1];
    if (last && diffDays(last.end, date) <= 7) {
      // 1 day gap = forgot to log. 3-7 days later = probably spotting, ignore
      if (diffDays(last.end, date) <= 2) last.end = date;
      continue;
    }
    periods.push({ start: date, end: date });
  }
  return periods;
}

// weighted mean/sd, with the settings value counted as PRIOR_WEIGHT cycles
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

  // skip the current period and single-day logs (usually incomplete)
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

function classify(offset, length, periodLength) {
  if (offset < periodLength) return 'menstrual';
  const ov = length - LUTEAL;
  if (offset >= ov - 2 && offset <= ov + 1) return 'ovulation';
  return offset < ov - 2 ? 'follicular' : 'luteal';
}

// future dates get projected forward in whole cycles (from tomorrow if late)
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

export function phaseOn(dateISO, a) {
  if (!a.lastPeriod || dateISO < a.lastPeriod.start) return null;
  if (dateISO <= a.lastPeriod.end) return 'menstrual';
  const { offset, projected } = locate(dateISO, a);
  // late
  if (!projected && offset >= a.cycleLength) return 'luteal';
  if (!projected && offset < a.periodLength) {
    return a.periodOngoing ? 'menstrual' : 'follicular';
  }
  return classify(offset, a.cycleLength, a.periodLength);
}

export function predictedPeriodDays(a, count = 3) {
  if (!a.nextStart) return new Set();
  const days = new Set();
  for (let c = 0; c < count; c++) {
    const start = addDays(a.projectedStart, c * a.cycleLength);
    for (let d = 0; d < a.periodLength; d++) days.add(addDays(start, d));
  }
  return days;
}

// first half counts from the start, second half from the end,
// so PMS lines up even when cycle lengths differ
function slot(offset, length) {
  return offset < length / 2 ? `s${offset}` : `e${length - offset}`;
}

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

// symptom shows up if it happened (+-1 day) in at least half of past cycles
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

function pastPhase(dateISO, a) {
  const period = [...a.periods].reverse().find((p) => p.start <= dateISO);
  if (!period) return null;
  if (dateISO <= period.end) return 'menstrual';
  const idx = a.periods.indexOf(period);
  const next = a.periods[idx + 1];
  const length = next ? diffDays(period.start, next.start) : a.cycleLength;
  if (length > MAX_CYCLE) return null;
  return classify(diffDays(period.start, dateISO), length, 0);
}
