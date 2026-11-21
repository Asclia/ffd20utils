// Battle view: several statblocks from the library open side by side (boss + minions, a whole encounter).
// The open set is kept on this computer; named encounters are saved in the library folder (synced).
import { html, useState, useEffect, useMemo } from '../../vendor/ui.mjs';
import { SearchPicker, Select, toast, askText } from './components.js';
import { buildStatblock, statblockHTML } from '../rules/statblock.js';
import { crLabel } from '../rules/tables.js';
import { useComputed } from './bestiary.js';
import { folderPath } from './editor.js';
import { useAppearance } from './appearance.js';

const KEY = 'battle';
const uid = () => Math.random().toString(36).slice(2, 10);
export function loadBattle() {
  try { return { slots: [], cols: 'auto', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { slots: [], cols: 'auto' }; }
}
function saveBattle(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ } }
// used by the Library / Bestiary "Abrir na batalha" buttons
export function addToBattle(entries) {
  const b = loadBattle();
  for (const e of entries) b.slots.push({ id: uid(), entryId: e.id, hp: null, note: '', collapsed: false });
  saveBattle(b);
}

export function Battle({ app, onOpen }) {
  const [b, setB] = useState(loadBattle);
  const [count, setCount] = useState(1);
  const [encounters, setEncounters] = useState([]);
  const comp = useComputed(app);
  const look = useAppearance();
  const byId = useMemo(() => Object.fromEntries(app.entries.map((e) => [e.id, e])), [app.entries]);
  useEffect(() => { saveBattle(b); }, [b]);
  useEffect(() => { app.store.getDoc('encounters', []).then((x) => setEncounters(Array.isArray(x) ? x : [])); }, [app.store]);
  const up = (patch) => setB((x) => ({ ...x, ...patch }));
  const setSlot = (id, patch) => setB((x) => ({ ...x, slots: x.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const add = (e, n = count) => setB((x) => ({ ...x, slots: [...x.slots, ...Array.from({ length: Math.max(1, n) }, () => ({ id: uid(), entryId: e.id, hp: null, note: '', collapsed: false }))] }));
  const addFolder = (folderId) => {
    if (!folderId) return;
    const list = app.entries.filter((e) => (e.folderId || '') === (folderId === '__none' ? '' : folderId));
    if (!list.length) return toast('Pasta vazia.');
    setB((x) => ({ ...x, slots: [...x.slots, ...list.map((e) => ({ id: uid(), entryId: e.id, hp: null, note: '', collapsed: false }))] }));
  };
  const move = (id, dir) => setB((x) => {
    const i = x.slots.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= x.slots.length) return x;
    const slots = [...x.slots];
    [slots[i], slots[j]] = [slots[j], slots[i]];
    return { ...x, slots };
  });
  // "Goblin 1", "Goblin 2"… when the same statblock is open more than once
  const labels = useMemo(() => {
    const seen = {};
    const total = {};
    for (const s of b.slots) total[s.entryId] = (total[s.entryId] || 0) + 1;
    return Object.fromEntries(b.slots.map((s) => {
      seen[s.entryId] = (seen[s.entryId] || 0) + 1;
      const name = byId[s.entryId]?.name || '(removido da biblioteca)';
      return [s.id, total[s.entryId] > 1 ? `${name} ${seen[s.entryId]}` : name];
    }));
  }, [b.slots, byId]);

  const persistEnc = async (list) => { setEncounters(list); await app.store.putDoc('encounters', list); };
  const saveEncounter = async () => {
    if (!b.slots.length) return toast('Abra algum statblock primeiro.');
    const name = await askText('Nome do encontro', b.encounterName || 'Encontro');
    if (!name) return;
    const existing = encounters.find((x) => x.name === name);
    const enc = { id: existing?.id || uid(), name, entryIds: b.slots.map((s) => s.entryId), updatedAt: Date.now() };
    await persistEnc(existing ? encounters.map((x) => (x.id === existing.id ? enc : x)) : [...encounters, enc]);
    up({ encounterName: name });
    toast(`Encontro "${name}" salvo na biblioteca.`);
  };
  const loadEncounter = (id) => {
    const enc = encounters.find((x) => x.id === id);
    if (!enc) return;
    if (b.slots.length && !confirm(`Substituir os ${b.slots.length} statblock(s) abertos por "${enc.name}"?`)) return;
    up({ encounterName: enc.name, slots: enc.entryIds.filter((x) => byId[x]).map((entryId) => ({ id: uid(), entryId, hp: null, note: '', collapsed: false })) });
  };
  const deleteEncounter = async () => {
    const enc = encounters.find((x) => x.name === b.encounterName);
    if (!enc || !confirm(`Excluir o encontro salvo "${enc.name}"?`)) return;
    await persistEnc(encounters.filter((x) => x.id !== enc.id));
    up({ encounterName: '' });
  };
  const totalXP = b.slots.reduce((s, x) => s + (comp[x.entryId]?.xp || 0), 0);
  const cols = b.cols === 'auto' ? '' : `repeat(${b.cols}, minmax(0, 1fr))`;

  return html`<div class="battle">
    <div class="battle-bar">
      <div class="battle-add">
        <${SearchPicker} items=${app.entries} getText=${(e) => e.name} onPick=${(e) => add(e)} limit=${40} requireQuery placeholder="+ Abrir statblock (digite o nome)…"
          renderItem=${(e) => html`<span><b>${e.name}</b> <span class="src-badge">CR ${crLabel(comp[e.id]?.cr)} · ${comp[e.id]?.type?.name || ''}${e.folderId ? ` · ${folderPath(app.folders, e.folderId)}` : ''}</span></span>`} />
      </div>
      <label class="inline">× <input type="number" class="num" min="1" max="20" value=${count} onInput=${(e) => setCount(Math.max(1, Number(e.currentTarget.value) || 1))} title="Quantas cópias abrir de cada vez (ex.: 4 goblins)" /></label>
      <${Select} value="" onChange=${addFolder} options=${[['', '+ Pasta inteira…'], ['__none', '(sem pasta)'], ...app.folders.map((f) => [f.id, folderPath(app.folders, f.id)])]} />
      <div class="seg" title="Colunas">${[['auto', 'Auto'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']].map(([k, l]) => html`<button class=${String(b.cols) === k ? 'on' : ''} onClick=${() => up({ cols: k })}>${l}</button>`)}</div>
      <span class="spacer"></span>
      <${Select} value="" onChange=${loadEncounter} options=${[['', encounters.length ? `Encontros salvos (${encounters.length})…` : 'Nenhum encontro salvo'], ...encounters.map((x) => [x.id, `${x.name} (${x.entryIds.length})`])]} />
      <button class="btn small" onClick=${saveEncounter}>Salvar encontro</button>
      ${encounters.some((x) => x.name === b.encounterName) ? html`<button class="btn small ghost danger" onClick=${deleteEncounter} title="Excluir o encontro salvo">Excluir "${b.encounterName}"</button>` : null}
      <button class="btn small ghost" onClick=${() => b.slots.length && confirm('Fechar todos os statblocks?') && up({ slots: [], encounterName: '' })}>Fechar todos</button>
    </div>
    ${b.slots.length ? html`<div class="battle-info muted small">${b.encounterName ? html`<b>${b.encounterName}</b> · ` : null}${b.slots.length} statblock(s) · XP total ${totalXP.toLocaleString('pt-BR')}</div>` : null}
    ${!b.slots.length ? html`<div class="empty"><h2>Nenhum statblock aberto</h2>
      <p>Busque acima para abrir statblocks lado a lado (use "×" para abrir várias cópias, como 4 goblins), adicione uma pasta inteira<br />ou selecione vários na Biblioteca e clique em <b>⚔ Abrir na batalha</b>. Salve o grupo como encontro para reabrir depois.</p></div>` : null}
    <div class="battle-grid" style=${cols ? `grid-template-columns: ${cols}` : ''}>
      ${b.slots.map((s, i) => {
        const e = byId[s.entryId];
        const c = comp[s.entryId];
        const maxHP = c?.hp?.avg;
        const hp = s.hp ?? maxHP;
        const sb = e && c ? statblockHTML(buildStatblock(e, c, app.db), { abilityLayout: look.sbAbilityLayout }) : '';
        return html`<section class="battle-card ${s.collapsed ? 'collapsed' : ''}" key=${s.id}>
          <header>
            <button class="icon" onClick=${() => setSlot(s.id, { collapsed: !s.collapsed })} title=${s.collapsed ? 'Expandir' : 'Recolher'}>${s.collapsed ? '▸' : '▾'}</button>
            <b class="bc-name" title=${labels[s.id]}>${labels[s.id]}</b>
            ${c ? html`<span class="cr-pill">CR ${crLabel(c.cr)}</span>` : null}
            ${maxHP ? html`<span class="bc-hp ${hp <= 0 ? 'down' : hp <= maxHP / 2 ? 'bloodied' : ''}" title="Pontos de vida atuais (só nesta tela)">
              PV <button class="icon" onClick=${() => setSlot(s.id, { hp: (hp || 0) - 1 })}>−</button>
              <input type="number" class="num" value=${hp} onInput=${(ev) => setSlot(s.id, { hp: ev.currentTarget.value === '' ? null : Number(ev.currentTarget.value) })} />
              <button class="icon" onClick=${() => setSlot(s.id, { hp: (hp || 0) + 1 })}>+</button>/ ${maxHP}</span>` : null}
            <span class="spacer"></span>
            <button class="icon" onClick=${() => move(s.id, -1)} disabled=${i === 0} title="Mover para a esquerda">◂</button>
            <button class="icon" onClick=${() => move(s.id, 1)} disabled=${i === b.slots.length - 1} title="Mover para a direita">▸</button>
            ${e ? html`<button class="icon" onClick=${() => onOpen(e)} title="Abrir no editor">✎</button>` : null}
            <button class="icon danger" onClick=${() => setB((x) => ({ ...x, slots: x.slots.filter((y) => y.id !== s.id) }))} title="Fechar">×</button>
          </header>
          ${s.collapsed ? null : html`
            <input type="text" class="bc-note" placeholder="Notas (condições, alvo, rodadas…)" value=${s.note} onInput=${(ev) => setSlot(s.id, { note: ev.currentTarget.value })} />
            <div class="sb-wrap bc-body">${e ? html`<div dangerouslySetInnerHTML=${{ __html: sb }}></div>` : html`<p class="muted">Este statblock não está mais na biblioteca.</p>`}</div>`}
        </section>`;
      })}
    </div>
  </div>`;
}
