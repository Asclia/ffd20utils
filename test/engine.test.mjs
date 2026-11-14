import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compute, newCreature, newAttack } from '../public/js/rules/engine.js';
import { buildStatblock, statblockHTML, statblockMarkdown } from '../public/js/rules/statblock.js';
const classes = JSON.parse(readFileSync(new URL('../public/data/classes.json', import.meta.url)));
const races = JSON.parse(readFileSync(new URL('../public/data/races.json', import.meta.url)));
const db = { classesById: Object.fromEntries(classes.map((c) => [c.id, c])), racesById: Object.fromEntries(races.map((r) => [r.id, r])), homebrew: {} };
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
console.log(`${passed} tests passed`);
