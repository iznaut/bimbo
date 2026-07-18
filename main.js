import * as fs from "node:fs"
import * as path from "node:path"
import { exec } from "node:child_process"
import _ from "lodash"
import prompt from "electron-prompt"
import * as yaml from "yaml"
import winston from "winston"
import Handlebars from "handlebars"
import { BugSplatNode as BugSplat } from "bugsplat-node"

import {
    CURRENT_VERSION,
    conf,
    isDev,
    logger,
    versionIsCurrent,
    getLatestVersion,
    notifyUpdateAvailability,
    openBrowserPreview,
    isPlatformMac,
    showMessageBox,
    showPrompt,
    showFilePicker,
    showHtmlPopup,
} from "./utils.js"
import config from "./config/config.js"
import projects from "./projects.js"
import { deploy, presets, IS_PLUS_MODE } from "./deploy.js"
import strings from "./config/strings.js"
import urls from "./config/urls.js"

import {
    app,
    Menu,
    shell,
    globalShortcut,
    Tray,
    BrowserWindow,
    crashReporter,
    ipcMain,
} from "electron"
import { resolveHandle } from "./integrations/bluesky/main.js"

// exec("ssh-keygen -t rsa -q -f \"$HOME/.ssh/id_rsa2\" -N \"\"", (error, stdout, stderr) => {
//     if (error) {
//         console.log(`error: ${error.message}`);
//         return;
//     }
//     if (stderr) {
//         console.log(`stderr: ${stderr}`);
//         return;
//     }
//     console.log(`stdout: ${stdout}`);
// });

// Windows
// if (process.platform === 'win32') {
// 	mainWindow.setIcon(path.join(__dirname, 'assets/windows/icon.ico'));
// }

// // Linux
// if (process.platform === 'linux') {
// 	mainWindow.setIcon(path.join(__dirname, 'assets/linux/icons/512x512.png'));
// }

const USER_DATA_PATH = app.getPath("userData")
const LOG_PATH = path.join(USER_DATA_PATH, `${strings.app.title}.log`)

let bugsplat = null

configureCrashReporting()

let tray = null
global.win = null

const startersPath = path.join(
    isDev() ? "" : process.resourcesPath,
    "project-starters",
)

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

    if (isPlatformMac()) {
        app.dock.hide()
    }

    tray = new Tray(config.ICON)

    tray.on("click", () => {
        updateTrayMenu()
    })

    globalShortcut.register("CommandOrControl+Alt+R", clearConfig)

    // having this listener active will prevent the app from quitting.
    app.on("window-all-closed", () => {})

    if (conf.get("activeIndex") == -1 && !isDev()) {
        shell.openExternal(urls.tutorial)
    } else {
        // start watching last active project
        projects.setActive()
    }

    console.log(projects.joinPath())

    updateTrayTitle()
    updateTrayMenu()

    getLatestVersion().then((results) => {
        if (!results.versionIsCurrent) {
            logger.warn(strings.logMsg.updateAvailable)
            notifyUpdateAvailability(
                results.versionIsCurrent,
                results.versionCheckError,
            )
        }
    })

    logger.info(strings.logMsg.ready)
})

function updateTrayMenu() {
    let menu = null
    const activeProject = projects.getActive()

    const projectSubmenuItems = [
        {
            label: strings.menu.projects.create,
            type: "submenu",
            submenu: Menu.buildFromTemplate(
                fs
                    .readdirSync(startersPath, { withFileTypes: true })
                    .filter((dirent) => dirent.isDirectory())
                    .map((dirent) => {
                        return {
                            label: dirent.name,
                            click: async function () {
                                const title = await prompt({
                                    title: strings.popups.createProject.title,
                                    buttonLabels: {
                                        ok: strings.popups.createProject
                                            .confirm,
                                        cancel: strings.popups.createProject
                                            .cancel,
                                    },
                                    label: strings.popups.createProject.label,
                                    value: dirent.name,
                                    type: "input",
                                }).catch(console.error)

                                if (!title) {
                                    return
                                }

                                let pickedPaths = showFilePicker({
                                    properties: ["openDirectory"],
                                })

                                if (!pickedPaths) {
                                    return
                                }

                                initProjectStarter(
                                    path.join(pickedPaths[0], title),
                                    dirent.name,
                                )
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
                        { name: "bimbo project file", extensions: ["yaml"] },
                    ],
                    properties: ["openFile"],
                })

                if (!pickedPaths) {
                    return
                }

                projects.add(path.dirname(pickedPaths[0]))
                projects.setActive(projects.getAll().length - 1)
            },
        },
    ]

    const deployMeta = activeProject && activeProject.data.deployment
    const bskyMeta = activeProject && activeProject.data.integrations?.bluesky
    const bskyAutoPostEnabled = conf.get("settings.bskyAutoPost")

    menu = Menu.buildFromTemplate([
        {
            label: strings.app.titleWithVersion(CURRENT_VERSION),
            enabled: false,
        },
        {
            label: strings.menu.updateAvailable,
            visible: !versionIsCurrent,
            click: () => {
                shell.openExternal(urls.itch)
            },
        },
        { type: "separator" },
        {
            id: "title",
            label: !!activeProject
                ? activeProject.data.site.title
                : strings.projects.notLoaded,
            type: "submenu",
            submenu: Menu.buildFromTemplate([
                ...projects.getAll().map((meta, index) => {
                    return {
                        label: meta.data.site.title,
                        type: "radio",
                        checked: index == conf.get("activeIndex"),
                        click: () => {
                            projects.setActive(index)

                            // TODO dedupe
                            let displayTitle = conf.get(
                                "settings.showProjectTitleInMenubar",
                            )
                                ? projects.getActive().data.site.title
                                : ""
                            tray.setToolTip(displayTitle)
                            tray.setTitle(displayTitle)
                        },
                    }
                }),
                { type: "separator" },
                ...projectSubmenuItems,
            ]),
        },
        {
            label: strings.menu.openPreview,
            enabled: !!activeProject,
            click: function () {
                openBrowserPreview()
            },
        },
        { type: "separator" },
        {
            label: strings.menu.openEditor,
            enabled: !!activeProject,
            click: function () {
                logger.info(strings.logMsg.tryEditor(conf.get("editor")))

                exec(
                    `${conf.get("editor")} "${activeProject.rootPath}"`,
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
            enabled: !!activeProject,
            click: function () {
                shell.openPath(activeProject.rootPath)
            },
        },
        { type: "separator" },
        {
            id: "deploy",
            label: strings.menu.deploy(deployMeta?.provider),
            visible: !!deployMeta && Object.keys(presets).length > 0,
            click: () => {
                deploy()
            },
        },
        {
            label: strings.menu.configDeployment,
            type: "submenu",
            enabled: Object.keys(presets).length > 0 && !!activeProject,
            visible: !deployMeta,
            submenu: Menu.buildFromTemplate(
                Object.keys(presets).map((key) => {
                    return {
                        label: key,
                        click: (menuItem) => {
                            showHtmlPopup(
                                `popups/deployment/${menuItem.label}.html`,
                            )
                        },
                    }
                }),
            ),
        },
        {
            label: bskyAutoPostEnabled
                ? strings.menu.bskyAutoPost.enabled(bskyMeta?.handle)
                : strings.menu.bskyAutoPost.disabled,
            visible: !!bskyMeta && IS_PLUS_MODE,
            click: () => {
                conf.set(
                    "settings.bskyAutoPost",
                    !conf.get("settings.bskyAutoPost"),
                )
            },
        },
        {
            label: strings.menu.configBsky,
            enabled: IS_PLUS_MODE && !!activeProject,
            visible: !bskyMeta,
            click: () => {
                showHtmlPopup("popups/integrations/bluesky.html")
            },
        },
        {
            label: strings.menu.upgrade,
            visible: Object.keys(presets).length == 0,
            click: function () {
                shell.openExternal(urls.itch)
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
            submenu: Menu.buildFromTemplate([
                {
                    label: strings.menu.support.checkForUpdates,
                    click: () => {
                        // TODO dedupe
                        getLatestVersion().then((results) => {
                            if (!results.versionIsCurrent) {
                                logger.warn(strings.update.available)
                                notifyUpdateAvailability(
                                    results.versionIsCurrent,
                                    results.versionCheckError,
                                )
                            }
                        })
                    },
                },
                {
                    label: strings.menu.support.openDiscord,
                    click: () => shell.openExternal(urls.discord),
                },
                {
                    label: strings.menu.support.sendEmail,
                    click: () => {
                        if (bugsplat) {
                            bugsplat.post(new Error("user prompted email"))
                        }
                        shell.openExternal(urls.supportMailto)
                    },
                },
            ]),
        },
        {
            label: strings.menu.debug.title,
            visible: isDev(),
            type: "submenu",
            submenu: Menu.buildFromTemplate([
                {
                    label: strings.menu.debug.openUserData,
                    click: () => {
                        shell.openPath(USER_DATA_PATH)
                    },
                },
                {
                    label: strings.menu.debug.deleteSecrets,
                    click: () => {
                        fs.rmSync(
                            path.join(
                                projects.getActive().rootPath,
                                config.SECRETS_FILENAME,
                            ),
                        )
                    },
                },
                {
                    label: strings.menu.debug.clearConfig,
                    click: clearConfig,
                },
            ]),
        },
        {
            label: strings.menu.exit,
            click: function () {
                app.quit()
            },
        },
    ])

    tray.setContextMenu(menu)
}

function updateTrayTitle() {
    let displayTitle = strings.projects.notLoaded

    if (projects.getActive()) {
        displayTitle = projects.getActive().data.site.title
    }

    tray.setToolTip(displayTitle)
    tray.setTitle(
        conf.get("settings.showProjectTitleInMenubar") ? displayTitle : "",
    )
}

ipcMain.handle("bsky", async function (_event, data) {
    const bskyUserId = await resolveHandle(data.handle)
    // TODO util function for writing secrets
    projects.writeSecrets({
        integrations: {
            bluesky: {
                handle: data.handle, // TODO do we need this? will it break if changed?
                userId: bskyUserId,
                appPassword: data.appPassword,
            },
        },
    })
})

async function initProjectStarter(newProjPath, starterName) {
    fs.cpSync(path.join(startersPath, starterName), newProjPath, {
        recursive: true,
    })

    _.each(config.EXTRA_INIT_FILES, (data) => {
        if (data.json) {
            data.text = JSON.stringify(data.json, null, true)
        }

        if (data.filePath.includes(".vscode")) {
            fs.mkdirSync(path.join(newProjPath, ".vscode"))
        }

        fs.writeFileSync(path.join(newProjPath, data.filePath), data.text)
    })

    let configFilepath = path.join(newProjPath, config.CONFIG_FILENAME)

    let newConfig = yaml.parse(fs.readFileSync(configFilepath, "utf-8"))
    newConfig.site.title = path.basename(newProjPath)
    fs.writeFileSync(configFilepath, yaml.stringify(newConfig))

    projects.add(newProjPath)
    projects.setActive(projects.getAll().length - 1)
}

function configureCrashReporting() {
    const javaScriptErrorHandler = async (error) => {
        await bugsplat.post(error)
        app.quit()
    }

    bugsplat = conf.get("settings.submitCrashLogs")
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
    conf.clear()
    projects.setActive(-1)
    tray.setToolTip(strings.projects.notLoaded)
    tray.setTitle(strings.projects.notLoaded)
    showMessageBox(strings.app.configClear)
    logger.info(strings.logMsg.configClearSuccess)
}

function getSettingsMenu() {
    const callbacks = {
        showProjectTitleInMenubar: updateTrayTitle,
        submitCrashLogs: () => {
            if (conf.get("settings.submitCrashLogs")) {
                let clickedId = showPrompt(
                    strings.popups.disableCrashReporting.message,
                    "warning",
                    [
                        strings.popups.disableCrashReporting.confirm,
                        strings.popups.disableCrashReporting.cancel,
                    ],
                )

                if (clickedId == 0) {
                    conf.set("settings.submitCrashLogs", false)
                    configureCrashReporting()
                }
            } else {
                conf.set("settings.submitCrashLogs", true)
                configureCrashReporting()
            }
        },
    }

    const requireConfirmation = ["submitCrashLogs"]
	const hidden = ["showAssistant", "bskyAutoPost"]

    let items = _.map(conf.defaultValues.settings, (v, k) => {
		if (hidden.includes(k)) {
			return
		}

        return {
            label: strings.menu.settings[k],
            type: "checkbox",
            checked: conf.get(`settings.${k}`),
            click: () => {
                if (!requireConfirmation.includes(k)) {
                    conf.set(`settings.${k}`, !conf.get(`settings.${k}`))
                }

                if (k in callbacks) {
                    callbacks[k]()
                }
            },
        }
    })

	items = _.without(items, undefined)

    return Menu.buildFromTemplate(items)
}
