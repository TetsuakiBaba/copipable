const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onPasteNote: (callback) => ipcRenderer.on('paste-note', (event, key) => callback(key)),
    onRequestNote: (callback) => ipcRenderer.on('request-note', (event, key) => callback(key)),
    sendDeliverNote: (key, type, content) => ipcRenderer.send('deliver-note', key, type, content),
    onCopyNote: (callback) => ipcRenderer.on('copy-note', (event, key) => callback(key))
});