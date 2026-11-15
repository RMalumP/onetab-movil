// Copia de la parte pura de lib/crypto.js de OneTab Drive (mismo formato: AES-GCM 256 + PBKDF2-SHA256, 310 000 iteraciones).
// No modificar por separado: debe coincidir con la extensión.

const ITERATIONS = 310000;
export const ENVELOPE = 'otd-aes-gcm-v1';

export class LockedError extends Error {
  constructor(salt) { super('Los datos están cifrados: introduce la contraseña.'); this.name = 'LockedError'; this.salt = salt; }
}


const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export const isEnvelope = o => !!o && typeof o === 'object' && o.enc === ENVELOPE;

export function newSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Deriva la clave (bytes en base64) a partir de la contraseña y la sal. */
export async function deriveKey(password, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: ITERATIONS }, base, 256);
  return toB64(new Uint8Array(bits));
}

const aesKey = keyB64 => crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function encryptText(text, keyB64, saltB64) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(keyB64), enc.encode(text));
  return { enc: ENVELOPE, salt: saltB64, iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

export async function decryptEnvelope(env, keyB64) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, await aesKey(keyB64), fromB64(env.data));
  return dec.decode(plain);
}

