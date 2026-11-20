// Appearance: themes and visual preferences. Stored per computer (localStorage), applied to <html>
// as data-* attributes / CSS variables. public/js/boot.js applies them before the app loads (no flash).
import { html, useState } from '../../vendor/ui.mjs';
import { Modal } from './components.js';

export const THEMES = [
  { id: 'arcano', name: 'Arcano', desc: 'Noite violeta e ouro', colors: ['#12101a', '#1f1b29', '#d6b25e', '#ece6f5'] },
  { id: 'pergaminho', name: 'Pergaminho', desc: 'Claro, papel envelhecido', colors: ['#ece2cc', '#f9f3e4', '#8e2a20', '#2c2216'] },
  { id: 'elfico', name: 'Élfico', desc: 'Floresta e prata', colors: ['#0e1612', '#18251e', '#9ed4a4', '#e4eee5'] },
  { id: 'draconico', name: 'Dracônico', desc: 'Brasa e obsidiana', colors: ['#140e0d', '#231917', '#e5683f', '#f4e8e2'] },
  { id: 'cristal', name: 'Cristal', desc: 'Azul cristalino', colors: ['#0c1322', '#162037', '#72c6ff', '#e6edf8'] },
  { id: 'marfim', name: 'Marfim', desc: 'Claro e limpo', colors: ['#f1efea', '#ffffff', '#2f5d8a', '#23201b'] },
];

export const DEFAULT_APPEARANCE = {
  theme: 'auto', // auto = Arcano (escuro) ou Pergaminho (claro), conforme o sistema
  accent: '', headFont: 'cinzel', bodyFont: 'alegreya', sbFont: 'serif', sbPaper: 'parchment',
  scale: 100, density: 'comfortable', ornaments: true, texture: true, cardSize: 180,
};

export function loadAppearance() {
  try { return { ...DEFAULT_APPEARANCE, ...JSON.parse(localStorage.getItem('appearance') || '{}') }; } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function resolveTheme(t) {
  if (t && t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'pergaminho' : 'arcano';
}

export function applyAppearance(a) {
  const r = document.documentElement;
  const set = (k, v) => r.setAttribute(`data-${k}`, v);
  set('theme', resolveTheme(a.theme));
  set('headfont', a.headFont); set('bodyfont', a.bodyFont); set('sbfont', a.sbFont); set('sbpaper', a.sbPaper);
  set('density', a.density); set('ornaments', a.ornaments ? 'on' : 'off'); set('texture', a.texture ? 'on' : 'off');
  r.style.setProperty('--zoom', String((Number(a.scale) || 100) / 100));
  r.style.setProperty('--card-min', `${Number(a.cardSize) || 180}px`);
  for (const v of ['--accent', '--accent2', '--glow']) r.style.removeProperty(v);
  if (/^#[0-9a-f]{6}$/i.test(a.accent || '')) {
    r.style.setProperty('--accent', a.accent);
    r.style.setProperty('--accent2', `color-mix(in srgb, ${a.accent} 70%, white)`);
    r.style.setProperty('--glow', `color-mix(in srgb, ${a.accent} 18%, transparent)`);
  }
}

export function saveAppearance(a) {
  try { localStorage.setItem('appearance', JSON.stringify(a)); } catch { /* ignore */ }
  applyAppearance(a);
}

const themeAccent = (t) => (THEMES.find((x) => x.id === resolveTheme(t)) || THEMES[0]).colors[2];
const Seg = ({ value, options, onChange }) => html`<div class="seg">${options.map(([v, l]) => html`<button class=${value === v ? 'on' : ''} onClick=${() => onChange(v)}>${l}</button>`)}</div>`;

export function AppearanceDialog({ onClose }) {
  const [a, setA] = useState(loadAppearance);
  const up = (patch) => { const n = { ...a, ...patch }; setA(n); saveAppearance(n); };
  const themeCard = (t) => html`<button class="theme-card ${a.theme === t.id ? 'on' : ''}" onClick=${() => up({ theme: t.id })}>
    <div class="sw" style=${`background: linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`}>
      <i style=${`background:${t.colors[2]}`}></i><i style=${`background:${t.colors[3]}`}></i><span style=${`color:${t.colors[2]}`}>Aa</span>
    </div>
    <div class="nm">${t.name}<small>${t.desc}</small></div>
  </button>`;
  return html`<${Modal} title="Aparência" onClose=${onClose} wide actions=${html`<button class="btn small ghost" onClick=${() => up({ ...DEFAULT_APPEARANCE })}>Restaurar padrão</button>`}>
    <div class="appearance">
      <h4>Tema</h4>
      <div class="theme-grid">
        <button class="theme-card ${a.theme === 'auto' ? 'on' : ''}" onClick=${() => up({ theme: 'auto' })}>
          <div class="sw" style="background: linear-gradient(135deg, #12101a 50%, #ece2cc 50%)"><i style="background:#d6b25e"></i><i style="background:#8e2a20"></i><span style="color:#d6b25e">Aa</span></div>
          <div class="nm">Automático<small>Segue o claro/escuro do sistema</small></div>
        </button>
        ${THEMES.map(themeCard)}
      </div>
      <h4>Personalizar</h4>
      <div class="ap-grid">
        <label>Cor de destaque</label>
        <div class="row"><input type="color" value=${a.accent || themeAccent(a.theme)} onInput=${(e) => up({ accent: e.currentTarget.value })} />
          ${a.accent ? html`<button class="btn small ghost" onClick=${() => up({ accent: '' })}>Usar a do tema</button>` : html`<span class="muted small">usando a cor do tema</span>`}</div>
        <label>Fonte dos títulos</label>
        <${Seg} value=${a.headFont} onChange=${(v) => up({ headFont: v })} options=${[['cinzel', 'Cinzel (épica)'], ['garamond', 'Garamond (livro)'], ['system', 'Simples']]} />
        <label>Fonte do texto</label>
        <${Seg} value=${a.bodyFont} onChange=${(v) => up({ bodyFont: v })} options=${[['alegreya', 'Alegreya Sans'], ['garamond', 'Garamond'], ['system', 'Do sistema']]} />
        <label>Tamanho da interface</label>
        <div class="row"><input type="range" min="80" max="130" step="5" value=${a.scale} onInput=${(e) => up({ scale: Number(e.currentTarget.value) })} /><span>${a.scale}%</span></div>
        <label>Espaçamento</label>
        <${Seg} value=${a.density} onChange=${(v) => up({ density: v })} options=${[['comfortable', 'Confortável'], ['compact', 'Compacto']]} />
        <label>Cartas do bestiário</label>
        <div class="row"><input type="range" min="130" max="280" step="10" value=${a.cardSize} onInput=${(e) => up({ cardSize: Number(e.currentTarget.value) })} /><span>${a.cardSize}px</span></div>
        <label>Ornamentos</label>
        <div class="row"><label class="check"><input type="checkbox" checked=${a.ornaments} onChange=${(e) => up({ ornaments: e.currentTarget.checked })} /> Detalhes decorativos (losangos, molduras)</label></div>
        <label>Textura de fundo</label>
        <div class="row"><label class="check"><input type="checkbox" checked=${a.texture} onChange=${(e) => up({ texture: e.currentTarget.checked })} /> Grão de papel sutil</label></div>
        <label>Papel do statblock</label>
        <${Seg} value=${a.sbPaper} onChange=${(v) => up({ sbPaper: v })} options=${[['parchment', 'Pergaminho'], ['white', 'Branco'], ['dark', 'Escuro']]} />
        <label>Fonte do statblock</label>
        <${Seg} value=${a.sbFont} onChange=${(v) => up({ sbFont: v })} options=${[['serif', 'Serifada'], ['sans', 'Sem serifa']]} />
      </div>
      <div class="ap-preview"><button class="btn primary">Botão principal</button><button class="btn">Botão</button><span class="cr-pill">CR 7</span><input type="text" value="Campo de texto" /><span class="muted">As preferências ficam salvas neste computador.</span></div>
    </div>
  </${Modal}>`;
}
