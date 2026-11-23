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
  endurance: { note: '+4 em testes contra fadiga, calor/frio, sufocamento, fome e sede.', mods: () => [{ target: 'fort', value: 4, cond: 'vs. hot/cold environments, suffocation, starvation and thirst', source: 'Endurance' }] },
  'critical focus': { note: '+4 para confirmar críticos.', mods: () => [{ target: 'attack', value: 4, cond: 'to confirm critical hits', source: 'Critical Focus' }] },
  'two-weapon defense': { note: '+1 de escudo na CA ao lutar com duas armas.', mods: (ctx) => (ctx.twoWeapons ? [{ target: 'ac', value: 1, type: 'shield-twd', source: 'Two-Weapon Defense' }] : []) },
  'improved iron will': { note: 'Uma vez por dia, rola de novo um save de Vontade.' },
  'improved great fortitude': { note: 'Uma vez por dia, rola de novo um save de Fortitude.' },
  'improved lightning reflexes': { note: 'Uma vez por dia, rola de novo um save de Reflexos.' },
  'combat reflexes': { note: 'Ataques de oportunidade extras = mod. de Des.' },
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
  'fencing grace': { note: 'Des em vez de For no dano com rapier (uma mão, outra livre).' },
  'dervish dance': { note: 'Des em vez de For no ataque e dano com scimitar (sem escudo nem outra arma).' },
  'slashing grace': { note: 'Des em vez de For no dano com a arma escolhida (escreva a arma no parâmetro do feat).' },
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
  const k = String(name || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  // Pathfinder feat index writes "Weapon Focus, Greater" / "Critical, Improved" → "greater weapon focus"
  const inv = /^([^,]+),\s*([a-z-]+)$/.exec(k); // "cleave, great", "critical, bleeding", "armor proficiency, heavy"
  return inv ? `${inv[2]} ${inv[1]}` : k;
}
// Display name in the usual statblock form: "Weapon Focus, Greater" → "Greater Weapon Focus"
export function canonicalFeatName(name) {
  const m = /^([^,(]+),\s*([A-Z][a-z-]+)(\s*\(.*\))?$/.exec(String(name || ''));
  return m ? `${m[2]} ${m[1]}${m[3] || ''}` : name;
}
export function featEffect(name) {
  return FEAT_EFFECTS[featKey(name)] || null;
}

// ------------------------------------------------------------------ effects read from the benefit text
// For feats without a hand-written entry: "+2 bonus on Diplomacy checks", "+1 dodge bonus to AC", "+2 bonus on
// saving throws against sleep…" become modifiers; anything after "when/against/while/to…" becomes a condition
// (shown as a note, like official stat blocks do).
import { SKILLS as SKILL_LIST } from './skills.js';
const SKILL_NAMES = SKILL_LIST.map((s) => s.name);
const COND_RE = /^\s*(when|against|vs\.?|while|to |made|with|for |if |during|in |on |as long|until|that|whenever|after|before|from|instead)/i;
function targetsOf(raw) {
  const t = raw.toLowerCase();
  if (/^(all )?saving throws|^saves/.test(t)) return ['saves'];
  if (/^fortitude/.test(t)) return ['fort'];
  if (/^reflex/.test(t)) return ['ref'];
  if (/^will/.test(t)) return ['will'];
  if (/^initiative/.test(t)) return ['init'];
  if (/^(ac|armor class)\b/.test(t)) return ['ac'];
  if (/^(cmd|combat maneuver defense)/.test(t)) return ['cmd'];
  if (/^(cmb|combat maneuver checks?)/.test(t)) return ['cmb'];
  if (/^concentration/.test(t)) return ['concentration'];
  if (/^attack rolls/.test(t)) return ['attack'];
  if (/^damage rolls/.test(t)) return ['damage'];
  if (/^(maximum )?hit points/.test(t)) return ['hp'];
  // skills: "Diplomacy and Intimidate checks", "all Knowledge and Profession checks"
  const out = [];
  for (const part of raw.split(/,|\band\b|\bor\b/)) {
    const p = part.replace(/\b(all|skill|checks?)\b/gi, '').trim().toLowerCase();
    if (!p) continue;
    if (p === 'knowledge') { out.push(...SKILL_NAMES.filter((n) => n.startsWith('Knowledge')).map((n) => `skill:${n}`)); continue; }
    const hit = SKILL_NAMES.find((n) => n.toLowerCase() === p);
    if (hit) out.push(`skill:${hit}`);
  }
  return out;
}
export function effectFromText(name, text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const mods = [];
  const re = /\+(\d+) (?:(dodge|insight|competence|morale|sacred|profane|luck|deflection|circumstance|racial|untyped|trait|enhancement) )?bonus (?:on|to) ((?:all )?(?:saving throws|saves|Fortitude saves|Reflex saves|Will saves|Fortitude|Reflex|Will|initiative(?: checks)?|AC|Armor Class|CMD|CMB|combat maneuver checks|concentration checks|attack rolls|damage rolls|(?:maximum )?hit points|(?:all )?[A-Z][A-Za-z ()]+? (?:skill )?checks))([^.;]*)/g;
  for (const m of t.matchAll(re)) {
    const targets = targetsOf(m[3]);
    if (!targets.length) continue;
    const rest = m[4] || '';
    const cond = COND_RE.test(rest) ? rest.trim().replace(/^made /i, '') : '';
    const type = m[2] === 'dodge' || m[2] === 'circumstance' ? m[2] : (m[2] || 'untyped');
    for (const target of targets) mods.push({ target, value: Number(m[1]), type: target === 'ac' && type === 'untyped' ? 'untyped' : type, cond, source: name });
  }
  if (!mods.length) return null;
  return { mods: () => mods, note: `Lido do texto: ${mods.map((x) => `+${x.value} ${x.target.replace('skill:', '')}${x.cond ? ` (${x.cond})` : ''}`).join(', ')}.`, fromText: true };
}
