import { NeocitiesAPIClient } from "async-neocities"
import NekowebAPI from "@indiefellas/nekoweb-api"
import SftpClient from "ssh2-sftp-client"
import * as path from "node:path"
import * as fs from "node:fs"
import { zip } from "zip-a-folder"
import { setTimeout } from "timers/promises"

import strings from "./config/strings.js"
import config from "./config/index.js"
import { arePostsQueued } from "./bluesky/main.js"
import { build, pauseWatcher, watch } from "./site-generator.js"

import { activeProject } from "./index.js"

export const IS_PLUS_MODE = true

export const presets = {
    nekoweb: {
        apiKey: "",
        domain: "",
    },
    neocities: {
        apiKey: "",
    },
    other: {
        host: "",
        port: 22,
        siteRoot: "",
        username: "",
        keyPath: "",
    },
}

export async function deploy(sftpPassword = null, isPostDeploy = false) {
    if (isPostDeploy) {
        logger.info(strings.logMsg.postDeployStart)
    } else {
        logger.info(strings.logMsg.deployStart)
    }

    await pauseWatcher()

    const DEPLOY_META = activeProject.secrets.deployment

    let success = false
    let startMsg = strings.deployment.start(DEPLOY_META.provider)
    logger.info(startMsg)
    // TODO how to surface these to electron
    // showNotification(startMsg)

    if (sftpPassword || DEPLOY_META.keyPath) {
        success = await deployViaSftp(
            DEPLOY_META,
            activeProject.paths.ROOT,
            sftpPassword,
        )
    } else {
        switch (DEPLOY_META.provider) {
            case "nekoweb":
                success = await deployToNekoweb(DEPLOY_META)
                break
            case "neocities":
                success = await deployToNeocities(DEPLOY_META)
                break
            default:
                break
        }
    }

    let resultMsg = success
        ? strings.deployment.finish.success(isPostDeploy)
        : strings.deployment.finish.fail
    logger.info(resultMsg)
    // showNotification(resultMsg)

    // TODO should be set at project level (in secrets?)
    // if (success) {
    //     if (APP_SETTINGS.get("settings.bskyAutoPost") && !isPostDeploy) {
    //         await postDeploy()
    //     }
    // }

    watch()
}

export async function getNeocitiesApiKey(username, password) {
    const RESPONSE = await NeocitiesAPIClient.getKey({
        siteName: username,
        ownerPassword: password,
    })

    if (RESPONSE.result == "success") {
        logger.info(strings.deployment.auth.success("neocities"))

        return RESPONSE.api_key
    } else {
        logger.info(strings.deployment.auth.fail("neocities"))

        return null
    }
}

async function deployToNeocities(deployMeta) {
    try {
        const client = new NeocitiesAPIClient(deployMeta.apiKey)

        let result = await client.deploy({
            directory: activeProject.paths.OUTPUT,
            cleanup: true, // Delete orphaned files
            includeUnsupportedFiles: false, // TODO - atproto-did unsupported, paid feature
        })

        return result.results[0].body.result == "success"
    } catch (err) {
        logger.error(err)
        return false
    }
}

async function deployToNekoweb(deployMeta) {
    let nekoweb = new NekowebAPI({
        apiKey: deployMeta.apiKey,
        logging: (logType, logMessage) => logger.info(logMessage), // TODO use logType? https://github.com/indiefellas/nekoweb-api/blob/main/src/types.ts
    })

    let sitePath = activeProject.paths.OUTPUT
    let zipPath = path.join(activeProject.paths.ROOT, "upload.zip")

    try {
        await nekoweb.getSiteInfo(deployMeta.domain)
    } catch {
        logger.error("failed to get site info - check API key is valid") // TODO move string
    }
    try {
        await zip(sitePath, zipPath) // TODO can we get as buffer?
        let bigfile = await nekoweb.createBigFile()
        let file = fs.readFileSync(zipPath)
        await bigfile.append(file)
        let response = await bigfile.import(path.join("/", deployMeta.domain))

        fs.rmSync(zipPath)

        // TODO atproto thing not uploading - need to do separately?
        // let atfile = fs.readFileSync(path.join(sitePath, '.well-known/atproto-did'))
        // await nekoweb.upload('/.well-known/atproto-did', atfile)

        return response == "Imported"
    } catch (err) {
        logger.error(err)
    }
    // try {
    // }
    // catch(err) {
    // 	logger.error(err) // TODO returns undefined
    // 	return false
    // }
}

async function deployViaSftp(deployMeta, projectRootPath, password = null) {
    let result = false

    const client = new SftpClient()
    try {
        const connectConfig = {
            host: deployMeta.host,
            username: deployMeta.username,
        }
        if (deployMeta.port) connectConfig.port = deployMeta.port
        if (password) connectConfig.password = password
        if (deployMeta.keyPath)
            connectConfig.privateKey = fs.readFileSync(
                deployMeta.keyPath,
                "utf-8",
            )
        await client.connect(connectConfig)
        await client.rmdir(deployMeta.siteRoot, true).catch(() => {}) // Fail silently if dir doesn't exist
        result = await client.uploadDir(
            path.join(projectRootPath, "_site"), // TODO use output path
            deployMeta.siteRoot,
        )
    } catch (err) {
        logger.error(err.message)
    }
    client.end()

    logger.info(result)
    return result
}

async function postDeploy() {
    if (arePostsQueued()) {
        logger.info(strings.deployment.queuedPosts)
        await build(true)
        await deploy(null, true)
    }
}
