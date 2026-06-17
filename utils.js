import { Notification, shell } from 'electron'
import { Conf } from 'electron-conf/main'
import winston from 'winston'

const localUrl = 'http://localhost:6969'

export const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [
		new winston.transports.Console({
			format: winston.format.simple(),
		}),
	],
})

export const conf = new Conf({
	defaults: {
		projects: [],
		activeIndex: -1,
		editor: 'codium',
		options: {
			showProjectTitleInMenubar: true,
			autoOpenPreview: false,
		}
	}
})

export function isDev() {
	return process.argv.includes('--dev')
}

export function openBrowserPreview() {
	shell.openExternal(localUrl)
}