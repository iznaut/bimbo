// Listen for list of starters sent from main process
window.electron.onStartersList((starters) => {
    console.log("received starters", starters)
    const startersSelect = document.getElementById("starter")
    starters.forEach((starter) => {
        const option = document.createElement("option")
        option.value = starter
        option.text = starter
        startersSelect.add(option)
    })
})

const projectRootInput = document.getElementById("projectRoot")
const browseRootButton = document.getElementById("browseRoot")
const projectPathHint = document.getElementById("projectPathHint")

browseRootButton.addEventListener("click", async (event) => {
    event.preventDefault()
    const projectRoot = await window.electron.pickDirectory()
    const projectTitle = document.getElementById("title").value
    projectRootInput.value = projectRoot
    const slash = projectRoot.includes("/") ? "/" : "\\"
    const projectPath = projectRoot + slash + projectTitle
    projectPathHint.innerHTML = `your project will be created at <code class="has-text-info">${projectPath}</code>`
})
