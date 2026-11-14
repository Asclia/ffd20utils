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

// Prices (gil). PF1e: weapons 2000 × b², armor 1000 × b² (b = enhancement + special ability bonus), +masterwork.
export function weaponPrice(a, specialsDB = []) {
  const specials = (a.specials || []).map((n) => specialsDB.find((s) => s.name === n)).filter(Boolean);
  const b = (Number(a.enhancement) || 0) + specials.reduce((s, x) => s + specialBonus(x.cost), 0);
  const flat = specials.reduce((s, x) => s + specialGil(x.cost), 0);
  const base = Number(a.basePrice) || 0;
  if (!b && !a.masterwork) return base + flat;
  return base + 300 + 2000 * b * b + flat;
}
export function armorPrice(it, specialsDB = []) {
  if (!it) return 0;
  const specials = (it.specials || []).map((n) => specialsDB.find((s) => s.name === n)).filter(Boolean);
  const b = (Number(it.enh) || 0) + specials.reduce((s, x) => s + specialBonus(x.cost), 0);
  const flat = specials.reduce((s, x) => s + specialGil(x.cost), 0);
  const base = Number(it.price) || 0;
  if (!b && !it.masterwork) return base + flat;
  return base + 150 + 1000 * b * b + flat;
}

export const itemLabel = (prefix, name, specials) => `${prefix ? `+${prefix} ` : ''}${(specials || []).map((s) => s.toLowerCase()).join(' ')}${specials?.length ? ' ' : ''}${name}`;

export function emptyEquipment() {
  return { armor: null, shield: null, slots: {}, slotless: [], consumables: [], gil: 0 };
}

// Builds the "Combat Gear" / "Other Gear" strings and the total value.
export function gearSummary(d, db) {
  const eq = d.equipment || emptyEquipment();
  const items = db?.items || {};
  const other = [];
  let total = 0;
  for (const a of d.attacks || []) {
    if (a.natural || a.notGear) continue;
    const label = itemLabel(Number(a.enhancement) || 0, `${a.masterwork && !Number(a.enhancement) ? 'masterwork ' : ''}${a.name}`, a.specials);
    other.push(label);
    total += weaponPrice(a, items.weaponSpecials);
  }
  for (const k of ['armor', 'shield']) {
    const it = eq[k];
    if (!it || !it.name) continue;
    other.push(itemLabel(Number(it.enh) || 0, `${it.masterwork && !Number(it.enh) ? 'masterwork ' : ''}${it.name}`, it.specials));
    total += armorPrice(it, items.armorSpecials);
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
  if (Number(eq.gil)) { other.push(`${Number(eq.gil).toLocaleString('en-US')} gil`); total += Number(eq.gil); }
  return { combat, other, total };
}
