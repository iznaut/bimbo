---
title: folders & files
date: 2025-02-03
draft: false
---

now that you've successfully initialized a new Bimbo project and learned how to preview it, we can start talking about the editing process.

if you look inside the folder we created in the last post, you'll see that there are now some subfolders and files that Bimbo created:

# content

`/content` is where most ppl will spend the bulk of their time. anything you write in here will appear on your website for all the world to see

Bimbo expects to find `.md` (Markdown) files in this folder, which will be converted into `.html` files on build.

# templates

`/templates` is the next layer up in a sense - since you can't do very advanced formatting with Markdown, you'll likely want a bit of raw HTML in the mix.

any `.html` files in this folder can be used as a base, with your content and other unique data being piped in at build time - no need to copy/paste stuff!

`/templates/partials` contains `.hbs` (Handlebars) files - we'll go into more detail about these later, but they're basically smaller templates that can be nested within the larger ones.

a simple example is the navigation bar at the top of this page - we want it everywhere, so it's included as a "partial" on each page template.

# static

`/static` is where you keep things that you want copied over 1:1 when the site is built.

a good example of this might be some image files or CSS/JavaScript that doesn't require any processing through Bimbo

# public

finally, `/public` is where Bimbo will output everything. this is the fully generated site that will be uploaded to your webhost!

you could totally do any editing of these files in Notepad or something simple like that, but i recommend downloading [Visual Studio Code](https://code.visualstudio.com/) for a nicer experience. just open the whole folder in VS Code and you'll be able to navigate between files quickly[^1]

[^1]: i make frequent use of the "Find in Files" shortcut (Cmd/Ctrl+Shift+F), which can be super helpful when you're trying to understand how everything fits together