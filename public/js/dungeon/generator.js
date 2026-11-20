// Dungeon map generator and helpers (pure functions, no DOM).
// Map: grid of cells, row strings with
//   '#' rock (solid)   '.' floor   '~' water   ':' rubble / difficult terrain
// Features sit on cells: door, secret, portcullis, stairs-up, stairs-down, trap, chest, statue, pillar, altar.
// Rooms: numbered areas with a rectangle (x, y, w, h) or an explicit cell list (caves).

export const CELL = { ROCK: '#', FLOOR: '.', WATER: '~', RUBBLE: ':' };
export const FEATURES = {
  door: { label: 'Porta', icon: '▯' }, secret: { label: 'Porta secreta', icon: 'S' }, portcullis: { label: 'Grade', icon: '#' },
  'stairs-up': { label: 'Escada (sobe)', icon: '▲' }, 'stairs-down': { label: 'Escada (desce)', icon: '▼' },
  trap: { label: 'Armadilha', icon: 'T' }, chest: { label: 'Baú', icon: '◆' }, statue: { label: 'Estátua', icon: '♜' },
  pillar: { label: 'Pilar', icon: '●' }, altar: { label: 'Altar', icon: '✚' },
};

// Small seeded RNG (mulberry32) so a seed always rebuilds the same dungeon
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const newSeed = () => Math.floor(Math.random() * 1e9);

export function emptyGrid(w, h, fill = CELL.ROCK) {
  return Array.from({ length: h }, () => fill.repeat(w));
}
export function getCell(map, x, y) {
  if (y < 0 || y >= map.cells.length || x < 0 || x >= map.w) return CELL.ROCK;
  return map.cells[y][x];
}
export function setCells(cells, pts, ch) {
  const rows = cells.map((r) => r.split(''));
  for (const [x, y] of pts) if (rows[y] && x >= 0 && x < rows[y].length) rows[y][x] = ch;
  return rows.map((r) => r.join(''));
}
export const isOpen = (ch) => ch === CELL.FLOOR || ch === CELL.WATER || ch === CELL.RUBBLE;

// ------------------------------------------------------------------ rooms & corridors
export function generate(opts = {}) {
  const o = { w: 48, h: 36, rooms: 10, style: 'rooms', seed: newSeed(), loops: 0.2, water: 0, ...opts };
  const r = rng(o.seed);
  return o.style === 'caves' ? generateCaves(o, r) : generateRooms(o, r);
}

function generateRooms(o, r) {
  const { w, h } = o;
  const grid = Array.from({ length: h }, () => Array(w).fill(CELL.ROCK));
  const rooms = [];
  let tries = 0;
  while (rooms.length < o.rooms && tries++ < o.rooms * 60) {
    const big = r() < 0.2;
    const rw = big ? r.int(7, 11) : r.int(3, 8);
    const rh = big ? r.int(6, 9) : r.int(3, 6);
    const x = r.int(1, w - rw - 2);
    const y = r.int(1, h - rh - 2);
    if (rooms.some((q) => x < q.x + q.w + 2 && x + rw + 2 > q.x && y < q.y + q.h + 2 && y + rh + 2 > q.y)) continue;
    rooms.push({ x, y, w: rw, h: rh });
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) grid[yy][xx] = CELL.FLOOR;
  }
  const features = [];
  const center = (q) => [Math.floor(q.x + q.w / 2), Math.floor(q.y + q.h / 2)];
  const inRoom = (x, y) => rooms.findIndex((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
  // minimum spanning tree over room centers (+ a few extra links so the map has loops)
  const edges = [];
  const connected = new Set([0]);
  while (connected.size < rooms.length) {
    let best = null;
    for (const i of connected) {
      for (let j = 0; j < rooms.length; j++) {
        if (connected.has(j)) continue;
        const [ax, ay] = center(rooms[i]);
        const [bx, by] = center(rooms[j]);
        const dd = Math.abs(ax - bx) + Math.abs(ay - by);
        if (!best || dd < best.d) best = { i, j, d: dd };
      }
    }
    if (!best) break;
    connected.add(best.j);
    edges.push([best.i, best.j]);
  }
  for (let i = 0; i < rooms.length; i++) {
    if (r() < o.loops) {
      const j = r.int(0, rooms.length - 1);
      if (j !== i && !edges.some(([a, b]) => (a === i && b === j) || (a === j && b === i))) edges.push([i, j]);
    }
  }
  for (const [i, j] of edges) {
    const [ax, ay] = center(rooms[i]);
    const [bx, by] = center(rooms[j]);
    const path = [];
    const horizFirst = r() < 0.5;
    const stepTo = (x0, y0, x1, y1) => {
      let x = x0;
      let y = y0;
      while (x !== x1) { x += Math.sign(x1 - x); path.push([x, y]); }
      while (y !== y1) { y += Math.sign(y1 - y); path.push([x, y]); }
    };
    if (horizFirst) { stepTo(ax, ay, bx, ay); stepTo(bx, ay, bx, by); } else { stepTo(ax, ay, ax, by); stepTo(ax, by, bx, by); }
    let prevRoom = i;
    path.forEach(([x, y], k) => {
      const ri = inRoom(x, y);
      if (ri === -1 && grid[y][x] === CELL.ROCK) grid[y][x] = CELL.FLOOR;
      // the corridor cell right outside a room becomes a door (leaving and entering)
      if (ri === -1 && prevRoom !== -1) addDoor(features, x, y, r);
      if (ri !== -1 && prevRoom === -1 && k > 0) addDoor(features, path[k - 1][0], path[k - 1][1], r);
      prevRoom = ri;
    });
  }
  if (o.water > 0) sprinkle(grid, r, CELL.WATER, o.water);
  const cells = grid.map((row) => row.join(''));
  const roomList = rooms.map((q, i) => ({ id: `r${i}`, x: q.x, y: q.y, w: q.w, h: q.h }));
  return finish({ w, h, cells, rooms: roomList, features, seed: o.seed, style: 'rooms' }, r);
}

function addDoor(features, x, y, r) {
  if (features.some((f) => f.x === x && f.y === y)) return;
  const roll = r();
  features.push({ id: `f${x}_${y}`, x, y, type: roll < 0.08 ? 'secret' : roll < 0.13 ? 'portcullis' : 'door' });
}

function sprinkle(grid, r, ch, amount) {
  const h = grid.length;
  const w = grid[0].length;
  const blobs = Math.max(1, Math.round(amount * 4));
  for (let b = 0; b < blobs; b++) {
    let x = r.int(1, w - 2);
    let y = r.int(1, h - 2);
    for (let k = 0; k < 18; k++) {
      if (grid[y][x] === CELL.FLOOR) grid[y][x] = ch;
      x = Math.max(1, Math.min(w - 2, x + r.int(-1, 1)));
      y = Math.max(1, Math.min(h - 2, y + r.int(-1, 1)));
    }
  }
}

// ------------------------------------------------------------------ caves (cellular automaton)
function generateCaves(o, r) {
  const { w, h } = o;
  let g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 1 : r() < 0.45 ? 1 : 0)));
  const walls = (x, y) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy;
      const xx = x + dx;
      n += yy < 0 || xx < 0 || yy >= h || xx >= w ? 1 : g[yy][xx];
    }
    return n;
  };
  for (let it = 0; it < 5; it++) g = g.map((row, y) => row.map((v, x) => (walls(x, y) > 4 ? 1 : walls(x, y) < 4 ? 0 : v)));
  // keep the largest open region
  const seen = Array.from({ length: h }, () => Array(w).fill(false));
  let best = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] || seen[y][x]) continue;
    const region = [];
    const stack = [[x, y]];
    seen[y][x] = true;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      region.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !g[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; stack.push([nx, ny]); }
      }
    }
    if (region.length > best.length) best = region;
  }
  const grid = Array.from({ length: h }, () => Array(w).fill(CELL.ROCK));
  for (const [x, y] of best) grid[y][x] = CELL.FLOOR;
  if (o.water > 0) sprinkle(grid, r, CELL.WATER, o.water);
  // split the cave into numbered areas around random seed points (Voronoi on floor cells)
  const n = Math.max(2, o.rooms);
  const seeds = [];
  for (let k = 0; k < n * 20 && seeds.length < n; k++) {
    const p = r.pick(best);
    if (seeds.every((s) => Math.abs(s[0] - p[0]) + Math.abs(s[1] - p[1]) > 7)) seeds.push(p);
  }
  const areas = seeds.map((s, i) => ({ id: `r${i}`, cells: [], cx: s[0], cy: s[1] }));
  for (const [x, y] of best) {
    let bi = 0;
    let bd = Infinity;
    seeds.forEach((s, i) => { const dd = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (dd < bd) { bd = dd; bi = i; } });
    areas[bi].cells.push([x, y]);
  }
  const rooms = areas.filter((a) => a.cells.length).map((a) => {
    const xs = a.cells.map((c) => c[0]);
    const ys = a.cells.map((c) => c[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { id: a.id, x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1, cells: a.cells, label: [a.cx, a.cy] };
  });
  return finish({ w, h, cells: grid.map((row) => row.join('')), rooms, features: [], seed: o.seed, style: 'caves' }, r);
}

// ------------------------------------------------------------------ numbering, stairs, room sizes
function finish(map, r) {
  if (!map.rooms.length) return map;
  // number rooms by walking distance from the entrance (room 0)
  const order = bfsOrder(map);
  map.rooms = order.map((ri, n) => ({ ...map.rooms[ri], n: n + 1 }));
  const first = map.rooms[0];
  const last = map.rooms[map.rooms.length - 1];
  const spot = (room) => {
    const pts = room.cells || roomCells(room);
    return r.pick(pts.filter(([x, y]) => getCell(map, x, y) === CELL.FLOOR)) || pts[0];
  };
  const [ex, ey] = spot(first);
  map.features.push({ id: `f-up`, x: ex, y: ey, type: 'stairs-up' });
  if (map.rooms.length > 3 && r() < 0.6) { const [dx, dy] = spot(last); map.features.push({ id: 'f-down', x: dx, y: dy, type: 'stairs-down' }); }
  for (const room of map.rooms) {
    const area = (room.cells ? room.cells.length : room.w * room.h);
    room.size = area <= 16 ? 'small' : area <= 40 ? 'medium' : 'large';
    room.name = '';
  }
  return map;
}

export function roomCells(room) {
  if (room.cells) return room.cells;
  const out = [];
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) out.push([x, y]);
  return out;
}
export function roomAt(map, x, y) {
  return map.rooms.find((q) => (q.cells ? q.cells.some(([cx, cy]) => cx === x && cy === y) : x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h));
}
export function roomLabelPos(room) {
  if (room.label) return room.label;
  return [Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2)];
}

function bfsOrder(map) {
  const n = map.rooms.length;
  const cellRoom = new Map();
  map.rooms.forEach((q, i) => { for (const [x, y] of roomCells(q)) cellRoom.set(`${x},${y}`, i); });
  const dist = new Map();
  const start = roomCells(map.rooms[0])[0];
  const queue = [[start[0], start[1], 0]];
  dist.set(`${start[0]},${start[1]}`, 0);
  const firstSeen = new Map([[0, 0]]);
  while (queue.length) {
    const [x, y, d] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (dist.has(k) || !isOpen(getCell(map, nx, ny))) continue;
      dist.set(k, d + 1);
      const ri = cellRoom.get(k);
      if (ri !== undefined && !firstSeen.has(ri)) firstSeen.set(ri, d + 1);
      queue.push([nx, ny, d + 1]);
    }
  }
  return [...Array(n).keys()].sort((a, b) => (firstSeen.get(a) ?? 1e9) - (firstSeen.get(b) ?? 1e9));
}

// Renumber rooms after manual edits (keeps their order by current number)
export function renumber(rooms) {
  return [...rooms].sort((a, b) => (a.n || 999) - (b.n || 999)).map((q, i) => ({ ...q, n: i + 1 }));
}
