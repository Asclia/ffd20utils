import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compute, newCreature, newAttack } from '../public/js/rules/engine.js';
import { buildStatblock, statblockHTML, statblockMarkdown } from '../public/js/rules/statblock.js';
import { makeItem, classicItems, parseItemEffects } from '../public/js/rules/equipment.js';
const classes = JSON.parse(readFileSync(new URL('../public/data/classes.json', import.meta.url)));
const races = JSON.parse(readFileSync(new URL('../public/data/races.json', import.meta.url)));
const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url)));
const archetypes = load('archetypes.json');
const db = { classesById: Object.fromEntries(classes.map((c) => [c.id, c])), racesById: Object.fromEntries(races.map((r) => [r.id, r])), homebrew: {},
  talentsByClass: load('talents.json'), archetypesById: Object.fromEntries(archetypes.map((a) => [a.id, a])), items: load('items.json') };
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok -', name); };

t('Knight 8 NPC (heroic): BAB, saves, HP, CR', () => {
  const d = newCreature('npc');
  d.raceId = 'hume'; d.raceBonus = 'str';
  d.abilities = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };
  d.classes = [{ classId: 'knight', level: 8 }];
  d.favored = 'none';
  const c = compute(d, db);
  assert.equal(c.bab, 8);
  assert.equal(c.abilities.str, 17);
  assert.equal(c.saves.fort, 6 + 2);   // table +6, Con 14
  assert.equal(c.saves.ref, 2 + 1);
  assert.equal(c.hp.avg, 12 + Math.floor(7 * 6.5) + 2 * 8); // max first d12 + avg + con
  assert.equal(c.cr, 7);
  assert.ok(c.classFeatureList.some((f) => f.name === 'Defensive Stance'));
});

t('Basic NPC CR = level − 2; level 1 = 1/3', () => {
  const d = newCreature('npc');
  d.classes = [{ classId: 'commonfolk', level: 3 }];
  assert.equal(compute(d, db).cr, 1);
  d.classes = [{ classId: 'commonfolk', level: 1 }];
  assert.equal(compute(d, db).cr, 1 / 3);
  d.classes = [{ classId: 'white-mage', level: 1 }];
  assert.equal(compute(d, db).cr, 0.5);
  d.pcWealth = true;
  assert.equal(compute(d, db).cr, 1);
});

t('Monster attack with Power Attack (BAB +5, Str 18 → +9; PA −2/+4)', () => {
  const d = newCreature('monster');
  d.type = 'magical-beast'; d.racialHD = 5; d.abilities.str = 18;
  const a = newAttack('melee', false); a.name = 'greataxe'; a.dice = '1d12'; a.critRange = 20; a.critMult = 3; a.hands = 'two';
  d.attacks = [a];
  let c = compute(d, db);
  assert.equal(c.bab, 5);
  assert.equal(c.attacks.melee[0], 'greataxe +9 (1d12+6/×3)');
  d.feats = [{ id: 'f1', name: 'Power Attack' }];
  d.toggles = { f1: true };
  c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'greataxe +7 (1d12+12/×3)');
});

t('Natural attacks: primary/secondary, single natural 1.5 Str', () => {
  const d = newCreature('monster');
  d.racialHD = 4; d.type = 'magical-beast'; d.abilities.str = 16;
  const bite = newAttack('melee', true); bite.name = 'bite'; bite.count = 1; bite.dice = '1d8';
  d.attacks = [bite];
  let c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'bite +7 (1d8+4)');
  const claws = newAttack('melee', true); claws.name = 'claw'; claws.count = 2; claws.dice = '1d6';
  const tail = newAttack('melee', true); tail.name = 'tail slap'; tail.primary = false; tail.count = 1; tail.dice = '1d6';
  d.attacks = [bite, claws, tail];
  c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'bite +7 (1d8+3), 2 claws +7 (1d6+3), tail slap +2 (1d6+1)');
});

t('Iterative attacks and Weapon Focus', () => {
  const d = newCreature('monster');
  d.type = 'outsider'; d.racialHD = 11; d.abilities.str = 14;
  const a = newAttack('melee', false); a.name = 'longsword';
  d.attacks = [a];
  d.feats = [{ id: 'x', name: 'Weapon Focus', param: 'longsword' }];
  const c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'longsword +14/+9/+4 (1d8+2/19–20)');
});

t('Undead: no Con, Cha to HP, absorbs shadow, weak holy', () => {
  const d = newCreature('monster');
  d.type = 'undead'; d.racialHD = 4; d.abilities.cha = 14;
  const c = compute(d, db);
  assert.equal(c.abilities.con, null);
  assert.equal(c.hp.avg, 18 + 8);
  assert.deepEqual(c.absorb, ['shadow']);
  assert.deepEqual(c.weak, ['holy']);
});

t('Boss: maximized dice and doubled HP, full BAB, good saves', () => {
  const d = newCreature('monster');
  d.type = 'undead'; d.racialHD = 10; d.abilities.cha = 24; d.boss = 'boss'; d.cr = 9;
  const c = compute(d, db);
  // Scarmiglione-style: 10d12+70 → 270 [380]
  assert.equal(c.hp.expr, '10d12+70');
  assert.equal(c.hp.avg, 270);
  assert.equal(c.hp.max, 380);
  assert.equal(c.bab, 10);
  assert.equal(c.saves.will, 7 + 0);
  assert.ok(c.immunities.includes('stop'));
});

t('Black Mage 5 MP = 8 + bonus 6 (Int 18)', () => {
  const d = newCreature('npc');
  d.raceId = 'tarutaru';
  d.abilities = { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 13 };
  d.classes = [{ classId: 'black-mage', level: 5 }];
  const c = compute(d, db);
  assert.equal(c.abilities.int, 18);
  assert.equal(c.mp.total, 14);
});

t('Monster caster tier (FC, 9 HD, boss column)', () => {
  const d = newCreature('monster');
  d.racialHD = 9; d.caster.tier = 'full'; d.caster.ability = 'int'; d.abilities.int = 16;
  let c = compute(d, db);
  assert.equal(c.mp.maxSL, 3);
  assert.equal(c.mp.total, 24 + 6);
  d.boss = 'boss';
  c = compute(d, db);
  assert.equal(c.mp.maxSL, 5);
});
t('Stat block: PF1e order, FFd20 hp/MP lines, markdown + HTML escaping', () => {
  const d = newCreature('monster');
  d.name = 'Bomb <b>x</b>'; d.type = 'outsider'; d.racialHD = 3; d.cr = 3; d.subtypes = ['bomb', 'fire'];
  d.caster.tier = 'full'; d.caster.ability = 'int'; d.abilities.int = 12;
  d.caster.spells = [{ id: 's', name: 'Fire', level: 1 }];
  const c = compute(d, db);
  const blocks = buildStatblock(d, c);
  const md = statblockMarkdown(blocks, d, c);
  const order = ['DEFENSE', 'OFFENSE', 'STATISTICS', 'SPECIAL ABILITIES'].map((x) => md.indexOf(`### ${x}`));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), 'section order');
  assert.match(md, /\*\*hp\*\* \d+ \[\d+\] \(3d10[+-]?\d*\)/);
  assert.match(md, /\*\*MP\*\* 4/); // 3 HD full caster: 3 MP + Int 12 bonus 1
  assert.match(md, /\*\*Immune\*\* fire/);
  assert.match(md, /\*\*Weaknesses\*\* water/);
  assert.match(md, /1st \(DC 12\)—Fire/);
  const h = statblockHTML(blocks);
  assert.ok(h.includes('Bomb &lt;b&gt;x&lt;/b&gt;'), 'user text is escaped');
});

t('Two-weapon fighting penalties and off-hand Str', () => {
  const d = newCreature('monster');
  d.type = 'humanoid'; d.racialHD = 6; d.abilities.str = 16;
  const main = newAttack('melee', false); main.name = 'short sword'; main.dice = '1d6'; main.light = true;
  const off = newAttack('melee', false); off.name = 'dagger'; off.dice = '1d4'; off.light = true; off.hands = 'off';
  d.attacks = [main, off];
  let c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'short sword +3 (1d6+3/19–20), dagger -1 (1d4+1/19–20)');
  d.feats = [{ id: 'twf', name: 'Two-Weapon Fighting' }];
  c = compute(d, db);
  assert.equal(c.attacks.melee[0], 'short sword +5 (1d6+3/19–20), dagger +5 (1d4+1/19–20)');
});
t('Equipment: magic weapon, armor, belt, ring, gear lines (Fran-like archer)', () => {
  const d = newCreature('npc');
  d.raceId = 'viera';
  d.abilities = { str: 12, dex: 15, con: 16, int: 12, wis: 12, cha: 10 };
  d.abilityAdjust.dex = 2;
  d.classes = [{ id: 'c', classId: 'archer', level: 10 }];
  const bow = newAttack('ranged', false); bow.name = 'longbow'; bow.dice = '1d8'; bow.critRange = 20; bow.critMult = 3; bow.enhancement = 3;
  d.attacks = [bow];
  const classic = classicItems();
  d.equipment.armor = { name: 'leather', bonus: 2, maxDex: 6, acp: 0, enh: 3, specials: [], price: 10 };
  d.equipment.slots.belt = makeItem(classic.find((x) => x.name === 'Belt of Incredible Dexterity +4'), 'belt');
  d.equipment.slots.ring1 = makeItem(classic.find((x) => x.name === 'Ring of Protection +2'), 'ring1');
  d.equipment.consumables = [{ id: 'p', name: 'Hi-Potion', qty: 2, price: 300 }];
  const c = compute(d, db);
  assert.equal(c.abilities.dex, 15 + 2 + 2 + 4);   // base + viera + level + belt
  assert.equal(c.ac.ac, 10 + 5 + 6 + 2);            // +5 armor, +6 Dex, +2 deflection
  assert.ok(c.ac.parts.some(([v, n]) => v === 2 && n === 'deflection'));
  assert.equal(c.attackDetails[0].att, 7 + 6 + 3); // BAB +7 (archer 10), Dex +6, +3 bow
  const md = statblockMarkdown(buildStatblock(d, c, db), d, c);
  assert.match(md, /\*\*Combat Gear\*\* Hi-Potion \(2\)/);
  assert.match(md, /\*\*Other Gear\*\* \+3 longbow, \+3 leather, Belt of Incredible Dexterity \+4, Ring of Protection \+2/);
});

t('FFd20 item text becomes effects (status immunity, weapon rider, conditional Str)', () => {
  const glass = parseItemEffects('This belt grants a +4 enhancement bonus to Strength and Constitution, and prevents the wearer from being inflicted with Poison status.');
  assert.deepEqual(glass.mods.map((m) => [m.target, m.value, m.type]), [['str', 4, 'enhancement'], ['con', 4, 'enhancement']]);
  assert.deepEqual(glass.immunities, ['poison']);
  assert.equal(parseItemEffects('This ring adds +1d6 points of fire elemental damage to melee/ranged weapon attacks.').rider, '1d6 fire');
  assert.equal(parseItemEffects('These gloves grant a +6 enhancement bonus to Strength but only while at full health.').mods[0].cond, 'while at full health');
  const d = newCreature('monster'); d.racialHD = 3;
  const sword = newAttack('melee', false); d.attacks = [sword];
  d.equipment.slots.ring1 = makeItem({ name: 'Fire Ring', text: 'This ring adds +1d6 points of fire elemental damage to melee/ranged weapon attacks.' }, 'ring1');
  d.equipment.slots.neck = makeItem({ name: 'Star Pendant', text: 'This pendant prevents the wearer from being inflicted with Poison status.' }, 'neck');
  const c = compute(d, db);
  assert.match(c.attacks.melee[0], /plus 1d6 fire\)$/);
  assert.ok(c.immunities.includes('poison'));
});

t('Archetype replaces class features; talents limited by level', () => {
  const d = newCreature('npc');
  d.classes = [{ id: 'k', classId: 'knight', level: 8, archetypes: ['knight-aggressor'] }];
  let c = compute(d, db);
  const names = c.classFeatureList.filter((f) => !f.replacedBy).map((f) => f.name);
  assert.ok(names.includes('Enhanced Intimidation'));
  assert.ok(!names.includes('Defend Ally'));
  assert.ok(c.classFeatureList.find((f) => f.name === 'Defend Ally').replacedBy.startsWith('Aggressor'));
  const g = c.talentGroups.find((x) => x.group === 'Knight Talents');
  assert.equal(g.allowed, 4);  // knight talents at 2, 4, 6, 8
  d.talents = ['Armored Bastion', 'Barricade'].map((name, i) => ({ id: String(i), classId: 'knight', group: 'Knight Talents', name, placement: 'group' }));
  c = compute(d, db);
  const md = statblockMarkdown(buildStatblock(d, c, db), d, c);
  assert.match(md, /knight talents \[Armored Bastion, Barricade\]/);
  assert.match(md, /Hume knight \(aggressor\) 8|knight \(aggressor\) 8/);
});

t('Special Abilities line sits under Special Attacks', () => {
  const d = newCreature('monster');
  d.racialHD = 4;
  d.abilitiesList = [{ id: 'a', name: 'Targeting Shot', kind: 'Ex', placement: 'specialAbility', short: 'targeting shot', text: '' },
    { id: 'b', name: 'Aim', kind: 'Ex', placement: 'specialAttack', short: 'aim (+3)', text: '' }];
  const md = statblockMarkdown(buildStatblock(d, compute(d, db), db), d, compute(d, db));
  const i = md.indexOf('**Special Attacks** aim (+3)');
  const j = md.indexOf('**Special Abilities** targeting shot');
  assert.ok(i > 0 && j > i, 'order');
});
t('Homebrew race: ability mods, size, senses, elements, modifiers, bonus feat', () => {
  const race = { id: 'hb-lunar', homebrew: true, name: 'Lunarian', size: 'Small', type: 'humanoid', subtypes: ['lunarian'], speed: 25,
    abilityMods: { dex: 2, wis: 2, str: -2 }, bonusFeat: true, senses: ['darkvision 60 ft.'], elements: { holy: 'strong', shadow: 'weak' },
    immunities: ['sleep'], mods: [{ id: 'm', target: 'skill:Perception', value: 2, type: 'racial' }],
    abilities: [{ id: 'a', name: 'Moonlit Step', kind: 'Su', placement: 'specialAbility', short: 'moonlit step', text: '' }] };
  const d = newCreature('npc');
  d.raceId = 'hb-lunar'; d.size = 'Small';
  d.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const c = compute(d, { ...db, homebrew: { races: [race] } });
  assert.equal(c.abilities.dex, 12); assert.equal(c.abilities.str, 8);
  assert.ok(c.senses.includes('darkvision 60 ft.'));
  assert.deepEqual(c.strong, ['holy']); assert.deepEqual(c.weak, ['shadow']);
  assert.ok(c.immunities.includes('sleep'));
  assert.equal(c.skills.find((x) => x.name === 'Perception').total, 3); // Wis 12 (+1) + 2 racial
  assert.equal(c.featBudget, 2);
  assert.ok(c.subtypes.some((x) => x.id === 'lunarian'));
  assert.ok(c.specialAbilities.some((x) => x.name === 'Moonlit Step' && x.placement === 'specialAbility'));
});
console.log(`${passed} tests passed`);
