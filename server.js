#!/usr/bin/env node
// FFd20 Utils — local server (Node.js 18+, no dependencies).
// Serves the web app from ./public and stores the library under ./userdata (or $FFD20_DATA).
//   node server.js            -> http://localhost:7420
//   PORT=8080 node server.js
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exec } from 'node:child_process';
import { DriveSync, encodeSetup, decodeSetup } from './sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
// Data folder; set by startServer() (desktop app: the OS app-data folder; CLI: ./userdata).
let DATA, ENTRIES, IMAGES;
let sync = null;          // Google Drive sync (sync.js)
let fetchImpl = globalThis.fetch;
let serverOrigin = '';
function setDataDir(dir) {
  DATA = path.resolve(dir);
  ENTRIES = path.join(DATA, 'entries');
  IMAGES = path.join(DATA, 'images');
  for (const d of [DATA, ENTRIES, IMAGES]) fs.mkdirSync(d, { recursive: true });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg' };


const readJSON = async (file, fallback) => {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return fallback; }
};
const writeJSON = async (file, obj) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fsp.rename(tmp, file);
};
const safeId = (id) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
async function readBody(req, limit = 25 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(ch);
  }
  return Buffer.concat(chunks);
}
const json = async (req) => JSON.parse((await readBody(req)).toString('utf8') || 'null');

async function listEntries() {
  const files = (await fsp.readdir(ENTRIES)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    const e = await readJSON(path.join(ENTRIES, f), null);
    if (e) out.push(e);
  }
  return out;
}

function sanitizeFileName(name) {
  return String(name || 'statblock').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'statblock';
}

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  // Mutating requests must carry a custom header: browsers only send it from this app's own
  // origin (cross-site pages would need a CORS preflight, which this server never grants).
  if (method !== 'GET' && req.headers['x-ffd20'] !== '1') return send(res, 403, { error: 'missing X-FFd20 header' });
  if (p === '/api/ping') return send(res, 200, { ok: true, data: DATA });

  // entries
  if (p === '/api/entries' && method === 'GET') return send(res, 200, await listEntries());
  let m = p.match(/^\/api\/entries\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!safeId(id)) return send(res, 400, { error: 'bad id' });
    const file = path.join(ENTRIES, `${id}.json`);
    if (method === 'GET') {
      const e = await readJSON(file, null);
      return e ? send(res, 200, e) : send(res, 404, { error: 'not found' });
    }
    if (method === 'PUT') {
      const body = await json(req);
      if (!body || body.id !== id) return send(res, 400, { error: 'id mismatch' });
      await writeJSON(file, body);
      sync?.markDirty();
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await fsp.rm(file, { force: true });
      await sync?.recordDelete(id);
      return send(res, 200, { ok: true });
    }
  }
  // simple JSON documents: folders, homebrew, settings
  m = p.match(/^\/api\/(folders|homebrew|settings)$/);
  if (m) {
    const file = path.join(DATA, `${m[1]}.json`);
    const fallback = m[1] === 'folders' ? [] : {};
    if (method === 'GET') return send(res, 200, await readJSON(file, fallback));
    if (method === 'PUT') {
      await writeJSON(file, await json(req));
      if (m[1] !== 'settings') await sync?.recordDocChange(m[1]);
      return send(res, 200, { ok: true });
    }
  }
  // image upload: raw body with Content-Type image/*
  if (p === '/api/images' && method === 'POST') {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    const ext = IMAGE_EXT[type];
    if (!ext) return send(res, 415, { error: 'unsupported image type' });
    const buf = await readBody(req);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const name = `${hash}${ext}`;
    await fsp.writeFile(path.join(IMAGES, name), buf);
    sync?.markDirty();
    return send(res, 200, { url: `/userdata/images/${name}`, name });
  }
  // export markdown (+ local image) into a folder on disk, e.g. an Obsidian vault
  if (p === '/api/export' && method === 'POST') {
    const body = await json(req);
    const settings = await readJSON(path.join(DATA, 'settings.json'), {});
    const dir = path.resolve(body.dir || settings.exportDir || path.join(DATA, 'export'));
    const sub = body.subfolder ? path.join(dir, ...String(body.subfolder).split('/').map(sanitizeFileName)) : dir;
    await fsp.mkdir(sub, { recursive: true });
    const written = [];
    for (const f of body.files || []) {
      let content = String(f.content || '');
      if (f.image && /^\/userdata\/images\/[A-Za-z0-9]+\.[a-z]+$/.test(f.image)) {
        const imgName = path.basename(f.image);
        const attachDir = path.join(dir, settings.attachmentsFolder || 'attachments');
        await fsp.mkdir(attachDir, { recursive: true });
        await fsp.copyFile(path.join(IMAGES, imgName), path.join(attachDir, imgName));
        content = content.split('{{IMAGE}}').join(imgName);
      }
      const out = path.join(sub, `${sanitizeFileName(f.name)}.md`);
      await fsp.writeFile(out, content);
      written.push(out);
    }
    return send(res, 200, { ok: true, dir: sub, written });
  }
  // Google Drive sync
  if (p === '/api/sync/status' && method === 'GET') return send(res, 200, await sync.status());
  if (p === '/api/sync/config' && method === 'PUT') {
    const b = await json(req);
    const patch = {};
    if (typeof b.setupCode === 'string' && b.setupCode.trim()) {
      const dec = decodeSetup(b.setupCode);
      if (!dec) return send(res, 400, { error: 'Código de configuração inválido.' });
      Object.assign(patch, dec);
    }
    if (typeof b.clientId === 'string') patch.clientId = b.clientId.trim();
    if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) patch.clientSecret = b.clientSecret.trim();
    if (typeof b.auto === 'boolean') patch.auto = b.auto;
    await sync.setConfig(patch);
    return send(res, 200, await sync.status());
  }
  if (p === '/api/sync/setup-code' && method === 'GET') {
    const cfg = await sync.config();
    return send(res, 200, { code: cfg.clientId && cfg.clientSecret ? encodeSetup(cfg.clientId, cfg.clientSecret) : '' });
  }
  if (p === '/api/sync/connect' && method === 'POST') {
    try { return send(res, 200, { url: await sync.authUrl(`${serverOrigin}/oauth/callback`) }); } catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (p === '/api/sync/now' && method === 'POST') {
    try { return send(res, 200, { ok: true, result: await sync.sync() }); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (p === '/api/sync/disconnect' && method === 'POST') { await sync.disconnect(); return send(res, 200, await sync.status()); }

  // full backup
  if (p === '/api/backup' && method === 'GET') {
    const entries = await listEntries();
    return send(res, 200, {
      app: 'ffd20utils', version: 1, exportedAt: new Date().toISOString(), entries,
      folders: await readJSON(path.join(DATA, 'folders.json'), []), homebrew: await readJSON(path.join(DATA, 'homebrew.json'), {}),
    });
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

async function serveFile(res, file) {
  try {
    const st = await fsp.stat(file);
    if (st.isDirectory()) return serveFile(res, path.join(file, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/oauth/callback') {
      let msg;
      try {
        const email = await sync.handleCallback(url.searchParams);
        msg = `<h1>Conectado ao Google Drive ✓</h1><p>${email ? `Conta: ${escapeHtml(email)}. ` : ''}Pode fechar esta aba e voltar ao FFd20 Utils.</p>`;
      } catch (e) {
        msg = `<h1>Não foi possível conectar</h1><p>${escapeHtml(e.message)}</p>`;
      }
      return send(res, 200, `<!doctype html><meta charset="utf-8"><title>FFd20 Utils</title><body style="font-family:system-ui;background:#0f1420;color:#e6ebf5;text-align:center;padding:60px">${msg}</body>`, 'text/html; charset=utf-8');
    }
    let base = PUBLIC;
    let rel = decodeURIComponent(url.pathname);
    if (rel.startsWith('/userdata/images/')) { base = IMAGES; rel = rel.slice('/userdata/images/'.length); }
    const file = path.join(base, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(base)) return send(res, 403, 'Forbidden', 'text/plain');
    return await serveFile(res, file);
  } catch (e) {
    send(res, e.status || 500, { error: e.message });
  }
});

// Starts the server. Tries `port` first and falls back to any free port if it is taken.
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// fetch: optional fetch implementation (the desktop app passes Electron's net.fetch, which
// follows the system proxy settings — useful on work networks).
export function startServer({ dataDir, port = 7420, host = '127.0.0.1', fetch: customFetch } = {}) {
  setDataDir(dataDir || path.join(__dirname, 'userdata'));
  if (customFetch) fetchImpl = customFetch;
  // FFD20_SYNC_ENDPOINTS (JSON) points the Google URLs at a local fake — used only by tests
  let endpoints = {};
  try { endpoints = process.env.FFD20_SYNC_ENDPOINTS ? JSON.parse(process.env.FFD20_SYNC_ENDPOINTS) : {}; } catch { /* ignore */ }
  sync = new DriveSync({ dataDir: DATA, fetch: (...a) => fetchImpl(...a), endpoints });
  const listen = (p) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, host, () => { server.off('error', reject); resolve(server.address().port); });
  });
  return listen(port).catch((e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    return listen(0);
  }).then((p) => {
    serverOrigin = `http://${host === '0.0.0.0' || host === 'localhost' ? '127.0.0.1' : host}:${p}`;
    sync.startAuto();
    return { server, url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${p}`, dataDir: DATA, sync };
  });
}

// Command-line use: node server.js [--open]
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer({
    dataDir: process.env.FFD20_DATA || path.join(__dirname, 'userdata'),
    port: Number(process.env.PORT || 7420),
    host: process.env.HOST || '127.0.0.1',
  }).then(({ url, dataDir }) => {
    console.log(`FFd20 Utils rodando em ${url}`);
    console.log(`Biblioteca salva em: ${dataDir}`);
    if (process.argv.includes('--open')) {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      exec(cmd, () => {});
    }
  });
}
