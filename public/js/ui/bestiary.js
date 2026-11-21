import { html, useState, useMemo } from '../../vendor/ui.mjs';
import { Modal, Select, toast } from './components.js';
import { compute } from '../rules/engine.js';
import { buildStatblock, statblockHTML } from '../rules/statblock.js';
import { crLabel } from '../rules/tables.js';
import { exportMarkdown, exportToVault } from '../export.js';
import { folderPath } from './editor.js';
import { loadAppearance } from './appearance.js';

const TYPE_ICON = {
  aberration: '👁', animal: '🐾', construct: '⚙', dragon: '🐉', fey: '🧚', humanoid: '🧍', 'magical-beast': '🦁',
  'monstrous-humanoid': '👹', ooze: '🫧', outsider: '✴', plant: '🌿', undead: '💀', vermin: '🕷',
};

export function useComputed(app) {
  return useMemo(() => {
    const m = {};
    for (const e of app.entries) {
      try { m[e.id] = compute(e, { ...app.db, homebrew: app.homebrew }); } catch (err) { console.error('compute failed', e.name, err); }
    }
    return m;
  }, [app.entries, app.db, app.homebrew]);
}

export function Bestiary({ app, onOpen }) {
  const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const [groupBy, setGroupBy] = useState(pref('best:group', 'type'));
  const [mode, setMode] = useState(pref('best:mode', 'all'));
  const [q, setQ] = useState('');
  const [sys, setSys] = useState(pref('best:sys', 'all'));
  const [view, setView] = useState(null);
  const comp = useComputed(app);
  const save = (k, v, set) => { set(v); try { localStorage.setItem(k, v); } catch { /* ignore */ } };

  const filtered = app.entries.filter((e) => (mode === 'all' || e.mode === mode) && (sys === 'all' || (e.system || 'ffd20') === sys) && (!q || (e.name || '').toLowerCase().includes(q.toLowerCase()) || (e.tags || []).some((t) => t.toLowerCase().includes(q.toLowerCase()))));
  const groups = useMemo(() => {
    const g = {};
    const keyOf = (e) => {
      const c = comp[e.id];
      if (groupBy === 'type') return c ? c.type.name : '?';
      if (groupBy === 'alpha') return (e.name || '?').charAt(0).toUpperCase();
      if (groupBy === 'folder') return e.folderId ? folderPath(app.folders, e.folderId) || '(pasta removida)' : '(sem pasta)';
      if (groupBy === 'cr') return c && c.cr !== null ? `CR ${crLabel(c.cr)}` : 'CR —';
      return '';
    };
    for (const e of filtered) (g[keyOf(e)] = g[keyOf(e)] || []).push(e);
    const keys = Object.keys(g);
    if (groupBy === 'cr') keys.sort((a, b) => crNum(a) - crNum(b));
    else keys.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return keys.map((k) => [k, g[k].sort((a, b) => (groupBy === 'cr' ? (a.name || '').localeCompare(b.name || '') : (comp[a.id]?.cr ?? 0) - (comp[b.id]?.cr ?? 0) || (a.name || '').localeCompare(b.name || '')))]);
  }, [filtered, groupBy, comp, app.folders]);

  return html`<div class="bestiary">
    <div class="best-toolbar">
      <input type="search" class="best-search" placeholder="Buscar por nome ou tag…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="seg">${[['all', 'Todos'], ['monster', 'Monstros'], ['npc', 'NPCs']].map(([k, l]) => html`<button class=${mode === k ? 'on' : ''} onClick=${() => save('best:mode', k, setMode)}>${l}</button>`)}</div>
      <div class="seg">${[['all', 'Ambos'], ['ffd20', 'FFd20'], ['pf1e', 'Pathfinder']].map(([k, l]) => html`<button class=${sys === k ? 'on' : ''} onClick=${() => save('best:sys', k, setSys)}>${l}</button>`)}</div>
      <label class="inline">Agrupar por <${Select} value=${groupBy} onChange=${(v) => save('best:group', v, setGroupBy)} options=${[['type', 'Tipo'], ['alpha', 'Alfabético'], ['folder', 'Pasta'], ['cr', 'CR']]} /></label>
      <span class="muted">${filtered.length} statblock(s)</span>
    </div>
    ${!app.entries.length ? html`<div class="empty">
      <h2>Seu bestiário está vazio</h2>
      <p>Crie um monstro ou um NPC nas abas acima. Tudo o que você salvar aparece aqui como um cartão.</p>
    </div>` : null}
    ${groups.map(([g, list]) => html`<section class="best-group">
      <h2>${g} <small>${list.length}</small></h2>
      <div class="card-grid">${list.map((e) => html`<${Card} e=${e} c=${comp[e.id]} onClick=${() => setView(e)} />`)}</div>
    </section>`)}
    ${view ? html`<${Viewer} app=${app} entry=${view} c=${comp[view.id]} onClose=${() => setView(null)} onOpen=${onOpen} />` : null}
  </div>`;
}
const crNum = (s) => { const m = s.match(/CR (\d+)(?:\/(\d+))?/); return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : 999; };

function Card({ e, c, onClick }) {
  const type = c ? c.type.name : '';
  return html`<button class="card" onClick=${onClick} title=${e.name}>
    <div class="card-img">${e.image?.src ? html`<img class=${e.image.transparent ? 'transparent' : ''} src=${e.image.src} alt="" loading="lazy" />` : html`<span class="ph">${TYPE_ICON[e.type] || '✦'}</span>`}
      <span class="card-cr">CR ${c ? crLabel(c.cr) : '?'}</span>
      ${e.boss && e.boss !== 'none' ? html`<span class="card-boss">${{ mini: 'Mini-Boss', boss: 'Boss', super: 'Super Boss' }[e.boss]}</span>` : null}
    </div>
    <div class="card-body"><div class="card-name">${e.name || 'Sem nome'}</div>
      <div class="card-sub"><span class="sys-tag ${e.system === 'pf1e' ? 'pf' : 'ff'}">${e.system === 'pf1e' ? 'PF' : 'FF'}</span> ${e.mode === 'npc' ? 'NPC · ' : ''}${type}${c && c.classes.length ? ` · ${c.classes.map((x) => `${x.def.name} ${x.level}`).join('/')}` : ''}</div></div>
  </button>`;
}

export function Viewer({ app, entry, c, onClose, onOpen }) {
  const comp = c || compute(entry, { ...app.db, homebrew: app.homebrew });
  const sb = statblockHTML(buildStatblock(entry, comp, app.db), { abilityLayout: loadAppearance().sbAbilityLayout });
  const del = async () => {
    if (!confirm(`Excluir "${entry.name}" da biblioteca? Isso não pode ser desfeito.`)) return;
    await app.deleteEntry(entry.id);
    onClose();
  };
  const move = async (folderId) => {
    await app.saveEntry({ ...entry, folderId: folderId || null });
    toast('Movido.');
  };
  return html`<${Modal} title=${entry.name} onClose=${onClose} wide actions=${html`
    <button class="btn primary" onClick=${() => { onOpen(entry); onClose(); }}>Editar</button>
    <button class="btn" onClick=${() => { onOpen({ ...entry, id: undefined, name: `${entry.name} (cópia)` }); onClose(); }}>Duplicar</button>
    <button class="btn" onClick=${() => exportMarkdown(app, entry, comp)}>Exportar .md</button>
    ${app.store.kind === 'server' && app.settings.exportDir ? html`<button class="btn" onClick=${() => exportToVault(app, [entry], (id) => (app.settings.keepFolders ? folderPath(app.folders, id) : ''))}>Enviar ao vault</button>` : null}
    <${Select} value=${entry.folderId || ''} onChange=${move} options=${[['', 'Mover: (sem pasta)'], ...app.folders.map((f) => [f.id, `Mover: ${folderPath(app.folders, f.id)}`])]} />
    <button class="btn danger" onClick=${del}>Excluir</button>`}>
    <div class="viewer"><div class="sb-wrap" dangerouslySetInnerHTML=${{ __html: sb }}></div></div>
  </${Modal}>`;
}
