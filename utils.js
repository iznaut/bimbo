import { platform } from "node:os"
import * as fs from "node:fs"
import * as path from "node:path"
import winston from "winston"
import { compareVersions } from "compare-versions"
import tiny from "tiny-json-http"
import { parse as yamlParse, stringify as yamlStringify } from "yaml"
import _ from "lodash"
import {
    APP_PATH,
    USER_DATA_PATH,
    openExternalUrl,
    showNotification,
} from "./electron/main.js"

import { IS_PLUS_MODE } from "./deploy.js"
import strings from "./config/strings.js"
import urls from "./config/urls.js"
import config from "./config/config.js"
import validateSchema from "yaml-schema-validator/src/index.js"

export const logger = winston.createLogger({
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

export const CURRENT_VERSION = (function () {
    let version = fs
        .readFileSync(path.join(APP_PATH, "version"), "utf-8")
        .trim()

    if (isDev()) {
        version = version.replace("-beta", "-dev")
    }

    return version
})()

let latestVersion
export let versionIsCurrent = true
let versionCheckError = false

export async function getLatestVersion() {
    let results = [
        {
            versionIsCurrent: true,
            versionCheckError: false,
        },
    ]

    if (isDev()) {
        latestVersion = "99.99.99-dev"
    } else {
        try {
            latestVersion = (
                await tiny.get({ url: urls.githubVersion })
            ).body.trim()
        } catch (e) {
            logger.warn(strings.update.logError(e))
            results.versionCheckError = false
        }
    }
    if (latestVersion) {
        versionCheckError = false
        const versionComparison = compareVersions(
            latestVersion,
            CURRENT_VERSION,
        )
        results.versionIsCurrent = versionComparison === 0
    }

    return results
}

export function notifyUpdateAvailability(
    isNewVersionAvailable,
    versionCheckError = false,
) {
    showNotification(
        versionCheckError
            ? strings.update.checkFailed
            : versionIsCurrent
              ? strings.update.none
              : strings.update.available(latestVersion),
    )
}

// TODO can use
export function isDev() {
    return process.argv.includes("--dev")
}

export function isPlatformMac() {
    return platform() === "darwin"
}

export function readConfigFile(filepath) {
    return fs.existsSync(filepath) ? parseYamlFile(filepath) : {}
}

export function updateConfigFile(filepath, newData = {}) {
    console.log(newData)
    let configData = fs.existsSync(filepath) ? parseYamlFile(filepath) : {}

    fs.writeFileSync(filepath, yamlStringify(_.merge(configData, newData)))

    const UPDATED_KEYS = Object.keys(newData)
    logger.info(strings.logMsg.userConfigSaved(filepath, UPDATED_KEYS))
    return UPDATED_KEYS
}

export function parseYamlFile(filepath) {
    return yamlParse(fs.readFileSync(filepath, "utf-8"))
}
