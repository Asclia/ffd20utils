import { html, render, useState, useEffect, useMemo } from '../vendor/ui.mjs';
import { openStore } from './store.js';
import { newCreature, uid } from './rules/engine.js';
import { Editor } from './ui/editor.js';
import { Bestiary } from './ui/bestiary.js';
import { Library } from './ui/library.js';
import { Homebrew } from './ui/homebrew.js';
import { Dungeons } from './ui/dungeons.js';
import { Battle, addToBattle } from './ui/battle.js';
import { Toasts, toast, ErrorBoundary, AskHost } from './ui/components.js';
import { AppearanceDialog } from './ui/appearance.js';
import { debounce, deepClone } from './util.js';
import { SUBTYPE_BY_ID } from './rules/types.js';
import { canonicalFeatName } from './rules/featEffects.js';
import { loadWeaponList } from './rules/presets.js';
import { loadArmorList } from './rules/equipment.js';

const TABS = [
  ['bestiary', 'Bestiário', '📖'],
  ['monster', 'Monstros', '🐉'],
  ['npc', 'NPCs', '🧙'],
  ['dungeons', 'Masmorras', '🏰'],
  ['battle', 'Batalha', '⚔️'],
  ['library', 'Biblioteca', '📚'],
  ['homebrew', 'Homebrew', '⚗️'],
];
const TAB_TITLES = { monster: 'Criação de Monstros', npc: 'Criação de NPCs' };
const Emblem = () => html`<svg viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="em-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent2)"/><stop offset="1" stop-color="var(--gold)"/></linearGradient></defs>
  <path d="M32 3 L57 17 V47 L32 61 L7 47 V17 Z" fill="none" stroke="url(#em-g)" stroke-width="3"/>
  <path d="M32 12 L40 32 L32 52 L24 32 Z" fill="url(#em-g)"/>
  <path d="M14 32 H50" stroke="url(#em-g)" stroke-width="2" opacity=".7"/>
  <circle cx="32" cy="32" r="3.2" fill="var(--bg)"/>
</svg>`;

async function loadDB() {
  const get = (f) => fetch(`data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [ffClasses, featsRaw, ffSpells, ffRaces, talentsByClass, ffArchetypes, items, umr, pfSubtypesRaw, pfClasses, pfRaces, pfSpells, tables, monsters, pfArchetypes, pfTalents, pfPaths, pfSpellInfo, pfWeapons, pfArmor, pfSpellsKnown] = await Promise.all(
    ['classes.json', 'feats.json', 'spells.json', 'races.json', 'talents.json', 'archetypes.json', 'items.json', 'umr.json', 'pf-subtypes.json',
      'pf-classes.json', 'pf-races.json', 'pf-spells.json', 'tables.json', 'monsters.json', 'pf-archetypes.json', 'pf-talents.json', 'pf-paths.json', 'pf-spell-info.json', 'pf-weapons.json', 'pf-armor.json', 'pf-spells-known.json'].map(get));
  loadWeaponList(pfWeapons);
  loadArmorList(pfArmor);
  const archetypes = [...ffArchetypes, ...pfArchetypes];
  const feats = featsRaw.map((f) => ({ ...f, name: canonicalFeatName(f.name) })); // "Weapon Focus, Greater" → "Greater Weapon Focus"
  // Pathfinder subtypes not already defined with rules in types.js
  const pfSubtypes = pfSubtypesRaw.filter((x) => !SUBTYPE_BY_ID[x.id]).map((x) => ({ id: x.id, name: x.name, traits: x.text, pf: true }));
  // Both systems share one database; Pathfinder class ids get a "pf-" prefix (bard, cleric… exist in both)
  const classes = [
    ...ffClasses.map((c) => ({ ...c, system: 'ffd20' })),
    ...pfClasses.map((c) => ({ ...c, id: `pf-${c.id}`, system: 'pf1e' })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const races = [...ffRaces.map((r) => ({ ...r, system: 'ffd20' })), ...pfRaces].sort((a, b) => a.name.localeCompare(b.name));
  const spells = [...ffSpells.map((x) => ({ ...x, system: 'ffd20' })), ...pfSpells.map((x) => ({ ...x, class: `pf-${x.class}` }))];
  archetypes.sort((a, b) => a.name.localeCompare(b.name));
  return {
    classes, feats, spells, races, talentsByClass: { ...talentsByClass, ...pfTalents }, archetypes, items, umr, pfSubtypes, tables, monsters,
    pathsByClass: pfPaths, spellInfo: pfSpellInfo, spellsKnown: pfSpellsKnown,
    pfSubtypesById: Object.fromEntries(pfSubtypes.map((x) => [x.id, x])),
    archetypesById: Object.fromEntries(archetypes.map((a) => [a.id, a])),
    classesById: Object.fromEntries(classes.map((c) => [c.id, c])),
    racesById: Object.fromEntries(races.map((r) => [r.id, r])),
  };
}

// Make old/partial saved entries safe to edit: fill any missing field from a fresh template.
function normalize(e) {
  const base = newCreature(e.mode || 'monster');
  const out = { ...base, ...e };
  for (const k of ['speed', 'caster', 'tactics', 'abilities', 'abilityAdjust', 'abilityNone', 'image']) out[k] = { ...base[k], ...(e[k] || {}) };
  for (const k of ['attacks', 'feats', 'armor', 'abilitiesList', 'modifiers', 'subtypes', 'classes', 'senses', 'immunities', 'burst', 'talents']) if (!Array.isArray(out[k])) out[k] = [];
  out.equipment = { ...base.equipment, ...(e.equipment || {}) };
  if (e.autoHD === undefined) out.autoHD = false;
  if (e.autoNaturalArmor === undefined) out.autoNaturalArmor = false;
  out.equipment.slots = { ...(out.equipment.slots || {}) };
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
  const [showAppearance, setShowAppearance] = useState(false);
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
  // library folder changed by a sync app (Koofr, Dropbox…) while the program is open: reload
  // Koofr (Android app): changes made on another device, checked every 20 s
  useEffect(() => {
    if (!store) return undefined;
    if (window.__koofrError) toast(`Koofr: ${window.__koofrError}`, 'error');
    if (store.kind === 'koofr' && store.offline) toast('Sem conexão com o Koofr: mostrando a última cópia salva no aparelho.', 'error');
    if (store.kind !== 'server' && store.kind !== 'koofr') return undefined;
    let last = null;
    let alive = true;
    const sig = (list) => (list || []).map((e) => `${e.id}:${e.updatedAt || 0}`).sort().join('|');
    const poll = async () => {
      const r = store.kind === 'server'
        ? await fetch('/api/library/revision', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)
        : await store.revision().then((revision) => ({ revision })).catch(() => null);
      if (!alive || !r) return;
      if (last !== null && r.revision !== last) {
        const [en, fo, hb] = await Promise.all([store.listEntries(), store.getDoc('folders', []), store.getDoc('homebrew', {})]);
        let changed = false;
        setEntries((cur) => { changed = sig(cur) !== sig(en); return (en || []).map(normalize); });
        setFoldersState(fo || []); setHomebrewState(hb || {});
        if (changed) toast('Biblioteca atualizada (alterações vindas de outro aparelho).');
      }
      last = r.revision;
    };
    poll();
    const iv = setInterval(poll, store.kind === 'server' ? 4000 : 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [store]);
  useEffect(() => { try { localStorage.setItem('tab', tab); } catch { /* ignore */ } }, [tab]);
  useEffect(() => { saveDraft('monster', work.monster); }, [work.monster]);
  useEffect(() => { saveDraft('npc', work.npc); }, [work.npc]);

  const app = useMemo(() => ({
    db, store, entries, folders, homebrew, settings,
    openInBattle(list) { addToBattle(list); setTab('battle'); toast(`${list.length} statblock(s) abertos na Batalha.`); },
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
  if (!db || !store) return html`<div class="loading">Abrindo o Compendium…</div>`;

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
    const d = newCreature(mode, settings.defaultSystem || 'ffd20');
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
      <button class="brand" onClick=${() => setTab('bestiary')} title="Compendium"><${Emblem} /><b>Compendium</b></button>
      <nav class="tabs">${TABS.map(([k, l, i]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)} title=${TAB_TITLES[k] || l}><span class="ti">${i}</span><span class="tl">${l}</span>${(k === 'monster' || k === 'npc') && isDirty(k) ? html`<i class="dot" title="Alterações não salvas">●</i>` : null}</button>`)}</nav>
      <div class="top-right">
        <span class="store-kind" title=${store.kind === 'server' ? 'Salvando em arquivos na pasta da biblioteca' : store.kind === 'koofr' ? `Salvando no Koofr (${store.root})${store.offline ? ' — sem conexão' : ''}` : 'Salvando no navegador'}>${store.kind === 'server' ? '💾' : store.kind === 'koofr' ? (store.offline ? '⛅' : '☁️') : '🌐'}</span>
        <button class="btn small ghost" onClick=${() => setShowAppearance(true)} title="Tema, cores, fontes e tamanho">🎨 <span class="tl">Aparência</span></button>
      </div>
    </header>
    <main><${ErrorBoundary} key=${tab}>
      ${tab === 'bestiary' ? html`<${Bestiary} app=${app} onOpen=${openEntry} />` : null}
      ${tab === 'monster' ? html`<${Editor} key=${work.monster.def.id} app=${app} mode="monster" def=${work.monster.def} setDef=${setDef('monster')} dirty=${isDirty('monster')} inLibrary=${inLibrary('monster')} onSave=${() => save('monster')} onSaveCopy=${() => save('monster', true)} onNew=${() => newEntry('monster')} />` : null}
      ${tab === 'npc' ? html`<${Editor} key=${work.npc.def.id} app=${app} mode="npc" def=${work.npc.def} setDef=${setDef('npc')} dirty=${isDirty('npc')} inLibrary=${inLibrary('npc')} onSave=${() => save('npc')} onSaveCopy=${() => save('npc', true)} onNew=${() => newEntry('npc')} />` : null}
      ${tab === 'dungeons' ? html`<${Dungeons} app=${app} onOpenEntry=${openEntry} />` : null}
      ${tab === 'battle' ? html`<${Battle} app=${app} onOpen=${openEntry} />` : null}
      ${tab === 'library' ? html`<${Library} app=${app} onOpen=${openEntry} />` : null}
      ${tab === 'homebrew' ? html`<${Homebrew} app=${app} />` : null}
    </${ErrorBoundary}></main>
    <footer class="foot">Regras: <a href="https://finalfantasyd20.com/" target="_blank" rel="noopener">finalfantasyd20.com</a> (FFd20) e <a href="https://www.d20pfsrd.com/" target="_blank" rel="noopener">d20pfsrd.com</a> (Pathfinder OGL). Ferramenta de fã, sem afiliação.</footer>
    ${showAppearance ? html`<${AppearanceDialog} onClose=${() => setShowAppearance(false)} />` : null}
    <${Toasts} />
    <${AskHost} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('root'));
