import { html, useState, useMemo, useEffect, useRef } from '../../vendor/ui.mjs';
import { Section, Field, Text, TextArea, Num, Select, Check, Chips, SearchPicker, ListEditor, toast } from './components.js';
import { compute, crAnalysis, newAttack, uid } from '../rules/engine.js';
import { buildStatblock, statblockHTML } from '../rules/statblock.js';
import {
  ABILITIES, ABILITY_NAMES, ABILITY_LONG, mod, sign, CR_LIST, crLabel, SIZES, SIZE_PT, SIZE_DATA, ALIGNMENTS,
  suggestedHD, BOSS_TIERS, CASTER_TIERS, NPC_ARRAYS, npcGear, PC_WEALTH, scaleDiceForSize, statsForCR, ordinal,
} from '../rules/tables.js';
import { TYPES, SUBTYPES, ELEMENTS, ELEMENT_PT, AFFINITIES, IMMUNITY_GROUPS, SENSES_COMMON } from '../rules/types.js';
import { SKILLS, NPC_SKILL_SELECTIONS } from '../rules/skills.js';
import { featEffect, featKey } from '../rules/featEffects.js';
import { NATURAL_ATTACKS, WEAPONS, ABILITY_TEMPLATES, BURST_TEMPLATE, MOD_TARGETS, BONUS_TYPES } from '../rules/presets.js';
import { exportMarkdown } from '../export.js';

const PLACEMENTS = [['specialAttack', 'Special Attacks'], ['defensive', 'Defensive Abilities'], ['sq', 'SQ'], ['aura', 'Aura'], ['hidden', 'Só descrição / oculto']];
const KINDS = [['Ex', 'Ex'], ['Su', 'Su'], ['Sp', 'Sp'], ['', '—']];
const CAT_PT = { core: 'Core', base: 'Base', hybrid: 'Híbridas', misc: 'Diversas', npc: 'Classes de NPC', prestige: 'Prestígio', homebrew: 'Homebrew' };

export function Editor({ app, mode, def, setDef, onSave, onSaveCopy, onNew, dirty, inLibrary }) {
  const { db, homebrew, folders } = app;
  const c = useMemo(() => compute(def, { ...db, homebrew }), [def, db, homebrew]);
  const blocks = useMemo(() => buildStatblock(def, c), [def, c]);
  const sbHTML = useMemo(() => statblockHTML(blocks), [blocks]);
  const up = (patch) => setDef((d) => ({ ...d, ...patch }));
  const upIn = (key, patch) => setDef((d) => ({ ...d, [key]: { ...(d[key] || {}), ...patch } }));
  const npc = mode === 'npc';

  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return html`<div class="editor">
    <div class="ed-toolbar">
      <input class="ed-name" value=${def.name} onInput=${(e) => up({ name: e.target.value })} placeholder="Nome" />
      <span class="cr-pill">CR ${crLabel(c.cr)}</span>
      ${dirty ? html`<span class="unsaved">● alterações não salvas</span>` : inLibrary ? html`<span class="saved">✓ salvo na biblioteca</span>` : html`<span class="muted small">novo (ainda não salvo)</span>`}
      <div class="spacer"></div>
      <button class="btn primary" onClick=${onSave} title="Ctrl+S">Salvar</button>
      <button class="btn" onClick=${onSaveCopy}>Salvar como cópia</button>
      <button class="btn" onClick=${() => exportMarkdown(app, def, c)}>Exportar .md</button>
      <button class="btn ghost" onClick=${onNew}>Novo</button>
    </div>
    <div class="ed-columns">
      <div class="ed-form">
        <${IdentitySection} def=${def} up=${up} folders=${folders} app=${app} />
        ${npc ? html`<${NpcRaceSection} def=${def} up=${up} db=${db} c=${c} />` : html`<${MonsterTypeSection} def=${def} up=${up} c=${c} homebrew=${homebrew} />`}
        <${ClassesSection} def=${def} up=${up} db=${db} c=${c} npc=${npc} homebrew=${homebrew} />
        <${AbilitiesSection} def=${def} up=${up} upIn=${upIn} c=${c} npc=${npc} />
        <${DefenseSection} def=${def} up=${up} upIn=${upIn} c=${c} />
        <${OffenseSection} def=${def} up=${up} upIn=${upIn} c=${c} />
        <${FeatsSection} def=${def} up=${up} c=${c} db=${db} homebrew=${homebrew} />
        <${SkillsSection} def=${def} up=${up} c=${c} npc=${npc} />
        <${MagicSection} def=${def} up=${up} upIn=${upIn} c=${c} db=${db} npc=${npc} />
        <${AbilitiesListSection} def=${def} up=${up} c=${c} homebrew=${homebrew} />
        ${(def.boss === 'boss' || def.boss === 'super') ? html`<${BossSection} def=${def} up=${up} c=${c} />` : null}
        <${ModifiersSection} def=${def} up=${up} />
        <${ExtrasSection} def=${def} up=${up} upIn=${upIn} c=${c} npc=${npc} />
      </div>
      <aside class="ed-preview">
        ${c.warnings.length ? html`<div class="warnings">${c.warnings.map((w) => html`<div>⚠ ${w}</div>`)}</div>` : null}
        <div class="sb-wrap" dangerouslySetInnerHTML=${{ __html: sbHTML }}></div>
        ${!npc ? html`<${CRAnalysis} def=${def} c=${c} />` : html`<${NpcWealth} def=${def} c=${c} />`}
      </aside>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ identity & image
function IdentitySection({ def, up, folders, app }) {
  const fileRef = useRef();
  const uploadFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return toast('Selecione um arquivo de imagem.', 'error');
    try {
      const url = await app.store.uploadImage(file);
      up({ image: { src: url, kind: 'local' } });
      toast('Imagem adicionada.');
    } catch (e) { toast(`Falha ao enviar imagem: ${e.message}`, 'error'); }
  };
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); uploadFile(item.getAsFile()); }
  };
  return html`<${Section} title="Identidade" id="identity">
    <div class="grid">
      <${Field} label="Pasta"><${Select} value=${def.folderId || ''} onChange=${(v) => up({ folderId: v || null })} options=${[['', '(sem pasta)'], ...folders.map((f) => [f.id, folderPath(folders, f.id)])]} /></${Field}>
      <${Field} label="Alinhamento"><${Select} value=${def.alignment} onChange=${(v) => up({ alignment: v })} options=${[...ALIGNMENTS.map((a) => [a, a]), ['Any', 'Any'], ['Varies', 'Varies']]} /></${Field}>
      <${Field} label="Tamanho"><${Select} value=${def.size} onChange=${(v) => up({ size: v })} options=${SIZES.map((s) => [s, SIZE_PT[s]])} /></${Field}>
      <${Field} label="Tags" hint="Separadas por vírgula"><${Text} value=${(def.tags || []).join(', ')} onInput=${(v) => up({ tags: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></${Field}>
      <${Field} label="Texto de abertura (flavor)" wide><${TextArea} rows=${2} value=${def.flavor} onInput=${(v) => up({ flavor: v })} /></${Field}>
    </div>
    <div class="image-box" onPaste=${onPaste} tabIndex="0"
      onDragOver=${(e) => e.preventDefault()} onDrop=${(e) => { e.preventDefault(); uploadFile(e.dataTransfer.files[0]); }}>
      <div class="image-preview">${def.image?.src ? html`<img src=${def.image.src} alt="" />` : html`<span>Sem imagem<br /><small>arraste, cole (Ctrl+V) ou escolha</small></span>`}</div>
      <div class="image-controls">
        <${Field} label="Link da imagem (URL)"><${Text} value=${def.image?.kind === 'url' ? def.image.src : ''} placeholder="https://…" onInput=${(v) => up({ image: { src: v.trim(), kind: v.trim() ? 'url' : '' } })} /></${Field}>
        <div class="row">
          <button class="btn small" onClick=${() => fileRef.current.click()}>Arquivo local…</button>
          ${def.image?.src ? html`<button class="btn small ghost" onClick=${() => up({ image: { src: '', kind: '' } })}>Remover</button>` : null}
          <input ref=${fileRef} type="file" accept="image/*" style="display:none" onChange=${(e) => uploadFile(e.target.files[0])} />
        </div>
        ${def.image?.kind === 'local' ? html`<div class="muted small">Arquivo local guardado na biblioteca.</div>` : null}
      </div>
    </div>
  </${Section}>`;
}
export function folderPath(folders, id) {
  const parts = [];
  let f = folders.find((x) => x.id === id);
  let guard = 0;
  while (f && guard++ < 20) { parts.unshift(f.name); f = folders.find((x) => x.id === f.parentId); }
  return parts.join(' / ');
}

// ------------------------------------------------------------------ monster type & CR
function MonsterTypeSection({ def, up, c, homebrew }) {
  const allTypes = [...TYPES, ...(homebrew.types || [])];
  const allSub = [...SUBTYPES, ...(homebrew.subtypes || []).map((s) => ({ ...s, group: 'Homebrew' }))];
  const [custom, setCustom] = useState('');
  const sugg = suggestedHD(def.type, def.cr);
  const addSub = (id) => { if (id && !def.subtypes.includes(id)) up({ subtypes: [...def.subtypes, id] }); };
  const t = c.type;
  return html`<${Section} title="Tipo, Subtipos e CR" id="mtype">
    <div class="grid">
      <${Field} label="CR"><${Select} value=${def.cr} onChange=${(v) => up({ cr: Number(v) })} options=${CR_LIST.map((x) => [x, crLabel(x)])} /></${Field}>
      <${Field} label="Tipo"><${Select} value=${def.type} onChange=${(v) => up({ type: v })} options=${allTypes.map((x) => [x.id, x.name])} /></${Field}>
      <${Field} label="HD raciais" hint="Dados de Vida do tipo. O botão sugere pela tabela de HD por tipo e CR.">
        <div class="row"><${Num} value=${def.racialHD} min=${0} onInput=${(v) => up({ racialHD: v })} /><button class="btn small" onClick=${() => up({ racialHD: sugg })} title="Tabela PF1e de HD por tipo/CR">Sugerir: ${sugg}</button></div>
      </${Field}>
      <${Field} label="Dado de Vida"><${Select} value=${def.hdDie || ''} onChange=${(v) => up({ hdDie: v ? Number(v) : null })} options=${[['', `auto (d${t.hd})`], ['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12']]} /></${Field}>
      <${Field} label="Saves bons" hint="Padrão do tipo; altere para Humanoid/Outsider etc.">
        <div class="row">${['fort', 'ref', 'will'].map((s) => html`<${Check} label=${s} checked=${(def.goodSaves || t.good || []).includes(s)} onChange=${(on) => {
          const cur = def.goodSaves || [...(t.good || [])];
          up({ goodSaves: on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s) });
        }} />`)}
        ${def.goodSaves ? html`<button class="btn tiny ghost" onClick=${() => up({ goodSaves: null })}>auto</button>` : null}</div>
      </${Field}>
      <${Field} label="Nível de chefe (FFd20)"><${Select} value=${def.boss} onChange=${(v) => up({ boss: v })} options=${Object.entries(BOSS_TIERS).map(([k, v]) => [k, v.label])} /></${Field}>
      ${(def.boss === 'boss' || def.boss === 'super') ? html`
        <${Field} label="Multiplicador de PV"><${Select} value=${def.bossHPMult} onChange=${(v) => up({ bossHPMult: Number(v) })} options=${[['2', '×2 (Boss / Super Boss com vidas)'], ['3', '×3 (Super Boss sem vidas)']]} /></${Field}>
        <${Field} label=" "><${Check} label="Usar d12 (como nos chefes oficiais)" checked=${def.bossD12} onChange=${(v) => up({ bossD12: v })} /></${Field}>` : null}
    </div>
    <${Field} label="Subtipos" wide>
      <${Chips} items=${c.subtypes} render=${(s) => s.name || s.id} onRemove=${(s) => up({ subtypes: def.subtypes.filter((x) => x !== s.id) })} />
      <div class="row">
        <${Select} value="" onChange=${addSub} options=${[{ value: '', label: '+ adicionar subtipo…' }, ...allSub.map((s) => ({ value: s.id, label: s.name, group: s.group }))]} />
        <input type="text" placeholder="subtipo livre (ex.: goblin)" value=${custom} onInput=${(e) => setCustom(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter' && custom.trim()) { addSub(custom.trim().toLowerCase()); setCustom(''); } }} />
        <button class="btn small" onClick=${() => { if (custom.trim()) { addSub(custom.trim().toLowerCase()); setCustom(''); } }}>Adicionar</button>
      </div>
    </${Field}>
    <details class="traits"><summary>Traços de ${t.name}${c.subtypes.length ? ' e subtipos' : ''}</summary>
      <p><b>${t.name}:</b> d${t.hd}, BAB ${t.bab === 'full' ? 'total' : t.bab}, ${t.skillPts} + Int perícias/HD. ${t.traits}</p>
      ${c.subtypes.filter((s) => s.traits).map((s) => html`<p><b>${s.name}:</b> ${s.traits}</p>`)}
    </details>
  </${Section}>`;
}

// ------------------------------------------------------------------ NPC race
function NpcRaceSection({ def, up, db, c }) {
  const race = db.racesById[def.raceId];
  const opts = [{ value: '', label: '(sem raça / personalizado)' }, ...db.races.map((r) => ({ value: r.id, label: r.name, group: { 'core-races': 'Core', 'base-races': 'Base', 'beastman-tribes': 'Beastman', 'monstrous-races': 'Monstrous' }[r.category] || r.category }))];
  const pickRace = (id) => {
    const r = db.racesById[id];
    if (!r) return up({ raceId: '' });
    const typeId = r.type.replace(/\s+/g, '-');
    up({ raceId: id, size: r.size, type: TYPES.find((t) => t.id === typeId) ? typeId : 'humanoid', speed: { ...def.speed, land: r.speed } });
  };
  return html`<${Section} title="Raça" id="race">
    <div class="grid">
      <${Field} label="Raça"><${Select} value=${def.raceId} onChange=${pickRace} options=${opts} /></${Field}>
      ${race?.flexibleBonus ? html`<${Field} label="+2 racial em"><${Select} value=${def.raceBonus} onChange=${(v) => up({ raceBonus: v })} options=${ABILITIES.map((a) => [a, ABILITY_LONG[a]])} /></${Field}>` : null}
      <${Field} label="Tipo"><${Select} value=${def.type} onChange=${(v) => up({ type: v })} options=${TYPES.map((x) => [x.id, x.name])} /></${Field}>
      <${Field} label="HD raciais" hint="Normalmente 0 para raças jogáveis; use para monstros com níveis de classe."><${Num} value=${def.racialHD} min=${0} onInput=${(v) => up({ racialHD: v })} /></${Field}>
    </div>
    ${race ? html`<details class="traits"><summary>Traços raciais de ${race.name} (${Object.entries(race.abilityMods).map(([k, v]) => `${sign(v)} ${ABILITY_NAMES[k]}`).join(', ') || '+2 à escolha'}, ${race.size}, ${race.speed} ft.)</summary>
      ${race.traits.filter((t) => !['Type', 'Size', 'Base Speed', 'Languages'].includes(t.name)).map((t) => html`<p><b>${t.name}:</b> ${t.text}
        <button class="btn tiny ghost" title="Adicionar como habilidade especial (SQ)" onClick=${() => up({ abilitiesList: [...def.abilitiesList, { id: uid(), name: t.name.replace(/\s*\((Ex|Su|Sp)\)/, ''), kind: (t.name.match(/\((Ex|Su|Sp)\)/) || [])[1] || 'Ex', placement: 'sq', short: '', text: t.text }] })}>+ SQ</button></p>`)}
      <p><a href=${race.source} target="_blank" rel="noopener">Página da raça ↗</a></p>
    </details>` : null}
  </${Section}>`;
}

// ------------------------------------------------------------------ classes
function ClassesSection({ def, up, db, c, npc, homebrew }) {
  const allClasses = [...db.classes, ...(homebrew.classes || []).map((x) => ({ ...x, category: 'homebrew' }))];
  const opts = allClasses.map((x) => ({ value: x.id, label: x.name, group: CAT_PT[x.category] || x.category }));
  const add = () => up({ classes: [...def.classes, { id: uid(), classId: npc ? 'warrior' : 'warrior', level: 1 }] });
  return html`<${Section} title=${npc ? 'Classes e CR' : 'Níveis de classe (opcional)'} id="classes" badge=${c.classLevels ? `${c.classLevels} níveis` : ''} open=${npc}>
    <${ListEditor} items=${def.classes} onChange=${(v) => up({ classes: v })} addLabel="+ Classe" onAdd=${add}
      empty=${npc ? 'Adicione ao menos uma classe.' : 'Monstros normalmente não têm classes; adicione se quiser um monstro com níveis de classe.'}
      render=${(it, set) => {
        const cd = allClasses.find((x) => x.id === it.classId);
        return html`<div class="row wrap">
          <${Select} value=${it.classId} onChange=${(v) => set({ classId: v })} options=${opts} />
          <label class="inline">Nível <${Num} value=${it.level} min=${1} max=${cd?.maxLevel || 20} onInput=${(v) => set({ level: Math.max(1, Math.min(cd?.maxLevel || 20, v || 1)) })} /></label>
          ${cd ? html`<span class="muted small">d${cd.hd} · BAB ${cd.babProgression} · ${cd.skillPoints}+Int · ${cd.kind === 'basic' ? 'NPC (básica)' : 'heroica'}${cd.caster ? ` · conjurador (${(cd.castingAbility || '?').toUpperCase()})` : ''} ${cd.source ? html`· <a href=${cd.source} target="_blank" rel="noopener">página ↗</a>` : null}</span>` : null}
        </div>`;
      }} />
    <div class="grid">
      <${Field} label="Bônus de classe favorita"><${Select} value=${def.favored} onChange=${(v) => up({ favored: v })} options=${[['hp', '+1 PV por nível'], ['skill', '+1 graduação por nível'], ['none', 'Nenhum / outro']]} /></${Field}>
      ${npc ? html`
        <${Field} label="Riqueza"><${Check} label="Riqueza de PJ (CR +1)" checked=${def.pcWealth} onChange=${(v) => up({ pcWealth: v })} /></${Field}>
        <${Field} label="Limit Breaks"><${Check} label="NPC chefe (tem Limit Breaks)" checked=${def.limitBreaksEnabled} onChange=${(v) => up({ limitBreaksEnabled: v })} /></${Field}>
        <${Field} label="Nível de chefe"><${Select} value=${def.boss} onChange=${(v) => up({ boss: v })} options=${Object.entries(BOSS_TIERS).map(([k, v]) => [k, v.label])} /></${Field}>
        <${Field} label="CR" hint="Heroica: nível − 1. Básica (NPC): nível − 2. Riqueza de PJ: +1.">
          <div class="row"><b class="big">${crLabel(c.cr)}</b>
          <${Select} value=${def.crOverride ?? ''} onChange=${(v) => up({ crOverride: v === '' ? null : Number(v) })} options=${[['', 'automático'], ...CR_LIST.map((x) => [x, `forçar ${crLabel(x)}`])]} /></div>
        </${Field}>` : html`
        <${Field} label="Limit Breaks"><${Check} label="Usa Limit Breaks das classes" checked=${def.limitBreaksEnabled} onChange=${(v) => up({ limitBreaksEnabled: v })} /></${Field}>`}
    </div>
  </${Section}>`;
}

// ------------------------------------------------------------------ abilities
function AbilitiesSection({ def, up, upIn, c, npc }) {
  const race = c.race;
  const heroic = c.heroic || !c.classes.length;
  const [role, setRole] = useState('melee');
  const applyArray = (kind) => {
    const arr = NPC_ARRAYS[role][kind];
    up({ abilities: Object.fromEntries(ABILITIES.map((a, i) => [a, arr[i]])) });
  };
  const sizeBase = () => {
    const [s, dx, cn] = SIZE_DATA[def.size].base;
    up({ abilities: { ...def.abilities, str: s, dex: dx, con: cn } });
  };
  const raceMod = (a) => (race ? (race.abilityMods?.[a] || 0) + (race.flexibleBonus && def.raceBonus === a ? 2 : 0) : 0);
  return html`<${Section} title="Atributos" id="abil">
    <table class="abil-table">
      <thead><tr><th></th><th>Base</th>${npc ? html`<th>Raça</th>` : null}<th title="Aumentos de nível, itens, templates">Ajuste</th><th>Total</th><th>Mod</th></tr></thead>
      <tbody>${ABILITIES.map((a) => html`<tr>
        <th title=${ABILITY_LONG[a]}>${ABILITY_NAMES[a]}</th>
        <td><${Num} value=${def.abilities[a]} onInput=${(v) => upIn('abilities', { [a]: v })} /></td>
        ${npc ? html`<td class="muted">${raceMod(a) ? sign(raceMod(a)) : '—'}</td>` : null}
        <td><${Num} value=${def.abilityAdjust?.[a] || 0} onInput=${(v) => upIn('abilityAdjust', { [a]: v })} /></td>
        <td><b>${c.abilities[a] === null ? '—' : c.abilities[a]}</b></td>
        <td>${c.abilities[a] === null ? '—' : sign(mod(c.abilities[a]))}</td>
      </tr>`)}</tbody>
    </table>
    <div class="row wrap">
      ${['con', 'int'].map((a) => html`<label class="inline">Sem ${ABILITY_NAMES[a]}: <${Select} value=${def.abilityNone?.[a] === null || def.abilityNone?.[a] === undefined ? 'auto' : def.abilityNone[a] ? 'yes' : 'no'}
        onChange=${(v) => upIn('abilityNone', { [a]: v === 'auto' ? null : v === 'yes' })} options=${[['auto', 'auto (pelo tipo)'], ['yes', 'sim (—)'], ['no', 'não']]} /></label>`)}
    </div>
    ${npc ? html`<div class="row wrap"><span class="muted small">Arrays do FFd20:</span>
      <${Select} value=${role} onChange=${setRole} options=${Object.entries(NPC_ARRAYS).map(([k, v]) => [k, v.label])} />
      <button class="btn small ${heroic ? '' : 'ghost'}" onClick=${() => applyArray('heroic')}>Heroico (15/14/13/12/10/8)</button>
      <button class="btn small ${heroic ? 'ghost' : ''}" onClick=${() => applyArray('basic')}>Básico (13/12/11/10/9/8)</button>
      <span class="muted small">+1 em um atributo a cada 4 níveis (use "Ajuste": ${Math.floor(c.hd / 4)} ponto(s)).</span></div>`
    : html`<div class="row"><button class="btn small" onClick=${sizeBase}>Usar For/Des/Con base de ${SIZE_PT[def.size]} (${SIZE_DATA[def.size].base.join('/')})</button></div>`}
  </${Section}>`;
}

// ------------------------------------------------------------------ defense
function DefenseSection({ def, up, upIn, c }) {
  const [immAdd, setImmAdd] = useState('');
  const inheritedImm = new Set([...(c.type.immunities || []), ...c.subtypes.flatMap((s) => s.immunities || [])]);
  const removeImm = (x) => {
    if ((def.immunities || []).includes(x)) up({ immunities: def.immunities.filter((y) => y !== x) });
    else up({ immunitiesRemoved: [...(def.immunitiesRemoved || []), x] });
  };
  const addImm = (x) => {
    if (!x) return;
    up({ immunities: [...new Set([...(def.immunities || []), x])], immunitiesRemoved: (def.immunitiesRemoved || []).filter((y) => y !== x) });
  };
  const nonElemImm = c.immunities.filter((x) => !ELEMENTS.includes(x));
  return html`<${Section} title="Defesa" id="def" badge=${`CA ${c.ac.ac} · PV ${c.hp.avg}`}>
    <div class="grid">
      <${Field} label="Armadura natural"><${Num} value=${def.naturalArmor} onInput=${(v) => up({ naturalArmor: v })} /></${Field}>
      <${Field} label="PV extras" hint="Somado aos PV (ex.: template)"><${Num} value=${def.hpBonus} onInput=${(v) => up({ hpBonus: v })} /></${Field}>
      <${Field} label="DR"><${Text} value=${def.dr} placeholder="5/adamantine" onInput=${(v) => up({ dr: v })} /></${Field}>
      <${Field} label="SR" hint="Vazio = automático pelo subtipo/chefe"><div class="row"><${Num} value=${def.sr} allowEmpty onInput=${(v) => up({ sr: v })} /><${Check} label="CR+11" checked=${def.srAuto} onChange=${(v) => up({ srAuto: v })} /></div></${Field}>
      <${Field} label="Fast healing"><${Text} value=${def.fastHealing} placeholder="5" onInput=${(v) => up({ fastHealing: v })} /></${Field}>
      <${Field} label="Regeneração"><${Text} value=${def.regeneration} placeholder="5 (fire)" onInput=${(v) => up({ regeneration: v })} /></${Field}>
      <${Field} label="Defensive Abilities (texto)"><${Text} value=${def.defensiveText} placeholder="ferocity, light fortification" onInput=${(v) => up({ defensiveText: v })} /></${Field}>
      <${Field} label="Outras fraquezas"><${Text} value=${def.weaknessesText} placeholder="light sensitivity" onInput=${(v) => up({ weaknessesText: v })} /></${Field}>
    </div>
    <h4>Armadura, escudo e outros bônus de CA</h4>
    <${ListEditor} items=${def.armor} onChange=${(v) => up({ armor: v })} addLabel="+ Item de CA"
      onAdd=${() => up({ armor: [...def.armor, { id: uid(), name: 'chain shirt', kind: 'armor', bonus: 4, maxDex: 4, acp: 2 }] })}
      render=${(it, set) => html`<div class="row wrap">
        <input type="text" value=${it.name} onInput=${(e) => set({ name: e.target.value })} placeholder="nome" />
        <${Select} value=${it.kind} onChange=${(v) => set({ kind: v })} options=${[['armor', 'armadura'], ['shield', 'escudo'], ['deflection', 'deflexão'], ['dodge', 'esquiva'], ['insight', 'intuição'], ['luck', 'sorte'], ['sacred', 'sagrado'], ['profane', 'profano'], ['natural', 'natural (aprimoramento)'], ['untyped', 'sem tipo']]} />
        <label class="inline">bônus <${Num} value=${it.bonus} onInput=${(v) => set({ bonus: v })} /></label>
        ${it.kind === 'armor' ? html`<label class="inline">Des máx <${Num} value=${it.maxDex} allowEmpty onInput=${(v) => set({ maxDex: v })} /></label>` : null}
        ${it.kind === 'armor' || it.kind === 'shield' ? html`<label class="inline">penal. <${Num} value=${it.acp} onInput=${(v) => set({ acp: v })} /></label>` : null}
      </div>`} />
    <h4>Perfil elemental (FFd20)</h4>
    <div class="elements">
      ${ELEMENTS.map((el) => {
        const ov = def.elementOverrides?.[el];
        const eff = c.elements[el] || '';
        return html`<div class="el-row el-${el}">
          <span class="el-name">${ELEMENT_PT[el]}</span>
          <${Select} value=${ov === undefined || ov === null ? 'inherit' : ov} onChange=${(v) => upIn('elementOverrides', { [el]: v })}
            options=${[['inherit', `auto${eff && (ov === undefined || ov === 'inherit') ? ` (${AFFINITIES[eff]})` : ''}`], ['none', 'nenhuma'], ...Object.entries(AFFINITIES).filter(([k]) => k).map(([k, v]) => [k, v])]} />
          ${(eff === 'resist' || def.elementResist?.[el]) ? html`<${Num} value=${def.elementResist?.[el] ?? c.elementResist[el] ?? 10} onInput=${(v) => upIn('elementResist', { [el]: v })} />` : null}
        </div>`;
      })}
    </div>
    <div class="muted small">Ciclo: Vento → Terra → Raio → Água → Fogo → Gelo → Vento (cada um é forte contra o próximo). Sagrado e Sombra são opostos.</div>
    <h4>Imunidades a efeitos e status</h4>
    <${Chips} items=${nonElemImm} onRemove=${removeImm} render=${(x) => html`${x}${inheritedImm.has(x) ? html`<small class="muted"> (tipo)</small>` : null}`} />
    <div class="row">
      <${Select} value="" onChange=${addImm} options=${[{ value: '', label: '+ adicionar imunidade…' }, ...IMMUNITY_GROUPS.flatMap(([g, list]) => list.map((x) => ({ value: x, label: x, group: g })))]} />
      <input type="text" placeholder="outra (texto livre)" value=${immAdd} onInput=${(e) => setImmAdd(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') { addImm(immAdd.trim()); setImmAdd(''); } }} />
      ${(def.immunitiesRemoved || []).length ? html`<button class="btn tiny ghost" onClick=${() => up({ immunitiesRemoved: [] })}>restaurar imunidades do tipo</button>` : null}
    </div>
  </${Section}>`;
}

// ------------------------------------------------------------------ offense
function OffenseSection({ def, up, upIn, c }) {
  const addNatural = (name) => {
    const p = NATURAL_ATTACKS.find((x) => x.name === name);
    if (!p) return;
    const a = newAttack('melee', !p.weaponLike);
    Object.assign(a, { name: p.name, dice: scaleDiceForSize(p.dice, 'Medium', def.size), count: p.count || 1, primary: p.primary, critRange: 20, iterative: !!p.weaponLike });
    up({ attacks: [...def.attacks, a] });
  };
  const addWeapon = (name) => {
    const p = WEAPONS.find((x) => x.name === name);
    if (!p) return;
    const a = newAttack(p.kind || 'melee', false);
    Object.assign(a, { name: p.name, dice: scaleDiceForSize(p.dice, 'Medium', def.size), critRange: p.critRange, critMult: p.critMult, hands: p.hands || 'one', light: !!p.light, finesse: !!p.finesse, thrown: !!p.thrown, range: p.range || '' });
    up({ attacks: [...def.attacks, a] });
  };
  const detail = Object.fromEntries(c.attackDetails.map((x) => [x.id, x.text]));
  return html`<${Section} title="Ataque e Deslocamento" id="off" badge=${`BAB ${sign(c.bab)}`}>
    <div class="grid speeds">
      ${[['land', 'Terrestre'], ['fly', 'Voo'], ['swim', 'Natação'], ['climb', 'Escalada'], ['burrow', 'Escavação']].map(([k, l]) => html`<${Field} label=${l}><${Num} value=${def.speed[k]} step=${5} onInput=${(v) => upIn('speed', { [k]: v })} /></${Field}>`)}
      ${def.speed.fly ? html`<${Field} label="Manobrabilidade"><${Select} value=${def.speed.flyMan} onChange=${(v) => upIn('speed', { flyMan: v })} options=${['clumsy', 'poor', 'average', 'good', 'perfect'].map((x) => [x, x])} /></${Field}>` : null}
      <${Field} label="Outro"><${Text} value=${def.speed.other} placeholder="earth glide" onInput=${(v) => upIn('speed', { other: v })} /></${Field}>
    </div>
    <h4>Ataques</h4>
    <div class="muted small">Ataques no mesmo <b>grupo</b> formam um ataque total; grupos diferentes aparecem separados por "or". Armas fabricadas recebem ataques iterativos pelo BAB.</div>
    <${ListEditor} items=${def.attacks} onChange=${(v) => up({ attacks: v })}
      render=${(a, set) => html`<div class="attack-row">
        <div class="row wrap">
          <input type="text" class="w-name" value=${a.name} onInput=${(e) => set({ name: e.target.value })} title="nome (singular)" />
          <${Select} value=${a.kind} onChange=${(v) => set({ kind: v })} options=${[['melee', 'corpo a corpo'], ['ranged', 'à distância']]} />
          <${Check} label="natural" checked=${a.natural} onChange=${(v) => set({ natural: v, iterative: !v })} />
          ${a.natural ? html`<${Check} label="primário" checked=${a.primary !== false} onChange=${(v) => set({ primary: v })} />` : html`<${Select} value=${a.hands} onChange=${(v) => set({ hands: v })} options=${[['one', 'uma mão'], ['two', 'duas mãos'], ['off', 'mão inábil']]} />`}
          <label class="inline">qtd <${Num} value=${a.count} min=${1} onInput=${(v) => set({ count: v })} /></label>
          <label class="inline">grupo <${Num} value=${a.group} min=${1} onInput=${(v) => set({ group: v || 1 })} /></label>
        </div>
        <div class="row wrap">
          <label class="inline">dano <input type="text" class="w-dice" value=${a.dice} onInput=${(e) => set({ dice: e.target.value })} /></label>
          <label class="inline">crít <${Num} value=${a.critRange} min=${2} max=${20} onInput=${(v) => set({ critRange: v })} />–20 ×<${Num} value=${a.critMult} min=${2} max=${5} onInput=${(v) => set({ critMult: v })} /></label>
          <label class="inline">aprim. <${Num} value=${a.enhancement} onInput=${(v) => set({ enhancement: v })} /></label>
          <label class="inline">+atq <${Num} value=${a.attackBonus} onInput=${(v) => set({ attackBonus: v })} /></label>
          <label class="inline">+dano <${Num} value=${a.damageBonus} onInput=${(v) => set({ damageBonus: v })} /></label>
          <label class="inline">atrib. dano <${Select} value=${a.dmgAbility} onChange=${(v) => set({ dmgAbility: v })} options=${[['auto', 'auto'], ['str', 'For'], ['dex', 'Des'], ['cha', 'Car (swordskill)'], ['none', 'nenhum']]} /></label>
        </div>
        <div class="row wrap">
          ${!a.natural ? html`<${Check} label="leve" checked=${a.light} onChange=${(v) => set({ light: v })} /><${Check} label="finesse" checked=${a.finesse} onChange=${(v) => set({ finesse: v })} />` : null}
          ${a.kind === 'ranged' ? html`<${Check} label="arremesso (For no dano)" checked=${a.thrown} onChange=${(v) => set({ thrown: v })} />` : null}
          <${Check} label="toque" checked=${a.touch} onChange=${(v) => set({ touch: v })} />
          ${!a.natural ? html`<${Check} label="iterativos" checked=${a.iterative !== false} onChange=${(v) => set({ iterative: v })} />` : null}
          <input type="text" class="w-extra" value=${a.extra} placeholder="efeito extra (ex.: plus grab, 1d6 fire)" onInput=${(e) => set({ extra: e.target.value })} />
          <input type="text" class="w-plural" value=${a.plural} placeholder="plural" onInput=${(e) => set({ plural: e.target.value })} title="Plural usado quando qtd > 1" />
        </div>
        <div class="attack-out">${detail[a.id] || ''}</div>
      </div>`} />
    <div class="row wrap">
      <${Select} value="" onChange=${addWeapon} options=${[{ value: '', label: '+ Arma…' }, ...WEAPONS.map((w) => ({ value: w.name, label: `${w.name} (${w.dice})`, group: w.kind === 'ranged' ? 'À distância' : 'Corpo a corpo' }))]} />
      <${Select} value="" onChange=${addNatural} options=${[{ value: '', label: '+ Ataque natural…' }, ...NATURAL_ATTACKS.map((w) => ({ value: w.name, label: `${w.name} (${scaleDiceForSize(w.dice, 'Medium', def.size)}${w.primary ? '' : ', secundário'})` }))]} />
      <button class="btn small" onClick=${() => up({ attacks: [...def.attacks, newAttack('melee', false)] })}>+ Ataque vazio</button>
    </div>
    <div class="grid">
      <${Field} label="Espaço" hint=${`Padrão: ${c.space}`}><${Text} value=${def.spaceOverride} placeholder=${SIZE_DATA[def.size].space} onInput=${(v) => up({ spaceOverride: v })} /></${Field}>
      <${Field} label="Alcance" hint="Ex.: 10 ft."><${Text} value=${def.reachOverride} placeholder=${`${SIZE_DATA[def.size].reach} ft.`} onInput=${(v) => up({ reachOverride: v })} /></${Field}>
      <${Field} label="Notas de alcance"><${Text} value=${def.reachNotes} placeholder="15 ft. with bite" onInput=${(v) => up({ reachNotes: v })} /></${Field}>
      <${Field} label="Special Attacks (texto extra)" wide><${Text} value=${def.statusInflicts} placeholder="berserk (DC 14), poison" onInput=${(v) => up({ statusInflicts: v })} /></${Field}>
    </div>
  </${Section}>`;
}

// ------------------------------------------------------------------ feats
function FeatsSection({ def, up, c, db, homebrew }) {
  const all = useMemo(() => [...(homebrew.feats || []).map((f) => ({ ...f, source: 'Homebrew' })), ...db.feats], [db.feats, homebrew.feats]);
  const [srcFilter, setSrcFilter] = useState('');
  const add = (f, q) => {
    const id = uid();
    const eff = featEffect(f.name);
    const feat = { id, name: f.name, param: '', bonus: false, source: f.source };
    const toggles = { ...(def.toggles || {}) };
    if (eff?.toggle) toggles[id] = true;
    up({ feats: [...def.feats, feat], toggles });
    void q;
  };
  const addCustom = () => {
    const name = prompt('Nome do feat:');
    if (name) up({ feats: [...def.feats, { id: uid(), name, param: '', bonus: false, source: 'custom' }] });
  };
  const featInfo = (name) => all.find((f) => f.name.toLowerCase() === name.toLowerCase());
  const prereqWarn = (f) => {
    const info = featInfo(f.name);
    if (!info || !info.prerequisites) return '';
    const p = info.prerequisites;
    const issues = [];
    for (const m of p.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)/g)) {
      const a = m[1].toLowerCase();
      if ((c.abilities[a] ?? 0) < Number(m[2])) issues.push(`${m[1]} ${m[2]}`);
    }
    const bab = p.match(/(?:base attack bonus|BAB)\s*\+(\d+)/i);
    if (bab && c.bab < Number(bab[1])) issues.push(`BAB +${bab[1]}`);
    const names = new Set(def.feats.map((x) => featKey(x.name)));
    for (const part of p.split(/,|;/)) {
      const k = featKey(part.replace(/\bfeat\b/i, ''));
      if (k && all.some((x) => featKey(x.name) === k && x.name.length > 3) && !names.has(k) && !/^(str|dex|con|int|wis|cha|bab|base|caster|character|spellcaster|proficiency)/i.test(k)) issues.push(part.trim());
    }
    return issues.length ? `Pré-requisitos não atendidos: ${issues.join(', ')}` : '';
  };
  return html`<${Section} title="Feats" id="feats" badge=${`${c.featsTaken}/${c.featBudget}`}>
    <div class="muted small">Feats disponíveis pelo HD: ${c.featBudget} (1 + 1 a cada 2 HD após o 1º${c.race && ['hume', 'half-breed'].includes(c.race.id) ? ' + 1 racial' : ''}). Feats marcados como "bônus" (de classe) não contam. Feats com ⚙ são calculados automaticamente.</div>
    <${ListEditor} items=${def.feats} onChange=${(v) => up({ feats: v })} empty="Nenhum feat."
      render=${(f, set) => {
        const eff = featEffect(f.name) || (homebrew.feats || []).find((h) => featKey(h.name) === featKey(f.name));
        const info = featInfo(f.name);
        const warn = prereqWarn(f);
        return html`<div class="feat-row">
          <div class="row wrap">
            <b>${eff && (eff.mods || eff.attack || eff.flag) ? '⚙ ' : ''}${f.name}</b>
            ${(eff?.param || /\(/.test(info?.name || '') || f.param) ? html`<input type="text" class="w-param" placeholder=${eff?.param || 'parâmetro'} value=${f.param} onInput=${(e) => set({ param: e.target.value })} />` : html`<input type="text" class="w-param ghost-input" placeholder="(parâmetro)" value=${f.param} onInput=${(e) => set({ param: e.target.value })} />`}
            <${Check} label="bônus" checked=${f.bonus} onChange=${(v) => set({ bonus: v })} />
            ${eff?.toggle ? html`<${Check} label=${eff.toggle} checked=${!!def.toggles?.[f.id]} onChange=${(v) => up({ toggles: { ...def.toggles, [f.id]: v } })} />` : null}
            <span class="src-badge">${f.source || info?.source || ''}</span>
          </div>
          ${eff?.note ? html`<div class="small auto-note">${eff.note}</div>` : null}
          ${info ? html`<div class="small muted">${info.prerequisites ? html`<i>Pré: ${info.prerequisites}.</i> ` : null}${info.benefit}</div>` : null}
          ${warn ? html`<div class="small warn">${warn}</div>` : null}
        </div>`;
      }} />
    <div class="row">
      <${Select} value=${srcFilter} onChange=${setSrcFilter} options=${[['', 'Todas as fontes'], ['FFd20', 'FFd20'], ['Pathfinder', 'Pathfinder'], ['Homebrew', 'Homebrew']]} />
      <button class="btn small ghost" onClick=${addCustom}>+ feat personalizado</button>
    </div>
    <${SearchPicker} items=${all} getText=${(f) => f.name} onPick=${add} placeholder="Buscar feat (FFd20, Pathfinder, homebrew)…"
      filter=${srcFilter ? (f) => f.source === srcFilter : null}
      renderItem=${(f) => html`<span><b>${featEffect(f.name) ? '⚙ ' : ''}${f.name}</b> <span class="src-badge">${f.source}${f.category ? ` · ${f.category}` : ''}</span><br /><span class="small muted">${f.benefit?.slice(0, 160)}</span></span>`} />
  </${Section}>`;
}

// ------------------------------------------------------------------ skills
function SkillsSection({ def, up, c, npc }) {
  const [onlyRanked, setOnlyRanked] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [simple, setSimple] = useState([]);
  const setRanks = (name, v) => up({ skills: { ...def.skills, [name]: v } });
  const setMisc = (name, v) => up({ skillMisc: { ...def.skillMisc, [name]: v } });
  const list = c.skills.filter((s) => !onlyRanked || s.ranks || def.skillMisc?.[s.name]);
  const firstClass = c.classes[0];
  const selections = firstClass ? (NPC_SKILL_SELECTIONS[firstClass.def.id] || firstClass.def.skillPoints) + Math.max(0, mod(c.abilities.int ?? 10)) : 0;
  const applySimple = () => {
    const skills = { ...def.skills };
    for (const s of simple) skills[s] = c.hd;
    up({ skills });
    setSimple([]);
  };
  return html`<${Section} title="Perícias" id="skills" badge=${`${c.skillPoints.used}/${c.skillPoints.available}`}>
    <div class="muted small">Graduações: ${c.skillPoints.used} de ${c.skillPoints.available} (máx. ${c.skillPoints.maxRanks} por perícia). Perícias de classe com graduação recebem +3. Penalidade de armadura aplicada: ${c.acp ? `−${Math.abs(c.acp)}` : '0'}.</div>
    <div class="row"><${Check} label="Mostrar só perícias com graduação" checked=${onlyRanked} onChange=${setOnlyRanked} /></div>
    <table class="skills-table">
      <thead><tr><th>Perícia</th><th title="Perícia de classe">C</th><th>Grad.</th><th>Outros</th><th>Total</th>${npc ? html`<th title="Método simplificado">S</th>` : null}</tr></thead>
      <tbody>${list.map((s) => html`<tr class=${s.ranks ? 'ranked' : ''}>
        <td>${s.name} <small class="muted">${s.ability}</small></td>
        <td>${s.classSkill ? '●' : ''}</td>
        <td><${Num} value=${def.skills?.[s.name] || 0} min=${0} max=${c.hd} onInput=${(v) => setRanks(s.name, v)} /></td>
        <td><${Num} value=${def.skillMisc?.[s.name] || 0} onInput=${(v) => setMisc(s.name, v)} /></td>
        <td><b>${sign(s.total)}</b></td>
        ${npc ? html`<td><input type="checkbox" checked=${simple.includes(s.name)} onChange=${(e) => setSimple(e.target.checked ? [...simple, s.name] : simple.filter((x) => x !== s.name))} /></td>` : null}
      </tr>`)}</tbody>
    </table>
    <div class="row">
      <input type="text" placeholder="Nova perícia (ex.: Perform (sing))" value=${newSkill} onInput=${(e) => setNewSkill(e.target.value)} />
      <button class="btn small" onClick=${() => { if (newSkill.trim()) { setRanks(newSkill.trim(), 1); setNewSkill(''); } }}>Adicionar</button>
    </div>
    ${npc ? html`<div class="simple-box"><b>Método simplificado (FFd20):</b> escolha ${selections || '?'} perícias (seleções da classe + Int) na coluna S e aplique graduações = nível (${c.hd}).
      <button class="btn small" disabled=${!simple.length} onClick=${applySimple}>Aplicar a ${simple.length} perícia(s)</button></div>` : null}
  </${Section}>`;
}

// ------------------------------------------------------------------ magic
function MagicSection({ def, up, upIn, c, db, npc }) {
  const casterClasses = c.classes.filter((x) => x.def.caster).map((x) => x.def.id);
  const spellLists = [...new Set(db.spells.map((s) => s.class))];
  const [list, setList] = useState(casterClasses[0] || 'black-mage');
  const [lvFilter, setLvFilter] = useState('');
  const [custom, setCustom] = useState({ name: '', level: 1 });
  const maxSL = c.mp.maxSL;
  const spells = def.caster?.spells || [];
  const addSpell = (s) => upIn('caster', { spells: [...spells, { id: uid(), name: s.name, level: s.level }] });
  const removeSpell = (id) => upIn('caster', { spells: spells.filter((x) => x.id !== id) });
  const byLevel = {};
  for (const s of spells) (byLevel[s.level] = byLevel[s.level] || []).push(s);
  const items = useMemo(() => db.spells.filter((s) => s.class === list), [db.spells, list]);
  return html`<${Section} title="Magia (MP)" id="magic" badge=${c.mp.total ? `${c.mp.total} MP` : ''} open=${!!c.mp.total}>
    <div class="grid">
      <${Field} label="Conjurador (monstro)" hint="Tabela Creature MP Chart do FFd20. Criaturas com classes conjuradoras usam o MP da classe.">
        <${Select} value=${def.caster.tier} onChange=${(v) => upIn('caster', { tier: v })} options=${Object.entries(CASTER_TIERS)} /></${Field}>
      <${Field} label="Atributo de conjuração"><${Select} value=${def.caster.ability} onChange=${(v) => upIn('caster', { ability: v })} options=${[['int', 'Int'], ['wis', 'Sab'], ['cha', 'Car']]} /></${Field}>
      <${Field} label="MP extra"><${Num} value=${def.caster.mpBonus} onInput=${(v) => upIn('caster', { mpBonus: v })} /></${Field}>
      <${Field} label="CL (forçar)"><${Num} value=${def.caster.cl} allowEmpty onInput=${(v) => upIn('caster', { cl: v })} /></${Field}>
      <${Field} label="Nome da lista" hint="Ex.: Spells Known, Black Mage Spells Known"><${Text} value=${def.caster.listName} placeholder="automático" onInput=${(v) => upIn('caster', { listName: v })} /></${Field}>
    </div>
    ${c.mp.parts.length ? html`<div class="mp-break">${c.mp.parts.map((p) => html`<div>${p.source}: ${p.base} MP + ${p.bonus} bônus (${p.ability.toUpperCase()} ${c.abilities[p.ability] ?? '—'}, magia máx. ${p.sl ? ordinal(p.sl) : '—'})</div>`)}
      <div><b>Total: ${c.mp.total} MP</b> · CL ${c.cl} · concentração ${sign(c.concentration)} · CD base 10 + nível ${sign(c.spellDCBase - 10)}</div></div>` : html`<div class="muted small">Sem MP. Escolha um tipo de conjurador ou adicione uma classe conjuradora.</div>`}
    <h4>Magias conhecidas</h4>
    ${Object.keys(byLevel).sort((a, b) => b - a).map((lv) => html`<div class="spell-level"><b>${lv === '0' ? '0' : ordinal(Number(lv))}:</b> ${byLevel[lv].map((s) => html`<span class="chip">${s.name}<button onClick=${() => removeSpell(s.id)}>×</button></span>`)}</div>`)}
    <div class="row wrap">
      <${Select} value=${list} onChange=${setList} options=${spellLists.map((x) => [x, `Lista: ${x.replace(/-/g, ' ')}`])} />
      <${Select} value=${lvFilter} onChange=${setLvFilter} options=${[['', 'todos os níveis'], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => [String(l), `nível ${l}`])]} />
      ${maxSL ? html`<span class="muted small">Nível máximo: ${ordinal(maxSL)}</span>` : null}
    </div>
    <${SearchPicker} items=${items} getText=${(s) => s.name} onPick=${addSpell} placeholder="Buscar magia…"
      filter=${(s) => (lvFilter === '' || s.level === Number(lvFilter)) && (!maxSL || s.level <= maxSL || lvFilter !== '')}
      renderItem=${(s) => html`<span><b>${s.name}</b> <span class="src-badge">${s.level}</span> <span class="small muted">${s.summary?.slice(0, 120)}</span></span>`} />
    <div class="row">
      <input type="text" placeholder="Magia personalizada" value=${custom.name} onInput=${(e) => setCustom({ ...custom, name: e.target.value })} />
      <label class="inline">nível <${Num} value=${custom.level} min=${0} max=${9} onInput=${(v) => setCustom({ ...custom, level: v })} /></label>
      <button class="btn small" onClick=${() => { if (custom.name.trim()) { addSpell({ name: custom.name.trim(), level: custom.level }); setCustom({ name: '', level: custom.level }); } }}>Adicionar</button>
    </div>
    <h4>Spell-Like Abilities</h4>
    <${ListEditor} items=${def.caster.sla || []} onChange=${(v) => upIn('caster', { sla: v })} addLabel="+ SLA" onAdd=${() => upIn('caster', { sla: [...(def.caster.sla || []), { id: uid(), freq: 'At will', name: '' }] })}
      render=${(s, set) => html`<div class="row"><input type="text" class="w-freq" value=${s.freq} onInput=${(e) => set({ freq: e.target.value })} placeholder="At will / 3/day" /><input type="text" value=${s.name} onInput=${(e) => set({ name: e.target.value })} placeholder="magia (DC 15)" /></div>`} />
    <${Field} label="CL das SLAs"><${Num} value=${def.caster.slaCL} allowEmpty placeholder=${String(c.hd)} onInput=${(v) => upIn('caster', { slaCL: v })} /></${Field}>
    ${npc ? null : null}
  </${Section}>`;
}

// ------------------------------------------------------------------ special abilities & class features
function AbilitiesListSection({ def, up, c, homebrew }) {
  const templates = [...(homebrew.abilities || []).map((a) => ({ ...a, group: 'Homebrew' })), ...ABILITY_TEMPLATES.map((a) => ({ ...a, group: 'Universal Monster Rules' }))];
  const addTemplate = (name) => {
    const t = templates.find((x) => x.name === name);
    if (t) up({ abilitiesList: [...def.abilitiesList, { id: uid(), name: t.name, kind: t.kind, placement: t.placement, short: t.short, text: t.text }] });
  };
  const setFeature = (key, patch) => up({ classFeatures: { ...def.classFeatures, [key]: { ...(def.classFeatures?.[key] || {}), ...patch } } });
  const byClass = {};
  for (const f of c.classFeatureList) (byClass[f.className] = byClass[f.className] || []).push(f);
  return html`<${Section} title="Habilidades especiais" id="abilities" badge=${def.abilitiesList.length || ''}>
    <div class="muted small">Use {hd}, {dcCon}, {dcCha}, {dcWis}, {dcMental}, {cl}, {str}… no texto para valores calculados automaticamente.</div>
    <${ListEditor} items=${def.abilitiesList} onChange=${(v) => up({ abilitiesList: v })} addLabel="+ Habilidade única"
      onAdd=${() => up({ abilitiesList: [...def.abilitiesList, { id: uid(), name: 'Nova habilidade', kind: 'Su', placement: 'specialAttack', short: '', text: '' }] })}
      render=${(a, set) => html`<div class="ability-row">
        <div class="row wrap">
          <input type="text" class="w-name" value=${a.name} onInput=${(e) => set({ name: e.target.value })} />
          <${Select} value=${a.kind} onChange=${(v) => set({ kind: v })} options=${KINDS} />
          <${Select} value=${a.placement} onChange=${(v) => set({ placement: v })} options=${PLACEMENTS} />
          <${Check} label="Blue Magic" checked=${a.blue} onChange=${(v) => set({ blue: v })} title="Aprendível por Blue Mage" />
        </div>
        <input type="text" value=${a.short} placeholder="texto na linha (ex.: breath weapon (30-ft. cone, 6d6 fire, DC {dcCon}))" onInput=${(e) => set({ short: e.target.value })} />
        <textarea rows="2" value=${a.text} placeholder="Descrição completa (Special Abilities)" onInput=${(e) => set({ text: e.target.value })}></textarea>
      </div>`} />
    <${Select} value="" onChange=${addTemplate} options=${[{ value: '', label: '+ Inserir modelo (UMR / homebrew)…' }, ...templates.map((t) => ({ value: t.name, label: t.name, group: t.group }))]} />
    ${c.classFeatureList.length ? html`<h4>Características de classe (automáticas)</h4>
      <div class="muted small">Escolha onde cada característica aparece no statblock, adicione notas (ex.: talentos escolhidos) ou mostre a descrição completa.</div>
      ${Object.entries(byClass).map(([cls, list]) => html`<details class="cf-group" open><summary>${cls} (${list.length})</summary>
        ${list.map((f) => html`<div class="cf-row">
          <div class="row wrap">
            <span class="cf-name"><b>${f.name}</b>${f.kind ? ` (${f.kind})` : ''} <small class="muted">nv ${f.level}${f.value ? ` · ${f.value}` : ''}</small></span>
            <${Select} value=${f.placement} onChange=${(v) => setFeature(f.key, { placement: v })} options=${PLACEMENTS} />
            <input type="text" class="w-note" placeholder="nota / escolhas" value=${f.note} onInput=${(e) => setFeature(f.key, { note: e.target.value })} />
            <${Check} label="descrição" checked=${f.showText} onChange=${(v) => setFeature(f.key, { showText: v })} />
          </div>
          <details class="cf-text"><summary>texto</summary><p>${f.text}</p></details>
        </div>`)}
      </details>`)}` : null}
    ${def.limitBreaksEnabled && c.limitBreaks.length ? html`<h4>Limit Breaks (${c.limitBreakUses}/dia)</h4>
      ${c.limitBreaks.map((l) => html`<p class="small"><b>${l.name} (${l.type})</b> — ${l.text}</p>`)}
      <${Check} label="Incluir texto dos Limit Breaks no statblock" checked=${def.showLimitBreakText} onChange=${(v) => up({ showLimitBreakText: v })} />` : null}
  </${Section}>`;
}

// ------------------------------------------------------------------ boss
function BossSection({ def, up, c }) {
  return html`<${Section} title="Chefe: Burst Mode e Fases" id="boss">
    <div class="muted small">Burst Mode (FFd20): ação rápida com 50% dos PV ou menos; ${c.tpl.burstUses} uso(s)/dia (1 + 1 a cada 4 HD) e duração de ${c.tpl.burstDuration} rodada(s) (1 + 1 a cada 4 HD), salvo indicação.</div>
    <${ListEditor} items=${def.burst || []} onChange=${(v) => up({ burst: v })} addLabel="+ Burst Mode"
      onAdd=${() => up({ burst: [...(def.burst || []), { id: uid(), ...BURST_TEMPLATE }] })}
      render=${(b, set) => html`<div class="ability-row">
        <div class="row wrap"><input type="text" class="w-name" value=${b.name} onInput=${(e) => set({ name: e.target.value })} />
          <${Select} value=${b.kind} onChange=${(v) => set({ kind: v })} options=${KINDS} />
          <label class="inline">usos <input type="text" class="w-short" value=${b.uses || ''} placeholder=${String(c.tpl.burstUses)} onInput=${(e) => set({ uses: e.target.value })} /></label>
          <label class="inline">duração <input type="text" class="w-short" value=${b.duration || ''} placeholder=${`${c.tpl.burstDuration} rounds`} onInput=${(e) => set({ duration: e.target.value })} /></label></div>
        <textarea rows="3" value=${b.text} onInput=${(e) => set({ text: e.target.value })}></textarea>
      </div>`} />
    <${Field} label="Fases (limiares de PV, mudanças de tática/afinidade)" wide><${TextArea} rows=${3} value=${def.phases} placeholder="Phase 1 (100–51%): … Phase 2 (50–0%): …" onInput=${(v) => up({ phases: v })} /></${Field}>
  </${Section}>`;
}

// ------------------------------------------------------------------ custom modifiers
function ModifiersSection({ def, up }) {
  const targets = [...MOD_TARGETS, ...SKILLS.map((s) => [`skill:${s.name}`, `Perícia: ${s.name}`])];
  return html`<${Section} title="Modificadores personalizados" id="mods" open=${false} badge=${def.modifiers.length || ''}>
    <div class="muted small">Para efeitos de características de classe, itens, buffs ou homebrew que o programa não automatiza. Bônus do mesmo tipo não se acumulam (exceto esquiva, circunstância e sem tipo). Com "condição", o bônus aparece só como nota situacional.</div>
    <${ListEditor} items=${def.modifiers} onChange=${(v) => up({ modifiers: v })} addLabel="+ Modificador"
      onAdd=${() => up({ modifiers: [...def.modifiers, { id: uid(), target: 'ac', value: 1, type: 'untyped', cond: '', note: '', enabled: true }] })}
      render=${(m, set) => html`<div class="row wrap">
        <${Check} label="" checked=${m.enabled !== false} onChange=${(v) => set({ enabled: v })} title="Ativo" />
        <${Select} value=${m.target} onChange=${(v) => set({ target: v })} options=${targets} />
        <${Num} value=${m.value} onInput=${(v) => set({ value: v })} />
        <${Select} value=${m.type} onChange=${(v) => set({ type: v })} options=${BONUS_TYPES.map((t) => [t, t])} />
        <input type="text" class="w-note" placeholder="condição (ex.: vs. fear)" value=${m.cond} onInput=${(e) => set({ cond: e.target.value })} />
        <input type="text" class="w-note" placeholder="origem (ex.: Defensive Stance)" value=${m.note} onInput=${(e) => set({ note: e.target.value })} />
      </div>`} />
  </${Section}>`;
}

// ------------------------------------------------------------------ extras / ecology
function ExtrasSection({ def, up, upIn, c, npc }) {
  const [sense, setSense] = useState('');
  return html`<${Section} title="Sentidos, idiomas, equipamento, táticas e ecologia" id="extras" open=${false}>
    <${Field} label="Sentidos" wide>
      <${Chips} items=${c.senses} onRemove=${(s) => (def.senses.includes(s) ? up({ senses: def.senses.filter((x) => x !== s) }) : up({ sensesRemoved: [...(def.sensesRemoved || []), s] }))} />
      <div class="row"><input type="text" list="senses-list" value=${sense} placeholder="+ sentido (ex.: scent)" onInput=${(e) => setSense(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter' && sense.trim()) { up({ senses: [...def.senses, sense.trim()], sensesRemoved: (def.sensesRemoved || []).filter((x) => x !== sense.trim()) }); setSense(''); } }} />
        <datalist id="senses-list">${SENSES_COMMON.map((s) => html`<option value=${s} />`)}</datalist>
        ${(def.sensesRemoved || []).length ? html`<button class="btn tiny ghost" onClick=${() => up({ sensesRemoved: [] })}>restaurar</button>` : null}</div>
    </${Field}>
    <div class="grid">
      <${Field} label="Aura"><${Text} value=${def.aura} onInput=${(v) => up({ aura: v })} /></${Field}>
      <${Field} label="Idiomas"><${Text} value=${def.languages} onInput=${(v) => up({ languages: v })} /></${Field}>
      <${Field} label="SQ (texto extra)"><${Text} value=${def.sqText} onInput=${(v) => up({ sqText: v })} /></${Field}>
      <${Field} label="Modificadores raciais de perícia"><${Text} value=${def.racialSkillMods} placeholder="+4 Stealth" onInput=${(v) => up({ racialSkillMods: v })} /></${Field}>
      <${Field} label="Combat Gear"><${Text} value=${def.combatGear} placeholder="potion, ether" onInput=${(v) => up({ combatGear: v })} /></${Field}>
      <${Field} label="Other Gear"><${Text} value=${def.gear} placeholder="+1 chainmail, 50 gil" onInput=${(v) => up({ gear: v })} /></${Field}>
      <${Field} label="Antes do combate" wide><${TextArea} rows=${2} value=${def.tactics.before} onInput=${(v) => upIn('tactics', { before: v })} /></${Field}>
      <${Field} label="Durante o combate" wide><${TextArea} rows=${2} value=${def.tactics.during} onInput=${(v) => upIn('tactics', { during: v })} /></${Field}>
      <${Field} label="Moral" wide><${TextArea} rows=${1} value=${def.tactics.morale} onInput=${(v) => upIn('tactics', { morale: v })} /></${Field}>
      <${Field} label="Ambiente"><${Text} value=${def.environment} onInput=${(v) => up({ environment: v })} /></${Field}>
      <${Field} label="Organização"><${Text} value=${def.organization} onInput=${(v) => up({ organization: v })} /></${Field}>
      <${Field} label="Tesouro"><${Text} value=${def.treasure} onInput=${(v) => up({ treasure: v })} /></${Field}>
      <${Field} label="Descrição / lore" wide><${TextArea} rows=${4} value=${def.description} onInput=${(v) => up({ description: v })} /></${Field}>
    </div>
    ${npc ? null : null}
  </${Section}>`;
}

// ------------------------------------------------------------------ side panels
function CRAnalysis({ def, c }) {
  const a = crAnalysis(def, c);
  if (!a) return null;
  const t = statsForCR(c.cr);
  const boss = def.boss === 'boss' || def.boss === 'super';
  return html`<div class="panel">
    <h4>Análise de CR ${crLabel(c.cr)} <small class="muted">(tabela PF1e Monster Statistics by CR)</small></h4>
    <table class="cr-table"><thead><tr><th></th><th>Criatura</th><th>Alvo</th><th></th></tr></thead><tbody>
      ${a.rows.map((r) => html`<tr class=${`st-${r.status}`}><td>${r.label}</td><td>${r.val}</td><td>${r.target}</td><td>${r.status === 'ok' ? '✓' : r.status === 'high' ? '▲' : '▼'}</td></tr>`)}
      <tr><td>CD primária / secundária</td><td>${c.tpl.dcCon} (Con) / ${c.tpl.dcMental} (mental)</td><td>${t.primaryDC} / ${t.secondaryDC}</td><td></td></tr>
    </tbody></table>
    <div class="muted small">${boss ? 'Chefes ultrapassam a tabela de propósito (PV dobrados, BAB total, saves bons).' : 'Monstros costumam se destacar em uma área e ficar atrás em outra. CA mais de 5 pontos fora do alvo sugere CR errado.'}</div>
  </div>`;
}

function NpcWealth({ def, c }) {
  const lvl = c.hd;
  const g = npcGear(lvl, c.heroic);
  return html`<div class="panel">
    <h4>Equipamento de NPC (nível ${lvl}, ${c.heroic ? 'heroico' : 'básico'})</h4>
    ${def.pcWealth ? html`<p>Riqueza de PJ: <b>${(PC_WEALTH[Math.min(20, lvl)] || 0).toLocaleString('pt-BR')} gil</b></p>` : g ? html`<table class="cr-table"><tbody>
      <tr><td>Total</td><td><b>${g.total.toLocaleString('pt-BR')} gil</b></td></tr>
      <tr><td>Armas</td><td>${g.weapons.toLocaleString('pt-BR')}</td></tr>
      <tr><td>Proteção</td><td>${g.protection.toLocaleString('pt-BR')}</td></tr>
      <tr><td>Mágicos</td><td>${g.magic.toLocaleString('pt-BR')}</td></tr>
      <tr><td>Uso limitado</td><td>${g.limited.toLocaleString('pt-BR')}</td></tr>
      <tr><td>Equipamento</td><td>${g.gear.toLocaleString('pt-BR')}</td></tr>
    </tbody></table>` : html`<p class="muted">Fora da tabela.</p>`}
    <div class="muted small">Gaste cada categoria no menor número de itens possível; sobras viram moedas/joias. XP rápido: +1 nível; lento: −1.</div>
  </div>`;
}
