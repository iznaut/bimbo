---
title: getting started
date: 2025-02-02
draft: false
---

Bimbo works using a program called Node.js, which allows you to run Javascript code on your local computer (as opposed to on a browser). this means the install process is a little more involved than i would like, but i hope to simplify it in the future

## installing Node.js

you can [get the latest version of Node.js from the official website](https://nodejs.org/en/download)

i've tested Bimbo with v23.7.0 so i recommend using that one.

## installing Bimbo

once you've installed Node, you'll need to open a Terminal/Command Line window. copy/paste this command to install Bimbo from the Node Package Manager:

`npm install bimbo -g`[^1]

## making your first website

a few more commands and you'll get to see something working! let's make new folder for our project:

`mkdir my-cool-website`

and move into it:

`cd my-cool-website`

now we're ready to initialize your first Bimbo website. last one:

`npx bimbo`

if everything is working properly, you should see "Ready for changes" appear as the last line in your terminal window, and your cool website should open in your browser! as long as this terminal window is open, Bimbo will watch for changes in your project and automatically refresh your website to reflect them.

[^1]: the `-g` flag installs a package "globally", meaning you can use it anywhere. this allows you to make multiple Bimbo projects without having to reinstall each time.