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
import { join as pathJoin } from "node:path"
import { Conf } from "electron-conf/main"
import { fileURLToPath } from "url"
import { dirname, join } from "node:path"
import { readFileSync } from "node:fs"

import config from "../config/config.js"
import { compile } from "../templater.js"
import strings from "../config/strings.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const RENDERER_PATH = pathJoin(__dirname, "renderer")

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

export function showHtmlPopup(type, contentName) {
    const window = new BrowserWindow({
        useContentSize: true,
        alwaysOnTop: true,
        webPreferences: {
            preload: pathJoin(__dirname, "preload.js"),
        },
    })

    const HTML = compile(
        pathJoin(RENDERER_PATH, type, "base.hbs"),
        pathJoin(RENDERER_PATH, type, `${contentName}.md`),
        pathJoin(RENDERER_PATH, `partials`),
        true,
    )

    window.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(HTML), {
        baseURLForDataURL: `file://${RENDERER_PATH}/`,
    })

    if (!app.isPackaged) {
        window.webContents.openDevTools()
    }
}
