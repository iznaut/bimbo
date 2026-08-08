import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join as joinPath } from "node:path"

import Handlebars from "handlebars"
import fm from "front-matter"
import markdownit from "markdown-it"
import markdownItFootnote from "markdown-it-footnote"
import markdownItHighlightjs from "markdown-it-highlightjs"
import { attrs } from "@mdit/plugin-attrs"
import { imgSize } from "@mdit/plugin-img-size"

import electronHelpers from "./handlebars/electron-helpers.js"
import siteHelpers from "./handlebars/site-helpers.js"

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

export function renderMdToHtml(mdBody) {
    return MD.render(mdBody)
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
    data,
    partialsPath,
    isInternalUse = false,
) {
    const HANDLEBARS_HELPERS = isInternalUse ? electronHelpers : siteHelpers
    const HANDLEBARS_PARTIALS = getHandlebarsHelpersFromPath(partialsPath)
    

    try {
        return compileHandlebarsTemplate(
            templateFilepath,
            data,
            HANDLEBARS_HELPERS,
            HANDLEBARS_PARTIALS,
        )
    } catch (error) {
        // TODO move compile fail message?
        // logger.error(strings.generator.compileFail(pageMeta.template))
        logger.error(error.message)
        const ENCODED_ERROR = error.message.replace(
            /[\u00A0-\u9999<>\&]/gim,
            function (i) {
                return "&#" + i.charCodeAt(0) + ";"
            },
        )
        return `<pre>${ENCODED_ERROR}</pre>`
    }
}
