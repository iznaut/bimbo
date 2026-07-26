import {
    app,
    BrowserWindow,
    dialog,
    Menu,
    nativeImage,
    Notification,
    shell,
    Tray,
} from "electron"
import { Conf } from "electron-conf/main"
import { fileURLToPath } from "url"
import { dirname, join } from "node:path"

import config from "../config/config.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const APP_PATH = app.getAppPath()
export const USER_DATA_PATH = app.getPath("userData")
export const LOG_PATH = join(app.getPath("userData"), config.LOG_FILENAME)

export const conf = new Conf(config.USER_CONFIG_DEFAULTS)

export function createTray() {
    return new Tray(nativeImage.createFromDataURL(config.ICON))
}

export function buildMenu(template) {
    return Menu.buildFromTemplate(template)
}

export function openExternalUrl(url) {
    shell.openExternal(url)
}

export function openPath(path) {
    shell.openPath(path)
}

export function showNotification(body) {
    new Notification({
        title: config.APP_NAME,
        body: body,
        icon: config.ICON,
    }).show()
}

export function showMessageBox(message, type = "none") {
    dialog.showMessageBoxSync({
        message: message,
        type: type,
        icon: config.ICON,
    })
}

export function showPrompt(message, type = "none", buttons = null) {
    if (!buttons) {
        buttons = [
            strings.popups.confirmDeployment.confirm,
            strings.popups.confirmDeployment.cancel,
        ]
    }

    return dialog.showMessageBoxSync({
        message: message,
        type: type,
        buttons: buttons,
        defaultId: 1,
        cancelId: 1,
        icon: config.ICON,
    })
}

export function showFilePicker(config) {
    return dialog.showOpenDialogSync(config)
}

// TODO make deployment htmls into templates
export function showHtmlPopup(htmlPath) {
    const window = new BrowserWindow({
        useContentSize: true,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
    })

    window.loadFile(htmlPath)
}
