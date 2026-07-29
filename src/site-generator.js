import * as path from "node:path"
import * as fs from "node:fs"
import _ from "lodash"
import { parse as yamlParse } from "yaml"
import markdownit from "markdown-it" // TODO move md/fm/handlebars stuff into shared file
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
import { readingTime } from "reading-time-estimator"

import { activeProject } from "./index.js"
import { APP_SETTINGS, showMessageBox } from "./app/electron.js" // TODO eliminate
import config from "./config/config.js"
import strings from "./config/strings.js" // TODO export separate categories? (e.g. {generator} from strings)
import {
    queuePost,
    setupDomainVerification,
    arePostsQueued,
    submitQueuedPosts,
    resolveHandle,
} from "./bluesky/main.js"

let server
let watcher

let buildData

export async function build(isPostDeploy = false) {
    logger.info(strings.generator.buildStart(isPostDeploy))

    const PROJECT_PATHS = activeProject.paths

    buildData = { _pages: [] }

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
        return moment(date).utc().format(buildData.site.dateFormat) // TODO point to validator
    })

    Handlebars.registerHelper("getIcon", function (name, options) {
        let icon = feather.icons[name]
        icon.attrs = { ...icon.attrs, ...options.hash }
        return icon.toSvg()
    })

    // TODO maybe get rid of this
    Handlebars.registerHelper("useFirstValid", function () {
        const valid = _.filter(arguments, (arg) => {
            return _.isString(arg)
        })

        return valid[0]
    })

    Handlebars.registerHelper("logInBrowser", function (obj) {
        return `<script>console.log(${JSON.stringify(obj)})</script>`
    })

    Handlebars.registerHelper(
        "isCollectionSortAscending",
        function (name, key) {
            const SORTS = _.find(
                activeProject.collections_meta,
                (v) => v.name == name,
            ).sort

            const ORDER = _.find(SORTS, (v) => v.key == key).order

            return ORDER == "ascending"
        },
    )

    // delete previous build
    if (fs.existsSync(PROJECT_PATHS.OUTPUT)) {
        fs.rmSync(PROJECT_PATHS.OUTPUT, { recursive: true, force: true })
    }
    fs.mkdirSync(PROJECT_PATHS.OUTPUT)

    buildData._data = {}

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
                buildData._data[dataName] = JSON.parse(rawData)
            }
            if (path.extname(filepath) == ".yaml") {
                buildData._data[dataName] = yamlParse(rawData)
            }
            if (path.extname(filepath) == ".txt") {
                buildData._data[dataName] = rawData.split("\n")
            }
        })
    }

    // quit if content folder is missing
    if (!fs.existsSync(PROJECT_PATHS.CONTENT)) {
        showMessageBox(strings.generator.missingContentFolder) // return error (to app or main)
        return
    }

    const CONTENT_FILEPATHS = await fs.promises.readdir(PROJECT_PATHS.CONTENT, {
        recursive: true,
    })

    _.chain(CONTENT_FILEPATHS)
        .filter((item) => {
            return path.extname(item) == config.CONTENT_EXTENSION
        })
        .each((mdFilepath) => {
            const PAGE_META = getPageData(mdFilepath)

            if (PAGE_META) {
                buildData._pages.push(PAGE_META)
            }
        })
        .value()

    if (isPostDeploy && arePostsQueued()) {
        await processBlueskyPosts()
    }

    buildData.collections = {}

    _.each(activeProject.collections_meta, (ruleset) => {
        const NAME = config.PAGE_GROUP_PREFIX + ruleset.name
        const FILTERS = ruleset.filter
        const SORTS = ruleset.sort
        const GROUPS = ruleset.group

        buildData.collections[NAME] = buildData._pages

        _.each(FILTERS, (f) => {
            const FILTER_KEY = f.key
            const FILTER_VALUE = f.value

            if (FILTER_VALUE) {
                buildData.collections[NAME] = _.filter(
                    buildData.collections[NAME],
                    (v) => v[FILTER_KEY] == FILTER_VALUE,
                )
            } else {
                buildData.collections[NAME] = _.filter(
                    buildData.collections[NAME],
                    (v) => v[FILTER_KEY],
                )
            }
        })

        _.each(SORTS, (s) => {
            buildData.collections[NAME] = _.sortBy(
                buildData.collections[NAME],
                (v) => v[s.key],
            )

            if (s.order == "descending") {
                buildData.collections[NAME] = _.reverse(
                    buildData.collections[NAME],
                )
            }
        })

        _.each(GROUPS, (g) => {
            const GROUP_VALUES = _.chain(buildData.collections[NAME])
                .flatMap((v) => v[g.key])
                .compact()
                .uniq()
                .value()

            let pageGroups = {}

            _.each(GROUP_VALUES, (v) => {
                pageGroups[v] = _.filter(buildData.collections[NAME], (p) => {
                    const PAGE_VALUE = p[g.key]

                    if (!PAGE_VALUE) {
                        return
                    }

                    if (Array.isArray(PAGE_VALUE)) {
                        return PAGE_VALUE.includes(v)
                    } else {
                        return PAGE_VALUE == v
                    }
                })
            })

            buildData.collections[NAME] = pageGroups
        })

        // TODO this doesn't work right for groups
        _.each(buildData.collections[NAME], (v, i) => {
            if (i - 1 > -1) {
                buildData.collections[NAME][i]._nextPage = structuredClone(
                    buildData.collections[NAME][i - 1],
                )
            }
            if (i + 1 < buildData.collections[NAME].length) {
                buildData.collections[NAME][i]._previousPage = structuredClone(
                    buildData.collections[NAME][i + 1],
                )
            }
        })
    })

    // TODO do something with snippets idk
    // buildData.site.snippets = _.chain(buildData._pages)
    //     .filter((v) => {
    //         return path.dirname(v.path) == PROJECT_PATHS.SNIPPETS
    //     })
    //     .map((v) => {
    //         const key = path.basename(v.path, ".md")
    //         return [key, v.content]
    //     })
    //     .fromPairs()
    //     .value()

    _.each(buildData._pages, (pageMeta) => {
        generatePage(pageMeta)
    })

    const RSS_GROUP_NAME = _.find(
        activeProject.collections_meta,
        (g) => g.rss,
    ).name

    if (RSS_GROUP_NAME) {
        generateRssFeed(config.PAGE_GROUP_PREFIX + RSS_GROUP_NAME)
    }

    // copy static pages
    fs.cp(
        PROJECT_PATHS.STATIC,
        path.join(PROJECT_PATHS.OUTPUT, config.PROJECT_PATHS.STATIC),
        { recursive: true },
        (err) => {
            if (err) {
                logger.error(err)
            }
        },
    )

    const bskyHandle = buildData.integrations?.bluesky?.handle
    let bskyUserId = buildData.integrations?.bluesky?.userId

    if (bskyHandle) {
        // TODO never exists bc _site gets wiped every build
        // if (!fs.existsSync(path.join(getJoinedPath(config.PROJECT_PATHS.OUTPUT), '.well-known/atproto-did'))) {
        //     try {
        //         setupDomainVerification(bskyHandle, getJoinedPath(config.PROJECT_PATHS.OUTPUT))
        //     } catch (err) {
        //         logger.warn(
        //             strings.generator.bsky.domainVerification.fail(bskyHandle),
        //         )
        //         logger.warn(err)
        //     }
        // }
    }

    logger.info(strings.generator.buildComplete(isPostDeploy))

    // TODO this is autoOpenPreview now and probably goes elsewhere
    // if (APP_SETTINGS.get("settings.openPreviewOnChange")) {
    //     openBrowserPreview()
    // }
}

let lastProjectMeta

// TODO move watch into main
export async function watch(initialBuild = false) {
    if (watcher) {
        await watcher.close()
    }
    if (server) {
        await server.close()
    }

    if (activeProject) {
        const PROJECT_PATHS = activeProject.paths
        lastProjectMeta = activeProject.config

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

                if (
                    path.basename(changedPath) ==
                        config.PROJECT_PATHS.SECRETS_FILE &&
                    _.isEqual(activeProject.config, lastProjectMeta)
                ) {
                    return
                }

                lastProjectMeta = activeProject.config // TODO move this into build?
                build()
            })

        logger.info(strings.generator.monitoring(PROJECT_PATHS.ROOT))

        server = await createServer({
            configFile: false,
            root: activeProject.paths.OUTPUT,
            publicDir: false,
            logLevel: "silent",
            server: {
                port: config.VITE_PORT,
                strictPort: true,
            },
        })
        await server.listen()
        logger.info(strings.app.server(config.VITE_PORT))

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

function getPageData(contentFilepath) {
    const PROJECT_PATHS = activeProject.paths
    const ABSOLUTE_FILEPATH = path.join(PROJECT_PATHS.CONTENT, contentFilepath)
    const FRONT_MATTER = fm(fs.readFileSync(ABSOLUTE_FILEPATH, "utf-8"))

    let pageMeta = {
        _filepath: ABSOLUTE_FILEPATH,
        _subfolder: path.dirname(contentFilepath),
        _relativeUrl:
            "/" +
            contentFilepath.replace(
                config.CONTENT_EXTENSION,
                config.PAGE_EXTENSION,
            ),
        _mdContent: FRONT_MATTER,
        // _content added in generatePage()
    }

    const CONTENT_DEFAULTS = _.omit(activeProject.defaults_meta, "subfolders")
    const SUBFOLDER_DEFAULTS =
        activeProject.defaults_meta.subfolders[pageMeta._subfolder] || {}

    _.merge(
        pageMeta, // base object with generated values
        CONTENT_DEFAULTS, // project-wide default values
        SUBFOLDER_DEFAULTS, // subfolder-specific default values
        FRONT_MATTER.attributes, // page-specific values
    )

    pageMeta.readingTime = readingTime(FRONT_MATTER.body).text

    // TODO validators
    if (pageMeta.draft) {
        logger.info(strings.generator.skipDraft(contentFilepath))
        return
    }

    // use filename as title if not defined
    if (!pageMeta.title) {
        pageMeta.title = path.basename(
            contentFilepath,
            config.CONTENT_EXTENSION,
        )
    }

    if (pageMeta.redirect) {
        pageMeta._relativeUrl = pageMeta.redirect
    }

    // const $ = cheerio.load(pageMeta._content)

    // if (!pageMeta.description) {
    //     // TODO make this smarter
    //     pageMeta.description = $("p").html()
    // }

    // let firstImgUrl = $("img").prop("src")

    // TODO figure this junk out
    // if (!pageMeta.headerImage) {
    //     pageMeta.headerImage = firstImgUrl || buildData.site.headerImage
    // }

    // pageMeta.headerImageLocal = pageMeta.headerImage

    // if (pageMeta.headerImage && path.parse(pageMeta.headerImage).root == "/") {
    //     pageMeta.headerImage = new URL(
    //         pageMeta.headerImage,
    //         "https://" + buildData.site.url,
    //     ).href
    // }

    return pageMeta
}

function generatePage(pageMeta) {
    const PROJECT_PATHS = activeProject.paths

    if (pageMeta.redirect) {
        return
    }

    const MD = markdownit({
        html: true,
    })
        .use(markdownItFootnote)
        .use(markdownItHighlightjs)
        .use(attrs)
        .use(imgSize)

    // render markdown to html
    pageMeta._content = MD.render(pageMeta._mdContent.body)
    // add globals and groups to page
    pageMeta.globals = activeProject.globals_meta
    _.assign(pageMeta, buildData.collections) // TODO not sure if still works?
    // add full project meta
    pageMeta._project_meta = activeProject.config // TODO _project_config?

    let templatePath = path.join(PROJECT_PATHS.TEMPLATES, pageMeta.template)

    // get html template
    if (!fs.existsSync(templatePath)) {
        logger.warn(strings.generator.missingTemplate)
        pageMeta.template = "default.hbs"
        templatePath = path.join(PROJECT_PATHS.TEMPLATES, pageMeta.template) // TODO hardcode this? require it in yaml?
    }
    let htmlOutput = fs.readFileSync(templatePath, "utf-8")
    const HANDLEBARS_TEMPLATE = Handlebars.compile(htmlOutput)

    try {
        htmlOutput = HANDLEBARS_TEMPLATE(pageMeta)
    } catch (error) {
        logger.error(strings.generator.compileFail(pageMeta.template))
        logger.error(error.message)
        let encodedError = error.message.replace(
            /[\u00A0-\u9999<>\&]/gim,
            function (i) {
                return "&#" + i.charCodeAt(0) + ";"
            },
        )
        htmlOutput = "<pre>" + encodedError + "</pre>"
    }

    let htmlFilename = pageMeta._relativeUrl
    let outputDir = path.dirname(htmlFilename)

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(path.join(PROJECT_PATHS.OUTPUT, outputDir), {
            recursive: true,
        })
    }

    fs.writeFileSync(path.join(PROJECT_PATHS.OUTPUT, htmlFilename), htmlOutput)

    // queue bluesky post for after deploy
    if (
        APP_SETTINGS.get("settings.bskyAutoPost") &&
        pageMeta.bskyPostId == "tbd"
    ) {
        queuePost(pageMeta)
    }
}

async function processBlueskyPosts() {
    await pauseWatcher()
    const { userId } = activeProject.secrets.integrations.bluesky
    const SKEETS_DATA = await submitQueuedPosts()

    let index = 0

    // TODO test
    _.each(SKEETS_DATA, ({ id }, filepath) => {
        const PAGE_INDEX = _.findIndex(
            buildData._pages,
            (page) => page._filepath == filepath,
        )
        const PAGE_META = buildData._pages[PAGE_INDEX]

        buildData._pages[PAGE_INDEX].bskyPostId = id

        fs.writeFileSync(
            PAGE_META._filepath,
            PAGE_META._mdContent.replace(
                "bskyPostId: tbd",
                `bskyPostId: ${id}`,
            ),
        )

        logger.info(
            strings.generator.bsky.postSuccess(
                `https://bsky.app/profile/${userId}/post/${id}`,
            ),
        )

        index++
    })
}

function generateRssFeed(groupName) {
    const PROJECT_GLOBALS = activeProject.globals_meta

    const RSS_FEED = new Feed({
        title: PROJECT_GLOBALS.title,
        description: PROJECT_GLOBALS.description,
        id: PROJECT_GLOBALS.url, // TODO dynamic url get?
        link: PROJECT_GLOBALS.url, // TODO dynamic url get?
        author: {
            // TODO support for multiple authors
            name: PROJECT_GLOBALS.author.name,
            email: PROJECT_GLOBALS.author.email,
            link: PROJECT_GLOBALS.author.url,
        },
    })

    _.each(buildData.collections[groupName], (pageMeta) => {
        if (!pageMeta.excludeFromRss) {
            try {
                RSS_FEED.addItem({
                    title: pageMeta.title,
                    description: pageMeta.description,
                    id: pageMeta._relativeUrl,
                    link: pageMeta._relativeUrl,
                    date: pageMeta.date,
                    content: pageMeta._content,
                    author: {
                        // TODO support for multiple authors
                        name: PROJECT_GLOBALS.author.name,
                        email: PROJECT_GLOBALS.author.email,
                        link: PROJECT_GLOBALS.author.url,
                    },
                })
            } catch (err) {
                logger.info(strings.generator.rssFail)
                logger.info(err)
            }
        }
    })

    fs.writeFileSync(
        path.join(activeProject.paths.OUTPUT, "feed.xml"),
        RSS_FEED.rss2(),
    )
}
