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
  addFolder, updateFolder, deleteFolder, deleteSession, sessionToGroups, upsertDevice, moveTab, moveTabs,
  restoreSnapshots, sortTabs, splitByDomain, dedupeAll, importInto, applyBackup, setExcludedDomains, deleteShot } from '../lib/ops.js';
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
    del: k => tx('readwrite', s => s.delete(k)).catch(() => {}),
    clear: () => tx('readwrite', s => s.clear()).catch(() => {})
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

const GROUP_FIELDS = ['title', 'note', 'starred', 'locked', 'folderId', 'tags', 'targetDevice', 'remindAt'];

/**
 * Las operaciones se vuelven a aplicar en cada repintado y al subir: los grupos que crean deben tener
 * siempre los mismos ids (si no, «Deshacer» o la lista abierta apuntarían a otro). Se renombran los grupos
 * nuevos a op.seed-0, op.seed-1… y, si renameTabs, también sus pestañas.
 */
function stableIds(d, op, fn, renameTabs = false) {
  const before = new Set(Object.keys(d.groups));
  const r = fn();
  let i = 0;
  for (const id of Object.keys(d.groups)) {
    if (before.has(id)) continue;
    const nid = `${op.seed}-${i++}`;
    const g = d.groups[id];
    delete d.groups[id];
    g.id = nid;
    if (renameTabs) g.tabs.forEach((t, k) => { t.id = `${nid}-t${k}`; });
    d.groups[nid] = g;
  }
  return r;
}
const refsOk = (d, refs) => (refs || []).filter(r => d.groups[r.gid] && !d.groups[r.gid].locked);

function applyOp(d, op) {
  const g = op.gid ? d.groups[op.gid] : null;
  switch (op.type) {
    case 'add': {
      if (d.groups[op.id]) return;
      const ng = addGroup(d, { title: op.title || '', tabs: op.tabs, folderId: op.folderId || null, tags: op.tags || [], note: op.note || '',
        origin: op.origin || null, targetDevice: op.targetDevice || null, createdAt: op.at });
      if (op.remindAt) ng.remindAt = op.remindAt;
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
      return stableIds(d, op, () => sessionToGroups(d, { name: s.name, windows: s.windows, origin: op.origin || s.origin, createdAt: op.at }), true);
    }
    case 'restore': {   // Deshacer: vuelve a poner los grupos como estaban y quita los creados
      for (const id of op.remove || []) deleteGroup(d, id);
      return restoreSnapshots(d, op.snapshots || []);
    }
    case 'sortTabs': return g && sortTabs(d, g.id, op.by);
    case 'split': return g && stableIds(d, op, () => splitByDomain(d, g.id));
    case 'dedupe': return dedupeAll(d);
    case 'trashMany': for (const id of op.gids || []) if (d.groups[id] && !d.groups[id].locked) trashGroup(d, id); return;
    case 'updateMany': {
      const patch = Object.fromEntries(Object.entries(op.patch || {}).filter(([k]) => GROUP_FIELDS.includes(k)));
      for (const id of op.gids || []) if (d.groups[id]) updateGroup(d, id, patch);
      return;
    }
    case 'removeMany': {
      const by = new Map();
      for (const r of refsOk(d, op.refs)) { if (!by.has(r.gid)) by.set(r.gid, []); by.get(r.gid).push(r.tid); }
      for (const [gid, tids] of by) removeTabs(d, gid, tids);
      return;
    }
    case 'moveTabs': {   // a una lista existente (to) o a una nueva (title)
      const refs = refsOk(d, op.refs);
      if (!refs.length) return;
      const to = op.to && d.groups[op.to] ? op.to : null;
      if (op.to && !to) return;
      return stableIds(d, op, () => moveTabs(d, refs, to, { title: op.title || '', origin: op.origin || null, folderId: op.folderId || null }));
    }
    case 'mergeGroups': {   // junta varias listas en la primera
      const gids = (op.gids || []).filter(id => d.groups[id] && !d.groups[id].locked);
      if (gids.length < 2) return;
      const refs = gids.slice(1).flatMap(id => d.groups[id].tabs.map(t => ({ gid: id, tid: t.id })));
      moveTabs(d, refs, gids[0]);
      if (op.title) updateGroup(d, gids[0], { title: op.title });
      return;
    }
    case 'import': return stableIds(d, op, () => importInto(d, { groups: op.groups || [], folders: op.folders || [] }, op.folderId && d.folders[op.folderId] ? op.folderId : null), true);
    case 'excluded': return setExcludedDomains(d, (op.list || []).map(String));
    case 'deleteShot': return d.shots[op.id] && deleteShot(d, op.id);
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
  saveOps([...getOps(), { seed: uid(), ...op, at: Date.now() }]);
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
  await idb.clear();
  base = null; baseRev = ''; baseRaw = null;
  Object.keys(sessionKeys).forEach(k => delete sessionKeys[k]);
  recompute();
  set({ loaded: false, status: 'idle', encrypted: false, salt: null, error: '' });
}

export const pendingCount = () => getOps().length;

/**
 * Cambio que no cabe en la cola (restaurar una copia de seguridad): se aplica directamente sobre la versión
 * más reciente de Dropbox y se sube, con reintento si otro equipo subió algo entretanto. Requiere conexión.
 */
export async function commitDirect(fn) {
  await sync();
  if (getOps().length) throw new Error('Hay cambios pendientes de subir. Espera a tener conexión.');
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text, rev } = await dbx.readMain();
    let cur = normalizeData(null), enc = false, salt = null;
    if (text != null) { const r = await decode(text); cur = r.data; enc = r.encrypted; salt = r.salt; }
    const next = structuredClone(cur);
    fn(next);
    registerMe(next);
    const out = await encode(next, enc, salt);
    let newRev;
    try { newRev = await dbx.writeMain(out, rev); }
    catch (e) { if (e instanceof dbx.ConflictError) continue; throw e; }
    base = next; baseRev = newRev; baseRaw = out;
    await idb.set('main', { text: out, rev: newRev, at: Date.now() });
    recompute();
    set({ status: 'ok', exists: true, lastSync: Date.now() });
    return;
  }
  throw new Error('Los datos cambiaron varias veces mientras se guardaban. Inténtalo de nuevo.');
}

/* ───────── Copias de seguridad de la extensión ───────── */

export const listBackups = () => dbx.listBackups();

/** Descarga y descifra una copia: devuelve sus datos. */
export async function readBackup(id) {
  return (await decode(await dbx.downloadText(id))).data;
}

export const restoreBackup = backupData => commitDirect(d => applyBackup(d, backupData));

/* ───────── Capturas (imágenes en Dropbox, cifradas «OTDE1» si el cifrado está activo) ───────── */

const MAGIC = [0x4f, 0x54, 0x44, 0x45, 0x31];
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** Descarga una imagen de captura y la descifra si hace falta. Devuelve un Blob o lanza LockedError. */
export async function shotImage(fileId, type) {
  const cacheKey = 'img:' + fileId;
  const cached = await idb.get(cacheKey);
  if (cached) return cached;
  let u8 = await dbx.downloadBytes(fileId);
  if (u8.length > 33 && MAGIC.every((b, i) => u8[i] === b)) {
    const salt = b64(u8.slice(5, 21));
    const key = keyFor(salt);
    if (!key) throw new LockedError(salt);
    const k = await crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['decrypt']);
    u8 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(21, 33) }, k, u8.slice(33)));
  }
  const blob = new Blob([u8], { type });
  if (type === 'image/jpeg') await idb.set(cacheKey, blob); // solo las miniaturas: las completas pueden ocupar mucho
  return blob;
}

/* ───────── Archivos del intercambio: misma clave que los datos ───────── */

/** { key, salt } para cifrar un archivo si los datos están cifrados; null si no. LockedError si falta la clave. */
export function sealKey() {
  if (!state.encrypted) return null;
  const key = keyFor(state.salt);
  if (!key) throw new LockedError(state.salt);
  return { key, salt: state.salt };
}
/** Clave recordada (o de esta sesión) para una sal concreta, o null. */
export const keyForSalt = salt => keyFor(salt);

/** Lo compartido desde otra app que dejó el service worker (sw.js), una sola vez. */
export async function takeShared() {
  const p = await idb.get('share');
  if (p) await idb.del('share');
  return p && Date.now() - (p.at || 0) < 10 * 60 * 1000 ? p : null;
}
