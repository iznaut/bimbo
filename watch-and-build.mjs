#!/usr/bin/env node

import live from 'live-server'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { getPath } from 'global-modules-path'

execSync(`node ${path.join(getPath("bimbo"), "build.mjs")}`)

live.start({
    mount: [['/', './public']],
    watch: ['./content', './static', './templates', './data']
})

live.watcher.on('change', function (e) {
    console.log('building...')
    execSync(`node ${path.join(getPath("bimbo"), "build.mjs")}`)
})