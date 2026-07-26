import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import * as yaml from "yaml"

import { logger } from "./utils.js"
import {
    conf,
    showMessageBox,
    showNotification,
    showPrompt,
} from "./utils/electron.js"
import config from "./config/config.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"
import { PROJECT_CONFIG_OPTIONS } from "./front-matter.js"

class Project {
    paths

    constructor(rootPath) {
        console.log(rootPath)
        this.paths = _.mapValues(config.PROJECT_PATHS, (relativePath) =>
            // console.log(relativePath)
            path.join(rootPath, relativePath),
        )

        console.log(this.paths)
    }

    getMeta() {
        return yaml.parse(fs.readFileSync(this.paths.CONFIG_FILE, "utf-8"))
    }

    getSecrets() {
        return fs.existsSync(this.paths.SECRETS_FILE)
            ? yaml.parse(fs.readFileSync(SECRETS_FILEPATH, "utf-8"))
            : {}
    }

    get globals_meta() {
        return this.getMeta()[PROJECT_CONFIG_OPTIONS.GLOBALS.name]
    }
    get defaults_meta() {
        return this.getMeta()[PROJECT_CONFIG_OPTIONS.DEFAULTS.name]
    }
    get validators_meta() {
        return this.getMeta()[PROJECT_CONFIG_OPTIONS.VALIDATORS.name]
    }
    get collections_meta() {
        return this.getMeta()[PROJECT_CONFIG_OPTIONS.COLLECTIONS.name]
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
        }
    },
    get list() {
        return conf.get("projects")
    },
    set list(value) {
        conf.set("projects", value)
    },
    init() {
        if (this.activeIndex > -1) {
            this.active = new Project(this.list[this.activeIndex])
        }
    },
    cleanup() {
        // remove invalid paths
        const SAVED_PROJECT_PATHS = this.list.filter((rootPath) => {
            const fileExists = fs.existsSync(
                path.join(rootPath, config.PROJECT_PATHS.SECRETS_FILE),
            )

            if (!fileExists) {
                logger.warn(strings.logMsg.missingProject(rootPath))
                showMessageBox(strings.projects.missing(rootPath))
            }

            return fileExists
        })

        // save updated list
        this.list = SAVED_PROJECT_PATHS

        // if no valid projects
        if (SAVED_PROJECT_PATHS.length == 0) {
            this.activeIndex = -1
        } else {
            this.activeIndex = SAVED_PROJECT_PATHS.length - 1
        }

        return SAVED_PROJECT_PATHS.map((rootPath) => new Project(rootPath))
    },
    getFromPath(rootPath) {
        return new Project(rootPath)
    },
    load(rootPath) {
        this.active = new Project(rootPath)

        watch(true)

        showNotification(
            index == -1
                ? strings.projects.notLoaded
                : strings.projects.loaded(this.active.data.site.title),
        )
    },
    loadByIndex(index) {
        conf.set("activeIndex", index)
    },
    // setActive(index = null) {
    //     // loadByIndex
    //     if (index == null) {
    //         index = conf.get("activeIndex")
    //     } else {
    //         conf.set("activeIndex", index)
    //     }

    //     watch(true)

    //     showNotification(
    //         index == -1
    //             ? strings.projects.notLoaded
    //             : strings.projects.loaded(this.active.data.site.title),
    //     )
    // },
    add(newRootPath) {
        let projectsList = this.list

        if (projectsList.includes(newRootPath)) {
            showNotification(strings.projects.alreadyImported)
            return
        }

        projectsList.push(newRootPath)
        this.list = projectsList
    },
    writeSecrets(data) {
        // get secrets filepath
        const secretsPath = this.active.paths.SECRETS_FILE

        // if file doesn't exist, create an empty one
        // if (!fs.existsSync(secretsPath)) {
        //     fs.writeFileSync(secretsPath, yaml.stringify({}))
        // }

        fs.writeFileSync(
            secretsPath,
            yaml.stringify(_.merge(this.active.getSecrets(), data)),
        )

        logger.info(strings.logMsg.secretsSaved(secretsPath, Object.keys(data)))
    },
}

export default exports
