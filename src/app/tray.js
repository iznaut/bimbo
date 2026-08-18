import * as fs from "node:fs"
import * as path from "node:path"
import { platform } from "node:os"
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
import { clearConfig, configureCrashReporting } from "./index.js"

let tray // instantiated in initializeTray() when app is ready
const trayMenu = buildTrayMenu() // build once, then only update

let tooltip = "" // saved here because there is no tray.getToolTip()

export function initializeTray() {
    tray = new Tray(nativeImage.createFromDataURL(config.ICON))
    tray.setContextMenu(trayMenu)
    tray.on("click", (event) => {
        trayMenu.getMenuItemById("debugMenu").visible =
            event.shiftKey || config.DEV_MODE
        // allow opening context menu with left click on windows
        if (platform() === "win32") {
            tray.popUpContextMenu()
        }
    })
    tray.setIgnoreDoubleClickEvents(true)

    updateTrayTitle(projects.getActiveTitle())
}

function buildTrayMenu() {
    const menu = Menu.buildFromTemplate([
        {
            label: strings.app.titleWithVersion(CURRENT_VERSION),
            enabled: false,
        },
        {
            id: "updateAvailable",
            label: strings.menu.updateAvailable,
            visible: false,
            click: () => openExternalUrl(urls.itch),
        },
        { type: "separator" },
        {
            id: "projectMenu",
            label: projects.getActiveTitle(),
            type: "submenu",
            submenu: getProjectsSubmenu(),
        },
        {
            id: "openPreview",
            label: strings.menu.openPreview,
            click: () => openExternalUrl(urls.localPreview),
        },
        { type: "separator" },
        {
            id: "openEditor",
            label: strings.menu.openEditor,
            click: () => {
                logger.info(strings.logMsg.tryEditor(config.EDITOR_COMMAND))
                // TODO find alternative to exec
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
            id: "openFolder",
            label: strings.menu.openFolder,
            click: () => shell.openPath(loadedProjectRoot),
        },
        { type: "separator" },
        ...getPlusModeItems(),
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
                    click: () => checkVersion(showUpdateNoticeInTray),
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
            id: "debugMenu",
            label: strings.menu.debug.title,
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
    return menu
}

function getPlusModeItems() {
    if (!IS_PLUS_MODE) {
        return [
            {
                label: strings.menu.upgrade,
                click: () => openExternalUrl(urls.itch),
            },
        ]
    }
    return [
        {
            id: "deploy",
            label: "", // will be updated on activeProjectChanged
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
            id: "configDeployment",
            label: strings.menu.configDeployment,
            type: "submenu",
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
            id: "bskyAutoPost",
            label: "",
            click: () =>
                APP_SETTINGS.set(
                    "settings.bskyAutoPost",
                    !APP_SETTINGS.get("settings.bskyAutoPost"),
                ),
        },
        {
            id: "configBsky",
            label: strings.menu.configBsky,
            click: () => showHtmlForm("bluesky"),
        },
    ]
}

function getSettingsMenu() {
    const createSettingsItem = (setting, options = {}, afterClick) => {
        return {
            id: setting,
            label: strings.menu.settings[setting],
            type: "checkbox",
            checked: APP_SETTINGS.get(`settings.${setting}`),
            click: () => {
                const enabled = APP_SETTINGS.get(`settings.${setting}`)
                APP_SETTINGS.set(`settings.${setting}`, !enabled)
                if (afterClick) {
                    afterClick()
                }
            },
            ...options,
        }
    }
    return [
        createSettingsItem(
            "showProjectTitleInMenubar",
            {
                visible: platform() === "darwin", // only relevant on mac
            },
            updateTrayTitle,
        ),
        createSettingsItem("autoOpenPreview"),
        createSettingsItem("submitCrashLogs", {
            click: () => {
                const enabled = APP_SETTINGS.get("settings.submitCrashLogs")
                if (enabled) {
                    const clickedId = showPrompt(
                        strings.popups.disableCrashReporting.message,
                        "warning",
                        [
                            strings.popups.disableCrashReporting.confirm,
                            strings.popups.disableCrashReporting.cancel,
                        ],
                    )
                    if (clickedId !== 0) {
                        // re-check menu item because electron unchecks it
                        trayMenu.getMenuItemById("submitCrashLogs").checked =
                            true
                        return
                    }
                }
                APP_SETTINGS.set("settings.submitCrashLogs", !enabled)
                configureCrashReporting()
            },
        }),
        createSettingsItem("bskyAutoPost", {
            visible: false, // TODO change when ready
        }),
    ]
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
            click: () => {
                projects.activeIndex = index
                updateTrayTitle(projectTitle)
            },
        }
    }

    return [
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
}

export function updateTrayTitle(text = tooltip) {
    tooltip = text
    tray.setToolTip(tooltip)

    const trayTitle = APP_SETTINGS.get("settings.showProjectTitleInMenubar")
        ? tooltip
        : ""
    tray.setTitle(trayTitle) // only visible on mac
}

projects.events.on("activeProjectChanged", () => {
    if (!tray) {
        return
    }
    const projectIsLoaded = !!activeProject
    trayMenu.getMenuItemById("projectMenu").label = projects.getActiveTitle()
    trayMenu.getMenuItemById("projectMenu").submenu.items[
        projects.activeIndex
    ].checked = true
    trayMenu.getMenuItemById("openPreview").enabled = projectIsLoaded
    trayMenu.getMenuItemById("openEditor").enabled = projectIsLoaded
    trayMenu.getMenuItemById("openFolder").enabled = projectIsLoaded

    if (IS_PLUS_MODE) {
        const deployMeta = activeProject?.secrets?.deployment
        trayMenu.getMenuItemById("deploy").visible = !!deployMeta
        if (deployMeta) {
            trayMenu.getMenuItemById("deploy").label = strings.menu.deploy(
                deployMeta.provider,
            )
        }
        trayMenu.getMenuItemById("configDeployment").enabled = projectIsLoaded
        trayMenu.getMenuItemById("configDeployment").visible = !deployMeta

        const bskyMeta = activeProject?.secrets?.integrations?.bluesky
        const bskyAutoPostEnabled = APP_SETTINGS.get("settings.bskyAutoPost")
        trayMenu.getMenuItemById("bskyAutoPost").label = bskyAutoPostEnabled
            ? strings.menu.bskyAutoPost.enabled(bskyMeta?.handle)
            : strings.menu.bskyAutoPost.disabled
        trayMenu.getMenuItemById("bskyAutoPost").visible = !!bskyMeta
        trayMenu.getMenuItemById("configBsky").enabled = projectIsLoaded
        trayMenu.getMenuItemById("configBsky").visible = !bskyMeta
    }
})

export function showUpdateNoticeInTray() {
    trayMenu.getMenuItemById("updateAvailable").visible = true
}
