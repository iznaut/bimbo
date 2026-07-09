import { platform } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { app, Notification, shell, nativeImage } from 'electron'
import { Conf } from 'electron-conf/main'
import winston from 'winston'
import { compareVersions } from 'compare-versions'
import tiny from 'tiny-json-http'

import { IS_PLUS_MODE } from './deploy.js'
import strings from './config/strings.js'
import urls from './config/urls.js'

export const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.simple(),
		}),
	],
})

export const ICON = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==')
export const CURRENT_VERSION = fs.readFileSync(path.join(app.getAppPath(), 'version'), 'utf-8').trim()

let latestVersion
export let versionIsCurrent = true
let versionCheckError = false

logger.info(strings.app.titleWithVersion(CURRENT_VERSION))

export const conf = new Conf({
	defaults: {
		projects: [],
		activeIndex: -1,
		editor: 'codium',
		settings: {
			showProjectTitleInMenubar: true,
			autoOpenPreview: false,
			submitCrashLogs: true
		}
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
	const message = 
		versionCheckError ? strings.update.checkFailed : 
		versionIsCurrent ? strings.update.none : 
		strings.update.available(latestVersion)
	new Notification({ title: strings.app.title, body: message }).show()
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