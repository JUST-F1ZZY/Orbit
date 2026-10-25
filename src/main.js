import './style.css';
import * as db from './db.js';
import { analyze, symptomHistory } from './cycle.js';
import { today } from './dates.js';
import { $, closeSheet } from './ui.js';
import * as onboarding from './views/onboarding.js';
import * as todayView from './views/today.js';
import * as calendar from './views/calendar.js';
import * as insights from './views/insights.js';
import * as settingsView from './views/settings.js';
import { openLog } from './views/log.js';
import { renderLock, bindLock } from './lock.js';
import { KOFI_URL } from './config.js';

const VIEWS = {
  today: { label: 'Today', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="2.2" class="fill"/></svg>', view: todayView },
  calendar: { label: 'Calendar', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>', view: calendar },
  insights: { label: 'Insights', icon: '<svg viewBox="0 0 24 24"><path d="M5 20V12M12 20V5M19 20v-6"/></svg>', view: insights },
  settings: { label: 'Settings', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>', view: settingsView },
};

const app = {
  entries: [],
  byDate: new Map(),
  settings: db.DEFAULT_SETTINGS,
  analysis: null,
  history: null,
  today: today(),
  current: 'today',
  calendarMonth: null,
  unlocked: false,
  hiddenAt: 0,

  async reload() {
    this.today = today();
    [this.entries, this.settings] = await Promise.all([db.getAll(), db.getSettings()]);
    this.byDate = new Map(this.entries.map((e) => [e.date, e]));
    this.analysis = analyze(this.entries, this.settings, this.today);
    this.history = symptomHistory(this.entries, this.analysis);
    this.render();
  },

  go(name) {
    this.current = name;
    this.render();
    window.scrollTo(0, 0);
  },

  openLog(date) {
    openLog(this, date);
  },

  render() {
    // fresh element each time so old listeners get dropped
    const root = document.createElement('div');
    $('#app').replaceChildren(root);
    if (this.settings.pin && !this.unlocked) {
      closeSheet();
      root.innerHTML = renderLock();
      bindLock(this, root);
      $('#tabs')?.remove();
      $('#tip')?.remove();
      return;
    }
    if (!this.settings.onboarded) {
      root.innerHTML = onboarding.render(this);
      onboarding.bind(this, root);
      $('#tabs')?.remove();
      $('#tip')?.remove();
      return;
    }
    const { view } = VIEWS[this.current];
    root.innerHTML = view.render(this);
    view.bind?.(this, root);
    renderTabs(this);
  },
};

function renderTabs(a) {
  if (KOFI_URL && !$('#tip')) {
    const tip = document.createElement('a');
    tip.id = 'tip';
    tip.href = KOFI_URL;
    tip.target = '_blank';
    tip.rel = 'noopener noreferrer';
    tip.innerHTML = '<span aria-hidden="true">♥</span> Tip';
    tip.setAttribute('aria-label', 'Support Orbit with a tip on Ko-fi');
    document.body.append(tip);
  }
  let nav = $('#tabs');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'tabs';
    nav.setAttribute('aria-label', 'Main');
    document.body.append(nav);
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) a.go(b.dataset.tab);
    });
  }
  nav.innerHTML = Object.entries(VIEWS)
    .map(([id, v]) => `<button data-tab="${id}" class="${id === a.current ? 'active' : ''}" ${id === a.current ? 'aria-current="page"' : ''}>
      <span class="tab-icon" aria-hidden="true">${v.icon}</span><span>${v.label}</span></button>`)
    .join('');
}

// relock after 1 min in background, refresh if the day changed
const RELOCK_MS = 60000;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    app.hiddenAt = Date.now();
    return;
  }
  if (app.settings.pin && Date.now() - app.hiddenAt > RELOCK_MS) {
    app.unlocked = false;
    app.render();
  }
  if (today() !== app.today) app.reload();
});

db.requestPersistence();
app.reload();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});
