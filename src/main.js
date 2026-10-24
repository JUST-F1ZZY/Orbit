import './style.css';
import { requestPersistence, exportData, importData } from './db.js';

// Placeholder shell. The real tracker screens replace this.
const app = document.getElementById('app');

const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

app.innerHTML = `
  <header class="hero">
    <img src="./icon-192.png" alt="" width="72" height="72">
    <h1>Orbit</h1>
    <p>Your cycle, on your device. Nobody else's business.</p>
  </header>

  ${installed ? '' : `
  <section class="card notice">
    <b>Add Orbit to your home screen.</b>
    On iPhone, Safari can delete website data after 7 days without use. Installed apps are protected.
  </section>`}

  <section class="card">
    <h2>Your data</h2>
    <p>Everything stays on this phone. There's no account and no cloud, so back it up yourself now and then.</p>
    <div class="row">
      <button id="export">Export backup</button>
      <label class="button secondary">Import<input id="import" type="file" accept="application/json" hidden></label>
    </div>
    <p id="status" class="muted" role="status"></p>
  </section>

  <footer class="muted">
    Orbit is a logging tool, not medical advice, and not birth control. Predictions are estimates.
  </footer>
`;

const status = document.getElementById('status');
document.getElementById('export').addEventListener('click', () => exportData());
document.getElementById('import').addEventListener('change', async (e) => {
  try {
    const n = await importData(e.target.files[0]);
    status.textContent = `Imported ${n} days.`;
  } catch (err) {
    status.textContent = err.message;
  }
});

requestPersistence();
