#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import { attrs } from "@mdit/plugin-attrs"
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import _ from 'underscore'
import live from 'alive-server'
import extract from 'extract-zip'
import { Feed } from 'feed'
import * as cheerio from 'cheerio'
import * as feather from 'feather-icons'
import { sendBlueskyPostWithEmbed } from './bluesky.ts'

let mainWindow

const paths = {
	"content": "content",
	"posts": "content/posts",
	"data": "data",
	"templates": "templates",
	"partials": "templates/partials",
	"static": "static",
	"build": "public"
}

const yamlFilename = 'bimbo.yaml'
const exampleZipPath = './example.zip'

const defaultYaml = {
	"site": {
		"title": "My Cool Website",
		"description": "my cool description",
		"authorName": "sexygurl69",
		"authorUrl": "https://bimbo.nekoweb.org/",
		"dateFormat": "YYYY-MM-DD",
		"sortPostsAscending": false,
		"codeTheme": "tokyo-night-dark"
	},
	"contentDefaults": {
		"title": "cool untitled page",
		"template": "default.html",
		"draft": false
	}
}

let rssFeed

const buildOnly = process.argv.includes('build') || process.argv.includes('deploy')

let startPath = "./website"

// // if running from binary, use exec path
// if (startPath.includes('/bin')) {
// 	startPath = process.cwd()
// }

const pathArgIndex = _.indexOf(process.argv, '--path') + 1

process.chdir(startPath)

if (pathArgIndex) {
	process.chdir(process.argv[process.argv.length - 1])
}

let watchData
let pagesToUpdate = {}

log(`current working directory: ${process.cwd()}`)

// if (buildOnly) {
// 	build()
// }
// else {
// 	watch()
// }


import pkg from 'electron';
const { app, BrowserWindow, ipcMain, dialog, screen } = pkg;

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createWindow = () => {
	let opts = {
		title: "bimbo", 
		width: 320,
		height: 350,
		frame: false,
		alwaysOnTop: true,
		transparent: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js')
		}
	}

	let display = screen.getPrimaryDisplay()
	let width = display.bounds.width
	let height = display.bounds.height

	opts.x = width
	opts.y = height

	mainWindow = new BrowserWindow(opts)
	
	mainWindow.loadFile('electron/index.html')

	mainWindow.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
	createWindow()
	console.log(startPath)
	
	ipcMain.handle('dialog', async (event, method, params) => {       
		let dirHandle = await dialog[method](params);
		let newPath = dirHandle.filePaths[0]
		startPath = newPath
		process.chdir(startPath)
		return fs.existsSync('bimbo.yaml')
	});

	ipcMain.handle('start-watch', async () => {
		watch()
		return true
	})

	ipcMain.handle('quit', async () => {
		app.quit()
	})
})

async function init() {
	if (fs.existsSync(exampleZipPath)) {
		try {
			await extract(exampleZipPath, { dir: process.cwd() })
		}
		catch (err) {
			console.log(err)
		}

		fs.rmSync(exampleZipPath)
	}
	else {
		// create base files/folders
		_.forEach(paths, (dir) => {
			fs.mkdirSync(dir)
		})

		fs.writeFileSync(yamlFilename, yaml.stringify(defaultYaml))
	}
}

async function build() {
	if (!fs.existsSync(yamlFilename)) {
		log('failed to find bimbo.yml file, aborting...')
		return
		// await init()
	}

	// load site config data
	let data = yaml.parse(
		fs.readFileSync(yamlFilename, "utf-8")
	)
	data.pages = []

	// register Handlebars partials
	const partials = fs.readdirSync(paths.partials);

	partials.forEach(function (filename) {
		var matches = /^([^.]+).hbs$/.exec(filename);
		if (!matches) {
			return;
		}
		var name = matches[1];
		var template = fs.readFileSync(path.join(paths.partials, filename), 'utf8');
		Handlebars.registerPartial(name, template);
	});

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
		fs.rmSync(paths.build, { recursive: true, force: true });
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

	const dataFilepaths = await fs.promises.readdir(paths.data, { recursive: true })

	_.each(dataFilepaths, (filepath) => {
		const jsonData = fs.readFileSync(path.join(paths.data, filepath), "utf-8")
		const dataName = path.basename(filepath, '.json')

		data.site.userDefined[dataName] = JSON.parse(jsonData)
	})

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
		.pick((v) => { return v.navIndex })
		.sortBy((v) => { return v.navIndex })
		.value()

	data.site.blogPosts = _.chain(data.pages)
		.filter((v) => { return path.dirname(v.path) == paths.posts })
		.sortBy((v) => { return v.date * (data.site.sortPostsAscending ? 1 : -1) })
		.value()

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

	// copy static pages
	fs.cp(paths.static, paths.build, { recursive: true }, (err) => { if (err) { console.log(err) } })

	fs.writeFileSync(
		path.join(paths.build, 'feed.xml'),
		rssFeed.rss2()
	);

	try {
		if (data.site.integrations.bskyUserId) {
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

	log("💅 Bimbo build completed!")
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

	if (path.parse(page.headerImage).root == '/') {
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
		htmlOutput = htmlTemplate(page)

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
	await build()

	live.start({
		mount: [['/', paths.build]],
		watch: [paths.content, paths.static, paths.templates, yamlFilename],
		port: 6969,
		wait: 1000,
	})

	live.watcher.on('change', async function (e) {
		log('rebuilding...')
		await build()
	})
}

function log(msg) {
	console.log(`💖BIMBO💖 logger: ${msg}`)
	if (mainWindow) {

		mainWindow.webContents.send('bimbo-log', `💖BIMBO💖 logger: ${msg}`);
	}

}

// function upload() {
// 	let formData = new FormData()
// 	request
// }