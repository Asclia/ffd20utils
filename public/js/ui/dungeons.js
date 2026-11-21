import { html, useState, useEffect, useMemo, useRef } from '../../vendor/ui.mjs';
import { Field, TextArea, Num, Select, Check, toast, Modal } from './components.js';
import { generate, newSeed, rng, roomAt, setCells, CELL, FEATURES, renumber, roomCells } from '../dungeon/generator.js';
import { indexTables, roll, siteName, stockRoom, creaturePool, suggestField, OVERVIEW_FIELDS, ROOM_FIELDS } from '../dungeon/tables.js';
import { drawMap, mapToPNG, MAP_STYLES } from '../dungeon/render.js';
import { useComputed, Viewer } from './bestiary.js';
import { uid } from '../rules/engine.js';
import { SYSTEMS } from '../rules/types.js';
import { download, makeZip, fileSafe } from '../util.js';

const SIZES = { small: [32, 24, 'Pequena'], medium: [48, 36, 'Média'], large: [64, 48, 'Grande'] };
const TOOLS = [
  ['select', '☝', 'Selecionar sala'], ['room', '▭', 'Desenhar sala (arraste)'], ['floor', '▦', 'Pintar chão'], ['rock', '■', 'Pintar rocha (apagar)'],
  ['water', '≈', 'Água'], ['rubble', '⁘', 'Escombros / terreno difícil'],
  ['door', '▯', 'Porta'], ['secret', 'S', 'Porta secreta'], ['portcullis', '#', 'Grade'], ['stairs-up', '▲', 'Escada (sobe)'], ['stairs-down', '▼', 'Escada (desce)'],
  ['trap', 'T', 'Armadilha'], ['chest', '◆', 'Baú'], ['statue', '♜', 'Estátua'], ['pillar', '●', 'Pilar'], ['altar', '✚', 'Altar'], ['unfeature', '⌫', 'Remover marcador'],
];
const PAINT = { floor: CELL.FLOOR, rock: CELL.ROCK, water: CELL.WATER, rubble: CELL.RUBBLE };

function themesAndDomains(idx) {
  const themes = [];
  const domains = [];
  for (const s of Object.values(idx.sites)) (s.kind === 'theme' ? themes : domains).push(s);
  return { themes: themes.sort((a, b) => a.name.localeCompare(b.name)), domains: domains.sort((a, b) => a.name.localeCompare(b.name)) };
}

function newDungeon(app, idx, opts = {}) {
  const system = opts.system || app.settings.defaultSystem || 'ffd20';
  const { themes, domains } = themesAndDomains(idx);
  const r = rng(newSeed());
  const d = {
    id: uid(), name: '', system, partyLevel: 3, theme: r.pick(themes)?.key || '', domain: r.pick(domains)?.key || '',
    style: 'rooms', roomsCount: 10, size: 'medium', water: 0, seed: newSeed(), mapStyle: 'parchment', overview: {}, notes: '', folderId: null,
    createdAt: Date.now(), updatedAt: Date.now(), map: null,
  };
  return regenerate(app, idx, d, { stock: true, name: true, overview: true });
}

function ctxFor(app, idx, d, comp) {
  const lib = app.entries.map((e) => ({ ...e, _cr: comp[e.id]?.cr, _type: comp[e.id]?.type?.name }));
  return { idx, dungeon: d, r: rng(newSeed()), pool: creaturePool(d, app.db.monsters, lib), traps: app.db.tables?.traps || [] };
}

function regenerate(app, idx, d, { stock = false, name = false, overview = false, comp = {} } = {}) {
  const [w, h] = SIZES[d.size] || SIZES.medium;
  const map = generate({ w, h, rooms: d.roomsCount, style: d.style, seed: d.seed, water: d.water ? 0.4 : 0, loops: 0.25 });
  let next = { ...d, map: { ...map, rooms: map.rooms.map((q) => ({ ...q, content: {}, notes: '' })) } };
  const ctx = ctxFor(app, idx, next, comp);
  if (stock) next = { ...next, map: { ...next.map, rooms: next.map.rooms.map((q) => stockRoom(ctx, q)) } };
  if (name) next.name = siteName(idx, next, ctx.r);
  if (overview) next.overview = Object.fromEntries(OVERVIEW_FIELDS.map(([k, , id]) => [k, roll(idx, id, ctx.r)]));
  return next;
}

// ------------------------------------------------------------------ main view
export function Dungeons({ app, onOpenEntry }) {
  const idx = useMemo(() => indexTables(app.db.tables), [app.db.tables]);
  const [list, setList] = useState(null);
  const [doc, setDoc] = useState(null);
  const [saved, setSaved] = useState('');
  const [view, setView] = useState('editor');
  useEffect(() => { app.store.listDungeons().then((l) => setList((l || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)))); }, []);
  const dirty = doc && JSON.stringify(doc) !== saved;
  const open = (d) => { if (dirty && !confirm('Há alterações não salvas nesta masmorra. Descartar?')) return; setDoc(d); setSaved(JSON.stringify(d)); setView('editor'); };
  const save = async () => {
    const d = { ...doc, updatedAt: Date.now() };
    await app.store.saveDungeon(d);
    setDoc(d); setSaved(JSON.stringify(d));
    setList((l) => [d, ...(l || []).filter((x) => x.id !== d.id)]);
    toast(`"${d.name || 'Masmorra'}" salva.`);
  };
  const remove = async () => {
    if (!confirm(`Excluir a masmorra "${doc.name}"?`)) return;
    await app.store.deleteDungeon(doc.id);
    setList((l) => l.filter((x) => x.id !== doc.id));
    setDoc(null); setSaved('');
  };
  if (!list) return html`<div class="loading">Carregando masmorras…</div>`;
  return html`<div class="dungeons">
    <aside class="dg-list">
      <button class="btn primary" onClick=${() => { if (dirty && !confirm('Descartar alterações não salvas?')) return; const d = newDungeon(app, idx); setDoc(d); setSaved(''); setView('editor'); }}>+ Nova masmorra</button>
      <button class=${`btn ${view === 'tables' ? 'on' : 'ghost'}`} onClick=${() => setView(view === 'tables' ? 'editor' : 'tables')}>🎲 Tabelas aleatórias</button>
      <div class="dg-list-items">
        ${list.length ? list.map((d) => html`<button class=${`dg-item ${doc?.id === d.id ? 'sel' : ''}`} onClick=${() => open(d)}>
          <b>${d.name || 'Sem nome'}</b><small>${SYSTEMS[d.system] || ''} · nível ${d.partyLevel} · ${d.map?.rooms?.length || 0} salas</small></button>`)
          : html`<p class="muted small">Nenhuma masmorra salva.</p>`}
      </div>
    </aside>
    <div class="dg-main">
      ${view === 'tables' ? html`<${TablesBrowser} idx=${idx} />`
        : doc ? html`<${DungeonEditor} key=${doc.id} app=${app} idx=${idx} doc=${doc} setDoc=${setDoc} dirty=${dirty} onSave=${save} onDelete=${remove} onOpenEntry=${onOpenEntry} />`
          : html`<div class="empty"><h2>Masmorras</h2><p>Gere uma masmorra pronta (mapa, salas numeradas e o que há em cada uma) ou desenhe a sua do zero. Tudo pode ser editado e sorteado de novo.</p>
            <button class="btn primary" onClick=${() => setDoc(newDungeon(app, idx))}>Gerar uma masmorra</button></div>`}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ editor
function DungeonEditor({ app, idx, doc, setDoc, dirty, onSave, onDelete, onOpenEntry }) {
  const comp = useComputed(app);
  const [tool, setTool] = useState('select');
  const [cell, setCellSize] = useState(20);
  const [sel, setSel] = useState(doc.map?.rooms?.[0]?.id || null);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const canvasRef = useRef();
  const history = useRef([]);
  const painting = useRef(false);
  const { themes, domains } = useMemo(() => themesAndDomains(idx), [idx]);

  const up = (patch) => setDoc((d) => ({ ...d, ...patch }));
  const pushHistory = () => { history.current.push(JSON.stringify(doc.map)); if (history.current.length > 60) history.current.shift(); };
  const setMap = (fn) => setDoc((d) => ({ ...d, map: fn(d.map) }));
  const undo = () => { const prev = history.current.pop(); if (prev) setDoc((d) => ({ ...d, map: JSON.parse(prev) })); };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !doc.map) return;
    c.width = doc.map.w * cell;
    c.height = doc.map.h * cell;
    drawMap(c.getContext('2d'), doc, { cell, style: doc.mapStyle, selected: sel, hover, drag });
  }, [doc, cell, sel, hover, drag]);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); onSave(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const at = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = canvasRef.current.width / rect.width;
    return { x: Math.floor(((e.clientX - rect.left) * sx) / cell), y: Math.floor(((e.clientY - rect.top) * sx) / cell) };
  };
  const paintAt = ({ x, y }) => setMap((m) => ({ ...m, cells: setCells(m.cells, [[x, y]], PAINT[tool]) }));
  const down = (e) => {
    const p = at(e);
    if (tool === 'select') { const r = roomAt(doc.map, p.x, p.y); setSel(r ? r.id : null); return; }
    pushHistory();
    if (tool === 'room') { setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); return; }
    if (PAINT[tool]) { painting.current = true; paintAt(p); return; }
    if (tool === 'unfeature') { setMap((m) => ({ ...m, features: m.features.filter((f) => !(f.x === p.x && f.y === p.y)) })); return; }
    if (FEATURES[tool]) {
      setMap((m) => {
        const exists = m.features.find((f) => f.x === p.x && f.y === p.y);
        const rest = m.features.filter((f) => !(f.x === p.x && f.y === p.y));
        if (exists && exists.type === tool) return { ...m, features: rest };
        const cells = m.cells[p.y][p.x] === CELL.ROCK ? setCells(m.cells, [[p.x, p.y]], CELL.FLOOR) : m.cells;
        return { ...m, cells, features: [...rest, { id: uid(), x: p.x, y: p.y, type: tool }] };
      });
    }
  };
  const move = (e) => {
    const p = at(e);
    if (!hover || hover.x !== p.x || hover.y !== p.y) setHover(p);
    if (drag) setDrag({ ...drag, x1: p.x, y1: p.y });
    else if (painting.current && PAINT[tool]) paintAt(p);
  };
  const upMouse = () => {
    painting.current = false;
    if (drag) {
      const x = Math.min(drag.x0, drag.x1);
      const y = Math.min(drag.y0, drag.y1);
      const w = Math.abs(drag.x1 - drag.x0) + 1;
      const h = Math.abs(drag.y1 - drag.y0) + 1;
      setDrag(null);
      if (w * h >= 2) {
        const id = uid();
        setMap((m) => {
          const pts = [];
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pts.push([xx, yy]);
          return { ...m, cells: setCells(m.cells, pts, CELL.FLOOR), rooms: renumber([...m.rooms, { id, x, y, w, h, n: m.rooms.length + 1, size: w * h <= 16 ? 'small' : w * h <= 40 ? 'medium' : 'large', name: '', content: {}, notes: '' }]) };
        });
        setSel(id);
        setTool('select');
      }
    }
  };

  const room = doc.map?.rooms.find((q) => q.id === sel);
  const setRoom = (patch) => setMap((m) => ({ ...m, rooms: m.rooms.map((q) => (q.id === sel ? { ...q, ...patch } : q)) }));
  const ctx = () => ctxFor(app, idx, doc, comp);
  const reroll = (field) => setRoom({ content: { ...room.content, [field]: suggestField(field, ctx()) } });
  const restockAll = () => { if (!confirm('Sortear de novo o conteúdo de todas as salas?')) return; pushHistory(); const c = ctx(); setMap((m) => ({ ...m, rooms: m.rooms.map((q) => stockRoom(c, q)) })); };
  const regenMap = (newOne) => {
    if (doc.map?.rooms?.some((q) => Object.keys(q.content || {}).length) && !confirm('Gerar um novo mapa substitui o mapa e as salas atuais. Continuar?')) return;
    pushHistory();
    const d = regenerate(app, idx, { ...doc, seed: newOne ? newSeed() : doc.seed }, { stock: true, comp });
    setDoc(d);
    setSel(d.map.rooms[0]?.id || null);
  };
  const exportPNG = () => mapToPNG(doc, { style: doc.mapStyle }).toBlob((b) => download(`${fileSafe(doc.name || 'masmorra')}.png`, b));
  const exportMD = () => mapToPNG(doc, { style: doc.mapStyle }).toBlob(async (b) => {
    const name = fileSafe(doc.name || 'masmorra');
    const png = new Uint8Array(await b.arrayBuffer());
    const f = String(app.settings?.attachmentsFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const imgDir = f && !/^[A-Za-z]:|^\//.test(app.settings?.attachmentsFolder || '') ? f : 'attachments';
    download(`${name}.zip`, makeZip([{ name: `${name}.md`, data: dungeonMarkdown(doc, `${name}.png`, true) }, { name: `${imgDir}/${name}.png`, data: png }]));
    toast(`ZIP com o .md e o mapa (em ${imgDir}/) gerado — extraia na raiz do vault.`);
  });

  if (!doc.map) return null;
  return html`<div class="dg-editor">
    <div class="ed-toolbar">
      <input class="ed-name" value=${doc.name} placeholder="Nome da masmorra" onInput=${(e) => up({ name: e.target.value })} />
      <button class="btn small ghost" title="Sortear um nome" onClick=${() => up({ name: siteName(idx, doc, rng(newSeed())) })}>🎲</button>
      ${dirty ? html`<span class="unsaved">● alterações não salvas</span>` : null}
      <div class="spacer"></div>
      <button class="btn primary" onClick=${onSave} title="Ctrl+S">Salvar</button>
      <button class="btn" onClick=${exportPNG}>Mapa (PNG)</button>
      <button class="btn" onClick=${exportMD}>Exportar .md</button>
      <button class="btn ghost" onClick=${() => window.print()}>Imprimir</button>
      <button class="btn danger ghost" onClick=${onDelete}>Excluir</button>
    </div>

    <div class="dg-settings ${showSettings ? 'open' : ''}">
      <div class="row wrap">
        <label class="inline">Sistema <${Select} value=${doc.system} onChange=${(v) => up({ system: v })} options=${Object.entries(SYSTEMS)} /></label>
        <label class="inline">Nível do grupo <${Num} value=${doc.partyLevel} min=${1} max=${20} onInput=${(v) => up({ partyLevel: v || 1 })} /></label>
        <label class="inline">Tema <${Select} value=${doc.theme} onChange=${(v) => up({ theme: v })} options=${[['', '—'], ...themes.map((t) => [t.key, t.name])]} /></label>
        <label class="inline">Local <${Select} value=${doc.domain} onChange=${(v) => up({ domain: v })} options=${[['', '—'], ...domains.map((t) => [t.key, t.name])]} /></label>
        <button class="btn small ghost" onClick=${() => setShowSettings(!showSettings)}>${showSettings ? 'menos opções ▴' : 'mais opções ▾'}</button>
      </div>
      ${showSettings ? html`<div class="row wrap">
        <label class="inline">Estilo <${Select} value=${doc.style} onChange=${(v) => up({ style: v })} options=${[['rooms', 'Salas e corredores'], ['caves', 'Cavernas']]} /></label>
        <label class="inline">Salas <${Num} value=${doc.roomsCount} min=${2} max=${30} onInput=${(v) => up({ roomsCount: v || 2 })} /></label>
        <label class="inline">Tamanho <${Select} value=${doc.size} onChange=${(v) => up({ size: v })} options=${Object.entries(SIZES).map(([k, v]) => [k, `${v[2]} (${v[0]}×${v[1]})`])} /></label>
        <${Check} label="água" checked=${!!doc.water} onChange=${(v) => up({ water: v })} />
        <label class="inline">Semente <input type="text" class="w-short" value=${doc.seed} onInput=${(e) => up({ seed: Number(e.target.value) || e.target.value })} /></label>
        <label class="inline">Visual do mapa <${Select} value=${doc.mapStyle} onChange=${(v) => up({ mapStyle: v })} options=${Object.keys(MAP_STYLES).map((k) => [k, { parchment: 'Pergaminho', blueprint: 'Planta azul', ink: 'Tinta (impressão)' }[k]])} /></label>
      </div>` : null}
      <div class="row wrap">
        <button class="btn small" onClick=${() => regenMap(true)}>🎲 Novo mapa</button>
        <button class="btn small ghost" onClick=${() => regenMap(false)} title="Refaz o mapa com a mesma semente e as opções atuais">Refazer com as opções</button>
        <button class="btn small ghost" onClick=${restockAll}>🎲 Repovoar todas as salas</button>
        <button class="btn small ghost" onClick=${undo} title="Ctrl+Z">↶ Desfazer</button>
      </div>
    </div>

    <div class="dg-columns">
      <div class="dg-map-col">
        <div class="dg-tools">${TOOLS.map(([k, icon, label]) => html`<button class=${`tool ${tool === k ? 'on' : ''}`} title=${label} onClick=${() => setTool(k)}>${icon}</button>`)}
          <span class="spacer"></span>
          <button class="tool" title="Diminuir" onClick=${() => setCellSize(Math.max(10, cell - 4))}>−</button>
          <button class="tool" title="Aumentar" onClick=${() => setCellSize(Math.min(40, cell + 4))}>+</button>
        </div>
        <div class="dg-canvas-wrap">
          <canvas ref=${canvasRef} class=${`tool-${tool}`} onMouseDown=${down} onMouseMove=${move} onMouseUp=${upMouse} onMouseLeave=${() => { painting.current = false; setHover(null); if (drag) upMouse(); }}></canvas>
        </div>
        <div class="muted small">${(TOOLS.find((t) => t[0] === tool) || [])[2]} · cada quadrado = 5 ft · Ctrl+Z desfaz</div>
      </div>
      <div class="dg-side">
        ${room ? html`<${RoomPanel} room=${room} setRoom=${setRoom} reroll=${reroll} app=${app}
          onDelete=${() => { pushHistory(); setMap((m) => ({ ...m, rooms: renumber(m.rooms.filter((q) => q.id !== room.id)) })); setSel(null); }}
          onOpen=${(id) => { const e = app.entries.find((x) => x.id === id); if (e) setViewEntry(e); }} />`
          : html`<div class="panel"><h4>Visão geral</h4>
            ${OVERVIEW_FIELDS.map(([k, label, id]) => html`<div class="kv">
              <label>${label}</label>
              <div class="row"><input type="text" value=${doc.overview?.[k] || ''} onInput=${(e) => up({ overview: { ...doc.overview, [k]: e.target.value } })} />
              <button class="icon" title="Sortear" onClick=${() => up({ overview: { ...doc.overview, [k]: roll(idx, id, rng(newSeed())) } })}>🎲</button></div></div>`)}
            <${Field} label="Notas" wide><${TextArea} rows=${5} value=${doc.notes} onInput=${(v) => up({ notes: v })} /></${Field}>
            <p class="muted small">Clique numa sala do mapa (ferramenta ☝) para ver e editar o que há nela.</p>
          </div>`}
        <details class="panel dg-keylist"><summary>Chave completa (${doc.map.rooms.length} salas)</summary>
          ${[...doc.map.rooms].sort((a, b) => a.n - b.n).map((q) => html`<div class="key-row" onClick=${() => setSel(q.id)}>
            <b>${q.n}. ${q.name || roomTitle(q)}</b>
            <span class="small muted">${ROOM_FIELDS.filter(([k]) => q.content?.[k]?.text).map(([k]) => q.content[k].text).join(' · ')}</span></div>`)}
        </details>
      </div>
    </div>
    ${viewEntry ? html`<${Viewer} app=${app} entry=${viewEntry} onClose=${() => setViewEntry(null)} onOpen=${onOpenEntry} />` : null}
  </div>`;
}

const roomTitle = (q) => ({ small: 'Sala pequena', medium: 'Sala', large: 'Salão' }[q.size] || 'Sala');

function RoomPanel({ room, setRoom, reroll, onDelete, onOpen }) {
  const set = (field, patch) => setRoom({ content: { ...room.content, [field]: { ...(room.content?.[field] || {}), ...patch } } });
  return html`<div class="panel room-panel">
    <div class="row"><span class="room-n">${room.n}</span>
      <input type="text" class="room-name" placeholder=${roomTitle(room)} value=${room.name || ''} onInput=${(e) => setRoom({ name: e.target.value })} /></div>
    <p class="muted small">${room.cells ? `${roomCells(room).length} quadrados` : `${room.w * 5} × ${room.h * 5} ft`}</p>
    ${ROOM_FIELDS.map(([k, label]) => {
      const v = room.content?.[k];
      return html`<div class="kv">
        <label>${label}</label>
        <div class="row">
          <input type="text" value=${v?.text || ''} placeholder="—" onInput=${(e) => set(k, { text: e.target.value, url: '', entryId: '' })} />
          <button class="icon" title="Sortear" onClick=${() => reroll(k)}>🎲</button>
          ${v?.text ? html`<button class="icon" title="Limpar" onClick=${() => set(k, { text: '', url: '', entryId: '' })}>×</button>` : null}
        </div>
        ${v?.entryId ? html`<a href="#" class="small" onClick=${(e) => { e.preventDefault(); onOpen(v.entryId); }}>abrir statblock do Compendium</a>` : v?.url ? html`<a class="small" href=${v.url} target="_blank" rel="noopener">ver na fonte ↗</a>` : null}
      </div>`;
    })}
    <${Field} label="Notas da sala" wide><${TextArea} rows=${4} value=${room.notes || ''} onInput=${(v) => setRoom({ notes: v })} /></${Field}>
    <div class="row"><button class="btn small danger ghost" onClick=${() => confirm('Remover esta sala da chave? (O desenho do mapa fica.)') && onDelete()}>Remover sala da chave</button></div>
  </div>`;
}

export function dungeonMarkdown(d, imagePath, wiki = false) {
  const lines = ['---', `name: ${JSON.stringify(d.name || 'Masmorra')}`, `system: ${JSON.stringify(SYSTEMS[d.system] || d.system)}`, `party_level: ${d.partyLevel}`, 'tags: ["compendium", "dungeon"]', '---', '', `# ${d.name || 'Masmorra'}`, ''];
  if (imagePath) lines.push(wiki ? `![[${imagePath}]]` : `![Mapa](${imagePath.replace(/ /g, '%20')})`, ''); // the map stays full width
  lines.push('## Visão geral', '');
  for (const [k, label] of OVERVIEW_FIELDS) if (d.overview?.[k]) lines.push(`- **${label}:** ${d.overview[k]}`);
  if (d.notes) lines.push('', d.notes);
  lines.push('', '## Salas', '');
  for (const q of [...d.map.rooms].sort((a, b) => a.n - b.n)) {
    lines.push(`### ${q.n}. ${q.name || roomTitle(q)}`, '');
    for (const [k, label] of ROOM_FIELDS) {
      const v = q.content?.[k];
      if (v?.text) lines.push(`- **${label}:** ${v.text}${v.url ? ` ([fonte](${v.url}))` : ''}`);
    }
    if (q.notes) lines.push('', q.notes);
    lines.push('');
  }
  lines.push('', '*Tabelas aleatórias: Maze Rats (Ben Milton, CC BY 4.0); Ironsworn: Delve (Shawn Tomkin, CC BY 4.0); Pathfinder Roleplaying Game (Paizo, OGL 1.0a).*');
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ random tables browser
const CATS = [['dungeon', 'Masmorra'], ['site', 'Locais (Delve)'], ['monster', 'Monstros'], ['treasure', 'Tesouro'], ['npc', 'NPCs'], ['city', 'Cidade'], ['wilderness', 'Ermos'], ['magic', 'Magia'], ['misc', 'Outros']];
function TablesBrowser({ idx }) {
  const [cat, setCat] = useState('dungeon');
  const [q, setQ] = useState('');
  const [results, setResults] = useState({});
  const [showCredits, setShowCredits] = useState(false);
  const tables = (idx.data?.tables || []).filter((t) => (q ? t.name.toLowerCase().includes(q.toLowerCase()) : t.category === cat));
  const doRoll = (t, n = 1) => {
    const r = rng(newSeed());
    setResults((s) => ({ ...s, [t.id]: Array.from({ length: n }, () => roll(idx, t, r)) }));
  };
  const src = Object.fromEntries((idx.data?.sources || []).map((s) => [s.id, s]));
  return html`<div class="tables-browser">
    <div class="row wrap">
      <div class="seg">${CATS.map(([k, l]) => html`<button class=${!q && cat === k ? 'on' : ''} onClick=${() => { setQ(''); setCat(k); }}>${l}</button>`)}</div>
      <input type="search" placeholder="Buscar tabela…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn small ghost" onClick=${() => setShowCredits(true)}>Créditos e licenças</button>
    </div>
    <div class="table-grid">${tables.map((t) => html`<div class="table-card">
      <div class="row"><b>${t.name}</b><span class="spacer"></span><span class="src-badge">${src[t.source]?.name || t.source}</span></div>
      ${t.site?.summary ? html`<div class="small muted">${t.site.summary}</div>` : null}
      <div class="row"><button class="btn small primary" onClick=${() => doRoll(t)}>🎲 Rolar</button><button class="btn small ghost" onClick=${() => doRoll(t, 3)}>3×</button>
        <span class="small muted">${t.rows.length} resultados${t.dice ? ` · ${t.dice}` : ''}</span></div>
      ${results[t.id] ? html`<ul class="roll-results">${results[t.id].map((x) => html`<li>${x}</li>`)}</ul>` : null}
    </div>`)}</div>
    ${showCredits ? html`<${Modal} title="Créditos e licenças das tabelas" onClose=${() => setShowCredits(false)}>
      ${(idx.data?.sources || []).map((s) => html`<div class="credit"><b>${s.name}</b> — ${s.author}<br /><span class="small">${s.attribution}</span><br />
        <a class="small" href=${s.url} target="_blank" rel="noopener">fonte ↗</a> · <a class="small" href=${s.licenseUrl} target="_blank" rel="noopener">${s.license} ↗</a></div>`)}
    </${Modal}>` : null}
  </div>`;
}
