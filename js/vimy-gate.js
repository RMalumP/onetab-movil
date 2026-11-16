// Puerta de Vimy: solo en móviles y solo con la cuenta de Dropbox autorizada.
// El código de Vimy está en vimy/vimy.enc cifrado (AES-GCM-256) con una llave aleatoria que vive en la carpeta de
// la app de Dropbox de esa cuenta (/vimy/llave.json). Sin esa cuenta no hay llave y el código no se puede leer.
// La primera vez en la cuenta, la llave se saca de vimy.enc con la clave de Vimy (una sola vez) y se guarda en Dropbox.
// Lo que Vimy guarda en el móvil (configuración y punto de reanudación) también va cifrado.

import { isMobile } from './vimy-gate-check.js';
import * as dbx from './dropbox.js';

// SHA-256 de «vimy-movil:» + correo de la cuenta autorizada (el correo no se publica en claro).
const OWNER = 'b49305f9b25027048f55a09c2c0ab2dde756d91999c4476d8e2ecde9845550a8';
const KEY_PATH = '/vimy/llave.json';
const RECHECK_AFTER_MS = 60 * 1000;    // en segundo plano más de esto → se vuelve a comprobar la cuenta
const MAX_FAILS = 5, BLOCK_MS = 5 * 60 * 1000;
const enc = new TextEncoder(), dec = new TextDecoder();
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const $ = s => document.querySelector(s);
const gate = $('#gate'), root = $('#vimy-root');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

class Denied extends Error {}

/* ───── Cuenta ───── */
async function checkAccount() {
  if (!dbx.isConnected()) throw new Denied('Primero inicia sesión en Dropbox en OneTab Móvil.');
  const acc = await dbx.currentAccount();
  const h = hex(await crypto.subtle.digest('SHA-256', enc.encode('vimy-movil:' + String(acc.email || '').trim().toLowerCase())));
  if (h !== OWNER || acc.email_verified === false) throw new Denied('Esta cuenta de Dropbox no tiene acceso a Vimy.');
}

/* ───── Llaves ───── */
async function keysFrom(raw) {
  const bundle = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const hk = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const local = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('vimy-movil/local') },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { bundle, local };
}
async function openWith(file, raw) {
  const keys = await keysFrom(raw);
  try { return { keys, bundle: JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, keys.bundle, unb64(file.ct)))) }; }
  catch { return null; }
}
async function unwrapWithPassword(file, password) {
  const w = file.wrap;
  const pw = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(w.kdf.salt), iterations: w.kdf.iter }, pw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(w.iv) }, k, unb64(w.ct))); }
  catch { return null; }
}
async function keyFromDropbox() {
  const t = await dbx.readTextOrNull(KEY_PATH);
  if (!t) return null;
  try { const j = JSON.parse(t); return j.k ? unb64(j.k) : null; } catch { return null; }
}

/* ───── Almacén local cifrado (IndexedDB) ───── */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('vimy-movil', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction('kv', mode); const q = fn(t.objectStore('kv')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); });
}
function makeVault(key) {
  return {
    async get(name) {
      try {
        const box = await idbDo('readonly', s => s.get(name));
        if (!box) return null;
        const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv), additionalData: enc.encode(name) }, key, unb64(box.ct));
        return JSON.parse(dec.decode(p));
      } catch { return null; }   // cifrado con otra llave: se ignora
    },
    async set(name, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(name) }, key, enc.encode(JSON.stringify(value))));
      await idbDo('readwrite', s => s.put({ iv: b64(iv), ct: b64(ct) }, name));
    },
    del: name => idbDo('readwrite', s => s.delete(name))
  };
}

/* ───── Intentos fallidos de la clave (solo en la configuración inicial) ───── */
const fails = {
  get() { try { return JSON.parse(localStorage.getItem('vimyGateFails') || '{"n":0,"until":0}'); } catch { return { n: 0, until: 0 }; } },
  set(v) { try { localStorage.setItem('vimyGateFails', JSON.stringify(v)); } catch {} },
  wait() { const f = this.get(); return Math.max(0, f.until - Date.now()); },
  bad() { const f = this.get(); f.n++; f.until = Date.now() + (f.n >= MAX_FAILS ? BLOCK_MS : Math.min(30000, 1000 * 2 ** (f.n - 1))); this.set(f); },
  ok() { this.set({ n: 0, until: 0 }); }
};

/* ───── Pantallas ───── */
const lockIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const card = inner => `<div class="g-card">${inner}</div>`;
const back = '<a class="g-link" href="./#mas">← Volver a OneTab</a>';
function message(container, title, text, retry) {
  container.innerHTML = card(`<h1>${lockIcon}${esc(title)}</h1><p class="g-muted">${esc(text)}</p>${retry ? '<button class="g-btn" id="g-retry">Reintentar</button>' : ''}${back}`);
  return retry ? new Promise(r => container.querySelector('#g-retry').addEventListener('click', r, { once: true })) : new Promise(() => {});
}

function askPassword(container, check) {
  return new Promise(resolve => {
    container.innerHTML = card(`<h1>${lockIcon}Activar Vimy</h1><p class="g-muted">Primera vez con esta cuenta de Dropbox: escribe la clave de Vimy. Solo se pide esta vez; después entrarás directamente con tu cuenta.</p>
      <form id="g-form" autocomplete="off"><input class="g-field" id="g-pw" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Clave" aria-label="Clave" required>
      <p class="g-err" id="g-err" role="alert"></p><button class="g-btn" id="g-go">Activar</button></form>${back}`);
    const form = container.querySelector('#g-form'), pw = container.querySelector('#g-pw'), err = container.querySelector('#g-err'), go = container.querySelector('#g-go');
    let timer = 0;
    const tick = () => {
      const w = fails.wait();
      go.disabled = w > 0;
      const why = fails.get().n >= MAX_FAILS ? 'Demasiados intentos.' : 'Clave incorrecta.';
      if (w > 0) { err.textContent = `${why} Espera ${Math.ceil(w / 1000)} s.`; timer = setTimeout(tick, 500); }
      else if (/Espera/.test(err.textContent)) err.textContent = why;
    };
    tick();
    pw.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (fails.wait() > 0 || !pw.value) return;
      go.disabled = true; err.textContent = ''; go.textContent = 'Comprobando…';
      let r = null;
      try { r = await check(pw.value); } catch (x) { err.textContent = 'No se pudo activar: ' + (x?.message || x); }
      pw.value = '';
      go.textContent = 'Activar';
      if (r) { fails.ok(); clearTimeout(timer); return resolve(r); }
      if (!err.textContent) fails.bad();
      go.disabled = false; tick(); pw.focus();
    });
  });
}

/** Comprueba la cuenta y consigue la llave; repite hasta que funcione (con «Reintentar» si falla la red). */
async function unlock(container, file, { allowSetup }) {
  for (;;) {
    container.innerHTML = card('<p class="g-muted">Comprobando tu cuenta de Dropbox…</p>');
    try {
      await checkAccount();
      if (!file) return null;   // solo comprobar la cuenta
      const raw = await keyFromDropbox();
      const opened = raw && await openWith(file, raw);
      if (opened) return opened;
      if (!allowSetup) throw new Denied('La llave de Vimy en Dropbox ya no sirve. Abre Vimy de nuevo.');
      return await askPassword(container, async pw => {
        const k = await unwrapWithPassword(file, pw);
        if (!k) return null;
        const o = await openWith(file, k);
        if (!o) return null;
        await dbx.writeText(KEY_PATH, JSON.stringify({ v: 1, k: b64(k), creada: new Date().toISOString() }));
        return o;
      });
    } catch (e) {
      if (e instanceof Denied || e instanceof dbx.NotConnectedError) return message(container, 'Sin acceso', e.message);
      await message(container, 'No se pudo comprobar', (navigator.onLine ? '' : 'Sin conexión. ') + 'No se pudo hablar con Dropbox (' + (e?.message || e) + ').', true);
    }
  }
}

/* ───── Al volver de segundo plano ───── */
let locked = false, hiddenAt = 0;
const unlockedQ = [], lockCbs = [];
function whenUnlocked(cb) { if (!locked) cb(); else unlockedQ.push(cb); }
async function recheck() {
  if (locked) return;
  locked = true;
  lockCbs.forEach(cb => { try { cb(); } catch {} });
  const ov = document.createElement('div');
  ov.className = 'vlock';
  ov.innerHTML = '<div class="gate"></div>';
  document.body.appendChild(ov);
  root.setAttribute('aria-hidden', 'true'); root.inert = true;
  await unlock(ov.firstChild, null, { allowSetup: false });
  ov.remove(); root.removeAttribute('aria-hidden'); root.inert = false;
  locked = false;
  unlockedQ.splice(0).forEach(cb => { try { cb(); } catch {} });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (window.__vimyMovil && hiddenAt && Date.now() - hiddenAt > RECHECK_AFTER_MS) recheck();
  hiddenAt = 0;
});

/* ───── Arranque ───── */
(async function start() {
  if (!isMobile()) return message(gate, 'Solo en el móvil', 'Esta sección solo está disponible en OneTab Móvil desde un teléfono o tableta.');
  if (!crypto?.subtle) return message(gate, 'No disponible', 'Abre la app desde su dirección https.');
  let file;
  try {
    const r = await fetch('vimy/vimy.enc', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    file = await r.json();
    if (file.fmt !== 'vimy-movil-v2') throw new Error('formato desconocido');
  } catch (e) {
    return message(gate, 'No disponible', `No se pudo cargar (${e.message || e}). Comprueba la conexión.`);
  }
  const { keys, bundle } = await unlock(gate, file, { allowSetup: true });
  gate.innerHTML = card('<p class="g-muted">Abriendo…</p>');

  // Lo que Vimy guarda: localStorage → memoria + IndexedDB cifrada; punto de reanudación cifrado.
  const vault = makeVault(keys.local);
  const mem = new Map(Object.entries((await vault.get('store')) || {}));
  let saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => vault.set('store', Object.fromEntries(mem)).catch(() => {}), 300); };
  let cpBusy = Promise.resolve();
  window.__vimyMovil = {
    store: {
      getItem: k => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)); persist(); },
      removeItem: k => { mem.delete(k); persist(); }
    },
    saveCp: cp => (cpBusy = cpBusy.then(() => vault.set('checkpoint', cp)).catch(() => {})),
    loadCp: () => cpBusy.then(() => vault.get('checkpoint')),
    clearCp: () => (cpBusy = cpBusy.then(() => vault.del('checkpoint')).catch(() => {})),
    whenUnlocked,
    onLock: cb => lockCbs.push(cb)
  };

  const bar = document.createElement('div');
  bar.className = 'vbar';
  bar.innerHTML = '<a href="./#mas">← OneTab</a><span>Vimy ' + esc(bundle.version || '') + '</span>';
  const style = document.createElement('style');
  style.textContent = bundle.css;
  document.head.appendChild(style);
  root.innerHTML = bundle.html;
  root.prepend(bar);
  gate.hidden = true; gate.innerHTML = '';
  root.hidden = false;
  document.title = 'Vimy';

  const url = URL.createObjectURL(new Blob([bundle.js], { type: 'text/javascript' }));
  const s = document.createElement('script');
  s.src = url;
  s.onload = s.onerror = () => URL.revokeObjectURL(url);
  document.body.appendChild(s);
})();
