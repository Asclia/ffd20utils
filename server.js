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
// Data folder; set by startServer() (desktop app: the OS app-data folder; CLI: ./userdata).
let DATA, ENTRIES, IMAGES;
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
      return send(res, 200, { ok: true });
    }
    if (method === 'DELETE') {
      await fsp.rm(file, { force: true });
      return send(res, 200, { ok: true });
    }
  }
  // simple JSON documents: folders, homebrew, settings
  m = p.match(/^\/api\/(folders|homebrew|settings)$/);
  if (m) {
    const file = path.join(DATA, `${m[1]}.json`);
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
    await fsp.writeFile(path.join(IMAGES, name), buf);
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
  setDataDir(dataDir || path.join(__dirname, 'userdata'));
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
