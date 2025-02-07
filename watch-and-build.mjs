import live from 'live-server'
import { execSync } from 'node:child_process'

live.start({
    mount: [['/', './public']],
    watch: ['./content', './static', './templates', './data']
})

live.watcher.on('change', function (e) {
    console.log('building...')
    execSync(`node build.mjs`)
})