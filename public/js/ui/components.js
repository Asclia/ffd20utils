import { html, useState, useEffect, useRef, useMemo, Component } from '../../vendor/ui.mjs';

export function Section({ title, children, open: initial = true, badge, id }) {
  const key = `sec:${id || title}`;
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key); return v === null ? initial : v === '1'; } catch { return initial; }
  });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* ignore */ } };
  return html`<section class="ed-section ${open ? 'open' : ''}">
    <header onClick=${toggle}><span class="chev">${open ? '▾' : '▸'}</span><h3>${title}</h3>${badge ? html`<span class="badge">${badge}</span>` : null}</header>
    ${open ? html`<div class="ed-body">${children}</div>` : null}
  </section>`;
}

export function Field({ label, children, hint, wide, className = '' }) {
  return html`<label class="field ${wide ? 'wide' : ''} ${className}"><span class="lbl">${label}${hint ? html` <i class="hint" title=${hint}>?</i>` : null}</span>${children}</label>`;
}

export function Text({ value, onInput, placeholder, list, className = '' }) {
  return html`<input type="text" class=${className} value=${value ?? ''} placeholder=${placeholder || ''} list=${list} onInput=${(e) => onInput(e.target.value)} />`;
}
export function TextArea({ value, onInput, rows = 3, placeholder }) {
  return html`<textarea rows=${rows} placeholder=${placeholder || ''} value=${value ?? ''} onInput=${(e) => onInput(e.target.value)}></textarea>`;
}
export function Num({ value, onInput, min, max, step = 1, placeholder, allowEmpty = false }) {
  return html`<input type="number" class="num" value=${value ?? ''} min=${min} max=${max} step=${step} placeholder=${placeholder || ''}
    onInput=${(e) => { const v = e.target.value; onInput(v === '' ? (allowEmpty ? null : 0) : Number(v)); }} />`;
}
export function Select({ value, onChange, options, className = '' }) {
  // options: [[value,label]] or [{value,label,group}]
  const opts = options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : o));
  const groups = [...new Set(opts.map((o) => o.group || ''))];
  const render = (o) => html`<option value=${o.value} selected=${String(o.value) === String(value ?? '')}>${o.label}</option>`;
  // "Action" selects (current value '' and first option '' like "+ adicionar…") snap back after a pick.
  const isAction = (value ?? '') === '' && opts[0] && opts[0].value === '';
  return html`<select class=${className} onChange=${(e) => { const v = e.target.value; onChange(v); if (isAction) e.target.value = ''; }}>
    ${groups.length > 1 ? groups.map((g) => (g ? html`<optgroup label=${g}>${opts.filter((o) => (o.group || '') === g).map(render)}</optgroup>` : opts.filter((o) => !o.group).map(render))) : opts.map(render)}
  </select>`;
}
export function Check({ checked, onChange, label, title }) {
  return html`<label class="check" title=${title || ''}><input type="checkbox" checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} /><span>${label}</span></label>`;
}

export function Chips({ items, onRemove, render = (x) => x }) {
  return html`<div class="chips">${items.map((it, i) => html`<span class="chip">${render(it)}${onRemove ? html`<button type="button" title="Remover" onClick=${() => onRemove(it, i)}>×</button>` : null}</span>`)}</div>`;
}

// Searchable picker: shows a filtered list; pick() returns the chosen item.
export function SearchPicker({ items, onPick, placeholder = 'Buscar…', renderItem, getText, limit = 60, filter, autoFocus }) {
  const [q, setQ] = useState('');
  const ref = useRef();
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, []);
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    let list = filter ? items.filter(filter) : items;
    if (n) {
      const starts = [];
      const has = [];
      for (const it of list) {
        const t = getText(it).toLowerCase();
        if (t.startsWith(n)) starts.push(it);
        else if (t.includes(n)) has.push(it);
        if (starts.length > limit) break;
      }
      list = [...starts, ...has];
    }
    return list.slice(0, limit);
  }, [q, items, filter]);
  return html`<div class="picker">
    <input ref=${ref} type="search" placeholder=${placeholder} value=${q} onInput=${(e) => setQ(e.target.value)}
      onKeyDown=${(e) => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); onPick(results[0], q); setQ(''); } }} />
    <div class="picker-list">
      ${results.map((it) => html`<div class="picker-item" onClick=${() => { onPick(it, q); setQ(''); }}>${renderItem ? renderItem(it) : getText(it)}</div>`)}
      ${!results.length ? html`<div class="picker-empty">Nada encontrado.</div>` : null}
    </div>
  </div>`;
}

export function Modal({ title, onClose, children, wide, actions }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return html`<div class="modal-back" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-label=${title}>
      <header><h2>${title}</h2><div class="modal-actions">${actions}</div><button class="icon" onClick=${onClose} title="Fechar">×</button></header>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

let toastSetter = null;
export function Toasts() {
  const [list, setList] = useState([]);
  toastSetter = setList;
  return html`<div class="toasts">${list.map((t) => html`<div class="toast ${t.kind}">${t.text}</div>`)}</div>`;
}
export function toast(text, kind = 'info') {
  if (!toastSetter) return;
  const id = Math.random();
  toastSetter((l) => [...l, { id, text, kind }]);
  setTimeout(() => toastSetter((l) => l.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
}

export function ListEditor({ items, onChange, render, onAdd, addLabel = '+ Adicionar', empty }) {
  const update = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const copy = [...items];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  return html`<div class="list-editor">
    ${items.length ? items.map((it, i) => html`<div class="list-row" key=${it.id || i}>
      <div class="list-row-body">${render(it, (patch) => update(i, patch), i)}</div>
      <div class="list-row-tools">
        <button type="button" class="icon" title="Subir" onClick=${() => move(i, -1)}>↑</button>
        <button type="button" class="icon" title="Descer" onClick=${() => move(i, 1)}>↓</button>
        <button type="button" class="icon danger" title="Remover" onClick=${() => remove(i)}>×</button>
      </div>
    </div>`) : html`<div class="muted small">${empty || 'Nenhum item.'}</div>`}
    ${onAdd ? html`<button type="button" class="btn small" onClick=${onAdd}>${addLabel}</button>` : null}
  </div>`;
}

export function Tip({ text }) {
  return text ? html`<span class="tip" title=${text}>ⓘ</span>` : null;
}

// Keeps one broken view from taking the whole app down.
export class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null }; }
  componentDidCatch(error) { console.error(error); this.setState({ error }); }
  render() {
    if (this.state.error) {
      return html`<div class="panel"><h4>Algo deu errado nesta tela</h4><p class="small">${String(this.state.error.message || this.state.error)}</p>
        <button class="btn small" onClick=${() => this.setState({ error: null })}>Tentar de novo</button></div>`;
    }
    return this.props.children;
  }
}
