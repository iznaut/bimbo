import { dialog } from 'electron'

export const presets = {}

export async function deploy() {
	dialog.showMessageBoxSync({
		message: `get bimbo+ to enable one-click deployment options!`,
		type: 'warning',
	})
}