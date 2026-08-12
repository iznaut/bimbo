function sendForm(event) {
    event.preventDefault() // stop the form from submitting

    const formInputs = Array.from(document.querySelectorAll(".input"))
    const requiredInputs = formInputs.filter((input) => input.required)
    // don't submit form if any required inputs are blank
    if (requiredInputs.some((input) => input.value === "")) {
        return
    }

    const formData = Object.fromEntries(
        formInputs.map((input) => [input.id, input.value]),
    )

    window.electron.formSubmission(formData)
    window.close()
}
