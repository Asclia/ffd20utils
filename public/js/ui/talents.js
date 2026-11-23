import { html, useState } from '../../vendor/ui.mjs';
import { Section, Select, Check, SearchPicker } from './components.js';
import { uid } from '../rules/engine.js';

const PLACEMENTS = [['group', 'Lista no SQ (padrão)'], ['specialAbility', 'Special Abilities'], ['specialAttack', 'Special Attacks'], ['defensive', 'Defensive Abilities'], ['sq', 'SQ (separado)']];

export function TalentsSection({ def, up, c }) {
  const groups = c.talentGroups || [];
  if (!groups.length) return null;
  const total = groups.reduce((s, g) => s + g.chosen.length, 0);
  const cap = groups.reduce((s, g) => s + (g.allowed || 0), 0);
  return html`<${Section} title="Talentos de classe" id="talents" badge=${`${total}/${cap}`}>
    <div class="muted small">Limite pelo nível de cada classe (contado na tabela da classe; arquétipos que substituem talentos reduzem o limite). Talentos avançados podem ser trocados por talentos comuns. Por padrão aparecem no SQ como <i>${def.system === 'pf1e' ? 'rogue talents [a, b]' : 'Knight Talents [a, b]'}</i>, como nos statblocks ${def.system === 'pf1e' ? 'do Pathfinder' : 'do FFd20'}.</div>
    ${groups.map((g) => html`<${TalentGroup} key=${g.classId + g.group} g=${g} groups=${groups} def=${def} up=${up} />`)}
  </${Section}>`;
}

function TalentGroup({ g, groups, def, up }) {
  const [adding, setAdding] = useState(false);
  const full = g.allowed !== null && g.chosen.length >= g.allowed;
  const pool = [...g.items.map((x) => ({ ...x, from: g.group })), ...groups.filter((o) => o.classId === g.classId && g.alsoFrom.includes(o.group)).flatMap((o) => o.items.map((x) => ({ ...x, from: o.group })))];
  const chosenNames = new Set((def.talents || []).filter((t) => t.classId === g.classId).map((t) => t.name));
  const setT = (id, patch) => up({ talents: def.talents.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const add = (x) => { up({ talents: [...(def.talents || []), { id: uid(), classId: g.classId, group: g.group, name: x.name, placement: 'group', note: '', showText: false }] }); setAdding(false); };
  return html`<div class="talent-group">
    <div class="talent-head">
      <b>${g.group}</b> <span class="muted small">(${g.className})</span>
      <span class=${`count ${g.allowed !== null && g.chosen.length > g.allowed ? 'over' : full && g.allowed > 0 ? 'full' : ''}`}>${g.chosen.length}${g.allowed !== null ? ` / ${g.allowed}` : ''}</span>
      ${g.lost ? html`<span class="small warn">−${g.lost} pelo arquétipo</span>` : null}
      <a class="small" href=${g.source} target="_blank" rel="noopener">lista ↗</a>
      <div class="spacer"></div>
      ${g.allowed === 0 ? html`<span class="small muted">disponível em níveis mais altos</span>` : html`<button class="btn small" onClick=${() => setAdding(!adding)}>${adding ? 'fechar' : '+ escolher'}</button>`}
    </div>
    ${g.needsPath ? html`<div class="small warn">Escolha o mistério da classe (em Classes) para ver as revelações dele.</div>` : null}
    ${g.chosen.map((t) => {
      const info = pool.find((x) => x.name === t.name) || {};
      return html`<div class="talent-row">
        <div class="row wrap">
          <b>${t.name}</b>${info.type ? html` <small class="muted">(${info.type})</small>` : null}
          <${Select} value=${t.placement || 'group'} onChange=${(v) => setT(t.id, { placement: v })} options=${PLACEMENTS} />
          <input type="text" class="w-note" placeholder="nota / escolha" value=${t.note || ''} onInput=${(e) => setT(t.id, { note: e.target.value })} />
          <${Check} label="descrição" checked=${t.showText} onChange=${(v) => setT(t.id, { showText: v })} />
          <button class="icon danger" title="Remover" onClick=${() => up({ talents: def.talents.filter((x) => x.id !== t.id) })}>×</button>
        </div>
        ${info.text ? html`<div class="small muted">${info.prereq ? html`<i>Pré: ${info.prereq}. </i>` : null}${info.text}</div>` : null}
      </div>`;
    })}
    ${adding ? html`<${SearchPicker} items=${pool} getText=${(x) => x.name} limit=${80} autoFocus placeholder=${`Buscar em ${g.group}${g.alsoFrom.length ? ` e ${g.alsoFrom.join(', ')}` : ''}…`}
      filter=${(x) => !chosenNames.has(x.name)}
      onPick=${add}
      renderItem=${(x) => html`<span><b>${x.name}</b>${x.type ? ` (${x.type})` : ''} ${x.from !== g.group ? html`<span class="src-badge">${x.from}</span>` : null}
        ${x.prereq ? html`<br /><i class="small">Pré: ${x.prereq}</i>` : null}<br /><span class="small muted">${x.text.slice(0, 220)}</span></span>`} />
      ${full ? html`<div class="small warn">Limite atingido para o nível atual — você ainda pode adicionar, mas o programa vai avisar.</div>` : null}` : null}
  </div>`;
}
