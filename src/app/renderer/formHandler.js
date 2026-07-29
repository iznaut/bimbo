function sendForm(event) {
    event.preventDefault() // stop the form from submitting

    const ALL_INPUTS = Array.from(document.querySelectorAll(".input"))

    if (ALL_INPUTS.every((input) => input.value !== "")) {
        let formData = Object.fromEntries(
            ALL_INPUTS.map((input) => [input.id, input.value]),
        )

        window.electron.formSubmission(formData)
    }
    window.close()
}

document.body.addEventListener("click", (event) => {
    if (
        event.target.tagName.toLowerCase() === "a" &&
        event.target.protocol != "file:"
    ) {
        event.preventDefault()
        window.electron.openExternalUrl(event.target.href)
    }
})
