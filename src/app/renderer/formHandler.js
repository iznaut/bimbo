function sendForm(event) {
    event.preventDefault() // stop the form from submitting

    const formInputs = Array.from(document.querySelectorAll(".input"))

    // if (formInputs.every((input) => input.value !== "")) {
    let formData = Object.fromEntries(
        formInputs.map((input) => [input.id, input.value]),
    )

    window.electron.formSubmission(formData)
    // }
    window.close()
}

// Listen for list of starters sent from main process
window.electron.onStartersList((starters) => {
    const startersSelect = document.getElementById("starter")
    if (!startersSelect) {
        return
    }
    starters.forEach((starter) => {
        const option = document.createElement("option")
        option.value = starter
        option.text = starter
        startersSelect.add(option)
    })
})
