import * as db from '../db.js';
import { $ } from '../ui.js';

export function render(app) {
  return `
  <section class="onboard">
    <img src="./icon-192.png" alt="" width="84" height="84" class="onboard-icon">
    <h1>Welcome to Orbit</h1>
    <p class="lead">A cycle tracker that keeps everything on your phone.</p>

    <ul class="promises">
      <li><b>No account.</b> No email, no sign-up, nothing to log into.</li>
      <li><b>No cloud.</b> Your data never leaves this device. There is no Orbit server.</li>
      <li><b>No tracking.</b> No ads, no analytics. The code is public so anyone can check.</li>
    </ul>

    <button id="start" class="wide">Start logging</button>
    <p class="muted small center">Orbit learns your cycle from what you log. No setup needed.</p>

    <details class="card setup">
      <summary>Optional: give Orbit a head start</summary>
      <form id="onboard-form">
        <p class="muted small">Predictions show up right away instead of after your first logged period. Skip anything you're not sure about.</p>
        <label class="field">
          <span>When did your last period start?</span>
          <input type="date" name="start" max="${app.today}">
        </label>
        <div class="field-row">
          <label class="field">
            <span>Usual cycle length</span>
            <input type="number" name="cycleLength" min="20" max="45" placeholder="28" inputmode="numeric">
          </label>
          <label class="field">
            <span>Usual period length</span>
            <input type="number" name="periodLength" min="2" max="10" placeholder="5" inputmode="numeric">
          </label>
        </div>
        <button type="submit" class="secondary wide">Save and start</button>
      </form>
    </details>

    <p class="muted small center">Orbit is a logging tool, not medical advice and not birth control.</p>
  </section>`;
}

export function bind(app, root) {
  $('#start', root).addEventListener('click', async () => {
    await db.saveSettings({ ...app.settings, onboarded: true });
    app.reload();
  });

  $('#onboard-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    // Blank fields keep the defaults (28 and 5).
    const num = (v, lo, hi, d) => (v === '' ? d : Math.min(hi, Math.max(lo, Math.round(Number(v)) || d)));
    const start = f.get('start');
    await db.saveSettings({
      ...app.settings,
      cycleLength: num(f.get('cycleLength'), 20, 45, app.settings.cycleLength),
      periodLength: num(f.get('periodLength'), 2, 10, app.settings.periodLength),
      onboarded: true,
    });
    if (start && start <= app.today) await db.put({ date: start, flow: 'medium' });
    app.reload();
  });
}
