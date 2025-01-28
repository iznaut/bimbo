import * as fs from 'node:fs'
import * as toml from 'toml'
import markdownit from 'markdown-it'
import fm from 'front-matter'
import Handlebars from "handlebars";

const tomlSource = fs.readFileSync("config.toml", "utf-8")
const mdSource = fs.readFileSync("content/index.md", "utf-8")
const fmSource = fm(mdSource)
const md = markdownit()

// get html template
let htmlOutput = fs.readFileSync("templates/index.html", "utf-8")
// load site config data
let data = toml.parse(tomlSource)
// add markdown content
data.page = {}
data.page.markdown = mdSource

const htmlTemplate = Handlebars.compile(htmlOutput)
const mdTemplate = Handlebars.compile(data.page.markdown)

htmlTemplate(data)


fs.writeFileSync(
	'build/test.html',
	template(data)
);
