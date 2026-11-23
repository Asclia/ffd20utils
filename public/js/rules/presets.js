// Presets for quick entry. Everything here is editable after insertion.

// PF1e natural attacks (Bestiary, Medium damage). primary=false => secondary attack.
export const NATURAL_ATTACKS = [
  { name: 'bite', dice: '1d6', primary: true, dtype: 'B, P, S' },
  { name: 'claw', dice: '1d4', primary: true, count: 2, dtype: 'B, S' },
  { name: 'gore', dice: '1d6', primary: true, dtype: 'P' },
  { name: 'slam', dice: '1d4', primary: true, dtype: 'B' },
  { name: 'sting', dice: '1d4', primary: true, dtype: 'P' },
  { name: 'talon', dice: '1d4', primary: true, count: 2, dtype: 'S' },
  { name: 'hoof', dice: '1d4', primary: false, count: 2, dtype: 'B' },
  { name: 'tentacle', dice: '1d4', primary: false, dtype: 'B' },
  { name: 'wing', dice: '1d4', primary: false, count: 2, dtype: 'B' },
  { name: 'pincer', dice: '1d6', primary: false, count: 2, dtype: 'B' },
  { name: 'tail slap', dice: '1d6', primary: false, dtype: 'B' },
  { name: 'unarmed strike', dice: '1d3', primary: true, dtype: 'B', weaponLike: true },
];

// Common weapons (Medium). FFd20 uses PF1e weapons plus its own (see finalfantasyd20.com/equipment/weapons/).
export const WEAPONS = [
  { name: 'dagger', dice: '1d4', critRange: 19, critMult: 2, light: true, thrownOk: true },
  { name: 'short sword', dice: '1d6', critRange: 19, critMult: 2, light: true },
  { name: 'longsword', dice: '1d8', critRange: 19, critMult: 2 },
  { name: 'broadsword', dice: '2d4', critRange: 19, critMult: 2 },
  { name: 'katana', dice: '1d8', critRange: 18, critMult: 2 },
  { name: 'rapier', dice: '1d6', critRange: 18, critMult: 2, finesse: true },
  { name: 'scimitar', dice: '1d6', critRange: 18, critMult: 2 },
  { name: 'greatsword', dice: '2d6', critRange: 19, critMult: 2, hands: 'two' },
  { name: 'battleaxe', dice: '1d8', critRange: 20, critMult: 3 },
  { name: 'greataxe', dice: '1d12', critRange: 20, critMult: 3, hands: 'two' },
  { name: 'club', dice: '1d6', critRange: 20, critMult: 2 },
  { name: 'mace', dice: '1d8', critRange: 20, critMult: 2 },
  { name: 'morningstar', dice: '1d8', critRange: 20, critMult: 2 },
  { name: 'warhammer', dice: '1d8', critRange: 20, critMult: 3 },
  { name: 'greatclub', dice: '1d10', critRange: 20, critMult: 2, hands: 'two' },
  { name: 'quarterstaff', dice: '1d6', critRange: 20, critMult: 2, hands: 'two' },
  { name: 'spear', dice: '1d8', critRange: 20, critMult: 3, hands: 'two' },
  { name: 'longspear', dice: '1d8', critRange: 20, critMult: 3, hands: 'two', reach: true },
  { name: 'lance', dice: '1d8', critRange: 20, critMult: 3, reach: true },
  { name: 'halberd', dice: '1d10', critRange: 20, critMult: 3, hands: 'two' },
  { name: 'glaive', dice: '1d10', critRange: 20, critMult: 3, hands: 'two', reach: true },
  { name: 'scythe', dice: '2d4', critRange: 20, critMult: 4, hands: 'two' },
  { name: 'whip', dice: '1d3', critRange: 20, critMult: 2, reach: true, finesse: true },
  { name: 'sai', dice: '1d4', critRange: 20, critMult: 2, light: true },
  { name: 'kama', dice: '1d6', critRange: 20, critMult: 2, light: true },
  { name: 'shortbow', dice: '1d6', critRange: 20, critMult: 3, kind: 'ranged', range: '60 ft.' },
  { name: 'longbow', dice: '1d8', critRange: 20, critMult: 3, kind: 'ranged', range: '100 ft.' },
  { name: 'light crossbow', dice: '1d8', critRange: 19, critMult: 2, kind: 'ranged', range: '80 ft.' },
  { name: 'heavy crossbow', dice: '1d10', critRange: 19, critMult: 2, kind: 'ranged', range: '120 ft.' },
  { name: 'sling', dice: '1d4', critRange: 20, critMult: 2, kind: 'ranged', range: '50 ft.' },
  { name: 'javelin', dice: '1d6', critRange: 20, critMult: 2, kind: 'ranged', thrown: true, range: '30 ft.' },
  { name: 'shuriken', dice: '1d2', critRange: 20, critMult: 2, kind: 'ranged', thrown: true, range: '10 ft.' },
  { name: 'chakram', dice: '1d8', critRange: 20, critMult: 2, kind: 'ranged', thrown: true, range: '30 ft.' },
];

// The full Pathfinder list (public/data/pf-weapons.json, from the Archives of Nethys) is merged in at start-up;
// the entries above stay as the offline default and for FFd20-only names.
const PROF_PT = { simple: 'Simples', martial: 'Marciais', exotic: 'Exóticas', firearm: 'Armas de fogo' };
export function loadWeaponList(list) {
  const byName = new Map(WEAPONS.map((w) => [w.name, w]));
  for (const w of list || []) {
    byName.set(w.name, {
      name: w.name, dice: String(w.dice).split('/')[0], dice2: String(w.dice).includes('/') ? String(w.dice).split('/')[1] : '',
      critRange: w.critRange, critMult: w.critMult, light: !!w.light, hands: w.hands, kind: w.kind, range: w.range || '',
      finesse: !!w.finesse, thrown: !!w.thrown, thrownOk: !!w.thrownOk, reach: !!w.reach, price: w.price || 0,
      prof: w.prof, dtype: w.dtype || '', special: w.special || '', weight: w.weight || '',
    });
  }
  WEAPONS.splice(0, WEAPONS.length, ...[...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
}
export const weaponGroupLabel = (w) => PROF_PT[w.prof] || (w.kind === 'ranged' ? 'À distância' : 'Corpo a corpo');
// attack fields for a weapon preset (size-scaled damage dice)
export function weaponAttackFields(p, scale) {
  return { name: p.name, kind: p.kind || 'melee', dice: scale(p.dice), critRange: p.critRange, critMult: p.critMult, hands: p.hands || 'one', light: !!p.light,
    finesse: !!p.finesse, thrown: !!p.thrown, range: p.range || '', basePrice: p.price || 0, weight: parseFloat(p.weight) || 0 };
}


// Universal monster rules / FFd20 UMR templates. {placeholders} are filled by the engine:
// {hd} {dcCon} {dcCha} {dcWis} {dcMental} {cl} {burstUses} {burstDuration} {bombRadius}
export const ABILITY_TEMPLATES = [
  { name: 'Grab', kind: 'Ex', placement: 'specialAttack', short: 'grab', text: 'If the creature hits with the indicated attack, it deals normal damage and attempts to start a grapple as a free action without provoking an attack of opportunity.', attackRider: 'grab' },
  { name: 'Constrict', kind: 'Ex', placement: 'specialAttack', short: 'constrict (1d6+{str})', text: 'The creature deals the listed damage whenever it makes a successful grapple check, in addition to any other effects.' },
  { name: 'Pounce', kind: 'Ex', placement: 'specialAttack', short: 'pounce', text: 'When the creature makes a charge, it can make a full attack (including rake attacks if it has the rake ability).' },
  { name: 'Rake', kind: 'Ex', placement: 'specialAttack', short: 'rake (2 claws +0, 1d4+{str})', text: 'The creature gains extra natural attacks when it grapples its foe.' },
  { name: 'Rend', kind: 'Ex', placement: 'specialAttack', short: 'rend (2 claws, 1d6+{str})', text: 'If the creature hits with two or more claw attacks in 1 round, it latches onto the opponent’s body and tears the flesh, dealing the listed additional damage.' },
  { name: 'Trample', kind: 'Ex', placement: 'specialAttack', short: 'trample (2d6+{str}, DC {dcStr})', text: 'As a full-round action, the creature can overrun any creature at least one size smaller, dealing the listed damage. Targets may make an attack of opportunity at −4 or a Reflex save (DC {dcStr}) for half damage.' },
  { name: 'Breath Weapon', kind: 'Su', placement: 'specialAttack', short: 'breath weapon (30-ft. cone, {hd}d6 fire, DC {dcCon}, usable every 1d4 rounds)', text: 'The creature exhales a cone of elemental energy as a standard action. Reflex DC {dcCon} for half damage. Usable once every 1d4 rounds.' },
  { name: 'Frightful Presence', kind: 'Su', placement: 'aura', short: 'frightful presence (30 ft., DC {dcCha})', text: 'Creatures within range that see the creature attack or charge must succeed on a Will save (DC {dcCha}) or become shaken for 5d6 rounds.' },
  { name: 'Poison', kind: 'Ex', placement: 'specialAttack', short: 'poison', text: 'Bite—injury; save Fort DC {dcCon}; frequency 1/round for 6 rounds; effect Poisoned status (1d6 non-elemental per round); cure 1 save or Esuna/Antidote.' },
  { name: 'Regeneration', kind: 'Ex', placement: 'hidden', short: '', text: 'The creature heals damage each round like fast healing, but cannot die while regenerating unless damaged by the listed type (e.g. fire or holy).' },
  { name: 'Ferocity', kind: 'Ex', placement: 'defensive', short: 'ferocity', text: 'The creature remains conscious and can continue fighting even if its hit point total is below 0 (staggered, loses 1 hp per round).' },
  { name: 'Float', kind: 'Ex', placement: 'sq', short: 'float', text: 'The creature permanently hovers 5 feet above the ground; this cannot be dispelled.' },
  { name: 'Self-Destruct', kind: 'Ex', placement: 'specialAttack', short: 'self-destruct', text: 'Each successful physical attack against the creature makes it grow 1 ft. and gain +2 Str (1d6+4 rounds). After the 3rd successful physical hit, or when reduced to 0 hp by a physical attack, it explodes for {hd}d6 points of damage in a {bombRadius}-ft. burst (Reflex DC {dcCon} half).' },
  { name: 'Drench', kind: 'Ex', placement: 'specialAttack', short: 'drench (2d6 water, DC {dcCon})', text: 'On a hit the creature deals extra water damage; the target must succeed on a Reflex save (DC {dcCon}) or gain the Drenched status. Douses nonmagical flames and dispels magical fire (CL {hd}).' },
  { name: 'Blinder', kind: 'Ex', placement: 'specialAttack', short: 'blinder', text: 'On a hit, the target must succeed on a Fortitude save (DC {dcCon}) or be Blinded for 1d{con} rounds.' },
  { name: 'Contact Berserk', kind: 'Ex', placement: 'specialAttack', short: 'berserk (DC {dcCon})', text: 'Contact—injury; save Will DC {dcCon}; effect Berserk status for 1d4 rounds; cure Esuna or Remedy.' },
  { name: 'Contact Slow', kind: 'Ex', placement: 'specialAttack', short: 'slow (DC {dcCon})', text: 'Contact—injury; save Fort DC {dcCon}; effect Slow status for 1d4 rounds; cure Haste.' },
  { name: 'Beatdown', kind: 'Ex', placement: 'defensive', short: 'beatdown', text: 'When struck in melee, the creature may make an immediate counterattack with its primary natural attack, rolling double damage dice and adding double its Strength bonus.' },
  { name: 'Red Hot', kind: 'Ex', placement: 'defensive', short: 'red hot', text: 'After being critically hit in melee, the creature may make an immediate primary attack against the attacker.' },
  { name: 'Carrot', kind: 'Su', placement: 'sq', short: 'carrot', text: 'Every 1d4 rounds the creature heals itself (see the Carrot Chart by HD) plus its casting modifier.' },
  { name: 'Haste', kind: 'Su', placement: 'sq', short: 'haste', text: 'Once per day, after one round of combat, the creature hastes itself for 3 rounds as a free action.' },
  { name: 'Splinter', kind: 'Ex', placement: 'specialAttack', short: 'splinter (6d6, DC {dcCon})', text: 'As a free action every 1d4+1 rounds, the creature releases a 20-ft. burst of shards dealing 6d6 slashing damage (Reflex DC {dcCon} half).' },
  { name: 'Shell', kind: 'Ex', placement: 'defensive', short: 'shell', text: 'As a move action the creature retreats into its shell, gaining +8 AC and +4 on Reflex saves; it cannot move or attack while in its shell.' },
  { name: 'Mirrorskin', kind: 'Su', placement: 'defensive', short: 'mirrorskin', text: 'Hostile spells of 3rd level or lower targeting the creature are automatically reflected; other spells that fail to penetrate its SR have a 50% chance to be reflected.' },
  { name: 'Delay Buster', kind: 'Ex', placement: 'specialAttack', short: 'delay buster (DC {dcCon})', text: 'A creature hit by this melee attack takes a −20 penalty on initiative next round unless it succeeds on a Will save (DC {dcCon}).' },
  { name: 'Rush Attack', kind: 'Ex', placement: 'specialAttack', short: 'rush attack', text: 'As a full-round action the creature makes an attack that deals double damage; the target must succeed on a Fortitude save (DC {dcCon}) or become Berserk and take −20 on initiative.' },
  { name: 'Throat-Rip', kind: 'Ex', placement: 'specialAttack', short: 'throat-rip', text: 'As a full-round action the creature performs a coup de grace; the target must succeed on a Fortitude save (DC 10 + half the damage dealt) or die. Only Arise or Full-Life restore it.' },
  { name: 'Light Sensitivity', kind: 'Ex', placement: 'hidden', short: '', text: 'The creature is dazzled in areas of bright sunlight or within the radius of a daylight spell.' },
];

export const BURST_TEMPLATE = {
  name: 'Burst Mode', kind: 'Su',
  text: 'When reduced to 50% of its hit points or less, the creature enters Burst Mode as a swift action. While in Burst Mode it gains +4 on attack rolls and saving throws and its special attacks deal an extra die of damage.',
};

export const MOD_TARGETS = [
  ['ac', 'CA'], ['attack', 'Ataque (todos)'], ['attack.melee', 'Ataque corpo a corpo'], ['attack.ranged', 'Ataque à distância'],
  ['damage', 'Dano (todos)'], ['damage.melee', 'Dano corpo a corpo'], ['damage.ranged', 'Dano à distância'],
  ['saves', 'Todos os saves'], ['fort', 'Fortitude'], ['ref', 'Reflexos'], ['will', 'Vontade'],
  ['init', 'Iniciativa'], ['hp', 'PV'], ['mp', 'MP'], ['cmb', 'CMB'], ['cmd', 'CMD'], ['speed', 'Deslocamento (terrestre)'],
  ['spellDC', 'CD de magias'], ['concentration', 'Concentração'], ['sr', 'SR'], ['limitBreak', 'Usos de Limit Break'],
  ['str', 'For'], ['dex', 'Des'], ['con', 'Con'], ['int', 'Int'], ['wis', 'Sab'], ['cha', 'Car'], ['skills', 'Todas as perícias'],
];
export const BONUS_TYPES = ['untyped', 'dodge', 'deflection', 'natural', 'armor', 'shield', 'enhancement', 'insight', 'luck', 'morale', 'competence', 'circumstance', 'sacred', 'profane', 'racial', 'resistance', 'size'];
