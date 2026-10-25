import * as db from '../db.js';
import { SYMPTOMS, SEVERITY } from '../cycle.js';
import { formatDate } from '../dates.js';
import { $, $$, esc, openSheet, closeSheet, toast } from '../ui.js';

const FLOWS = [
  ['', 'None'],
  ['spotting', 'Spotting'],
  ['light', 'Light'],
  ['medium', 'Medium'],
  ['heavy', 'Heavy'],
];
const MOODS = [
  [5, '😄', 'Great'],
  [4, '🙂', 'Good'],
  [3, '😐', 'Okay'],
  [2, '😕', 'Low'],
  [1, '😢', 'Rough'],
];
const ENERGY = [
  [1, 'Low'],
  [2, 'Medium'],
  [3, 'High'],
];

function chips(name, options, selected) {
  return options
    .map(([value, ...rest]) => {
      const label = rest.length === 2 ? `<span aria-hidden="true">${rest[0]}</span> ${rest[1]}` : rest[0];
      return `<button type="button" class="chip" data-group="${name}" data-value="${value}" aria-pressed="${String(value) === String(selected ?? '')}">${label}</button>`;
    })
    .join('');
}

// The daily log. Symptoms cycle through off → mild → moderate → severe on tap.
export function openLog(app, date) {
  const e = app.byDate.get(date) || { date };
  const symptoms = { ...(e.symptoms || {}) };
  const isToday = date === app.today;

  const sheet = openSheet(`
    <header class="sheet-head">
      <div>
        <p class="muted small">${isToday ? 'Today' : formatDate(date, { weekday: 'long' })}</p>
        <h2>${formatDate(date, { month: 'long', day: 'numeric' })}</h2>
      </div>
      <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
    </header>

    <h3>Bleeding</h3>
    <div class="chips" role="group" aria-label="Bleeding">${chips('flow', FLOWS, e.flow || '')}</div>

    <h3>Symptoms <span class="muted small">tap again for worse</span></h3>
    <div class="chips symptoms" role="group" aria-label="Symptoms">
      ${SYMPTOMS.map((s) => `<button type="button" class="chip sym" data-sym="${s.id}" data-sev="${symptoms[s.id] || 0}">
        ${s.label}<span class="dots" aria-hidden="true"></span><span class="sr-only sev-text"></span></button>`).join('')}
    </div>

    <h3>Mood</h3>
    <div class="chips" role="group" aria-label="Mood">${chips('mood', MOODS, e.mood)}</div>

    <h3>Energy</h3>
    <div class="chips" role="group" aria-label="Energy">${chips('energy', ENERGY, e.energy)}</div>

    <h3>Note</h3>
    <textarea id="note" rows="2" maxlength="500" placeholder="Anything else worth remembering">${esc(e.note)}</textarea>

    <div class="row sheet-actions">
      <button type="button" id="save" class="wide">Save</button>
      ${app.byDate.has(date) ? '<button type="button" id="clear" class="secondary">Clear day</button>' : ''}
    </div>
  `);

  const values = { flow: e.flow || '', mood: e.mood ?? '', energy: e.energy ?? '' };

  const paintSym = (btn) => {
    const sev = Number(btn.dataset.sev);
    btn.classList.toggle('on', sev > 0);
    btn.setAttribute('aria-pressed', String(sev > 0));
    $('.dots', btn).textContent = sev ? '•'.repeat(sev) : '';
    $('.sev-text', btn).textContent = sev ? `, ${SEVERITY[sev]}` : '';
  };
  $$('.sym', sheet).forEach(paintSym);

  sheet.addEventListener('click', async (ev) => {
    const chip = ev.target.closest('[data-group]');
    if (chip) {
      const g = chip.dataset.group;
      // Tapping the selected mood or energy again clears it.
      const v = values[g] === chip.dataset.value && g !== 'flow' ? '' : chip.dataset.value;
      values[g] = v;
      $$(`[data-group="${g}"]`, sheet).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.value === v)));
      return;
    }
    const sym = ev.target.closest('.sym');
    if (sym) {
      const next = (Number(sym.dataset.sev) + 1) % 4;
      sym.dataset.sev = next;
      symptoms[sym.dataset.sym] = next;
      paintSym(sym);
      return;
    }
    if (ev.target.id === 'save') {
      const clean = Object.fromEntries(Object.entries(symptoms).filter(([, v]) => v > 0));
      const note = $('#note', sheet).value.trim();
      const entry = {
        date,
        ...(values.flow && { flow: values.flow }),
        ...(Object.keys(clean).length && { symptoms: clean }),
        ...(values.mood !== '' && { mood: Number(values.mood) }),
        ...(values.energy !== '' && { energy: Number(values.energy) }),
        ...(note && { note }),
        ...(e.periodEnded && { periodEnded: true }),
      };
      if (Object.keys(entry).length === 1) await db.remove(date);
      else await db.put(entry);
      closeSheet();
      toast('Saved');
      app.reload();
    }
    if (ev.target.id === 'clear') {
      await db.remove(date);
      closeSheet();
      toast('Day cleared');
      app.reload();
    }
  });
}
