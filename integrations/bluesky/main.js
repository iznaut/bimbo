import { mkdir, writeFile } from "node:fs/promises"

import { join } from "node:path"
import tiny from "tiny-json-http"
import { sendBlueskyPostWithEmbed } from "./utils.ts"

import { logger } from "../../utils.js"
import strings from "../../config/strings.js"

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

export async function createPost() {
    const headerImg = fs.readFileSync('static/images/header.png');

        // TODO let ppl customize this
        const bskyPost =[
            `new post: ${page.title}`,
            new URL(page.url, 'https://' + data.site.url).href,
            page.title,
            page.description,
            new Blob([headerImg]),
        ]

        pagesToUpdate[filepath] = bskyPost
}