import { ipcMain, dialog, Notification, BrowserWindow, shell } from 'electron'
import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'
import SftpClient from 'ssh2-sftp-client'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'url'
import * as yaml from 'yaml'

import { conf, logger } from './utils.js'
import projects from './projects.js'
import config from './config.js'

export const presets = {
	nekoweb: {
		apiKey: "",
		domain: ""
	},
	neocities: {
		apiKey: ""
	},
	other: {
		host: "",
		port: 22,
		siteRoot: "",
		username: "",
		keyPath: ""
	}
}

ipcMain.handle('openExternalUrl', async function (_event, url) {
	shell.openExternal(url)
})

ipcMain.handle('form', async function (_event, newDeployMeta) {
	switch (newDeployMeta.provider) {
		case 'nekoweb':
			break;
		case 'neocities':
			const apiKeyResponse = await NeocitiesAPIClient.getKey({
				siteName: newDeployMeta.username,
				ownerPassword: newDeployMeta.password
			})

			if (apiKeyResponse.result == 'success') {
				logger('neocities auth successful')

				newDeployMeta = {
					provider: 'neocities',
					apiKey: apiKeyResponse.api_key
				}

			}
			else {
				logger('neocities auth failed')

				dialog.showMessageBoxSync({
					message: 'unable to authenticate with neocities, please check your credentials and try again',
					type: 'error',
					title: 'something went wrong'
				})

				return
			}
			break;
		default:
			// TODO SFTP stuff
			break;
	}

	const secretsPath = path.join(projects.getActive().rootPath, config.SECRETS_FILENAME) // TODO dedupe
	logger(secretsPath)
	if (!fs.existsSync(secretsPath)) {
		fs.writeFileSync(secretsPath, yaml.stringify({}))
	}
	const secretsData = yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
	secretsData.deployment = newDeployMeta
	fs.writeFileSync(secretsPath, yaml.stringify(secretsData))

	projects.setActive()

	deploy()
})

export async function deploy() {
	const activeProjectMeta = projects.getActive()
	const deployMeta = activeProjectMeta.data.deployment

	if (!deployMeta) {
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

		win.loadFile(`deploy-popups/${deployMeta.provider}.html`)
	}
	else {
		let clickedId = dialog.showMessageBoxSync({
			message: `are you sure you want to deploy ${activeProjectMeta.data.site.title} to ${deployMeta.provider}?`,
			type: 'warning',
			buttons: ['yeah!!', 'not yet...'],
			defaultId: 1,
			cancelId: 1,
			title: 'confirm deployment'
		})

		if (clickedId == 0) {
			new Notification({
				title: config.BASE_NAME,
				body: `starting deployment to ${deployMeta.provider}`
			}).show()

			switch (deployMeta.provider) {
				case 'nekoweb':
					await deployToNekoweb(deployMeta)
					break;
				case 'neocities':
					await deployToNeocities(deployMeta)
					break;
				default:
					await deployViaSftp(deployMeta, activeProjectMeta.rootPath)
					break;
			}

			new Notification({
				title: config.BASE_NAME,
				body: `deployment completed successfully`
			}).show()
		}
		else {
			logger.info('deploy canceled')
		}
	}
}

// TODO - success/fail handling for deploys

async function deployToNeocities(deployMeta) {
	const client = new NeocitiesAPIClient(deployMeta.apiKey)

	await client.deploy({
		directory: path.join(projects.getActive().rootPath, '_site'),
		cleanup: true, // Delete orphaned files
		includeUnsupportedFiles: false // Upload unsupported files. Paid neocities feature
	})
}

async function deployToNekoweb(deployMeta) {
	let nekoweb = new NekowebAPI({
		apiKey: deployMeta.apiKey,
	})

	await nekoweb.getSiteInfo(deployMeta.domain)
	let response = await nekoweb.upload(path.join('/', deployMeta.domain))
	console.log(response) // TODO
}

async function deployViaSftp(deployMeta, projectRootPath) {
	const client = new SftpClient()
	try {
		const connectConfig = {
			host: deployMeta.host,
			username: deployMeta.username
		}
		if(deployMeta.port) connectConfig.port = deployMeta.port
		if(deployMeta.password) connectConfig.password = deployMeta.password
		if(deployMeta.keyPath) connectConfig.privateKey = fs.readFileSync(deployMeta.keyPath, "utf-8")
		await client.connect(connectConfig)
		console.log(connectConfig)
		await client.rmdir(deployMeta.siteRoot, true).catch(() => {}) // Fail silently if dir doesn't exist
		await client.uploadDir(path.join(projectRootPath, '_site'), deployMeta.siteRoot)
	}
	catch(err) {
		logger.error(err.message)
	}
	client.end()
}