// FFd20 Utils — desktop app (Electron). Starts the same local server used by the web
// version in the background and shows the app in its own window.
import { app, BrowserWindow, shell, Menu, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;

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
      title: 'FFd20 Utils', backgroundColor: '#0f1420', show: false,
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { contextIsolation: true, sandbox: true },
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
    dialog.showErrorBox('FFd20 Utils', `Não foi possível iniciar o programa:\n${e.stack || e.message}`);
    app.quit();
  }
}
