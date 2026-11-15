// Estado de los datos en el móvil y sincronización con Dropbox.
//
// La extensión guarda todo en un único archivo (onetab-drive.json) con el formato de lib/ops.js, comprimido
// (lib/pack.js) y, si activaste el cifrado, dentro de un sobre AES-GCM (lib/crypto.js). Aquí:
//  1. Se descarga el archivo (solo si cambió su revisión) y se descifra/descomprime.
//  2. Cada cambio que haces en el móvil se guarda como una operación en una cola (sobrevive sin conexión).
//  3. Al sincronizar se aplican las operaciones sobre la versión MÁS RECIENTE de Dropbox y se sube con
//     «solo si sigue en esta revisión». Si otro equipo subió algo entretanto, se repite. Así nunca se pisa
//     lo de otro equipo, y la extensión fusiona después como con cualquier otro equipo.

import { normalizeData, addGroup, updateGroup, trashGroup, untrashGroup, deleteGroup, emptyTrash, removeTabs,
  addFolder, updateFolder, deleteFolder, deleteSession, sessionToGroups, upsertDevice, moveTab } from '../lib/ops.js';
import { stableStringify, uid } from '../lib/util.js';
import { packText, unpack, allDevicesCanUnpack } from '../lib/pack.js';
import { isEnvelope, deriveKey, decryptEnvelope, encryptText, LockedError } from '../lib/crypto.js';
import * as dbx from './dropbox.js';

/** Versión del formato que entiende esta app (lee y escribe el comprimido de la 4.0+). Se anota en su equipo. */
export const COMPAT_VERSION = '4.9.0';

const OPS = 'otm.ops';
const KEYS = 'otm.keys';       // claves recordadas en este dispositivo { sal: clave }
const DEVICE = 'otm.device';

/* ───────── Caché local (IndexedDB) del archivo tal cual llega de Dropbox (cifrado si lo está) ───────── */

const idb = (() => {
  let dbp = null;
  const db = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('onetab-movil', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode);
      const req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req?.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => undefined),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}),
    del: k => tx('readwrite', s => s.delete(k)).catch(() => {})
  };
})();

/* ───────── Estado ───────── */

const listeners = new Set();
export const state = {
  data: normalizeData(null),   // datos con las operaciones pendientes ya aplicadas (lo que se ve)
  loaded: false,               // hay datos (de la caché o de Dropbox)
  exists: true,                // el archivo existe en Dropbox
  status: 'idle',              // 'idle' | 'syncing' | 'ok' | 'offline' | 'locked' | 'error'
  error: '',
  lastSync: 0,
  encrypted: false,
  salt: null,                  // sal del archivo cifrado (para pedir la contraseña)
  pending: 0
};
const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const set = patch => { Object.assign(state, patch); emit(); };

let base = null;      // última versión de Dropbox descifrada (sin operaciones pendientes)
let baseRev = '';     // su revisión
let baseRaw = null;   // su texto tal cual (para la caché)
const sessionKeys = {};

const readJson = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const getOps = () => readJson(OPS, []);
const saveOps = ops => { localStorage.setItem(OPS, JSON.stringify(ops)); state.pending = ops.length; };
const keyFor = salt => sessionKeys[salt] || readJson(KEYS, {})[salt] || null;

export function getDevice() {
  let d = readJson(DEVICE, null);
  if (!d?.id) { d = { id: 'dev-' + uid(), name: defaultDeviceName() }; localStorage.setItem(DEVICE, JSON.stringify(d)); }
  return d;
}
function defaultDeviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'móvil';
  return `Móvil (${os})`;
}
export function renameDevice(name) {
  const d = { ...getDevice(), name: String(name || '').trim().slice(0, 60) || getDevice().name };
  localStorage.setItem(DEVICE, JSON.stringify(d));
  enqueue({ type: 'device' });
}

/* ───────── Decodificar / codificar el archivo ───────── */

async function decode(text) {
  let raw = JSON.parse(text);
  let encrypted = false, salt = null;
  if (isEnvelope(raw)) {
    encrypted = true; salt = raw.salt;
    const key = keyFor(salt);
    if (!key) throw new LockedError(salt);
    try { raw = JSON.parse(await decryptEnvelope(raw, key)); } catch { throw new LockedError(salt); }
  }
  return { data: normalizeData(await unpack(raw)), encrypted, salt };
}

async function encode(data, encrypted, salt) {
  const text = stableStringify(data);
  // Igual que la extensión: comprimido solo si todos los equipos activos lo entienden.
  const body = allDevicesCanUnpack(data) ? await packText(text) : text;
  if (!encrypted) return body;
  const key = keyFor(salt);
  if (!key) throw new LockedError(salt);
  return JSON.stringify(await encryptText(body, key, salt));
}

/* ───────── Operaciones (lo que se puede cambiar desde el móvil) ───────── */

const GROUP_FIELDS = ['title', 'note', 'starred', 'locked', 'folderId', 'tags', 'targetDevice'];

function applyOp(d, op) {
  const g = op.gid ? d.groups[op.gid] : null;
  switch (op.type) {
    case 'add': {
      if (d.groups[op.id]) return;
      const ng = addGroup(d, { title: op.title || '', tabs: op.tabs, folderId: op.folderId || null, tags: op.tags || [], note: op.note || '',
        origin: op.origin || null, targetDevice: op.targetDevice || null, createdAt: op.at });
      delete d.groups[ng.id];
      ng.id = op.id;
      ng.tabs.forEach((t, i) => { if (op.tabs[i]?.id) t.id = op.tabs[i].id; });
      d.groups[op.id] = ng;
      return;
    }
    case 'update': {
      if (!g) return;
      const patch = Object.fromEntries(Object.entries(op.patch || {}).filter(([k]) => GROUP_FIELDS.includes(k)));
      if (patch.folderId && !d.folders[patch.folderId]) patch.folderId = null;
      return updateGroup(d, g.id, patch);
    }
    case 'trash': return g && !g.locked && trashGroup(d, g.id);
    case 'untrash': return g && untrashGroup(d, g.id);
    case 'delete': return g && deleteGroup(d, g.id);
    case 'emptyTrash': return emptyTrash(d);
    case 'removeTabs': return g && !g.locked && removeTabs(d, g.id, op.tabIds || []);
    case 'moveTab': return g && d.groups[op.to] && moveTab(d, g.id, op.tabId, op.to, null);
    case 'addFolder': {
      if (d.folders[op.id]) return;
      const f = addFolder(d, op.name || '');
      delete d.folders[f.id]; f.id = op.id; d.folders[op.id] = f;
      return;
    }
    case 'renameFolder': return d.folders[op.id] && updateFolder(d, op.id, { name: String(op.name || '').trim() || d.folders[op.id].name });
    case 'deleteFolder': return deleteFolder(d, op.id);
    case 'deleteSession': return deleteSession(d, op.sid);
    case 'sessionToGroups': {
      const s = d.sessions[op.sid];
      if (!s) return;
      return sessionToGroups(d, { name: s.name, windows: s.windows, origin: op.origin || s.origin, createdAt: Date.now() });
    }
    case 'device': return; // el registro del equipo se hace siempre al sincronizar
  }
}

function registerMe(d) {
  const me = getDevice();
  return upsertDevice(d, { id: me.id, name: me.name, version: COMPAT_VERSION });
}

/** Datos visibles = última versión de Dropbox + operaciones pendientes. */
function recompute() {
  const d = structuredClone(base || normalizeData(null));
  for (const op of getOps()) { try { applyOp(d, op); } catch (e) { console.warn('Operación', op, e); } }
  state.data = d;
  state.pending = getOps().length;
}

/** Guarda un cambio: se ve al momento y se sube en cuanto haya conexión. */
export function enqueue(op) {
  saveOps([...getOps(), { ...op, at: Date.now() }]);
  recompute();
  emit();
  scheduleSync(400);
}
export const newId = uid;

/* ───────── Ciclo ───────── */

export async function loadCache() {
  const cached = await idb.get('main');
  if (!cached?.text) { recompute(); return; }
  baseRaw = cached.text; baseRev = cached.rev || '';
  try {
    const r = await decode(cached.text);
    base = r.data;
    set({ encrypted: r.encrypted, salt: r.salt, loaded: true, lastSync: cached.at || 0 });
  } catch (e) {
    if (e instanceof LockedError) set({ encrypted: true, salt: e.salt, status: 'locked' });
  }
  recompute(); emit();
}

let running = null, timer = null;
export function scheduleSync(ms = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => sync().catch(() => {}), ms);
}

export function sync() {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  if (!dbx.isConnected()) return;
  if (!navigator.onLine) { set({ status: 'offline' }); return; }
  set({ status: 'syncing', error: '' });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      // 1. Traer la versión más reciente si cambió.
      const rev = await dbx.peekMain();
      if (!rev) { base = normalizeData(null); baseRev = ''; baseRaw = null; set({ exists: false }); }
      else if (rev !== baseRev || !base) {
        const { text, rev: r2 } = await dbx.readMain();
        if (text == null) { base = normalizeData(null); baseRev = ''; baseRaw = null; set({ exists: false }); }
        else {
          baseRaw = text; baseRev = r2;
          const dec = await decode(text);   // puede pedir contraseña (LockedError)
          base = dec.data;
          set({ exists: true, encrypted: dec.encrypted, salt: dec.salt });
          await idb.set('main', { text, rev: r2, at: Date.now() });
        }
      }
      // 2. Aplicar lo pendiente sobre esa versión y subir si cambia algo.
      const ops = getOps();
      const next = structuredClone(base);
      for (const op of ops) { try { applyOp(next, op); } catch (e) { console.warn('Operación', op, e); } }
      const changedByOps = stableStringify(next) !== stableStringify(base);
      const deviceChanged = state.exists && registerMe(next);
      if (changedByOps || deviceChanged) {
        const text = await encode(next, state.encrypted, state.salt);
        let newRev;
        try { newRev = await dbx.writeMain(text, baseRev); }
        catch (e) { if (e instanceof dbx.ConflictError) { await new Promise(r => setTimeout(r, 400 + Math.random() * 1200)); continue; } throw e; }
        base = next; baseRev = newRev; baseRaw = text;
        await idb.set('main', { text, rev: newRev, at: Date.now() });
        set({ exists: true });
      }
      // Quitar de la cola solo lo que se subió (pudo llegar algo nuevo entretanto).
      saveOps(getOps().slice(ops.length));
      recompute();
      set({ status: 'ok', loaded: true, lastSync: Date.now() });
      return;
    }
    throw new Error('Los datos cambiaron varias veces mientras se guardaban. Se reintentará.');
  } catch (e) {
    if (e instanceof LockedError) { recompute(); set({ status: 'locked', salt: e.salt, encrypted: true }); return; }
    if (e instanceof dbx.NotConnectedError) { set({ status: 'error', error: e.message }); return; }
    const offline = !navigator.onLine || e instanceof TypeError; // TypeError = fallo de red en fetch
    set({ status: offline ? 'offline' : 'error', error: offline ? '' : (e.message || String(e)) });
    if (!offline) console.error(e);
  }
}

/** Comprueba la contraseña con el archivo cifrado y, si es correcta, la guarda (en memoria o recordada). */
export async function unlock(password, remember) {
  const salt = state.salt;
  if (!salt) throw new Error('No hay datos cifrados que desbloquear.');
  const text = baseRaw || (await idb.get('main'))?.text || (await dbx.readMain()).text;
  const env = JSON.parse(text);
  if (!isEnvelope(env)) { set({ status: 'idle' }); return sync(); }
  const key = await deriveKey(password, env.salt);
  try { await decryptEnvelope(env, key); } catch { throw new Error('Contraseña incorrecta.'); }
  sessionKeys[env.salt] = key;
  if (remember) localStorage.setItem(KEYS, JSON.stringify({ ...readJson(KEYS, {}), [env.salt]: key }));
  baseRev = ''; // fuerza a releer y descifrar
  set({ status: 'idle' });
  return sync();
}

export const rememberedKey = () => Object.keys(readJson(KEYS, {})).length > 0;
export function forgetKeys() { localStorage.removeItem(KEYS); }

/** Cierra sesión y borra todo lo de este dispositivo (los cambios pendientes se pierden). */
export async function wipe() {
  await dbx.logout();
  for (const k of [OPS, KEYS]) localStorage.removeItem(k);
  await idb.del('main');
  base = null; baseRev = ''; baseRaw = null;
  Object.keys(sessionKeys).forEach(k => delete sessionKeys[k]);
  recompute();
  set({ loaded: false, status: 'idle', encrypted: false, salt: null, error: '' });
}

export const pendingCount = () => getOps().length;
