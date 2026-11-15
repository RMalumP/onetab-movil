// Utilidades puras (sin dependencias de chrome.*), reutilizables en tests.

export function uid() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export const now = () => Date.now();

/** JSON con claves ordenadas: mismo contenido => misma cadena. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// Analizar una URL es caro y el gestor pide el dominio de cada pestaña en cada redibujado: se recuerda.
const domainCache = new Map();
export function domainOf(url) {
  let d = domainCache.get(url);
  if (d !== undefined) return d;
  try {
    const u = new URL(url);
    d = u.hostname.replace(/^www\./, '') || u.protocol.replace(':', '');
  } catch {
    d = '';
  }
  if (domainCache.size > 100000) domainCache.clear();
  domainCache.set(url, d);
  return d;
}

const SAVEABLE = /^(https?|ftp|file):/i;
export function isSaveableUrl(url) {
  return SAVEABLE.test(url || '');
}

export function isBlankTab(url) {
  return /^(chrome|edge|brave|vivaldi|opera):\/\/(newtab|new-tab-page|startpage)\/?$/i.test(url || '') ||
    url === 'about:blank' || /^chrome-search:\/\/local-ntp/.test(url || '');
}

/** Coincidencia de dominio: "ejemplo.com" excluye también "sub.ejemplo.com". */
export function matchesDomain(url, domains) {
  const host = domainOf(url).toLowerCase();
  if (!host) return false;
  return domains.some(d => {
    const dd = d.trim().toLowerCase().replace(/^www\./, '');
    return dd && (host === dd || host.endsWith('.' + dd));
  });
}

export function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let dateFmt = null;
export function formatDate(ts) {
  // Un formateador reutilizado: crear uno en cada llamada (toLocaleString) es lento con cientos de grupos.
  dateFmt ??= new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  return dateFmt.format(new Date(ts));
}

export function relativeTime(ts) {
  if (!ts) return 'nunca';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return formatDate(ts);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function todayStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
