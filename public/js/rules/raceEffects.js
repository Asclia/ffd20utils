// Reads racial traits (FFd20 and Pathfinder race pages) into automatic effects:
// skill bonuses, save bonuses, AC/CMD bonuses, natural armor, immunities, bonus feat and skill ranks.
// Conditional bonuses ("…to notice unusual stonework", "…against poison") become notes, as in PF stat blocks.
import { SKILLS } from './skills.js';

const SKILL_NAMES = SKILLS.map((s) => s.name);
const ALIASES = { acrobatic: 'Acrobatics', 'escape artists': 'Escape Artist', 'sleight-of-hand': 'Sleight of Hand', 'use magic devices': 'Use Magic Device' };
function skillsIn(list) {
  const out = [];
  for (let part of list.split(/,|\band\b|\bor\b/)) {
    part = part.replace(/\b(all|skill|checks?)\b/gi, '').trim();
    if (!part) continue;
    const low = part.toLowerCase();
    const hit = SKILL_NAMES.find((n) => n.toLowerCase() === low) || ALIASES[low] || SKILL_NAMES.find((n) => low.startsWith(n.toLowerCase()));
    if (hit) out.push(hit);
  }
  return out;
}
const COND = /^\s*(made |to |when |against |while |that |in |involving |about |with |for |relating |concerning |if |as |which )/i;

export function raceTraitEffects(race) {
  const res = { mods: [], immune: [], bonusFeat: false, bonusSkillRanks: false, notes: [] };
  if (!race) return res;
  for (const t of race.traits || []) {
    const name = t.name || '';
    const txt = String(t.text || '').replace(/\s+/g, ' ');
    const src = name;
    if (/^bonus feat$/i.test(name) || /(?:select|gain|receive)s? (?:one )?(?:extra|bonus|additional) feat at 1st level/i.test(txt)) res.bonusFeat = true;
    if (/additional skill rank at (?:1st|first) level and (?:one )?additional rank whenever/i.test(txt)) res.bonusSkillRanks = true;
    // skills: "+2 racial bonus on Acrobatics and Climb checks" (conditional if followed by "made to…", "when…")
    for (const m of txt.matchAll(/\+(\d+) (?:racial |competence |insight )?bonus (?:on|to) ((?:[A-Z][\w()'-]*(?: \([^)]*\))?(?:,? (?:and |or )?)?)+?) (?:skill )?checks([^.]*)/g)) {
      const skills = skillsIn(m[2]);
      if (!skills.length) continue;
      const cond = COND.test(m[3]) ? m[3].trim().replace(/^(made )/, '') : '';
      for (const s of skills) res.mods.push({ target: `skill:${s}`, value: Number(m[1]), type: 'racial', cond, source: src });
    }
    // saves: "+1 racial bonus on all saving throws", "+2 racial bonus on saving throws against poison…"
    for (const m of txt.matchAll(/\+(\d+) (?:racial )?(?:saving throw )?bonus (?:on|to|against) (all )?(saving throws|saves|Fortitude saves|Reflex saves|Will saves|Fortitude saving throws|Reflex saving throws|Will saving throws)([^.]*)/gi)) {
      const which = /fort/i.test(m[3]) ? 'fort' : /reflex/i.test(m[3]) ? 'ref' : /will/i.test(m[3]) ? 'will' : 'saves';
      const rest = m[4] || '';
      const cond = /^\s*(against|vs\.?|made against|to resist|when)/i.test(rest) ? rest.trim().replace(/^made /, '') : '';
      res.mods.push({ target: which, value: Number(m[1]), type: 'racial', cond, source: src });
    }
    // "+2 racial saving throw bonus against enchantment spells and effects"
    for (const m of txt.matchAll(/\+(\d+) racial saving throw bonus (against [^.]*)/gi)) res.mods.push({ target: 'saves', value: Number(m[1]), type: 'racial', cond: m[2].trim(), source: src });
    // AC / CMD
    for (const m of txt.matchAll(/\+(\d+) (dodge |natural armor |racial )?bonus to (?:their )?(AC|Armor Class|Combat Maneuver Defense|CMD)([^.]*)/gi)) {
      const target = /maneuver|cmd/i.test(m[3]) ? 'cmd' : 'ac';
      const type = (m[2] || '').trim().replace('natural armor', 'natural') || (target === 'ac' ? 'racial' : 'racial');
      const cond = /^\s*(against|when|while|vs)/i.test(m[4] || '') ? m[4].trim() : '';
      res.mods.push({ target, value: Number(m[1]), type: type === 'racial' && target === 'ac' ? 'untyped' : type, cond, source: src });
    }
    for (const m of txt.matchAll(/\+(\d+) natural armor bonus/gi)) if (!res.mods.some((x) => x.source === src && x.type === 'natural')) res.mods.push({ target: 'ac', value: Number(m[1]), type: 'natural', cond: '', source: src });
    // immunities
    const im = /\b(?:are|is) immune to ([^.;]+)/i.exec(txt);
    if (im) {
      const s = im[1].toLowerCase();
      for (const [re, key] of [[/sleep/, 'sleep'], [/poison/, 'poison'], [/disease/, 'disease'], [/fear/, 'fear'], [/paraly/, 'paralysis'], [/petrif/, 'petrification'], [/confus/, 'confuse'], [/blind/, 'blind'], [/silence/, 'silence'], [/charm/, 'charm'], [/doom/, 'doom'], [/curse/, 'curse'], [/disable/, 'disable']]) if (re.test(s)) res.immune.push(key);
    }
  }
  return res;
}
