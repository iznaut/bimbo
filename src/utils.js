import { platform } from "node:os"
import * as fs from "node:fs"
import * as path from "node:path"

import tiny from "tiny-json-http"
import { parse as yamlParse, stringify as yamlStringify } from "yaml"
import _ from "lodash"


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
    let configData = fs.existsSync(filepath) ? parseYamlFile(filepath) : {}

    fs.writeFileSync(filepath, yamlStringify(_.merge(configData, newData)))

    const UPDATED_KEYS = Object.keys(newData)
    logger.info(strings.logMsg.userConfigSaved(filepath, UPDATED_KEYS))
    return UPDATED_KEYS
}

export function parseYamlFile(filepath) {
    return yamlParse(fs.readFileSync(filepath, "utf-8"))
}
