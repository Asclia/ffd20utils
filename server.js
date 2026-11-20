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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
// LOCAL: this computer's own folder (desktop app: OS app-data folder; CLI: ./userdata). It keeps
//   settings.json (per-computer, e.g. the Obsidian vault path) and location.json.
// DATA: the library (entries, images, folders, homebrew). By default the same as LOCAL; the user can
//   point it to a folder synced by Koofr, Dropbox, MEGA… to share it between computers.
let LOCAL, DATA, ENTRIES, IMAGES, DUNGEONS;
let locationError = null; // configured library folder could not be used at startup
function setDataDir(dir) {
  DATA = path.resolve(dir);
  ENTRIES = path.join(DATA, 'entries');
  IMAGES = path.join(DATA, 'images');
  DUNGEONS = path.join(DATA, 'dungeons');
  for (const d of [DATA, ENTRIES, IMAGES, DUNGEONS]) fs.mkdirSync(d, { recursive: true });
  watchLibrary();
}

// ---- external changes (a sync app writing into the library folder) -> revision counter
let revision = 0;
let watchers = [];
let bumpTimer = null;
const ownWrites = new Map(); // absolute path -> time of our own last write
const ownKey = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));
const markOwn = (file) => ownWrites.set(ownKey(file), Date.now());
function watchLibrary() {
  for (const w of watchers) try { w.close(); } catch { /* ignore */ }
  watchers = [];
  // Each folder only reacts to the files that matter (on Windows a folder also reports changes of
  // its subfolders, e.g. "entries", which must not count as an external change).
  const relevant = new Map([
    [DATA, (n) => n === 'folders.json' || n === 'homebrew.json'],
    [ENTRIES, (n) => n.endsWith('.json')],
    [DUNGEONS, (n) => n.endsWith('.json')],
    [IMAGES, (n) => /\.(png|jpg|jpeg|gif|webp|avif|svg)$/i.test(n)],
  ]);
  for (const [dir, isRelevant] of relevant) {
    try {
      watchers.push(fs.watch(dir, (ev, name) => {
        if (!name) return;
        name = path.basename(String(name));
        if (name.endsWith('.tmp') || !isRelevant(name)) return;
        const full = path.join(dir, name);
        if (Date.now() - (ownWrites.get(ownKey(full)) || 0) < 3000) return;
        clearTimeout(bumpTimer);
        bumpTimer = setTimeout(() => { revision++; }, 800);
      }));
    } catch { /* watching is best effort */ }
  }
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
  markOwn(file);
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
  // sync apps may leave "conflicted copy" files with the same id: keep the newest one
  const byId = new Map();
  for (const f of files) {
    const e = await readJSON(path.join(ENTRIES, f), null);
    if (!e || !e.id) continue;
    const prev = byId.get(e.id);
    if (!prev || (Number(e.updatedAt) || 0) > (Number(prev.updatedAt) || 0)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

// Copies a library into another folder without losing anything: stat blocks keep the newest
// version, images are copied when missing, folders and homebrew are joined by id.
async function mergeLibrary(from, to) {
  if (path.resolve(from) === path.resolve(to)) return { copied: 0 };
  for (const d of ['entries', 'images']) await fsp.mkdir(path.join(to, d), { recursive: true });
  let copied = 0;
  for (const f of await fsp.readdir(path.join(from, 'entries')).catch(() => [])) {
    if (!f.endsWith('.json')) continue;
    const src = await readJSON(path.join(from, 'entries', f), null);
    if (!src?.id || !safeId(src.id)) continue;
    const dest = path.join(to, 'entries', `${src.id}.json`);
    const cur = await readJSON(dest, null);
    if (!cur || (Number(src.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) { await writeJSON(dest, src); copied++; }
  }
  await fsp.mkdir(path.join(to, 'dungeons'), { recursive: true });
  for (const f of await fsp.readdir(path.join(from, 'dungeons')).catch(() => [])) {
    if (!f.endsWith('.json')) continue;
    const src = await readJSON(path.join(from, 'dungeons', f), null);
    if (!src?.id || !safeId(src.id)) continue;
    const dest = path.join(to, 'dungeons', `${src.id}.json`);
    const cur = await readJSON(dest, null);
    if (!cur || (Number(src.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) await writeJSON(dest, src);
  }
  for (const f of await fsp.readdir(path.join(from, 'images')).catch(() => [])) {
    const dest = path.join(to, 'images', f);
    if (!fs.existsSync(dest)) { markOwn(dest); await fsp.copyFile(path.join(from, 'images', f), dest); }
  }
  const byId = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id).map((x) => [x.id, x]));
  const folders = [...new Map([...byId(await readJSON(path.join(from, 'folders.json'), [])), ...byId(await readJSON(path.join(to, 'folders.json'), []))]).values()];
  if (folders.length) await writeJSON(path.join(to, 'folders.json'), folders);
  const hbFrom = await readJSON(path.join(from, 'homebrew.json'), {});
  const hbTo = await readJSON(path.join(to, 'homebrew.json'), {});
  const hb = { ...hbFrom, ...hbTo };
  for (const k of new Set([...Object.keys(hbFrom), ...Object.keys(hbTo)])) {
    if (Array.isArray(hbFrom[k]) || Array.isArray(hbTo[k])) hb[k] = [...new Map([...byId(hbFrom[k]), ...byId(hbTo[k])]).values()];
  }
  if (Object.keys(hb).length) await writeJSON(path.join(to, 'homebrew.json'), hb);
  return { copied };
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

  // library folder (e.g. a Koofr / Dropbox / MEGA synced folder)
  if (p === '/api/library' && method === 'GET') return send(res, 200, { dir: DATA, defaultDir: LOCAL, custom: path.resolve(DATA) !== path.resolve(LOCAL), revision, error: locationError });
  if (p === '/api/library/revision' && method === 'GET') return send(res, 200, { revision });
  if (p === '/api/library/location' && method === 'POST') {
    const body = await json(req);
    const target = body.reset ? LOCAL : String(body.dir || '').trim();
    if (!target || !path.isAbsolute(target)) return send(res, 400, { error: 'Informe o caminho completo de uma pasta.' });
    try {
      await fsp.mkdir(target, { recursive: true });
      const probe = path.join(target, `.ffd20-test-${process.pid}`);
      await fsp.writeFile(probe, 'ok');
      await fsp.rm(probe, { force: true });
    } catch (e) {
      return send(res, 400, { error: `Não consegui usar essa pasta: ${e.message}` });
    }
    const result = body.copy ? await mergeLibrary(DATA, target) : { copied: 0 };
    setDataDir(target);
    locationError = null;
    await writeJSON(path.join(LOCAL, 'location.json'), body.reset ? {} : { libraryDir: path.resolve(target) });
    return send(res, 200, { ok: true, dir: DATA, ...result });
  }

  // dungeons (maps + room keys)
  if (p === '/api/dungeons' && method === 'GET') {
    const out = [];
    for (const f of (await fsp.readdir(DUNGEONS)).filter((x) => x.endsWith('.json'))) {
      const d = await readJSON(path.join(DUNGEONS, f), null);
      if (d?.id) out.push(d);
    }
    return send(res, 200, out);
  }
  let dm = p.match(/^\/api\/dungeons\/([^/]+)$/);
  if (dm) {
    const id = decodeURIComponent(dm[1]);
    if (!safeId(id)) return send(res, 400, { error: 'bad id' });
    const file = path.join(DUNGEONS, `${id}.json`);
    if (method === 'PUT') {
      const body = await json(req);
      if (!body || body.id !== id) return send(res, 400, { error: 'id mismatch' });
      await writeJSON(file, body);
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE') { markOwn(file); await fsp.rm(file, { force: true }); return send(res, 200, { ok: true }); }
  }

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
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      markOwn(file);
      await fsp.rm(file, { force: true });
      return send(res, 200, { ok: true });
    }
  }
  // simple JSON documents: folders, homebrew, settings
  m = p.match(/^\/api\/(folders|homebrew|settings)$/);
  if (m) {
    // settings belong to this computer (vault path etc.), the rest to the (possibly shared) library
    const file = path.join(m[1] === 'settings' ? LOCAL : DATA, `${m[1]}.json`);
    const fallback = m[1] === 'folders' ? [] : {};
    if (method === 'GET') return send(res, 200, await readJSON(file, fallback));
    if (method === 'PUT') { await writeJSON(file, await json(req)); return send(res, 200, { ok: true }); }
  }
  // image upload: raw body with Content-Type image/*
  if (p === '/api/images' && method === 'POST') {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    const ext = IMAGE_EXT[type];
    if (!ext) return send(res, 415, { error: 'unsupported image type' });
    const buf = await readBody(req);
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
    const name = `${hash}${ext}`;
    markOwn(path.join(IMAGES, name));
    await fsp.writeFile(path.join(IMAGES, name), buf);
    return send(res, 200, { url: `/userdata/images/${name}`, name });
  }
  // export markdown (+ local image) into a folder on disk, e.g. an Obsidian vault
  if (p === '/api/export' && method === 'POST') {
    const body = await json(req);
    const settings = await readJSON(path.join(LOCAL, 'settings.json'), {});
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
export function startServer({ dataDir, port = 7420, host = '127.0.0.1' } = {}) {
  LOCAL = path.resolve(dataDir || path.join(__dirname, 'userdata'));
  fs.mkdirSync(LOCAL, { recursive: true });
  let libraryDir = LOCAL;
  try {
    const loc = JSON.parse(fs.readFileSync(path.join(LOCAL, 'location.json'), 'utf8'));
    if (loc.libraryDir) {
      try { fs.mkdirSync(loc.libraryDir, { recursive: true }); libraryDir = loc.libraryDir; } catch (e) { locationError = `A pasta da biblioteca (${loc.libraryDir}) não está acessível: ${e.message}. Usando a pasta padrão até ela voltar.`; }
    }
  } catch { /* no location.json: default location */ }
  setDataDir(libraryDir);
  const listen = (p) => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(p, host, () => { server.off('error', reject); resolve(server.address().port); });
  });
  return listen(port).catch((e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    return listen(0);
  }).then((p) => ({ server, url: `http://${host === '0.0.0.0' ? 'localhost' : host}:${p}`, dataDir: DATA }));
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
