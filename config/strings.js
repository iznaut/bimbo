import config from "./config.js"
import { IS_PLUS_MODE } from "../deploy.js"

export default {
    app: {
        title: config.APP_NAME,
        titleWithVersion: (version) =>
            `${config.APP_NAME}${IS_PLUS_MODE ? "+" : ""} ssg v${version}`,
        configClear: `${config.APP_NAME} config has been reset to defaults`,
    },
    projects: {
        notLoaded: "no project loaded",
        loaded: (title) => `loaded project: ${title}`,
        alreadyImported: (path) => `project already imported: ${path}`,
        loadFailed: (path) => `failed to load project: ${path}`,
    },
    menu: {
        projects: {
            create: `🆕 create new project`,
            import: `🆒 import existing project`,
        },
        updateAvailable: "🚨 NEW UPDATE AVAILABLE!!!",
        openPreview: `🔗 preview in browser`,
        openEditor: `👩‍💻 edit in VSCodium`,
        openFolder: `📂 open project folder`,
        configDeployment: "set up deployment",
        deploy: (provider) => `🌐 deploy to ${provider}`,
        upgrade: `👀 get ${config.APP_NAME}+ for one-click deploy!`,
        settings: {
            title: "settings",
            showProjectTitleInMenubar: "show active project title in menubar",
            autoOpenPreview: "open site preview on app/project load",
            submitCrashLogs: "submit crash reports/logs to bimbo central",
        },
        support: {
            title: "support",
            checkForUpdates: "👀 check for updates",
            openDiscord: `🤖 join bimbo Discord`,
            sendEmail: `💌 email izzy (she made this)`,
        },
        debug: {
            title: "🔧 debug",
            openUserData: "open user data folder",
            deleteSecrets: `delete ${config.SECRETS_FILENAME}`,
            clearConfig: "clear projects and config",
        },
        exit: "quit",
    },
    logMsg: {
        ready: "app ready!",
        logPath: (path) => `writing log to ${path}`,
        configClearTry: "attempting config clear",
        configClearSuccess: "config cleared",
        updateAvailable: "newer version available",
        tryEditor: (editor) => `user requested editor ${editor}`,
        missingProject: (path) =>
            `unable to find project, removing from list: ${path}`,
        writeDeployMeta: (secretsPath) =>
            `writing deploy meta to ${secretsPath}`,
    },
    update: {
        none: "no updates available",
        available: (latestVersion) =>
            `version ${latestVersion} available on itch.io`,
        checkFailed: "update check failed",
        logError: (e) => `Error getting latest version: ${e}`,
    },
    popups: {
        configDeploymentTitle: `set up deployment - ${config.APP_NAME}`,
        codiumError:
            "VSCodium was not found - if it's installed, please open it and go to View > Command Palette... > Shell Command: Install 'codium' command in PATH",
        createProject: {
            title: `create new ${config.APP_NAME} project`,
            confirm: "let's go",
            cancel: "nevermind",
            label: "title:",
        },
        disableCrashReporting: {
            title: "disable crash reporting",
            message:
                `hi! jsyk ${config.APP_NAME} only sends data relevant to crashes and the contents of your ${config.APP_NAME}.log file.` +
                `it's super helpful for improving ${config.APP_NAME} and doesn't contain anything sensitive or identifying.` +
                `you're welcome to disable it, but i'd really appreciate it if you kept it on. thanks!`,
            confirm: "nah disable please",
            cancel: "oh alright leave it on",
        },
        upgrade: `get ${config.APP_NAME}+ to enable one-click deployment options!`,
        deployFail: (provider) =>
            `unable to authenticate with ${provider}, please check your credentials and try again`,
        genericError: "something went wrong",
        confirmDeployment: {
            message: (title, provider) =>
                `are you sure you want to deploy ${title} to ${provider}?`,
            confirm: "yeah!!",
            cancel: "not yet...",
        },
    },
    deployment: {
        auth: {
            success: (provider) => `${provider} auth successful`,
            fail: (provider) => `${provider} auth failed`,
        },
        start: (provider) => `starting deployment to ${provider} via SFTP`,
        finish: {
            success: "deployment completed successfully",
            fail: "deployment failed",
        },
        cancel: "deployment canceled",
    },
    generator: {
        bsky: {
            noId: "no Bluesky User ID set, skipping integrations...",
            postSuccess: "Successfully posted to Bluesky!",
        },
        buildComplete: "site build completed 💅",
        missingTemplate: "couldn't find template, using default",
        compileFail: (template) => `failed to compile ${template}`,
        rssFail: "failed to add RSS post...",
        monitoring: (path) => `monitoring ${path} for changes`,
        skipDraft: (path) => `skipping ${path} (draft)`,
    },
}
