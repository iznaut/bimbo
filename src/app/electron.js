import { readFileSync } from "node:fs"
import * as path from "node:path"
import {
    app,
    dialog,
    Menu,
    nativeImage,
    Notification,
    shell,
    Tray,
} from "electron"
import { Conf } from "electron-conf/main"

import config from "../config/index.js"
import {
    getFrontMatterFromFile,
    renderMdToHtml,
    renderFormToHtml,
} from "../templater.js"
import strings from "../config/strings.js"
import { trustedExternalURLs } from "../config/urls.js"

export const APP_PATH = app.getAppPath()
export const USER_DATA_PATH = app.getPath("userData")
export const LOG_PATH = path.join(app.getPath("userData"), config.LOG_FILENAME)

export const APP_SETTINGS = new Conf(config.APP_SETTINGS_DEFAULTS)

export function createTray() {
    return new Tray(nativeImage.createFromDataURL(config.ICON))
}

export function buildMenu(template) {
    return Menu.buildFromTemplate(template)
}

export function openExternalUrl(url) {
    if (trustedExternalURLs.includes(url)) {
        shell.openExternal(url)
    } else {
        logger.warn(`tried to open non-trusted URL ${url}`)
    }
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
