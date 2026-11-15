// Modelo de datos y operaciones puras sobre él.
//
// data = {
//   schema: 2,
//   groups:  { [id]: Group },
//   folders: { [id]: Folder },
//   devices: { [id]: Device },
//   sessions: { [id]: Session },          // sesiones guardadas (se sincronizan)
//   shots: { [id]: Shot },                // capturas de pantalla (metadatos; las imágenes van aparte)
//   tombstones: { [id]: deletedAt },      // borrados definitivos (para que no "revivan")
//   shared: { excludedDomains: string[], updatedAt }
// }
// Group  = { id, title, note, createdAt, updatedAt, folderId|null, tags[], locked, starred,
//            trashedAt|null, origin|null, targetDevice|null, autoKey|null,
//            tabGroups: [{title,color}], tabs: Tab[] }
// Tab    = { id, url, title, tg? }   // tg = índice en group.tabGroups (grupo nativo del navegador)
// Folder = { id, name, color, order, createdAt, updatedAt }
// Device = { id, name, createdAt, updatedAt, lastSeen }
// Session = { id, name, createdAt, updatedAt, origin, windows: [{ tabs: [{url,title,pinned?,tg?}], tabGroups }] }
// Shot = { id, title, url, createdAt, updatedAt, origin, kind: 'manual'|'auto', mode, width, height,
//          parts: [{w,h}], size, groupId|null, edits|null, localPaths: [ruta relativa a Descargas]|null,
//          files: { provider, parts: [id], thumb: id, enc }|null }

import { uid, now, domainOf } from './util.js';

export const FOLDER_COLORS = ['#2563a8', '#0e7c7b', '#7a4fb5', '#b5543a', '#5b7a1e', '#a83262', '#8a6d1f', '#4a5866'];
export const TRASH_TTL = 30 * 24 * 3600 * 1000;

export function emptyData() {
  return {
    schema: 2, groups: {}, folders: {}, devices: {}, sessions: {}, shots: {}, tombstones: {},
    shared: { excludedDomains: [], updatedAt: 0 }
  };
}

export function normalizeData(d) {
  const base = emptyData();
  if (!d || typeof d !== 'object') return base;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    schema: 2,
    groups: obj(d.groups),
    folders: obj(d.folders),
    devices: obj(d.devices),
    sessions: obj(d.sessions),
    shots: obj(d.shots),
    tombstones: obj(d.tombstones),
    shared: { ...base.shared, ...(d.shared || {}) }
  };
}

const cleanTab = t => {
  const tab = { id: t.id || uid(), url: String(t.url || ''), title: String(t.title || t.url || '') };
  if (Number.isInteger(t.tg)) tab.tg = t.tg;
  return tab;
};

/* ───────── Grupos ───────── */

export const isLive = g => g && !g.trashedAt;
export const liveGroups = d => Object.values(d.groups).filter(isLive);
export const trashedGroups = d => Object.values(d.groups).filter(g => g.trashedAt).sort((a, b) => b.trashedAt - a.trashedAt);

export function addGroup(d, {
  title = '', tabs = [], folderId = null, tags = [], createdAt, note = '',
  origin = null, targetDevice = null, autoKey = null, tabGroups = []
} = {}) {
  const t = now();
  const g = {
    id: uid(),
    title,
    note,
    createdAt: createdAt || t,
    updatedAt: t,
    folderId: folderId && d.folders[folderId] ? folderId : null,
    tags: [...new Set(tags.map(s => String(s).trim()).filter(Boolean))],
    locked: false,
    starred: false,
    trashedAt: null,
    origin,
    targetDevice,
    autoKey,
    tabGroups: tabGroups.map(x => ({ title: x.title || '', color: x.color || 'grey' })),
    tabs: tabs.map(cleanTab)
  };
  d.groups[g.id] = g;
  return g;
}

export function updateGroup(d, id, patch) {
  const g = d.groups[id];
  if (!g) return null;
  Object.assign(g, patch, { updatedAt: now() });
  return g;
}

/** Borrado definitivo (deja lápida para la sincronización). */
export function deleteGroup(d, id) {
  if (!d.groups[id]) return;
  delete d.groups[id];
  d.tombstones[id] = now();
  // Las capturas de ese grupo siguen en la galería, sin enlace al grupo.
  for (const s of Object.values(d.shots || {})) if (s.groupId === id) s.groupId = null;
}

export const trashGroup = (d, id) => updateGroup(d, id, { trashedAt: now(), starred: false });
export const untrashGroup = (d, id) => updateGroup(d, id, { trashedAt: null });

export function emptyTrash(d) {
  for (const g of trashedGroups(d)) deleteGroup(d, g.id);
}

/** Borra definitivamente lo que lleva más de 30 días en la papelera. Devuelve cuántos. */
export function purgeTrash(d, at = now(), ttl = TRASH_TTL) {
  let n = 0;
  for (const g of trashedGroups(d)) {
    if (at - g.trashedAt > ttl) { deleteGroup(d, g.id); n++; }
  }
  return n;
}

/** Limpia índices de grupos nativos que ya no usa ninguna pestaña. */
function compactTabGroups(g) {
  if (!g.tabGroups?.length) return;
  const used = [...new Set(g.tabs.map(t => t.tg).filter(Number.isInteger))].sort((a, b) => a - b);
  const map = new Map(used.map((old, i) => [old, i]));
  g.tabGroups = used.map(i => g.tabGroups[i]).filter(Boolean);
  for (const t of g.tabs) {
    if (Number.isInteger(t.tg)) {
      if (map.has(t.tg) && map.get(t.tg) < g.tabGroups.length) t.tg = map.get(t.tg);
      else delete t.tg;
    }
  }
}

export function removeTabs(d, groupId, tabIds) {
  const g = d.groups[groupId];
  if (!g) return;
  const ids = new Set(tabIds);
  g.tabs = g.tabs.filter(t => !ids.has(t.id));
  if (g.tabs.length === 0) deleteGroup(d, groupId);
  else { compactTabGroups(g); g.updatedAt = now(); }
}

/** Saca pestañas de su grupo conservando su grupo nativo (tg) traducido al destino. */
function takeTab(d, gid, tid) {
  const g = d.groups[gid];
  const i = g?.tabs.findIndex(t => t.id === tid) ?? -1;
  if (i < 0) return null;
  const [tab] = g.tabs.splice(i, 1);
  const tgInfo = Number.isInteger(tab.tg) ? g.tabGroups?.[tab.tg] : null;
  delete tab.tg;
  return { tab, tgInfo, from: g };
}

function putTab(to, { tab, tgInfo }, pos) {
  if (tgInfo) {
    to.tabGroups ??= [];
    let idx = to.tabGroups.findIndex(x => x.title === tgInfo.title && x.color === tgInfo.color);
    if (idx < 0) idx = to.tabGroups.push({ ...tgInfo }) - 1;
    tab.tg = idx;
  }
  to.tabs.splice(pos, 0, tab);
}

function finishSources(d, groups) {
  const t = now();
  for (const g of groups) {
    if (!d.groups[g.id]) continue;
    if (g.tabs.length === 0) deleteGroup(d, g.id);
    else { compactTabGroups(g); g.updatedAt = t; }
  }
}

/** Mueve una pestaña a otro grupo (o dentro del mismo), antes de beforeTabId o al final. */
export function moveTab(d, fromId, tabId, toId, beforeTabId = null) {
  const to = d.groups[toId];
  if (!to || !d.groups[fromId]) return;
  const taken = takeTab(d, fromId, tabId);
  if (!taken) return;
  let pos = beforeTabId ? to.tabs.findIndex(t => t.id === beforeTabId) : -1;
  if (pos < 0) pos = to.tabs.length;
  putTab(to, taken, pos);
  to.updatedAt = now();
  if (taken.from !== to) finishSources(d, [taken.from]);
}

/**
 * Mueve varias pestañas [{gid, tid}] a un grupo existente o, si toId es null, a uno nuevo.
 * Sirve para juntar (fusionar) y dividir. Devuelve el id del grupo destino.
 */
export function moveTabs(d, refs, toId = null, newGroup = {}) {
  let to = toId ? d.groups[toId] : null;
  if (!to) to = addGroup(d, newGroup);
  const sources = new Set();
  for (const { gid, tid } of refs) {
    if (gid === to.id) continue;
    const taken = takeTab(d, gid, tid);
    if (!taken) continue;
    sources.add(taken.from);
    putTab(to, taken, to.tabs.length);
  }
  to.updatedAt = now();
  finishSources(d, [...sources]);
  if (!to.tabs.length) { delete d.groups[to.id]; return null; }
  return to.id;
}

export function sortTabs(d, gid, by = 'title') {
  const g = d.groups[gid];
  if (!g) return;
  const key = by === 'domain' ? t => domainOf(t.url) + ' ' + t.title : t => t.title || t.url;
  g.tabs.sort((a, b) => key(a).localeCompare(key(b), 'es', { sensitivity: 'base' }));
  g.updatedAt = now();
}

/** Divide un grupo en uno por dominio. Devuelve cuántos grupos nuevos creó. */
export function splitByDomain(d, gid) {
  const g = d.groups[gid];
  if (!g) return 0;
  const byDomain = new Map();
  for (const t of g.tabs) {
    const dom = domainOf(t.url) || 'otros';
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom).push(t.id);
  }
  if (byDomain.size < 2) return 0;
  let n = 0;
  const base = g.createdAt;
  for (const [dom, ids] of [...byDomain].slice(1)) {
    moveTabs(d, ids.map(tid => ({ gid, tid })), null, {
      title: dom, folderId: g.folderId, tags: g.tags, origin: g.origin, createdAt: base - ++n
    });
  }
  updateGroup(d, gid, { title: g.title || [...byDomain.keys()][0] });
  return n;
}

/**
 * Añade pestañas al grupo automático del día (envío por inactividad o por límite),
 * para no crear un grupo por cada pestaña.
 */
export function appendToAutoGroup(d, { key, title, tags = [], origin = null, tabs, tabGroups = [] }) {
  let g = liveGroups(d).find(x => x.autoKey === key);
  if (!g) return addGroup(d, { title, tags, origin, autoKey: key, tabs, tabGroups });
  const offset = g.tabGroups?.length || 0;
  g.tabGroups = [...(g.tabGroups || []), ...tabGroups];
  const existing = new Set(g.tabs.map(t => t.url));
  for (const t of tabs) {
    if (existing.has(t.url)) continue;
    const ct = cleanTab(t);
    if (Number.isInteger(ct.tg)) ct.tg += offset;
    g.tabs.push(ct);
  }
  compactTabGroups(g);
  g.updatedAt = now();
  return g;
}

/** Índice url → [{gid, tid}] de las pestañas guardadas (sin papelera). */
export function urlIndex(d) {
  const idx = new Map();
  for (const g of liveGroups(d)) {
    for (const t of g.tabs) {
      if (!idx.has(t.url)) idx.set(t.url, []);
      idx.get(t.url).push({ gid: g.id, tid: t.id });
    }
  }
  return idx;
}

/* ───────── Carpetas ───────── */

export function addFolder(d, name) {
  const t = now();
  const existing = Object.values(d.folders);
  const f = {
    id: uid(),
    name: name.trim() || 'Carpeta nueva',
    color: FOLDER_COLORS[existing.length % FOLDER_COLORS.length],
    order: existing.reduce((m, x) => Math.max(m, x.order || 0), 0) + 1,
    createdAt: t,
    updatedAt: t
  };
  d.folders[f.id] = f;
  return f;
}

export function updateFolder(d, id, patch) {
  const f = d.folders[id];
  if (!f) return null;
  Object.assign(f, patch, { updatedAt: now() });
  return f;
}

/** Borra la carpeta; sus grupos pasan a "Sin carpeta". */
export function deleteFolder(d, id) {
  if (!d.folders[id]) return;
  delete d.folders[id];
  d.tombstones[id] = now();
  for (const g of Object.values(d.groups)) {
    if (g.folderId === id) updateGroup(d, g.id, { folderId: null });
  }
}

/* ───────── Equipos ───────── */

export function upsertDevice(d, { id, name, version }, at = now()) {
  const dev = d.devices[id];
  if (!dev) {
    d.devices[id] = { id, name, createdAt: at, updatedAt: at, lastSeen: at, ...(version ? { version } : {}) };
    return true;
  }
  let changed = false;
  if (name && dev.name !== name) { dev.name = name; changed = true; }
  // Versión de la extensión: decide si ya se puede subir el archivo comprimido (lib/pack.js).
  if (version && dev.version !== version) { dev.version = version; changed = true; }
  if (at - (dev.lastSeen || 0) > 12 * 3600 * 1000) { dev.lastSeen = at; changed = true; }
  if (changed) dev.updatedAt = at;
  return changed;
}

export function deleteDevice(d, id) {
  if (!d.devices[id]) return;
  delete d.devices[id];
  d.tombstones[id] = now();
}

export const sortedDevices = d => Object.values(d.devices).sort((a, b) => a.name.localeCompare(b.name));

/* ───────── Sesiones guardadas ───────── */

const cleanWindow = w => ({
  tabs: (w.tabs || []).filter(t => t?.url).map(t => {
    const tab = { url: String(t.url), title: String(t.title || t.url) };
    if (t.pinned) tab.pinned = true;
    if (Number.isInteger(t.tg)) tab.tg = t.tg;
    return tab;
  }),
  tabGroups: (w.tabGroups || []).map(x => ({ title: x.title || '', color: x.color || 'grey' }))
});

export function addSession(d, { name = '', windows = [], origin = null, createdAt } = {}) {
  const t = now();
  const s = {
    id: uid(),
    name: name.trim() || 'Sesión sin nombre',
    createdAt: createdAt || t,
    updatedAt: t,
    origin,
    windows: windows.map(cleanWindow).filter(w => w.tabs.length)
  };
  if (!s.windows.length) return null;
  d.sessions[s.id] = s;
  return s;
}

export function updateSession(d, id, patch) {
  const s = d.sessions[id];
  if (!s) return null;
  Object.assign(s, patch, { updatedAt: now() });
  return s;
}

export function deleteSession(d, id) {
  if (!d.sessions[id]) return;
  delete d.sessions[id];
  d.tombstones[id] = now();
}

export const sortedSessions = d => Object.values(d.sessions).sort((a, b) => b.createdAt - a.createdAt);
export const sessionTabCount = s => s.windows.reduce((n, w) => n + w.tabs.length, 0);

/**
 * Extrae pestañas de una sesión: picks = [{ w, t }] (índices). Devuelve las ventanas
 * resultantes (conservando grupos nativos) y, si remove, las quita del origen.
 * Si la sesión origen queda vacía se elimina.
 */
export function takeFromSession(d, sid, picks, remove = false) {
  const s = d.sessions[sid];
  if (!s) return [];
  const byWin = new Map();
  for (const { w, t } of picks) {
    if (!s.windows[w]?.tabs[t]) continue;
    if (!byWin.has(w)) byWin.set(w, new Set());
    byWin.get(w).add(t);
  }
  const out = [];
  for (const [wi, set] of [...byWin].sort((a, b) => a[0] - b[0])) {
    const win = s.windows[wi];
    const tabs = win.tabs.filter((_, i) => set.has(i)).map(x => ({ ...x }));
    out.push(remapWindow({ tabs, tabGroups: win.tabGroups }));
    if (remove) win.tabs = win.tabs.filter((_, i) => !set.has(i));
  }
  if (remove) {
    s.windows = s.windows.map(remapWindow).filter(w => w.tabs.length);
    if (!s.windows.length) deleteSession(d, sid);
    else s.updatedAt = now();
  }
  return out;
}

/** Reajusta los índices de grupos nativos de una ventana a los que realmente usa. */
function remapWindow(w) {
  const used = [...new Set(w.tabs.map(t => t.tg).filter(Number.isInteger))].sort((a, b) => a - b);
  const map = new Map(used.map((old, i) => [old, i]));
  return {
    tabs: w.tabs.map(t => {
      const x = { ...t };
      if (Number.isInteger(x.tg) && map.has(x.tg) && w.tabGroups?.[x.tg]) x.tg = map.get(x.tg);
      else delete x.tg;
      return x;
    }),
    tabGroups: used.map(i => w.tabGroups?.[i]).filter(Boolean)
  };
}

/** Convierte ventanas de una sesión en grupos de las listas (uno por ventana). */
export function sessionToGroups(d, { name, windows, origin, createdAt }) {
  return windows.map((w, i) => addGroup(d, {
    title: `${name}${windows.length > 1 ? `, ventana ${i + 1}` : ''}`,
    tabs: w.tabs.map(t => ({ url: t.url, title: t.title, tg: t.tg })),
    tabGroups: w.tabGroups || [],
    origin,
    createdAt: (createdAt || now()) - i
  }));
}

/* ───────── Capturas de pantalla (metadatos) ───────── */

export function addShot(d, meta) {
  const t = now();
  const shot = {
    id: meta.id || uid(),
    title: String(meta.title || meta.url || 'Captura'),
    url: String(meta.url || ''),
    createdAt: meta.createdAt || t,
    updatedAt: t,
    origin: meta.origin || null,
    kind: meta.kind || 'manual',
    mode: meta.mode || 'full',
    width: meta.width || 0,
    height: meta.height || 0,
    parts: (meta.parts || []).map(p => ({ w: p.w, h: p.h })),
    size: meta.size || 0,
    groupId: meta.groupId || null,
    localPaths: meta.localPaths || null,
    edits: meta.edits || null,
    files: null
  };
  d.shots[shot.id] = shot;
  return shot;
}

export function updateShot(d, id, patch) {
  const s = d.shots[id];
  if (!s) return null;
  Object.assign(s, patch, { updatedAt: now() });
  return s;
}

export function deleteShot(d, id) {
  if (!d.shots[id]) return;
  delete d.shots[id];
  d.tombstones[id] = now();
}

export const sortedShots = d => Object.values(d.shots).sort((a, b) => b.createdAt - a.createdAt);

/** Captura más reciente de cada URL (para mostrar el icono de cámara en las listas). */
export function shotsByUrl(d) {
  const map = new Map();
  for (const s of sortedShots(d)) if (s.url && !map.has(s.url)) map.set(s.url, s);
  return map;
}

/* ───────── Varios ───────── */

export function setExcludedDomains(d, list) {
  d.shared = {
    ...d.shared,
    excludedDomains: [...new Set(list.map(s => s.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean))],
    updatedAt: now()
  };
}

/** Elimina URLs repetidas en todas las listas; conserva la aparición más reciente. */
export function dedupeAll(d) {
  const seen = new Set();
  let removed = 0;
  for (const g of liveGroups(d).sort((a, b) => b.createdAt - a.createdAt)) {
    const drop = [];
    for (const t of g.tabs) {
      if (seen.has(t.url)) drop.push(t.id);
      else seen.add(t.url);
    }
    if (drop.length) { removed += drop.length; removeTabs(d, g.id, drop); }
  }
  return removed;
}

/**
 * Inserta grupos importados con ids nuevos. Las carpetas se reutilizan si ya
 * existe una con el mismo nombre. targetFolderId fuerza todas a una carpeta.
 */
export function importInto(d, { groups = [], folders = [] }, targetFolderId = null) {
  const folderMap = {};
  const byName = Object.fromEntries(Object.values(d.folders).map(f => [f.name.toLowerCase(), f.id]));
  for (const f of folders) {
    const key = (f.name || '').toLowerCase();
    if (!key) continue;
    if (!byName[key]) {
      const nf = addFolder(d, f.name);
      if (f.color) nf.color = f.color;
      byName[key] = nf.id;
    }
    folderMap[f.id] = byName[key];
  }
  let tabCount = 0, groupCount = 0;
  for (const g of groups) {
    if (!g.tabs?.length || g.trashedAt) continue;
    const ng = addGroup(d, {
      title: g.title || '',
      note: g.note || '',
      tabs: g.tabs.map(t => ({ url: t.url, title: t.title, tg: t.tg })),
      tabGroups: g.tabGroups || [],
      folderId: targetFolderId || (g.folderId ? folderMap[g.folderId] : null) || null,
      tags: g.tags || [],
      createdAt: g.createdAt
    });
    ng.locked = !!g.locked;
    ng.starred = !!g.starred;
    tabCount += ng.tabs.length;
    groupCount++;
  }
  return { groups: groupCount, tabs: tabCount };
}

/** Restaura instantáneas de grupos (para "Deshacer"). */
export function restoreSnapshots(d, snapshots) {
  const t = now();
  for (const s of snapshots) {
    d.groups[s.id] = { ...structuredClone(s), updatedAt: t };
    delete d.tombstones[s.id];
  }
}

/**
 * Sustituye los datos por los de una copia de seguridad, de forma que se
 * propague a los demás equipos: lo de la copia se marca como recién modificado
 * y lo que no estaba en la copia va a la papelera (recuperable).
 */
export function applyBackup(d, backup) {
  const b = normalizeData(backup);
  const t = now();
  for (const g of liveGroups(d)) if (!b.groups[g.id]) { g.trashedAt = t; g.updatedAt = t; }
  for (const [id, g] of Object.entries(b.groups)) {
    d.groups[id] = { ...structuredClone(g), updatedAt: t + 1 };
    delete d.tombstones[id];
  }
  for (const [id, f] of Object.entries(b.folders)) {
    d.folders[id] = { ...structuredClone(f), updatedAt: t + 1 };
    delete d.tombstones[id];
  }
  d.shared = { ...structuredClone(b.shared), updatedAt: t + 1 };
}

export function sortedFolders(d) {
  return Object.values(d.folders).sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
}

export function sortedGroups(d) {
  return liveGroups(d).sort((a, b) => b.createdAt - a.createdAt);
}

export function countTabs(d) {
  return liveGroups(d).reduce((n, g) => n + g.tabs.length, 0);
}
