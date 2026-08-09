import * as fs from "node:fs"
import * as path from "node:path"
import { exec } from "node:child_process"
import { platform } from "node:os"

import _ from "lodash"
import prompt from "electron-prompt" // TODO replace with HtmlPopup
import winston from "winston"
import { BugSplatNode as BugSplat } from "bugsplat-node"
import { compareVersions } from "compare-versions"
import tiny from "tiny-json-http"

import {
    APP_PATH,
    USER_DATA_PATH,
    APP_SETTINGS,
    openExternalUrl,
    openPath,
    showHtmlPopup,
    showMessageBox,
    showNotification,
    showPrompt,
    showFilePicker,
    createTray,
    buildMenu,
    LOG_PATH,
} from "./electron.js"
import config from "../config/index.js"
import projects from "./projects.js"
import { deploy, presets, IS_PLUS_MODE, getNeocitiesApiKey } from "../deploy.js"
import strings from "../config/strings.js"
import urls from "../config/urls.js"
import { build } from "../site-generator.js"

import {
    app,
    globalShortcut,
    crashReporter,
    ipcMain,
    clipboard,
} from "electron" // TODO refactor into electron utils
import { resolveHandle as resolveBlueskyHandle } from "../bluesky/main.js"
import { createNewProject, activeProject } from "../index.js"

const IS_DEV_MODE = !app.isPackaged

config.APP_NAME = IS_DEV_MODE ? "bimbo" : app.name
config.LOG_FILENAME = config.APP_NAME + config.LOG_FILENAME

// update PROJECT_STARTERS_PATH based on packaged status
config.PROJECT_STARTERS_PATH = path.join(
    IS_DEV_MODE ? `${process.cwd()}/resources` : process.resourcesPath,
    config.PROJECT_STARTERS_PATH,
)

let bugsplat = null

let tray = null
let trayMenu = null

let latestVersion
let versionIsCurrent = true
let versionCheckError = false

// TODO clean up version/update stuff
const CURRENT_VERSION = (function () {
    // let version = fs
    //     .readFileSync(path.join(APP_PATH, "version"), "utf-8")
    //     .trim()
    let version = app.getVersion()

    if (IS_DEV_MODE) {
        version = version.replace("-beta", "-dev")
    }

    return version
})()

async function getLatestVersion() {
    if (IS_DEV_MODE) {
        latestVersion = "99.99.99-dev"
    } else {
        try {
            const packageJson = await tiny.get({ url: urls.githubPackage })
            latestVersion = JSON.parse(packageJson.body).version
            logger.info(`got version from package ${latestVersion}`)
        } catch (e) {
            logger.warn(strings.update.logError(e))
            versionCheckError = false
        }
    }
    if (latestVersion) {
        versionCheckError = false
        const versionComparison = compareVersions(
            latestVersion,
            CURRENT_VERSION,
        )
        versionIsCurrent = versionComparison === 0
    }
}

function notifyUpdateAvailability() {
    showNotification(
        versionCheckError
            ? strings.update.checkFailed
            : versionIsCurrent
              ? strings.update.none
              : strings.update.available(latestVersion),
    )
}

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

    projects.cleanup()

    tray = createTray()
    tray.on("click", (event) => {
        updateTrayMenu(event.shiftKey)
    })

    globalShortcut.register("CommandOrControl+Alt+R", clearConfig)

    // keeps app open with no real windows
    app.on("window-all-closed", () => {})

    if (projects.activeIndex == -1 && IS_DEV_MODE) {
        openExternalUrl(urls.tutorial)
    }

    updateTrayTitle()
    updateTrayMenu()

    getLatestVersion().then(() => {
        if (!versionIsCurrent) {
            logger.warn(strings.logMsg.updateAvailable)
            notifyUpdateAvailability()
        }
    })

    logger.info(strings.logMsg.ready)
})

function updateTrayMenu(isDebugMode) {
    const isProjectLoaded = !!activeProject
    const loadedProjectMeta = isProjectLoaded ? activeProject.config : {}
    const loadedProjectRoot = isProjectLoaded ? activeProject.paths.ROOT : ""

    const DEPLOY_META = isProjectLoaded && activeProject.secrets?.deployment
    const BSKY_META =
        isProjectLoaded && activeProject.secrets?.integrations?.bluesky
    const bskyAutoPostEnabled = APP_SETTINGS.get("settings.bskyAutoPost")

    trayMenu = buildMenu([
        {
            label: strings.app.titleWithVersion(CURRENT_VERSION),
            enabled: false,
        },
        {
            label: strings.menu.updateAvailable,
            visible: !versionIsCurrent,
            click: () => {
                openExternalUrl(urls.itch)
            },
        },
        { type: "separator" },
        {
            id: "title",
            label: isProjectLoaded
                ? activeProject.title
                : strings.projects.notLoaded,
            type: "submenu",
            submenu: getProjectsSubmenu(),
        },
        {
            label: strings.menu.openPreview,
            enabled: isProjectLoaded,
            click: () => {
                openExternalUrl(urls.localPreview)
            },
        },
        { type: "separator" },
        {
            label: strings.menu.openEditor,
            enabled: isProjectLoaded,
            click: function () {
                logger.info(strings.logMsg.tryEditor(config.EDITOR_COMMAND))

                exec(
                    `${config.EDITOR_COMMAND} "${loadedProjectRoot}"`,
                    (error, stdout, stderr) => {
                        if (error) {
                            logger.error(error)
                            showMessageBox(strings.popups.codiumError)
                        }
                        if (stdout) {
                            logger.info(stdout)
                        }
                        if (stderr) {
                            logger.error(stderr)
                        }
                    },
                )
            },
        },
        {
            label: strings.menu.openFolder,
            enabled: isProjectLoaded,
            click: function () {
                openPath(loadedProjectRoot)
            },
        },
        { type: "separator" },
        {
            id: "deploy",
            label: strings.menu.deploy(DEPLOY_META?.provider),
            visible: !!DEPLOY_META && Object.keys(presets).length > 0,
            click: () => {
                // TODO project-level setting to turn off confirmation prompt?
                const CLICKED_ID = showPrompt(
                    strings.popups.confirmDeployment.message(
                        activeProject.title,
                        DEPLOY_META.provider,
                    ),
                    "warning",
                )

                if (CLICKED_ID == 0) {
                    deploy()
                } else {
                    logger.info(strings.deployment.finish.cancel)
                }
            },
        },
        {
            label: strings.menu.configDeployment,
            type: "submenu",
            enabled: Object.keys(presets).length > 0 && isProjectLoaded,
            visible: !DEPLOY_META,
            submenu: buildMenu(
                Object.keys(presets).map((key) => {
                    return {
                        label: key,
                        click: (menuItem) => {
                            showHtmlPopup("forms", key)
                        },
                    }
                }),
            ),
        },
        {
            label: bskyAutoPostEnabled
                ? strings.menu.bskyAutoPost.enabled(BSKY_META?.handle)
                : strings.menu.bskyAutoPost.disabled,
            visible: !!BSKY_META && IS_PLUS_MODE,
            click: () => {
                APP_SETTINGS.set(
                    "settings.bskyAutoPost",
                    !APP_SETTINGS.get("settings.bskyAutoPost"),
                )
            },
        },
        {
            label: strings.menu.configBsky,
            enabled: IS_PLUS_MODE && isProjectLoaded,
            visible: !BSKY_META,
            click: () => {
                showHtmlPopup("forms", "bluesky")
            },
        },
        {
            label: strings.menu.upgrade,
            visible: Object.keys(presets).length == 0,
            click: function () {
                openExternalUrl(urls.itch)
            },
        },
        { type: "separator" },
        {
            label: strings.menu.settings.title,
            type: "submenu",
            submenu: getSettingsMenu(),
        },
        {
            label: strings.menu.support.title,
            type: "submenu",
            submenu: buildMenu([
                {
                    label: strings.menu.support.checkForUpdates,
                    click: () => {
                        // TODO dedupe
                        getLatestVersion().then(() => {
                            if (!versionIsCurrent) {
                                logger.warn(
                                    strings.update.available(latestVersion),
                                )
                                notifyUpdateAvailability()
                            }
                        })
                    },
                },
                {
                    label: strings.menu.support.openDiscord,
                    click: () => openExternalUrl(urls.discord),
                },
                {
                    label: strings.menu.support.sendEmail,
                    click: () => {
                        if (bugsplat) {
                            bugsplat.post(new Error("user prompted email"))
                        }
                        openExternalUrl(urls.supportMailto)
                    },
                },
            ]),
        },
        {
            label: strings.menu.debug.title,
            visible: isDebugMode,
            type: "submenu",
            submenu: buildMenu([
                {
                    label: strings.menu.debug.copyLog,
                    click: () => {
                        const LOG_CONTENTS = fs.readFileSync(LOG_PATH, "utf-8")
                        clipboard.writeText(LOG_CONTENTS)
                    },
                },
                {
                    label: strings.menu.debug.openUserData,
                    click: () => {
                        openPath(USER_DATA_PATH)
                    },
                },
                // {
                //     label: strings.menu.debug.deleteSecrets,
                //     click: () => {
                //         fs.rmSync(activeProject.paths.SECRETS_FILE)
                //     },
                // },
                {
                    label: strings.menu.debug.clearConfig,
                    click: clearConfig,
                },
            ]),
        },
        {
            label: strings.menu.exit,
            role: "quit",
        },
    ])

    tray.setContextMenu(trayMenu)
}

function updateTrayTitle() {
    let displayTitle = strings.projects.notLoaded

    if (activeProject) {
        displayTitle = activeProject.title
    }

    tray.setToolTip(displayTitle)
    tray.setTitle(
        APP_SETTINGS.get("settings.showProjectTitleInMenubar")
            ? displayTitle
            : "",
    )
}

function configureCrashReporting() {
    const javaScriptErrorHandler = async (error) => {
        await bugsplat.post(error)
        app.quit()
    }

    bugsplat = APP_SETTINGS.get("settings.submitCrashLogs")
        ? new BugSplat("me-iznaut-com", "bimbo", CURRENT_VERSION)
        : null

    if (bugsplat) {
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

function clearConfig() {
    logger.info(strings.logMsg.configClearTry)
    APP_SETTINGS.clear()
    projects.activeIndex = -1
    tray.setToolTip(strings.projects.notLoaded)
    tray.setTitle(strings.projects.notLoaded)
    showMessageBox(strings.app.configClear)
    logger.info(strings.logMsg.configClearSuccess)
}

function getSettingsMenu() {
    const callbacks = {
        showProjectTitleInMenubar: updateTrayTitle,
        submitCrashLogs: () => {
            if (APP_SETTINGS.get("settings.submitCrashLogs")) {
                let clickedId = showPrompt(
                    strings.popups.disableCrashReporting.message,
                    "warning",
                    [
                        strings.popups.disableCrashReporting.confirm,
                        strings.popups.disableCrashReporting.cancel,
                    ],
                )

                if (clickedId == 0) {
                    APP_SETTINGS.set("settings.submitCrashLogs", false)
                    configureCrashReporting()
                }
            } else {
                APP_SETTINGS.set("settings.submitCrashLogs", true)
                configureCrashReporting()
            }
        },
    }

    const requireConfirmation = ["submitCrashLogs"]
    const hidden = ["showAssistant", "bskyAutoPost"]

    let items = _.map(APP_SETTINGS.defaultValues.settings, (v, k) => {
        if (hidden.includes(k)) {
            return
        }

        return {
            label: strings.menu.settings[k],
            type: "checkbox",
            checked: APP_SETTINGS.get(`settings.${k}`),
            click: () => {
                if (!requireConfirmation.includes(k)) {
                    APP_SETTINGS.set(
                        `settings.${k}`,
                        !APP_SETTINGS.get(`settings.${k}`),
                    )
                }

                if (k in callbacks) {
                    callbacks[k]()
                }
            },
        }
    })

    items = _.without(items, undefined)

    return buildMenu(items)
}

function getProjectsSubmenu() {
    // TODO move to projects.js?
    const PROJECT_STARTERS_PATHS = fs
        .readdirSync(config.PROJECT_STARTERS_PATH, {
            withFileTypes: true,
        })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => path.join(dirent.path, dirent.name))

    const PROJECT_MENU_ITEM = (projectPath, index) => {
        const PROJECT = projects.getFromPath(projectPath)
        const RELATIVE_PATH = path.relative(APP_PATH, PROJECT.paths.ROOT)
        const IS_STARTER =
            !RELATIVE_PATH.startsWith("..") && !path.isAbsolute(RELATIVE_PATH)
        const PROJECT_TITLE = `${IS_STARTER ? "📝 " : ""}${PROJECT.title}`

        return {
            label: PROJECT_TITLE,
            type: "radio",
            checked: index == projects.activeIndex,
            click: () => {
                projects.activeIndex = index

                // TODO dedupe
                let displayTitle = APP_SETTINGS.get(
                    "settings.showProjectTitleInMenubar",
                )
                    ? PROJECT_TITLE
                    : ""
                tray.setToolTip(displayTitle)
                tray.setTitle(displayTitle)
            },
        }
    }

    let menuTemplate = [
        ...projects.list.map(PROJECT_MENU_ITEM),
        { type: "separator" },
        {
            label: strings.menu.projects.create,
            type: "submenu",
            submenu: buildMenu(
                PROJECT_STARTERS_PATHS.map((starterPath) => {
                    return {
                        label: path.basename(starterPath),
                        click: async function () {
                            const PROJECT_TITLE = await prompt({
                                title: strings.popups.createProject.title,
                                buttonLabels: {
                                    ok: strings.popups.createProject.confirm,
                                    cancel: strings.popups.createProject.cancel,
                                },
                                label: strings.popups.createProject.label,
                                value: path.basename(starterPath),
                                type: "input",
                            }).catch(logger.error)

                            if (!PROJECT_TITLE) {
                                return
                            }

                            let pickedPaths = showFilePicker({
                                properties: ["openDirectory"],
                            })

                            if (!pickedPaths) {
                                return
                            }

                            const DESTINATION_PATH = path.join(
                                pickedPaths[0],
                                PROJECT_TITLE,
                            )

                            // TODO throw error if fails
                            createNewProject(DESTINATION_PATH, starterPath)

                            projects.activeIndex =
                                projects.add(DESTINATION_PATH)

                            updateTrayTitle()
                        },
                    }
                }),
            ),
        },
        {
            label: strings.menu.projects.import,
            click: function () {
                let pickedPaths = showFilePicker({
                    filters: [
                        { name: strings.app.projectFile, extensions: ["yaml"] },
                    ],
                    properties: ["openFile"],
                })

                if (!pickedPaths) {
                    return
                }

                projects.add(path.dirname(pickedPaths[0]))
                projects.activeIndex = projects.list.length - 1
            },
        },
    ]

    // if (isDev()) {
    //     menuTemplate.unshift(PROJECT_STARTERS.map(PROJECT_MENU_ITEM)) // no index?
    // }

    return buildMenu(menuTemplate)
}

ipcMain.handle("openExternalUrl", async function (_event, url) {
    openExternalUrl(url)
})

ipcMain.handle("form", async function (_event, formData) {
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
        case "sftp": // TODO save secrets?
            deploy(formData.password)
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
})
