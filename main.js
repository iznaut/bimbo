import { platform } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { exec } from 'node:child_process'
import _ from 'lodash'
import prompt from 'electron-prompt'
import * as yaml from 'yaml'
import winston from 'winston'
import Handlebars from 'handlebars'
import { compareVersions } from 'compare-versions'
import tiny from 'tiny-json-http'
import { fileURLToPath } from 'url'
import { BugSplatNode as BugSplat } from "bugsplat-node";

import { conf, isDev, logger, openBrowserPreview } from './utils.js'
import config from './config.js'
import projects from './projects.js'
import { deploy, presets } from './deploy.js'

import {
	app,
	dialog,
	Notification,
	Menu,
	shell,
	globalShortcut,
	Tray,
	nativeImage,
	BrowserWindow,
	crashReporter,
} from 'electron'

const IS_PLUS_MODE = false

const CURRENT_VERSION = fs.readFileSync(path.join(app.getAppPath(), 'version'), 'utf-8').trim()
let latestVersion
let versionIsCurrent = true
let versionCheckError = false

logger.info(CURRENT_VERSION)

const bugsplat = new BugSplat('me-iznaut-com', 'bimbo', CURRENT_VERSION)

bugsplat.setDefaultAdditionalFilePaths([path.join(app.getAppPath(), 'bimbo.log')])

crashReporter.start({
	submitURL: `https://me-iznaut-com.bugsplat.com/post/electron/v2/crash.php`,
	ignoreSystemCrashHandler: true,
	uploadToServer: true,
	rateLimit: false,
	globalExtra: {
		product: 'bimbo',
		version: CURRENT_VERSION,
		key: "en-US",
		// email: "fred@bugsplat.com",
		// comments: "BugSplat rocks!",
	},
})

// Recommended: Post to BugSplat when unhandledRejections and uncaughtExceptions occur
const javaScriptErrorHandler = async (error) => {
	await bugsplat.post(error)
	app.quit()
}
process.on("unhandledRejection", javaScriptErrorHandler)
process.on("uncaughtException", javaScriptErrorHandler)

const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==')

let tray = null
global.win = null

const startersPath = path.join((isDev() ? '' : process.resourcesPath), 'project-starters')

// TODO what is this lol
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

	globalShortcut.register('CommandOrControl+Alt+R', () => {
		logger.info('attempting config clear')
		conf.clear()
		projects.setActive(-1)
		updateTrayMenu()
		tray.setToolTip('no project loaded')
		tray.setTitle('no project loaded')
		dialog.showMessageBox({ message: 'bimbo config has been reset to defaults' })
		logger.info('config cleared')
	})

	// having this listener active will prevent the app from quitting.
	app.on('window-all-closed', () => {})

	if (conf.get('activeIndex') == -1) {
		shell.openExternal('https://bimbo.nekoweb.org/posts/2-getting-started.html')
	}
	else {
		// start watching last active project
		projects.setActive()
	}

	let displayTitle = 'no project loaded'

	if (projects.getActive()) {
		displayTitle = conf.get('options.showProjectTitleInMenubar') ? projects.getActive().data.site.title : ''
	}

	tray.setToolTip(displayTitle)
	tray.setTitle(displayTitle)

	getLatestVersion().then(() => {
		if(!versionIsCurrent) {
			updateTrayMenu()
			notifyUpdateAvailability()
		}
	})
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

									// TODO dedupe
									let displayTitle = conf.get('options.showProjectTitleInMenubar') ? projects.getActive().data.site.title : ''
									tray.setToolTip(displayTitle)
									tray.setTitle(displayTitle)
								}
							}
						}),
						{ type: 'separator' },
						...projectMenuItems
					]
				)
			},
			{ label: `🔗 preview in browser`, click: function() {
				openBrowserPreview()
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
				label: !!deployMeta ? `🌐 deploy to ${deployMeta.provider}` : 'deployment not configured',
				visible: !!deployMeta && Object.keys(presets).length > 0,
				click: deploy,
			},
			{
				label: 'set up deployment',
				type: 'submenu',
				enabled: Object.keys(presets).length > 0,
				visible: !deployMeta,
				submenu: Menu.buildFromTemplate(
					Object.keys(presets).map(key => {
						return {
							label: key,
							click: (label) => {
								initDeploymentPreset(label)
							}
						}
					})
				)
			},
			{
				label: `👀 get bimbo+ for one-click deploy!`,
				visible: Object.keys(presets).length == 0,
				click: function() {
					shell.openExternal('https://iznaut.itch.io/bimbo')
				}
			},
			{ type: 'separator' },
			{ label: `🔗 visit bimbo Discord`, click: function() {
				shell.openExternal('https://discord.gg/hkAMG3Kru8')
			} },
			{ type: 'separator' },
			{
				label: '🚨 NEW UPDATE AVAILABLE!!!',
				visible: !versionIsCurrent,
				click: () => {
					shell.openExternal('https://iznaut.itch.io/bimbo')
				}
			},
			{
				label: 'check for updates',
				visible: versionIsCurrent,
				click: async () => {
					await getLatestVersion()
					notifyUpdateAvailability()
					updateTrayMenu()
				},
			},
			{
				id: 'options',
				label: 'options',
				type: 'submenu',
				submenu: Menu.buildFromTemplate(
					[
						{
							label: 'show active project title in menubar',
							type: 'checkbox',
							checked: conf.get('options.showProjectTitleInMenubar'),
							click: () => {
								conf.set('options.showProjectTitleInMenubar', !conf.get('options.showProjectTitleInMenubar'))
								updateTrayMenu()

								// TODO dedupe
								let displayTitle = conf.get('options.showProjectTitleInMenubar') ? projects.getActive().data.site.title : ''

								tray.setToolTip(displayTitle)
								tray.setTitle(displayTitle)
							}
						},
						{
							label: 'open site preview on app/project load',
							type: 'checkbox',
							checked: conf.get('options.autoOpenPreview'),
							click: () => {
								conf.set('options.autoOpenPreview', !conf.get('options.autoOpenPreview'))
								updateTrayMenu()
							}
						},
					]
				)
			},
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

async function initDeploymentPreset(menuItem) {
	let presetName = menuItem.label
	updateTrayMenu()
	// deploy()

	const __filename = fileURLToPath(import.meta.url)
	const __dirname = path.dirname(__filename)

	win = new BrowserWindow({
		title: "set up deployment - bimbo",
		useContentSize: true,
		alwaysOnTop: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js')
		}
	})

	win.loadFile(`deploy-popups/${presetName}.html`)
}

async function getLatestVersion() {
	if(isDev()) {
		latestVersion = '99.99.99-dev'
	} else {
		try {
			latestVersion = (await tiny.get({url: "https://raw.githubusercontent.com/iznaut/bimbo/refs/heads/main/version"})).body.trim()
		} catch(e) {
			logger.info(`Error getting latest version: ${e}`)
			versionCheckError = true
		}
	}
	if(latestVersion) {
		versionCheckError = false
		const versionComparison = compareVersions(latestVersion, CURRENT_VERSION)
		versionIsCurrent = versionComparison === 0
	}
}

function notifyUpdateAvailability() {
	const message = 
		versionCheckError ? 'update check failed' : 
		versionIsCurrent ? 'no updates available' : 
		`version ${latestVersion} available on itch.io`
	new Notification({ title: config.BASE_NAME, body: message }).show()
}
