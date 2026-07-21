import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import * as yaml from "yaml"

import { conf, logger, showNotification, showPrompt } from "./utils.js"
import config from "./config/config.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"

const PATHS = {
    ROOT: ".",
    CONFIG_FILE: config.CONFIG_FILENAME,
    SECRETS_FILE: config.SECRETS_FILENAME,
    CONTENT: "content",
    POSTS: "content/posts",
    SNIPPETS: "content/snippets",
    DATA: "data",
    TEMPLATES: "templates",
    PARTIALS: "templates/partials",
    STATIC: "static",
    OUTPUT: "_site",
}

class Project {
    paths

    constructor(rootPath) {
        this.paths = _.mapValues(PATHS, (relativePath) =>
            path.join(rootPath, relativePath),
        )
    }

    getData() {
        const META_FILEPATH = this.paths.CONFIG_FILE
        const SECRETS_FILEPATH = this.paths.SECRETS_FILE

        const META_DATA = yaml.parse(fs.readFileSync(META_FILEPATH, "utf-8"))
        const SECRETS_DATA = fs.existsSync(SECRETS_FILEPATH)
            ? yaml.parse(fs.readFileSync(SECRETS_FILEPATH, "utf-8"))
            : {}

        // TODO secrets should be separated
        return _.merge(META_DATA, SECRETS_DATA)
    }
}

const exports = {
    active: null,
    get activeIndex() {
        return conf.get("activeIndex")
    },
    set activeIndex(value) {
        conf.set("activeIndex", value)

        this.active = new Project(this.list[this.activeIndex])
        watch(true)
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
                path.join(rootPath, config.CONFIG_FILENAME),
            )

            if (!fileExists) {
                logger.warn(strings.logMsg.missingProject)
                showPrompt(strings.projects.missing)
            }

            return fileExists
        })

        // save updated list
        this.list = SAVED_PROJECT_PATHS

        // if no valid projects
        if (SAVED_PROJECT_PATHS.length == 0) {
            conf.set("activeIndex", -1)
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
        if (!fs.existsSync(secretsPath)) {
            fs.writeFileSync(secretsPath, yaml.stringify({}))
        }

        // read existing secrets and merge with new ones
        const secretsData = yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
        const mergedData = _.merge(secretsData, data)

        // write back to file
        fs.writeFileSync(secretsPath, yaml.stringify(mergedData))

        logger.info(strings.logMsg.secretsSaved(secretsPath, Object.keys(data)))
    },
}

export default exports
