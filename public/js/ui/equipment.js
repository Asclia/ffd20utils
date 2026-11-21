import { html, useState, useMemo } from '../../vendor/ui.mjs';
import { Section, Field, Num, Select, Check, Chips, ListEditor, SearchPicker } from './components.js';
import { newAttack } from '../rules/engine.js';
import { scaleDiceForSize, npcGear, PC_WEALTH } from '../rules/tables.js';
import { WEAPONS } from '../rules/presets.js';
import { MOD_TARGETS, BONUS_TYPES } from '../rules/presets.js';
import { SKILLS } from '../rules/skills.js';
import {
  SLOTS, slotKind, ARMORS, SHIELDS, classicItems, makeItem, parseItemEffects, weaponPrice, armorPrice, gearSummary, emptyEquipment, specialBonus,
  WEAPON_MATERIALS, ARMOR_MATERIALS,
} from '../rules/equipment.js';
import { elementsFor, elementNamePT } from '../rules/types.js';

// special materials available in this system (FFd20 crystals only in FFd20)
const matOptions = (table, system, shield) => Object.entries(table)
  .filter(([, m]) => (!m.ff || system !== 'pf1e') && (!m.shieldOnly || shield))
  .map(([k, m]) => [k, k ? m.name : 'material: normal']);
function MaterialPicker({ table, value, element, system, shield, onChange }) {
  const m = table[value || ''] || {};
  return html`<label class="inline">${'material'} <${Select} value=${value || ''} onChange=${(v) => onChange({ material: v })} options=${matOptions(table, system, shield)} /></label>
    ${m.element ? html`<${Select} value=${element || elementsFor(system)[0]} onChange=${(v) => onChange({ materialElement: v })} options=${elementsFor(system).map((e) => [e, elementNamePT(system, e)])} />` : null}
    ${m.note ? html`<span class="small muted">${m.note}</span>` : null}`;
}

const gil = (n) => `${Number(n || 0).toLocaleString('pt-BR')} gil`;
const ENH = [[0, '—'], [1, '+1'], [2, '+2'], [3, '+3'], [4, '+4'], [5, '+5']];

export function EquipmentSection({ def, up, c, db }) {
  const eq = def.equipment || emptyEquipment();
  const setEq = (patch) => up({ equipment: { ...eq, ...patch } });
  const items = db.items || {};
  const allSlotItems = useMemo(() => [...(items.wondrous || []).map((x) => ({ ...x, source: 'FFd20' })), ...classicItems()], [items]);
  const gs = gearSummary(def, db);
  const lvl = c.hd;
  const budget = def.mode === 'npc' ? (def.pcWealth ? PC_WEALTH[Math.min(20, lvl)] : npcGear(lvl, c.heroic)?.total) : null;
  const weapons = def.attacks.filter((a) => !a.natural);
  return html`<${Section} title="Equipamento e itens mágicos" id="equip" badge=${gil(gs.total)}>
    <div class="muted small">Tudo aqui entra automaticamente no statblock (ataque, dano, CA, atributos, saves, imunidades e linhas de Gear).
      ${budget ? html` Orçamento de equipamento do NPC: <b>${gil(budget)}</b> — usado: <b class=${gs.total > budget ? 'warn' : ''}>${gil(gs.total)}</b>.` : null}</div>

    <h4>Armas</h4>
    <${ListEditor} items=${weapons} empty="Nenhuma arma. Adicione abaixo (também aparecem em Ataque e Deslocamento)."
      onChange=${(list) => up({ attacks: [...def.attacks.filter((a) => a.natural), ...list] })}
      render=${(a, set) => html`<${WeaponItem} a=${a} set=${set} specials=${items.weaponSpecials || []} c=${c} system=${def.system} />`} />
    <${Select} value="" onChange=${(name) => addWeapon(name, def, up, items)} options=${[{ value: '', label: '+ Arma…' },
      ...WEAPONS.map((w) => ({ value: `pf:${w.name}`, label: `${w.name} (${w.dice})`, group: 'Pathfinder' })),
      ...(items.weapons || []).filter((w) => w.dice && w.dice !== '—').map((w) => ({ value: `ff:${w.name}`, label: `${w.name} (${w.dice})`, group: 'FFd20' }))]} />

    <h4>Armadura e escudo</h4>
    <div class="armor-grid">
      <${ArmorItem} label="Armadura" it=${eq.armor} presets=${ARMORS} specials=${items.armorSpecials || []} onChange=${(v) => setEq({ armor: v })} system=${def.system} />
      <${ArmorItem} label="Escudo" it=${eq.shield} presets=${SHIELDS} specials=${items.armorSpecials || []} onChange=${(v) => setEq({ shield: v })} shield system=${def.system} />
    </div>

    <h4>Slots do corpo</h4>
    <div class="slot-grid">
      ${SLOTS.map(([slot, label]) => html`<${SlotCard} key=${slot} slot=${slot} label=${label} it=${eq.slots?.[slot]} all=${allSlotItems}
        onChange=${(v) => setEq({ slots: { ...eq.slots, [slot]: v } })} />`)}
    </div>
    <h4>Sem slot</h4>
    <${ListEditor} items=${eq.slotless || []} onChange=${(v) => setEq({ slotless: v })} empty="Nenhum item sem slot."
      render=${(it, set) => html`<${ItemEffects} it=${it} set=${set} />`} />
    <${SearchPicker} items=${allSlotItems.filter((x) => x.slot === 'slotless')} getText=${(x) => x.name} limit=${30} requireQuery
      placeholder="+ Item sem slot (digite para buscar; Enter cria um novo)…"
      onPick=${(x) => setEq({ slotless: [...(eq.slotless || []), makeItem(x, 'slotless')] })}
      onCreate=${(name) => setEq({ slotless: [...(eq.slotless || []), makeItem({ name, text: '' }, 'slotless')] })}
      renderItem=${(x) => html`<span><b>${x.name}</b> <span class="small muted">${x.text.slice(0, 110)}</span></span>`} />
    <button class="btn small" onClick=${() => setEq({ slotless: [...(eq.slotless || []), makeItem({ name: 'Novo item', text: '' }, 'slotless')] })}>+ Item personalizado</button>

    <h4>Consumíveis (Combat Gear)</h4>
    <${ListEditor} items=${eq.consumables || []} onChange=${(v) => setEq({ consumables: v })} empty="Nenhum consumível."
      render=${(it, set) => html`<div class="row wrap">
        <input type="text" class="w-name" value=${it.name} onInput=${(e) => set({ name: e.target.value })} />
        <label class="inline">qtd <${Num} value=${it.qty} min=${1} onInput=${(v) => set({ qty: v })} /></label>
        <label class="inline">preço <${Num} value=${it.price} onInput=${(v) => set({ price: v })} /></label>
        <span class="small muted">${it.text || ''}</span>
      </div>`} />
    <${SearchPicker} items=${items.consumables || []} getText=${(x) => x.name} limit=${30} requireQuery placeholder="+ Poção, éter, mote… (digite para buscar; Enter cria um novo)"
      onPick=${(x) => setEq({ consumables: [...(eq.consumables || []), { id: Math.random().toString(36).slice(2), name: x.name, qty: 1, price: x.price, text: x.text }] })}
      onCreate=${(name) => setEq({ consumables: [...(eq.consumables || []), { id: Math.random().toString(36).slice(2), name, qty: 1, price: 0, text: '' }] })}
      renderItem=${(x) => html`<span><b>${x.name}</b> <span class="src-badge">${gil(x.price)}</span> <span class="small muted">${x.text.slice(0, 100)}</span></span>`} />
    <div class="grid">
      <${Field} label="Gil (moedas, joias)"><${Num} value=${eq.gil} onInput=${(v) => setEq({ gil: v })} /></${Field}>
    </div>
  </${Section}>`;
}

function addWeapon(key, def, up, items) {
  if (!key) return;
  const [src, name] = [key.slice(0, 2), key.slice(3)];
  const a = newAttack('melee', false);
  if (src === 'pf') {
    const p = WEAPONS.find((x) => x.name === name);
    Object.assign(a, { name: p.name, kind: p.kind || 'melee', dice: scaleDiceForSize(p.dice, 'Medium', def.size), critRange: p.critRange, critMult: p.critMult, hands: p.hands || 'one', light: !!p.light, finesse: !!p.finesse, thrown: !!p.thrown, range: p.range || '' });
  } else {
    const w = (items.weapons || []).find((x) => x.name === name);
    const cat = w.category || '';
    Object.assign(a, { name: w.name.toLowerCase(), kind: w.range && !/max/i.test(w.range) ? 'ranged' : 'melee', dice: scaleDiceForSize(w.dice, 'Medium', def.size), critRange: w.critRange, critMult: w.critMult,
      hands: cat.startsWith('2-handed') ? 'two' : 'one', light: cat.startsWith('light'), thrown: /thrown/i.test(w.range), range: w.range, basePrice: w.price });
  }
  up({ attacks: [...def.attacks, a] });
}

function WeaponItem({ a, set, specials, c, system }) {
  const det = c.attackDetails.find((x) => x.id === a.id);
  const bonus = (Number(a.enhancement) || 0) + (a.specials || []).reduce((s, n) => s + specialBonus(specials.find((x) => x.name === n)?.cost), 0);
  return html`<div class="ability-row">
    <div class="row wrap">
      <input type="text" class="w-name" value=${a.name} onInput=${(e) => set({ name: e.target.value })} />
      <label class="inline">bônus <${Select} value=${a.enhancement || 0} onChange=${(v) => set({ enhancement: Number(v) })} options=${ENH} /></label>
      <${Check} label="obra-prima" checked=${a.masterwork || Number(a.enhancement) > 0} onChange=${(v) => set({ masterwork: v })} />
      <label class="inline">preço base <${Num} value=${a.basePrice || 0} onInput=${(v) => set({ basePrice: v })} /></label>
      <span class="src-badge">${gil(weaponPrice(a, specials))}</span>
      ${bonus > 10 ? html`<span class="warn small">bônus total +${bonus} acima de +10</span>` : null}
      <${Check} label="fora do Gear" checked=${a.notGear} onChange=${(v) => set({ notGear: v })} title="Não listar em Other Gear (ex.: arma natural/integrada)" />
    </div>
    <div class="row wrap"><${MaterialPicker} table=${WEAPON_MATERIALS} value=${a.material} element=${a.materialElement} system=${system} onChange=${set} /></div>
    <div class="row wrap">
      <${Chips} items=${a.specials || []} onRemove=${(x) => set({ specials: a.specials.filter((y) => y !== x) })} />
      <${Select} value="" onChange=${(v) => v && set({ specials: [...new Set([...(a.specials || []), v])] })}
        options=${[{ value: '', label: '+ habilidade especial (flaming, abyssal…)' }, ...specials.map((s) => ({ value: s.name, label: `${s.name} (${s.cost})` }))]} />
    </div>
    ${(a.specials || []).map((n) => { const s = specials.find((x) => x.name === n); return s ? html`<div class="small muted"><b>${s.name}:</b> ${s.text}</div>` : null; })}
    ${det ? html`<div class="attack-out">${det.text}</div>` : null}
  </div>`;
}

function ArmorItem({ label, it, presets, specials, onChange, shield, system }) {
  const pick = (name) => {
    if (name === '') return onChange(null);
    if (name === '__custom') return onChange({ name: shield ? 'shield' : 'armor', bonus: shield ? 1 : 2, maxDex: shield ? null : 6, acp: 0, enh: 0, specials: [], price: 0, isShield: !!shield });
    const p = presets.find((x) => x.name === name);
    onChange({ name: p.name, bonus: p.bonus, maxDex: p.maxDex, acp: p.acp, enh: it?.enh || 0, masterwork: it?.masterwork || false, specials: it?.specials || [], price: p.price, material: it?.material || '', materialElement: it?.materialElement, isShield: !!shield });
  };
  const set = (patch) => onChange({ ...it, ...patch });
  return html`<div class="armor-card">
    <b>${label}</b>
    <${Select} value=${it ? (presets.some((p) => p.name === it.name) ? it.name : '__custom') : ''} onChange=${pick}
      options=${[['', 'nenhum'], ...presets.map((p) => [p.name, `${p.name} (+${p.bonus})`]), ['__custom', 'personalizado…']]} />
    ${it ? html`
      <div class="row wrap">
        <input type="text" value=${it.name} onInput=${(e) => set({ name: e.target.value })} />
        <label class="inline">${shield ? 'escudo' : 'armadura'} +<${Num} value=${it.bonus} onInput=${(v) => set({ bonus: v })} /></label>
        <label class="inline">aprim. <${Select} value=${it.enh || 0} onChange=${(v) => set({ enh: Number(v) })} options=${ENH} /></label>
      </div>
      <div class="row wrap">
        <label class="inline">Des máx <${Num} value=${it.maxDex} allowEmpty onInput=${(v) => set({ maxDex: v })} /></label>
        <label class="inline">penalid. <${Num} value=${it.acp} onInput=${(v) => set({ acp: v })} /></label>
        <${Check} label="obra-prima" checked=${it.masterwork || Number(it.enh) > 0} onChange=${(v) => set({ masterwork: v })} />
        <span class="src-badge">${gil(armorPrice({ ...it, isShield: !!shield }, specials))}</span>
      </div>
      <div class="row wrap"><${MaterialPicker} table=${ARMOR_MATERIALS} value=${it.material} element=${it.materialElement} system=${system} shield=${shield} onChange=${set} /></div>
      <${Chips} items=${it.specials || []} onRemove=${(x) => set({ specials: it.specials.filter((y) => y !== x) })} />
      <${Select} value="" onChange=${(v) => v && set({ specials: [...new Set([...(it.specials || []), v])] })}
        options=${[{ value: '', label: '+ habilidade especial' }, ...specials.map((s) => ({ value: s.name, label: `${s.name} (${s.cost})` }))]} />` : null}
  </div>`;
}

function SlotCard({ slot, label, it, all, onChange }) {
  const [open, setOpen] = useState(false);
  const kind = slotKind(slot);
  const options = all.filter((x) => x.slot === kind);
  return html`<div class="slot-card ${it ? 'filled' : ''}">
    <div class="slot-head"><span class="slot-label">${label}</span>
      ${it ? html`<button class="icon danger" title="Remover" onClick=${() => onChange(null)}>×</button>` : null}</div>
    ${it ? html`<${ItemEffects} it=${it} set=${(p) => onChange({ ...it, ...p })} compact />` : html`
      ${open ? html`<${SearchPicker} items=${options} getText=${(x) => x.name} limit=${40} autoFocus placeholder="Buscar item…"
        onPick=${(x) => { onChange(makeItem(x, slot)); setOpen(false); }}
        renderItem=${(x) => html`<span><b>${x.name}</b> <span class="src-badge">${x.source} · ${gil(x.price)}</span><br /><span class="small muted">${x.text.slice(0, 120)}</span></span>`} />
        <div class="row"><button class="btn tiny" onClick=${() => { onChange(makeItem({ name: 'Item personalizado', text: '' }, slot)); setOpen(false); }}>personalizado</button>
        <button class="btn tiny ghost" onClick=${() => setOpen(false)}>cancelar</button></div>`
      : html`<button class="btn small ghost slot-empty" onClick=${() => setOpen(true)}>+ escolher (${options.length})</button>`}`}
  </div>`;
}

// Shows/edit an item and its automatic effects.
function ItemEffects({ it, set, compact }) {
  const [edit, setEdit] = useState(false);
  const targets = [...MOD_TARGETS, ...SKILLS.map((s) => [`skill:${s.name}`, `Perícia: ${s.name}`])];
  const summary = [
    ...(it.mods || []).map((m) => `${m.value >= 0 ? '+' : ''}${m.value} ${(targets.find((t) => t[0] === m.target) || [m.target, m.target])[1]}${m.type && m.type !== 'untyped' ? ` (${m.type})` : ''}${m.cond ? ` [${m.cond}]` : ''}`),
    ...(it.immunities || []).map((x) => `imune ${x}`),
    ...(it.strong || []).map((x) => `strong ${x}`),
    ...(it.feats || []).map((x) => `feat ${x}`),
    it.rider ? `+${it.rider} nas armas` : '', it.fastHealing ? `fast healing ${it.fastHealing}` : '',
  ].filter(Boolean);
  const reparse = () => set(parseItemEffects(it.text));
  return html`<div class="item-box">
    <div class="row wrap">
      <input type="text" class="w-name" value=${it.name} onInput=${(e) => set({ name: e.target.value })} />
      ${!compact ? html`<label class="inline">preço <${Num} value=${it.price} onInput=${(v) => set({ price: v })} /></label>` : null}
      <${Check} label="ativo" checked=${it.active !== false} onChange=${(v) => set({ active: v })} />
    </div>
    ${it.text ? html`<div class="small muted">${it.text}</div>` : null}
    <div class="small ${summary.length ? 'auto-note' : 'muted'}">${summary.length ? `⚙ ${summary.join(' · ')}` : 'Sem efeito automático (edite para adicionar).'}
      <button class="btn tiny ghost" onClick=${() => setEdit(!edit)}>${edit ? 'fechar' : 'editar efeitos'}</button></div>
    ${edit ? html`<div class="effects-edit">
      ${compact ? html`<label class="inline">preço <${Num} value=${it.price} onInput=${(v) => set({ price: v })} /></label>` : null}
      <textarea rows="2" value=${it.text} placeholder="descrição (os efeitos podem ser lidos dela)" onInput=${(e) => set({ text: e.target.value })}></textarea>
      <button class="btn tiny" onClick=${reparse}>ler efeitos da descrição</button>
      <${ListEditor} items=${it.mods || []} onChange=${(v) => set({ mods: v })} addLabel="+ bônus"
        onAdd=${() => set({ mods: [...(it.mods || []), { id: Math.random().toString(36).slice(2), target: 'ac', value: 1, type: 'deflection', cond: '' }] })}
        render=${(m, setM) => html`<div class="row wrap">
          <${Select} value=${m.target} onChange=${(v) => setM({ target: v })} options=${targets} />
          <${Num} value=${m.value} onInput=${(v) => setM({ value: v })} />
          <${Select} value=${m.type} onChange=${(v) => setM({ type: v })} options=${[...BONUS_TYPES, 'armor-item'].map((t) => [t, t])} />
          <input type="text" placeholder="condição" value=${m.cond || ''} onInput=${(e) => setM({ cond: e.target.value })} />
        </div>`} />
      <div class="row wrap">
        <label class="inline">imunidades <input type="text" value=${(it.immunities || []).join(', ')} onInput=${(e) => set({ immunities: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
        <label class="inline">feats <input type="text" value=${(it.feats || []).join(', ')} onInput=${(e) => set({ feats: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></label>
        <label class="inline">dano extra nas armas <input type="text" class="w-short" value=${it.rider || ''} placeholder="1d6 fire" onInput=${(e) => set({ rider: e.target.value })} /></label>
      </div>
    </div>` : null}
  </div>`;
}
