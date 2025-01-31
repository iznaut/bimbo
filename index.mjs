import * as fs from 'node:fs'
import * as path from 'path'
import * as toml from 'toml'
import markdownit from 'markdown-it'
import fm from 'front-matter'
import Handlebars from "handlebars";

// load site config data
const config = fs.readFileSync("config.toml", "utf-8")
let data = toml.parse(config)
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

// build content pages
processDir('content', updateConfig)
processDir('content', buildPage)

// copy static pages to /build
fs.cp('static', 'build', { recursive: true }, (err) => { console.log(err) })

async function processDir(dir, func) {
	const allPaths = await fs.promises.readdir(dir, {recursive:true})
	
	allPaths.forEach((item) => {
		if (!item.includes('.')) {
			return
		}

		func(path.join(dir, item))
	})

}

function updateConfig(filepath) {
	const mdSource = fm(
		fs.readFileSync(filepath, "utf-8")
	)

	const md = markdownit()

	// add content front matter and markdown
	let pageData = {
		'url': filepath.replace('content', 'build').replace('.md', '.html'),
		'content': md.render(mdSource.body)
	}
	for (let key in mdSource.attributes) {
		pageData[key] = mdSource.attributes[key]
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
	// get html template
	let templateFile = 'index'
	const pathSplit = path.dirname(filepath).split(path.sep)
	if (pathSplit.length > 1) {
		templateFile = pathSplit[pathSplit.length - 1]
	}
	let htmlOutput = fs.readFileSync(`templates/${templateFile}.html`, "utf-8")

	data.page = pageLookup[filepath]

	// compile html template
	let htmlTemplate = Handlebars.compile(htmlOutput)
	htmlOutput = htmlTemplate(data)

	let outputPath = data.page.url

	fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf("/")), { recursive: true }, (err) => {
		if (err) throw err;
	});

	const targetPath = path.parse(outputPath).dir
	fs.mkdirSync(targetPath, {recursive: true})

	fs.writeFileSync(
		outputPath,
		htmlOutput
	);

	return outputPath
}
