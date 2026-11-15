// Importación / exportación: TXT (compatible con OneTab), CSV y JSON.
// Todas las funciones son puras: reciben/devuelven { groups, folders }.

import { formatDate } from './util.js';

const looksLikeUrl = s => /^[a-z][a-z0-9+.-]*:\/?\/?\S+/i.test(s);

/* ---------- TXT (formato OneTab: "url | título", grupos separados por línea en blanco) ---------- */

export function toTxt(groups) {
  return groups.map(g => g.tabs.map(t => `${t.url} | ${t.title || t.url}`).join('\n')).join('\n\n') + '\n';
}

export function fromTxt(text) {
  const groups = [];
  let current = null;
  const stamp = Date.now();
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { current = null; continue; }
    const sep = line.indexOf(' | ');
    const url = (sep >= 0 ? line.slice(0, sep) : line).trim();
    const title = sep >= 0 ? line.slice(sep + 3).trim() : '';
    if (!looksLikeUrl(url)) continue;
    if (!current) {
      current = { id: 'imp' + groups.length, title: '', createdAt: stamp - groups.length, tabs: [] };
      groups.push(current);
    }
    current.tabs.push({ url, title: title || url });
  }
  return { groups, folders: [] };
}

/* ---------- CSV ---------- */

const CSV_HEADERS = ['grupo_id', 'grupo', 'carpeta', 'etiquetas', 'fecha', 'titulo', 'url'];

function csvCell(v) {
  const s = String(v ?? '');
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(groups, folders) {
  const fname = id => folders.find(f => f.id === id)?.name || '';
  const rows = [CSV_HEADERS.join(',')];
  for (const g of groups) {
    for (const t of g.tabs) {
      rows.push([
        g.id, g.title || '', fname(g.folderId), (g.tags || []).join(' '),
        new Date(g.createdAt).toISOString(), t.title, t.url
      ].map(csvCell).join(','));
    }
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n'; // BOM para que Excel respete los acentos
}

export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

export function fromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { groups: [], folders: [] };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const hasHeader = head.includes('url');
  const col = name => head.indexOf(name);
  const iUrl = hasHeader ? col('url') : rows[0].findIndex(looksLikeUrl);
  const iTitle = hasHeader ? (col('titulo') >= 0 ? col('titulo') : col('title')) : -1;
  const iGid = hasHeader ? col('grupo_id') : -1;
  const iGroup = hasHeader ? (col('grupo') >= 0 ? col('grupo') : col('group')) : -1;
  const iFolder = hasHeader ? (col('carpeta') >= 0 ? col('carpeta') : col('folder')) : -1;
  const iTags = hasHeader ? col('etiquetas') : -1;
  const iDate = hasHeader ? col('fecha') : -1;

  const groups = new Map();
  const folders = new Map();
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const url = (r[iUrl] || '').trim();
    if (!looksLikeUrl(url)) continue;
    const gname = iGroup >= 0 ? r[iGroup] || '' : '';
    const key = (iGid >= 0 && r[iGid]) || gname || '_';
    if (!groups.has(key)) {
      const folderName = iFolder >= 0 ? (r[iFolder] || '').trim() : '';
      if (folderName && !folders.has(folderName)) folders.set(folderName, { id: 'f' + folders.size, name: folderName });
      const date = iDate >= 0 ? Date.parse(r[iDate]) : NaN;
      groups.set(key, {
        id: 'g' + groups.size,
        title: gname,
        folderId: folderName ? folders.get(folderName).id : null,
        tags: iTags >= 0 ? (r[iTags] || '').split(/[\s,]+/).filter(Boolean) : [],
        createdAt: Number.isFinite(date) ? date : Date.now() - groups.size,
        tabs: []
      });
    }
    groups.get(key).tabs.push({ url, title: (iTitle >= 0 && r[iTitle]) || url });
  }
  return { groups: [...groups.values()], folders: [...folders.values()] };
}

/* ---------- JSON ---------- */

export function toJson(groups, folders) {
  const usedFolders = new Set(groups.map(g => g.folderId).filter(Boolean));
  return JSON.stringify({
    app: 'onetab-drive',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: folders.filter(f => usedFolders.has(f.id)),
    groups
  }, null, 2);
}

export function fromJson(text) {
  const obj = JSON.parse(text);
  if (Array.isArray(obj)) return { groups: obj, folders: [] };
  if (obj.groups && !Array.isArray(obj.groups)) {
    // Copia directa del almacenamiento interno ({ groups: {id: g} })
    return { groups: Object.values(obj.groups), folders: Object.values(obj.folders || {}) };
  }
  return { groups: obj.groups || [], folders: obj.folders || [] };
}

/* ---------- Marcadores HTML (formato Netscape, el que importan todos los navegadores) ---------- */

const htmlEsc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function htmlDecode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

export function toBookmarksHtml(groups, folders) {
  const secs = ts => Math.floor((ts || Date.now()) / 1000);
  const fname = id => folders.find(f => f.id === id)?.name || '';
  const block = (g, pad) => {
    const title = g.title || formatDate(g.createdAt);
    const links = g.tabs.map(t => `${pad}    <DT><A HREF="${htmlEsc(t.url)}" ADD_DATE="${secs(g.createdAt)}">${htmlEsc(t.title || t.url)}</A>`).join('\n');
    return `${pad}<DT><H3 ADD_DATE="${secs(g.createdAt)}">${htmlEsc(title)}</H3>\n${pad}<DL><p>\n${links}\n${pad}</DL><p>`;
  };
  const byFolder = new Map();
  for (const g of groups) {
    const key = fname(g.folderId);
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(g);
  }
  const parts = [];
  for (const [folder, gs] of byFolder) {
    if (!folder) parts.push(...gs.map(g => block(g, '        ')));
    else parts.push(`        <DT><H3>${htmlEsc(folder)}</H3>\n        <DL><p>\n${gs.map(g => block(g, '            ')).join('\n')}\n        </DL><p>`);
  }
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exportado desde OneTab Drive -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${secs()}">OneTab Drive</H3>
    <DL><p>
${parts.join('\n')}
    </DL><p>
</DL><p>
`;
}

/**
 * Cada carpeta de marcadores con enlaces directos se convierte en un grupo (con su nombre);
 * la carpeta que la contiene, si existe, pasa a ser la carpeta del grupo.
 */
export function fromBookmarksHtml(text) {
  const re = /<DT>\s*<H3([^>]*)>([\s\S]*?)<\/H3>|<DT>\s*<A([^>]*)>([\s\S]*?)<\/A>|<DL[^>]*>|<\/DL>/gi;
  const stack = [];
  let pending = null;
  const groups = new Map();
  const folders = new Map();
  let m;
  while ((m = re.exec(text))) {
    const tag = m[0].slice(0, 4).toUpperCase();
    if (m[2] !== undefined) pending = htmlDecode(m[2].replace(/<[^>]+>/g, ''));
    else if (m[3] !== undefined) {
      const href = (m[3].match(/HREF\s*=\s*"([^"]*)"/i) || m[3].match(/HREF\s*=\s*'([^']*)'/i) || [])[1];
      const url = htmlDecode(href || '');
      if (!looksLikeUrl(url) || /^(javascript|place):/i.test(url)) continue;
      const added = Number((m[3].match(/ADD_DATE\s*=\s*"(\d+)"/i) || [])[1]) * 1000;
      let path = stack.filter(Boolean);
      if (path[0] === 'OneTab Drive') path = path.slice(1);
      const key = path.join('\u0001') || '_';
      if (!groups.has(key)) {
        const folderName = path.length > 1 ? path[path.length - 2] : '';
        if (folderName && !folders.has(folderName)) folders.set(folderName, { id: 'f' + folders.size, name: folderName });
        groups.set(key, {
          id: 'b' + groups.size,
          title: path[path.length - 1] || 'Marcadores',
          folderId: folderName ? folders.get(folderName).id : null,
          tags: [],
          createdAt: Number.isFinite(added) && added > 0 ? added : Date.now() - groups.size,
          tabs: []
        });
      }
      groups.get(key).tabs.push({ url, title: htmlDecode(m[4].replace(/<[^>]+>/g, '')) || url });
    } else if (tag === '</DL') stack.pop();
    else { stack.push(pending); pending = null; }
  }
  return { groups: [...groups.values()], folders: [...folders.values()] };
}

/* ---------- Detección ---------- */

export function detectFormat(text, filename = '') {
  const ext = filename.toLowerCase().split('.').pop();
  if (['json', 'csv', 'txt'].includes(ext)) return ext;
  if (ext === 'html' || ext === 'htm') return 'html';
  const t = text.trim();
  if (/^<!DOCTYPE NETSCAPE-Bookmark/i.test(t) || /<DT>\s*<A\s/i.test(t)) return 'html';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  const first = t.split(/\r?\n/, 1)[0].toLowerCase();
  if (/(^|[,;])"?url"?([,;]|$)/.test(first)) return 'csv';
  return 'txt';
}

export function parseImport(text, filename) {
  const fmt = detectFormat(text, filename);
  const result = fmt === 'json' ? fromJson(text) : fmt === 'csv' ? fromCsv(text)
    : fmt === 'html' ? fromBookmarksHtml(text) : fromTxt(text);
  return { format: fmt, ...result };
}

export function defaultImportTitle() {
  return 'Importado el ' + formatDate(Date.now());
}

/* ---------- Markdown y documento ---------- */

const mdEsc = s => String(s ?? '').replace(/([\\`*_{}\[\]<>|])/g, '\\$1').replace(/\s+/g, ' ').trim();

/** Una sección por grupo (agrupadas por carpeta): título, nota, etiquetas y la lista de enlaces. */
export function toMarkdown(groups, folders = []) {
  const name = new Map(folders.map(f => [f.id, f.name]));
  const out = ['# Listas de pestañas', '', `_Exportado el ${new Date().toLocaleDateString('es')}_`, ''];
  const order = [...new Set(groups.map(g => g.folderId || ''))].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
  for (const fid of order) {
    if (fid || order.length > 1) out.push(`## ${mdEsc(name.get(fid) || 'Sin carpeta')}`, '');
    for (const g of groups.filter(x => (x.folderId || '') === fid)) {
      out.push(`### ${mdEsc(g.title) || `${g.tabs.length} pestañas`}`, '');
      if (g.tags?.length) out.push(g.tags.map(t => `\`#${t}\``).join(' '), '');
      if (g.note) out.push(...String(g.note).split('\n').map(l => '> ' + l), '');
      for (const t of g.tabs) out.push(`- [${mdEsc(t.title || t.url)}](<${t.url}>)`);
      out.push('');
    }
  }
  return out.join('\n');
}

/** Documento HTML legible e imprimible con las mismas secciones. */
export function toDocHtml(groups, folders = []) {
  const name = new Map(folders.map(f => [f.id, f.name]));
  const body = groups.map(g => `<section>
  <h2>${htmlEsc(g.title || `${g.tabs.length} pestañas`)}</h2>
  ${g.folderId && name.get(g.folderId) ? `<p class="meta">Carpeta: ${htmlEsc(name.get(g.folderId))}</p>` : ''}
  ${g.note ? `<blockquote>${htmlEsc(g.note).replace(/\n/g, '<br>')}</blockquote>` : ''}
  <ul>${g.tabs.map(t => `<li><a href="${htmlEsc(t.url)}">${htmlEsc(t.title || t.url)}</a></li>`).join('')}</ul>
</section>`).join('\n');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Listas de pestañas</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#15242b}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin:1.6rem 0 .2rem}.meta{color:#5d6f77;margin:0}blockquote{margin:.4rem 0;padding-left:.8rem;border-left:3px solid #d3dde1;color:#5d6f77}
a{color:#0e5c63}li{margin:.15rem 0}@media print{a{color:inherit;text-decoration:none}}</style>
<h1>Listas de pestañas</h1>
${body}
</html>`;
}
