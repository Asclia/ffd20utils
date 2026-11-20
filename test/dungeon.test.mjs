import assert from 'node:assert/strict';
import { generate, roomCells, getCell, isOpen, roomAt } from '../public/js/dungeon/generator.js';

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };

function reachable(map) {
  const start = roomCells(map.rooms[0])[0];
  const seen = new Set([`${start[0]},${start[1]}`]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && isOpen(getCell(map, x + dx, y + dy))) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  return map.rooms.every((r) => roomCells(r).some(([x, y]) => seen.has(`${x},${y}`)));
}

t('rooms & corridors: deterministic by seed, all rooms connected, numbered from the entrance', () => {
  const a = generate({ seed: 42, rooms: 10 });
  const b = generate({ seed: 42, rooms: 10 });
  assert.deepEqual(a.cells, b.cells);
  assert.ok(a.rooms.length >= 6);
  assert.ok(reachable(a));
  assert.deepEqual(a.rooms.map((r) => r.n), a.rooms.map((_, i) => i + 1));
  assert.ok(a.features.some((f) => f.type === 'stairs-up'));
  assert.ok(a.features.some((f) => f.type === 'door' || f.type === 'secret' || f.type === 'portcullis'));
  const up = a.features.find((f) => f.type === 'stairs-up');
  assert.equal(roomAt(a, up.x, up.y).n, 1);
});

t('many seeds: every room is reachable, doors sit on open cells', () => {
  for (let s = 1; s <= 40; s++) {
    const m = generate({ seed: s, rooms: 12, loops: 0.3 });
    assert.ok(reachable(m), `seed ${s}`);
    for (const f of m.features) assert.ok(isOpen(getCell(m, f.x, f.y)), `feature off-map seed ${s}`);
  }
});

t('caves: one connected cave split into numbered areas', () => {
  for (let s = 1; s <= 15; s++) {
    const m = generate({ seed: s, style: 'caves', rooms: 8 });
    assert.ok(m.rooms.length >= 2, `seed ${s}`);
    assert.ok(reachable(m), `seed ${s}`);
  }
});
console.log(`${passed} dungeon tests passed`);

// ------------------------------------------------------------------ tables & room suggestions
import { readFileSync } from 'node:fs';
import { indexTables, roll, siteName, stockRoom, creaturePool, OVERVIEW_FIELDS } from '../public/js/dungeon/tables.js';
import { rng } from '../public/js/dungeon/generator.js';
const tdata = JSON.parse(readFileSync(new URL('../public/data/tables.json', import.meta.url)));
const monsters = JSON.parse(readFileSync(new URL('../public/data/monsters.json', import.meta.url)));
const idx = indexTables(tdata);

t('every table rolls to text without unresolved references', () => {
  const r = rng(7);
  for (const tb of tdata.tables) for (let i = 0; i < 5; i++) {
    const v = roll(idx, tb, r);
    assert.ok(v && !/\{@|\]\(id:/.test(v), `${tb.id}: ${v}`);
  }
});

t('site name, overview and stocked rooms for a haunted barrow (PF, party level 5)', () => {
  const r = rng(11);
  const dungeon = { theme: 'haunted', domain: 'barrow', system: 'pf1e', partyLevel: 5 };
  const name = siteName(idx, dungeon, r);
  assert.ok(name.length > 3 && !/\(id:/.test(name), name);
  for (const [, , id] of OVERVIEW_FIELDS) assert.ok(roll(idx, id, r));
  const pool = creaturePool(dungeon, monsters, [{ name: 'Meu Lich', system: 'pf1e', _cr: 6, mode: 'monster', id: 'x' }]);
  let creatures = 0;
  for (let i = 0; i < 30; i++) {
    const room = stockRoom({ idx, dungeon, r, pool, traps: tdata.traps }, { id: `r${i}`, n: i + 1 });
    assert.ok(room.content.feature.text && room.content.detail.text);
    if (room.content.creatures?.text) {
      creatures++;
      const cr = Number((room.content.creatures.text.match(/CR (\d+)/) || [])[1]);
      assert.ok(cr >= 3 && cr <= 6, room.content.creatures.text);
    }
  }
  assert.ok(creatures > 3);
});
console.log(`${passed} dungeon tests passed (with tables)`);
