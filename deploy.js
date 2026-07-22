import { ipcMain, BrowserWindow, shell } from "electron"
import { NeocitiesAPIClient } from "async-neocities"
import NekowebAPI from "@indiefellas/nekoweb-api"
import SftpClient from "ssh2-sftp-client"
import * as path from "node:path"
import * as fs from "node:fs"
import * as yaml from "yaml"
import { zip } from "zip-a-folder"
import { setTimeout } from "timers/promises"

import {
    conf,
    logger,
    showHtmlPopup,
    showMessageBox,
    showNotification,
    showPrompt,
} from "./utils.js"
import strings from "./config/strings.js"
import projects from "./projects.js" // TODO just import active as activeProject?
import config from "./config/config.js"
import { arePostsQueued } from "./integrations/bluesky/main.js"
import { build, pauseWatcher, watch } from "./site-generator.js"

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

ipcMain.handle("openExternalUrl", async function (_event, url) {
    shell.openExternal(url)
})

ipcMain.handle("form", async function (_event, newDeployMeta) {
    switch (newDeployMeta.provider) {
        case "nekoweb":
            break
        case "neocities":
            const apiKeyResponse = await NeocitiesAPIClient.getKey({
                siteName: newDeployMeta.username,
                ownerPassword: newDeployMeta.password,
            })

            if (apiKeyResponse.result == "success") {
                logger.info(
                    strings.deployment.auth.success(newDeployMeta.provider),
                )

                newDeployMeta = {
                    provider: newDeployMeta.provider,
                    apiKey: apiKeyResponse.api_key,
                }
            } else {
                logger.info(
                    strings.deployment.auth.fail(newDeployMeta.provider),
                )
                showMessageBox(
                    strings.popups.deployFail(newDeployMeta.provider),
                    "error",
                )
                return
            }
            break
        case "sftp":
            deploy(newDeployMeta.password)
            return
        default:
            break
    }

    projects.writeSecrets({
        deployment: newDeployMeta,
    })

    // TODO oh god test this before shipping
    build() // .then?

    await setTimeout(1000) // HACK to get around build not finishing in time for deploy

    try {
        deploy()
    } catch (err) {
        logger.error(err)
    }
})

export async function deploy(sftpPassword = null, isPostDeploy = false) {
    if (isPostDeploy) {
        logger.info(strings.logMsg.postDeployStart)
    } else {
        logger.info(strings.logMsg.deployStart)
    }

    const ACTIVE_PROJECT_DATA = projects.active.getData()
    const DEPLOY_META = ACTIVE_PROJECT_DATA.deployment

    if (!DEPLOY_META) {
        showHtmlPopup(`popups/deployment/${DEPLOY_META.provider}.html`)
    } else if (DEPLOY_META.host && !sftpPassword && !DEPLOY_META.keyPath) {
        showHtmlPopup(`popups/deployment/sftp-password.html`)
    } else {
        let success = false

        if (sftpPassword || DEPLOY_META.keyPath) {
            // TODO dedupe
            await pauseWatcher()
            let startMsg = strings.deployment.start(DEPLOY_META.provider)
            logger.info(startMsg)
            showNotification(startMsg)

            success = await deployViaSftp(
                DEPLOY_META,
                projects.active.paths.ROOT,
                sftpPassword,
            )

            let resultMsg = success
                ? strings.deployment.finish.success(isPostDeploy)
                : strings.deployment.finish.fail
            logger.info(resultMsg)
            showNotification(resultMsg)
        } else {
            let clickedId = 0

            if (!isPostDeploy) {
                clickedId = showPrompt(
                    strings.popups.confirmDeployment.message(
                        ACTIVE_PROJECT_DATA.site.title,
                        DEPLOY_META.provider,
                    ),
                    "warning",
                )
            }

            if (clickedId == 0) {
                await pauseWatcher()
                let startMsg = strings.deployment.start(DEPLOY_META.provider)
                logger.info(startMsg)
                showNotification(startMsg)

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

                let resultMsg = success
                    ? strings.deployment.finish.success(isPostDeploy)
                    : strings.deployment.finish.fail
                logger.info(resultMsg)
                showNotification(resultMsg)
            } else {
                logger.info(strings.deployment.finish.cancel)
            }
        }

        if (success) {
            if (conf.get("settings.bskyAutoPost") && !isPostDeploy) {
                await postDeploy()
            }
        }

        watch()
    }
}

async function deployToNeocities(deployMeta) {
    try {
        const client = new NeocitiesAPIClient(deployMeta.apiKey)

        let result = await client.deploy({
            directory: projects.active.paths.OUTPUT,
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
    })

    let sitePath = projects.active.paths.OUTPUT
    let zipPath = path.join(projects.active.paths.ROOT, "upload.zip")

    await nekoweb.getSiteInfo(deployMeta.domain)
    await zip(sitePath, zipPath) // can we get as buffer?
    let bigfile = await nekoweb.createBigFile()
    let file = fs.readFileSync(zipPath)
    await bigfile.append(file)
    let response = await bigfile.import(path.join("/", deployMeta.domain))

    fs.rmSync(zipPath)

    // TODO atproto thing not uploading - need to do separately?
    // let atfile = fs.readFileSync(path.join(sitePath, '.well-known/atproto-did'))
    // await nekoweb.upload('/.well-known/atproto-did', atfile)

    return response == "Imported"
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
            path.join(projectRootPath, "_site"),
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
