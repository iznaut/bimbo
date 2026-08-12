import * as path from "node:path"
import { fileURLToPath } from "url"
import { app, BrowserWindow } from "electron"
import { renderFormToHtml } from "../templater.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RENDERER_PATH = path.join(__dirname, "renderer")

function createBrowserWindow() {
    const browserWindow = new BrowserWindow({
        useContentSize: true,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
    })
    if (!app.isPackaged) {
        browserWindow.webContents.openDevTools()
    }
    return browserWindow
}

export async function renderFormInWindow(formName) {
    const browserWindow = createBrowserWindow()
    const html = renderFormToHtml(formName, RENDERER_PATH)
    await browserWindow.loadURL(
        "data:text/html;charset=UTF-8," + encodeURIComponent(html),
        {
            baseURLForDataURL: `file://${RENDERER_PATH}/`,
        },
    )
    return browserWindow
}

export async function openPageInWindow(pageName) {
    const browserWindow = createBrowserWindow()
    await browserWindow.loadFile(
        path.join(RENDERER_PATH, "app", `${pageName}.html`),
    )
    return browserWindow
}
