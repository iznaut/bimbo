import * as path from "node:path"
import * as fs from "node:fs"
import _ from "lodash"
import * as yaml from "yaml"
import markdownit from "markdown-it"
import markdownItFootnote from "markdown-it-footnote"
import markdownItHighlightjs from "markdown-it-highlightjs"
import { attrs } from "@mdit/plugin-attrs"
import { imgSize } from "@mdit/plugin-img-size"
import fm from "front-matter"
import Handlebars from "handlebars"
import moment from "moment"
import { Feed } from "feed"
import * as cheerio from "cheerio"
import * as feather from "feather-icons"
import { createServer } from "vite"
import chokidar from "chokidar"
import { readingTime } from 'reading-time-estimator'

import { conf, logger, openBrowserPreview } from "./utils.js"
import projects from "./projects.js"
import config from "./config/config.js"
import strings from "./config/strings.js" // TODO export separate categories? (e.g. {generator} from strings)
import {
    queuePost,
    setupDomainVerification,
    arePostsQueued,
    submitQueuedPosts,
    resolveHandle,
} from "./integrations/bluesky/main.js"

let rssFeed

let server
let watcher

let pagesToUpdate = {}


// TODO dedupe
const PATHS = {
    CONTENT: "content",
    POSTS: "content/posts",
    SNIPPETS: "content/snippets",
    DATA: "data",
    TEMPLATES: "templates",
    PARTIALS: "templates/partials",
    STATIC: "static",
    OUTPUT: "_site",
}

export async function build(isPostDeploy = false) {
    logger.info(strings.generator.buildStart(isPostDeploy))

    const PROJECT_PATHS = projects.active.paths

    // load site config data
    let data = projects.active.getData()
    data.pages = []

    // register Handlebars partials
    if (fs.existsSync(PROJECT_PATHS.PARTIALS)) {
        const partials = fs.readdirSync(PROJECT_PATHS.PARTIALS)

        partials.forEach(function (filename) {
            var matches = /^([^.]+).hbs$/.exec(filename)
            if (!matches) {
                return
            }
            var name = matches[1]
            var template = fs.readFileSync(
                path.join(PROJECT_PATHS.PARTIALS, filename),
                "utf-8",
            )
            Handlebars.registerPartial(name, template)
        })
    }

    // TODO make separate js for handlebars helpers
    Handlebars.registerHelper("formatDate", function (date) {
        return moment(date).utc().format(data.site.dateFormat)
    })

    Handlebars.registerHelper("getIcon", function (name, options) {
        let icon = feather.icons[name]
        icon.attrs = { ...icon.attrs, ...options.hash }
        return icon.toSvg()
    })

    Handlebars.registerHelper("useFirstValid", function () {
        const valid = _.filter(arguments, (arg) => {
            return _.isString(arg)
        })

        return valid[0]
    })

    // delete previous build
    if (fs.existsSync(PROJECT_PATHS.OUTPUT)) {
        fs.rmSync(PROJECT_PATHS.OUTPUT, { recursive: true, force: true })
    }
    fs.mkdirSync(PROJECT_PATHS.OUTPUT)

    rssFeed = new Feed({
        title: data.site.title,
        description: data.site.description,
        id: data.site.authorUrl,
        link: data.site.url,
        author: {
            name: data.site.authorName,
            email: data.site.authorEmail,
            link: data.site.authorUrl,
        },
    })

    data.site.userDefined = {}

    if (fs.existsSync(PROJECT_PATHS.DATA)) {
        // TODO - find out why i'm using promise readdir sometimes
        const dataFilepaths = await fs.promises.readdir(PROJECT_PATHS.DATA, {
            recursive: true,
        })

        _.each(dataFilepaths, (filepath) => {
            const rawData = fs.readFileSync(
                path.join(PROJECT_PATHS.DATA, filepath),
                "utf-8",
            )
            const dataName = path.basename(filepath, path.extname(filepath))

            // TODO clean this up
            if (path.extname(filepath) == ".json") {
                data.site.userDefined[dataName] = JSON.parse(rawData)
            }
            if (path.extname(filepath) == ".yaml") {
                data.site.userDefined[dataName] = yaml.parse(rawData)
            }
            if (path.extname(filepath) == ".txt") {
                data.site.userDefined[dataName] = rawData.split("\n")
            }
        })
    }

    if (fs.existsSync(PROJECT_PATHS.CONTENT)) {
        const contentFilepaths = await fs.promises.readdir(
            PROJECT_PATHS.CONTENT,
            {
                recursive: true,
            },
        )
        let mdPaths = contentFilepaths.filter((item) => {
            return path.extname(item) == ".md"
        })

        mdPaths.forEach((item) => {
            data = updateMetadata(path.join(PROJECT_PATHS.CONTENT, item), data)
        })

        if (isPostDeploy && arePostsQueued()) {
            await processBlueskyPosts()
        }

        // create navigation data
        data.site.navPages = _.chain(data.pages)
            .pickBy((v) => {
                return v.navIndex
            })
            .sortBy((v) => {
                return v.navIndex
            })
            .value()

        // create blog post data
        data.site.blogPosts = _.chain(data.pages)
            .filter((v) => {
                return path.dirname(v.path) == PROJECT_PATHS.POSTS
            })
            .sortBy((v) => {
                return v.date * (data.site.sortPostsAscending ? 1 : -1)
            })
            .value()

        // do something with snippets idk
        data.site.snippets = _.chain(data.pages)
            .filter((v) => {
                return path.dirname(v.path) == PROJECT_PATHS.SNIPPETS
            })
            .map((v) => {
                const key = path.basename(v.path, ".md")
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
    fs.cp(
        PROJECT_PATHS.STATIC,
        path.join(PROJECT_PATHS.OUTPUT, PATHS.STATIC),
        { recursive: true },
        (err) => {
            if (err) {
                logger.error(err)
            }
        },
    )

    fs.writeFileSync(path.join(PROJECT_PATHS.OUTPUT, "feed.xml"), rssFeed.rss2())

    const bskyHandle = data.integrations?.bluesky?.handle
    let bskyUserId = data.integrations?.bluesky?.userId

    if (bskyHandle) {
        // TODO never exists bc _site gets wiped every build
        // if (!fs.existsSync(path.join(getJoinedPath(PATHS.OUTPUT), '.well-known/atproto-did'))) {
        //     try {
        //         setupDomainVerification(bskyHandle, getJoinedPath(PATHS.OUTPUT))
        //     } catch (err) {
        //         logger.warn(
        //             strings.generator.bsky.domainVerification.fail(bskyHandle),
        //         )
        //         logger.warn(err)
        //     }
        // }
    }

    // TODO what even is this
    process.watchData = data

    logger.info(strings.generator.buildComplete(isPostDeploy))

    // TODO this is autoOpenPreview now and probably goes elsewhere
    // if (conf.get("settings.openPreviewOnChange")) {
    //     openBrowserPreview()
    // }
}

// TODO move watch into main
export async function watch(initialBuild = false) {
    if (watcher) {
        await watcher.close()
    }

    const ACTIVE_PROJECT_DATA = projects.active.getData()
    const PROJECT_PATHS = projects.active.paths

    if (ACTIVE_PROJECT_DATA) {
        watcher = chokidar
            .watch(PROJECT_PATHS.ROOT, {
                ignored: (filePath) => {
                    return (
                        PROJECT_PATHS.OUTPUT == path.normalize(filePath) ||
                        [".git", ".gitignore", ".DS_Store"].includes(
                            path.basename(filePath),
                        ) ||
                        filePath.includes(".vscode/settings.json") // TODO read this (and .gitignore) from config const
                    )
                },
                ignoreInitial: true,
            })
            .on("all", (event, changedPath) => {
                logger.info(`${event}: ${changedPath}`)
                build()

                // TODO triggers data update - not needed anymore?
                // if (
                //     [config.CONFIG_FILENAME, config.SECRETS_FILENAME].includes(
                //         path.basename(changedPath),
                //     )
                // ) {
                //     projects.setActive()
                // }
            })

        logger.info(strings.generator.monitoring(PROJECT_PATHS.ROOT))

        if (!server) {
            server = await createServer({
                configFile: false,
                root: projects.active.paths.OUTPUT,
                publicDir: false,
                logLevel: "silent",
                server: {
                    port: config.VITE_PORT,
                    strictPort: true,
                },
            })
            await server.listen()
            logger.info(strings.app.server(config.VITE_PORT))
        }

        if (initialBuild) {
            build()
        }
    }
}

export async function pauseWatcher() {
    if (watcher) {
        logger.info(strings.app.pauseWatcher)
        await watcher.close()
        watcher = null
    }
}

function getContentDefaults(dir) {
    const defaultFilepath = path.join(dir, config.DEFAULTS_FILENAME)

    if (fs.existsSync(defaultFilepath)) {
        return yaml.parse(fs.readFileSync(defaultFilepath, "utf-8"))
    } else {
        return {}
    }
}

function updateMetadata(filepath, data) {
    const PROJECT_PATHS = projects.active.paths

    const originalMd = fs.readFileSync(filepath, "utf-8")

    let frontMatter = fm(originalMd)

    const md = markdownit({
        html: true,
    })
        .use(markdownItFootnote)
        .use(markdownItHighlightjs)
        .use(attrs)
        .use(imgSize)

    frontMatter.attributes = {
        ...data.contentDefaults, // global defaults
        ...getContentDefaults(path.dirname(filepath)), // local defaults
        ...frontMatter.attributes,
    }

    let page = {
        path: filepath,
        url: filepath.replace(PROJECT_PATHS.CONTENT, "").replace(".md", ".html"),
        content: md.render(frontMatter.body),
        md: originalMd,
    }
    for (let key in frontMatter.attributes) {
        page[key] = frontMatter.attributes[key]
    }

    page.readingTime = readingTime(frontMatter.body).text

    if (page.draft) {
        logger.info(strings.generator.skipDraft(filepath))
        return data
    }

    // use filename as title if not defined
    if (!page.title) {
        page.title = path.basename(filepath, ".md")
    }

    if (page.redirect) {
        page.url = page.redirect
    }

    const $ = cheerio.load(page.content)

    if (!page.description) {
        // TODO make this smarter
        page.description = $("p").html()
    }

    let firstImgUrl = $("img").prop("src")

    if (!page.headerImage) {
        page.headerImage = firstImgUrl || data.site.headerImage
    }

    page.headerImageLocal = page.headerImage

    if (page.headerImage && path.parse(page.headerImage).root == "/") {
        page.headerImage = new URL(
            page.headerImage,
            "https://" + data.site.url,
        ).href
    }

    if (page.includeInRSS) {
        try {
            rssFeed.addItem({
                title: page.title,
                description: page.description,
                link: page.url,
                date: page.date,
                content: page.content,
            })
        } catch (err) {
            logger.info(strings.generator.rssFail)
            logger.info(err)
        }
    }

    data.pages.push(page)

    return data
}

function generatePages(data) {
    const PROJECT_PATHS = projects.active.paths

    _.each(data.pages, (page) => {
        if (page.redirect) {
            return
        }

        page.site = data.site

        let templatePath = path.join(PROJECT_PATHS.TEMPLATES, page.template)

        // get html template
        if (!fs.existsSync(templatePath)) {
            logger.warn(strings.generator.missingTemplate)
            page.template = "default.html"
            templatePath = path.join(PROJECT_PATHS.TEMPLATES, "default.html")
        }

        let htmlOutput = fs.readFileSync(templatePath, "utf-8")

        // compile html template
        let htmlTemplate = Handlebars.compile(htmlOutput)

        try {
            htmlOutput = htmlTemplate(page)
        } catch (error) {
            logger.error(strings.generator.compileFail(page.template))
            logger.error(error.message)
            let encodedError = error.message.replace(
                /[\u00A0-\u9999<>\&]/gim,
                function (i) {
                    return "&#" + i.charCodeAt(0) + ";"
                },
            )
            htmlOutput = "<pre>" + encodedError + "</pre>"
        }

        let outputPath = page.url
        let outputDir = path.dirname(outputPath)

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(path.join(PROJECT_PATHS.OUTPUT, outputDir), {
                recursive: true,
            })
        }

        fs.writeFileSync(path.join(PROJECT_PATHS.OUTPUT, outputPath), htmlOutput)

        // queue bluesky post for after deploy
        if (conf.get("settings.bskyAutoPost") && page.bskyPostId == "tbd") {
            queuePost(page)
        }

        return outputPath
    })
}

async function processBlueskyPosts() {
    await pauseWatcher()
    const postsData = await submitQueuedPosts()

    let index = 0

    _.each(postsData, (postData, filepath) => {
        const pageIndex = _.findIndex(data.pages, (page) => {
            return page.path == filepath
        })

        const page = data.pages[pageIndex]

        data.pages[pageIndex].bskyPostId = postData.id

        fs.writeFileSync(
            page.path,
            page.md.replace(
                "bskyPostId: tbd",
                `bskyPostId: ${postData.id}`,
            ),
        )

        logger.info(
            strings.generator.bsky.postSuccess(
                `https://bsky.app/profile/${data.integrations.bluesky.userId}/post/${postData.id}`,
            ),
        )

        index++
    })
}