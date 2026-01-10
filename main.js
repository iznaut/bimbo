#!/usr/bin/env node

import { platform } from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { exec } from 'node:child_process'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import { attrs } from "@mdit/plugin-attrs"
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import _ from 'lodash' // TODO
import { Feed } from 'feed'
import * as cheerio from 'cheerio'
import * as feather from 'feather-icons'
import { sendBlueskyPostWithEmbed } from './bluesky.ts'
import { fileURLToPath } from 'url'
import { createServer } from 'vite'
import chokidar from 'chokidar'
import { Conf } from 'electron-conf/main'

import pkg from 'electron';
const { app, ipcMain, BrowserWindow, dialog, Menu, shell, globalShortcut, Tray, nativeImage, Notification } = pkg;

import { NeocitiesAPIClient } from 'async-neocities'
import NekowebAPI from '@indiefellas/nekoweb-api'

const BASE_NAME = 'bimbo'
const CONFIG_FILENAME = BASE_NAME + '.yaml'
const SECRETS_FILENAME = BASE_NAME + '-secrets.yaml'

let tray
const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==')

let win

function isDev() {
	return process.argv.includes('--dev')
}

const startersPath = path.join((isDev() ? '' : process.resourcesPath), 'project-starters')

const conf = new Conf({
	defaults: {
		projects: [],
		activeIndex: -1,
		editor: 'codium'
	}
})

let projectsMeta
let activeProjectMeta
let paths

let rssFeed

let server
let watcher

validateProjects()

loadProject(conf.get('activeIndex'))

let pagesToUpdate = {}

const localUrl = 'http://localhost:6969'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let showDebugMenu = false

function createWindow () {
	let opts = {
		title: "generate API key - bimbo", 
		width: 300,
		height: 300,
		alwaysOnTop: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js')
		}
	}

	win = new BrowserWindow(opts)
	
	win.loadFile('auth.html')
}

function createTray() {
	tray = new Tray(icon)
	tray.setContextMenu(createMenu())

	tray.setToolTip('bimbo beta')
	tray.setTitle('bimbo beta')
}

function createMenu() {
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
							click: function () {
								let pickedPaths = dialog.showOpenDialogSync({
									properties: ['openDirectory']
								})

								if (!pickedPaths) { return }

								initProjectStarter(pickedPaths[0], dirent.name)
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

				let projects = conf.get('projects')
				projects.push(path.dirname(pickedPaths[0]))
				conf.set('projects', projects)
				const newIndex = projects.length - 1
				
				loadProject(newIndex)
			}
		},
	]

	if (conf.get('activeIndex') == -1) {
		return Menu.buildFromTemplate([
			...projectMenuItems,
			{ type: 'separator' },
			{ label: showDebugMenu ? 'gottem' : 'quit bimbo', click: function() {
				app.quit()
			}}
		])
	}

	const projMeta = activeProjectMeta
	const deployMeta = projMeta.data.deployment

	return Menu.buildFromTemplate([
		{
			id: 'title',
			label: projMeta.data.site.title,
			type: 'submenu',
			submenu: Menu.buildFromTemplate(
				[
					...projectsMeta.map((meta, index) => {
						return {
							label: meta.data.site.title,
							type: 'radio',
							checked: index == conf.get('activeIndex'),
							click: () => {
								loadProject(index)
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
			exec(`${conf.get('editor')} ${projMeta.rootPath}`)
		} },
		{ label: `📂 open project folder`, click: function() {
			shell.openPath(projMeta.rootPath)
		} },
		{ type: 'separator' },
		{
			id: 'deploy',
			label: !!deployMeta ?
				`🌐 deploy to ${deployMeta.provider}` : 'deployment not configured',
			enabled: !!deployMeta,
			click: requestDeploy,
		},
		{ type: 'separator' },
		{ label: 'quit bimbo', click: function() {
			app.quit()
		}}
	])
}

app.whenReady().then(() => {
	if (platform() === "darwin") {
		app.dock.hide()
	}

	createTray()

	ipcMain.handle('form', async function (_event, username, password) {
		const apiKeyResponse = await NeocitiesAPIClient.getKey({
			siteName: username,
			ownerPassword: password
		})

		if (apiKeyResponse.result == 'success') {
			const secretsPath = path.join(activeProjectMeta.rootPath, SECRETS_FILENAME) // TODO dedupe
			if (!fs.existsSync(secretsPath)) {
				fs.writeFileSync(secretsPath)
			}

			const secretsData = yaml.parse(fs.readFileSync(secretsPath, "utf-8"))
			secretsData['deployment']['apiKey'] = apiKeyResponse.api_key
			fs.writeFileSync(secretsPath, yaml.stringify(secretsData))
			
			loadProject(conf.get('activeIndex'))

			requestDeploy()
		}
	})

	globalShortcut.register('CommandOrControl+Alt+R', () => {
		conf.clear()
		loadProject(-1)
		tray.setContextMenu(createMenu())
		dialog.showMessageBox({ message: 'bimbo config has been reset to defaults' })
	})

	// having this listener active will prevent the app from quitting.
	app.on('window-all-closed', () => {})

	new Notification({
		title: 'bimbo',
		body: !!activeProjectMeta ? `loaded project: ${activeProjectMeta.data.site.title}` : 'no project loaded!'
	}).show()
})

async function initProjectStarter(copyPath, starterName) {
	const newProjPath = path.join(copyPath, starterName)
	fs.cpSync(path.join(startersPath, starterName), newProjPath, {recursive: true})
	fs.cpSync(path.join(startersPath, '.gitignore'), path.join(newProjPath, '.gitignore'))

	let projects = conf.get('projects')
	projects.push(newProjPath)
	conf.set('projects', projects)
	const newIndex = projects.length - 1

	loadProject(newIndex)
}

async function build() {
	// load site config data
	let data = activeProjectMeta.data
	data.pages = []

	// register Handlebars partials
	if (fs.existsSync(paths.partials)) {
		const partials = fs.readdirSync(paths.partials);
	
		partials.forEach(function (filename) {
			var matches = /^([^.]+).hbs$/.exec(filename);
			if (!matches) {
				return;
			}
			var name = matches[1];
			var template = fs.readFileSync(path.join(paths.partials, filename), 'utf8');
			Handlebars.registerPartial(name, template);
		})
	}

	// TODO make separate js for handlebars helpers
	Handlebars.registerHelper('formatDate', function (date) {
		return moment(date).utc().format(data.site.dateFormat)
	})

	Handlebars.registerHelper('getIcon', function (name, options) {
		let icon = feather.icons[name]
		icon.attrs = { ...icon.attrs, ...options.hash }
		return icon.toSvg()
	})

	Handlebars.registerHelper('useFirstValid', function () {
		const valid = _.filter(arguments, (arg) => {
			return _.isString(arg)
		})

		return valid[0]
	})

	if (fs.existsSync(paths.build)) {
		fs.rmSync(paths.build, { recursive: true, force: true })
	}
	fs.mkdirSync(paths.build)

	rssFeed = new Feed({
		title: data.site.title,
		description: data.site.description,
		id: data.site.authorUrl,
		link: data.site.url,
		author: {
			name: data.site.authorName,
			email: data.site.authorEmail,
			link: data.site.authorUrl
		}
	})

	data.site.userDefined = {}

	if (fs.existsSync(paths.data)) {
		const dataFilepaths = await fs.promises.readdir(paths.data, { recursive: true })
	
		_.each(dataFilepaths, (filepath) => {
			const rawData = fs.readFileSync(path.join(paths.data, filepath), "utf-8")
			const dataName = path.basename(filepath, path.extname(filepath))

			if (path.extname(filepath) == '.json') {
				data.site.userDefined[dataName] = JSON.parse(rawData)
			}
			if (path.extname(filepath) == '.yaml') {
				data.site.userDefined[dataName] = yaml.parse(rawData)
			}
			if (path.extname(filepath) == '.txt') {
				data.site.userDefined[dataName] = rawData.split('\n')
			}
		})
	}

	if (fs.existsSync(paths.content)) {
		const contentFilepaths = await fs.promises.readdir(paths.content, { recursive: true })
		let mdPaths = contentFilepaths.filter((item) => { return path.extname(item) == '.md' })
	
		mdPaths.forEach((item) => {
			data = updateMetadata(path.join(paths.content, item), data)
		})
	
		if (_.size(pagesToUpdate)) {
			const postsData = await Promise.all(
				_.values(pagesToUpdate).map(
					postObj => sendBlueskyPostWithEmbed(...postObj)
				)
			)
	
			let index = 0
	
			_.each(pagesToUpdate, (postData, filepath) => {
				const pageIndex = _.findIndex(data.pages, (page) => {
					return page.path == filepath
				})
	
				const page = data.pages[pageIndex]
	
				data.pages[pageIndex].bskyPostId = postsData[index].id
	
				fs.writeFileSync(
					page.path,
					page.md.replace('bskyPostId: tbd', `bskyPostId: ${postsData[index].id}`)
				)
	
				log('Successfully posted to Bluesky!')
				log(`https://bsky.app/profile/${postsData[index].handle}/post/${postsData[index].id}`)
	
				index++
			})
		}
	
		data.site.navPages = _.chain(data.pages)
			.pickBy((v) => { return v.navIndex })
			.sortBy((v) => { return v.navIndex })
			.value()
	
		data.site.blogPosts = _.chain(data.pages)
			.filter((v) => { return path.dirname(v.path) == paths.posts })
			.sortBy((v) => { return v.date * (data.site.sortPostsAscending ? 1 : -1) })
			.value()

		data.site.snippets = _.chain(data.pages)
			.filter((v) => { return path.dirname(v.path) == paths.snippets })
			.map((v) => {
				const key = path.basename(v.path, '.md')
				return [key, v.content]
			})
			.fromPairs()
			.value()

		console.log(data)
	
		// include prev/next context for posts
		_.each(data.site.blogPosts, (v, i) => {
			if (i - 1 > -1) {
				data.site.blogPosts[i].postNext = data.site.blogPosts[i - 1]
			}
			if (i + 1 < data.site.blogPosts.length) {
				data.site.blogPosts[i].postPrev = data.site.blogPosts[i + 1]
			}
		})
	
		generatePages(data)
	}

	// copy static pages
	fs.cp(paths.static, paths.build, { recursive: true }, (err) => { if (err) { console.log(err) } })

	fs.writeFileSync(
		path.join(paths.build, 'feed.xml'),
		rssFeed.rss2()
	);

	try {
		if (data.site.integrations?.bskyUserId) {
			const wellKnownPath = path.join(paths.build, '.well-known')
	
			fs.mkdirSync(wellKnownPath)
			fs.writeFileSync(
				path.join(wellKnownPath, 'atproto-did'),
				`did:plc:${data.site.integrations.bskyUserId}`
			)
		}
	}
	catch (err) {
		log('no Bluesky User ID set, skipping integrations...')
		console.log(err)
	}

	process.watchData = data

	log("site build completed 💅")
}

function getContentDefaults(dir) {
	const defaultFilepath = path.join(dir, '~default.yaml')

	if (fs.existsSync(defaultFilepath)) {
		return yaml.parse(
			fs.readFileSync(defaultFilepath, "utf-8")
		)
	}
	else {
		return {}
	}
}

function updateMetadata(filepath, data) {
	const originalMd = fs.readFileSync(filepath, "utf-8")

	let frontMatter = fm(originalMd)

	const md = markdownit({
		html: true
	})
		.use(markdownItFootnote)
		.use(markdownItHighlightjs)
		.use(attrs)

	frontMatter.attributes = {
		...data.contentDefaults, // global defaults
		...getContentDefaults(path.dirname(filepath)), // local defaults
		...frontMatter.attributes
	}

	let page = {
		'path': filepath,
		'url': filepath.replace(paths.content, '').replace('.md', '.html'),
		'content': md.render(frontMatter.body),
		'md': originalMd
	}
	for (let key in frontMatter.attributes) {
		page[key] = frontMatter.attributes[key]
	}

	if (page.draft) {
		log(`skipping ${filepath} (draft)`)
		return data
	}

	// use filename as title if not defined 
	if (!page.title) {
		page.title = path.basename(filepath, '.md')
	}

	if (page.redirect) {
		page.url = page.redirect
	}

	const $ = cheerio.load(page.content)

	if (!page.description) {
		// TODO make this smarter
		page.description = $('p').html()
	}

	let firstImgUrl = $('img').prop('src')

	if (!page.headerImage) {
		page.headerImage = firstImgUrl || data.site.headerImage
	}

	if (page.headerImage && path.parse(page.headerImage).root == '/') {
		page.headerImage = new URL(page.headerImage, data.site.url).href
	}

	if (page.includeInRSS) {
		rssFeed.addItem({
			title: page.title,
			description: page.description,
			link: page.url,
			date: page.date,
			content: page.content
		})
	}

	if (page.bskyPostId == 'tbd' && process.argv.includes('--deploy')) {
		const headerImg = fs.readFileSync('static/images/header.png');

		const bskyPost =[
			`new post: ${page.title}`,
			new URL(page.url, data.site.url).href,
			page.title,
			page.description,
			new Blob([headerImg]),
		]

		pagesToUpdate[filepath] = bskyPost
	}

	data.pages.push(page)

	return data
}

function generatePages(data) {
	_.each(data.pages, (page) => {
		if (page.redirect) {
			return
		}

		page.site = data.site

		let templatePath = path.join(paths.templates, page.template)

		// get html template
		if (!fs.existsSync(templatePath)) {
			console.warn("couldn't find template, using default")
			page.template = 'default.html'
			templatePath = path.join(paths.templates, 'default.html')
		}

		let htmlOutput = fs.readFileSync(templatePath, "utf-8")

		// compile html template
		let htmlTemplate = Handlebars.compile(htmlOutput)

		try {
			htmlOutput = htmlTemplate(page)
		}
		catch(error) {
			console.error(`failed to compile ${page.template}`)
			let encodedError = error.message.replace(/[\u00A0-\u9999<>\&]/gim, function(i) {
				return '&#' + i.charCodeAt(0) + ';'
			})
			htmlOutput = ('<pre>' + encodedError + '</pre>')
		}

		let outputPath = page.url
		let outputDir = path.dirname(outputPath)

		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(path.join(paths.build, outputDir), { recursive: true })
		}

		fs.writeFileSync(
			path.join(paths.build, outputPath),
			htmlOutput
		);

		return outputPath
	})
}

async function watch() {
	if (watcher) {
		await watcher.close()
	}

	watcher = chokidar.watch(activeProjectMeta.rootPath, {
		ignored: (filePath) => {
			return paths.build == filePath || ['.git', '.gitignore', '.DS_Store'].includes(path.basename(filePath))
		},
		ignoreInitial: true
	}).on('all', (event, changedPath) => {
		console.log(event, changedPath)
		build()

		if ([CONFIG_FILENAME, SECRETS_FILENAME].includes(path.basename(changedPath))) {
			loadProject(conf.get('activeIndex'))
		}
	})

	if (server) {
		server.close()
	}

	server = await createServer({
		configFile: false,
		root: paths.build,
		publicDir: false,
		logLevel: 'silent',
		server: {
			port: 6969,
			strictPort: true
		}
	})
	await server.listen()
	log(`monitoring ${activeProjectMeta.rootPath} for changes`)

	build()
}

function log(msg) {
	console.log(`bimbo: ${msg}`)
	if (win) {

		win.webContents.send('bimbo-log', `💖BIMBO💖 logger: ${msg}`);
	}

}

async function loadProject(index) {
	if (index == -1) {
		if (app.isReady()) {
			new Notification({
				title: 'bimbo',
				body: 'no project loaded!'
			}).show()
		}

		return
	}

	projectsMeta = conf.get('projects').map((projRootPath) => {
		const secretsPath = path.join(projRootPath, SECRETS_FILENAME)

		const projSecrets = fs.existsSync(secretsPath) ? yaml.parse(
			fs.readFileSync(secretsPath, "utf-8")
		) : {}
		let projData = yaml.parse(
			fs.readFileSync(path.join(projRootPath, CONFIG_FILENAME), "utf-8")
		)

		return {
			rootPath: projRootPath,
			data: _.merge(projData, projSecrets)
		}
	})

	activeProjectMeta = projectsMeta[index]

	paths = {
		"content": path.join(activeProjectMeta.rootPath, "content"),
		"posts": path.join(activeProjectMeta.rootPath, "content/posts"),
		"snippets": path.join(activeProjectMeta.rootPath, "content/snippets"),
		"data": path.join(activeProjectMeta.rootPath, "data"),
		"templates": path.join(activeProjectMeta.rootPath, "templates"),
		"partials": path.join(activeProjectMeta.rootPath, "templates/partials"),
		"static": path.join(activeProjectMeta.rootPath, "static"),
		"build": path.join(activeProjectMeta.rootPath, "_site")
	}

	conf.set('activeIndex', index)
	
	watch()

	if (tray) {
		tray.setContextMenu(createMenu())
	}

	if (app.isReady()) {
		new Notification({
			title: 'bimbo',
			body: `loaded project: ${activeProjectMeta.data.site.title}`
		}).show()
	}
}

function projectExists(projRootPath) {
	const configFilepath = path.join(projRootPath, CONFIG_FILENAME)

	return fs.existsSync(configFilepath)
}

function validateProjects() {
	const projects = conf.get('projects').filter((projRootPath) => {
		projectExists(projRootPath)
	})

	conf.set('projects', projects)

	if (projects.length == 0) {
		conf.set('activeIndex', -1)
	}
}

function requestDeploy() {
	const deployMeta = activeProjectMeta.data.deployment

	if (deployMeta.provider == 'neocities' && !deployMeta.apiKey) {
		createWindow()
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
			deploy()
		}
		else {
			console.log('deploy canceled')
		}
	}
}

function deploy() {
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

	let response = await nekoweb.getSiteInfo('windfuck.ing')
	console.log(response)
}

// import deploy from './deploy.js'

// deploy(activeProjectMeta)