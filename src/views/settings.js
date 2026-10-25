import * as db from '../db.js';
import { KOFI_URL, SUPPORT_NOTE, SOURCE_URL, VERSION } from '../config.js';
import { makePin, validPin } from '../lock.js';
import { formatDate } from '../dates.js';
import { $, toast, openSheet, closeSheet } from '../ui.js';

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
    <p class="small"><b>Last backup:</b> ${s.lastBackup ? formatDate(s.lastBackup, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never'}</p>
    <div class="row">
      <button id="export">Export backup</button>
      <label class="button secondary">Import backup<input id="import" type="file" accept="application/json,.json" hidden></label>
    </div>
  </section>

  <section class="card">
    <h2>App lock</h2>
    <p class="muted small">Ask for a PIN when Orbit opens, and again after a minute in the background. It stops someone casually opening Orbit on your phone. It doesn't encrypt your data, and a forgotten PIN can't be recovered.</p>
    <div class="row">
      ${s.pin
        ? '<button id="pin-set" class="secondary">Change PIN</button><button id="pin-off" class="secondary">Turn off</button>'
        : '<button id="pin-set" class="secondary">Set a PIN</button>'}
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
    ${KOFI_URL ? `<p class="muted small">${SUPPORT_NOTE}</p>
    <a class="link" href="${KOFI_URL}" target="_blank" rel="noopener noreferrer">If Orbit helped you, you can tip on Ko-fi ↗</a>` : ''}
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
  $('#export', root).addEventListener('click', async () => {
    if (await db.exportData()) {
      toast('Backup saved');
      app.reload();
    }
  });

  $('#pin-set', root).addEventListener('click', () => {
    const sheet = openSheet(`
      <header class="sheet-head"><h2>${app.settings.pin ? 'Change PIN' : 'Set a PIN'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <form id="pin-form" autocomplete="off">
        <label class="field"><span>New PIN (4 to 8 digits)</span>
          <input id="pin1" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8"></label>
        <label class="field"><span>Type it again</span>
          <input id="pin2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8"></label>
        <p class="muted small">Write it down somewhere safe. If you forget it, the only fix is erasing Orbit's data.</p>
        <button type="submit" class="wide">Save PIN</button>
      </form>`);
    $('#pin-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = $('#pin1', sheet).value;
      if (!validPin(p1)) return toast('Use 4 to 8 digits');
      if (p1 !== $('#pin2', sheet).value) return toast("The PINs don't match");
      await db.saveSettings({ ...app.settings, pin: await makePin(p1) });
      app.unlocked = true;
      closeSheet();
      toast('PIN set');
      app.reload();
    });
  });
  $('#pin-off', root)?.addEventListener('click', async () => {
    if (!confirm('Turn off the PIN lock?')) return;
    const { pin, ...rest } = app.settings;
    await db.saveSettings(rest);
    toast('PIN lock off');
    app.reload();
  });
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
