import { html, useState, useRef } from '../../vendor/ui.mjs';
import { Field, Text, Check, toast, askText } from './components.js';
import { uid } from '../rules/engine.js';
import { crLabel } from '../rules/tables.js';
import { folderPath } from './editor.js';
import { useComputed, Viewer } from './bestiary.js';
import { exportManyZip, exportToVault, exportJSON } from '../export.js';

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
        <${Settings} app=${app} />
        ${app.store.kind === 'server' ? html`<${SyncPanel} app=${app} />` : null}
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
    <p class="muted small">Armazenamento: ${server ? html`<b>arquivos locais</b> em <code>${app.store.dataDir || 'userdata/'}</code>` : html`<b>navegador</b> (IndexedDB). Rode <code>node server.js</code> para salvar em arquivos.`}</p>
    ${server ? html`
      <${Field} label="Pasta de exportação (ex.: seu vault do Obsidian)" wide><${Text} value=${s.exportDir || ''} placeholder=${'C:\\Users\\voce\\Obsidian\\Bestiario  ou  /home/voce/Obsidian/Bestiario'} onInput=${(v) => setS({ ...s, exportDir: v })} /></${Field}>
      <${Field} label="Subpasta de imagens"><${Text} value=${s.attachmentsFolder || ''} placeholder="attachments" onInput=${(v) => setS({ ...s, attachmentsFolder: v })} /></${Field}>
      <${Check} label="Manter a estrutura de pastas da biblioteca ao enviar ao vault" checked=${s.keepFolders} onChange=${(v) => setS({ ...s, keepFolders: v })} />
      <${Check} label="O botão 'Exportar .md' grava direto no vault" checked=${s.preferVault} onChange=${(v) => setS({ ...s, preferVault: v })} />
      <div class="row"><button class="btn primary small" onClick=${async () => { await app.setSettings(s); toast('Configurações salvas.'); }}>Salvar configurações</button></div>` : null}
  </div>`;
}

// ------------------------------------------------------------------ Google Drive sync
function SyncPanel({ app }) {
  const st = app.syncStatus;
  const [cid, setCid] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const refresh = async () => app.setSyncStatus(await app.store.syncStatus());
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
    refresh();
  };
  const connect = () => run(async () => {
    const { url } = await app.store.syncCall('connect');
    window.open(url, '_blank');
    toast('Faça o login no navegador que abriu e volte aqui.');
  });
  if (!st) return null;
  const showForm = !st.configured || showSetup;
  return html`<div class="panel sync-panel">
    <h4>Sincronização com Google Drive</h4>
    ${st.connected ? html`
      <p>✅ Conectado${st.account ? html` como <b>${st.account}</b>` : ''}. A biblioteca (statblocks, pastas, homebrew e imagens) fica na pasta <b>FFd20 Utils</b> do seu Drive.</p>
      <p class="small ${st.state === 'error' ? 'warn' : 'muted'}">${st.state === 'syncing' ? 'Sincronizando…' : st.state === 'error' ? `Erro: ${st.error}` : st.lastSync ? `Última sincronização: ${new Date(st.lastSync).toLocaleString('pt-BR')}` : 'Ainda não sincronizado.'}
        ${st.lastResult && st.state !== 'error' ? ` · ${st.lastResult.uploaded} enviado(s), ${st.lastResult.downloaded} recebido(s)${st.lastResult.conflicts ? `, ${st.lastResult.conflicts} conflito(s) salvos como cópia` : ''}` : ''}</p>
      <div class="row wrap">
        <button class="btn primary small" disabled=${busy} onClick=${() => run(() => app.store.syncCall('now'), 'Sincronizado.')}>Sincronizar agora</button>
        <${Check} label="Sincronizar automaticamente" checked=${st.auto} onChange=${(v) => run(() => app.store.syncCall('config', { auto: v }))} />
        <button class="btn small ghost" onClick=${() => run(async () => { await navigator.clipboard.writeText(await app.store.syncSetupCode()); }, 'Código de configuração copiado. Cole-o nos outros computadores.')}>Copiar código para outro PC</button>
        <button class="btn small danger" disabled=${busy} onClick=${() => confirm('Desconectar deste Google Drive? Os arquivos locais e os do Drive continuam onde estão.') && run(() => app.store.syncCall('disconnect'), 'Desconectado.')}>Desconectar</button>
      </div>` : html`
      <p class="small muted">Mantém a mesma biblioteca em todos os seus computadores usando o seu Google Drive (gratuito). O programa só acessa os arquivos que ele mesmo cria.</p>
      ${st.configured && !showForm ? html`
        <div class="row wrap"><button class="btn primary" disabled=${busy} onClick=${connect}>Conectar ao Google Drive</button>
        <button class="btn small ghost" onClick=${() => setShowSetup(true)}>trocar credenciais</button></div>` : null}`}
    ${showForm && !st.connected ? html`
      <details class="traits" open=${!st.configured}><summary>Primeira vez? Como obter as credenciais (uma vez só, ~5 min)</summary>
        <ol class="small">
          <li>Abra <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> e crie um projeto (ex.: "FFd20 Utils").</li>
          <li>Ative a <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a> nesse projeto.</li>
          <li>Em <b>Google Auth Platform</b> (antiga "Tela de consentimento OAuth"): tipo <b>Externo</b>, nome do app e seu e-mail. Em <b>Público-alvo</b>, clique em <b>Publicar app</b> (sem isso o login expira a cada 7 dias).</li>
          <li>Em <b>Clientes</b> (ou Credenciais → Criar credenciais → ID do cliente OAuth), escolha o tipo <b>App para computador</b> e crie.</li>
          <li>Copie o <b>ID do cliente</b> e a <b>Chave secreta do cliente</b> e cole abaixo.</li>
        </ol>
        <p class="small muted">No login, o Google pode avisar que o app não foi verificado: é o seu próprio app; clique em <i>Avançado → Acessar</i>. Detalhes no README.</p>
      </details>
      <${Field} label="ID do cliente (Client ID)" wide><${Text} value=${cid} placeholder="123456-abc.apps.googleusercontent.com" onInput=${setCid} /></${Field}>
      <${Field} label="Chave secreta do cliente (Client Secret)" wide><${Text} value=${secret} placeholder="GOCSPX-…" onInput=${setSecret} /></${Field}>
      <div class="row wrap">
        <button class="btn primary small" disabled=${busy || !cid.trim() || !secret.trim()} onClick=${() => run(async () => { await app.store.syncCall('config', { clientId: cid, clientSecret: secret }); setShowSetup(false); }, 'Credenciais salvas. Agora clique em "Conectar ao Google Drive".')}>Salvar credenciais</button>
      </div>
      <${Field} label="…ou cole o código de configuração copiado de outro PC" wide><${Text} value=${code} placeholder="ffd20:…" onInput=${setCode} /></${Field}>
      <div class="row"><button class="btn small" disabled=${busy || !code.trim()} onClick=${() => run(async () => { await app.store.syncCall('config', { setupCode: code }); setCode(''); setShowSetup(false); }, 'Credenciais importadas. Agora clique em "Conectar ao Google Drive".')}>Usar código</button></div>` : null}
  </div>`;
}
