// Sync logic tested against an in-memory fake of the Google Drive / OAuth endpoints,
// with two "computers" (separate data folders) sharing one Drive.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DriveSync, encodeSetup, decodeSetup } from '../sync.js';

// ------------------------------------------------------------------ fake Drive
const files = new Map();
let nextId = 1;
function parseQ(q) {
  const parent = q.match(/'([^']+)' in parents/);
  const name = q.match(/name = '([^']+)'/);
  return (f) => !f.trashed && (!parent || f.parents?.includes(parent[1])) && (!name || f.name === name[1]);
}
function parseMultipart(buf, type) {
  const boundary = type.match(/boundary=(.+)$/)[1];
  const s = buf.toString('latin1');
  const parts = s.split(`--${boundary}`).slice(1, -1).map((p) => p.replace(/^\r\n/, '').replace(/\r\n$/, ''));
  const body = (p) => p.slice(p.indexOf('\r\n\r\n') + 4);
  return { meta: JSON.parse(Buffer.from(body(parts[0]), 'latin1').toString('utf8')), content: Buffer.from(body(parts[1]), 'latin1') };
}
const fake = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const u = new URL(req.url, 'http://x');
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (u.pathname === '/token') return json(200, { access_token: 'tok', expires_in: 3600 });
  if (req.headers.authorization !== 'Bearer tok') return json(401, { error: { message: 'unauth' } });
  let m;
  if (u.pathname === '/api/files' && req.method === 'GET') {
    const list = [...files.values()].filter(parseQ(u.searchParams.get('q'))).map(({ content, ...meta }) => meta);
    return json(200, { files: list });
  }
  if (u.pathname === '/api/files' && req.method === 'POST') {
    const meta = JSON.parse(buf.toString());
    const id = `f${nextId++}`;
    files.set(id, { id, ...meta, parents: meta.parents || [] });
    return json(200, { id });
  }
  if ((m = u.pathname.match(/^\/api\/files\/(\w+)$/))) {
    const f = files.get(m[1]);
    if (!f) return json(404, { error: { message: 'not found' } });
    if (req.method === 'DELETE') { files.delete(m[1]); res.writeHead(204); return res.end(); }
    if (u.searchParams.get('alt') === 'media') { res.writeHead(200); return res.end(f.content); }
    return json(200, { id: f.id, trashed: false });
  }
  if (u.pathname === '/upload/files' && req.method === 'POST') {
    const { meta, content } = parseMultipart(buf, req.headers['content-type']);
    const id = `f${nextId++}`;
    files.set(id, { id, name: meta.name, parents: meta.parents, appProperties: meta.appProperties || {}, content });
    return json(200, { id });
  }
  if ((m = u.pathname.match(/^\/upload\/files\/(\w+)$/)) && req.method === 'PATCH') {
    const f = files.get(m[1]);
    const { meta, content } = parseMultipart(buf, req.headers['content-type']);
    f.content = content;
    f.appProperties = { ...f.appProperties, ...(meta.appProperties || {}) };
    return json(200, { id: f.id });
  }
  json(404, { error: { message: `no route ${req.method} ${u.pathname}` } });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${fake.address().port}`;
const endpoints = { token: `${base}/token`, api: `${base}/api`, upload: `${base}/upload`, revoke: `${base}/revoke`, auth: `${base}/auth` };

// ------------------------------------------------------------------ two computers
async function computer(name) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `ffd20-${name}-`));
  for (const d of ['entries', 'images', 'sync']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sync', 'config.json'), JSON.stringify({ clientId: 'cid', clientSecret: 'sec' }));
  fs.writeFileSync(path.join(dir, 'sync', 'token.json'), JSON.stringify({ refresh_token: 'r', access_token: 'tok', expiry: Date.now() + 3600e3 }));
  const s = new DriveSync({ dataDir: dir, endpoints });
  const put = (e) => fs.writeFileSync(path.join(dir, 'entries', `${e.id}.json`), JSON.stringify(e));
  const get = (id) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'entries', `${id}.json`), 'utf8')); } catch { return null; } };
  const all = () => fs.readdirSync(path.join(dir, 'entries')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, 'entries', f), 'utf8')));
  return { dir, s, put, get, all };
}
const A = await computer('notebook');
const B = await computer('desktop');
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };
const tick = () => new Promise((r) => setTimeout(r, 5));

await t('new stat block on A appears on B', async () => {
  A.put({ id: 'bomb1', name: 'Bomb', updatedAt: Date.now() });
  await A.s.sync();
  await B.s.sync();
  assert.equal(B.get('bomb1').name, 'Bomb');
});

await t('edit on B flows back to A', async () => {
  await tick();
  B.put({ ...B.get('bomb1'), name: 'Grenade', updatedAt: Date.now() });
  await B.s.sync();
  await A.s.sync();
  assert.equal(A.get('bomb1').name, 'Grenade');
});

await t('deletion on A propagates to B', async () => {
  A.put({ id: 'gob', name: 'Goblin', updatedAt: Date.now() });
  await A.s.sync(); await B.s.sync();
  assert.ok(B.get('gob'));
  fs.rmSync(path.join(A.dir, 'entries', 'gob.json'));
  await A.s.recordDelete('gob');
  await A.s.sync(); await B.s.sync();
  assert.equal(B.get('gob'), null);
  assert.ok(![...files.values()].some((f) => f.name === 'entry_gob.json'));
});

await t('edited on both sides: newest wins, other kept as a conflict copy', async () => {
  await tick();
  A.put({ ...A.get('bomb1'), name: 'Bomb (A edit)', updatedAt: Date.now() });
  await tick();
  B.put({ ...B.get('bomb1'), name: 'Bomb (B edit)', updatedAt: Date.now() });
  await A.s.sync();
  const r = await B.s.sync();
  assert.equal(r.conflicts, 1);
  assert.equal(B.get('bomb1').name, 'Bomb (B edit)');
  assert.ok(B.all().some((e) => e.name === 'Bomb (A edit) (conflito de sync)'));
  await A.s.sync();
  assert.equal(A.get('bomb1').name, 'Bomb (B edit)');
  assert.ok(A.all().some((e) => e.name === 'Bomb (A edit) (conflito de sync)'));
});

await t('images, folders and homebrew are shared', async () => {
  fs.writeFileSync(path.join(A.dir, 'images', 'abc123.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  fs.writeFileSync(path.join(A.dir, 'folders.json'), JSON.stringify([{ id: 'f1', name: 'Bosses' }]));
  await A.s.recordDocChange('folders');
  fs.writeFileSync(path.join(B.dir, 'homebrew.json'), JSON.stringify({ races: [{ id: 'r1', name: 'Lunarian' }] }));
  await A.s.sync();
  await B.s.sync();
  await A.s.sync();
  assert.deepEqual([...fs.readFileSync(path.join(B.dir, 'images', 'abc123.png'))], [137, 80, 78, 71, 1, 2, 3]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(B.dir, 'folders.json'), 'utf8'))[0].name, 'Bosses');
  assert.equal(JSON.parse(fs.readFileSync(path.join(A.dir, 'homebrew.json'), 'utf8')).races[0].name, 'Lunarian');
});

await t('a third computer with its own data merges instead of overwriting', async () => {
  const C = await computer('trabalho');
  fs.writeFileSync(path.join(C.dir, 'folders.json'), JSON.stringify([{ id: 'f9', name: 'Trabalho' }]));
  C.put({ id: 'npc9', name: 'Guarda', updatedAt: Date.now() });
  await C.s.sync();
  const folders = JSON.parse(fs.readFileSync(path.join(C.dir, 'folders.json'), 'utf8')).map((f) => f.name).sort();
  assert.deepEqual(folders, ['Bosses', 'Trabalho']);
  assert.ok(C.get('bomb1'));
  await A.s.sync();
  assert.ok(A.get('npc9'));
});

await t('setup code round-trip', async () => {
  assert.deepEqual(decodeSetup(encodeSetup('id.apps.googleusercontent.com', 'GOCSPX-x')), { clientId: 'id.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' });
  assert.equal(decodeSetup('nonsense'), null);
});

await t('auth URL uses PKCE, loopback redirect and the drive.file scope', async () => {
  const url = new URL(await A.s.authUrl('http://127.0.0.1:47420/oauth/callback'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:47420/oauth/callback');
  assert.match(url.searchParams.get('scope'), /auth\/drive\.file/);
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

fake.close();
console.log(`${passed} sync tests passed`);
