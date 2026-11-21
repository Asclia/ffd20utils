// "Moogle in the Room" (FFd20, finalfantasyd20.com/system-rules/optional-systems/moogle-in-the-room/) —
// the FFd20 version of "Elephant in the Room" (Pathfinder feat-tax removal). Each rule can be turned on separately;
// they are stored in the homebrew document (synced with the library folder).

export const HOUSE_RULES = [
  ['weaponGroups', 'Martial Mastery', 'Weapon Focus, Specialization, Improved Critical etc. valem para o grupo de armas inteiro.'],
  ['finesse', 'Weapon Finesse', 'Todos usam Des no ataque com armas leves/finesse, sem feat.'],
  ['agileManeuvers', 'Agile Maneuvers', 'CMB usa Des ao empunhar arma finesse (For nas outras).'],
  ['combatOptions', 'Power Attack, Deadly Aim, Piranha Strike, Combat Expertise', 'Viram opções de combate para quem tem BAB +1 (sem feat).'],
  ['unarmed', 'Unarmed Combatant', 'Improved Unarmed Strike e Improved Grapple viram Unarmed Combatant.'],
  ['maneuvers', 'Deft / Powerful Maneuvers', 'Improved Trip/Disarm/Dirty Trick/Feint/Reposition/Steal viram Deft Maneuvers; Improved Bull Rush/Drag/Overrun/Sunder viram Powerful Maneuvers.'],
  ['pointBlank', 'Point-Blank Shot', 'Some; Precise Shot passa a ser o pré-requisito dos feats de arco.'],
  ['dodge', 'Dodge + Mobility', 'Mobility (e Improved Dodge) fundidos em Dodge.'],
  ['twf', 'Two-Weapon Fighting', 'Improved TWF fundido em Greater TWF (BAB +6: 2º ataque; BAB +11: 3º).'],
  ['empoweredTouch', 'Empowered Touch', 'Vira opção para conjuradores com CL 1+ (FFd20).'],
];
export const defaultHouseRules = () => ({ enabled: false, ...Object.fromEntries(HOUSE_RULES.map(([k]) => [k, true])) });

export function activeHouseRules(db) {
  const h = db?.homebrew?.houseRules;
  if (!h?.enabled) return null;
  return { ...defaultHouseRules(), ...h };
}

// feats that no longer exist under each rule → what replaces them
const GONE = [
  ['weaponGroups', /^martial mastery$/, ''],
  ['finesse', /^weapon finesse$/, 'opção para todos'],
  ['agileManeuvers', /^agile maneuvers$/, 'automático com arma finesse'],
  ['combatOptions', /^(power attack|deadly aim|piranha strike|combat expertise)$/, 'opção de combate (Estados de combate)'],
  ['unarmed', /^improved (unarmed strike|grapple)$/, 'Unarmed Combatant'],
  ['maneuvers', /^improved (trip|disarm|dirty trick|feint|reposition|steal)$/, 'Deft Maneuvers'],
  ['maneuvers', /^improved (bull rush|drag|overrun|sunder)$/, 'Powerful Maneuvers'],
  ['pointBlank', /^point[- ]blank shot$/, 'Precise Shot'],
  ['dodge', /^(mobility|improved dodge)$/, 'Dodge'],
  ['twf', /^improved two-weapon fighting$/, 'Greater Two-Weapon Fighting'],
  ['empoweredTouch', /^empowered touch$/, 'opção para conjuradores'],
];
export function goneFeat(rules, name) {
  if (!rules) return null;
  const n = String(name || '').toLowerCase().replace(/\s*\(.*\)$/, '').trim();
  for (const [k, re, by] of GONE) if (rules[k] && re.test(n)) return { by };
  return null;
}

// new feats introduced by the rules (shown in the feat picker)
export const HOUSE_FEATS = [
  { name: 'Unarmed Combatant', rule: 'unarmed', source: 'Moogle in the Room', category: 'combat', prerequisites: 'Dex 13', benefit: 'Armed while unarmed; unarmed strikes deal 1d6 (Medium) lethal or nonlethal; no AoO to grapple; +2 to grapple and +2 CMD vs. grapple.' },
  { name: 'Deft Maneuvers', rule: 'maneuvers', source: 'Moogle in the Room', category: 'combat', prerequisites: '', benefit: 'No AoO and +2 on trip, disarm, dirty trick, reposition and steal; feint as a move action.' },
  { name: 'Powerful Maneuvers', rule: 'maneuvers', source: 'Moogle in the Room', category: 'combat', prerequisites: '', benefit: 'No AoO and +2 on bull rush, drag, overrun and sunder.' },
];
export const COMBAT_OPTIONS = ['Power Attack', 'Deadly Aim', 'Piranha Strike', 'Combat Expertise'];
