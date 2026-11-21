// Automated feat effects. Keys are normalized feat names (lowercase, no parenthetical).
// Each entry can define:
//   param:   label for the feat's parameter (weapon, skill, school, element...)
//   toggle:  label of an on/off switch shown in the editor (combat options such as Power Attack)
//   mods(ctx, feat)            -> array of modifiers (see engine.js addMod)
//   attack(ctx, atk, feat, on) -> { att, dmg, critRange, diceSteps, extraAttacks } adjustments for one attack
//   note:    text shown in the editor describing what is automated
// ctx gives: bab, hd, cl, abil (scores), m (mods), skillRanks(name), size, isBoss ...
//
// Feats without an entry here are still listed in the stat block; their benefit text is shown
// in the editor so the GM can add a custom modifier if needed.

const steps = (bab) => 1 + Math.floor(Math.max(0, bab) / 4);
const matchWeapon = (atk, param) => {
  if (!param) return false;
  const p = param.toLowerCase().replace(/s$/, '').trim();
  const n = (atk.name || '').toLowerCase();
  return n.includes(p) || (typeof atk.weaponGroup === 'string' && atk.weaponGroup.toLowerCase().replace(/s$/, '') === p) || p === 'all' || (p === 'unarmed strike' && n.includes('unarmed'));
};
const skillPair = (a, b) => ({
  mods: (ctx) => [a, b].map((s) => ({ target: `skill:${s}`, value: ctx.skillRanks(s) >= 10 ? 4 : 2, type: 'untyped', source: 'feat' })),
  note: `+2 em ${a} e ${b} (+4 com 10 graduações).`,
});

export const FEAT_EFFECTS = {
  // ------------------------------------------------ combat options (toggles)
  'power attack': {
    toggle: 'Aplicar Power Attack',
    note: '−1 no ataque / +2 no dano a cada 4 de BAB (×1.5 em duas mãos, ×½ mão inábil/secundária).',
    attack(ctx, atk, f, on) {
      if (!on || atk.kind !== 'melee') return null;
      const s = steps(ctx.bab);
      let dmg = 2 * s;
      if (atk._dmgMult >= 1.5) dmg = 3 * s;
      else if (atk._dmgMult <= 0.5) dmg = s;
      return { att: -s, dmg };
    },
  },
  'deadly aim': {
    toggle: 'Aplicar Deadly Aim',
    note: '−1 no ataque / +2 no dano à distância a cada 4 de BAB.',
    attack(ctx, atk, f, on) {
      if (!on || atk.kind !== 'ranged') return null;
      const s = steps(ctx.bab);
      return { att: -s, dmg: 2 * s };
    },
  },
  'piranha strike': {
    toggle: 'Aplicar Piranha Strike',
    note: 'Armas leves/finesse: −1 ataque / +2 dano a cada 4 de BAB.',
    attack(ctx, atk, f, on) {
      if (!on || atk.kind !== 'melee' || !(atk.light || atk.finesse)) return null;
      const s = steps(ctx.bab);
      return { att: -s, dmg: atk._dmgMult <= 0.5 ? s : 2 * s };
    },
  },
  'combat expertise': {
    toggle: 'Aplicar Combat Expertise',
    note: '−1 no ataque corpo a corpo / +1 de esquiva na CA a cada 4 de BAB.',
    mods: (ctx, f, on) => (on ? [{ target: 'ac', value: steps(ctx.bab), type: 'dodge', source: 'Combat Expertise' }] : []),
    attack(ctx, atk, f, on) {
      if (!on || atk.kind !== 'melee') return null;
      return { att: -steps(ctx.bab) };
    },
  },
  'point-blank shot': {
    toggle: 'Alvo a até 30 ft. (Point-Blank Shot)',
    note: '+1 ataque e dano à distância a até 30 ft.',
    attack: (ctx, atk, f, on) => (on && atk.kind === 'ranged' ? { att: 1, dmg: 1 } : null),
  },
  // ------------------------------------------------ Moogle in the Room / Elephant in the Room feats
  'unarmed combatant': {
    note: 'Desarmado 1d6 (Médio)/1d4 (Pequeno), +2 para agarrar e +2 na DMC contra agarrar.',
    mods: () => [{ target: 'cmb', value: 2, cond: 'to grapple', source: 'Unarmed Combatant' }, { target: 'cmd', value: 2, cond: 'vs. grapple', source: 'Unarmed Combatant' }],
    attack: (ctx, atk) => (/unarmed/i.test(atk.name) && /^1d[23]$/.test(String(atk.dice)) ? { dice: '1d6' } : null),
  },
  'deft maneuvers': { note: '+2 em trip, disarm, dirty trick, reposition e steal; finta como ação de movimento.', mods: () => [{ target: 'cmb', value: 2, cond: 'to trip, disarm, dirty trick, reposition or steal', source: 'Deft Maneuvers' }] },
  'powerful maneuvers': { note: '+2 em bull rush, drag, overrun e sunder.', mods: () => [{ target: 'cmb', value: 2, cond: 'to bull rush, drag, overrun or sunder', source: 'Powerful Maneuvers' }] },
  manyshot: {
    toggle: 'Usar Manyshot',
    note: 'No ataque total com arco, o primeiro ataque dispara duas flechas (dano das duas se acertar; precisão e crítico só uma vez).',
    attack: (ctx, atk, f, on) => (on && atk.kind === 'ranged' && /bow/i.test(atk.name) && !/crossbow/i.test(atk.name) ? { note: 'Manyshot: first attack fires two arrows', extraDamageRolls: 1 } : null),
  },
  'rapid shot': {
    toggle: 'Usar Rapid Shot',
    note: 'Ataque à distância extra no ataque total; −2 em todos os ataques à distância.',
    attack: (ctx, atk, f, on) => (on && atk.kind === 'ranged' ? { att: -2, extraAttacks: 1 } : null),
  },
  'arcane strike': {
    toggle: 'Aplicar Arcane Strike',
    note: '+1 de dano com armas (+1 a cada 5 níveis de conjurador).',
    attack: (ctx, atk, f, on) => (on && !atk.natural ? { dmg: 1 + Math.floor(Math.max(0, ctx.cl) / 5) } : null),
  },
  lunge: {
    toggle: 'Usar Lunge',
    note: '+5 ft. de alcance; −2 na CA até o próximo turno.',
    mods: (ctx, f, on) => (on ? [{ target: 'ac', value: -2, type: 'untyped', source: 'Lunge' }] : []),
  },
  'fighting defensively': {
    toggle: 'Lutando defensivamente',
    mods: (ctx, f, on) => (on ? [{ target: 'ac', value: ctx.skillRanks('Acrobatics') >= 3 ? 3 : 2, type: 'dodge', source: 'defensive' }] : []),
    attack: (ctx, atk, f, on) => (on ? { att: -4 } : null),
  },
  // ------------------------------------------------ weapon feats (parameter)
  'weapon focus': { param: 'arma', note: '+1 de ataque com a arma escolhida.', attack: (ctx, atk, f) => (matchWeapon(atk, f.param) ? { att: 1 } : null) },
  'greater weapon focus': { param: 'arma', note: '+1 adicional de ataque com a arma escolhida.', attack: (ctx, atk, f) => (matchWeapon(atk, f.param) ? { att: 1 } : null) },
  'weapon specialization': { param: 'arma', note: '+2 de dano com a arma escolhida.', attack: (ctx, atk, f) => (matchWeapon(atk, f.param) ? { dmg: 2 } : null) },
  'greater weapon specialization': { param: 'arma', note: '+2 adicional de dano com a arma escolhida.', attack: (ctx, atk, f) => (matchWeapon(atk, f.param) ? { dmg: 2 } : null) },
  'improved critical': { param: 'arma', note: 'Dobra a margem de ameaça da arma escolhida.', attack: (ctx, atk, f) => (matchWeapon(atk, f.param) ? { doubleThreat: true } : null) },
  'improved natural attack': { param: 'ataque natural', note: 'Aumenta um passo o dado de dano do ataque natural escolhido.', attack: (ctx, atk, f) => (atk.natural && matchWeapon(atk, f.param) ? { diceSteps: 1 } : null) },
  'weapon finesse': { note: 'Usa Des no ataque com armas leves, finesse e naturais (se maior que For).', flag: 'finesse' },
  'multiattack': { note: 'Ataques naturais secundários sofrem −2 em vez de −5.', flag: 'multiattack' },
  'two-weapon fighting': { note: 'Reduz as penalidades de combate com duas armas (marque uma arma como "mão inábil").', flag: 'twf' },
  'improved two-weapon fighting': { note: 'Segundo ataque com a mão inábil (−5).', flag: 'itwf' },
  'greater two-weapon fighting': { note: 'Terceiro ataque com a mão inábil (−10).', flag: 'gtwf' },
  'double slice': { note: 'Força total no dano da mão inábil.', flag: 'doubleSlice' },
  'agile maneuvers': { note: 'Usa Des em vez de For no CMB.', flag: 'agileManeuvers' },
  'defensive combat training': { note: 'Usa HD total em vez de BAB no CMD.', flag: 'dct' },
  // ------------------------------------------------ defenses
  dodge: { note: '+1 de esquiva na CA.', mods: () => [{ target: 'ac', value: 1, type: 'dodge', source: 'Dodge' }] },
  'improved natural armor': { note: '+1 de armadura natural (cumulativo).', stack: true, mods: () => [{ target: 'ac', value: 1, type: 'natural-feat', source: 'Improved Natural Armor' }] },
  'shield focus': { note: '+1 no bônus de escudo na CA.', mods: () => [{ target: 'ac', value: 1, type: 'shield-feat', source: 'Shield Focus' }] },
  'greater shield focus': { note: '+1 adicional no bônus de escudo.', mods: () => [{ target: 'ac', value: 1, type: 'shield-feat2', source: 'Greater Shield Focus' }] },
  'armor focus': { note: '+1 no bônus de armadura (FFd20).', mods: () => [{ target: 'ac', value: 1, type: 'armor-feat', source: 'Armor Focus' }] },
  'greater armor focus': { note: '+1 adicional no bônus de armadura (FFd20).', mods: () => [{ target: 'ac', value: 1, type: 'armor-feat2', source: 'Greater Armor Focus' }] },
  'armor specialization': { note: 'DR 1/— (FFd20).', mods: () => [{ target: 'dr', value: 1, type: 'untyped', source: 'Armor Specialization', text: '—' }] },
  'greater armor specialization': { note: 'DR 3/— (FFd20, substitui Armor Specialization).', mods: () => [{ target: 'dr', value: 2, type: 'untyped', source: 'Greater Armor Specialization', text: '—' }] },
  toughness: { note: '+3 PV, ou +1 por HD acima de 3.', mods: (ctx) => [{ target: 'hp', value: Math.max(3, ctx.hd), type: 'untyped', source: 'Toughness' }] },
  'great fortitude': { note: '+2 em Fortitude.', mods: () => [{ target: 'fort', value: 2, type: 'untyped', source: 'feat' }] },
  'iron will': { note: '+2 em Vontade.', mods: () => [{ target: 'will', value: 2, type: 'untyped', source: 'feat' }] },
  'lightning reflexes': { note: '+2 em Reflexos.', mods: () => [{ target: 'ref', value: 2, type: 'untyped', source: 'feat' }] },
  'improved initiative': { note: '+4 de iniciativa.', mods: () => [{ target: 'init', value: 4, type: 'untyped', source: 'feat' }] },
  mobility: { note: '+4 de esquiva na CA contra ataques de oportunidade por movimento.', mods: () => [{ target: 'ac', value: 4, type: 'dodge', cond: 'vs. AoO from movement', source: 'Mobility' }] },
  fleet: { note: '+5 ft. no deslocamento base (armadura leve ou nenhuma).', stack: true, mods: () => [{ target: 'speed', value: 5, type: 'untyped', source: 'Fleet' }] },
  'combat casting': { note: '+4 em testes de concentração para conjurar defensivamente ou agarrado.', mods: () => [{ target: 'concentration', value: 4, type: 'untyped', cond: 'defensively or grappled', source: 'Combat Casting' }] },
  // ------------------------------------------------ skills
  alertness: skillPair('Perception', 'Sense Motive'),
  acrobatic: skillPair('Acrobatics', 'Fly'),
  athletic: skillPair('Climb', 'Swim'),
  deceitful: skillPair('Bluff', 'Disguise'),
  'deft hands': skillPair('Disable Device', 'Sleight of Hand'),
  'magical aptitude': skillPair('Spellcraft', 'Use Magic Device'),
  persuasive: skillPair('Diplomacy', 'Intimidate'),
  'self-sufficient': skillPair('Heal', 'Survival'),
  stealthy: skillPair('Escape Artist', 'Stealth'),
  'animal affinity': skillPair('Handle Animal', 'Ride'),
  'skill focus': {
    param: 'perícia', note: '+3 na perícia escolhida (+6 com 10 graduações).',
    mods: (ctx, f) => (f.param ? [{ target: `skill:${f.param}`, value: ctx.skillRanks(f.param) >= 10 ? 6 : 3, type: 'untyped', source: 'Skill Focus' }] : []),
  },
  'intimidating prowess': { note: 'Soma o mod. de For em Intimidate.', mods: (ctx) => [{ target: 'skill:Intimidate', value: Math.max(0, ctx.m.str), type: 'untyped', source: 'Intimidating Prowess' }] },
  // ------------------------------------------------ magic
  'spell focus': { param: 'escola', note: '+1 na CD das magias da escola escolhida.', mods: (ctx, f) => [{ target: 'spellDC', value: 1, type: 'untyped', cond: f.param ? `${f.param}` : 'chosen school', source: 'Spell Focus' }] },
  'greater spell focus': { param: 'escola', note: '+1 adicional na CD da escola escolhida.', mods: (ctx, f) => [{ target: 'spellDC', value: 1, type: 'untyped', cond: f.param ? `${f.param}` : 'chosen school', source: 'Greater Spell Focus' }] },
  'elemental focus': { param: 'elemento', note: '+1 na CD das magias do elemento escolhido (FFd20).', mods: (ctx, f) => [{ target: 'spellDC', value: 1, type: 'untyped', cond: f.param ? `${f.param} spells` : 'chosen element', source: 'Elemental Focus' }] },
  'greater elemental focus': { param: 'elemento', note: '+1 adicional na CD do elemento (FFd20).', mods: (ctx, f) => [{ target: 'spellDC', value: 1, type: 'untyped', cond: f.param ? `${f.param} spells` : 'chosen element', source: 'Greater Elemental Focus' }] },
  'spell penetration': { note: '+2 em testes de nível de conjurador contra SR.' },
  'extra mp': { note: '+1 MP, +1 a cada 2 níveis de conjurador (FFd20).', stack: true, mods: (ctx) => [{ target: 'mp', value: 1 + Math.floor(Math.max(0, ctx.cl) / 2), type: 'untyped', source: 'Extra MP' }] },
  'extra limit break': { note: '+1 uso diário de Limit Break.', stack: true, mods: () => [{ target: 'limitBreak', value: 1, type: 'untyped', source: 'Extra Limit Break' }] },
};

export function featKey(name) {
  return String(name || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}
export function featEffect(name) {
  return FEAT_EFFECTS[featKey(name)] || null;
}
