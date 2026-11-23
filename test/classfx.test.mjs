import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compute, newCreature, newAttack } from '../public/js/rules/engine.js';
import { buildStatblock, statblockMarkdown } from '../public/js/rules/statblock.js';
import { WEAPONS, loadWeaponList, weaponAttackFields } from '../public/js/rules/presets.js';
import { loadArmorList, ARMORS, weaponPrice, armorPrice } from '../public/js/rules/equipment.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const ff = load('classes.json').map((c) => ({ ...c, system: 'ffd20' }));
const pf = load('pf-classes.json').map((c) => ({ ...c, id: `pf-${c.id}`, system: 'pf1e' }));
const archetypes = [...load('archetypes.json'), ...load('pf-archetypes.json')];
const pfPaths = load('pf-paths.json');
const pfTalents = load('pf-talents.json');
const db = {
  classesById: Object.fromEntries([...ff, ...pf].map((c) => [c.id, c])),
  racesById: Object.fromEntries([...load('races.json'), ...load('pf-races.json')].map((r) => [r.id, r])),
  homebrew: {}, talentsByClass: load('talents.json'), archetypesById: Object.fromEntries(archetypes.map((a) => [a.id, a])),
  items: load('items.json'), feats: load('feats.json'), pathsByClass: pfPaths, spellsKnown: load('pf-spells-known.json'),
};
db.talentsByClass = { ...db.talentsByClass, ...pfTalents };
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const npc = (system, classId, level, extra = {}) => ({ ...newCreature('npc', system), abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 14 }, classes: [{ id: 'c1', classId, level }], ...extra });
const md = (d, c) => statblockMarkdown(buildStatblock(d, c, db), d, c);

t('fighter bonus feats raise the feat limit', () => {
  const d = npc('pf1e', 'pf-fighter', 6);
  let c = compute(d, db);
  assert.equal(c.bonusFeatBudget, 4); // 1st, 2nd, 4th, 6th
  assert.equal(c.featSlotsTotal, c.featBudget + 4);
  d.feats = ['Power Attack', 'Cleave', 'Weapon Focus', 'Toughness', 'Iron Will', 'Dodge', 'Improved Initiative', 'Great Fortitude'].map((name, i) => ({ id: `f${i}`, name, param: '', bonus: false }));
  c = compute(d, db);
  assert.equal(c.featBudget, 3 + 1); // HD 6 → 3, +1 human
  assert.equal(c.featsTaken, 4);     // 8 chosen, 4 go to the fighter bonus slots
  assert.ok(!c.warnings.some((w) => /Feats/.test(w)));
  d.feats.push({ id: 'x', name: 'Lightning Reflexes', param: '', bonus: false });
  assert.ok(compute(d, db).warnings.some((w) => /Feats/.test(w)));
});

t('fighter armor training and bravery', () => {
  const d = npc('pf1e', 'pf-fighter', 7);
  d.abilities.dex = 16;
  d.equipment.armor = { name: 'full plate', bonus: 9, maxDex: 1, acp: 6, enh: 0, specials: [], price: 1500 };
  const c = compute(d, db);
  assert.ok(c.ac.parts.some(([v, n]) => v === 3 && n === 'Dex')); // max Dex 1 + 2 (armor training 2 at 7th)
  assert.equal(c.acp, 4);
  assert.match(md(d, c), /\+2 Will vs\. fear|vs\. fear/);
});

t('PF monk: AC bonus, unarmed damage, fast movement, granted feats', () => {
  const d = npc('pf1e', 'pf-monk', 4);
  d.attacks = [{ ...newAttack('melee', false), name: 'unarmed strike', dice: '1d3' }];
  const c = compute(d, db);
  assert.equal(c.ac.ac, 10 + 2 + 2 + 1); // Dex +2, Wis +2, monk +1 at 4th
  assert.equal(c.speed.land, 40);
  assert.match(c.attacks.melee[0], /1d8/);
  assert.ok(c.feats.some((f) => f.name === 'Improved Unarmed Strike' && f.auto));
  d.equipment.armor = { name: 'leather', bonus: 2, maxDex: 6, acp: 0, enh: 0, specials: [], price: 10 };
  const c2 = compute(d, db);
  assert.equal(c2.ac.ac, 10 + 2 + 2); // armor turns the monk bonus off
  assert.equal(c2.speed.land, 30);
});

t('barbarian rage toggle changes Str, Con, Will and AC', () => {
  const d = npc('pf1e', 'pf-barbarian', 5);
  const off = compute(d, db);
  const key = off.combatToggles.find((x) => /Rage/.test(x.label)).key;
  const on = compute({ ...d, toggles: { [key]: true } }, db);
  assert.equal(on.abilities.str, off.abilities.str + 4);
  assert.equal(on.saves.will, off.saves.will + 2);
  assert.equal(on.ac.ac, off.ac.ac - 2);
  assert.equal(on.hp.avg, off.hp.avg + 2 * 5); // +4 Con = +2 hp per HD
});

t('paladin divine grace, FFd20 holy grace and immunities', () => {
  const p = compute(npc('pf1e', 'pf-paladin', 3), db);
  const base = compute(npc('pf1e', 'pf-paladin', 1), db);
  assert.equal(p.saves.fort - base.saves.fort, 1 + 2); // +1 class level, +2 Cha
  assert.ok(p.immunities.includes('fear') && p.immunities.includes('disease'));
  const f = compute(npc('ffd20', 'paladin', 7), db);
  assert.ok(f.immunities.includes('poison'));
});

t('FFd20 knight defensive stance and FFd20 monk unarmed', () => {
  const d = npc('ffd20', 'knight', 5);
  d.attacks = [{ ...newAttack('melee', false), name: 'longsword' }];
  const off = compute(d, db);
  const key = off.combatToggles.find((x) => /Defensive Stance/.test(x.label)).key;
  const on = compute({ ...d, toggles: { [key]: true } }, db);
  assert.equal(on.attackDetails[0].att, off.attackDetails[0].att + 2);
  assert.equal(on.ac.ac, off.ac.ac + 2);
  const m = npc('ffd20', 'monk', 5);
  m.attacks = [{ ...newAttack('melee', false), name: 'unarmed strike', dice: '1d3' }];
  const cm = compute(m, db);
  assert.ok(cm.feats.some((f) => f.name === 'Improved Unarmed Strike'));
  assert.match(cm.attacks.melee[0], /1d8/); // Martial Arts (1d6/1d8) → Medium 1d8
  assert.ok(cm.hp.avg > 0);
});

t('rogue trapfinding and thief skills', () => {
  const d = npc('pf1e', 'pf-rogue', 6);
  d.skills = { 'Disable Device': 6 };
  const c = compute(d, db);
  assert.equal(c.skills.find((s) => s.name === 'Disable Device').total, 6 + 3 + 2 + 3); // ranks, class, Dex, trapfinding ½ level
});

t('archetype class skills (Globetrotter adds Acrobatics)', () => {
  const d = npc('ffd20', 'astrologian', 3);
  d.skills = { Acrobatics: 3 };
  const before = compute(d, db).skills.find((s) => s.name === 'Acrobatics');
  d.classes[0].archetypes = ['astrologian-globetrotter'];
  const after = compute(d, db).skills.find((s) => s.name === 'Acrobatics');
  assert.equal(before.classSkill, false);
  assert.equal(after.classSkill, true);
});

t('racial traits: skills, saves, immunities, bonus feat and skill ranks', () => {
  const h = compute(npc('pf1e', 'pf-fighter', 1, { raceId: 'pf-halfling' }), db);
  const base = compute(npc('pf1e', 'pf-fighter', 1, { raceId: 'pf-human' }), db);
  assert.equal(h.saves.will - base.saves.will, 1); // halfling luck
  assert.equal(h.skills.find((s) => s.name === 'Perception').total - base.skills.find((s) => s.name === 'Perception').total, 2);
  assert.ok(h.saveNotes.some((n) => /fear/.test(n)));
  assert.equal(base.featBudget, 2);                // human bonus feat
  assert.equal(base.skillPoints.available, (2 + 0) + 1); // fighter 2 + Int 0, +1 human
  const elf = compute(npc('pf1e', 'pf-wizard', 1, { raceId: 'pf-elf' }), db);
  assert.ok(elf.immunities.includes('sleep'));
  const dwarf = compute(npc('pf1e', 'pf-fighter', 1, { raceId: 'pf-dwarf' }), db);
  assert.ok(dwarf.ac.notes.some((n) => /giant/.test(n)));
});

t('"ocultar descrição": Pounce stays in Special Attacks, no paragraph in Special Abilities', () => {
  const d = { ...newCreature('monster'), name: 'Coeurl' };
  d.abilitiesList = [{ id: 'p', name: 'Pounce', kind: 'Ex', placement: 'specialAttack', short: 'pounce', text: 'When a creature with this special attack makes a charge, it can make a full attack.' }];
  let out = md(d, compute(d, db));
  assert.match(out, /\*\*Special Attacks\*\* pounce/);
  assert.match(out, /\*\*Pounce \(Ex\)\*\*  \nWhen a creature/); // name on its own line, text below (default)
  assert.match(statblockMarkdown(buildStatblock(d, compute(d, db), db), d, compute(d, db), { abilityLayout: 'inline' }), /\*\*Pounce \(Ex\)\*\* When a creature/);
  d.hideAbilityText = { Pounce: true };
  out = md(d, compute(d, db));
  assert.match(out, /\*\*Special Attacks\*\* pounce/);
  assert.doesNotMatch(out, /\*\*Pounce \(Ex\)\*\*/);
});

t('Improved Natural Attack follows the d8 chain (2d8 → 3d8, 1d10 → 2d8, 1d8 → 2d6)', () => {
  for (const [dice, want] of [['2d8', '3d8'], ['1d10', '2d8'], ['1d8', '2d6'], ['2d6', '3d6']]) {
    const d = newCreature('monster');
    d.attacks = [{ ...newAttack('melee', true), name: 'bite', count: 1, dice }];
    d.feats = [{ id: 'ina', name: 'Improved Natural Attack', param: 'bite', bonus: false }];
    assert.match(compute(d, db).attacks.melee[0], new RegExp(`\\(${want}[+)]`), `${dice} → ${want}`);
  }
});

t('Legendary and Lair Actions sections', () => {
  const d = { ...newCreature('monster'), name: 'Bahamut', cr: 10 };
  d.legendary = { enabled: true, perRound: 3, intro: '', actions: [{ id: 'a', name: 'Tail Attack', cost: 1, text: 'Bahamut makes a tail attack.' }, { id: 'b', name: 'Mega Flare', cost: 3, text: 'Fire burst, DC {dcCon} Reflex half.' }] };
  d.lair = { enabled: true, initiative: 20, intro: '', actions: [{ id: 'c', name: '', text: 'Gravity crushes everyone in the lair.' }] };
  const c = compute(d, db);
  const out = md(d, c);
  assert.match(out, /\*\*Legendary Actions\*\* 3\/round/);
  assert.match(out, /### LEGENDARY ACTIONS\nBahamut can take 3 legendary actions/);
  assert.match(out, /\*\*Mega Flare \(Costs 3 Actions\)\*\*/);
  assert.match(out, new RegExp(`DC ${c.tpl.dcCon} Reflex`));
  assert.match(out, /### LAIR ACTIONS\nOn initiative count 20/);
  assert.match(out, /• Gravity crushes/);
  d.legendary.enabled = false; d.lair.enabled = false;
  assert.doesNotMatch(md(d, compute(d, db)), /LEGENDARY|LAIR/);
});

t('Manyshot and FFd20 archer Quick Shot', () => {
  const d = npc('pf1e', 'pf-fighter', 6);
  d.abilities.dex = 18;
  d.attacks = [{ ...newAttack('ranged', false), name: 'longbow', dice: '1d8', critRange: 20, critMult: 3, range: '100 ft.' }];
  d.feats = [{ id: 'ms', name: 'Manyshot', param: '', bonus: false }];
  d.toggles = { ms: true };
  assert.match(compute(d, db).attacks.ranged[0], /Manyshot: first attack fires two arrows/);
  const a = npc('ffd20', 'archer', 7);
  a.attacks = [{ ...newAttack('ranged', false), name: 'longbow', dice: '1d8', critRange: 20, critMult: 3 }];
  const c = compute(a, db);
  assert.match(c.attacks.ranged[0], /longbow ([+-]\d+)\/\1 /); // BAB +5: one attack + the Quick Shot extra at the same bonus
  const key = c.combatToggles.find((x) => /Quick Shot/.test(x.label)).key;
  assert.doesNotMatch(compute({ ...a, toggles: { [key]: false } }, db).attacks.ranged[0], /longbow ([+-]\d+)\/\1\//);
});

t('special materials: mithral armor, adamantine armor DR, silver and crystal weapons', () => {
  const d = npc('ffd20', 'fighter' in db.classesById ? 'fighter' : 'warrior', 4);
  d.abilities.dex = 18;
  d.equipment.armor = { name: 'breastplate', bonus: 6, maxDex: 3, acp: 4, enh: 0, specials: [], price: 200, material: 'mithral' };
  let c = compute(d, db);
  assert.ok(c.ac.parts.some(([v, n]) => v === 4 && n === 'Dex')); // max Dex 3 + 2 (+ armor training if any) ≥ 4
  assert.equal(c.armorType, 'light');                              // mithral medium armor counts as light
  d.equipment.armor.material = 'adamantine';
  c = compute(d, db);
  assert.match(c.dr, /2\/—/);
  d.attacks = [{ ...newAttack('melee', false), name: 'longsword', dice: '1d8', material: 'silver' }, { ...newAttack('melee', false), name: 'dagger', dice: '1d4', material: 'elemental crystal', materialElement: 'ice', enhancement: 1 }];
  c = compute(d, db);
  assert.match(c.attacks.melee[0], /silver longsword/);
  assert.match(c.attacks.melee[0], /plus 1d6\+1 ice/);
  const out = md(d, c);
  assert.match(out, /adamantine breastplate/);
});

t('Moogle in the Room house rules', () => {
  const hdb = { ...db, homebrew: { houseRules: { enabled: true, weaponGroups: true, finesse: true, agileManeuvers: true, combatOptions: true, unarmed: true, maneuvers: true, pointBlank: true, dodge: true, twf: true } } };
  const d = npc('pf1e', 'pf-fighter', 5);
  d.abilities.dex = 16; d.abilities.str = 10;
  d.attacks = [{ ...newAttack('melee', false), name: 'rapier', dice: '1d6', finesse: true }, { ...newAttack('melee', false), name: 'scimitar', dice: '1d6' }, { ...newAttack('melee', false), name: 'dagger', dice: '1d4', light: true }];
  d.feats = [{ id: 'wf', name: 'Weapon Focus', param: 'rapier', bonus: false }];
  const off = compute(d, db);
  const on = compute(d, hdb);
  assert.ok(on.attackDetails[0].att > off.attackDetails[0].att);  // Dex to hit without Weapon Finesse
  assert.equal(on.attackDetails[1].att, off.attackDetails[1].att);      // scimitar: heavy blade, not finesse → unchanged
  assert.equal(on.attackDetails[2].att - off.attackDetails[2].att, 1 + 3 - 1); // dagger: light blade → Weapon Focus (group) +1, Dex +3 instead of Str +1 (human +2 Str)
  assert.ok(on.cmb > off.cmb);                                     // Agile Maneuvers with a finesse weapon
  assert.ok(on.houseToggles.some((x) => /Power Attack/.test(x.label))); // Power Attack as a combat option
  const pa = compute({ ...d, toggles: { 'hr:power attack': true } }, hdb);
  assert.ok(pa.attackDetails[0].att < on.attackDetails[0].att);
  d.feats.push({ id: 'pa', name: 'Power Attack', param: '', bonus: false });
  assert.ok(compute(d, hdb).warnings.some((w) => /Power Attack não existe/.test(w)));
  const monk = compute(npc('pf1e', 'pf-monk', 1), hdb);
  assert.ok(monk.feats.some((f) => f.name === 'Unarmed Combatant') && !monk.feats.some((f) => f.name === 'Improved Unarmed Strike'));
});

t('inverted feat names from the PF index ("Weapon Focus, Greater") are automated', () => {
  const d = { ...newCreature('monster'), name: 'X' };
  d.attacks = [{ ...newAttack('melee', false), name: 'longsword', dice: '1d8', critRange: 19 }];
  const base = compute(d, db).attackDetails[0].att;
  d.feats = [{ id: 'a', name: 'Weapon Focus', param: 'longsword' }, { id: 'b', name: 'Weapon Focus, Greater', param: 'longsword' }, { id: 'c', name: 'Critical, Improved', param: 'longsword' }];
  const c = compute(d, db);
  assert.equal(c.attackDetails[0].att, base + 2);
  assert.match(c.attacks.melee[0], /17–20/);
  const out = md(d, c);
  assert.match(out, /Greater Weapon Focus \(longsword\)/);
  assert.match(out, /Improved Critical \(longsword\)/);
});

t('PF cleric domains: powers by level, domain spells, statblock line', () => {
  const d = npc('pf1e', 'pf-cleric', 6);
  d.classes[0].paths = ['domain-fire', 'domain-sun'];
  const c = compute(d, db);
  assert.ok(c.classFeatureList.some((f) => f.name === 'Fire Bolt'));
  assert.ok(c.classFeatureList.some((f) => f.name === 'Fire Resistance')); // 6th level power
  const out = md(d, c);
  assert.match(out, /burning hands\^D/);
  assert.match(out, /\*\*Domains\*\* Fire, Sun/);
});

t('PF sorcerer bloodline: bonus spells known, class skill, powers', () => {
  const d = npc('pf1e', 'pf-sorcerer', 5);
  d.classes[0].paths = ['bloodline-draconic'];
  const c = compute(d, db);
  assert.ok(c.skills.find((s) => s.name === 'Perception').classSkill);
  assert.ok(c.classFeatureList.some((f) => f.name === 'Claws'));
  const out = md(d, c);
  assert.match(out, /mage armor/i);
  assert.match(out, /resist energy/i);
  assert.match(out, /\*\*Bloodline\*\* draconic/);
});

t('PF talent groups with limits (rogue talents, rage powers)', () => {
  const r = compute(npc('pf1e', 'pf-rogue', 6), db);
  const g = r.talentGroups.find((x) => x.group === 'Rogue Talents');
  assert.equal(g.allowed, 3);
  assert.ok(g.items.length > 100);
  const b = compute(npc('pf1e', 'pf-barbarian', 4), db);
  assert.equal(b.talentGroups.find((x) => x.group === 'Rage Powers').allowed, 2);
});

t('monster with class levels: HD, BAB and CR (key class +1/level, other +1/2 levels)', () => {
  const d = { ...newCreature('monster', 'pf1e'), type: 'outsider', cr: 4, autoHD: false, racialHD: 4 };
  const base = compute(d, db);
  d.classes = [{ id: 'f', classId: 'pf-fighter', level: 3 }];
  const c = compute(d, db);
  assert.equal(c.hd, 7);
  assert.equal(c.bab, base.bab + 3);
  assert.equal(c.cr, 7);
  d.classes[0].key = false;
  assert.equal(compute(d, db).cr, 5);
  assert.ok(compute(d, db).feats !== undefined);
});

t('PF magic weapon abilities: keen doubles threat, flaming adds 1d6 fire', () => {
  const d = npc('pf1e', 'pf-fighter', 4);
  d.attacks = [{ ...newAttack('melee', false), name: 'longsword', dice: '1d8', critRange: 19, enhancement: 1, specials: ['Keen', 'Flaming'] }];
  const c = compute(d, db);
  assert.match(c.attacks.melee[0], /17–20/);
  assert.match(c.attacks.melee[0], /plus 1d6 fire/);
});

t('PF class feature texts are clean (no FAQ boxes)', () => {
  const cl = load('pf-classes.json').find((x) => x.id === 'cleric');
  assert.ok(!cl.features.some((f) => /^FAQ|Converting NPCs/.test(f.text)));
});

t('more FFd20 class features: anticipate danger, kinetic aura, ahead of time, duelist stance, toggles', () => {
  const a = compute(npc('ffd20', 'astrologian', 8), db);
  const a0 = compute(npc('ffd20', 'astrologian', 2), db);
  assert.ok(a.ac.parts.some(([v, n]) => v === 2 && n === 'dodge'));
  const t = compute(npc('ffd20', 'time-mage', 2), db);
  assert.equal(t.init, compute(npc('ffd20', 'time-mage', 1), db).init + 2);
  const p = compute(npc('ffd20', 'psychic', 11), db);
  assert.ok(p.ac.parts.some(([v, n]) => v === 2 && n === 'deflection'));
  const th = npc('ffd20', 'thief', 5);
  th.attacks = [{ ...newAttack('melee', false), name: 'dagger', dice: '1d4', light: true }];
  const off = compute(th, db);
  const key = off.combatToggles.find((x) => /Mark/.test(x.label)).key;
  assert.equal(compute({ ...th, toggles: { [key]: true } }, db).attackDetails[0].att, off.attackDetails[0].att + 2);
  void a0;
});

t('PF spell lists cover alchemist formulae, investigator and adept; spell info is available', () => {
  const spells = load('pf-spells.json');
  for (const c of ['alchemist', 'investigator', 'adept', 'cleric', 'wizard', 'bard']) assert.ok(spells.filter((x) => x.class === c).length > 50, c);
  const cure = spells.find((x) => x.name === 'Cure Light Wounds' && x.class === 'cleric');
  assert.equal(cure.level, 1);
  const info = load('pf-spell-info.json');
  assert.match(info.Fireball.school, /evocation/);
  assert.match(info.Fireball.save, /Reflex half/);
});

t('feats: full PF list with text, FFd20 benefits filled', () => {
  const f = load('feats.json');
  const pf = f.filter((x) => x.source === 'Pathfinder');
  assert.ok(pf.length > 3000);
  for (const n of ['Eschew Materials', 'Power Attack', 'Greater Weapon Focus']) assert.ok(pf.some((x) => x.name === n), n);
  assert.match(pf.find((x) => x.name === 'Power Attack').text, /Benefit/);
  const ffEmpty = f.filter((x) => x.source === 'FFd20' && (x.benefit || '').trim().length < 5);
  assert.ok(ffEmpty.length < 20, `FFd20 feats without benefit: ${ffEmpty.length}`);
});

t('archetype swaps: eldritch scoundrel (unchained rogue) has no uncanny dodge or danger sense', () => {
  for (const cls of ['pf-rogue-unchained', 'pf-rogue']) {
    const d = npc('pf1e', cls, 9);
    d.classes[0].archetypes = ['pf-rogue--eldritch-scoundrel'];
    const c = compute(d, db);
    const shown = c.classFeatureList.filter((f) => f.placement !== 'hidden').map((f) => f.name.toLowerCase());
    const gone = c.classFeatureList.filter((f) => f.replacedBy).map((f) => f.name.toLowerCase());
    for (const n of ['uncanny dodge', 'improved uncanny dodge']) assert.ok(gone.includes(n) && !shown.includes(n), `${cls}: ${n}`);
    assert.ok(gone.includes(cls.endsWith('unchained') ? 'danger sense' : 'trap sense'));
    assert.equal(c.classFeatureList.filter((f) => /^sneak attack$/i.test(f.name) && !f.replacedBy).length, 1); // the archetype's version only
    assert.ok(!/uncanny dodge/.test(md(d, c)));
    assert.match(md(d, c), /sneak attack \+2d6/); // 1d6 at 3rd, +1d6 at 7th, 11th…
  }
  // scroll scoundrel on the unchained rogue: pay it back replaces uncanny dodge, adaptive learning replaces danger sense
  const d = npc('pf1e', 'pf-rogue-unchained', 8);
  d.classes[0].archetypes = ['pf-rogue--scroll-scoundrel'];
  const gone = compute(d, db).classFeatureList.filter((f) => f.replacedBy).map((f) => f.name.toLowerCase());
  for (const n of ['uncanny dodge', 'improved uncanny dodge', 'danger sense']) assert.ok(gone.includes(n), n);
});

t('full PF weapon/armor lists and special materials', () => {
  loadWeaponList(load('pf-weapons.json'));
  loadArmorList(load('pf-armor.json'));
  assert.ok(WEAPONS.length > 300 && ARMORS.length > 40);
  const k = WEAPONS.find((w) => w.name === 'kukri');
  assert.deepEqual([k.dice, k.critRange, k.critMult, k.light, k.finesse, k.price], ['1d4', 18, 2, true, true, 8]);
  for (const n of ['katana', 'longsword', 'shortbow', 'heavy crossbow', 'chakram', 'whip', 'tri-bladed katar', 'shuriken', 'dwarven urgrosh']) assert.ok(WEAPONS.some((w) => w.name === n), n);
  const d = npc('pf1e', 'pf-rogue', 5);
  d.abilities.dex = 16;
  d.feats = [{ id: 'f', name: 'Weapon Finesse', param: '', bonus: false }];
  const a = { ...newAttack('melee', false), ...weaponAttackFields(k, (x) => x), id: 'k1' };
  d.attacks = [a];
  let c = compute(d, db);
  assert.match(c.attacks.melee[0], /kukri \+6 \(1d4\+3\/18–20\)/); // BAB 3 + Dex 3 (finesse); Str 16 (human +2)
  a.material = 'horacalcum';
  c = compute(d, db);
  assert.match(c.attacks.melee[0], /horacalcum kukri \+8/); // masterwork +1, circumstance +1
  assert.equal(weaponPrice(a), 8 + 6000);
  a.material = 'bone';
  assert.match(compute(d, db).attacks.melee[0], /bone kukri \+6 \(1d4\+1\//); // +3 −2
  assert.equal(weaponPrice(a), 4);
  a.material = 'siccatite (hot)';
  assert.match(compute(d, db).attacks.melee[0], /plus 1 fire/);
  // armor: eel hide studded leather → elec resist 2, max Dex +1; horacalcum full plate → +3 init
  d.attacks = [];
  const sl = ARMORS.find((x) => x.name === 'studded leather');
  d.equipment.armor = { ...sl, enh: 0, specials: [], material: 'eel hide' };
  c = compute(d, db);
  assert.match(md(d, c), /Resist\W* electricity 2/i);
  assert.equal(armorPrice(d.equipment.armor), 25 + 1200);
  const fp = ARMORS.find((x) => x.name === 'full plate');
  d.equipment.armor = { ...fp, enh: 0, specials: [], material: 'horacalcum' };
  assert.equal(compute(d, db).init, 3 + 3);
});

t('spell budget: how many spells a caster may pick at its level', () => {
  const run = (system, classId, level, abilities = {}, spells = []) => {
    const d = npc(system, classId, level, { abilities: { str: 10, dex: 12, con: 12, int: 16, wis: 14, cha: 16, ...abilities } });
    d.caster = { ...d.caster, spells: spells.map(([name, lv], i) => ({ id: `s${i}`, name, level: lv })) };
    return compute(d, db);
  };
  const rows = (c) => Object.fromEntries(c.spellBudget[0].rows.map((r) => [r.level, r.limit]));
  // PF spontaneous: the class's spells known table (sorcerer 7: 7/5/3/2)
  assert.deepEqual(rows(run('pf1e', 'pf-sorcerer', 7)), { 0: 7, 1: 5, 2: 3, 3: 2 });
  // PF prepared: spells per day + Int bonus (wizard 7, Int 16)
  assert.deepEqual(rows(run('pf1e', 'pf-wizard', 7)), { 0: 4, 1: 5, 2: 4, 3: 3, 4: 1 });
  // FFd20 black mage 5, Int 16: 3 + Int 3 + 2/level after 1st = 14; cantrips 4 + 1 every 3 levels = 5
  assert.deepEqual(rows(run('ffd20', 'black-mage', 5)), { 0: 5, all: 14 });
  // black mage 12: + New Arcana at 7th and 12th
  assert.equal(rows(run('ffd20', 'black-mage', 12)).all, 3 + 3 + 22 + 2);
  // scholar: black and white magic, Int and Wis
  assert.equal(rows(run('ffd20', 'scholar', 5)).all, 2 + 2 + 3 + 2 + 4 * 4);
  // too many → warning, like feats
  const c = run('pf1e', 'pf-sorcerer', 1, {}, [['magic missile', 1], ['shield', 1], ['sleep', 1]]);
  assert.ok(c.warnings.some((w) => /Magias de 1º nível \(Sorcerer\): 3 escolhidas, limite 2/.test(w)), c.warnings.join('; '));
});

console.log(`${passed} class-effect tests passed`);
