import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../src/dates.js';
import { analyze, findPeriods, phaseOn, symptomHistory, forecastDay, forecastAhead, predictedPeriodDays } from '../src/cycle.js';

const settings = { cycleLength: 28, periodLength: 5 };

// Builds entries for periods starting on the given dates, each `len` days long.
function periodsAt(starts, len = 5, extra = () => ({})) {
  const entries = [];
  for (const s of starts) {
    for (let d = 0; d < len; d++) entries.push({ date: addDays(s, d), flow: 'medium', ...extra(d) });
  }
  return entries;
}

test('findPeriods joins a forgotten day but ignores spotting', () => {
  const entries = [
    { date: '2026-01-01', flow: 'heavy' },
    { date: '2026-01-03', flow: 'medium' }, // Jan 2 forgotten
    { date: '2026-01-04', flow: 'spotting' },
    { date: '2026-01-08', flow: 'light' }, // breakthrough bleed, not a new period
    { date: '2026-01-29', flow: 'heavy' },
  ];
  assert.deepEqual(findPeriods(entries), [
    { start: '2026-01-01', end: '2026-01-03' },
    { start: '2026-01-29', end: '2026-01-29' },
  ]);
});

test('with no history, predictions use the settings', () => {
  const a = analyze(periodsAt(['2026-03-01']), settings, '2026-03-10');
  assert.equal(a.cycleLength, 28);
  assert.equal(a.nextStart, '2026-03-29');
  assert.equal(a.cycleDay, 10);
  assert.equal(a.confidence.level, 'low');
});

test('learns a 32-day cycle and gets more confident', () => {
  const starts = [0, 32, 64, 96, 128, 160].map((n) => addDays('2026-01-01', n));
  const a = analyze(periodsAt(starts), settings, addDays(starts[5], 3));
  assert.ok(a.cycleLength >= 31 && a.cycleLength <= 32, `got ${a.cycleLength}`);
  assert.equal(a.confidence.level, 'high');
  assert.equal(a.periodLength, 5);
});

test('recent cycles count more than old ones', () => {
  // Old cycles were 26 days, the last three were 31.
  const gaps = [26, 26, 26, 31, 31, 31];
  const starts = ['2026-01-01'];
  for (const g of gaps) starts.push(addDays(starts[starts.length - 1], g));
  const a = analyze(periodsAt(starts), settings, addDays(starts[6], 2));
  assert.ok(a.cycleLength >= 29, `got ${a.cycleLength}`);
});

test('a 90-day gap (missed logging) is ignored as an outlier', () => {
  const a = analyze(periodsAt(['2026-01-01', '2026-01-29', '2026-04-29']), settings, '2026-05-02');
  assert.equal(a.outliers.length, 1);
  assert.equal(a.cyclesUsed, 1);
});

test('phases across a cycle, including a projected future one', () => {
  const a = analyze(periodsAt(['2026-03-01']), settings, '2026-03-03');
  assert.equal(phaseOn('2026-03-03', a), 'menstrual');
  assert.equal(phaseOn('2026-03-04', a), 'menstrual'); // predicted, period day 4 of 5
  assert.equal(phaseOn('2026-03-08', a), 'follicular');
  assert.equal(phaseOn('2026-03-15', a), 'ovulation'); // 28 - 14 = day 15
  assert.equal(phaseOn('2026-03-20', a), 'luteal');
  assert.equal(phaseOn('2026-03-29', a), 'menstrual'); // next predicted period
  assert.equal(phaseOn('2026-02-27', a), null);
});

test('an overdue period stays luteal and projections move to tomorrow', () => {
  const a = analyze(periodsAt(['2026-03-01']), settings, '2026-04-05');
  assert.ok(a.lateBy > 0);
  assert.equal(phaseOn('2026-04-05', a), 'luteal');
  assert.ok(predictedPeriodDays(a).has('2026-04-06'));
});

test('forecasts cramps at the start and headaches before the period', () => {
  const starts = [0, 28, 56, 84].map((n) => addDays('2026-01-01', n));
  const entries = periodsAt(starts, 5, (d) => (d < 2 ? { symptoms: { cramps: 2 } } : {}));
  // Headaches logged 2 days before each of the last three periods.
  for (const s of starts.slice(1)) entries.push({ date: addDays(s, -2), symptoms: { headache: 3 } });
  const a = analyze(entries, settings, addDays(starts[3], 20));
  const h = symptomHistory(entries, a);
  assert.equal(h.cycles, 3);

  const day1 = forecastDay(a.nextStart, a, h);
  assert.equal(day1[0].symptom, 'cramps');
  assert.equal(day1[0].severity, 2);

  const before = forecastDay(addDays(a.nextStart, -2), a, h).find((f) => f.symptom === 'headache');
  assert.equal(before.severity, 3);
  assert.equal(before.chance, 1);

  const ahead = forecastAhead(addDays(a.nextStart, -3), a, h, 7).map((f) => f.symptom);
  assert.deepEqual(ahead.sort(), ['cramps', 'headache']);
});

test('no symptom forecasts until two cycles are logged', () => {
  const entries = periodsAt(['2026-01-01', '2026-01-29'], 5, () => ({ symptoms: { cramps: 1 } }));
  const a = analyze(entries, settings, '2026-02-05');
  assert.deepEqual(forecastDay('2026-02-26', a, symptomHistory(entries, a)), []);
});

test('a single logged period day does not drag the learned period length down', () => {
  const base = periodsAt(['2026-01-01', '2026-01-29', '2026-02-26'], 7);
  const withSingle = [...base, { date: '2026-03-26', flow: 'medium' }];
  const a = analyze(base, settings, '2026-04-10');
  const b = analyze(withSingle, settings, '2026-04-10');
  assert.equal(a.periodLength, 6);
  assert.equal(b.periodLength, a.periodLength);
});

test('a period that stopped early is not extended to the usual length', () => {
  const a = analyze(periodsAt(['2026-03-01'], 2), settings, '2026-03-04');
  assert.equal(phaseOn('2026-03-04', a), 'follicular');
  const b = analyze(periodsAt(['2026-03-01'], 3), settings, '2026-03-03');
  assert.equal(phaseOn('2026-03-04', b), 'menstrual');
});
