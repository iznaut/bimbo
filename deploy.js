import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'


export default function(activeProjectMeta) {
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

	console.log(activeProjectConfig.data.deployment)

	let response = await nekoweb.getSiteInfo('windfuck.ing')
	console.log(response)
}