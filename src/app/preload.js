const electron = require("electron") // need to use require() in web views

electron.contextBridge.exposeInMainWorld("electron", {
    formSubmission: (data) => electron.ipcRenderer.invoke("form", data),
    openExternalUrl: (url) =>
        electron.ipcRenderer.invoke("openExternalUrl", url),
})
