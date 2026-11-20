// Automatic NPC build: fills abilities, skills, feats, spells and equipment from the race, the classes and a
// combat role, following the FFd20 "Creating NPCs" guidelines (ability arrays, NPC gear by level) and PF1e rules.
// Everything it writes stays editable; each part can be rebuilt on its own.
import { compute, newAttack } from './engine.js';
import { NPC_ARRAYS, npcGear, PC_WEALTH, mod, scaleDiceForSize } from './tables.js';
import { WEAPONS } from './presets.js';
import { ARMORS, SHIELDS, classicItems, makeItem } from './equipment.js';
import { featKey } from './featEffects.js';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ROLES = {
  melee: { label: 'Combatente (arma de duas mãos)', array: 'melee', primary: 'str' },
  shield: { label: 'Defensor (arma e escudo)', array: 'melee', primary: 'str' },
  finesse: { label: 'Esgrimista (Destreza)', array: 'ranged', primary: 'dex' },
  ranged: { label: 'Atirador (à distância)', array: 'ranged', primary: 'dex' },
  skill: { label: 'Especialista (perícias, furtivo)', array: 'skill', primary: 'dex' },
  unarmed: { label: 'Lutador desarmado', array: 'melee', primary: 'str' },
  int: { label: 'Conjurador (Int)', array: 'int', primary: 'int' },
  wis: { label: 'Conjurador (Sab)', array: 'wis', primary: 'wis' },
  cha: { label: 'Conjurador (Car)', array: 'cha', primary: 'cha' },
};
export const PARTS = [['abilities', 'Atributos'], ['skills', 'Perícias'], ['feats', 'Feats'], ['spells', 'Magias'], ['equipment', 'Equipamento']];

// ------------------------------------------------------------------ role detection
const bare = (id) => String(id || '').replace(/^pf-/, '').replace(/-unchained$/, '');
const ROLE_BY_CLASS = {
  fencer: 'finesse', swashbuckler: 'finesse', dancer: 'finesse',
  archer: 'ranged', gunner: 'ranged', gunslinger: 'ranged', ranger: 'ranged', hunter: 'ranged', engineer: 'ranged', chemist: 'ranged', alchemist: 'ranged',
  thief: 'skill', rogue: 'skill', ninja: 'skill', investigator: 'skill', gambler: 'skill', vigilante: 'skill', expert: 'skill', aristocrat: 'cha', influencer: 'cha', messenger: 'skill', malefactor: 'skill', 'studious-meister': 'int',
  knight: 'shield', paladin: 'shield', crownsguard: 'shield', 'knight-gallant': 'shield', watchman: 'shield', 'security-guard': 'shield', cavalier: 'shield', antipaladin: 'melee', warpriest: 'shield',
  monk: 'unarmed', 'black-belt': 'unarmed', 'martial-arts-student': 'unarmed', brawler: 'unarmed',
  magus: 'melee', inquisitor: 'melee', bloodrager: 'melee', 'dark-knight': 'melee', dragonmaster: 'melee', 'vampire-hunter': 'melee', 'mage-warrior': 'melee', kingsglaive: 'melee', 'void-knight': 'melee',
  commonfolk: 'melee', commoner: 'melee', warrior: 'melee', adept: 'wis', 'lil-witch': 'int',
};
export function mainClass(c) {
  return [...(c.classes || [])].sort((a, b) => b.level - a.level)[0] || null;
}
export function detectRole(c) {
  const m = mainClass(c);
  if (!m) return 'melee';
  const id = bare(m.def.id);
  if (ROLE_BY_CLASS[id]) return ROLE_BY_CLASS[id];
  if (m.def.caster && m.def.castingAbility && m.def.babProgression !== 'Full') return m.def.castingAbility;
  return 'melee';
}

// ------------------------------------------------------------------ seeded random
function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return r;
}

// ------------------------------------------------------------------ abilities
export function buildAbilities(def, c, role) {
  const R = ROLES[role] || ROLES.melee;
  const heroic = c.classes.length ? c.classes.some((x) => x.def.kind !== 'basic') : true;
  const arr = NPC_ARRAYS[R.array][heroic ? 'heroic' : 'basic'];
  const abilities = Object.fromEntries(ABIL.map((a, i) => [a, arr[i]]));
  if (role === 'finesse' || role === 'skill') { // Dex first, Str moderate
    abilities.str = arr[0] > arr[1] ? arr[1] : arr[0];
    abilities.dex = Math.max(arr[0], arr[1]);
  }
  // ability increase every 4 levels goes to the main ability (kept in "Ajuste")
  const inc = Math.floor((c.hd || 0) / 4);
  const abilityAdjust = { ...(def.abilityAdjust || {}), [R.primary]: inc };
  const patch = { abilities, abilityAdjust };
  if (c.race?.flexibleBonus) patch.raceBonus = R.primary;
  return patch;
}

// ------------------------------------------------------------------ skills
const SKILL_PRIORITY = {
  melee: ['Perception', 'Intimidate', 'Climb', 'Acrobatics', 'Survival', 'Swim', 'Sense Motive', 'Ride', 'Handle Animal'],
  shield: ['Perception', 'Sense Motive', 'Diplomacy', 'Intimidate', 'Ride', 'Climb', 'Knowledge (nobility)', 'Handle Animal', 'Heal'],
  unarmed: ['Perception', 'Acrobatics', 'Sense Motive', 'Climb', 'Stealth', 'Escape Artist', 'Swim', 'Intimidate'],
  finesse: ['Acrobatics', 'Perception', 'Bluff', 'Sense Motive', 'Climb', 'Escape Artist', 'Intimidate', 'Diplomacy', 'Sleight of Hand'],
  ranged: ['Perception', 'Stealth', 'Survival', 'Acrobatics', 'Climb', 'Knowledge (nature)', 'Handle Animal', 'Swim', 'Heal'],
  skill: ['Perception', 'Stealth', 'Disable Device', 'Acrobatics', 'Sleight of Hand', 'Bluff', 'Escape Artist', 'Sense Motive', 'Use Magic Device', 'Diplomacy', 'Climb', 'Disguise', 'Knowledge (local)'],
  int: ['Spellcraft', 'Knowledge (arcana)', 'Perception', 'Knowledge (planes)', 'Knowledge (dungeoneering)', 'Knowledge (history)', 'Linguistics', 'Appraise', 'Knowledge (technology)'],
  wis: ['Heal', 'Spellcraft', 'Perception', 'Knowledge (religion)', 'Sense Motive', 'Knowledge (nature)', 'Diplomacy', 'Survival', 'Knowledge (planes)'],
  cha: ['Spellcraft', 'Bluff', 'Diplomacy', 'Perception', 'Intimidate', 'Knowledge (arcana)', 'Use Magic Device', 'Sense Motive', 'Perform (sing)'],
};
export function buildSkills(def, c, role) {
  const avail = Math.max(0, c.skillPoints.available);
  const cap = c.hd || 1;
  const classSkills = c.skills.filter((s) => s.classSkill && !/^(Craft|Profession|Perform)$/.test(s.name)).map((s) => s.name);
  const order = [...(SKILL_PRIORITY[role] || SKILL_PRIORITY.melee).filter((n) => classSkills.includes(n)),
    ...classSkills.filter((n) => !(SKILL_PRIORITY[role] || []).includes(n)),
    'Perception', 'Sense Motive', 'Acrobatics', 'Stealth'];
  const skills = {};
  let left = avail;
  for (const n of [...new Set(order)]) {
    if (left <= 0) break;
    const r = Math.min(cap, left);
    skills[n] = r;
    left -= r;
  }
  return { skills };
}

// ------------------------------------------------------------------ feats
// prerequisites are kept here so the build works even for feats missing from the feat index
const FEAT_RULES = {
  'Power Attack': { str: 13, bab: 1 }, 'Furious Focus': { str: 13, bab: 1, feats: ['Power Attack'] },
  Cleave: { str: 13, bab: 1, feats: ['Power Attack'] }, 'Great Cleave': { str: 13, bab: 4, feats: ['Cleave'] },
  'Weapon Focus': { bab: 1, param: 'weapon' }, 'Weapon Specialization': { bab: 4, fighter: 4, feats: ['Weapon Focus'], param: 'weapon' },
  'Greater Weapon Focus': { bab: 8, fighter: 8, feats: ['Weapon Focus'], param: 'weapon' },
  'Improved Critical': { bab: 8, param: 'weapon' }, 'Vital Strike': { bab: 6 }, 'Improved Vital Strike': { bab: 11, feats: ['Vital Strike'] },
  Lunge: { bab: 6 }, 'Combat Reflexes': {}, 'Improved Initiative': {}, Toughness: {}, 'Iron Will': {}, 'Lightning Reflexes': {}, 'Great Fortitude': {},
  'Shield Focus': { bab: 1 }, 'Point-Blank Shot': {}, 'Precise Shot': { feats: ['Point-Blank Shot'] }, 'Rapid Shot': { dex: 13, feats: ['Point-Blank Shot'] },
  'Deadly Aim': { dex: 13, bab: 1 }, Manyshot: { dex: 17, bab: 6, feats: ['Rapid Shot'] }, 'Clustered Shots': { bab: 6, feats: ['Point-Blank Shot'] },
  'Improved Precise Shot': { dex: 19, bab: 11, feats: ['Precise Shot'] }, 'Weapon Finesse': {}, Dodge: { dex: 13 }, Mobility: { dex: 13, feats: ['Dodge'] },
  'Spring Attack': { dex: 13, bab: 4, feats: ['Mobility'] }, 'Combat Expertise': { int: 13 }, 'Skill Focus': { param: 'skill' }, Alertness: {}, Stealthy: {},
  Deceitful: {}, Persuasive: {}, 'Spell Focus': { caster: 1, param: 'school' }, 'Combat Casting': { caster: 1 }, 'Spell Penetration': { caster: 1 },
  'Greater Spell Focus': { caster: 1, feats: ['Spell Focus'], param: 'school' }, 'Greater Spell Penetration': { caster: 1, feats: ['Spell Penetration'] },
  'Extra MP': { caster: 1, ff: true }, 'Elemental Focus': { caster: 1, ff: true, param: 'element' }, 'Greater Elemental Focus': { caster: 1, ff: true, cl: 8, feats: ['Elemental Focus'], param: 'element' },
  'Elemental Penetration': { caster: 1, ff: true, param: 'element' },
  'Improved Unarmed Strike': {}, 'Stunning Fist': { dex: 13, wis: 13, bab: 8, feats: ['Improved Unarmed Strike'] }, 'Weapon Focus (unarmed)': {},
  'Two-Weapon Fighting': { dex: 15 },
};
const FEAT_PRIORITY = {
  melee: ['Power Attack', 'Weapon Focus', 'Improved Initiative', 'Furious Focus', 'Cleave', 'Toughness', 'Weapon Specialization', 'Iron Will', 'Vital Strike', 'Great Cleave', 'Improved Critical', 'Lunge', 'Greater Weapon Focus', 'Combat Reflexes', 'Great Fortitude', 'Lightning Reflexes', 'Improved Vital Strike'],
  shield: ['Power Attack', 'Shield Focus', 'Weapon Focus', 'Improved Initiative', 'Toughness', 'Iron Will', 'Weapon Specialization', 'Cleave', 'Vital Strike', 'Improved Critical', 'Combat Reflexes', 'Great Fortitude', 'Greater Weapon Focus', 'Lightning Reflexes'],
  unarmed: ['Improved Unarmed Strike', 'Power Attack', 'Improved Initiative', 'Dodge', 'Weapon Focus', 'Toughness', 'Mobility', 'Iron Will', 'Combat Reflexes', 'Vital Strike', 'Stunning Fist', 'Lightning Reflexes', 'Spring Attack'],
  finesse: ['Weapon Finesse', 'Weapon Focus', 'Dodge', 'Improved Initiative', 'Mobility', 'Toughness', 'Iron Will', 'Spring Attack', 'Improved Critical', 'Combat Reflexes', 'Lightning Reflexes', 'Weapon Specialization', 'Great Fortitude'],
  ranged: ['Point-Blank Shot', 'Precise Shot', 'Rapid Shot', 'Weapon Focus', 'Deadly Aim', 'Improved Initiative', 'Manyshot', 'Clustered Shots', 'Weapon Specialization', 'Improved Critical', 'Toughness', 'Improved Precise Shot', 'Iron Will', 'Lightning Reflexes'],
  skill: ['Weapon Finesse', 'Improved Initiative', 'Skill Focus', 'Dodge', 'Toughness', 'Iron Will', 'Mobility', 'Alertness', 'Combat Reflexes', 'Lightning Reflexes', 'Stealthy', 'Deceitful', 'Great Fortitude'],
  caster: ['Improved Initiative', 'Spell Focus', 'Combat Casting', 'Toughness', 'Spell Penetration', 'Greater Spell Focus', 'Iron Will', 'Greater Spell Penetration', 'Lightning Reflexes', 'Great Fortitude', 'Alertness'],
  ffcaster: ['Improved Initiative', 'Extra MP', 'Elemental Focus', 'Combat Casting', 'Toughness', 'Elemental Penetration', 'Greater Elemental Focus', 'Iron Will', 'Spell Focus', 'Lightning Reflexes', 'Great Fortitude', 'Alertness'],
};
const COMBAT_FEATS = new Set(['Power Attack', 'Furious Focus', 'Cleave', 'Great Cleave', 'Weapon Focus', 'Weapon Specialization', 'Greater Weapon Focus', 'Improved Critical', 'Vital Strike', 'Improved Vital Strike', 'Lunge', 'Combat Reflexes', 'Improved Initiative', 'Shield Focus', 'Point-Blank Shot', 'Precise Shot', 'Rapid Shot', 'Deadly Aim', 'Manyshot', 'Clustered Shots', 'Improved Precise Shot', 'Weapon Finesse', 'Dodge', 'Mobility', 'Spring Attack', 'Combat Expertise', 'Improved Unarmed Strike', 'Stunning Fist', 'Two-Weapon Fighting']);

// bonus feats granted by the class tables ("Bonus feat", "Combat feat"...)
function classBonusFeats(c) {
  let n = 0;
  for (const cl of c.classes) for (const row of cl.def.levels.slice(0, cl.level)) n += (row.special || []).filter((s) => /^bonus (combat )?feat/i.test(s)).length;
  return n;
}

export function buildFeats(def, c, role, ctx = {}) {
  const ff = def.system !== 'pf1e';
  const caster = ['int', 'wis', 'cha'].includes(role);
  const list = FEAT_PRIORITY[caster ? (ff ? 'ffcaster' : 'caster') : role] || FEAT_PRIORITY.melee;
  const weapon = ctx.weapon || (def.attacks || []).find((a) => !a.natural)?.name || (role === 'unarmed' ? 'unarmed strike' : 'longsword');
  const fighterLv = c.classes.filter((x) => /^(pf-)?(fighter|warrior)$/.test(x.def.id)).reduce((s, x) => s + x.level, 0);
  const cl = c.cl || 0;
  const keep = (def.feats || []).filter((f) => f.source === 'custom' || f.source === 'Homebrew');
  const taken = new Set(keep.map((f) => featKey(f.name)));
  const out = [...keep];
  const ok = (name) => {
    const r = FEAT_RULES[name] || {};
    if (taken.has(featKey(name))) return false;
    if (r.ff && !ff) return false;
    for (const a of ABIL) if (r[a] && (c.abilities[a] ?? 0) < r[a]) return false;
    if (r.bab && c.bab < r.bab) return false;
    if (r.fighter && fighterLv < r.fighter) return false;
    if (r.caster && !cl) return false;
    if (r.cl && cl < r.cl) return false;
    if ((r.feats || []).some((f) => !taken.has(featKey(f)))) return false;
    if (name === 'Shield Focus' && !ctx.shield && !def.equipment?.shield) return false;
    return true;
  };
  const param = (name) => {
    const p = (FEAT_RULES[name] || {}).param;
    if (p === 'weapon') return weapon;
    if (p === 'skill') return role === 'skill' ? 'Stealth' : 'Perception';
    if (p === 'school') return ctx.school || (ff ? 'black' : 'evocation');
    if (p === 'element') return ctx.element || (ff ? 'fire' : 'fire');
    return '';
  };
  const pick = (count, bonus, filter) => {
    let added = 0;
    for (let guard = 0; added < count && guard < 4; guard++) { // repeat passes so chains (Dodge → Mobility) unlock
      for (const name of list) {
        if (added >= count) break;
        if (filter && !filter(name)) continue;
        if (!ok(name)) continue;
        out.push({ id: uid(), name, param: param(name), bonus, source: ctx.featSource?.(name) || (ff ? 'FFd20' : 'Pathfinder') });
        taken.add(featKey(name));
        added++;
      }
    }
  };
  const bonusCount = classBonusFeats(c);
  pick(bonusCount, true, (n) => COMBAT_FEATS.has(n));
  pick(Math.max(0, c.featBudget - keep.filter((f) => !f.bonus).length), false);
  const toggles = { ...(def.toggles || {}) };
  for (const f of out) if (/Power Attack|Deadly Aim|Rapid Shot|Furious Focus/i.test(f.name)) toggles[f.id] = true;
  return { feats: out, toggles };
}

// ------------------------------------------------------------------ spells
const SORC_KNOWN = [[4, 2], [5, 2], [5, 3], [6, 3, 1], [6, 4, 2], [7, 4, 2, 1], [7, 5, 3, 2], [8, 5, 3, 2, 1], [8, 5, 4, 3, 2], [9, 5, 4, 3, 2, 1],
  [9, 5, 5, 4, 3, 2], [9, 5, 5, 4, 3, 2, 1], [9, 5, 5, 4, 4, 3, 2], [9, 5, 5, 4, 4, 3, 2, 1], [9, 5, 5, 4, 4, 4, 3, 2], [9, 5, 5, 4, 4, 4, 3, 2, 1],
  [9, 5, 5, 4, 4, 4, 3, 3, 2], [9, 5, 5, 4, 4, 4, 3, 3, 2, 1], [9, 5, 5, 4, 4, 4, 3, 3, 3, 2], [9, 5, 5, 4, 4, 4, 3, 3, 3, 3]];
const BARD_KNOWN = [[4, 2], [5, 3], [6, 4], [6, 4, 2], [6, 4, 3], [6, 4, 4], [6, 5, 4, 2], [6, 5, 4, 3], [6, 5, 4, 4], [6, 5, 5, 4, 2],
  [6, 6, 5, 4, 3], [6, 6, 5, 4, 4], [6, 6, 5, 5, 4, 2], [6, 6, 6, 5, 4, 3], [6, 6, 6, 5, 4, 4], [6, 6, 6, 5, 5, 4, 2], [6, 6, 6, 6, 5, 4, 3],
  [6, 6, 6, 6, 5, 4, 4], [6, 6, 6, 6, 5, 5, 4], [6, 6, 6, 6, 6, 5, 5]];
const USEFUL = /damage|deals?|cure|heal|restor|protect|bonus|haste|slow|paraly|stun|sleep|confus|blind|silence|summon|dispel|fear|charm|hold|barrier|shield|resist|invisib|fly|teleport|raise|revive|poison|drain|weaken|entangle|bless/i;
const SPELL_LIST_OF = { scholar: ['black-mage', 'white-mage'], 'lil-witch': ['black-mage', 'white-mage'], cleric: ['cleric', 'white-mage'] };

function choose(pool, n, r, prefer) {
  // core books first (Core Rulebook, APG, Ultimate Magic/Combat), then spells that do something in a fight
  const BOOK = { PZO1110: 4, PZO1115: 2.5, PZO1117: 2, PZO1118: 1.5 };
  const scored = pool.map((s) => ({ s, w: (BOOK[s.book] || 1) * (USEFUL.test(s.summary || '') ? 3 : 1) * (prefer && prefer.test(`${s.summary} ${s.school}`) ? 2 : 1) * (0.5 + r()) }));
  scored.sort((a, b) => b.w - a.w);
  return scored.slice(0, n).map((x) => x.s);
}

export function buildSpells(def, c, db, seed = 1) {
  const r = rng(seed);
  const ff = def.system !== 'pf1e';
  const spells = [];
  const used = new Set();
  const add = (list, n, tag) => {
    for (const s of list) if (n > 0 && !used.has(s.name)) { used.add(s.name); spells.push({ id: uid(), name: s.name, level: s.level, ...(tag ? { classId: tag } : {}) }); n--; }
  };
  for (const cl of c.classes.filter((x) => x.def.caster)) {
    const id = cl.def.id;
    const lists = ff ? (SPELL_LIST_OF[id] || [id]) : [id];
    const pool = db.spells.filter((s) => lists.includes(s.class));
    if (!pool.length) continue;
    const byLv = (L) => pool.filter((s) => s.level === L);
    const prefer = /white|cleric|medic|druid|astrolog|wis/.test(id) || cl.def.castingAbility === 'wis' ? /cure|heal|restor|protect|bless/i : /damage|deals?/i;
    if (ff) {
      // FFd20: starts with 3 (+ casting mod) 1st-level spells, then 2 per level of spells it can cast
      const feat = (cl.def.features || []).find((f) => f.name === 'Spells')?.text || '';
      const start = Number((feat.match(/begins play with (\d+)/i) || [])[1]) || 3;
      const per = { one: 1, two: 2, three: 3 }[(feat.match(/gains (one|two|three) spells/i) || [])[1]] || 2;
      const am = Math.max(0, mod(c.abilities[cl.def.castingAbility] ?? 10));
      const known = {};
      known[1] = start + am;
      for (let lv = 2; lv <= cl.level; lv++) {
        const maxL = cl.def.levels[lv - 1]?.spellLevel || 1;
        known[maxL] = (known[maxL] || 0) + 1;
        const lower = maxL > 1 ? 1 + Math.floor(r() * (maxL - 1)) : 1;
        known[lower] = (known[lower] || 0) + (per - 1);
      }
      add(choose(byLv(0), 4, r, prefer), 4);
      for (const [L, n] of Object.entries(known)) add(choose(byLv(Number(L)), n, r, prefer), n);
    } else {
      const ps = (c.pfSpells || []).find((p) => p.classId === id);
      if (!ps) continue;
      const table = ps.spontaneous ? (ps.maxSL >= 7 || cl.def.levels.some((x) => x.spellsPerDay?.['7']) ? SORC_KNOWN : cl.def.levels.some((x) => x.spellsPerDay?.['6']) ? BARD_KNOWN : null) : null;
      for (let L = 0; L <= ps.maxSL; L++) {
        let n = table ? (table[Math.min(19, cl.level - 1)][L] || 0) : L === 0 ? 4 : (ps.perDay[L] || 0);
        if (L === 0 && !byLv(0).length) n = 0;
        add(choose(byLv(L), n, r, prefer), n, id);
      }
    }
  }
  return { caster: { ...def.caster, spells } };
}

// ------------------------------------------------------------------ equipment
const CLASS_WEAPON = {
  samurai: 'katana', 'sword-saint': 'katana', dragoon: 'longspear', ninja: 'katana', barbarian: 'greataxe', berserker: 'greataxe',
  cleric: 'mace', warpriest: 'morningstar', 'white-mage': 'quarterstaff', 'black-mage': 'quarterstaff', wizard: 'quarterstaff', sorcerer: 'quarterstaff',
  witch: 'quarterstaff', arcanist: 'quarterstaff', druid: 'scimitar', shaman: 'quarterstaff', oracle: 'spear', bard: 'rapier', skald: 'battleaxe',
  thief: 'short sword', rogue: 'short sword', investigator: 'rapier', commonfolk: 'club', commoner: 'club', adept: 'quarterstaff',
  'dark-knight': 'greatsword', magus: 'scimitar', 'red-mage': 'rapier', 'blue-mage': 'longsword', summoner: 'spear', inquisitor: 'longbow',
};
const ROLE_WEAPON = { melee: 'greatsword', shield: 'longsword', finesse: 'rapier', ranged: 'longbow', skill: 'short sword', unarmed: 'unarmed strike', int: 'quarterstaff', wis: 'mace', cha: 'dagger' };
const MONK_DICE = ['1d6', '1d6', '1d6', '1d8', '1d8', '1d8', '1d8', '1d10', '1d10', '1d10', '1d10', '2d6', '2d6', '2d6', '2d6', '2d8', '2d8', '2d8', '2d8', '2d10'];

export function armorAllowed(c) {
  let best = 'none';
  const rank = { none: 0, light: 1, medium: 2, heavy: 3 };
  for (const cl of c.classes) {
    const t = ((cl.def.features || []).find((f) => /proficien/i.test(f.name))?.text || '').toLowerCase();
    let a = 'none';
    if (/not (proficient )?with any (type of |kind of )?armor/.test(t)) a = 'none';
    else if (/heavy armor|all armor|armor \([^)]*heavy/.test(t)) a = 'heavy';
    else if (/medium armor|armor \([^)]*medium/.test(t)) a = 'medium';
    else if (/light armor|armor \(light/.test(t)) a = 'light';
    else if (!t && cl.def.babProgression === 'Full') a = 'medium';
    if (rank[a] > rank[best]) best = a;
  }
  return best;
}
const shieldAllowed = (c) => c.classes.some((cl) => /shields/i.test((cl.def.features || []).find((f) => /proficien/i.test(f.name))?.text || '') && !/not proficient with shields|except (tower )?shields/i.test((cl.def.features || []).find((f) => /proficien/i.test(f.name))?.text || ''));

function bestEnh(budget, perPoint, base) { // largest +N with base + 300/150 + perPoint·N² ≤ budget
  let n = 0;
  while (n < 5 && base + perPoint.mw + perPoint.k * (n + 1) * (n + 1) <= budget) n++;
  return n;
}

export function buildEquipment(def, c, db, role) {
  const lvl = c.hd || 1;
  const heroic = c.classes.some((x) => x.def.kind !== 'basic');
  const g = def.pcWealth ? (() => { const t = PC_WEALTH[Math.min(20, lvl)] || 0; return { total: t, weapons: t * 0.3, protection: t * 0.3, magic: t * 0.3, limited: t * 0.07, gear: t * 0.03 }; })() : npcGear(lvl, heroic);
  if (!g) return {};
  const m = mainClass(c);
  const id = bare(m?.def.id);
  const caster = ['int', 'wis', 'cha'].includes(role);
  // ---- weapon
  const wName = CLASS_WEAPON[id] && !(role === 'shield' && /great|longspear|quarterstaff/.test(CLASS_WEAPON[id])) ? CLASS_WEAPON[id] : ROLE_WEAPON[role] || 'longsword';
  const keepNatural = (def.attacks || []).filter((a) => a.natural);
  const attacks = [...keepNatural];
  let weaponLeft = g.weapons;
  if (wName === 'unarmed strike') {
    const monkLv = c.classes.filter((x) => /monk|black-belt|martial-arts/.test(x.def.id)).reduce((s, x) => s + x.level, 0) || lvl;
    attacks.push({ ...newAttack('melee', false), name: 'unarmed strike', dice: scaleDiceForSize(MONK_DICE[Math.min(20, monkLv) - 1], 'Medium', def.size), critRange: 20, critMult: 2, notGear: true, basePrice: 0 });
  } else {
    const p = WEAPONS.find((w) => w.name === wName) || WEAPONS.find((w) => w.name === 'longsword');
    const a = { ...newAttack(p.kind || 'melee', false), name: p.name, kind: p.kind || 'melee', dice: scaleDiceForSize(p.dice, 'Medium', def.size), critRange: p.critRange, critMult: p.critMult,
      hands: p.hands || 'one', light: !!p.light, finesse: !!p.finesse || role === 'finesse' || role === 'skill', thrown: !!p.thrown, range: p.range || '', basePrice: p.price || 0 };
    const enh = bestEnh(weaponLeft, { mw: 300, k: 2000 }, 0);
    if (enh) { a.enhancement = enh; weaponLeft -= 300 + 2000 * enh * enh; } else if (weaponLeft >= 300) { a.masterwork = true; weaponLeft -= 300; }
    attacks.push(a);
    // a backup weapon for melee/ranged roles
    if (!caster && role !== 'ranged' && weaponLeft >= 0) attacks.push({ ...newAttack('ranged', false), name: 'javelin', kind: 'ranged', dice: scaleDiceForSize('1d6', 'Medium', def.size), critRange: 20, critMult: 2, thrown: true, range: '30 ft.' });
    if (role === 'ranged' && !/bow|crossbow|sling/.test(p.name)) attacks.push({ ...newAttack('ranged', false), name: 'light crossbow', kind: 'ranged', dice: scaleDiceForSize('1d8', 'Medium', def.size), critRange: 19, critMult: 2, range: '80 ft.' });
    if (role === 'ranged') attacks.push({ ...newAttack('melee', false), name: 'short sword', dice: scaleDiceForSize('1d6', 'Medium', def.size), critRange: 19, critMult: 2, light: true });
  }
  // ---- armor and shield
  const allowed = caster && armorAllowed(c) === 'none' ? 'none' : armorAllowed(c);
  const dexy = ['finesse', 'skill', 'ranged', 'unarmed'].includes(role);
  let prot = g.protection;
  let armor = null;
  let shield = null;
  const typeOk = { none: [], light: ['light'], medium: ['light', 'medium'], heavy: ['light', 'medium', 'heavy'] }[allowed];
  const candidates = ARMORS.filter((x) => typeOk.includes(x.type) && x.price <= prot && (!dexy || x.type === 'light') && !(role === 'unarmed'));
  if (candidates.length) {
    const best = candidates.sort((a, b) => (b.bonus - a.bonus) || (b.maxDex - a.maxDex) || (a.price - b.price))[0];
    armor = { name: best.name, bonus: best.bonus, maxDex: best.maxDex, acp: best.acp, price: best.price, enh: 0, masterwork: false, specials: [] };
    prot -= best.price;
  }
  if (role === 'shield' && shieldAllowed(c)) {
    const sh = SHIELDS.filter((x) => x.name !== 'tower shield' && x.price <= prot).sort((a, b) => b.bonus - a.bonus || b.price - a.price)[0];
    if (sh) { shield = { name: sh.name, bonus: sh.bonus, maxDex: sh.maxDex, acp: sh.acp, price: sh.price, enh: 0, masterwork: false, specials: [] }; prot -= sh.price; }
  }
  for (const it of [armor, shield].filter(Boolean)) {
    const share = it === armor && shield ? prot * 0.65 : prot;
    const n = bestEnh(share, { mw: 150, k: 1000 }, 0);
    if (n) { it.enh = n; prot -= 150 + 1000 * n * n; } else if (prot >= 150) { it.masterwork = true; prot -= 150; }
  }
  // ---- magic items: round-robin upgrades (main ability item, cloak, ring, amulet, bracers for unarmored)
  const R = ROLES[role] || ROLES.melee;
  const classic = classicItems();
  const statItem = { str: 'Belt of Giant Strength', dex: 'Belt of Incredible Dexterity', con: 'Belt of Mighty Constitution', int: 'Headband of Vast Intelligence', wis: 'Headband of Inspired Wisdom', cha: 'Headband of Alluring Charisma' }[R.primary];
  const lines = [statItem, 'Cloak of Resistance', 'Ring of Protection', ...(armor ? [] : ['Bracers of Armor']), 'Amulet of Natural Armor'];
  let money = g.magic + Math.max(0, prot) + Math.max(0, weaponLeft);
  const tier = {};
  const priceOf = (line, b) => classic.find((x) => x.name === `${line} +${b}`);
  for (let changed = true; changed;) {
    changed = false;
    for (const line of lines) {
      const cur = tier[line] || 0;
      const next = line === statItem ? (cur ? cur + 2 : 2) : cur + 1;
      const it = priceOf(line, next);
      const old = cur ? priceOf(line, cur).price : 0;
      if (it && it.price - old <= money) { money -= it.price - old; tier[line] = next; changed = true; }
    }
  }
  const slots = { ...(def.equipment?.slots || {}) };
  for (const k of ['belt', 'headband', 'shoulders', 'ring1', 'neck', 'wrists']) delete slots[k];
  for (const [line, b] of Object.entries(tier)) {
    const it = priceOf(line, b);
    const slot = it.slot === 'ring' ? 'ring1' : it.slot;
    slots[slot] = makeItem(it, slot);
  }
  // ---- consumables (limited use): healing potions
  const consumables = [];
  const ff = def.system !== 'pf1e';
  if (ff) {
    const pots = (db.items?.consumables || []).filter((x) => /^(Cure Potion|Potion|Hi-Potion|X-Potion|Ether)$/i.test(x.name)).sort((a, b) => b.price - a.price);
    let lim = g.limited;
    for (const p of pots) { const q = Math.min(3, Math.floor(lim / p.price)); if (q > 0) { consumables.push({ id: uid(), name: p.name, qty: q, price: p.price, text: p.text }); lim -= q * p.price; } }
  } else {
    const q = Math.min(4, Math.floor(g.limited / 300));
    if (q) consumables.push({ id: uid(), name: lvl >= 7 && g.limited >= 750 ? 'potion of cure moderate wounds' : 'potion of cure light wounds', qty: lvl >= 7 && g.limited >= 750 ? Math.min(3, Math.floor(g.limited / 300 / 2.5)) : q, price: lvl >= 7 && g.limited >= 750 ? 300 : 50, text: '' });
  }
  const equipment = { ...(def.equipment || {}), armor, shield, slots, consumables, gil: Math.max(0, Math.floor(money + (g.gear || 0) * 0.5)) };
  return { attacks, equipment };
}

// ------------------------------------------------------------------ everything
export function autoBuild(def, db, { role, parts = PARTS.map((p) => p[0]), seed = Date.now() } = {}) {
  let d = { ...def };
  const calc = () => compute(d, db);
  let c = calc();
  const R = role || detectRole(c);
  const want = new Set(parts);
  if (want.has('abilities')) { d = { ...d, ...buildAbilities(d, c, R) }; c = calc(); }
  let ctx = {};
  if (want.has('equipment')) { d = { ...d, ...buildEquipment(d, c, db, R) }; c = calc(); }
  if (want.has('spells')) { d = { ...d, ...buildSpells(d, c, db, seed) }; c = calc(); }
  if (want.has('skills')) { d = { ...d, ...buildSkills(d, c, R) }; c = calc(); }
  if (want.has('feats')) {
    const featNames = new Map((db.feats || []).map((f) => [featKey(f.name), f]));
    ctx = { shield: !!d.equipment?.shield, featSource: (n) => featNames.get(featKey(n))?.source };
    d = { ...d, ...buildFeats(d, c, R, ctx) };
    c = calc();
    // feats can raise skill points (none of ours do) or Int-based totals; skills stay valid
  }
  return { def: d, role: R };
}
