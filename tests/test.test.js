import { expect, test } from "vitest"
import { isPlatformMac } from "../utils.js"

test("adds 1 + 2 to equal 3", () => {
    expect(isPlatformMac()).toBe(true)
})
