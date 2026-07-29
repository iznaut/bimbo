import markdownit from "markdown-it" // TODO move md/fm/handlebars stuff into shared file
import markdownItFootnote from "markdown-it-footnote"
import markdownItHighlightjs from "markdown-it-highlightjs"
import { attrs } from "@mdit/plugin-attrs"
import { imgSize } from "@mdit/plugin-img-size"
import fm from "front-matter"
import Handlebars from "handlebars"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import electronHelpers from "./handlebars/electron-helpers.js"
import siteHelpers from "./handlebars/site-helpers.js"
import { join as joinPath } from "node:path"

const MD = markdownit({
    html: true,
})
    .use(markdownItFootnote)
    .use(markdownItHighlightjs)
    .use(attrs)
    .use(imgSize)

export function getFrontMatterFromFile(filepath) {
    return fm(readFileSync(filepath, "utf-8"))
}

export function compileHandlebarsTemplate(
    templateFilepath,
    data,
    helpers,
    partials,
) {
    return Handlebars.compile(readFileSync(templateFilepath, "utf-8"))(data, {
        helpers: helpers,
        partials: partials,
    })
}

export function getHandlebarsHelpersFromPath(path) {
    let partials = {}

    if (existsSync(path)) {
        readdirSync(path).forEach(function (filename) {
            let matches = /^([^.]+).hbs$/.exec(filename)
            if (!matches) {
                return
            }
            let name = matches[1]
            let template = readFileSync(joinPath(path, filename), "utf-8")
            partials[name] = template
        })
    }

    return partials
}

export function compile(
    templateFilepath,
    contentFilepath,
    partialsPath,
    isInternalUse = false,
) {
    const HANDLEBARS_HELPERS = isInternalUse ? electronHelpers : siteHelpers
    const HANDLEBARS_PARTIALS = getHandlebarsHelpersFromPath(partialsPath)
    const FRONT_MATTER = getFrontMatterFromFile(contentFilepath)

    return compileHandlebarsTemplate(
        templateFilepath,
        {
            ...FRONT_MATTER.attributes,
            _content: MD.render(FRONT_MATTER.body),
        },
        HANDLEBARS_HELPERS,
        HANDLEBARS_PARTIALS,
    )
}
