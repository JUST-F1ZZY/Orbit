// PIN lock. only a salted PBKDF2 hash is stored.
// NOTE: doesn't encrypt anything, it just keeps people out of the UI

import * as db from './db.js';
import { $, toast } from './ui.js';

const ITERATIONS = 150000;
const MAX_TRIES = 5;
const LOCKOUT_MS = 30000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin, saltHex) {
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return hex(bits);
}

export async function makePin(pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await hashPin(pin, salt) };
}

export const checkPin = async (pin, stored) => (await hashPin(pin, stored.salt)) === stored.hash;

export const validPin = (pin) => /^\d{4,8}$/.test(pin);

let tries = 0;
let lockedUntil = 0;

export function renderLock() {
  return `
  <section class="lock">
    <img src="./icon-192.png" alt="" width="72" height="72" class="onboard-icon">
    <h1>Orbit is locked</h1>
    <form id="unlock" autocomplete="off">
      <label class="field">
        <span class="sr-only">PIN</span>
        <input id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Enter your PIN" autofocus>
      </label>
      <button type="submit" class="wide">Unlock</button>
      <p id="lock-msg" class="muted small center" role="status"></p>
    </form>
    <button id="forgot" class="link-btn">Forgot your PIN?</button>
  </section>`;
}

export function bindLock(app, root) {
  const msg = $('#lock-msg', root);
  $('#unlock', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (Date.now() < lockedUntil) {
      msg.textContent = `Too many tries. Wait ${Math.ceil((lockedUntil - Date.now()) / 1000)} seconds.`;
      return;
    }
    const input = $('#pin', root);
    if (await checkPin(input.value, app.settings.pin)) {
      tries = 0;
      app.unlocked = true;
      app.render();
      return;
    }
    tries++;
    input.value = '';
    if (tries >= MAX_TRIES) {
      tries = 0;
      lockedUntil = Date.now() + LOCKOUT_MS;
      msg.textContent = 'Too many tries. Wait 30 seconds.';
    } else {
      msg.textContent = 'Wrong PIN';
    }
  });
  $('#forgot', root).addEventListener('click', async () => {
    const ok = confirm(
      "There's no way to recover a PIN, because Orbit has no server and no account. " +
        'The only option is to erase all Orbit data on this device and start fresh. Erase everything?',
    );
    if (!ok) return;
    await db.deleteEverything();
    app.unlocked = true;
    toast('Orbit was reset');
    app.reload();
  });
}
