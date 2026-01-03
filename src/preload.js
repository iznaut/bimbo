const electron = require('electron')

electron.contextBridge.exposeInMainWorld('electron', {
	openDialog: (method, config) => electron.ipcRenderer.invoke('dialog', method, config),
	log: (callback) => electron.ipcRenderer.on('bimbo-log', (e, ...args) => callback(args)),
	quit: () => electron.ipcRenderer.invoke('quit')
});