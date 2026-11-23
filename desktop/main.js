// Compendium — desktop app (Electron). Starts the same local server used by the web
// version in the background and shows the app in its own window.
import { app, BrowserWindow, shell, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;
// Keep the data folder of earlier versions (the app was called "FFd20 Utils"; package name ffd20utils).
app.setPath('userData', path.join(app.getPath('appData'), 'ffd20utils'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

async function start() {
  try {
    const { startServer } = await import('../server.js');
    // Fixed preferred port so the app keeps its browser-side preferences between launches.
    const { url } = await startServer({ dataDir: path.join(app.getPath('userData'), 'biblioteca'), port: 47420 });
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1440, height: 920, minWidth: 900, minHeight: 600,
      title: 'Compendium', backgroundColor: '#12101a', show: false,
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
    });
    // confirm/alert from the page: shown as native message boxes, then the page gets the focus back
    const refocus = () => setTimeout(() => { if (win && !win.isDestroyed()) { win.focus(); win.webContents.focus(); } }, 0);
    ipcMain.on('dialog-confirm', (e, message) => {
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['OK', 'Cancelar'], defaultId: 0, cancelId: 1, title: 'Compendium', message });
      e.returnValue = r === 0;
      refocus();
    });
    ipcMain.on('dialog-alert', (e, message) => {
      dialog.showMessageBoxSync(win, { type: 'info', buttons: ['OK'], title: 'Compendium', message });
      e.returnValue = true;
      refocus();
    });
    // native folder picker for the library folder / Obsidian vault
    ipcMain.handle('pick-folder', async (e, title) => {
      const r = await dialog.showOpenDialog(win, { title: title || 'Escolher pasta', properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    // Links to other sites open in the normal browser.
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:/.test(target)) shell.openExternal(target);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, target) => {
      if (!target.startsWith(url)) { e.preventDefault(); shell.openExternal(target); }
    });
    // Developer tools / reload shortcuts, since the menu bar is hidden.
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'F12') win.webContents.toggleDevTools();
      if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) win.webContents.reload();
    });
    await win.loadURL(url);
  } catch (e) {
    dialog.showErrorBox('Compendium', `Não foi possível iniciar o programa:\n${e.stack || e.message}`);
    app.quit();
  }
}
