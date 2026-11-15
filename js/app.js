// Interfaz de OneTab Móvil. Todo el texto que viene de los datos se escapa con esc().

import * as dbx from './dropbox.js';
import * as S from './sync.js';
import { liveGroups, trashedGroups, sortedFolders, sortedSessions, sessionTabCount, FOLDER_COLORS } from '../lib/ops.js';
import { escapeHtml as esc, domainOf, normalizeText, relativeTime, plural, formatDate } from '../lib/util.js';

const APP_VERSION = '1.0.0';
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const sheet = $('#sheet');

/* ───────── Iconos (trazos, 24×24) ───────── */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
  inbox: svg('<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
  session: svg('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
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
  sync: svg('<path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3"/><path d="M4 4v4h4M20 20v-4h-4"/>')
};

/* ───────── Preferencias de esta app ───────── */
const prefs = (() => {
  const K = 'otm.prefs';
  const def = { theme: 'auto', sort: 'new', folder: 'all', device: 'all' };
  let p; try { p = { ...def, ...JSON.parse(localStorage.getItem(K) || '{}') }; } catch { p = def; }
  return { get: k => p[k], set: (k, v) => { p[k] = v; try { localStorage.setItem(K, JSON.stringify(p)); } catch { /* sin almacenamiento */ } } };
})();
const applyTheme = () => {
  const t = prefs.get('theme');
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
};

/* ───────── Utilidades ───────── */
const ui = { view: 'listas', q: '', open: new Set(), limit: 40 };
const safeHref = url => /^(https?|ftp):\/\//i.test(url || '') ? url : null;
const PALETTE = ['#2563a8', '#0e7c7b', '#7a4fb5', '#b5543a', '#5b7a1e', '#a83262', '#8a6d1f', '#4a5866'];
const favColor = host => { let h = 0; for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const me = () => S.getDevice();
const devName = id => (id && S.state.data.devices[id]?.name) || (id === me().id ? me().name : '');
const groupTitle = g => g.title || plural(g.tabs.length, 'pestaña', 'pestañas');

function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
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

async function share({ title, text, url }) {
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
  bind?.(sheet);
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

/** Menú de acciones: items = [[icono, texto, fn, clase?]] */
function menu(title, sub, items) {
  openSheet(`<h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}<ul class="menu">${items.filter(Boolean).map(([ic, label, , cls], i) =>
    `<li><button data-i="${i}" class="${cls || ''}">${ic}<span>${esc(label)}</span></button></li>`).join('')}</ul>`, el => {
    const real = items.filter(Boolean);
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
      ? `<label class="opt" style="display:flex;gap:10px;align-items:center">${input(f)} <span>${esc(f.label)}</span></label>`
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

function groupMenu(g) {
  const d = S.state.data;
  const inbox = g.targetDevice === me().id;
  menu(groupTitle(g), `${plural(g.tabs.length, 'pestaña', 'pestañas')} · ${formatDate(g.createdAt)}${g.origin ? ' · desde ' + (devName(g.origin) || 'otro equipo') : ''}`, [
    [I.open, 'Abrir todas', () => openMany(g.tabs.map(t => t.url))],
    [I.copy, 'Copiar los enlaces', () => copy(groupLinks(g), 'Enlaces copiados')],
    [I.share, 'Compartir la lista', () => share({ title: groupTitle(g), text: groupMarkdown(g) })],
    inbox ? [I.inbox, 'Guardar en mis listas', () => S.enqueue({ type: 'update', gid: g.id, patch: { targetDevice: null } })] : null,
    [g.starred ? I.starFill : I.star, g.starred ? 'Quitar de destacadas' : 'Destacar', () => S.enqueue({ type: 'update', gid: g.id, patch: { starred: !g.starred } })],
    [I.edit, 'Cambiar el nombre', () => form('Nombre de la lista', [{ name: 'title', label: 'Nombre', value: g.title, placeholder: groupTitle(g) }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { title: v.title.trim() } }))],
    [I.note, g.note ? 'Editar la nota' : 'Añadir una nota', () => form('Nota', [{ name: 'note', label: 'Nota', type: 'textarea', value: g.note }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { note: v.note } }))],
    [I.tag, 'Etiquetas', () => form('Etiquetas', [{ name: 'tags', label: 'Separadas por comas', value: (g.tags || []).join(', ') }], 'Guardar',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { tags: [...new Set(v.tags.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean))] } }))],
    [I.folder, 'Mover a carpeta', () => form('Mover a carpeta', [{ name: 'folder', label: 'Carpeta', type: 'select', value: g.folderId || '', options: folderOptions() }], 'Mover',
      v => S.enqueue({ type: 'update', gid: g.id, patch: { folderId: v.folder || null } }))],
    otherDevices().length ? [I.send, 'Enviar a otro equipo', () => form('Enviar a otro equipo', [{ name: 'dev', label: 'Equipo', type: 'select', value: '', options: otherDevices().map(x => [x.id, x.name]) }], 'Enviar',
      v => { S.enqueue({ type: 'update', gid: g.id, patch: { targetDevice: v.dev } }); toast('Se abrirá en ' + devName(v.dev) + ' cuando sincronice.'); }, 'La extensión de ese equipo la recibirá en «Recibidas».')] : null,
    [I.lock, g.locked ? 'Desbloquear' : 'Bloquear (evita borrarla)', () => S.enqueue({ type: 'update', gid: g.id, patch: { locked: !g.locked } })],
    g.locked ? null : [I.trash, 'Mover a la papelera', () => { S.enqueue({ type: 'trash', gid: g.id }); toast('Lista en la papelera'); }, 'danger']
  ]);
  void d;
}

function tabMenu(g, t) {
  const others = liveGroups(S.state.data).filter(x => x.id !== g.id && !x.targetDevice).sort((a, b) => b.createdAt - a.createdAt);
  menu(t.title || t.url, t.url, [
    [I.open, 'Abrir', () => openMany([t.url])],
    [I.copy, 'Copiar el enlace', () => copy(t.url, 'Enlace copiado')],
    [I.share, 'Compartir', () => share({ title: t.title, url: t.url })],
    others.length && !g.locked ? [I.move, 'Mover a otra lista', () => form('Mover a otra lista', [{ name: 'to', label: 'Lista', type: 'select', value: others[0].id, options: others.slice(0, 300).map(x => [x.id, groupTitle(x).slice(0, 60)]) }], 'Mover',
      v => S.enqueue({ type: 'moveTab', gid: g.id, tabId: t.id, to: v.to }))] : null,
    g.locked ? null : [I.x, 'Quitar de la lista', () => S.enqueue({ type: 'removeTabs', gid: g.id, tabIds: [t.id] }), 'danger']
  ]);
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
    S.enqueue({
      type: 'add', id: S.newId(), title: v.title.trim() || (links.length === 1 ? links[0].title || '' : ''),
      tabs: links.map(l => ({ id: S.newId(), url: l.url, title: l.title || l.url })),
      folderId: v.folder || null, targetDevice: v.dest || null, origin: me().id
    });
    toast(v.dest ? `Enviado a ${devName(v.dest)}` : 'Guardado');
  });
}

/* ───────── Vistas ───────── */

function tabRow(g, t, q) {
  const href = safeHref(t.url);
  const host = domainOf(t.url) || '?';
  const inner = `<span class="fav" style="background:${favColor(host)}">${esc(host[0])}</span>
    <span class="t-txt"><span class="t-title">${highlight(t.title || t.url, q)}</span><span class="t-url">${highlight(host, q)}</span></span>`;
  return `<li class="tab">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : `<a role="button" tabindex="0" data-copy="${esc(t.url)}">${inner}</a>`}
    <button class="icon-btn" data-tab="${esc(g.id)}|${esc(t.id)}" aria-label="Opciones de la pestaña">${I.more}</button></li>`;
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
  return `<article class="group" data-gid="${esc(g.id)}">
    <div class="g-head">
      <button class="g-main" data-toggle="${esc(g.id)}" aria-expanded="${open}">
        <div class="g-title">${g.locked ? '🔒 ' : ''}${highlight(groupTitle(g), q)}</div>
        <div class="g-meta"><span>${plural(g.tabs.length, 'pestaña', 'pestañas')}</span><span>${relativeTime(g.createdAt)}</span>
          ${g.origin && devName(g.origin) ? `<span>${esc(devName(g.origin))}</span>` : ''}
          ${f ? `<span class="chip"><i style="background:${esc(f.color || FOLDER_COLORS[0])}"></i>${esc(f.name)}</span>` : ''}
          ${(g.tags || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}
          ${g.targetDevice && g.targetDevice !== me().id ? `<span class="chip">→ ${esc(devName(g.targetDevice) || 'otro equipo')}</span>` : ''}
        </div>
      </button>
      <button class="icon-btn ${g.starred ? 'on' : ''}" data-star="${esc(g.id)}" aria-label="${g.starred ? 'Quitar de destacadas' : 'Destacar'}">${g.starred ? I.starFill : I.star}</button>
      <button class="icon-btn" data-gmenu="${esc(g.id)}" aria-label="Opciones de la lista">${I.more}</button>
    </div>
    ${open && g.note ? `<div class="g-note">${esc(g.note)}</div>` : ''}
    ${open ? `<ul class="tabs">${rows}</ul>` : ''}
  </article>`;
}

/** Filtra por búsqueda: devuelve [{g, matchTabs|null}] */
function searchGroups(groups, q) {
  if (!q) return groups.map(g => ({ g, m: null }));
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
  let gs = liveGroups(d).filter(g => !g.targetDevice);
  if (folder === 'starred') gs = gs.filter(g => g.starred);
  else if (folder === 'none') gs = gs.filter(g => !g.folderId);
  else if (folder !== 'all') gs = gs.filter(g => g.folderId === folder);
  if (dev !== 'all') gs = gs.filter(g => g.origin === dev);
  const q = normalizeText(ui.q.trim());
  const found = searchGroups(sortGroups(gs), q);
  const tabsTotal = found.reduce((n, x) => n + (x.m ? x.m.length : x.g.tabs.length), 0);
  const shown = found.slice(0, ui.limit);
  if (!d.groups || !Object.keys(d.groups).length) {
    return `<div class="empty"><h2>No hay listas todavía</h2><p>${S.state.exists ? 'Envía pestañas desde la extensión o pulsa + para guardar un enlace.' : 'La extensión aún no ha subido datos a este Dropbox. Conecta Dropbox en la extensión (Ajustes → Sincronización) o pulsa + para empezar.'}</p></div>`;
  }
  return `<p class="count">${plural(found.length, 'lista', 'listas')} · ${plural(tabsTotal, 'pestaña', 'pestañas')}</p>
    ${shown.map(x => groupCard(x.g, q, x.m)).join('') || `<div class="empty"><h2>Nada por aquí</h2><p>${q ? 'Ninguna pestaña coincide con la búsqueda.' : 'Cambia el filtro para ver otras listas.'}</p></div>`}
    ${found.length > shown.length ? `<div class="more"><button class="btn" data-more>Mostrar más (${found.length - shown.length})</button></div>` : ''}`;
}

function viewRecibidas() {
  const all = liveGroups(S.state.data);
  const inbox = all.filter(g => g.targetDevice === me().id).sort((a, b) => b.createdAt - a.createdAt);
  const out = all.filter(g => g.targetDevice && g.targetDevice !== me().id).sort((a, b) => b.createdAt - a.createdAt);
  return `${inbox.length ? `<p class="count">Recibidas en este móvil: ${plural(inbox.length, 'lista', 'listas')}. Pulsa ⋯ → «Guardar en mis listas» cuando las hayas visto.</p>${inbox.map(g => groupCard(g, '')).join('')}`
    : `<div class="empty"><h2>No has recibido nada</h2><p>En el ordenador, usa «Enviar a otro equipo» → <b>${esc(me().name)}</b> desde el menú de la extensión.${S.state.data.devices[me().id] ? '' : ' Este móvil aparecerá allí tras la primera sincronización.'}</p></div>`}
    ${out.length ? `<h2 class="count" style="margin-top:20px">Enviadas a otros equipos (pendientes de recibir)</h2>${out.map(g => groupCard(g, '')).join('')}` : ''}`;
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
  return `<li class="tab"><a ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : ''}><span class="fav" style="background:${favColor(host)}">${esc(host[0])}</span>
    <span class="t-txt"><span class="t-title">${t.pinned ? '📌 ' : ''}${esc(t.title || t.url)}</span><span class="t-url">${esc(host)}</span></span></a></li>`;
}

function sessionMenu(s) {
  const urls = s.windows.flatMap(w => w.tabs.map(t => t.url));
  menu(s.name, `${plural(urls.length, 'pestaña', 'pestañas')} · ${formatDate(s.createdAt)}`, [
    [I.open, 'Abrir todas', () => openMany(urls)],
    [I.copy, 'Copiar los enlaces', () => copy(urls.join('\n'), 'Enlaces copiados')],
    [I.list, 'Convertir en listas', () => { S.enqueue({ type: 'sessionToGroups', sid: s.id, origin: me().id }); toast('Añadida a tus listas'); }],
    [I.trash, 'Borrar la sesión', () => { if (confirm(`¿Borrar la sesión «${s.name}»?`)) S.enqueue({ type: 'deleteSession', sid: s.id }); }, 'danger']
  ]);
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
    <div class="row"><button class="btn" data-export="copy">${I.copy} Copiar</button><button class="btn" data-export="file">Descargar .txt</button></div>
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
    <div class="panel small"><b>Antes de nada</b>
      <p class="muted" style="margin:6px 0 0">En la consola de Dropbox, la app de la extensión debe tener esta dirección en «Redirect URIs»:</p>
      <p><code>${esc(dbx.redirectUri())}</code></p></div>
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
      <label class="opt" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="remember" checked> <span>Recordar en este dispositivo</span></label>
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
  render();
}

/* ───────── Render principal ───────── */

const TITLES = { listas: 'Listas', recibidas: 'Recibidas', sesiones: 'Sesiones', papelera: 'Papelera', ajustes: 'Ajustes' };

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
  const filters = v === 'listas' ? `<div class="search"><input class="field" id="q" type="search" placeholder="Buscar título, dirección o #etiqueta" value="${esc(ui.q)}" autocomplete="off"></div>
    <div class="filters">
      <select class="field" id="f-folder" aria-label="Carpeta">${[['all', 'Todas'], ['starred', '★ Destacadas'], ['none', 'Sin carpeta'], ...sortedFolders(d).map(f => [f.id, f.name])].map(([id, l]) => `<option value="${esc(id)}" ${prefs.get('folder') === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="f-device" aria-label="Equipo">${[['all', 'Todos los equipos'], ...Object.values(d.devices).map(x => [x.id, x.name])].map(([id, l]) => `<option value="${esc(id)}" ${prefs.get('device') === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="f-sort" aria-label="Orden">${[['new', 'Más recientes'], ['old', 'Más antiguas'], ['name', 'Por nombre'], ['size', 'Más pestañas']].map(([id, l]) => `<option value="${id}" ${prefs.get('sort') === id ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>` : '';
  const body = { listas: viewListas, recibidas: viewRecibidas, sesiones: viewSesiones, papelera: viewPapelera, ajustes: viewAjustes }[v]();
  const navItem = (id, icon, label, badge = 0) => `<a href="#${id}" ${v === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</a>`;
  const focused = document.activeElement?.id === 'q' ? document.activeElement.selectionStart : null;
  app.innerHTML = `<header class="top"><div class="top-row"><h1>${TITLES[v]}</h1>${statusPill()}</div>${filters}</header>
    <main class="main" id="main">${body}</main>
    ${v === 'listas' || v === 'recibidas' ? `<button class="fab" data-add aria-label="Añadir enlaces">${I.plus}</button>` : ''}
    <nav class="nav" aria-label="Secciones"><div class="nav-in">
      ${navItem('listas', I.list, 'Listas')}${navItem('recibidas', I.inbox, 'Recibidas', inboxN)}${navItem('sesiones', I.session, 'Sesiones')}${navItem('papelera', I.trash, 'Papelera')}${navItem('ajustes', I.gear, 'Ajustes')}
    </div></nav>`;
  if (focused !== null) { const q = $('#q'); q.focus(); q.setSelectionRange(focused, focused); }
}

/* ───────── Eventos ───────── */

const findGroup = id => S.state.data.groups[id];

app.addEventListener('click', e => {
  const t = e.target.closest('button, a[data-copy]');
  if (!t) return;
  const ds = t.dataset;
  if ('sync' in ds) return S.sync();
  if ('add' in ds) return addForm();
  if ('more' in ds) { ui.limit += 60; return render(); }
  if (ds.toggle) { ui.open.has(ds.toggle) ? ui.open.delete(ds.toggle) : ui.open.add(ds.toggle); return render(); }
  if (ds.star) { const g = findGroup(ds.star); return g && S.enqueue({ type: 'update', gid: g.id, patch: { starred: !g.starred } }); }
  if (ds.gmenu) { const g = findGroup(ds.gmenu); return g && groupMenu(g); }
  if (ds.tab) { const [gid, tid] = ds.tab.split('|'); const g = findGroup(gid); const tab = g?.tabs.find(x => x.id === tid); return tab && tabMenu(g, tab); }
  if (ds.copy) return copy(ds.copy, 'Dirección copiada');
  if (ds.smenu) { const s = S.state.data.sessions[ds.smenu]; return s && sessionMenu(s); }
  if (ds.untrash) { S.enqueue({ type: 'untrash', gid: ds.untrash }); return toast('Lista restaurada'); }
  if (ds.purge) { if (confirm('¿Borrar esta lista para siempre?')) S.enqueue({ type: 'delete', gid: ds.purge }); return; }
  if ('emptyTrash' in ds) { if (confirm('¿Vaciar la papelera? No se puede deshacer.')) S.enqueue({ type: 'emptyTrash' }); return; }
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
});

let qTimer = null;
app.addEventListener('input', e => {
  if (e.target.id === 'q') { ui.q = e.target.value; ui.limit = 40; clearTimeout(qTimer); qTimer = setTimeout(render, 150); }
});
app.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'f-folder') { prefs.set('folder', e.target.value); ui.limit = 40; render(); }
  if (id === 'f-device') { prefs.set('device', e.target.value); ui.limit = 40; render(); }
  if (id === 'f-sort') { prefs.set('sort', e.target.value); render(); }
  if (id === 'theme') { prefs.set('theme', e.target.value); applyTheme(); }
});

function route() {
  const h = location.hash.slice(1);
  if (h === 'anadir') { history.replaceState(null, '', location.pathname); ui.view = 'listas'; render(); return addForm(); }
  ui.view = TITLES[h] ? h : 'listas';
  window.scrollTo(0, 0);
  render();
}
window.addEventListener('hashchange', route);

// Repintar al cambiar los datos, sin perder el desplazamiento.
let raf = 0;
S.subscribe(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!sheet.open || S.state.status === 'locked') render(); }); });
sheet.addEventListener('close', () => render());

window.addEventListener('online', () => S.scheduleSync(300));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.scheduleSync(200); });
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

(async function start() {
  applyTheme();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const shared = takeShare();
  try {
    if (await dbx.finishLogin()) toast('Sesión iniciada');
  } catch (e) { return renderLogin(e.message); }
  if (!dbx.isConnected()) return renderLogin();
  await S.loadCache();
  route();
  S.sync();
  if (shared) { ui.view = 'listas'; render(); addForm(shared); }
})();
