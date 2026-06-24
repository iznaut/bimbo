import { dialog } from 'electron'
import { icon } from './utils.js'

export const IS_PLUS_MODE = false

export const presets = {}

export async function deploy() {
	dialog.showMessageBoxSync({
		message: `get bimbo+ to enable one-click deployment options!`,
		type: 'warning',
		icon: ICON
	})
}