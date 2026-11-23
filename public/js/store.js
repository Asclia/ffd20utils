import { KoofrClient, kpath } from './koofr.js';
// Persistence layer. Uses the local Node server when available (files on disk),
// otherwise falls back to the browser's IndexedDB so the app still works as static files.
const H = { 'Content-Type': 'application/json', 'X-FFd20': '1' };

class ServerStore {
  constructor() { this.kind = 'server'; }
  async listEntries() { return (await fetch('/api/entries')).json(); }
  async saveEntry(e) { await this._ok(fetch(`/api/entries/${encodeURIComponent(e.id)}`, { method: 'PUT', headers: H, body: JSON.stringify(e) })); }
  async deleteEntry(id) { await this._ok(fetch(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE', headers: H })); }
  async listDungeons() { return (await fetch('/api/dungeons', { cache: 'no-store' })).json(); }
  async saveDungeon(d) { await this._ok(fetch(`/api/dungeons/${encodeURIComponent(d.id)}`, { method: 'PUT', headers: H, body: JSON.stringify(d) })); }
  async deleteDungeon(id) { await this._ok(fetch(`/api/dungeons/${encodeURIComponent(id)}`, { method: 'DELETE', headers: H })); }
  async getDoc(name, fallback) { const r = await fetch(`/api/${name}`); return r.ok ? r.json() : fallback; }
  async putDoc(name, v) { await this._ok(fetch(`/api/${name}`, { method: 'PUT', headers: H, body: JSON.stringify(v) })); }
  async uploadImage(file) {
    const r = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': file.type, 'X-FFd20': '1' }, body: file });
    if (!r.ok) throw new Error((await r.json()).error || 'upload failed');
    return (await r.json()).url;
  }
  async exportToFolder(payload) {
    const r = await fetch('/api/export', { method: 'POST', headers: H, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'export failed');
    return j;
  }
  async _ok(p) { const r = await p; if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; }
}

class BrowserStore {
  constructor() { this.kind = 'browser'; this.dbp = null; }
  db() {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('ffd20utils', 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs');
          if (!db.objectStoreNames.contains('dungeons')) db.createObjectStore('dungeons', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }
  async tx(store, mode, fn) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  listEntries() { return this.tx('entries', 'readonly', (s) => s.getAll()); }
  saveEntry(e) { return this.tx('entries', 'readwrite', (s) => s.put(e)); }
  deleteEntry(id) { return this.tx('entries', 'readwrite', (s) => s.delete(id)); }
  listDungeons() { return this.tx('dungeons', 'readonly', (s) => s.getAll()); }
  saveDungeon(d) { return this.tx('dungeons', 'readwrite', (s) => s.put(d)); }
  deleteDungeon(id) { return this.tx('dungeons', 'readwrite', (s) => s.delete(id)); }
  async getDoc(name, fallback) { const v = await this.tx('docs', 'readonly', (s) => s.get(name)); return v ?? fallback; }
  putDoc(name, v) { return this.tx('docs', 'readwrite', (s) => s.put(v, name)); }
  uploadImage(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }
  async exportToFolder() { throw new Error('Exportar para pasta requer o servidor local (node server.js).'); }
}

// ------------------------------------------------------------------ Koofr (Android app): the library folder in the cloud
// Same files as the desktop app's library folder (which the Koofr desktop app syncs): entries/<id>.json,
// dungeons/<id>.json, images/…, folders.json, homebrew.json, encounters.json. Downloads are cached in IndexedDB and
// only files whose "modified" time changed are fetched again. Settings stay on the phone (localStorage).
const KOOFR_KEY = 'koofr';
export function koofrConfig() { try { return JSON.parse(localStorage.getItem(KOOFR_KEY) || 'null'); } catch { return null; } }
export function setKoofrConfig(cfg) { try { if (cfg) localStorage.setItem(KOOFR_KEY, JSON.stringify(cfg)); else localStorage.removeItem(KOOFR_KEY); } catch { /* ignore */ } }
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();

class KoofrStore {
  constructor(client, root) {
    this.kind = 'koofr';
    this.k = client;
    this.root = kpath(root || '/Compendium');
    this.dataDir = `Koofr:${this.root}`;
    this.cache = new BrowserStore();
    this.images = new Map();
    this.ready = {};
  }
  p(...x) { return kpath(this.root, ...x); }
  async cacheGet(key) {
    if (typeof indexedDB === 'undefined') return (this.mem ||= new Map()).get(key) ?? null;
    try { return await this.cache.getDoc(`koofr:${key}`, null); } catch { return null; }
  }
  async cachePut(key, v) {
    if (typeof indexedDB === 'undefined') { (this.mem ||= new Map()).set(key, v); return; }
    try { await this.cache.putDoc(`koofr:${key}`, v); } catch { /* cache is optional */ }
  }
  async dir(sub) {
    if (!this.ready[sub]) { await this.k.ensureDir(this.p(sub)); this.ready[sub] = true; }
  }
  // all JSON files of a folder, re-downloading only those that changed since the last time
  async listJSON(sub) {
    const cached = (await this.cacheGet(`dir:${sub}`)) || {};
    let files;
    try { files = await this.k.list(this.p(sub)); } catch (e) {
      // offline: last copy downloaded on this phone
      this.offline = true;
      return Object.values(cached).map((x) => x.data);
    }
    this.offline = false;
    if (!files) return [];
    const next = {};
    const todo = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
    const out = [];
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const f = todo[i++];
        const c = cached[f.name];
        let data = c && c.modified === f.modified ? c.data : null;
        if (!data) { try { data = JSON.parse(await this.k.getText(this.p(sub, f.name))); } catch { data = null; } }
        if (data) { next[f.name] = { modified: f.modified, data }; out.push(data); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    await this.cachePut(`dir:${sub}`, next);
    return out;
  }
  async listEntries() { return this.listJSON('entries'); }
  async saveEntry(e) { await this.dir('entries'); await this.k.putText(this.p('entries'), `${e.id}.json`, JSON.stringify(e, null, 2)); }
  async deleteEntry(id) { await this.k.remove(this.p('entries', `${id}.json`)); }
  async listDungeons() { return this.listJSON('dungeons'); }
  async saveDungeon(d) { await this.dir('dungeons'); await this.k.putText(this.p('dungeons'), `${d.id}.json`, JSON.stringify(d, null, 2)); }
  async deleteDungeon(id) { await this.k.remove(this.p('dungeons', `${id}.json`)); }
  async getDoc(name, fallback) {
    if (name === 'settings') { try { return JSON.parse(localStorage.getItem('settings') || 'null') ?? fallback; } catch { return fallback; } }
    try {
      const t = await this.k.getText(this.p(`${name}.json`));
      const v = JSON.parse(t);
      await this.cachePut(`doc:${name}`, v);
      return v;
    } catch (e) {
      if (e.status === 404) return fallback;
      const c = await this.cacheGet(`doc:${name}`);
      return c ?? fallback;
    }
  }
  async putDoc(name, v) {
    if (name === 'settings') { localStorage.setItem('settings', JSON.stringify(v)); return; }
    await this.dir('');
    await this.k.putText(this.root, `${name}.json`, JSON.stringify(v, null, 2));
  }
  // images added on the phone are kept inside the statblock (data URL), like the browser version
  uploadImage(file) { return new BrowserStore().uploadImage(file); }
  async exportToFolder() { throw new Error('No celular não há pasta de exportação; use o Exportar .md.'); }
  // "/userdata/images/x.png" from the desktop app → downloaded once and shown as a data URL
  imageURL(src) {
    if (!src || !src.startsWith('/userdata/images/')) return src;
    if (this.images.has(src)) return this.images.get(src) || '';
    this.images.set(src, '');
    const name = src.slice('/userdata/images/'.length);
    const ext = (name.split('.').pop() || 'png').toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' }[ext] || `image/${ext}`;
    this.cacheGet(`img:${name}`).then(async (c) => {
      const b64 = c || await this.k.getBase64(this.p('images', name));
      if (!c) this.cachePut(`img:${name}`, b64);
      this.images.set(src, `data:${mime};base64,${b64}`);
      window.dispatchEvent(new Event('compendium-images'));
    }).catch(() => { /* missing image */ });
    return '';
  }
  // changes made on another device: compare the folder listings
  async revision() {
    const parts = await Promise.all(['', 'entries', 'dungeons'].map((s) => this.k.list(this.p(s)).catch(() => [])));
    let max = 0; let n = 0;
    for (const list of parts) for (const f of list || []) { n++; if (f.modified > max) max = f.modified; }
    return `${n}:${max}`;
  }
}

export async function openKoofrStore(cfg, { strict = false } = {}) {
  const k = new KoofrClient({ email: cfg.email, password: cfg.password });
  try { await k.auth(); } catch (e) {
    // wrong credentials: stop; no connection: keep going with the copy cached on the phone
    if (strict || /recusou/.test(e.message)) throw e;
    const s = new KoofrStore(k, cfg.root);
    s.offline = true;
    return s;
  }
  return new KoofrStore(k, cfg.root);
}

// image source to show on screen (Koofr: images of the desktop library are downloaded on demand)
let currentStore = null;
export function displaySrc(src) { return currentStore?.imageURL ? currentStore.imageURL(src) : src; }

export async function openStore() {
  currentStore = await openStore0();
  return currentStore;
}
async function openStore0() {
  // Android app (or any browser) with a Koofr account configured: the library lives in Koofr
  const kc = koofrConfig();
  if (kc?.email && kc?.password) {
    try { return await openKoofrStore(kc); } catch (e) { console.error('Koofr', e); window.__koofrError = e.message; }
  }
  if (location.protocol.startsWith('http') && !isNativeApp()) {
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (r.ok) { const s = new ServerStore(); s.dataDir = (await r.json()).data; return s; }
    } catch { /* static hosting */ }
  }
  return new BrowserStore();
}
