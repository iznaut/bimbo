import { readPackage } from "read-pkg"

const { name: PACKAGE_NAME, version: PACKAGE_VERSION } = await readPackage()

let exports = {
    APP_NAME: PACKAGE_NAME,
    CONFIG_EXTENSION: ".yaml",
    CONTENT_EXTENSION: ".md",
    PAGE_EXTENSION: ".html",
    PAGE_GROUP_PREFIX: "$",
    GENERATED_PREFIX: "_",
    LOG_FILENAME: PACKAGE_NAME + ".log",
    // TODO move ICON into package? actual file?
    ICON: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJElEQVR4AayRsWrCUBSGT24plCyVPkJL6dZ2cVfIWrv2bUzWPolrOwfi7qJOiujsqIsIwej9LrmXaEwQ9MKfnPOfcz5ObpRceW4LmH0GrcVHkMzfgxDZ5ap86m4DBp6+/OSx47d0oYvwkMok2e/lyJf8OEDj2+8+vN1Lo+OLjvOyGJBNCm98kyqerLj628h2msrqX78nKXatmKHBAAiQgehhQOSXyABeh3HfNl86bGcMgGHPEweRilO4m8i2OMDzKG7XQRi2F/wyjsMSAGPniSOTW9m/Qw4kG/wkxMhtQJJ/VwnCvSx/17SgSDV7bQJ0BMBgvUyJa8Dj0zazFC+6a/bc+tRKAEw20SBPx2wTcT94p8O6LmcBFJCGhIi4SrWAqqGifwAAAP//2exw9QAAAAZJREFUAwBmLW4hL61AdQAAAABJRU5ErkJggg==",
    VITE_PORT: 6969,
    USER_CONFIG_DEFAULTS: {
        defaults: {
            projects: [],
            activeIndex: -1,
            editor: "codium",
            settings: {
                showProjectTitleInMenubar: true,
                autoOpenPreview: false,
                submitCrashLogs: true,
                bskyAutoPost: true,
            },
        },
    },
    PROJECT_STARTERS_PATH: "project-starters",
}

exports.PROJECT_PATHS = {
    ROOT: ".",
    CONFIG_FILE: "project" + exports.CONFIG_EXTENSION,
    SECRETS_FILE: "secrets" + exports.CONFIG_EXTENSION,
    CONTENT: "content",
    SNIPPETS: "content/snippets",
    DATA: "data",
    TEMPLATES: "templates",
    PARTIALS: "templates/partials",
    STATIC: "static",
    OUTPUT: "_site",
}

exports.EXTRA_INIT_FILES = [
    // TODO check this stuff works
    {
        filePath: ".gitignore",
        text: `${exports.PROJECT_PATHS.OUTPUT}\n${exports.PROJECT_PATHS.SECRETS_FILE}`,
    },
    {
        filePath: ".vscode/settings.json",
        json: {
            "files.exclude": {
                [`${exports.PROJECT_PATHS.OUTPUT}/**`]: true,
            },
            "files.autoSave": "afterDelay",
        },
    },
]

export default exports
