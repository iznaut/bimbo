import { ipcMain, dialog } from 'electron'
import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'

import { conf } from './utils.js'
import projects from './projects.js'

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
		
		loadProject(conf.get('activeIndex'))

		deploy()
	}
})

export function deploy(activeProjectMeta) {
	const deployMeta = activeProjectMeta.data.deployment

	if (deployMeta.provider == 'neocities' && !deployMeta.apiKey) {
		createWindow()
	}
	else {
		let clickedId = dialog.showMessageBoxSync({
			message: `are you sure you want to deploy ${activeProjectMeta.data.site.title} to ${activeProjectMeta.data.deployment.provider}?`,
			type: 'warning',
			buttons: ['yeah!!', 'not yet...'],
			defaultId: 1,
			cancelId: 1,
			title: 'confirm deployment'
		})

		if (clickedId == 0) {
			switch (activeProjectMeta.data.deployment.provider) {
		case 'nekoweb':
			deployToNekoweb()
			break;
		case 'neocities':
			deployToNeocities()
			break;
		default:
			console.log('deployment failed - unknown provider')
	}
		}
		else {
			console.log('deploy canceled')
		}
	}
}

// TODO - success/fail handling for deploys
// way to get API key?

async function deployToNeocities() {
	const client = new NeocitiesAPIClient(activeProjectMeta.data.deployment.apiKey)

	await client.deploy({
		directory: paths.build,
		cleanup: true, // Delete orphaned files
		includeUnsupportedFiles: false // Upload unsupported files. Paid neocities feature
	})
}

async function deployToNekoweb() {
	let nekoweb = new NekowebAPI({
		apiKey: activeProjectConfig.data.deployment.apiKey,
	})

	let response = await nekoweb.getSiteInfo('windfuck.ing')
	console.log(response) // TODO
}