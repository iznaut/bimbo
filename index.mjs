import * as fs from 'node:fs'
import * as path from 'path'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import fm from 'front-matter'
import Handlebars from "handlebars"
import moment from 'moment'
import _ from 'underscore'

// load site config data
let bimbo = yaml.parse(
	fs.readFileSync("bimbo.yaml", "utf-8")
)
bimbo.pageData = []

// register Handlebars partials
const partials = fs.readdirSync(bimbo.paths.partials);

partials.forEach(function (filename) {
	var matches = /^([^.]+).hbs$/.exec(filename);
	if (!matches) {
		return;
	}
	var name = matches[1];
	var template = fs.readFileSync(path.join(bimbo.paths.partials, filename), 'utf8');
	Handlebars.registerPartial(name, template);
});

// TODO make separate js for handlebars helpers
Handlebars.registerHelper('date', function(date, formatStr) {
	return moment(date).utc().format(formatStr)
})

// TODO - show post-list on index if archive page?
// Handlebars.registerHelper('whichPartial', function (context, options) {
// 	console.log(context) 
// 	return 'dynamicPartial'
// });

fs.rmSync(bimbo.paths.build, { recursive: true, force: true });
fs.mkdirSync(bimbo.paths.build)

// build content pages
await processDir(bimbo.paths.content, buildMeta)

bimbo.site.navPages = _.chain(bimbo.pageData)
	.pick((v) => { return v.navPosition })
	.sortBy((v) => { return v.navPosition })
	.value()

// TODO - sort options
bimbo.site.blogPosts = _.chain(bimbo.pageData)
	.filter((v) => { return path.dirname(v.path) == bimbo.paths.posts })
	.sortBy((v) => { return -v.date })
	.value()

_.each(bimbo.site.blogPosts, (v, i) => {
	if (i - 1 > -1) {
		bimbo.site.blogPosts[i].postNext = bimbo.site.blogPosts[i - 1]
	}
	if (i + 1 < bimbo.site.blogPosts.length) {
		bimbo.site.blogPosts[i].postPrev = bimbo.site.blogPosts[i + 1]
	}


})

bimbo.pageData

generatePages(bimbo.pageData)

// copy static pages
fs.cp(bimbo.paths.static, bimbo.paths.build, { recursive: true }, (err) => { console.log(err) })

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
	}) 

	frontMatter.attributes = {
		...bimbo.contentDefaults, // global defaults
		...getContentDefaults(path.dirname(filepath)), // local defaults
		...frontMatter.attributes
	}

	let page = {
		'path': filepath,
		'url': filepath.replace(bimbo.paths.content, '').replace('.md', '.html'),
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

	bimbo.pageData.push(page)
}

function generatePages(pageData) {
	_.each(pageData, (page) => {
		let currentPageData = page
		page.site = bimbo.site
	
		// get html template
		let htmlOutput = fs.readFileSync(path.join(bimbo.paths.templates, currentPageData.template), "utf-8")
	
		// compile html template
		let htmlTemplate = Handlebars.compile(htmlOutput)
		htmlOutput = htmlTemplate(currentPageData)
	
		let outputPath = currentPageData.url
	
		fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf("/")), { recursive: true }, (err) => {
			if (err) throw err;
		});
	
		const targetPath = path.parse(outputPath).dir
		fs.mkdirSync(path.join(bimbo.paths.build, targetPath), { recursive: true })
	
		fs.writeFileSync(
			path.join(bimbo.paths.build, outputPath),
			htmlOutput
		);
	
		return outputPath
	})


}
