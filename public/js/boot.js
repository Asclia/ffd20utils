// Applies the saved appearance before the app renders (avoids a flash of the default theme).
import { loadAppearance, applyAppearance } from './ui/appearance.js';
const a = loadAppearance();
applyAppearance(a);
window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => applyAppearance(loadAppearance()));
