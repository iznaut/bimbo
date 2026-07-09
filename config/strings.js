import config from './config.js'
import { IS_PLUS_MODE } from '../deploy.js'

export default {
    app: {
        title: config.APP_NAME,
        titleWithVersion: (version) => `${config.APP_NAME}${IS_PLUS_MODE ? '+' : ''} ssg v${version}`,
        configClear: `${config.APP_NAME} config has been reset to defaults`,
        noProject: 'no project loaded',
        disablePopupTitle: 'disable crash reporting',
        crashLogsDisable: `hi! jsyk ${config.APP_NAME} only sends data relevant to crashes and the contents of your ${config.APP_NAME}.log file.` +
            `it's super helpful for improving ${config.APP_NAME} and doesn't contain anything sensitive or identifying.` +
            `you're welcome to disable it, but i'd really appreciate it if you kept it on. thanks!`,
        confirmDisable: 'nah disable please',
        cancelDisable: 'oh alright leave it on',
    },
    menu: {
        projects: {
            create: `🆕 create new project`,
            import: `🆒 import existing project`,
        },
        updateAvailable: '🚨 NEW UPDATE AVAILABLE!!!',
        openPreview: `🔗 preview in browser`,
        openEditor: `👩‍💻 edit in VSCodium`,
        openFolder: `📂 open project folder`,
        configDeployment: 'set up deployment',
        deploy: (provider) => `🌐 deploy to ${provider}`,
        upgrade: `👀 get ${config.APP_NAME}+ for one-click deploy!`,
        settings: {
            title: 'settings',
            showProjectTitleInMenubar: 'show active project title in menubar',
            autoOpenPreview: 'open site preview on app/project load',
            submitCrashLogs: 'submit crash reports/logs to bimbo central',
        },
        support: {
            title: 'support',
            checkForUpdates: '👀 check for updates',
            openDiscord: `🤖 join bimbo Discord`,
            sendEmail: `💌 email izzy (she made this)`,
        },
        debug: {
            title: '🔧 debug',
            openUserData: 'open user data folder',
            deleteSecrets: `delete ${config.SECRETS_FILENAME}`,
        },
        exit: 'quit',
    },
    logMsg: {
        ready: 'app ready!',
        configClearTry: 'attempting config clear',
        configClearSuccess: 'config cleared',
        updateAvailable: 'newer version available',
        tryEditor: (editor) => `user requested editor ${editor}`
    },
    update: {
        none: 'no updates available',
        available: (latestVersion) => `version ${latestVersion} available on itch.io`,
        checkFailed: 'update check failed',
        logError: (e) => `Error getting latest version: ${e}`,
    },
    popups: {
        configDeploymentTitle: `set up deployment - ${config.APP_NAME}`,
        codiumError: "VSCodium was not found - if it's installed, please open it and go to View > Command Palette... > Shell Command: Install 'codium' command in PATH",
        createProject: {
            title: `create new ${config.APP_NAME} project`,
            confirm: 'let\'s go',
            cancel: 'nevermind',
            label: 'title:',
        },
        disableCrashReporting: {
            title: 'disable crash reporting',
            message: `hi! jsyk ${config.APP_NAME} only sends data relevant to crashes and the contents of your ${config.APP_NAME}.log file.` +
                `it's super helpful for improving ${config.APP_NAME} and doesn't contain anything sensitive or identifying.` +
                `you're welcome to disable it, but i'd really appreciate it if you kept it on. thanks!`,
            confirm: 'nah disable please',
            cancel: 'oh alright leave it on',
        }
    }
} 