import { html, render, useState, useEffect, useMemo } from '../vendor/ui.mjs';
import { openStore } from './store.js';
import { newCreature, uid } from './rules/engine.js';
import { Editor } from './ui/editor.js';
import { Bestiary } from './ui/bestiary.js';
import { Library } from './ui/library.js';
import { Homebrew } from './ui/homebrew.js';
import { Toasts, toast, ErrorBoundary } from './ui/components.js';
import { debounce, deepClone } from './util.js';

const TABS = [
  ['bestiary', 'Bestiário'],
  ['monster', 'Criação de Monstros'],
  ['npc', 'Criação de NPCs'],
  ['library', 'Biblioteca'],
  ['homebrew', 'Homebrew'],
];

async function loadDB() {
  const get = (f) => fetch(`data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [classes, feats, spells, races] = await Promise.all([get('classes.json'), get('feats.json'), get('spells.json'), get('races.json')]);
  classes.sort((a, b) => a.name.localeCompare(b.name));
  races.sort((a, b) => a.name.localeCompare(b.name));
  return {
    classes, feats, spells, races,
    classesById: Object.fromEntries(classes.map((c) => [c.id, c])),
    racesById: Object.fromEntries(races.map((r) => [r.id, r])),
  };
}

// Make old/partial saved entries safe to edit: fill any missing field from a fresh template.
function normalize(e) {
  const base = newCreature(e.mode || 'monster');
  const out = { ...base, ...e };
  for (const k of ['speed', 'caster', 'tactics', 'abilities', 'abilityAdjust', 'abilityNone', 'image']) out[k] = { ...base[k], ...(e[k] || {}) };
  for (const k of ['attacks', 'feats', 'armor', 'abilitiesList', 'modifiers', 'subtypes', 'classes', 'senses', 'immunities', 'burst']) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

function fresh(mode) { const def = newCreature(mode); return { def, saved: null, base: JSON.stringify(def) }; }
function draftKey(mode) { return `draft:${mode}`; }
function loadDraft(mode) {
  try { const v = localStorage.getItem(draftKey(mode)); return v ? JSON.parse(v) : null; } catch { return null; }
}
const saveDraft = debounce((mode, state) => { try { localStorage.setItem(draftKey(mode), JSON.stringify(state)); } catch { /* full */ } }, 600);

function App() {
  const [db, setDB] = useState(null);
  const [err, setErr] = useState(null);
  const [store, setStore] = useState(null);
  const [entries, setEntries] = useState([]);
  const [folders, setFoldersState] = useState([]);
  const [homebrew, setHomebrewState] = useState({});
  const [settings, setSettingsState] = useState({});
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('tab') || 'bestiary'; } catch { return 'bestiary'; } });
  const [work, setWork] = useState(() => ({
    monster: loadDraft('monster') || fresh('monster'),
    npc: loadDraft('npc') || fresh('npc'),
  }));

  useEffect(() => {
    (async () => {
      try {
        const [d, s] = await Promise.all([loadDB(), openStore()]);
        const [en, fo, hb, se] = await Promise.all([s.listEntries(), s.getDoc('folders', []), s.getDoc('homebrew', {}), s.getDoc('settings', {})]);
        setDB(d); setStore(s);
        setEntries((en || []).map(normalize));
        setFoldersState(fo || []); setHomebrewState(hb || {}); setSettingsState(se || {});
      } catch (e) {
        console.error(e);
        setErr(e.message);
      }
    })();
  }, []);
  useEffect(() => { try { localStorage.setItem('tab', tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => { saveDraft('monster', work.monster); }, [work.monster]);
  useEffect(() => { saveDraft('npc', work.npc); }, [work.npc]);

  const app = useMemo(() => ({
    db, store, entries, folders, homebrew, settings,
    async saveEntry(e, quiet) {
      const entry = { ...e, updatedAt: Date.now() };
      await store.saveEntry(entry);
      setEntries((list) => { const i = list.findIndex((x) => x.id === entry.id); return i >= 0 ? list.map((x) => (x.id === entry.id ? entry : x)) : [...list, entry]; });
      if (!quiet) toast(`"${entry.name}" salvo na biblioteca.`);
      return entry;
    },
    async deleteEntry(id) {
      await store.deleteEntry(id);
      setEntries((list) => list.filter((x) => x.id !== id));
    },
    async setFolders(f) { setFoldersState(f); await store.putDoc('folders', f); },
    async setHomebrew(h) { setHomebrewState(h); await store.putDoc('homebrew', h); },
    async setSettings(s) { setSettingsState(s); await store.putDoc('settings', s); },
  }), [db, store, entries, folders, homebrew, settings]);

  if (err) return html`<div class="fatal"><h1>Erro ao carregar</h1><p>${err}</p><p>Abra o programa pelo servidor local: <code>node server.js</code> e acesse http://localhost:7420</p></div>`;
  if (!db || !store) return html`<div class="loading">Carregando regras do FFd20…</div>`;

  const setDef = (mode) => (fn) => setWork((w) => ({ ...w, [mode]: { ...w[mode], def: typeof fn === 'function' ? fn(w[mode].def) : fn } }));
  // saved: JSON snapshot of the last saved/loaded state; base: snapshot of a fresh, untouched creature
  const isDirty = (mode) => { const j = JSON.stringify(work[mode].def); return j !== work[mode].saved && j !== work[mode].base; };
  const inLibrary = (mode) => entries.some((e) => e.id === work[mode].def.id);
  const save = async (mode, copy = false) => {
    let def = work[mode].def;
    if (copy) def = { ...def, id: uid(), name: `${def.name} (cópia)`, createdAt: Date.now() };
    const saved = await app.saveEntry(def);
    setWork((w) => ({ ...w, [mode]: { def: saved, saved: JSON.stringify(saved) } }));
  };
  const confirmDiscard = (mode) => !isDirty(mode) || confirm('Há alterações não salvas neste editor. Descartar?');
  const newEntry = (mode) => {
    if (!confirmDiscard(mode)) return;
    const d = newCreature(mode);
    setWork((w) => ({ ...w, [mode]: { def: d, saved: null, base: JSON.stringify(d) } }));
  };
  const openEntry = (e) => {
    const mode = e.mode === 'npc' ? 'npc' : 'monster';
    if (!confirmDiscard(mode)) return;
    let def = normalize(deepClone(e));
    let saved = JSON.stringify(def);
    if (!e.id) { def = { ...def, id: uid(), createdAt: Date.now() }; saved = null; }
    setWork((w) => ({ ...w, [mode]: { def, saved } }));
    setTab(mode);
  };

  return html`<div class="app">
    <header class="topbar">
      <div class="brand">FFd20 <span>Utils</span></div>
      <nav class="tabs">${TABS.map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}${(k === 'monster' || k === 'npc') && isDirty(k) ? html`<i class="dot">●</i>` : null}</button>`)}</nav>
      <div class="store-kind" title=${store.kind === 'server' ? 'Salvando em arquivos locais' : 'Salvando no navegador'}>${store.kind === 'server' ? '💾 local' : '🌐 navegador'}</div>
    </header>
    <main><${ErrorBoundary} key=${tab}>
      ${tab === 'bestiary' ? html`<${Bestiary} app=${app} onOpen=${openEntry} />` : null}
      ${tab === 'monster' ? html`<${Editor} key=${work.monster.def.id} app=${app} mode="monster" def=${work.monster.def} setDef=${setDef('monster')} dirty=${isDirty('monster')} inLibrary=${inLibrary('monster')} onSave=${() => save('monster')} onSaveCopy=${() => save('monster', true)} onNew=${() => newEntry('monster')} />` : null}
      ${tab === 'npc' ? html`<${Editor} key=${work.npc.def.id} app=${app} mode="npc" def=${work.npc.def} setDef=${setDef('npc')} dirty=${isDirty('npc')} inLibrary=${inLibrary('npc')} onSave=${() => save('npc')} onSaveCopy=${() => save('npc', true)} onNew=${() => newEntry('npc')} />` : null}
      ${tab === 'library' ? html`<${Library} app=${app} onOpen=${openEntry} />` : null}
      ${tab === 'homebrew' ? html`<${Homebrew} app=${app} />` : null}
    </${ErrorBoundary}></main>
    <footer class="foot">Regras: <a href="https://finalfantasyd20.com/" target="_blank" rel="noopener">finalfantasyd20.com</a> (FFd20) e <a href="https://www.d20pfsrd.com/" target="_blank" rel="noopener">d20pfsrd.com</a> (Pathfinder OGL). Ferramenta de fã, sem afiliação.</footer>
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
