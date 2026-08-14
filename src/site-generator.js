import * as path from "node:path"
import * as fs from "node:fs"

import _ from "lodash"
import { parse as yamlParse } from "yaml"
import moment from "moment"
import { Feed } from "feed"
import * as cheerio from "cheerio"
import * as feather from "feather-icons"
import { createServer } from "vite"
import chokidar from "chokidar"
import { readingTime } from "reading-time-estimator"

import { activeProject } from "./index.js"
import config from "./config/index.js"
import strings from "./config/strings.js" // TODO export separate categories? (e.g. {generator} from strings)
import {
    queuePost,
    setupDomainVerification,
    arePostsQueued,
    submitQueuedPosts,
    resolveHandle,
} from "./bluesky/main.js"
import { compile, getFrontMatterFromFile, renderMdToHtml } from "./templater.js"

let server
let watcher

let buildData

// TODO use helper functions in templater.js
export async function build(isPostDeploy = false) {
    logger.info(strings.generator.buildStart(isPostDeploy))

    const PROJECT_PATHS = activeProject.paths

    // quit if content folder is missing
    // TODO probably other required folders to check for
    if (!fs.existsSync(PROJECT_PATHS.CONTENT)) {
        logger.info(strings.generator.missingContentFolder)
        // TODO showMessageBox() // return error (to app or main)
        return
    }

    buildData = { _pages: [], _data: {}, collections: {} }

    // delete previous build
    if (fs.existsSync(PROJECT_PATHS.OUTPUT)) {
        fs.rmSync(PROJECT_PATHS.OUTPUT, { recursive: true, force: true })
    }
    fs.mkdirSync(PROJECT_PATHS.OUTPUT)

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
            try {
                if (path.extname(filepath) == ".json") {
                    buildData._data[dataName] = JSON.parse(rawData)
                }
                if (path.extname(filepath) == ".yaml") {
                    buildData._data[dataName] = yamlParse(rawData)
                }
                if (path.extname(filepath) == ".txt") {
                    buildData._data[dataName] = rawData.split("\n")
                }
            }
            catch(e) {
                logger.warn('failed to parse data from ' + dataName) // TODO string
            }
        })
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

    // TODO move this stuff out
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
    const FRONT_MATTER = getFrontMatterFromFile(ABSOLUTE_FILEPATH)

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

    pageMeta.globals = activeProject.globals_meta
    pageMeta._content = renderMdToHtml(pageMeta._mdContent.body)
    pageMeta._project_meta = activeProject.config // TODO _project_config?
    pageMeta._data = buildData._data // TODO not sure if this is best way to do this
    _.assign(pageMeta, buildData.collections) // TODO not sure if still works?

    const TEMPLATE_FILEPATH = path.join(PROJECT_PATHS.TEMPLATES, pageMeta.template)

    // get html template
    if (!fs.existsSync(TEMPLATE_FILEPATH)) {
        logger.warn(strings.generator.missingTemplate)
        return // TODO missing template handling (skip page?)
    }

    const HTML_FILEPATH = pageMeta._relativeUrl
    const OUTPUT_PATH = path.dirname(HTML_FILEPATH)

    if (!fs.existsSync(OUTPUT_PATH)) {
        fs.mkdirSync(path.join(PROJECT_PATHS.OUTPUT, OUTPUT_PATH), {
            recursive: true,
        })
    }

    fs.writeFileSync(
        path.join(PROJECT_PATHS.OUTPUT, HTML_FILEPATH),
        compile(TEMPLATE_FILEPATH, pageMeta, PROJECT_PATHS.PARTIALS),
    )

    // TODO auto post should be project-level setting
    // queue bluesky post for after deploy
    // if (
    //     APP_SETTINGS.get("settings.bskyAutoPost") &&
    //     pageMeta.bskyPostId == "tbd"
    // ) {
    //     queuePost(pageMeta)
    // }
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
