import strings from "./config/strings.js"
import { showMessageBox } from "./utils.js"

export const IS_PLUS_MODE = false

export const presets = {}

export async function deploy() {
    showMessageBox(strings.popups.upgrade, "warning")
}
