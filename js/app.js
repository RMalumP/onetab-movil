// Interfaz de OneTab Móvil. Todo el texto que viene de los datos se escapa con esc().

import * as dbx from './dropbox.js';
import * as S from './sync.js';
import { liveGroups, trashedGroups, sortedFolders, sortedSessions, sessionTabCount, sortedShots, urlIndex, FOLDER_COLORS } from '../lib/ops.js';
import { escapeHtml as esc, domainOf, normalizeText, relativeTime, plural, formatDate } from '../lib/util.js';
import { presetTime, remindLabel } from '../lib/reminders.js';
import { parseImport, defaultImportTitle } from '../lib/formats.js';
import { LockedError } from '../lib/crypto.js';
import * as XF from './exchange.js';
import { kindOf, fmtSize, textNoteName, lonelyUrl } from '../lib/xfer.js';

const APP_VERSION = '1.4.0';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const sheet = $('#sheet');

/* ───────── Iconos (trazos, 24×24) ───────── */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  inbox: svg('<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
  session: svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  more: svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  open: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  note: svg('<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  send: svg('<path d="M4 12l16-8-6 16-2-7z"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  tag: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
  move: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>'),
  check: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/>'),
  box: svg('<rect x="4" y="4" width="16" height="16" rx="4"/>'),
  boxOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3L2 6M19 3l3 3"/>'),
  sort: svg('<path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"/>'),
  split: svg('<path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6"/>'),
  merge: svg('<path d="M6 3v6l6 6v6M18 3v6l-6 6"/>'),
  dup: svg('<rect x="3" y="7" width="12" height="12" rx="2"/><rect x="9" y="3" width="12" height="12" rx="2"/>'),
  backup: svg('<path d="M12 3a9 9 0 1 0 9 9"/><path d="M21 3v6h-6"/><path d="M12 8v4l3 2"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  block: svg('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>'),
  download: svg('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
  files: svg('<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M12 11v6M9.5 13.5L12 11l2.5 2.5"/>'),
  image: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-5 4 4 3-3 4 4"/>'),
  video: svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  audio: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  doc: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>'),
  file: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>')
};

/* ───────── Preferencias de esta app ───────── */
const prefs = (() => {
  const K = 'otm.prefs';
  const def = { theme: 'auto', sort: 'new', folder: 'all', device: 'all', swipe: 'open' };
  let p; try { p = { ...def, ...JSON.parse(localStorage.getItem(K) || '{}') }; } catch { p = def; }
  return { get: k => p[k], set: (k, v) => { p[k] = v; try { localStorage.setItem(K, JSON.stringify(p)); } catch { /* sin almacenamiento */ } } };
})();
const applyTheme = () => {
  const t = prefs.get('theme');
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
};

/* ───────── Utilidades ───────── */
const ui = { view: 'listas', q: '', open: new Set(), limit: 40, sel: null, backups: null, importing: null };
const safeHref = url => /^(https?|ftp):\/\//i.test(url || '') ? url : null;
const PALETTE = ['#2563a8', '#0e7c7b', '#7a4fb5', '#b5543a', '#5b7a1e', '#a83262', '#8a6d1f', '#4a5866'];
const favColor = host => { let h = 0; for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const me = () => S.getDevice();
const devName = id => (id && S.state.data.devices[id]?.name) || (id === me().id ? me().name : '');
const groupTitle = g => g.title || plural(g.tabs.length, 'pestaña', 'pestañas');
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };

const toastEl = $('#toast');
function toast(text, ms = 2800, undo = null) {
  toastEl.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button" class="toast-btn">Deshacer</button>' : ''}`;
  toastEl.hidden = false;
  if (undo) $('.toast-btn', toastEl).addEventListener('click', () => { toastEl.hidden = true; undo(); toast('Deshecho'); }, { once: true });
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, undo ? Math.max(ms, 6000) : ms);
}

/**
 * Aplica una operación y ofrece «Deshacer»: guarda cómo estaban los grupos afectados y, al deshacer,
 * los repone y quita los grupos que creó la operación (los que llevan su semilla en el id).
 */
function withUndo(op, label, gids = []) {
  const snaps = [...new Set(gids)].map(id => S.state.data.groups[id]).filter(Boolean).map(g => structuredClone(g));
  const seed = S.newId();
  S.enqueue({ ...op, seed });
  const extra = op.type === 'add' ? [op.id] : [];
  toast(label, 6000, () => {
    const created = Object.keys(S.state.data.groups).filter(id => id.startsWith(seed + '-'));
    S.enqueue({ type: 'restore', snapshots: snaps, remove: [...created, ...extra] });
  });
}

function highlight(text, q) {
  const s = String(text ?? '');
  if (!q) return esc(s);
  const n = normalizeText(s);
  const i = n.indexOf(q);
  if (i < 0 || n.length !== s.length) return esc(s);
  return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
}

async function copy(text, done = 'Copiado') {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { prompt('Copia el texto:', text); }
}

async function share({ title, text, url, files }) {
  if (files && navigator.canShare?.({ files })) { try { await navigator.share({ files, title }); } catch { /* cancelado */ } return; }
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); } catch { /* cancelado */ }
  } else copy(url || text);
}

/** Abre varias pestañas: el navegador suele bloquear todas menos la primera. */
function openMany(urls) {
  const list = urls.map(safeHref).filter(Boolean);
  let blocked = 0;
  for (const u of list) if (!window.open(u, '_blank', 'noopener')) blocked++;
  if (blocked) toast(`El navegador bloqueó ${blocked} de ${list.length}. Permite las ventanas emergentes o ábrelas una a una.`, 4500);
}

const groupLinks = g => g.tabs.map(t => t.url).join('\n');
const groupMarkdown = g => `${groupTitle(g)}\n` + g.tabs.map(t => `- ${t.title || t.url}: ${t.url}`).join('\n');

/* ───────── Hoja inferior ───────── */
function openSheet(html, bind) {
  sheet.innerHTML = `<div class="sheet-in"><div class="sheet-grip"></div>${html}</div>`;
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
  bind?.(sheet);
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

/** Menú de acciones: items = [[icono, texto, fn, clase?]] (los null se omiten). */
function menu(title, sub, items) {
  const real = items.filter(Boolean);
  openSheet(`<h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}<ul class="menu">${real.map(([ic, label, , cls], i) =>
    `<li><button data-i="${i}" class="${cls || ''}">${ic}<span>${esc(label)}</span></button></li>`).join('')}</ul>`, el => {
    el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { closeSheet(); real[+b.dataset.i][2](); }));
  });
}

/** Formulario sencillo: fields = [{name, label, type, value, options, placeholder}] */
function form(title, fields, submitLabel, onSubmit, sub = '') {
  const input = f => {
    if (f.type === 'select') return `<select class="field" name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea class="field" name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`;
    if (f.type === 'checkbox') return `<input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}>`;
    return `<input class="field" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
  };
  openSheet(`<h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}<form class="form" method="dialog">
    ${fields.map(f => f.type === 'checkbox'
      ? `<label class="opt">${input(f)} <span>${esc(f.label)}</span></label>`
      : `<label>${esc(f.label)}${input(f)}</label>`).join('')}
    <p class="err small" data-err></p>
    <div class="actions"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">${esc(submitLabel)}</button></div></form>`, el => {
    const f = $('form', el);
    $('[data-cancel]', el).addEventListener('click', closeSheet);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const vals = Object.fromEntries(fields.map(x => [x.name, x.type === 'checkbox' ? f.elements[x.name].checked : f.elements[x.name].value]));
      try { const keep = await onSubmit(vals); if (!keep) closeSheet(); }
      catch (err) { $('[data-err]', el).textContent = err.message || String(err); }
    });
    setTimeout(() => f.querySelector('input:not([type=checkbox]),textarea')?.focus(), 50);
  });
}

/* ───────── Acciones sobre grupos y pestañas ───────── */
const folderOptions = () => [['', 'Sin carpeta'], ...sortedFolders(S.state.data).map(f => [f.id, f.name])];
const otherDevices = () => Object.values(S.state.data.devices).filter(d => d.id !== me().id).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
const listTargets = (exclude = []) => liveGroups(S.state.data).filter(x => !exclude.includes(x.id) && !x.targetDevice && !x.locked).sort((a, b) => b.createdAt - a.createdAt);

/** Recordatorio para una o varias listas. */
function remindSheet(gids) {
  const gs = gids.map(id => S.state.data.groups[id]).filter(Boolean);
  const has = gs.some(g => g.remindAt);
  const set = at => {
    S.enqueue(gids.length === 1 ? { type: 'update', gid: gids[0], patch: { remindAt: at } } : { type: 'updateMany', gids, patch: { remindAt: at } });
    toast(at ? 'Recordatorio: ' + remindLabel(at) : 'Recordatorio quitado');
  };
  const presets = [['1h', 'Dentro de 1 hora'], ['eve', 'Esta tarde (18:00)'], ['tom', 'Mañana (9:00)'], ['mon', 'El lunes (9:00)']];
  menu('Recordar', gs.length === 1 ? groupTitle(gs[0]) : plural(gs.length, 'lista', 'listas'), [
    ...presets.map(([k, l]) => [I.clock, `${l} · ${remindLabel(presetTime(k))}`, () => set(presetTime(k))]),
    [I.edit, 'Elegir fecha y hora…', () => form('Fecha y hora', [{ name: 'at', label: 'Recordar el', type: 'datetime-local', value: '' }], 'Guardar', v => {
      const at = new Date(v.at).getTime();
      if (!at || at < Date.now()) throw new Error('Elige una fecha futura.');
      set(at);
    }, 'El aviso lo da la extensión en tu ordenador; aquí sale en «Para hoy».')],
    has ? [I.x, 'Quitar el recordatorio', () => set(null), 'danger'] : null
  ]);
}

function groupMenu(g) {
  const inbox = g.targetDevice === me().id;
  const domains = new Set(g.tabs.map(t => domainOf(t.url) || 'otros'));
  menu(groupTitle(g), `${plural(g.tabs.length, 'pestaña', 'pestañas')} · ${formatDate(g.createdAt)}${g.origin ? ' · desde ' + (devName(g.origin) || 'otro equipo') : ''}`, [
    [I.open, 'Abrir todas', () => openMany(g.tabs.map(t => t.url))],
    [I.copy, 'Copiar los enlaces', () => copy(groupLinks(g), 'Enlaces copiados')],
    [I.share, 'Compartir la lista', () => share({ title: groupTitle(g), text: groupMarkdown(g) })],
    inbox ? [I.inbox, 'Guardar en mis listas', () => S.enqueue({ type: 'update', gid: g.id, patch: { targetDevice: null } })] : null,
    [g.starred ? I.starFill : I.star, g.starred ? 'Quitar de destacadas' : 'Destacar', () => S.enqueue({ type: 'update', gid: g.id, patch: { starred: !g.starred } })],
    [I.clock, g.remindAt ? 'Recordatorio: ' + remindLabel(g.remindAt) : 'Recordar…', () => remindSheet([g.id])],
    [I.edit, 'Cambiar el nombre', () => form('Nombre de la lista', [{ name: 'title', label: 'Nombre', value: g.title, placeholder: groupTitle(g) }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { title: v.title.trim() } }))],
    [I.note, g.note ? 'Editar la nota' : 'Añadir una nota', () => form('Nota', [{ name: 'note', label: 'Nota', type: 'textarea', value: g.note }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { note: v.note } }))],
    [I.tag, 'Etiquetas', () => form('Etiquetas', [{ name: 'tags', label: 'Separadas por comas', value: (g.tags || []).join(', ') }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { tags: [...new Set(v.tags.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))] } }))],
    [I.folder, 'Mover a carpeta', () => form('Mover a carpeta', [{ name: 'folder', label: 'Carpeta', type: 'select', value: g.folderId || '', options: folderOptions() }], 'Mover',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { folderId: v.folder || null } }))],
    g.tabs.length > 1 ? [I.sort, 'Ordenar por título', () => withUndo({ type: 'sortTabs', gid: g.id, by: 'title' }, 'Ordenada por título', [g.id])] : null,
    g.tabs.length > 1 ? [I.sort, 'Ordenar por sitio', () => withUndo({ type: 'sortTabs', gid: g.id, by: 'domain' }, 'Ordenada por sitio', [g.id])] : null,
    domains.size > 1 && !g.locked ? [I.split, `Dividir por sitio (${domains.size} listas)`, () => withUndo({ type: 'split', gid: g.id }, `Dividida en ${domains.size} listas`, [g.id])] : null,
    otherDevices().length ? [I.send, 'Enviar a otro equipo', () => sendSheet([g.id])] : null,
    [I.lock, g.locked ? 'Desbloquear' : 'Bloquear (evita borrarla)', () => S.enqueue({ type: 'update', gid: g.id, patch: { locked: !g.locked } })],
    g.locked ? null : [I.trash, 'Mover a la papelera', () => withUndo({ type: 'trash', gid: g.id }, 'Lista en la papelera', [g.id]), 'danger']
  ]);
}

function sendSheet(gids) {
  form('Enviar a otro equipo', [{ name: 'dev', label: 'Equipo', type: 'select', value: '', options: otherDevices().map(x => [x.id, x.name]) }], 'Enviar', v => {
    S.enqueue(gids.length === 1 ? { type: 'update', gid: gids[0], patch: { targetDevice: v.dev } } : { type: 'updateMany', gids, patch: { targetDevice: v.dev } });
    toast('Le llegará a ' + devName(v.dev) + ' cuando sincronice.');
  }, 'La extensión de ese equipo lo recibirá en «Recibidas».');
}

function openAndRemove(g, t, open = true) {
  if (open) openMany([t.url]);
  if (g.locked) return;
  withUndo({ type: 'removeTabs', gid: g.id, tabIds: [t.id] }, open ? 'Abierta y quitada' : 'Pestaña quitada', [g.id]);
}

function tabMenu(g, t) {
  const others = listTargets([g.id]);
  menu(t.title || t.url, t.url, [
    [I.open, 'Abrir', () => openMany([t.url])],
    g.locked ? null : [I.check, 'Abrir y quitar', () => openAndRemove(g, t)],
    [I.copy, 'Copiar el enlace', () => copy(t.url, 'Enlace copiado')],
    [I.share, 'Compartir', () => share({ title: t.title, url: t.url })],
    others.length && !g.locked ? [I.move, 'Mover a otra lista', () => moveSheet([{ gid: g.id, tid: t.id }])] : null,
    g.locked ? null : [I.x, 'Quitar de la lista', () => openAndRemove(g, t, false), 'danger']
  ]);
}

function moveSheet(refs) {
  const gids = [...new Set(refs.map(r => r.gid))];
  const others = listTargets(gids.length === 1 ? gids : []);
  form('Mover a otra lista', [{ name: 'to', label: 'Lista', type: 'select', value: '', options: [['', '➕ Lista nueva'], ...others.slice(0, 300).map(x => [x.id, groupTitle(x).slice(0, 60)])] },
    { name: 'title', label: 'Nombre (si es nueva)', value: '' }], 'Mover', v => {
    withUndo({ type: 'moveTabs', refs, to: v.to || null, title: v.title.trim(), origin: me().id }, `${plural(refs.length, 'pestaña movida', 'pestañas movidas')}`, [...gids, v.to].filter(Boolean));
    if (ui.sel) ui.sel = null;
  });
}

function parseLinks(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    // Formato de OneTab «url | título» o un texto con una dirección dentro.
    const m = line.match(/(https?:\/\/[^\s|]+)\s*(?:\|\s*(.*))?/i);
    if (m) out.push({ url: m[1].replace(/[)\].,;]+$/, ''), title: (m[2] || '').trim() });
  }
  return out;
}

function addForm(prefill = {}) {
  const devs = otherDevices();
  form('Añadir enlaces', [
    { name: 'links', label: 'Enlaces (uno por línea)', type: 'textarea', value: prefill.links || '', placeholder: 'https://…' },
    { name: 'title', label: 'Nombre de la lista (opcional)', value: prefill.title || '' },
    { name: 'folder', label: 'Carpeta', type: 'select', value: '', options: folderOptions() },
    { name: 'dest', label: 'Destino', type: 'select', value: '', options: [['', 'Mis listas'], ...devs.map(x => [x.id, 'Enviar a ' + x.name])] }
  ], 'Guardar', v => {
    const links = parseLinks(v.links);
    if (!links.length) throw new Error('No encuentro ninguna dirección http(s).');
    withUndo({
      type: 'add', id: S.newId(), title: v.title.trim() || (links.length === 1 ? links[0].title || '' : ''),
      tabs: links.map(l => ({ id: S.newId(), url: l.url, title: l.title || l.url })),
      folderId: v.folder || null, targetDevice: v.dest || null, origin: me().id
    }, v.dest ? `Enviado a ${devName(v.dest)}` : 'Guardado');
  });
}

/* ───────── Selección múltiple ───────── */
const selCount = () => ui.sel ? ui.sel.g.size + ui.sel.t.size : 0;
function selRefs() {
  const d = S.state.data, refs = [], seen = new Set();
  const add = (gid, tid) => { const k = gid + '|' + tid; if (!seen.has(k) && d.groups[gid]?.tabs.some(t => t.id === tid)) { seen.add(k); refs.push({ gid, tid }); } };
  for (const gid of ui.sel.g) for (const t of d.groups[gid]?.tabs || []) add(gid, t.id);
  for (const k of ui.sel.t) { const [gid, tid] = k.split('|'); add(gid, tid); }
  return refs;
}
const refUrls = refs => refs.map(r => S.state.data.groups[r.gid]?.tabs.find(t => t.id === r.tid)?.url).filter(Boolean);
const endSel = () => { ui.sel = null; render(); };

function selMenu() {
  const d = S.state.data;
  const gids = [...ui.sel.g].filter(id => d.groups[id]);
  const onlyGroups = gids.length && !ui.sel.t.size;
  const refs = selRefs();
  if (!refs.length && !gids.length) return toast('No has seleccionado nada.');
  const unlocked = gids.filter(id => !d.groups[id].locked);
  menu(`${plural(selCount(), 'elemento seleccionado', 'elementos seleccionados')}`, `${plural(refs.length, 'pestaña', 'pestañas')} en total`, [
    [I.open, 'Abrir todas', () => openMany(refUrls(refs))],
    [I.copy, 'Copiar los enlaces', () => copy(refUrls(refs).join('\n'), 'Enlaces copiados')],
    onlyGroups && unlocked.length > 1 ? [I.merge, `Juntar ${unlocked.length} listas en una`, () => form('Juntar listas', [{ name: 'title', label: 'Nombre de la lista resultante', value: d.groups[unlocked[0]].title }], 'Juntar', v => {
      withUndo({ type: 'mergeGroups', gids: unlocked, title: v.title.trim() }, 'Listas juntadas', unlocked); endSel();
    })] : null,
    refs.length ? [I.move, 'Mover las pestañas a…', () => moveSheet(refs)] : null,
    onlyGroups ? [I.folder, 'Mover a carpeta', () => form('Mover a carpeta', [{ name: 'folder', label: 'Carpeta', type: 'select', value: '', options: folderOptions() }], 'Mover', v => {
      S.enqueue({ type: 'updateMany', gids, patch: { folderId: v.folder || null } }); endSel();
    })] : null,
    onlyGroups ? [I.star, 'Destacar', () => { S.enqueue({ type: 'updateMany', gids, patch: { starred: true } }); endSel(); }] : null,
    onlyGroups ? [I.clock, 'Recordar…', () => remindSheet(gids)] : null,
    onlyGroups && otherDevices().length ? [I.send, 'Enviar a otro equipo', () => { sendSheet(gids); ui.sel = null; }] : null,
    onlyGroups ? [I.trash, 'Mover a la papelera', () => { withUndo({ type: 'trashMany', gids }, plural(unlocked.length, 'lista en la papelera', 'listas en la papelera'), gids); endSel(); }, 'danger']
      : [I.x, 'Quitar las pestañas', () => { withUndo({ type: 'removeMany', refs }, plural(refs.length, 'pestaña quitada', 'pestañas quitadas'), refs.map(r => r.gid)); endSel(); }, 'danger']
  ]);
}

/* ───────── Vistas ───────── */

function tabRow(g, t, q) {
  const href = safeHref(t.url);
  const host = domainOf(t.url) || '?';
  const key = `${g.id}|${t.id}`;
  const inner = `<span class="fav" style="background:${favColor(host)}">${esc(host[0])}</span>
    <span class="t-txt"><span class="t-title">${highlight(t.title || t.url, q)}</span><span class="t-url">${highlight(host, q)}</span></span>`;
  if (ui.sel) {
    const on = ui.sel.t.has(key) || ui.sel.g.has(g.id);
    return `<li class="tab-wrap"><div class="tab"><button class="tab-sel" data-seltab="${esc(key)}" aria-pressed="${on}"><span class="box ${on ? 'on' : ''}">${on ? I.boxOn : I.box}</span>${inner}</button></div></li>`;
  }
  const canSwipe = !g.locked;
  return `<li class="tab-wrap" ${canSwipe ? `data-swipe="${esc(key)}"` : ''}>${canSwipe ? `<div class="swipe-bg">${prefs.get('swipe') === 'remove' ? 'Quitar' : 'Abrir y quitar'} ${I.check}</div>` : ''}
    <div class="tab">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<a role="button" tabindex="0" data-copy="${esc(t.url)}">${inner}</a>`}
    <button class="icon-btn" data-tab="${esc(key)}" aria-label="Opciones de la pestaña">${I.more}</button></div></li>`;
}

function groupCard(g, q, matchTabs = null) {
  const d = S.state.data;
  const f = g.folderId && d.folders[g.folderId];
  const open = ui.open.has(g.id) || !!matchTabs;
  const tabs = matchTabs || g.tabs;
  let lastTg = null;
  const rows = open ? tabs.map(t => {
    const tg = Number.isInteger(t.tg) ? g.tabGroups?.[t.tg] : null;
    const label = tg && t.tg !== lastTg ? `<li class="tg">▸ ${esc(tg.title || 'Grupo sin nombre')}</li>` : '';
    lastTg = tg ? t.tg : null;
    return label + tabRow(g, t, q);
  }).join('') : '';
  const selOn = ui.sel?.g.has(g.id);
  const overdue = g.remindAt && g.remindAt <= Date.now();
  return `<article class="group ${selOn ? 'selected' : ''}" data-gid="${esc(g.id)}">
    <div class="g-head">
      ${ui.sel ? `<button class="icon-btn sel-btn" data-selgroup="${esc(g.id)}" aria-pressed="${!!selOn}" aria-label="Seleccionar la lista">${selOn ? I.boxOn : I.box}</button>` : ''}
      <button class="g-main" data-toggle="${esc(g.id)}" aria-expanded="${open}">
        <div class="g-title">${g.locked ? '🔒 ' : ''}${highlight(groupTitle(g), q)}</div>
        <div class="g-meta"><span>${plural(g.tabs.length, 'pestaña', 'pestañas')}</span><span>${relativeTime(g.createdAt)}</span>
          ${g.origin && devName(g.origin) ? `<span>${esc(devName(g.origin))}</span>` : ''}
          ${g.remindAt ? `<span class="chip ${overdue ? 'due' : ''}">⏰ ${esc(remindLabel(g.remindAt))}</span>` : ''}
          ${f ? `<span class="chip"><i style="background:${esc(f.color || FOLDER_COLORS[0])}"></i>${esc(f.name)}</span>` : ''}
          ${(g.tags || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}
          ${g.targetDevice && g.targetDevice !== me().id ? `<span class="chip">→ ${esc(devName(g.targetDevice) || 'otro equipo')}</span>` : ''}
        </div>
      </button>
      ${ui.sel ? '' : `<button class="icon-btn ${g.starred ? 'on' : ''}" data-star="${esc(g.id)}" aria-label="${g.starred ? 'Quitar de destacadas' : 'Destacar'}">${g.starred ? I.starFill : I.star}</button>
      <button class="icon-btn" data-gmenu="${esc(g.id)}" aria-label="Opciones de la lista">${I.more}</button>`}
    </div>
    ${open && g.note ? `<div class="g-note">${esc(g.note)}</div>` : ''}
    ${open ? `<ul class="tabs">${rows}</ul>` : ''}
  </article>`;
}

/** Filtra por búsqueda: devuelve [{g, m: pestañas que coinciden | null}] */
function searchGroups(groups, q) {
  if (!q) return groups.map(g => ({ g, m: null }));
  if (q === 'is:duplicada') {
    const idx = urlIndex(S.state.data);
    return groups.map(g => ({ g, m: g.tabs.filter(t => idx.get(t.url)?.length > 1) })).filter(x => x.m.length);
  }
  if (q === 'is:recordatorio') return groups.filter(g => g.remindAt).map(g => ({ g, m: null }));
  const tagQ = q.startsWith('#') ? q.slice(1) : null;
  const out = [];
  for (const g of groups) {
    if (tagQ !== null) { if ((g.tags || []).some(t => normalizeText(t).includes(tagQ))) out.push({ g, m: null }); continue; }
    const inGroup = normalizeText(g.title).includes(q) || normalizeText(g.note).includes(q);
    const tabs = g.tabs.filter(t => normalizeText(t.title).includes(q) || normalizeText(t.url).includes(q));
    if (inGroup) out.push({ g, m: null });
    else if (tabs.length) out.push({ g, m: tabs });
  }
  return out;
}

function sortGroups(gs) {
  const s = prefs.get('sort');
  if (s === 'old') return gs.sort((a, b) => a.createdAt - b.createdAt);
  if (s === 'name') return gs.sort((a, b) => groupTitle(a).localeCompare(groupTitle(b), 'es'));
  if (s === 'size') return gs.sort((a, b) => b.tabs.length - a.tabs.length);
  return gs.sort((a, b) => b.createdAt - a.createdAt);
}

function viewListas() {
  const d = S.state.data;
  const folder = prefs.get('folder'), dev = prefs.get('device');
  const all = liveGroups(d).filter(g => !g.targetDevice);
  let gs = all;
  if (folder === 'starred') gs = gs.filter(g => g.starred);
  else if (folder === 'remind') gs = gs.filter(g => g.remindAt);
  else if (folder === 'none') gs = gs.filter(g => !g.folderId);
  else if (folder !== 'all') gs = gs.filter(g => g.folderId === folder);
  if (dev !== 'all') gs = gs.filter(g => g.origin === dev);
  const q = normalizeText(ui.q.trim());
  const found = searchGroups(sortGroups(gs), q);
  const tabsTotal = found.reduce((n, x) => n + (x.m ? x.m.length : x.g.tabs.length), 0);
  const shown = found.slice(0, ui.limit);
  if (!Object.keys(d.groups).length) {
    return `<div class="empty"><h2>No hay listas todavía</h2><p>${S.state.exists ? 'Envía pestañas desde la extensión o pulsa + para guardar un enlace.' : 'La extensión aún no ha subido datos a este Dropbox. Conecta Dropbox en la extensión (Ajustes → Sincronización) o pulsa + para empezar.'}</p></div>`;
  }
  // «Para hoy»: listas con recordatorio hasta el final del día (solo en la vista general sin búsqueda).
  const today = !q && folder === 'all' && dev === 'all' && !ui.sel
    ? all.filter(g => g.remindAt && g.remindAt <= endOfToday()).sort((a, b) => a.remindAt - b.remindAt) : [];
  const todayIds = new Set(today.map(g => g.id));
  return `${today.length ? `<h2 class="section">⏰ Para hoy</h2>${today.map(g => groupCard(g, '')).join('')}<h2 class="section">Todas</h2>` : ''}
    <p class="count">${plural(found.length, 'lista', 'listas')} · ${plural(tabsTotal, 'pestaña', 'pestañas')}</p>
    ${shown.filter(x => !todayIds.has(x.g.id)).map(x => groupCard(x.g, q, x.m)).join('') || (today.length ? '' : `<div class="empty"><h2>Nada por aquí</h2><p>${q ? 'Ninguna pestaña coincide con la búsqueda.' : 'Cambia el filtro para ver otras listas.'}</p></div>`)}
    ${found.length > shown.length ? `<div class="more"><button class="btn" data-more>Mostrar más (${found.length - shown.length})</button></div>` : ''}`;
}

function viewRecibidas() {
  const all = liveGroups(S.state.data);
  const inbox = all.filter(g => g.targetDevice === me().id).sort((a, b) => b.createdAt - a.createdAt);
  const out = all.filter(g => g.targetDevice && g.targetDevice !== me().id).sort((a, b) => b.createdAt - a.createdAt);
  return `${inbox.length ? `<p class="count">Recibidas en este móvil: ${plural(inbox.length, 'lista', 'listas')}. Pulsa ⋯ → «Guardar en mis listas» cuando las hayas visto.</p>${inbox.map(g => groupCard(g, '')).join('')}`
    : `<div class="empty"><h2>No has recibido nada</h2><p>En el ordenador, usa «Enviar a otro equipo» → <b>${esc(me().name)}</b> desde el menú de la extensión.${S.state.data.devices[me().id] ? '' : ' Este móvil aparecerá allí tras la primera sincronización.'}</p></div>`}
    ${out.length ? `<h2 class="section">Enviadas a otros equipos (pendientes de recibir)</h2>${out.map(g => groupCard(g, '')).join('')}` : ''}`;
}

function viewSesiones() {
  const ss = sortedSessions(S.state.data);
  if (!ss.length) return `<div class="empty"><h2>No hay sesiones guardadas</h2><p>Guarda ventanas como sesión desde la extensión y aparecerán aquí.</p></div>`;
  return `<p class="count">${plural(ss.length, 'sesión', 'sesiones')}</p>` + ss.map(s => {
    const open = ui.open.has(s.id);
    return `<article class="group">
      <div class="g-head"><button class="g-main" data-toggle="${esc(s.id)}" aria-expanded="${open}"><div class="g-title">${esc(s.name)}</div>
        <div class="g-meta"><span>${plural(s.windows.length, 'ventana', 'ventanas')} · ${plural(sessionTabCount(s), 'pestaña', 'pestañas')}</span><span>${relativeTime(s.createdAt)}</span>${s.origin && devName(s.origin) ? `<span>${esc(devName(s.origin))}</span>` : ''}</div></button>
        <button class="icon-btn" data-smenu="${esc(s.id)}" aria-label="Opciones de la sesión">${I.more}</button></div>
      ${open ? s.windows.map((w, i) => `<p class="tg">Ventana ${i + 1}</p><ul class="tabs">${w.tabs.map(t => tabRowPlain(t)).join('')}</ul>`).join('') : ''}
    </article>`;
  }).join('');
}

function tabRowPlain(t) {
  const href = safeHref(t.url);
  const host = domainOf(t.url) || '?';
  return `<li class="tab-wrap"><div class="tab"><a ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : ''}><span class="fav" style="background:${favColor(host)}">${esc(host[0])}</span>
    <span class="t-txt"><span class="t-title">${t.pinned ? '📌 ' : ''}${esc(t.title || t.url)}</span><span class="t-url">${esc(host)}</span></span></a></div></li>`;
}

function sessionMenu(s) {
  const urls = s.windows.flatMap(w => w.tabs.map(t => t.url));
  menu(s.name, `${plural(urls.length, 'pestaña', 'pestañas')} · ${formatDate(s.createdAt)}`, [
    [I.open, 'Abrir todas', () => openMany(urls)],
    [I.copy, 'Copiar los enlaces', () => copy(urls.join('\n'), 'Enlaces copiados')],
    [I.list, 'Convertir en listas', () => withUndo({ type: 'sessionToGroups', sid: s.id, origin: me().id }, 'Añadida a tus listas')],
    [I.trash, 'Borrar la sesión', () => { if (confirm(`¿Borrar la sesión «${s.name}»?`)) S.enqueue({ type: 'deleteSession', sid: s.id }); }, 'danger']
  ]);
}

/* ── Capturas ── */
const thumbUrls = new Map();   // id de archivo → URL de objeto (se reutiliza entre repintados)
const cloudShots = d => sortedShots(d).filter(s => s.files?.thumb && (s.files.provider || 'google') === 'dropbox');

function viewCapturas() {
  const d = S.state.data;
  const all = sortedShots(d);
  const shots = cloudShots(d);
  if (!all.length) return `<div class="empty"><h2>No hay capturas</h2><p>Las capturas de pantalla que hagas con la extensión aparecerán aquí si su sincronización está activada.</p></div>`;
  const missing = all.length - shots.length;
  return `<p class="count">${plural(shots.length, 'captura', 'capturas')}${missing ? ` · ${missing} sin miniatura en Dropbox` : ''}</p>
    <div class="shots">${shots.slice(0, ui.limit).map(s => `<button class="shot" data-shot="${esc(s.id)}">
      <span class="shot-img"><img alt="" data-thumb="${esc(s.files.thumb)}" ${thumbUrls.has(s.files.thumb) ? `src="${thumbUrls.get(s.files.thumb)}"` : ''}></span>
      <span class="shot-t">${esc(s.title || domainOf(s.url) || 'Captura')}</span><span class="shot-d">${relativeTime(s.createdAt)}</span></button>`).join('')}</div>
    ${shots.length > ui.limit ? `<div class="more"><button class="btn" data-more>Mostrar más (${shots.length - ui.limit})</button></div>` : ''}
    ${missing ? '<p class="muted small">Para ver aquí todas las capturas, en la extensión elige en Ajustes → Capturas que se sincronicen las miniaturas o las imágenes completas con Dropbox.</p>' : ''}`;
}

let thumbQueue = [], thumbBusy = 0;
function loadThumbs() {
  thumbQueue = [...app.querySelectorAll('img[data-thumb]:not([src])')];
  for (let i = 0; i < 4; i++) pumpThumbs();
}
async function pumpThumbs() {
  if (thumbBusy >= 4) return;
  const img = thumbQueue.shift();
  if (!img) return;
  thumbBusy++;
  const id = img.dataset.thumb;
  try {
    if (!thumbUrls.has(id)) thumbUrls.set(id, URL.createObjectURL(await S.shotImage(id, 'image/jpeg')));
    document.querySelectorAll(`img[data-thumb="${CSS.escape(id)}"]`).forEach(x => { x.src = thumbUrls.get(id); });
  } catch (e) {
    img.closest('.shot-img')?.classList.add('broken');
    if (!(e instanceof LockedError)) console.warn('Miniatura', e);
  } finally { thumbBusy--; pumpThumbs(); }
}

async function shotViewer(s) {
  const href = safeHref(s.url);
  const full = s.files?.parts?.length;
  openSheet(`<h3>${esc(s.title || 'Captura')}</h3><p class="sub">${esc(formatDate(s.createdAt))}${s.width ? ` · ${s.width}×${s.height}` : ''}${s.origin && devName(s.origin) ? ' · ' + esc(devName(s.origin)) : ''}</p>
    <div class="row">${href ? `<a class="btn" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${I.open} Abrir la página</a>` : ''}
      <button class="btn" data-sh="share">${I.share} Compartir</button><button class="btn" data-sh="save">${I.download} Guardar</button>
      <button class="btn danger" data-sh="del">${I.trash} Borrar</button></div>
    ${full ? '' : '<p class="muted small">Solo está la miniatura en Dropbox. La imagen completa sigue en el equipo donde se hizo (o elige «imágenes completas» en Ajustes → Capturas de la extensión).</p>'}
    <div class="viewer" data-viewer><p class="muted">Cargando…</p></div>`, async el => {
    let blobs = [];
    const box = $('[data-viewer]', el);
    try {
      blobs = full ? await Promise.all(s.files.parts.map(id => S.shotImage(id, 'image/png'))) : [await S.shotImage(s.files.thumb, 'image/jpeg')];
      box.innerHTML = '';
      for (const b of blobs) { const im = new Image(); im.src = URL.createObjectURL(b); im.alt = ''; box.append(im); }
    } catch (e) { box.innerHTML = `<p class="err">${esc(e instanceof LockedError ? 'Falta la contraseña de cifrado.' : 'No se pudo descargar: ' + (e.message || e))}</p>`; }
    const fileName = (s.title || 'captura').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) + (full ? '.png' : '.jpg');
    el.querySelectorAll('[data-sh]').forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.sh === 'del') {
        if (!confirm('¿Borrar esta captura de todos tus equipos?')) return;
        S.enqueue({ type: 'deleteShot', id: s.id }); closeSheet(); return toast('Captura borrada');
      }
      if (!blobs.length) return;
      const files = blobs.map((bl, i) => new File([bl], blobs.length > 1 ? fileName.replace(/(\.\w+)$/, `-${i + 1}$1`) : fileName, { type: bl.type }));
      if (b.dataset.sh === 'share') return share({ title: s.title, files, url: s.url });
      for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    }));
  });
}

/* ── Archivos: bandeja compartida con el ordenador ── */
const XKIND = { image: 'image', video: 'video', audio: 'audio', text: 'doc', pdf: 'doc', other: 'file' };
const xEntry = id => XF.X.entries.find(e => e.id === id);

function xRow(e) {
  const X = XF.X;
  const k = kindOf(e.name);
  const thumb = X.thumbs.get(e.id);
  const text = X.texts.get(e.id);
  const busy = X.busy.get(e.id);
  const fresh = X.fresh.has(e.id);
  return `<div class="xf-row${fresh ? ' fresh' : ''}">
    <button class="xf-open" data-xfopen="${esc(e.id)}">
      <span class="xf-ic">${thumb ? `<img alt="" src="${thumb}">` : I[XKIND[k]]}</span>
      <span class="xf-main"><span class="xf-name">${esc(e.name)}</span>
        <span class="xf-meta">${esc(fmtSize(e.size))} · ${relativeTime(Date.parse(e.server_modified))}${fresh ? ' <span class="xf-new">Nuevo</span>' : ''}</span>
        ${text != null ? `<span class="xf-snip">${esc(text.slice(0, 200))}</span>` : ''}
        <span class="xf-bar" data-xfbar="${esc(e.id)}" ${busy == null ? 'hidden' : ''}><i style="width:${Math.round((busy || 0) * 100)}%"></i></span></span>
    </button>
    <button class="icon-btn xf-get" data-xfget="${esc(e.id)}" aria-label="Guardar ${esc(e.name)}">${I.download}</button>
  </div>`;
}

function viewArchivos() {
  const X = XF.X;
  const ups = X.uploads.map((u, i) => `<li class="${u.error ? 'err' : ''}">
    <span class="xf-name">${esc(u.name)}</span>
    <span class="xf-meta">${u.error ? esc(u.error) : u.done ? 'Enviado ✓' : u.started ? `${Math.round(u.sent / (u.size || 1) * 100)} %` : 'Esperando…'}</span>
    ${u.error ? `<span class="row">${u.file ? `<button class="btn" data-xfretry="${i}">Reintentar</button>` : ''}${u.code === 'too-big-encrypted' && u.file ? `<button class="btn" data-xfplain="${i}">Enviar sin cifrar</button>` : ''}<button class="btn" data-xfdismiss="${i}">Quitar</button></span>`
      : u.done ? '' : `<span class="xf-bar"><i style="width:${Math.round(u.sent / (u.size || 1) * 100)}%"></i></span>`}</li>`).join('');
  const list = X.entries.length ? `<div class="xf-list">${X.entries.map(xRow).join('')}</div>`
    : X.loading || !X.loaded ? (X.error ? '' : '<p class="boot">Cargando la bandeja…</p>')
    : `<div class="empty"><h2>La bandeja está vacía</h2><p>Lo que sueltes en <b>Archivos del móvil</b> de la extensión aparecerá aquí${X.live ? ' al momento' : ''}.</p></div>`;
  return `<div class="xf-send">
      <label class="btn primary xf-pick">${I.upload}<span>Enviar al ordenador</span><input type="file" id="xf-file" multiple hidden></label>
      <button class="btn" data-xftext>${I.note}<span>Texto</span></button>
    </div>
    ${ups ? `<ul class="xf-up">${ups}</ul>` : ''}
    <div class="xf-head"><span class="count">${X.entries.length ? plural(X.entries.length, 'archivo', 'archivos') : ''}</span>
      ${X.live ? '<span class="xf-live">En directo</span>' : ''}
      <button class="icon-btn" data-xfrefresh aria-label="Actualizar">${I.sync}</button></div>
    ${X.error ? `<p class="err">${esc(X.error)}</p>` : ''}
    ${list}
    <p class="muted small xf-foot">Truco: desde la galería o cualquier app, <b>Compartir → OneTab</b> lo envía directamente. Los archivos están en tu Dropbox (Aplicaciones › … › Intercambio)${S.state.encrypted ? ' y se suben cifrados con tu contraseña' : ''}.</p>`;
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

function setBusy(id, v) {
  if (v == null) XF.X.busy.delete(id); else XF.X.busy.set(id, v);
  const bar = document.querySelector(`[data-xfbar="${CSS.escape(id)}"]`);
  if (bar) { bar.hidden = v == null; bar.firstElementChild.style.width = Math.round((v || 0) * 100) + '%'; }
}

/** Descarga con progreso en la fila. Devuelve el Blob o null si falla (ya avisado). */
async function xFetch(e) {
  setBusy(e.id, 0);
  try {
    const blob = await XF.fetchFile(e, n => setBusy(e.id, e.size ? n / e.size : 0));
    XF.markSeen([e.id]);
    return blob;
  } catch (err) {
    toast(err instanceof LockedError ? 'Falta la contraseña de cifrado.' : 'No se pudo descargar: ' + (err.message || err), 4000);
    return null;
  } finally { setBusy(e.id, null); }
}

async function xSave(e) {
  const blob = await xFetch(e);
  if (blob) { saveBlob(blob, e.name); toast('Guardado en Descargas'); }
}

function xTextForm(prefill = '') {
  form('Enviar un texto al ordenador', [{ name: 'text', label: 'Texto o enlace', type: 'textarea', value: prefill, placeholder: 'Escribe o pega aquí…' }], 'Enviar', v => {
    const t = v.text.trim();
    if (!t) throw new Error('Escribe algo primero.');
    XF.enqueue([new File([t], textNoteName(), { type: 'text/plain' })], t);
    if (ui.view !== 'archivos') location.hash = 'archivos';
  }, 'Aparecerá en «Archivos del móvil» de la extensión, con un botón para copiarlo.');
}

function xSheet(e) {
  const k = kindOf(e.name);
  const thumb = XF.X.thumbs.get(e.id);
  openSheet(`<h3>${esc(e.name)}</h3><p class="sub">${esc(fmtSize(e.size))} · ${esc(formatDate(Date.parse(e.server_modified)))}</p>
    <div class="row xf-acts">
      <button class="btn primary" data-xs="save">${I.download} Guardar</button>
      <button class="btn" data-xs="share">${I.share} Compartir</button>
      ${k === 'text' ? `<button class="btn" data-xs="copy">${I.copy} Copiar</button>` : ''}
      <span data-xs-link></span>
      <button class="btn danger" data-xs="del">${I.trash} Borrar</button>
    </div>
    <div class="viewer" data-viewer>${thumb ? `<img alt="" src="${thumb}">` : ''}${['image', 'text', 'video', 'audio'].includes(k) && e.size < 60 * 1024 * 1024 ? '<p class="muted">Cargando…</p>' : ''}</div>`, async el => {
    const box = $('[data-viewer]', el);
    let blob = null;
    const get = async () => blob ??= await xFetch(e);
    if (['image', 'text', 'video', 'audio'].includes(k) && e.size < 60 * 1024 * 1024) {
      const b = await get();
      if (b && sheet.open) {
        if (k === 'text') {
          const t = await b.text();
          XF.X.texts.set(e.id, t);
          box.innerHTML = `<pre class="xf-pre">${esc(t)}</pre>`;
          const u = safeHref(lonelyUrl(t));
          if (u) $('[data-xs-link]', el).outerHTML = `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${I.open} Abrir enlace</a>`;
        } else {
          const media = document.createElement(k === 'image' ? 'img' : k);
          media.src = URL.createObjectURL(b);
          if (k !== 'image') { media.controls = true; media.playsInline = true; }
          media.alt = '';
          box.replaceChildren(media);
        }
      } else if (!b) box.innerHTML = '';
    }
    el.querySelectorAll('[data-xs]').forEach(btn => btn.addEventListener('click', async () => {
      const act = btn.dataset.xs;
      if (act === 'del') {
        if (!confirm(`¿Borrar «${e.name}» de la bandeja? Desaparece también del ordenador.`)) return;
        closeSheet();
        try { await XF.remove(e); toast('Borrado'); } catch (err) { toast('No se pudo borrar: ' + (err.message || err)); }
        return;
      }
      const b = await get();
      if (!b) return;
      if (act === 'save') { saveBlob(b, e.name); toast('Guardado en Descargas'); }
      if (act === 'copy') copy(await b.text(), 'Texto copiado');
      if (act === 'share') {
        const f = new File([b], e.name, { type: b.type });
        if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: e.name }); } catch { /* cancelado */ } }
        else if (k === 'text') share({ title: e.name, text: await b.text() });
        else toast('Este navegador no puede compartir archivos. Usa «Guardar».');
      }
    }));
  });
}

/* ── Más: papelera, duplicados, copias, importar, excluidos ── */
function dupInfo() {
  const d = S.state.data;
  const idx = urlIndex(d);
  const dups = [...idx].filter(([, refs]) => refs.length > 1);
  const extra = dups.reduce((n, [, r]) => n + r.length - 1, 0);
  return { d, dups, extra };
}

function viewMas() {
  const d = S.state.data;
  const trash = trashedGroups(d).length;
  const { extra } = dupInfo();
  const row = (href, icon, label, info = '') => `<a class="mrow" href="#${href}">${icon}<span>${label}</span><span class="muted small">${info}</span>${I.chevron}</a>`;
  return `<nav class="panel mlist">
    ${row('papelera', I.trash, 'Papelera', trash ? plural(trash, 'lista', 'listas') : '')}
    ${row('duplicados', I.dup, 'Duplicados', extra ? plural(extra, 'repetida', 'repetidas') : '')}
    ${row('copias', I.backup, 'Copias de seguridad')}
    ${row('importar', I.upload, 'Importar')}
    ${row('excluidos', I.block, 'Sitios excluidos', d.shared.excludedDomains?.length ? String(d.shared.excludedDomains.length) : '')}
    ${row('ajustes', I.gear, 'Ajustes')}
  </nav>`;
}

function viewPapelera() {
  const gs = trashedGroups(S.state.data);
  if (!gs.length) return `<div class="empty"><h2>La papelera está vacía</h2><p>Las listas que borres quedan aquí 30 días.</p></div>`;
  return `<div class="row" style="justify-content:space-between"><p class="count">${plural(gs.length, 'lista', 'listas')} · se borran solas a los 30 días</p>
    <button class="btn danger" data-empty-trash>Vaciar</button></div>
    ${gs.map(g => `<article class="group"><div class="g-head"><div class="g-main"><div class="g-title">${esc(groupTitle(g))}</div>
      <div class="g-meta"><span>${plural(g.tabs.length, 'pestaña', 'pestañas')}</span><span>borrada ${relativeTime(g.trashedAt)}</span></div></div>
      <button class="icon-btn" data-untrash="${esc(g.id)}" aria-label="Restaurar">${I.undo}</button>
      <button class="icon-btn" data-purge="${esc(g.id)}" aria-label="Borrar para siempre">${I.x}</button></div></article>`).join('')}`;
}

function viewDuplicados() {
  const { d, dups, extra } = dupInfo();
  if (!dups.length) return `<div class="empty"><h2>No hay pestañas repetidas</h2><p>Ninguna dirección aparece en más de una lista.</p></div>`;
  return `<section class="panel"><p><b>${plural(extra, 'pestaña repetida', 'pestañas repetidas')}</b> (${plural(dups.length, 'dirección', 'direcciones')}). Al limpiar se conserva la de la lista más reciente y se quitan las demás; las listas que se queden vacías se borran.</p>
    <div class="row"><button class="btn primary" data-dedupe>Quitar duplicados</button><button class="btn" data-dupsearch>Verlas en Listas</button></div></section>
    <ul class="list-plain dup-list">${dups.slice(0, 200).map(([url, refs]) => {
      const t = d.groups[refs[0].gid]?.tabs.find(x => x.id === refs[0].tid);
      return `<li><span><b>${esc(t?.title || url)}</b><br><span class="muted small">${esc(domainOf(url))} · en ${refs.map(r => esc(groupTitle(d.groups[r.gid]))).join(', ')}</span></span><span class="chip">×${refs.length}</span></li>`;
    }).join('')}</ul>
    ${dups.length > 200 ? `<p class="muted small">Y ${dups.length - 200} más.</p>` : ''}`;
}

function viewCopias() {
  if (!ui.backups) {
    ui.backups = { loading: true };
    S.listBackups().then(list => { ui.backups = { list }; render(); }, e => { ui.backups = { error: e.message || String(e) }; render(); });
  }
  const b = ui.backups;
  const intro = '<p class="muted small">La extensión guarda una copia al día en tu Dropbox. Al restaurar una, todos tus equipos vuelven a ese estado; las listas que no estaban en la copia pasan a la papelera (no se pierden).</p>';
  if (b.loading) return intro + '<p class="boot">Buscando copias…</p>';
  if (b.error) return intro + `<p class="err">${esc(b.error)}</p><button class="btn" data-reload-backups>Reintentar</button>`;
  if (!b.list.length) return intro + '<div class="empty"><h2>No hay copias</h2><p>La extensión las crea al sincronizar (una al día).</p></div>';
  return intro + `<ul class="list-plain">${b.list.map(f => {
    const m = f.name.match(/(\d{4})-(\d{2})-(\d{2})/);
    const label = m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : f.name;
    return `<li><span>${esc(label)}<br><span class="muted small">${Math.max(1, Math.round(f.size / 1024))} KB</span></span><button class="btn" data-backup="${esc(f.id)}" data-label="${esc(label)}">Ver</button></li>`;
  }).join('')}</ul>`;
}

async function backupSheet(id, label) {
  openSheet(`<h3>Copia del ${esc(label)}</h3><div data-b><p class="muted">Descargando…</p></div>`, async el => {
    const box = $('[data-b]', el);
    try {
      const data = await S.readBackup(id);
      const gs = liveGroups(data), cur = liveGroups(S.state.data);
      const tabs = gs.reduce((n, g) => n + g.tabs.length, 0), curTabs = cur.reduce((n, g) => n + g.tabs.length, 0);
      box.innerHTML = `<p>${plural(gs.length, 'lista', 'listas')} y ${plural(tabs, 'pestaña', 'pestañas')} (ahora tienes ${cur.length} y ${curTabs}).</p>
        <ul class="list-plain">${gs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map(g => `<li><span>${esc(groupTitle(g))}</span><span class="muted small">${g.tabs.length}</span></li>`).join('')}</ul>
        <p class="err small" data-err></p>
        <div class="actions row" style="justify-content:flex-end"><button class="btn" data-cancel>Cerrar</button><button class="btn primary" data-restore>Restaurar esta copia</button></div>`;
      $('[data-cancel]', box).addEventListener('click', closeSheet);
      $('[data-restore]', box).addEventListener('click', async e => {
        if (!confirm('¿Restaurar esta copia en todos tus equipos? Lo que no esté en ella irá a la papelera.')) return;
        e.target.disabled = true; e.target.textContent = 'Restaurando…';
        try { await S.restoreBackup(data); closeSheet(); toast('Copia restaurada'); }
        catch (err) { $('[data-err]', box).textContent = err.message || String(err); e.target.disabled = false; e.target.textContent = 'Restaurar esta copia'; }
      });
    } catch (e) { box.innerHTML = `<p class="err">${esc(e instanceof LockedError ? 'Esta copia está cifrada con otra contraseña.' : e.message || String(e))}</p>`; }
  });
}

function viewImportar() {
  const imp = ui.importing;
  return `<section class="panel"><h2>Importar listas</h2>
    <p class="muted small">Pega enlaces o una exportación de OneTab («dirección | título», listas separadas por una línea en blanco), o elige un archivo TXT, CSV, JSON o de marcadores HTML exportado por OneTab Drive o por tu navegador.</p>
    <textarea class="field" id="imp-text" placeholder="https://…">${esc(imp?.text || '')}</textarea>
    <div class="row" style="margin-top:8px"><label class="btn">${I.folder} Elegir archivo<input type="file" id="imp-file" accept=".txt,.csv,.json,.html,.htm,text/*" hidden></label>
      <button class="btn primary" data-imp-parse>Revisar</button></div>
    ${imp?.result ? `<div class="imp-res"><p><b>${plural(imp.result.groups.length, 'lista', 'listas')}</b> con ${plural(imp.result.groups.reduce((n, g) => n + g.tabs.length, 0), 'pestaña', 'pestañas')} (formato ${esc(imp.result.format.toUpperCase())}).</p>
      <label class="small">Carpeta<select class="field" id="imp-folder">${folderOptions().map(([v, l]) => `<option value="${esc(v)}">${esc(v ? l : 'La de cada lista / sin carpeta')}</option>`).join('')}</select></label>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-imp-do>Importar</button></div></div>` : ''}
    ${imp?.error ? `<p class="err">${esc(imp.error)}</p>` : ''}
  </section>`;
}

function doImportParse() {
  const text = $('#imp-text').value;
  const name = ui.importing?.fileName || '';
  try {
    const r = parseImport(text, name);
    const groups = r.groups.filter(g => g.tabs?.length);
    if (!groups.length) throw new Error('No he encontrado ninguna dirección en el texto.');
    // Sin título: una sola lista importada se nombra con la fecha, como en la extensión.
    if (groups.length === 1 && !groups[0].title) groups[0].title = defaultImportTitle();
    ui.importing = { text, fileName: name, result: { ...r, groups } };
  } catch (e) { ui.importing = { text, fileName: name, error: e.message || String(e) }; }
  render();
}

function viewExcluidos() {
  const list = S.state.data.shared.excludedDomains || [];
  return `<section class="panel"><h2>Sitios excluidos</h2>
    <p class="muted small">La extensión nunca guarda pestañas de estos sitios al enviar pestañas (incluye sus subdominios). Uno por línea, por ejemplo <code>mail.google.com</code>.</p>
    <textarea class="field" id="excl" placeholder="ejemplo.com">${esc(list.join('\n'))}</textarea>
    <div class="row" style="margin-top:8px"><button class="btn primary" data-excl-save>Guardar</button></div>
  </section>`;
}

function viewAjustes() {
  const st = S.state, d = st.data;
  const folders = sortedFolders(d);
  const devs = Object.values(d.devices).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  return `
  <section class="panel"><h2>Dropbox</h2>
    <p>${dbx.accountEmail() ? `Conectado como <b>${esc(dbx.accountEmail())}</b>.` : 'Conectado.'} ${st.lastSync ? 'Última sincronización ' + relativeTime(st.lastSync) + '.' : ''}</p>
    ${st.pending ? `<p>${plural(st.pending, 'cambio pendiente', 'cambios pendientes')} de subir.</p>` : ''}
    ${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
    <div class="row"><button class="btn" data-sync>${I.sync} Sincronizar ahora</button><button class="btn danger" data-logout>Cerrar sesión</button></div>
  </section>
  <section class="panel"><h2>Este móvil</h2>
    <p class="muted small">Así aparece en «Enviar a otro equipo» de la extensión.</p>
    <div class="row"><input class="field" style="flex:1" id="dev-name" value="${esc(me().name)}" maxlength="60"><button class="btn" data-rename-dev>Guardar</button></div>
  </section>
  <section class="panel"><h2>Al deslizar una pestaña a la izquierda</h2>
    <select class="field" id="swipe">${[['open', 'Abrir y quitar de la lista'], ['remove', 'Solo quitar de la lista']].map(([v, l]) => `<option value="${v}" ${prefs.get('swipe') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </section>
  <section class="panel"><h2>Cifrado</h2>
    ${st.encrypted ? `<p>Tus datos están cifrados con tu contraseña (AES-256). ${S.rememberedKey() ? 'Este dispositivo la recuerda.' : 'Se pedirá cada vez que abras la app.'}</p>
      ${S.rememberedKey() ? '<button class="btn" data-forget>Olvidar la contraseña en este dispositivo</button>' : ''}`
      : '<p>Tus datos de Dropbox no están cifrados. Puedes activar el cifrado en la extensión (Ajustes → Cifrado); aquí se pedirá la contraseña.</p>'}
  </section>
  <section class="panel"><h2>Carpetas</h2>
    <ul class="list-plain">${folders.map(f => `<li><span class="chip"><i style="background:${esc(f.color)}"></i></span><span>${esc(f.name)}</span>
      <button class="icon-btn" data-frename="${esc(f.id)}" aria-label="Cambiar nombre">${I.edit}</button>
      <button class="icon-btn" data-fdelete="${esc(f.id)}" aria-label="Borrar carpeta">${I.trash}</button></li>`).join('') || '<li class="muted">Ninguna.</li>'}</ul>
    <button class="btn" data-fadd>${I.plus} Nueva carpeta</button>
  </section>
  <section class="panel"><h2>Equipos</h2>
    <ul class="list-plain">${devs.map(x => `<li><span>${esc(x.name)}${x.id === me().id ? ' (este)' : ''}</span><span class="muted small" style="flex:none">${relativeTime(x.lastSeen)}</span></li>`).join('') || '<li class="muted">Ninguno.</li>'}</ul>
  </section>
  <section class="panel"><h2>Apariencia</h2>
    <select class="field" id="theme">${[['auto', 'Según el sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<option value="${v}" ${prefs.get('theme') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </section>
  <section class="panel"><h2>Exportar</h2>
    <p class="muted small">Copia de todas tus listas en formato OneTab («dirección | título»), que la extensión puede importar.</p>
    <div class="row"><button class="btn" data-export="copy">${I.copy} Copiar</button><button class="btn" data-export="file">${I.download} Descargar .txt</button></div>
  </section>
  <p class="muted small" style="text-align:center">OneTab Móvil ${APP_VERSION} · compatible con OneTab Drive 4.x · sin servidores: habla solo con Dropbox.</p>`;
}

function exportText() {
  return sortGroups(liveGroups(S.state.data).filter(g => !g.targetDevice))
    .map(g => g.tabs.map(t => `${t.url} | ${t.title || t.url}`).join('\n')).join('\n\n') + '\n';
}

/* ───────── Pantallas especiales ───────── */

function renderLogin(error = '') {
  app.innerHTML = `<div class="hero">
    <img src="icons/icon-192.png" alt="">
    <h1>OneTab Móvil</h1>
    <p>Consulta y ordena desde el móvil las pestañas que guardas con la extensión OneTab Drive. Usa tu propio Dropbox: no hay servidores intermedios.</p>
    <button class="btn primary" data-login style="min-width:240px">Iniciar sesión con Dropbox</button>
    ${error ? `<p class="err" style="margin-top:14px">${esc(error)}</p>` : ''}
  </div>`;
  $('[data-login]').addEventListener('click', () => dbx.startLogin().catch(e => renderLogin(e.message)));
}

function renderLocked() {
  app.innerHTML = `<div class="hero">
    <img src="icons/icon-192.png" alt="">
    <h1>Datos cifrados</h1>
    <p>Introduce la contraseña de cifrado que pusiste en la extensión. Nunca sale de este dispositivo.</p>
    <form class="panel form" id="unlock">
      <label>Contraseña<input class="field" type="password" name="pw" autocomplete="current-password" required minlength="1"></label>
      <label class="opt"><input type="checkbox" name="remember" checked> <span>Recordar en este dispositivo</span></label>
      <p class="err small" data-err></p>
      <button class="btn primary block">Desbloquear</button>
      <button type="button" class="btn block" data-logout>Cerrar sesión de Dropbox</button>
    </form></div>`;
  const f = $('#unlock');
  f.pw.focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('.btn.primary', f);
    btn.disabled = true; btn.textContent = 'Comprobando…';
    try { await S.unlock(f.pw.value, f.remember.checked); }
    catch (err) { $('[data-err]', f).textContent = err.message; btn.disabled = false; btn.textContent = 'Desbloquear'; }
  });
  $('[data-logout]', f).addEventListener('click', logout);
}

async function logout() {
  if (S.pendingCount() && !confirm(`Hay ${plural(S.pendingCount(), 'cambio', 'cambios')} sin subir que se perderán. ¿Cerrar sesión?`)) return;
  await S.wipe();
  XF.reset();
  thumbUrls.clear();
  render();
}

/* ───────── Render principal ───────── */

const TITLES = { listas: 'Listas', recibidas: 'Recibidas', sesiones: 'Sesiones', capturas: 'Capturas', archivos: 'Archivos', mas: 'Más',
  papelera: 'Papelera', duplicados: 'Duplicados', copias: 'Copias de seguridad', importar: 'Importar', excluidos: 'Sitios excluidos', ajustes: 'Ajustes' };
const SUB = new Set(['papelera', 'duplicados', 'copias', 'importar', 'excluidos', 'ajustes']);

function statusPill() {
  const st = S.state;
  const s = st.status;
  const text = s === 'syncing' ? 'Sincronizando…'
    : s === 'offline' ? (st.pending ? `Sin conexión · ${st.pending} pendientes` : 'Sin conexión')
    : s === 'error' ? 'Error · reintentar'
    : st.pending ? `${st.pending} pendientes`
    : st.lastSync ? 'Al día' : 'Sincronizar';
  return `<button class="pill" data-s="${s}" data-sync title="${esc(st.error || (st.lastSync ? 'Última sincronización ' + relativeTime(st.lastSync) : ''))}"><span class="dot"></span>${esc(text)}</button>`;
}

function render() {
  if (!dbx.isConnected()) return renderLogin();
  if (S.state.status === 'locked') return renderLocked();
  if (!S.state.loaded && S.state.status !== 'error' && S.state.status !== 'offline') {
    app.innerHTML = `<p class="boot">Cargando tus listas de Dropbox…</p>`;
    return;
  }
  const d = S.state.data;
  const inboxN = liveGroups(d).filter(g => g.targetDevice === me().id).length;
  navigator.setAppBadge?.(inboxN || 0).catch?.(() => {});
  const v = ui.view;
  const selectable = v === 'listas' || v === 'recibidas';
  if (!selectable) ui.sel = null;
  const filters = v === 'listas' ? `<div class="search"><input class="field" id="q" type="search" placeholder="Buscar título, dirección o #etiqueta" value="${esc(ui.q)}" autocomplete="off"></div>
    <div class="filters">
      <select class="field" id="f-folder" aria-label="Carpeta">${[['all', 'Todas'], ['starred', '★ Destacadas'], ['remind', '⏰ Con recordatorio'], ['none', 'Sin carpeta'], ...sortedFolders(d).map(f => [f.id, f.name])].map(([id, l]) => `<option value="${esc(id)}" ${prefs.get('folder') === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="f-device" aria-label="Equipo">${[['all', 'Todos los equipos'], ...Object.values(d.devices).map(x => [x.id, x.name])].map(([id, l]) => `<option value="${esc(id)}" ${prefs.get('device') === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="f-sort" aria-label="Orden">${[['new', 'Más recientes'], ['old', 'Más antiguas'], ['name', 'Por nombre'], ['size', 'Más pestañas']].map(([id, l]) => `<option value="${id}" ${prefs.get('sort') === id ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>` : '';
  const views = { listas: viewListas, recibidas: viewRecibidas, sesiones: viewSesiones, capturas: viewCapturas, archivos: viewArchivos, mas: viewMas,
    papelera: viewPapelera, duplicados: viewDuplicados, copias: viewCopias, importar: viewImportar, excluidos: viewExcluidos, ajustes: viewAjustes };
  const body = views[v]();
  const navItem = (id, icon, label, badge = 0) => `<a href="#${id}" ${v === id || (id === 'mas' && SUB.has(v)) ? 'aria-current="page"' : ''}>${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const focused = document.activeElement?.id === 'q' ? document.activeElement.selectionStart : null;
  const y = window.scrollY;
  const bottom = ui.sel
    ? `<div class="selbar"><button class="btn" data-sel-cancel>Cancelar</button><span class="selcount">${plural(selCount(), 'seleccionado', 'seleccionados')}</span>
        <button class="btn" data-sel-all>Todo</button><button class="btn primary" data-sel-menu ${selCount() ? '' : 'disabled'}>Acciones</button></div>`
    : `<nav class="nav" aria-label="Secciones"><div class="nav-in">
      ${navItem('listas', I.list, 'Listas')}${navItem('recibidas', I.inbox, 'Recibidas', inboxN)}${navItem('sesiones', I.session, 'Sesiones')}${navItem('capturas', I.camera, 'Capturas')}${navItem('archivos', I.files, 'Archivos', XF.freshCount())}${navItem('mas', I.menu, 'Más')}
    </div></nav>`;
  app.innerHTML = `<header class="top"><div class="top-row">${SUB.has(v) ? `<a class="icon-btn back" href="#mas" aria-label="Volver">${I.undo}</a>` : ''}<h1>${TITLES[v]}</h1>
      ${selectable && !ui.sel ? `<button class="icon-btn" data-sel-start aria-label="Seleccionar varias">${I.check}</button>` : ''}${statusPill()}</div>${filters}</header>
    <main class="main" id="main">${body}</main>
    ${selectable && !ui.sel ? `<button class="fab" data-add aria-label="Añadir enlaces">${I.plus}</button>` : ''}
    ${bottom}`;
  if (focused !== null) { const q = $('#q'); q.focus(); q.setSelectionRange(focused, focused); }
  window.scrollTo(0, y);
  if (v === 'capturas') loadThumbs();
}

/* ───────── Eventos ───────── */

const findGroup = id => S.state.data.groups[id];
let suppressClick = false;

app.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target.closest('button, a[data-copy]');
  if (!t) return;
  const ds = t.dataset;
  if ('sync' in ds) return S.sync();
  if ('xftext' in ds) return xTextForm();
  if ('xfrefresh' in ds) return XF.refresh();
  if (ds.xfopen) { const e = xEntry(ds.xfopen); return e && xSheet(e); }
  if (ds.xfget) { const e = xEntry(ds.xfget); return e && xSave(e); }
  if (ds.xfretry) return XF.retry(+ds.xfretry);
  if (ds.xfplain) return XF.retry(+ds.xfplain, true);
  if (ds.xfdismiss) return XF.dismiss(+ds.xfdismiss);
  if ('add' in ds) return addForm();
  if ('more' in ds) { ui.limit += 60; return render(); }
  if ('selStart' in ds) { ui.sel = { g: new Set(), t: new Set() }; return render(); }
  if ('selCancel' in ds) return endSel();
  if ('selMenu' in ds) return selMenu();
  if ('selAll' in ds) {
    const ids = ui.view === 'recibidas' ? liveGroups(S.state.data).filter(g => g.targetDevice).map(g => g.id)
      : [...app.querySelectorAll('.group[data-gid]')].map(el => el.dataset.gid);
    const allOn = ids.every(id => ui.sel.g.has(id));
    ids.forEach(id => allOn ? ui.sel.g.delete(id) : ui.sel.g.add(id));
    return render();
  }
  if (ds.selgroup) { const s = ui.sel.g; s.has(ds.selgroup) ? s.delete(ds.selgroup) : s.add(ds.selgroup); return render(); }
  if (ds.seltab) {
    const [gid] = ds.seltab.split('|');
    if (ui.sel.g.has(gid)) { // estaba toda la lista: se pasa a pestañas sueltas menos esta
      ui.sel.g.delete(gid);
      for (const tab of findGroup(gid)?.tabs || []) ui.sel.t.add(`${gid}|${tab.id}`);
      ui.sel.t.delete(ds.seltab);
    } else ui.sel.t.has(ds.seltab) ? ui.sel.t.delete(ds.seltab) : ui.sel.t.add(ds.seltab);
    return render();
  }
  if (ds.toggle) { ui.open.has(ds.toggle) ? ui.open.delete(ds.toggle) : ui.open.add(ds.toggle); return render(); }
  if (ds.star) { const g = findGroup(ds.star); return g && S.enqueue({ type: 'update', gid: g.id, patch: { starred: !g.starred } }); }
  if (ds.gmenu) { const g = findGroup(ds.gmenu); return g && groupMenu(g); }
  if (ds.tab) { const [gid, tid] = ds.tab.split('|'); const g = findGroup(gid); const tab = g?.tabs.find(x => x.id === tid); return tab && tabMenu(g, tab); }
  if (ds.copy) return copy(ds.copy, 'Dirección copiada');
  if (ds.smenu) { const s = S.state.data.sessions[ds.smenu]; return s && sessionMenu(s); }
  if (ds.shot) { const s = S.state.data.shots[ds.shot]; return s && shotViewer(s); }
  if (ds.untrash) { withUndo({ type: 'untrash', gid: ds.untrash }, 'Lista restaurada', [ds.untrash]); return; }
  if (ds.purge) { if (confirm('¿Borrar esta lista para siempre?')) S.enqueue({ type: 'delete', gid: ds.purge }); return; }
  if ('emptyTrash' in ds) { if (confirm('¿Vaciar la papelera? No se puede deshacer.')) S.enqueue({ type: 'emptyTrash' }); return; }
  if ('dedupe' in ds) {
    const { dups, extra } = dupInfo();
    return withUndo({ type: 'dedupe' }, plural(extra, 'duplicado quitado', 'duplicados quitados'), dups.flatMap(([, r]) => r.map(x => x.gid)));
  }
  if ('dupsearch' in ds) { ui.q = 'is:duplicada'; prefs.set('folder', 'all'); prefs.set('device', 'all'); location.hash = 'listas'; return; }
  if ('reloadBackups' in ds) { ui.backups = null; return render(); }
  if (ds.backup) return backupSheet(ds.backup, ds.label);
  if ('impParse' in ds) return doImportParse();
  if ('impDo' in ds) {
    const r = ui.importing?.result;
    if (!r) return;
    withUndo({ type: 'import', groups: r.groups, folders: r.folders || [], folderId: $('#imp-folder').value || null }, `${plural(r.groups.length, 'lista importada', 'listas importadas')}`);
    ui.importing = null; location.hash = 'listas'; return;
  }
  if ('exclSave' in ds) { S.enqueue({ type: 'excluded', list: $('#excl').value.split(/[\n,]+/) }); return toast('Sitios excluidos guardados'); }
  if ('logout' in ds) return logout();
  if ('renameDev' in ds) { S.renameDevice($('#dev-name').value); return toast('Nombre guardado'); }
  if ('forget' in ds) { S.forgetKeys(); toast('Contraseña olvidada en este dispositivo'); return render(); }
  if ('fadd' in ds) return form('Nueva carpeta', [{ name: 'name', label: 'Nombre' }], 'Crear', v => S.enqueue({ type: 'addFolder', id: S.newId(), name: v.name }));
  if (ds.frename) { const f = S.state.data.folders[ds.frename]; return f && form('Cambiar nombre', [{ name: 'name', label: 'Nombre', value: f.name }], 'Guardar', v => S.enqueue({ type: 'renameFolder', id: f.id, name: v.name })); }
  if (ds.fdelete) { const f = S.state.data.folders[ds.fdelete]; if (f && confirm(`¿Borrar la carpeta «${f.name}»? Sus listas pasan a «Sin carpeta».`)) S.enqueue({ type: 'deleteFolder', id: f.id }); return; }
  if (ds.export === 'copy') return copy(exportText(), 'Listas copiadas');
  if (ds.export === 'file') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportText()], { type: 'text/plain' }));
    a.download = `onetab-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}, true);

let qTimer = null;
app.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; ui.limit = 40; clearTimeout(qTimer); qTimer = setTimeout(render, 150); }
  if (e.target.id === 'imp-text' && ui.importing?.result) ui.importing = { text: e.target.value };
});
app.addEventListener('change', async e => {
  const id = e.target.id;
  if (id === 'f-folder') { prefs.set('folder', e.target.value); ui.limit = 40; render(); }
  if (id === 'f-device') { prefs.set('device', e.target.value); ui.limit = 40; render(); }
  if (id === 'f-sort') { prefs.set('sort', e.target.value); render(); }
  if (id === 'theme') { prefs.set('theme', e.target.value); applyTheme(); }
  if (id === 'swipe') { prefs.set('swipe', e.target.value); toast('Guardado'); }
  if (id === 'xf-file') { const files = [...e.target.files]; e.target.value = ''; if (files.length) XF.enqueue(files); }
  if (id === 'imp-file') {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast('El archivo es demasiado grande.');
    ui.importing = { text: await file.text(), fileName: file.name };
    $('#imp-text').value = ui.importing.text.slice(0, 200000);
    doImportParse();
  }
});

/* ── Deslizar una pestaña a la izquierda: abrir y quitar (o solo quitar) ── */
let sw = null;
const SWIPE_AT = 96;
app.addEventListener('pointerdown', e => {
  const wrap = e.target.closest('[data-swipe]');
  if (!wrap || ui.sel || e.pointerType === 'mouse' || e.target.closest('.icon-btn')) return;
  sw = { wrap, row: $('.tab', wrap), x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
});
app.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
    if (dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.5) { sw.active = true; sw.wrap.classList.add('swiping'); } else return;
  }
  sw.dx = Math.max(-window.innerWidth, Math.min(0, dx));
  sw.row.style.transform = `translateX(${sw.dx}px)`;
  sw.wrap.classList.toggle('armed', sw.dx < -SWIPE_AT);
});
const endSwipe = e => {
  if (!sw || (e && e.pointerId !== sw.id)) return;
  const s = sw; sw = null;
  if (!s.active) return;
  suppressClick = true; setTimeout(() => { suppressClick = false; }, 400);
  const fire = e?.type === 'pointerup' && s.dx < -SWIPE_AT;
  s.row.style.transition = 'transform .18s ease';
  s.row.style.transform = fire ? 'translateX(-100%)' : '';
  s.wrap.classList.remove('armed', 'swiping');
  if (!fire) return;
  const [gid, tid] = s.wrap.dataset.swipe.split('|');
  const g = findGroup(gid), t = g?.tabs.find(x => x.id === tid);
  if (t) openAndRemove(g, t, prefs.get('swipe') !== 'remove');
};
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);

function route() {
  const h = location.hash.slice(1);
  if (h === 'anadir') { history.replaceState(null, '', location.pathname); ui.view = 'listas'; render(); return addForm(); }
  const next = TITLES[h] ? h : 'listas';
  if (next !== ui.view) { ui.limit = 40; if (next === 'copias') ui.backups = null; }
  ui.view = next;
  render();
  window.scrollTo(0, 0);
  liveFiles();
}

/** La bandeja escucha cambios solo con la pestaña Archivos abierta y la app a la vista. */
function liveFiles() {
  if (ui.view === 'archivos' && document.visibilityState === 'visible' && dbx.isConnected()) { if (XF.X.loaded) XF.refresh(); XF.startLive(); }
  else XF.stopLive();
}
window.addEventListener('hashchange', route);

// Repintar al cambiar los datos, sin perder el desplazamiento.
let raf = 0;
S.subscribe(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!sheet.open || S.state.status === 'locked') render(); }); });
XF.subscribe(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!sheet.open) render(); }); });
sheet.addEventListener('close', () => render());

window.addEventListener('online', () => S.scheduleSync(300));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.scheduleSync(200); liveFiles(); });
setInterval(() => { if (document.visibilityState === 'visible') S.scheduleSync(); }, 60000);

/* ───────── Arranque ───────── */

/** Lo compartido desde otra app (menú Compartir de Android): abre «Añadir» con el enlace. */
function takeShare() {
  const q = new URLSearchParams(location.search);
  if (!q.has('share_url') && !q.has('share_text') && !q.has('share_title')) return null;
  history.replaceState(null, '', dbx.redirectUri());
  const url = q.get('share_url') || '';
  const text = q.get('share_text') || '';
  const title = q.get('share_title') || '';
  const links = parseLinks([url, text].join('\n')).map(l => l.url);
  return { links: [...new Set(links)].map(u => `${u} | ${title || u}`).join('\n'), title: '' };
}

/** Lo compartido con la versión 1.2 (POST con archivos, lo guarda el service worker). */
async function takeSharedFiles() {
  // Se mira siempre (no solo con ?compartido): si había que iniciar sesión antes, sigue esperando unos minutos.
  if (new URLSearchParams(location.search).has('compartido')) history.replaceState(null, '', dbx.redirectUri());
  const p = await S.takeShared();
  if (!p) return null;
  const files = (p.files || []).filter(f => f && (f.size || f.name));
  if (files.length) return { files };
  const links = parseLinks([p.url, p.text].join('\n')).map(l => l.url);
  if (links.length) return { links: [...new Set(links)].map(u => `${u} | ${p.title || u}`).join('\n'), title: '' };
  const text = [p.title, p.text].filter(Boolean).join('\n').trim();
  return text ? { text } : null;
}

(async function start() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const linkShare = takeShare();
  try {
    if (await dbx.finishLogin()) toast('Sesión iniciada');
  } catch (e) { return renderLogin(e.message); }
  if (!dbx.isConnected()) return renderLogin();
  await S.loadCache();
  route();
  S.sync();
  if (ui.view !== 'archivos') XF.refresh(); // una sola consulta, para el contador de «Archivos» (sin quedarse escuchando)
  const shared = linkShare || await takeSharedFiles().catch(() => null);
  if (shared?.files) {
    location.hash = 'archivos';
    XF.enqueue(shared.files);
    toast(`Enviando ${plural(shared.files.length, 'archivo', 'archivos')} al ordenador…`);
  } else if (shared?.text) { location.hash = 'archivos'; xTextForm(shared.text); }
  else if (shared) { ui.view = 'listas'; render(); addForm(shared); }
})();
