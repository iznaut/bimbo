import { platform } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { exec } from 'node:child_process'
import _ from 'lodash'
import { fileURLToPath } from 'url'
import prompt from 'electron-prompt'
import * as yaml from 'yaml'
import winston from 'winston'

import { conf, isDev, logger } from './utils.js'
import config from './config.js'
import projects from './projects.js'
import { deploy } from './deploy.js'

import {
	app,
	dialog,
	Menu,
	shell,
	globalShortcut,
	Tray,
	nativeImage,
} from 'electron'

const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==')

let tray = null
global.win = null

const startersPath = path.join((isDev() ? '' : process.resourcesPath), 'project-starters')

const localUrl = 'http://localhost:6969'

let showDebugMenu = false

app.whenReady().then(() => {
	function getAppRoot() {
		if (isDev()) {
			return './'
		}

		if ( process.platform === 'win32' ) {
			return path.join( app.getAppPath(), '/../../../' );
		}  else {
			return path.join( app.getAppPath(), '/../../../../' );
		}
	}

	logger.add(new winston.transports.File({
		filename: path.join(getAppRoot(), 'bimbo.log'),
		handleRejections: true,
		humanReadableUnhandledException: true
	}))

	logger.info('app ready!')

	if (platform() === "darwin") {
		logger.info('macos platform, hiding dock icon')
		app.dock.hide()
	}

	tray = new Tray(icon)
	updateTrayMenu()

	tray.setToolTip('bimbo beta')
	tray.setTitle('bimbo beta')

	globalShortcut.register('CommandOrControl+Alt+R', () => {
		logger.info('attempting config clear')
		conf.clear()
		projects.setActive(-1)
		updateTrayMenu()
		dialog.showMessageBox({ message: 'bimbo config has been reset to defaults' })
		logger.info('config cleared')
	})

	// having this listener active will prevent the app from quitting.
	app.on('window-all-closed', () => {})

	// start watching last active project
	projects.setActive()

	if (conf.get('activeIndex') == -1) {
		shell.openExternal('https://bimbo.nekoweb.org/posts/2-getting-started.html')
	}
})

function updateTrayMenu() {
	let menu = null
	const activeProject = projects.getActive()

	const projectMenuItems = [
		{
			label: `🆕 create new project`,
			type: 'submenu',
			submenu: Menu.buildFromTemplate(
				fs.readdirSync(startersPath, {withFileTypes: true})
					.filter(dirent => dirent.isDirectory())
					.map((dirent) => {
						return {
							label: dirent.name,
							click: async function () {
								const title = await prompt({
									title: 'create new bimbo project',
									buttonLabels: {
										ok: 'let\'s go',
										cancel: 'nevermind'
									},
									label: 'title:',
									value: dirent.name,
									type: 'input'
								})
								// .then((r) => {
								// 	if(r === null) {
								// 		console.logger.info('user cancelled');
								// 	} else {
								// 		console.logger.info('result', r);
								// 	}
								// })
								.catch(console.error);

								if (!title) { return }

								let pickedPaths = dialog.showOpenDialogSync({
									properties: ['openDirectory']
								})

								if (!pickedPaths) { return }

								initProjectStarter(
									path.join(pickedPaths[0], title),
									dirent.name
								)
							}
					}
				})
			)
		},
		{
			label: `🆒 import existing project`,
			click: function() {
				let pickedPaths = dialog.showOpenDialogSync({
					filters: [{name: 'bimbo project file', extensions: ['yaml']}],
					properties: ['openFile']
				})

				if (!pickedPaths) { return }

				projects.add(path.dirname(pickedPaths[0]))
				projects.setActive(projects.getAll().length - 1)
				updateTrayMenu()
			}
		},
	]

	if (!activeProject) {
		menu = Menu.buildFromTemplate([
			...projectMenuItems,
			{ type: 'separator' },
			{ label: showDebugMenu ? 'gottem' : 'quit bimbo', click: function() {
				app.quit()
			}}
		])
	}
	else {
		const deployMeta = activeProject.data.deployment
	
		menu = Menu.buildFromTemplate([
			{
				id: 'title',
				label: activeProject.data.site.title,
				type: 'submenu',
				submenu: Menu.buildFromTemplate(
					[
						...projects.getAll().map((meta, index) => {
							return {
								label: meta.data.site.title,
								type: 'radio',
								checked: index == conf.get('activeIndex'),
								click: () => {
									projects.setActive(index)
									updateTrayMenu()
								}
							}
						}),
						{ type: 'separator' },
						...projectMenuItems
					]
				)
			},
			{ label: `🔗 preview in browser`, click: function() {
				shell.openExternal(localUrl)
			} },
			{ type: 'separator' },
			{ label: `👩‍💻 edit in VSCodium`, click: function() {
				exec(`${conf.get('editor')} "${activeProject.rootPath}"`)
			} },
			{ label: `📂 open project folder`, click: function() {
				shell.openPath(activeProject.rootPath)
			} },
			{ type: 'separator' },
			{
				id: 'deploy',
				label: !!deployMeta ?
					`🌐 deploy to ${deployMeta.provider}` : 'deployment not configured',
				enabled: !!deployMeta,
				click: deploy,
			},
			{ type: 'separator' },
			{ label: 'quit bimbo', click: function() {
				app.quit()
			}}
		])
	}

	tray.setContextMenu(menu)
}

async function initProjectStarter(newProjPath, starterName) {
	fs.cpSync(path.join(startersPath, starterName), newProjPath, {recursive: true})

	_.each(config.EXTRA_INIT_FILES, (data) => {
		if (data.json) {
			data.text = JSON.stringify(data.json, null, true)
		}

		if (data.filePath.includes('.vscode')) {
			fs.mkdirSync(path.join(newProjPath, '.vscode'))
		}

		fs.writeFileSync(path.join(newProjPath, data.filePath), data.text)
	})

	let configFilepath = path.join(newProjPath, config.CONFIG_FILENAME)

	let newConfig = yaml.parse(fs.readFileSync(configFilepath, 'utf-8'))
	newConfig.site.title = path.basename(newProjPath)
	fs.writeFileSync(configFilepath, yaml.stringify(newConfig))

	projects.add(newProjPath)
	projects.setActive(projects.getAll().length - 1)
	updateTrayMenu()
}