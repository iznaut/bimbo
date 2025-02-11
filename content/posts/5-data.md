---
title: data & config
date: 2025-02-05
draft: false
---

in addition to injecting your content into the relevant templates, Bimbo also checks a handful of locations for metadata values. this metadata is compiled into a single "dictionary" object that can be referenced during the build process, allowing matching "keys" in your templates to be dynamically replaced with data you've supplied.

let's look at some of the options you have for defining data:

# bimbo.yaml

`bimbo.yaml` acts as a "global" configuration file that all pages have access to. for example, you may notice the footer on this page includes the title of this blog and my name. if i wanted to include the title elsewhere, i could use this placeholder in a `.html` or `.hbs` file:

`{{site.title}}`

this placeholder matches a key in `bimbo.yaml`:

```
site:
  title: Bimbo Blog
```

so `{{site.title}}` will be replaced with "Bimbo Blog" when the site is rebuilt.

# content "front matter"

you can also include key/value pairs directly inside your content `.md` files - using this post as example:

```
---
title: data & config
date: 2025-02-05
draft: false
---
```

this is called "front matter"

as you might guess, the `title` and `date` values are pulled into the `post.html` template used to generate this page.

the `draft` value is a bit special - if Bimbo sees tha this value is `true`, it will skip it during the build process.

# defaults and overrides

if you'd like to apply some default metadata to your content files, you can do so globally by setting the `contentDefaults` in `bimbo.yaml`.

if you'd like to only apply defaults to a subset of your content, you can create a `~default.yaml` file in a folder, which will affect only `.md` files in that directory.

Bimbo will ultimately use whatever values are most specific (global > local to folder > front matter) when generating a page.