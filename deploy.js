import { ipcMain, dialog, Notification, BrowserWindow, shell } from 'electron'
import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'
import SftpClient from 'ssh2-sftp-client'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'url'
import * as yaml from 'yaml'
import { zip } from 'zip-a-folder'
import { setTimeout } from "timers/promises";

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
				logger.info('neocities auth successful')

				newDeployMeta = {
					provider: 'neocities',
					apiKey: apiKeyResponse.api_key
				}

			}
			else {
				logger.info('neocities auth failed')

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
	logger.info(secretsPath)
	if (!fs.existsSync(secretsPath)) {
		fs.writeFileSync(secretsPath, yaml.stringify({}))
	}
	const secretsData = yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
	secretsData.deployment = newDeployMeta
	fs.writeFileSync(secretsPath, yaml.stringify(secretsData))

	projects.setActive()

	await setTimeout(1000) // HACK to get around build not finishing in time for deploy

	try {
		deploy()
	}
	catch(err) {
		logger.error(err)
	}
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
			let startMsg = `starting deployment to ${deployMeta.provider}`

			new Notification({
				title: config.BASE_NAME,
				body: startMsg
			}).show()

			let success = false

			logger.info(startMsg)

			switch (deployMeta.provider) {
				case 'nekoweb':
					success = await deployToNekoweb(deployMeta)
					break;
				case 'neocities':
					success = await deployToNeocities(deployMeta)
					console.log(success)
					break;
				default:
					success = await deployViaSftp(deployMeta, activeProjectMeta.rootPath)
					break;
			}

			let resultMsg = success ? `deployment completed successfully` : 'deployment failed'

			logger.info(resultMsg)

			new Notification({
				title: config.BASE_NAME,
				body: resultMsg
			}).show()
		}
		else {
			logger.info('deployment canceled')
		}
	}
}

async function deployToNeocities(deployMeta) {
	const client = new NeocitiesAPIClient(deployMeta.apiKey)

	let result = await client.deploy({
		directory: path.join(projects.getActive().rootPath, '_site'),
		cleanup: true, // Delete orphaned files
		includeUnsupportedFiles: false // TODO - atproto-did unsupported, paid feature
	})

	return result.results[0].body.result == 'success'
}

async function deployToNekoweb(deployMeta) {
	let nekoweb = new NekowebAPI({
		apiKey: deployMeta.apiKey,
	})

	let sitePath = path.join(projects.getActive().rootPath, '_site')
	let zipPath = path.join(projects.getActive().rootPath, 'upload.zip')

	await nekoweb.getSiteInfo(deployMeta.domain)
	await zip(sitePath, zipPath) // can we get as buffer?
	let bigfile = await nekoweb.createBigFile()
	let file = fs.readFileSync(zipPath) // TODO - save this in project folder 
	await bigfile.append(file)
	let response = await bigfile.import(path.join('/', deployMeta.domain))

	fs.rmSync(zipPath)
	return response == "Imported"
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
		await client.rmdir(deployMeta.siteRoot, true).catch(() => {}) // Fail silently if dir doesn't exist
		await client.uploadDir(path.join(projectRootPath, '_site'), deployMeta.siteRoot)
	}
	catch(err) {
		logger.error(err.message)
	}
	client.end()
}