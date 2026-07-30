import { expect, test } from "vitest"
import { Project, activeProject, setActiveProject } from "../src/index.js"
import config from "../src/config/index.js"
import { join as pathJoin } from "node:path"
import { app } from "electron"

test("can set active project", () => {
    expect(activeProject).toBe(null)

    const NEW_PROJECT = new Project(
        pathJoin("resources", config.PROJECT_STARTERS_PATH, "blog"),
    )

    expect(NEW_PROJECT instanceof Project).toBe(true)

    setActiveProject(NEW_PROJECT)

    expect(activeProject.title).toBeTypeOf("string")
})

test("can create app log", () => {
    logger.info("test")
})
