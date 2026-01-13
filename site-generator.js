import * as path from 'node:path'
import * as fs from 'node:fs'
import _ from 'lodash'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import { attrs } from "@mdit/plugin-attrs"
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import { Feed } from 'feed'
import * as cheerio from 'cheerio'
import * as feather from 'feather-icons'
import { sendBlueskyPostWithEmbed } from './bluesky.ts'
import { createServer } from 'vite'
import chokidar from 'chokidar'

import { conf, log } from './utils.js'
import projects from './projects.js'

import config from './config.js'


let rssFeed

let server
let watcher

let pagesToUpdate = {}

const PATHS = {
    CONTENT: "content",
    POSTS: "content/posts",
    SNIPPETS: "content/snippets",
    DATA: "data",
    TEMPLATES: "templates",
    PARTIALS: "templates/partials",
    STATIC: "static",
    OUTPUT: "_site"
}

function getJoinedPath(pathConst) {
    return path.normalize(path.join(projects.getActive().rootPath, pathConst))
}

async function build() {
	// load site config data
	let data = projects.getActive().data
	data.pages = []

	// register Handlebars partials
	if (fs.existsSync(getJoinedPath(PATHS.PARTIALS))) {
		const partials = fs.readdirSync(getJoinedPath(PATHS.PARTIALS));
	
		partials.forEach(function (filename) {
			var matches = /^([^.]+).hbs$/.exec(filename);
			if (!matches) {
				return;
			}
			var name = matches[1];
			var template = fs.readFileSync(path.join(getJoinedPath(PATHS.PARTIALS), filename), 'utf8');
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

	if (fs.existsSync(getJoinedPath(PATHS.OUTPUT))) {
		fs.rmSync(getJoinedPath(PATHS.OUTPUT), { recursive: true, force: true })
	}
	fs.mkdirSync(getJoinedPath(PATHS.OUTPUT))

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

    const userDataPath = getJoinedPath(PATHS.DATA)

	if (fs.existsSync(userDataPath)) {
		const dataFilepaths = await fs.promises.readdir(userDataPath, { recursive: true })
	
		_.each(dataFilepaths, (filepath) => {
			const rawData = fs.readFileSync(path.join(userDataPath, filepath), "utf-8")
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

    const contentPath = getJoinedPath(PATHS.CONTENT)

	if (fs.existsSync(contentPath)) {
		const contentFilepaths = await fs.promises.readdir(contentPath, { recursive: true })
		let mdPaths = contentFilepaths.filter((item) => { return path.extname(item) == '.md' })
	
		mdPaths.forEach((item) => {
			data = updateMetadata(path.join(contentPath, item), data)
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
			.filter((v) => { return path.dirname(v.path) == getJoinedPath(PATHS.POSTS) })
			.sortBy((v) => { return v.date * (data.site.sortPostsAscending ? 1 : -1) })
			.value()

		data.site.snippets = _.chain(data.pages)
			.filter((v) => { return path.dirname(v.path) == getJoinedPath(PATHS.SNIPPETS) })
			.map((v) => {
				const key = path.basename(v.path, '.md')
				return [key, v.content]
			})
			.fromPairs()
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
	}

	// copy static pages
	fs.cp(getJoinedPath(PATHS.STATIC), getJoinedPath(PATHS.OUTPUT), { recursive: true }, (err) => { if (err) { console.log(err) } })

	fs.writeFileSync(
		path.join(getJoinedPath(PATHS.OUTPUT), 'feed.xml'),
		rssFeed.rss2()
	);

	try {
		if (data.site.integrations?.bskyUserId) {
			const wellKnownPath = path.join(getJoinedPath(PATHS.OUTPUT), '.well-known')
	
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

export async function watch() {
	if (watcher) {
		await watcher.close()
	}

	watcher = chokidar.watch(projects.getActive().rootPath, {
		ignored: (filePath) => {
			return getJoinedPath(PATHS.OUTPUT) == path.normalize(filePath) || ['.git', '.gitignore', '.DS_Store'].includes(path.basename(filePath))
		},
		ignoreInitial: true
	}).on('all', (event, changedPath) => {
		console.log(event, changedPath)
		build()

		if ([config.CONFIG_FILENAME, config.SECRETS_FILENAME].includes(path.basename(changedPath))) {
			loadProject(conf.get('activeIndex'))
		}
	})

	if (server) {
		server.close()
	}

	server = await createServer({
		configFile: false,
		root: getJoinedPath(PATHS.OUTPUT),
		publicDir: false,
		logLevel: 'silent',
		server: {
			port: 6969,
			strictPort: true
		}
	})
	await server.listen()
	log(`monitoring ${projects.getActive().rootPath} for changes`)

	build()
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
		'url': filepath.replace(getJoinedPath(PATHS.CONTENT), '').replace('.md', '.html'),
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

		let templatePath = path.join(getJoinedPath(PATHS.TEMPLATES), page.template)

		// get html template
		if (!fs.existsSync(templatePath)) {
			console.warn("couldn't find template, using default")
			page.template = 'default.html'
			templatePath = path.join(getJoinedPath(PATHS.TEMPLATES), 'default.html')
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
			fs.mkdirSync(path.join(getJoinedPath(PATHS.OUTPUT), outputDir), { recursive: true })
		}

		fs.writeFileSync(
			path.join(getJoinedPath(PATHS.OUTPUT), outputPath),
			htmlOutput
		);

		return outputPath
	})
}