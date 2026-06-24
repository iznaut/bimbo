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
import { BugSplatNode as BugSplat } from "bugsplat-node"

import { conf, isDev, logger, openBrowserPreview, ICON } from './utils.js'
import config from './config.js'
import projects from './projects.js'
import { deploy, presets, IS_PLUS_MODE } from './deploy.js'

import {
	app,
	dialog,
	Notification,
	Menu,
	shell,
	globalShortcut,
	Tray,
	BrowserWindow,
	crashReporter,
} from 'electron'

// exec("ssh-keygen -t rsa -q -f \"$HOME/.ssh/id_rsa2\" -N \"\"", (error, stdout, stderr) => {
//     if (error) {
//         console.log(`error: ${error.message}`);
//         return;
//     }
//     if (stderr) {
//         console.log(`stderr: ${stderr}`);
//         return;
//     }
//     console.log(`stdout: ${stdout}`);
// });

// Windows
if (process.platform === 'win32') {
	mainWindow.setIcon(path.join(__dirname, 'assets/windows/icon.ico'));
}

// Linux
if (process.platform === 'linux') {
	mainWindow.setIcon(path.join(__dirname, 'assets/linux/icons/512x512.png'));
}

const USER_DATA_PATH = app.getPath("userData")
const LOG_PATH = path.join(!isDev() ? './' : USER_DATA_PATH, 'bimbo.log')

const CURRENT_VERSION = fs.readFileSync(path.join(app.getAppPath(), 'version'), 'utf-8').trim()
let latestVersion
let versionIsCurrent = true
let versionCheckError = false

logger.info(`bimbo ssg v${CURRENT_VERSION}`)

let bugsplat = null

configureCrashReporting()

let tray = null
global.win = null

const startersPath = path.join((isDev() ? '' : process.resourcesPath), 'project-starters')

app.whenReady().then(() => {
	logger.info(`writing log to ${LOG_PATH}`)

	logger.add(new winston.transports.File({
		filename: LOG_PATH,
		handleRejections: true,
		humanReadableUnhandledException: true
	}))

	logger.info('app ready!')

	if (platform() === "darwin") {
		app.dock.hide()
	}

	tray = new Tray(ICON)
	
	tray.on('click', () => {
		updateTrayMenu()
	})

	globalShortcut.register('CommandOrControl+Alt+R', () => {
		logger.info('attempting config clear')
		conf.clear()
		projects.setActive(-1)
		tray.setToolTip('no project loaded')
		tray.setTitle('no project loaded')
		dialog.showMessageBox({ message: 'bimbo config has been reset to defaults', icon: ICON })
		logger.info('config cleared')
	})

	// having this listener active will prevent the app from quitting.
	app.on('window-all-closed', () => {})

	if (conf.get('activeIndex') == -1 && !isDev()) {
		shell.openExternal('https://bimbo.nekoweb.org/posts/2-getting-started.html')
	}
	else {
		// start watching last active project
		projects.setActive()
	}

	updateTrayTitle()
	updateTrayMenu()

	getLatestVersion().then(() => {
		if(!versionIsCurrent) {
			logger.warn('newer version available')
			notifyUpdateAvailability()
		}
	})
})

function updateTrayMenu() {
	let menu = null
	const activeProject = projects.getActive()

	const projectSubmenuItems = [
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
			}
		},
	]

	const deployMeta = !!activeProject ? activeProject.data.deployment : null

	menu = Menu.buildFromTemplate([
		{
			label: `bimbo+ ssg v${CURRENT_VERSION}`,
			enabled: false
		},
		{
			label: '🚨 NEW UPDATE AVAILABLE!!!',
			visible: !versionIsCurrent,
			click: () => {
				shell.openExternal('https://iznaut.itch.io/bimbo')
			}
		},
		{ type: 'separator' },
		{
			id: 'title',
			label: !!activeProject ? activeProject.data.site.title : 'no project loaded',
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

								// TODO dedupe
								let displayTitle = conf.get('settings.showProjectTitleInMenubar') ? projects.getActive().data.site.title : ''
								tray.setToolTip(displayTitle)
								tray.setTitle(displayTitle)
							}
						}
					}),
					{ type: 'separator' },
					...projectSubmenuItems
				]
			)
		},
		{
			label: `🔗 preview in browser`,
			enabled: !!activeProject,
			click: function() {
				openBrowserPreview()
			}
		},
		{ type: 'separator' },
		{
			label: `👩‍💻 edit in VSCodium`,
			enabled: !!activeProject,
			click: function() {
				logger.info(`user requested editor ${conf.get('editor')}`)

				exec(`${conf.get('editor')} "${activeProject.rootPath}"`, (error, stdout, stderr) => {
					if (error) {
						logger.error(error)

						dialog.showMessageBoxSync({ message: "VSCodium was not found - if it's installed, please open it and go to View > Command Palette... > Shell Command: Install 'codium' command in PATH" })
					}
					if (stdout) { logger.info(stdout) }
					if (stderr) { logger.error(stderr) }
				})
			}
		},
		{
			label: `📂 open project folder`,
			enabled: !!activeProject,
			click: function() {
				shell.openPath(activeProject.rootPath)
			}
		},
		{ type: 'separator' },
		{
			id: 'deploy',
			label: !!deployMeta ? `🌐 deploy to ${deployMeta.provider}` : 'deployment not configured',
			visible: !!deployMeta && Object.keys(presets).length > 0,
			click: () => {
				deploy()
			},
		},
		{
			label: 'set up deployment',
			type: 'submenu',
			enabled: Object.keys(presets).length > 0 && !!activeProject,
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
		{
			label: 'settings',
			type: 'submenu',
			submenu: Menu.buildFromTemplate(
				[
					{
						label: 'show active project title in menubar',
						type: 'checkbox',
						checked: conf.get('settings.showProjectTitleInMenubar'),
						click: () => {
							conf.set('settings.showProjectTitleInMenubar', !conf.get('settings.showProjectTitleInMenubar'))

							updateTrayTitle()
						}
					},
					{
						label: 'open site preview on app/project load',
						type: 'checkbox',
						checked: conf.get('settings.autoOpenPreview'),
						click: () => {
							conf.set('settings.autoOpenPreview', !conf.get('settings.autoOpenPreview'))
						}
					},
					{
						label: 'submit crash reports/logs to bimbo central',
						type: 'checkbox',
						checked: conf.get('settings.submitCrashLogs'),
						click: () => {
							if (conf.get('settings.submitCrashLogs')) {
								let clickedId = dialog.showMessageBoxSync({
									message: `hi! jsyk bimbo only sends data relevant to crashes and the contents of your bimbo.log file. it's super helpful for improving bimbo and doesn't contain anything sensitive or identifying. you're welcome to disable it, but i'd really appreciate it if you kept it on. thanks!`,
									type: 'warning',
									buttons: ['nah disable please', 'oh alright leave it on'],
									defaultId: 1,
									cancelId: 1,
									title: 'disable crash reporting',
									icon: ICON
								})

								if (clickedId == 0) {
									conf.set('settings.submitCrashLogs', false)
									configureCrashReporting()
								}
							}
							else {
								conf.set('settings.submitCrashLogs', true)
								configureCrashReporting()
							}
						}
					},
				]
			)
		},
		{
			label: 'support',
			type: 'submenu',
			submenu: Menu.buildFromTemplate(
				[
					{
						label: '👀 check for updates',
						click: async () => {
							await getLatestVersion()
							notifyUpdateAvailability()
						},
					},
					{
						label: `🤖 join bimbo Discord`,
						click: () => {shell.openExternal('https://discord.gg/hkAMG3Kru8')}
					},
					{
						label: `💌 email izzy (she made this)`,
						click: () => {
							if (bugsplat) {
								bugsplat.post(new Error('user prompted email'))
							}
							shell.openExternal('mailto:bimbo@iznaut.com')
						}
					},
				]
			)
		},
		{
			label: '🔧 debug',
			visible: isDev(),
			type: 'submenu',
			submenu: Menu.buildFromTemplate(
				[
					{
						label: 'open user data folder',
						click: () => {
							shell.openPath(USER_DATA_PATH)
						},
					},
					{
						label: 'delete bimbo-secrets.yaml',
						click: () => {
							fs.rmSync(path.join(projects.getActive().rootPath, config.SECRETS_FILENAME))
						},
					},
				]
			)
		},
		{ label: 'quit', click: function() {
			app.quit()
		}}
	])

	tray.setContextMenu(menu)
}

function updateTrayTitle() {
	let displayTitle = 'no project loaded'

	if (projects.getActive()) {
		displayTitle = projects.getActive().data.site.title
	}

	tray.setToolTip(displayTitle)
	tray.setTitle(conf.get('settings.showProjectTitleInMenubar') ? displayTitle : '')
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
}

async function initDeploymentPreset(menuItem) {
	let presetName = menuItem.label

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

function configureCrashReporting() {
	const javaScriptErrorHandler = async (error) => {
		await bugsplat.post(error)
		app.quit()
	}

	bugsplat = conf.get('settings.submitCrashLogs')
		? new BugSplat('me-iznaut-com', 'bimbo', CURRENT_VERSION)
		: null

	if (bugsplat) {
		bugsplat.setDefaultAdditionalFilePaths([LOG_PATH])
		
		crashReporter.start({
			submitURL: `https://me-iznaut-com.bugsplat.com/post/electron/v2/crash.php`,
			ignoreSystemCrashHandler: true,
			uploadToServer: true,
			rateLimit: false,
			globalExtra: {
				product: 'bimbo',
				version: CURRENT_VERSION,
				key: "en-US",
			},
		})

		process.on("unhandledRejection", javaScriptErrorHandler)
		process.on("uncaughtException", javaScriptErrorHandler)
	}
	else {
		process.removeListener("unhandledRejection", javaScriptErrorHandler)
		process.removeListener("uncaughtException", javaScriptErrorHandler)
	}
}