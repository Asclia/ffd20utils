// Equipment: body slots, armor/shield, magic weapon properties, consumables.
// Item effects are read from the item description (FFd20 wording) into editable modifiers.
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const SLOTS = [
  ['head', 'Cabeça (head)'], ['headband', 'Testa (headband)'], ['eyes', 'Olhos (eyes)'], ['shoulders', 'Ombros (shoulders)'],
  ['neck', 'Pescoço (neck)'], ['chest', 'Peito (chest)'], ['body', 'Corpo (body)'], ['belt', 'Cintura (belt)'],
  ['wrists', 'Pulsos (wrists)'], ['hands', 'Mãos (hands)'], ['ring1', 'Anel 1'], ['ring2', 'Anel 2'], ['feet', 'Pés (feet)'],
];
export const slotKind = (slot) => (slot === 'ring1' || slot === 'ring2' ? 'ring' : slot);

// PF1e armor table (Core Rulebook). [name, type, bonus, maxDex, acp, price]
export const ARMORS = [
  ['padded', 'light', 1, 8, 0, 5], ['leather', 'light', 2, 6, 0, 10], ['studded leather', 'light', 3, 5, 1, 25], ['chain shirt', 'light', 4, 4, 2, 100],
  ['hide', 'medium', 4, 4, 3, 15], ['scale mail', 'medium', 5, 3, 4, 50], ['chainmail', 'medium', 6, 2, 5, 150], ['breastplate', 'medium', 6, 3, 4, 200],
  ['splint mail', 'heavy', 7, 0, 7, 200], ['banded mail', 'heavy', 7, 1, 6, 250], ['half-plate', 'heavy', 8, 0, 7, 600], ['full plate', 'heavy', 9, 1, 6, 1500],
].map(([name, type, bonus, maxDex, acp, price]) => ({ name, type, bonus, maxDex, acp, price }));
export const SHIELDS = [
  ['buckler', 1, null, 1, 5], ['light wooden shield', 1, null, 1, 3], ['light steel shield', 1, null, 1, 9],
  ['heavy wooden shield', 2, null, 2, 7], ['heavy steel shield', 2, null, 2, 20], ['tower shield', 4, 2, 10, 30],
].map(([name, bonus, maxDex, acp, price]) => ({ name, bonus, maxDex, acp, price }));

// Classic PF1e magic items (used by FFd20's own iconics, e.g. Fran: Belt of Incredible Dexterity, Ring of Protection).
const ABIL_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export function classicItems() {
  const out = [];
  const add = (slot, name, text, price) => out.push({ name, slot, text, price, source: 'Pathfinder' });
  for (const b of [2, 4, 6]) {
    add('belt', `Belt of Giant Strength +${b}`, `+${b} enhancement bonus to Strength.`, 4000 * b * b / 4);
    add('belt', `Belt of Incredible Dexterity +${b}`, `+${b} enhancement bonus to Dexterity.`, 4000 * b * b / 4);
    add('belt', `Belt of Mighty Constitution +${b}`, `+${b} enhancement bonus to Constitution.`, 4000 * b * b / 4);
    add('belt', `Belt of Physical Perfection +${b}`, `+${b} enhancement bonus to Strength, Dexterity and Constitution.`, [0, 0, 16000, 0, 64000, 0, 144000][b]);
    add('headband', `Headband of Vast Intelligence +${b}`, `+${b} enhancement bonus to Intelligence.`, 4000 * b * b / 4);
    add('headband', `Headband of Inspired Wisdom +${b}`, `+${b} enhancement bonus to Wisdom.`, 4000 * b * b / 4);
    add('headband', `Headband of Alluring Charisma +${b}`, `+${b} enhancement bonus to Charisma.`, 4000 * b * b / 4);
    add('headband', `Headband of Mental Superiority +${b}`, `+${b} enhancement bonus to Intelligence, Wisdom and Charisma.`, [0, 0, 16000, 0, 64000, 0, 144000][b]);
  }
  for (let b = 1; b <= 5; b++) {
    add('shoulders', `Cloak of Resistance +${b}`, `+${b} resistance bonus on all saving throws.`, 1000 * b * b);
    add('ring', `Ring of Protection +${b}`, `+${b} deflection bonus to AC.`, 2000 * b * b);
    add('neck', `Amulet of Natural Armor +${b}`, `+${b} enhancement bonus to natural armor.`, 2000 * b * b);
  }
  for (let b = 1; b <= 8; b++) add('wrists', `Bracers of Armor +${b}`, `+${b} armor bonus to AC.`, 1000 * b * b);
  add('feet', 'Boots of Speed', 'Haste status for up to 10 rounds per day.', 12000);
  add('feet', 'Boots of Striding and Springing', '+10 ft. enhancement bonus to base land speed and +5 competence bonus on Acrobatics.', 5500);
  add('eyes', 'Eyes of the Eagle', '+5 competence bonus on Perception.', 2500);
  add('ring', 'Ring of Feather Falling', 'Constant Choco Feather.', 2200);
  return out;
}

const ABIL_RE = '(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
const ABIL_KEY = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const STATUS_MAP = { petrify: 'petrification', confuse: 'confuse', 'confusion': 'confuse', blind: 'blind', poison: 'poison', silence: 'silence', sleep: 'sleep', curse: 'curse', doom: 'doom', slow: 'slow', stop: 'stop', frog: 'frog', mini: 'mini', berserk: 'berserk', sap: 'sap', zombie: 'zombie', immobilize: 'disable' };

// Reads FFd20/PF item text into effects. Everything returned stays editable in the UI.
export function parseItemEffects(text) {
  const t = String(text || '');
  const mods = [];
  const immunities = [];
  const strong = [];
  const feats = [];
  let rider = '';
  let fastHealing = '';
  const cond = /\b(only )?while (?:at )?(full health|\d+% health(?: or less)?)/i.exec(t);
  const condText = cond ? `while at ${cond[2]}` : '';
  const push = (target, value, type) => mods.push({ id: uid(), target, value, type, cond: condText });
  // ability enhancement: "+2 enhancement bonus to Strength and Constitution" / "Strength, Dexterity and Constitution"
  for (const m of t.matchAll(new RegExp(`\\+(\\d+) enhancement bonus to ${ABIL_RE}((?:,? (?:and )?${ABIL_RE})*)`, 'gi'))) {
    const names = [m[2], ...(m[3] || '').split(/,|\band\b/)].map((x) => x.trim().toLowerCase()).filter((x) => ABIL_KEY[x]);
    for (const n of names) push(ABIL_KEY[n], Number(m[1]), 'enhancement');
  }
  let m;
  if ((m = /\+(\d+) enhancement bonus to (?:their |your )?maximum hit points/i.exec(t))) push('hp', Number(m[1]), 'enhancement');
  if ((m = /\+(\d+) enhancement bonus to (?:their |your )?maximum magic points/i.exec(t))) push('mp', Number(m[1]), 'enhancement');
  if ((m = /\+(\d+) deflection bonus to (?:AC|Armor Class)/i.exec(t))) push('ac', Number(m[1]), 'deflection');
  if ((m = /\+(\d+) resistance bonus on (?:all )?saving throws/i.exec(t))) push('saves', Number(m[1]), 'resistance');
  if ((m = /\+(\d+) enhancement bonus to natural armor/i.exec(t))) push('ac', Number(m[1]), 'natural');
  if ((m = /\+(\d+) armor bonus to AC/i.exec(t))) push('ac', Number(m[1]), 'armor-item');
  if ((m = /\+(\d+)\s*ft\.? enhancement bonus to base land speed/i.exec(t))) push('speed', Number(m[1]), 'enhancement');
  for (const s of t.matchAll(/\+(\d+) (competence|insight|luck|morale|sacred) bonus (?:on|to) ([A-Z][A-Za-z ()]+?)(?: skill)?(?: checks)?(?:[.,;]|$)/g)) {
    const skill = s[3].trim();
    if (!/saving|attack|AC|damage/i.test(skill)) push(`skill:${skill}`, Number(s[1]), s[2]);
  }
  const imm = /prevents? the wearer from being inflicted (?:with|by) (.+?) status/i.exec(t);
  if (imm) for (const x of imm[1].split(/,|\band\b/)) { const k = x.trim().toLowerCase(); if (k) immunities.push(STATUS_MAP[k] || k); }
  const immune2 = /immune to ([A-Za-z]+) status/i.exec(t);
  if (immune2) immunities.push(STATUS_MAP[immune2[1].toLowerCase()] || immune2[1].toLowerCase());
  const half = /halves all (\w+) (?:elemental )?damage/i.exec(t);
  if (half) strong.push(half[1].toLowerCase());
  for (const f of t.matchAll(/grants? (?:the )?(?:wearer|wielder) the ([A-Z][\w' -]+?) feat/g)) feats.push(f[1].trim());
  for (const f of t.matchAll(/grant the wearer the ([A-Z][\w' -]+?) feat/g)) feats.push(f[1].trim());
  const rid = /adds? \+?(\d+d\d+) points of (\w+)(?: elemental)? damage to melee\/ranged weapon attacks/i.exec(t);
  if (rid) rider = `${rid[1]} ${rid[2].toLowerCase()}`;
  const fh = /Fast Healing (\d+)/i.exec(t);
  if (fh) fastHealing = fh[1] + (condText ? ` (${condText})` : '');
  return { mods, immunities: [...new Set(immunities)], strong, feats, rider, fastHealing };
}

export function makeItem(base, slot) {
  const eff = parseItemEffects(base.text);
  return { id: uid(), name: base.name, slot: slot || base.slot || 'slotless', text: base.text || '', price: base.price || 0, active: true, ...eff };
}

// "+1d6 shadow damage." style weapon property riders (unconditional ones only)
export function weaponSpecialRider(text) {
  const m = /^\+(\d+d\d+) (\w+) damage\.?$/i.exec(String(text || '').trim()) || /^\+(\d+d\d+) (\w+) damage[.,;]/i.exec(String(text || '').trim());
  if (!m || /versus|against|vs\.?/i.test(text.split(/[.;]/)[0])) return '';
  return `${m[1]} ${m[2].toLowerCase()}`;
}
export function specialBonus(cost) {
  const m = /^\+(\d+)$/.exec(String(cost || '').trim());
  return m ? Number(m[1]) : 0;
}
export function specialGil(cost) {
  const m = /^\+([\d,]+)$/.exec(String(cost || '').trim());
  const v = m ? Number(m[1].replace(/,/g, '')) : 0;
  return v >= 100 ? v : 0;
}

// ------------------------------------------------------------------ Pathfinder magic weapon / armor special abilities (Core Rulebook + common)
// text: "+1d6 fire damage." is read as a damage rider; keen doubles the threat range; armor mods apply to the wearer
const W = (name, cost, text, extra = {}) => ({ name, cost, text, source: 'Pathfinder', ...extra });
export const PF_WEAPON_SPECIALS = [
  W('Flaming', '+1', '+1d6 fire damage.'), W('Frost', '+1', '+1d6 cold damage.'), W('Shock', '+1', '+1d6 electricity damage.'), W('Corrosive', '+1', '+1d6 acid damage.'),
  W('Thundering', '+1', 'Extra sonic damage on a critical hit (+1d8 per multiplier step) and the target may be deafened.'),
  W('Flaming Burst', '+2', '+1d6 fire damage, +1d10 fire per crit multiplier step on a critical hit.'), W('Icy Burst', '+2', '+1d6 cold damage, +1d10 cold per crit multiplier step on a critical hit.'),
  W('Shocking Burst', '+2', '+1d6 electricity damage, +1d10 electricity per crit multiplier step on a critical hit.'), W('Corrosive Burst', '+2', '+1d6 acid damage, +1d10 acid per crit multiplier step on a critical hit.'),
  W('Keen', '+1', 'Doubles the threat range (slashing or piercing weapons).', { keen: true }),
  W('Holy', '+2', 'Good-aligned; +2d6 damage against evil creatures.'), W('Unholy', '+2', 'Evil-aligned; +2d6 damage against good creatures.'),
  W('Axiomatic', '+2', 'Lawful-aligned; +2d6 damage against chaotic creatures.'), W('Anarchic', '+2', 'Chaotic-aligned; +2d6 damage against lawful creatures.'),
  W('Bane', '+1', '+2 enhancement and +2d6 damage against the chosen creature type.'), W('Ghost Touch', '+1', 'Full damage against incorporeal creatures.'),
  W('Defending', '+1', 'Transfer some or all of the enhancement bonus to AC.'), W('Merciful', '+1', '+1d6 nonlethal damage; all damage is nonlethal.'),
  W('Returning', '+1', 'A thrown weapon flies back to the thrower.'), W('Seeking', '+1', 'Ranged; ignores miss chance from concealment.'), W('Distance', '+1', 'Ranged; doubles the range increment.'),
  W('Wounding', '+2', '1 point of bleed damage on a hit.'), W('Disruption', '+2', 'Undead hit must save (DC 14 Will) or be destroyed.'),
  W('Speed', '+3', 'One extra attack at the highest bonus on a full attack.', { extraAttack: true }), W('Brilliant Energy', '+4', 'Ignores nonliving matter (armor and shield bonuses).'),
  W('Dancing', '+4', 'Fights on its own for 4 rounds.'), W('Vorpal', '+5', 'Severs the head on a natural 20 confirmed critical (slashing).'),
  W('Agile', '+1', 'Use Dex instead of Str on damage rolls (light/finesse weapon with Weapon Finesse).'), W('Furious', '+1', '+2 enhancement while the wielder rages.'),
  W('Menacing', '+1', 'Flanking bonus becomes +4.'), W('Vicious', '+1', '+2d6 damage, and the wielder takes 1d6.'), W('Spell Storing', '+1', 'Stores one spell of up to 3rd level.'),
];
export const PF_ARMOR_SPECIALS = [
  W('Fortification (light)', '+1', '25% chance to negate critical hits and sneak attacks.'), W('Fortification (moderate)', '+3', '50% chance to negate critical hits and sneak attacks.'),
  W('Fortification (heavy)', '+5', '75% chance to negate critical hits and sneak attacks.'),
  W('Shadow', '+3,750', '+5 competence bonus on Stealth checks.', { mods: [{ target: 'skill:Stealth', value: 5, type: 'competence' }] }),
  W('Shadow, improved', '+15,000', '+10 competence bonus on Stealth checks.', { mods: [{ target: 'skill:Stealth', value: 10, type: 'competence' }] }),
  W('Slick', '+3,750', '+5 competence bonus on Escape Artist checks.', { mods: [{ target: 'skill:Escape Artist', value: 5, type: 'competence' }] }),
  W('Slick, improved', '+15,000', '+10 competence bonus on Escape Artist checks.', { mods: [{ target: 'skill:Escape Artist', value: 10, type: 'competence' }] }),
  W('Spell Resistance (13)', '+2', 'Spell resistance 13.', { sr: 13 }), W('Spell Resistance (15)', '+3', 'Spell resistance 15.', { sr: 15 }),
  W('Spell Resistance (17)', '+4', 'Spell resistance 17.', { sr: 17 }), W('Spell Resistance (19)', '+5', 'Spell resistance 19.', { sr: 19 }),
  W('Energy Resistance', '+18,000', 'Resist 10 against one energy type.', { resist: 10 }), W('Energy Resistance, improved', '+42,000', 'Resist 20 against one energy type.', { resist: 20 }),
  W('Energy Resistance, greater', '+66,000', 'Resist 30 against one energy type.', { resist: 30 }),
  W('Invulnerability', '+3', 'DR 5/magic.', { dr: '5/magic' }), W('Ghost Touch', '+3', 'Armor bonus counts against incorporeal touch attacks.'),
  W('Glamered', '+2,700', 'Can look like normal clothing.'), W('Light Fortification', '+1', '25% chance to negate critical hits.'),
  W('Bashing', '+1', 'Shield bash deals damage as a shield two sizes larger and +1 bonus.'), W('Arrow Catching', '+1', '+1 deflection AC against ranged attacks.', { mods: [{ target: 'ac', value: 1, type: 'deflection', cond: 'vs. ranged attacks' }] }),
  W('Arrow Deflection', '+2', 'Deflects one ranged attack per round.'), W('Animated', '+2', 'The shield floats and protects without being held.'),
  W('Reflecting', '+5', 'Reflects a spell back once per day.'), W('Determination', '+30,000', 'Breath of life once per day.'),
];
export function specialsFor(system, items = {}) {
  if (system === 'pf1e') return { weapon: PF_WEAPON_SPECIALS, armor: PF_ARMOR_SPECIALS };
  return { weapon: items.weaponSpecials || [], armor: items.armorSpecials || [] };
}

// ------------------------------------------------------------------ special materials (PF1e core + FFd20)
// weapon: cost(a) extra price, mw = counts as masterwork, dmg = damage modifier, rider(a) = extra damage text
// armor:  cost(type) extra price, maxDex/acp changes, lighter = counts as one category lighter, dr = DR n/— by type
export const WEAPON_MATERIALS = {
  '': { name: 'normal' },
  adamantine: { name: 'adamantine', cost: () => 3000, mw: true, note: 'Ignora dureza menor que 20; vence RD/adamantine.' },
  'cold iron': { name: 'cold iron', cost: (a) => Number(a.basePrice) || 0, note: 'Custo base dobrado; vence RD/cold iron (fadas, demônios).' },
  silver: { name: 'alchemical silver', label: 'silver', cost: (a) => (a.light ? 20 : a.hands === 'two' ? 180 : 90), dmg: -1, note: '−1 no dano; vence RD/silver.' },
  mithral: { name: 'mithral', cost: (a) => (a.light ? 1000 : a.hands === 'two' ? 4000 : 2000), mw: true, note: 'Metade do peso; conta como prata (sem o −1 no dano).' },
  darkwood: { name: 'darkwood', cost: (a) => (a.hands === 'two' ? 40 : 20), mw: true, note: 'Só armas de madeira; metade do peso.' },
  'living crystal': { name: 'living crystal', ff: true, cost: () => 1600, mw: true, rider: (a) => `${1 + (Number(a.enhancement) || 0)} bleed`, note: 'Sangramento 1 (+1 por bônus de melhoria); vence RD/crystal.' },
  'elemental crystal': { name: 'elemental crystal', ff: true, cost: () => 8300, mw: true, element: true, rider: (a) => `1d6${Number(a.enhancement) ? `+${Number(a.enhancement)}` : ''} ${a.materialElement || 'fire'}`, note: '+1d6 do elemento (+1 por bônus de melhoria); vence RD/crystal.' },
};
export const ARMOR_MATERIALS = {
  '': { name: 'normal' },
  adamantine: { name: 'adamantine', cost: (t) => ({ light: 5000, medium: 10000, heavy: 15000, shield: 2000 }[t] || 5000), mw: true, dr: (t) => ({ light: 1, medium: 2, heavy: 3 }[t] || 0), note: 'RD 1/— (leve), 2/— (média), 3/— (pesada).' },
  mithral: { name: 'mithral', cost: (t) => ({ light: 1000, medium: 4000, heavy: 9000, shield: 1000 }[t] || 1000), mw: true, maxDex: 2, acp: 3, lighter: true, note: 'Des máx. +2, penalidade −3, conta como uma categoria mais leve.' },
  dragonhide: { name: 'dragonhide', cost: (t, it) => Number(it.price) || 0, mw: true, note: 'Custo base dobrado; obra-prima.' },
  darkwood: { name: 'darkwood', cost: () => 50, mw: true, acp: 2, shieldOnly: true, note: 'Escudos de madeira: penalidade −2.' },
  'living crystal': { name: 'living crystal', ff: true, cost: () => 1300, mw: true, note: 'Obra-prima; dureza ×1,5.' },
  'elemental crystal': { name: 'elemental crystal', ff: true, cost: (t) => ({ light: 24150, medium: 26150, heavy: 30150, shield: 24150 }[t] || 24150), mw: true, element: true, resist: (it) => 5 + 5 * (Number(it.enh) || 0), note: 'Resistência 5 (+5 por bônus de melhoria) ao elemento.' },
};
export const armorKind = (it) => {
  const a = ARMORS.find((x) => x.name === String(it?.name || '').toLowerCase());
  return a ? a.type : Number(it?.bonus) >= 7 ? 'heavy' : Number(it?.bonus) >= 4 ? 'medium' : 'light';
};

// Prices (gil). PF1e: weapons 2000 × b², armor 1000 × b² (b = enhancement + special ability bonus), +masterwork.
export function weaponPrice(a, specialsDB = []) {
  const specials = (a.specials || []).map((n) => specialsDB.find((s) => s.name === n)).filter(Boolean);
  const b = (Number(a.enhancement) || 0) + specials.reduce((s, x) => s + specialBonus(x.cost), 0);
  const flat = specials.reduce((s, x) => s + specialGil(x.cost), 0);
  const base = Number(a.basePrice) || 0;
  const mat = WEAPON_MATERIALS[a.material || ''] || {};
  const matCost = mat.cost ? mat.cost(a) : 0;
  if (!b && !a.masterwork && !mat.mw) return base + flat + matCost;
  return base + (mat.mw ? 0 : 300) + 2000 * b * b + flat + matCost;
}
export function armorPrice(it, specialsDB = []) {
  if (!it) return 0;
  const specials = (it.specials || []).map((n) => specialsDB.find((s) => s.name === n)).filter(Boolean);
  const b = (Number(it.enh) || 0) + specials.reduce((s, x) => s + specialBonus(x.cost), 0);
  const flat = specials.reduce((s, x) => s + specialGil(x.cost), 0);
  const base = Number(it.price) || 0;
  const mat = ARMOR_MATERIALS[it.material || ''] || {};
  const matCost = mat.cost ? mat.cost(it.maxDex === null || it.maxDex === undefined || it.isShield ? 'shield' : armorKind(it), it) : 0;
  if (!b && !it.masterwork && !mat.mw) return base + flat + matCost;
  return base + (mat.mw ? 0 : 150) + 1000 * b * b + flat + matCost;
}

export const itemLabel = (prefix, name, specials) => `${prefix ? `+${prefix} ` : ''}${(specials || []).map((s) => s.toLowerCase()).join(' ')}${specials?.length ? ' ' : ''}${name}`;

export function emptyEquipment() {
  return { armor: null, shield: null, slots: {}, slotless: [], consumables: [], gil: 0 };
}

// Builds the "Combat Gear" / "Other Gear" strings and the total value.
export function gearSummary(d, db) {
  const eq = d.equipment || emptyEquipment();
  const sp = specialsFor(d.system, db?.items || {});
  const items = { ...(db?.items || {}), weaponSpecials: sp.weapon, armorSpecials: sp.armor };
  const other = [];
  let total = 0;
  for (const a of d.attacks || []) {
    if (a.natural || a.notGear) continue;
    const matW = a.material ? `${(WEAPON_MATERIALS[a.material]?.label || WEAPON_MATERIALS[a.material]?.name || a.material)} ` : '';
    const label = itemLabel(Number(a.enhancement) || 0, `${a.masterwork && !Number(a.enhancement) && !WEAPON_MATERIALS[a.material || '']?.mw ? 'masterwork ' : ''}${matW}${a.name}`, a.specials);
    other.push(label);
    total += weaponPrice(a, items.weaponSpecials);
  }
  for (const k of ['armor', 'shield']) {
    const it = eq[k];
    if (!it || !it.name) continue;
    const matA = it.material ? `${ARMOR_MATERIALS[it.material]?.name || it.material} ` : '';
    other.push(itemLabel(Number(it.enh) || 0, `${it.masterwork && !Number(it.enh) && !ARMOR_MATERIALS[it.material || '']?.mw ? 'masterwork ' : ''}${matA}${it.name}`, it.specials));
    total += armorPrice({ ...it, isShield: k === 'shield' }, items.armorSpecials);
  }
  for (const [slot] of SLOTS) {
    const it = eq.slots?.[slot];
    if (it?.name) { other.push(it.name); total += Number(it.price) || 0; }
  }
  for (const it of eq.slotless || []) if (it?.name) { other.push(it.name); total += Number(it.price) || 0; }
  const combat = [];
  for (const c of eq.consumables || []) {
    if (!c.name) continue;
    const q = Number(c.qty) || 1;
    combat.push(q > 1 ? `${c.name} (${q})` : c.name);
    total += (Number(c.price) || 0) * q;
  }
  if (Number(eq.gil)) { other.push(`${Number(eq.gil).toLocaleString('en-US')} ${d.system === 'pf1e' ? 'gp' : 'gil'}`); total += Number(eq.gil); }
  return { combat, other, total };
}
