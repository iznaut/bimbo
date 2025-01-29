import * as fs from 'node:fs'
import * as toml from 'toml'
import markdownit from 'markdown-it'
import fm from 'front-matter'
import Handlebars from "handlebars";

const config = fs.readFileSync("config.toml", "utf-8")

// Register Partials
var partialsDir = 'templates/partials';
var filenames = fs.readdirSync(partialsDir);

filenames.forEach(function (filename) {
	var matches = /^([^.]+).hbs$/.exec(filename);
	if (!matches) {
		return;
	}
	var name = matches[1];
	var template = fs.readFileSync(partialsDir + '/' + filename, 'utf8');
	Handlebars.registerPartial(name, template);
});

// processDir('templates/partials', registerPartial)
// build content pages
processDir('content', buildPage)

// copy static pages to /build
fs.cp('static', 'build', { recursive: true }, (err) => { console.log(err) })

async function processDir(dir, func) {
	const allPaths = await fs.promises.readdir(dir, {recursive:true})
	const filenames = allPaths.filter(file => dirent.isFile(file))
	
	filenames.forEach((file) => {
			func(`${dir}/${file}`)
			console.log(file)
		})

}

function getBaseName(filename) {
	const split = filename.split('.')
	return path.basename(filename, `.${split[split.length - 1]}`)
}

function registerPartial(filepath) {
	Handlebars.registerPartial(getBaseName(filepath), fs.readFileSync(filepath))
}

function buildPage(filepath) {
	const pageName = getBaseName(filepath)
	const mdSource = fm(
		fs.readFileSync(filepath, "utf-8")
	)

	const md = markdownit()

	// get html template
	let htmlOutput = fs.readFileSync("templates/index.html", "utf-8")
	// load site config data
	let data = toml.parse(config)
	// add content front matter and markdown
	data.page = {
		'mdContent': md.render(mdSource.body)
	}
	for (let key in mdSource.attributes) {
		data.page[key] = mdSource.attributes[key]
	}

	if (data.page.draft) {
		console.log(`skipping ${filepath} (draft)`)
		return
	}

	// compile html template
	let htmlTemplate = Handlebars.compile(htmlOutput)
	htmlOutput = htmlTemplate(data)
	// do it AGAIN for the markdown
	htmlTemplate = Handlebars.compile(htmlOutput)
	htmlOutput = htmlTemplate(data)

	const outputPath = `build/${pageName}.html`

	fs.writeFileSync(
		outputPath,
		htmlOutput
	);

	return outputPath
}
