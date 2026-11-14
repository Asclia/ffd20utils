import { html, useState } from '../../vendor/ui.mjs';
import { Field, Text, TextArea, Num, Select, Check, Chips, ListEditor, toast } from './components.js';
import { uid } from '../rules/engine.js';
import { ELEMENTS, ELEMENT_PT, AFFINITIES, ALL_IMMUNITIES, SENSES_COMMON } from '../rules/types.js';
import { MOD_TARGETS, BONUS_TYPES } from '../rules/presets.js';
import { babFor, goodSave, poorSave } from '../rules/tables.js';
import { SKILLS } from '../rules/skills.js';

const KINDS = [['Ex', 'Ex'], ['Su', 'Su'], ['Sp', 'Sp'], ['', '—']];
const PLACEMENTS = [['specialAttack', 'Special Attacks'], ['specialAbility', 'Special Abilities (linha)'], ['defensive', 'Defensive Abilities'], ['sq', 'SQ'], ['aura', 'Aura'], ['hidden', 'Só descrição']];
const slug = (s) => 'hb-' + String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(0, 4);

export function Homebrew({ app }) {
  const [tab, setTab] = useState('subtypes');
  const hb = app.homebrew;
  const setList = (key, list) => app.setHomebrew({ ...hb, [key]: list });
  return html`<div class="homebrew">
    <div class="seg">${[['subtypes', 'Subtipos'], ['feats', 'Feats'], ['abilities', 'Habilidades'], ['classes', 'Classes']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l} <small>${(hb[k] || []).length}</small></button>`)}</div>
    <p class="muted small">Conteúdo próprio fica disponível nos editores de Monstro e NPC, é salvo junto da biblioteca e incluído nos backups JSON.</p>
    ${tab === 'subtypes' ? html`<${SubtypesEditor} list=${hb.subtypes || []} setList=${(l) => setList('subtypes', l)} />` : null}
    ${tab === 'feats' ? html`<${FeatsEditor} list=${hb.feats || []} setList=${(l) => setList('feats', l)} />` : null}
    ${tab === 'abilities' ? html`<${AbilitiesEditor} list=${hb.abilities || []} setList=${(l) => setList('abilities', l)} />` : null}
    ${tab === 'classes' ? html`<${ClassesEditor} list=${hb.classes || []} setList=${(l) => setList('classes', l)} db=${app.db} />` : null}
  </div>`;
}

function Saveable({ initial, onSave, children }) {
  const [draft, setDraft] = useState(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  return html`<div class="hb-item">${children(draft, (p) => setDraft({ ...draft, ...p }))}
    <div class="row"><button class="btn primary small" disabled=${!dirty} onClick=${() => { onSave(draft); toast('Salvo.'); }}>Salvar</button>${dirty ? html`<span class="unsaved">● alterações não salvas</span>` : null}</div></div>`;
}

function MasterDetail({ list, setList, make, label, renderDetail }) {
  const [sel, setSel] = useState(list[0]?.id || null);
  const cur = list.find((x) => x.id === sel);
  return html`<div class="master-detail">
    <div class="md-list">
      <button class="btn small" onClick=${() => { const n = make(); setList([...list, n]); setSel(n.id); }}>+ Novo ${label}</button>
      ${list.map((x) => html`<div class="md-row ${x.id === sel ? 'sel' : ''}" onClick=${() => setSel(x.id)}>${x.name}</div>`)}
    </div>
    <div class="md-detail">${cur ? html`<div key=${cur.id}>
      <${Saveable} initial=${cur} onSave=${(d) => setList(list.map((x) => (x.id === d.id ? d : x)))}>${renderDetail}</${Saveable}>
      <button class="btn small danger" onClick=${() => { if (confirm(`Excluir "${cur.name}"?`)) { setList(list.filter((x) => x.id !== cur.id)); setSel(null); } }}>Excluir ${label}</button>
    </div>` : html`<p class="muted">Selecione ou crie um item.</p>`}</div>
  </div>`;
}

function ModsList({ mods, onChange }) {
  const targets = [...MOD_TARGETS, ...SKILLS.map((s) => [`skill:${s.name}`, `Perícia: ${s.name}`])];
  return html`<${ListEditor} items=${mods || []} onChange=${onChange} addLabel="+ Modificador" onAdd=${() => onChange([...(mods || []), { id: uid(), target: 'ac', value: 1, type: 'untyped', cond: '' }])}
    render=${(m, set) => html`<div class="row wrap">
      <${Select} value=${m.target} onChange=${(v) => set({ target: v })} options=${targets} />
      <${Num} value=${m.value} onInput=${(v) => set({ value: v })} />
      <${Select} value=${m.type} onChange=${(v) => set({ type: v })} options=${BONUS_TYPES.map((t) => [t, t])} />
      <input type="text" placeholder="condição (opcional)" value=${m.cond || ''} onInput=${(e) => set({ cond: e.target.value })} />
    </div>`} />`;
}

function AbilityRows({ list, onChange }) {
  return html`<${ListEditor} items=${list || []} onChange=${onChange} addLabel="+ Habilidade" onAdd=${() => onChange([...(list || []), { id: uid(), name: 'Habilidade', kind: 'Ex', placement: 'sq', short: '', text: '' }])}
    render=${(a, set) => html`<div class="ability-row"><div class="row wrap">
      <input type="text" value=${a.name} onInput=${(e) => set({ name: e.target.value })} />
      <${Select} value=${a.kind} onChange=${(v) => set({ kind: v })} options=${KINDS} />
      <${Select} value=${a.placement} onChange=${(v) => set({ placement: v })} options=${PLACEMENTS} /></div>
      <input type="text" placeholder="texto na linha" value=${a.short} onInput=${(e) => set({ short: e.target.value })} />
      <textarea rows="2" value=${a.text} placeholder="descrição" onInput=${(e) => set({ text: e.target.value })}></textarea></div>`} />`;
}

function SubtypesEditor({ list, setList }) {
  return html`<${MasterDetail} list=${list} setList=${setList} label="subtipo"
    make=${() => ({ id: slug('subtipo'), name: 'Novo subtipo', group: 'Homebrew', elements: {}, resist: {}, immunities: [], senses: [], abilities: [], mods: [], flags: {}, traits: '' })}
    renderDetail=${(d, set) => html`
      <div class="grid">
        <${Field} label="Nome"><${Text} value=${d.name} onInput=${(v) => set({ name: v })} /></${Field}>
        <${Field} label="DR concedida"><${Text} value=${d.dr || ''} placeholder="5/silver" onInput=${(v) => set({ dr: v })} /></${Field}>
        <${Field} label="SR = CR +"><${Num} value=${d.flags?.srCR || ''} allowEmpty onInput=${(v) => set({ flags: { ...d.flags, srCR: v || undefined } })} /></${Field}>
        <${Field} label="Dado de Vida"><${Select} value=${d.flags?.hdDie || ''} onChange=${(v) => set({ flags: { ...d.flags, hdDie: v ? Number(v) : undefined } })} options=${[['', 'do tipo'], ['6', 'd6'], ['8', 'd8'], ['10', 'd10'], ['12', 'd12']]} /></${Field}>
        <${Field} label="Opções"><div class="row wrap">
          <${Check} label="BAB total" checked=${d.flags?.babFull} onChange=${(v) => set({ flags: { ...d.flags, babFull: v } })} />
          <${Check} label="todos saves bons" checked=${d.flags?.allGood} onChange=${(v) => set({ flags: { ...d.flags, allGood: v } })} />
          <${Check} label="PV maximizados" checked=${d.flags?.maxHP} onChange=${(v) => set({ flags: { ...d.flags, maxHP: v } })} />
          <${Check} label="sem Con" checked=${d.flags?.noCon} onChange=${(v) => set({ flags: { ...d.flags, noCon: v } })} />
          <${Check} label="usa Sab para magia" checked=${d.flags?.castWis} onChange=${(v) => set({ flags: { ...d.flags, castWis: v } })} />
        </div></${Field}>
      </div>
      <h4>Afinidades elementais</h4>
      <div class="elements">${ELEMENTS.map((el) => html`<div class="el-row el-${el}"><span class="el-name">${ELEMENT_PT[el]}</span>
        <${Select} value=${d.elements?.[el] || ''} onChange=${(v) => set({ elements: { ...d.elements, [el]: v } })} options=${Object.entries(AFFINITIES)} />
        ${d.elements?.[el] === 'resist' ? html`<${Num} value=${d.resist?.[el] ?? 10} onInput=${(v) => set({ resist: { ...d.resist, [el]: v } })} />` : null}</div>`)}</div>
      <h4>Imunidades</h4>
      <${Chips} items=${d.immunities || []} onRemove=${(x) => set({ immunities: d.immunities.filter((y) => y !== x) })} />
      <${Select} value="" onChange=${(v) => v && set({ immunities: [...new Set([...(d.immunities || []), v])] })} options=${[['', '+ imunidade…'], ...ALL_IMMUNITIES.map((x) => [x, x])]} />
      <h4>Sentidos</h4>
      <${Chips} items=${d.senses || []} onRemove=${(x) => set({ senses: d.senses.filter((y) => y !== x) })} />
      <${Select} value="" onChange=${(v) => v && set({ senses: [...new Set([...(d.senses || []), v])] })} options=${[['', '+ sentido…'], ...SENSES_COMMON.map((x) => [x, x])]} />
      <h4>Habilidades concedidas</h4>
      <${AbilityRows} list=${d.abilities} onChange=${(v) => set({ abilities: v })} />
      <h4>Modificadores</h4>
      <${ModsList} mods=${d.mods} onChange=${(v) => set({ mods: v })} />
      <${Field} label="Descrição dos traços" wide><${TextArea} rows=${3} value=${d.traits} onInput=${(v) => set({ traits: v })} /></${Field}>`} />`;
}

function FeatsEditor({ list, setList }) {
  return html`<${MasterDetail} list=${list} setList=${setList} label="feat"
    make=${() => ({ id: slug('feat'), name: 'Novo feat', category: 'homebrew', prerequisites: '', benefit: '', mods: [] })}
    renderDetail=${(d, set) => html`
      <div class="grid">
        <${Field} label="Nome"><${Text} value=${d.name} onInput=${(v) => set({ name: v })} /></${Field}>
        <${Field} label="Categoria"><${Text} value=${d.category} onInput=${(v) => set({ category: v })} /></${Field}>
        <${Field} label="Pré-requisitos" wide><${Text} value=${d.prerequisites} placeholder="Str 13, BAB +1" onInput=${(v) => set({ prerequisites: v })} /></${Field}>
        <${Field} label="Benefício" wide><${TextArea} rows=${3} value=${d.benefit} onInput=${(v) => set({ benefit: v })} /></${Field}>
      </div>
      <h4>Efeitos automáticos</h4>
      <div class="muted small">Bônus fixos aplicados sempre que a criatura tiver este feat.</div>
      <${ModsList} mods=${d.mods} onChange=${(v) => set({ mods: v })} />`} />`;
}

function AbilitiesEditor({ list, setList }) {
  return html`<${MasterDetail} list=${list} setList=${setList} label="habilidade"
    make=${() => ({ id: slug('hab'), name: 'Nova habilidade', kind: 'Su', placement: 'specialAttack', short: '', text: '' })}
    renderDetail=${(d, set) => html`<div class="grid">
      <${Field} label="Nome"><${Text} value=${d.name} onInput=${(v) => set({ name: v })} /></${Field}>
      <${Field} label="Tipo"><${Select} value=${d.kind} onChange=${(v) => set({ kind: v })} options=${KINDS} /></${Field}>
      <${Field} label="Onde aparece"><${Select} value=${d.placement} onChange=${(v) => set({ placement: v })} options=${PLACEMENTS} /></${Field}>
      <${Field} label="Texto na linha" wide><${Text} value=${d.short} placeholder="ex.: toxic cloud (20-ft. burst, DC {dcCon})" onInput=${(v) => set({ short: v })} /></${Field}>
      <${Field} label="Descrição" wide><${TextArea} rows=${4} value=${d.text} onInput=${(v) => set({ text: v })} /></${Field}>
      <div class="muted small">Variáveis: {hd} {hd5} {cl} {bab} {dcCon} {dcStr} {dcDex} {dcInt} {dcWis} {dcCha} {dcMental} {str} {dex} {con} {int} {wis} {cha} {burstUses} {burstDuration}.</div>
    </div>`} />`;
}

function ClassesEditor({ list, setList, db }) {
  const casters = db.classes.filter((c) => c.caster);
  const regen = (d) => {
    const levels = [];
    const saveVal = (good, lv) => (good ? goodSave(lv) : poorSave(lv));
    const mpSrc = d.mpFrom ? db.classes.find((c) => c.id === d.mpFrom) : null;
    for (let lv = 1; lv <= (d.maxLevel || 20); lv++) {
      const feats = (d.features || []).filter((f) => Number(f.level) === lv).map((f) => f.name);
      const row = { level: lv, bab: babFor(d.bab, lv), fort: saveVal(d.good.includes('fort'), lv), ref: saveVal(d.good.includes('ref'), lv), will: saveVal(d.good.includes('will'), lv), special: feats };
      if (mpSrc) { const r = mpSrc.levels[Math.min(lv, mpSrc.levels.length) - 1]; row.mp = r.mp || 0; row.spellLevel = r.spellLevel || 0; }
      levels.push(row);
    }
    return { ...d, levels, caster: !!mpSrc, castingAbility: mpSrc ? (d.castingAbility || mpSrc.castingAbility) : null, babProgression: d.bab };
  };
  return html`<${MasterDetail} list=${list} setList=${(l) => setList(l.map(regen))} label="classe"
    make=${() => regen({ id: slug('classe'), name: 'Nova classe', category: 'homebrew', kind: 'heroic', hd: 8, skillPoints: 4, bab: '3/4', good: ['ref'], maxLevel: 20, classSkills: [], features: [], limitBreaks: [], mpFrom: '' })}
    renderDetail=${(d, set) => html`
      <div class="grid">
        <${Field} label="Nome"><${Text} value=${d.name} onInput=${(v) => set({ name: v })} /></${Field}>
        <${Field} label="Tipo"><${Select} value=${d.kind} onChange=${(v) => set({ kind: v })} options=${[['heroic', 'heroica (PC)'], ['basic', 'básica (NPC)']]} /></${Field}>
        <${Field} label="Dado de Vida"><${Select} value=${d.hd} onChange=${(v) => set({ hd: Number(v) })} options=${[6, 8, 10, 12].map((x) => [x, `d${x}`])} /></${Field}>
        <${Field} label="Perícias/nível"><${Num} value=${d.skillPoints} onInput=${(v) => set({ skillPoints: v })} /></${Field}>
        <${Field} label="BAB"><${Select} value=${d.bab} onChange=${(v) => set({ bab: v })} options=${[['full', 'total'], ['3/4', '3/4'], ['1/2', '1/2']]} /></${Field}>
        <${Field} label="Nível máximo"><${Num} value=${d.maxLevel} min=${1} max=${20} onInput=${(v) => set({ maxLevel: v })} /></${Field}>
        <${Field} label="Saves bons"><div class="row">${['fort', 'ref', 'will'].map((s) => html`<${Check} label=${s} checked=${d.good.includes(s)} onChange=${(on) => set({ good: on ? [...d.good, s] : d.good.filter((x) => x !== s) })} />`)}</div></${Field}>
        <${Field} label="MP e nível de magia iguais a"><${Select} value=${d.mpFrom} onChange=${(v) => set({ mpFrom: v })} options=${[['', 'não conjura'], ...casters.map((c) => [c.id, c.name])]} /></${Field}>
        ${d.mpFrom ? html`<${Field} label="Atributo de conjuração"><${Select} value=${d.castingAbility || ''} onChange=${(v) => set({ castingAbility: v })} options=${[['', 'igual à classe base'], ['int', 'Int'], ['wis', 'Sab'], ['cha', 'Car']]} /></${Field}>` : null}
        <${Field} label="Perícias de classe (vírgulas)" wide><${Text} value=${(d.classSkills || []).join(', ')} onInput=${(v) => set({ classSkills: v.split(',').map((x) => x.trim()).filter(Boolean) })} /></${Field}>
      </div>
      <h4>Características por nível</h4>
      <${ListEditor} items=${d.features || []} onChange=${(v) => set({ features: v })} addLabel="+ Característica" onAdd=${() => set({ features: [...(d.features || []), { id: uid(), level: 1, name: 'Nova característica', type: 'Ex', text: '' }] })}
        render=${(f, setF) => html`<div class="ability-row"><div class="row wrap">
          <label class="inline">nível <${Num} value=${f.level} min=${1} max=${20} onInput=${(v) => setF({ level: v })} /></label>
          <input type="text" value=${f.name} onInput=${(e) => setF({ name: e.target.value })} />
          <${Select} value=${f.type} onChange=${(v) => setF({ type: v })} options=${KINDS} /></div>
          <textarea rows="2" value=${f.text} onInput=${(e) => setF({ text: e.target.value })}></textarea></div>`} />
      <h4>Limit Breaks</h4>
      <${ListEditor} items=${d.limitBreaks || []} onChange=${(v) => set({ limitBreaks: v })} addLabel="+ Limit Break" onAdd=${() => set({ limitBreaks: [...(d.limitBreaks || []), { name: 'Novo Limit Break', type: 'Su', text: '' }] })}
        render=${(l, setL) => html`<div class="ability-row"><input type="text" value=${l.name} onInput=${(e) => setL({ name: e.target.value })} /><textarea rows="2" value=${l.text} onInput=${(e) => setL({ text: e.target.value })}></textarea></div>`} />`} />`;
}
