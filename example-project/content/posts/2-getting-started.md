---
title: getting started
date: 2025-02-02
draft: false
---

Bimbo has apps for Windows, Mac, and Linux, though i've only personally tested the Mac[^1] one!

you can [download it here](https://github.com/iznaut/bimbo/releases/latest), along with the `example.zip`, which contains the source files used to make the blog you're reading right now!

make sure you have both the app file and the zip in the same (preferably empty) folder[^2] on your computer. now all you need to do is run the app!

if everything is working properly, you should see a terminal window pop up. it'll do some initial setup the first time (in this case, unpacking the zip file) and then display "Ready for changes" just before opening your browser with a local version of the website! now you can make changes and see them reflected right away[^3]

[^1]: specifically, the Apple Silicon version, which you can use if you have a newer device using their M-series of processors. if you're not sure, you can try using the Intel one
[^2]: alternatively, you can tell Bimbo to look at a different folder by supplying a `--path` argument, but you don't really need to worry about that unless you want to make multiple websites
[^3]: this _should_ be instantaneous, to the point the page will reload automatically when it detects changes, but this feature is currently broken for some reason i have yet to understand. you'll have to refresh manually for now, sorry about that