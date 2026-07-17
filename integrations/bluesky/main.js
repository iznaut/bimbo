import { mkdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import _ from 'lodash'
import tiny from "tiny-json-http"
import promiseAllProperties from "promise-all-properties"
import { sendBlueskyPostWithEmbed } from "./utils.ts"

import projects from "../../projects.js"
import { logger } from "../../utils.js"
import strings from "../../config/strings.js"

let queuedPosts = {}

export function arePostsQueued() {
    return Object.keys(queuedPosts).length > 0
}

export async function resolveHandle(handle) {
    let result = await tiny.get({
        url: `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
    })

    if (result.body.did) {
        return result.body.did
    } else {
        return new Error("failed to resolve Bluesky handle to valid DID")
    }
}

async function resolveUrl(url) {
    try {
        await tiny.get({url: url})
    }
    catch(err) {
        logger.error(strings.deployment.urlCheck.fail(url))
        logger.error(err)
        return false
    }

    logger.info(strings.deployment.urlCheck.success(url))
    return true
}

export async function setupDomainVerification(handle, outputPath) {
    let did

    try {
        did = await resolveHandle(handle)

        const WELL_KNOWN_PATH = join(outputPath, ".well-known")

        mkdir(WELL_KNOWN_PATH).then(() => {
            writeFile(join(WELL_KNOWN_PATH, "atproto-did"), did)

            logger.info(strings.generator.bsky.domainVerification.success(handle, did))
        }
        )
    } catch (err) {
        return err
    }
}

export function queuePost(pageData, siteUrl) {
    // TODO fix header
    // const headerImg = readFileSync('izzy.png')
    // console.log(projects.getActivePath(pageData.headerImageLocal))
    // const headerImg = readFileSync(projects.getActivePath(pageData.headerImageLocal))

    // TODO let ppl customize this
    const postMeta = [
        `new post: ${pageData.title}`,
        new URL(pageData.url, pageData.site.url).href,
        pageData.title,
        pageData.description,
        new Blob([]),
    ]

    queuedPosts[pageData.path] = postMeta
}

export async function submitQueuedPosts() { 
    let submittedPosts = {}

    for (const key in queuedPosts) {
        const post = queuedPosts[key]

        let doesRemoteUrlResolve = await resolveUrl(post[1])

        if (!doesRemoteUrlResolve) {
            logger.error(strings.deployment.bskyPostSkipped)
            delete queuedPosts[key]
        }
        else {
            submittedPosts[key] = sendBlueskyPostWithEmbed(...post)
        }
    }

    return promiseAllProperties(submittedPosts)
}