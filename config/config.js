import { nativeImage } from "electron"

let config = {}

config.APP_NAME = "bimbo"
config.CONFIG_FILENAME = config.APP_NAME + ".yaml"
config.SECRETS_FILENAME = config.APP_NAME + "-secrets.yaml"
config.DEFAULTS_FILENAME = "~default.yaml"
config.ICON = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==",
)
config.VITE_PORT = 6969

config.EXTRA_INIT_FILES = [
    {
        filePath: ".gitignore",
        text: `_site\n${config.SECRETS_FILENAME}`,
    },
    {
        filePath: ".vscode/settings.json",
        json: {
            "files.exclude": {
                "_site/**": true,
            },
        },
    },
]

export default config
