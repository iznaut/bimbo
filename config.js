let config = {}

config.BASE_NAME = 'bimbo'
config.CONFIG_FILENAME = config.BASE_NAME + '.yaml'
config.SECRETS_FILENAME = config.BASE_NAME + '-secrets.yaml'

config.EXTRA_INIT_FILES = [
    {
        filePath: '.gitignore',
        text: '_site\nbimbo-secret.yaml'
    },
    {
        filePath: '.vscode/settings.json',
        json: {
            "files.exclude": {
                "_site/**": true
            }
        }
    },
]

export default config