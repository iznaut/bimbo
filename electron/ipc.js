import { ipcMain } from "electron"
import { resolveHandle } from "../integrations/bluesky/main.js"
import { deploy } from "../deploy.js"
import { showMessageBox } from "./main.js"

ipcMain.handle("openExternalUrl", async function (_event, url) {
    openExternalUrl(url)
})

// TODO separate actual logic back out to deploy.js
ipcMain.handle("form", async function (_event, formData) {
    let newSecrets = {}

    switch (formData.id) {
        case "nekoweb":
            break
        case "neocities":
            const apiKeyResponse = await NeocitiesAPIClient.getKey({
                siteName: formData.username,
                ownerPassword: formData.password,
            })

            if (apiKeyResponse.result == "success") {
                logger.info(strings.deployment.auth.success(formData.id))

                newSecrets = {
                    deployment: {
                        provider: formData.id,
                        apiKey: apiKeyResponse.api_key,
                    },
                }
            } else {
                logger.info(strings.deployment.auth.fail(formData.id))
                showMessageBox(strings.popups.deployFail(formData.id), "error")
                return
            }
            break
        case "sftp":
            deploy(formData.password)
            return
        case "bluesky":
            newSecrets = {
                integrations: {
                    bluesky: {
                        handle: formData.handle, // TODO do we need this? will it break if changed?
                        userId: await resolveHandle(formData.handle),
                        appPassword: formData.appPassword,
                    },
                },
            }
        default:
            break
    }

    projects.active.updateSecrets(newSecrets)

    // TODO oh god test this before shipping
    await build() // .then?

    // await setTimeout(1000) // HACK to get around build not finishing in time for deploy

    try {
        deploy()
    } catch (err) {
        logger.error(err)
    }
})
