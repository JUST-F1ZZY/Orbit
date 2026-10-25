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

    <form id="onboard-form" class="card">
      <h2>Quick start</h2>
      <p class="muted">This gives Orbit a starting point. It learns your real pattern as you log.</p>

      <label class="field">
        <span>When did your last period start?</span>
        <input type="date" name="start" max="${app.today}">
      </label>

      <div class="field-row">
        <label class="field">
          <span>Usual cycle length</span>
          <input type="number" name="cycleLength" min="20" max="45" value="28" inputmode="numeric">
        </label>
        <label class="field">
          <span>Usual period length</span>
          <input type="number" name="periodLength" min="2" max="10" value="5" inputmode="numeric">
        </label>
      </div>
      <p class="muted small">Not sure? Leave 28 and 5. Those are typical, and Orbit adjusts after a cycle or two.</p>

      <button type="submit" class="wide">Start tracking</button>
    </form>

    <p class="muted small center">Orbit is a logging tool, not medical advice and not birth control.</p>
  </section>`;
}

export function bind(app, root) {
  $('#onboard-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number(v) || d));
    const start = f.get('start');
    await db.saveSettings({
      cycleLength: clamp(f.get('cycleLength'), 20, 45, 28),
      periodLength: clamp(f.get('periodLength'), 2, 10, 5),
      onboarded: true,
    });
    if (start && start <= app.today) await db.put({ date: start, flow: 'medium' });
    app.reload();
  });
}
