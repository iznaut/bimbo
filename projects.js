import * as fs from 'node:fs'
import * as path from 'node:path'
import _ from 'lodash'
import { Notification } from 'electron'
import * as yaml from 'yaml'

import { conf } from './utils.js'
import config from './config.js'
import { watch } from './site-generator.js'

export default {
    getAll(pathsOnly = false) {
        let projects = conf.get('projects').map((projRootPath) => {
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

        // remove invalid paths
        projects.filter((proj) => {
            return this.exists(proj.rootPath)
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

        if (index != -1) {
            watch()
        }

        new Notification({
            title: 'bimbo',
            body: index == -1 ? 'no project loaded!' : `loaded project: ${this.getActive().data.site.title}`
        }).show()
    },
    add(configFilepath) {
        let current = this.getAll(true)
        current.push(configFilepath)
        conf.set('projects', current)
    },
    exists(projRootPath) {
        const configFilepath = path.join(projRootPath, config.CONFIG_FILENAME)

        return fs.existsSync(configFilepath)
    }
}