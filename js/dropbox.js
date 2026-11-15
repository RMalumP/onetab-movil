// Dropbox desde el navegador: inicio de sesión OAuth con PKCE (sin servidor ni secreto) y las pocas llamadas
// que necesita la app. Misma carpeta privada y mismos nombres de archivo que la extensión.

import { DROPBOX_APP_KEY } from '../config.js';

const AUTH = 'otm.auth';
const PKCE = 'otm.pkce';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';
export const MAIN_PATH = '/onetab-drive.json';

export class DbxError extends Error {
  constructor(status, summary, message) { super(message); this.name = 'DbxError'; this.status = status; this.summary = summary; }
}
export class NotConnectedError extends Error { constructor(m) { super(m); this.name = 'NotConnectedError'; } }
export class ConflictError extends Error { constructor() { super('Conflicto: los datos cambiaron en otro equipo.'); this.name = 'ConflictError'; } }
const isNotFound = e => e instanceof DbxError && /not_found/.test(e.summary || '');

/** La dirección de esta página sin consulta ni index.html: es la que hay que registrar en Dropbox. */
export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const asciiJson = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const getAuth = () => { try { return JSON.parse(localStorage.getItem(AUTH)) || null; } catch { return null; } };
const saveAuth = a => localStorage.setItem(AUTH, JSON.stringify(a));
export const isConnected = () => !!getAuth()?.refreshToken;
export const accountEmail = () => getAuth()?.email || '';

async function formPost(url, params) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error_description || j.error || `Dropbox respondió ${res.status}`); e.code = j.error; throw e; }
  return j;
}

/** Va a Dropbox para iniciar sesión; vuelve a esta misma página con ?code=… */
export async function startLogin() {
  const verifier = randomString(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = randomString(18);
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state }));
  localStorage.setItem(PKCE, JSON.stringify({ verifier, state })); // por si el navegador abre la vuelta en otra pestaña
  const url = new URL('https://www.dropbox.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: DROPBOX_APP_KEY, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    token_access_type: 'offline', redirect_uri: redirectUri(), state
  }).toString();
  location.assign(url.toString());
}

/** Si la página se abrió al volver de Dropbox, completa el inicio de sesión. Devuelve true si lo hizo. */
export async function finishLogin() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  history.replaceState(null, '', redirectUri());
  const saved = JSON.parse(sessionStorage.getItem(PKCE) || localStorage.getItem(PKCE) || 'null');
  sessionStorage.removeItem(PKCE); localStorage.removeItem(PKCE);
  if (q.get('error')) throw new Error('Dropbox rechazó el acceso: ' + (q.get('error_description') || q.get('error')));
  if (!saved || q.get('state') !== saved.state) throw new Error('Respuesta de Dropbox no válida. Vuelve a intentarlo.');
  const tok = await formPost(TOKEN_URL, {
    grant_type: 'authorization_code', code: q.get('code'), client_id: DROPBOX_APP_KEY, code_verifier: saved.verifier, redirect_uri: redirectUri()
  });
  if (!tok.refresh_token) throw new Error('Dropbox no devolvió un token de renovación.');
  saveAuth({ refreshToken: tok.refresh_token, accessToken: tok.access_token, expiresAt: Date.now() + ((tok.expires_in || 14400) - 60) * 1000, email: '' });
  try {
    const acc = await rpc('users/get_current_account');
    saveAuth({ ...getAuth(), email: acc.email || '' });
  } catch { /* sin permiso account_info.read: no se muestra el correo */ }
  return true;
}

export async function logout() {
  const a = getAuth();
  localStorage.removeItem(AUTH);
  if (a?.accessToken) fetch(`${API}/auth/token/revoke`, { method: 'POST', headers: { Authorization: `Bearer ${a.accessToken}` } }).catch(() => {});
}

let refreshing = null;
async function accessToken(force = false) {
  const a = getAuth();
  if (!a?.refreshToken) throw new NotConnectedError('No has iniciado sesión en Dropbox.');
  if (!force && a.accessToken && a.expiresAt > Date.now()) return a.accessToken;
  refreshing ??= (async () => {
    try {
      const tok = await formPost(TOKEN_URL, { grant_type: 'refresh_token', refresh_token: a.refreshToken, client_id: DROPBOX_APP_KEY });
      saveAuth({ ...getAuth(), accessToken: tok.access_token, expiresAt: Date.now() + ((tok.expires_in || 14400) - 60) * 1000 });
      return tok.access_token;
    } catch (e) {
      if (e.code === 'invalid_grant') { localStorage.removeItem(AUTH); throw new NotConnectedError('La sesión de Dropbox caducó. Vuelve a iniciar sesión.'); }
      throw e;
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function call(url, { headers = {}, body, arg } = {}, retry = true, tries = 0) {
  const h = { Authorization: `Bearer ${await accessToken(!retry)}`, ...headers };
  if (arg) h['Dropbox-API-Arg'] = asciiJson(arg);
  const res = await fetch(url, { method: 'POST', headers: h, body });
  if (res.status === 401 && retry) return call(url, { headers, body, arg }, false, tries);
  if (res.status === 429 && tries < 4) {
    await sleep(Math.min(30, Number(res.headers.get('Retry-After')) || 2) * 1000);
    return call(url, { headers, body, arg }, retry, tries + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    let summary = '', msg = '';
    try { const j = JSON.parse(text); summary = j.error_summary || ''; msg = j.error_description || ''; } catch { msg = text.slice(0, 200); }
    throw new DbxError(res.status, summary, msg || summary || `Dropbox respondió ${res.status}`);
  }
  return res;
}

const rpc = async (endpoint, obj) =>
  (await call(`${API}/${endpoint}`, obj === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) })).json();

/** Revisión actual del archivo principal sin descargarlo ('' = no existe). */
export async function peekMain() {
  try { return (await rpc('files/get_metadata', { path: MAIN_PATH })).rev || ''; }
  catch (e) { if (isNotFound(e)) return ''; throw e; }
}

/** { text, rev } del archivo principal, o { text: null, rev: '' } si no existe. */
export async function readMain() {
  try {
    const res = await call(`${CONTENT}/files/download`, { arg: { path: MAIN_PATH } });
    let meta = {};
    try { meta = JSON.parse(res.headers.get('dropbox-api-result') || '{}'); } catch { /* sin metadatos */ }
    return { text: await res.text(), rev: meta.rev || '' };
  } catch (e) {
    if (isNotFound(e)) return { text: null, rev: '' };
    throw e;
  }
}

/** Sube el archivo principal solo si sigue en la revisión rev (como la extensión). Devuelve la nueva revisión. */
export async function writeMain(text, rev) {
  let meta;
  try {
    meta = await (await call(`${CONTENT}/files/upload`, {
      headers: { 'Content-Type': 'application/octet-stream' }, body: new Blob([text]),
      arg: { path: MAIN_PATH, mode: rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' }, autorename: false, mute: true }
    })).json();
  } catch (e) {
    if (e instanceof DbxError && /conflict/.test(e.summary || '')) throw new ConflictError();
    throw e;
  }
  // Con una revisión vieja Dropbox crea una «copia en conflicto»: se borra y se repite.
  if (meta.path_lower && meta.path_lower !== MAIN_PATH) {
    await rpc('files/delete_v2', { path: meta.id }).catch(() => {});
    throw new ConflictError();
  }
  return meta.rev || '';
}

