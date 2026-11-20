// Persistence layer. Uses the local Node server when available (files on disk),
// otherwise falls back to the browser's IndexedDB so the app still works as static files.
const H = { 'Content-Type': 'application/json', 'X-FFd20': '1' };

class ServerStore {
  constructor() { this.kind = 'server'; }
  async listEntries() { return (await fetch('/api/entries')).json(); }
  async saveEntry(e) { await this._ok(fetch(`/api/entries/${encodeURIComponent(e.id)}`, { method: 'PUT', headers: H, body: JSON.stringify(e) })); }
  async deleteEntry(id) { await this._ok(fetch(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE', headers: H })); }
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
        const req = indexedDB.open('ffd20utils', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore('entries', { keyPath: 'id' });
          db.createObjectStore('docs');
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

export async function openStore() {
  if (location.protocol.startsWith('http')) {
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (r.ok) { const s = new ServerStore(); s.dataDir = (await r.json()).data; return s; }
    } catch { /* static hosting */ }
  }
  return new BrowserStore();
}
