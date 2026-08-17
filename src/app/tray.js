import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import { clipboard, dialog, Menu, nativeImage, Tray, shell } from "electron"
import strings from "../config/strings.js"
import config from "../config/index.js"
import projects from "./projects.js"
import { presets, IS_PLUS_MODE } from "../deploy.js"
import { activeProject, getProjectStarters } from "../index.js"
import {
    APP_PATH,
    APP_SETTINGS,
    handlePickDirectory,
    openExternalUrl,
    showPrompt,
    USER_DATA_PATH,
} from "./electron.js"
import { checkVersion, CURRENT_VERSION, versionIsCurrent } from "./version.js"
import { clearConfig } from "./index.js"

let tray = null
let trayMenu = null

export function initializeTray() {
    tray = new Tray(nativeImage.createFromDataURL(config.ICON))
    tray.on("click", (event) => {
        // TODO rework tray updates so that we don't to do this on click, because it doesn't work on windows right-click
        updateTrayMenu(event.shiftKey || config.DEV_MODE)
        // allow opening context menu with left click on windows
        if (platform() === "win32") {
            tray.popUpContextMenu()
        }
    })
    tray.setIgnoreDoubleClickEvents(true)

    updateTrayTitle()
    updateTrayMenu()
}

function updateTrayMenu(isDebugMode = config.DEV_MODE) {
    const isProjectLoaded = !!activeProject
    const loadedProjectMeta = isProjectLoaded ? activeProject.config : {}
    const loadedProjectRoot = isProjectLoaded ? activeProject.paths.ROOT : ""

    const DEPLOY_META = isProjectLoaded && activeProject.secrets?.deployment
    const BSKY_META =
        isProjectLoaded && activeProject.secrets?.integrations?.bluesky
    const bskyAutoPostEnabled = APP_SETTINGS.get("settings.bskyAutoPost")

    trayMenu = Menu.buildFromTemplate([
        {
            label: strings.app.titleWithVersion(CURRENT_VERSION),
            enabled: false,
        },
        {
            label: strings.menu.updateAvailable,
            visible: !versionIsCurrent(),
            click: () => openExternalUrl(urls.itch),
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
            click: () => openExternalUrl(urls.localPreview),
        },
        { type: "separator" },
        {
            label: strings.menu.openEditor,
            enabled: isProjectLoaded,
            click: () => {
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
            click: () => shell.openPath(loadedProjectRoot),
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
                    // TODO prompt for password if necessary
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
            submenu: Menu.buildFromTemplate(
                Object.keys(presets).map((key) => {
                    return {
                        label: key,
                        click: () => renderFormInWindow(key),
                    }
                }),
            ),
        },
        {
            label: bskyAutoPostEnabled
                ? strings.menu.bskyAutoPost.enabled(BSKY_META?.handle)
                : strings.menu.bskyAutoPost.disabled,
            visible: !!BSKY_META && IS_PLUS_MODE,
            click: () =>
                APP_SETTINGS.set(
                    "settings.bskyAutoPost",
                    !APP_SETTINGS.get("settings.bskyAutoPost"),
                ),
        },
        {
            label: strings.menu.configBsky,
            enabled: IS_PLUS_MODE && isProjectLoaded,
            visible: !BSKY_META,
            click: () => showHtmlForm("bluesky"),
        },
        {
            label: strings.menu.upgrade,
            visible: Object.keys(presets).length == 0,
            click: () => openExternalUrl(urls.itch),
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
                    click: () => checkVersion(),
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
            submenu: Menu.buildFromTemplate([
                {
                    label: strings.menu.debug.copyLog,
                    click: () => {
                        const LOG_CONTENTS = fs.readFileSync(LOG_PATH, "utf-8")
                        clipboard.writeText(LOG_CONTENTS)
                    },
                },
                {
                    label: strings.menu.debug.openUserData,
                    click: () => shell.openPath(USER_DATA_PATH),
                },
                {
                    label: strings.menu.debug.deleteSecrets,
                    click: () => {
                        const CLICKED_ID = showPrompt(
                            strings.popups.confirmDeleteSecrets.message,
                            "warning",
                            [
                                strings.popups.confirmDeleteSecrets.confirm,
                                strings.popups.confirmDeleteSecrets.cancel,
                            ],
                        )
                        if (CLICKED_ID == 0) {
                            fs.rmSync(activeProject.paths.SECRETS_FILE)
                        }
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
            role: "quit",
        },
    ])

    tray.setContextMenu(trayMenu)
}

export function updateTrayTitle() {
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

    return Menu.buildFromTemplate(items)
}

function getProjectsSubmenu() {
    const projectMenuItem = (projectPath, index) => {
        const project = projects.getFromPath(projectPath)
        const relativePath = path.relative(APP_PATH, project.paths.ROOT)
        const isStarter =
            !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
        const projectTitle = `${isStarter ? "📝 " : ""}${project.title}`

        return {
            label: projectTitle,
            type: "radio",
            checked: index == projects.activeIndex,
            click: () => {
                projects.activeIndex = index

                // TODO dedupe
                let displayTitle = APP_SETTINGS.get(
                    "settings.showProjectTitleInMenubar",
                )
                    ? projectTitle
                    : ""
                tray.setToolTip(displayTitle)
                tray.setTitle(displayTitle)
            },
        }
    }

    let menuTemplate = [
        ...projects.list.map(projectMenuItem),
        { type: "separator" },
        {
            label: strings.menu.projects.create,
            click: async function () {
                const browserWindow = await openPageInWindow("new-project")
                // Send list of starters to form
                browserWindow.webContents.send(
                    "starters-list",
                    Object.keys(getProjectStarters()),
                )
                ipcMain.handle("pick-directory", () =>
                    handlePickDirectory(browserWindow),
                )
                browserWindow.on("closed", () =>
                    ipcMain.removeHandler("pick-directory"),
                )
            },
        },
        {
            label: strings.menu.projects.import,
            click: () => {
                let pickedPaths = dialog.showOpenDialogSync({
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

    return Menu.buildFromTemplate(menuTemplate)
}

export function clearTrayProject() {
    tray.setToolTip(strings.projects.notLoaded)
    tray.setTitle(strings.projects.notLoaded)
}
