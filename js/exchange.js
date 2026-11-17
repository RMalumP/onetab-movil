// Pestaña «Archivos»: bandeja compartida con el ordenador en la carpeta /Intercambio de Dropbox.
// Misma carpeta, mismos nombres y mismo cifrado que la herramienta «Intercambio con el móvil» de la extensión.

import * as dbx from './dropbox.js';
import * as S from './sync.js';
import { FOLDER, ENC_MAX, MAX_SIZE, mimeOf, kindOf, safeFileName, sortEntries, freshness, isSealed, sealedSalt, seal, unseal } from '../lib/xfer.js';
import { LockedError } from '../lib/crypto.js';

const SEEN = 'otm.xfer.seen';
const LONGPOLL_S = 240;
export const PREVIEW_MAX = 4096;

export const X = {
  entries: [], fresh: new Set(), cursor: '', loaded: false, loading: false, error: '', live: false,
  thumbs: new Map(), texts: new Map(), uploads: [], busy: new Map()
};
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN)); } catch { return null; } };
const writeSeen = ids => { try { localStorage.setItem(SEEN, JSON.stringify(ids)); } catch { /* sin almacenamiento */ } };
export function markSeen(ids) {
  const s = new Set(readSeen() || []);
  ids.forEach(id => { s.add(id); X.fresh.delete(id); });
  writeSeen([...s]);
  emit();
}
export const freshCount = () => X.fresh.size;

/* ───────── Lista ───────── */

let refreshing = null;
export function refresh() {
  refreshing ??= (async () => {
    X.loading = true; emit();
    try {
      const { entries, cursor } = await dbx.listFolder(FOLDER);
      const f = freshness(entries, readSeen());
      writeSeen(f.seen);
      X.entries = sortEntries(entries); X.fresh = f.fresh; X.cursor = cursor; X.error = ''; X.loaded = true;
    } catch (e) {
      X.error = (!navigator.onLine || e instanceof TypeError) ? 'Sin conexión.' : 'No se pudo leer la bandeja: ' + (e.message || e);
    }
    X.loading = false; emit();
    extras();
  })().finally(() => { refreshing = null; });
  return refreshing;
}

/** Miniaturas y textos cortos. */
async function extras() {
  const imgs = X.entries.filter(e => kindOf(e.name) === 'image' && !X.thumbs.has(e.id)).slice(0, 50);
  if (imgs.length) {
    const m = await dbx.thumbs(imgs).catch(() => new Map());
    m.forEach((u, id) => X.thumbs.set(id, u));
    if (m.size) emit();
  }
  const texts = X.entries.filter(e => kindOf(e.name) === 'text' && e.size <= PREVIEW_MAX && !X.texts.has(e.id)).slice(0, 12);
  let any = false;
  await Promise.all(texts.map(async e => { try { X.texts.set(e.id, await (await fetchFile(e)).text()); any = true; } catch { /* sin vista previa */ } }));
  if (any) emit();
}

/* ───────── En directo: solo con la pestaña abierta y la app a la vista ───────── */

let ctrl = null;
export async function startLive() {
  if (ctrl || document.visibilityState !== 'visible') return;
  const my = ctrl = new AbortController();
  try {
    if (!X.cursor) await refresh();
    if (!X.cursor || my.signal.aborted) return;
    X.live = true; emit();
    while (!my.signal.aborted) {
      const r = await dbx.longpoll(X.cursor, LONGPOLL_S, my.signal);
      if (my.signal.aborted) break;
      if (r.changes) await refresh();
      if (r.backoff) await new Promise(res => setTimeout(res, r.backoff * 1000));
    }
  } catch (e) {
    if (!my.signal.aborted) console.warn('Archivos: sin modo en directo', e);
  } finally {
    if (ctrl === my) { ctrl = null; X.live = false; emit(); }
  }
}
export function stopLive() { if (ctrl) { ctrl.abort(); ctrl = null; X.live = false; } }

/* ───────── Enviar ───────── */

let pumping = false;
/** Pone archivos en la cola de envío. text = contenido si es un texto escrito aquí (para la vista previa). */
export function enqueue(files, text = null) {
  for (const f of files) X.uploads.push({ file: f, name: f.name, size: f.size, sent: 0, started: false, done: false, error: '', text, plain: false });
  emit();
  pump();
}

/** Los envíos esperan a saber si los datos están cifrados (y a tener la clave). */
const ready = () => S.state.loaded && S.state.status !== 'locked';
/** Espera a tener los datos o a que la sincronización falle (entonces los envíos se marcan con error y se pueden reintentar). */
const settled = () => ready() || S.state.status === 'error' || S.state.status === 'offline';
function whenReady() {
  if (settled()) return Promise.resolve();
  return new Promise(res => { const off = S.subscribe(() => { if (settled()) { off(); res(); } }); });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    await whenReady();
    if (!ready()) {
      const why = S.state.status === 'offline' ? 'Sin conexión.' : `No se pudo conectar con Dropbox${S.state.error ? ': ' + S.state.error : ''}.`;
      X.uploads.filter(x => !x.done && !x.error && !x.started).forEach(x => { x.error = why + ' Pulsa Reintentar.'; });
      emit();
      return;
    }
    for (let u; (u = X.uploads.find(x => !x.done && !x.error && !x.started));) {
      u.started = true; emit();
      try {
        if (u.size > MAX_SIZE) throw new Error('Supera los 2 GB.');
        let body = u.file;
        const k = u.plain ? null : S.sealKey();
        if (k) {
          if (u.size > ENC_MAX) { const e = new Error(`Con el cifrado activo el máximo es ${Math.round(ENC_MAX / 1048576)} MB.`); e.code = 'too-big-encrypted'; throw e; }
          body = new Blob([await seal(new Uint8Array(await u.file.arrayBuffer()), k.key, k.salt)]);
        }
        const meta = await dbx.putFile(`${FOLDER}/${safeFileName(u.name)}`, body, n => { u.sent = n; emit(); });
        u.done = true; u.sent = u.size; u.file = null;
        markSeen([meta.id]);
        if (!X.entries.some(e => e.id === meta.id)) X.entries.unshift({ ...meta, '.tag': 'file' });
        if (u.text != null) X.texts.set(meta.id, u.text);
      } catch (e) {
        u.error = e instanceof LockedError ? 'Falta la contraseña de cifrado.' : (!navigator.onLine || e instanceof TypeError) ? 'Sin conexión. Pulsa para reintentar.' : (e.message || String(e));
        u.code = e.code || '';
      }
      emit();
    }
  } finally { pumping = false; }
  extras();
  setTimeout(() => { if (!pumping) { X.uploads = X.uploads.filter(u => !u.done); emit(); } }, 5000);
}

/** Reintenta un envío fallido (plain = sin cifrar, para los que no caben cifrados). */
export function retry(i, plain = false) {
  const u = X.uploads[i];
  if (!u || !u.error || !u.file) return;
  Object.assign(u, { error: '', code: '', started: false, sent: 0, plain });
  emit(); pump();
}
export function dismiss(i) { X.uploads.splice(i, 1); emit(); }

/* ───────── Recibir ───────── */

/** Descarga y descifra si hace falta. Devuelve un Blob con el tipo deducido del nombre. */
export async function fetchFile(entry, onProgress = () => {}) {
  let u8 = await dbx.getFile(entry.id, onProgress);
  if (isSealed(u8)) {
    const salt = sealedSalt(u8);
    const key = S.keyForSalt(salt);
    if (!key) throw new LockedError(salt);
    u8 = await unseal(u8, key);
  }
  return new Blob([u8], { type: mimeOf(entry.name) });
}

export async function remove(entry) {
  await dbx.removeFile(entry.id);
  X.entries = X.entries.filter(e => e.id !== entry.id);
  X.fresh.delete(entry.id);
  emit();
}

export function reset() {
  stopLive();
  Object.assign(X, { entries: [], fresh: new Set(), cursor: '', loaded: false, error: '', thumbs: new Map(), texts: new Map(), uploads: [], busy: new Map() });
  try { localStorage.removeItem(SEEN); } catch { /* sin almacenamiento */ }
}
