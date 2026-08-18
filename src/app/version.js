import { app } from "electron"
import tiny from "tiny-json-http"
import { compareVersions } from "compare-versions"
import { showNotification } from "./electron.js"
import config from "../config/index.js"
import strings from "../config/strings.js"

import pkg from "../../package.json" with { type: "json" }

// TODO clean up version/update stuff

let latestVersion
let _versionIsCurrent = true
let versionCheckError = false

export const versionIsCurrent = () => _versionIsCurrent

export const CURRENT_VERSION = (() => {
    let version = pkg.version

    if (config.DEV_MODE) {
        version = version.replace("-beta", "-dev")
    }

    return version
})()

export async function getLatestVersion() {
    if (config.DEV_MODE) {
        latestVersion = "99.99.99-dev"
    } else {
        try {
            const packageJson = await tiny.get({ url: urls.githubPackage })
            latestVersion = JSON.parse(packageJson.body).version
        } catch (e) {
            logger.warn(strings.update.logError(e))
            versionCheckError = false
        }
    }
    if (latestVersion) {
        versionCheckError = false
        const versionComparison = compareVersions(
            latestVersion,
            CURRENT_VERSION,
        )
        _versionIsCurrent = versionComparison === 0
    }
    return latestVersion
}

export async function checkVersion(onUpdateAvailable) {
    await getLatestVersion()
    if (!_versionIsCurrent) {
        logger.warn(strings.update.available(latestVersion))
        notifyUpdateAvailability()
        if (onUpdateAvailable) {
            onUpdateAvailable()
        }
    }
}

function notifyUpdateAvailability() {
    showNotification(
        versionCheckError
            ? strings.update.checkFailed
            : _versionIsCurrent
              ? strings.update.none
              : strings.update.available(latestVersion),
    )
}
