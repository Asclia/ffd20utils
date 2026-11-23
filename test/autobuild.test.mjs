import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compute, newCreature } from '../public/js/rules/engine.js';
import { buildStatblock, statblockMarkdown } from '../public/js/rules/statblock.js';
import { autoBuild, detectRole } from '../public/js/rules/autobuild.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const ffClasses = load('classes.json').map((c) => ({ ...c, system: 'ffd20' }));
const pfClasses = load('pf-classes.json').map((c) => ({ ...c, id: `pf-${c.id}`, system: 'pf1e' }));
const archetypes = [...load('archetypes.json'), ...load('pf-archetypes.json')];
const spells = [...load('spells.json'), ...load('pf-spells.json').map((x) => ({ ...x, class: `pf-${x.class}` }))];
const db = {
  classesById: Object.fromEntries([...ffClasses, ...pfClasses].map((c) => [c.id, c])),
  racesById: Object.fromEntries([...load('races.json'), ...load('pf-races.json')].map((r) => [r.id, r])),
  homebrew: {}, talentsByClass: load('talents.json'), archetypesById: Object.fromEntries(archetypes.map((a) => [a.id, a])),
  items: load('items.json'), feats: load('feats.json'), spells, spellsKnown: load('pf-spells-known.json'),
};
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };
const npc = (system, classId, level, extra = {}) => ({ ...newCreature('npc', system), classes: [{ id: 'c1', classId, level }], ...extra });

t('roles are detected from the class', () => {
  assert.equal(detectRole(compute(npc('ffd20', 'black-mage', 5), db)), 'int');
  assert.equal(detectRole(compute(npc('ffd20', 'knight', 5), db)), 'shield');
  assert.equal(detectRole(compute(npc('ffd20', 'archer', 5), db)), 'ranged');
  assert.equal(detectRole(compute(npc('pf1e', 'pf-cleric', 5), db)), 'wis');
  assert.equal(detectRole(compute(npc('pf1e', 'pf-fighter', 5), db)), 'melee');
});

t('FFd20 knight 8: full build is legal (feats, skills, gear within budget)', () => {
  const { def, role } = autoBuild(npc('ffd20', 'knight', 8), db, { seed: 7 });
  assert.equal(role, 'shield');
  const c = compute(def, db);
  assert.equal(def.abilities.str, 15);
  assert.equal(def.abilityAdjust.str, 2); // +1 at 4th and 8th
  assert.ok(c.featsTaken <= c.featBudget, `feats ${c.featsTaken}/${c.featBudget}`);
  assert.ok(def.feats.some((f) => f.name === 'Power Attack'));
  assert.ok(c.skillPoints.used <= c.skillPoints.available && c.skillPoints.used > 0);
  assert.ok(def.equipment.armor && def.equipment.shield, 'armor and shield');
  assert.ok(def.attacks.some((a) => a.name === 'longsword' && a.enhancement >= 1));
  assert.ok(Object.keys(def.equipment.slots).length >= 1, 'magic items');
  const sb = statblockMarkdown(buildStatblock(def, c, db), def, c);
  assert.match(sb, /longsword/);
  assert.match(sb, /Power Attack/);
});

t('PF fighter 6 gets bonus combat feats marked as bonus', () => {
  const { def } = autoBuild(npc('pf1e', 'pf-fighter', 6), db, { seed: 3 });
  const c = compute(def, db);
  assert.equal(def.feats.filter((f) => f.bonus).length, 4); // levels 1, 2, 4, 6
  assert.equal(c.featsTaken, c.featBudget);
  assert.ok(def.feats.some((f) => f.name === 'Weapon Specialization'));
});

t('PF wizard 5: spells per day filled from the wizard list, no armor', () => {
  const { def, role } = autoBuild(npc('pf1e', 'pf-wizard', 5), db, { seed: 11 });
  assert.equal(role, 'int');
  const c = compute(def, db);
  const byL = (L) => def.caster.spells.filter((s) => s.level === L).length;
  const ps = c.pfSpells[0];
  assert.equal(byL(3), ps.perDay[3]);
  assert.equal(byL(1), ps.perDay[1]);
  assert.ok(def.caster.spells.every((s) => s.classId === 'pf-wizard'));
  assert.equal(def.equipment.armor, null);
  assert.ok(def.feats.some((f) => f.name === 'Spell Focus'));
});

t('PF sorcerer 7 knows spells by the sorcerer table', () => {
  const { def } = autoBuild(npc('pf1e', 'pf-sorcerer', 7), db, { seed: 5 });
  const byL = (L) => def.caster.spells.filter((s) => s.level === L).length;
  assert.deepEqual([0, 1, 2, 3].map(byL), [7, 5, 3, 2]);
});

t('FFd20 black mage 6: spells known 3 + Int + 2/level, up to 3rd level', () => {
  const { def } = autoBuild(npc('ffd20', 'black-mage', 6), db, { seed: 9 });
  const c = compute(def, db);
  const lv = def.caster.spells.filter((s) => s.level > 0);
  assert.equal(lv.length, 3 + Math.floor((c.abilities.int - 10) / 2) + 10);
  assert.ok(Math.max(...lv.map((s) => s.level)) <= 3);
  assert.ok(def.feats.some((f) => f.name === 'Extra MP' || f.name === 'Elemental Focus'));
});

t('every class builds without errors at levels 1, 5 and 12', () => {
  for (const cl of [...ffClasses, ...pfClasses]) {
    for (const L of [1, 5, 12].filter((x) => x <= (cl.maxLevel || 20))) {
      const { def } = autoBuild(npc(cl.system, cl.id, L), db, { seed: L });
      const c = compute(def, db);
      assert.ok(c.featsTaken <= c.featBudget, `${cl.id} ${L}: feats`);
      assert.ok(c.skillPoints.used <= c.skillPoints.available || c.skillPoints.available <= 0, `${cl.id} ${L}: skills`);
    }
  }
});

t('PF archetype replaces class features (Fighter Archer replaces bravery)', () => {
  const d = npc('pf1e', 'pf-fighter', 5);
  d.classes[0].archetypes = ['pf-fighter--archer'];
  const c = compute(d, db);
  const bravery = c.classFeatureList.find((f) => f.name === 'Bravery');
  assert.ok(bravery && bravery.replacedBy, 'bravery replaced');
  assert.ok(c.classFeatureList.some((f) => f.name === 'Hawkeye'));
  assert.ok(!c.classFeatureList.some((f) => f.name === 'Volley'), 'level 17 feature not yet');
});

console.log(`${passed} autobuild tests passed`);
