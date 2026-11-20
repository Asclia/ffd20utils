// Creature types and subtypes (PF1e + FFd20 "Creature Properties" overrides).
// Each definition is data: the engine applies `elements`, `immunities`, `senses`, `mods`
// and `flags`; `traits` is text shown in the editor and (optionally) in the stat block.

export const ELEMENTS = ['fire', 'ice', 'wind', 'earth', 'lightning', 'water', 'holy', 'shadow'];
export const ELEMENT_PT = { fire: 'Fogo', ice: 'Gelo', wind: 'Vento', earth: 'Terra', lightning: 'Raio', water: 'Água', holy: 'Sagrado', shadow: 'Sombra' };
// Elemental cycle: each is strong against the next.
export const ELEMENT_CYCLE = ['wind', 'earth', 'lightning', 'water', 'fire', 'ice'];
export function weaknessOf(el) {
  if (el === 'holy') return 'shadow';
  if (el === 'shadow') return 'holy';
  const i = ELEMENT_CYCLE.indexOf(el);
  return i < 0 ? null : ELEMENT_CYCLE[(i + ELEMENT_CYCLE.length - 1) % ELEMENT_CYCLE.length];
}
// affinity values: '' | 'weak' | 'strong' | 'resist' | 'immune' | 'absorb'
export const AFFINITIES = { '': '—', weak: 'Fraqueza (×1.5)', strong: 'Strong (½)', resist: 'Resistência X', immune: 'Imunidade', absorb: 'Absorve' };
export const AFFINITY_RANK = { absorb: 5, immune: 4, strong: 3, resist: 2, '': 1, weak: 0 };

// Immunity tokens shown in the "Immune" line. Grouped for the editor.
export const IMMUNITY_GROUPS = [
  ['Efeitos', ['mind-affecting effects', 'death effects', 'disease', 'poison', 'paralysis', 'sleep', 'stun', 'bleed', 'petrification', 'polymorph', 'critical hits', 'precision damage', 'flanking', 'ability damage', 'ability drain', 'energy drain', 'fatigue', 'exhaustion', 'nonlethal damage', 'gaze attacks', 'illusions', 'visual effects', 'fear', 'charm', 'compulsion', 'necromancy effects', 'Fort-save effects', 'gravity', 'banish']],
  ['Status FFd20', ['berserk', 'blind', 'burning', 'confuse', 'curse', 'dimmed', 'disable', 'doom', 'drench', 'frog', 'frozen', 'imperil', 'mini', 'sap', 'silence', 'slow', 'squalled', 'static', 'stop', 'weighted', 'zombie', 'deprotect', 'deshell', 'dazzled', 'charm', 'death']],
];
export const ALL_IMMUNITIES = [...new Set(IMMUNITY_GROUPS.flatMap((g) => g[1]))];

const CONSTRUCT_IMM = ['mind-affecting effects', 'bleed', 'blind', 'disease', 'death effects', 'frog', 'necromancy effects', 'paralysis', 'poison', 'sleep', 'stun', 'ability damage', 'ability drain', 'fatigue', 'exhaustion', 'energy drain', 'nonlethal damage', 'Fort-save effects'];
const UNDEAD_IMM = ['mind-affecting effects', 'bleed', 'disable', 'death effects', 'disease', 'paralysis', 'poison', 'sleep', 'stun', 'zombie', 'nonlethal damage', 'ability drain', 'energy drain', 'fatigue', 'exhaustion', 'Fort-save effects'];

export const TYPES = [
  { id: 'aberration', name: 'Aberration', hd: 8, bab: '3/4', good: ['will'], skillPts: 4, senses: ['darkvision 60 ft.'],
    classSkills: ['Acrobatics', 'Climb', 'Escape Artist', 'Fly', 'Intimidate', 'Knowledge (all)', 'Perception', 'Spellcraft', 'Stealth', 'Survival', 'Swim'],
    traits: 'Darkvision 60 ft. Proficiente com armas naturais (e armas simples se humanoide em forma). Come, dorme e respira.' },
  { id: 'animal', name: 'Animal', hd: 8, bab: '3/4', good: ['fort', 'ref'], skillPts: 2, senses: ['low-light vision'],
    classSkills: ['Acrobatics', 'Climb', 'Fly', 'Perception', 'Stealth', 'Swim'],
    traits: 'Int 1 ou 2. Visão na penumbra. Sempre Neutro. Apenas armas naturais.' },
  { id: 'construct', name: 'Construct', hd: 10, bab: 'full', good: [], skillPts: 2, senses: ['darkvision 60 ft.', 'low-light vision'],
    immunities: CONSTRUCT_IMM, flags: { noCon: true, constructHP: true }, classSkills: [],
    traits: 'Sem Con (trata como 10). Imune a burning sem carne/madeira/borracha/fiação; a petrificação sem carne; drench se metálico sem fiação. Não se cura sozinho; destruído a 0 PV; não pode ser revivido. PV bônus por tamanho. Não respira, come ou dorme.' },
  { id: 'dragon', name: 'Dragon', hd: 12, bab: 'full', good: ['fort', 'ref', 'will'], skillPts: 6, senses: ['darkvision 120 ft.', 'blindsense 60 ft.', 'low-light vision'],
    immunities: ['sleep', 'paralysis'],
    classSkills: ['Appraise', 'Bluff', 'Climb', 'Craft', 'Diplomacy', 'Fly', 'Heal', 'Intimidate', 'Knowledge (all)', 'Linguistics', 'Perception', 'Sense Motive', 'Spellcraft', 'Stealth', 'Survival', 'Swim', 'Use Magic Device'],
    traits: 'Imune a sono mágico, paralisia e um tipo elemental. Breath weapon DC 10 + ½ HD + Con, a cada 1d4 rodadas. CL = HD. SR = 11 + CR. Armas naturais contam como mágicas.' },
  { id: 'fey', name: 'Fey', hd: 6, bab: '1/2', good: ['ref', 'will'], skillPts: 6, senses: ['low-light vision'],
    classSkills: ['Acrobatics', 'Bluff', 'Climb', 'Craft', 'Diplomacy', 'Disguise', 'Escape Artist', 'Fly', 'Knowledge (geography)', 'Knowledge (local)', 'Knowledge (nature)', 'Perception', 'Perform', 'Sense Motive', 'Sleight of Hand', 'Stealth', 'Swim', 'Use Magic Device'],
    traits: 'Visão na penumbra. Proficiente com armas simples e as citadas na entrada.' },
  { id: 'humanoid', name: 'Humanoid', hd: 8, bab: '3/4', good: ['ref'], chooseGood: 1, skillPts: 2, senses: [],
    classSkills: ['Climb', 'Craft', 'Handle Animal', 'Heal', 'Profession', 'Ride', 'Survival'],
    traits: 'Um bom save (geralmente Ref). Humanoides de 1 HD trocam o HD racial por níveis de classe. Subtipo racial obrigatório.' },
  { id: 'magical-beast', name: 'Magical Beast', hd: 10, bab: 'full', good: ['fort', 'ref'], skillPts: 2, senses: ['darkvision 60 ft.', 'low-light vision'],
    classSkills: ['Acrobatics', 'Climb', 'Fly', 'Perception', 'Stealth', 'Swim'],
    traits: 'Darkvision 60 ft. e visão na penumbra. Apenas armas naturais.' },
  { id: 'monstrous-humanoid', name: 'Monstrous Humanoid', hd: 10, bab: 'full', good: ['ref', 'will'], skillPts: 4, senses: ['darkvision 60 ft.'],
    classSkills: ['Climb', 'Craft', 'Fly', 'Intimidate', 'Perception', 'Ride', 'Stealth', 'Survival', 'Swim'],
    traits: 'Darkvision 60 ft. Proficiente com armas simples e as citadas.' },
  { id: 'ooze', name: 'Ooze', hd: 8, bab: '3/4', good: [], skillPts: 2, senses: ['blindsight 60 ft.'],
    immunities: ['mind-affecting effects', 'gaze attacks', 'visual effects', 'illusions', 'poison', 'sleep', 'paralysis', 'polymorph', 'stun', 'critical hits', 'flanking', 'precision damage'],
    flags: { noInt: true, physicalHalf: true }, classSkills: [],
    traits: 'Sem Int (mindless). Cego (blindsight). Dano físico reduzido à metade (resist physical 50%). Alguns causam dano de terra (ácido) a objetos.' },
  { id: 'outsider', name: 'Outsider', hd: 10, bab: 'full', good: ['ref', 'will'], chooseGood: 2, skillPts: 6, senses: ['darkvision 60 ft.'],
    classSkills: ['Bluff', 'Craft', 'Knowledge (planes)', 'Perception', 'Sense Motive', 'Stealth'],
    traits: 'Dois bons saves (geralmente Ref e Will). Alma ligada ao corpo: raise dead/reincarnate/resurrection falham. Respira mas não precisa comer ou dormir (nativos sim). +4 perícias de classe pelo tema.' },
  { id: 'plant', name: 'Plant', hd: 8, bab: '3/4', good: ['fort'], skillPts: 2, senses: ['low-light vision'],
    immunities: ['mind-affecting effects', 'paralysis', 'poison', 'polymorph', 'sleep', 'stun'], classSkills: ['Perception', 'Stealth'],
    traits: 'Imune a efeitos de ação mental, paralisia, veneno, polimorfia, sono e atordoamento. Respira e come, mas não dorme.' },
  { id: 'undead', name: 'Undead', hd: 8, bab: '3/4', good: ['will'], skillPts: 4, senses: ['darkvision 60 ft.'],
    immunities: UNDEAD_IMM, elements: { shadow: 'absorb', holy: 'weak' }, flags: { noCon: true, chaForCon: true },
    classSkills: ['Climb', 'Disguise', 'Fly', 'Intimidate', 'Knowledge (arcana)', 'Knowledge (religion)', 'Perception', 'Sense Motive', 'Spellcraft', 'Stealth'],
    traits: 'Sem Con: usa Cha para PV e Fort. Absorve Sombra, fraco a Sagrado. Magia de cura causa dano. Imune a burning e petrificação se não tiver carne. Destruído a 0 PV.' },
  { id: 'vermin', name: 'Vermin', hd: 8, bab: '3/4', good: ['fort'], skillPts: 2, senses: ['darkvision 60 ft.'],
    immunities: ['mind-affecting effects'], flags: { noInt: true }, classSkills: [],
    traits: 'Mindless (sem Int, imune a efeitos de ação mental). Darkvision 60 ft.' },
];
export const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

const elem = (immune, strong, weak) => ({ [immune]: 'immune', ...(strong ? { [strong]: 'strong' } : {}), ...(weak ? { [weak]: 'weak' } : {}) });

export const SUBTYPES = [
  // Elemental-plane subtypes (FFd20)
  { id: 'fire', name: 'Fire', group: 'Elemento', elements: elem('fire', 'ice', 'water'), traits: 'Imune a fogo, resiste 50% (strong) a gelo, vulnerável a água. Burn; pode nadar em lava.' },
  { id: 'ice', name: 'Ice', group: 'Elemento', elements: elem('ice', 'wind', 'fire'), traits: 'Imune a gelo, strong vs vento, vulnerável a fogo. Escava gelo/neve, snow vision, icewalking, ice glide.' },
  { id: 'wind', name: 'Wind', group: 'Elemento', elements: elem('wind', 'earth', 'ice'), traits: 'Imune a vento, strong vs terra, vulnerável a gelo. Sempre voa (geralmente perfeito); Fly é perícia de classe; mist vision.' },
  { id: 'earth', name: 'Earth', group: 'Elemento', elements: elem('earth', 'lightning', 'wind'), senses: ['tremorsense 60 ft.'], traits: 'Imune a terra, strong vs raio, vulnerável a vento. Geralmente burrow, tremorsense, earth glide.' },
  { id: 'lightning', name: 'Lightning', group: 'Elemento', elements: elem('lightning', 'water', 'earth'), traits: 'Imune a raio, strong vs água, vulnerável a terra. Metal mastery, spark leap, cloud vision, staticwalking.' },
  { id: 'water', name: 'Water', group: 'Elemento', elements: elem('water', 'fire', 'lightning'), traits: 'Imune a água, strong vs fogo, vulnerável a raio. Drench, deslocamento de natação, respira água.' },
  { id: 'holy', name: 'Holy', group: 'Elemento', elements: { holy: 'immune', shadow: 'weak' }, traits: 'Imune a sagrado, vulnerável a sombra.' },
  { id: 'shadow', name: 'Shadow', group: 'Elemento', elements: { shadow: 'immune', holy: 'weak' }, senses: ['see in darkness'], traits: 'Imune a sombra, vulnerável a sagrado. Enxerga na escuridão.' },
  // Creature families (FFd20)
  { id: 'bomb', name: 'Bomb', group: 'Família', immunities: ['bleed', 'paralysis', 'poison', 'sleep'], flags: { float: true },
    abilities: [
      { name: 'Float', kind: 'Ex', placement: 'sq', text: 'The creature always hovers 5 feet above the ground; this cannot be dispelled.' },
      { name: 'Self-Destruct', kind: 'Ex', placement: 'specialAttack', short: 'self-destruct', text: 'Each successful physical attack against the bomb makes it grow 1 ft. in diameter and gain +2 Str (lasts 1d6+4 rounds). After the 3rd successful physical hit, or when reduced to 0 HP by a physical attack, it explodes for {hd}d6 points of damage of its element in a {bombRadius}-ft. burst (Reflex DC {dcCon} half).' },
    ],
    traits: 'Imune a bleed, paralisia, veneno, sono; light fortification (25%) vs críticos e sneak attack; só armas naturais; Float; Self-Destruct (HD d6, explosão 15/30/60 ft.). Bombas oficiais: Outsider (Bomb, Elemental, Extraplanar) + subtipo elemental.' },
  { id: 'elemental', name: 'Elemental', group: 'Família', immunities: ['bleed', 'paralysis', 'poison', 'sleep', 'stun', 'critical hits', 'flanking', 'precision damage'],
    traits: 'Imune a bleed, paralisia, veneno, sono, atordoamento; não sofre críticos, flanqueio ou dano de precisão; não respira, come ou dorme.' },
  { id: 'primal', name: 'Primal', group: 'Família', flags: { hdDie: 12, maxHP: true, babFull: true, allGood: true, srCR: 15 },
    traits: 'd12 maximizado, BAB bom, todos os saves bons, SR 15 + CR. Geralmente imune a um elemento e resistente a vários. Não respira, come ou dorme.' },
  { id: 'archfiend', name: 'Archfiend', group: 'Família', flags: { hdDie: 12, maxHP: true, babFull: true, allGood: true, skillPts: 8 },
    traits: 'd12 maximizado, BAB total, todos os saves bons, 8 + Int perícias. Pode quebrar restrições do tipo base.' },
  { id: 'avian', name: 'Avian', group: 'Família', elements: { wind: 'weak', earth: 'strong' }, traits: 'Voa sem precisar de testes de Fly. Geralmente fraco a vento e resistente/imune a terra.' },
  { id: 'aquatic', name: 'Aquatic', group: 'Família', elements: { lightning: 'weak', water: 'strong' }, traits: 'Deslocamento de natação, respira água. Geralmente fraco a raio e resistente/imune a água.' },
  { id: 'reptilian', name: 'Reptilian', group: 'Família', elements: { ice: 'weak', water: 'strong' }, traits: 'Geralmente fraco a gelo e resistente/imune a água.' },
  { id: 'daemon', name: 'Daemon', group: 'Família', elements: { earth: 'immune', ice: 'resist', lightning: 'resist', fire: 'resist' }, resist: { ice: 10, lightning: 10, fire: 10 }, immunities: ['death effects', 'disease', 'poison'], traits: '(NE) Imune a terra, morte, doença, veneno; resist gelo/raio/fogo 10; summon; telepatia.' },
  { id: 'demon', name: 'Demon', group: 'Família', elements: { lightning: 'immune', earth: 'resist', ice: 'resist', fire: 'resist' }, resist: { earth: 10, ice: 10, fire: 10 }, immunities: ['poison'], traits: '(CE) Imune a raio e veneno; resist terra/gelo/fogo 10; summon; telepatia; armas caóticas/malignas para DR.' },
  { id: 'devil', name: 'Devil', group: 'Família', elements: { fire: 'immune', earth: 'resist', ice: 'resist' }, resist: { earth: 10, ice: 10 }, immunities: ['poison'], traits: '(LE) Imune a fogo e veneno; resist terra/gelo 10; alguns enxergam na escuridão; summon; telepatia.' },
  { id: 'machina', name: 'Machina', group: 'Família', elements: { lightning: 'weak' }, flags: { forceField: true },
    abilities: [
      { name: 'Force Field', kind: 'Ex', placement: 'defensive', short: 'force field ({hd5} hp)', text: 'The machina is surrounded by a force field with {hd5} bonus hit points that absorb damage first. While the field is up the machina is immune to critical hits and has fast healing {hd} (field only). DR, hardness, resistances and immunities do not apply to the field. At 0 hp the field goes down for 24 hours.' },
      { name: 'Integrated Weaponry', kind: 'Ex', placement: 'sq', text: 'Weapons are natural attacks; no iterative attacks; ranged weapons do not provoke attacks of opportunity when fired in melee.' },
    ],
    traits: 'Int 10 salvo indicação. Force Field (HD×5 PV). Integrated Weaponry. Em crítico sofrido, Fort DC 12 ou atordoado 1 rodada. 150% de dano de raio (fraqueza). Steal danifica; ao morrer pode render frag grenade.' },
  { id: 'cieth', name: "Cie'th", group: 'Família', immunities: ['mind-affecting effects'], flags: { srCR: 11, castWis: true }, dr: '5/adamantine or crystal', traits: 'Imune a ação mental; DR 5/adamantine ou cristal; SR 11 + CR; não come, bebe ou respira; imune a envelhecimento; usa Wis para CD, MP e nível de magia.' },
  { id: 'sin-eater', name: 'Sin Eater', group: 'Família', elements: { holy: 'immune', lightning: 'resist', fire: 'resist' }, resist: { lightning: 10, fire: 10 }, immunities: ['death effects', 'mind-affecting effects', 'petrification'], flags: { srCR: 11 }, dr: '5/evil', senses: ['darkvision 60 ft.', 'low-light vision'], traits: 'Imune a morte, sagrado, ação mental, petrificação; resist raio/fogo 10; DR 5/evil; SR CR + 11.' },
  { id: 'living-construct', name: 'Living Construct', group: 'Família', immunities: ['sleep', 'paralysis'], flags: { livingConstruct: true }, traits: 'Tem Con, sem PV bônus por tamanho, morre a −Con. +2 vs doença, morte, dreno de energia, fadiga, ação mental, náusea, veneno, atordoamento, sickened, zombie. Cura metade; reparado com Craft; pode ser revivido.' },
  { id: 'unsent', name: 'Unsent', group: 'Família', elements: { holy: 'weak' }, traits: 'Espírito não enviado. Mantém BAB/saves de vivo; fraco a sagrado.' },
  // PF1e generic
  { id: 'native', name: 'Native', group: 'Geral', traits: 'Outsider nativo do Plano Material: come, dorme e pode ser revivido.' },
  { id: 'extraplanar', name: 'Extraplanar', group: 'Geral', traits: 'Fora de seu plano natal.' },
  { id: 'giant', name: 'Giant', group: 'Geral', senses: ['low-light vision'], traits: 'Humanoide grande; visão na penumbra.' },
  { id: 'goblinoid', name: 'Goblinoid', group: 'Geral', traits: 'Humanoide goblinoide.' },
  { id: 'incorporeal', name: 'Incorporeal', group: 'Geral', immunities: ['critical hits', 'precision damage'], flags: { incorporeal: true },
    abilities: [{ name: 'Incorporeal', kind: 'Ex', placement: 'defensive', short: 'incorporeal', text: 'The creature has no physical body. It can be harmed only by other incorporeal creatures, magic weapons or creatures that strike as magic weapons, and spells, spell-like abilities, or supernatural abilities. It is immune to all nonmagical attack forms. Even when hit by spells or magic weapons, it takes only half damage from a corporeal source (except for channel energy). It can pass through solid objects, but not force effects. Its attacks ignore natural armor, armor, and shields, although deflection bonuses and force effects work normally against them.' }],
    traits: 'Incorpóreo: imune a críticos e dano de precisão; só é afetado por magia, armas mágicas e outros incorpóreos (metade do dano de fontes corpóreas). Deflection = Cha (mín. +1), aplicada automaticamente.' },
  { id: 'swarm', name: 'Swarm', group: 'Geral', flags: { swarm: true }, immunities: ['critical hits', 'flanking', 'bull rush', 'grapple', 'trip', 'single-target spells'],
    abilities: [
      { name: 'Swarm Traits', kind: 'Ex', placement: 'defensive', short: 'swarm traits', text: 'A swarm has no clear front or back and no discernible anatomy, so it is not subject to critical hits or flanking. A swarm of Tiny creatures takes half damage from slashing and piercing weapons; a swarm of Fine or Diminutive creatures is immune to all weapon damage. It is never staggered or reduced to a dying state by damage, cannot be tripped, grappled, or bull rushed, and is immune to spells or effects that target a specific number of creatures. It takes half again as much damage (+50%) from spells or effects that affect an area.' },
      { name: 'Distraction', kind: 'Ex', placement: 'specialAttack', short: 'distraction (DC {dcCon})', text: 'A creature with this ability can nauseate the creatures that it damages. Any living creature that takes damage from the swarm is nauseated for 1 round; a Fortitude save (DC {dcCon}) negates the effect. Spellcasting or concentrating on spells within the area of a swarm requires a caster level check (DC 20 + spell level).' },
    ],
    traits: 'Enxame (PF1e): espaço 10 ft., alcance 0; ataque automático "swarm" pelo HD (1d6 por 5 HD, máx. 5d6); imune a críticos, flanqueio, manobras e magias de alvo único; +50% de dano de área. Fine/Diminutive: imune a dano de armas (adicione a imunidade "weapon damage").' },
  { id: 'troop', name: 'Troop', group: 'Geral', flags: { troop: true }, immunities: ['flanking', 'bull rush', 'grapple', 'trip', 'single-target spells'],
    abilities: [
      { name: 'Troop Traits', kind: 'Ex', placement: 'defensive', short: 'troop traits', text: 'A troop is a collection of creatures that acts as a single creature. It is not subject to flanking, cannot be tripped, grappled, or bull rushed except by area effects, and is immune to spells or effects that target a specific number of creatures. It takes half again as much damage (+50%) from spells or effects that affect an area. It is never staggered or reduced to a dying state by damage.' },
      { name: 'Chaos of Combat', kind: 'Ex', placement: 'sq', short: 'chaos of combat', text: 'Spellcasting or concentrating on spells within the area of a troop or within its reach requires a caster level check (DC 20 + spell level). Using skills that involve patience and concentration requires a successful DC 20 Will save.' },
    ],
    traits: 'Tropa (PF1e): ocupa 20×20 ft. com o tamanho das criaturas componentes; ataque automático "troop" pelo HD (1d6 por 5 HD, máx. 5d6) + For; imune a flanqueio, manobras e magias de alvo único; +50% de dano de área.' },
  { id: 'cold', name: 'Cold', group: 'Elemento', elements: { ice: 'immune', fire: 'weak' }, traits: 'Subtipo do PF; equivale ao Ice do FFd20 (imune a gelo, vulnerável a fogo).' },
  { id: 'air', name: 'Air', group: 'Elemento', elements: { wind: 'immune', ice: 'weak' }, traits: 'Subtipo do PF; equivale ao Wind do FFd20.' },
  { id: 'shapechanger', name: 'Shapechanger', group: 'Geral', traits: 'Muda de forma (PF1e).' },
  { id: 'chaotic', name: 'Chaotic', group: 'Geral', traits: '' }, { id: 'evil', name: 'Evil', group: 'Geral', traits: '' },
  { id: 'good', name: 'Good', group: 'Geral', traits: '' }, { id: 'lawful', name: 'Lawful', group: 'Geral', traits: '' },
];
export const SUBTYPE_BY_ID = Object.fromEntries(SUBTYPES.map((s) => [s.id, s]));

export const SENSES_COMMON = ['darkvision 60 ft.', 'darkvision 120 ft.', 'low-light vision', 'blindsense 30 ft.', 'blindsense 60 ft.', 'blindsight 30 ft.', 'blindsight 60 ft.', 'tremorsense 30 ft.', 'tremorsense 60 ft.', 'scent', 'see in darkness', 'see invisibility', 'true seeing', 'mist vision', 'snow vision', 'cloud sight', 'hypersenses'];

// ------------------------------------------------------------------ Pathfinder 1e
export const SYSTEMS = { ffd20: 'FFd20', pf1e: 'Pathfinder 1e' };
export const PF_ENERGIES = ['acid', 'cold', 'electricity', 'fire', 'sonic'];
export const PF_ENERGY_PT = { acid: 'Ácido', cold: 'Frio', electricity: 'Eletricidade', fire: 'Fogo', sonic: 'Sônico' };
// PF affinities: no absorb/strong; "weak" renders as "vulnerability to X" (+50% damage)
export const PF_AFFINITIES = { '': '—', weak: 'Vulnerável (+50%)', resist: 'Resistência X', immune: 'Imunidade' };
// FFd20 element <-> PF energy (FFd20 conversion rules: acid→earth, cold→ice, electricity→lightning, fire→fire, sonic→non-elemental)
export const FF_TO_PF = { fire: 'fire', ice: 'cold', lightning: 'electricity', earth: 'acid' };
export const PF_TO_FF = { fire: 'fire', cold: 'ice', electricity: 'lightning', acid: 'earth' };
export const elementsFor = (system) => (system === 'pf1e' ? PF_ENERGIES : ELEMENTS);
export const elementNamePT = (system, el) => (system === 'pf1e' ? PF_ENERGY_PT[el] : ELEMENT_PT[el]) || el;

// Type rules where Pathfinder differs from the FFd20 overrides above
const PF_UNDEAD_IMM = ['mind-affecting effects', 'bleed', 'death effects', 'disease', 'paralysis', 'poison', 'sleep', 'stun', 'nonlethal damage', 'ability drain', 'energy drain', 'fatigue', 'exhaustion', 'Fort-save effects'];
const PF_CONSTRUCT_IMM = ['mind-affecting effects', 'bleed', 'disease', 'death effects', 'necromancy effects', 'paralysis', 'poison', 'sleep', 'stun', 'ability damage', 'ability drain', 'fatigue', 'exhaustion', 'energy drain', 'nonlethal damage', 'Fort-save effects'];
export const PF_TYPE_OVERRIDES = {
  undead: { elements: {}, immunities: PF_UNDEAD_IMM, traits: 'Sem Con (usa Car para PV e Fort). Imunidades padrão de morto-vivo do PF1e. Energia negativa cura, positiva fere. Destruído a 0 PV.' },
  construct: { immunities: PF_CONSTRUCT_IMM, traits: 'Sem Con. Imunidades padrão de constructo do PF1e. PV bônus por tamanho. Destruído a 0 PV.' },
  ooze: { flags: { noInt: true }, traits: 'Mindless, cego (blindsight), imune a efeitos visuais, veneno, sono, paralisia, polimorfia, atordoamento, críticos e flanqueio.' },
  dragon: { traits: 'Imune a sono mágico e paralisia; darkvision 60 ft. e visão na penumbra.' },
};
// Elemental subtypes with Pathfinder rules
export const PF_SUBTYPE_OVERRIDES = {
  fire: { elements: { fire: 'immune', cold: 'weak' }, traits: 'Imune a fogo, vulnerável a frio.' },
  cold: { elements: { cold: 'immune', fire: 'weak' }, traits: 'Imune a frio, vulnerável a fogo.' },
  air: { elements: {}, traits: 'Geralmente voa; Fly é perícia de classe.' },
  earth: { elements: {}, senses: ['tremorsense 60 ft.'], traits: 'Geralmente escava e tem tremorsense.' },
  water: { elements: {}, traits: 'Deslocamento de natação, respira água.' },
};
