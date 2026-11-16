// Puerta de Vimy: solo en móviles y solo con la clave.
// El código de Vimy está en vimy/vimy.enc cifrado (AES-GCM-256 con una clave derivada de la contraseña:
// PBKDF2-SHA256 + HKDF). En el repositorio no hay ni la contraseña ni el código en claro: sin la clave no se puede leer.
// Al desbloquear se descifra en memoria y se ejecuta. Lo que Vimy guarda en el móvil (configuración y punto de
// reanudación) también va cifrado con otra clave derivada de la misma contraseña.

import { isMobile } from './vimy-gate-check.js';

const LOCK_AFTER_MS = 60 * 1000;        // en segundo plano más de esto → vuelve a pedir la clave
const MAX_FAILS = 5, BLOCK_MS = 5 * 60 * 1000;
const enc = new TextEncoder(), dec = new TextDecoder();
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const $ = s => document.querySelector(s);
const gate = $('#gate'), root = $('#vimy-root');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ───── Claves ───── */
async function deriveKeys(password, kdf) {
  const pw = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(kdf.salt), iterations: kdf.iter }, pw, 256);
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  const sub = (info, use) => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) },
    hk, { name: 'AES-GCM', length: 256 }, false, use);
  return { bundle: await sub('vimy-movil/bundle', ['decrypt']), local: await sub('vimy-movil/local', ['encrypt', 'decrypt']) };
}
async function openBundle(file, password) {
  const keys = await deriveKeys(password, file.kdf);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, keys.bundle, unb64(file.ct)); }
  catch { return null; }   // AES-GCM no autentica → clave incorrecta
  return { keys, bundle: JSON.parse(dec.decode(plain)) };
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
      } catch { return null; }   // cifrado con otra clave (se cambió la contraseña): se ignora
    },
    async set(name, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(name) }, key, enc.encode(JSON.stringify(value))));
      await idbDo('readwrite', s => s.put({ iv: b64(iv), ct: b64(ct) }, name));
    },
    del: name => idbDo('readwrite', s => s.delete(name))
  };
}

/* ───── Intentos fallidos (freno en este dispositivo) ───── */
const fails = {
  get() { try { return JSON.parse(localStorage.getItem('vimyGateFails') || '{"n":0,"until":0}'); } catch { return { n: 0, until: 0 }; } },
  set(v) { try { localStorage.setItem('vimyGateFails', JSON.stringify(v)); } catch {} },
  wait() { const f = this.get(); return Math.max(0, f.until - Date.now()); },
  bad() { const f = this.get(); f.n++; f.until = Date.now() + (f.n >= MAX_FAILS ? BLOCK_MS : Math.min(30000, 1000 * 2 ** (f.n - 1))); this.set(f); },
  ok() { this.set({ n: 0, until: 0 }); }
};

/* ───── Pantallas ───── */
function card(inner) { return `<div class="g-card">${inner}</div>`; }
const lockIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

function askPassword(container, { title, sub, check }) {
  return new Promise(resolve => {
    container.innerHTML = card(`<h1>${lockIcon}${esc(title)}</h1><p class="g-muted">${esc(sub)}</p>
      <form id="g-form" autocomplete="off"><input class="g-field" id="g-pw" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Clave" aria-label="Clave" required>
      <p class="g-err" id="g-err" role="alert"></p><button class="g-btn" id="g-go">Desbloquear</button></form>
      <a class="g-link" href="./#mas">← Volver a OneTab</a>`);
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
      try { r = await check(pw.value); } catch (x) { err.textContent = 'No se pudo abrir: ' + (x?.message || x); }
      pw.value = '';
      go.textContent = 'Desbloquear';
      if (r) { fails.ok(); clearTimeout(timer); return resolve(r); }
      if (!err.textContent) fails.bad();
      go.disabled = false; tick(); pw.focus();
    });
  });
}

/* ───── Bloqueo (tras desbloquear) ───── */
let locked = false, hiddenAt = 0, file = null;
const unlockedQ = [], lockCbs = [];
function whenUnlocked(cb) { if (!locked) cb(); else unlockedQ.push(cb); }
async function lock() {
  if (locked) return;
  locked = true;
  lockCbs.forEach(cb => { try { cb(); } catch {} });
  const ov = document.createElement('div');
  ov.className = 'vlock';
  ov.innerHTML = '<div class="gate"></div>';
  document.body.appendChild(ov);
  root.setAttribute('aria-hidden', 'true'); root.inert = true;
  await askPassword(ov.firstChild, { title: 'Vimy bloqueada', sub: 'La búsqueda está en pausa. Escribe la clave para seguir.', check: pw => openBundle(file, pw) });
  ov.remove(); root.removeAttribute('aria-hidden'); root.inert = false;
  locked = false;
  unlockedQ.splice(0).forEach(cb => { try { cb(); } catch {} });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (window.__vimyMovil && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) lock();
  hiddenAt = 0;
});

/* ───── Arranque ───── */
(async function start() {
  if (!isMobile()) {
    gate.innerHTML = card(`<h1>${lockIcon}Solo en el móvil</h1><p class="g-muted">Esta sección solo está disponible en OneTab Móvil desde un teléfono o tableta.</p><a class="g-link" href="./">← Volver a OneTab</a>`);
    return;
  }
  if (!crypto?.subtle) { gate.innerHTML = card('<h1>No disponible</h1><p class="g-muted">Abre la app desde su dirección https.</p>'); return; }
  try {
    const r = await fetch('vimy/vimy.enc', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    file = await r.json();
    if (file.fmt !== 'vimy-movil-v1') throw new Error('formato desconocido');
  } catch (e) {
    gate.innerHTML = card(`<h1>No disponible</h1><p class="g-muted">No se pudo cargar (${esc(e.message || e)}). Comprueba la conexión.</p><a class="g-link" href="./">← Volver a OneTab</a>`);
    return;
  }
  const { keys, bundle } = await askPassword(gate, { title: 'Vimy', sub: 'Sección protegida. Escribe la clave de acceso.', check: pw => openBundle(file, pw) });
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
    loadCp: () => vault.get('checkpoint'),
    clearCp: () => (cpBusy = cpBusy.then(() => vault.del('checkpoint')).catch(() => {})),
    whenUnlocked,
    onLock: cb => lockCbs.push(cb)
  };

  const bar = document.createElement('div');
  bar.className = 'vbar';
  bar.innerHTML = '<a href="./#mas">← OneTab</a><span>Vimy ' + esc(bundle.version || '') + '</span><button type="button" id="v-lock">Bloquear</button>';
  const style = document.createElement('style');
  style.textContent = bundle.css;
  document.head.appendChild(style);
  root.innerHTML = bundle.html;
  root.prepend(bar);
  bar.querySelector('#v-lock').addEventListener('click', lock);
  gate.hidden = true; gate.innerHTML = '';
  root.hidden = false;
  document.title = 'Vimy';

  const url = URL.createObjectURL(new Blob([bundle.js], { type: 'text/javascript' }));
  const s = document.createElement('script');
  s.src = url;
  s.onload = s.onerror = () => URL.revokeObjectURL(url);
  document.body.appendChild(s);
})();
