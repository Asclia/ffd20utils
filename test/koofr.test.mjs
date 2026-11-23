// Koofr store against a local mock of the Koofr REST API (same calls as Koofr's go-koofrclient).
import http from 'node:http';
import assert from 'node:assert/strict';
import { KOOFR } from '../public/js/koofr.js';
import { openKoofrStore } from '../public/js/store.js';

const files = new Map(); // path → { text, modified }
const dirs = new Set(['/']);
const calls = [];
let now = 1000;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.searchParams.get('path');
  calls.push(`${req.method} ${u.pathname}`);
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(v)); };
    if (u.pathname === '/token') {
      const { email, password } = JSON.parse(body);
      return email === 'me@x.com' && password === 'app-pass' ? json(200, { token: 'T1' }) : json(401, {});
    }
    if (req.headers.authorization !== 'Token token=T1') return json(401, {});
    if (u.pathname === '/api/v2/mounts') return json(200, { mounts: [{ id: 'm1', name: 'Koofr', isPrimary: true }] });
    if (u.pathname === '/api/v2/mounts/m1/files/list') {
      if (!dirs.has(p)) return json(404, {});
      const pre = p === '/' ? '/' : `${p}/`;
      const out = [];
      for (const d of dirs) if (d !== p && d.startsWith(pre) && !d.slice(pre.length).includes('/')) out.push({ name: d.slice(pre.length), type: 'dir', modified: 0 });
      for (const [f, v] of files) if (f.startsWith(pre) && !f.slice(pre.length).includes('/')) out.push({ name: f.slice(pre.length), type: 'file', modified: v.modified, size: v.text.length });
      return json(200, { files: out });
    }
    if (u.pathname === '/api/v2/mounts/m1/files/folder') { dirs.add(`${p === '/' ? '' : p}/${JSON.parse(body).name}`); return json(200, {}); }
    if (u.pathname === '/content/api/v2/mounts/m1/files/get') { const f = files.get(p); if (!f) return json(404, {}); res.writeHead(200); return res.end(f.text); }
    if (u.pathname === '/content/api/v2/mounts/m1/files/put') {
      if (!dirs.has(p)) return json(404, {});
      const m = /\r\n\r\n([\s\S]*)\r\n--/.exec(body);
      files.set(`${p}/${u.searchParams.get('filename')}`, { text: m[1], modified: ++now });
      return json(200, { name: u.searchParams.get('filename') });
    }
    if (u.pathname === '/api/v2/mounts/m1/files/remove') { files.delete(p); return json(200, {}); }
    json(404, {});
  });
});
await new Promise((r) => server.listen(0, r));
KOOFR.base = `http://127.0.0.1:${server.address().port}`;
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };

await t('wrong app password is refused', async () => {
  await assert.rejects(() => openKoofrStore({ email: 'me@x.com', password: 'nope', root: '/Compendium' }, { strict: true }), /recusou/);
});
const s = await openKoofrStore({ email: 'me@x.com', password: 'app-pass', root: '/Compendium' });
await t('save, list and delete statblocks in the library folder', async () => {
  assert.deepEqual(await s.listEntries(), []);
  await s.saveEntry({ id: 'a1', name: 'Goblin', updatedAt: 1 });
  await s.saveEntry({ id: 'b2', name: 'Behemoth', updatedAt: 1 });
  assert.ok(files.has('/Compendium/entries/a1.json'));
  const list = await s.listEntries();
  assert.deepEqual(list.map((e) => e.name).sort(), ['Behemoth', 'Goblin']);
  await s.deleteEntry('a1');
  assert.deepEqual((await s.listEntries()).map((e) => e.name), ['Behemoth']);
});
await t('only changed files are downloaded again', async () => {
  calls.length = 0;
  await s.listEntries();
  assert.equal(calls.filter((c) => c.includes('files/get')).length, 0);
  files.set('/Compendium/entries/b2.json', { text: JSON.stringify({ id: 'b2', name: 'Behemoth King', updatedAt: 2 }), modified: ++now }); // changed on the PC
  const list = await s.listEntries();
  assert.equal(list[0].name, 'Behemoth King');
  assert.equal(calls.filter((c) => c.includes('files/get')).length, 1);
});
await t('folders / homebrew / encounters documents and revision', async () => {
  assert.deepEqual(await s.getDoc('folders', []), []);
  const r0 = await s.revision();
  await s.putDoc('folders', [{ id: 'f', name: 'Bosses' }]);
  assert.deepEqual(await s.getDoc('folders', []), [{ id: 'f', name: 'Bosses' }]);
  assert.notEqual(await s.revision(), r0);
  await s.saveDungeon({ id: 'd1', name: 'Covil' });
  assert.equal((await s.listDungeons())[0].name, 'Covil');
});
await t('offline: last downloaded copy is used', async () => {
  const port = KOOFR.base;
  KOOFR.base = 'http://127.0.0.1:1'; // nothing listens here
  s.k.token = '';
  const list = await s.listEntries();
  assert.equal(list[0].name, 'Behemoth King');
  assert.equal(s.offline, true);
  KOOFR.base = port;
});
server.close();
console.log(`${passed} koofr tests passed`);
