const electron = require("electron")

electron.contextBridge.exposeInMainWorld("electron", {
    formSubmission: (data) => electron.ipcRenderer.invoke("form", data),
    openExternalUrl: (url) =>
        electron.ipcRenderer.invoke("openExternalUrl", url),
})
