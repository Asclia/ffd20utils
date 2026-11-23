// Numeric effects of class features (FFd20 and Pathfinder 1e), applied automatically by the engine.
// Keys are normalized feature names. Each effect receives
//   x = { L: class level, v: number read from the class table ("bravery +2" → 2) or null, value: raw text,
//         m: ability modifiers, bab, hd, armor: 'none'|'light'|'medium'|'heavy', shield: bool, ff: FFd20?,
//         on(id): state of a combat toggle, cls: class definition }
// and returns any of
//   mods: [{target, value, type, cond}]      (same targets as feats: ac, fort, ref, will, saves, attack.melee, damage.melee,
//                                            skill:<name>, init, cmd, cmb, speed, hp, dr, str/dex/…, maxDex, acp)
//   hooks: [(atk) => ({ att, dmg, dice, extraAttacks })]   per-attack adjustments (weapon training…)
//   immune: ['fear', …]      toggles: [{ id, label }]      note: text shown in the editor
// Effects marked stage: 'abilities' change ability scores and run before the rest.
import { SKILLS } from './skills.js';

const half = (L) => Math.max(1, Math.floor(L / 2));
const every = (L, start, step, base = 1) => (L < start ? 0 : base + Math.floor((L - start) / step));

// ------------------------------------------------------------------ weapon groups (fighter weapon groups, simplified)
const GROUPS = {
  'blades, heavy': /\b(longsword|greatsword|bastard sword|broadsword|scimitar|falchion|katana|nodachi|elven curve blade|knight sword|curve blade|great ?sword|claymore|flamberge|estoc|gunblade|guntana)\b/,
  'blades, light': /\b(dagger|short sword|shortsword|rapier|kukri|sickle|wakizashi|starknife|sword cane|cutlass|machete|gladius|kerambit|thief sword|leafblade|thornblade|fillet knife)\b/,
  axes: /\b(axe|handaxe|battleaxe|greataxe|waraxe|war axe|gunaxe)\b/,
  hammers: /\b(hammer|warhammer|maul|club|greatclub|mace|tenderizer|gunhammer)\b/,
  flails: /\b(flail|morningstar|nunchaku|chain|sword-chucks|meteor)\b/,
  polearms: /\b(halberd|glaive|guisarme|ranseur|bardiche|lucerne|naginata|bec de corbin|scythe|gunhalberd|fork)\b/,
  spears: /\b(spear|longspear|trident|lance|pike|javelin|gunlance|pilum)\b/,
  bows: /\b(longbow|shortbow|bow|greatbow|harp-bow)\b/,
  crossbows: /\bcrossbow\b/,
  firearms: /\b(pistol|musket|rifle|gun|blunderbuss|revolver|shotgun|firearm)\b/,
  thrown: /\b(javelin|shuriken|chakram|throwing|dart|boomerang|card)\b/,
  monk: /\b(unarmed|kama|nunchaku|sai|siangham|quarterstaff|temple sword|shuriken|handwraps)\b/,
  natural: /\b(bite|claw|gore|slam|tail|wing|hoof|talon|tentacle|sting)\b/,
};
export function weaponGroup(name) {
  const n = String(name || '').toLowerCase();
  for (const [g, re] of Object.entries(GROUPS)) if (re.test(n)) return g;
  return '';
}
const EASTERN = /\b(katana|wakizashi|nodachi|naginata|nunchaku|kama|sai|tonfa|kusarigama|tanto|bo staff|shuriken|tessen|yari)\b/;
const isPiercingLight = (a) => a.light || a.finesse || /rapier|dagger|short ?sword|estoc|epee|stiletto|main-gauche|foil/i.test(a.name);
// bonus on the class's chosen weapon group: the group of the first manufactured weapon
function groupHook(bonus, group, label) {
  return (atk, all) => {
    const g = group || weaponGroup((all.find((a) => !a.natural) || {}).name);
    if (!g || atk.natural || weaponGroup(atk.name) !== g) return null;
    return { att: bonus, dmg: bonus, label };
  };
}
const knowledgeSkills = () => SKILLS.filter((s) => s.name.startsWith('Knowledge')).map((s) => s.name);

// unarmed strike damage (Medium) — PF monk / brawler and FFd20 "Martial Arts (1d6/1d8)"
const PF_MONK_DICE = (L) => (L >= 20 ? '2d10' : L >= 16 ? '2d8' : L >= 12 ? '2d6' : L >= 8 ? '1d10' : L >= 4 ? '1d8' : '1d6');
const unarmedHook = (dice) => (atk) => (/unarmed/i.test(atk.name) ? { dice } : null);

const rageMods = (L, pf) => {
  const tier = L >= 20 ? 3 : L >= 11 ? 2 : 1;
  if (pf) return [{ target: 'str', value: 2 + 2 * tier, type: 'morale' }, { target: 'con', value: 2 + 2 * tier, type: 'morale' }, { target: 'will', value: 1 + tier, type: 'morale' }, { target: 'ac', value: -2, type: 'rage' }];
  const b = tier + 1;
  return [{ target: 'attack.melee', value: b, type: 'morale' }, { target: 'damage.melee', value: b, type: 'morale' }, { target: 'will', value: b, type: 'morale' }, { target: 'ac', value: -2, type: 'rage' }];
};

export const CLASS_EFFECTS = {
  // ---------------------------------------------------------------- defense
  'armor training': {
    when: (x) => x.armor !== 'none',
    fn: (x) => { const n = x.v || every(x.L, x.gained || 3, 4); return { mods: [{ target: 'maxDex', value: n }, { target: 'acp', value: n }], note: `Penalidade de armadura −${n}, Des máx. +${n}.` }; },
  },
  bravery: { fn: (x) => { const n = x.v || every(x.L, 2, 4); return { mods: [{ target: 'will', value: n, cond: 'vs. fear' }], note: `+${n} Will contra medo.` }; } },
  'trap sense': { fn: (x) => { const n = x.v || every(x.L, 3, 3); return { mods: [{ target: 'ref', value: n, cond: 'vs. traps' }, { target: 'ac', value: n, type: 'dodge', cond: 'vs. traps' }], note: `+${n} Ref e CA contra armadilhas.` }; } },
  'danger sense': { fn: (x) => { const n = x.v || every(x.L, 3, 3); return { mods: [{ target: 'ref', value: n, cond: 'vs. traps' }, { target: 'ac', value: n, type: 'dodge', cond: 'vs. traps' }, { target: 'skill:Perception', value: n, cond: 'to avoid surprise' }], note: `+${n} Ref/CA contra armadilhas e Percepção contra surpresa.` }; } },
  nimble: { when: (x) => x.armor === 'none' || x.armor === 'light', fn: (x) => { const n = x.v || every(x.L, x.gained || 2, 4); return { mods: [{ target: 'ac', value: n, type: 'dodge' }], note: `+${n} esquiva na CA (armadura leve ou nenhuma).` }; } },
  'elaborate parry': { fn: (x) => { const n = x.v || every(x.L, 3, 4); return { mods: [{ target: 'ac', value: n, type: 'deflection' }], note: `+${n} deflexão na CA.` }; } },
  'ac bonus': {
    fn: (x) => {
      const id = x.cls.id.replace(/^pf-/, '');
      if (/^(monk|monk-unchained)$/.test(id) || id === 'ninja' || id === 'dancer') {
        if (x.armor !== 'none' || x.shield) return { note: 'Sem efeito: usando armadura ou escudo.' };
        const ab = id === 'dancer' ? 'cha' : 'wis';
        const lvlPart = id === 'dancer' ? Math.floor(x.L / 5) : id === 'ninja' ? 1 + Math.floor((x.L - 1) / 4) : Math.floor(x.L / 4);
        return { mods: [{ target: 'ac', value: Math.max(0, x.m[ab]), type: `${ab}-ac` }, { target: 'cmd', value: Math.max(0, x.m[ab]) }, ...(lvlPart ? [{ target: 'ac', value: lvlPart, type: 'class-ac' }, { target: 'cmd', value: lvlPart }] : [])],
          note: `+${ab === 'wis' ? 'Sab' : 'Car'} e +${lvlPart} na CA e DMC sem armadura.` };
      }
      if (x.armor === 'medium' || x.armor === 'heavy') return { note: 'Sem efeito com armadura média/pesada.' };
      const n = x.v || every(x.L, 3, 4);
      return { mods: [{ target: 'ac', value: n, type: 'dodge' }, { target: 'cmd', value: n }], note: `+${n} esquiva na CA e DMC.` };
    },
  },
  'divine grace': { fn: (x) => ({ mods: [{ target: 'saves', value: Math.max(0, x.m.cha), type: 'divine-grace' }], note: `+${Math.max(0, x.m.cha)} (Car) em todos os saves.` }) },
  'holy grace': { fn: (x) => ({ mods: [{ target: 'saves', value: Math.max(0, x.m.cha), type: 'divine-grace' }], note: `+${Math.max(0, x.m.cha)} (Car) em todos os saves.` }) },
  'aura of courage': { fn: () => ({ immune: ['fear'], note: 'Imune a medo.' }) },
  'aura of resolve': { fn: () => ({ immune: ['charm'], note: 'Imune a encantamento (charm).' }) },
  'divine health': { fn: (x) => ({ immune: x.ff ? ['disease', 'poison', 'sap'] : ['disease'], note: 'Imunidades aplicadas.' }) },
  'purity of body': { fn: () => ({ immune: ['disease'] }) },
  'venom immunity': { fn: () => ({ immune: ['poison'] }) },
  'poison immunity': { fn: () => ({ immune: ['poison'] }) },
  'diamond body': { fn: (x) => (x.ff ? { note: '' } : { immune: ['poison'] }) },
  'poison resistance': { fn: (x) => { const n = x.v || 2; return { mods: [{ target: 'fort', value: n, cond: 'vs. poison' }] }; } },
  'still mind': { fn: () => ({ mods: [{ target: 'saves', value: 2, cond: 'vs. enchantment' }] }) },
  'well-versed': { fn: () => ({ mods: [{ target: 'saves', value: 4, cond: 'vs. bardic performance, sonic and language-dependent effects' }] }) },
  "resist nature's lure": { fn: () => ({ mods: [{ target: 'saves', value: 4, cond: 'vs. fey and plant-targeted effects' }] }) },
  'confuse immunity': { fn: (x) => { const n = x.v || 2 * every(x.L, 3, 4); return { mods: [{ target: 'saves', value: n, cond: 'vs. confuse' }] }; } },
  'damage reduction': { fn: (x) => { const n = x.v || every(x.L, 7, 3); return { mods: [{ target: 'dr', value: n }], note: `RD ${n}/—.` }; } },
  'stand firm': { fn: (x) => { const n = x.v || every(x.L, 2, 4); return { mods: [{ target: 'cmd', value: n, cond: 'vs. bull rush, overrun and trip' }] }; } },
  'indomitable will': { fn: () => ({ mods: [{ target: 'will', value: 4, cond: 'vs. enchantment while raging' }] }) },
  bodybuilding: { fn: (x) => ({ mods: [{ target: 'hp', value: x.L * Math.max(0, x.m.con) }], note: `+${x.L * Math.max(0, x.m.con)} PV (nível × Con).` }) },
  'cunning initiative': { fn: (x) => ({ mods: [{ target: 'init', value: Math.max(0, x.m.wis) }], note: `+${Math.max(0, x.m.wis)} (Sab) na iniciativa.` }) },

  // ---------------------------------------------------------------- movement
  'fast movement': {
    fn: (x) => {
      const id = x.cls.id.replace(/^pf-/, '');
      const monk = /^monk/.test(id);
      if (monk ? x.armor !== 'none' : x.armor === 'heavy' || (/archer|gunner/.test(id) && x.armor === 'medium')) return { note: 'Sem efeito com esta armadura.' };
      const n = x.v || (monk ? 10 * Math.floor(x.L / 3) : 10);
      return { mods: [{ target: 'speed', value: n }], note: `+${n} ft. de deslocamento.` };
    },
  },
  fleet: { toggles: [{ id: 'dance', label: 'Battle dance (Fleet)' }], fn: (x) => (x.on('dance') ? { mods: [{ target: 'speed', value: x.v || 10 }] } : {}) },

  // ---------------------------------------------------------------- skills
  'bardic knowledge': { fn: (x) => ({ mods: knowledgeSkills().map((s) => ({ target: `skill:${s}`, value: half(x.L) })), note: `+${half(x.L)} em todas as Knowledge.` }) },
  'nature sense': { fn: () => ({ mods: [{ target: 'skill:Knowledge (nature)', value: 2 }, { target: 'skill:Survival', value: 2 }], note: '+2 em Knowledge (nature) e Survival.' }) },
  trapfinding: { fn: (x) => ({ mods: [{ target: 'skill:Perception', value: half(x.L), cond: 'to locate traps' }, { target: 'skill:Disable Device', value: half(x.L) }], note: `+${half(x.L)} em Disable Device e Percepção para achar armadilhas.` }) },
  hawkeye: { fn: (x) => { const n = x.v || every(x.L, 2, x.ff ? 3 : 4); return { mods: [{ target: 'skill:Perception', value: n }], note: `+${n} em Percepção.` }; } },
  'precision aiming': { fn: (x) => { const n = x.v || every(x.L, 2, 3); return { mods: [{ target: 'skill:Perception', value: n }], note: `+${n} em Percepção.` }; } },
  'stern gaze': { fn: (x) => ({ mods: [{ target: 'skill:Intimidate', value: half(x.L) }, { target: 'skill:Sense Motive', value: half(x.L) }], note: `+${half(x.L)} em Intimidate e Sense Motive.` }) },
  'improved theft': { fn: (x) => { const n = x.v || 2 * every(x.L, 5, 4); return { mods: [{ target: 'skill:Sleight of Hand', value: n, type: 'competence' }, { target: 'cmb', value: n, cond: 'to steal' }] }; } },
  'no trace': { fn: (x) => { const n = x.v || every(x.L, 3, 3); return { mods: [{ target: 'skill:Disguise', value: n, type: 'insight' }] }; } },
  'skilled liar': { fn: (x) => ({ mods: [{ target: 'skill:Bluff', value: half(x.L), cond: 'to deceive' }] }) },
  'masterful talent': { fn: () => ({ mods: [{ target: 'skills', value: 4 }] }) },
  'jack-of-all-trades': { fn: () => ({ note: 'Pode usar qualquer perícia sem treino.' }) },

  // ---------------------------------------------------------------- offense
  'weapon training': { fn: (x) => { const n = x.v || every(x.L, 5, 4); return n ? { hooks: [groupHook(n, '', 'weapon training')], note: `+${n} ataque/dano com o grupo da arma principal.` } : {}; } },
  'chosen weapon': { fn: (x) => { const n = x.v || every(x.L, 1, 4); return { hooks: [groupHook(n, '', 'chosen weapon')], note: `+${n} ataque/dano com o grupo da arma principal.` }; } },
  'polearm training': { fn: (x) => { const n = x.v || every(x.L, 5, 5); return { hooks: [(a) => (/spear|lance|polearm|halberd|glaive|naginata|pike|trident|guisarme|ranseur/i.test(a.name) ? { att: n, dmg: n } : null)], note: `+${n} com lanças e armas de haste.` }; } },
  'expert archer': { fn: (x) => { const n = x.v || every(x.L, x.ff ? 4 : 5, 4); return { hooks: [(a) => (a.kind === 'ranged' && /bow|crossbow/i.test(a.name) ? { att: n, dmg: n } : null)], note: `+${n} com arcos e bestas.` }; } },
  'one with the sword': { fn: (x) => { const n = x.v || every(x.L, 5, 4); return { hooks: [(a) => (a.kind === 'melee' && EASTERN.test(a.name.toLowerCase()) ? { att: n, dmg: n } : null)], note: `+${n} com armas orientais.` }; } },
  'swashbuckler weapon training': { fn: (x) => { const n = x.v || every(x.L, 5, 4); return { hooks: [(a) => (a.kind === 'melee' && isPiercingLight(a) ? { att: n, dmg: n } : null)] }; } },
  'fencer weapon training': { fn: (x) => { const n = every(x.L, 5, 4); return n ? { hooks: [(a) => (a.kind === 'melee' && isPiercingLight(a) ? { att: n, dmg: n } : null)], flags: { finesse: true } } : { flags: { finesse: true } }; } },
  'finesse training': { fn: () => ({ flags: { finesse: true }, note: 'Conta como Weapon Finesse.' }) },
  'swashbuckler finesse': { fn: () => ({ flags: { finesse: true }, note: 'Conta como Weapon Finesse.' }) },
  'agile archer': { fn: () => ({ hooks: [(a, all, x) => (a.kind === 'ranged' && /bow|crossbow/i.test(a.name) ? { dmg: Math.max(0, x.m.dex) } : null)], note: 'Soma Des ao dano com arcos e bestas.' }) },
  'unarmed strike': { fn: (x) => (/^(pf-)?(monk|brawler|monk-unchained)$/.test(x.cls.id) ? { hooks: [unarmedHook(PF_MONK_DICE(x.L))], note: `Dano desarmado ${PF_MONK_DICE(x.L)}.` } : {}) },
  'martial arts': { fn: (x) => { const m = /(\d+d\d+)\s*\/\s*(\d+d\d+)/.exec(x.value || ''); const dice = m ? m[2] : '1d6'; return { hooks: [unarmedHook(dice)], note: `Dano desarmado ${dice} (Médio).` }; } },
  'quick shot': {
    toggles: [{ id: 'quick', label: 'Quick Shot (ataque total)', defaultOn: true }],
    fn: (x) => (x.on('quick') ? { hooks: [(a) => (a.kind === 'ranged' && /bow|crossbow/i.test(a.name) ? { att: -2, extraAttacks: 1 } : null)], note: 'Ataque extra com arco/besta no ataque total; −2 em todos.' } : { note: 'Desligado em Estados de combate.' }),
  },
  'flurry of blows': {
    toggles: [{ id: 'flurry', label: 'Flurry of blows' }],
    fn: (x) => {
      if (!x.on('flurry')) return {};
      const pf = !x.ff;
      const extra = pf ? (x.L >= 15 ? 3 : x.L >= 8 ? 2 : 1) : (x.L >= 11 ? 2 : 1);
      return { hooks: [(a) => (a.kind === 'melee' && (weaponGroup(a.name) === 'monk' || /unarmed/i.test(a.name)) ? { att: pf && !/unchained/.test(x.cls.id) ? -2 : 0, extraAttacks: extra } : null)] };
    },
  },

  // ---------------------------------------------------------------- combat states (toggles)
  rage: {
    stage: 'abilities',
    toggles: [{ id: 'rage', label: 'Em fúria (Rage)' }],
    fn: (x) => (x.on('rage') ? { mods: rageMods(x.L, !x.ff), note: '' } : {}),
  },
  bloodrage: { stage: 'abilities', toggles: [{ id: 'rage', label: 'Em bloodrage' }], fn: (x) => (x.on('rage') ? { mods: rageMods(x.L, true) } : {}) },
  'defensive stance': {
    toggles: [{ id: 'stance', label: 'Em Defensive Stance' }],
    fn: (x) => {
      if (!x.on('stance')) return {};
      const b = x.L >= 20 ? 4 : x.L >= 11 ? 3 : 2;
      return { mods: [{ target: 'attack.melee', value: b, type: 'morale' }, { target: 'damage.melee', value: b, type: 'morale' }, { target: 'will', value: b, type: 'morale' }, { target: 'ac', value: b, type: 'dodge' }] };
    },
  },
  darkside: {
    toggles: [{ id: 'darkside', label: 'Darkside ativo' }],
    fn: (x) => {
      if (!x.on('darkside')) return {};
      const m = /\+(\d+)\s*ATK\s*\/\s*\+(\d+)\s*DMG/i.exec(x.value || '');
      const att = m ? Number(m[1]) : 1 + Math.floor((x.L - 1) / 4);
      const dmg = m ? Number(m[2]) : 3 + Math.floor((x.L - 1) / 2);
      return { mods: [{ target: 'attack', value: att }, { target: 'damage.melee', value: dmg }] };
    },
  },
  'grit stance': {
    toggles: [{ id: 'grit', label: 'Em Grit Stance' }],
    fn: (x) => { if (!x.on('grit')) return {}; const n = 2 + Math.floor((x.L - 1) / 3); return { mods: [{ target: 'damage', value: -n, type: 'penalty' }, { target: 'dr', value: n }] }; },
  },
  'oath stance': {
    toggles: [{ id: 'sword', label: 'Sword Oath' }, { id: 'shield', label: 'Shield Oath' }],
    fn: (x) => {
      const s = 1 + Math.floor((x.L - 1) / 3);
      const pen = 2 + Math.floor((x.L - 1) / 3);
      if (x.on('sword')) return { mods: [{ target: 'attack', value: s, type: 'insight' }, { target: 'damage', value: Math.floor(x.L / 2), type: 'insight' }, { target: 'ac', value: -pen, type: 'sword oath' }] };
      if (x.on('shield')) return { mods: [{ target: 'ac', value: s, type: 'deflection' }, { target: 'attack', value: Math.floor(x.L / 2), type: 'insight' }, { target: 'dr', value: Math.floor(x.L / 2) }, { target: 'damage', value: -pen, type: 'penalty' }] };
      return {};
    },
  },
  'smite evil': {
    toggles: [{ id: 'smite', label: 'Smite evil (contra o alvo)' }],
    fn: (x) => (x.on('smite') ? { mods: [{ target: 'attack', value: Math.max(0, x.m.cha) }, { target: 'damage', value: x.L }, { target: 'ac', value: Math.max(0, x.m.cha), type: 'deflection' }] } : {}),
  },
  'inspire courage': {
    toggles: [{ id: 'courage', label: 'Inspire courage' }],
    fn: (x) => { if (!x.on('courage')) return {}; const n = x.v || (x.L >= 17 ? 4 : x.L >= 11 ? 3 : x.L >= 5 ? 2 : 1); return { mods: [{ target: 'attack', value: n, type: 'competence' }, { target: 'damage', value: n, type: 'competence' }, { target: 'saves', value: n, type: 'morale', cond: 'vs. charm and fear' }] }; },
  },
  'studied target': {
    toggles: [{ id: 'studied', label: 'Studied target' }],
    fn: (x) => { if (!x.on('studied')) return {}; const n = 1 + Math.floor(x.L / 5); return { mods: [{ target: 'attack', value: n }, { target: 'damage', value: n }] }; },
  },
  mutagen: {
    stage: 'abilities',
    toggles: [{ id: 'mutagen', label: 'Mutagen (For)' }],
    fn: (x) => (x.on('mutagen') ? { mods: [{ target: 'str', value: 4, type: 'alchemical' }, { target: 'int', value: -2, type: 'penalty' }, { target: 'ac', value: 2, type: 'natural' }] } : {}),
  },
  'shield block': { note: 'Bônus contra um oponente designado.' },
};

// ------------------------------------------------------------------ statblock text with computed uses/DCs (PF style)
const pos = (n) => Math.max(0, n);
const SHORTS = {
  'channel energy': (x) => `channel energy (${pos(3 + x.m.cha)}/day, DC ${10 + Math.floor(x.L / 2) + x.m.cha}, ${x.vText || `${Math.ceil(x.L / 2)}d6`})`,
  'channel positive energy': (x) => `channel positive energy (DC ${10 + Math.floor(x.L / 2) + x.m.cha}, ${Math.floor(x.L / 2)}d6)`,
  'channel negative energy': (x) => `channel negative energy (DC ${10 + Math.floor(x.L / 2) + x.m.cha}, ${Math.floor(x.L / 2)}d6)`,
  'lay on hands': (x) => `lay on hands (${pos(Math.floor(x.L / 2) + x.m.cha)}/day, ${x.ff ? (x.vText || `${Math.ceil(x.L / 2)}d6`) : `${Math.floor(x.L / 2)}d6`})`,
  'touch of corruption': (x) => `touch of corruption (${pos(Math.floor(x.L / 2) + x.m.cha)}/day, ${Math.floor(x.L / 2)}d6)`,
  rage: (x) => `rage (${4 + x.m.con + 2 * (x.L - 1)} rounds/day)`,
  bloodrage: (x) => `bloodrage (${4 + x.m.con + 2 * (x.L - 1)} rounds/day)`,
  'raging song': (x) => `raging song (${3 + x.m.cha + 2 * (x.L - 1)} rounds/day)`,
  'bardic performance': (x) => `bardic performance (${4 + x.m.cha + 2 * (x.L - 1)} rounds/day)`,
  'defensive stance': (x) => `defensive stance (${4 + x.m.con + 2 * (x.L - 1)} rounds/day)`,
  'ki pool': (x) => `ki pool (${pos(Math.floor(x.L / 2) + x.m.wis)} points${x.value && /\(/.test(x.value) ? `, ${x.value.match(/\(([^)]*)\)/)[1]}` : ''})`,
  'arcane pool': (x) => `arcane pool (${pos(Math.floor(x.L / 2) + x.m.int)} points)`,
  grit: (x) => `grit (${pos(x.m.wis)})`,
  panache: (x) => `panache (${pos(x.m.cha)})`,
  bomb: (x) => `bomb ${x.L + x.m.int}/day (${Math.ceil(x.L / 2)}d6+${x.m.int} fire, DC ${10 + Math.floor(x.L / 2) + x.m.int})`,
  'stunning fist': (x) => `stunning fist (${x.L}/day, DC ${10 + Math.floor(x.L / 2) + x.m.wis})`,
  'smite evil': (x) => `smite evil (${1 + Math.floor((x.L - 1) / 3)}/day)`,
  'smite good': (x) => `smite good (${1 + Math.floor((x.L - 1) / 3)}/day)`,
  'wild shape': (x) => (x.value ? `wild shape (${(x.value.match(/\(([^)]*)\)/) || [, x.value])[1]})` : 'wild shape'),
  judgment: (x) => `judgment ${1 + Math.floor((x.L - 1) / 3)}/day`,
  'sneak attack': (x) => `sneak attack +${x.ff ? '' : ''}${(x.vText && /d6/.test(x.vText) ? x.vText.replace(/^\+/, '') : `${Math.ceil(x.L / 2)}d6`)}`,
  'studied target': (x) => `studied target +${1 + Math.floor(x.L / 5)}`,
  'arcane bond': () => 'arcane bond',
};

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
export function parseFeatureValue(text) {
  const s = String(text || '');
  let m = /([+-]?\d+)\s*(?:ft|')/.exec(s); if (m) return Number(m[1]);
  m = /(\d+)\s*\/\s*[—-]/.exec(s); if (m) return Number(m[1]);
  m = /\(?([+-]?\d+)(?!d)\)?\s*$/.exec(s.replace(/\(([A-Za-z]+)\/(\d+)\)/, '$2')); if (m) return Math.abs(Number(m[1]));
  m = /\b(I|II|III|IV|V)\s*$/.exec(s); if (m) return ROMAN[m[1]];
  return null;
}
export const effectKey = (name) => String(name || '').toLowerCase().replace(/’/g, "'").replace(/\s*\(.*?\)/g, '').replace(/\s+[+-]?\d+(d\d+)?(\/\S+)?$/, '').replace(/\s+(i|ii|iii|iv|v)$/, '').trim();

// Bonus feats in the class table ("Bonus feat", "Bonus combat feat", "Combat style feat", "Teamwork feat"...)
const BONUS_FEAT_RE = /^(bonus (combat )?feat|combat style feat|teamwork feat|bloodline feat|bonus feat \(.*\)|bonus combat feat)/i;
export function classBonusFeatSlots(classes) {
  let n = 0;
  const per = [];
  for (const c of classes) {
    let k = 0;
    for (const row of c.def.levels.slice(0, c.level)) k += (row.special || []).filter((s) => BONUS_FEAT_RE.test(String(s).trim())).length;
    if (k) per.push({ className: c.def.name, n: k });
    n += k;
  }
  return { n, per };
}

// Feats a class grants by name ("gains Improved Unarmed Strike as a bonus feat", "Endurance" in the table)
export function grantedFeats(classes, activeFeatures, featNames) {
  const out = [];
  const seen = new Set();
  const add = (name, cls) => {
    const k = name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ id: `auto:${cls}:${k}`, name, param: '', bonus: true, auto: true, source: cls });
  };
  for (const { cls, f } of activeFeatures) {
    const t = f.text || '';
    for (const m of t.matchAll(/gains? (?:the )?([A-Z][A-Za-z' -]{2,40}?)(?: feat)? as a bonus feat/g)) {
      const sentence = t.slice(Math.max(0, t.lastIndexOf('.', m.index) + 1), m.index);
      if (/\b(if|may|can|instead|choose|selects?)\b/i.test(sentence)) continue; // conditional or a choice
      const name = m[1].trim();
      if (featNames.has(name.toLowerCase())) add(name, cls.name);
    }
    if (featNames.has(f.name.toLowerCase()) && (!t || /bonus feat/i.test(t) || t.length < 40)) add(f.name, cls.name);
  }
  return out;
}

// Class skills added/removed by archetypes ("adds Acrobatics and Swim to his list of class skills … replaces Appraise")
export function archetypeClassSkills(activeFeatures, skillNames) {
  const add = [];
  const remove = [];
  const find = (txt) => skillNames.filter((n) => new RegExp(`\\b${n.replace(/[()]/g, (c) => `\\${c}`).replace(/^Knowledge \\\((\w+)\\\)$/, 'Knowledge[^,.;]*$1')}\\b`, 'i').test(txt));
  for (const { f } of activeFeatures) {
    if (!f.archetype || !/class skills?/i.test(f.name + f.text)) continue;
    const a = /adds? ([^.]+?) to (?:his|her|their|the) (?:list of )?class skills/i.exec(f.text);
    if (a) add.push(...find(a[1]));
    const r = /replaces? ([^.]+?) (?:as|on the list of|from the list of) class skills/i.exec(f.text) || /(?:loses|lose) ([^.]+?) as class skills/i.exec(f.text);
    if (r) remove.push(...find(r[1]));
  }
  return { add, remove };
}

// Applies every active class feature that has a numeric effect.
export function applyClassEffects({ features, stage, x0, toggles }) {
  const res = { mods: [], hooks: [], immune: [], flags: {}, toggles: [], notes: {}, shorts: {} };
  for (const { cls, f, L, value } of features) {
    const key = effectKey(f.name);
    if (stage === 'rest' && SHORTS[key]) {
      const vt = (String(value || '').match(/(\d+d\d+)/) || [])[1] || '';
      try { res.shorts[`${cls.id}:${f.name}`] = SHORTS[key]({ ...x0, L, cls, value, vText: vt }); } catch { /* ignore */ }
    }
    const eff = CLASS_EFFECTS[key];
    if (!eff || !eff.fn) continue;
    if ((eff.stage || 'rest') !== stage) continue;
    const tkey = (id) => `cf:${cls.id}:${key}:${id}`;
    const isOn = (id) => { const k = tkey(id); return k in toggles ? !!toggles[k] : !!(eff.toggles || []).find((t) => t.id === id)?.defaultOn; };
    for (const t of eff.toggles || []) res.toggles.push({ key: tkey(t.id), label: t.label, className: cls.name, feature: f.name, on: isOn(t.id) });
    const x = { ...x0, L, cls, value, v: parseFeatureValue(value), gained: f.level, on: isOn };
    if (eff.when && !eff.when(x)) { res.notes[`${cls.id}:${f.name}`] = 'Sem efeito no momento (armadura).'; continue; }
    const r = eff.fn(x) || {};
    for (const m of r.mods || []) res.mods.push({ type: 'untyped', ...m, source: f.name });
    for (const h of r.hooks || []) res.hooks.push({ fn: h, x, source: f.name });
    res.immune.push(...(r.immune || []));
    Object.assign(res.flags, r.flags || {});
    if (r.note) res.notes[`${cls.id}:${f.name}`] = r.note;
  }
  return res;
}
