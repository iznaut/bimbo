import { Conf } from 'electron-conf/main'

export const conf = new Conf({
	defaults: {
		projects: [],
		activeIndex: -1,
		editor: 'codium'
	}
})

export function log(msg) { // TODO replace all console.log with this and save to file
    console.log(`bimbo: ${msg}`)
    if (global.win) {

        global.win.webContents.send('bimbo-log', `💖BIMBO💖 logger: ${msg}`);
    }
}

export function isDev() {
	return process.argv.includes('--dev')
}