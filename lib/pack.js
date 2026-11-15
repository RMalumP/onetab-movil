// Compresión del archivo de datos en la nube (gzip + base64 dentro de un JSON).
// Los datos de OneTab son texto muy repetitivo (URLs, títulos): comprimidos ocupan 5-10 veces menos,
// así que subir y bajar es más rápido. Solo se escribe así cuando todos los equipos lo entienden (4.0+);
// leer, se leen siempre los dos formatos.

export const GZIP_FORMAT = 'otd-gzip-v1';
export const MIN_VERSION = '4.0.0';
const ACTIVE = 60 * 24 * 3600 * 1000; // equipos vistos en los últimos 60 días

export const isPacked = o => !!o && typeof o === 'object' && o.fmt === GZIP_FORMAT && typeof o.gz === 'string';

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Texto JSON → texto JSON del sobre comprimido. */
export async function packText(text) {
  const gz = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'));
  return JSON.stringify({ fmt: GZIP_FORMAT, gz: toB64(gz) });
}

/** Sobre comprimido → objeto. Cualquier otra cosa se devuelve tal cual. */
export async function unpack(o) {
  if (!isPacked(o)) return o;
  const bytes = await pipe(fromB64(o.gz), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** a >= b en versiones «x.y.z». */
export function versionAtLeast(a, b) {
  const pa = String(a || '0').split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** ¿Todos los equipos activos entienden el formato comprimido? */
export function allDevicesCanUnpack(data, at = Date.now()) {
  const active = Object.values(data.devices || {}).filter(d => at - (d.lastSeen || d.updatedAt || 0) < ACTIVE);
  return active.length > 0 && active.every(d => versionAtLeast(d.version, MIN_VERSION));
}
