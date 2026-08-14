import config from "./index.js"

const urls = {
    localPreview: `http://localhost:${config.VITE_PORT}`,
    itch: "https://iznaut.itch.io/bimbo",
    tutorial: "https://bimbo.nekoweb.org/posts/2-getting-started.html",
    discord: "https://discord.gg/hkAMG3Kru8",
    supportMailto: "mailto:bimbo@iznaut.com",
    githubPackage:
        "https://raw.githubusercontent.com/iznaut/bimbo/refs/heads/main/package.json",
    bugsplat: "https://me-iznaut-com.bugsplat.com/post/electron/v2/crash.php",
}

export default urls

export const trustedExternalURLs = [
    urls.localPreview,
    urls.itch,
    urls.tutorial,
    urls.discord,
    urls.supportMailto,
]
