---
title: the basics
date: 2026-01-03
draft: false
---

now that you've successfully initialized a new bimbo project and learned how to preview it, we can start talking about the editing process. i've tried to make bimbo's project structure as straight-forward as possible (something that most SSGs just can't seem to accomplish for some reason)[^1] but i'm always [open to feedback](mailto:bimbo@iznaut.com) on how i can do better

if you open the bimbo menu and select `open project folder`, you'll find the following folders:

# content

`/content` is where most ppl will spend the bulk of their time. anything you write in here will appear on your website for all the world to see

bimbo expects to find `.md` (Markdown) files in this folder, which will be converted into `.html` files on build.

# templates

`/templates` is the next layer up in a sense - since you can't do very advanced formatting with Markdown, you'll likely want a bit of raw HTML in the mix.

any `.html` files in this folder can be used as a base, with your content and other unique data being piped in at build time - no need to copy/paste stuff!

`/templates/partials` contains `.hbs` (Handlebars) files - we'll go into more detail about these later, but they're basically smaller templates that can be nested within the larger ones.

a simple example is the navigation bar at the top of this page - we want it everywhere, so it's included as a "partial" on each page template.

# static

`/static` is where you keep things that you want copied over 1:1 when the site is built.

a good example of this might be some image files or CSS/JavaScript that doesn't require any processing through bimbo

# _site

finally, `/_site` is where bimbo will output everything. this is the fully generated site that will be uploaded to your webhost!

you could totally do any editing of these files in Notepad or something simple like that, but i recommend downloading [VS Codium](https://vscodium.com)[^2] for a nicer experience. if installed, you can select the `edit in VS Codium` menu option to quickly open your project folder in the editor

[^1]: when in doubt, make frequent use of the "Find in Files" shortcut (Cmd/Ctrl+Shift+F), which can be super helpful when you're trying to understand how everything fits together
[^2]: VS Codium is an alternative version of Microsoft's Visual Studio Code that disables telemetry/tracking. They aren't functionally much different (though some extensions are not available in the "open" marketplace), but VS Codium feels like the [more moral option](https://bdsmovement.net/microsoft) imo.