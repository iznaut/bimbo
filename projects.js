import * as fs from 'node:fs'
import * as path from 'node:path'
import _ from 'lodash'
import { Notification } from 'electron'
import * as yaml from 'yaml'

import { conf, logger } from './utils.js'
import config from './config.js'
import { watch } from './site-generator.js'

export default {
    getAll(pathsOnly = false) {
        // remove invalid paths
        const projectPaths = conf.get('projects').filter((rootPath) => {
            return this.exists(rootPath)
        })
        
        let projects = projectPaths.map((projRootPath) => {
            const secretsPath = path.join(projRootPath, config.SECRETS_FILENAME)
    
            const projSecrets = fs.existsSync(secretsPath) ? yaml.parse(
                fs.readFileSync(secretsPath, "utf-8")
            ) : {}
            let projData = yaml.parse(
                fs.readFileSync(path.join(projRootPath, config.CONFIG_FILENAME), "utf-8")
            )
    
            return {
                rootPath: projRootPath,
                data: _.merge(projData, projSecrets)
            }
        })

        // if no valid projects
        if (projects.length == 0) {
            conf.set('activeIndex', -1)
        }

        return pathsOnly ? projects.map(proj => proj.rootPath) : projects
    },
    getActive() {
        if (conf.get('activeIndex') == -1) {
            return null
        }

        return this.getAll()[conf.get('activeIndex')]
    },
    setActive(index = null) {
        if (index == null) {
            index = conf.get('activeIndex')
        }
        else {
            conf.set('activeIndex', index)
        }

        watch()

        new Notification({
            title: config.BASE_NAME,
            body: index == -1 ? 'no project loaded!' : `loaded project: ${this.getActive().data.site.title}`
        }).show()
    },
    add(newProjRootPath) {
        let current = this.getAll(true)

        if (current.includes(newProjRootPath)) {
            new Notification({
                title: config.BASE_NAME,
                body: 'project already imported: ' + newProjRootPath
            }).show()

            return
        }

        current.push(newProjRootPath)
        conf.set('projects', current)
    },
    exists(projRootPath) {
        const fileExists = fs.existsSync(
            path.join(projRootPath, config.CONFIG_FILENAME)
        )

        if (!fileExists) {
            logger.warn('unable to find project, removing from list: ' + projRootPath)

            new Notification({
                title: config.BASE_NAME,
                body: `failed to load project: ${projRootPath}`
            }).show()
        }

        return fileExists
    }
}