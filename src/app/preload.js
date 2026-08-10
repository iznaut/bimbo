import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electron", {
    formSubmission: (data) => ipcRenderer.invoke("form", data),
    openExternalUrl: (url) => ipcRenderer.invoke("openExternalUrl", url),
})
