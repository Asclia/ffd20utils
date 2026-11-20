// Exposes a tiny, explicit API to the page (no Node access in the renderer).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ffd20Desktop', {
  pickFolder: (title) => ipcRenderer.invoke('pick-folder', title),
});
