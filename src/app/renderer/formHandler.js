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
