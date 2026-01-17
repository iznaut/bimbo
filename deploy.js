import { ipcMain, dialog, Notification, BrowserWindow } from 'electron'
import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'
import { Client } from "basic-ftp"
import * as path from 'node:path'

import { conf, logger } from './utils.js'
import projects from './projects.js'
import config from './config.js'

ipcMain.handle('form', async function (_event, username, password) {
	const apiKeyResponse = await NeocitiesAPIClient.getKey({
		siteName: username,
		ownerPassword: password
	})

	if (apiKeyResponse.result == 'success') {
		const secretsPath = path.join(projects.getActive().rootPath, SECRETS_FILENAME) // TODO dedupe
		if (!fs.existsSync(secretsPath)) {
			fs.writeFileSync(secretsPath)
		}

		const secretsData = yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
		secretsData['deployment']['apiKey'] = apiKeyResponse.api_key
		fs.writeFileSync(secretsPath, yaml.stringify(secretsData))
		
		projects.setActive()

		deploy()
	}
})

export async function deploy() {
	const activeProjectMeta = projects.getActive()
	const deployMeta = activeProjectMeta.data.deployment

	if (deployMeta.provider == 'neocities' && !deployMeta.apiKey) {
		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)

		win = new BrowserWindow({
			title: "generate API key - bimbo",
			width: 300,
			height: 300,
			alwaysOnTop: true,
			webPreferences: {
				preload: path.join(__dirname, 'preload.js')
			}
		})

		win.loadFile('auth.html')
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
				case 'ftp':
					await deployViaFtp(deployMeta, activeProjectMeta.rootPath)
					break;
				default:
					logger.info('deployment failed - unknown provider')
					return
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
// way to get API key?

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

	let response = await nekoweb.getSiteInfo('windfuck.ing')
	console.log(response) // TODO
}

async function deployViaFtp(deployMeta, projectRootPath) {
    const client = new Client()
    // client.ftp.verbose = true
    try {
		
		// client.trackProgress(info => {
		// 	console.log("File", info.name)
		// 	console.log("Type", info.type)
		// 	console.log("Transferred", info.bytes)
		// 	console.log("Transferred Overall", info.bytesOverall)
		// })

        await client.access({
            host: deployMeta.host,
			port: deployMeta.port,
            user: deployMeta.user,
            password: deployMeta.password
        })

		await client.ensureDir(deployMeta.siteRoot)
		await client.clearWorkingDir()
		await client.uploadFromDir(path.join(projectRootPath, '_site'))
    }
    catch(err) {
		logger.error(err)
    }
    client.close()
}