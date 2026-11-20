// Rolling on the random tables (public/data/tables.json) and building room suggestions.
import { rng, newSeed } from './generator.js';
import { parseCR, crLabel } from '../rules/tables.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function indexTables(data) {
  const byId = {};
  for (const t of data?.tables || []) byId[t.id] = t;
  const sites = {};
  for (const t of data?.tables || []) {
    if (!t.site) continue;
    const s = (sites[`${t.site.kind}:${t.site.key}`] = sites[`${t.site.kind}:${t.site.key}`] || { key: t.site.key, kind: t.site.kind, name: t.site.name, summary: t.site.summary });
    s[t.site.part] = t;
  }
  return { byId, sites, data };
}

function dieMax(t) {
  if (t.dice) { const m = String(t.dice).match(/d(\d+)/); if (m) return Number(m[1]); }
  return Math.max(...t.rows.map((r) => (typeof r === 'string' ? 0 : r.max)));
}

// One roll on a table; resolves nested references: {@table-id} (Maze Rats) and [Label](id:path) (Ironsworn)
export function roll(idx, tableOrId, r = rng(newSeed()), depth = 0, forced = null) {
  const t = typeof tableOrId === 'string' ? idx.byId[tableOrId] : tableOrId;
  if (!t || !t.rows?.length) return '';
  let text;
  if (typeof t.rows[0] === 'string') text = t.rows[Math.floor(r() * t.rows.length)];
  else {
    const n = forced ?? (1 + Math.floor(r() * dieMax(t)));
    text = (t.rows.find((row) => n >= row.min && n <= row.max) || t.rows[0]).text;
  }
  return expand(idx, text, r, depth);
}
export function expand(idx, text, r, depth = 0) {
  if (depth > 4) return text;
  let out = String(text).replace(/\{@([\w-]+)\}/g, (all, id) => roll(idx, id, r, depth + 1) || all);
  out = out.replace(/\[([^\]]+)\]\(id:([^)]+)\)/g, (all, label, path) => {
    const id = `is-${slug(path)}`;
    if (!idx.byId[id]) return label;
    const v = roll(idx, id, r, depth + 1);
    return label.endsWith("'s") ? `${v}'s` : v;
  });
  return out;
}

// ------------------------------------------------------------------ dungeon-level ideas (Maze Rats + Delve)
export const OVERVIEW_FIELDS = [
  ['entrance', 'Entrada', 'mr-dungeonentrances'],
  ['form', 'Forma original', 'mr-dungeonforms'],
  ['layout', 'Disposição', 'mr-dungeonlayouts'],
  ['ruination', 'O que a arruinou', 'mr-dungeonruinations'],
  ['activity', 'O que acontece lá agora', 'mr-dungeonactivities'],
  ['reward', 'Recompensa principal', 'mr-dungeonrewards'],
];
export function siteName(idx, dungeon, r) {
  const place = dungeon.domain ? `is-delve-oracles-site-name-place-${dungeon.domain.replace(/_/g, '-')}` : null;
  if (place && idx.byId[place]) {
    const fmt = idx.byId['is-delve-oracles-site-name-format'];
    if (fmt) {
      const pick = fmt.rows[Math.floor(r() * fmt.rows.length)].text;
      return expand(idx, pick.replace(/\(id:delve\/oracles\/site_name\/place\)/g, `(id:delve/oracles/site_name/place/${dungeon.domain})`), r);
    }
  }
  return roll(idx, 'is-delve-oracles-site-name-format', r);
}

// ------------------------------------------------------------------ room suggestions
// Ironsworn: Delve procedure: feature 1–20 theme / 21–100 domain; danger 1–30 theme / 31–45 domain / 46+ general
function siteRoll(idx, dungeon, part, r) {
  const theme = idx.sites[`theme:${dungeon.theme}`];
  const domain = idx.sites[`domain:${dungeon.domain}`];
  const n = 1 + Math.floor(r() * 100);
  if (part === 'features') {
    const t = n <= 20 ? theme?.features : domain?.features;
    return t ? roll(idx, t, r, 0, n) : roll(idx, 'mr-dungeonrooms', r);
  }
  const t = n <= 30 ? theme?.dangers : n <= 45 ? domain?.dangers : null;
  if (t) return roll(idx, t, r, 0, n);
  return roll(idx, 'is-delve-oracles-moves-reveal-a-danger', r, 0, Math.max(46, n));
}

const UNDERGROUND = /underground|ruins|any|dungeon|urban|cave/i;
export function creaturePool(dungeon, monsters, library) {
  const sys = dungeon.system || 'ffd20';
  const lib = (library || []).filter((e) => (e.system || 'ffd20') === sys && e.mode !== 'dungeon').map((e) => ({ name: e.name, cr: e._cr, type: e._type || '', env: e.environment || '', mine: true, id: e.id }));
  const official = (monsters || []).filter((m) => m.system === sys).map((m) => ({ ...m, cr: parseCR(m.cr) }));
  return { lib, official };
}
export function pickCreatures(pool, partyLevel, r, { prefer = 'mine', terrain = '' } = {}) {
  const target = Math.max(0.25, Number(partyLevel) || 1);
  const band = (c) => c.cr !== null && c.cr !== undefined && c.cr >= target - 2 && c.cr <= target + 1;
  const terrainOk = (c) => !terrain || !c.env || new RegExp(terrain, 'i').test(c.env) || UNDERGROUND.test(c.env);
  const mine = pool.lib.filter(band);
  const off = pool.official.filter((c) => band(c) && terrainOk(c));
  const src = prefer === 'mine' && mine.length && r() < 0.6 ? mine : off.length ? off : mine;
  if (!src.length) return null;
  const c = src[Math.floor(r() * src.length)];
  // a single creature near the party level, or a few weaker ones (CR −2 each ≈ doubles the count)
  let count = 1;
  if (c.cr <= target - 2) count = r() < 0.5 ? 3 : 4;
  else if (c.cr <= target - 1) count = 2;
  return { name: c.name, cr: crLabel(c.cr), count, url: c.url || '', mine: !!c.mine, entryId: c.id || '', type: c.type || '' };
}

export function pickTrap(traps, partyLevel, r, system) {
  const target = Number(partyLevel) || 1;
  const list = (traps || []).map((t) => ({ ...t, crn: parseCR(t.cr) })).filter((t) => t.crn !== null && Math.abs(t.crn - target) <= 1);
  if (system === 'pf1e' || r() < 0.5) {
    if (list.length) { const t = list[Math.floor(r() * list.length)]; return { text: `${t.name} (CR ${t.cr})`, url: t.url }; }
  }
  return null;
}

export const ROOM_FIELDS = [
  ['feature', 'Característica'], ['detail', 'Detalhe'], ['danger', 'Perigo / evento'],
  ['creatures', 'Criaturas'], ['trap', 'Armadilha'], ['treasure', 'Tesouro'], ['opportunity', 'Oportunidade'],
];
export function suggestField(field, ctx) {
  const { idx, dungeon, r, pool, traps } = ctx;
  switch (field) {
    case 'feature': return { text: siteRoll(idx, dungeon, 'features', r) };
    case 'detail': return { text: `${roll(idx, 'mr-dungeonroomdetails', r)}; ${roll(idx, 'mr-dungeonrooms', r).toLowerCase()}` };
    case 'danger': return { text: siteRoll(idx, dungeon, 'dangers', r) };
    case 'creatures': {
      const c = pickCreatures(pool, dungeon.partyLevel, r, { terrain: dungeon.terrain || '' });
      return c ? { text: `${c.count > 1 ? `${c.count}× ` : ''}${c.name} (CR ${c.cr})`, url: c.url, entryId: c.entryId, mine: c.mine } : { text: '' };
    }
    case 'trap': {
      const t = pickTrap(traps, dungeon.partyLevel, r, dungeon.system);
      if (t) return t;
      return { text: `${roll(idx, 'mr-dungeontrapeffects', r)}, ativada por ${roll(idx, 'mr-dungeontraptriggers', r).toLowerCase()}` };
    }
    case 'treasure': return { text: `${roll(idx, 'mr-treasuretraits', r)} ${roll(idx, 'mr-treasureitems', r).toLowerCase()} (${roll(idx, 'mr-valuablematerials', r).toLowerCase()})` };
    case 'opportunity': return { text: roll(idx, 'is-delve-oracles-moves-find-an-opportunity', r) };
    default: return { text: '' };
  }
}

// What each room tends to contain (rough Delve/OSR-style mix): not every room has everything
export function stockRoom(ctx, room) {
  const { r } = ctx;
  const content = { feature: suggestField('feature', ctx), detail: suggestField('detail', ctx) };
  const k = r();
  if (k < 0.4) content.creatures = suggestField('creatures', ctx);
  else if (k < 0.55) content.trap = suggestField('trap', ctx);
  else if (k < 0.75) content.danger = suggestField('danger', ctx);
  if (r() < (content.creatures ? 0.45 : 0.2)) content.treasure = suggestField('treasure', ctx);
  if (r() < 0.15) content.opportunity = suggestField('opportunity', ctx);
  return { ...room, content };
}
