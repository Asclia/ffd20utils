import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compute, newCreature, newAttack } from '../public/js/rules/engine.js';
import { buildStatblock, statblockMarkdown } from '../public/js/rules/statblock.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const ff = load('classes.json').map((c) => ({ ...c, system: 'ffd20' }));
const pf = load('pf-classes.json').map((c) => ({ ...c, id: `pf-${c.id}`, system: 'pf1e' }));
const archetypes = [...load('archetypes.json'), ...load('pf-archetypes.json')];
const db = {
  classesById: Object.fromEntries([...ff, ...pf].map((c) => [c.id, c])),
  racesById: Object.fromEntries([...load('races.json'), ...load('pf-races.json')].map((r) => [r.id, r])),
  homebrew: {}, talentsByClass: load('talents.json'), archetypesById: Object.fromEntries(archetypes.map((a) => [a.id, a])),
  items: load('items.json'), feats: load('feats.json'),
};
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
  assert.match(out, /\*\*Pounce \(Ex\)\*\* When a creature/);
  d.hideAbilityText = { Pounce: true };
  out = md(d, compute(d, db));
  assert.match(out, /\*\*Special Attacks\*\* pounce/);
  assert.doesNotMatch(out, /\*\*Pounce \(Ex\)\*\*/);
});

console.log(`${passed} class-effect tests passed`);
