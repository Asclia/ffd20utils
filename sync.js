// Google Drive sync for the FFd20 Utils library (Node 18+, no dependencies).
//
// - OAuth 2.0 for desktop apps: the user's own Google Cloud "Desktop app" client, loopback
//   redirect to this local server and PKCE. Scope drive.file: the app only sees files it created.
// - Remote layout: one folder "FFd20 Utils" in the user's Drive with
//     entry_<id>.json   one per stat block (appProperties.updatedAt = last edit, ms)
//     doc_folders.json, doc_homebrew.json
//     tombstones.json   { id: deletedAt } so deletions propagate
//     img_<file>        images (content-hash names, never change)
// - Merge: newest edit wins per stat block; when both sides changed since the last sync,
//   the older version is kept as a copy named "... (conflito de sync)".
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const REMOTE_FOLDER = 'FFd20 Utils';
const IMAGE_RE = /^[A-Za-z0-9]+\.(png|jpg|gif|webp|avif|svg)$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };

const readJSON = async (file, fallback) => { try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; } };
const writeJSON = async (file, obj) => {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fsp.rename(tmp, file);
};
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const safeId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export class DriveSync {
  constructor({ dataDir, fetch: fetchImpl, endpoints = {}, onLocalChange } = {}) {
    this.dataDir = dataDir;
    this.dir = path.join(dataDir, 'sync');
    fs.mkdirSync(this.dir, { recursive: true });
    this.fetch = fetchImpl || globalThis.fetch;
    this.ep = {
      auth: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      revoke: 'https://oauth2.googleapis.com/revoke',
      api: 'https://www.googleapis.com/drive/v3',
      upload: 'https://www.googleapis.com/upload/drive/v3',
      ...endpoints,
    };
    this.onLocalChange = onLocalChange || (() => {});
    this.pending = new Map(); // OAuth state -> { verifier, redirect, at }
    this.running = null;
    this.timer = null;
    this.interval = null;
    this.statusInfo = { state: 'idle', lastSync: null, error: null, revision: 0, lastResult: null };
  }

  // ------------------------------------------------------------------ files
  f(name) { return path.join(this.dir, name); }
  config() { return readJSON(this.f('config.json'), {}); }
  async setConfig(patch) {
    const cfg = { ...(await this.config()), ...patch };
    await writeJSON(this.f('config.json'), cfg);
    return cfg;
  }
  token() { return readJSON(this.f('token.json'), null); }
  state() { return readJSON(this.f('state.json'), {}); }
  async recordDelete(id) {
    const t = await readJSON(this.f('tombstones.json'), {});
    t[id] = Date.now();
    await writeJSON(this.f('tombstones.json'), t);
    this.markDirty();
  }
  async recordDocChange(name) {
    const m = await readJSON(this.f('docmeta.json'), {});
    m[name] = Date.now();
    await writeJSON(this.f('docmeta.json'), m);
    this.markDirty();
  }

  async status() {
    const cfg = await this.config();
    const tok = await this.token();
    const st = await this.state();
    return {
      ...this.statusInfo,
      configured: !!(cfg.clientId && cfg.clientSecret),
      connected: !!tok?.refresh_token,
      account: tok?.email || null,
      auto: cfg.auto !== false,
      clientId: cfg.clientId || '',
      lastSync: this.statusInfo.lastSync || st.lastSyncAt || null,
    };
  }

  // ------------------------------------------------------------------ OAuth (desktop app, loopback + PKCE)
  async authUrl(redirectUri) {
    const cfg = await this.config();
    if (!cfg.clientId || !cfg.clientSecret) throw new Error('Configure o Client ID e o Client Secret primeiro.');
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    this.pending.set(state, { verifier, redirect: redirectUri, at: Date.now() });
    const q = new URLSearchParams({
      client_id: cfg.clientId, redirect_uri: redirectUri, response_type: 'code', scope: `${SCOPE} openid email`,
      access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    return `${this.ep.auth}?${q}`;
  }

  async handleCallback(params) {
    const st = params.get('state');
    const p = this.pending.get(st);
    if (!p || Date.now() - p.at > 15 * 60 * 1000) throw new Error('Pedido de login expirado ou inválido. Tente conectar de novo.');
    this.pending.delete(st);
    if (params.get('error')) throw new Error(`O Google recusou: ${params.get('error')}`);
    const cfg = await this.config();
    const body = new URLSearchParams({
      code: params.get('code') || '', client_id: cfg.clientId, client_secret: cfg.clientSecret,
      redirect_uri: p.redirect, grant_type: 'authorization_code', code_verifier: p.verifier,
    });
    const r = await this.fetch(this.ep.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(j.error_description || j.error || 'Falha ao obter o token do Google.');
    const email = j.id_token ? emailFromIdToken(j.id_token) : null;
    await writeJSON(this.f('token.json'), { refresh_token: j.refresh_token, access_token: j.access_token, expiry: Date.now() + (j.expires_in || 3600) * 1000, email });
    // a new account may mean a new remote folder
    const s = await this.state();
    if (s.account !== email) await writeJSON(this.f('state.json'), { account: email });
    this.statusInfo.error = null;
    this.scheduleSoon(500);
    return email;
  }

  async disconnect() {
    const tok = await this.token();
    if (tok?.refresh_token) {
      try { await this.fetch(`${this.ep.revoke}?token=${encodeURIComponent(tok.refresh_token)}`, { method: 'POST' }); } catch { /* offline: just forget it */ }
    }
    await fsp.rm(this.f('token.json'), { force: true });
    await fsp.rm(this.f('state.json'), { force: true });
    this.statusInfo = { ...this.statusInfo, state: 'idle', error: null };
  }

  async accessToken(force = false) {
    const tok = await this.token();
    if (!tok?.refresh_token) throw new Error('Não conectado ao Google Drive.');
    if (!force && tok.access_token && tok.expiry > Date.now() + 60000) return tok.access_token;
    const cfg = await this.config();
    const body = new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: tok.refresh_token, grant_type: 'refresh_token' });
    const r = await this.fetch(this.ep.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const j = await r.json();
    if (!r.ok) {
      if (j.error === 'invalid_grant') {
        await fsp.rm(this.f('token.json'), { force: true });
        throw new Error('O acesso ao Google expirou ou foi revogado. Conecte de novo (veja no README como evitar a expiração de 7 dias).');
      }
      throw new Error(j.error_description || j.error || `Falha ao renovar o token (HTTP ${r.status}).`);
    }
    await writeJSON(this.f('token.json'), { ...tok, access_token: j.access_token, expiry: Date.now() + (j.expires_in || 3600) * 1000 });
    return j.access_token;
  }

  // ------------------------------------------------------------------ Drive REST helpers
  async call(url, opts = {}, raw = false) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const tokenValue = await this.accessToken(attempt > 0 && this._lastStatus === 401);
      const r = await this.fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tokenValue}` } });
      this._lastStatus = r.status;
      if (r.status === 401 && attempt === 0) continue;
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise((res) => setTimeout(res, 500 * 2 ** attempt)); continue; }
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = await r.json(); msg = j.error?.message || msg; } catch { /* not json */ }
        const e = new Error(`Google Drive: ${msg}`);
        e.status = r.status;
        throw e;
      }
      if (raw) return Buffer.from(await r.arrayBuffer());
      if (r.status === 204) return null;
      const text = await r.text();
      return text ? JSON.parse(text) : null;
    }
    throw new Error('Google Drive não respondeu.');
  }

  async list(q) {
    const out = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields: 'nextPageToken, files(id, name, appProperties, modifiedTime)' });
      if (pageToken) params.set('pageToken', pageToken);
      const j = await this.call(`${this.ep.api}/files?${params}`);
      out.push(...(j.files || []));
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    return out;
  }

  async ensureFolder(state) {
    if (state.folderId) {
      try {
        const f = await this.call(`${this.ep.api}/files/${state.folderId}?fields=id,trashed`);
        if (f && !f.trashed) return state.folderId;
      } catch (e) { if (e.status !== 404) throw e; }
    }
    const found = await this.list(`name = '${REMOTE_FOLDER}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
    if (found.length) return found[0].id;
    const created = await this.call(`${this.ep.api}/files?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: REMOTE_FOLDER, mimeType: FOLDER_MIME }),
    });
    return created.id;
  }

  async upload({ fileId, name, folderId, content, mime, appProperties }) {
    const boundary = `ffd20-${crypto.randomBytes(8).toString('hex')}`;
    const meta = fileId ? { appProperties } : { name, parents: [folderId], appProperties };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
      Buffer.isBuffer(content) ? content : Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const url = fileId ? `${this.ep.upload}/files/${fileId}?uploadType=multipart&fields=id` : `${this.ep.upload}/files?uploadType=multipart&fields=id`;
    const j = await this.call(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return j.id;
  }
  download(fileId) { return this.call(`${this.ep.api}/files/${fileId}?alt=media`, {}, true); }
  remove(fileId) { return this.call(`${this.ep.api}/files/${fileId}`, { method: 'DELETE' }).catch((e) => { if (e.status !== 404) throw e; }); }

  // ------------------------------------------------------------------ scheduling
  markDirty() { this.scheduleSoon(4000); }
  scheduleSoon(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.autoSync(), ms);
  }
  startAuto(everyMs = 3 * 60 * 1000) {
    this.scheduleSoon(1500);
    clearInterval(this.interval);
    this.interval = setInterval(() => this.autoSync(), everyMs);
    if (this.interval.unref) this.interval.unref();
  }
  stop() { clearTimeout(this.timer); clearInterval(this.interval); }
  async autoSync() {
    const cfg = await this.config();
    const tok = await this.token();
    if (cfg.auto === false || !tok?.refresh_token) return;
    try { await this.sync(); } catch { /* status already records the error */ }
  }

  sync() {
    if (this.running) return this.running;
    this.running = this._sync()
      .then((r) => { this.statusInfo = { ...this.statusInfo, state: 'ok', error: null, lastSync: Date.now(), lastResult: r }; return r; })
      .catch((e) => { this.statusInfo = { ...this.statusInfo, state: 'error', error: e.message }; throw e; })
      .finally(() => { this.running = null; });
    this.statusInfo = { ...this.statusInfo, state: 'syncing' };
    return this.running;
  }

  // ------------------------------------------------------------------ the merge
  async _sync() {
    const started = Date.now();
    const st = await this.state();
    const lastSync = st.lastSync || 0;
    const result = { uploaded: 0, downloaded: 0, deleted: 0, conflicts: 0 };
    let localChanged = false;
    const folderId = await this.ensureFolder(st);
    const remote = new Map((await this.list(`'${folderId}' in parents and trashed = false`)).map((f) => [f.name, f]));
    const entriesDir = path.join(this.dataDir, 'entries');
    const imagesDir = path.join(this.dataDir, 'images');
    await fsp.mkdir(entriesDir, { recursive: true });
    await fsp.mkdir(imagesDir, { recursive: true });

    // tombstones: merge both sides (latest deletion time wins)
    const localTomb = await readJSON(this.f('tombstones.json'), {});
    const remoteTombFile = remote.get('tombstones.json');
    const remoteTomb = remoteTombFile ? JSON.parse((await this.download(remoteTombFile.id)).toString('utf8') || '{}') : {};
    const tomb = { ...remoteTomb };
    for (const [id, t] of Object.entries(localTomb)) tomb[id] = Math.max(tomb[id] || 0, t);

    // stat blocks
    const local = new Map();
    for (const f of await fsp.readdir(entriesDir)) {
      if (!f.endsWith('.json')) continue;
      const e = await readJSON(path.join(entriesDir, f), null);
      if (e?.id) local.set(e.id, e);
    }
    const remoteEntries = new Map();
    for (const [name, f] of remote) {
      const m = name.match(/^entry_([A-Za-z0-9_-]{1,64})\.json$/);
      if (m) remoteEntries.set(m[1], { fileId: f.id, updatedAt: Number(f.appProperties?.updatedAt) || 0 });
    }
    const putRemote = async (e) => {
      const r = remoteEntries.get(e.id);
      const id = await this.upload({ fileId: r?.fileId, name: `entry_${e.id}.json`, folderId, mime: 'application/json', content: JSON.stringify(e), appProperties: { updatedAt: String(e.updatedAt || 0), kind: 'entry' } });
      remoteEntries.set(e.id, { fileId: id, updatedAt: e.updatedAt || 0 });
      result.uploaded++;
    };
    const putLocal = async (e) => {
      if (!safeId(e.id)) return;
      await writeJSON(path.join(entriesDir, `${e.id}.json`), e);
      local.set(e.id, e);
      localChanged = true;
      result.downloaded++;
    };
    const conflictCopy = async (e) => {
      const copy = { ...e, id: crypto.randomBytes(6).toString('hex'), name: `${e.name || 'Sem nome'} (conflito de sync)`, updatedAt: Date.now() };
      await putLocal(copy);
      result.downloaded--;
      await putRemote(copy);
      result.conflicts++;
    };
    const ids = new Set([...local.keys(), ...remoteEntries.keys()]);
    for (const id of ids) {
      const L = local.get(id);
      const R = remoteEntries.get(id);
      const lt = L ? Number(L.updatedAt) || 0 : -1;
      const rt = R ? R.updatedAt : -1;
      const dt = tomb[id];
      if (dt && lt <= dt && rt <= dt) {
        if (L) { await fsp.rm(path.join(entriesDir, `${id}.json`), { force: true }); localChanged = true; result.deleted++; }
        if (R) { await this.remove(R.fileId); result.deleted++; }
        continue;
      }
      if (L && !R) { await putRemote(L); continue; }
      if (R && !L) { await putLocal(JSON.parse((await this.download(R.fileId)).toString('utf8'))); continue; }
      if (lt === rt) continue;
      const bothChanged = lastSync && lt > lastSync && rt > lastSync;
      if (lt > rt) {
        if (bothChanged) await conflictCopy(JSON.parse((await this.download(R.fileId)).toString('utf8')));
        await putRemote(L);
      } else {
        if (bothChanged) await conflictCopy(L);
        await putLocal(JSON.parse((await this.download(R.fileId)).toString('utf8')));
      }
    }

    // whole documents (folders, homebrew): newest wins
    const docmeta = await readJSON(this.f('docmeta.json'), {});
    for (const doc of ['folders', 'homebrew']) {
      const file = path.join(this.dataDir, `${doc}.json`);
      const rf = remote.get(`doc_${doc}.json`);
      const lt = docmeta[doc] || (fs.existsSync(file) ? 1 : 0);
      const rt = rf ? Number(rf.appProperties?.updatedAt) || 0 : 0;
      if (rf && lt === 1) {
        // first sync on this computer with local data never stamped: merge both sides by id
        const remoteDoc = JSON.parse((await this.download(rf.id)).toString('utf8'));
        const merged = mergeDoc(doc, await readJSON(file, doc === 'folders' ? [] : {}), remoteDoc);
        await writeJSON(file, merged);
        const stamp = Date.now();
        await this.upload({ fileId: rf.id, name: `doc_${doc}.json`, folderId, mime: 'application/json', content: JSON.stringify(merged), appProperties: { updatedAt: String(stamp), kind: 'doc' } });
        docmeta[doc] = stamp;
        localChanged = true;
        result.downloaded++;
      } else if (rf && rt > lt) {
        await writeJSON(file, JSON.parse((await this.download(rf.id)).toString('utf8')));
        docmeta[doc] = rt;
        localChanged = true;
        result.downloaded++;
      } else if (fs.existsSync(file) && (!rf || lt > rt)) {
        const stamp = lt > 1 ? lt : Date.now();
        await this.upload({ fileId: rf?.id, name: `doc_${doc}.json`, folderId, mime: 'application/json', content: await fsp.readFile(file), appProperties: { updatedAt: String(stamp), kind: 'doc' } });
        docmeta[doc] = stamp;
        result.uploaded++;
      }
    }
    await writeJSON(this.f('docmeta.json'), docmeta);

    // images: immutable files named by content hash
    const localImgs = new Set((await fsp.readdir(imagesDir)).filter((n) => IMAGE_RE.test(n)));
    for (const [name, f] of remote) {
      const m = name.match(/^img_(.+)$/);
      if (m && IMAGE_RE.test(m[1]) && !localImgs.has(m[1])) {
        await fsp.writeFile(path.join(imagesDir, m[1]), await this.download(f.id));
        localImgs.add(m[1]);
        localChanged = true;
        result.downloaded++;
      }
    }
    for (const name of localImgs) {
      if (!remote.has(`img_${name}`)) {
        await this.upload({ name: `img_${name}`, folderId, mime: MIME[name.split('.').pop()] || 'application/octet-stream', content: await fsp.readFile(path.join(imagesDir, name)), appProperties: { kind: 'image' } });
        result.uploaded++;
      }
    }

    // tombstones back to both sides
    if (JSON.stringify(tomb) !== JSON.stringify(remoteTomb)) {
      await this.upload({ fileId: remoteTombFile?.id, name: 'tombstones.json', folderId, mime: 'application/json', content: JSON.stringify(tomb), appProperties: { kind: 'tombstones' } });
    }
    await writeJSON(this.f('tombstones.json'), tomb);
    await writeJSON(this.f('state.json'), { ...st, folderId, lastSync: started, lastSyncAt: Date.now() });
    if (localChanged) {
      this.statusInfo.revision++;
      this.onLocalChange();
    }
    return result;
  }
}

function mergeDoc(doc, localDoc, remoteDoc) {
  const byId = (list) => new Map((list || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  if (doc === 'folders') return [...new Map([...byId(localDoc), ...byId(remoteDoc)]).values()];
  const out = { ...localDoc, ...remoteDoc };
  for (const k of new Set([...Object.keys(localDoc || {}), ...Object.keys(remoteDoc || {})])) {
    if (Array.isArray(localDoc?.[k]) || Array.isArray(remoteDoc?.[k])) out[k] = [...new Map([...byId(localDoc?.[k]), ...byId(remoteDoc?.[k])]).values()];
  }
  return out;
}

function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')).email || null; } catch { return null; }
}

// "Setup code": Client ID + Secret in one string, to paste on other computers.
export const encodeSetup = (clientId, clientSecret) => `ffd20:${Buffer.from(JSON.stringify([clientId, clientSecret])).toString('base64')}`;
export function decodeSetup(code) {
  const m = String(code || '').trim().match(/^ffd20:(.+)$/);
  if (!m) return null;
  try { const [clientId, clientSecret] = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')); return { clientId, clientSecret }; } catch { return null; }
}
