// Intercambio de archivos entre la extensión y OneTab Móvil: partes puras (sin chrome.* ni DOM).
// La extensión y OneTab Móvil usan este mismo archivo (lib/xfer.js en ambos): mantenlos idénticos.
//
// Los archivos viven en la carpeta /Intercambio de la carpeta privada de la app en Dropbox, con su nombre
// original. Si el cifrado está activo se suben en el formato «OTDE1» de las capturas (MAGIC + sal + iv +
// AES-GCM); al descargar se detecta por la cabecera, así que también valen archivos dejados ahí a mano.

export const FOLDER = '/Intercambio';
/** Con cifrado el archivo entero pasa por memoria: por encima de esto se ofrece subirlo sin cifrar. */
export const ENC_MAX = 300 * 1024 * 1024;
/** Tamaño máximo por archivo (límite de las sesiones de subida de Dropbox con margen). */
export const MAX_SIZE = 2 * 1024 * 1024 * 1024;

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html',
  zip: 'application/zip', apk: 'application/vnd.android.package-archive',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

export const extOf = name => (/\.([a-z0-9]{1,8})$/i.exec(name || '')?.[1] || '').toLowerCase();
export const mimeOf = name => MIME[extOf(name)] || 'application/octet-stream';

/** 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'other' (para el icono y la vista previa). */
export function kindOf(name) {
  const m = mimeOf(name);
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/') || m === 'application/json') return 'text';
  return 'other';
}

export function fmtSize(n) {
  if (!(n >= 0)) return '';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB'];
  let v = n, i = -1;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return `${v.toLocaleString('es', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u[i]}`;
}

const pad = n => String(n).padStart(2, '0');
/** Nombre para un texto enviado: «Texto 2026-11-16 23.05.txt». */
export function textNoteName(d = new Date()) {
  return `Texto ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.txt`;
}
/** Nombre para una imagen pegada sin nombre: «Imagen 2026-11-16 23.05.png». */
export function pastedName(type, d = new Date()) {
  const ext = Object.entries(MIME).find(([, m]) => m === type)?.[0] || 'bin';
  return `Imagen ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${ext}`;
}

/** Quita lo que Dropbox no admite en un nombre y lo limita a una longitud razonable. */
export function safeFileName(name) {
  const clean = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!clean) return 'archivo';
  if (clean.length <= 120) return clean;
  const ext = extOf(clean);
  return clean.slice(0, 115 - ext.length).trim() + (ext ? '.' + ext : '');
}

/** Más recientes primero. */
export const sortEntries = list => [...list].sort((a, b) => (b.server_modified || '').localeCompare(a.server_modified || '') || a.name.localeCompare(b.name));

/** Un texto que es solo una dirección web (para ofrecer «Abrir»). */
export const lonelyUrl = text => { const t = String(text || '').trim(); return /^https?:\/\/\S+$/i.test(t) ? t : null; };

/* ───────── Cifrado «OTDE1» (mismo formato que las capturas) ───────── */

const MAGIC = [0x4f, 0x54, 0x44, 0x45, 0x31];
const toB64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aes = keyB64 => crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);

export const isSealed = u8 => u8.length > 33 && MAGIC.every((b, i) => u8[i] === b);
/** Sal (base64) de unos bytes cifrados, para buscar su clave. */
export const sealedSalt = u8 => toB64(u8.slice(5, 21));

export async function seal(u8, keyB64, saltB64) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(keyB64), u8));
  const out = new Uint8Array(33 + ct.length);
  out.set(MAGIC, 0); out.set(fromB64(saltB64), 5); out.set(iv, 21); out.set(ct, 33);
  return out;
}

export async function unseal(u8, keyB64) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(21, 33) }, await aes(keyB64), u8.slice(33)));
}

/* ───────── «Nuevo» en cada dispositivo ───────── */

/**
 * Marca qué archivos son nuevos aquí: los que no se enviaron ni se descargaron en este dispositivo.
 * La primera vez (seen === null) todo lo que ya había se da por visto. Devuelve { fresh:Set, seen:string[] }
 * con seen recortado a los archivos que siguen existiendo.
 */
export function freshness(entries, seen) {
  const ids = entries.map(e => e.id);
  if (!Array.isArray(seen)) return { fresh: new Set(), seen: ids };
  const s = new Set(seen);
  return { fresh: new Set(ids.filter(id => !s.has(id))), seen: ids.filter(id => s.has(id)) };
}
