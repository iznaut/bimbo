import * as fs from 'node:fs'
import * as path from 'path'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import footnote_plugin from 'markdown-it-footnote'
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import _ from 'underscore'

const paths = {
	content: 'content',
	posts: 'content/posts',
	templates: 'templates',
	partials: 'templates/partials',
	static: 'static',
	build: 'public'
}

// load site config data
let data = yaml.parse(
	fs.readFileSync("bimbo.yaml", "utf-8")
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

// TODO - show post-list on index if archive page?
// Handlebars.registerHelper('whichPartial', function (context, options) {
// 	console.log(context) 
// 	return 'dynamicPartial'
// });

fs.rmSync(paths.build, { recursive: true, force: true });
fs.mkdirSync(paths.build)

// build content pages
await processDir(paths.content, buildMeta)

data.site.navPages = _.chain(data.pages)
	.pick((v) => { return v.navIndex })
	.sortBy((v) => { return v.navIndex })
	.value()

// TODO - sort options
data.site.blogPosts = _.chain(data.pages)
	.filter((v) => { return path.dirname(v.path) == paths.posts })
	.sortBy((v) => { return -v.date })
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

generatePages()

// copy static pages
fs.cp(paths.static, paths.build, { recursive: true }, (err) => { console.log(err) })

async function processDir(dir, func) {
	const allPaths = await fs.promises.readdir(dir, { recursive: true })

	let mdPaths = allPaths.filter((item) => { return path.extname(item) == '.md' })

	mdPaths.forEach((item) => {
		func(path.join(dir, item))
	})
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

function buildMeta(filepath) {
	let frontMatter = fm(
		fs.readFileSync(filepath, "utf-8")
	)

	const md = markdownit({
		html: true
	}).use(footnote_plugin)

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
		return
	}

	// use filename as title if not defined 
	if (!page.title) {
		page.title = path.basename(filepath, '.md')
	}

	data.pages.push(page)
}

function generatePages() {
	_.each(data.pages, (page) => {
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