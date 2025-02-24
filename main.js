#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItHighlightjs from 'markdown-it-highlightjs'
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import _ from 'underscore'
import live from 'alive-server'
import extract from 'extract-zip'
import { Feed } from 'feed'
import * as cheerio from 'cheerio'
import * as feather from 'feather-icons'

const paths = {
	"content": "content",
	"posts": "content/posts",
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

let startPath = path.dirname(process.argv[1])

// if running from binary, use exec path
if (startPath == '/$bunfs/root') {
	startPath = path.dirname(process.execPath)
}

const pathArgIndex = _.indexOf(process.argv, '--path') + 1

if (pathArgIndex) {
	process.chdir(startPath)
	process.chdir(process.argv[pathArgIndex])
}
else {
	process.chdir(path.dirname(startPath))
}

let watchData

watch()

// switch(process.argv[2]) {
// 	case '--init':
// 		init()
// 		break
// 	case '--build':
// 		build()
// 		break
// 	case '--watch':
// 		watch()
// 		break
// 	default:
// 		watch()
// 		break
// }

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
		await init()
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

	if (fs.existsSync(paths.build)) {
		fs.rmSync(paths.build, { recursive: true, force: true });
	}
	fs.mkdirSync(paths.build)

	rssFeed = new Feed({
		title: data.site.title,
		description: data.site.description,
		id: data.site.authorUrl,
		link: data.site.authorUrl,
		author: {
			name: data.site.authorName,
			email: data.site.authorEmail,
			link: data.site.authorUrl
		}
	})

	const allPaths = await fs.promises.readdir(paths.content, { recursive: true })
	let mdPaths = allPaths.filter((item) => { return path.extname(item) == '.md' })

	mdPaths.forEach((item) => {
		data = updateMetadata(path.join(paths.content, item), data)
	})

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
	fs.cp(paths.static, paths.build, { recursive: true }, (err) => { console.log(err) })

	fs.writeFileSync(
		path.join(paths.build, 'feed.xml'),
		rssFeed.rss2()
	);

	if (data.site.integrations.bskyUserId) {
		const wellKnownPath = path.join(paths.build, '.well-known')

		fs.mkdirSync(wellKnownPath)
		fs.writeFileSync(
			path.join(wellKnownPath, 'atproto-did'),
			`did:plc:${data.site.integrations.bskyUserId}`
		)
	}

	process.watchData = data
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
	let frontMatter = fm(
		fs.readFileSync(filepath, "utf-8")
	)

	const md = markdownit({
		html: true
	})
		.use(markdownItFootnote)
		.use(markdownItHighlightjs)

	frontMatter.attributes = {
		...data.contentDefaults, // global defaults
		...getContentDefaults(path.dirname(filepath)), // local defaults
		...frontMatter.attributes
	}

	let page = {
		'path': filepath,
		'url': filepath.replace(paths.content, '').replace('.md', '.html'),
		'content': md.render(frontMatter.body)
	}
	for (let key in frontMatter.attributes) {
		page[key] = frontMatter.attributes[key]
	}

	if (page.draft) {
		console.log(`skipping ${filepath} (draft)`)
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

	if (page.includeInRSS) {
		rssFeed.addItem({
			title: page.title,
			description: page.description || $('p').html(),
			url: path.join(data.site.authorUrl, page.url),
			date: page.date,
			content: page.content
		})
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

		// get html template
		let htmlOutput = fs.readFileSync(path.join(paths.templates, page.template), "utf-8")

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
		console.log('rebuilding...')
		await build()
	})
}

// function upload() {
// 	let formData = new FormData()
// 	request
// }