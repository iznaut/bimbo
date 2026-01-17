import { Conf } from 'electron-conf/main'
import winston from 'winston'

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
		editor: 'codium'
	}
})

// export function log(msg) { // TODO replace all console.log with this and save to file
//     console.log(`bimbo: ${msg}`)
//     if (global.win) {

//         global.win.webContents.send('bimbo-log', `💖BIMBO💖 logger: ${msg}`);
//     }
// }

export function isDev() {
	return process.argv.includes('--dev')
}