// Markdown / JSON export (download, ZIP with image, or straight into an Obsidian vault folder).
import { compute } from './rules/engine.js';
import { buildStatblock, statblockMarkdown } from './rules/statblock.js';
import { download, makeZip, fetchBytes, extFromUrl, dataUrlBytes, fileSafe } from './util.js';
import { toast } from './ui/components.js';
import { loadAppearance } from './ui/appearance.js';

const isLocal = (src) => src && (src.startsWith('/userdata/') || src.startsWith('data:'));
// images folder inside ZIP exports: the vault images folder from the settings (when relative) or "attachments"
const zipImageDir = (app) => { const f = String(app.settings?.attachmentsFolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); return f && !/^[A-Za-z]:|^\//.test(app.settings?.attachmentsFolder || '') ? f : 'attachments'; };

export function markdownFor(app, def, c, opts = {}) {
  const comp = c || compute(def, { ...app.db, homebrew: app.homebrew });
  return statblockMarkdown(buildStatblock(def, comp, app.db), def, comp, { abilityLayout: loadAppearance().sbAbilityLayout, imageOptions: app.settings?.imageOptions ?? 'hs-med+ws-med+right', ...opts });
}

// Download a single .md (or .zip with the image if it is a local file)
export async function exportMarkdown(app, def, c) {
  const name = fileSafe(def.name);
  const src = def.image?.src || '';
  if (app.settings?.exportDir && app.store.kind === 'server' && app.settings.preferVault) return exportToVault(app, [def]);
  if (!isLocal(src)) {
    download(`${name}.md`, markdownFor(app, def, c));
    return;
  }
  try {
    const ext = extFromUrl(src);
    const imgName = `${name}${ext}`;
    const bytes = src.startsWith('data:') ? dataUrlBytes(src) : await fetchBytes(src);
    const md = markdownFor(app, def, c, { imagePath: imgName, wikiImage: true });
    download(`${name}.zip`, makeZip([{ name: `${name}.md`, data: md }, { name: `${zipImageDir(app)}/${imgName}`, data: bytes }]));
    toast(`ZIP com .md e imagem (em ${zipImageDir(app)}/) gerado — extraia na raiz do vault.`);
  } catch (e) {
    toast(`Não consegui incluir a imagem (${e.message}); exportando só o .md.`, 'error');
    download(`${name}.md`, markdownFor(app, def, c));
  }
}

// Many entries -> one ZIP keeping folder structure
export async function exportManyZip(app, entries, folderPathOf) {
  const files = [];
  const used = new Set();
  for (const def of entries) {
    const dir = folderPathOf(def.folderId);
    let base = fileSafe(def.name);
    let path = (dir ? `${dir}/` : '') + base;
    let i = 2;
    while (used.has(path)) path = (dir ? `${dir}/` : '') + `${base} (${i++})`;
    used.add(path);
    const src = def.image?.src || '';
    let opts = {};
    if (isLocal(src)) {
      try {
        const ext = extFromUrl(src);
        const imgName = `${base}${ext}`;
        const bytes = src.startsWith('data:') ? dataUrlBytes(src) : await fetchBytes(src);
        files.push({ name: `${zipImageDir(app)}/${imgName}`, data: bytes });
        opts = { imagePath: imgName, wikiImage: true };
      } catch { /* skip image */ }
    }
    files.push({ name: `${path}.md`, data: markdownFor(app, def, null, opts) });
  }
  download('ffd20-bestiario.zip', makeZip(files));
}

// Server: write .md files (and copy local images) into the configured vault folder
export async function exportToVault(app, entries, folderPathOf = () => '') {
  if (app.store.kind !== 'server') return toast('Exportar para pasta requer o servidor local.', 'error');
  const files = entries.map((def) => {
    const local = !!def.image?.src?.startsWith('/userdata/images/');
    return {
      name: def.name,
      sub: folderPathOf(def.folderId),
      image: local ? def.image.src : undefined,
      // the server replaces {{IMAGE}} with the copied file name; Obsidian resolves ![[file]] anywhere in the vault
      content: markdownFor(app, def, null, local ? { imagePath: '{{IMAGE}}', wikiImage: true } : {}),
    };
  });
  try {
    const bySub = {};
    for (const f of files) (bySub[f.sub || ''] = bySub[f.sub || ''] || []).push(f);
    let count = 0;
    let dir = '';
    for (const [sub, list] of Object.entries(bySub)) {
      const r = await app.store.exportToFolder({ subfolder: sub, files: list });
      count += r.written.length;
      dir = r.dir;
    }
    toast(`${count} arquivo(s) gravado(s) em ${dir}`);
  } catch (e) {
    toast(`Falha ao exportar: ${e.message}`, 'error');
  }
}

export function exportJSON(entries, folders, homebrew) {
  download(`ffd20-biblioteca-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: 'ffd20utils', version: 1, exportedAt: new Date().toISOString(), entries, folders, homebrew }, null, 2), 'application/json');
}
