import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import winston from "winston"
import { parse as yamlParse, stringify as yamlStringify } from "yaml"

import config from "./config/index.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"
import { PROJECT_CONFIG_OPTIONS } from "./front-matter.js"

import { fileURLToPath } from "url"

global.logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.simple(),
                winston.format.colorize({ all: true }),
            ),
        }),
    ],
})

export let activeProject = null

// TODO could accept path instead?
export const setActiveProject = function (project) {
    activeProject = project
}

export const createNewProject = function (destinationPath, starterPath) {
    fs.cpSync(starterPath, destinationPath, {
        recursive: true,
    })

    _.each(config.EXTRA_INIT_FILES, (data) => {
        const SUBPATH = path.dirname(data.filePath)

        if (data.json) {
            data.text = JSON.stringify(data.json, null, true)
        }

        if (SUBPATH) {
            fs.mkdirSync(path.join(destinationPath, SUBPATH), {
                recursive: true,
            })
        }

        fs.writeFileSync(path.join(destinationPath, data.filePath), data.text)
    })

    console.log(destinationPath)

    const NEW_PROJECT = new Project(destinationPath)

    NEW_PROJECT.updateConfig({
        globals: {
            title: path.basename(destinationPath),
        },
    })
}

export class Project {
    paths

    constructor(rootPath) {
        this.paths = _.mapValues(config.PROJECT_PATHS, (relativePath) =>
            path.join(rootPath, relativePath),
        )

        if (!fs.existsSync(this.paths.CONFIG_FILE)) {
            return Error(`${this.paths.CONFIG_FILE} does not exist`)
        }
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

function readConfigFile(filepath) {
    return fs.existsSync(filepath) ? parseYamlFile(filepath) : {}
}

export function updateConfigFile(filepath, newData = {}) {
    let configData = fs.existsSync(filepath) ? parseYamlFile(filepath) : {}

    fs.writeFileSync(filepath, yamlStringify(_.merge(configData, newData)))

    const UPDATED_KEYS = Object.keys(newData)
    logger.info(strings.logMsg.userConfigSaved(filepath, UPDATED_KEYS))
    return UPDATED_KEYS
}

export function parseYamlFile(filepath) {
    return yamlParse(fs.readFileSync(filepath, "utf-8"))
}
