const electron = require("electron") // need to use require() in web views

electron.contextBridge.exposeInMainWorld("electron", {
    formSubmission: (data) => electron.ipcRenderer.send("form", data),
    onStartersList: (callback) =>
        electron.ipcRenderer.on("starters-list", (_event, value) =>
            callback(value),
        ),
})

// TODO use .invoke to get data back from main process, e.g. selecting a local folder for a new project
