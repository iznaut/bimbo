import { expect, test } from "vitest"
import { isPlatformMac } from "./src/utils.js"

test("is platform mac", () => {
    expect(isPlatformMac()).toBe(true)
})
