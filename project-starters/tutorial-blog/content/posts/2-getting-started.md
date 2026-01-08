---
title: getting started
date: 2026-01-02
draft: false
---

you can download bimbo from itch.io. i've personally tested the Mac[^1] one quite a lot, but the Windows one should work fine. after extracting the zip file and running the bimbo executable (.app or .exe), you should find a sparkling heart emoji icon in your system task/status bar.

![bimbo tray icon on Mac](/images/tray_mac.png)
![bimbo tray icon on Windows](/images/tray_win.png)

you can open the bimbo menu by left (on Mac)/right (on Windows) clicking this icon, which should look something like this if it's your first time:

![bimbo tray icon on Windows](/images/create_project_menu.png)

select `create new project > minimal` and select a folder to create the `minimal` project in. bimbo will automatically load the new project, which you'll see when opening the menu again:

![bimbo tray icon on Windows](/images/preview_menu.png)

select `preview in browser` and watch in amazement as a real live[^2] webpage appears in your default web browser

[^1]: specifically, the Apple Silicon version, which you can use if you have a newer device using their M-series of processors. if you're not sure, you can try using the Intel one
[^2]: but not like _live_ live - `localhost` refers to the device you're running bimbo on and `6969` (nice, nice) is the network port it's available on. this address will only work while bimbo is running and is only for _previewing_ your site. we'll talk about deploying to the greater internet later