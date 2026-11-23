// Exposes a tiny, explicit API to the page (no Node access in the renderer).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ffd20Desktop', {
  pickFolder: (title) => ipcRenderer.invoke('pick-folder', title),
  // native confirm/alert that give the keyboard focus back to the page afterwards (Electron's own
  // window.confirm leaves text fields unable to receive typing on Windows until the window is refocused)
  confirm: (message) => ipcRenderer.sendSync('dialog-confirm', String(message ?? '')),
  alert: (message) => ipcRenderer.sendSync('dialog-alert', String(message ?? '')),
});
