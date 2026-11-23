import { html, useState, useRef, useEffect } from '../../vendor/ui.mjs';
import { Field, Text, Check, Select, toast, askText } from './components.js';
import { uid } from '../rules/engine.js';
import { crLabel } from '../rules/tables.js';
import { folderPath } from './editor.js';
import { useComputed, Viewer } from './bestiary.js';
import { exportManyZip, exportToVault, exportJSON } from '../export.js';
import { HOUSE_RULES, defaultHouseRules } from '../rules/houseRules.js';
import { koofrConfig, setKoofrConfig, openKoofrStore } from '../store.js';

export function Library({ app, onOpen }) {
  const [sel, setSel] = useState('__all');
  const [checked, setChecked] = useState([]);
  const [view, setView] = useState(null);
  const fileRef = useRef();
  const comp = useComputed(app);
  const folders = app.folders;
  const children = (pid) => folders.filter((f) => (f.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const descendants = (id) => { const out = [id]; for (const ch of folders.filter((f) => f.parentId === id)) out.push(...descendants(ch.id)); return out; };
  const inFolder = sel === '__all' ? app.entries : sel === '__none' ? app.entries.filter((e) => !e.folderId) : app.entries.filter((e) => e.folderId === sel);
  const list = [...inFolder].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  const fp = (id) => folderPath(folders, id);

  const newFolder = async (parentId) => {
    const name = await askText('Nome da nova pasta');
    if (!name) return;
    await app.setFolders([...folders, { id: uid(), name: name.trim(), parentId: parentId || null }]);
  };
  const rename = async (f) => {
    const name = await askText('Novo nome da pasta', f.name);
    if (name) await app.setFolders(folders.map((x) => (x.id === f.id ? { ...x, name: name.trim() } : x)));
  };
  const remove = async (f) => {
    const ids = descendants(f.id);
    const n = app.entries.filter((e) => ids.includes(e.folderId)).length;
    if (!confirm(`Excluir a pasta "${f.name}"${ids.length > 1 ? ' e subpastas' : ''}? ${n ? `${n} statblock(s) ficarão sem pasta (não serão apagados).` : ''}`)) return;
    for (const e of app.entries.filter((x) => ids.includes(x.folderId))) await app.saveEntry({ ...e, folderId: null }, true);
    await app.setFolders(folders.filter((x) => !ids.includes(x.id)));
    if (ids.includes(sel)) setSel('__all');
  };
  const moveFolder = async (f, parentId) => {
    if (descendants(f.id).includes(parentId)) return toast('Não é possível mover uma pasta para dentro dela mesma.', 'error');
    await app.setFolders(folders.map((x) => (x.id === f.id ? { ...x, parentId: parentId || null } : x)));
  };
  const moveChecked = async (folderId) => {
    for (const id of checked) {
      const e = app.entries.find((x) => x.id === id);
      if (e) await app.saveEntry({ ...e, folderId: folderId || null }, true);
    }
    toast(`${checked.length} statblock(s) movido(s).`);
    setChecked([]);
  };
  const deleteChecked = async () => {
    if (!confirm(`Excluir ${checked.length} statblock(s)? Isso não pode ser desfeito.`)) return;
    for (const id of checked) await app.deleteEntry(id, true);
    setChecked([]);
    toast('Excluídos.');
  };
  const selected = () => app.entries.filter((e) => checked.includes(e.id));
  const importFile = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      const entries = Array.isArray(data) ? data : data.entries || (data.id ? [data] : []);
      const existing = new Set(app.entries.map((e) => e.id));
      let n = 0;
      if (Array.isArray(data.folders)) {
        const known = new Set(folders.map((f) => f.id));
        const merged = [...folders, ...data.folders.filter((f) => !known.has(f.id))];
        await app.setFolders(merged);
      }
      if (data.homebrew) {
        const hb = { ...app.homebrew };
        for (const k of ['subtypes', 'feats', 'abilities', 'classes', 'types', 'races']) {
          const ids = new Set((hb[k] || []).map((x) => x.id));
          hb[k] = [...(hb[k] || []), ...(data.homebrew[k] || []).filter((x) => !ids.has(x.id))];
        }
        await app.setHomebrew(hb);
      }
      for (const e of entries) {
        if (!e || !e.mode) continue;
        const copy = existing.has(e.id) && !confirm(`"${e.name}" já existe. Substituir? (Cancelar = importar como cópia)`) ? { ...e, id: uid() } : e;
        await app.saveEntry(copy, true);
        n++;
      }
      toast(`${n} statblock(s) importado(s).`);
    } catch (e) {
      toast(`Arquivo inválido: ${e.message}`, 'error');
    }
  };

  const Tree = ({ pid, depth }) => children(pid).map((f) => html`<div class="tree-node" style=${`--d:${depth}`}>
    <div class="tree-row ${sel === f.id ? 'sel' : ''}" onClick=${() => { setSel(f.id); setChecked([]); }}
      onDragOver=${(e) => e.preventDefault()} onDrop=${async (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/entry'); const fid = e.dataTransfer.getData('text/folder'); if (id) { const en = app.entries.find((x) => x.id === id); if (en) await app.saveEntry({ ...en, folderId: f.id }, true); } else if (fid && fid !== f.id) { await moveFolder(folders.find((x) => x.id === fid), f.id); } }}
      draggable="true" onDragStart=${(e) => e.dataTransfer.setData('text/folder', f.id)}>
      <span>📁 ${f.name}</span><small class="muted">${app.entries.filter((e) => e.folderId === f.id).length}</small>
      <span class="tree-tools">
        <button class="icon" title="Nova subpasta" onClick=${(e) => { e.stopPropagation(); newFolder(f.id); }}>＋</button>
        <button class="icon" title="Renomear" onClick=${(e) => { e.stopPropagation(); rename(f); }}>✎</button>
        <button class="icon danger" title="Excluir pasta" onClick=${(e) => { e.stopPropagation(); remove(f); }}>×</button>
      </span>
    </div>
    <${Tree} pid=${f.id} depth=${depth + 1} />
  </div>`);

  return html`<div class="library">
    <aside class="lib-tree">
      <div class="lib-tree-head"><b>Pastas</b><button class="btn small" onClick=${() => newFolder(null)}>+ Pasta</button></div>
      <div class="tree-row ${sel === '__all' ? 'sel' : ''}" onClick=${() => { setSel('__all'); setChecked([]); }}><span>📚 Tudo</span><small class="muted">${app.entries.length}</small></div>
      <div class="tree-row ${sel === '__none' ? 'sel' : ''}" onClick=${() => { setSel('__none'); setChecked([]); }}
        onDragOver=${(e) => e.preventDefault()} onDrop=${async (e) => { const id = e.dataTransfer.getData('text/entry'); const fid = e.dataTransfer.getData('text/folder'); if (id) { const en = app.entries.find((x) => x.id === id); if (en) await app.saveEntry({ ...en, folderId: null }, true); } else if (fid) await moveFolder(folders.find((x) => x.id === fid), null); }}>
        <span>🗂 Sem pasta</span><small class="muted">${app.entries.filter((e) => !e.folderId).length}</small></div>
      <${Tree} pid=${null} depth=${0} />
      <div class="muted small">Arraste statblocks ou pastas para reorganizar.</div>
    </aside>
    <div class="lib-main">
      <div class="lib-actions">
        <b>${sel === '__all' ? 'Tudo' : sel === '__none' ? 'Sem pasta' : fp(sel)}</b>
        <span class="muted">${list.length} item(ns)${checked.length ? ` · ${checked.length} selecionado(s)` : ''}</span>
        <div class="spacer"></div>
        <button class="btn small" onClick=${() => setChecked(checked.length === list.length ? [] : list.map((e) => e.id))}>${checked.length === list.length && list.length ? 'Limpar seleção' : 'Selecionar tudo'}</button>
        ${checked.length ? html`
          <select onChange=${(e) => { moveChecked(e.target.value === '__none' ? null : e.target.value); e.target.value = ''; }}>
            <option value="">Mover para…</option><option value="__none">(sem pasta)</option>
            ${folders.map((f) => html`<option value=${f.id}>${fp(f.id)}</option>`)}
          </select>
          <button class="btn small primary" onClick=${() => app.openInBattle(selected())}>⚔ Abrir na batalha</button>
          <button class="btn small" onClick=${() => exportManyZip(app, selected(), fp)}>Exportar .md (ZIP)</button>
          ${app.store.kind === 'server' && app.settings.exportDir ? html`<button class="btn small" onClick=${() => exportToVault(app, selected(), (id) => (app.settings.keepFolders ? fp(id) : ''))}>Enviar ao vault</button>` : null}
          <button class="btn small" onClick=${() => exportJSON(selected(), folders, app.homebrew)}>Exportar JSON</button>
          <button class="btn small danger" onClick=${deleteChecked}>Excluir</button>` : null}
      </div>
      <table class="lib-table">
        <thead><tr><th></th><th>Nome</th><th>Modo</th><th>CR</th><th>Tipo</th><th>Pasta</th><th>Atualizado</th></tr></thead>
        <tbody>${list.map((e) => html`<tr draggable="true" onDragStart=${(ev) => ev.dataTransfer.setData('text/entry', e.id)}>
          <td><input type="checkbox" checked=${checked.includes(e.id)} onChange=${(ev) => setChecked(ev.target.checked ? [...checked, e.id] : checked.filter((x) => x !== e.id))} /></td>
          <td><a href="#" onClick=${(ev) => { ev.preventDefault(); setView(e); }}>${e.name}</a></td>
          <td>${e.mode === 'npc' ? 'NPC' : 'Monstro'}</td>
          <td>${comp[e.id] ? crLabel(comp[e.id].cr) : '?'}</td>
          <td>${comp[e.id]?.type.name || ''}</td>
          <td class="muted">${e.folderId ? fp(e.folderId) : '—'}</td>
          <td class="muted small">${e.updatedAt ? new Date(e.updatedAt).toLocaleString('pt-BR') : ''}</td>
        </tr>`)}</tbody>
      </table>
      <div class="lib-bottom">
        <div class="panel">
          <h4>Backup e importação</h4>
          <div class="row wrap">
            <button class="btn" onClick=${() => exportJSON(app.entries, folders, app.homebrew)}>Backup completo (JSON)</button>
            <button class="btn" onClick=${() => exportManyZip(app, app.entries, fp)}>Exportar tudo em .md (ZIP)</button>
            <button class="btn" onClick=${() => fileRef.current.click()}>Importar JSON…</button>
            <input ref=${fileRef} type="file" accept=".json,application/json" style="display:none" onChange=${(e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>
        ${app.store.kind === 'server' ? html`<${LibraryFolder} app=${app} />` : html`<${KoofrPanel} app=${app} />`}
        <${Settings} app=${app} />
        <${HouseRules} app=${app} />
      </div>
    </div>
    ${view ? html`<${Viewer} app=${app} entry=${view} onClose=${() => setView(null)} onOpen=${onOpen} />` : null}
  </div>`;
}

function Settings({ app }) {
  const [s, setS] = useState(app.settings);
  const server = app.store.kind === 'server';
  return html`<div class="panel">
    <h4>Configurações</h4>
    ${server ? null : html`<p class="muted small">Armazenamento: <b>navegador</b> (IndexedDB). Rode <code>node server.js</code> para salvar em arquivos.</p>`}
    ${server ? html`
      <${Field} label="Pasta de exportação (ex.: seu vault do Obsidian) — vale só para este computador" wide>
        <div class="row"><${Text} value=${s.exportDir || ''} placeholder=${'C:\\Users\\voce\\Obsidian\\Bestiario  ou  /home/voce/Obsidian/Bestiario'} onInput=${(v) => setS({ ...s, exportDir: v })} />
        ${window.ffd20Desktop ? html`<button class="btn small" onClick=${async () => { const d = await window.ffd20Desktop.pickFolder('Pasta do vault do Obsidian'); if (d) setS({ ...s, exportDir: d }); }}>Escolher…</button>` : null}</div></${Field}>
      <${Field} label="Pasta de imagens no vault" wide hint="Relativa à raiz do vault (a pasta que tem .obsidian), ex.: Resources/z_images/Bestiary — ou um caminho completo. As imagens recebem o nome da criatura e entram no .md como ![[imagem]].">
        <div class="row"><${Text} value=${s.attachmentsFolder || ''} placeholder="Resources/z_images/Bestiary" onInput=${(v) => setS({ ...s, attachmentsFolder: v })} />
        ${window.ffd20Desktop ? html`<button class="btn small" onClick=${async () => { const d = await window.ffd20Desktop.pickFolder('Pasta de imagens do vault'); if (d) setS({ ...s, attachmentsFolder: d }); }}>Escolher…</button>` : null}</div></${Field}>
      <${Field} label="Opções da imagem no Obsidian" hint="Texto depois do | no embed: ![[imagem|hs-med+ws-med+right]] ajusta tamanho e posição (tema/snippet do Obsidian). Deixe vazio para não usar.">
        <${Text} value=${s.imageOptions ?? 'hs-med+ws-med+right'} placeholder="(nenhuma)" onInput=${(v) => setS({ ...s, imageOptions: v })} /></${Field}>
      <${Field} label="Sistema padrão para criaturas novas"><${Select} value=${s.defaultSystem || 'ffd20'} onChange=${(v) => setS({ ...s, defaultSystem: v })} options=${[['ffd20', 'Final Fantasy d20'], ['pf1e', 'Pathfinder 1e']]} /></${Field}>
      <${Check} label="Manter a estrutura de pastas da biblioteca ao enviar ao vault" checked=${s.keepFolders} onChange=${(v) => setS({ ...s, keepFolders: v })} />
      <${Check} label="O botão 'Exportar .md' grava direto no vault" checked=${s.preferVault} onChange=${(v) => setS({ ...s, preferVault: v })} />
      <div class="row"><button class="btn primary small" onClick=${async () => { await app.setSettings(s); toast('Configurações salvas.'); }}>Salvar configurações</button></div>` : null}
  </div>`;
}

// ------------------------------------------------------------------ library folder (Koofr, Dropbox, MEGA…)
// Android app / browser: the library in a Koofr folder (the same one the Koofr desktop app syncs on the PC)
function KoofrPanel({ app }) {
  const cur = koofrConfig() || {};
  const [f, setF] = useState({ email: cur.email || '', password: cur.password || '', root: cur.root || '/Compendium' });
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    if (!f.email || !f.password) return toast('Preencha o e-mail e a senha de aplicativo do Koofr.', 'error');
    setBusy(true);
    try {
      const root = `/${f.root.replace(/\\/g, '/').split('/').filter(Boolean).join('/')}`;
      const s = await openKoofrStore({ ...f, root }, { strict: true });
      // real round trip (folder, write, read back, delete) so a problem shows up now, not on the first save
      await s.k.ensureDir(root);
      const probe = JSON.stringify({ test: Date.now() });
      await s.k.putText(root, '.compendium-test.json', probe);
      const back = await s.k.getText(`${root}/.compendium-test.json`);
      await s.k.remove(`${root}/.compendium-test.json`);
      if (!String(back).includes('test')) throw new Error('Koofr: o arquivo de teste não voltou igual.');
      const existing = (await s.k.list(root) || []).filter((x) => x.name !== '.compendium-test.json');
      // first connection from a phone that already has statblocks: offer to send them
      const local = app.store.kind === 'browser' ? app.entries : [];
      if (local.length && confirm(`Enviar os ${local.length} statblock(s) deste aparelho para a pasta ${root} do Koofr?`)) {
        await s.k.ensureDir(root);
        for (const e of local) await s.saveEntry(e);
        for (const d of (await app.store.listDungeons()) || []) await s.saveDungeon(d);
        if (!existing || !existing.some((x) => x.name === 'folders.json')) await s.putDoc('folders', app.folders);
        if (!existing || !existing.some((x) => x.name === 'homebrew.json')) await s.putDoc('homebrew', app.homebrew);
      }
      setKoofrConfig({ ...f, root });
      toast(existing ? `Conectado: pasta ${root} encontrada.` : `Conectado: a pasta ${root} será criada no primeiro salvamento.`);
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast(e.message || String(e), 'error');
    } finally { setBusy(false); }
  };
  const disconnect = () => { if (!confirm('Desconectar do Koofr? A biblioteca continua no Koofr; este aparelho volta a usar só os dados locais.')) return; setKoofrConfig(null); location.reload(); };
  const on = app.store.kind === 'koofr';
  return html`<div class="panel">
    <h4>Koofr ${on ? html`<span class="saved">● conectado${app.store.offline ? ' (sem conexão agora)' : ''}</span>` : null}</h4>
    <div class="muted small">A biblioteca fica numa pasta do Koofr — a mesma que o app do Koofr sincroniza no PC. Se no PC a pasta da biblioteca é
      <code>…\Koofr\Compendium</code>, aqui use <code>/Compendium</code>. Crie uma <b>senha de aplicativo</b> no site do Koofr
      (Preferências → Senha → Gerar nova senha) e use-a aqui, não a sua senha normal.</div>
    <${Field} label="E-mail do Koofr" wide><${Text} value=${f.email} onInput=${(v) => setF({ ...f, email: v.trim() })} placeholder="voce@exemplo.com" /></${Field}>
    <${Field} label="Senha de aplicativo" wide><input type="password" value=${f.password} onInput=${(e) => setF({ ...f, password: e.currentTarget.value.trim() })} placeholder="gerada no Koofr" /></${Field}>
    <${Field} label="Pasta da biblioteca no Koofr" wide><${Text} value=${f.root} onInput=${(v) => setF({ ...f, root: v })} placeholder="/Compendium" /></${Field}>
    <div class="row wrap">
      <button class="btn primary" disabled=${busy} onClick=${connect}>${busy ? 'Conectando…' : on ? 'Salvar e reconectar' : 'Conectar'}</button>
      ${on ? html`<button class="btn ghost danger" onClick=${disconnect}>Desconectar</button>` : null}
      ${!/^https?:/.test(location.protocol) || window.Capacitor ? null : html`<span class="muted small">No navegador o Koofr pode bloquear a conexão; no app de Android funciona direto.</span>`}
    </div>
  </div>`;
}

// Moogle in the Room / Elephant in the Room: each rule on or off (stored with the homebrew, synced)
function HouseRules({ app }) {
  const r = { ...defaultHouseRules(), ...(app.homebrew.houseRules || {}) };
  const set = async (patch) => { await app.setHomebrew({ ...app.homebrew, houseRules: { ...r, ...patch } }); };
  return html`<div class="panel">
    <h4>Regras da casa</h4>
    <${Check} label="Usar Moogle in the Room / Elephant in the Room (fim dos feat taxes)" checked=${r.enabled} onChange=${(v) => set({ enabled: v })} />
    <div class="muted small">Vale para todas as criaturas (FFd20 e Pathfinder). <a href="https://finalfantasyd20.com/system-rules/optional-systems/moogle-in-the-room/" target="_blank" rel="noopener">Regras ↗</a></div>
    ${r.enabled ? html`<div class="house-rules">${HOUSE_RULES.map(([k, title, desc]) => html`<label class="check house-rule"><input type="checkbox" checked=${r[k]} onChange=${(e) => set({ [k]: e.currentTarget.checked })} />
      <span><b>${title}</b><br /><small class="muted">${desc}</small></span></label>`)}</div>` : null}
  </div>`;
}

function LibraryFolder({ app }) {
  const [info, setInfo] = useState(null);
  const [dir, setDir] = useState('');
  const [copy, setCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/library', { cache: 'no-store' }).then((r) => r.json()).then(setInfo).catch(() => {}); }, []);
  const apply = async (body, okMsg) => {
    setBusy(true);
    try {
      const r = await fetch('/api/library/location', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FFd20': '1' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast(okMsg + (j.copied ? ` ${j.copied} statblock(s) copiado(s).` : ''));
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast(e.message, 'error'); setBusy(false); }
  };
  const pick = async () => {
    const d = window.ffd20Desktop ? await window.ffd20Desktop.pickFolder('Pasta da biblioteca (ex.: dentro do Koofr)') : null;
    if (d) setDir(d);
  };
  if (!info) return null;
  return html`<div class="panel">
    <h4>Pasta da biblioteca</h4>
    ${info.error ? html`<p class="small warn">⚠ ${info.error}</p>` : null}
    <p class="small">A biblioteca (statblocks, pastas, homebrew e imagens) está em:<br /><code>${info.dir}</code>${info.custom ? '' : html` <span class="muted">(pasta padrão)</span>`}</p>
    <p class="small muted">Para usar a mesma biblioteca em vários computadores, escolha uma pasta sincronizada pelo <b>Koofr</b> (ou Dropbox, MEGA, OneDrive…) e faça o mesmo nos outros PCs. Use um computador por vez e espere o app de sincronização terminar antes de abrir o programa no outro.</p>
    <div class="row wrap">
      <input type="text" style="flex:1;min-width:220px" placeholder=${'ex.: C:\\Users\\voce\\Koofr\\FFd20  ou  /home/voce/Koofr/FFd20'} value=${dir} onInput=${(e) => setDir(e.target.value)} />
      ${window.ffd20Desktop ? html`<button class="btn small" onClick=${pick}>Escolher pasta…</button>` : null}
    </div>
    <${Check} label="Copiar a biblioteca atual para a nova pasta (junta com o que já existir lá; nada é apagado)" checked=${copy} onChange=${setCopy} />
    <div class="row wrap">
      <button class="btn primary small" disabled=${busy || !dir.trim()} onClick=${() => apply({ dir: dir.trim(), copy }, 'Biblioteca movida para a nova pasta.')}>Usar esta pasta</button>
      ${info.custom ? html`<button class="btn small ghost" disabled=${busy} onClick=${() => confirm('Voltar a usar a pasta padrão deste computador? (A pasta sincronizada continua intacta.)') && apply({ reset: true, copy }, 'Voltando para a pasta padrão.')}>Voltar para a pasta padrão</button>` : null}
    </div>
  </div>`;
}
