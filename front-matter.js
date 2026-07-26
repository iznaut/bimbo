import _ from "lodash"

class FrontMatterKey {
    name
    description
    default
    validate
    special

    constructor(
        name,
        description,
        defaultValue,
        validateCallback,
        specialCallback,
    ) {
        this.name = name
        this.description = description
        this.default = defaultValue
        this.validate = validateCallback
        this.special = specialCallback
    }
}

export const PROJECT_CONFIG_OPTIONS = {
    GLOBALS: {
        name: "globals",
        description:
            "key/value pairs added here will be available from any TemplateFile (e.g. `{{globals.title}})`",
    },
    DEFAULTS: {
        name: "defaults",
        description:
            "key/value pairs added here will be used as fallback values when a more specific value is not available",
        nestedOptions: [
            {
                SUBFOLDERS: {
                    name: "subfolders",
                    description: "",
                },
            },
        ],
    },
    COLLECTIONS: {
        name: "collections",
        description:
            "sort/filter/group pages into collections that can be easily referenced",
    },
    VALIDATORS: {
        name: "validators",
        description:
            "add rules for specific key/value pairs to generate warnings when they're entered incorrectly",
    },
}

export const FRONT_MATTER_KEYS = {
    template: [
        "the TemplateFile (ending in .hbs) that this ContentFile should use to generate a SitePage (.html)",
        "default.hbs",
        (v) => path.extname(v) == ".hbs", // TODO check if file exists? is valid with Handlebars?
        null,
    ],
    draft: [
        "if true, this ContentFile will be ignored when the site is generated (no SitePage will be created)",
        false,
        (v) => typeof v === Boolean,
    ],
    url: ["", null, (v) => !!new URL(value)], // TODO
    date: [
        "date values can be optionally validated - for example, if you set `format: YYYY-MM-DD`",
    ],
    redirect: [
        "if set, attempting to visit this SitePage will redirect to a different SitePage",
        null,
        null, // TODO validate redirect target - also can this redirect externally?
    ],
    bskyPostId: [],
}

// TODO warnings for any front matter prefixed with underscores (reserved)

export const FRONT_MATTER_PROCESSORS = _.mapValues(
    FRONT_MATTER_KEYS,
    (v) => new FrontMatterKey(...v),
)
