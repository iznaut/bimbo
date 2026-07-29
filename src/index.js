import * as fs from "node:fs"
import * as path from "node:path"
import _ from "lodash"
import winston from "winston"
import { readConfigFile, updateConfigFile } from "./utils.js"

import config from "./config/index.js"
import { watch } from "./site-generator.js"
import strings from "./config/strings.js"
import { PROJECT_CONFIG_OPTIONS } from "./front-matter.js"

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

export class Project {
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

export let activeProject = null

// TODO could accept path instead?
export const setActiveProject = function (project) {
    activeProject = project
}
