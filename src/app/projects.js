import { existsSync } from "fs"
import { join as pathJoin } from "node:path"

import config from "../config/index.js"
import { Project } from "../index.js"
import { watch } from "../site-generator.js"
import { APP_SETTINGS, showMessageBox, showNotification } from "./electron.js"
import strings from "../config/strings.js"
import { setActiveProject } from "../index.js"

const exports = {
    get activeIndex() {
        return APP_SETTINGS.get("activeIndex")
    },
    set activeIndex(value) {
        APP_SETTINGS.set("activeIndex", value)

        if (this.activeIndex > -1) {
            setActiveProject(new Project(this.list[this.activeIndex]))
            watch(true)
        } else {
            setActiveProject(null)
        }
    },
    get list() {
        return APP_SETTINGS.get("projects")
    },
    set list(value) {
        APP_SETTINGS.set("projects", value)
    },
    cleanup() {
        // remove invalid paths
        const SAVED_PROJECT_PATHS = this.list.filter((rootPath) => {
            const FILE_EXISTS = existsSync(
                pathJoin(rootPath, config.PROJECT_PATHS.CONFIG_FILE),
            )

            if (!FILE_EXISTS) {
                logger.warn(strings.logMsg.missingProject(rootPath))
                showMessageBox(strings.projects.missing(rootPath))
            }

            return FILE_EXISTS
        })

        // save updated list
        this.list = SAVED_PROJECT_PATHS

        // if no valid projects
        if (SAVED_PROJECT_PATHS.length == 0) {
            this.activeIndex = -1
        } else {
            this.activeIndex = SAVED_PROJECT_PATHS.length - 1
        }
    },
    getFromPath(rootPath) {
        return new Project(rootPath)
    },
    add(newPath) {
        let projectsList = this.list

        if (projectsList.includes(newPath)) {
            showNotification(strings.projects.alreadyImported)
            return
        }

        projectsList.push(newPath)
        this.list = projectsList

        console.log(this.list)

        return this.list.length - 1
    },
}

export default exports
