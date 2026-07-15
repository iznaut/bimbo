import { platform } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, Notification, shell, dialog } from 'electron'
import { Conf } from 'electron-conf/main'
import winston from 'winston'
import { compareVersions } from 'compare-versions'
import tiny from 'tiny-json-http'

import { IS_PLUS_MODE } from './deploy.js'
import strings from './config/strings.js'
import urls from './config/urls.js'
import config from './config/config.js'

export const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.simple(),
		}),
	],
})

export const CURRENT_VERSION = fs.readFileSync(path.join(app.getAppPath(), 'version'), 'utf-8').trim()

let latestVersion
export let versionIsCurrent = true
let versionCheckError = false

export const conf = new Conf({
	defaults: {
		projects: [],
		activeIndex: -1,
		editor: 'codium',
		settings: {
			showProjectTitleInMenubar: true,
			autoOpenPreview: false,
			submitCrashLogs: true
		},
		lastVersionLaunched: null,
	}
})

export async function getLatestVersion() {
	let results = [{
		versionIsCurrent: true,
		versionCheckError: false,
	}]

	if(isDev()) {
		latestVersion = '99.99.99-dev'
	} else {
		try {
			latestVersion = (await tiny.get({url: urls.githubVersion})).body.trim()
		} catch(e) {
			logger.warn(strings.update.logError(e))
			results.versionCheckError = false
		}
	}
	if(latestVersion) {
		versionCheckError = false
		const versionComparison = compareVersions(latestVersion, CURRENT_VERSION)
		results.versionIsCurrent = versionComparison === 0
	}

	return results
}

export function notifyUpdateAvailability(isNewVersionAvailable, versionCheckError = false) {
	showNotification(
		versionCheckError ? strings.update.checkFailed : 
		versionIsCurrent ? strings.update.none : 
		strings.update.available(latestVersion)
	)
}

export function isDev() {
	return process.argv.includes('--dev')
}

export function openBrowserPreview() {
	shell.openExternal(urls.localPreview)
}

export function isPlatformMac() {
	return platform() === "darwin"
}

export function showNotification(body) {
	new Notification({
		title: config.APP_NAME,
		body: body,
		icon: config.ICON
	}).show()
}

export function showMessageBox(message, type = 'none') {
	dialog.showMessageBoxSync({
		message: message,
		type: type,
		icon: config.ICON
	})
}

export function showPrompt(message, type = 'none', buttons = null) {
	if (!buttons) {
		buttons = [
			strings.popups.confirmDeployment.confirm,
			strings.popups.confirmDeployment.cancel
		]
	}

	return dialog.showMessageBoxSync({
		message: message,
		type: type,
		buttons: buttons,
		defaultId: 1,
		cancelId: 1,
		icon: config.ICON
	})
}

export function showFilePicker(config) {
	return dialog.showOpenDialogSync(config)
}