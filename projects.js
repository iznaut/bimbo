import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import * as yaml from "yaml"

import { conf, logger, showNotification } from "./utils.js"
import config from "./config/config.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"

const PATHS = {
    CONTENT: "content",
    POSTS: "content/posts",
    SNIPPETS: "content/snippets",
    DATA: "data",
    TEMPLATES: "templates",
    PARTIALS: "templates/partials",
    STATIC: "static",
    OUTPUT: "_site",
}

const exports = {
    getAll(pathsOnly = false) {
        // remove invalid paths
        const projectPaths = conf.get("projects").filter((rootPath) => {
            return this.exists(rootPath)
        })

        let projects = projectPaths.map((projRootPath) => {
            const secretsPath = path.join(projRootPath, config.SECRETS_FILENAME)

            const projSecrets = fs.existsSync(secretsPath)
                ? yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
                : {}
            let projData = yaml.parse(
                fs.readFileSync(
                    path.join(projRootPath, config.CONFIG_FILENAME),
                    "utf-8",
                ),
            )

            return {
                rootPath: projRootPath,
                data: _.merge(projData, projSecrets),
            }
        })

        conf.set("projects", projectPaths)

        // if no valid projects
        if (projects.length == 0) {
            conf.set("activeIndex", -1)
        }

        return pathsOnly ? projects.map((proj) => proj.rootPath) : projects
    },
    getActive() {
        if (conf.get("activeIndex") == -1) {
            return null
        }

        return this.getAll()[conf.get("activeIndex")]
    },
    setActive(index = null) {
        if (index == null) {
            index = conf.get("activeIndex")
        } else {
            conf.set("activeIndex", index)
        }

        watch(true)

        showNotification(
            index == -1
                ? strings.projects.notLoaded
                : strings.projects.loaded(this.getActive().data.site.title),
        )
    },
    add(newProjRootPath) {
        let current = this.getAll(true)

        if (current.includes(newProjRootPath)) {
            showNotification(strings.projects.alreadyImported)
            return
        }

        current.push(newProjRootPath)
        conf.set("projects", current)
    },
    exists(projRootPath) {
        const fileExists = fs.existsSync(
            path.join(projRootPath, config.CONFIG_FILENAME),
        )

        if (!fileExists) {
            logger.warn(strings.logMsg.missingProject)
            showNotification(strings.projects.loadFailed)
        }

        return fileExists
    },
    joinPath(...paths) {
        return path.normalize(path.join(this.getActive().rootPath, ...paths))
    },
    writeSecrets(data) {
        // get secrets filepath
        const secretsPath = this.joinPath(config.SECRETS_FILENAME)

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
    paths() {
        return _.mapValues(PATHS, (pathPart) =>
            path.join(this.getActive().rootPath, pathPart),
        )
    },
}

export default exports
