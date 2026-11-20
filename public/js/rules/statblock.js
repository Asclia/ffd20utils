// Builds a Pathfinder 1e–style stat block (with FFd20 additions) from a computed creature,
// as a neutral list of blocks, then renders it to HTML or Markdown.
import { sign, crLabel, ordinal, ABILITIES, ABILITY_NAMES, CASTER_ABBR } from './tables.js';
import { gearSummary } from './equipment.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const joinNonEmpty = (arr, sep = ', ') => arr.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').join(sep);
const fmtNum = (n) => Number(n).toLocaleString('en-US');

export function buildStatblock(d, c, db) {
  const B = [];
  const line = (label, text) => { if (text !== null && text !== undefined && String(text).trim() !== '') B.push({ t: 'line', label, text: String(text) }); };
  const section = (title) => B.push({ t: 'section', title });

  // ---------------- header
  B.push({ t: 'title', name: d.name || 'Unnamed', cr: crLabel(c.cr), mr: d.mythic ? `MR ${d.mythic}` : '' });
  if (d.image?.src) B.push({ t: 'image', src: d.image.src, alt: d.name, transparent: !!d.image.transparent });
  if (d.flavor) B.push({ t: 'flavor', text: d.flavor });
  if (c.xp) B.push({ t: 'plain', text: `XP ${fmtNum(c.xp)}` });
  const raceName = c.race ? c.race.name : '';
  const classPart = c.classes.map((x) => `${x.def.name.toLowerCase()}${x.archetypeNames?.length ? ` (${x.archetypeNames.map((n) => n.toLowerCase()).join(', ')})` : ''} ${x.level}`).join('/');
  if (classPart) B.push({ t: 'plain', text: joinNonEmpty([raceName, classPart], ' ') });
  const subtypes = c.subtypes.map((s) => (s.name || s.id).toLowerCase());
  if (c.boss !== 'none') subtypes.push({ mini: 'mini-boss', boss: 'boss', super: 'super boss' }[c.boss]);
  B.push({ t: 'plain', text: `${d.alignment} ${d.size} ${c.type.name.toLowerCase()}${subtypes.length ? ` (${subtypes.join(', ')})` : ''}` });
  B.push({ t: 'plain', text: `<b>Init</b> ${sign(c.init)}; <b>Senses</b> ${joinNonEmpty([...c.senses, `Perception ${sign(c.perception)}`], '; ').replace(/; (?=[a-z])/g, ', ')}`, html: true });
  const auras = c.specialAbilities.filter((a) => a.placement === 'aura').map((a) => a.short || a.name.toLowerCase());
  if (d.aura) auras.unshift(d.aura);
  if (auras.length) line('Aura', auras.join(', '));

  // ---------------- defense
  section('Defense');
  const acParts = c.ac.parts.map(([v, n]) => `${sign(v)} ${n}`).join(', ');
  line('AC', `${c.ac.ac}, touch ${c.ac.touch}, flat-footed ${c.ac.flat}${acParts ? ` (${acParts})` : ''}${c.ac.notes.length ? `; ${c.ac.notes.join(', ')}` : ''}`);
  const pf = c.system === 'pf1e';
  line('hp', `${c.hp.avg}${pf ? '' : ` [${c.hp.max}]`} (${c.hp.expr})${c.hpExtra.length ? `; ${c.hpExtra.join('; ')}` : ''}`);
  if (c.mp.total > 0) line('MP', `${c.mp.total}`);
  line('Fort', `${sign(c.saves.fort)}, <b>Ref</b> ${sign(c.saves.ref)}, <b>Will</b> ${sign(c.saves.will)}${c.saveNotes.length ? `; ${c.saveNotes.join(', ')}` : ''}`);
  const defAbil = c.specialAbilities.filter((a) => a.placement === 'defensive').map((a) => a.short || a.name.toLowerCase());
  if (d.defensiveText) defAbil.unshift(d.defensiveText);
  const defLine = joinNonEmpty([
    defAbil.length ? `<b>Defensive Abilities</b> ${defAbil.join(', ')}` : '',
    c.dr ? `<b>DR</b> ${c.dr}` : '',
    c.absorb.length ? `<b>Absorb</b> ${c.absorb.join(', ')}` : '',
    c.immunities.length ? `<b>Immune</b> ${c.immunities.join(', ')}` : '',
    c.resist.length ? `<b>Resist</b> ${c.resist.join(', ')}` : '',
    c.strong.length ? `<b>Strong</b> ${c.strong.join(', ')}` : '',
    c.sr ? `<b>SR</b> ${c.sr}` : '',
  ], '; ');
  if (defLine) B.push({ t: 'plain', text: defLine, html: true });
  const weak = joinNonEmpty([pf ? c.weak.map((e) => `vulnerability to ${e}`).join(', ') : c.weak.join(', '), d.weaknessesText]);
  line('Weaknesses', weak);

  // ---------------- offense
  section('Offense');
  const sp = c.speed;
  const speeds = [`${sp.land || 0} ft.`];
  if (Number(sp.burrow)) speeds.push(`burrow ${sp.burrow} ft.`);
  if (Number(sp.climb)) speeds.push(`climb ${sp.climb} ft.`);
  if (Number(sp.fly)) speeds.push(`fly ${sp.fly} ft. (${sp.flyMan || 'average'})`);
  if (Number(sp.swim)) speeds.push(`swim ${sp.swim} ft.`);
  if (sp.other) speeds.push(sp.other);
  line('Speed', speeds.join(', '));
  if (c.attacks.melee.length) line('Melee', c.attacks.melee.join(' or '));
  if (c.attacks.ranged.length) line('Ranged', c.attacks.ranged.join(' or '));
  if (c.showSpace) line('Space', `${c.space}; <b>Reach</b> ${c.reach}${d.reachNotes ? ` (${d.reachNotes})` : ''}`);
  const sa = c.specialAbilities.filter((a) => a.placement === 'specialAttack').map((a) => a.short || a.name.toLowerCase());
  if (d.statusInflicts) sa.push(d.statusInflicts);
  if (c.burst.length) sa.push(...c.burst.map((b) => `${(b.name || 'burst mode').toLowerCase()}`));
  line('Special Attacks', sa.join(', '));
  // FFd20 NPC stat blocks: activated abilities get their own line under Special Attacks
  const sab = c.specialAbilities.filter((a) => a.placement === 'specialAbility').map((a) => a.short || a.name.toLowerCase());
  line('Special Abilities', sab.join(', '));
  // spell-like abilities
  const sla = (d.caster?.sla || []).filter((x) => x.name);
  if (sla.length) {
    const slaCL = d.caster.slaCL || c.hd;
    B.push({ t: 'plain', text: `<b>Spell-Like Abilities</b> (CL ${ordinal(Number(slaCL))}; concentration ${sign(Number(slaCL) + Math.max(c.abilities.cha === null ? 0 : Math.floor((c.abilities.cha - 10) / 2), 0))})`, html: true });
    const byFreq = {};
    for (const x of sla) (byFreq[x.freq || 'At will'] = byFreq[x.freq || 'At will'] || []).push(x.name);
    for (const [f, names] of Object.entries(byFreq)) B.push({ t: 'indent', text: `${f}—${names.join(', ')}` });
  }
  // spells known
  const spells = (d.caster?.spells || []).filter((x) => x.name);
  if (pf && c.pfSpells?.length) {
    // Pathfinder: spells per day by class (bonus spells from the casting ability included)
    c.pfSpells.forEach((part, i) => {
      const label = (i === 0 && d.caster?.listName) || `${part.source} Spells ${part.spontaneous ? 'Known' : 'Prepared'}`;
      B.push({ t: 'plain', text: `<b>${label}</b> (CL ${ordinal(part.cl)}; concentration ${sign(part.cl + (c.abilities[part.ability] === null ? 0 : Math.floor((c.abilities[part.ability] - 10) / 2)))})`, html: true });
      const mine = spells.filter((x) => !x.classId || x.classId === part.classId || c.pfSpells.length === 1);
      for (const lv of Object.keys(part.perDay).map(Number).sort((a, b) => b - a)) {
        const names = mine.filter((x) => Number(x.level) === lv).map((x) => x.name).sort();
        const dc = 10 + lv + (c.abilities[part.ability] === null ? 0 : Math.floor((c.abilities[part.ability] - 10) / 2));
        const count = lv === 0 ? 'at will' : part.spontaneous ? `${part.perDay[lv]}/day` : `${part.perDay[lv]}`;
        B.push({ t: 'indent', text: `${lv === 0 ? '0' : ordinal(lv)} (${count}; DC ${dc})—${names.join(', ')}` });
      }
    });
  } else if (!pf && (spells.length || c.mp.total > 0)) {
    const src = c.mp.parts.map((p) => (p.source.length <= 2 ? p.source : p.source)).join('/');
    const tierAbbr = d.caster?.tier && d.caster.tier !== 'none' ? CASTER_ABBR[d.caster.tier] : '';
    const label = d.caster?.listName || (c.classes.some((x) => x.def.caster) ? `${c.classes.filter((x) => x.def.caster).map((x) => x.def.name).join('/')} Spells Known` : 'Spells Known');
    B.push({ t: 'plain', text: `<b>${label}</b> (${tierAbbr ? `${tierAbbr} ` : ''}CL ${ordinal(c.cl || c.hd)}; concentration ${sign(c.concentration)})${src && !tierAbbr ? '' : ''}`, html: true });
    const byLvl = {};
    for (const x of spells) (byLvl[x.level] = byLvl[x.level] || []).push(x.name);
    for (const lv of Object.keys(byLvl).map(Number).sort((a, b) => b - a)) {
      const dc = c.spellDCBase + lv;
      B.push({ t: 'indent', text: `${lv === 0 ? '0 (at will)' : ordinal(lv)} (DC ${dc})—${byLvl[lv].sort().join(', ')}` });
    }
    if (c.mp.maxSL) B.push({ t: 'indent', text: `<i>Max spell level ${ordinal(c.mp.maxSL)}</i>`, html: true });
  }
  if (c.limitBreaks.length) line('Limit Breaks', `${c.limitBreaks.map((l) => l.name).join(', ')} (${c.limitBreakUses}/day)`);

  // ---------------- tactics
  const tac = d.tactics || {};
  if (tac.before || tac.during || tac.morale || d.phases) {
    section('Tactics');
    line('Before Combat', tac.before);
    line('During Combat', tac.during);
    line('Morale', tac.morale);
    if (d.phases) line('Phases', d.phases);
  }

  // ---------------- statistics
  section('Statistics');
  B.push({ t: 'plain', text: ABILITIES.map((a) => `<b>${ABILITY_NAMES[a]}</b> ${c.abilities[a] === null ? '—' : c.abilities[a]}`).join(', '), html: true });
  const cmdN = c.cmdNotes.length ? ` (${c.cmdNotes.join(', ')})` : '';
  B.push({ t: 'plain', text: `<b>Base Atk</b> ${sign(c.bab)}; <b>CMB</b> ${sign(c.cmb)}; <b>CMD</b> ${c.cmd}${cmdN}`, html: true });
  const feats = (d.feats || []).map((f) => `${f.name}${f.param ? ` (${f.param})` : ''}${f.bonus ? '<sup>B</sup>' : ''}`).sort((a, b) => a.localeCompare(b));
  if (feats.length) B.push({ t: 'plain', text: `<b>Feats</b> ${feats.join(', ')}`, html: true });
  const sk = c.skills.filter((s) => s.show).map((s) => `${s.name} ${sign(s.total)}`);
  if (sk.length) B.push({ t: 'plain', text: `<b>Skills</b> ${sk.join(', ')}${d.racialSkillMods ? `; <b>Racial Modifiers</b> ${d.racialSkillMods}` : ''}`, html: true });
  line('Languages', d.languages);
  const sq = c.specialAbilities.filter((a) => a.placement === 'sq').map((a) => a.short || a.name.toLowerCase());
  if (d.sqText) sq.push(d.sqText);
  line('SQ', sq.join(', '));
  const gs = gearSummary(d, db);
  line('Combat Gear', [...gs.combat, d.combatGear].filter(Boolean).join(', '));
  line('Other Gear', [...gs.other, d.gear].filter(Boolean).join(', '));

  // ---------------- special abilities
  const detailed = c.specialAbilities.filter((a) => a.text);
  if (detailed.length || c.burst.length || c.limitBreaks.length) {
    section('Special Abilities');
    for (const b of c.burst) B.push({ t: 'ability', name: b.name || 'Burst Mode', kind: b.kind || 'Su', text: `${b.text || ''}${b.text ? ' ' : ''}(Swift action at 50% HP or less; ${b.uses}/day; lasts ${b.duration}.)` });
    for (const a of detailed) B.push({ t: 'ability', name: a.name, kind: a.kind, text: a.text });
    if (d.showLimitBreakText) for (const l of c.limitBreaks) B.push({ t: 'ability', name: l.name, kind: l.type, text: l.text });
  }

  // ---------------- ecology
  if (d.environment || d.organization || d.treasure) {
    section('Ecology');
    line('Environment', d.environment);
    line('Organization', d.organization);
    line('Treasure', d.treasure);
  }
  if (d.description) {
    section('Description');
    B.push({ t: 'text', text: d.description });
  }
  return B;
}

// ------------------------------------------------------------------ HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Only <b>, <i>, <sup> markup produced by buildStatblock is kept; user text is escaped.
function safe(text, isHtml) {
  if (!isHtml) return esc(text);
  return esc(text).replace(/&lt;(\/?)(b|i|sup)&gt;/g, '<$1$2>');
}
export function statblockHTML(blocks, opts = {}) {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'title': out.push(`<div class="sb-title"><span>${esc(b.name)}</span><span>CR ${esc(b.cr)}${b.mr ? `/${esc(b.mr)}` : ''}</span></div>`); break;
      case 'image': if (!opts.noImage) out.push(`<div class="sb-image${b.transparent ? ' transparent' : ''}"><img src="${esc(b.src)}" alt="${esc(b.alt || '')}"></div>`); break;
      case 'flavor': out.push(`<p class="sb-flavor">${esc(b.text)}</p>`); break;
      case 'plain': out.push(`<p>${safe(b.text, b.html)}</p>`); break;
      case 'line': out.push(`<p><b>${esc(b.label)}</b> ${safe(b.text, true)}</p>`); break;
      case 'indent': out.push(`<p class="sb-indent">${safe(b.text, b.html)}</p>`); break;
      case 'section': out.push(`<div class="sb-section">${esc(b.title.toUpperCase())}</div>`); break;
      case 'ability': out.push(`<p><b>${esc(b.name)}${b.kind ? ` (${esc(b.kind)})` : ''}</b> ${esc(b.text).replace(/\n/g, '<br>')}</p>`); break;
      case 'text': out.push(`<p class="sb-desc">${esc(b.text).replace(/\n/g, '<br>')}</p>`); break;
      default: break;
    }
  }
  return `<div class="statblock">${out.join('')}</div>`;
}

// ------------------------------------------------------------------ Markdown (Obsidian friendly)
const mdInline = (s) => String(s).replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '*$1*').replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '');
export function statblockMarkdown(blocks, d, c, opts = {}) {
  const lines = [];
  const fm = {
    name: d.name, mode: d.mode === 'npc' ? 'npc' : 'monster', cr: crLabel(c.cr), type: c.type.name,
    subtypes: c.subtypes.map((s) => s.name || s.id), size: d.size, alignment: d.alignment,
    tags: ['ffd20', d.mode === 'npc' ? 'npc' : 'monster', ...(d.tags || [])],
  };
  if (opts.frontmatter !== false) {
    lines.push('---');
    for (const [k, v] of Object.entries(fm)) lines.push(`${k}: ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(String(x))).join(', ')}]` : JSON.stringify(String(v ?? ''))}`);
    lines.push('---', '');
  }
  for (const b of blocks) {
    switch (b.t) {
      case 'title': lines.push(`# ${b.name}`, '', `**CR ${b.cr}**${b.mr ? ` / ${b.mr}` : ''}`, ''); break;
      case 'image': {
        const src = opts.imagePath || b.src;
        if (src) lines.push(opts.wikiImage && opts.imagePath ? `![[${opts.imagePath}]]` : `![${(b.alt || '').replace(/[[\]]/g, '')}](${src.replace(/ /g, '%20')})`, '');
        break;
      }
      case 'flavor': lines.push(`*${b.text}*`, ''); break;
      case 'plain': lines.push(mdInline(b.text) + '  '); break;
      case 'line': lines.push(`**${b.label}** ${mdInline(b.text)}  `); break;
      case 'indent': lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;${mdInline(b.text)}  `); break;
      case 'section': lines.push('', `### ${b.title.toUpperCase()}`, '---'); break;
      case 'ability': lines.push(`**${b.name}${b.kind ? ` (${b.kind})` : ''}** ${b.text.replace(/\n/g, '  \n')}`, ''); break;
      case 'text': lines.push(b.text, ''); break;
      default: break;
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function plainSummary(d, c) {
  return `${d.name} — CR ${crLabel(c.cr)} ${cap(c.type.name)}`;
}
