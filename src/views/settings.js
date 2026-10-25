import * as db from '../db.js';
import { KOFI_URL, SOURCE_URL, VERSION } from '../config.js';
import { $, toast } from '../ui.js';

export function render(app) {
  const s = app.settings;
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
  <header class="page-head"><h1>Settings</h1></header>

  ${installed ? '' : `<section class="card notice">
    <b>Add Orbit to your home screen.</b>
    <p class="muted small">On iPhone, Safari can delete website data after 7 days without use. Installed apps are protected. In Safari tap Share, then Add to Home Screen. On Android, use the browser menu and pick Install app.</p>
  </section>`}

  <section class="card">
    <h2>Your cycle</h2>
    <p class="muted small">Orbit starts with these numbers, then shifts toward your real pattern as you log.</p>
    <div class="field-row">
      <label class="field"><span>Usual cycle length</span>
        <input type="number" id="cycleLength" min="20" max="45" value="${s.cycleLength}" inputmode="numeric"></label>
      <label class="field"><span>Usual period length</span>
        <input type="number" id="periodLength" min="2" max="10" value="${s.periodLength}" inputmode="numeric"></label>
    </div>
    <button id="save-cycle" class="secondary">Save</button>
  </section>

  <section class="card">
    <h2>Backup</h2>
    <p class="muted small">Your data lives only on this phone. If you lose the phone or clear browser data without a backup, nobody can recover it, including me. Export now and then.</p>
    <div class="row">
      <button id="export">Export backup</button>
      <label class="button secondary">Import backup<input id="import" type="file" accept="application/json,.json" hidden></label>
    </div>
  </section>

  <section class="card">
    <h2>Privacy</h2>
    <p class="muted small">Orbit has no account, no server, no analytics, and no ads. A security policy built into the app blocks it from contacting any other server. The full source code is public, so anyone can check this.</p>
    <a class="link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">View the source code ↗</a>
  </section>

  <section class="card">
    <h2>About</h2>
    <p class="muted small">Hi, I'm Hunter. I build free health tools. I'm a guy, which is exactly why Orbit is built so that nobody, me included, ever sees your data.</p>
    <p class="muted small"><b>Orbit is not medical advice and not birth control.</b> Predictions are estimates from your own logs. If something about your cycle worries you, talk to a doctor or nurse.</p>
    ${KOFI_URL ? `<a class="link" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">If Orbit helped you, you can tip on Ko-fi ↗</a>` : ''}
  </section>

  <section class="card danger">
    <h2>Delete everything</h2>
    <p class="muted small">Erases every log and setting on this device. This can't be undone.</p>
    <button id="wipe" class="danger-btn">Delete all data</button>
  </section>

  <p class="muted small center">Orbit ${VERSION} · GPL-3.0</p>`;
}

export function bind(app, root) {
  $('#save-cycle', root).addEventListener('click', async () => {
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));
    await db.saveSettings({
      ...app.settings,
      cycleLength: clamp($('#cycleLength', root).value, 20, 45),
      periodLength: clamp($('#periodLength', root).value, 2, 10),
    });
    toast('Saved');
    app.reload();
  });
  $('#export', root).addEventListener('click', () => db.exportData());
  $('#import', root).addEventListener('change', async (e) => {
    try {
      const n = await db.importData(e.target.files[0]);
      toast(`Imported ${n} days`);
      app.reload();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  });
  $('#wipe', root).addEventListener('click', async () => {
    if (!confirm('Delete all of your Orbit data on this device? This cannot be undone.')) return;
    await db.deleteEverything();
    app.current = 'today';
    toast('All data deleted');
    app.reload();
  });
}
