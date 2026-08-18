import * as path from "node:path"
import { exec } from "node:child_process"
import { platform } from "node:os"

import winston from "winston"
import { BugSplatNode as BugSplat } from "bugsplat-node"
import { app, globalShortcut, crashReporter, ipcMain, Menu } from "electron"

import {
    APP_SETTINGS,
    openExternalUrl,
    showMessageBox,
    LOG_PATH,
} from "./electron.js"
import { renderFormInWindow, openPageInWindow } from "./window.js"
import config from "../config/index.js"
import projects from "./projects.js"
import { deploy, getNeocitiesApiKey } from "../deploy.js"
import strings from "../config/strings.js"
import urls from "../config/urls.js"
import { build } from "../site-generator.js"
import { resolveHandle as resolveBlueskyHandle } from "../bluesky/main.js"
import { createNewProject, activeProject } from "../index.js"
import { checkVersion, CURRENT_VERSION } from "./version.js"
import { initializeTray, updateTrayTitle } from "./tray.js"

let bugsplat = null

configureCrashReporting()

app.whenReady().then(() => {
    logger.add(
        new winston.transports.File({
            filename: LOG_PATH,
            handleRejections: true,
            humanReadableUnhandledException: true,
        }),
    )

    logger.info(strings.logMsg.logPath(LOG_PATH))
    logger.info(strings.app.titleWithVersion(CURRENT_VERSION))

    // hide dock icon on mac
    if (platform() === "darwin") {
        app.dock.hide()
    }

    initializeTray()

    projects.cleanup()

    globalShortcut.register("CommandOrControl+Alt+R", clearConfig)

    // keeps app open with no real windows
    app.on("window-all-closed", () => {})

    if (projects.activeIndex == -1 && !config.DEV_MODE) {
        openExternalUrl(urls.tutorial)
    }

    checkVersion()

    logger.info(strings.logMsg.ready)
})

// redirect navigation and new windows to user's browser instead
app.on("web-contents-created", (event, contents) => {
    // prevents navigation within BrowserWindow
    contents.on("will-navigate", (event, navigationUrl) => {
        event.preventDefault()
        openExternalUrl(navigationUrl)
    })
    // prevents new BrowserWindow opening
    contents.setWindowOpenHandler(({ url }) => {
        openExternalUrl(url)
        return { action: "deny" }
    })
})

// TODO move out of this file
export function configureCrashReporting() {
    const javaScriptErrorHandler = async (error) => {
        await bugsplat.post(error)
        app.quit()
    }

    bugsplat = APP_SETTINGS.get("settings.submitCrashLogs")
        ? new BugSplat("me-iznaut-com", "bimbo", CURRENT_VERSION)
        : null

    if (bugsplat && !config.DEV_MODE) {
        bugsplat.setDefaultAdditionalFilePaths([LOG_PATH])

        crashReporter.start({
            submitURL: urls.bugsplat,
            ignoreSystemCrashHandler: true,
            uploadToServer: true,
            rateLimit: false,
            globalExtra: {
                product: "bimbo",
                version: CURRENT_VERSION,
                key: "en-US",
            },
        })

        process.on("unhandledRejection", javaScriptErrorHandler)
        process.on("uncaughtException", javaScriptErrorHandler)
    } else {
        process.removeListener("unhandledRejection", javaScriptErrorHandler)
        process.removeListener("uncaughtException", javaScriptErrorHandler)
    }
}

export function clearConfig() {
    logger.info(strings.logMsg.configClearTry)
    APP_SETTINGS.clear()
    projects.activeIndex = -1
    updateTrayTitle(strings.projects.notLoaded)
    showMessageBox(strings.app.configClear)
    logger.info(strings.logMsg.configClearSuccess)
}

ipcMain.on("form", async function (event, formData) {
    if (event.senderFrame.origin !== "file://") {
        logger.warn(
            `received form submission from external URL ${event.senderFrame.url}`,
        )
        return
    }

    if (formData.id === "new-project") {
        handleNewProjectForm(formData)
    } else if (formData.formType === "deploy") {
        handleDeployForm(formData)
    } else {
        logger.warn(
            `unknown form id "${formData.id}" with type "${formData.formType}"`,
        )
    }
})

function handleNewProjectForm(formData) {
    // TODO validate project title as valid folder name
    const destinationPath = path.join(formData.projectRoot, formData.title)

    // TODO throw error if fails
    createNewProject(destinationPath, formData.starter)

    projects.activeIndex = projects.add(destinationPath)

    // TODO bug: tray title and project list not being updated

    updateTrayTitle()
}

async function handleDeployForm(formData) {
    let newSecrets = {}

    switch (formData.id) {
        case "nekoweb":
            newSecrets = {
                deployment: {
                    provider: formData.id,
                    domain: formData.domain,
                    apiKey: formData.apiKey,
                },
            }
            break
        case "neocities":
            const API_KEY = await getNeocitiesApiKey(
                formData.username,
                formData.password,
            ) // TODO no css?

            if (!API_KEY) {
                showMessageBox(strings.popups.deployFail(formData.id), "error")
            }

            newSecrets = {
                deployment: {
                    provider: formData.id,
                    apiKey: API_KEY,
                },
            }
            break
        case "other":
            newSecrets = {
                deployment: {
                    provider: formData.id,
                    host: formData.host,
                    port: formData.port,
                    siteRoot: formData.siteRoot,
                    username: formData.username,
                    password: formData.password, // TODO never save passwords
                    // TODO keypath
                },
            }
            break
        case "bluesky":
            newSecrets = {
                integrations: {
                    bluesky: {
                        handle: formData.handle, // TODO do we need this? will it break if changed?
                        userId: await resolveBlueskyHandle(formData.handle),
                        appPassword: formData.appPassword,
                    },
                },
            }
            break
        default:
            break
    }

    activeProject.updateSecrets(newSecrets)

    if (newSecrets.deployment) {
        // TODO oh god test this before shipping
        await build() // .then?

        // await setTimeout(1000) // HACK to get around build not finishing in time for deploy

        try {
            deploy()
        } catch (err) {
            logger.error(err)
        }
    }
}
