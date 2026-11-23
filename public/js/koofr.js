// Koofr cloud storage (REST API, same calls as Koofr's own Go client "go-koofrclient"):
//   POST /token {email, password}            → {token}; later requests send "Authorization: Token token=…"
//   GET  /api/v2/mounts                      → {mounts:[{id, name, isPrimary}]}
//   GET  /api/v2/mounts/{id}/files/list?path → {files:[{name, type:'file'|'dir', modified, size}]}
//   GET  /content/api/v2/mounts/{id}/files/get?path
//   POST /content/api/v2/mounts/{id}/files/put?path=dir&filename=…&info=true&overwrite=true&autorename=false (multipart "file")
//   DELETE /api/v2/mounts/{id}/files/remove?path
//   POST /api/v2/mounts/{id}/files/folder?path=parent {name}
// On Android the requests go through Capacitor's native HTTP (no CORS); in a browser they use fetch.
export const KOOFR = { base: 'https://app.koofr.net' }; // tests point this to a local mock

function native() {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!C?.isNativePlatform?.()) return null;
  // the native bridge always knows CapacitorHttp; Plugins.CapacitorHttp exists when the plugin proxy was registered
  if (C.Plugins?.CapacitorHttp?.request) return C.Plugins.CapacitorHttp;
  return { request: (o) => C.nativePromise('CapacitorHttp', 'request', o) };
}

const b64 = (text) => btoa(unescape(encodeURIComponent(text)));

async function http({ method, url, headers = {}, data, responseType = 'text', file }) {
  const n = native();
  if (n) {
    // native multipart upload: Capacitor's form-data format (the plugin writes the parts itself)
    const extra = file ? { dataType: 'formData', data: [{ key: file.field, value: b64(file.text), type: 'base64File', fileName: file.filename, contentType: file.contentType }] } : { data };
    const r = await n.request({ method, url, headers, responseType, connectTimeout: 20000, readTimeout: 60000, ...extra });
    const h = Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { status: r.status, data: r.data, headers: h };
  }
  if (file) {
    const fd = new FormData();
    fd.append(file.field, new Blob([file.text], { type: file.contentType }), file.filename);
    data = fd;
    delete headers['Content-Type'];
  }
  const r = await fetch(url, { method, headers, body: data });
  const h = Object.fromEntries([...r.headers.entries()]);
  let body;
  if (responseType === 'blob') {
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    body = btoa(s);
  } else body = await r.text();
  return { status: r.status, data: body, headers: h };
}

const q = (params) => Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const join = (...p) => `/${p.join('/').split('/').filter(Boolean).join('/')}`;

export class KoofrClient {
  constructor({ email, password }) {
    this.email = email;
    this.password = password;
    this.token = '';
    this.mount = null;
  }

  async auth() {
    const r = await http({ method: 'POST', url: `${KOOFR.base}/token`, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ email: this.email, password: this.password }) });
    if (r.status === 401 || r.status === 403) throw new Error('Koofr recusou o e-mail ou a senha de aplicativo.');
    if (r.status !== 200) throw new Error(`Koofr: falha ao entrar (HTTP ${r.status}).`);
    const body = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data;
    this.token = body.token || r.headers['x-koofr-token'] || '';
    if (!this.token) throw new Error('Koofr: resposta sem token.');
    const m = await this.req('GET', '/api/v2/mounts');
    const mounts = m.mounts || [];
    this.mount = mounts.find((x) => x.isPrimary) || mounts[0];
    if (!this.mount) throw new Error('Koofr: nenhum armazenamento encontrado na conta.');
    return this;
  }

  async req(method, path, { params, json, data, headers = {}, responseType = 'text', expect = [200], file } = {}, retry = true) {
    if (!this.token && path !== '/token') await this.auth();
    const url = `${KOOFR.base}${path}${params ? `?${q(params)}` : ''}`;
    const h = { Authorization: `Token token=${this.token}`, Accept: 'application/json', ...headers };
    let body = data;
    if (json !== undefined) { body = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    const r = await http({ method, url, headers: h, data: body, responseType, file });
    if (r.status === 401 && retry) { this.token = ''; await this.auth(); return this.req(method, path, { params, json, data, headers, responseType, expect, file }, false); }
    if (!expect.includes(r.status)) {
      const err = new Error(`Koofr ${method} ${path}: HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    if (responseType === 'blob') return r.data;
    if (typeof r.data !== 'string') return r.data;
    try { return r.data ? JSON.parse(r.data) : null; } catch { return r.data; }
  }

  async list(path) {
    try {
      const r = await this.req('GET', `/api/v2/mounts/${this.mount.id}/files/list`, { params: { path } });
      return r.files || [];
    } catch (e) {
      if (e.status === 404) return null; // folder does not exist
      throw e;
    }
  }

  async getText(path) {
    const r = await this.req('GET', `/content/api/v2/mounts/${this.mount.id}/files/get`, { params: { path }, headers: { Accept: '*/*' } });
    return typeof r === 'string' ? r : JSON.stringify(r);
  }

  async getBase64(path) {
    return this.req('GET', `/content/api/v2/mounts/${this.mount.id}/files/get`, { params: { path }, headers: { Accept: '*/*' }, responseType: 'blob' });
  }

  async putText(dir, filename, text, contentType = 'application/json') {
    const boundary = `----compendium${Math.random().toString(36).slice(2)}`;
    await this.req('POST', `/content/api/v2/mounts/${this.mount.id}/files/put`, {
      params: { path: dir, filename, info: 'true', overwrite: 'true', autorename: 'false' },
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      file: { field: 'file', filename, contentType, text },
    });
  }

  async remove(path) {
    try { await this.req('DELETE', `/api/v2/mounts/${this.mount.id}/files/remove`, { params: { path } }); } catch (e) { if (e.status !== 404) throw e; }
  }

  async mkdir(parent, name) {
    try { await this.req('POST', `/api/v2/mounts/${this.mount.id}/files/folder`, { params: { path: parent }, json: { name } }); } catch (e) { if (![409, 400].includes(e.status)) throw e; }
  }

  // creates every missing folder of a path ("/Compendium/entries")
  async ensureDir(path) {
    const parts = path.split('/').filter(Boolean);
    let cur = '/';
    for (const p of parts) {
      const items = await this.list(cur);
      if (!(items || []).some((x) => x.name === p && x.type === 'dir')) await this.mkdir(cur, p);
      cur = join(cur, p);
    }
  }
}

export const kpath = join;
