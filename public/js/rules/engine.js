// FFd20 creature engine: turns a creature definition (what the user edits) into fully
// computed statistics (what the stat block shows). Pure functions, no DOM.
import {
  ABILITIES, mod, sign, SIZE_DATA, SIZES, babFor, goodSave, poorSave, bonusMP, creatureMP,
  limitBreakUses, burstUses, burstDuration, xpForCR, crLabel, stepDice, avgDice, BOSS_IMMUNITIES, CASTER_ABBR, suggestedHD, statsForCR, scaleDiceForSize,
} from './tables.js';
import { TYPE_BY_ID, SUBTYPE_BY_ID, ELEMENTS, AFFINITY_RANK, PF_ENERGIES, FF_TO_PF, PF_TYPE_OVERRIDES, PF_SUBTYPE_OVERRIDES } from './types.js';
import { SKILLS, isClassSkill } from './skills.js';
import { featEffect, featKey, effectFromText } from './featEffects.js';
import { emptyEquipment, weaponSpecialRider, gearSummary, SLOTS, ARMORS, WEAPON_MATERIALS, ARMOR_MATERIALS, specialsFor } from './equipment.js';
import { raceTraitEffects } from './raceEffects.js';
import { activeHouseRules, goneFeat, COMBAT_OPTIONS } from './houseRules.js';
import { applyClassEffects, classBonusFeatSlots, grantedFeats, archetypeClassSkills, effectKey, weaponGroup } from './classEffects.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ------------------------------------------------------------------ data model
export function newCreature(mode = 'monster', system = 'ffd20') {
  const npc = mode === 'npc';
  const pf = system === 'pf1e';
  return {
    id: uid(), mode, system, name: npc ? 'Novo NPC' : 'Nova Criatura', folderId: null,
    image: { src: '', kind: '' }, flavor: '', description: '', tags: [],
    cr: npc ? null : 1, crOverride: null, mythic: 0,
    alignment: 'N', size: 'Medium', type: npc ? 'humanoid' : 'magical-beast', subtypes: npc ? [] : [],
    raceId: npc ? (pf ? 'pf-human' : 'hume') : '', raceBonus: 'str',
    racialHD: npc ? 0 : 2, autoHD: !npc, autoNaturalArmor: !npc, hdDie: null, goodSaves: null, swarmExtra: '',
    classes: npc ? [{ id: uid(), classId: pf ? 'pf-fighter' : 'warrior', level: 1 }] : [], favored: 'hp',
    abilities: npc ? { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 } : { str: 14, dex: 12, con: 12, int: 4, wis: 10, cha: 8 },
    abilityAdjust: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    abilityNone: { con: null, int: null },
    boss: 'none', bossHPMult: 2, bossD12: true, burst: [], phases: '',
    hpBonus: 0,
    naturalArmor: 0, armor: [],
    speed: { land: 30, fly: 0, flyMan: 'average', swim: 0, climb: 0, burrow: 0, other: '' },
    senses: [], sensesRemoved: [], aura: '',
    attacks: [], spaceOverride: '', reachOverride: '', reachNotes: '',
    feats: [], toggles: {},
    skills: {}, skillMisc: {}, racialSkillMods: '',
    languages: npc ? 'Common' : '', sqText: '', gear: '', combatGear: '',
    environment: '', organization: npc ? 'solitary' : '', treasure: npc ? 'NPC gear' : 'standard',
    elementOverrides: {}, elementResist: {},
    immunities: [], immunitiesRemoved: [],
    dr: '', sr: null, srAuto: false, fastHealing: '', regeneration: '', defensiveText: '', weaknessesText: '',
    caster: { tier: 'none', ability: 'int', mpBonus: 0, cl: null, spells: [], sla: [], slaCL: null, listName: '', pfClass: '', pfLevel: 0 },
    classFeatures: {}, limitBreaksEnabled: false, pcWealth: false,
    abilitiesList: [], modifiers: [], equipment: emptyEquipment(), talents: [],
    legendary: { enabled: false, perRound: 3, intro: '', actions: [] },
    lair: { enabled: false, initiative: 20, intro: '', actions: [] },
    tactics: { before: '', during: '', morale: '' },
    statusInflicts: '',
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export function newAttack(kind = 'melee', natural = false) {
  return {
    id: uid(), name: natural ? 'claw' : 'longsword', plural: '', kind, natural, count: natural ? 2 : 1,
    dice: natural ? '1d6' : '1d8', critRange: natural ? 20 : 19, critMult: 2, hands: 'one', light: false, finesse: false,
    primary: true, enhancement: 0, attackBonus: 0, damageBonus: 0, dmgAbility: 'auto', touch: false,
    extra: '', group: 1, iterative: !natural, thrown: false, range: '', masterwork: false, specials: [], basePrice: 0, notGear: natural,
  };
}

// ------------------------------------------------------------------ modifier stacking
const STACKING = new Set(['untyped', 'dodge', 'circumstance', 'racial-stack', 'penalty']);
function resolveMods(list) {
  const byType = {};
  let total = 0;
  for (const m of list) {
    if (m.cond) continue;
    const t = m.type || 'untyped';
    if (STACKING.has(t) || m.value < 0) { total += m.value; continue; }
    byType[t] = Math.max(byType[t] ?? -Infinity, m.value);
  }
  for (const v of Object.values(byType)) total += v;
  return total;
}

// Replace {placeholders} in ability text
export function fillTemplate(text, c) {
  if (!text) return '';
  return String(text).replace(/\{(\w+)\}/g, (all, k) => (c.tpl && c.tpl[k] !== undefined ? c.tpl[k] : all));
}

// ------------------------------------------------------------------ compute
export function compute(def, db) {
  const d = def;
  const classesDB = db.classesById || {};
  const hb = db.homebrew || {};
  const out = { warnings: [], notes: [] };
  const npc = d.mode === 'npc';
  const race = npc && d.raceId ? ((db.racesById || {})[d.raceId] || (hb.races || []).find((r) => r.id === d.raceId) || null) : null;
  out.race = race;

  // ---- game system: FFd20 (default) or Pathfinder 1e
  const pf = d.system === 'pf1e';
  out.system = pf ? 'pf1e' : 'ffd20';
  const EL = pf ? PF_ENERGIES : ELEMENTS;
  // element keys from FFd20 sources (subtypes, items) used in a Pathfinder creature become PF energies
  const elKey = (el) => (pf ? (PF_ENERGIES.includes(el) ? el : FF_TO_PF[el]) : el);
  const affOf = (v) => (pf ? ({ absorb: 'immune', strong: 'resist' }[v] || v) : v);

  // ---- type & subtypes
  let type = TYPE_BY_ID[d.type] || (hb.types || []).find((t) => t.id === d.type) || TYPE_BY_ID.humanoid;
  if (pf && PF_TYPE_OVERRIDES[type.id]) {
    const o = PF_TYPE_OVERRIDES[type.id];
    type = { ...type, ...o, flags: o.flags ? { ...o.flags, noCon: type.flags?.noCon, constructHP: type.flags?.constructHP } : type.flags };
  }
  out.type = type;
  const subtypeDefs = (d.subtypes || []).map((sid) => {
    const base = SUBTYPE_BY_ID[sid] || (hb.subtypes || []).find((s) => s.id === sid) || (db.pfSubtypesById || {})[sid] || { id: sid, name: sid, custom: true };
    return pf && PF_SUBTYPE_OVERRIDES[sid] ? { ...base, ...PF_SUBTYPE_OVERRIDES[sid] } : base;
  });
  if (race) for (const rs of race.subtypes || []) if (!d.subtypes.includes(rs) && !subtypeDefs.find((x) => x.id === rs)) subtypeDefs.unshift(SUBTYPE_BY_ID[rs] || { id: rs, name: rs });
  out.subtypes = subtypeDefs;
  // homebrew races carry subtype-like traits (elements, immunities, senses, modifiers, abilities)
  const traitSources = race && race.homebrew ? [...subtypeDefs, { ...race, name: race.name }] : subtypeDefs;
  const flags = { ...(type.flags || {}) };
  for (const s of subtypeDefs) Object.assign(flags, s.flags || {});
  const boss = pf ? 'none' : (d.boss || 'none'); // boss tiers / Burst Mode are FFd20 rules
  const isBossTier = boss === 'boss' || boss === 'super';
  out.boss = boss;

  // ---- size
  const size = d.size || 'Medium';
  const sz = SIZE_DATA[size] || SIZE_DATA.Medium;

  // ---- modifiers pool
  const mods = [];
  const addMod = (m) => mods.push(m);
  for (const m of d.modifiers || []) if (m.enabled !== false && m.target) addMod({ ...m, value: Number(m.value) || 0, source: m.note || 'custom' });
  for (const s of traitSources) for (const m of s.mods || []) addMod({ ...m, value: Number(m.value) || 0, source: s.name });
  // racial traits from the race pages (skills, saves, AC, immunities); homebrew races use their own modifiers
  const raceFx = race && !race.homebrew ? raceTraitEffects(race) : { mods: [], immune: [] };
  for (const m of raceFx.mods) addMod(m);
  out.raceEffects = raceFx;
  // ---- equipment (body slots + slotless): modifiers, immunities, granted feats, weapon riders
  const eq = d.equipment || emptyEquipment();
  const wornItems = [...SLOTS.map(([k]) => eq.slots?.[k]), ...(eq.slots ? [] : []), ...(eq.slotless || [])].filter((x) => x && x.name && x.active !== false);
  out.wornItems = wornItems;
  for (const it of wornItems) {
    for (const m of it.mods || []) if (m.target) addMod({ ...m, value: Number(m.value) || 0, cond: m.cond || '', source: it.name, type: m.type === 'armor-item' ? 'armor-item' : m.type });
  }
  // magic weapon/armor special abilities of this system (flaming, keen, shadow, spell resistance…)
  const { weapon: wSpecials, armor: aSpecials } = specialsFor(d.system, db.items || {});
  const armorSpecialFx = { sr: 0, dr: [], resist: [] };
  for (const it of [eq.armor, eq.shield].filter((x) => x?.name)) {
    for (const n of it.specials || []) {
      const s = aSpecials.find((x) => x.name === n);
      if (!s) continue;
      for (const m of s.mods || []) addMod({ ...m, source: `${n} ${it.name}` });
      if (s.sr) armorSpecialFx.sr = Math.max(armorSpecialFx.sr, s.sr);
      if (s.dr) armorSpecialFx.dr.push(s.dr);
    }
  }

  // ---- abilities
  const abil = {};
  const raceMods = {};
  if (race) {
    Object.assign(raceMods, race.abilityMods || {});
    if (race.flexibleBonus && d.raceBonus) raceMods[d.raceBonus] = (raceMods[d.raceBonus] || 0) + 2;
  }
  const abilityModsFrom = (a) => resolveMods(mods.filter((m) => m.target === a));
  const autoNoCon = !!flags.noCon && !flags.livingConstruct;
  const autoNoInt = !!flags.noInt;
  const noCon = d.abilityNone?.con === true || ((d.abilityNone?.con === null || d.abilityNone?.con === undefined) && autoNoCon);
  const noInt = d.abilityNone?.int === true || ((d.abilityNone?.int === null || d.abilityNone?.int === undefined) && autoNoInt);
  for (const a of ABILITIES) {
    const none = (a === 'con' && noCon) || (a === 'int' && noInt);
    abil[a] = none ? null : (Number(d.abilities?.[a]) || 0) + (raceMods[a] || 0) + (Number(d.abilityAdjust?.[a]) || 0);
  }
  // ability modifiers from feats/custom mods are applied after feats are known (second pass below)
  const m = {};
  const recomputeMods = () => { for (const a of ABILITIES) m[a] = abil[a] === null ? 0 : mod(abil[a]); };
  recomputeMods();
  out.abilities = abil;

  // ---- HD & classes
  const classes = (d.classes || []).filter((c) => c.level > 0).map((c) => ({ ...c, def: classesDB[c.classId] || (hb.classes || []).find((x) => x.id === c.classId) })).filter((c) => c.def)
    .map((c) => withArchetypeCasting(c, classesDB));
  const classLevels = classes.reduce((s, c) => s + Number(c.level), 0);
  // Monsters: Hit Dice follow the PF1e "HD by type and CR" table unless the user typed a value
  const racialHD0 = d.mode !== 'npc' && d.autoHD && d.cr !== null && d.cr !== undefined ? suggestedHD(type.id, Number(d.cr)) : Math.max(0, Number(d.racialHD) || 0);
  // Bestiary: "creatures with 1 or fewer HD replace their monster level with their character levels"
  const racialHD = racialHD0 <= 1 && classLevels > 0 ? 0 : racialHD0;
  out.racialHDReplaced = racialHD0 === 1 && racialHD === 0;
  const hd = racialHD + classLevels;
  out.hd = hd; out.racialHD = racialHD; out.classLevels = classLevels; out.classes = classes;
  const hdDie = (isBossTier && d.bossD12) ? 12 : (d.hdDie || flags.hdDie || type.hd);
  out.hdDie = hdDie;

  // ---- BAB
  const typeBab = flags.babFull ? 'full' : (type.bab === 'full' ? 'full' : type.bab);
  let bab = babFor(typeBab, racialHD);
  for (const c of classes) {
    const row = c.def.levels[Math.min(c.level, c.def.levels.length) - 1];
    bab += row ? row.bab : 0;
  }
  if (isBossTier) bab = hd; // FFd20 boss subtype: full BAB
  out.bab = bab;

  // ---- caster level (for feats like Arcane Strike / Extra MP)
  const casterClasses = classes.filter((c) => c.def.caster);
  let cl = casterClasses.reduce((s, c) => s + Number(c.level), 0);
  if (!pf && d.caster?.tier && d.caster.tier !== 'none') cl = Math.max(cl, hd);
  if (pf && (d.caster?.pfClass || d.caster?.pfMode === 'custom') && Number(d.caster.pfLevel) > 0) cl = Math.max(cl, Number(d.caster.pfLevel));
  if (d.caster?.cl) cl = Number(d.caster.cl);
  out.cl = cl;

  // ---- skills ranks helper (needed by feats)
  const skillRanks = (name) => Number(d.skills?.[name]) || 0;

  // ---- active class features (archetype swaps applied) → automatic effects, granted feats
  const pathDB = db.pathsByClass || {};
  const pathsOf = (c) => { const e = pathDB[c.def.id]; return e ? (c.paths || []).map((id) => e.options.find((o) => o.id === id)).filter(Boolean) : []; };
  out.classPaths = classes.map((c) => ({ classId: c.def.id, className: c.def.name, kind: pathDB[c.def.id]?.kind, count: pathDB[c.def.id]?.count || 0, chosen: pathsOf(c) })).filter((x) => x.kind);
  const activeFeatures = [];
  for (const c of classes) {
    const lvl = Number(c.level);
    const latest = {};
    for (const r of c.def.levels.slice(0, lvl)) for (const sp of r.special || []) latest[normFeat(sp)] = sp;
    const archs = (c.archetypes || []).map((id) => (db.archetypesById || {})[id]).filter(Boolean);
    const replaced = [];
    for (const a of archs) for (const f of a.features || []) if (f.level <= lvl) for (const r of f.replaces || []) replaced.push(normFeat(r));
    const isReplaced = (name) => replaced.some((k) => replacesFeature(k, name));
    for (const f of c.def.features || []) if (f.level <= lvl && !(archs.length && isReplaced(f.name))) activeFeatures.push({ cls: c.def, f, L: lvl, value: latest[normFeat(f.name)] || findLatest(latest, f.name) });
    for (const a of archs) for (const f of a.features || []) if (f.level <= lvl) activeFeatures.push({ cls: c.def, f: { ...f, archetype: a.name }, L: lvl, value: '' });
    // domains, bloodlines, schools, mysteries…: powers by level
    for (const p of pathsOf(c)) for (const f of p.powers || []) if (f.level <= lvl) activeFeatures.push({ cls: c.def, f: { ...f, path: p.name }, L: lvl, value: '' });
  }
  out.activeFeatures = activeFeatures;
  const armorDef = eq.armor?.name ? ARMORS.find((x) => x.name === String(eq.armor.name).toLowerCase()) : null;
  const legacyArmor = (d.armor || []).find((x) => (x.kind || 'armor') === 'armor');
  const armorType = armorDef ? armorDef.type : eq.armor?.name ? (Number(eq.armor.bonus) >= 7 ? 'heavy' : Number(eq.armor.bonus) >= 4 ? 'medium' : 'light')
    : legacyArmor ? (Number(legacyArmor.bonus) >= 7 ? 'heavy' : Number(legacyArmor.bonus) >= 4 ? 'medium' : 'light') : 'none';
  const hasShield = !!eq.shield?.name || (d.armor || []).some((x) => x.kind === 'shield');
  const armorMat = ARMOR_MATERIALS[eq.armor?.material || ''] || {};
  const lighter = { heavy: 'medium', medium: 'light', light: 'light', none: 'none' };
  const armorTypeEff = armorMat.lighter ? lighter[armorType] : armorType;
  out.armorType = armorTypeEff;
  const toggles = d.toggles || {};
  const cfx0 = { m, bab, hd, armor: armorTypeEff, shield: hasShield, ff: !pf };
  const cfAbil = applyClassEffects({ features: activeFeatures, stage: 'abilities', x0: cfx0, toggles });
  for (const mm of cfAbil.mods) addMod(mm);
  // feats granted by class features (Improved Unarmed Strike for monks, Endurance, Mobility…)
  const featNames = new Set();
  for (const f of db.feats || []) {
    const n = f.name.toLowerCase().replace(/\s*\(.*?\)\s*$/, '');
    featNames.add(n);
    const inv = /^(.+), (improved|greater|lesser|mythic)$/.exec(n); // index form "Unarmed Strike, Improved"
    if (inv) featNames.add(`${inv[2]} ${inv[1]}`);
  }
  for (const n of ['improved unarmed strike', 'endurance', 'diehard', 'track', 'alertness', 'improved initiative', 'deflect arrows', 'stunning fist', 'mobility', 'combat reflexes', 'run', 'throw anything', 'catch off-guard', 'eschew materials', 'brew potion', 'scribe scroll', 'martial weapon proficiency']) featNames.add(n);
  const house = activeHouseRules(db);
  out.houseRules = house;
  let autoFeats = grantedFeats(classes.map((c) => c), activeFeatures, featNames);
  // Moogle in the Room: class-granted feats that no longer exist become their replacement (or vanish)
  if (house) autoFeats = autoFeats.map((f) => { const g = goneFeat(house, f.name); return g ? (/^[A-Z]/.test(g.by) ? { ...f, name: g.by, id: `auto:${g.by}` } : null) : f; }).filter(Boolean)
    .filter((f, i, arr) => arr.findIndex((x) => x.name === f.name) === i);
  autoFeats = autoFeats.filter((f) => !(d.feats || []).some((u) => featKey(u.name) === featKey(f.name)));

  // ---- feats: collect modifiers & attack hooks
  const featFlags = {};
  const featAttackHooks = [];
  const textEffects = {};
  let featIdx = null;
  const featIndex = () => featIdx || (featIdx = featIndexFor(db.feats, pf));
  const ctx = { bab, hd, cl, abil, m, skillRanks, size, isBoss: isBossTier, twoWeapons: (d.attacks || []).some((a) => !a.natural && a.hands === 'off') };
  const seen = {};
  out.feats = [];
  const itemFeats = wornItems.flatMap((it) => (it.feats || []).map((name) => ({ id: `item:${it.id}:${name}`, name, fromItem: it.name })));
  // Moogle in the Room: Power Attack & co. are combat options for anyone with BAB +1; Dodge includes Mobility
  const houseFeats = [];
  if (house?.combatOptions && bab >= 1) for (const name of COMBAT_OPTIONS) if (!(d.feats || []).some((u) => featKey(u.name) === featKey(name))) houseFeats.push({ id: `hr:${featKey(name)}`, name, virtual: true });
  if (house?.dodge && (d.feats || []).some((u) => featKey(u.name) === 'dodge')) houseFeats.push({ id: 'hr:mobility', name: 'Mobility', virtual: true });
  out.houseToggles = houseFeats.filter((f) => featEffect(f.name)?.toggle).map((f) => ({ key: f.id, label: `${f.name} (opção)`, on: !!(d.toggles || {})[f.id] }));
  for (const f of [...(d.feats || []), ...itemFeats, ...autoFeats, ...houseFeats]) {
    const key = featKey(f.name);
    // hand-written automation first; otherwise read "+N bonus on X" from the feat's benefit text
    let eff = featEffect(f.name) || (hb.feats || []).find((h) => featKey(h.name) === key);
    if (!eff && !f.virtual) {
      textEffects[key] = textEffects[key] === undefined ? (() => { const info = featIndex()[key]; return info ? effectFromText(f.name, info.benefit && info.benefit.length > 25 ? info.benefit : info.text || info.benefit) : null; })() : textEffects[key];
      eff = textEffects[key];
    }
    const toggleOn = !!(d.toggles || {})[f.id || key];
    if (!f.fromItem && !f.virtual) out.feats.push({ ...f, automated: !!(eff && (eff.mods || eff.attack || eff.flag)) });
    if (!eff) continue;
    if (seen[key] && !eff.stack && !eff.param) continue;
    seen[key] = true;
    if (eff.flag) featFlags[eff.flag] = true;
    if (typeof eff.mods === 'function') for (const mm of eff.mods(ctx, f, toggleOn) || []) addMod(mm);
    else if (Array.isArray(eff.mods)) for (const mm of eff.mods) addMod({ ...mm, value: Number(mm.value) || 0, source: f.name });
    if (eff.attack) featAttackHooks.push({ eff, f: house?.weaponGroups && eff.param && f.param ? { ...f, param: weaponGroup(f.param) || f.param } : f, on: toggleOn });
  }
  out.featFlags = featFlags;

  // abilities modified by custom/feat mods (e.g. "+2 Str" homebrew)
  for (const a of ABILITIES) if (abil[a] !== null) abil[a] += abilityModsFrom(a);
  recomputeMods();
  ctx.m = m;
  // class features with numeric effects (armor training, bravery, monk AC bonus, rage…)
  const cfx = applyClassEffects({ features: activeFeatures, stage: 'rest', x0: { ...cfx0, m }, toggles });
  for (const mm of cfx.mods) addMod(mm);
  for (const h of cfx.hooks) featAttackHooks.push({ eff: { attack: (c0, ax) => h.fn(ax, d.attacks || [], h.x) }, f: { name: h.source }, on: true });
  Object.assign(featFlags, cfx.flags);
  if (house?.finesse) featFlags.finesse = true;
  if (house?.agileManeuvers) { const w = (d.attacks || []).find((a) => !a.natural); if (w && (w.light || w.finesse)) featFlags.agileManeuvers = true; }
  if (house?.twf && featFlags.gtwf) { featFlags.itwf = true; featFlags.gtwf = bab >= 11; }
  if (house) for (const f of d.feats || []) { const g = goneFeat(house, f.name); if (g) out.warnings.push(`${f.name} não existe no Moogle in the Room${g.by ? ` (agora: ${g.by})` : ''}.`); }
  out.classEffectNotes = cfx.notes;
  out.classShorts = cfx.shorts;
  // Sp powers of domains / bloodlines / schools → "Domain Spell-Like Abilities (CL 6th) 7/day—fire bolt"
  const KIND_SLA = { domain: 'Domain', bloodline: 'Bloodline', school: 'Arcane School', mystery: 'Mystery', spirit: 'Spirit' };
  const AB = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
  out.pathSLA = [];
  for (const c of classes) {
    const items = [];
    let kind = '';
    for (const p of pathsOf(c)) for (const f of p.powers || []) {
      if (f.type !== 'Sp' || f.level > Number(c.level)) continue;
      kind = kind || p.kind;
      const t = f.text || '';
      const u = /(\d+) \+ (?:your |his |her )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier/i.exec(t);
      const lv = /once per day|1\/day/i.test(t) ? '1/day' : /at will/i.test(t) ? 'At will' : u ? `${Math.max(1, Number(u[1]) + m[AB[u[2].toLowerCase()]])}/day` : '';
      items.push({ freq: lv || '—', name: f.name.toLowerCase(), key: `${p.id}:${f.name}` });
    }
    if (items.length) {
      const ab = c.def.castingAbility || 'wis';
      out.pathSLA.push({ label: `${KIND_SLA[kind] || ''} Spell-Like Abilities`.trim(), cl: Number(c.level), conc: Number(c.level) + (abil[ab] === null ? 0 : m[ab]), items });
    }
  }
  out.combatToggles = [...cfAbil.toggles, ...cfx.toggles];
  out.classImmunities = cfx.immune;
  const conLike = flags.chaForCon || type.id === 'undead' ? m.cha : (abil.con === null ? 0 : m.con);
  out.conLike = conLike;

  // ---- saves
  let goodList = d.goodSaves || type.good || [];
  if (flags.allGood || isBossTier) goodList = ['fort', 'ref', 'will'];
  const saves = {};
  for (const s of ['fort', 'ref', 'will']) {
    let base = racialHD ? (goodList.includes(s) ? goodSave(racialHD) : poorSave(racialHD)) : 0;
    for (const c of classes) {
      const row = c.def.levels[Math.min(c.level, c.def.levels.length) - 1];
      base += row ? row[s] : 0;
    }
    if (isBossTier) base = Math.max(base, goodSave(hd));
    const abilMod = s === 'fort' ? conLike : s === 'ref' ? m.dex : m.wis;
    const extra = resolveMods(mods.filter((x) => x.target === s || x.target === 'saves'));
    saves[s] = base + abilMod + extra;
  }
  out.saves = saves;
  out.saveNotes = mods.filter((x) => x.cond && ['fort', 'ref', 'will', 'saves'].includes(x.target)).map((x) => `${sign(x.value)} ${x.target === 'saves' ? '' : x.target + ' '}${x.cond}`.replace(/\s+/g, ' '));

  // ---- HP
  const avgDie = (die) => (die + 1) / 2;
  let avgDiceTotal = 0;
  let maxDiceTotal = 0;
  const firstHeroic = racialHD === 0 && classes[0] && (classes[0].def.kind !== 'basic');
  const dicePieces = [];
  if (racialHD) {
    avgDiceTotal += racialHD * avgDie(hdDie);
    maxDiceTotal += racialHD * hdDie;
    dicePieces.push([racialHD, hdDie]);
  }
  classes.forEach((c, i) => {
    const die = (isBossTier && d.bossD12) ? 12 : c.def.hd;
    let n = Number(c.level);
    if (i === 0 && firstHeroic && !isBossTier) {
      avgDiceTotal += die; maxDiceTotal += die; n -= 1;
      dicePieces.push([1, die, 'max']);
    }
    if (n > 0) {
      avgDiceTotal += n * avgDie(die); maxDiceTotal += n * die;
      dicePieces.push([n, die]);
    }
  });
  const constructHP = flags.constructHP && !flags.livingConstruct ? sz.constructHP : 0;
  const favoredHP = d.favored === 'hp' ? (classes[0] ? Number(classes[0].level) : 0) : 0;
  const hpFlat = conLike * hd + constructHP + favoredHP + resolveMods(mods.filter((x) => x.target === 'hp')) + (Number(d.hpBonus) || 0);
  let hpAvg = Math.floor(avgDiceTotal) + hpFlat;
  let hpMax = maxDiceTotal + hpFlat;
  if (flags.maxHP && !isBossTier) hpAvg = hpMax;
  const hpMult = isBossTier ? (Number(d.bossHPMult) || 2) : 1;
  hpAvg = Math.max(1, hpAvg) * hpMult;
  hpMax = Math.max(1, hpMax) * hpMult;
  // dice expression: combine same dice
  const merged = {};
  for (const [n, die] of dicePieces) merged[die] = (merged[die] || 0) + n;
  const diceExpr = Object.entries(merged).sort((a, b) => b[0] - a[0]).map(([die, n]) => `${n}d${die}`).join('+') || '0';
  out.hp = { avg: hpAvg, max: hpMax, expr: diceExpr + (hpFlat ? (hpFlat > 0 ? `+${hpFlat}` : `${hpFlat}`) : ''), mult: hpMult };
  const itemFH = wornItems.map((it) => it.fastHealing).filter(Boolean);
  out.hpExtra = [d.fastHealing && `fast healing ${d.fastHealing}`, !d.fastHealing && itemFH[0] && `fast healing ${itemFH[0]}`, d.regeneration && `regeneration ${d.regeneration}`].filter(Boolean);
  if (flags.forceField) out.hpExtra.push(`force field ${hd * 5} hp`);

  // ---- MP & spells (FFd20) / spells per day (Pathfinder)
  const mp = { total: 0, parts: [], maxSL: 0, lines: [] };
  out.pfSpells = [];
  if (pf) {
    const casters = classes.filter((c) => c.def.caster).map((c) => ({ def: c.def, level: Number(c.level) }));
    const mc = monsterCasting(d, db);
    if (mc) casters.push(mc);
    for (const c of casters) {
      const row = c.def.levels[Math.min(c.level, c.def.levels.length) - 1];
      if (!row || !row.spellsPerDay) continue;
      const ab = c.def.castingAbility || d.caster?.ability || 'int';
      const am = abil[ab] === null ? -5 : mod(abil[ab]);
      const perDay = {};
      for (const [lv, n] of Object.entries(row.spellsPerDay)) {
        const L = Number(lv);
        if (L === 0) { perDay[0] = n; continue; }
        if (n === 0 && am < L) continue;
        perDay[L] = n + (am >= L ? Math.floor((am - L) / 4) + 1 : 0); // PF1e bonus spells by ability modifier
      }
      const maxSL = Math.max(0, ...Object.keys(perDay).map(Number));
      // domain spells (one extra slot per spell level) and bonus spells known from bloodlines / mysteries
      const cls = classes.find((x) => x.def.id === c.def.id);
      const ps = cls ? pathsOf(cls) : [];
      const extra = [];
      for (const p of ps) for (const [k, name] of Object.entries(p.spells || {})) {
        const n = Number(k);
        const sl = p.kind === 'domain' ? n : p.kind === 'bloodline' ? (c.def.id === 'pf-bloodrager' ? Math.floor((n - 4) / 3) : Math.floor((n - 1) / 2)) : p.kind === 'mystery' ? Math.floor(n / 2) : n;
        const ok = p.kind === 'domain' || p.kind === 'spirit' ? sl <= maxSL : n <= c.level;
        if (ok && sl >= 1 && sl <= maxSL) extra.push({ level: sl, name, kind: p.kind, path: p.name });
      }
      const domainSlot = !!c.def.domainSlots && ps.some((p) => p.kind === 'domain');
      out.pfSpells.push({ source: c.def.name, classId: c.def.id, lists: c.def.spellLists || [c.def.id], knownAs: c.def.knownAs || c.def.id, castsAs: c.def.castsAs || '', cl: c.level, ability: ab, spontaneous: !!c.def.spontaneous, perDay, maxSL, monster: !!c.monster, extra, domainSlot, paths: ps.map((p) => ({ kind: p.kind, name: p.name })) });
      mp.maxSL = Math.max(mp.maxSL, maxSL);
      mp.parts.push({ source: c.def.name, base: 0, bonus: 0, ability: ab, sl: maxSL, cl: c.level });
    }
  }
  for (const c of pf ? [] : classes) {
    if (!c.def.caster) continue;
    const row = c.def.levels[Math.min(c.level, c.def.levels.length) - 1];
    if (!row) continue;
    const ab = (flags.castWis ? 'wis' : c.def.castingAbility) || 'int';
    const sl = row.spellLevel || 0;
    const bonus = bonusMP(abil[ab], sl);
    mp.total += (row.mp || 0) + bonus;
    mp.parts.push({ source: c.def.name, base: row.mp || 0, bonus, ability: ab, sl, cl: Number(c.level) });
    mp.maxSL = Math.max(mp.maxSL, sl);
  }
  const ct = pf ? 'none' : (d.caster?.tier || 'none');
  if (ct !== 'none') {
    const ab = flags.castWis ? 'wis' : (d.caster.ability || 'int');
    const cm = creatureMP(ct, racialHD || hd, isBossTier);
    const bonus = bonusMP(abil[ab], cm.maxSL);
    mp.total += cm.mp + bonus;
    mp.parts.push({ source: CASTER_ABBR[ct], base: cm.mp, bonus, ability: ab, sl: cm.maxSL, cl: cl });
    mp.maxSL = Math.max(mp.maxSL, cm.maxSL);
  }
  if (!pf) {
    mp.total += Number(d.caster?.mpBonus) || 0;
    mp.total += resolveMods(mods.filter((x) => x.target === 'mp'));
  }
  out.mp = mp;
  out.spellBudget = spellBudget(d, out.pfSpells, pf ? [] : classes, abil, db);
  for (const b of out.spellBudget) for (const r of b.rows) if (r.limit !== null && r.chosen > r.limit) out.warnings.push(`Magias${b.rows.length > 1 ? ` de ${r.level === 'all' ? 'nível 1+' : r.level === 0 ? 'nível 0' : `${r.level}º nível`}` : ''} (${b.source}): ${r.chosen} escolhidas, limite ${r.limit}.`);
  const castAbility = mp.parts[0]?.ability || d.caster?.ability || 'int';
  const dcBonus = resolveMods(mods.filter((x) => x.target === 'spellDC'));
  const concBonus = resolveMods(mods.filter((x) => x.target === 'concentration'));
  out.spellDCBase = 10 + m[castAbility] + dcBonus;
  out.concentration = cl + m[castAbility] + concBonus;
  out.castAbility = castAbility;
  out.spellDCNotes = mods.filter((x) => x.cond && x.target === 'spellDC').map((x) => `${sign(x.value)} ${x.cond}`);

  // ---- AC
  const materialResist = []; // elemental crystal armor
  if (flags.incorporeal) mods.push({ target: 'ac', value: Math.max(1, m.cha), type: 'deflection', source: 'incorporeal' });
  const acParts = [];
  const acMods = mods.filter((x) => x.target === 'ac' && !x.cond);
  let maxDex = Infinity;
  let acp = 0;
  let armorBonus = 0, shieldBonus = 0;
  for (const it of d.armor || []) {
    const b = Number(it.bonus) || 0;
    const k = it.kind || 'armor';
    if (k === 'armor') { armorBonus = Math.max(armorBonus, b); if (it.maxDex !== '' && it.maxDex !== null && it.maxDex !== undefined) maxDex = Math.min(maxDex, Number(it.maxDex)); }
    else if (k === 'shield') shieldBonus = Math.max(shieldBonus, b);
    else acMods.push({ target: 'ac', value: b, type: k, source: it.name });
    acp += Number(it.acp) || 0;
  }
  // equipped armor & shield (Equipment section): base bonus + enhancement; masterwork/magic reduce ACP by 1
  for (const [k, it] of [['armor', eq.armor], ['shield', eq.shield]]) {
    if (!it || !it.name) continue;
    const mat = ARMOR_MATERIALS[it.material || ''] || {};
    const b = Math.max(0, (Number(it.bonus) || 0) + (Number(it.enh) || 0) + (mat.acBonus || 0));
    if (k === 'armor') armorBonus = Math.max(armorBonus, b);
    else shieldBonus = Math.max(shieldBonus, b);
    if (it.maxDex !== '' && it.maxDex !== null && it.maxDex !== undefined) maxDex = Math.min(maxDex, Number(it.maxDex) + (mat.maxDex || 0));
    acp += Math.max(0, (Number(it.acp) || 0) - (it.masterwork || Number(it.enh) || mat.mw ? 1 : 0) - (mat.acp || 0));
    if (mat.dr) { const n = mat.dr(k === 'shield' ? 'shield' : armorType); if (n) addMod({ target: 'dr', value: n, type: 'adamantine', source: `${mat.name} ${it.name}` }); }
    if (mat.resist) materialResist.push([it.materialElement || EL[0], mat.resist(it)]);
    if (mat.resistFixed) materialResist.push([pf ? mat.resistFixed[0] : (Object.entries(FF_TO_PF).find(([, v]) => v === mat.resistFixed[0]) || [mat.resistFixed[0]])[0], mat.resistFixed[1]]);
    if (mat.init) { const n = mat.init(k === 'shield' ? 'shield' : armorType); if (n) addMod({ target: 'init', value: n, type: 'untyped', source: `${mat.name} ${it.name}` }); }
  }
  // armor training and similar: higher max Dex and lower armor check penalty while wearing armor
  if (armorType !== 'none') {
    const md = mods.filter((x) => x.target === 'maxDex' && !x.cond).reduce((a, x) => Math.max(a, x.value), 0);
    if (md && Number.isFinite(maxDex)) maxDex += md;
    const red = mods.filter((x) => x.target === 'acp' && !x.cond).reduce((a, x) => Math.max(a, x.value), 0);
    acp = Math.max(0, acp - red);
  }
  armorBonus = Math.max(armorBonus, ...acMods.filter((x) => x.type === 'armor-item').map((x) => x.value), 0);
  const armorFeat = acMods.filter((x) => x.type === 'armor-feat' || x.type === 'armor-feat2').reduce((s, x) => s + x.value, 0);
  const shieldFeat = acMods.filter((x) => x.type === 'shield-feat' || x.type === 'shield-feat2').reduce((s, x) => s + x.value, 0);
  if (armorBonus) armorBonus += armorFeat;
  if (shieldBonus) shieldBonus += shieldFeat;
  const naturalFeat = acMods.filter((x) => x.type === 'natural-feat').reduce((s, x) => s + x.value, 0);
  const dexToAC0 = Math.min(m.dex, maxDex);
  const otherSum0 = (() => {
    const o = {};
    for (const x of acMods) {
      if (['armor-feat', 'armor-feat2', 'shield-feat', 'shield-feat2', 'natural-feat', 'natural', 'armor-item'].includes(x.type)) continue;
      const t = x.type || 'untyped';
      if (t === 'dodge' || t === 'untyped' || x.value < 0) o[t] = (o[t] || 0) + x.value; else o[t] = Math.max(o[t] ?? -Infinity, x.value);
    }
    return Object.values(o).reduce((a, b) => a + b, 0);
  })();
  const naturalExtra = naturalFeat + Math.max(0, ...acMods.filter((x) => x.type === 'natural').map((x) => x.value), 0);
  let baseNatural = Number(d.naturalArmor) || 0;
  // Monsters: natural armor fills the gap to the "AC by CR" target (PF1e Monster Statistics by CR)
  const crForAC = d.crOverride !== null && d.crOverride !== undefined && d.crOverride !== '' ? Number(d.crOverride) : d.cr;
  if (d.mode !== 'npc' && d.autoNaturalArmor && crForAC !== null && crForAC !== undefined) {
    const target = statsForCR(Number(crForAC)).ac;
    const without = 10 + armorBonus + shieldBonus + naturalExtra + dexToAC0 + sz.mod + otherSum0;
    baseNatural = Math.max(0, target - without);
  }
  out.naturalArmorBase = baseNatural;
  const natural = baseNatural + naturalExtra;
  const dexToAC = Math.min(m.dex, maxDex);
  const other = {};
  for (const x of acMods) {
    if (['armor-feat', 'armor-feat2', 'shield-feat', 'shield-feat2', 'natural-feat', 'natural', 'armor-item'].includes(x.type)) continue;
    const t = x.type || 'untyped';
    if (t === 'dodge' || t === 'untyped' || x.value < 0) other[t] = (other[t] || 0) + x.value;
    else other[t] = Math.max(other[t] ?? -Infinity, x.value);
  }
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const ac = 10 + armorBonus + shieldBonus + natural + dexToAC + sz.mod + sum(other);
  const touchExcl = 0;
  const touch = 10 + dexToAC + sz.mod + sum(other) - touchExcl;
  const flat = 10 + armorBonus + shieldBonus + natural + sz.mod + sum(Object.fromEntries(Object.entries(other).filter(([k]) => k !== 'dodge'))) + Math.min(0, dexToAC);
  if (armorBonus) acParts.push([armorBonus, 'armor']);
  if (dexToAC) acParts.push([dexToAC, 'Dex']);
  for (const [k, v] of Object.entries(other)) if (v) acParts.push([v, k === 'untyped' ? 'misc' : k]);
  if (natural) acParts.push([natural, 'natural']);
  if (shieldBonus) acParts.push([shieldBonus, 'shield']);
  if (sz.mod) acParts.push([sz.mod, 'size']);
  out.ac = { ac, touch, flat, parts: acParts, notes: mods.filter((x) => x.cond && x.target === 'ac').map((x) => `${sign(x.value)} ${x.type || ''} ${x.cond}`.replace(/\s+/g, ' ')) };
  out.acp = acp;

  // ---- initiative, CMB, CMD, speed
  out.init = m.dex + resolveMods(mods.filter((x) => x.target === 'init'));
  const cmbAbil = featFlags.agileManeuvers ? Math.max(m.str, m.dex) : m.str;
  const tinyCMB = ['Fine', 'Diminutive', 'Tiny'].includes(size) ? m.dex : cmbAbil;
  out.cmb = bab + tinyCMB + sz.special + resolveMods(mods.filter((x) => x.target === 'cmb'));
  const cmdAcBonus = Object.entries(other).filter(([k]) => ['dodge', 'deflection', 'insight', 'luck', 'morale', 'profane', 'sacred', 'circumstance', 'untyped'].includes(k)).reduce((s, [, v]) => s + v, 0);
  out.cmd = 10 + (featFlags.dct ? hd : bab) + m.str + m.dex + sz.special + cmdAcBonus + resolveMods(mods.filter((x) => x.target === 'cmd'));
  out.cmdNotes = mods.filter((x) => x.cond && x.target === 'cmd').map((x) => `${sign(x.value)} ${x.cond}`);
  const speedBonus = resolveMods(mods.filter((x) => x.target === 'speed'));
  out.speed = { ...d.speed, land: (Number(d.speed?.land) || 0) + (d.speed?.land ? speedBonus : 0) };

  // ---- attacks
  const atkMods = resolveMods(mods.filter((x) => x.target === 'attack'));
  const atkMelee = resolveMods(mods.filter((x) => x.target === 'attack.melee'));
  const atkRanged = resolveMods(mods.filter((x) => x.target === 'attack.ranged'));
  const dmgMods = resolveMods(mods.filter((x) => x.target === 'damage'));
  const dmgMelee = resolveMods(mods.filter((x) => x.target === 'damage.melee'));
  const dmgRanged = resolveMods(mods.filter((x) => x.target === 'damage.ranged'));
  const groups = {};
  for (const a of d.attacks || []) (groups[a.group || 1] = groups[a.group || 1] || []).push(a);
  out.attacks = { melee: [], ranged: [] };
  const graceFeats = (d.feats || []).map((f) => ({ k: featKey(f.name), p: String(f.param || '').toLowerCase().trim() }));
  const hasFeat = (k) => graceFeats.find((f) => f.k === k);
  const dexDamageFor = (a) => {
    const n = String(a.name || '').toLowerCase();
    if (featFlags.dexDamage && (a.light || a.finesse)) return true;
    if (hasFeat('fencing grace') && /rapier/.test(n)) return true;
    if (hasFeat('dervish dance') && /scimitar/.test(n)) return true;
    const sg = hasFeat('slashing grace');
    return !!(sg && sg.p && n.includes(sg.p));
  };
  out.attackDetails = [];
  for (const [g, list] of Object.entries(groups).sort((a, b) => a[0] - b[0])) {
    for (const kind of ['melee', 'ranged']) {
      const items = list.filter((a) => a.kind === kind);
      if (!items.length) continue;
      const hasWeapon = items.some((a) => !a.natural);
      const naturals = items.filter((a) => a.natural);
      const singleNatural = !hasWeapon && naturals.length === 1 && Number(naturals[0].count || 1) === 1;
      const offhands = items.filter((a) => !a.natural && a.hands === 'off');
      const twf = offhands.length > 0;
      const offLight = offhands.every((a) => a.light);
      const parts = [];
      for (const a of items) {
        const secondary = a.natural && (hasWeapon || a.primary === false);
        // ability for attack
        let atkAbil = kind === 'ranged' ? m.dex : m.str;
        if (kind === 'melee' && featFlags.finesse && (a.light || a.finesse || a.natural)) atkAbil = Math.max(m.str, m.dex);
        if (kind === 'melee' && a.finesse && !featFlags.finesse && a.dexAttack) atkAbil = Math.max(m.str, m.dex);
        // damage multiplier
        let dmgMult = 1;
        if (a.dmgAbility === 'none') dmgMult = 0;
        else if (kind === 'ranged' && !a.thrown && a.dmgAbility !== 'str' && a.dmgAbility !== 'dex') dmgMult = 0;
        else if (a.hands === 'two' || singleNatural) dmgMult = 1.5;
        else if ((a.hands === 'off' && !featFlags.doubleSlice) || secondary) dmgMult = 0.5;
        if (a.dmgMult !== undefined && a.dmgMult !== '' && a.dmgMult !== null && a.dmgAbility === 'custom') dmgMult = Number(a.dmgMult);
        // Dex instead of Str to damage: unchained rogue finesse training, Fencing Grace (rapier), Dervish Dance (scimitar),
        // Slashing Grace (the chosen weapon). Off-hand still adds half, as for Str (Double Slice: full).
        const dexDmg = kind === 'melee' && !a.natural && (!a.dmgAbility || a.dmgAbility === 'auto') && dexDamageFor(a);
        const dmgAbilScore = a.dmgAbility === 'dex' ? m.dex : a.dmgAbility === 'cha' ? m.cha : dexDmg ? Math.max(m.str, m.dex) : m.str;
        let dmgAbil = dmgMult === 0 ? 0 : (dmgAbilScore < 0 ? dmgAbilScore : Math.floor(dmgAbilScore * dmgMult));
        const ax = { ...a, _dmgMult: dmgMult, ...(house?.weaponGroups && !a.natural ? { weaponGroup: weaponGroup(a.name) } : {}) };
        const wmat = a.natural ? {} : (WEAPON_MATERIALS[a.material || ''] || {});
        let att = bab + atkAbil + sz.mod + (Number(a.enhancement) || 0) + (wmat.atk || 0) + ((a.masterwork || wmat.mw) && !Number(a.enhancement) && !a.natural ? 1 : 0) + (Number(a.attackBonus) || 0) + atkMods + (kind === 'melee' ? atkMelee : atkRanged);
        let dmg = dmgAbil + (wmat.dmg || 0) + (Number(a.enhancement) || 0) + (Number(a.damageBonus) || 0) + dmgMods + (kind === 'melee' ? dmgMelee : dmgRanged);
        let critRange = Number(a.critRange) || 20;
        // keen (and similar) magic weapon abilities double the threat range; speed adds an attack
        const wsp = a.natural ? [] : (a.specials || []).map((n) => wSpecials.find((x) => x.name === n)).filter(Boolean);
        if (wsp.some((x) => x.keen) && !featAttackHooks.some((h) => /improved critical/i.test(h.f?.name || '') && h.eff.attack(ctx, ax, h.f, h.on)?.doubleThreat)) critRange = 21 - (21 - critRange) * 2;
        let diceSteps = 0;
        let extraAttacks = wsp.some((x) => x.extraAttack) ? 1 : 0;
        for (const hk of featAttackHooks) {
          const r = hk.eff.attack(ctx, ax, hk.f, hk.on);
          if (!r) continue;
          att += r.att || 0;
          dmg += r.dmg || 0;
          if (r.doubleThreat) critRange = 21 - (21 - critRange) * 2;
          if (r.dice) ax._dice = r.dice;
          if (r.note) (ax._notes = ax._notes || []).push(r.note);
          if (r.extraDamageRolls) ax._extraRolls = (ax._extraRolls || 0) + r.extraDamageRolls;
          diceSteps += r.diceSteps || 0;
          extraAttacks += r.extraAttacks || 0;
        }
        if (secondary) att += featFlags.multiattack ? -2 : -5;
        if (twf && !a.natural) {
          if (a.hands === 'off') att += featFlags.twf ? (offLight ? -2 : -4) : (offLight ? -8 : -10);
          else att += featFlags.twf ? (offLight ? -2 : -4) : (offLight ? -4 : -6);
        }
        const dice = stepDice(ax._dice ? scaleDiceForSize(ax._dice, 'Medium', size) : a.dice, diceSteps);
        // attack sequence
        let seq = [att];
        if (!a.natural && a.iterative !== false && a.hands !== 'off') {
          seq = [];
          for (let b = bab, i = 0; i === 0 || (b > 0 && i < 4); b -= 5, i++) seq.push(att - i * 5);
        }
        if (a.hands === 'off') {
          seq = [att];
          if (featFlags.itwf) seq.push(att - 5);
          if (featFlags.gtwf) seq.push(att - 10);
        }
        for (let i = 0; i < extraAttacks; i++) seq.unshift(seq[0]);
        const count = Number(a.count) || 1;
        const label = count > 1 ? `${count} ${a.plural || pluralize(a.name)}` : a.name;
        const enh = Number(a.enhancement) || 0;
        const specialWords = (a.specials || []).map((x) => x.toLowerCase()).join(' ');
        const matWord = wmat.name && a.material ? `${wmat.label || wmat.name} ` : '';
        const prefix = (!a.natural && !/^[+]\d/.test(a.name) ? (enh ? `+${enh} ` : a.masterwork && !wmat.mw ? 'mwk ' : '') : '') + (specialWords && !a.natural ? `${specialWords} ` : '') + matWord;
        const crit = (critRange < 20 ? `/${critRange}–20` : '') + (Number(a.critMult) > 2 ? `/×${a.critMult}` : '');
        const riders = [];
        if (!a.natural) {
          for (const sp of a.specials || []) {
            const def0 = wSpecials.find((x) => x.name === sp);
            const r = def0 ? weaponSpecialRider(def0.text) : '';
            if (r) riders.push(r);
          }
          for (const it of wornItems) if (it.rider) riders.push(it.rider);
          if (wmat.rider) riders.push(wmat.rider(a));
        }
        const extraTxt = (a.extra || '').trim().replace(/^plus\s+/i, '');
        if (extraTxt) riders.push(extraTxt);
        const dmgStr = `${dice}${dmg ? sign(dmg) : ''}${crit}${riders.length ? ` plus ${riders.join(' and ')}` : ''}`;
        const touch = a.touch ? ' touch' : '';
        const text = `${prefix}${label} ${seq.map(sign).join('/')}${touch} (${dmgStr})${ax._notes ? ` (${ax._notes.join('; ')})` : ''}`;
        parts.push(text);
        out.attackDetails.push({ id: a.id, text, att: seq[0], dmgAvg: avgDice(dice) + dmg, count: count * seq.length + (ax._extraRolls || 0), kind });
      }
      out.attacks[kind].push(parts.join(', '));
    }
  }
  // swarm / troop attacks: automatic damage by HD (PF1e swarm and troop subtypes); troops add Str
  if (flags.swarm || flags.troop) {
    const dice = `${Math.min(5, 1 + Math.floor((hd - 1) / 5))}d6`;
    const kind = flags.troop ? 'troop' : 'swarm';
    const bonus = flags.troop ? m.str : 0;
    const extra = [flags.swarm ? 'distraction' : '', d.swarmExtra].filter(Boolean).join(' and ');
    const text = `${kind} (${dice}${bonus ? sign(bonus) : ''}${extra ? ` plus ${extra}` : ''})`;
    out.attacks.melee.unshift(text);
    out.attackDetails.push({ id: '__swarm', text, att: null, dmgAvg: avgDice(dice) + bonus, count: 1, kind: 'melee' });
  }
  // average damage of full attack (for CR analysis): sum over first group per kind
  const firstGroup = (d.attacks || []).length ? Math.min(...d.attacks.map((a) => a.group || 1)) : 1;
  out.fullAttackAvg = out.attackDetails.filter((x) => x.id === '__swarm' || (d.attacks.find((a) => a.id === x.id)?.group || 1) === firstGroup).reduce((s, x) => s + x.dmgAvg * x.count, 0);
  const atks = out.attackDetails.filter((x) => x.att !== null);
  out.bestAttack = atks.length ? Math.max(...atks.map((x) => x.att)) : null;

  // ---- space / reach
  out.space = d.spaceOverride || (flags.swarm ? '10 ft.' : flags.troop ? '20 ft.' : sz.space);
  out.reach = d.reachOverride !== '' && d.reachOverride !== null && d.reachOverride !== undefined ? d.reachOverride : flags.swarm ? '0 ft.' : `${sz.reach} ft.`;
  out.showSpace = out.space !== '5 ft.' || out.reach !== '5 ft.' || !!d.reachNotes;

  // ---- skills
  const classSkillList = [...(type.classSkills || [])];
  for (const c of classes) classSkillList.push(...(c.def.classSkills || []));
  const archSkills = archetypeClassSkills(activeFeatures, SKILLS.map((x) => x.name));
  classSkillList.push(...archSkills.add);
  // class skills granted by bloodlines / mysteries ("Class Skill: Perception", "Knowledge (arcana)")
  const skillsIn = (txt) => SKILLS.filter((sk) => {
    const t = String(txt || '').toLowerCase();
    const base = sk.name.replace(/\s*\(.*\)/, '').toLowerCase();
    const sub = (sk.name.match(/\((.*)\)/) || [])[1];
    return sub ? t.includes(base) && t.includes(sub.toLowerCase()) : new RegExp(`\\b${base}\\b`).test(t);
  }).map((sk) => sk.name);
  for (const c of classes) for (const p of pathsOf(c)) if (p.classSkills) classSkillList.push(...skillsIn(p.classSkills));
  for (const r of archSkills.remove) { const i = classSkillList.findIndex((x) => x.toLowerCase() === r.toLowerCase()); if (i >= 0) classSkillList.splice(i, 1); }
  out.archetypeSkills = archSkills;
  out.skillPoints = {
    available: racialHD * Math.max(1, (flags.skillPts || type.skillPts || 2) + m.int) +
      classes.reduce((s, c) => s + Number(c.level) * Math.max(1, (c.def.skillPoints || 2) + m.int), 0) +
      (d.favored === 'skill' && classes[0] ? Number(classes[0].level) : 0) +
      (race && (race.id === 'hume' || race.bonusSkillRanks || raceFx.bonusSkillRanks) ? hd : 0),
    used: Object.values(d.skills || {}).reduce((s, v) => s + (Number(v) || 0), 0),
    maxRanks: hd,
  };
  if (abil.int === null) out.skillPoints.available = 0;
  const skills = [];
  const allSkillNames = new Set([...SKILLS.map((s) => s.name), ...Object.keys(d.skills || {}), ...Object.keys(d.skillMisc || {})]);
  for (const sk of mods.filter((x) => x.target?.startsWith('skill:'))) allSkillNames.add(sk.target.slice(6));
  for (const name of allSkillNames) {
    const def0 = SKILLS.find((s) => s.name === name) || { name, ability: guessSkillAbility(name), trained: false, acp: false };
    const ranks = Number(d.skills?.[name]) || 0;
    const cs = isClassSkill(name, classSkillList);
    const misc = Number(d.skillMisc?.[name]) || 0;
    const featBonus = resolveMods(mods.filter((x) => x.target === `skill:${name}` || x.target === 'skills'));
    let sizeMod = 0;
    if (name === 'Stealth') sizeMod = sz.stealth;
    if (name === 'Fly') sizeMod = sz.fly + ({ clumsy: -8, poor: -4, average: 0, good: 4, perfect: 8 }[d.speed?.flyMan] || 0);
    const abilMod = abil[def0.ability] === null ? 0 : m[def0.ability];
    const total = ranks + abilMod + (cs && ranks > 0 ? 3 : 0) + misc + featBonus + sizeMod + (def0.acp ? -Math.abs(acp) : 0);
    const show = ranks > 0 || misc !== 0 || (featBonus !== 0 && !def0.trained) || (name === 'Fly' && d.speed?.fly > 0 && false);
    skills.push({ name, ranks, classSkill: cs, total, show, ability: def0.ability, trained: def0.trained });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  out.skills = skills;
  const perception = skills.find((s) => s.name === 'Perception');
  out.perception = perception ? perception.total : m.wis;

  // ---- feats budget
  out.featBudget = 1 + Math.floor(Math.max(0, hd - 1) / 2) + (race && (['hume', 'half-breed'].includes(race.id) || race.bonusFeat || raceFx.bonusFeat) ? 1 : 0);
  // class bonus feats (fighter, monk, ranger combat style…) add slots: feats marked "bônus" fill them first,
  // and any general feat beyond the normal limit spills into a free bonus slot
  const bonusSlots = classBonusFeatSlots(classes);
  out.bonusFeatBudget = bonusSlots.n;
  out.bonusFeatSources = bonusSlots.per;
  const userFeats = (d.feats || []);
  const markedBonus = userFeats.filter((f) => f.bonus).length;
  const general = userFeats.filter((f) => !f.bonus).length;
  const freeBonus = Math.max(0, bonusSlots.n - markedBonus);
  out.featsGeneral = general;
  out.featsTaken = Math.max(0, general - freeBonus);
  out.featSlotsUsed = general + Math.min(markedBonus, bonusSlots.n);
  out.featSlotsTotal = out.featBudget + bonusSlots.n;
  out.autoFeats = autoFeats;

  // ---- senses
  const senses = new Set();
  for (const s of type.senses || []) senses.add(s);
  for (const st of traitSources) for (const s of st.senses || []) senses.add(s);
  if (race) for (const t of race.traits || []) {
    const n = t.name.toLowerCase();
    if (n.startsWith('low-light vision')) senses.add('low-light vision');
    const dv = (t.name + ' ' + t.text).match(/darkvision (?:up to )?(\d+) feet/i);
    if (n.startsWith('darkvision') && dv) senses.add(`darkvision ${dv[1]} ft.`);
    if (n.startsWith('scent')) senses.add('scent');
  }
  for (const s of d.senses || []) senses.add(s);
  for (const s of d.sensesRemoved || []) senses.delete(s);
  // collapse darkvision duplicates (keep longest)
  const dvs = [...senses].filter((s) => s.startsWith('darkvision'));
  if (dvs.length > 1) {
    const best = dvs.sort((a, b) => parseInt(b.match(/\d+/)) - parseInt(a.match(/\d+/)))[0];
    for (const s of dvs) if (s !== best) senses.delete(s);
  }
  out.senses = [...senses];

  // ---- elements
  const elements = {};
  const resistAmt = {};
  const apply = (src, val) => {
    if (!val) return;
    const cur = elements[src] || '';
    if (AFFINITY_RANK[val] > AFFINITY_RANK[cur] || cur === '') elements[src] = val;
  };
  const applyFrom = (el, v) => { const k = elKey(el); if (k && EL.includes(k)) apply(k, affOf(v)); };
  for (const [el, v] of Object.entries(type.elements || {})) applyFrom(el, v);
  for (const st of traitSources) {
    for (const [el, v] of Object.entries(st.elements || {})) applyFrom(el, v);
    for (const [el, v] of Object.entries(st.resist || {})) { const k = elKey(el); if (k) resistAmt[k] = Math.max(resistAmt[k] || 0, v); }
  }
  for (const it of wornItems) for (const el of it.strong || []) applyFrom(el, 'strong');
  for (const [el, v] of materialResist) { const k = elKey(el); if (k) resistAmt[k] = Math.max(resistAmt[k] || 0, v); }
  // domain / bloodline / mystery powers: "you gain resist fire 10 … increases to 20 at 12th level … immunity to fire at 20th"
  for (const { f, L } of activeFeatures.filter((x) => x.f.path)) {
    const t = f.text || '';
    const r = /resist(?:ance)? (acid|cold|electricity|fire|sonic) (\d+)|resist (\d+) (?:to|against) (acid|cold|electricity|fire|sonic)/i.exec(t);
    if (r) {
      const el = (r[1] || r[4]).toLowerCase();
      let v = Number(r[2] || r[3]);
      for (const m of t.matchAll(/increases to (\d+) at (\d+)(?:st|nd|rd|th) level/gi)) if (L >= Number(m[2])) v = Number(m[1]);
      const im = new RegExp(`(?:at|At) (\\d+)(?:st|nd|rd|th) level,? you (?:gain|become) immun(?:e|ity) to ${el}`).exec(t);
      const k = elKey(el);
      if (im && L >= Number(im[1])) { if (k) apply(k, 'immune'); } else if (k) resistAmt[k] = Math.max(resistAmt[k] || 0, v);
    }
  }
  // weakness vs immunity from multiple sources: immunity wins (rank)
  for (const el of EL) {
    const o = d.elementOverrides?.[el];
    if (o !== undefined && o !== null && o !== 'inherit') elements[el] = o === 'none' ? '' : o;
    if (d.elementResist?.[el]) resistAmt[el] = Number(d.elementResist[el]);
  }
  out.elements = elements;
  out.elementResist = resistAmt;
  const byAff = (aff) => EL.filter((e) => elements[e] === aff);
  out.absorb = byAff('absorb');
  out.elemImmune = byAff('immune');
  out.strong = byAff('strong');
  out.weak = byAff('weak');
  out.resist = EL.filter((e) => elements[e] === 'resist' || (resistAmt[e] && !['immune', 'absorb'].includes(elements[e]))).map((e) => `${e} ${resistAmt[e] || 10}`);

  // ---- immunities
  const imm = new Set();
  for (const x of type.immunities || []) imm.add(x);
  for (const st of traitSources) for (const x of st.immunities || []) imm.add(x);
  if (isBossTier) for (const x of BOSS_IMMUNITIES) if (!(boss === 'super' && x === 'stun')) imm.add(x);
  for (const it of wornItems) for (const x of it.immunities || []) imm.add(x);
  for (const x of out.classImmunities || []) imm.add(x);
  for (const x of raceFx.immune || []) imm.add(x);
  for (const x of d.immunities || []) imm.add(x);
  for (const x of d.immunitiesRemoved || []) imm.delete(x);
  if (imm.has('death effects')) imm.delete('death');
  out.immunities = [...out.elemImmune, ...[...imm].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))];

  // ---- DR / SR
  const drParts = [];
  for (const st of traitSources) if (st.dr) drParts.push(st.dr);
  const drFeat = resolveMods(mods.filter((x) => x.target === 'dr'));
  if (drFeat) drParts.push(`${drFeat}/—`);
  drParts.push(...armorSpecialFx.dr);
  if (d.dr) drParts.unshift(d.dr);
  out.dr = d.dr ? d.dr : drParts.join(', ');
  const crNum = computeCR(d, out);
  out.cr = crNum;
  let sr = d.sr ? Number(d.sr) : armorSpecialFx.sr || null;
  const srCR = Math.max(0, ...subtypeDefs.map((s) => s.flags?.srCR || 0));
  if (!sr && srCR && crNum !== null) sr = Math.floor(crNum) + srCR;
  if (!sr && boss === 'super' && crNum !== null) sr = Math.floor(crNum) + 15;
  if (!sr && d.srAuto && crNum !== null) sr = Math.floor(crNum) + 11;
  sr = sr ? sr + resolveMods(mods.filter((x) => x.target === 'sr')) : sr;
  out.sr = sr;

  // ---- templates for ability text
  const mental = Math.max(m.int, m.wis, m.cha);
  out.tpl = {
    hd, hd5: hd * 5, cl, bab, cr: crLabel(crNum),
    dcCon: 10 + Math.floor(hd / 2) + conLike, dcCha: 10 + Math.floor(hd / 2) + m.cha, dcWis: 10 + Math.floor(hd / 2) + m.wis,
    dcInt: 10 + Math.floor(hd / 2) + m.int, dcStr: 10 + Math.floor(hd / 2) + m.str, dcDex: 10 + Math.floor(hd / 2) + m.dex,
    dcMental: 10 + Math.floor(hd / 2) + mental,
    bombRadius: hd >= 20 ? 60 : hd >= 10 ? 30 : 15,
    burstUses: burstUses(hd), burstDuration: burstDuration(hd),
    str: m.str, dex: m.dex, con: conLike, int: m.int, wis: m.wis, cha: m.cha,
  };

  // ---- special abilities (custom + subtype + class features + limit breaks + burst)
  const abilities = [];
  for (const st of traitSources) for (const ab of st.abilities || []) abilities.push({ ...ab, origin: st.name });
  for (const ab of d.abilitiesList || []) abilities.push({ ...ab, origin: 'custom' });
  // class features (+ archetype swaps) and class talents
  out.classFeatureList = [];
  out.talentGroups = [];
  const archDB = db.archetypesById || {};
  const talentDB = db.talentsByClass || {};
  for (const c of classes) {
    const lvl = Number(c.level);
    const rows = c.def.levels.slice(0, lvl);
    const latestValue = {};
    for (const r of rows) for (const sp of r.special) latestValue[normFeat(sp)] = sp;
    const archs = (c.archetypes || []).map((id) => archDB[id]).filter(Boolean);
    c.archetypeNames = archs.map((a) => a.name);
    const replaced = [];
    const archFeats = [];
    for (const a of archs) {
      for (const f of a.features || []) {
        if (f.level > lvl) continue;
        for (const r of f.replaces || []) replaced.push({ key: normFeat(r), by: `${a.name}: ${f.name}` });
        archFeats.push({ ...f, archetype: a.name, archetypeId: a.id });
      }
    }
    const replacedBy = (name) => {
      const n = normFeat(name);
      const hit = replaced.find((r) => replacesFeature(r.key, name));
      void n;
      return hit ? hit.by : '';
    };
    const feats = [];
    for (const f of c.def.features || []) {
      if (f.level > lvl) continue;
      const by = archs.length ? replacedBy(f.name) : '';
      if (by) { out.classFeatureList.push({ key: `${c.def.id}:${f.name}`, classId: c.def.id, className: c.def.name, name: f.name, kind: f.type, level: f.level, text: f.text, placement: 'hidden', replacedBy: by, note: '', value: '' }); continue; }
      feats.push({ ...f, key: `${c.def.id}:${f.name}` });
    }
    for (const f of archFeats) feats.push({ ...f, key: `${f.archetypeId}:${f.name}` });
    for (const p of pathsOf(c)) for (const f of p.powers || []) if (f.level <= lvl) feats.push({ ...f, archetype: p.name, key: `${p.id}:${f.name}` });
    for (const f of feats) {
      const ov = (d.classFeatures || {})[f.key] || {};
      const cleanName = String(f.name).replace(/\s*\((?:Ex|Su|Sp)(?:\s*(?:or|\/|,)\s*(?:Ex|Su|Sp))*\)\s*$/i, '');
      const hiddenDefault = HIDDEN_FEATURES.test(cleanName);
      // domain/bloodline powers that have their own statblock spot (Sp block, Resist line)
      const pathPower = pathsOf(c).some((p) => f.key.startsWith(`${p.id}:`));
      const pathHidden = pathPower && (f.type === 'Sp' || /(acid|cold|electricity|fire|sonic|energy) resistance$/i.test(f.name));
      const asFeat = (out.autoFeats || []).some((x) => featKey(x.name) === featKey(cleanName)) || (d.feats || []).some((x) => featKey(x.name) === featKey(cleanName));
      const placement = ov.placement || (hiddenDefault || pathHidden || asFeat ? 'hidden' : guessPlacement(f));
      const latest = f.archetype ? '' : (latestValue[normFeat(f.name)] || findLatest(latestValue, f.name));
      const value = latest ? (latest.match(/\(([^)]*)\)|\s([+-]?\d+d?\d*)$/) || [])[1] || (latest.match(/\s([+-]?\d+d?\d*)$/) || [])[1] : '';
      const entry = { key: f.key, classId: c.def.id, className: c.def.name, archetype: f.archetype || '', name: f.name, kind: f.type, level: f.level, text: f.text, placement, note: ov.note || '', value: value || '', showText: !!ov.showText, auto: (out.classEffectNotes || {})[`${c.def.id}:${f.name}`] || '' };
      out.classFeatureList.push(entry);
      const computedShort = (out.classShorts || {})[`${c.def.id}:${f.name}`];
      if (placement !== 'hidden') abilities.push({ name: cleanName, kind: f.type, placement, short: `${computedShort || `${cleanName.toLowerCase()}${value && !/^(ex|su|sp)( or (ex|su|sp))?$/i.test(value) ? ` (${value})` : ''}`}${ov.note ? ` (${ov.note})` : ''}`, text: ov.showText ? f.text : '', origin: c.def.name, classFeature: true, value });
    }
    // talents: limit from the class table ("Knight Talent" at 2nd, 4th…), minus talents an archetype replaces
    for (const g of talentDB[c.def.id] || []) {
      const base = g.perLevel && g.perLevel.length ? g.perLevel[Math.min(lvl, g.perLevel.length) - 1] : null;
      // talents an archetype takes away: "replaces the discoveries gained at 2nd and 6th levels" counts each level ≤ class level
      const stem = g.key.replace(/(ies|ys|s)$/, (m0) => (m0 === 'ies' ? 'y' : m0 === 'ys' ? 'y' : ''));
      let lost = 0;
      for (const f of archFeats) for (const r of f.replaces || []) {
        const rr = r.toLowerCase().replace(/discoveries/g, 'discovery').replace(/hexes/g, 'hex');
        if (!rr.includes(stem)) continue;
        const lv = [...rr.matchAll(/(\d+)(?:st|nd|rd|th)/g)].map((m0) => Number(m0[1])).filter((x) => x <= lvl);
        lost += lv.length ? lv.length : 1;
      }
      const allowed = base === null ? null : Math.max(0, base - lost);
      const chosen = (d.talents || []).filter((t) => t.classId === c.def.id && t.group === g.group);
      const pIds = pathsOf(c).map((p) => p.id);
      out.talentGroups.push({ classId: c.def.id, className: c.def.name, group: g.group, allowed, lost, chosen, items: g.byPath ? g.items.filter((x) => !x.path || pIds.includes(x.path)) : g.items, alsoFrom: g.alsoFrom || [], source: g.source, advanced: g.advanced, byPath: !!g.byPath, needsPath: !!g.byPath && !pIds.length });
      if (allowed !== null && chosen.length > allowed) out.warnings.push(`${g.group}: ${chosen.length} escolhidos, limite ${allowed} no nível ${lvl}.`);
      const inGroupLine = [];
      for (const t of chosen) {
        const info = g.items.find((x) => x.name === t.name) || (db.talentsByClass?.[c.def.id] || []).flatMap((x) => x.items).find((x) => x.name === t.name) || {};
        if (!t.placement || t.placement === 'group') inGroupLine.push(t.name + (t.note ? ` (${t.note})` : ''));
        else abilities.push({ name: t.name, kind: info.type || '', placement: t.placement, short: t.name.toLowerCase() + (t.note ? ` (${t.note})` : ''), text: t.showText ? info.text || '' : '', origin: g.group });
        if ((!t.placement || t.placement === 'group') && t.showText) abilities.push({ name: t.name, kind: info.type || '', placement: 'hidden', short: '', text: info.text || '', origin: g.group });
      }
      if (inGroupLine.length) abilities.push({ name: g.group, kind: '', placement: 'sq', short: `${g.group.toLowerCase()} [${inGroupLine.join(', ')}]`, text: '', origin: c.def.name, talentGroup: true });
    }
  }
  // limit breaks (NPC with limit breaks enabled, or class-built creatures if user enables)
  out.limitBreaks = [];
  if (d.limitBreaksEnabled) {
    const uses = limitBreakUses(hd) + resolveMods(mods.filter((x) => x.target === 'limitBreak'));
    for (const c of classes) for (const lb of c.def.limitBreaks || []) out.limitBreaks.push({ ...lb, className: c.def.name });
    out.limitBreakUses = uses;
  }
  // burst mode
  out.burst = [];
  if (isBossTier) {
    for (const b of d.burst || []) out.burst.push({ ...b, uses: b.uses || burstUses(hd), duration: b.duration || `${burstDuration(hd)} rounds` });
  }
  out.specialAbilities = abilities.map((a) => ({ ...a, short: fillTemplate(a.short, out), text: fillTemplate(a.text, out) }));
  // ---- legendary and lair actions ({dcCon}, {hd}… work in their texts too)
  const who = d.name || 'The creature';
  const lg = d.legendary;
  out.legendary = lg?.enabled ? {
    perRound: Number(lg.perRound) || 3,
    intro: fillTemplate(lg.intro || `${who} can take ${Number(lg.perRound) || 3} legendary actions, choosing from the options below. Only one legendary action can be used at a time and only at the end of another creature's turn. ${who} regains spent legendary actions at the start of its turn.`, out),
    actions: (lg.actions || []).filter((a) => a.name || a.text).map((a) => ({ ...a, cost: Number(a.cost) || 1, text: fillTemplate(a.text, out) })),
  } : null;
  const lr = d.lair;
  out.lair = lr?.enabled ? {
    initiative: Number(lr.initiative) || 20,
    intro: fillTemplate(lr.intro || `On initiative count ${Number(lr.initiative) || 20} (losing initiative ties), ${who} takes a lair action to cause one of the following effects; it can't use the same effect two rounds in a row.`, out),
    actions: (lr.actions || []).filter((a) => a.name || a.text).map((a) => ({ ...a, text: fillTemplate(a.text, out) })),
  } : null;

  // ---- CR & XP
  out.xp = xpForCR(crNum);

  // ---- NPC wealth
  out.heroic = classes.some((c) => c.def.kind !== 'basic');

  // ---- warnings
  if (out.skillPoints.used > out.skillPoints.available && abil.int !== null) out.warnings.push(`Graduações de perícia: ${out.skillPoints.used} usadas de ${out.skillPoints.available} disponíveis.`);
  for (const [n, r] of Object.entries(d.skills || {})) if (Number(r) > hd) out.warnings.push(`${n}: ${r} graduações excede o total de HD (${hd}).`);
  if (out.featsTaken > out.featBudget) out.warnings.push(`Feats: ${out.featSlotsUsed} escolhidos, ${out.featSlotsTotal} vagas (${out.featBudget} pelo HD${out.bonusFeatBudget ? ` + ${out.bonusFeatBudget} bônus de classe` : ''}).`);
  if (hd < 1) out.warnings.push('A criatura precisa de pelo menos 1 HD (racial ou de classe).');
  return out;
}


const HIDDEN_FEATURES = /^(ac bonus|unarmed strike|fast movement|rage powers?|hexe?s?|discovery|discoveries|magus arcana|ninja tricks?|mercy|mercies|cruelty|cruelties|revelations?|arcanist exploits?|ki powers?|slayer talents?|investigator talents?|vigilante talents?|social talents?|rogue talents?|animal companion .*|.*archetypes$|damage reduction|spellcasting|weapon proficienc(?:y|ies)|armor proficienc(?:y|ies)|armor and shield proficienc(?:y|ies)|domains?|bloodline|arcane school|mystery|spirit|bonus feats?|alchemy|deeds|ex-|weapon and armor proficienc(?:y|ies)|spells?|cantrips|orisons|jutsus|ninjutsus|class skills|code of conduct|ex-|alignment|songs?|limit breaks?|mp pool|favored|bonus languages|spellbooks?|adding spells|arcane spells and armor|elemental arcane schools|chaotic, evil|aura$|.* talents?$|.*arcana$)/i;
// does an archetype's "replaces …" text take away this class feature?
// "standard alchemist bomb" → Bomb; "armor training 1, 2" → Armor Training; "Limit Break (Kinetic Card)" → Limit Breaks
function replacesFeature(k, name) {
  if (!k) return false;
  // "the discoveries gained at 2nd and 6th levels": only some uses are lost (counted in the talent limit)
  if (/(gained|selected|received) at \d+(st|nd|rd|th)|\d+(st|nd|rd|th)[- ]level (discovery|talent|hex|arcana|rage power|bonus feat)/i.test(k)) return false;
  const n = normFeat(name);
  if (!n) return false;
  const kk = String(k).toLowerCase().replace(/[’']s\b/g, '').replace(/\s*\(.*?\)/g, '').replace(/\b(the|standard|class features?|ability|abilities|normal)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const sing = (x) => x.replace(/ies\b/g, 'y').replace(/(?<!s)s\b/g, '');
  const a = sing(kk);
  const b = sing(n);
  if (!a || !b) return false;
  if (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  if (b.length >= 4 && new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(a)) return true;
  return a.length > 3 && (b.startsWith(a) || a.startsWith(b));
}

function normFeat(n) {
  return String(n).replace(/\s*\(.*?\)/g, '').replace(/\s+[+-]?\d+(d\d+)?$/, '').replace(/\s+(I|II|III|IV|V)$/, '').trim().toLowerCase();
}
function findLatest(latest, name) {
  const n = normFeat(name);
  for (const [k, v] of Object.entries(latest)) if (k && (k.startsWith(n) || n.startsWith(k))) return v;
  return '';
}
const ATTACK_RE = /(channel|attack|strike|sneak|smite|lancer|jump|breath|bomb|blast|shot|slash|rage|challenge|lancet|fury|throw|stance of|flurry|kenki|blitz|leap|swoop|dive|cleave|charge|mark|technique|combo|bite)/i;
const DEFENSE_RE = /(bravery|trap sense|danger sense|evasion|uncanny dodge|fortification|defens|stalwart|resist|immun|reduction|ac bonus|bulwark|shield|protect|block|parry|endurance|resilien|ward|indestructible|dodge|mettle|guard)/i;
const ACTIVATED_RE = /\bas an? (standard|swift|move|full-round|immediate|free) action\b|\b\d+\/day\b|\btimes per day\b|\bonce per (day|round|encounter)\b/i;
function guessPlacement(f) {
  if (/^aura\b|^aura of /i.test(f.name)) return 'aura';
  if (DEFENSE_RE.test(f.name)) return 'defensive';
  if (ATTACK_RE.test(f.name)) return 'specialAttack';
  if (ACTIVATED_RE.test((f.text || '').slice(0, 600))) return 'specialAbility';
  return 'sq';
}
function pluralize(n) {
  if (!n) return n;
  const irregular = { hoof: 'hooves', foot: 'feet', tooth: 'teeth', 'tail slap': 'tail slaps', wolf: 'wolves' };
  const l = n.toLowerCase();
  if (irregular[l]) return irregular[l];
  if (/(s|x|ch|sh)$/.test(l)) return n + 'es';
  if (/[^aeiou]y$/.test(l)) return n.slice(0, -1) + 'ies';
  return n + 's';
}
function guessSkillAbility(name) {
  const base = SKILLS.find((s) => name.startsWith(s.name.split(' (')[0]));
  return base ? base.ability : 'int';
}

// ------------------------------------------------------------------ CR
// Monsters: chosen CR. NPCs: FFd20 rule (heroic = level − 1, basic = level − 2; PC wealth +1).
// feat name → feat entry, built once per feat list and system
const FEAT_INDEX = new WeakMap();
function featIndexFor(list, pf) {
  if (!list) return {};
  let e = FEAT_INDEX.get(list);
  if (!e) { e = {}; FEAT_INDEX.set(list, e); }
  const k = pf ? 'pf' : 'ff';
  if (!e[k]) {
    e[k] = {};
    // FFd20 creatures: the FFd20 version of a feat wins over the Pathfinder one with the same name
    for (const x of list) if (!(pf && x.source === 'FFd20')) { const key = featKey(x.name); if (!e[k][key] || (!pf && x.source === 'FFd20')) e[k][key] = x; }
  }
  return e[k];
}

export function computeCR(d, out) {
  if (d.crOverride !== null && d.crOverride !== undefined && d.crOverride !== '') return Number(d.crOverride);
  if (d.mode !== 'npc') {
    if (d.cr === null || d.cr === undefined) return null;
    const base = Number(d.cr);
    // monsters with class levels (PF1e Bestiary "Monsters with class levels"): +1 CR per level of a key class
    // (one that works with the monster's abilities), +1 per 2 levels otherwise (NPC classes count as non-key)
    let add = 0;
    for (const c of out.classes || []) add += c.def.kind !== 'basic' && c.key !== false ? Number(c.level) : Number(c.level) / 2;
    add = Math.floor(add);
    out.crBase = base;
    out.crFromClasses = add;
    if (!add) return base;
    return base < 1 ? Math.max(1, add) : base + add;
  }
  const lvl = out.classLevels + (out.racialHD || 0);
  if (!lvl) return null;
  const heroic = out.classes.some((c) => c.def.kind !== 'basic');
  const n = (heroic ? lvl - 1 : lvl - 2) + (d.pcWealth ? 1 : 0);
  const cr = n >= 1 ? n : n === 0 ? 0.5 : n === -1 ? 1 / 3 : 1 / 4;
  return cr;
}

// ------------------------------------------------------------------ CR analysis (monster creation sanity check)
export function crAnalysis(def, c) {
  const t = statsForCR(c.cr);
  if (!t) return null;
  const rows = [];
  const cmp = (label, val, target, tol, higherIsUp = true) => {
    if (val === null || val === undefined || Number.isNaN(val)) return;
    const diff = val - target;
    const status = Math.abs(diff) <= tol ? 'ok' : diff > 0 ? 'high' : 'low';
    rows.push({ label, val, target, diff, status, higherIsUp });
  };
  cmp('Hit Points', c.hp.avg, t.hp, Math.max(5, t.hp * 0.15));
  cmp('Armor Class', c.ac.ac, t.ac, 2);
  if (c.bestAttack !== null) cmp('Melhor ataque', c.bestAttack, t.highAtk, 2);
  if (c.fullAttackAvg) cmp('Dano médio (ataque total)', Math.round(c.fullAttackAvg), t.dmgHigh, Math.max(3, t.dmgHigh * 0.2));
  const saves = [c.saves.fort, c.saves.ref, c.saves.will].sort((a, b) => b - a);
  cmp('Melhor save', saves[0], t.goodSave, 2);
  cmp('Pior save', saves[2], t.poorSave, 2);
  return { target: t, rows };
}

// ------------------------------------------------------------------ how many spells a caster may pick
// PF1e: prepared casters → spells per day (with ability bonus and the domain slot); spontaneous casters → the class's
// "Spells Known" table. FFd20: each class says it in text ("begins play with 3 1st-level spells… plus his Intelligence
// modifier… gains two spells each level"; cantrips: "begin with 4 0-level spells and gain one every three levels").
const WORDN = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const wn = (x) => (Number(x) || WORDN[String(x).toLowerCase()] || 0);
const ABIL_WORD = { intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
export function ffSpellRule(cls) {
  const feats = cls.features || [];
  const all = feats.map((f) => ({ f, t: String(f.text || '') }));
  const main = all.find(({ t }) => /begins? play (?:with|knowing) (\w+) (?:1st|first)[- ]level/i.test(t));
  const rule = { start: 0, startLevel: 1, perLevel: 0, abilities: [], cantrips: null, extraLevels: [], open: false };
  if (main) {
    const t = main.t;
    // the first class level with spells (the feature's own level can be wrong: "Cha 12 for 2nd-level spells")
    rule.startLevel = (cls.levels || []).find((r) => (r.spellLevel || 0) > 0 || r.mp > 0)?.level || main.f.level || 1;
    rule.start = [...t.matchAll(/(?:begins? play (?:with|knowing)|and) (\w+) (?:1st|first)[- ]level/gi)].reduce((a, m) => a + wn(m[1]), 0);
    rule.abilities = [...t.matchAll(/equal to (?:his|her|their|its) (intelligence|wisdom|charisma) modifier/gi)].map((m) => ABIL_WORD[m[1].toLowerCase()]);
    const per = /(?:each|every) time [^.]*?attains? a new [^.]*?level, (?:he|she|they|it) gains? ([^.]*?) (?:of (?:his|her|their) choice )?to add/i.exec(t);
    if (per) rule.perLevel = [...per[1].matchAll(/\b(\d+|one|two|three|four)\b/gi)].reduce((a, m) => a + wn(m[1]), 0);
    if (/learn(?:s|ing)? (?:new spells )?from (?:creatures|monsters)|gain new spells from creatures/i.test(t)) rule.open = true;
  }
  for (const { f, t } of all) {
    const c = /begins? with (\w+) 0-level spells?[^.]*?(?:gains?|learns?) an additional 0-level spell every (\w+) levels/i.exec(t);
    if (c && !rule.cantrips) rule.cantrips = { start: wn(c[1]), every: wn(c[2]) };
    // "New Arcana": add one spell at 7th, and one more at 12th and 17th level
    if (/add (?:any )?one (?:\w+ )?spells? from the [\w ]+ list to (?:his|her|their) list of spells known/i.test(t)) {
      rule.extraLevels.push(f.level || 1, ...[...t.slice(t.search(/additional spell/i)).matchAll(/(\d+)(?:st|nd|rd|th)/g)].map((m) => Number(m[1])));
    }
  }
  return main ? rule : null;
}

function spellBudget(d, pfSpells, ffClasses, abil, db) {
  const spells = d.caster?.spells || [];
  const out = [];
  if (pfSpells.length) {
    pfSpells.forEach((p, i) => {
      const mine = spells.filter((x) => (x.classId ? x.classId === p.classId : i === 0) || pfSpells.length === 1);
      const table = (db.spellsKnown || {})[p.knownAs || p.classId];
      const known = p.spontaneous && table ? table[Math.min(p.cl, table.length) - 1] || {} : null;
      const levels = [...new Set([...Object.keys(p.perDay), ...Object.keys(known || {})])].map(Number).sort((a, b) => a - b);
      const rows = levels.map((lv) => {
        const limit = known ? (known[lv] ?? 0) : (p.perDay[lv] ?? 0); // the domain slot is filled with the domain spell automatically
        return { level: lv, limit: p.spontaneous && !known ? null : limit, perDay: p.perDay[lv] ?? null, chosen: mine.filter((x) => Number(x.level) === lv).length };
      });
      const over = mine.filter((x) => Number(x.level) > p.maxSL).length;
      out.push({ source: p.source || 'Conjuração própria', classId: p.classId, castsAs: p.castsAs, kind: p.spontaneous ? 'known' : 'prepared', rows, maxSL: p.maxSL, beyondMax: over, domainSlot: !!p.domainSlot, noTable: p.spontaneous && !known });
    });
    return out;
  }
  const ffMods = (k) => (abil[k] === null || abil[k] === undefined ? 0 : Math.floor((abil[k] - 10) / 2));
  ffClasses.filter((c) => c.def.caster).forEach((c, i, arr) => {
    const rule = ffSpellRule(c.def);
    if (!rule) return;
    const L = Number(c.level);
    const row = c.def.levels[Math.min(L, c.def.levels.length) - 1] || {};
    const maxSL = row.spellLevel || 0;
    const mine = spells.filter((x) => (x.classId ? x.classId === c.def.id : i === 0) || arr.length === 1);
    const total = L < rule.startLevel ? 0 : rule.start + rule.abilities.reduce((a, k) => a + Math.max(0, ffMods(k)), 0) + rule.perLevel * (L - rule.startLevel) + rule.extraLevels.filter((x) => x <= L).length;
    const rows = [{ level: 'all', limit: rule.open ? null : total, chosen: mine.filter((x) => Number(x.level) > 0).length }];
    if (rule.cantrips) rows.unshift({ level: 0, limit: rule.cantrips.start + Math.floor((L - 1) / (rule.cantrips.every || 99)), chosen: mine.filter((x) => Number(x.level) === 0).length });
    out.push({ source: c.def.name, classId: c.def.id, kind: 'ff', rows, maxSL, beyondMax: mine.filter((x) => Number(x.level) > maxSL).length, open: rule.open, perLevel: rule.perLevel, total });
  });
  return out;
}

// ------------------------------------------------------------------ archetypes that make a non-caster cast spells
// as = class whose spells-per-day table is used; list = spell lists; known = spells-known table (spontaneous);
// from = first class level with spells (the "as" table may start earlier)
export const ARCHETYPE_CASTING = {
  'pf-rogue--eldritch-scoundrel': { as: 'pf-magus', list: ['pf-wizard'], ability: 'int', spontaneous: false },
  'pf-fighter--child-of-acavna-and-amaznen': { as: 'pf-ranger', list: ['pf-bloodrager'], ability: 'int', spontaneous: false, from: 5 },
  'pf-vigilante--avenging-beast': { as: 'pf-hunter', list: ['pf-hunter'], ability: 'wis', spontaneous: true, known: 'pf-hunter' },
  'pf-vigilante--cabalist': { as: 'pf-magus', list: ['pf-witch'], ability: 'int', spontaneous: false, maxSL: 6 },
  'pf-vigilante--magical-child': { as: 'pf-summoner-unchained', list: ['pf-summoner-unchained'], ability: 'cha', spontaneous: true, known: 'pf-summoner-unchained' },
  'pf-vigilante--warlock': { as: 'pf-magus', list: ['pf-wizard'], ability: 'int', spontaneous: false, maxSL: 6 },
  'pf-vigilante--zealot': { as: 'pf-inquisitor', list: ['pf-inquisitor'], ability: 'wis', spontaneous: true, known: 'pf-inquisitor' },
};
function withArchetypeCasting(c, classesDB) {
  const ac = (c.archetypes || []).map((id) => ARCHETYPE_CASTING[id]).find(Boolean);
  const as = ac && classesDB[ac.as];
  if (!as || c.def.caster) return c;
  const levels = c.def.levels.map((r, i) => {
    const src = as.levels[Math.min(i, as.levels.length - 1)] || {};
    const on = r.level >= (ac.from || 1);
    return { ...r, spellsPerDay: on ? Object.fromEntries(Object.entries(src.spellsPerDay || {}).filter(([k]) => Number(k) <= (ac.maxSL || 9))) : {}, spellLevel: on ? Math.min(src.spellLevel || 0, ac.maxSL || 9) : 0 };
  });
  return { ...c, def: { ...c.def, caster: true, castingAbility: ac.ability, spontaneous: ac.spontaneous, levels, spellLists: ac.list, knownAs: ac.known || null, castsAs: as.name } };
}

// ------------------------------------------------------------------ monsters that cast without a class
// "custom": spontaneous or prepared, casting ability and progression (spells up to 9th / 6th / 4th level); the tables
// come from a class with that progression. "class": the Bestiary's "casts spells as a 7th-level sorcerer".
export const MONSTER_PROGRESSIONS = {
  9: { label: 'até 9º nível (como sorcerer/wizard/cleric)', spont: 'pf-sorcerer', prep: 'pf-wizard', list: { int: 'pf-wizard', wis: 'pf-cleric', cha: 'pf-sorcerer' } },
  6: { label: 'até 6º nível (como bard/magus/inquisitor)', spont: 'pf-bard', prep: 'pf-magus', list: { int: 'pf-magus', wis: 'pf-inquisitor', cha: 'pf-bard' } },
  4: { label: 'até 4º nível (como paladin/ranger)', spont: 'pf-bloodrager', prep: 'pf-paladin', list: { int: 'pf-bloodrager', wis: 'pf-ranger', cha: 'pf-paladin' } },
};
export function monsterCasting(d, db) {
  const k = d.caster || {};
  const level = Number(k.pfLevel) || 0;
  if (level <= 0) return null;
  const mode = k.pfMode || (k.pfClass ? 'class' : '');
  if (mode === 'class') {
    const asClass = k.pfClass && (db.classesById || {})[k.pfClass];
    return asClass ? { def: asClass, level, monster: true } : null;
  }
  if (mode !== 'custom') return null;
  const prog = MONSTER_PROGRESSIONS[k.pfProg || 9] || MONSTER_PROGRESSIONS[9];
  const spont = k.pfType !== 'prepared';
  const table = (db.classesById || {})[spont ? prog.spont : prog.prep];
  if (!table) return null;
  const ability = k.pfAbility || (spont ? 'cha' : 'int');
  const list = k.pfList || prog.list[ability];
  return { def: { ...table, id: 'monster', name: '', caster: true, castingAbility: ability, spontaneous: spont, domainSlots: false, spellLists: [list], knownAs: spont ? table.id : null }, level, monster: true };
}
