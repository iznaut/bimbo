import * as fs from 'node:fs'
import * as path from 'path'
import * as yaml from 'yaml'
import markdownit from 'markdown-it'
import fm from 'front-matter'
import Handlebars from "handlebars"

// load site config data
let data = yaml.parse(
	fs.readFileSync("bimbo.yaml", "utf-8")
)
let pageLookup = {}

// Register Partials
var partialsDir = 'templates/partials';
var filenames = fs.readdirSync(partialsDir);

filenames.forEach(function (filename) {
	var matches = /^([^.]+).hbs$/.exec(filename);
	if (!matches) {
		return;
	}
	var name = matches[1];
	var template = fs.readFileSync(path.join(partialsDir, filename), 'utf8');
	Handlebars.registerPartial(name, template);
});

fs.rmSync(data.config.buildDir, { recursive: true, force: true });
fs.mkdirSync(data.config.buildDir)

// build content pages
processDir('content', updateConfig)
processDir('content', buildPage)

// copy static pages
fs.cp('static', data.config.buildDir, { recursive: true }, (err) => { console.log(err) })

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

function updateConfig(filepath) {
	let frontMatter = fm(
		fs.readFileSync(filepath, "utf-8")
	)

	const md = markdownit()

	const fmDefaults = getContentDefaults(path.dirname(filepath))

	frontMatter.attributes = { ...fmDefaults, ...frontMatter.attributes }

	// add content front matter and markdown
	let pageData = {
		'url': filepath.replace('content', '').replace('.md', '.html'),
		'content': md.render(frontMatter.body)
	}
	for (let key in frontMatter.attributes) {
		pageData[key] = frontMatter.attributes[key]
	}

	if (pageData.draft) {
		console.log(`skipping ${filepath} (draft)`)
		return
	}

	if (pageData.showOnNavbar) {
		if (!data.site.navLinks) {
			data.site.navLinks = {}
		}
		data.site.navLinks[pageData.title] = pageData.url
	}

	pageLookup[filepath] = pageData
}

function buildPage(filepath) {
	data.page = pageLookup[filepath]

	// get html template
	let templateFile = data.page.template || 'index.html'
	let htmlOutput = fs.readFileSync(path.join('templates', templateFile), "utf-8")

	// compile html template
	let htmlTemplate = Handlebars.compile(htmlOutput)
	htmlOutput = htmlTemplate(data)

	let outputPath = data.page.url

	fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf("/")), { recursive: true }, (err) => {
		if (err) throw err;
	});

	const targetPath = path.parse(outputPath).dir
	fs.mkdirSync(path.join(data.config.buildDir, targetPath), { recursive: true })

	fs.writeFileSync(
		path.join(data.config.buildDir, outputPath),
		htmlOutput
	);

	return outputPath
}
