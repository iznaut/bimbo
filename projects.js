import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"

import { logger, readConfigFile, updateConfigFile } from "./utils.js"
import {
    conf,
    showMessageBox,
    showNotification,
    showPrompt,
} from "./electron/main.js"
import config from "./config/config.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"
import { PROJECT_CONFIG_OPTIONS } from "./front-matter.js"

class Project {
    paths

    constructor(rootPath) {
        this.paths = _.mapValues(config.PROJECT_PATHS, (relativePath) =>
            path.join(rootPath, relativePath),
        )
    }

    get config() {
        return readConfigFile(this.paths.CONFIG_FILE)
    }
    updateConfig(data) {
        updateConfigFile(this.paths.CONFIG_FILE, data)
    }

    get secrets() {
        return readConfigFile(this.paths.SECRETS_FILE)
    }
    updateSecrets(data) {
        updateConfigFile(this.paths.SECRETS_FILE, data)
    }

    get globals_meta() {
        return this.config[PROJECT_CONFIG_OPTIONS.GLOBALS.name]
    }
    get defaults_meta() {
        return this.config[PROJECT_CONFIG_OPTIONS.DEFAULTS.name]
    }
    get validators_meta() {
        return this.config[PROJECT_CONFIG_OPTIONS.VALIDATORS.name]
    }
    get collections_meta() {
        return this.config[PROJECT_CONFIG_OPTIONS.COLLECTIONS.name]
    }

    get title() {
        return this.globals_meta.title || "untitled project"
    }
}

const exports = {
    active: null,
    get activeIndex() {
        return conf.get("activeIndex")
    },
    set activeIndex(value) {
        conf.set("activeIndex", value)

        if (this.activeIndex > -1) {
            this.active = new Project(this.list[this.activeIndex])
            watch(true)
        } else {
            this.active = null
        }
    },
    get list() {
        return conf.get("projects")
    },
    set list(value) {
        conf.set("projects", value)
    },
    cleanup() {
        // remove invalid paths
        const SAVED_PROJECT_PATHS = this.list.filter((rootPath) => {
            const FILE_EXISTS = fs.existsSync(
                path.join(rootPath, config.PROJECT_PATHS.CONFIG_FILE),
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
    add(newRootPath) {
        let projectsList = this.list

        if (projectsList.includes(newRootPath)) {
            showNotification(strings.projects.alreadyImported)
            return
        }

        projectsList.push(newRootPath)
        this.list = projectsList
    },
}

export default exports
