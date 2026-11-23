// Applies the saved appearance before the app renders (avoids a flash of the default theme).
import { loadAppearance, applyAppearance } from './ui/appearance.js';
// desktop app: use the native dialogs that give the keyboard focus back to the page (see desktop/preload.cjs)
if (window.ffd20Desktop?.confirm) {
  window.confirm = (m) => window.ffd20Desktop.confirm(m);
  window.alert = (m) => { window.ffd20Desktop.alert(m); };
}
const a = loadAppearance();
applyAppearance(a);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyAppearance(loadAppearance()));
