// Library folder: switching to a synced folder (Koofr, Dropbox…), merging, external changes.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';

const tmp = (n) => fsp.mkdtemp(path.join(os.tmpdir(), `ffd20-${n}-`));
const LOCAL = await tmp('local');
const SYNCED = await tmp('koofr');
// the synced folder already has a library from another computer
fs.mkdirSync(path.join(SYNCED, 'entries'), { recursive: true });
fs.writeFileSync(path.join(SYNCED, 'entries', 'other.json'), JSON.stringify({ id: 'other', name: 'Do desktop', mode: 'monster', updatedAt: 1000 }));
fs.writeFileSync(path.join(SYNCED, 'entries', 'shared.json'), JSON.stringify({ id: 'shared', name: 'Versão nova', mode: 'monster', updatedAt: 9000 }));
fs.writeFileSync(path.join(SYNCED, 'folders.json'), JSON.stringify([{ id: 'f-desk', name: 'Desktop' }]));

const { server, url } = await startServer({ dataDir: LOCAL, port: 0 });
const H = { 'Content-Type': 'application/json', 'X-FFd20': '1' };
const api = async (p, opts = {}) => { const r = await fetch(url + p, opts); return { status: r.status, body: await r.json() }; };
const put = (p, body) => api(p, { method: 'PUT', headers: H, body: JSON.stringify(body) });
let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log('ok -', name); };

await t('switching to a synced folder merges both libraries', async () => {
  await put('/api/entries/mine', { id: 'mine', name: 'Do notebook', mode: 'npc', updatedAt: 5000 });
  await put('/api/entries/shared', { id: 'shared', name: 'Versão antiga', mode: 'monster', updatedAt: 2000 });
  await put('/api/folders', [{ id: 'f-note', name: 'Notebook' }]);
  await put('/api/settings', { exportDir: '/vault/deste/pc' });
  const r = await api('/api/library/location', { method: 'POST', headers: H, body: JSON.stringify({ dir: SYNCED, copy: true }) });
  assert.equal(r.status, 200);
  const names = (await api('/api/entries')).body.map((e) => e.name).sort();
  assert.deepEqual(names, ['Do desktop', 'Do notebook', 'Versão nova']);   // newest "shared" kept
  assert.deepEqual((await api('/api/folders')).body.map((f) => f.name).sort(), ['Desktop', 'Notebook']);
  assert.equal((await api('/api/library')).body.dir, path.resolve(SYNCED));
});

await t('settings stay on this computer, outside the synced folder', async () => {
  assert.equal((await api('/api/settings')).body.exportDir, '/vault/deste/pc');
  assert.ok(!fs.existsSync(path.join(SYNCED, 'settings.json')));
  assert.ok(fs.existsSync(path.join(LOCAL, 'location.json')));
});

await t('files written by the sync app bump the revision; own saves do not', async () => {
  const r0 = (await api('/api/library/revision')).body.revision;
  await put('/api/entries/mine', { id: 'mine', name: 'Editado aqui', mode: 'npc', updatedAt: 6000 });
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await api('/api/library/revision')).body.revision, r0);
  fs.writeFileSync(path.join(SYNCED, 'entries', 'fromcloud.json'), JSON.stringify({ id: 'fromcloud', name: 'Veio do Koofr', mode: 'monster', updatedAt: 7000 }));
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok((await api('/api/library/revision')).body.revision > r0);
  assert.ok((await api('/api/entries')).body.some((e) => e.name === 'Veio do Koofr'));
});

await t('conflicted copies left by the sync app do not duplicate a stat block', async () => {
  fs.writeFileSync(path.join(SYNCED, 'entries', 'mine (conflicted copy).json'), JSON.stringify({ id: 'mine', name: 'Cópia velha', mode: 'npc', updatedAt: 10 }));
  const list = (await api('/api/entries')).body.filter((e) => e.id === 'mine');
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Editado aqui');
});

await t('invalid folder is refused; reset goes back to the default folder', async () => {
  assert.equal((await api('/api/library/location', { method: 'POST', headers: H, body: JSON.stringify({ dir: 'relative/path' }) })).status, 400);
  const r = await api('/api/library/location', { method: 'POST', headers: H, body: JSON.stringify({ reset: true, copy: false }) });
  assert.equal(r.body.dir, path.resolve(LOCAL));
});

server.close();
console.log(`${passed} library tests passed`);
process.exit(0);
